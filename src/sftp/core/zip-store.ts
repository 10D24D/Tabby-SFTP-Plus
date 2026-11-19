/**
 * 功能描述：多选拖出到系统时，把多个文件流式打包成一个 ZIP（store 模式，零第三方依赖）。
 *
 * 背景：Chromium 的 DownloadURL 拖拽数据在 `DropData` 里只有一个 `download_metadata`
 *   （`std::optional<DownloadMetadata>`，见 web_contents_view_aura.cc::PrepareDragForDownload），
 *   一次拖拽**协议上只能落一个文件** ⇒ 多选时把 N 个文件装进一个 ZIP 交给同一条已验证通道，
 *   落手位置不变、内容不丢。不引第三方 zip 库：store（不压缩）+ UTF-8 文件名，
 *   Windows 资源管理器 / 7-Zip / unzip 都能直接解开。
 *
 * 延迟渲染：members 允许传工厂函数；`Readable.from(async generator)` 是惰性的，
 *   HTTP 200 头会立刻发出，远程文件的下载发生在第一次 `_read()`，不会让下载管理器干等超时。
 *
 * ⚠ 限制：store 模式不压缩；总大小/单文件大小按 ZIP32 上限（4 GiB）校验，
 *   超限时由调用方在登记前拦下，避免写出半截损坏的归档。
 *
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 */
import * as fsSync from 'fs'
import { Readable } from 'stream'

/** ZIP 成员：`name` 是归档内文件名（UTF-8），`filePath` 是本机真实路径 */
export interface ZipStoreMember {
  name: string
  filePath: string
}

export type ZipMemberSource = ZipStoreMember[] | (() => Promise<ZipStoreMember[]>)

const ZIP32_MAX_BYTES = 0xffffffff
const LOCAL_HEADER_SIG = 0x04034b50
const CENTRAL_HEADER_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
/** general purpose bit 11：文件名用 UTF-8 编码 */
const FLAG_UTF8 = 0x0800
/** DOS 日期 1980-01-01（ZIP 纪元），时间 00:00:00 */
const DOS_DATE = 0x0021
const DOS_TIME = 0

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[i] = c >>> 0
  }
  return table
})()

/** 标准 CRC-32（IEEE 802.3）；支持 `crc = crc32(chunk, crc)` 跨块续算 */
export function crc32(buf: Buffer, previous = 0): number {
  let c = (previous ^ 0xffffffff) >>> 0
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0
  }
  return (c ^ 0xffffffff) >>> 0
}

/** 第一遍：算出 CRC 与字节数（local header 要把它们写在数据之前，不能用 data descriptor 省这一步） */
async function crcAndSize(filePath: string): Promise<{ crc: number; size: number }> {
  let crc = 0
  let size = 0
  for await (const chunk of fsSync.createReadStream(filePath)) {
    const b = chunk as Buffer
    crc = crc32(b, crc)
    size += b.length
  }
  return { crc, size }
}

interface CentralEntry {
  nameBuf: Buffer
  crc: number
  size: number
  localOffset: number
}

function localHeader(nameBuf: Buffer, crc: number, size: number): Buffer {
  const h = Buffer.alloc(30)
  h.writeUInt32LE(LOCAL_HEADER_SIG, 0)
  h.writeUInt16LE(20, 4)            // version needed to extract = 2.0
  h.writeUInt16LE(FLAG_UTF8, 6)     // general purpose flags
  h.writeUInt16LE(0, 8)             // method = 0 (store)
  h.writeUInt16LE(DOS_TIME, 10)
  h.writeUInt16LE(DOS_DATE, 12)
  h.writeUInt32LE(crc, 14)
  h.writeUInt32LE(size, 18)         // compressed size
  h.writeUInt32LE(size, 22)         // uncompressed size
  h.writeUInt16LE(nameBuf.length, 26)
  h.writeUInt16LE(0, 28)            // extra field length
  return h
}

function centralHeader(e: CentralEntry): Buffer {
  const h = Buffer.alloc(46)
  h.writeUInt32LE(CENTRAL_HEADER_SIG, 0)
  h.writeUInt16LE(20, 4)            // version made by
  h.writeUInt16LE(20, 6)            // version needed
  h.writeUInt16LE(FLAG_UTF8, 8)
  h.writeUInt16LE(0, 10)            // method = store
  h.writeUInt16LE(DOS_TIME, 12)
  h.writeUInt16LE(DOS_DATE, 14)
  h.writeUInt32LE(e.crc, 16)
  h.writeUInt32LE(e.size, 20)
  h.writeUInt32LE(e.size, 24)
  h.writeUInt16LE(e.nameBuf.length, 28)
  h.writeUInt16LE(0, 30)            // extra field length
  h.writeUInt16LE(0, 32)            // file comment length
  h.writeUInt16LE(0, 34)            // disk number start
  h.writeUInt16LE(0, 36)            // internal file attributes
  h.writeUInt32LE(0, 38)            // external file attributes
  h.writeUInt32LE(e.localOffset, 42)
  return h
}

function endOfCentralDirectory(count: number, cdSize: number, cdOffset: number): Buffer {
  const h = Buffer.alloc(22)
  h.writeUInt32LE(EOCD_SIG, 0)
  h.writeUInt16LE(0, 4)             // number of this disk
  h.writeUInt16LE(0, 6)             // disk with central directory
  h.writeUInt16LE(count, 8)
  h.writeUInt16LE(count, 10)
  h.writeUInt32LE(cdSize, 12)
  h.writeUInt32LE(cdOffset, 16)
  h.writeUInt16LE(0, 20)            // comment length
  return h
}

async function* generateZip(source: ZipMemberSource): AsyncGenerator<Buffer> {
  const members = typeof source === 'function' ? await source() : source
  if (!members.length) throw new Error('zip: no members')
  if (members.length > 0xffff) throw new Error('zip: too many members for ZIP32')

  const central: CentralEntry[] = []
  let offset = 0
  for (const m of members) {
    const nameBuf = Buffer.from(m.name, 'utf8')
    if (!nameBuf.length || nameBuf.length > 0xffff) throw new Error('zip: invalid member name length')
    const { crc, size } = await crcAndSize(m.filePath)
    if (size > ZIP32_MAX_BYTES) throw new Error('zip: member larger than 4 GiB')
    const localOffset = offset

    const lh = localHeader(nameBuf, crc, size)
    yield Buffer.concat([lh, nameBuf])
    offset += lh.length + nameBuf.length

    let written = 0
    for await (const chunk of fsSync.createReadStream(m.filePath)) {
      const b = chunk as Buffer
      written += b.length
      offset += b.length
      if (offset > ZIP32_MAX_BYTES) throw new Error('zip: archive larger than 4 GiB')
      yield b
    }
    // 文件在第一遍与第二遍之间被改动 ⇒ 直接失败，避免写出 CRC 不匹配的坏包
    if (written !== size) throw new Error('zip: source changed while packing ' + m.name)

    central.push({ nameBuf, crc, size, localOffset })
  }

  const cdOffset = offset
  for (const e of central) {
    const ch = centralHeader(e)
    yield Buffer.concat([ch, e.nameBuf])
    offset += ch.length + e.nameBuf.length
  }
  if (cdOffset > ZIP32_MAX_BYTES) throw new Error('zip: central directory offset overflow')
  yield endOfCentralDirectory(central.length, offset - cdOffset, cdOffset)
}

/**
 * 功能描述：创建一个 ZIP（store）可读流。
 * @param source 成员数组，或返回成员数组的异步工厂（工厂在第一次读取时才执行 ⇒ 支持延迟下载远端文件）
 */
export function createZipStoreStream(source: ZipMemberSource): Readable {
  return Readable.from(generateZip(source))
}

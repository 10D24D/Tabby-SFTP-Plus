/**
 * 功能描述：SFTP+ transfer-adapters 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-30 — B14：覆盖上传 rename 兼容不自动覆盖已存在目标的服务端（先删目标再重试）
 * 合并来源：remote-file-transfer, local-transfers
 */

import { log } from '../../services/sftp-logger'

import * as fs from 'fs'

import * as fsPromises from 'fs/promises'

import { FileHandle } from 'fs/promises'

import * as os from 'os'

import * as path from 'path'

import { randomUUID } from 'crypto'

import { type SFTPSessionLike } from '../../services/sftp.service'


﻿/**
 * 远程文件内容读取/临时文件（查看、编辑用，不经过传输队列 UI）
 */


/** 将远程文件下载到内存 */
export class BufferCollectingDownload {
  private chunks: Buffer[] = []
  private completedBytes = 0
  private complete = false
  private cancelled = false

  constructor(
    private readonly fileSize: number,
    private readonly mode = 0o644,
    private readonly maxBytes?: number,
  ) {}

  getName(): string { return '' }
  getMode(): number { return this.mode }
  getSize(): number { return this.fileSize }

  async write(buffer: Buffer): Promise<void> {
    if (this.cancelled) return
    this.chunks.push(buffer)
    this.completedBytes += buffer.length
    // ★ 2026-07-25 B8：溢出硬上限（防止远程服务器谎报 size 时整文件进内存 OOM）
    if (this.maxBytes != null && this.completedBytes > this.maxBytes) {
      this.cancelled = true
      throw new Error(`Downloaded data exceeds limit (${this.completedBytes} > ${this.maxBytes})`)
    }
    if (this.fileSize > 0 && this.completedBytes >= this.fileSize) {
      this.complete = true
    }
  }

  close(): void {}
  isComplete(): boolean { return this.complete || this.fileSize === 0 }
  isCancelled(): boolean { return this.cancelled }
  cancel(): void { this.cancelled = true }
  getCompletedBytes(): number { return this.completedBytes }
  increaseProgress(_bytes: number): void {}

  getBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }
}

export async function downloadRemoteToBuffer(
  sftpSession: SFTPSessionLike,
  remotePath: string,
  size: number,
  mode = 0o644,
  maxBytes?: number,
): Promise<Buffer> {
  if (size === 0) return Buffer.alloc(0)
  const dl = new BufferCollectingDownload(size, mode, maxBytes)
  await sftpSession.download(remotePath, dl as any)
  // ★ 2026-08-10：校验完整性——服务器提前结束流时不得静默返回部分内容（查看/编辑会显示残缺文件）
  if (dl.isCancelled()) throw new Error('Download cancelled')
  if (!dl.isComplete()) throw new Error('Download incomplete')
  return dl.getBuffer()
}

export async function downloadRemoteToTempFile(
  sftpSession: SFTPSessionLike,
  remotePath: string,
  size: number,
  mode = 0o644,
): Promise<string> {
  const baseName = path.basename(remotePath) || 'file'
  const dir = path.join(os.tmpdir(), 'tabby-sftp-plus', randomUUID())
  await fsPromises.mkdir(dir, { recursive: true })
  const localPath = path.join(dir, baseName)

  try {
    if (size === 0) {
      const fd = await fsPromises.open(localPath, 'w')
      await fd.close()
      return localPath
    }

    const dl = new LocalPathFileDownload(localPath, mode, size)
    await sftpSession.download(remotePath, dl as any)
    return localPath
  } catch (err) {
    // ★ 2026-07-25 B10：下载失败清理临时目录，避免残留
    try { await fsPromises.rm(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    throw err
  }
}

export async function writeTextToFile(filePath: string, text: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
  await fsPromises.writeFile(filePath, text, encoding)
}

export async function readTextFromFile(filePath: string): Promise<string> {
  return fsPromises.readFile(filePath, 'utf8')
}

export async function writeBufferToTemp(buf: Buffer, fileName: string): Promise<string> {
  const baseName = path.basename(fileName) || 'file'
  const dir = path.join(os.tmpdir(), 'tabby-sftp-plus', randomUUID())
  await fsPromises.mkdir(dir, { recursive: true })
  const localPath = path.join(dir, baseName)
  try {
    await fsPromises.writeFile(localPath, buf)
    return localPath
  } catch (err) {
    // ★ 2026-07-25 B10：写入失败清理临时目录，避免残留
    try { await fsPromises.rm(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    throw err
  }
}

export async function readLocalFileToBuffer(localPath: string, maxBytes?: number): Promise<Buffer> {
  if (maxBytes != null) {
    const st = await fsPromises.stat(localPath)
    if (st.size > maxBytes) {
      throw new Error('FILE_TOO_LARGE')
    }
  }
  return fsPromises.readFile(localPath)
}

export async function removeTempFile(filePath: string): Promise<void> {
  try {
    const dir = path.dirname(filePath)
    await fsPromises.unlink(filePath)
    const remaining = await fsPromises.readdir(dir)
    if (remaining.length === 0) {
      await fsPromises.rmdir(dir)
    }
  } catch {
    try {
      if (fs.existsSync(filePath)) await fsPromises.unlink(filePath)
    } catch { /* ignore */ }
  }
}

/**
 * 本地文件传输适配器
 * 功能描述：实现 tabby-core 的 FileUpload/FileDownload 接口，用于本地文件传输
 *           支持暂停/继续 + 断点续传
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-25 — 添加暂停/继续/断点续传支持
 */

export class LocalPathFileUpload {
  private fd: FileHandle | null = null
  private position = 0
  private completedBytes = 0
  private cancelled = false
  private complete = false
  private paused = false
  /** ★ 2026-08-15 修复 #1：上传失败标记（与 LocalPathFileDownload 对称），
   *  续传流错误时由外部调用 _markFailed()，避免 UI 僵尸态 */
  private failed = false
  /** 是否从指定偏移量恢复（续传模式） */
  private resumeMode = false

  constructor(private filePath: string, resumeOffset?: number) {
    if (resumeOffset !== undefined && resumeOffset > 0) {
      this.position = resumeOffset
      this.completedBytes = resumeOffset
      this.completedBytesForProgress = resumeOffset
      this.resumeMode = true
    }
    // 空文件的 complete 标记已移至 read() 中异步处理（构造函数无法使用 async）
  }

  getName(): string {
    return path.basename(this.filePath)
  }

  getMode(): number {
    return 0o644
  }

  async getSize(): Promise<number> {
    try {
      return (await fs.promises.stat(this.filePath)).size
    } catch {
      return 0
    }
  }

  async read(): Promise<Buffer> {
    // ★ 2026-07-25 B11：取消时必须抛错中断，绝不能返回空 Buffer——
    //   tabby-ssh 的 upload() 把"空块"当作正常传输完成：会先 unlink 远端原文件，
    //   再把半截的 `路径.tabby-upload` 临时文件 rename 成原始名称，
    //   导致"暂停/取消上传后，远端出现未传完的假文件（且原文件被删）"。
    //   抛错则走其 catch 分支：unlink 远端临时文件、保留原文件，行为正确。
    if (this.cancelled) {
      throw new Error('Transfer cancelled')
    }
    if (this.fd === null) {
      this.fd = await fs.promises.open(this.filePath, 'r')
      // 续传模式：seek 到已上传的位置
      if (this.resumeMode && this.position > 0) {
        try {
          await this.fd.read(Buffer.alloc(0), 0, 0, this.position)
        } catch (e) {
          await this.close()
          throw e
        }
      }
    }
    // ★ 2026-08-10 提速：读块 256KB → 1MB。新版 Tabby（russh）的 upload() 循环每块 await writeAll，
    //   而 russh-sftp 的 write_all 内部已流水线化（最多 8 个 WRITE 请求在途，不等单块 ACK），
    //   更大读块 → 更少 JS↔napi 往返与磁盘读系统调用，单文件上传吞吐接近 electerm（fastPut 64×32KB≈2MB 在途）
    const buf = Buffer.alloc(1024 * 1024)
    const { bytesRead } = await this.fd.read(buf, 0, buf.length, this.position)
    if (bytesRead === 0) {
      this.complete = true
      return Buffer.alloc(0)
    }
    this.position += bytesRead
    this.completedBytes += bytesRead
    this.increaseProgress(bytesRead)
    return buf.subarray(0, bytesRead)
  }

  async close(): Promise<void> {
    if (this.fd !== null) {
      try {
        await this.fd.close()
      } catch {
        // ignore
      }
      this.fd = null
    }
  }

  isComplete(): boolean {
    return this.complete
  }

  isCancelled(): boolean {
    return this.cancelled
  }

  isPaused(): boolean {
    return this.paused
  }

  async cancel(): Promise<void> {
    this.cancelled = true
    await this.close()
  }

  /** 暂停传输，返回当前已读取的字节偏移量（用于后续续传） */
  async pause(): Promise<number> {
    // ★ 2026-07-25 B18：暂停不再 close fd。否则若此刻 read() 正在 fd.read()，
    //   fd 被关会抛 EBADF，被 uploadViaRawToTemp 的 readNext.catch 误判为错误，
    //   进而删掉半截 .tabby-upload 临时文件并 reject——与"暂停保留供续传"预期相反。
    //   保留 fd 直到传输结束（finish/取消/error 分支统一 close）；续传用新实例会重开 fd。
    this.paused = true
    return this.completedBytes
  }

  /** 获取当前读取位置（用于续传恢复） */
  getPosition(): number {
    return this.position
  }

  /** ★ 2026-08-15 修复 #1：上传失败检测（与 LocalPathFileDownload 对称） */
  isFailed(): boolean {
    return this.failed
  }

  /** 外部标记传输失败（raw stream 写错误等）；UI 定时器据此记为失败并移除，避免误报成功或挂死 */
  async _markFailed(): Promise<void> {
    this.failed = true
    await this.close()
  }

  // 进度跟踪（兼容 tabby-core FileTransfer）
  private completedBytesForProgress = 0

  increaseProgress(bytes: number): void {
    this.completedBytesForProgress += bytes
  }

  getCompletedBytes(): number {
    return this.completedBytesForProgress
  }
}

export class LocalPathFileDownload {
  private fd: FileHandle | null = null
  private completedBytes = 0
  private completedBytesForProgress = 0
  private cancelled = false
  private complete = false
  private paused = false
  private failed = false
  private resumeOffset = 0

  constructor(
    readonly targetPath: string,
    private mode: number,
    private fileSize: number,
    resumeOffset?: number,
  ) {
    this.resumeOffset = resumeOffset ?? 0
    this.completedBytes = this.resumeOffset
    this.completedBytesForProgress = this.resumeOffset
    // 如果续传偏移量等于文件总大小，则标记为已完成
    if (this.fileSize > 0 && this.resumeOffset >= this.fileSize) {
      this.complete = true
    }
    // 空文件直接标记为已完成
    if (this.fileSize === 0) {
      this.complete = true
    }
  }

  getName(): string {
    return path.basename(this.targetPath)
  }

  getMode(): number {
    return this.mode
  }

  getSize(): number {
    return this.fileSize
  }

  async write(buffer: Buffer): Promise<void> {
    // ★ 2026-07-25：B6 修复——取消时主动抛错中断底层 SFTP 下载流，
    //   否则流会持续回调 write()（空写），完成后在 _doDownload 中仍触发 rename 落盘，
    //   导致"已取消/面板已销毁"却得到文件。
    // ★ 2026-08-10：暂停同样必须抛错——pause() 关闭 fd 后，在途 chunk 若见 fd=null
    //   会以 'w' 重新打开（首次下载 resumeOffset=0）截断已下载部分 → 稀疏损坏文件，
    //   续传后仅大小校验通过即被 rename 成目标。必须先于 cancelled 检查（cancel 紧跟 pause）。
    if (this.paused) {
      throw new Error('Transfer paused')
    }
    if (this.cancelled) {
      throw new Error('Transfer cancelled')
    }
    if (this.fd === null) {
      // 确保目录存在
      const dir = path.dirname(this.targetPath)
      try {
        await fs.promises.mkdir(dir, { recursive: true })
      } catch {
        // ignore - directory may already exist
      }
      // 续传或已部分写入后重开 fd 时用 r+（不截断）接续，避免 'w' 截断已有内容
      const resumeAt = this.resumeOffset > 0 ? this.resumeOffset : this.completedBytes
      const flags = resumeAt > 0 ? 'r+' : 'w'
      this.fd = await fs.promises.open(this.targetPath, flags)
      if (resumeAt > 0) {
        await this.fd.write(Buffer.alloc(0), 0, 0, resumeAt)
        // 实际上使用 ftruncate + seek 更好
        // 先调整文件大小到续传点（如果当前文件小于续传点则补零）
        try {
          await this.fd.truncate(resumeAt)
        } catch { /* ignore */ }
      }
    }
    await this.fd.write(buffer, 0, buffer.length, this.completedBytes)
    this.completedBytes += buffer.length
    this.increaseProgress(buffer.length)
    // ★ 2026-08-26：硬上限——超过声明 fileSize 时拒绝继续写（防谎报更小 size）
    if (this.fileSize > 0 && this.completedBytes > this.fileSize) {
      throw new Error(`Download exceeded declared size: wrote=${this.completedBytes} declared=${this.fileSize}`)
    }
    // 检查是否已写完
    if (this.completedBytes >= this.fileSize) {
      this.complete = true
    }
  }

  async close(): Promise<void> {
    if (this.fd !== null) {
      try {
        await this.fd.close()
      } catch {
        // ignore
      }
      this.fd = null
    }
  }

  isComplete(): boolean {
    return this.complete
  }

  isCancelled(): boolean {
    return this.cancelled
  }

  isPaused(): boolean {
    return this.paused
  }

  isFailed(): boolean {
    return this.failed
  }

  /** 外部标记传输失败（raw stream 读错误等）；UI 定时器据此记为失败并移除，避免误报成功或挂死 */
  async _markFailed(): Promise<void> {
    this.failed = true
    await this.close()
  }

  async cancel(): Promise<void> {
    this.cancelled = true
    await this.close()
  }

  /** 暂停传输，返回当前已写入的字节数（用于后续续传） */
  async pause(): Promise<number> {
    this.paused = true
    // ★ 2026-07-24：暂停前 flush OS 缓冲 + 同步磁盘，避免续传偏移量 > 实际磁盘字节
    if (this.fd) {
      try { await this.fd.sync?.() } catch { /* ignore */ }
    }
    await this.close()
    return this.completedBytes
  }

  /** 获取续传偏移量 */
  getResumeOffset(): number {
    return this.resumeOffset
  }

  /** 外部标记传输完成（用于原始 SFTP stream 续传下载） */
  async _markComplete(): Promise<void> {
    this.complete = true
    await this.close()
  }

  increaseProgress(bytes: number): void {
    this.completedBytesForProgress += bytes
  }

  getCompletedBytes(): number {
    return this.completedBytesForProgress
  }
}

// ─── 字节级上传/下载（原 floating-panel._doUpload/_doDownload 收敛至此） ───

/**
 * ★ 2026-07-30 B14：重命名临时文件为目标路径，兼容"rename 不自动覆盖已存在目标"的 SFTP 服务端。
 * 现象：覆盖上传时把 `x.tabby-upload` rename 成已存在的 `x`，OpenSSH 会直接覆盖，
 *       但部分服务端（某些 NAS / 云 SFTP 网关 / ProFTPD mod_sftp 等）的 SSH_FXP_RENAME
 *       遇到已存在目标会失败 → 上传报"失败"。这里先尝试直接 rename（覆盖语义），
 *       失败后再尝试"删已存在目标 → 重试 rename"，使覆盖上传在所有服务端都能成功。
 * 安全：仅在首次 rename 失败时才 unlink 目标；若 unlink 本身失败（目标本就不存在/无权限）
 *       则保留原始 rename 错误抛出，绝不误删用户文件。
 */
async function renameWithOverwrite(rawSftp: any, tempPath: string, remotePath: string): Promise<void> {
  try {
    await rawSftp.rename(tempPath, remotePath)
    return
  } catch (renameErr) {
    // ★ 2026-08-26 M6：先把原文件挪到 backup，再把临时文件 rename 为目标；失败可回滚
    if (typeof rawSftp.rename !== 'function') throw renameErr
    if (typeof rawSftp.stat === 'function') {
      try { await rawSftp.stat(remotePath) } catch { throw renameErr } // 目标不存在 → 保留原始错误
    }
    const backup = remotePath + `.sftp-plus-bak-${Date.now()}`
    let backedUp = false
    try {
      await rawSftp.rename(remotePath, backup)
      backedUp = true
      await rawSftp.rename(tempPath, remotePath)
      if (typeof rawSftp.unlink === 'function') {
        try { await rawSftp.unlink(backup) } catch { /* 留下 backup 总比丢数据好 */ }
      }
    } catch (e2) {
      if (backedUp) {
        try { await rawSftp.rename(backup, remotePath) } catch { /* 无法恢复 */ }
      }
      throw e2
    }
  }
}


export interface TransferCancelRef {
  current: any
  /** ★ 2026-08-26 H2：目录并发时登记全部在途子传输，取消时广播 */
  active?: Set<any>
}

function registerCancelRef(ref: TransferCancelRef | null | undefined, transfer: any): void {
  if (!ref) return
  ref.current = transfer
  if (!ref.active) ref.active = new Set()
  ref.active.add(transfer)
}

function unregisterCancelRef(ref: TransferCancelRef | null | undefined, transfer: any): void {
  if (!ref) return
  ref.active?.delete(transfer)
  if (ref.current === transfer) ref.current = null
}

/** 取消 TransferCancelRef 上登记的全部在途传输 */
export function cancelAllInFlight(ref: TransferCancelRef | null | undefined): void {
  if (!ref) return
  const list = ref.active ? [...ref.active] : (ref.current ? [ref.current] : [])
  for (const t of list) {
    try {
      if (typeof t?.cancel === 'function') t.cancel()
      else if (typeof t?.destroy === 'function') t.destroy()
    } catch { /* ignore */ }
  }
  ref.current = null
  ref.active?.clear()
}

export type TrackTransferFn = (
  t: LocalPathFileUpload | LocalPathFileDownload,
  direction: 'upload' | 'download',
  remotePath: string,
  localPath: string,
  logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
) => void

export interface ByteTransferContext {
  session: SFTPSessionLike
  /** 并发同名下载守卫（B3） */
  activeDownloadTargets: Set<string>
  /** 文件夹传输取消时中断当前子文件（B1） */
  cancelRef?: TransferCancelRef | null
  trackTransfer?: TrackTransferFn
  onUploadError?: (remotePath: string, localPath: string, err: unknown) => void
  onDownloadError?: (remotePath: string, err: unknown) => void
}

export interface UploadByteOptions {
  /** 是否走 UI 进度/传输日志 */
  track?: boolean
  logOperation?: 'upload' | 'edit-upload'
  /** 暴露 transfer 引用供 cancelRef */
  exposeCancel?: boolean
}

export interface DownloadByteOptions {
  track?: boolean
  logOperation?: 'download' | 'edit-download'
  exposeCancel?: boolean
  /** 传输对象创建后回调（拖拽预缓存等需独立持有 cancel 引用时使用） */
  onTransfer?: (dl: LocalPathFileDownload) => void
}

/** 上传本地文件到远程路径（不含冲突检测） */
/**
 * ★ 2026-07-25 B13：以 raw stream 把本地文件写到 `remotePath.tabby-upload` 临时文件，
 *   全部写完后再 rename 成原始名。相比 tabby-ssh 的 upload()：
 *   - 暂停（paused，非 cancelled）：只结束流、保留临时文件，供续传；
 *   - 取消（cancelled）：销毁流并删除临时文件，远端原文件始终保留；
 *   - 续传：以 r+ flag 从远端临时文件实际大小处接写，实现真正的断点续传。
 *   这样上传与下载语义一致：暂停保留半截、取消才删除。
 */
export async function uploadViaRawToTemp(
  rawSftp: any,
  remotePath: string,
  up: LocalPathFileUpload,
  offset: number,
): Promise<void> {
  const tempPath = remotePath + '.tabby-upload'
  const writeStream = rawSftp.createWriteStream(tempPath, {
    flags: offset > 0 ? 'r+' : 'w',
    start: offset,
  })
  const safeUnlinkTemp = () => { try { rawSftp.unlink(tempPath).catch(() => null) } catch { /* ignore */ } }
  return new Promise<void>((resolve, reject) => {
    writeStream.on('finish', () => {
      // 暂停/取消都不在此改名：暂停保留临时文件供续传；取消已在前述分支删临时文件
      if (up.isPaused() || up.isCancelled?.()) { up.close().catch(() => {}); resolve(); return }
      // ★ 2026-07-30 B14：用 renameWithOverwrite 兼容不覆盖已存在目标的服务端（覆盖上传）
      renameWithOverwrite(rawSftp, tempPath, remotePath)
        .then(() => { up.close().catch(() => {}); resolve() })
        .catch((e: unknown) => { safeUnlinkTemp(); up.close().catch(() => {}); reject(e) })
    })
    writeStream.on('error', (err: Error) => {
      if (!up.isCancelled?.()) log.error('Raw upload stream error', err)
      safeUnlinkTemp()
      up.close().catch(() => {})
      reject(err)
    })
    const readNext = () => {
      up.read().then((buf) => {
        // 取消（非暂停）：销毁流 + 删除临时文件
        if (up.isCancelled?.() && !up.isPaused()) {
          try { writeStream.destroy() } catch { /* ignore */ }
          safeUnlinkTemp()
          up.close().catch(() => {})
          resolve()
          return
        }
        // 暂停：结束流，保留临时文件（finish 中不再改名）
        if (up.isPaused()) {
          writeStream.end()
          up.close().catch(() => {})
          return
        }
        if (buf.length === 0) { writeStream.end(); return }
        writeStream.write(buf, () => readNext())
      }).catch((e: unknown) => {
        // 暂停：fd 保留未关，read() 正常返回不会走到这里；但若竞态下 read 抛错，
        // 安全结束并保留 .tabby-upload 临时文件（供续传），不得删除。
        if (up.isPaused()) {
          up.close().catch(() => {})
          resolve()
          return
        }
        // read() 在取消时抛 'Transfer cancelled'
        if (up.isCancelled?.() && !up.isPaused()) {
          try { writeStream.destroy() } catch { /* ignore */ }
          safeUnlinkTemp()
          up.close().catch(() => {})
          resolve()
          return
        }
        log.error('Raw upload read error', e)
        try { writeStream.destroy() } catch { /* ignore */ }
        safeUnlinkTemp()
        up.close().catch(() => {})
        reject(e)
      })
    }
    readNext()
  })
}

/** 上传本地文件到远程路径（不含冲突检测）。
 *  ★ 2026-08-10：返回是否传输完整成功（取消/暂停/失败均为 false），
 *  供剪切粘贴等调用方在删源前校验，防止"传输失败仍删源"的数据丢失。 */
export async function uploadLocalFile(
  ctx: ByteTransferContext,
  remotePath: string,
  localPath: string,
  opts: UploadByteOptions = {},
): Promise<boolean> {
  const up = new LocalPathFileUpload(localPath)
  if (opts.track && ctx.trackTransfer) {
    ctx.trackTransfer(up, 'upload', remotePath, localPath, opts.logOperation)
  }
  if (opts.exposeCancel && ctx.cancelRef) registerCancelRef(ctx.cancelRef, up)
  try {
    const rawSftp = ctx.session as any
    if (typeof rawSftp?.createWriteStream === 'function') {
      // ★ 2026-07-25 B13：优先走 raw stream 写 .tabby-upload 临时文件，
      //   支持暂停保留 / 取消删除 / 续传，规避 tabby-ssh upload() 的"空块=完成"陷阱
      await uploadViaRawToTemp(rawSftp, remotePath, up, 0)
    } else {
      // 兜底：无 raw stream 时用标准 upload API（取消即 abort，不支持续传）
      await ctx.session.upload(remotePath, up as any)
    }
    // ★ 2026-07-25 B13：raw stream 取消/暂停时以 resolve() 结束（不抛错），据状态判定
    if (up.isCancelled() || up.isPaused()) {
      if (opts.track) log.info('Upload cancelled/paused:', localPath)
      return false
    }
    if (opts.track) log.info('Upload completed:', localPath)
    return true
  } catch (e) {
    // ★ 2026-07-25 B11：用户主动取消（read() 抛错中断）不算失败，但也不是"传输成功"
    if (up.isCancelled() || up.isPaused()) {
      if (opts.track) log.info('Upload cancelled/paused:', localPath)
      return false
    }
    log.error(opts.track ? 'Upload failed' : 'Upload failed (raw)', remotePath, e)
    if (opts.track) ctx.onUploadError?.(remotePath, localPath, e)
    return false
  } finally {
    if (opts.exposeCancel && ctx.cancelRef) unregisterCancelRef(ctx.cancelRef, up)
  }
}

/** 下载远程文件到本地路径（.tmp 原子改名；不含冲突检测）。
 *  ★ 2026-08-10：返回是否传输完整成功（跳过/取消/暂停/失败均为 false），供剪切粘贴删源前校验。 */
export async function downloadRemoteFile(
  ctx: ByteTransferContext,
  remotePath: string,
  localPath: string,
  mode?: number,
  size?: number,
  opts: DownloadByteOptions = {},
): Promise<boolean> {
  if (ctx.activeDownloadTargets.has(localPath)) {
    log.warn(opts.exposeCancel ? 'skip duplicate concurrent download (raw):' : 'skip duplicate concurrent download:', localPath)
    return false
  }
  ctx.activeDownloadTargets.add(localPath)
  try {
    let resolvedSize = size
    if (resolvedSize === undefined) {
      try {
        const st = await ctx.session.stat(remotePath)
        resolvedSize = (st as any)?.size ?? 0
      } catch {
        resolvedSize = 0
      }
    }
    const sz = resolvedSize ?? 0
    const tmpPath = localPath + '.tmp'

    // 已知空文件：直接落盘并（可选）登记进度
    // ★ 2026-08-26 M3：仅当调用方显式传入 size===0 时才走空文件短路；
    //   stat 失败收成 0 时 size 为 undefined，不得跳过完整性校验
    if (sz === 0 && size !== undefined && size === 0) {
      try {
        const fd = await fsPromises.open(tmpPath, 'w')
        await fd.close()
        await fsPromises.rename(tmpPath, localPath)
      } catch { /* ignore */ }
      if (opts.track && ctx.trackTransfer) {
        const dl = new LocalPathFileDownload(localPath, mode ?? 0o644, 0)
        ctx.trackTransfer(dl, 'download', remotePath, localPath, opts.logOperation)
      }
      return true
    }

    const dl = new LocalPathFileDownload(tmpPath, mode ?? 0o644, sz)
    if (opts.track && ctx.trackTransfer) {
      ctx.trackTransfer(dl, 'download', remotePath, localPath, opts.logOperation)
    }
    if (opts.exposeCancel && ctx.cancelRef) registerCancelRef(ctx.cancelRef, dl)
    opts.onTransfer?.(dl)

    try {
      await ctx.session.download(remotePath, dl)
      // B6：改名前二次校验，已取消则不落盘
      if (dl.isCancelled()) {
        try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
        return false
      }
      const localStat = await fsPromises.stat(tmpPath).catch(() => null)
      // ★ 2026-08-26 M3：未知大小（sz===0 且非显式空文件）时至少要求本地有可读 stat
      if (!localStat) throw new Error('Download integrity check failed: missing local temp file')
      if (sz > 0 && localStat.size !== sz) {
        throw new Error(`Size mismatch: remote=${sz} local=${localStat.size}`)
      }
      await fsPromises.rename(tmpPath, localPath)
      if (opts.track) log.info('Download completed:', remotePath)
      return true
    } catch (e) {
      // ★ 2026-08-10：暂停必须最先检查——pause() 关 fd 后 cancel() 才置 cancelled，
      //   在途 chunk 的 write() 中断抛错到达这里时若先命中 cancelled 分支会误删供续传的 .tmp
      if (dl.isPaused()) {
        if (opts.track) log.info('Download paused:', remotePath)
        return false
      }
      if (dl.isCancelled()) {
        try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
        return false
      }
      log.error(opts.track ? 'Download failed' : 'Download failed (raw)', remotePath, e)
      try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
      if (opts.track) ctx.onDownloadError?.(remotePath, e)
      return false
    } finally {
      if (opts.exposeCancel && ctx.cancelRef) unregisterCancelRef(ctx.cancelRef, dl)
    }
  } finally {
    ctx.activeDownloadTargets.delete(localPath)
  }
}


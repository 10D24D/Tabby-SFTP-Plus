/**
 * 功能描述：SFTP+ transfer-adapters 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-09-26 — P0 修复（「进度条在动又突然消失 + 下载反复失败」第二轮）：
 *              ★ 同日第三轮（本轮）：单次 read 超时的重试**不再设次数上限**（原 4 次 ≈ 40s 就
 *              放弃整个文件），改为「连续零字节进展 4 分钟」才判死 + 指数退避（350ms→3s 上限）。
 *              依据：4 次的耐心对被 CPU 积分/云盘 IO 卡住的服务端远远不够（零字节停顿 30~60s
 *              是常态，日志里连 heartbeat 探测一起超时），而**同机同目录 Electerm 能跑完** ——
 *              差别就是 ssh2 没有 per-request 硬超时、它只是等。本插件等价地「等到不耐烦为止」。
 *              安全性不变：read 超时时 handle 位置不推进，重读同块幂等；万一位置已推进，
 *              少的字节由收尾 Size mismatch 拦下（不会静默损坏）。
 *              ★ 下载改走**自管分块读取**（downloadViaChunkedRead：session.open → handle.read，
 *              单次 read 请求超时只重试该次 read，已下字节不丢），替代「整文件从头重试」——
 *              实测 84.9MB 文件在 1.5MB/s 下需 ~57s，而 russh 每请求 ~10s 超时，整文件重试
 *              等于把 57s 暴露窗口重放 3 次，必然再中招（日志：retry 1/2 → retry 2/2 → giving up）。
 *              ⚠ 仅对「已知大小」启用 read 级重试：超时若实为「响应丢失但服务端已推进 position」，
 *              重试会少读一块 → 已知大小时由收尾 Size mismatch 拦下（不会静默损坏）；
 *              大小未知（-1）无法察觉错位，故不重试 read，直接交给整文件通道。
 *              ★ throw 前补 .tmp 清理：giving up / 非超时硬错误此前直接抛出，跳过收尾清理，
 *              磁盘残留 bsball-server.jar.tmp 等垃圾（现场截图已确认）。暂停/取消仍保留 .tmp 供续传。
 *              ★ 收尾 rename 前显式 dl.close()：分块通道不再经 Tabby 的 transfer.close()，
 *              而 Windows 上 rename 一个仍被打开的文件可能失败。
 *              ★ 同日续（P0-4）：取远端大小改走 `statSizeWithRetry`（重试 3 次）——单次 stat
 *              超时（通道繁忙时极易发生）会让大小变成 -1，下载随即被降级到**整文件**通道
 *              （分块通道要求已知大小），而整文件通道把 85MB 交给 russh 的**单个请求**，
 *              10s 硬超时下必死（现场日志 `request timed out (retry 1/2), restarting file` ×3
 *              → `giving up`）。即「越忙越丢分块通道」，故小请求值得重试。
 *              同时对上游传值一并纠偏：传 -1（未知哨兵）也去取一次真实大小（原实现只认
 *              `undefined`，采信 -1 会同样丢掉分块通道）；传 0（上游把「未知」写成 0 的入口）
 *              先向远端复核，防「远端 84MB 却只落一个 0 字节文件且返回成功」的静默数据丢失。
 *              ★ 同日续（P0-4）：`LocalPathFileUpload.read` / `LocalPathFileDownload.write`
 *              每成功搬运一块即 `markTransferProgress()`，为心跳提供「字节在流动」的存活证据
 *              （心跳据此不再误判繁忙通道为死亡，见 core/transfer-progress.ts 与 connection-lifecycle）。
 *              2026-09-25 — P0 修复（远程→本地下载反复失败的真因，实测日志
 *              `Custom { kind: TimedOut, error: Timeout }`、7.7MB/s×11.2s≈86MB 才报错）：
 *              russh-sftp 3.0.0 对每个 SFTP 请求有固定超时（~10s），数据收完也可能在收尾阶段超时。
 *              downloadRemoteFile 增加超时处理：① .tmp 已收满（size===声明值）→ 直接按完成落盘，
 *              不再把 86MB 已下好的数据删掉重下；② 否则整文件重试（DOWNLOAD_TIMEOUT_RETRIES=2，
 *              间隔 1.5s），复用同一 dl/进度条目（_resetForFullRetry/_clearTransferFailureMarks）。
 *              ⚠ 勿用「raw 偏移续读」：russh 版 Tabby 的 SFTP 是句柄式（open→handle.read 顺序读、
 *              无 seek），本文件早前照搬 ssh2 回调式 API 的 resumeDownloadViaRaw 从未生效（同因：
 *              协调器 _resumeWithRawRead 的 'Raw SFTP open/read not available' 也一直静默失效）
 *              2026-09-25 — P0 修复：LocalPathFileUpload/Download 补 Tabby FileTransfer 契约的
 *              setStatus/getStatus——缺它会让 tabby-ssh 的 download()/upload() 在 catch 里
 *              抛 "transfer.setStatus is not a function" 把**真实错误顶掉**（现象：下载失败只报这句）；
 *              同时把「远端上报过错误」记为 isFailed()，调用方 catch 优先判它，防补上 setStatus 后
 *              Tabby 的 transfer.cancel() 又让真实错误被 isCancelled() 分支静默吞掉
 *              2026-09-25 — 第七轮审计 P2-1 修复：大小未知（fileSize=-1）下载补绝对上限
 *              （UNKNOWN_SIZE_HARD_CAP_BYTES=64GiB），防异常/恶意服务器无界推送写满磁盘
 *              2026-09-21 — P1/P2 修复：LocalPathFileUpload.getSize 在 stat 失败时返回 -1（原返回 0
 *              与「真的是空文件」不可区分，被 trackTransfer 当空文件秒报成功且脱离追踪）；
 *              未知大小下载补 EOF 后 stat 复核完整性，编辑类调用可要求 requireExactSize / maxBytes；
 *              cancelAllInFlight 显式挂 .catch（cancel 是 async，try/catch 抓不到其 rejection）
 *              2026-09-21 — 修复查看/编辑下载把未知大小误判为空文件，并补临时文件完整性校验；
 *              第六轮审计修复：① P1 上传方向补 activeUploadTargets 同名并发守卫
 *              （与下载对称，防两个并发上传互踩同一 .tabby-upload 临时文件导致内容交叉损坏）；
 *              ② P2 stat 失败的未知大小下载用 -1 哨兵表示「未知」，不再被 trackTransfer 当空文件
 *              立即谎报成功；下载结束按结果 _markComplete/_markFailed 收尾
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

import { markTransferProgress } from './transfer-progress'


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

/** ★ 2026-09-26 P0：取远端大小这一小请求的重试次数与间隔。
 *   理由见 `statSizeWithRetry` 注释——一次 stat 超时的代价是「丢掉唯一抗超时的分块通道」。 */
const STAT_FOR_SIZE_ATTEMPTS = 3
const STAT_FOR_SIZE_RETRY_DELAY_MS = 400

/**
 * ★ 2026-09-26 P0：读远端文件大小（带重试），失败返回 -1（未知）。
 *
 * **为什么必须重试（实测日志）**：大小未知会让 `downloadViaChunkedRead()` 返回 `unsupported`
 *   （没有声明大小就无法检出读错位，不敢开 read 级重试），下载被降级到**整文件通道**——
 *   而整文件通道把整个 85MB 交给 russh 的**单个请求**，10s 硬超时下必然失败
 *   （现场日志：`request timed out (retry 1/2), restarting file` ×3 → `giving up`）。
 *   讽刺的是 stat 超时恰恰发生在通道繁忙（＝正在下载大文件）时，于是「越忙越丢分块通道」。
 *
 * stat 是**极小请求**，重试成本远低于丢掉分块通道；且重试会让请求落到通道队列的不同位置，
 * 在大流量间隙里通常能挤进去。
 */
async function statSizeWithRetry(sftpSession: SFTPSessionLike, remotePath: string): Promise<number> {
  // 宿主未暴露 stat：直接认未知，不必空转 3 轮
  if (typeof sftpSession?.stat !== 'function') return -1
  for (let attempt = 1; attempt <= STAT_FOR_SIZE_ATTEMPTS; attempt++) {
    try {
      const st = await sftpSession.stat?.(remotePath)
      const statSize = Number((st as { size?: unknown } | null)?.size)
      if (Number.isFinite(statSize) && statSize >= 0) return statSize
    } catch (e) {
      if (attempt >= STAT_FOR_SIZE_ATTEMPTS) {
        log.warn(`stat failed while resolving remote download size (gave up after ${attempt} attempts):`, remotePath, e)
        break
      }
      log.warn(`stat failed while resolving remote download size (retry ${attempt}/${STAT_FOR_SIZE_ATTEMPTS}):`, remotePath)
      await new Promise(r => setTimeout(r, STAT_FOR_SIZE_RETRY_DELAY_MS))
    }
  }
  return -1
}

async function resolveRemoteDownloadSize(
  sftpSession: SFTPSessionLike,
  remotePath: string,
  listedSize: number,
): Promise<number> {
  if (Number.isFinite(listedSize) && listedSize > 0) return listedSize
  // -1 明确表示未知；不能把 listing 缺失/错误产生的 0 当成空文件。
  return statSizeWithRetry(sftpSession, remotePath)
}

/**
 * ★ 2026-09-21 P1 修复：大小未知（-1）时补完整性校验。
 * 原实现的两处校验都挂着 `resolvedSize >= 0` 前置条件，listing 缺 size 且 stat 也失败时
 * 直接跳过——服务端提前 EOF 的残缺内容会被当成完整文件返回。对「查看」只是显示不全，
 * 但「编辑」拿到残缺内容后保存会覆盖掉远端完整文件，属数据丢失。
 *
 * 策略分两层：
 *  - requireExactSize（编辑类调用）：大小无法确认即拒绝，不给残缺内容进入可回写的路径；
 *  - 其余调用：EOF 后再 stat 一次复核，能拿到 size 就严格比对，拿不到只告警放行。
 */
async function verifyUnknownSizeDownload(
  sftpSession: SFTPSessionLike,
  remotePath: string,
  actualBytes: number,
): Promise<void> {
  const recheck = await resolveRemoteDownloadSize(sftpSession, remotePath, -1)
  if (recheck >= 0 && actualBytes !== recheck) {
    throw new Error(`Download incomplete: expected=${recheck}, actual=${actualBytes} (size resolved after transfer)`)
  }
  if (recheck < 0) {
    log.warn('[download] remote size unverifiable, integrity not guaranteed:', remotePath, 'bytes:', actualBytes)
  }
}

export async function downloadRemoteToBuffer(
  sftpSession: SFTPSessionLike,
  remotePath: string,
  size: number,
  mode = 0o644,
  maxBytes?: number,
  opts?: { requireExactSize?: boolean },
): Promise<Buffer> {
  const resolvedSize = await resolveRemoteDownloadSize(sftpSession, remotePath, size)
  if (resolvedSize === 0) return Buffer.alloc(0)
  if (resolvedSize < 0 && opts?.requireExactSize) {
    throw new Error('REMOTE_SIZE_UNKNOWN')
  }
  const dl = new BufferCollectingDownload(resolvedSize, mode, maxBytes)
  await sftpSession.download(remotePath, dl as any)
  // ★ 2026-08-10：校验完整性——服务器提前结束流时不得静默返回部分内容（查看/编辑会显示残缺文件）
  if (dl.isCancelled()) throw new Error('Download cancelled')
  if (resolvedSize >= 0) {
    if (dl.getCompletedBytes() !== resolvedSize) {
      throw new Error(`Download incomplete: expected=${resolvedSize}, actual=${dl.getCompletedBytes()}`)
    }
  } else {
    await verifyUnknownSizeDownload(sftpSession, remotePath, dl.getCompletedBytes())
  }
  return dl.getBuffer()
}

export async function downloadRemoteToTempFile(
  sftpSession: SFTPSessionLike,
  remotePath: string,
  size: number,
  mode = 0o644,
  opts?: { requireExactSize?: boolean; maxBytes?: number },
): Promise<string> {
  const baseName = path.basename(remotePath) || 'file'
  const dir = path.join(os.tmpdir(), 'tabby-sftp-plus', randomUUID())
  await fsPromises.mkdir(dir, { recursive: true })
  const localPath = path.join(dir, baseName)

  try {
    const resolvedSize = await resolveRemoteDownloadSize(sftpSession, remotePath, size)
    if (resolvedSize === 0) {
      const fd = await fsPromises.open(localPath, 'w')
      await fd.close()
      return localPath
    }
    // ★ 2026-09-21 P1 修复：编辑类调用在大小无法确认时直接拒绝（详见 verifyUnknownSizeDownload）
    if (resolvedSize < 0 && opts?.requireExactSize) {
      throw new Error('REMOTE_SIZE_UNKNOWN')
    }
    // ★ 2026-09-21 P2 修复：上限用实际 stat 出来的 size 复核——调用方的前置检查依赖
    //   listing 的 size，listing 为 0 或谎报时超大文件会被放进来读满内存
    if (opts?.maxBytes != null && resolvedSize > opts.maxBytes) {
      throw new Error('FILE_TOO_LARGE')
    }

    const dl = new LocalPathFileDownload(localPath, mode, resolvedSize)
    try {
      await sftpSession.download(remotePath, dl as any)
      if (dl.isCancelled()) throw new Error('Download cancelled')
      const actualSize = (await fsPromises.stat(localPath)).size
      if (resolvedSize >= 0) {
        if (actualSize !== resolvedSize) {
          throw new Error(`Download incomplete: expected=${resolvedSize}, actual=${actualSize}`)
        }
      } else {
        await verifyUnknownSizeDownload(sftpSession, remotePath, actualSize)
      }
      await dl._markComplete()
    } finally {
      await dl.close()
    }
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
  /**
   * ★ 2026-09-25 P0：远端上报的失败原因（Tabby FileTransfer 契约要求实现 setStatus/getStatus）。
   *   见 setStatus() 上方注释：不实现它会**把真实错误顶掉**成
   *   "transfer.setStatus is not a function"。空串表示「远端未上报错误」。
   */
  private status = ''
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

  /**
   * ★ 2026-09-21 P1 修复：stat 失败原返回 0，与「真的是空文件」不可区分——
   * PanelTransferRuntime.trackTransfer 对 sz===0 会立刻写成功日志并 return，
   * 既不登记传输条目也不启动进度 tick，而真实上传仍在后台跑（trackTransfer 是
   * fire-and-forget 调用的）：结果是日志显示成功、列表里没有条目、用户无法取消。
   * 改为 -1 表示「大小未知」，与 resolveRemoteDownloadSize 的既有约定一致。
   */
  async getSize(): Promise<number> {
    try {
      return (await fs.promises.stat(this.filePath)).size
    } catch (e) {
      log.warn('[upload] stat failed, size unknown:', this.filePath, e)
      return -1
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
    // ★ 2026-09-26 P0：上传方向同样打点——心跳据此判定「通道是否真的在搬数据」
    markTransferProgress()
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

  getStatus(): string {
    return this.status
  }

  /**
   * ★ 2026-09-25 P0：Tabby 的 FileTransfer 基类（tabby-core api/platform.ts 第 57 行）带
   *   setStatus/getStatus，本插件早期的 transfer 对象是**鸭子类型**、没继承它，于是：
   *
   *   tabby-ssh 的 SFTPSession.upload()（src/session/sftp.ts 第 129-133 行）在 catch 里依次执行
   *     transfer.setStatus(e.message) → transfer.cancel() → throw e
   *
   *   ① 缺 setStatus：第 1 步自身抛 TypeError，把**真实错误顶掉**——现场只剩
   *      "transfer.setStatus is not a function"，`throw e` 永不执行；
   *   ② 补上 setStatus：第 2 步 cancel() 会执行，使本文件 catch 里的 isCancelled() 分支
   *      抢先命中，真实错误又被当成「用户取消」静默吞掉。
   *
   *   因此这里两件事一起做：记下原因字符串，并把 failed 置位作为「远端确实报错」的标记，
   *   调用方 catch 必须**优先**读 isFailed()/getStatus()，再判 paused/cancelled。
   */
  setStatus(status: string): void {
    this.status = String(status ?? '')
    if (this.status) {
      this.failed = true
      log.error('[transfer] remote reported failure (upload):', this.filePath, this.status)
    }
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

/** ★ 2026-09-25 P2-1 修复：大小未知（fileSize=-1，stat 失败）时的绝对上限。
 *   此时没有「声明大小」可依据，异常/恶意服务器可无界推送写满磁盘；
 *   给一个宽松但有限的上限兜底（正常文件 stat 极少失败，误伤概率极低）。命中即抛错中断。
 * @修改人：DD1024z + Deepseek-V4.1-Flash @修改时间：2026-09-25 */
const UNKNOWN_SIZE_HARD_CAP_BYTES = 64 * 1024 * 1024 * 1024

export class LocalPathFileDownload {
  private fd: FileHandle | null = null
  private completedBytes = 0
  private completedBytesForProgress = 0
  private cancelled = false
  private complete = false
  private paused = false
  private failed = false
  /** ★ 2026-09-25 P0：远端上报的失败原因（Tabby FileTransfer 契约），空串=未上报。见 setStatus() */
  private status = ''
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
    // ★ 2026-09-21：fileSize 传 -1 表示「大小未知」（stat 失败的下载）——
    //   不得在构造/写入时判定完成，由下载结束的收尾路径显式 _markComplete/_markFailed
    // 如果续传偏移量等于文件总大小，则标记为已完成
    if (this.fileSize > 0 && this.resumeOffset >= this.fileSize) {
      this.complete = true
    }
    // 空文件直接标记为已完成（-1 未知大小不在此列）
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
        // ★ 2026-09-20 P0-3 审计修复：校验 .tmp 实际大小与续传偏移一致，
        //   防止磁盘满/截断后 resumeAt > 实际大小 → write 空 buffer 创建稀疏区域 → 文件含未初始化数据
        try {
          const actualStat = await fs.promises.stat(this.targetPath)
          if (actualStat.size < resumeAt) {
            log.warn(`Resume offset mismatch: .tmp actual=${actualStat.size} < resumeAt=${resumeAt}, truncating to actual`)
            await this.fd.truncate(actualStat.size)
            this.completedBytes = actualStat.size
            this.completedBytesForProgress = actualStat.size
          } else if (actualStat.size > resumeAt) {
            // .tmp 比预期大（如上次写入后未更新 offset），truncate 到正确位置
            await this.fd.truncate(resumeAt)
          }
        } catch {
          // stat 失败则按原逻辑 truncate
          try { await this.fd.truncate(resumeAt) } catch { /* ignore */ }
        }
      }
    }
    await this.fd.write(buffer, 0, buffer.length, this.completedBytes)
    this.completedBytes += buffer.length
    this.increaseProgress(buffer.length)
    // ★ 2026-09-26 P0：下载方向打点。分块通道与整文件通道都经此处落盘，
    //   是「通道确实在搬运数据」最权威的证据来源（心跳据此放弃误判死亡）。
    markTransferProgress()
    // ★ 2026-08-26：硬上限——超过声明 fileSize 时拒绝继续写（防谎报更小 size）
    if (this.fileSize > 0 && this.completedBytes > this.fileSize) {
      throw new Error(`Download exceeded declared size: wrote=${this.completedBytes} declared=${this.fileSize}`)
    }
    // ★ 2026-09-25 P2-1 修复：大小未知（-1，stat 失败）时没有声明大小可依据 →
    //   加绝对上限，防止异常/恶意服务器无界推送把磁盘写满
    if (this.fileSize < 0 && this.completedBytes > UNKNOWN_SIZE_HARD_CAP_BYTES) {
      throw new Error(`Unknown-size download exceeded hard cap: wrote=${this.completedBytes} cap=${UNKNOWN_SIZE_HARD_CAP_BYTES}`)
    }
    // 检查是否已写完（★ 2026-09-21：fileSize=-1 未知大小不参与完成判定，等收尾路径显式标记）
    if (this.fileSize >= 0 && this.completedBytes >= this.fileSize) {
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

  getStatus(): string {
    return this.status
  }

  /**
   * ★ 2026-09-25 P0：**这是本轮下载失败一直定位不到的原因**。
   *   Tabby 的 FileTransfer 基类（tabby-core api/platform.ts 第 57 行）带 setStatus/getStatus，
   *   而本插件早期的 transfer 对象是鸭子类型、未继承它。tabby-ssh 的
   *   SFTPSession.download()（resources/builtin-plugins/tabby-ssh/src/session/sftp.ts 第 150-153 行）：
   *
   *     } catch (e) {
   *         transfer.setStatus(e instanceof Error ? e.message : String(e))  // ← 缺此方法即 TypeError
   *         transfer.cancel()                                              // ← 置 cancelled
   *         throw e
   *     }
   *
   *   ① 缺 setStatus：第 1 步自身抛 TypeError → **真实错误被顶掉**（日志里只剩
   *      "Download failed (raw): <path> :: transfer.setStatus is not a function"），`throw e` 永不执行；
   *   ② 只补 setStatus 还不够：第 2 步 cancel() 会执行，本文件 catch 的 isCancelled() 分支
   *      会把真实错误当成「用户取消」静默吞掉（只 unlink 临时文件）。
   *
   *   故此处同时置 failed=true 作为「远端确实报错」标记，调用方 catch 必须**优先**判它。
   */
  setStatus(status: string): void {
    this.status = String(status ?? '')
    if (this.status) {
      this.failed = true
      log.error('[transfer] remote reported failure (download):', this.targetPath, this.status)
    }
  }

  /** 外部标记传输失败（raw stream 读错误等）；UI 定时器据此记为失败并移除，避免误报成功或挂死 */
  async _markFailed(): Promise<void> {
    this.failed = true
    await this.close()
  }

  /**
   * ★ 2026-09-25 P0：清掉 Tabby `SFTPSession.download()` 失败路径顺手置上的标记。
   *   其 catch 会依次 `transfer.setStatus(原因)` → `transfer.cancel()`（置 cancelled + 关 fd），
   *   这些都不是用户操作；不清掉的话后续 write() 会以 'Transfer cancelled' 直接抛错。
   *   （fd 已被关也没关系——`write()` 见 fd=null 会自动重开并按 completedBytes 校准。）
   */
  _clearTransferFailureMarks(): void {
    this.cancelled = false
    this.paused = false
    this.failed = false
    this.status = ''
  }

  /**
   * ★ 2026-09-25 P0：超时后**整文件重试**前归零进度。
   *   复用同一 dl 对象（同一进度条目、同一 cancelRef/onTransfer 登记），避免重复条目；
   *   fd 已被上面的 cancel() 关闭，重试时 `write()` 会以 'w' 重新创建 .tmp。
   */
  _resetForFullRetry(): void {
    this._clearTransferFailureMarks()
    this.complete = false
    this.completedBytes = 0
    this.completedBytesForProgress = 0
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


/**
 * ★ 2026-09-25：把 Error 压成「code + message」文本。
 *   Tabby 的文件日志（log.txt）只写出第一个字符串参数——`log.error('X', path, e)` 里的
 *   path 与 e 会被整体丢弃，导致线上传输失败**完全无法定位**。故所有失败日志改为
 *   把详情内联进首参字符串，用本函数拼装。
 */
export function errText(e: unknown): string {
  const err = e as { code?: unknown; message?: unknown } | null | undefined
  const code = err?.code != null ? String(err.code) : ''
  const msg = err?.message != null ? String(err.message) : String(e)
  return code ? `${code} ${msg}` : msg
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

/**
 * 取消 TransferCancelRef 上登记的全部在途传输。
 * 注：cancel() 内部先同步置 cancelled 再 await close()，所以「停止写入」在调用瞬间即生效，
 * 无需 await；但 cancel() 是 async，返回的 Promise 若 reject 是 try/catch 抓不到的
 * （catch 只能捕获同步抛出），会变成 unhandled rejection。
 * ★ 2026-09-21 P2 修复：显式挂 .catch() 吞掉清理阶段的失败。
 */
export function cancelAllInFlight(ref: TransferCancelRef | null | undefined): void {
  if (!ref) return
  const list = ref.active ? [...ref.active] : (ref.current ? [ref.current] : [])
  for (const t of list) {
    try {
      const r = typeof t?.cancel === 'function' ? t.cancel()
        : typeof t?.destroy === 'function' ? t.destroy()
        : undefined
      void Promise.resolve(r).catch((e: unknown) => log.warn('cancelAllInFlight: cancel failed', e))
    } catch (e) { log.warn('cancelAllInFlight: cancel threw', e) }
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
  /** ★ 2026-09-21 P1：并发同名上传守卫——两个并发上传写同一 .tabby-upload 会交叉损坏内容 */
  activeUploadTargets?: Set<string>
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
  /** ★ 2026-09-26：外部中止信号（tar 打包通道的 shouldAbort）——分块通道每块检查一次，
   *   命中即刻收手，不必等到下一次整文件超时才察觉用户已取消 */
  shouldAbort?: () => boolean
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
  // ★ 2026-09-21 P1：并发同名上传守卫（与下载方向 activeDownloadTargets 对称）——
  //   并发队列（多选/拖拽，默认并发 3）中不同源目录的同名文件会得到同一 remoteTarget，
  //   冲突检测都看到「不存在」后并发开传，两个 raw 流写同一 .tabby-upload 临时文件
  //   → 内容交叉损坏。第二个直接判失败，由用户重试（冲突对话框或稍后重传）。
  if (ctx.activeUploadTargets?.has(remotePath)) {
    log.warn('skip duplicate concurrent upload:', remotePath)
    return false
  }
  ctx.activeUploadTargets?.add(remotePath)
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
    // ★ 2026-09-25 P0：**必须先判「远端上报过错误」**。tabby-ssh 的 upload() 在 catch 里
    //   依次 setStatus(msg) → cancel() → throw e；补上 setStatus 后 cancel() 会被执行，
    //   若先命中下面的 isCancelled() 分支，真实错误就会被当成「用户取消」静默吞掉。
    //   本插件自己的 _markFailed() 不写 status，故 (isFailed && status) 能精确区分二者。
    if (up.isFailed() && up.getStatus()) {
      log.error(`Upload failed: ${remotePath} :: ${up.getStatus()}`)
      if (opts.track) ctx.onUploadError?.(remotePath, localPath, new Error(up.getStatus()))
      return false
    }
    // ★ 2026-07-25 B11：用户主动取消（read() 抛错中断）不算失败，但也不是"传输成功"
    if (up.isCancelled() || up.isPaused()) {
      if (opts.track) log.info('Upload cancelled/paused:', localPath)
      return false
    }
    // ★ 2026-09-25：内联错误详情（同下载侧）
    log.error(`${opts.track ? 'Upload failed' : 'Upload failed (raw)'}: ${remotePath} :: ${errText(e)}`)
    if (opts.track) ctx.onUploadError?.(remotePath, localPath, e)
    return false
  } finally {
    ctx.activeUploadTargets?.delete(remotePath)
    if (opts.exposeCancel && ctx.cancelRef) unregisterCancelRef(ctx.cancelRef, up)
  }
}

/** ★ 2026-09-25 P0：下载遇 russh 请求超时时的重试次数（不含首次） */
const DOWNLOAD_TIMEOUT_RETRIES = 2
/** ★ 2026-09-25 P0：重试前等待——给服务端喘息（磁盘 flush / 并发拥挤消退） */
const DOWNLOAD_RETRY_DELAY_MS = 1500

/**
 * ★ 2026-09-26 P0：自管分块下载用的打开模式常量。
 *   russh-sftp 的 OpenFlags::READ = 0x1（只读）。插件不依赖 russh 包（package.json 无此依赖），
 *   故此处硬编码；若模式不对，open 会失败或 read 立即报错 → 自动降级回整文件通道，无副作用。
 */
const RUSSH_OPEN_READ = 0x0001
/**
 * ★ 2026-09-26 P0（第二轮，取代「4 次即放弃」）：单次 read 超时后的重试**不设次数上限**，
 *   改为按「本文件连续零字节进展」的时间上限兜底。
 *
 * **为什么必须去掉次数上限**：4 次 × ~10s ≈ 40s 的耐心，对一台被 CPU 积分/云盘 IO 卡住的
 *   ECS 远远不够（实测服务端跑打包时零字节停顿 30~60s 是常态，日志里连 heartbeat 探测一起超时）。
 *   而**同机同目录用 Electerm 能跑完** —— 差别就在 ssh2 没有 per-request 硬超时，它**只是等**。
 *   这里等价地「等到不耐烦为止」：只有连续 4 分钟一个字节都没收到才判死。
 *
 * **安全性不变**：read 超时意味着该次响应未达、handle 位置不推进，重读同一块幂等，
 *   已落盘字节一分不丢；万一「响应丢失但位置已推进」，少读的字节会被收尾的
 *   Size mismatch 校验拦下（不会静默损坏）。故放大重试次数不引入新的正确性风险。
 */
const READ_STALL_LIMIT_MS = 240_000
/** ★ 2026-09-26 P0：单个 read 请求超时后的首次重试间隔 */
const READ_RETRY_DELAY_MS = 350
/** ★ 2026-09-26 P0：重试间隔退避上限（连续失败越多等得越久，别对着已卡死的服务端每秒敲一次） */
const READ_RETRY_DELAY_MAX_MS = 3000
/** ★ 2026-09-26 P0：重试日志节流——前 N 次逐条打，之后每 M 次打一条（日志爆量会淹没有效信息） */
const READ_RETRY_LOG_FIRST = 3
const READ_RETRY_LOG_EVERY = 5

/**
 * ★ 2026-09-25 P0：判断是否属 russh 的「请求超时」。
 *   Tabby 的 SFTP 底层是 russh（napi 绑定，russh-sftp 3.0.0），对**每个 SFTP 请求**都有
 *   固定超时（实测 ~10s），超时抛 `io::Error{ kind: TimedOut }`，经 napi 传到 JS 后 message 形如
 *   `Custom { kind: TimedOut, error: Timeout }`（实测日志原文）。
 */
export function isTimeoutLike(e: unknown): boolean {
  const s = typeof e === 'string'
    ? e
    : `${(e as any)?.code ?? ''} ${(e as any)?.message ?? ''} ${typeof e === 'object' && e !== null ? errText(e) : String(e)}`
  return /timed?\s*out|etimedout/i.test(s)
}

/** ★ 2026-09-26 P0：分块下载结果四态 */
type ChunkedReadOutcome =
  | { kind: 'done' }
  /** 宿主不支持句柄式读取（或大小未知）→ 调用方回退整文件通道 */
  | { kind: 'unsupported' }
  | { kind: 'aborted'; reason: 'paused' | 'cancelled' | 'external' }
  | { kind: 'failed'; error: unknown }

/**
 * ★ 2026-09-26 P0：自管分块下载（`session.open` → `handle.read()` 循环，单次 read 超时只重试该次）。
 *
 * **为什么不复用 `session.download()`**：它是**整文件**循环，任何一次 read 抛错都会让整个文件的下载
 * 中断（tabby-ssh 的 catch 还会顺手 setStatus + cancel）。既有对策是「.tmp 收满即按完成」+
 * 「整文件重试」，但实测 84.9MB 在 1.5MB/s 下要 ~57s，暴露窗口远超 russh 的 ~10s 单请求超时，
 * 整文件重试等于把同一窗口重放（现场日志：retry 1/2 → retry 2/2 → giving up 三连超时）。
 * 改为在**单请求粒度**重试后，一次抖动只损失一次 256KB 读，既丢不了已下字节、也不用重头再来。
 *
 * ★ 2026-09-26 第二轮：单请求重试**去掉次数上限**（原 4 次 ≈ 40s 就放弃整个文件）。
 *   实测 4 次的耐心不够 —— 服务端被自己的 gzip 打包/CPU 积分限流压住时，零字节停顿 30~60s
 *   是常态，于是「每次都在第 4 次左右撞上放弃点」= 必失败。而同机同目录 Electerm 能跑完，
 *   差别就是 ssh2 没有 per-request 硬超时、它**只是等**。现改为：只要不是暂停/取消/外部中止，
 *   就一直重试（指数退避到 3s 上限），仅当**连续 4 分钟一个字节都没收到**才判死。
 *
 * **协议安全性**：russh 的 read 沿 handle 位置顺序推进，服务端「未回响应」时位置不推进，
 * 所以重读同一块是幂等的；万一响应丢失而位置已推进，后果是**少读**一块 ——
 * 已知大小时会被收尾的 Size mismatch 校验拦下（不会静默损坏）。
 * 大小未知（-1）无从察觉错位，故本通道直接返回 `unsupported` 交回整文件通道，不引入新风险。
 */
async function downloadViaChunkedRead(
  session: SFTPSessionLike,
  remotePath: string,
  dl: LocalPathFileDownload,
  declaredSize: number,
  externalAbort?: () => boolean,
): Promise<ChunkedReadOutcome> {
  // 大小未知 → 无法用 size 校验发现错位，交回整文件通道（保持既有语义）
  if (!(declaredSize > 0)) return { kind: 'unsupported' }
  const openFn = session?.open
  if (typeof openFn !== 'function') return { kind: 'unsupported' }

  let handle: { read?: () => Promise<Uint8Array>; close?: () => Promise<void> } | null = null
  try {
    try {
      handle = await openFn.call(session, remotePath, RUSSH_OPEN_READ)
    } catch (e) {
      // 打开失败（模式不兼容/权限/服务端拒绝）：交回整文件通道，其错误分类更完整
      log.warn(`[download] chunked open failed, falling back to whole-file transfer: ${remotePath} :: ${errText(e)}`)
      return { kind: 'unsupported' }
    }
    const readFn = handle?.read
    if (!handle || typeof readFn !== 'function') return { kind: 'unsupported' }

    // ★ 2026-09-26 P0：本文件最近一次「成功收到字节」的时刻 —— 耐心重试的兜底依据。
    //   只有连续 READ_STALL_LIMIT_MS 一个字节都没收到才判死，避免把「服务端慢」当「服务端死」。
    let lastByteAt = Date.now()
    let retryCount = 0

    for (;;) {
      if (dl.isPaused()) return { kind: 'aborted', reason: 'paused' }
      if (dl.isCancelled()) return { kind: 'aborted', reason: 'cancelled' }
      if (externalAbort?.()) return { kind: 'aborted', reason: 'external' }
      // 已收满声明大小：不必再等 EOF（少一次请求，也避免服务端迟迟不返 EOF 时挂住）
      if (dl.isComplete()) return { kind: 'done' }

      let chunk: Uint8Array | null = null
      let lastErr: unknown = null
      // ★ 2026-09-26 P0：内层不再用固定次数上限，只由「零字节进展时长」决定退出
      for (;;) {
        try {
          chunk = await readFn.call(handle)
          lastErr = null
          break
        } catch (e) {
          lastErr = e
          if (dl.isPaused() || dl.isCancelled()) return { kind: 'aborted', reason: dl.isPaused() ? 'paused' : 'cancelled' }
          // 非「请求超时」类错误（句柄失效 / 权限 / 协议错）重试无意义，交回调用方分类
          if (!isTimeoutLike(e)) break
          const stalledMs = Date.now() - lastByteAt
          if (stalledMs >= READ_STALL_LIMIT_MS) break
          retryCount++
          if (retryCount <= READ_RETRY_LOG_FIRST || retryCount % READ_RETRY_LOG_EVERY === 0) {
            log.warn(
              `[download] read timed out (retry ${retryCount}, no data for ${Math.round(stalledMs / 1000)}s), keeping partial data: ${remotePath}`,
            )
          }
          // 指数退避到上限：抖动过去就恢复，真卡住也不会把服务端敲爆
          const backoff = Math.min(READ_RETRY_DELAY_MS * 2 ** Math.min(retryCount - 1, 4), READ_RETRY_DELAY_MAX_MS)
          await new Promise(r => setTimeout(r, backoff))
        }
      }
      if (lastErr != null || chunk === null) {
        log.error(
          `[download] chunked read failed (${retryCount} retries, no data for ${Math.round((Date.now() - lastByteAt) / 1000)}s): ${remotePath} :: ${errText(lastErr)}`,
        )
        return { kind: 'failed', error: lastErr }
      }
      if (!chunk.length) return { kind: 'done' } // EOF
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      try {
        await dl.write(buf)
      } catch (e) {
        // dl.write 的失败必须在此收口：分块通道不经过 Tabby 的 download() catch，
        // 没人替我们把「暂停/取消中断」「超声明大小」「本地磁盘错误」分类（原先会直接冒泡）
        if (dl.isPaused()) return { kind: 'aborted', reason: 'paused' }
        if (dl.isCancelled()) return { kind: 'aborted', reason: 'cancelled' }
        log.error(`[download] chunked write failed: ${remotePath} :: ${errText(e)}`)
        return { kind: 'failed', error: e }
      }
      lastByteAt = Date.now() // 有字节落盘 → 重新计时
    }
  } finally {
    try { await handle?.close?.() } catch { /* ignore */ }
  }
}

/** ★ 2026-09-26 P0：静默删除临时文件（失败残留清理；不存在/被占用都不抛） */
async function unlinkQuiet(tmpPath: string): Promise<void> {
  try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
}

/**
 * ★ 2026-09-25 P0（远程→本地下载反复失败的真因与对策）
 *
 * **现象（实测日志）**：`Download failed: <path> :: Custom { kind: TimedOut, error: Timeout }`；
 *   同一时刻 readdir/stat/readlink（响应体极小）全部正常 —— 超时只发生在**要搬运数据**的请求上。
 *   传输记录还显示 7.7MB/s × 11.2s ≈ 86MB：**数据其实几乎收完了，失败发生在收尾阶段**
 *   （russh-sftp 3.0.0 的 read/EOF/close 之一超时）。
 *
 * **机理**：russh-sftp 对每个 SFTP 请求有固定超时（~10s）。ECS 云盘抖动、或服务端同时在跑
 *   `tar czf` / `cp` / `du`（本插件的打包加速与扫描、以及用户自己的粘贴复制都会造成）时，
 *   某个 read 就会超时。Tabby 原生 SFTP 面板是**严格串行**（一次只读一个文件、无打包无扫描），
 *   压力小得多；本插件并发 3 + tar/du/扫描把压力放大，所以更容易触发。
 *
 * **对策（两层，且都不依赖 russh 不存在的 seek 能力）**：
 *   1. **超时后先看 `.tmp` 是否其实已经收完**（`sz > 0 && tmpStat.size === sz`）——
 *      收尾阶段超时时数据往往已全部落盘，直接按完成处理（走正常 rename），
 *      避免把 86MB 已下好的数据白白删掉重下；
 *   2. 否则**整文件重试**（最多 `DOWNLOAD_TIMEOUT_RETRIES` 次，间隔 `DOWNLOAD_RETRY_DELAY_MS`）。
 *      注意不能用「raw 偏移续读」：russh 版 Tabby 的 SFTP 是句柄式
 *      （`session.open()` → `SFTPFileHandle.read()`，顺序读、**无 seek**），
 *      本文件早期版本照搬 ssh2 回调式 API 的 `resumeDownloadViaRaw` 因此从未生效
 *      （同因：协调器 `_resumeWithRawRead` 的 `Raw SFTP open/read not available` 也是一直静默失效）。
 *
 *   两条路径都复用**同一个 dl 对象**（先 `_resetForFullRetry()` 清状态），避免重复的进度条目。
 */

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
  /** ★ 2026-09-26 P0：cancelRef 注销统一挪到最外层 finally（见函数末尾）。
   *   原实现把它放在收尾 try 的 finally 里，而「超时放弃 / 非超时硬错误」是直接 throw
   *   跳过收尾 try 的 ⇒ 登记在 ctx.cancelRef.active 里的 transfer 永不注销：
   *   既强引用 dl 闭包，又会被后续「取消全部在途」广播到已结束的传输上。 */
  let dlRef: LocalPathFileDownload | null = null
  try {
    let resolvedSize = size
    // ★ 2026-09-26 P0：`undefined` 与 `<0`（即 -1「未知」哨兵）都必须真去取一次大小。
    //   上游有多个入口会传「未知」——包括冲突队列的 `remoteFileSize`（来自
    //   `entry.size ?? 0` / `remoteMeta.size`，可能为 undefined）——若这里直接采信 -1，
    //   分块通道会因「大小未知」被判 unsupported，下载退化成整文件通道（必死）。
    //   另：取值换用带重试版本——单次 stat 超时（通道繁忙时极易发生）同样会丢掉分块通道，
    //   见 statSizeWithRetry 注释。
    if (resolvedSize === undefined || resolvedSize < 0) {
      resolvedSize = await statSizeWithRetry(ctx.session, remotePath)
    }
    // ★ 2026-09-21：stat 不可用/失败时用 -1 表示「大小未知」——
    //   此前收成 0 会被 trackTransfer 当空文件立即记「成功」（传输实际还在跑，日志已谎报），
    //   且 fileSize=0 的适配器构造即 complete，条目一闪而过。
    let sz = resolvedSize ?? -1
    const tmpPath = localPath + '.tmp'

    // ★ 2026-09-26 P0：**调用方声称空文件时，也向远端复核一次**。上游存在把「未知」写成 0 的入口
    //   （拖拽落点 `size: entry.size ?? 0`、下载用例 `file.size ?? 0`），此时若直接短路，
    //   会在「远端其实是个 84MB 文件」的情况下**只落一个 0 字节文件并返回成功**——
    //   静默数据丢失，用户看到的是「下载成功了但文件是空的」。一次小 stat 的代价远低于此风险。
    if (sz === 0 && size !== undefined && size === 0) {
      const confirmed = await statSizeWithRetry(ctx.session, remotePath)
      if (confirmed > 0) {
        log.warn(`[download] caller declared size=0 but remote reports ${confirmed} bytes, downloading with real size:`, remotePath)
        sz = confirmed
      }
    }

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

    // ★ 2026-09-25 P0：同一 dl 对象跨（可能的）重试复用——重置内部状态即可，
    //   避免重新 trackTransfer 产生重复进度条目
    const dl = new LocalPathFileDownload(tmpPath, mode ?? 0o644, sz)
    dlRef = dl
    if (opts.track && ctx.trackTransfer) {
      ctx.trackTransfer(dl, 'download', remotePath, localPath, opts.logOperation)
    }
    if (opts.exposeCancel && ctx.cancelRef) registerCancelRef(ctx.cancelRef, dl)
    opts.onTransfer?.(dl)

    // ★ 2026-09-26 P0：优先走「自管分块读取」——单次 read 请求超时只重试该次（不设次数上限，
    //   连续 4 分钟零字节进展才判死），已落盘字节不丢、不必整文件从头再来。
    //   宿主无句柄式 open()、或文件大小未知（无从检出读错位）时返回
    //   unsupported，回退下方整文件通道，完整保留其超时重试与「.tmp 已收满」兜底能力。
    const chunked = await downloadViaChunkedRead(ctx.session, remotePath, dl, sz, opts.shouldAbort)
    if (chunked.kind === 'failed') {
      // 分块通道已耐心重试到「连续 4 分钟零字节进展」仍失败 —— 此刻服务端已被证明完全无响应，
      // 再退回整文件通道只是把同一处境重放一遍，如实记失败并清掉 .tmp 残留即可
      log.error(`${opts.track ? 'Download failed' : 'Download failed (raw)'}: ${remotePath} :: ${errText(chunked.error)}`)
      await unlinkQuiet(tmpPath)
      try { await dl._markFailed?.() } catch { /* ignore */ }
      if (opts.track) ctx.onDownloadError?.(remotePath, chunked.error)
      return false
    }
    if (chunked.kind === 'aborted') {
      // 暂停：保留 .tmp 供续传；取消 / 外部中止：清掉临时文件
      if (chunked.reason === 'paused') {
        if (opts.track) log.info('Download paused:', remotePath)
        return false
      }
      await unlinkQuiet(tmpPath)
      return false
    }
    if (chunked.kind === 'unsupported') {
      // ── 整文件通道（宿主无 open()，或大小未知时保持既有语义） ──
      let timeoutAttempts = 0
      for (;;) {
        try {
          await ctx.session.download(remotePath, dl)
          break
        } catch (dlErr) {
          // ★ 2026-09-25 P0：区分「用户主动暂停/取消」与「russh 请求超时」。
          //   注意 Tabby 的失败路径会顺手 transfer.cancel()，不能用 isCancelled() 判断用户意图，
          //   要看 status 文案（我们的 cancel()/pause() 会写入 'Transfer cancelled'/'Transfer paused'）。
          const status = dl.getStatus()
          const userAbort = dl.isPaused() || /cancel|pause/i.test(status)
          if (userAbort) throw dlErr
          if (!(isTimeoutLike(dlErr) || isTimeoutLike(status))) {
            // ★ 2026-09-26 P0：非超时硬错误 = 彻底失败，先清 .tmp 再抛（原先直接 throw 会留残留）
            await unlinkQuiet(tmpPath)
            throw dlErr
          }

          // ★ 第一优先：**数据可能其实已经全部收到了**（实测 7.7MB/s×11.2s≈86MB 才报超时，
          //   即失败发生在收尾阶段）——.tmp 大小与远端声明大小一致就直接按完成处理，
          //   走下面的正常 rename，绝不能把已经下好的 86MB 删掉重下。
          const tmpStat = await fsPromises.stat(tmpPath).catch(() => null)
          if (tmpStat && sz > 0 && tmpStat.size === sz) {
            log.warn(`[download] timed out but all ${sz} bytes already received, completing:`, remotePath)
            dl._clearTransferFailureMarks()
            try { await dl._markComplete?.() } catch { /* ignore */ }
            break
          }

          if (timeoutAttempts >= DOWNLOAD_TIMEOUT_RETRIES) {
            log.error(`[download] request timed out ${timeoutAttempts + 1} times, giving up:`, remotePath)
            // ★ 2026-09-26 P0：放弃前清掉 .tmp（原先 throw 跳过收尾清理，磁盘残留 xxx.tmp）
            await unlinkQuiet(tmpPath)
            throw dlErr
          }
          timeoutAttempts++
          log.warn(`[download] request timed out (retry ${timeoutAttempts}/${DOWNLOAD_TIMEOUT_RETRIES}), restarting file:`, remotePath)
          dl._resetForFullRetry()
          await unlinkQuiet(tmpPath)
          await new Promise(r => setTimeout(r, DOWNLOAD_RETRY_DELAY_MS))
        }
      }
    }
    // ↓ 下载（分块 / 整文件通道）结束后：完整性校验 + 原子改名落盘
    try {
      // B6：改名前二次校验，已取消则不落盘
      if (dl.isCancelled()) {
        await unlinkQuiet(tmpPath)
        return false
      }
      // ★ 2026-09-26 P0：显式关 fd 再 rename。分块通道不经 Tabby 的 transfer.close()，
      //   fd 会一直开着；Windows 上 rename 一个仍被打开的文件可能直接失败（EPERM/EBUSY）。
      try { await dl.close() } catch { /* ignore */ }
      const localStat = await fsPromises.stat(tmpPath).catch(() => null)
      // ★ 2026-08-26 M3：未知大小（sz===0 且非显式空文件）时至少要求本地有可读 stat
      if (!localStat) throw new Error('Download integrity check failed: missing local temp file')
      if (sz > 0 && localStat.size !== sz) {
        throw new Error(`Size mismatch: remote=${sz} local=${localStat.size}`)
      }
      await fsPromises.rename(tmpPath, localPath)
      // ★ 2026-09-21：未知大小（sz=-1）的适配器不会自行置 complete，在此显式收尾，
      //   让 UI tick 能按完成移除条目并记成功
      try { await dl._markComplete?.() } catch { /* ignore */ }
      if (opts.track) log.info('Download completed:', remotePath)
      return true
    } catch (e) {
      // ★ 2026-09-25 P0：**必须先判「远端上报过错误」**。tabby-ssh 的 download() 在 catch 里
      //   依次 setStatus(msg) → cancel() → throw e；补上 setStatus 后 cancel() 会被执行，
      //   若先判下面的 isPaused()/isCancelled() 分支，真实错误就会被当成「暂停/取消」静默吞掉
      //   （只 unlink 临时文件后 return false，日志里什么都看不到）。
      //   本插件自己的 _markFailed() 不写 status，故 (isFailed && status) 能精确区分二者。
      if (dl.isFailed() && dl.getStatus()) {
        log.error(`Download failed: ${remotePath} :: ${dl.getStatus()}`)
        try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
        try { await dl._markFailed?.() } catch { /* ignore */ }
        if (opts.track) ctx.onDownloadError?.(remotePath, new Error(dl.getStatus()))
        return false
      }
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
      // ★ 2026-09-25：内联错误详情（Tabby 文件日志只写首参，多参数会被丢弃）
      log.error(`${opts.track ? 'Download failed' : 'Download failed (raw)'}: ${remotePath} :: ${errText(e)}`)
      await unlinkQuiet(tmpPath)
      // ★ 2026-09-21：未知大小（sz=-1）下载失败时显式标 failed，避免条目挂到 stall 超时
      try { await dl._markFailed?.() } catch { /* ignore */ }
      if (opts.track) ctx.onDownloadError?.(remotePath, e)
      return false
    }
  } finally {
    // ★ 2026-09-26 P0：注销放在最外层 —— 超时放弃 / 非超时硬错误都是 throw 跳出的，
    //   原先挂在收尾 try 的 finally 上会被整段跳过，登记的 transfer 永久残留在
    //   cancelRef.active 里（强引用 dl 闭包，且被后续「取消全部在途」误广播）
    if (opts.exposeCancel && dlRef && ctx.cancelRef) unregisterCancelRef(ctx.cancelRef, dlRef)
    ctx.activeDownloadTargets.delete(localPath)
  }
}


/**
 * 功能描述：SFTP+ transfer-adapters 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — B10 下载/写临时文件失败清理临时目录；B8 BufferCollectingDownload 加 maxBytes 溢出硬上限
 * 修改人：DD1024z + Composer
 * 修改时间：2026-07-25 — 收敛面板内 _doUpload/_doDownload 字节级逻辑到本模块（消除双轨）
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — B11 上传取消 read() 抛错中断（防 tabby-ssh 把空块当传完、
 *   将半截 .tabby-upload 改名成原始文件名）；取消不再误报"上传失败"
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — B13 初始上传改走 raw stream 写 .tabby-upload 临时文件（uploadViaRawToTemp）：
 *   暂停只结束流保留临时文件（供续传）、取消删临时文件保留原文件，彻底规避 tabby-ssh upload() 语义陷阱
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
    const buf = Buffer.alloc(256 * 1024)
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
    //   导致"已取消/面板已销毁"却得到文件。暂停（paused）路径在 _doDownload 中会保留 .tmp，不受影响。
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
      // 续传模式使用 r+（不截断），否则使用 w（新建/截断）
      const flags = this.resumeOffset > 0 ? 'r+' : 'w'
      this.fd = await fs.promises.open(this.targetPath, flags)
      // 续传时 seek 到指定位置
      if (this.resumeOffset > 0) {
        await this.fd.write(Buffer.alloc(0), 0, 0, this.resumeOffset)
        // 实际上使用 ftruncate + seek 更好
        // 先调整文件大小到续传点（如果当前文件小于续传点则补零）
        try {
          await this.fd.truncate(this.resumeOffset)
        } catch { /* ignore */ }
      }
    }
    await this.fd.write(buffer, 0, buffer.length, this.completedBytes)
    this.completedBytes += buffer.length
    this.increaseProgress(buffer.length)
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

export interface TransferCancelRef {
  current: any
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
      const r: any = rawSftp.rename(tempPath, remotePath)
      if (r && typeof r.then === 'function') r.then(() => { up.close().catch(() => {}); resolve() }).catch((e: unknown) => { safeUnlinkTemp(); up.close().catch(() => {}); reject(e) })
      else { up.close().catch(() => {}); resolve() }
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

export async function uploadLocalFile(
  ctx: ByteTransferContext,
  remotePath: string,
  localPath: string,
  opts: UploadByteOptions = {},
): Promise<void> {
  const up = new LocalPathFileUpload(localPath)
  if (opts.track && ctx.trackTransfer) {
    ctx.trackTransfer(up, 'upload', remotePath, localPath, opts.logOperation)
  }
  if (opts.exposeCancel && ctx.cancelRef) ctx.cancelRef.current = up
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
    // ★ 2026-07-25 B13：raw stream 取消时以 resolve() 结束（不抛错），据 cancelled 判定
    if (up.isCancelled()) {
      if (opts.track) log.info('Upload cancelled:', localPath)
      return
    }
    if (opts.track) log.info('Upload completed:', localPath)
  } catch (e) {
    // ★ 2026-07-25 B11：用户主动取消（read() 抛错中断）不算失败，静默返回
    if (up.isCancelled()) {
      if (opts.track) log.info('Upload cancelled:', localPath)
      return
    }
    log.error(opts.track ? 'Upload failed' : 'Upload failed (raw)', remotePath, e)
    if (opts.track) ctx.onUploadError?.(remotePath, localPath, e)
  } finally {
    if (opts.exposeCancel && ctx.cancelRef) ctx.cancelRef.current = null
  }
}

/** 下载远程文件到本地路径（.tmp 原子改名；不含冲突检测） */
export async function downloadRemoteFile(
  ctx: ByteTransferContext,
  remotePath: string,
  localPath: string,
  mode?: number,
  size?: number,
  opts: DownloadByteOptions = {},
): Promise<void> {
  if (ctx.activeDownloadTargets.has(localPath)) {
    log.warn(opts.exposeCancel ? 'skip duplicate concurrent download (raw):' : 'skip duplicate concurrent download:', localPath)
    return
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
    if (sz === 0 && size !== undefined) {
      try {
        const fd = await fsPromises.open(tmpPath, 'w')
        await fd.close()
        await fsPromises.rename(tmpPath, localPath)
      } catch { /* ignore */ }
      if (opts.track && ctx.trackTransfer) {
        const dl = new LocalPathFileDownload(localPath, mode ?? 0o644, 0)
        ctx.trackTransfer(dl, 'download', remotePath, localPath, opts.logOperation)
      }
      return
    }

    const dl = new LocalPathFileDownload(tmpPath, mode ?? 0o644, sz)
    if (opts.track && ctx.trackTransfer) {
      ctx.trackTransfer(dl, 'download', remotePath, localPath, opts.logOperation)
    }
    if (opts.exposeCancel && ctx.cancelRef) ctx.cancelRef.current = dl
    opts.onTransfer?.(dl)

    try {
      await ctx.session.download(remotePath, dl)
      // B6：改名前二次校验，已取消则不落盘
      if (dl.isCancelled()) {
        try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
        return
      }
      const localStat = await fsPromises.stat(tmpPath).catch(() => null)
      if (localStat && localStat.size !== sz && sz > 0) {
        throw new Error(`Size mismatch: remote=${sz} local=${localStat.size}`)
      }
      await fsPromises.rename(tmpPath, localPath)
      if (opts.track) log.info('Download completed:', remotePath)
    } catch (e) {
      // 暂停：保留 .tmp 供续传
      if (dl.isCancelled() && (dl as any).paused) {
        if (opts.track) log.info('Download paused:', remotePath)
        return
      }
      if (dl.isCancelled()) {
        try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
        return
      }
      log.error(opts.track ? 'Download failed' : 'Download failed (raw)', remotePath, e)
      try { await fsPromises.unlink(tmpPath) } catch { /* ignore */ }
      if (opts.track) ctx.onDownloadError?.(remotePath, e)
    } finally {
      if (opts.exposeCancel && ctx.cancelRef) ctx.cancelRef.current = null
    }
  } finally {
    ctx.activeDownloadTargets.delete(localPath)
  }
}


/**
 * 本地文件传输适配器
 * 功能描述：实现 tabby-core 的 FileUpload/FileDownload 接口，用于本地文件传输
 *           支持暂停/继续 + 断点续传
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Claude
 * 修改时间：2026-06-22 — 修复空文件传输进度卡0%且日志不记录的问题：添加isComplete()标记
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-25 — 添加暂停/继续/断点续传支持
 */
import * as fs from 'fs'
import * as path from 'path'

export class LocalPathFileUpload {
  private fd: number | null = null
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
    // 空文件直接标记为已完成（没有数据可读取，read() 不会产生实际传输）
    if (this.getSize() === 0) {
      this.complete = true
      this.completedBytesForProgress = 0
    }
  }

  getName(): string {
    return path.basename(this.filePath)
  }

  getMode(): number {
    return 0o644
  }

  getSize(): number {
    try {
      return fs.statSync(this.filePath).size
    } catch {
      return 0
    }
  }

  async read(): Promise<Buffer> {
    if (this.cancelled) {
      return Buffer.alloc(0)
    }
    if (this.fd === null) {
      this.fd = fs.openSync(this.filePath, 'r')
      // 续传模式：seek 到已上传的位置
      if (this.resumeMode && this.position > 0) {
        fs.readSync(this.fd, Buffer.alloc(0), 0, 0, this.position)
      }
    }
    const buf = Buffer.allocUnsafe(256 * 1024)
    const bytesRead = fs.readSync(this.fd, buf, 0, buf.length, this.position)
    if (bytesRead === 0) {
      this.complete = true
      return Buffer.alloc(0)
    }
    this.position += bytesRead
    this.completedBytes += bytesRead
    this.increaseProgress(bytesRead)
    return buf.subarray(0, bytesRead)
  }

  close(): void {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd)
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

  cancel(): void {
    this.cancelled = true
    this.close()
  }

  /** 暂停传输，返回当前已读取的字节偏移量（用于后续续传） */
  pause(): number {
    this.paused = true
    this.close()
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
  private fd: number | null = null
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
    if (this.cancelled) {
      return
    }
    if (this.fd === null) {
      // 确保目录存在
      const dir = path.dirname(this.targetPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      // 续传模式使用 r+（不截断），否则使用 w（新建/截断）
      const flags = this.resumeOffset > 0 ? 'r+' : 'w'
      this.fd = fs.openSync(this.targetPath, flags)
      // 续传时 seek 到指定位置
      if (this.resumeOffset > 0) {
        fs.writeSync(this.fd, Buffer.alloc(0), 0, 0, this.resumeOffset)
        // 实际上使用 ftruncate + seek 更好
        // 先调整文件大小到续传点（如果当前文件小于续传点则补零）
        try {
          fs.ftruncateSync(this.fd, this.resumeOffset)
        } catch { /* ignore */ }
      }
    }
    fs.writeSync(this.fd, buffer)
    this.completedBytes += buffer.length
    this.increaseProgress(buffer.length)
    // 检查是否已写完
    if (this.completedBytes >= this.fileSize) {
      this.complete = true
    }
  }

  close(): void {
    if (this.fd !== null) {
      try {
        fs.closeSync(this.fd)
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

  cancel(): void {
    this.cancelled = true
    this.close()
  }

  /** 暂停传输，返回当前已写入的字节数（用于后续续传） */
  pause(): number {
    this.paused = true
    this.close()
    return this.completedBytes
  }

  /** 获取续传偏移量 */
  getResumeOffset(): number {
    return this.resumeOffset
  }

  /** 外部标记传输完成（用于原始 SFTP stream 续传下载） */
  _markComplete(): void {
    this.complete = true
    this.close()
  }

  increaseProgress(bytes: number): void {
    this.completedBytesForProgress += bytes
  }

  getCompletedBytes(): number {
    return this.completedBytesForProgress
  }
}

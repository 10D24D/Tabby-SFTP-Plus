/**
 * 远程文件内容读取/临时文件（查看、编辑用，不经过传输队列 UI）
 */
import * as fs from 'fs'
import * as fsPromises from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { randomBytes } from 'crypto'

import { LocalPathFileDownload } from '../local-transfers'
import type { SFTPSessionLike } from '../sftp.service'

/** 将远程文件下载到内存 */
export class BufferCollectingDownload {
  private chunks: Buffer[] = []
  private completedBytes = 0
  private complete = false
  private cancelled = false

  constructor(
    private readonly fileSize: number,
    private readonly mode = 0o644,
  ) {}

  getName(): string { return '' }
  getMode(): number { return this.mode }
  getSize(): number { return this.fileSize }

  async write(buffer: Buffer): Promise<void> {
    if (this.cancelled) return
    this.chunks.push(buffer)
    this.completedBytes += buffer.length
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
): Promise<Buffer> {
  if (size === 0) return Buffer.alloc(0)
  const dl = new BufferCollectingDownload(size, mode)
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
  const dir = path.join(os.tmpdir(), 'tabby-sftp-plus', randomBytes(8).toString('hex'))
  await fsPromises.mkdir(dir, { recursive: true })
  const localPath = path.join(dir, baseName)

  if (size === 0) {
    const fd = await fsPromises.open(localPath, 'w')
    await fd.close()
    return localPath
  }

  const dl = new LocalPathFileDownload(localPath, mode, size)
  await sftpSession.download(remotePath, dl as any)
  return localPath
}

export async function writeTextToFile(filePath: string, text: string, encoding: BufferEncoding = 'utf8'): Promise<void> {
  await fsPromises.writeFile(filePath, text, encoding)
}

export async function readTextFromFile(filePath: string): Promise<string> {
  return fsPromises.readFile(filePath, 'utf8')
}

export async function writeBufferToTemp(buf: Buffer, fileName: string): Promise<string> {
  const baseName = path.basename(fileName) || 'file'
  const dir = path.join(os.tmpdir(), 'tabby-sftp-plus', randomBytes(8).toString('hex'))
  await fsPromises.mkdir(dir, { recursive: true })
  const localPath = path.join(dir, baseName)
  await fsPromises.writeFile(localPath, buf)
  return localPath
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

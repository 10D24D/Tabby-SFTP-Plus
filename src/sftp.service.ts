/**
 * SFTP 连接服务
 * 功能描述：封装 Tabby SSH Session 的 SFTP 连接，提供统一的文件操作接口
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 */
import { Injectable } from '@angular/core'

export type SFTPFile = {
  name: string
  fullPath: string
  isDirectory: boolean
  isSymlink: boolean
  mode: number
  size: number
  modified: Date
  owner?: string
  group?: string
}

export type SFTPSessionLike = {
  readdir: (p: string) => Promise<SFTPFile[]>
  mkdir: (p: string) => Promise<void>
  rmdir: (p: string) => Promise<void>
  unlink: (p: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  upload: (remotePath: string, transfer: import('tabby-core').FileUpload) => Promise<void>
  download: (remotePath: string, transfer: import('tabby-core').FileDownload) => Promise<void>
  chmod: (path: string, mode: number) => Promise<void>
}

export type SSHSessionLike = {
  openSFTP: () => Promise<SFTPSessionLike>
}

@Injectable({ providedIn: 'root' })
export class SftpConnectionService {
  private sessions: Map<SSHSessionLike, SFTPSessionLike> = new Map()

  /**
   * 从 SSH Session 打开 SFTP 连接
   * 功能描述：复用 Tabby 已有 SSH 连接，打开 SFTP 子会话
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  async openFromSSHSession(sshSession: SSHSessionLike): Promise<SFTPSessionLike> {
    if (this.sessions.has(sshSession)) {
      return this.sessions.get(sshSession)!
    }
    const sftpSession = await sshSession.openSFTP()
    this.sessions.set(sshSession, sftpSession)
    return sftpSession
  }

  /**
   * 关闭 SFTP 连接
   * 功能描述：清理连接缓存
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  closeForSSHSession(sshSession: SSHSessionLike): void {
    this.sessions.delete(sshSession)
  }
}

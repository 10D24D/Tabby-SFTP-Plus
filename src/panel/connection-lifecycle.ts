/**
 * SFTP+ 面板连接生命周期（connect / disconnect / heartbeat / reconnect）
 * 从主面板组件抽离，降低 sftp-floating-panel 体积
 */
import { ChangeDetectorRef, NgZone } from '@angular/core'
import { NotificationsService } from 'tabby-core'

import { SftpConnectionService, SFTPSessionLike, SSHSessionLike } from '../sftp.service'
import { SftpI18nService } from '../sftp-i18n.service'

export type PathFollowMode = 'off' | 'remember' | 'sync'

export interface ConnectionLifecycleCtx {
  sshSession: SSHSessionLike | null
  sftpSession: SFTPSessionLike | null
  connected: boolean
  connecting: boolean
  reconnecting: boolean
  pathMode: PathFollowMode
  remotePath: string
  remotePathInput: string
  terminalRef: any
  sftpService: SftpConnectionService
  notifications: NotificationsService | null
  getI18n(): SftpI18nService
  zone: NgZone
  cdr: ChangeDetectorRef
  getDefaultRemotePath(): string
  refreshRemote(): Promise<boolean>
  restoreSavedRemotePath(): void
  tryGetTerminalCwd(): Promise<string | null>
  pushRemoteNav(path: string): void
  clearNavHistory(): void
  clearRemoteListing(): void
  setRemoteLoading(loading: boolean): void
}

export class PanelConnectionLifecycle {
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _sshCloseHandler: (() => void) | null = null
  private _heartbeatRecovering = false
  private _heartbeatDisposed = false

  constructor(private readonly ctx: ConnectionLifecycleCtx) {}

  /** 释放 SFTP 子通道并清除服务层缓存 */
  private releaseSftp(): void {
    const c = this.ctx
    if (c.sshSession) {
      c.sftpService.closeForSSHSession(c.sshSession)
    }
    c.sftpSession = null
  }

  /** SSH/SFTP 会话失效：断开连接并清空远程列表 */
  private handleSessionLost(logMsg?: string): void {
    const c = this.ctx
    c.zone.run(() => {
      c.connected = false
      this.releaseSftp()
      c.clearRemoteListing()
      this.stopHeartbeat()
      c.cdr.detectChanges()
      if (logMsg) console.log(logMsg)
    })
  }

  private notifyConnectFailed(e: unknown): void {
    const c = this.ctx
    const msg = c.getI18n().t('notify.sftpConnectFailed')
    const detail = e instanceof Error ? e.message : String(e ?? '')
    try { c.notifications?.error?.(msg, detail) } catch { /* ignore */ }
  }

  async connect(): Promise<void> {
    const c = this.ctx
    if (c.connecting || c.connected || !c.sshSession) return
    c.connecting = true
    c.setRemoteLoading(true)
    c.cdr.detectChanges()
    try {
      this.releaseSftp()
      c.sftpSession = await c.sftpService.openFromSSHSession(c.sshSession)
      c.connected = true
      this.startHeartbeat()
      await this.applyInitialRemotePath()
      const ok = await c.refreshRemote()
      if (!ok && c.remotePath !== '/') {
        console.warn('[SFTP+] Initial remote path invalid, falling back to /')
        c.remotePath = '/'
        c.remotePathInput = '/'
        await c.refreshRemote()
      }
      c.pushRemoteNav(c.remotePath)
    } catch (e) {
      console.error('[SFTP+] Connection failed', e)
      c.connected = false
      this.releaseSftp()
      c.clearRemoteListing()
      this.notifyConnectFailed(e)
    } finally {
      c.connecting = false
      c.setRemoteLoading(false)
      c.cdr.detectChanges()
    }
  }

  disconnect(): void {
    const c = this.ctx
    c.connected = false
    this.releaseSftp()
    c.clearRemoteListing()
    this.stopHeartbeat()
    c.clearNavHistory()
  }

  stopHeartbeat(): void {
    this._heartbeatDisposed = true
    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
    if (this._sshCloseHandler !== null) {
      try { this._sshCloseHandler() } catch { /* ignore */ }
      this._sshCloseHandler = null
    }
  }

  startHeartbeat(): void {
    this.stopHeartbeat()
    this._heartbeatDisposed = false
    const c = this.ctx

    try {
      const ssh = c.sshSession as {
        closed$?: { subscribe: (o: { next?: () => void }) => { unsubscribe: () => void } }
        closed?: Promise<void>
      } | null
      if (ssh) {
        if (ssh.closed$ && typeof ssh.closed$.subscribe === 'function') {
          const sub = ssh.closed$.subscribe({
            next: () => {
              if (this._heartbeatDisposed) return
              this.handleSessionLost('[SFTP+] SSH session closed (detected via closed$)')
            },
          })
          this._sshCloseHandler = () => {
            try { sub.unsubscribe() } catch { /* ignore */ }
          }
        } else if (typeof ssh.closed?.then === 'function') {
          void (ssh.closed as Promise<void>).then(() => {
            if (this._heartbeatDisposed) return
            this.handleSessionLost('[SFTP+] SSH session closed (detected via .closed Promise)')
          }).catch(() => { /* ignore */ })
        }
      }
    } catch { /* ignore */ }

    this._heartbeatTimer = setInterval(() => {
      if (!c.connected || !c.sftpSession) return

      try {
        const ssh = c.sshSession as { open?: boolean } | null
        if (ssh?.open === false) {
          this.handleSessionLost('[SFTP+] SSH session closed (detected via open=false)')
          return
        }
      } catch { /* ignore */ }

      try {
        if (c.terminalRef?.session === null) {
          this.handleSessionLost('[SFTP+] SSH session closed (detected via terminal.session=null)')
          return
        }
      } catch { /* ignore */ }

      const sftp = c.sftpSession
      const probePath = c.remotePath && typeof c.remotePath === 'string' ? c.remotePath : '/'
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('heartbeat-timeout')), 4000)
      })

      const probe = typeof sftp.stat === 'function'
        ? sftp.stat(probePath).then(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId)
        })
        : sftp.readdir(probePath).then(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId)
        })

      Promise.race([probe, timeoutPromise]).catch(async () => {
        if (this._heartbeatRecovering) return
        this._heartbeatRecovering = true
        try {
          if (!c.sshSession) throw new Error('no ssh session')
          this.releaseSftp()
          const fresh = await c.sftpService.openFromSSHSession(c.sshSession)
          c.sftpSession = fresh
          console.log('[SFTP+] Heartbeat recovered with new SFTP session')
          c.zone.run(() => { void c.refreshRemote() })
        } catch (e) {
          console.error('[SFTP+] Heartbeat recovery failed', e)
          this.handleSessionLost()
        } finally {
          this._heartbeatRecovering = false
        }
      })
    }, 10000)
  }

  async reconnect(): Promise<void> {
    const c = this.ctx
    if (c.reconnecting) return
    c.reconnecting = true
    c.setRemoteLoading(true)
    c.cdr.detectChanges()
    try {
      if (c.terminalRef) {
        try {
          const termEl = (c.terminalRef as { element?: { nativeElement?: HTMLElement } }).element?.nativeElement
          if (termEl) {
            termEl.click()
            termEl.focus?.()
          }
          const reconnect = (c.terminalRef as { reconnect?: () => Promise<void> }).reconnect
            || (c.terminalRef as { _reconnect?: () => Promise<void> })._reconnect
          if (typeof reconnect === 'function') {
            await reconnect.call(c.terminalRef)
          }
          if (c.sshSession && typeof c.sshSession === 'object') {
            const sessReconnect = (c.sshSession as { reconnect?: () => Promise<void> }).reconnect
            if (typeof sessReconnect === 'function') {
              await sessReconnect.call(c.sshSession)
            }
          }
        } catch (e) {
          console.log('[SFTP+] Terminal reconnect trigger failed, will retry', e)
        }

        await new Promise(resolve => setTimeout(resolve, 2000))

        const fresh =
          (c.terminalRef as { sshSession?: SSHSessionLike }).sshSession
          || (c.terminalRef as { _sshSession?: SSHSessionLike })._sshSession
          || (c.terminalRef as { _session?: SSHSessionLike })._session
        if (fresh && fresh !== c.sshSession) {
          c.sshSession = fresh
        }
      }

      if (!c.sshSession) {
        c.connected = false
        this.releaseSftp()
        c.clearRemoteListing()
        try { c.notifications?.error?.(c.getI18n().t('notify.reconnectNoTerminal'), '') } catch { /* ignore */ }
        return
      }

      this.releaseSftp()
      c.sftpSession = await c.sftpService.openFromSSHSession(c.sshSession)
      c.connected = true
      await this.applyInitialRemotePath()
      const ok = await c.refreshRemote()
      if (!ok && c.remotePath !== '/') {
        console.warn('[SFTP+] Reconnect: initial remote path invalid, falling back to /')
        c.remotePath = '/'
        c.remotePathInput = '/'
        await c.refreshRemote()
      }
      c.pushRemoteNav(c.remotePath)
      this.startHeartbeat()
    } catch (e) {
      console.error('[SFTP+] Reconnect failed', e)
      c.connected = false
      this.releaseSftp()
      c.clearRemoteListing()
      try { c.notifications?.error?.(c.getI18n().t('notify.reconnectFailed'), '') } catch { /* ignore */ }
    } finally {
      c.reconnecting = false
      c.setRemoteLoading(false)
      c.cdr.detectChanges()
    }
  }

  /**
   * 远程初始路径：终端同步 > 路径记忆 > 默认
   * （方案 A：三选一互斥）
   */
  private async applyInitialRemotePath(): Promise<void> {
    const c = this.ctx
    c.remotePath = c.getDefaultRemotePath()
    c.remotePathInput = c.remotePath

    if (c.pathMode === 'sync') {
      const cwd = await c.tryGetTerminalCwd()
      if (cwd) {
        c.remotePath = cwd
        c.remotePathInput = cwd
        return
      }
      return
    }

    if (c.pathMode === 'remember') {
      c.restoreSavedRemotePath()
    }
  }
}

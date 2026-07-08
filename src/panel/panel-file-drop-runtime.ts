/**
 * Drop 主流程：内部拖拽与 OS 拖入分发
 */
import * as path from 'path'
import * as fs from 'fs/promises'

import type { ChangeDetectorRef } from '@angular/core'
import type { SFTPFile } from '../sftp.service'
import { getDroppedOsPaths, parseDragPayload } from './panel-file-drop-parser'
import type { DragPayload } from './panel-types'

export type FileDropPane = 'local' | 'remote'

export interface FileDropRuntimeHost {
  cdr: ChangeDetectorRef
  connected: boolean
  sftpSession: any
  remotePath: string
  localPath: string
  effectiveLang: string
  notifications: any
  selectedLocal: any[]
  selectedRemote: any[]
  hasConflictQueue(): boolean
  isSameDirInternalDrop(payload: DragPayload, targetPane: FileDropPane): boolean
  resetFileDragState(): void
  uploadPathToRemote(remoteDir: string, localPath: string): Promise<void>
  streamDownloadOne(file: SFTPFile): Promise<void>
  refreshLocal(): Promise<any>
  refreshRemote(): Promise<any>
  showConflictDialog(): void
}

export class PanelFileDropRuntime {
  constructor(private readonly host: FileDropRuntimeHost) {}

  async onDrop(ev: DragEvent, targetPane: FileDropPane): Promise<void> {
    ev.preventDefault()

    const rawPayload = parseDragPayload(ev)
    if (rawPayload && this.host.isSameDirInternalDrop(rawPayload, targetPane)) {
      this.host.resetFileDragState()
      this.host.cdr.detectChanges()
      return
    }

    this.host.resetFileDragState()

    if (rawPayload) {
      if (!this.host.connected || !this.host.sftpSession) return
      if (rawPayload.kind === 'local-paths' && targetPane === 'remote') {
        for (const p of rawPayload.paths) {
          await this.host.uploadPathToRemote(this.host.remotePath, p.fullPath)
        }
        await this.host.refreshRemote()
        this.host.selectedLocal = []
        this.host.cdr.detectChanges()
        return
      }
      if (rawPayload.kind === 'remote-paths' && targetPane === 'local') {
        for (const p of rawPayload.paths) {
          await this.host.streamDownloadOne({
            name: p.name,
            fullPath: p.remotePath,
            isDirectory: p.isDirectory,
            isSymlink: false,
            mode: p.mode ?? 0o644,
            size: p.size ?? 0,
            modified: p.modified != null ? new Date(p.modified) : new Date(),
          } as SFTPFile)
        }
        if (this.host.hasConflictQueue()) this.host.showConflictDialog()
        await this.host.refreshLocal()
        this.host.selectedRemote = []
        this.host.cdr.detectChanges()
        return
      }
    }

    const osPaths = await getDroppedOsPaths(ev)
    if (osPaths.length && targetPane === 'local') {
      const cur = path.resolve(this.host.localPath)
      if (osPaths.every(p => path.resolve(path.dirname(p)) === cur)) {
        this.host.resetFileDragState()
        this.host.cdr.detectChanges()
        return
      }
    }
    if (osPaths.length && targetPane === 'remote') {
      if (!this.host.connected || !this.host.sftpSession) return
      for (const p of osPaths) {
        await this.host.uploadPathToRemote(this.host.remotePath, p)
      }
      await this.host.refreshRemote()
      return
    }
    if (osPaths.length && targetPane === 'local') {
      for (const p of osPaths) {
        const baseName = path.basename(p)
        const dest = path.join(this.host.localPath, baseName)
        try {
          await fs.cp(p, dest, { recursive: true, errorOnExist: false, dereference: false })
        } catch (e) {
          console.error('[SFTP+] Copy local failed:', p, e)
          const msg = this.host.effectiveLang === 'zh-CN'
            ? `复制失败: ${baseName}`
            : `Copy failed: ${baseName}`
          try { this.host.notifications?.error?.(msg, '') } catch {}
        }
      }
      await this.host.refreshLocal()
      return
    }
  }
}

/**
 * 功能描述：SFTP+ drop 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-16
 * 合并来源：drop-rules, drop-use-case, panel-drop-adapter, panel-file-drop-parser
 */

import * as path from 'path'

import { type DragPayload } from './panel-types'

import * as fs from 'fs/promises'

import { type ChangeDetectorRef } from '@angular/core'

import { type SFTPFile } from '../../services/sftp.service'

import * as os from 'os'


import { log } from '../../services/sftp-logger'
/**
 * Drop 领域规则（纯函数，无 Angular / DOM / IO）
 */


export type DropPane = 'local' | 'remote'

export type RemoteDropEntry = {
  remotePath: string
  name: string
  isDirectory: boolean
  size?: number
  mode?: number
  modified?: number
}

/** POSIX 远程目录归一化（去掉尾部斜杠，保留根路径） */
export function normRemoteDir(p: string): string {
  const n = path.posix.normalize(p || '/')
  return n.length > 1 && n.endsWith('/') ? n.slice(0, -1) : n
}

/** 内部拖拽落点与源在同一目录（同面板拖放无意义） */
export function isSameDirInternalDrop(
  payload: DragPayload,
  targetPane: DropPane,
  localPath: string,
  remotePath: string,
): boolean {
  if (payload.kind === 'local-paths' && targetPane === 'local') {
    const cur = path.resolve(localPath)
    return payload.paths.every(p => path.resolve(path.dirname(p.fullPath)) === cur)
  }
  if (payload.kind === 'remote-paths' && targetPane === 'remote') {
    const cur = normRemoteDir(remotePath)
    return payload.paths.every(p => normRemoteDir(path.posix.dirname(p.remotePath)) === cur)
  }
  return false
}

/** OS 拖入路径是否全部来自本地面板当前目录（同目录无操作） */
export function isOsDropIntoSameLocalDir(osPaths: string[], localPath: string): boolean {
  if (!osPaths.length) return false
  const cur = path.resolve(localPath)
  return osPaths.every(p => path.resolve(path.dirname(p)) === cur)
}

/**
 * Drop 用例：端口定义 + 编排逻辑
 * 合并自: drop-ports.ts, drop-use-case.ts
 */

// ─── 端口定义 ───────────────────────────────────────────────

/** 用例输入：由基础设施层从 DOM 事件解析后传入 */
export interface DropExecuteInput {
  targetPane: DropPane
  rawPayload: DragPayload | null
  osPaths: string[]
}

export interface DropContextPort {
  getLocalPath(): string
  getRemotePath(): string
  isConnected(): boolean
  hasSftpSession(): boolean
}

export interface DropTransferPort {
  uploadToRemote(remoteDir: string, localPath: string): Promise<void>
  downloadRemoteEntry(entry: RemoteDropEntry): Promise<void>
}

export interface DropPanePort {
  refreshLocal(): Promise<void>
  refreshRemote(): Promise<void>
  clearLocalSelection(): void
  clearRemoteSelection(): void
}

export interface DropConflictPort {
  hasPendingConflicts(): boolean
  showConflictDialog(): void
}

export interface DropFilesystemPort {
  copyIntoLocalDir(sources: string[], destDir: string): Promise<void>
}

export interface DropNotifyPort {
  copyFailed(fileName: string): void
}

export interface DropDragStatePort {
  reset(): void
}

export interface DropUiPort {
  markViewDirty(): void
}

export interface DropPorts {
  context: DropContextPort
  transfer: DropTransferPort
  pane: DropPanePort
  conflict: DropConflictPort
  filesystem: DropFilesystemPort
  notify: DropNotifyPort
  dragState: DropDragStatePort
  ui: DropUiPort
}

// ─── 用例编排 ───────────────────────────────────────────────

export class DropUseCase {
  constructor(private readonly ports: DropPorts) {}

  async execute(input: DropExecuteInput): Promise<void> {
    const { targetPane, rawPayload, osPaths } = input
    const ctx = this.ports.context

    if (rawPayload && isSameDirInternalDrop(
      rawPayload,
      targetPane,
      ctx.getLocalPath(),
      ctx.getRemotePath(),
    )) {
      this.ports.dragState.reset()
      this.ports.ui.markViewDirty()
      return
    }

    this.ports.dragState.reset()

    if (rawPayload) {
      const handled = await this._handleInternalPayload(rawPayload, targetPane)
      if (handled) return
    }

    await this._handleOsPaths(osPaths, targetPane)
  }

  private async _handleInternalPayload(payload: DragPayload, targetPane: DropPane): Promise<boolean> {
    const ctx = this.ports.context
    if (!ctx.isConnected() || !ctx.hasSftpSession()) return false

    if (payload.kind === 'local-paths' && targetPane === 'remote') {
      for (const p of payload.paths) {
        try {
          await this.ports.transfer.uploadToRemote(ctx.getRemotePath(), p.fullPath)
        } catch (e) {
          log.error('Upload failed for', p.fullPath, e)
        }
      }
      await this.ports.pane.refreshRemote()
      this.ports.pane.clearLocalSelection()
      this.ports.ui.markViewDirty()
      return true
    }

    if (payload.kind === 'remote-paths' && targetPane === 'local') {
      for (const p of payload.paths) {
        try {
          await this.ports.transfer.downloadRemoteEntry(p)
        } catch (e) {
          log.error('Download failed for', p.remotePath, e)
        }
      }
      if (this.ports.conflict.hasPendingConflicts()) {
        this.ports.conflict.showConflictDialog()
      }
      await this.ports.pane.refreshLocal()
      this.ports.pane.clearRemoteSelection()
      this.ports.ui.markViewDirty()
      return true
    }

    return false
  }

  private async _handleOsPaths(osPaths: string[], targetPane: DropPane): Promise<void> {
    if (!osPaths.length) return

    const ctx = this.ports.context

    if (targetPane === 'local' && isOsDropIntoSameLocalDir(osPaths, ctx.getLocalPath())) {
      this.ports.dragState.reset()
      this.ports.ui.markViewDirty()
      return
    }

    if (targetPane === 'remote') {
      if (!ctx.isConnected() || !ctx.hasSftpSession()) return
      for (const p of osPaths) {
        await this.ports.transfer.uploadToRemote(ctx.getRemotePath(), p)
      }
      await this.ports.pane.refreshRemote()
      return
    }

    if (targetPane === 'local') {
      await this.ports.filesystem.copyIntoLocalDir(osPaths, ctx.getLocalPath())
      await this.ports.pane.refreshLocal()
    }
  }
}

﻿/**
 * Drop 基础设施适配器：DOM 解析 + 端口实现 + 用例调用
 */


export interface PanelDropHost {
  cdr: ChangeDetectorRef
  connected: boolean
  sftpSession: unknown
  remotePath: string
  localPath: string
  effectiveLang: string
  i18n: { t(key: string, params?: Record<string, string | number>): string }
  notifications: { error?(msg: string, detail: string): void } | null
  selectedLocal: unknown[]
  selectedRemote: unknown[]
  hasConflictQueue(): boolean
  resetFileDragState(): void
  uploadPathToRemote(remoteDir: string, localPath: string): Promise<void>
  streamDownloadOne(file: SFTPFile): Promise<void>
  refreshLocal(): Promise<unknown>
  refreshRemote(): Promise<unknown>
  showConflictDialog(): void
}

export class PanelDropAdapter {
  private readonly useCase: DropUseCase

  constructor(private readonly host: PanelDropHost) {
    this.useCase = new DropUseCase(this._buildPorts())
  }

  async onDrop(ev: DragEvent, targetPane: DropPane): Promise<void> {
    ev.preventDefault()
    const rawPayload = parseDragPayload(ev)
    const osPaths = await getDroppedOsPaths(ev)
    await this.useCase.execute({ targetPane, rawPayload, osPaths })
  }

  private _buildPorts(): DropPorts {
    const host = this.host
    return {
      context: {
        getLocalPath: () => host.localPath,
        getRemotePath: () => host.remotePath,
        isConnected: () => host.connected,
        hasSftpSession: () => !!host.sftpSession,
      },
      transfer: {
        uploadToRemote: (remoteDir, localPath) => host.uploadPathToRemote(remoteDir, localPath),
        downloadRemoteEntry: (entry) => host.streamDownloadOne(this._toSftpFile(entry)),
      },
      pane: {
        refreshLocal: async () => { await host.refreshLocal() },
        refreshRemote: async () => { await host.refreshRemote() },
        clearLocalSelection: () => { host.selectedLocal = [] },
        clearRemoteSelection: () => { host.selectedRemote = [] },
      },
      conflict: {
        hasPendingConflicts: () => host.hasConflictQueue(),
        showConflictDialog: () => host.showConflictDialog(),
      },
      filesystem: {
        copyIntoLocalDir: (sources, destDir) => this._copyIntoLocalDir(sources, destDir),
      },
      notify: {
        copyFailed: (fileName) => this._notifyCopyFailed(fileName),
      },
      dragState: {
        reset: () => host.resetFileDragState(),
      },
      ui: {
        markViewDirty: () => host.cdr.detectChanges(),
      },
    }
  }

  private _toSftpFile(entry: RemoteDropEntry): SFTPFile {
    return {
      name: entry.name,
      fullPath: entry.remotePath,
      isDirectory: entry.isDirectory,
      isSymlink: false,
      mode: entry.mode ?? 0o644,
      size: entry.size ?? 0,
      modified: entry.modified != null ? new Date(entry.modified) : new Date(),
    } as SFTPFile
  }

  private _notifyCopyFailed(fileName: string): void {
    const msg = this.host.i18n.t('notify.copyFailed', { name: fileName })
    try { this.host.notifications?.error?.(msg, '') } catch {}
  }

  private async _copyIntoLocalDir(sources: string[], destDir: string): Promise<void> {
    for (const p of sources) {
      const baseName = path.basename(p)
      const dest = path.join(destDir, baseName)
      try {
        // fs.cp 需要 Node.js >= 16.7.0；旧版本回退到 copyLocalDir + copyFile
        if (typeof (fs as any).cp === 'function') {
          await (fs as any).cp(p, dest, { recursive: true, errorOnExist: false, dereference: false })
        } else {
          await this._copyIntoLocalDirFallback(p, dest)
        }
      } catch (e) {
        log.error('Copy local failed:', p, e)
        this._notifyCopyFailed(baseName)
      }
    }
  }

  /** fs.cp 的兼容性回退（Node.js < 16.7） */
  private async _copyIntoLocalDirFallback(src: string, dest: string): Promise<void> {
    const st = await fs.stat(src).catch(() => null)
    if (!st) return
    if (st.isDirectory()) {
      await fs.mkdir(dest, { recursive: true })
      const entries = await fs.readdir(src)
      for (const entry of entries) {
        await this._copyIntoLocalDirFallback(path.join(src, entry), path.join(dest, entry))
      }
    } else {
      await fs.copyFile(src, dest)
    }
  }
}

/**
 * Drop 事件数据解析：内部 payload 与 OS 文件路径提取
 */


/** 解析内部拖拽数据（getData 在 drop 事件中只能消费一次，建议只调用一次） */
export function parseDragPayload(ev: DragEvent): DragPayload | null {
  const raw = ev.dataTransfer?.getData('application/x-sftp-plus')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** 从 OS 拖入的 DataTransfer 中提取本地文件系统路径 */
export async function getDroppedOsPaths(ev: DragEvent): Promise<string[]> {
  const dt = ev.dataTransfer
  if (!dt) return []

  // 策略1: Electron File.path（最直接，跨平台，带正确原生路径）
  const files = Array.from(dt.files ?? [])
  const electronPaths = files.map(f => (f as any).path as string | undefined).filter(Boolean) as string[]
  if (electronPaths.length) return electronPaths

  // 策略1b: 遍历 dataTransfer.items 用 webUtils.getPathForFile()（Electron 22+，支持文件和文件夹）
  try {
    const { webUtils } = require('electron')
    const items = Array.from(dt.items ?? [])
    const itemPaths: string[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          const p = webUtils.getPathForFile(file)
          if (p) itemPaths.push(p)
        }
      }
    }
    if (itemPaths.length) return itemPaths
  } catch { /* Electron 版本不支持 webUtils，或未启用 */ }

  // 策略2: File 对象有内容但没有 .path → 写入临时目录后返回路径（仅单文件，非目录）
  if (files.length) {
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragdrop')
    await fs.mkdir(tmpDir, { recursive: true }).catch(() => {})
    const tmpPaths: string[] = []
    for (const file of files) {
      if (!file.name) continue
      const tmpPath = path.join(tmpDir, file.name)
      try {
        const buf = Buffer.from(await file.arrayBuffer())
        if (buf.length === 0 && file.size === 0) continue
        await fs.writeFile(tmpPath, buf)
        tmpPaths.push(tmpPath)
      } catch { /* 跳过无法读取的文件（含文件夹占位项） */ }
    }
    if (tmpPaths.length) return tmpPaths
  }

  // 策略3: text/uri-list 回退（处理 Windows file:///C:/path 格式）
  const uriList = dt.getData('text/uri-list') || ''
  const uris = uriList.split(/\r?\n/g).map(x => x.trim()).filter(x => x && !x.startsWith('#'))
  return uris.map(x => {
    if (!x.startsWith('file://')) return x
    const raw = decodeURIComponent(x.slice('file://'.length)) // 去掉 file://
    // Windows: file:///C:/path → /C:/path → 去掉开头的 /，保持 Drive letter
    if (/^\/[a-zA-Z]:/.test(raw)) {
      return raw.slice(1).replace(/\//g, '\\')
    }
    return raw
  })
}


/**
 * 功能描述：SFTP+ paste 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — safeEntryName 防路径穿越
 * 合并来源：paste-use-case, panel-paste-adapter
 */

import * as path from 'path'

import { type Stats } from 'fs'

import { pasteEntryKey } from './conflict'

import { safeEntryName } from './path-utils'

import { type ConflictQueueItem } from './panel-types'

import * as fs from 'fs/promises'

import { copyLocalDir, copyRemoteDir, deleteLocalRecursive, deleteRemoteRecursive, tryRemoteCpViaSsh } from './fs-ops'


import { log } from '../../services/sftp-logger'
/**
 * 粘贴用例：端口定义 + 冲突预检 + 执行逻辑
 * 合并自: paste-ports.ts, paste-use-case.ts
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-11
 *   每个冲突入队项写入 entryKey=pasteEntryKey(entry)，使 resumePaste 准确排除已解决项；
 *   _pasteSamePane 增加同路径自我拷贝守卫，防止 fs.copyFile 清空文件
 * 修改时间：2026-07-12
 *   _pasteSamePane 加诊断日志，确认 resumePaste 是否在重命名后重复调用同路径拷贝
 */



// ─── 端口定义 ───────────────────────────────────────────────

export type PasteEntry = {
  name: string
  fullPath?: string
  isDirectory: boolean
  mode?: number
  size?: number
  mtimeMs?: number
}

export interface PasteTransferPort {
  uploadFile(remotePath: string, localPath: string): Promise<void>
  downloadFile(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void>
  uploadDirectory(localSrc: string, remoteDestParent: string): Promise<void>
  downloadDirectory(remoteSrc: string, localDestParent: string): Promise<void>
}

export interface PasteFsPort {
  copyLocalDir(src: string, dest: string): Promise<void>
  copyLocalFile(src: string, dest: string): Promise<void>
  renameLocal(src: string, dest: string): Promise<void>
  copyRemoteDir(src: string, dest: string, isDir: boolean): Promise<void>
  renameRemote(src: string, dest: string): Promise<void>
  deleteLocalRecursive(path: string): Promise<void>
  deleteRemoteRecursive(path: string): Promise<void>
  localDirExists(path: string): Promise<boolean>
  statLocal(path: string): Promise<Stats | null>
  readdirRemote(parentDir: string): Promise<Array<{ name: string; size?: number; modified?: Date }>>
}

export interface PasteConflictPort {
  checkDestExists(pane: 'local' | 'remote', filePath: string): Promise<boolean>
  checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean>
  enqueue(item: ConflictQueueItem): void
  showDialog(): void
  queueLength(): number
  setOriginalTotal(count: number): void
}

export interface PastePendingPort {
  save(entries: PasteEntry[], destPane: 'local' | 'remote', destPath: string, mode: 'copy' | 'cut', source: 'local' | 'remote'): void
}

export interface PasteUiPort {
  refreshLocal(): Promise<void>
  refreshRemote(): Promise<unknown>
  notifyPasteFailed(): void
  hasSftpSession(): boolean
}

export interface PastePorts {
  transfer: PasteTransferPort
  fs: PasteFsPort
  conflict: PasteConflictPort
  pending: PastePendingPort
  ui: PasteUiPort
}

// ─── 用例实现 ───────────────────────────────────────────────

export class PasteUseCase {
  constructor(private readonly ports: PastePorts) {}

  /** 预检冲突并入队，返回是否存在需用户确认的冲突 */
  async scanConflicts(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    source: 'local' | 'remote',
    mode: 'copy' | 'cut',
  ): Promise<boolean> {
    for (const entry of entries) {
      const destFilePath = destPane === 'local'
        ? path.join(destPath, entry.name)
        : path.posix.join(destPath, entry.name)

      if (entry.isDirectory) {
        if (source === 'local' && destPane === 'remote') {
          if (await this.ports.conflict.checkRemotePathExists(destFilePath, true)) {
            const st = await this.ports.fs.statLocal(entry.fullPath ?? '')
            this.ports.conflict.enqueue({
              localPath: entry.fullPath ?? '',
              remoteDir: destPath,
              fileName: entry.name,
                remotePath: destFilePath,
                localStat: (st ?? { size: 0, mtimeMs: Date.now() }) as Stats,
                direction: 'upload',
                isDirectory: true,
                entryKey: pasteEntryKey(entry),
                mode,
            })
          }
        } else if (source === 'remote' && destPane === 'local') {
          if (await this.ports.fs.localDirExists(destFilePath)) {
            this.ports.conflict.enqueue({
              localPath: destFilePath,
              remoteDir: path.posix.dirname(entry.fullPath ?? ''),
              fileName: entry.name,
                remotePath: entry.fullPath ?? '',
                localStat: { size: 0, mtimeMs: Date.now() } as Stats,
                direction: 'download',
                isDirectory: true,
                entryKey: pasteEntryKey(entry),
                mode,
            })
          }
        }
        continue
      }

      const exists = await this.ports.conflict.checkDestExists(destPane, destFilePath)
      if (!exists) continue

      const isSamePane = source === destPane
      const direction: 'upload' | 'download' = isSamePane ? 'upload'
        : (source === 'local' && destPane === 'remote') ? 'upload'
        : 'download'

      let destStat: Stats = { size: 0, mtimeMs: Date.now() } as Stats
      if (isSamePane) {
        if (destPane === 'local') {
          const st = await this.ports.fs.statLocal(destFilePath)
          if (st) destStat = st
        } else if (this.ports.ui.hasSftpSession()) {
          try {
            const dir = path.posix.dirname(destFilePath)
            const name = path.posix.basename(destFilePath)
            const remoteEntries = await this.ports.fs.readdirRemote(dir)
            const found = remoteEntries.find(e => e.name === name)
            if (found) {
              destStat = {
                size: found.size ?? 0,
                mtimeMs: found.modified?.getTime?.() ?? Date.now(),
              } as Stats
            }
          } catch { /* ignore */ }
        }
      }

      this.ports.conflict.enqueue(this._buildFileConflictItem(
        entry, destPane, destPath, source, destFilePath, isSamePane, direction, destStat, mode,
      ))
    }

    return this.ports.conflict.queueLength() > 0
  }

  async execute(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    try {
      for (const entry of entries) {
        const srcPath = entry.fullPath ?? ''
        if (!srcPath) continue
        // ★ 2026-07-25：剥离服务器返回文件名中的目录组件与 ..，防止路径穿越
        const safeName = safeEntryName(entry.name)
        if (!safeName) {
          log.warn('skip unsafe paste entry name:', entry.name)
          continue
        }
        const destFilePath = destPane === 'local'
          ? path.join(destPath, safeName)
          : path.posix.join(destPath, safeName)

        if (source === destPane) {
          await this._pasteSamePane(entry, srcPath, destFilePath, destPane, mode)
        } else if (source === 'local' && destPane === 'remote') {
          await this._pasteLocalToRemote(entry, srcPath, destPath, destFilePath, mode)
        } else {
          await this._pasteRemoteToLocal(entry, srcPath, destPath, destFilePath, mode)
        }
      }
      if (destPane === 'local' || source === 'local') await this.ports.ui.refreshLocal()
      if (destPane === 'remote' || source === 'remote') await this.ports.ui.refreshRemote()
    } catch (e) {
      log.error('Paste failed', e)
      this.ports.ui.notifyPasteFailed()
    }
  }

  private async _pasteSamePane(
    entry: PasteEntry,
    srcPath: string,
    destFilePath: string,
    destPane: 'local' | 'remote',
    mode: 'copy' | 'cut',
  ): Promise<void> {
    // [诊断] 记录同面板粘贴调用（若重命名后这里又被调用=resumePaste 重复执行）
    log.info('_pasteSamePane:', { srcPath, destFilePath, destPane, mode, isDir: entry.isDirectory })
    // 防御：源与目标为同一路径时，fs.copyFile 会先截断 dest 再读已清空的 src → 文件变空白，直接跳过
    if (destPane === 'local'
      ? path.resolve(srcPath) === path.resolve(destFilePath)
      : srcPath === destFilePath) {
      log.warn('_pasteSamePane self-copy skipped:', srcPath)
      return
    }
    if (destPane === 'local') {
      if (mode === 'copy') {
        if (entry.isDirectory) await this.ports.fs.copyLocalDir(srcPath, destFilePath)
        else await this.ports.fs.copyLocalFile(srcPath, destFilePath)
      } else {
        await this.ports.fs.renameLocal(srcPath, destFilePath)
      }
      return
    }
    if (mode === 'copy') {
      await this.ports.fs.copyRemoteDir(srcPath, destFilePath, entry.isDirectory)
    } else if (this.ports.ui.hasSftpSession()) {
      await this.ports.fs.renameRemote(srcPath, destFilePath)
    }
  }

  private async _pasteLocalToRemote(
    entry: PasteEntry,
    srcPath: string,
    destPath: string,
    destFilePath: string,
    mode: 'copy' | 'cut',
  ): Promise<void> {
    if (entry.isDirectory) {
      await this.ports.transfer.uploadDirectory(srcPath, destPath)
    } else {
      await this.ports.transfer.uploadFile(destFilePath, srcPath)
    }
    if (mode === 'cut') await this.ports.fs.deleteLocalRecursive(srcPath)
  }

  private async _pasteRemoteToLocal(
    entry: PasteEntry,
    srcPath: string,
    destPath: string,
    destFilePath: string,
    mode: 'copy' | 'cut',
  ): Promise<void> {
    if (entry.isDirectory) {
      // ★ 2026-07-25：直接使用已净化的 destFilePath（剥离了目录组件与 ..）
      const destDir = destFilePath
      if (await this.ports.fs.localDirExists(destDir)) {
        this.ports.conflict.enqueue({
          localPath: destDir,
          remoteDir: path.posix.dirname(srcPath),
          fileName: entry.name,
            remotePath: srcPath,
            localStat: { size: 0, mtimeMs: Date.now() } as Stats,
            direction: 'download',
            isDirectory: true,
            entryKey: pasteEntryKey(entry),
            mode,
        })
        this.ports.conflict.setOriginalTotal(this.ports.conflict.queueLength())
        this.ports.conflict.showDialog()
        return
      }
      await this.ports.transfer.downloadDirectory(srcPath, destPath)
    } else {
      await this.ports.transfer.downloadFile(srcPath, destFilePath, entry.mode, entry.size)
    }
    if (mode === 'cut' && this.ports.ui.hasSftpSession()) {
      await this.ports.fs.deleteRemoteRecursive(srcPath)
    }
  }

  private _buildFileConflictItem(
    entry: PasteEntry,
    destPane: 'local' | 'remote',
    destPath: string,
    source: 'local' | 'remote',
    destFilePath: string,
    isSamePane: boolean,
    direction: 'upload' | 'download',
    destStat: Stats,
    mode: 'copy' | 'cut',
  ): ConflictQueueItem {
    return {
      localPath: isSamePane ? destFilePath : (source === 'local' ? (entry.fullPath ?? '') : destFilePath),
      remoteDir: destPane === 'remote' ? destPath : path.posix.dirname(entry.fullPath ?? ''),
      fileName: entry.name,
      remotePath: isSamePane ? (entry.fullPath ?? '') : (destPane === 'remote' ? destFilePath : (entry.fullPath ?? '')),
      localStat: isSamePane ? destStat : { size: entry.size ?? 0, mtimeMs: entry.mtimeMs ?? Date.now() } as Stats,
      direction,
      remoteFileSize: entry.size ?? 0,
      remoteFileMtime: entry.mtimeMs ?? Date.now(),
      isSamePane,
      samePaneSource: isSamePane ? source : undefined,
      entryKey: pasteEntryKey(entry),
      mode,
    }
  }
}

/**
 * 粘贴基础设施适配器
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-12
 *   copyLocalFile 加底层 realpath 自我拷贝守卫（fs.copyFile(src,src) 会清空文件），
 *   兜住所有上层调用方与路径格式差异；加诊断日志定位"重命名后文件变空白"
 */


export interface PanelPasteHost {
  sftpSession: unknown
  /** 用于远程同机 `cp`；缺失时 copyRemoteDir 回退到本地下载+上传 */
  sshSession?: unknown
  effectiveLang: string
  i18n: { t(key: string, params?: Record<string, string | number>): string }
  notifications: { error?(msg: string, detail: string): void } | null

  uploadFile(remotePath: string, localPath: string): Promise<void>
  downloadFile(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void>
  uploadDirectory(localSrc: string, remoteDestParent: string): Promise<void>
  downloadDirectory(remoteSrc: string, localDestParent: string): Promise<void>

  checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean>
  enqueueConflict(item: import('../core/panel-types').ConflictQueueItem): void
  showConflictDialog(): void
  getConflictQueueLength(): number
  setConflictOriginalTotal(count: number): void

  savePendingPaste(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): void

  renameRemote(src: string, dest: string): Promise<void>
  refreshLocal(): Promise<void>
  refreshRemote(): Promise<unknown>
}

export class PanelPasteAdapter {
  private readonly useCase: PasteUseCase

  constructor(private readonly host: PanelPasteHost) {
    this.useCase = new PasteUseCase(this._buildPorts())
  }

  async paste(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    const hasConflicts = await this.useCase.scanConflicts(entries, destPane, destPath, source, mode)
    if (hasConflicts) {
      this.host.savePendingPaste(entries, destPane, destPath, mode, source)
      this.host.setConflictOriginalTotal(this.host.getConflictQueueLength())
      this.host.showConflictDialog()
      return
    }
    await this.useCase.execute(entries, destPane, destPath, mode, source)
  }

  executePaste(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    return this.useCase.execute(entries, destPane, destPath, mode, source)
  }

  private _buildPorts(): PastePorts {
    const host = this.host
    const remoteCopyDeps = {
      hasSession: () => !!host.sftpSession,
      mkdir: async (p: string) => { await (host.sftpSession as any).mkdir(p) },
      readdir: async (p: string) => {
        const entries = await (host.sftpSession as any).readdir(p)
        return entries.map((e: any) => ({ name: e.name, isDirectory: !!e.isDirectory }))
      },
      download: (r: string, l: string) => host.downloadFile(r, l),
      upload: (r: string, l: string) => host.uploadFile(r, l),
      tryServerCopy: (src: string, dest: string, isDir: boolean) =>
        tryRemoteCpViaSsh(host.sshSession, src, dest, isDir),
    }
    return {
      transfer: {
        uploadFile: (remotePath, localPath) => host.uploadFile(remotePath, localPath),
        downloadFile: (remotePath, localPath, mode, size) =>
          host.downloadFile(remotePath, localPath, mode, size),
        uploadDirectory: (localSrc, remoteDestParent) =>
          host.uploadDirectory(localSrc, remoteDestParent),
        downloadDirectory: (remoteSrc, localDestParent) =>
          host.downloadDirectory(remoteSrc, localDestParent),
      },
      fs: {
        copyLocalDir: (src, dest) => copyLocalDir(src, dest),
        copyLocalFile: async (src, dest) => {
          // 底层自我拷贝守卫：fs.copyFile(src, src) 会先截断 dest(=src) 再读已清空的 src → 文件变空白
          // 用 realpath 比对真实路径（处理符号链接/大小写/路径分隔符差异），兜住所有上层调用方
          // dest 不存在（如重命名新文件）则放行让 copyFile 正常创建
          try {
            const ra = await fs.realpath(src)
            const rb = await fs.realpath(dest).catch(() => null)
            if (rb && (ra === rb || (process.platform === 'win32' && ra.toLowerCase() === rb.toLowerCase()))) {
              log.warn('copyLocalFile self-copy skipped:', src, '->', dest)
              return
            }
          } catch { /* src 不存在，放行让 copyFile 抛错 */ }
          log.info('copyLocalFile:', src, '->', dest)
          return fs.copyFile(src, dest)
        },
        renameLocal: (src, dest) => fs.rename(src, dest),
        copyRemoteDir: (src, dest, isDir) => copyRemoteDir(src, dest, isDir, remoteCopyDeps),
        renameRemote: (src, dest) => host.renameRemote(src, dest),
        deleteLocalRecursive: (p) => deleteLocalRecursive(p),
        deleteRemoteRecursive: (p) => deleteRemoteRecursive(host.sftpSession as any, p),
        localDirExists: (p) => fs.stat(p).then(() => true).catch(() => false),
        statLocal: (p) => fs.stat(p).catch(() => null),
        readdirRemote: async (parentDir) => {
          const entries = await (host.sftpSession as any).readdir(parentDir)
          return entries.map((e: any) => ({ name: e.name, size: e.size, modified: e.modified }))
        },
      },
      conflict: {
        checkDestExists: async (pane, filePath) => {
          if (pane === 'local') {
            try { await fs.access(filePath); return true } catch { return false }
          }
          if (!host.sftpSession) return false
          const dir = path.posix.dirname(filePath)
          const name = path.posix.basename(filePath)
          try {
            const entries = await (host.sftpSession as any).readdir(dir)
            return entries.some((e: any) => e.name === name)
          } catch {
            return false
          }
        },
        checkRemotePathExists: (remotePath, expectDir) =>
          host.checkRemotePathExists(remotePath, expectDir),
        enqueue: (item) => host.enqueueConflict(item),
        showDialog: () => host.showConflictDialog(),
        queueLength: () => host.getConflictQueueLength(),
        setOriginalTotal: (count) => host.setConflictOriginalTotal(count),
      },
      pending: {
        save: (entries, destPane, destPath, mode, source) =>
          host.savePendingPaste(entries, destPane, destPath, mode, source),
      },
      ui: {
        refreshLocal: () => host.refreshLocal(),
        refreshRemote: () => host.refreshRemote(),
        notifyPasteFailed: () => {
          const msg = host.i18n.t('notify.pasteFailed')
          try { host.notifications?.error?.(msg, '') } catch {}
        },
        hasSftpSession: () => !!host.sftpSession,
      },
    }
  }
}


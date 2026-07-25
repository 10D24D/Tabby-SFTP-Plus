import * as fs from 'fs/promises'
import * as path from 'path'

import { ConflictResolveUseCase, type ConflictResolvePorts } from '../core/conflict'
import { pasteEntryKey } from '../core/conflict'
import type { ConflictFileInfo, ConflictQueueItem, LocalEntry, SFTPFile } from '../core/panel-types'

import { log } from '../../services/sftp-logger'
type ConflictActionMode = 'ask' | 'overwrite' | 'skip' | 'rename'

export interface PanelConflictResolverHost {
  sftpSession: any
  cdr: { detectChanges(): void }
  /** 远程 server-side 重命名（同服移动，秒级，用于剪切覆盖/重命名） */
  renameRemote(src: string, dest: string): Promise<void>

  conflictData: ConflictFileInfo | null
  showConflictDialog: boolean
  conflictCurrIdx: number
  conflictTotalIdx: number
  conflictOriginalTotal: number

  conflictQueue: ConflictQueueItem[]
  conflictAllMode: ConflictActionMode
  conflictResolvedKeys: Set<string>

  selectedLocal: LocalEntry[]
  selectedRemote: SFTPFile[]

  clipboardEntries: Array<{ name: string; fullPath?: string; remotePath?: string; isDirectory: boolean; sourcePane?: 'local' | 'remote'; mode?: number; size?: number }>
  clipboardSource: 'local' | 'remote'
  clipboardMode: 'copy' | 'cut'
  pendingPasteEntries: Array<{ name: string; fullPath?: string; remotePath?: string; isDirectory: boolean; sourcePane?: 'local' | 'remote'; mode?: number; size?: number }>
  pendingPasteDestPane: 'local' | 'remote'
  pendingPasteDestPath: string
  pendingPasteMode: 'copy' | 'cut'
  pendingPasteSource: 'local' | 'remote'

  refreshRemote(): Promise<boolean>
  refreshLocal(): Promise<void>
  executePaste(
    entries: Array<{ name: string; fullPath?: string; remotePath?: string; isDirectory: boolean; sourcePane?: 'local' | 'remote'; mode?: number; size?: number }>,
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void>
  doDownload(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void>
  doUpload(remotePath: string, localPath: string): Promise<void>
  downloadRemoteDir(remoteDir: string, localDestDir: string, targetPane?: 'local' | 'remote', _top?: any, renameTo?: string): Promise<void>
  mergeLocalDirToRemote(localSrc: string, remoteDest: string): Promise<void>
  copyLocalDir(src: string, dest: string): Promise<void>
  copyRemoteDir(srcRemotePath: string, destRemotePath: string, isDirectory: boolean): Promise<void>
}

export { pasteEntryKey }

export class PanelConflictResolver {
  private readonly useCase: ConflictResolveUseCase

  constructor(private readonly host: PanelConflictResolverHost) {
    this.useCase = new ConflictResolveUseCase(this._buildPorts())
  }

  showConflictDialog(): void {
    const item = this.host.conflictQueue[0]
    if (!item) return
    this.host.conflictTotalIdx = this.host.conflictOriginalTotal
    this.host.conflictCurrIdx = this.host.conflictOriginalTotal - this.host.conflictQueue.length + 1

    if (this.host.showConflictDialog) {
      this.host.cdr.detectChanges()
      return
    }
    this.host.conflictData = {
      localPath: item.localPath,
      remotePath: item.remotePath,
      fileName: item.fileName,
      localSize: item.localStat.size,
      remoteSize: item.remoteFileSize ?? 0,
      localMtime: item.localStat.mtimeMs,
      remoteMtime: item.remoteFileMtime ?? 0,
      remoteDir: item.remoteDir,
      direction: item.direction,
      isSamePane: item.isSamePane ?? false,
      isDirectory: item.isDirectory ?? false,
    }
    // 异步取远程文件的真值（readdir 元数据不可靠，必须用 stat）
    const remoteFilePath = item.remotePath || path.posix.join(item.remoteDir, item.fileName)
    if (remoteFilePath && this.host.sftpSession) {
      this.host.sftpSession.stat(remoteFilePath).then((st: any) => {
        if (!this.host.showConflictDialog || !this.host.conflictData || !st) return
        this.host.conflictData.remoteSize = st.size ?? 0
        this.host.conflictData.remoteMtime = st.mtime?.getTime?.() ?? st.modified?.getTime?.() ?? 0
        this.host.cdr.detectChanges()
      }).catch(() => {})
    }
    this.host.showConflictDialog = true
    this.host.cdr.detectChanges()
  }

  resolveConflict(action: string): void {
    void this.useCase.resolve(action)
  }

  private _buildPorts(): ConflictResolvePorts {
    const host = this.host
    return {
      execution: {
        mergeLocalDirToRemote: (localSrc, remoteDest) => host.mergeLocalDirToRemote(localSrc, remoteDest),
        downloadRemoteDir: (remotePath, localDestParent, localName) =>
          host.downloadRemoteDir(remotePath, localDestParent, 'local', undefined, localName),
        doDownload: (remotePath, localPath, mode, size) => host.doDownload(remotePath, localPath, mode, size),
        doUpload: (remotePath, localPath) => host.doUpload(remotePath, localPath),
        copyLocalDir: (src, dest) => host.copyLocalDir(src, dest),
        copyLocalFile: async (src, dest) => {
          // 底层自我拷贝守卫：同 panel-paste-adapter，防止 fs.copyFile(src, src) 清空文件
          try {
            const ra = await fs.realpath(src)
            const rb = await fs.realpath(dest).catch(() => null)
            if (rb && (ra === rb || (process.platform === 'win32' && ra.toLowerCase() === rb.toLowerCase()))) {
              log.warn('resolver copyLocalFile self-copy skipped:', src, '->', dest)
              return
            }
          } catch {}
          log.info('resolver copyLocalFile:', src, '->', dest)
          return fs.copyFile(src, dest)
        },
        copyRemoteDir: (src, dest, isDirectory) => host.copyRemoteDir(src, dest, isDirectory),
        renameRemote: (src, dest) => host.renameRemote(src, dest),
        statLocal: async (p) => {
          try {
            const st = await fs.stat(p)
            return { isDirectory: st.isDirectory() }
          } catch { return null }
        },
        readdirRemote: async (parentDir) => {
          const entries = await host.sftpSession.readdir(parentDir)
          return entries.map((e: any) => ({ name: e.name, isDirectory: !!e.isDirectory }))
        },
        hasSftpSession: () => !!host.sftpSession,
        unlinkLocal: async (p) => { await fs.unlink(p) },
        unlinkRemote: async (p) => {
          if (host.sftpSession) await host.sftpSession.unlink(p)
        },
      },
      pendingPaste: {
        hasPendingPaste: () => host.pendingPasteEntries.length > 0,
        restoreClipboardFromPending: () => {
          host.clipboardEntries = host.pendingPasteEntries.slice()
          host.clipboardSource = host.pendingPasteSource
          host.clipboardMode = host.pendingPasteMode
        },
        clearPending: () => {
          host.pendingPasteEntries = []
        },
        resumePaste: async (resolvedKeys) => {
          const entries = host.pendingPasteEntries
          const destPane = host.pendingPasteDestPane
          const destPath = host.pendingPasteDestPath
          const mode = host.pendingPasteMode
          const source = host.pendingPasteSource
          host.pendingPasteEntries = []
          host.pendingPasteDestPane = 'local'
          host.pendingPasteDestPath = ''
          host.pendingPasteMode = 'copy'
          host.pendingPasteSource = 'local'
          await host.executePaste(
            entries.filter(e => !resolvedKeys.has(pasteEntryKey(e))),
            destPane, destPath, mode, source,
          )
        },
      },
      queue: {
        shift: () => host.conflictQueue.shift(),
        clear: () => { host.conflictQueue = [] },
        length: () => host.conflictQueue.length,
        markResolved: (key) => { host.conflictResolvedKeys.add(key) },
        getResolvedKeys: () => host.conflictResolvedKeys,
        clearResolvedKeys: () => { host.conflictResolvedKeys.clear() },
        getAllMode: () => host.conflictAllMode,
        setAllMode: (mode) => { host.conflictAllMode = mode },
        resetAllMode: () => { host.conflictAllMode = 'ask' },
        resetOriginalTotal: () => { host.conflictOriginalTotal = 1 },
      },
      ui: {
        hideDialog: () => { host.showConflictDialog = false },
        clearSelection: () => {
          host.selectedLocal = []
          host.selectedRemote = []
        },
        refreshPanes: () => {
          void host.refreshRemote()
          void host.refreshLocal()
          host.cdr.detectChanges()
        },
        showNextDialog: () => this.showConflictDialog(),
      },
    }
  }
}

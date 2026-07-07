import * as fs from 'fs/promises'
import * as path from 'path'

import type { ConflictFileInfo, ConflictQueueItem, LocalEntry, SFTPFile } from './panel-types'

type ConflictActionMode = 'ask' | 'overwrite' | 'skip' | 'rename'

export interface PanelConflictResolverHost {
  sftpSession: any
  cdr: { detectChanges(): void }

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

function conflictItemKey(item: ConflictQueueItem): string {
  return `${item.direction}|${item.remotePath}|${item.localPath}`
}

export { conflictItemKey }

function pasteEntryKey(e: {
  name: string
  fullPath?: string
  remotePath?: string
  sourcePane?: 'local' | 'remote'
}): string {
  const pane = e.sourcePane ?? 'local'
  const p = pane === 'remote' ? (e.remotePath ?? e.name) : (e.fullPath ?? e.name)
  return `${pane}|${p}`
}

export class PanelConflictResolver {
  constructor(private readonly host: PanelConflictResolverHost) {}

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
    if (item.direction === 'upload' && this.host.sftpSession) {
      this.host.sftpSession.readdir(item.remoteDir).then((entries: any[]) => {
        if (!this.host.showConflictDialog || !this.host.conflictData) return
        const found = entries.find(e => e.name === item.fileName)
        if (found && this.host.conflictData) {
          this.host.conflictData.remoteSize = found.size ?? 0
          this.host.conflictData.remoteMtime = found.modified?.getTime?.() ?? 0
          this.host.cdr.detectChanges()
        }
      }).catch(() => {})
    }
    this.host.showConflictDialog = true
    this.host.cdr.detectChanges()
  }

  resolveConflict(action: string): void {
    this.host.showConflictDialog = false

    if (action === 'overwrite-all') { this.host.conflictAllMode = 'overwrite'; action = 'overwrite' }
    else if (action === 'skip-all') { this.host.conflictAllMode = 'skip'; action = 'skip' }
    else if (action === 'rename-all') { this.host.conflictAllMode = 'rename'; action = 'rename' }

    const current = this.host.conflictQueue.shift()
    if (!current) { this.processNextConflict(); return }
    void this.applyConflictAction(current, action)
  }

  private async applyConflictAction(item: ConflictQueueItem, action: string): Promise<void> {
    this.host.conflictResolvedKeys.add(conflictItemKey(item))
    switch (action) {
      case 'cancel':
        this.host.conflictQueue = []
        this.host.clipboardEntries = this.host.pendingPasteEntries.slice()
        this.host.clipboardSource = this.host.pendingPasteSource
        this.host.clipboardMode = this.host.pendingPasteMode
        this.host.pendingPasteEntries = []
        this.host.conflictResolvedKeys.clear()
        return
      case 'skip':
        break
      case 'overwrite':
        if (item.isDirectory) {
          if (item.direction === 'upload') {
            await this.host.mergeLocalDirToRemote(item.localPath, item.remotePath)
          } else {
            await this.host.downloadRemoteDir(item.remotePath, path.dirname(item.localPath), 'local')
          }
        } else if (item.isSamePane) {
          await this.handleSamePaneConflictOverwrite(item)
        } else if (item.direction === 'download') {
          await this.host.doDownload(item.remotePath, item.localPath, 0o644, item.remoteFileSize)
        } else {
          await this.host.doUpload(item.remotePath, item.localPath)
        }
        break
      case 'rename': {
        if (item.isDirectory) {
          const newName = `${item.fileName}_${Date.now().toString(36).toUpperCase()}`
          if (item.direction === 'upload') {
            const newRemote = path.posix.join(item.remoteDir, newName)
            await this.host.mergeLocalDirToRemote(item.localPath, newRemote)
          } else {
            await this.host.downloadRemoteDir(item.remotePath, path.dirname(item.localPath), 'local', undefined, newName)
          }
          break
        }
        const ext = path.extname(item.fileName)
        const nameNoExt = path.basename(item.fileName, ext)
        const newName = `${nameNoExt}_${Date.now().toString(36).toUpperCase()}${ext}`
        if (item.isSamePane) {
          await this.handleSamePaneConflictRename(item, newName)
        } else if (item.direction === 'download') {
          const newLocal = path.join(path.dirname(item.localPath), newName)
          await this.host.doDownload(item.remotePath, newLocal, 0o644, item.remoteFileSize)
        } else {
          const newRemote = path.posix.join(item.remoteDir, newName)
          await this.host.doUpload(newRemote, item.localPath)
        }
        break
      }
    }
    this.processNextConflict()
  }

  private async handleSamePaneConflictOverwrite(item: ConflictQueueItem): Promise<void> {
    const src = item.remotePath
    const dest = item.localPath
    if (item.samePaneSource === 'local') {
      try {
        const st = await fs.stat(src)
        if (st.isDirectory()) {
          await this.host.copyLocalDir(src, dest)
        } else {
          await fs.copyFile(src, dest)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane overwrite failed', e)
      }
    } else {
      if (!this.host.sftpSession) return
      try {
        const parentDir = path.posix.dirname(src)
        const baseName = path.posix.basename(src)
        const parentEntries = await this.host.sftpSession.readdir(parentDir)
        const srcEntry = parentEntries.find((e: any) => e.name === baseName)
        if (srcEntry) {
          await this.host.copyRemoteDir(src, dest, srcEntry.isDirectory)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane remote overwrite failed', e)
      }
    }
  }

  private async handleSamePaneConflictRename(item: ConflictQueueItem, newName: string): Promise<void> {
    const src = item.remotePath
    const destDir = path.dirname(item.localPath)
    const dest = path.join(destDir, newName)
    if (item.samePaneSource === 'local') {
      try {
        const st = await fs.stat(src)
        if (st.isDirectory()) {
          await this.host.copyLocalDir(src, dest)
        } else {
          await fs.copyFile(src, dest)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane rename failed', e)
      }
    } else {
      if (!this.host.sftpSession) return
      try {
        const parentDir = path.posix.dirname(src)
        const baseName = path.posix.basename(src)
        const parentEntries = await this.host.sftpSession.readdir(parentDir)
        const srcEntry = parentEntries.find((e: any) => e.name === baseName)
        if (srcEntry) {
          const destRemote = path.posix.join(destDir, newName)
          await this.host.copyRemoteDir(src, destRemote, srcEntry.isDirectory)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane remote rename failed', e)
      }
    }
  }

  private processNextConflict(): void {
    if (this.host.conflictQueue.length === 0) {
      this.host.conflictAllMode = 'ask'
      this.host.conflictOriginalTotal = 1
      this.host.selectedLocal = []
      this.host.selectedRemote = []
      if (this.host.pendingPasteEntries.length > 0) {
        const entries = this.host.pendingPasteEntries
        const destPane = this.host.pendingPasteDestPane
        const destPath = this.host.pendingPasteDestPath
        const mode = this.host.pendingPasteMode
        const source = this.host.pendingPasteSource
        this.host.pendingPasteEntries = []
        this.host.pendingPasteDestPane = 'local'
        this.host.pendingPasteDestPath = ''
        this.host.pendingPasteMode = 'copy'
        this.host.pendingPasteSource = 'local'
        void this.host.executePaste(
          entries.filter(e => !this.host.conflictResolvedKeys.has(pasteEntryKey(e))),
          destPane, destPath, mode, source,
        )
        this.host.conflictResolvedKeys.clear()
      } else {
        void this.host.refreshRemote()
        void this.host.refreshLocal()
      }
      this.host.cdr.detectChanges()
      return
    }

    if (this.host.conflictAllMode !== 'ask') {
      const item = this.host.conflictQueue.shift()
      if (item) void this.applyConflictAction(item, this.host.conflictAllMode)
      return
    }
    this.showConflictDialog()
  }
}

/**
 * 功能描述：SFTP+ 面板冲突弹窗解析器
 *   负责把冲突队列首项渲染为 ConflictFileInfo，并在弹窗显示后异步用 stat
 *   补正远程文件的真实大小与修改时间（readdir / 拖拽 payload 中的元数据不可靠）。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-11
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-02 — B18：修复 stat 返回 mtime 为 number（秒）时误用 .getTime() 导致远程修改时间变成 1970-01-01；B19 增加 attrs 嵌套字段解析与诊断 log；B24：statMtimeToMs 过滤 Unix epoch 无效时间，避免目录正确 modified 被 stat 覆盖
 */
import * as fs from 'fs/promises'
import * as path from 'path'

import { ConflictResolveUseCase, type ConflictResolvePorts } from '../core/conflict'
import { pasteEntryKey } from '../core/conflict'
import type { ConflictFileInfo, ConflictQueueItem, FolderTransferCtx, LocalEntry, SFTPFile } from '../core/panel-types'

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
  doDownload(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  doUpload(remotePath: string, localPath: string): Promise<boolean>
  downloadRemoteDir(remoteDir: string, localDestDir: string, targetPane?: 'local' | 'remote', _top?: any, renameTo?: string): Promise<boolean>
  mergeLocalDirToRemote(localSrc: string, remoteDest: string, reuseLogEntryId?: string): Promise<boolean>
  copyLocalDir(src: string, dest: string): Promise<void>
  copyRemoteDir(srcRemotePath: string, destRemotePath: string, isDirectory: boolean): Promise<void>
  /** ★ 2026-08-11：冲突解决成功后翻正来源传输记录（入队时已被误记失败） */
  markTransferSucceeded(ctx: FolderTransferCtx): void
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
    // 异步取远程文件的真值（readdir / 拖拽 payload 中的元数据不可靠，必须用 stat）
    const remoteFilePath = item.remotePath || path.posix.join(item.remoteDir, item.fileName)
    log.info('[conflict-dialog] initial remoteMtime:', item.remoteFileMtime, 'remotePath:', remoteFilePath, 'hasStat:', typeof (this.host.sftpSession as any)?.stat)
    if (remoteFilePath && this.host.sftpSession && typeof (this.host.sftpSession as any).stat === 'function') {
      (this.host.sftpSession as any).stat(remoteFilePath).then((st: any) => {
        if (!this.host.showConflictDialog || !this.host.conflictData || !st) return
        log.info('[conflict-dialog] stat result:', JSON.stringify(st))
        const sz = statSize(st)
        if (sz != null) this.host.conflictData.remoteSize = sz
        const mt = statMtimeToMs(st)
        log.info('[conflict-dialog] parsed remoteMtime:', mt, 'from stat')
        if (mt != null && mt > 0) this.host.conflictData.remoteMtime = mt
        this.host.cdr.detectChanges()
      }).catch((e: any) => {
        log.warn('[conflict-dialog] stat failed:', e?.message ?? e)
      })
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
        mergeLocalDirToRemote: (localSrc, remoteDest, reuseLogEntryId) => host.mergeLocalDirToRemote(localSrc, remoteDest, reuseLogEntryId),
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
        // ★ 2026-08-11：覆盖/重命名成功后翻正被误记失败的来源传输记录
        markTransferSucceeded: (ctx) => host.markTransferSucceeded(ctx),
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

/** 从 sftpSession.stat() 结果中安全提取文件大小（兼容 bigint / attrs 嵌套 / undefined） */
function statSize(st: any): number | undefined {
  const v = st?.size ?? st?.attrs?.size
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Unix epoch 阈值：小于此值的毫秒时间戳视为 1970-01-01 附近的无效时间 */
const EPOCH_THRESHOLD_MS = 86400000

/** 从 sftpSession.stat() 结果中安全提取修改时间（毫秒）。
 *  兼容字段：modified(Date/number/string) > mtime(number) > attrs.mtime/attrs.modified。
 *  SFTP 协议 mtime 为秒，数值小于 1e10 时乘 1000。
 *  过滤落在 Unix epoch 附近的时间，避免 stat 对目录返回 1970-01-01 时覆盖已有的正确值。 */
function statMtimeToMs(st: any): number | undefined {
  const raw = st?.modified ?? st?.mtime ?? st?.mtimeMs ?? st?.attrs?.modified ?? st?.attrs?.mtime
  if (raw instanceof Date) {
    const t = raw.getTime()
    return Number.isFinite(t) && t >= EPOCH_THRESHOLD_MS ? t : undefined
  }
  if (raw != null) {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return undefined
    const ms = n < 1e10 ? n * 1000 : n
    return ms >= EPOCH_THRESHOLD_MS ? ms : undefined
  }
  return undefined
}

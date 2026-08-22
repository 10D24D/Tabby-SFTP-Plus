/**
 * 功能描述：SFTP+ conflict 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-22 — 修复①重入锁 bug（fork #2 / 上游回归）：2026-08-15 引入的 _processing 锁使「Overwrite All/Skip All/Rename All」批量模式只剩第一条被处理、剩余队列静默卡死；拆出无锁 _drainQueue() 递归排空，resolve/processNext 仅持锁后调用它。修复②上传冲突检测逐文件 stat（fork #8）：改按 parentDir 缓存 listing + 并发单飞，目录内所有文件复用一份 readdir，仅 listing 缺字段时对该单文件回退 stat
 * 合并来源：conflict-rules, conflict-resolve, sftp-conflict-detector
 */

import * as path from 'path'

import { type ConflictQueueItem, type ConflictFileInfo, type FolderTransferCtx } from './panel-types'

import * as fs from 'fs/promises'

import { buildDownloadConflictInfo, buildUploadConflictInfo, DEFAULT_MTIME_TOLERANCE_MS, filesAreSame } from './transfer-types'


import { log } from '../../services/sftp-logger'
/**
 * 冲突相关纯函数
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-11
 *   conflictItemKey 优先返回 item.entryKey（= pasteEntryKey(entry)），与 resumePaste 过滤键一致
 */


export type ConflictActionMode = 'ask' | 'overwrite' | 'skip' | 'rename'

export function conflictItemKey(item: ConflictQueueItem): string {
  // 优先用入队时写入的 entryKey（= pasteEntryKey(entry)），与 resumePaste 的过滤键一致，
  // 否则已解决项不会被排除、会被二次执行（同面板自我拷贝会清空文件）
  return item.entryKey ?? `${item.direction}|${item.remotePath}|${item.localPath}`
}

export function pasteEntryKey(e: {
  name: string
  fullPath?: string
  remotePath?: string
  sourcePane?: 'local' | 'remote'
}): string {
  const pane = e.sourcePane ?? 'local'
  const p = pane === 'remote' ? (e.remotePath ?? e.name) : (e.fullPath ?? e.name)
  return `${pane}|${p}`
}

/** 将 UI 动作（含 *-all）规范为单次动作，并返回是否更新了全局模式 */
export function normalizeConflictAction(action: string): {
  action: 'cancel' | 'skip' | 'overwrite' | 'rename'
  allMode: ConflictActionMode | null
} {
  if (action === 'overwrite-all') return { action: 'overwrite', allMode: 'overwrite' }
  if (action === 'skip-all') return { action: 'skip', allMode: 'skip' }
  if (action === 'rename-all') return { action: 'rename', allMode: 'rename' }
  if (action === 'cancel' || action === 'skip' || action === 'overwrite' || action === 'rename') {
    return { action, allMode: null }
  }
  return { action: 'skip', allMode: null }
}

/** 生成冲突重命名文件名（保持扩展名） */
let _renameCounter = 0
export function buildConflictRenameName(fileName: string): string {
  const ext = path.extname(fileName)
  const nameNoExt = path.basename(fileName, ext)
  const suffix = Date.now().toString(36).toUpperCase() + (++_renameCounter).toString(36).toUpperCase() + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
  return `${nameNoExt}_${suffix}${ext}`
}

/** 生成目录冲突重命名名 */
export function buildConflictRenameDirName(dirName: string): string {
  const suffix = Date.now().toString(36).toUpperCase() + (++_renameCounter).toString(36).toUpperCase() + Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0')
  return `${dirName}_${suffix}`
}

/** Unix epoch 阈值：小于此值的毫秒时间戳视为 1970-01-01 附近的无效时间 */
const EPOCH_THRESHOLD_MS = 86400000

/** 从 stat / readdir 条目中安全提取远程修改时间（毫秒）。
 *  兼容字段：modified(Date) > mtime(number) > mtimeMs(number) > attrs.modified/attrs.mtime。
 *  SFTP 协议 mtime 为秒；当数值小于 1e10（≈2286 年）时视为秒并乘 1000，
 *  大于等于 1e10 时视为毫秒不再乘。
 *  过滤落在 Unix epoch 附近的时间（某些 SFTP 服务器对目录 stat 返回 1970-01-01）。 */
export function parseRemoteMtime(st: any): number | undefined {
  if (!st) return undefined
  const raw = st.modified ?? st.mtime ?? st.mtimeMs ?? st.attrs?.modified ?? st.attrs?.mtime
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

/**
 * 冲突检测端口 + 冲突解决用例
 * 合并自: conflict-ports.ts, conflict-resolve-ports.ts, conflict-resolve-use-case.ts
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-11
 *   修复冲突重命名/覆盖导致文件变空白：同面板自我拷贝守卫（fs.copyFile 先截断 dest 再读已清空 src）；
 *   conflictItemKey 优先用 item.entryKey，与 resumePaste 的 pasteEntryKey 一致，避免已解决项被二次执行
 * 修改时间：2026-07-12
 *   _samePaneRename/_samePaneOverwrite 远程分支强制按"文件"走 copyRemoteDir(...,false)：
 *   旧版依赖 srcEntry.isDirectory，但 SFTP readdir 元数据可能 stale/错认，
 *   把文件当目录会走 mkdir+readdir(src) 死路 → dest 变 0B（症状：远程同面板重命名/覆盖出新空文件）。
 *   applyAction 在调用前已区分 isDirectory，这里只处理文件，强制 false 安全。
 *   _samePaneRename 加诊断日志（src/dest/源大小），配合底层 copyLocalFile realpath 守卫定位本地自我截断
 */


// ─── 冲突检测端口 ───────────────────────────────────────────

export interface ConflictDetectionPort {
  checkUploadConflict(remotePath: string, localPath: string, localSize: number, localMtime: number): Promise<ConflictFileInfo | null>
  checkLocalConflict(localPath: string, remotePath: string, remoteSize: number, remoteMtime: number): Promise<ConflictFileInfo | null>
  checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean>
}

export interface ConflictQueuePort {
  enqueue(item: ConflictQueueItem): void
  showDialog(): void
}

// ─── 冲突解决端口 ───────────────────────────────────────────

export interface ConflictResolveExecutionPort {
  // ★ 2026-08-10：传输方法返回 boolean（true=完整成功），剪切删源前必须校验
  // ★ 2026-08-11：reuseLogEntryId 传入时合并传输复用来源传输记录并自行收尾成败
  mergeLocalDirToRemote(localSrc: string, remoteDest: string, reuseLogEntryId?: string): Promise<boolean>
  downloadRemoteDir(remotePath: string, localDestParent: string, localName?: string): Promise<boolean>
  doDownload(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  doUpload(remotePath: string, localPath: string): Promise<boolean>
  copyLocalDir(src: string, dest: string): Promise<void>
  copyLocalFile(src: string, dest: string): Promise<void>
  copyRemoteDir(srcRemotePath: string, destRemotePath: string, isDirectory: boolean): Promise<void>
  /** 远程 server-side 重命名（同服移动，秒级，用于剪切覆盖/重命名） */
  renameRemote(src: string, dest: string): Promise<void>
  statLocal(path: string): Promise<{ isDirectory: boolean } | null>
  readdirRemote(parentDir: string): Promise<Array<{ name: string; isDirectory: boolean }>>
  /** ★ 2026-08-11：冲突解决成功后，把已被 finish(false) 误记失败的来源传输记录翻正 */
  markTransferSucceeded(ctx: FolderTransferCtx): void
  hasSftpSession(): boolean
  /** 删除本地文件（剪切模式冲突解决后清理源文件） */
  unlinkLocal(path: string): Promise<void>
  /** 删除远程文件（剪切模式冲突解决后清理源文件） */
  unlinkRemote(path: string): Promise<void>
}

export interface ConflictPendingPastePort {
  hasPendingPaste(): boolean
  restoreClipboardFromPending(): void
  clearPending(): void
  resumePaste(resolvedKeys: Set<string>): Promise<void>
}

export interface ConflictQueueStatePort {
  shift(): ConflictQueueItem | undefined
  clear(): void
  length(): number
  markResolved(key: string): void
  getResolvedKeys(): Set<string>
  clearResolvedKeys(): void
  getAllMode(): ConflictActionMode
  setAllMode(mode: ConflictActionMode): void
  resetAllMode(): void
  resetOriginalTotal(): void
}

export interface ConflictResolveUiPort {
  hideDialog(): void
  clearSelection(): void
  refreshPanes(): void
  showNextDialog(): void
}

export interface ConflictResolvePorts {
  execution: ConflictResolveExecutionPort
  pendingPaste: ConflictPendingPastePort
  queue: ConflictQueueStatePort
  ui: ConflictResolveUiPort
}

// ─── 冲突解决用例 ───────────────────────────────────────────

export class ConflictResolveUseCase {
  constructor(private readonly ports: ConflictResolvePorts) {}

  /** ★ 2026-08-15 修复 #3：重入锁——防止 resolve/processNext 并发消费同一条目 */
  private _processing = false

  async resolve(action: string): Promise<void> {
    if (this._processing) return
    this._processing = true
    try {
      this.ports.ui.hideDialog()
      const { action: normalized, allMode } = normalizeConflictAction(action)
      if (allMode) this.ports.queue.setAllMode(allMode)

      const current = this.ports.queue.shift()
      if (!current) {
        // 理论上不会走到（dialog 已弹出说明有项）；直接排空收尾
        await this._drainQueue()
        return
      }
      // ★ 2026-08-10 修复 #11：单项执行抛错（传输失败等）不得中断整个队列，
      //   也不得阻断后续排队（否则批量模式下剩余冲突永远不处理）
      let shouldContinue = true
      try {
        shouldContinue = await this.applyAction(current, normalized)
      } catch (e) {
        log.error('Conflict resolve failed for item', current.fileName, e)
      }
      // ★ 2026-08-22 修复重入锁 bug（fork 报 #2 / 上游回归）：processNext 自带 _processing 守卫，
      //   若在此持锁调用会被守卫直接 return，导致「Overwrite All / Skip All / Rename All」只剩第一条被处理、
      //   剩余队列静默卡死（dialog 已隐藏、进度不动）。改为调用 _drainQueue（不重复加锁）递归排空整个队列。
      if (shouldContinue) await this._drainQueue()
    } finally {
      this._processing = false
    }
  }

  /** ★ 2026-08-22：真正的队列排空逻辑。递归消费时不重复加 _processing 锁，
   *  仅由 resolve / processNext 在已持有 _processing 期间调用，避免批量模式被锁拦截。 */
  private async _drainQueue(): Promise<void> {
    if (this.ports.queue.length() === 0) {
      this.ports.queue.resetAllMode()
      this.ports.queue.resetOriginalTotal()
      this.ports.ui.clearSelection()
      if (this.ports.pendingPaste.hasPendingPaste()) {
        await this.ports.pendingPaste.resumePaste(this.ports.queue.getResolvedKeys())
        this.ports.queue.clearResolvedKeys()
      } else {
        this.ports.ui.refreshPanes()
      }
      return
    }

    if (this.ports.queue.getAllMode() !== 'ask') {
      const item = this.ports.queue.shift()
      const mode = this.ports.queue.getAllMode()
      // ★ 2026-08-10 修复 #11：批量模式下单项失败同样不得中断队列
      if (item && mode !== 'ask') {
        try {
          await this.applyAction(item, mode)
        } catch (e) {
          log.error('Conflict resolve failed for item', item.fileName, e)
        }
      }
      await this._drainQueue()
      return
    }

    this.ports.ui.showNextDialog()
  }

  async applyAction(
    item: ConflictQueueItem,
    action: 'cancel' | 'skip' | 'overwrite' | 'rename',
  ): Promise<boolean> {
    this.ports.queue.markResolved(conflictItemKey(item))
    const exec = this.ports.execution

    switch (action) {
      case 'cancel':
        this.ports.queue.clear()
        this.ports.pendingPaste.restoreClipboardFromPending()
        this.ports.pendingPaste.clearPending()
        this.ports.queue.clearResolvedKeys()
        return false
      case 'skip':
        return true
      case 'overwrite':
        if (item.isDirectory) {
          let ok: boolean
          if (item.direction === 'upload') {
            // ★ 2026-08-11：合并上传复用来源记录并自建进度条目，成败由其收尾，不再翻正
            ok = await exec.mergeLocalDirToRemote(item.localPath, item.remotePath, item.transferCtx?.logEntryId)
          } else {
            ok = await exec.downloadRemoteDir(item.remotePath, path.dirname(item.localPath))
            this._flipTransferLog(item, ok)
          }
          await this._deleteSourceIfCut(item, ok)
        } else if (item.isSamePane) {
          const consumed = await this._samePaneOverwrite(item)
          if (!consumed) await this._deleteSourceIfCut(item)
        } else if (item.direction === 'download') {
          const ok = await exec.doDownload(item.remotePath, item.localPath, 0o644, item.remoteFileSize)
          await this._deleteSourceIfCut(item, ok)
          this._flipTransferLog(item, ok)
        } else {
          const ok = await exec.doUpload(item.remotePath, item.localPath)
          await this._deleteSourceIfCut(item, ok)
          this._flipTransferLog(item, ok)
        }
        return true
      case 'rename': {
        if (item.isDirectory) {
          const newName = buildConflictRenameDirName(item.fileName)
          let ok: boolean
          if (item.direction === 'upload') {
            const newRemote = path.posix.join(item.remoteDir, newName)
            ok = await exec.mergeLocalDirToRemote(item.localPath, newRemote, item.transferCtx?.logEntryId)
          } else {
            ok = await exec.downloadRemoteDir(item.remotePath, path.dirname(item.localPath), newName)
            this._flipTransferLog(item, ok)
          }
          await this._deleteSourceIfCut(item, ok)
          return true
        }
        const newName = buildConflictRenameName(item.fileName)
        if (item.isSamePane) {
          const consumed = await this._samePaneRename(item, newName)
          if (!consumed) await this._deleteSourceIfCut(item)
        } else if (item.direction === 'download') {
          const newLocal = path.join(path.dirname(item.localPath), newName)
          const ok = await exec.doDownload(item.remotePath, newLocal, 0o644, item.remoteFileSize)
          await this._deleteSourceIfCut(item, ok)
          this._flipTransferLog(item, ok)
        } else {
          const newRemote = path.posix.join(item.remoteDir, newName)
          const ok = await exec.doUpload(newRemote, item.localPath)
          await this._deleteSourceIfCut(item, ok)
          this._flipTransferLog(item, ok)
        }
        return true
      }
    }
  }

  /** ★ 2026-08-11：冲突入队时来源传输已被 finish(false) 记失败；覆盖/重命名真正
   *  传完后把记录翻正，避免「文件都到位了但传输记录显示失败」 */
  private _flipTransferLog(item: ConflictQueueItem, ok: boolean): void {
    if (!ok || !item.transferCtx) return
    try { this.ports.execution.markTransferSucceeded(item.transferCtx) } catch { /* ignore */ }
  }

  async processNext(): Promise<void> {
    if (this._processing) return
    this._processing = true
    try {
      await this._drainQueue()
    } finally {
      this._processing = false
    }
  }

  private async _deleteSourceIfCut(item: ConflictQueueItem, transferOk = true): Promise<void> {
    if (item.mode !== 'cut') return
    // ★ 2026-08-10：传输未完整成功（取消/暂停/失败）时绝不删源，避免剪切数据丢失
    if (!transferOk) {
      log.warn('Cut source delete skipped: transfer not completed', item.fileName)
      return
    }
    const exec = this.ports.execution
    try {
      if (item.isSamePane) {
        // 同面板：源文件 = remotePath（_buildFileConflictItem 中 isSamePane=true 时）
        if (item.samePaneSource === 'local') await exec.unlinkLocal(item.remotePath)
        else await exec.unlinkRemote(item.remotePath)
      } else if (item.direction === 'upload') {
        // 本地上传：源文件 = localPath
        await exec.unlinkLocal(item.localPath)
      } else {
        // 远程下载：源文件 = remotePath
        await exec.unlinkRemote(item.remotePath)
      }
    } catch (e) {
      log.error('Cut source delete failed', item.remotePath, e)
    }
  }

  private async _samePaneOverwrite(item: ConflictQueueItem): Promise<boolean> {
    const src = item.remotePath
    const dest = item.localPath
    const exec = this.ports.execution
    // 自我覆盖（源==目标）：fs.copyFile 先截断 dest 再读已清空的 src → 文件变空白，直接跳过
    const sameFile = item.samePaneSource === 'local'
      ? path.resolve(src) === path.resolve(dest)
      : src === dest
    if (sameFile) return false
    if (item.samePaneSource === 'local') {
      try {
        const st = await exec.statLocal(src)
        if (!st) return false
        if (st.isDirectory) await exec.copyLocalDir(src, dest)
        else await exec.copyLocalFile(src, dest)
      } catch (e) {
        log.error('Same-pane overwrite failed', e)
      }
      return false
    }
    if (!exec.hasSftpSession()) return false
    try {
      // 同服移动（剪切覆盖）：直接用 server-side rename，秒级完成，无需下载再上传（全量走网络 → 慢）
      if (item.mode === 'cut') {
        try {
          await exec.renameRemote(src, dest)
        } catch {
          // 极少数服务器 rename 不覆盖已存在文件：先删目标再重命名
          await exec.unlinkRemote(dest)
          await exec.renameRemote(src, dest)
        }
        return true // 源已随 rename 移除，applyAction 无需再删源
      }
      // 复制模式（保留源）：保持原下载+上传（部分服务器不支持 server-side copy）
      const parentDir = path.posix.dirname(src)
      const baseName = path.posix.basename(src)
      const parentEntries = await exec.readdirRemote(parentDir)
      const srcEntry = parentEntries.find(e => e.name === baseName)
      if (srcEntry) {
        // [2026-07-12 修复] 同 _samePaneRename：不能依赖 srcEntry.isDirectory，
        // 强制按"文件"路径处理（overwrite 场景一定是文件，目录合并走 applyAction 的 isDirectory 分支）
        await exec.copyRemoteDir(src, dest, false)
      }
      return false
    } catch (e) {
      log.error('Same-pane remote overwrite failed', e)
      return false
    }
  }

  private async _samePaneRename(item: ConflictQueueItem, newName: string): Promise<boolean> {
    const src = item.remotePath
    const destDir = path.dirname(item.localPath)
    const dest = path.join(destDir, newName)
    const exec = this.ports.execution
    // 防御：重命名目标恒不等于源，但保留自我拷贝守卫以防回归
    const sameFile = item.samePaneSource === 'local'
      ? path.resolve(src) === path.resolve(dest)
      : src === dest
    if (sameFile) return false
    if (item.samePaneSource === 'local') {
      try {
        const st = await exec.statLocal(src)
        if (!st) return false
        // [诊断] 记录重命名拷贝时的源路径/目标路径/源是否目录（若源 size=0 说明更早被截断）
        log.info('_samePaneRename local:', { src, dest, isDir: st.isDirectory })
        if (st.isDirectory) await exec.copyLocalDir(src, dest)
        else await exec.copyLocalFile(src, dest)
      } catch (e) {
        log.error('Same-pane rename failed', e)
      }
      return false
    }
    if (!exec.hasSftpSession()) return false
    try {
      // [2026-07-12 修复] ★ 关键修复：item.localPath 是 posix 路径（远程同面板），
      // 但 path.dirname 在 Windows 上会把正斜杠转反斜杠 → path.posix.join 再混用时报错路 → 上传 0B
      // 必须用 path.posix.dirname 处理远程路径
      const destRemote = path.posix.join(path.posix.dirname(item.localPath), newName)
      // 同服移动（剪切重命名）：server-side rename 秒级完成，无需下载再上传（全量走网络 → 慢）
      if (item.mode === 'cut') {
        try {
          await exec.renameRemote(src, destRemote)
        } catch {
          await exec.unlinkRemote(destRemote)
          await exec.renameRemote(src, destRemote)
        }
        return true // 源已随 rename 移除，applyAction 无需再删源
      }
      const parentDir = path.posix.dirname(src)
      const baseName = path.posix.basename(src)
      const parentEntries = await exec.readdirRemote(parentDir)
      const srcEntry = parentEntries.find(e => e.name === baseName)
      if (srcEntry) {
        // 强制按"文件"走：download(src→tmp) + upload(tmp→dest)
        await exec.copyRemoteDir(src, destRemote, false)
      }
      return false
    } catch (e) {
      log.error('Same-pane remote rename failed', e)
      return false
    }
  }
}

/**
 * SFTP/本地文件系统冲突检测（基础设施实现）
 */


export interface SftpConflictSession {
  stat?(remotePath: string): Promise<{ size?: number; modified?: Date; mtime?: number }>
  readdir(parentDir: string): Promise<Array<{ name: string; size?: number; modified?: Date; isDirectory?: boolean }>>
}

export class SftpConflictDetector implements ConflictDetectionPort {
  constructor(
    private readonly getSession: () => SftpConflictSession | null,
    private readonly mtimeToleranceMs = DEFAULT_MTIME_TOLERANCE_MS,
  ) {}

  // ★ 2026-08-22 修复（fork #8）：同目录多文件上传不再逐文件 stat。
  //   按 parentDir 缓存一次 readdir 结果（并发单飞），目录内所有文件复用同一份 listing，
  //   仅在 listing 缺 size/mtime 时才对该单文件回退 stat。
  private _dirListingCache = new Map<string, Promise<Map<string, { size?: number; mtime?: number }>>>()

  private async _getDirListing(parentDir: string): Promise<Map<string, { size?: number; mtime?: number }>> {
    const existing = this._dirListingCache.get(parentDir)
    if (existing) return existing
    const p = (async () => {
      const map = new Map<string, { size?: number; mtime?: number }>()
      try {
        const session = this.getSession()
        if (!session) return map
        const entries = await session.readdir(parentDir)
        for (const e of entries as any[]) {
          const rawSize = e?.size ?? e?.attrs?.size
          const size = rawSize != null ? Number(rawSize) : undefined
          map.set(e.name, {
            size: size != null && Number.isFinite(size) ? size : undefined,
            mtime: parseRemoteMtime(e),
          })
        }
      } catch {
        // readdir 失败：返回空 map，调用方按「无法确认存在」处理（与旧版一致：不报错、不阻断上传）
      }
      return map
    })()
    this._dirListingCache.set(parentDir, p)
    // 解析后移除，避免长期持有；并发期间由同一 Promise 去重，确保同目录只查一次
    void p.then(() => this._dirListingCache.delete(parentDir)).catch(() => this._dirListingCache.delete(parentDir))
    // 防御性上限，防止极长会话内存堆积
    if (this._dirListingCache.size > 256) this._dirListingCache.clear()
    return p
  }

  async checkUploadConflict(
    remotePath: string,
    localPath: string,
    localSize: number,
    localMtime: number,
  ): Promise<ConflictFileInfo | null> {
    const session = this.getSession()
    if (!session) return null
    const parentDir = path.posix.dirname(remotePath)
    const fileName = path.basename(remotePath)

    let remoteSize: number | undefined
    let remoteMtime: number | undefined

    log.info('[check-upload-conflict] remotePath:', remotePath, 'localSize:', localSize, 'localMtime:', localMtime)

    // ★ 2026-08-22：优先用目录 listing 缓存（同目录只查一次），替代逐文件 stat
    const listing = await this._getDirListing(parentDir)
    const found = listing.get(fileName)

    if (found) {
      remoteSize = found.size
      remoteMtime = found.mtime
      // listing 缺字段时按需回退单文件 stat（仅缺字段的那一个文件，而非全部）
      if ((remoteSize == null || remoteMtime == null) && session.stat) {
        try {
          const st = await session.stat(remotePath) as any
          log.info('[check-upload-conflict] stat fallback result:', JSON.stringify(st))
          const sz = st?.size ?? st?.attrs?.size
          const szNum = sz != null ? Number(sz) : undefined
          if (remoteSize == null && szNum != null && Number.isFinite(szNum) && szNum >= 0) remoteSize = szNum
          if (remoteMtime == null) {
            const mt = parseRemoteMtime(st)
            if (mt != null) remoteMtime = mt
          }
        } catch (e) {
          log.warn('[check-upload-conflict] stat fallback failed:', e)
        }
      }
    } else {
      log.info('[check-upload-conflict] not in parent listing (remote file absent):', fileName)
    }

    log.info('[check-upload-conflict] final remoteSize:', remoteSize, 'remoteMtime:', remoteMtime)

    // 两个来源都无法确认远程文件存在 → 不冲突（按"不存在"处理，直接上传覆盖）
    if (remoteSize == null) return null

    const rs = remoteSize
    const rm = remoteMtime ?? 0
    if (filesAreSame(localSize, localMtime, rs, rm, this.mtimeToleranceMs)) return null
    return buildUploadConflictInfo(remotePath, localPath, fileName, localSize, localMtime, rs, rm)
  }

  async checkLocalConflict(
    localPath: string,
    remotePath: string,
    remoteSize: number,
    remoteMtime: number,
  ): Promise<ConflictFileInfo | null> {
    try {
      const st = await fs.stat(localPath)
      if (filesAreSame(st.size, st.mtimeMs, remoteSize, remoteMtime, this.mtimeToleranceMs)) return null
      return buildDownloadConflictInfo(localPath, remotePath, remoteSize, remoteMtime, st.size, st.mtimeMs)
    } catch { /* 文件不存在，不冲突 */ }
    return null
  }

  async checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean> {
    const session = this.getSession()
    if (!session) return false
    if (session.stat) {
      try {
        const st = await session.stat(remotePath) as { isDirectory?: () => boolean } | null
        // ★ 2026-08-10 修复 #20：stat 分支同样尊重 expectDir，避免把同名文件误判为目录冲突
        if (expectDir === undefined) return true
        const isDir = st && typeof st.isDirectory === 'function' ? st.isDirectory() : undefined
        if (isDir === undefined) return true // 无法判定类型时保守认为存在
        return expectDir ? isDir : !isDir
      } catch { return false }
    }
    const parentDir = path.posix.dirname(remotePath)
    const name = path.basename(remotePath)
    try {
      const entries = await session.readdir(parentDir)
      const found = entries.find(e => e.name === name)
      if (!found) return false
      if (expectDir === undefined) return true
      return expectDir ? !!found.isDirectory : !found.isDirectory
    } catch { return false }
  }
}


/**
 * 功能描述：SFTP+ conflict 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Claude Opus 5
 * @修改时间：2026-09-21 — P1 修复：applyAction 的 overwrite/rename 把 isSamePane 判断提到 isDirectory
 *              之前 —— 同面板目录冲突原会落进跨栏分支走 mergeLocalDirToRemote/downloadRemoteDir，
 *              本地→本地的目录复制被当成「合并上传到远程」，方向完全错；同面板处理器按
 *              item.isDirectory 传递 copyRemoteDir 的 isDir；目录剪切不再走 backup 策略
 *              （unlinkRemote 删不掉目录，失败会在服务器上永久留下 *.sftp-plus-bak-* 目录）
 *              2026-09-21 — 第六轮审计 P1 修复：_samePaneOverwrite 删除「unlink(backup) 失败就把 backup
 *              改名回 dest」的危险 fallback（此时 dest 已是 src 内容，回滚即剪切丢数据）及重复 unlink
 *              2026-09-20 — 单端摘要失败仍回传另一端供 UI 展示（auto-skip 仍要求两端齐全）
 *              2026-09-20 — 同面板剪切仅成功后删源；共享 transferCtx 的 skip/flip；size+mtime 相同视为 auto-skipped；目录剪切走递归删除；下载覆盖强制合并
 *              2026-09-17 — 冲突「取消/跳过」删除误记的失败传输记录（未真正传输）
 *              2026-09-07 — issue #15：冲突检测支持内容摘要
 * 合并来源：conflict-rules, conflict-resolve, sftp-conflict-detector
 */

import * as path from 'path'

import { type ConflictQueueItem, type ConflictFileInfo, type FolderTransferCtx } from './panel-types'

import * as fs from 'fs/promises'

import { buildDownloadConflictInfo, buildUploadConflictInfo, DEFAULT_MTIME_TOLERANCE_MS, filesAreSame, isContentIdentical, type ConflictDigestInfo } from './transfer-types'
import type { ContentDigestPort } from './digest'


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


/** 自动跳过回调参数：用于协调器通知面板更新传输记录 */
export type AutoSkippedInfo = {
  direction: 'upload' | 'download'
  localPath: string
  remotePath: string
  /** 计算结果摘要（任一端为 null 都视为不可信，结果仍按 auto-skipped 处理：内容相同） */
  digest?: ConflictDigestInfo | null
}

/**
 * ★ 2026-09-07 issue #15+：冲突检测的完整结果枚举，把「自动跳过」与「无冲突」分离。
 * - no-conflict：目标不存在，调用方应首次传输（勿把「内容已相同」塞进此分支）
 * - auto-skipped：已确认相同（size+mtime 容差内，或内容摘要匹配），调用方必须跳过
 * - conflict：需由用户决定覆盖/重命名/跳过，调用方入队弹框
 */
export type ConflictCheckOutcome =
  | { kind: 'no-conflict' }
  | { kind: 'auto-skipped'; digest?: ConflictDigestInfo | null }
  | { kind: 'conflict'; info: ConflictFileInfo }

// ─── 冲突检测端口 ───────────────────────────────────────────

export interface ConflictDetectionPort {
  /**
   * 上传方向冲突检测：
   * - no-conflict ⇒ 远端不存在，调用方上传（首次）
   * - auto-skipped ⇒ 内容已确认相同，调用方必须跳过
   * - conflict ⇒ 入队弹框
   */
  checkUploadConflict(
    remotePath: string,
    localPath: string,
    localSize: number,
    localMtime: number,
  ): Promise<ConflictCheckOutcome>
  /**
   * 下载方向冲突检测，语义同上：
   * - no-conflict ⇒ 本地不存在，调用方下载（首次）
   * - auto-skipped ⇒ 内容已确认相同，调用方必须跳过
   * - conflict ⇒ 入队弹框
   */
  checkLocalConflict(
    localPath: string,
    remotePath: string,
    remoteSize: number,
    remoteMtime: number,
  ): Promise<ConflictCheckOutcome>
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
  /** ★ 2026-09-20：forceOverwrite=true 时跳过子文件冲突检测（用户已明确选目录覆盖） */
  downloadRemoteDir(remotePath: string, localDestParent: string, localName?: string, forceOverwrite?: boolean): Promise<boolean>
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
  /** ★ 2026-09-17：冲突取消/跳过时删除误记的失败传输记录（实际未传） */
  discardTransferLog(ctx: FolderTransferCtx): void
  hasSftpSession(): boolean
  /** 删除本地文件（剪切模式冲突解决后清理源文件） */
  unlinkLocal(path: string): Promise<void>
  /** 删除远程文件（剪切模式冲突解决后清理源文件） */
  unlinkRemote(path: string): Promise<void>
  /** ★ 2026-09-20：目录剪切需递归删除（单文件 unlink 对目录常 EISDIR） */
  deleteLocalRecursive(path: string): Promise<void>
  deleteRemoteRecursive(path: string): Promise<void>
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
  /** 当前队列快照（不含已 shift 的当前项） */
  snapshot(): ConflictQueueItem[]
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
  /** ★ 2026-09-20：共享 transferCtx 上至少有一次覆盖/重命名成功（决定末项 skip 是 discard 还是 flip） */
  private _ctxHadSuccess = new Set<string>()

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
      this._ctxHadSuccess.clear()
      this.ports.ui.clearSelection()
      if (this.ports.pendingPaste.hasPendingPaste()) {
        await this.ports.pendingPaste.resumePaste(this.ports.queue.getResolvedKeys())
        this.ports.queue.clearResolvedKeys()
        // ★ 2026-08-24 防御：resumePaste→executePaste 可能入队新冲突。
        //   executePaste 自身会调 showConflictDialog 弹窗，但若其内部路径未弹窗，
        //   此处复查确保新冲突不致静默滞留队列。
        if (this.ports.queue.length() > 0) {
          this.ports.ui.showNextDialog()
        }
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
      case 'cancel': {
        // ★ 2026-09-17：冲突入队时已 finish(false) 误记失败；用户取消=未传输，应删除记录而非留红叉
        this._discardConflictTransferLog(item, true)
        for (const q of this.ports.queue.snapshot()) this._discardConflictTransferLog(q, true)
        this._ctxHadSuccess.clear()
        this.ports.queue.clear()
        this.ports.pendingPaste.restoreClipboardFromPending()
        this.ports.pendingPaste.clearPending()
        this.ports.queue.clearResolvedKeys()
        return false
      }
      case 'skip':
        // 跳过同样未真正传输；共享 ctx 时等队列中同批项都处理完再 discard/flip
        this._finalizeSharedCtxOnSkip(item)
        return true
      case 'overwrite':
        // ★ 2026-09-21 P1 修复：isSamePane 必须先于 isDirectory 判断。
        //   同面板（本地→本地 / 远程→远程）目录冲突若落进下面的 isDirectory 分支，
        //   会被当成跨栏传输去走 mergeLocalDirToRemote / downloadRemoteDir——
        //   本地→本地的目录复制会变成「合并上传到远程」，方向完全错。
        if (item.isSamePane) {
          const outcome = await this._samePaneOverwrite(item)
          if (outcome === 'copied') await this._deleteSourceIfCut(item, true)
          // moved：源已通过 rename 挪走；failed：禁止删源
        } else if (item.isDirectory) {
          let ok: boolean
          if (item.direction === 'upload') {
            // ★ 2026-08-11：合并上传复用来源记录并自建进度条目，成败由其收尾，不再翻正
            ok = await exec.mergeLocalDirToRemote(item.localPath, item.remotePath, item.transferCtx?.logEntryId)
          } else {
            // ★ 2026-09-20：下载目录覆盖强制合并，避免子文件再次弹冲突（与上传 merge 对称）
            ok = await exec.downloadRemoteDir(item.remotePath, path.dirname(item.localPath), undefined, true)
            this._flipTransferLog(item, ok)
          }
          await this._deleteSourceIfCut(item, ok)
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
        // ★ 2026-09-21 P1 修复：同面板优先（理由同 overwrite 分支）；目录用目录命名规则
        if (item.isSamePane) {
          const newName = item.isDirectory
            ? buildConflictRenameDirName(item.fileName)
            : buildConflictRenameName(item.fileName)
          const outcome = await this._samePaneRename(item, newName)
          if (outcome === 'copied') await this._deleteSourceIfCut(item, true)
          return true
        }
        if (item.isDirectory) {
          const newName = buildConflictRenameDirName(item.fileName)
          let ok: boolean
          if (item.direction === 'upload') {
            const newRemote = path.posix.join(item.remoteDir, newName)
            ok = await exec.mergeLocalDirToRemote(item.localPath, newRemote, item.transferCtx?.logEntryId)
          } else {
            ok = await exec.downloadRemoteDir(item.remotePath, path.dirname(item.localPath), newName, true)
            this._flipTransferLog(item, ok)
          }
          await this._deleteSourceIfCut(item, ok)
          return true
        }
        const newName = buildConflictRenameName(item.fileName)
        if (item.direction === 'download') {
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

  /** 队列中仍挂着同一 transferCtx 的冲突项数量（当前项已 shift） */
  private _remainingSharedCtxCount(item: ConflictQueueItem): number {
    const id = item.transferCtx?.logEntryId
    if (id == null || id === '') return 0
    return this.ports.queue.snapshot().filter(q => q.transferCtx?.logEntryId === id).length
  }

  /** ★ 2026-08-11：冲突入队时来源传输已被 finish(false) 记失败；覆盖/重命名真正
   *  传完后把记录翻正。共享 ctx 时等同批冲突全部解决后再翻正。 */
  private _flipTransferLog(item: ConflictQueueItem, ok: boolean): void {
    if (!ok || !item.transferCtx) return
    const id = item.transferCtx.logEntryId
    if (id) this._ctxHadSuccess.add(id)
    if (this._remainingSharedCtxCount(item) > 0) return
    try { this.ports.execution.markTransferSucceeded(item.transferCtx) } catch { /* ignore */ }
    if (id) this._ctxHadSuccess.delete(id)
  }

  /** 跳过：若同批还有冲突项则保留日志；末项时有过成功则翻正，否则 discard */
  private _finalizeSharedCtxOnSkip(item: ConflictQueueItem): void {
    if (!item.transferCtx) return
    if (this._remainingSharedCtxCount(item) > 0) return
    const id = item.transferCtx.logEntryId
    if (id && this._ctxHadSuccess.has(id)) {
      try { this.ports.execution.markTransferSucceeded(item.transferCtx) } catch { /* ignore */ }
      this._ctxHadSuccess.delete(id)
      return
    }
    this._discardConflictTransferLog(item, true)
  }

  /** ★ 2026-09-17：取消/跳过时删除误记失败记录；force 忽略共享计数（取消整批） */
  private _discardConflictTransferLog(item: ConflictQueueItem, force = false): void {
    if (!item.transferCtx) return
    if (!force && this._remainingSharedCtxCount(item) > 0) return
    try { this.ports.execution.discardTransferLog(item.transferCtx) } catch { /* ignore */ }
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
      if (item.isDirectory) {
        // ★ 2026-09-20：目录必须递归删；unlink 对目录会 EISDIR，此前剪切覆盖后源目录残留
        if (item.isSamePane) {
          if (item.samePaneSource === 'local') await exec.deleteLocalRecursive(item.remotePath)
          else await exec.deleteRemoteRecursive(item.remotePath)
        } else if (item.direction === 'upload') {
          await exec.deleteLocalRecursive(item.localPath)
        } else {
          await exec.deleteRemoteRecursive(item.remotePath)
        }
        return
      }
      if (item.isSamePane) {
        // 同面板：源文件 = remotePath（_buildFileConflictItem 中 isSamePane=true 时）
        if (item.samePaneSource === 'local') await exec.unlinkLocal(item.remotePath)
        else await exec.unlinkRemote(item.remotePath)
      } else if (item.direction === 'upload') {
        await exec.unlinkLocal(item.localPath)
      } else {
        await exec.unlinkRemote(item.remotePath)
      }
    } catch (e) {
      log.error('Cut source delete failed', item.remotePath, e)
    }
  }

  /** @returns moved=源已挪走；copied=拷贝成功（剪切需再删源）；failed=失败勿删源 */
  private async _samePaneOverwrite(item: ConflictQueueItem): Promise<'moved' | 'copied' | 'failed'> {
    const src = item.remotePath
    const dest = item.localPath
    const exec = this.ports.execution
    // 自我覆盖（源==目标）：fs.copyFile 先截断 dest 再读已清空的 src → 文件变空白，直接跳过
    const sameFile = item.samePaneSource === 'local'
      ? path.resolve(src) === path.resolve(dest)
      : src === dest
    if (sameFile) return 'failed'
    if (item.samePaneSource === 'local') {
      try {
        const st = await exec.statLocal(src)
        if (!st) return 'failed'
        if (st.isDirectory) await exec.copyLocalDir(src, dest)
        else await exec.copyLocalFile(src, dest)
        return 'copied'
      } catch (e) {
        log.error('Same-pane overwrite failed', e)
        return 'failed'
      }
    }
    if (!exec.hasSftpSession()) return 'failed'
    try {
      // ★ 2026-09-21 P1 修复：目录剪切不走「备份 dest」策略——unlinkRemote 删不掉目录，
      //   失败路径会在服务器上永久留下 *.sftp-plus-bak-* 目录。先直接试 rename
      //   （dest 不存在或为空目录时可成功），失败则落到下面的复制路径，
      //   源由 _deleteSourceIfCut 递归删除。
      if (item.mode === 'cut' && item.isDirectory) {
        try {
          await exec.renameRemote(src, dest)
          return 'moved'
        } catch (e) {
          log.info('same-pane dir cut: rename failed, falling back to copy+delete:', src, '->', dest, e)
        }
      }
      // 同服移动（剪切覆盖）：先把目标挪到备份名，再 rename 源→目标；失败可回滚
      if (item.mode === 'cut' && !item.isDirectory) {
        const backup = dest + `.sftp-plus-bak-${Date.now()}`
        let backedUp = false
        try {
          await exec.renameRemote(src, dest)
          return 'moved'
        } catch {
          try {
            await exec.renameRemote(dest, backup)
            backedUp = true
            await exec.renameRemote(src, dest)
            // ★ 2026-09-21 P1 修复：此处绝不能带「删不掉就把 backup 改名回 dest」的 fallback——
            //   上一行 rename 已成功（dest 已是 src 内容），把 backup 改回 dest 会覆盖掉 src 内容，
            //   而 src 已被挪走 → 剪切变成数据丢失。删不掉就留下 backup（留备份总比丢数据好）。
            //   （原实现还有一行重复的 unlink，一并删除）
            try { await exec.unlinkRemote(backup) } catch { /* 留下 backup 总比丢数据好 */ }
            return 'moved'
          } catch (e2) {
            if (backedUp) {
              try { await exec.renameRemote(backup, dest) } catch { /* 无法恢复则留下 backup */ }
            }
            throw e2
          }
        }
      }
      // 复制模式（保留源）：保持原下载+上传（部分服务器不支持 server-side copy）
      const parentDir = path.posix.dirname(src)
      const baseName = path.posix.basename(src)
      const parentEntries = await exec.readdirRemote(parentDir)
      const srcEntry = parentEntries.find(e => e.name === baseName)
      if (!srcEntry) return 'failed'
      // ★ 2026-09-21 P1 修复：原先硬编码 false（按文件处理），因为同面板目录当时走不到这里。
      //   现在 applyAction 把同面板目录也分流到本方法，必须按 item.isDirectory 传递；
      //   仍与 listing 交叉确认，避免 stale 元数据把文件当目录走 mkdir+readdir 死路（dest 变 0B）。
      const isDir = !!item.isDirectory && srcEntry.isDirectory !== false
      await exec.copyRemoteDir(src, dest, isDir)
      return 'copied'
    } catch (e) {
      log.error('Same-pane remote overwrite failed', e)
      return 'failed'
    }
  }

  private async _samePaneRename(item: ConflictQueueItem, newName: string): Promise<'moved' | 'copied' | 'failed'> {
    const src = item.remotePath
    const destDir = path.dirname(item.localPath)
    const dest = path.join(destDir, newName)
    const exec = this.ports.execution
    const sameFile = item.samePaneSource === 'local'
      ? path.resolve(src) === path.resolve(dest)
      : src === dest
    if (sameFile) return 'failed'
    if (item.samePaneSource === 'local') {
      try {
        const st = await exec.statLocal(src)
        if (!st) return 'failed'
        log.info('_samePaneRename local:', { src, dest, isDir: st.isDirectory })
        if (st.isDirectory) await exec.copyLocalDir(src, dest)
        else await exec.copyLocalFile(src, dest)
        return 'copied'
      } catch (e) {
        log.error('Same-pane rename failed', e)
        return 'failed'
      }
    }
    if (!exec.hasSftpSession()) return 'failed'
    try {
      // item.localPath 是 posix 路径（远程同面板），必须用 path.posix.dirname
      const destRemote = path.posix.join(path.posix.dirname(item.localPath), newName)
      // ★ 2026-09-21 P1 修复：目录剪切不走备份策略（理由同 _samePaneOverwrite）
      if (item.mode === 'cut' && item.isDirectory) {
        try {
          await exec.renameRemote(src, destRemote)
          return 'moved'
        } catch (e) {
          log.info('same-pane dir cut-rename failed, falling back to copy+delete:', src, '->', destRemote, e)
        }
      }
      if (item.mode === 'cut' && !item.isDirectory) {
        const backup = destRemote + `.sftp-plus-bak-${Date.now()}`
        let backedUp = false
        try {
          await exec.renameRemote(src, destRemote)
          return 'moved'
        } catch {
          try {
            await exec.renameRemote(destRemote, backup)
            backedUp = true
            await exec.renameRemote(src, destRemote)
            try { await exec.unlinkRemote(backup) } catch { /* ignore */ }
            return 'moved'
          } catch (e2) {
            if (backedUp) {
              try { await exec.renameRemote(backup, destRemote) } catch { /* ignore */ }
            }
            throw e2
          }
        }
      }
      const parentDir = path.posix.dirname(src)
      const baseName = path.posix.basename(src)
      const parentEntries = await exec.readdirRemote(parentDir)
      const srcEntry = parentEntries.find(e => e.name === baseName)
      if (!srcEntry) return 'failed'
      // ★ 2026-09-21 P1 修复：同上，按 item.isDirectory 传递并与 listing 交叉确认
      const isDir = !!item.isDirectory && srcEntry.isDirectory !== false
      await exec.copyRemoteDir(src, destRemote, isDir)
      return 'copied'
    } catch (e) {
      log.error('Same-pane remote rename failed', e)
      return 'failed'
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
    /** ★ 2026-09-07 issue #15：可选内容摘要服务；未提供时退化为仅 size+mtime 判定（与旧行为一致） */
    private readonly digest: ContentDigestPort | null = null,
    /**
     * ★ 2026-09-07 issue #15+：内容被确认相同时是否自动跳过（不弹冲突框）。
     * 必须是回调而不是 boolean —— panel 字段在 ngOnInit 之后才会被 _readBehaviorConfig 填充，
     * 而 coordinator 在 constructor 期间就已被构造；用回调才能让用户改设置即时生效，
     * 避免「关掉了自动跳过却仍然跳过」的"配置失联"bug。
     */
    private readonly isAutoSkipSameContent: () => boolean = () => true,
    /**
     * ★ 2026-09-07 issue #15+：命中「自动跳过」时同步回调，host 用它通知面板把传输记录标为「已跳过」。
     * 设计成构造回调（而非 setter）—— 多个并发 use case 不会互相覆盖，每个面板一个 detector 实例。
     * 默认空函数，回调由 PanelTransferCoordinator 注入。
     */
    private readonly onAutoSkipped: (info: AutoSkippedInfo) => void = () => {},
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
    // ★ 2026-09-20 P1-5 审计修复：LRU 淘汰代替全量 clear——
    //   旧实现超过 256 条时 clear() 会把正在进行中的并发 Promise 也一并丢弃，
    //   导致后续同目录请求再发一次 readdir。改为只删最早插入的一批。
    if (this._dirListingCache.size > 256) {
      const drop = Math.ceil(256 / 4)
      let i = 0
      for (const k of this._dirListingCache.keys()) {
        if (i++ >= drop) break
        this._dirListingCache.delete(k)
      }
    }
    this._dirListingCache.set(parentDir, p)
    // 解析后移除，避免长期持有；并发期间由同一 Promise 去重，确保同目录只查一次
    void p.then(() => this._dirListingCache.delete(parentDir)).catch(() => this._dirListingCache.delete(parentDir))
    return p
  }

  async checkUploadConflict(
    remotePath: string,
    localPath: string,
    localSize: number,
    localMtime: number,
  ): Promise<ConflictCheckOutcome> {
    const session = this.getSession()
    if (!session) return { kind: 'no-conflict' }
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

    // ★ 2026-09-14 F5 审计修复：listing 命中（远端文件确实存在）但 size 不可得
    //   （listing 缺字段且 stat 回退失败）时，不得按「不存在」返回 no-conflict 直接覆盖——
    //   保守判冲突；size/mtime 传 NaN，UI 层 formatSize/formatDate 对非有限值渲染为空串
    if (remoteSize == null) {
      if (found) {
        log.warn('[check-upload-conflict] remote file exists but size unknown, forcing conflict:', remotePath)
        return {
          kind: 'conflict',
          info: buildUploadConflictInfo(remotePath, localPath, fileName, localSize, localMtime, Number.NaN, Number.NaN),
        }
      }
      // 两个来源都无法确认远程文件存在 → 不冲突（按"不存在"处理，直接上传覆盖）
      return { kind: 'no-conflict' }
    }

    const rs = remoteSize
    const rm = remoteMtime ?? 0
    // ★ 2026-09-20：size+mtime 相同应跳过，而非 no-conflict（旧注释写「不存在才 no-conflict」，
    //   实现却把「相同」也返回 no-conflict 导致整文件无意义重传）
    if (filesAreSame(localSize, localMtime, rs, rm, this.mtimeToleranceMs)) {
      log.info('[check-upload-conflict] size+mtime same, auto-skipped:', remotePath)
      this.onAutoSkipped({ direction: 'upload', localPath, remotePath, digest: null })
      return { kind: 'auto-skipped', digest: null }
    }

    // ★ 2026-09-07 issue #15：size 相同但 mtime 超出容差时，用内容摘要判断内容是否真的变了。
    //   典型场景：Git 切换分支 / rsync 同步后 mtime 变化但内容一致，不应反复弹冲突框。
    const digest = await this._resolveDigest(localPath, remotePath, localSize, localMtime, rs, rm)
    if (this.isAutoSkipSameContent() && isContentIdentical(digest)) {
      log.info('[check-upload-conflict] content identical, auto-skipped:', remotePath)
      this.onAutoSkipped({ direction: 'upload', localPath, remotePath, digest: digest ?? null })
      return { kind: 'auto-skipped', digest: digest ?? null }
    }
    return { kind: 'conflict', info: buildUploadConflictInfo(remotePath, localPath, fileName, localSize, localMtime, rs, rm, digest) }
  }

  async checkLocalConflict(
    localPath: string,
    remotePath: string,
    remoteSize: number,
    remoteMtime: number,
  ): Promise<ConflictCheckOutcome> {
    try {
      // ★ 2026-09-14 F8 审计修复：先 lstat 识别符号链接。下载覆盖走 .tmp + rename，
      //   会「替换链接本身」而非写入其目标；旧实现 fs.stat 跟随链接比对目标内容，
      //   语义错位——目标内容相同时被静默跳过（链接尚在，勉强可接受），目标不同时
      //   弹框展示的是目标的大小/mtime，用户选覆盖后链接被换成普通文件、目标残留旧数据。
      //   链接一律按冲突处理，交由用户显式决定（展示链接自身的 lstat 元数据）。
      const lst = await fs.lstat(localPath)
      if (lst.isSymbolicLink()) {
        log.info('[check-local-conflict] local path is a symlink, forcing conflict:', localPath)
        return {
          kind: 'conflict',
          info: buildDownloadConflictInfo(localPath, remotePath, remoteSize, remoteMtime, lst.size, lst.mtimeMs),
        }
      }
      const st = await fs.stat(localPath)
      if (filesAreSame(st.size, st.mtimeMs, remoteSize, remoteMtime, this.mtimeToleranceMs)) {
        log.info('[check-local-conflict] size+mtime same, auto-skipped:', localPath)
        this.onAutoSkipped({ direction: 'download', localPath, remotePath, digest: null })
        return { kind: 'auto-skipped', digest: null }
      }

      const digest = await this._resolveDigest(localPath, remotePath, st.size, st.mtimeMs, remoteSize, remoteMtime)
      if (this.isAutoSkipSameContent() && isContentIdentical(digest)) {
        log.info('[check-local-conflict] content identical, auto-skipped:', remotePath)
        this.onAutoSkipped({ direction: 'download', localPath, remotePath, digest: digest ?? null })
        return { kind: 'auto-skipped', digest: digest ?? null }
      }
      return { kind: 'conflict', info: buildDownloadConflictInfo(localPath, remotePath, remoteSize, remoteMtime, st.size, st.mtimeMs, digest) }
    } catch { /* 文件不存在，不冲突 */ }
    return { kind: 'no-conflict' }
  }

  /**
   * 计算两端内容摘要。
   * ★ 2026-09-18 issue #15+：即使大小不同也计算摘要，让用户看到具体差异。
   *    但自动跳过只在 size 相同且摘要匹配时触发（size 不同则内容必然不同）。
   */
  private async _resolveDigest(
    localPath: string,
    remotePath: string,
    localSize: number,
    localMtime: number,
    remoteSize: number | undefined,
    remoteMtime: number | undefined,
  ): Promise<ConflictDigestInfo | undefined> {
    if (!this.digest) {
      log.info('[resolveDigest] skipped: digest service not enabled')
      return undefined
    }
    try {
      const [localDigest, remoteDigest] = await Promise.all([
        this.digest.localDigest(localPath, localSize, localMtime),
        remoteSize != null ? this.digest.remoteDigest(remotePath, remoteSize, remoteMtime) : Promise.resolve(null),
      ])
      // ★ 2026-09-20：单端失败仍返回另一端，供冲突框展示；auto-skip 仍要求两端齐全且相等
      if (!localDigest && !remoteDigest) {
        log.info('[resolveDigest] both failed for', localPath)
        return undefined
      }
      if (!localDigest || !remoteDigest) {
        log.info('[resolveDigest] partial: local:', localDigest ? 'ok' : 'failed', 'remote:', remoteDigest ? 'ok' : 'failed')
      } else {
        log.info('[resolveDigest] computed for', localPath, 'local:', localDigest.slice(0, 8), '... remote:', remoteDigest.slice(0, 8), '...')
      }
      return { localDigest: localDigest ?? null, remoteDigest: remoteDigest ?? null }
    } catch (e) {
      log.warn('[resolveDigest] failed:', e)
      return undefined
    }
  }

  async checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean> {
    const session = this.getSession()
    if (!session) return false
    if (session.stat) {
      try {
        const st = await session.stat(remotePath) as {
          isDirectory?: boolean | (() => boolean)
          mode?: number
          type?: number
        } | null
        if (!st) return false
        if (expectDir === undefined) return true
        // ★ 2026-08-26 H6：同时支持 boolean 属性、函数、russh type 数字枚举
        let isDir: boolean | undefined
        if (typeof st.isDirectory === 'function') isDir = st.isDirectory()
        else if (typeof st.isDirectory === 'boolean') isDir = st.isDirectory
        else if (typeof st.type === 'number') isDir = st.type === 0
        else if (typeof st.mode === 'number') isDir = (st.mode & 0o170000) === 0o040000
        if (isDir === undefined) return false // 无法判定时不假装「符合 expectDir」
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


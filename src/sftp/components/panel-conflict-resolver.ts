/**
 * 功能描述：SFTP+ 面板冲突弹窗解析器
 *   负责把冲突队列首项渲染为 ConflictFileInfo，并在弹窗显示后异步用 stat
 *   补正远程文件的真实大小与修改时间（readdir / 拖拽 payload 中的元数据不可靠）。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-11
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-10-23 — 新增 Host.readConflictRenameStyle?() 与 ports.renameStyle 转发：冲突「重命名」
 *              的命名风格（seq / time / random）由面板从配置读出后交给 use case，缺省按 seq。
 *              2026-10-20 — 冲突执行体端点化（配合 core/conflict 的 doEndpointTransfer）：
 *              ① Host 新增 doEndpointTransfer? / deleteAtEndpoint? 并转发进 ConflictExecutionPort；
 *              ② scanRemoteDir 增加可选 sessionOverride —— 远程侧可能是左栏远程端点（第二会话）
 *                 或 r2r 目标会话，沿用 host.sftpSession 会 stat / 扫描到**另一台机器**；
 *              ③ _presentConflictDialog 按 `item.endpointTransfer` 归位两侧：conflict.ts 的字段
 *                 映射是 localPath=源 / remotePath=目标，而对话框左列恒为「远程文件」、右列
 *                 「本地文件」，源在远程时（左栏远程→本机）必须交换路径与大小/时间，否则远程栏
 *                 里会显示本地路径；远程侧会话也按 src/dst 取，两侧同为本机时跳过 stat；
 *              ④ 端点化冲突不补算内容摘要（两端不在「本机盘 + 面板主会话」这条轴上）。
 *              2026-10-20 全量审计：摘要改按**展示值**交换 —— 原实现 localPath 用字段值、remotePath
 *                 用展示值（一边换一边不换），且 samePaneSource 单值表达不了「源在远程 + 目标在本机」
 *                 ⇒ 两端摘要恒 null（对话框双列「—」、「内容相同自动跳过」失效）。
 *                 现路径/大小/mtime 三件套连同会话、两侧远端标记（localSideRemote/remoteSideRemote）
 *                 一起交换；_ensureQueueItemDigests 与 _presentConflictDialog 同口径。
 *              修改人：DD1024z + Hy4 preview / 修改时间：2026-10-20
 *              2026-09-29 — 同栏冲突的源侧/目标侧内容摘要必有一端算不出来（用户实测：把同一个文件粘贴回
 *              它自己所在目录，源侧「内容摘要」显示「—」）：同栏时队列项的 localPath/remotePath 两个字段
 *              装的是**同一侧**的两个路径（localPath=目标、remotePath=源，见 paste._buildFileConflictItem），
 *              而补算摘要时只按字段名选通道 → local→local 会对本地源路径跑远端 sha1sum、remote→remote
 *              会对远端目标路径读本地盘。现把 `samePaneSource` 一并透传给 computeConflictDigests
 *              （弹窗前 ensure 与弹窗后补算两处都传），由摘要服务按两端**实际所在侧**选通道。
 *              2026-09-21 — 第六轮审计 P2 修复：refreshPanes 的裸 detectChanges 改走 _detect()
 *              （resolve 链 await 期间面板被关闭时不再抛 ViewDestroyedError）
 *              2026-09-20 — P2-3 审计修复：stat / scanLocalDir / scanRemoteDir / 摘要补算四处迟到回调统一加
 *              「结果仍属于当前冲突项」token 校验（isStillCurrent），避免快速跳过时上一项结果污染下一项显示数据
 *              2026-09-20 — A2/A10 审计修复：新增 isAlive 短路（面板销毁后异步 stat/扫描/摘要回调不再 detectChanges）；
 *              弹窗链加单飞锁 + 挂起补跑，避免并发调用重复算摘要、极端下多 shift 一项静默跳过本不相同的文件
 *              2026-09-20 — 弹窗前按「内容相同自动跳过」跳过粘贴冲突（摘要先算再决定是否弹框）
 *              2026-09-20 — 粘贴/拖拽入队若未带摘要，弹窗后异步计算内容摘要（issue #15）
 *              2026-09-17 — 目录冲突：已有本地内容大小则直接展示、免二次扫描；远程 mtime 优先用入队 listing 值，过滤 epoch
 *              2026-09-17 — 目录冲突大小先显示「计算中…」，扫描完成后再填真实值；修正目录冲突文案
 *              2026-09-17 — 冲突取消/跳过删除误记失败传输记录；目录冲突异步扫描内容总大小
 *              2026-08-02 — B18：修复 stat 返回 mtime 为 number（秒）时误用 .getTime() 导致远程修改时间变成 1970-01-01；B19 增加 attrs 嵌套字段解析与诊断 log；B24：statMtimeToMs 过滤 Unix epoch 无效时间，避免目录正确 modified 被 stat 覆盖
 */
import * as fs from 'fs/promises'
import * as path from 'path'

import { ConflictResolveUseCase, type ConflictResolvePorts, type ConflictRenameStyle } from '../core/conflict'
import { conflictItemKey, pasteEntryKey } from '../core/conflict'
import { deleteLocalRecursive, deleteRemoteRecursive } from '../core/fs-ops'
import type { ConflictFileInfo, ConflictQueueItem, FolderTransferCtx, LocalEntry, SFTPFile } from '../core/panel-types'

import { log } from '../../services/sftp-logger'
type ConflictActionMode = 'ask' | 'overwrite' | 'skip' | 'rename'

export interface PanelConflictResolverHost {
  sftpSession: any
  cdr: { detectChanges(): void }
  /** 远程 server-side 重命名（同服移动，秒级，用于剪切覆盖/重命名） */
  renameRemote(src: string, dest: string): Promise<void>
  /**
   * ★ 2026-10-23：冲突「重命名」的命名风格（seq 序号堆叠 / time 时间戳 / random 随机后缀），
   *   由面板从配置 `conflictRenameStyle` 读取。未提供时按 seq 处理。
   */
  readConflictRenameStyle?(): ConflictRenameStyle

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
  clipboardSource: 'local' | 'remote' | 'rl'
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
  downloadRemoteDir(remoteDir: string, localDestDir: string, targetPane?: 'local' | 'remote', _top?: any, renameTo?: string, forceOverwrite?: boolean): Promise<boolean>
  mergeLocalDirToRemote(localSrc: string, remoteDest: string, reuseLogEntryId?: string): Promise<boolean>
  copyLocalDir(src: string, dest: string): Promise<void>
  copyRemoteDir(srcRemotePath: string, destRemotePath: string, isDirectory: boolean): Promise<void>
  /** ★ 2026-08-11：冲突解决成功后翻正来源传输记录（入队时已被误记失败） */
  markTransferSucceeded(ctx: FolderTransferCtx): void
  /** ★ 2026-09-17：冲突取消/跳过时删除误记失败传输记录 */
  discardTransferLog(ctx: FolderTransferCtx): void
  /** ★ 2026-09-17：目录冲突时扫描本地目录内容总大小 */
  scanLocalDir(dirPath: string): Promise<{ size: number; count: number }>
  /**
   * ★ 2026-09-17：目录冲突时扫描远程目录内容总大小（与本地对照）。
   * ★ 2026-10-20：新增可选 `sessionOverride` —— 端点化冲突的远程侧可能不是面板主会话
   *   （左栏远程端点 / r2r 目标会话），沿用主会话会扫到**另一台机器**的目录。
   */
  scanRemoteDir(remotePath: string, sessionOverride?: any): Promise<{ size: number; count: number }>
  /**
   * ★ 2026-09-20：开启「内容相同则自动跳过」时，弹窗前先算摘要；相同则走 skip 不弹框。
   * 粘贴冲突此前只检测「目标存在」就入队，摘要在弹窗后才算，导致开关无效。
   */
  shouldAutoSkipSameContent?(): boolean
  /** 自动跳过时可选提示（如 toast） */
  notifyConflictAutoSkipped?(fileName: string): void
  /**
   * ★ 2026-09-20：为冲突框补算内容摘要（粘贴/同栏冲突入队时通常未带 digest）。
   * ★ 2026-09-29：同栏冲突必须带上 `samePaneSource` —— 同栏时 localPath/remotePath 两个字段
   *   装的是**同一侧**的两个路径（local→local 时 remotePath 是本地源路径），不带这个标志
   *   摘要服务就只能按字段名猜通道，必有一端算不出来（冲突框该端显示「—」，见 issue #17 反馈）。
   * 关闭摘要功能时返回两端 null。
   */
  computeConflictDigests?(args: {
    localPath: string
    remotePath: string
    localSize?: number
    localMtime?: number
    remoteSize?: number
    remoteMtime?: number
    samePaneSource?: 'local' | 'remote'
    /** ★ 端点化冲突时传入源端/目标端的 SSH 会话，用于非面板主会话的远端摘要计算 */
    srcSession?: any
    dstSession?: any
    /**
     * ★ 2026-10-20 全量审计：`localPath` / `remotePath` 两侧各自是否在远端。
     *   samePaneSource 只能表达「两端同侧」，表达不了端点冲突里「源远程 + 目标本机」，
     *   故两侧各自显式给值（省略时由服务按 samePaneSource 推导，旧路径行为不变）。
     */
    localSideRemote?: boolean
    remoteSideRemote?: boolean
  }): Promise<{ localDigest: string | null; remoteDigest: string | null }>
  /**
   * ★ 2026-09-20 A2：面板是否仍存活。销毁后冲突框的异步 stat / 目录扫描 / 摘要回调必须短路，
   * 否则会对已销毁视图 cdr.detectChanges()（ViewDestroyedError）。
   * 缺省（未提供）视为存活，兼容旧调用方。
   */
  isAlive?(): boolean
  /**
   * ★ issue #27 P3：远程↔远程冲突（覆盖/重命名）执行体——源/目标会话由 payload 携带。
   * 未提供时 applyAction 的 r2r 分支记日志并以「已处理（未传输）」收尾。可选。
   */
  doR2rTransfer?(srcPath: string, dstPath: string, isDir: boolean, payload: NonNullable<ConflictQueueItem['r2rTransfer']>): Promise<boolean>
  /**
   * ★ 2026-10-20：**端点化冲突**（覆盖/重命名）执行体 —— 源/目标可以是「本机磁盘 / 左栏远程
   *   （第二会话）/ 右栏远程 / 右栏本地(rl)」任意组合，两端真实身份由 payload 携带。
   *   未提供时 applyAction 记日志并按「已处理（未传输）」收尾。可选。
   */
  doEndpointTransfer?(srcPath: string, dstPath: string, payload: NonNullable<ConflictQueueItem['endpointTransfer']>): Promise<boolean>
  /** ★ 2026-10-20：端点化冲突的剪切清理 —— 按 `payload.src` 的会话 / 本机 fs 删除源。未提供则保留源。 */
  deleteAtEndpoint?(path: string, isDir: boolean, payload: NonNullable<ConflictQueueItem['endpointTransfer']>): Promise<void>
}

export { pasteEntryKey }

export class PanelConflictResolver {
  private readonly useCase: ConflictResolveUseCase
  /**
   * ★ 2026-09-20 A10 审计修复：弹窗链单飞锁。
   *   showConflictDialog 可被多处（拖拽批次结束 / 粘贴 / 队列 drain / 自动跳过续链）并发调用，
   *   而原实现唯一的兜底 `host.showConflictDialog` 标志是在「摘要计算 await 之后」才置位的，
   *   两次并发调用会同时穿过守卫：① 重复计算两端摘要（多余 SSH exec/读盘）；
   *   ② 极端情况下两条链都判定「内容相同」→ 各自 shift 一项，把队首之后
   *   本不相同的项也标记为已解决并丢弃其传输记录（静默漏处理）。
   */
  private _presenting = false
  /** 单飞期间又收到的新请求：链跑完后补跑一次，避免丢请求 */
  private _pendingPresent = false

  constructor(private readonly host: PanelConflictResolverHost) {
    this.useCase = new ConflictResolveUseCase(this._buildPorts())
  }

  /** 面板是否仍存活（未提供 isAlive 时视为存活） */
  private get _alive(): boolean {
    try { return this.host.isAlive?.() ?? true } catch { return true }
  }

  /** 安全变更检测：面板已销毁则为 no-op */
  private _detect(): void {
    if (!this._alive) return
    const cdr = this.host.cdr
    cdr.detectChanges()
  }

  showConflictDialog(): void {
    // ★ A10：并发调用只跑一条链；期间到达的请求挂起，链结束后补跑
    if (this._presenting) {
      this._pendingPresent = true
      return
    }
    this._presenting = true
    void this._showConflictDialogAsync()
      .catch((e: any) => { log.warn('[conflict-dialog] show chain failed:', e?.message ?? e) })
      .finally(() => {
        this._presenting = false
        if (this._pendingPresent) {
          this._pendingPresent = false
          this.showConflictDialog()
        }
      })
  }

  /**
   * ★ 2026-09-20：弹窗前对文件冲突尝试「内容相同自动跳过」；
   * 命中则走 resolve('skip')（含 pending paste 收尾），未命中再真正弹窗。
   */
  private async _showConflictDialogAsync(): Promise<void> {
    // ★ A2：面板已销毁则不再弹窗/扫描
    if (!this._alive) return
    const item = this.host.conflictQueue[0]
    if (!item) return
    this.host.conflictTotalIdx = this.host.conflictOriginalTotal
    this.host.conflictCurrIdx = this.host.conflictOriginalTotal - this.host.conflictQueue.length + 1

    if (this.host.showConflictDialog) {
      this._detect()
      return
    }

    // 文件级：先补摘要，再决定是否自动跳过（目录不做内容摘要）
    if (!item.isDirectory) {
      await this._ensureQueueItemDigests(item)
      const ld = item.localDigest
      const rd = item.remoteDigest
      if (
        this.host.shouldAutoSkipSameContent?.()
        && ld && rd && ld === rd
      ) {
        log.info('[conflict-dialog] auto-skip identical content:', item.fileName)
        try { this.host.notifyConflictAutoSkipped?.(item.fileName) } catch { /* ignore */ }
        // ★ 不走 useCase.resolve：其 _processing 锁在 showNextDialog 重入时会吞掉后续 skip
        await this._autoSkipHeadAndContinue()
        return
      }
    }

    this._presentConflictDialog(item)
  }

  /**
   * 弹窗前自动跳过队列首项（内容摘要相同），并继续下一项或收尾 resumePaste。
   * 语义对齐 ConflictResolveUseCase 对 skip 的处理，但不占用 resolve 重入锁。
   */
  private async _autoSkipHeadAndContinue(): Promise<void> {
    // ★ A2：链中 await 后可能已被销毁，此时不得再消费队列 / 续跑粘贴
    if (!this._alive) return
    const current = this.host.conflictQueue.shift()
    if (!current) return
    this.host.conflictResolvedKeys.add(conflictItemKey(current))
    // 粘贴冲突通常无 transferCtx；有则与 skip 一样丢弃误记失败记录
    if (current.transferCtx) {
      try { this.host.discardTransferLog(current.transferCtx) } catch { /* ignore */ }
    }

    if (this.host.conflictQueue.length > 0) {
      await this._showConflictDialogAsync()
      return
    }

    // 队列空：对齐 _drainQueue 收尾
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
      const resolvedKeys = new Set(this.host.conflictResolvedKeys)
      this.host.pendingPasteEntries = []
      this.host.pendingPasteDestPane = 'local'
      this.host.pendingPasteDestPath = ''
      this.host.pendingPasteMode = 'copy'
      this.host.pendingPasteSource = 'local'
      this.host.conflictResolvedKeys.clear()
      await this.host.executePaste(
        entries.filter(e => !resolvedKeys.has(pasteEntryKey(e))),
        destPane, destPath, mode, source,
      )
      if (this.host.conflictQueue.length > 0) {
        await this._showConflictDialogAsync()
      }
    } else {
      void this.host.refreshRemote()
      void this.host.refreshLocal()
    }
    this._detect()
  }

  /** 为队列项补齐两端摘要（已有则跳过计算） */
  private async _ensureQueueItemDigests(item: ConflictQueueItem): Promise<void> {
    if (item.localDigest && item.remoteDigest) return
    // ★ issue #27 P3：r2r 冲突两端都是远程文件，computeConflictDigests 的两端通道
    //   （本地盘 / 面板主会话）都对不上，强行计算只会两端皆空。r2r 的「内容相同」
    //   判定已在入队前由 size+mtime 完成，这里直接跳过摘要补算。
    if (item.r2rTransfer) return
    if (!this.host.computeConflictDigests) return
    const remoteFilePath = item.remotePath || path.posix.join(item.remoteDir, item.fileName)
    // ★ 2026-10-20 全量审计：与 _presentConflictDialog 同口径 —— 端点项在「源位于远程」时
    //   左右两列是交换过的，这里若用字段值计算，得到的是「源哈希落在目标列」的错配，
    //   且远程源会被拿去读本地盘 ⇒ 两端皆 null。会话与端点类型同样按展示侧交换。
    const ep = item.endpointTransfer
    const swapSides = !!ep && !ep.src.isLocal
    const dLocal = swapSides ? remoteFilePath : item.localPath
    const dRemote = swapSides ? item.localPath : remoteFilePath
    try {
      const { localDigest, remoteDigest } = await this.host.computeConflictDigests({
        localPath: dLocal,
        remotePath: dRemote,
        localSize: swapSides ? (Number(item.remoteFileSize) || undefined) : (Number(item.localStat?.size) || undefined),
        localMtime: swapSides ? (Number(item.remoteFileMtime) || undefined) : (Number(item.localStat?.mtimeMs) || undefined),
        remoteSize: swapSides ? (Number(item.localStat?.size) || undefined) : Number(item.remoteFileSize) || undefined,
        remoteMtime: swapSides ? (Number(item.localStat?.mtimeMs) || undefined) : Number(item.remoteFileMtime) || undefined,
        // ★ 2026-09-29：同栏冲突（两端同侧）必须告诉摘要服务两端实际在哪一侧，
        //   否则源侧会被当远端跑 sha1sum（local→local）/ 目标侧被当本地读盘（remote→remote）。
        samePaneSource: item.isSamePane ? item.samePaneSource : undefined,
        // ★ 2026-10-20：端点化冲突传入源端/目标端的 SSH 会话，支持跨远程会话摘要计算
        srcSession: ep ? (swapSides ? ep.dst.session : ep.src.session) : undefined,
        dstSession: ep ? (swapSides ? ep.src.session : ep.dst.session) : undefined,
        localSideRemote: ep ? (swapSides ? !ep.dst.isLocal : !ep.src.isLocal) : undefined,
        remoteSideRemote: ep ? (swapSides ? !ep.src.isLocal : !ep.dst.isLocal) : undefined,
      })
      if (localDigest) item.localDigest = localDigest
      if (remoteDigest) item.remoteDigest = remoteDigest
    } catch (e: any) {
      log.warn('[conflict-dialog] ensure digests failed:', e?.message ?? e)
    }
  }

  private _presentConflictDialog(item: ConflictQueueItem): void {
    const isDir = !!item.isDirectory
    // ★ 2026-10-20：端点化冲突的「本地侧 / 远程侧」重新归位。
    //   conflict.ts 对端点项的字段映射固定为 `localPath`=源、`remotePath`=目标（与 r2rTransfer 一致），
    //   而对话框固定左列「远程文件」、右列「本地文件」。只有「源在本机」时字段名恰好与侧别一致；
    //   源在远程（左栏远程 → 本机）时必须交换，否则远程栏里会显示本地路径、两侧大小/时间也颠倒。
    const ep = item.endpointTransfer
    const swapSides = !!ep && !ep.src.isLocal
    const rawLocalSize = Number(item.localStat?.size) || 0
    const rawLocalMtime = Number(item.localStat?.mtimeMs) || 0
    const rawRemoteSize = Number(item.remoteFileSize) || 0
    const rawRemoteMtime = Number(item.remoteFileMtime) || 0
    const sideLocalSize = swapSides ? rawRemoteSize : rawLocalSize
    const sideLocalMtime = swapSides ? rawRemoteMtime : rawLocalMtime
    const sideRemoteSize = swapSides ? rawLocalSize : rawRemoteSize
    const sideRemoteMtime = swapSides ? rawLocalMtime : rawRemoteMtime
    const dlgLocalPath = swapSides ? item.remotePath : item.localPath
    const dlgRemotePath = swapSides ? item.localPath : item.remotePath
    // ★ 2026-09-17：拖拽/粘贴入队前若已扫过本地内容总大小（localStat.size>0），直接展示，免弹窗内二次扫描
    const knownLocalContent = isDir && sideLocalSize > 0
    const knownRemoteMtime = validConflictMtime(sideRemoteMtime)
    // ★ 2026-10-20 续三十五：提取 host label 供 r2r 冲突对话框显示方向
    let srcHostLabel: string | undefined
    let dstHostLabel: string | undefined
    if (item.endpointTransfer) {
      srcHostLabel = item.endpointTransfer.src?.hostLabel || undefined
      dstHostLabel = item.endpointTransfer.dst?.hostLabel || undefined
    } else if (item.r2rTransfer) {
      srcHostLabel = item.r2rTransfer.srcHostLabel || undefined
      dstHostLabel = item.r2rTransfer.dstHostLabel || undefined
    }
    this.host.conflictData = {
      localPath: dlgLocalPath,
      remotePath: dlgRemotePath,
      fileName: item.fileName,
      // 目录：无已知内容大小时先不展示 inode/readdir 元数据，等扫描完成再填，避免 4KB → 11MB 跳变
      localSize: isDir ? (knownLocalContent ? sideLocalSize : 0) : sideLocalSize,
      remoteSize: isDir ? 0 : sideRemoteSize,
      localMtime: sideLocalMtime,
      remoteMtime: knownRemoteMtime ?? 0,
      remoteDir: item.remoteDir,
      direction: item.direction,
      isSamePane: item.isSamePane ?? false,
      isDirectory: isDir,
      localSizePending: isDir && !knownLocalContent,
      remoteSizePending: isDir,
      // ★ 2026-09-18 issue #15 修复：携带内容摘要供对话框展示
      localDigest: item.localDigest ?? null,
      remoteDigest: item.remoteDigest ?? null,
      // ★ 2026-09-18 issue #15+：计算内容是否相同/不同
      contentIdentical: !!item.localDigest && !!item.remoteDigest && item.localDigest === item.remoteDigest,
      contentDiffers: !!item.localDigest && !!item.remoteDigest && item.localDigest !== item.remoteDigest,
      // ★ 2026-10-20 续三十五
      srcHostLabel,
      dstHostLabel,
    }
    // 异步取远程文件的真值；目录 mtime 优先保留 listing 入队值（stat 常返回 epoch）
    const remoteFilePath = dlgRemotePath || path.posix.join(item.remoteDir, item.fileName)
    // ★ 2026-10-20：远程侧的会话按端点取 —— 端点化冲突的远程侧可能是左栏远程端点（第二会话）
    //   或 r2r 的目标会话；沿用 host.sftpSession 会 stat / 扫描到**另一台机器**。
    const remoteSideSession: any = ep
      ? (ep.src.isLocal ? ep.dst.session : ep.src.session)
      : (item.r2rTransfer?.dstSession ?? this.host.sftpSession)
    log.info('[conflict-dialog] initial remoteMtime:', sideRemoteMtime, 'remotePath:', remoteFilePath, 'hasStat:', typeof remoteSideSession?.stat)
    // ★ 2026-09-20 P2-3 审计修复：下面三个异步回调（stat / 本地目录扫描 / 远程目录扫描）除了
    //   「面板存活 + 弹窗仍开」之外，还必须校验「结果仍属于当前展示的这个冲突项」——
    //   conflictData 每次 _presentConflictDialog 都会重建，用户快速跳过切到下一项时，
    //   上一项的迟到结果会写进新项的 remoteSize/remoteMtime/localSize（显示数据串项，
    //   实测传输决策不受影响但 UI 会误导）。此处复用摘要补算处同款 token 校验。
    // ★ 2026-10-20：token 必须用**展示值**（dlgLocalPath/dlgRemotePath）拼 —— 端点项在源位于
    //   远程侧时做过交换，若仍用 item.localPath/item.remotePath，isStillCurrent() 恒为 false，
    //   后续 stat / 目录扫描结果会被全部丢弃（大小永远停在入队值）。
    const itemToken = `${dlgLocalPath}|${dlgRemotePath}`
    const isStillCurrent = (): boolean =>
      this._alive && !!this.host.showConflictDialog && !!this.host.conflictData
      && `${this.host.conflictData.localPath}|${this.host.conflictData.remotePath}` === itemToken
    // ★ 2026-09-29：同栏**本地**冲突时 remotePath 其实是本地路径 —— 拿它去 sftpSession.stat() 必然
    //   失败（实测 log：「[conflict-dialog] stat failed」+ 「execSshCommand empty output」），
    //   而该侧大小/时间入队时就来自本地 stat，无需再补。同栏远端冲突仍需 stat 校验远端元数据。
    // ★ 2026-10-20：端点化冲突同理 —— 远程侧为本地端点（如本机 → 右栏本地 rl）时没有远程会话可 stat。
    const skipRemoteStat = (item.isSamePane && item.samePaneSource === 'local') || !remoteSideSession
    if (!skipRemoteStat && remoteFilePath && typeof remoteSideSession.stat === 'function') {
      remoteSideSession.stat(remoteFilePath).then((st: any) => {
        if (!isStillCurrent() || !st) return
        // 目录：stat.size 只是 inode/元数据，后面用 scanRemoteDir 覆盖；此处仅补时间
        if (!item.isDirectory) {
          log.info('[conflict-dialog] stat result:', JSON.stringify(st))
          const sz = statSize(st)
          if (sz != null) this.host.conflictData.remoteSize = sz
        }
        const mt = statMtimeToMs(st)
        log.info('[conflict-dialog] parsed remoteMtime:', mt, 'from stat')
        // 仅在当前无有效 mtime 时用 stat 补齐；避免目录 epoch 覆盖 listing 正确值
        if (mt != null && mt > 0) {
          const cur = this.host.conflictData.remoteMtime
          if (!validConflictMtime(cur)) this.host.conflictData.remoteMtime = mt
        }
        this._detect()
      }).catch((e: any) => {
        log.warn('[conflict-dialog] stat failed:', e?.message ?? e)
      })
    }
    // ★ 2026-09-17：目录冲突两侧扫描「内容总大小」，完成前 UI 显示「计算中…」
    if (isDir) {
      const localPath = dlgLocalPath
      if (!knownLocalContent && localPath) {
        void this.host.scanLocalDir(localPath).then((r) => {
          if (!isStillCurrent()) return
          this.host.conflictData.localSize = (r && r.size >= 0) ? r.size : 0
          this.host.conflictData.localSizePending = false
          this._detect()
        }).catch((e: any) => {
          log.warn('[conflict-dialog] scanLocalDir failed:', e?.message ?? e)
          if (!isStillCurrent()) return
          this.host.conflictData.localSizePending = false
          this._detect()
        })
      } else if (!knownLocalContent) {
        this.host.conflictData.localSizePending = false
      }
      if (remoteFilePath && !skipRemoteStat) {
        void this.host.scanRemoteDir(remoteFilePath, remoteSideSession).then((r) => {
          if (!isStillCurrent()) return
          this.host.conflictData.remoteSize = (r && r.size >= 0) ? r.size : 0
          this.host.conflictData.remoteSizePending = false
          this._detect()
        }).catch((e: any) => {
          log.warn('[conflict-dialog] scanRemoteDir failed:', e?.message ?? e)
          if (!isStillCurrent()) return
          this.host.conflictData.remoteSizePending = false
          this._detect()
        })
      } else {
        this.host.conflictData.remoteSizePending = false
      }
    }
    // ★ 2026-09-20：未开自动跳过时，仍可在弹窗后补算摘要供展示（弹窗前已 ensure 过则通常已有）
    if (!isDir && (!item.localDigest || !item.remoteDigest) && this.host.computeConflictDigests) {
      // ★ 2026-10-20 全量审计：摘要必须按**展示值**（交换后的）传。原实现 `localPath` 用
      //   字段值（未交换）、`remotePath` 用展示值（已交换）—— 一边换一边不换，源在远程时
      //   两侧摘要必然各算错一侧：左列显示的是源文件的哈希、右列显示的是目标文件的哈希，
      //   且源在远程时两者都因通道错配恒为 null（对话框双列「—」、内容相同自动跳过失效）。
      //   现在路径 / 大小 / mtime 三件套一起交换，会话与端点类型也跟着交换后的侧别走。
      const digestLocalPath = dlgLocalPath
      const digestRemotePath = dlgRemotePath
      const digestLocalSize = swapSides ? (Number(item.remoteFileSize) || undefined) : (Number(item.localStat?.size) || undefined)
      const digestLocalMtime = swapSides ? (Number(item.remoteFileMtime) || undefined) : (Number(item.localStat?.mtimeMs) || undefined)
      const digestRemoteSize = swapSides ? (Number(item.localStat?.size) || undefined) : Number(item.remoteFileSize) || undefined
      const digestRemoteMtime = swapSides ? (Number(item.localStat?.mtimeMs) || undefined) : Number(item.remoteFileMtime) || undefined
      // 会话与「是否远端」按**展示侧**取：交换后本地列 = 目标端点、远程列 = 源端点
      const localSideSession = ep ? (swapSides ? ep.dst.session : ep.src.session) : undefined
      const remoteSideSession2 = ep ? (swapSides ? ep.src.session : ep.dst.session) : undefined
      void this.host.computeConflictDigests({
        localPath: digestLocalPath,
        remotePath: digestRemotePath,
        localSize: digestLocalSize,
        localMtime: digestLocalMtime,
        remoteSize: digestRemoteSize,
        remoteMtime: digestRemoteMtime,
        // ★ 2026-09-29：同栏冲突（两端同侧）必须告诉摘要服务两端实际在哪一侧，
        //   否则源侧会被当远端跑 sha1sum（local→local）/ 目标侧被当本地读盘（remote→remote）。
        samePaneSource: item.isSamePane ? item.samePaneSource : undefined,
        // ★ 2026-10-20：端点化冲突传入源端/目标端的 SSH 会话，支持跨远程会话摘要计算
        //   （名字沿用 src/dst，但值已按展示侧交换：src 槽位承载「本地列」的会话）
        srcSession: localSideSession,
        dstSession: remoteSideSession2,
        // ★ 2026-10-20：两侧是否落在远端——端点项按交换后的展示侧显式给出，
        //   其余（同栏 / 经典）留空，由服务按 samePaneSource 推导，行为不变。
        localSideRemote: ep ? (swapSides ? !ep.dst.isLocal : !ep.src.isLocal) : undefined,
        remoteSideRemote: ep ? (swapSides ? !ep.src.isLocal : !ep.dst.isLocal) : undefined,
      }).then(({ localDigest, remoteDigest }) => {
        // ★ 2026-09-20 P2-3：统一走 isStillCurrent()（同 token，含面板存活判断）
        if (!isStillCurrent()) return
        if (localDigest) this.host.conflictData.localDigest = localDigest
        if (remoteDigest) this.host.conflictData.remoteDigest = remoteDigest
        const ld = this.host.conflictData.localDigest
        const rd = this.host.conflictData.remoteDigest
        this.host.conflictData.contentIdentical = !!ld && !!rd && ld === rd
        this.host.conflictData.contentDiffers = !!ld && !!rd && ld !== rd
        this._detect()
      }).catch((e: any) => {
        log.warn('[conflict-dialog] compute digests failed:', e?.message ?? e)
      })
    }
    this.host.showConflictDialog = true
    this._detect()
  }

  resolveConflict(action: string): void {
    void this.useCase.resolve(action)
  }

  private _buildPorts(): ConflictResolvePorts {
    const host = this.host
    return {
      execution: {
        mergeLocalDirToRemote: (localSrc, remoteDest, reuseLogEntryId) => host.mergeLocalDirToRemote(localSrc, remoteDest, reuseLogEntryId),
        downloadRemoteDir: (remotePath, localDestParent, localName, forceOverwrite) =>
          host.downloadRemoteDir(remotePath, localDestParent, 'local', undefined, localName, forceOverwrite),
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
        deleteLocalRecursive: async (p) => { await deleteLocalRecursive(p) },
        deleteRemoteRecursive: async (p) => { await deleteRemoteRecursive(host.sftpSession, p) },
        // ★ 2026-08-11：覆盖/重命名成功后翻正被误记失败的来源传输记录
        markTransferSucceeded: (ctx) => host.markTransferSucceeded(ctx),
        // ★ 2026-09-17：取消/跳过时删除误记失败记录
        discardTransferLog: (ctx) => host.discardTransferLog(ctx),
        // ★ issue #27 P3：远程↔远程冲突（覆盖/重命名）执行体——未提供时 applyAction 记日志并收尾
        doR2rTransfer: (srcPath, dstPath, isDir, payload) =>
          host.doR2rTransfer ? host.doR2rTransfer(srcPath, dstPath, isDir, payload) : Promise.resolve(false),
        // ★ 2026-10-20：端点化冲突执行体（本机 / 左栏远程 / 右栏远程 / 右栏本地四组合）——
        //   未提供时 applyAction 记日志并按「已处理」收尾，不中断队列。
        doEndpointTransfer: (srcPath, dstPath, payload) =>
          host.doEndpointTransfer ? host.doEndpointTransfer(srcPath, dstPath, payload) : Promise.resolve(false),
        deleteAtEndpoint: (p, isDir, payload) =>
          host.deleteAtEndpoint ? host.deleteAtEndpoint(p, isDir, payload) : Promise.resolve(),
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
        snapshot: () => host.conflictQueue.slice(),
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
          // ★ 2026-09-21 P2 修复：必须走 _detect()（带 isAlive 短路）——resolve 链 await 传输期间
          //   用户可能已关闭面板，裸 detectChanges 会抛 ViewDestroyedError（unhandled rejection）
          this._detect()
        },
        showNextDialog: () => this.showConflictDialog(),
      },
      // ★ 2026-10-23：冲突重命名风格（设置页「传输」分区）。宿主未实现时按 seq（序号堆叠）。
      renameStyle: () => host.readConflictRenameStyle?.() ?? 'seq',
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

function validConflictMtime(ms?: number | null): number | undefined {
  if (ms == null) return undefined
  const n = Number(ms)
  return Number.isFinite(n) && n >= EPOCH_THRESHOLD_MS ? n : undefined
}

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

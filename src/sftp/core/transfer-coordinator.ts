/**
 * 功能描述：SFTP+ transfer-coordinator 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-09-29 — ★ 新增多选批量上传 uploadBatchToRemote()（用户提议：多选一批文件、
 *              可含文件夹，其实也能走一个 tar 归档）。此前多选被拆成 N 个独立任务，
 *              「一次选一批小文件」完全用不上打包通道。本入口的要点：
 *                · 逐条认领 _activeTransferSlots（键与逐项路径完全相同）→ 批量与逐项
 *                  共用同一张重复检测表，两个方向互相拦得住；任一条已被占用就回滚全部已认领
 *                  槽位并返回 false，把判断权交回逐项流程（那条路径会提示「已在传输中」）。
 *                · 返回 true（已接管）时调用方**必须直接收工**，否则整批会被重传一遍；
 *                  用例抛异常一律返回 false —— 批量只是叠加在逐项通道之上的加速，
 *                  它自己出意外不该让整批失败。
 *                · TarChannelDeps 补 scanLocalPaths（合计口径，见其注释：不能拿 scanLocalDir
 *                  逐个凑，对单个文件它会返回 {0,0}，恰好把最该打包的场景判掉）。
 *              2026-09-29 — ★ MergeLocalDirUseCase 接入打包通道（修复「仅 TAR 下上传选『覆盖』
 *              仍走 SFTP」）：构造它时注入 tarChannel（恒挂载）、tarChannelMode（**取值函数**，
 *              本对象与 _buildPorts 产物一样长期复用，禁止快照）、checkRemotePathExists
 *              （决定打包走「合并覆盖」还是「原子搬入」）。
 *              2026-09-29 — ★ P0 修复「选了仅 TAR 却静默走 SFTP」：_buildPorts() 的产物是
 *              构造时一次生成、之后**长期复用**的（构造函数里只调一次），但它原先写的是
 *              `tarChannel: host.tarChannelMode?.() === 'sftpOnly' ? undefined : this._tarChannel()`
 *              与 `tarChannelMode: host.tarChannelMode?.() ?? 'smart'` —— 两个**取值快照**。
 *              用户在设置页改「传输通道模式」后，面板字段确实更新了（_readBehaviorConfig 经
 *              sftp-plus-settings-changed 重读），端口里却仍是构造那一刻的旧模式：
 *                · 旧值 smart  → 小目录过不了 smart 门槛（≥600 文件）→ 静默回退逐文件，
 *                  记录标签显示 ⇄SFTP，用户完全无从判断（实测：仅 TAR 模式下下载 4 文件
 *                  1.7MB 目录，localStorage 记录 transferMode=sftp / fileCount=4）；
 *                · 旧值 sftpOnly → tarChannel 恒 undefined → 改成仅 TAR 也永远走逐文件。
 *              修复：tarChannelMode 改为 **getter**（每次读取实时向 host 要值），tarChannel
 *              **恒挂载**（是否真的打包交给通道内按「调用时」的 mode 判定）。这与同文件
 *              conflictDigestOptions 的 autoSkipSameContent「必须是回调而非 boolean」是同一条道理。
 *              同日 — 仅 TAR 硬失败提示：PanelTransferHost 新增
 *              notifyTarChannelFailure?(name, code, detail)；_tarChannel 的 TarChannelDeps
 *              接上 notifyFailure（打包通道在仅 TAR 模式下不再回退，失败原因需交用户）。
 *              2026-09-28 — 传输通道模式：host 接口 tarAcceleration?() 改为 tarChannelMode?()，
 *              _tarChannel 的 TarChannelDeps 增加 scanLocalDir（上传择路用）；
 *              buildPorts 的 tarChannel 仅在 sftpOnly 模式才置 undefined，并新增 tarChannelMode 字段。
 *              2026-09-26 — 传输速率增加数值形态：每个 500ms 速度窗口除了写格式化字符串
 *              `entry.speed`，再维护 EMA 平滑的 `entry.speedBps`，供「传输中」条目估算剩余
 *              时间（见 sftp-transfer-queue 的 etaText）
 *              2026-09-26 二次修正：速度窗口增加**上限** `SPEED_WINDOW_MAX_MS`（>5s 的窗口
 *              只可能来自休眠/主线程阻塞，此时只推进基准不出速率）；同时删除
 *              `entry.lastProgressAt`（剩余时间已改为「测到就不再消失」，不再需要停流判据）
 *              2026-09-26 三次修正（用户：「这次似乎又完全不会动了」）：① 导出
 *              `SPEED_STALL_ZERO_MS` / `SPEED_STALL_ZERO_TEXT`——连续 15s 零字节推进时，
 *              单文件与文件夹两条通道**都**把速度如实写成 `0 B/s`（剩余时间随之显示 `∞`），
 *              不再拿旧速率继续报假数字；② 暂停时不再把 `speedBps` 置 0（恢复后不会先闪 ∞）；
 *              ③ `downloadRaw` 尾参 `onProgress` 逐跳转发（含 host 接口声明），
 *              把目录内单文件的字节级进度实时喂给目录条目
 *              2026-09-25 — P1 修复：顶层目录传输入口（uploadPathToRemote / downloadRemoteDir /
 *              mergeLocalDirToRemote）新增重复入队拦截（槽位表 _activeTransferSlots + 导出
 *              buildTransferSlotKey）。槽位放在协调器而非面板，是因为右键/菜单/拖拽下载经
 *              DownloadOneUseCase → downloadDir 端口直达本类、不经过面板方法。此前「Ctrl+V 后
 *              界面未及时响应、再点一次下载」会产生两条相同传输：并发 tar 打包/解包 + 逐文件阶段
 *              两条流写同一批目标文件（activeDownloadTargets 守卫互相 skip 且都记失败）→ 双双失败
 *              2026-09-21 — P1/P2 修复：trackTransfer 的 getSize 结果改用 Number.isFinite 判定
 *              （原 `|| 0` 把 undefined/NaN 折成 0，触发「空文件秒成功」短路）；raw 续传在
 *              totalSize=-1 时落盘前用远端 stat 复核完整性（原先把「读到 EOF」等同完整文件）；
 *              cancelTransfer 显式挂 .catch，避免 async cancel 的 rejection 逃逸
 *              2026-09-21 — 目录下载增加逐路径 lstat/readlink 符号链接探测；
 *              第六轮审计修复：cancelTransfer 排队分支 recordQueuedCancel 补传 remotePath
 *              （同 localPath 不同 remoteDir 的排队任务不再互相误杀）；trackTransfer 支持 sz=-1
 *              「大小未知」哨兵（pending=true、日志 size 不落负值）；_rawReadLoop 兼容未知大小续传读至 EOF
 *              2026-09-20 — P1-2 审计修复：三个目录任务入口统一套「任务作用域」（task-scope），
 *              使同一面板内并发的多个目录任务各自持有自己的 cancelRef，互不串扰/互不误杀
 *              2026-09-20 — P2-1 审计修复：clearTransfers/dispose 补 _transferMeta.clear()（BUG-3 改强引用 Map 时漏了配套清理）
 *              2026-09-20 — A2/A8 审计修复：_tickAllTransfers 增加 _disposed 短路（dispose 后已排队的 tick 仍会写日志/触发变更检测）；
 *              删除无调用点的死方法 _rawDownload（下载续传已统一走 _rawReadLoop）
 *              2026-09-20 — F6 审计修复：trackTransfer 认领占位条目也带 remotePath，消除与取消/消费分支不一致；合并 2026-09-07 两条 issue #15 修改记录为一组
 * 合并来源：panel-transfer-coordinator, panel-transfer-runtime
 */

import * as fs from 'fs/promises'

import { type SFTPFile } from '../../services/sftp.service'

import { type AutoSkippedInfo, type ConflictCheckOutcome, type ConflictDetectionPort, type ConflictQueuePort, SftpConflictDetector } from './conflict'

import { DownloadDirUseCase, DownloadOneUseCase, MergeLocalDirUseCase, UploadBatchUseCase, UploadPathUseCase } from './transfer-ops'

import { type FolderTransferPort, type LocalTransferFsPort, type RemoteDirStatsPort, type SftpTransferPort, type TransferExecutionPort, type TransferUseCasePorts } from './transfer-types'

import { type ConflictFileInfo, type ConflictQueueItem, type FolderTransferCtx, type PanelTransferItem } from './panel-types'

import { createTaskScope, currentTaskScope, runInTaskScope } from './task-scope'

import * as fsSync from 'fs'

import * as path from 'path'

import { LocalPathFileDownload, LocalPathFileUpload, uploadViaRawToTemp } from './transfer-adapters'

import { TarChannel } from './tar-channel'

import { execSshCommand } from './path-utils'

import { ContentDigestService, type DigestAlgo } from './digest'

import { log } from '../../services/sftp-logger'
﻿/**
 * 传输用例协调器：组装 ports、冲突检测器与用例，供面板组件委托调用
 */

/**
 * ★ 2026-09-26：单文件通道速度窗口的**上限**（毫秒）。
 *
 * `_tickAllTransfers` 每 200ms 跑一次，正常窗口 500~600ms；出现 >5s 的窗口只可能来自外部阻塞
 * （系统休眠恢复 / 主线程长时间卡死 / 调试断点）。把这种间隙当测量窗口算速率会得到假值
 * （剩余时间随之虚高），故只推进基准、不出速率。
 *
 * ⚠ 仅适用于**单文件**通道。文件夹通道（sftp-floating-panel 的 _updateFolderProgress）
 *   **不能**设上限：它的 bytesDone 只在「一个文件传完」时跳变，大文件传输期间的长窗口
 *   就是该文件的真实均速。两处语义相反，改动时务必对照。
 */
const SPEED_WINDOW_MAX_MS = 5000

/**
 * ★ 2026-09-26：**停滞判定的沉默阈值** —— 连续这么久没有任何字节推进，就承认「当前没在动」：
 *   把速度**如实**写成 `0 B/s`、`speedBps` 置 0（由此剩余时间由 `etaText` 显示成 `∞`）。
 *
 *   为什么必须如实反映（用户现场：「这次似乎又完全不会动了」）：
 *   速率文本按设计会保留旧值不闪（避免抖动时闪烁），代价是**真停摆时界面仍在报一个
 *   168.8 KB/s 的假数字**，配合静止的进度条 → 用户只能反复猜测「到底是卡了还是在跑」。
 *   宁可给一个会跳的诚实数字（0 B/s + 剩余 ∞），也不给一个不动的假数字。
 *
 *   为什么取 15s：一次 russh 读超时（~10s 硬超时）加退避（最长 3s）≈ 13s 是**正常重试周期**，
 *   13s 以内翻脸会在正常重试时来回闪；15s > 单周期，意味着「连着两次都没收到字节」。
 *   ⚠ 单文件通道（本文件 tick）与文件夹通道（面板 _updateFolderProgress）**用同一个阈值**，
 *     故由本文件导出、面板 import，避免两处各写一个数再走偏。
 */
export const SPEED_STALL_ZERO_MS = 15000

/** ★ 2026-09-26：停滞时如实显示的速度文本。不能复用 `formatSpeed(0, x)` —— 它对
 *  `bytes <= 0` 返回**空串**（会让速度整段消失，又变成「看不见任何信息」）。 */
export const SPEED_STALL_ZERO_TEXT = '0 B/s'


/** ★ 2026-09-07 issue #15：冲突内容摘要设置（由面板按当前配置实时提供） */
export interface ConflictDigestSettings {
  enabled: boolean
  /** 内容被确认相同时自动跳过（不弹冲突框） */
  autoSkipSameContent: boolean
  maxBytes: number
  algo: DigestAlgo
}

export interface PanelTransferHost {
  sftpSession: unknown
  /** ★ 2026-08-11：SSH 会话（tar 打包通道经 exec 打包/解包；可为 null） */
  sshSession?: unknown
  mtimeToleranceMs: number
  /** ★ 2026-09-07 issue #15：冲突内容摘要配置（返回 null / 不提供 = 关闭摘要，行为同旧版） */
  conflictDigestOptions?(): ConflictDigestSettings | null
  localPath: string
  enqueueConflict(item: ConflictQueueItem): void
  showConflictDialog(): void
  /** ★ 2026-08-11：单次遍历同时得出总大小与文件数（原 4 个串行递归函数） */
  scanLocalDir(dirPath: string): Promise<{ size: number; count: number }>
  scanRemoteDir(remotePath: string): Promise<{ size: number; count: number }>
  /** ★ 2026-09-28：传输通道模式（实时读设置：smart/sftpOnly/tarOnly/preferSftp/preferTar） */
  tarChannelMode?(): string
  startFolderTransfer(
    name: string,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    totalSize: number,
    itemCount: number,
    /** ★ 2026-08-11：复用既有传输记录条目（冲突覆盖合并用） */
    reuseLogEntryId?: string,
  ): FolderTransferCtx
  finishFolderTransfer(ctx: FolderTransferCtx, success: boolean): void
  /** ★ 2026-09-20：放弃文件夹进度条目（不留失败日志），tar 可恢复失败后回退用 */
  discardFolderTransfer?(ctx: FolderTransferCtx): void
  /** ★ 2026-08-11：回填传输记录的真实目录大小（tar 打包通道用） */
  updateFolderLogSize(ctx: FolderTransferCtx, size: number): void
  /**
   * ★ 2026-09-29：显式声明「本次传输由打包通道接管」（tar 通道在 start 之后调用）。
   *   与 updateFolderLogSize 分开：后者只在需要回填真实大小时才触发，用它当通道标记的副证
   *   会导致「走了 tar 却显示 ⇄SFTP」（见 transfer-types.FolderTransferPort.markChannelMode）。
   */
  markChannelMode?(ctx: FolderTransferCtx, mode: 'tar'): void
  updateFolderProgress(
    ctx: FolderTransferCtx,
    bytesDone: number,
    currentItem: string,
    itemDone: number,
    currentItemSize?: number,
  ): void
  /**
   * ★ 2026-09-07 issue #15+：单个文件被「自动跳过」（内容已确认相同）时的回调。
   * 协调器把 detector 的回调桥接到 host，由面板把对应传输记录标为「已跳过 · 内容相同」，
   * 与「已成功」区分开——解决"重复拖相同文件看不到任何反馈"的问题。
   */
  onTransferSkipped?(info: AutoSkippedInfo): void
  // ★ 2026-08-10：传输方法返回 boolean（true=完整成功），供剪切粘贴删源前校验
  uploadTopLevel(remotePath: string, localPath: string): Promise<boolean>
  uploadRaw(remotePath: string, localPath: string): Promise<boolean>
  downloadTopLevel(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  /** ★ 2026-09-26：onProgress = 本文件已落盘字节（目录内单文件的**行级实时进度**，
   *   原先只在文件传完时上报一次，大文件期间整行静止）；实现见面板 _doDownloadRaw */
  downloadRaw(
    remotePath: string,
    localPath: string,
    mode?: number,
    size?: number,
    onProgress?: (bytes: number) => void,
  ): Promise<boolean>
  refreshRemote(): Promise<unknown>
  /** ★ 2026-08-10：目录内文件级并发数（1-10，实时读设置）；可选，缺省回落默认 3 */
  dirUploadConcurrency?(): number
  dirDownloadConcurrency?(): number
  /** ★ 2026-08-11：tar 通道下载 tar 包（不产生 UI 条目）；onProgress 上报字节，shouldAbort 为 true 时中断 */
  downloadTarBall(
    remotePath: string,
    localPath: string,
    size: number,
    onProgress?: (bytes: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<boolean>
  /**
   * ★ 2026-09-25 P1：命中「重复入队」时提示用户（面板 showToast 桥接）。
   *   displayName 为文件名/文件夹名（取 basename）。
   */
  notifyDuplicateTransfer?(displayName: string): void
  /**
   * ★ 2026-09-29：仅 TAR 模式下打包通道不可用/失败的用户提示（面板翻译成「原因 + 解决方法」）。
   *   name = 传输条目名（目录名）；code = TarFailureCode；detail = 技术细节（已同时写日志）。
   *   只在该模式下触发 —— 其余模式的失败都会平滑回退逐文件通道，不需要打扰用户。
   */
  notifyTarChannelFailure?(name: string, code: string, detail: string): void
}

/**
 * ★ 2026-09-25 P1：顶层传输槽位键（协调器与面板共用的唯一定义，必须完全一致）。
 * 本地路径走 path.resolve，消除 `./`、`\` 等写法差异；远端路径去掉尾部斜杠。
 */
export function buildTransferSlotKey(
  direction: 'upload' | 'download', remotePath: string, localPath: string,
): string {
  let normLocal = localPath
  try { normLocal = path.resolve(localPath) } catch { /* 保留原值 */ }
  return `${direction}|${(remotePath ?? '').replace(/\/+$/, '')}|${normLocal}`
}

export class PanelTransferCoordinator {
  readonly conflictDetection: ConflictDetectionPort
  private readonly uploadUseCase: UploadPathUseCase
  private readonly downloadOneUseCase: DownloadOneUseCase
  private readonly downloadDirUseCase: DownloadDirUseCase
  private readonly mergeLocalDirUseCase: MergeLocalDirUseCase
  /** ★ 2026-09-29（四）：多选批量上传（同一父目录下 ≥2 项打一个归档） */
  private readonly uploadBatchUseCase: UploadBatchUseCase

  /**
   * ★ 2026-09-25 P1：进行中的**顶层**目录传输槽位（键见 buildTransferSlotKey）。
   *
   * 为什么放在协调器而不是面板：所有顶层目录入口最终都汇聚到本类——粘贴走
   * panel.downloadRemoteDir → 这里；**右键/菜单/拖拽下载**走 DownloadOneUseCase
   * → `downloadDir` 端口 → 这里。只在面板拦会漏掉右键那条链（实测正是「粘贴 + 右键下载」
   * 同时产生两条相同的 data 目录传输）。
   *
   * 用户实测场景：Ctrl+V 后界面未及时响应 → 以为没生效又点一次「下载」→ 两条完全相同的传输
   * 并发跑同一目录：① 各自在服务端 tar 打包、各自下载 tar 包，第二条还因本地目标已被第一条
   * 占用而回退逐文件；② 逐文件阶段两条流写同一批目标文件，`activeDownloadTargets` 守卫互相
   * skip 且都被记为失败 → 最终**双双失败**，且此前无任何提示。
   */
  private readonly _activeTransferSlots = new Set<string>()

  constructor(private readonly host: PanelTransferHost) {
    // ★ 2026-09-07 issue #15：内容摘要服务（可选）。未启用时传 null，退化为仅 size+mtime 判定。
    const digestSettings = host.conflictDigestOptions?.() ?? null
    const digestService = digestSettings?.enabled
      ? new ContentDigestService(() => host.sshSession ?? null, {
          algo: digestSettings.algo,
          maxBytes: digestSettings.maxBytes,
        })
      : null
    this.conflictDetection = new SftpConflictDetector(
      () => host.sftpSession as any,
      host.mtimeToleranceMs,
      digestService,
      // ★ 2026-09-07 issue #15+：必须是回调而非 boolean——
      //   panel 在 ngOnInit 之前就已构造 coordinator，此时 _conflictAutoSkipSameContent 还是默认 true，
      //   把当时的 boolean 固化进 detector 会导致"用户关了自动跳过、却仍按 true 跑"的 bug。
      //   改为回调 → 每次判定实时读 panel 字段 → 设置变更即时生效。
      () => host.conflictDigestOptions?.()?.autoSkipSameContent ?? true,
      // ★ 2026-09-07 issue #15+：detector 命中「自动跳过」时同步回调 host.onTransferSkipped，
      //   由面板把对应传输记录标为「已跳过 · 内容相同」。空函数兜底防止 host 未注册回调
      (info) => { try { host.onTransferSkipped?.(info) } catch (e) { log.warn('onTransferSkipped host callback threw:', e) } },
    )
    const ports = this._buildPorts()
    this.downloadDirUseCase = new DownloadDirUseCase(
      ports, this._remoteStats(), () => host.dirDownloadConcurrency?.(),
    )
    this.downloadOneUseCase = new DownloadOneUseCase(ports, {
      getLocalPath: () => host.localPath,
      downloadDir: (remoteSrc, localDest) => this.downloadRemoteDir(remoteSrc, localDest),
    })
    this.uploadUseCase = new UploadPathUseCase(ports, () => host.dirUploadConcurrency?.())
    // ★ 2026-09-29（四）：复用同一份 ports（含 getter 形态的 tarChannelMode，禁止快照）
    this.uploadBatchUseCase = new UploadBatchUseCase(ports)
    this.mergeLocalDirUseCase = new MergeLocalDirUseCase({
      localFs: ports.localFs,
      sftp: ports.sftp,
      execution: ports.execution,
      refreshRemote: () => host.refreshRemote(),
      // ★ 2026-08-11：合并覆盖也要有「传输中」面板（此前无进度条目，用户以为没在传）；
      //   非快速模式预扫描得真实总量，与常规目录上传一致
      folder: ports.folder,
      scanLocalDir: (dirPath) => host.scanLocalDir(dirPath),
      // ★ 2026-09-29（三）：合并上传接入打包通道 —— 这条出口就是用户选「覆盖」后的实际执行体，
      //   不接打包含路时「仅 TAR + 选覆盖」仍会走 ⇄SFTP（用户实测质问）。
      //   tarChannel 恒挂载、tarChannelMode 用 getter：本对象与 ports 一样在构造函数里建好后
      //   长期复用，**禁止取值快照**（写成属性会把构造时的模式冻住 → 改设置不生效，
      //   同 _buildPorts 的 P0 说明）。是否真的打包由通道内按调用时的 mode 决定。
      tarChannel: ports.tarChannel,
      tarChannelMode: () => ports.tarChannelMode,
      checkRemotePathExists: (remotePath, expectDir) =>
        this.conflictDetection.checkRemotePathExists(remotePath, expectDir),
    })
  }

  /**
   * ★ 2026-09-20 P1-2 审计修复：所有目录任务入口统一套「任务作用域」。
   *   作用域已有的（嵌套调用：冲突覆盖时对子目录再次进入）直接复用，不另起新引用——
   *   否则嵌套任务会把自己的子流登记进新 ref，而进度条目持的是顶层 ref，取消时又漏杀。
   */
  private _runScopedFolderTask<T>(fn: () => Promise<T>): Promise<T> {
    return runInTaskScope(currentTaskScope() ?? createTaskScope(), fn)
  }

  /** 只读查询：该 (方向, 远端, 本地) 是否已有在途顶层传输（面板用于提前提示） */
  isTransferSlotActive(direction: 'upload' | 'download', remotePath: string, localPath: string): boolean {
    return this._activeTransferSlots.has(buildTransferSlotKey(direction, remotePath, localPath))
  }

  /** 认领顶层传输槽位；命中重复请求时提示用户并返回 false（调用方须直接判失败返回） */
  private _claimTransferSlot(
    direction: 'upload' | 'download', remotePath: string, localPath: string, displayName: string,
  ): boolean {
    const key = buildTransferSlotKey(direction, remotePath, localPath)
    if (this._activeTransferSlots.has(key)) {
      log.warn('[dup-transfer] ignored duplicate request:', key)
      try { this.host.notifyDuplicateTransfer?.(displayName) } catch { /* ignore */ }
      return false
    }
    this._activeTransferSlots.add(key)
    return true
  }

  /** 释放传输槽位（与 _claimTransferSlot 成对，必须在 finally 里调用） */
  private _releaseTransferSlot(direction: 'upload' | 'download', remotePath: string, localPath: string): void {
    this._activeTransferSlots.delete(buildTransferSlotKey(direction, remotePath, localPath))
  }

  uploadPathToRemote(remoteDir: string, localPath: string, top?: FolderTransferCtx): Promise<boolean> {
    // ★ 2026-09-25 P1：顶层调用做重复入队拦截（嵌套子目录/冲突覆盖重入必须放行）
    if (top) {
      return this._runScopedFolderTask(() => this.uploadUseCase.execute(remoteDir, localPath, top))
    }
    const slotName = path.basename(localPath)
    const slotRemote = path.posix.join(remoteDir, slotName)
    if (!this._claimTransferSlot('upload', slotRemote, localPath, slotName)) return Promise.resolve(false)
    return this._runScopedFolderTask(() => this.uploadUseCase.execute(remoteDir, localPath, top))
      .finally(() => this._releaseTransferSlot('upload', slotRemote, localPath))
  }

  streamDownloadOne(file: SFTPFile, targetLocalDir?: string): Promise<void> {
    return this.downloadOneUseCase.execute(file, targetLocalDir)
  }

  downloadRemoteDir(
    remoteSrc: string,
    localDest: string,
    top?: FolderTransferCtx,
    localName?: string,
    forceOverwrite?: boolean,
  ): Promise<boolean> {
    const run = () => this._runScopedFolderTask(
      () => this.downloadDirUseCase.execute(remoteSrc, localDest, top, localName, undefined, !!forceOverwrite),
    )
    if (top) return run()
    // ★ 2026-09-25 P1：本地目标与 DownloadDirUseCase 一致 = join(localDest, localName || basename(remoteSrc))
    const slotName = localName || path.posix.basename(remoteSrc)
    const slotLocal = path.join(localDest, slotName)
    if (!this._claimTransferSlot('download', remoteSrc, slotLocal, slotName)) return Promise.resolve(false)
    return run().finally(() => this._releaseTransferSlot('download', remoteSrc, slotLocal))
  }

  mergeLocalDirToRemote(localSrc: string, remoteDest: string, reuseLogEntryId?: string): Promise<boolean> {
    // remoteDest 即最终目标目录（已含本地文件夹名），故键直接用 (remoteDest, localSrc)
    const slotName = path.basename(localSrc)
    if (!this._claimTransferSlot('upload', remoteDest, localSrc, slotName)) return Promise.resolve(false)
    return this._runScopedFolderTask(
      () => this.mergeLocalDirUseCase.execute(localSrc, remoteDest, true, reuseLogEntryId),
    ).finally(() => this._releaseTransferSlot('upload', remoteDest, localSrc))
  }

  /**
   * ★ 2026-09-29（四）：多选批量上传入口（同一父目录下 ≥2 项打一个归档）。
   *
   * 返回 true 表示「本批已由打包通道处理」（成功，或仅 TAR 模式下的硬失败）——
   * 调用方**必须直接收工**，不能再逐项入队（否则整批会被重传一遍）。
   * 返回 false 表示未接管，调用方照原样走逐项流程。
   *
   * 槽位：调用前**逐条**认领（键与逐项路径完全一致），于是「批量正在传 a.txt」时用户再对 a.txt
   * 发起单项上传会被识别为重复请求，反之亦然（共用同一张 _activeTransferSlots）。
   * 只要有一条已被占用，就回滚本次已认领的全部槽位并返回 false —— 让逐项流程去走它原有的
   * 重复检测（那条路径会老老实实提示「已在传输中」），而不是在这里自作主张。
   *
   * displayName 由调用方（面板）用 i18n 组装后传入：本类不做 i18n，且这个字符串会同时进
   * 进度条目与传输记录。
   */
  uploadBatchToRemote(localPaths: string[], remoteDir: string, displayName: string): Promise<boolean> {
    if (localPaths.length < 2) return Promise.resolve(false)
    const claimed: Array<[string, string]> = []
    for (const localPath of localPaths) {
      const name = path.basename(localPath)
      const remoteTarget = path.posix.join(remoteDir, name)
      if (!this._claimTransferSlot('upload', remoteTarget, localPath, name)) {
        for (const [r, l] of claimed) this._releaseTransferSlot('upload', r, l)
        return Promise.resolve(false)
      }
      claimed.push([remoteTarget, localPath])
    }
    return this._runScopedFolderTask(
      () => this.uploadBatchUseCase.execute(localPaths, remoteDir, displayName),
    )
      // 'success' / 'failed' 都算「已接管」：前者完成，后者是仅 TAR 下的硬失败（通道内已通知用户）
      .then(r => r !== 'fallback')
      .catch(e => {
        // 用例内部已把异常写进日志；这里只把流程交回逐项通道 —— 不能因批量这一层的意外
        // 让整批直接失败（那会比「没有批量打包」更差）
        log.warn('[batch-upload] batch path threw, falling back to per-file:', e)
        return false
      })
      .finally(() => {
        for (const [r, l] of claimed) this._releaseTransferSlot('upload', r, l)
      })
  }

  checkUploadConflict(
    remotePath: string,
    localPath: string,
    localSize: number,
    localMtime: number,
  ): Promise<ConflictCheckOutcome> {
    return this.conflictDetection.checkUploadConflict(remotePath, localPath, localSize, localMtime)
  }

  checkLocalConflict(
    localPath: string,
    remotePath: string,
    remoteSize: number,
    remoteMtime: number,
  ): Promise<ConflictCheckOutcome> {
    return this.conflictDetection.checkLocalConflict(localPath, remotePath, remoteSize, remoteMtime)
  }

  checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean> {
    return this.conflictDetection.checkRemotePathExists(remotePath, expectDir)
  }

  private _remoteStats(): RemoteDirStatsPort {
    const host = this.host
    return {
      scanDir: (p) => host.scanRemoteDir(p),
    }
  }

  /** ★ 2026-08-11：组装 tar 打包通道（仅目标不存在的全新传输时由用例启用） */
  private _tarChannel(): TarChannel {
    const host = this.host
    return new TarChannel({
      hasSsh: () => !!host.sshSession,
      exec: (cmd, timeoutMs, opts) => execSshCommand(host.sshSession, cmd, timeoutMs, opts),
      uploadFile: async (localPath, remotePath, onProgress, shouldAbort) => {
        const raw = host.sftpSession as any
        if (!raw) return false
        const up = new LocalPathFileUpload(localPath)
        const timer = setInterval(() => {
          if (shouldAbort?.() && !up.isCancelled()) void up.cancel()
          onProgress?.(up.getCompletedBytes())
        }, 400)
        try {
          // ★ 2026-08-11 修复：新版 Tabby（russh）的 SFTPSession 无 createWriteStream，
          //   直接调 uploadViaRawToTemp 会同步抛 TypeError 导致打包通道必败；
          //   与 uploadLocalFile 同款能力探测，无 raw stream 时回退标准 upload() API
          if (typeof raw.createWriteStream === 'function') {
            await uploadViaRawToTemp(raw, remotePath, up, 0)
          } else {
            await raw.upload(remotePath, up)
          }
          return !up.isCancelled() && !up.isPaused() && up.isComplete()
        } catch (e) {
          log.warn('tar channel tarball upload failed:', remotePath, e)
          return false
        } finally {
          clearInterval(timer)
          up.close().catch(() => {})
        }
      },
      downloadFile: (remotePath, localPath, size, onProgress, shouldAbort) =>
        host.downloadTarBall(remotePath, localPath, size, onProgress, shouldAbort),
      remoteUnlink: async (p) => {
        try { await (host.sftpSession as any).unlink(p) } catch { /* ignore */ }
      },
      // ★ 2026-08-11：本地扫描开销低，复用合并遍历的 scanLocalDir 取真实目录大小
      scanLocalSize: (p) => host.scanLocalDir(p).then(s => s?.size ?? 0).catch(() => 0),
      // ★ 2026-09-28：上传方向择路用（文件数 + 总字节）
      scanLocalDir: (p) => host.scanLocalDir(p).catch(() => null),
      // ★ 2026-09-29（四）：批量上传择路用（**合计**口径）。
      //   ⚠ 不能拿 scanLocalDir 对每个路径逐个凑：它对**单个文件**调用时 readdir 必然抛错、
      //     返回 {0,0}，于是「选了一批散装小文件」会被算成 0 个文件 0 字节 ——
      //     恰好把最该走打包的场景判掉（本通道的主场正是「文件多、总量小」）。
      scanLocalPaths: async (paths) => {
        let size = 0
        let count = 0
        for (const p of paths) {
          const st = await fs.stat(p).catch(() => null)
          if (!st) continue
          if (st.isDirectory()) {
            const s = await host.scanLocalDir(p).catch(() => null)
            if (s) { size += s.size; count += s.count }
          } else {
            size += st.size
            count += 1
          }
        }
        return { size, count }
      },
      // ★ 2026-09-28：目录下载始终扫描远端真实大小（移除快速模式后不再有跳过语义）
      scanRemoteSize: (p) => host.scanRemoteDir(p).then(s => s?.size ?? 0).catch(() => 0),
      // ★ 2026-09-29：仅 TAR 模式下打包通道不可用（不回退）→ 交面板提示原因与解决方法
      notifyFailure: (name, code, detail) => {
        try { host.notifyTarChannelFailure?.(name, code, detail) } catch { /* ignore */ }
      },
    })
  }

  private _buildPorts(): TransferUseCasePorts {
    const host = this.host
    const conflictQueue: ConflictQueuePort = {
      enqueue: (item) => host.enqueueConflict(item),
      showDialog: () => host.showConflictDialog(),
    }
    const localFs: LocalTransferFsPort = {
      lstat: (p) => fs.lstat(p).catch(() => null),
      listChildren: async (p) => {
        const entries = await fs.readdir(p, { withFileTypes: true })
        return entries.map(e => ({ name: e.name, isSymbolicLink: e.isSymbolicLink() }))
      },
      scanDir: (p) => host.scanLocalDir(p),
      pathExists: (p) => fs.stat(p).then(() => true).catch(() => false),
      mkdirRecursive: async (p) => { try { await fs.mkdir(p, { recursive: true }) } catch {} },
    }
    const sftp: SftpTransferPort = {
      hasSession: () => !!host.sftpSession,
      mkdir: async (remotePath) => {
        try { await (host.sftpSession as any).mkdir(remotePath) } catch {}
      },
      readdir: async (remoteSrc) => {
        const entries = await (host.sftpSession as any).readdir(remoteSrc)
        return entries.map((e: any) => ({
          name: e.name,
          isDirectory: !!e.isDirectory,
          isSymlink: !!(e.isSymlink || e.isSymbolicLink),
          size: e.size,
          mode: e.mode,
          modified: e.modified,
        }))
      },
      stat: async (remotePath) => {
        const session = host.sftpSession as any
        if (!session?.stat) return null
        try {
          const st = await session.stat(remotePath)
          if (!st) return null
          return {
            name: path.posix.basename(remotePath),
            isDirectory: !!st.isDirectory,
            size: st.size ?? st.attrs?.size,
            mode: st.mode ?? st.attrs?.permissions ?? st.attrs?.mode,
            modified: st.modified ?? st.mtime ?? st.mtimeMs ?? st.attrs?.modified ?? st.attrs?.mtime,
            mtime: st.mtime ?? st.attrs?.mtime,
            attrs: st.attrs,
          }
        } catch (e: any) {
          if (e?.code === 'ENOENT' || /not exist/i.test(String(e?.message))) return null
          log.warn('sftp stat failed in transfer coordinator:', remotePath, e?.message)
          return null
        }
      },
      isSymlink: async (remotePath) => {
        const session = host.sftpSession as any
        try {
          const st = await session?.lstat?.(remotePath)
          if (st) {
            const isLink = !!(
              st.isSymbolicLink === true ||
              (typeof st.isSymbolicLink === 'function' && st.isSymbolicLink()) ||
              st.isSymlink === true ||
              st.type === 2 ||
              st.attrs?.isSymlink === true ||
              st.attrs?.type === 2 ||
              st.attrs?.type === 'symbolic-link'
            )
            if (isLink) return true
          }
        } catch { /* readlink fallback below */ }
        if (typeof session?.readlink === 'function') {
          try {
            await session.readlink(remotePath)
            return true
          } catch { /* ordinary path or unsupported */ }
        }
        return false
      },
    }
    const folder: FolderTransferPort = {
      start: (...args) => host.startFolderTransfer(...args),
      finish: (ctx, success) => host.finishFolderTransfer(ctx, success),
      discard: (ctx) => {
        try { host.discardFolderTransfer?.(ctx) } catch { /* ignore */ }
      },
      updateLogSize: (ctx, size) => host.updateFolderLogSize(ctx, size),
      // ★ 2026-09-29：逐跳转发链 tar-channel → FolderTransferPort → PanelTransferHost → 面板。
      //   两个都是可选成员，TS **不会**报「漏转发」（少参可赋多参类型，本项目已踩坑多次），
      //   改动时必须三跳逐一核对。
      markChannelMode: (ctx, mode) => { try { host.markChannelMode?.(ctx, mode) } catch { /* ignore */ } },
      updateProgress: (...args) => host.updateFolderProgress(...args),
      markHadConflict: (ctx) => { ctx.hadConflict = true },
      isAborted: (ctx) => !!(ctx.t as any)?._aborted,
      isPaused: (ctx) => !!(ctx.t as any)?._paused,
      waitWhilePaused: async (ctx) => {
        while ((ctx.t as any)?._paused) {
          await new Promise(r => setTimeout(r, 1000))
          if ((ctx.t as any)?._aborted) break
        }
      },
      consumeAbortCurrent: (ctx) => {
        if ((ctx.t as any)?._abortCurrent) {
          delete (ctx.t as any)._abortCurrent
          return true
        }
        return false
      },
    }
    const execution: TransferExecutionPort = {
      uploadTopLevel: (remotePath, localPath) => host.uploadTopLevel(remotePath, localPath),
      uploadRaw: (remotePath, localPath) => host.uploadRaw(remotePath, localPath),
      downloadTopLevel: (remotePath, localPath, mode, size) =>
        host.downloadTopLevel(remotePath, localPath, mode, size),
      downloadRaw: (remotePath, localPath, mode, size, onProgress) =>
        host.downloadRaw(remotePath, localPath, mode, size, onProgress),
    }
    return {
      localFs,
      sftp,
      folder,
      execution,
      conflictDetection: this.conflictDetection,
      // ★ 2026-09-29 P0 修复：本函数只在**构造函数**里被调用一次，返回的 ports 会被长期复用，
      //   因此这里绝不能出现「取值快照」—— 必须让每次读取都实时向 host 要值。
      //   · tarChannel 恒挂载：是否真的走打包由通道内按**调用时**的 mode 决定
      //     （sftpOnly 在 tryUploadDir/tryDownloadDir 入口直接让路返回 fallback，
      //      不做 tar 可用性/规模探测，零多余往返）。
      //   · tarChannelMode 用 getter：原来写成普通属性 → 用户在设置页改模式后，
      //     面板字段虽已更新，端口里还是构造时的旧值，表现为「选了仅 TAR 却按 smart 择路」。
      //   同 conflictDigestOptions 的 autoSkipSameContent（必须是回调而非 boolean）。
      tarChannel: this._tarChannel(),
      get tarChannelMode(): string { return host.tarChannelMode?.() ?? 'smart' },
      // ★ 2026-09-29：仅 TAR 模式下「打包通道不适用」（目标已存在 → 只能走逐文件增量）的告知。
      //   与通道内 _decline 共用同一条 host 通知链（code='targetExists'），面板侧按「说明性提示」
      //   呈现而非失败提示 —— 传输本身照常完成，只是没用上打包。
      notifyTarOnlyInapplicable: (name, reason, detail) => {
        try { host.notifyTarChannelFailure?.(name, reason, detail) } catch { /* ignore */ }
      },
      conflictQueue,
    }
  }
}



export interface PanelTransferRuntimeHost {
  connected: boolean
  sftpSession: any
  transfers: PanelTransferItem[]
  transferLog: {
    add(input: any): { id: string }
    update(id: string, patch: any): void
    remove(id: string): boolean
    getAll(): any[]
  }
  profile?: { name?: string }
  effectiveLang: string
  notifications: { error?: (message: string, detail?: string) => void } | null
  cdr: { detectChanges(): void }
  detectChanges?(): void
  zone: { run<T>(fn: () => T): T }
  formatSpeed(bytes: number, ms: number): string
}

export class PanelTransferRuntime {
  // ★ BUG-3 修复：WeakMap → Map，防止传输过程中 entry 被 GC 回收导致进度丢失
  private _transferMeta = new Map<object, {
    prevBytes: number
    prevTime: number
    startTime: number
    lastProgressTime: number
  }>()
  private _transferTimer: ReturnType<typeof setInterval> | null = null
  private _trackedTransferCount = 0

  /**
   * ★ 2026-08-10 修复：排队条目取消的"粘性标记"（key=direction|localPath → 取消时刻）。
   * 竞态：_runQueuedUpload/Download 已通过 transfers.includes 检查开始执行，但尚未走到
   * trackTransfer 认领（中间隔着冲突检测 stat 等 RTT）；此时用户取消 queued 条目只删了 UI 条目，
   * 传输继续 → trackTransfer 找不到占位会新建条目 → "取消失败"（文件照传、条目再现）。
   * 认领前消费此标记：命中则直接 abort 底层传输且不建条目。短 TTL 避免误伤后续重新发起的同名传输。
   */
  private _queuedCancelKeys = new Map<string, number>()
  private static readonly QUEUED_CANCEL_TTL_MS = 10_000
  /** 组件已销毁标记，防止异步回调对已销毁对象操作 */
  private _disposed = false

  constructor(private readonly host: PanelTransferRuntimeHost) {}

  private _detect(): void {
    if (this._disposed) return
    if (this.host.detectChanges) this.host.detectChanges()
    else {
      try { this.host.cdr.detectChanges() } catch { /* destroyed view */ }
    }
  }

  private _queuedCancelKey(direction: string, localPath: string, remotePath?: string): string {
    return direction + '|' + localPath + '|' + (remotePath || '')
  }

  /** 记录一次排队条目的取消（供 trackTransfer/_startFolderTransfer 认领前拦截） */
  recordQueuedCancel(direction?: string, localPath?: string, remotePath?: string): void {
    if (!direction || !localPath) return
    const now = Date.now()
    // ★ 2026-08-26 M18：TTL 扫描清理，避免粗暴删首项误伤有效取消标记
    for (const [k, ts] of this._queuedCancelKeys) {
      if (now - ts > PanelTransferRuntime.QUEUED_CANCEL_TTL_MS) this._queuedCancelKeys.delete(k)
    }
    this._queuedCancelKeys.set(this._queuedCancelKey(direction, localPath, remotePath), now)
  }

  /** 消费粘性取消标记：true=该传输在排队期间已被取消，调用方应立即 abort 且不建条目 */
  consumeQueuedCancel(direction?: string, localPath?: string, remotePath?: string): boolean {
    if (!direction || !localPath) return false
    // 兼容旧键（无 remotePath）与新键
    const keys = [
      this._queuedCancelKey(direction, localPath, remotePath),
      this._queuedCancelKey(direction, localPath),
    ]
    for (const key of keys) {
      const ts = this._queuedCancelKeys.get(key)
      if (ts == null) continue
      this._queuedCancelKeys.delete(key)
      return Date.now() - ts <= PanelTransferRuntime.QUEUED_CANCEL_TTL_MS
    }
    return false
  }

  async trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): Promise<void> {
    // ★ 2026-08-10 修复：排队期间已被取消（竞态窗口内传输已启动）——
    //   直接 abort 底层传输且不认领/新建条目，避免"取消后文件照传、条目再现"
    // ★ 2026-09-14 F6：消费也带 remotePath（consumeQueuedCancel 兼容新旧两种键）
    if (this.consumeQueuedCancel(direction, localPath, remotePath)) {
      try { await t.cancel?.() } catch { /* ignore */ }
      return
    }
    // ★ 修复：getSize 可能是异步的（LocalPathFileUpload 返回 Promise<number>），
    //   必须 await，否则 bytesTotal 会被设成 Promise → percent 计算为 NaN → 进度条宽度崩、百分比恒为 0
    // ★ 2026-09-21 P1 修复：原 `|| 0` 会把 undefined/NaN（getSize 缺失或异常）折成 0，
    //   与「真的是空文件」混淆并触发下面的「秒成功」短路。未知一律归到 -1。
    const rawSz = await Promise.resolve(t.getSize?.())
    const sz = Number.isFinite(rawSz as number) ? Number(rawSz) : -1
    const profileName = this.host.profile?.name || undefined
    const operation = logOperation ?? direction

    // ★ 2026-08-10：认领预注册的排队占位条目（多选拖拽/下载）——复用占位条目与日志，
    //   避免占位条目与实际传输条目重复显示
    // ★ 2026-09-14 F6：认领也带 remotePath（占位条目 6107/6269 均带 remotePath），
    //   消除与取消/消费/文件夹认领分支的不一致，避免同名 localPath 认领错条目
    const claimed = this.host.transfers.find(
      e => e.queued && e.direction === direction && e.localPath === localPath && e.remotePath === remotePath,
    )
    if (claimed) {
      if (sz === 0) {
        // 空文件立即完成：移除占位并收尾日志
        this.host.transfers = this.host.transfers.filter(x => x !== claimed)
        if (claimed.logEntryId != null) {
          this.host.transferLog.update(claimed.logEntryId, { success: true, duration: 0, endTime: Date.now(), pending: false })
        }
        return
      }
      claimed.transfer = t
      claimed.queued = false
      claimed.bytesTotal = sz
      claimed.bytesDone = 0
      claimed.percent = 0
      claimed.transferMode = claimed.transferMode || 'sftp'
      if (claimed.logEntryId != null) {
        this.host.transferLog.update(claimed.logEntryId, {
          size: sz, startTime: Date.now(), transferMode: claimed.transferMode || 'sftp',
        })
      }
      const claimNow = Date.now()
      this._transferMeta.set(claimed, { prevBytes: 0, prevTime: claimNow, startTime: claimNow, lastProgressTime: claimNow })
      this._trackedTransferCount++
      this._startTransferTimer()
      return
    }

    const logEntry = this.host.transferLog.add({
      operation,
      localPath,
      remotePath,
      profileName,
      success: true,
      // ★ 2026-09-21：sz=-1 表示「大小未知」（stat 失败的下载），size 字段不落负值
      size: sz >= 0 ? sz : undefined,
      duration: 0,
      startTime: Date.now(),
      // ★ 修复：sz=0 立即完成无需 pending；sz=-1（未知大小）仍在传输，必须标进行中
      pending: sz !== 0,
      transferMode: 'sftp',
    })

    if (sz === 0) {
      this.host.transferLog.update(logEntry.id, { success: true, duration: 0, endTime: Date.now() })
      return
    }

    const entry: PanelTransferItem = {
      transfer: t,
      direction,
      // ★ 2026-08-10：下载走 .tmp 原子落盘、上传走 .tabby-upload，getName() 会带临时后缀，
      //   展示层统一剥离，避免传输列表显示 xxx.tmp
      name: String(t.getName()).replace(/\.(tmp|tabby-upload)$/, ''),
      remotePath,
      localPath,
      percent: 0,
      speed: '',
      bytesDone: 0,
      bytesTotal: sz,
      logEntryId: logEntry.id,
      paused: false,
      transferMode: 'sftp',
    }
    this.host.transfers.push(entry)

    const now = Date.now()
    this._transferMeta.set(entry, { prevBytes: 0, prevTime: now, startTime: now, lastProgressTime: now })
    this._trackedTransferCount++
    this._startTransferTimer()
  }

  cancelTransfer(entry: { transfer: any; logEntryId?: string; paused?: boolean; isFolder?: boolean }): void {
    // ★ 2026-08-10：排队占位条目尚未开始传输——直接移除条目并删掉占位日志（不产生"已取消"记录）。
    //   同时记粘性取消标记：若传输已过调度检查正在启动（尚未认领），trackTransfer/认领处会拦截 abort
    // ★ 2026-09-21 P1 修复：取消标记必须带 remotePath——只记 direction+localPath 旧键时，
    //   同 localPath 但不同 remoteDir 的排队任务（右键默认路径 + 拖拽当前目录可并存）
    //   会在 10s TTL 内被互相误消费 abort（F6 只修了消费端，记录端漏了）
    if ((entry as any).queued) {
      this.recordQueuedCancel((entry as any).direction, (entry as any).localPath, (entry as any).remotePath)
      this.host.transfers = this.host.transfers.filter(x => x !== entry)
      if (entry.logEntryId != null) {
        try { this.host.transferLog.remove(entry.logEntryId) } catch { /* ignore */ }
      }
      return
    }
    if (entry.transfer) {
      try {
        // cancel() 同步置 cancelled（写入立即停止）后 await close()，无需 await；
        // ★ 2026-09-21 P2 修复：但它是 async，reject 时 try/catch 抓不到 → unhandled rejection
        const r = typeof entry.transfer.cancel === 'function' ? entry.transfer.cancel()
          : typeof entry.transfer.destroy === 'function' ? entry.transfer.destroy()
          : undefined
        void Promise.resolve(r).catch((e: unknown) => log.warn('cancelTransfer: cancel failed', e))
      } catch (e) { log.warn('cancelTransfer: cancel threw', e) }
    }
    if (entry.isFolder) {
      ;(entry as any)._aborted = true
    }
    // ★ 2026-07-25 B12：取消"暂停态"的下载时清理孤儿 .tmp——
    //   活动中的下载由 downloadRemoteFile 自己收尾；但暂停态的下载其收尾逻辑早已退出
    //   （暂停分支特意保留 .tmp 供续传），此时取消便无人删除半截 .tmp，永久残留。
    this._cleanupPausedDownloadTmp(entry)
    this._cleanupPausedUploadTmp(entry)
    this.host.transfers = this.host.transfers.filter(x => x !== entry)
    if (this._transferMeta.has(entry as any)) {
      this._transferMeta.delete(entry as any)
      this._trackedTransferCount--
      if (this._trackedTransferCount <= 0) {
        this._trackedTransferCount = 0
        this._stopTransferTimer()
      }
    }
    if (entry.logEntryId != null) {
      this.host.transferLog.update(entry.logEntryId, { success: false, endTime: Date.now(), failReason: 'cancelled', pending: false })
    }
  }

  cancelCurrentFile(entry: { isFolder?: boolean }): void {
    if (entry.isFolder) {
      ;(entry as any)._abortCurrent = true
    }
  }

  /**
   * ★ 2026-07-25 B12：清理"暂停态下载"取消后的孤儿 .tmp。
   *   仅对 paused 的单文件下载生效（无活动写入方，删除安全）；
   *   活动中的下载各自的收尾逻辑（downloadRemoteFile / 续传路径）负责自清理。
   */
  private _cleanupPausedDownloadTmp(entry: any): void {
    if (entry?.isFolder || !entry?.paused) return
    if (entry.direction !== 'download' || !entry.localPath) return
    const tmp = entry.localPath + '.tmp'
    try { fsSync.unlinkSync(tmp) } catch { /* 不存在或已被清理 */ }
  }

  /**
   * ★ 2026-07-25 B13：清理"暂停态上传"取消后的孤儿 .tabby-upload 临时文件。
   *   上传暂停时 uploadViaRawToTemp 已结束流但保留临时文件（供续传）；若此时再取消，
   *   上传循环已退出、无人删临时文件，需在此补删。仅对 paused 的单文件上传生效（无活动写入方）。
   */
  private _cleanupPausedUploadTmp(entry: any): void {
    if (entry?.isFolder || !entry?.paused) return
    if (entry.direction !== 'upload' || !entry.remotePath) return
    // ★ 2026-08-10 修复：remotePath 是远程 POSIX 路径，必须用 SFTP 会话删除。
    //   旧实现用本地 fsSync.unlinkSync：Windows 上被解析为当前盘符相对路径，
    //   远程孤儿临时文件永远无法清理，还可能误删本地同名文件。
    const session = this.host.sftpSession
    if (!session || typeof session.unlink !== 'function') return
    try {
      const p = session.unlink(entry.remotePath + '.tabby-upload')
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => { /* 不存在或已改名 */ })
      }
    } catch { /* ignore */ }
  }

  /**
   * 暂停传输（文件夹：标记 _paused，等当前子文件完成后再停；
   *             单文件：关闭 fd 并取消底层 SFTP 流，返回当前偏移用于续传）
   * 修改人：DD1024z + Hy3
   * 修改时间：2026-07-23
   *   ① await pause()：offset 是 async 返回值 Promise<number>，不加 await 会把 Promise 当 number 传给 resume，
   *      导致续传时 resumeOffset 为 NaN → 文件 'w' 截断写入 → 下载重头开始。
   *   ② await cancel()：pause() 只关 fd 不杀 SFTP 流，流会回调 write() 重新打开 fd；
   *      resume 又起新传输 → 两个传输同时写同一文件 → 数据损坏。
   */
  async pauseTransfer(entry: any): Promise<void> {
    if (entry.queued) return  // ★ 2026-08-10：排队条目无底层传输对象，不可暂停
    if (entry.paused) return
    if (entry.isFolder) {
      // ★ 文件夹暂停：只设标记不cancel当前子文件，等当前文件完成后在下一文件开始前停，
      //   避免打断当前文件导致续传后该文件丢失或重头下载。
      ;(entry as any)._paused = true
      entry.paused = true
      this._detect()
      return
    }
    try {
      const offset = await entry.transfer.pause?.() ?? 0
      // ★ 2026-07-25 B13：单文件上传走 raw stream，暂停只结束流、保留 .tabby-upload 临时文件，
      //   故不再调 cancel()（cancel 会置 cancelled 触发删临时文件）。下载/文件夹仍需 cancel() 杀底层流。
      if (entry.direction !== 'upload') {
        await entry.transfer.cancel?.()
      }
      this.host.zone.run(() => { entry.paused = true })
      entry._pauseOffset = offset
      log.info(`Transfer paused: ${entry.name} at offset ${offset}`)
    } catch (e) {
      log.error('Pause failed', e)
    }
  }

  /**
   * 恢复传输（文件夹：取消 _paused 标记，下载循环继续下个子文件；
   *             单文件：用续传位创建新 transfer 替换旧对象）
   * 修改人：DD1024z + Hy3
   * 修改时间：2026-07-23
   *   续传后重置 meta.prevBytes/prevTime/startTime，避免使用旧 transfer 的 stale 基准点：
   *   prevBytes=0 ⇒ 下个 tick 算 delta = offset - 0 ⇒ 速率飙升；
   *   startTime=original ⇒ 日志耗时包含暂停时长 ⇒ 虚高。
   */
  async resumeTransfer(entry: any): Promise<void> {
    if (entry.queued) return  // ★ 2026-08-10：排队条目无底层传输对象，不可续传
    if (!entry.paused) return
    if (entry.isFolder) {
      delete (entry as any)._paused
      this.host.zone.run(() => { entry.paused = false })
      this._detect()
      return
    }
    try {
      this.host.zone.run(() => { entry.paused = false })
      this._detect()
      // 上传和下载必须走不同续传实现。此前这里无条件调用 _resumeWithRawRead，
      // 会把远端半成品下载回来并最终覆盖本地上传源文件。
      const direction = entry.direction as 'upload' | 'download'
      const remotePath = entry.remotePath as string
      const localPath = entry.localPath as string
      const tmpPath = localPath + '.tmp'
      const mode = entry.transfer.getMode?.() || 0o644
      const totalSize = (await Promise.resolve(entry.transfer.getSize?.())) || 0
      const offset = entry._pauseOffset ?? 0
      const info = direction === 'upload'
        ? await this._resumeTransfer(entry, 'upload', remotePath, localPath, offset)
        : await this._resumeWithRawRead(entry, remotePath, tmpPath, localPath, mode, totalSize, offset)
      this.host.zone.run(() => {
        entry.transfer = info.transfer
        entry.percent = info.percent
        // ★ 修复：重置速率/耗时基准点，避免续传后用了旧 transfer 的 stale prevBytes/startTime
        const meta = this._transferMeta.get(entry as any)
        if (meta) {
          meta.prevBytes = info.transfer.getCompletedBytes?.() ?? 0
          meta.prevTime = Date.now()
          meta.startTime = Date.now()
          meta.lastProgressTime = Date.now()
        }
      })
      delete entry._pauseOffset
      log.info(`Transfer resumed: ${entry.name} (${direction})`)
    } catch (e) {
      log.error('Resume failed', e)
      entry.paused = true
    }
  }

  clearTransfers(): void {
    const now = Date.now()
    for (const t of this.host.transfers) {
      // ★ 2026-08-26 H3：目录用例必须标 _aborted，否则清空/销毁后仍继续跑
      if ((t as any).isFolder) {
        ;(t as any)._aborted = true
      }
      // ★ 2026-08-10：排队占位条目从未开始传输，直接删除占位日志而非标记 interrupted
      if ((t as any).queued) {
        if (t.logEntryId) {
          try { this.host.transferLog.remove(t.logEntryId) } catch { /* ignore */ }
        }
        continue
      }
      // 同步更新日志状态，避免 pending:true 残留
      if (t.logEntryId) {
        try {
          this.host.transferLog.update(t.logEntryId, {
            success: false, endTime: now, failReason: 'interrupted', pending: false,
          })
        } catch {}
      }
      if (t.transfer) {
        try {
          if (typeof t.transfer.cancel === 'function') t.transfer.cancel()
          else if (typeof t.transfer.destroy === 'function') t.transfer.destroy()
        } catch {}
      }
      // ★ 2026-07-25 B12：批量清理时同样处理暂停态下载的孤儿 .tmp
      // ★ 2026-07-25 B13：以及暂停态上传的孤儿 .tabby-upload
      this._cleanupPausedDownloadTmp(t)
      this._cleanupPausedUploadTmp(t)
    }
    this.host.transfers = []
    // ★ 2026-09-20 P2-1 审计修复：清空列表必须同步清 _transferMeta（BUG-3 由 WeakMap 改强引用 Map 后
    //   仅 cancelTransfer 单条路径有 delete）——否则面板生命周期内反复「清空传输」会累积滞留的
    //   entry 与 transfer 适配器闭包（强引用 → GC 无法回收）
    this._transferMeta.clear()
    this._trackedTransferCount = 0
    this._stopTransferTimer()
  }

  dispose(): void {
    this._disposed = true
    // ★ 2026-09-20 P2-1 审计修复：销毁时一并释放强引用元数据（此前只停定时器）
    this._transferMeta.clear()
    this._trackedTransferCount = 0
    this._stopTransferTimer()
  }

  private _startTransferTimer(): void {
    if (this._transferTimer) return
    this._transferTimer = setInterval(() => this._tickAllTransfers(), 200)
  }

  private _stopTransferTimer(): void {
    if (this._transferTimer) {
      clearInterval(this._transferTimer)
      this._transferTimer = null
    }
  }

  private _tickAllTransfers(): void {
    // ★ 2026-09-20 A2 审计修复：dispose() 后仍可能有一次已排队的 tick 在途，
    //   此时 host 侧组件已销毁，继续跑会写 transferLog 并对已销毁视图 detectChanges。
    if (this._disposed) {
      this._stopTransferTimer()
      return
    }
    if (this.host.transfers.length === 0) {
      this._stopTransferTimer()
      return
    }
    let needsDetect = false
    const toRemove: PanelTransferItem[] = []
    for (const entry of this.host.transfers) {
      const meta = this._transferMeta.get(entry as any)
      if (!meta) continue
      const t = entry.transfer
      try {
        if (!this.host.connected) {
          // ★ 2026-08-15 修复 #2：断连后暂停传输也无法恢复（SFTP 会话已丢失），
          //   一并清理避免 UI 永久僵尸
          try {
            if (typeof t.cancel === 'function') t.cancel()
            else if (typeof t.destroy === 'function') t.destroy()
          } catch { /* ignore */ }
          toRemove.push(entry)
          this.host.transferLog.update(entry.logEntryId!, {
            success: false,
            duration: Date.now() - meta.startTime,
            endTime: Date.now(),
            failReason: 'interrupted',
            pending: false,
          })
          continue
        }
        // ★ 2026-09-26：暂停时只清显示文本，**保留 speedBps**（不再置 0）。
        //   置 0 会让「恢复后到下一个速度窗口产出真速率之前」这段时间先闪一下 `剩余 ∞`；
        //   而 etaText 对「暂停中」本来就返回空串，不需要靠清零来隐藏。
        if (entry.paused) { entry.speed = ''; continue }
        const done = Number(t.getCompletedBytes?.()) || 0
        // ★ 兜底：bytesTotal 若出现非有限数字（如历史 Promise 残留），按 0 处理避免 percent=NaN 污染 UI
        const total = Number(entry.bytesTotal) || 0
        const newPercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
        entry.bytesDone = done
        const now = Date.now()
        if (done > meta.prevBytes || newPercent >= 100) {
          meta.lastProgressTime = now
        }
        const elapsed = now - meta.prevTime
        if (elapsed >= 500) {
          const delta = done - meta.prevBytes
          // ★ 2026-09-26 修复：**单文件通道的窗口必须有上限**。
          //   本 tick 每 200ms 一次，正常窗口 500~600ms；一旦出现 >5s 的窗口，只可能来自
          //   **外部阻塞**（系统休眠恢复 / 主线程长时间卡死 / 调试断点）—— 把这段间隙当测量
          //   窗口会把速率摊薄成假值（剩余时间随之虚高）。这类窗口只推进基准、不出速率。
          //   ⚠ 文件夹通道相反，**不能**加上限：它的 bytesDone 只在「一个文件传完」时跳变，
          //     大文件传输期间的长窗口正是该文件的真实均速（见 sftp-floating-panel 同处注释）。
          const windowOk = elapsed <= SPEED_WINDOW_MAX_MS
          // ★ 2026-09-26：窗口内**一个字节都没推进**持续到阈值 ⇒ 如实承认「现在没在动」：
          //   速度显示 0 B/s、speedBps 置 0 ⇒ 剩余时间由 etaText 显示 `∞`。
          //   与下面「delta>0」分支互斥；一旦重新有字节，下一个窗口就会把真速率写回来。
          if (windowOk && delta === 0 && now - meta.lastProgressTime >= SPEED_STALL_ZERO_MS) {
            if (entry.speed !== SPEED_STALL_ZERO_TEXT) {
              entry.speed = SPEED_STALL_ZERO_TEXT
              entry.speedBps = 0
              needsDetect = true
            }
          }
          // 仅在有新进度时更新速率；delta=0 时保留上次速度（避免卡顿时闪烁为空）
          if (windowOk && delta > 0) {
            entry.speed = this.host.formatSpeed(delta, elapsed)
            // ★ 2026-09-26：同步维护数值速率（EMA 平滑）供「剩余时间」使用。
            //   瞬时速率抖动很大（SFTP 分块读快慢可差数倍），直接拿来算 ETA 会来回跳；
            //   0.65/0.35 加权既跟随持续变化，又不会被单次抖动带偏。
            const inst = (delta * 1000) / Math.max(1, elapsed)
            const prevBps = Number(entry.speedBps) || 0
            entry.speedBps = prevBps > 0 ? prevBps * 0.65 + inst * 0.35 : inst
          }
          // 始终推进基准点，保证下次计算窗口正确
          meta.prevBytes = done
          meta.prevTime = now
        }
        if (newPercent !== entry.percent) {
          entry.percent = newPercent
          needsDetect = true
        } else if (elapsed >= 1000) {
          needsDetect = true
        }
        const stallMs = now - meta.lastProgressTime
        if (stallMs > 900000) {
          try {
            if (typeof t.cancel === 'function') t.cancel()
            else if (typeof t.destroy === 'function') t.destroy()
          } catch { /* ignore */ }
          toRemove.push(entry)
          this.host.transferLog.update(entry.logEntryId!, {
            success: false,
            duration: now - meta.startTime,
            endTime: now,
            failReason: 'error',
            pending: false,
          })
          continue
        }
        if (t.isComplete?.() || t.isCancelled?.() || t.isFailed?.() || entry.percent >= 100) {
          // 兜底：若速率窗口未触发（极快传输 <500ms 完成），用总平均速度填充，避免最后仍显示 '--'
          if (!entry.speed && done > 0) {
            const dur = Math.max(1, now - meta.startTime)
            entry.speed = this.host.formatSpeed(done, dur)
          }
          toRemove.push(entry)
          // ★ 2026-08-10：失败标记（raw 读错误等）也计入失败，避免非取消类错误被误报成功
          const finalSuccess = !t.isCancelled?.() && !t.isFailed?.()
          this.host.transferLog.update(entry.logEntryId!, { success: finalSuccess, duration: now - meta.startTime, endTime: now, failReason: finalSuccess ? undefined : 'error', pending: false })
        }
      } catch {
        toRemove.push(entry)
        this.host.transferLog.update(entry.logEntryId!, { success: false, duration: Date.now() - meta.startTime, endTime: Date.now(), failReason: 'error', pending: false })
      }
    }
    for (const entry of toRemove) {
      this._transferMeta.delete(entry as any)
      this.host.transfers = this.host.transfers.filter(x => x !== entry)
      this._trackedTransferCount--
    }
    if (needsDetect) this._detect()
    if (this._trackedTransferCount <= 0) {
      this._trackedTransferCount = 0
      this._stopTransferTimer()
    }
  }

  private async _resumeTransfer(
    entry: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    offset: number,
  ): Promise<{ transfer: any; percent: number }> {
    if (!this.host.sftpSession) throw new Error('No SFTP session')
    // 兼容异步 getSize（LocalPathFileUpload 返回 Promise）
    const totalSize = (await Promise.resolve(entry.transfer.getSize?.())) || 0
    const rawSftp = this.host.sftpSession as any
    const hasRawStream = direction === 'upload'
      ? typeof rawSftp.createWriteStream === 'function'
      : typeof rawSftp.createReadStream === 'function'

    if (direction === 'upload') {
      // ★ 2026-07-25 B13：初始上传也写 `remotePath.tabby-upload` 临时文件，故续传点取该临时文件实际大小
      let remoteOffset = 0
      const tempPath = remotePath + '.tabby-upload'
      try {
        const tempStat = await this.host.sftpSession.stat(tempPath)
        const tempSize = Number(tempStat?.size)
        if (Number.isFinite(tempSize) && tempSize > 0 && tempSize <= totalSize) {
          remoteOffset = tempSize
        }
      } catch {
        // 临时文件不存在：从头上传
      }

      let up: LocalPathFileUpload
      if (hasRawStream) {
        up = new LocalPathFileUpload(localPath, remoteOffset)
        // ★ 2026-08-10：补 catch——流错误时避免 unhandled rejection（对比非 raw 分支已有 catch）
        // ★ 2026-08-15 修复 #1：流失败时标记 failed，避免 UI 僵尸态（最长等 15 分钟 stall 超时）
        uploadViaRawToTemp(rawSftp, remotePath, up, remoteOffset).catch(async (e: unknown) => {
          if (this._disposed) return
          if (!up.isCancelled?.() && !up.isPaused()) {
            try { await up._markFailed?.() } catch {}
            log.error('Resume raw upload failed', e)
          }
        })
      } else {
        // 标准 upload API 不支持远端 offset；传入本地 offset 会只上传后缀并截断目标。
        // 因此不支持 raw stream 时必须完整重传，优先保证数据完整性。
        remoteOffset = 0
        up = new LocalPathFileUpload(localPath)
        // ★ 2026-08-15 修复 #1：标准 upload 失败也标记 failed
        this.host.sftpSession.upload(remotePath, up as any).catch(async (e: any) => {
          if (this._disposed) return
          if (!up.isCancelled?.()) {
            try { await up._markFailed?.() } catch {}
            log.error('Resume upload failed', e)
          }
        })
      }
      const percent = totalSize > 0 ? Math.min(99, Math.round((remoteOffset / totalSize) * 100)) : 0
      return { transfer: up, percent }
    } else {
      const percent = totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 0
      // ★ 2026-07-24：续传写入 .tmp，下载完成且大小匹配才改名
      // 始终走 sftpSession.download（标准 SFTP read 带 offset），不用 createReadStream（部分服务端不 honor start 选项，导致从字节 0 重发）
      const tmpPath = localPath + '.tmp'
      const dl = new LocalPathFileDownload(
        tmpPath, entry.transfer.getMode?.() || 0o644, totalSize, offset,
      )
      const cleanupOnCancel = (): boolean => {
        // ★ 2026-07-25 B12：续传中被"取消"（非暂停）→ 删除半截 .tmp；暂停则保留供下次续传
        if (dl.isCancelled?.() && !(dl as any).paused) {
          try { fsSync.unlinkSync(tmpPath) } catch { /* ignore */ }
          return true
        }
        return false
      }
      const renameOnDone = () => {
        if (cleanupOnCancel() || (dl as any).paused) return
        try {
          const stat = fsSync.statSync(tmpPath)
          if (totalSize > 0 && stat.size !== totalSize) {
            log.error(`Resume size mismatch: expected ${totalSize}, got ${stat.size}. Keep ${tmpPath}`)
            return
          }
          fsSync.renameSync(tmpPath, localPath)
          log.info(`Resume completed & renamed: ${localPath}`)
        } catch (e) {
          log.error('Resume rename failed:', e)
        }
      }
      this.host.sftpSession.download(remotePath, dl as any)
        .then(() => renameOnDone())
        .catch((e: any) => {
          if (cleanupOnCancel()) return
          if (!dl.isCancelled?.()) log.error('Resume download failed', e)
        })
      return { transfer: dl, percent }
    }
  }

  /**
   * ★ 2026-07-24：用底层 SFTP open/read（支持 offset）实现真正的断点续传下载。
   *   绕过 Tabby download API（不支持 offset）和 createReadStream（start 不靠谱）。
   */
  private async _resumeWithRawRead(
    entry: any, remotePath: string, tmpPath: string, localPath: string,
    mode: number, totalSize: number, offset: number,
  ): Promise<{ transfer: any; percent: number }> {
    const rawSftp = this.host.sftpSession as any
    // ★ 检测底层 API 是否存在——不存在则回退全量重下
    if (!rawSftp || typeof rawSftp.open !== 'function' || typeof rawSftp.read !== 'function') {
      log.warn('Raw SFTP open/read not available, fallback to full redownload')
      // 清理 .tmp，全量重下
      try { fsSync.unlinkSync(tmpPath) } catch {}
      // ★ 2026-09-14 F10：不再预删 localPath——全量重下走 .tmp + rename 原子覆盖，无需先删；
      //   若此处先 unlink 而重下中途失败，用户既有的完整本地文件就永久丢失（数据窗口）
      return this._resumeTransfer(entry, 'download', remotePath, localPath, 0)
    }
    const bufSize = 1024 * 1024
    const percent = totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 0
    const dl = new LocalPathFileDownload(tmpPath, mode, totalSize, offset)
    this._rawReadLoop(rawSftp, remotePath, dl, tmpPath, localPath, offset, totalSize, bufSize).catch(
      (e: any) => { if (!dl.isCancelled?.()) log.error('Raw resume failed', e) },
    )
    return { transfer: dl, percent }
  }

  /** 取远端文件字节数；不可用时返回 -1（供未知大小续传落盘前复核完整性） */
  private async _remoteSizeOrNegative(remotePath: string): Promise<number> {
    try {
      const st = await (this.host.sftpSession as any)?.stat?.(remotePath)
      const n = Number((st as any)?.size)
      return Number.isFinite(n) && n >= 0 ? n : -1
    } catch (e) {
      log.warn('remote stat for integrity check failed:', remotePath, e)
      return -1
    }
  }

  private async _rawReadLoop(
    rawSftp: any, remotePath: string, dl: LocalPathFileDownload,
    tmpPath: string, localPath: string,
    offset: number, totalSize: number, bufSize: number,
  ): Promise<void> {
    let position = offset
    let handle: Buffer | null = null
    try {
      handle = await new Promise<Buffer>((resolve, reject) => {
        rawSftp.open(remotePath, 'r', (err: any, h: Buffer) => { if (err) reject(err); else resolve(h) })
      })
      // ★ 2026-09-21：totalSize=-1（未知大小，stat 失败的下载续传）时循环条件恒假会
      //   立即跳出并把半截 .tmp rename 落盘——改为一直播到 EOF（read 返回 0）
      while ((totalSize < 0 || position < totalSize) && !dl.isCancelled?.()) {
        const buf = Buffer.alloc(bufSize)
        const bytesRead = await new Promise<number>((resolve, reject) => {
          rawSftp.read(handle, buf, 0, bufSize, position, (err: any, br: number) => {
            if (err) reject(err); else resolve(br)
          })
        })
        if (bytesRead === 0) break
        await dl.write(buf.subarray(0, bytesRead))
        position += bytesRead
      }
      await dl.close()
      // ★ 2026-07-25 B12：raw 续传中被"取消"（非暂停）→ 删除半截 .tmp 后直接退出；暂停保留供续传
      if (dl.isCancelled?.() && !(dl as any).paused) {
        try { fsSync.unlinkSync(tmpPath) } catch { /* ignore */ }
        return
      }
      try {
        const stat = fsSync.statSync(tmpPath)
        // ★ 2026-09-21 P1 修复：totalSize=-1（大小未知）原先跳过校验，等于把「read 返回 0」
        //   一律当成完整文件——断连/服务端提前 EOF 时半截 .tmp 会被直接 rename 成正式文件。
        //   落盘前用远端 stat 复核一次；仍拿不到就只告警（无从判定，不能误判成失败）。
        let expected = totalSize
        if (expected < 0) {
          expected = await this._remoteSizeOrNegative(remotePath)
          if (expected < 0) {
            log.warn('Raw resume: remote size unverifiable, integrity not guaranteed:', remotePath, 'bytes:', stat.size)
          }
        }
        if (expected > 0 && stat.size !== expected) {
          log.error(`Raw resume size mismatch: expected ${expected}, got ${stat.size}`)
          // ★ 2026-08-10：大小不匹配记为失败，避免传输条目挂到 15 分钟 stall 超时才移除
          try { await dl._markFailed?.() } catch {}
          return
        }
        fsSync.renameSync(tmpPath, localPath)
        log.info(`Raw resume completed: ${localPath}`)
        dl._markComplete?.()
      } catch (e) {
        log.error('Raw resume rename failed', e)
        try { await dl._markFailed?.() } catch {}
      }
    } catch (e) {
      // ★ 2026-08-10 修复：区分取消/暂停/真错误。
      //   旧实现无条件 _markComplete() 导致非取消类错误（读错误/权限）被记为成功；
      //   且取消时 dl.write() 抛错直接进 catch，跳过了 .tmp 清理。
      try { await dl.close() } catch {}
      if (dl.isCancelled?.() && !(dl as any).paused) {
        // 取消（非暂停）：删除半截 .tmp
        try { fsSync.unlinkSync(tmpPath) } catch { /* ignore */ }
      } else if ((dl as any).paused) {
        // 暂停：保留 .tmp 供下次续传，不标记完成/失败
      } else {
        log.error('Raw resume error', e)
        try { await dl._markFailed?.() } catch {}
      }
    } finally {
      if (handle) {
        try {
          await new Promise<void>((resolve) => {
            const closeTimeout = setTimeout(() => {
              log.warn('SFTP close handle timed out')
              resolve()
            }, 5000)
            rawSftp.close(handle, () => {
              clearTimeout(closeTimeout)
              resolve()
            })
          })
        } catch {}
      }
    }
  }
}


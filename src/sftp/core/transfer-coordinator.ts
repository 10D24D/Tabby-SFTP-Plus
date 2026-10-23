/**
 * 功能描述：SFTP+ transfer-coordinator 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — 2026-10-19 全量审计修复：
 *              ① P1 单文件下载无重复入队保护：streamDownloadOne 原先直接进
 *                 DownloadOneUseCase，不认领 _activeTransferSlots（目录下载/上传各入口
 *                 都有）⇒ 同一文件短时间内两次下载都通过冲突预检、并发双流写同一
 *                 .tmp，交叉写坏或双失败。现入口认领（键与用例内的本地目标同名计算一致）、
 *                 finally 释放；目录不在此认领（经 downloadDir → downloadRemoteDir 内部
 *                 认领，重复认领同一键会让内层 claim 失败、目录被静默跳过）。
 *              ② P1 续传能力检测加固（_resumeWithRawRead）：原检测只查 typeof open/read，
 *                 分不清 API 形态——russh 宿主也有 promise 式 open()，回调式调用永不回调。
 *                 现行 russh 主机因无顶层 read() 侥幸走全量重下回退（安全），但未来宿主补上
 *                 顶层 read() 而 open 仍 promise 式时会永久挂起；且 read 即便存在也须是
 *                 **位置读**（顺序读会忽略 position ⇒ 源从 0 读 + sink 从 offset 写 =
 *                 错位拼接损坏文件）。新增 _probeCallbackStyleRawRead：形参元数
 *                 （open≥3 / read≥6）+ 带 5s 超时的探测 open，任一不过即回退全量重下。
 *              ③ P2-9 finishFolderTransfer 新增可选 `reason` 尾参并透传到面板：目录传输
 *                 失败时把「取消 / 中断 / 出错」写进日志 failReason（此前恒为空）。
 *                 folder.finish 端口在调用方未传时按 isAborted 补 'cancelled'。
 *              2026-10-13 — 2026-10-13 全量审计第一批修复（均为「暂停/恢复/取消」状态机与
 *              未知大小续传的数据面缺陷）：
 *              ① P0→P1 续传竞态（取消失效）：resumeTransfer 先置 entry.paused=false 再异步
 *                 装配新传输，期间用户点取消——cancelTransfer 取消的是**旧** transfer 对象，
 *                 _cleanupPausedDownloadTmp 又因 paused 已置 false 而跳过；新 dl/up 装配完成后
 *                 没有任何取消来源，照常 rename 落盘（覆盖场景即本地原文件被覆盖）。现引入
 *                 _resuming / _resumeCancelRequested 交接标记：取消时置标记 + 强制清理，
 *                 新传输装配完成即刻自取消；清理函数增加 force 形参（判据从「entry.paused」
 *                 改为「无活动写入方」）。
 *              ② P1 暂停即失败：pauseTransfer 对下载方向会调 transfer.cancel() 停流，而
 *                 2026-10-09 去掉 tick 的 paused continue 后，完成判定把 isCancelled 当成
 *                 用户取消 ⇒ 单文件下载暂停约一个 tick（200ms）后被记失败、条目消失、
 *                 .tmp 成孤儿、「恢复」按钮一并消失。现 paused+cancelled（且未 complete/failed）
 *                 的条目不收尾，留在列表等 resume。
 *              ③ P1 暂停被 stall 判死：lastProgressTime 的更新在 if (!isPaused) 块内，
 *                 暂停期间 stallMs 持续增长，满 15 分钟被 tick 杀并记 error，远端
 *                 .tabby-upload 还成孤儿。现 stall 判死对 paused 条目豁免。
 *              ④ P1 未知大小(-1)续传静默截断：totalSize = (await getSize()) || 0 把 -1 折成 0
 *                 ⇒ _rawReadLoop 循环条件恒假、一个字节都不读 ⇒ 大小校验被跳过 ⇒ 半截 .tmp
 *                 被 rename 成正式文件且记成功。现归一为 -1（未知哨兵），循环读到 EOF 后
 *                 由 _remoteSizeOrNegative 复核完整性。
 *              2026-10-13 — 第三批/四批补充修复：
 *              ⑤ P1 空文件上传提前记成功：trackTransfer 对 sz===0 原先直接写 success 日志
 *                 并 return（认领分支还移除占位条目）——上传方向此时真实传输还没开始，
 *                 随后失败（权限/会话失效）时日志永久显示成功、无条目可取消/观察
 *                 （用户侧：「日志说成功，远端却没有」）。现取消两处短路，空文件也走
 *                 正常条目生命周期，tick 据 isComplete/isFailed 记真实终态；日志的
 *                 pending 恒为 true 直到收尾。
 *              ⑥ P1 粘性取消标记误杀同路径重传：新增 clearQueuedCancel，面板两个排队
 *                 入口（_streamDownloadOne/_streamUploadOne）在 push 占位条目前调用——
 *                 取消排队条目后 10s 内对同一路径重新发起，旧标记会在 trackTransfer
 *                 认领前把新传输静默 abort（无条目、无提示）。旧标记只为 abort「已过
 *                 liveness 检查、认领前被取消」的那一个任务，窗口微秒级。
 *              ⑦ P1 目录上传行级实时进度：host 接口与 _buildPorts 的 uploadRaw 增加
 *                 onProgress 可选尾参并逐跳转发（与 downloadRaw 对称）。
 *              2026-09-29 — ★ 新增多选批量上传 uploadBatchToRemote()（用户提议：多选一批文件、
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

import { execSshCommand, safeEntryName, localEntryName } from './path-utils'

import { probeRemoteBase64 } from './fs-ops'
import { ContentDigestService, type ContentDigestPort, type DigestAlgo } from './digest'

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
  /** ★ 2026-10-19 P2-9：reason 透传到日志的 failReason（取消/中断/出错可区分） */
  finishFolderTransfer(ctx: FolderTransferCtx, success: boolean, reason?: 'cancelled' | 'interrupted' | 'error'): void
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
  uploadRaw(remotePath: string, localPath: string, onProgress?: (bytes: number) => void): Promise<boolean>
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

  /**
   * 面板销毁后不再接受新传输。
   *
   * ★ 2026-10-09 审计 P0-1 根治：本字段原先**只声明在 PanelTransferRuntime 上**，
   *   而三处使用（uploadPathToRemote / downloadRemoteDir / mergeLocalDirToRemote）
   *   都在本类里 → TS2339 直接编译失败；运行期 `this._disposed` 为 undefined（falsy）
   *   ⇒ 注释宣称的「dispose 后不再启动新传输」从未生效。
   *   根治不是删掉这三行（那只是让编译通过、守卫依旧失效），而是：
   *     ① 本类补上真正的状态字段；
   *     ② 本类补 dispose()（顺带释放 _activeTransferSlots，否则 Set 永久持有槽位键）；
   *     ③ 面板 ngOnDestroy 接线调用。
   */
  private _disposed = false

  /** 内容摘要服务缓存（仅供 _currentDigestService 使用） */
  private _digestSvc: ContentDigestPort | null = null
  private _digestSvcKey = ''

  /**
   * ★ 2026-10-09 审计根治：按**当前**设置返回内容摘要服务（enabled 为 false 时返回 null）。
   *
   * 由 SftpConflictDetector 在每次冲突判定时调用（经构造函数注入的回调），
   * 因此「用户改设置」能即时生效 —— 与下方 isAutoSkipSameContent 是同一套范式。
   * 服务本身按 `algo|maxBytes` 作为 key 缓存复用，避免每次判定都 new；
   * 一旦改了算法或阈值，key 变化即重建（服务内含 cache/pending Map，必须换新实例）。
   */
  private _currentDigestService(): ContentDigestPort | null {
    const s = this.host.conflictDigestOptions?.() ?? null
    // enabled 关闭 ⇒ 真正旁路（清缓存，让已建服务可被回收，不再跑远端 sha1sum）
    if (!s?.enabled) {
      this._digestSvc = null
      this._digestSvcKey = ''
      return null
    }
    const key = `${s.algo}|${s.maxBytes}`
    if (!this._digestSvc || this._digestSvcKey !== key) {
      this._digestSvc = new ContentDigestService(() => this.host.sshSession ?? null, {
        algo: s.algo,
        maxBytes: s.maxBytes,
      })
      this._digestSvcKey = key
    }
    return this._digestSvc
  }

  constructor(private readonly host: PanelTransferHost) {
    // ★ 2026-09-07 issue #15：内容摘要服务（可选）。未启用时传 null，退化为仅 size+mtime 判定。
    const digestSettings = host.conflictDigestOptions?.() ?? null
    // ★ 2026-10-09 审计根治：原先在**构造期**把 algo/maxBytes/enabled 全部固化进
    //   ContentDigestService 的 readonly 字段（协调器早于面板 ngOnInit 构造，读到的是类默认值）：
    //     · algo / maxBytes 永久冻结为 sha1 / 256MB → 改设置不生效；
    //     · enabled 为 false 时构造期读到的仍是默认 true → **服务仍被创建**，
    //       之后面板把 enabled 改成 false 也无法销毁它 ⇒ 用户关了摘要却仍在跑远端 sha1sum。
    //   根治：digestService 不再在构造期求值，改为传入**回调**
    //   （与本文件下方 autoSkipSameContent 同一范式），由 _currentDigestService() 按当前设置现取：
    //   enabled 为 false 直接返回 null（真正旁路，不留残留服务）；否则按 algo|maxBytes 缓存复用，
    //   设置变更即重建。
    const digestService = () => this._currentDigestService()
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
    // ★ 建议#52修复：dispose后不再启动新传输
    if (this._disposed) return Promise.resolve(false)
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
    // ★ 2026-10-19 P1 修复：单文件下载认领槽位（与目录下载 downloadRemoteDir / 上传各入口
    //   对称）。此前唯独单文件下载不认领——同一文件短时间内两次下载会都通过冲突预检、
    //   都写 localPath + '.tmp'，并发双流交叉写坏或双失败（上传侧早有槽位+toast 兜底，
    //   下载侧漏修）。目录不在此认领：它经 downloadDir → downloadRemoteDir 内部认领，
    //   重复认领同一键会让内层claim失败、目录被静默跳过。
    if (this._disposed) return Promise.resolve()
    if (!file.isDirectory) {
      const localBase = targetLocalDir?.trim() || this.host.localPath
      const safeName = safeEntryName(file.name) ?? localEntryName(file.name) ?? file.name
      const localTarget = path.join(localBase, safeName)
      if (!this._claimTransferSlot('download', file.fullPath, localTarget, safeName)) {
        return Promise.resolve()
      }
      return this.downloadOneUseCase.execute(file, targetLocalDir)
        .finally(() => this._releaseTransferSlot('download', file.fullPath, localTarget))
    }
    return this.downloadOneUseCase.execute(file, targetLocalDir)
  }

  downloadRemoteDir(
    remoteSrc: string,
    localDest: string,
    top?: FolderTransferCtx,
    localName?: string,
    forceOverwrite?: boolean,
  ): Promise<boolean> {
    // ★ 建议#52修复：dispose后不再启动新传输
    if (this._disposed) return Promise.resolve(false)
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
    // ★ 建议#52修复：dispose后不再启动新传输
    if (this._disposed) return Promise.resolve(false)
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
    srcSession?: any,
    dstSession?: any,
  ): Promise<ConflictCheckOutcome> {
    return this.conflictDetection.checkUploadConflict(remotePath, localPath, localSize, localMtime, srcSession, dstSession)
  }

  checkLocalConflict(
    localPath: string,
    remotePath: string,
    remoteSize: number,
    remoteMtime: number,
    srcSession?: any,
    dstSession?: any,
  ): Promise<ConflictCheckOutcome> {
    return this.conflictDetection.checkLocalConflict(localPath, remotePath, remoteSize, remoteMtime, srcSession, dstSession)
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
      // ★ 2026-10-12：tar 通道**所有**远程命令的唯一出口，在此转义前先探测 base64。
      //   tar-channel 的命令构造器（buildRemoteUploadLanding 等）是**同步纯函数**，
      //   拿不到 ssh 也无法 await；在此处探测一次即可让全部命令受益
      //   （探测结果全局锁定，不会每次多一次往返）。
      //   缺 base64 的精简镜像（BusyBox/Alpine）上，原先路径会被替换成空串、
      //   命令变成 `mkdir -p ''` 之类而静默失败 —— 现回退到同样安全的单引号转义。
      exec: async (cmd, timeoutMs, opts) => {
        await probeRemoteBase64(host.sshSession)
        return execSshCommand(host.sshSession, cmd, timeoutMs, opts)
      },
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
          // ★ 中危#25修复：为每个字段提供默认值，避免后端缺失字段时导致后续处理异常
          name: e.name ?? '',
          isDirectory: !!e.isDirectory,
          isSymlink: !!(e.isSymlink || e.isSymbolicLink),
          size: e.size ?? 0,
          mode: e.mode ?? 0,
          modified: e.modified ?? undefined,
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
      // ★ 2026-10-19 P2-9：目录传输失败时把原因带出去（此前日志只有 success:false，
      //   取消与真出错无法区分）。被中断/取消的条目由 isAborted 判定为 'cancelled'，
      //   其余按 'interrupted'（通道异常）与 'error'（子项失败）由调用方传入。
      finish: (ctx, success, reason) =>
        host.finishFolderTransfer(ctx, success, reason ?? (folder.isAborted(ctx) ? 'cancelled' : undefined)),
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
      uploadRaw: (remotePath, localPath, onProgress) => host.uploadRaw(remotePath, localPath, onProgress),
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

  /**
   * ★ 2026-10-09 审计 P0-1 根治：面板销毁时释放本类持有的状态。
   *
   * 为什么必须有：_activeTransferSlots 是本类私有的 Set，槽位键由
   * buildTransferSlotKey(direction, remotePath, localPath) 拼成，内含**完整的远端与本地路径**。
   * dispose 后若不 clear，面板实例被回收前这段 Set 会一直持有这些字符串；
   * 更重要的是三处入口的 _disposed 守卫依赖本类自身的状态，
   * 没人调 dispose 的话守卫永远为 false（等价于没接线）。
   *
   * 调用方：面板 ngOnDestroy，须与 _transferRuntime.dispose() 成对。
   */
  dispose(): void {
    this._disposed = true
    this._activeTransferSlots.clear()
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

  /**
   * ★ 2026-10-13 P1 修复：清除指定键的粘性取消标记（新排队条目创建时调用）。
   *
   * 为什么需要：标记的语义是「这个排队条目被取消时，它的任务可能已过调度检查、
   *   尚未认领」，用于 abort 那个**特定**任务。但标记只按 (direction, localPath,
   *   remotePath) 聚合，没有身份——用户取消后 10s 内对同一路径**重新发起**传输时，
   *   新任务在 trackTransfer 认领前会被旧标记拦截、静默 abort（无条目、无提示，
   *   占位条目滞留到队列计时器回收）。「取消后立刻重试同一路径」是常见操作。
   * 在面板的排队入口（_streamDownloadOne / _streamUploadOne push 占位条目之前）
   * 调用本方法：新意图产生时旧标记即失效。真正需要标记的场景（任务已过 liveness
   * 检查、认领前被取消）窗口是微秒~毫秒级，用户不可能在同一窗口内先取消再重发，
   * 因此不会放跑真正的孤儿传输。
   */
  clearQueuedCancel(direction?: string, localPath?: string, remotePath?: string): void {
    if (!direction || !localPath) return
    this._queuedCancelKeys.delete(this._queuedCancelKey(direction, localPath, remotePath))
    this._queuedCancelKeys.delete(this._queuedCancelKey(direction, localPath))
  }

  async trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): Promise<void> {
    // ★ 建议#52修复：dispose后不再处理新传输
    if (this._disposed) return
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
      // ★ 2026-10-13 P1 修复：空文件**不再**提前收尾。原实现对 sz===0 直接移除占位并记
      //   success——而上传方向此时真实传输还没开始（trackTransfer 在 uploadLocalFile 里
      //   于上传前调用），随后失败（权限/会话失效）时日志永久显示成功、且没有条目可供
      //   取消或观察（用户侧：「日志说成功，远端却没有」）。改为走正常条目生命周期：
      //   tick 据 isComplete/isFailed 记真实终态（0 字节的 up/dl 都会立即 complete）。
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
      // ★ 2026-10-13 P1 修复：sz===0 也标 pending——原实现 `sz !== 0` 让空文件的日志
      //   在传输开始前就显示完成（同上：上传失败会永久显示成功）。终态由 tick 收尾。
      pending: true,
      transferMode: 'sftp',
    })

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
    // ★ 建议#52修复：dispose后不再处理取消操作
    if (this._disposed) return
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
    // ★ 2026-10-13 P1 修复（续传竞态窗口内取消失效）：正在装配新传输时（_resuming），
    //   entry.paused 已被 resumeTransfer 置 false，下方两个清理函数的旧判据会整体跳过，
    //   而取消的又是早已停止的旧 transfer。置 _resumeCancelRequested 让装配完成后的
    //   第一时刻自取消（见 resumeTransfer），并强制清理半成品临时文件。
    if ((entry as any)._resuming) (entry as any)._resumeCancelRequested = true
    // ★ 2026-07-25 B12：取消"暂停态"的下载时清理孤儿 .tmp——
    //   活动中的下载由 downloadRemoteFile 自己收尾；但暂停态的下载其收尾逻辑早已退出
    //   （暂停分支特意保留 .tmp 供续传），此时取消便无人删除半截 .tmp，永久残留。
    this._cleanupPausedDownloadTmp(entry, !!(entry as any)._resuming)
    void this._cleanupPausedUploadTmp(entry, !!(entry as any)._resuming)
    this.host.transfers = this.host.transfers.filter(x => x !== entry)
    if (this._transferMeta.has(entry as any)) {
      this._transferMeta.delete(entry as any)
      this._trackedTransferCount--
      // ★ 2026-10-09 审计根治：停表判据原是「本条删完后计数 <= 0」，但计数是**全局**的 ——
      //   取消其中一条时，只要还有别的条目在传，计数就 > 0，定时器不会被停；
      //   而若计数因别处双减而失真（见 _tickAllTransfers 的 toRemove 段，已一并修），
      //   这里会误停。改为**以 host.transfers 是否还有条目为准** —— 这是唯一的事实来源：
      //   列表空了才真没有东西需要 tick。
      if (this.host.transfers.length <= 0) {
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
   *   ★ 2026-10-13 P1 修复：新增 force 形参——续传装配窗口内（_resuming）entry.paused
   *   已被置 false，旧判据会跳过清理；force=true 表示调用方已确认无活动写入方。
   */
  private _cleanupPausedDownloadTmp(entry: any, force = false): void {
    if (entry?.isFolder) return
    if (!force && !entry?.paused) return
    if (entry.direction !== 'download' || !entry.localPath) return
    const tmp = entry.localPath + '.tmp'
    try { fsSync.unlinkSync(tmp) } catch { /* 不存在或已被清理 */ }
  }

  /**
   * ★ 2026-07-25 B13：清理"暂停态上传"取消后的孤儿 .tabby-upload 临时文件。
   *   上传暂停时 uploadViaRawToTemp 已结束流但保留临时文件（供续传）；若此时再取消，
   *   上传循环已退出、无人删临时文件，需在此补删。仅对 paused 的单文件上传生效（无活动写入方）。
   *   ★ 2026-10-13 P1 修复：新增 force 形参，语义同 _cleanupPausedDownloadTmp。
   */
  private async _cleanupPausedUploadTmp(entry: any, force = false): Promise<void> {
    if (entry?.isFolder) return
    if (!force && !entry?.paused) return
    if (entry.direction !== 'upload' || !entry.remotePath) return
    // ★ 2026-08-10 修复：remotePath 是远程 POSIX 路径，必须用 SFTP 会话删除。
    //   旧实现用本地 fsSync.unlinkSync：Windows 上被解析为当前盘符相对路径，
    //   远程孤儿临时文件永远无法清理，还可能误删本地同名文件。
    const session = this.host.sftpSession
    if (!session || typeof session.unlink !== 'function') return
    try {
      const p = session.unlink(entry.remotePath + '.tabby-upload')
      if (p && typeof (p as Promise<void>).catch === 'function') {
        await (p as Promise<void>).catch(() => { /* 不存在或已改名 */ })
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
    // ★ 建议#52修复：dispose后不再处理暂停操作
    if (this._disposed) return
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
      // ★ 2026-10-13 P1 修复（续传竞态窗口内取消失效）：下面到「新传输装配完成」之间有一系列
      //   await（getSize / 上传方向还含一次远端 stat 网络 RTT）。这期间用户点取消时：
      //     · cancelTransfer 取消的是 entry.transfer（**旧**对象，早已停止）；
      //     · _cleanupPausedDownloadTmp 因 entry.paused 已被上面置 false 而跳过；
      //     · 新 dl/up 装配完成后没有任何取消来源 ⇒ 照常跑完并 rename 落盘。
      //   引入交接标记：_resuming 让取消方知道「正在装配、旧判据不可信」，
      //   _resumeCancelRequested 让装配完成后的第一时刻就能自取消。
      ;(entry as any)._resuming = true
      ;(entry as any)._resumeCancelRequested = false
      // 上传和下载必须走不同续传实现。此前这里无条件调用 _resumeWithRawRead，
      // 会把远端半成品下载回来并最终覆盖本地上传源文件。
      const direction = entry.direction as 'upload' | 'download'
      const remotePath = entry.remotePath as string
      const localPath = entry.localPath as string
      const tmpPath = localPath + '.tmp'
      const mode = entry.transfer.getMode?.() || 0o644
      // ★ 2026-10-13 P1 修复（未知大小续传静默截断）：getSize() 不可用时返回 -1（未知大小
      //   哨兵），原先 `|| 0` 把它折成 0 ⇒ _rawReadLoop 的 `totalSize < 0 || position < totalSize`
      //   恒假、一个字节都不读 ⇒ 大小校验被跳过 ⇒ 半截 .tmp 被 rename 成正式文件且记成功。
      //   归一：有限且 >=0 才采用，否则保持 -1（循环读到 EOF 后由 _remoteSizeOrNegative 复核）。
      const rawSize = await Promise.resolve(entry.transfer.getSize?.())
      const totalSize = Number.isFinite(rawSize) && (rawSize as number) >= 0 ? (rawSize as number) : -1
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
      // ★ 2026-10-13 P1 修复（续传竞态窗口内取消失效）：装配期间用户点了取消——
      //   条目已被 cancelTransfer 移出列表，新传输必须即刻自取消并清理半成品，
      //   否则它会照常跑完并把 .tmp rename 成正式文件（覆盖场景即丢用户原文件）。
      if ((entry as any)._resumeCancelRequested) {
        try {
          const r = typeof entry.transfer.cancel === 'function' ? entry.transfer.cancel()
            : typeof entry.transfer.destroy === 'function' ? entry.transfer.destroy()
            : undefined
          void Promise.resolve(r).catch(() => { /* ignore */ })
        } catch { /* ignore */ }
        this._cleanupPausedDownloadTmp(entry, true)
        void this._cleanupPausedUploadTmp(entry, true)
        log.info('Transfer cancelled during resume handoff, new transfer aborted:', entry.name)
        return
      }
      delete entry._pauseOffset
      log.info(`Transfer resumed: ${entry.name} (${direction})`)
    } catch (e) {
      log.error('Resume failed', e)
      entry.paused = true
    } finally {
      // ★ 2026-10-13：交接标记必须成对清理——失败路径上 _resuming 残留会让后续取消误判
      ;(entry as any)._resuming = false
      ;(entry as any)._resumeCancelRequested = false
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
        // ★ 2026-10-13 P2：cancel()/destroy() 是 async，同步 try/catch 抓不到其 rejection；
        //   当前各实现内部吞错故不爆，一旦实现改动即产生 unhandled rejection。统一挂 .catch。
        try {
          const r = typeof t.transfer.cancel === 'function' ? t.transfer.cancel()
            : typeof t.transfer.destroy === 'function' ? t.transfer.destroy()
            : undefined
          void Promise.resolve(r).catch(() => { /* 清理阶段失败可忽略 */ })
        } catch { /* ignore */ }
      }
      // ★ 2026-07-25 B12：批量清理时同样处理暂停态下载的孤儿 .tmp
      // ★ 2026-07-25 B13：以及暂停态上传的孤儿 .tabby-upload
      this._cleanupPausedDownloadTmp(t)
      void this._cleanupPausedUploadTmp(t)
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
    const toRemove = new Set<PanelTransferItem>()
    for (const entry of this.host.transfers) {
      const meta = this._transferMeta.get(entry as any)
      if (!meta) continue
      const t = entry.transfer
      try {
        if (!this.host.connected) {
          // ★ 2026-08-15 修复 #2：断连后暂停传输也无法恢复（SFTP 会话已丢失），
          //   一并清理避免 UI 永久僵尸
          try {
            const r = typeof t.cancel === 'function' ? t.cancel()
              : typeof t.destroy === 'function' ? t.destroy()
              : undefined
            void Promise.resolve(r).catch(() => { /* 清理阶段失败可忽略 */ })
          } catch { /* ignore */ }
          toRemove.add(entry)
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
        //
        // ★ 2026-10-09 审计根治：原写法是 `if (entry.paused) { entry.speed=''; continue }`，
        //   那个 continue 落在**完成判定之前** ⇒ 暂停期间即便底层已 complete/failed/cancelled
        //   也永远走不到下方收尾。而 pauseTransfer 对下载会调 t.cancel()
        //   （raw stream 场景下不 cancel 会让重开的流重开 fd 截断文件，见 pauseTransfer 注释②），
        //   也就是「暂停」的底层状态其实已经是 cancelled —— 于是该记录永久滞留 host.transfers、
        //   _transferMeta 强引用 transfer 适配器闭包、_trackedTransferCount 不归零、定时器不停。
        //   根治：**去掉 continue**，暂停时只跳过「字节/速率/百分比更新」这一段
        //   （用 isPaused 分支包住），让执行流继续往下走到 stall 判定与完成判定。
        //   这样暂停中若底层已落终态，照常被收尾移除；仍在跑则原地等待，与原行为一致。
        const isPaused = !!entry.paused
        // done / now 提到 if 之外：下方的 stall 判定与完成收尾都要用它们
        const done = Number(t.getCompletedBytes?.()) || 0
        const now = Date.now()
        if (isPaused) {
          entry.speed = ''
          needsDetect = true
        }
        if (!isPaused) {
        // ★ 兜底：bytesTotal 若出现非有限数字（如历史 Promise 残留），按 0 处理避免 percent=NaN 污染 UI
        const total = Number(entry.bytesTotal) || 0
        const newPercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
        entry.bytesDone = done
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
        } // ← if (!isPaused) 闭合：以上是「字节/速率/百分比」更新，暂停时整段跳过。
          //    但**刻意不 continue** —— 下面的 stall 判定与完成判定必须照常执行，
          //    否则暂停中的条目会永久滞留（见上方根治说明）。
        const stallMs = now - meta.lastProgressTime
        // ★ 2026-10-13 P1 修复（暂停被 stall 判死）：暂停不是「零推进停滞」——lastProgressTime
        //   的更新本就在 if (!isPaused) 块内，暂停期间 stallMs 必然持续增长。不豁免的话暂停
        //   满 15 分钟会被 tick 杀并记 error（用户只是暂停），远端 .tabby-upload 还成孤儿
        //   （tick 杀不走 _cleanupPausedUploadTmp）。暂停条目的停滞计时没有意义，直接豁免。
        if (!isPaused && stallMs > 900000) {
          try {
            const r = typeof t.cancel === 'function' ? t.cancel()
              : typeof t.destroy === 'function' ? t.destroy()
              : undefined
            void Promise.resolve(r).catch(() => { /* 清理阶段失败可忽略 */ })
          } catch { /* ignore */ }
          toRemove.add(entry)
          this.host.transferLog.update(entry.logEntryId!, {
            success: false,
            duration: now - meta.startTime,
            endTime: now,
            failReason: 'error',
            pending: false,
          })
          continue
        }
        const termComplete = !!t.isComplete?.()
        const termCancelled = !!t.isCancelled?.()
        const termFailed = !!t.isFailed?.()
        // ★ 2026-10-13 P1 修复（暂停即失败）：pauseTransfer 对下载方向会调 transfer.cancel()
        //   停流（否则重开的流会重开 fd 截断文件），于是「暂停」的底层状态就是 cancelled。
        //   2026-10-09 去掉 paused continue 后，完成判定把它当成用户取消 ⇒ 单文件下载暂停
        //   约一个 tick（200ms）后被记失败、条目消失、.tmp 成孤儿、「恢复」按钮一并消失。
        //   判定规则：paused + cancelled 且未 complete/failed ⇒ 这是暂停自停流，留在列表等
        //   resume，不收尾、不记失败；其余终态（含 paused 但底层已 complete/failed）照常收尾。
        const pausedSelfCancelled = isPaused && termCancelled && !termFailed && !termComplete
        if (!pausedSelfCancelled && (termComplete || termCancelled || termFailed || entry.percent >= 100)) {
          // 兜底：若速率窗口未触发（极快传输 <500ms 完成），用总平均速度填充，避免最后仍显示 '--'
          if (!entry.speed && done > 0) {
            const dur = Math.max(1, now - meta.startTime)
            entry.speed = this.host.formatSpeed(done, dur)
          }
          toRemove.add(entry)
          // ★ 2026-08-10：失败标记（raw 读错误等）也计入失败，避免非取消类错误被误报成功
          const finalSuccess = !termCancelled && !termFailed
          this.host.transferLog.update(entry.logEntryId!, { success: finalSuccess, duration: now - meta.startTime, endTime: now, failReason: finalSuccess ? undefined : 'error', pending: false })
        }
      } catch {
        toRemove.add(entry)
        this.host.transferLog.update(entry.logEntryId!, { success: false, duration: Date.now() - meta.startTime, endTime: Date.now(), failReason: 'error', pending: false })
      }
    }
    for (const entry of toRemove) {
      // ★ 2026-10-09 审计根治（计数双减）：本循环原先**无条件** `_trackedTransferCount--`，
      //   而 cancelTransfer 里有 `if (this._transferMeta.has(entry))` 守卫 —— 两处口径不一致。
      //   竞态：同一条目在 tick 的 for 循环执行期间被 cancelTransfer 移除
      //   （cancelTransfer 会 `host.transfers = host.transfers.filter(...)`），
      //   但它早已被本轮 toRemove.add 收集 ⇒ 这里再 delete（无害）+ 再 --（**计数双减**）。
      //   后果比「多减一次」严重：计数提前归零 → 下面的 `<= 0` 分支停掉轮询定时器
      //   ⇒ **尚在传输的其它条目从此不再被 tick**，进度条永久冻结、传输记录永远停在「传输中」。
      //   根治：以 _transferMeta 是否有该条目为**唯一**计数口径（delete 的返回值即真相），
      //   与 cancelTransfer 完全对齐；已删条目不再重复计数。
      const wasTracked = this._transferMeta.delete(entry as any)
      this.host.transfers = this.host.transfers.filter(x => x !== entry)
      if (wasTracked) this._trackedTransferCount--
    }
    if (needsDetect) this._detect()
    // ★ 2026-10-09 审计根治：停表判据从 `_trackedTransferCount <= 0` 改为「列表是否为空」。
    //   计数是**推导量**（trackTransfer ++、移除时 --），任何一处口径不一致都会失真，
    //   而误判 <= 0 的后果是「尚在传输的条目从此不再被 tick、进度永久冻结」——
    //   比多跑几轮定时器严重得多。host.transfers 是唯一事实来源，用它判定最稳。
    if (this.host.transfers.length <= 0) {
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
    // ★ 2026-10-13 P1 修复：与 resumeTransfer 同款归一——不可用时保持 -1 而不是 `|| 0` 折成 0，
    //   避免「未知大小」与「真的是 0」混淆（上传方向 -1 时下方 tempSize<=totalSize 不成立，
    //   走完整重传，安全）。
    const rawSize = await Promise.resolve(entry.transfer.getSize?.())
    const totalSize = Number.isFinite(rawSize) && (rawSize as number) >= 0 ? (rawSize as number) : -1
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
        // ★ 高危#7修复：追加.catch(()=>{})确保Promise不会unhandled rejection
        uploadViaRawToTemp(rawSftp, remotePath, up, remoteOffset).catch(async (e: unknown) => {
          if (this._disposed) return
          if (!up.isCancelled?.() && !up.isPaused()) {
            try { await up._markFailed?.() } catch {}
            log.error('Resume raw upload failed', e)
          }
        }).catch(() => { /* 二次兜底，避免.catch内部异常导致unhandled rejection */ })
      } else {
        // 标准 upload API 不支持远端 offset；传入本地 offset 会只上传后缀并截断目标。
        // 因此不支持 raw stream 时必须完整重传，优先保证数据完整性。
        remoteOffset = 0
        up = new LocalPathFileUpload(localPath)
        // ★ 2026-08-15 修复 #1：标准 upload 失败也标记 failed
        // ★ 高危#7修复：追加.catch(()=>{})确保Promise不会unhandled rejection
        this.host.sftpSession.upload(remotePath, up as any).catch(async (e: any) => {
          if (this._disposed) return
          if (!up.isCancelled?.()) {
            try { await up._markFailed?.() } catch {}
            log.error('Resume upload failed', e)
          }
        }).catch(() => { /* 二次兜底 */ })
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
   *   ★ 2026-10-19 P1 修复（脆弱检测加固）：原能力检测只查 `typeof open/read === 'function'`，
   *   分不清 API **形态**——russh 版宿主同样有 open()，但它是 promise 式
   *   `open(p, mode) → Promise<handle>`，回调式调用永远不会回调。现行 russh 主机上因
   *   宿主没有顶层 read() 而侥幸走全量重下回退（见 transfer-adapters 文件头 2026-09-25
   *   的记录），但一旦未来宿主补上顶层 read() 而 open 仍是 promise 式，_rawReadLoop 会
   *   永久挂起（条目卡到 stall 超时才移除）。且即便 open 是回调式，read 也必须真的是
   *   **位置读**（ssh2 的 read(handle, buf, off, len, position, cb)）——顺序读的 read
   *   会让 position 参数被忽略，源从 0 读而 sink 从 offset 写 ⇒ 错位拼接出损坏文件。
   *   修复：先用带超时的探测 open 验证「回调式 API 真实存在且能回调」，配合形参元数
   *   检查（open≥3 / read≥6），任一不过即回退全量重下（安全语义）。
   */
  private async _resumeWithRawRead(
    entry: any, remotePath: string, tmpPath: string, localPath: string,
    mode: number, totalSize: number, offset: number,
  ): Promise<{ transfer: any; percent: number }> {
    const rawSftp = this.host.sftpSession as any
    // ★ 检测底层 API 是否存在——不存在则回退全量重下
    if (!(await this._probeCallbackStyleRawRead(rawSftp, remotePath))) {
      log.warn('Raw SFTP callback-style open/read not available, fallback to full redownload')
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

  /**
   * ★ 2026-10-19 P1 修复：探测宿主是否真的提供「回调式 + 位置读」的 SFTP API。
   *   三层校验：① open/read 均存在；② 形参元数（open≥3：path/flags/cb；read≥6：
   *   handle/buf/off/len/position/cb）——russh 的 open(p, mode) 只有 2 形参， promise 式；
   *   ③ 真调一次 open 并限时 5s 等回调（防形参判断被宿主改写骗过），探测句柄立即关闭。
   *   任一不过返回 false，调用方回退全量重下。
   */
  private async _probeCallbackStyleRawRead(rawSftp: any, remotePath: string): Promise<boolean> {
    if (!rawSftp || typeof rawSftp.open !== 'function' || typeof rawSftp.read !== 'function') return false
    if (rawSftp.open.length < 3) {
      log.warn('Raw SFTP open is not callback-style (arity ' + rawSftp.open.length + ')')
      return false
    }
    if (rawSftp.read.length < 6) {
      log.warn('Raw SFTP read is not positional (arity ' + rawSftp.read.length + ')')
      return false
    }
    try {
      const handle = await new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('callback-style open probe timed out')), 5000)
        try {
          rawSftp.open(remotePath, 'r', (err: any, h: Buffer) => {
            clearTimeout(timer)
            if (err) reject(err); else resolve(h)
          })
        } catch (e) {
          clearTimeout(timer)
          reject(e)
        }
      })
      // 探测句柄立即关掉（循环会自己重开）；关闭失败不影响续传主流程
      try {
        await new Promise<void>((resolve) => {
          const closeTimer = setTimeout(resolve, 3000)
          try {
            rawSftp.close(handle, () => { clearTimeout(closeTimer); resolve() })
          } catch {
            clearTimeout(closeTimer); resolve()
          }
        })
      } catch { /* ignore */ }
      return true
    } catch (e) {
      log.warn('Raw SFTP callback-style open probe failed:', (e as Error)?.message ?? e)
      return false
    }
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


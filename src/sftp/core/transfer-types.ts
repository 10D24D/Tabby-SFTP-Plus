/**
 * 功能描述：SFTP+ transfer-types 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-09-29 — ★ TarChannelPort 新增**可选**成员 tryUploadBatch?（多选批量上传：把一批
 *              同目录条目打进**一个** tar 归档）。可选是刻意的——老产物/测试替身可能没有它；
 *              调用方必须按存在性判断后再调。语义与 tryUploadDir 有本质区别：批量是**叠加在逐项
 *              通道之上的优化层**，因此一切「不适用」都必须返回 'fallback'（由调用方继续逐文件），
 *              **不按 tarOnly 硬失败**；只有 folder.start 之后（已提交）的失败才遵循模式语义。
 *              2026-09-29 — ★ TarChannelPort.tryUploadDir 增加 `mergeIntoExisting` / `reuseLogEntryId`
 *              两个尾参（与 tryDownloadDir 对称）：上传侧「目录冲突 → 覆盖」此前落在纯逐文件的
 *              MergeLocalDirUseCase，打包通道拿不到机会 → 仅 TAR 模式下选了「覆盖」仍是 ⇄SFTP，
 *              而 UI 提示偏偏写着「选『覆盖』即可打包传输」。逐跳核对已做（全仓仅一处调用）。
 *              2026-09-29 — 传输通道归属与「不适用」告知：
 *              FolderTransferPort 新增 markChannelMode（显式标记打包通道接管，不再靠
 *              updateLogSize 的副作用）；TransferUseCasePorts 新增 notifyTarOnlyInapplicable
 *              （仅 TAR 下「目标已存在 → 只能逐文件增量」的说明性提示）；
 *              tarChannelMode 改为 readonly 并注明**必须实时求值**（此前被固化在协调器构造时，
 *              导致改设置不生效：选了仅 TAR 却按旧的 smart 择路走 SFTP）。
 *              2026-09-28 — TarChannelPort 的 tryUploadDir/tryDownloadDir 增加 mode 尾参（传输通道模式）；
 *              TransferUseCasePorts 新增 tarChannelMode 字段。
 *              2026-09-21 — SFTP 传输端口新增逐项符号链接探测，防止目录下载跟随漏标链接；
 *              2026-09-07 — issue #15：新增 ConflictDigestInfo / isContentIdentical，两个 buildXxxConflictInfo 支持携带两端摘要
 * 合并来源：transfer-ports, transfer-rules
 */

import { type Stats } from 'fs'

import { type SFTPFile } from '../../services/sftp.service'

import { type FolderTransferCtx, type ConflictFileInfo } from './panel-types'

import * as path from 'path'


﻿/**
 * 上传/下载用例端口
 */


export type SftpDirEntry = {
  name: string
  isDirectory: boolean
  /** Tabby readdir 为 lstat 语义：symlink 时 isDirectory=false、isSymlink=true */
  isSymlink?: boolean
  size?: number
  mode?: number
  modified?: Date | number | string
  mtime?: number
  /** 某些 SFTP 后端把元数据放在 attrs 子对象里 */
  attrs?: { mtime?: number; modified?: Date | number | string; size?: number }
}

export interface LocalTransferFsPort {
  lstat(localPath: string): Promise<Stats | null>
  listChildren(localPath: string): Promise<Array<{ name: string; isSymbolicLink: boolean }>>
  /** ★ 2026-08-11：单次遍历同时得出总大小与文件数（原 calcDirSize/countDirItems 两次遍历） */
  scanDir(localPath: string): Promise<{ size: number; count: number }>
  pathExists(localPath: string): Promise<boolean>
  mkdirRecursive(localPath: string): Promise<void>
}

export interface SftpTransferPort {
  hasSession(): boolean
  mkdir(remotePath: string): Promise<void>
  readdir(remoteSrc: string): Promise<SftpDirEntry[]>
  /** 取单个远程文件元数据；返回 null 表示文件不存在或无法访问 */
  stat(remotePath: string): Promise<SftpDirEntry | null>
  /** 对单个路径做 lstat/readlink 语义探测；不得只依赖父目录 listing 标志。 */
  isSymlink(remotePath: string): Promise<boolean>
}

export interface RemoteDirStatsPort {
  /** ★ 2026-08-11：单次遍历同时得出总大小与文件数（并发 readdir） */
  scanDir(remotePath: string): Promise<{ size: number; count: number }>
}

/** ★ 2026-08-11：tar 打包通道结果三态（见 tar-channel.ts 头注） */
export type TarChannelResult = 'fallback' | 'success' | 'failed'

export interface TarChannelPort {
  /**
   * 尝试打包上传目录。
   * ★ 2026-09-29（三）：新增尾参 `mergeIntoExisting` / `reuseLogEntryId` —— 与 tryDownloadDir 对称。
   *   上传侧此前缺这两个位置，于是「目录冲突 → 覆盖」这条出口（MergeLocalDirUseCase，纯逐文件）
   *   永远拿不到打包通道，仅 TAR 模式下选了「覆盖」仍是 ⇄SFTP。
   *   `mergeIntoExisting=true`：远端目标已存在 → 解包结果合并覆盖（同名项覆盖、目标端独有项保留），
   *   远端命令用 `mkdir -p` + `cp -a` 而非 `test ! -e` + `mv`。
   *   `reuseLogEntryId`：复用冲突来源的传输记录（否则会多出一条红色失败记录）。
   * 'fallback' 表示未接管，调用方回退逐文件通道。
   */
  tryUploadDir(
    localPath: string, remoteTarget: string, folder: FolderTransferPort, name: string,
    mergeIntoExisting?: boolean, mode?: string, reuseLogEntryId?: string,
  ): Promise<TarChannelResult>
  /**
   * 尝试打包下载目录。
   * ★ 2026-09-26：新增尾参 `mergeIntoExisting` —— 目标目录已存在（用户已对目录冲突选「覆盖」）时
   * 置 true：解包结果**合并覆盖**进目标目录（同名项覆盖、本地独有项保留），而不是整目录搬入。
   * ★ 2026-09-28：新增尾参 `mode` —— 传输通道模式（决定择路门槛）。
   * 'fallback' 表示未接管，调用方回退逐文件通道。
   */
  tryDownloadDir(remoteSrc: string, localDest: string, folder: FolderTransferPort, name: string, mergeIntoExisting?: boolean, mode?: string): Promise<TarChannelResult>
  /**
   * ★ 2026-09-29（四）：尝试把**一次多选**（同一父目录下的 ≥2 个顶层条目）打成**一个**归档上传。
   *
   * 可选成员：老产物/测试替身未实现时，UploadBatchUseCase 判定为「未接管」并原样走逐项流程。
   * 语义与 tryUploadDir 的关键差异 —— 本方法一切「不适用」（无 tar / 含符号链接 / 规模不划算 /
   * 不安全名 / 超命令行长度）都返回 'fallback'，**不**按 tarOnly 硬失败：批量打包是叠加在既有
   * 逐项通道之上的优化层，判定为不适用时必须让原路径原样跑完，否则会比现状更差。
   * 只有 folder.start 之后（已提交）的失败才遵循模式语义（tarOnly 硬失败）。
   * `name` 为进度/日志条目显示名，由面板传入（通道内不做 i18n）。
   */
  tryUploadBatch?(
    localPaths: string[], remoteDir: string, folder: FolderTransferPort,
    name: string, mode?: string,
  ): Promise<TarChannelResult>
}

export interface FolderTransferPort {
  start(
    name: string,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    totalSize: number,
    itemCount: number,
    /** ★ 2026-08-11：复用既有传输记录条目（冲突覆盖合并时不新建日志，避免重复记录） */
    reuseLogEntryId?: string,
  ): FolderTransferCtx
  finish(ctx: FolderTransferCtx, success: boolean): void
  /**
   * ★ 2026-09-20：放弃已 start 的进度条目（不留失败日志），供 tar 可恢复失败后平滑回退逐文件
   */
  discard?(ctx: FolderTransferCtx): void
  /** ★ 2026-08-11：回填传输记录的真实目录大小（tar 打包通道初始记的是压缩包大小，易误导） */
  updateLogSize?(ctx: FolderTransferCtx, size: number): void
  /**
   * ★ 2026-09-29：显式声明「本次传输由打包通道接管」。
   *
   * 为什么需要独立回调：此前 transferMode='tar' 只在 updateLogSize 里**顺带**写入，
   * 而 updateLogSize 仅在「需要回填真实目录大小」时才触发（下载为 `realSize > 0`，
   * 否则要等解包后兜底扫描且要求非 mergeIntoExisting）→ `realSize=0 且 mergeIntoExisting`
   * 时明明走了 tar，传输记录与进度条却显示 ⇄SFTP。通道归属是**确定的事实**，
   * 不该挂在「是否恰好需要回填大小」这类旁证上（与 UI 层「别给状态挂旁证门槛」同一教训）。
   * 由 tar 通道在 `start()` 之后立即调用，面板据此同时更新日志条目与进度条条目。
   */
  markChannelMode?(ctx: FolderTransferCtx, mode: 'tar'): void
  updateProgress(
    ctx: FolderTransferCtx,
    bytesDone: number,
    currentItem: string,
    itemDone: number,
    currentItemSize?: number,
  ): void
  markHadConflict(ctx: FolderTransferCtx): void
  isAborted(ctx: FolderTransferCtx): boolean
  isPaused(ctx: FolderTransferCtx): boolean
  waitWhilePaused(ctx: FolderTransferCtx): Promise<void>
  consumeAbortCurrent(ctx: FolderTransferCtx): boolean
}

export interface TransferExecutionPort {
  /** ★ 2026-08-10：返回是否传输完整成功，供用例层正确统计失败/守护剪切删源 */
  uploadTopLevel(remotePath: string, localPath: string): Promise<boolean>
  uploadRaw(remotePath: string, localPath: string): Promise<boolean>
  downloadTopLevel(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  /**
   * ★ 2026-09-26：新增可选 `onProgress`（**本文件**已落盘字节数，不含同目录其它文件）。
   *
   *   背景（用户现场：「这次似乎又完全不会动了」）：目录下载的条目进度原先只在
   *   「一个文件传完」时上报一次（transfer-ops 的 `ctx.bytesDone += sz` 之后），
   *   于是**单个大文件传输期间整行完全静止** —— 百分比、速度、当前文件名、剩余时间
   *   一起冻住几分钟。用户看不到任何动静，只能判断成「卡死了」。
   *
   *   ⚠ 转发链有 4 跳（port → coordinator.execution → PanelHost → 面板 _doDownloadRaw），
   *     可选尾参 TS **不会**报「漏转发」，新增/改动时必须逐跳核对（本项目已踩坑 4 次）。
   */
  downloadRaw(
    remotePath: string,
    localPath: string,
    mode?: number,
    size?: number,
    onProgress?: (bytes: number) => void,
  ): Promise<boolean>
}

export interface DownloadOnePort {
  getLocalPath(): string
  downloadDir(remoteSrc: string, localDest: string): Promise<boolean>
}

export interface TransferUseCasePorts {
  localFs: LocalTransferFsPort
  sftp: SftpTransferPort
  folder: FolderTransferPort
  execution: TransferExecutionPort
  conflictDetection: import('./conflict').ConflictDetectionPort
  conflictQueue: import('./conflict').ConflictQueuePort
  /** ★ 2026-08-11：可选 tar 打包通道（目标不存在、或目标已存在且用户已确认覆盖时启用） */
  tarChannel?: TarChannelPort
  /**
   * ★ 2026-09-28：传输通道模式（smart/sftpOnly/tarOnly/preferSftp/preferTar），传给 tar 通道择路。
   *
   * ★ 2026-09-29：**必须实时求值**。实现侧（transfer-coordinator._buildPorts）用 getter 返回
   *   host 回调的结果 —— 因为 ports 是 coordinator 构造时生成后长期复用的，若在此固化一个
   *   普通字符串属性，用户改设置后端口里仍是旧模式，就会出现「选了仅 TAR 却按 smart 择路走 SFTP」。
   */
  readonly tarChannelMode: string
  /**
   * ★ 2026-09-29：仅 TAR 模式下「打包通道不适用」的告知——目前唯一场景是**目标已存在**。
   *
   * 与 tar 通道内 _decline（不可用/失败）区分：这不是失败，而是设计例外（增量传输必须走
   * 逐文件通道，目录冲突检测依赖它），传输仍会正常完成，只是没走打包。但用户既然选了
   * 「仅」，就有权知道「这次为什么没用上」，否则只能看到 ⇄SFTP 标签、无从判断（实测困惑）。
   */
  notifyTarOnlyInapplicable?(name: string, reason: 'targetExists', detail: string): void
}

export type { SFTPFile }

/**
 * 传输冲突判定领域规则（纯函数）
 */


export const DEFAULT_MTIME_TOLERANCE_MS = 2000

/** 本地与远程文件是否视为相同（大小一致且 mtime 在容差内） */
export function filesAreSame(
  localSize: number,
  localMtime: number,
  remoteSize: number,
  remoteMtime: number,
  toleranceMs = DEFAULT_MTIME_TOLERANCE_MS,
): boolean {
  return localSize === remoteSize
    && Math.abs(localMtime - remoteMtime) <= toleranceMs
}

/**
 * ★ 2026-09-07 issue #15：冲突比对用的内容摘要。
 * 任一端为 null/undefined 表示「无法确认」，调用方必须按「可能不同」保守处理，
 * 绝不能据此判定内容相同（否则会导致文件该传没传）。
 */
export interface ConflictDigestInfo {
  localDigest?: string | null
  remoteDigest?: string | null
}

/** 两端摘要均可得且完全相等时，才认为内容实际相同 */
export function isContentIdentical(d?: ConflictDigestInfo | null): boolean {
  return !!d && !!d.localDigest && !!d.remoteDigest && d.localDigest === d.remoteDigest
}

/** 构建上传方向冲突信息（保持与原实现字段一致） */
export function buildUploadConflictInfo(
  remotePath: string,
  localPath: string,
  fileName: string,
  localSize: number,
  localMtime: number,
  remoteSize: number,
  remoteMtime: number,
  /** ★ 2026-09-07 issue #15：可选的内容摘要（用于 UI 展示「内容是否真变了」） */
  digest?: ConflictDigestInfo,
): ConflictFileInfo {
  const parentDir = path.posix.dirname(remotePath)
  const localDigest = digest?.localDigest ?? null
  const remoteDigest = digest?.remoteDigest ?? null
  const bothAvailable = !!localDigest && !!remoteDigest
  return {
    localPath,
    remotePath,
    fileName,
    localSize,
    remoteSize,
    localMtime,
    remoteMtime,
    remoteDir: parentDir,
    direction: 'upload',
    isSamePane: false,
    localDigest,
    remoteDigest,
    contentIdentical: isContentIdentical(digest),
    // ★ 2026-09-18 issue #15+：两端摘要均可得但不相等 → 内容实际不同
    contentDiffers: bothAvailable && localDigest !== remoteDigest,
  }
}

/** 构建下载方向冲突信息 */
export function buildDownloadConflictInfo(
  localPath: string,
  remotePath: string,
  remoteSize: number,
  remoteMtime: number,
  localSize: number,
  localMtime: number,
  /** ★ 2026-09-07 issue #15：可选的内容摘要 */
  digest?: ConflictDigestInfo,
): ConflictFileInfo {
  const localDigest = digest?.localDigest ?? null
  const remoteDigest = digest?.remoteDigest ?? null
  const bothAvailable = !!localDigest && !!remoteDigest
  return {
    localPath,
    remotePath,
    fileName: path.basename(localPath),
    localSize,
    remoteSize,
    localMtime,
    remoteMtime,
    remoteDir: path.posix.dirname(remotePath),
    direction: 'download',
    isSamePane: false,
    localDigest,
    remoteDigest,
    contentIdentical: isContentIdentical(digest),
    // ★ 2026-09-18 issue #15+：两端摘要均可得但不相等 → 内容实际不同
    contentDiffers: bothAvailable && localDigest !== remoteDigest,
  }
}


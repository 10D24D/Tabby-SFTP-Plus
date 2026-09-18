/**
 * 功能描述：SFTP+ transfer-types 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy4 preview
 * 修改时间：2026-09-07 — issue #15：新增 ConflictDigestInfo / isContentIdentical，两个 buildXxxConflictInfo 支持携带两端摘要
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
}

export interface RemoteDirStatsPort {
  /** ★ 2026-08-11：单次遍历同时得出总大小与文件数（并发 readdir） */
  scanDir(remotePath: string): Promise<{ size: number; count: number }>
}

/** ★ 2026-08-11：tar 打包通道结果三态（见 tar-channel.ts 头注） */
export type TarChannelResult = 'fallback' | 'success' | 'failed'

export interface TarChannelPort {
  /** 目标不存在时尝试打包上传；'fallback' 表示未接管，调用方回退逐文件通道 */
  tryUploadDir(localPath: string, remoteTarget: string, folder: FolderTransferPort, name: string): Promise<TarChannelResult>
  tryDownloadDir(remoteSrc: string, localDest: string, folder: FolderTransferPort, name: string): Promise<TarChannelResult>
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
  /** ★ 2026-08-11：回填传输记录的真实目录大小（tar 打包通道初始记的是压缩包大小，易误导） */
  updateLogSize?(ctx: FolderTransferCtx, size: number): void
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
  downloadRaw(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
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
  /** ★ 2026-08-11：可选 tar 打包通道（仅目标不存在的全新传输时启用） */
  tarChannel?: TarChannelPort
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


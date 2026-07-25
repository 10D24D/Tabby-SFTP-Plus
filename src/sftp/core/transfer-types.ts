/**
 * 功能描述：SFTP+ transfer-types 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-16
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
  size?: number
  mode?: number
  modified?: Date
}

export interface LocalTransferFsPort {
  lstat(localPath: string): Promise<Stats | null>
  listChildren(localPath: string): Promise<Array<{ name: string; isSymbolicLink: boolean }>>
  calcDirSize(localPath: string): Promise<number>
  countDirItems(localPath: string): Promise<number>
  pathExists(localPath: string): Promise<boolean>
  mkdirRecursive(localPath: string): Promise<void>
}

export interface SftpTransferPort {
  hasSession(): boolean
  mkdir(remotePath: string): Promise<void>
  readdir(remoteSrc: string): Promise<SftpDirEntry[]>
}

export interface RemoteDirStatsPort {
  calcDirSize(remotePath: string): Promise<number>
  countDirItems(remotePath: string): Promise<number>
}

export interface FolderTransferPort {
  start(
    name: string,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    totalSize: number,
    itemCount: number,
  ): FolderTransferCtx
  finish(ctx: FolderTransferCtx, success: boolean): void
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
  uploadTopLevel(remotePath: string, localPath: string): Promise<void>
  uploadRaw(remotePath: string, localPath: string): Promise<void>
  downloadTopLevel(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void>
  downloadRaw(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void>
}

export interface DownloadOnePort {
  getLocalPath(): string
  downloadDir(remoteSrc: string, localDest: string): Promise<void>
}

export interface TransferUseCasePorts {
  localFs: LocalTransferFsPort
  sftp: SftpTransferPort
  folder: FolderTransferPort
  execution: TransferExecutionPort
  conflictDetection: import('./conflict').ConflictDetectionPort
  conflictQueue: import('./conflict').ConflictQueuePort
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

/** 构建上传方向冲突信息（保持与原实现字段一致） */
export function buildUploadConflictInfo(
  remotePath: string,
  localPath: string,
  fileName: string,
  localSize: number,
  localMtime: number,
  remoteSize: number,
  remoteMtime: number,
): ConflictFileInfo {
  const parentDir = path.posix.dirname(remotePath)
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
): ConflictFileInfo {
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
  }
}


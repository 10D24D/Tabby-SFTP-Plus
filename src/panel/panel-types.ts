/**
 * SFTP+ 面板共享类型
 */
import type { Stats } from 'fs'
import type { SFTPFile, SFTPSessionLike, SSHSessionLike } from '../sftp.service'

export type LocalEntry = {
  name: string
  fullPath: string
  isDirectory: boolean
  mode?: number
  size?: number
  mtimeMs?: number
  atimeMs?: number
  birthtimeMs?: number
  owner?: string | number
  group?: string | number
  inaccessible?: boolean
}

export type DragPayload =
  | { kind: 'local-paths'; paths: Array<{ fullPath: string; name: string; isDirectory: boolean }> }
  | { kind: 'remote-paths'; paths: Array<{ remotePath: string; name: string; isDirectory: boolean; size?: number; mode?: number; modified?: number }> }

export type ConflictFileInfo = {
  localPath: string
  remotePath: string
  fileName: string
  localSize: number
  remoteSize: number
  localMtime: number
  remoteMtime: number
  remoteDir: string
  direction: 'upload' | 'download'
  isSamePane: boolean
  isDirectory?: boolean
}

export type ConflictQueueItem = {
  localPath: string
  remoteDir: string
  fileName: string
  remotePath: string
  localStat: Stats
  direction: 'upload' | 'download'
  remoteFileSize?: number
  remoteFileMtime?: number
  isSamePane?: boolean
  samePaneSource?: 'local' | 'remote'
  isDirectory?: boolean
}

export type FolderTransferCtx = {
  t: any
  startTime: number
  logEntryId: string
  bytesDone: number
  itemDone: number
  hadConflict?: boolean
}

export type BookmarkScope = 'connection' | 'global' | 'all'

export type PanelTransferItem = {
  transfer: any
  direction: 'upload' | 'download'
  name: string
  remotePath: string
  localPath: string
  percent: number
  speed: string
  bytesDone: number
  bytesTotal: number
  paused: boolean
  logEntryId?: string
  isFolder?: boolean
  currentItem?: string
  currentItemSize?: number
  itemCount?: number
  itemDone?: number
}

export type { SFTPFile, SFTPSessionLike, SSHSessionLike }

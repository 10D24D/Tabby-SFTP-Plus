/**
 * SFTP+ 面板共享类型
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-11
 *   ConflictQueueItem 新增 entryKey 字段（= pasteEntryKey(entry)），用于冲突解决后准确排除已处理项
 */
import type { Stats } from 'fs'
import type { SFTPFile, SFTPSessionLike, SSHSessionLike } from '../../services/sftp.service'

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
  /** 与原始粘贴条目一一对应的稳定键（pasteEntryKey），用于 resumePaste 准确排除已解决项 */
  entryKey?: string
  /** 操作模式：copy 或 cut（剪切模式下操作成功后需删除源文件） */
  mode?: 'copy' | 'cut'
  /** ★ 2026-08-11：来源传输的上下文（目录传输冲突入队时携带）——冲突解决前条目
   *  已被 finish(false) 记失败，覆盖/重命名成功后用它把传输记录翻正 */
  transferCtx?: FolderTransferCtx
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
  /** ★ 2026-08-10：排队占位条目（多选拖拽/下载预注册，尚未真正开始传输） */
  queued?: boolean
  logEntryId?: string
  isFolder?: boolean
  currentItem?: string
  currentItemSize?: number
  itemCount?: number
  itemDone?: number
}

export type { SFTPFile, SFTPSessionLike, SSHSessionLike }

/**
 * SFTP+ 面板共享类型
 * 修改人：DD1024z + Composer
 * 修改时间：2026-09-17 — ConflictFileInfo 增加目录大小计算中标记 localSizePending / remoteSizePending
 *              2026-09-07 — issue #15：ConflictFileInfo 增加 localDigest / remoteDigest / contentIdentical 字段
 *   ConflictQueueItem 新增 entryKey 字段（= pasteEntryKey(entry)），用于冲突解决后准确排除已处理项
 */
import type { Stats } from 'fs'
import type { SFTPFile, SFTPSessionLike, SSHSessionLike } from '../../services/sftp.service'

export type LocalEntry = {
  name: string
  fullPath: string
  isDirectory: boolean
  /** ★ 2026-08-24：Windows .lnk 快捷方式的目标路径（用于目录跳转/文件打开） */
  linkTarget?: string
  /** ★ 2026-09-08 issue #16：是否为符号链接（POSIX symlink / Windows mklink、junction）。
   *  .lnk 快捷方式不是 symlink，用 linkTarget 表示；两者都会在图标上叠加链接角标。 */
  isSymlink?: boolean
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
  /** ★ 2026-09-17：目录内容总大小仍在递归扫描中，UI 应显示「计算中…」而非元数据占位大小 */
  localSizePending?: boolean
  remoteSizePending?: boolean
  /** ★ 2026-09-07 issue #15：内容摘要（仅计算成功时存在）。
   *  用于识别「mtime 已变但内容未变」（如 Git 切换分支），避免仅凭 size+mtime 误报冲突。
   *  任一端为 null/undefined 表示无法确认，调用方必须按「可能不同」保守处理。 */
  localDigest?: string | null
  remoteDigest?: string | null
  /** 两端摘要均可得且相等 → 内容实际相同。仅作提示用，不替代冲突决策。 */
  contentIdentical?: boolean
  /** ★ 2026-09-18 issue #15+：两端摘要均可得但不相等 → 内容实际不同（黄色提示）。 */
  contentDiffers?: boolean
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
  /** ★ 2026-09-18 issue #15 修复：冲突检测计算出的内容摘要，供对话框展示 */
  localDigest?: string | null
  remoteDigest?: string | null
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
  /**
   * ★ 2026-09-07 issue #15+：被检测器判定「内容已确认相同」自动跳过，未实际传输。
   * use case 在调用 download/uploadTopLevel 之前早返回；finish 看到此标位后保留条目
   * （不调用 _removeQueuedEntry），让 UI 以「已跳过 · 内容相同」状态展示。
   */
  skippedAsDuplicate?: boolean
}

export type { SFTPFile, SFTPSessionLike, SSHSessionLike }

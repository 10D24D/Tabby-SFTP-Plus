/**
 * SFTP+ 面板共享类型
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-09-26 — PanelTransferItem 增加 speedBps（EMA 平滑的数值速率）：
 *              speed 是给人看的字符串无法参与运算，剩余时间估算需要原始数值
 *              2026-09-26 二次修正：删除 lastProgressAt（停流判据）—— 剩余时间改为
 *              「一旦测到可信速率就始终显示」，不再因「字节停止推进」而隐藏（用户要求保留旧预估）
 *              2026-09-20 — P1-2 审计修复：PanelTransferItem 增加 _taskCancelRef（条目所属任务的取消引用，取消时按它广播）
 *              2026-09-20 — PanelTransferItem 增加 transferMode（传输中进度条展示方式）
 *              2026-09-17 — ConflictFileInfo 增加目录大小计算中标记 localSizePending / remoteSizePending
 *              2026-09-07 — issue #15：ConflictFileInfo 增加 localDigest / remoteDigest / contentIdentical 字段
 *   ConflictQueueItem 新增 entryKey 字段（= pasteEntryKey(entry)），用于冲突解决后准确排除已处理项
 */
import type { Stats } from 'fs'
import type { SFTPFile, SFTPSessionLike, SSHSessionLike } from '../../services/sftp.service'
import type { TaskCancelRef } from './task-scope'

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
  /**
   * ★ 2026-09-26：**在途**子文件的字节级进度（key = 本地路径，value = 该文件已落盘字节的
   *   **峰值**）。目录条目的行级进度 = `bytesDone`（已完成文件之和）+ 本表所有值之和。
   *
   *   为什么要按 ctx 记录、而不是各文件各报各的：同一目录的文件是**并发**下载的
   *   （默认 3 路），若每个文件的回调只报「自己的基准 + 自己的字节」，那么一个 73MB 文件
   *   报到 40MB 后，另一个刚起步的文件报 1.8MB 就会把界面**拉回去**。
   *   取值用峰值（不用当前值）同样是为了单调：`getCompletedBytes()` 在整文件重试时会归零。
   */
  liveBytes?: Map<string, number>
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
  /**
   * ★ 2026-09-26：数值型瞬时速率（bytes/s），**仅供估算「剩余时间」**。
   *   `speed` 是给人看的格式化字符串（"319.5 KB/s"），无法参与运算；此处保存原始值
   *   （经 EMA 平滑，见各 tick 实现），队列组件用它算 ETA。
   *
   *   三态语义（2026-09-26 三次修正）：
   *   · `undefined` = **从未测到**速率（开传瞬间）⇒ ETA 不显示；
   *   · `> 0`       = 最近窗口的真实测量值 ⇒ 照常算 ETA（>24h 显示 ∞）；
   *   · `0`         = 连续零推进超阈值后**如实写入的当前状态**（通道停摆，见
   *                   SPEED_STALL_ZERO_MS）⇒ ETA 显示 `∞`。不是「没测到」，是「没在动」。
   */
  speedBps?: number
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
  /**
   * ★ 2026-09-20：当前实际传输方式，供「传输中」进度条与日志展示。
   * - sftp：逐文件 SFTP
   * - tar：打包加速通道
   */
  transferMode?: 'sftp' | 'tar'
  /**
   * ★ 2026-09-20 P1-2 审计修复：该条目所属传输任务的取消引用。
   *   并发多个目录任务时，取消必须广播到「本任务」的在途子流——
   *   此前面板统一用 _cancelRef（永远指向最后启动的任务）→ 取消旧任务会误杀新任务。
   */
  _taskCancelRef?: TaskCancelRef
}

export type { SFTPFile, SFTPSessionLike, SSHSessionLike }

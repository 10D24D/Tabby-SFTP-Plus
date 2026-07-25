/**
 * SFTP+ 浮动面板组件
 * 功能描述：纯 Angular 组件（不继承 BaseTabComponent），由装饰器动态创建为浮动 overlay
 *   双栏文件管理器（本地↔远程）、书签、传输日志、拖拽传输
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-25
 * 修改时间：2026-07-12
 *   修复远程同面板重命名变0B：_doDownload/_doDownloadRaw 在 size 未知时 stat 远程文件获取真实大小，
 *   之前 size??0 把未传 size 当成空文件，LocalPathFileDownload(fileSize=0)→complete=true→不写数据→0B tmp→upload→0B dest
 *   新增 Delete 热键（@HostListener window:keydown），选中文件时弹删除确认框
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-21
 *   新增「选中书签后关闭书签面板」兼容选项：书签控制器 gotoBookmark 在 closeBookmarkPanelOnSelect 开启时调用 closeBookmarks()，
 *   并在 ngOnInit / 设置变更回调中读取该开关
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-21
 *   浮动面板（非新标签页模式）支持：标题栏拖拽移动、八向缩放手柄、最大化/还原按钮（最小化与关闭之间）；
 *   几何通过把面板宿主切换为绝对定位实现，仅 floating 模式生效，workspace 模式不显示手柄/最大化按钮
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-21
 *   面板几何（位置/尺寸/最大化）持久化到全局配置 tabby-sftp-plus.panelGeometry，跨会话生效；
 *   拖拽缩放过程中实时触发布局自适应（窄屏切换/分栏重排）：浮动模式改用面板自身宽度判窄屏，
 *   _onGeomMove 缩放分支与 toggleMaximize 显式调用已 rAF 节流的 _scheduleLayoutRefresh()
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-21
 *   ① 快捷键作用域修复：onWindowKeyDown(Delete/F2) 增加 _isPanelActive 闸门；
 *     _isPanelActive 增加面板 DOM 实际可见性检测（getClientRects().length），
 *     使面板最小化/所在 tab 未激活（如打开设置页、切到其它终端 tab）时不响应快捷键。
 *   ② 自定义时间格式本地/远程统一生效：getFilteredLocal/RemoteEntries 命中缓存时
 *     额外比对当前 pattern 与装饰时 pattern，不一致则重算 _cells，
 *     消除初始化时序或缓存窗口导致的本地时间列沿用默认格式的问题。
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-23
 *   _startFolderTransfer / _finishFolderTransfer 配合 TransferLogEntry.pending：
 *   add 时 pending=true，finish 时 pending=false。修复"目录传输中日志误显示下载成功 ✓ 0ms"。
 * 修改人：DD1024z + Deepseek-V4-Pro
 * 修改时间：2026-07-24
 *   修复删除确认框回车无法确认：onGlobalKeyDown 在 deleteConfirmVisible 时对称增加 Enter 确认兜底，
 *   并将原 Esc 分支的 deleteConfirmVisible 处理上提到统一分支（避免逻辑分散、与组件 onKeyDown 双保险）。
 * 修改人：DD1024z + Deepseek-V4-Pro
 * 修改时间：2026-07-24
 *   修复远程键盘 Shift+Del 可能弹不出删除确认框/提示：onWindowKeyDown 的 Delete 分支改用
 *   _resolveTargetPane()（按哪侧有选中项判定），不再直接依赖 activePane（键盘选中远程时 activePane 可能仍是 local）。
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25
 *   B7 缓解：远程目录条目数超过阈值（REMOTE_LISTING_ENRICH_LIMIT=20000）时，跳过按条目 stat 的 owner 补全，
 *   避免 N 次网络 stat 风暴把 UI 卡死（渲染级卡顿仍需虚拟滚动，架构级，未做）。
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25
 *   issue #5 处理：保留三模式（off/remember/sync），默认维持 'off'，sync 作为可选模式（用户在面板内切换即可
 *   获得原生 sftp 式"打开即定位终端当前目录并实时跟随"行为，依赖 Tabby OSC 1337 CurrentDir 解析 /
 *   session.getWorkingDirectory）；文档与 CHANGELOG 已说明如何启用，同日构建验证编译通过。
 */
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'

import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ChangeDetectorRef, ElementRef, NgZone, Injector, ViewEncapsulation } from '@angular/core'
import { ThemesService, NotificationsService, ConfigService, AppService } from 'tabby-core'

import { LocalPathFileDownload, LocalPathFileUpload, uploadLocalFile, downloadRemoteFile } from './core/transfer-adapters'
import { log } from '../services/sftp-logger'
import { SftpConnectionService, SFTPFile, SFTPSessionLike, SSHSessionLike, SftpEnrichOptions, getSftpConnectionService, enrichSftpFilesWithAtime, enrichRemoteOwnersViaStat } from '../services/sftp.service'
import { SftpI18nService } from '../services/sftp-i18n.service'
import type { Locale } from '../services/sftp-i18n.service'
import { SftpConfigService } from '../services/sftp-config.service'
import { SftpBookmarksService, Bookmark } from '../services/sftp-bookmarks.service'
import { SftpTransferLogService, TransferLogEntry } from '../services/sftp-transfer-log.service'
import { openSftpPlusSettings } from '../settings/sftp-open-settings'
import { PanelConnectionLifecycle, PathFollowMode } from './components/connection-lifecycle'
import { PanelRubberBand } from './components/panel-rubber-band'
import { PanelHeaderReorder } from './components/panel-header-reorder'
import { PanelFileDnd } from './components/panel-file-dnd'
import { PanelDropAdapter } from './core/drop'
import { PanelTransferCoordinator } from './core/transfer-coordinator'
import { PanelPasteAdapter } from './core/paste'
import { copyLocalDir, copyRemoteDir, deleteLocalRecursive, deleteRemoteRecursive, tryRemoteCpViaSsh } from './core/fs-ops'
import { trashLocalPath } from './core/trash-local'
import { PanelConflictResolver } from './components/panel-conflict-resolver'
import { PanelTransferRuntime } from './core/transfer-coordinator'
import { PaneNavHistory } from './core/selection'
import { computeSelection, computeSortToggle } from './core/selection'
import { isColorDark } from '@common/utils'
import { SftpPanelBookmarkController } from './controllers/panel-bookmark-controller'
import {
  isDirByMode,
  filterByHidden,
  filterByName,
  sortLocalEntries,
  sortRemoteEntries,
} from './core/file-utils'
import type {
  LocalEntry,
  ConflictFileInfo,
  DragPayload,
  FolderTransferCtx,
  BookmarkScope,
  PanelTransferItem,
} from './core/panel-types'
import {
  formatSize,
  formatDate,
  formatPercent,
  formatLogTime,
  formatLogTimeRange,
  formatDuration,
  formatSpeedFromSize,
  getLogFileName,
  formatFailReason as formatFailReasonFn,
  getDateFormatPattern,
  setDateFormatPattern,
} from './core/file-utils'
import { SFTP_PANEL_STYLES } from './components/styles'
import { IdNameResolver, execSshCommand } from './core/path-utils'
import type { PaneNavAction, PaneSortAction } from './components/sftp-file-pane.component'
import type { ContextMenuAction, HeaderMenuAction, ColVisibilityState } from './components/sftp-context-menu.component'
import type { PermField } from './components/sftp-perm-dialog.component'
import type { DetailsDisplay } from './components/sftp-details-dialog.component'
import type { ViewerMode } from './components/sftp-viewer-dialog.component'
import type { CwdSetupChoice } from './components/sftp-cwd-setup-dialog.component'
import {
  CWD_SESSION_CMD,
  CWD_BASH_SNIPPET,
  CWD_ZSH_SNIPPET,
} from './components/sftp-cwd-setup-dialog.component'
import {
  isViewableRemoteFileType,
  isEditableRemoteFileType,
  isImageFile,
  isBinaryBuffer,
  bufferToText,
  bufferToDataUrl,
  isRemoteFileTooLargeForView,
  isRemoteFileTooLargeForEdit,
  getViewMaxBytes,
  formatBytesLimit,
  EDIT_TEXT_MAX_BYTES,
} from './core/file-utils'
import {
  downloadRemoteToBuffer,
  downloadRemoteToTempFile,
  writeTextToFile,
  readTextFromFile,
  removeTempFile,
  writeBufferToTemp,
  readLocalFileToBuffer,
} from './core/transfer-adapters'

@Component({
  selector: 'sftp-plus-panel',
  template: require('./sftp-floating-panel.component.html'),
  encapsulation: ViewEncapsulation.None,
  styles: [SFTP_PANEL_STYLES],
})
export class SftpFloatingPanel extends SftpPanelBookmarkController implements OnInit, AfterViewInit, OnDestroy {
  // ========== 常量 ==========
  // 远程目录条目超过此数视为"超大目录"，跳过按条目 stat 的 owner 补全（B7 缓解）
  private static readonly REMOTE_LISTING_ENRICH_LIMIT = 20000

  // ========== 从外部设置（非 DI）==========
  sshSession: SSHSessionLike | null = null
  profile: any = null
  onClose: (() => void) | null = null   // 关闭回调（销毁面板）
  onMinimize: (() => void) | null = null // 最小化回调（隐藏面板，不销毁）
  displayMode: 'floating' | 'workspace' = 'floating'

  // ========== 服务（直接实例化，非 DI）==========
  private sftpService = getSftpConnectionService()
  i18n: SftpI18nService
  private configService?: ConfigService
  /** 统一配置访问服务（嵌套存取 + 自动迁移旧扁平 key） */
  private sftpConfig: SftpConfigService | null = null
  protected bookmarks!: SftpBookmarksService
  private transferLog: SftpTransferLogService

  // ========== 连接 ==========
  /** 终端 Tab 引用（用于重连时获取最新 sshSession） */
  terminalRef: any = null

  /** NotificationsService（延迟获取，可能为空） */

  /** P2-2: _openPathInSystem 中 keyup 监听和 setTimeout 的引用，供 ngOnDestroy 清理 */

  /** 面板顶部轻提示（复制路径等） */
  toastMessage = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteLoadingTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteFlashTimer: ReturnType<typeof setTimeout> | null = null
  private _localFlashTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteRefreshGen = 0
  private _localRefreshGen = 0
  private static readonly MTIME_TOLERANCE_MS = 2000

  /** 是否正在重连 */
  reconnecting = false

  /** 是否已最小化 */
  minimized = false

  // ========== 浮动面板几何（仅 floating 模式）：拖拽移动 / 缩放 / 最大化 ==========
  /** 是否已初始化浮动几何（floating 且已切换为绝对定位） */
  panelDraggable = false
  /** 拖拽中 / 缩放中（仅用于 CSS 类切换） */
  panelDragging = false
  panelResizing = false
  /** 是否已最大化 */
  panelMaximized = false
  /** 标题栏右键菜单：是否可见 */
  topBarMenuVisible = false
  topBarMenuX = 0
  topBarMenuY = 0
  private _hostEl: HTMLElement | null = null
  private _dragOffsetX = 0
  private _dragOffsetY = 0
  private _resizing = false
  private _resizeDir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null = null
  private _resizeStart = { left: 0, top: 0, w: 0, h: 0, mx: 0, my: 0 }
  private _prevGeom: { left: string; top: string; width: string; height: string; followWindow?: boolean } | null = null
  private readonly _geomMinW = 360
  private readonly _geomMinH = 240
  private _onGeomMoveBound = (e: MouseEvent): void => this._onGeomMove(e)
  private _onGeomUpBound = (): void => this._onGeomUp()
  private _geomInitRetried = false
  private _geomInitTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * 是否处于「跟随窗口」默认尺寸模式：
   * true 时几何用百分比定位（96%×94% 居中），Tabby 窗口缩放时面板自动跟随；
   * 用户一旦拖拽/缩放/最大化即切换为固定 px 并持久化为自定义几何。
   */
  private _followWindow = false
  /** 上次保存的面板几何（全局配置，跨会话生效）：位置/尺寸/最大化状态/是否跟随窗口 */
  private _panelGeom: { left?: string; top?: string; width?: string; height?: string; maximized?: boolean; followWindow?: boolean } = {}

  connecting = false
  connected = false
  hostInfo = ''


  // ========== 本地面板 ==========
  localPath: string = os.homedir()
  localEntries: LocalEntry[] = []
  localFilter = ''
  localFilterPending = ''
  localFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private localClickTimer: ReturnType<typeof setTimeout> | null = null
  localPathInput = this.localPath
  localCache: any = null
  /** 本地选中条目（按 fullPath 匹配，避免框选/点击对象引用不一致） */
  private _selectedLocal: LocalEntry[] = []
  private _localSelectedPaths = new Set<string>()
  get selectedLocal(): LocalEntry[] { return this._selectedLocal }
  set selectedLocal(val: LocalEntry[]) {
    this._selectedLocal = val
    this._localSelectedPaths = new Set(val.map(e => e.fullPath))
  }
  localLastSelectedIndex: number | null = null
  /** 本地面板是否正在加载 */
  _localLoading = false
  /** 本地面板刷新闪烁 */
  _localFlash = false
  /** 本地面板拖拽悬停（桌面文件拖入时高亮） */
  get _localDragOver(): boolean { return this._fileDnd?.localDragOver ?? false }
  /** 本地面板访问错误（权限不足、路径不存在等） */
  _localError = false

  // ========== 远程面板 ==========
  remotePath = '/'
  remoteEntries: SFTPFile[] = []
  remoteFilter = ''
  remoteFilterPending = ''
  remoteFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private remoteClickTimer: ReturnType<typeof setTimeout> | null = null

  // ---- 连接生命周期（connect / heartbeat / reconnect） ----
  private _connLifecycle!: PanelConnectionLifecycle
  remotePathInput = this.remotePath
  remoteCache: any = null
  /** 远程选中条目（按 fullPath 匹配） */
  private _selectedRemote: SFTPFile[] = []
  private _remoteSelectedPaths = new Set<string>()
  get selectedRemote(): SFTPFile[] { return this._selectedRemote }
  set selectedRemote(val: SFTPFile[]) {
    this._selectedRemote = val
    this._remoteSelectedPaths = new Set(val.map(e => e.fullPath))
  }
  remoteLastSelectedIndex: number | null = null
  /** 远程面板是否正在加载 */
  _remoteLoading = false
  /** 远程面板刷新闪烁 */
  _remoteFlash = false
  /** 远程面板拖拽悬停（桌面文件拖入时高亮） */
  get _remoteDragOver(): boolean { return this._fileDnd?.remoteDragOver ?? false }
  /** 远程面板访问错误（权限不足、路径不存在等） */
  _remoteError = false

  private _rubberBand!: PanelRubberBand
  protected _headerReorder!: PanelHeaderReorder
  private _fileDnd!: PanelFileDnd
  private _fileDropRuntime!: PanelDropAdapter
  private _transferCoordinator!: PanelTransferCoordinator
  private _pasteAdapter!: PanelPasteAdapter
  private readonly localIdResolver = new IdNameResolver()
  private readonly remoteIdResolver = new IdNameResolver()
  private _conflictResolver!: PanelConflictResolver
  private _transferRuntime!: PanelTransferRuntime

  // ========== 传输 ==========
  transfers: PanelTransferItem[] = []

  // ========== 远程导航历史 ==========
  private readonly _remoteNav = new PaneNavHistory(50)
  private _ignoreNavPush = false
  get canRemoteBack(): boolean { return this._remoteNav.canBack && this.connected }
  get canRemoteForward(): boolean { return this._remoteNav.canForward && this.connected }

  // ========== 本地导航历史 ==========
  private readonly _localNav = new PaneNavHistory(50)
  /** 是否忽略历史记录（后退/前进导航时跳过记录） */
  private _ignoreLocalNavPush = false
  /** 是否可以后退 */
  get canLocalBack(): boolean { return this._localNav.canBack }
  get canLocalForward(): boolean { return this._localNav.canForward }

  // ========== 对话框 ==========
  deleteConfirmVisible = false
  deleteConfirmBatch = false  // true=批量, false=单个
  /** 单个删除时的条目信息 */
  deleteItemName = ''
  deleteItemIsDir = false
  deleteItemType = ''
  deleteItemSize: string | null = null
  deleteItemDate = ''
  /** 批量删除提示文本 */
  batchDeleteText = ''
  /** 本地删除是否使用回收站（true=移入回收站，false=永久删除） */
  deleteToTrash = true
  private pendingLocalDelete: LocalEntry[] = []
  private pendingRemoteDelete: SFTPFile[] = []

  inputDialogVisible = false
  inputDialogTitle = ''
  inputDialogPlaceholder = ''
  inputDialogValue = ''
  private inputDialogMode: 'local-mkdir' | 'remote-mkdir' | 'local-rename' | 'remote-rename' | 'remote-chmod' | 'local-touch' | 'remote-touch' | null = null
  private inputDialogTargetPath: string | null = null
  private inputDialogRemotePath: string | null = null

  get inputDialogIsRename(): boolean {
    return this.inputDialogMode === 'local-rename' || this.inputDialogMode === 'remote-rename'
  }


  // ========== 右键菜单 ==========
  contextMenuX = 0
  contextMenuY = 0
  contextMenuPane: 'local' | 'remote' = 'local'

  // ========== 剪贴板 ==========
  clipboardEntries: (LocalEntry | SFTPFile)[] = []
  clipboardSource: 'local' | 'remote' = 'local'
  clipboardMode: 'copy' | 'cut' = 'copy'
  /** 最后点击/操作的面板，用于快捷键判断作用域 */
  activePane: 'local' | 'remote' = 'local'

  // ========== 详细信息对话框 ==========
  detailsVisible = false
  detailsEntry: LocalEntry | SFTPFile | null = null
  detailsIsLocal = false


  /** P2-6: 表头右键菜单所需的列可见性快照（模板 [cols] 绑定） */
  get contextColVisibility(): ColVisibilityState {
    const isLocal = this.contextMenuPane === 'local'
    const v = (col: string): boolean => isLocal ? this._localColVisible(col) : this._remoteColVisible(col)
    return {
      size: v('size'),
      date: v('date'),
      created: v('created'),
      access: v('access'),
      owner: v('owner'),
      group: v('group'),
      perms: v('perms'),
      mode: v('mode'),
      path: v('path'),
      ext: v('ext'),
    }
  }
  // 表头右键菜单状态
  /** 表头右键菜单：当前右键的列名（如 'name', 'size'），用于"调整列宽" */

  // ========== 权限编辑对话框 ==========
  showPermDialog = false
  permOwnerRead = false
  permOwnerWrite = false
  permOwnerExec = false
  permGroupRead = false
  permGroupWrite = false
  permGroupExec = false
  permOtherRead = false
  permOtherWrite = false
  permOtherExec = false
  permModePreview = '755'
  permTargetPath = ''
  /** 当前修改权限的文件/文件夹名（供对话框显示） */
  permTargetName = ''

  // ========== 表格样式设置（从设置页读取）==========

  private loadTableSettings(): void {
    try {
      // 直接从 localStorage 读取，绕过 _paneStore 缓存
      // 避免因 _paneFlushToConfig 导致的配置覆盖问题
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const borders = localStorage.getItem(`${keyPrefix}.colBorders`)
      const zebra = localStorage.getItem(`${keyPrefix}.zebra`)
      const pinLocal = localStorage.getItem(`${keyPrefix}.pinFoldersLocal`)
      const pinRemote = localStorage.getItem(`${keyPrefix}.pinFoldersRemote`)
      if (borders !== null) this.showColBorders = JSON.parse(borders)
      if (zebra !== null) this.showZebra = JSON.parse(zebra)
      if (pinLocal !== null) this.pinFoldersLocal = JSON.parse(pinLocal)
      if (pinRemote !== null) this.pinFoldersRemote = JSON.parse(pinRemote)
    } catch { /* 使用默认值 */ }
  }

  // ========== 列宽调节 ==========
  /** 防止 resize / 表头拖拽后立即触发 sort click */

  get localResizingCol(): string | null {
    return this.resizing && this.resizePane === 'local' ? this.resizeCol : null
  }

  get remoteResizingCol(): string | null {
    return this.resizing && this.resizePane === 'remote' ? this.resizeCol : null
  }

  get localDraggingCol(): string | null {
    return this._headerReorder?.draggingColFor('local') ?? null
  }

  get remoteDraggingCol(): string | null {
    return this._headerReorder?.draggingColFor('remote') ?? null
  }

  get localHeaderPreviewCols(): string[] | null {
    return this._headerReorder?.previewColsFor('local') ?? null
  }

  get remoteHeaderPreviewCols(): string[] | null {
    return this._headerReorder?.previewColsFor('remote') ?? null
  }

  get localHeaderPreviewWidths(): string {
    const preview = this.localHeaderPreviewCols
    return preview ? this._buildColWidths('local', preview) : ''
  }

  get remoteHeaderPreviewWidths(): string {
    const preview = this.remoteHeaderPreviewCols
    return preview ? this._buildColWidths('remote', preview) : ''
  }

  get localDropIndicatorCol(): string | null {
    return this._headerReorder?.dropIndicatorColFor('local') ?? null
  }

  get localDropIndicatorAfter(): boolean {
    return this._headerReorder?.dropIndicatorAfterFor('local') ?? false
  }

  get remoteDropIndicatorCol(): string | null {
    return this._headerReorder?.dropIndicatorColFor('remote') ?? null
  }

  get remoteDropIndicatorAfter(): boolean {
    return this._headerReorder?.dropIndicatorAfterFor('remote') ?? false
  }


  /** 根据列和面板获取当前排序箭头 */

  /** 列值渲染（同时适用于 LocalEntry 和 SFTPFile） */









  /** 移动列位置 */


  /** 切换文件夹置顶 */

  /** 切换显示隐藏文件 */



  /** 将当前右键的列调整为合适的大小 */

  /** 将所有列调整为合适的大小 */

  /** P2-12: 复用 canvas 测量文本宽度，避免每次创建新 canvas */

  /** 测量列内容的渲染宽度 */

  /** 设置指定列的宽度 */


  /** 面板空白区域右键：显示面板级上下文菜单 */
  onPaneContextMenu(ev: MouseEvent): void {
    ev.preventDefault()
    ev.stopPropagation()
    // 关闭表头右键菜单，只保留最新右键的菜单
    this.headerMenuVisible = false
    this.headerMenuCol = null
    if (this._rubberBand.active) return
    if (this._rubberBand.suppressContextMenu || this._rubberBand.skipNextContextMenu) return

    // 空白区域右键：清除该面板选中，显示面板级上下文菜单
    const target = ev.target as HTMLElement
    const paneList = target.closest('.pane-list') as HTMLElement | null
    if (!target.closest('.entry:not(.header)') && paneList) {
      // 清除该面板选中
      if (paneList.classList.contains('local-pane')) {
        this.selectedLocal = []
        this.localLastSelectedIndex = null
      } else if (paneList.classList.contains('remote-pane')) {
        this.selectedRemote = []
        this.remoteLastSelectedIndex = null
      }
      try { this.cdr.detectChanges() } catch {}

      // 显示面板级上下文菜单（新建、刷新等）
      const pane = paneList.classList.contains('local-pane') ? 'local' : 'remote'
      this.contextMenuEntry = null
      this.contextMenuPane = pane
      this.zone.run(() => {
        this.closeBookmarks()
        this.headerMenuVisible = false
        this.contextMenuX = ev.clientX
        this.contextMenuY = ev.clientY
        this.contextMenuVisible = true
        this.cdr.detectChanges()
        this.fixContextMenuPosition(ev.clientX, ev.clientY)
      })
      return
    }
  }





  /** 获取本地面板列宽引用对象（用于 resize 修改） */

  /** 获取远程面板列宽引用对象（用于 resize 修改） */





  // ========== 路径模式（方案 A：三选一）==========
  /** off=关闭 / remember=路径记忆 / sync=与终端同步 */
  pathMode: PathFollowMode = 'off'
  private static PATH_MODE_KEY = 'sftp-plus-path-mode'
  private static REMEMBER_PATH_KEY = 'sftp-plus-path-mem'
  private static SAVED_LOCAL_PATH_KEY = 'sftp-plus-saved-local-path'
  private static SAVED_REMOTE_PATH_KEY = 'sftp-plus-saved-remote-path'
  private _cwdSyncTimer: ReturnType<typeof setTimeout> | null = null
  private _cwdPolling = false
  private _lastSyncedCwd = ''

  /** 兼容旧逻辑的 getter（仅路径记忆模式为 true） */
  get rememberPath(): boolean {
    return this.pathMode === 'remember'
  }

  /** 获取当前配置的唯一标识，用于 per-profile 独立路径记忆 */
  private get _hostKey(): string {
    const h = this.profile?.options?.host || ''
    const u = this.profile?.options?.username || this.profile?.options?.user || ''
    return (u ? `${u}@` : '') + h || '__default'
  }

  private _profileKey(base: string): string {
    return `${base}.${this._hostKey}`
  }

  private loadPathMode(): void {
    try {
      // 优先读 localStorage（savePathMode 写入点）
      const raw = localStorage.getItem(this._profileKey(SftpFloatingPanel.PATH_MODE_KEY))
      if (raw === 'off' || raw === 'remember' || raw === 'sync') {
        this.pathMode = raw as PathFollowMode
        return
      }
      // 兼容旧版 rememberPath 布尔开关
      const legacy = localStorage.getItem(this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY))
      if (legacy === 'true') this.pathMode = 'remember'
    } catch { /* 使用默认值 */ }
  }

  private savePathMode(): void {
    try {
      localStorage.setItem(this._profileKey(SftpFloatingPanel.PATH_MODE_KEY), this.pathMode)
      localStorage.setItem(
        this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY),
        this.pathMode === 'remember' ? 'true' : 'false',
      )
    } catch { /* ignore */ }
  }

/** 保存当前路径（仅路径记忆模式）。
 *  ★ configService.save() 经 sftpConfig.set() 路径已被证实无法落盘（sftpConfig 内的 configService 为 null），
 *    改为 localStorage 直接读写，稳定可靠且不触碰 config.yaml。 */
  protected saveCurrentPath(): void {
    if (this.pathMode !== 'remember') return
    try {
      localStorage.setItem(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY), this.localPath)
      localStorage.setItem(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY), this.remotePath)
    } catch { /* ignore */ }
  }

  pathModeTitle(): string {
    if (this.pathMode === 'remember') return this.i18n.t('path.modeRemember')
    if (this.pathMode === 'sync') return this.i18n.t('path.modeSync')
    return this.i18n.t('path.modeOff')
  }

  /** 循环：关闭 → 路径记忆 → 终端同步 → 关闭 */
  cyclePathMode(): void {
    const order: PathFollowMode[] = ['off', 'remember', 'sync']
    const idx = order.indexOf(this.pathMode)
    const next = order[(idx + 1) % order.length]
    this.setPathMode(next)
  }

  private setPathMode(mode: PathFollowMode): void {
    const prev = this.pathMode
    this.pathMode = mode
    this.savePathMode()

    if (mode === 'remember') {
      this.saveCurrentPath()
    } else if (prev === 'remember') {
      try {
        const localKey = this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY)
        const remoteKey = this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY)
        // 从新配置结构删除（remove 自动 flush）
        const localNew = this._mapPaneKey(localKey)
        const remoteNew = this._mapPaneKey(remoteKey)
        if (localNew && this.sftpConfig) this.sftpConfig.remove(localNew)
        if (remoteNew && this.sftpConfig) this.sftpConfig.remove(remoteNew)
        try { localStorage.removeItem(localKey) } catch {}
        try { localStorage.removeItem(remoteKey) } catch {}
      } catch { /* ignore */ }
    }

    if (mode === 'sync') {
      this._cwdSetupPrompted = false
      this._startCwdSync()
      void this._syncRemoteToTerminalCwd(true)
    } else {
      this._stopCwdSync()
      this.cwdSetupVisible = false
      this._cwdSetupPrompted = false
    }
  }

  /**
   * 读取终端当前工作目录。
   * 依赖 shell 上报 OSC 1337 CurrentDir（需用户确认后配置；插件不会擅自向终端注入命令）。
   */
  private async tryGetTerminalCwd(): Promise<string | null> {
    try {
      const term = this.terminalRef as {
        session?: {
          supportsWorkingDirectory?: () => boolean
          getWorkingDirectory?: () => Promise<string | null>
          reportedCWD?: string | null
        } | null
      } | null
      const session = term?.session
      if (!session) return null
      if (typeof session.reportedCWD === 'string' && session.reportedCWD) {
        return this._normalizeRemoteCwd(session.reportedCWD)
      }
      if (!session.getWorkingDirectory) return null
      if (session.supportsWorkingDirectory && !session.supportsWorkingDirectory()) return null
      const cwd = await session.getWorkingDirectory()
      if (!cwd || typeof cwd !== 'string') return null
      return this._normalizeRemoteCwd(cwd)
    } catch {
      return null
    }
  }

  private _normalizeRemoteCwd(cwd: string): string {
    const normalized = cwd.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  private _startCwdSync(): void {
    if (this._cwdSyncTimer) {
      clearTimeout(this._cwdSyncTimer)
      this._cwdSyncTimer = null
    }
    this._cwdPolling = false
    if (this.pathMode !== 'sync') return
    const tick = (): void => {
      if (this._cwdPolling) {
        // 上一轮尚未完成，等下一轮再试
        this._cwdSyncTimer = setTimeout(tick, 800)
        return
      }
      this._cwdPolling = true
      void this._syncRemoteToTerminalCwd(false).finally(() => {
        this._cwdPolling = false
        if (this.pathMode === 'sync') {
          this._cwdSyncTimer = setTimeout(tick, 800)
        }
      })
    }
    this._cwdSyncTimer = setTimeout(tick, 800)
  }

  private _stopCwdSync(): void {
    if (this._cwdSyncTimer) {
      clearTimeout(this._cwdSyncTimer)
      this._cwdSyncTimer = null
    }
    this._cwdPolling = false
    this._lastSyncedCwd = ''
  }

  cwdSetupVisible = false
  private _cwdSetupPrompted = false

  /**
   * 将远程面板路径跟随终端 cwd（仅 sync 模式）。
   * @param offerSetup 用户主动切换到同步且尚无 cwd 时，弹出确认配置对话框（不自动注入）
   */
  private async _syncRemoteToTerminalCwd(offerSetup: boolean): Promise<void> {
    if (this.pathMode !== 'sync' || !this.connected) return

    const cwd = await this.tryGetTerminalCwd()
    if (!cwd) {
      if (offerSetup && !this.cwdSetupVisible && !this._cwdSetupPrompted) {
        this._cwdSetupPrompted = true
        this.cwdSetupVisible = true
        this.cdr.detectChanges()
      }
      return
    }
    this._cwdSetupPrompted = false
    if (!offerSetup && cwd === this._lastSyncedCwd) return
    if (!offerSetup && cwd === this.remotePath) {
      this._lastSyncedCwd = cwd
      return
    }
    this._lastSyncedCwd = cwd
    this.remotePath = cwd
    this.remotePathInput = cwd
    if (offerSetup) this._pushRemoteNav(cwd)
    await this.refreshRemote()
    this.cdr.detectChanges()
  }

  async onCwdSetupChoice(choice: CwdSetupChoice): Promise<void> {
    this.cwdSetupVisible = false
    if (choice === 'cancel') {
      // 取消 = 放弃同步，回到路径模式关闭
      this.setPathMode('off')
      this.cdr.detectChanges()
      return
    }
    const ok = choice === 'permanent'
      ? await this._enableCwdReporterPermanent()
      : this._enableCwdReporterSession()
    if (!ok) {
      this.showToast(this.i18n.t('path.cwdSetupFailed'))
      this.setPathMode('off')
      this.cdr.detectChanges()
      return
    }
    this.showToast(this.i18n.t('path.cwdSetupDone'))
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200))
      if (this.pathMode !== 'sync') return
      const cwd = await this.tryGetTerminalCwd()
      if (cwd) {
        this._lastSyncedCwd = cwd
        this.remotePath = cwd
        this.remotePathInput = cwd
        this._pushRemoteNav(cwd)
        await this.refreshRemote()
        this.cdr.detectChanges()
        return
      }
    }
    this.cdr.detectChanges()
  }

  /** 仅当前交互会话：用户确认后向终端发送临时 PS1 上报 */
  private _enableCwdReporterSession(): boolean {
    const term = this.terminalRef as { sendInput?: (data: string) => void } | null
    if (!term?.sendInput) return false
    try {
      term.sendInput(CWD_SESSION_CMD + '\n')
      return true
    } catch (e) {
      log.warn('Session cwd reporter failed', e)
      return false
    }
  }

  /**
   * 永久写入：经确认后通过独立 SSH exec 追加到 ~/.bashrc 或 ~/.zshrc，
   * 再向当前终端 source + 立即上报（仍经用户点击「永久写入」确认）。
   */
  private async _enableCwdReporterPermanent(): Promise<boolean> {
    if (!this.sshSession) return false
    const marker = '# tabby-sftp-plus cwd reporting'
    const shellOut = (await execSshCommand(
      this.sshSession,
      'echo "${SHELL:-}"; [ -n "${BASH_VERSION:-}" ] && echo BASH; [ -n "${ZSH_VERSION:-}" ] && echo ZSH; true',
    )).toLowerCase()
    const useZsh = /zsh/.test(shellOut)
    const rcFile = useZsh ? '$HOME/.zshrc' : '$HOME/.bashrc'
    const snippet = useZsh ? CWD_ZSH_SNIPPET + '\n' : CWD_BASH_SNIPPET + '\n'

    log.info(`Enabling permanent CWD reporting — target: ${useZsh ? '~/.zshrc' : '~/.bashrc'}`)

    const b64 = Buffer.from(snippet, 'utf8').toString('base64')
    /* Shell logic (all in one SSH round-trip):
     *  1. Idempotency — if marker already present, skip write entirely.
     *  2. One-time backup — copy rcFile → rcFile.sftp-plus-backup only when
     *     we are about to modify it for the first time.
     *  3. Append the base64-decoded snippet.
     */
    const writeCmd =
      `RC=${rcFile}; ` +
      `if grep -qF '${marker}' "$RC" 2>/dev/null; then ` +
        `echo ALREADY; ` +
      `else ` +
        `cp -p "$RC" "$RC.sftp-plus-backup" 2>/dev/null; ` +
        `echo '${b64}' | base64 -d >> "$RC"; ` +
        `echo WRITTEN; ` +
      `fi`
    const result = await execSshCommand(this.sshSession, writeCmd)
    if (/\bALREADY\b/.test(result)) {
      log.info('CWD reporting already present in rc file — skipped write')
    } else if (/\bWRITTEN\b/.test(result)) {
      log.warn(`Backed up original to ${useZsh ? '~/.zshrc.sftp-plus-backup' : '~/.bashrc.sftp-plus-backup'} and appended CWD reporting snippet`)
    } else {
      log.warn('Unexpected response when writing CWD reporter:', result)
      return false
    }

    const term = this.terminalRef as { sendInput?: (data: string) => void } | null
    if (term?.sendInput) {
      const apply = useZsh
        ? `source ~/.zshrc >/dev/null 2>&1; printf "\\033]1337;CurrentDir=%s\\007" "\${PWD:-\$(pwd)}"\n`
        : `source ~/.bashrc >/dev/null 2>&1; printf "\\033]1337;CurrentDir=%s\\007" "\${PWD:-\$(pwd)}"\n`
      try { term.sendInput(apply) } catch { /* 文件已写入即可 */ }
    }
    return true
  }

  /** 循环切换布局模式：auto → horizontal → vertical → single → auto
   *  写入 configService.store（Tabby config.yaml），通知设置页同步 */
  cycleLayoutMode(): void {
    const order: Array<'auto' | 'horizontal' | 'vertical' | 'single'> = ['auto', 'horizontal', 'vertical', 'single']
    const idx = order.indexOf(this._layoutMode)
    this._layoutMode = order[(idx + 1) % order.length]
    try {
      const target = this.configService?.store?.['tabby-sftp-plus']
      if (target) { target.layoutMode = this._layoutMode; this.configService?.save() }
    } catch {}
    if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
    else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
    else if (this._layoutMode === 'single') { this._isNarrowLayout = false; this.activePane = 'remote' }
    else this._updateAutoLayout()
    setTimeout(() => this._applyPaneSplit(), 50)
    this.cdr.detectChanges()
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch {}
  }

  /** 根据容器宽度更新自动布局状态 */
  private _updateAutoLayout(): void {
    if (this._layoutMode !== 'auto') return
    try {
      const w = this._measureLayoutWidth()
      this._isNarrowLayout = w <= 960
    } catch {
      this._isNarrowLayout = false
    }
  }

  /** 读取可用于布局计算的容器宽度 */
  private _measureLayoutWidth(): number {
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return 960
    // 浮动面板：以面板自身宽度判断窄屏（祖先为遮罩/终端，远大于面板，不能取最大值）
    if (this.displayMode === 'floating') {
      return root.clientWidth > 0 ? root.clientWidth : 960
    }
    const widths: number[] = []
    let el: HTMLElement | null = root
    for (let i = 0; i < 6 && el; i++) {
      if (el.clientWidth > 0) widths.push(el.clientWidth)
      el = el.parentElement
    }
    if (widths.length) return Math.max(...widths)
    return 960
  }

  /** 工作区标签页：在宿主布局稳定后刷新自适应布局 */
  refreshWorkspaceLayout(): void {
    if (this.displayMode !== 'workspace') return
    this._scheduleLayoutRefresh()
  }

  /**
   * 布局刷新调度。
   *
   * ResizeObserver 回调在浏览器完成 Layout 阶段之后执行，此时
   * clientWidth/clientHeight 已是最新值，无需强制同步回流。
   * 频繁的 `void elem.offsetHeight`（尤其是文件传输时）会导致严重卡顿。
   *
   * 去重逻辑：先读 body 尺寸，无变化则直接跳过——无布局计算、无 detectChanges。
   */
  private _scheduleLayoutRefresh(): void {
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return

    if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
    else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
    else if (this._layoutMode === 'single') this._isNarrowLayout = false
    else this._updateAutoLayout()

    const body = root.querySelector('.sftp-body') as HTMLElement | null
    if (body) {
      const { w, h } = this._measureBodySize(body)
      if (w === this._lastLayoutBodyW && h === this._lastLayoutBodyH && this._isNarrowLayout === this._lastLayoutNarrow) return
      this._lastLayoutBodyW = w
      this._lastLayoutBodyH = h
      this._lastLayoutNarrow = this._isNarrowLayout
    }
    this._applyPaneSplit()
    this.cdr.detectChanges()
  }

  /** 窗口尺寸变化时关闭悬浮菜单，避免位置错位 */
  private _closeFloatingPanelsOnResize(): void {
    let changed = false
    if (this.showBookmarks) {
      this.closeBookmarks()
      changed = true
    }
    if (this.contextMenuVisible) {
      this.contextMenuVisible = false
      this.contextMenuEntry = null
      changed = true
    }
    if (this.headerMenuVisible) {
      this.headerMenuVisible = false
      this.headerMenuCol = null
      changed = true
    }
    if (changed) this.cdr.detectChanges()
  }

  private _bindLayoutObservers(): void {
    const root = this.elRef?.nativeElement as HTMLElement | null
    if (!root) return

    const ro = new ResizeObserver(() => this._scheduleLayoutRefresh())
    ro.observe(root)

    if (this.displayMode === 'workspace') {
      const seen = new Set<HTMLElement>()
      let el: HTMLElement | null = root
      for (let i = 0; i < 6 && el; i++) {
        if (!seen.has(el)) {
          seen.add(el)
          try { ro.observe(el) } catch { /* ignore */ }
        }
        el = el.parentElement
      }
    }
    if (!this._winResizeHandler) {
      this._winResizeHandler = () => {
        this._closeFloatingPanelsOnResize()
        this._clampGeometryToParent()
        this._scheduleLayoutRefresh()
      }
      window.addEventListener('resize', this._winResizeHandler)
    }

    this._ro = ro
  }

  /** 读取双栏主体可用宽高（工作区标签页会向上查找宿主尺寸） */
  private _measureBodySize(body: HTMLElement): { w: number; h: number } {
    let w = body.clientWidth
    let h = body.clientHeight
    if (this.displayMode === 'workspace' && (w <= 0 || h <= 0)) {
      const host = body.closest('sftp-plus-workspace-tab') as HTMLElement | null
      if (host) {
        if (w <= 0) w = host.clientWidth
        if (h <= 0) h = host.clientHeight
      }
    }
    if (w <= 0) w = this._measureLayoutWidth()
    if (h <= 0) h = Math.max(320, (window.innerHeight || 800) - 140)
    return { w, h }
  }

  /** 布局模式按钮悬浮提示 */
  layoutModeTitle(): string {
    const map: Record<string, string> = {
      auto: this.i18n.t('layout.mode.auto'),
      horizontal: this.i18n.t('layout.mode.horizontal'),
      vertical: this.i18n.t('layout.mode.vertical'),
      single: this.i18n.t('layout.mode.single'),
    }
    return map[this._layoutMode] || this.i18n.t('layout.mode.auto')
  }

  /** 面板分割线悬浮提示 */
  splitterTitle(): string {
    return this._isNarrowLayout
      ? this.i18n.t('pane.splitterHintVertical')
      : this.i18n.t('pane.splitterHintHorizontal')
  }

  /** 恢复路径（仅路径记忆模式），优先读 localStorage（saveCurrentPath 写入点）。 */
  private _loadSavedPaths(): void {
    this.loadPathMode()
    if (this.pathMode !== 'remember') return
    try {
      const savedLocal = localStorage.getItem(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY))
      if (savedLocal && typeof savedLocal === 'string') {
        this.localPath = savedLocal; this.localPathInput = savedLocal
      }
      const savedRemote = localStorage.getItem(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
      if (savedRemote && typeof savedRemote === 'string') {
        this.remotePath = savedRemote; this.remotePathInput = savedRemote
      }
    } catch (e) { log.warn('Failed to load saved paths', e) }
  }

  /** connect() 后恢复远程路径（防止 getDefaultRemotePath 覆盖） */
  private _restoreSavedRemotePath(): void {
    try {
      const savedRemote = this._paneGet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
      if (savedRemote) {
        this.remotePath = savedRemote
        this.remotePathInput = savedRemote
      }
    } catch { /* 忽略 */ }
  }

  // ========== 传输日志 ==========
  showTransferLog = false
  transfersMinimized = false  // 传输面板是否最小化（显示小指示器）
  transfersHidden = false     // 传输面板是否完全隐藏（不影响传输继续）
  paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'> = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'filter', 'bookmark']
  logFilterOp: '' | TransferLogEntry['operation'] = ''
  logFilterStatus: '' | 'success' | 'failed' = ''
  logFilterTimeRange: '' | 'today' | '7d' | '30d' | 'custom' = ''
  logFilterDateFrom = ''
  logFilterDateTo = ''

  // ========== 文件冲突对话框 ==========
  showConflictDialog = false
  conflictData: ConflictFileInfo | null = null
  /** 当前冲突在处理队列中的索引（从 1 开始），-1 表示未知 */
  conflictCurrIdx = 1
  /** 总冲突数 */
  conflictTotalIdx = 1
  /** 原始冲突总数（第一次入队时记录，后续不随队列缩短而变化） */
  conflictOriginalTotal = 1
  /** 待处理的冲突队列 */
  private _conflictQueue: Array<{
    localPath: string; remoteDir: string; fileName: string;
    remotePath: string; localStat: fsSync.Stats;
    /** 冲突方向：上传（本地→远程）或下载（远程→本地） */
    direction: 'upload' | 'download';
    /** 下载冲突时远程文件的原始大小 */
    remoteFileSize?: number;
    /** 下载冲突时远程文件的原始 mtimeMs */
    remoteFileMtime?: number;
    /** 是否为同面板粘贴操作导致的冲突 */
    isSamePane?: boolean;
    /** 同面板时的源面板 */
    samePaneSource?: 'local' | 'remote';
    /** 是否为目录冲突 */
    isDirectory?: boolean;
  }> = []
  /** "全部"操作的记忆模式: 'ask' | 'overwrite' | 'skip' | 'rename' */
  private _conflictAllMode: string = 'ask'

  // ========== 面板分割线（上下/左右布局共用） ==========
  _isNarrowLayout = false
  /** 布局模式: 'auto' | 'horizontal' | 'vertical' | 'single' */
  _layoutMode: 'auto' | 'horizontal' | 'vertical' | 'single' = 'auto'
  _verticalSplitRatio = 0.5   // 上下布局比例（本地面板占比，默认50%）
  _horizontalSplitRatio = 0.5 // 左右布局比例
  private _splitDragStartX = 0
  private _splitDragStartY = 0
  private _splitDragStartRatio = 0.5
  private _splitMoveHandler: ((e: MouseEvent) => void) | null = null
  private _splitUpHandler: ((e: MouseEvent) => void) | null = null
  // ★ 暂停下载时取消当前子文件的引用
  _cancelRef: { current: any } | null = null
  // ★ 2026-07-25：并发同名下载守卫（防止两个下载写同一个 .tmp 造成数据损坏，见 B3）
  private _activeDownloadTargets = new Set<string>()
  private _splitterDidDrag = false

  constructor(
    protected cdr: ChangeDetectorRef,
    protected elRef: ElementRef,
    protected zone: NgZone,
    private themesService: ThemesService,
    private injector: Injector,
  ) {
    super()
    // 通过 Injector 安全获取 ConfigService（避免 NG0202 DI 错误）
    try {
      this.configService = injector.get(ConfigService, null as any)
    } catch {
      // ConfigService 在插件环境中不可用，忽略
      this.configService = undefined
    }
    // 统一配置服务
    try {
      this.sftpConfig = injector.get(SftpConfigService, null as any)
    } catch {
      this.sftpConfig = null
    }
    // 安全获取 NotificationsService（用于重连失败提示）
    try {
      this.notifications = injector.get(NotificationsService, null as any)
    } catch {
      this.notifications = null
    }
    // 将 ConfigService 传给 i18n service，让 Auto 模式能读取 Tabby 系统语言
    this.i18n = new SftpI18nService(this.configService)
    // 将 ConfigService 传给 bookmarks / transferLog service，确保数据写入 Tabby 配置
    this.bookmarks = new SftpBookmarksService(this.configService)
    this.transferLog = new SftpTransferLogService(this.configService)
    const panel = this
    this._rubberBand = new PanelRubberBand({
      zone: this.zone,
      cdr: this.cdr,
      elRef: this.elRef,
      get selectedLocal() { return panel.selectedLocal },
      set selectedLocal(v) { panel.selectedLocal = v },
      get selectedRemote() { return panel.selectedRemote },
      set selectedRemote(v) { panel.selectedRemote = v },
      get localLastSelectedIndex() { return panel.localLastSelectedIndex },
      set localLastSelectedIndex(v) { panel.localLastSelectedIndex = v },
      get remoteLastSelectedIndex() { return panel.remoteLastSelectedIndex },
      set remoteLastSelectedIndex(v) { panel.remoteLastSelectedIndex = v },
      getFilteredLocalEntries: () => panel.getFilteredLocalEntries(),
      getFilteredRemoteEntries: () => panel.getFilteredRemoteEntries(),
      closeContextMenu: () => panel.closeContextMenu(),
      closeBookmarks: () => panel.closeBookmarks(),
      fixContextMenuPosition: (x, y) => panel.fixContextMenuPosition(x, y),
      get contextMenuX() { return panel.contextMenuX },
      set contextMenuX(v) { panel.contextMenuX = v },
      get contextMenuY() { return panel.contextMenuY },
      set contextMenuY(v) { panel.contextMenuY = v },
      get contextMenuPane() { return panel.contextMenuPane },
      set contextMenuPane(v) { panel.contextMenuPane = v },
      get contextMenuEntry() { return panel.contextMenuEntry },
      set contextMenuEntry(v) { panel.contextMenuEntry = v },
      get contextMenuVisible() { return panel.contextMenuVisible },
      set contextMenuVisible(v) { panel.contextMenuVisible = v },
      get headerMenuVisible() { return panel.headerMenuVisible },
      set headerMenuVisible(v) { panel.headerMenuVisible = v },
      syncPaneSelectionVisual: (p) => panel.syncPaneSelectionVisual(p),
    })
    this._headerReorder = new PanelHeaderReorder({
      cdr: this.cdr,
      elRef: this.elRef,
      get resizing() { return panel.resizing },
      get localVisibleCols() { return panel.localVisibleCols },
      get remoteVisibleCols() { return panel.remoteVisibleCols },
      get localColOrder() { return panel.localColOrder },
      set localColOrder(v) { panel.localColOrder = v },
      get remoteColOrder() { return panel.remoteColOrder },
      set remoteColOrder(v) { panel.remoteColOrder = v },
      saveLocalColSettings: () => panel.saveLocalColSettings(),
      saveRemoteColSettings: () => panel.saveRemoteColSettings(),
      markJustResized: () => { panel._colJustResized = true },
      clearJustResizedSoon: (ms) => { setTimeout(() => { panel._colJustResized = false }, ms ?? 200) },
    })
    this._fileDnd = new PanelFileDnd({
      cdr: this.cdr,
      elRef: this.elRef,
      isHeaderReorderActive: () => !!panel._headerReorder?.active,
    })
    this._fileDropRuntime = new PanelDropAdapter({
      cdr: this.cdr,
      get connected() { return panel.connected },
      get sftpSession() { return panel.sftpSession },
      get remotePath() { return panel.remotePath },
      get localPath() { return panel.localPath },
      get effectiveLang() { return panel.effectiveLang },
      get i18n() { return panel.i18n },
      get notifications() { return panel.notifications },
      get selectedLocal() { return panel.selectedLocal as any[] },
      set selectedLocal(v) { panel.selectedLocal = v as any },
      get selectedRemote() { return panel.selectedRemote as any[] },
      set selectedRemote(v) { panel.selectedRemote = v as any },
      hasConflictQueue: () => panel._conflictQueue.length > 0,
      resetFileDragState: () => panel._resetFileDragState(),
      uploadPathToRemote: (remoteDir, localPath) => panel.uploadPathToRemote(remoteDir, localPath),
      streamDownloadOne: (file) => panel._streamDownloadOne(file),
      refreshLocal: () => panel.refreshLocal(),
      refreshRemote: () => panel.refreshRemote(),
      showConflictDialog: () => panel._showConflictDialog(),
    })
    this._transferCoordinator = new PanelTransferCoordinator({
      get sftpSession() { return panel.sftpSession },
      mtimeToleranceMs: SftpFloatingPanel.MTIME_TOLERANCE_MS,
      get localPath() { return panel.localPath },
      enqueueConflict: (item) => {
        panel._conflictQueue.push(item)
        panel.conflictOriginalTotal = panel._conflictQueue.length
      },
      showConflictDialog: () => panel._showConflictDialog(),
      calcLocalDirSize: (p) => panel._calcLocalDirSize(p),
      countLocalDirItems: (p) => panel._countLocalDirItems(p),
      calcRemoteDirSize: (p) => panel._calcRemoteDirSize(p),
      countRemoteDirItems: (p) => panel._countRemoteDirItems(p),
      startFolderTransfer: (name, direction, remotePath, localPath, totalSize, itemCount) => {
        const { transferEntry: t, startTime, logEntryId } = panel._startFolderTransfer(
          name, direction, remotePath, localPath, totalSize, itemCount,
        )
        return { t, startTime, logEntryId, bytesDone: 0, itemDone: 0 }
      },
      finishFolderTransfer: (ctx, success) =>
        panel._finishFolderTransfer(ctx.t, ctx.startTime, ctx.logEntryId, success),
      updateFolderProgress: (ctx, bytesDone, currentItem, itemDone, currentItemSize) =>
        panel._updateFolderProgress(ctx.t, bytesDone, currentItem, itemDone, currentItemSize),
      uploadTopLevel: (remotePath, localPath) => panel._doUpload(remotePath, localPath),
      uploadRaw: (remotePath, localPath) => panel._doUploadRaw(remotePath, localPath),
      downloadTopLevel: (remotePath, localPath, mode, size) =>
        panel._doDownload(remotePath, localPath, mode, size),
      downloadRaw: (remotePath, localPath, mode, size) =>
        panel._doDownloadRaw(remotePath, localPath, mode, size),
      refreshRemote: () => panel.refreshRemote(),
    })
    this._pasteAdapter = new PanelPasteAdapter({
      get sftpSession() { return panel.sftpSession },
      get sshSession() { return panel.sshSession },
      get effectiveLang() { return panel.effectiveLang },
      get i18n() { return panel.i18n },
      get notifications() { return panel.notifications },
      uploadFile: (remotePath, localPath) => panel._doUpload(remotePath, localPath),
      downloadFile: (remotePath, localPath, mode, size) =>
        panel._doDownload(remotePath, localPath, mode, size),
      uploadDirectory: (localSrc, remoteDestParent) =>
        panel.uploadPathToRemote(remoteDestParent, localSrc),
      downloadDirectory: (remoteSrc, localDestParent) =>
        panel.downloadRemoteDir(remoteSrc, localDestParent, 'local'),
      checkRemotePathExists: (remotePath, expectDir) =>
        panel._transferCoordinator.checkRemotePathExists(remotePath, expectDir),
      enqueueConflict: (item) => {
        panel._conflictQueue.push(item)
      },
      showConflictDialog: () => panel._showConflictDialog(),
      getConflictQueueLength: () => panel._conflictQueue.length,
      setConflictOriginalTotal: (count) => { panel.conflictOriginalTotal = count },
      savePendingPaste: (entries, destPane, destPath, mode, source) => {
        panel._pendingPasteEntries = entries as any
        panel._pendingPasteDestPane = destPane
        panel._pendingPasteDestPath = destPath
        panel._pendingPasteMode = mode
        panel._pendingPasteSource = source
      },
      renameRemote: async (src, dest) => {
        if (!panel.sftpSession) return
        await panel.sftpSession.rename(src, dest)
      },
      refreshLocal: () => panel.refreshLocal(),
      refreshRemote: () => panel.refreshRemote(),
    })
    this._conflictResolver = new PanelConflictResolver({
      get sftpSession() { return panel.sftpSession },
      get cdr() { return panel.cdr },
      renameRemote: async (src, dest) => {
        if (!panel.sftpSession) return
        await panel.sftpSession.rename(src, dest)
      },

      get conflictData() { return panel.conflictData },
      set conflictData(v) { panel.conflictData = v },
      get showConflictDialog() { return panel.showConflictDialog },
      set showConflictDialog(v) { panel.showConflictDialog = v },
      get conflictCurrIdx() { return panel.conflictCurrIdx },
      set conflictCurrIdx(v) { panel.conflictCurrIdx = v },
      get conflictTotalIdx() { return panel.conflictTotalIdx },
      set conflictTotalIdx(v) { panel.conflictTotalIdx = v },
      get conflictOriginalTotal() { return panel.conflictOriginalTotal },
      set conflictOriginalTotal(v) { panel.conflictOriginalTotal = v },

      get conflictQueue() { return panel._conflictQueue },
      set conflictQueue(v) { panel._conflictQueue = v },
      get conflictAllMode() { return panel._conflictAllMode as any },
      set conflictAllMode(v) { panel._conflictAllMode = v },
      get conflictResolvedKeys() { return panel._conflictResolvedKeys },
      set conflictResolvedKeys(v) { panel._conflictResolvedKeys = v },

      get selectedLocal() { return panel.selectedLocal },
      set selectedLocal(v) { panel.selectedLocal = v },
      get selectedRemote() { return panel.selectedRemote },
      set selectedRemote(v) { panel.selectedRemote = v },

      get clipboardEntries() { return panel.clipboardEntries as any },
      set clipboardEntries(v) { panel.clipboardEntries = v as any },
      get clipboardSource() { return panel.clipboardSource },
      set clipboardSource(v) { panel.clipboardSource = v },
      get clipboardMode() { return panel.clipboardMode },
      set clipboardMode(v) { panel.clipboardMode = v },
      get pendingPasteEntries() { return panel._pendingPasteEntries as any },
      set pendingPasteEntries(v) { panel._pendingPasteEntries = v as any },
      get pendingPasteDestPane() { return panel._pendingPasteDestPane },
      set pendingPasteDestPane(v) { panel._pendingPasteDestPane = v },
      get pendingPasteDestPath() { return panel._pendingPasteDestPath },
      set pendingPasteDestPath(v) { panel._pendingPasteDestPath = v },
      get pendingPasteMode() { return panel._pendingPasteMode },
      set pendingPasteMode(v) { panel._pendingPasteMode = v },
      get pendingPasteSource() { return panel._pendingPasteSource },
      set pendingPasteSource(v) { panel._pendingPasteSource = v },

      refreshRemote: () => panel.refreshRemote(),
      refreshLocal: () => panel.refreshLocal(),
      executePaste: (entries, destPane, destPath, mode, source) =>
        panel._pasteAdapter.executePaste(entries as any, destPane, destPath, mode, source),

      doDownload: (remotePath, localPath, mode, size) => panel._doDownload(remotePath, localPath, mode, size),
      doUpload: (remotePath, localPath) => panel._doUpload(remotePath, localPath),
      downloadRemoteDir: (remoteDir, localDestDir, targetPane, top, renameTo) =>
        panel._transferCoordinator.downloadRemoteDir(remoteDir, localDestDir, top, renameTo),
      mergeLocalDirToRemote: (localSrc, remoteDest) =>
        panel._transferCoordinator.mergeLocalDirToRemote(localSrc, remoteDest),
      copyLocalDir: (src, dest) => copyLocalDir(src, dest),
      copyRemoteDir: (srcRemotePath, destRemotePath, isDirectory) => copyRemoteDir(
        srcRemotePath, destRemotePath, isDirectory, {
          hasSession: () => !!panel.sftpSession,
          mkdir: async (p) => { await panel.sftpSession!.mkdir(p) },
          readdir: async (p) => {
            const entries = await panel.sftpSession!.readdir(p)
            return entries.map(e => ({ name: e.name, isDirectory: !!e.isDirectory }))
          },
          download: (r, l) => panel._doDownload(r, l),
          upload: (r, l) => panel._doUpload(r, l),
          tryServerCopy: (src, dest, isDir) =>
            tryRemoteCpViaSsh(panel.sshSession, src, dest, isDir),
        },
      ),
    })
    this._transferRuntime = new PanelTransferRuntime({
      get connected() { return panel.connected },
      get sftpSession() { return panel.sftpSession },
      get transfers() { return panel.transfers },
      set transfers(v) { panel.transfers = v },
      get transferLog() { return panel.transferLog },
      get profile() { return panel.profile },
      get effectiveLang() { return panel.effectiveLang },
      get notifications() { return panel.notifications },
      get cdr() { return panel.cdr },
      get zone() { return panel.zone },
      formatSpeed: (bytes, ms) => panel._formatSpeed(bytes, ms),
    })
    // 面板 UI 状态已由 SftpConfigService 自动迁移（集中管理）
    this.loadLocalColSettings()
    this.loadRemoteColSettings()
    this.loadTableSettings()
    this.loadLocalColWidths()
    this.loadRemoteColWidths()
    // refreshLocal 移至 ngOnInit 中 _loadSavedPaths 后执行，避免构造函数中的异步
    // 读取覆盖了路径记忆恢复的正确路径
  }

  // _paneStore 已移除，统一经 SftpConfigService 读写

  /** 读取面板状态（优先新嵌套路径，回退旧 localStorage） */
  protected _paneGet(key: string, def?: any): any {
    const newPath = this._mapPaneKey(key)
    if (newPath && this.sftpConfig) {
      const val = this.sftpConfig.get(newPath)
      if (val !== undefined) return val
    }
    // 回退：直接从 localStorage 读旧 key（兼容未迁移 / 旧版升级过渡期）
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return raw
    } catch {}
    return def
  }

  /** 写入面板状态：经统一配置服务（高频操作不入磁盘，flush 时落盘） */
  protected _paneSet(key: string, val: any): void {
    const newPath = this._mapPaneKey(key)
    if (newPath && this.sftpConfig) {
      this.sftpConfig.set(newPath, val)
    } else {
      // 无映射时回退 localStorage
      try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)) } catch {}
    }
  }

  /**
   * 将旧扁平 key（如 sftp-plus-path-mode.root@host）映射为新嵌套路径
   * 无匹配返回 null（保持向下兼容）
   */
  private _mapPaneKey(key: string): string | null {
    const perHostPrefixes = [
      'sftp-plus-path-mode.',
      'sftp-plus-path-mem.',
      'sftp-plus-saved-local-path.',
      'sftp-plus-saved-remote-path.',
    ]
    for (const prefix of perHostPrefixes) {
      if (key.startsWith(prefix)) {
        const host = key.substring(prefix.length)
        const fieldMap: Record<string, string> = {
          'sftp-plus-path-mode.': 'pathMode',
          'sftp-plus-path-mem.': 'rememberPath',
          'sftp-plus-saved-local-path.': 'savedLocalPath',
          'sftp-plus-saved-remote-path.': 'savedRemotePath',
        }
        return `paneState/perHost/${host}/${fieldMap[prefix]}`
      }
    }
    const keyMap: Record<string, string> = {
      'sftp-plus-layout-mode': 'paneState/layout/mode',
      'sftp-plus-settings.layoutMode': 'paneState/layout/mode',
      'sftp-plus-horizontal-split-ratio': 'paneState/layout/horizontalSplitRatio',
      'sftp-plus-vertical-split-ratio': 'paneState/layout/verticalSplitRatio',
      'sftp-plus-local-sort': 'paneState/local/sort',
      'sftp-plus-local-cols': 'paneState/local/cols',
      'sftp-plus-local-cols-order': 'paneState/local/colsOrder',
      'sftp-plus-remote-sort': 'paneState/remote/sort',
      'sftp-plus-remote-cols': 'paneState/remote/cols',
      'sftp-plus-remote-cols-order': 'paneState/remote/colsOrder',
      'sftp-plus-local-col-widths': 'paneState/local/colWidths',
      'sftp-plus-remote-col-widths': 'paneState/remote/colWidths',
      'sftp-plus-pane-custom-order': 'paneCustomOrder',
    }
    return keyMap[key] || null
  }

  private _loadPaneToolbarLayout(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (Array.isArray(cfg?.paneCustomOrder) && cfg.paneCustomOrder.length) {
        this.paneCustomOrder = cfg.paneCustomOrder as any
      } else if (Array.isArray(cfg?.paneHeaderOrder) && Array.isArray(cfg?.paneToolbarOrder)) {
        const header = cfg.paneHeaderOrder as Array<'label' | 'path' | 'toolbar'>
        const toolbar = cfg.paneToolbarOrder as Array<'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'>
        const items: any[] = []
        for (const part of header) {
          if (part === 'toolbar') items.push(...toolbar)
          else items.push(part)
        }
        this.paneCustomOrder = items as any
      }
      return
    } catch { /* ignore */ }
    try {
      const raw = this._paneGet('sftp-plus-pane-custom-order')
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(parsed) && parsed.length) this.paneCustomOrder = parsed as any
      }
    } catch { /* ignore */ }
  }

  /** 将面板状态持久化到 Tabby 配置（经统一配置服务落盘） */
  private _paneFlushToConfig(): void {
    this.sftpConfig?.flush()
  }

  /** 使用界面语言（代理到 i18n service） */
  get effectiveLang(): Locale {
    return this.i18n.getLocale()
  }

  ngOnInit(): void {
    const panel = this
    this._connLifecycle = new PanelConnectionLifecycle({
      get sshSession() { return panel.sshSession },
      set sshSession(v) { panel.sshSession = v },
      get sftpSession() { return panel.sftpSession },
      set sftpSession(v) { panel.sftpSession = v },
      get connected() { return panel.connected },
      set connected(v) { panel.connected = v },
      get connecting() { return panel.connecting },
      set connecting(v) { panel.connecting = v },
      get reconnecting() { return panel.reconnecting },
      set reconnecting(v) { panel.reconnecting = v },
      get pathMode() { return panel.pathMode },
      get remotePath() { return panel.remotePath },
      set remotePath(v) { panel.remotePath = v },
      get remotePathInput() { return panel.remotePathInput },
      set remotePathInput(v) { panel.remotePathInput = v },
      get terminalRef() { return panel.terminalRef },
      sftpService: this.sftpService,
      notifications: this.notifications,
      getI18n: () => panel.i18n,
      zone: this.zone,
      cdr: this.cdr,
      getDefaultRemotePath: () => panel.getDefaultRemotePath(),
      refreshRemote: () => panel.refreshRemote(),
      restoreSavedRemotePath: () => panel._restoreSavedRemotePath(),
      tryGetTerminalCwd: () => panel.tryGetTerminalCwd(),
      pushRemoteNav: (p) => panel._pushRemoteNav(p),
      clearNavHistory: () => {
        panel._remoteNav.clear()
        panel._localNav.clear()
      },
      clearRemoteListing: () => panel.clearRemoteListing(),
      setRemoteLoading: (loading) => { panel._remoteLoading = loading },
    })

    // profile 已就绪，此时加载路径模式才能正确匹配 per-profile 的 key
    this._loadSavedPaths()
    this._cwdSetupPrompted = false
    if (this.pathMode === 'sync') this._startCwdSync()
    // 本地导航历史：记录初始路径
    this._pushLocalNav(this.localPath)
    // 路径记忆可能更新了 localPath，刷新本地列表显示正确的目录内容
    void this.refreshLocal()

    // 确定 host info
    if (this.profile?.options?.host) {
      const user = this.profile.options.username || this.profile.options.user || ''
      this.hostInfo = user ? `${user}@${this.profile.options.host}` : this.profile.options.host
    }
    if (this.sshSession) {
      void this.connect()
    }

    // 窄屏布局检测（ResizeObserver 监听容器宽度变化）
    try {
      // 加载保存的分割比例与布局模式
      const vsaved = this._paneGet('sftp-plus-vertical-split-ratio')
      if (vsaved) this._verticalSplitRatio = Math.max(0.15, Math.min(0.85, parseFloat(vsaved) || 0.5))
      const hsaved = this._paneGet('sftp-plus-horizontal-split-ratio')
      if (hsaved) this._horizontalSplitRatio = Math.max(0.15, Math.min(0.85, parseFloat(hsaved) || 0.5))
      const lmode = this.configService?.store?.['tabby-sftp-plus']?.layoutMode
      if (lmode === 'horizontal' || lmode === 'vertical' || lmode === 'single') this._layoutMode = lmode

      this._bindLayoutObservers()
    } catch { /* ResizeObserver 不可用时忽略 */ }

    // Auto 模式：跟随 Tabby 当前主题配色
    this._applyAutoTheme()
    this._loadPaneToolbarLayout()
    this._readBehaviorConfig()

    // 监听 Tabby 主题切换 → 面板实时跟随
    this._themeSub = this.themesService.themeChanged$.subscribe(() => {
      this._applyAutoTheme()
    })

    // 监听设置页变更 → 同步刷新面板显示
    this._settingsChangedHandler = () => {
      this.loadLocalColSettings()
    this.loadRemoteColSettings()
      this.loadTableSettings()
      this.loadLocalColWidths()
    this.loadRemoteColWidths()
      // 重建 i18n service 以应用语言设置变更
      this.i18n = new SftpI18nService(this.configService)
      // 同步书签与传输日志（其他面板或导入后可能已变更）
      this.bookmarks.reload()
      this.transferLog.reload()
      this._loadPaneToolbarLayout()
      this._readBehaviorConfig()
      // 重新读取布局模式并立即应用（同步窄屏判断 + 面板分割）
      const lmode = this.configService?.store?.['tabby-sftp-plus']?.layoutMode
      if (lmode === 'horizontal' || lmode === 'vertical' || lmode === 'single') this._layoutMode = lmode
      else this._layoutMode = 'auto'
      if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
      else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
      else if (this._layoutMode === 'single') this._isNarrowLayout = false
      else {
        const h = this.elRef?.nativeElement as HTMLElement | undefined
        if (h) this._isNarrowLayout = h.clientWidth <= 960
      }
      this._applyPaneSplit()
      this._applyAutoTheme()
      this.cdr.detectChanges()
    }
    window.addEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)

    // 捕获阶段 document click：关闭书签悬浮面板 & 右键菜单 & 表头菜单
    // overlay 的 stopPropagation 阻止了冒泡阶段到达 document，但捕获阶段不受影响
    this._docClickCapture = (ev: MouseEvent) => {
      // Early return: skip expensive DOM queries when no popup/menu is open
      if (!this.showBookmarks && !this.contextMenuVisible && !this.headerMenuVisible
        && !this.localFilterVisible && !this.remoteFilterVisible) return
      const target = ev.target as HTMLElement | null
      const clickedInFilterUi = !!(target?.closest('.pane-filters') || target?.closest('.filter-toggle-btn'))
      let changed = false
      if (!clickedInFilterUi) {
        if (this.localFilterVisible && !this.localFilterPending.trim()) {
          this.localFilterVisible = false
          changed = true
        }
        if (this.remoteFilterVisible && !this.remoteFilterPending.trim()) {
          this.remoteFilterVisible = false
          changed = true
        }
      }
      if (this.showBookmarks) {
        if (this._bookmarkJustOpened) return
        if (!target?.closest('.bookmark-popup') && !target?.closest('.bm-btn')) {
          this.zone.run(() => {
            this.closeBookmarks()
            if (changed) this.cdr.detectChanges()
          })
          return
        }
      }
      if (this.contextMenuVisible) {
        if (!target?.closest('.context-menu')) {
          this.zone.run(() => {
            this.contextMenuVisible = false
            this.cdr.detectChanges()
          })
          return
        }
      }
      if (this.headerMenuVisible) {
        if (!target?.closest('.context-menu')) {
          this.zone.run(() => {
            this.headerMenuVisible = false
            this.cdr.detectChanges()
          })
          return
        }
      }
      if (changed) {
        this.zone.run(() => this.cdr.detectChanges())
      }
    }
    document.addEventListener('click', this._docClickCapture, true)

    // 滚轮事件关闭所有悬浮面板/菜单（捕获阶段）
    // 注意：必须在捕获阶段判断目标归属，因为模板绑定的 (wheel) 冒泡阶段 stopPropagation()
    // 无法阻止捕获阶段已触发的监听器。仿照 _docClickCapture 做目标排除。
    this._docWheelCapture = (ev: WheelEvent) => {
      if (!this.showBookmarks && !this.contextMenuVisible && !this.headerMenuVisible) return
      const target = ev.target as HTMLElement | null
      if (this.showBookmarks) {
        if (target?.closest('.bookmark-popup')) return
      }
      if (this.contextMenuVisible) {
        if (target?.closest('.context-menu')) return
      }
      if (this.headerMenuVisible) {
        if (target?.closest('.context-menu')) return
      }
      // 轮到了真正需要关闭的情况
      this.zone.run(() => {
        if (this.showBookmarks) this.closeBookmarks()
        if (this.contextMenuVisible) this.contextMenuVisible = false
        if (this.headerMenuVisible) this.headerMenuVisible = false
        this.cdr.detectChanges()
      })
    }
    document.addEventListener('wheel', this._docWheelCapture, true)
  }

  ngAfterViewInit(): void {
    // 兜底：在视图完全初始化后再次应用主题，确保 inline 样式不丢失
    // 某些场景下 ngOnInit 时 themesService 可能尚未完全就绪
    this._applyAutoTheme()
    // 初始化自动布局检测（视图已渲染，clientWidth 可用）
    this._scheduleLayoutRefresh()
    if (this.displayMode === 'workspace') {
      setTimeout(() => this._scheduleLayoutRefresh(), 0)
      setTimeout(() => this._scheduleLayoutRefresh(), 120)
    }
    // 浮动模式：初始化面板拖拽 / 缩放 / 最大化的几何（切换为绝对定位）
    if (this.displayMode !== 'workspace') {
      this._loadPanelGeometry()
      this._initPanelGeometry()
    }
  }

  ngOnDestroy(): void {
    // 必须先中止拖拽预缓存下载，再 disconnect；否则后台 SFTP read 会继续占满 SSH 通道，
    // 关面板重开后进入文件夹仍会卡，直到重启 Tabby。
    this._cancelRemoteDragCache()
    this._clearCustomDragPreview()
    this._fileDnd?.reset()
    this._headerReorder?.dispose()
    this._rubberBand.dispose()
    this._transferRuntime.dispose()
    if (this._geomInitTimer) {
      clearTimeout(this._geomInitTimer)
      this._geomInitTimer = null
    }
    if (this._splitMoveHandler) {
      document.removeEventListener('mousemove', this._splitMoveHandler)
      this._splitMoveHandler = null
    }
    if (this._splitUpHandler) {
      document.removeEventListener('mouseup', this._splitUpHandler)
      this._splitUpHandler = null
    }
    // 清理几何拖拽/缩放事件监听器（防止销毁时正在拖拽导致泄漏）
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    this.saveCurrentPath()
    this._stopCwdSync()
    this.cwdSetupVisible = false
    this._cwdSetupPrompted = false
    this._paneFlushToConfig()  // 面板销毁前持久化所有 UI 状态到 config
    this.disconnect()
    this._clearPanelTimers()
    if (this._docClickCapture) {
      document.removeEventListener('click', this._docClickCapture, true)
      this._docClickCapture = null
    }
    if (this._docWheelCapture) {
      document.removeEventListener('wheel', this._docWheelCapture, true)
      this._docWheelCapture = null
    }
    if (this._themeSub) { this._themeSub.unsubscribe(); this._themeSub = null }
    if (this._settingsChangedHandler) {
      window.removeEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)
    }
    if (this.localClickTimer) clearTimeout(this.localClickTimer)
    if (this.remoteClickTimer) clearTimeout(this.remoteClickTimer)
    // 清理所有进行中的传输与续传定时器
    this._transferRuntime.clearTransfers()
    // 断开 ResizeObserver 与窗口缩放监听
    if (this._ro) {
      try { this._ro.disconnect() } catch {}
      this._ro = null
    }
    if (this._winResizeHandler) {
      window.removeEventListener('resize', this._winResizeHandler)
      this._winResizeHandler = null
    }
    // P2-1: 清理远程拖拽缓存临时目录
    void fs.rm(path.join(os.tmpdir(), 'sftp-plus-dragout'), { recursive: true, force: true }).catch(() => {})
    // P2-2: 清理 _openPathInSystem 可能残留的 keyup 监听和定时器
    if (this._openPathKeyupHandler) {
      window.removeEventListener('keyup', this._openPathKeyupHandler, true)
      this._openPathKeyupHandler = null
    }
    if (this._openPathTimeoutId) {
      clearTimeout(this._openPathTimeoutId)
      this._openPathTimeoutId = null
    }
    void this._cleanupEditorTemp()
    void this._cleanupViewerTemp()
  }

  private _settingsChangedHandler: (() => void) | null = null
  private _themeSub: any = null
  private _docClickCapture: ((ev: MouseEvent) => void) | null = null
  private _docWheelCapture: ((ev: WheelEvent) => void) | null = null
  private _ro: ResizeObserver | null = null
  /** 布局去重：上次 _scheduleLayoutRefresh 实测的 body 尺寸与窄屏标记 */
  private _lastLayoutBodyW = -1
  private _lastLayoutBodyH = -1
  private _lastLayoutNarrow = false
  private _winResizeHandler: (() => void) | null = null

  /** 当前 Auto 模式检测到的主题名称（供设置面板显示） */
  autoDetectedThemeName = ''

  /**
   * 在 Auto 模式下根据 Tabby UI 主题设置推导面板配色
   * 功能描述：通过读取 document.documentElement 的 --body-bg CSS 变量来判断
   *            Tabby 当前的 UI 暗/亮模式（而非配色方案的终端背景色）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-23
   */
  private _applyAutoTheme(): void {
    const el = this.elRef.nativeElement as HTMLElement

    // 读取主题设置（优先从 Tabby 配置，回退 localStorage）
    let themeValue = ''
    let themePrimary = ''
    let themeBg = ''
    let themeText = ''
    let themeBorder = ''
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (cfg?.theme) {
        themeValue = cfg.theme
        themePrimary = cfg.colorPrimary || ''
        themeBg = cfg.colorBg || ''
        themeText = cfg.colorText || ''
        themeBorder = cfg.colorBorder || ''
      } else {
        const raw = this._paneGet('sftp-plus-settings.theme')
        themeValue = raw ? JSON.parse(raw) : ''
        if (themeValue) {
          themePrimary = this._paneGet('sftp-plus-settings.primaryColor')
          themeBg = this._paneGet('sftp-plus-settings.bgColor')
          themeText = this._paneGet('sftp-plus-settings.textColor')
          themeBorder = this._paneGet('sftp-plus-settings.borderColor')
          try {
            if (themePrimary) themePrimary = JSON.parse(themePrimary)
            if (themeBg) themeBg = JSON.parse(themeBg)
            if (themeText) themeText = JSON.parse(themeText)
            if (themeBorder) themeBorder = JSON.parse(themeBorder)
          } catch {}
        }
      }
    } catch { /* use empty */ }

    const vars = ['--_bg','--_text','--_primary','--_border','--_content','--_surface','--_hover','--_active','--_input-bg','--_scroll-track','--_scroll-thumb','--_scroll-thumb-hover']
    const hasPreset = !!themeValue

    if (hasPreset && themePrimary && themeBg && themeText) {
      // 预设/自定义主题：用保存的颜色值设置内联样式，面板独立启动不依赖设置页
      el.style.setProperty('--_bg', themeBg, 'important')
      el.style.setProperty('--_text', themeText, 'important')
      el.style.setProperty('--_primary', themePrimary, 'important')
      el.style.setProperty('--_border', themeBorder || 'rgba(128,128,128,0.2)', 'important')
      el.style.setProperty('--_content', themeBg, 'important')
      // 表面色和 hover 色基于背景色自动计算
      const isDark = isColorDark(themeBg)
      if (isDark) {
        el.style.setProperty('--_surface', 'rgba(255,255,255,0.06)', 'important')
        el.style.setProperty('--_hover', 'rgba(255,255,255,0.12)', 'important')
        el.style.setProperty('--_active', 'rgba(255,255,255,0.18)', 'important')
        el.style.setProperty('--_input-bg', 'rgba(255,255,255,0.06)', 'important')
        el.style.setProperty('--_scroll-track', 'rgba(255,255,255,0.05)', 'important')
        el.style.setProperty('--_scroll-thumb', 'rgba(255,255,255,0.2)', 'important')
        el.style.setProperty('--_scroll-thumb-hover', 'rgba(255,255,255,0.35)', 'important')
      } else {
        el.style.setProperty('--_surface', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_hover', 'rgba(0,0,0,0.08)', 'important')
        el.style.setProperty('--_active', 'rgba(0,0,0,0.12)', 'important')
        el.style.setProperty('--_input-bg', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_scroll-track', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_scroll-thumb', 'rgba(0,0,0,0.18)', 'important')
        el.style.setProperty('--_scroll-thumb-hover', 'rgba(0,0,0,0.3)', 'important')
      }
      this.autoDetectedThemeName = ''
      return
    }

    if (hasPreset) {
      // 预设主题但颜色值不全，清除内联样式回退 CSS 变量链
      vars.forEach(v => el.style.removeProperty(v))
      this.autoDetectedThemeName = ''
      return
    }

    // Auto 模式：通过 Tabby 的 --body-bg CSS 变量判断 UI 暗/亮模式
    // --body-bg 由 Tabby 根据"始终使用暗色/亮色/跟随系统"设置自动更新
    let bodyBg = '#1e1e2e' // 默认暗色
    try {
      const computedStyle = getComputedStyle(document.documentElement)
      const cssBg = computedStyle.getPropertyValue('--body-bg').trim()
      if (cssBg && cssBg !== '') {
        bodyBg = cssBg
      } else {
        // --body-bg 不可用时，回退到系统颜色方案偏好
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
      }
    } catch {
      // 兜底：使用系统偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
    }

    // 解析 hex → RGB，计算亮度判定暗/亮（支持 rgb()/rgba() 格式）
    let r = 30, g = 30, b = 46
    if (bodyBg.startsWith('rgb')) {
      const match = bodyBg.match(/\d+/g)
      if (match && match.length >= 3) { r = +match[0]; g = +match[1]; b = +match[2] }
    } else {
      const hex = bodyBg.replace('#', '')
      r = parseInt(hex.substring(0, 2), 16) || 30
      g = parseInt(hex.substring(2, 4), 16) || 30
      b = parseInt(hex.substring(4, 6), 16) || 46
    }

    // 感知亮度公式（ITU-R BT.601）
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const isDark = lum < 128

    // 更新公开属性，供设置面板显示当前映射的主题名
    this.autoDetectedThemeName = isDark ? 'dark' : 'light'

    // 使用 setProperty 第三参数 'important' 确保 inline 样式不被 :host CSS 覆盖
    // Auto 模式颜色与设置页 dark/light 预设主题保持一致
    if (isDark) {
      const bg = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
      el.style.setProperty('--_bg', bg, 'important')
      el.style.setProperty('--_text', '#e8edf5', 'important')
      el.style.setProperty('--_primary', '#b6b6c3', 'important')
      el.style.setProperty('--_border', '#2d3242', 'important')
      el.style.setProperty('--_content', bg, 'important')
      el.style.setProperty('--_surface', 'rgba(255,255,255,0.06)', 'important')
      el.style.setProperty('--_hover', 'rgba(255,255,255,0.12)', 'important')
      el.style.setProperty('--_active', 'rgba(255,255,255,0.18)', 'important')
      el.style.setProperty('--_input-bg', 'rgba(255,255,255,0.06)', 'important')
      el.style.setProperty('--_scroll-track', 'rgba(255,255,255,0.05)', 'important')
      el.style.setProperty('--_scroll-thumb', 'rgba(255,255,255,0.2)', 'important')
      el.style.setProperty('--_scroll-thumb-hover', 'rgba(255,255,255,0.35)', 'important')
    } else {
      el.style.setProperty('--_bg', '#ffffff', 'important')
      el.style.setProperty('--_text', '#333333', 'important')
      el.style.setProperty('--_primary', '#2563eb', 'important')
      el.style.setProperty('--_border', '#d1d5db', 'important')
      el.style.setProperty('--_content', '#ffffff', 'important')
      el.style.setProperty('--_surface', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_hover', 'rgba(0,0,0,0.08)', 'important')
      el.style.setProperty('--_active', 'rgba(0,0,0,0.12)', 'important')
      el.style.setProperty('--_input-bg', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_scroll-track', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_scroll-thumb', 'rgba(0,0,0,0.18)', 'important')
      el.style.setProperty('--_scroll-thumb-hover', 'rgba(0,0,0,0.3)', 'important')
    }
    // 强制 Angular 变更检测，确保子元素 CSS 变量重新计算
    this.cdr.detectChanges()
  }

  /** 格式化传输速度 */
  private _formatSpeed(bytes: number, ms: number): string {
    if (bytes <= 0 || ms <= 0) return ''
    const bps = (bytes / ms) * 1000
    if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
    if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
    return Math.round(bps) + ' B/s'
  }

  close(): void {
    // 有正在进行的传输时，提示用户确认
    if (this.transfers.length > 0) {
      const msg = this.i18n.t('notify.closeWithTransfers', { count: this.transfers.length })
      if (!confirm(msg)) return
      // 用户确认关闭 → 取消所有传输
      this.clearTransfers()
    }
    this.saveCurrentPath()
    if (this.displayMode !== 'workspace') {
      this.disconnect()
    }
    this.onClose?.()
  }

  /** 读取行为类开关（选中书签后关闭书签面板） */
  private _readBehaviorConfig(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (cfg?.closeBookmarkPanelOnSelect !== undefined) {
        this.closeBookmarkPanelOnSelect = !!cfg.closeBookmarkPanelOnSelect
      }
      // 自定义时间格式：pattern 变化后 formatDate 输出改变，必须失效 _cells 预计算缓存
      const fmt = typeof cfg?.dateFormat === 'string' ? cfg.dateFormat.trim() : ''
      if (fmt !== getDateFormatPattern()) {
        setDateFormatPattern(fmt)
        this._invalidateLocalCache()
        this._invalidateRemoteCache()
      }
    } catch { /* ignore */ }
  }

  /** 读取面板几何（位置/尺寸/最大化），全局配置跨会话生效 */
  private _loadPanelGeometry(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      const g = cfg?.panelGeometry
      if (g && typeof g === 'object') {
        this._panelGeom = {
          left: typeof g.left === 'string' ? g.left : undefined,
          top: typeof g.top === 'string' ? g.top : undefined,
          width: typeof g.width === 'string' ? g.width : undefined,
          height: typeof g.height === 'string' ? g.height : undefined,
          maximized: !!g.maximized,
          followWindow: !!g.followWindow,
        }
      }
    } catch { /* ignore */ }
  }

  /** 持久化面板几何到内存 store（不立刻 save。Tabby 退出时自动落盘，
   *  避免每次拖拽缩放频繁写 config.yaml 导致文件损坏——以前调 this.configService.save()
   *  每次 save() 是整个 config.yaml 重写，中断即损坏，下次启动闪退。） */
  private _persistPanelGeometry(): void {
    if (!this.configService?.store) return
    try {
      const target = this.configService.store['tabby-sftp-plus']
      // 最大化时宿主 style 是 100%，需存还原后的真实尺寸，否则重载无法复原
      const g = (this.panelMaximized && this._prevGeom)
        ? this._prevGeom
        : {
            left: this._hostEl?.style.left || '',
            top: this._hostEl?.style.top || '',
            width: this._hostEl?.style.width || '',
            height: this._hostEl?.style.height || '',
          }
      // ★ 只存有效字符串，跳过 undefined（yaml 序列化某些 undefined 值可能异常）
      target.panelGeometry = {
        left: typeof g.left === 'string' && g.left.length > 0 ? g.left : undefined,
        top: typeof g.top === 'string' && g.top.length > 0 ? g.top : undefined,
        width: typeof g.width === 'string' && g.width.length > 0 ? g.width : undefined,
        height: typeof g.height === 'string' && g.height.length > 0 ? g.height : undefined,
        maximized: !!this.panelMaximized,
        followWindow: !!this._followWindow,
      }
      // ★ 不再显式 save()：交给 Tabby 退出时统一落盘，避免频繁写入导致 config.yaml 损坏
    } catch { /* ignore */ }
  }

  /** 最小化面板（不销毁，下次点击入口直接恢复） */
  minimize(): void {
    this.saveCurrentPath()
    this.minimized = true
    this.onMinimize?.()
  }

  // ========== 浮动面板几何：拖拽移动 / 缩放 / 最大化（仅 floating 模式）==========

  /** floating 模式下把面板宿主从 flex 居中切换为绝对定位，并应用已保存（或默认居中）几何 */
  private _initPanelGeometry(): void {
    const host = this.elRef.nativeElement as HTMLElement
    this._hostEl = host
    const parent = host.offsetParent as HTMLElement | null
    if (!parent) {
      // 宿主尚未挂载到可定位父级，稍后重试一次（避免拖拽/缩放/最大化静默失效）
      if (!this._geomInitRetried) {
        this._geomInitRetried = true
        this._geomInitTimer = setTimeout(() => this._initPanelGeometry(), 50)
      }
      return
    }
    const r = host.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    host.style.position = 'absolute'
    const saved = this._panelGeom
    if (saved.maximized) {
      // 恢复最大化：记录还原基准几何，再铺满
      this._followWindow = !!saved.followWindow
      if (saved.followWindow) {
        // 还原基准为「跟随窗口」默认尺寸（百分比），最大化还原后继续跟随窗口
        this._prevGeom = { left: '2%', top: '3%', width: '96%', height: '94%', followWindow: true }
      } else {
        this._prevGeom = {
          left: saved.left || '0px',
          top: saved.top || '0px',
          width: saved.width || '100%',
          height: saved.height || '100%',
          followWindow: false,
        }
      }
      host.style.left = '0px'
      host.style.top = '0px'
      host.style.width = '100%'
      host.style.height = '100%'
      this.panelMaximized = true
    } else if (saved.followWindow || !saved.width || !saved.height) {
      // 默认 / 跟随窗口模式：百分比定位（96%×94% 居中），Tabby 窗口缩放时面板自动跟随
      this._applyDefaultGeometry()
    } else {
      // 自定义固定 px 几何：应用已保存几何，并按当前父容器边界 clamp，避免屏幕尺寸变化后超出/离屏
      this._followWindow = false
      let w = parseFloat(saved.width as string) || r.width
      let h = parseFloat(saved.height as string) || r.height
      let left = saved.left != null ? parseFloat(saved.left) : (r.left - pr.left)
      let top = saved.top != null ? parseFloat(saved.top) : (r.top - pr.top)
      w = Math.max(this._geomMinW, Math.min(w, pr.width))
      h = Math.max(this._geomMinH, Math.min(h, pr.height))
      left = Math.min(Math.max(0, left), pr.width - w)
      top = Math.min(Math.max(0, top), pr.height - h)
      host.style.left = left + 'px'
      host.style.top = top + 'px'
      host.style.width = w + 'px'
      host.style.height = h + 'px'
    }
    this.panelDraggable = true
    this.cdr.detectChanges()
  }

  /** 应用「跟随窗口」默认几何：96%×94% 居中，使用百分比定位 → Tabby 窗口缩放时面板自动跟随 */
  private _applyDefaultGeometry(): void {
    const host = this._hostEl
    if (!host) return
    host.style.left = '2%'
    host.style.top = '3%'
    host.style.width = '96%'
    host.style.height = '94%'
    this._followWindow = true
    this.panelMaximized = false
    this._prevGeom = null
    this.cdr.detectChanges()
    this._scheduleLayoutRefresh()
  }

  /** 把「跟随窗口」百分比几何转换为固定 px（拖拽/缩放开始时调用，避免百分比参与像素运算） */
  private _convertFollowToPx(): void {
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    const r = host.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    host.style.left = (r.left - pr.left) + 'px'
    host.style.top = (r.top - pr.top) + 'px'
    host.style.width = r.width + 'px'
    host.style.height = r.height + 'px'
    this._followWindow = false
  }

  /** 浮动模式：Tabby 窗口缩放后，若自定义固定 px 几何超出新的父容器边界，
   * 重新 clamp 到父容器，避免后续拖拽移动时 clamp 下界（pr.width - host.offsetWidth）
   * 为负导致面板飞出/错位。仅在非最大化、非跟随窗口（即固定 px）时处理；
   * 跟随窗口百分比几何由浏览器自动适配，不在此处理。 */
  private _clampGeometryToParent(): void {
    if (this.displayMode === 'workspace' || this.panelMaximized || this._followWindow) return
    if (this._resizing || this.panelDragging) return
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    // 百分比几何不 clamp（理论上 _followWindow=false 时已是 px，这里双保险）
    if (host.style.width.includes('%') || host.style.height.includes('%')) return
    const pr = parent.getBoundingClientRect()
    let w = parseFloat(host.style.width) || host.offsetWidth
    let h = parseFloat(host.style.height) || host.offsetHeight
    let left = parseFloat(host.style.left) || 0
    let top = parseFloat(host.style.top) || 0
    w = Math.max(this._geomMinW, Math.min(w, pr.width))
    h = Math.max(this._geomMinH, Math.min(h, pr.height))
    left = Math.min(Math.max(0, left), Math.max(0, pr.width - w))
    top = Math.min(Math.max(0, top), Math.max(0, pr.height - h))
    host.style.left = left + 'px'
    host.style.top = top + 'px'
    host.style.width = w + 'px'
    host.style.height = h + 'px'
  }

  /** 顶部标题栏按下：开始拖拽移动（按钮/输入框等不触发） */
  onTopBarMouseDown(e: MouseEvent): void {
    if (this.displayMode === 'workspace' || this.panelMaximized || !this.panelDraggable) return
    const t = e.target as HTMLElement
    if (t.closest('button, input, a, .disconnect-indicator, .reconnect-btn')) return
    const host = this._hostEl
    if (!host) return
    // 跟随窗口模式下先转换为固定 px，避免百分比参与拖拽像素运算
    if (this._followWindow) this._convertFollowToPx()
    e.preventDefault()
    const r = host.getBoundingClientRect()
    this._dragOffsetX = e.clientX - r.left
    this._dragOffsetY = e.clientY - r.top
    this.panelDragging = true
    this.cdr.detectChanges()
    // 防重复绑定：先移除再添加
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    document.addEventListener('mousemove', this._onGeomMoveBound)
    document.addEventListener('mouseup', this._onGeomUpBound)
  }

  /** 缩放手柄按下：开始缩放 */
  onResizeStart(e: MouseEvent, dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'): void {
    if (this.displayMode === 'workspace' || this.panelMaximized || !this.panelDraggable) return
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    // 跟随窗口模式下先转换为固定 px，避免百分比参与缩放像素运算
    if (this._followWindow) this._convertFollowToPx()
    e.preventDefault()
    e.stopPropagation()
    const r = host.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    this._resizing = true
    this._resizeDir = dir
    this._resizeStart = { left: r.left - pr.left, top: r.top - pr.top, w: r.width, h: r.height, mx: e.clientX, my: e.clientY }
    this.panelResizing = true
    this.cdr.detectChanges()
    // 防重复绑定：先移除再添加
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    document.addEventListener('mousemove', this._onGeomMoveBound)
    document.addEventListener('mouseup', this._onGeomUpBound)
  }

  private _onGeomMove(e: MouseEvent): void {
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    const pr = parent.getBoundingClientRect()
    if (this._resizing && this._resizeDir) {
      const dx = e.clientX - this._resizeStart.mx
      const dy = e.clientY - this._resizeStart.my
      let left = this._resizeStart.left
      let top = this._resizeStart.top
      let w = this._resizeStart.w
      let h = this._resizeStart.h
      const dir = this._resizeDir
      if (dir.includes('e')) w = this._resizeStart.w + dx
      if (dir.includes('s')) h = this._resizeStart.h + dy
      if (dir.includes('w')) { w = this._resizeStart.w - dx; left = this._resizeStart.left + dx }
      if (dir.includes('n')) { h = this._resizeStart.h - dy; top = this._resizeStart.top + dy }
      w = Math.max(this._geomMinW, Math.min(w, pr.width))
      h = Math.max(this._geomMinH, Math.min(h, pr.height))
      left = Math.min(Math.max(0, left), pr.width - w)
      top = Math.min(Math.max(0, top), pr.height - h)
      host.style.left = left + 'px'
      host.style.top = top + 'px'
      host.style.width = w + 'px'
      host.style.height = h + 'px'
      // 拖拽缩放过程中实时触发布局自适应（窄屏切换 / 分栏重排），rAF 已节流
      this._scheduleLayoutRefresh()
    } else {
      let nx = e.clientX - pr.left - this._dragOffsetX
      let ny = e.clientY - pr.top - this._dragOffsetY
      nx = Math.min(Math.max(0, nx), pr.width - host.offsetWidth)
      ny = Math.min(Math.max(0, ny), pr.height - host.offsetHeight)
      host.style.left = nx + 'px'
      host.style.top = ny + 'px'
    }
  }

  private _onGeomUp(): void {
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    this._resizing = false
    this._resizeDir = null
    this.panelDragging = false
    this.panelResizing = false
    this.cdr.detectChanges()
    // 拖拽 / 缩放结束：持久化几何到全局配置
    this._persistPanelGeometry()
  }

  /** 最大化 / 还原（仅在 floating 模式） */
  toggleMaximize(): void {
    if (this.displayMode === 'workspace' || !this.panelDraggable) return
    const host = this._hostEl
    if (!host) return
    if (!this.panelMaximized) {
      this._prevGeom = {
        left: host.style.left,
        top: host.style.top,
        width: host.style.width,
        height: host.style.height,
        followWindow: this._followWindow,
      }
      host.style.left = '0px'
      host.style.top = '0px'
      host.style.width = '100%'
      host.style.height = '100%'
      this.panelMaximized = true
    } else {
      if (this._prevGeom) {
        host.style.left = this._prevGeom.left
        host.style.top = this._prevGeom.top
        host.style.width = this._prevGeom.width
        host.style.height = this._prevGeom.height
        this._followWindow = !!this._prevGeom.followWindow
      }
      this.panelMaximized = false
      // 还原时同步刷新布局：强制回流后立即应用正确的面板分割比例，
      // 避免下一帧才通过 requestAnimationFrame 修正导致视觉跳跃（#layout-delay）
      if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
      else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
      else if (this._layoutMode === 'single') { this._isNarrowLayout = false; this.activePane = 'remote' }
      else this._updateAutoLayout()
      void host.offsetHeight // 强制回流，确保 .sftp-body 尺寸已更新
      this._applyPaneSplit()
    }
    this.cdr.detectChanges()
    this._scheduleLayoutRefresh()
    this._persistPanelGeometry()
  }

  /** 打开 Tabby 设置并定位到 SFTP+ 页面 */
  openPluginSettings(): void {
    this.zone.run(() => {
      try {
        const app = this.injector.get(AppService)
        openSftpPlusSettings(app)
      } catch (e) {
        log.error('openPluginSettings failed', e)
      }
    })
  }

  // ========== 连接管理（委托 panel/connection-lifecycle） ==========
  async connect(): Promise<void> {
    await this._connLifecycle.connect()
    if (this.pathMode === 'sync' && this.connected) {
      this._startCwdSync()
      void this._syncRemoteToTerminalCwd(true)
    }
  }

  disconnect(): void {
    this._stopCwdSync()
    this._connLifecycle?.disconnect()
  }

  onReconnect(): Promise<void> {
    return this._reconnectKeepingSync()
  }

  private async _reconnectKeepingSync(): Promise<void> {
    await this._connLifecycle.reconnect()
    if (this.pathMode === 'sync' && this.connected) {
      this._cwdSetupPrompted = false
      this._startCwdSync()
      void this._syncRemoteToTerminalCwd(true)
    }
  }

  /** 清空远程列表与 uid 映射（断开/会话失效时调用） */
  clearRemoteListing(): void {
    // ★ 2026-07-25：B4 修复——递增刷新代际，使断连时在途的 refreshRemote 因 gen 不匹配而丢弃结果，
    //   避免过期远程列表在断开后被写回（本地刷新侧已有 _localRefreshGen++，远端此前遗漏）。
    this._remoteRefreshGen++
    this.remoteEntries = []
    this._remoteError = false
    this._invalidateRemoteCache()
    this.remoteIdResolver.reset()
  }

  private _clearPanelTimers(): void {
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null }
    if (this._remoteLoadingTimer) { clearTimeout(this._remoteLoadingTimer); this._remoteLoadingTimer = null }
    if (this._remoteFlashTimer) { clearTimeout(this._remoteFlashTimer); this._remoteFlashTimer = null }
    if (this._localFlashTimer) { clearTimeout(this._localFlashTimer); this._localFlashTimer = null }
  }

  /**
   * 冲突解决：将本地目录合并上传到远程目标路径（覆盖同名文件）
   */
  async mergeLocalDirToRemote(localSrc: string, remoteDest: string): Promise<void> {
    return this._transferCoordinator.mergeLocalDirToRemote(localSrc, remoteDest)
  }

  private _remoteEnrichOptions(): SftpEnrichOptions {
    const wantOwner = this.remoteShowColOwner || this.remoteShowColGroup
    return {
      atime: this.remoteShowColAccess,
      ownerGroup: wantOwner,
      statFallback: false,
    }
  }

  private _remoteNeedsEnrich(): boolean {
    return this.remoteShowColAccess
      || this.remoteShowColOwner
      || this.remoteShowColGroup
  }

  private async _enrichRemoteMetadata(
    snapshotPath: string,
    baseEntries: SFTPFile[],
    refreshGen: number,
  ): Promise<void> {
    if (!this.connected || !this.sftpSession || this.remotePath !== snapshotPath) return
    if (refreshGen !== this._remoteRefreshGen) return

    let entries = baseEntries
    if (this._remoteNeedsEnrich()) {
      entries = await enrichSftpFilesWithAtime(
        this.sftpSession, snapshotPath, baseEntries, this._remoteEnrichOptions(),
      )
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._invalidateRemoteCache()
        this.cdr.detectChanges()
      })
    }

    const wantOwner = this.remoteShowColOwner || this.remoteShowColGroup
    // ★ 2026-07-25 B7：超大目录（超阈值）跳过按条目 stat 的 owner 补全，
    //   避免产生 N 次网络 stat 风暴把 UI 卡死；仅渲染廉价的 atime 补全（上方已完成）。
    //   注：数万级条目的渲染卡顿仍需虚拟滚动（架构级），此处为低风险缓解。
    const hugeDir = entries.length > SftpFloatingPanel.REMOTE_LISTING_ENRICH_LIMIT
    if (wantOwner && !this.remoteIdResolver.remoteExecDisabled && !hugeDir) {
      entries = await enrichRemoteOwnersViaStat(this.sftpSession, entries)
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._invalidateRemoteCache()
        this.cdr.detectChanges()
      })
    }

    if (!wantOwner || !this.sshSession) return
    await this.remoteIdResolver.ensureUidMap(this.sshSession)
    if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
    const named = this.applyRemoteOwnerGroupNames(entries)
    this.zone.run(() => {
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.remoteEntries = named
      this._invalidateRemoteCache()
      this.cdr.detectChanges()
    })
  }

  private getDefaultRemotePath(): string {
    return '/'
  }

  private applyRemoteOwnerGroupNames(entries: SFTPFile[]): SFTPFile[] {
    const r = this.remoteIdResolver
    return entries.map(e => {
      const ownerUid = e.ownerUid ?? this.numericIdFromLabel(e.owner)
      const groupGid = e.groupGid ?? this.numericIdFromLabel(e.group)
      const ownerLabel = this.nonNumericLabel(e.owner)
      const groupLabel = this.nonNumericLabel(e.group)
      return {
        ...e,
        ownerUid,
        groupGid,
        owner: r.ownerName(ownerLabel, ownerUid),
        group: r.groupName(groupLabel, groupGid),
      }
    })
  }

  private nonNumericLabel(v: unknown): string | undefined {
    if (v == null) return undefined
    const s = String(v).trim()
    return s && !/^\d+$/.test(s) ? s : undefined
  }

  private numericIdFromLabel(v: unknown): number | undefined {
    if (v == null) return undefined
    const s = String(v).trim()
    if (!/^\d+$/.test(s)) return undefined
    const n = parseInt(s, 10)
    return Number.isNaN(n) ? undefined : n
  }

  // ========== 本地文件 ==========
  async refreshLocal(): Promise<void> {
    this.localPathInput = this.localPath
    if (!this.localPath || typeof this.localPath !== 'string') {
      log.warn('refreshLocal skipped: localPath is invalid')
      return
    }
    const gen = ++this._localRefreshGen
    const requestedPath = this.localPath
    // 刷新时不显示 loading 动画（避免布局 reflow 导致晃动），直接用闪烁反馈
    this._localFlash = false
    // this.cdr.detectChanges()  // 去掉强制变更检测，避免重绘抖动
    try {
      const names = await fs.readdir(requestedPath)
      if (gen !== this._localRefreshGen) return
      const needOwner = this.localShowColOwner || this.localShowColGroup
      // 并行 stat，分批（每批 100）避免压垮文件系统
      const BATCH = 100
      const statResults: (import('fs').Stats | null)[] = []
      for (let i = 0; i < names.length; i += BATCH) {
        const batch = names.slice(i, i + BATCH)
        const results = await Promise.all(
          batch.map(name => fs.stat(path.join(requestedPath, name)).catch(() => null))
        )
        if (gen !== this._localRefreshGen) return
        statResults.push(...results)
      }
      const entries: LocalEntry[] = []
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        const fp = path.join(requestedPath, name)
        const st = statResults[i]
        if (st) {
          entries.push({
            name, fullPath: fp,
            isDirectory: st.isDirectory(),
            mode: st.mode, size: st.size,
            mtimeMs: st.mtimeMs, atimeMs: st.atimeMs,
            birthtimeMs: st.birthtimeMs,
            owner: needOwner ? st.uid : undefined,
            group: needOwner ? st.gid : undefined,
          })
        } else {
          entries.push({ name, fullPath: fp, isDirectory: true, inaccessible: true })
        }
      }
      // 丢弃过期结果：路径已变更则不写入
      if (gen !== this._localRefreshGen) return
      if (this.localPath !== requestedPath) return
      this.zone.run(() => { this.localEntries = entries; this._localError = false; this._invalidateLocalCache() })
      if (needOwner) {
        void this._enrichLocalOwnerNames(entries)
      }
    } catch (e) {
      if (gen !== this._localRefreshGen) return
      log.error('Local listing failed', e)
      this.zone.run(() => { this.localEntries = []; this._localError = true; this._invalidateLocalCache() })
    }
    if (gen !== this._localRefreshGen) return
    this._localFlash = true
    this.cdr.detectChanges()
    if (this._localFlashTimer) clearTimeout(this._localFlashTimer)
    this._localFlashTimer = setTimeout(() => { this._localFlash = false; this._localFlashTimer = null }, 260)
  }

  private async _enrichLocalOwnerNames(baseEntries: LocalEntry[]): Promise<void> {
    const snapshotPath = this.localPath
    await this.localIdResolver.ensureLocalMaps()
    if (this.localPath !== snapshotPath) return
    const enriched = baseEntries.map(e => ({
      ...e,
      owner: typeof e.owner === 'number'
        ? this.localIdResolver.ownerName(undefined, e.owner)
        : e.owner,
      group: typeof e.group === 'number'
        ? this.localIdResolver.groupName(undefined, e.group)
        : e.group,
    }))
    this.zone.run(() => {
      if (this.localPath !== snapshotPath) return
      this.localEntries = enriched
      this._invalidateLocalCache()
      this.cdr.detectChanges()
    })
  }

  canLocalUp(): boolean {
    if (!this.localPath || typeof this.localPath !== 'string') return false
    return path.dirname(this.localPath) !== this.localPath
  }

  canRemoteUp(): boolean {
    if (!this.remotePath || typeof this.remotePath !== 'string') return false
    return this.remotePath !== '/'
  }

  localUp(): void { this._paneUp('local') }

  goLocalHome(): void { this._paneGoHome('local') }

  /** 统一上级目录导航 */
  private _paneUp(side: 'local' | 'remote'): void {
    if (side === 'local') {
      const parent = path.dirname(this.localPath)
      if (parent !== this.localPath) {
        this._pushLocalNav(parent); this.localPath = parent; this.localPathInput = parent
        this.saveCurrentPath(); void this.refreshLocal()
      }
    } else {
      if (!this.connected || this.remotePath === '/') return
      const next = path.posix.dirname(this.remotePath)
      const dest = next === '.' ? '/' : next
      this._pushRemoteNav(dest); this.remotePath = dest; this.remotePathInput = this.remotePath
      this.saveCurrentPath(); void this.refreshRemote()
    }
  }

  /** 统一回到主目录 */
  private _paneGoHome(side: 'local' | 'remote'): void {
    const home = side === 'local' ? os.homedir() : '/'
    if (side === 'remote' && (!this.connected || !this.sftpSession)) return
    if (side === 'local') this._pushLocalNav(home)
    else this._pushRemoteNav(home)
    if (side === 'local') { this.localPath = home; this.localPathInput = home }
    else { this.remotePath = home; this.remotePathInput = home }
    this.saveCurrentPath()
    if (side === 'local') void this.refreshLocal()
    else void this.refreshRemote()
  }

  goToLocalPathInput(): void {
    const target = this.normalizeLocalPath(this.localPathInput || this.localPath)
    if (target === this.localPath) return
    this._pushLocalNav(target)
    this.localPath = target
    this.localPathInput = this.localPath
    this.saveCurrentPath()
    void this.refreshLocal()
  }

  private normalizeLocalPath(p: string): string {
    if (!p) return this.localPath
    return path.isAbsolute(p) ? p : path.join(this.localPath, p)
  }

  // ========== 远程文件 ==========
  async refreshRemote(): Promise<boolean> {
    if (!this.connected || !this.sftpSession) return false
    const refreshGen = ++this._remoteRefreshGen
    this.remotePathInput = this.remotePath
    if (!this.remotePath || typeof this.remotePath !== 'string') {
      log.warn('refreshRemote skipped: remotePath is invalid, resetting to /')
      this.remotePath = '/'
      this.remotePathInput = '/'
    }
    this._remoteFlash = false

    if (this._remoteLoadingTimer) {
      clearTimeout(this._remoteLoadingTimer)
      this._remoteLoadingTimer = null
    }
    this._remoteLoadingTimer = setTimeout(() => {
      if (refreshGen !== this._remoteRefreshGen) return
      this._remoteLoading = true
      this.cdr.detectChanges()
    }, 150)

    const snapshotPath = this.remotePath
    try {
      const entries = await this.sftpSession.readdir(snapshotPath)
      if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return true
      if (this._remoteLoadingTimer) {
        clearTimeout(this._remoteLoadingTimer)
        this._remoteLoadingTimer = null
      }
      this._remoteLoading = false
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._remoteError = false
        this._invalidateRemoteCache()
      })
      if (this._remoteNeedsEnrich()) {
        void this._enrichRemoteMetadata(snapshotPath, entries, refreshGen)
      }
    } catch (e) {
      if (refreshGen !== this._remoteRefreshGen) return false
      if (this._remoteLoadingTimer) {
        clearTimeout(this._remoteLoadingTimer)
        this._remoteLoadingTimer = null
      }
      this._remoteLoading = false
      log.error('Remote listing failed', e)
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = []
        this._remoteError = true
        this._invalidateRemoteCache()
      })
      this.cdr.detectChanges()
      return false
    }
    if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return true
    this._remoteFlash = true
    this.cdr.detectChanges()
    if (this._remoteFlashTimer) clearTimeout(this._remoteFlashTimer)
    this._remoteFlashTimer = setTimeout(() => {
      this._remoteFlash = false
      this._remoteFlashTimer = null
    }, 260)
    return true
  }

  // ========== 远程导航历史 ==========

  /**
   * 将路径加入导航历史（后退/前进用）
   */
  protected _pushRemoteNav(newPath: string): void {
    this._remoteNav.push(newPath, this._ignoreNavPush)
  }

  /** 后退 */
  async remoteBack(): Promise<void> { await this._paneNavToTarget('remote', 'back') }

  /** 前进 */
  async remoteForward(): Promise<void> { await this._paneNavToTarget('remote', 'forward') }

  /** 统一导航到历史目标 */
  private async _paneNavToTarget(side: 'local' | 'remote', dir: 'back' | 'forward'): Promise<void> {
    const nav = side === 'local' ? this._localNav : this._remoteNav
    const canGo = side === 'local' ? (dir === 'back' ? this.canLocalBack : this.canLocalForward)
                                   : (dir === 'back' ? this.canRemoteBack : this.canRemoteForward)
    if (!canGo) return
    const target = dir === 'back' ? nav.back() : nav.forward()
    if (!target) {
      log.warn(`${side}Nav ${dir}: history entry invalid, aborting`)
      return
    }
    if (side === 'local') {
      this._ignoreLocalNavPush = true
      this.localPath = target; this.localPathInput = target
      this.saveCurrentPath(); void this.refreshLocal()
      this._ignoreLocalNavPush = false
    } else {
      this._ignoreNavPush = true
      this.remotePath = target; this.remotePathInput = target
      this.saveCurrentPath(); await this.refreshRemote()
      this._ignoreNavPush = false
    }
  }

  remoteUp(): void { this._paneUp('remote') }

  goRemoteHome(): void { this._paneGoHome('remote') }

  goToRemotePathInput(): void {
    if (!this.connected) return
    const target = this.normalizeRemotePath(this.remotePathInput || '/')
    if (target === this.remotePath) return
    this._pushRemoteNav(target)
    this.remotePath = target
    this.remotePathInput = this.remotePath
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  private normalizeRemotePath(p: string): string {
    if (!p) return '/'
    let r = p.trim()
    if (!r.startsWith('/')) r = '/' + r
    // 折叠连续斜杠并解析 .. / . 段，防止路径遍历
    r = path.posix.normalize(r.replace(/\/+/g, '/'))
    if (!r.startsWith('/')) r = '/' + r
    return r
  }

  // ========== 本地导航历史 ==========

  /**
   * 将本地路径加入导航历史（后退/前进用）
   */
  protected _pushLocalNav(newPath: string): void {
    this._localNav.push(newPath, this._ignoreLocalNavPush)
  }

  /** 后退 */
  localBack(): void { this._paneNavToTarget('local', 'back') }

  /** 前进 */
  localForward(): void { this._paneNavToTarget('local', 'forward') }

  /**
   * 鼠标侧键导航（本地面板）
   *  - button === 3：后退（XButton1 / 鼠标上一页）
   *  - button === 4：前进（XButton2 / 鼠标下一页）
   * 仅当面板可见且非最小化时生效；左键(button 0)等不做处理并保留冒泡。
   */
  onPaneMouseNav(side: 'local' | 'remote', event: MouseEvent): void {
    if (!this._isPanelActive) return
    if (event.button === 3) {
      event.preventDefault()
      event.stopPropagation()
      if (side === 'local') this.localBack()
      else this.remoteBack()
    } else if (event.button === 4) {
      event.preventDefault()
      event.stopPropagation()
      if (side === 'local') this.localForward()
      else this.remoteForward()
    }
  }

  // ========== 框选（委托 panel/panel-rubber-band） ==========
  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._rubberBand.onPaneListClick(event, pane)
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._commitAllPathInputs()
    this._rubberBand.onPaneMouseDown(event, pane)
  }

  /** 失焦或点击列表时：放弃未提交的编辑，恢复为当前路径 */
  onLocalPathBlur(): void {
    this.localPathInput = this.localPath
  }

  onRemotePathBlur(): void {
    this.remotePathInput = this.remotePath
  }

  private _commitAllPathInputs(): void {
    const root = this.elRef.nativeElement as HTMLElement
    root.querySelectorAll('.path-input').forEach(node => {
      const inp = node as HTMLInputElement
      if (document.activeElement === inp) inp.blur()
    })
    this.localPathInput = this.localPath
    this.remotePathInput = this.remotePath
  }

  // ========== 窄屏上下布局分割线 ==========

  /** 根据当前布局应用面板分割比例 */
  private _applyPaneSplit(): void {
    if (!this.elRef?.nativeElement) return
    const body = this.elRef.nativeElement.querySelector('.sftp-body') as HTMLElement | null
    if (!body) return
    const panes: HTMLElement[] = Array.from(body.querySelectorAll(':scope > sftp-file-pane'))
    if (panes.length < 1) return

    // 单栏模式：仅远程面板全宽
    if (this._layoutMode === 'single') {
      body.style.flexDirection = 'row'
      body.classList.remove('narrow-layout')
      const remote = panes[panes.length - 1]
      remote.style.flex = '1'
      remote.style.width = 'auto'
      remote.style.minWidth = '0'
      remote.style.height = ''
      return
    }

    if (panes.length < 2) return

    // 设置 flex-direction：用 JS 控制，避免 CSS @media 使用视口宽度与元素宽度不同步
    // （panelHost width:96% 导致元素宽度 < 视口宽度，阈值区 961-1000px 时会错位）
    body.style.flexDirection = this._isNarrowLayout ? 'column' : 'row'
    // 窄屏 class 控制分割线样式（cursor、width/height），同步于布局而非视口
    body.classList.toggle('narrow-layout', this._isNarrowLayout)

    // 清除之前可能残留的内联样式（防止宽窄切换后样式残留）
    panes.forEach(p => { p.style.flex = ''; p.style.width = ''; p.style.height = '' })

    const splitterSize = 5
    const { w: bodyW, h: bodyH } = this._measureBodySize(body)

    if (this._isNarrowLayout) {
      // 窄屏上下布局：按比例分配高度
      panes[0].style.flex = 'none'
      panes[0].style.height = Math.max(80, (bodyH - splitterSize) * this._verticalSplitRatio) + 'px'
      panes[1].style.flex = '1'
      panes[1].style.minHeight = '80px'
    } else {
      // 宽屏左右布局：按比例分配宽度，最小宽度 450px
      const minPaneW = 450
      // 先按比例计算本地面板宽度
      let w0 = Math.round((bodyW - splitterSize) * this._horizontalSplitRatio)
      // 约束两侧都不小于最小宽度
      if (w0 < minPaneW) w0 = minPaneW
      if (w0 > bodyW - splitterSize - minPaneW) w0 = bodyW - splitterSize - minPaneW
      // 更新 ratio 使之与真实分配一致
      this._horizontalSplitRatio = w0 / (bodyW - splitterSize)
      panes[0].style.flex = 'none'
      panes[0].style.width = w0 + 'px'
      panes[1].style.flex = '1'
      panes[1].style.minWidth = minPaneW + 'px'
    }
  }

  /** 分割线按下 */
  onSplitterDown(ev: MouseEvent): void {
    ev.preventDefault()
    this._splitterDidDrag = false
    this._splitDragStartX = ev.clientX
    this._splitDragStartY = ev.clientY
    this._splitDragStartRatio = this._isNarrowLayout ? this._verticalSplitRatio : this._horizontalSplitRatio

    const body = this.elRef.nativeElement.querySelector('.sftp-body')
    if (!body) return
    const bodyH = body.clientHeight
    const bodyW = body.clientWidth

    // 给分割线加 active 样式
    const splitterEl = ev.currentTarget as HTMLElement
    splitterEl.classList.add('active')

    this._splitMoveHandler = (e: MouseEvent): void => {
      if (Math.abs(e.clientX - this._splitDragStartX) > 3 || Math.abs(e.clientY - this._splitDragStartY) > 3) {
        this._splitterDidDrag = true
      }
      if (this._isNarrowLayout) {
        const delta = e.clientY - this._splitDragStartY
        this._verticalSplitRatio = Math.max(0.15, Math.min(0.85, this._splitDragStartRatio + delta / bodyH))
      } else {
        const delta = e.clientX - this._splitDragStartX
        this._horizontalSplitRatio = Math.max(0.15, Math.min(0.85, this._splitDragStartRatio + delta / bodyW))
      }
      this._applyPaneSplit()
    }
    this._splitUpHandler = (_e: MouseEvent): void => {
      splitterEl.classList.remove('active')
      document.removeEventListener('mousemove', this._splitMoveHandler!)
      document.removeEventListener('mouseup', this._splitUpHandler!)
      this._splitMoveHandler = null
      this._splitUpHandler = null
      // 持久化比例
      const key = this._isNarrowLayout ? 'sftp-plus-vertical-split-ratio' : 'sftp-plus-horizontal-split-ratio'
      const val = this._isNarrowLayout ? this._verticalSplitRatio : this._horizontalSplitRatio
      try { this._paneSet(key, String(val)) } catch {}
    }
    document.addEventListener('mousemove', this._splitMoveHandler)
    document.addEventListener('mouseup', this._splitUpHandler)
  }

  onSplitterDblClick(ev: MouseEvent): void {
    ev.preventDefault()
    if (this._splitterDidDrag) {
      this._splitterDidDrag = false
      return
    }
    this.resetSplitter()
  }

  /** 双击分割线恢复默认大小 */
  resetSplitter(): void {
    this._verticalSplitRatio = 0.5
    this._horizontalSplitRatio = 0.5
    this._applyPaneSplit()
    try {
      this._paneSet('sftp-plus-vertical-split-ratio', '0.5')
      this._paneSet('sftp-plus-horizontal-split-ratio', '0.5')
    } catch {}
  }

  // ========== 选择 ==========
  /** 将列表行 DOM 的 selected 类与当前选中模型对齐（框选会直接改 DOM，需兜底） */
  syncPaneSelectionVisual(pane: 'local' | 'remote'): void {
    const listEl = this.elRef.nativeElement.querySelector(`.pane-list.${pane}-pane`) as HTMLElement | null
    if (!listEl) return
    const paths = pane === 'local' ? this._localSelectedPaths : this._remoteSelectedPaths
    listEl.querySelectorAll('.entry[data-path]').forEach(el => {
      const p = el.getAttribute('data-path')
      if (p && paths.has(p)) el.classList.add('selected')
      else el.classList.remove('selected')
    })
  }

  selectLocal(entry: LocalEntry, event: MouseEvent, idx: number): void {
    if (this.selectedRemote.length > 0) this.selectedRemote = []
    const r = computeSelection(this.selectedLocal, entry, event, idx, this.localLastSelectedIndex, this.getFilteredLocalEntries(), this._localSelectedPaths)
    this.selectedLocal = r.selection; this.localLastSelectedIndex = r.lastIndex
    this.syncPaneSelectionVisual('local')
    this.cdr.detectChanges()
  }

  isLocalSelected(e: LocalEntry): boolean { return this._localSelectedPaths.has(e.fullPath) }

  selectRemote(entry: SFTPFile, event: MouseEvent, idx: number): void {
    if (this.selectedLocal.length > 0) this.selectedLocal = []
    const r = computeSelection(this.selectedRemote, entry, event, idx, this.remoteLastSelectedIndex, this.getFilteredRemoteEntries(), this._remoteSelectedPaths)
    this.selectedRemote = r.selection; this.remoteLastSelectedIndex = r.lastIndex
    this.syncPaneSelectionVisual('remote')
    this.cdr.detectChanges()
  }

  isRemoteSelected(e: SFTPFile): boolean { return this._remoteSelectedPaths.has(e.fullPath) }

  // ========== 排序 ==========
  setLocalSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    const r = computeSortToggle(this.localSortBy, this.localSortAsc, f, this._colJustResized)
    if (!r) return
    this.localSortBy = r.by; this.localSortAsc = r.asc
    this._invalidateLocalCache()
    try { this._paneSet('sftp-plus-local-sort', JSON.stringify({ by: r.by, asc: r.asc })) } catch {}
  }

  setRemoteSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    if (f === 'birthtime') return
    const r = computeSortToggle(this.remoteSortBy, this.remoteSortAsc, f, this._colJustResized)
    if (!r) return
    this.remoteSortBy = r.by; this.remoteSortAsc = r.asc
    this._invalidateRemoteCache()
    try { this._paneSet('sftp-plus-remote-sort', JSON.stringify({ by: r.by, asc: r.asc })) } catch {}
  }

  // ========== 过滤 ==========

  private _applyFilter(side: 'local' | 'remote'): void {
    if (side === 'local') { this.localFilter = this.localFilterPending; this.localFilterVisible = false; this._invalidateLocalCache() }
    else { this.remoteFilter = this.remoteFilterPending; this.remoteFilterVisible = false; this._invalidateRemoteCache() }
  }

  private _clearFilter(side: 'local' | 'remote'): void {
    if (side === 'local') { this.localFilterPending = ''; this.localFilter = ''; this.localFilterVisible = false; this._invalidateLocalCache() }
    else { this.remoteFilterPending = ''; this.remoteFilter = ''; this.remoteFilterVisible = false; this._invalidateRemoteCache() }
  }

  /** 应用本地过滤（pending → actual）并隐藏输入框 */
  applyLocalFilter(): void { this._applyFilter('local') }

  /** 清空本地过滤并隐藏输入框 */
  clearLocalFilter(): void { this._clearFilter('local') }

  /** 应用远程过滤（pending → actual）并隐藏输入框 */
  applyRemoteFilter(): void { this._applyFilter('remote') }

  /** 清空远程过滤并隐藏输入框 */
  clearRemoteFilter(): void { this._clearFilter('remote') }

  // ========== 过滤结果缓存（P1-10：避免每次变更检测重复计算） ==========
  private _localFilteredCache: LocalEntry[] | null = null
  private _localFilterDirty = true
  private _remoteFilteredCache: SFTPFile[] | null = null
  private _remoteFilterDirty = true
  // 记录各面板 _cells 预计算时使用的 date pattern；命中缓存时若与当前 pattern 不一致则重算，
  // 确保自定义时间格式在任意时序/缓存窗口下对本地、远程时间列统一生效
  private _decoratedLocalPattern = ''
  private _decoratedRemotePattern = ''

  protected _invalidateLocalCache(): void { this._localFilterDirty = true }
  protected _invalidateRemoteCache(): void { this._remoteFilterDirty = true }

  /** trackBy 函数：避免 *ngFor 每次变更检测重建所有 DOM 节点 */
  trackLocalEntryBy(_index: number, item: LocalEntry): string { return item.fullPath }
  trackRemoteEntryBy(_index: number, item: SFTPFile): string { return item.fullPath }

  /**
   * 需要预计算显示串的数据列（不含 name，name 走模板独立绑定）。
   */
  private readonly _cellCols = ['size', 'date', 'created', 'perms', 'mode', 'access', 'owner', 'group', 'path', 'ext']

  /**
   * 功能描述：为每个 entry 预计算各列显示串并挂到 e._cells，供模板直接查表绑定，
   *          避免文件列表模板在每次变更检测里逐格调用 colValue（内部含 formatSize/formatDate）。
   *          显示串是纯函数（仅依赖 entry 原始数据，与语言/主题/设置无关），
   *          因此只需随过滤缓存一同失效（entries/过滤/排序变化时重建），无需在语言切换时重算。
   * 创建人：DD1024z + Hy3
   * 创建时间：2026-07-23
   */
  private _decorateCells(list: any[]): void {
    for (const e of list) {
      const cells: Record<string, string> = {}
      for (const col of this._cellCols) cells[col] = this.colValue(col, e)
      e._cells = cells
    }
  }

  getFilteredLocalEntries(): LocalEntry[] {
    if (!this._localFilterDirty && this._localFilteredCache) {
      // 自定义时间格式可能在缓存构建后变化（设置页修改 / 初始化时序），
      // 若当前 pattern 与装饰时不一致，重算 _cells（本地、远程统一处理）
      if (getDateFormatPattern() !== this._decoratedLocalPattern) {
        this._decorateCells(this._localFilteredCache)
        this._decoratedLocalPattern = getDateFormatPattern()
      }
      return this._localFilteredCache
    }
    let entries = filterByHidden([...this.localEntries], this.showHiddenLocal)
    entries = filterByName(entries, this.localFilter)
    this._localFilteredCache = sortLocalEntries(entries, this.localSortBy, this.localSortAsc, this.pinFoldersLocal)
    this._decorateCells(this._localFilteredCache)
    this._decoratedLocalPattern = getDateFormatPattern()
    this._localFilterDirty = false
    return this._localFilteredCache
  }

  getFilteredRemoteEntries(): SFTPFile[] {
    if (!this._remoteFilterDirty && this._remoteFilteredCache) {
      if (getDateFormatPattern() !== this._decoratedRemotePattern) {
        this._decorateCells(this._remoteFilteredCache)
        this._decoratedRemotePattern = getDateFormatPattern()
      }
      return this._remoteFilteredCache
    }
    let entries = filterByHidden([...this.remoteEntries], this.showHiddenRemote)
    entries = filterByName(entries, this.remoteFilter)
    this._remoteFilteredCache = sortRemoteEntries(entries, this.remoteSortBy, this.remoteSortAsc, this.pinFoldersRemote)
    this._decorateCells(this._remoteFilteredCache)
    this._decoratedRemotePattern = getDateFormatPattern()
    this._remoteFilterDirty = false
    return this._remoteFilteredCache
  }

  // ========== 打开 ==========
  /** 单击处理：统一逻辑，避免与双击冲突 */
  private _onPaneClick(side: 'local' | 'remote', entry: { fullPath: string }, event: MouseEvent, idx: number, selectFn: () => void): void {
    this.activePane = side
    if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
    if (side === 'local') {
      if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
      this.localClickTimer = setTimeout(() => { this.localClickTimer = null }, 250)
    } else {
      if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
      this.remoteClickTimer = setTimeout(() => { this.remoteClickTimer = null }, 250)
    }
    selectFn()
  }

  onLocalClick(entry: LocalEntry, event: MouseEvent, idx: number): void {
    this._onPaneClick('local', entry, event, idx, () => this.selectLocal(entry, event, idx))
  }

  /**
   * 通过 POSIX mode 位判断是否为目录
   * 功能描述：用 (mode & S_IFMT) === S_IFDIR 检测，比 isDirectory 更可靠
   *          因为 Windows SFTP 对 junction/reparse point 目录可能误报 isDirectory = false
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-22
   */
  private isDirByMode = isDirByMode

  openLocal(e: LocalEntry, $event?: MouseEvent): void {
    // 取消单击计时器
    if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
    if ($event) $event.preventDefault()
    // isDirectory 优先，mode 位作为兜底
    if (!e.isDirectory && !this.isDirByMode(e.mode)) return
    this._pushLocalNav(e.fullPath)
    this.localPath = e.fullPath
    this.localPathInput = e.fullPath
    this.saveCurrentPath()
    void this.refreshLocal()
  }

  /** 本地双击：文件夹进入；文件=查看；Ctrl/Cmd+双击=系统打开 */
  onLocalEntryDblClick(e: LocalEntry, $event?: MouseEvent): void {
    if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
    if ($event) $event.preventDefault()
    if (e.isDirectory || this.isDirByMode(e.mode)) {
      this.openLocal(e)
      return
    }
    const openInSystem = !!($event && (os.platform() === 'darwin' ? $event.metaKey : $event.ctrlKey))
    if (openInSystem) {
      this._openPathInSystem(e.fullPath, { waitForModRelease: true })
      return
    }
    void this._viewLocalFile(e)
  }

  /** 远程面板双击进入目录（或文件选择逻辑） */
  openRemote(e: SFTPFile, $event?: MouseEvent): void {
    if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
    if ($event) $event.preventDefault()
    // isDirectory 优先，mode 位作为兜底（Windows SFTP 对 junction/reparse point 目录可能误判）
    if (!this.connected || (!e.isDirectory && !this.isDirByMode(e.mode))) return
    this._pushRemoteNav(e.fullPath)
    this.remotePath = e.fullPath
    this.remotePathInput = e.fullPath
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  /** 远程双击：文件夹进入；文件=查看；Ctrl/Cmd+双击=下载到临时目录后系统打开 */
  onRemoteEntryDblClick(e: SFTPFile, $event?: MouseEvent): void {
    if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
    if ($event) $event.preventDefault()
    if (!this.connected) return
    if (e.isDirectory || this.isDirByMode(e.mode)) {
      this.openRemote(e)
      return
    }
    const openInSystem = !!($event && (os.platform() === 'darwin' ? $event.metaKey : $event.ctrlKey))
    if (openInSystem) {
      void this._openRemoteInSystem(e)
      return
    }
    void this._viewRemoteFile(e)
  }

  /** 远程面板单击处理 */
  onRemoteClick(entry: SFTPFile, event: MouseEvent, idx: number): void {
    this._onPaneClick('remote', entry, event, idx, () => this.selectRemote(entry, event, idx))
  }


  // ========== 子组件桥接 ==========
  colHeaderLabelFn = (col: string) => this.colHeaderLabel(col)
  // P1-perf：优先读预计算的 e._cells（廉价查表）；缺失时回退到实时计算，保证正确性
  colValueFn = (col: string, e: any) => (e && e._cells && col in e._cells) ? e._cells[col] : this.colValue(col, e)
  isLocalSelectedFn = (e: LocalEntry) => this.isLocalSelected(e)
  isRemoteSelectedFn = (e: SFTPFile) => this.isRemoteSelected(e)
  localSortArrowFn = (col: string) => this.sortArrow(col, 'local')
  remoteSortArrowFn = (col: string) => this.sortArrow(col, 'remote')

  get detailsDisplay(): DetailsDisplay | null {
    const e = this.detailsEntry
    if (!e) return null
    return {
      name: e.name,
      type: e.isDirectory ? this.i18n.t('type.folder') : (this.getFileExt(e.name) || this.i18n.t('type.file')),
      path: this.getEntryPath(e),
      size: e.isDirectory ? undefined : this.formatSize(this.getEntrySize(e)),
      modified: this.formatDate(this.getEntryMtime(e)),
      created: this.getEntryBirthtimeMs(e) ? this.formatDate(this.getEntryBirthtimeMs(e)) : undefined,
      accessed: this.getEntryAtimeMs(e) ? this.formatDate(this.getEntryAtimeMs(e)) : undefined,
      perms: this.getEntryMode(e) != null
        ? this.formatMode(this.getEntryMode(e)) + ' (' + this.formatOctalMode(this.getEntryMode(e)) + ')'
        : undefined,
      owner: this.getEntryOwner(e) != null ? String(this.getEntryOwner(e)) : undefined,
      group: this.getEntryGroup(e) != null ? String(this.getEntryGroup(e)) : undefined,
    }
  }

  getLocalSelectionInfo(): string {
    const count = this.getFilteredLocalEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this.selectedLocal.length) {
      const sizePart = this.formatSelectedSizeLocal()
        + (this.selectedHasDirLocal() ? this.i18n.t('pane.exclFolders') : '')
      s += this.i18n.t('pane.selectedInfo', { n: this.selectedLocal.length, size: sizePart })
    }
    return s
  }

  getRemoteSelectionInfo(): string {
    const count = this.getFilteredRemoteEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this.selectedRemote.length) {
      const sizePart = this.formatSelectedSizeRemote()
        + (this.selectedHasDirRemote() ? this.i18n.t('pane.exclFolders') : '')
      s += this.i18n.t('pane.selectedInfo', { n: this.selectedRemote.length, size: sizePart })
    }
    return s
  }

  onLocalPaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this.localBack(); break
      case 'forward': this.localForward(); break
      case 'up': this.localUp(); break
      case 'home': this.goLocalHome(); break
      case 'refresh': void this.refreshLocal(); break
      case 'toggleFilter': this.localFilterVisible = !this.localFilterVisible; break
    }
  }

  onRemotePaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this.remoteBack(); break
      case 'forward': this.remoteForward(); break
      case 'up': this.remoteUp(); break
      case 'home': this.goRemoteHome(); break
      case 'refresh': void this.refreshRemote(); break
      case 'toggleFilter': this.remoteFilterVisible = !this.remoteFilterVisible; break
    }
  }

  onLocalSort(e: PaneSortAction): void { this.setLocalSort(e.col as any) }
  onRemoteSort(e: PaneSortAction): void { this.setRemoteSort(e.col as any) }

  onContextMenuAction(action: ContextMenuAction): void {
    switch (action) {
      case 'newFolder': this.ctxNewFolder(); break
      case 'newFile': this.ctxNewFile(); break
      case 'rename': this.ctxRename(); break
      case 'delete': this.ctxDelete(); break
      case 'openLocal': this.ctxOpenLocal(); break
      case 'viewFile': void this.ctxViewFile(); break
      case 'editFile': void this.ctxEditFile(); break
      case 'upload': void this.ctxUpload(); break
      case 'download': void this.ctxDownload(); break
      case 'revealInExplorer': this.ctxRevealInExplorer(); break
      case 'chmod': this.ctxChmod(); break
      case 'details': this.ctxDetails(); break
      case 'copy': this.ctxClipboardCopy(); break
      case 'cut': this.ctxClipboardCut(); break
      case 'paste': this.ctxClipboardPaste(); break
      case 'refresh': this.ctxRefresh(); break
      case 'selectAll': this.ctxSelectAll(); break
      case 'selectInvert': this.ctxSelectInvert(); break
      case 'copyPath': this.ctxCopyPath(); break
    }
  }

  onHeaderMenuAction(action: HeaderMenuAction): void {
    if (action === 'adjustCol') { this.adjustColumnWidth(); return }
    if (action === 'adjustAllCols') { this.adjustAllColumnsWidth(); return }
    if (action === 'togglePinFolders') { this.togglePinFolders(this.contextMenuPane); return }
    if (action === 'toggleHidden') { this.toggleShowHidden(this.contextMenuPane); return }
    if (action === 'toggleColBorders') { this.toggleColBorders(); return }
    if (action === 'toggleZebra') { this.toggleZebra(); return }
    if (action.startsWith('toggleCol:')) {
      this.toggleColumn(action.slice('toggleCol:'.length), this.contextMenuPane)
    }
  }

  /** Whitelist of property names allowed for dynamic assignment via permission field changes */
  private static readonly _PERM_PROP_WHITELIST = new Set<string>([
    'permOwnerRead', 'permOwnerWrite', 'permOwnerExec',
    'permGroupRead', 'permGroupWrite', 'permGroupExec',
    'permOtherRead', 'permOtherWrite', 'permOtherExec',
  ])

  onPermFieldChange(e: { field: PermField; value: boolean }): void {
    const map: Record<PermField, string> = {
      ownerRead: 'permOwnerRead', ownerWrite: 'permOwnerWrite', ownerExec: 'permOwnerExec',
      groupRead: 'permGroupRead', groupWrite: 'permGroupWrite', groupExec: 'permGroupExec',
      otherRead: 'permOtherRead', otherWrite: 'permOtherWrite', otherExec: 'permOtherExec',
    }
    const prop = map[e.field]
    if (!SftpFloatingPanel._PERM_PROP_WHITELIST.has(prop)) {
      log.warn('Blocked dynamic assignment to non-whitelisted property:', prop)
      return
    }
    ;(this as any)[prop] = e.value
    this.updatePermMode()
  }

  // ========== 格式（委托 panel/panel-format） ==========
  formatSize = formatSize
  formatDate = formatDate
  formatPercent = formatPercent
  formatLogTime = formatLogTime
  formatLogTimeRange = formatLogTimeRange
  formatDuration = formatDuration
  formatSpeedFromSize = formatSpeedFromSize
  getLogFileName = getLogFileName

  formatFailReason(entry: TransferLogEntry): string {
    return formatFailReasonFn(entry, this.i18n.t.bind(this.i18n))
  }


  /** 计算本地选中文件的总大小（含目录不计） */
  formatSelectedSizeLocal(): string {
    const total = this.selectedLocal.reduce((sum, e) => sum + (e.isDirectory ? 0 : (e.size ?? 0)), 0)
    return this.formatSize(total)
  }

  /** 本地选中是否包含目录 */
  selectedHasDirLocal(): boolean {
    return this.selectedLocal.some(e => e.isDirectory)
  }

  /** 计算远程选中文件的总大小（含目录不计） */
  formatSelectedSizeRemote(): string {
    const total = this.selectedRemote.reduce((sum, e) => sum + (e.isDirectory ? 0 : (e.size ?? 0)), 0)
    return this.formatSize(total)
  }

  /** 远程选中是否包含目录 */
  selectedHasDirRemote(): boolean {
    return this.selectedRemote.some(e => e.isDirectory)
  }

  formatMode(mode: number): string {
    // 将数字模式（如 755）转换为 rwxr-xr-x 格式
    const m = mode & 0o777
    const r = (m & 0o400) ? 'r' : '-'
    const w = (m & 0o200) ? 'w' : '-'
    const x = (m & 0o100) ? 'x' : '-'
    const rg = (m & 0o040) ? 'r' : '-'
    const wg = (m & 0o020) ? 'w' : '-'
    const xg = (m & 0o010) ? 'x' : '-'
    const ro = (m & 0o004) ? 'r' : '-'
    const wo = (m & 0o002) ? 'w' : '-'
    const xo = (m & 0o001) ? 'x' : '-'
    return `${r}${w}${x}${rg}${wg}${xg}${ro}${wo}${xo}`
  }

  /** 将 mode 数字转换为八进制权限字符串（如 644、755） */
  formatOctalMode(mode: number): string {
    return (mode & 0o777).toString(8).padStart(3, '0')
  }

  getExt(name: string): string {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.substring(dot + 1).toLowerCase() : ''
  }

  // ========== 拖拽 ==========
  private _normRemoteDir(p: string): string {
    const n = path.posix.normalize(p || '/')
    return n.length > 1 && n.endsWith('/') ? n.slice(0, -1) : n
  }

  private _isInternalSameDirDrag(targetPane: 'local' | 'remote'): boolean {
    return this._fileDnd.isInternalSameDirDrag(targetPane)
  }

  private _resetFileDragState(): void {
    this._fileDnd.reset()
  }

  onEntryDragEnd(): void {
    // 拖拽结束（含拖回原位取消）：立刻中止尚未开始/进行中的预缓存下载
    this._cancelRemoteDragCache()
    this._fileDnd.onEntryDragEnd(() => this._clearCustomDragPreview())
  }

  private _customDragPreviewEl: HTMLElement | null = null

  /**
   * 远程→桌面拖出预缓存策略：
   * - 仅小文件（≤4MB）、延迟启动；目录与大文件绝不在 dragstart 拉全量
   * - dragend / 面板销毁时必须 cancel，否则 SFTP read 会继续占满 SSH，关面板也消不掉
   */
  private static readonly DRAG_CACHE_MAX_BYTES = 4 * 1024 * 1024
  private static readonly DRAG_CACHE_DELAY_MS = 450
  private _dragCacheTimer: ReturnType<typeof setTimeout> | null = null
  private _dragCacheGen = 0
  private _dragCacheTransfers: Array<{ cancel: () => void | Promise<void> }> = []
  private _dragCacheInFlight = new Set<string>()

  private _clearCustomDragPreview(): void {
    if (this._customDragPreviewEl) {
      try { this._customDragPreviewEl.remove() } catch {}
      this._customDragPreviewEl = null
    }
  }

  /** 中止延迟定时器与所有进行中的拖拽预缓存下载 */
  private _cancelRemoteDragCache(): void {
    this._dragCacheGen++
    if (this._dragCacheTimer) {
      clearTimeout(this._dragCacheTimer)
      this._dragCacheTimer = null
    }
    const pending = this._dragCacheTransfers.splice(0)
    for (const t of pending) {
      try { void Promise.resolve(t.cancel()).catch(() => {}) } catch { /* ignore */ }
    }
    this._dragCacheInFlight.clear()
  }

  /** 延迟调度小文件预缓存；快速取消拖拽时定时器会被清掉，不会启动下载 */
  private _scheduleRemoteDragCache(entries: SFTPFile[]): void {
    this._cancelRemoteDragCache()
    const eligible = entries.filter(e =>
      !e.isDirectory
      && (e.size ?? 0) > 0
      && (e.size ?? 0) <= SftpFloatingPanel.DRAG_CACHE_MAX_BYTES,
    )
    if (!eligible.length) return
    const gen = this._dragCacheGen
    this._dragCacheTimer = setTimeout(() => {
      this._dragCacheTimer = null
      if (gen !== this._dragCacheGen) return
      void this._cacheRemoteFilesForDrag(eligible, gen)
    }, SftpFloatingPanel.DRAG_CACHE_DELAY_MS)
  }

  private _setCustomDragPreview(ev: DragEvent, items: Array<{ name: string; isDirectory: boolean }>): void {
    const dt = ev.dataTransfer
    if (!dt || !items.length) return
    this._clearCustomDragPreview()

    const wrap = document.createElement('div')
    wrap.style.position = 'fixed'
    wrap.style.left = '-99999px'
    wrap.style.top = '-99999px'
    wrap.style.pointerEvents = 'none'
    wrap.style.zIndex = '2147483647'
    wrap.style.display = 'inline-flex'
    wrap.style.alignItems = 'center'
    wrap.style.gap = '8px'
    // 左侧多留：叠标不被鼠标指针遮挡；Chromium setDragImage 对 emoji 左缘也易裁切
    wrap.style.padding = '7px 12px 7px 22px'
    wrap.style.borderRadius = '8px'
    wrap.style.border = '1px solid rgba(128,128,128,0.35)'
    wrap.style.background = 'rgba(20, 20, 22, 0.92)'
    wrap.style.color = '#f3f4f6'
    wrap.style.fontSize = '12px'
    wrap.style.lineHeight = '1'
    wrap.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)'
    wrap.style.boxSizing = 'border-box'
    wrap.style.overflow = 'visible'

    if (items.length === 1) {
      const one = items[0]
      const icon = document.createElement('span')
      icon.textContent = one.isDirectory ? '📁' : '📄'
      icon.style.fontSize = '14px'
      icon.style.lineHeight = '1'
      icon.style.flexShrink = '0'
      const name = document.createElement('span')
      name.textContent = one.name
      name.style.maxWidth = '260px'
      name.style.overflow = 'hidden'
      name.style.textOverflow = 'ellipsis'
      name.style.whiteSpace = 'nowrap'
      wrap.appendChild(icon)
      wrap.appendChild(name)
    } else {
      const iconStack = document.createElement('span')
      iconStack.style.position = 'relative'
      iconStack.style.display = 'inline-block'
      iconStack.style.flexShrink = '0'
      iconStack.style.width = '36px'
      iconStack.style.height = '18px'
      iconStack.style.marginLeft = '4px'
      const uniqueIcons = Array.from(new Set(items.map(i => i.isDirectory ? '📁' : '📄'))).slice(0, 3)
      uniqueIcons.forEach((ic, idx) => {
        const s = document.createElement('span')
        s.textContent = ic
        s.style.position = 'absolute'
        s.style.left = `${6 + idx * 8}px`
        s.style.top = '1px'
        s.style.fontSize = '14px'
        s.style.lineHeight = '1'
        iconStack.appendChild(s)
      })
      const count = document.createElement('span')
      count.textContent = `${items.length}`
      count.style.fontWeight = '600'
      count.style.paddingLeft = '2px'
      wrap.appendChild(iconStack)
      wrap.appendChild(count)
    }

    document.body.appendChild(wrap)
    this._customDragPreviewEl = wrap
    // 热点靠左：预览整体落在指针右侧，叠标不被鼠标状态图标挡住
    dt.setDragImage(wrap, 8, 14)
  }

  onDragOver(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragOver(ev, targetPane)
  }

  onDragEnter(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragEnter(ev, targetPane)
  }

  onDragLeave(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragLeave(ev, targetPane)
  }

  onDragStartLocal(ev: DragEvent, entry: LocalEntry): void {
    const src = this._resolveDragSource(ev, entry, this.selectedLocal)
    if (!src) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    const cur = path.resolve(this.localPath)
    this._fileDnd.setDragSource('local', src.every(e => path.resolve(path.dirname(e.fullPath)) === cur))
    const p: DragPayload = { kind: 'local-paths', paths: src.map(e => ({ fullPath: e.fullPath, name: e.name, isDirectory: e.isDirectory })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))

    // 本地文件真实存在于磁盘，设置 OS 拖拽数据（FilePath + text/uri-list）以支持拖到桌面/资源管理器
    const uriList: string[] = []
    for (const e of src) {
      try {
        const file = new File([''], e.name)
        ;(file as any).path = e.fullPath
        ev.dataTransfer?.items.add(file)
        uriList.push(encodeURI(`file:///${e.fullPath.replace(/\\/g, '/')}`))
      } catch { /* 跳过无法添加的文件 */ }
    }
    if (uriList.length) {
      ev.dataTransfer?.setData('text/uri-list', uriList.join('\r\n'))
      ev.dataTransfer!.dropEffect = 'copy'
      ev.dataTransfer!.effectAllowed = 'copy'
    }
  }

  onDragStartRemote(ev: DragEvent, entry: SFTPFile): void {
    if (!this.connected) return
    const src = this._resolveDragSource(ev, entry, this.selectedRemote)
    if (!src) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    const cur = this._normRemoteDir(this.remotePath)
    this._fileDnd.setDragSource('remote', src.every(e => this._normRemoteDir(path.posix.dirname(e.fullPath)) === cur))
    const p: DragPayload = { kind: 'remote-paths', paths: src.map(e => ({ remotePath: e.fullPath, name: e.name, isDirectory: e.isDirectory, size: e.size, mode: e.mode, modified: e.modified?.getTime?.() })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))

    // 同步检查临时缓存：只在实际文件已缓存时设置 OS 拖拽数据，否则不设置
    // 避免生成无效的 .url 快捷方式文件
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragout')
    const uriList: string[] = []
    for (const e of src) {
      const tmpPath = path.join(tmpDir, e.name)
      try {
        const st = fsSync.statSync(tmpPath)
        if (e.isDirectory) {
          if (st.isDirectory() && fsSync.statSync(path.join(tmpPath, '.sftp-cache-done'))) {
            try { const file = new File([''], e.name); (file as any).path = tmpPath; ev.dataTransfer?.items.add(file) } catch {}
            uriList.push(`file:///${tmpPath.replace(/\\/g, '/')}`)
          }
        } else if (st.size === (e.size ?? 0)) {
          try { const file = new File([''], e.name); (file as any).path = tmpPath; ev.dataTransfer?.items.add(file) } catch {}
          uriList.push(`file:///${tmpPath.replace(/\\/g, '/')}`)
        }
      } catch { /* 缓存未命中 */ }
    }

    // 全部缓存命中时通知 OS 这是一次文件拖拽；部分命中时不设置，避免产生不完整的拖拽
    if (uriList.length > 0 && uriList.length === src.length) {
      ev.dataTransfer?.setData('text/uri-list', uriList.join('\r\n'))
      ev.dataTransfer!.dropEffect = 'copy'
      ev.dataTransfer!.effectAllowed = 'copy'
      return
    }

    // 缓存部分/全部未命中：不设置 OS 拖拽数据，避免生成快捷方式
    // 保留 application/x-sftp-plus 供面板间内部拖拽（本地↔远程），此功能不受缓存影响
    // 仅对小文件延迟预缓存（供下次拖出桌面）；大文件/目录绝不在 dragstart 拉全量。
    // 快速拖回取消时由 dragend 中止定时器与下载，避免占满 SFTP/SSH 通道。
    if (uriList.length < src.length) {
      this._scheduleRemoteDragCache(src)
    }
  }

  /** 拖拽源解析：检查选中状态、清理框选、返回实际拖拽条目列表；返回 null 表示已取消拖拽 */
  private _resolveDragSource<T extends { fullPath: string }>(ev: DragEvent, entry: T, selected: T[]): T[] | null {
    if (!selected.some(e => e.fullPath === entry.fullPath)) {
      ev.preventDefault()
      this._rubberBand.markDragCancelled()
      return null
    }
    this._rubberBand.cleanup()
    return selected.length ? selected : [entry]
  }

  /**
   * 异步预缓存远程小文件到临时目录（供后续拖到桌面）。
   * 目录/大文件已在调度层过滤；gen 与当前代不一致时立即退出。
   */
  private async _cacheRemoteFilesForDrag(entries: SFTPFile[], gen: number): Promise<void> {
    if (!this.sftpSession || gen !== this._dragCacheGen) return
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragout')
    await fs.mkdir(tmpDir, { recursive: true }).catch(() => {})
    if (gen !== this._dragCacheGen) return

    for (const entry of entries) {
      if (gen !== this._dragCacheGen || !this.sftpSession) return
      const safeName = path.basename(entry.name).replace(/\.\./g, '')
      if (!safeName || safeName === '.' || safeName === '..') continue
      if (entry.isDirectory) continue
      if ((entry.size ?? 0) > SftpFloatingPanel.DRAG_CACHE_MAX_BYTES) continue

      const flightKey = entry.fullPath
      if (this._dragCacheInFlight.has(flightKey)) continue
      this._dragCacheInFlight.add(flightKey)
      try {
        const tmpPath = path.join(tmpDir, safeName)
        const cached = await fs.stat(tmpPath).then(s => s.size === (entry.size ?? 0)).catch(() => false)
        if (cached || gen !== this._dragCacheGen) continue

        // 独立 cancel 列表，不占用文件夹传输的共享 _cancelRef
        const dragCancelRef: { current: { cancel?: () => void | Promise<void> } | null } = { current: null }
        const ctx = {
          ...this._byteTransferCtx(),
          cancelRef: dragCancelRef,
        }
        await downloadRemoteFile(ctx, entry.fullPath, tmpPath, undefined, entry.size, {
          exposeCancel: true,
          onTransfer: (dl) => {
            if (gen !== this._dragCacheGen) {
              void dl.cancel()
              return
            }
            this._dragCacheTransfers.push(dl)
          },
        })
      } catch {
        /* 跳过失败项 */
      } finally {
        this._dragCacheInFlight.delete(flightKey)
        // 清理已结束的 transfer 引用，避免列表无限增长
        this._dragCacheTransfers = this._dragCacheTransfers.filter(t => {
          const anyT = t as { isCancelled?: () => boolean; isComplete?: () => boolean }
          if (typeof anyT.isCancelled === 'function' && anyT.isCancelled()) return false
          if (typeof anyT.isComplete === 'function' && anyT.isComplete()) return false
          return true
        })
      }
    }
  }

  async onDrop(ev: DragEvent, targetPane: 'local' | 'remote'): Promise<void> {
    await this._fileDropRuntime.onDrop(ev, targetPane)
  }

  // ========== 文件夹传输进度 ==========

  /** 递归计算本地目录总大小 */
  private async _calcLocalDirSize(dirPath: string): Promise<number> {
    let size = 0
    try {
      for (const item of await fs.readdir(dirPath, { withFileTypes: true })) {
        const p = path.join(dirPath, item.name)
        if (item.isSymbolicLink()) continue
        if (item.isDirectory()) {
          size += await this._calcLocalDirSize(p)
        } else {
          const st = await fs.stat(p).catch(() => null)
          if (st) size += st.size
        }
      }
    } catch {}
    return size
  }

  /** 递归计算本地目录文件数 */
  private async _countLocalDirItems(dirPath: string): Promise<number> {
    let count = 0
    try {
      for (const item of await fs.readdir(dirPath, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue
        if (item.isDirectory()) {
          count += await this._countLocalDirItems(path.join(dirPath, item.name))
        } else {
          count++
        }
      }
    } catch {}
    return count
  }

  /** 递归计算远程目录总大小（需要 sftpSession） */
  private async _calcRemoteDirSize(remotePath: string): Promise<number> {
    if (!this.sftpSession) return 0
    let size = 0
    try {
      const entries = await this.sftpSession.readdir(remotePath)
      for (const e of entries) {
        if (e.isDirectory) {
          size += await this._calcRemoteDirSize(path.posix.join(remotePath, e.name))
        } else {
          size += e.size || 0
        }
      }
    } catch {}
    return size
  }

  /** 递归计算远程目录文件数 */
  private async _countRemoteDirItems(remotePath: string): Promise<number> {
    if (!this.sftpSession) return 0
    let count = 0
    try {
      const entries = await this.sftpSession.readdir(remotePath)
      for (const e of entries) {
        if (e.isDirectory) {
          count += await this._countRemoteDirItems(path.posix.join(remotePath, e.name))
        } else {
          count++  // 包括 0 字节文件
        }
      }
    } catch {}
    return count
  }

  /** 开始一个文件夹传输（创建进度条目和初始日志） */
  private _startFolderTransfer(
    name: string, direction: 'upload' | 'download',
    remotePath: string, localPath: string,
    totalSize: number, itemCount: number,
  ): { transferEntry: typeof this.transfers[0]; startTime: number; logEntryId: string } {
    const logEntry = this.transferLog.add({
      operation: direction,
      localPath,
      remotePath,
      profileName: this.profile?.name || undefined,
      success: true,
      size: totalSize,
      duration: 0,
      startTime: Date.now(),
      pending: true,  // ★ 修复：标记进行中，避免日志误显示"下载成功 ✓ 0ms"
    })
    const transferEntry = {
      transfer: null, direction, name, remotePath, localPath,
      percent: 0, speed: '', bytesDone: 0, bytesTotal: totalSize,
      paused: false, logEntryId: logEntry.id,
      isFolder: true, currentItem: '', itemCount, itemDone: 0,
    } as typeof this.transfers[0]
    this.transfers.push(transferEntry)
    this.transfersMinimized = false  // 新文件夹传输自动展开面板
    this.transfersHidden = false
    this.cdr.detectChanges()
    return { transferEntry, startTime: Date.now(), logEntryId: logEntry.id }
  }

  /** 更新文件夹传输进度 */
  private _updateFolderProgress(
    t: typeof this.transfers[0], bytesDone: number, currentItem: string, itemDone: number,
    currentItemSize?: number,
  ): void {
    // 暂停中不更新（用户暂停后当前文件可能刚好完成）
    if (t.paused) return
    t.bytesDone = bytesDone
    t.currentItem = currentItem
    t.currentItemSize = currentItemSize
    t.itemDone = itemDone
    t.percent = t.bytesTotal > 0 ? Math.min(100, Math.round((bytesDone / t.bytesTotal) * 100)) : 0
    // 简易速度：每 500ms 刷新一次（与 runtime 单文件传输的 500ms 窗口对齐）
    const now = Date.now()
    const lastUpdate = (t as any)._lastSpeedUpdate || 0
    const lastBytes = (t as any)._lastBytes || 0
    if (now - lastUpdate >= 500) {
      const deltaBytes = bytesDone - lastBytes
      const deltaTime = Math.max(1, now - lastUpdate)
      // 仅在有新进度时更新速率；delta=0 时保留上次速度（避免卡顿时闪烁为空）
      if (deltaBytes > 0) {
        t.speed = this._formatSpeed(deltaBytes, deltaTime)
      }
      // 始终推进基准点，保证下次计算窗口正确
      ;(t as any)._lastSpeedUpdate = now
      ;(t as any)._lastBytes = bytesDone
    }
    this.cdr.detectChanges()
  }

  /** 完成文件夹传输 */
  private _finishFolderTransfer(
    t: typeof this.transfers[0], startTime: number, logEntryId: string, success: boolean,
  ): void {
    this.transfers = this.transfers.filter(x => x !== t)
    const now = Date.now()
    this.transferLog.update(logEntryId, { success, duration: now - startTime, endTime: now, pending: false })
  }

  // ========== 传输 ==========
  /**
   * 功能描述：上传文件/目录到远程，带冲突检测和进度显示。
   *   目录 → 预计算大小，显示文件夹级进度条和当前文件
   *   单文件 → 用 _doUpload 走 trackTransfer 进度
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 集成文件夹进度追踪
   */
  private async uploadPathToRemote(
    remoteDir: string, localPath: string,
    _top?: FolderTransferCtx,
  ): Promise<void> {
    return this._transferCoordinator.uploadPathToRemote(remoteDir, localPath, _top)
  }

  /**
   * 功能描述：检查远程文件是否存在且有差异
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  private async _checkConflict(remotePath: string, localPath: string, localSize: number, localMtime: number): Promise<ConflictFileInfo | null> {
    return this._transferCoordinator.checkUploadConflict(remotePath, localPath, localSize, localMtime)
  }

  /** 检查远程路径是否已存在（目录或文件） */
  private async _checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean> {
    return this._transferCoordinator.checkRemotePathExists(remotePath, expectDir)
  }

  /**
   * 功能描述：检查本地是否存在同名文件（用于下载冲突检测）
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   */
  private async _checkLocalConflict(localPath: string, remotePath: string, remoteSize: number, remoteMtime: number): Promise<ConflictFileInfo | null> {
    return this._transferCoordinator.checkLocalConflict(localPath, remotePath, remoteSize, remoteMtime)
  }

  /**
   * 功能描述：不检测冲突，直接上传
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Composer
   * 修改时间：2026-07-25 — 字节级逻辑下沉 transfer-adapters.uploadLocalFile
   */
  protected async _doUpload(
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'edit-upload',
  ): Promise<void> {
    if (!this.sftpSession) return
    await uploadLocalFile(this._byteTransferCtx(), remotePath, localPath, {
      track: true,
      logOperation,
    })
  }

  /** 上传文件（不记录传输日志，文件夹内部使用） */
  private async _doUploadRaw(remotePath: string, localPath: string): Promise<void> {
    if (!this.sftpSession) return
    await uploadLocalFile(this._byteTransferCtx(), remotePath, localPath, {
      exposeCancel: true,
    })
  }

  /**
   * 功能描述：下载远程文件到本地，不检测冲突（冲突已在前置步骤处理）
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   * 修改人：DD1024z + Composer
   * 修改时间：2026-07-25 — 字节级逻辑下沉 transfer-adapters.downloadRemoteFile
   */
  private async _doDownload(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void> {
    if (!this.sftpSession) return
    await downloadRemoteFile(this._byteTransferCtx(), remotePath, localPath, mode, size, {
      track: true,
    })
  }

  /** 下载文件（不记录传输日志，文件夹内部使用）
   *  ☆ 通过 cancelRef 暴露 dl 引用，供暂停/取消时中断 */
  private async _doDownloadRaw(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void> {
    if (!this.sftpSession) return
    await downloadRemoteFile(this._byteTransferCtx(), remotePath, localPath, mode, size, {
      exposeCancel: true,
    })
  }

  /** 组装字节级传输上下文（会话 + 守卫 + 进度回调） */
  private _byteTransferCtx() {
    return {
      session: this.sftpSession!,
      activeDownloadTargets: this._activeDownloadTargets,
      cancelRef: this._cancelRef,
      trackTransfer: (
        t: LocalPathFileUpload | LocalPathFileDownload,
        direction: 'upload' | 'download',
        remotePath: string,
        localPath: string,
        logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
      ) => this.trackTransfer(t, direction, remotePath, localPath, logOperation as any),
      onUploadError: (_remotePath: string, localPath: string) => {
        const name = path.basename(localPath)
        const msg = this.i18n.t('notify.uploadFailed', { name })
        try { this.notifications?.error?.(msg, '') } catch { /* ignore */ }
      },
      onDownloadError: (remotePath: string) => {
        const name = path.basename(remotePath)
        const msg = this.i18n.t('notify.downloadFailed', { name })
        try { this.notifications?.error?.(msg, '') } catch { /* ignore */ }
      },
    }
  }

  // ========== 冲突处理 ==========

  /**
   * 功能描述：显示冲突对话框（仅当有等待处理的冲突项时）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Deepseek-V4-Flash
   * 修改时间：2026-06-25 — 支持下载方向的冲突，不再重复获取远程信息（下载已携带）
   */
  private _showConflictDialog(): void {
    this._conflictResolver.showConflictDialog()
  }

  /**
   * 功能描述：用户点击冲突对话框的操作
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  resolveConflict(action: string): void {
    this._conflictResolver.resolveConflict(action)
  }

  // ========== 传输进度轮询（委托 panel/panel-transfer-runtime） ==========

  private trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): void {
    this._transferRuntime.trackTransfer(t, direction, remotePath, localPath, logOperation)
    // P2-3: 仅首个传输自动展开面板，后续传输不覆盖用户的最小化/隐藏操作
    if (this.transfers.length <= 1) {
      this.transfersMinimized = false
      this.transfersHidden = false
    }
  }

  protected _logEditorTransfer(
    operation: 'edit-upload' | 'edit-download',
    remotePath: string,
    localPath: string,
    size: number,
    success: boolean,
    startTime: number,
    failReason?: TransferLogEntry['failReason'],
  ): void {
    const now = Date.now()
    this.transferLog.add({
      operation,
      localPath,
      remotePath,
      profileName: this.profile?.name || undefined,
      success,
      size,
      duration: now - startTime,
      startTime,
      endTime: now,
      failReason,
    })
  }

  cancelTransfer(entry: { transfer: any; logEntryId?: string; paused?: boolean; isFolder?: boolean }): void {
    this._transferRuntime.cancelTransfer(entry)
    // ★ 2026-07-25：文件夹取消时真正中断正在进行中的子文件（B1）
    if (entry.isFolder) this._cancelRef?.current?.cancel?.()
  }

  /** 取消当前文件（文件夹：跳过此文件，循环继续） */
  cancelCurrentFile(entry: { isFolder?: boolean }): void {
    this._transferRuntime.cancelCurrentFile(entry)
    // ★ 2026-07-25：文件夹取消当前文件时真正中断正在进行中的子文件（B1）
    if (entry.isFolder) this._cancelRef?.current?.cancel?.()
  }

  /** 暂停传输 */
  pauseTransfer(entry: any): void {
    this._transferRuntime.pauseTransfer(entry)
  }

  /** 继续传输（断点续传） */
  async resumeTransfer(entry: any): Promise<void> {
    await this._transferRuntime.resumeTransfer(entry)
  }

  /**
   * 内部：执行续传操作
   * 功能描述：用新的 transfer 适配器从指定 offset 继续传输
   *           优先尝试原始 ssh2 SFTP createReadStream/createWriteStream
   *           （支持 start 偏移，实现真断点续传），否则回退到标准 upload/download
   */
  // 续传内部实现已迁移至 panel/panel-transfer-runtime.ts

  /**
   * 用原始 ssh2 SFTP createWriteStream 实现断点续传上传
   */
  // 原始 ssh2 续传上传已迁移至 panel/panel-transfer-runtime.ts

  /**
   * 用原始 ssh2 SFTP createReadStream 实现断点续传下载
   */
  // 原始 ssh2 续传下载已迁移至 panel/panel-transfer-runtime.ts

  /** 关闭整个传输面板 */
  clearTransfers(): void {
    this._transferRuntime.clearTransfers()
  }

  // ========== 权限编辑对话框 ==========
  openPermDialog(entry: SFTPFile): void {
    this.permTargetPath = entry.fullPath
    this.permTargetName = entry.name
    const m = entry.mode & 0o777
    this.permOwnerRead = (m & 0o400) !== 0
    this.permOwnerWrite = (m & 0o200) !== 0
    this.permOwnerExec = (m & 0o100) !== 0
    this.permGroupRead = (m & 0o040) !== 0
    this.permGroupWrite = (m & 0o020) !== 0
    this.permGroupExec = (m & 0o010) !== 0
    this.permOtherRead = (m & 0o004) !== 0
    this.permOtherWrite = (m & 0o002) !== 0
    this.permOtherExec = (m & 0o001) !== 0
    this.updatePermMode()
    this.showPermDialog = true
  }

  updatePermMode(): void {
    let m = 0
    if (this.permOwnerRead) m |= 0o400
    if (this.permOwnerWrite) m |= 0o200
    if (this.permOwnerExec) m |= 0o100
    if (this.permGroupRead) m |= 0o040
    if (this.permGroupWrite) m |= 0o020
    if (this.permGroupExec) m |= 0o010
    if (this.permOtherRead) m |= 0o004
    if (this.permOtherWrite) m |= 0o002
    if (this.permOtherExec) m |= 0o001
    this.permModePreview = m.toString(8).padStart(3, '0')
  }

  confirmPermDialog(): void {
    if (!this.permTargetPath || !this.sftpSession) return
    const m = parseInt(this.permModePreview, 8)
    this.sftpSession.chmod(this.permTargetPath, m)
      .then(() => this.refreshRemote())
      .catch(e => {
        log.error('chmod failed', e)
        this.showToast(this.i18n.t('permission.chmodFailed') || '权限修改失败', 3000)
      })
    this.showPermDialog = false
    this.permTargetPath = ''
  }

  cancelPermDialog(): void {
    this.showPermDialog = false
    this.permTargetPath = ''
  }

  /** 检查远程目录下是否已有同名条目（新建/上传冲突检测）；用 stat 准确判断文件/目录类型 */
  private async _remoteEntryExists(parentPath: string, name: string): Promise<{ exists: boolean; isDirectory: boolean }> {
    if (!this.sftpSession) return { exists: false, isDirectory: false }
    const fullPath = path.posix.join(parentPath, name)
    // 优先用 stat 准确判断（readdir 的 isDirectory 字段不一定可靠）
    if (this.sftpSession.stat) {
      try {
        const st = await this.sftpSession.stat(fullPath)
        return { exists: true, isDirectory: (st as any).isDirectory ?? false }
      } catch (e: any) {
        if (e?.code === 'ENOENT' || /not exist/i.test(String(e?.message))) return { exists: false, isDirectory: false }
        // stat 失败（如无 stat 权限）→ 回退到 readdir
      }
    }
    try {
      const entries = await this.sftpSession.readdir(parentPath)
      const found = entries.find((e: any) => e.name === name)
      if (!found) return { exists: false, isDirectory: false }
      return { exists: true, isDirectory: !!found.isDirectory }
    } catch { return { exists: false, isDirectory: false } }
  }

  // ========== 文件操作 ==========
  localNewFolder(): void { this.openInputDialog('local-mkdir', this.i18n.t('app.newFolder'), '', '', this.localPath) }
  localNewFile(): void { this.openInputDialog('local-touch', this.i18n.t('app.newFile'), '', '', this.localPath) }
  localRename(): void {
    if (this.selectedLocal.length !== 1) return
    this.openInputDialog('local-rename', this.i18n.t('app.rename'), this.selectedLocal[0].name, this.selectedLocal[0].name, this.selectedLocal[0].fullPath)
  }
  /** 键盘 Delete 键 → 删除选中文件；F2 → 重命名；F5 → 刷新当前面板 */
  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    // 面板不可见（最小化/所在 tab 未激活，如打开设置页或切到其它终端）时不响应
    if (!this._isPanelActive) return
    // 仅面板自身输入框内才视为正在输入；终端 textarea 在面板之外不拦截
    if (this._isPanelTyping(event)) return

    if (event.key === 'Delete') {
      // ★ 修复：按"哪侧有选中项"智能判定面板（_resolveTargetPane），
      //   避免 activePane 因键盘操作未及时更新为 'remote' 时，远程选中被误判而弹不出确认框/提示
      const side = this._resolveTargetPane()
      const sel = side === 'local' ? this._selectedLocal : this._selectedRemote
      if (sel && sel.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        this._paneDelete(side, event.shiftKey)
      }
    } else if (event.key === 'F2') {
      if (this.activePane === 'local' && this.selectedLocal.length === 1) {
        event.preventDefault()
        event.stopPropagation()
        this.localRename()
      } else if (this.activePane === 'remote' && this.selectedRemote.length === 1) {
        event.preventDefault()
        event.stopPropagation()
        this.remoteRename()
      }
    } else if (event.key === 'F5') {
      event.preventDefault()
      event.stopPropagation()
      if (this.activePane === 'local') void this.refreshLocal()
      else void this.refreshRemote()
    }
  }

  localDelete(): void { this._paneDelete('local', false) }
  remoteNewFolder(): void {
    if (!this.connected) return
    this.openInputDialog('remote-mkdir', this.i18n.t('app.newFolder'), '', '', this.remotePath)
  }
  remoteNewFile(): void {
    if (!this.connected) return
    this.openInputDialog('remote-touch', this.i18n.t('app.newFile'), '', '', this.remotePath)
  }
  remoteRename(): void {
    if (this.selectedRemote.length !== 1 || !this.connected) return
    this.openInputDialog('remote-rename', this.i18n.t('app.rename'), this.selectedRemote[0].name, this.selectedRemote[0].name, '', this.selectedRemote[0].fullPath)
  }
  remoteDelete(): void { this._paneDelete('remote') }

  private _paneDelete(side: 'local' | 'remote', forcePermanent?: boolean): void {
    const sel = side === 'local' ? this.selectedLocal : this.selectedRemote
    if (!sel.length) return
    // 本地文件：默认移入回收站（Delete 键），Shift+Delete 或右键菜单+永久删除走永久删除
    // 远程文件只能永久删除（SFTP 无回收站概念）
    this.deleteToTrash = side === 'local' && !(forcePermanent ?? false)
    if (side === 'local') this.pendingLocalDelete = sel.slice() as LocalEntry[]
    else this.pendingRemoteDelete = sel.slice() as SFTPFile[]
    this.prepareDeleteConfirm(sel)
    this.deleteConfirmVisible = true
  }
  remoteChmod(): void {
    if (this.selectedRemote.length !== 1) return
    this.openPermDialog(this.selectedRemote[0])
  }

  private openInputDialog(mode: NonNullable<SftpFloatingPanel['inputDialogMode']>, title: string, placeholder: string, value: string, targetPath: string, remotePath?: string): void {
    this.inputDialogMode = mode
    this.inputDialogTitle = title
    this.inputDialogPlaceholder = placeholder
    this.inputDialogValue = value
    this.inputDialogTargetPath = targetPath
    this.inputDialogRemotePath = remotePath ?? null
    this.inputDialogVisible = true
    // 输入框聚焦交给 sftp-input-dialog 组件自身处理（visible 变 true 时聚焦输入框）
  }

  cancelInputDialog(): void { this.inputDialogVisible = false; this.inputDialogMode = null; this.inputDialogValue = '' }

  /** 准备删除确认对话框的显示内容 */
  private prepareDeleteConfirm(entries: Array<LocalEntry | SFTPFile>): void {
    if (entries.length === 1) {
      const e = entries[0]
      this.deleteConfirmBatch = false
      this.deleteItemName = e.name
      this.deleteItemIsDir = e.isDirectory
      this.deleteItemType = e.isDirectory ? '' : this.getFileTypeName(e.name)
      const size = (e as any).size
      this.deleteItemSize = e.isDirectory ? null : (size != null ? this.formatFileSize(size) : null)
      const mtime = (e as SFTPFile).modified ?? ((e as LocalEntry).mtimeMs ? new Date((e as LocalEntry).mtimeMs!) : null)
      this.deleteItemDate = mtime ? this.formatDeleteDate(mtime) : ''
    } else {
      this.deleteConfirmBatch = true
      const count = entries.length
      this.batchDeleteText = this.i18n.t('app.deleteConfirmMultiple').replace('{count}', String(count))
    }
  }

  /** 根据文件扩展名获取类型描述 */
  getFileTypeName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
      txt: this.i18n.t('fileType.txt'),
      log: this.i18n.t('fileType.log'),
      md: this.i18n.t('fileType.md'),
      json: this.i18n.t('fileType.json'),
      xml: this.i18n.t('fileType.xml'),
      yml: this.i18n.t('fileType.data'),
      yaml: this.i18n.t('fileType.data'),
      cfg: this.i18n.t('fileType.config'),
      ini: this.i18n.t('fileType.config'),
      toml: this.i18n.t('fileType.config'),
      js: this.i18n.t('fileType.js'),
      ts: this.i18n.t('fileType.ts'),
      jsx: this.i18n.t('fileType.js'),
      tsx: this.i18n.t('fileType.ts'),
      py: this.i18n.t('fileType.code'),
      java: this.i18n.t('fileType.code'),
      cpp: this.i18n.t('fileType.code'),
      c: this.i18n.t('fileType.code'),
      h: this.i18n.t('fileType.code'),
      go: this.i18n.t('fileType.code'),
      rs: this.i18n.t('fileType.code'),
      rb: this.i18n.t('fileType.code'),
      php: this.i18n.t('fileType.code'),
      html: this.i18n.t('fileType.html'),
      htm: this.i18n.t('fileType.html'),
      css: this.i18n.t('fileType.css'),
      scss: this.i18n.t('fileType.css'),
      less: this.i18n.t('fileType.css'),
      vue: this.i18n.t('fileType.code'),
      svelte: this.i18n.t('fileType.code'),
      png: this.i18n.t('fileType.image'),
      jpg: this.i18n.t('fileType.image'),
      jpeg: this.i18n.t('fileType.image'),
      gif: this.i18n.t('fileType.image'),
      svg: this.i18n.t('fileType.image'),
      ico: this.i18n.t('fileType.image'),
      bmp: this.i18n.t('fileType.image'),
      webp: this.i18n.t('fileType.image'),
      pdf: this.i18n.t('fileType.doc'),
      doc: this.i18n.t('fileType.doc'),
      docx: this.i18n.t('fileType.doc'),
      xls: this.i18n.t('fileType.doc'),
      xlsx: this.i18n.t('fileType.doc'),
      ppt: this.i18n.t('fileType.doc'),
      pptx: this.i18n.t('fileType.doc'),
      zip: this.i18n.t('fileType.archive'),
      rar: this.i18n.t('fileType.archive'),
      tar: this.i18n.t('fileType.archive'),
      gz: this.i18n.t('fileType.archive'),
      '7z': this.i18n.t('fileType.archive'),
      bz2: this.i18n.t('fileType.archive'),
      mp3: this.i18n.t('fileType.audio'),
      wav: this.i18n.t('fileType.audio'),
      flac: this.i18n.t('fileType.audio'),
      ogg: this.i18n.t('fileType.audio'),
      mp4: this.i18n.t('fileType.video'),
      avi: this.i18n.t('fileType.video'),
      mkv: this.i18n.t('fileType.video'),
      mov: this.i18n.t('fileType.video'),
      exe: this.i18n.t('fileType.executable'),
      dll: this.i18n.t('fileType.executable'),
      so: this.i18n.t('fileType.executable'),
      sh: this.i18n.t('fileType.executable'),
      bat: this.i18n.t('fileType.executable'),
      sql: this.i18n.t('fileType.data'),
      db: this.i18n.t('fileType.data'),
      sqlite: this.i18n.t('fileType.data'),
      iso: this.i18n.t('fileType.archive'),
      img: this.i18n.t('fileType.archive'),
      env: this.i18n.t('fileType.config'),
      pem: this.i18n.t('fileType.cert'),
      key: this.i18n.t('fileType.cert'),
      crt: this.i18n.t('fileType.cert'),
      lock: this.i18n.t('fileType.config'),
      gitignore: this.i18n.t('fileType.config'),
      dockerfile: this.i18n.t('fileType.config'),
    }
    return map[ext] || (ext ? `${ext.toUpperCase()} ${this.i18n.t('fileType.unknown')}` : this.i18n.t('fileType.unknown'))
  }

  /** 格式化文件大小 */
  formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = Math.floor(Math.log(bytes) / Math.log(1024))
    if (i >= units.length) i = units.length - 1
    const val = bytes / Math.pow(1024, i)
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
  }

  /** 格式化日期为删除对话框显示格式 */
  formatDeleteDate(d: Date): string {
    return formatDate(d.getTime())
  }

  async confirmInputDialog(): Promise<void> {
    if (!this.inputDialogVisible || !this.inputDialogMode) return
    const mode = this.inputDialogMode
    const val = this.inputDialogValue.trim()
    const tp = this.inputDialogTargetPath
    const rp = this.inputDialogRemotePath
    if (!val || !tp && !rp) return

    try {
      switch (mode) {
        case 'local-mkdir': {
          const existing = path.join(tp, val)
          let exType: 'file' | 'dir' | null = null
          try { const st = await fs.stat(existing); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
          if (exType === 'dir') { this._showInputConflict('dir-dup', val); break }
          if (exType === 'file') { this._showInputConflict('file-when-mkdir', val); break }
          await fs.mkdir(existing, { recursive: true }); this.cancelInputDialog(); await this.refreshLocal(); break
        }
        case 'local-rename': {
          const newPath = path.join(this.localPath, val)
          if (newPath !== tp) {
            let exType: 'file' | 'dir' | null = null
            try { const st = await fs.stat(newPath); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
            if (exType === 'dir') { this._showInputConflict('dir-dup', val); break }
            if (exType === 'file') { this._showInputConflict('file-dup', val); break }
          }
          await fs.rename(tp, newPath); this.cancelInputDialog(); await this.refreshLocal(); break
        }
        case 'remote-mkdir': {
          if (!this.sftpSession) return
          const r = await this._remoteEntryExists(tp, val)
          if (r.isDirectory) { this._showInputConflict('dir-dup', val); break }
          if (r.exists) { this._showInputConflict('file-when-mkdir', val); break }
          await this.sftpSession.mkdir(path.posix.join(tp, val)); this.cancelInputDialog(); await this.refreshRemote(); break
        }
        case 'local-touch': {
          const newPath = path.join(tp, val)
          let exType: 'file' | 'dir' | null = null
          try { const st = await fs.stat(newPath); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
          if (exType === 'dir') { this._showInputConflict('dir-when-touch', val); break }
          if (exType === 'file') { this._showInputConflict('file-dup', val); break }
          await fs.writeFile(newPath, ''); this.cancelInputDialog(); await this.refreshLocal(); break
        }
        case 'remote-touch': {
          if (!this.sftpSession) return
          const r = await this._remoteEntryExists(tp, val)
          if (r.isDirectory) { this._showInputConflict('dir-when-touch', val); break }
          if (r.exists) { this._showInputConflict('file-dup', val); break }
          const touchTmp = path.join(os.tmpdir(), `sftp-touch-${Date.now()}`)
          await fs.writeFile(touchTmp, '')
          const touchUp = new LocalPathFileUpload(touchTmp)
          try {
            await this.sftpSession.upload(path.posix.join(tp, val), touchUp as any)
          } finally {
            await fs.unlink(touchTmp).catch(() => {})
          }
          this.cancelInputDialog(); await this.refreshRemote(); break
        }
        case 'remote-rename': {
          if (!this.sftpSession) return
          const newPath = path.posix.join(this.remotePath, val)
          if (newPath !== rp) {
            const r = await this._remoteEntryExists(this.remotePath, val)
            if (r.isDirectory) { this._showInputConflict('dir-dup', val); break }
            if (r.exists) { this._showInputConflict('file-dup', val); break }
          }
          await this.sftpSession.rename(rp!, newPath); this.cancelInputDialog(); await this.refreshRemote(); break
        }
        case 'remote-chmod':
          if (!this.sftpSession) return
          if (!/^[0-7]{3,4}$/.test(val)) return
          const m = parseInt(val, 8)
          if (!isNaN(m)) { await this.sftpSession.chmod(rp!, m); this.cancelInputDialog(); await this.refreshRemote() }
          break
      }
    } catch (e) {
      log.error('Operation failed', e)
      const reason = (e as Error)?.message || String(e)
      const mode = this.inputDialogMode || ''
      // 失败时不关闭对话框，便于用户改个名字/路径立即重试
      if (mode.includes('rename')) {
        this.showToast(this.i18n.t('op.renameFailed', { reason }), 4000)
      } else if (mode.includes('mkdir')) {
        this.showToast(this.i18n.t('op.mkdirFailed', { reason }), 4000)
      } else if (mode.includes('touch')) {
        this.showToast(this.i18n.t('op.touchFailed', { reason }), 4000)
      } else if (mode.includes('chmod')) {
        this.showToast(this.i18n.t('op.chmodFailed', { reason }), 4000)
      } else {
        this.showToast(this.i18n.t('op.failed', { reason }), 4000)
      }
    }
  }

  /**
   * 输入对话框冲突提示：在对话框上方 toast 提示，不清对话框，用户可立即改名字
   * kind 说明见上面 switch 里的调用注释
   */
  private _showInputConflict(kind: 'dir-dup' | 'file-dup' | 'file-when-mkdir' | 'dir-when-touch', val: string): void {
    const key = kind === 'dir-dup' ? 'input.dirExists'
      : kind === 'file-dup' ? 'input.fileExists'
      : kind === 'file-when-mkdir' ? 'input.fileWhenMkdir'
      : 'input.dirWhenTouch'
    // ★ 统一用面板顶部 toast，不关对话框
    this.showToast(this.i18n.t(key, { val }), 3000)
  }

  async confirmDelete(): Promise<void> {
    this.deleteConfirmVisible = false
    const failed: string[] = []
    const trashFailed: string[] = []  // 回收站失败（不回退永久删除）
    try {
      if (this.pendingLocalDelete.length) {
        if (this.deleteToTrash) {
          // 移入回收站：优先 Electron shell.trashItem；失败再走 Windows 安全回退。
          // 不再使用 powershell -EncodedCommand（会被 360 等误报为「命令执行攻击」）。
          for (const e of this.pendingLocalDelete) {
            try {
              await trashLocalPath(e.fullPath, !!(e as any).isDirectory)
            } catch (err) {
              trashFailed.push(e.fullPath)
              log.error('trash failed for', e.fullPath, err)
            }
          }
        } else {
          for (const e of this.pendingLocalDelete) await deleteLocalRecursive(e.fullPath, failed)
        }
        await this.refreshLocal(); this.selectedLocal = []
      }
      if (this.pendingRemoteDelete.length && this.sftpSession) {
        for (const e of this.pendingRemoteDelete) await deleteRemoteRecursive(this.sftpSession, e.fullPath, failed)
        await this.refreshRemote(); this.selectedRemote = []
      }
    } catch (e) { log.error('Delete failed', e) }
    this.pendingLocalDelete = []; this.pendingRemoteDelete = []
    if (failed.length) {
      this.showToast(this.i18n.t('notify.deleteFailed', { n: failed.length }), 4000)
    }
    if (trashFailed.length) {
      this.showToast(
        this.i18n.t('notify.trashFailed', { n: trashFailed.length })
          || `有 ${trashFailed.length} 项移入回收站失败，文件未被删除（请尝试 Shift+Delete 永久删除）`,
        6000,
      )
    }
  }

  cancelDelete(): void { this.deleteConfirmVisible = false; this.pendingLocalDelete = []; this.pendingRemoteDelete = [] }

  // ========== 书签 ==========

  // ========== 传输日志 ==========
  get transferLogTotalCount(): number {
    return this.transferLog.filter({
      profileName: this.profile?.name || undefined,
    }).length
  }

  get filteredTransferLogs(): TransferLogEntry[] {
    const filter: {
      operation?: TransferLogEntry['operation']
      success?: boolean
      profileName?: string
      since?: number
      until?: number
    } = {
      operation: this.logFilterOp || undefined,
      profileName: this.profile?.name || undefined,
      ...this._getLogTimeBounds(),
    }
    if (this.logFilterStatus === 'success') filter.success = true
    else if (this.logFilterStatus === 'failed') filter.success = false
    return this.transferLog.filter(filter)
  }

  private _getLogTimeBounds(): { since?: number; until?: number } {
    const now = Date.now()
    switch (this.logFilterTimeRange) {
      case 'today': {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return { since: start.getTime(), until: now }
      }
      case '7d':
        return { since: now - 7 * 24 * 60 * 60 * 1000, until: now }
      case '30d':
        return { since: now - 30 * 24 * 60 * 60 * 1000, until: now }
      case 'custom': {
        const bounds: { since?: number; until?: number } = {}
        if (this.logFilterDateFrom) bounds.since = this._parseLogDateStart(this.logFilterDateFrom)
        if (this.logFilterDateTo) bounds.until = this._parseLogDateEnd(this.logFilterDateTo)
        return bounds
      }
      default:
        return {}
    }
  }

  private _parseLogDateStart(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }

  private _parseLogDateEnd(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
  }

  /** 切换传输记录对话框（打开时强制刷新日志，防止多面板/标签间 localStorage 数据不同步） */
  toggleTransferLog(): void {
    if (!this.showTransferLog) {
      // 即将打开 → 先从 localStorage 重新加载最新日志
      this.transferLog.reload()
      this.cdr.detectChanges()
    }
    this.showTransferLog = !this.showTransferLog
  }

  exportLog(): void {
    const json = this.transferLog.exportAsJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `sftp-plus-log-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  clearLog(): void {
    const profileName = this.profile?.name
    if (!confirm(this.i18n.t('transfer.clearConfirm'))) return
    if (profileName) {
      this.transferLog.clearProfile(profileName)
    } else {
      this.transferLog.clear()
    }
  }

  // ========== 右键菜单 ==========
  onLocalContextMenu(entry: LocalEntry, ev: MouseEvent): void { this._onPaneContextMenu('local', entry, ev) }
  onRemoteContextMenu(entry: SFTPFile, ev: MouseEvent): void { this._onPaneContextMenu('remote', entry, ev) }

  private _onPaneContextMenu(side: 'local' | 'remote', entry: { fullPath: string }, ev: MouseEvent): void {
    this._rubberBand.clearContextMenuSuppress()
    if (this._rubberBand.active) { ev.preventDefault(); return }
    if (this._rubberBand.skipNextContextMenu) { ev.preventDefault(); return }
    ev.preventDefault()
    ev.stopPropagation()
    this.headerMenuVisible = false
    this.headerMenuCol = null
    if (side === 'local') {
      if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
      if (!this._localSelectedPaths.has(entry.fullPath)) {
        this.selectedLocal = [entry as any]; this.selectedRemote = []
        this.localLastSelectedIndex = this.getFilteredLocalEntries().findIndex(e => e.fullPath === entry.fullPath)
      }
    } else {
      if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
      if (!this._remoteSelectedPaths.has(entry.fullPath)) {
        this.selectedRemote = [entry as any]; this.selectedLocal = []
        this.remoteLastSelectedIndex = this.getFilteredRemoteEntries().findIndex(e => e.fullPath === entry.fullPath)
      }
    }
    this.syncPaneSelectionVisual(side)
    this.zone.run(() => {
      this.closeBookmarks()
      this.contextMenuPane = side
      this.contextMenuEntry = entry as any
      this.contextMenuX = ev.clientX
      this.contextMenuY = ev.clientY
      this.contextMenuVisible = true
      this.cdr.detectChanges()
      this.fixContextMenuPosition(ev.clientX, ev.clientY)
    })
  }

  /** 渲染后测量实际菜单尺寸并修正位置，防止超出视口 */
  private fixContextMenuPosition(anchorX: number, anchorY: number): void {
    // 使用微任务等待 DOM 更新完成
    setTimeout(() => {
      const menuEl = this.elRef.nativeElement.querySelector('.context-menu') as HTMLElement | null
      if (!menuEl || !this.contextMenuVisible) return
      const rect = menuEl.getBoundingClientRect()
      const margin = 8
      let x = anchorX
      let y = anchorY

      // 右边界：超出则向左偏移
      if (x + rect.width > window.innerWidth - margin) {
        x = Math.max(margin, window.innerWidth - rect.width - margin)
      }
      // 下边界：超出则向上弹出
      if (y + rect.height > window.innerHeight - margin) {
        y = Math.max(margin, window.innerHeight - rect.height - margin)
      }
      // 保卫左/上边界
      if (x < margin) x = margin
      if (y < margin) y = margin

      if (x !== this.contextMenuX || y !== this.contextMenuY) {
        this.contextMenuX = x
        this.contextMenuY = y
        this.cdr.detectChanges()
      }
    }, 0)
  }

  /** 面板滚动时关闭右键菜单 */
  onPaneScroll(): void {
    if (this.contextMenuVisible) {
      this.contextMenuVisible = false
      this.contextMenuEntry = null
    }
    if (this.headerMenuVisible) {
      this.headerMenuVisible = false
      this.headerMenuCol = null
    }
  }

  closeContextMenu(): void {
    this.contextMenuVisible = false
    this.contextMenuEntry = null
  }

  ctxNewFolder(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localNewFolder()
    else this.remoteNewFolder()
  }

  ctxNewFile(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localNewFile()
    else this.remoteNewFile()
  }

  ctxRename(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localRename()
    else this.remoteRename()
  }

  ctxDelete(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localDelete()
    else this.remoteDelete()
  }

  ctxRefresh(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.refreshLocal()
    else this.refreshRemote()
  }

  ctxSelectAll(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') {
      const all = this.getFilteredLocalEntries()
      this.selectedLocal = this.selectedLocal.length === all.length ? [] : [...all]
    } else {
      const all = this.getFilteredRemoteEntries()
      this.selectedRemote = this.selectedRemote.length === all.length ? [] : [...all]
    }
  }

  /** 反选：选中当前未选的条目，取消已选的条目 */
  ctxSelectInvert(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') {
      const all = this.getFilteredLocalEntries()
      this.selectedLocal = all.filter(e => !this._localSelectedPaths.has(e.fullPath))
    } else {
      const all = this.getFilteredRemoteEntries()
      this.selectedRemote = all.filter(e => !this._remoteSelectedPaths.has(e.fullPath))
    }
    this.syncPaneSelectionVisual(this.contextMenuPane)
  }

  ctxCopyPath(): void {
    const pane = this.contextMenuPane
    const selected = pane === 'local' ? this.selectedLocal : this.selectedRemote
    const paths = (selected.length > 0 ? selected : (this.contextMenuEntry ? [this.contextMenuEntry] : []))
      .map(e => this.getEntryPath(e))
      .filter(Boolean)
    if (paths.length && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(paths.join(' ')).then(() => {
        this._notifyPathCopied(paths.length)
      }).catch(() => {})
    }
    this.closeContextMenu()
  }

  private _notifyPathCopied(count: number): void {
    this.showToast(this.i18n.t('notify.pathCopied', { n: count }))
  }

  /** 面板顶部轻提示（替代 Tabby 底部通知） */
  showToast(message: string, ms?: number): void {
    this.toastMessage = message
    const base = ms ?? (message.length > 40 ? 4500 : 2200)
    this._toastDurationMs = base
    this._toastHovering = false
    this._armToastDismiss()
    try { this.cdr.detectChanges() } catch {}
  }

  /**
   * 顶层通知：调用 Tabby 的 NotificationsService.error/info，不论面板是否可见都显示在主窗口顶部
   * 用于冲突提示等关键错误，UX 更明显
   */
  showTopNotification(message: string, kind: 'error' | 'warning' = 'error', detail = ''): void {
    try {
      this.notifications?.[kind]?.(message, detail)
    } catch { /* 兜底仍显示面板内 toast */
      this.showToast(message, 3000)
    }
  }

  onToastMouseEnter(): void {
    this._toastHovering = true
    if (this.toastTimer) {
      clearTimeout(this.toastTimer)
      this.toastTimer = null
    }
  }

  onToastMouseLeave(): void {
    this._toastHovering = false
    if (this.toastMessage) this._armToastDismiss()
  }

  private _toastDurationMs = 2200
  private _toastHovering = false

  private _armToastDismiss(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      if (this._toastHovering) return
      this.toastMessage = ''
      this.toastTimer = null
      try { this.cdr.detectChanges() } catch {}
    }, this._toastDurationMs)
  }

  /** 右键菜单 → 更改权限（仅远程） */
  ctxChmod(): void {
    this.closeContextMenu()
    if (this.selectedRemote.length === 1) {
      this.openPermDialog(this.selectedRemote[0])
    }
  }

  /** 右键菜单 → 打开（文件夹：进入目录；文件：系统默认程序） */
  ctxOpenLocal(): void {
    const entry = this.contextMenuEntry as LocalEntry | null
    this.closeContextMenu()
    if (!entry?.fullPath) return
    if (entry.isDirectory || this.isDirByMode(entry.mode)) {
      this.openLocal(entry)
      return
    }
    this._openPathInSystem(entry.fullPath)
  }

  /** 右键菜单 → 打开本地文件（用系统默认程序） */
  ctxOpenLocalFile(): void {
    this.ctxOpenLocal()
  }

  /** 右键菜单 → 在文件管理器中显示 */
  ctxRevealInExplorer(): void {
    const filePath = (this.contextMenuEntry as LocalEntry)?.fullPath
    this.closeContextMenu()
    if (!filePath) return
    log.info('Reveal in explorer:', filePath)
    try {
      const { shell } = require('electron')
      shell.showItemInFolder(filePath)
    } catch (e) {
      log.error('Reveal in explorer failed:', e)
    }
  }

  /** 检查当前右键菜单面板是否有选中项 */
  hasContextSelection(): boolean {
    return this.contextMenuPane === 'local' ? this.selectedLocal.length > 0 : this.selectedRemote.length > 0
  }

  /** 检查是否有文件级操作（打开/显示/权限/详细信息）可显示 */
  hasFileActions(): boolean {
    if (!this.contextMenuEntry) return false
    if (this.contextMenuPane === 'local') {
      return this.selectedLocal.length === 1
    } else {
      return this.selectedRemote.length === 1
    }
  }

  /** 获取当前上下文的选中项列表 */
  private getContextSelection(): (LocalEntry | SFTPFile)[] {
    return this.contextMenuPane === 'local' ? this.selectedLocal : this.selectedRemote
  }

  /** 获取修饰键名称（macOS=Cmd，其他=Ctrl） */
  get modKey(): string {
    return os.platform() === 'darwin' ? '⌘' : 'Ctrl+'
  }

  /** 获取 entry 的路径 */
  getEntryPath(e: LocalEntry | SFTPFile): string { return (e as LocalEntry).fullPath ?? (e as SFTPFile).fullPath ?? '' }

  /** 获取 entry 的大小 */
  getEntrySize(e: LocalEntry | SFTPFile): number | undefined { return (e as LocalEntry).size ?? (e as SFTPFile).size ?? undefined }

  /** 获取 entry 的修改时间（毫秒） */
  getEntryMtime(e: LocalEntry | SFTPFile): number | undefined {
    if (this.detailsIsLocal) return (e as LocalEntry).mtimeMs
    const m = (e as SFTPFile).modified
    return m ? m.getTime() : undefined
  }

  /** 获取 entry 的 mode */
  getEntryMode(e: LocalEntry | SFTPFile): number | undefined { return (e as LocalEntry).mode ?? (e as SFTPFile).mode ?? undefined }

  /** 获取 entry 的 owner */
  getEntryOwner(e: LocalEntry | SFTPFile): string | undefined {
    const o = (e as LocalEntry).owner ?? (e as SFTPFile).owner
    return o != null ? String(o) : undefined
  }

  /** 获取 entry 的 group */
  getEntryGroup(e: LocalEntry | SFTPFile): string | undefined {
    const g = (e as LocalEntry).group ?? (e as SFTPFile).group
    return g != null ? String(g) : undefined
  }

  /** 获取 entry 的创建时间（毫秒），仅本地文件有 */
  getEntryBirthtimeMs(e: LocalEntry | SFTPFile): number | undefined {
    if (!this.detailsIsLocal) return undefined
    return (e as LocalEntry).birthtimeMs ?? undefined
  }

  /** 获取 entry 的访问时间（毫秒） */
  getEntryAtimeMs(e: LocalEntry | SFTPFile): number | undefined {
    const local = (e as LocalEntry).atimeMs
    if (local != null) return local
    return (e as SFTPFile).atimeMs
  }

  /** 获取文件扩展名 */
  getFileExt(name: string): string {
    const i = name.lastIndexOf('.')
    return i > 0 ? name.substring(i + 1).toUpperCase() : ''
  }

  // ========== 详细信息 ==========
  ctxDetails(): void {
    if (!this.contextMenuEntry) return
    this.detailsEntry = this.contextMenuEntry
    this.detailsIsLocal = this.contextMenuPane === 'local'
    this.detailsVisible = true
    this.closeContextMenu()
  }

  canViewEntry(entry: LocalEntry | SFTPFile | null): boolean {
    if (!entry || (entry as any).isDirectory) return false
    return isViewableRemoteFileType(entry.name)
  }

  canEditEntry(entry: LocalEntry | SFTPFile | null): boolean {
    if (!entry || (entry as any).isDirectory) return false
    return isEditableRemoteFileType(entry.name)
  }

  get viewerShowSystemAction(): boolean {
    return !!this.viewerSystemPath && !this.viewerError && !this.viewerLoading
  }

  get editorShowSystemAction(): boolean {
    return !!this.editorLocalPath && !this.editorError && !this.editorLoading
  }


  async ctxUpload(): Promise<void> {
    this.closeContextMenu()
    if (!this.connected || !this.sftpSession) {
      this.showToast(this.i18n.t('notify.notConnectedUpload'))
      return
    }
    const items = this.getContextSelection() as LocalEntry[]
    if (!items.length) return
    const errors: string[] = []
    for (const e of items) {
      try {
        await this.uploadPathToRemote(this.remotePath, e.fullPath)
      } catch (err) {
        errors.push(e.name)
        log.error('ctxUpload failed for', e.fullPath, err)
      }
    }
    await this.refreshRemote()
    this.cdr.detectChanges()
    if (errors.length) {
      this.showToast(this.i18n.t('notify.uploadPartialFail', { n: errors.length }) || `${errors.length} 个文件上传失败`, 4000)
    }
  }

  async ctxDownload(): Promise<void> {
    this.closeContextMenu()
    if (!this.connected || !this.sftpSession) {
      this.showToast(this.i18n.t('notify.notConnectedDownload'))
      return
    }
    const items = this.getContextSelection() as SFTPFile[]
    if (!items.length) return
    for (const p of items) {
      await this._streamDownloadOne(p)
    }
    if (this._conflictQueue.length) this._showConflictDialog()
    // 传输协调器已负责本地面板更新，无需额外 refreshLocal
    this.cdr.detectChanges()
  }

  /** 边下载边检测冲突：无冲突立即传输，有冲突入队等待用户处理 */
  private async _streamDownloadOne(p: SFTPFile): Promise<void> {
    return this._transferCoordinator.streamDownloadOne(p)
  }


  // ========== 剪贴板操作 ==========
  ctxClipboardCopy(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'copy'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    this.showToast(this.i18n.t('notify.copied', { n: count }))
    log.info(`Copy ${count} items from ${this.clipboardSource}`)
  }

  ctxClipboardCut(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'cut'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    this.showToast(this.i18n.t('notify.cut', { n: count }))
    log.info(`Cut ${count} items from ${this.clipboardSource}`)
  }

  async ctxClipboardPaste(): Promise<void> {
    if (!this.clipboardEntries.length) return
    this.closeContextMenu()
    const destPane = this.contextMenuPane
    const destPath = destPane === 'local' ? this.localPath : this.remotePath
    const entries = this.clipboardEntries.slice()
    const mode = this.clipboardMode
    const source = this.clipboardSource

    log.info(`Paste ${entries.length} items (${mode}) from ${source} to ${destPane}`)
    this.clipboardEntries = []

    await this._pasteAdapter.paste(
      entries.map(e => ({
        name: e.name,
        fullPath: (e as LocalEntry).fullPath ?? (e as SFTPFile).fullPath,
        isDirectory: e.isDirectory,
        mode: (e as SFTPFile).mode,
        size: (e as any).size,
        mtimeMs: (e as any).mtimeMs,
      })),
      destPane, destPath, mode, source,
    )
  }

  /** 待粘贴的临时状态（冲突解决前暂存） */
  private _pendingPasteEntries: (LocalEntry | SFTPFile)[] = []
  private _pendingPasteDestPane: 'local' | 'remote' = 'local'
  private _pendingPasteDestPath = ''
  private _pendingPasteMode: 'copy' | 'cut' = 'copy'
  private _pendingPasteSource: 'local' | 'remote' = 'local'
  /** 冲突对话框中已处理的文件名集合（用于粘贴时过滤） */
  private _conflictResolvedKeys = new Set<string>()

  /** 执行实际粘贴操作（冲突解决后由 resolver 调用） */
  private async _executePaste(
    entries: (LocalEntry | SFTPFile)[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    return this._pasteAdapter.executePaste(
      entries.map(e => ({
        name: e.name,
        fullPath: (e as LocalEntry).fullPath ?? (e as SFTPFile).fullPath,
        isDirectory: e.isDirectory,
        mode: (e as SFTPFile).mode,
        size: (e as any).size,
        mtimeMs: (e as any).mtimeMs,
      })),
      destPane, destPath, mode, source,
    )
  }

  /**
   * 递归下载远程目录到本地（整个目录记一条日志，内部文件不单独记录）
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 添加文件夹级进度追踪，显示当前文件及完成数
   */
  private async downloadRemoteDir(
    remoteSrc: string, localDest: string, destPane: 'local' | 'remote',
    _top?: FolderTransferCtx,
    _localName?: string,
  ): Promise<void> {
    // ★ 准备取消引用，供暂停时中断正在下载的子文件
    // 修复：不无条件覆盖，避免破坏并发单文件下载的 cancelRef
    if (!this._cancelRef) this._cancelRef = { current: null }
    try {
      return await this._transferCoordinator.downloadRemoteDir(remoteSrc, localDest, _top, _localName)
    } finally {
      // 只在没有并发操作时清理
      if (this._cancelRef && !this._cancelRef.current) this._cancelRef = null
    }
  }

  // ========== 全局事件 ==========
  /** 返回当前面板是否处于可见且可交互状态 */
  private get _isPanelActive(): boolean {
    // 面板最小化时不响应快捷键
    if (this.minimized) return false
    // 面板挂载在当前终端 tab 的 DOM 内；tab 未激活时 Tabby 会隐藏其 DOM（display:none），
    // 此时面板虽“存在”但不可见、不可交互（如切到设置页、切到其它终端 tab），
    // 全局 keydown 仍会冒泡触发，故需检测面板根元素是否真实可见。
    const el = this.elRef?.nativeElement as HTMLElement | null
    if (!el || el.getClientRects().length === 0) return false
    return true
  }

  /** 判断焦点是否落在「正在编辑文字」的输入控件中（面板路径框/筛选框/对话框，
   *  以及面板之外的任何输入框——如设置页的时间格式输入框）。
   *  若为真则不劫持快捷键（允许正常编辑文字，Backspace/Delete 可正常删字）。
   *  唯一例外：终端 xterm 的隐藏 <textarea>（.xterm 容器内）不算「正在输入」——
   *  面板浮层打开后焦点仍在终端，若把它当输入态，面板 Backspace/Delete 快捷键会失效。
   *  修改人：DD1024z + Hy3
   *  修改时间：2026-07-23（修复：设置页等面板外输入框的 Backspace/Delete 被面板全局热键吞掉） */
  private _isPanelTyping(event: KeyboardEvent): boolean {
    const el = event.target as HTMLElement | null
    if (!el) return false
    const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as any).isContentEditable
    if (!isInput) return false
    // 面板自身的输入框 → 正在输入
    if (this.elRef?.nativeElement?.contains(el)) return true
    // 面板之外：只有终端 xterm 的隐藏 textarea 例外（继续放行快捷键），
    // 其余任何输入框（设置页、其他插件等）一律视为正在输入，不得劫持按键
    return !(typeof el.closest === 'function' && el.closest('.xterm'))
  }

  /** 智能判断快捷键/右键操作的目标面板
   *  - 若仅一侧有选中项 → 使用该侧
   *  - 若两侧均有/均无 → 使用 activePane（鼠标悬停的面板） */
  private _resolveTargetPane(): 'local' | 'remote' {
    if (this.selectedLocal.length > 0 && this.selectedRemote.length === 0) return 'local'
    if (this.selectedRemote.length > 0 && this.selectedLocal.length === 0) return 'remote'
    return this.activePane
  }

  /** 点击面板内任意元素时，主动取消面板外（终端）的光标焦点 */
  @HostListener('mousedown', ['$event'])
  onPanelMouseDown(event: MouseEvent): void {
    // 右键菜单已展开时，点菜单以外的区域则关闭菜单（点菜单项由自身 click 关闭）
    if (this.topBarMenuVisible && !(event.target as HTMLElement)?.closest?.('.sftp-title-menu')) {
      this.topBarMenuVisible = false
    }
    const active = document.activeElement as HTMLElement | null
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    // 仅当当前焦点在面板之外（如终端 xterm 的隐藏 textarea）时才失焦，
    // 避免误伤面板内的输入框/按钮等可聚焦元素
    if (active && root && active !== root && !root.contains(active)) {
      active.blur()
    }
  }

  /** 点击面板外（终端区）时关闭标题栏右键菜单 */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDownForMenu(_event: MouseEvent): void {
    if (this.topBarMenuVisible) this.topBarMenuVisible = false
  }

  /** 标题栏右键：打开菜单（定位到鼠标处） */
  onTopBarContextMenu(e: MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    this.topBarMenuX = e.clientX
    this.topBarMenuY = e.clientY
    this.topBarMenuVisible = true
    this.cdr.detectChanges()
  }

  /** 关闭标题栏右键菜单 */
  closeTopBarMenu(): void {
    this.topBarMenuVisible = false
  }

  /** 还原面板为默认大小（居中 96%×94%，百分比定位 → 跟随 Tabby 窗口缩放），并清掉已保存的自定义几何 */
  restoreDefaultSize(): void {
    this.topBarMenuVisible = false
    if (this.displayMode === 'workspace' || !this._hostEl) return
    this._applyDefaultGeometry()
    this._persistPanelGeometry()
  }


  /** 全局键盘快捷键——面板获得焦点时，Ctrl+C/X/V/A 不穿透到终端连接 */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent): void {
    if (!this._isPanelActive) return
    // ★ 焦点检测：面板获得焦点时屏蔽 Ctrl 快捷键直达终端
    const panelFocused = (() => {
      const a = document.activeElement as HTMLElement | null
      const r = this.elRef?.nativeElement as HTMLElement | null
      return !!(a && r && r.contains(a))
    })()
    if (panelFocused && (os.platform() === 'darwin' ? event.metaKey : event.ctrlKey) && ['c','C','x','X','v','V','a','A'].includes(event.key)) {
      event.stopImmediatePropagation()
    }
    // 仅当焦点位于「本面板自身」的输入框（path input、filter input、对话框等）时才视为正在输入，
    // 终端 xterm 的隐藏 textarea 在面板之外，不拦截面板快捷键；Esc 例外（查看/编辑器要能关闭）
    if (this._isPanelTyping(event) && event.key !== 'Escape') {
      // ★ 修复：面板内的 textarea（查看器/编辑器）按 Ctrl+C/X/V/A 时，
      //   stopImmediatePropagation 阻止 Tabby 终端也收到并发送到 SSH（不 preventDefault 以保留原生复制粘贴行为）
      const isMod = os.platform() === 'darwin' ? event.metaKey : event.ctrlKey
      if (isMod && ['c','C','x','X','v','V','a','A'].includes(event.key)) {
        const el = event.target as HTMLElement | null
        if (el && this.elRef?.nativeElement?.contains(el)) {
          event.stopImmediatePropagation()
        }
      }
      return
    }

    const isMod = os.platform() === 'darwin' ? event.metaKey : event.ctrlKey
    if (!isMod) {
      // ★ 修复：删除确认框打开时，回车=确认 / Esc=取消（与组件内 onKeyDown 对称兜底；
      //   组件已 preventDefault 时，下方 Escape 分支会因 defaultPrevented 直接 return，不会重复触发）
      if (this.deleteConfirmVisible) {
        if (event.key === 'Enter') { event.preventDefault(); void this.confirmDelete(); return }
        if (event.key === 'Escape') { event.preventDefault(); this.cancelDelete(); return }
        return
      }
      // 鼠标「上一页」语义：Backspace 后退到历史中的上一目录（输入态已由上方 isTyping 守卫拦截）
      if (event.key === 'Backspace') {
        const pane = this._resolveTargetPane()
        event.preventDefault()
        event.stopPropagation()
        if (pane === 'local') this.localBack()
        else this.remoteBack()
        return
      }
      if (event.key === 'Escape') {
        // 如果 Esc 已被子组件（对话框、输入框等）preventDefault 处理，
        // 不再让面板接管，避免对话框关完后又把面板也关了
        if (event.defaultPrevented) return
        if (this.viewerVisible) {
          event.preventDefault()
          this.closeViewer()
          return
        }
        if (this.editorVisible) {
          event.preventDefault()
          this.closeEditor()
          return
        }
        if (this.cwdSetupVisible) { this.onCwdSetupChoice('cancel'); return }
        if (this.inputDialogVisible) { this.cancelInputDialog(); return }
        if (this.showBookmarks) { this.closeBookmarks(); return }
        if (this.showTransferLog) { this.showTransferLog = false; return }
        if (this.detailsVisible) { this.detailsVisible = false; return }
        if (this.showPermDialog) { this.showPermDialog = false; return }
        this.close(); return
      }
      return
    }

    if (this._isPanelTyping(event)) return

    // 查看/编辑对话框打开时，不抢占 Ctrl+A/C/X/V（由文本区原生处理），
    // 但用 stopImmediatePropagation 阻断终端连接收到 Ctrl+C/X/V/A
    if (this.viewerVisible || this.editorVisible) {
      if ((os.platform() === 'darwin' ? event.metaKey : event.ctrlKey) && ['c','C','x','X','v','V','a','A'].includes(event.key)) {
        event.stopImmediatePropagation()
      }
      return
    }

    // 智能确定目标面板（优先使用有选中项的面板）
    this.contextMenuPane = this._resolveTargetPane()

    if (event.key === 'a' || event.key === 'A') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.ctxSelectAll()
      return
    }
    if (event.key === 'c' || event.key === 'C') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.ctxClipboardCopy()
      return
    }
    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.ctxClipboardCut()
      return
    }
    if (event.key === 'v' || event.key === 'V') {
      event.preventDefault()
      event.stopImmediatePropagation()
      void this.ctxClipboardPaste()
      return
    }
  }
}

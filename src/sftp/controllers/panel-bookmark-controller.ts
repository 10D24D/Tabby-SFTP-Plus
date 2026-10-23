/**
 * SFTP+ 书签控制器基类（由 sftp-floating-panel.component.ts 抽取）
 * 功能描述：承载书签弹窗、增删改、按「局部 / 全局」筛选、书签拖拽排序等逻辑与状态，供浮动面板组件继承
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-11
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-10-23
 * 修改情况：
 *   - 2026-10-23 (Deepseek-V4.1-Flash) 书签弹层**按栏分槽**，支持两栏同时打开（`BookmarkPaneState` / `bmState(side)`）：
 *     此前 `showBookmarks` + `_bookmarkSide` 是单份状态，整个面板只能存在一个弹层。用户要求「图钉钉住（常驻）后
 *     两栏可以同时开」。互斥规则：**未钉住时仍只允许一个**（开右栏自动收左栏，保持「点外部就收」的原口径），
 *     钉住后并存。位置/尺寸/箭头/表单/编辑态/拖拽高亮/列表缓存全部按栏各一份；
 *     `showBookmarks` 降级为「任一栏打开」的只读 getter（面板侧快捷键守卫、点外部关闭、Esc 仍按整体语义），
 *     新增 `closeBookmarksAt(side)` 供「关闭」按钮 / 再点一次 ★ 用（只关自己）。
 *   - 2026-10-23 (Deepseek-V4.1-Flash) 图钉「面板常驻」语义扩展：新增 getter `bookmarkPinned`（= !closeBookmarkPanelOnSelect，
 *     取反只在此处做一次）+ `closeBookmarksIfNotPinned()`（隐式关闭专用）。常驻时点其它位置 / 滚轮 / 右键 / 框选 /
 *     窗口缩放都不关弹层，只有「关闭」按钮、再点一次 ★ 按钮、Esc 才关；缩放改由 `_clampBookmarkPopupToRoot()` 钳制回可用空间。
 *     ⛔ 显式入口必须仍走 `closeBookmarks()`，误换成 IfNotPinned 会导致钉住后连「关闭」都点不动。
 *   - 2026-10-22 (Deepseek-V4.1-Flash) 书签排序改三档：bookmarkSortByUsage(boolean) → bookmarkSortMode，新增「名称排序」（Intl.Collator numeric + sensitivity:base，同名按路径兜底）；非手动模式禁止拖拽落序。
 *   - 2026-10-22 (Deepseek-V4.1-Flash) 归属范围改为「局部 / 全局」：`_activeBookmarkConnKey` → `_bookmarkScopeKey`，
 *     键取**面板所在 Tab 的连接**（远程 Tab = `hostInfo`，本地 Tab = `LOCAL_SCOPE_KEY`），不再按左右栏端点算；
 *     局部书签在本地栏也真正局部（此前无连接身份 ⇒ 落库不带键 ⇒ 静默变全局）。
 *   - 2026-10-21 (Hy4 preview) 书签列表按内容签名缓存（getBookmarksForPaneType / getAllBookmarksForPane
 *     原先每次变更检测都 filter+sort 出新数组，配合弹层无 trackBy 的 *ngFor 导致
 *     每轮销毁重建所有行 ⇒ 面板偶尔闪出 1px 横线）；
 *     2026-10-19 — 书签弹层尺寸可拖拽（左/下/左下角）+ 右栏右缘偏移 -2px 对齐左栏观感；
 *     2026-10-18 — issue #27 P3：跨簇依赖区新增 _rlPath / _rightKind 声明（右栏本地端点书签需记住右栏当前路径）。
 *   - 2026-10-19 (Deepseek-V4.1-Flash) 右键编辑可切换归属范围（局部 <-> 全局）：编辑态 openBookmarkAddForm 只切范围不清空表单，
 *     addBookmark 编辑分支把 connectionKey 一并 update（空串 = 转全局）。
 *   - 2026-10-19 (Deepseek-V4.1-Flash) 联动跳转前做存在性校验（_otherPanePathExists 钩子，不存在跳过 + toast）。
 *   - 2026-10-20 (Deepseek-V4.1-Flash) 修「拖过的高度重开丢失」：maxH 的理想上限改为 max(420, 上次保存高度)（原先恒取 420，
 *     超过 420 的高度被压回）；拖拽起点改用 DOM 实测高度（原先取 maxH，首次拖会一上手就跳到 420）。
 *   - 2026-10-19 (Deepseek-V4.1-Flash) 书签排序：bookmarkSortByUsage（false=拖拽顺序/true=使用频率降序，稳定排序、返回新数组），
 *     点击书签累加 useCount；列表项显示「联动」标签（linkedPath 非空）。
 *   - 2026-10-19 (Deepseek-V4.1-Flash) 箭头跟随：记下触发按钮中心 (_bookmarkAnchorCenterX)，改宽度时用 _applyBookmarkArrowLeft 重算，
 *     修「拖完尺寸后尖端不指向按钮、重开才正常」；新增联动书签（bookmarkLinkEnabled + linkedPath，gotoBookmark 后驱动另一栏）。
 *   - 2026-10-19 (Deepseek-V4.1-Flash) 书签弹层可拖拽调尺寸（左/下/左下角，下限 220×140，尺寸记 localStorage；
 *     左下角双击 resetBookmarkPopupSize 还原默认并清除记忆）；
 *     右栏弹层右缘偏移 -1px → -2px，与左栏观感齐平（用户实测）。
 *   - 2026-10-18 (Hy3) issue #27 P3 书签归属修复：toggleBookmarksForPane 入参由「类型 local/remote」改为「所属栏 left/right」，
 *     书签的类型/锚定面板/导航随该栏端点而定（连接身份自 2026-10-22 起改按 Tab 连接算，见上）；
 *     新增 _bookmarkSide / _activeBookmarkConnKey（2026-10-22 更名 _bookmarkScopeKey） / _bookmarkCurrentPath，
 *     gotoBookmark 改为按栏导航（左栏走 localPath/refreshLocal、右本地走 _rlGo/_rlRefresh），
 *     并补 _rlPathInput/_rlRefresh/_rlGo 跨簇声明。
 *   - （历史：2026-09-30 本地面板书签弹层右缘偏移 1px→2px、远程 2px→1px；2026-09-21 书签宽高按触发面板可用空间 clamp）
 */
import * as path from 'path'
import { Bookmark, LOCAL_SCOPE_KEY, SftpBookmarksService, normalizeBookmarkPath } from '../../services/sftp-bookmarks.service'
import type { BookmarkScope } from '../core/panel-types'
import type { BookmarkSortMode } from '../../tabby/config-provider'
import { log } from '../../services/sftp-logger'
import { SftpPanelViewerController } from './panel-viewer-controller'

/** ★ 2026-10-19（Deepseek-V4.1-Flash）：书签弹层尺寸记忆（用户拖过左边框/下边框后记住，下次打开沿用） */
const BM_SIZE_KEY = 'sftp-plus-bookmark-popup-size'
/** 弹层可拖拽的下限（再小列表就没法看了） */
const BM_MIN_W = 220
const BM_MIN_H = 140
/** 弹层理想尺寸（用户没拖过时按这个开） */
const BM_IDEAL_W = 320
const BM_IDEAL_H = 420

/**
 * ★ 2026-10-23（Deepseek-V4.1-Flash）：**单栏**书签弹层的全部视图状态。
 *   原先这些字段都是控制器上的单个副本（`showBookmarks` / `bookmarkAddScope` / `newBookmarkName` /
 *   `bookmarkPopupX…` / `dragOverIdx…`），天然只能存在一个弹层；用户要求「图钉钉住后两栏可以同时打开」，
 *   故按栏拆成两份槽位（`_bmPanels.left` / `.right`），模板用 `*ngFor` 渲染两实例。
 *   ⛔ 新增任何「弹层外观/表单/拖拽」状态都要加到这里，别再加回控制器单例字段 ——
 *     加回单例就会出现「两栏共用一份，开第二个把第一个的输入框内容抢走」。
 */
export interface BookmarkPaneState {
  /** 该栏弹层是否打开 */
  open: boolean
  /**
   * ★ 2026-10-23 续（Deepseek-V4.1-Flash）：本栏被布局临时隐藏（切单栏 / 窄窗只显一栏）时置 true。
   *   ⛔ 不要用「关闭」来实现隐藏——关闭会丢滚动位置、展开的分组和正在编辑的表单，
   *     而且窗口再放大会回不来（用户实测：「另一栏书签面板会消失了」）。挂起只是 display:none。
   */
  suspended: boolean
  /** 该栏端点类型（决定筛选 local / remote 书签；左栏可能切远程） */
  pane: 'local' | 'remote'
  x: number
  y: number
  /** 当前渲染宽度（可能被可用空间压小，⚠️ 不是用户目标宽度，见 userW） */
  w: number
  maxH: number
  /** 当前渲染的固定高度（null = 内容自适应，可能被可用空间压小，⚠️ 用户目标见 userH） */
  h: number | null
  /**
   * 用户拖出的**目标**宽度（null = 没拖过，用理想值）。
   * ★ 2026-10-23 续：必须把「用户目标」与「当前渲染值」分开存。原先重锚直接
   *   `st.w = min(widthCap, …)` 把渲染值写小，导致「窗口缩小再放大」后弹层回不到原尺寸
   *   （用户实测：「之前书签面板大小是对的，经过缩放后又不对了」）。现在每次都从 userW 重算。
   */
  userW: number | null
  /** 用户拖出的**目标**高度（null = 内容自适应）；语义同 userW */
  userH: number | null
  arrowLeft: number
  /** 触发按钮中心的 x（相对 .sftp-root），拖宽时据此重算箭头 */
  anchorCenterX: number | null
  // 表单（新增/编辑）
  addScope: 'connection' | 'global' | null
  newName: string
  newPath: string
  newLinkedPath: string
  editingId: string | null
  // 拖拽排序
  dragSourceIdx: number
  dragSourceScope: BookmarkScope
  dragOverIdx: number
  dragOverScope: BookmarkScope
  dragOverBottom: boolean
  /** 列表内容签名缓存（每栏各一份：pane 可能不同） */
  listCache: { sig: string; conn: Bookmark[]; global: Bookmark[]; all: Bookmark[] } | null
}

function createBookmarkPaneState(pane: 'local' | 'remote'): BookmarkPaneState {
  return {
    open: false,
    suspended: false,
    pane,
    x: 0,
    y: 0,
    w: BM_IDEAL_W,
    maxH: BM_IDEAL_H,
    h: null,
    userW: null,
    userH: null,
    arrowLeft: 24,
    anchorCenterX: null,
    addScope: null,
    newName: '',
    newPath: '',
    newLinkedPath: '',
    editingId: null,
    dragSourceIdx: -1,
    dragSourceScope: 'all',
    dragOverIdx: -1,
    dragOverScope: 'all',
    dragOverBottom: false,
    listCache: null,
  }
}

export abstract class SftpPanelBookmarkController extends SftpPanelViewerController {
  // ===== 跨簇依赖（由子类 SftpFloatingPanel 提供实现/赋值） =====
  protected hostInfo!: string
  protected _isNarrowLayout!: boolean
  protected localPath!: string
  protected localPathInput!: string
  protected remotePath!: string
  protected remotePathInput!: string
  /** ★ issue #27 P3：右栏本地端点的当前路径与端点类型（右本地书签需记住右栏路径） */
  protected _rlPath!: string
  /** ★ issue #27 P3：右栏本地端点相关状态与方法（书签导航右本地栏用，由子类实现/覆写） */
  protected _rlPathInput!: string
  protected _rlRefresh(): Promise<void> { return Promise.resolve() }
  protected _rlGo(_dir: string): Promise<void> { return Promise.resolve() }
  protected _rightKind!: 'local' | 'remote'
  /** ★ issue #27 P3：左栏端点类型（书签的「路径类型」与导航都随栏端点而定） */
  protected _leftKind!: 'local' | 'remote'
  protected bookmarks!: SftpBookmarksService
  protected saveCurrentPath(): void { /* overridden by subclass */ }
  protected _pushLocalNav(_newPath: string): void { /* overridden by subclass */ }
  protected _pushRemoteNav(_newPath: string): void { /* overridden by subclass */ }

  // ===== 书签状态字段 =====
  // ========== 书签 ==========
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：弹层状态按栏分槽（`_bmPanels`），支持两栏同时打开。
   *   模板用 `*ngFor="let side of bookmarkSides"` 渲染两实例，绑定统一走 `bmState(side).xxx`。
   */
  /** 模板 *ngFor 的稳定数组（⛔ 每次变更检测不能返回新数组，否则弹层被反复卸载重建） */
  readonly bookmarkSides: Array<'left' | 'right'> = ['left', 'right']
  /** 防止打开书签弹窗的同一轮点击被 document 捕获后立即关闭（两栏共用） */
  protected _bookmarkJustOpened = false
  private _bmPanels: Record<'left' | 'right', BookmarkPaneState> = {
    left: createBookmarkPaneState('local'),
    right: createBookmarkPaneState('remote'),
  }
  /** 模板访问入口（返回稳定对象引用，列表缓存挂在里面） */
  bmState(side: 'left' | 'right'): BookmarkPaneState {
    return this._bmPanels[side]
  }
  /**
   * 表单输入回写（模板 `(ngModelChange)` 用）。
   * ★ 2026-10-23：写成方法而不是模板里 `bmState(side).newName = $event` ——
   *   「方法调用结果」当赋值左值虽然能解析，但语义含混且 JIT 下报错位置很不直观，这里显式收口。
   */
  setBookmarkDraft(side: 'left' | 'right', field: 'newName' | 'newPath' | 'newLinkedPath', value: string): void {
    this._bmPanels[side][field] = value
  }
  /**
   * 是否有任一栏的书签弹层打开。
   * ⛔ 面板侧的「弹层打开时不响应快捷键 / 点外部关闭 / Esc 关闭」都用这个**整体**语义
   *   （点外部、Esc 一关就是全部），不要拆成「当前栏」——那会让 Esc 只关一半。
   */
  get showBookmarks(): boolean {
    return this._bmPanels.left.open || this._bmPanels.right.open
  }
  /**
   * 是否有**屏幕上可见**的书签弹层（被布局挂起的不算）。
   * ★ 2026-10-23 续：与 `showBookmarks` 分开——`showBookmarks` 是「状态上还开着」（含被布局
   *   临时隐藏的那栏，用于重锚/恢复/整体关闭），`bookmarksVisible` 是「用户真看得见」。
   *   全局快捷键（Delete/F5 等）的守卫必须读后者：否则窄窗切到单栏后，被挂起的弹层会让
   *   文件列表里的快捷键一直失效，而用户屏幕上根本看不到任何弹层。
   */
  get bookmarksVisible(): boolean {
    return this.bookmarkSides.some(side => {
      const st = this._bmPanels[side]
      return st.open && !st.suspended
    })
  }
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：「联动书签」开关（设置页「定制书签面板」）。
   *   开启后表单多出「联动路径」输入；点击书签时本栏跳 path、另一栏跳 linkedPath。
   */
  bookmarkLinkEnabled = false
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：书签排序方式（设置页 / 弹层 footer 左侧按钮两处入口）。
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：由布尔 `bookmarkSortByUsage` 扩成三档：
   *   'manual' = 用户拖拽顺序（默认，可拖拽）；'usage' = 使用次数降序；'name' = 名称升序。
   *   由面板从配置读取并写回，控制器只持有当前值 + 负责排序。
   */
  bookmarkSortMode: BookmarkSortMode = 'manual'
  /** 尺寸拖拽期间挂在 document 上的监听清理函数（同一时刻只拖一个弹层，两栏共用） */
  private _bmResizeCleanup: (() => void) | null = null
  /** 兼容选项：选中书签后自动关闭书签面板（由设置驱动） */
  closeBookmarkPanelOnSelect = false
  /** 是否按「局部 / 全局」分组显示书签（默认开启） */
  bookmarkPanelGroupByScope = true
  /** 分组块显示顺序（内部 id 保持 connection/global，已落进配置） */
  bookmarkPanelGroupOrder: Array<'connection' | 'global'> = ['connection', 'global']

  private _bmListSignature(side: 'left' | 'right'): string {
    const st = this._bmPanels[side]
    const all = this.bookmarks.getAll()
    let s = `${st.pane}|${this._bookmarkScopeKey}|${this.bookmarkSortMode}|${all.length}`
    for (const b of all) {
      s += `\n${b.id}\u0001${b.name}\u0001${b.path}\u0001${b.linkedPath || ''}\u0001${b.connectionKey || ''}\u0001${b.type}\u0001${b.useCount || 0}`
    }
    return s
  }

  /**
   * 取缓存（签名变化时重建三份列表，否则复用同一引用）。
   * ★ 2026-10-23：缓存按栏各存一份（`st.listCache`）—— 两栏端点类型可能不同（左本地/右远程、
   *   或双远程），列表筛选口径跟着 `st.pane` 走，共用一份缓存会互相覆盖。
   */
  private _bmLists(side: 'left' | 'right'): { conn: Bookmark[]; global: Bookmark[]; all: Bookmark[] } {
    const st = this._bmPanels[side]
    const sig = this._bmListSignature(side)
    if (st.listCache && st.listCache.sig === sig) return st.listCache
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：局部列表现在**本地栏也有条目**（本地 Tab 的归属键是
    //   LOCAL_SCOPE_KEY），不再有「本地栏 ⇒ 空数组」的特例。
    const ck = this._bookmarkScopeKey
    const connList = this._sortBookmarks(this.bookmarks.getByConnection(ck).filter(b => b.type === st.pane))
    const globalList = this._sortBookmarks(this.bookmarks.getGlobal().filter(b => b.type === st.pane))
    const allList = this._sortBookmarks(this.bookmarks.getByType(st.pane, ck))
    st.listCache = { sig, conn: connList, global: globalList, all: allList }
    return st.listCache
  }

  // ========== 书签方法（从组件抽取） ==========

  /**
   * 打开/关闭某栏的书签弹层。
   * ★ issue #27 P3（书签归属修复）：入参由「书签类型 local/remote」改为「所属栏 left/right」。
   * 书签的「路径类型」与「导航目标」随该栏端点而定：
   *   - 左栏：本地盘或左远程，均复用本地面板机制（localPath/refreshLocal）
   *   - 右栏：远程走 remotePath/refreshRemote，右本地走 _rlPath/_rlRefresh
   * ⛔ 「归属范围（局部/全局）」**不**随栏端点而定，它只看面板所在 Tab 的连接（见 `_bookmarkScopeKey`）。
   *
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：两栏**各自独立**（状态在 `bmState(side)`）。
   *   ⛔ 互斥规则（用户 2026-10-23 拍板）：**未钉住时仍只允许一个弹层**——开右栏自动收左栏；
   *     **钉住（常驻）后两栏可并存**。别把并存做成无条件：非常驻的口径是「点外部就收」，
   *     让两个弹层同时漂着会与这份手感冲突。
   *   再点同一栏的 ★ 只关自己，绝不影响另一栏。
   */
  toggleBookmarksForPane(side: 'left' | 'right', event?: MouseEvent): void {
    const st = this._bmPanels[side]
    if (st.open) {
      // 点击同一个 ★ 按钮 → 关闭该栏
      this.closeBookmarksAt(side)
      return
    }
    // 非常驻（未钉住）时保持旧口径：同时只允许一个弹层
    if (!this.bookmarkPinned) {
      const other: 'left' | 'right' = side === 'left' ? 'right' : 'left'
      if (this._bmPanels[other].open) this._closeBookmarkPane(other)
    }
    // 书签类型随该栏端点（local=本地盘路径，remote=远端服务器路径）
    st.pane = side === 'left' ? this._leftKind : this._rightKind
    st.addScope = null
    st.newPath = this._bookmarkCurrentPathOf(side)
    st.newName = ''
    st.newLinkedPath = ''
    st.editingId = null

    // 计算弹出位置：按钮下方、贴齐该栏右缘，在 .sftp-root 内；宽高按触发面板可用空间 clamp
    // ★ 2026-10-23：定位逻辑抽进 `_layoutBookmarkPane`，与窗口/面板尺寸变化时的重锚共用同一套
    const btn = (event?.currentTarget ?? event?.target) as HTMLElement | null
    const rootEl = (this.elRef?.nativeElement as HTMLElement)?.querySelector('.sftp-root') as HTMLElement | null
    if (!rootEl) {
      st.x = 80
      st.y = 87
      st.w = BM_IDEAL_W
      st.maxH = BM_IDEAL_H
      st.h = null
      st.arrowLeft = 160
    } else {
      this._layoutBookmarkPane(side, rootEl, btn, 'open')
    }
    // ★ 2026-10-23 续：新打开的弹层一定不是「挂起」状态（可能继承上一次布局隐藏时的残留标记）
    st.suspended = false
    this._bookmarkJustOpened = true
    st.open = true
    queueMicrotask(() => { this._bookmarkJustOpened = false })
  }

  /**
   * 计算/重算某栏弹层的几何（位置、宽度、高度上限、箭头锚点）。
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：**打开时与窗口/面板尺寸变化后共用这一套**。
   *   原先 resize 只做「不越界」钳制（`_clampBookmarkPopupToRoot` 里就地算），窗口一缩小，
   *   pane 变窄而弹层 x 保持旧绝对值 ⇒ 弹层脱离自己那一栏、飘到中间压住对面栏（用户实测截图）。
   *   现在 resize 走 `'relayout'`：按当前 pane 位置重新贴齐右缘，尺寸沿用用户拖出的值再按新空间 clamp。
   *
   * @param rootEl `.sftp-root`（弹层相对 `.sftp-overlays` 定位，与 root 同坐标系）
   * @param btn    触发用的 ★ 按钮（打开时传；重锚时传 null，改为按栏定位）
   * @param mode   'open' = 读 localStorage 尺寸记忆；'relayout' = 沿用**用户目标尺寸**（userW/userH）重算
   *
   * ★ 2026-10-23 续（Deepseek-V4.1-Flash）：尺寸输入必须是 `userW / userH`（用户拖出来的目标值），
   *   计算结果的 `st.w / st.h` 只是**本次**渲染值。原先 relayout 用上一轮的 st.w/st.h 当输入，
   *   窗口缩小把 st.w 写小后再放大就回不去了（用户实测：「之前大小是对的，缩放后就不对了」）。
   *   ⛔ 别改回「读 st.w/st.h 再 clamp 自己」——那样尺寸只会单向递减。
   */
  private _layoutBookmarkPane(
    side: 'left' | 'right',
    rootEl: HTMLElement,
    btn: HTMLElement | null,
    mode: 'open' | 'relayout',
  ): void {
    const st = this._bmPanels[side]
    const rootRect = rootEl.getBoundingClientRect()
    const btnRect = btn?.getBoundingClientRect() ?? null
    // 栏宿主：打开时从按钮往上找；重锚时按 data-pane-side 找（右栏有远程/右本地两套模板，见模板属性）
    const paneHost = (btn?.closest('sftp-file-pane') as HTMLElement | null)
      ?? (rootEl.querySelector(`sftp-file-pane[data-pane-side="${side}"]`) as HTMLElement | null)
    const paneRect = paneHost?.getBoundingClientRect() ?? null
    const titleRect = (paneHost?.querySelector('.pane-title') as HTMLElement | null)?.getBoundingClientRect() ?? null
    // ★ 用 getBoundingClientRect（精确到像素），避免 clientWidth 为 0 时回退 window 导致拆分窗溢出
    const rootW = rootRect.width
    const rootH = rootRect.height
    const margin = 4
    const idealW = BM_IDEAL_W
    const idealH = BM_IDEAL_H
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：优先沿用用户上次拖出来的尺寸（仍要过下面的可用空间 clamp）
    // ★ 2026-10-23 续：打开时把记忆写进 userW/userH，之后重锚一律以此为输入
    const savedSize = mode === 'open' ? this._readSavedBookmarkPopupSize() : null
    if (mode === 'open') {
      st.userW = savedSize?.w ?? null
      st.userH = savedSize?.h ?? null
    }
    // 宽度：优先贴齐触发面板；窄窗上下布局时最多占面板约 72%，给文件列表留缝
    const paneW = paneRect && paneRect.width > 0 ? paneRect.width : rootW
    const preferredW = st.userW ?? idealW
    const widthCap = this._isNarrowLayout
      ? Math.min(preferredW, Math.max(180, Math.floor(paneW * 0.72)))
      : preferredW
    st.w = Math.min(widthCap, Math.max(160, Math.floor(Math.min(rootW, paneW) - margin * 2)))

    // 水平位置：右缘贴齐触发面板右缘，向左展开
    // ★ 2026-09-30：偏移量 1px → 2px。本地面板的右邻是分割线，弹层右缘落在自己面板外框内 1px 时
    //   仍压住分割线那一侧，并排对比下肉眼可见（用户实测：「本地的还得再往左 1px」）。
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：右栏也统一用 -2（右栏右缘是整块面板外缘，比左栏贴分割线
    //   的那一侧多出 root 的 1px 内边距；两侧视觉要齐平）。若将来 root 内边距改动，两处要一起复核。
    const paneLeft = paneRect ? paneRect.left - rootRect.left : null
    const paneRight = paneRect ? paneRect.right - rootRect.left : null
    let left: number
    if (paneLeft != null && paneRight != null) {
      left = Math.max(paneLeft + margin, paneRight - st.w - 2)
    } else {
      // 拿不到栏几何（面板还没渲染完）时退回按钮/右缘兜底，绝不留 undefined 坐标
      left = btnRect ? btnRect.right - rootRect.left - st.w : rootW - st.w - 2
      left = Math.max(margin, left)
    }
    left = Math.max(2, Math.min(left, rootW - st.w - 2))
    st.x = left

    // 垂直位置：落在触发面板标题栏下方
    const anchorBottom = titleRect
      ? titleRect.bottom
      : (btnRect ? btnRect.bottom + 4 : rootRect.top + 40)
    let top = anchorBottom - rootRect.top
    // 高度：优先落在触发面板内剩余高度，再与整根面板 clamp（拆分窗远程半屏常见不足 420）
    const spaceBelowRoot = Math.max(96, rootRect.bottom - anchorBottom - margin)
    const spaceBelowPane = paneRect
      ? Math.max(96, paneRect.bottom - anchorBottom - margin)
      : spaceBelowRoot
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：maxH 的「理想上限」要能容纳用户上次拖出的高度——
    //   原先固定用 idealH(420) 取 min，用户把面板拖到比 420 更高后，重开会被压回 420（高度"记不住"）。
    //   现在理想上限 = max(420, 用户高度)，再与本次可用空间取 min。
    // ★ 2026-10-23 续：入参改用 userH（用户目标高度）。⛔ 别用 st.h —— 那是上一轮的渲染值，
    //   窗口缩小压小它之后再放大，maxH 就一路递减，弹层高度回不到用户拖出的值。
    const preferredH = st.userH ?? 0
    let maxH = Math.min(Math.max(idealH, preferredH), spaceBelowRoot, spaceBelowPane)
    // 下方不够时尽量上移，保证弹层仍落在 .sftp-root 内
    if (top + maxH > rootH - margin) {
      top = Math.max(margin, rootH - margin - maxH)
    }
    if (top + maxH > rootH - margin) {
      maxH = Math.max(96, rootH - margin - top)
    }
    st.y = top
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：高度沿用上次拖出的值（clamp 到本次可用空间），
    //   同时把 max-height 抬到不低于它，否则固定高度会被旧的 420 上限压回去。
    // ★ 2026-10-23 续：两种模式都从 userH 出发（open 时 userH 刚从记忆里赋值），只写渲染值 st.h。
    st.h = st.userH == null ? null : Math.min(Math.max(BM_MIN_H, st.userH), maxH)
    st.maxH = Math.max(maxH, st.h ?? 0)

    // ★ 2026-10-19（Deepseek-V4.1-Flash）：记下触发按钮中心（root 坐标），之后改宽度/重锚时箭头据此重新对准
    const anchorBtn = btn ?? (paneHost?.querySelector('.bm-btn') as HTMLElement | null)
    const anchorRect = anchorBtn?.getBoundingClientRect() ?? null
    if (anchorRect) st.anchorCenterX = anchorRect.left + anchorRect.width / 2 - rootRect.left
    this._applyBookmarkArrowLeft(side)
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：按「触发按钮中心」重算箭头水平偏移（相对弹层左缘）。
   *   箭头宽 12px ⇒ 让它中心落在按钮中心上就是 `中心 - left - 6`；再钳制在 [12, 宽-24] 之间，
   *   弹层被拖得比按钮中心还窄时箭头贴边（视觉上仍朝按钮方向）。
   * ★ 2026-10-23：按栏计算（两栏各有自己的 x / 宽 / 锚点）。
   */
  private _applyBookmarkArrowLeft(side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    const arrowSize = 12
    const center = st.anchorCenterX
    const raw = center == null ? st.arrowLeft : center - st.x - arrowSize / 2
    st.arrowLeft = Math.max(12, Math.min(st.w - 24, raw))
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：窗口/面板尺寸变化后重排所有已打开的书签弹层。
   *   常驻后缩放窗口不再关闭弹层（原先 `_closeFloatingPanelsOnResize` 一律关掉，理由是坐标会过期），
   *   所以这里做「重新贴合本栏 + 不越界」：位置、宽度、高度上限、箭头锚点全部按新几何重算。
   * ★ 2026-10-23 续：**必须重锚，不能只 clamp**。原先只把 x/y 钳在 root 内，pane 变窄后弹层仍停在旧 x，
   *   结果脱离自己那一栏、飘到中间压住对面栏（用户实测截图）。现在走 `_layoutBookmarkPane(…, 'relayout')`，
   *   与打开时同一套贴齐规则，尺寸沿用用户拖出的值再按新空间收放。
   *   ⛔ 别退回「缩放就关」：用户明确要求常驻时弹层留在原地。
   * ★ 2026-10-23 续二：本栏被布局隐藏（切到单栏布局 / 窄窗只显示一栏）时**挂起**本栏弹层
   *   （`suspended = true` ⇒ 模板 display:none），**不是关闭**。
   *   ⛔ 别改回 `_closeBookmarkPane(side)`：关闭会丢滚动位置/展开的分组/正在编辑的表单，
   *     而且窗口再放大回来那一栏的弹层不会自己回来（用户实测：「另一栏书签面板会消失了」）。
   *   恢复可见时清掉 suspended 并重锚，尺寸仍按 userW/userH 算 ⇒ 与缩放前一致。
   */
  _clampBookmarkPopupToRoot(): void {
    const rootEl = (this.elRef?.nativeElement as HTMLElement)?.querySelector('.sftp-root') as HTMLElement | null
    const rect = rootEl?.getBoundingClientRect()
    if (!rootEl || !rect || rect.width <= 0 || rect.height <= 0) return
    for (const side of this.bookmarkSides) {
      const st = this._bmPanels[side]
      if (!st.open) continue
      const paneHost = rootEl.querySelector(`sftp-file-pane[data-pane-side="${side}"]`) as HTMLElement | null
      const paneRect = paneHost?.getBoundingClientRect()
      if (!paneHost || !paneRect || paneRect.width <= 0 || paneRect.height <= 0) {
        // 本栏已被布局隐藏 ⇒ 挂起（保留状态，等布局恢复），另一栏不受影响
        st.suspended = true
        continue
      }
      st.suspended = false
      this._layoutBookmarkPane(side, rootEl, null, 'relayout')
    }
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：拖拽调整书签弹层尺寸。
   *   dir = 'w'（左边框，右缘固定、向左扩）| 's'（下边框）| 'sw'（左下角，两者同时）。
   *   下限 BM_MIN_W/BM_MIN_H，上限取 `.sftp-root` 内可用空间；松手后写入 localStorage，
   *   下次打开沿用（见 toggleBookmarksForPane 里的 savedSize）。
   * ★ 2026-10-23：带 side 参数（两栏各有自己的几何）；测量实际渲染高度时按 `data-bm-side` 定位到本栏弹层。
   */
  startBookmarkResize(dir: 'w' | 's' | 'sw', ev: MouseEvent, side: 'left' | 'right'): void {
    ev.preventDefault()
    ev.stopPropagation()
    const st = this._bmPanels[side]
    if (!st.open) return
    const rootEl = (this.elRef?.nativeElement as HTMLElement)?.querySelector('.sftp-root') as HTMLElement | null
    const rootRect = rootEl?.getBoundingClientRect()
    const startX = ev.clientX
    const startY = ev.clientY
    const startW = st.w
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：高度起点必须取**实测渲染高度**。
    //   原先 `st.h ?? maxH`：首次拖下边框时 H 还是 null（内容自适应，可能只有 250），
    //   起点却拿 maxH(420) ⇒ 一开始拖动面板就跳到 420 附近，存下来的值也不是用户拖到的高度。
    // ★ 2026-10-23：两栏可能同时开着，`querySelector('.bookmark-popup')` 会取到错的那个 ⇒ 按栏过滤。
    const popupHost = rootEl
      ? Array.from(rootEl.querySelectorAll('sftp-bookmark-popup'))
          .find(el => el.getAttribute('data-bm-side') === side) as HTMLElement | undefined
      : undefined
    const popupEl = (popupHost?.querySelector('.bookmark-popup') as HTMLElement | null) ?? null
    const measuredH = popupEl?.getBoundingClientRect().height ?? 0
    const startH = Math.round(measuredH > 0 ? measuredH : (st.h ?? st.maxH))
    const startLeft = st.x
    const startTop = st.y
    // 左边缘拖拽时右缘必须固定，否则弹层会整体平移
    const rightEdge = startLeft + startW
    const maxW = rootRect ? Math.max(BM_MIN_W, Math.floor(rootRect.width - 4)) : 4000
    const maxH = rootRect ? Math.max(BM_MIN_H, Math.floor(rootRect.height - startTop - 4)) : 4000

    this._bmResizeCleanup?.()
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (dir === 'w' || dir === 'sw') {
        const w = Math.min(maxW, Math.max(BM_MIN_W, Math.round(startW - dx)))
        st.w = w
        st.x = Math.max(2, Math.round(rightEdge - w))
        // 右缘本来贴近面板右边界时，可能被 2px 边距挡住 ⇒ 宽度跟着收，保持右缘不动
        st.w = Math.min(w, Math.max(BM_MIN_W, rightEdge - st.x))
        // ★ 2026-10-23 续：用户拖出来的就是**目标宽度**，必须记进 userW，
        //   否则后续 relayout 拿渲染值当输入、窗口缩一下就把这个宽度永久改小。
        st.userW = st.w
        this._applyBookmarkArrowLeft(side)
      }
      if (dir === 's' || dir === 'sw') {
        st.h = Math.min(maxH, Math.max(BM_MIN_H, Math.round(startH + dy)))
        // 固定高度必须同时抬高 max-height，否则 CSS 的 maxHeight 会把它压回去
        st.maxH = Math.max(st.maxH, st.h)
        st.userH = st.h
      }
    }
    const onUp = () => {
      this._bmResizeCleanup = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      this._persistBookmarkPopupSize(side)
    }
    // 监听挂在 document：拖动过程中鼠标离开边框/面板也不会中断（与表头拖拽同一手法）
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    this._bmResizeCleanup = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：双击手柄还原尺寸。
   *   dir = 'w' 只还原宽度（左边缘双击）/ 's' 只还原高度（下边缘双击）/ 'sw' 两者都还原（左下角双击）。
   *   宽度还原 = 理想 320 按可用空间 clamp，右缘保持不动；高度还原 = 回到内容自适应（H=null，420 上限）。
   *   记忆同步：'sw' 清空记录（等价「从未拖过」）；单边还原写回当前值，另一边的自定义尺寸保留。
   */
  resetBookmarkPopupSize(dir: 'w' | 's' | 'sw', side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    const rootEl = (this.elRef?.nativeElement as HTMLElement)?.querySelector('.sftp-root') as HTMLElement | null
    const rootRect = rootEl?.getBoundingClientRect()
    if (dir === 'w' || dir === 'sw') {
      const idealW = BM_IDEAL_W
      const maxW = rootRect ? Math.max(BM_MIN_W, Math.floor(rootRect.width - 8)) : idealW
      const nextW = Math.min(idealW, maxW)
      const rightEdge = st.x + st.w
      st.w = nextW
      // ★ 2026-10-23 续：还原 = 回到「没拖过宽度」⇒ 清掉目标值，之后重锚按理想宽度算
      st.userW = null
      st.x = Math.max(2, Math.round(rightEdge - nextW))
      this._applyBookmarkArrowLeft(side)
    }
    if (dir === 's' || dir === 'sw') {
      // 高度回到自适应：H=null，上限仍按当前可用空间与 420 取小
      const spaceBelow = rootRect ? Math.max(BM_MIN_H, Math.floor(rootRect.height - st.y - 4)) : BM_IDEAL_H
      st.h = null
      st.userH = null
      st.maxH = Math.min(BM_IDEAL_H, spaceBelow)
    }
    if (dir === 'sw') {
      try { localStorage.removeItem(BM_SIZE_KEY) } catch { /* ignore */ }
    } else {
      this._persistBookmarkPopupSize(side)
    }
  }

  /** 读取上次拖出的弹层尺寸（缺失/非法返回 null；h 为 null = 只记过宽度，高度仍自适应） */
  private _readSavedBookmarkPopupSize(): { w: number; h: number | null } | null {
    try {
      const raw = localStorage.getItem(BM_SIZE_KEY)
      if (!raw) return null
      const o = JSON.parse(raw)
      const w = Number(o?.w)
      if (!Number.isFinite(w)) return null
      const h = Number(o?.h)
      return {
        w: Math.max(BM_MIN_W, Math.round(w)),
        h: Number.isFinite(h) ? Math.max(BM_MIN_H, Math.round(h)) : null,
      }
    } catch { return null }
  }

  private _persistBookmarkPopupSize(side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    try {
      // ★ 只记「用户真的拖过的高度」：没拖过时存 null，否则会把当时的可用空间上限
      //   当成固定高度记下来，下次打开内容少的书签列表下方会留一大片空白。
      // ★ 2026-10-23：两栏共用同一份记忆（谁拖的以谁为准）——它们是同一个用户偏好，
      //   分栏记忆会让「拖过左栏、右栏还是老尺寸」显得没生效。
      // ★ 2026-10-23 续：存**用户目标尺寸**（userW/userH），不存被空间压小的渲染值 ——
      //   否则在窄窗里拖一次，记忆里就留下一个偏小的宽度，之后每次打开都偏小。
      localStorage.setItem(BM_SIZE_KEY, JSON.stringify({
        w: Math.round(st.userW ?? BM_IDEAL_W),
        h: st.userH == null ? null : Math.round(st.userH),
      }))
    } catch { /* localStorage 不可用时忽略 */ }
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：书签弹层是否「常驻」（= 弹层 footer 图钉钉住）。
   *   ⛔ 配置项叫 `closeBookmarkPanelOnSelect`（语义是「选中后关闭」），常驻是它的**取反**。
   *     取反只在这里做一次：模板绑定、点外部、滚轮、右键、框选、窗口缩放统统读本 getter，
   *     别在调用点各写一遍 `!closeBookmarkPanelOnSelect`（写漏一处就出现「钉住了但某一处还关」）。
   */
  get bookmarkPinned(): boolean {
    return !this.closeBookmarkPanelOnSelect
  }

  /**
   * 隐式关闭（点面板其它位置 / 滚轮 / 右键菜单 / 框选 / 窗口缩放）。
   * ★ 2026-10-23：常驻时一律不动 —— 只有显式入口（「关闭」按钮、再点一次 ★ 按钮、Esc）才关。
   *   ⛔ 别把 `closeBookmarks()` 直接换成这里：显式入口必须走原方法，否则图钉钉住后连「关闭」都点不动。
   */
  closeBookmarksIfNotPinned(): void {
    if (this.bookmarkPinned) return
    this.closeBookmarks()
  }

  /**
   * 关闭所有书签弹层（隐式关闭：点外部 / 滚轮 / 右键 / 框选 / 缩放窗口 / Esc）。
   * ★ 2026-10-23：两栏可能同时开着，隐式关闭一律**全关**（用户视角「点外面就是收起所有浮层」）。
   *   只想关一栏请用 `closeBookmarksAt(side)`（弹层自己的「关闭」按钮、再点一次 ★）。
   */
  closeBookmarks(): void {
    for (const side of this.bookmarkSides) this._closeBookmarkPane(side)
  }

  /** 只关某一栏（显式入口用） */
  closeBookmarksAt(side: 'left' | 'right'): void {
    this._closeBookmarkPane(side)
  }

  private _closeBookmarkPane(side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    if (!st.open) return
    // ★ 2026-10-19：拖动中关闭时先摘掉 document 监听，避免残留监听继续改尺寸
    this._bmResizeCleanup?.()
    this._bmResizeCleanup = null
    st.open = false
    // ★ 2026-10-23 续：真正关闭时清掉「布局挂起」标记，下次打开从可见状态开始
    st.suspended = false
    st.addScope = null
    st.editingId = null
    st.newName = ''
    st.newPath = ''
    st.newLinkedPath = ''
    // 拖拽高亮状态一并复位，避免下次打开残留落点线
    st.dragSourceIdx = -1
    st.dragOverIdx = -1
    st.dragOverBottom = false
  }

  /** 打开添加书签表单 */
  /**
   * 打开添加表单 / 切换归属范围（connection=局部（本 Tab 连接），global=全局）。
   * ⛔ 内部值仍叫 `'connection'`：它是 `bookmarkPanelGroupOrder` 落进配置的值（历史 id），
   *   改字面量会让老配置读不到分组顺序；UI 文案由 i18n 决定（+局部 / 局部）。
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：**只要表单已经打开**（新增或右键编辑），切换范围都只改
   *   `addScope`、保留已填内容。原先只有编辑态走这条分支，新增态会重置成「当前路径 + 空名称」，
   *   用户填了一半再点另一个范围就白填了（表现为「新建时不能切」）。
   *   新增态点当前已选中的范围 = 收起表单（原交互）；编辑态不收起，避免编辑 id 残留（收起请点「取消」）。
   * ★ 2026-10-23：带 side（两栏表单互不干扰——常驻时两栏可以同时编辑两个书签）。
   */
  openBookmarkAddForm(scope: 'connection' | 'global', side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    if (st.addScope !== null) {
      if (st.addScope === scope) {
        if (!st.editingId) st.addScope = null
        return
      }
      st.addScope = scope
      this.cdr.detectChanges()
      return
    }
    st.addScope = scope
    st.newPath = this._bookmarkCurrentPathOf(side)
    st.newName = ''
    st.newLinkedPath = ''
  }

  /**
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：「局部书签」的归属键 = **面板当前连接身份**（顶栏显示的那条连接）。
   *   远程标签页 → `hostInfo`（`user@host`，与既有书签键同格式）；本地标签页 → `LOCAL_SCOPE_KEY`。
   *
   * ⛔ 不要改回「按当前栏端点」的旧口径（左栏/右栏各自切到哪个连接就用哪个）：
   *   用户的要求是「+局部 以当前 Tabby 窗口的 tab 连接为准，不管是本地还是远程都如此」，
   *   这样同一个面板里左右栏怎么切，看到的局部书签都是同一批，才不会出现
   *   「左栏加的局部书签，右栏看不见」这种割裂。
   *   注：`hostInfo` 随「右栏连接选择器」切换而更新（switchRemoteSession），左栏走独立第二通道时不变——
   *   与顶栏／传输日志用的连接身份完全同一口径，不另起一套。
   */
  get _bookmarkScopeKey(): string {
    const h = (this.hostInfo || '').trim()
    return h || LOCAL_SCOPE_KEY
  }

  /**
   * ★ issue #27 P3（书签归属修复）：某栏弹层的「当前路径」。
   * 左栏：本地盘与左远程都走 localPath（左远程复用本地面板机制）；
   * 右栏：远程走 remotePath，右本地走 _rlPath。
   * ★ 2026-10-23：由 getter 改成按栏方法——两栏可能同时开着，各自锚自己的路径。
   */
  _bookmarkCurrentPathOf(side: 'left' | 'right'): string {
    if (side === 'left') return this.localPath
    return this._rightKind === 'remote' ? this.remotePath : this._rlPath
  }

  /** 获取全部当前面板的书签（合并列表用） */
  getAllBookmarksForPane(side: 'left' | 'right'): Bookmark[] {
    // 按「路径类型 + 局部作用域」筛选：本栏显示「全局 + 本 Tab 局部」的同类书签
    //   （本地栏现在也会列出局部书签——本地 Tab 的局部键是 LOCAL_SCOPE_KEY，不再是「本地栏只看全局」）
    // ★ 2026-10-21：同样走内容签名缓存（见 _bmLists 注释）
    return this._bmLists(side).all
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：按当前排序方式整理列表。
   *   频率模式用稳定排序（同次数保持原有相对顺序），避免每次重排都跳动；
   *   返回新数组，绝不原地改服务里的数组（那会污染拖拽排序的持久顺序）。
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：新增「名称排序」——用 localeCompare 的 numeric 模式，
   *   让 `第2章` 排在 `第10章` 前（纯字典序会把 10 排到 2 前面）；sensitivity:'base' 让大小写/变音不干扰，
   *   同名的再按路径兜底，保证顺序稳定（不依赖 V8 的排序实现细节）。
   */
  private _sortBookmarks(list: Bookmark[]): Bookmark[] {
    if (this.bookmarkSortMode === 'usage') {
      return [...list].sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
    }
    if (this.bookmarkSortMode === 'name') {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      return [...list].sort((a, b) => collator.compare(a.name || '', b.name || '')
        || collator.compare(a.path || '', b.path || ''))
    }
    return list
  }

  /** 按 scope 获取书签（★ 2026-10-23：带 side，两栏列表各自筛选） */
  getBookmarksForPaneType(scope: 'connection' | 'global', side: 'left' | 'right'): Bookmark[] {
    // ★ 2026-10-21：改走内容签名缓存（模板每次 CD 都调它，原先每轮都新建数组 ⇒ 行被反复重建）
    const lists = this._bmLists(side)
    return scope === 'global' ? lists.global : lists.conn
  }

  /** 提交表单（新增或保存编辑）；side = 哪一栏的弹层 */
  addBookmark(side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    const n = st.newName.trim(); const bp = st.newPath.trim()
    if (!bp) return
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：联动路径仅在开关开启时生效（关掉后表单不显示，值也不写入）
    const link = this.bookmarkLinkEnabled ? st.newLinkedPath.trim() : ''
    const name = n || (st.pane === 'local'
      ? path.basename(bp)
      : path.posix.basename(bp)) || bp

    // 编辑模式：更新已有书签
    if (st.editingId) {
      // ★ 2026-10-22（Deepseek-V4.1-Flash）：编辑时也写回归属范围——表单里切了「+局部 / +全局」要生效。
      //   空串 = 清空 connectionKey（变全局）；选「局部」时一律写当前 Tab 的连接键（本地 Tab 写 LOCAL_SCOPE_KEY，
      //   不再像以前那样「本地栏没有连接身份 ⇒ 顺手当全局」，那是「+本地」名不副实的根源）。
      const editCk = st.addScope === 'connection' ? this._bookmarkScopeKey : ''
      this.bookmarks.update(st.editingId, { name, path: bp, linkedPath: link, connectionKey: editCk })
      st.editingId = null
      st.newName = ''; st.newPath = ''; st.newLinkedPath = ''; st.addScope = null
      return
    }

    const type = st.pane
    // 局部 = 当前 Tab 的连接键（远程 Tab → user@host，本地 Tab → LOCAL_SCOPE_KEY）；全局不带键
    const ck = st.addScope === 'connection' ? this._bookmarkScopeKey : undefined

    // 如果已存在相同 path + type + connectionKey 的书签，覆盖更新名称
    const existing = this.bookmarks.getByPath(bp, type)
    if (existing && existing.connectionKey === ck) {
      this.bookmarks.update(existing.id, { name, linkedPath: link })
      st.newName = ''; st.newPath = ''; st.newLinkedPath = ''; st.addScope = null
      return
    }

    const created = this.bookmarks.add(name, bp, type, ck, link)
    if (!created) {
      // 无效路径：保留表单让用户修正
      return
    }
    st.newName = ''; st.newPath = ''; st.newLinkedPath = ''; st.addScope = null
  }

  cancelBookmarkEdit(side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    st.editingId = null
    st.newName = ''
    st.newPath = ''
    st.newLinkedPath = ''
    st.addScope = null
  }

  removeBookmark(id: string): void { this.bookmarks.remove(id) }

  /** 右键书签条目 — 直接进入编辑模式（★ 2026-10-23：带 side，编辑态锁在对应那栏的表单里） */
  onBookmarkContextMenu(bm: Bookmark, ev: MouseEvent, side: 'left' | 'right'): void {
    ev.preventDefault()
    ev.stopPropagation()
    const st = this._bmPanels[side]
    // 复用添加表单进行编辑；带归属键（含 LOCAL_SCOPE_KEY）即「局部」，无键即「全局」
    st.addScope = bm.connectionKey ? 'connection' : 'global'
    st.newName = bm.name
    st.newPath = bm.path
    st.newLinkedPath = bm.linkedPath || ''
    st.editingId = bm.id
    this.cdr.detectChanges()
  }

  gotoBookmark(bm: Bookmark, side: 'left' | 'right'): void {
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：点击即累加使用次数（「频率排序」的数据来源）
    this.bookmarks.update(bm.id, { useCount: (bm.useCount || 0) + 1 })
    const target = normalizeBookmarkPath(bm.path, bm.type) || bm.path
    // ★ issue #27 P3（书签归属修复）：按「弹层所属栏」而非书签类型导航——
    //   左栏（本地盘或左远程）一律走 localPath/refreshLocal（左远程复用本地面板机制）；
    //   右栏远程走 remotePath/refreshRemote，右本地走 _rlPath/_rlRefresh。
    if (side === 'left') {
      this._pushLocalNav(target)
      this.localPath = target; this.localPathInput = target; this.saveCurrentPath(); void this.refreshLocal()
    } else if (this._rightKind === 'remote') {
      this._pushRemoteNav(target)
      this.remotePath = target; this.remotePathInput = target; this.saveCurrentPath(); void this.refreshRemote()
    } else {
      this._rlGo(target)
      this._rlPath = target; this._rlPathInput = target; this.saveCurrentPath(); void this._rlRefresh()
    }
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：联动书签——本栏跳完后，另一栏也跳到该书签配置的联动路径。
    //   语义「照填即开」：另一栏是什么端点就按什么路径处理（远程栏要填远程路径），不做类型判断。
    if (this.bookmarkLinkEnabled && bm.linkedPath && bm.linkedPath.trim()) {
      void this._navigateOtherPaneByBookmark(side, bm.linkedPath.trim())
    }
    // 兼容选项：选中书签后自动关闭书签面板（仅关弹窗，不动整个 SFTP+ 面板）
    // ★ 2026-10-23：只关**被点击的这栏**——常驻时两栏可能都开着，点左栏书签不该顺手收掉右栏。
    if (this.closeBookmarkPanelOnSelect) {
      this.closeBookmarksAt(side)
    }
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：把「另一栏」导航到联动路径。
   *   左栏书签 → 驱动右栏（远程走 remotePath/refreshRemote，右本地走 _rlPath/_rlRefresh）；
   *   右栏书签 → 驱动左栏（左栏统一走 localPath/refreshLocal，与 gotoBookmark 的既有口径一致）。
   *
   *   ★ 跳转前先确认目标路径**存在且是目录**：不存在就跳过 + 轻提示，避免另一栏被切到不存在的目录
   *     （那会弹「刷新失败」并停在旧列表，比不跳更让人困惑）。判定由子类 `_otherPanePathExists` 实现。
   */
  private async _navigateOtherPaneByBookmark(side: 'left' | 'right' | null, target: string): Promise<void> {
    if (!target) return
    let exists = true
    try { exists = await this._otherPanePathExists(side, target) } catch { exists = true }
    if (!exists) {
      log.warn('[SFTP+] linked path not found, skip navigation:', target)
      try { (this as any).showToast?.(this.i18n.t('bookmark.linkMissing')) } catch { /* 无 toast 能力时静默 */ }
      return
    }
    if (side === 'left') {
      if (this._rightKind === 'remote') {
        this._pushRemoteNav(target)
        this.remotePath = target; this.remotePathInput = target; void this.refreshRemote()
      } else {
        this._rlGo(target)
        this._rlPath = target; this._rlPathInput = target; void this._rlRefresh()
      }
      return
    }
    this._pushLocalNav(target)
    this.localPath = target; this.localPathInput = target; void this.refreshLocal()
  }

  /**
   * 跨簇依赖：判断「另一栏」上的 target 是否存在**且为目录**。
   * 默认放行（返回 true，宁可交给原导航逻辑处理，也不要误拦）；由 SftpFloatingPanel 覆写为
   * 「本地 fs.stat / 远程 sftpSession.stat」的真实探测。
   */
  protected async _otherPanePathExists(_side: 'left' | 'right' | null, _target: string): Promise<boolean> {
    return true
  }

  // ========== 书签拖拽排序（★ 2026-10-23：状态按栏分槽，拖拽只在发起那栏内生效） ==========
  onBookmarkDragStart(ev: DragEvent, index: number, scope: BookmarkScope, side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    st.dragSourceIdx = index
    st.dragSourceScope = scope
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move'
      ev.dataTransfer.setData('text/plain', String(index))
    }
  }

  onBookmarkDragOver(ev: DragEvent, index: number, scope: BookmarkScope, side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    // 只允许同 scope 内的拖拽
    if (scope !== st.dragSourceScope) return
    ev.preventDefault()
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
    st.dragOverIdx = index
    st.dragOverScope = scope
    // 检测鼠标在元素的上半部分还是下半部分
    const el = ev.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    st.dragOverBottom = ev.clientY > rect.top + rect.height / 2
  }

  onBookmarkDragEnd(side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    st.dragSourceIdx = -1
    st.dragOverIdx = -1
    st.dragOverBottom = false
  }

  onBookmarkDrop(ev: DragEvent, targetIdx: number, scope: BookmarkScope, side: 'left' | 'right'): void {
    const st = this._bmPanels[side]
    ev.preventDefault()
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：只有「手动拖拽顺序」允许改持久顺序。
    //   频率/名称模式下列表只是排序结果的视图，拖拽写回会让用户切回手动时看到莫名其妙的排列
    //   （模板已按 sortMode 关掉 draggable，这里是第二道守卫）。
    if (this.bookmarkSortMode !== 'manual') return
    // 只允许同 scope 内 drop
    if (scope !== st.dragSourceScope) return

    const srcIdx = st.dragSourceIdx
    const dropBottom = st.dragOverBottom
    st.dragSourceIdx = -1
    st.dragOverIdx = -1
    st.dragOverBottom = false
    if (srcIdx < 0 || srcIdx === targetIdx) return

    const list = scope === 'all'
      ? this.getAllBookmarksForPane(side)
      : this.getBookmarksForPaneType(scope, side)
    if (srcIdx >= list.length || targetIdx >= list.length) return

    // 在全局书签数组中重新定位
    const all = this.bookmarks.getAll()
    const moved = list[srcIdx]
    const targetItem = list[targetIdx]
    if (!moved || !targetItem) return
    const fromAllIdx = all.findIndex(b => b.id === moved.id)
    const toAllIdx = all.findIndex(b => b.id === targetItem.id)
    if (fromAllIdx < 0 || toAllIdx < 0) return

    // ★ 2026-08-10 修复 #9：落点必须参与计算——拖到目标上半部=插到目标前，
    //   下半部=插到目标后（此前 dragOverBottom 只影响提示线，落点永远等同"目标前"）。
    //   reorder 内部先 splice(from,1) 再 splice(to,0,item)：向下拖时目标索引需 -1 修正
    let adjustedTo: number
    if (fromAllIdx < toAllIdx) {
      adjustedTo = dropBottom ? toAllIdx : toAllIdx - 1
    } else {
      adjustedTo = dropBottom ? toAllIdx + 1 : toAllIdx
    }
    if (adjustedTo === fromAllIdx) return // 落点等效原位，无需移动
    this.bookmarks.reorder(fromAllIdx, adjustedTo)
  }
}

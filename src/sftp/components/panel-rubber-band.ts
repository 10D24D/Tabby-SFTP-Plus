/**
 * 框选（Rubber Band Selection）逻辑
 * @修改人：DD1024z + Hy4 preview
 * @修改时间：2026-10-20 — P2-12：框选的 Ctrl 追加态改为**持续采样**（mousedown / 拖拽中每次
 *              2026-10-20 全量审计：右键框选的菜单抑制定时器由匿名改为 _rbSkipContextMenuTimer，
 *                重排前清旧句柄、dispose 一并清理。
 *               mousemove / mouseup 各刷一次），并在 _rbActivate 里把「框选前选中集」快照提前到
 *               清空选中**之前**拍 —— 原实现只在激活瞬间采样一次，拖拽中途按下 Ctrl 想追加、或
 *               中途松开 Ctrl 想改成替换，都不生效（界面高亮与实际语义相反）。
 *               续四：rl 右键菜单对齐左右栏（反馈③）：框选 'remote' 侧路由归 rl（_rbOnMouseUp 计算 visualPane='rl' + _rbOpenContextMenuAfterBoxSelect 去 rl 早退、改接受 'rl' 路由到 _rightPane 数据槽）。含 2026-10-18 rl 接入框选（'remote' 数据槽按端点类型路由、新增 RubberBandHost 右栏端点路由接口）与 2026-09-29 分组模式框选错行修复（DOM 行序↔过滤列表序改为 data-path 路径映射）。续五：分组头（.group-row）允许起手框选（此前长按/拖拽完全无响应），纯点击仍走分组头 click；框选结束落在分组头上时一次性抑制分组头 click 保护框选结果。
 */
import { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core'
import type { LocalEntry } from '../core/panel-types'
import type { SFTPFile } from '../../services/sftp.service'

export interface RubberBandState {
  active: boolean
  pane: 'local' | 'remote' | ''
  startX: number; startY: number
  currentX: number; currentY: number
  rectLeft: number; rectTop: number; rectWidth: number; rectHeight: number
  startedOnEntry: boolean
}

export interface RubberBandHost {
  zone: NgZone
  cdr: ChangeDetectorRef
  elRef: ElementRef
  selectedLocal: LocalEntry[]
  selectedRemote: SFTPFile[]
  localLastSelectedIndex: number | null
  remoteLastSelectedIndex: number | null
  getFilteredLocalEntries(): LocalEntry[]
  getFilteredRemoteEntries(): SFTPFile[]
  closeContextMenu(): void
  closeBookmarks(): void
  fixContextMenuPosition(x: number, y: number): void
  contextMenuX: number
  contextMenuY: number
  contextMenuPane: 'local' | 'remote' | 'rl'
  contextMenuEntry: LocalEntry | SFTPFile | null
  contextMenuVisible: boolean
  headerMenuVisible: boolean
  syncPaneSelectionVisual(pane: 'local' | 'remote' | 'rl'): void
  // ★ 2026-10-18 issue #27：右栏端点路由 —— 右栏为本地浏览器（rl）时，'remote' 侧数据槽
  //   切换到 _rlSelected/getFilteredRlEntries（远程会话槽仍保留供快速切回，不可再直写）。
  //   DOM 侧不变：rl 面板复用 listClass="remote-pane"，与远程面板互斥渲染。
  rightPaneIsLocalBrowser(): boolean
  getRightPaneSelection(): SFTPFile[] | LocalEntry[]
  setRightPaneSelection(items: SFTPFile[] | LocalEntry[]): void
  getRightPaneLastSelectedIndex(): number | null
  setRightPaneLastSelectedIndex(v: number | null): void
  getRightPaneFilteredEntries(): SFTPFile[] | LocalEntry[]
}

export class PanelRubberBand {
  readonly rubberBand: RubberBandState = {
    active: false,
    pane: '',
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
    rectLeft: 0, rectTop: 0, rectWidth: 0, rectHeight: 0,
    startedOnEntry: false,
  }

  private _rbLongPressTimer: ReturnType<typeof setTimeout> | null = null
  private _rbLongPress = false
  private _rbStartClientX = 0
  private _rbStartClientY = 0
  private _rbMoveHandler: ((e: MouseEvent) => void) | null = null
  private _rbUpHandler: ((e: MouseEvent) => void) | null = null
  private _rbMoved = false
  /** 仅抑制框选 mouseup 落在该行时紧随其后的那一次 click */
  private _rbSuppressClickPath: string | null = null
  private _rbSuppressClickTimer: ReturnType<typeof setTimeout> | null = null
  /** ★ 2026-10-20：右键框选后「抑制下一次右键菜单」定时器（原先匿名、dispose 无法取消） */
  private _rbSkipContextMenuTimer: ReturnType<typeof setTimeout> | null = null
  /** ★ 2026-10-19：框选 mouseup 落在分组头上时，抑制紧随其后的一次分组头 click
   *  （否则框选出的选中集立刻被「整组选中⇄取消」切换覆盖） */
  private _rbSuppressGroupHeaderClick = false
  private _rbSuppressGroupHeaderTimer: ReturnType<typeof setTimeout> | null = null
  private _rbSuppressDrag = false
  private _rbDragCancelled = false
  private _rbIsLeftClick = false
  private _rbSuppressContextMenu = false
  private _rbContextMenuSuppressTimer: ReturnType<typeof setTimeout> | null = null
  private _rbSkipNextContextMenu = false
  private _rbEntryRects: Array<{ top: number; left: number; width: number; height: number }> = []
  private _rbEntryEls: HTMLElement[] = []
  /** ★ 2026-09-29：与 _rbEntryEls 平行的 data-path 数组（分组模式下 DOM 行序 ≠ 过滤列表序，位置对位会选错行） */
  private _rbElPaths: string[] = []
  private _rbPaneListEl: HTMLElement | null = null
  private _rbPaneListRect: DOMRect | null = null
  private _rbScrollHandler: (() => void) | null = null
  private _rbScrollLeft = 0
  private _rbScrollTop = 0
  private _rbRectEl: HTMLElement | null = null
  private _rbCtrlHeld = false
  private _rbRightClick = false
  private _rbCachedLocalEntries: LocalEntry[] | null = null
  private _rbCachedRemoteEntries: Array<SFTPFile | LocalEntry> | null = null
  private _rbPathToIndex = new Map<string, number>()
  private _rbInitialSelectedIndices: Set<number> | null = null
  private _rbLiveSelectedIndices = new Set<number>()
  private _rbFrameId: number | null = null

  constructor(private readonly host: RubberBandHost) {}

  get active(): boolean { return this.rubberBand.active }
  get suppressContextMenu(): boolean { return this._rbSuppressContextMenu }
  get skipNextContextMenu(): boolean { return this._rbSkipNextContextMenu }

  shouldSuppressEntryClick(fullPath: string): boolean {
    if (!this._rbSuppressClickPath || !fullPath) return false
    if (this._rbSuppressClickPath !== fullPath) return false
    this.clearClickSuppress()
    return true
  }

  /** ★ 2026-10-19：一次性消费分组头 click 抑制（框选结束落在分组头上时布防）。
   *  有副作用守卫：命中即解除，调用点每条交互链只允许一处（与 shouldSuppressEntryClick 同规）。 */
  shouldSuppressGroupHeaderClick(): boolean {
    if (!this._rbSuppressGroupHeaderClick) return false
    this._rbSuppressGroupHeaderClick = false
    if (this._rbSuppressGroupHeaderTimer) {
      clearTimeout(this._rbSuppressGroupHeaderTimer)
      this._rbSuppressGroupHeaderTimer = null
    }
    return true
  }

  private _armGroupHeaderClickSuppress(): void {
    this._rbSuppressGroupHeaderClick = true
    if (this._rbSuppressGroupHeaderTimer) clearTimeout(this._rbSuppressGroupHeaderTimer)
    this._rbSuppressGroupHeaderTimer = setTimeout(() => { this._rbSuppressGroupHeaderClick = false }, 400)
  }

  clearClickSuppress(): void {
    this._rbSuppressClickPath = null
    if (this._rbSuppressClickTimer) {
      clearTimeout(this._rbSuppressClickTimer)
      this._rbSuppressClickTimer = null
    }
  }

  markDragCancelled(): void { this._rbDragCancelled = true }

  clearContextMenuSuppress(): void {
    this._rbSuppressContextMenu = false
    this._rbSkipNextContextMenu = false
    if (this._rbContextMenuSuppressTimer) {
      clearTimeout(this._rbContextMenuSuppressTimer)
      this._rbContextMenuSuppressTimer = null
    }
  }

  dispose(): void {
    this.cleanup()
    // ★ 2026-08-10 修复 #23：dispose 同样清理 click 抑制定时器，
    //   否则面板销毁后定时器回调仍会执行（引用残留/迟到状态变更）
    this.clearClickSuppress()
    if (this._rbContextMenuSuppressTimer) {
      clearTimeout(this._rbContextMenuSuppressTimer)
      this._rbContextMenuSuppressTimer = null
    }
    // ★ 2026-10-19：分组头 click 抑制定时器同样随 dispose 清理
    if (this._rbSuppressGroupHeaderTimer) {
      clearTimeout(this._rbSuppressGroupHeaderTimer)
      this._rbSuppressGroupHeaderTimer = null
    }
    this._rbSuppressGroupHeaderClick = false
    // ★ 2026-10-20：右键框选抑制定时器同样随 dispose 清理
    if (this._rbSkipContextMenuTimer) {
      clearTimeout(this._rbSkipContextMenuTimer)
      this._rbSkipContextMenuTimer = null
    }
    this._rbSkipNextContextMenu = false
  }

  cleanup(): void { this._rbCleanup() }

  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    // 只有点中空白区域（非 .entry 元素）才处理
    const target = event.target as HTMLElement | null
    if (target && target.closest('.entry')) return
    if (pane === 'local') {
      // ★ 2026-10-18：对侧 = 右栏端点槽（右栏为本地浏览器时是 _rlSelected，见接口注释）
      if (this.host.getRightPaneSelection().length > 0) this.host.setRightPaneSelection([])
    } else if (this.host.selectedLocal.length > 0) {
      this.host.selectedLocal = []
    }
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote'): void {
    // 响应左键(0)和右键(2)
    if (event.button !== 0 && event.button !== 2) return
    const target = event.target as HTMLElement

    // 列表头（排序列）不触发框选；分组头行（.group-row）允许起手框选
    // ★ 2026-10-19：分组头此前与列表头一同被排除 → 长按/拖拽完全无响应（既不框选，
    //   松手时鼠标已不在原元素上连 click 也不触发）。现允许从分组头起手框选；
    //   纯点击/长按不动仍走分组头自身 click（整组选中⇄取消）。
    if (target.closest('.entry.header:not(.group-row)')) return

    // 记录是否点击在 entry 上（非 header）；分组头视同「自管点击区域」：
    // startedOnEntry 置真，避免松手时被当作「空白点击」误清本面板选中
    this.rubberBand.startedOnEntry = !!target.closest('.entry:not(.header), .entry.header.group-row')

    // 已选中条目上按下左键：优先交给原生拖拽（移动/复制），不进入框选
    // 这样不会与多选拖拽冲突
    const entryEl = target.closest('.entry:not(.header)') as HTMLElement | null
    const pressedOnSelectedEntry = !!entryEl?.classList.contains('selected')
    if (pressedOnSelectedEntry && event.button === 0) {
      this.clearClickSuppress()
      return
    }

    // 支持从条目上直接起手框选；不在这里提前 return
    // （是否进入框选由后续移动阈值决定，纯点击仍走原有 click 选中逻辑）

    const listEl = target.closest('.pane-list') as HTMLElement | null
    if (!listEl) return

    const rect = listEl.getBoundingClientRect()
    this.rubberBand.pane = pane
    this.rubberBand.startX = event.clientX - rect.left + listEl.scrollLeft
    this.rubberBand.startY = event.clientY - rect.top + listEl.scrollTop
    this.rubberBand.currentX = this.rubberBand.startX
    this.rubberBand.currentY = this.rubberBand.startY
    this.rubberBand.active = false
    this.rubberBand.rectLeft = this.rubberBand.startX
    this.rubberBand.rectTop = this.rubberBand.startY
    this.rubberBand.rectWidth = 0
    this.rubberBand.rectHeight = 0
    this._rbMoved = false
    this.clearClickSuppress()
    this._rbLongPress = false
    this._rbSuppressDrag = false
    this._rbDragCancelled = false
    this._rbIsLeftClick = event.button === 0
    this._rbRightClick = event.button === 2
    this._rbCtrlHeld = event.ctrlKey || event.metaKey
    this._rbStartClientX = event.clientX
    this._rbStartClientY = event.clientY

    // 仅缓存列表容器引用；条目几何在框选真正激活时再读取（避免大列表 mousedown 卡顿）
    this._rbPaneListEl = listEl
    this._rbPaneListRect = rect

    // 绑定 document 级 move/up（Zone 外运行，避免每帧触发变更检测）
    if (!this._rbMoveHandler) {
      this._rbMoveHandler = (e: MouseEvent) => this._rbOnMouseMove(e)
    }
    if (!this._rbUpHandler) {
      this._rbUpHandler = (e: MouseEvent) => this._rbOnMouseUp(e)
    }
    this.host.zone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this._rbMoveHandler!)
      document.addEventListener('mouseup', this._rbUpHandler!)
    })

    // 左键空白按下：关闭菜单并抑制迟到的 contextmenu（如右键框选刚结束）
    if (event.button === 0) {
      event.preventDefault()
      // 若右键此刻也按着（双键同按），不要关闭/抑制右键菜单，
      // 否则会吞掉随后（或刚刚）由右键触发的 contextmenu
      if (!(event.buttons & 2)) {
        this.host.closeContextMenu()
        this._rbArmContextMenuSuppress(400)
      }
    }
    if (event.button === 2) {
      event.preventDefault()
    }
  }

  /** 框选期间/结束后短暂屏蔽右键菜单 */
  private _rbArmContextMenuSuppress(ms = 400): void {
    this._rbSuppressContextMenu = true
    if (this._rbContextMenuSuppressTimer) clearTimeout(this._rbContextMenuSuppressTimer)
    this._rbContextMenuSuppressTimer = setTimeout(() => {
      this._rbSuppressContextMenu = false
      this._rbContextMenuSuppressTimer = null
    }, ms)
  }

  /** 框选 mousemove：更新选择矩形（支持空白或条目起手） */
  private _rbOnMouseMove(event: MouseEvent): void {
    const rb = this.rubberBand

    const paneList = this._rbPaneListEl
    if (!paneList) return

    const rect = this._rbPaneListRect!
    rb.currentX = Math.max(0, Math.min(event.clientX - rect.left + paneList.scrollLeft, paneList.scrollWidth))
    rb.currentY = Math.max(0, Math.min(event.clientY - rect.top + paneList.scrollTop, paneList.scrollHeight))

    const dx = rb.currentX - rb.startX
    const dy = rb.currentY - rb.startY

    // ★ 2026-10-19 P2-12：Ctrl 追加态**每帧按当前修饰键刷新**。
    //   原实现只在 mousedown（:228）与激活瞬间（原 :288）采样一次 ⇒ 拖拽中途按下 Ctrl
    //   （想在已有选中上追加）或中途松开 Ctrl（想改成替换）都不生效，界面与实际语义相反。
    //   基线快照已在 _rbActivate 清空选中之前拍好，故中途转追加也能拿回原选中集。
    this._rbCtrlHeld = event.ctrlKey || event.metaKey

    if (!rb.active && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      this._rbClearOppositePane()
      this._rbActivate()
      this._rbMoved = true
    }

    if (!rb.active) return

    rb.rectLeft = dx >= 0 ? rb.startX : rb.currentX
    rb.rectTop = dy >= 0 ? rb.startY : rb.currentY
    rb.rectWidth = Math.abs(dx)
    rb.rectHeight = Math.abs(dy)

    this._rbScheduleFrameUpdate()
  }

  /** 每帧更新框选矩形 + 实时选中高亮（rAF 节流，避免 mousemove 卡顿） */
  private _rbScheduleFrameUpdate(): void {
    if (this._rbFrameId != null) return
    this._rbFrameId = requestAnimationFrame(() => {
      this._rbFrameId = null
      if (!this.rubberBand.active) return
      this._rbUpdateRectEl()
      this._rbApplyLiveSelectionFromRect()
      this.host.zone.run(() => { try { this.host.cdr.detectChanges() } catch {} })
    })
  }

  /** 框选 mouseup：结束框选 */
  private _rbOnMouseUp(event: MouseEvent): void {
    // 在 _rbCleanup() 之前保存状态
    const wasClickOnBlank = !this._rbMoved && !this.rubberBand.startedOnEntry
    const pane = this.rubberBand.pane
    const button = event.button
    // ★ 2026-10-19 P2-12：松手瞬间再采样一次 Ctrl —— 用户可能「按住鼠标不动、只按/松 Ctrl」，
    //   期间没有 mousemove 事件，若不看这里，最终落地的选中集仍按旧状态算。
    if (this._rbMoved) this._rbCtrlHeld = event.ctrlKey || event.metaKey

    // 清理长按计时器
    if (this._rbLongPressTimer) {
      clearTimeout(this._rbLongPressTimer)
      this._rbLongPressTimer = null
    }
    this._rbLongPress = false
    this._rbSuppressDrag = false

    const applied = this._rbMoved && this.rubberBand.active
    const wasRightBoxSelect = applied && this._rbRightClick
    // ★ 2026-10-09：右键框选命中的**路径**（在 _rbCleanup 清空 _rbElPaths 之前抓取）。
    //   这是右键框选菜单能拿到文件上下文的唯一可靠来源 —— DOM 序号在 cleanup 后已无映射可查
    //   （原先只留 hitIndex、稍后再反查路径，因 cleanup 先执行而必然查空，菜单恒退化为空白区菜单）。
    let rbMenuHitPath: string | null = null
    const rbMenuX = event.clientX
    const rbMenuY = event.clientY

    if (wasRightBoxSelect) {
      const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const row = hit?.closest('.entry:not(.header):not(.up-entry):not(.dim)') as HTMLElement | null
      // ★ 2026-10-09 审计根治（右键框选菜单 100% 失效）：
      //   原实现只把 DOM 序号（hitIndex）传给 _rbOpenContextMenuAfterBoxSelect，
      //   由那个方法在**稍后**去读 this._rbElPaths[hitIndex] 反查路径。
      //   但下方 _rbCleanup() 会 `this._rbElPaths = []`，
      //   而调用发生在 zone.run 的**同步**回调里（zone.run 本身是同步的），
      //   ⇒ 必然读到已清空的数组 ⇒ hitPath 为 undefined ⇒ entry 为 null
      //   ⇒ 走 `contextMenuEntry = null` 分支 ⇒ 弹出**空白区菜单**，
      //     右键框选出的文件全部没有复制/删除/上传等操作（100% 复现，非边界）。
      //   根治：**在 cleanup 之前**就把 data-path 取出来（DOM 上此刻还在），
      //   后续按路径查条目 —— 与本类其余交互统一走 data-path（铁律：
      //   「分组视图显示序 ≠ 排序序，交互禁止用数组下标对位」）。
      if (row) rbMenuHitPath = row.getAttribute('data-path')
      this.host.closeContextMenu()
    } else if (applied) {
      // 左键框选结束：抑制紧随其后的误触 contextmenu
      this.host.closeContextMenu()
      this._rbArmContextMenuSuppress(350)
    }

    // 框选结束：先算选中再清理（cleanup 会清空缓存，不能放在 zone.run 异步之后）
    if (applied) {
      if (this._rbFrameId != null) {
        cancelAnimationFrame(this._rbFrameId)
        this._rbFrameId = null
      }
      this._rbApplySelectionFromRect()
    }
    const menuPane = pane
    // ★ 2026-10-19 反馈③：rl（右栏本地端点）复用 'remote' 框选侧；当右栏为本地浏览器时把
    //   框选结果归到 rl 视觉/菜单，避免对真正的 remote-pane（如左栏远程）串色或误弹菜单。
    const safePane: 'local' | 'remote' = menuPane === '' ? 'remote' : menuPane
    const visualPane: 'local' | 'remote' | 'rl' =
      safePane === 'remote' && this.host.rightPaneIsLocalBrowser() ? 'rl' : safePane
    let suppressClickPath: string | null = null
    if (applied && button === 0) {
      const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const row = hit?.closest('.entry:not(.header):not(.up-entry):not(.dim)') as HTMLElement | null
      suppressClickPath = row?.getAttribute('data-path') ?? null
      // ★ 2026-10-19：框选结束落点在分组头上 → 抑制紧随的分组头 click，保护框选结果
      if (!row && hit?.closest('.entry.header.group-row')) this._armGroupHeaderClickSuppress()
    }
    this._rbCleanup()
    if (suppressClickPath) {
      this._rbSuppressClickPath = suppressClickPath
      if (this._rbSuppressClickTimer) clearTimeout(this._rbSuppressClickTimer)
      this._rbSuppressClickTimer = setTimeout(() => this.clearClickSuppress(), 400)
    }
    if (applied) {
      this.host.zone.run(() => {
        try { this.host.cdr.detectChanges() } catch {}
        this.host.syncPaneSelectionVisual(visualPane)
        if (wasRightBoxSelect) {
          this._rbSkipNextContextMenu = true
          // ★ 2026-10-20 全量审计：原为匿名 setTimeout（无句柄）。同一布尔量被多个无身份
          //   定时器竞争写入：400ms 内发起第二次右键框选时，**第一次**的定时器到点会把
          //   第二次刚置的抑制状态提前清掉 ⇒ 框选后右键菜单直接弹出、覆盖框选结果。
          if (this._rbSkipContextMenuTimer) clearTimeout(this._rbSkipContextMenuTimer)
          this._rbSkipContextMenuTimer = setTimeout(() => {
            this._rbSkipNextContextMenu = false
            this._rbSkipContextMenuTimer = null
          }, 400)
          this._rbOpenContextMenuAfterBoxSelect(rbMenuX, rbMenuY, visualPane, rbMenuHitPath)
        }
      })
    }

    // 左键在空白区域点击（无拖拽）= 清除该面板选中
    if (wasClickOnBlank && button === 0) {
      this.host.zone.run(() => {
        if (pane === 'local') {
          this.host.selectedLocal = []
          this.host.localLastSelectedIndex = null
        } else {
          // ★ 2026-10-18：右栏端点槽路由（rl 时清 _rlSelected/_rlLastSelectedIndex）
          this.host.setRightPaneSelection([])
          this.host.setRightPaneLastSelectedIndex(null)
        }
        try { this.host.cdr.detectChanges() } catch {}
      })
    }
  }

  /** 清理框选事件监听和状态 */
  private _rbCleanup(): void {
    if (this._rbLongPressTimer) {
      clearTimeout(this._rbLongPressTimer)
      this._rbLongPressTimer = null
    }
    if (this._rbFrameId != null) {
      cancelAnimationFrame(this._rbFrameId)
      this._rbFrameId = null
    }
    if (this._rbMoveHandler) document.removeEventListener('mousemove', this._rbMoveHandler)
    if (this._rbUpHandler) document.removeEventListener('mouseup', this._rbUpHandler)
    if (this._rbScrollHandler && this._rbPaneListEl) {
      this._rbPaneListEl.removeEventListener('scroll', this._rbScrollHandler)
      this._rbScrollHandler = null
    }
    this._rbDestroyRectEl()
    this.rubberBand.active = false
    this.rubberBand.startedOnEntry = false
    this._rbLongPress = false
    this._rbSuppressDrag = false
    this._rbDragCancelled = false
    this._rbEntryRects = []
    this._rbEntryEls = []
    this._rbElPaths = []
    this._rbPaneListEl = null
    this._rbPaneListRect = null
    this._rbCtrlHeld = false
    this._rbRightClick = false
    this._rbCachedLocalEntries = null
    this._rbCachedRemoteEntries = null
    this._rbPathToIndex.clear()
    this._rbInitialSelectedIndices = null
    this._rbLiveSelectedIndices = new Set()
  }

  /** 框选激活时缓存条目几何与索引（延迟到大列表真正开始框选再读 DOM） */
  private _rbCacheForRubberBand(): void {
    const pane = this.rubberBand.pane
    const listEl = this._rbPaneListEl
    const rect = this._rbPaneListRect
    if (!listEl || !rect) return

    const selector = pane === 'local'
      ? '.local-pane .entry:not(.header):not(.up-entry)'
      : '.remote-pane .entry:not(.header):not(.up-entry)'
    const entryEls = Array.from(this.host.elRef?.nativeElement?.querySelectorAll(selector) ?? []) as HTMLElement[]
    this._rbEntryEls = entryEls
    const listSL = listEl.scrollLeft, listST = listEl.scrollTop
    this._rbEntryRects = entryEls.map(el => {
      const r = el.getBoundingClientRect()
      return {
        top: r.top - rect.top + listST,
        left: r.left - rect.left + listSL,
        width: r.width,
        height: r.height,
      }
    })

    // ★ 2026-09-29：分组模式下 DOM 行序（分组桶序）≠ 过滤列表序（排序序），
    //    原先「DOM 序号 ↔ 过滤列表序号」位置对位会选错行（框下面、上面被选中）——
    //    改为按 data-path 建立「路径 → DOM 行序号」映射，命中序号统一先转路径再取条目
    this._rbElPaths = entryEls.map(el => el.getAttribute('data-path') ?? '')
    this._rbPathToIndex.clear()
    this._rbElPaths.forEach((p, i) => { if (p) this._rbPathToIndex.set(p, i) })
    if (pane === 'local') {
      this._rbCachedLocalEntries = this.host.getFilteredLocalEntries()
      this._rbCachedRemoteEntries = null
    } else {
      // ★ 2026-10-18：右栏端点槽路由（rl 时缓存 getFilteredRlEntries）
      this._rbCachedRemoteEntries = this.host.getRightPaneFilteredEntries()
      this._rbCachedLocalEntries = null
    }
  }

  /** 不触发变更检测，仅同步 DOM 上的选中样式 */
  private _rbClearPaneSelectionVisual(pane: 'local' | 'remote'): void {
    if (pane === 'local') {
      this.host.selectedLocal = []
      this.host.localLastSelectedIndex = null
    } else {
      // ★ 2026-10-18：右栏端点槽路由（rl 时清 _rlSelected）
      this.host.setRightPaneSelection([])
      this.host.setRightPaneLastSelectedIndex(null)
    }
    const listEl = this._rbPaneListEl
    if (listEl) {
      listEl.querySelectorAll('.entry.selected').forEach(el => el.classList.remove('selected'))
    }
  }

  /** 动态元素无 _ngcontent 属性，组件 CSS 不生效，须写完整 inline style */
  private _rbApplyRectBaseStyles(el: HTMLElement): void {
    const s = el.style
    s.position = 'absolute'
    s.boxSizing = 'border-box'
    s.margin = '0'
    s.padding = '0'
    s.border = '1px dashed rgba(59, 130, 246, 0.85)'
    s.background = 'rgba(59, 130, 246, 0.15)'
    s.pointerEvents = 'none'
    s.zIndex = '100'
    s.borderRadius = '2px'
  }

  /** 快照「框选开始前」的选中集（追加模式的基线；★ 2026-10-18：remote 侧经端点槽路由，rl 时取 _rlSelected） */
  private _rbSnapshotInitialSelection(): void {
    const pane = this.rubberBand.pane
    const selected = pane === 'local' ? this.host.selectedLocal : this.host.getRightPaneSelection()
    this._rbInitialSelectedIndices = new Set<number>()
    for (const e of selected) {
      const idx = this._rbPathToIndex.get(e.fullPath)
      if (idx !== undefined) this._rbInitialSelectedIndices.add(idx)
    }
  }

  /** 激活框选：创建框选矩形 DOM */
  private _rbActivate(): void {
    if (this.rubberBand.active) return
    this.rubberBand.active = true
    this._rbCacheForRubberBand()
    const listEl = this._rbPaneListEl
    if (listEl) {
      this._rbScrollLeft = listEl.scrollLeft
      this._rbScrollTop = listEl.scrollTop
      // ★ 2026-09-20：滚动时重算条目几何并平移框选起点，避免选错行
      this._rbScrollHandler = () => {
        if (!this.rubberBand.active || !this._rbPaneListEl) return
        const dx = this._rbPaneListEl.scrollLeft - this._rbScrollLeft
        const dy = this._rbPaneListEl.scrollTop - this._rbScrollTop
        this._rbScrollLeft = this._rbPaneListEl.scrollLeft
        this._rbScrollTop = this._rbPaneListEl.scrollTop
        this.rubberBand.startX += dx
        this.rubberBand.startY += dy
        this.rubberBand.currentX += dx
        this.rubberBand.currentY += dy
        this._rbPaneListRect = this._rbPaneListEl.getBoundingClientRect()
        this._rbCacheForRubberBand()
        this._rbScheduleFrameUpdate()
      }
      listEl.addEventListener('scroll', this._rbScrollHandler, { passive: true })
    }

    const rb = this.rubberBand
    // ★ 2026-10-19 P2-12：快照必须在**清空选中之前**拍。
    //   原实现先按 merge 清选中、再拍快照 ⇒ 没有 Ctrl 起手时快照恒为空；而 Ctrl 是可以在
    //   拖拽**中途**才按下的，那时再想追加就得有「框选前的选中集」作基线。
    this._rbSnapshotInitialSelection()
    const merge = this._rbCtrlHeld
    // 空白区域框选：仅 Ctrl 为追加，左键/右键均为替换
    if (!merge) {
      this._rbClearPaneSelectionVisual(rb.pane as 'local' | 'remote')
    }
    this._rbLiveSelectedIndices = merge
      ? new Set(this._rbInitialSelectedIndices)
      : new Set()
    if (this._rbRightClick) {
      this.host.closeContextMenu()
    }
    this._rbCreateRectEl()
  }

  /** 右键框选结束后弹出菜单（保留框选结果，不清空选中） */
  /**
   * 右键框选结束后打开上下文菜单。
   *
   * ★ 2026-10-09 审计根治：hitIndex 改为 hitPath。
   *   原实现收「DOM 行序号」，内部再 `this._rbElPaths[hitIndex]` 反查路径 —— 而调用方
   *   在同一轮里已经执行过 _rbCleanup()（它会 `this._rbElPaths = []`），
   *   且 zone.run 是**同步**的 ⇒ 读到的必然是空数组 ⇒ hitPath undefined ⇒ entry null
   *   ⇒ 永远走「空白区菜单」分支 ⇒ 右键框选出的文件没有任何文件级操作（100% 复现）。
   *   根治：调用方在 cleanup **之前**就把 data-path 取好传进来，本方法只做
   *   「按路径到当前过滤列表里找条目」—— 与本类其余交互一致走 data-path 而非下标
   *   （铁律：分组视图显示序 ≠ 排序序，交互禁止用数组下标对位）。
   */
  private _rbOpenContextMenuAfterBoxSelect(
    x: number, y: number, pane: 'local' | 'remote' | 'rl', hitPath: string | null,
  ): void {
    // ★ 2026-10-19 反馈③：rl（右栏本地端点）已接入 entryContextMenu/listContextMenu，
    //   框选后右键菜单与普通右键一致（动作按 contextMenuPane==='rl' 路由到本地 fs）。
    const isLocalData = pane !== 'remote'
    this.host.closeBookmarks()
    this.host.headerMenuVisible = false
    this.host.contextMenuX = x
    this.host.contextMenuY = y
    this.host.contextMenuPane = pane

    if (hitPath) {
      const entry = isLocalData
        ? (pane === 'local'
            ? this.host.getFilteredLocalEntries().find(e => e.fullPath === hitPath)
            : this.host.getRightPaneFilteredEntries().find(e => (e as LocalEntry | SFTPFile).fullPath === hitPath))
        : this.host.getFilteredRemoteEntries().find(e => e.fullPath === hitPath)
      if (entry) {
        this.host.contextMenuEntry = entry
        this.host.contextMenuVisible = true
        this.host.cdr.detectChanges()
        this.host.fixContextMenuPosition(x, y)
        return
      }
    }

    this.host.contextMenuEntry = null
    this.host.contextMenuVisible = true
    this.host.cdr.detectChanges()
    this.host.fixContextMenuPosition(x, y)
  }

  /** 动态创建框选矩形（不依赖 Angular *ngIf / 组件样式封装） */
  private _rbCreateRectEl(): void {
    this._rbDestroyRectEl()
    const listEl = this._rbPaneListEl
    if (!listEl) return
    const el = document.createElement('div')
    el.className = 'rubber-band-rect'
    this._rbApplyRectBaseStyles(el)
    listEl.appendChild(el)
    this._rbRectEl = el
  }

  private _rbDestroyRectEl(): void {
    if (this._rbRectEl) {
      try { this._rbRectEl.remove() } catch {}
      this._rbRectEl = null
    }
  }

  /** 更新框选矩形位置/大小 */
  private _rbUpdateRectEl(): void {
    if (!this._rbRectEl) this._rbCreateRectEl()
    const rb = this.rubberBand
    const listEl = this._rbPaneListEl
    if (!this._rbRectEl || !listEl) return
    const cs = getComputedStyle(listEl)
    const padL = parseFloat(cs.paddingLeft) || 0
    const padT = parseFloat(cs.paddingTop) || 0
    const s = this._rbRectEl.style
    // 坐标按 border 盒计算，absolute 子元素相对 padding 盒定位
    s.left = Math.max(0, rb.rectLeft - padL) + 'px'
    s.top = Math.max(0, rb.rectTop - padT) + 'px'
    s.width = Math.max(0, rb.rectWidth) + 'px'
    s.height = Math.max(0, rb.rectHeight) + 'px'
    s.display = (rb.rectWidth > 0 || rb.rectHeight > 0) ? 'block' : 'none'
  }

  /** 根据当前框选矩形计算目标选中索引 */
  private _rbTargetIndicesFromRect(): Set<number> {
    const hitIndices = this._rbComputeHitIndices()
    const merge = this._rbCtrlHeld
    if (merge && this._rbInitialSelectedIndices) {
      const target = new Set(this._rbInitialSelectedIndices)
      for (const i of hitIndices) target.add(i)
      return target
    }
    return hitIndices
  }

  /** 同步选中模型；★ 2026-09-29：序号为 DOM 行序号，先经 _rbElPaths 转路径再按路径取条目（分组模式顺序无关） */
  private _rbSyncSelectionModel(indices: Set<number>): void {
    const rb = this.rubberBand
    const sorted = [...indices].sort((a, b) => a - b)
    if (rb.pane === 'local' && this._rbCachedLocalEntries) {
      const byPath = new Map(this.host.getFilteredLocalEntries().map(e => [e.fullPath, e]))
      this.host.selectedLocal = sorted
        .map(i => this._rbElPaths[i])
        .map(p => (p ? byPath.get(p) : null))
        .filter(Boolean) as LocalEntry[]
    } else if (rb.pane === 'remote' && this._rbCachedRemoteEntries) {
      // ★ 2026-10-18：右栏端点槽路由（rl 时写 _rlSelected 并同步路径集）
      const byPath = new Map(this.host.getRightPaneFilteredEntries().map((e): [string, SFTPFile | LocalEntry] => [e.fullPath, e]))
      this.host.setRightPaneSelection(sorted
        .map(i => this._rbElPaths[i])
        .map(p => (p ? byPath.get(p) : null))
        .filter(Boolean) as Array<SFTPFile | LocalEntry>)
    }
  }

  /** 拖拽过程中实时更新条目高亮与选中模型（差量改 DOM，不整表重绘） */
  private _rbApplyLiveSelectionFromRect(): void {
    const target = this._rbTargetIndicesFromRect()
    const prev = this._rbLiveSelectedIndices
    if (target.size === prev.size) {
      let same = true
      for (const i of target) {
        if (!prev.has(i)) { same = false; break }
      }
      if (same) return
    }
    for (const i of prev) {
      if (!target.has(i)) {
        const el = this._rbEntryEls[i]
        if (el) el.classList.remove('selected')
      }
    }
    for (const i of target) {
      if (!prev.has(i)) {
        const el = this._rbEntryEls[i]
        if (el) el.classList.add('selected')
      }
    }
    this._rbLiveSelectedIndices = target
    this._rbSyncSelectionModel(target)
  }

  /** mouseup 时最终同步选中集 */
  private _rbApplySelectionFromRect(): void {
    this._rbApplyLiveSelectionFromRect()
  }

  /** 计算与当前框选矩形相交的行索引 */
  private _rbComputeHitIndices(): Set<number> {
    const rb = this.rubberBand
    const rLeft = rb.rectLeft, rTop = rb.rectTop
    const rRight = rLeft + rb.rectWidth, rBottom = rTop + rb.rectHeight
    const cachedRects = this._rbEntryRects
    const hitIndices = new Set<number>()
    if (cachedRects.length === 0) return hitIndices
    const [rowStart, rowEnd] = this._rbFindRowRange(cachedRects, rTop, rBottom)
    for (let i = rowStart; i <= rowEnd; i++) {
      const cr = cachedRects[i]
      const eRight = cr.left + cr.width, eBottom = cr.top + cr.height
      if (!(rRight < cr.left || rBottom < cr.top || rLeft > eRight || rTop > eBottom)) {
        hitIndices.add(i)
      }
    }
    return hitIndices
  }

  /**
   * 二分查找与框选矩形垂直范围可能相交的行区间 [start, end]
   * rects 按 top 递增排列，将 O(n) 扫描降为 O(log n + k)
   */
  private _rbFindRowRange(
    rects: Array<{ top: number; left: number; width: number; height: number }>,
    rTop: number, rBottom: number,
  ): [number, number] {
    const n = rects.length
    if (n === 0) return [0, -1]
    let lo = 0, hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (rects[mid].top + rects[mid].height <= rTop) lo = mid + 1
      else hi = mid
    }
    const start = lo
    lo = start; hi = n
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (rects[mid].top < rBottom) lo = mid + 1
      else hi = mid
    }
    return [start, lo - 1]
  }

  /** 框选激活时清除对侧面板的选中（仅允许单侧选中，在框选开始即刻执行） */
  private _rbClearOppositePane(): void {
    if (this.rubberBand.pane === 'local') {
      // ★ 2026-10-18：对侧 = 右栏端点槽（rl 时是 _rlSelected）
      if (this.host.getRightPaneSelection().length > 0) {
        this.host.setRightPaneSelection([])
        this.host.setRightPaneLastSelectedIndex(null)
      }
    } else if (this.host.selectedLocal.length > 0) {
      this.host.selectedLocal = []
      this.host.localLastSelectedIndex = null
    }
  }
}

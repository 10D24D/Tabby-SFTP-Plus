/**
 * 框选（Rubber Band Selection）逻辑
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
  contextMenuPane: 'local' | 'remote'
  contextMenuEntry: LocalEntry | SFTPFile | null
  contextMenuVisible: boolean
  headerMenuVisible: boolean
  syncPaneSelectionVisual(pane: 'local' | 'remote'): void
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
  private _rbSuppressDrag = false
  private _rbDragCancelled = false
  private _rbIsLeftClick = false
  private _rbSuppressContextMenu = false
  private _rbContextMenuSuppressTimer: ReturnType<typeof setTimeout> | null = null
  private _rbSkipNextContextMenu = false
  private _rbEntryRects: Array<{ top: number; left: number; width: number; height: number }> = []
  private _rbEntryEls: HTMLElement[] = []
  private _rbPaneListEl: HTMLElement | null = null
  private _rbPaneListRect: DOMRect | null = null
  private _rbRectEl: HTMLElement | null = null
  private _rbCtrlHeld = false
  private _rbRightClick = false
  private _rbCachedLocalEntries: LocalEntry[] | null = null
  private _rbCachedRemoteEntries: SFTPFile[] | null = null
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
    if (this._rbContextMenuSuppressTimer) {
      clearTimeout(this._rbContextMenuSuppressTimer)
      this._rbContextMenuSuppressTimer = null
    }
  }

  cleanup(): void { this._rbCleanup() }

  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    // 只有点中空白区域（非 .entry 元素）才处理
    const target = event.target as HTMLElement | null
    if (target && target.closest('.entry')) return
    if (pane === 'local' && this.host.selectedRemote.length > 0) {
      this.host.selectedRemote = []
    } else if (pane === 'remote' && this.host.selectedLocal.length > 0) {
      this.host.selectedLocal = []
    }
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote'): void {
    // 响应左键(0)和右键(2)
    if (event.button !== 0 && event.button !== 2) return
    const target = event.target as HTMLElement

    // 表头区域不触发框选
    if (target.closest('.entry.header')) return

    // 记录是否点击在 entry 上（非 header）
    this.rubberBand.startedOnEntry = !!target.closest('.entry:not(.header)')

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
      this.host.closeContextMenu()
      this._rbArmContextMenuSuppress(400)
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

    if (!rb.active && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      this._rbCtrlHeld = event.ctrlKey || event.metaKey
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

    // 清理长按计时器
    if (this._rbLongPressTimer) {
      clearTimeout(this._rbLongPressTimer)
      this._rbLongPressTimer = null
    }
    this._rbLongPress = false
    this._rbSuppressDrag = false

    const applied = this._rbMoved && this.rubberBand.active
    const wasRightBoxSelect = applied && this._rbRightClick
    let rbMenuHitIndex: number | null = null
    const rbMenuX = event.clientX
    const rbMenuY = event.clientY

    if (wasRightBoxSelect) {
      const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const row = hit?.closest('.entry:not(.header):not(.up-entry):not(.dim)') as HTMLElement | null
      if (row) rbMenuHitIndex = this._rbEntryEls.indexOf(row)
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
    let suppressClickPath: string | null = null
    if (applied && button === 0) {
      const hit = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
      const row = hit?.closest('.entry:not(.header):not(.up-entry):not(.dim)') as HTMLElement | null
      suppressClickPath = row?.getAttribute('data-path') ?? null
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
        this.host.syncPaneSelectionVisual(menuPane as 'local' | 'remote')
        if (wasRightBoxSelect) {
          this._rbSkipNextContextMenu = true
          setTimeout(() => { this._rbSkipNextContextMenu = false }, 400)
          this._rbOpenContextMenuAfterBoxSelect(rbMenuX, rbMenuY, menuPane as 'local' | 'remote', rbMenuHitIndex)
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
          this.host.selectedRemote = []
          this.host.remoteLastSelectedIndex = null
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
    this._rbDestroyRectEl()
    this.rubberBand.active = false
    this.rubberBand.startedOnEntry = false
    this._rbLongPress = false
    this._rbSuppressDrag = false
    this._rbDragCancelled = false
    this._rbEntryRects = []
    this._rbEntryEls = []
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

    this._rbPathToIndex.clear()
    if (pane === 'local') {
      this._rbCachedLocalEntries = this.host.getFilteredLocalEntries()
      this._rbCachedRemoteEntries = null
      this._rbCachedLocalEntries.forEach((e, i) => this._rbPathToIndex.set(e.fullPath, i))
    } else {
      this._rbCachedRemoteEntries = this.host.getFilteredRemoteEntries()
      this._rbCachedLocalEntries = null
      this._rbCachedRemoteEntries.forEach((e, i) => this._rbPathToIndex.set(e.fullPath, i))
    }
  }

  /** 不触发变更检测，仅同步 DOM 上的选中样式 */
  private _rbClearPaneSelectionVisual(pane: 'local' | 'remote'): void {
    if (pane === 'local') {
      this.host.selectedLocal = []
      this.host.localLastSelectedIndex = null
    } else {
      this.host.selectedRemote = []
      this.host.remoteLastSelectedIndex = null
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

  /** 激活框选：创建框选矩形 DOM */
  private _rbActivate(): void {
    if (this.rubberBand.active) return
    this.rubberBand.active = true
    this._rbCacheForRubberBand()

    const rb = this.rubberBand
    const merge = this._rbCtrlHeld
    // 空白区域框选：仅 Ctrl 为追加，左键/右键均为替换
    if (!merge) {
      this._rbClearPaneSelectionVisual(rb.pane as 'local' | 'remote')
    }
    // 快照追加模式的初始选中
    const selected = rb.pane === 'local' ? this.host.selectedLocal : this.host.selectedRemote
    this._rbInitialSelectedIndices = new Set<number>()
    for (const e of selected) {
      const idx = this._rbPathToIndex.get(e.fullPath)
      if (idx !== undefined) this._rbInitialSelectedIndices.add(idx)
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
  private _rbOpenContextMenuAfterBoxSelect(
    x: number, y: number, pane: 'local' | 'remote', hitIndex: number | null,
  ): void {
    this.host.closeBookmarks()
    this.host.headerMenuVisible = false
    this.host.contextMenuX = x
    this.host.contextMenuY = y
    this.host.contextMenuPane = pane

    if (hitIndex != null && hitIndex >= 0) {
      if (pane === 'local') {
        const entry = this.host.getFilteredLocalEntries()[hitIndex]
        if (entry) {
          this.host.contextMenuEntry = entry
          this.host.contextMenuVisible = true
          this.host.cdr.detectChanges()
          this.host.fixContextMenuPosition(x, y)
          return
        }
      } else {
        const entry = this.host.getFilteredRemoteEntries()[hitIndex]
        if (entry) {
          this.host.contextMenuEntry = entry
          this.host.contextMenuVisible = true
          this.host.cdr.detectChanges()
          this.host.fixContextMenuPosition(x, y)
          return
        }
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

  /** 同步选中模型（不写 DOM）；条目引用对齐当前过滤列表 */
  private _rbSyncSelectionModel(indices: Set<number>): void {
    const rb = this.rubberBand
    const sorted = [...indices].sort((a, b) => a - b)
    if (rb.pane === 'local' && this._rbCachedLocalEntries) {
      const byPath = new Map(this.host.getFilteredLocalEntries().map(e => [e.fullPath, e]))
      this.host.selectedLocal = sorted
        .map(i => this._rbCachedLocalEntries![i])
        .map(e => byPath.get(e.fullPath) ?? e)
        .filter(Boolean) as LocalEntry[]
    } else if (rb.pane === 'remote' && this._rbCachedRemoteEntries) {
      const byPath = new Map(this.host.getFilteredRemoteEntries().map(e => [e.fullPath, e]))
      this.host.selectedRemote = sorted
        .map(i => this._rbCachedRemoteEntries![i])
        .map(e => byPath.get(e.fullPath) ?? e)
        .filter(Boolean) as SFTPFile[]
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
    if (this.rubberBand.pane === 'local' && this.host.selectedRemote.length > 0) {
      this.host.selectedRemote = []
      this.host.remoteLastSelectedIndex = null
    } else if (this.rubberBand.pane === 'remote' && this.host.selectedLocal.length > 0) {
      this.host.selectedLocal = []
      this.host.localLastSelectedIndex = null
    }
  }
}

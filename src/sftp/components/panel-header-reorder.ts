/**
 * 表头列拖拽重排：仅表头预览换位，松手后同步数据列
 * 功能描述：按面板（local/remote/rl）拖拽表头列实时预览换位，松手提交列序并持久化
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-10-12
 * @修改人：DD1024z + Hy3
 * @修改时间：2026-10-19 — 续八：HeaderReorderPane 扩 'rl'（右栏本地端点）：列表选择器走 .pane-list.rl-pane
 *           防串栏命中真正远程面板表头；rl 预览/提交归 local 列序配置组（localVisibleCols/localColOrder）
 */
import { ChangeDetectorRef, ElementRef } from '@angular/core'

export type HeaderReorderPane = 'local' | 'remote' | 'rl'

export interface HeaderReorderHost {
  cdr: ChangeDetectorRef
  elRef: ElementRef
  resizing: boolean
  localVisibleCols: string[]
  remoteVisibleCols: string[]
  get localColOrder(): string[]
  set localColOrder(v: string[])
  get remoteColOrder(): string[]
  set remoteColOrder(v: string[])
  saveLocalColSettings(): void
  saveRemoteColSettings(): void
  /** 供父组件拦截松手后的 click 排序 */
  markJustResized(): void
  clearJustResizedSoon(ms?: number): void
}

// ★ 2026-10-12：加入 'name'（名称列现已可重排，需被 _colFromEl 识别为有效列）
const KNOWN_HEADER_COLS = [
  'name', 'size', 'date', 'created', 'perms', 'mode',
  'access', 'owner', 'group', 'path', 'ext',
] as const

export class PanelHeaderReorder {
  private _dragCol: string | null = null
  private _dragPane: HeaderReorderPane | null = null
  private _dragging = false
  private _moved = false
  private _startX = 0
  private _startTime = 0
  private _unbind: (() => void) | null = null
  private _ghostEl: HTMLElement | null = null
  private _ghostOffsetX = 0
  private _previewOrder: string[] | null = null
  private _dropIndicator: { col: string; placeAfter: boolean } | null = null

  constructor(private readonly host: HeaderReorderHost) {}

  get active(): boolean {
    return this._dragging
  }

  get moved(): boolean {
    return this._moved
  }

  get draggingCol(): string | null {
    return this._dragging ? this._dragCol : null
  }

  get dragPane(): HeaderReorderPane | null {
    return this._dragging ? this._dragPane : null
  }

  get previewOrder(): string[] | null {
    return this._dragging ? this._previewOrder : null
  }

  get dropIndicator(): { col: string; placeAfter: boolean } | null {
    return this._dragging ? this._dropIndicator : null
  }

  draggingColFor(pane: HeaderReorderPane): string | null {
    return this._dragging && this._dragPane === pane ? this._dragCol : null
  }

  previewColsFor(pane: HeaderReorderPane): string[] | null {
    return this._dragging && this._dragPane === pane ? this._previewOrder : null
  }

  dropIndicatorColFor(pane: HeaderReorderPane): string | null {
    return this._dragging && this._dragPane === pane ? (this._dropIndicator?.col ?? null) : null
  }

  dropIndicatorAfterFor(pane: HeaderReorderPane): boolean {
    return this._dragging && this._dragPane === pane ? !!this._dropIndicator?.placeAfter : false
  }

  start(col: string, event: MouseEvent, pane: HeaderReorderPane): void {
    // ★ 2026-10-12：移除 `col === 'name'` 屏蔽——名称列现已纳入列顺序体系，可拖拽重排。
    if (event.button !== 0) return
    if (this.host.resizing) return

    this.reset()

    // ★ 2026-10-19 续八：rl（右栏本地端点）列表带 remote-pane rl-pane 双类，必须走
    //   .rl-pane 精确选择器，否则会命中真正远程面板的表头（幽灵/预览错栏）。
    const listSel = pane === 'local' ? '.pane-list.local-pane'
      : pane === 'rl' ? '.pane-list.rl-pane' : '.pane-list.remote-pane'
    const header = (this.host.elRef.nativeElement as HTMLElement)
      .querySelector(`${listSel} .entry.header`) as HTMLElement | null
    const sourceEl = header?.querySelector(`.sortable.${col}`) as HTMLElement | null
    if (!header || !sourceEl) return

    const sourceRect = sourceEl.getBoundingClientRect()
    this._dragging = true
    this._dragCol = col
    this._dragPane = pane
    this._moved = false
    this._startX = event.clientX
    this._startTime = Date.now()
    // rl 列序与左栏本地共用同一套配置（localVisibleCols/localColOrder）
    this._previewOrder = [...(pane === 'remote' ? this.host.remoteVisibleCols : this.host.localVisibleCols)]
    this._dropIndicator = null
    this._ghostOffsetX = event.clientX - sourceRect.left

    const onMove = (e: MouseEvent) => {
      if (!this._dragging || !this._dragCol || this._dragPane !== pane) return
      if (!this._moved && Math.abs(e.clientX - this._startX) < 10) return
      if (!this._moved) {
        this._moved = true
        this.host.markJustResized()
        this._createGhost(sourceEl, sourceRect, e.clientX, sourceRect.top)
      }
      this._moveGhost(e.clientX, sourceRect.top)
      this._previewHeaderOnly(pane, this._dragCol, e.clientX)
    }

    const finish = (commit: boolean) => {
      if (!this._dragging) return
      // ★ 2026-10-13 P2 修复：isClick 只按**位移**判定，删掉 duration < 200 条件。
      //   原判据 `!this._moved || duration < 200` 把「果断的快速拖列」（位移 >10px
      //   已置 _moved，但总时长 <200ms）也算 click ⇒ 列序不生效、预览幽灵消失、
      //   无任何反馈。位移阈值（上方 <10）已是点击/拖拽的正确判据，时长条件是
      //   冗余的第二判据，且与位移判据语义冲突。
      const isClick = !this._moved
      const preview = this._previewOrder
      if (commit && this._moved && !isClick && preview) {
        this._commitPreviewOrder(pane, preview)
      }
      this.reset()
      this.host.cdr.detectChanges()
      if (!isClick) {
        this.host.clearJustResizedSoon(200)
      } else {
        this.host.clearJustResizedSoon(0)
      }
    }

    const onUp = () => finish(true)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('keydown', onKeyDown)
    this._unbind = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('keydown', onKeyDown)
      this._unbind = null
    }
    this.host.cdr.detectChanges()
  }

  dispose(): void {
    this.reset()
  }

  reset(): void {
    if (this._unbind) this._unbind()
    this._destroyGhost()
    this._dragging = false
    this._dragCol = null
    this._dragPane = null
    this._moved = false
    this._previewOrder = null
    this._dropIndicator = null
  }

  private _previewHeaderOnly(pane: HeaderReorderPane, dragCol: string, clientX: number): void {
    const listSel = pane === 'local' ? '.pane-list.local-pane'
      : pane === 'rl' ? '.pane-list.rl-pane' : '.pane-list.remote-pane'
    const header = (this.host.elRef.nativeElement as HTMLElement)
      .querySelector(`${listSel} .entry.header`) as HTMLElement | null
    if (!header) return

    const headers = Array.from(header.querySelectorAll('.sortable')) as HTMLElement[]
    // ★ 2026-10-12：名称列（name）现在也是合法落点——拖某列到最前即落在 name 之前，
    //   拖 name 自身时由 `c !== dragCol` 排除。移除原先 `c !== 'name'` 的限制。
    const targets = headers.filter(el => {
      const c = this._colFromEl(el)
      return !!c && c !== dragCol
    })
    if (!targets.length) return

    let insertBeforeCol: string | null = null
    let placeAfterCol: string | null = null
    for (const el of targets) {
      const c = this._colFromEl(el)!
      const rect = el.getBoundingClientRect()
      const mid = rect.left + rect.width / 2
      if (clientX < mid) {
        insertBeforeCol = c
        break
      }
      placeAfterCol = c
    }

    const current = this._previewOrder
      || (pane === 'remote' ? this.host.remoteVisibleCols : this.host.localVisibleCols)
    const fromIdx = current.indexOf(dragCol)
    if (fromIdx < 0) return

    let insertAt = current.length
    let indicatorCol: string | null = null
    let placeAfter = false
    if (insertBeforeCol) {
      const targetIdx = current.indexOf(insertBeforeCol)
      if (targetIdx < 0) return
      insertAt = targetIdx
      indicatorCol = insertBeforeCol
      placeAfter = false
    } else if (placeAfterCol) {
      const targetIdx = current.indexOf(placeAfterCol)
      if (targetIdx < 0) return
      insertAt = targetIdx + 1
      indicatorCol = placeAfterCol
      placeAfter = true
    }

    let adjusted = insertAt
    if (fromIdx < adjusted) adjusted -= 1
    if (adjusted === fromIdx) {
      this._dropIndicator = indicatorCol ? { col: indicatorCol, placeAfter } : null
      this.host.cdr.detectChanges()
      return
    }

    const preview = [...current]
    const [item] = preview.splice(fromIdx, 1)
    preview.splice(Math.max(0, Math.min(adjusted, preview.length)), 0, item)

    this._previewOrder = preview
    this._dropIndicator = indicatorCol ? { col: indicatorCol, placeAfter } : null
    this.host.cdr.detectChanges()
  }

  private _commitPreviewOrder(pane: HeaderReorderPane, previewVisible: string[]): void {
    // ★ 2026-10-19 续八：rl 列序归到 local 配置组（与列宽/可见列同口径）
    const isRemote = pane === 'remote'
    const order = isRemote ? [...this.host.remoteColOrder] : [...this.host.localColOrder]
    const hidden = order.filter(c => !previewVisible.includes(c))
    const next = [...previewVisible]
    for (const c of order) {
      if (hidden.includes(c) && !next.includes(c)) next.push(c)
    }
    if (isRemote) {
      this.host.remoteColOrder = next
      this.host.saveRemoteColSettings()
    } else {
      this.host.localColOrder = next
      this.host.saveLocalColSettings()
    }
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch {}
  }

  private _createGhost(sourceEl: HTMLElement, sourceRect: DOMRect, clientX: number, top: number): void {
    const ghost = sourceEl.cloneNode(true) as HTMLElement
    ghost.classList.add('header-col-ghost')
    ghost.style.position = 'fixed'
    ghost.style.left = `${clientX - this._ghostOffsetX}px`
    ghost.style.top = `${top}px`
    ghost.style.width = `${sourceRect.width}px`
    ghost.style.height = `${sourceRect.height}px`
    ghost.style.zIndex = '100050'
    ghost.style.pointerEvents = 'none'
    ghost.style.margin = '0'
    document.body.appendChild(ghost)
    this._ghostEl = ghost
  }

  private _moveGhost(clientX: number, top: number): void {
    if (!this._ghostEl) return
    this._ghostEl.style.left = `${clientX - this._ghostOffsetX}px`
    this._ghostEl.style.top = `${top}px`
  }

  private _destroyGhost(): void {
    if (this._ghostEl) {
      this._ghostEl.remove()
      this._ghostEl = null
    }
  }

  private _colFromEl(el: HTMLElement): string | null {
    return KNOWN_HEADER_COLS.find(c => el.classList.contains(c)) || null
  }
}

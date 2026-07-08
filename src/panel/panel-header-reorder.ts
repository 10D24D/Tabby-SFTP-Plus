/**
 * 表头列拖拽重排：仅表头预览换位，松手后同步数据列
 */
import { ChangeDetectorRef, ElementRef } from '@angular/core'

export type HeaderReorderPane = 'local' | 'remote'

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

const KNOWN_HEADER_COLS = [
  'size', 'date', 'created', 'perms', 'mode',
  'access', 'owner', 'group', 'path', 'ext',
] as const

export class PanelHeaderReorder {
  private _dragCol: string | null = null
  private _dragPane: HeaderReorderPane | null = null
  private _dragging = false
  private _moved = false
  private _startX = 0
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
    if (col === 'name' || event.button !== 0) return
    if (this.host.resizing) return

    this.reset()

    const listSel = pane === 'local' ? '.pane-list.local-pane' : '.pane-list.remote-pane'
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
    this._previewOrder = [...(pane === 'local' ? this.host.localVisibleCols : this.host.remoteVisibleCols)]
    this._dropIndicator = null
    this._ghostOffsetX = event.clientX - sourceRect.left

    this._createGhost(sourceEl, sourceRect, event.clientX, sourceRect.top)

    const onMove = (e: MouseEvent) => {
      if (!this._dragging || !this._dragCol || this._dragPane !== pane) return
      if (!this._moved && Math.abs(e.clientX - this._startX) < 5) return
      if (!this._moved) {
        this._moved = true
        this.host.markJustResized()
      }
      this._moveGhost(e.clientX, sourceRect.top)
      this._previewHeaderOnly(pane, this._dragCol, e.clientX)
    }

    const finish = (commit: boolean) => {
      if (!this._dragging) return
      const preview = this._previewOrder
      if (commit && this._moved && preview) {
        this._commitPreviewOrder(pane, preview)
      }
      this.reset()
      this.host.cdr.detectChanges()
      this.host.clearJustResizedSoon(200)
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
    const listSel = pane === 'local' ? '.pane-list.local-pane' : '.pane-list.remote-pane'
    const header = (this.host.elRef.nativeElement as HTMLElement)
      .querySelector(`${listSel} .entry.header`) as HTMLElement | null
    if (!header) return

    const headers = Array.from(header.querySelectorAll('.sortable')) as HTMLElement[]
    const targets = headers.filter(el => {
      const c = this._colFromEl(el)
      return !!c && c !== 'name' && c !== dragCol
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
      || (pane === 'local' ? this.host.localVisibleCols : this.host.remoteVisibleCols)
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
    const order = pane === 'local' ? [...this.host.localColOrder] : [...this.host.remoteColOrder]
    const hidden = order.filter(c => !previewVisible.includes(c))
    const next = [...previewVisible]
    for (const c of order) {
      if (hidden.includes(c) && !next.includes(c)) next.push(c)
    }
    if (pane === 'local') {
      this.host.localColOrder = next
      this.host.saveLocalColSettings()
    } else {
      this.host.remoteColOrder = next
      this.host.saveRemoteColSettings()
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

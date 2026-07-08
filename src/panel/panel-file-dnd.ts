/**
 * 文件拖拽悬停与基础状态（不包含 drop 传输实现）
 */
import { ChangeDetectorRef, ElementRef } from '@angular/core'

export type FileDndPane = 'local' | 'remote'

export interface FileDndHost {
  cdr: ChangeDetectorRef
  elRef: ElementRef
  isHeaderReorderActive(): boolean
}

export class PanelFileDnd {
  private _localDragOver = false
  private _remoteDragOver = false
  private _dragSourcePane: FileDndPane | null = null
  private _dragSameDirNoop = false

  constructor(private readonly host: FileDndHost) {}

  get localDragOver(): boolean { return this._localDragOver }
  get remoteDragOver(): boolean { return this._remoteDragOver }

  setDragSource(pane: FileDndPane, sameDirNoop: boolean): void {
    this._dragSourcePane = pane
    this._dragSameDirNoop = sameDirNoop
  }

  isInternalSameDirDrag(targetPane: FileDndPane): boolean {
    return this._dragSameDirNoop && this._dragSourcePane === targetPane
  }

  reset(): void {
    this._dragSourcePane = null
    this._dragSameDirNoop = false
    this._localDragOver = false
    this._remoteDragOver = false
  }

  onEntryDragEnd(clearCustomDragPreview: () => void): void {
    clearCustomDragPreview()
    this.reset()
    this.host.cdr.detectChanges()
  }

  onDragOver(ev: DragEvent, targetPane: FileDndPane): void {
    if (this.host.isHeaderReorderActive()) return
    if (this.isInternalSameDirDrag(targetPane)) {
      ev.preventDefault()
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none'
      return
    }
    ev.preventDefault()
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
  }

  onDragEnter(ev: DragEvent, targetPane: FileDndPane): void {
    if (this.host.isHeaderReorderActive()) return
    if (this.isInternalSameDirDrag(targetPane)) {
      ev.preventDefault()
      return
    }
    ev.preventDefault()
    if (targetPane === 'remote') {
      this._remoteDragOver = true
    } else {
      this._localDragOver = true
    }
    this.host.cdr.detectChanges()
  }

  onDragLeave(ev: DragEvent, targetPane: FileDndPane): void {
    if (this.host.isHeaderReorderActive()) return
    ev.preventDefault()
    // 仅当真正离开 pane-list 时才取消高亮（避免鼠标在子元素间移动时误触发 dragleave）
    const related = ev.relatedTarget as Node | null
    const paneList = this.host.elRef.nativeElement.querySelector(`.pane-list.${targetPane}-pane`) as HTMLElement | null
    if (paneList && related && paneList.contains(related)) return
    if (targetPane === 'remote') {
      this._remoteDragOver = false
    } else {
      this._localDragOver = false
    }
    this.host.cdr.detectChanges()
  }
}

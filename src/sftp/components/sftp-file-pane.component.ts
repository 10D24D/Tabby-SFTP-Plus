/**
 * SFTP+ 文件列表面板（本地/远程共用）
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'

export type PaneNavAction =
  | 'back' | 'forward' | 'up' | 'home' | 'refresh'
  | 'toggleFilter'

export type PaneSortAction = { col: string }

@Component({
  selector: 'sftp-file-pane',
  template: `
    <div class="pane" (mousedown)="onPaneAreaMouseDown($event)">
      <div class="pane-title">
        <ng-container *ngFor="let item of resolvedPaneCustomOrder">
          <span *ngIf="item === 'label'" class="pane-label">{{ labelIcon }} {{ paneLabel }}</span>
          <div *ngIf="item === 'path'" class="pane-path">
            <input #pathInputEl class="path-input" [class.path-input--focused]="pathFocused"
              [ngModel]="pathModel"
              (ngModelChange)="onPathModelChange($event)"
              (keyup.enter)="pathEnter.emit()"
              (focus)="onPathFocus()"
              (blur)="onPathBlur()"
              (mousedown)="$event.stopPropagation()"
              [disabled]="pathDisabled" />
          </div>
          <button *ngIf="isToolbarItem(item)"
            (click)="onToolbarAction(item, $event)"
            [disabled]="isToolbarActionDisabled(item)"
            [title]="toolbarActionTitle(item)"
            class="icon-btn pane-toolbar-btn"
            [class.toggle-btn]="item === 'filter' || item === 'bookmark'"
            [class.filter-toggle-btn]="item === 'filter'"
            [class.bm-btn]="item === 'bookmark'"
            [class.active]="isToolbarActionActive(item)"
            (mousedown)="blurPathInput(pathInputEl)">
            <svg *ngIf="item === 'back'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3L5 8l5 5"/></svg>
            <svg *ngIf="item === 'forward'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3l5 5-5 5"/></svg>
            <svg *ngIf="item === 'up'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 13V3M4 6.5L8 3l4 3.5"/></svg>
            <svg *ngIf="item === 'refresh'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 0 1 9.5-3.5"/><path d="M12 2.5v3H9"/><path d="M13.5 8a5.5 5.5 0 0 1-9.5 3.5"/><path d="M4 13.5v-3h3"/></svg>
            <svg *ngIf="item === 'home'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5L8 3l5 4.5V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7.5z"/><path d="M6.5 14V10h3v4"/></svg>
            <svg *ngIf="item === 'filter'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12l-4.5 5.5v4l-3 1.5v-5.5L2 3z"/></svg>
            <svg *ngIf="item === 'bookmark'" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2.2L9.71 6.05 13.9 6.48 10.77 9.3 11.64 13.42 8 11.31 4.36 13.42 5.23 9.3 2.1 6.48 6.29 6.05 8 2.2z"/></svg>
          </button>
        </ng-container>
      </div>
      <div class="pane-filters" *ngIf="filterVisible">
        <input class="filter-input" [ngModel]="filterPending"
          (ngModelChange)="filterPendingChange.emit($event)"
          placeholder="{{ labels.filter }}"
          (keyup.enter)="applyFilter.emit()"
          (keyup.escape)="clearFilter.emit()" />
        <button class="filter-btn filter-confirm" (click)="applyFilter.emit()" title="{{ labels.filterApply }}">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8l3.5 4L13 4"/></svg>
        </button>
        <button class="filter-btn filter-clear" (click)="clearFilter.emit()" title="{{ labels.filterClear }}">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      </div>
      <div class="pane-list-wrap" [class.pane-drag-over]="dragOver">
        <div class="pane-list" [class]="listClass" [class.pane-flash]="flash"
          (dragover)="listDragOver.emit($event)"
          (dragenter)="listDragEnter.emit($event)"
          (dragleave)="listDragLeave.emit($event)"
          (drop)="listDrop.emit($event)"
          (mousedown)="listMouseDown.emit($event)"
          (mouseenter)="listMouseEnter.emit()"
          (scroll)="listScroll.emit()"
          (click)="listClick.emit($event)"
          (contextmenu)="listContextMenu.emit($event)">
          <div class="entry dim" *ngIf="showNoSession">{{ labels.noSession }}</div>
          <div class="entry header" *ngIf="showHeader" [style.gridTemplateColumns]="headerColWidths || colWidths"
            (contextmenu)="headerContextMenu.emit($event)"
            (dragover)="onHeaderDragOver($event)"
            (drop)="onHeaderDragOver($event)">
            <span class="icon"></span>
            <span class="name sortable"
              [class.header-col-resizing]="resizingCol === 'name'"
              (click)="sort.emit({ col: 'name' })">
              {{ labels.name }}<span class="sort-arrow" *ngIf="sortBy === 'name'">{{ sortAsc ? '▲' : '▼' }}</span>
              <div class="col-resize-handle"
                [class.resizing]="resizingCol === 'name'"
                (mousedown)="onColResizeMouseDown('name', $event)"
                (dblclick)="onColResizeDblClick('name', $event)"></div>
            </span>
            <span *ngFor="let col of headerColsResolved; trackBy: trackByCol"
              class="{{col}} sortable"
              [class.header-col-resizing]="resizingCol === col"
              [class.header-col-dragging]="draggingCol === col"
              [class.header-col-drop-before]="dropIndicatorCol === col && !dropIndicatorAfter"
              [class.header-col-drop-after]="dropIndicatorCol === col && dropIndicatorAfter"
              (mousedown)="onColHeaderMouseDown(col, $event)"
              (click)="onSortCol(col)">
              {{ colHeaderLabels[col] }}<span class="sort-arrow" *ngIf="sortArrow(col)">{{ sortArrow(col) }}</span>
              <div class="col-resize-handle"
                [class.resizing]="resizingCol === col"
                (mousedown)="onColResizeMouseDown(col, $event)"
                (dblclick)="onColResizeDblClick(col, $event)"></div>
            </span>
          </div>
          <div class="entry" *ngFor="let e of entries; let i = index; trackBy: trackByFn"
            [attr.data-path]="e.fullPath"
            (click)="entryClick.emit({ entry: e, event: $event, index: i })"
            (dblclick)="entryDblClick.emit({ entry: e, event: $event })"
            (contextmenu)="entryContextMenu.emit({ entry: e, event: $event })"
            [class.selected]="isSelected(e)"
            [draggable]="draggable && isSelected(e)"
            (dragstart)="entryDragStart.emit({ entry: e, event: $event })"
            (dragend)="entryDragEnd.emit()"
            [style.gridTemplateColumns]="colWidths">
            <span class="icon">{{ e.isDirectory ? '📁' : '📄' }}</span>
            <span class="name" [attr.title]="e.name">{{ inaccessiblePrefix(e) }}{{ e.name }}</span>
            <span *ngFor="let col of visibleCols; trackBy: trackByCol" class="{{col}}" [attr.title]="colValue(col, e)">{{ colValue(col, e) }}</span>
          </div>
          <div class="pane-empty" *ngIf="showEmpty">
            <ng-container *ngIf="hasError">{{ labels.errorAccess }}</ng-container>
            <ng-container *ngIf="!hasError">{{ filterActive ? labels.noMatch : labels.empty }}</ng-container>
          </div>
        </div>
      </div>
      <div class="pane-actions-bar">
        <span class="selection-info">{{ selectionInfo }}</span>
      </div>
      <div class="pane-loading" *ngIf="loading">
        <div class="spinner"></div>
      </div>
    </div>
  `,
})
export class SftpFilePaneComponent {
  constructor(private hostRef: ElementRef<HTMLElement>) {}

  @Input() labelIcon = '🖥'
  @Input() paneLabel = ''
  @Input() listClass = 'local-pane'
  @Input() pathInput = ''
  @Input() pathDisabled = false
  @Input() refreshDisabled = false
  @Input() canBack = false
  @Input() canForward = false
  @Input() canUp = false
  @Input() filterVisible = false
  @Input() filterPending = ''
  @Input() filterActive = ''
  @Input() bookmarksActive = false
  @Input() loading = false
  @Input() flash = false
  @Input() dragOver = false
  @Input() hasError = false
  @Input() showNoSession = false
  @Input() showHeader = true
  @Input() showEmpty = false
  @Input() entries: any[] = []
  @Input() visibleCols: string[] = []
  /** 表头预览列顺序（拖拽中可与数据列不同；空则跟随 visibleCols） */
  @Input() headerCols: string[] | null = null
  @Input() colWidths = ''
  /** 表头 grid 列宽（可与数据列不同，用于拖拽预览） */
  @Input() headerColWidths = ''
  @Input() sortBy = 'name'
  @Input() sortAsc = true
  @Input() draggable = true
  @Input() selectionInfo = ''
  @Input() isZh = true
  @Input() isLocal = true
  @Input() paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'> = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'filter', 'bookmark']
  @Input() colHeaderLabelFn: (col: string) => string = (c) => c
  @Input() colValueFn: (col: string, e: any) => string = () => ''
  @Input() isSelectedFn: (e: any) => boolean = () => false
  @Input() sortArrowFn: (col: string) => string = () => ''
  @Input() trackByFn: (index: number, e: any) => any = (i) => i
  /** 父组件正在拖拽调整的列名（用于高亮表头与分隔线） */
  @Input() resizingCol: string | null = null
  /** 正在拖拽排序的列名 */
  @Input() draggingCol: string | null = null
  /** 落点指示：目标列名 */
  @Input() dropIndicatorCol: string | null = null
  /** 落点指示：是否在目标列右侧 */
  @Input() dropIndicatorAfter = false

  get headerColsResolved(): string[] {
    return this.headerCols && this.headerCols.length ? this.headerCols : this.visibleCols
  }

  @Output() pathInputChange = new EventEmitter<string>()
  @Output() pathEnter = new EventEmitter<void>()
  @Output() pathBlur = new EventEmitter<void>()
  @Output() nav = new EventEmitter<PaneNavAction>()
  @Output() filterPendingChange = new EventEmitter<string>()
  @Output() applyFilter = new EventEmitter<void>()
  @Output() clearFilter = new EventEmitter<void>()
  @Output() listDragOver = new EventEmitter<DragEvent>()
  @Output() listDragEnter = new EventEmitter<DragEvent>()
  @Output() listDragLeave = new EventEmitter<DragEvent>()
  @Output() listDrop = new EventEmitter<DragEvent>()
  @Output() listMouseDown = new EventEmitter<MouseEvent>()
  @Output() listMouseEnter = new EventEmitter<void>()
  @Output() listScroll = new EventEmitter<void>()
  @Output() listClick = new EventEmitter<MouseEvent>()
  @Output() listContextMenu = new EventEmitter<MouseEvent>()
  @Output() headerContextMenu = new EventEmitter<MouseEvent>()
  @Output() sort = new EventEmitter<PaneSortAction>()
  @Output() colResizeStart = new EventEmitter<{ col: string; event: MouseEvent }>()
  @Output() colResizeAutoFit = new EventEmitter<{ col: string }>()
  @Output() colHeaderReorderStart = new EventEmitter<{ col: string; event: MouseEvent }>()
  @Output() entryClick = new EventEmitter<{ entry: any; event: MouseEvent; index: number }>()
  @Output() entryDblClick = new EventEmitter<{ entry: any; event: MouseEvent }>()
  @Output() entryContextMenu = new EventEmitter<{ entry: any; event: MouseEvent }>()
  @Output() entryDragStart = new EventEmitter<{ entry: any; event: DragEvent }>()
  @Output() entryDragEnd = new EventEmitter<void>()
  @Output() toggleBookmarks = new EventEmitter<MouseEvent>()

  @Input() i18n!: SftpI18nService

  get resolvedPaneCustomOrder(): Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'> {
    const allowed: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'> = ['label', 'path', 'back', 'forward', 'up', 'refresh', 'home', 'filter', 'bookmark']
    const order = this.paneCustomOrder.filter((x): x is any => allowed.includes(x as any))
    return order.length ? order : allowed
  }

  isToolbarItem(item: string): item is 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' {
    return ['back', 'forward', 'up', 'refresh', 'home', 'filter', 'bookmark'].includes(item)
  }

  onToolbarAction(action: 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark', event: MouseEvent): void {
    if (action === 'bookmark') {
      event.stopPropagation()
      this.toggleBookmarks.emit(event)
      return
    }
    this.nav.emit(action === 'filter' ? 'toggleFilter' : action)
  }

  isToolbarActionDisabled(action: 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'): boolean {
    if (action === 'back') return !this.canBack
    if (action === 'forward') return !this.canForward
    if (action === 'up') return !this.canUp
    if (action === 'refresh' || action === 'home') return this.refreshDisabled
    return false
  }

  isToolbarActionActive(action: 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'): boolean {
    if (action === 'filter') return this.filterVisible || !!this.filterActive
    if (action === 'bookmark') return this.bookmarksActive
    return false
  }

  toolbarActionTitle(action: 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'): string {
    // 读预算缓存（_rebuildLabels 在语言切换时更新），避免每次变更检测重复 i18n.t()
    return this._toolbarTitles[action] || ''
  }

  pathFocused = false

  /** 本地编辑缓冲：聚焦时与父组件的 pathInput 解耦，避免 CD 期间父级把路径
   *  重置为已提交值（如后台刷新/心跳）导致正在输入的内容被清掉、表现为"无法输入"。
   *  失焦或外部导航时由 ngOnChanges 同步回已提交路径。 */
  pathModel = ''
  private _pathFocused = false

  /**
   * 功能描述：外壳静态文案缓存（筛选/空状态/表头/工具栏标题/列头）。避免模板在每次变更检测里
   *          重复调用 i18n.t()；仅在语言切换（父组件替换 i18n 实例 → @Input i18n 引用变化）时重算。
   * 创建人：DD1024z + Hy3
   * 创建时间：2026-07-23
   */
  labels = { filter: '', filterApply: '', filterClear: '', noSession: '', name: '', errorAccess: '', noMatch: '', empty: '' }
  private _toolbarTitles: Record<string, string> = {}
  colHeaderLabels: Record<string, string> = {}

  private _rebuildLabels(): void {
    const t = (k: string) => (this.i18n ? this.i18n.t(k) : '')
    this.labels = {
      filter: t('pane.filter'),
      filterApply: t('filter.apply'),
      filterClear: t('filter.clear'),
      noSession: t('notify.noSSHSession'),
      name: t('file.name'),
      errorAccess: t('pane.errorAccess'),
      noMatch: t('pane.noMatch'),
      empty: t('pane.empty'),
    }
    this._toolbarTitles = {
      back: t('pane.back'), forward: t('pane.forward'), up: t('pane.up'),
      refresh: t('pane.refresh'), home: t('pane.home'), filter: t('pane.filterBtn'),
      bookmark: t('bookmark.title'),
    }
    // 预算所有可能列的表头文案（按 col 查表，列增减/重排无需重算）
    const cols = ['name', 'size', 'date', 'created', 'perms', 'mode', 'access', 'owner', 'group', 'path', 'ext']
    const map: Record<string, string> = {}
    for (const c of cols) map[c] = this.colHeaderLabelFn(c)
    this.colHeaderLabels = map
  }

  ngOnInit(): void {
    this.pathModel = this.pathInput
    this._rebuildLabels()
  }

  ngOnChanges(changes: SimpleChanges): void {
    // 仅在非聚焦态同步父级 pathInput，聚焦编辑时绝不覆盖用户正在输入的内容
    if (changes.pathInput && !this._pathFocused) {
      this.pathModel = this.pathInput
    }
    // 语言切换时父组件会重建 i18n 实例（引用变化）；列头映射函数也可能随之更新 → 重算文案缓存
    if (changes.i18n || changes.colHeaderLabelFn) {
      this._rebuildLabels()
    }
  }

  onPathFocus(): void {
    this._pathFocused = true
    this.pathFocused = true
    // 从已提交路径开始编辑，避免残留上一次输入
    this.pathModel = this.pathInput
  }

  onPathModelChange(v: string): void {
    this.pathModel = v
    this.pathInputChange.emit(v)
  }

  onPathBlur(): void {
    this._pathFocused = false
    this.pathFocused = false
    this.pathBlur.emit()
  }

  onPaneAreaMouseDown(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.path-input')) return
    this.blurAllPathInputs()
  }

  private blurAllPathInputs(): void {
    const root = this.hostRef.nativeElement.closest('.sftp-root') ?? this.hostRef.nativeElement
    root.querySelectorAll('.path-input').forEach(node => {
      const el = node as HTMLInputElement
      if (document.activeElement === el) el.blur()
    })
    this.pathFocused = false
  }

  onColResizeMouseDown(col: string, event: MouseEvent): void {
    event.stopPropagation()
    this.colResizeStart.emit({ col, event })
  }

  onColResizeDblClick(col: string, event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.colResizeAutoFit.emit({ col })
  }

  onHeaderDragOver(event: DragEvent): void {
    event.preventDefault()
    event.stopPropagation()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onColHeaderMouseDown(col: string, event: MouseEvent): void {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.col-resize-handle')) return
    event.stopPropagation()
    this.colHeaderReorderStart.emit({ col, event })
  }

  blurPathInput(_el?: HTMLInputElement): void {
    this.blurAllPathInputs()
  }

  trackByCol = (_: number, col: string): string => col

  colHeaderLabel(col: string): string { return this.colHeaderLabelFn(col) }
  colValue(col: string, e: any): string { return this.colValueFn(col, e) }
  isSelected(e: any): boolean { return this.isSelectedFn(e) }
  sortArrow(col: string): string { return this.sortArrowFn(col) }

  inaccessiblePrefix(e: any): string {
    return this.isLocal && e.inaccessible ? '* ' : ''
  }

  onSortCol(col: string): void {
    const mapped = col === 'date' ? 'modified' : col === 'created' ? 'birthtime' : col
    this.sort.emit({ col: mapped })
  }
}

/**
 * SFTP+ 远程文件查看对话框（文本 / 图片）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-08-05
 * @修改人：DD1024z + GPT-5.6 Sol
 * @修改时间：2026-09-29 — 自绘插入光标由「宽度 px（1–4）」改为「形状三档」：@Input caretShape
 *              （block/beam/underline，取值与 Tabby 终端 store.terminal.cursor 逐字一致），
 *              几何改由 caretBoxWidthPx / caretBoxHeightPx / caretBoxTopPx 三个 getter 给出
 *              （方块＝覆盖整字 + mix-blend-mode 反色、竖线＝2px、下划线＝行底 2px 横线），
 *              宽高从 CSS 挪到内联样式（CSS 里保留 2×18 仅作兜底）
 *              2026-09-21 — rAF/右键菜单回调增加销毁安全的变更检测；
 *              2026-09-20 — 行号/光标宽度可配置（设置项）
 *              2026-09-20 — 查看器补回点击插入光标（虚拟列表无原生 caret）
 *              2026-09-20 — 行号 gutter 改 min-width，避免 padding 被 width 挤没
 *              2026-09-20 — 虚拟滚动：加大 overscan + rAF 贴窗防滚空白；增加行号 gutter
 *              2026-09-20 — issue #23：大文本改虚拟滚动（按行窗口渲染），根治 textarea 塞满白屏
 *              2026-08-10 — 复制/复制选中按钮、图片上一张下一张导航、加载中图标、打开时文本框自动聚焦
 *              2026-08-10 — 光标显示优化([value]替代ngModel + rAF聚焦)、复制选中按钮消失修复(click/blur事件)
 *              2026-08-26 — 右键菜单卡顿：OnPush + zone 外原生 contextmenu + 选区检测禁 slice
 */
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import type { CaretShape } from '../../tabby/config-provider'
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'
import { copyImageToClipboard, copyTextToClipboard } from './clipboard-copy'
import { TextMenuAction } from './sftp-text-context-menu.component'

import { log } from '../../services/sftp-logger'
export type ViewerMode = 'text' | 'image'

/** 虚拟列表行高（与 .file-dialog-vs-line 的 line-height 一致） */
const VS_LINE_HEIGHT = 18
/** 视口上下各多渲染的行数；偏大可减少快速滚动时「空白一闪」 */
const VS_OVERSCAN = 48

function selectionTextInside(root: HTMLElement | null | undefined): string {
  if (!root) return ''
  const sel = window.getSelection?.()
  if (!sel || sel.isCollapsed || sel.rangeCount < 1) return ''
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return ''
  return sel.toString()
}

function hasSelectionInside(root: HTMLElement | null | undefined): boolean {
  return selectionTextInside(root).length > 0
}

@Component({
  selector: 'sftp-viewer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" *ngIf="visible" (wheel)="onOverlayWheel($event)" (click)="onOverlayClick($event)">
      <div class="dialog file-dialog-shell" [class.is-maximized]="maximized">
        <div class="dialog-title">
          <span class="file-dialog-title">{{ i18n.t('file.view') }} — {{ fileName }}</span>
          <div class="file-dialog-window-btns">
            <button type="button" class="file-dialog-win-btn"
              (click)="toggleMaximize()"
              [title]="maximized ? i18n.t('app.restore') : i18n.t('app.maximize')">
              <svg *ngIf="!maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="1.5" y="1.5" width="9" height="9" rx="0.5"/>
              </svg>
              <svg *ngIf="maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="3.5" y="1.5" width="7" height="7" rx="0.5"/>
                <path d="M1.5 3.5h6.5v6.5H1.5z"/>
              </svg>
            </button>
            <button type="button" class="file-dialog-win-btn"
              (click)="close.emit()" [title]="i18n.t('app.close')">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="file-dialog-path" *ngIf="displayPath">{{ displayPath }}</div>
        <div class="file-dialog-body" [class.editor-body]="!loading && !error && mode === 'text'" (wheel)="onScrollableWheel($event)">
          <div class="file-dialog-loading" *ngIf="loading">
            <div class="spinner"></div>
          </div>
          <div class="file-dialog-status file-dialog-error" *ngIf="!loading && error">{{ error }}</div>

          <!-- ★ 2026-09-20：文本虚拟滚动——inner 撑高度 + 窗口贴 scrollTop；点击显示插入光标 -->
          <div #vsViewport class="file-dialog-vs"
            *ngIf="!loading && !error && mode === 'text'"
            tabindex="0"
            (mousedown)="onVsMouseDown($event)"
            (wheel)="onScrollableWheel($event)"
            (mouseup)="updateHasSelection()"
            (keyup)="updateHasSelection()"
            (selectstart)="scheduleSelectionCheck()"
            (blur)="onTextBlur()">
            <div class="file-dialog-vs-inner" [style.height.px]="vsTotalHeight">
              <div class="file-dialog-vs-caret"
                *ngIf="caretVisible && !hasSelectionText"
                [class.is-block]="caretShape === 'block'"
                [style.left.px]="caretX"
                [style.top.px]="caretBoxTopPx"
                [style.width.px]="caretBoxWidthPx"
                [style.height.px]="caretBoxHeightPx"
                aria-hidden="true"></div>
              <div class="file-dialog-vs-window"
                [style.transform]="'translate3d(0,' + vsOffsetY + 'px,0)'">
                <div class="file-dialog-vs-line" *ngFor="let line of vsVisibleLines; let i = index; trackBy: trackVsLine">
                  <span class="file-dialog-vs-gutter" *ngIf="showLineNumbers"
                    [style.minWidth.ch]="vsGutterChars"
                    aria-hidden="true">{{ vsStartIndex + i + 1 }}</span>
                  <span class="file-dialog-vs-text"
                    [class.file-dialog-vs-text-nogutter]="!showLineNumbers">{{ line }}</span>
                </div>
              </div>
            </div>
          </div>

          <div #imageWrap class="file-dialog-image-wrap" *ngIf="!loading && !error && mode === 'image'">
            <img class="file-dialog-image" [src]="imageUrl" [alt]="fileName" />
            <div class="image-nav" *ngIf="imageCount > 1">
              <button type="button" class="image-nav-btn"
                (click)="prevImage.emit()" [disabled]="imageIndex <= 0"
                [title]="i18n.t('viewer.prevImage')">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 3L5 8l5 5"/>
                </svg>
              </button>
              <span class="image-nav-pos">{{ imageIndex + 1 }} / {{ imageCount }}</span>
              <button type="button" class="image-nav-btn"
                (click)="nextImage.emit()" [disabled]="imageIndex >= imageCount - 1"
                [title]="i18n.t('viewer.nextImage')">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 3l5 5-5 5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="dialog-buttons">
          <span class="dialog-buttons-left">
            <button type="button" class="file-dialog-system-btn" *ngIf="showSystemAction"
              (click)="systemAction.emit()" [disabled]="loading || !!error"
              [title]="i18n.t('file.openInSystem')">
              {{ i18n.t('file.openInSystem') }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              (click)="copy()" [disabled]="loading || !!error || !canCopy"
              [title]="i18n.t('file.copy')">
              {{ copyLabel }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              *ngIf="mode === 'text' && hasSelectionText"
              (mousedown)="$event.preventDefault()"
              (click)="copySelection()" [disabled]="loading || !!error"
              [title]="i18n.t('file.copySelection')">
              {{ copiedSel ? i18n.t('file.copied') : i18n.t('file.copySelection') }}
            </button>
          </span>
          <button type="button" (click)="close.emit()">{{ i18n.t('app.close') }}</button>
        </div>
      </div>

      <sftp-text-context-menu
        [i18n]="i18n"
        [visible]="textMenuVisible"
        [x]="textMenuX" [y]="textMenuY"
        [mode]="textMenuMode"
        [editable]="false"
        [hasSelection]="textMenuHasSelection"
        [canPaste]="textMenuCanPaste"
        [hasImage]="textMenuHasImage"
        [hasAddress]="textMenuHasAddress"
        (action)="onTextMenuAction($event)"
        (close)="onTextMenuClose()">
      </sftp-text-context-menu>
    </div>
  `,
  styles: [FILE_DIALOG_SHARED_STYLES],
})
export class SftpViewerDialogComponent implements OnChanges, OnDestroy, AfterViewChecked {
  private static readonly MAXIMIZED_KEY = 'sftp-plus-viewer-maximized'
  private _destroyed = false

  private _safeDetect(): void {
    if (this._destroyed) return
    try { this.cdr.detectChanges() } catch { /* destroyed view */ }
  }

  @ViewChild('vsViewport') private vsViewport?: ElementRef<HTMLDivElement>
  @ViewChild('imageWrap') private imageWrap?: ElementRef<HTMLDivElement>

  @Input() visible = false
  @Input() loading = false
  @Input() mode: ViewerMode = 'text'
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() textContent = ''
  @Input() imageUrl = ''
  @Input() error = ''
  @Input() showSystemAction = false
  @Input() imageIndex = 0
  @Input() imageCount = 0
  /** 是否显示行号（设置项，默认 true） */
  @Input() showLineNumbers = true
  /** 自绘插入光标形状（设置项，block/beam/underline 三档，默认 beam 细竖线） */
  @Input() caretShape: CaretShape = 'beam'

  copied = false
  private copyTimer?: any
  copiedSel = false
  private copySelTimer?: any
  hasSelectionText = false
  private pendingFocus = false
  private _selCheckTimer: ReturnType<typeof setTimeout> | null = null

  /** 按行拆好的全文（仅内存索引，DOM 只挂载窗口） */
  private _lines: string[] = []
  vsVisibleLines: string[] = []
  vsStartIndex = 0
  vsOffsetY = 0
  vsTotalHeight = 0
  /** 行号列宽度（字符数），随总行数位数变化 */
  vsGutterChars = 3
  /** 点击后的插入光标（只读虚拟列表无原生 caret） */
  caretVisible = false
  caretX = 0
  caretY = 0
  private _charWidth = 0
  private _vsRaf = 0
  private _vsScrollBound = false
  private _vsScrollEl: HTMLElement | null = null
  private readonly _onVsScrollNative = (): void => {
    if (this._vsRaf) return
    this._vsRaf = requestAnimationFrame(() => {
      this._vsRaf = 0
      this._syncVisibleWindow(false)
      // OnPush：滚动在 zone 外，需显式刷本组件
      this._safeDetect()
    })
  }

  textMenuVisible = false
  textMenuX = 0
  textMenuY = 0
  textMenuMode: 'text' | 'image' = 'text'
  textMenuHasSelection = false
  textMenuHasImage = false
  textMenuHasAddress = false
  textMenuCanPaste = false

  @Output() close = new EventEmitter<void>()
  @Output() systemAction = new EventEmitter<void>()
  @Output() prevImage = new EventEmitter<void>()
  @Output() nextImage = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  maximized = SftpViewerDialogComponent.loadMaximized()

  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  private _ctxTarget: HTMLElement | null = null
  private readonly _onNativeContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()
    this.textMenuMode = this.mode
    this.textMenuHasSelection = this.mode === 'text' && hasSelectionInside(this.vsViewport?.nativeElement)
    this.textMenuHasImage = this.mode === 'image' && !!this.imageUrl
    this.textMenuHasAddress = this.mode === 'image' && !!this.imageUrl
    this.textMenuCanPaste = !!(navigator.clipboard && (navigator.clipboard as any).readText)
    this.textMenuX = ev.clientX
    this.textMenuY = ev.clientY
    this.textMenuVisible = true
    this._safeDetect()
  }

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpViewerDialogComponent.loadMaximized()
    }
    if (changes['textContent'] || (changes['visible'] && this.visible)) {
      this._rebuildLines(this.textContent || '')
    }
    if (this.visible && !this.loading && !this.error && this.mode === 'text'
      && (changes['visible'] || changes['loading'] || changes['textContent'])) {
      this.pendingFocus = true
    }
    if (changes['textContent'] || changes['visible']) this.hasSelectionText = false
    if (changes['visible']?.currentValue === false) {
      this.textMenuVisible = false
      this._teardownVsScrollListener()
      this._unbindCtxTarget()
      this._lines = []
      this.vsVisibleLines = []
      this.caretVisible = false
      this._charWidth = 0
    }
    if (changes['visible']) {
      // 打开/最大化后视口高度可能变化，下一帧按新高度重算窗口
      setTimeout(() => this._syncVisibleWindow(true), 0)
    }
    this.cdr.markForCheck()
  }

  ngAfterViewChecked(): void {
    if (this.pendingFocus && this.vsViewport) {
      this.pendingFocus = false
      requestAnimationFrame(() => {
        const vp = this.vsViewport?.nativeElement
        vp?.focus({ preventScroll: true })
        this._syncVisibleWindow(true)
        if (vp && this._lines.length) {
          // 打开时像旧 textarea 一样给出插入光标反馈
          const cw = this._measureCharWidth(vp)
          this.caretX = this._gutterBoxWidth(cw)
          this.caretY = Math.floor(vp.scrollTop / VS_LINE_HEIGHT) * VS_LINE_HEIGHT
          this.caretVisible = true
        }
        this._safeDetect()
      })
    }
    this._ensureVsScrollListener()
    const target =
      (!this.loading && !this.error && this.mode === 'text' && this.vsViewport?.nativeElement)
      || (!this.loading && !this.error && this.mode === 'image' && this.imageWrap?.nativeElement)
      || null
    this._bindCtxTarget(target)
  }

  ngOnDestroy(): void {
    this._destroyed = true
    this._teardownVsScrollListener()
    this._unbindCtxTarget()
    if (this.copyTimer) clearTimeout(this.copyTimer)
    if (this.copySelTimer) clearTimeout(this.copySelTimer)
    if (this._selCheckTimer) clearTimeout(this._selCheckTimer)
    if (this._vsRaf) { cancelAnimationFrame(this._vsRaf); this._vsRaf = 0 }
  }

  /** 光标盒宽度：方块/下划线覆盖一个字符宽（与点击定位用的 _charWidth 同源），竖线固定 2px */
  get caretBoxWidthPx(): number {
    if (this.caretShape === 'beam') return 2
    return Math.max(4, Math.round(this._charWidth || 8))
  }

  /** 光标盒高度：下划线只有 2px 细横线，其余两种占满整行 */
  get caretBoxHeightPx(): number {
    return this.caretShape === 'underline' ? 2 : VS_LINE_HEIGHT
  }

  /** 光标盒竖直位置：下划线贴行底（行顶 + 行高 - 线高），其余与 caretY 对齐 */
  get caretBoxTopPx(): number {
    return this.caretShape === 'underline' ? this.caretY + VS_LINE_HEIGHT - 2 : this.caretY
  }

  trackVsLine = (i: number): number => this.vsStartIndex + i

  private _gutterBoxWidth(cw: number): number {
    if (!this.showLineNumbers) return 0
    // 与 CSS 对齐：padL 8 + digits + padR 16 + border 1 + text padL 16
    return 8 + this.vsGutterChars * cw + 16 + 1 + 16
  }

  private _ensureVsScrollListener(): void {
    const el = this.vsViewport?.nativeElement ?? null
    if (!el) return
    if (this._vsScrollBound && this._vsScrollEl === el) return
    this._teardownVsScrollListener()
    this._vsScrollEl = el
    this._vsScrollBound = true
    this.zone.runOutsideAngular(() => {
      el.addEventListener('scroll', this._onVsScrollNative, { passive: true })
    })
  }

  private _teardownVsScrollListener(): void {
    if (this._vsScrollEl && this._vsScrollBound) {
      this._vsScrollEl.removeEventListener('scroll', this._onVsScrollNative)
    }
    this._vsScrollEl = null
    this._vsScrollBound = false
  }

  private _rebuildLines(text: string): void {
    // 按行切分；保留空行，去掉行尾 \r（Windows）
    this._lines = text.length ? text.split(/\n/).map(l => (l.endsWith('\r') ? l.slice(0, -1) : l)) : []
    this.vsTotalHeight = Math.max(this._lines.length * VS_LINE_HEIGHT, VS_LINE_HEIGHT)
    this.vsGutterChars = Math.max(3, String(Math.max(this._lines.length, 1)).length)
    this.vsStartIndex = 0
    this.vsOffsetY = 0
    // 视口可能尚未挂上，先按默认高度铺一屏，挂载后再 sync
    this._syncVisibleWindow(true)
  }

  private _syncVisibleWindow(force: boolean): void {
    const el = this.vsViewport?.nativeElement
    const lineCount = this._lines.length
    if (!lineCount) {
      if (this.vsVisibleLines.length) this.vsVisibleLines = []
      this.vsOffsetY = 0
      this.caretVisible = false
      return
    }
    const scrollTop = el ? el.scrollTop : 0
    const viewH = el && el.clientHeight > 0 ? el.clientHeight : 480
    // 先贴窗：offset 立刻对齐 scrollTop 附近，减少「滚过去一片空」
    const first = Math.max(0, Math.floor(scrollTop / VS_LINE_HEIGHT) - VS_OVERSCAN)
    const visibleCount = Math.ceil(viewH / VS_LINE_HEIGHT) + VS_OVERSCAN * 2
    const last = Math.min(lineCount, first + visibleCount)
    const nextOffset = first * VS_LINE_HEIGHT
    if (!force
      && first === this.vsStartIndex
      && last === this.vsStartIndex + this.vsVisibleLines.length
      && nextOffset === this.vsOffsetY) {
      return
    }
    this.vsStartIndex = first
    this.vsOffsetY = nextOffset
    this.vsVisibleLines = this._lines.slice(first, last)
  }

  /** 点击正文：放置闪烁插入光标（虚拟列表不是 textarea，需自绘） */
  onVsMouseDown(ev: MouseEvent): void {
    if (ev.button !== 0) return
    const vp = this.vsViewport?.nativeElement
    if (!vp || !this._lines.length) return
    // 点在滚动条上不处理
    if (ev.offsetX >= vp.clientWidth) return

    const cw = this._measureCharWidth(vp)
    const gutterBox = this._gutterBoxWidth(cw)
    const yInContent = vp.scrollTop + (ev.clientY - vp.getBoundingClientRect().top) - 12
    const lineIdx = Math.max(0, Math.min(this._lines.length - 1, Math.floor(yInContent / VS_LINE_HEIGHT)))
    const line = this._lines[lineIdx] || ''
    const xInContent = (ev.clientX - vp.getBoundingClientRect().left) - 12 - gutterBox
    const col = Math.max(0, Math.min(line.length, Math.round(xInContent / cw)))

    this.caretX = gutterBox + col * cw
    this.caretY = lineIdx * VS_LINE_HEIGHT
    this.caretVisible = true
    // 拖选开始时先显示，mouseup 若有选区再藏
    this.cdr.markForCheck()
  }

  private _measureCharWidth(host: HTMLElement): number {
    if (this._charWidth > 0) return this._charWidth
    const probe = document.createElement('span')
    probe.textContent = '0000000000'
    probe.style.cssText = [
      'position:absolute', 'visibility:hidden', 'white-space:pre',
      'font-family:ui-monospace,Cascadia Code,Consolas,monospace',
      'font-size:12px', 'line-height:18px',
    ].join(';')
    host.appendChild(probe)
    this._charWidth = Math.max(1, probe.offsetWidth / 10)
    host.removeChild(probe)
    return this._charWidth
  }

  private _bindCtxTarget(el: HTMLElement | null): void {
    if (this._ctxTarget === el) return
    this._unbindCtxTarget()
    if (!el) return
    this._ctxTarget = el
    this.zone.runOutsideAngular(() => {
      el.addEventListener('contextmenu', this._onNativeContextMenu, true)
    })
  }

  private _unbindCtxTarget(): void {
    if (!this._ctxTarget) return
    this._ctxTarget.removeEventListener('contextmenu', this._onNativeContextMenu, true)
    this._ctxTarget = null
  }

  toggleMaximize(): void {
    this.maximized = !this.maximized
    SftpViewerDialogComponent.saveMaximized(this.maximized)
    setTimeout(() => this._syncVisibleWindow(true), 0)
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (!this.visible || this.mode !== 'image' || this.imageCount <= 1) return
    const t = ev.target as HTMLElement | null
    const inViewer = !!t?.closest?.('sftp-viewer-dialog, .overlay, .file-dialog-shell')
    if (!inViewer && document.activeElement && !(document.activeElement as HTMLElement).closest?.('sftp-viewer-dialog, .overlay')) {
      return
    }
    if (ev.key === 'ArrowLeft') {
      if (this.imageIndex > 0) { ev.preventDefault(); this.prevImage.emit() }
    } else if (ev.key === 'ArrowRight') {
      if (this.imageIndex < this.imageCount - 1) { ev.preventDefault(); this.nextImage.emit() }
    }
  }

  copy(): void {
    let ok = false
    if (this.mode === 'image' && this.imageUrl) {
      if (this.imageUrl.startsWith('data:')) ok = copyImageToClipboard(this.imageUrl)
      else ok = copyTextToClipboard(this.imageUrl)
    } else {
      ok = copyTextToClipboard(this.textContent || '')
    }
    if (ok) this.showCopiedFeedback()
  }

  copySelection(): void {
    const sel = selectionTextInside(this.vsViewport?.nativeElement)
    if (!sel) return
    if (copyTextToClipboard(sel)) {
      this.copiedSel = true
      if (this.copySelTimer) clearTimeout(this.copySelTimer)
      this.copySelTimer = setTimeout(() => { this.copiedSel = false; this.cdr.markForCheck() }, 1500)
      this.cdr.markForCheck()
    }
  }

  updateHasSelection(): void {
    const next = hasSelectionInside(this.vsViewport?.nativeElement)
    if (next === this.hasSelectionText) {
      // 有选区时藏插入光标；无选区且刚点过则保持
      if (next && this.caretVisible) {
        this.caretVisible = false
        this.cdr.markForCheck()
      }
      return
    }
    this.hasSelectionText = next
    if (next) this.caretVisible = false
    this.cdr.markForCheck()
  }

  scheduleSelectionCheck(): void {
    if (this._selCheckTimer) clearTimeout(this._selCheckTimer)
    this._selCheckTimer = setTimeout(() => {
      this._selCheckTimer = null
      this.updateHasSelection()
    }, 0)
  }

  onTextBlur(): void {
    // 延迟：复制选中按钮的 mousedown 会先 blur，需等 click 完成
    setTimeout(() => {
      let dirty = false
      if (!hasSelectionInside(this.vsViewport?.nativeElement) && this.hasSelectionText) {
        this.hasSelectionText = false
        dirty = true
      }
      if (this.caretVisible) {
        this.caretVisible = false
        dirty = true
      }
      if (dirty) this.cdr.markForCheck()
    }, 120)
  }

  onTextMenuAction(a: TextMenuAction): void {
    switch (a) {
      case 'copySelection': this.copySelection(); break
      case 'copyAll': this.copy(); break
      case 'copyAddress': if (this.imageUrl) copyTextToClipboard(this.imageUrl); break
      case 'selectAll': {
        // 虚拟列表无法一次选中全文 DOM；全选语义改为复制全文（并提示已复制）
        this.copy()
        break
      }
      default: break
    }
    this.textMenuVisible = false
    this.cdr.markForCheck()
  }

  onTextMenuClose(): void {
    if (!this.textMenuVisible) return
    this.textMenuVisible = false
    this.cdr.markForCheck()
  }

  onOverlayClick(ev: MouseEvent): void {
    if (!this.textMenuVisible) return
    const target = ev.target as HTMLElement | null
    if (target?.closest('.text-ctx-menu')) return
    this.textMenuVisible = false
    this.cdr.markForCheck()
  }

  get canCopy(): boolean {
    return this.mode === 'image' ? !!this.imageUrl : !!this.textContent
  }

  get copyLabel(): string {
    return this.copied ? this.i18n.t('file.copied') : this.i18n.t('file.copy')
  }

  private showCopiedFeedback(): void {
    this.copied = true
    if (this.copyTimer) clearTimeout(this.copyTimer)
    this.copyTimer = setTimeout(() => { this.copied = false; this.cdr.markForCheck() }, 1500)
    this.cdr.markForCheck()
  }

  private static loadMaximized(): boolean {
    try {
      return localStorage.getItem(SftpViewerDialogComponent.MAXIMIZED_KEY) === 'true'
    } catch (e) {
      log.warn('loadMaximized failed', e)
      return false
    }
  }

  private static saveMaximized(value: boolean): void {
    try {
      localStorage.setItem(SftpViewerDialogComponent.MAXIMIZED_KEY, value ? 'true' : 'false')
    } catch (e) { log.warn('saveMaximized failed', e) }
  }
}

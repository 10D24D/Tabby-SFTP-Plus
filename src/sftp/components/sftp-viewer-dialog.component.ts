/**
 * SFTP+ 远程文件查看对话框（文本 / 图片）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-05
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-10 — 复制/复制选中按钮、图片上一张下一张导航、加载中图标、打开时文本框自动聚焦
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
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'
import { copyImageToClipboard, copyTextToClipboard } from './clipboard-copy'
import { TextMenuAction } from './sftp-text-context-menu.component'

import { log } from '../../services/sftp-logger'
export type ViewerMode = 'text' | 'image'

/** 仅比较 selectionStart/End，禁止 slice 大选区（大文件全选时右键会卡死） */
function textareaHasSelection(ta?: ElementRef<HTMLTextAreaElement>): boolean {
  if (!ta) return false
  const el = ta.nativeElement
  return (el.selectionStart ?? 0) !== (el.selectionEnd ?? 0)
}

function textareaSelectedText(ta?: ElementRef<HTMLTextAreaElement>): string {
  if (!ta) return ''
  const el = ta.nativeElement
  const s = el.selectionStart ?? 0
  const e = el.selectionEnd ?? 0
  if (s === e) return ''
  return el.value.slice(s, e)
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
          <textarea #viewerTextarea class="file-dialog-textarea"
            *ngIf="!loading && !error && mode === 'text'"
            (wheel)="onScrollableWheel($event)"
            (mouseup)="updateHasSelection()" (keyup)="updateHasSelection()"
            (select)="updateHasSelection()" (click)="updateHasSelection()"
            (blur)="onTextareaBlur()"
            [value]="textContent"
            readonly
            spellcheck="false"></textarea>
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

  @ViewChild('viewerTextarea') private viewerTextarea?: ElementRef<HTMLTextAreaElement>
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

  copied = false
  private copyTimer?: any
  copiedSel = false
  private copySelTimer?: any
  hasSelectionText = false
  private pendingFocus = false

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
    // ★ zone 外打开菜单：只刷新本对话框视图，避免整棵浮动面板 CD 造成右键卡顿
    this.textMenuMode = this.mode
    this.textMenuHasSelection = this.mode === 'text' && textareaHasSelection(this.viewerTextarea)
    this.textMenuHasImage = this.mode === 'image' && !!this.imageUrl
    this.textMenuHasAddress = this.mode === 'image' && !!this.imageUrl
    this.textMenuCanPaste = !!(navigator.clipboard && (navigator.clipboard as any).readText)
    this.textMenuX = ev.clientX
    this.textMenuY = ev.clientY
    this.textMenuVisible = true
    this.cdr.detectChanges()
  }

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpViewerDialogComponent.loadMaximized()
    }
    if (this.visible && !this.loading && !this.error && this.mode === 'text'
      && (changes['visible'] || changes['loading'] || changes['textContent'])) {
      this.pendingFocus = true
    }
    if (changes['textContent'] || changes['visible']) this.hasSelectionText = false
    if (changes['visible']?.currentValue === false) {
      this.textMenuVisible = false
      this._unbindCtxTarget()
    }
    this.cdr.markForCheck()
  }

  ngAfterViewChecked(): void {
    if (this.pendingFocus && this.viewerTextarea) {
      this.pendingFocus = false
      requestAnimationFrame(() => {
        this.viewerTextarea?.nativeElement.focus({ preventScroll: true })
      })
    }
    const target =
      (!this.loading && !this.error && this.mode === 'text' && this.viewerTextarea?.nativeElement)
      || (!this.loading && !this.error && this.mode === 'image' && this.imageWrap?.nativeElement)
      || null
    this._bindCtxTarget(target)
  }

  ngOnDestroy(): void {
    this._unbindCtxTarget()
    if (this.copyTimer) clearTimeout(this.copyTimer)
    if (this.copySelTimer) clearTimeout(this.copySelTimer)
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
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (!this.visible || this.mode !== 'image' || this.imageCount <= 1) return
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
    const sel = textareaSelectedText(this.viewerTextarea)
    if (!sel) return
    if (copyTextToClipboard(sel)) {
      this.copiedSel = true
      if (this.copySelTimer) clearTimeout(this.copySelTimer)
      this.copySelTimer = setTimeout(() => { this.copiedSel = false; this.cdr.markForCheck() }, 1500)
      this.cdr.markForCheck()
    }
  }

  updateHasSelection(): void {
    const next = textareaHasSelection(this.viewerTextarea)
    if (next === this.hasSelectionText) return
    this.hasSelectionText = next
    this.cdr.markForCheck()
  }

  onTextareaBlur(): void {
    if (!this.hasSelectionText) return
    this.hasSelectionText = false
    this.cdr.markForCheck()
  }

  onTextMenuAction(a: TextMenuAction): void {
    switch (a) {
      case 'copySelection': this.copySelection(); break
      case 'copyAll': this.copy(); break
      case 'copyAddress': if (this.imageUrl) copyTextToClipboard(this.imageUrl); break
      case 'selectAll':
        if (this.viewerTextarea) {
          this.viewerTextarea.nativeElement.focus()
          this.viewerTextarea.nativeElement.select()
          this.updateHasSelection()
        }
        break
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

/**
 * SFTP+ 远程文件查看对话框（文本 / 图片）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-05
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-10 — 复制/复制选中按钮、图片上一张下一张导航、加载中图标、打开时文本框自动聚焦
 *              2026-08-10 — 光标显示优化([value]替代ngModel + rAF聚焦)、复制选中按钮消失修复(click/blur事件)
 */
import { Component, ElementRef, EventEmitter, AfterViewChecked, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'
import { copyImageToClipboard, copyTextToClipboard } from './clipboard-copy'

import { log } from '../../services/sftp-logger'
export type ViewerMode = 'text' | 'image'

@Component({
  selector: 'sftp-viewer-dialog',
  template: `
    <div class="overlay" *ngIf="visible" (wheel)="onOverlayWheel($event)">
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
          <div class="file-dialog-image-wrap" *ngIf="!loading && !error && mode === 'image'">
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
    </div>
  `,
  styles: [FILE_DIALOG_SHARED_STYLES],
})
export class SftpViewerDialogComponent implements OnChanges, OnDestroy, AfterViewChecked {
  private static readonly MAXIMIZED_KEY = 'sftp-plus-viewer-maximized'

  @ViewChild('viewerTextarea') private viewerTextarea?: ElementRef<HTMLTextAreaElement>

  @Input() visible = false
  @Input() loading = false
  @Input() mode: ViewerMode = 'text'
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() textContent = ''
  @Input() imageUrl = ''
  @Input() error = ''
  @Input() showSystemAction = false
  /** 图片预览导航：当前图片在同目录图片列表中的索引（从 0 开始）与总数（≤1 时隐藏导航） */
  @Input() imageIndex = 0
  @Input() imageCount = 0

  /** 复制成功后的短暂反馈状态（按钮文案切到「已复制」） */
  copied = false
  private copyTimer?: any
  /** 「复制选中」成功反馈（独立于全量复制，避免两个按钮互相串状态） */
  copiedSel = false
  private copySelTimer?: any
  /** 文本模式且当前有选中内容时显示「复制选中」按钮 */
  hasSelectionText = false
  /** 打开/切换回文本时，标记需在视图检查后把焦点移入文本域（确保 *ngIf 渲染的 DOM 已就绪） */
  private pendingFocus = false

  @Output() close = new EventEmitter<void>()
  @Output() systemAction = new EventEmitter<void>()
  @Output() prevImage = new EventEmitter<void>()
  @Output() nextImage = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  maximized = SftpViewerDialogComponent.loadMaximized()

  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpViewerDialogComponent.loadMaximized()
    }
    if (this.visible && !this.loading && !this.error && this.mode === 'text'
      && (changes['visible'] || changes['loading'] || changes['textContent'])) {
      // ★ 不再用 setTimeout(0)：*ngIf 渲染时机不确定，setTimeout 可能在 DOM 就绪前执行而聚焦失败。
      // 改为标记 pendingFocus，由 ngAfterViewChecked 在视图真正渲染后聚焦，保证光标准确落入文本域。
      this.pendingFocus = true
    }
    if (changes['textContent'] || changes['visible']) this.hasSelectionText = false
  }

  ngAfterViewChecked(): void {
    if (this.pendingFocus && this.viewerTextarea) {
      this.pendingFocus = false
      // requestAnimationFrame 确保 DOM 已完全渲染/布局完毕后再聚焦，
      // 避免 *ngIf 刚创建 textarea 时 focus() 过早导致光标不显示
      requestAnimationFrame(() => {
        this.viewerTextarea?.nativeElement.focus({ preventScroll: true })
      })
    }
  }

  toggleMaximize(): void {
    this.maximized = !this.maximized
    SftpViewerDialogComponent.saveMaximized(this.maximized)
  }

  /** 键盘左右箭头切换上一张/下一张（仅在图片预览且有多张时生效） */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (!this.visible || this.mode !== 'image' || this.imageCount <= 1) return
    if (ev.key === 'ArrowLeft') {
      if (this.imageIndex > 0) { ev.preventDefault(); this.prevImage.emit() }
    } else if (ev.key === 'ArrowRight') {
      if (this.imageIndex < this.imageCount - 1) { ev.preventDefault(); this.nextImage.emit() }
    }
  }

  /** 复制当前加载的内容（文本复制 textContent，图片复制 dataURL） */
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

  /** 复制当前文本选中的内容（仅文本模式） */
  copySelection(): void {
    const sel = this.getSelectedText(this.viewerTextarea)
    if (!sel) return
    if (copyTextToClipboard(sel)) {
      this.copiedSel = true
      if (this.copySelTimer) clearTimeout(this.copySelTimer)
      this.copySelTimer = setTimeout(() => { this.copiedSel = false }, 1500)
    }
  }

  /** 根据文本域的选区状态刷新「复制选中」按钮的可见性 */
  updateHasSelection(): void {
    this.hasSelectionText = this.getSelectedText(this.viewerTextarea).length > 0
  }

  /** 文本域失焦时重置选区状态（防止点击 textarea 外部后按钮仍显示） */
  onTextareaBlur(): void {
    this.hasSelectionText = false
  }

  private getSelectedText(ta?: ElementRef<HTMLTextAreaElement>): string {
    if (!ta) return ''
    const el = ta.nativeElement
    const s = el.selectionStart ?? 0
    const e = el.selectionEnd ?? 0
    if (s === e) return ''
    return el.value.slice(s, e)
  }

  /** 是否有可复制的内容 */
  get canCopy(): boolean {
    return this.mode === 'image' ? !!this.imageUrl : !!this.textContent
  }

  /** 按钮文案：复制中短暂显示「已复制」 */
  get copyLabel(): string {
    return this.copied ? this.i18n.t('file.copied') : this.i18n.t('file.copy')
  }

  private showCopiedFeedback(): void {
    this.copied = true
    if (this.copyTimer) clearTimeout(this.copyTimer)
    this.copyTimer = setTimeout(() => { this.copied = false }, 1500)
  }

  ngOnDestroy(): void {
    if (this.copyTimer) clearTimeout(this.copyTimer)
    if (this.copySelTimer) clearTimeout(this.copySelTimer)
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

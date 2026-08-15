/**
 * SFTP+ 文本文件编辑对话框（本地 / 远程）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-05
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-05 — 新增「复制」按钮（复制当前编辑框内容）
 *              2026-08-10 — 新增「复制选中」按钮（有选中内容时显示，复制当前选中文本）
 *              2026-08-10 — 复制选中按钮消失修复(click/blur事件)
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'
import { copyTextToClipboard } from './clipboard-copy'

import { log } from '../../services/sftp-logger'
@Component({
  selector: 'sftp-editor-dialog',
  template: `
    <div class="overlay" *ngIf="visible" (wheel)="onOverlayWheel($event)">
      <div class="dialog file-dialog-shell" [class.is-maximized]="maximized">
        <div class="dialog-title">
          <div class="file-dialog-title-wrap">
            <span class="file-dialog-title">{{ i18n.t('file.edit') }} — {{ fileName }}</span>
            <span class="editor-dirty" *ngIf="dirty">*</span>
          </div>
          <div class="file-dialog-window-btns">
            <button type="button" class="file-dialog-win-btn"
              (click)="toggleMaximize()"
              [disabled]="saving"
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
              (click)="onCloseClick()"
              [disabled]="saving" [title]="i18n.t('app.close')">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="file-dialog-path" *ngIf="displayPath">{{ displayPath }}</div>
        <div class="file-dialog-body editor-body">
          <div class="file-dialog-status" *ngIf="loading">{{ i18n.t('viewer.loading') }}</div>
          <div class="file-dialog-status file-dialog-error" *ngIf="!loading && error">{{ error }}</div>
          <textarea #editorTextarea class="file-dialog-textarea"
            *ngIf="!loading && !error"
            (wheel)="onScrollableWheel($event)"
            (mouseup)="updateHasSelection()" (keyup)="updateHasSelection()"
            (select)="updateHasSelection()" (click)="updateHasSelection()"
            (blur)="onTextareaBlur()"
            [ngModel]="content"
            (ngModelChange)="onContentChange($event)"
            [readonly]="saving"
            spellcheck="false"></textarea>
        </div>
        <div class="dialog-buttons">
          <span class="dialog-buttons-left">
            <button type="button" class="file-dialog-system-btn" *ngIf="showSystemAction"
              (click)="systemAction.emit()" [disabled]="loading || saving || !!error"
              [title]="i18n.t('file.editInSystem')">
              {{ i18n.t('file.editInSystem') }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              (click)="copy()" [disabled]="loading || saving || !!error || !canCopy"
              [title]="i18n.t('file.copy')">
              {{ copyLabel }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              *ngIf="hasSelectionText"
              (mousedown)="$event.preventDefault()"
              (click)="copySelection()" [disabled]="loading || saving || !!error"
              [title]="i18n.t('file.copySelection')">
              {{ copiedSel ? i18n.t('file.copied') : i18n.t('file.copySelection') }}
            </button>
          </span>
          <button type="button" class="btn-primary" (click)="save.emit()" [disabled]="loading || saving || !!error || !dirty">
            {{ saving ? i18n.t('editor.saving') : i18n.t('editor.save') }}
          </button>
          <button type="button" (click)="cancel.emit()" [disabled]="saving">{{ i18n.t('app.cancel') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [FILE_DIALOG_SHARED_STYLES],
})
export class SftpEditorDialogComponent implements OnChanges, OnDestroy {
  private static readonly MAXIMIZED_KEY = 'sftp-plus-editor-maximized'

  @ViewChild('editorTextarea') private editorTextarea?: ElementRef<HTMLTextAreaElement>

  @Input() visible = false
  @Input() loading = false
  @Input() saving = false
  @Input() dirty = false
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() content = ''
  @Input() error = ''
  @Input() showSystemAction = false

  /** 复制成功后的短暂反馈状态（按钮文案切到「已复制」） */
  copied = false
  private copyTimer?: any
  /** 「复制选中」成功反馈（独立于全量复制，避免两个按钮互相串状态） */
  copiedSel = false
  private copySelTimer?: any
  /** 当前有选中内容时显示「复制选中」按钮 */
  hasSelectionText = false

  @Output() contentChange = new EventEmitter<string>()
  @Output() save = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()
  @Output() systemAction = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  maximized = SftpEditorDialogComponent.loadMaximized()

  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpEditorDialogComponent.loadMaximized()
    }
  }

  onContentChange(value: string): void {
    this.hasSelectionText = false
    this.contentChange.emit(value)
  }

  /** 复制当前编辑框内容（全量） */
  copy(): void {
    const ok = copyTextToClipboard(this.content || '')
    if (ok) this.showCopiedFeedback()
  }

  /** 复制当前文本选中的内容 */
  copySelection(): void {
    const sel = this.getSelectedText(this.editorTextarea)
    if (!sel) return
    if (copyTextToClipboard(sel)) {
      this.copiedSel = true
      if (this.copySelTimer) clearTimeout(this.copySelTimer)
      this.copySelTimer = setTimeout(() => { this.copiedSel = false }, 1500)
    }
  }

  /** 根据文本域的选区状态刷新「复制选中」按钮的可见性 */
  updateHasSelection(): void {
    this.hasSelectionText = this.getSelectedText(this.editorTextarea).length > 0
  }

  /** 文本域失焦时重置选区状态 */
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
    return !!this.content
  }

  /** 按钮文案：复制后短暂显示「已复制」 */
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

  toggleMaximize(): void {
    if (this.saving) return
    this.maximized = !this.maximized
    SftpEditorDialogComponent.saveMaximized(this.maximized)
  }

  onCloseClick(): void {
    if (!this.saving) this.cancel.emit()
  }

  private static loadMaximized(): boolean {
    try {
      return localStorage.getItem(SftpEditorDialogComponent.MAXIMIZED_KEY) === 'true'
    } catch (e) {
      log.warn('loadMaximized failed', e)
      return false
    }
  }

  private static saveMaximized(value: boolean): void {
    try {
      localStorage.setItem(SftpEditorDialogComponent.MAXIMIZED_KEY, value ? 'true' : 'false')
    } catch (e) { log.warn('saveMaximized failed', e) }
  }
}

/**
 * SFTP+ 文本文件编辑对话框（本地 / 远程）
 */
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'

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
          <textarea class="file-dialog-textarea"
            *ngIf="!loading && !error"
            (wheel)="onScrollableWheel($event)"
            [ngModel]="content"
            (ngModelChange)="onContentChange($event)"
            [readonly]="saving"
            spellcheck="false"></textarea>
        </div>
        <div class="dialog-buttons">
          <button type="button" class="file-dialog-system-btn" *ngIf="showSystemAction"
            (click)="systemAction.emit()" [disabled]="loading || saving || !!error"
            [title]="i18n.t('file.editInSystem')">
            {{ i18n.t('file.editInSystem') }}
          </button>
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
export class SftpEditorDialogComponent implements OnChanges {
  private static readonly MAXIMIZED_KEY = 'sftp-plus-editor-maximized'

  @Input() visible = false
  @Input() loading = false
  @Input() saving = false
  @Input() dirty = false
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() content = ''
  @Input() error = ''
  @Input() showSystemAction = false

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
    this.contentChange.emit(value)
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

/**
 * SFTP+ 文本文件编辑对话框（本地 / 远程）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../sftp-i18n.service'
import { FILE_DIALOG_SHARED_STYLES } from './file-dialog-shared-styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'

@Component({
  selector: 'sftp-editor-dialog',
  template: `
    <div class="overlay" *ngIf="visible" (wheel)="onOverlayWheel($event)">
      <div class="dialog file-dialog-shell">
        <div class="dialog-title">
          <div class="file-dialog-title-wrap">
            <span class="file-dialog-title">{{ i18n.t('file.edit') }} — {{ fileName }}</span>
            <span class="editor-dirty" *ngIf="dirty">*</span>
          </div>
          <button type="button" class="file-dialog-close" (click)="onCloseClick()"
            [disabled]="saving" [title]="i18n.t('app.close')">×</button>
        </div>
        <div class="file-dialog-path" *ngIf="displayPath">{{ displayPath }}</div>
        <div class="file-dialog-body" (wheel)="onScrollableWheel($event)">
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
export class SftpEditorDialogComponent {
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

  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  onContentChange(value: string): void {
    this.contentChange.emit(value)
  }

  onCloseClick(): void {
    if (!this.saving) this.cancel.emit()
  }
}

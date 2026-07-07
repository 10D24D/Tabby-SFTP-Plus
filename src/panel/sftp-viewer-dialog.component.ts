/**
 * SFTP+ 远程文件查看对话框（文本 / 图片）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../sftp-i18n.service'
import { FILE_DIALOG_SHARED_STYLES } from './file-dialog-shared-styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'

export type ViewerMode = 'text' | 'image'

@Component({
  selector: 'sftp-viewer-dialog',
  template: `
    <div class="overlay" *ngIf="visible" (click)="onBackdropClick()" (wheel)="onOverlayWheel($event)">
      <div class="dialog file-dialog-shell" (click)="$event.stopPropagation()">
        <div class="dialog-title">
          <span class="file-dialog-title">{{ i18n.t('file.view') }} — {{ fileName }}</span>
          <button type="button" class="file-dialog-close" (click)="close.emit()" [title]="i18n.t('app.close')">×</button>
        </div>
        <div class="file-dialog-path" *ngIf="displayPath">{{ displayPath }}</div>
        <div class="file-dialog-body" (wheel)="onScrollableWheel($event)">
          <div class="file-dialog-status" *ngIf="loading">{{ i18n.t('viewer.loading') }}</div>
          <div class="file-dialog-status file-dialog-error" *ngIf="!loading && error">{{ error }}</div>
          <pre class="file-dialog-text" *ngIf="!loading && !error && mode === 'text'">{{ textContent }}</pre>
          <div class="file-dialog-image-wrap" *ngIf="!loading && !error && mode === 'image'">
            <img class="file-dialog-image" [src]="imageUrl" [alt]="fileName" />
          </div>
        </div>
        <div class="dialog-buttons">
          <button type="button" class="file-dialog-system-btn" *ngIf="showSystemAction"
            (click)="systemAction.emit()" [disabled]="loading || !!error"
            [title]="i18n.t('file.openInSystem')">
            {{ i18n.t('file.openInSystem') }}
          </button>
          <button type="button" (click)="close.emit()">{{ i18n.t('app.close') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [FILE_DIALOG_SHARED_STYLES],
})
export class SftpViewerDialogComponent {
  @Input() visible = false
  @Input() loading = false
  @Input() mode: ViewerMode = 'text'
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() textContent = ''
  @Input() imageUrl = ''
  @Input() error = ''
  @Input() showSystemAction = false

  @Output() close = new EventEmitter<void>()
  @Output() systemAction = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  onBackdropClick(): void {
    if (!this.loading) this.close.emit()
  }
}

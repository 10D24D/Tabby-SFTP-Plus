/**
 * SFTP+ 删除确认对话框（从主面板抽离）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../sftp-i18n.service'

@Component({
  selector: 'sftp-delete-dialog',
  template: `
    <div class="overlay" *ngIf="visible">
      <div class="delete-dialog">
        <ng-container *ngIf="batch; else singleDelete">
          <div class="delete-header">
            <svg class="delete-warn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f0a030" stroke-width="1.5">
              <circle cx="12" cy="12" r="10" stroke="#f0a030" fill="rgba(240,160,48,0.1)"/>
              <line x1="12" y1="8" x2="12" y2="13"/>
              <circle cx="12" cy="16.5" r="0.8" fill="#f0a030" stroke="none"/>
            </svg>
            <span class="delete-title">{{ i18n.t('app.deleteMultiple') }}</span>
          </div>
          <div class="delete-text">{{ batchText }}</div>
        </ng-container>
        <ng-template #singleDelete>
          <div class="delete-header">
            <svg *ngIf="isDir" class="delete-header-icon delete-icon-folder" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
              <path d="M1.5 5.5C1.5 4.67 2.17 4 3 4h2.67L7 6h6c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5v-6z"/>
            </svg>
            <svg *ngIf="!isDir" class="delete-header-icon delete-icon-file" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
              <path d="M5 1.5h4.5L13 5v9.5H5c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1z"/>
              <path d="M9.5 1.5V5H13"/>
              <line x1="6.5" y1="8" x2="11.5" y2="8"/>
              <line x1="6.5" y1="10" x2="11.5" y2="10"/>
              <line x1="6.5" y1="12" x2="9.5" y2="12"/>
            </svg>
            <span class="delete-title">{{ isDir ? i18n.t('app.deleteFolder') : i18n.t('app.deleteFile') }}</span>
          </div>
          <div class="delete-text">{{ isDir ? i18n.t('app.deleteConfirmFolder') : i18n.t('app.deleteConfirmFile') }}</div>
          <div class="delete-preview">
            <div class="delete-preview-row">
              <span class="delete-preview-icon" [class.is-folder]="isDir" [class.is-file]="!isDir">
                <svg *ngIf="isDir" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
                  <path d="M1.5 5.5C1.5 4.67 2.17 4 3 4h2.67L7 6h6c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5v-6z"/>
                </svg>
                <svg *ngIf="!isDir" width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
                  <path d="M5 1.5h4.5L13 5v9.5H5c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1z"/>
                  <path d="M9.5 1.5V5H13"/>
                  <line x1="6.5" y1="8" x2="11.5" y2="8"/>
                  <line x1="6.5" y1="10" x2="11.5" y2="10"/>
                  <line x1="6.5" y1="12" x2="9.5" y2="12"/>
                </svg>
              </span>
              <span class="delete-preview-name">{{ name }}</span>
            </div>
            <div class="delete-preview-row" *ngIf="!isDir">
              <span class="delete-preview-label">{{ i18n.t('file.type') }}:</span>
              <span class="delete-preview-value">{{ type }}</span>
            </div>
            <div class="delete-preview-row" *ngIf="!isDir && size != null">
              <span class="delete-preview-label">{{ i18n.t('file.size') }}:</span>
              <span class="delete-preview-value">{{ size }}</span>
            </div>
            <div class="delete-preview-row" *ngIf="date">
              <span class="delete-preview-label">{{ i18n.t('file.modified') }}:</span>
              <span class="delete-preview-value">{{ date }}</span>
            </div>
          </div>
        </ng-template>
        <div class="dialog-buttons">
          <button class="danger" (click)="confirm.emit()">{{ i18n.t('app.yes') }}</button>
          <button (click)="cancel.emit()">{{ i18n.t('app.no') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 100;
      transition: none !important; animation: none !important;
    }
    .delete-dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 12px; padding: 20px; min-width: 340px; max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }
    .delete-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .delete-header-icon { flex-shrink: 0; width: 16px !important; height: 16px !important; }
    .delete-icon-folder { color: #f0c040; }
    .delete-icon-file { color: #8ab4f8; opacity: 0.95; }
    .delete-warn-icon { flex-shrink: 0; width: 18px !important; height: 18px !important; }
    .delete-title { font-size: 15px; font-weight: 600; color: var(--_text); }
    .delete-text { font-size: 13px; color: var(--_text); margin-bottom: 12px; opacity: 0.85; }
    .delete-preview {
      border: 1px solid var(--_border);
      border-radius: 8px; padding: 12px; margin-bottom: 16px;
      background: var(--_content);
    }
    .delete-preview-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; padding: 2px 0;
    }
    .delete-preview-row + .delete-preview-row { margin-top: 3px; }
    .delete-preview-icon { flex-shrink: 0; display: flex; align-items: center; }
    .delete-preview-icon.is-folder { color: #f0c040; opacity: 0.95; }
    .delete-preview-icon.is-file { color: #8ab4f8; opacity: 0.9; }
    .delete-preview-name { font-weight: 500; color: var(--_text); }
    .delete-preview-label { color: var(--_text); opacity: 0.5; min-width: 60px; }
    .delete-preview-value { color: var(--_text); }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .danger { background: #d32f2f !important; border-color: #ef5350 !important; color: #fff; }
  `],
})
export class SftpDeleteDialogComponent {
  @Input() visible = false
  @Input() batch = false
  @Input() batchText = ''
  @Input() isDir = false
  @Input() name = ''
  @Input() type = ''
  @Input() size: string | null = null
  @Input() date = ''

  @Output() confirm = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService
}

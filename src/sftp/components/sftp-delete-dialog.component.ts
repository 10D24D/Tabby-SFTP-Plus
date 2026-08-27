/**
 * SFTP+ 删除确认对话框（从主面板抽离）
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-24
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'

@Component({
  selector: 'sftp-delete-dialog',
  template: `
    <div class="overlay sftp-delete-overlay" #overlayEl *ngIf="visible" tabindex="-1" (keydown)="onKeyDown($event)">
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
        <!-- 单文件与批量删除都提示：移入回收站 / 永久删除 -->
        <div *ngIf="toTrash" class="delete-action-hint">{{ i18n.t('app.trashHint') || '📥 Move to Recycle Bin' }}</div>
        <div *ngIf="!toTrash" class="delete-action-hint delete-action-perm">{{ '⚠️ ' + (i18n.t('app.permDeleteHint') || 'This action cannot be undone') }}</div>
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
      outline: none;
    }
    /* 自动聚焦到 overlay 时不显示浏览器默认焦点轮廓（模态遮罩本身已足够明显） */
    .overlay:focus { outline: none; }
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
    /* 回收站/永久删除操作提示（单文件与批量共用） */
    .delete-action-hint {
      font-size: 12px; margin: 0 0 12px 0; padding: 0;
      color: #4caf50; font-weight: 500;
    }
    .delete-action-perm { color: #f44336; }
  `],
})
export class SftpDeleteDialogComponent implements OnChanges {
  @Input() visible = false
  @Input() batch = false
  @Input() batchText = ''
  @Input() isDir = false
  @Input() name = ''
  @Input() type = ''
  @Input() size: string | null = null
  @Input() date = ''
  @Input() toTrash = false

  @Output() confirm = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  @ViewChild('overlayEl', { static: false }) overlayEl?: ElementRef<HTMLDivElement>

  // ★ 修复：对话框显示时把焦点移入 overlay（tabindex=-1 可聚焦但不进入 Tab 序列），
  //   确保回车/Esc 的 keydown 能落到 overlay 的 onKeyDown（此前 overlay 不可聚焦、焦点在面板外，回车无法确认）
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      setTimeout(() => this.overlayEl?.nativeElement?.focus())
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.confirm.emit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.cancel.emit()
    }
  }
}

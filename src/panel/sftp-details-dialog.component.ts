/**
 * SFTP+ 文件属性对话框（从主面板抽离）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../sftp-i18n.service'

export type DetailsDisplay = {
  name: string
  type: string
  path: string
  size?: string
  modified: string
  created?: string
  accessed?: string
  perms?: string
  owner?: string
  group?: string
}

@Component({
  selector: 'sftp-details-dialog',
  template: `
    <div class="overlay" *ngIf="visible" (click)="cancel.emit()">
      <div class="dialog details-dialog" (click)="$event.stopPropagation()">
        <div class="dialog-title">{{ i18n.t('file.properties') }}</div>
        <div class="details-body" *ngIf="display">
          <table class="details-table">
            <tr><td class="dt-label">{{ i18n.t('file.name') }}</td><td class="dt-value">{{ display.name }}</td></tr>
            <tr><td class="dt-label">{{ i18n.t('file.type') }}</td><td class="dt-value">{{ display.type }}</td></tr>
            <tr><td class="dt-label">{{ i18n.t('file.path') }}</td><td class="dt-value dt-path">{{ display.path }}</td></tr>
            <tr *ngIf="display.size"><td class="dt-label">{{ i18n.t('file.size') }}</td><td class="dt-value">{{ display.size }}</td></tr>
            <tr><td class="dt-label">{{ i18n.t('file.modified') }}</td><td class="dt-value">{{ display.modified }}</td></tr>
            <tr *ngIf="display.created"><td class="dt-label">{{ i18n.t('file.created') }}</td><td class="dt-value">{{ display.created }}</td></tr>
            <tr *ngIf="display.accessed"><td class="dt-label">{{ i18n.t('file.accessed') }}</td><td class="dt-value">{{ display.accessed }}</td></tr>
            <tr *ngIf="display.perms"><td class="dt-label">{{ i18n.t('file.permissions') }}</td><td class="dt-value">{{ display.perms }}</td></tr>
            <tr *ngIf="display.owner"><td class="dt-label">{{ i18n.t('file.owner') }}</td><td class="dt-value">{{ display.owner }}</td></tr>
            <tr *ngIf="display.group"><td class="dt-label">{{ i18n.t('file.group') }}</td><td class="dt-value">{{ display.group }}</td></tr>
          </table>
        </div>
        <div class="dialog-buttons">
          <button (click)="confirm.emit()">{{ i18n.t('app.confirm') }}</button>
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
    .dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px; padding: 16px; min-width: 280px; max-width: 92vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .dialog-title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; margin-bottom: 12px; color: var(--_primary); }
    .details-dialog { min-width: 400px; max-width: 500px; }
    .details-body { margin: 8px 0; }
    .details-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .details-table td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--_border, #334155); }
    .dt-label { width: 80px; opacity: 0.7; white-space: nowrap; }
    .dt-value { word-break: break-all; }
    .dt-path { font-family: monospace; font-size: 11px; }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
  `],
})
export class SftpDetailsDialogComponent {
  @Input() visible = false
  @Input() display: DetailsDisplay | null = null

  @Output() confirm = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService
}

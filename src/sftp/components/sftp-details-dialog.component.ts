/**
 * SFTP+ 文件属性对话框（从主面板抽离）
 * ★ 2026-08-11 美化：头部图标+类型徽章（一眼分辨文件/文件夹）；
 *   文件夹大小按需计算（「计算」按钮，复用传输预扫描的并发扫描）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'

export type DetailsDisplay = {
  name: string
  /** ★ 2026-08-11：是否为文件夹（头部图标与徽章用） */
  isFolder: boolean
  type: string
  /** ★ 2026-08-11：来源位置标签（本地/远程） */
  location: string
  path: string
  size?: string
  /** ★ 2026-08-11：文件夹可显示「计算」按钮按需得出真实大小 */
  sizeCalculable?: boolean
  sizeCalcState?: 'idle' | 'calculating' | 'error'
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
        <div class="dialog-title">{{ display?.isFolder ? i18n.t('file.folderProperties') : i18n.t('file.fileProperties') }}</div>
        <div class="details-body" *ngIf="display">
          <div class="details-head">
            <span class="details-head-icon" [class.is-folder]="display.isFolder" [class.is-file]="!display.isFolder">
              <svg *ngIf="display.isFolder" width="26" height="26" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
                <path d="M1.5 5.5C1.5 4.67 2.17 4 3 4h2.67L7 6h6c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5v-6z"/>
              </svg>
              <svg *ngIf="!display.isFolder" width="26" height="26" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
                <path d="M5 1.5h4.5L13 5v9.5H5c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1z"/>
                <path d="M9.5 1.5V5H13"/>
                <line x1="6.5" y1="8" x2="11.5" y2="8"/>
                <line x1="6.5" y1="10" x2="11.5" y2="10"/>
                <line x1="6.5" y1="12" x2="9.5" y2="12"/>
              </svg>
            </span>
            <div class="details-head-info">
              <div class="details-head-name">{{ display.name }}</div>
            </div>
          </div>
          <table class="details-table">
            <tr><td class="dt-label">{{ i18n.t('file.type') }}</td><td class="dt-value">{{ display.type }}</td></tr>
            <tr><td class="dt-label">{{ i18n.t('file.location') }}</td><td class="dt-value dt-location">{{ display.location }}</td></tr>
            <tr><td class="dt-label">{{ i18n.t('file.path') }}</td><td class="dt-value dt-path">{{ display.path }}</td></tr>
            <tr *ngIf="display.size || display.sizeCalculable">
              <td class="dt-label">{{ i18n.t('file.size') }}</td>
              <td class="dt-value">
                <ng-container *ngIf="display.size">{{ display.size }}</ng-container>
                <ng-container *ngIf="!display.size && display.sizeCalculable">
                  <span *ngIf="display.sizeCalcState === 'calculating'" class="dt-calc-ing">{{ i18n.t('file.sizeCalculating') }}</span>
                  <span *ngIf="display.sizeCalcState === 'error'" class="dt-calc-err">{{ i18n.t('file.sizeCalcFailed') }}</span>
                  <button
                    *ngIf="display.sizeCalcState !== 'calculating'"
                    class="dt-calc-btn"
                    (click)="$event.stopPropagation(); calcSize.emit()">
                    {{ i18n.t('file.sizeCalculate') }}
                  </button>
                </ng-container>
              </td>
            </tr>
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
    .details-head {
      display: flex; align-items: center; gap: 10px;
      padding: 2px 2px 10px; margin-bottom: 6px;
      border-bottom: 1px solid var(--_border, #334155);
    }
    .details-head-icon { flex-shrink: 0; display: flex; align-items: center; }
    .details-head-icon.is-folder { color: #f0c040; opacity: 0.95; }
    .details-head-icon.is-file { color: #8ab4f8; opacity: 0.9; }
    .details-head-info { min-width: 0; }
    .details-head-name { font-weight: 600; font-size: 13px; word-break: break-all; color: var(--_text); }
    .details-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .details-table td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--_border, #334155); }
    .dt-label { width: 80px; opacity: 0.7; white-space: nowrap; }
    .dt-value { word-break: break-all; }
    .dt-location { font-weight: 600; color: var(--_primary); }
    .dt-path { font-family: monospace; font-size: 11px; }
    .dt-calc-btn {
      padding: 2px 12px; border-radius: 5px; font-size: 11px;
      border: 1px solid var(--_border);
      background: var(--_content); color: var(--_text); cursor: pointer;
    }
    .dt-calc-btn:hover { border-color: var(--_primary); color: var(--_primary); }
    .dt-calc-ing { opacity: 0.7; font-size: 11px; }
    .dt-calc-err { color: #f06060; font-size: 11px; margin-right: 8px; }
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
  /** ★ 2026-08-11：请求计算文件夹真实大小 */
  @Output() calcSize = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService
}

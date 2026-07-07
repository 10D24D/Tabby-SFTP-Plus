/**
 * SFTP+ 传输日志对话框（从主面板抽离）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../sftp-i18n.service'
import type { TransferLogEntry } from '../sftp-transfer-log.service'
import {
  formatDuration,
  formatFailReason as formatFailReasonFn,
  formatLogTime,
  formatSize,
  formatSpeedFromSize,
  getLogFileName,
  isUploadLikeOperation,
} from './panel-format'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'

@Component({
  selector: 'sftp-transfer-log-dialog',
  template: `
    <div class="overlay" *ngIf="visible" (wheel)="onOverlayWheel($event)">
      <div class="dialog log-dialog" (wheel)="onScrollableWheel($event)">
        <div class="dialog-title">
          <span>{{ i18n.t('transfer.log') }}</span>
          <button class="btn-link dialog-close" (click)="close.emit()">×</button>
        </div>
        <div class="log-toolbar">
          <select [(ngModel)]="filterOp" (ngModelChange)="filterOpChange.emit($event)">
            <option value="">{{ i18n.t('filter.allOps') }}</option>
            <option value="upload">{{ i18n.t('transfer.upload') }}</option>
            <option value="download">{{ i18n.t('transfer.download') }}</option>
            <option value="edit-upload">{{ i18n.t('transfer.edit-upload') }}</option>
            <option value="edit-download">{{ i18n.t('transfer.edit-download') }}</option>
          </select>
          <select [(ngModel)]="filterStatus" (ngModelChange)="filterStatusChange.emit($event)">
            <option value="">{{ i18n.t('filter.allStatus') }}</option>
            <option value="success">{{ i18n.t('log.success') }}</option>
            <option value="failed">{{ i18n.t('log.failed') }}</option>
          </select>
          <button *ngIf="activeTransferCount" (click)="showTransfers.emit()" class="btn-transfers-toggle">
            {{ (transfersHidden || transfersMinimized) ? '▸' : '▾' }} {{ i18n.t('transfer.inProgress') }} ({{ activeTransferCount }})
          </button>
          <button (click)="export.emit()">{{ i18n.t('app.export') }}</button>
          <button (click)="clear.emit()" class="danger">{{ i18n.t('app.clear') }}</button>
        </div>
        <div class="log-list" (wheel)="onScrollableWheel($event)">
          <div class="log-empty" *ngIf="!entries.length">
            <span>{{ i18n.t('transfer.logEmpty') }}</span>
          </div>
          <div class="log-entry" *ngFor="let entry of entries">
            <div class="log-row-main">
              <span class="log-op-badge"
                    [class.op-upload]="entry.operation === 'upload'"
                    [class.op-download]="entry.operation === 'download'"
                    [class.op-edit]="entry.operation === 'edit-upload' || entry.operation === 'edit-download'"
                    [class.op-other]="entry.operation !== 'upload' && entry.operation !== 'download' && entry.operation !== 'edit-upload' && entry.operation !== 'edit-download'">
                {{ i18n.t('transfer.' + entry.operation) || entry.operation }}
              </span>
              <span class="log-filename" [title]="isUploadLike(entry) ? entry.localPath + ' → ' + entry.remotePath : entry.remotePath + ' → ' + entry.localPath">
                {{ getLogFileName(entry) }}
              </span>
              <span class="log-meta">
                <span *ngIf="entry.size != null" class="log-size">{{ formatSize(entry.size) }}</span>
                <span *ngIf="entry.size && entry.duration" class="log-speed">{{ formatSpeedFromSize(entry.size, entry.duration) }}</span>
                <span *ngIf="entry.duration != null" class="log-duration">{{ formatDuration(entry.duration) }}</span>
              </span>
              <span class="log-status-icon" [class.success]="entry.success" [class.failed]="!entry.success"
                    [title]="entry.success ? 'Success' : formatFailReason(entry)">
                {{ entry.success ? '✓' : '✗' }}
              </span>
            </div>
            <div class="log-row-paths">
              <ng-container *ngIf="isUploadLike(entry); else downloadPaths">
                <span class="log-path-line" [title]="entry.localPath">📁 {{ entry.localPath }}</span>
                <span class="log-path-arrow">→</span>
                <span class="log-path-line" [title]="entry.remotePath">☁️ {{ entry.remotePath }}</span>
              </ng-container>
              <ng-template #downloadPaths>
                <span class="log-path-line" [title]="entry.remotePath">☁️ {{ entry.remotePath }}</span>
                <span class="log-path-arrow">→</span>
                <span class="log-path-line" [title]="entry.localPath">📁 {{ entry.localPath }}</span>
              </ng-template>
              <span class="log-time" *ngIf="entry.startTime">{{ formatLogTime(entry.timestamp) }}</span>
            </div>
          </div>
        </div>
        <div class="dialog-buttons">
          <button (click)="close.emit()">{{ i18n.t('app.close') }}</button>
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
    .dialog-title {
      display: flex; align-items: center; justify-content: space-between;
      font-weight: 700; margin-bottom: 10px; font-size: 14px;
    }
    .dialog-close { font-size: 18px; line-height: 1; padding: 0 4px; }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .log-dialog {
      min-width: 620px;
      max-height: 85vh;
      overflow: auto;
      resize: both;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.08));
    }
    .log-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 13px; }
    .log-toolbar select {
      padding: 4px 8px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); font-size: 12px; outline: none;
      cursor: pointer;
    }
    .log-toolbar select:focus,
    .log-toolbar select:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: 0 0 0 1px var(--_primary) !important;
      outline: none !important;
    }
    .log-toolbar button {
      padding: 4px 10px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer; font-size: 12px;
    }
    .log-toolbar button.danger { color: var(--_text); }
    .log-toolbar button:hover { background: var(--_hover, rgba(128,128,128,0.1)); }
    .btn-transfers-toggle { white-space: nowrap; }
    .log-list {
      max-height: 480px; overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.08));
      display: flex; flex-direction: column; gap: 2px;
      resize: vertical;
      min-height: 120px;
    }
    .log-dialog::-webkit-scrollbar,
    .log-list::-webkit-scrollbar { width: 8px; height: 8px; }
    .log-dialog::-webkit-scrollbar-track,
    .log-list::-webkit-scrollbar-track {
      background: var(--_scroll-track, rgba(128,128,128,0.08));
      border-radius: 4px;
    }
    .log-dialog::-webkit-scrollbar-thumb,
    .log-list::-webkit-scrollbar-thumb {
      background: var(--_scroll-thumb, rgba(128,128,128,0.35));
      border-radius: 4px;
      min-height: 24px;
      min-width: 24px;
    }
    .log-dialog::-webkit-scrollbar-thumb:hover,
    .log-list::-webkit-scrollbar-thumb:hover {
      background: var(--_scroll-thumb-hover, rgba(128,128,128,0.55));
    }
    .log-dialog::-webkit-scrollbar-thumb:active,
    .log-list::-webkit-scrollbar-thumb:active {
      background: var(--_primary, #4dabff);
    }
    .log-dialog::-webkit-scrollbar-corner,
    .log-list::-webkit-scrollbar-corner {
      background: var(--_scroll-track, rgba(128,128,128,0.08));
    }
    .log-empty {
      display: flex; align-items: center; justify-content: center;
      padding: 32px 16px; text-align: center;
      font-size: 13px; color: var(--_text); opacity: 0.5;
    }
    .log-entry { padding: 6px 10px; border-radius: 6px; font-size: 12px; }
    .log-entry:hover { background: var(--_hover, rgba(128,128,128,0.06)); }
    .log-entry:not(:last-child) { border-bottom: 1px solid var(--_border); }
    .log-row-main { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .log-op-badge {
      display: inline-block; flex-shrink: 0;
      font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
      padding: 1px 7px; border-radius: 3px; line-height: 1.5; text-transform: uppercase;
    }
    .log-op-badge.op-upload { background: rgba(76,175,80,0.15); color: #4caf50; }
    .log-op-badge.op-download { background: rgba(33,150,243,0.15); color: #2196f3; }
    .log-op-badge.op-edit { background: rgba(156,39,176,0.15); color: #ab47bc; }
    .log-op-badge.op-other { background: rgba(158,158,158,0.15); color: #9e9e9e; }
    .log-filename {
      flex: 1; min-width: 60px; font-size: 13px; font-weight: 500; color: var(--_text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .log-meta { display: inline-flex; gap: 10px; align-items: center; flex-shrink: 0; white-space: nowrap; }
    .log-size { font-size: 11px; color: var(--_text); opacity: 0.55; }
    .log-speed { font-size: 10px; color: var(--_primary); opacity: 0.75; }
    .log-duration { font-size: 10px; color: var(--_text); opacity: 0.45; }
    .log-status-icon { font-size: 14px; line-height: 1; flex-shrink: 0; margin-left: 4px; }
    .log-status-icon.success { color: #4caf50; }
    .log-status-icon.failed { color: #f44336; }
    .log-row-paths { display: flex; align-items: center; gap: 6px; padding-left: 4px; margin-top: 2px; }
    .log-path-line {
      font-size: 10px; color: var(--_text); opacity: 0.35;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px;
    }
    .log-path-arrow { font-size: 9px; opacity: 0.25; flex-shrink: 0; }
    .log-time {
      margin-left: auto; flex-shrink: 0;
      font-size: 10px; color: var(--_text); opacity: 0.3;
      font-family: 'SFMono-Regular', Consolas, monospace;
    }
  `],
})
export class SftpTransferLogDialogComponent {
  @Input() visible = false
  @Input() entries: TransferLogEntry[] = []
  @Input() filterOp = ''
  @Input() filterStatus = ''
  @Input() activeTransferCount = 0
  @Input() transfersHidden = false
  @Input() transfersMinimized = false
  @Input() isZh = true

  @Output() close = new EventEmitter<void>()
  @Output() filterOpChange = new EventEmitter<string>()
  @Output() filterStatusChange = new EventEmitter<string>()
  @Output() showTransfers = new EventEmitter<void>()
  @Output() export = new EventEmitter<void>()
  @Output() clear = new EventEmitter<void>()

  formatSize = formatSize
  formatLogTime = formatLogTime
  formatDuration = formatDuration
  formatSpeedFromSize = formatSpeedFromSize
  getLogFileName = getLogFileName
  isUploadLike = isUploadLikeOperation
  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  @Input() i18n!: SftpI18nService

  formatFailReason(entry: TransferLogEntry): string {
    return formatFailReasonFn(entry, this.isZh)
  }
}

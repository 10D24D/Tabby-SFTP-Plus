/**
 * SFTP+ 传输日志对话框（从主面板抽离）
 * 创建人：DD1024z + Hy3 preview
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Hy4 preview
 * 修改时间：2026-09-07 — issue #15+：渲染 skippedAsDuplicate 徽章，区分「真的下载/上传了」与「内容相同自动跳过」
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import type { TransferLogEntry } from '../../services/sftp-transfer-log.service'
import {
  formatDuration,
  formatFailReason as formatFailReasonFn,
  formatLogTime,
  formatSize,
  formatSpeedFromSize,
  getLogFileName,
  isUploadLikeOperation,
} from '../core/file-utils'
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
          <select [(ngModel)]="filterTimeRange" (ngModelChange)="filterTimeRangeChange.emit($event)">
            <option value="">{{ i18n.t('filter.allTime') }}</option>
            <option value="today">{{ i18n.t('filter.today') }}</option>
            <option value="7d">{{ i18n.t('filter.last7Days') }}</option>
            <option value="30d">{{ i18n.t('filter.last30Days') }}</option>
            <option value="custom">{{ i18n.t('filter.customRange') }}</option>
          </select>
          <ng-container *ngIf="filterTimeRange === 'custom'">
            <label class="log-date-field">
              <span>{{ i18n.t('filter.dateFrom') }}</span>
              <input type="date" [ngModel]="filterDateFrom" (ngModelChange)="filterDateFromChange.emit($event)" />
            </label>
            <label class="log-date-field">
              <span>{{ i18n.t('filter.dateTo') }}</span>
              <input type="date" [ngModel]="filterDateTo" (ngModelChange)="filterDateToChange.emit($event)" />
            </label>
          </ng-container>
          <button (click)="export.emit()">{{ i18n.t('app.export') }}</button>
          <button (click)="clear.emit()" class="danger">{{ i18n.t('app.clear') }}</button>
          <button *ngIf="activeTransferCount" (click)="showTransfers.emit()" class="btn-transfers-toggle">
            {{ (transfersHidden || transfersMinimized) ? '▸' : '▾' }} {{ i18n.t('transfer.inProgress') }} ({{ activeTransferCount }})
          </button>
        </div>
        <div class="log-list" (wheel)="onScrollableWheel($event)">
          <div class="log-empty" *ngIf="!entries.length">
            <span>{{ emptyLabel }}</span>
          </div>
          <div class="log-entry" *ngFor="let entry of entries; trackBy: trackById">
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
                <!-- ★ 2026-09-03：目录传输模式 / 文件数标签（快速模式 ⚡、tar 打包 📦、标准模式显示文件数） -->
                <span *ngIf="entry.transferMode === 'fast'" class="log-mode-tag tag-fast" [title]="i18n.t('log.modeFast')">⚡ {{ i18n.t('log.modeFast') }}</span>
                <span *ngIf="entry.transferMode === 'tar'" class="log-mode-tag tag-tar" [title]="i18n.t('log.modeTar')">📦 {{ i18n.t('log.modeTar') }}</span>
                <span *ngIf="!entry.transferMode && entry.fileCount > 0" class="log-mode-tag tag-count">{{ i18n.t('log.fileCount', { n: entry.fileCount }) }}</span>
                <span *ngIf="entry.size != null" class="log-size">{{ formatSize(entry.size) }}</span>
                <!-- ★ 修复：传输进行中不显示速度/耗时（duration=0 算出 Infinity/NaN） -->
                <span *ngIf="!entry.pending && entry.size && entry.duration" class="log-speed">{{ formatSpeedFromSize(entry.size, entry.duration) }}</span>
                <span *ngIf="!entry.pending && entry.duration != null" class="log-duration">{{ formatDuration(entry.duration) }}</span>
                <span *ngIf="entry.pending" class="log-pending-tag">{{ i18n.t('transfer.inProgress') }}</span>
                <!-- ★ 2026-09-07 issue #15+：内容已确认相同 → 自动跳过；与 success ✓ 区分，避免「重复拖同文件看不到任何反馈」 -->
                <span *ngIf="entry.skippedAsDuplicate" class="log-skipped-tag" [title]="i18n.t('transfer.skippedAsDuplicate')">⏭ {{ i18n.t('transfer.skippedAsDuplicate') }}</span>
              </span>
              <span class="log-status-icon"
                    [class.success]="!entry.pending && !entry.skippedAsDuplicate && entry.success"
                    [class.failed]="!entry.pending && !entry.success"
                    [class.pending]="entry.pending"
                    [class.skipped]="!!entry.skippedAsDuplicate"
                    [title]="entry.pending ? i18n.t('transfer.inProgress') : (entry.skippedAsDuplicate ? i18n.t('transfer.skippedAsDuplicate') : (entry.success ? i18n.t('transfer.success') : formatFailReason(entry)))">
                {{ entry.pending ? '⏳' : (entry.skippedAsDuplicate ? '⏭' : (entry.success ? '✓' : '✗')) }}
              </span>
            </div>
            <div class="log-row-paths">
              <ng-container *ngIf="isUploadLike(entry); else downloadPaths">
                <span class="log-path-line" [title]="entry.localPath">🖥 {{ entry.localPath }}</span>
                <span class="log-path-arrow">→</span>
                <span class="log-path-line" [title]="entry.remotePath">🌐 {{ entry.remotePath }}</span>
              </ng-container>
              <ng-template #downloadPaths>
                <span class="log-path-line" [title]="entry.remotePath">🌐 {{ entry.remotePath }}</span>
                <span class="log-path-arrow">→</span>
                <span class="log-path-line" [title]="entry.localPath">🖥 {{ entry.localPath }}</span>
              </ng-template>
              <span class="log-time" *ngIf="entry.startTime">{{ formatLogTime(entry.timestamp) }}</span>
            </div>
          </div>
        </div>
        <div class="dialog-buttons">
          <span class="log-count">{{ countLabel }}</span>
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
    .dialog-buttons {
      display: flex; justify-content: space-between; align-items: center;
      gap: 8px; padding-top: 10px;
    }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .dialog-buttons button.danger { color: var(--_text); }
    .dialog-buttons button:hover { background: var(--_hover, rgba(128,128,128,0.1)); }
    .log-dialog {
      min-width: 620px;
      max-height: 85vh;
      overflow: auto;
      resize: both;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.08));
    }
    .log-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 13px; flex-wrap: wrap; }
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
    .log-count {
      font-size: 12px;
      color: var(--_text);
      opacity: 0.55;
      white-space: nowrap;
    }
    .log-date-field {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; color: var(--_text); opacity: 0.8;
    }
    .log-date-field input[type="date"] {
      padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); font-size: 12px; outline: none;
      font-family: inherit;
    }
    .log-date-field input[type="date"]:focus {
      border-color: var(--_primary);
      box-shadow: 0 0 0 1px var(--_primary);
    }
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
    /* ★ 2026-09-03：目录传输模式 / 文件数标签 */
    .log-mode-tag {
      display: inline-block; flex-shrink: 0;
      font-size: 10px; padding: 0 6px; border-radius: 3px; line-height: 1.6;
    }
    .log-mode-tag.tag-fast {
      color: #ff9800; background: rgba(255,152,0,0.12);
      border: 1px solid rgba(255,152,0,0.4);
    }
    .log-mode-tag.tag-tar {
      color: #26c6da; background: rgba(38,198,218,0.12);
      border: 1px solid rgba(38,198,218,0.4);
    }
    .log-mode-tag.tag-count { color: var(--_text); opacity: 0.55; border: 1px solid var(--_border); }
    .log-size { font-size: 11px; color: var(--_text); opacity: 0.55; }
    .log-speed { font-size: 10px; color: var(--_primary); opacity: 0.75; }
    .log-duration { font-size: 10px; color: var(--_text); opacity: 0.45; }
    .log-status-icon { font-size: 14px; line-height: 1; flex-shrink: 0; margin-left: 4px; }
    .log-status-icon.success { color: #4caf50; }
    .log-status-icon.failed { color: #f44336; }
    /* ★ 修复：传输进行中显示橙色沙漏，区别于 ✓/✗ */
    .log-status-icon.pending { color: #ff9800; animation: log-pending-spin 1.2s linear infinite; }
    @keyframes log-pending-spin { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
    .log-pending-tag {
      font-size: 10px; color: #ff9800;
      padding: 0 6px; border: 1px solid #ff9800; border-radius: 3px;
      line-height: 1.4; opacity: 0.85;
    }
    /* ★ 2026-09-07 issue #15+：内容相同自动跳过；与 success ✓ 区分，蓝色提示而非绿色对勾 */
    .log-skipped-tag {
      font-size: 10px; color: #3b82f6;
      padding: 0 6px; border: 1px solid #3b82f6; border-radius: 3px;
      line-height: 1.4; opacity: 0.85;
    }
    .log-status-icon.skipped { color: #3b82f6; opacity: 0.85; }
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
  @Input() totalCount = 0
  @Input() filterOp = ''
  @Input() filterStatus = ''
  @Input() filterTimeRange: '' | 'today' | '7d' | '30d' | 'custom' = ''
  @Input() filterDateFrom = ''
  @Input() filterDateTo = ''
  @Input() activeTransferCount = 0
  @Input() transfersHidden = false
  @Input() transfersMinimized = false
  @Input() isZh = true

  @Output() close = new EventEmitter<void>()
  @Output() filterOpChange = new EventEmitter<string>()
  @Output() filterStatusChange = new EventEmitter<string>()
  @Output() filterTimeRangeChange = new EventEmitter<'' | 'today' | '7d' | '30d' | 'custom'>()
  @Output() filterDateFromChange = new EventEmitter<string>()
  @Output() filterDateToChange = new EventEmitter<string>()
  @Output() showTransfers = new EventEmitter<void>()
  @Output() export = new EventEmitter<void>()
  @Output() clear = new EventEmitter<void>()

  formatSize = formatSize
  formatLogTime = formatLogTime
  formatDuration = formatDuration
  formatSpeedFromSize = formatSpeedFromSize
  getLogFileName = getLogFileName
  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  /** ★ 2026-08-30 修复：上传条目方向显示反转
   *  原写法 `isUploadLike = isUploadLikeOperation` 直接暴露了工具函数，而该函数的入参是
   *  operation 字符串，模板却按 isUploadLike(entry) 传入整个条目对象 ——
   *  `entry === 'upload'` 恒为 false，导致上传条目误走下载分支（🌐远端→🖥本地），
   *  方向看起来是反的（下载分支碰巧正确，故只有上传受害）。
   *  改为接收条目对象、内部取 operation，使签名与调用方语义一致；同时防御空条目。 */
  isUploadLike(entry: TransferLogEntry): boolean {
    return isUploadLikeOperation(entry?.operation)
  }

  @Input() i18n!: SftpI18nService

  get countLabel(): string {
    const filtered = this.entries.length
    const total = this.totalCount
    if (filtered === total) {
      return this.i18n.t('transfer.logCount', { total })
    }
    return this.i18n.t('transfer.logCountFiltered', { filtered, total })
  }

  get emptyLabel(): string {
    if (this.totalCount > 0) return this.i18n.t('transfer.logNoMatch')
    return this.i18n.t('transfer.logEmpty')
  }

  formatFailReason(entry: TransferLogEntry): string {
    return formatFailReasonFn(entry, this.i18n.t.bind(this.i18n))
  }

  trackById(_index: number, entry: TransferLogEntry): string | number {
    // 回退 index：旧日志可能缺 id 字段，若多条 id 相同/为空，*ngFor 会把它们当同一节点折叠成 1 行
    return entry.id ?? _index
  }
}

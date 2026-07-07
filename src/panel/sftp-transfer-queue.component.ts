/**
 * SFTP+ 传输队列面板（从主面板抽离）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../sftp-i18n.service'
import type { PanelTransferItem } from './panel-types'
import { formatPercent, formatSize } from './panel-format'

@Component({
  selector: 'sftp-transfer-queue',
  template: `
    <div class="sftp-transfers" *ngIf="transfers.length && !hidden && !minimized"
      (mousedown)="$event.stopPropagation()"
      (wheel)="$event.stopPropagation()">
      <div class="transfer-header">
        <span>{{ i18n.t('transfer.inProgress') }} <span class="transfer-count" *ngIf="transfers.length">({{ transfers.length }})</span></span>
        <div class="transfer-header-btns">
          <button class="btn-link" (click)="minimizeChange.emit(true)" title="{{ i18n.t('transfer.minimizePanel') }}">─</button>
          <button class="btn-link" (click)="hiddenChange.emit(true)" title="{{ i18n.t('transfer.hidePanel') || 'Hide' }}">✕</button>
        </div>
      </div>
      <div class="transfer" *ngFor="let t of transfers">
        <div class="transfer-main">
          <div class="transfer-title">
            <span class="direction">{{ t.direction === 'upload' ? '↑' : '↓' }}</span>
            <span *ngIf="t.isFolder">📁</span>
            <span>{{ t.name }}</span>
            <span class="transfer-size" *ngIf="t.bytesTotal > 0">{{ formatSize(t.bytesTotal) }}</span>
            <span class="paused-tag" *ngIf="t.paused">{{ i18n.t('transfer.paused') }}</span>
          </div>
          <div class="transfer-sub" *ngIf="t.isFolder && t.currentItem">
            {{ t.currentItem }}<span *ngIf="t.currentItemSize != null">  {{ formatSize(t.currentItemSize) }}</span> ({{ t.itemDone }}/{{ t.itemCount }})
          </div>
          <div class="bar"><div class="fill" [style.width.%]="t.percent"></div></div>
        </div>
        <div class="transfer-stats">
          <span>{{ t.speed || '--' }}</span>
          <span>{{ formatPercent(t.percent) }}%</span>
          <button *ngIf="!t.paused" class="btn-pause" (click)="pause.emit(t)" title="{{ i18n.t('transfer.pause') }}">⏸</button>
          <button *ngIf="t.paused" class="btn-resume" (click)="resume.emit(t)" title="{{ i18n.t('transfer.resume') }}">▶</button>
          <button *ngIf="t.isFolder" class="btn-cancel-current" (click)="cancelCurrent.emit(t)" title="{{ i18n.t('transfer.cancelCurrent') }}">⏹</button>
          <button *ngIf="!t.isFolder" class="btn-cancel" (click)="cancel.emit(t)" title="{{ i18n.t('transfer.cancel') }}">⏹</button>
          <button *ngIf="t.isFolder" class="btn-cancel" (click)="cancel.emit(t)" title="{{ i18n.t('transfer.cancelAll') }}">✕</button>
        </div>
      </div>
    </div>
    <div class="sftp-transfers-mini" *ngIf="transfers.length && !hidden && minimized"
      (click)="minimizeChange.emit(false)" (mousedown)="$event.stopPropagation()">
      <span>📦 {{ i18n.t('transfer.inProgress') }} ({{ transfers.length }})</span>
    </div>
  `,
  styles: [`
    .sftp-transfers {
      display: flex; flex-direction: column; gap: 4px;
      max-height: 100px; overflow-y: auto;
      border-top: 2px solid var(--_primary);
      padding-top: 4px; flex-shrink: 0;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
      position: relative; z-index: 5;
    }
    .transfer {
      display: grid; grid-template-columns: 1fr auto; gap: 8px;
      padding: 4px 8px; border-radius: 6px;
      background: var(--_surface); border: 1px solid var(--_border);
      font-size: 11px;
    }
    .transfer-title { display: flex; gap: 6px; align-items: center; }
    .transfer-size { font-size: 10px; color: var(--_text-muted); white-space: nowrap; }
    .transfer-sub { font-size: 10px; color: var(--_text-muted); margin-top: 2px; padding-left: 20px; }
    .direction { font-size: 14px; }
    .bar { height: 4px; background: var(--_border); border-radius: 2px; overflow: hidden; margin-top: 4px; }
    .fill {
      height: 100%; background: linear-gradient(90deg, var(--_primary), #78ffce);
      border-radius: 2px; transition: width 0.3s;
    }
    .transfer-stats { display: flex; gap: 6px; align-items: center; font-family: monospace; }
    .transfer-stats button { background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 13px; line-height: 1; opacity: 0.7; }
    .transfer-stats button:hover { opacity: 1; }
    .btn-cancel { color: #ef4444; }
    .btn-cancel-current { color: #f59e0b; }
    .btn-pause { color: var(--_primary); }
    .btn-resume { color: #22c55e; }
    .paused-tag { font-size: 10px; color: #f59e0b; font-weight: 600; margin-left: 4px; }
    .transfer-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 2px 8px; font-size: 12px; font-weight: 600;
      background: var(--_surface); border-radius: 6px 6px 0 0;
    }
    .transfer-header button { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.6; padding: 0; line-height: 1; }
    .transfer-header button:hover { opacity: 1; }
    .transfer-header-btns { display: flex; gap: 6px; align-items: center; }
    .transfer-count { font-size: 10px; opacity: 0.7; }
    .sftp-transfers-mini {
      padding: 2px 10px; font-size: 11px; cursor: pointer;
      background: var(--_surface); border-radius: 4px;
      color: var(--_text-muted); text-align: center;
      border: 1px solid var(--_border); margin-top: 4px;
    }
    .sftp-transfers-mini:hover { opacity: 0.8; }
  `],
})
export class SftpTransferQueueComponent {
  @Input() transfers: PanelTransferItem[] = []
  @Input() hidden = false
  @Input() minimized = false
  @Output() hiddenChange = new EventEmitter<boolean>()
  @Output() minimizeChange = new EventEmitter<boolean>()
  @Output() pause = new EventEmitter<PanelTransferItem>()
  @Output() resume = new EventEmitter<PanelTransferItem>()
  @Output() cancel = new EventEmitter<PanelTransferItem>()
  @Output() cancelCurrent = new EventEmitter<PanelTransferItem>()

  formatSize = formatSize
  formatPercent = formatPercent

  @Input() i18n!: SftpI18nService
}

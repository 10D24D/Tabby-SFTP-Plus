/**
 * SFTP+ 文件冲突对话框（从主面板抽离）
 * 功能描述：上传/下载覆盖冲突确认对话框，展示本地/远程两侧文件大小、修改时间、路径供用户选择
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-02 — conflict-side-title 图标：远程侧 ☁️→🌐、本地侧 📁→🖥
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import type { ConflictFileInfo } from '../core/panel-types'
import { formatDate, formatSize } from '../core/file-utils'

@Component({
  selector: 'sftp-conflict-dialog',
  template: `
    <div class="overlay" *ngIf="visible && data" #overlayEl tabindex="-1"
      (keydown)="onKeyDown($event)">
      <div class="dialog conflict-dialog">
        <div class="conflict-header">
          <span class="conflict-title-icon">⚠️</span>
          <span class="conflict-title-text">{{ i18n.t('conflict.title') }}</span>
          <!-- ★ 2026-08-11：方向徽章——一眼分辨是上传（本地→远程）还是下载（远程→本地）冲突 -->
          <span class="conflict-direction" *ngIf="directionLabel"
            [class.dir-upload]="data.direction !== 'download'"
            [class.dir-download]="data.direction === 'download'">{{ directionLabel }}</span>
          <!-- ★ 2026-08-10 修复 #24：去掉硬编码中文"冲突"，用语言中性的序号进度（标题已译） -->
          <span class="conflict-progress" *ngIf="totalIdx > 1">{{ currIdx }} / {{ totalIdx }}</span>
        </div>
        <div class="conflict-desc">
          <span *ngIf="data.isDirectory">📁</span><span *ngIf="!data.isDirectory">📄</span>
          <strong>{{ data.fileName }}</strong>
          <ng-container *ngIf="data.isDirectory; else fileConflictDesc">
            {{ i18n.t('conflict.existsLocal') || '已存在于本地目录' }}
          </ng-container>
          <ng-template #fileConflictDesc>
            {{ data.isSamePane ? i18n.t('conflict.existsSamePane') : (data.direction === 'download' ? i18n.t('conflict.existsLocal') : i18n.t('conflict.existsRemote')) }}
          </ng-template>
        </div>
        <div class="conflict-compare">
          <div class="conflict-side conflict-side-remote">
            <div class="conflict-side-title">{{ data.isSamePane ? '📄 ' + i18n.t('conflict.sourceFile') : '🌐 ' + i18n.t('conflict.remoteFile') }}</div>
            <div class="conflict-file-info">
              <div class="conflict-info-row" [class.conflict-diff]="data.localSize !== data.remoteSize">
                <span class="conflict-label">{{ i18n.t('conflict.size') }}</span>
                <span class="conflict-val">{{ formatSizeWithPrecision(data.remoteSize, data.localSize) }}</span>
                <span class="conflict-diff-dot" *ngIf="data.localSize !== data.remoteSize">≠</span>
              </div>
              <div class="conflict-info-row" [class.conflict-diff]="data.localMtime !== data.remoteMtime">
                <span class="conflict-label">{{ i18n.t('conflict.modified') }}</span>
                <span class="conflict-val">{{ formatDate(data.remoteMtime) }}</span>
                <span class="conflict-diff-dot" *ngIf="data.localMtime !== data.remoteMtime">≠</span>
              </div>
              <div class="conflict-info-row conflict-path">
                <span class="conflict-label">{{ i18n.t('conflict.path') }}</span>
                <span class="conflict-val" [title]="data.remotePath">{{ data.remotePath }}</span>
              </div>
            </div>
          </div>
          <div class="conflict-vs-row">
            <span class="conflict-vs-line"></span>
            <span class="conflict-vs">VS</span>
            <span class="conflict-vs-line"></span>
          </div>
          <div class="conflict-side conflict-side-local">
            <div class="conflict-side-title">{{ data.isSamePane ? '📂 ' + i18n.t('conflict.targetFileExists') : '🖥 ' + i18n.t('conflict.localFile') }}</div>
            <div class="conflict-file-info">
              <div class="conflict-info-row" [class.conflict-diff]="data.localSize !== data.remoteSize">
                <span class="conflict-label">{{ i18n.t('conflict.size') }}</span>
                <span class="conflict-val">{{ formatSizeWithPrecision(data.localSize, data.remoteSize) }}</span>
                <span class="conflict-diff-dot" *ngIf="data.localSize !== data.remoteSize">≠</span>
              </div>
              <div class="conflict-info-row" [class.conflict-diff]="data.localMtime !== data.remoteMtime">
                <span class="conflict-label">{{ i18n.t('conflict.modified') }}</span>
                <span class="conflict-val">{{ formatDate(data.localMtime) }}</span>
                <span class="conflict-diff-dot" *ngIf="data.localMtime !== data.remoteMtime">≠</span>
              </div>
              <div class="conflict-info-row conflict-path">
                <span class="conflict-label">{{ i18n.t('conflict.path') }}</span>
                <span class="conflict-val" [title]="data.localPath">{{ data.localPath }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="conflict-actions">
          <button class="conflict-btn" (click)="resolve.emit('cancel')">{{ i18n.t('conflict.cancel') }}</button>
          <button class="conflict-btn conflict-btn-skip" (click)="resolve.emit('skip')">{{ i18n.t('conflict.skip') }}</button>
          <button class="conflict-btn conflict-btn-rename" (click)="resolve.emit('rename')">{{ i18n.t('conflict.rename') }}</button>
          <button class="conflict-btn conflict-btn-danger" (click)="resolve.emit('overwrite')">{{ i18n.t('conflict.overwrite') }}</button>
        </div>
        <div class="conflict-all-row">
          <span class="conflict-all-label">{{ i18n.t('conflict.batch') }}</span>
          <button class="conflict-link" (click)="resolve.emit('skip-all')">{{ i18n.t('conflict.skipAll') }}</button>
          <span class="conflict-sep">·</span>
          <button class="conflict-link" (click)="resolve.emit('rename-all')">{{ i18n.t('conflict.renameAll') }}</button>
          <span class="conflict-sep">·</span>
          <button class="conflict-link" (click)="resolve.emit('overwrite-all')">{{ i18n.t('conflict.overwriteAll') }}</button>
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
    .conflict-dialog { min-width: 420px; max-width: 520px; padding: 20px 24px; border-radius: 12px; }
    .conflict-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .conflict-title-icon { font-size: 20px; }
    .conflict-title-text { font-size: 16px; font-weight: 700; }
    .conflict-progress {
      margin-left: auto; font-size: 11px; padding: 2px 10px;
      border-radius: 10px; background: var(--_input-bg, rgba(128,128,128,0.08));
      color: var(--_text); opacity: 0.65; font-weight: 500;
    }
    .conflict-direction { font-size: 11px; padding: 2px 10px; border-radius: 10px; font-weight: 600; white-space: nowrap; }
    .dir-upload { background: rgba(76,175,80,0.15); color: #4caf50; }
    .dir-download { background: rgba(33,150,243,0.15); color: #2196f3; }
    .conflict-desc {
      font-size: 13px; color: var(--_text); opacity: 0.8;
      margin-bottom: 16px; word-break: break-all; padding: 0 2px;
    }
    .conflict-compare { display: flex; flex-direction: column; gap: 4px; margin-bottom: 18px; }
    .conflict-side {
      background: var(--_content); border-radius: 8px; padding: 10px 14px;
      border: 1px solid var(--_border); border-left: 3px solid var(--_primary, #3b82f6);
      display: flex; flex-direction: column; gap: 2px;
    }
    .conflict-side-title { font-size: 13px; font-weight: 700; margin-bottom: 2px; display: flex; align-items: center; gap: 4px; }
    .conflict-file-info { display: flex; flex-direction: column; gap: 2px; }
    .conflict-info-row { display: flex; align-items: center; gap: 6px; font-size: 12px; min-height: 20px; }
    .conflict-label { flex-shrink: 0; color: var(--_text); opacity: 0.45; min-width: 52px; font-size: 11px; }
    .conflict-val { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .conflict-diff { background: rgba(255,152,0,0.08); border-radius: 3px; padding: 0 2px; }
    .conflict-diff-dot { flex-shrink: 0; font-size: 10px; font-weight: 700; color: #ff9800; width: 14px; text-align: center; }
    .conflict-path .conflict-val { font-size: 11px; opacity: 0.7; }
    .conflict-vs-row { display: flex; align-items: center; gap: 10px; padding: 2px 0; }
    .conflict-vs-line { flex: 1; height: 1px; background: var(--_border, rgba(128,128,128,0.2)); }
    .conflict-vs { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 0 10px; color: var(--_text); opacity: 0.4; letter-spacing: 1px; }
    .conflict-actions { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .conflict-btn {
      padding: 6px 18px; border-radius: 6px; border: 1px solid var(--_border);
      background: var(--_content); color: var(--_text); cursor: pointer;
      font-size: 13px; font-weight: 500; transition: background 0.12s, border-color 0.12s;
    }
    .conflict-btn:hover { background: var(--_hover); }
    .conflict-btn-skip { opacity: 0.7; }
    .conflict-btn-skip:hover { opacity: 1; }
    .conflict-btn-rename { background: transparent; border-color: var(--_primary, #3b82f6); color: var(--_primary, #3b82f6); }
    .conflict-btn-rename:hover { background: rgba(59,130,246,0.1); }
    .conflict-btn-danger { background: #d32f2f; color: #fff; border-color: #c62828; font-weight: 600; }
    .conflict-btn-danger:hover { background: #b71c1c; }
    .conflict-all-row {
      display: flex; justify-content: center; gap: 6px; align-items: center;
      padding-top: 8px; border-top: 1px solid var(--_border); flex-wrap: wrap;
    }
    .conflict-all-label { font-size: 12px; color: var(--_text); opacity: 0.55; }
    .conflict-link {
      background: none; border: none; color: var(--_primary, #3b82f6);
      cursor: pointer; font-size: 12px; padding: 2px 6px; border-radius: 4px;
    }
    .conflict-link:hover { background: var(--_hover); text-decoration: underline; }
    .conflict-sep { color: var(--_text); opacity: 0.3; font-size: 12px; }
  `],
})
export class SftpConflictDialogComponent implements OnChanges {
  @Input() visible = false
  @Input() data: ConflictFileInfo | null = null
  @Input() currIdx = 1
  @Input() totalIdx = 1
  @Output() resolve = new EventEmitter<string>()
  @ViewChild('overlayEl', { static: false }) overlayEl?: ElementRef<HTMLDivElement>

  formatSize = formatSize
  formatDate = formatDate

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      setTimeout(() => this.overlayEl?.nativeElement?.focus())
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.resolve.emit('skip')
    }
  }

  /** ★ 2026-08-17：格式化后相同但字节数不同时，括号内显示精确值 */
  formatSizeWithPrecision(bytes: number, otherBytes: number): string {
    const formatted = formatSize(bytes)
    if (bytes !== otherBytes && formatted === formatSize(otherBytes)) {
      return `${formatted} (${bytes.toLocaleString()} B)`
    }
    return formatted
  }

  /** ★ 2026-08-11：冲突方向标签（复用既有键拼装，无需新 i18n）：
   *  上传 → 「⬆ 上传：本地 → 远程」；下载 → 「⬇ 下载：远程 → 本地」；同面板冲突不显示 */
  get directionLabel(): string {
    const d = this.data
    if (!d || d.isSamePane) return ''
    const local = this.i18n.t('pane.local')
    const remote = this.i18n.t('pane.remote')
    return d.direction === 'download'
      ? `⬇ ${this.i18n.t('transfer.download')}：${remote} → ${local}`
      : `⬆ ${this.i18n.t('transfer.upload')}：${local} → ${remote}`
  }

  @Input() i18n!: SftpI18nService
}

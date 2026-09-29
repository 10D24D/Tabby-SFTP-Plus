/**
 * SFTP+ 传输目标目录不存在确认对话框
 * 功能描述：右键上传/下载使用「默认上传/下载路径」时，若目标目录不存在，
 *   弹出三选一确认：创建并传输（远程逐级 mkdir / 本地 recursive mkdir）、
 *   本次使用当前面板目录（回退）、取消传输。每批传输只询问一次。
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-09-28
 * @修改人：DD1024z + Hy3
 * @修改时间：2026-09-28
 * 修改情况：
 *   - 2026-09-28 (Hy3)：按钮顺序调整——「取消」移到最左侧（用户反馈），主操作保持靠右
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'

@Component({
  selector: 'sftp-dir-missing-dialog',
  template: `
    <div class="overlay sftp-dir-missing-overlay" #overlayEl *ngIf="visible" tabindex="-1" (keydown)="onKeyDown($event)">
      <div class="dir-missing-dialog">
        <div class="dir-missing-header">
          <svg class="dir-missing-warn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f0a030" stroke-width="1.5">
            <circle cx="12" cy="12" r="10" stroke="#f0a030" fill="rgba(240,160,48,0.1)"/>
            <line x1="12" y1="8" x2="12" y2="13"/>
            <circle cx="12" cy="16.5" r="0.8" fill="#f0a030" stroke="none"/>
          </svg>
          <span class="dir-missing-title">{{ i18n.t('app.dirMissingTitle') }}</span>
        </div>
        <div class="dir-missing-text">{{ i18n.t('app.dirMissingText') }}</div>
        <div class="dir-missing-preview">
          <div class="dir-missing-row">
            <span class="dir-missing-label">{{ isRemote ? '🌐' : '💻' }}</span>
            <span class="dir-missing-path">{{ dir }}</span>
          </div>
        </div>
        <div class="dialog-buttons">
          <button (click)="emitChoice('cancel')">{{ i18n.t('app.dirMissingCancel') }}</button>
          <button class="primary" *ngIf="showFallback" (click)="emitChoice('fallback')">{{ i18n.t('app.dirMissingFallback') }}</button>
          <button class="primary" (click)="emitChoice('create')">{{ i18n.t('app.dirMissingCreate') }}</button>
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
    .dir-missing-dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 12px; padding: 20px; min-width: 340px; max-width: 440px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }
    .dir-missing-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .dir-missing-warn-icon { flex-shrink: 0; width: 18px !important; height: 18px !important; }
    .dir-missing-title { font-size: 15px; font-weight: 600; color: var(--_text); }
    .dir-missing-text { font-size: 13px; color: var(--_text); margin-bottom: 12px; opacity: 0.85; }
    .dir-missing-preview {
      border: 1px solid var(--_border);
      border-radius: 8px; padding: 12px; margin-bottom: 16px;
      background: var(--_content);
    }
    .dir-missing-row {
      display: flex; align-items: flex-start; gap: 8px;
      font-size: 12px; padding: 2px 0;
    }
    .dir-missing-label { flex-shrink: 0; }
    /* 长路径折行显示，不挤压对话框宽度 */
    .dir-missing-path { word-break: break-all; color: var(--_text); }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .dialog-buttons button.primary { background: #1976d2 !important; border-color: #42a5f5 !important; color: #fff; }
    .dialog-buttons button.primary:hover { background: #1e88e5 !important; }
  `],
})
export class SftpDirMissingDialogComponent implements OnChanges, OnDestroy {
  @Input() visible = false
  /** 不存在的目标目录完整路径 */
  @Input() dir = ''
  /** true = 远程目录（上传）；false = 本地目录（下载） */
  @Input() isRemote = false
  /** 请求目录与面板当前目录不同时才提供「使用当前目录」回退项 */
  @Input() showFallback = true

  @Output() choice = new EventEmitter<'create' | 'fallback' | 'cancel'>()

  @Input() i18n!: SftpI18nService

  @ViewChild('overlayEl', { static: false }) overlayEl?: ElementRef<HTMLDivElement>

  private _focusTimer: ReturnType<typeof setTimeout> | null = null

  // ★ 对话框显示时把焦点移入 overlay（tabindex=-1 可聚焦但不进入 Tab 序列），
  //   确保回车/Esc 的 keydown 能落到 overlay 的 onKeyDown（与删除确认框同套路）
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this._focusTimer) {
        clearTimeout(this._focusTimer)
        this._focusTimer = null
      }
      if (this.visible) {
        this._focusTimer = setTimeout(() => {
          this._focusTimer = null
          this.overlayEl?.nativeElement?.focus()
        })
      }
    }
  }

  ngOnDestroy(): void {
    if (this._focusTimer) {
      clearTimeout(this._focusTimer)
      this._focusTimer = null
    }
  }

  emitChoice(c: 'create' | 'fallback' | 'cancel'): void {
    this.choice.emit(c)
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      // 回车 = 最常用动作：创建并传输
      event.preventDefault()
      event.stopImmediatePropagation()
      this.emitChoice('create')
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.emitChoice('cancel')
    }
  }
}

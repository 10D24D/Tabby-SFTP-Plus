/**
 * SFTP+ 通用确认对话框（面板内模态，替代 Electron 原生 confirm）
 * 功能描述：一句话消息 + 「确定 / 取消」的面板内模态框。由
 *   `SftpPanelConfirmController.askConfirm()` 以 Promise 形式驱动，
 *   供面板内所有「需要用户二次确认」的入口统一调用。
 *
 * ⛔ 为什么必须自己实现，而不是 `window.confirm()`：
 *   Electron 在 Windows 上的已知缺陷 —— 原生 alert/confirm 关闭后**焦点链没有交还渲染进程**，
 *   此后点页面内的表单控件（尤其原生 `<select>`、`<input>`）**没有任何反应**，只能切到别的
 *   应用再切回来 / 开关 devtools 才恢复（electron/electron#31917、#22923，16~29 均复现，
 *   官方至今未修）。实测触发路径：传输记录对话框点「清除」→ 原生 confirm → 之后工具栏的
 *   四个筛选下拉框全部点不开（用户报障原话：「清除传输记录后…筛选条件的下拉框点击了没有反应」）。
 *   本项目所有 `window.confirm()` 调用点都因此不具备「取消后继续操作」的安全性，
 *   面板内一律改走本对话框。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-26
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { handleOverlayKeydown } from './dialog-focus'

@Component({
  selector: 'sftp-confirm-dialog',
  template: `
    <div class="overlay" #overlayEl *ngIf="visible" tabindex="-1" (keydown)="onKeyDown($event)">
      <div class="confirm-dialog">
        <div class="confirm-title" *ngIf="title">{{ title }}</div>
        <div class="confirm-message">{{ message }}</div>
        <div class="dialog-buttons">
          <button (click)="confirm.emit()">{{ confirmLabel || i18n.t('app.confirm') }}</button>
          <button (click)="cancel.emit()">{{ i18n.t('app.cancel') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      /* ★ 高于查看器/编辑器（110）——「未保存要关闭吗」「远端已变更要覆盖吗」都是在
         这两个对话框**之上**弹出的二次确认；与删除确认同档（120），两者不会同时出现。 */
      z-index: 120;
      transition: none !important; animation: none !important;
      outline: none;
    }
    .overlay:focus { outline: none; }
    .confirm-dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 12px; padding: 20px; min-width: 300px; max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      box-sizing: border-box;
    }
    .confirm-title { font-size: 15px; font-weight: 600; color: var(--_text); margin-bottom: 10px; }
    .confirm-message { font-size: 13px; line-height: 1.5; color: var(--_text); opacity: 0.85; word-break: break-word; }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .dialog-buttons button:hover { background: var(--_hover, rgba(128,128,128,0.1)); }
  `],
})
export class SftpConfirmDialogComponent implements OnChanges, OnDestroy {
  @Input() visible = false
  @Input() title = ''
  @Input() message = ''
  /** 确定键文案（空串 = 用 app.confirm） */
  @Input() confirmLabel = ''

  @Output() confirm = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  @ViewChild('overlayEl', { static: false }) overlayEl?: ElementRef<HTMLDivElement>
  private _focusTimer: ReturnType<typeof setTimeout> | null = null
  /** 打开前的焦点元素：关闭后还回去（模态结束后焦点停在 BODY 会让面板快捷键失灵） */
  private _prevFocus: HTMLElement | null = null

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null }
      if (this.visible) {
        // 快照调用方原来的焦点（通常是触发确认的那个按钮），关闭时还原
        const active = document.activeElement as HTMLElement | null
        this._prevFocus = active && active !== document.body ? active : null
        // 焦点移入遮罩（tabindex=-1 可聚焦、但不进入 Tab 序列），Esc / Tab 陷阱才有落点
        this._focusTimer = setTimeout(() => {
          this._focusTimer = null
          this.overlayEl?.nativeElement?.focus()
        })
      }
    }
  }

  ngOnDestroy(): void {
    if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null }
    // 关闭后把焦点还回原处（元素可能已被移除/禁用，故先判 isConnected；失败即忽略）
    try {
      if (this._prevFocus?.isConnected) this._prevFocus.focus({ preventScroll: true })
    } catch { /* ignore */ }
    this._prevFocus = null
  }

  /**
   * Esc 取消；Tab/Shift+Tab 由 dialog-focus helper 收口在对话框内。
   * ⛔ 刻意**不**传 `opts.onEnter`：焦点停在遮罩上时回车不做任何事。
   *   确认框背后多是「清空记录 / 取消在途传输 / 丢弃未保存内容」这类不可逆动作，
   *   回车必须落在具体按钮上才算数（与删除框 P0「假取消」同一条原则）。
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.cancel.emit() }
    handleOverlayKeydown(event, this.overlayEl?.nativeElement)
  }
}

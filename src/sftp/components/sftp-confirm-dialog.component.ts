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
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-11-02 — 恢复「回车=确定」并把初始焦点落到「确定」按钮（此前刻意不传
 *              onEnter，遮罩上的回车没有任何反应，与删除框同族问题）
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
          <button #confirmBtn (click)="confirm.emit()">{{ confirmLabel || i18n.t('app.confirm') }}</button>
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
  /** 「确定」按钮：打开时把焦点落在这里，回车即明确激活它（焦点环可见） */
  @ViewChild('confirmBtn', { static: false }) confirmBtn?: ElementRef<HTMLButtonElement>
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
        // 焦点移入「确定」按钮（不是遮罩）：回车即明确激活它、焦点环可见；
        // 遮罩仅作兜底（按钮尚未渲染时），保证 Esc / Tab 陷阱有落点
        this._focusTimer = setTimeout(() => {
          this._focusTimer = null
          const btn = this.confirmBtn?.nativeElement
          if (btn) btn.focus()
          else this.overlayEl?.nativeElement?.focus()
        })
      } else {
        // ★ 2026-10-30 P2 修复（SF-23）：焦点归还必须挂在「visible 变 false」上。
        //   本组件由父模板用 `[visible]` 驱动常驻（模板内才是 *ngIf），ngOnDestroy 基本不执行 ⇒
        //   原实现每次二次确认后焦点都掉到 <body>，之后按 Tab 从头开始遍历，
        //   面板快捷键也随之失灵（焦点不在 .sftp-root 内）。
        this._restoreFocus()
      }
    }
  }

  private _restoreFocus(): void {
    // 关闭后把焦点还回原处（元素可能已被移除/禁用，故先判 isConnected；失败即忽略）
    try {
      if (this._prevFocus?.isConnected) this._prevFocus.focus({ preventScroll: true })
    } catch { /* ignore */ }
    this._prevFocus = null
  }

  ngOnDestroy(): void {
    if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null }
    this._restoreFocus()
  }

  /**
   * Esc 取消；Enter 确定；Tab/Shift+Tab 由 dialog-focus helper 收口在对话框内。
   * ★ 2026-11-02：恢复 `opts.onEnter`。此前刻意不传，导致焦点停在遮罩上时回车没有任何反应
   *   （与删除框「回车无法确认」同族）。现由「打开即聚焦确定按钮」保证常态下走原生激活、
   *   焦点环可见，onEnter 只作遮罩焦点时的兜底。
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.cancel.emit() }
    handleOverlayKeydown(event, this.overlayEl?.nativeElement, {
      onEnter: () => this.confirm.emit(),
    })
  }
}

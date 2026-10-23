/**
 * SFTP+ 终端目录上报配置确认对话框
 * 不会自动向终端注入命令；需用户明确选择「仅本次」或「永久写入」
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { handleOverlayKeydown } from './dialog-focus'

export type CwdSetupChoice = 'session' | 'permanent' | 'cancel'

/**
 * bash 用 \$(pwd) 转义：赋值时保留字面量，每次显示提示符时再展开，且避免嵌套双引号把 shell 卡进 > 续行。
 * （Tabby Wiki 原式用引号拼接：CurrentDir="'$(pwd)\a\]"，效果相同但易误读。）
 */
export const CWD_SESSION_CMD =
  'export PS1="$PS1\\[\\e]1337;CurrentDir=\\$(pwd)\\a\\]"'

/** 永久写入 bash：追加到 ~/.bashrc 的内容 */
export const CWD_BASH_SNIPPET = [
  '# tabby-sftp-plus cwd reporting',
  'export PS1="$PS1\\[\\e]1337;CurrentDir=\\$(pwd)\\a\\]"',
].join('\n')

/** 永久写入 zsh：追加到 ~/.zshrc 的内容 */
export const CWD_ZSH_SNIPPET = [
  '# tabby-sftp-plus cwd reporting',
  '__sftp_plus_cwd_precmd(){ printf "\\033]1337;CurrentDir=%s\\007" "$PWD"; }',
  'precmd_functions+=(__sftp_plus_cwd_precmd)',
].join('\n')

@Component({
  selector: 'sftp-cwd-setup-dialog',
  template: `
    <div class="overlay" #overlayEl *ngIf="visible" tabindex="-1" (keydown)="onOverlayKeydown($event)" (click)="onBackdrop($event)">
      <div class="dialog" (click)="$event.stopPropagation()">
        <div class="dialog-title">{{ i18n.t('path.cwdSetupTitle') }}</div>
        <div class="dialog-body">
          <p>{{ i18n.t('path.cwdSetupIntro') }}</p>

          <div class="cmd-block">
            <div class="cmd-label">{{ i18n.t('path.cwdSetupSessionHint') }}</div>
            <pre class="cmd-code">{{ sessionCmd }}</pre>
          </div>

          <div class="cmd-block">
            <div class="cmd-label">{{ i18n.t('path.cwdSetupPermanentHint') }}</div>
            <div class="cmd-sub">~/.bashrc</div>
            <pre class="cmd-code">{{ bashSnippet }}</pre>
            <div class="cmd-sub">~/.zshrc</div>
            <pre class="cmd-code">{{ zshSnippet }}</pre>
          </div>

          <p class="dialog-note">{{ i18n.t('path.cwdSetupNote') }}</p>
        </div>
        <div class="dialog-buttons">
          <button type="button" class="btn-primary" (click)="choose.emit('session')">
            {{ i18n.t('path.cwdSetupSession') }}
          </button>
          <button type="button" class="btn-primary" (click)="choose.emit('permanent')">
            {{ i18n.t('path.cwdSetupPermanent') }}
          </button>
          <button type="button" (click)="choose.emit('cancel')">{{ i18n.t('app.cancel') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px; padding: 16px;
      min-width: min(480px, 94vw); max-width: 94vw;
      max-height: min(88vh, 640px);
      overflow: auto;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .dialog-title {
      font-weight: 700; margin-bottom: 10px; color: var(--_primary); font-size: 14px;
    }
    .dialog-body {
      font-size: 12px; color: var(--_text); line-height: 1.5; margin-bottom: 14px;
    }
    .dialog-body > p { margin: 0 0 10px; }
    .cmd-block { margin-bottom: 12px; }
    .cmd-label { font-weight: 600; margin-bottom: 4px; }
    .cmd-sub {
      font-size: 11px; opacity: 0.7; margin: 6px 0 3px;
      font-family: ui-monospace, Consolas, monospace;
    }
    .cmd-code {
      margin: 0;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text);
      font-size: 11px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-all;
      font-family: ui-monospace, Consolas, "Courier New", monospace;
      user-select: text;
    }
    .dialog-note {
      opacity: 0.72; font-size: 11px; margin: 0 !important;
    }
    .dialog-buttons {
      display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px;
    }
    .dialog-buttons button {
      padding: 5px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer; font-size: 12px;
    }
    .dialog-buttons .btn-primary {
      border-color: var(--_primary);
      background: rgba(59,130,246,0.14);
      color: var(--_primary);
    }
  `],
})
export class SftpCwdSetupDialogComponent implements OnChanges, OnDestroy {
  /** ★ 2026-10-13 P1 修复：焦点陷阱用——overlay 根元素 */
  @ViewChild('overlayEl', { static: false }) overlayEl?: ElementRef<HTMLDivElement>

  /** ★ 2026-10-13 P1 修复：打开时把焦点移入 overlay——焦点陷阱（Tab 循环）只在焦点位于
   *  对话框内时生效；此前打开后焦点留在背后的文件列表，Tab 会操作背景控件（幽灵交互）。 */
  private _focusTimer: ReturnType<typeof setTimeout> | null = null

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null }
      if (this.visible) {
        this._focusTimer = setTimeout(() => {
          this._focusTimer = null
          this.overlayEl?.nativeElement?.focus()
        })
      }
    }
  }

  ngOnDestroy(): void {
    if (this._focusTimer) { clearTimeout(this._focusTimer); this._focusTimer = null }
  }

  /** ★ 2026-10-13 P1 修复：Tab/Shift+Tab 在对话框内循环，不逃逸到背景（幽灵交互）。
   *   Esc 由宿主 Esc 栈处理（cwdSetupVisible 分支）。 */
  onOverlayKeydown(event: KeyboardEvent): void {
    handleOverlayKeydown(event, this.overlayEl?.nativeElement)
  }
  @Input() visible = false
  @Input() i18n!: SftpI18nService
  @Output() choose = new EventEmitter<CwdSetupChoice>()

  readonly sessionCmd = CWD_SESSION_CMD
  readonly bashSnippet = CWD_BASH_SNIPPET
  readonly zshSnippet = CWD_ZSH_SNIPPET

  onBackdrop(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.choose.emit('cancel')
  }
}

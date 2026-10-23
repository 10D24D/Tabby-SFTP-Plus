/**
 * SFTP+ 输入对话框（从主面板抽离）
 * @创建人：DD1024z + Auto(未确认底层模型)
 * @创建时间：2026-07-07
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — 2026-10-19 全量审计 P2-21 三项：
 *              ① 补 maxlength（默认 255，可由父级 @Input 覆盖）——此前 300 字节的名字要一路
 *              走到底层 ENAMETOOLONG 才报错，输入阶段毫无提示。
 *              ② 非法字符**即时提示**：含路径分隔符/控制字符时在输入框下方给出 i18n 提示。
 *              刻意只取各平台非法集的**交集**（Windows 独有非法字符在 POSIX 远程上是合法名，
 *              标红属误报），且只提示、不拦截确认（保持既有确认语义不变）。
 *              ③ IME 组字中的 Enter 原经 `(keyup.enter)` 被当成确认：Chrome 在组字提交时
 *              先发 compositionend、再发 key='Enter' 的 keyup ⇒ 用户只是想「选候选词」却被
 *              确认掉。改在 **keydown** 上判定（组字态 keydown 的 isComposing/keyCode 229 是
 *              硬事实），并用 compositionstart/end 维护 _composing 双保险。
 *              2026-10-13 — P1 修复：输入框对话框补 Tab 焦点陷阱（onKeyDown 收口到
 *              dialog-focus helper）——此前无陷阱，Shift+Tab 可逃逸到背景控件，
 *              在模态背后触发暂停/取消传输的幽灵交互。Enter 不劫持（焦点在输入框内时
 *              原生回车即确认，见 onEnter）。
 *              2026-09-21 — 清理可见性切换与销毁后的焦点定时器
 */
import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, SimpleChanges, OnChanges, OnDestroy } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { handleOverlayKeydown } from './dialog-focus'

/** 名字里任何平台都不允许的字符：路径分隔符 + 控制字符（见 invalidCharHint 注释） */
const ILLEGAL_NAME_RE = /[\\/\x00-\x1f]/

@Component({
  selector: 'sftp-input-dialog',
  template: `
    <div class="overlay" #overlayEl *ngIf="visible" tabindex="-1" (keydown)="onKeyDown($event)">
      <div class="dialog">
        <div class="dialog-title">{{ title }}</div>
        <input #inputEl class="dialog-input" [class.no-focus-highlight]="!focusHighlight"
          [ngModel]="value"
          (ngModelChange)="valueChange.emit($event)"
          [placeholder]="placeholder"
          [attr.maxlength]="maxLength"
          (compositionstart)="onCompositionStart()"
          (compositionend)="onCompositionEnd()"
          (keydown.enter)="onEnter($event)" />
        <div class="dialog-hint" *ngIf="invalidCharHint">{{ invalidCharHint }}</div>
        <div class="dialog-buttons">
          <button (click)="confirm.emit()" [disabled]="!value.trim()">{{ i18n.t('app.confirm') }}</button>
          <button (click)="cancel.emit()">{{ i18n.t('app.cancel') }}</button>
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
    .dialog-input {
      width: 100%; padding: 6px 8px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_input-bg);
      color: var(--_text); font-size: 12px;
      caret-color: var(--_text, currentColor);
      -webkit-text-fill-color: var(--_text, currentColor);
      cursor: text;
      user-select: text !important;
      -webkit-user-select: text !important;
      margin-bottom: 12px; box-sizing: border-box; outline: none;
    }
    .dialog-input::placeholder {
      color: var(--_text);
      opacity: 0.45;
    }
    .dialog-input::-webkit-input-placeholder {
      color: var(--_text);
      opacity: 0.45;
    }
    .dialog-input:focus,
    .dialog-input:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35) !important;
      outline: none !important;
    }
    .dialog-input.no-focus-highlight:focus,
    .dialog-input.no-focus-highlight:focus-visible {
      border-color: var(--_border) !important;
      box-shadow: none !important;
    }
    /* ★ 2026-10-19 P2-21：非法字符即时提示。只提示、不改确认语义，故用弱化色 */
    .dialog-hint {
      font-size: 11px; line-height: 1.4; margin: -8px 0 10px 0;
      color: #f0a030; word-break: break-all;
    }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .dialog-buttons button:disabled { opacity: 0.4; cursor: default; }
  `],
})
export class SftpInputDialogComponent implements OnChanges, OnDestroy {
  @Input() visible = false
  @Input() title = ''
  @Input() value = ''
  @Input() placeholder = ''
  /** 重命名时输入框自动聚焦，但不需要额外的高亮描边 */
  @Input() focusHighlight = true
  /** ★ 2026-10-19 P2-21：输入上限（新建/重命名都是单级名字，255 足够；父级可覆盖） */
  @Input() maxLength = 255

  @Output() valueChange = new EventEmitter<string>()
  @Output() confirm = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  @ViewChild('overlayEl') overlayEl!: ElementRef<HTMLElement>
  @ViewChild('inputEl') inputEl!: ElementRef<HTMLInputElement>
  private _focusTimer: ReturnType<typeof setTimeout> | null = null

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this._focusTimer) {
        clearTimeout(this._focusTimer)
        this._focusTimer = null
      }
      if (this.visible) {
        // ★ 2026-10-19：对话框可能在组字未结束时被关掉，重开时先复位组字态，
        //   否则 _composing 会一直挂着 true，Enter 永远被当成「组字中」而不确认。
        this._composing = false
        // ★ 2026-07-25：聚焦输入框本身（而非遮罩层），确保打开新建/重命名对话框即可直接键入。
        //   仅聚焦、不 select() 全选文本（重命名时保留原名不被整体选中，光标落在末尾）。
        this._focusTimer = setTimeout(() => {
          this._focusTimer = null
          this.inputEl?.nativeElement?.focus()
        })
      }
    }
  }

  ngOnDestroy(): void {
    if (this._focusTimer) clearTimeout(this._focusTimer)
    this._focusTimer = null
  }

  /**
   * ★ 2026-10-19 P2-21：非法字符即时提示文案（空串 = 合法，不渲染提示行）。
   * 只取各平台非法集的**交集**：路径分隔符（/ 与 Windows 的 \）和控制字符在任何平台上都不可能
   * 是名字的一部分；而 `: * ? " < > |` 只在 Windows 上非法，POSIX 远程上是合法文件名，
   * 标出来属于误报。提示仅作提醒，**不拦截确认**（既有确认语义保持不变）。
   */
  get invalidCharHint(): string {
    if (!this.value) return ''
    return ILLEGAL_NAME_RE.test(this.value)
      ? this.i18n.t('app.invalidNameChars')
      : ''
  }

  /** IME 组字态（compositionstart → true，compositionend → false） */
  private _composing = false
  onCompositionStart(): void { this._composing = true }
  onCompositionEnd(): void { this._composing = false }

  /**
   * ★ 2026-10-19 P2-21：Enter 确认原本挂在 `(keyup.enter)` 上 —— 中文/日文等 IME 组字时按
   * Enter 只是在**选候选词**，但 Chrome 会先发 compositionend、再发一个 key='Enter' 的 keyup
   * （此时 isComposing 已是 false、_composing 也已清）⇒ 组字中的 Enter 被当成确认提交。
   * 改到 keydown 上判定：组字态的 keydown 是 keyCode 229 / isComposing=true，属于事件自带的
   * 硬事实，不需要时间窗口；_composing 作为 composition 事件顺序不同浏览器有差异时的双保险。
   */
  onEnter(ev?: KeyboardEvent): void {
    if (this._composing) return
    if (ev && (ev.isComposing || (ev as unknown as { keyCode?: number }).keyCode === 229)) return
    if (this.value.trim()) this.confirm.emit()
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.cancel.emit() }
    // ★ 2026-10-13 P1 修复：Tab 焦点陷阱——输入框对话框此前无陷阱，
    //   Shift+Tab 可逃逸到背景控件（模态背后幽灵交互）。Enter 不劫持
    //   （焦点在输入框内时原生回车即确认，见 onEnter）。
    handleOverlayKeydown(event, this.overlayEl?.nativeElement)
  }
}

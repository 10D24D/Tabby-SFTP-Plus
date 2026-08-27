/**
 * SFTP+ 文本文件编辑对话框（本地 / 远程）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-05
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-05 — 新增「复制」按钮（复制当前编辑框内容）
 *              2026-08-10 — 新增「复制选中」按钮（有选中内容时显示，复制当前选中文本）
 *              2026-08-10 — 复制选中按钮消失修复(click/blur事件)
 *              2026-08-26 — 右键菜单卡顿：OnPush + zone 外原生 contextmenu + 选区检测禁 slice
 */
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'
import { copyTextToClipboard } from './clipboard-copy'
import { TextMenuAction } from './sftp-text-context-menu.component'

import { log } from '../../services/sftp-logger'

/** 仅比较 selectionStart/End，禁止 slice 大选区（大文件全选时右键会卡死） */
function textareaHasSelection(ta?: ElementRef<HTMLTextAreaElement>): boolean {
  if (!ta) return false
  const el = ta.nativeElement
  return (el.selectionStart ?? 0) !== (el.selectionEnd ?? 0)
}

function textareaSelectedText(ta?: ElementRef<HTMLTextAreaElement>): string {
  if (!ta) return ''
  const el = ta.nativeElement
  const s = el.selectionStart ?? 0
  const e = el.selectionEnd ?? 0
  if (s === e) return ''
  return el.value.slice(s, e)
}

@Component({
  selector: 'sftp-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" *ngIf="visible" (wheel)="onOverlayWheel($event)" (click)="onOverlayClick($event)">
      <div class="dialog file-dialog-shell" [class.is-maximized]="maximized">
        <div class="dialog-title">
          <div class="file-dialog-title-wrap">
            <span class="file-dialog-title">{{ i18n.t('file.edit') }} — {{ fileName }}</span>
            <span class="editor-dirty" *ngIf="dirty">*</span>
          </div>
          <div class="file-dialog-window-btns">
            <button type="button" class="file-dialog-win-btn"
              (click)="toggleMaximize()"
              [disabled]="saving"
              [title]="maximized ? i18n.t('app.restore') : i18n.t('app.maximize')">
              <svg *ngIf="!maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="1.5" y="1.5" width="9" height="9" rx="0.5"/>
              </svg>
              <svg *ngIf="maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="3.5" y="1.5" width="7" height="7" rx="0.5"/>
                <path d="M1.5 3.5h6.5v6.5H1.5z"/>
              </svg>
            </button>
            <button type="button" class="file-dialog-win-btn"
              (click)="onCloseClick()"
              [disabled]="saving" [title]="i18n.t('app.close')">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="file-dialog-path" *ngIf="displayPath">{{ displayPath }}</div>
        <div class="file-dialog-body editor-body">
          <div class="file-dialog-status" *ngIf="loading">{{ i18n.t('viewer.loading') }}</div>
          <div class="file-dialog-status file-dialog-error" *ngIf="!loading && error">{{ error }}</div>
          <textarea #editorTextarea class="file-dialog-textarea"
            *ngIf="!loading && !error"
            (wheel)="onScrollableWheel($event)"
            (mouseup)="updateHasSelection()" (keyup)="updateHasSelection()"
            (select)="updateHasSelection()" (click)="updateHasSelection()"
            (blur)="onTextareaBlur()"
            [ngModel]="content"
            (ngModelChange)="onContentChange($event)"
            [readonly]="saving"
            spellcheck="false"></textarea>
        </div>
        <div class="dialog-buttons">
          <span class="dialog-buttons-left">
            <button type="button" class="file-dialog-system-btn" *ngIf="showSystemAction"
              (click)="systemAction.emit()" [disabled]="loading || saving || !!error"
              [title]="i18n.t('file.editInSystem')">
              {{ i18n.t('file.editInSystem') }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              (click)="copy()" [disabled]="loading || saving || !!error || !canCopy"
              [title]="i18n.t('file.copy')">
              {{ copyLabel }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              *ngIf="hasSelectionText"
              (mousedown)="$event.preventDefault()"
              (click)="copySelection()" [disabled]="loading || saving || !!error"
              [title]="i18n.t('file.copySelection')">
              {{ copiedSel ? i18n.t('file.copied') : i18n.t('file.copySelection') }}
            </button>
          </span>
          <button type="button" class="btn-primary" (click)="save.emit()" [disabled]="loading || saving || !!error || !dirty">
            {{ saving ? i18n.t('editor.saving') : i18n.t('editor.save') }}
          </button>
          <button type="button" (click)="cancel.emit()" [disabled]="saving">{{ i18n.t('app.cancel') }}</button>
        </div>
      </div>

      <sftp-text-context-menu
        [i18n]="i18n"
        [visible]="textMenuVisible"
        [x]="textMenuX" [y]="textMenuY"
        [mode]="'text'"
        [editable]="true"
        [hasSelection]="textMenuHasSelection"
        [canPaste]="textMenuCanPaste"
        (action)="onTextMenuAction($event)"
        (close)="onTextMenuClose()">
      </sftp-text-context-menu>
    </div>
  `,
  styles: [FILE_DIALOG_SHARED_STYLES],
})
export class SftpEditorDialogComponent implements OnChanges, OnDestroy, AfterViewChecked {
  private static readonly MAXIMIZED_KEY = 'sftp-plus-editor-maximized'

  @ViewChild('editorTextarea') private editorTextarea?: ElementRef<HTMLTextAreaElement>

  @Input() visible = false
  @Input() loading = false
  @Input() saving = false
  @Input() dirty = false
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() content = ''
  @Input() error = ''
  @Input() showSystemAction = false

  copied = false
  private copyTimer?: any
  copiedSel = false
  private copySelTimer?: any
  hasSelectionText = false

  textMenuVisible = false
  textMenuX = 0
  textMenuY = 0
  textMenuHasSelection = false
  textMenuCanPaste = false

  @Output() contentChange = new EventEmitter<string>()
  @Output() save = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()
  @Output() systemAction = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  maximized = SftpEditorDialogComponent.loadMaximized()

  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  private _ctxTarget: HTMLElement | null = null
  private readonly _onNativeContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()
    // ★ zone 外打开菜单：只刷新本对话框视图，避免整棵浮动面板 CD 造成右键卡顿
    this.textMenuHasSelection = textareaHasSelection(this.editorTextarea)
    this.textMenuCanPaste = !!(navigator.clipboard && (navigator.clipboard as any).readText)
    this.textMenuX = ev.clientX
    this.textMenuY = ev.clientY
    this.textMenuVisible = true
    this.cdr.detectChanges()
  }

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpEditorDialogComponent.loadMaximized()
    }
    if (changes['visible']?.currentValue === false) {
      this.textMenuVisible = false
      this._unbindCtxTarget()
    }
    this.cdr.markForCheck()
  }

  ngAfterViewChecked(): void {
    const target = (!this.loading && !this.error && this.editorTextarea?.nativeElement) || null
    this._bindCtxTarget(target)
  }

  ngOnDestroy(): void {
    this._unbindCtxTarget()
    if (this.copyTimer) clearTimeout(this.copyTimer)
    if (this.copySelTimer) clearTimeout(this.copySelTimer)
  }

  private _bindCtxTarget(el: HTMLElement | null): void {
    if (this._ctxTarget === el) return
    this._unbindCtxTarget()
    if (!el) return
    this._ctxTarget = el
    this.zone.runOutsideAngular(() => {
      el.addEventListener('contextmenu', this._onNativeContextMenu, true)
    })
  }

  private _unbindCtxTarget(): void {
    if (!this._ctxTarget) return
    this._ctxTarget.removeEventListener('contextmenu', this._onNativeContextMenu, true)
    this._ctxTarget = null
  }

  onContentChange(value: string): void {
    this.hasSelectionText = false
    this.contentChange.emit(value)
  }

  copy(): void {
    const ok = copyTextToClipboard(this.content || '')
    if (ok) this.showCopiedFeedback()
  }

  copySelection(): void {
    const sel = textareaSelectedText(this.editorTextarea)
    if (!sel) return
    if (copyTextToClipboard(sel)) {
      this.copiedSel = true
      if (this.copySelTimer) clearTimeout(this.copySelTimer)
      this.copySelTimer = setTimeout(() => { this.copiedSel = false; this.cdr.markForCheck() }, 1500)
      this.cdr.markForCheck()
    }
  }

  updateHasSelection(): void {
    const next = textareaHasSelection(this.editorTextarea)
    if (next === this.hasSelectionText) return
    this.hasSelectionText = next
    this.cdr.markForCheck()
  }

  onTextareaBlur(): void {
    if (!this.hasSelectionText) return
    this.hasSelectionText = false
    this.cdr.markForCheck()
  }

  onTextMenuAction(a: TextMenuAction): void {
    switch (a) {
      case 'copySelection': this.copySelection(); break
      case 'copyAll': this.copy(); break
      case 'selectAll':
        if (this.editorTextarea) {
          this.editorTextarea.nativeElement.focus()
          this.editorTextarea.nativeElement.select()
          this.updateHasSelection()
        }
        break
      case 'cut': this.cutSelection(); break
      case 'paste': void this.pasteText(); break
      default: break
    }
    this.textMenuVisible = false
    this.cdr.markForCheck()
  }

  onTextMenuClose(): void {
    if (!this.textMenuVisible) return
    this.textMenuVisible = false
    this.cdr.markForCheck()
  }

  onOverlayClick(ev: MouseEvent): void {
    if (!this.textMenuVisible) return
    const target = ev.target as HTMLElement | null
    if (target?.closest('.text-ctx-menu')) return
    this.textMenuVisible = false
    this.cdr.markForCheck()
  }

  private cutSelection(): void {
    const ta = this.editorTextarea?.nativeElement
    if (!ta) return
    const s = ta.selectionStart ?? 0
    const e = ta.selectionEnd ?? 0
    if (s === e) return
    const sel = ta.value.slice(s, e)
    if (copyTextToClipboard(sel)) {
      const newVal = ta.value.slice(0, s) + ta.value.slice(e)
      this.contentChange.emit(newVal)
      Promise.resolve().then(() => {
        const el = this.editorTextarea?.nativeElement
        if (el) { el.setSelectionRange(s, s); el.focus() }
      })
    }
  }

  private async pasteText(): Promise<void> {
    const ta = this.editorTextarea?.nativeElement
    if (!ta || !(navigator.clipboard && (navigator.clipboard as any).readText)) return
    let text = ''
    try { text = await (navigator.clipboard as any).readText() } catch { return }
    if (!text) return
    const s = ta.selectionStart ?? ta.value.length
    const e = ta.selectionEnd ?? ta.value.length
    const newVal = ta.value.slice(0, s) + text + ta.value.slice(e)
    this.contentChange.emit(newVal)
    const pos = s + text.length
    Promise.resolve().then(() => {
      const el = this.editorTextarea?.nativeElement
      if (el) { el.setSelectionRange(pos, pos); el.focus() }
    })
  }

  get canCopy(): boolean {
    return !!this.content
  }

  get copyLabel(): string {
    return this.copied ? this.i18n.t('file.copied') : this.i18n.t('file.copy')
  }

  private showCopiedFeedback(): void {
    this.copied = true
    if (this.copyTimer) clearTimeout(this.copyTimer)
    this.copyTimer = setTimeout(() => { this.copied = false; this.cdr.markForCheck() }, 1500)
    this.cdr.markForCheck()
  }

  toggleMaximize(): void {
    if (this.saving) return
    this.maximized = !this.maximized
    SftpEditorDialogComponent.saveMaximized(this.maximized)
  }

  onCloseClick(): void {
    if (!this.saving) this.cancel.emit()
  }

  private static loadMaximized(): boolean {
    try {
      return localStorage.getItem(SftpEditorDialogComponent.MAXIMIZED_KEY) === 'true'
    } catch (e) {
      log.warn('loadMaximized failed', e)
      return false
    }
  }

  private static saveMaximized(value: boolean): void {
    try {
      localStorage.setItem(SftpEditorDialogComponent.MAXIMIZED_KEY, value ? 'true' : 'false')
    } catch (e) { log.warn('saveMaximized failed', e) }
  }
}

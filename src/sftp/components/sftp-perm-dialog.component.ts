/**
 * SFTP+ 权限编辑对话框（从主面板抽离）
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-16 — 视觉改进（用户反馈「太素，想做成文件属性那样有图标」）：
 *              ① 头部改为「图标 + 名称 + 路径」三件套，与 sftp-details-dialog 的
 *                 details-head 完全同构（同一个彩色 SVG 来源 resolveDetailsIcon，
 *                 回退同一套内置线条图标）⇒ 两个对话框视觉语言统一；
 *              ② 权限值一行补上**符号形式**（rw-r--r--），与属性对话框里
 *                 「权限 rw-r--r-- (644)」的读法一致；八进制仍是主值（网格编辑的本来就是位）；
 *              ③ 网格加表头分隔线 + 行悬停高亮 + 首列左对齐留白，勾选框 18px 与主题主色对齐。
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { handleOverlayKeydown } from './dialog-focus'

export type PermField =
  | 'ownerRead' | 'ownerWrite' | 'ownerExec'
  | 'groupRead' | 'groupWrite' | 'groupExec'
  | 'otherRead' | 'otherWrite' | 'otherExec'

@Component({
  selector: 'sftp-perm-dialog',
  template: `
    <div class="overlay" #overlayEl *ngIf="visible" tabindex="-1" (keydown)="onOverlayKeydown($event)">
      <div class="dialog perm-dialog">
        <div class="dialog-title">{{ i18n.t('permission.title') }}</div>

        <!-- ★ 2026-10-16：头部与「文件属性」同构（图标 + 名称 + 路径） -->
        <div class="perm-head">
          <span class="perm-head-icon" [class.is-folder]="isDir" [class.is-file]="!isDir">
            <img *ngIf="iconUrl" class="perm-head-icon-img" [src]="iconUrl" [alt]="targetName" draggable="false" />
            <svg *ngIf="!iconUrl" width="26" height="26" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
              <path *ngIf="isDir" d="M1.5 5.5C1.5 4.67 2.17 4 3 4h2.67L7 6h6c.83 0 1.5.67 1.5 1.5v5c0 .83-.67 1.5-1.5 1.5H3c-.83 0-1.5-.67-1.5-1.5v-6z"/>
              <ng-container *ngIf="!isDir">
                <path d="M5 1.5h4.5L13 5v9.5H5c-.55 0-1-.45-1-1V2.5c0-.55.45-1 1-1z"/>
                <path d="M9.5 1.5V5H13"/>
                <line x1="6.5" y1="8" x2="11.5" y2="8"/>
                <line x1="6.5" y1="10" x2="11.5" y2="10"/>
                <line x1="6.5" y1="12" x2="9.5" y2="12"/>
              </ng-container>
            </svg>
          </span>
          <div class="perm-head-info">
            <div class="perm-head-name">{{ targetName }}</div>
            <div class="perm-head-path" *ngIf="targetPath">{{ targetPath }}</div>
          </div>
        </div>

        <!-- ★ 2026-10-16：矩阵改用 table（与「文件属性」的 .details-table 同构）——
             行分隔线连续、对齐天然正确，比 div grid 靠 justify-items 凑中心更稳，
             也与属性对话框的视觉语言一致。 -->
        <table class="perm-table">
          <thead>
            <tr>
              <th class="perm-th-label"></th>
              <th>{{ i18n.t('permission.read') }}</th>
              <th>{{ i18n.t('permission.write') }}</th>
              <th>{{ i18n.t('permission.execute') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="perm-td-label">{{ i18n.t('permission.owner') }}</td>
              <td><input type="checkbox" [ngModel]="ownerRead" (ngModelChange)="onPermChange('ownerRead', $event)" /></td>
              <td><input type="checkbox" [ngModel]="ownerWrite" (ngModelChange)="onPermChange('ownerWrite', $event)" /></td>
              <td><input type="checkbox" [ngModel]="ownerExec" (ngModelChange)="onPermChange('ownerExec', $event)" /></td>
            </tr>
            <tr>
              <td class="perm-td-label">{{ i18n.t('permission.group') }}</td>
              <td><input type="checkbox" [ngModel]="groupRead" (ngModelChange)="onPermChange('groupRead', $event)" /></td>
              <td><input type="checkbox" [ngModel]="groupWrite" (ngModelChange)="onPermChange('groupWrite', $event)" /></td>
              <td><input type="checkbox" [ngModel]="groupExec" (ngModelChange)="onPermChange('groupExec', $event)" /></td>
            </tr>
            <tr>
              <td class="perm-td-label">{{ i18n.t('permission.others') }}</td>
              <td><input type="checkbox" [ngModel]="otherRead" (ngModelChange)="onPermChange('otherRead', $event)" /></td>
              <td><input type="checkbox" [ngModel]="otherWrite" (ngModelChange)="onPermChange('otherWrite', $event)" /></td>
              <td><input type="checkbox" [ngModel]="otherExec" (ngModelChange)="onPermChange('otherExec', $event)" /></td>
            </tr>
          </tbody>
        </table>

        <!-- ★ 2026-10-16：八进制仍是主值（网格编辑的就是位），右侧补符号形式，
             与「文件属性」里 rw-r--r-- (644) 的读法一致 -->
        <div class="perm-preview">
          <span class="perm-preview-label">{{ i18n.t('permission.mode') }}</span>
          <span class="perm-preview-octal">{{ modePreview }}</span>
          <span class="perm-preview-symbolic">{{ symbolicMode }}</span>
        </div>
        <div class="dialog-buttons">
          <button (click)="confirm.emit()" [disabled]="!targetPath">{{ i18n.t('app.confirm') }}</button>
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
      outline: none;
    }
    .dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px; padding: 16px; min-width: 280px; max-width: 92vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .dialog-title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; margin-bottom: 12px; color: var(--_primary); }
    .perm-dialog { min-width: 380px; }

    /* ★ 2026-10-16：头部与 sftp-details-dialog 的 .details-head 同构 —— 两个对话框
       展示的是同一个对象，视觉语言必须一致（图标尺寸/配色/分隔线都对齐）。 */
    .perm-head {
      display: flex; align-items: center; gap: 10px;
      padding: 2px 2px 10px; margin-bottom: 4px;
      border-bottom: 1px solid var(--_border, #334155);
    }
    .perm-head-icon { flex-shrink: 0; display: flex; align-items: center; }
    .perm-head-icon.is-folder { color: #f0c040; opacity: 0.95; }
    .perm-head-icon.is-file { color: #8ab4f8; opacity: 0.9; }
    .perm-head-icon-img { width: 26px; height: 26px; object-fit: contain; }
    .perm-head-info { min-width: 0; }
    .perm-head-name { font-weight: 600; font-size: 13px; word-break: break-all; color: var(--_text); }
    .perm-head-path {
      font-family: monospace; font-size: 11px; opacity: 0.62;
      word-break: break-all; margin-top: 2px;
    }

    /* ★ 2026-10-16：矩阵表格 —— 与 .details-table 同构（行分隔线 + 表头底线），
       行悬停高亮让「正在改哪一行」一眼可见。 */
    .perm-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0 12px; }
    .perm-table th {
      font-weight: 600; font-size: 12px; color: var(--_primary);
      padding: 2px 6px 6px; text-align: center;
      border-bottom: 1px solid var(--_border);
    }
    .perm-table th.perm-th-label { text-align: left; }
    .perm-table td {
      padding: 5px 6px; text-align: center;
      border-bottom: 1px solid var(--_border);
      color: var(--_text);
    }
    .perm-table tbody tr:last-child td { border-bottom: none; }
    .perm-table td.perm-td-label { text-align: left; font-weight: 600; }
    /* 鼠标悬停高亮整行（表格下比 grid 更自然，不用拆成 12 个单元格各自判断） */
    .perm-table tbody tr:hover td { background: var(--_input-bg); }
    .perm-table input[type="checkbox"] {
      width: 18px; height: 18px; accent-color: var(--_primary);
      cursor: pointer; margin: 0; vertical-align: middle;
    }
    /* ★ 2026-10-16：权限值一行**不加包裹框**（用户反馈「不需要一个边框包裹着」）——
       去掉了原来的 --_input-bg 底 + 边框 + 圆角，只留一行文字：
       八进制用主色加粗做视觉锚点，符号形式作补充，与表格同宽左对齐。
       强调靠字重/颜色，不靠盒子，界面更轻。 */
    .perm-preview {
      display: flex; align-items: center; gap: 10px;
      font-family: monospace; font-size: 13px;
      color: var(--_text); margin-bottom: 10px;
    }
    .perm-preview-label { font-family: inherit; font-size: 12px; opacity: 0.72; }
    .perm-preview-octal { font-weight: 700; color: var(--_primary); letter-spacing: 0.5px; }
    .perm-preview-symbolic { opacity: 0.72; letter-spacing: 0.5px; }
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
export class SftpPermDialogComponent implements OnChanges, OnDestroy {
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

  /** ★ 2026-10-13 P1 修复：Tab/Shift+Tab 在对话框内循环，不逃逸到背景（幽灵交互）；
   *   Enter 不劫持（焦点在按钮上时原生激活，行为本就正确）。Esc 由宿主 Esc 栈处理。 */
  onOverlayKeydown(event: KeyboardEvent): void {
    handleOverlayKeydown(event, this.overlayEl?.nativeElement)
  }
  @Input() visible = false
  @Input() targetName = ''
  @Input() targetPath = ''
  /** ★ 2026-10-16：头部图标用（与属性对话框同源；均为可选，缺省回退内置线条图标） */
  @Input() isDir = false
  @Input() iconUrl: string | null = null
  @Input() ownerRead = false
  @Input() ownerWrite = false
  @Input() ownerExec = false
  @Input() groupRead = false
  @Input() groupWrite = false
  @Input() groupExec = false
  @Input() otherRead = false
  @Input() otherWrite = false
  @Input() otherExec = false
  @Input() modePreview = ''

  @Output() permChange = new EventEmitter<{ field: PermField; value: boolean }>()
  @Output() confirm = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  /**
   * ★ 2026-10-16：由九个勾选位推导 `rw-r--r--` 形式，供预览行显示。
   *   纯展示派生（不改任何状态），与八进制主值并排，读法与「文件属性」一致。
   */
  get symbolicMode(): string {
    const b = (on: boolean, ch: string): string => (on ? ch : '-')
    return b(this.ownerRead, 'r') + b(this.ownerWrite, 'w') + b(this.ownerExec, 'x')
      + b(this.groupRead, 'r') + b(this.groupWrite, 'w') + b(this.groupExec, 'x')
      + b(this.otherRead, 'r') + b(this.otherWrite, 'w') + b(this.otherExec, 'x')
  }

  onPermChange(field: PermField, value: boolean): void {
    this.permChange.emit({ field, value })
  }
}

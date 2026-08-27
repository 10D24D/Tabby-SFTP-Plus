/**
 * SFTP+ 文本/图片查看·编辑对话框的轻量右键菜单
 * 功能描述：为查看（只读）/编辑（可写）对话框的 textarea / 图片提供右键菜单，
 *            支持 复制选中 / 复制全部 / 复制图片 / 复制地址 / 全选 / 剪切 / 粘贴。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-24
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-26 — 关闭机制最终定案：overlay 模板 (click)；本组件只保留 Esc/滚轮/缩放
 *              2026-08-26 — OnPush + 仅在 visible 时挂 document 监听，避免无菜单时每个
 *                            keydown/wheel 都脏检查；配合父对话框区外打开菜单消卡顿
 */
import {
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

export type TextMenuAction =
  | 'copySelection' | 'copyAll' | 'copyAddress' | 'cut' | 'paste' | 'selectAll'

@Component({
  selector: 'sftp-text-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text-ctx-menu" #menuEl *ngIf="visible"
      [style.left]="x + 'px'" [style.top]="y + 'px'">
      <!-- 文本模式 -->
      <ng-container *ngIf="mode === 'text'">
        <div class="tctx-item" [class.tctx-disabled]="!hasSelection"
          (click)="do('copySelection')">{{ i18n.t('file.copySelection') }}</div>
        <div class="tctx-item" (click)="do('copyAll')">{{ i18n.t('file.copyAll') }}</div>
        <div class="tctx-item" (click)="do('selectAll')">{{ i18n.t('pane.selectAll') }}</div>
        <ng-container *ngIf="editable">
          <div class="tctx-sep"></div>
          <div class="tctx-item" [class.tctx-disabled]="!hasSelection"
            (click)="do('cut')">{{ i18n.t('file.cut') }}</div>
          <div class="tctx-item" [class.tctx-disabled]="!canPaste"
            (click)="do('paste')">{{ i18n.t('file.paste') }}</div>
        </ng-container>
      </ng-container>
      <!-- 图片模式 -->
      <ng-container *ngIf="mode === 'image'">
        <div class="tctx-item" [class.tctx-disabled]="!hasImage"
          (click)="do('copyAll')">{{ i18n.t('file.copyImage') }}</div>
        <div class="tctx-item" [class.tctx-disabled]="!hasAddress"
          (click)="do('copyAddress')">{{ i18n.t('file.copyImageAddress') }}</div>
      </ng-container>
    </div>
  `,
  styles: [`
    .text-ctx-menu {
      position: fixed;
      z-index: 903;
      background: var(--context-menu-background, var(--_bg, #ffffff));
      color: var(--context-menu-foreground, var(--_text, #1f2937));
      border: 1px solid var(--context-menu-border, var(--_border, #e5e7eb));
      border-radius: 6px;
      padding: 4px 0;
      min-width: 150px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
      font-size: 12px;
      user-select: none;
      overflow: visible;
    }
    .tctx-item {
      padding: 6px 14px;
      cursor: pointer;
      white-space: nowrap;
      line-height: 1.4;
    }
    .tctx-item:hover { background: var(--context-menu-selected-background, var(--_hover, rgba(128,128,128,0.12))); }
    .tctx-item.tctx-disabled {
      cursor: default;
      opacity: 0.45;
    }
    .tctx-item.tctx-disabled:hover { background: transparent; }
    .tctx-sep {
      height: 1px;
      background: var(--context-menu-separator, var(--_border, #e5e7eb));
      margin: 3px 0;
    }
  `],
})
export class SftpTextContextMenuComponent implements OnChanges, OnDestroy {
  @ViewChild('menuEl') menuEl?: ElementRef<HTMLDivElement>

  @Input() visible = false
  @Input() x = 0
  @Input() y = 0
  @Input() mode: 'text' | 'image' = 'text'
  @Input() editable = false
  @Input() hasSelection = false
  @Input() canPaste = false
  @Input() hasImage = false
  @Input() hasAddress = false

  @Output() action = new EventEmitter<TextMenuAction>()
  @Output() close = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  private _docListening = false
  private readonly _onKeyDown = (ev: KeyboardEvent): void => {
    if (!this.visible || ev.key !== 'Escape') return
    ev.preventDefault()
    ev.stopImmediatePropagation()
    this.zone.run(() => this.close.emit())
  }
  private readonly _onWheelOrResize = (): void => {
    if (!this.visible) return
    this.zone.run(() => this.close.emit())
  }

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (this.visible) this._attachDocListeners()
      else this._detachDocListeners()
    }
    this.cdr.markForCheck()
  }

  ngOnDestroy(): void {
    this._detachDocListeners()
  }

  /** 点击菜单项：先关闭再向上派发动作 */
  do(a: TextMenuAction): void {
    if (!this.editable && (a === 'cut' || a === 'paste')) return
    if ((a === 'copySelection' || a === 'cut') && !this.hasSelection) return
    if (a === 'paste' && !this.canPaste) return
    if ((a === 'copyAll' && this.mode === 'image') && !this.hasImage) return
    if (a === 'copyAddress' && !this.hasAddress) return
    this.close.emit()
    this.action.emit(a)
  }

  private _attachDocListeners(): void {
    if (this._docListening) return
    this._docListening = true
    // ★ 在 Angular zone 外挂监听：避免菜单打开期间每个 keydown/wheel 触发整树 CD
    this.zone.runOutsideAngular(() => {
      document.addEventListener('keydown', this._onKeyDown, true)
      document.addEventListener('wheel', this._onWheelOrResize, { capture: true, passive: true })
      window.addEventListener('resize', this._onWheelOrResize)
    })
  }

  private _detachDocListeners(): void {
    if (!this._docListening) return
    this._docListening = false
    document.removeEventListener('keydown', this._onKeyDown, true)
    document.removeEventListener('wheel', this._onWheelOrResize, true)
    window.removeEventListener('resize', this._onWheelOrResize)
  }
}

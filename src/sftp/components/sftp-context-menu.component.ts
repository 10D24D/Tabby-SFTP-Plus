/**
 * SFTP+ 右键菜单（文件列表 + 表头列配置）
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-12 — 重命名/删除菜单项增加快捷键提示（F2 / Del）
 *              2026-08-10 — 新增"以文本方式查看"菜单项（viewAsText，对未预定义文件类型显示）
 */
import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'

export type ContextMenuAction =
  | 'newFolder' | 'newFile' | 'rename' | 'delete'
  | 'openLocal' | 'viewFile' | 'viewAsText' | 'editFile' | 'upload' | 'download'
  | 'revealInExplorer' | 'chmod' | 'details'
  | 'copy' | 'cut' | 'paste' | 'refresh' | 'selectAll' | 'selectInvert' | 'copyPath'

export type HeaderMenuAction =
  | 'adjustCol' | 'adjustAllCols'
  | 'toggleCol:size' | 'toggleCol:date' | 'toggleCol:created' | 'toggleCol:access' | 'toggleCol:owner'
  | 'toggleCol:group' | 'toggleCol:perms' | 'toggleCol:mode' | 'toggleCol:path' | 'toggleCol:ext'
  | 'togglePinFolders' | 'toggleHidden' | 'toggleColBorders' | 'toggleZebra'

export type ColVisibilityState = {
  size: boolean
  date: boolean
  created: boolean
  access: boolean
  owner: boolean
  group: boolean
  perms: boolean
  mode: boolean
  path: boolean
  ext: boolean
}

@Component({
  selector: 'sftp-context-menu',
  template: `
    <div class="context-menu" #menuEl *ngIf="menuVisible"
      [style.left]="menuX + 'px'" [style.top]="menuY + 'px'">

      <!-- 1. 上传 / 下载 -->
      <div class="ctx-item" (click)="menuAction.emit('upload')" *ngIf="hasUpload">{{ i18n.t('app.upload') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('download')" *ngIf="hasDownload">{{ i18n.t('app.download') }}</div>
      <div class="ctx-sep" *ngIf="sepBeforeOpen"></div>

      <!-- 2. 打开 / 查看 / 编辑 / 在资源管理器中显示 -->
      <div class="ctx-item" (click)="menuAction.emit('openLocal')" *ngIf="hasLocalOpen">{{ i18n.t('file.open') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('viewFile')" *ngIf="hasView">{{ i18n.t('file.view') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('viewAsText')" *ngIf="hasViewAsText">{{ i18n.t('file.viewAsText') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('editFile')" *ngIf="hasEdit">{{ i18n.t('file.edit') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('revealInExplorer')" *ngIf="hasLocalReveal">{{ i18n.t('file.showInFolder') }}</div>
      <div class="ctx-sep" *ngIf="sepBeforeClipboard"></div>

      <!-- 3. 剪贴板 -->
      <div class="ctx-item" (click)="menuAction.emit('copy')" *ngIf="hasSelection">{{ i18n.t('file.copy') }}<span class="ctx-shortcut">{{ modKey }}C</span></div>
      <div class="ctx-item" (click)="menuAction.emit('cut')" *ngIf="hasSelection">{{ i18n.t('file.cut') }}<span class="ctx-shortcut">{{ modKey }}X</span></div>
      <div class="ctx-item" (click)="menuAction.emit('paste')" *ngIf="clipboardHasEntries">{{ i18n.t('file.paste') }}<span class="ctx-shortcut">{{ modKey }}V</span></div>
      <div class="ctx-sep" *ngIf="sepBeforeModify"></div>

      <!-- 4. 重命名 / 删除 -->
      <div class="ctx-item" (click)="menuAction.emit('rename')" *ngIf="singleSelected">{{ i18n.t('app.rename') }}<span class="ctx-shortcut">F2</span></div>
      <div class="ctx-item ctx-danger" *ngIf="hasSelection" (click)="menuAction.emit('delete')">{{ i18n.t('app.delete') }}<span class="ctx-shortcut">Del</span></div>
      <div class="ctx-sep" *ngIf="sepBeforeInfo"></div>

      <!-- 5. 权限 / 属性 -->
      <div class="ctx-item" (click)="menuAction.emit('chmod')" *ngIf="hasRemoteChmod">{{ i18n.t('permission.title') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('details')" *ngIf="entry">{{ i18n.t('file.properties') }}</div>
      <div class="ctx-sep" *ngIf="sepBeforeCreate"></div>

      <!-- 6. 新建 -->
      <div class="ctx-item" (click)="menuAction.emit('newFolder')" *ngIf="hasCreateActions">{{ i18n.t('file.newFolder') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('newFile')" *ngIf="hasCreateActions">{{ i18n.t('file.newFile') }}</div>
      <div class="ctx-sep" *ngIf="sepBeforePanel"></div>

      <!-- 7. 面板操作 -->
      <div class="ctx-item" (click)="menuAction.emit('refresh')">{{ i18n.t('app.refresh') }}<span class="ctx-shortcut">F5</span></div>
      <div class="ctx-item" (click)="menuAction.emit('selectAll')">{{ i18n.t('pane.selectAll') }}<span class="ctx-shortcut">{{ modKey }}A</span></div>
      <div class="ctx-item" (click)="menuAction.emit('selectInvert')">{{ i18n.t('pane.selectInvert') }}</div>
      <div class="ctx-item" (click)="menuAction.emit('copyPath')" *ngIf="hasSelection || entry">{{ i18n.t('pane.copyPath') }}</div>
    </div>

    <div class="context-menu" #headerMenuEl *ngIf="headerVisible"
      [style.left]="headerX + 'px'" [style.top]="headerY + 'px'">
      <div class="ctx-item" (click)="headerAction.emit('adjustCol')" *ngIf="headerCol"><span class="ctx-check"></span> {{ i18n.t('file.adjustCol') }}</div>
      <div class="ctx-item" (click)="headerAction.emit('adjustAllCols')"><span class="ctx-check"></span> {{ i18n.t('file.adjustAllCols') }}</div>
      <div class="ctx-sep"></div>
      <div class="ctx-item ctx-disabled"><span class="ctx-check">✓</span> {{ i18n.t('file.name') }}</div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:size')">
        <span class="ctx-check" *ngIf="cols.size">✓</span><span class="ctx-check" *ngIf="!cols.size"></span> {{ i18n.t('file.size') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:date')">
        <span class="ctx-check" *ngIf="cols.date">✓</span><span class="ctx-check" *ngIf="!cols.date"></span> {{ i18n.t('file.modified') }}
      </div>
      <div class="ctx-item" *ngIf="pane === 'local'" (click)="headerAction.emit('toggleCol:created')">
        <span class="ctx-check" *ngIf="cols.created">✓</span><span class="ctx-check" *ngIf="!cols.created"></span> {{ i18n.t('file.created') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:access')">
        <span class="ctx-check" *ngIf="cols.access">✓</span><span class="ctx-check" *ngIf="!cols.access"></span> {{ i18n.t('file.accessed') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:owner')">
        <span class="ctx-check" *ngIf="cols.owner">✓</span><span class="ctx-check" *ngIf="!cols.owner"></span> {{ i18n.t('file.owner') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:group')">
        <span class="ctx-check" *ngIf="cols.group">✓</span><span class="ctx-check" *ngIf="!cols.group"></span> {{ i18n.t('file.group') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:perms')">
        <span class="ctx-check" *ngIf="cols.perms">✓</span><span class="ctx-check" *ngIf="!cols.perms"></span> {{ i18n.t('file.permissions') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:mode')">
        <span class="ctx-check" *ngIf="cols.mode">✓</span><span class="ctx-check" *ngIf="!cols.mode"></span> {{ i18n.t('file.mode') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:path')">
        <span class="ctx-check" *ngIf="cols.path">✓</span><span class="ctx-check" *ngIf="!cols.path"></span> {{ i18n.t('file.path') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleCol:ext')">
        <span class="ctx-check" *ngIf="cols.ext">✓</span><span class="ctx-check" *ngIf="!cols.ext"></span> {{ i18n.t('file.ext') }}
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" (click)="headerAction.emit('togglePinFolders')">
        <span class="ctx-check" *ngIf="pinFolders">✓</span><span class="ctx-check" *ngIf="!pinFolders"></span> {{ i18n.t('pane.pinFolders') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleHidden')">
        <span class="ctx-check" *ngIf="showHidden">✓</span><span class="ctx-check" *ngIf="!showHidden"></span> {{ i18n.t('pane.showHidden') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleColBorders')">
        <span class="ctx-check" *ngIf="showColBorders">✓</span><span class="ctx-check" *ngIf="!showColBorders"></span> {{ i18n.t('view.colBorder') }}
      </div>
      <div class="ctx-item" (click)="headerAction.emit('toggleZebra')">
        <span class="ctx-check" *ngIf="showZebra">✓</span><span class="ctx-check" *ngIf="!showZebra"></span> {{ i18n.t('view.zebra') }}
      </div>
    </div>
  `,
  styles: [`
    .context-menu {
      position: fixed; z-index: 100001;
      background: var(--_bg); border: 1px solid var(--_border);
      border-radius: 6px; padding: 4px 0; min-width: 140px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .ctx-item {
      padding: 5px 14px; cursor: pointer; font-size: 12px;
      color: var(--_text); white-space: nowrap;
    }
    .ctx-check { display: inline-block; width: 14px; text-align: center; }
    .ctx-item:hover { background: var(--_hover); }
    .ctx-item.ctx-danger:hover { background: rgba(244,67,54,0.15); color: #f44336; }
    .ctx-sep { height: 1px; background: var(--_border, #334155); margin: 3px 0; }
    .ctx-item.ctx-disabled { cursor: default; opacity: 0.5; }
    .ctx-item.ctx-disabled:hover { background: transparent; }
    .ctx-shortcut { float: right; margin-left: 20px; opacity: 0.5; font-size: 11px; }
  `],
})
export class SftpContextMenuComponent implements OnChanges {
  @ViewChild('menuEl') menuEl!: ElementRef<HTMLElement>
  @ViewChild('headerMenuEl') headerMenuEl!: ElementRef<HTMLElement>

  @Input() menuVisible = false
  @Input() menuX = 0
  @Input() menuY = 0
  @Input() pane: 'local' | 'remote' = 'local'
  @Input() entry: any = null
  @Input() hasSelection = false
  @Input() singleSelected = false
  @Input() clipboardHasEntries = false
  @Input() canView = false
  @Input() canEdit = false
  @Input() canViewAsText = false
  @Input() canTransfer = false
  @Input() modKey = 'Ctrl'
  @Input() isZh = true

  /** @deprecated 仅保留兼容，菜单分组改由组件内 getter 计算 */
  @Input() hasFileActions = false

  get hasLocalOpen(): boolean {
    return this.pane === 'local' && this.singleSelected && !!this.entry
  }

  get hasView(): boolean {
    return this.singleSelected && !!this.entry && !this.entry.isDirectory && this.canView
  }

  /** 未预定义文件类型的"以文本方式查看"：非目录 + 不在可查看列表中 */
  get hasViewAsText(): boolean {
    return this.singleSelected && !!this.entry && !this.entry.isDirectory && this.canViewAsText && !this.canView
  }

  get hasEdit(): boolean {
    return this.singleSelected && !!this.entry && !this.entry.isDirectory && this.canEdit
  }

  get hasLocalReveal(): boolean {
    return this.pane === 'local' && this.singleSelected && !!this.entry
  }

  get hasUpload(): boolean {
    return this.pane === 'local' && this.hasSelection && this.canTransfer
  }

  get hasDownload(): boolean {
    return this.pane === 'remote' && this.hasSelection && this.canTransfer
  }

  get hasOpenActions(): boolean {
    return this.hasLocalOpen || this.hasView || this.hasEdit || this.hasLocalReveal
  }

  get hasTransferActions(): boolean {
    return this.hasUpload || this.hasDownload
  }

  get hasClipboardActions(): boolean {
    return this.hasSelection || this.clipboardHasEntries
  }

  get hasModifyActions(): boolean {
    return this.singleSelected || this.hasSelection
  }

  get hasRemoteChmod(): boolean {
    return this.pane === 'remote' && this.singleSelected
  }

  get hasInfoActions(): boolean {
    return this.hasRemoteChmod || !!this.entry
  }

  get hasCreateActions(): boolean {
    return true
  }

  get hasPanelActions(): boolean {
    return true
  }

  get sepBeforeOpen(): boolean {
    return this.hasOpenActions && this.hasTransferActions
  }

  get sepBeforeClipboard(): boolean {
    return this.hasClipboardActions && (this.hasOpenActions || this.hasTransferActions)
  }

  get sepBeforeModify(): boolean {
    return this.hasModifyActions && (this.hasOpenActions || this.hasTransferActions || this.hasClipboardActions)
  }

  get sepBeforeInfo(): boolean {
    return this.hasInfoActions && (this.hasOpenActions || this.hasTransferActions || this.hasClipboardActions || this.hasModifyActions)
  }

  get sepBeforeCreate(): boolean {
    return this.hasCreateActions && (this.hasOpenActions || this.hasTransferActions || this.hasClipboardActions || this.hasModifyActions || this.hasInfoActions)
  }

  get sepBeforePanel(): boolean {
    const above = this.hasOpenActions || this.hasTransferActions || this.hasClipboardActions
      || this.hasModifyActions || this.hasInfoActions || this.hasCreateActions
    return this.hasPanelActions && above
  }

  @Input() headerVisible = false
  @Input() headerX = 0
  @Input() headerY = 0
  @Input() headerCol: string | null = null
  @Input() cols: ColVisibilityState = {
    size: false, date: false, created: false, access: false, owner: false,
    group: false, perms: false, mode: false, path: false, ext: false,
  }
  @Input() pinFolders = true
  @Input() showHidden = false
  @Input() showColBorders = false
  @Input() showZebra = false

  @Output() menuAction = new EventEmitter<ContextMenuAction>()
  @Output() headerAction = new EventEmitter<HeaderMenuAction>()

  @Input() i18n!: SftpI18nService

  ngOnChanges(changes: SimpleChanges): void {
    // 菜单显示后自动钳制位置，防止超出视口
    if (changes['menuVisible'] && this.menuVisible) {
      setTimeout(() => this._clampMenu(this.menuEl, 'menuX', 'menuY'))
    }
    if (changes['headerVisible'] && this.headerVisible) {
      setTimeout(() => this._clampMenu(this.headerMenuEl, 'headerX', 'headerY'))
    }
  }

  private _clampMenu(ref: ElementRef<HTMLElement> | undefined, xProp: 'menuX' | 'headerX', yProp: 'menuY' | 'headerY'): void {
    const el = ref?.nativeElement
    if (!el) return
    const MARGIN = 4
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = this[xProp]
    let y = this[yProp]
    if (x + rect.width > vw - MARGIN) x = vw - rect.width - MARGIN
    if (y + rect.height > vh - MARGIN) y = vh - rect.height - MARGIN
    if (x < MARGIN) x = MARGIN
    if (y < MARGIN) y = MARGIN
    this[xProp] = x
    this[yProp] = y
  }
}

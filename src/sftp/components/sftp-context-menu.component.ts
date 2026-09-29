/**
 * SFTP+ 右键菜单（文件列表 + 表头列配置）
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-09-28 — 「分组依据」改为 Windows 风格侧边子菜单（悬停「分组依据」项展开、
 *              ✓ 勾选当前模式，::before 桥接悬停间隙；悬停时测量视口边界——靠右翻转左侧、
 *              靠底上移对齐）；此前为菜单内平铺五项：
 *              无/名称/修改日期/类型/大小，经 groupByAction 通知父面板
 *              2026-09-20 — A8/A9 审计修复：删除死输入 isZh / hasFileActions（模板均未使用）；
 *              新增 sanitizeMenuOrder 收敛菜单顺序配置，消除 string[] 与 ContextMenuAction[] 的类型漂移并过滤未知 action
 *              2026-09-17 — 移除「以文本方式查看」菜单项（改由设置页「允许查看所有文件类型」承担）
 */
import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { GroupByMode } from '../core/grouping'

/** 分组依据可选值（右键菜单展示顺序：无 → 名称 → 修改日期 → 类型 → 大小） */
export const GROUP_BY_MODES: GroupByMode[] = ['none', 'name', 'modified', 'type', 'size']

export type ContextMenuAction =
  | 'newFolder' | 'newFile' | 'rename' | 'delete'
  | 'openLocal' | 'viewFile' | 'editFile' | 'upload' | 'download'
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

/** 右键文件菜单项定义：标签 i18n key、危险态、快捷键、分组类别 */
interface FileMenuItemDef {
  labelKey: string
  danger?: boolean
  /** 快捷键文本，'${mod}' 占位符会被替换为系统修饰键（Ctrl/Cmd） */
  shortcut?: string
  /** 分组类别：相邻不同类别之间自动插入分隔符 */
  category: 'transfer' | 'open' | 'clipboard' | 'modify' | 'info' | 'create' | 'panel'
}

export const FILE_MENU_REGISTRY: Record<ContextMenuAction, FileMenuItemDef> = {
  upload:           { labelKey: 'app.upload', category: 'transfer' },
  download:         { labelKey: 'app.download', category: 'transfer' },
  openLocal:        { labelKey: 'file.open', category: 'open' },
  viewFile:         { labelKey: 'file.view', category: 'open' },
  editFile:         { labelKey: 'file.edit', category: 'open' },
  revealInExplorer: { labelKey: 'file.showInFolder', category: 'open' },
  copy:             { labelKey: 'file.copy', shortcut: '${mod}C', category: 'clipboard' },
  cut:              { labelKey: 'file.cut', shortcut: '${mod}X', category: 'clipboard' },
  paste:            { labelKey: 'file.paste', shortcut: '${mod}V', category: 'clipboard' },
  rename:           { labelKey: 'app.rename', shortcut: 'F2', category: 'modify' },
  delete:           { labelKey: 'app.delete', shortcut: 'Del', danger: true, category: 'modify' },
  chmod:            { labelKey: 'permission.title', category: 'info' },
  details:          { labelKey: 'file.properties', category: 'info' },
  newFolder:        { labelKey: 'file.newFolder', category: 'create' },
  newFile:          { labelKey: 'file.newFile', category: 'create' },
  refresh:          { labelKey: 'app.refresh', shortcut: 'F5', category: 'panel' },
  selectAll:        { labelKey: 'pane.selectAll', shortcut: '${mod}A', category: 'panel' },
  selectInvert:     { labelKey: 'pane.selectInvert', category: 'panel' },
  copyPath:         { labelKey: 'pane.copyPath', category: 'panel' },
}

export const DEFAULT_FILE_MENU_ORDER: ContextMenuAction[] = [
  'upload', 'download', 'openLocal', 'viewFile', 'editFile', 'revealInExplorer',
  'copy', 'cut', 'paste', 'rename', 'delete', 'chmod', 'details',
  'newFolder', 'newFile', 'refresh', 'selectAll', 'selectInvert', 'copyPath',
]

/**
 * ★ 2026-09-20 A9 审计修复：把任意来源的菜单顺序配置收敛为合法的 ContextMenuAction[]。
 *   此前父面板 getter 声明 string[]、本组件声明 ContextMenuAction[]，靠 strict 关闭掩盖了
 *   类型漂移（配置里写错 action 名时，模板仍会走进 MENU_REGISTRY[a] 查表）。
 *   现统一在入口做一次运行期收敛：过滤未知项、保留相对顺序；全非法/为空则回退默认顺序。
 */
export function sanitizeMenuOrder(value: unknown): ContextMenuAction[] {
  if (!Array.isArray(value) || !value.length) return DEFAULT_FILE_MENU_ORDER
  const valid = value.filter(
    (a): a is ContextMenuAction => typeof a === 'string' && Object.prototype.hasOwnProperty.call(FILE_MENU_REGISTRY, a),
  )
  return valid.length ? valid : DEFAULT_FILE_MENU_ORDER
}

@Component({
  selector: 'sftp-context-menu',
  template: `
    <div class="context-menu" #menuEl *ngIf="menuVisible"
      [style.left]="menuX + 'px'" [style.top]="menuY + 'px'">

      <ng-container *ngFor="let a of orderedVisibleActions; let i = index">
        <div class="ctx-sep" *ngIf="i > 0 && needsSep(a, i)"></div>
        <div class="ctx-item" [class.ctx-danger]="!!MENU_REGISTRY[a].danger"
          (click)="menuAction.emit(a)">
          {{ i18n.t(MENU_REGISTRY[a].labelKey) }}
          <span class="ctx-shortcut" *ngIf="effectiveShortcut(a)">{{ effectiveShortcut(a) }}</span>
        </div>
      </ng-container>

      <!-- ★ 2026-09-28：分组依据（仅空白区域右键时显示，entry=null）——侧边子菜单（Windows 风格），悬停展开、✓ 勾选当前模式 -->
      <ng-container *ngIf="groupByPane && !disabledMenuEntries.has('groupBy')">
        <div class="ctx-sep"></div>
        <div class="ctx-item ctx-submenu-trigger" (mouseenter)="positionGroupBySubmenu()">
          {{ i18n.t('pane.groupBy') }}
          <span class="ctx-submenu-arrow">▸</span>
          <div class="ctx-submenu" #groupBySubEl>
            <div class="ctx-item" *ngIf="!disabledMenuEntries.has('groupToggleAll')" (click)="groupToggleAll.emit()">
              <span class="ctx-check"></span> {{ groupAllCollapsed ? i18n.t('group.expandAll') : i18n.t('group.collapseAll') }}
            </div>
            <div class="ctx-sep" *ngIf="!disabledMenuEntries.has('groupToggleAll')"></div>
            <div class="ctx-item" *ngFor="let m of GROUP_BY_MODES" (click)="groupByAction.emit(m)">
              <span class="ctx-check">{{ groupBy === m ? '✓' : '' }}</span> {{ i18n.t('group.' + m) }}
            </div>
          </div>
        </div>
      </ng-container>
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
      position: fixed; z-index: 902;
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
    /* ★ 2026-09-28：分组依据侧边子菜单——悬停触发项展开（::before 桥接 6px 间隙防止 hover 断链） */
    .ctx-submenu-trigger { position: relative; padding-right: 26px; }
    .ctx-submenu-arrow { position: absolute; right: 10px; opacity: 0.55; font-size: 11px; }
    .ctx-submenu {
      display: none; position: absolute; left: 100%; top: -5px;
      min-width: 128px; margin-left: -2px;
      background: var(--_bg); border: 1px solid var(--_border);
      border-radius: 6px; padding: 4px 0;
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    }
    .ctx-submenu::before { content: ''; position: absolute; left: -3px; top: 0; width: 3px; height: 100%; }
    /* ★ 2026-09-28：靠窗口右缘时翻转到触发项左侧展开（JS 悬停测量后加 flip-x），桥接伪元素同步换边；
       贴边/微重叠（-2px）避免子菜单离主菜单太远 */
    .ctx-submenu.flip-x { left: auto; right: 100%; margin-left: 0; margin-right: -2px; }
    .ctx-submenu.flip-x::before { left: auto; right: -3px; }
    .ctx-submenu-trigger:hover > .ctx-submenu { display: block; }
    .ctx-submenu-trigger:hover { background: var(--_hover); }
  `],
})
export class SftpContextMenuComponent implements OnChanges {
  @ViewChild('menuEl') menuEl!: ElementRef<HTMLElement>
  @ViewChild('headerMenuEl') headerMenuEl!: ElementRef<HTMLElement>
  @ViewChild('groupBySubEl') groupBySubEl?: ElementRef<HTMLElement>

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
  @Input() canTransfer = false
  @Input() modKey = 'Ctrl'
  // ★ 2026-09-20 A8 审计修复：删除两个死输入——isZh 从未被父模板传入且模板未使用；
  //   hasFileActions 已 @deprecated 且模板从未读取（父组件却每轮变更检测都计算并传值，整条链路空转）。

  get hasLocalOpen(): boolean {
    return this.pane === 'local' && this.singleSelected && !!this.entry
  }

  get hasView(): boolean {
    return this.singleSelected && !!this.entry && !this.entry.isDirectory && this.canView
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

  /** 右键文件菜单项的显示顺序（由设置页控制，默认 DEFAULT_FILE_MENU_ORDER） */
  @Input() menuOrder: ContextMenuAction[] = DEFAULT_FILE_MENU_ORDER

  /**
   * 面板操作热键快捷键映射（action → key 字符串，如 {delete:'Del', rename:'F2', refresh:'F5'}）。
   * 由父面板传入当前配置；若某 action 的值为空串/不存在，则该菜单项不显示快捷键。
   * 未传入时回退 FILE_MENU_REGISTRY 硬编码值（向后兼容）。
   */
  @Input() panelHotkeyShortcuts: Record<string, string> | null = null

  /** 供模板访问的菜单项注册表 */
  readonly MENU_REGISTRY = FILE_MENU_REGISTRY

  /** ★ 2026-09-28：分组依据——非 null 时在菜单尾部显示「分组依据」区段（仅空白区右键） */
  @Input() groupByPane: 'local' | 'remote' | null = null
  /** 当前面板生效的分组依据（用于 ✓ 标记） */
  @Input() groupBy: GroupByMode = 'none'
  @Output() groupByAction = new EventEmitter<GroupByMode>()
  /** 是否所有分组已折叠（用于「展开/收起所有分组」按钮文案切换；仅启用分组时由父面板计算传入） */
  @Input() groupAllCollapsed = false
  /** ★ 2026-09-28：展开/收起所有分组（子菜单顶部按钮） */
  @Output() groupToggleAll = new EventEmitter<void>()
  /** ★ 2026-09-28：被禁用的右键菜单项集合（设置页定制停用），含文件动作 + groupBy + groupToggleAll */
  @Input() disabledMenuEntries: Set<string> = new Set<string>()

  /** 供模板访问的分组模式列表 */
  readonly GROUP_BY_MODES = GROUP_BY_MODES

  /**
   * ★ 2026-09-28：「分组依据」子菜单视口边界自适应（悬停触发时测量一次）。
   * 默认贴触发项右侧展开（left:100%）；靠窗口右缘溢出 → 翻转到触发项左侧（.flip-x）；
   * 靠窗口底缘溢出 → translateY 上移至底缘对齐。每次 mouseenter 先复位再测量，避免残留上次偏移。
   */
  positionGroupBySubmenu(): void {
    const sub = this.groupBySubEl?.nativeElement
    if (!sub) return
    sub.classList.remove('flip-x')
    sub.style.transform = ''
    // 悬停态下 :hover 已生效、display:block，getBoundingClientRect 可测得真实尺寸
    const r = sub.getBoundingClientRect()
    if (!r.width) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const M = 4
    if (r.right > vw - M) sub.classList.add('flip-x')
    if (r.bottom > vh - M) sub.style.transform = `translateY(${(vh - M) - r.bottom}px)`
  }

  /** 判断某个菜单项当前是否应可见（复用原有 getter 逻辑） */
  isActionVisible(a: ContextMenuAction): boolean {
    switch (a) {
      case 'upload': return this.hasUpload
      case 'download': return this.hasDownload
      case 'openLocal': return this.hasLocalOpen
      case 'viewFile': return this.hasView
      case 'editFile': return this.hasEdit
      case 'revealInExplorer': return this.hasLocalReveal
      case 'copy': return this.hasSelection
      case 'cut': return this.hasSelection
      case 'paste': return this.clipboardHasEntries
      case 'rename': return this.singleSelected
      case 'delete': return this.hasSelection
      case 'chmod': return this.hasRemoteChmod
      case 'details': return !!this.entry
      case 'newFolder': return this.hasCreateActions
      case 'newFile': return this.hasCreateActions
      case 'refresh': return true
      case 'selectAll': return true
      case 'selectInvert': return true
      case 'copyPath': return this.hasSelection || !!this.entry
      default: return false
    }
  }

  /** 按 menuOrder 过滤出的当前可见菜单项（已排序） */
  get orderedVisibleActions(): ContextMenuAction[] {
    // ★ A9：入口统一收敛，杜绝未知 action 进入 MENU_REGISTRY 查表
    const order = sanitizeMenuOrder(this.menuOrder)
    return order.filter(a => this.isActionVisible(a) && !this.disabledMenuEntries.has(a))
  }

  /** 相邻两项类别不同则插入分隔符 */
  needsSep(a: ContextMenuAction, i: number): boolean {
    if (i <= 0) return false
    const prev = this.orderedVisibleActions[i - 1]
    return FILE_MENU_REGISTRY[prev].category !== FILE_MENU_REGISTRY[a].category
  }

  /** 把快捷键文本中的 '${mod}' 占位符替换为系统修饰键 */
  shortcutText(s?: string): string {
    if (!s) return ''
    return s.replace('${mod}', this.modKey)
  }

  /**
   * 获取某菜单项的实际快捷键文本（优先动态配置，其次硬编码 registry）。
   * 当 panelHotkeyShortcuts 中该 action 的值为空串时，返回空（不显示快捷键），
   * 即使用户在设置中清除了该热键。
   */
  effectiveShortcut(action: ContextMenuAction): string {
    // 面板操作级热键（delete/rename/refresh）走动态配置
    if (this.panelHotkeyShortcuts && action in this.panelHotkeyShortcuts) {
      const key = this.panelHotkeyShortcuts[action]
      // 空串 = 用户已清除该热键 → 不显示
      return key ? this.shortcutText(key) : ''
    }
    // 其余菜单项（copy/cut/paste/selectAll 等）用 registry 硬编码值
    return this.shortcutText(FILE_MENU_REGISTRY[action].shortcut)
  }

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

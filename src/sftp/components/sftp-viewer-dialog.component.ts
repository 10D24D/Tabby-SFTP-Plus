/**
 * SFTP+ 远程文件查看对话框（文本 / 图片）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-08-05
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-23 — 底栏「在系统中打开」旁新增「在系统中编辑」（@Input showEditInSystem /
 *              @Output editInSystem）：点击后由面板把查看器就地切成编辑器，并用系统默认程序打开同一份
 *              本地副本；只在文本模式且该类型可编辑时出现（判据在 controller 的 viewerShowEditInSystem）。
 *              2026-10-19 — 全量审计「对话框/查看器细节」三项：
 *              ① P2-17：onTextBlur 的 120ms 定时器与 toggleMaximize 的 0ms 定时器都是**裸
 *              setTimeout**（_blurSettleTimer 声明了却从不赋值）⇒ ngOnDestroy 清不掉，对话框
 *              在定时器兑现前销毁后，回调仍会去读写已卸载的视图。现分别登记
 *              _blurSettleTimer / _maximizeSettleTimer，并在 ngOnDestroy 统一清理。
 *              ② P2-18：关闭对话框（visible→false）时复位 copied/copiedSel 并清掉两个 1.5s
 *              反馈定时器 —— 否则 1.5s 内重新打开查看器会误显示「已复制全部 / 已复制选中」。
 *              ③ P2-23：图片左右翻页热键原用 target.closest('sftp-viewer-dialog, .overlay, …')
 *              判定「焦点是否在查看器内」，而 .overlay 是全仓库通用类名（任意祖先遮罩都会命中）
 *              ⇒ 别的模态/背景里按方向键也会翻页；改为只认本组件自己的 overlayEl（contains）。
 *              点击定位的滚动条判定改回视口坐标系（ev.offsetX 相对事件目标 span，不是视口）。
 *              2026-10-14 — 修复「右键全选不生效 / Ctrl+A 毫无反应 / Ctrl+C 复制还会穿透到 SSH」
 *              （用户连续两轮报障）：
 *              ① 右键菜单「全选」原先只是**静默复制全文**（无选区、无反馈）⇒ 改为真正的
 *              selectAllText()：行数 ≤ VS_SELECT_ALL_MAX_ROWS 时**取消虚拟化**（挂载全部行）
 *              再取 Range，得到全文选区且滚动不丢；超限则退化为「选中当前屏幕内容」并提示
 *              （新增 i18n viewer.selectAllLimited + .file-dialog-hint）。挂载态 _vsAllMounted
 *              由 _reflowRows / 关闭对话框时复位。
 *              ② Ctrl+A 与 Ctrl+C/X/V 统一由**面板剪贴板屏蔽器**接管：它在 window 捕获阶段
 *              必须 stopImmediatePropagation（否则 Tabby 会把 ^C 当真送进远端 shell ——
 *              那是 JS 行为，preventDefault 拦不住），因此本组件**不能**自己监听按键；
 *              屏蔽器对 C/X/V 只 stop 不 prevent（保住浏览器原生复制/粘贴），对 Ctrl+A 则
 *              preventDefault 后**反向调用本组件的 selectAllText()**（@ViewChild 转交）。
 *              ③ 复制反馈（用户追问「快捷键复制没有反馈，也分不清复制了全部还是选中」）：
 *              Ctrl+C 也改由面板转交本组件的 copyForShortcut() —— 有选区复制选中、无选区
 *              复制全文（与两个复制按钮共用实现），并把反馈文案区分开：
 *              「复制」按钮 → file.copiedAll（已复制全部）、「复制选中」→ file.copiedSelection
 *              （已复制选中）。顺带解决换行模式下原生复制会把折行当真实换行的问题。
 *              2026-10-13 — 第三批审计修复：① 极端空行文件超出 Chromium 最大滚动高度——总高设
 *              32M px 上限，行数极多时按比例压缩行高（≥6px）；行样式（新 CSS 变量 --vs-row-h）、
 *              窗口偏移、点击定位、光标盒全部改用同一动态行高，scrollTop↔行索引换算不再错位。
 *              ② 点击定位光标列改按码点实际宽度累加（全角≈1.7×半角），修 CJK 行光标列偏差。
 *              ③ 滚动条防御改视口坐标系（ev.offsetX 相对子元素而非视口，原判断恒失效）。
 *              ④ 换行开关切换改走 _reflowRowsKeepAnchor，开关瞬间不再跳到文件开头。
 *              ⑤ 三处异步句柄（打开 setTimeout(0)/聚焦 rAF/blur setTimeout(120)）登记字段，
 *              ngOnDestroy 统一 clearTimeout/cancelAnimationFrame。
 *              2026-10-08 — ① 修长行被「省略号截断」：不再靠 CSS ellipsis，改由窗口 width:max-content
 *              + 容器横向滚动看全（配套 styles.ts ⑭）；插入光标的 X 补算 scrollLeft
 *              （此前横向永远滚不动，这个错位一直没暴露）。② 新增「自动换行」开关
 *              （@Input wordWrap，默认 false）：长行按可用像素宽切成若干 18px 渲染行，
 *              复用既有**定高**虚拟列表 —— 不引入变高行，故不会有「滚动漂移 / 滚过去一片空」；
 *              切行由静态纯函数 packRows 完成（半角 1 格 / 全角 2 格 / \t 跳到制表位、不切断代理对）。
 *              ③ 底部按钮区（复制按钮右侧）新增「自动换行」「行号」两个开关，经
 *              @Output wordWrapChange / lineNumbersChange 交父级落盘到配置。
 *              2026-09-29 — 自绘插入光标由「宽度 px（1–4）」改为「形状三档」：@Input caretShape
 *              （block/beam/underline，取值与 Tabby 终端 store.terminal.cursor 逐字一致），
 *              几何改由 caretBoxWidthPx / caretBoxHeightPx / caretBoxTopPx 三个 getter 给出
 *              （方块＝覆盖整字 + mix-blend-mode 反色、竖线＝2px、下划线＝行底 2px 横线），
 *              宽高从 CSS 挪到内联样式（CSS 里保留 2×18 仅作兜底）
 *              2026-09-21 — rAF/右键菜单回调增加销毁安全的变更检测；
 *              2026-09-20 — 行号/光标宽度可配置（设置项）
 *              2026-09-20 — 查看器补回点击插入光标（虚拟列表无原生 caret）
 *              2026-09-20 — 行号 gutter 改 min-width，避免 padding 被 width 挤没
 *              2026-09-20 — 虚拟滚动：加大 overscan + rAF 贴窗防滚空白；增加行号 gutter
 *              2026-09-20 — issue #23：大文本改虚拟滚动（按行窗口渲染），根治 textarea 塞满白屏
 *              2026-08-10 — 复制/复制选中按钮、图片上一张下一张导航、加载中图标、打开时文本框自动聚焦
 *              2026-08-10 — 光标显示优化([value]替代ngModel + rAF聚焦)、复制选中按钮消失修复(click/blur事件)
 *              2026-08-26 — 右键菜单卡顿：OnPush + zone 外原生 contextmenu + 选区检测禁 slice
 */
import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import type { CaretShape } from '../../tabby/config-provider'
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'
import { handleOverlayKeydown } from './dialog-focus'
import { copyImageToClipboard, copyTextToClipboard } from './clipboard-copy'
import { TextMenuAction } from './sftp-text-context-menu.component'

import { log } from '../../services/sftp-logger'
export type ViewerMode = 'text' | 'image'

/** 虚拟列表行高（与 .file-dialog-vs-line 的 line-height 一致） */
const VS_LINE_HEIGHT = 18
/** ★ 2026-10-13：行数极多时允许把行高压到的最低值（px）——此时相邻行文字会相互叠住，
 *  但 scrollTop↔行索引换算仍然精确（行号/点击定位/复制选中不受影响），属可读性兜底。 */
const VS_MIN_ROW_HEIGHT = 6
/** ★ 2026-10-13：inner 撑起的滚动总高上限（px）。Chromium 布局高度上限约 2^25（≈33.5M px），
 *  超过后高度被静默 clamp，而组件仍按 rows.length×18 换算 scrollTop ⇒ 行索引整体错位
 *  （滚到底还有一大截、行号与内容对不上）。2MB 全换行文件 ≈209.7 万行 ×18px ≈37.7M px
 *  正好越界；查看文本上游限 2MB（VIEW_TEXT_MAX_BYTES），故 32M 下压缩后的行高 ≥15px。 */
const VS_MAX_TOTAL_HEIGHT = 32000000
/** 视口上下各多渲染的行数；偏大可减少快速滚动时「空白一闪」 */
const VS_OVERSCAN = 48
/**
 * ★ 2026-10-14：「全选」时允许**取消虚拟化**（一次性挂载全部行）的行数上限。
 *   虚拟列表默认只挂载可视窗口 ⇒ 直接对 DOM 取 Range 只能选中一小段，
 *   无法实现真正的全选。行数不大时干脆把全文挂出来再选，用户可见完整高亮、
 *   还能自由滚动（选区不会因重排消失）；超过上限（超大文件，挂满会卡）则退化为
 *   「只选中当前屏幕内容」并给出提示。
 */
const VS_SELECT_ALL_MAX_ROWS = 2000
/** 制表位宽度（字符数）—— 必须与 styles.ts 里 .file-dialog-vs 的 tab-size 一致 */
const VIEWER_TAB_SIZE = 8
/** .file-dialog-vs 的左右内边距合计（12px × 2），算可用列宽时要扣除 */
const VS_H_PADDING = 24

/** 一条**渲染行**：自动换行时一个逻辑行会被切成多行，续行的 lineNo 为空串 */
export interface ViewerRow {
  /** 该渲染行要显示的文本（换行时是逻辑行的切片） */
  text: string
  /** 行号列文本；续行为空串 */
  label: string
  /** 所属逻辑行下标（0 基）—— 复制选中时要据此还原原文 */
  line: number
  /** 该渲染行文本在所属逻辑行内的起始下标（换行时为切片起点） */
  colStart: number
}

function selectionTextInside(root: HTMLElement | null | undefined): string {
  if (!root) return ''
  const sel = window.getSelection?.()
  if (!sel || sel.isCollapsed || sel.rangeCount < 1) return ''
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return ''
  return sel.toString()
}

function hasSelectionInside(root: HTMLElement | null | undefined): boolean {
  return selectionTextInside(root).length > 0
}

@Component({
  selector: 'sftp-viewer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" #overlayEl *ngIf="visible" tabindex="-1"
           (wheel)="onOverlayWheel($event)" (click)="onOverlayClick($event)"
           (keydown)="onOverlayKeydown($event)">
      <div class="dialog file-dialog-shell" [class.is-maximized]="maximized">
        <div class="dialog-title">
          <span class="file-dialog-title">{{ i18n.t('file.view') }} — {{ fileName }}</span>
          <div class="file-dialog-window-btns">
            <button type="button" class="file-dialog-win-btn"
              (click)="toggleMaximize()"
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
              (click)="close.emit()" [title]="i18n.t('app.close')">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="file-dialog-path" *ngIf="displayPath">{{ displayPath }}</div>
        <div class="file-dialog-body" [class.editor-body]="!loading && !error && mode === 'text'" (wheel)="onScrollableWheel($event)">
          <div class="file-dialog-loading" *ngIf="loading">
            <div class="spinner"></div>
          </div>
          <div class="file-dialog-status file-dialog-error" *ngIf="!loading && error">{{ error }}</div>

          <!-- ★ 2026-09-20：文本虚拟滚动——inner 撑高度 + 窗口贴 scrollTop；点击显示插入光标 -->
          <div #vsViewport class="file-dialog-vs"
            *ngIf="!loading && !error && mode === 'text'"
            tabindex="0"
            (mousedown)="onVsMouseDown($event)"
            (wheel)="onScrollableWheel($event)"
            (mouseup)="updateHasSelection()"
            (keyup)="updateHasSelection()"
            (selectstart)="scheduleSelectionCheck()"
            (blur)="onTextBlur()">
            <div class="file-dialog-vs-inner" [style.height.px]="vsTotalHeight">
              <div class="file-dialog-vs-caret"
                *ngIf="caretVisible && !hasSelectionText"
                [class.is-block]="caretShape === 'block'"
                [style.left.px]="caretX"
                [style.top.px]="caretBoxTopPx"
                [style.width.px]="caretBoxWidthPx"
                [style.height.px]="caretBoxHeightPx"
                aria-hidden="true"></div>
              <div class="file-dialog-vs-window"
                [style.transform]="'translate3d(0,' + vsOffsetY + 'px,0)'">
                <div class="file-dialog-vs-line"
                  *ngFor="let row of vsVisibleRows; let i = index; trackBy: trackVsRow"
                  [attr.data-row-index]="vsStartIndex + i">
                  <span class="file-dialog-vs-gutter" *ngIf="showLineNumbers"
                    [style.minWidth.ch]="vsGutterChars"
                    aria-hidden="true">{{ row.label }}</span>
                  <span class="file-dialog-vs-text"
                    [class.file-dialog-vs-text-nogutter]="!showLineNumbers">{{ row.text }}</span>
                </div>
              </div>
            </div>
          </div>

          <div #imageWrap class="file-dialog-image-wrap" *ngIf="!loading && !error && mode === 'image'">
            <img class="file-dialog-image" [src]="imageUrl" [alt]="fileName" />
            <div class="image-nav" *ngIf="imageCount > 1">
              <button type="button" class="image-nav-btn"
                (click)="prevImage.emit()" [disabled]="imageIndex <= 0"
                [title]="i18n.t('viewer.prevImage')">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 3L5 8l5 5"/>
                </svg>
              </button>
              <span class="image-nav-pos">{{ imageIndex + 1 }} / {{ imageCount }}</span>
              <button type="button" class="image-nav-btn"
                (click)="nextImage.emit()" [disabled]="imageIndex >= imageCount - 1"
                [title]="i18n.t('viewer.nextImage')">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M6 3l5 5-5 5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="file-dialog-hint" *ngIf="selectAllHint">{{ selectAllHint }}</div>
        <div class="dialog-buttons">
          <span class="dialog-buttons-left">
            <button type="button" class="file-dialog-system-btn" *ngIf="showSystemAction"
              (click)="systemAction.emit()" [disabled]="loading || !!error"
              [title]="i18n.t('file.openInSystem')">
              {{ i18n.t('file.openInSystem') }}
            </button>
            <!-- ★ 2026-10-23（Deepseek-V4.1-Flash）：查看器里就地切编辑器 ——
                 「在系统中编辑」= 把当前查看器换成面板内编辑器（可继续改），并用系统默认程序打开同一份本地副本。
                 只在文本模式且该类型可编辑时出现（父级 showEditInSystem 判定；图片/二进制无编辑意义）。 -->
            <button type="button" class="file-dialog-system-btn" *ngIf="showEditInSystem"
              (click)="editInSystem.emit()" [disabled]="loading || !!error"
              [title]="i18n.t('file.editInSystem')">
              {{ i18n.t('file.editInSystem') }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              (click)="copy()" [disabled]="loading || !!error || !canCopy"
              [title]="i18n.t('file.copy')">
              {{ copyLabel }}
            </button>
            <button type="button" class="file-dialog-system-btn"
              *ngIf="mode === 'text' && hasSelectionText"
              (mousedown)="$event.preventDefault()"
              (click)="copySelection()" [disabled]="loading || !!error"
              [title]="i18n.t('file.copySelection')">
              {{ copiedSel ? i18n.t('file.copiedSelection') : i18n.t('file.copySelection') }}
            </button>
            <!-- ★ 2026-10-08：复制按钮右侧的显示开关（仅文本模式；图片模式无意义）。
                 开关状态归父级配置所有 —— 这里只发事件、回显 @Input，避免双向绑定漂移。 -->
            <label class="file-dialog-view-opt" *ngIf="mode === 'text'"
              [title]="i18n.t('settings.showTextWordWrapHint')">
              <input type="checkbox" [checked]="wordWrap"
                (change)="onWordWrapToggle($event)" />
              <span>{{ i18n.t('viewer.wordWrap') }}</span>
            </label>
            <label class="file-dialog-view-opt" *ngIf="mode === 'text'"
              [title]="i18n.t('settings.showTextLineNumbersHint')">
              <input type="checkbox" [checked]="showLineNumbers"
                (change)="onLineNumbersToggle($event)" />
              <span>{{ i18n.t('viewer.lineNumbers') }}</span>
            </label>
          </span>
          <button type="button" (click)="close.emit()">{{ i18n.t('app.close') }}</button>
        </div>
      </div>

      <sftp-text-context-menu
        [i18n]="i18n"
        [visible]="textMenuVisible"
        [x]="textMenuX" [y]="textMenuY"
        [mode]="textMenuMode"
        [editable]="false"
        [hasSelection]="textMenuHasSelection"
        [canPaste]="textMenuCanPaste"
        [hasImage]="textMenuHasImage"
        [hasAddress]="textMenuHasAddress"
        (action)="onTextMenuAction($event)"
        (close)="onTextMenuClose()">
      </sftp-text-context-menu>
    </div>
  `,
  styles: [FILE_DIALOG_SHARED_STYLES],
})
export class SftpViewerDialogComponent implements OnChanges, OnDestroy, AfterViewChecked {
  private static readonly MAXIMIZED_KEY = 'sftp-plus-viewer-maximized'
  private _destroyed = false

  private _safeDetect(): void {
    if (this._destroyed) return
    try { this.cdr.detectChanges() } catch { /* destroyed view */ }
  }

  /** ★ 2026-10-19 P1（audit）：Tab 焦点陷阱需要 overlay 根元素（viewer 此前是全仓库唯一
   *  没接 handleOverlayKeydown 的大对话框，Tab 可一路走到背后传输队列的暂停/取消按钮） */
  @ViewChild('overlayEl') private overlayEl?: ElementRef<HTMLDivElement>
  @ViewChild('vsViewport') private vsViewport?: ElementRef<HTMLDivElement>
  @ViewChild('imageWrap') private imageWrap?: ElementRef<HTMLDivElement>

  @Input() visible = false
  @Input() loading = false
  @Input() mode: ViewerMode = 'text'
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() textContent = ''
  @Input() imageUrl = ''
  @Input() error = ''
  @Input() showSystemAction = false
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：是否显示「在系统中编辑」。
   *   父级按「文本模式 + 该文件类型可编辑」判定（`viewerShowEditInSystem`）——
   *   组件自身拿不到设置里的自定义可编辑扩展名，别在这里猜。
   */
  @Input() showEditInSystem = false
  @Input() imageIndex = 0
  @Input() imageCount = 0
  /** 是否显示行号（设置项，默认 true） */
  @Input() showLineNumbers = true
  /** ★ 2026-10-08：长行是否自动换行（设置项，默认 false = 横向滚动看全） */
  @Input() wordWrap = false
  /** 自绘插入光标形状（设置项，block/beam/underline 三档，默认 beam 细竖线） */
  @Input() caretShape: CaretShape = 'beam'

  copied = false
  private copyTimer?: any
  copiedSel = false
  private copySelTimer?: any
  hasSelectionText = false
  private pendingFocus = false
  private _selCheckTimer: ReturnType<typeof setTimeout> | null = null
  /** ★ 2026-10-13：异步句柄统一登记，ngOnDestroy 兜底清理——对话框可能在句柄触发前
   *  被销毁（快速开关文件），回调里再碰视图/变更检测就是空跑。 */
  private _openSettleTimer: ReturnType<typeof setTimeout> | null = null
  private _focusRaf = 0
  private _blurSettleTimer: ReturnType<typeof setTimeout> | null = null
  /** ★ 2026-10-19 P2-17：最大化切换后的重排定时器（此前是裸 setTimeout，销毁后仍会兑现） */
  private _maximizeSettleTimer: ReturnType<typeof setTimeout> | null = null
  /** --vs-row-h 变量上次写入值，避免每次滚动重复写 DOM */
  private _vsRowHVarApplied = 0

  /** 按行拆好的全文（仅内存索引，DOM 只挂载窗口） */
  private _lines: string[] = []
  /** 实际渲染行（不换行时 = 逻辑行；换行时一个逻辑行被切成多行） */
  private _rows: ViewerRow[] = []
  vsVisibleRows: ViewerRow[] = []
  /**
   * ★ 2026-10-14：「全选」已取消虚拟化（全部行挂载中）——此时 _syncVisibleWindow 不再
   *   裁剪窗口，否则滚动一次就把挂载的节点换掉、选区随之丢失。
   */
  private _vsAllMounted = false
  /** 等待下一次视图检查时执行 Range 选区（需 DOM 已挂载） */
  private _pendingSelectAll = false
  /** 「全选」提示（空串 = 不显示） */
  selectAllHint = ''
  vsStartIndex = 0
  vsOffsetY = 0
  vsTotalHeight = 0
  /** ★ 2026-10-13：当前生效的行高（默认 18；极端行数下按总高上限比例压缩，见 _effectiveRowHeight）。
   *  窗口偏移、点击定位、光标盒、总高全部用它换算，保证 scrollTop↔行索引始终一致。 */
  vsRowHeight = VS_LINE_HEIGHT
  /** 行号列宽度（字符数），随总行数位数变化 */
  vsGutterChars = 3
  /** 点击后的插入光标（只读虚拟列表无原生 caret） */
  caretVisible = false
  caretX = 0
  caretY = 0
  private _charWidth = 0
  /** 字体度量缓存（半角 / 全角 / 制表位宽度，px）—— 切行的唯一宽度依据 */
  private _metrics: { latin: number; wide: number; tab: number } | null = null
  /** 上次重排时用的可用列宽，用于判断「宽度真的变了」 */
  private _lastAvailW = 0
  private _reflowRaf = 0
  private _ro: ResizeObserver | null = null
  private _roEl: HTMLElement | null = null
  private _vsRaf = 0
  private _vsScrollBound = false
  private _vsScrollEl: HTMLElement | null = null
  private readonly _onVsScrollNative = (): void => {
    if (this._vsRaf) return
    this._vsRaf = requestAnimationFrame(() => {
      this._vsRaf = 0
      this._syncVisibleWindow(false)
      // OnPush：滚动在 zone 外，需显式刷本组件
      this._safeDetect()
    })
  }

  textMenuVisible = false
  textMenuX = 0
  textMenuY = 0
  textMenuMode: 'text' | 'image' = 'text'
  textMenuHasSelection = false
  textMenuHasImage = false
  textMenuHasAddress = false
  textMenuCanPaste = false

  @Output() close = new EventEmitter<void>()
  @Output() systemAction = new EventEmitter<void>()
  /** ★ 2026-10-23：把当前查看器切换成面板内编辑器（父级 openViewerInSystemEdit 处理） */
  @Output() editInSystem = new EventEmitter<void>()
  @Output() prevImage = new EventEmitter<void>()
  @Output() nextImage = new EventEmitter<void>()
  /** ★ 2026-10-08：显示开关变更 —— 由父级写入配置（含持久化），本组件只发事件 */
  @Output() wordWrapChange = new EventEmitter<boolean>()
  @Output() lineNumbersChange = new EventEmitter<boolean>()

  @Input() i18n!: SftpI18nService

  maximized = SftpViewerDialogComponent.loadMaximized()

  onOverlayWheel = onFileDialogOverlayWheel

  /** ★ 2026-10-19 P1（audit）：Tab/Shift+Tab 在对话框内循环，不逃逸到背景。
   *  查看器与编辑器是仓库里**最后两个**没有焦点陷阱的对话框（其余 8 个 2026-10-13 已统一接），
   *  此前 Tab 可一路走到背后传输队列的「最小化/隐藏/暂停/取消」按钮，
   *  在模态背后把正在跑的传输暂停/取消掉。
   *  Esc 仍由宿主面板的 Esc 栈处理（viewerVisible / editorVisible 分支）。 */
  onOverlayKeydown(event: KeyboardEvent): void {
    handleOverlayKeydown(event, this.overlayEl?.nativeElement)
  }
  onScrollableWheel = onFileDialogScrollableWheel

  private _ctxTarget: HTMLElement | null = null
  private readonly _onNativeContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault()
    ev.stopPropagation()
    ev.stopImmediatePropagation()
    this.textMenuMode = this.mode
    this.textMenuHasSelection = this.mode === 'text' && hasSelectionInside(this.vsViewport?.nativeElement)
    this.textMenuHasImage = this.mode === 'image' && !!this.imageUrl
    this.textMenuHasAddress = this.mode === 'image' && !!this.imageUrl
    this.textMenuCanPaste = !!(navigator.clipboard && (navigator.clipboard as any).readText)
    this.textMenuX = ev.clientX
    this.textMenuY = ev.clientY
    this.textMenuVisible = true
    this._safeDetect()
  }

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpViewerDialogComponent.loadMaximized()
    }
    if (changes['textContent'] || (changes['visible'] && this.visible)) {
      this._rebuildLines(this.textContent || '')
    } else if (changes['wordWrap']) {
      // ★ 2026-10-13：换行开关切换也保持滚动锚点——原来直接 _reflowRows() 会把
      //   vsStartIndex/vsOffsetY/scrollTop 一并归零，开关瞬间跳到文件开头。
      this._reflowRowsKeepAnchor()
    } else if (changes['showLineNumbers']) {
      // ★ 2026-10-08：换行开关 → 重新切行；行号开关 → 行号列宽变化 ⇒ 正文可用宽随之变化
      this._reflowRows()
    }
    if (this.visible && !this.loading && !this.error && this.mode === 'text'
      && (changes['visible'] || changes['loading'] || changes['textContent'])) {
      this.pendingFocus = true
    }
    if (changes['textContent'] || changes['visible']) this.hasSelectionText = false
    if (changes['visible']?.currentValue === false) {
      this.textMenuVisible = false
      // ★ 2026-10-19 P2-18：关闭时复位「已复制」反馈态并撤掉在途的 1.5s 定时器。
      //   组件实例会随面板常驻（遮罩是 *ngIf，组件不销毁），只清 ngOnDestroy 的话
      //   1.5s 内重新打开会直接显示「已复制全部 / 已复制选中」（其实是上一次的残留）。
      this._resetCopyFeedback()
      this._teardownVsScrollListener()
      this._teardownResizeObserver()
      this._unbindCtxTarget()
      this._lines = []
      this._rows = []
      this.vsVisibleRows = []
      this.caretVisible = false
      this._metrics = null
      this._lastAvailW = 0
    }
    if (changes['visible']) {
      // ★ 2026-10-14：关闭时清掉「全选」相关状态，避免下次打开沿用取消虚拟化的挂载态
      if (changes['visible'].currentValue === false) {
        this._vsAllMounted = false
        this._pendingSelectAll = false
        this.selectAllHint = ''
      }
      // 打开/最大化后视口高度（换行模式下还有宽度）可能变化，下一帧按新尺寸重算
      if (this._openSettleTimer != null) { clearTimeout(this._openSettleTimer); this._openSettleTimer = null }
      this._openSettleTimer = setTimeout(() => {
        this._openSettleTimer = null
        if (this.wordWrap) this._reflowRowsKeepAnchor()
        else this._syncVisibleWindow(true)
      }, 0)
    }
    this.cdr.markForCheck()
  }

  ngAfterViewChecked(): void {
    if (this.pendingFocus && this.vsViewport) {
      this.pendingFocus = false
      if (this._focusRaf) cancelAnimationFrame(this._focusRaf)
      this._focusRaf = requestAnimationFrame(() => {
        this._focusRaf = 0
        const vp = this.vsViewport?.nativeElement
        vp?.focus({ preventScroll: true })
        if (this.wordWrap) this._reflowRowsKeepAnchor()
        else this._syncVisibleWindow(true)
        if (vp && this._lines.length) {
          // 打开时像旧 textarea 一样给出插入光标反馈
          const cw = this._measureCharWidth(vp)
          this.caretX = this._gutterBoxWidth(cw)
          this.caretY = Math.floor(vp.scrollTop / this.vsRowHeight) * this.vsRowHeight
          this.caretVisible = true
        }
        this._safeDetect()
      })
    }
    this._ensureVsScrollListener()
    this._ensureResizeObserver()
    // ★ 2026-10-14：等「全选」所需的全部行挂载完成后再取 Range
    if (this._pendingSelectAll) {
      this._pendingSelectAll = false
      this._applySelectAllRange()
    }
    const target =
      (!this.loading && !this.error && this.mode === 'text' && this.vsViewport?.nativeElement)
      || (!this.loading && !this.error && this.mode === 'image' && this.imageWrap?.nativeElement)
      || null
    this._bindCtxTarget(target)
  }

  ngOnDestroy(): void {
    this._destroyed = true
    this._teardownVsScrollListener()
    this._teardownResizeObserver()
    this._unbindCtxTarget()
    // ★ 2026-10-19 P2-18：与关闭对话框共用同一套复位（清定时器 + 复位反馈态）
    this._resetCopyFeedback()
    if (this._selCheckTimer) clearTimeout(this._selCheckTimer)
    // ★ 2026-10-13：打开/聚焦/失焦三枚异步句柄的兜底清理
    if (this._openSettleTimer != null) { clearTimeout(this._openSettleTimer); this._openSettleTimer = null }
    if (this._focusRaf) { cancelAnimationFrame(this._focusRaf); this._focusRaf = 0 }
    if (this._blurSettleTimer != null) { clearTimeout(this._blurSettleTimer); this._blurSettleTimer = null }
    if (this._maximizeSettleTimer != null) { clearTimeout(this._maximizeSettleTimer); this._maximizeSettleTimer = null }
    if (this._vsRaf) { cancelAnimationFrame(this._vsRaf); this._vsRaf = 0 }
    if (this._reflowRaf) { cancelAnimationFrame(this._reflowRaf); this._reflowRaf = 0 }
  }

  /** 光标盒宽度：方块/下划线覆盖一个字符宽（与点击定位用的 _charWidth 同源），竖线固定 2px */
  get caretBoxWidthPx(): number {
    if (this.caretShape === 'beam') return 2
    return Math.max(4, Math.round(this._charWidth || 8))
  }

  /** 光标盒高度：下划线只有 2px 细横线，其余两种占满整行（行高可能被压缩，取动态值） */
  get caretBoxHeightPx(): number {
    return this.caretShape === 'underline' ? 2 : this.vsRowHeight
  }

  /** 光标盒竖直位置：下划线贴行底（行顶 + 行高 - 线高），其余与 caretY 对齐 */
  get caretBoxTopPx(): number {
    return this.caretShape === 'underline' ? this.caretY + this.vsRowHeight - 2 : this.caretY
  }

  trackVsRow = (i: number): number => this.vsStartIndex + i

  private _gutterBoxWidth(cw: number): number {
    if (!this.showLineNumbers) return 0
    // 与 CSS 对齐：padL 8 + digits + padR 16 + border 1 + text padL 16
    return 8 + this.vsGutterChars * cw + 16 + 1 + 16
  }

  /** 正文可用的水平像素宽（视口内容宽 − 容器左右内边距 − 行号列宽）；视口未挂载时返回 0 */
  private _wrapAvailWidth(): number {
    const el = this.vsViewport?.nativeElement
    if (!el || el.clientWidth <= 0) return 0
    const cw = this._measureCharWidth(el)
    return el.clientWidth - VS_H_PADDING - this._gutterBoxWidth(cw)
  }

  /**
   * 把一条逻辑行按可用像素宽切成若干渲染行（自动换行用）。
   *
   * 纯函数：不读 DOM、不用实例状态 —— 便于产物侧探针从 dist 逐字抽出后真实执行。
   * 宽度口径必须与浏览器一致，否则切出来的行会溢出或被提前换行：
   *   · 半角 1 格 = metrics.latin；全角（CJK/假名/谚文/全角形式）2 格 = metrics.wide；
   *   · \t 采取「一律从行首起算一个制表位」的保守口径 —— 制表位宽度随所在列变化，若允许
   *     行中出现 \t，同一个 \t 在不同宽度下会算出不同的视觉宽度，切行就不可复现；因此在 \t
   *     前必断行（分割出去的 \t 从行首起算，宽度恰好是 metrics.tab），并在 CSS 里把
   *     .file-dialog-vs 的 tab-size 固定为 VIEWER_TAB_SIZE 与之对齐；
   *   · 不切断代理对（emoji / 扩展 B 区汉字占 2 个码元，按码点推进）。
   *
   * @param line    逻辑行原文（不含换行符）
   * @param availPx 正文可用像素宽
   * @param metrics 字体度量（px）
   * @returns 至少一项；空行返回 ['']
   */
  static packRows(
    line: string,
    availPx: number,
    metrics: { latin: number; wide: number; tab: number },
  ): string[] {
    if (!line) return ['']
    const latin = metrics.latin > 0 ? metrics.latin : 1
    const wide = metrics.wide > 0 ? metrics.wide : latin * 2
    const tabW = metrics.tab > 0 ? metrics.tab : latin * VIEWER_TAB_SIZE
    const avail = availPx > latin ? availPx : latin
    const out: string[] = []
    let start = 0
    let w = 0
    let i = 0
    while (i < line.length) {
      const cp = line.codePointAt(i) as number
      if (cp === 9) {
        if (w > 0) { out.push(line.slice(start, i)); start = i; w = 0 }
        // ★ 2026-10-09 审计根治（切行宽度上界失效）：
        //   原写法把**连续 tab 整段**累加后只判一次 `if (w > avail)`，命中就把整段
        //   作为一个 chunk 吐出（start 直接跳过全部 tab）。而该 chunk 的实际渲染宽度
        //   = tabW × tab 个数，可以远超 avail —— 例如 8 个 tab、tabW=56、avail=20
        //   ⇒ 产出单块 448px 宽的行，而文本层是 white-space:pre
        //   ⇒ **横向溢出到窗口外**，恰是自动换行要消灭的现象。
        //   根治：**逐个 tab 决定去留**，超宽的那个单独成行，其余按剩余宽度继续累积。
        //   这样每一行的宽度上界都真正受 avail 约束（单行最多只剩「一个放不下的 tab」）。
        while (line.codePointAt(i) === 9) {
          // 当前行已有内容且再来一个 tab 就超宽 → 先断行
          if (w + tabW > avail && w > 0) { out.push(line.slice(start, i)); start = i; w = 0 }
          w += tabW
          i++
          // 单个 tab 本身就超宽（极窄窗口）→ 立即断行，保证不产生超宽行
          if (w > avail) { out.push(line.slice(start, i)); start = i; w = 0 }
        }
        continue
      }
      const cw = SftpViewerDialogComponent.isWideCodePoint(cp) ? wide : latin
      // 放不下且当前行已有内容 → 断行；当前行为空时强制收下，避免死循环
      if (w + cw > avail && i > start) { out.push(line.slice(start, i)); start = i; w = 0 }
      w += cw
      i += cp > 0xffff ? 2 : 1
    }
    if (start < line.length || out.length === 0) out.push(line.slice(start))
    return out
  }

  /** 码点是否占两格（East Asian Wide/Fullwidth 的近似集合） */
  static isWideCodePoint(cp: number): boolean {
    return (cp >= 0x1100 && cp <= 0x115f)
      || (cp >= 0x2e80 && cp <= 0x303e)
      || (cp >= 0x3041 && cp <= 0x33ff)
      || (cp >= 0x3400 && cp <= 0x4dbf)
      || (cp >= 0x4e00 && cp <= 0x9fff)
      || (cp >= 0xa000 && cp <= 0xa4cf)
      || (cp >= 0xac00 && cp <= 0xd7a3)
      || (cp >= 0xf900 && cp <= 0xfaff)
      || (cp >= 0xfe10 && cp <= 0xfe19)
      || (cp >= 0xfe30 && cp <= 0xfe6f)
      || (cp >= 0xff00 && cp <= 0xff60)
      || (cp >= 0xffe0 && cp <= 0xffe6)
      || (cp >= 0x1f300 && cp <= 0x1f64f)
      || (cp >= 0x1f900 && cp <= 0x1f9ff)
      || (cp >= 0x20000 && cp <= 0x3fffd)
  }

  private _ensureVsScrollListener(): void {
    const el = this.vsViewport?.nativeElement ?? null
    if (!el) return
    if (this._vsScrollBound && this._vsScrollEl === el) return
    this._teardownVsScrollListener()
    this._vsScrollEl = el
    this._vsScrollBound = true
    this.zone.runOutsideAngular(() => {
      el.addEventListener('scroll', this._onVsScrollNative, { passive: true })
    })
  }

  private _teardownVsScrollListener(): void {
    if (this._vsScrollEl && this._vsScrollBound) {
      this._vsScrollEl.removeEventListener('scroll', this._onVsScrollNative)
    }
    this._vsScrollEl = null
    this._vsScrollBound = false
  }

  private _rebuildLines(text: string): void {
    // 按行切分；保留空行，去掉行尾 \r（Windows）
    this._lines = text.length ? text.split(/\n/).map(l => (l.endsWith('\r') ? l.slice(0, -1) : l)) : []
    this.vsGutterChars = Math.max(3, String(Math.max(this._lines.length, 1)).length)
    this._reflowRows()
  }

  /**
   * 生成渲染行（不换行 = 逻辑行 1:1；换行 = 按可用列宽切行）并重算总高 / 可见窗口。
   * 触发点：内容变更、换行开关变更、行号开关变更（行号列宽影响可用宽）、视口宽度变化。
   */
  private _reflowRows(): void {
    const rows: ViewerRow[] = []
    const avail = this.wordWrap ? this._wrapAvailWidth() : 0
    const el = this.vsViewport?.nativeElement
    const metrics = el ? this._measureMetrics(el) : null
    if (this.wordWrap && avail > 0 && metrics) {
      for (let i = 0; i < this._lines.length; i++) {
        const chunks = SftpViewerDialogComponent.packRows(this._lines[i], avail, metrics)
        let off = 0
        for (let c = 0; c < chunks.length; c++) {
          // packRows 返回的是同一条逻辑行的连续切片，故 colStart 逐块累加即可精确复原原文
          rows.push({ text: chunks[c], label: c === 0 ? String(i + 1) : '', line: i, colStart: off })
          off += chunks[c].length
        }
      }
    } else {
      for (let i = 0; i < this._lines.length; i++) {
        rows.push({ text: this._lines[i], label: String(i + 1), line: i, colStart: 0 })
      }
    }
    this._rows = rows
    this._lastAvailW = avail
    // ★ 2026-10-14：行集重建 ⇒ 之前「全选」挂载的节点已失效，退出取消虚拟化状态
    //   （内容/换行/行号/宽度任一变化都会走到这里）
    this._vsAllMounted = false
    this.selectAllHint = ''
    // ★ 2026-10-13：动态行高——总高设 32M px 上限，行数极多时按比例压缩行高（见常量注释），
    //   并写进 --vs-row-h 让 .file-dialog-vs-line 的 height/line-height 同步变化。
    this.vsRowHeight = this._effectiveRowHeight(rows.length)
    this._applyVsRowHeightVar(el)
    this.vsTotalHeight = Math.max(rows.length * this.vsRowHeight, this.vsRowHeight)
    this.vsStartIndex = 0
    this.vsOffsetY = 0
    this._syncVisibleWindow(true)
  }

  /**
   * ★ 2026-10-13：按行数算生效行高——Chromium 布局高度上限约 2^25（≈33.5M px），
   * 越界后高度被 clamp，scrollTop/行高 与行索引的换算整体错位。行数越多行高越小
   * （比例压缩），总高始终 ≤ VS_MAX_TOTAL_HEIGHT，索引换算保持精确；行数正常时仍是 18。
   * 注：MIN 兜底 6px 只在 >530 万行时才会被触达（已超查看 2MB 上限，理论上不可达）。
   */
  private _effectiveRowHeight(rowCount: number): number {
    if (rowCount <= 0) return VS_LINE_HEIGHT
    const scaled = Math.floor(VS_MAX_TOTAL_HEIGHT / rowCount)
    return Math.max(VS_MIN_ROW_HEIGHT, Math.min(VS_LINE_HEIGHT, scaled))
  }

  /** ★ 2026-10-13：把动态行高写进视口的 CSS 变量（.file-dialog-vs-line 按它渲染行高） */
  private _applyVsRowHeightVar(el: HTMLElement | null | undefined): void {
    if (!el || this._vsRowHVarApplied === this.vsRowHeight) return
    this._vsRowHVarApplied = this.vsRowHeight
    el.style.setProperty('--vs-row-h', `${this.vsRowHeight}px`)
  }

  /** 列宽变化时重排，并把滚动位置锚回「原来在最上面的那个逻辑行」 */
  private _reflowRowsKeepAnchor(): void {
    const el = this.vsViewport?.nativeElement
    let anchorLine = -1
    if (el && this._rows.length) {
      // ★ 2026-10-19 P1：行高改用动态值（原常量 18），压缩行高时锚点换算才不失真
      const idx = Math.min(this._rows.length - 1, Math.max(0, Math.floor(el.scrollTop / this.vsRowHeight)))
      anchorLine = this._rows[idx]?.line ?? -1
    }
    this._reflowRows()
    if (el && anchorLine >= 0) {
      const idx = this._rows.findIndex(r => r.line === anchorLine && r.colStart === 0)
      if (idx >= 0) el.scrollTop = idx * this.vsRowHeight
    }
    this._syncVisibleWindow(true)
  }

  private _ensureResizeObserver(): void {
    const el = this.vsViewport?.nativeElement ?? null
    if (!el) return
    if (this._ro && this._roEl === el) return
    this._teardownResizeObserver()
    this._roEl = el
    this.zone.runOutsideAngular(() => {
      this._ro = new ResizeObserver(() => this._onViewportResize())
      this._ro?.observe(el)
    })
  }

  private _teardownResizeObserver(): void {
    this._ro?.disconnect()
    this._ro = null
    this._roEl = null
  }

  /** 视口宽度变化 → 只在「换行开启且可用宽确实变了」时重排；rAF 合并连续触发（拖拽面板边缘） */
  private readonly _onViewportResize = (): void => {
    if (!this.wordWrap || this._reflowRaf) return
    const el = this.vsViewport?.nativeElement
    if (!el) return
    const avail = this._wrapAvailWidth()
    if (avail <= 0 || Math.abs(avail - this._lastAvailW) < 1) return
    this._reflowRaf = requestAnimationFrame(() => {
      this._reflowRaf = 0
      this._reflowRowsKeepAnchor()
      this._safeDetect()
    })
  }

  private _syncVisibleWindow(force: boolean): void {
    const el = this.vsViewport?.nativeElement
    const rowCount = this._rows.length
    if (!rowCount) {
      if (this.vsVisibleRows.length) this.vsVisibleRows = []
      this.vsOffsetY = 0
      this.caretVisible = false
      return
    }
    // ★ 2026-10-14：「全选」已取消虚拟化 —— 保持全部行挂载，绝不裁剪窗口。
    //   否则滚动触发本函数时会把节点换掉，用户的选区当场消失（这正是「选完一滚就没了」的隐患）。
    if (this._vsAllMounted) {
      if (this.vsVisibleRows.length !== rowCount) {
        this.vsStartIndex = 0
        this.vsOffsetY = 0
        this.vsVisibleRows = this._rows.slice()
      }
      return
    }
    const scrollTop = el ? el.scrollTop : 0
    const viewH = el && el.clientHeight > 0 ? el.clientHeight : 480
    // 先贴窗：offset 立刻对齐 scrollTop 附近，减少「滚过去一片空」
    // ★ 2026-10-19 P1：三处均为行索引↔像素换算，必须用**当前生效行高**（可为压缩值）
    const first = Math.max(0, Math.floor(scrollTop / this.vsRowHeight) - VS_OVERSCAN)
    const visibleCount = Math.ceil(viewH / this.vsRowHeight) + VS_OVERSCAN * 2
    const last = Math.min(rowCount, first + visibleCount)
    const nextOffset = first * this.vsRowHeight
    if (!force
      && first === this.vsStartIndex
      && last === this.vsStartIndex + this.vsVisibleRows.length
      && nextOffset === this.vsOffsetY) {
      return
    }
    this.vsStartIndex = first
    this.vsOffsetY = nextOffset
    this.vsVisibleRows = this._rows.slice(first, last)
  }

  /** 点击正文：放置闪烁插入光标（虚拟列表不是 textarea，需自绘） */
  onVsMouseDown(ev: MouseEvent): void {
    if (ev.button !== 0) return
    const vp = this.vsViewport?.nativeElement
    if (!vp || !this._lines.length) return
    const rect = vp.getBoundingClientRect()
    // ★ 2026-10-19 P2-23：滚动条判定必须用**视口坐标系**。原写 ev.offsetX —— 它是相对
    //   event.target（行内 span / 行号格）的坐标，碰上横向滚动或带 padding 的子元素就会
    //   算错（点正文右侧也可能被当成点在滚动条上，光标放置失效）。此处与 y 轴一样统一取
    //   clientX - rect.left。
    if (ev.clientX - rect.left >= vp.clientWidth) return

    const cw = this._measureCharWidth(vp)
    const gutterBox = this._gutterBoxWidth(cw)
    const yInContent = vp.scrollTop + (ev.clientY - rect.top) - 12
    const rowIdx = Math.max(0, Math.min(this._rows.length - 1, Math.floor(yInContent / this.vsRowHeight)))
    const row = this._rows[rowIdx]
    const text = row ? row.text : ''
    // ★ 2026-10-08：补 scrollLeft —— 修掉省略号截断后横向可以滚动了，不补这一项
    //   光标会随横向滚动整体偏移（旧代码横向永远滚不动，这个错位一直没暴露）。
    const xInContent = (ev.clientX - rect.left) + vp.scrollLeft - 12 - gutterBox
    const col = Math.max(0, Math.min(text.length, Math.round(xInContent / cw)))

    this.caretX = gutterBox + col * cw
    this.caretY = rowIdx * this.vsRowHeight
    this.caretVisible = true
    // 拖选开始时先显示，mouseup 若有选区再藏
    this.cdr.markForCheck()
  }

  private _measureCharWidth(host: HTMLElement): number {
    const m = this._measureMetrics(host)
    return m ? m.latin : 8
  }

  /**
   * 量「半角 / 全角 / 制表位」三种宽度并缓存。
   * 切行只认这里量出来的像素值，不做「全角 = 2 × 半角」的假设 —— CJK 走字体回退，
   * 实际宽度未必正好是两倍，按倍数算会让长行溢出或提前折行。
   */
  private _measureMetrics(host: HTMLElement): { latin: number; wide: number; tab: number } | null {
    if (this._metrics) return this._metrics
    const widthOf = (text: string): number => {
      const probe = document.createElement('span')
      probe.textContent = text
      probe.style.cssText = [
        'position:absolute', 'visibility:hidden', 'white-space:pre',
        'font-family:ui-monospace,Cascadia Code,Consolas,monospace',
        'font-size:12px', 'line-height:18px', `tab-size:${VIEWER_TAB_SIZE}`,
      ].join(';')
      host.appendChild(probe)
      const w = probe.offsetWidth
      host.removeChild(probe)
      return w
    }
    const latin = widthOf('0'.repeat(50)) / 50
    if (!(latin > 0)) return null
    const wide = widthOf('漢'.repeat(20)) / 20
    this._metrics = { latin, wide: wide > 0 ? wide : latin * 2, tab: latin * VIEWER_TAB_SIZE }
    this._charWidth = this._metrics.latin
    return this._metrics
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

  toggleMaximize(): void {
    this.maximized = !this.maximized
    SftpViewerDialogComponent.saveMaximized(this.maximized)
    // ★ 2026-10-19 P2-17：登记句柄（连点最大化时先撤掉上一枚，销毁时由 ngOnDestroy 清）
    if (this._maximizeSettleTimer != null) { clearTimeout(this._maximizeSettleTimer); this._maximizeSettleTimer = null }
    this._maximizeSettleTimer = setTimeout(() => {
      this._maximizeSettleTimer = null
      // 最大化同时改变高度与宽度 ⇒ 换行开启时须重排切行
      if (this.wordWrap) this._reflowRowsKeepAnchor()
      else this._syncVisibleWindow(true)
    }, 0)
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    // ★ 2026-10-14：文本模式的 Ctrl/Cmd+A 走**捕获阶段**的手动监听（_onSelectAllKey），
    //   这里只保留图片模式左右翻页 —— 原因见 _ensureSelectAllKeyListener 注释。
    if (!this.visible || this.mode !== 'image' || this.imageCount <= 1) return
    // ★ 2026-10-19 P2-23：原来用 target.closest('sftp-viewer-dialog, .overlay, .file-dialog-shell')
    //   判定「焦点是否在查看器内」—— 而 .overlay / .file-dialog-shell 是**全仓库通用类名**
    //   （别的对话框、乃至祖先遮罩都用），closest 会一路上溯，任一祖先命中即算「在查看器内」
    //   ⇒ 焦点其实在别的模态/背景里时方向键照样翻图。改为只认**本组件自己的 overlayEl**
    //   （contains 判定，不再按类名上溯）；overlay 尚未挂载时一律不认领。
    const overlay = this.overlayEl?.nativeElement
    if (!overlay) return
    const t = ev.target as Node | null
    const active = document.activeElement as Node | null
    const anchor = (t && overlay.contains(t)) ? t : active
    if (!anchor || !overlay.contains(anchor)) return
    if (ev.key === 'ArrowLeft') {
      if (this.imageIndex > 0) { ev.preventDefault(); this.prevImage.emit() }
    } else if (ev.key === 'ArrowRight') {
      if (this.imageIndex < this.imageCount - 1) { ev.preventDefault(); this.nextImage.emit() }
    }
  }

  /**
   * ★ 2026-10-14 新增：真正的「全选」。
   *   调用方是**面板**的剪贴板屏蔽器（Ctrl/Cmd+A），以及本对话框右键菜单的「全选」。
   *   不由本组件自己监听按键：屏蔽器必须先在 window 捕获阶段把事件 stop 掉（否则
   *   xterm/Tabby 会把按键当真送到远端 shell），一 stop 事件就到不了本组件，只能在
   *   屏蔽器里反向调用本方法。详见 sftp-floating-panel 中该分支的长注释。
   *
   * 背景：查看器是定高虚拟列表，DOM 里只有「可视窗口 + overscan」那些行。
   * 原实现（注释自称「虚拟列表无法一次选中全文 DOM」）把全选悄悄改成**复制全文**，
   * 但既没有选区也没有明显反馈 ⇒ 用户看到的是「点了全选，什么也没选中」（2026-10-14 报障）。
   *
   * 现按行数分两档：
   *  ① 行数 ≤ VS_SELECT_ALL_MAX_ROWS：**取消虚拟化**（一次性挂载全部行）后再取 Range，
   *     得到真正的全文选区；挂载状态保留（`_vsAllMounted`），用户滚动时选区不会丢。
   *  ② 行数超过上限：超大文件挂满会卡死，退化为「选中当前屏幕内容」，并给出提示文案，
   *     同时用户仍可用「复制全部」拿全文。
   */
  selectAllText(): void {
    if (!this._rows.length) return
    if (this._rows.length <= VS_SELECT_ALL_MAX_ROWS) {
      this.selectAllHint = ''
      if (!this._vsAllMounted) {
        this._vsAllMounted = true
        this.vsStartIndex = 0
        this.vsOffsetY = 0
        this.vsVisibleRows = this._rows.slice()
        this.cdr.markForCheck()
      }
    } else {
      this.selectAllHint = this.i18n.t('viewer.selectAllLimited')
    }
    // DOM 可能刚更新（取消虚拟化挂载了全部行）⇒ 延到下一次视图检查再取 Range
    this._pendingSelectAll = true
    this.cdr.markForCheck()
  }

  /** 对当前已挂载的行取 Range 并写入 window 选区 */
  private _applySelectAllRange(): void {
    const vp = this.vsViewport?.nativeElement
    if (!vp) return
    const textEls = vp.querySelectorAll<HTMLElement>('.file-dialog-vs-text')
    if (!textEls.length) return
    const first = textEls[0]
    const last = textEls[textEls.length - 1]
    try {
      const range = document.createRange()
      // 只框住「正文」span：行号栏（.file-dialog-vs-gutter）是同级兄弟，不会被选进来
      range.setStart(first, 0)
      range.setEnd(last, last.childNodes.length)
      const sel = window.getSelection?.()
      if (!sel) return
      sel.removeAllRanges()
      sel.addRange(range)
      // 选区就绪后与既有状态机对齐（隐藏插入光标、点亮「复制选中」按钮）
      this.hasSelectionText = true
      this.caretVisible = false
    } catch {
      // 极端空行/代理对边界取 Range 失败时静默放弃：宁可不选，也不要抛错打断变更检测
      this.selectAllHint = ''
    }
    this._safeDetect()
  }

  copy(): void {
    let ok = false
    if (this.mode === 'image' && this.imageUrl) {
      if (this.imageUrl.startsWith('data:')) ok = copyImageToClipboard(this.imageUrl)
      else ok = copyTextToClipboard(this.imageUrl)
    } else {
      ok = copyTextToClipboard(this.textContent || '')
    }
    if (ok) this.showCopiedFeedback()
  }

  copySelection(): boolean {
    // ★ 2026-10-08：换行模式下必须**按行模型还原原文** —— 一个逻辑行被切成了多个 DOM 行，
    //   直接用浏览器选区文本会在折行处插入多余的换行符，粘贴出来就不是原文件内容了。
    const sel = this.wordWrap
      ? this._wrappedSelectionText()
      : selectionTextInside(this.vsViewport?.nativeElement)
    if (!sel) return false
    if (copyTextToClipboard(sel)) {
      this.copiedSel = true
      if (this.copySelTimer) clearTimeout(this.copySelTimer)
      this.copySelTimer = setTimeout(() => { this.copiedSel = false; this.cdr.markForCheck() }, 1500)
      this.cdr.markForCheck()
    }
    return true
  }

  /**
   * 换行模式下把浏览器选区还原成原文：端点（文本节点 + 偏移）→ 渲染行 →（逻辑行, 行内列），
   * 再按逻辑行切片拼接。端点取不到时回退浏览器原生文本（宁可多几个换行也不丢内容）。
   */
  private _wrappedSelectionText(): string {
    const vp = this.vsViewport?.nativeElement
    if (!vp) return ''
    const sel = window.getSelection?.()
    if (!sel || sel.isCollapsed || sel.rangeCount < 1) return ''
    const range = sel.getRangeAt(0)
    if (!vp.contains(range.commonAncestorContainer)) return ''
    const a = this._rowAnchor(range.startContainer, range.startOffset)
    const b = this._rowAnchor(range.endContainer, range.endOffset)
    if (!a || !b) return sel.toString()
    const reverse = a.line > b.line || (a.line === b.line && a.col > b.col)
    const s = reverse ? b : a
    const e = reverse ? a : b
    if (s.line === e.line) return (this._lines[s.line] || '').slice(s.col, e.col)
    const parts: string[] = [(this._lines[s.line] || '').slice(s.col)]
    for (let i = s.line + 1; i < e.line; i++) parts.push(this._lines[i] || '')
    parts.push((this._lines[e.line] || '').slice(0, e.col))
    return parts.join('\n')
  }

  /** 选区端点 → {逻辑行, 行内列}；端点不在渲染行内（如落在容器上）时返回 null */
  private _rowAnchor(node: Node, offset: number): { line: number; col: number } | null {
    let el: HTMLElement | null =
      node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)
    while (el && !el.dataset?.rowIndex) el = el.parentElement
    if (!el) return null
    const row = this._rows[Number(el.dataset.rowIndex)]
    if (!row) return null
    // 端点是文本节点时 offset 即块内偏移；否则（元素节点）按 0 / 整行 处理
    const inChunk = node.nodeType === Node.TEXT_NODE ? offset : (offset === 0 ? 0 : row.text.length)
    return { line: row.line, col: row.colStart + inChunk }
  }

  /** ★ 2026-10-08：底部显示开关 —— 只发事件，落盘由父级（浮动面板）写配置 */
  onWordWrapToggle(ev: Event): void {
    const next = !!(ev.target as HTMLInputElement | null)?.checked
    if (next === this.wordWrap) return
    this.wordWrapChange.emit(next)
  }

  onLineNumbersToggle(ev: Event): void {
    const next = !!(ev.target as HTMLInputElement | null)?.checked
    if (next === this.showLineNumbers) return
    this.lineNumbersChange.emit(next)
  }

  updateHasSelection(): void {
    const next = hasSelectionInside(this.vsViewport?.nativeElement)
    if (next === this.hasSelectionText) {
      // 有选区时藏插入光标；无选区且刚点过则保持
      if (next && this.caretVisible) {
        this.caretVisible = false
        this.cdr.markForCheck()
      }
      return
    }
    this.hasSelectionText = next
    if (next) this.caretVisible = false
    // ★ 2026-10-14：选区被用户清掉后，「仅选中当前屏幕内容」的提示也该收起
    else if (this.selectAllHint) this.selectAllHint = ''
    this.cdr.markForCheck()
  }

  scheduleSelectionCheck(): void {
    if (this._selCheckTimer) clearTimeout(this._selCheckTimer)
    this._selCheckTimer = setTimeout(() => {
      this._selCheckTimer = null
      this.updateHasSelection()
    }, 0)
  }

  onTextBlur(): void {
    // 延迟：复制选中按钮的 mousedown 会先 blur，需等 click 完成
    // ★ 2026-10-19 P2-17：登记句柄（连续 blur 只保留最后一枚，销毁时由 ngOnDestroy 清）
    if (this._blurSettleTimer != null) { clearTimeout(this._blurSettleTimer); this._blurSettleTimer = null }
    this._blurSettleTimer = setTimeout(() => {
      this._blurSettleTimer = null
      let dirty = false
      if (!hasSelectionInside(this.vsViewport?.nativeElement) && this.hasSelectionText) {
        this.hasSelectionText = false
        dirty = true
      }
      if (this.caretVisible) {
        this.caretVisible = false
        dirty = true
      }
      if (dirty) this.cdr.markForCheck()
    }, 120)
  }

  onTextMenuAction(a: TextMenuAction): void {
    switch (a) {
      case 'copySelection': this.copySelection(); break
      case 'copyAll': this.copy(); break
      case 'copyAddress': if (this.imageUrl) copyTextToClipboard(this.imageUrl); break
      case 'selectAll': {
        // ★ 2026-10-14：改为真正的全选（原先只是「复制全文」且无任何反馈，
        //   用户以为右键菜单坏了）。超大文件会自动退化为「选中当前屏幕内容」并提示。
        this.selectAllText()
        break
      }
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

  get canCopy(): boolean {
    return this.mode === 'image' ? !!this.imageUrl : !!this.textContent
  }

  get copyLabel(): string {
    if (!this.copied) return this.i18n.t('file.copy')
    // ★ 2026-10-14：复制反馈区分「全部 / 选中」—— 原先两种复制都只显示「已复制」，
    //   用户看不出刚才复制的是整份文件还是只是一段选区。图片模式复制的是图片本身，
    //   「全部」没有意义，仍用中性的「已复制」。
    return this.mode === 'image' ? this.i18n.t('file.copied') : this.i18n.t('file.copiedAll')
  }

  /**
   * ★ 2026-10-14：快捷键（Ctrl/Cmd+C）走这里的复制，而不是让浏览器原生复制。
   *
   * 为什么不交给原生：
   *   ① 虚拟列表 + 换行模式下，原生复制拿到的是**渲染行**文本 —— 折行处会插入多余的
   *      换行符，粘出来就不是原文件内容了；本组件的 copySelection() 已按行模型还原；
   *   ② 原生复制没有任何反馈，用户无法确认是否复制成功、更分不清复制的是全部还是选中
   *      （2026-10-14 用户报障）。
   * 语义：有选区 → 复制选中；无选区 → 复制全文（与「复制」按钮一致，避免静默无反应）。
   * 判定用 copySelection() 的**返回值**（实时读 DOM 选区），不依赖 hasSelectionText ——
   * 后者由鼠标事件异步刷新，用户「拖选后立刻按 Ctrl+C」时可能还是旧值。
   */
  copyForShortcut(): void {
    if (!this.copySelection()) this.copy()
  }

  /** ★ 2026-10-19 P2-18：把「已复制」反馈态与两枚 1.5s 定时器一起复位。
   *  关闭对话框与销毁都要走它 —— 只清 ngOnDestroy 的话，1.5s 内重开查看器会看到上一次的残留。 */
  private _resetCopyFeedback(): void {
    if (this.copyTimer) { clearTimeout(this.copyTimer); this.copyTimer = undefined }
    if (this.copySelTimer) { clearTimeout(this.copySelTimer); this.copySelTimer = undefined }
    this.copied = false
    this.copiedSel = false
  }

  private showCopiedFeedback(): void {
    this.copied = true
    if (this.copyTimer) clearTimeout(this.copyTimer)
    this.copyTimer = setTimeout(() => { this.copied = false; this.cdr.markForCheck() }, 1500)
    this.cdr.markForCheck()
  }

  private static loadMaximized(): boolean {
    try {
      return localStorage.getItem(SftpViewerDialogComponent.MAXIMIZED_KEY) === 'true'
    } catch (e) {
      log.warn('loadMaximized failed', e)
      return false
    }
  }

  private static saveMaximized(value: boolean): void {
    try {
      localStorage.setItem(SftpViewerDialogComponent.MAXIMIZED_KEY, value ? 'true' : 'false')
    } catch (e) { log.warn('saveMaximized failed', e) }
  }
}

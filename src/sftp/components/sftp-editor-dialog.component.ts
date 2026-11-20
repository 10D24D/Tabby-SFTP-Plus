/**
 * SFTP+ 文本文件编辑对话框（本地 / 远程）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-08-05
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-11-05 — 软换行下行号**不再隐藏**：改为按 VS Code 口径逐逻辑行对齐（折行处留空行，
 *              行号仍落在逻辑行首）。每个逻辑行占几个视觉行由离屏镜像实测（每行一个块级 div 读高度），
 *              打字走按行增量重测（≈10ms），宽度变化由 ResizeObserver 触发全量重测，行数超 3 万时
 *              跳过对齐（宁可暂时不显示，也不让编辑器卡住）。行号开关不再因换行置灰。
 *              2026-10-23 — 「本地已改动，尚未上传」不再用黄色横幅：改为对话框边框高亮
 *              （.dialog.has-external-dirty）+ 底栏保存键高亮（.btn-primary.is-attention）。
 *              保存键文案恒为「保存」（用户要求：高亮不该改名），保存成功后也不再自动关闭编辑器。
 *              2026-10-19 — 全量审计 P2-18：关闭对话框（visible→false）时复位
 *              copied/copiedSel 并撤掉两枚 1.5s 反馈定时器。此前只在 ngOnDestroy 清，
 *              而组件实例随面板常驻（遮罩是 *ngIf、组件不销毁）⇒ 1.5s 内重开编辑器，
 *              「复制」按钮会误显示「已复制全部 / 已复制选中」（上一次的残留态）。
 *              2026-10-14 — 修复「右键全选不生效 / Ctrl+A 不能全选 / Ctrl+C 复制穿透到 SSH」
 *              （用户连续两轮报障）：
 *              ① 新增「打开即聚焦正文」（_pendingFocus，在 ngAfterViewChecked 里于内容同步
 *              之后兑现）—— 此前打开编辑器必须先在正文点一下，否则打字/复制/全选全部落空。
 *              ② 新增公开方法 selectAllText()（聚焦正文 + 全选编辑器内容），右键菜单「全选」
 *              与 Ctrl+A 共用。**不由本组件监听按键**：面板剪贴板屏蔽器在 window 捕获阶段
 *              必须 stopImmediatePropagation（否则 Tabby 会把键当真送进远端 shell，那是 JS
 *              行为、preventDefault 拦不住），事件因此到不了本组件 ⇒ 由屏蔽器反向调用。
 *              焦点不在正文时屏蔽器会 preventDefault 并调本方法（避免原生全选去选整个文档）；
 *              焦点已在正文时交还浏览器原生（保留撤销栈与行内选区语义）。
 *              ③ 复制反馈（用户追问「快捷键复制没有反馈，也分不清复制了全部还是选中」）：
 *              Ctrl+C 也改由面板转交本组件的 copyForShortcut() —— 有选区复制选中、无选区
 *              复制全文（与两个复制按钮共用实现）；反馈文案区分开：「复制」→ file.copiedAll
 *              （已复制全部）、「复制选中」→ file.copiedSelection（已复制选中）。
 *              2026-10-13 — P2 修复：行号栏每次按键同步重建（全文 charCodeAt 数换行 + 行数变化时
 *              new Array(n).join），5MB/20 万行文件上输入明显卡顿。改为 rAF 合流（一帧内多次
 *              输入只重建一次）+ indexOf 扫描计数（V8 原生子串搜索，快一个量级）；打开/外部回写
 *              等需同步生效的入口走 immediate 分支；ngOnDestroy 取消未兑现的帧回调。
 *              2026-10-08 — 新增「自动换行」开关：textarea 由固定 wrap=off 改为按开关切 soft/off
 *              （Chromium 运行时改该属性会真正重排，无需 relayout hack）；
 *              换行开启时隐藏行号栏并把行号开关置灰（软换行后行号与视觉行不再一一对应）。
 *              2026-09-21 — 右键菜单回调增加销毁安全的变更检测；
 *              2026-09-20 — 可选行号栏（与 textarea 同步滚动）；设置项控制
 *              2026-09-20 — A8 审计修复：删除死输出 closeConfirm（从不 emit，父模板亦未绑定）
 *              2026-09-17 — 脱离 ngModel 回写：保留原生撤销/重做、减轻粘贴卡顿；未保存 * 紧挨文件名
 *              2026-08-10 — 新增「复制选中」按钮（有选中内容时显示，复制当前选中文本）
 *              2026-08-10 — 复制选中按钮消失修复(click/blur事件)
 *              2026-08-26 — 右键菜单卡顿：OnPush + zone 外原生 contextmenu + 选区检测禁 slice
 *              2026-08-05 — 新增「复制」按钮（复制当前编辑框内容）
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
import { handleOverlayKeydown } from './dialog-focus'
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
    <div class="overlay" #overlayEl *ngIf="visible" tabindex="-1"
           (wheel)="onOverlayWheel($event)" (click)="onOverlayClick($event)"
           (keydown)="onOverlayKeydown($event)">
      <div class="dialog file-dialog-shell" [class.is-maximized]="maximized"
        [class.has-external-dirty]="externalEditPrompt">
        <div class="dialog-title">
          <div class="file-dialog-title-wrap">
            <!-- ★ 2026-11-20（Deepseek-V4.1-Flash）：标题只留文件名。
                 编辑窗本身就能查看与修改，再冠一个「编辑 — 」纯属噪音（用户要求去掉）。
                 ⚠ 未保存标记（*）保留，它是唯一的「有改动」提示。 -->
            <span class="file-dialog-title">
              {{ fileName }}<span
                class="editor-dirty"
                *ngIf="dirty"
                [attr.title]="i18n.t('editor.unsaved')"> *</span>
            </span>
          </div>
          <div class="file-dialog-window-btns">
            <button type="button" class="file-dialog-win-btn"
              (click)="toggleMaximize()"
              [disabled]="saving"
              [title]="maximized ? i18n.t('app.restore') : i18n.t('app.maximize')">
              <svg *ngIf="!maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="1.5" y="1.5" width="9" height="9" rx="0.5"/>
              </svg>
              <!-- ★ 2026-11-20（Deepseek-V4.1-Flash）：还原改用「整方 + 右上角凸片」（只画后框上边与右边），
                   与主面板 tbIconMaximize 同一套写法；两个完整方框叠画会在前框内部多出一段交叉线。
                   尺寸与 □ 严格同框：外框 1.5→10.5（9 格），前框 6.75（= 9 × 75%）、错位 2.25（= 9 × 25%），
                   □ 与还原切换时几何包围盒完全重合，不会出现视觉跳动。 -->
              <svg *ngIf="maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round">
                <rect x="1.5" y="3.75" width="6.75" height="6.75" rx="0.6"/>
                <path d="M3.75 1.5H10.5V8.25"/>
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
        <!-- ★ 2026-10-23（Deepseek-V4.1-Flash）：外部编辑保存后未上传，原先是一条黄色横幅提醒；
             用户要求改成「面板边框高亮 + 按钮高亮」——横幅已删除，
             边框见 .dialog.has-external-dirty，按钮见底栏保存键的 .is-attention（文案不变）。 -->
        <div class="file-dialog-body editor-body">
          <div class="file-dialog-status" *ngIf="loading">{{ i18n.t('viewer.loading') }}</div>
          <div class="file-dialog-status file-dialog-error" *ngIf="!loading && error">{{ error }}</div>
          <div class="file-dialog-editor-wrap" *ngIf="!loading && !error">
            <!-- ★ 2026-11-05（Deepseek-V4.1-Flash）：软换行下**不再隐藏行号**。
                 旧做法（2026-10-08）是「换行 ⇒ 藏行号」，因为折行后视觉行与逻辑行不再一一对应，
                 行号会误导。现在改成对齐 VS Code 的行为：行号只标逻辑行，折行的续行**留空**，
                 行号仍然精确落在每个逻辑行的首行上（视觉行数由离屏镜像实测，见 _measureWrapRows）。
                 仅在「行数超过 WRAP_ROW_MAX_LINES」这种测量代价过高的极端文件下才跳过（wrapGutterSkipped）。 -->
            <div #lineGutter class="file-dialog-editor-gutter"
              *ngIf="showLineNumbers && !wrapGutterSkipped"
              [style.minWidth.ch]="lineGutterChars"
              aria-hidden="true">{{ lineNumbersText }}</div>
            <!-- ★ 2026-10-08：换行由 .is-soft-wrap 类驱动（作者样式 white-space:pre 会压掉 wrap 属性，
                 实测见 styles.ts 该规则处注释）；wrap="off" 保留为静态兜底 -->
            <textarea #editorTextarea class="file-dialog-textarea"
              wrap="off"
              [class.is-soft-wrap]="wordWrap"
              (wheel)="onScrollableWheel($event)"
              (scroll)="onEditorScroll()"
              (input)="onTextareaInput($event)"
              (mouseup)="updateHasSelection()" (keyup)="updateHasSelection()"
              (select)="updateHasSelection()" (click)="updateHasSelection()"
              (blur)="onTextareaBlur()"
              [readonly]="saving"
              spellcheck="false"></textarea>
          </div>
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
              {{ copiedSel ? i18n.t('file.copiedSelection') : i18n.t('file.copySelection') }}
            </button>
            <!-- ★ 2026-10-08：复制按钮右侧的显示开关。开关状态归父级配置所有 —— 这里只发事件、
                 回显 @Input，避免双向绑定漂移。
                 ★ 2026-11-05：行号开关**不再**因换行而置灰 —— 软换行下行号已按逻辑行精确对齐。 -->
            <label class="file-dialog-view-opt"
              [title]="i18n.t('settings.showTextWordWrapHint')">
              <input type="checkbox" [checked]="wordWrap"
                (change)="onWordWrapToggle($event)" />
              <span>{{ i18n.t('viewer.wordWrap') }}</span>
            </label>
            <label class="file-dialog-view-opt"
              [title]="i18n.t('settings.showTextLineNumbersHint')">
              <input type="checkbox" [checked]="showLineNumbers"
                (change)="onLineNumbersToggle($event)" />
              <span>{{ i18n.t('viewer.lineNumbers') }}</span>
            </label>
          </span>
          <!-- ★ 2026-10-23：有「外部改动未上传」时只让保存键**高亮**（.is-attention）。
               ⛔ 文案必须恒为「保存」——用户明确要求不要因为高亮改名（曾试过改成「立即上传」被否）。 -->
          <button type="button" class="btn-primary"
            [class.is-attention]="externalEditPrompt"
            (click)="save.emit()" [disabled]="loading || saving || !!error || !dirty">
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
  private _destroyed = false

  private _safeDetect(): void {
    if (this._destroyed) return
    try { this.cdr.detectChanges() } catch { /* destroyed view */ }
  }

  /** ★ 2026-10-19 P1（audit）：Tab 焦点陷阱需要 overlay 根元素（editor 与 viewer 同为漏网的两个大对话框） */
  @ViewChild('overlayEl') private overlayEl?: ElementRef<HTMLDivElement>
  @ViewChild('editorTextarea') private editorTextarea?: ElementRef<HTMLTextAreaElement>
  @ViewChild('lineGutter') private lineGutter?: ElementRef<HTMLDivElement>

  @Input() visible = false
  @Input() loading = false
  @Input() saving = false
  @Input() dirty = false
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() content = ''
  @Input() error = ''
  @Input() showSystemAction = false
  /** 是否显示行号（设置项，默认 true） */
  @Input() showLineNumbers = true
  /** ★ 2026-10-08：长行是否自动换行（设置项，默认 false = 横向滚动看全）。
   *  实现见 styles.ts 的 .is-soft-wrap —— 不能靠 wrap 属性（被作者 white-space:pre 压掉）。 */
  @Input() wordWrap = false
  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：外部编辑器改动尚未上传到服务器的醒目提示（方案 B） */
  @Input() externalEditPrompt = false

  copied = false
  private copyTimer?: any
  copiedSel = false
  private copySelTimer?: any
  hasSelectionText = false
  lineNumbersText = '1'
  lineGutterChars = 3
  private _lineCount = 1
  /** ★ 2026-10-13：行号重建的 rAF 合流句柄（连续输入时每帧最多重建一次） */
  private _lnRaf: ReturnType<typeof requestAnimationFrame> | null = null
  /** 合流期间待重建的文本 */
  private _lnPendingText: string | null = null

  /**
   * ★ 2026-11-05（Deepseek-V4.1-Flash）：软换行下的行号对齐。
   *
   * 背景：行号栏是一整块 `white-space: pre` 的纯文本，一行行号 = 一个 18px 行盒。
   * 打开「自动换行」后，textarea 里一个**逻辑行**可能占多个**视觉行**，两边高度就对不上，
   * 于是 2026-10-08 干脆在换行时把行号藏起来。用户不接受（「VSCode 都没问题」）。
   *
   * 现在按 VS Code 的口径还原：行号只标逻辑行，折行的续行**留空行**（parts 里插空串），
   * 这样每个行号仍然精确落在对应逻辑行的首行上。每个逻辑行占几个视觉行由离屏镜像实测。
   *
   * 为什么必须"实测"而不是"算"：折行点取决于字体度量、中日韩字符（可任意断行）、
   * 超长单词硬断、制表位（tab-size:8）……纯算术估计必然在边缘行错位。
   * 无头实测（.workbuddy/verify/editor-wrap-linecount-bench.html）：
   *   - 镜像逐行读高度与 textarea 实际折行（scrollHeight 反推）在 ascii/中文/超长无空格/tab/混合
   *     五组样本上**完全一致**；
   *   - 全量测量 2 万行 ≈ 0.25~0.59s，8 万行 ≈ 1.2~2.9s ⇒ 设行数上限，超限跳过（宁可不显示，也不卡）；
   *   - 只改一行时增量重测 ≈ 10ms，且结果与全量一致 ⇒ 打字时不卡。
   */
  private static readonly WRAP_ROW_MAX_LINES = 30000
  /** 离屏镜像容器（与 textarea 同字体/同字距/同 tab-size，宽度 = 文本可用宽） */
  private _wrapMirrorEl: HTMLDivElement | null = null
  /** 每个逻辑行的视觉行数（1 = 未折行）；长度必须与逻辑行数一致，否则视为失效 */
  private _wrapRows: number[] = []
  /** 与 _wrapRows 对应的文本快照（增量比对用） */
  private _wrapRowsText = ''
  /** 上次测量时用的文本可用宽（宽度一变就得全量重测） */
  private _wrapRowsAvail = -1
  /** 行数超上限而放弃对齐 ⇒ 行号栏整体不显示（避免显示错位行号） */
  wrapGutterSkipped = false
  /** 尺寸变化重测的 rAF 句柄 */
  private _wrapResizeRaf: number | null = null
  private _wrapResizeObs: ResizeObserver | null = null
  /** observer 当前盯着的 textarea（overlay 随 *ngIf 重建后必须改盯新元素） */
  private _wrapObservedEl: HTMLTextAreaElement | null = null

  textMenuVisible = false
  textMenuX = 0
  textMenuY = 0
  textMenuHasSelection = false
  textMenuCanPaste = false

  @Output() contentChange = new EventEmitter<string>()
  @Output() save = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()
  // ★ 2026-09-20 A8 审计修复：删除死输出 closeConfirm（从不 emit，父模板也未绑定）
  @Output() systemAction = new EventEmitter<void>()
  /** ★ 2026-10-08：显示开关变更 —— 由父级写入配置（含持久化），本组件只发事件 */
  @Output() wordWrapChange = new EventEmitter<boolean>()
  @Output() lineNumbersChange = new EventEmitter<boolean>()

  @Input() i18n!: SftpI18nService

  maximized = SftpEditorDialogComponent.loadMaximized()

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

  /** 本地正在编辑时禁止用父级 content 回写 textarea（否则会清空浏览器原生撤销栈并导致粘贴卡顿） */
  private _localEditing = false
  /** textarea 因 *ngIf 刚创建，需在 AfterViewChecked 同步一次 content */
  private _pendingSync = false
  /** ★ 2026-10-14：打开后待聚焦正文（在 ngAfterViewChecked 里兑现，此时内容已同步完成） */
  private _pendingFocus = false
  /** ★ 2026-10-08：行号栏因「自动换行」关闭而重新挂载，需在 AfterViewChecked 对齐一次滚动位置 */
  private _pendingGutterSync = false

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
    this._safeDetect()
  }

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpEditorDialogComponent.loadMaximized()
      this._localEditing = false
      this._pendingSync = true
      this._pendingFocus = true
    }
    if (changes['visible']?.currentValue === false) {
      this.textMenuVisible = false
      this._localEditing = false
      this._pendingSync = false
      this._pendingGutterSync = false
      this._pendingFocus = false
      // ★ 2026-10-19 P2-18：与 ngOnDestroy 同一套复位——关掉对话框就把「已复制」残留态
      //   与在途的 1.5s 定时器一起撤掉，否则 1.5s 内重开会误显示「已复制全XXX」。
      this._resetCopyFeedback()
      this._unbindCtxTarget()
    }
    if (changes['loading']) {
      if (this.loading) {
        this._localEditing = false
      } else if (!this.error) {
        this._localEditing = false
        this._pendingSync = true
      }
    }
    // 仅外部内容变更（打开文件 / 外部编辑器回写等）才同步到 DOM
    if (changes['content'] && !this._localEditing) {
      this._syncTextareaFromContent()
    }
    if (changes['showLineNumbers'] || (changes['content'] && !this._localEditing) || changes['visible']) {
      this._scheduleRebuildLineNumbers(this.editorTextarea?.nativeElement?.value ?? this.content ?? '', true)
    }
    // ★ 2026-10-08：换行开关 —— 行号栏随 *ngIf 挂载/卸载，关闭换行时需在视图更新后重新对齐滚动位置
    if (changes['wordWrap']) {
      this._scheduleRebuildLineNumbers(this.editorTextarea?.nativeElement?.value ?? this.content ?? '', true)
      if (changes['wordWrap'].currentValue !== true) this._pendingGutterSync = true
    }
    this.cdr.markForCheck()
  }

  ngAfterViewChecked(): void {
    const target = (!this.loading && !this.error && this.editorTextarea?.nativeElement) || null
    this._bindCtxTarget(target)
    // ★ 2026-11-05：盯住 textarea 宽度 —— 软换行下折行点随宽度变，行号对齐必须跟着重测
    if (target && this.wordWrap) this._ensureWrapResizeObserver(target)
    if (this._pendingSync && target) {
      this._pendingSync = false
      this._syncTextareaFromContent()
      this._scheduleRebuildLineNumbers(target.value, true)
      this.onEditorScroll()
    }
    if (this._pendingGutterSync) {
      this._pendingGutterSync = false
      this.onEditorScroll()
    }
    // ★ 2026-10-14：打开编辑器后把焦点落进正文 —— 与被删的旧 textarea 版一致，也是
    //   Ctrl+A / Ctrl+C/V / 直接打字「开箱可用」的前提（此前必须先在正文里点一下，
    //   否则按键全落在遮罩上，Ctrl+A 甚至会去选整个文档）。
    //   必须放在 _pendingSync 之后：先同步内容再聚焦，避免聚焦时滚动位置被内容替换打乱。
    if (this._pendingFocus && target) {
      this._pendingFocus = false
      target.focus({ preventScroll: true })
      this.onEditorScroll()
    }
  }

  ngOnDestroy(): void {
    this._destroyed = true
    // ★ 2026-10-13：取消未触发的行号重建帧回调（对话框可能在 rAF 兑现前被销毁）
    this._cancelRebuildLineNumbers()
    // ★ 2026-11-05：软换行行号对齐的旁挂资源一起摘掉（ResizeObserver 是全局回调，不摘会泄露）
    if (this._wrapResizeRaf != null) { cancelAnimationFrame(this._wrapResizeRaf); this._wrapResizeRaf = null }
    if (this._wrapResizeObs) { this._wrapResizeObs.disconnect(); this._wrapResizeObs = null }
    if (this._wrapMirrorEl) { try { this._wrapMirrorEl.remove() } catch { /* ignore */ } this._wrapMirrorEl = null }
    this._wrapRows = []
    this._wrapRowsText = ''
    this._unbindCtxTarget()
    this._resetCopyFeedback()
  }

  /** ★ 2026-10-19 P2-18：「已复制」反馈态与两枚 1.5s 定时器一起复位（关闭对话框 / 销毁共用） */
  private _resetCopyFeedback(): void {
    if (this.copyTimer) { clearTimeout(this.copyTimer); this.copyTimer = undefined }
    if (this.copySelTimer) { clearTimeout(this.copySelTimer); this.copySelTimer = undefined }
    this.copied = false
    this.copiedSel = false
  }

  onEditorScroll(): void {
    const ta = this.editorTextarea?.nativeElement
    const g = this.lineGutter?.nativeElement
    if (ta && g) g.scrollTop = ta.scrollTop
  }

  /**
   * ★ 2026-10-13 P2 修复：行号重建的调度入口。
   *   原实现在**每次按键**（onTextareaInput）同步重建：先全文逐字符 charCodeAt 数换行，
   *   行数变化再 new Array(n).join —— 5MB（约 20 万行）文件上每次按键都是 O(全文)，
   *   输入明显卡顿。现做两点优化：
   *   ① **rAF 合流**：一帧内的多次输入只重建一次（行号比文本晚一帧，肉眼不可辨）；
   *   ② **计数改 indexOf 扫描**：走 V8 原生子串搜索，比逐字符 charCodeAt 快一个量级。
   *   immediate=true 用于打开/外部回写等必须同步生效的场景。
   */
  private _scheduleRebuildLineNumbers(text: string, immediate = false): void {
    if (!this.showLineNumbers) {
      this._cancelRebuildLineNumbers()
      this._lineCount = 0
      this.lineNumbersText = ''
      return
    }
    if (immediate) {
      this._cancelRebuildLineNumbers()
      this._lnPendingText = text
      this._runRebuildLineNumbers()
      return
    }
    this._lnPendingText = text
    if (this._lnRaf != null) return
    this._lnRaf = requestAnimationFrame(() => {
      this._lnRaf = null
      this._runRebuildLineNumbers()
    })
  }

  private _cancelRebuildLineNumbers(): void {
    if (this._lnRaf != null) {
      cancelAnimationFrame(this._lnRaf)
      this._lnRaf = null
    }
    this._lnPendingText = null
  }

  private _runRebuildLineNumbers(): void {
    const text = this._lnPendingText
    this._lnPendingText = null
    if (text == null) return
    if (!this.showLineNumbers) {
      this._lineCount = 0
      this.lineNumbersText = ''
      this._dropWrapRows()
      return
    }
    let n = 1
    let i = text.indexOf('\n')
    while (i !== -1) {
      n++
      i = text.indexOf('\n', i + 1)
    }
    this.lineGutterChars = Math.max(3, String(n).length)

    // ★ 2026-11-05：软换行 ⇒ 先保证「每逻辑行的视觉行数」是当前文本的（全量或增量）
    if (this.wordWrap) this._syncWrapRows(text, n)
    else if (this._wrapRows.length) this._dropWrapRows()

    const sameLines = n === this._lineCount && !!this.lineNumbersText
    // 行数没变、也不是软换行（没有需要重排的空行）⇒ 连文本都不用重建
    if (sameLines && !this.wordWrap) return
    this._lineCount = n

    const text2 = this._buildLineNumbersText(n)
    if (text2 === this.lineNumbersText) return
    this.lineNumbersText = text2
    // 行号高度变了：textarea 滚动位置不变的情况下 gutter 也要跟着对齐
    this._pendingGutterSync = true
  }

  /**
   * 生成行号栏文本：普通模式一行一个数字；软换行模式在逻辑行之间**插入空行**，
   * 使每个数字都落在该逻辑行的首行（VS Code 的做法）。
   * 空行数 = 该逻辑行的视觉行数 - 1。
   */
  private _buildLineNumbersText(n: number): string {
    const rows = this._wrapRows
    const aligned = this.wordWrap && rows.length === n
    if (!aligned) {
      const plain = new Array<string>(n)
      for (let k = 0; k < n; k++) plain[k] = String(k + 1)
      return plain.join('\n')
    }
    // 先数一下总件数，一次性 new Array → 避免 push 时反复扩容
    let total = n
    for (let k = 0; k < n; k++) total += rows[k] - 1
    const parts = new Array<string>(total)
    let w = 0
    for (let k = 0; k < n; k++) {
      parts[w++] = String(k + 1)
      for (let r = 1; r < rows[k]; r++) parts[w++] = ''
    }
    return parts.join('\n')
  }

  /** 换行开关关闭 / 内容失效时丢掉视觉行缓存 */
  private _dropWrapRows(): void {
    this._wrapRows = []
    this._wrapRowsText = ''
    this._wrapRowsAvail = -1
    if (this.wrapGutterSkipped) this.wrapGutterSkipped = false
    if (this._wrapMirrorEl) {
      try { this._wrapMirrorEl.textContent = '' } catch { /* ignore */ }
    }
  }

  /**
   * 让 _wrapRows 与 text 同步：宽度变了或行数对不上 ⇒ 全量重测；否则只重测变化的行区间。
   */
  private _syncWrapRows(text: string, n: number): void {
    const ta = this.editorTextarea?.nativeElement
    if (!ta || !ta.isConnected) return
    const avail = this._textAvailWidth(ta)
    const sameWidth = Math.abs(avail - this._wrapRowsAvail) < 0.5
    if (sameWidth && this._wrapRows.length === n && this._wrapRowsText && this._patchWrapRows(text)) return
    this._measureWrapRows(text, n, avail)
  }

  /** textarea 里可用于排版的宽度（扣掉左右内边距；clientWidth 已排除滚动条） */
  private _textAvailWidth(ta: HTMLTextAreaElement): number {
    const cs = getComputedStyle(ta)
    const padX = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')
    return Math.max(40, ta.clientWidth - padX)
  }

  /** textarea 的实际行高（px）。行号栏是 18px 硬编码，两者必须同源比对 */
  private _lineHeightPx(ta: HTMLTextAreaElement): number {
    const cs = getComputedStyle(ta)
    const lh = parseFloat(cs.lineHeight || '')
    if (lh > 0) return lh
    const fs = parseFloat(cs.fontSize || '') || 12
    return fs * 1.5
  }

  /**
   * 建/取离屏镜像：必须与 textarea 的排版参数**逐项一致**，否则折行点不同，测出来的行数就是错的。
   * ⛔ 不要用 `getComputedStyle().cssText` 搬样式 —— Chromium 里它返回空串（实测），
   *    镜像会退回默认 16px 字体，测出来每行都多一行。
   */
  private _ensureWrapMirror(ta: HTMLTextAreaElement): HTMLDivElement | null {
    const host = this.overlayEl?.nativeElement ?? ta.parentElement
    if (!host) return null
    const box = this._wrapMirrorEl
    if (box && box.isConnected) return box
    const cs = getComputedStyle(ta)
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = [
      'position:absolute', 'left:-99999px', 'top:0', 'visibility:hidden', 'pointer-events:none',
      'box-sizing:content-box', 'padding:0', 'margin:0', 'border:0', 'overflow:hidden',
      'white-space:pre-wrap', 'overflow-wrap:break-word',
      'font-family:' + cs.fontFamily, 'font-size:' + cs.fontSize, 'line-height:' + cs.lineHeight,
      'letter-spacing:' + cs.letterSpacing, 'word-spacing:' + cs.wordSpacing,
      'tab-size:' + cs.tabSize, 'font-variant-ligatures:none', 'text-align:left',
    ].join(';')
    host.appendChild(el)
    this._wrapMirrorEl = el
    return el
  }

  private static _fillWrapCell(cell: HTMLElement, line: string): void {
    // 空行也要占一个行高 —— 塞零宽空格（宽度为 0，不影响折行判断）
    cell.textContent = line.length ? line : '\u200b'
  }

  /** 全量测量：每个逻辑行一个块级 div，一次布局后读各自高度 */
  private _measureWrapRows(text: string, n: number, avail: number): void {
    if (n > SftpEditorDialogComponent.WRAP_ROW_MAX_LINES) {
      // 行数太多：测量本身要几秒，宁可不显示行号也不要把编辑器卡住
      this._dropWrapRows()
      this.wrapGutterSkipped = true
      this._wrapRowsText = text
      return
    }
    const ta = this.editorTextarea?.nativeElement
    if (!ta) return
    const box = this._ensureWrapMirror(ta)
    if (!box) return
    const lh = this._lineHeightPx(ta)
    box.style.width = avail + 'px'
    const lines = text.split('\n')
    const frag = document.createDocumentFragment()
    for (const line of lines) {
      const cell = document.createElement('div')
      SftpEditorDialogComponent._fillWrapCell(cell, line)
      frag.appendChild(cell)
    }
    box.textContent = ''
    box.appendChild(frag)
    const rows = new Array<number>(lines.length)
    const cells = box.children
    for (let k = 0; k < cells.length; k++) {
      const h = (cells[k] as HTMLElement).getBoundingClientRect().height
      rows[k] = Math.max(1, Math.round(h / lh))
    }
    this._wrapRows = rows
    this._wrapRowsText = text
    this._wrapRowsAvail = avail
    this.wrapGutterSkipped = false
  }

  /**
   * 增量：按行做前后缀比对，只重建变化区间对应的镜像 div 并重测这几行。
   * 返回 false 表示缓存不可用（调用方改走全量）。
   * 之所以可行：每个逻辑行都是独立的块级盒子，某一行内容变了只影响它自己的折行。
   */
  private _patchWrapRows(text: string): boolean {
    const ta = this.editorTextarea?.nativeElement
    const box = this._wrapMirrorEl
    if (!ta || !box || !box.isConnected) return false
    const oldText = this._wrapRowsText
    if (!oldText || oldText === text) return true
    const oldLines = oldText.split('\n')
    const newLines = text.split('\n')
    if (oldLines.length !== this._wrapRows.length || box.children.length !== oldLines.length) return false

    const min = Math.min(oldLines.length, newLines.length)
    let p = 0
    while (p < min && oldLines[p] === newLines[p]) p++
    let s = 0
    while (s < min - p && oldLines[oldLines.length - 1 - s] === newLines[newLines.length - 1 - s]) s++
    const oldCount = oldLines.length - p - s
    const newCount = newLines.length - p - s
    if (oldCount === 0 && newCount === 0) {
      this._wrapRowsText = text
      return true
    }
    // 行数变化太大（例如粘贴整份文件）时增量不划算，交回全量
    if (newCount > 2000 || oldCount > 2000) return false

    const lh = this._lineHeightPx(ta)
    const frag = document.createDocumentFragment()
    for (let k = 0; k < newCount; k++) {
      const cell = document.createElement('div')
      SftpEditorDialogComponent._fillWrapCell(cell, newLines[p + k])
      frag.appendChild(cell)
    }
    for (let k = 0; k < oldCount; k++) box.children[p].remove()
    box.insertBefore(frag, box.children[p] ?? null)
    const rows = new Array<number>(newCount)
    for (let k = 0; k < newCount; k++) {
      const h = (box.children[p + k] as HTMLElement).getBoundingClientRect().height
      rows[k] = Math.max(1, Math.round(h / lh))
    }
    this._wrapRows.splice(p, oldCount, ...rows)
    this._wrapRowsText = text
    return true
  }

  /**
   * 编辑器宽度变化（对话框缩放 / 最大化切换 / 面板宽度变）⇒ 折行点全变 ⇒ 全量重测。
   * 用 rAF 合流，避免拖拽缩放时每个 ResizeObserver 回调都 O(全文) 重排。
   */
  private _ensureWrapResizeObserver(ta: HTMLTextAreaElement): void {
    if (typeof ResizeObserver !== 'function') return
    // ⛔ overlay 会随 visible 重建，textarea 是**新元素**；只判 `_wrapResizeObs` 非空会让
    //    observer 一直盯着已卸载的旧节点，宽度变化从此再也收不到通知。
    if (this._wrapResizeObs && this._wrapObservedEl === ta) return
    if (this._wrapResizeObs) { this._wrapResizeObs.disconnect() }
    this._wrapObservedEl = ta
    this._wrapResizeObs = new ResizeObserver(() => {
      if (!this.wordWrap || !this.showLineNumbers) return
      if (this._wrapResizeRaf != null) return
      this._wrapResizeRaf = requestAnimationFrame(() => {
        this._wrapResizeRaf = null
        const el = this.editorTextarea?.nativeElement
        if (!el || !this.wordWrap) return
        if (Math.abs(this._textAvailWidth(el) - this._wrapRowsAvail) < 0.5) return
        this.zone.run(() => {
          this._scheduleRebuildLineNumbers(el.value, true)
          this.cdr.markForCheck()
        })
      })
    })
    this._wrapResizeObs.observe(ta)
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

  private _syncTextareaFromContent(): void {
    const el = this.editorTextarea?.nativeElement
    if (!el) {
      this._pendingSync = true
      return
    }
    const next = this.content ?? ''
    if (el.value !== next) el.value = next
    this._scheduleRebuildLineNumbers(next, true)
  }

  private _applyLocalValue(newVal: string, cursor?: number): void {
    this._localEditing = true
    const ta = this.editorTextarea?.nativeElement
    if (ta && ta.value !== newVal) ta.value = newVal
    this.hasSelectionText = false
    this._scheduleRebuildLineNumbers(newVal, true)
    this.contentChange.emit(newVal)
    if (cursor != null) {
      Promise.resolve().then(() => {
        // ★ 2026-10-25 BUG-H2 修复：组件销毁后异步回调中仍可能访问已销毁的 textarea
        if (this._destroyed) return
        const el = this.editorTextarea?.nativeElement
        if (el) { el.setSelectionRange(cursor, cursor); el.focus() }
      })
    }
  }

  onTextareaInput(ev: Event): void {
    this._localEditing = true
    const value = (ev.target as HTMLTextAreaElement).value
    this.hasSelectionText = false
    // ★ 2026-10-13：合流到下一帧，避免每次按键都 O(全文) 重建行号
    this._scheduleRebuildLineNumbers(value)
    this.contentChange.emit(value)
  }

  copy(): void {
    const text = this.editorTextarea?.nativeElement.value ?? this.content ?? ''
    const ok = copyTextToClipboard(text)
    if (ok) this.showCopiedFeedback()
  }

  copySelection(): boolean {
    const sel = textareaSelectedText(this.editorTextarea)
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
   * ★ 2026-10-14：快捷键（Ctrl/Cmd+C）走这里的复制，而不是让浏览器原生复制 —— 原生复制
   *   没有任何反馈，用户无法确认是否复制成功、更分不清复制的是全文还是选中（用户报障）。
   * 语义：有选区 → 复制选中；无选区 → 复制全文（与「复制」按钮一致，避免静默无反应）。
   * 判定用 copySelection() 的返回值（实时读 textarea 选区），不依赖 hasSelectionText。
   */
  copyForShortcut(): void {
    if (!this.copySelection()) this.copy()
  }

  updateHasSelection(): void {
    const next = textareaHasSelection(this.editorTextarea)
    if (next === this.hasSelectionText) return
    this.hasSelectionText = next
    this.cdr.markForCheck()
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

  onTextareaBlur(): void {
    if (!this.hasSelectionText) return
    this.hasSelectionText = false
    this.cdr.markForCheck()
  }

  onTextMenuAction(a: TextMenuAction): void {
    switch (a) {
      case 'copySelection': this.copySelection(); break
      case 'copyAll': this.copy(); break
      case 'selectAll': this.selectAllText(); break
      case 'cut': this.cutSelection(); break
      case 'paste': void this.pasteText(); break
      default: break
    }
    this.textMenuVisible = false
    this.cdr.markForCheck()
  }

  /** ★ 2026-10-14：聚焦编辑器并全选（右键菜单「全选」与面板转交的 Ctrl+A 共用） */
  selectAllText(): void {
    const ta = this.editorTextarea?.nativeElement
    if (!ta) return
    ta.focus()
    ta.select()
    this.updateHasSelection()
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
      this._applyLocalValue(ta.value.slice(0, s) + ta.value.slice(e), s)
    }
  }

  private async pasteText(): Promise<void> {
    const ta = this.editorTextarea?.nativeElement
    if (!ta || !(navigator.clipboard && (navigator.clipboard as any).readText)) return
    let text = ''
    try { text = await (navigator.clipboard as any).readText() } catch { return }
    if (!text) return
    // ★ 2026-10-30 P3 修复（SF-34）：`readText()` 是异步的，期间用户可能已切到另一个文件
    //   （本对话框复用同一个实例，path/content 被整体替换）或已关闭对话框。原实现继续用
    //   await **之前**捕获的 ta 引用与它的 selectionStart 拼串 ⇒ 把剪贴板内容插进**另一个文件**，
    //   还会 emit contentChange 把这份串写回错误的文件。这里两个判据都要过：
    //   ① 组件未销毁；② textarea 还是同一个 DOM 节点（换文件会重建）。
    if (this._destroyed) return
    const taNow = this.editorTextarea?.nativeElement
    if (!taNow || taNow !== ta) return
    const s = ta.selectionStart ?? ta.value.length
    const e = ta.selectionEnd ?? ta.value.length
    this._applyLocalValue(ta.value.slice(0, s) + text + ta.value.slice(e), s + text.length)
  }

  get canCopy(): boolean {
    return !!(this.editorTextarea?.nativeElement.value || this.content)
  }

  get copyLabel(): string {
    // ★ 2026-10-14：反馈区分「全部 / 选中」—— 原先两种复制都只显示「已复制」，
    //   用户看不出刚才复制的是整份文件还是只是一段选区。
    return this.copied ? this.i18n.t('file.copiedAll') : this.i18n.t('file.copy')
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

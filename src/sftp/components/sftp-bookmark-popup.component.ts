/**
 * SFTP+ 书签悬浮菜单（从主面板抽离）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-18
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-23 — 修复「常驻弹层挡住编辑器/查看器」：`.bookmark-popup` 的 z-index 200 → 90。
 *             全屏对话框的 `.overlay` 声明 100（查看器/编辑器 110、删除确认 120），200 会让弹层浮在遮罩之上；
 *             90 仍高于面板内最高的 60（连接选择器下拉），右键菜单/toast 照旧更高。
 *             同日 — 修复「鼠标划过书签、尤其滚动面板时，行边界偶尔闪出一条 1px 细线」（像素实测取证）：
 *             截图采样得背景 rgb(23,23,23)、hover 行 rgb(47,47,48)，而异常线单行为 43/44/49/51
 *             —— 高于 `--_hover` 单层叠加的理论值 36，说明**半透明背景在行边界被绘制了不止一次**
 *             （alpha 叠加 ⇒ 更亮），且只出现在滚动中，属滚动重绘脏矩形 + 圆角抗锯齿的组合残留。
 *             四道收口：①行高整数量化（bm-name/bm-path 显式 line-height 18/14px，行高 43px 整，
 *             边界不再落在半物理像素上）；②hover/current/闪烁背景改用 `color-mix(…, var(--_bg))`
 *             的不透明合成色，重复绘制也不会叠亮；③去掉 `background` 过渡（滚动中 hover 频繁切换时
 *             过渡层进出合成层会在边界留痕）；④列表加 `contain: paint` 限制脏矩形范围。
 *             同日 — footer 排序按钮右侧新增图钉「面板常驻」（panelPinned 输入 / pinToggle 输出）：
 *             与设置页「选中书签后关闭书签面板」是同一份配置的反向表达（钉住 = 选中后不关），
 *             钉住时图标实心 + 主色、未钉住时描边淡色；排序按钮的 `margin-right: auto` 移交给图钉，
 *             两个图标按钮紧邻成一组。
 *             同日续：常驻语义扩展 —— 钉住后点面板其它位置 / 滚轮 / 右键 / 框选 / 缩放窗口都不关，
 *             只有「关闭」按钮、再点一次 ★ 按钮、Esc 才关（关闭判定在面板侧，本组件仍只报状态）。
 *             2026-10-22 — 书签排序改三档：sortByUsage(boolean) → sortMode，footer 按钮图标三态循环（manual 列表 / usage 柱状 / name 三条渐长横线），tooltip 走 sortModeLabel；非 manual 不可拖拽。
 *             同日 — 「+本地」→「+局部」：按钮/分组标题文案改由 i18n 提供（bookmark.addCurrentShort /
 *             bookmark.forConnection），本文件只更新注释口径 —— 归属范围 = 当前 Tabby 标签页的连接，
 *             与栏端点（本地/远程）无关。
 *             2026-10-21 — 三处 *ngFor 补 trackBy（按 b.id / scope）：父面板传进来的列表是方法调用结果
 *             （每轮 CD 新数组），原先无 trackBy ⇒ 每轮销毁重建所有书签行，行背景/描边在重绘中间帧
 *             会闪出 1px 横线（用户反馈「偶尔出现一些线条，然后就没了」）。
 *             2026-10-20 — 书签拖拽手柄（bm-drag-handle）增加悬停提示：手动排序时「拖拽排序书签，右键编辑书签」，
 *             频率排序（拖拽已禁用）时改为「无法拖拽、右键编辑」，文案走 bookmark.dragHint / bookmark.dragHintSorted。
 *             2026-10-19 — 新增 height 输入 + 尺寸拖拽手柄（左/下/左下角，resizeStart 输出；
 *             双击手柄还原：左边→只还原宽度、下边→只还原高度、左下角→两者（resizeReset 带方向）；新增 linkEnabled/newLinkedPath 输入（联动书签表单）；
 *             新增「联动」标签（bm-link-badge，与「全局」同样式、排在其后）与 footer 左侧排序切换
 *             （sortByUsage 输入 / sortToggle 输出，只显示图标且**不高亮**，频率模式下禁用拖拽）。
 *             2026-10-19 全量审计 P2-20：去掉「取消 / 保存书签」两处硬编码中文兜底
 *              （`i18n.t('app.cancel') || '取消'`、`i18n.t('bookmark.save') || '保存书签'`）。
 *              i18n.t() 已有「当前语言 → en-US → 返回 key」三级回退，硬编码兜底只在 key 缺失时
 *              生效，而那时它做的是**静默显示错语言**，反而掩盖了缺 key；故直接取 t() 结果。
 *              2026-10-13 — 修复标题空格与定位按钮尺寸：标题改用 i18n 插值
 *              `bookmark.title`（{pane} 占位），由翻译自身决定中西文空格；定位按钮
 *              加 box-sizing/min-height/overflow:hidden 并把 SVG 改为 11×11，防止宿主
 *              全局 button 样式或 flex 布局把按钮/图标撑大。
 *              2026-09-21 — 支持父级动态 width/maxHeight（多拆分窄窗 clamp）
 *              2026-09-20 — 支持设置项：是否按连接/全局分组；分组顺序可定制；
 *              关闭分组后可跨范围自由拖拽，全局书签名称右侧显示「全局」标签；
 *              头部增加「定位当前书签」按钮，滚动到路径匹配项并短暂闪烁
 */
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core'

import { Bookmark } from '../../services/sftp-bookmarks.service'
import { SftpI18nService } from '../../services/sftp-i18n.service'
import type { BookmarkScope } from '../core/panel-types'
import type { BookmarkSortMode } from '../../tabby/config-provider'

@Component({
  selector: 'sftp-bookmark-popup',
  template: `
    <div class="bookmark-popup"
      [style.top.px]="top"
      [style.left.px]="left"
      [style.width.px]="width"
      [style.maxHeight.px]="maxHeight"
      [style.height.px]="height"
      (mousedown)="$event.stopPropagation()"
      (wheel)="$event.stopPropagation()">
      <div class="popup-arrow" [style.left.px]="arrowLeft"></div>
      <div class="popup-header">
        <div class="popup-title">{{ i18n.t('bookmark.title', { pane: paneLabel }) }}</div>
        <div class="bookmark-header-actions">
          <button class="header-action-btn header-locate-btn"
                  type="button"
                  (click)="locateCurrent()"
                  [disabled]="!hasCurrentBookmark"
                  [title]="hasCurrentBookmark ? i18n.t('bookmark.locate') : i18n.t('bookmark.locateNone')">
            <svg viewBox="0 0 1024 1024" width="11" height="11" aria-hidden="true">
              <path fill="currentColor"
                d="M481.792 838.656a328.448 328.448 0 0 1-297.152-297.152H64v-59.712h120.704a328.448 328.448 0 0 1 297.152-297.152V64h59.712v120.704a328.448 328.448 0 0 1 297.152 297.152h120.704v59.712h-120.704a328.448 328.448 0 0 1-297.152 297.152v120.704h-59.776v-120.768z m0-59.968v-117.76h59.712v117.76a268.8 268.8 0 0 0 237.12-237.12h-117.76v-59.776h117.76a268.672 268.672 0 0 0-237.12-237.12v117.76h-59.712v-117.76a268.8 268.8 0 0 0-237.12 237.12h117.76v59.712h-117.76a268.864 268.864 0 0 0 237.12 237.184z"/>
            </svg>
          </button>
          <!-- ⛔ 2026-10-19（Deepseek-V4.1-Flash）：不要按「当前栏有无连接身份」禁用这个按钮！
               书签**路径类型**（本地/远程）由栏端点决定，「+局部 / +全局」是**归属范围**。
               ★ 2026-10-22：归属键改成「面板所在 Tab 的连接」——远程 Tab 是 user@host，本地 Tab 是
               LOCAL_SCOPE_KEY（'[local]'），所以本地栏同样能加出真正的局部书签，按钮永远可用。 -->
          <button class="header-action-btn"
                  (click)="addScopeClick.emit('connection')"
                  [class.active]="addScope === 'connection'"
                  [title]="i18n.t('bookmark.addLocal')">{{ i18n.t('bookmark.addCurrentShort') }}</button>
          <button class="header-action-btn"
                  (click)="addScopeClick.emit('global')"
                  [class.active]="addScope === 'global'"
                  [title]="i18n.t('bookmark.addGlobal')">{{ i18n.t('bookmark.addGlobalShort') }}</button>
        </div>
      </div>
      <div class="bookmark-add-form" *ngIf="addScope">
        <input [ngModel]="newName" (ngModelChange)="newNameChange.emit($event)"
          placeholder="{{ i18n.t('bookmark.name') }} ({{ i18n.t('app.optional') }})" />
        <input [ngModel]="newPath" (ngModelChange)="newPathChange.emit($event)"
          placeholder="{{ i18n.t('bookmark.path') }}" />
        <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：联动路径（仅「联动书签」开关开启时出现）。
             点击该书签时本栏跳 path、另一栏跳这里填的路径。 -->
        <input *ngIf="linkEnabled" class="bookmark-link-input"
          [ngModel]="newLinkedPath" (ngModelChange)="newLinkedPathChange.emit($event)"
          placeholder="{{ i18n.t('bookmark.linkPath') }}" />
        <div class="bookmark-form-actions">
          <button class="btn-cancel" (click)="cancelEdit.emit()">{{ i18n.t('app.cancel') }}</button>
          <button class="btn-confirm" (click)="addBookmark.emit()" [disabled]="!newPath.trim()">
            {{ editingId ? i18n.t('bookmark.save') : i18n.t('bookmark.add') }}
          </button>
        </div>
      </div>
      <div class="bookmark-list" #bookmarkList>
        <!-- 分组模式：按 groupOrder 渲染「局部 / 全局」块（局部 = 当前 Tab 连接，见 _bookmarkScopeKey） -->
        <ng-container *ngIf="groupByScope">
          <ng-container *ngFor="let scope of groupOrder; trackBy: trackByScope">
            <div class="bookmark-scope-label" *ngIf="bookmarksOf(scope).length">
              {{ scopeLabel(scope) }}
            </div>
            <div class="bookmark-item" *ngFor="let b of bookmarksOf(scope); let i = index; trackBy: trackByBookmark"
              [attr.data-bm-id]="b.id"
              [class.current]="isCurrent(b)"
              [class.locate-flash]="flashId === b.id"
              (click)="gotoBookmark.emit(b)"
              (contextmenu)="contextMenu.emit({ bookmark: b, event: $event })"
              [draggable]="sortMode === 'manual'"
              (dragstart)="dragStart.emit({ event: $event, index: i, scope: scope })"
              (dragover)="dragOver.emit({ event: $event, index: i, scope: scope })"
              (dragend)="dragEnd.emit()"
              (drop)="drop.emit({ event: $event, index: i, scope: scope })"
              [class.drag-over-top]="dragOverIdx === i && dragOverScope === scope && !dragOverBottom"
              [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === scope && dragOverBottom"
              [class.dragging]="dragSourceIdx === i && dragSourceScope === scope"
              [title]="b.path">
              <span class="bm-drag-handle" [title]="dragHandleTitle">⠿</span>
              <div class="bm-info">
                <span class="bm-name-row">
                  <span class="bm-name">{{ b.name }}</span>
                  <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：配了联动路径的书签打「联动」标签（悬停看目标路径） -->
                  <span class="bm-link-badge" *ngIf="b.linkedPath" [title]="b.linkedPath">{{ i18n.t('bookmark.linkBadge') }}</span>
                </span>
                <span class="bm-path">{{ b.path }}</span>
              </div>
              <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark.emit(b.id)"
                title="{{ i18n.t('bookmark.remove') }}">✕</button>
            </div>
          </ng-container>
        </ng-container>

        <!-- 扁平模式：局部/全局混排，可跨范围拖拽；全局项左侧显示「全局」标签 -->
        <ng-container *ngIf="!groupByScope">
          <div class="bookmark-item" *ngFor="let b of allBookmarks; let i = index; trackBy: trackByBookmark"
            [attr.data-bm-id]="b.id"
            [class.current]="isCurrent(b)"
            [class.locate-flash]="flashId === b.id"
            (click)="gotoBookmark.emit(b)"
            (contextmenu)="contextMenu.emit({ bookmark: b, event: $event })"
            [draggable]="sortMode === 'manual'"
            (dragstart)="dragStart.emit({ event: $event, index: i, scope: 'all' })"
            (dragover)="dragOver.emit({ event: $event, index: i, scope: 'all' })"
            (dragend)="dragEnd.emit()"
            (drop)="drop.emit({ event: $event, index: i, scope: 'all' })"
            [class.drag-over-top]="dragOverIdx === i && dragOverScope === 'all' && !dragOverBottom"
            [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === 'all' && dragOverBottom"
            [class.dragging]="dragSourceIdx === i && dragSourceScope === 'all'"
            [title]="b.path">
            <span class="bm-drag-handle" [title]="dragHandleTitle">⠿</span>
            <div class="bm-info">
              <span class="bm-name-row">
                <span class="bm-name">{{ b.name }}</span>
                <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：标签顺序固定为「全局」在前、「联动」在后 -->
                <span class="bm-global-badge" *ngIf="!b.connectionKey"
                  [title]="i18n.t('bookmark.global')">{{ i18n.t('bookmark.globalBadge') }}</span>
                <span class="bm-link-badge" *ngIf="b.linkedPath" [title]="b.linkedPath">{{ i18n.t('bookmark.linkBadge') }}</span>
              </span>
              <span class="bm-path">{{ b.path }}</span>
            </div>
            <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark.emit(b.id)"
              title="{{ i18n.t('bookmark.remove') }}">✕</button>
          </div>
        </ng-container>
      </div>
      <div class="popup-footer">
        <!-- ★ 2026-10-22（Deepseek-V4.1-Flash）：排序三档循环 manual → usage → name，
             只显示图标（三种文字配色并存会显乱），tooltip 给出「当前模式 · 点击切换」。 -->
        <button class="popup-sort-btn"
          (click)="sortToggle.emit()"
          [title]="sortModeLabel + ' · ' + i18n.t('bookmark.sortHint')">
          <svg *ngIf="sortMode === 'manual'" viewBox="0 0 16 16" width="12" height="12" fill="none"
            stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
            <path d="M2.8 4.2h1.4M2.8 8h1.4M2.8 11.8h1.4"/>
            <path d="M6.4 4.2h6.8M6.4 8h6.8M6.4 11.8h6.8"/>
          </svg>
          <svg *ngIf="sortMode === 'usage'" viewBox="0 0 16 16" width="12" height="12" fill="none"
            stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M3.2 13V9.2M8 13V3.4M12.8 13V6.6"/>
          </svg>
          <!-- 名称排序：三条渐长的横线（字母序的常见隐喻），与上面两个图标笔画粗细一致 -->
          <svg *ngIf="sortMode === 'name'" viewBox="0 0 16 16" width="12" height="12" fill="none"
            stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
            <path d="M2.6 4.4h4.2M2.6 8h7.4M2.6 11.6h10.2"/>
          </svg>
        </button>
        <!-- ★ 2026-10-23（Deepseek-V4.1-Flash）：图钉「面板常驻」——与设置页「选中书签后关闭书签面板」
             是同一份配置的反向表达（钉住 = 选中后不关）。图标两态：钉住时实心 + 主色，未钉住时描边淡色；
             不用文字，避免 footer 出现第三种文案口径（排序按钮已经只有图标）。 -->
        <button class="popup-pin-btn" [class.is-on]="panelPinned"
          (click)="pinToggle.emit()"
          [title]="(panelPinned ? i18n.t('bookmark.pinOn') : i18n.t('bookmark.pinOff')) + ' · ' + i18n.t('bookmark.pinHint')">
          <svg viewBox="0 0 16 16" width="12" height="12"
            [attr.fill]="panelPinned ? 'currentColor' : 'none'"
            stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5.6 2.4h4.8l-.7 3.3 2 2v1.3H4.3V7.7l2-2z"/>
            <path d="M8 9v4.4" fill="none"/>
          </svg>
        </button>
        <button (click)="close.emit()">{{ i18n.t('app.close') }}</button>
      </div>
      <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：尺寸拖拽手柄（左边框 / 下边框 / 左下角）。
           手柄贴在容器边缘外侧 3px（容器 overflow:visible），只派发事件，几何计算在父级控制器。 -->
      <div class="popup-resize popup-resize-w"
        [title]="i18n.t('bookmark.resetWidth')"
        (mousedown)="resizeStart.emit({ dir: 'w', event: $event })"
        (dblclick)="resizeReset.emit('w')"></div>
      <div class="popup-resize popup-resize-s"
        [title]="i18n.t('bookmark.resetHeight')"
        (mousedown)="resizeStart.emit({ dir: 's', event: $event })"
        (dblclick)="resizeReset.emit('s')"></div>
      <div class="popup-resize popup-resize-sw"
        [title]="i18n.t('bookmark.resetSize')"
        (mousedown)="resizeStart.emit({ dir: 'sw', event: $event })"
        (dblclick)="resizeReset.emit('sw')"></div>
    </div>
  `,
  styles: [`
    .bookmark-popup {
      position: absolute;
      width: 320px; max-height: 420px;
      box-sizing: border-box;
      display: flex; flex-direction: column;
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      /* ★ 2026-10-23（Deepseek-V4.1-Flash）：90 —— 必须**低于**对话框遮罩。
         全屏对话框的 .overlay 各自声明 100（查看器/编辑器 110、删除确认 120），
         书签弹层原先写 200 ⇒ 常驻（图钉钉住）后打开编辑器/查看器，弹层会浮在对话框之上挡住内容
         （用户实测截图）。改成 90 仍高于面板内最高的 60（连接选择器下拉），
         面板内容的 5~20 不受影响；右键菜单 901+ 与 toast 照旧在它之上。
         ⛔ 别再往上调：任何 >100 都会重现「弹层盖住编辑器」。 */
      z-index: 90;
      overflow: visible;
      transform: translateZ(0);
      transition: none !important;
      animation: none !important;
    }
    .popup-arrow {
      position: absolute; top: -7px;
      width: 12px; height: 12px;
      background: var(--_bg);
      border-left: 1px solid var(--_border);
      border-top: 1px solid var(--_border);
      transform: rotate(45deg);
      z-index: 1;
      pointer-events: none;
    }
    .popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px 4px 10px;
    }
    .popup-title {
      font-weight: 700; color: var(--_primary); font-size: 13px;
      padding: 2px 2px;
    }
    .bookmark-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .header-action-btn {
      width: auto;
      min-width: 46px;
      height: 22px;
      border-radius: 5px;
      border: 1px solid var(--_border);
      background: transparent;
      color: var(--_text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      line-height: 1;
      padding: 0 6px;
      white-space: nowrap;
    }
    .header-action-btn:hover { background: var(--_hover); }
    .header-action-btn.active {
      border-color: var(--_primary);
      background: var(--_hover);
      color: var(--_primary);
    }
    .header-locate-btn {
      box-sizing: border-box;
      min-width: 22px;
      width: 22px;
      min-height: 22px;
      height: 22px;
      padding: 0;
      flex-shrink: 0;
      overflow: hidden;
      color: var(--_text);
      opacity: 0.75;
    }
    .header-locate-btn:hover:not(:disabled) {
      opacity: 1;
      color: var(--_primary);
    }
    .header-locate-btn:disabled {
      opacity: 0.28;
      cursor: default;
    }
    .header-locate-btn svg { display: block; width: 11px; height: 11px; }
    .popup-footer {
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 10px; border-top: 1px solid var(--_border);
    }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：排序切换按钮（footer 左侧）——只显示图标，
       因此要覆盖 .popup-footer button 的文本内边距，做成 18×18 的方形图标按钮。
       ★ 2026-10-23：margin-right: auto 交给右侧的图钉按钮（footer 左组由它收尾），
       这里改为 2px —— 两个图标按钮紧邻成一组，剩余空白留在组之后。 */
    .popup-footer .popup-sort-btn {
      width: 18px; height: 18px; padding: 0; margin-right: 2px;
      display: inline-flex; align-items: center; justify-content: center;
      border: none; background: transparent; color: var(--_text);
      cursor: pointer; opacity: 0.6; border-radius: 4px;
    }
    .popup-footer .popup-sort-btn:hover { opacity: 1; background: var(--_hover); }
    .popup-footer .popup-sort-btn svg { width: 12px; height: 12px; display: block; }
    /* ★ 2026-10-23（Deepseek-V4.1-Flash）：图钉「面板常驻」——尺寸/悬停与排序按钮一致；
       区别是它有「开/关」两态，所以钉住时用主色 + 不透明度 1（排序按钮是三态循环，不需要高亮）。 */
    .popup-footer .popup-pin-btn {
      width: 18px; height: 18px; padding: 0; margin-right: auto;
      display: inline-flex; align-items: center; justify-content: center;
      border: none; background: transparent; color: var(--_text);
      cursor: pointer; opacity: 0.6; border-radius: 4px;
    }
    .popup-footer .popup-pin-btn:hover { opacity: 1; background: var(--_hover); }
    .popup-footer .popup-pin-btn.is-on { color: var(--_primary); opacity: 1; }
    .popup-footer .popup-pin-btn svg { width: 12px; height: 12px; display: block; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：尺寸拖拽手柄（细条，hover 才显色，避免静态时干扰视觉） */
    .popup-resize { position: absolute; z-index: 3; }
    .popup-resize-w { left: -3px; top: 10px; bottom: 10px; width: 6px; cursor: col-resize; }
    .popup-resize-s { left: 10px; right: 10px; bottom: -3px; height: 6px; cursor: row-resize; }
    .popup-resize-sw { left: -3px; bottom: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
    .popup-resize:hover { background: var(--_primary); opacity: 0.35; border-radius: 3px; }
    .popup-footer button {
      padding: 4px 10px; border-radius: 6px; font-size: 11px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .popup-footer button:hover { background: var(--_hover); }
    .bookmark-add-form {
      display: flex; flex-direction: column; gap: 6px;
      padding: 0 10px 10px;
    }
    .bookmark-add-form input {
      width: 100%; padding: 6px 8px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_input-bg);
      color: var(--_text); font-size: 12px;
      caret-color: var(--_text, currentColor);
      -webkit-text-fill-color: var(--_text, currentColor);
      cursor: text;
      user-select: text !important;
      -webkit-user-select: text !important;
      box-sizing: border-box; outline: none;
    }
    .bookmark-add-form input::placeholder {
      color: var(--_text);
      opacity: 0.45;
    }
    .bookmark-add-form input::-webkit-input-placeholder {
      color: var(--_text);
      opacity: 0.45;
    }
    .bookmark-add-form input:focus,
    .bookmark-add-form input:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35) !important;
      outline: none !important;
    }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：主按钮改「描边 + 主题色文字」，不再用实心底 + 白字——
       当前主题的 --_primary 偏浅时，白字压在上面几乎看不清（截图实锤「保存书签」发灰发糊）。 */
    .bookmark-add-form .btn-confirm {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--_primary);
      background: transparent;
      color: var(--_primary);
      cursor: pointer;
      font-size: 11px;
      white-space: nowrap;
    }
    .bookmark-add-form .btn-confirm:hover { background: color-mix(in srgb, var(--_primary) 14%, transparent); }
    .bookmark-add-form .btn-confirm:disabled { opacity: 0.4; cursor: default; background: transparent; }
    .bookmark-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }
    .bookmark-add-form .btn-cancel {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text);
      cursor: pointer;
      white-space: nowrap;
    }
    .bookmark-add-form .btn-cancel:hover { background: var(--_hover); }
    .bookmark-scope-label {
      padding: 4px 10px 2px; font-size: 10px; font-weight: 600;
      color: var(--_primary); opacity: 0.6; text-transform: uppercase;
      border-bottom: 1px solid var(--_border); margin-bottom: 2px;
    }
    /* ★ 2026-10-23（Deepseek-V4.1-Flash）：contain: paint —— 把滚动的脏矩形限制在列表内，
       减少滚动中 hover 行反复进出重绘区时在行边界留下的 1px 残痕（详见文件头实测结论）。 */
    .bookmark-list {
      flex: 1; overflow-y: auto; min-height: 0;
      padding: 0 4px;
      contain: paint;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
    }
    /* ★ 2026-10-23（Deepseek-V4.1-Flash）：行高必须保持整数（5+18+1+14+5 = 43px），
       否则行边界落在半物理像素上，圆角背景的抗锯齿边缘会随滚动忽隐忽现。
       ⛔ 改 bm-name / bm-path 字号时同步改它们的 line-height，别让高度回到小数。 */
    .bookmark-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 6px; margin: 1px 0;
      cursor: pointer;
      /* ⛔ 不要给 background 加过渡：滚动面板时 hover 在行间快速切换，过渡层进出合成层的瞬间
         会在行边界留一条半透明残线（用户反馈的「偶尔闪出细线」）。只保留拖拽用的透明度过渡。 */
      transition: opacity 0.15s;
    }
    /* ★ 2026-10-23（Deepseek-V4.1-Flash）：hover 底色改成**不透明**合成色
       （= 原 rgba(128,128,128,0.12) 叠在弹层 --_bg 上的等价色）。
       半透明色一旦被重复绘制（滚动重绘、层边界）就会叠出更亮的一条线，不透明色怎么画都是同一色。 */
    .bookmark-item:hover { background-color: color-mix(in srgb, var(--_bg) 88%, #808080); }
    .bookmark-item.current {
      background-color: color-mix(in srgb, var(--_primary) 16%, var(--_bg));
      box-shadow: inset 2px 0 0 var(--_primary);
    }
    .bookmark-item.current .bm-name { color: var(--_primary); }
    .bookmark-item.locate-flash {
      animation: bm-locate-flash 0.85s ease;
    }
    /* 闪烁同样走不透明合成色（半透明版本在动画中间帧会被叠亮，看起来像白线扫过） */
    @keyframes bm-locate-flash {
      0%, 100% { background-color: color-mix(in srgb, var(--_primary) 16%, var(--_bg)); }
      35% { background-color: color-mix(in srgb, var(--_primary) 38%, var(--_bg)); }
      70% { background-color: color-mix(in srgb, var(--_primary) 22%, var(--_bg)); }
    }
    .bookmark-item.dragging { opacity: 0.4; }
    .bookmark-item.drag-over-top {
      border-top: 2px solid var(--_primary);
      padding-top: 3px;
    }
    .bookmark-item.drag-over-bottom {
      border-bottom: 2px solid var(--_primary);
      padding-bottom: 3px;
    }
    .bm-drag-handle {
      flex-shrink: 0; font-size: 14px; line-height: 1; color: var(--_text-muted);
      cursor: grab; opacity: 0.5; user-select: none; letter-spacing: -2px;
    }
    .bm-drag-handle:hover { opacity: 0.8; }
    .bm-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 1px;
    }
    .bm-name-row {
      display: flex; align-items: center; gap: 6px;
      min-width: 0;
    }
    .bm-name {
      font-size: 13px; font-weight: 500; color: var(--_text);
      /* ★ 2026-10-23：显式整数行高（默认 normal 算出来是小数 ⇒ 行高非整数 ⇒ 抗锯齿细线） */
      line-height: 18px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      min-width: 0;
    }
    .bm-global-badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--_primary) 45%, var(--_border));
      color: var(--_primary);
      background: color-mix(in srgb, var(--_primary) 12%, transparent);
      white-space: nowrap;
      opacity: 0.9;
      user-select: none;
    }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：「联动」标签——用户要求与「全局」完全对齐
       （同样的实线描边 + 主题色 + 12% 底色），靠标签文字区分语义，不再用虚线/灰色变体。 */
    .bm-link-badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--_primary) 45%, var(--_border));
      color: var(--_primary);
      background: color-mix(in srgb, var(--_primary) 12%, transparent);
      white-space: nowrap;
      opacity: 0.9;
      user-select: none;
    }
    /* ★ 2026-10-23：行高 14px（整数）+ 上面 bm-name 的 18px + gap 1px + 上下 padding 5px
       = 行高 43px 整；这是「行边界抗锯齿细线」的根因收口，改字号务必同步改行高。 */
    .bm-path {
      font-size: 10px; line-height: 14px; color: var(--_text); opacity: 0.45;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bm-remove {
      flex-shrink: 0; width: 22px; height: 22px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 4px; background: transparent;
      color: var(--_text); opacity: 0.3; font-size: 12px;
      cursor: pointer; line-height: 1;
    }
    .bm-remove:hover { opacity: 0.8; background: var(--_hover); }
  `],
})
export class SftpBookmarkPopupComponent {
  @ViewChild('bookmarkList') private bookmarkList?: ElementRef<HTMLElement>

  @Input() top = 0
  @Input() left = 0
  @Input() arrowLeft = 0
  /** 弹层宽度（父级按面板可用空间 clamp） */
  @Input() width = 320
  /** 弹层最大高度（父级按面板剩余高度 clamp） */
  @Input() maxHeight = 420
  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：用户拖出来的固定高度（null = 按内容自适应，受 maxHeight 约束） */
  @Input() height: number | null = null
  @Input() paneLabel = ''
  @Input() pane: 'local' | 'remote' = 'local'
  @Input() addScope: 'connection' | 'global' | null = null
  @Input() newName = ''
  @Input() newPath = ''
  /**
   * 当前排序方式（弹层 footer 按钮与设置页共用配置）
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：由布尔 sortByUsage 扩成三档 manual / usage / name。
   */
  @Input() sortMode: BookmarkSortMode = 'manual'
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：图钉「面板常驻」。
   *   true = 弹层**待在原地**：选中书签后不关，点面板其它位置 / 滚轮 / 右键 / 框选 / 缩放窗口也不关
   *   （等价于设置页「选中书签后关闭书签面板」= 关）。
   *   ⛔ 与配置项 `closeBookmarkPanelOnSelect` **语义相反**：那项表达「关闭」，本输入表达「钉住」，
   *     父级绑定读控制器 getter `bookmarkPinned`（取反在其内部只做一次），别在两边各改一次。
   */
  @Input() panelPinned = true
  /** ★ 2026-10-19：联动书签开关（决定表单是否显示联动路径输入） */
  @Input() linkEnabled = false
  /** ★ 2026-10-19：表单里的联动路径 */
  @Input() newLinkedPath = ''
  @Input() editingId: string | null = null
  @Input() connectionBookmarks: Bookmark[] = []
  @Input() globalBookmarks: Bookmark[] = []
  /** 扁平模式用的混排列表（保持书签数组中的相对顺序） */
  @Input() allBookmarks: Bookmark[] = []
  /** 是否按「局部 / 全局」分组（来自设置） */
  @Input() groupByScope = true
  /** 分组块顺序 */
  @Input() groupOrder: Array<'connection' | 'global'> = ['connection', 'global']
  @Input() dragSourceIdx = -1
  @Input() dragSourceScope: BookmarkScope | null = null
  @Input() dragOverIdx = -1
  @Input() dragOverScope: BookmarkScope | null = null
  @Input() dragOverBottom = false
  /** 当前面板路径（local/remote 当前目录），用于高亮路径匹配的书签 */
  @Input() currentPath = ''

  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：尺寸拖拽起始（dir 决定拖哪条边；几何由父级控制器计算） */
  @Output() resizeStart = new EventEmitter<{ dir: 'w' | 's' | 'sw'; event: MouseEvent }>()
  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：双击手柄还原——w=只还原宽度 / s=只还原高度 / sw=两者都还原 */
  @Output() resizeReset = new EventEmitter<'w' | 's' | 'sw'>()
  @Output() addScopeClick = new EventEmitter<'connection' | 'global'>()
  @Output() newNameChange = new EventEmitter<string>()
  @Output() newPathChange = new EventEmitter<string>()
  @Output() newLinkedPathChange = new EventEmitter<string>()
  /** ★ 2026-10-19：切换排序方式（footer 左侧按钮） */
  @Output() sortToggle = new EventEmitter<void>()
  /** ★ 2026-10-23（Deepseek-V4.1-Flash）：切换「面板常驻」（footer 图钉按钮，写在 config 由父级负责） */
  @Output() pinToggle = new EventEmitter<void>()
  @Output() addBookmark = new EventEmitter<void>()
  @Output() cancelEdit = new EventEmitter<void>()
  @Output() gotoBookmark = new EventEmitter<Bookmark>()
  @Output() removeBookmark = new EventEmitter<string>()
  @Output() contextMenu = new EventEmitter<{ bookmark: Bookmark; event: MouseEvent }>()
  @Output() dragStart = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() dragOver = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() dragEnd = new EventEmitter<void>()
  @Output() drop = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() close = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  /** 定位闪烁中的书签 id */
  flashId: string | null = null
  private _locateCycleIdx = -1
  private _flashTimer: ReturnType<typeof setTimeout> | null = null

  bookmarksOf(scope: 'connection' | 'global'): Bookmark[] {
    return scope === 'connection' ? this.connectionBookmarks : this.globalBookmarks
  }

  /**
   * ★ 2026-10-21（用户反馈「书签面板偶尔闪出一些线条，然后又没了」）：
   *   父面板的三个列表入参都是**方法调用**（`getBookmarksForPaneType(...)`），每次变更检测
   *   都会返回新数组；而这三处 `*ngFor` 原先都没有 trackBy ⇒ Angular 每轮都把**所有行
   *   销毁重建**。面板 CD 极其频繁（悬停/定时器/传输进度都触发），行元素的圆角背景与描边
   *   在反复重绘的中间帧里就会闪出一两条 1px 横线。
   *   按 `b.id` 跟踪即可复用 DOM，行不再重建（列表内容变化时仍会正确更新）。
   */
  trackByBookmark(_index: number, b: Bookmark): string {
    return b.id
  }

  /** 分组块顺序本身是稳定数组，这里一并按值跟踪（避免外部换顺序时整块重建） */
  trackByScope(_index: number, scope: string): string {
    return scope
  }

  scopeLabel(scope: 'connection' | 'global'): string {
    return scope === 'connection'
      ? this.i18n.t('bookmark.forConnection')
      : this.i18n.t('bookmark.global')
  }

  /**
   * 拖拽手柄的悬停提示。
   * ★ 2026-10-20（Deepseek-V4.1-Flash）：频率排序时行不可拖拽（[draggable]="sortMode === 'manual'"），
   *   若仍提示「拖拽排序」会误导用户，故按当前模式给不同文案；手动排序时同时提示右键可编辑。
   * ★ 2026-10-22：非手动（频率 / 名称）一律用「已按 X 排序」文案。
   */
  get dragHandleTitle(): string {
    return this.sortMode === 'manual'
      ? this.i18n.t('bookmark.dragHint')
      : this.i18n.t('bookmark.dragHintSorted')
  }

  /** 当前排序方式的显示名（footer 按钮 tooltip 用） */
  get sortModeLabel(): string {
    if (this.sortMode === 'usage') return this.i18n.t('bookmark.sortUsage')
    if (this.sortMode === 'name') return this.i18n.t('bookmark.sortName')
    return this.i18n.t('bookmark.sortManual')
  }

  /** 路径归一化：统一分隔符、去尾部斜杠；本地路径按 Windows 大小写不敏感处理 */
  private _normPath(p: string): string {
    if (!p) return ''
    let s = p.replace(/\\/g, '/').replace(/\/+$/, '')
    if (this.pane === 'local') s = s.toLowerCase()
    return s
  }

  /** 该书签路径是否与当前面板路径一致（用于高亮） */
  isCurrent(b: Bookmark): boolean {
    if (!this.currentPath) return false
    return this._normPath(b.path) === this._normPath(this.currentPath)
  }

  /** 列表中是否存在与当前路径匹配的书签（控制定位按钮可用性） */
  get hasCurrentBookmark(): boolean {
    return this._currentMatches().length > 0
  }

  /** 按当前 UI 顺序收集路径匹配的书签 */
  private _currentMatches(): Bookmark[] {
    if (!this.currentPath) return []
    const list = this.groupByScope
      ? this.groupOrder.flatMap(scope => this.bookmarksOf(scope))
      : this.allBookmarks
    return list.filter(b => this.isCurrent(b))
  }

  /**
   * 滚动到当前路径对应的书签；若有多项同路径则循环定位。
   */
  locateCurrent(): void {
    const matches = this._currentMatches()
    if (!matches.length) return
    this._locateCycleIdx = (this._locateCycleIdx + 1) % matches.length
    const target = matches[this._locateCycleIdx]
    const listEl = this.bookmarkList?.nativeElement
    const item = listEl
      ? Array.from(listEl.querySelectorAll<HTMLElement>('.bookmark-item[data-bm-id]'))
          .find(el => el.getAttribute('data-bm-id') === target.id) ?? null
      : null
    if (item) {
      item.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    if (this._flashTimer) clearTimeout(this._flashTimer)
    this.flashId = target.id
    this._flashTimer = setTimeout(() => {
      this.flashId = null
      this._flashTimer = null
    }, 900)
  }

  /**
   * ★ 2026-10-13 P2 修复：本组件是全项目唯一持有 setTimeout 的弹层，却偏偏没实现
   *   OnDestroy —— 弹层在 900ms 闪烁期内被关掉（点书签跳转、Esc、切换面板）后，
   *   定时器仍会兑现并写 `flashId = null`，触发一次对已卸载视图的变更检测。
   */
  ngOnDestroy(): void {
    if (this._flashTimer) {
      clearTimeout(this._flashTimer)
      this._flashTimer = null
    }
  }
}

/**
 * SFTP+ 浮动面板组件
 * 功能描述：纯 Angular 组件（不继承 BaseTabComponent），由装饰器动态创建为浮动 overlay
 *   双栏文件管理器（本地↔远程）、书签、传输日志、拖拽传输
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-25
 *
 * 修复项（2025-06-25）：
 * - SSH 断开后面板未感知断开：修复 BaseSession.closed$ (RxJS Subject) 取代错误的
 *   .closed Promise 检测，新增 sshSession.open 和 terminalRef.session 双重回退检测
 * - up-entry 缺少整行 grid 样式，列宽不匹配
 * - 列表悬浮显示 title="null" 问题
 * - 本地路径记忆刷新时序竞争（构造函数异步回掉覆盖 ngOnInit 记忆恢复）
 * - 本地/远程列显示、排序、列宽独立记忆
 * - 排序箭头可见度提升
 *
 * 修复：NG0202 依赖注入错误 — ConfigService 从构造函数参数注入改为 Injector 手动获取，
 *       避免插件环境中 ConfigService 不可用导致组件创建失败
 *
 * 基线：tabby-sftp-ui (https://github.com/growingupfirst/tabby-sftp-ui)
 * 增强：浮动面板、electerm 风格书签、CSS 变量主题跟随
 */
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import { exec } from 'child_process'

import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ChangeDetectorRef, ElementRef, NgZone, Injector } from '@angular/core'
import { ThemesService, NotificationsService, ConfigService } from 'tabby-core'

import { LocalPathFileDownload, LocalPathFileUpload } from './local-transfers'
import { SftpConnectionService, SFTPFile, SFTPSessionLike, SSHSessionLike } from './sftp.service'
import { SftpI18nService } from './sftp-i18n.service'
import { SftpBookmarksService, Bookmark } from './sftp-bookmarks.service'
import { SftpTransferLogService, TransferLogEntry } from './sftp-transfer-log.service'

type LocalEntry = {
  name: string
  fullPath: string
  isDirectory: boolean
  mode?: number
  size?: number
  mtimeMs?: number
  atimeMs?: number
  /** 创建时间（birth time），仅本地文件可用 */
  birthtimeMs?: number
  owner?: number
  group?: number
  /** stat 失败则为 true，表示不可访问的目录/文件 */
  inaccessible?: boolean
}

type DragPayload =
  | { kind: 'local-paths'; paths: Array<{ fullPath: string; name: string; isDirectory: boolean }> }
  | { kind: 'remote-paths'; paths: Array<{ remotePath: string; name: string; isDirectory: boolean; size?: number; mode?: number; modified?: number }> }

/** 文件冲突对话框信息 */
type ConflictFileInfo = {
  localPath: string
  remotePath: string
  fileName: string
  localSize: number
  remoteSize: number
  localMtime: number
  remoteMtime: number
  remoteDir: string
  /** 冲突方向，用于对话框提示文本 */
  direction: 'upload' | 'download'
  /** 是否为同面板操作（local→local 或 remote→remote），影响提示文案 */
  isSamePane: boolean
  /** 是否为目录冲突 */
  isDirectory?: boolean
}

/** 书签分组作用域 */
type BookmarkScope = 'connection' | 'global' | 'all'

@Component({
  selector: 'sftp-plus-panel',
  template: `
    <div class="sftp-root" tabindex="0"
      [class.has-zebra]="showZebra"
      [class.has-col-borders]="showColBorders"
      [class.has-panel-border]="showPanelBorder">
      <!-- 顶部标题栏 -->
      <div class="top-bar">
        <span class="title">SFTP+</span>
        <span class="host-info" *ngIf="hostInfo">{{ hostInfo }}</span>
        <!-- 断开连接指示器 -->
        <span class="disconnect-indicator" *ngIf="!connected && !connecting && sshSession">
          <span class="disconnect-dot"></span>
          <span class="disconnect-tag">{{ effectiveLang === 'zh-CN' ? '已断开' : 'Disconnected' }}</span>
          <button class="reconnect-btn" (click)="onReconnect()" [disabled]="reconnecting">
            {{ reconnecting
              ? (effectiveLang === 'zh-CN' ? '重连…' : 'Reconnecting…')
              : (effectiveLang === 'zh-CN' ? '重连' : 'Reconnect') }}
          </button>
        </span>
        <div class="top-actions">
          <!-- 记住路径开关 -->
          <button class="btn-link btn-remember-path" (click)="toggleRememberPath()"
                  [class.active]="rememberPath"
                  title="{{ rememberPath ? (effectiveLang==='zh-CN'?'路径记忆：已开启':'Path Memory: ON') : (effectiveLang==='zh-CN'?'路径记忆：已关闭':'Path Memory: OFF') }}">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M8 1C5.2 1 3 3.2 3 6c0 3.5 5 9 5 9s5-5.5 5-9c0-2.8-2.2-5-5-5z"/>
              <circle cx="8" cy="6" r="1.5"/>
            </svg>
          </button>
          <!-- 布局模式切换 -->
          <button class="btn-link btn-layout" (click)="cycleLayoutMode()"
                  title="{{ layoutModeTitle() }}">
            <!-- 自动模式：四格方块自适应图标 -->
            <svg *ngIf="_layoutMode === 'auto'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
              <rect x="1" y="1" width="6" height="6" rx="1"/>
              <rect x="9" y="1" width="6" height="6" rx="1"/>
              <rect x="1" y="9" width="6" height="6" rx="1"/>
              <rect x="9" y="9" width="6" height="6" rx="1"/>
              <path d="M4 7v2M12 7v2M7 4h2M7 12h2" stroke-width="1.2"/>
            </svg>
            <!-- 左右布局图标 -->
            <svg *ngIf="_layoutMode === 'horizontal'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="1" y="1" width="6" height="14" rx="1"/>
              <rect x="9" y="1" width="6" height="14" rx="1"/>
            </svg>
            <!-- 上下布局图标 -->
            <svg *ngIf="_layoutMode === 'vertical'" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="1" y="1" width="14" height="6" rx="1"/>
              <rect x="1" y="9" width="14" height="6" rx="1"/>
            </svg>
          </button>
          <button class="btn-link" (click)="showTransferLog = !showTransferLog" title="{{ i18n.t('transfer.log') }}">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="2" width="10" height="12" rx="1"/>
              <line x1="5.5" y1="5.5" x2="10.5" y2="5.5"/>
              <line x1="5.5" y1="8" x2="10.5" y2="8"/>
              <line x1="5.5" y1="10.5" x2="8.5" y2="10.5"/>
            </svg>
          </button>
          <button class="btn-minimize" (click)="minimize()" title="{{ minimized ? (effectiveLang==='zh-CN'?'恢复':'Restore') : (effectiveLang==='zh-CN'?'最小化':'Minimize') }}">─</button>
          <button class="btn-close" (click)="close()">✕</button>
        </div>
      </div>

      <!-- 双栏主体 -->
      <div class="sftp-body">
        <!-- ====== 本地面板 ====== -->
        <div class="pane">
          <div class="pane-title">
            <span class="pane-label">🖥 {{ i18n.t('pane.local') }}</span>
            <div class="pane-path">
              <input class="path-input" [(ngModel)]="localPathInput"
                (keyup.enter)="goToLocalPathInput()"
                (mousedown)="$event.stopPropagation()" />
            </div>
            <div class="pane-actions">
              <!-- 后退 -->
              <button (click)="localBack()" [disabled]="!canLocalBack" title="{{ effectiveLang === 'zh-CN' ? '后退' : 'Back' }}" class="icon-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M10 3L5 8l5 5"/>
                </svg>
              </button>
              <!-- 前进 -->
              <button (click)="localForward()" [disabled]="!canLocalForward" title="{{ effectiveLang === 'zh-CN' ? '前进' : 'Forward' }}" class="icon-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M6 3l5 5-5 5"/>
                </svg>
              </button>
              <!-- 返回上级 -->
              <button (click)="localUp()" [disabled]="!canLocalUp()" title="{{ i18n.t('pane.up') }}" class="icon-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M8 13V3M4 6.5L8 3l4 3.5"/>
                </svg>
              </button>
              <!-- 刷新 -->
              <button (click)="refreshLocal()" title="{{ i18n.t('pane.refresh') }}" class="icon-btn">
                <svg width="13" height="13" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M369.777778 160.568889a42.666667 42.666667 0 0 1-42.666667 42.666667H128a42.666667 42.666667 0 1 1 0-85.333334h199.111111a42.666667 42.666667 0 0 1 42.666667 42.666667"/>
                  <path d="M327.111111 402.346667a42.666667 42.666667 0 0 1-42.666667-42.666667v-199.111111a42.666667 42.666667 0 1 1 85.333334 0v199.111111a42.666667 42.666667 0 0 1-42.666667 42.666667"/>
                  <path d="M512.014222 938.652444h-0.753778a424.533333 424.533333 0 0 1-294.272-124.913777c-80.583111-80.583111-124.956444-187.733333-124.956444-301.696 0-113.976889 44.373333-221.112889 124.970667-301.696l73.088-73.116445a42.680889 42.680889 0 0 1 60.359111 60.344889l-73.102222 73.102222a339.057778 339.057778 0 0 0-99.982223 241.351111A339.128889 339.128889 0 0 0 277.333333 753.422222a339.640889 339.640889 0 0 0 235.406223 99.911111 42.680889 42.680889 0 0 1-0.725334 85.333334"/>
                  <path d="M654.222222 863.473778v-0.014222a42.666667 42.666667 0 0 1 42.666667-42.666667h199.111111a42.666667 42.666667 0 0 1 0 85.333333H696.888889a42.666667 42.666667 0 0 1-42.666667-42.666666"/>
                  <path d="M696.888889 621.681778a42.666667 42.666667 0 0 1 42.666667 42.666666v199.111112a42.666667 42.666667 0 0 1-85.333334 0v-199.111112a42.666667 42.666667 0 0 1 42.666667-42.666666"/>
                  <path d="M703.715556 899.285333a42.638222 42.638222 0 0 1-30.165334-72.832l73.130667-73.102222c133.077333-133.091556 133.077333-349.653333 0-482.730667A339.100444 339.100444 0 0 0 505.315556 170.666667a42.666667 42.666667 0 1 1 0-85.333334c113.976889 0 221.112889 44.387556 301.681777 124.970667 166.357333 166.343111 166.357333 437.048889 0 603.377778l-73.102222 73.116444a42.524444 42.524444 0 0 1-30.165333 12.515556"/>
                </svg>
              </button>
              <!-- 主目录 -->
              <button (click)="goLocalHome()" title="{{ i18n.t('pane.home') }}" class="icon-btn">
                <svg width="13" height="13" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M981.929813 524.629333c-9.756444 0-19.626667-3.413333-27.534222-10.211555L538.395591 154.965333l-4.494222-4.124444a31.488 31.488 0 0 0-43.320889 0c-1.251556 1.28-2.816 2.702222-4.494222 4.124444L69.944036 514.417778a42.097778 42.097778 0 0 1-59.676445-4.551111 42.723556 42.723556 0 0 1 4.522667-60.017778L430.761813 90.339556c0.284444-0.284444 1.137778-0.995556 1.422223-1.422223a115.484444 115.484444 0 0 1 159.687111 0l1.422222 1.422223L1009.23648 449.820444c17.777778 15.36 19.768889 42.183111 4.522667 60.046223-8.192 9.671111-20.024889 14.791111-31.857778 14.791111zM769.023147 995.555556h-77.027556c-61.354667 0-111.303111-50.261333-111.303111-112.014223V762.026667a27.192889 27.192889 0 0 0-26.652444-26.851556H477.040924a26.823111 26.823111 0 0 0-26.652444 26.851556v121.514666c0 61.752889-49.948444 112.014222-111.303111 112.014223H256.283591c-61.354667 0-111.303111-50.261333-111.303111-112.014223v-392.248889a42.382222 42.382222 0 0 1 42.325333-42.609777 42.382222 42.382222 0 0 1 42.325334 42.609777v392.248889c0 14.791111 11.975111 26.823111 26.652444 26.823111h82.801778a26.823111 26.823111 0 0 0 26.652444-26.823111V762.026667c0-61.781333 49.948444-112.014222 111.303111-112.014223h77.027556c61.354667 0 111.303111 50.232889 111.303111 112.014223v121.514666c0 14.791111 11.975111 26.823111 26.652445 26.823111h77.027555a26.823111 26.823111 0 0 0 26.652445-26.823111v-392.248889a42.382222 42.382222 0 0 1 42.325333-42.609777 42.382222 42.382222 0 0 1 42.325333 42.609777v392.248889c0 61.752889-49.948444 112.014222-111.303111 112.014223z"/>
                </svg>
              </button>
              <!-- 过滤 -->
              <button (click)="localFilterVisible = !localFilterVisible"
                title="{{ i18n.t('pane.filterBtn') }}" class="icon-btn toggle-btn" [class.active]="localFilterVisible || localFilter">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M2 3h12l-4.5 5.5v4l-3 1.5v-5.5L2 3z"/>
                </svg>
              </button>
              <!-- 书签 -->
              <button (click)="toggleBookmarksForPane('local', $event)" title="{{ i18n.t('bookmark.title') }}" class="icon-btn bm-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M8 1l1.8 3.7 4.2.6-3 3 .7 4.2L8 10.4l-3.7 2 .7-4.2-3-3 4.2-.6L8 1z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="pane-filters" *ngIf="localFilterVisible">
            <input class="filter-input" [(ngModel)]="localFilterPending"
              placeholder="{{ i18n.t('pane.filter') }}"
              (keyup.enter)="applyLocalFilter()"
              (keyup.escape)="clearLocalFilter()" />
            <button class="filter-btn filter-confirm" (click)="applyLocalFilter()" title="{{ effectiveLang === 'zh-CN' ? '确定' : 'Apply' }}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 8l3.5 4L13 4"/>
              </svg>
            </button>
            <button class="filter-btn filter-clear" (click)="clearLocalFilter()" title="{{ effectiveLang === 'zh-CN' ? '清空' : 'Clear' }}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4l8 8M12 4l-8 8"/>
              </svg>
            </button>
          </div>
          <div class="pane-list local-pane" [class.pane-flash]="_localFlash"
            (dragover)="onDragOver($event)" (drop)="onDrop($event, 'local')"
            (mousedown)="onPaneMouseDown($event, 'local')"
            (mouseenter)="activePane = 'local'"
            (scroll)="onPaneScroll()"
            (click)="onPaneListClick($event, 'local')"
            (contextmenu)="onPaneContextMenu($event)">
            <div class="entry header" [style.gridTemplateColumns]="getLocalColWidths()" (contextmenu)="onHeaderContextMenu($event)">
              <span class="icon"></span>
              <span class="name sortable" (click)="setLocalSort('name')">
                {{ i18n.t('file.name') }}<span class="sort-arrow" *ngIf="localSortBy === 'name'">{{ localSortAsc ? '▲' : '▼' }}</span>
                <div class="col-resize-handle" (mousedown)="onColResizeStart('name', $event, 'local')"></div>
              </span>
              <span *ngFor="let col of localVisibleCols" class="{{col}} sortable"
                draggable="true"
                (click)="setLocalSort(col === 'date' ? 'modified' : col === 'created' ? 'birthtime' : col)"
                (dragstart)="onColHeaderDragStart($event, col, 'local')"
                (dragover)="onColHeaderDragOver($event)"
                (drop)="onColHeaderDrop($event, col, 'local')">
                {{ colHeaderLabel(col) }}<span class="sort-arrow" *ngIf="sortArrow(col, 'local')">{{ sortArrow(col, 'local') }}</span>
                <div class="col-resize-handle" (mousedown)="onColResizeStart(col, $event, 'local')"></div>
              </span>
            </div>
            <div class="entry"
              *ngFor="let e of getFilteredLocalEntries(); let i = index"
              (click)="onLocalClick(e, $event, i)"
              (dblclick)="openLocal(e, $event)"
              (contextmenu)="onLocalContextMenu(e, $event)"
              [class.selected]="isLocalSelected(e)"
              draggable="true"
              (dragstart)="onDragStartLocal($event, e)"
              [style.gridTemplateColumns]="getLocalColWidths()">
              <span class="icon">{{ e.isDirectory ? '📁' : '📄' }}</span>
              <span class="name">{{ e.inaccessible ? '* ' : '' }}{{ e.name }}</span>
              <span *ngFor="let col of localVisibleCols" class="{{col}}" [attr.title]="col === 'path' ? e.fullPath : null">{{ colValue(col, e) }}</span>
            </div>
            <div class="rubber-band-rect" *ngIf="rubberBand.active && rubberBand.pane === 'local'"
              [style.left]="rubberBand.rectLeft + 'px'" [style.top]="rubberBand.rectTop + 'px'"
              [style.width]="rubberBand.rectWidth + 'px'" [style.height]="rubberBand.rectHeight + 'px'">
            </div>
            <div class="pane-empty" *ngIf="getFilteredLocalEntries().length === 0 && !_localLoading">
              <ng-container *ngIf="_localError">{{ i18n.t('pane.errorAccess') }}</ng-container>
              <ng-container *ngIf="!_localError">{{ localFilter ? i18n.t('pane.noMatch') : i18n.t('pane.empty') }}</ng-container>
            </div>
          </div>
          <div class="pane-actions-bar">
            <span class="selection-info">{{ i18n.t('pane.items', {count: getFilteredLocalEntries().length}) }}<ng-container *ngIf="selectedLocal.length"> — {{ effectiveLang === 'zh-CN' ? '已选择' : 'Selected' }} {{ selectedLocal.length }} {{ effectiveLang === 'zh-CN' ? '项' : 'items' }} ({{ formatSelectedSizeLocal() }})<span *ngIf="selectedHasDirLocal()" class="size-hint">{{ effectiveLang === 'zh-CN' ? ' 文件夹不计' : ' excl. folders' }}</span></ng-container></span>
          </div>
          <!-- 加载遮罩（pane 层级，不受 scroll 影响） -->
          <div class="pane-loading" *ngIf="_localLoading">
            <div class="spinner"></div>
          </div>
        </div>

        <!-- 拖拽分割线（窄屏上下布局/宽屏左右布局均显示） -->
        <div class="pane-splitter"
             (mousedown)="onSplitterDown($event)"
             (dblclick)="resetSplitter()"></div>

        <!-- ====== 远程面板 ====== -->
        <div class="pane">
          <div class="pane-title">
            <span class="pane-label">🌐 {{ i18n.t('pane.remote') }}</span>
            <div class="pane-path">
              <input class="path-input" [(ngModel)]="remotePathInput"
                (keyup.enter)="goToRemotePathInput()"
                (mousedown)="$event.stopPropagation()" [disabled]="!connected" />
            </div>
            <div class="pane-actions">
              <!-- 后退 -->
              <button (click)="remoteBack()" [disabled]="!canRemoteBack" title="{{ effectiveLang === 'zh-CN' ? '后退' : 'Back' }}" class="icon-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M10 3L5 8l5 5"/>
                </svg>
              </button>
              <!-- 前进 -->
              <button (click)="remoteForward()" [disabled]="!canRemoteForward" title="{{ effectiveLang === 'zh-CN' ? '前进' : 'Forward' }}" class="icon-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M6 3l5 5-5 5"/>
                </svg>
              </button>
              <!-- 返回上级 -->
              <button (click)="remoteUp()" [disabled]="!connected" title="{{ i18n.t('pane.up') }}" class="icon-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M8 13V3M4 6.5L8 3l4 3.5"/>
                </svg>
              </button>
              <!-- 刷新 -->
              <button (click)="refreshRemote()" [disabled]="!connected" title="{{ i18n.t('pane.refresh') }}" class="icon-btn">
                <svg width="13" height="13" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M369.777778 160.568889a42.666667 42.666667 0 0 1-42.666667 42.666667H128a42.666667 42.666667 0 1 1 0-85.333334h199.111111a42.666667 42.666667 0 0 1 42.666667 42.666667"/>
                  <path d="M327.111111 402.346667a42.666667 42.666667 0 0 1-42.666667-42.666667v-199.111111a42.666667 42.666667 0 1 1 85.333334 0v199.111111a42.666667 42.666667 0 0 1-42.666667 42.666667"/>
                  <path d="M512.014222 938.652444h-0.753778a424.533333 424.533333 0 0 1-294.272-124.913777c-80.583111-80.583111-124.956444-187.733333-124.956444-301.696 0-113.976889 44.373333-221.112889 124.970667-301.696l73.088-73.116445a42.680889 42.680889 0 0 1 60.359111 60.344889l-73.102222 73.102222a339.057778 339.057778 0 0 0-99.982223 241.351111A339.128889 339.128889 0 0 0 277.333333 753.422222a339.640889 339.640889 0 0 0 235.406223 99.911111 42.680889 42.680889 0 0 1-0.725334 85.333334"/>
                  <path d="M654.222222 863.473778v-0.014222a42.666667 42.666667 0 0 1 42.666667-42.666667h199.111111a42.666667 42.666667 0 0 1 0 85.333333H696.888889a42.666667 42.666667 0 0 1-42.666667-42.666666"/>
                  <path d="M696.888889 621.681778a42.666667 42.666667 0 0 1 42.666667 42.666666v199.111112a42.666667 42.666667 0 0 1-85.333334 0v-199.111112a42.666667 42.666667 0 0 1 42.666667-42.666666"/>
                  <path d="M703.715556 899.285333a42.638222 42.638222 0 0 1-30.165334-72.832l73.130667-73.102222c133.077333-133.091556 133.077333-349.653333 0-482.730667A339.100444 339.100444 0 0 0 505.315556 170.666667a42.666667 42.666667 0 1 1 0-85.333334c113.976889 0 221.112889 44.387556 301.681777 124.970667 166.357333 166.343111 166.357333 437.048889 0 603.377778l-73.102222 73.116444a42.524444 42.524444 0 0 1-30.165333 12.515556"/>
                </svg>
              </button>
              <!-- 主目录 -->
              <button (click)="goRemoteHome()" [disabled]="!connected" title="{{ i18n.t('pane.home') }}" class="icon-btn">
                <svg width="13" height="13" viewBox="0 0 1024 1024" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M981.929813 524.629333c-9.756444 0-19.626667-3.413333-27.534222-10.211555L538.395591 154.965333l-4.494222-4.124444a31.488 31.488 0 0 0-43.320889 0c-1.251556 1.28-2.816 2.702222-4.494222 4.124444L69.944036 514.417778a42.097778 42.097778 0 0 1-59.676445-4.551111 42.723556 42.723556 0 0 1 4.522667-60.017778L430.761813 90.339556c0.284444-0.284444 1.137778-0.995556 1.422223-1.422223a115.484444 115.484444 0 0 1 159.687111 0l1.422222 1.422223L1009.23648 449.820444c17.777778 15.36 19.768889 42.183111 4.522667 60.046223-8.192 9.671111-20.024889 14.791111-31.857778 14.791111zM769.023147 995.555556h-77.027556c-61.354667 0-111.303111-50.261333-111.303111-112.014223V762.026667a27.192889 27.192889 0 0 0-26.652444-26.851556H477.040924a26.823111 26.823111 0 0 0-26.652444 26.851556v121.514666c0 61.752889-49.948444 112.014222-111.303111 112.014223H256.283591c-61.354667 0-111.303111-50.261333-111.303111-112.014223v-392.248889a42.382222 42.382222 0 0 1 42.325333-42.609777 42.382222 42.382222 0 0 1 42.325334 42.609777v392.248889c0 14.791111 11.975111 26.823111 26.652444 26.823111h82.801778a26.823111 26.823111 0 0 0 26.652444-26.823111V762.026667c0-61.781333 49.948444-112.014222 111.303111-112.014223h77.027556c61.354667 0 111.303111 50.232889 111.303111 112.014223v121.514666c0 14.791111 11.975111 26.823111 26.652445 26.823111h77.027555a26.823111 26.823111 0 0 0 26.652445-26.823111v-392.248889a42.382222 42.382222 0 0 1 42.325333-42.609777 42.382222 42.382222 0 0 1 42.325333 42.609777v392.248889c0 61.752889-49.948444 112.014222-111.303111 112.014223z"/>
                </svg>
              </button>
              <!-- 过滤 -->
              <button (click)="remoteFilterVisible = !remoteFilterVisible"
                title="{{ i18n.t('pane.filterBtn') }}" class="icon-btn toggle-btn" [class.active]="remoteFilterVisible || remoteFilter">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M2 3h12l-4.5 5.5v4l-3 1.5v-5.5L2 3z"/>
                </svg>
              </button>
              <!-- 书签 -->
              <button (click)="toggleBookmarksForPane('remote', $event)" title="{{ i18n.t('bookmark.title') }}" class="icon-btn bm-btn">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M8 1l1.8 3.7 4.2.6-3 3 .7 4.2L8 10.4l-3.7 2 .7-4.2-3-3 4.2-.6L8 1z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="pane-filters" *ngIf="remoteFilterVisible">
            <input class="filter-input" [(ngModel)]="remoteFilterPending"
              placeholder="{{ i18n.t('pane.filter') }}"
              (keyup.enter)="applyRemoteFilter()"
              (keyup.escape)="clearRemoteFilter()" />
            <button class="filter-btn filter-confirm" (click)="applyRemoteFilter()" title="{{ effectiveLang === 'zh-CN' ? '确定' : 'Apply' }}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 8l3.5 4L13 4"/>
              </svg>
            </button>
            <button class="filter-btn filter-clear" (click)="clearRemoteFilter()" title="{{ effectiveLang === 'zh-CN' ? '清空' : 'Clear' }}">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4l8 8M12 4l-8 8"/>
              </svg>
            </button>
          </div>
          <div class="pane-list remote-pane" [class.pane-flash]="_remoteFlash" (dragover)="onDragOver($event)" (drop)="onDrop($event, 'remote')"
            (mousedown)="onPaneMouseDown($event, 'remote')"
            (mouseenter)="activePane = 'remote'"
            (scroll)="onPaneScroll()"
            (contextmenu)="onPaneContextMenu($event)"
            (click)="onPaneListClick($event, 'remote')">
            <div class="entry dim" *ngIf="!connected && !sshSession">
              {{ i18n.t('notify.noSSHSession') }}
            </div>
            <div class="entry header" *ngIf="connected" [style.gridTemplateColumns]="getRemoteColWidths()" (contextmenu)="onHeaderContextMenu($event)">
              <span class="icon"></span>
              <span class="name sortable" (click)="setRemoteSort('name')">
                {{ i18n.t('file.name') }}<span class="sort-arrow" *ngIf="remoteSortBy === 'name'">{{ remoteSortAsc ? '▲' : '▼' }}</span>
                <div class="col-resize-handle" (mousedown)="onColResizeStart('name', $event, 'remote')"></div>
              </span>
              <span *ngFor="let col of remoteVisibleCols" class="{{col}} sortable"
                draggable="true"
                (click)="setRemoteSort(col === 'date' ? 'modified' : col === 'created' ? 'birthtime' : col)"
                (dragstart)="onColHeaderDragStart($event, col, 'remote')"
                (dragover)="onColHeaderDragOver($event)"
                (drop)="onColHeaderDrop($event, col, 'remote')">
                {{ colHeaderLabel(col) }}<span class="sort-arrow" *ngIf="sortArrow(col, 'remote')">{{ sortArrow(col, 'remote') }}</span>
                <div class="col-resize-handle" (mousedown)="onColResizeStart(col, $event, 'remote')"></div>
              </span>
            </div>
            <div class="entry"
              *ngFor="let e of getFilteredRemoteEntries(); let i = index"
              (click)="onRemoteClick(e, $event, i)"
              (dblclick)="openRemote(e, $event)"
              (contextmenu)="onRemoteContextMenu(e, $event)"
              [class.selected]="isRemoteSelected(e)"
              [draggable]="connected"
              (dragstart)="onDragStartRemote($event, e)"
              [style.gridTemplateColumns]="getRemoteColWidths()">
              <span class="icon">{{ e.isDirectory ? '📁' : '📄' }}</span>
              <span class="name">{{ e.name }}</span>
              <span *ngFor="let col of remoteVisibleCols" class="{{col}}" [attr.title]="col === 'path' ? e.fullPath : null">{{ colValue(col, e) }}</span>
            </div>
            <div class="rubber-band-rect" *ngIf="rubberBand.active && rubberBand.pane === 'remote'"
              [style.left]="rubberBand.rectLeft + 'px'" [style.top]="rubberBand.rectTop + 'px'"
              [style.width]="rubberBand.rectWidth + 'px'" [style.height]="rubberBand.rectHeight + 'px'">
            </div>
            <div class="pane-empty" *ngIf="connected && getFilteredRemoteEntries().length === 0 && !_remoteLoading">
              <ng-container *ngIf="_remoteError">{{ i18n.t('pane.errorAccess') }}</ng-container>
              <ng-container *ngIf="!_remoteError">{{ remoteFilter ? i18n.t('pane.noMatch') : i18n.t('pane.empty') }}</ng-container>
            </div>
          </div>
          <div class="pane-actions-bar">
            <span class="selection-info">{{ i18n.t('pane.items', {count: getFilteredRemoteEntries().length}) }}<ng-container *ngIf="selectedRemote.length"> — {{ effectiveLang === 'zh-CN' ? '已选择' : 'Selected' }} {{ selectedRemote.length }} {{ effectiveLang === 'zh-CN' ? '项' : 'items' }} ({{ formatSelectedSizeRemote() }})<span *ngIf="selectedHasDirRemote()" class="size-hint">{{ effectiveLang === 'zh-CN' ? ' 文件夹不计' : ' excl. folders' }}</span></ng-container></span>
          </div>
          <!-- 加载遮罩（pane 层级，不受 scroll 影响） -->
          <div class="pane-loading" *ngIf="_remoteLoading">
            <div class="spinner"></div>
          </div>
        </div>
      </div>

      <!-- 传输队列 -->
      <div class="sftp-transfers" *ngIf="transfers.length && !transfersHidden && !transfersMinimized"
        (mousedown)="$event.stopPropagation()"
        (wheel)="$event.stopPropagation()">
        <div class="transfer-header">
          <span>{{ i18n.t('transfer.inProgress') }} <span class="transfer-count" *ngIf="transfers.length">({{ transfers.length }})</span></span>
          <div class="transfer-header-btns">
            <button class="btn-link" (click)="transfersMinimized = true" title="{{ i18n.t('transfer.minimizePanel') }}">─</button>
            <button class="btn-link" (click)="transfersHidden = true" title="{{ i18n.t('transfer.hidePanel') || 'Hide' }}">✕</button>
          </div>
        </div>
        <div class="transfer" *ngFor="let t of transfers">
          <div class="transfer-main">
            <div class="transfer-title">
              <span class="direction">{{ t.direction === 'upload' ? '↑' : '↓' }}</span>
              <span *ngIf="t.isFolder">📁</span>
              <span>{{ t.name }}</span>
              <span class="transfer-size" *ngIf="t.bytesTotal > 0">{{ formatSize(t.bytesTotal) }}</span>
              <span class="paused-tag" *ngIf="t.paused">{{ i18n.t('transfer.paused') }}</span>
            </div>
            <div class="transfer-sub" *ngIf="t.isFolder && t.currentItem">
              {{ t.currentItem }}<span *ngIf="t.currentItemSize != null">  {{ formatSize(t.currentItemSize) }}</span> ({{ t.itemDone }}/{{ t.itemCount }})
            </div>
            <div class="bar"><div class="fill" [style.width.%]="t.percent"></div></div>
          </div>
          <div class="transfer-stats">
            <span>{{ t.speed || '--' }}</span>
            <span>{{ formatPercent(t.percent) }}%</span>
            <!-- 暂停/继续 -->
            <button *ngIf="!t.paused" class="btn-pause" (click)="pauseTransfer(t)" title="{{ i18n.t('transfer.pause') }}">⏸</button>
            <button *ngIf="t.paused" class="btn-resume" (click)="resumeTransfer(t)" title="{{ i18n.t('transfer.resume') }}">▶</button>
            <!-- ⏹ 取消当前文件（文件夹：跳过此文件继续下一项，单文件：取消整个传输） -->
            <button *ngIf="t.isFolder" class="btn-cancel-current" (click)="cancelCurrentFile(t)" title="{{ i18n.t('transfer.cancelCurrent') }}">⏹</button>
            <button *ngIf="!t.isFolder" class="btn-cancel" (click)="cancelTransfer(t)" title="{{ i18n.t('transfer.cancel') }}">⏹</button>
            <!-- ✕ 取消全部（仅文件夹显示） -->
            <button *ngIf="t.isFolder" class="btn-cancel" (click)="cancelTransfer(t)" title="{{ i18n.t('transfer.cancelAll') }}">✕</button>
          </div>
        </div>
      </div>

      <!-- 传输最小化指示器 -->
      <div class="sftp-transfers-mini" *ngIf="transfers.length && !transfersHidden && transfersMinimized"
        (click)="transfersMinimized = false" (mousedown)="$event.stopPropagation()">
        <span>📦 {{ i18n.t('transfer.inProgress') }} ({{ transfers.length }})</span>
      </div>

      <!-- 删除确认 -->
      <div class="overlay" *ngIf="deleteConfirmVisible">
        <div class="delete-dialog">
          <!-- 批量删除 -->
          <ng-container *ngIf="deleteConfirmBatch; else singleDelete">
            <div class="delete-header">
              <svg class="delete-warn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f0a030" stroke-width="1.5">
                <circle cx="12" cy="12" r="10" stroke="#f0a030" fill="rgba(240,160,48,0.1)"/>
                <line x1="12" y1="8" x2="12" y2="13"/>
                <circle cx="12" cy="16.5" r="0.8" fill="#f0a030" stroke="none"/>
              </svg>
              <span class="delete-title">{{ i18n.t('app.deleteMultiple') }}</span>
            </div>
            <div class="delete-text">{{ batchDeleteText }}</div>
          </ng-container>
          <!-- 单个删除 -->
          <ng-template #singleDelete>
            <div class="delete-header">
              <svg *ngIf="deleteItemIsDir" class="delete-header-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#f0c040" stroke-width="1.2">
                <path d="M2 3h5l1.5 1.5H14v8.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3z"/>
              </svg>
              <svg *ngIf="!deleteItemIsDir" class="delete-header-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2">
                <path d="M3 2h5l2 2h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
                <line x1="6" y1="7" x2="6" y2="11"/><line x1="9" y1="7" x2="9" y2="11"/>
              </svg>
              <span class="delete-title">{{ deleteItemIsDir ? i18n.t('app.deleteFolder') : i18n.t('app.deleteFile') }}</span>
            </div>
            <div class="delete-text">{{ deleteItemIsDir ? i18n.t('app.deleteConfirmFolder') : i18n.t('app.deleteConfirmFile') }}</div>
            <div class="delete-preview">
              <div class="delete-preview-row">
                <span class="delete-preview-icon">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2">
                    <path *ngIf="deleteItemIsDir" d="M2 3h5l1.5 1.5H14v8.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3z"/>
                    <path *ngIf="!deleteItemIsDir" d="M3 2h5l2 2h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
                  </svg>
                </span>
                <span class="delete-preview-name">{{ deleteItemName }}</span>
              </div>
              <div class="delete-preview-row" *ngIf="!deleteItemIsDir">
                <span class="delete-preview-label">{{ i18n.t('file.type') }}:</span>
                <span class="delete-preview-value">{{ deleteItemType }}</span>
              </div>
              <div class="delete-preview-row" *ngIf="!deleteItemIsDir && deleteItemSize != null">
                <span class="delete-preview-label">{{ i18n.t('file.size') }}:</span>
                <span class="delete-preview-value">{{ deleteItemSize }}</span>
              </div>
              <div class="delete-preview-row" *ngIf="deleteItemDate">
                <span class="delete-preview-label">{{ i18n.t('file.modified') }}:</span>
                <span class="delete-preview-value">{{ deleteItemDate }}</span>
              </div>
            </div>
          </ng-template>
          <div class="dialog-buttons">
            <button class="danger" (click)="confirmDelete()">{{ i18n.t('app.yes') }}</button>
            <button (click)="cancelDelete()">{{ i18n.t('app.no') }}</button>
          </div>
        </div>
      </div>

      <!-- 输入对话框 -->
      <div class="overlay" *ngIf="inputDialogVisible">
        <div class="dialog">
          <div class="dialog-title">{{ inputDialogTitle }}</div>
          <input class="dialog-input" [(ngModel)]="inputDialogValue"
            [placeholder]="inputDialogPlaceholder"
            (keyup.enter)="confirmInputDialog()" />
          <div class="dialog-buttons">
            <button (click)="confirmInputDialog()" [disabled]="!inputDialogValue.trim()">{{ i18n.t('app.confirm') }}</button>
            <button (click)="cancelInputDialog()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- 书签悬浮菜单 -->
      <div class="bookmark-popup" *ngIf="showBookmarks"
        [style.top.px]="bookmarkPopupY"
        [style.left.px]="bookmarkPopupX"
        (mousedown)="$event.stopPropagation()"
        (wheel)="$event.stopPropagation()">
        <div class="popup-arrow"></div>
        <div class="popup-title">{{ bookmarkPane === 'local' ? i18n.t('pane.local') : i18n.t('pane.remote') }} {{ i18n.t('bookmark.title') }}</div>
        <div class="bookmark-add-btns">
          <!-- 远程/本地面板都显示两个 scope 按钮 -->
          <ng-container *ngIf="bookmarkPane === 'remote' || bookmarkPane === 'local'; else localAddBtn">
            <button class="add-btn" (click)="openBookmarkAddForm('connection')" [class.active]="bookmarkAddScope === 'connection'">
              <span class="add-icon">+</span> {{ i18n.t('bookmark.addLocal') }}
            </button>
            <button class="add-btn" (click)="openBookmarkAddForm('global')" [class.active]="bookmarkAddScope === 'global'">
              <span class="add-icon">+</span> {{ i18n.t('bookmark.addGlobal') }}
            </button>
          </ng-container>
          <ng-template #localAddBtn>
            <button class="add-btn" (click)="openBookmarkAddForm('connection')" [class.active]="bookmarkAddScope === 'connection'">
              <span class="add-icon">+</span> {{ i18n.t('bookmark.addLocal') }}
            </button>
          </ng-template>
        </div>
        <!-- 添加表单 -->
        <div class="bookmark-add-form" *ngIf="bookmarkAddScope">
          <input [(ngModel)]="newBookmarkName" placeholder="{{ i18n.t('bookmark.name') }} ({{ i18n.t('app.optional') }})" />
          <input [(ngModel)]="newBookmarkPath" placeholder="{{ i18n.t('bookmark.path') }}" />
          <button class="btn-confirm" (click)="addBookmark()" [disabled]="!newBookmarkPath.trim()">
            {{ _editingBookmarkId ? (i18n.t('bookmark.save') || '保存书签') : i18n.t('bookmark.add') }}
          </button>
        </div>
        <div class="bookmark-list">
          <!-- 本地/远程面板统一按 connection/global 分组 -->
          <div class="bookmark-scope-label" *ngIf="getBookmarksForPaneType('connection').length">
            {{ i18n.t('bookmark.forConnection') }}
          </div>
          <div class="bookmark-item" *ngFor="let b of getBookmarksForPaneType('connection'); let i = index"
            (click)="gotoBookmark(b)"
            (contextmenu)="onBookmarkContextMenu(b, $event)"
            draggable="true"
            (dragstart)="onBookmarkDragStart($event, i, 'connection')"
            (dragover)="onBookmarkDragOver($event, i, 'connection')"
            (dragend)="onBookmarkDragEnd()"
            (drop)="onBookmarkDrop($event, i, 'connection')"
            [class.drag-over-top]="dragOverIdx === i && dragOverScope === 'connection' && !dragOverBottom"
            [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === 'connection' && dragOverBottom"
            [class.dragging]="dragSourceIdx === i && dragSourceScope === 'connection'"
            [title]="b.path">
            <span class="bm-drag-handle">⠿</span>
            <div class="bm-info">
              <span class="bm-name">{{ b.name }}</span>
              <span class="bm-path">{{ b.path }}</span>
            </div>
            <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark(b.id)" title="{{ i18n.t('bookmark.remove') }}">✕</button>
          </div>
          <div class="bookmark-scope-label" *ngIf="getBookmarksForPaneType('global').length">
            {{ i18n.t('bookmark.global') }}
          </div>
          <div class="bookmark-item" *ngFor="let b of getBookmarksForPaneType('global'); let i = index"
            (click)="gotoBookmark(b)"
            (contextmenu)="onBookmarkContextMenu(b, $event)"
            draggable="true"
            (dragstart)="onBookmarkDragStart($event, i, 'global')"
            (dragover)="onBookmarkDragOver($event, i, 'global')"
            (dragend)="onBookmarkDragEnd()"
            (drop)="onBookmarkDrop($event, i, 'global')"
            [class.drag-over-top]="dragOverIdx === i && dragOverScope === 'global' && !dragOverBottom"
            [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === 'global' && dragOverBottom"
            [class.dragging]="dragSourceIdx === i && dragSourceScope === 'global'"
            [title]="b.path">
            <span class="bm-drag-handle">⠿</span>
            <div class="bm-info">
              <span class="bm-name">{{ b.name }}</span>
              <span class="bm-path">{{ b.path }}</span>
            </div>
            <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark(b.id)" title="{{ i18n.t('bookmark.remove') }}">✕</button>
          </div>
        </div>
        <div class="popup-footer">
          <button (click)="closeBookmarks()">{{ i18n.t('app.close') }}</button>
        </div>
      </div>

      <!-- 传输日志 -->
      <div class="overlay" *ngIf="showTransferLog">
        <div class="dialog log-dialog">
          <div class="dialog-title">{{ i18n.t('transfer.log') }}</div>
          <div class="log-toolbar">
            <select [(ngModel)]="logFilterOp">
              <option value="">{{ i18n.t('app.all') }}</option>
              <option value="upload">{{ i18n.t('transfer.upload') }}</option>
              <option value="download">{{ i18n.t('transfer.download') }}</option>
            </select>
            <label><input type="checkbox" [(ngModel)]="logFilterSuccess" /> {{ i18n.t('log.onlySuccess') }}</label>
            <button *ngIf="transfers.length" (click)="transfersHidden = false; transfersMinimized = false" class="btn-transfers-toggle">
              {{ (transfersHidden || transfersMinimized) ? '▸' : '▾' }} {{ i18n.t('transfer.inProgress') }} ({{ transfers.length }})
            </button>
            <button (click)="exportLog()">{{ i18n.t('app.export') }}</button>
            <button (click)="clearLog()" class="danger">{{ i18n.t('app.clear') }}</button>
          </div>
          <div class="log-list">
            <div class="log-entry" *ngFor="let entry of getFilteredLogs()">
              <!-- 左侧：时间 + 操作类型徽标 -->
              <div class="log-left">
                <span class="log-time">{{ formatLogTime(entry.timestamp) }}</span>
                <span class="log-op-badge" [class.op-upload]="entry.operation === 'upload'"
                      [class.op-download]="entry.operation === 'download'"
                      [class.op-other]="entry.operation !== 'upload' && entry.operation !== 'download'">
                  {{ i18n.t('transfer.' + entry.operation) || entry.operation }}
                </span>
              </div>
              <!-- 中间：文件名 + 路径（截断），上传先本地后远程，下载先远程后本地 -->
              <div class="log-body">
                <span class="log-filename" [title]="entry.operation === 'upload' ? entry.localPath + ' → ' + entry.remotePath : entry.remotePath + ' → ' + entry.localPath">
                  {{ getLogFileName(entry) }}
                </span>
                <ng-container *ngIf="entry.operation === 'upload'; else downloadPaths">
                  <span class="log-path-line" [title]="entry.localPath">
                    📁 {{ entry.localPath }}
                  </span>
                  <span class="log-path-line" [title]="entry.remotePath">
                    ☁️ {{ entry.remotePath }}
                  </span>
                </ng-container>
                <ng-template #downloadPaths>
                  <span class="log-path-line" [title]="entry.remotePath">
                    ☁️ {{ entry.remotePath }}
                  </span>
                  <span class="log-path-line" [title]="entry.localPath">
                    📁 {{ entry.localPath }}
                  </span>
                </ng-template>
              </div>
              <!-- 右侧：耗时 + 文件大小 + 状态 -->
              <div class="log-right">
                <span class="log-time-range" *ngIf="entry.startTime">{{ formatLogTimeRange(entry) }}</span>
                <span class="log-size" *ngIf="entry.size != null">{{ formatSize(entry.size) }}</span>
                <span class="log-speed" *ngIf="entry.size && entry.duration">{{ formatSpeedFromSize(entry.size, entry.duration) }}</span>
                <span class="log-duration" *ngIf="entry.duration != null">{{ formatDuration(entry.duration) }}</span>
                <span class="log-status-icon" [class.success]="entry.success" [class.failed]="!entry.success"
                      [title]="entry.success ? 'Success' : formatFailReason(entry)">
                  {{ entry.success ? '✓' : '✗' }}
                </span>
                <span class="log-fail-reason" *ngIf="!entry.success">{{ formatFailReason(entry) }}</span>
              </div>
            </div>
          </div>
          <div class="dialog-buttons">
            <button (click)="showTransferLog = false">{{ i18n.t('app.close') }}</button>
          </div>
        </div>
      </div>

      <!-- 文件冲突对话框 -->
      <div class="overlay" *ngIf="showConflictDialog && conflictData">
        <div class="dialog conflict-dialog">
          <!-- 标题行 -->
          <div class="conflict-header">
            <span class="conflict-title-icon">⚠️</span>
            <span class="conflict-title-text">{{ i18n.t('conflict.title') }}</span>
            <span class="conflict-progress" *ngIf="conflictTotalIdx > 1">冲突 {{ conflictCurrIdx }} / {{ conflictTotalIdx }}</span>
          </div>
          <!-- 描述 -->
          <div class="conflict-desc"><span *ngIf="conflictData.isDirectory">📁</span><span *ngIf="!conflictData.isDirectory">📄</span> <strong>{{ conflictData.fileName }}</strong>
            <ng-container *ngIf="conflictData.isDirectory; else fileConflictDesc">
              {{ i18n.t('conflict.existsLocal') || '已存在于本地目录' }}
            </ng-container>
            <ng-template #fileConflictDesc>
              {{ conflictData.isSamePane ? '目标位置已存在同名文件' : (conflictData.direction === 'download' ? i18n.t('conflict.existsLocal') : i18n.t('conflict.existsRemote')) }}
            </ng-template></div>
          <!-- 对比区域：上下布局 -->
          <div class="conflict-compare">
            <div class="conflict-side conflict-side-remote">
              <div class="conflict-side-title">{{ conflictData.isSamePane ? '📄 源文件' : '☁️ ' + i18n.t('conflict.remoteFile') }}</div>
              <div class="conflict-file-info">
                <div class="conflict-info-row"
                  [class.conflict-diff]="conflictData.localSize !== conflictData.remoteSize">
                  <span class="conflict-label">{{ i18n.t('conflict.size') }}</span>
                  <span class="conflict-val">{{ formatSize(conflictData.remoteSize) }}</span>
                  <span class="conflict-diff-dot" *ngIf="conflictData.localSize !== conflictData.remoteSize">≠</span>
                </div>
                <div class="conflict-info-row"
                  [class.conflict-diff]="conflictData.localMtime !== conflictData.remoteMtime">
                  <span class="conflict-label">{{ i18n.t('conflict.modified') }}</span>
                  <span class="conflict-val">{{ formatDate(conflictData.remoteMtime) }}</span>
                  <span class="conflict-diff-dot" *ngIf="conflictData.localMtime !== conflictData.remoteMtime">≠</span>
                </div>
                <div class="conflict-info-row conflict-path">
                  <span class="conflict-label">{{ i18n.t('conflict.path') }}</span>
                  <span class="conflict-val" [title]="conflictData.remotePath">{{ conflictData.remotePath }}</span>
                </div>
              </div>
            </div>
            <div class="conflict-vs-row">
              <span class="conflict-vs-line"></span>
              <span class="conflict-vs">VS</span>
              <span class="conflict-vs-line"></span>
            </div>
            <div class="conflict-side conflict-side-local">
              <div class="conflict-side-title">{{ conflictData.isSamePane ? '📂 目标文件（已存在）' : '📁 ' + i18n.t('conflict.localFile') }}</div>
              <div class="conflict-file-info">
                <div class="conflict-info-row"
                  [class.conflict-diff]="conflictData.localSize !== conflictData.remoteSize">
                  <span class="conflict-label">{{ i18n.t('conflict.size') }}</span>
                  <span class="conflict-val">{{ formatSize(conflictData.localSize) }}</span>
                  <span class="conflict-diff-dot" *ngIf="conflictData.localSize !== conflictData.remoteSize">≠</span>
                </div>
                <div class="conflict-info-row"
                  [class.conflict-diff]="conflictData.localMtime !== conflictData.remoteMtime">
                  <span class="conflict-label">{{ i18n.t('conflict.modified') }}</span>
                  <span class="conflict-val">{{ formatDate(conflictData.localMtime) }}</span>
                  <span class="conflict-diff-dot" *ngIf="conflictData.localMtime !== conflictData.remoteMtime">≠</span>
                </div>
                <div class="conflict-info-row conflict-path">
                  <span class="conflict-label">{{ i18n.t('conflict.path') }}</span>
                  <span class="conflict-val" [title]="conflictData.localPath">{{ conflictData.localPath }}</span>
                </div>
              </div>
            </div>
          </div>
          <!-- 操作按钮 -->
          <div class="conflict-actions">
            <button class="conflict-btn" (click)="resolveConflict('cancel')">{{ i18n.t('conflict.cancel') }}</button>
            <button class="conflict-btn conflict-btn-skip" (click)="resolveConflict('skip')">{{ i18n.t('conflict.skip') }}</button>
            <button class="conflict-btn conflict-btn-rename" (click)="resolveConflict('rename')">{{ i18n.t('conflict.rename') }}</button>
            <button class="conflict-btn conflict-btn-danger" (click)="resolveConflict('overwrite')">{{ i18n.t('conflict.overwrite') }}</button>
          </div>
          <!-- 全部操作 -->
          <div class="conflict-all-row">
            <span class="conflict-all-label">{{ i18n.t('conflict.batch') }}</span>
            <button class="conflict-link" (click)="resolveConflict('skip-all')">{{ i18n.t('conflict.skipAll') }}</button>
            <span class="conflict-sep">·</span>
            <button class="conflict-link" (click)="resolveConflict('rename-all')">{{ i18n.t('conflict.renameAll') }}</button>
            <span class="conflict-sep">·</span>
            <button class="conflict-link" (click)="resolveConflict('overwrite-all')">{{ i18n.t('conflict.overwriteAll') }}</button>
          </div>
        </div>
      </div>

      <!-- 右键菜单 -->
      <div class="context-menu"
           *ngIf="contextMenuVisible"
           [style.left]="contextMenuX + 'px'"
           [style.top]="contextMenuY + 'px'">
        <div class="ctx-item" (click)="ctxNewFolder()">{{ i18n.t('file.newFolder') }}</div>
        <div class="ctx-item" (click)="ctxNewFile()">{{ i18n.t('file.newFile') }}</div>
        <div class="ctx-sep" *ngIf="hasContextSelection() || hasFileActions()"></div>
        <div class="ctx-item" (click)="ctxRename()" *ngIf="contextMenuPane === 'local' ? selectedLocal.length === 1 : selectedRemote.length === 1">{{ i18n.t('app.rename') }}</div>
        <div class="ctx-item ctx-danger"
             *ngIf="hasContextSelection()"
             (click)="ctxDelete()">{{ i18n.t('app.delete') }}</div>
        <div class="ctx-item" (click)="ctxOpenLocalFile()" *ngIf="contextMenuPane === 'local' && selectedLocal.length === 1 && contextMenuEntry && !contextMenuEntry.isDirectory">{{ effectiveLang === 'zh-CN' ? '打开文件' : 'Open File' }}</div>
        <div class="ctx-item" (click)="ctxRevealInExplorer()" *ngIf="contextMenuPane === 'local' && selectedLocal.length === 1 && contextMenuEntry">{{ effectiveLang === 'zh-CN' ? '在文件管理器中显示' : 'Show in Explorer' }}</div>
        <div class="ctx-item" (click)="ctxChmod()" *ngIf="contextMenuPane === 'remote' && selectedRemote.length === 1">{{ i18n.t('permission.title') }}</div>
        <div class="ctx-item" (click)="ctxDetails()" *ngIf="contextMenuEntry">{{ i18n.t('file.properties') }}</div>
        <div class="ctx-sep" *ngIf="hasContextSelection() || clipboardEntries.length > 0"></div>
        <div class="ctx-item" (click)="ctxClipboardCopy()" *ngIf="hasContextSelection()">{{ i18n.t('file.copy') }}<span class="ctx-shortcut">{{ modKey }}C</span></div>
        <div class="ctx-item" (click)="ctxClipboardCut()" *ngIf="hasContextSelection()">{{ i18n.t('file.cut') }}<span class="ctx-shortcut">{{ modKey }}X</span></div>
        <div class="ctx-item" (click)="ctxClipboardPaste()" *ngIf="clipboardEntries.length > 0">{{ i18n.t('file.paste') }}<span class="ctx-shortcut">{{ modKey }}V</span></div>
        <div class="ctx-sep"></div>
        <div class="ctx-item" (click)="ctxRefresh()">{{ i18n.t('app.refresh') }}</div>
        <div class="ctx-item" (click)="ctxSelectAll()">{{ i18n.t('pane.selectAll') }}<span class="ctx-shortcut">{{ modKey }}A</span></div>
        <div class="ctx-item" (click)="ctxSelectInvert()">{{ effectiveLang === 'zh-CN' ? '反选' : 'Invert Selection' }}</div>
        <div class="ctx-item" (click)="ctxCopyPath()" *ngIf="contextMenuEntry">{{ i18n.t('pane.copyPath') }}</div>
      </div>

      <!-- 表头右键菜单（列选择） -->
      <div class="context-menu"
           *ngIf="headerMenuVisible"
           [style.left]="headerMenuX + 'px'"
           [style.top]="headerMenuY + 'px'">
        <div class="ctx-item" (click)="adjustColumnWidth()" *ngIf="headerMenuCol"><span class="ctx-check"></span> {{ i18n.t('file.adjustCol') }}</div>
        <div class="ctx-item" (click)="adjustAllColumnsWidth()"><span class="ctx-check"></span> {{ i18n.t('file.adjustAllCols') }}</div>
        <div class="ctx-sep"></div>
        <div class="ctx-item ctx-disabled"><span class="ctx-check">✓</span> {{ i18n.t('file.name') }}</div>
        <div class="ctx-item" (click)="toggleColumn('size', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColSize : remoteShowColSize)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColSize : remoteShowColSize)"></span> {{ i18n.t('file.size') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('date', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColDate : remoteShowColDate)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColDate : remoteShowColDate)"></span> {{ i18n.t('file.modified') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('access', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColAccess : remoteShowColAccess)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColAccess : remoteShowColAccess)"></span> {{ i18n.t('file.accessed') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('owner', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColOwner : remoteShowColOwner)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColOwner : remoteShowColOwner)"></span> {{ i18n.t('file.owner') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('group', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColGroup : remoteShowColGroup)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColGroup : remoteShowColGroup)"></span> {{ i18n.t('file.group') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('perms', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColPerms : remoteShowColPerms)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColPerms : remoteShowColPerms)"></span> {{ i18n.t('file.permissions') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('mode', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColMode : remoteShowColMode)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColMode : remoteShowColMode)"></span> {{ i18n.t('file.mode') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('path', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColPath : remoteShowColPath)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColPath : remoteShowColPath)"></span> {{ i18n.t('file.path') }}
        </div>
        <div class="ctx-item" (click)="toggleColumn('ext', contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? localShowColExt : remoteShowColExt)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? localShowColExt : remoteShowColExt)"></span> {{ i18n.t('file.ext') }}
        </div>
        <div class="ctx-sep"></div>
        <div class="ctx-item" (click)="toggleShowHidden(contextMenuPane)">
          <span class="ctx-check" *ngIf="(contextMenuPane === 'local' ? showHiddenLocal : showHiddenRemote)">✓</span><span class="ctx-check" *ngIf="!(contextMenuPane === 'local' ? showHiddenLocal : showHiddenRemote)"></span> {{ i18n.t('pane.showHidden') }}
        </div>
        <div class="ctx-item" (click)="togglePanelBorder()">
          <span class="ctx-check" *ngIf="showPanelBorder">✓</span><span class="ctx-check" *ngIf="!showPanelBorder"></span> {{ i18n.t('view.panelBorder') }}
        </div>
        <div class="ctx-item" (click)="toggleColBorders()">
          <span class="ctx-check" *ngIf="showColBorders">✓</span><span class="ctx-check" *ngIf="!showColBorders"></span> {{ i18n.t('view.colBorder') }}
        </div>
        <div class="ctx-item" (click)="toggleZebra()">
          <span class="ctx-check" *ngIf="showZebra">✓</span><span class="ctx-check" *ngIf="!showZebra"></span> {{ i18n.t('view.zebra') }}
        </div>
      </div>

      <!-- 权限编辑对话框 -->
      <div class="overlay" *ngIf="showPermDialog">
        <div class="dialog perm-dialog">
          <div class="dialog-title">{{ i18n.t('permission.title') }}</div>
          <div class="perm-grid">
            <div class="perm-header"></div>
            <div class="perm-header">{{ i18n.t('permission.read') }}</div>
            <div class="perm-header">{{ i18n.t('permission.write') }}</div>
            <div class="perm-header">{{ i18n.t('permission.execute') }}</div>
            <div class="perm-label">{{ i18n.t('permission.owner') }}</div>
            <input type="checkbox" [(ngModel)]="permOwnerRead" (change)="updatePermMode()" />
            <input type="checkbox" [(ngModel)]="permOwnerWrite" (change)="updatePermMode()" />
            <input type="checkbox" [(ngModel)]="permOwnerExec" (change)="updatePermMode()" />
            <div class="perm-label">{{ i18n.t('permission.group') }}</div>
            <input type="checkbox" [(ngModel)]="permGroupRead" (change)="updatePermMode()" />
            <input type="checkbox" [(ngModel)]="permGroupWrite" (change)="updatePermMode()" />
            <input type="checkbox" [(ngModel)]="permGroupExec" (change)="updatePermMode()" />
            <div class="perm-label">{{ i18n.t('permission.others') }}</div>
            <input type="checkbox" [(ngModel)]="permOtherRead" (change)="updatePermMode()" />
            <input type="checkbox" [(ngModel)]="permOtherWrite" (change)="updatePermMode()" />
            <input type="checkbox" [(ngModel)]="permOtherExec" (change)="updatePermMode()" />
          </div>
          <div class="perm-preview">{{ i18n.t('permission.mode') }}: {{ permModePreview }}</div>
          <div class="dialog-buttons">
            <button (click)="confirmPermDialog()" [disabled]="!permTargetPath">{{ i18n.t('app.confirm') }}</button>
            <button (click)="cancelPermDialog()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- 详细信息对话框 -->
      <div class="overlay" *ngIf="detailsVisible" (click)="detailsVisible = false">
        <div class="dialog details-dialog" (click)="$event.stopPropagation()">
          <div class="dialog-title">{{ i18n.t('file.properties') }}</div>
          <div class="details-body" *ngIf="detailsEntry">
            <table class="details-table">
              <tr><td class="dt-label">{{ i18n.t('file.name') }}</td><td class="dt-value">{{ detailsEntry.name }}</td></tr>
              <tr><td class="dt-label">{{ i18n.t('file.type') }}</td><td class="dt-value">{{ detailsEntry.isDirectory ? (effectiveLang === 'zh-CN' ? '文件夹' : 'Folder') : getFileExt(detailsEntry.name) || (effectiveLang === 'zh-CN' ? '文件' : 'File') }}</td></tr>
              <tr><td class="dt-label">{{ i18n.t('file.path') }}</td><td class="dt-value dt-path">{{ getEntryPath(detailsEntry) }}</td></tr>
              <tr *ngIf="!detailsEntry.isDirectory"><td class="dt-label">{{ i18n.t('file.size') }}</td><td class="dt-value">{{ formatSize(getEntrySize(detailsEntry)) }}</td></tr>
              <tr><td class="dt-label">{{ i18n.t('file.modified') }}</td><td class="dt-value">{{ formatDate(getEntryMtime(detailsEntry)) }}</td></tr>
              <tr *ngIf="getEntryBirthtimeMs(detailsEntry)"><td class="dt-label">{{ i18n.t('file.created') }}</td><td class="dt-value">{{ formatDate(getEntryBirthtimeMs(detailsEntry)) }}</td></tr>
              <tr *ngIf="getEntryAtimeMs(detailsEntry)"><td class="dt-label">{{ i18n.t('file.accessed') }}</td><td class="dt-value">{{ formatDate(getEntryAtimeMs(detailsEntry)) }}</td></tr>
              <tr *ngIf="getEntryMode(detailsEntry) != null"><td class="dt-label">{{ i18n.t('file.permissions') }}</td><td class="dt-value">{{ formatMode(getEntryMode(detailsEntry)) }} ({{ formatOctalMode(getEntryMode(detailsEntry)) }})</td></tr>
              <tr *ngIf="getEntryOwner(detailsEntry) != null"><td class="dt-label">{{ i18n.t('file.owner') }}</td><td class="dt-value">{{ getEntryOwner(detailsEntry) }}</td></tr>
              <tr *ngIf="getEntryGroup(detailsEntry) != null"><td class="dt-label">{{ i18n.t('file.group') }}</td><td class="dt-value">{{ getEntryGroup(detailsEntry) }}</td></tr>
            </table>
          </div>
          <div class="dialog-buttons">
            <button (click)="detailsVisible = false">{{ i18n.t('app.confirm') }}</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    /* 注意：--_bg / --_text 等 CSS 变量声明必须在 :host 上，
       否则 .sftp-root 子元素的 CSS 声明会覆盖 _applyAutoTheme() 设置的 inline 样式 */
    /* 优先级：_applyAutoTheme inline → --sftp-* 预设变量 → Tabby 主题变量 → 回退值 */
    :host {
      --_bg: var(--sftp-bg, var(--body-bg, #f9fafb));
      --_text: var(--sftp-text, var(--text-color, #1f2937));
      --_primary: var(--sftp-primary, var(--primary-color, #3b82f6));
      --_border: var(--sftp-border, var(--border-color, #e5e7eb));
      --_content: var(--sftp-content, var(--_bg));
      --_surface: rgba(128, 128, 128, 0.06);
      --_hover: rgba(128, 128, 128, 0.12);
      --_active: rgba(128, 128, 128, 0.18);
      --_input-bg: rgba(128, 128, 128, 0.06);
      /* 滚动条变量：light 模式为浅灰，dark 模式会被 _applyAutoTheme inline 覆盖 */
      --_scroll-track: rgba(128, 128, 128, 0.06);
      --_scroll-thumb: rgba(128, 128, 128, 0.28);
      --_scroll-thumb-hover: rgba(128, 128, 128, 0.45);
    }

    .sftp-root {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      min-width: 0;   /* 允许在窄容器中收缩 */
      padding: 8px;
      gap: 6px;
      position: relative;
      background: var(--_bg);
      color: var(--_text);
      font-size: 13px;
      font-family: var(--font-family, 'Segoe UI', sans-serif);
      box-sizing: border-box;
      pointer-events: auto;
      outline: none;
      /* 面板立即显示，无任何过渡动效 */
      transition: none !important;
      animation: none !important;
    }
    .top-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 12px;
      background: var(--header-bg, var(--_content));
      border-radius: 8px 8px 0 0;
      flex-shrink: 0;
      border-bottom: 1px solid var(--_border);
    }
    .title { font-weight: 700; color: var(--_primary); font-size: 15px; }
    .host-info { font-size: 12px; opacity: 0.6; margin-left: 4px; flex-shrink: 0; }
    /* 断开连接指示器 - 嵌入标题栏 */
    .disconnect-indicator {
      display: inline-flex; align-items: center; gap: 6px;
      margin-left: 8px; padding: 2px 10px 2px 8px;
      border-radius: 4px;
      background: rgba(239, 68, 68, 0.10);
      border: 1px solid rgba(239, 68, 68, 0.25);
      font-size: 12px;
      flex-shrink: 0;
    }
    .disconnect-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #ef4444; flex-shrink: 0;
      animation: pulse-dot 1.5s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .disconnect-tag { color: #ef4444; font-weight: 500; }
    .disconnect-indicator .reconnect-btn {
      padding: 1px 8px; border-radius: 3px;
      border: 1px solid rgba(239, 68, 68, 0.4);
      background: transparent;
      color: #ef4444; font-size: 11px; cursor: pointer;
      transition: background 0.12s;
      line-height: 20px;
    }
    .disconnect-indicator .reconnect-btn:hover { background: rgba(239, 68, 68, 0.15); }
    .disconnect-indicator .reconnect-btn:disabled { opacity: 0.4; cursor: default; }
    .top-actions { display: flex; gap: 6px; align-items: center; margin-left: auto; }
    .btn-link {
      background: none; border: none; color: var(--_text);
      cursor: pointer; font-size: 12px; padding: 3px 8px; border-radius: 4px;
      transition: background 0.15s;
    }
    .btn-link:hover { background: var(--_hover); }
    .btn-close {
      background: none; border: none; color: var(--_text, var(--text-color, #888));
      cursor: pointer; font-size: 16px; padding: 2px 8px; border-radius: 4px;
      line-height: 1;
    }
    .btn-close:hover { background: rgba(244,67,54,0.12); color: #f44336; }
    .btn-remember-path { font-size: 14px; padding: 2px 6px; }
    .btn-remember-path.active { opacity: 1; background: rgba(59,130,246,0.12); border-radius: 4px; }
    .btn-remember-path:not(.active) { opacity: 0.5; }
    .btn-layout { font-size: 14px; padding: 2px 6px; opacity: 0.6; }
    .btn-layout:hover { opacity: 1; }
    .btn-minimize {
      background: none; border: none; color: var(--_text, var(--text-color, #888));
      cursor: pointer; font-size: 14px; padding: 2px 8px; border-radius: 4px;
      line-height: 1; font-weight: bold;
    }
    .btn-minimize:hover { background: var(--_hover); color: var(--_primary); }

  .sftp-body {
      display: flex;
      flex-direction: row;
      gap: 0;
      flex: 1;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
      border-radius: 8px;
      transition: none !important;
    }
    /* 面板分割线（左右布局时为竖线，上下布局时为横线） */
    .pane-splitter {
      flex-shrink: 0;
      width: 5px;
      cursor: ew-resize;
      background: var(--_bg, var(--body-bg, #1e1e2e));
      position: relative;
      z-index: 10;
      transition: none;
    }
    .pane-splitter:hover,
    .pane-splitter.active {
      background: var(--_bg, var(--body-bg, #1e1e2e));
    }
    .pane-splitter::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 3px;
      height: 30px;
      border-radius: 2px;
      background: var(--_primary, #3b82f6);
      opacity: 0.5;
      transition: opacity 0.15s;
    }
    .pane-splitter:hover::after,
    .pane-splitter.active::after {
      opacity: 1;
    }

    /* 窄屏支撑：flex-direction 由 JS _applyPaneSplit 动态设置 */
    .sftp-body > .pane { overflow: hidden; }
    /* 分割线样式由 JS class 控制，避免 CSS @media 使用视口宽度与元素宽度不同步 */
    .sftp-body.narrow-layout .pane-splitter {
      width: auto;
      height: 5px;
      cursor: ns-resize;
    }
    .sftp-body.narrow-layout .pane-splitter::after {
      width: 30px;
      height: 3px;
    }
    .pane {
      display: flex;
      flex-direction: column;
      position: relative;
      border: 1px solid var(--_border);
      border-radius: 8px;
      /* 不用 overflow:hidden，避免裁切子元素滚动条；border-radius 裁剪由各子元素自行处理 */
      min-height: 0;
      min-width: 0;
      transform: translateZ(0);
      transition: none !important;
    }
    .pane-title {
      display: grid; grid-template-columns: auto 1fr auto;
      gap: 6px; align-items: center; padding: 4px 8px;
      background: var(--_content);
      border-bottom: 1px solid var(--_border);
      border-radius: 8px 8px 0 0;
    }
    .pane-label { font-weight: 600; font-size: 12px; white-space: nowrap; }
    .pane-path { display: flex; gap: 4px; }
    .path-input {
      flex: 1; min-width: 40px; padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--input-bg, var(--_input-bg));
      color: var(--_text); font-size: 12px;
      pointer-events: auto;
      user-select: text !important;
      -webkit-user-select: text !important;
      outline: none;
    }
    .path-input:focus {
      border-color: var(--_primary);
      box-shadow: 0 0 0 1px var(--_primary);
    }
    .pane-actions { display: flex; gap: 3px; }
    .pane-actions button {
      padding: 2px 5px; border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--_text); cursor: pointer;
      font-size: 14px; line-height: 1;
    }
    .pane-actions button:hover { background: var(--_hover); }
    .pane-actions button:disabled { opacity: 0.4; cursor: default; }
    .pane-actions .bm-btn { color: var(--_text-muted, inherit); font-weight: 700; font-size: 14px; }
    .pane-actions .bm-btn:hover { background: var(--_hover); }
    .pane-actions .icon-btn { font-size: 14px; min-width: 26px; text-align: center; display: flex; align-items: center; justify-content: center; }
    .pane-actions .toggle-btn { min-width: 26px; padding: 2px 6px; }
    .pane-actions .toggle-btn.active { background: var(--_active); }

    .pane-filters {
      position: absolute;
      top: 31px;
      left: 0; right: 0;
      z-index: 10;
      display: flex;
      padding: 6px 10px;
      background: var(--_content);
      border: 1px solid var(--_border);
      border-top: none;
      border-radius: 0 0 6px 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: filterFadeIn 0.12s ease;
    }
    @keyframes filterFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .filter-input {
      flex: 1; padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--input-bg, var(--_input-bg));
      color: var(--_text); font-size: 12px;
      pointer-events: auto;
      outline: none;
    }
    .filter-input:focus {
      border-color: var(--_primary);
      box-shadow: 0 0 0 1px var(--_primary);
    }
    .filter-btn {
      display: flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; padding: 0; border: none; border-radius: 4px;
      background: transparent; color: var(--_text); cursor: pointer;
      flex-shrink: 0;
    }
    .filter-btn:hover { background: var(--_hover); }
    .filter-confirm { color: #2ecc71; }
    .filter-confirm:hover { background: rgba(46, 204, 113, 0.15); }
    .filter-clear { color: #e74c3c; }
    .filter-clear:hover { background: rgba(231, 76, 60, 0.15); }

    /* 列表区域：紧贴 filter 栏，无间隙，圆角裁剪 */
    .pane-list {
      flex: 1 1 0%;
      overflow-y: auto; overflow-x: auto;
      /* 允许内容区根据子元素（.entry）的 min-width 撑开宽度，
         配合 .entry { min-width: max-content } 实现整行背景/边框覆盖 */
      min-width: 0;
      padding: 0 10px 10px 10px;
      /* 确保列表区有实底背景防止穿透 */
      background: var(--_bg);
      margin: 0;
      position: relative;
      user-select: none;
      /* Firefox 滚动条 */
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.08));
      /* 底部圆角：与 .pane 的 border-radius:8px 匹配，防止内容溢出圆角 */
      border-radius: 0 0 8px 8px;
    }
    /* WebKit 滚动条 */
    .pane-list::-webkit-scrollbar { width: 8px; height: 8px; }
    .pane-list::-webkit-scrollbar-track {
      background: var(--_scroll-track, rgba(128,128,128,0.08));
      border-radius: 4px;
    }
    .pane-list::-webkit-scrollbar-thumb {
      background: var(--_scroll-thumb, rgba(128,128,128,0.35));
      border-radius: 4px;
      min-height: 30px;
      min-width: 30px;
      transition: background 0.2s;
    }
    .pane-list::-webkit-scrollbar-thumb:hover {
      background: var(--_scroll-thumb-hover, rgba(128,128,128,0.55));
    }
    .pane-list::-webkit-scrollbar-thumb:active {
      background: var(--_primary, #4dabff);
    }
    .pane-list::-webkit-scrollbar-corner {
      background: var(--_scroll-track, rgba(128,128,128,0.08));
    }
    /* 框选矩形（Rubber Band Selection） */
    .rubber-band-rect {
      position: absolute;
      border: 1px dashed rgba(59, 130, 246, 0.7);
      background: rgba(59, 130, 246, 0.12);
      pointer-events: none;
      z-index: 10;
      border-radius: 2px;
    }
    /* 书签列表 / 传输日志 / 日志列表统一滚动条 */
    .bookmark-list::-webkit-scrollbar,
    .sftp-transfers::-webkit-scrollbar,
    .log-list::-webkit-scrollbar { width: 6px; height: 6px; }
    .bookmark-list::-webkit-scrollbar-track,
    .sftp-transfers::-webkit-scrollbar-track,
    .log-list::-webkit-scrollbar-track {
      background: var(--_scroll-track, rgba(128,128,128,0.06));
      border-radius: 3px;
    }
    .bookmark-list::-webkit-scrollbar-thumb,
    .sftp-transfers::-webkit-scrollbar-thumb,
    .log-list::-webkit-scrollbar-thumb {
      background: var(--_scroll-thumb, rgba(128,128,128,0.32));
      border-radius: 3px;
    }
    .bookmark-list::-webkit-scrollbar-thumb:hover,
    .sftp-transfers::-webkit-scrollbar-thumb:hover,
    .log-list::-webkit-scrollbar-thumb:hover {
      background: var(--_scroll-thumb-hover, rgba(128,128,128,0.5));
    }
    .entry {
      display: grid;
      /* grid-template-columns 由动态绑定设置，此处为默认值 */
      grid-template-columns: 24px 200px 80px 140px 70px;
      gap: 4px; padding: 0 8px;
      cursor: pointer; user-select: none;
      align-items: center;
      font-size: 12px;
      line-height: 1.4;
      width: max-content;
      min-width: 100%;
    }
    .entry > span {
      padding: 3px 0;
      /* 省略号生效关键：
         - min-width: 0 → 允许 grid 子项缩小到内容以下
         - contain: inline-size → 阻止 flex 内容影响容器宽度
         - overflow: hidden + text-overflow: ellipsis → 文本截断 */
      min-width: 0;
      contain: inline-size;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* 列边框开启时，需让 span 撑满行高以保证竖线贯通 */
    .sftp-root.has-col-borders .entry > span {
      align-self: stretch;
      display: flex;
      align-items: center;
      min-height: 22px;
    }
    /* 斑马纹 - 仅在 .has-zebra 时启用 */
    /* 列边框竖线：给每个 entry 内的 span（除最后一个）加右侧分割线 */
    /* 由于 .entry padding 已上移至 span，竖线贯通整行高度 */
    .sftp-root.has-col-borders .entry > span {
      border-right: 1px solid var(--_border, rgba(128,128,128,0.2));
    }
    /* 面板圆角通过 sftp-body 的 border-radius + overflow:hidden 实现 */

    .sftp-root.has-zebra .entry:not(.header):nth-child(even) { background: var(--_surface); }
    /* 斑马纹偶数行 hover 需更高优先级覆盖斑马纹背景 */
    .sftp-root.has-zebra .entry:not(.header):nth-child(even):hover { background: color-mix(in srgb, var(--_primary) 57%, transparent); }
    /* 选中行 - 优先级最高，不受斑马纹影响 */
    .entry.selected,
    .sftp-root.has-zebra .entry:not(.header):nth-child(even).selected {
      background: color-mix(in srgb, var(--_primary) 77%, transparent) !important;
    }
    .entry:hover:not(.selected):not(.header) { background: color-mix(in srgb, var(--_primary) 57%, transparent); }
    .entry.header {
      /* 确保表头完全不透明 */
      background: var(--_content);
      font-weight: 600; font-size: 12px;
      position: sticky; top: 0;
      z-index: 5;
      color: var(--_primary);
      border-bottom: 2px solid var(--_primary);
      padding-top: 6px;
      /* 强制表头所有列文字完全不透明 */
      & > span { opacity: 1 !important; }
    }
    /* 列 resize handle 嵌入在各列 span 内部，position: absolute 始终对齐列边界 */
    .name, .size, .date, .perms, .mode, .access, .owner, .group, .path, .ext {
      position: relative;
      min-width: 0;  /* 防止撑破 grid 列宽导致对齐偏移 */
    }
    .col-resize-handle {
      position: absolute;
      right: -1.5px;   /* gap=4px, 3px宽handle居中于列间 */
      top: 0;
      bottom: 0;
      width: 3px;
      cursor: col-resize;
      z-index: 10;
      background: transparent;
      border-radius: 1px;
      transition: background 0.15s;
    }
    .col-resize-handle:hover,
    .col-resize-handle.resizing {
      background: var(--_primary, #4dabff);
      opacity: 0.7;
    }
    .entry.up-entry { opacity: 0.6; }
    .entry.dim { opacity: 0.5; }
    .icon { text-align: center; font-size: 14px; width: 24px; }
    .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-family: inherit; }
    .size { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .date { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; }
    .perms { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .mode { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .access { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; }
    .owner { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .group { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; }
    .ext { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .sortable { cursor: pointer; display: inline-flex; align-items: center; gap: 2px; }
    .sortable:hover { color: var(--_primary); }
    .sort-arrow { font-size: 11px; opacity: 1; margin-left: 1px; }
    .pane-empty { padding: 20px; text-align: center; opacity: 0.4; font-size: 12px; }

    /* 加载提示 - 绝对定位覆盖整个 pane（不受 scroll 影响） */
    .pane-loading {
      position: absolute; inset: 0; z-index: 10;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: color-mix(in srgb, var(--_bg, var(--body-bg, #1e1e2e)) 92%, transparent);
    }
    .pane-loading .spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--_border, rgba(128,128,128,0.2));
      border-top: 2px solid var(--_primary, #3b82f6);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    /* 加载时锁定滚动 */
    .pane-loading-active { overflow: hidden !important; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* 刷新成功闪烁（极简，避免视觉抖动） */
    .pane-flash {
      animation: flash 0.25s ease-out;
    }
    @keyframes flash {
      0% { background-color: transparent; }
      30% { background-color: rgba(59,130,246,0.06); }
      100% { background-color: transparent; }
    }

    .pane-actions-bar {
      display: flex; align-items: center;
      padding: 4px 8px; border-top: 1px solid var(--_border);
      background: var(--_content);
    }
    .selection-info { font-size: 12px; opacity: 0.7; min-width: 60px; }
    .size-hint { opacity: 0.5; font-size: 11px; }
    .action-buttons { display: flex; gap: 3px; margin-left: auto; }
    .action-buttons button {
      padding: 2px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer; font-size: 12px;
    }
    .action-buttons button:hover { background: var(--_hover); }
    .action-buttons button:disabled { opacity: 0.4; cursor: default; }

    .sftp-transfers {
      display: flex; flex-direction: column; gap: 4px;
      max-height: 100px; overflow-y: auto;
      border-top: 2px solid var(--_primary);
      padding-top: 4px; flex-shrink: 0;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
      position: relative; z-index: 5;
    }
    .transfer {
      display: grid; grid-template-columns: 1fr auto; gap: 8px;
      padding: 4px 8px; border-radius: 6px;
      background: var(--_surface); border: 1px solid var(--_border);
      font-size: 11px;
    }
    .transfer-title { display: flex; gap: 6px; align-items: center; }
    .transfer-size { font-size: 10px; color: var(--_text-muted); white-space: nowrap; }
    .transfer-sub { font-size: 10px; color: var(--_text-muted); margin-top: 2px; padding-left: 20px; }
    .direction { font-size: 14px; }
    .bar { height: 4px; background: var(--_border); border-radius: 2px; overflow: hidden; margin-top: 4px; }
    .fill {
      height: 100%; background: linear-gradient(90deg, var(--_primary), #78ffce);
      border-radius: 2px; transition: width 0.3s;
    }
    .transfer-stats { display: flex; gap: 6px; align-items: center; font-family: monospace; }
    .transfer-stats button { background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 13px; line-height: 1; opacity: 0.7; transition: opacity 0.15s; }
    .transfer-stats button:hover { opacity: 1; }
    .btn-cancel { color: #ef4444; }
    .btn-cancel-current { color: #f59e0b; }
    .btn-pause { color: var(--_primary); }
    .btn-resume { color: #22c55e; }
    .paused-tag { font-size: 10px; color: #f59e0b; font-weight: 600; margin-left: 4px; }
    .transfer-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 2px 8px; font-size: 12px; font-weight: 600;
      background: var(--_surface); border-radius: 6px 6px 0 0;
    }
    .transfer-header button { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.6; padding: 0; line-height: 1; }
    .transfer-header button:hover { opacity: 1; }
    .transfer-header-btns { display: flex; gap: 6px; align-items: center; }
    .transfer-count { font-size: 10px; opacity: 0.7; }
    .transfer-empty { text-align: center; padding: 12px; font-size: 11px; color: var(--_text-muted); }

    .sftp-transfers-mini {
      padding: 2px 10px; font-size: 11px; cursor: pointer;
      background: var(--_surface); border-radius: 4px;
      color: var(--_text-muted); text-align: center;
      border: 1px solid var(--_border); margin-top: 4px;
    }
    .sftp-transfers-mini:hover { opacity: 0.8; }

    /* 传输日志增强 */
    .log-time-range { font-size: 10px; color: var(--_text-muted, #888); white-space: nowrap; font-family: 'SFMono-Regular', Consolas, monospace; }
    .log-fail-reason { font-size: 10px; color: #ef4444; white-space: nowrap; }
    .btn-transfers-toggle { white-space: nowrap; }

    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 100;
      /* 立即显示，无淡入动效 */
      transition: none !important;
      animation: none !important;
    }
    .dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px; padding: 16px; min-width: 280px; max-width: 92vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .dialog-text { margin-bottom: 12px; }
    .dialog-title { font-weight: 700; margin-bottom: 12px; color: var(--_primary); }
    .dialog-input {
      width: 100%; padding: 6px 8px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_input-bg);
      color: var(--_text); font-size: 12px;
      margin-bottom: 12px; box-sizing: border-box; outline: none;
    }
    .dialog-input:focus { border-color: var(--_primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--_primary) 25%, transparent); }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .danger { background: #d32f2f !important; border-color: #ef5350 !important; }

    /* 文件冲突对话框 */
    .conflict-dialog {
      min-width: 420px; max-width: 520px;
      padding: 20px 24px; border-radius: 12px;
    }
    /* 标题行 */
    .conflict-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 6px;
    }
    .conflict-title-icon { font-size: 20px; }
    .conflict-title-text { font-size: 16px; font-weight: 700; }
    .conflict-progress {
      margin-left: auto; font-size: 11px; padding: 2px 10px;
      border-radius: 10px; background: var(--_input-bg, rgba(128,128,128,0.08));
      color: var(--_text); opacity: 0.65; font-weight: 500;
    }
    /* 描述 */
    .conflict-desc {
      font-size: 13px; color: var(--_text); opacity: 0.8;
      margin-bottom: 16px; word-break: break-all;
      padding: 0 2px;
    }
    /* 对比区：上下布局 */
    .conflict-compare {
      display: flex; flex-direction: column; gap: 4px;
      margin-bottom: 18px;
    }
    .conflict-side {
      background: var(--_content); border-radius: 8px;
      padding: 10px 14px;
      border: 1px solid var(--_border);
      border-left: 3px solid var(--_primary, #3b82f6);
      display: flex; flex-direction: column; gap: 2px;
    }
    .conflict-side-title {
      font-size: 13px; font-weight: 700;
      margin-bottom: 2px;
      display: flex; align-items: center; gap: 4px;
    }
    .conflict-file-info { display: flex; flex-direction: column; gap: 2px; }
    .conflict-info-row {
      display: flex; align-items: center; gap: 6px; font-size: 12px;
      min-height: 20px;
    }
    .conflict-label {
      flex-shrink: 0; color: var(--_text); opacity: 0.45; min-width: 52px;
      font-size: 11px;
    }
    .conflict-val {
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .conflict-diff {
      background: rgba(255,152,0,0.08);
      border-radius: 3px; padding: 0 2px;
    }
    .conflict-diff-dot {
      flex-shrink: 0; font-size: 10px; font-weight: 700;
      color: #ff9800; width: 14px; text-align: center;
    }
    .conflict-path .conflict-val {
      font-size: 11px; opacity: 0.7;
    }
    /* VS 分隔行 */
    .conflict-vs-row {
      display: flex; align-items: center; gap: 10px;
      padding: 2px 0;
    }
    .conflict-vs-line {
      flex: 1; height: 1px;
      background: var(--_border, rgba(128,128,128,0.2));
    }
    .conflict-vs {
      flex-shrink: 0; font-size: 11px; font-weight: 700;
      padding: 0 10px; color: var(--_text); opacity: 0.4;
      letter-spacing: 1px;
    }
    /* 按钮行 */
    .conflict-actions {
      display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .conflict-btn {
      padding: 6px 18px; border-radius: 6px; border: 1px solid var(--_border);
      background: var(--_content); color: var(--_text); cursor: pointer;
      font-size: 13px; font-weight: 500;
      transition: background 0.12s, border-color 0.12s;
    }
    .conflict-btn:hover { background: var(--_hover); }
    .conflict-btn-skip { opacity: 0.7; }
    .conflict-btn-skip:hover { opacity: 1; }
    .conflict-btn-rename {
      background: transparent; border-color: var(--_primary, #3b82f6);
      color: var(--_primary, #3b82f6);
    }
    .conflict-btn-rename:hover {
      background: rgba(59,130,246,0.1);
    }
    .conflict-btn-danger {
      background: #d32f2f; color: #fff; border-color: #c62828;
      font-weight: 600;
    }
    .conflict-btn-danger:hover { background: #b71c1c; }
    /* "应用于所有" 行 */
    .conflict-all-row {
      display: flex; justify-content: center; gap: 6px; align-items: center;
      padding-top: 8px; border-top: 1px solid var(--_border);
      flex-wrap: wrap;
    }
    .conflict-all-label {
      font-size: 12px; color: var(--_text); opacity: 0.55;
    }
    .conflict-link {
      background: none; border: none; color: var(--_primary, #3b82f6);
      cursor: pointer; font-size: 12px; padding: 2px 6px;
      border-radius: 4px; transition: background 0.12s;
    }
    .conflict-link:hover { background: var(--_hover); text-decoration: underline; }
    .conflict-sep { color: var(--_text); opacity: 0.3; font-size: 12px; }
    .delete-dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 12px; padding: 20px; min-width: 340px; max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }
    .delete-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .delete-header-icon { flex-shrink: 0; width: 14px !important; height: 14px !important; }
    .delete-warn-icon { flex-shrink: 0; width: 18px !important; height: 18px !important; }
    .delete-title { font-size: 15px; font-weight: 600; color: var(--_text); }
    .delete-text { font-size: 13px; color: var(--_text); margin-bottom: 12px; opacity: 0.85; }
    .delete-preview {
      border: 1px solid var(--_border);
      border-radius: 8px; padding: 12px; margin-bottom: 16px;
      background: var(--_content);
    }
    .delete-preview-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; padding: 2px 0;
    }
    .delete-preview-row + .delete-preview-row { margin-top: 3px; }
    .delete-preview-icon { flex-shrink: 0; color: var(--_text); opacity: 0.6; }
    .delete-preview-name { font-weight: 500; color: var(--_text); }
    .delete-preview-label { color: var(--_text); opacity: 0.5; min-width: 60px; }
    .delete-preview-value { color: var(--_text); }

    .bookmark-popup {
      position: absolute;
      width: 320px;
      max-height: 420px;
      display: flex; flex-direction: column;
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      z-index: 200;
      overflow: hidden;
    }
    .popup-arrow {
      position: absolute; top: -6px; left: 24px;
      width: 12px; height: 12px;
      background: var(--_bg);
      border-left: 1px solid var(--_primary);
      border-top: 1px solid var(--_primary);
      transform: rotate(45deg);
    }
    .popup-title {
      padding: 10px 14px 6px;
      font-weight: 700; color: var(--_primary); font-size: 13px;
    }
    .popup-footer {
      display: flex; justify-content: flex-end;
      padding: 6px 10px; border-top: 1px solid var(--_border);
    }
    .popup-footer button {
      padding: 4px 10px; border-radius: 6px; font-size: 11px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .popup-footer button:hover { background: var(--_hover); }
    .bookmark-add-btns { display: flex; gap: 6px; padding: 0 14px 10px; }
    .add-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 6px; font-size: 12px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .add-btn:hover { background: var(--_hover); }
    .add-btn.active { border-color: var(--_primary); background: rgba(59,130,246,0.08); }
    .add-icon { font-weight: 700; font-size: 14px; color: var(--_primary); }
    .bookmark-add-form {
      display: flex; flex-direction: column; gap: 6px;
      padding: 0 10px 10px;
      animation: filterSlideIn 0.15s ease;
    }
    .bookmark-add-form .bm-form-row {
      display: flex; gap: 6px; align-items: center;
    }
    .bookmark-add-form input {
      width: 100%; padding: 6px 8px; border-radius: 4px;
      border: 1px solid var(--_primary);
      background: var(--_input-bg);
      color: var(--_text); font-size: 12px;
      box-sizing: border-box;
    }
    .bookmark-add-form .btn-confirm {
      align-self: flex-end;
      padding: 6px 16px; border-radius: 4px;
      border: 1px solid var(--_primary);
      background: var(--_primary);
      color: #fff; cursor: pointer; font-size: 12px; white-space: nowrap;
    }
    .bookmark-add-form .btn-confirm:disabled { opacity: 0.4; }
    .bookmark-scope-label {
      padding: 4px 10px 2px; font-size: 10px; font-weight: 600;
      color: var(--_primary); opacity: 0.6; text-transform: uppercase;
      border-bottom: 1px solid var(--_border); margin-bottom: 2px;
    }
    .bookmark-list {
      flex: 1; overflow-y: auto; min-height: 0;
      padding: 0 4px;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
    }
    .bookmark-empty {
      padding: 24px 8px; text-align: center;
      font-size: 12px; opacity: 0.4; color: var(--_text);
    }
    .bookmark-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 6px; margin: 1px 0;
      cursor: pointer; transition: background 0.1s, opacity 0.15s;
    }
    .bookmark-item:hover { background: var(--_hover); }
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
    .bm-name {
      font-size: 13px; font-weight: 500; color: var(--_text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bm-path {
      font-size: 10px; color: var(--_text); opacity: 0.45;
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

    .log-dialog { min-width: 620px; max-height: 85vh; overflow: auto; resize: both; }
    .log-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 13px; }
    .log-toolbar select {
      padding: 4px 8px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); font-size: 12px;
    }
    .log-toolbar label { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
    .log-toolbar input[type="checkbox"] { margin: 0; }
    .log-toolbar button {
      padding: 4px 10px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer; font-size: 12px;
    }
    .log-toolbar button.danger { color: var(--_text); background: var(--_content); border-color: var(--_border); }
    .log-toolbar button:hover { background: var(--_hover, rgba(128,128,128,0.1)); }

    .log-list { max-height: 480px; overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
      resize: vertical;
      display: flex; flex-direction: column; gap: 2px;
    }
    .log-entry {
      display: grid;
      grid-template-columns: 150px 1fr auto;
      gap: 10px;
      padding: 7px 10px;
      border-radius: 6px;
      font-size: 12px;
      align-items: start;
      position: relative;
      transition: background 0.12s;
    }
    .log-entry:hover { background: var(--_hover, rgba(128,128,128,0.06)); }
    .log-entry:not(:last-child) { border-bottom: 1px solid var(--_border); }

    /* 左侧：时间 + 操作徽标 */
    .log-left {
      display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
    }
    .log-time {
      font-size: 11px; color: var(--_text); opacity: 0.6;
      font-family: 'SFMono-Regular', Consolas, monospace;
      white-space: nowrap;
    }
    .log-op-badge {
      display: inline-block;
      font-size: 10px; font-weight: 600; letter-spacing: 0.3px;
      padding: 1px 7px; border-radius: 3px; line-height: 1.5;
      text-transform: uppercase;
    }
    .log-op-badge.op-upload { background: rgba(76,175,80,0.15); color: #4caf50; }
    .log-op-badge.op-download { background: rgba(33,150,243,0.15); color: #2196f3; }
    .log-op-badge.op-other { background: rgba(158,158,158,0.15); color: #9e9e9e; }

    /* 中间：文件名 + 路径两行 */
    .log-body {
      min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
    }
    .log-filename {
      font-size: 13px; font-weight: 500; color: var(--_text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .log-path-line {
      font-size: 10px; color: var(--_text); opacity: 0.4;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* 右侧：大小 + 耗时 + 状态 */
    .log-right {
      display: flex; flex-direction: column; gap: 2px; align-items: flex-end;
      min-width: 120px; white-space: nowrap;
    }
    .log-size { font-size: 11px; color: var(--_text); opacity: 0.6; }
    .log-speed { font-size: 10px; color: var(--_primary); opacity: 0.8; }
    .log-duration { font-size: 10px; color: var(--_text); opacity: 0.5; }
    .log-status-icon { font-size: 16px; line-height: 1; }
    .log-status-icon.success { color: #4caf50; }
    .log-status-icon.failed { color: #f44336; }

    .context-menu {
      position: fixed;
      z-index: 100001;
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 6px;
      padding: 4px 0;
      min-width: 140px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .ctx-item {
      padding: 5px 14px;
      cursor: pointer;
      font-size: 12px;
      color: var(--_text);
      white-space: nowrap;
    }
    .ctx-check {
      display: inline-block;
      width: 14px;
      text-align: center;
    }
    .ctx-item:hover {
      background: var(--_hover);
    }
    .ctx-item.ctx-danger:hover {
      background: rgba(244,67,54,0.15);
      color: #f44336;
    }
    .ctx-sep {
      height: 1px;
      background: var(--_border, #334155);
      margin: 3px 0;
    }
    .ctx-item.ctx-disabled {
      cursor: default;
      opacity: 0.5;
    }
    .ctx-item.ctx-disabled:hover {
      background: transparent;
    }
    .ctx-shortcut {
      float: right;
      margin-left: 20px;
      opacity: 0.5;
      font-size: 11px;
    }
    .mode { font-size: 12px; font-family: inherit; text-align: left; }
    /* 详细信息对话框 */
    .details-dialog { min-width: 400px; max-width: 500px; }
    .details-body { margin: 8px 0; }
    .details-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .details-table td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--_border, #334155); }
    .dt-label { width: 80px; opacity: 0.7; white-space: nowrap; }
    .dt-value { word-break: break-all; }
    .dt-path { font-family: monospace; font-size: 11px; }
    /* 权限编辑对话框 */
    .perm-dialog { min-width: 360px; }
    .perm-grid {
      display: grid;
      grid-template-columns: 80px repeat(3, auto);
      gap: 8px;
      align-items: center;
      margin: 12px 0;
    }
    .perm-header {
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--_primary);
    }
    .perm-label {
      font-size: 12px;
      font-weight: 600;
    }
    .perm-grid input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--_primary);
      cursor: pointer;
    }
    .perm-preview {
      font-family: monospace;
      font-size: 13px;
      padding: 6px 8px;
      border-radius: 4px;
      background: var(--_input-bg);
      border: 1px solid var(--_border);
      color: var(--_text);
      margin-bottom: 12px;
    }
  `],
})
export class SftpFloatingPanel implements OnInit, AfterViewInit, OnDestroy {
  // ========== 从外部设置（非 DI）==========
  sshSession: SSHSessionLike | null = null
  profile: any = null
  onClose: (() => void) | null = null   // 关闭回调（销毁面板）
  onMinimize: (() => void) | null = null // 最小化回调（隐藏面板，不销毁）

  // ========== 服务（直接实例化，非 DI）==========
  private sftpService = new SftpConnectionService()
  i18n: SftpI18nService
  private configService?: ConfigService
  private bookmarks: SftpBookmarksService
  private transferLog: SftpTransferLogService

  // ========== 连接 ==========
  /** 终端 Tab 引用（用于重连时获取最新 sshSession） */
  terminalRef: any = null

  /** NotificationsService（延迟获取，可能为空） */
  private notifications: any = null

  /** 是否正在重连 */
  reconnecting = false

  /** 是否已最小化 */
  minimized = false

  connecting = false
  connected = false
  hostInfo = ''

  private sftpSession: SFTPSessionLike | null = null

  // ========== 本地面板 ==========
  localPath: string = os.homedir()
  localEntries: LocalEntry[] = []
  localFilter = ''
  localFilterPending = ''
  showHiddenLocal = false
  localFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private localClickTimer: ReturnType<typeof setTimeout> | null = null
  localPathInput = this.localPath
  localSortBy: 'name' | 'size' | 'modified' | 'birthtime' = 'name'
  localSortAsc = true
  localCache: any = null
  selectedLocal: LocalEntry[] = []
  localLastSelectedIndex: number | null = null
  /** 本地面板是否正在加载 */
  _localLoading = false
  /** 本地面板刷新闪烁 */
  _localFlash = false
  /** 本地面板访问错误（权限不足、路径不存在等） */
  _localError = false

  // ========== 远程面板 ==========
  remotePath = '/'
  remoteEntries: SFTPFile[] = []
  remoteFilter = ''
  remoteFilterPending = ''
  showHiddenRemote = false
  remoteFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private remoteClickTimer: ReturnType<typeof setTimeout> | null = null

  // ---- 心跳检测（检测 SFTP 断连） ----
  /** setInterval ID */
  private _heartbeatTimer: any = null
  /** SSH 会话关闭回调清理函数 */
  private _sshCloseHandler: (() => void) | null = null
  /** 是否正在恢复 SFTP 连接（防止并发恢复） */
  private _heartbeatRecovering = false
  remotePathInput = this.remotePath
  remoteSortBy: 'name' | 'size' | 'modified' | 'birthtime' = 'name'
  remoteSortAsc = true
  remoteCache: any = null
  selectedRemote: SFTPFile[] = []
  remoteLastSelectedIndex: number | null = null
  /** 远程面板是否正在加载 */
  _remoteLoading = false
  /** 远程面板刷新闪烁 */
  _remoteFlash = false
  /** 远程面板访问错误（权限不足、路径不存在等） */
  _remoteError = false

  // ========== 框选（Rubber Band Selection）==========
  rubberBand = {
    active: false,
    pane: '' as 'local' | 'remote',
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
    rectLeft: 0, rectTop: 0, rectWidth: 0, rectHeight: 0,
    /** mousedown 时是否点击在 entry 上 */
    startedOnEntry: false,
  }
  /** 长按检测计时器（从条目上按下 300ms 未移动则进入框选模式） */
  private _rbLongPressTimer: ReturnType<typeof setTimeout> | null = null
  /** 是否已触发长按（进入框选模式，阻止条目拖拽） */
  private _rbLongPress = false
  /** mousedown 时的 clientX/Y，用于检测是否在计时器触发前已移动 */
  private _rbStartClientX = 0
  private _rbStartClientY = 0
  private _rbMoveHandler: ((e: MouseEvent) => void) | null = null
  private _rbUpHandler: ((e: MouseEvent) => void) | null = null
  private _rbMoved = false
  /** 长按激活框选时临时设为 false，阻止原生 dragstart */
  private _rbSuppressDrag = false
  /** 右键框选刚结束，阻止接下来的 contextmenu 弹出 */
  private _rbJustFinishedRightClick = false


  // ========== 传输 ==========
  transfers: Array<{
    transfer: any; direction: 'upload' | 'download'; name: string;
    remotePath: string; localPath: string; percent: number;
    speed: string; bytesDone: number; bytesTotal: number;
    paused: boolean; logEntryId?: string;
    isFolder?: boolean;      // 是否为文件夹传输
    currentItem?: string;    // 当前正在传输的子文件
    currentItemSize?: number; // 当前子文件大小
    itemCount?: number;      // 总文件数
    itemDone?: number;       // 已完成文件数
  }> = []

  // ========== 远程导航历史 ==========
  /** 远程路径导航历史栈 */
  private _remoteNavHistory: string[] = []
  /** 当前在历史栈中的位置（-1 表示空） */
  private _remoteNavIndex = -1
  /** 最大历史记录数 */
  private readonly _remoteNavMax = 50
  /** 是否忽略历史记录（后退/前进导航时跳过记录） */
  private _ignoreNavPush = false
  /** 是否可以后退 */
  get canRemoteBack(): boolean { return this._remoteNavIndex > 0 && this.connected }
  /** 是否可以前进 */
  get canRemoteForward(): boolean { return this._remoteNavIndex < this._remoteNavHistory.length - 1 && this.connected }

  // ========== 本地导航历史 ==========
  /** 本地路径导航历史栈 */
  private _localNavHistory: string[] = []
  /** 当前在历史栈中的位置（-1 表示空） */
  private _localNavIndex = -1
  /** 最大历史记录数 */
  private readonly _localNavMax = 50
  /** 是否忽略历史记录（后退/前进导航时跳过记录） */
  private _ignoreLocalNavPush = false
  /** 是否可以后退 */
  get canLocalBack(): boolean { return this._localNavIndex > 0 }
  /** 是否可以前进 */
  get canLocalForward(): boolean { return this._localNavIndex < this._localNavHistory.length - 1 }

  // ========== 对话框 ==========
  deleteConfirmVisible = false
  deleteConfirmBatch = false  // true=批量, false=单个
  /** 单个删除时的条目信息 */
  deleteItemName = ''
  deleteItemIsDir = false
  deleteItemType = ''
  deleteItemSize: string | null = null
  deleteItemDate = ''
  /** 批量删除提示文本 */
  batchDeleteText = ''
  private pendingLocalDelete: LocalEntry[] = []
  private pendingRemoteDelete: SFTPFile[] = []

  inputDialogVisible = false
  inputDialogTitle = ''
  inputDialogPlaceholder = ''
  inputDialogValue = ''
  private inputDialogMode: 'local-mkdir' | 'remote-mkdir' | 'local-rename' | 'remote-rename' | 'remote-chmod' | 'local-touch' | 'remote-touch' | null = null
  private inputDialogTargetPath: string | null = null
  private inputDialogRemotePath: string | null = null

  // ========== 书签 ==========
  showBookmarks = false
  bookmarkPane: 'local' | 'remote' = 'local'
  bookmarkAddScope: 'connection' | 'global' | null = null
  newBookmarkName = ''
  newBookmarkPath = ''
  bookmarkPopupX = 0
  bookmarkPopupY = 0
  // 拖拽排序状态
  dragSourceIdx = -1
  dragSourceScope: BookmarkScope = 'all'
  dragOverIdx = -1
  dragOverScope: BookmarkScope = 'all'
  dragOverBottom = false
  private _editingBookmarkId: string | null = null

  // ========== 右键菜单 ==========
  contextMenuVisible = false
  contextMenuX = 0
  contextMenuY = 0
  contextMenuPane: 'local' | 'remote' = 'local'
  contextMenuEntry: LocalEntry | SFTPFile | null = null

  // ========== 剪贴板 ==========
  clipboardEntries: (LocalEntry | SFTPFile)[] = []
  clipboardSource: 'local' | 'remote' = 'local'
  clipboardMode: 'copy' | 'cut' = 'copy'
  /** 最后点击/操作的面板，用于快捷键判断作用域 */
  activePane: 'local' | 'remote' = 'local'

  // ========== 详细信息对话框 ==========
  detailsVisible = false
  detailsEntry: LocalEntry | SFTPFile | null = null
  detailsIsLocal = false

  // ========== 列可见性配置 ==========
  static readonly LOCAL_COLS_KEY = 'sftp-plus-local-cols'
  static readonly LOCAL_COL_ORDER_KEY = 'sftp-plus-local-cols-order'
  static readonly REMOTE_COLS_KEY = 'sftp-plus-remote-cols'
  static readonly REMOTE_COL_ORDER_KEY = 'sftp-plus-remote-cols-order'
  static readonly ALL_COLS = ['size', 'date', 'created', 'perms', 'mode', 'access', 'owner', 'group', 'path', 'ext'] as const
  // ---- 本地列设置 ----
  localShowColSize = true
  localShowColDate = true
  localShowColCreated = false
  localShowColPerms = true
  localShowColMode = false
  localShowColAccess = false
  localShowColOwner = false
  localShowColGroup = false
  localShowColPath = false
  localShowColExt = false
  localColNameWidth = 200
  localColSizeWidth = 80
  localColDateWidth = 140
  localColCreatedWidth = 140
  localColPermsWidth = 70
  localColAccessWidth = 140
  localColOwnerWidth = 80
  localColGroupWidth = 70
  localColModeWidth = 60
  localColPathWidth = 120
  localColExtWidth = 60
  localColOrder: string[] = [...SftpFloatingPanel.ALL_COLS]
  get localVisibleCols(): string[] {
    return this.localColOrder.filter(c => this._localColVisible(c))
  }
  private _localColVisible(col: string): boolean {
    if (col === 'size') return this.localShowColSize
    if (col === 'date') return this.localShowColDate
    if (col === 'created') return this.localShowColCreated
    if (col === 'perms') return this.localShowColPerms
    if (col === 'mode') return this.localShowColMode
    if (col === 'access') return this.localShowColAccess
    if (col === 'owner') return this.localShowColOwner
    if (col === 'group') return this.localShowColGroup
    if (col === 'path') return this.localShowColPath
    if (col === 'ext') return this.localShowColExt
    return false
  }
  // ---- 远程列设置 ----
  remoteShowColSize = true
  remoteShowColDate = true
  remoteShowColCreated = false
  remoteShowColPerms = true
  remoteShowColMode = false
  remoteShowColAccess = false
  remoteShowColOwner = false
  remoteShowColGroup = false
  remoteShowColPath = false
  remoteShowColExt = false
  remoteColNameWidth = 200
  remoteColSizeWidth = 80
  remoteColDateWidth = 140
  remoteColCreatedWidth = 140
  remoteColPermsWidth = 70
  remoteColAccessWidth = 140
  remoteColOwnerWidth = 80
  remoteColGroupWidth = 70
  remoteColModeWidth = 60
  remoteColPathWidth = 120
  remoteColExtWidth = 60
  remoteColOrder: string[] = [...SftpFloatingPanel.ALL_COLS]
  get remoteVisibleCols(): string[] {
    return this.remoteColOrder.filter(c => this._remoteColVisible(c))
  }
  private _remoteColVisible(col: string): boolean {
    if (col === 'size') return this.remoteShowColSize
    if (col === 'date') return this.remoteShowColDate
    if (col === 'created') return this.remoteShowColCreated
    if (col === 'perms') return this.remoteShowColPerms
    if (col === 'mode') return this.remoteShowColMode
    if (col === 'access') return this.remoteShowColAccess
    if (col === 'owner') return this.remoteShowColOwner
    if (col === 'group') return this.remoteShowColGroup
    if (col === 'path') return this.remoteShowColPath
    if (col === 'ext') return this.remoteShowColExt
    return false
  }
  // 表头右键菜单状态
  headerMenuVisible = false
  headerMenuX = 0
  headerMenuY = 0
  /** 表头右键菜单：当前右键的列名（如 'name', 'size'），用于"调整列宽" */
  headerMenuCol: string | null = null

  // ========== 权限编辑对话框 ==========
  showPermDialog = false
  permOwnerRead = false
  permOwnerWrite = false
  permOwnerExec = false
  permGroupRead = false
  permGroupWrite = false
  permGroupExec = false
  permOtherRead = false
  permOtherWrite = false
  permOtherExec = false
  permModePreview = '755'
  permTargetPath = ''

  // ========== 表格样式设置（从设置页读取）==========
  static readonly TABLE_SETTINGS_KEY = 'sftp-plus-table'
  showColBorders = false  // 显示边框（默认关闭）
  showPanelBorder = true  // 显示面板边框
  showZebra = false       // 显示斑马纹（默认关闭）

  private loadTableSettings(): void {
    try {
      // 直接从 localStorage 读取，绕过 _paneStore 缓存
      // 避免因 _paneFlushToConfig 导致的配置覆盖问题
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const borders = localStorage.getItem(`${keyPrefix}.colBorders`)
      const panelBorder = localStorage.getItem(`${keyPrefix}.panelBorder`)
      const zebra = localStorage.getItem(`${keyPrefix}.zebra`)
      if (borders !== null) this.showColBorders = JSON.parse(borders)
      if (panelBorder !== null) this.showPanelBorder = JSON.parse(panelBorder)
      if (zebra !== null) this.showZebra = JSON.parse(zebra)
    } catch { /* 使用默认值 */ }
  }

  // ========== 列宽调节 ==========
  colIconWidth = 24
  colNameMinWidth = 60
  private resizing = false
  private resizeCol: string | null = null
  private resizePane: 'local' | 'remote' = 'local'
  private resizeStartX = 0
  private resizeStartWidth = 0
  /** 防止 resize 后立即触发 sort click */
  private _colJustResized = false

  // ========== 列排序拖拽 ==========
  private _colDragCol: string | null = null

  colHeaderLabel(col: string): string {
    const map: Record<string, string> = {
      name: 'file.name', size: 'file.size', date: 'file.modified', created: 'file.created',
      perms: 'file.permissions', mode: 'file.mode', access: 'file.accessed',
      owner: 'file.owner', group: 'file.group', path: 'file.path', ext: 'file.ext',
    }
    return this.i18n.t(map[col] || '')
  }

  /** 根据列和面板获取当前排序箭头 */
  sortArrow(col: string, pane: 'local' | 'remote'): string {
    const sortBy = pane === 'local' ? this.localSortBy : this.remoteSortBy
    const sortAsc = pane === 'local' ? this.localSortAsc : this.remoteSortAsc
    // date 列在内部用 modified 排序，映射匹配
    const mapped = col === 'date' ? 'modified' : col === 'created' ? 'birthtime' : col
    if (sortBy === mapped) return sortAsc ? '▲' : '▼'
    return ''
  }

  /** 列值渲染（同时适用于 LocalEntry 和 SFTPFile） */
  colValue(col: string, e: any): string {
    if (col === 'size') return e.isDirectory ? '' : this.formatSize(e.size)
    if (col === 'date' || col === 'modified') return e.modified ? this.formatDate(e.modified?.getTime?.()) : e.mtimeMs ? this.formatDate(e.mtimeMs) : ''
    if (col === 'created' || col === 'birthtime') return e.birthtimeMs ? this.formatDate(e.birthtimeMs) : ''
    if (col === 'perms') return e.mode != null ? this.formatMode(e.mode) : ''
    if (col === 'mode') return e.mode != null ? this.formatOctalMode(e.mode) : ''
    if (col === 'access' || col === 'accessed') return e.atimeMs ? this.formatDate(e.atimeMs) : ''
    if (col === 'owner') return e.owner != null ? String(e.owner) : ''
    if (col === 'group') return e.group != null ? String(e.group) : ''
    if (col === 'path') return e.fullPath || ''
    if (col === 'ext') return this.getExt(e.name)
    return ''
  }

  onColHeaderDragStart(event: DragEvent, col: string): void {
    if (col === 'name') return // 名称列不允许移动
    this._colDragCol = col
    event.dataTransfer?.setData('text/plain', col)
    event.dataTransfer!.effectAllowed = 'move'
  }

  onColHeaderDragOver(event: DragEvent): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
  }

  onColHeaderDrop(event: DragEvent, targetCol: string, pane: 'local' | 'remote'): void {
    event.preventDefault()
    const dragCol = this._colDragCol || event.dataTransfer?.getData('text/plain')
    if (!dragCol || dragCol === targetCol || dragCol === 'name' || targetCol === 'name') return
    const order = pane === 'local' ? this.localColOrder : this.remoteColOrder
    const fromIdx = order.indexOf(dragCol)
    const toIdx = order.indexOf(targetCol)
    if (fromIdx < 0 || toIdx < 0) return
    this.moveColumn(pane, fromIdx, toIdx)
    this._colDragCol = null
  }

  getLocalColWidths(): string {
    const parts: string[] = [`${this.colIconWidth}px`]
    parts.push(`${this.localColNameWidth}px`)
    const widthMap: Record<string, number> = {
      size: this.localColSizeWidth, date: this.localColDateWidth, created: this.localColCreatedWidth,
      perms: this.localColPermsWidth,
      mode: this.localColModeWidth, access: this.localColAccessWidth, owner: this.localColOwnerWidth,
      group: this.localColGroupWidth, path: this.localColPathWidth, ext: this.localColExtWidth,
    }
    for (const col of this.localVisibleCols) {
      parts.push(`${widthMap[col] || 80}px`)
    }
    return parts.join(' ')
  }

  getRemoteColWidths(): string {
    const parts: string[] = [`${this.colIconWidth}px`]
    parts.push(`${this.remoteColNameWidth}px`)
    const widthMap: Record<string, number> = {
      size: this.remoteColSizeWidth, date: this.remoteColDateWidth, created: this.remoteColCreatedWidth,
      perms: this.remoteColPermsWidth,
      mode: this.remoteColModeWidth, access: this.remoteColAccessWidth, owner: this.remoteColOwnerWidth,
      group: this.remoteColGroupWidth, path: this.remoteColPathWidth, ext: this.remoteColExtWidth,
    }
    for (const col of this.remoteVisibleCols) {
      parts.push(`${widthMap[col] || 80}px`)
    }
    return parts.join(' ')
  }

  private loadLocalColSettings(): void {
    try {
      const raw = this._paneGet(SftpFloatingPanel.LOCAL_COLS_KEY)
      if (raw) {
        const cols = JSON.parse(raw)
        this.localShowColSize = cols.size !== false
        this.localShowColDate = cols.date !== false
        this.localShowColPerms = cols.perms !== false
        if (cols.created !== undefined) this.localShowColCreated = cols.created
        if (cols.mode !== undefined) this.localShowColMode = cols.mode
        if (cols.access !== undefined) this.localShowColAccess = cols.access
        if (cols.owner !== undefined) this.localShowColOwner = cols.owner
        if (cols.group !== undefined) this.localShowColGroup = cols.group
        if (cols.path !== undefined) this.localShowColPath = cols.path
        if (cols.ext !== undefined) this.localShowColExt = cols.ext
      }
    } catch { /* 使用默认值 */ }
    try {
      const orderRaw = this._paneGet(SftpFloatingPanel.LOCAL_COL_ORDER_KEY)
      if (orderRaw) {
        const parsed = JSON.parse(orderRaw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.localColOrder = parsed.filter((c: string) => SftpFloatingPanel.ALL_COLS.includes(c as any))
        }
      }
    } catch { /* 使用默认顺序 */ }
    try {
      const s = JSON.parse(this._paneGet('sftp-plus-local-sort') || '{}')
      if (s.by) { this.localSortBy = s.by; this.localSortAsc = s.asc !== false }
    } catch {}
  }

  private loadRemoteColSettings(): void {
    try {
      const raw = this._paneGet(SftpFloatingPanel.REMOTE_COLS_KEY)
      if (raw) {
        const cols = JSON.parse(raw)
        this.remoteShowColSize = cols.size !== false
        this.remoteShowColDate = cols.date !== false
        this.remoteShowColPerms = cols.perms !== false
        if (cols.created !== undefined) this.remoteShowColCreated = cols.created
        if (cols.mode !== undefined) this.remoteShowColMode = cols.mode
        if (cols.access !== undefined) this.remoteShowColAccess = cols.access
        if (cols.owner !== undefined) this.remoteShowColOwner = cols.owner
        if (cols.group !== undefined) this.remoteShowColGroup = cols.group
        if (cols.path !== undefined) this.remoteShowColPath = cols.path
        if (cols.ext !== undefined) this.remoteShowColExt = cols.ext
      }
    } catch { /* 使用默认值 */ }
    try {
      const orderRaw = this._paneGet(SftpFloatingPanel.REMOTE_COL_ORDER_KEY)
      if (orderRaw) {
        const parsed = JSON.parse(orderRaw)
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.remoteColOrder = parsed.filter((c: string) => SftpFloatingPanel.ALL_COLS.includes(c as any))
        }
      }
    } catch { /* 使用默认顺序 */ }
    try {
      const s = JSON.parse(this._paneGet('sftp-plus-remote-sort') || '{}')
      if (s.by) { this.remoteSortBy = s.by; this.remoteSortAsc = s.asc !== false }
    } catch {}
  }

  private saveLocalColSettings(): void {
    try {
      this._paneSet(SftpFloatingPanel.LOCAL_COLS_KEY, JSON.stringify({
        size: this.localShowColSize,
        date: this.localShowColDate,
        created: this.localShowColCreated,
        perms: this.localShowColPerms,
        mode: this.localShowColMode,
        access: this.localShowColAccess,
        owner: this.localShowColOwner,
        group: this.localShowColGroup,
        path: this.localShowColPath,
        ext: this.localShowColExt,
      }))
      this._paneSet(SftpFloatingPanel.LOCAL_COL_ORDER_KEY, JSON.stringify(this.localColOrder))
    } catch {}
  }

  private saveRemoteColSettings(): void {
    try {
      this._paneSet(SftpFloatingPanel.REMOTE_COLS_KEY, JSON.stringify({
        size: this.remoteShowColSize,
        date: this.remoteShowColDate,
        created: this.remoteShowColCreated,
        perms: this.remoteShowColPerms,
        mode: this.remoteShowColMode,
        access: this.remoteShowColAccess,
        owner: this.remoteShowColOwner,
        group: this.remoteShowColGroup,
        path: this.remoteShowColPath,
        ext: this.remoteShowColExt,
      }))
      this._paneSet(SftpFloatingPanel.REMOTE_COL_ORDER_KEY, JSON.stringify(this.remoteColOrder))
    } catch {}
  }

  /** 移动列位置 */
  moveColumn(pane: 'local' | 'remote', fromIdx: number, toIdx: number): void {
    const order = pane === 'local' ? this.localColOrder : this.remoteColOrder
    if (fromIdx === toIdx) return
    if (fromIdx < 0 || fromIdx >= order.length) return
    if (toIdx < 0 || toIdx >= order.length) return
    const item = order.splice(fromIdx, 1)[0]
    order.splice(toIdx, 0, item)
    if (pane === 'local') this.saveLocalColSettings()
    else this.saveRemoteColSettings()
    // 通知设置页也同步
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch {}
  }

  toggleColumn(col: string, pane: 'local' | 'remote'): void {
    if (pane === 'local') {
      if (col === 'size') this.localShowColSize = !this.localShowColSize
      else if (col === 'date') this.localShowColDate = !this.localShowColDate
      else if (col === 'created') this.localShowColCreated = !this.localShowColCreated
      else if (col === 'perms') this.localShowColPerms = !this.localShowColPerms
      else if (col === 'mode') this.localShowColMode = !this.localShowColMode
      else if (col === 'access') this.localShowColAccess = !this.localShowColAccess
      else if (col === 'owner') this.localShowColOwner = !this.localShowColOwner
      else if (col === 'group') this.localShowColGroup = !this.localShowColGroup
      else if (col === 'path') this.localShowColPath = !this.localShowColPath
      else if (col === 'ext') this.localShowColExt = !this.localShowColExt
      this.saveLocalColSettings()
    } else {
      if (col === 'size') this.remoteShowColSize = !this.remoteShowColSize
      else if (col === 'date') this.remoteShowColDate = !this.remoteShowColDate
      else if (col === 'created') this.remoteShowColCreated = !this.remoteShowColCreated
      else if (col === 'perms') this.remoteShowColPerms = !this.remoteShowColPerms
      else if (col === 'mode') this.remoteShowColMode = !this.remoteShowColMode
      else if (col === 'access') this.remoteShowColAccess = !this.remoteShowColAccess
      else if (col === 'owner') this.remoteShowColOwner = !this.remoteShowColOwner
      else if (col === 'group') this.remoteShowColGroup = !this.remoteShowColGroup
      else if (col === 'path') this.remoteShowColPath = !this.remoteShowColPath
      else if (col === 'ext') this.remoteShowColExt = !this.remoteShowColExt
      this.saveRemoteColSettings()
    }
    this.headerMenuVisible = false
    this.headerMenuCol = null
  }

  /** 切换显示隐藏文件 */
  toggleShowHidden(pane: 'local' | 'remote'): void {
    if (pane === 'local') {
      this.showHiddenLocal = !this.showHiddenLocal
    } else {
      this.showHiddenRemote = !this.showHiddenRemote
    }
    this.headerMenuVisible = false
    this.headerMenuCol = null
  }

  togglePanelBorder(): void {
    this.showPanelBorder = !this.showPanelBorder
    try { localStorage.setItem(`${SftpFloatingPanel.TABLE_SETTINGS_KEY}.panelBorder`, JSON.stringify(this.showPanelBorder)) } catch {}
    this.headerMenuVisible = false
  }

  toggleColBorders(): void {
    this.showColBorders = !this.showColBorders
    try { localStorage.setItem(`${SftpFloatingPanel.TABLE_SETTINGS_KEY}.colBorders`, JSON.stringify(this.showColBorders)) } catch {}
    this.headerMenuVisible = false
  }

  toggleZebra(): void {
    this.showZebra = !this.showZebra
    try { localStorage.setItem(`${SftpFloatingPanel.TABLE_SETTINGS_KEY}.zebra`, JSON.stringify(this.showZebra)) } catch {}
    this.headerMenuVisible = false
  }

  /** 将当前右键的列调整为合适的大小 */
  adjustColumnWidth(): void {
    const col = this.headerMenuCol
    if (!col || col === 'icon') return
    const pane = this.contextMenuPane
    const isLocal = pane === 'local'
    const entryList = isLocal ? this.getFilteredLocalEntries() : this.getFilteredRemoteEntries()
    if (!entryList || entryList.length === 0) return

    // icon 列没有实质文本，调整为 name 列宽
    const targetCol = col === 'icon' ? 'name' : col
    let maxW = this._measureColWidth(targetCol, isLocal)
    maxW = Math.max(maxW, 30)
    this._setColWidth(targetCol, pane, maxW)
    this.headerMenuVisible = false
    this.headerMenuCol = null
    if (isLocal) this.saveLocalColWidths(); else this.saveRemoteColWidths()
    this.cdr.detectChanges()
  }

  /** 将所有列调整为合适的大小 */
  adjustAllColumnsWidth(): void {
    const pane = this.contextMenuPane
    const isLocal = pane === 'local'
    const entryList = isLocal ? this.getFilteredLocalEntries() : this.getFilteredRemoteEntries()
    if (!entryList || entryList.length === 0) return

    const cols = isLocal ? this.localVisibleCols : this.remoteVisibleCols
    for (const col of cols) {
      let maxW = this._measureColWidth(col, isLocal)
      maxW = Math.max(maxW, 30)
      this._setColWidth(col, pane, maxW)
    }
    this.headerMenuVisible = false
    this.headerMenuCol = null
    if (isLocal) this.saveLocalColWidths(); else this.saveRemoteColWidths()
    this.cdr.detectChanges()
  }

  /** 测量列内容的渲染宽度 */
  private _measureColWidth(col: string, isLocal: boolean): number {
    const root = this.elRef.nativeElement as HTMLElement
    const pane = isLocal ? root.querySelector('.local-pane') : root.querySelector('.remote-pane')
    if (!pane) return 80
    // 找 header 中该列的 span 作为字体度量基准
    const headerSpan = pane.querySelector(`.entry.header span.${col}`) as HTMLElement | null
    if (!headerSpan) return 80
    const style = getComputedStyle(headerSpan)
    const font = `${style.fontSize} ${style.fontFamily}`

    // 临时 canvas 测量文本宽度
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 80
    ctx.font = font

    let maxW = 0
    // 测量 header 文本
    const headerText = headerSpan.textContent || ''
    const headerW = ctx.measureText(headerText).width + 16 // padding
    maxW = Math.max(maxW, headerW)

    // 测量所有条目的文本
    const items = pane.querySelectorAll(`.entry:not(.header):not(.up-entry) span.${col}`)
    items.forEach(el => {
      const text = el.textContent || ''
      const w = ctx.measureText(text).width + 8
      if (w > maxW) maxW = w
    })

    return Math.ceil(maxW)
  }

  /** 设置指定列的宽度 */
  private _setColWidth(col: string, pane: 'local' | 'remote', w: number): void {
    const isLocal = pane === 'local'
    switch (col) {
      case 'name': if (isLocal) this.localColNameWidth = w; else this.remoteColNameWidth = w; break
      case 'size': if (isLocal) this.localColSizeWidth = w; else this.remoteColSizeWidth = w; break
      case 'date': if (isLocal) this.localColDateWidth = w; else this.remoteColDateWidth = w; break
      case 'perms': if (isLocal) this.localColPermsWidth = w; else this.remoteColPermsWidth = w; break
      case 'mode': if (isLocal) this.localColModeWidth = w; else this.remoteColModeWidth = w; break
      case 'access': if (isLocal) this.localColAccessWidth = w; else this.remoteColAccessWidth = w; break
      case 'owner': if (isLocal) this.localColOwnerWidth = w; else this.remoteColOwnerWidth = w; break
      case 'group': if (isLocal) this.localColGroupWidth = w; else this.remoteColGroupWidth = w; break
      case 'path': if (isLocal) this.localColPathWidth = w; else this.remoteColPathWidth = w; break
      case 'ext': if (isLocal) this.localColExtWidth = w; else this.remoteColExtWidth = w; break
    }
  }

  onHeaderContextMenu(ev: MouseEvent): void {
    ev.preventDefault()
    ev.stopPropagation()
    const target = ev.target as HTMLElement
    // 确定面板
    this.contextMenuPane = target.closest('.local-pane') ? 'local' : 'remote'
    // 确定右键的是哪一列
    const span = target.closest('span')
    if (span) {
      const cls = span.className
      // 从 class 中提取列名（排除 'sortable'、'sort-arrow' 等辅助类）
      const colClasses = ['icon', 'name', 'size', 'date', 'perms', 'mode', 'access', 'owner', 'group', 'path', 'ext']
      this.headerMenuCol = colClasses.find(c => cls.includes(c)) || null
    } else {
      this.headerMenuCol = null
    }
    // 关闭面板级右键菜单，只保留表头右键菜单
    this.contextMenuVisible = false
    this.contextMenuEntry = null
    this.headerMenuX = ev.clientX
    this.headerMenuY = ev.clientY
    this.headerMenuVisible = true
    this.cdr.detectChanges()
    // 渲染后测量并修正
    setTimeout(() => {
      const menuEl = this.elRef.nativeElement.querySelector('.context-menu') as HTMLElement | null
      if (!menuEl || !this.headerMenuVisible) return
      const rect = menuEl.getBoundingClientRect()
      const margin = 8
      let x = ev.clientX
      let y = ev.clientY
      if (x + rect.width > window.innerWidth - margin) x = Math.max(margin, window.innerWidth - rect.width - margin)
      if (y + rect.height > window.innerHeight - margin) y = Math.max(margin, window.innerHeight - rect.height - margin)
      if (x < margin) x = margin
      if (y < margin) y = margin
      if (x !== this.headerMenuX || y !== this.headerMenuY) {
        this.headerMenuX = x
        this.headerMenuY = y
        this.cdr.detectChanges()
      }
    }, 0)
  }

  /** 面板空白区域右键：显示面板级上下文菜单 */
  onPaneContextMenu(ev: MouseEvent): void {
    ev.preventDefault()
    ev.stopPropagation()
    // 关闭表头右键菜单，只保留最新右键的菜单
    this.headerMenuVisible = false
    this.headerMenuCol = null
    if (this.rubberBand.active) return
    if (this._rbJustFinishedRightClick) return

    // 空白区域右键：清除该面板选中，显示面板级上下文菜单
    const target = ev.target as HTMLElement
    const paneList = target.closest('.pane-list') as HTMLElement | null
    if (!target.closest('.entry:not(.header)') && paneList) {
      // 清除该面板选中
      if (paneList.classList.contains('local-pane')) {
        this.selectedLocal = []
        this.localLastSelectedIndex = null
      } else if (paneList.classList.contains('remote-pane')) {
        this.selectedRemote = []
        this.remoteLastSelectedIndex = null
      }
      try { this.cdr.detectChanges() } catch {}

      // 显示面板级上下文菜单（新建、刷新等）
      const pane = paneList.classList.contains('local-pane') ? 'local' : 'remote'
      this.contextMenuEntry = null
      this.contextMenuPane = pane
      this.zone.run(() => {
        this.closeBookmarks()
        this.headerMenuVisible = false
        this.contextMenuX = ev.clientX
        this.contextMenuY = ev.clientY
        this.contextMenuVisible = true
        this.cdr.detectChanges()
        this.fixContextMenuPosition(ev.clientX, ev.clientY)
      })
      return
    }
  }

  onColResizeStart(col: string, event: MouseEvent, pane: 'local' | 'remote'): void {
    event.preventDefault()
    event.stopPropagation()
    this.resizing = true
    this.resizeCol = col
    this.resizePane = pane
    this.resizeStartX = event.clientX

    // handle 在目标列 span 内部，直接从父元素读取实际渲染宽度
    const handleEl = event.target as HTMLElement
    const colEl = handleEl.parentElement
    if (colEl) {
      this.resizeStartWidth = colEl.getBoundingClientRect().width
    } else {
      this.resizeStartWidth = this._getColDefaultWidth(col)
    }
    if (!this.resizeStartWidth || this.resizeStartWidth <= 0) {
      this.resizeStartWidth = this._getColDefaultWidth(col)
    }

    const MIN_WIDTHS: Record<string, number> = {
      name: this.colNameMinWidth,
      size: 40, date: 80, created: 80, perms: 40, mode: 40,
      access: 80, owner: 40, group: 40, path: 60, ext: 30,
    }
    const minW = MIN_WIDTHS[col] || 40

    const onMouseMove = (e: MouseEvent) => {
      if (!this.resizing || !this.resizeCol) return
      const delta = e.clientX - this.resizeStartX
      const newWidth = Math.max(minW, this.resizeStartWidth + delta)
      this.zone.run(() => {
        // 直接修改对应面板的属性（_localWidths() 返回的是临时对象，不能用 w.xxx =）
        const p = this.resizePane === 'local'
        switch (this.resizeCol) {
          case 'name': if (p) this.localColNameWidth = newWidth; else this.remoteColNameWidth = newWidth; break
          case 'size': if (p) this.localColSizeWidth = newWidth; else this.remoteColSizeWidth = newWidth; break
          case 'date': if (p) this.localColDateWidth = newWidth; else this.remoteColDateWidth = newWidth; break
          case 'created': if (p) this.localColCreatedWidth = newWidth; else this.remoteColCreatedWidth = newWidth; break
          case 'perms': if (p) this.localColPermsWidth = newWidth; else this.remoteColPermsWidth = newWidth; break
          case 'mode': if (p) this.localColModeWidth = newWidth; else this.remoteColModeWidth = newWidth; break
          case 'access': if (p) this.localColAccessWidth = newWidth; else this.remoteColAccessWidth = newWidth; break
          case 'owner': if (p) this.localColOwnerWidth = newWidth; else this.remoteColOwnerWidth = newWidth; break
          case 'group': if (p) this.localColGroupWidth = newWidth; else this.remoteColGroupWidth = newWidth; break
          case 'path': if (p) this.localColPathWidth = newWidth; else this.remoteColPathWidth = newWidth; break
          case 'ext': if (p) this.localColExtWidth = newWidth; else this.remoteColExtWidth = newWidth; break
        }
      })
    }

    const onMouseUp = () => {
      this.resizing = false
      this.resizeCol = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      this._colJustResized = true
      setTimeout(() => { this._colJustResized = false }, 200)
      if (this.resizePane === 'local') this.saveLocalColWidths()
      else this.saveRemoteColWidths()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  private _getColDefaultWidth(col: string): number {
    const w = this.resizePane === 'local' ? this._localWidths() : this._remoteWidths()
    return w[col] || 80
  }

  static readonly LOCAL_COL_WIDTHS_KEY = 'sftp-plus-local-col-widths'
  static readonly REMOTE_COL_WIDTHS_KEY = 'sftp-plus-remote-col-widths'

  /** 获取本地面板列宽引用对象（用于 resize 修改） */
  private _localWidths(): Record<string, number> {
    return {
      name: this.localColNameWidth, size: this.localColSizeWidth, date: this.localColDateWidth,
      created: this.localColCreatedWidth,
      perms: this.localColPermsWidth, mode: this.localColModeWidth, access: this.localColAccessWidth,
      owner: this.localColOwnerWidth, group: this.localColGroupWidth, path: this.localColPathWidth,
      ext: this.localColExtWidth,
    }
  }

  /** 获取远程面板列宽引用对象（用于 resize 修改） */
  private _remoteWidths(): Record<string, number> {
    return {
      name: this.remoteColNameWidth, size: this.remoteColSizeWidth, date: this.remoteColDateWidth,
      created: this.remoteColCreatedWidth,
      perms: this.remoteColPermsWidth, mode: this.remoteColModeWidth, access: this.remoteColAccessWidth,
      owner: this.remoteColOwnerWidth, group: this.remoteColGroupWidth, path: this.remoteColPathWidth,
      ext: this.remoteColExtWidth,
    }
  }

  private saveLocalColWidths(): void {
    const w = this._localWidths()
    try {
      this._paneSet(SftpFloatingPanel.LOCAL_COL_WIDTHS_KEY, JSON.stringify({
        name: w.name, size: w.size, date: w.date, created: w.created, perms: w.perms, mode: w.mode,
        access: w.access, owner: w.owner, group: w.group, path: w.path, ext: w.ext,
      }))
    } catch {}
  }

  private saveRemoteColWidths(): void {
    const w = this._remoteWidths()
    try {
      this._paneSet(SftpFloatingPanel.REMOTE_COL_WIDTHS_KEY, JSON.stringify({
        name: w.name, size: w.size, date: w.date, created: w.created, perms: w.perms, mode: w.mode,
        access: w.access, owner: w.owner, group: w.group, path: w.path, ext: w.ext,
      }))
    } catch {}
  }

  private loadLocalColWidths(): void {
    try {
      const w = JSON.parse(this._paneGet(SftpFloatingPanel.LOCAL_COL_WIDTHS_KEY) || '{}')
      if (typeof w.name === 'number' && w.name >= this.colNameMinWidth) this.localColNameWidth = w.name
      if (typeof w.size === 'number' && w.size >= 40) this.localColSizeWidth = w.size
      if (typeof w.date === 'number' && w.date >= 80) this.localColDateWidth = w.date
      if (typeof w.created === 'number' && w.created >= 80) this.localColCreatedWidth = w.created
      if (typeof w.perms === 'number' && w.perms >= 40) this.localColPermsWidth = w.perms
      if (typeof w.mode === 'number' && w.mode >= 40) this.localColModeWidth = w.mode
      if (typeof w.access === 'number' && w.access >= 80) this.localColAccessWidth = w.access
      if (typeof w.owner === 'number' && w.owner >= 40) this.localColOwnerWidth = w.owner
      if (typeof w.group === 'number' && w.group >= 40) this.localColGroupWidth = w.group
      if (typeof w.path === 'number' && w.path >= 60) this.localColPathWidth = w.path
      if (typeof w.ext === 'number' && w.ext >= 30) this.localColExtWidth = w.ext
    } catch {}
  }

  private loadRemoteColWidths(): void {
    try {
      const w = JSON.parse(this._paneGet(SftpFloatingPanel.REMOTE_COL_WIDTHS_KEY) || '{}')
      if (typeof w.name === 'number' && w.name >= this.colNameMinWidth) this.remoteColNameWidth = w.name
      if (typeof w.size === 'number' && w.size >= 40) this.remoteColSizeWidth = w.size
      if (typeof w.date === 'number' && w.date >= 80) this.remoteColDateWidth = w.date
      if (typeof w.created === 'number' && w.created >= 80) this.remoteColCreatedWidth = w.created
      if (typeof w.perms === 'number' && w.perms >= 40) this.remoteColPermsWidth = w.perms
      if (typeof w.mode === 'number' && w.mode >= 40) this.remoteColModeWidth = w.mode
      if (typeof w.access === 'number' && w.access >= 80) this.remoteColAccessWidth = w.access
      if (typeof w.owner === 'number' && w.owner >= 40) this.remoteColOwnerWidth = w.owner
      if (typeof w.group === 'number' && w.group >= 40) this.remoteColGroupWidth = w.group
      if (typeof w.path === 'number' && w.path >= 60) this.remoteColPathWidth = w.path
      if (typeof w.ext === 'number' && w.ext >= 30) this.remoteColExtWidth = w.ext
    } catch {}
  }

  // ========== 路径记忆 ==========
  /** 路径记忆开关 */
  rememberPath = false
  private static REMEMBER_PATH_KEY = 'sftp-plus-path-mem'
  private static SAVED_LOCAL_PATH_KEY = 'sftp-plus-saved-local-path'
  private static SAVED_REMOTE_PATH_KEY = 'sftp-plus-saved-remote-path'

  /** 获取当前配置的唯一标识，用于 per-profile 独立路径记忆 */
  private get _hostKey(): string {
    const h = this.profile?.options?.host || ''
    const u = this.profile?.options?.username || this.profile?.options?.user || ''
    return (u ? `${u}@` : '') + h || '__default'
  }

  private _profileKey(base: string): string {
    return `${base}.${this._hostKey}`
  }

  private loadRememberPath(): void {
    try {
      const raw = this._paneGet(this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY))
      if (raw !== null) this.rememberPath = raw === 'true'
    } catch { /* 使用默认值 */ }
  }

  private saveRememberPath(): void {
    try {
      this._paneSet(this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY), this.rememberPath ? 'true' : 'false')
    } catch { /* ignore */ }
  }

  /** 保存当前路径到 localStorage */
  private saveCurrentPath(): void {
    if (!this.rememberPath) return
    try {
      this._paneSet(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY), this.localPath)
      this._paneSet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY), this.remotePath)
    } catch { /* ignore */ }
  }

  /** 切换路径记忆开关 */
  toggleRememberPath(): void {
    this.rememberPath = !this.rememberPath
    this.saveRememberPath()
    if (this.rememberPath) {
      this.saveCurrentPath()
    } else {
      try {
        delete this._paneStore[this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY)]
        delete this._paneStore[this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY)]
        try { localStorage.removeItem(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY)) } catch {}
        try { localStorage.removeItem(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY)) } catch {}
        this._paneFlushToConfig()
      } catch { /* ignore */ }
    }
  }

  /** 循环切换布局模式：auto → horizontal → vertical → auto */
  cycleLayoutMode(): void {
    const order: Array<'auto' | 'horizontal' | 'vertical'> = ['auto', 'horizontal', 'vertical']
    const idx = order.indexOf(this._layoutMode)
    this._layoutMode = order[(idx + 1) % order.length]
    try {
      this._paneSet('sftp-plus-layout-mode', this._layoutMode)
      this._paneSet('sftp-plus-settings.layoutMode', JSON.stringify(this._layoutMode))
    } catch {}
    if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
    else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
    else this._updateAutoLayout()
    setTimeout(() => this._applyPaneSplit(), 50)
    // 通知设置页等外部监听者
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch {}
  }

  /** 根据容器宽度更新自动布局状态 */
  private _updateAutoLayout(): void {
    if (this._layoutMode !== 'auto') return
    try {
      const w = this.elRef?.nativeElement?.clientWidth || 960
      this._isNarrowLayout = w <= 960
    } catch {
      this._isNarrowLayout = false
    }
  }

  /** 布局模式按钮悬浮提示 */
  layoutModeTitle(): string {
    const zh = { auto: '自适应布局', horizontal: '左右布局', vertical: '上下布局' }
    const en = { auto: 'Auto Layout', horizontal: 'Horizontal Layout', vertical: 'Vertical Layout' }
    const map = this.effectiveLang === 'zh-CN' ? zh : en
    return (map as any)[this._layoutMode] || 'Auto Layout'
  }

  /** 从 localStorage 恢复路径 */
  private _loadSavedPaths(): void {
    this.loadRememberPath()
    if (!this.rememberPath) return
    try {
      const savedLocal = this._paneGet(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY))
      if (savedLocal) {
        this.localPath = savedLocal
        this.localPathInput = savedLocal
      }
      const savedRemote = this._paneGet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
      if (savedRemote) {
        this.remotePath = savedRemote
        this.remotePathInput = savedRemote
      }
    } catch { /* 忽略 */ }
  }

  /** connect() 后恢复远程路径（防止 getDefaultRemotePath 覆盖） */
  private _restoreSavedRemotePath(): void {
    try {
      const savedRemote = this._paneGet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
      if (savedRemote) {
        this.remotePath = savedRemote
        this.remotePathInput = savedRemote
      }
    } catch { /* 忽略 */ }
  }

  // ========== 传输日志 ==========
  showTransferLog = false
  transfersMinimized = false  // 传输面板是否最小化（显示小指示器）
  transfersHidden = false     // 传输面板是否完全隐藏（不影响传输继续）
  logFilterOp: '' | 'upload' | 'download' = ''
  logFilterSuccess = false

  // ========== 文件冲突对话框 ==========
  showConflictDialog = false
  conflictData: ConflictFileInfo | null = null
  /** 当前冲突在处理队列中的索引（从 1 开始），-1 表示未知 */
  conflictCurrIdx = 1
  /** 总冲突数 */
  conflictTotalIdx = 1
  /** 原始冲突总数（第一次入队时记录，后续不随队列缩短而变化） */
  conflictOriginalTotal = 1
  /** 待处理的冲突队列 */
  private _conflictQueue: Array<{
    localPath: string; remoteDir: string; fileName: string;
    remotePath: string; localStat: fsSync.Stats;
    /** 冲突方向：上传（本地→远程）或下载（远程→本地） */
    direction: 'upload' | 'download';
    /** 下载冲突时远程文件的原始大小 */
    remoteFileSize?: number;
    /** 下载冲突时远程文件的原始 mtimeMs */
    remoteFileMtime?: number;
    /** 是否为同面板粘贴操作导致的冲突 */
    isSamePane?: boolean;
    /** 同面板时的源面板 */
    samePaneSource?: 'local' | 'remote';
    /** 是否为目录冲突 */
    isDirectory?: boolean;
  }> = []
  /** "全部"操作的记忆模式: 'ask' | 'overwrite' | 'skip' | 'rename' */
  private _conflictAllMode: string = 'ask'

  // ========== 面板分割线（上下/左右布局共用） ==========
  _isNarrowLayout = false
  /** 布局模式: 'auto' | 'horizontal' | 'vertical' */
  _layoutMode: 'auto' | 'horizontal' | 'vertical' = 'auto'
  _verticalSplitRatio = 0.5   // 上下布局比例（本地面板占比，默认50%）
  _horizontalSplitRatio = 0.5 // 左右布局比例
  private _splitDragStartX = 0
  private _splitDragStartY = 0
  private _splitDragStartRatio = 0.5
  private _splitMoveHandler: ((e: MouseEvent) => void) | null = null
  private _splitUpHandler: ((e: MouseEvent) => void) | null = null

  constructor(
    private cdr: ChangeDetectorRef,
    private elRef: ElementRef,
    private zone: NgZone,
    private themesService: ThemesService,
    private injector: Injector,
  ) {
    // 通过 Injector 安全获取 ConfigService（避免 NG0202 DI 错误）
    try {
      this.configService = injector.get(ConfigService, null as any)
    } catch {
      // ConfigService 在插件环境中不可用，忽略
      this.configService = undefined
    }
    // 安全获取 NotificationsService（用于重连失败提示）
    try {
      this.notifications = injector.get(NotificationsService, null as any)
    } catch {
      this.notifications = null
    }
    // 将 ConfigService 传给 i18n service，让 Auto 模式能读取 Tabby 系统语言
    this.i18n = new SftpI18nService(this.configService)
    // 将 ConfigService 传给 bookmarks / transferLog service，确保数据写入 Tabby 配置
    this.bookmarks = new SftpBookmarksService(this.configService)
    this.transferLog = new SftpTransferLogService(this.configService)
    // 从 Tabby 配置加载面板 UI 状态缓存
    this._initPaneStore()
    this.loadLocalColSettings()
    this.loadRemoteColSettings()
    this.loadTableSettings()
    this.loadLocalColWidths()
    this.loadRemoteColWidths()
    // refreshLocal 移至 ngOnInit 中 _loadSavedPaths 后执行，避免构造函数中的异步
    // 读取覆盖了路径记忆恢复的正确路径
  }

  /** 面板 UI 状态缓存（替代 localStorage） */
  private _paneStore: Record<string, any> = {}

  /** 从 Tabby 配置加载面板状态 */
  private _initPaneStore(): void {
    try {
      if (this.configService?.store) {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg?.paneState) {
          this._paneStore = { ...cfg.paneState }
          return
        }
      }
    } catch { /* ignore */ }
  }

  /** 读取面板状态（优先缓存，回退 localStorage） */
  private _paneGet(key: string, def?: any): any {
    if (key in this._paneStore) return this._paneStore[key]
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return raw
    } catch {}
    return def
  }

  /** 写入面板状态：仅更新内存 + localStorage（高频操作，不入磁盘） */
  private _paneSet(key: string, val: any): void {
    this._paneStore[key] = val
    try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)) } catch {}
  }

  /** 将面板状态持久化到 Tabby 配置（低频操作，调用 configService.save 落盘） */
  private _paneFlushToConfig(): void {
    if (this.configService?.store) {
      try {
        // 清理表格样式键（它们由 localStorage 独立管理，不应混入 paneState）
        const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
        for (const k of Object.keys(this._paneStore)) {
          if (k.startsWith(keyPrefix)) delete this._paneStore[k]
        }
        const target = this.configService.store['tabby-sftp-plus']
        target.paneState = { ...this._paneStore }
        this.configService.save()
      } catch {}
    }
  }

  /** 使用界面语言（代理到 i18n service） */
  get effectiveLang(): 'zh-CN' | 'en-US' {
    return this.i18n.getLocale()
  }

  ngOnInit(): void {
    // profile 已就绪，此时加载路径记忆才能正确匹配 per-profile 的 key
    this._loadSavedPaths()
    // 本地导航历史：记录初始路径
    this._pushLocalNav(this.localPath)
    // 路径记忆可能更新了 localPath，刷新本地列表显示正确的目录内容
    void this.refreshLocal()

    // 确定 host info
    if (this.profile?.options?.host) {
      const user = this.profile.options.username || this.profile.options.user || ''
      this.hostInfo = user ? `${user}@${this.profile.options.host}` : this.profile.options.host
    }
    if (this.sshSession) {
      void this.connect()
    }

    // 窄屏布局检测（ResizeObserver 监听容器宽度变化）
    try {
      // 加载保存的分割比例与布局模式
      const vsaved = this._paneGet('sftp-plus-vertical-split-ratio')
      if (vsaved) this._verticalSplitRatio = Math.max(0.15, Math.min(0.85, parseFloat(vsaved) || 0.5))
      const hsaved = this._paneGet('sftp-plus-horizontal-split-ratio')
      if (hsaved) this._horizontalSplitRatio = Math.max(0.15, Math.min(0.85, parseFloat(hsaved) || 0.5))
      const lmode = this._paneGet('sftp-plus-layout-mode')
      if (lmode === 'horizontal' || lmode === 'vertical') this._layoutMode = lmode

      const ro = new ResizeObserver(() => {
        if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
        else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
        else this._updateAutoLayout()
        this._applyPaneSplit()
        this.cdr.detectChanges()
      })
      ro.observe(this.elRef.nativeElement)
      this._ro = ro
    } catch { /* ResizeObserver 不可用时忽略 */ }

    // Auto 模式：跟随 Tabby 当前主题配色
    this._applyAutoTheme()

    // 监听 Tabby 主题切换 → 面板实时跟随
    this._themeSub = this.themesService.themeChanged$.subscribe(() => {
      this._applyAutoTheme()
    })

    // 监听设置页变更 → 同步刷新面板显示
    this._settingsChangedHandler = () => {
      this.loadLocalColSettings()
    this.loadRemoteColSettings()
      this.loadTableSettings()
      this.loadLocalColWidths()
    this.loadRemoteColWidths()
      // 重建 i18n service 以应用语言设置变更
      this.i18n = new SftpI18nService(this.configService)
      // 重新读取布局模式并立即应用（同步窄屏判断 + 面板分割）
      const lmode = this._paneGet('sftp-plus-layout-mode')
      if (lmode === 'horizontal' || lmode === 'vertical') this._layoutMode = lmode
      else this._layoutMode = 'auto'
      if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
      else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
      else {
        const h = this.elRef?.nativeElement as HTMLElement | undefined
        if (h) this._isNarrowLayout = h.clientWidth <= 960
      }
      this._applyPaneSplit()
      this._applyAutoTheme()
      this.cdr.detectChanges()
    }
    window.addEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)

    // 捕获阶段 document click：关闭书签悬浮面板 & 右键菜单 & 表头菜单
    // overlay 的 stopPropagation 阻止了冒泡阶段到达 document，但捕获阶段不受影响
    this._docClickCapture = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (this.showBookmarks) {
        if (!target?.closest('.bookmark-popup') && !target?.closest('.bm-btn')) {
          this.zone.run(() => this.closeBookmarks())
        }
      }
      if (this.contextMenuVisible) {
        if (!target?.closest('.context-menu')) {
          this.zone.run(() => { this.contextMenuVisible = false; this.cdr.detectChanges() })
        }
      }
      if (this.headerMenuVisible) {
        if (!target?.closest('.context-menu')) {
          this.zone.run(() => { this.headerMenuVisible = false; this.cdr.detectChanges() })
        }
      }
    }
    document.addEventListener('click', this._docClickCapture, true)

    // 滚轮事件关闭所有悬浮面板/菜单（捕获阶段）
    // 注意：必须在捕获阶段判断目标归属，因为模板绑定的 (wheel) 冒泡阶段 stopPropagation()
    // 无法阻止捕获阶段已触发的监听器。仿照 _docClickCapture 做目标排除。
    this._docWheelCapture = (ev: WheelEvent) => {
      if (!this.showBookmarks && !this.contextMenuVisible && !this.headerMenuVisible) return
      const target = ev.target as HTMLElement | null
      if (this.showBookmarks) {
        if (target?.closest('.bookmark-popup')) return
      }
      if (this.contextMenuVisible) {
        if (target?.closest('.context-menu')) return
      }
      if (this.headerMenuVisible) {
        if (target?.closest('.header-menu')) return
      }
      // 轮到了真正需要关闭的情况
      this.zone.run(() => {
        if (this.showBookmarks) this.closeBookmarks()
        if (this.contextMenuVisible) this.contextMenuVisible = false
        if (this.headerMenuVisible) this.headerMenuVisible = false
        this.cdr.detectChanges()
      })
    }
    document.addEventListener('wheel', this._docWheelCapture, true)
  }

  ngAfterViewInit(): void {
    // 兜底：在视图完全初始化后再次应用主题，确保 inline 样式不丢失
    // 某些场景下 ngOnInit 时 themesService 可能尚未完全就绪
    this._applyAutoTheme()
    // 初始化自动布局检测（视图已渲染，clientWidth 可用）
    this._updateAutoLayout()
    this._applyPaneSplit()
  }

  ngOnDestroy(): void {
    this.saveCurrentPath()
    this._paneFlushToConfig()  // 面板销毁前持久化所有 UI 状态到 config
    this._stopHeartbeat()
    if (this._docClickCapture) {
      document.removeEventListener('click', this._docClickCapture, true)
      this._docClickCapture = null
    }
    if (this._docWheelCapture) {
      document.removeEventListener('wheel', this._docWheelCapture, true)
      this._docWheelCapture = null
    }
    if (this._themeSub) { this._themeSub.unsubscribe(); this._themeSub = null }
    if (this._settingsChangedHandler) {
      window.removeEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)
    }
    if (this.localClickTimer) clearTimeout(this.localClickTimer)
    if (this.remoteClickTimer) clearTimeout(this.remoteClickTimer)
    // 清理所有进行中的传输定时器
    for (const t of this.transfers) {
      if (t.transfer) {
        try {
          if (typeof t.transfer.cancel === 'function') t.transfer.cancel()
        } catch {}
      }
    }
    this.transfers = []
    // 断开 ResizeObserver
    if (this._ro) {
      try { this._ro.disconnect() } catch {}
      this._ro = null
    }
  }

  private _settingsChangedHandler: (() => void) | null = null
  private _themeSub: any = null
  private _docClickCapture: ((ev: MouseEvent) => void) | null = null
  private _docWheelCapture: ((ev: WheelEvent) => void) | null = null
  private _ro: ResizeObserver | null = null

  /** 当前 Auto 模式检测到的主题名称（供设置面板显示） */
  autoDetectedThemeName = ''

  /**
   * 在 Auto 模式下根据 Tabby UI 主题设置推导面板配色
   * 功能描述：通过读取 document.documentElement 的 --body-bg CSS 变量来判断
   *            Tabby 当前的 UI 暗/亮模式（而非配色方案的终端背景色）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-23
   */
  private _applyAutoTheme(): void {
    const el = this.elRef.nativeElement as HTMLElement

    // 读取主题设置（优先从 Tabby 配置，回退 localStorage）
    let themeValue = ''
    let themePrimary = ''
    let themeBg = ''
    let themeText = ''
    let themeBorder = ''
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (cfg?.theme) {
        themeValue = cfg.theme
        themePrimary = cfg.colorPrimary || ''
        themeBg = cfg.colorBg || ''
        themeText = cfg.colorText || ''
        themeBorder = cfg.colorBorder || ''
      } else {
        const raw = this._paneGet('sftp-plus-settings.theme')
        themeValue = raw ? JSON.parse(raw) : ''
        if (themeValue) {
          themePrimary = this._paneGet('sftp-plus-settings.primaryColor')
          themeBg = this._paneGet('sftp-plus-settings.bgColor')
          themeText = this._paneGet('sftp-plus-settings.textColor')
          themeBorder = this._paneGet('sftp-plus-settings.borderColor')
          try {
            if (themePrimary) themePrimary = JSON.parse(themePrimary)
            if (themeBg) themeBg = JSON.parse(themeBg)
            if (themeText) themeText = JSON.parse(themeText)
            if (themeBorder) themeBorder = JSON.parse(themeBorder)
          } catch {}
        }
      }
    } catch { /* use empty */ }

    const vars = ['--_bg','--_text','--_primary','--_border','--_content','--_surface','--_hover','--_active','--_input-bg','--_scroll-track','--_scroll-thumb','--_scroll-thumb-hover']
    const hasPreset = !!themeValue

    if (hasPreset && themePrimary && themeBg && themeText) {
      // 预设/自定义主题：用保存的颜色值设置内联样式，面板独立启动不依赖设置页
      el.style.setProperty('--_bg', themeBg, 'important')
      el.style.setProperty('--_text', themeText, 'important')
      el.style.setProperty('--_primary', themePrimary, 'important')
      el.style.setProperty('--_border', themeBorder || 'rgba(128,128,128,0.2)', 'important')
      el.style.setProperty('--_content', themeBg, 'important')
      // 表面色和 hover 色基于背景色自动计算
      const isDark = this._isColorDark(themeBg)
      if (isDark) {
        el.style.setProperty('--_surface', 'rgba(255,255,255,0.06)', 'important')
        el.style.setProperty('--_hover', 'rgba(255,255,255,0.12)', 'important')
        el.style.setProperty('--_active', 'rgba(255,255,255,0.18)', 'important')
        el.style.setProperty('--_input-bg', 'rgba(255,255,255,0.06)', 'important')
        el.style.setProperty('--_scroll-track', 'rgba(255,255,255,0.05)', 'important')
        el.style.setProperty('--_scroll-thumb', 'rgba(255,255,255,0.2)', 'important')
        el.style.setProperty('--_scroll-thumb-hover', 'rgba(255,255,255,0.35)', 'important')
      } else {
        el.style.setProperty('--_surface', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_hover', 'rgba(0,0,0,0.08)', 'important')
        el.style.setProperty('--_active', 'rgba(0,0,0,0.12)', 'important')
        el.style.setProperty('--_input-bg', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_scroll-track', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_scroll-thumb', 'rgba(0,0,0,0.18)', 'important')
        el.style.setProperty('--_scroll-thumb-hover', 'rgba(0,0,0,0.3)', 'important')
      }
      this.autoDetectedThemeName = ''
      return
    }

    if (hasPreset) {
      // 预设主题但颜色值不全，清除内联样式回退 CSS 变量链
      vars.forEach(v => el.style.removeProperty(v))
      this.autoDetectedThemeName = ''
      return
    }

    // Auto 模式：通过 Tabby 的 --body-bg CSS 变量判断 UI 暗/亮模式
    // --body-bg 由 Tabby 根据"始终使用暗色/亮色/跟随系统"设置自动更新
    let bodyBg = '#1e1e2e' // 默认暗色
    try {
      const computedStyle = getComputedStyle(document.documentElement)
      const cssBg = computedStyle.getPropertyValue('--body-bg').trim()
      if (cssBg && cssBg !== '') {
        bodyBg = cssBg
      } else {
        // --body-bg 不可用时，回退到系统颜色方案偏好
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
      }
    } catch {
      // 兜底：使用系统偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
    }

    // 解析 hex → RGB，计算亮度判定暗/亮（支持 rgb()/rgba() 格式）
    let r = 30, g = 30, b = 46
    if (bodyBg.startsWith('rgb')) {
      const match = bodyBg.match(/\d+/g)
      if (match && match.length >= 3) { r = +match[0]; g = +match[1]; b = +match[2] }
    } else {
      const hex = bodyBg.replace('#', '')
      r = parseInt(hex.substring(0, 2), 16) || 30
      g = parseInt(hex.substring(2, 4), 16) || 30
      b = parseInt(hex.substring(4, 6), 16) || 46
    }

    // 感知亮度公式（ITU-R BT.601）
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const isDark = lum < 128

    // 更新公开属性，供设置面板显示当前映射的主题名
    this.autoDetectedThemeName = isDark ? 'dark' : 'light'

    // 使用 setProperty 第三参数 'important' 确保 inline 样式不被 :host CSS 覆盖
    // Auto 模式颜色与设置页 dark/light 预设主题保持一致
    if (isDark) {
      const bg = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
      el.style.setProperty('--_bg', bg, 'important')
      el.style.setProperty('--_text', '#e8edf5', 'important')
      el.style.setProperty('--_primary', '#b6b6c3', 'important')
      el.style.setProperty('--_border', '#2d3242', 'important')
      el.style.setProperty('--_content', bg, 'important')
      el.style.setProperty('--_surface', 'rgba(255,255,255,0.06)', 'important')
      el.style.setProperty('--_hover', 'rgba(255,255,255,0.12)', 'important')
      el.style.setProperty('--_active', 'rgba(255,255,255,0.18)', 'important')
      el.style.setProperty('--_input-bg', 'rgba(255,255,255,0.06)', 'important')
      el.style.setProperty('--_scroll-track', 'rgba(255,255,255,0.05)', 'important')
      el.style.setProperty('--_scroll-thumb', 'rgba(255,255,255,0.2)', 'important')
      el.style.setProperty('--_scroll-thumb-hover', 'rgba(255,255,255,0.35)', 'important')
    } else {
      el.style.setProperty('--_bg', '#ffffff', 'important')
      el.style.setProperty('--_text', '#333333', 'important')
      el.style.setProperty('--_primary', '#2563eb', 'important')
      el.style.setProperty('--_border', '#d1d5db', 'important')
      el.style.setProperty('--_content', '#ffffff', 'important')
      el.style.setProperty('--_surface', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_hover', 'rgba(0,0,0,0.08)', 'important')
      el.style.setProperty('--_active', 'rgba(0,0,0,0.12)', 'important')
      el.style.setProperty('--_input-bg', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_scroll-track', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_scroll-thumb', 'rgba(0,0,0,0.18)', 'important')
      el.style.setProperty('--_scroll-thumb-hover', 'rgba(0,0,0,0.3)', 'important')
    }
    // 强制 Angular 变更检测，确保子元素 CSS 变量重新计算
    this.cdr.detectChanges()
  }

  /** 格式化传输速度 */
  private _formatSpeed(bytes: number, ms: number): string {
    if (bytes <= 0 || ms <= 0) return ''
    const bps = (bytes / ms) * 1000
    if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
    if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
    return Math.round(bps) + ' B/s'
  }

  /** 格式化传输速度（用于已完成的日志记录） */
  formatSpeedFromSize(size: number, duration: number): string {
    if (!size || !duration) return '--'
    const bps = (size / duration) * 1000
    if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
    if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
    return Math.round(bps) + ' B/s'
  }

  /** 判断颜色是否为暗色（ITU-R BT.601 亮度公式） */
  private _isColorDark(hex: string): boolean {
    if (!hex || !hex.startsWith('#')) return true
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16) || 0
    const g = parseInt(h.substring(2, 4), 16) || 0
    const b = parseInt(h.substring(4, 6), 16) || 0
    return 0.299 * r + 0.587 * g + 0.114 * b < 128
  }

  close(): void {
    // 有正在进行的传输时，提示用户确认
    if (this.transfers.length > 0) {
      const msg = this.effectiveLang === 'zh-CN'
        ? `有 ${this.transfers.length} 个传输正在进行中，关闭面板将中断所有传输。是否继续？`
        : `${this.transfers.length} transfer(s) in progress. Close panel will interrupt all transfers. Continue?`
      if (!confirm(msg)) return
      // 用户确认关闭 → 取消所有传输
      this.clearTransfers()
    }
    this.saveCurrentPath()
    this.disconnect()
    this.onClose?.()
  }

  /** 最小化面板（不销毁，下次点击入口直接恢复） */
  minimize(): void {
    this.saveCurrentPath()
    this.minimized = true
    this.onMinimize?.()
  }

  // ========== 连接管理 ==========
  async connect(): Promise<void> {
    if (this.connecting || this.connected || !this.sshSession) return
    this.connecting = true
    this._remoteLoading = true
    this.cdr.detectChanges()
    try {
      this.sftpSession = await this.sftpService.openFromSSHSession(this.sshSession)
      this.connected = true
      this._startHeartbeat()
      this.remotePath = this.getDefaultRemotePath()
      this.remotePathInput = this.remotePath
      // 如果开启了路径记忆，尝试恢复保存的远程路径
      if (this.rememberPath) {
        this._restoreSavedRemotePath()
      }
      const ok = await this.refreshRemote()
      if (!ok && this.remotePath !== '/') {
        console.warn('[SFTP+] Saved remote path invalid, falling back to /')
        this.remotePath = '/'
        this.remotePathInput = '/'
        await this.refreshRemote()
      }
      // 远程导航历史：记录初始路径
      this._pushRemoteNav(this.remotePath)
    } catch (e) {
      console.error('[SFTP+] Connection failed', e)
    } finally {
      this.connecting = false
      this._remoteLoading = false
      this.cdr.detectChanges()
    }
  }

  disconnect(): void {
    this.sftpSession = null
    this.connected = false
    if (this.sshSession) {
      this.sftpService.closeForSSHSession(this.sshSession)
    }
    this._stopHeartbeat()
    // 面板关闭时清空导航历史
    this._remoteNavHistory = []
    this._remoteNavIndex = -1
    this._localNavHistory = []
    this._localNavIndex = -1
  }

  // ---- 心跳检测 ----

  /** 停止心跳计时器并清理 SSH 关闭监听器 */
  private _stopHeartbeat(): void {
    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
    if (this._sshCloseHandler !== null) {
      try { this._sshCloseHandler() } catch { /* ignore */ }
      this._sshCloseHandler = null
    }
  }

  /**
   * 启动心跳：每 10 秒用 readdir('.') 检测 SFTP 连接是否存活
   * 功能描述：
   *   - SSH 断开检测：BaseSession.closed$ (RxJS Observable) + sshSession.open (boolean)
   *     + terminalRef.session (null) 三重检测机制
   *   - SFTP 心跳：轻量级目录读取 + 4 秒超时，检测连接中断或僵死
   *   - 心跳失败时自动尝试重新打开 SFTP 通道再恢复，不立即标记断开
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-23
   * 修改人：DD1024z + Deepseek-V4-Flash
   * 修改时间：2026-06-25
   */
  private _startHeartbeat(): void {
    this._stopHeartbeat()

    // 监听 SSH 会话关闭事件
    // BaseSession.closed$ 是 RxJS Subject/Observable，Session 关闭时 emit
    try {
      const ssh = this.sshSession as any
      if (ssh) {
        // 方法1（推荐）：使用 RxJS Observable (BaseSession.closed$)
        if (ssh.closed$ && typeof ssh.closed$.subscribe === 'function') {
          const sub = ssh.closed$.subscribe(() => {
            this.zone.run(() => {
              this.connected = false
              this._stopHeartbeat()
              this.cdr.detectChanges()
              console.log('[SFTP+] SSH session closed (detected via closed$)')
            })
          })
          this._sshCloseHandler = () => {
            try { sub.unsubscribe() } catch { /* ignore */ }
          }
        }
        // 方法2（回退）：某些 Tabby 版本可能暴露 .closed 为 Promise
        else if (typeof ssh.closed?.then === 'function') {
          (ssh.closed as Promise<void>).then(() => {
            this.zone.run(() => {
              this.connected = false
              this._stopHeartbeat()
              this.cdr.detectChanges()
              console.log('[SFTP+] SSH session closed (detected via .closed Promise)')
            })
          }).catch(() => {})
        }
      }
    } catch { /* ignore */ }

    this._heartbeatTimer = setInterval(() => {
      if (!this.connected || !this.sftpSession) return

      // 额外检测：SSH 会话对象的 open 标志
      try {
        const ssh = this.sshSession as any
        if (ssh?.open === false) {
          this.zone.run(() => {
            this.connected = false
            this._stopHeartbeat()
            this.cdr.detectChanges()
            console.log('[SFTP+] SSH session closed (detected via open=false)')
          })
          return
        }
      } catch { /* ignore */ }

      // 额外检测：terminal 的 session 引用已被置空
      try {
        if (this.terminalRef?.session === null) {
          this.zone.run(() => {
            this.connected = false
            this._stopHeartbeat()
            this.cdr.detectChanges()
            console.log('[SFTP+] SSH session closed (detected via terminal.session=null)')
          })
          return
        }
      } catch { /* ignore */ }

      const sftp = this.sftpSession
      // 用 Promise.race 实现 4 秒超时
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('heartbeat-timeout')), 4000)
      })

      Promise.race([
        sftp.readdir('.').then(() => {
          // 心跳成功，清除超时定时器（防止悬空定时器累积）
          if (timeoutId !== undefined) clearTimeout(timeoutId)
        }),
        timeoutPromise,
      ]).catch(async () => {
        // 避免并发恢复
        if (this._heartbeatRecovering) return
        this._heartbeatRecovering = true
        // 心跳失败 → 尝试恢复 SFTP 通道
        try {
          if (!this.sshSession) throw new Error('no ssh session')
          // 清除缓存，强制打开新的 SFTP 通道
          this.sftpService.closeForSSHSession(this.sshSession)
          const fresh = await this.sftpService.openFromSSHSession(this.sshSession)
          this.sftpSession = fresh
          console.log('[SFTP+] Heartbeat recovered with new SFTP session')
          // 重新连接后刷新文件列表（不阻塞心跳）
          this.zone.run(() => { void this.refreshRemote() })
        } catch (e) {
          console.error('[SFTP+] Heartbeat recovery failed', e)
          // 恢复失败 → 标记断连
          this.zone.run(() => {
            this.connected = false
            this._stopHeartbeat()
            this.cdr.detectChanges()
          })
        } finally {
          this._heartbeatRecovering = false
        }
      })
    }, 10000)
  }

  /**
   * 用户点击"重新连接"按钮
   * 功能描述：尝试获取最新 SSH 会话并重新打开 SFTP 连接
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-23
   */
  async onReconnect(): Promise<void> {
    if (this.reconnecting) return
    this.reconnecting = true
    this._remoteLoading = true
    this.cdr.detectChanges()
    try {
      // 步骤1：尝试聚焦终端并触发重连（Tabby 在终端断开后需要交互才能重连）
      if (this.terminalRef) {
        try {
          // 聚焦终端元素，触发 Tabby 的重连 UI
          const termEl = (this.terminalRef as any).element?.nativeElement as HTMLElement | null
          if (termEl) {
            termEl.click()   // 点击终端触发重连检测
            termEl.focus?.()
          }
          // 尝试调用终端的重连方法（如果有的话）
          const reconnect = (this.terminalRef as any).reconnect
            || (this.terminalRef as any)._reconnect
          if (typeof reconnect === 'function') {
            await reconnect.call(this.terminalRef)
          }
          // 尝试调用 sshSession 的重连方法
          if (this.sshSession && typeof this.sshSession === 'object') {
            const sessReconnect = (this.sshSession as any).reconnect
            if (typeof sessReconnect === 'function') {
              await sessReconnect.call(this.sshSession)
            }
          }
        } catch (e) {
          console.log('[SFTP+] Terminal reconnect trigger failed, will retry', e)
        }

        // 等待 2 秒让终端有机会重连
        await new Promise(resolve => setTimeout(resolve, 2000))

        // 步骤2：获取最新的 sshSession（终端可能已重连）
        const fresh =
          (this.terminalRef as any).sshSession
          || (this.terminalRef as any)._sshSession
          || (this.terminalRef as any)._session
        if (fresh && fresh !== this.sshSession) {
          this.sshSession = fresh
        }
      }

      if (!this.sshSession) {
        // SSH 会话已完全失效，提示用户在终端重连
        this.connected = false
        this.sftpSession = null
        this.reconnecting = false
        this._remoteLoading = false
        this.cdr.detectChanges()
        const isZh = this.i18n.getLocale() === 'zh-CN'
        const msg = isZh
          ? '终端连接已断开，请在终端中点击或按任意键重新连接。'
          : 'Terminal disconnected. Please click or press any key in the terminal to reconnect.'
        try { this.notifications?.error?.(msg, '') } catch {}
        return
      }

      this.sftpSession = await this.sftpService.openFromSSHSession(this.sshSession)
      this.connected = true
      this.remotePath = this.getDefaultRemotePath()
      this.remotePathInput = this.remotePath
      if (this.rememberPath) {
        this._restoreSavedRemotePath()
      }
      const ok = await this.refreshRemote()
      if (!ok && this.remotePath !== '/') {
        console.warn('[SFTP+] Reconnect: saved remote path invalid, falling back to /')
        this.remotePath = '/'
        this.remotePathInput = '/'
        await this.refreshRemote()
      }
      this._startHeartbeat()
    } catch (e) {
      console.error('[SFTP+] Reconnect failed', e)
      this.connected = false
      this.sftpSession = null
      const isZh = this.i18n.getLocale() === 'zh-CN'
      const msg = isZh
        ? '重连失败，请在终端中点击或按任意键重新连接。'
        : 'Reconnect failed. Please click or press any key in the terminal to reconnect.'
      try { this.notifications?.error?.(msg, '') } catch {}
    } finally {
      this.reconnecting = false
      this._remoteLoading = false
      this.cdr.detectChanges()
    }
  }

  private getDefaultRemotePath(): string {
    return '/'
  }

  // ========== 本地文件 ==========
  async refreshLocal(): Promise<void> {
    if (!this.localPath || typeof this.localPath !== 'string') {
      console.warn('[SFTP+] refreshLocal skipped: localPath is invalid')
      return
    }
    // 刷新时不显示 loading 动画（避免布局 reflow 导致晃动），直接用闪烁反馈
    this._localFlash = false
    // this.cdr.detectChanges()  // 去掉强制变更检测，避免重绘抖动
    try {
      const names = await fs.readdir(this.localPath)
      const entries: LocalEntry[] = []
      for (const name of names) {
        const fp = path.join(this.localPath, name)
        try {
          const st = await fs.stat(fp)
          entries.push({
            name, fullPath: fp,
            isDirectory: st.isDirectory(),
            mode: st.mode, size: st.size,
            mtimeMs: st.mtimeMs, atimeMs: st.atimeMs,
            birthtimeMs: st.birthtimeMs,
            owner: st.uid, group: st.gid,
          })
        } catch {
          // stat 失败（权限不足等）：标记为不可访问
          entries.push({ name, fullPath: fp, isDirectory: true, inaccessible: true })
        }
      }
      this.zone.run(() => { this.localEntries = entries; this._localError = false })
    } catch (e) {
      console.error('[SFTP+] Local listing failed', e)
      this.zone.run(() => { this.localEntries = []; this._localError = true })
    }
    this._localFlash = true
    this.cdr.detectChanges()
    setTimeout(() => { this._localFlash = false }, 260)
  }

  canLocalUp(): boolean {
    if (!this.localPath || typeof this.localPath !== 'string') return false
    return path.dirname(this.localPath) !== this.localPath
  }

  canRemoteUp(): boolean {
    if (!this.remotePath || typeof this.remotePath !== 'string') return false
    return this.remotePath !== '/'
  }

  localUp(): void {
    const parent = path.dirname(this.localPath)
    if (parent !== this.localPath) {
      this._pushLocalNav(parent)
      this.localPath = parent
      this.localPathInput = parent
      this.saveCurrentPath()
      void this.refreshLocal()
    }
  }

  goLocalHome(): void {
    this._pushLocalNav(os.homedir())
    this.localPath = os.homedir()
    this.localPathInput = this.localPath
    this.saveCurrentPath()
    void this.refreshLocal()
  }

  goToLocalPathInput(): void {
    const target = this.normalizeLocalPath(this.localPathInput || this.localPath)
    if (target === this.localPath) return
    this._pushLocalNav(target)
    this.localPath = target
    this.localPathInput = this.localPath
    this.saveCurrentPath()
    void this.refreshLocal()
  }

  private normalizeLocalPath(p: string): string {
    if (!p) return this.localPath
    return path.isAbsolute(p) ? p : path.join(this.localPath, p)
  }

  // ========== 远程文件 ==========
  async refreshRemote(): Promise<boolean> {
    if (!this.connected || !this.sftpSession) return false
    if (!this.remotePath || typeof this.remotePath !== 'string') {
      console.warn('[SFTP+] refreshRemote skipped: remotePath is invalid, resetting to /')
      this.remotePath = '/'
      this.remotePathInput = '/'
    }
    this._remoteLoading = true
    this._remoteFlash = false
    try {
      const entries = await this.sftpSession.readdir(this.remotePath)
      this.zone.run(() => { this.remoteEntries = entries; this._remoteError = false })
    } catch (e) {
      console.error('[SFTP+] Remote listing failed', e)
      this.zone.run(() => { this.remoteEntries = []; this._remoteError = true })
      this._remoteLoading = false
      this.cdr.detectChanges()
      return false
    }
    this._remoteLoading = false
    this._remoteFlash = true
    this.cdr.detectChanges()
    setTimeout(() => { this._remoteFlash = false }, 260)
    return true
  }

  // ========== 远程导航历史 ==========

  /**
   * 将路径加入导航历史（后退/前进用）
   */
  private _pushRemoteNav(newPath: string): void {
    if (this._ignoreNavPush) return
    // 如果不在历史末尾，截断后面的条目
    if (this._remoteNavIndex < this._remoteNavHistory.length - 1) {
      this._remoteNavHistory = this._remoteNavHistory.slice(0, this._remoteNavIndex + 1)
    }
    this._remoteNavHistory.push(newPath)
    if (this._remoteNavHistory.length > this._remoteNavMax) {
      this._remoteNavHistory.shift()
    }
    this._remoteNavIndex = this._remoteNavHistory.length - 1
  }

  /** 后退 */
  async remoteBack(): Promise<void> {
    if (!this.canRemoteBack) return
    this._remoteNavIndex--
    const target = this._remoteNavHistory[this._remoteNavIndex]
    if (!target || typeof target !== 'string') {
      console.warn('[SFTP+] remoteBack: history entry invalid, aborting')
      this._remoteNavIndex++
      return
    }
    this._ignoreNavPush = true
    this.remotePath = target
    this.remotePathInput = this.remotePath
    this.saveCurrentPath()
    await this.refreshRemote()
    this._ignoreNavPush = false
  }

  /** 前进 */
  async remoteForward(): Promise<void> {
    if (!this.canRemoteForward) return
    this._remoteNavIndex++
    const target = this._remoteNavHistory[this._remoteNavIndex]
    if (!target || typeof target !== 'string') {
      console.warn('[SFTP+] remoteForward: history entry invalid, aborting')
      this._remoteNavIndex--
      return
    }
    this._ignoreNavPush = true
    this.remotePath = target
    this.remotePathInput = this.remotePath
    this.saveCurrentPath()
    await this.refreshRemote()
    this._ignoreNavPush = false
  }

  remoteUp(): void {
    if (!this.connected || this.remotePath === '/') return
    const next = path.posix.dirname(this.remotePath)
    const dest = next === '.' ? '/' : next
    this._pushRemoteNav(dest)
    this.remotePath = dest
    this.remotePathInput = this.remotePath
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  goRemoteHome(): void {
    if (!this.connected || !this.sftpSession) return
    this._pushRemoteNav('/')
    this.remotePath = '/'
    this.remotePathInput = '/'
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  goToRemotePathInput(): void {
    if (!this.connected) return
    const target = this.normalizeRemotePath(this.remotePathInput || '/')
    if (target === this.remotePath) return
    this._pushRemoteNav(target)
    this.remotePath = target
    this.remotePathInput = this.remotePath
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  private normalizeRemotePath(p: string): string {
    if (!p) return '/'
    let r = p.trim()
    if (!r.startsWith('/')) r = '/' + r
    return r.replace(/\/+/g, '/')
  }

  // ========== 本地导航历史 ==========

  /**
   * 将本地路径加入导航历史（后退/前进用）
   */
  private _pushLocalNav(newPath: string): void {
    if (this._ignoreLocalNavPush) return
    if (this._localNavIndex < this._localNavHistory.length - 1) {
      this._localNavHistory = this._localNavHistory.slice(0, this._localNavIndex + 1)
    }
    this._localNavHistory.push(newPath)
    if (this._localNavHistory.length > this._localNavMax) {
      this._localNavHistory.shift()
    }
    this._localNavIndex = this._localNavHistory.length - 1
  }

  /** 后退 */
  localBack(): void {
    if (!this.canLocalBack) return
    this._localNavIndex--
    const target = this._localNavHistory[this._localNavIndex]
    if (!target || typeof target !== 'string') {
      console.warn('[SFTP+] localBack: history entry invalid, aborting')
      this._localNavIndex++
      return
    }
    this._ignoreLocalNavPush = true
    this.localPath = target
    this.localPathInput = this.localPath
    this.saveCurrentPath()
    void this.refreshLocal()
    this._ignoreLocalNavPush = false
  }

  /** 前进 */
  localForward(): void {
    if (!this.canLocalForward) return
    this._localNavIndex++
    const target = this._localNavHistory[this._localNavIndex]
    if (!target || typeof target !== 'string') {
      console.warn('[SFTP+] localForward: history entry invalid, aborting')
      this._localNavIndex--
      return
    }
    this._ignoreLocalNavPush = true
    this.localPath = target
    this.localPathInput = this.localPath
    this.saveCurrentPath()
    void this.refreshLocal()
    this._ignoreLocalNavPush = false
  }

  // ========== 框选（Rubber Band Selection）==========
  /**
   * 功能描述：面板空白区域 mousedown → 启动框选；在 entry 上点击则不启动
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-22
   */
  /** 点击面板空白区域：清除对侧面板的选中（仅允许单侧选中） */
  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    // 只有点中空白区域（非 .entry 元素）才处理
    const target = event.target as HTMLElement | null
    if (target && target.closest('.entry')) return
    if (pane === 'local' && this.selectedRemote.length > 0) {
      this.selectedRemote = []
    } else if (pane === 'remote' && this.selectedLocal.length > 0) {
      this.selectedLocal = []
    }
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote'): void {
    // 响应左键(0)和右键(2)
    if (event.button !== 0 && event.button !== 2) return
    const target = event.target as HTMLElement

    // 表头区域不触发框选
    if (target.closest('.entry.header')) return

    // 记录是否点击在 entry 上（非 header）
    this.rubberBand.startedOnEntry = !!target.closest('.entry:not(.header)')

    const listEl = target.closest('.pane-list') as HTMLElement | null
    if (!listEl) return

    const rect = listEl.getBoundingClientRect()
    this.rubberBand.pane = pane
    this.rubberBand.startX = event.clientX - rect.left + listEl.scrollLeft
    this.rubberBand.startY = event.clientY - rect.top + listEl.scrollTop
    this.rubberBand.currentX = this.rubberBand.startX
    this.rubberBand.currentY = this.rubberBand.startY
    this.rubberBand.active = false
    this.rubberBand.rectLeft = this.rubberBand.startX
    this.rubberBand.rectTop = this.rubberBand.startY
    this.rubberBand.rectWidth = 0
    this.rubberBand.rectHeight = 0
    this._rbMoved = false
    this._rbLongPress = false
    this._rbSuppressDrag = false
    this._rbStartClientX = event.clientX
    this._rbStartClientY = event.clientY

    // 绑定 document 级 move/up
    if (!this._rbMoveHandler) {
      this._rbMoveHandler = (e: MouseEvent) => this._rbOnMouseMove(e)
    }
    if (!this._rbUpHandler) {
      this._rbUpHandler = (e: MouseEvent) => this._rbOnMouseUp(e)
    }
    document.addEventListener('mousemove', this._rbMoveHandler)
    document.addEventListener('mouseup', this._rbUpHandler)

    // 在空白区域按下左键：preventDefault 阻止文本选择，启动框选预备
    // 在条目上按下左键：不 preventDefault，让原生 dragstart 正常触发
    // 右键（无论在条目上还是空白）：preventDefault 阻止即时 contextmenu
    if (event.button === 0 && !this.rubberBand.startedOnEntry) {
      event.preventDefault()
    }
    if (event.button === 2) {
      event.preventDefault()
    }

    // 框选计时器启动条件：
    //   左键在空白区域 或 右键在任何位置 → 立即启动 500ms 计时器
    //   左键在条目上 → 不启动计时器（让拖拽正常触发；若用户想框选，用右键或 Ctrl+左键）
    const shouldStartTimer = (event.button === 2) || (event.button === 0 && !this.rubberBand.startedOnEntry)
    if (shouldStartTimer) {
      if (this._rbLongPressTimer) clearTimeout(this._rbLongPressTimer)
      this._rbLongPressTimer = setTimeout(() => {
        this._rbLongPress = true
        // 长按触发：强制激活框选
        if (!this.rubberBand.active) {
          this.rubberBand.active = true
          this._rbMoved = true
          this._rbSuppressDrag = true
          // 右键长按触发框选：追加模式，不清空已有选择
        }
      }, 500)
    }
  }

  /** 框选 mousemove：更新选择矩形并实时选中条目 */
  private _rbOnMouseMove(event: MouseEvent): void {
    const rb = this.rubberBand

    // —— 长按计时器仍 pending 时，检测是否已移动超过阈值 ——
    if (this._rbLongPressTimer && !this._rbLongPress) {
      const moveDx = event.clientX - this._rbStartClientX
      const moveDy = event.clientY - this._rbStartClientY
      if (Math.abs(moveDx) > 3 || Math.abs(moveDy) > 3) {
        // 在条目上按下左键并移动 → 取消计时器，让文件拖拽正常触发
        if (rb.startedOnEntry && event.buttons === 1) {
          clearTimeout(this._rbLongPressTimer)
          this._rbLongPressTimer = null
          this._rbCleanup()
          return
        }
        // 空白区域按下并移动 → 取消计时器，立即激活框选
        clearTimeout(this._rbLongPressTimer)
        this._rbLongPressTimer = null
        rb.active = true
        this._rbMoved = true
        this._rbSuppressDrag = true
        // 无 Ctrl ⇒ 清空已有选择（替换模式）；有 Ctrl ⇒ 追加模式
        if (!event.ctrlKey && !event.metaKey) {
          if (rb.pane === 'local') { this.selectedLocal = []; this.localLastSelectedIndex = null }
          else { this.selectedRemote = []; this.remoteLastSelectedIndex = null }
        }
      }
      // 未超过阈值 → 继续等待，不处理框选
      if (!rb.active) return
    }

    // —— 长按已触发：确保框选激活 ——
    if (this._rbLongPress && !rb.active) {
      rb.active = true
      this._rbMoved = true
    }

    const paneList = (rb.pane === 'local'
      ? (this.elRef?.nativeElement as HTMLElement)?.querySelector('.pane-list.local-pane')
      : (this.elRef?.nativeElement as HTMLElement)?.querySelector('.pane-list.remote-pane')
    ) as HTMLElement | null
    if (!paneList) return

    const rect = paneList.getBoundingClientRect()
    rb.currentX = Math.max(0, Math.min(event.clientX - rect.left + paneList.scrollLeft, paneList.scrollWidth))
    rb.currentY = Math.max(0, Math.min(event.clientY - rect.top + paneList.scrollTop, paneList.scrollHeight))

    const dx = rb.currentX - rb.startX
    const dy = rb.currentY - rb.startY

    // 移动超过 3px 阈值才激活框选（避免单击误触发）
    // 但在 entry 上移动时不激活框选，让原生拖拽正常触发
    if (!rb.active && !this.rubberBand.startedOnEntry && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      rb.active = true
      this._rbMoved = true
      this._rbSuppressDrag = true
      // 无 Ctrl ⇒ 清空已有选择（替换模式）；有 Ctrl ⇒ 追加模式
      if (!event.ctrlKey && !event.metaKey) {
        if (rb.pane === 'local') { this.selectedLocal = []; this.localLastSelectedIndex = null }
        else { this.selectedRemote = []; this.remoteLastSelectedIndex = null }
      }
    }

    if (!rb.active) return

    // 计算矩形（归一化为左上角+宽高）
    rb.rectLeft = dx >= 0 ? rb.startX : rb.currentX
    rb.rectTop = dy >= 0 ? rb.startY : rb.currentY
    rb.rectWidth = Math.abs(dx)
    rb.rectHeight = Math.abs(dy)

    // 实时选中相交的 entry
    this._rbSelectIntersecting()
  }

  /** 框选 mouseup：结束框选 */
  private _rbOnMouseUp(event: MouseEvent): void {
    // 在 _rbCleanup() 之前保存状态
    const wasClickOnBlank = !this._rbMoved && !this.rubberBand.startedOnEntry
    const pane = this.rubberBand.pane
    const button = event.button

    // 清理长按计时器
    if (this._rbLongPressTimer) {
      clearTimeout(this._rbLongPressTimer)
      this._rbLongPressTimer = null
    }
    this._rbLongPress = false
    this._rbSuppressDrag = false
    // 右键框选刚结束：设置标志阻止接下来的 contextmenu
    if (event.button === 2 && this._rbMoved) {
      this._rbJustFinishedRightClick = true
      setTimeout(() => { this._rbJustFinishedRightClick = false }, 300)
    }
    this._rbCleanup()

    // 左键在空白区域点击（无拖拽）= 清除该面板选中
    if (wasClickOnBlank && button === 0) {
      if (pane === 'local') {
        this.selectedLocal = []
        this.localLastSelectedIndex = null
      } else {
        this.selectedRemote = []
        this.remoteLastSelectedIndex = null
      }
      try { this.cdr.detectChanges() } catch {}
    }
  }

  /** 清理框选事件监听和状态 */
  private _rbCleanup(): void {
    if (this._rbLongPressTimer) {
      clearTimeout(this._rbLongPressTimer)
      this._rbLongPressTimer = null
    }
    if (this._rbMoveHandler) document.removeEventListener('mousemove', this._rbMoveHandler)
    if (this._rbUpHandler) document.removeEventListener('mouseup', this._rbUpHandler)
    this.rubberBand.active = false
    this.rubberBand.startedOnEntry = false
    this._rbLongPress = false
    this._rbSuppressDrag = false
    // 触发变更检测以移除 DOM 中的框选矩形
    try { this.cdr.detectChanges() } catch {}
  }

  // ========== 窄屏上下布局分割线 ==========

  /** 根据当前布局应用面板分割比例 */
  private _applyPaneSplit(): void {
    if (!this.elRef?.nativeElement) return
    const body = this.elRef.nativeElement.querySelector('.sftp-body') as HTMLElement | null
    if (!body) return
    const panes: HTMLElement[] = Array.from(body.querySelectorAll(':scope > .pane'))
    if (panes.length < 2) return

    // 设置 flex-direction：用 JS 控制，避免 CSS @media 使用视口宽度与元素宽度不同步
    // （panelHost width:96% 导致元素宽度 < 视口宽度，阈值区 961-1000px 时会错位）
    body.style.flexDirection = this._isNarrowLayout ? 'column' : 'row'
    // 窄屏 class 控制分割线样式（cursor、width/height），同步于布局而非视口
    body.classList.toggle('narrow-layout', this._isNarrowLayout)

    // 清除之前可能残留的内联样式（防止宽窄切换后样式残留）
    panes.forEach(p => { p.style.flex = ''; p.style.width = ''; p.style.height = '' })

    const splitterSize = 5

    if (this._isNarrowLayout) {
      // 窄屏上下布局：按比例分配高度
      const bodyH = body.clientHeight
      panes[0].style.flex = 'none'
      panes[0].style.height = Math.max(80, (bodyH - splitterSize) * this._verticalSplitRatio) + 'px'
      panes[1].style.flex = '1'
      panes[1].style.minHeight = '80px'
    } else {
      // 宽屏左右布局：按比例分配宽度，最小宽度 450px
      const bodyW = body.clientWidth
      const minPaneW = 450
      // 先按比例计算本地面板宽度
      let w0 = Math.round((bodyW - splitterSize) * this._horizontalSplitRatio)
      // 约束两侧都不小于最小宽度
      if (w0 < minPaneW) w0 = minPaneW
      if (w0 > bodyW - splitterSize - minPaneW) w0 = bodyW - splitterSize - minPaneW
      // 更新 ratio 使之与真实分配一致
      this._horizontalSplitRatio = w0 / (bodyW - splitterSize)
      panes[0].style.flex = 'none'
      panes[0].style.width = w0 + 'px'
      panes[1].style.flex = '1'
      panes[1].style.minWidth = minPaneW + 'px'
    }
  }

  /** 分割线按下 */
  onSplitterDown(ev: MouseEvent): void {
    ev.preventDefault()
    this._splitDragStartX = ev.clientX
    this._splitDragStartY = ev.clientY
    this._splitDragStartRatio = this._isNarrowLayout ? this._verticalSplitRatio : this._horizontalSplitRatio

    const body = this.elRef.nativeElement.querySelector('.sftp-body')
    if (!body) return
    const bodyH = body.clientHeight
    const bodyW = body.clientWidth

    // 给分割线加 active 样式
    const splitterEl = ev.currentTarget as HTMLElement
    splitterEl.classList.add('active')

    this._splitMoveHandler = (e: MouseEvent): void => {
      if (this._isNarrowLayout) {
        const delta = e.clientY - this._splitDragStartY
        this._verticalSplitRatio = Math.max(0.15, Math.min(0.85, this._splitDragStartRatio + delta / bodyH))
      } else {
        const delta = e.clientX - this._splitDragStartX
        this._horizontalSplitRatio = Math.max(0.15, Math.min(0.85, this._splitDragStartRatio + delta / bodyW))
      }
      this._applyPaneSplit()
    }
    this._splitUpHandler = (_e: MouseEvent): void => {
      splitterEl.classList.remove('active')
      document.removeEventListener('mousemove', this._splitMoveHandler!)
      document.removeEventListener('mouseup', this._splitUpHandler!)
      this._splitMoveHandler = null
      this._splitUpHandler = null
      // 持久化比例
      const key = this._isNarrowLayout ? 'sftp-plus-vertical-split-ratio' : 'sftp-plus-horizontal-split-ratio'
      const val = this._isNarrowLayout ? this._verticalSplitRatio : this._horizontalSplitRatio
      try { this._paneSet(key, String(val)) } catch {}
    }
    document.addEventListener('mousemove', this._splitMoveHandler)
    document.addEventListener('mouseup', this._splitUpHandler)
  }

  /** 双击分割线恢复默认大小 */
  resetSplitter(): void {
    this._verticalSplitRatio = 0.5
    this._horizontalSplitRatio = 0.5
    this._applyPaneSplit()
  }

  /** 选中与当前框选矩形相交的所有条目 */
  private _rbSelectIntersecting(): void {
    const rb = this.rubberBand
    const rLeft = rb.rectLeft, rTop = rb.rectTop,
          rRight = rLeft + rb.rectWidth, rBottom = rTop + rb.rectHeight

    if (rb.pane === 'local') {
      const entries = this.getFilteredLocalEntries()
      const newSel: LocalEntry[] = [...this.selectedLocal]
      for (const e of entries) {
        const idx = entries.indexOf(e)
        // 获取 entry 的 DOM 位置
        const el = this._getEntryElement(idx, 'local')
        if (!el) continue
        const er = el.getBoundingClientRect()
        const listEl = el.closest('.pane-list') as HTMLElement
        if (!listEl) continue
        const lr = listEl.getBoundingClientRect()
        // 转换到 pane 坐标系（含滚动）
        const eLeft = er.left - lr.left + listEl.scrollLeft
        const eTop = er.top - lr.top + listEl.scrollTop
        const eRight = eLeft + er.width
        const eBottom = eTop + er.height
        // 相交检测（允许部分重叠即算）
        const intersects = !(rRight < eLeft || rBottom < eTop || rLeft > eRight || rTop > eBottom)
        if (intersects) {
          if (!newSel.includes(e)) newSel.push(e)
        } else {
          // 不相交时从选择中移除（仅本次框选新增的）
          // 注意：不清除之前已有的选择，只管理本次框选范围内的
        }
      }
      // 用 set 合并：保留之前的选择 + 新框选的
      if (!rb.startedOnEntry) {
        this.selectedLocal = newSel
      } else {
        // 追加模式：合并新旧
        const merged = new Set(this.selectedLocal)
        newSel.forEach(e => merged.add(e))
        this.selectedLocal = Array.from(merged)
      }
    } else {
      const entries = this.getFilteredRemoteEntries()
      const newSel: SFTPFile[] = [...this.selectedRemote]
      for (const e of entries) {
        const idx = entries.indexOf(e)
        const el = this._getEntryElement(idx, 'remote')
        if (!el) continue
        const er = el.getBoundingClientRect()
        const listEl = el.closest('.pane-list') as HTMLElement
        if (!listEl) continue
        const lr = listEl.getBoundingClientRect()
        const eLeft = er.left - lr.left + listEl.scrollLeft
        const eTop = er.top - lr.top + listEl.scrollTop
        const eRight = eLeft + er.width
        const eBottom = eTop + er.height
        const intersects = !(rRight < eLeft || rBottom < eTop || rLeft > eRight || rTop > eBottom)
        if (intersects) {
          if (!newSel.includes(e)) newSel.push(e)
        }
      }
      if (!rb.startedOnEntry) {
        this.selectedRemote = newSel
      } else {
        const merged = new Set(this.selectedRemote)
        newSel.forEach(e => merged.add(e))
        this.selectedRemote = Array.from(merged)
      }
    }
    try { this.cdr.detectChanges() } catch {}
  }

  /** 根据 index 获取 entry 的 DOM 元素 */
  private _getEntryElement(index: number, pane: 'local' | 'remote'): HTMLElement | null {
    const cls = '.pane-list.' + (pane === 'local' ? 'local-pane' : 'remote-pane') + ' .entry:not(.header):not(.up-entry)'
    const root = this.elRef?.nativeElement as HTMLElement | null
    if (!root) return null
    const entries = root.querySelectorAll(cls)
    return entries[index] as HTMLElement | null
  }

  // ========== 选择 ==========
  selectLocal(entry: LocalEntry, event: MouseEvent, idx: number): void {
    // 选中本地面板时清除远程面板选中（仅允许单侧选中）
    if (this.selectedRemote.length > 0) this.selectedRemote = []
    const list = this.getFilteredLocalEntries()
    if (event.ctrlKey || event.metaKey) {
      this.selectedLocal = this.selectedLocal.includes(entry)
        ? this.selectedLocal.filter(e => e !== entry)
        : [...this.selectedLocal, entry]
      this.localLastSelectedIndex = idx
    } else if (event.shiftKey && this.localLastSelectedIndex !== null) {
      const [f, t] = this.localLastSelectedIndex < idx ? [this.localLastSelectedIndex, idx] : [idx, this.localLastSelectedIndex]
      const set = new Set(this.selectedLocal)
      list.slice(f, t + 1).forEach(e => set.add(e))
      this.selectedLocal = Array.from(set)
    } else if (this.selectedLocal.includes(entry)) {
      // 点击已选中的项目：若为单选则取消选中，若为多选则变为单选
      this.selectedLocal = this.selectedLocal.length === 1 ? [] : [entry]
      this.localLastSelectedIndex = idx
    } else {
      this.selectedLocal = [entry]
      this.localLastSelectedIndex = idx
    }
  }

  isLocalSelected(e: LocalEntry): boolean { return this.selectedLocal.includes(e) }

  selectRemote(entry: SFTPFile, event: MouseEvent, idx: number): void {
    // 选中远程面板时清除本地面板选中（仅允许单侧选中）
    if (this.selectedLocal.length > 0) this.selectedLocal = []
    const list = this.getFilteredRemoteEntries()
    if (event.ctrlKey || event.metaKey) {
      this.selectedRemote = this.selectedRemote.includes(entry)
        ? this.selectedRemote.filter(e => e !== entry)
        : [...this.selectedRemote, entry]
      this.remoteLastSelectedIndex = idx
    } else if (event.shiftKey && this.remoteLastSelectedIndex !== null) {
      const [f, t] = this.remoteLastSelectedIndex < idx ? [this.remoteLastSelectedIndex, idx] : [idx, this.remoteLastSelectedIndex]
      const set = new Set(this.selectedRemote)
      list.slice(f, t + 1).forEach(e => set.add(e))
      this.selectedRemote = Array.from(set)
    } else if (this.selectedRemote.includes(entry)) {
      // 点击已选中的项目：若为单选则取消选中，若为多选则变为单选
      this.selectedRemote = this.selectedRemote.length === 1 ? [] : [entry]
      this.remoteLastSelectedIndex = idx
    } else {
      this.selectedRemote = [entry]
      this.remoteLastSelectedIndex = idx
    }
  }

  isRemoteSelected(e: SFTPFile): boolean { return this.selectedRemote.includes(e) }

  // ========== 排序 ==========
  setLocalSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    // 拖拽列宽后 200ms 内忽略点击排序
    if (this._colJustResized) return
    this.localSortAsc = this.localSortBy === f ? !this.localSortAsc : true
    this.localSortBy = f
    try { this._paneSet('sftp-plus-local-sort', JSON.stringify({ by: this.localSortBy, asc: this.localSortAsc })) } catch {}
  }

  setRemoteSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    if (this._colJustResized) return
    this.remoteSortAsc = this.remoteSortBy === f ? !this.remoteSortAsc : true
    this.remoteSortBy = f
    try { this._paneSet('sftp-plus-remote-sort', JSON.stringify({ by: this.remoteSortBy, asc: this.remoteSortAsc })) } catch {}
  }

  // ========== 过滤 ==========

  /** 应用本地过滤（pending → actual）并隐藏输入框 */
  applyLocalFilter(): void {
    this.localFilter = this.localFilterPending
    this.localFilterVisible = false
  }

  /** 清空本地过滤并隐藏输入框 */
  clearLocalFilter(): void {
    this.localFilterPending = ''
    this.localFilter = ''
    this.localFilterVisible = false
  }

  /** 应用远程过滤（pending → actual）并隐藏输入框 */
  applyRemoteFilter(): void {
    this.remoteFilter = this.remoteFilterPending
    this.remoteFilterVisible = false
  }

  /** 清空远程过滤并隐藏输入框 */
  clearRemoteFilter(): void {
    this.remoteFilterPending = ''
    this.remoteFilter = ''
    this.remoteFilterVisible = false
  }

  getFilteredLocalEntries(): LocalEntry[] {
    let entries = [...this.localEntries]
    if (!this.showHiddenLocal) entries = entries.filter(e => !e.name.startsWith('.'))
    if (this.localFilter.trim()) {
      const t = this.localFilter.toLowerCase()
      entries = entries.filter(e => e.name.toLowerCase().includes(t))
    }
    return this.sortLocal(entries)
  }

  getFilteredRemoteEntries(): SFTPFile[] {
    let entries = [...this.remoteEntries]
    if (!this.showHiddenRemote) entries = entries.filter(e => !e.name.startsWith('.'))
    if (this.remoteFilter.trim()) {
      const t = this.remoteFilter.toLowerCase()
      entries = entries.filter(e => e.name.toLowerCase().includes(t))
    }
    return this.sortRemote(entries)
  }

  private sortLocal(entries: LocalEntry[]): LocalEntry[] {
    const f = this.localSortBy
    const asc = this.localSortAsc
    const dir = (a: LocalEntry, b: LocalEntry) => Number(b.isDirectory) - Number(a.isDirectory)
    return entries.sort((a, b) => {
      const d = dir(a, b)
      if (d !== 0) return d
      if (f === 'size') return ((a.size ?? 0) - (b.size ?? 0)) * (asc ? 1 : -1)
      if (f === 'modified') return ((a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)) * (asc ? 1 : -1)
      if (f === 'birthtime') return ((a.birthtimeMs ?? 0) - (b.birthtimeMs ?? 0)) * (asc ? 1 : -1)
      return a.name.localeCompare(b.name) * (asc ? 1 : -1)
    })
  }

  private sortRemote(entries: SFTPFile[]): SFTPFile[] {
    const f = this.remoteSortBy
    const asc = this.remoteSortAsc
    const dir = (a: SFTPFile, b: SFTPFile) => Number(b.isDirectory) - Number(a.isDirectory)
    return entries.sort((a, b) => {
      const d = dir(a, b)
      if (d !== 0) return d
      if (f === 'size') return ((a.size ?? 0) - (b.size ?? 0)) * (asc ? 1 : -1)
      if (f === 'modified') return ((a.modified?.getTime() ?? 0) - (b.modified?.getTime() ?? 0)) * (asc ? 1 : -1)
      if (f === 'birthtime') return 0
      return a.name.localeCompare(b.name) * (asc ? 1 : -1)
    })
  }

  // ========== 打开 ==========
  /** 单击处理：延迟执行选择，避免与双击冲突 */
  onLocalClick(entry: LocalEntry, event: MouseEvent, idx: number): void {
    this.activePane = 'local'
    // 如果刚完成框选操作，忽略此次点击（避免重复选择）
    if (this._rbMoved) { this._rbMoved = false; return }
    if (this.localClickTimer) { clearTimeout(this.localClickTimer) }
    // 延迟 250ms 执行选择逻辑；若触发 dblclick 则取消
    this.localClickTimer = setTimeout(() => {
      this.localClickTimer = null
      this.selectLocal(entry, event, idx)
    }, 250)
  }

  /**
   * 通过 POSIX mode 位判断是否为目录
   * 功能描述：用 (mode & S_IFMT) === S_IFDIR 检测，比 isDirectory 更可靠
   *          因为 Windows SFTP 对 junction/reparse point 目录可能误报 isDirectory = false
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-22
   */
  private isDirByMode(mode: number | undefined): boolean {
    if (mode === undefined) return false
    // POSIX: S_IFMT = 0o170000, S_IFDIR = 0o040000
    return (mode & 0o170000) === 0o040000
  }

  openLocal(e: LocalEntry, $event?: MouseEvent): void {
    // 取消单击计时器
    if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
    if ($event) $event.preventDefault()
    // isDirectory 优先，mode 位作为兜底
    if (!e.isDirectory && !this.isDirByMode(e.mode)) return
    this._pushLocalNav(e.fullPath)
    this.localPath = e.fullPath
    this.localPathInput = e.fullPath
    this.saveCurrentPath()
    void this.refreshLocal()
  }

  /** 远程面板双击进入目录（或文件选择逻辑） */
  openRemote(e: SFTPFile, $event?: MouseEvent): void {
    if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
    if ($event) $event.preventDefault()
    // isDirectory 优先，mode 位作为兜底（Windows SFTP 对 junction/reparse point 目录可能误判）
    if (!this.connected || (!e.isDirectory && !this.isDirByMode(e.mode))) return
    this._pushRemoteNav(e.fullPath)
    this.remotePath = e.fullPath
    this.remotePathInput = e.fullPath
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  /** 远程面板单击处理：延迟执行选择，避免与双击冲突 */
  onRemoteClick(entry: SFTPFile, event: MouseEvent, idx: number): void {
    this.activePane = 'remote'
    if (this._rbMoved) { this._rbMoved = false; return }
    if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer) }
    this.remoteClickTimer = setTimeout(() => {
      this.remoteClickTimer = null
      this.selectRemote(entry, event, idx)
    }, 250)
  }


  // ========== 格式 ==========
  /** 格式化文件大小为人类可读（如 1.5 MB） */
  formatSize(bytes?: number): string {
    if (bytes == null) return ''
    if (bytes === 0) return '0 B'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let v = bytes, i = 0
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
  }

  /** 计算本地选中文件的总大小（含目录不计） */
  formatSelectedSizeLocal(): string {
    const total = this.selectedLocal.reduce((sum, e) => sum + (e.isDirectory ? 0 : (e.size ?? 0)), 0)
    return this.formatSize(total)
  }

  /** 本地选中是否包含目录 */
  selectedHasDirLocal(): boolean {
    return this.selectedLocal.some(e => e.isDirectory)
  }

  /** 计算远程选中文件的总大小（含目录不计） */
  formatSelectedSizeRemote(): string {
    const total = this.selectedRemote.reduce((sum, e) => sum + (e.isDirectory ? 0 : (e.size ?? 0)), 0)
    return this.formatSize(total)
  }

  /** 远程选中是否包含目录 */
  selectedHasDirRemote(): boolean {
    return this.selectedRemote.some(e => e.isDirectory)
  }

  /** 格式化时间戳为 MM-dd HH:mm（替代 DatePipe） */
  formatDate(ms?: number): string {
    if (ms == null) return ''
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  /** 格式化百分比（替代 NumberPipe） */
  formatPercent(n: number): string {
    return Math.round(n).toString()
  }

  /** 格式化日志时间（替代 DatePipe）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-21
   */
  formatLogTime(ts?: number | Date): string {
    if (ts == null) return ''
    const d = ts instanceof Date ? ts : new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  /** 格式化传输记录的起止时间范围 */
  formatLogTimeRange(entry: TransferLogEntry): string {
    const st = entry.startTime || entry.timestamp
    const et = entry.endTime
    if (!et) {
      const d = new Date(st)
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    }
    const ds = new Date(st)
    const de = new Date(et)
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return `${fmt(ds)} → ${fmt(de)}`
  }

  /** 格式化失败原因 */
  formatFailReason(entry: TransferLogEntry): string {
    if (entry.success) return ''
    switch (entry.failReason) {
      case 'cancelled': return this.effectiveLang === 'zh-CN' ? '用户取消' : 'Cancelled'
      case 'interrupted': return this.effectiveLang === 'zh-CN' ? '连接中断' : 'Disconnected'
      default: return this.effectiveLang === 'zh-CN' ? '失败' : 'Failed'
    }
  }

  /**
   * 功能描述：从传输记录中提取文件名（路径最后一段）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  getLogFileName(entry: TransferLogEntry): string {
    // 优先用本地路径的文件名
    if (entry.localPath) {
      const name = entry.localPath.replace(/\\/g, '/').split('/').filter(Boolean).pop()
      if (name) return name
    }
    // 兜底用远程路径的文件名
    if (entry.remotePath) {
      const name = entry.remotePath.replace(/\\/g, '/').split('/').filter(Boolean).pop()
      if (name) return name
    }
    return entry.operation
  }

  /** 格式化耗时（毫秒）为人类可读 */
  formatDuration(ms: number): string {
    if (ms == null || ms < 0) return ''
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const m = Math.floor(ms / 60000)
    const s = Math.round((ms % 60000) / 1000)
    return `${m}m${s}s`
  }

  formatMode(mode: number): string {
    // 将数字模式（如 755）转换为 rwxr-xr-x 格式
    const m = mode & 0o777
    const r = (m & 0o400) ? 'r' : '-'
    const w = (m & 0o200) ? 'w' : '-'
    const x = (m & 0o100) ? 'x' : '-'
    const rg = (m & 0o040) ? 'r' : '-'
    const wg = (m & 0o020) ? 'w' : '-'
    const xg = (m & 0o010) ? 'x' : '-'
    const ro = (m & 0o004) ? 'r' : '-'
    const wo = (m & 0o002) ? 'w' : '-'
    const xo = (m & 0o001) ? 'x' : '-'
    return `${r}${w}${x}${rg}${wg}${xg}${ro}${wo}${xo}`
  }

  /** 将 mode 数字转换为八进制权限字符串（如 644、755） */
  formatOctalMode(mode: number): string {
    return (mode & 0o777).toString(8).padStart(3, '0')
  }

  getExt(name: string): string {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.substring(dot + 1).toLowerCase() : ''
  }

  // ========== 拖拽 ==========
  onDragOver(ev: DragEvent): void { ev.preventDefault() }

  onDragStartLocal(ev: DragEvent, entry: LocalEntry): void {
    // 拖拽开始时清理框选状态，避免拖拽结束后框选逻辑被意外触发
    this._rbCleanup()
    const src = this.selectedLocal.includes(entry) && this.selectedLocal.length ? this.selectedLocal : [entry]
    const p: DragPayload = { kind: 'local-paths', paths: src.map(e => ({ fullPath: e.fullPath, name: e.name, isDirectory: e.isDirectory })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))
  }

  onDragStartRemote(ev: DragEvent, entry: SFTPFile): void {
    if (!this.connected) return
    // 拖拽开始时清理框选状态，避免拖拽结束后框选逻辑被意外触发
    this._rbCleanup()
    const src = this.selectedRemote.includes(entry) && this.selectedRemote.length ? this.selectedRemote : [entry]
    const p: DragPayload = { kind: 'remote-paths', paths: src.map(e => ({ remotePath: e.fullPath, name: e.name, isDirectory: e.isDirectory, size: e.size, mode: e.mode, modified: e.modified?.getTime?.() })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))
  }

  async onDrop(ev: DragEvent, targetPane: 'local' | 'remote'): Promise<void> {
    ev.preventDefault()
    if (!this.connected || !this.sftpSession) return

    // OS 文件拖入
    const osPaths = this.getDroppedOsPaths(ev)
    if (osPaths.length && targetPane === 'remote') {
      for (const p of osPaths) {
        await this.uploadPathToRemote(this.remotePath, p)
      }
      await this.refreshRemote()
      return
    }

    // sftp-plus 自定义拖拽
    const raw = ev.dataTransfer?.getData('application/x-sftp-plus')
    if (!raw) return
    let payload: DragPayload
    try { payload = JSON.parse(raw) } catch { return }

    if (payload.kind === 'local-paths' && targetPane === 'remote') {
      for (const p of payload.paths) {
        await this.uploadPathToRemote(this.remotePath, p.fullPath)
      }
      await this.refreshRemote()
      this.selectedLocal = []
      this.cdr.detectChanges()
    } else if (payload.kind === 'remote-paths' && targetPane === 'local') {
      for (const p of payload.paths) {
        if (p.isDirectory) {
          const localDir = path.join(this.localPath, p.name)
          // 冲突检测：检查本地是否已存在同名目录
          const dirExists = await fs.stat(localDir).then(() => true).catch(() => false)
          if (dirExists) {
            this._conflictQueue.push({
              localPath: localDir,
              remoteDir: path.posix.dirname(p.remotePath),
              fileName: p.name,
              remotePath: p.remotePath,
              localStat: { size: 0, mtimeMs: Date.now() } as fsSync.Stats,
              direction: 'download',
              isDirectory: true,
            })
            this.conflictOriginalTotal = this._conflictQueue.length
            this._showConflictDialog()
            this.selectedRemote = []
            this.cdr.detectChanges()
            continue
          }
          await this.downloadRemoteDir(p.remotePath, this.localPath, targetPane)
        } else {
          const localPath = path.join(this.localPath, p.name)
          const remoteMtime = p.modified ?? Date.now()
          // 冲突检测：检查本地是否已存在同名文件
          const conflict = await this._checkLocalConflict(localPath, p.size ?? 0, remoteMtime)
          if (conflict) {
            this._conflictQueue.push({
              localPath,
              remoteDir: path.posix.dirname(p.remotePath),
              fileName: p.name,
              remotePath: p.remotePath,
              localStat: { size: conflict.localSize, mtimeMs: conflict.localMtime } as fsSync.Stats,
              direction: 'download',
              remoteFileSize: p.size ?? 0,
              remoteFileMtime: remoteMtime,
            })
            this.conflictOriginalTotal = this._conflictQueue.length
            this._showConflictDialog()
            // 先清除选中状态，避免对话框关闭后底部还显示"已选择"
            this.selectedRemote = []
            this.cdr.detectChanges()
            // 不阻塞后续文件入队列
            continue
          }
          await this._doDownload(p.remotePath, localPath, p.mode, p.size)
        }
      }
      await this.refreshLocal()
      this.selectedRemote = []
      this.cdr.detectChanges()
    }
  }

  private getDroppedOsPaths(ev: DragEvent): string[] {
    const dt = ev.dataTransfer
    if (!dt) return []
    const fps = Array.from(dt.files ?? []).map(f => (f as any).path as string | undefined).filter(Boolean) as string[]
    if (fps.length) return fps
    const uriList = dt.getData('text/uri-list') || ''
    return uriList.split(/\r?\n/g).map(x => x.trim()).filter(x => x && !x.startsWith('#'))
      .map(x => x.startsWith('file://') ? decodeURIComponent(x.replace(/^file:\/\//, '')) : x)
  }

  // ========== 文件夹传输进度 ==========

  /** 递归计算本地目录总大小 */
  private async _calcLocalDirSize(dirPath: string): Promise<number> {
    let size = 0
    try {
      for (const item of await fs.readdir(dirPath, { withFileTypes: true })) {
        const p = path.join(dirPath, item.name)
        if (item.isDirectory()) {
          size += await this._calcLocalDirSize(p)
        } else {
          const st = await fs.stat(p).catch(() => null)
          if (st) size += st.size
        }
      }
    } catch {}
    return size
  }

  /** 递归计算本地目录文件数 */
  private async _countLocalDirItems(dirPath: string): Promise<number> {
    let count = 0
    try {
      for (const item of await fs.readdir(dirPath, { withFileTypes: true })) {
        if (item.isDirectory()) {
          count += await this._countLocalDirItems(path.join(dirPath, item.name))
        } else {
          count++
        }
      }
    } catch {}
    return count
  }

  /** 递归计算远程目录总大小（需要 sftpSession） */
  private async _calcRemoteDirSize(remotePath: string): Promise<number> {
    if (!this.sftpSession) return 0
    let size = 0
    try {
      const entries = await this.sftpSession.readdir(remotePath)
      for (const e of entries) {
        if (e.isDirectory) {
          size += await this._calcRemoteDirSize(path.posix.join(remotePath, e.name))
        } else {
          size += e.size || 0
        }
      }
    } catch {}
    return size
  }

  /** 递归计算远程目录文件数 */
  private async _countRemoteDirItems(remotePath: string): Promise<number> {
    if (!this.sftpSession) return 0
    let count = 0
    try {
      const entries = await this.sftpSession.readdir(remotePath)
      for (const e of entries) {
        if (e.isDirectory) {
          count += await this._countRemoteDirItems(path.posix.join(remotePath, e.name))
        } else {
          count++  // 包括 0 字节文件
        }
      }
    } catch {}
    return count
  }

  /** 开始一个文件夹传输（创建进度条目和初始日志） */
  private _startFolderTransfer(
    name: string, direction: 'upload' | 'download',
    remotePath: string, localPath: string,
    totalSize: number, itemCount: number,
  ): { transferEntry: typeof this.transfers[0]; startTime: number; logEntryId: string } {
    const logEntry = this.transferLog.add({
      operation: direction,
      localPath,
      remotePath,
      profileName: this.profile?.name || '',
      success: true,
      size: totalSize,
      duration: 0,
      startTime: Date.now(),
    })
    const transferEntry = {
      transfer: null, direction, name, remotePath, localPath,
      percent: 0, speed: '', bytesDone: 0, bytesTotal: totalSize,
      paused: false, logEntryId: logEntry.id,
      isFolder: true, currentItem: '', itemCount, itemDone: 0,
    } as typeof this.transfers[0]
    this.transfers.push(transferEntry)
    this.transfersMinimized = false  // 新文件夹传输自动展开面板
    this.transfersHidden = false
    this.cdr.detectChanges()
    return { transferEntry, startTime: Date.now(), logEntryId: logEntry.id }
  }

  /** 更新文件夹传输进度 */
  private _updateFolderProgress(
    t: typeof this.transfers[0], bytesDone: number, currentItem: string, itemDone: number,
    currentItemSize?: number,
  ): void {
    // 暂停中不更新（用户暂停后当前文件可能刚好完成）
    if (t.paused) return
    t.bytesDone = bytesDone
    t.currentItem = currentItem
    t.currentItemSize = currentItemSize
    t.itemDone = itemDone
    t.percent = t.bytesTotal > 0 ? Math.min(100, Math.round((bytesDone / t.bytesTotal) * 100)) : 0
    // 简易速度：每 500ms 刷新一次
    const now = Date.now()
    const lastUpdate = (t as any)._lastSpeedUpdate || 0
    const lastBytes = (t as any)._lastBytes || 0
    if (now - lastUpdate >= 500) {
      const deltaBytes = bytesDone - lastBytes
      const deltaTime = Math.max(1, now - lastUpdate)
      t.speed = this._formatSpeed(deltaBytes, deltaTime)
      ;(t as any)._lastSpeedUpdate = now
      ;(t as any)._lastBytes = bytesDone
    }
    this.cdr.detectChanges()
  }

  /** 完成文件夹传输 */
  private _finishFolderTransfer(
    t: typeof this.transfers[0], startTime: number, logEntryId: string, success: boolean,
  ): void {
    this.transfers = this.transfers.filter(x => x !== t)
    const now = Date.now()
    this.transferLog.update(logEntryId, { success, duration: now - startTime, endTime: now })
  }

  // ========== 传输 ==========
  /**
   * 功能描述：上传文件/目录到远程，带冲突检测和进度显示。
   *   目录 → 预计算大小，显示文件夹级进度条和当前文件
   *   单文件 → 用 _doUpload 走 trackTransfer 进度
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 集成文件夹进度追踪
   */
  private async uploadPathToRemote(
    remoteDir: string, localPath: string,
    _top?: { t: typeof this.transfers[0]; startTime: number; logEntryId: string; bytesDone: number; itemDone: number },
  ): Promise<void> {
    if (!this.sftpSession) return
    const st = await fs.stat(localPath).catch(() => null)
    if (!st) return
    const base = path.basename(localPath)
    const rt = path.posix.join(remoteDir, base)

    const isTop = !_top

    if (st.isDirectory()) {
      // 顶层目录：预计算大小并创建进度条目
      if (isTop) {
        const [totalSize, itemCount] = await Promise.all([
          this._calcLocalDirSize(localPath),
          this._countLocalDirItems(localPath),
        ])
        const { transferEntry: t, startTime, logEntryId } = this._startFolderTransfer(
          base, 'upload', rt, localPath, totalSize, itemCount)
        _top = { t, startTime, logEntryId, bytesDone: 0, itemDone: 0 }
      }
      try { await this.sftpSession.mkdir(rt) } catch {}
      const children = await fs.readdir(localPath)
      for (const c of children) {
        // 检查是否被用户取消/暂停
        if ((_top?.t as any)?._aborted) break
        while ((_top?.t as any)?._paused) {
          await new Promise(r => setTimeout(r, 200))
          if ((_top?.t as any)?._aborted) break
        }
        if ((_top?.t as any)?._aborted) break
        await this.uploadPathToRemote(rt, path.join(localPath, c), _top)
      }
      if (isTop) {
        this._finishFolderTransfer(_top!.t, _top!.startTime, _top!.logEntryId, true)
      }
      return
    }

    // 冲突检测：检查远程是否已存在同名文件
    const conflict = await this._checkConflict(rt, st.size, st.mtimeMs)
    if (conflict) {
      // 有冲突 → 入队列，弹出对话框
      this._conflictQueue.push({ localPath, remoteDir, fileName: base, remotePath: rt, localStat: st, direction: 'upload' })
      this.conflictOriginalTotal = this._conflictQueue.length
      this._showConflictDialog()
      // 顶层单文件且无冲突队列中的其他文件时，仍需写一条日志？不——冲突由对话框接管
      return
    }

    if (isTop) {
      // 顶层单文件：走正常 trackTransfer 进度
      await this._doUpload(rt, localPath)
    } else {
      // 目录内子文件：不记日志，仅更新文件夹进度
      await this._doUploadRaw(rt, localPath)
      // 检查：用户是否取消了当前文件（⏹）
      if ((_top?.t as any)?._abortCurrent) {
        delete (_top?.t as any)._abortCurrent
        return  // skip progress update for this file
      }
      if (st.size > 0 && _top) {
        _top.bytesDone += st.size
        _top.itemDone++
        this._updateFolderProgress(_top.t, _top.bytesDone, base, _top.itemDone, st.size)
      }
    }
  }

  /**
   * 功能描述：检查远程文件是否存在且有差异
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  private async _checkConflict(remotePath: string, localSize: number, localMtime: number): Promise<ConflictFileInfo | null> {
    if (!this.sftpSession) return null
    try {
      const parentDir = path.posix.dirname(remotePath)
      const fileName = path.basename(remotePath)
      // 使用 readdir 检查远程文件是否存在
      const entries = await this.sftpSession.readdir(parentDir)
      const found = entries.find(e => e.name === fileName)
      if (found) {
        return {
          localPath: remotePath,
          remotePath,
          fileName,
          localSize,
          remoteSize: found.size ?? 0,
          localMtime,
          remoteMtime: found.modified?.getTime?.() ?? 0,
          remoteDir: parentDir,
          direction: 'upload',
          isSamePane: false,
        }
      }
    } catch { /* 文件不存在或无权限，不冲突 */ }
    return null
  }

  /**
   * 功能描述：检查本地是否存在同名文件（用于下载冲突检测）
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   */
  private async _checkLocalConflict(localPath: string, remoteSize: number, remoteMtime: number): Promise<ConflictFileInfo | null> {
    try {
      const st = await fs.stat(localPath)
      // 本地文件存在，返回冲突信息
      return {
        localPath,
        remotePath: localPath,
        fileName: path.basename(localPath),
        localSize: st.size,
        remoteSize,
        localMtime: st.mtimeMs,
        remoteMtime,
        remoteDir: path.dirname(localPath),
        direction: 'download',
        isSamePane: false,
      }
    } catch { /* 文件不存在，不冲突 */ }
    return null
  }

  /**
   * 功能描述：不检测冲突，直接上传
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  private async _doUpload(remotePath: string, localPath: string): Promise<void> {
    if (!this.sftpSession) return
    const up = new LocalPathFileUpload(localPath)
    this.trackTransfer(up, 'upload', remotePath, localPath)
    try {
      await this.sftpSession.upload(remotePath, up as any)
      console.log('[SFTP+] Upload completed:', localPath)
    } catch (e) {
      console.error('[SFTP+] Upload failed', remotePath, e)
      const name = path.basename(localPath)
      const msg = this.effectiveLang === 'zh-CN'
        ? `上传失败: ${name}`
        : `Upload failed: ${name}`
      try { this.notifications?.error?.(msg, '') } catch {}
    }
  }

  /** 上传文件（不记录传输日志，文件夹内部使用） */
  private async _doUploadRaw(remotePath: string, localPath: string): Promise<void> {
    if (!this.sftpSession) return
    const up = new LocalPathFileUpload(localPath)
    try {
      await this.sftpSession.upload(remotePath, up as any)
    } catch (e) {
      console.error('[SFTP+] Upload failed (raw)', remotePath, e)
    }
  }

  /**
   * 功能描述：下载远程文件到本地，不检测冲突（冲突已在前置步骤处理）
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   */
  private async _doDownload(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void> {
    if (!this.sftpSession) return
    const sz = size ?? 0
    // 空文件：直接创建空文件，否则 LocalPathFileDownload(Math.max(0,1)) 会卡住
    if (sz === 0) {
      try {
        const fd = await fs.open(localPath, 'w')
        await fd.close()
      } catch {}
      // 仍记录传输日志（trackTransfer 内部对 size=0 只写日志不跟踪进度）
      const dl = new LocalPathFileDownload(localPath, mode ?? 0o644, 0)
      this.trackTransfer(dl, 'download', remotePath, localPath)
      return
    }
    const dl = new LocalPathFileDownload(localPath, mode ?? 0o644, sz)
    this.trackTransfer(dl, 'download', remotePath, localPath)
    try {
      await this.sftpSession.download(remotePath, dl)
      console.log('[SFTP+] Download completed:', remotePath)
    } catch (e) {
      console.error('[SFTP+] Download failed', remotePath, e)
      const name = path.basename(remotePath)
      const msg = this.effectiveLang === 'zh-CN'
        ? `下载失败: ${name}`
        : `Download failed: ${name}`
      try { this.notifications?.error?.(msg, '') } catch {}
    }
  }

  /** 下载文件（不记录传输日志，文件夹内部使用） */
  private async _doDownloadRaw(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void> {
    if (!this.sftpSession) return
    const sz = size ?? 0
    // 空文件：直接创建空文件，不走 SFTP download（否则 LocalPathFileDownload 会卡住）
    if (sz === 0) {
      try {
        const fd = await fs.open(localPath, 'w')
        await fd.close()
      } catch {}
      return
    }
    const dl = new LocalPathFileDownload(localPath, mode ?? 0o644, sz)
    try {
      await this.sftpSession.download(remotePath, dl)
    } catch (e) {
      console.error('[SFTP+] Download failed (raw)', remotePath, e)
    }
  }

  // ========== 冲突处理 ==========

  /**
   * 功能描述：显示冲突对话框（仅当有等待处理的冲突项时）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Deepseek-V4-Flash
   * 修改时间：2026-06-25 — 支持下载方向的冲突，不再重复获取远程信息（下载已携带）
   */
  private _showConflictDialog(): void {
    const item = this._conflictQueue[0]
    if (!item) return
    // 更新计数器（使用原始总数，不受队列缩短影响）
    this.conflictTotalIdx = this.conflictOriginalTotal
    this.conflictCurrIdx = this.conflictOriginalTotal - this._conflictQueue.length + 1

    if (this.showConflictDialog) {
      // 对话框已显示，只更新计数（后续文件入队后刷新总数）
      this.cdr.detectChanges()
      return
    }
    // 显示第一条冲突
    this.conflictData = {
      localPath: item.localPath,
      remotePath: item.remotePath,
      fileName: item.fileName,
      localSize: item.localStat.size,
      remoteSize: item.remoteFileSize ?? 0,
      localMtime: item.localStat.mtimeMs,
      remoteMtime: item.remoteFileMtime ?? 0,
      remoteDir: item.remoteDir,
      direction: item.direction,
      isSamePane: item.isSamePane ?? false,
      isDirectory: item.isDirectory ?? false,
    }
    // 对于上传方向，补充获取远程文件信息
    if (item.direction === 'upload' && this.sftpSession) {
      this.sftpSession.readdir(item.remoteDir).then(entries => {
        // 检查对话框是否仍可见（用户可能已关闭）
        if (!this.showConflictDialog || !this.conflictData) return
        const found = entries.find(e => e.name === item.fileName)
        if (found && this.conflictData) {
          this.conflictData.remoteSize = found.size ?? 0
          this.conflictData.remoteMtime = found.modified?.getTime?.() ?? 0
          this.cdr.detectChanges()
        }
      }).catch(() => {})
    }
    this.showConflictDialog = true
    this.cdr.detectChanges()
  }

  /**
   * 功能描述：用户点击冲突对话框的操作
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  resolveConflict(action: string): void {
    this.showConflictDialog = false

    // 处理"全部"类操作
    if (action === 'overwrite-all') { this._conflictAllMode = 'overwrite'; action = 'overwrite' }
    else if (action === 'skip-all') { this._conflictAllMode = 'skip'; action = 'skip' }
    else if (action === 'rename-all') { this._conflictAllMode = 'rename'; action = 'rename' }

    // 处理当前冲突
    const current = this._conflictQueue.shift()
    if (!current) { this._processNextConflict(); return }

    void this._applyConflictAction(current, action)
  }

  /**
   * 功能描述：对单个冲突项执行操作
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  private async _applyConflictAction(
    item: { localPath: string; remoteDir: string; fileName: string; remotePath: string; localStat: fsSync.Stats; direction: 'upload' | 'download'; remoteFileSize?: number; remoteFileMtime?: number; isSamePane?: boolean; samePaneSource?: 'local' | 'remote'; isDirectory?: boolean },
    action: string,
  ): Promise<void> {
    // 记录已处理的冲突文件名，供粘贴过滤用
    this._conflictResolvedNames.add(item.fileName)
    switch (action) {
      case 'cancel':
        // 取消所有：清空队列，恢复剪贴板状态以便用户重新粘贴
        this._conflictQueue = []
        this.clipboardEntries = this._pendingPasteEntries.slice()
        this.clipboardSource = this._pendingPasteSource
        this.clipboardMode = this._pendingPasteMode
        this._pendingPasteEntries = []
        this._conflictResolvedNames.clear()
        return
      case 'skip':
        // 什么也不做（由粘贴时过滤跳过）
        break
      case 'overwrite':
        if (item.isDirectory) {
          // 目录冲突：直接覆盖下载（保留本地已有但远程不存在的文件，不删除重建）
          await this.downloadRemoteDir(item.remotePath, path.dirname(item.localPath), 'local')
        } else if (item.isSamePane) {
          await this._handleSamePaneConflictOverwrite(item)
        } else if (item.direction === 'download') {
          await this._doDownload(item.remotePath, item.localPath, 0o644, item.remoteFileSize)
        } else {
          await this._doUpload(item.remotePath, item.localPath)
        }
        break
      case 'rename': {
        // 加上时间戳重命名
        if (item.isDirectory) {
          // 目录：创建新目录名并下载到新位置（不触碰已存在的本地目录）
          const newName = `${item.fileName}_${Date.now().toString(36).toUpperCase()}`
          await this.downloadRemoteDir(item.remotePath, path.dirname(item.localPath), 'local', undefined, newName)
          break
        }
        const ext = path.extname(item.fileName)
        const nameNoExt = path.basename(item.fileName, ext)
        const newName = `${nameNoExt}_${Date.now().toString(36).toUpperCase()}${ext}`
        if (item.isSamePane) {
          await this._handleSamePaneConflictRename(item, newName)
        } else if (item.direction === 'download') {
          const newLocal = path.join(path.dirname(item.localPath), newName)
          await this._doDownload(item.remotePath, newLocal, 0o644, item.remoteFileSize)
        } else {
          const newRemote = path.posix.join(item.remoteDir, newName)
          await this._doUpload(newRemote, item.localPath)
        }
        break
      }
    }
    this._processNextConflict()
  }

  /** 同面板冲突 — 覆盖：将源文件复制到目标位置 */
  private async _handleSamePaneConflictOverwrite(
    item: { localPath: string; remotePath: string; isSamePane?: boolean; samePaneSource?: 'local' | 'remote' }
  ): Promise<void> {
    const src = item.remotePath  // source path
    const dest = item.localPath  // destination path (where the conflict is)
    if (item.samePaneSource === 'local') {
      // 本地 → 本地：直接复制覆盖
      try {
        const st = await fs.stat(src)
        if (st.isDirectory()) {
          await this.copyLocalDir(src, dest)
        } else {
          await fs.copyFile(src, dest)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane overwrite failed', e)
      }
    } else {
      // 远程 → 远程：通过 SFTP 操作
      if (!this.sftpSession) return
      try {
        const entries = await this.sftpSession.readdir(src)
        const isDir = entries && entries.length > 0
        // 远程文件复制使用 copyRemoteDir（需先确认类型）
        // 对于远程→远程，我们需要确认源是否为目录
        const parentDir = path.posix.dirname(src)
        const baseName = path.posix.basename(src)
        const parentEntries = await this.sftpSession.readdir(parentDir)
        const srcEntry = parentEntries.find(e => e.name === baseName)
        if (srcEntry) {
          await this.copyRemoteDir(src, dest, srcEntry.isDirectory)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane remote overwrite failed', e)
      }
    }
  }

  /** 同面板冲突 — 重命名：将源文件以新名称复制到目标目录 */
  private async _handleSamePaneConflictRename(
    item: { localPath: string; remotePath: string; isSamePane?: boolean; samePaneSource?: 'local' | 'remote' },
    newName: string,
  ): Promise<void> {
    const src = item.remotePath  // source path
    const destDir = path.dirname(item.localPath)
    const dest = path.join(destDir, newName)
    if (item.samePaneSource === 'local') {
      try {
        const st = await fs.stat(src)
        if (st.isDirectory()) {
          await this.copyLocalDir(src, dest)
        } else {
          await fs.copyFile(src, dest)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane rename failed', e)
      }
    } else {
      if (!this.sftpSession) return
      try {
        const parentDir = path.posix.dirname(src)
        const baseName = path.posix.basename(src)
        const parentEntries = await this.sftpSession.readdir(parentDir)
        const srcEntry = parentEntries.find(e => e.name === baseName)
        if (srcEntry) {
          const destRemote = path.posix.join(destDir, newName)
          await this.copyRemoteDir(src, destRemote, srcEntry.isDirectory)
        }
      } catch (e) {
        console.error('[SFTP+] Same-pane remote rename failed', e)
      }
    }
  }

  /**
   * 功能描述：处理队列中的下一个冲突
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  private _processNextConflict(): void {
    if (this._conflictQueue.length === 0) {
      // 所有冲突处理完毕
      this._conflictAllMode = 'ask'
      this.conflictOriginalTotal = 1
      this.selectedLocal = []
      this.selectedRemote = []
      // 如果有待执行的粘贴操作，继续执行（跳过已冲突的文件由用户决定）
      if (this._pendingPasteEntries.length > 0) {
        const entries = this._pendingPasteEntries
        const destPane = this._pendingPasteDestPane
        const destPath = this._pendingPasteDestPath
        const mode = this._pendingPasteMode
        const source = this._pendingPasteSource
        this._pendingPasteEntries = []
        this._pendingPasteDestPane = 'local'
        this._pendingPasteDestPath = ''
        this._pendingPasteMode = 'copy'
        this._pendingPasteSource = 'local'
        // 只执行无冲突的文件（已被 _applyConflictAction 处理过的会跳过）
        void this._executePaste(entries.filter(e => !this._conflictResolvedNames.has(e.name)), destPane, destPath, mode, source)
        this._conflictResolvedNames.clear()
      } else {
        void this.refreshRemote()
        void this.refreshLocal()
      }
      this.cdr.detectChanges()
      return
    }

    // 如果有全部模式，自动应用
    if (this._conflictAllMode !== 'ask') {
      const item = this._conflictQueue.shift()
      if (item) void this._applyConflictAction(item, this._conflictAllMode)
      return
    }

    // 显示下一个冲突对话框
    this._showConflictDialog()
  }

  private trackTransfer(t: any, direction: 'upload' | 'download', remotePath: string, localPath: string): void {
    const sz = t.getSize?.() || 0
    const profileName = this.profile?.name || ''
    console.log('[SFTP+][trackTransfer] called', { direction, localPath, remotePath, size: sz })

    // 立即写入传输日志（保证不遗漏），无论后续结果如何都先记录
    const logEntry = this.transferLog.add({
      operation: direction,
      localPath,
      remotePath,
      profileName,
      success: true,
      size: sz,
      duration: 0,
      startTime: Date.now(),
    })
    console.log('[SFTP+][trackTransfer] log entry added, id=', logEntry.id, 'total logs=', this.transferLog.getAll().length)

    // 空文件或无需进度追踪的情况，直接返回
    if (sz === 0) return

    // 进度追踪仅用于 UI 底部进度条显示
    const entry = { transfer: t, direction, name: t.getName(), remotePath, localPath, percent: 0, speed: '', bytesDone: 0, bytesTotal: sz, logEntryId: logEntry.id, paused: false }
    this.transfers.push(entry)
    this.transfersMinimized = false  // 新传输自动展开面板
    this.transfersHidden = false
    const startTime = Date.now()
    let prevBytes = 0
    let prevTime = startTime
    const timer = setInterval(() => {
      try {
        // 连接断开时：仅清理非暂停的传输，暂停的传输保留以待重连后恢复
        if (!this.connected) {
          if (!t.paused) {
            clearInterval(timer)
            this.transfers = this.transfers.filter(x => x !== entry)
            this.transferLog.update(logEntry.id, { success: false, duration: Date.now() - startTime, endTime: Date.now(), failReason: 'interrupted' })
          }
          return
        }
        if (t.paused) {
          entry.speed = ''
          return
        }
        const done = t.getCompletedBytes?.() || 0
        const newPercent = Math.min(100, Math.round((done / sz) * 100))
        entry.bytesDone = done
        // 计算速度（每 1s 采样一次，避免短时间波动）
        const now = Date.now()
        const elapsed = now - prevTime
        if (elapsed >= 1000 && !t.paused) {
          const delta = done - prevBytes
          entry.speed = this._formatSpeed(delta, elapsed)
          prevBytes = done
          prevTime = now
        }
        if (newPercent !== entry.percent) {
          entry.percent = newPercent
          this.cdr.detectChanges()
        } else if (elapsed >= 1000) {
          this.cdr.detectChanges()
        }
        // 30 分钟超时保护
        if (Date.now() - startTime > 1800000) {
          clearInterval(timer)
          this.transfers = this.transfers.filter(x => x !== entry)
          this.transferLog.update(logEntry.id, { success: false, duration: Date.now() - startTime, endTime: Date.now(), failReason: 'error' })
          return
        }
        if (t.isComplete?.() || t.isCancelled?.() || entry.percent >= 100) {
          clearInterval(timer)
          this.transfers = this.transfers.filter(x => x !== entry)
          const finalSuccess = !t.isCancelled?.()
          this.transferLog.update(logEntry.id, { success: finalSuccess, duration: Date.now() - startTime, endTime: Date.now(), failReason: finalSuccess ? undefined : 'error' })
        }
      } catch {
        clearInterval(timer)
        this.transfers = this.transfers.filter(x => x !== entry)
        this.transferLog.update(logEntry.id, { success: false, duration: Date.now() - startTime, endTime: Date.now(), failReason: 'error' })
      }
    }, 200)
  }

  cancelTransfer(entry: { transfer: any; logEntryId?: string; paused?: boolean; isFolder?: boolean }): void {
    if (entry.transfer) {
      try {
        if (typeof entry.transfer.cancel === 'function') entry.transfer.cancel()
        else if (typeof entry.transfer.destroy === 'function') entry.transfer.destroy()
      } catch {}
    }
    // 文件夹传输：设置中断标记，让内部循环感知并终止
    if (entry.isFolder) {
      (entry as any)._aborted = true
    }
    this.transfers = this.transfers.filter(x => x !== entry)
    // 更新日志：取消操作标记为失败
    if (entry.logEntryId != null) {
      this.transferLog.update(entry.logEntryId, { success: false, endTime: Date.now(), failReason: 'cancelled' })
    }
  }

  /** 取消当前文件（文件夹：仅跳过此文件，循环继续） */
  cancelCurrentFile(entry: { isFolder?: boolean }): void {
    if (entry.isFolder) {
      (entry as any)._abortCurrent = true
    }
  }

  /** 暂停传输 */
  pauseTransfer(entry: any): void {
    if (entry.paused) return
    // 文件夹传输：设置暂停标记，循环内检查
    if (entry.isFolder) {
      (entry as any)._paused = true
      entry.paused = true
      this.cdr.detectChanges()
      return
    }
    // 单文件传输：调用底层 pause
    try {
      const offset = entry.transfer.pause?.() ?? 0
      this.zone.run(() => { entry.paused = true })
      entry._pauseOffset = offset
      // 注意：不调用 cancel()，避免将 transfer 标记为 cancelled=true
      // 底层 SFTP 操作会因 adapter 的 fd 已关闭而自然终止
      console.log(`[SFTP+] Transfer paused: ${entry.name} at offset ${offset}`)
    } catch (e) {
      console.error('[SFTP+] Pause failed', e)
    }
  }

  /** 继续传输（断点续传） */
  async resumeTransfer(entry: any): Promise<void> {
    if (!entry.paused) return
    // 文件夹传输：清除暂停标记，循环继续
    if (entry.isFolder) {
      delete (entry as any)._paused
      this.zone.run(() => { entry.paused = false })
      this.cdr.detectChanges()
      return
    }
    // 单文件传输：断点续传
    try {
      this.zone.run(() => { entry.paused = false })
      // 优先使用 pause() 时保存的偏移量，回退到 getCompletedBytes()
      const offset = entry._pauseOffset ?? entry.transfer.getCompletedBytes?.() ?? 0
      const direction = entry.direction as 'upload' | 'download'
      const remotePath = entry.remotePath as string
      const localPath = entry.localPath as string
      const info = await this._resumeTransfer(entry, direction, remotePath, localPath, offset)
      // 将新的 transfer 对象存入条目
      this.zone.run(() => {
        entry.transfer = info.transfer
        entry.percent = info.percent
      })
      delete entry._pauseOffset
      console.log(`[SFTP+] Transfer resumed: ${entry.name} from offset ${offset}`)
    } catch (e) {
      console.error('[SFTP+] Resume failed', e)
      entry.paused = true // 恢复失败，保持暂停状态
    }
  }

  /**
   * 内部：执行续传操作
   * 功能描述：用新的 transfer 适配器从指定 offset 继续传输
   *           优先尝试原始 ssh2 SFTP createReadStream/createWriteStream
   *           （支持 start 偏移，实现真断点续传），否则回退到标准 upload/download
   */
  private async _resumeTransfer(
    entry: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    offset: number,
  ): Promise<{ transfer: any; percent: number }> {
    if (!this.sftpSession) throw new Error('No SFTP session')
    const totalSize = entry.transfer.getSize?.() || 0
    const percent = totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 0
    const rawSftp = this.sftpSession as any
    const hasRawStream = direction === 'upload'
      ? typeof rawSftp.createWriteStream === 'function'
      : typeof rawSftp.createReadStream === 'function'

    if (direction === 'upload') {
      const up = new LocalPathFileUpload(localPath, offset)
      if (hasRawStream) {
        this._rawUpload(rawSftp, remotePath, up, offset)
      } else {
        // 回退：标准 upload（从头传），本地 read 从 offset 开始
        this.sftpSession.upload(remotePath, up as any).catch(e => {
          if (!up.isCancelled?.()) console.error('[SFTP+] Resume upload failed', e)
        })
      }
      return { transfer: up, percent }
    } else {
      const dl = new LocalPathFileDownload(
        localPath, entry.transfer.getMode?.() || 0o644, totalSize, offset,
      )
      if (hasRawStream) {
        this._rawDownload(rawSftp, remotePath, dl, offset)
      } else {
        // 回退：标准 download（从头传）
        this.sftpSession.download(remotePath, dl as any).catch(e => {
          if (!dl.isCancelled?.()) console.error('[SFTP+] Resume download failed', e)
        })
      }
      return { transfer: dl, percent }
    }
  }

  /**
   * 用原始 ssh2 SFTP createWriteStream 实现断点续传上传
   */
  private _rawUpload(rawSftp: any, remotePath: string, up: LocalPathFileUpload, offset: number): void {
    const writeStream = rawSftp.createWriteStream(remotePath, { start: offset })
    const readNext = () => {
      up.read().then(buf => {
        if (up.isCancelled?.()) { writeStream.destroy(); return }
        if (buf.length === 0) { writeStream.end(); return }
        writeStream.write(buf, () => readNext())
      }).catch(e => {
        console.error('[SFTP+] Raw upload read error', e)
        writeStream.destroy()
      })
    }
    writeStream.on('error', (err: Error) => {
      if (!up.isCancelled?.()) console.error('[SFTP+] Raw upload stream error', err)
    })
    readNext()
  }

  /**
   * 用原始 ssh2 SFTP createReadStream 实现断点续传下载
   */
  private _rawDownload(rawSftp: any, remotePath: string, dl: LocalPathFileDownload, offset: number): void {
    const dir = path.dirname(dl.targetPath)
    if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true })
    // 续传用 r+（追加），首次下载用 w（新建）
    const flags = offset > 0 ? 'r+' : 'w'
    let localFd: number | null = null
    let fdClosed = false
    const closeFd = () => {
      if (localFd !== null && !fdClosed) {
        try { fsSync.closeSync(localFd) } catch {}
        fdClosed = true
        localFd = null
      }
    }
    try {
      localFd = fsSync.openSync(dl.targetPath, flags)
      if (offset > 0) fsSync.ftruncateSync(localFd, offset)
    } catch (e) {
      console.error('[SFTP+] Raw download open error', e)
      // 标记传输完成，防止进度计时器无限运行
      try { (dl as any)._markComplete?.() } catch {}
      return
    }
    const readStream = rawSftp.createReadStream(remotePath, { start: offset })
    readStream.on('data', (chunk: Buffer) => {
      try {
        if (fdClosed || localFd === null) { readStream.destroy(); return }
        fsSync.writeSync(localFd, chunk)
        dl.increaseProgress(chunk.length)
        if (dl.isCancelled?.()) {
          readStream.destroy()
          closeFd()
        }
      } catch (e) {
        console.error('[SFTP+] Raw download write error', e)
        closeFd()
        readStream.destroy()
      }
    })
    readStream.on('end', () => {
      closeFd()
      dl._markComplete()
    })
    readStream.on('error', (err: Error) => {
      closeFd()
      if (!dl.isCancelled?.()) console.error('[SFTP+] Raw download stream error', err)
    })
  }

  /** 关闭整个传输面板 */
  clearTransfers(): void {
    for (const t of this.transfers) {
      if (t.transfer) {
        try {
          if (typeof t.transfer.cancel === 'function') t.transfer.cancel()
          else if (typeof t.transfer.destroy === 'function') t.transfer.destroy()
        } catch {}
      }
    }
    this.transfers = []
  }

  // ========== 权限编辑对话框 ==========
  openPermDialog(entry: SFTPFile): void {
    this.permTargetPath = entry.fullPath
    const m = entry.mode & 0o777
    this.permOwnerRead = (m & 0o400) !== 0
    this.permOwnerWrite = (m & 0o200) !== 0
    this.permOwnerExec = (m & 0o100) !== 0
    this.permGroupRead = (m & 0o040) !== 0
    this.permGroupWrite = (m & 0o020) !== 0
    this.permGroupExec = (m & 0o010) !== 0
    this.permOtherRead = (m & 0o004) !== 0
    this.permOtherWrite = (m & 0o002) !== 0
    this.permOtherExec = (m & 0o001) !== 0
    this.updatePermMode()
    this.showPermDialog = true
  }

  updatePermMode(): void {
    let m = 0
    if (this.permOwnerRead) m |= 0o400
    if (this.permOwnerWrite) m |= 0o200
    if (this.permOwnerExec) m |= 0o100
    if (this.permGroupRead) m |= 0o040
    if (this.permGroupWrite) m |= 0o020
    if (this.permGroupExec) m |= 0o010
    if (this.permOtherRead) m |= 0o004
    if (this.permOtherWrite) m |= 0o002
    if (this.permOtherExec) m |= 0o001
    this.permModePreview = m.toString(8).padStart(3, '0')
  }

  confirmPermDialog(): void {
    if (!this.permTargetPath || !this.sftpSession) return
    const m = parseInt(this.permModePreview, 8)
    this.sftpSession.chmod(this.permTargetPath, m)
      .then(() => this.refreshRemote())
      .catch(e => console.error('[SFTP+] chmod failed', e))
    this.showPermDialog = false
    this.permTargetPath = ''
  }

  cancelPermDialog(): void {
    this.showPermDialog = false
    this.permTargetPath = ''
  }

  // ========== 文件操作 ==========
  localNewFolder(): void { this.openInputDialog('local-mkdir', this.i18n.t('app.newFolder'), this.i18n.t('app.newFolder'), '', this.localPath) }
  localNewFile(): void { this.openInputDialog('local-touch', this.i18n.t('app.newFile'), this.i18n.t('app.newFile'), '', this.localPath) }
  localRename(): void {
    if (this.selectedLocal.length !== 1) return
    this.openInputDialog('local-rename', this.i18n.t('app.rename'), this.i18n.t('app.rename'), this.selectedLocal[0].name, this.selectedLocal[0].fullPath)
  }
  localDelete(): void {
    if (!this.selectedLocal.length) return
    this.pendingLocalDelete = this.selectedLocal.slice()
    this.prepareDeleteConfirm(this.selectedLocal)
    this.deleteConfirmVisible = true
  }
  remoteNewFolder(): void {
    if (!this.connected) return
    this.openInputDialog('remote-mkdir', this.i18n.t('app.newFolder'), this.i18n.t('app.newFolder'), '', this.remotePath)
  }
  remoteNewFile(): void {
    if (!this.connected) return
    this.openInputDialog('remote-touch', this.i18n.t('app.newFile'), this.i18n.t('app.newFile'), '', this.remotePath)
  }
  remoteRename(): void {
    if (this.selectedRemote.length !== 1 || !this.connected) return
    this.openInputDialog('remote-rename', this.i18n.t('app.rename'), this.i18n.t('app.rename'), this.selectedRemote[0].name, '', this.selectedRemote[0].fullPath)
  }
  remoteDelete(): void {
    if (!this.selectedRemote.length) return
    this.pendingRemoteDelete = this.selectedRemote.slice()
    this.prepareDeleteConfirm(this.selectedRemote)
    this.deleteConfirmVisible = true
  }
  remoteChmod(): void {
    if (this.selectedRemote.length !== 1) return
    this.openPermDialog(this.selectedRemote[0])
  }

  private openInputDialog(mode: NonNullable<SftpFloatingPanel['inputDialogMode']>, title: string, placeholder: string, value: string, targetPath: string, remotePath?: string): void {
    this.inputDialogMode = mode
    this.inputDialogTitle = title
    this.inputDialogPlaceholder = placeholder
    this.inputDialogValue = value
    this.inputDialogTargetPath = targetPath
    this.inputDialogRemotePath = remotePath ?? null
    this.inputDialogVisible = true
  }

  cancelInputDialog(): void { this.inputDialogVisible = false; this.inputDialogMode = null; this.inputDialogValue = '' }

  /** 准备删除确认对话框的显示内容 */
  private prepareDeleteConfirm(entries: Array<LocalEntry | SFTPFile>): void {
    if (entries.length === 1) {
      const e = entries[0]
      this.deleteConfirmBatch = false
      this.deleteItemName = e.name
      this.deleteItemIsDir = e.isDirectory
      this.deleteItemType = e.isDirectory ? '' : this.getFileTypeName(e.name)
      const size = (e as any).size
      this.deleteItemSize = e.isDirectory ? null : (size != null ? this.formatFileSize(size) : null)
      const mtime = (e as SFTPFile).modified ?? ((e as LocalEntry).mtimeMs ? new Date((e as LocalEntry).mtimeMs!) : null)
      this.deleteItemDate = mtime ? this.formatDeleteDate(mtime) : ''
    } else {
      this.deleteConfirmBatch = true
      const count = entries.length
      this.batchDeleteText = this.i18n.t('app.deleteConfirmMultiple').replace('{count}', String(count))
    }
  }

  /** 根据文件扩展名获取类型描述 */
  getFileTypeName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
      txt: this.i18n.t('fileType.txt'),
      log: this.i18n.t('fileType.log'),
      md: this.i18n.t('fileType.md'),
      json: this.i18n.t('fileType.json'),
      xml: this.i18n.t('fileType.xml'),
      yml: this.i18n.t('fileType.data'),
      yaml: this.i18n.t('fileType.data'),
      cfg: this.i18n.t('fileType.config'),
      ini: this.i18n.t('fileType.config'),
      toml: this.i18n.t('fileType.config'),
      js: this.i18n.t('fileType.js'),
      ts: this.i18n.t('fileType.ts'),
      jsx: this.i18n.t('fileType.js'),
      tsx: this.i18n.t('fileType.ts'),
      py: this.i18n.t('fileType.code'),
      java: this.i18n.t('fileType.code'),
      cpp: this.i18n.t('fileType.code'),
      c: this.i18n.t('fileType.code'),
      h: this.i18n.t('fileType.code'),
      go: this.i18n.t('fileType.code'),
      rs: this.i18n.t('fileType.code'),
      rb: this.i18n.t('fileType.code'),
      php: this.i18n.t('fileType.code'),
      html: this.i18n.t('fileType.html'),
      htm: this.i18n.t('fileType.html'),
      css: this.i18n.t('fileType.css'),
      scss: this.i18n.t('fileType.css'),
      less: this.i18n.t('fileType.css'),
      vue: this.i18n.t('fileType.code'),
      svelte: this.i18n.t('fileType.code'),
      png: this.i18n.t('fileType.image'),
      jpg: this.i18n.t('fileType.image'),
      jpeg: this.i18n.t('fileType.image'),
      gif: this.i18n.t('fileType.image'),
      svg: this.i18n.t('fileType.image'),
      ico: this.i18n.t('fileType.image'),
      bmp: this.i18n.t('fileType.image'),
      webp: this.i18n.t('fileType.image'),
      pdf: this.i18n.t('fileType.doc'),
      doc: this.i18n.t('fileType.doc'),
      docx: this.i18n.t('fileType.doc'),
      xls: this.i18n.t('fileType.doc'),
      xlsx: this.i18n.t('fileType.doc'),
      ppt: this.i18n.t('fileType.doc'),
      pptx: this.i18n.t('fileType.doc'),
      zip: this.i18n.t('fileType.archive'),
      rar: this.i18n.t('fileType.archive'),
      tar: this.i18n.t('fileType.archive'),
      gz: this.i18n.t('fileType.archive'),
      '7z': this.i18n.t('fileType.archive'),
      bz2: this.i18n.t('fileType.archive'),
      mp3: this.i18n.t('fileType.audio'),
      wav: this.i18n.t('fileType.audio'),
      flac: this.i18n.t('fileType.audio'),
      ogg: this.i18n.t('fileType.audio'),
      mp4: this.i18n.t('fileType.video'),
      avi: this.i18n.t('fileType.video'),
      mkv: this.i18n.t('fileType.video'),
      mov: this.i18n.t('fileType.video'),
      exe: this.i18n.t('fileType.executable'),
      dll: this.i18n.t('fileType.executable'),
      so: this.i18n.t('fileType.executable'),
      sh: this.i18n.t('fileType.executable'),
      bat: this.i18n.t('fileType.executable'),
      sql: this.i18n.t('fileType.data'),
      db: this.i18n.t('fileType.data'),
      sqlite: this.i18n.t('fileType.data'),
      iso: this.i18n.t('fileType.archive'),
      img: this.i18n.t('fileType.archive'),
      env: this.i18n.t('fileType.config'),
      pem: this.i18n.t('fileType.cert'),
      key: this.i18n.t('fileType.cert'),
      crt: this.i18n.t('fileType.cert'),
      lock: this.i18n.t('fileType.config'),
      gitignore: this.i18n.t('fileType.config'),
      dockerfile: this.i18n.t('fileType.config'),
    }
    return map[ext] || (ext ? `${ext.toUpperCase()} ${this.i18n.t('fileType.unknown')}` : this.i18n.t('fileType.unknown'))
  }

  /** 格式化文件大小 */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const val = bytes / Math.pow(1024, i)
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
  }

  /** 格式化日期为删除对话框显示格式 */
  formatDeleteDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  async confirmInputDialog(): Promise<void> {
    if (!this.inputDialogVisible || !this.inputDialogMode) return
    const mode = this.inputDialogMode
    const val = this.inputDialogValue.trim()
    const tp = this.inputDialogTargetPath
    const rp = this.inputDialogRemotePath
    this.cancelInputDialog()
    if (!val || !tp && !rp) return

    try {
      switch (mode) {
        case 'local-mkdir':
          await fs.mkdir(path.join(tp, val), { recursive: true }); await this.refreshLocal(); break
        case 'local-rename':
          await fs.rename(tp, path.join(this.localPath, val)); await this.refreshLocal(); break
        case 'remote-mkdir':
          if (!this.sftpSession) return
          await this.sftpSession.mkdir(path.posix.join(tp, val)); await this.refreshRemote(); break
        case 'local-touch':
          await fs.writeFile(path.join(tp, val), ''); await this.refreshLocal(); break
        case 'remote-touch':
          if (!this.sftpSession) return
          // 上传空文件来创建新文件
          const emptyUp = { getName: () => val, getSize: () => 0, getCompletedBytes: () => 0, read: () => Promise.resolve(Buffer.alloc(0)), isComplete: () => true, isCancelled: () => false }
          await this.sftpSession.upload(path.posix.join(tp, val), emptyUp as any); await this.refreshRemote(); break
        case 'remote-rename':
          if (!this.sftpSession) return
          await this.sftpSession.rename(rp!, path.posix.join(this.remotePath, val)); await this.refreshRemote(); break
        case 'remote-chmod':
          if (!this.sftpSession) return
          const m = parseInt(val, 8)
          if (!isNaN(m)) { await this.sftpSession.chmod(rp!, m); await this.refreshRemote() }
          break
      }
    } catch (e) { console.error('[SFTP+] Operation failed', e) }
  }

  async confirmDelete(): Promise<void> {
    this.deleteConfirmVisible = false
    try {
      if (this.pendingLocalDelete.length) {
        for (const e of this.pendingLocalDelete) await this.deleteLocalRecursive(e.fullPath)
        await this.refreshLocal(); this.selectedLocal = []
      }
      if (this.pendingRemoteDelete.length && this.sftpSession) {
        for (const e of this.pendingRemoteDelete) await this.deleteRemoteRecursive(e.fullPath)
        await this.refreshRemote(); this.selectedRemote = []
      }
    } catch (e) { console.error('[SFTP+] Delete failed', e) }
    this.pendingLocalDelete = []; this.pendingRemoteDelete = []
  }

  cancelDelete(): void { this.deleteConfirmVisible = false; this.pendingLocalDelete = []; this.pendingRemoteDelete = [] }

  private async deleteLocalRecursive(p: string, depth = 0): Promise<void> {
    if (depth > 100) { console.warn('[SFTP+] deleteLocalRecursive max depth at', p); return }
    const st = await fs.stat(p).catch(() => null)
    if (!st) return
    if (!st.isDirectory()) { await fs.unlink(p); return }
    for (const c of await fs.readdir(p)) await this.deleteLocalRecursive(path.join(p, c), depth + 1)
    await fs.rmdir(p)
  }

  private async deleteRemoteRecursive(p: string, depth = 0): Promise<void> {
    if (depth > 100 || !this.sftpSession) { if (depth > 100) console.warn('[SFTP+] deleteRemoteRecursive max depth at', p); return }
    const entries = await this.sftpSession.readdir(p).catch(() => null)
    if (!entries) { try { await this.sftpSession.unlink(p) } catch {}; return }
    for (const e of entries as SFTPFile[]) {
      if (e.isDirectory) await this.deleteRemoteRecursive(e.fullPath, depth + 1)
      else try { await this.sftpSession.unlink(e.fullPath) } catch {}
    }
    try { await this.sftpSession.rmdir(p) } catch {}
  }

  // ========== 书签 ==========
  toggleBookmarksForPane(pane: 'local' | 'remote', event: MouseEvent): void {
    if (this.showBookmarks && this.bookmarkPane === pane) {
      // 点击同一个 ★ 按钮 → 关闭
      this.closeBookmarks()
      return
    }
    this.bookmarkPane = pane
    this.bookmarkAddScope = null
    this.newBookmarkPath = pane === 'local' ? this.localPath : this.remotePath
    this.newBookmarkName = ''

    // 计算弹出位置：按钮下方，在 .sftp-root 内
    const btn = event.currentTarget as HTMLElement
    const btnRect = btn.getBoundingClientRect()
    const rootEl = (this.elRef?.nativeElement as HTMLElement).querySelector('.sftp-root') as HTMLElement
    const rootRect = rootEl?.getBoundingClientRect() ?? { top: 0, left: 0 }
    // 弹窗宽度约 320px，确保不超出右边界
    const popupW = 320
    let left = btnRect.left - rootRect.left
    if (left + popupW > (rootEl?.clientWidth ?? window.innerWidth)) {
      left = Math.max(0, (rootEl?.clientWidth ?? window.innerWidth) - popupW - 8)
    }
    this.bookmarkPopupX = left
    this.bookmarkPopupY = btnRect.bottom - rootRect.top + 4
    this.showBookmarks = true
  }

  /** 关闭书签弹窗 */
  closeBookmarks(): void {
    this.showBookmarks = false
    this.bookmarkAddScope = null
    this._editingBookmarkId = null
  }

  /** 打开添加书签表单 */
  openBookmarkAddForm(scope: 'connection' | 'global'): void {
    if (this.bookmarkAddScope === scope) {
      this.bookmarkAddScope = null; return // 再次点击关闭
    }
    this.bookmarkAddScope = scope
    this.newBookmarkPath = this.bookmarkPane === 'local' ? this.localPath : this.remotePath
    this.newBookmarkName = ''
  }

  /** 获取全部当前面板的书签（合并列表用） */
  getAllBookmarksForPane(): Bookmark[] {
    return this.bookmarks.getByType(this.bookmarkPane).filter(b => {
      if (!b.connectionKey) return true // 全局书签总可见
      // 有 connectionKey 的书签只对匹配的连接可见
      return b.connectionKey === this.hostInfo
    })
  }

  /** 按 scope 获取书签 */
  getBookmarksForPaneType(scope: 'connection' | 'global'): Bookmark[] {
    if (scope === 'global') {
      return this.bookmarks.getGlobal().filter(b => b.type === this.bookmarkPane)
    }
    // connection scope: 按 hostInfo 筛选（本地/远程面板均支持）
    return this.bookmarks.getByConnection(this.hostInfo).filter(b => b.type === this.bookmarkPane)
  }

  addBookmark(): void {
    const n = this.newBookmarkName.trim(); const bp = this.newBookmarkPath.trim()
    if (!bp) return
    const name = n || (this.bookmarkPane === 'local'
      ? path.basename(bp)
      : path.posix.basename(bp)) || bp

    // 编辑模式：更新已有书签
    if (this._editingBookmarkId) {
      this.bookmarks.update(this._editingBookmarkId, { name, path: bp })
      this._editingBookmarkId = null
      this.newBookmarkName = ''; this.newBookmarkPath = ''; this.bookmarkAddScope = null
      return
    }

    const type = this.bookmarkPane
    // connection scope 带 connectionKey（本地/远程面板均支持），global scope 不带
    const ck = this.bookmarkAddScope === 'connection' ? this.hostInfo : undefined

    // 如果已存在相同 path + type + connectionKey 的书签，覆盖更新名称
    const existing = this.bookmarks.getByPath(bp, type)
    if (existing && existing.connectionKey === ck) {
      this.bookmarks.update(existing.id, { name })
      this.newBookmarkName = ''; this.newBookmarkPath = ''; this.bookmarkAddScope = null
      return
    }

    this.bookmarks.add(name, bp, type, ck)
    this.newBookmarkName = ''; this.newBookmarkPath = ''; this.bookmarkAddScope = null
  }

  removeBookmark(id: string): void { this.bookmarks.remove(id) }

  /** 右键书签条目 — 直接进入编辑模式 */
  onBookmarkContextMenu(bm: Bookmark, ev: MouseEvent): void {
    ev.preventDefault()
    ev.stopPropagation()
    // 复用添加表单进行编辑
    this.bookmarkAddScope = bm.connectionKey ? 'connection' : 'global'
    this.newBookmarkName = bm.name
    this.newBookmarkPath = bm.path
    this._editingBookmarkId = bm.id
    this.cdr.detectChanges()
  }

  gotoBookmark(bm: Bookmark): void {
    if (bm.type === 'local') {
      this._pushLocalNav(bm.path)
      this.localPath = bm.path; this.localPathInput = bm.path; this.saveCurrentPath(); void this.refreshLocal()
    } else {
      this._pushRemoteNav(bm.path)
      this.remotePath = bm.path; this.remotePathInput = bm.path; this.saveCurrentPath(); void this.refreshRemote()
    }
  }

  // ========== 书签拖拽排序 ==========
  onBookmarkDragStart(ev: DragEvent, index: number, scope: BookmarkScope): void {
    this.dragSourceIdx = index
    this.dragSourceScope = scope
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'move'
      ev.dataTransfer.setData('text/plain', String(index))
    }
  }

  onBookmarkDragOver(ev: DragEvent, index: number, scope: BookmarkScope): void {
    // 只允许同 scope 内的拖拽
    if (scope !== this.dragSourceScope) return
    ev.preventDefault()
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
    this.dragOverIdx = index
    this.dragOverScope = scope
    // 检测鼠标在元素的上半部分还是下半部分
    const el = ev.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    this.dragOverBottom = ev.clientY > rect.top + rect.height / 2
  }

  onBookmarkDragEnd(): void {
    this.dragSourceIdx = -1
    this.dragOverIdx = -1
    this.dragOverBottom = false
  }

  onBookmarkDrop(ev: DragEvent, targetIdx: number, scope: BookmarkScope): void {
    ev.preventDefault()
    // 只允许同 scope 内 drop
    if (scope !== this.dragSourceScope) return

    const srcIdx = this.dragSourceIdx
    const dropBottom = this.dragOverBottom
    this.dragSourceIdx = -1
    this.dragOverIdx = -1
    this.dragOverBottom = false
    if (srcIdx < 0 || srcIdx === targetIdx) return

    const list = scope === 'all'
      ? this.getAllBookmarksForPane()
      : this.getBookmarksForPaneType(scope)
    if (srcIdx >= list.length || targetIdx >= list.length) return

    // 在全局书签数组中重新定位
    const all = this.bookmarks.getAll()
    const moved = list[srcIdx]
    const targetItem = list[targetIdx]
    const fromAllIdx = all.findIndex(b => b.id === moved.id)
    const toAllIdx = all.findIndex(b => b.id === targetItem.id)
    if (fromAllIdx < 0 || toAllIdx < 0) return

    // 如果向下拖 (from < to)，先移除再插入会影响 to 的位置
    // splice 自动处理：先移除 fromAllIdx，再在调整后的 toAllIdx 插入
    this.bookmarks.reorder(fromAllIdx, toAllIdx)
  }

  // ========== 传输日志 ==========
  getFilteredLogs(): TransferLogEntry[] {
    return this.transferLog.filter({
      operation: this.logFilterOp as any || undefined,
      success: this.logFilterSuccess || undefined,
      profileName: this.profile?.name || undefined,
    })
  }

  exportLog(): void {
    const json = this.transferLog.exportAsJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `sftp-plus-log-${new Date().toISOString().slice(0, 10)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  clearLog(): void {
    const profileName = this.profile?.name
    if (!confirm(this.i18n.t('transfer.clearConfirm'))) return
    if (profileName) {
      this.transferLog.clearProfile(profileName)
    } else {
      this.transferLog.clear()
    }
  }

  // ========== 右键菜单 ==========
  onLocalContextMenu(entry: LocalEntry, ev: MouseEvent): void {
    // 正在框选时不显示右键菜单
    if (this.rubberBand.active) { ev.preventDefault(); return }
    ev.preventDefault()
    ev.stopPropagation()
    // 关闭表头右键菜单
    this.headerMenuVisible = false
    this.headerMenuCol = null
    // 取消待处理的左键单击定时器，避免延迟选择覆盖右键选中
    if (this.localClickTimer) {
      clearTimeout(this.localClickTimer)
      this.localClickTimer = null
    }
    // 右键时先选中该项（如果未选中）
    if (!this.selectedLocal.includes(entry)) {
      this.selectedLocal = [entry]
      this.localLastSelectedIndex = this.getFilteredLocalEntries().findIndex(e => e === entry)
    }
    this.zone.run(() => {
      this.closeBookmarks()
      this.contextMenuPane = 'local'
      this.contextMenuEntry = entry
      // 先定位到点击位置，showMenu 会在渲染后测量并二次修正
      this.contextMenuX = ev.clientX
      this.contextMenuY = ev.clientY
      this.contextMenuVisible = true
      this.cdr.detectChanges()
      this.fixContextMenuPosition(ev.clientX, ev.clientY)
    })
  }

  onRemoteContextMenu(entry: SFTPFile, ev: MouseEvent): void {
    // 正在框选时不显示右键菜单
    if (this.rubberBand.active) { ev.preventDefault(); return }
    ev.preventDefault()
    ev.stopPropagation()
    // 关闭表头右键菜单
    this.headerMenuVisible = false
    this.headerMenuCol = null
    // 取消待处理的左键单击定时器，避免延迟选择覆盖右键选中
    if (this.remoteClickTimer) {
      clearTimeout(this.remoteClickTimer)
      this.remoteClickTimer = null
    }
    // 右键时先选中该项（如果未选中）
    if (!this.selectedRemote.includes(entry)) {
      this.selectedRemote = [entry]
      this.remoteLastSelectedIndex = this.getFilteredRemoteEntries().findIndex(e => e === entry)
    }
    this.zone.run(() => {
      this.closeBookmarks()
      this.contextMenuPane = 'remote'
      this.contextMenuEntry = entry
      this.contextMenuX = ev.clientX
      this.contextMenuY = ev.clientY
      this.contextMenuVisible = true
      this.cdr.detectChanges()
      this.fixContextMenuPosition(ev.clientX, ev.clientY)
    })
  }

  /** 渲染后测量实际菜单尺寸并修正位置，防止超出视口 */
  private fixContextMenuPosition(anchorX: number, anchorY: number): void {
    // 使用微任务等待 DOM 更新完成
    setTimeout(() => {
      const menuEl = this.elRef.nativeElement.querySelector('.context-menu') as HTMLElement | null
      if (!menuEl || !this.contextMenuVisible) return
      const rect = menuEl.getBoundingClientRect()
      const margin = 8
      let x = anchorX
      let y = anchorY

      // 右边界：超出则向左偏移
      if (x + rect.width > window.innerWidth - margin) {
        x = Math.max(margin, window.innerWidth - rect.width - margin)
      }
      // 下边界：超出则向上弹出
      if (y + rect.height > window.innerHeight - margin) {
        y = Math.max(margin, window.innerHeight - rect.height - margin)
      }
      // 保卫左/上边界
      if (x < margin) x = margin
      if (y < margin) y = margin

      if (x !== this.contextMenuX || y !== this.contextMenuY) {
        this.contextMenuX = x
        this.contextMenuY = y
        this.cdr.detectChanges()
      }
    }, 0)
  }

  /** 面板滚动时关闭右键菜单 */
  onPaneScroll(): void {
    if (this.contextMenuVisible) {
      this.contextMenuVisible = false
      this.contextMenuEntry = null
    }
    if (this.headerMenuVisible) {
      this.headerMenuVisible = false
      this.headerMenuCol = null
    }
  }

  closeContextMenu(): void {
    this.contextMenuVisible = false
    this.contextMenuEntry = null
  }

  ctxNewFolder(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localNewFolder()
    else this.remoteNewFolder()
  }

  ctxNewFile(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localNewFile()
    else this.remoteNewFile()
  }

  ctxRename(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localRename()
    else this.remoteRename()
  }

  ctxDelete(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localDelete()
    else this.remoteDelete()
  }

  ctxRefresh(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.refreshLocal()
    else this.refreshRemote()
  }

  ctxSelectAll(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') {
      const all = this.getFilteredLocalEntries()
      this.selectedLocal = this.selectedLocal.length === all.length ? [] : [...all]
    } else {
      const all = this.getFilteredRemoteEntries()
      this.selectedRemote = this.selectedRemote.length === all.length ? [] : [...all]
    }
  }

  /** 反选：选中当前未选的条目，取消已选的条目 */
  ctxSelectInvert(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') {
      const all = this.getFilteredLocalEntries()
      this.selectedLocal = all.filter(e => !this.selectedLocal.includes(e))
    } else {
      const all = this.getFilteredRemoteEntries()
      this.selectedRemote = all.filter(e => !this.selectedRemote.includes(e))
    }
  }

  ctxCopyPath(): void {
    if (!this.contextMenuEntry) return
    const p = (this.contextMenuEntry as any).fullPath ?? (this.contextMenuEntry as any).path ?? ''
    if (p && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(p).catch(() => {})
    }
    this.closeContextMenu()
  }

  /** 右键菜单 → 更改权限（仅远程） */
  ctxChmod(): void {
    this.closeContextMenu()
    if (this.selectedRemote.length === 1) {
      this.openPermDialog(this.selectedRemote[0])
    }
  }

  /** 右键菜单 → 打开本地文件（用系统默认程序） */
  ctxOpenLocalFile(): void {
    const filePath = (this.contextMenuEntry as LocalEntry)?.fullPath
    this.closeContextMenu()
    if (!filePath) return
    console.log('[SFTP+] Open file:', filePath)
    try {
      const { shell } = require('electron')
      shell.openPath(filePath).then((err?: string) => {
        if (err) console.error('[SFTP+] Open file failed:', err)
      })
    } catch (e) {
      console.error('[SFTP+] Open file failed:', e)
    }
  }

  /** 右键菜单 → 在文件管理器中显示 */
  ctxRevealInExplorer(): void {
    const filePath = (this.contextMenuEntry as LocalEntry)?.fullPath
    this.closeContextMenu()
    if (!filePath) return
    console.log('[SFTP+] Reveal in explorer:', filePath)
    try {
      const { shell } = require('electron')
      shell.showItemInFolder(filePath)
    } catch (e) {
      console.error('[SFTP+] Reveal in explorer failed:', e)
    }
  }

  /** 检查当前右键菜单面板是否有选中项 */
  hasContextSelection(): boolean {
    return this.contextMenuPane === 'local' ? this.selectedLocal.length > 0 : this.selectedRemote.length > 0
  }

  /** 检查是否有文件级操作（打开/显示/权限/详细信息）可显示 */
  hasFileActions(): boolean {
    const pane = this.contextMenuPane
    if (!this.contextMenuEntry) return false
    if (pane === 'local') {
      const sel = this.selectedLocal
      return sel.length === 1 || this.contextMenuEntry != null
    } else {
      return this.selectedRemote.length === 1 || this.contextMenuEntry != null
    }
  }

  /** 获取当前上下文的选中项列表 */
  private getContextSelection(): (LocalEntry | SFTPFile)[] {
    return this.contextMenuPane === 'local' ? this.selectedLocal : this.selectedRemote
  }

  /** 获取修饰键名称（macOS=Cmd，其他=Ctrl） */
  get modKey(): string {
    return os.platform() === 'darwin' ? '⌘' : 'Ctrl+'
  }

  /** 获取 entry 的路径 */
  getEntryPath(e: LocalEntry | SFTPFile): string { return (e as any).fullPath ?? (e as any).remotePath ?? '' }

  /** 获取 entry 的大小 */
  getEntrySize(e: LocalEntry | SFTPFile): number | undefined { return (e as any).size ?? undefined }

  /** 获取 entry 的修改时间（毫秒） */
  getEntryMtime(e: LocalEntry | SFTPFile): number | undefined {
    if (this.detailsIsLocal) return (e as LocalEntry).mtimeMs
    const m = (e as SFTPFile).modified
    return m ? m.getTime() : undefined
  }

  /** 获取 entry 的 mode */
  getEntryMode(e: LocalEntry | SFTPFile): number | undefined { return (e as any).mode ?? undefined }

  /** 获取 entry 的 owner */
  getEntryOwner(e: LocalEntry | SFTPFile): string | undefined { return (e as any).owner != null ? String((e as any).owner) : undefined }

  /** 获取 entry 的 group */
  getEntryGroup(e: LocalEntry | SFTPFile): string | undefined { return (e as any).group != null ? String((e as any).group) : undefined }

  /** 获取 entry 的创建时间（毫秒），仅本地文件有 */
  getEntryBirthtimeMs(e: LocalEntry | SFTPFile): number | undefined {
    if (!this.detailsIsLocal) return undefined
    return (e as LocalEntry).birthtimeMs ?? undefined
  }

  /** 获取 entry 的访问时间（毫秒），仅本地文件有 */
  getEntryAtimeMs(e: LocalEntry | SFTPFile): number | undefined {
    if (!this.detailsIsLocal) return undefined
    return (e as LocalEntry).atimeMs ?? undefined
  }

  /** 获取文件扩展名 */
  getFileExt(name: string): string {
    const i = name.lastIndexOf('.')
    return i > 0 ? name.substring(i + 1).toUpperCase() : ''
  }

  // ========== 详细信息 ==========
  ctxDetails(): void {
    if (!this.contextMenuEntry) return
    this.detailsEntry = this.contextMenuEntry
    this.detailsIsLocal = this.contextMenuPane === 'local'
    this.detailsVisible = true
    this.closeContextMenu()
  }

  // ========== 剪贴板操作 ==========
  ctxClipboardCopy(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'copy'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    const msg = this.effectiveLang === 'zh-CN' ? `已复制 ${count} 项` : `Copied ${count} item${count > 1 ? 's' : ''}`
    try { this.notifications?.notice?.(msg) } catch {}
    console.log(`[SFTP+] Copy ${count} items from ${this.clipboardSource}`)
  }

  ctxClipboardCut(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'cut'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    const msg = this.effectiveLang === 'zh-CN' ? `已剪切 ${count} 项` : `Cut ${count} item${count > 1 ? 's' : ''}`
    try { this.notifications?.notice?.(msg) } catch {}
    console.log(`[SFTP+] Cut ${count} items from ${this.clipboardSource}`)
  }

  async ctxClipboardPaste(): Promise<void> {
    if (!this.clipboardEntries.length) return
    this.closeContextMenu()
    const destPane = this.contextMenuPane
    const destPath = destPane === 'local' ? this.localPath : this.remotePath
    const entries = this.clipboardEntries.slice()
    const mode = this.clipboardMode
    const source = this.clipboardSource

    console.log(`[SFTP+] Paste ${entries.length} items (${mode}) from ${source} to ${destPane}`)
    this.clipboardEntries = []  // 清空剪贴板

    // 先检查冲突，收集需要确认的项
    const conflictItems: typeof entries = []
    for (const entry of entries) {
      if (entry.isDirectory) continue  // 目录跳过冲突检测
      const destFilePath = destPane === 'local'
        ? path.join(destPath, entry.name)
        : path.posix.join(destPath, entry.name)
      const exists = await this._checkDestExists(destPane, destFilePath)
      if (exists) {
        conflictItems.push(entry)
        const isSamePane = source === destPane
        const direction: 'upload' | 'download' = isSamePane ? 'upload'
          : (source === 'local' && destPane === 'remote') ? 'upload'
          : 'download'

        // 同面板冲突：获取目标文件的状态信息
        let destStat: fsSync.Stats = { size: 0, mtimeMs: Date.now() } as fsSync.Stats
        if (isSamePane) {
          if (destPane === 'local') {
            try { destStat = await fs.stat(destFilePath) } catch {}
          } else {
            // 远程目标文件：从已有信息中获取
            try {
              const dir = path.posix.dirname(destFilePath)
              const name = path.posix.basename(destFilePath)
              const remoteEntries = await this.sftpSession!.readdir(dir)
              const found = remoteEntries.find(e => e.name === name)
              if (found) {
                destStat = { size: found.size ?? 0, mtimeMs: found.modified?.getTime?.() ?? Date.now() } as fsSync.Stats
              }
            } catch {}
          }
        }

        this._conflictQueue.push({
          localPath: isSamePane ? destFilePath : (source === 'local' ? (entry as LocalEntry).fullPath : destFilePath),
          remoteDir: destPane === 'remote' ? destPath : path.posix.dirname((entry as any).fullPath ?? ''),
          fileName: entry.name,
          remotePath: isSamePane ? (entry as any).fullPath : (destPane === 'remote' ? destFilePath : (entry as SFTPFile).fullPath),
          localStat: isSamePane ? destStat : { size: (entry as any).size ?? 0, mtimeMs: (entry as any).mtimeMs ?? Date.now() } as fsSync.Stats,
          direction,
          remoteFileSize: isSamePane ? ((entry as any).size ?? 0) : ((entry as any).size ?? 0),
          remoteFileMtime: isSamePane ? ((entry as any).mtimeMs ?? Date.now()) : ((entry as any).mtimeMs ?? Date.now()),
          isSamePane,
          samePaneSource: isSamePane ? source : undefined,
        })
      }
    }

    if (this._conflictQueue.length > 0) {
      // 有冲突：先保存需要粘贴的信息，等冲突解决后再执行
      this._pendingPasteEntries = entries
      this._pendingPasteDestPane = destPane
      this._pendingPasteDestPath = destPath
      this._pendingPasteMode = mode
      this._pendingPasteSource = source
      this.conflictOriginalTotal = this._conflictQueue.length
      this._showConflictDialog()
      return
    }

    // 无冲突：直接执行
    await this._executePaste(entries, destPane, destPath, mode, source)
  }

  /** 检查目标路径是否已存在文件/目录 */
  private async _checkDestExists(pane: 'local' | 'remote', filePath: string): Promise<boolean> {
    if (pane === 'local') {
      try { await fs.access(filePath); return true } catch { return false }
    } else {
      if (!this.sftpSession) return false
      const dir = path.posix.dirname(filePath)
      const name = path.posix.basename(filePath)
      try {
        const entries = await this.sftpSession.readdir(dir)
        return entries.some(e => e.name === name)
      } catch { return false }
    }
  }

  /** 待粘贴的临时状态（冲突解决前暂存） */
  private _pendingPasteEntries: (LocalEntry | SFTPFile)[] = []
  private _pendingPasteDestPane: 'local' | 'remote' = 'local'
  private _pendingPasteDestPath = ''
  private _pendingPasteMode: 'copy' | 'cut' = 'copy'
  private _pendingPasteSource: 'local' | 'remote' = 'local'
  /** 冲突对话框中已处理的文件名集合（用于粘贴时过滤） */
  private _conflictResolvedNames = new Set<string>()

  /** 执行实际粘贴操作 */
  private async _executePaste(
    entries: (LocalEntry | SFTPFile)[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    try {
      for (const entry of entries) {
        const srcPath = (entry as any).fullPath ?? ''
        if (!srcPath) continue
        const destFilePath = destPane === 'local'
          ? path.join(destPath, entry.name)
          : path.posix.join(destPath, entry.name)

        if (source === destPane) {
          // 同面板内操作
          if (destPane === 'local') {
            if (mode === 'copy') {
              if (entry.isDirectory) {
                await this.copyLocalDir(srcPath, destFilePath)
              } else {
                await fs.copyFile(srcPath, destFilePath)
              }
            } else {  // cut
              await fs.rename(srcPath, destFilePath)
            }
          } else {  // remote -> remote
            if (mode === 'copy') {
              await this.copyRemoteDir(srcPath, destFilePath, entry.isDirectory)
            } else {  // cut
              if (!this.sftpSession) continue
              await this.sftpSession.rename(srcPath, destFilePath)
            }
          }
        } else if (source === 'local' && destPane === 'remote') {
          // 本地 → 远程（上传）
          if (entry.isDirectory) {
            await this.uploadLocalDir(srcPath, destPath, destPane)
          } else {
            await this._doUpload(destFilePath, srcPath)
          }
          if (mode === 'cut') {
            await this.deleteLocalRecursive(srcPath)
          }
        } else {
          // 远程 → 本地（下载）
          if (entry.isDirectory) {
            const destDir = path.join(destPath, entry.name)
            const dirExists = await fs.stat(destDir).then(() => true).catch(() => false)
            if (dirExists) {
              this._conflictQueue.push({
                localPath: destDir,
                remoteDir: path.posix.dirname(srcPath),
                fileName: entry.name,
                remotePath: srcPath,
                localStat: { size: 0, mtimeMs: Date.now() } as fsSync.Stats,
                direction: 'download',
                isDirectory: true,
              })
              this.conflictOriginalTotal = this._conflictQueue.length
              this._showConflictDialog()
              continue
            }
            await this.downloadRemoteDir(srcPath, destPath, destPane)
          } else {
            await this._doDownload(srcPath, destFilePath, (entry as SFTPFile).mode, (entry as SFTPFile).size)
          }
          if (mode === 'cut' && this.sftpSession) {
            await this.deleteRemoteRecursive(srcPath)
          }
        }
      }
      // 刷新面板
      if (destPane === 'local' || source === 'local') await this.refreshLocal()
      if (destPane === 'remote' || source === 'remote') await this.refreshRemote()
    } catch (e) {
      console.error('[SFTP+] Paste failed', e)
      const msg = this.effectiveLang === 'zh-CN' ? '粘贴失败' : 'Paste failed'
      try { this.notifications?.error?.(msg, '') } catch {}
    }
  }

  /** 递归复制本地目录 */
  private async copyLocalDir(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true })
    for (const item of await fs.readdir(src, { withFileTypes: true })) {
      const srcP = path.join(src, item.name)
      const destP = path.join(dest, item.name)
      if (item.isDirectory()) {
        await this.copyLocalDir(srcP, destP)
      } else {
        await fs.copyFile(srcP, destP)
      }
    }
  }

  /** 递归复制远程目录（下载→再上传） */
  private async copyRemoteDir(src: string, dest: string, isDir: boolean): Promise<void> {
    if (!this.sftpSession) return
    if (!isDir) {
      // 远程文件复制：下载到临时目录再上传
      const tmpDir = os.tmpdir()
      const tmpFile = path.join(tmpDir, `sftp-copy-${Date.now()}-${path.basename(src)}`)
      try {
        await this._doDownload(src, tmpFile)
        await this._doUpload(dest, tmpFile)
      } finally {
        try { await fs.unlink(tmpFile) } catch {}
      }
      return
    }
    await this.sftpSession.mkdir(dest)
    const entries = await this.sftpSession.readdir(src)
    for (const entry of entries) {
      const srcP = path.posix.join(src, entry.name)
      const destP = path.posix.join(dest, entry.name)
      if (entry.isDirectory) {
        await this.copyRemoteDir(srcP, destP, true)
      } else {
        await this.copyRemoteDir(srcP, destP, false)
      }
    }
  }

  /**
   * 递归上传本地目录到远程（整个目录记一条日志，内部文件不单独记录）
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 添加文件夹级进度追踪，显示当前文件及完成数
   */
  private async uploadLocalDir(
    localSrc: string, remoteDest: string, destPane: 'local' | 'remote',
    _top?: { t: typeof this.transfers[0]; startTime: number; logEntryId: string; bytesDone: number; itemDone: number },
  ): Promise<void> {
    if (!this.sftpSession) return
    const base = path.basename(localSrc)
    const remoteDir = path.posix.join(remoteDest, base)

    // 顶层：预计算大小并创建进度条目
    const isTop = !_top
    if (isTop) {
      const [totalSize, itemCount] = await Promise.all([
        this._calcLocalDirSize(localSrc),
        this._countLocalDirItems(localSrc),
      ])
      const { transferEntry: t, startTime, logEntryId } = this._startFolderTransfer(
        base, 'upload', remoteDir, localSrc, totalSize, itemCount)
      _top = { t, startTime, logEntryId, bytesDone: 0, itemDone: 0 }
    }

    try { await this.sftpSession.mkdir(remoteDir) } catch {}

    for (const item of await fs.readdir(localSrc, { withFileTypes: true })) {
      // 检查是否被用户取消/暂停
      if ((_top?.t as any)?._aborted) break
      while ((_top?.t as any)?._paused) {
        await new Promise(r => setTimeout(r, 200))
        if ((_top?.t as any)?._aborted) break
      }
      if ((_top?.t as any)?._aborted) break
      const localP = path.join(localSrc, item.name)
      const remoteP = path.posix.join(remoteDir, item.name)
      if (item.isDirectory()) {
        await this.uploadLocalDir(localP, remoteDir, destPane, _top)
      } else {
        const st = await fs.stat(localP).catch(() => null)
        await this._doUploadRaw(remoteP, localP)
        // 检查：用户是否取消了当前文件（⏹）
        if ((_top?.t as any)?._abortCurrent) {
          delete (_top?.t as any)._abortCurrent
          continue
        }
        if (st && st.size > 0) {
          _top!.bytesDone += st.size
        }
        // 0 字节文件也计入完成数
        _top!.itemDone++
        this._updateFolderProgress(_top!.t, _top!.bytesDone, item.name, _top!.itemDone, st?.size || 0)
      }
    }

    if (isTop) {
      this._finishFolderTransfer(_top.t, _top.startTime, _top.logEntryId, true)
    }
  }

  /**
   * 递归下载远程目录到本地（整个目录记一条日志，内部文件不单独记录）
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 添加文件夹级进度追踪，显示当前文件及完成数
   */
  private async downloadRemoteDir(
    remoteSrc: string, localDest: string, destPane: 'local' | 'remote',
    _top?: { t: typeof this.transfers[0]; startTime: number; logEntryId: string; bytesDone: number; itemDone: number },
    _localName?: string,
  ): Promise<void> {
    if (!this.sftpSession) return
    const base = _localName || path.posix.basename(remoteSrc)
    const localDir = path.join(localDest, base)

    // 顶层：预计算大小并创建进度条目
    const isTop = !_top
    if (isTop) {
      const [totalSize, itemCount] = await Promise.all([
        this._calcRemoteDirSize(remoteSrc),
        this._countRemoteDirItems(remoteSrc),
      ])
      const { transferEntry: t, startTime, logEntryId } = this._startFolderTransfer(
        base, 'download', remoteSrc, localDir, totalSize, itemCount)
      _top = { t, startTime, logEntryId, bytesDone: 0, itemDone: 0 }
    }

    try { await fs.mkdir(localDir, { recursive: true }) } catch {}

    const entries = await this.sftpSession.readdir(remoteSrc)
    for (const entry of entries) {
      // 检查是否被用户取消/暂停
      if ((_top?.t as any)?._aborted) break
      while ((_top?.t as any)?._paused) {
        await new Promise(r => setTimeout(r, 200))
        if ((_top?.t as any)?._aborted) break
      }
      if ((_top?.t as any)?._aborted) break
      const remoteP = path.posix.join(remoteSrc, entry.name)
      const localP = path.join(localDir, entry.name)
      if (entry.isDirectory) {
        await this.downloadRemoteDir(remoteP, localDir, destPane, _top)
      } else {
        const sz = entry.size || 0
        await this._doDownloadRaw(remoteP, localP, entry.mode, entry.size)
        // 检查：用户是否取消了当前文件（⏹）
        if ((_top?.t as any)?._abortCurrent) {
          delete (_top?.t as any)._abortCurrent
          continue
        }
        if (sz > 0) {
          _top!.bytesDone += sz
        }
        // 0 字节文件也算完成一个 item（进度显示 X/Y files）
        _top!.itemDone++
        this._updateFolderProgress(_top!.t, _top!.bytesDone, entry.name, _top!.itemDone, sz)
      }
    }

    if (isTop) {
      this._finishFolderTransfer(_top.t, _top.startTime, _top.logEntryId, true)
    }
  }

  // ========== 全局事件 ==========
  @HostListener('document:keydown', ['$event'])
  /** 返回当前面板是否处于可见且可交互状态 */
  private get _isPanelActive(): boolean {
    // 面板只读或隐藏时不响应快捷键
    if (this.minimized) return false
    return true
  }

  /** 智能判断快捷键/右键操作的目标面板
   *  - 若仅一侧有选中项 → 使用该侧
   *  - 若两侧均有/均无 → 使用 activePane（鼠标悬停的面板） */
  private _resolveTargetPane(): 'local' | 'remote' {
    if (this.selectedLocal.length > 0 && this.selectedRemote.length === 0) return 'local'
    if (this.selectedRemote.length > 0 && this.selectedLocal.length === 0) return 'remote'
    return this.activePane
  }

  /** 全局键盘快捷键（不依赖焦点，面板可见且非最小化时响应） */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent): void {
    if (!this._isPanelActive) return
    // 输入状态（path input、filter input 等）不响应快捷键
    const el = event.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return

    const isMod = os.platform() === 'darwin' ? event.metaKey : event.ctrlKey
    if (!isMod) {
      // Escape 全局处理
      if (event.key === 'Escape') {
        if (this.inputDialogVisible) { this.cancelInputDialog(); return }
        if (this.deleteConfirmVisible) { this.cancelDelete(); return }
        if (this.showBookmarks) { this.closeBookmarks(); return }
        if (this.showTransferLog) { this.showTransferLog = false; return }
        this.close(); return
      }
      return
    }

    // 智能确定目标面板（优先使用有选中项的面板）
    this.contextMenuPane = this._resolveTargetPane()

    if (event.key === 'a' || event.key === 'A') {
      event.preventDefault()
      this.ctxSelectAll()
      return
    }
    if (event.key === 'c' || event.key === 'C') {
      event.preventDefault()
      this.ctxClipboardCopy()
      return
    }
    if (event.key === 'x' || event.key === 'X') {
      event.preventDefault()
      this.ctxClipboardCut()
      return
    }
    if (event.key === 'v' || event.key === 'V') {
      event.preventDefault()
      void this.ctxClipboardPaste()
      return
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    const el = event.target as HTMLElement | null
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
    const isMod = os.platform() === 'darwin' ? event.metaKey : event.ctrlKey
    if (isMod) {
      // 快捷键使用 activePane 确定作用域
      this.contextMenuPane = this.activePane
      if (event.key === 'a' || event.key === 'A') {
        event.preventDefault()
        this.ctxSelectAll()
        return
      }
      if (event.key === 'c' || event.key === 'C') {
        event.preventDefault()
        this.ctxClipboardCopy()
        return
      }
      if (event.key === 'x' || event.key === 'X') {
        event.preventDefault()
        this.ctxClipboardCut()
        return
      }
      if (event.key === 'v' || event.key === 'V') {
        event.preventDefault()
        void this.ctxClipboardPaste()
        return
      }
    }
    if (event.key === 'Escape') {
      if (this.inputDialogVisible) { this.cancelInputDialog(); return }
      if (this.deleteConfirmVisible) { this.cancelDelete(); return }
      if (this.showBookmarks) { this.closeBookmarks(); return }
      if (this.showTransferLog) { this.showTransferLog = false; return }
      this.close(); return
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null
    if (!target) return

    // 如果点击的是 select 元素或其子元素，不执行任何操作（避免下拉框被立刻关闭）
    if (target.closest('select')) return

    // 关闭书签弹窗
    if (this.showBookmarks) {
      if (!target.closest('.bookmark-popup') && !target.closest('.bm-btn')) {
        this.closeBookmarks()
      }
    }
    // 关闭右键菜单
    if (this.contextMenuVisible) {
      if (!target.closest('.context-menu')) {
        this.contextMenuVisible = false
      }
    }
    // 关闭表头右键菜单
    if (this.headerMenuVisible) {
      if (!target.closest('.context-menu')) {
        this.headerMenuVisible = false
      }
    }
  }
}

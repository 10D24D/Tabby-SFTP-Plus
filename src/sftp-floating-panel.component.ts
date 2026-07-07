/**
 * SFTP+ 浮动面板组件
 * 功能描述：纯 Angular 组件（不继承 BaseTabComponent），由装饰器动态创建为浮动 overlay
 *   双栏文件管理器（本地↔远程）、书签、传输日志、拖拽传输
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-25
 */
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import { exec } from 'child_process'

import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ChangeDetectorRef, ElementRef, NgZone, Injector, ViewEncapsulation } from '@angular/core'
import { ThemesService, NotificationsService, ConfigService, AppService } from 'tabby-core'

import { LocalPathFileDownload, LocalPathFileUpload } from './local-transfers'
import { SftpConnectionService, SFTPFile, SFTPSessionLike, SSHSessionLike, SftpEnrichOptions, getSftpConnectionService, enrichSftpFilesWithAtime, enrichRemoteOwnersViaStat } from './sftp.service'
import { SftpI18nService } from './sftp-i18n.service'
import { SftpBookmarksService, Bookmark } from './sftp-bookmarks.service'
import { SftpTransferLogService, TransferLogEntry } from './sftp-transfer-log.service'
import { openSftpPlusSettings } from './sftp-open-settings'
import { PanelConnectionLifecycle } from './panel/connection-lifecycle'
import { PanelRubberBand } from './panel/panel-rubber-band'
import { PanelConflictResolver } from './panel/panel-conflict-resolver'
import { PanelTransferRuntime } from './panel/panel-transfer-runtime'
import { PaneNavHistory } from './panel/panel-nav-history'
import {
  isDirByMode,
  filterByHidden,
  filterByName,
  sortLocalEntries,
  sortRemoteEntries,
} from './panel/panel-list-utils'
import type {
  LocalEntry,
  ConflictFileInfo,
  DragPayload,
  FolderTransferCtx,
  BookmarkScope,
  PanelTransferItem,
} from './panel/panel-types'
import {
  formatSize,
  formatDate,
  formatPercent,
  formatLogTime,
  formatLogTimeRange,
  formatDuration,
  formatSpeedFromSize,
  getLogFileName,
  formatFailReason as formatFailReasonFn,
} from './panel/panel-format'
import { SFTP_PANEL_STYLES } from './panel/panel-main-styles'
import { IdNameResolver } from './panel/panel-id-resolver'
import type { PaneNavAction, PaneSortAction } from './panel/sftp-file-pane.component'
import type { ContextMenuAction, HeaderMenuAction } from './panel/sftp-context-menu.component'
import type { PermField } from './panel/sftp-perm-dialog.component'
import type { DetailsDisplay } from './panel/sftp-details-dialog.component'
import type { ViewerMode } from './panel/sftp-viewer-dialog.component'
import {
  isViewableRemoteFileType,
  isEditableRemoteFileType,
  isImageFile,
  isBinaryBuffer,
  bufferToText,
  bufferToDataUrl,
  isRemoteFileTooLargeForView,
  isRemoteFileTooLargeForEdit,
  getViewMaxBytes,
  formatBytesLimit,
  EDIT_TEXT_MAX_BYTES,
} from './panel/file-type-utils'
import {
  downloadRemoteToBuffer,
  downloadRemoteToTempFile,
  writeTextToFile,
  readTextFromFile,
  removeTempFile,
  writeBufferToTemp,
  readLocalFileToBuffer,
} from './panel/remote-file-transfer'

@Component({
  selector: 'sftp-plus-panel',
  template: `
    <div class="sftp-root" tabindex="0"
      [class.has-zebra]="showZebra"
      [class.has-col-borders]="showColBorders"
      [class.workspace-mode]="displayMode === 'workspace'">
      <div class="sftp-toast" *ngIf="toastMessage">{{ toastMessage }}</div>
      <div class="sftp-main">
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
          <button class="btn-link btn-icon btn-remember-path" (click)="toggleRememberPath()"
                  [class.active]="rememberPath"
                  title="{{ rememberPath ? (effectiveLang==='zh-CN'?'路径记忆：已开启':'Path Memory: ON') : (effectiveLang==='zh-CN'?'路径记忆：已关闭':'Path Memory: OFF') }}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round">
              <path d="M8 2.4C6.05 2.4 4.5 3.95 4.5 5.9c0 2.55 3.5 6.35 3.5 6.35s3.5-3.8 3.5-6.35C11.5 3.95 9.95 2.4 8 2.4z"/>
              <circle cx="8" cy="5.9" r="1.25"/>
            </svg>
          </button>
          <!-- 布局模式切换 -->
          <button class="btn-link btn-icon btn-layout" (click)="cycleLayoutMode()"
                  title="{{ layoutModeTitle() }}">
            <!-- 自动模式：四格方块自适应图标 -->
            <svg *ngIf="_layoutMode === 'auto'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35">
              <rect x="2" y="2" width="5.5" height="5.5" rx="0.9"/>
              <rect x="8.5" y="2" width="5.5" height="5.5" rx="0.9"/>
              <rect x="2" y="8.5" width="5.5" height="5.5" rx="0.9"/>
              <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="0.9"/>
              <path d="M4.75 7.25v1.5M11.25 7.25v1.5M7.25 4.75h1.5M7.25 11.25h1.5" stroke-width="1.2"/>
            </svg>
            <!-- 左右布局图标 -->
            <svg *ngIf="_layoutMode === 'horizontal'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35">
              <rect x="2" y="2.5" width="5.5" height="11" rx="0.9"/>
              <rect x="8.5" y="2.5" width="5.5" height="11" rx="0.9"/>
            </svg>
            <!-- 上下布局图标 -->
            <svg *ngIf="_layoutMode === 'vertical'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35">
              <rect x="2.5" y="2" width="11" height="5.5" rx="0.9"/>
              <rect x="2.5" y="8.5" width="11" height="5.5" rx="0.9"/>
            </svg>
            <!-- 单栏布局图标 -->
            <svg *ngIf="_layoutMode === 'single'" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35">
              <rect x="2" y="2" width="12" height="12" rx="0.9"/>
              <circle cx="10.5" cy="8" r="1.35" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button class="btn-link btn-icon btn-transfer-log" (click)="showTransferLog = !showTransferLog"
                  [class.active]="showTransferLog"
                  title="{{ i18n.t('transfer.log') }}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round">
              <rect x="2.5" y="2.5" width="11" height="11" rx="0.9"/>
              <line x1="5" y1="5.75" x2="11" y2="5.75"/>
              <line x1="5" y1="8" x2="11" y2="8"/>
              <line x1="5" y1="10.25" x2="9.5" y2="10.25"/>
            </svg>
          </button>
          <button class="btn-link btn-icon btn-settings" (click)="openPluginSettings()"
                  title="{{ i18n.t('app.openSettings') }}">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <g transform="translate(8 8) scale(0.62) translate(-12 -12)">
                <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
              </g>
            </svg>
          </button>
          <button *ngIf="displayMode !== 'workspace'" class="btn-link btn-icon btn-minimize" (click)="minimize()" title="{{ minimized ? (effectiveLang==='zh-CN'?'恢复':'Restore') : (effectiveLang==='zh-CN'?'最小化':'Minimize') }}">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round">
              <line x1="4" y1="8" x2="12" y2="8"/>
            </svg>
          </button>
          <button class="btn-close" (click)="close()">✕</button>
        </div>
      </div>

      <!-- 双栏主体 -->
      <div class="sftp-body">
        <!-- ====== 本地面板 ====== -->
        <sftp-file-pane
          *ngIf="_layoutMode !== 'single'"
          [i18n]="i18n"
          labelIcon="🖥"
          [paneLabel]="i18n.t('pane.local')"
          listClass="local-pane"
          [isLocal]="true"
          [pathInput]="localPathInput"
          [paneCustomOrder]="paneCustomOrder"
          (pathInputChange)="localPathInput = $event"
          (pathEnter)="goToLocalPathInput()"
          (pathBlur)="onLocalPathBlur()"
          [canBack]="canLocalBack"
          [canForward]="canLocalForward"
          [canUp]="canLocalUp()"
          [filterVisible]="localFilterVisible"
          [filterPending]="localFilterPending"
          (filterPendingChange)="localFilterPending = $event"
          [filterActive]="localFilter"
          [bookmarksActive]="showBookmarks && bookmarkPane === 'local'"
          [loading]="_localLoading"
          [flash]="_localFlash"
          [dragOver]="_localDragOver"
          [hasError]="_localError"
          [showEmpty]="getFilteredLocalEntries().length === 0 && !_localLoading"
          [entries]="getFilteredLocalEntries()"
          [visibleCols]="localVisibleCols"
          [colWidths]="getLocalColWidths()"
          [sortBy]="localSortBy"
          [sortAsc]="localSortAsc"
          [selectionInfo]="getLocalSelectionInfo()"
          [isZh]="effectiveLang === 'zh-CN'"
          [colHeaderLabelFn]="colHeaderLabelFn"
          [colValueFn]="colValueFn"
          [isSelectedFn]="isLocalSelectedFn"
          [sortArrowFn]="localSortArrowFn"
          [trackByFn]="trackLocalEntryBy"
          (nav)="onLocalPaneNav($event)"
          (applyFilter)="applyLocalFilter()"
          (clearFilter)="clearLocalFilter()"
          (listDragOver)="onDragOver($event, 'local')"
          (listDragEnter)="onDragEnter($event, 'local')"
          (listDragLeave)="onDragLeave($event, 'local')"
          (listDrop)="onDrop($event, 'local')"
          (listMouseDown)="onPaneMouseDown($event, 'local')"
          (listMouseEnter)="activePane = 'local'"
          (listScroll)="onPaneScroll()"
          (listClick)="onPaneListClick($event, 'local')"
          (listContextMenu)="onPaneContextMenu($event)"
          (headerContextMenu)="onHeaderContextMenu($event)"
          (sort)="onLocalSort($event)"
          (colResizeStart)="onColResizeStart($event.col, $event.event, 'local')"
          (colResizeAutoFit)="onColResizeAutoFit($event.col, 'local')"
          (colHeaderDragStart)="onColHeaderDragStart($event.event, $event.col)"
          (colHeaderDragOver)="onColHeaderDragOver($event)"
          (colHeaderDrop)="onColHeaderDrop($event.event, $event.col, 'local')"
          (colHeaderDragEnd)="onColHeaderDragEnd()"
          (entryClick)="onLocalClick($event.entry, $event.event, $event.index)"
          (entryDblClick)="openLocal($event.entry, $event.event)"
          (entryContextMenu)="onLocalContextMenu($event.entry, $event.event)"
          (entryDragStart)="onDragStartLocal($event.event, $event.entry)"
          (entryDragEnd)="onEntryDragEnd()"
          (toggleBookmarks)="toggleBookmarksForPane('local', $event)">
        </sftp-file-pane>

        <!-- 拖拽分割线（窄屏上下布局/宽屏左右布局均显示） -->
        <div class="pane-splitter"
             *ngIf="_layoutMode !== 'single'"
             [title]="splitterTitle()"
             (mousedown)="onSplitterDown($event)"
             (dblclick)="onSplitterDblClick($event)"></div>

        <!-- ====== 远程面板 ====== -->
        <sftp-file-pane
          [i18n]="i18n"
          labelIcon="🌐"
          [paneLabel]="i18n.t('pane.remote')"
          listClass="remote-pane"
          [isLocal]="false"
          [pathInput]="remotePathInput"
          [paneCustomOrder]="paneCustomOrder"
          (pathInputChange)="remotePathInput = $event"
          (pathEnter)="goToRemotePathInput()"
          (pathBlur)="onRemotePathBlur()"
          [pathDisabled]="!connected"
          [refreshDisabled]="!connected"
          [canBack]="canRemoteBack"
          [canForward]="canRemoteForward"
          [canUp]="canRemoteUp()"
          [filterVisible]="remoteFilterVisible"
          [filterPending]="remoteFilterPending"
          (filterPendingChange)="remoteFilterPending = $event"
          [filterActive]="remoteFilter"
          [bookmarksActive]="showBookmarks && bookmarkPane === 'remote'"
          [loading]="_remoteLoading"
          [flash]="_remoteFlash"
          [dragOver]="_remoteDragOver"
          [hasError]="_remoteError"
          [showNoSession]="!connected && !sshSession"
          [showHeader]="connected"
          [showEmpty]="connected && getFilteredRemoteEntries().length === 0 && !_remoteLoading"
          [entries]="getFilteredRemoteEntries()"
          [visibleCols]="remoteVisibleCols"
          [colWidths]="getRemoteColWidths()"
          [sortBy]="remoteSortBy"
          [sortAsc]="remoteSortAsc"
          [draggable]="connected"
          [selectionInfo]="getRemoteSelectionInfo()"
          [isZh]="effectiveLang === 'zh-CN'"
          [colHeaderLabelFn]="colHeaderLabelFn"
          [colValueFn]="colValueFn"
          [isSelectedFn]="isRemoteSelectedFn"
          [sortArrowFn]="remoteSortArrowFn"
          [trackByFn]="trackRemoteEntryBy"
          (nav)="onRemotePaneNav($event)"
          (applyFilter)="applyRemoteFilter()"
          (clearFilter)="clearRemoteFilter()"
          (listDragOver)="onDragOver($event, 'remote')"
          (listDragEnter)="onDragEnter($event, 'remote')"
          (listDragLeave)="onDragLeave($event, 'remote')"
          (listDrop)="onDrop($event, 'remote')"
          (listMouseDown)="onPaneMouseDown($event, 'remote')"
          (listMouseEnter)="activePane = 'remote'"
          (listScroll)="onPaneScroll()"
          (listClick)="onPaneListClick($event, 'remote')"
          (listContextMenu)="onPaneContextMenu($event)"
          (headerContextMenu)="onHeaderContextMenu($event)"
          (sort)="onRemoteSort($event)"
          (colResizeStart)="onColResizeStart($event.col, $event.event, 'remote')"
          (colResizeAutoFit)="onColResizeAutoFit($event.col, 'remote')"
          (colHeaderDragStart)="onColHeaderDragStart($event.event, $event.col)"
          (colHeaderDragOver)="onColHeaderDragOver($event)"
          (colHeaderDrop)="onColHeaderDrop($event.event, $event.col, 'remote')"
          (colHeaderDragEnd)="onColHeaderDragEnd()"
          (entryClick)="onRemoteClick($event.entry, $event.event, $event.index)"
          (entryDblClick)="openRemote($event.entry, $event.event)"
          (entryContextMenu)="onRemoteContextMenu($event.entry, $event.event)"
          (entryDragStart)="onDragStartRemote($event.event, $event.entry)"
          (entryDragEnd)="onEntryDragEnd()"
          (toggleBookmarks)="toggleBookmarksForPane('remote', $event)">
        </sftp-file-pane>

      </div>

      <!-- 传输队列：无任务时不渲染，避免底部留白 -->
      <sftp-transfer-queue
        *ngIf="transfers.length && !transfersHidden"
        [i18n]="i18n"
        [transfers]="transfers"
        [hidden]="transfersHidden"
        [minimized]="transfersMinimized"
        (hiddenChange)="transfersHidden = $event"
        (minimizeChange)="transfersMinimized = $event"
        (pause)="pauseTransfer($event)"
        (resume)="resumeTransfer($event)"
        (cancel)="cancelTransfer($event)"
        (cancelCurrent)="cancelCurrentFile($event)">
      </sftp-transfer-queue>
      </div>

      <div class="sftp-overlays">
      <sftp-delete-dialog
        [i18n]="i18n"
        [visible]="deleteConfirmVisible"
        [batch]="deleteConfirmBatch"
        [batchText]="batchDeleteText"
        [isDir]="deleteItemIsDir"
        [name]="deleteItemName"
        [type]="deleteItemType"
        [size]="deleteItemSize"
        [date]="deleteItemDate"
        (confirm)="confirmDelete()"
        (cancel)="cancelDelete()">
      </sftp-delete-dialog>

      <sftp-input-dialog
        [i18n]="i18n"
        [visible]="inputDialogVisible"
        [title]="inputDialogTitle"
        [value]="inputDialogValue"
        [placeholder]="inputDialogPlaceholder"
        (valueChange)="inputDialogValue = $event"
        (confirm)="confirmInputDialog()"
        (cancel)="cancelInputDialog()">
      </sftp-input-dialog>

      <sftp-bookmark-popup *ngIf="showBookmarks"
        [i18n]="i18n"
        [top]="bookmarkPopupY"
        [left]="bookmarkPopupX"
        [arrowLeft]="bookmarkArrowLeft"
        [paneLabel]="bookmarkPane === 'local' ? i18n.t('pane.local') : i18n.t('pane.remote')"
        [pane]="bookmarkPane"
        [addScope]="bookmarkAddScope"
        [newName]="newBookmarkName"
        [newPath]="newBookmarkPath"
        (newNameChange)="newBookmarkName = $event"
        (newPathChange)="newBookmarkPath = $event"
        [editingId]="_editingBookmarkId"
        [connectionBookmarks]="getBookmarksForPaneType('connection')"
        [globalBookmarks]="getBookmarksForPaneType('global')"
        [dragOverIdx]="dragOverIdx"
        [dragOverScope]="dragOverScope"
        [dragOverBottom]="dragOverBottom"
        [dragSourceIdx]="dragSourceIdx"
        [dragSourceScope]="dragSourceScope"
        (close)="closeBookmarks()"
        (addScopeClick)="openBookmarkAddForm($event)"
        (addBookmark)="addBookmark()"
        (gotoBookmark)="gotoBookmark($event)"
        (removeBookmark)="removeBookmark($event)"
        (contextMenu)="onBookmarkContextMenu($event.bookmark, $event.event)"
        (dragStart)="onBookmarkDragStart($event.event, $event.index, $event.scope)"
        (dragOver)="onBookmarkDragOver($event.event, $event.index, $event.scope)"
        (dragEnd)="onBookmarkDragEnd()"
        (drop)="onBookmarkDrop($event.event, $event.index, $event.scope)">
      </sftp-bookmark-popup>

      <!-- 传输日志 -->
      <sftp-transfer-log-dialog
        [i18n]="i18n"
        [visible]="showTransferLog"
        [entries]="getFilteredLogs()"
        [filterOp]="logFilterOp"
        [filterStatus]="logFilterStatus"
        [activeTransferCount]="transfers.length"
        [transfersHidden]="transfersHidden"
        [transfersMinimized]="transfersMinimized"
        [isZh]="effectiveLang === 'zh-CN'"
        (close)="showTransferLog = false"
        (filterOpChange)="logFilterOp = $event"
        (filterStatusChange)="logFilterStatus = $event"
        (showTransfers)="transfersHidden = false; transfersMinimized = false"
        (export)="exportLog()"
        (clear)="clearLog()">
      </sftp-transfer-log-dialog>

      <!-- 文件冲突对话框 -->
      <sftp-conflict-dialog
        [i18n]="i18n"
        [visible]="showConflictDialog"
        [data]="conflictData"
        [currIdx]="conflictCurrIdx"
        [totalIdx]="conflictTotalIdx"
        (resolve)="resolveConflict($event)">
      </sftp-conflict-dialog>

      <sftp-context-menu
        [i18n]="i18n"
        [menuVisible]="contextMenuVisible"
        [menuX]="contextMenuX"
        [menuY]="contextMenuY"
        [pane]="contextMenuPane"
        [entry]="contextMenuEntry"
        [hasSelection]="hasContextSelection()"
        [hasFileActions]="hasFileActions()"
        [singleSelected]="contextMenuPane === 'local' ? selectedLocal.length === 1 : selectedRemote.length === 1"
        [clipboardHasEntries]="clipboardEntries.length > 0"
        [canView]="canViewEntry(contextMenuEntry)"
        [canEdit]="canEditEntry(contextMenuEntry)"
        [canTransfer]="connected"
        [modKey]="modKey"
        [isZh]="effectiveLang === 'zh-CN'"
        [headerVisible]="headerMenuVisible"
        [headerX]="headerMenuX"
        [headerY]="headerMenuY"
        [headerCol]="headerMenuCol"
        [cols]="contextColVisibility"
        [pinFolders]="contextMenuPane === 'local' ? pinFoldersLocal : pinFoldersRemote"
        [showHidden]="contextMenuPane === 'local' ? showHiddenLocal : showHiddenRemote"
        [showColBorders]="showColBorders"
        [showZebra]="showZebra"
        (menuAction)="onContextMenuAction($event)"
        (headerAction)="onHeaderMenuAction($event)">
      </sftp-context-menu>

      <sftp-perm-dialog
        [i18n]="i18n"
        [visible]="showPermDialog"
        [targetName]="permTargetName"
        [targetPath]="permTargetPath"
        [ownerRead]="permOwnerRead"
        [ownerWrite]="permOwnerWrite"
        [ownerExec]="permOwnerExec"
        [groupRead]="permGroupRead"
        [groupWrite]="permGroupWrite"
        [groupExec]="permGroupExec"
        [otherRead]="permOtherRead"
        [otherWrite]="permOtherWrite"
        [otherExec]="permOtherExec"
        [modePreview]="permModePreview"
        (permChange)="onPermFieldChange($event)"
        (confirm)="confirmPermDialog()"
        (cancel)="cancelPermDialog()">
      </sftp-perm-dialog>

      <sftp-details-dialog
        [i18n]="i18n"
        [visible]="detailsVisible"
        [display]="detailsDisplay"
        (confirm)="detailsVisible = false"
        (cancel)="detailsVisible = false">
      </sftp-details-dialog>

      <sftp-viewer-dialog
        [i18n]="i18n"
        [visible]="viewerVisible"
        [loading]="viewerLoading"
        [mode]="viewerMode"
        [fileName]="viewerFileName"
        [displayPath]="viewerDisplayPath"
        [textContent]="viewerTextContent"
        [imageUrl]="viewerImageUrl"
        [error]="viewerError"
        [showSystemAction]="viewerShowSystemAction"
        (systemAction)="openViewerInSystem()"
        (close)="closeViewer()">
      </sftp-viewer-dialog>

      <sftp-editor-dialog
        [i18n]="i18n"
        [visible]="editorVisible"
        [loading]="editorLoading"
        [saving]="editorSaving"
        [dirty]="editorDirty"
        [fileName]="editorFileName"
        [displayPath]="editorDisplayPath"
        [content]="editorContent"
        [error]="editorError"
        [showSystemAction]="editorShowSystemAction"
        (contentChange)="onEditorContentChange($event)"
        (save)="saveEditor()"
        (cancel)="closeEditor()"
        (systemAction)="openEditorInSystem()">
      </sftp-editor-dialog>
      </div>

    </div>
  `,
  encapsulation: ViewEncapsulation.None,
  styles: [SFTP_PANEL_STYLES],
})
export class SftpFloatingPanel implements OnInit, AfterViewInit, OnDestroy {
  // ========== 从外部设置（非 DI）==========
  sshSession: SSHSessionLike | null = null
  profile: any = null
  onClose: (() => void) | null = null   // 关闭回调（销毁面板）
  onMinimize: (() => void) | null = null // 最小化回调（隐藏面板，不销毁）
  displayMode: 'floating' | 'workspace' = 'floating'

  // ========== 服务（直接实例化，非 DI）==========
  private sftpService = getSftpConnectionService()
  i18n: SftpI18nService
  private configService?: ConfigService
  private bookmarks: SftpBookmarksService
  private transferLog: SftpTransferLogService

  // ========== 连接 ==========
  /** 终端 Tab 引用（用于重连时获取最新 sshSession） */
  terminalRef: any = null

  /** NotificationsService（延迟获取，可能为空） */
  private notifications: any = null

  /** 面板顶部轻提示（复制路径等） */
  toastMessage = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteLoadingTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteFlashTimer: ReturnType<typeof setTimeout> | null = null
  private _localFlashTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteRefreshGen = 0
  private static readonly MTIME_TOLERANCE_MS = 2000

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
  pinFoldersLocal = true
  localFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private localClickTimer: ReturnType<typeof setTimeout> | null = null
  localPathInput = this.localPath
  localSortBy: 'name' | 'size' | 'modified' | 'birthtime' = 'name'
  localSortAsc = true
  localCache: any = null
  /** 本地选中条目（按 fullPath 匹配，避免框选/点击对象引用不一致） */
  private _selectedLocal: LocalEntry[] = []
  private _localSelectedPaths = new Set<string>()
  get selectedLocal(): LocalEntry[] { return this._selectedLocal }
  set selectedLocal(val: LocalEntry[]) {
    this._selectedLocal = val
    this._localSelectedPaths = new Set(val.map(e => e.fullPath))
  }
  localLastSelectedIndex: number | null = null
  /** 本地面板是否正在加载 */
  _localLoading = false
  /** 本地面板刷新闪烁 */
  _localFlash = false
  /** 本地面板拖拽悬停（桌面文件拖入时高亮） */
  _localDragOver = false
  /** 内部拖拽：源面板与同目录无操作标记 */
  private _dragSourcePane: 'local' | 'remote' | null = null
  private _dragSameDirNoop = false
  /** 本地面板访问错误（权限不足、路径不存在等） */
  _localError = false

  // ========== 远程面板 ==========
  remotePath = '/'
  remoteEntries: SFTPFile[] = []
  remoteFilter = ''
  remoteFilterPending = ''
  showHiddenRemote = false
  pinFoldersRemote = true
  remoteFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private remoteClickTimer: ReturnType<typeof setTimeout> | null = null

  // ---- 连接生命周期（connect / heartbeat / reconnect） ----
  private _connLifecycle!: PanelConnectionLifecycle
  remotePathInput = this.remotePath
  remoteSortBy: 'name' | 'size' | 'modified' | 'birthtime' = 'name'
  remoteSortAsc = true
  remoteCache: any = null
  /** 远程选中条目（按 fullPath 匹配） */
  private _selectedRemote: SFTPFile[] = []
  private _remoteSelectedPaths = new Set<string>()
  get selectedRemote(): SFTPFile[] { return this._selectedRemote }
  set selectedRemote(val: SFTPFile[]) {
    this._selectedRemote = val
    this._remoteSelectedPaths = new Set(val.map(e => e.fullPath))
  }
  remoteLastSelectedIndex: number | null = null
  /** 远程面板是否正在加载 */
  _remoteLoading = false
  /** 远程面板刷新闪烁 */
  _remoteFlash = false
  /** 远程面板拖拽悬停（桌面文件拖入时高亮） */
  _remoteDragOver = false
  /** 远程面板访问错误（权限不足、路径不存在等） */
  _remoteError = false

  private _rubberBand!: PanelRubberBand
  private readonly localIdResolver = new IdNameResolver()
  private readonly remoteIdResolver = new IdNameResolver()
  private _conflictResolver!: PanelConflictResolver
  private _transferRuntime!: PanelTransferRuntime

  // ========== 传输 ==========
  transfers: PanelTransferItem[] = []

  // ========== 远程导航历史 ==========
  private readonly _remoteNav = new PaneNavHistory(50)
  private _ignoreNavPush = false
  get canRemoteBack(): boolean { return this._remoteNav.canBack && this.connected }
  get canRemoteForward(): boolean { return this._remoteNav.canForward && this.connected }

  // ========== 本地导航历史 ==========
  private readonly _localNav = new PaneNavHistory(50)
  /** 是否忽略历史记录（后退/前进导航时跳过记录） */
  private _ignoreLocalNavPush = false
  /** 是否可以后退 */
  get canLocalBack(): boolean { return this._localNav.canBack }
  get canLocalForward(): boolean { return this._localNav.canForward }

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
  /** 防止打开书签弹窗的同一轮点击被 document 捕获后立即关闭 */
  private _bookmarkJustOpened = false
  bookmarkPane: 'local' | 'remote' = 'local'
  bookmarkAddScope: 'connection' | 'global' | null = null
  newBookmarkName = ''
  newBookmarkPath = ''
  bookmarkPopupX = 0
  bookmarkPopupY = 0
  /** 箭头水平位置（相对弹窗左缘，对准触发按钮中心） */
  bookmarkArrowLeft = 24
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

  // ========== 文件查看 / 编辑 ==========
  viewerVisible = false
  viewerLoading = false
  viewerMode: ViewerMode = 'text'
  viewerFileName = ''
  viewerDisplayPath = ''
  viewerTextContent = ''
  viewerImageUrl = ''
  viewerError = ''
  viewerSystemPath = ''
  private viewerTempPath = ''

  editorVisible = false
  editorLoading = false
  editorSaving = false
  editorDirty = false
  editorFileName = ''
  editorDisplayPath = ''
  editorContent = ''
  editorOriginalContent = ''
  editorLocalPath = ''
  editorIsRemote = false
  editorError = ''
  private editorTempPath = ''
  private _editorSavePath = ''
  private _editorFileWatcher: fsSync.FSWatcher | null = null
  private _editorWatchDebounce: ReturnType<typeof setTimeout> | null = null

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
    if (col === 'created') return false
    if (col === 'size') return this.remoteShowColSize
    if (col === 'date') return this.remoteShowColDate
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
  /** 当前修改权限的文件/文件夹名（供对话框显示） */
  permTargetName = ''

  // ========== 表格样式设置（从设置页读取）==========
  static readonly TABLE_SETTINGS_KEY = 'sftp-plus-table'
  showColBorders = false  // 显示边框（默认关闭）
  showZebra = false       // 显示斑马纹（默认关闭）

  private loadTableSettings(): void {
    try {
      // 直接从 localStorage 读取，绕过 _paneStore 缓存
      // 避免因 _paneFlushToConfig 导致的配置覆盖问题
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const borders = localStorage.getItem(`${keyPrefix}.colBorders`)
      const zebra = localStorage.getItem(`${keyPrefix}.zebra`)
      const pinLocal = localStorage.getItem(`${keyPrefix}.pinFoldersLocal`)
      const pinRemote = localStorage.getItem(`${keyPrefix}.pinFoldersRemote`)
      if (borders !== null) this.showColBorders = JSON.parse(borders)
      if (zebra !== null) this.showZebra = JSON.parse(zebra)
      if (pinLocal !== null) this.pinFoldersLocal = JSON.parse(pinLocal)
      if (pinRemote !== null) this.pinFoldersRemote = JSON.parse(pinRemote)
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
  private _colHeaderDragging = false

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
    this._colHeaderDragging = true
    this._colDragCol = col
    event.dataTransfer?.setData('text/plain', col)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  onColHeaderDragOver(event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onColHeaderDragEnd(): void {
    this._colHeaderDragging = false
    this._colDragCol = null
    this._localDragOver = false
    this._remoteDragOver = false
    this.cdr.detectChanges()
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
    this._colHeaderDragging = false
    this._colDragCol = null
    this.cdr.detectChanges()
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
        this.remoteShowColCreated = false
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
      if (s.by && s.by !== 'birthtime') { this.remoteSortBy = s.by; this.remoteSortAsc = s.asc !== false }
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
        created: false,
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
      else if (col === 'created') { /* 远程无 birthtime，忽略 */ }
      else if (col === 'perms') this.remoteShowColPerms = !this.remoteShowColPerms
      else if (col === 'mode') this.remoteShowColMode = !this.remoteShowColMode
      else if (col === 'access') this.remoteShowColAccess = !this.remoteShowColAccess
      else if (col === 'owner') this.remoteShowColOwner = !this.remoteShowColOwner
      else if (col === 'group') this.remoteShowColGroup = !this.remoteShowColGroup
      else if (col === 'path') this.remoteShowColPath = !this.remoteShowColPath
      else if (col === 'ext') this.remoteShowColExt = !this.remoteShowColExt
      this.saveRemoteColSettings()
      if (this.connected && (col === 'owner' || col === 'group' || col === 'access')) {
        void this.refreshRemote()
      }
    }
    this.headerMenuVisible = false
    this.headerMenuCol = null
  }

  /** 切换文件夹置顶 */
  togglePinFolders(pane: 'local' | 'remote'): void {
    if (pane === 'local') {
      this.pinFoldersLocal = !this.pinFoldersLocal
      try { localStorage.setItem(`${SftpFloatingPanel.TABLE_SETTINGS_KEY}.pinFoldersLocal`, JSON.stringify(this.pinFoldersLocal)) } catch {}
      this._invalidateLocalCache()
    } else {
      this.pinFoldersRemote = !this.pinFoldersRemote
      try { localStorage.setItem(`${SftpFloatingPanel.TABLE_SETTINGS_KEY}.pinFoldersRemote`, JSON.stringify(this.pinFoldersRemote)) } catch {}
      this._invalidateRemoteCache()
    }
    this.headerMenuVisible = false
    this.headerMenuCol = null
  }

  /** 切换显示隐藏文件 */
  toggleShowHidden(pane: 'local' | 'remote'): void {
    if (pane === 'local') {
      this.showHiddenLocal = !this.showHiddenLocal
      this._invalidateLocalCache()
    } else {
      this.showHiddenRemote = !this.showHiddenRemote
      this._invalidateRemoteCache()
    }
    this.headerMenuVisible = false
    this.headerMenuCol = null
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

  /** P2-12: 复用 canvas 测量文本宽度，避免每次创建新 canvas */
  private _measureCanvas: HTMLCanvasElement | null = null

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

    // 复用 canvas 测量文本宽度
    if (!this._measureCanvas) this._measureCanvas = document.createElement('canvas')
    const ctx = this._measureCanvas.getContext('2d')
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
      case 'created': if (isLocal) this.localColCreatedWidth = w; else this.remoteColCreatedWidth = w; break
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
    if (this._rubberBand.active) return
    if (this._rubberBand.suppressContextMenu || this._rubberBand.skipNextContextMenu) return

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

  onColResizeAutoFit(col: string, pane: 'local' | 'remote'): void {
    this.resizing = false
    this.resizeCol = null
    const isLocal = pane === 'local'
    const MIN_WIDTHS: Record<string, number> = {
      name: this.colNameMinWidth,
      size: 40, date: 80, created: 80, perms: 40, mode: 40,
      access: 80, owner: 40, group: 40, path: 60, ext: 30,
    }
    let maxW = this._measureColWidth(col, isLocal)
    maxW = Math.max(maxW, MIN_WIDTHS[col] || 40)
    this._setColWidth(col, pane, maxW)
    if (isLocal) this.saveLocalColWidths()
    else this.saveRemoteColWidths()
    this._colJustResized = true
    setTimeout(() => { this._colJustResized = false }, 200)
    this.cdr.detectChanges()
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

  /** 循环切换布局模式：auto → horizontal → vertical → single → auto */
  cycleLayoutMode(): void {
    const order: Array<'auto' | 'horizontal' | 'vertical' | 'single'> = ['auto', 'horizontal', 'vertical', 'single']
    const idx = order.indexOf(this._layoutMode)
    this._layoutMode = order[(idx + 1) % order.length]
    try {
      this._paneSet('sftp-plus-layout-mode', this._layoutMode)
      this._paneSet('sftp-plus-settings.layoutMode', JSON.stringify(this._layoutMode))
    } catch {}
    if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
    else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
    else if (this._layoutMode === 'single') { this._isNarrowLayout = false; this.activePane = 'remote' }
    else this._updateAutoLayout()
    setTimeout(() => this._applyPaneSplit(), 50)
    // 通知设置页等外部监听者
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch {}
  }

  /** 根据容器宽度更新自动布局状态 */
  private _updateAutoLayout(): void {
    if (this._layoutMode !== 'auto') return
    try {
      const w = this._measureLayoutWidth()
      this._isNarrowLayout = w <= 960
    } catch {
      this._isNarrowLayout = false
    }
  }

  /** 读取可用于布局计算的容器宽度 */
  private _measureLayoutWidth(): number {
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return 960
    const widths: number[] = []
    let el: HTMLElement | null = root
    for (let i = 0; i < 6 && el; i++) {
      if (el.clientWidth > 0) widths.push(el.clientWidth)
      el = el.parentElement
    }
    if (widths.length) return Math.max(...widths)
    return 960
  }

  /** 工作区标签页：在宿主布局稳定后刷新自适应布局 */
  refreshWorkspaceLayout(): void {
    if (this.displayMode !== 'workspace') return
    this._scheduleLayoutRefresh()
  }

  /** 统一调度布局刷新（ResizeObserver / 窗口缩放共用） */
  private _scheduleLayoutRefresh(): void {
    if (this._roRafId) return
    this._roRafId = requestAnimationFrame(() => {
      this._roRafId = 0
      if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
      else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
      else if (this._layoutMode === 'single') this._isNarrowLayout = false
      else this._updateAutoLayout()
      this._applyPaneSplit()
      this.cdr.detectChanges()
    })
  }

  private _bindLayoutObservers(): void {
    const root = this.elRef?.nativeElement as HTMLElement | null
    if (!root) return

    const ro = new ResizeObserver(() => this._scheduleLayoutRefresh())
    ro.observe(root)

    if (this.displayMode === 'workspace') {
      const seen = new Set<HTMLElement>()
      let el: HTMLElement | null = root
      for (let i = 0; i < 6 && el; i++) {
        if (!seen.has(el)) {
          seen.add(el)
          try { ro.observe(el) } catch { /* ignore */ }
        }
        el = el.parentElement
      }
      if (!this._winResizeHandler) {
        this._winResizeHandler = () => this._scheduleLayoutRefresh()
        window.addEventListener('resize', this._winResizeHandler)
      }
    }

    this._ro = ro
  }

  /** 读取双栏主体可用宽高（工作区标签页会向上查找宿主尺寸） */
  private _measureBodySize(body: HTMLElement): { w: number; h: number } {
    let w = body.clientWidth
    let h = body.clientHeight
    if (this.displayMode === 'workspace' && (w <= 0 || h <= 0)) {
      const host = body.closest('sftp-plus-workspace-tab') as HTMLElement | null
      if (host) {
        if (w <= 0) w = host.clientWidth
        if (h <= 0) h = host.clientHeight
      }
    }
    if (w <= 0) w = this._measureLayoutWidth()
    if (h <= 0) h = Math.max(320, (window.innerHeight || 800) - 140)
    return { w, h }
  }

  /** 布局模式按钮悬浮提示 */
  layoutModeTitle(): string {
    const zh = { auto: '自适应布局', horizontal: '左右布局', vertical: '上下布局', single: '单栏布局（仅远程）' }
    const en = { auto: 'Auto Layout', horizontal: 'Horizontal Layout', vertical: 'Vertical Layout', single: 'Single Pane (Remote Only)' }
    const map = this.effectiveLang === 'zh-CN' ? zh : en
    return (map as any)[this._layoutMode] || 'Auto Layout'
  }

  /** 面板分割线悬浮提示 */
  splitterTitle(): string {
    return this._isNarrowLayout
      ? this.i18n.t('pane.splitterHintVertical')
      : this.i18n.t('pane.splitterHintHorizontal')
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
  paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'> = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'filter', 'bookmark']
  logFilterOp: '' | TransferLogEntry['operation'] = ''
  logFilterStatus: '' | 'success' | 'failed' = ''

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
  /** 布局模式: 'auto' | 'horizontal' | 'vertical' | 'single' */
  _layoutMode: 'auto' | 'horizontal' | 'vertical' | 'single' = 'auto'
  _verticalSplitRatio = 0.5   // 上下布局比例（本地面板占比，默认50%）
  _horizontalSplitRatio = 0.5 // 左右布局比例
  private _splitDragStartX = 0
  private _splitDragStartY = 0
  private _splitDragStartRatio = 0.5
  private _splitMoveHandler: ((e: MouseEvent) => void) | null = null
  private _splitUpHandler: ((e: MouseEvent) => void) | null = null
  private _splitterDidDrag = false

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
    const panel = this
    this._rubberBand = new PanelRubberBand({
      zone: this.zone,
      cdr: this.cdr,
      elRef: this.elRef,
      get selectedLocal() { return panel.selectedLocal },
      set selectedLocal(v) { panel.selectedLocal = v },
      get selectedRemote() { return panel.selectedRemote },
      set selectedRemote(v) { panel.selectedRemote = v },
      get localLastSelectedIndex() { return panel.localLastSelectedIndex },
      set localLastSelectedIndex(v) { panel.localLastSelectedIndex = v },
      get remoteLastSelectedIndex() { return panel.remoteLastSelectedIndex },
      set remoteLastSelectedIndex(v) { panel.remoteLastSelectedIndex = v },
      getFilteredLocalEntries: () => panel.getFilteredLocalEntries(),
      getFilteredRemoteEntries: () => panel.getFilteredRemoteEntries(),
      closeContextMenu: () => panel.closeContextMenu(),
      closeBookmarks: () => panel.closeBookmarks(),
      fixContextMenuPosition: (x, y) => panel.fixContextMenuPosition(x, y),
      get contextMenuX() { return panel.contextMenuX },
      set contextMenuX(v) { panel.contextMenuX = v },
      get contextMenuY() { return panel.contextMenuY },
      set contextMenuY(v) { panel.contextMenuY = v },
      get contextMenuPane() { return panel.contextMenuPane },
      set contextMenuPane(v) { panel.contextMenuPane = v },
      get contextMenuEntry() { return panel.contextMenuEntry },
      set contextMenuEntry(v) { panel.contextMenuEntry = v },
      get contextMenuVisible() { return panel.contextMenuVisible },
      set contextMenuVisible(v) { panel.contextMenuVisible = v },
      get headerMenuVisible() { return panel.headerMenuVisible },
      set headerMenuVisible(v) { panel.headerMenuVisible = v },
      syncPaneSelectionVisual: (p) => panel.syncPaneSelectionVisual(p),
    })
    this._conflictResolver = new PanelConflictResolver({
      get sftpSession() { return panel.sftpSession },
      get cdr() { return panel.cdr },

      get conflictData() { return panel.conflictData },
      set conflictData(v) { panel.conflictData = v },
      get showConflictDialog() { return panel.showConflictDialog },
      set showConflictDialog(v) { panel.showConflictDialog = v },
      get conflictCurrIdx() { return panel.conflictCurrIdx },
      set conflictCurrIdx(v) { panel.conflictCurrIdx = v },
      get conflictTotalIdx() { return panel.conflictTotalIdx },
      set conflictTotalIdx(v) { panel.conflictTotalIdx = v },
      get conflictOriginalTotal() { return panel.conflictOriginalTotal },
      set conflictOriginalTotal(v) { panel.conflictOriginalTotal = v },

      get conflictQueue() { return panel._conflictQueue },
      set conflictQueue(v) { panel._conflictQueue = v },
      get conflictAllMode() { return panel._conflictAllMode as any },
      set conflictAllMode(v) { panel._conflictAllMode = v },
      get conflictResolvedKeys() { return panel._conflictResolvedKeys },
      set conflictResolvedKeys(v) { panel._conflictResolvedKeys = v },

      get selectedLocal() { return panel.selectedLocal },
      set selectedLocal(v) { panel.selectedLocal = v },
      get selectedRemote() { return panel.selectedRemote },
      set selectedRemote(v) { panel.selectedRemote = v },

      get clipboardEntries() { return panel.clipboardEntries as any },
      set clipboardEntries(v) { panel.clipboardEntries = v as any },
      get clipboardSource() { return panel.clipboardSource },
      set clipboardSource(v) { panel.clipboardSource = v },
      get clipboardMode() { return panel.clipboardMode },
      set clipboardMode(v) { panel.clipboardMode = v },
      get pendingPasteEntries() { return panel._pendingPasteEntries as any },
      set pendingPasteEntries(v) { panel._pendingPasteEntries = v as any },
      get pendingPasteDestPane() { return panel._pendingPasteDestPane },
      set pendingPasteDestPane(v) { panel._pendingPasteDestPane = v },
      get pendingPasteDestPath() { return panel._pendingPasteDestPath },
      set pendingPasteDestPath(v) { panel._pendingPasteDestPath = v },
      get pendingPasteMode() { return panel._pendingPasteMode },
      set pendingPasteMode(v) { panel._pendingPasteMode = v },
      get pendingPasteSource() { return panel._pendingPasteSource },
      set pendingPasteSource(v) { panel._pendingPasteSource = v },

      refreshRemote: () => panel.refreshRemote(),
      refreshLocal: () => panel.refreshLocal(),
      executePaste: (entries, destPane, destPath, mode, source) => panel._executePaste(entries as any, destPane, destPath, mode, source),

      doDownload: (remotePath, localPath, mode, size) => panel._doDownload(remotePath, localPath, mode, size),
      doUpload: (remotePath, localPath) => panel._doUpload(remotePath, localPath),
      downloadRemoteDir: (remoteDir, localDestDir, targetPane, top, renameTo) => panel.downloadRemoteDir(remoteDir, localDestDir, targetPane, top, renameTo),
      mergeLocalDirToRemote: (localSrc, remoteDest) => panel.mergeLocalDirToRemote(localSrc, remoteDest),
      copyLocalDir: (src, dest) => panel.copyLocalDir(src, dest),
      copyRemoteDir: (srcRemotePath, destRemotePath, isDirectory) => panel.copyRemoteDir(srcRemotePath, destRemotePath, isDirectory),
    })
    this._transferRuntime = new PanelTransferRuntime({
      get connected() { return panel.connected },
      get sftpSession() { return panel.sftpSession },
      get transfers() { return panel.transfers },
      set transfers(v) { panel.transfers = v },
      get transferLog() { return panel.transferLog },
      get profile() { return panel.profile },
      get effectiveLang() { return panel.effectiveLang },
      get notifications() { return panel.notifications },
      get cdr() { return panel.cdr },
      get zone() { return panel.zone },
      formatSpeed: (bytes, ms) => panel._formatSpeed(bytes, ms),
    })
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

  private _loadPaneToolbarLayout(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (Array.isArray(cfg?.paneCustomOrder) && cfg.paneCustomOrder.length) {
        this.paneCustomOrder = cfg.paneCustomOrder as any
      } else if (Array.isArray(cfg?.paneHeaderOrder) && Array.isArray(cfg?.paneToolbarOrder)) {
        const header = cfg.paneHeaderOrder as Array<'label' | 'path' | 'toolbar'>
        const toolbar = cfg.paneToolbarOrder as Array<'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'>
        const items: any[] = []
        for (const part of header) {
          if (part === 'toolbar') items.push(...toolbar)
          else items.push(part)
        }
        this.paneCustomOrder = items as any
      }
      return
    } catch { /* ignore */ }
    try {
      const raw = this._paneGet('sftp-plus-pane-custom-order')
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(parsed) && parsed.length) this.paneCustomOrder = parsed as any
      }
    } catch { /* ignore */ }
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
    const panel = this
    this._connLifecycle = new PanelConnectionLifecycle({
      get sshSession() { return panel.sshSession },
      set sshSession(v) { panel.sshSession = v },
      get sftpSession() { return panel.sftpSession },
      set sftpSession(v) { panel.sftpSession = v },
      get connected() { return panel.connected },
      set connected(v) { panel.connected = v },
      get connecting() { return panel.connecting },
      set connecting(v) { panel.connecting = v },
      get reconnecting() { return panel.reconnecting },
      set reconnecting(v) { panel.reconnecting = v },
      get rememberPath() { return panel.rememberPath },
      get remotePath() { return panel.remotePath },
      set remotePath(v) { panel.remotePath = v },
      get remotePathInput() { return panel.remotePathInput },
      set remotePathInput(v) { panel.remotePathInput = v },
      get terminalRef() { return panel.terminalRef },
      sftpService: this.sftpService,
      notifications: this.notifications,
      getI18n: () => panel.i18n,
      zone: this.zone,
      cdr: this.cdr,
      getDefaultRemotePath: () => panel.getDefaultRemotePath(),
      refreshRemote: () => panel.refreshRemote(),
      restoreSavedRemotePath: () => panel._restoreSavedRemotePath(),
      pushRemoteNav: (p) => panel._pushRemoteNav(p),
      clearNavHistory: () => {
        panel._remoteNav.clear()
        panel._localNav.clear()
      },
      clearRemoteListing: () => panel.clearRemoteListing(),
      setRemoteLoading: (loading) => { panel._remoteLoading = loading },
    })

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
      if (lmode === 'horizontal' || lmode === 'vertical' || lmode === 'single') this._layoutMode = lmode

      this._bindLayoutObservers()
    } catch { /* ResizeObserver 不可用时忽略 */ }

    // Auto 模式：跟随 Tabby 当前主题配色
    this._applyAutoTheme()
    this._loadPaneToolbarLayout()

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
      // 同步书签与传输日志（其他面板或导入后可能已变更）
      this.bookmarks.reload()
      this.transferLog.reload()
      this._loadPaneToolbarLayout()
      // 重新读取布局模式并立即应用（同步窄屏判断 + 面板分割）
      const lmode = this._paneGet('sftp-plus-layout-mode')
      if (lmode === 'horizontal' || lmode === 'vertical' || lmode === 'single') this._layoutMode = lmode
      else this._layoutMode = 'auto'
      if (this._layoutMode === 'horizontal') this._isNarrowLayout = false
      else if (this._layoutMode === 'vertical') this._isNarrowLayout = true
      else if (this._layoutMode === 'single') this._isNarrowLayout = false
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
        if (this._bookmarkJustOpened) return
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
        if (target?.closest('.context-menu')) return
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
    this._scheduleLayoutRefresh()
    if (this.displayMode === 'workspace') {
      setTimeout(() => this._scheduleLayoutRefresh(), 0)
      setTimeout(() => this._scheduleLayoutRefresh(), 120)
    }
  }

  ngOnDestroy(): void {
    this._rubberBand.dispose()
    this._transferRuntime.dispose()
    if (this._splitMoveHandler) {
      document.removeEventListener('mousemove', this._splitMoveHandler)
      this._splitMoveHandler = null
    }
    if (this._splitUpHandler) {
      document.removeEventListener('mouseup', this._splitUpHandler)
      this._splitUpHandler = null
    }
    this.saveCurrentPath()
    this._paneFlushToConfig()  // 面板销毁前持久化所有 UI 状态到 config
    this.disconnect()
    this._clearPanelTimers()
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
    // 清理所有进行中的传输与续传定时器
    this._transferRuntime.clearTransfers()
    // 取消挂起的 rAF 并断开 ResizeObserver
    if (this._roRafId) {
      cancelAnimationFrame(this._roRafId)
      this._roRafId = 0
    }
    if (this._ro) {
      try { this._ro.disconnect() } catch {}
      this._ro = null
    }
    if (this._winResizeHandler) {
      window.removeEventListener('resize', this._winResizeHandler)
      this._winResizeHandler = null
    }
    void this._cleanupEditorTemp()
    void this._cleanupViewerTemp()
  }

  private _settingsChangedHandler: (() => void) | null = null
  private _themeSub: any = null
  private _docClickCapture: ((ev: MouseEvent) => void) | null = null
  private _docWheelCapture: ((ev: WheelEvent) => void) | null = null
  private _ro: ResizeObserver | null = null
  /** P2-11: 挂起的 rAF ID，ngOnDestroy 中取消以防止操作已销毁的视图 */
  private _roRafId = 0
  private _winResizeHandler: (() => void) | null = null

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
    if (this.displayMode !== 'workspace') {
      this.disconnect()
    }
    this.onClose?.()
  }

  /** 最小化面板（不销毁，下次点击入口直接恢复） */
  minimize(): void {
    this.saveCurrentPath()
    this.minimized = true
    this.onMinimize?.()
  }

  /** 打开 Tabby 设置并定位到 SFTP+ 页面 */
  openPluginSettings(): void {
    this.zone.run(() => {
      try {
        const app = this.injector.get(AppService)
        openSftpPlusSettings(app)
      } catch (e) {
        console.error('[SFTP+] openPluginSettings failed', e)
      }
    })
  }

  // ========== 连接管理（委托 panel/connection-lifecycle） ==========
  connect(): Promise<void> {
    return this._connLifecycle.connect()
  }

  disconnect(): void {
    this._connLifecycle?.disconnect()
  }

  /** 清空远程列表与 uid 映射（断开/会话失效时调用） */
  clearRemoteListing(): void {
    this.remoteEntries = []
    this._remoteError = false
    this._invalidateRemoteCache()
    this.remoteIdResolver.reset()
  }

  private _clearPanelTimers(): void {
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null }
    if (this._remoteLoadingTimer) { clearTimeout(this._remoteLoadingTimer); this._remoteLoadingTimer = null }
    if (this._remoteFlashTimer) { clearTimeout(this._remoteFlashTimer); this._remoteFlashTimer = null }
    if (this._localFlashTimer) { clearTimeout(this._localFlashTimer); this._localFlashTimer = null }
  }

  private _filesAreSame(localSize: number, localMtime: number, remoteSize: number, remoteMtime: number): boolean {
    return localSize === remoteSize
      && Math.abs(localMtime - remoteMtime) <= SftpFloatingPanel.MTIME_TOLERANCE_MS
  }

  /**
   * 冲突解决：将本地目录合并上传到远程目标路径（覆盖同名文件）
   */
  async mergeLocalDirToRemote(localSrc: string, remoteDest: string): Promise<void> {
    if (!this.sftpSession) return
    try { await this.sftpSession.mkdir(remoteDest) } catch { /* 已存在 */ }
    const children = await fs.readdir(localSrc, { withFileTypes: true })
    for (const c of children) {
      if (c.isSymbolicLink()) continue
      const localP = path.join(localSrc, c.name)
      const remoteP = path.posix.join(remoteDest, c.name)
      if (c.isDirectory()) {
        await this.mergeLocalDirToRemote(localP, remoteP)
      } else {
        await this._doUploadRaw(remoteP, localP)
      }
    }
    await this.refreshRemote()
  }

  private _remoteEnrichOptions(): SftpEnrichOptions {
    const wantOwner = this.remoteShowColOwner || this.remoteShowColGroup
    return {
      atime: this.remoteShowColAccess,
      ownerGroup: wantOwner,
      statFallback: false,
    }
  }

  private _remoteNeedsEnrich(): boolean {
    return this.remoteShowColAccess
      || this.remoteShowColOwner
      || this.remoteShowColGroup
  }

  private async _enrichRemoteMetadata(
    snapshotPath: string,
    baseEntries: SFTPFile[],
    refreshGen: number,
  ): Promise<void> {
    if (!this.connected || !this.sftpSession || this.remotePath !== snapshotPath) return
    if (refreshGen !== this._remoteRefreshGen) return

    let entries = baseEntries
    if (this._remoteNeedsEnrich()) {
      entries = await enrichSftpFilesWithAtime(
        this.sftpSession, snapshotPath, baseEntries, this._remoteEnrichOptions(),
      )
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._invalidateRemoteCache()
        this.cdr.detectChanges()
      })
    }

    const wantOwner = this.remoteShowColOwner || this.remoteShowColGroup
    if (wantOwner && !this.remoteIdResolver.remoteExecDisabled) {
      entries = await enrichRemoteOwnersViaStat(this.sftpSession, entries)
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._invalidateRemoteCache()
        this.cdr.detectChanges()
      })
    }

    if (!wantOwner || !this.sshSession) return
    await this.remoteIdResolver.ensureUidMap(this.sshSession)
    if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
    const named = this.applyRemoteOwnerGroupNames(entries)
    this.zone.run(() => {
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.remoteEntries = named
      this._invalidateRemoteCache()
      this.cdr.detectChanges()
    })
  }

  onReconnect(): Promise<void> {
    return this._connLifecycle.reconnect()
  }

  private getDefaultRemotePath(): string {
    return '/'
  }

  private applyRemoteOwnerGroupNames(entries: SFTPFile[]): SFTPFile[] {
    const r = this.remoteIdResolver
    return entries.map(e => {
      const ownerUid = e.ownerUid ?? this.numericIdFromLabel(e.owner)
      const groupGid = e.groupGid ?? this.numericIdFromLabel(e.group)
      const ownerLabel = this.nonNumericLabel(e.owner)
      const groupLabel = this.nonNumericLabel(e.group)
      return {
        ...e,
        ownerUid,
        groupGid,
        owner: r.ownerName(ownerLabel, ownerUid),
        group: r.groupName(groupLabel, groupGid),
      }
    })
  }

  private nonNumericLabel(v: unknown): string | undefined {
    if (v == null) return undefined
    const s = String(v).trim()
    return s && !/^\d+$/.test(s) ? s : undefined
  }

  private numericIdFromLabel(v: unknown): number | undefined {
    if (v == null) return undefined
    const s = String(v).trim()
    if (!/^\d+$/.test(s)) return undefined
    const n = parseInt(s, 10)
    return Number.isNaN(n) ? undefined : n
  }

  // ========== 本地文件 ==========
  async refreshLocal(): Promise<void> {
    this.localPathInput = this.localPath
    if (!this.localPath || typeof this.localPath !== 'string') {
      console.warn('[SFTP+] refreshLocal skipped: localPath is invalid')
      return
    }
    // 刷新时不显示 loading 动画（避免布局 reflow 导致晃动），直接用闪烁反馈
    this._localFlash = false
    // this.cdr.detectChanges()  // 去掉强制变更检测，避免重绘抖动
    try {
      const names = await fs.readdir(this.localPath)
      const needOwner = this.localShowColOwner || this.localShowColGroup
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
            owner: needOwner ? st.uid : undefined,
            group: needOwner ? st.gid : undefined,
          })
        } catch {
          entries.push({ name, fullPath: fp, isDirectory: true, inaccessible: true })
        }
      }
      this.zone.run(() => { this.localEntries = entries; this._localError = false; this._invalidateLocalCache() })
      if (needOwner) {
        void this._enrichLocalOwnerNames(entries)
      }
    } catch (e) {
      console.error('[SFTP+] Local listing failed', e)
      this.zone.run(() => { this.localEntries = []; this._localError = true; this._invalidateLocalCache() })
    }
    this._localFlash = true
    this.cdr.detectChanges()
    if (this._localFlashTimer) clearTimeout(this._localFlashTimer)
    this._localFlashTimer = setTimeout(() => { this._localFlash = false; this._localFlashTimer = null }, 260)
  }

  private async _enrichLocalOwnerNames(baseEntries: LocalEntry[]): Promise<void> {
    const snapshotPath = this.localPath
    await this.localIdResolver.ensureLocalMaps()
    if (this.localPath !== snapshotPath) return
    const enriched = baseEntries.map(e => ({
      ...e,
      owner: typeof e.owner === 'number'
        ? this.localIdResolver.ownerName(undefined, e.owner)
        : e.owner,
      group: typeof e.group === 'number'
        ? this.localIdResolver.groupName(undefined, e.group)
        : e.group,
    }))
    this.zone.run(() => {
      if (this.localPath !== snapshotPath) return
      this.localEntries = enriched
      this._invalidateLocalCache()
      this.cdr.detectChanges()
    })
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
    const refreshGen = ++this._remoteRefreshGen
    this.remotePathInput = this.remotePath
    if (!this.remotePath || typeof this.remotePath !== 'string') {
      console.warn('[SFTP+] refreshRemote skipped: remotePath is invalid, resetting to /')
      this.remotePath = '/'
      this.remotePathInput = '/'
    }
    this._remoteFlash = false

    if (this._remoteLoadingTimer) {
      clearTimeout(this._remoteLoadingTimer)
      this._remoteLoadingTimer = null
    }
    this._remoteLoadingTimer = setTimeout(() => {
      if (refreshGen !== this._remoteRefreshGen) return
      this._remoteLoading = true
      this.cdr.detectChanges()
    }, 150)

    const snapshotPath = this.remotePath
    try {
      const entries = await this.sftpSession.readdir(snapshotPath)
      if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return true
      if (this._remoteLoadingTimer) {
        clearTimeout(this._remoteLoadingTimer)
        this._remoteLoadingTimer = null
      }
      this._remoteLoading = false
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._remoteError = false
        this._invalidateRemoteCache()
      })
      if (this._remoteNeedsEnrich()) {
        void this._enrichRemoteMetadata(snapshotPath, entries, refreshGen)
      }
    } catch (e) {
      if (refreshGen !== this._remoteRefreshGen) return false
      if (this._remoteLoadingTimer) {
        clearTimeout(this._remoteLoadingTimer)
        this._remoteLoadingTimer = null
      }
      this._remoteLoading = false
      console.error('[SFTP+] Remote listing failed', e)
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = []
        this._remoteError = true
        this._invalidateRemoteCache()
      })
      this.cdr.detectChanges()
      return false
    }
    if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return true
    this._remoteFlash = true
    this.cdr.detectChanges()
    if (this._remoteFlashTimer) clearTimeout(this._remoteFlashTimer)
    this._remoteFlashTimer = setTimeout(() => {
      this._remoteFlash = false
      this._remoteFlashTimer = null
    }, 260)
    return true
  }

  // ========== 远程导航历史 ==========

  /**
   * 将路径加入导航历史（后退/前进用）
   */
  private _pushRemoteNav(newPath: string): void {
    this._remoteNav.push(newPath, this._ignoreNavPush)
  }

  /** 后退 */
  async remoteBack(): Promise<void> {
    if (!this.canRemoteBack) return
    const target = this._remoteNav.back()
    if (!target) {
      console.warn('[SFTP+] remoteBack: history entry invalid, aborting')
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
    const target = this._remoteNav.forward()
    if (!target) {
      console.warn('[SFTP+] remoteForward: history entry invalid, aborting')
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
    this._localNav.push(newPath, this._ignoreLocalNavPush)
  }

  /** 后退 */
  localBack(): void {
    if (!this.canLocalBack) return
    const target = this._localNav.back()
    if (!target) {
      console.warn('[SFTP+] localBack: history entry invalid, aborting')
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
    const target = this._localNav.forward()
    if (!target) {
      console.warn('[SFTP+] localForward: history entry invalid, aborting')
      return
    }
    this._ignoreLocalNavPush = true
    this.localPath = target
    this.localPathInput = this.localPath
    this.saveCurrentPath()
    void this.refreshLocal()
    this._ignoreLocalNavPush = false
  }

  // ========== 框选（委托 panel/panel-rubber-band） ==========
  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._rubberBand.onPaneListClick(event, pane)
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._commitPathInput(pane)
    this._rubberBand.onPaneMouseDown(event, pane)
  }

  /** 失焦或点击列表时：放弃未提交的编辑，恢复为当前路径 */
  onLocalPathBlur(): void {
    this.localPathInput = this.localPath
  }

  onRemotePathBlur(): void {
    this.remotePathInput = this.remotePath
  }

  private _commitPathInput(pane: 'local' | 'remote'): void {
    const listSel = pane === 'local' ? '.pane-list.local-pane' : '.pane-list.remote-pane'
    const inp = (this.elRef.nativeElement as HTMLElement)
      .querySelector(`${listSel}`)?.closest('.pane')?.querySelector('.path-input') as HTMLInputElement | null
    if (inp && document.activeElement === inp) inp.blur()
    if (pane === 'local') this.localPathInput = this.localPath
    else this.remotePathInput = this.remotePath
  }

  // ========== 窄屏上下布局分割线 ==========

  /** 根据当前布局应用面板分割比例 */
  private _applyPaneSplit(): void {
    if (!this.elRef?.nativeElement) return
    const body = this.elRef.nativeElement.querySelector('.sftp-body') as HTMLElement | null
    if (!body) return
    const panes: HTMLElement[] = Array.from(body.querySelectorAll(':scope > sftp-file-pane'))
    if (panes.length < 1) return

    // 单栏模式：仅远程面板全宽
    if (this._layoutMode === 'single') {
      body.style.flexDirection = 'row'
      body.classList.remove('narrow-layout')
      const remote = panes[panes.length - 1]
      remote.style.flex = '1'
      remote.style.width = 'auto'
      remote.style.minWidth = '0'
      remote.style.height = ''
      return
    }

    if (panes.length < 2) return

    // 设置 flex-direction：用 JS 控制，避免 CSS @media 使用视口宽度与元素宽度不同步
    // （panelHost width:96% 导致元素宽度 < 视口宽度，阈值区 961-1000px 时会错位）
    body.style.flexDirection = this._isNarrowLayout ? 'column' : 'row'
    // 窄屏 class 控制分割线样式（cursor、width/height），同步于布局而非视口
    body.classList.toggle('narrow-layout', this._isNarrowLayout)

    // 清除之前可能残留的内联样式（防止宽窄切换后样式残留）
    panes.forEach(p => { p.style.flex = ''; p.style.width = ''; p.style.height = '' })

    const splitterSize = 5
    const { w: bodyW, h: bodyH } = this._measureBodySize(body)

    if (this._isNarrowLayout) {
      // 窄屏上下布局：按比例分配高度
      panes[0].style.flex = 'none'
      panes[0].style.height = Math.max(80, (bodyH - splitterSize) * this._verticalSplitRatio) + 'px'
      panes[1].style.flex = '1'
      panes[1].style.minHeight = '80px'
    } else {
      // 宽屏左右布局：按比例分配宽度，最小宽度 450px
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
    this._splitterDidDrag = false
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
      if (Math.abs(e.clientX - this._splitDragStartX) > 3 || Math.abs(e.clientY - this._splitDragStartY) > 3) {
        this._splitterDidDrag = true
      }
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

  onSplitterDblClick(ev: MouseEvent): void {
    ev.preventDefault()
    if (this._splitterDidDrag) {
      this._splitterDidDrag = false
      return
    }
    this.resetSplitter()
  }

  /** 双击分割线恢复默认大小 */
  resetSplitter(): void {
    this._verticalSplitRatio = 0.5
    this._horizontalSplitRatio = 0.5
    this._applyPaneSplit()
    try {
      this._paneSet('sftp-plus-vertical-split-ratio', '0.5')
      this._paneSet('sftp-plus-horizontal-split-ratio', '0.5')
    } catch {}
  }

  // ========== 选择 ==========
  /** 将列表行 DOM 的 selected 类与当前选中模型对齐（框选会直接改 DOM，需兜底） */
  syncPaneSelectionVisual(pane: 'local' | 'remote'): void {
    const listEl = this.elRef.nativeElement.querySelector(`.pane-list.${pane}-pane`) as HTMLElement | null
    if (!listEl) return
    const paths = pane === 'local' ? this._localSelectedPaths : this._remoteSelectedPaths
    listEl.querySelectorAll('.entry[data-path]').forEach(el => {
      const p = el.getAttribute('data-path')
      if (p && paths.has(p)) el.classList.add('selected')
      else el.classList.remove('selected')
    })
  }

  selectLocal(entry: LocalEntry, event: MouseEvent, idx: number): void {
    // 选中本地面板时清除远程面板选中（仅允许单侧选中）
    if (this.selectedRemote.length > 0) this.selectedRemote = []
    const list = this.getFilteredLocalEntries()
    if (event.ctrlKey || event.metaKey) {
      this.selectedLocal = this._localSelectedPaths.has(entry.fullPath)
        ? this.selectedLocal.filter(e => e.fullPath !== entry.fullPath)
        : [...this.selectedLocal, entry]
      this.localLastSelectedIndex = idx
    } else if (event.shiftKey && this.localLastSelectedIndex !== null) {
      const [f, t] = this.localLastSelectedIndex < idx ? [this.localLastSelectedIndex, idx] : [idx, this.localLastSelectedIndex]
      const set = new Map(this.selectedLocal.map(e => [e.fullPath, e]))
      list.slice(f, t + 1).forEach(e => set.set(e.fullPath, e))
      this.selectedLocal = Array.from(set.values())
    } else if (this._localSelectedPaths.has(entry.fullPath)) {
      // 点击已选中的项目：若为单选则取消选中，若为多选则变为单选
      this.selectedLocal = this.selectedLocal.length === 1 ? [] : [entry]
      this.localLastSelectedIndex = idx
    } else {
      this.selectedLocal = [entry]
      this.localLastSelectedIndex = idx
    }
    this.syncPaneSelectionVisual('local')
    this.cdr.detectChanges()
  }

  isLocalSelected(e: LocalEntry): boolean { return this._localSelectedPaths.has(e.fullPath) }

  selectRemote(entry: SFTPFile, event: MouseEvent, idx: number): void {
    // 选中远程面板时清除本地面板选中（仅允许单侧选中）
    if (this.selectedLocal.length > 0) this.selectedLocal = []
    const list = this.getFilteredRemoteEntries()
    if (event.ctrlKey || event.metaKey) {
      this.selectedRemote = this._remoteSelectedPaths.has(entry.fullPath)
        ? this.selectedRemote.filter(e => e.fullPath !== entry.fullPath)
        : [...this.selectedRemote, entry]
      this.remoteLastSelectedIndex = idx
    } else if (event.shiftKey && this.remoteLastSelectedIndex !== null) {
      const [f, t] = this.remoteLastSelectedIndex < idx ? [this.remoteLastSelectedIndex, idx] : [idx, this.remoteLastSelectedIndex]
      const set = new Map(this.selectedRemote.map(e => [e.fullPath, e]))
      list.slice(f, t + 1).forEach(e => set.set(e.fullPath, e))
      this.selectedRemote = Array.from(set.values())
    } else if (this._remoteSelectedPaths.has(entry.fullPath)) {
      this.selectedRemote = this.selectedRemote.length === 1 ? [] : [entry]
      this.remoteLastSelectedIndex = idx
    } else {
      this.selectedRemote = [entry]
      this.remoteLastSelectedIndex = idx
    }
    this.syncPaneSelectionVisual('remote')
    this.cdr.detectChanges()
  }

  isRemoteSelected(e: SFTPFile): boolean { return this._remoteSelectedPaths.has(e.fullPath) }

  // ========== 排序 ==========
  setLocalSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    // 拖拽列宽后 200ms 内忽略点击排序
    if (this._colJustResized) return
    this.localSortAsc = this.localSortBy === f ? !this.localSortAsc : true
    this.localSortBy = f
    this._invalidateLocalCache()
    try { this._paneSet('sftp-plus-local-sort', JSON.stringify({ by: this.localSortBy, asc: this.localSortAsc })) } catch {}
  }

  setRemoteSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    if (f === 'birthtime') return
    if (this._colJustResized) return
    this.remoteSortAsc = this.remoteSortBy === f ? !this.remoteSortAsc : true
    this.remoteSortBy = f
    this._invalidateRemoteCache()
    try { this._paneSet('sftp-plus-remote-sort', JSON.stringify({ by: this.remoteSortBy, asc: this.remoteSortAsc })) } catch {}
  }

  // ========== 过滤 ==========

  /** 应用本地过滤（pending → actual）并隐藏输入框 */
  applyLocalFilter(): void {
    this.localFilter = this.localFilterPending
    this.localFilterVisible = false
    this._invalidateLocalCache()
  }

  /** 清空本地过滤并隐藏输入框 */
  clearLocalFilter(): void {
    this.localFilterPending = ''
    this.localFilter = ''
    this.localFilterVisible = false
    this._invalidateLocalCache()
  }

  /** 应用远程过滤（pending → actual）并隐藏输入框 */
  applyRemoteFilter(): void {
    this.remoteFilter = this.remoteFilterPending
    this.remoteFilterVisible = false
    this._invalidateRemoteCache()
  }

  /** 清空远程过滤并隐藏输入框 */
  clearRemoteFilter(): void {
    this.remoteFilterPending = ''
    this.remoteFilter = ''
    this.remoteFilterVisible = false
    this._invalidateRemoteCache()
  }

  // ========== 过滤结果缓存（P1-10：避免每次变更检测重复计算） ==========
  private _localFilteredCache: LocalEntry[] | null = null
  private _localFilterDirty = true
  private _remoteFilteredCache: SFTPFile[] | null = null
  private _remoteFilterDirty = true

  private _invalidateLocalCache(): void { this._localFilterDirty = true }
  private _invalidateRemoteCache(): void { this._remoteFilterDirty = true }

  /** trackBy 函数：避免 *ngFor 每次变更检测重建所有 DOM 节点 */
  trackLocalEntryBy(_index: number, item: LocalEntry): string { return item.fullPath }
  trackRemoteEntryBy(_index: number, item: SFTPFile): string { return item.fullPath }

  getFilteredLocalEntries(): LocalEntry[] {
    if (!this._localFilterDirty && this._localFilteredCache) return this._localFilteredCache
    let entries = filterByHidden([...this.localEntries], this.showHiddenLocal)
    entries = filterByName(entries, this.localFilter)
    this._localFilteredCache = sortLocalEntries(entries, this.localSortBy, this.localSortAsc, this.pinFoldersLocal)
    this._localFilterDirty = false
    return this._localFilteredCache
  }

  getFilteredRemoteEntries(): SFTPFile[] {
    if (!this._remoteFilterDirty && this._remoteFilteredCache) return this._remoteFilteredCache
    let entries = filterByHidden([...this.remoteEntries], this.showHiddenRemote)
    entries = filterByName(entries, this.remoteFilter)
    this._remoteFilteredCache = sortRemoteEntries(entries, this.remoteSortBy, this.remoteSortAsc, this.pinFoldersRemote)
    this._remoteFilterDirty = false
    return this._remoteFilteredCache
  }

  // ========== 打开 ==========
  /** 单击处理：延迟执行选择，避免与双击冲突 */
  onLocalClick(entry: LocalEntry, event: MouseEvent, idx: number): void {
    this.activePane = 'local'
    if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
    // 取消延迟选择：直接执行选择，消除点击卡顿感
    if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
    // 重新设置 250ms 定时器仅用于 dblclick 检测（openLocal 会清除此定时器）
    this.localClickTimer = setTimeout(() => {
      this.localClickTimer = null
    }, 250)
    this.selectLocal(entry, event, idx)
  }

  /**
   * 通过 POSIX mode 位判断是否为目录
   * 功能描述：用 (mode & S_IFMT) === S_IFDIR 检测，比 isDirectory 更可靠
   *          因为 Windows SFTP 对 junction/reparse point 目录可能误报 isDirectory = false
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-22
   */
  private isDirByMode = isDirByMode

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
    if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
    if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
    // 重新设置 250ms 定时器仅用于 dblclick 检测
    this.remoteClickTimer = setTimeout(() => {
      this.remoteClickTimer = null
    }, 250)
    this.selectRemote(entry, event, idx)
  }


  // ========== 子组件桥接 ==========
  colHeaderLabelFn = (col: string) => this.colHeaderLabel(col)
  colValueFn = (col: string, e: any) => this.colValue(col, e)
  isLocalSelectedFn = (e: LocalEntry) => this.isLocalSelected(e)
  isRemoteSelectedFn = (e: SFTPFile) => this.isRemoteSelected(e)
  localSortArrowFn = (col: string) => this.sortArrow(col, 'local')
  remoteSortArrowFn = (col: string) => this.sortArrow(col, 'remote')

  get contextColVisibility() {
    const local = this.contextMenuPane === 'local'
    return {
      size: local ? this.localShowColSize : this.remoteShowColSize,
      date: local ? this.localShowColDate : this.remoteShowColDate,
      created: local ? this.localShowColCreated : false,
      access: local ? this.localShowColAccess : this.remoteShowColAccess,
      owner: local ? this.localShowColOwner : this.remoteShowColOwner,
      group: local ? this.localShowColGroup : this.remoteShowColGroup,
      perms: local ? this.localShowColPerms : this.remoteShowColPerms,
      mode: local ? this.localShowColMode : this.remoteShowColMode,
      path: local ? this.localShowColPath : this.remoteShowColPath,
      ext: local ? this.localShowColExt : this.remoteShowColExt,
    }
  }

  get detailsDisplay(): DetailsDisplay | null {
    const e = this.detailsEntry
    if (!e) return null
    const isZh = this.effectiveLang === 'zh-CN'
    return {
      name: e.name,
      type: e.isDirectory ? (isZh ? '文件夹' : 'Folder') : (this.getFileExt(e.name) || (isZh ? '文件' : 'File')),
      path: this.getEntryPath(e),
      size: e.isDirectory ? undefined : this.formatSize(this.getEntrySize(e)),
      modified: this.formatDate(this.getEntryMtime(e)),
      created: this.getEntryBirthtimeMs(e) ? this.formatDate(this.getEntryBirthtimeMs(e)) : undefined,
      accessed: this.getEntryAtimeMs(e) ? this.formatDate(this.getEntryAtimeMs(e)) : undefined,
      perms: this.getEntryMode(e) != null
        ? this.formatMode(this.getEntryMode(e)) + ' (' + this.formatOctalMode(this.getEntryMode(e)) + ')'
        : undefined,
      owner: this.getEntryOwner(e) != null ? String(this.getEntryOwner(e)) : undefined,
      group: this.getEntryGroup(e) != null ? String(this.getEntryGroup(e)) : undefined,
    }
  }

  getLocalSelectionInfo(): string {
    const count = this.getFilteredLocalEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this.selectedLocal.length) {
      const zh = this.effectiveLang === 'zh-CN'
      const sizePart = this.formatSelectedSizeLocal()
        + (this.selectedHasDirLocal() ? (zh ? '，文件夹不计' : ', excl. folders') : '')
      s += zh
        ? ` — 已选择 ${this.selectedLocal.length} 项 (${sizePart})`
        : ` — Selected ${this.selectedLocal.length} items (${sizePart})`
    }
    return s
  }

  getRemoteSelectionInfo(): string {
    const count = this.getFilteredRemoteEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this.selectedRemote.length) {
      const zh = this.effectiveLang === 'zh-CN'
      const sizePart = this.formatSelectedSizeRemote()
        + (this.selectedHasDirRemote() ? (zh ? '，文件夹不计' : ', excl. folders') : '')
      s += zh
        ? ` — 已选择 ${this.selectedRemote.length} 项 (${sizePart})`
        : ` — Selected ${this.selectedRemote.length} items (${sizePart})`
    }
    return s
  }

  onLocalPaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this.localBack(); break
      case 'forward': this.localForward(); break
      case 'up': this.localUp(); break
      case 'home': this.goLocalHome(); break
      case 'refresh': void this.refreshLocal(); break
      case 'toggleFilter': this.localFilterVisible = !this.localFilterVisible; break
    }
  }

  onRemotePaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this.remoteBack(); break
      case 'forward': this.remoteForward(); break
      case 'up': this.remoteUp(); break
      case 'home': this.goRemoteHome(); break
      case 'refresh': void this.refreshRemote(); break
      case 'toggleFilter': this.remoteFilterVisible = !this.remoteFilterVisible; break
    }
  }

  onLocalSort(e: PaneSortAction): void { this.setLocalSort(e.col as any) }
  onRemoteSort(e: PaneSortAction): void { this.setRemoteSort(e.col as any) }

  onContextMenuAction(action: ContextMenuAction): void {
    switch (action) {
      case 'newFolder': this.ctxNewFolder(); break
      case 'newFile': this.ctxNewFile(); break
      case 'rename': this.ctxRename(); break
      case 'delete': this.ctxDelete(); break
      case 'viewFile': void this.ctxViewFile(); break
      case 'editFile': void this.ctxEditFile(); break
      case 'upload': void this.ctxUpload(); break
      case 'download': void this.ctxDownload(); break
      case 'revealInExplorer': this.ctxRevealInExplorer(); break
      case 'chmod': this.ctxChmod(); break
      case 'details': this.ctxDetails(); break
      case 'copy': this.ctxClipboardCopy(); break
      case 'cut': this.ctxClipboardCut(); break
      case 'paste': this.ctxClipboardPaste(); break
      case 'refresh': this.ctxRefresh(); break
      case 'selectAll': this.ctxSelectAll(); break
      case 'selectInvert': this.ctxSelectInvert(); break
      case 'copyPath': this.ctxCopyPath(); break
    }
  }

  onHeaderMenuAction(action: HeaderMenuAction): void {
    if (action === 'adjustCol') { this.adjustColumnWidth(); return }
    if (action === 'adjustAllCols') { this.adjustAllColumnsWidth(); return }
    if (action === 'togglePinFolders') { this.togglePinFolders(this.contextMenuPane); return }
    if (action === 'toggleHidden') { this.toggleShowHidden(this.contextMenuPane); return }
    if (action === 'toggleColBorders') { this.toggleColBorders(); return }
    if (action === 'toggleZebra') { this.toggleZebra(); return }
    if (action.startsWith('toggleCol:')) {
      this.toggleColumn(action.slice('toggleCol:'.length), this.contextMenuPane)
    }
  }

  onPermFieldChange(e: { field: PermField; value: boolean }): void {
    const map: Record<PermField, string> = {
      ownerRead: 'permOwnerRead', ownerWrite: 'permOwnerWrite', ownerExec: 'permOwnerExec',
      groupRead: 'permGroupRead', groupWrite: 'permGroupWrite', groupExec: 'permGroupExec',
      otherRead: 'permOtherRead', otherWrite: 'permOtherWrite', otherExec: 'permOtherExec',
    }
    ;(this as any)[map[e.field]] = e.value
    this.updatePermMode()
  }

  // ========== 格式（委托 panel/panel-format） ==========
  formatSize = formatSize
  formatDate = formatDate
  formatPercent = formatPercent
  formatLogTime = formatLogTime
  formatLogTimeRange = formatLogTimeRange
  formatDuration = formatDuration
  formatSpeedFromSize = formatSpeedFromSize
  getLogFileName = getLogFileName

  formatFailReason(entry: TransferLogEntry): string {
    return formatFailReasonFn(entry, this.effectiveLang === 'zh-CN')
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
  private _normRemoteDir(p: string): string {
    const n = path.posix.normalize(p || '/')
    return n.length > 1 && n.endsWith('/') ? n.slice(0, -1) : n
  }

  /** 内部拖拽落点与源在同一目录（同面板拖放无意义） */
  private _isSameDirInternalDrop(payload: DragPayload, targetPane: 'local' | 'remote'): boolean {
    if (payload.kind === 'local-paths' && targetPane === 'local') {
      const cur = path.resolve(this.localPath)
      return payload.paths.every(p => path.resolve(path.dirname(p.fullPath)) === cur)
    }
    if (payload.kind === 'remote-paths' && targetPane === 'remote') {
      const cur = this._normRemoteDir(this.remotePath)
      return payload.paths.every(p => this._normRemoteDir(path.posix.dirname(p.remotePath)) === cur)
    }
    return false
  }

  private _isInternalSameDirDrag(targetPane: 'local' | 'remote'): boolean {
    return this._dragSameDirNoop && this._dragSourcePane === targetPane
  }

  private _resetFileDragState(): void {
    this._dragSourcePane = null
    this._dragSameDirNoop = false
    this._localDragOver = false
    this._remoteDragOver = false
  }

  onEntryDragEnd(): void {
    this._resetFileDragState()
    this.cdr.detectChanges()
  }

  onDragOver(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    if (this._colHeaderDragging) return
    if (this._isInternalSameDirDrag(targetPane)) {
      ev.preventDefault()
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'none'
      return
    }
    ev.preventDefault()
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
  }

  onDragEnter(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    if (this._colHeaderDragging) return
    if (this._isInternalSameDirDrag(targetPane)) {
      ev.preventDefault()
      return
    }
    ev.preventDefault()
    if (targetPane === 'remote') {
      this._remoteDragOver = true
    } else {
      this._localDragOver = true
    }
    this.cdr.detectChanges()
  }

  onDragLeave(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    if (this._colHeaderDragging) return
    ev.preventDefault()
    // 仅当真正离开 pane-list 时才取消高亮（避免鼠标在子元素间移动时误触发 dragleave）
    const related = ev.relatedTarget as Node | null
    const paneList = this.elRef.nativeElement.querySelector(`.pane-list.${targetPane}-pane`) as HTMLElement | null
    if (paneList && related && paneList.contains(related)) return
    if (targetPane === 'remote') {
      this._remoteDragOver = false
    } else {
      this._localDragOver = false
    }
    this.cdr.detectChanges()
  }

  onDragStartLocal(ev: DragEvent, entry: LocalEntry): void {
    // 如果条目未被选中→取消拖拽，允许从文件条目开始框选（模仿 Windows 行为）
    // 标记 _rbDragCancelled 告知 _rbOnMouseMove 可以激活框选
    if (!this.selectedLocal.some(e => e.fullPath === entry.fullPath)) {
      ev.preventDefault()
      this._rubberBand.markDragCancelled()
      return
    }
    // 拖拽开始时清理框选状态，避免拖拽结束后框选逻辑被意外触发
    this._rubberBand.cleanup()
    const src = this._localSelectedPaths.has(entry.fullPath) && this.selectedLocal.length
      ? this.selectedLocal : [entry]
    const cur = path.resolve(this.localPath)
    this._dragSourcePane = 'local'
    this._dragSameDirNoop = src.every(e => path.resolve(path.dirname(e.fullPath)) === cur)
    const p: DragPayload = { kind: 'local-paths', paths: src.map(e => ({ fullPath: e.fullPath, name: e.name, isDirectory: e.isDirectory })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))

    // 本地文件真实存在于磁盘，设置 OS 拖拽数据（FilePath + text/uri-list）以支持拖到桌面/资源管理器
    const uriList: string[] = []
    for (const e of src) {
      try {
        const file = new File([''], e.name)
        ;(file as any).path = e.fullPath
        ev.dataTransfer?.items.add(file)
        uriList.push(`file:///${e.fullPath.replace(/\\/g, '/')}`)
      } catch { /* 跳过无法添加的文件 */ }
    }
    if (uriList.length) {
      ev.dataTransfer?.setData('text/uri-list', uriList.join('\r\n'))
      ev.dataTransfer!.dropEffect = 'copy'
      ev.dataTransfer!.effectAllowed = 'copy'
    }
  }

  onDragStartRemote(ev: DragEvent, entry: SFTPFile): void {
    if (!this.connected) return
    // 如果条目未被选中→取消拖拽，允许从文件条目开始框选
    // 标记 _rbDragCancelled 告知 _rbOnMouseMove 可以激活框选
    if (!this.selectedRemote.some(e => e.fullPath === entry.fullPath)) {
      ev.preventDefault()
      this._rubberBand.markDragCancelled()
      return
    }
    // 拖拽开始时清理框选状态，避免拖拽结束后框选逻辑被意外触发
    this._rubberBand.cleanup()
    const src = this._remoteSelectedPaths.has(entry.fullPath) && this.selectedRemote.length
      ? this.selectedRemote : [entry]
    const cur = this._normRemoteDir(this.remotePath)
    this._dragSourcePane = 'remote'
    this._dragSameDirNoop = src.every(e => this._normRemoteDir(path.posix.dirname(e.fullPath)) === cur)
    const p: DragPayload = { kind: 'remote-paths', paths: src.map(e => ({ remotePath: e.fullPath, name: e.name, isDirectory: e.isDirectory, size: e.size, mode: e.mode, modified: e.modified?.getTime?.() })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))

    // 同步检查临时缓存：只在实际文件已缓存时设置 OS 拖拽数据，否则不设置
    // 避免生成无效的 .url 快捷方式文件
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragout')
    const uriList: string[] = []
    for (const e of src) {
      const tmpPath = path.join(tmpDir, e.name)
      try {
        const st = fsSync.statSync(tmpPath)
        if (e.isDirectory) {
          if (st.isDirectory() && fsSync.statSync(path.join(tmpPath, '.sftp-cache-done'))) {
            try { const file = new File([''], e.name); (file as any).path = tmpPath; ev.dataTransfer?.items.add(file) } catch {}
            uriList.push(`file:///${tmpPath.replace(/\\/g, '/')}`)
          }
        } else if (st.size === (e.size ?? 0)) {
          try { const file = new File([''], e.name); (file as any).path = tmpPath; ev.dataTransfer?.items.add(file) } catch {}
          uriList.push(`file:///${tmpPath.replace(/\\/g, '/')}`)
        }
      } catch { /* 缓存未命中 */ }
    }

    // 全部缓存命中时通知 OS 这是一次文件拖拽；部分命中时不设置，避免产生不完整的拖拽
    if (uriList.length > 0 && uriList.length === src.length) {
      ev.dataTransfer?.setData('text/uri-list', uriList.join('\r\n'))
      // 设置默认拖拽图标为 copy
      ev.dataTransfer!.dropEffect = 'copy'
      ev.dataTransfer!.effectAllowed = 'copy'
      return
    }

    // 缓存部分/全部未命中：不设置 OS 拖拽数据，避免生成快捷方式
    // 保留 application/x-sftp-plus 供面板间内部拖拽（本地↔远程），此功能不受缓存影响
    // 后台异步预缓存，供下次拖出到桌面/资源管理器使用（不阻塞 dragstart）
    if (uriList.length < src.length) {
      void this._cacheRemoteFilesForDrag(src)
    }
  }

  /** 异步预缓存远程文件/文件夹到临时目录（供后续拖拽到桌面使用） */
  private async _cacheRemoteFilesForDrag(entries: SFTPFile[]): Promise<void> {
    if (!this.sftpSession) return
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragout')
    await fs.mkdir(tmpDir, { recursive: true }).catch(() => {})
    for (const entry of entries) {
      const tmpPath = path.join(tmpDir, entry.name)
      if (entry.isDirectory) {
        await this._cacheRemoteDir(entry, tmpPath)
      } else {
        // 文件：只下载缓存未命中的
        const cached = await fs.stat(tmpPath).then(s => s.size === (entry.size ?? 0)).catch(() => false)
        if (!cached) {
          try { await this._doDownloadRaw(entry.fullPath, tmpPath, undefined, entry.size) } catch { /* 跳过 */ }
        }
      }
    }
  }

  /** 递归缓存远程目录到临时路径 */
  private async _cacheRemoteDir(entry: SFTPFile, localDir: string): Promise<void> {
    if (!this.sftpSession) return
    // 检查缓存是否已完整
    const doneMarker = path.join(localDir, '.sftp-cache-done')
    const cached = await fs.stat(doneMarker).then(() => true).catch(() => false)
    if (cached) return

    await fs.mkdir(localDir, { recursive: true }).catch(() => {})
    const entries = await this.sftpSession.readdir(entry.fullPath).catch(() => null)
    if (!entries) return
    for (const sub of entries) {
      const remoteP = path.posix.join(entry.fullPath, sub.name)
      const localP = path.join(localDir, sub.name)
      if (sub.isDirectory) {
        await this._cacheRemoteDir({ ...sub, fullPath: remoteP }, localP)
      } else {
        try { await this._doDownloadRaw(remoteP, localP, sub.mode, sub.size) } catch { /* 跳过 */ }
      }
    }
    // 写入缓存完成标记
    try { await fs.writeFile(doneMarker, '') } catch {}
  }

  async onDrop(ev: DragEvent, targetPane: 'local' | 'remote'): Promise<void> {
    ev.preventDefault()

    const rawPayload = this._parseDragPayload(ev)
    if (rawPayload && this._isSameDirInternalDrop(rawPayload, targetPane)) {
      this._resetFileDragState()
      this.cdr.detectChanges()
      return
    }

    this._remoteDragOver = false
    this._localDragOver = false
    this._dragSourcePane = null
    this._dragSameDirNoop = false

    // 优先检测是否为内部拖拽（有 application/x-sftp-plus 自定义数据）
    // 必须在 OS 路径检测之前，避免我们自己添加的 File 对象被误处理
    // 注意：getData() 在 drop 事件中只能调用一次（浏览器会消费数据），后续调用返回空
    if (rawPayload) {
      if (!this.connected || !this.sftpSession) return
      if (rawPayload.kind === 'local-paths' && targetPane === 'remote') {
        for (const p of rawPayload.paths) {
          await this.uploadPathToRemote(this.remotePath, p.fullPath)
        }
        await this.refreshRemote()
        this.selectedLocal = []
        this.cdr.detectChanges()
        return
      }
      if (rawPayload.kind === 'remote-paths' && targetPane === 'local') {
        for (const p of rawPayload.paths) {
          await this._streamDownloadOne({
            name: p.name,
            fullPath: p.remotePath,
            isDirectory: p.isDirectory,
            isSymlink: false,
            mode: p.mode ?? 0o644,
            size: p.size ?? 0,
            modified: p.modified != null ? new Date(p.modified) : new Date(),
          } as SFTPFile)
        }
        if (this._conflictQueue.length) this._showConflictDialog()
        await this.refreshLocal()
        this.selectedRemote = []
        this.cdr.detectChanges()
        return
      }
    }

    // OS 文件拖入
    const osPaths = await this.getDroppedOsPaths(ev)
    if (osPaths.length && targetPane === 'local') {
      const cur = path.resolve(this.localPath)
      if (osPaths.every(p => path.resolve(path.dirname(p)) === cur)) {
        this._resetFileDragState()
        this.cdr.detectChanges()
        return
      }
    }
    if (osPaths.length && targetPane === 'remote') {
      if (!this.connected || !this.sftpSession) return
      for (const p of osPaths) {
        await this.uploadPathToRemote(this.remotePath, p)
      }
      await this.refreshRemote()
      return
    }
    if (osPaths.length && targetPane === 'local') {
      // OS→本地面板：复制文件/文件夹到本地面板当前目录
      for (const p of osPaths) {
        const baseName = path.basename(p)
        const dest = path.join(this.localPath, baseName)
        try {
          await fs.cp(p, dest, { recursive: true, errorOnExist: false, dereference: false })
        } catch (e) {
          console.error('[SFTP+] Copy local failed:', p, e)
          const msg = this.effectiveLang === 'zh-CN'
            ? `复制失败: ${baseName}`
            : `Copy failed: ${baseName}`
          try { this.notifications?.error?.(msg, '') } catch {}
        }
      }
      await this.refreshLocal()
      return
    }
  }

  /** 解析内部拖拽数据（getData 在 drop 事件中只能消费一次，封装为工具方法确保只读一次） */
  private _parseDragPayload(ev: DragEvent): DragPayload | null {
    const raw = ev.dataTransfer?.getData('application/x-sftp-plus')
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }

  private async getDroppedOsPaths(ev: DragEvent): Promise<string[]> {
    const dt = ev.dataTransfer
    if (!dt) return []

    // 策略1: Electron File.path（最直接，跨平台，带正确原生路径）
    const files = Array.from(dt.files ?? [])
    const electronPaths = files.map(f => (f as any).path as string | undefined).filter(Boolean) as string[]
    if (electronPaths.length) return electronPaths

    // 策略1b: 遍历 dataTransfer.items 用 webUtils.getPathForFile()（Electron 22+，支持文件和文件夹）
    try {
      const { webUtils } = require('electron')
      const items = Array.from(dt.items ?? [])
      const itemPaths: string[] = []
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            const p = webUtils.getPathForFile(file)
            if (p) itemPaths.push(p)
          }
        }
      }
      if (itemPaths.length) return itemPaths
    } catch { /* Electron 版本不支持 webUtils，或未启用 */ }

    // 策略2: File 对象有内容但没有 .path → 写入临时目录后返回路径（仅单文件，非目录）
    if (files.length) {
      const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragdrop')
      await fs.mkdir(tmpDir, { recursive: true }).catch(() => {})
      const tmpPaths: string[] = []
      for (const file of files) {
        if (!file.name) continue
        const tmpPath = path.join(tmpDir, file.name)
        try {
          const buf = Buffer.from(await file.arrayBuffer())
          if (buf.length === 0 && file.size === 0) continue
          await fs.writeFile(tmpPath, buf)
          tmpPaths.push(tmpPath)
        } catch { /* 跳过无法读取的文件（含文件夹占位项） */ }
      }
      if (tmpPaths.length) return tmpPaths
    }

    // 策略3: text/uri-list 回退（处理 Windows file:///C:/path 格式）
    const uriList = dt.getData('text/uri-list') || ''
    const uris = uriList.split(/\r?\n/g).map(x => x.trim()).filter(x => x && !x.startsWith('#'))
    return uris.map(x => {
      if (!x.startsWith('file://')) return x
      const raw = decodeURIComponent(x.slice('file://'.length))  // 去掉 file://
      // Windows: file:///C:/path → /C:/path → 去掉开头的 /，保持 Drive letter
      if (/^\/[a-zA-Z]:/.test(raw)) {
        return raw.slice(1).replace(/\//g, '\\')
      }
      return raw
    })
  }

  // ========== 文件夹传输进度 ==========

  /** 递归计算本地目录总大小 */
  private async _calcLocalDirSize(dirPath: string): Promise<number> {
    let size = 0
    try {
      for (const item of await fs.readdir(dirPath, { withFileTypes: true })) {
        const p = path.join(dirPath, item.name)
        if (item.isSymbolicLink()) continue
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
        if (item.isSymbolicLink()) continue
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
    _top?: FolderTransferCtx,
  ): Promise<void> {
    if (!this.sftpSession) return
    const st = await fs.lstat(localPath).catch(() => null)
    if (!st) return
    // 符号链接不上传
    if (st.isSymbolicLink()) return
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
        // 远程已存在同名目录 → 目录冲突
        if (await this._checkRemotePathExists(rt, true)) {
          this._conflictQueue.push({
            localPath, remoteDir, fileName: base, remotePath: rt, localStat: st,
            direction: 'upload', isDirectory: true,
          })
          this.conflictOriginalTotal = this._conflictQueue.length
          _top.hadConflict = true
          this._showConflictDialog()
          this._finishFolderTransfer(_top.t, _top.startTime, _top.logEntryId, false)
          return
        }
      }
      try { await this.sftpSession.mkdir(rt) } catch {}
      const children = await fs.readdir(localPath, { withFileTypes: true })
      for (const c of children) {
        if (c.isSymbolicLink()) continue
        // 检查是否被用户取消/暂停
        if ((_top?.t as any)?._aborted) break
        while ((_top?.t as any)?._paused) {
          await new Promise(r => setTimeout(r, 200))
          if ((_top?.t as any)?._aborted) break
        }
        if ((_top?.t as any)?._aborted) break
        await this.uploadPathToRemote(rt, path.join(localPath, c.name), _top)
      }
      if (isTop) {
        const ok = !_top!.hadConflict && !(_top!.t as any)?._aborted
        this._finishFolderTransfer(_top!.t, _top!.startTime, _top!.logEntryId, ok)
      }
      return
    }

    // 冲突检测：检查远程是否已存在同名文件
    const conflict = await this._checkConflict(rt, st.size, st.mtimeMs)
    if (conflict) {
      // 有冲突 → 入队列，弹出对话框
      this._conflictQueue.push({ localPath, remoteDir, fileName: base, remotePath: rt, localStat: st, direction: 'upload' })
      this.conflictOriginalTotal = this._conflictQueue.length
      if (_top) _top.hadConflict = true
      this._showConflictDialog()
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
    const parentDir = path.posix.dirname(remotePath)
    const fileName = path.basename(remotePath)
    try {
      // P2-14: 优先使用 stat 单文件查询（O(1)），避免 readdir 列出整个目录
      if (this.sftpSession.stat) {
        const st = await this.sftpSession.stat(remotePath)
        const remoteSize = st.size ?? 0
        const remoteMtime = st.modified?.getTime?.() ?? (st.mtime ? st.mtime * 1000 : 0)
        if (this._filesAreSame(localSize, localMtime, remoteSize, remoteMtime)) return null
        return {
          localPath: remotePath, remotePath, fileName, localSize,
          remoteSize,
          localMtime,
          remoteMtime,
          remoteDir: parentDir, direction: 'upload', isSamePane: false,
        }
      }
      // 回退：stat 不可用时使用 readdir + find
      const entries = await this.sftpSession.readdir(parentDir)
      const found = entries.find(e => e.name === fileName)
      if (found) {
        const remoteSize = found.size ?? 0
        const remoteMtime = found.modified?.getTime?.() ?? 0
        if (this._filesAreSame(localSize, localMtime, remoteSize, remoteMtime)) return null
        return {
          localPath: remotePath, remotePath, fileName, localSize,
          remoteSize,
          localMtime,
          remoteMtime,
          remoteDir: parentDir, direction: 'upload', isSamePane: false,
        }
      }
    } catch { /* 文件不存在或无权限，不冲突 */ }
    return null
  }

  /** 检查远程路径是否已存在（目录或文件） */
  private async _checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean> {
    if (!this.sftpSession) return false
    if (this.sftpSession.stat) {
      try {
        await this.sftpSession.stat(remotePath)
        return true
      } catch { return false }
    }
    const parentDir = path.posix.dirname(remotePath)
    const name = path.basename(remotePath)
    try {
      const entries = await this.sftpSession.readdir(parentDir)
      const found = entries.find(e => e.name === name)
      if (!found) return false
      if (expectDir === undefined) return true
      return expectDir ? found.isDirectory : !found.isDirectory
    } catch { return false }
  }

  /**
   * 功能描述：检查本地是否存在同名文件（用于下载冲突检测）
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   */
  private async _checkLocalConflict(localPath: string, remoteSize: number, remoteMtime: number): Promise<ConflictFileInfo | null> {
    try {
      const st = await fs.stat(localPath)
      if (this._filesAreSame(st.size, st.mtimeMs, remoteSize, remoteMtime)) return null
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
  private async _doUpload(
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'edit-upload',
  ): Promise<void> {
    if (!this.sftpSession) return
    const up = new LocalPathFileUpload(localPath)
    this.trackTransfer(up, 'upload', remotePath, localPath, logOperation)
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
    this._conflictResolver.showConflictDialog()
  }

  /**
   * 功能描述：用户点击冲突对话框的操作
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  resolveConflict(action: string): void {
    this._conflictResolver.resolveConflict(action)
  }

  // ========== 传输进度轮询（委托 panel/panel-transfer-runtime） ==========

  private trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): void {
    this._transferRuntime.trackTransfer(t, direction, remotePath, localPath, logOperation)
    this.transfersMinimized = false
    this.transfersHidden = false
  }

  private _logEditorTransfer(
    operation: 'edit-upload' | 'edit-download',
    remotePath: string,
    localPath: string,
    size: number,
    success: boolean,
    startTime: number,
    failReason?: TransferLogEntry['failReason'],
  ): void {
    const now = Date.now()
    this.transferLog.add({
      operation,
      localPath,
      remotePath,
      profileName: this.profile?.name || '',
      success,
      size,
      duration: now - startTime,
      startTime,
      endTime: now,
      failReason,
    })
  }

  cancelTransfer(entry: { transfer: any; logEntryId?: string; paused?: boolean; isFolder?: boolean }): void {
    this._transferRuntime.cancelTransfer(entry)
  }

  /** 取消当前文件（文件夹：仅跳过此文件，循环继续） */
  cancelCurrentFile(entry: { isFolder?: boolean }): void {
    this._transferRuntime.cancelCurrentFile(entry)
  }

  /** 暂停传输 */
  pauseTransfer(entry: any): void {
    this._transferRuntime.pauseTransfer(entry)
  }

  /** 继续传输（断点续传） */
  async resumeTransfer(entry: any): Promise<void> {
    await this._transferRuntime.resumeTransfer(entry)
  }

  /**
   * 内部：执行续传操作
   * 功能描述：用新的 transfer 适配器从指定 offset 继续传输
   *           优先尝试原始 ssh2 SFTP createReadStream/createWriteStream
   *           （支持 start 偏移，实现真断点续传），否则回退到标准 upload/download
   */
  // 续传内部实现已迁移至 panel/panel-transfer-runtime.ts

  /**
   * 用原始 ssh2 SFTP createWriteStream 实现断点续传上传
   */
  // 原始 ssh2 续传上传已迁移至 panel/panel-transfer-runtime.ts

  /**
   * 用原始 ssh2 SFTP createReadStream 实现断点续传下载
   */
  // 原始 ssh2 续传下载已迁移至 panel/panel-transfer-runtime.ts

  /** 关闭整个传输面板 */
  clearTransfers(): void {
    this._transferRuntime.clearTransfers()
  }

  // ========== 权限编辑对话框 ==========
  openPermDialog(entry: SFTPFile): void {
    this.permTargetPath = entry.fullPath
    this.permTargetName = entry.name
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
  localNewFolder(): void { this.openInputDialog('local-mkdir', this.i18n.t('app.newFolder'), '', '', this.localPath) }
  localNewFile(): void { this.openInputDialog('local-touch', this.i18n.t('app.newFile'), '', '', this.localPath) }
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
    this.openInputDialog('remote-mkdir', this.i18n.t('app.newFolder'), '', '', this.remotePath)
  }
  remoteNewFile(): void {
    if (!this.connected) return
    this.openInputDialog('remote-touch', this.i18n.t('app.newFile'), '', '', this.remotePath)
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
    // 等待 Angular 渲染 DOM 后自动聚焦输入框
    setTimeout(() => {
      const input = this.elRef.nativeElement.querySelector('.dialog-input') as HTMLInputElement
      if (input) input.focus()
    })
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
    return formatDate(d.getTime())
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
    const st = await fs.lstat(p).catch(() => null)
    if (!st) return
    // 符号链接：直接删除链接本身，不跟随目标
    if (st.isSymbolicLink()) { await fs.unlink(p); return }
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
  toggleBookmarksForPane(pane: 'local' | 'remote', event?: MouseEvent): void {
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
    const btn = (event?.currentTarget ?? event?.target) as HTMLElement | null
    const rootEl = (this.elRef?.nativeElement as HTMLElement)?.querySelector('.sftp-root') as HTMLElement | null
    if (!btn || !rootEl) {
      this.bookmarkPopupX = 80
      this.bookmarkPopupY = 87
      this.bookmarkArrowLeft = 160
      this._bookmarkJustOpened = true
      this.showBookmarks = true
      queueMicrotask(() => { this._bookmarkJustOpened = false })
      return
    }
    const btnRect = btn.getBoundingClientRect()
    const rootRect = rootEl.getBoundingClientRect()
    // 弹窗宽度约 320px，确保不超出右边界
    const popupW = 320
    let left = btnRect.left - rootRect.left
    if (left + popupW > (rootEl.clientWidth ?? window.innerWidth)) {
      left = Math.max(0, (rootEl.clientWidth ?? window.innerWidth) - popupW - 8)
    }
    this.bookmarkPopupX = left
    const paneTitle = btn.closest('.pane-title') as HTMLElement | null
    const titleRect = paneTitle?.getBoundingClientRect()
    if (titleRect) {
      this.bookmarkPopupY = titleRect.bottom - rootRect.top
    } else {
      this.bookmarkPopupY = btnRect.bottom - rootRect.top + 4
    }
    const arrowSize = 12
    const arrowLeft = btnRect.left + btnRect.width / 2 - rootRect.left - left - arrowSize / 2
    this.bookmarkArrowLeft = Math.max(12, Math.min(popupW - 24, arrowLeft))
    this._bookmarkJustOpened = true
    this.showBookmarks = true
    queueMicrotask(() => { this._bookmarkJustOpened = false })
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
    const filter: any = {
      operation: this.logFilterOp as any || undefined,
      profileName: this.profile?.name || undefined,
    }
    if (this.logFilterStatus === 'success') filter.success = true
    else if (this.logFilterStatus === 'failed') filter.success = false
    return this.transferLog.filter(filter)
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
    this._rubberBand.clearContextMenuSuppress()
    if (this._rubberBand.active) { ev.preventDefault(); return }
    if (this._rubberBand.skipNextContextMenu) { ev.preventDefault(); return }
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
    // 右键时先选中该项（如果未选中），并清除对面面板的选中状态
    if (!this._localSelectedPaths.has(entry.fullPath)) {
      this.selectedLocal = [entry]
      this.selectedRemote = []
      this.localLastSelectedIndex = this.getFilteredLocalEntries().findIndex(e => e.fullPath === entry.fullPath)
    }
    this.syncPaneSelectionVisual('local')
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
    this._rubberBand.clearContextMenuSuppress()
    if (this._rubberBand.active) { ev.preventDefault(); return }
    if (this._rubberBand.skipNextContextMenu) { ev.preventDefault(); return }
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
    // 右键时先选中该项（如果未选中），并清除对面面板的选中状态
    if (!this._remoteSelectedPaths.has(entry.fullPath)) {
      this.selectedRemote = [entry]
      this.selectedLocal = []
      this.remoteLastSelectedIndex = this.getFilteredRemoteEntries().findIndex(e => e.fullPath === entry.fullPath)
    }
    this.syncPaneSelectionVisual('remote')
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
      this.selectedLocal = all.filter(e => !this._localSelectedPaths.has(e.fullPath))
    } else {
      const all = this.getFilteredRemoteEntries()
      this.selectedRemote = all.filter(e => !this._remoteSelectedPaths.has(e.fullPath))
    }
    this.syncPaneSelectionVisual(this.contextMenuPane)
  }

  ctxCopyPath(): void {
    const pane = this.contextMenuPane
    const selected = pane === 'local' ? this.selectedLocal : this.selectedRemote
    const paths = (selected.length > 0 ? selected : (this.contextMenuEntry ? [this.contextMenuEntry] : []))
      .map(e => this.getEntryPath(e))
      .filter(Boolean)
    if (paths.length && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(paths.join(' ')).then(() => {
        this._notifyPathCopied(paths.length)
      }).catch(() => {})
    }
    this.closeContextMenu()
  }

  private _notifyPathCopied(count: number): void {
    this.showToast(this.i18n.t('notify.pathCopied', { n: count }))
  }

  /** 面板顶部轻提示（替代 Tabby 底部通知） */
  showToast(message: string, ms = 2200): void {
    this.toastMessage = message
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toastMessage = ''
      this.toastTimer = null
      try { this.cdr.detectChanges() } catch {}
    }, ms)
    try { this.cdr.detectChanges() } catch {}
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
      if (process.platform === 'win32') {
        const normalized = path.normalize(filePath)
        const escaped = normalized.replace(/"/g, '""')
        exec(`explorer /select,"${escaped}"`, { windowsHide: false }, (err) => {
          if (err) console.error('[SFTP+] Reveal in explorer failed:', err)
        })
      } else {
        const { shell } = require('electron')
        shell.showItemInFolder(filePath)
      }
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

  /** 获取 entry 的访问时间（毫秒） */
  getEntryAtimeMs(e: LocalEntry | SFTPFile): number | undefined {
    const local = (e as LocalEntry).atimeMs
    if (local != null) return local
    return (e as SFTPFile).atimeMs
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

  canViewEntry(entry: LocalEntry | SFTPFile | null): boolean {
    if (!entry || (entry as any).isDirectory) return false
    return isViewableRemoteFileType(entry.name)
  }

  canEditEntry(entry: LocalEntry | SFTPFile | null): boolean {
    if (!entry || (entry as any).isDirectory) return false
    return isEditableRemoteFileType(entry.name)
  }

  get viewerShowSystemAction(): boolean {
    return !!this.viewerSystemPath && !this.viewerError && !this.viewerLoading
  }

  get editorShowSystemAction(): boolean {
    return !!this.editorLocalPath && !this.editorError && !this.editorLoading
  }

  async ctxViewFile(): Promise<void> {
    if (this.contextMenuPane === 'local') {
      await this._viewLocalFile(this.contextMenuEntry as LocalEntry | null)
    } else {
      await this._viewRemoteFile(this.contextMenuEntry as SFTPFile | null)
    }
  }

  async ctxEditFile(): Promise<void> {
    if (this.contextMenuPane === 'local') {
      await this._editLocalFile(this.contextMenuEntry as LocalEntry | null)
    } else {
      await this._editRemoteFile(this.contextMenuEntry as SFTPFile | null)
    }
  }

  private async _viewLocalFile(entry: LocalEntry | null): Promise<void> {
    if (!entry || entry.isDirectory) return
    this.closeContextMenu()

    if (!isViewableRemoteFileType(entry.name)) {
      this.showToast(this.i18n.t('viewer.typeNotSupported'))
      return
    }

    const size = entry.size ?? 0
    if (isRemoteFileTooLargeForView(entry.name, size)) {
      const limit = formatBytesLimit(getViewMaxBytes(entry.name))
      this._showViewerError(entry.name, entry.fullPath, entry.name, limit, isImageFile(entry.name))
      return
    }

    this._resetViewerState()
    this.viewerFileName = entry.name
    this.viewerDisplayPath = entry.fullPath
    this.viewerSystemPath = entry.fullPath
    this.viewerMode = isImageFile(entry.name) ? 'image' : 'text'
    this.viewerVisible = true
    this.viewerLoading = true

    try {
      const buf = await readLocalFileToBuffer(entry.fullPath)
      await this._fillViewerFromBuffer(buf, entry.name)
    } catch (e) {
      this.viewerError = this.i18n.t('viewer.loadFailed')
      console.error('[SFTP+] View local file failed', e)
    } finally {
      this.viewerLoading = false
      this.cdr.detectChanges()
    }
  }

  private async _viewRemoteFile(entry: SFTPFile | null): Promise<void> {
    if (!entry || entry.isDirectory || !this.connected || !this.sftpSession) return
    this.closeContextMenu()

    if (!isViewableRemoteFileType(entry.name)) {
      this.showToast(this.i18n.t('viewer.typeNotSupported'))
      return
    }

    const size = entry.size ?? 0
    if (isRemoteFileTooLargeForView(entry.name, size)) {
      const limit = formatBytesLimit(getViewMaxBytes(entry.name))
      this._showViewerError(entry.name, entry.fullPath, entry.name, limit, isImageFile(entry.name))
      return
    }

    this._resetViewerState()
    this.viewerFileName = entry.name
    this.viewerDisplayPath = entry.fullPath
    this.viewerMode = isImageFile(entry.name) ? 'image' : 'text'
    this.viewerVisible = true
    this.viewerLoading = true

    try {
      const buf = await downloadRemoteToBuffer(this.sftpSession, entry.fullPath, size, entry.mode)
      await this._fillViewerFromBuffer(buf, entry.name)
      await this._cleanupViewerTemp()
      this.viewerTempPath = await writeBufferToTemp(buf, entry.name)
      this.viewerSystemPath = this.viewerTempPath
    } catch (e) {
      this.viewerError = this.i18n.t('viewer.loadFailed')
      console.error('[SFTP+] View remote file failed', e)
    } finally {
      this.viewerLoading = false
      this.cdr.detectChanges()
    }
  }

  private _showViewerError(fileName: string, displayPath: string, _name: string, limit: string, isImage: boolean): void {
    this._resetViewerState()
    this.viewerVisible = true
    this.viewerLoading = false
    this.viewerError = this.i18n.t('viewer.tooLargeView', { limit })
    this.viewerFileName = fileName
    this.viewerDisplayPath = displayPath
    this.viewerMode = isImage ? 'image' : 'text'
    this.showToast(this.i18n.t('viewer.tooLargeView', { limit }))
    this.cdr.detectChanges()
  }

  private _resetViewerState(): void {
    this.viewerLoading = false
    this.viewerError = ''
    this.viewerTextContent = ''
    this.viewerImageUrl = ''
    this.viewerSystemPath = ''
    void this._cleanupViewerTemp()
  }

  private async _fillViewerFromBuffer(buf: Buffer, fileName: string): Promise<void> {
    if (isImageFile(fileName)) {
      this.viewerImageUrl = bufferToDataUrl(buf, fileName)
    } else if (isBinaryBuffer(buf)) {
      this.viewerError = this.i18n.t('viewer.binaryNotSupported')
    } else {
      this.viewerTextContent = bufferToText(buf).text
    }
  }

  private async _editLocalFile(entry: LocalEntry | null): Promise<void> {
    if (!entry || entry.isDirectory) return
    this.closeContextMenu()

    if (!isEditableRemoteFileType(entry.name)) {
      this.showToast(this.i18n.t('editor.typeNotSupported'))
      return
    }

    const size = entry.size ?? 0
    const limit = formatBytesLimit(EDIT_TEXT_MAX_BYTES)
    if (isRemoteFileTooLargeForEdit(entry.name, size)) {
      this._showEditorError(entry.name, entry.fullPath, limit)
      return
    }

    await this._openEditorShell({
      fileName: entry.name,
      displayPath: entry.fullPath,
      localPath: entry.fullPath,
      isRemote: false,
    })

    try {
      const buf = await readLocalFileToBuffer(entry.fullPath)
      if (isBinaryBuffer(buf)) {
        this.editorError = this.i18n.t('viewer.binaryNotSupported')
      } else {
        const text = bufferToText(buf).text
        this.editorContent = text
        this.editorOriginalContent = text
      }
    } catch (e) {
      this.editorError = this.i18n.t('viewer.loadFailed')
      console.error('[SFTP+] Edit local file load failed', e)
    } finally {
      this.editorLoading = false
      if (this.editorLocalPath && !this.editorError) this._startEditorFileWatch(this.editorLocalPath)
      this.cdr.detectChanges()
    }
  }

  private async _editRemoteFile(entry: SFTPFile | null): Promise<void> {
    if (!entry || entry.isDirectory || !this.connected || !this.sftpSession) return
    this.closeContextMenu()

    if (!isEditableRemoteFileType(entry.name)) {
      this.showToast(this.i18n.t('editor.typeNotSupported'))
      return
    }

    const size = entry.size ?? 0
    const limit = formatBytesLimit(EDIT_TEXT_MAX_BYTES)
    if (isRemoteFileTooLargeForEdit(entry.name, size)) {
      this._showEditorError(entry.name, entry.fullPath, limit)
      return
    }

    await this._openEditorShell({
      fileName: entry.name,
      displayPath: entry.fullPath,
      localPath: '',
      isRemote: true,
      remoteSavePath: entry.fullPath,
      remoteSize: size,
      remoteMode: entry.mode,
    })
  }

  private _showEditorError(fileName: string, displayPath: string, limit: string): void {
    this.editorVisible = true
    this.editorLoading = false
    this.editorSaving = false
    this.editorDirty = false
    this.editorError = this.i18n.t('editor.tooLarge', { limit })
    this.editorFileName = fileName
    this.editorDisplayPath = displayPath
    this.editorContent = ''
    this.editorOriginalContent = ''
    this.editorLocalPath = ''
    this.showToast(this.i18n.t('editor.tooLarge', { limit }))
    this.cdr.detectChanges()
  }

  private async _openEditorShell(opts: {
    fileName: string
    displayPath: string
    localPath: string
    isRemote: boolean
    remoteSavePath?: string
    remoteSize?: number
    remoteMode?: number
  }): Promise<void> {
    this.editorVisible = true
    this.editorLoading = true
    this.editorSaving = false
    this.editorDirty = false
    this.editorError = ''
    this.editorFileName = opts.fileName
    this.editorDisplayPath = opts.displayPath
    this.editorContent = ''
    this.editorOriginalContent = ''
    this.editorIsRemote = opts.isRemote
    await this._cleanupEditorTemp()

    if (opts.isRemote && this.sftpSession && opts.remoteSavePath != null) {
      const loadStart = Date.now()
      try {
        const tempPath = await downloadRemoteToTempFile(
          this.sftpSession,
          opts.remoteSavePath,
          opts.remoteSize ?? 0,
          opts.remoteMode,
        )
        this.editorTempPath = tempPath
        this.editorLocalPath = tempPath
        const buf = await fs.readFile(tempPath)
        if (isBinaryBuffer(buf)) {
          this.editorError = this.i18n.t('viewer.binaryNotSupported')
          await this._cleanupEditorTemp()
          this.editorLocalPath = ''
          this._logEditorTransfer('edit-download', opts.remoteSavePath, tempPath, opts.remoteSize ?? 0, false, loadStart, 'error')
        } else {
          const text = bufferToText(buf).text
          this.editorContent = text
          this.editorOriginalContent = text
          this._logEditorTransfer('edit-download', opts.remoteSavePath, tempPath, opts.remoteSize ?? buf.length, true, loadStart)
        }
        this._editorSavePath = opts.remoteSavePath
      } catch (e) {
        this.editorError = this.i18n.t('viewer.loadFailed')
        console.error('[SFTP+] Edit remote file load failed', e)
        await this._cleanupEditorTemp()
        this.editorLocalPath = ''
        this._logEditorTransfer('edit-download', opts.remoteSavePath, '', opts.remoteSize ?? 0, false, loadStart, 'error')
      } finally {
        this.editorLoading = false
        if (this.editorLocalPath && !this.editorError) this._startEditorFileWatch(this.editorLocalPath)
        this.cdr.detectChanges()
      }
      return
    }

    this.editorLocalPath = opts.localPath
    this._editorSavePath = opts.localPath
    if (this.editorLocalPath) this._startEditorFileWatch(this.editorLocalPath)
  }

  /** 监听本地/临时文件变更（「在系统中编辑」保存后可同步并启用提交） */
  private _startEditorFileWatch(filePath: string): void {
    this._stopEditorFileWatch()
    try {
      this._editorFileWatcher = fsSync.watch(filePath, () => {
        if (this._editorWatchDebounce) clearTimeout(this._editorWatchDebounce)
        this._editorWatchDebounce = setTimeout(() => {
          this._editorWatchDebounce = null
          void this._syncEditorFromDisk()
        }, 400)
      })
    } catch (e) {
      console.warn('[SFTP+] Editor file watch failed:', e)
    }
  }

  private _stopEditorFileWatch(): void {
    if (this._editorWatchDebounce) {
      clearTimeout(this._editorWatchDebounce)
      this._editorWatchDebounce = null
    }
    if (this._editorFileWatcher) {
      this._editorFileWatcher.close()
      this._editorFileWatcher = null
    }
  }

  private async _syncEditorFromDisk(): Promise<void> {
    if (!this.editorVisible || !this.editorLocalPath || this.editorLoading || this.editorSaving) return
    try {
      const text = await readTextFromFile(this.editorLocalPath)
      this.zone.run(() => {
        this.editorContent = text
        this.editorDirty = text !== this.editorOriginalContent
        this.cdr.detectChanges()
      })
    } catch { /* 文件可能正被外部编辑器占用，稍后重试 */ }
  }

  openViewerInSystem(): void {
    if (!this.viewerSystemPath) return
    this._openPathInSystem(this.viewerSystemPath)
  }

  openEditorInSystem(): void {
    if (!this.editorLocalPath) return
    this._openPathInSystem(this.editorLocalPath)
  }

  private _openPathInSystem(filePath: string): void {
    try {
      const { shell } = require('electron')
      shell.openPath(filePath).then((err?: string) => {
        if (err) console.error('[SFTP+] Open in system failed:', err)
      })
    } catch (e) {
      console.error('[SFTP+] Open in system failed:', e)
    }
  }

  async ctxUpload(): Promise<void> {
    this.closeContextMenu()
    if (!this.connected || !this.sftpSession) {
      this.showToast(this.effectiveLang === 'zh-CN' ? '未连接，无法上传' : 'Not connected')
      return
    }
    const items = this.getContextSelection() as LocalEntry[]
    if (!items.length) return
    for (const e of items) {
      await this.uploadPathToRemote(this.remotePath, e.fullPath)
    }
    await this.refreshRemote()
    this.cdr.detectChanges()
  }

  async ctxDownload(): Promise<void> {
    this.closeContextMenu()
    if (!this.connected || !this.sftpSession) {
      this.showToast(this.effectiveLang === 'zh-CN' ? '未连接，无法下载' : 'Not connected')
      return
    }
    const items = this.getContextSelection() as SFTPFile[]
    if (!items.length) return
    for (const p of items) {
      await this._streamDownloadOne(p)
    }
    if (this._conflictQueue.length) this._showConflictDialog()
    await this.refreshLocal()
    this.cdr.detectChanges()
  }

  /** 边下载边检测冲突：无冲突立即传输，有冲突入队等待用户处理 */
  private async _streamDownloadOne(p: SFTPFile): Promise<void> {
    if (p.isDirectory) {
      const localDir = path.join(this.localPath, p.name)
      const dirExists = await fs.stat(localDir).then(() => true).catch(() => false)
      if (dirExists) {
        this._conflictQueue.push({
          localPath: localDir,
          remoteDir: path.posix.dirname(p.fullPath),
          fileName: p.name,
          remotePath: p.fullPath,
          localStat: { size: 0, mtimeMs: Date.now() } as fsSync.Stats,
          direction: 'download',
          isDirectory: true,
        })
        this.conflictOriginalTotal = this._conflictQueue.length
        return
      }
      await this.downloadRemoteDir(p.fullPath, this.localPath, 'local')
      return
    }
    const localPath = path.join(this.localPath, p.name)
    const remoteMtime = p.modified?.getTime() ?? Date.now()
    const conflict = await this._checkLocalConflict(localPath, p.size ?? 0, remoteMtime)
    if (conflict) {
      this._conflictQueue.push({
        localPath,
        remoteDir: path.posix.dirname(p.fullPath),
        fileName: p.name,
        remotePath: p.fullPath,
        localStat: { size: conflict.localSize, mtimeMs: conflict.localMtime } as fsSync.Stats,
        direction: 'download',
        remoteFileSize: p.size ?? 0,
        remoteFileMtime: remoteMtime,
      })
      this.conflictOriginalTotal = this._conflictQueue.length
      return
    }
    await this._doDownload(p.fullPath, localPath, p.mode, p.size)
  }

  closeViewer(): void {
    this.viewerVisible = false
    this.viewerLoading = false
    this.viewerError = ''
    this.viewerTextContent = ''
    this.viewerImageUrl = ''
    this.viewerSystemPath = ''
    void this._cleanupViewerTemp()
  }

  onEditorContentChange(value: string): void {
    this.editorContent = value
    this.editorDirty = value !== this.editorOriginalContent
  }

  async saveEditor(): Promise<void> {
    if (!this.editorVisible || this.editorSaving || !this.editorLocalPath) return
    this.editorSaving = true
    try {
      if (this.editorDirty) {
        await writeTextToFile(this.editorLocalPath, this.editorContent, 'utf8')
      } else {
        // 可能仅在外部编辑器中修改：从磁盘读取最新内容再上传
        try {
          this.editorContent = await readTextFromFile(this.editorLocalPath)
        } catch { /* 使用当前内存内容 */ }
      }
      if (this.editorIsRemote) {
        if (!this.sftpSession || !this._editorSavePath) return
        await this._doUpload(this._editorSavePath, this.editorLocalPath, 'edit-upload')
        void this.refreshRemote()
      } else {
        void this.refreshLocal()
      }
      this.editorOriginalContent = this.editorContent
      this.editorDirty = false
      this.showToast(this.i18n.t('editor.saveSuccess'))
      this.closeEditor(false)
    } catch (e) {
      const msg = this.i18n.t('editor.saveFailed')
      try { this.notifications?.error?.(msg, '') } catch {}
      console.error('[SFTP+] Editor save failed', e)
    } finally {
      this.editorSaving = false
      this.cdr.detectChanges()
    }
  }

  closeEditor(confirmIfDirty = true): void {
    if (this.editorSaving) return
    if (confirmIfDirty && this.editorDirty) {
      if (!window.confirm(this.i18n.t('editor.unsaved'))) return
    }
    this._stopEditorFileWatch()
    if (this.editorIsRemote) void this._cleanupEditorTemp()
    this.editorVisible = false
    this.editorLoading = false
    this.editorDirty = false
    this.editorContent = ''
    this.editorOriginalContent = ''
    this.editorLocalPath = ''
    this.editorError = ''
    this._editorSavePath = ''
    this.editorIsRemote = false
  }

  private async _cleanupViewerTemp(): Promise<void> {
    if (!this.viewerTempPath) return
    const p = this.viewerTempPath
    this.viewerTempPath = ''
    await removeTempFile(p)
  }

  private async _cleanupEditorTemp(): Promise<void> {
    this._stopEditorFileWatch()
    if (!this.editorTempPath) return
    const p = this.editorTempPath
    this.editorTempPath = ''
    await removeTempFile(p)
  }

  // ========== 剪贴板操作 ==========
  ctxClipboardCopy(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'copy'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    const msg = this.effectiveLang === 'zh-CN' ? `已复制 ${count} 项` : `Copied ${count} item${count > 1 ? 's' : ''}`
    this.showToast(msg)
    console.log(`[SFTP+] Copy ${count} items from ${this.clipboardSource}`)
  }

  ctxClipboardCut(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'cut'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    const msg = this.effectiveLang === 'zh-CN' ? `已剪切 ${count} 项` : `Cut ${count} item${count > 1 ? 's' : ''}`
    this.showToast(msg)
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
      const destFilePath = destPane === 'local'
        ? path.join(destPath, entry.name)
        : path.posix.join(destPath, entry.name)

      if (entry.isDirectory) {
        // 目录冲突：本地→远程上传 / 远程→本地下载
        if (source === 'local' && destPane === 'remote') {
          if (await this._checkRemotePathExists(destFilePath, true)) {
            conflictItems.push(entry)
            const st = await fs.lstat((entry as LocalEntry).fullPath).catch(() => ({ size: 0, mtimeMs: Date.now() } as fsSync.Stats))
            this._conflictQueue.push({
              localPath: (entry as LocalEntry).fullPath,
              remoteDir: destPath,
              fileName: entry.name,
              remotePath: destFilePath,
              localStat: st,
              direction: 'upload',
              isDirectory: true,
            })
          }
        } else if (source === 'remote' && destPane === 'local') {
          const dirExists = await fs.stat(destFilePath).then(() => true).catch(() => false)
          if (dirExists) {
            conflictItems.push(entry)
            this._conflictQueue.push({
              localPath: destFilePath,
              remoteDir: path.posix.dirname((entry as SFTPFile).fullPath),
              fileName: entry.name,
              remotePath: (entry as SFTPFile).fullPath,
              localStat: { size: 0, mtimeMs: Date.now() } as fsSync.Stats,
              direction: 'download',
              isDirectory: true,
            })
          }
        }
        continue
      }

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
  private _conflictResolvedKeys = new Set<string>()

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
      if (item.isSymbolicLink()) continue
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
    _top?: FolderTransferCtx,
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
      if (await this._checkRemotePathExists(remoteDir, true)) {
        const st = await fs.lstat(localSrc).catch(() => ({ size: 0, mtimeMs: Date.now() } as fsSync.Stats))
        this._conflictQueue.push({
          localPath: localSrc, remoteDir: remoteDest, fileName: base, remotePath: remoteDir,
          localStat: st, direction: 'upload', isDirectory: true,
        })
        this.conflictOriginalTotal = this._conflictQueue.length
        _top.hadConflict = true
        this._showConflictDialog()
        this._finishFolderTransfer(_top.t, _top.startTime, _top.logEntryId, false)
        return
      }
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
      if (item.isSymbolicLink()) continue
      const localP = path.join(localSrc, item.name)
      const remoteP = path.posix.join(remoteDir, item.name)
      if (item.isDirectory()) {
        await this.uploadLocalDir(localP, remoteDir, destPane, _top)
      } else {
        const st = await fs.stat(localP).catch(() => null)
        if (!st) continue
        const conflict = await this._checkConflict(remoteP, st.size, st.mtimeMs)
        if (conflict) {
          this._conflictQueue.push({
            localPath: localP, remoteDir, fileName: item.name, remotePath: remoteP,
            localStat: st, direction: 'upload',
          })
          this.conflictOriginalTotal = this._conflictQueue.length
          _top!.hadConflict = true
          this._showConflictDialog()
          continue
        }
        await this._doUploadRaw(remoteP, localP)
        // 检查：用户是否取消了当前文件（⏹）
        if ((_top?.t as any)?._abortCurrent) {
          delete (_top?.t as any)._abortCurrent
          continue
        }
        if (st.size > 0) {
          _top!.bytesDone += st.size
        }
        // 0 字节文件也计入完成数
        _top!.itemDone++
        this._updateFolderProgress(_top!.t, _top!.bytesDone, item.name, _top!.itemDone, st.size)
      }
    }

    if (isTop) {
      const ok = !_top.hadConflict && !(_top.t as any)?._aborted
      this._finishFolderTransfer(_top.t, _top.startTime, _top.logEntryId, ok)
    }
  }

  /**
   * 递归下载远程目录到本地（整个目录记一条日志，内部文件不单独记录）
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 添加文件夹级进度追踪，显示当前文件及完成数
   */
  private async downloadRemoteDir(
    remoteSrc: string, localDest: string, destPane: 'local' | 'remote',
    _top?: FolderTransferCtx,
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
        const remoteMtime = entry.modified?.getTime?.() ?? Date.now()
        const conflict = await this._checkLocalConflict(localP, sz, remoteMtime)
        if (conflict) {
          this._conflictQueue.push({
            localPath: localP,
            remoteDir: path.posix.dirname(remoteP),
            fileName: entry.name,
            remotePath: remoteP,
            localStat: { size: conflict.localSize, mtimeMs: conflict.localMtime } as fsSync.Stats,
            direction: 'download',
            remoteFileSize: sz,
            remoteFileMtime: remoteMtime,
          })
          this.conflictOriginalTotal = this._conflictQueue.length
          _top!.hadConflict = true
          this._showConflictDialog()
          continue
        }
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
      const ok = !_top.hadConflict && !(_top.t as any)?._aborted
      this._finishFolderTransfer(_top.t, _top.startTime, _top.logEntryId, ok)
    }
  }

  // ========== 全局事件 ==========
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
}

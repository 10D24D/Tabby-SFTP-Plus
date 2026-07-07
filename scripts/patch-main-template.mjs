import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcPath = path.join(__dirname, '../src/sftp-floating-panel.component.ts')
let s = fs.readFileSync(srcPath, 'utf8')

const NL = '\r\n'

function replaceBetween(startMarker, endMarker, replacement) {
  const i = s.indexOf(startMarker)
  const j = s.indexOf(endMarker, i)
  if (i < 0 || j < 0) throw new Error(`markers not found: ${startMarker}`)
  s = s.slice(0, i) + replacement + s.slice(j)
}

const LOCAL_PANE = `        <!-- ====== 本地面板 ====== -->
        <sftp-file-pane
          labelIcon="🖥"
          [paneLabel]="i18n.t('pane.local')"
          listClass="local-pane"
          [isLocal]="true"
          [pathInput]="localPathInput"
          (pathInputChange)="localPathInput = $event"
          (pathEnter)="goToLocalPathInput()"
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
          (listDragOver)="onDragOver($event)"
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
          (colHeaderDragStart)="onColHeaderDragStart($event.event, $event.col, 'local')"
          (colHeaderDragOver)="onColHeaderDragOver($event)"
          (colHeaderDrop)="onColHeaderDrop($event.event, $event.col, 'local')"
          (entryClick)="onLocalClick($event.entry, $event.event, $event.index)"
          (entryDblClick)="openLocal($event.entry, $event.event)"
          (entryContextMenu)="onLocalContextMenu($event.entry, $event.event)"
          (entryDragStart)="onDragStartLocal($event.event, $event.entry)">
        </sftp-file-pane>

`

const REMOTE_PANE = `        <!-- ====== 远程面板 ====== -->
        <sftp-file-pane
          labelIcon="🌐"
          [paneLabel]="i18n.t('pane.remote')"
          listClass="remote-pane"
          [isLocal]="false"
          [pathInput]="remotePathInput"
          (pathInputChange)="remotePathInput = $event"
          (pathEnter)="goToRemotePathInput()"
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
          (listDragOver)="onDragOver($event)"
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
          (colHeaderDragStart)="onColHeaderDragStart($event.event, $event.col, 'remote')"
          (colHeaderDragOver)="onColHeaderDragOver($event)"
          (colHeaderDrop)="onColHeaderDrop($event.event, $event.col, 'remote')"
          (entryClick)="onRemoteClick($event.entry, $event.event, $event.index)"
          (entryDblClick)="openRemote($event.entry, $event.event)"
          (entryContextMenu)="onRemoteContextMenu($event.entry, $event.event)"
          (entryDragStart)="onDragStartRemote($event.event, $event.entry)">
        </sftp-file-pane>

`

replaceBetween('        <!-- ====== 本地面板 ====== -->', '        <!-- 拖拽分割线', LOCAL_PANE + '        <!-- 拖拽分割线')
replaceBetween('        <!-- ====== 远程面板 ====== -->', `      </div>${NL}${NL}      <!-- 传输队列 -->`, REMOTE_PANE + `      </div>${NL}${NL}      <!-- 传输队列 -->`)

const DELETE_DLG = `      <sftp-delete-dialog
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

`
replaceBetween('      <!-- 删除确认 -->', '      <!-- 输入对话框 -->', DELETE_DLG + '      <!-- 输入对话框 -->')

const INPUT_DLG = `      <sftp-input-dialog
        [visible]="inputDialogVisible"
        [title]="inputDialogTitle"
        [value]="inputDialogValue"
        [placeholder]="inputDialogPlaceholder"
        (valueChange)="inputDialogValue = $event"
        (confirm)="confirmInputDialog()"
        (cancel)="cancelInputDialog()">
      </sftp-input-dialog>

`
replaceBetween('      <!-- 输入对话框 -->', '      <!-- 书签悬浮菜单 -->', INPUT_DLG + '      <!-- 书签悬浮菜单 -->')

const BOOKMARK = `      <sftp-bookmark-popup *ngIf="showBookmarks"
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

`
replaceBetween('      <!-- 书签悬浮菜单 -->', '      <!-- 传输日志 -->', BOOKMARK + '      <!-- 传输日志 -->')

const CTX = `      <sftp-context-menu
        [menuVisible]="contextMenuVisible"
        [menuX]="contextMenuX"
        [menuY]="contextMenuY"
        [pane]="contextMenuPane"
        [entry]="contextMenuEntry"
        [hasSelection]="hasContextSelection()"
        [hasFileActions]="hasFileActions()"
        [singleSelected]="contextMenuPane === 'local' ? selectedLocal.length === 1 : selectedRemote.length === 1"
        [clipboardHasEntries]="clipboardEntries.length > 0"
        [modKey]="modKey"
        [isZh]="effectiveLang === 'zh-CN'"
        [headerVisible]="headerMenuVisible"
        [headerX]="headerMenuX"
        [headerY]="headerMenuY"
        [headerCol]="headerMenuCol"
        [cols]="contextColVisibility"
        [showHidden]="contextMenuPane === 'local' ? showHiddenLocal : showHiddenRemote"
        [showColBorders]="showColBorders"
        [showZebra]="showZebra"
        (menuAction)="onContextMenuAction($event)"
        (headerAction)="onHeaderMenuAction($event)">
      </sftp-context-menu>

`
replaceBetween('      <!-- 右键菜单 -->', '      <!-- 权限编辑对话框 -->', CTX + '      <!-- 权限编辑对话框 -->')

const PERM = `      <sftp-perm-dialog
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

`
replaceBetween('      <!-- 权限编辑对话框 -->', '      <!-- 详细信息对话框 -->', PERM + '      <!-- 详细信息对话框 -->')

const DETAILS = `      <sftp-details-dialog
        [visible]="detailsVisible"
        [display]="detailsDisplay"
        (confirm)="detailsVisible = false"
        (cancel)="detailsVisible = false">
      </sftp-details-dialog>

`
replaceBetween('      <!-- 详细信息对话框 -->', `    </div>${NL}  \`,`, DETAILS + `    </div>${NL}  \`,`)

// imports
const imports = `
import type { PaneNavAction, PaneSortAction } from './panel/sftp-file-pane.component'
import type { ContextMenuAction, HeaderMenuAction } from './panel/sftp-context-menu.component'
import type { PermField } from './panel/sftp-perm-dialog.component'
import type { DetailsDisplay } from './panel/sftp-details-dialog.component'
`
if (!s.includes("sftp-file-pane.component")) {
  s = s.replace("import { SFTP_PANEL_STYLES }", imports + "import { SFTP_PANEL_STYLES }")
}

// helper methods - insert before // ========== 格式
const helpers = `
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
      s += zh
        ? \` — 已选择 \${this.selectedLocal.length} 项 (\${this.formatSelectedSizeLocal()})\`
        : \` — Selected \${this.selectedLocal.length} items (\${this.formatSelectedSizeLocal()})\`
      if (this.selectedHasDirLocal()) s += zh ? ' 文件夹不计' : ' excl. folders'
    }
    return s
  }

  getRemoteSelectionInfo(): string {
    const count = this.getFilteredRemoteEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this.selectedRemote.length) {
      const zh = this.effectiveLang === 'zh-CN'
      s += zh
        ? \` — 已选择 \${this.selectedRemote.length} 项 (\${this.formatSelectedSizeRemote()})\`
        : \` — Selected \${this.selectedRemote.length} items (\${this.formatSelectedSizeRemote()})\`
      if (this.selectedHasDirRemote()) s += zh ? ' 文件夹不计' : ' excl. folders'
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
      case 'toggleBookmarks': this.toggleBookmarksForPane('local'); break
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
      case 'toggleBookmarks': this.toggleBookmarksForPane('remote'); break
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
      case 'openLocalFile': this.ctxOpenLocalFile(); break
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

`
if (!s.includes('onLocalPaneNav')) {
  s = s.replace('  // ========== 格式（委托 panel/panel-format） ==========', helpers + '  // ========== 格式（委托 panel/panel-format） ==========')
}

// toggleBookmarks optional event
s = s.replace(
  'toggleBookmarksForPane(pane: \'local\' | \'remote\', event: MouseEvent): void {',
  'toggleBookmarksForPane(pane: \'local\' | \'remote\', event?: MouseEvent): void {',
)
s = s.replace(
  '    const btn = event.currentTarget as HTMLElement',
  `    let btn: HTMLElement | null = event?.currentTarget as HTMLElement | null
    if (!btn) {
      const panes = (this.elRef?.nativeElement as HTMLElement)?.querySelectorAll('.pane')
      const idx = pane === 'local' ? 0 : 1
      btn = panes?.[idx]?.querySelector('.bm-btn') as HTMLElement | null
    }
    if (!btn) {
      this.bookmarkPopupX = 80
      this.bookmarkPopupY = 87
      this.bookmarkArrowLeft = 160
      this.showBookmarks = true
      return
    }`,
)

fs.writeFileSync(srcPath, s)
console.log('patched main template')

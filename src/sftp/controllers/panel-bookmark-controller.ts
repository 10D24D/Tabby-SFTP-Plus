/**
 * SFTP+ 书签控制器基类（由 sftp-floating-panel.component.ts 抽取）
 * 功能描述：承载书签弹窗、增删改、按连接/全局筛选、书签拖拽排序等逻辑与状态，供浮动面板组件继承
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-11
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-09-30 — 左右布局下本地面板书签弹层的右缘偏移量由 1px 改为 2px（远程保持 1px）：
 *              本地面板右邻分割线，弹层右缘贴到自己面板外框内 1px 时仍压住分割线那一侧（用户实测反馈）；
 *              同日远程书签弹层右缘偏移量由 2px 改为 1px（原先本地 -1、远程 -2，并排对比时远程比本地少贴 1px）。
 *              2026-09-21 — Tabby 多拆分窄窗：书签宽高按触发面板可用空间 clamp，避免远程半屏被固定 320×420 挤爆
 */
import * as path from 'path'
import { Bookmark, SftpBookmarksService, normalizeBookmarkPath } from '../../services/sftp-bookmarks.service'
import type { BookmarkScope } from '../core/panel-types'
import { SftpPanelViewerController } from './panel-viewer-controller'

export abstract class SftpPanelBookmarkController extends SftpPanelViewerController {
  // ===== 跨簇依赖（由子类 SftpFloatingPanel 提供实现/赋值） =====
  protected hostInfo!: string
  protected _isNarrowLayout!: boolean
  protected localPath!: string
  protected localPathInput!: string
  protected remotePath!: string
  protected remotePathInput!: string
  protected bookmarks!: SftpBookmarksService
  protected saveCurrentPath(): void { /* overridden by subclass */ }
  protected _pushLocalNav(_newPath: string): void { /* overridden by subclass */ }
  protected _pushRemoteNav(_newPath: string): void { /* overridden by subclass */ }

  // ===== 书签状态字段（从组件抽取） =====
  // ========== 书签 ==========
  showBookmarks = false
  /** 防止打开书签弹窗的同一轮点击被 document 捕获后立即关闭 */
  protected _bookmarkJustOpened = false
  bookmarkPane: 'local' | 'remote' = 'local'
  bookmarkAddScope: 'connection' | 'global' | null = null
  newBookmarkName = ''
  newBookmarkPath = ''
  bookmarkPopupX = 0
  bookmarkPopupY = 0
  /** 弹层宽度（按触发面板可用空间动态 clamp，理想 320） */
  bookmarkPopupW = 320
  /** 弹层最大高度（按面板下方剩余空间 clamp，理想 420） */
  bookmarkPopupMaxH = 420
  /** 箭头水平位置（相对弹窗左缘，对准触发按钮中心） */
  bookmarkArrowLeft = 24
  // 拖拽排序状态
  dragSourceIdx = -1
  dragSourceScope: BookmarkScope = 'all'
  dragOverIdx = -1
  dragOverScope: BookmarkScope = 'all'
  dragOverBottom = false
  /** 兼容选项：选中书签后自动关闭书签面板（由设置驱动） */
  closeBookmarkPanelOnSelect = false
  /** 是否按连接/全局分组显示书签（默认开启） */
  bookmarkPanelGroupByScope = true
  /** 分组块显示顺序 */
  bookmarkPanelGroupOrder: Array<'connection' | 'global'> = ['connection', 'global']
  protected _editingBookmarkId: string | null = null

  // ========== 书签方法（从组件抽取） ==========

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

    // 计算弹出位置：按钮下方，在 .sftp-root 内；宽高按触发面板可用空间 clamp
    const btn = (event?.currentTarget ?? event?.target) as HTMLElement | null
    const rootEl = (this.elRef?.nativeElement as HTMLElement)?.querySelector('.sftp-root') as HTMLElement | null
    if (!btn || !rootEl) {
      this.bookmarkPopupX = 80
      this.bookmarkPopupY = 87
      this.bookmarkPopupW = 320
      this.bookmarkPopupMaxH = 420
      this.bookmarkArrowLeft = 160
      this._bookmarkJustOpened = true
      this.showBookmarks = true
      queueMicrotask(() => { this._bookmarkJustOpened = false })
      return
    }
    const btnRect = btn.getBoundingClientRect()
    const rootRect = rootEl.getBoundingClientRect()
    const paneHost = btn.closest('sftp-file-pane') as HTMLElement | null
    const paneRect = paneHost?.getBoundingClientRect()
    const paneTitle = btn.closest('.pane-title') as HTMLElement | null
    const titleRect = paneTitle?.getBoundingClientRect()
    // ★ 用 getBoundingClientRect（精确到像素），避免 clientWidth 为 0 时回退 window 导致拆分窗溢出
    const rootW = rootRect.width
    const rootH = rootRect.height
    const margin = 4
    const idealW = 320
    const idealH = 420
    // 宽度：优先贴齐触发面板；窄窗上下布局时最多占面板约 72%，给文件列表留缝
    const paneW = paneRect ? paneRect.width : rootW
    const widthCap = this._isNarrowLayout
      ? Math.min(idealW, Math.max(180, Math.floor(paneW * 0.72)))
      : idealW
    const popupW = Math.min(widthCap, Math.max(160, Math.floor(Math.min(rootW, paneW) - margin * 2)))
    this.bookmarkPopupW = popupW

    let left = btnRect.left - rootRect.left
    if (!this._isNarrowLayout && pane === 'local') {
      // 左右布局：本地书签弹层右缘贴齐本地面板右缘（遮住列表滚动条），向左展开
      // ★ 2026-09-30：偏移量 1px → 2px。本地面板的右邻是分割线，弹层右缘落在自己面板外框内 1px 时
      //   仍压住分割线那一侧，并排对比下肉眼可见（用户实测：「本地的还得再往左 1px」）。
      //   远程分支保持 1px —— 远程面板右缘就是整根面板右缘，贴 1px 即对齐。
      //   两侧各自贴合自己面板的视觉内缘，允许彼此差 1px。
      if (paneRect) {
        const paneLeft = paneRect.left - rootRect.left
        const paneRight = paneRect.right - rootRect.left
        left = paneRight - popupW - 2
        left = Math.max(paneLeft + margin, left)
      } else {
        left = btnRect.right - rootRect.left - popupW
        left = Math.max(margin, left)
      }
      left = Math.max(2, Math.min(left, rootW - popupW - 2))
    } else if (!this._isNarrowLayout && pane === 'remote') {
      // 左右布局：远程书签弹层右缘贴齐远程面板右缘，向左展开，遮住文件列表滚动条
      // ★ 2026-09-30：偏移量与本地分支统一为 1px。原先本地是 -1、远程是 -2，两侧少贴的那 1px 在并排
      //   对比下肉眼可见（用户实测：「本地面板的书签面板右边刚好对齐，远程的没对齐，还要向右多 1px」）。
      //   语义：弹层右缘落在面板外框内 1px 处 ⇒ 正好盖住面板自身的 1px 边框，与本地完全一致。
      const paneRight = paneRect ? (paneRect.right - rootRect.left) : rootW
      const paneLeft = paneRect ? (paneRect.left - rootRect.left) : 0
      left = paneRight - popupW - 1
      left = Math.max(paneLeft + margin, left)
      left = Math.max(2, Math.min(left, rootW - popupW - 1))
    } else {
      // 窄布局（上下）：同样贴齐触发面板右缘，宽度已按面板 clamp，避免固定 320 盖住整半屏
      if (paneRect) {
        const paneLeft = paneRect.left - rootRect.left
        const paneRight = paneRect.right - rootRect.left
        left = paneRight - popupW - 2
        left = Math.max(paneLeft + margin, left)
      } else if (left + popupW > rootW - margin) {
        left = btnRect.right - rootRect.left - popupW
      }
      left = Math.max(margin, Math.min(left, rootW - popupW - margin))
    }
    this.bookmarkPopupX = left

    const anchorBottom = titleRect ? titleRect.bottom : (btnRect.bottom + 4)
    let top = anchorBottom - rootRect.top
    // 高度：优先落在触发面板内剩余高度，再与整根面板 clamp（拆分窗远程半屏常见不足 420）
    const spaceBelowRoot = Math.max(96, rootRect.bottom - anchorBottom - margin)
    const spaceBelowPane = paneRect
      ? Math.max(96, paneRect.bottom - anchorBottom - margin)
      : spaceBelowRoot
    let maxH = Math.min(idealH, spaceBelowRoot, spaceBelowPane)
    // 下方不够时尽量上移，保证弹层仍落在 .sftp-root 内
    if (top + maxH > rootH - margin) {
      top = Math.max(margin, rootH - margin - maxH)
    }
    if (top + maxH > rootH - margin) {
      maxH = Math.max(96, rootH - margin - top)
    }
    this.bookmarkPopupY = top
    this.bookmarkPopupMaxH = maxH

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
    this.newBookmarkName = ''
    this.newBookmarkPath = ''
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

    const created = this.bookmarks.add(name, bp, type, ck)
    if (!created) {
      // 无效路径：保留表单让用户修正
      return
    }
    this.newBookmarkName = ''; this.newBookmarkPath = ''; this.bookmarkAddScope = null
  }

  cancelBookmarkEdit(): void {
    this._editingBookmarkId = null
    this.newBookmarkName = ''
    this.newBookmarkPath = ''
    this.bookmarkAddScope = null
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
    const target = normalizeBookmarkPath(bm.path, bm.type) || bm.path
    if (bm.type === 'local') {
      this._pushLocalNav(target)
      this.localPath = target; this.localPathInput = target; this.saveCurrentPath(); void this.refreshLocal()
    } else {
      this._pushRemoteNav(target)
      this.remotePath = target; this.remotePathInput = target; this.saveCurrentPath(); void this.refreshRemote()
    }
    // 兼容选项：选中书签后自动关闭书签面板（仅关弹窗，不动整个 SFTP+ 面板）
    if (this.closeBookmarkPanelOnSelect) {
      this.closeBookmarks()
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
    if (!moved || !targetItem) return
    const fromAllIdx = all.findIndex(b => b.id === moved.id)
    const toAllIdx = all.findIndex(b => b.id === targetItem.id)
    if (fromAllIdx < 0 || toAllIdx < 0) return

    // ★ 2026-08-10 修复 #9：落点必须参与计算——拖到目标上半部=插到目标前，
    //   下半部=插到目标后（此前 dragOverBottom 只影响提示线，落点永远等同"目标前"）。
    //   reorder 内部先 splice(from,1) 再 splice(to,0,item)：向下拖时目标索引需 -1 修正
    let adjustedTo: number
    if (fromAllIdx < toAllIdx) {
      adjustedTo = dropBottom ? toAllIdx : toAllIdx - 1
    } else {
      adjustedTo = dropBottom ? toAllIdx + 1 : toAllIdx
    }
    if (adjustedTo === fromAllIdx) return // 落点等效原位，无需移动
    this.bookmarks.reorder(fromAllIdx, adjustedTo)
  }
}

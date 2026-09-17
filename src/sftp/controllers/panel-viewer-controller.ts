/**
 * SFTP+ 查看器/编辑器控制器基类（由 sftp-floating-panel.component.ts 抽取）
 * 功能描述：承载文件查看（文本/图片预览）与编辑器（在系统中编辑、自动同步、保存回传）逻辑与状态，供浮动面板组件继承
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-11
 * 修改人：DD1024z + Composer
 * 修改时间：2026-09-17 — onEditorContentChange 仅在 dirty 翻转时触发视图刷新，减轻粘贴卡顿
 *              2026-09-17 — 合并为 allowViewEditAllFiles；移除「以文本方式查看」
 */
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import { SFTPSessionLike, SFTPFile } from '../../services/sftp.service'
import type { LocalEntry } from '../core/panel-types'
import type { ViewerMode } from '../components/sftp-viewer-dialog.component'
import type { TransferLogEntry } from '../../services/sftp-transfer-log.service'
import {
  isViewableRemoteFileType, isEditableRemoteFileType, isImageFile,
  isBinaryBuffer, bufferToText, bufferToDataUrl,
  isRemoteFileTooLargeForView,
  getViewMaxBytes, formatBytesLimit, EDIT_TEXT_MAX_BYTES,
} from '../core/file-utils'
import {
  downloadRemoteToBuffer, downloadRemoteToTempFile, writeTextToFile,
  readTextFromFile, removeTempFile, writeBufferToTemp, readLocalFileToBuffer,
} from '../core/transfer-adapters'
import { SftpPanelColumnController } from './panel-column-controller'

import { log } from '../../services/sftp-logger'

/** 图片预览导航用的轻量条目描述（兼容 LocalEntry 与 SFTPFile 的交集字段） */
type ViewerImageEntry = { name: string; fullPath: string; size?: number; isDirectory?: boolean; mode?: number }

export abstract class SftpPanelViewerController extends SftpPanelColumnController {
  // ===== 跨簇依赖（由子类 SftpFloatingPanel 提供实现/赋值） =====
  protected sftpSession: SFTPSessionLike | null = null
  protected notifications: any = null
  protected closeContextMenu(): void { /* overridden by subclass */ }
  protected showToast(_message: string, _ms?: number): void { /* overridden by subclass */ }
  protected async refreshLocal(): Promise<void> { /* overridden by subclass */ }
  protected async _doUpload(_remotePath: string, _localPath: string, _logOperation?: 'upload' | 'edit-upload'): Promise<boolean> { return false /* overridden by subclass */ }
  protected _logEditorTransfer(
    _operation: 'edit-upload' | 'edit-download',
    _remotePath: string,
    _localPath: string,
    _size: number,
    _success: boolean,
    _startTime: number,
    _failReason?: TransferLogEntry['failReason'],
  ): void { /* overridden by subclass */ }
  /** 可由面板覆写，从设置读取可查看/编辑的文本扩展名白名单。 */
  protected getCustomEditableExtensions(): string[] { return [] }
  /** 可由面板覆写：忽略扩展名白名单，允许查看与编辑所有非目录文件。 */
  protected getAllowViewEditAllFiles(): boolean { return false }

  // ===== 文件查看 / 编辑 状态字段（从组件抽取） =====
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
  viewerTempPath = ''
  private _viewerGen = 0

  // 图片预览导航：当前目录图片子集（按当前排序/过滤后的顺序）与当前索引（仅图片模式使用）
  viewerPane: 'local' | 'remote' = 'local'
  viewerImageList: ViewerImageEntry[] = []
  viewerImageIndex = 0
  get viewerImageCount(): number { return this.viewerImageList.length }

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
  editorTempPath = ''
  _editorSavePath = ''
  /** 打开远程编辑时的基线 mtime/size，保存前冲突检测用 */
  private _editorRemoteBaseline: { mtimeMs: number; size: number } | null = null
  _editorFileWatcher: fsSync.FSWatcher | null = null

  protected _editorWatchDebounce: ReturnType<typeof setTimeout> | null = null
  /** 限制外部编辑器频繁保存导致 watch 回调堆积：两次实际同步间隔不低于 800ms */
  private _editorWatchLastSync = 0

  // ===== 在系统中打开相关字段 =====
  protected _openPathKeyupHandler: ((ev: KeyboardEvent) => void) | null = null
  protected _openPathTimeoutId: ReturnType<typeof setTimeout> | null = null

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

  protected async _viewLocalFile(entry: LocalEntry | null): Promise<void> {
    if (!this._prepareViewer(entry, false)) return
    this._setupViewerImageNav(entry!, 'local')
    try {
      const buf = await readLocalFileToBuffer(entry!.linkTarget || entry!.fullPath)
      await this._fillViewerFromBuffer(buf, entry!.name)
    } catch (e) {
      this.viewerError = this.i18n.t('viewer.loadFailed')
      log.error('View local file failed', e)
    } finally {
      this.viewerLoading = false
      this.cdr.detectChanges()
    }
  }

  protected async _viewRemoteFile(entry: SFTPFile | null): Promise<void> {
    if (!this._prepareViewer(entry, true)) return
    this._setupViewerImageNav(entry!, 'remote')
    const gen = ++this._viewerGen
    try {
      const buf = await downloadRemoteToBuffer(
        this.sftpSession!, entry.fullPath, entry.size ?? 0, entry.mode,
        // ★ 2026-07-25 B8：硬上限兜底，防止服务器谎报 size 时整文件进内存
        getViewMaxBytes(entry.name),
      )
      if (gen !== this._viewerGen) return // 已被新请求取代，丢弃过时结果
      await this._fillViewerFromBuffer(buf, entry.name)
      await this._cleanupViewerTemp()
      this.viewerTempPath = await writeBufferToTemp(buf, entry.name)
      this.viewerSystemPath = this.viewerTempPath
    } catch (e) {
      if (gen !== this._viewerGen) return
      this.viewerError = this.i18n.t('viewer.loadFailed')
      log.error('View remote file failed', e)
    } finally {
      if (gen === this._viewerGen) {
        this.viewerLoading = false
        this.cdr.detectChanges()
      }
    }
  }

  /** 查看器公共校验 + 状态初始化：条目有效性、文件类型、大小限制、viewer 状态重置 */
  private _prepareViewer(entry: { name: string; fullPath: string; size?: number; isDirectory?: boolean } | null, isRemote: boolean): boolean {
    if (!entry || entry.isDirectory) return false
    if (isRemote && (!this.connected || !this.sftpSession)) return false
    this.closeContextMenu()
    const allowAll = this.getAllowViewEditAllFiles()
    if (!isViewableRemoteFileType(entry.name, this.getCustomEditableExtensions(), allowAll)) {
      this.showToast(this.i18n.t('viewer.typeNotSupported'))
      return false
    }
    const size = entry.size ?? 0
    if (isRemoteFileTooLargeForView(entry.name, size, this.getCustomEditableExtensions(), allowAll)) {
      const limit = formatBytesLimit(getViewMaxBytes(entry.name))
      this._showViewerError(entry.name, entry.fullPath, limit, isImageFile(entry.name))
      return false
    }
    this._resetViewerState()
    this.viewerFileName = entry.name
    this.viewerDisplayPath = entry.fullPath
    if (!isRemote) this.viewerSystemPath = entry.fullPath
    this.viewerMode = isImageFile(entry.name) ? 'image' : 'text'
    this.viewerVisible = true
    this.viewerLoading = true
    return true
  }

  private _showViewerError(fileName: string, displayPath: string, limit: string, isImage: boolean): void {
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
    this._cleanupViewerTemp().catch(() => {})
  }

  private async _fillViewerFromBuffer(buf: Buffer, fileName: string): Promise<void> {
    if (isImageFile(fileName)) {
      this.viewerImageUrl = bufferToDataUrl(buf, fileName)
    } else if (isBinaryBuffer(buf)) {
      if (this.getAllowViewEditAllFiles()) {
        // 「查看全部」开启：二进制也以文本解码展示（与旧「以文本方式查看」一致）
        this.viewerTextContent = bufferToText(buf).text
        this.showToast(this.i18n.t('viewer.binaryShownAsText'))
      } else {
        this.viewerError = this.i18n.t('viewer.binaryNotSupported')
      }
    } else {
      this.viewerTextContent = bufferToText(buf).text
    }
  }

  private async _editLocalFile(entry: LocalEntry | null): Promise<void> {
    if (!this._validateEditEntry(entry, false)) return
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
      log.error('Edit local file load failed', e)
    } finally {
      this.editorLoading = false
      if (this.editorLocalPath && !this.editorError) this._startEditorFileWatch(this.editorLocalPath)
      this.cdr.detectChanges()
    }
  }

  private async _editRemoteFile(entry: SFTPFile | null): Promise<void> {
    if (!this._validateEditEntry(entry, true)) return
    const size = entry.size ?? 0
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

  /** 编辑器公共校验：条目有效性、文件类型、大小限制 */
  private _validateEditEntry(entry: { name: string; fullPath: string; size?: number; isDirectory?: boolean } | null, isRemote: boolean): boolean {
    if (!entry || entry.isDirectory) return false
    if (isRemote && (!this.connected || !this.sftpSession)) return false
    this.closeContextMenu()
    if (!this.isFileNameEditable(entry.name)) {
      this.showToast(this.i18n.t('editor.typeNotSupported'))
      return false
    }
    const size = entry.size ?? 0
    const limit = formatBytesLimit(EDIT_TEXT_MAX_BYTES)
    if (size > EDIT_TEXT_MAX_BYTES) {
      this._showEditorError(entry.name, entry.fullPath, limit)
      return false
    }
    return true
  }

  /** 供子类的右键菜单可见性和实际打开校验共用，避免两处规则漂移。 */
  protected isFileNameEditable(fileName: string): boolean {
    return isEditableRemoteFileType(
      fileName,
      this.getCustomEditableExtensions(),
      this.getAllowViewEditAllFiles(),
    )
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
        // ★ 2026-08-26 H5：记录打开时远端基线，保存前做冲突检测
        this._editorRemoteBaseline = null
        try {
          const st = await this.sftpSession.stat?.(opts.remoteSavePath) as any
          if (st) {
            const mtimeMs = st.modified instanceof Date
              ? st.modified.getTime()
              : (typeof st.mtime === 'number' ? (st.mtime < 1e12 ? st.mtime * 1000 : st.mtime) : 0)
            this._editorRemoteBaseline = { mtimeMs, size: Number(st.size) || opts.remoteSize || 0 }
          } else {
            this._editorRemoteBaseline = { mtimeMs: 0, size: opts.remoteSize ?? 0 }
          }
        } catch {
          this._editorRemoteBaseline = { mtimeMs: 0, size: opts.remoteSize ?? 0 }
        }
      } catch (e) {
        this.editorError = this.i18n.t('viewer.loadFailed')
        log.error('Edit remote file load failed', e)
        await this._cleanupEditorTemp()
        this.editorLocalPath = ''
        this._editorRemoteBaseline = null
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
    this._editorRemoteBaseline = null
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
      this._editorFileWatcher.on('error', (err) => {
        log.warn('editor file watch error:', err)
        this._stopEditorFileWatch()
      })
    } catch (e) {
      log.warn('Editor file watch failed:', e)
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
    // ★ 2026-08-26：面板内已有未保存编辑时，不让外部 watch 静默覆盖内存内容
    if (this.editorDirty) return
    // ★ 限制外部编辑器频繁保存导致 watch 回调堆积：两次实际同步间隔不低于 800ms
    const now = Date.now()
    if (now - this._editorWatchLastSync < 800) return
    this._editorWatchLastSync = now
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

  protected _openPathInSystem(filePath: string, opts?: { waitForModRelease?: boolean }): void {
    const open = (): void => {
      try {
        const { shell } = require('electron')
        shell.openPath(filePath).then((err?: string) => {
          if (err) log.error('Open in system failed:', err)
        })
      } catch (e) {
        log.error('Open in system failed:', e)
      }
    }

    if (!opts?.waitForModRelease) {
      open()
      return
    }

    // Ctrl/⌘ 仍按住时 Windows 会按「后台打开」处理，窗口不置顶。
    // 等修饰键松开后再调用（最多等 800ms）。
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      if (this._openPathKeyupHandler) {
        window.removeEventListener('keyup', this._openPathKeyupHandler, true)
        this._openPathKeyupHandler = null
      }
      if (this._openPathTimeoutId) {
        clearTimeout(this._openPathTimeoutId)
        this._openPathTimeoutId = null
      }
      open()
    }
    // ★ 2026-08-10 修复 #22：800ms 窗口内再次打开时，先清理上一轮未触发的监听/定时器，
    //   否则旧引用被覆盖后永远无法移除 → window keyup 监听泄漏
    if (this._openPathKeyupHandler) {
      window.removeEventListener('keyup', this._openPathKeyupHandler, true)
      this._openPathKeyupHandler = null
    }
    if (this._openPathTimeoutId) {
      clearTimeout(this._openPathTimeoutId)
      this._openPathTimeoutId = null
    }
    this._openPathKeyupHandler = (ev: KeyboardEvent): void => {
      if (ev.key === 'Control' || ev.key === 'Meta' || ev.key === 'OS') finish()
    }
    window.addEventListener('keyup', this._openPathKeyupHandler, true)
    this._openPathTimeoutId = setTimeout(finish, 800)
  }

  /** 远程文件下载到临时目录后用系统默认程序打开 */
  protected async _openRemoteInSystem(entry: SFTPFile): Promise<void> {
    if (!entry || entry.isDirectory || !this.connected || !this.sftpSession) return
    try {
      this.showToast(this.i18n.t('viewer.loading'))
      const localPath = await downloadRemoteToTempFile(
        this.sftpSession,
        entry.fullPath,
        entry.size ?? 0,
        entry.mode,
      )
      this._openPathInSystem(localPath)
    } catch (e) {
      this.showToast(this.i18n.t('viewer.loadFailed'))
      log.error('Open remote in system failed', e)
    }
  }

  closeViewer(): void {
    // ★ 2026-08-10 修复 #21：关闭时递增 gen，使在途加载的结果因 gen 失配被丢弃，
    //   避免关闭后迟到的内容又被写回（下次打开瞬间闪现上一个文件）
    this._viewerGen++
    this.viewerVisible = false
    this.viewerLoading = false
    this.viewerError = ''
    this.viewerTextContent = ''
    this.viewerImageUrl = ''
    this.viewerSystemPath = ''
    this.viewerImageList = []
    this.viewerImageIndex = 0
    this._cleanupViewerTemp().catch(() => {})
  }

  /** 由子类（SftpFloatingPanel）override：返回当前目录按排序/过滤后的条目列表 */
  protected getFilteredLocalEntries(): LocalEntry[] { return [] }
  protected getFilteredRemoteEntries(): SFTPFile[] { return [] }

  /** 计算当前目录图片子集并定位当前查看图片的索引（供上一张/下一张导航） */
  private _setupViewerImageNav(entry: { name: string; fullPath: string; isDirectory?: boolean }, pane: 'local' | 'remote'): void {
    this.viewerPane = pane
    if (!isImageFile(entry.name)) {
      this.viewerImageList = []
      this.viewerImageIndex = -1
      return
    }
    const all = pane === 'local' ? this.getFilteredLocalEntries() : this.getFilteredRemoteEntries()
    const imgs = all.filter(e => !e.isDirectory && isImageFile(e.name))
    this.viewerImageList = imgs as ViewerImageEntry[]
    this.viewerImageIndex = imgs.findIndex(e => e.fullPath === entry.fullPath)
  }

  /** 图片预览：切换到上一张/下一张（offset = -1 上一张，+1 下一张） */
  async gotoViewerImage(offset: number): Promise<void> {
    if (this.viewerMode !== 'image' || this.viewerLoading) return
    const list = this.viewerImageList
    if (!list.length) return
    let idx = this.viewerImageIndex + offset
    idx = Math.max(0, Math.min(list.length - 1, idx))
    if (idx === this.viewerImageIndex) return
    const entry = list[idx]
    this.viewerImageIndex = idx
    if (this.viewerPane === 'local') await this._viewLocalFile(entry as LocalEntry)
    else await this._viewRemoteFile(entry as SFTPFile)
  }

  onEditorContentChange(value: string): void {
    this.editorContent = value
    const dirty = value !== this.editorOriginalContent
    if (dirty === this.editorDirty) return
    this.editorDirty = dirty
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
        if (!this.sftpSession || !this._editorSavePath) {
          this.showToast(this.i18n.t('editor.saveFailed'))
          return
        }
        // ★ 2026-08-26 H5：保存前比对远端 mtime/size，变更则提示确认覆盖
        if (this._editorRemoteBaseline) {
          try {
            const st = await this.sftpSession.stat?.(this._editorSavePath) as any
            if (st) {
              const mtimeMs = st.modified instanceof Date
                ? st.modified.getTime()
                : (typeof st.mtime === 'number' ? (st.mtime < 1e12 ? st.mtime * 1000 : st.mtime) : 0)
              const size = Number(st.size) || 0
              const changed =
                (this._editorRemoteBaseline.mtimeMs > 0 && mtimeMs > 0 && mtimeMs !== this._editorRemoteBaseline.mtimeMs) ||
                (size > 0 && this._editorRemoteBaseline.size > 0 && size !== this._editorRemoteBaseline.size)
              if (changed) {
                const ok = window.confirm(
                  this.i18n.t('editor.remoteChanged')
                    || '远程文件已被修改。确定要覆盖服务器上的版本吗？',
                )
                if (!ok) return
              }
            }
          } catch { /* stat 失败则继续尝试上传 */ }
        }
        const uploaded = await this._doUpload(this._editorSavePath, this.editorLocalPath, 'edit-upload')
        // ★ 2026-08-26 C5：必须检查上传结果，失败时保留 dirty 与编辑器
        if (!uploaded) {
          this.showToast(this.i18n.t('editor.saveFailed'))
          try { this.notifications?.error?.(this.i18n.t('editor.saveFailed'), '') } catch {}
          return
        }
        void this.refreshRemote()
        // 刷新基线
        try {
          const st = await this.sftpSession.stat?.(this._editorSavePath) as any
          if (st) {
            const mtimeMs = st.modified instanceof Date
              ? st.modified.getTime()
              : (typeof st.mtime === 'number' ? (st.mtime < 1e12 ? st.mtime * 1000 : st.mtime) : 0)
            this._editorRemoteBaseline = { mtimeMs, size: Number(st.size) || 0 }
          }
        } catch { /* ignore */ }
      } else {
        void this.refreshLocal()
      }
      this.editorOriginalContent = this.editorContent
      this.editorDirty = false
      // ★ 修复：本地编辑保存提示"已保存"，远程才提示"已保存到服务器"
      this.showToast(this.editorIsRemote ? this.i18n.t('editor.saveSuccess') : (this.i18n.t('editor.saveSuccessLocal') || '已保存'))
      this.closeEditor(false)
    } catch (e) {
      const msg = this.i18n.t('editor.saveFailed')
      try { this.notifications?.error?.(msg, '') } catch {}
      log.error('Editor save failed', e)
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
    this._editorRemoteBaseline = null
    this.editorIsRemote = false
  }

  protected async _cleanupViewerTemp(): Promise<void> {
    if (!this.viewerTempPath) return
    const p = this.viewerTempPath
    this.viewerTempPath = ''
    await removeTempFile(p)
  }

  protected async _cleanupEditorTemp(): Promise<void> {
    this._stopEditorFileWatch()
    if (!this.editorTempPath) return
    const p = this.editorTempPath
    this.editorTempPath = ''
    await removeTempFile(p)
  }
}

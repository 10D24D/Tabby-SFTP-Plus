/**
 * SFTP+ 查看器/编辑器控制器基类（由 sftp-floating-panel.component.ts 抽取）
 * 功能描述：承载文件查看（文本/图片预览）与编辑器（在系统中编辑、自动同步、保存回传）逻辑与状态，供浮动面板组件继承
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-11
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-26 — 两处 `window.confirm()` 换成面板内确认框（askConfirm）：编辑器「未保存
 *              关闭」与「远端已变更仍要覆盖」。原生 confirm 点「取消」后 Electron(Win) 不交还焦点链，
 *              编辑器还开着但输入框/下拉框全部点不动（详见 sftp-confirm-dialog 头部注释）。
 *              两处 await 之后都按**代际快照**复核（_editorGen 变了就放弃），不按「还可见」判。
 *              2026-10-23 — 编辑器手动保存成功后不再自动关闭（只更新基线并提示已保存，保持窗口可继续编辑）；
 *              查看器「在系统中编辑」：新增 _viewerEntry（prepare 之后留底当前条目）+
 *              openViewerInSystemEdit（先切编辑器、再 shell 打开；本地/远程各走各自入口）+
 *              viewerShowEditInSystem 判据；外部改动高亮与 dirty 同步（内容改回原样即熄灭）。
 *              2026-10-22 — 方案 A/B/C 收尾：自动上传成功后保持编辑器打开并继续监听（不关闭），形成 VS Code 自动保存场景下的持续同步闭环；远端冲突降级为方案 B 提示。
 *              2026-10-20 全量审计 P1-14 修复：_fillViewerFromBuffer 补代际守卫。
 *              2026-10-20 全量审计：① _syncEditorFromDisk 按路径快照校验（防 A 文件内容写进 B 编辑器）；
 *                ② 查看器/编辑器临时文件在代际失配分支回收，消除磁盘残留。
 *              该让出一帧（setTimeout(0)）后的解码全程不比对 _viewerGen，两个调用点只在
 *              **返回后**复核 ⇒ 让出窗口内打开新文件时，旧结果照样写 viewerTextContent /
 *              viewerError；最坏不自愈的一条：旧文件是二进制 ⇒ viewerError 被置「二进制
 *              不支持」，而新文本分支只写 content 不清 error ⇒ 新文件显示错误页。
 *              现函数增加可选 gen 形参，让出后立即复查，两个调用点同步传入。
 *              2026-10-18 — issue #27：查看/编辑/系统打开会话归属参数化——左栏远程端点
 *              （第二 SFTP 会话）的文件此前被当本地文件处理（_viewLocalFile 读本地 fs /
 *              toast 拒绝），「在系统中打开」按钮也因 viewerSystemPath 不落值而缺失；
 *              现在 _viewRemoteFile/_editRemoteFile/_openRemoteInSystem 增加可选 session，
 *              _viewerSession/_editorSession 记录当前归属，保存回传/基线 stat/图片导航
 *              全链路按会话路由（左栏远程保存后刷新左栏）。
 *              2026-10-13 — 2026-10-13 全量审计第三批修复（查看器/编辑器代际与编码）：
 *              ① P1 编辑器打开全链路无代际保护 ⇒ 快速连开两个文件内容串台：新增 _editorGen，
 *                 _openEditorShell 入口递增并**返回代际**，本地读取路径与远程下载/读盘/stat
 *                 各 await 之后写状态前逐一比对；closeEditor 也递增代际作废在途结果。
 *              ② P1 _viewRemoteFile 的 temp 写入无 gen 检查：_fillViewerFromBuffer 内部
 *                 setTimeout(0) 让出一帧，gen 可在此窗口变化；其后清理旧 temp / 写新 temp /
 *                 记 systemPath 三步各补复核（旧文件结果会污染新查看器、「系统中打开」
 *                 可能打开上一个文件的残留）。
 *              ③ P1 watch 同步与保存前重读写死 utf8：gb18030 显示乱码并置脏，utf-16le 一旦
 *                 保存即用 utf16le 把乱码写回、原文件被永久覆盖。两处（_syncEditorFromDisk /
 *                 saveEditor 的非 dirty 重读）改为读 Buffer 走 bufferToText 按真实编码解码，
 *                 并同步校正 editorEncoding；二进制内容跳过同步。
 *              2026-09-21 — P1/P2 修复：远程编辑下载要求 requireExactSize + maxBytes —— 大小不可确认
 *              时拒绝打开，否则提前 EOF 的残缺内容一保存就覆盖掉服务器上的完整文件；本地编辑补
 *              maxBytes 硬限（原只看 listing 的 size，为 0 或过期时超大文件会整份读进内存）；
 *              打开编辑器前先关查看器，避免两个 overlay 同时挂载叠层
 *              2026-09-21 — 本地查看加入请求代际保护，异步视图刷新统一走安全入口；
 *              第六轮审计 P2 修复：「系统中打开」临时文件登记并统一清理（此前逐次泄漏）；
 *              本地查看 .lnk 快捷方式目标时补 maxBytes 上限（entry.size 是链接大小，目标可超大）
 *              2026-09-20 — issue #23：查看器改虚拟滚动后恢复全文传入（不再截断 toast）
 *              2026-09-17 — onEditorContentChange 仅在 dirty 翻转时触发视图刷新，减轻粘贴卡顿
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
  isBinaryBuffer, bufferToText, bufferToDataUrl, canRoundTripSafely,
  isRemoteFileTooLargeForView,
  getViewMaxBytes, formatBytesLimit, EDIT_TEXT_MAX_BYTES,
} from '../core/file-utils'
import {
  downloadRemoteToBuffer, downloadRemoteToTempFile, writeTextToFile,
  removeTempFile, writeBufferToTemp, readLocalFileToBuffer,
} from '../core/transfer-adapters'
import { SftpPanelColumnController } from './panel-column-controller'

import { log } from '../../services/sftp-logger'

/** 图片预览导航用的轻量条目描述（兼容 LocalEntry 与 SFTPFile 的交集字段） */
type ViewerImageEntry = { name: string; fullPath: string; size?: number; isDirectory?: boolean; mode?: number }

export abstract class SftpPanelViewerController extends SftpPanelColumnController {
  // ===== 跨簇依赖（由子类 SftpFloatingPanel 提供实现/赋值） =====
  protected sftpSession: SFTPSessionLike | null = null
  /** ★ 2026-10-18 issue #27：左栏远程端点状态（子类提供真值）——查看/编辑须按归属栏路由会话 */
  protected _leftKind: 'local' | 'remote' = 'local'
  protected _leftSftpSession: SFTPSessionLike | null = null
  protected notifications: any = null
  protected closeContextMenu(): void { /* overridden by subclass */ }
  protected showToast(_message: string, _ms?: number): void { /* overridden by subclass */ }
  protected async refreshLocal(): Promise<void> { /* overridden by subclass */ }
  protected async _doUpload(_remotePath: string, _localPath: string, _logOperation?: 'upload' | 'edit-upload', _session?: SFTPSessionLike | null): Promise<boolean> { return false /* overridden by subclass */ }
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
  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：可由面板覆写：是否开启「外部编辑自动上传」（方案 A）。默认 false = 仅走方案 B 提示。 */
  protected _getEditorAutoUpload(): boolean { return false }
  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：可由面板覆写：返回当前编辑所属连接的标识（user@host），
   *   仅用于方案 C 稳定临时路径 key 的命名空间，避免不同连接同名路径复用同一临时文件。 */
  protected _getEditorConnectionLabel(_isLeft: boolean): string { return '' }

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
  /** ★ 2026-10-18 issue #27：当前查看的远程文件所用会话（右栏=主会话；左栏远程=第二会话；本地查看=null） */
  viewerSession: SFTPSessionLike | null = null
  /** 图片导航列表来源栏（左栏远程查看时其条目存于本地面板，nav 取 'local'） */
  private _viewerNavPane: 'local' | 'remote' = 'local'
  private _viewerGen = 0
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：查看器当前打开的条目（`_prepareViewer` 之后赋值）。
   *   「在系统中编辑」要把查看器换成编辑器，而 `_editRemoteFile` 需要 name / fullPath / size / mode ——
   *   `viewerFileName` + `viewerDisplayPath` 拿不到 size/mode，所以保留整条 entry。
   *   ⛔ 必须在 `_prepareViewer` **之后**赋值（它内部 `_resetViewerState` 会清空本字段）。
   */
  private _viewerEntry: { name: string; fullPath: string; size?: number; mode?: number; isDirectory?: boolean } | null = null

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
  /**
   * ★ 2026-10-09 新增：当前编辑内容实际使用的字符编码（由 bufferToText 如实报告）。
   *
   * 为什么必须记：file-utils 的 bufferToText 原先对非 UTF-8 回退 latin1（不是真实编码），
   *   中文 Windows 的 GBK/GB18030 文件因此显示乱码，**用户一按保存就永久损坏**。
   *   改为真实解码（gb18030）后显示正常了，但 saveEditor 原先**写死 'utf8'**
   *   ⇒ 会把 GBK 文件保存成 UTF-8（内容对但编码变了，依赖原编码的软件全崩）。
   *   根治是「解码用真实编码 + 保存按同一编码写回」，缺一不可 ——
   *   本字段就是把这个「同一编码」从解码结果传到保存路径的唯一载体。
   *
   * 取值：'utf-8' | 'utf-16le' | 'gb18030'（'binary' 不会走到编辑器）。
   */
  editorEncoding = 'utf-8'
  /** 保存被禁时只提示一次（避免每次点保存都弹） */
  private _editorEncodingWarned = false
  /**
   * ★ 2026-10-13 P1 修复：编辑器「代际」计数（与 _viewerGen 同机制）。
   *
   * 查看路径早有 _viewerGen 代际守卫，编辑路径一直没有：加载 A 未完成时又打开 B，
   * A 的 await readLocalFileToBuffer / downloadRemoteToTempFile 返回后会覆盖 B 的
   * editorContent/editorLocalPath，A 的 finally 还把 B 的 loading 置 false 并在 B 的
   * 路径上启 watch ⇒ 内容串台、loading 状态错、watch 绑错文件。
   * _openEditorShell 入口递增，所有 await 之后写状态前比对；不等即丢弃过时结果。
   */
  private _editorGen = 0
  editorLocalPath = ''
  editorIsRemote = false
  editorError = ''
  editorTempPath = ''
  _editorSavePath = ''
  /** ★ 2026-10-18 issue #27：当前编辑的远程文件所用会话（下载/基线 stat/保存回传全按它路由） */
  protected _editorSession: SFTPSessionLike | null = null
  /** 打开远程编辑时的基线 mtime/size，保存前冲突检测用 */
  private _editorRemoteBaseline: { mtimeMs: number; size: number } | null = null
  _editorFileWatcher: fsSync.FSWatcher | null = null

  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：外部编辑器改动已同步进内存但尚未上传到服务器（方案 B 横幅标志） */
  editorExternalDirty = false
  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 A 自动上传定时器句柄 */
  private _autoUploadTimer: ReturnType<typeof setTimeout> | null = null

  protected _editorWatchDebounce: ReturnType<typeof setTimeout> | null = null
  /** 限制外部编辑器频繁保存导致 watch 回调堆积：两次实际同步间隔不低于 800ms */
  private _editorWatchLastSync = 0

  // ===== 在系统中打开相关字段 =====
  protected _openPathKeyupHandler: ((ev: KeyboardEvent) => void) | null = null
  protected _openPathTimeoutId: ReturnType<typeof setTimeout> | null = null
  /** ★ 2026-09-21 P2：「在系统中打开」下载的临时文件登记——此前下载后无任何清理路径，
   *  每次打开泄漏一个临时文件；面板销毁时统一 best-effort 清理 */
  protected _systemOpenTempFiles: string[] = []

  async ctxViewFile(): Promise<void> {
    // ★ 2026-10-18 issue #27：左栏远程端点 → 与右栏远程同一套查看流程（第二会话承载）；
    //   此前走 _viewLocalFile 对 POSIX 路径读本地 fs，必然「加载失败」且无「在系统中打开」。
    // ★ 2026-10-19：右栏本地（rl）与左栏本地同属本地 fs，按 contextMenuPane!=='remote' 判定本地查看。
    if (this.contextMenuPane === 'local' && this._leftKind === 'remote' && this._leftSftpSession) {
      await this._viewRemoteFile(this.contextMenuEntry as unknown as SFTPFile, this._leftSftpSession)
      return
    }
    if (this.contextMenuPane !== 'remote') {
      await this._viewLocalFile(this.contextMenuEntry as LocalEntry | null)
    } else {
      await this._viewRemoteFile(this.contextMenuEntry as SFTPFile | null)
    }
  }

  async ctxEditFile(): Promise<void> {
    // ★ 2026-10-18 issue #27：左栏远程端点 → 与右栏远程同一套编辑流程（第二会话承载，
    //   下载 temp / 保存回传 / 基线冲突检测全按该会话路由）
    // ★ 2026-10-19：rl 与左栏本地同属本地 fs，按 contextMenuPane!=='remote' 判定本地编辑。
    if (this.contextMenuPane === 'local' && this._leftKind === 'remote' && this._leftSftpSession) {
      await this._editRemoteFile(this.contextMenuEntry as unknown as SFTPFile, this._leftSftpSession)
      return
    }
    if (this.contextMenuPane !== 'remote') {
      await this._editLocalFile(this.contextMenuEntry as LocalEntry | null)
    } else {
      await this._editRemoteFile(this.contextMenuEntry as SFTPFile | null)
    }
  }

  protected async _viewLocalFile(entry: LocalEntry | null): Promise<void> {
    if (!this._prepareViewer(entry, false)) return
    // ★ 2026-10-23：留底当前条目，供「在系统中编辑」把查看器换成编辑器（必须在 _prepareViewer 之后）
    this._viewerEntry = entry
    this._setupViewerImageNav(entry!, 'local')
    const gen = ++this._viewerGen
    try {
      // ★ 2026-09-21 P2：.lnk 快捷方式的 entry.size 是链接自身大小，目标可能是超大文件——
      //   此前无 maxBytes 全量读内存；补上与远程查看一致的上限兜底（超出抛 FILE_TOO_LARGE）
      const buf = await readLocalFileToBuffer(entry!.linkTarget || entry!.fullPath, getViewMaxBytes(entry!.name))
      if (gen !== this._viewerGen) return
      await this._fillViewerFromBuffer(buf, entry!.name, gen)
      if (gen !== this._viewerGen) return
    } catch (e) {
      if (gen !== this._viewerGen) return
      this.viewerError = this.i18n.t('viewer.loadFailed')
      log.error('View local file failed', e)
    } finally {
      if (gen === this._viewerGen) {
        this.viewerLoading = false
        this._safeDetect()
      }
    }
  }

  protected async _viewRemoteFile(entry: SFTPFile | null, session: SFTPSessionLike | null = null): Promise<void> {
    // ★ 2026-10-18 issue #27：会话归属参数化——右栏远程=主会话（默认），左栏远程=第二会话（显式传入）
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：**赋值必须放在 _prepareViewer 之后**。_prepareViewer 内部会调
    //   _resetViewerState()（为上一个文件收尾），其中把 viewerSession 清成 null；原实现先赋值
    //   再调用，紧接着的 downloadRemoteToBuffer(this.viewerSession!) 拿到 null ⇒
    //   `Cannot read properties of null (reading 'download')`，查看器一律显示「无法加载文件」。
    //   编辑不受影响是因为它用 _editorSession，而 _validateEditEntry 不复位该字段。
    const effectiveSession = session ?? this.sftpSession
    if (!this._prepareViewer(entry, true, effectiveSession)) return
    // ★ 2026-10-23：留底当前条目（远程尺寸/mode 只有 entry 上有，viewerFileName 拿不到）
    this._viewerEntry = entry
    this.viewerSession = effectiveSession
    // 左栏远程查看时条目存于本地面板列表，图片导航列表取 'local' 侧
    this._setupViewerImageNav(entry!, session && session !== this.sftpSession ? 'local' : 'remote')
    const gen = ++this._viewerGen
    try {
      const buf = await downloadRemoteToBuffer(
        this.viewerSession!, entry.fullPath, entry.size ?? 0, entry.mode,
        // ★ 2026-07-25 B8：硬上限兜底，防止服务器谎报 size 时整文件进内存
        getViewMaxBytes(entry.name),
      )
      if (gen !== this._viewerGen) return // 已被新请求取代，丢弃过时结果
      await this._fillViewerFromBuffer(buf, entry.name, gen)
      // ★ 2026-10-13 P1 修复：_fillViewerFromBuffer 内部有 setTimeout(0) 让出一帧，
      //   gen 可能在该窗口变化——其后每一步（清理旧 temp / 写新 temp / 记 systemPath）
      //   都必须复核，否则旧文件的结果会污染新查看器状态（「在系统中打开」打开的是
      //   上一个文件的残留，或把新请求刚登记的 temp 删掉）
      if (gen !== this._viewerGen) return
      await this._cleanupViewerTemp()
      if (gen !== this._viewerGen) return
      // ★ 2026-10-20 全量审计 P2：先落到局部变量再赋字段。原实现把 await 结果直接写进
      //   共享字段 `viewerTempPath`，随后的 gen 复查若失配就 return，刚创建的临时文件
      //   既没登记也没人删 ⇒ 磁盘残留（.sftp-plus-tmp 越堆越多）。
      const tempPath = await writeBufferToTemp(buf, entry.name)
      if (gen !== this._viewerGen) {
        try { await removeTempFile(tempPath) } catch { /* 清理失败不影响后续流程 */ }
        return
      }
      this.viewerTempPath = tempPath
      this.viewerSystemPath = tempPath
    } catch (e) {
      if (gen !== this._viewerGen) return
      this.viewerError = this.i18n.t('viewer.loadFailed')
      log.error('View remote file failed', e)
    } finally {
      if (gen === this._viewerGen) {
        this.viewerLoading = false
        this._safeDetect()
      }
    }
  }

  /** 查看器公共校验 + 状态初始化：条目有效性、文件类型、大小限制、viewer 状态重置 */
  private _prepareViewer(entry: { name: string; fullPath: string; size?: number; isDirectory?: boolean } | null, isRemote: boolean, session?: SFTPSessionLike | null): boolean {
    if (!entry || entry.isDirectory) return false
    // ★ 2026-10-18 issue #27：远程查看按「传入会话」判定（左栏远程=第二会话），不再绑定主面板连接状态
    if (isRemote && !session) return false
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
    this._safeDetect()
  }

  private _resetViewerState(): void {
    this._viewerEntry = null
    this.viewerLoading = false
    this.viewerError = ''
    this.viewerTextContent = ''
    this.viewerImageUrl = ''
    this.viewerSystemPath = ''
    this.viewerSession = null
    this._cleanupViewerTemp().catch(() => {})
  }

  private async _fillViewerFromBuffer(buf: Buffer, fileName: string, gen?: number): Promise<void> {
    // 让出一帧，确保 loading spinner 先画出，避免大文件解码时界面假死
    await new Promise<void>(r => setTimeout(r, 0))
    // ★ 2026-10-19 P1（audit）：代际守卫。上面这一跳会让出整整一帧，而大文件的
    //   bufferToText 解码本身要数百毫秒——期间用户可以关闭查看器并打开另一个文件
    //   （_viewerGen 连增两次），本函数却不知道自己已经过时，照写 viewerTextContent /
    //   viewerError。最坏一条不会自愈：旧文件是二进制 ⇒ 把 viewerError 置成「二进制不支持」，
    //   而新文件是正常文本、其分支只写 error 不清 error ⇒ 新文件直接显示错误页。
    //   故让出后先复查代际，命中即丢弃本次结果（调用点的 gen 复查无法覆盖窗口内部）。
    if (gen != null && gen !== this._viewerGen) return
    if (isImageFile(fileName)) {
      this.viewerImageUrl = bufferToDataUrl(buf, fileName)
      return
    }
    if (isBinaryBuffer(buf)) {
      if (this.getAllowViewEditAllFiles()) {
        this.viewerTextContent = bufferToText(buf).text
        this.showToast(this.i18n.t('viewer.binaryShownAsText'))
      } else {
        this.viewerError = this.i18n.t('viewer.binaryNotSupported')
      }
      return
    }
    // ★ 2026-09-20：全文交给查看器虚拟滚动渲染（不再截断）
    this.viewerTextContent = bufferToText(buf).text
  }

  private async _editLocalFile(entry: LocalEntry | null): Promise<void> {
    if (!this._validateEditEntry(entry, false)) return
    const gen = await this._openEditorShell({
      fileName: entry.name,
      displayPath: entry.fullPath,
      localPath: entry.fullPath,
      isRemote: false,
      // ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 C —— 本地编辑也走稳定路径（local 命名空间），避免同一文件多次编辑换路径
      stableKey: `local::${entry.fullPath}`,
    })
    try {
      // ★ 2026-09-21 P2 修复：补 maxBytes —— _validateEditEntry 只看 listing 里的 size，
      //   listing 为 0 或已过期时（文件刚被写大）会放行超大文件并整份读进内存
      const buf = await readLocalFileToBuffer(entry.fullPath, EDIT_TEXT_MAX_BYTES)
      // ★ 2026-10-13 P1 修复：代际守卫——读取期间用户又打开了别的文件 ⇒ 丢弃过时结果
      if (gen !== this._editorGen) return
      if (isBinaryBuffer(buf)) {
        this.editorError = this.i18n.t('viewer.binaryNotSupported')
      } else {
        // ★ 2026-10-09：记录真实编码（gb18030 文件在 Node 里只能解码不能编码，
        //   必须让保存路径知道「不能按原编码写回」并据此禁用保存，见 _canSaveEditor）
        const decoded = bufferToText(buf)
        const text = decoded.text
        this.editorEncoding = decoded.encoding
        this.editorContent = text
        this.editorOriginalContent = text
      }
    } catch (e) {
      if (gen !== this._editorGen) return
      this.editorError = (e as Error)?.message === 'FILE_TOO_LARGE'
        ? this.i18n.t('editor.tooLarge', { limit: formatBytesLimit(EDIT_TEXT_MAX_BYTES) })
        : this.i18n.t('viewer.loadFailed')
      log.error('Edit local file load failed', e)
    } finally {
      // ★ 2026-10-13 P1 修复：过时代次不得把新编辑器的 loading 置 false / 启错 watch
      if (gen === this._editorGen) {
        this.editorLoading = false
        if (this.editorLocalPath && !this.editorError) this._startEditorFileWatch(this.editorLocalPath)
        this._safeDetect()
      }
    }
  }

  private async _editRemoteFile(entry: SFTPFile | null, session: SFTPSessionLike | null = null): Promise<void> {
    // ★ 2026-10-18 issue #27：会话归属参数化（同 _viewRemoteFile）
    this._editorSession = session ?? this.sftpSession
    if (!this._validateEditEntry(entry, true, this._editorSession)) return
    const size = entry.size ?? 0
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 C —— 稳定路径 key = 连接标识 :: 远程路径；
    //   左栏远程用 _leftHostLabel，右栏用 hostInfo；无标识时退化为仅按远程路径（极低概率跨连接同名路径碰撞）
    const isLeft = session === this._leftSftpSession
    const connLabel = this._getEditorConnectionLabel(isLeft)
    const stableKey = connLabel ? `${connLabel}::${entry.fullPath}` : entry.fullPath
    await this._openEditorShell({
      fileName: entry.name,
      displayPath: entry.fullPath,
      localPath: '',
      isRemote: true,
      remoteSavePath: entry.fullPath,
      remoteSize: size,
      remoteMode: entry.mode,
      session: this._editorSession,
      stableKey,
    })
  }

  /** 编辑器公共校验：条目有效性、文件类型、大小限制 */
  private _validateEditEntry(entry: { name: string; fullPath: string; size?: number; isDirectory?: boolean } | null, isRemote: boolean, session?: SFTPSessionLike | null): boolean {
    if (!entry || entry.isDirectory) return false
    // ★ 2026-10-18 issue #27：按传入会话判定（左栏远程=第二会话）
    if (isRemote && !session) return false
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
    // ★ 2026-10-09：复位编码与提示标记（否则上一文件的 gb18030 会让下一个 UTF-8 文件误判不可保存）
    this.editorEncoding = 'utf-8'
    this._editorEncodingWarned = false
    this.editorLocalPath = ''
    this.showToast(this.i18n.t('editor.tooLarge', { limit }))
    this._safeDetect()
  }

  private async _openEditorShell(opts: {
    fileName: string
    displayPath: string
    localPath: string
    isRemote: boolean
    remoteSavePath?: string
    remoteSize?: number
    remoteMode?: number
    /** ★ 2026-10-18 issue #27：远程编辑会话归属（左栏远程=第二会话；缺省=主会话） */
    session?: SFTPSessionLike | null
    /** ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 C —— 稳定临时路径 key；传入则临时目录按 key 哈希固定，复用同一路径 */
    stableKey?: string
  }): Promise<number> {
    // ★ 2026-10-13 P1 修复：代际守卫入口——每次打开都递增，在途的旧加载结果据此丢弃
    const gen = ++this._editorGen
    // ★ 2026-09-21 P2 修复：先关查看器 —— 从查看器直接点「编辑」时两个 overlay 会同时挂载
    //   叠层；closeViewer 还会递增 _viewerGen，顺带丢弃查看器在途的迟到结果
    if (this.viewerVisible) this.closeViewer()
    this.editorVisible = true
    this.editorLoading = true
    this.editorSaving = false
    this.editorDirty = false
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：打开新文件时复位外部改动标志并清理上一轮的自动上传定时器
    this.editorExternalDirty = false
    if (this._autoUploadTimer) { clearTimeout(this._autoUploadTimer); this._autoUploadTimer = null }
    this.editorError = ''
    this.editorFileName = opts.fileName
    this.editorDisplayPath = opts.displayPath
    this.editorContent = ''
    this.editorOriginalContent = ''
    // ★ 2026-10-09：复位编码与提示标记（否则上一文件的 gb18030 会让下一个 UTF-8 文件误判不可保存）
    this.editorEncoding = 'utf-8'
    this._editorEncodingWarned = false
    this.editorIsRemote = opts.isRemote
    await this._cleanupEditorTemp()
    // ★ 2026-10-13 P1 修复：清理期间可能又有新打开 ⇒ 旧代次就此止步，不再写任何状态
    if (gen !== this._editorGen) return gen

    // ★ 2026-10-18 issue #27：远程下载/基线 stat 全按归属会话路由（左栏远程=第二会话）
    const editSession = opts.session ?? this.sftpSession
    this._editorSession = editSession
    if (opts.isRemote && editSession && opts.remoteSavePath != null) {
      const loadStart = Date.now()
      try {
        const tempPath = await downloadRemoteToTempFile(
          editSession,
          opts.remoteSavePath,
          opts.remoteSize ?? 0,
          opts.remoteMode,
          // ★ 2026-09-21 P1 修复：编辑器会把内容写回远端，大小无法确认时拒绝打开——
          //   否则提前 EOF 的残缺内容一保存就覆盖掉服务器上的完整文件
          // ★ 2026-09-21 P2：maxBytes 按实际 stat 复核，兜住 listing size 谎报/为 0 的情况
          // ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 C —— 透传 stableKey，使同一远程文件复用固定临时路径
          { requireExactSize: true, maxBytes: EDIT_TEXT_MAX_BYTES, stableKey: opts.stableKey },
        )
        // ★ 2026-10-20 全量审计 P2：代际失配时旧实现直接 return，刚下载出来的临时文件
        //   既未登记也未删除 ⇒ 磁盘残留。失配分支先回收再退出。
        if (gen !== this._editorGen) {
          try { await removeTempFile(tempPath) } catch { /* 清理失败不影响后续流程 */ }
          return gen
        }
        this.editorTempPath = tempPath
        this.editorLocalPath = tempPath
        const buf = await fs.readFile(tempPath)
        if (gen !== this._editorGen) return gen
        if (isBinaryBuffer(buf)) {
          this.editorError = this.i18n.t('viewer.binaryNotSupported')
          await this._cleanupEditorTemp()
          this.editorLocalPath = ''
          this._logEditorTransfer('edit-download', opts.remoteSavePath, tempPath, opts.remoteSize ?? 0, false, loadStart, 'error')
        } else {
          // ★ 2026-10-09：同本地路径，记录真实编码（远程 GBK 文件同样不能按原编码写回）
          const decoded = bufferToText(buf)
          const text = decoded.text
          this.editorEncoding = decoded.encoding
          this.editorContent = text
          this.editorOriginalContent = text
          this._logEditorTransfer('edit-download', opts.remoteSavePath, tempPath, opts.remoteSize ?? buf.length, true, loadStart)
        }
        this._editorSavePath = opts.remoteSavePath
        // ★ 2026-08-26 H5：记录打开时远端基线，保存前做冲突检测
        this._editorRemoteBaseline = null
        try {
          const st = await editSession.stat?.(opts.remoteSavePath) as any
          if (gen !== this._editorGen) return gen
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
        // ★ 2026-10-13 P1 修复：过时代的失败不得冲掉新编辑器已装好的状态
        if (gen !== this._editorGen) return gen
        // ★ 2026-09-21：超限与「大小不可确认」给出可辨识的提示，不再一律「加载失败」
        this.editorError = (e as Error)?.message === 'FILE_TOO_LARGE'
          ? this.i18n.t('editor.tooLarge', { limit: formatBytesLimit(EDIT_TEXT_MAX_BYTES) })
          : this.i18n.t('viewer.loadFailed')
        log.error('Edit remote file load failed', e)
        await this._cleanupEditorTemp()
        this.editorLocalPath = ''
        this._editorRemoteBaseline = null
        this._logEditorTransfer('edit-download', opts.remoteSavePath, '', opts.remoteSize ?? 0, false, loadStart, 'error')
      } finally {
        if (gen === this._editorGen) {
          this.editorLoading = false
          if (this.editorLocalPath && !this.editorError) this._startEditorFileWatch(this.editorLocalPath)
          this._safeDetect()
        }
      }
      return gen
    }

    this.editorLocalPath = opts.localPath
    this._editorSavePath = opts.localPath
    this._editorRemoteBaseline = null
    if (this.editorLocalPath) this._startEditorFileWatch(this.editorLocalPath)
    return gen
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
      const w = this._editorFileWatcher
      this._editorFileWatcher = null
      // ★ 2026-10-13 P3 修复：close() 在文件已被删除 / 句柄失效时会抛（ERR_INVALID_ARG_TYPE
      //   等）。本方法是 closeEditor 与 _startEditorFileWatch 的公共第一步，异常会顺着调用链
      //   冒泡到 closeEditor ⇒ 编辑器卡在 loading、关不掉。
      //   注意先置 null 再 close：避免 close 抛错后字段残留、下次重复关。
      try { w.close() } catch (e) { log.warn('Editor file watch close failed:', e) }
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
      // ★ 2026-10-13 P1 修复（显示乱码 / 数据损坏）：原先 readTextFromFile 写死 utf8——
      //   gb18030 文件的字节按 utf8 读出来是乱码 ⇒ editorDirty=true、界面显示 mojibake；
      //   utf-16le 更糟：按 utf8 读出的乱码一旦保存就会用 utf16le 写回、原文件被永久覆盖。
      //   改为读 Buffer 后走与打开路径**同一套** bufferToText 解码（按 BOM/严格 UTF-8/
      //   GB18030 识别真实编码），并同步校正 editorEncoding，保证保存按原编码写回。
      // ★ 2026-10-20 全量审计 P1：读取前必须**快照**当前编辑路径。原实现在 await 之后只
      //   复查「编辑器还开着 && 路径非空」——这两个条件在用户「关掉 A、立刻打开 B」之后
      //   依旧成立 ⇒ A 的内容被写进 B 的编辑器，随后用户一保存就把 A 覆盖到 B 上（数据丢失）。
      const pathAtRead = this.editorLocalPath
      const buf = await fs.readFile(pathAtRead)
      // 外部把文件换成了二进制内容：不同步（保持原展示），与打开路径的判定口径一致
      if (isBinaryBuffer(buf)) return
      const decoded = bufferToText(buf)
      if (decoded.encoding === 'binary') return
      this.zone.run(() => {
        // 同步期间用户又打开了别的文件 ⇒ 丢弃过时结果（按快照路径比对，而非仅判非空）
        if (!this.editorVisible || !this.editorLocalPath) return
        if (this.editorLocalPath !== pathAtRead) {
          log.warn('[editor] disk sync discarded (file switched during read):', pathAtRead)
          return
        }
        this.editorContent = decoded.text
        this.editorEncoding = decoded.encoding
        this.editorDirty = decoded.text !== this.editorOriginalContent
        this._safeDetect()
        // ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 B —— 外部变更已同步进内存但尚未上传，
        //   标记 editorExternalDirty 供编辑器横幅显示「本地已改动，尚未上传 — [立即上传]」（默认即此行为）。
        //   若开启方案 A（外部保存自动上传），安排一次文件稳定后的自动上传。
        if (this.editorDirty) {
          this.editorExternalDirty = true
          this._safeDetect()
          if (this._getEditorAutoUpload()) this._scheduleAutoUpload()
        } else {
          // ★ 2026-10-23（Deepseek-V4.1-Flash）：外部把内容改回与打开时一致 ⇒ 没有待上传内容，
          //   边框/按钮高亮必须跟着熄灭（否则「高亮着但保存键是灰的」无法解释）。
          this.editorExternalDirty = false
          this._safeDetect()
        }
      })
    } catch { /* 文件可能正被外部编辑器占用，稍后重试 */ }
  }

  /**
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 A —— 外部编辑保存后，延迟到文件「稳定」（size/mtime 不再变化）
   *   再自动上传。避免外部编辑器边写边触发、或在写入未完成时上传半份内容；同时天然合流多次连续保存。
   */
  private _scheduleAutoUpload(): void {
    if (this._autoUploadTimer) clearTimeout(this._autoUploadTimer)
    this._autoUploadTimer = setTimeout(() => {
      this._autoUploadTimer = null
      void this._tryAutoUpload()
    }, 1000)
  }

  private async _tryAutoUpload(): Promise<void> {
    if (!this.editorVisible || !this.editorExternalDirty || this.editorSaving || !this.editorLocalPath) return
    // ★ 稳定性检查：间隔 800ms 两次 stat，size/mtime 一致才认为外部编辑器已写完
    try {
      const a = await fs.stat(this.editorLocalPath)
      await new Promise<void>(r => setTimeout(r, 800))
      const b = await fs.stat(this.editorLocalPath)
      if (a.size !== b.size || a.mtimeMs !== b.mtimeMs) {
        this._scheduleAutoUpload()
        return
      }
    } catch {
      return
    }
    await this.saveEditor({ fromAutoUpload: true })
  }

  openViewerInSystem(): void {
    if (!this.viewerSystemPath) return
    this._openPathInSystem(this.viewerSystemPath)
  }

  openEditorInSystem(): void {
    if (!this.editorLocalPath) return
    this._openPathInSystem(this.editorLocalPath)
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：查看器底栏「在系统中编辑」。
   *   ① 把当前查看器**就地换成面板内编辑器**（同一文件，可继续改）；
   *   ② 再用系统默认程序打开编辑器那份本地副本（这才符合“在系统中编辑”的字面语义）。
   *
   *   ⛔ 顺序不能反：`_editRemoteFile` / `_editLocalFile` 会先把内容准备到 `editorLocalPath`
   *     （远程是下载到临时文件），就绪后才能 `shell.openPath`。
   *   ⛔ 本地 / 远程分别走各自入口（远程要按 `viewerSession` 归属会话，见 issue #27）。
   *   ⛔ 这里不自己 closeViewer：`_openEditorShell` 首行已处理，重复关会多递增一次 viewerGen。
   */
  async openViewerInSystemEdit(): Promise<void> {
    const entry = this._viewerEntry
    if (!entry) return
    const session = this.viewerSession
    if (session) {
      await this._editRemoteFile(entry as SFTPFile, session)
    } else {
      await this._editLocalFile(entry as LocalEntry)
    }
    if (this.editorVisible && this.editorLocalPath && !this.editorError) {
      this.openEditorInSystem()
    }
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

  /** 远程文件下载到临时目录后用系统默认程序打开（★ 2026-10-18：session 归属参数化，左栏远程=第二会话） */
  protected async _openRemoteInSystem(entry: SFTPFile, session: SFTPSessionLike | null = null): Promise<void> {
    const sftp = session ?? this.sftpSession
    if (!entry || entry.isDirectory || !sftp) return
    try {
      this.showToast(this.i18n.t('viewer.loading'))
      const localPath = await downloadRemoteToTempFile(
        sftp,
        entry.fullPath,
        entry.size ?? 0,
        entry.mode,
      )
      // ★ 2026-09-21 P2：登记临时文件，面板销毁时统一清理（此前无任何清理路径，逐次泄漏）
      this._systemOpenTempFiles.push(localPath)
      this._openPathInSystem(localPath)
    } catch (e) {
      this.showToast(this.i18n.t('viewer.loadFailed'))
      log.error('Open remote in system failed', e)
    }
  }

  /** ★ 2026-09-21 P2：清理「系统中打开」产生的临时文件（best-effort：文件仍被占用时跳过） */
  protected async _cleanupSystemOpenTempFiles(): Promise<void> {
    const list = this._systemOpenTempFiles.splice(0)
    for (const p of list) {
      try { await removeTempFile(p) } catch { /* ignore */ }
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
    // ★ 2026-10-18 issue #27：导航重查时的列表来源与查看函数选择依据
    this._viewerNavPane = pane
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
    // ★ 2026-10-18 issue #27：左栏远程查看的图片导航——列表取自本地面板，但查看走第二会话
    if (this._viewerNavPane === 'local') {
      if (this.viewerSession) await this._viewRemoteFile(entry as unknown as SFTPFile, this.viewerSession)
      else await this._viewLocalFile(entry as LocalEntry)
    } else {
      await this._viewRemoteFile(entry as SFTPFile, this.viewerSession)
    }
  }

  onEditorContentChange(value: string): void {
    this.editorContent = value
    const dirty = value !== this.editorOriginalContent
    if (dirty === this.editorDirty) return
    this.editorDirty = dirty
    // ★ 2026-10-23：手动改回原样 ⇒ 同样没有待上传内容，撤掉边框/按钮高亮
    if (!dirty) this.editorExternalDirty = false
  }

  /**
   * ★ 2026-10-09 新增：当前文件是否允许保存（编码可无损往返）。
   *
   * Node 运行时**只有 gb18030 解码器、没有编码器**（实测 Buffer.from(text,'gb18030')
   * 抛 "Unknown encoding"；TextEncoder 按 WHATWG 规范只支持 utf-8）。
   * 因此 GBK / GB18030 文件虽然能在内置编辑器里**正确显示**中文（已改为真实解码），
   * 却无法按**原编码**写回 —— 强行按 UTF-8 保存会把用户的 GBK 文件改成 UTF-8，
   * 依赖原编码的软件（老旧 Windows 工具、部分国产软件、GBK 编码的构建脚本）全部失效。
   *
   * 权衡后选择「**禁用保存 + 明确提示**」而不是「悄悄改编码」：
   *   · 悄悄改编码 = 破坏用户的文件（且用户毫无察觉），不可接受；
   *   · 引入 iconv-lite 依赖可支持写回，但那会新增运行时依赖，
   *     且 GB18030 有 4 字节扩展区，往返并非 100% 无损，属另一项产品决策。
   * 详见 file-utils.bufferToText / canRoundTripSafely 的注释。
   */
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：查看器底栏「在系统中编辑」是否显示。
   *   只看文本模式 + 无错误 + 该类型可编辑 + 有当前条目（`_viewerEntry`）。
   *   ⛔ 图片/二进制不显示：切编辑器没有意义（`_validateEditEntry` 也会拒）。
   */
  get viewerShowEditInSystem(): boolean {
    return this.viewerVisible
      && this.viewerMode === 'text'
      && !this.viewerError
      && !!this._viewerEntry
      && this.isFileNameEditable(this.viewerFileName)
  }

  get canSaveEditor(): boolean {
    return canRoundTripSafely(this.editorEncoding)
  }

  private _warnEncodingNotSaveable(): void {
    if (this._editorEncodingWarned) return
    this._editorEncodingWarned = true
    try {
      this.showToast(this.i18n.t('editor.encodingNotEditable'))
    } catch { /* 提示失败不阻塞 */ }
  }

  async saveEditor(opts?: { fromAutoUpload?: boolean }): Promise<void> {
    if (!this.editorVisible || this.editorSaving || !this.editorLocalPath) return
    // ★ 2026-10-09：编码守卫 —— 不可无损往返时**拒写**，绝不用 UTF-8 覆盖 GBK 文件
    if (!this.canSaveEditor) {
      this._warnEncodingNotSaveable()
      return
    }
    this.editorSaving = true
    try {
      if (this.editorDirty) {
        // 按文件原本的编码写回（目前只会是 utf-8 / utf-16le，两者 Node 均可无损往返）
        await writeTextToFile(
          this.editorLocalPath,
          this.editorContent,
          this.editorEncoding === 'utf-16le' ? 'utf16le' : 'utf8',
        )
      } else {
        // 可能仅在外部编辑器中修改：从磁盘读取最新内容再上传
        try {
          // ★ 2026-10-13 P1 修复：与 _syncEditorFromDisk 同源——读 Buffer 走 bufferToText
          //   按真实编码解码并校正 editorEncoding，不再写死 utf8（gb18030/utf-16le 会出乱码，
          //   而保存分支按 editorEncoding 选编码，读错就会写错）
          const buf = await fs.readFile(this.editorLocalPath)
          if (!isBinaryBuffer(buf)) {
            const decoded = bufferToText(buf)
            if (decoded.encoding !== 'binary') {
              this.editorContent = decoded.text
              this.editorEncoding = decoded.encoding
            }
          }
        } catch { /* 使用当前内存内容 */ }
      }
      if (this.editorIsRemote) {
        // ★ 2026-10-18 issue #27：保存回传按打开时的归属会话路由（左栏远程=第二会话）
        if (!this._editorSession || !this._editorSavePath) {
          this.showToast(this.i18n.t('editor.saveFailed'))
          return
        }
        // ★ 2026-08-26 H5：保存前比对远端 mtime/size，变更则提示确认覆盖
        if (this._editorRemoteBaseline) {
          try {
            const st = await this._editorSession.stat?.(this._editorSavePath) as any
            if (st) {
              const mtimeMs = st.modified instanceof Date
                ? st.modified.getTime()
                : (typeof st.mtime === 'number' ? (st.mtime < 1e12 ? st.mtime * 1000 : st.mtime) : 0)
              const size = Number(st.size) || 0
              const changed =
                (this._editorRemoteBaseline.mtimeMs > 0 && mtimeMs > 0 && mtimeMs !== this._editorRemoteBaseline.mtimeMs) ||
                (size > 0 && this._editorRemoteBaseline.size > 0 && size !== this._editorRemoteBaseline.size)
              if (changed) {
                // ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 A 自动上传遇远端冲突时，不弹阻塞 confirm、
                //   也不静默覆盖，降级为方案 B 提示（保留 editorExternalDirty 横幅）。手动保存仍走确认框。
                if (opts?.fromAutoUpload) {
                  this.editorExternalDirty = true
                  this._safeDetect()
                  return
                }
                // ★ 2026-10-26（Deepseek-V4.1-Flash）：面板内确认框替代 window.confirm ——
                //   原生对话框取消后 Electron(Win) 焦点链不归还，编辑器还在却点不动任何控件。
                //   await 后按代际快照复核：确认期间可能已换文件/已关编辑器，不能再往旧目标上传。
                const gen = this._editorGen
                const savePath = this._editorSavePath
                const ok = await this.askConfirm(
                  this.i18n.t('editor.remoteChanged')
                    || '远程文件已被修改。确定要覆盖服务器上的版本吗？',
                )
                if (!ok) return
                if (this._editorGen !== gen || this._editorSavePath !== savePath) return
              }
            }
          } catch { /* stat 失败则继续尝试上传 */ }
        }
        const uploaded = await this._doUpload(this._editorSavePath, this.editorLocalPath, 'edit-upload', this._editorSession)
        // ★ 2026-08-26 C5：必须检查上传结果，失败时保留 dirty 与编辑器
        if (!uploaded) {
          this.showToast(this.i18n.t('editor.saveFailed'))
          try { this.notifications?.error?.(this.i18n.t('editor.saveFailed'), '') } catch {}
          return
        }
        // ★ 2026-10-18 issue #27：左栏远程编辑保存后刷新左栏（其条目在本地面板列表）
        if (this._editorSession !== this.sftpSession) void this.refreshLocal()
        else void this.refreshRemote()
        // 刷新基线
        try {
          const st = await this._editorSession.stat?.(this._editorSavePath) as any
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
      // ★ 2026-10-22（Deepseek-V4.1-Flash）：上传成功后清除外部改动标志，方案 B 横幅随之消失
      this.editorExternalDirty = false

      if (opts?.fromAutoUpload) {
        // ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 A 自动上传成功后【不关闭】编辑器，
        //   保持打开并继续监听外部变更——VS Code 自动保存场景下，下一次外部保存仍能可靠触发自动上传，
        //   形成持续同步闭环。仅复位标志、不弹 toast（避免每次自动保存刷屏）；`editorLocalPath`
        //   与文件 watch 均保留，故外部再次保存时 `_syncEditorFromDisk` 仍能命中并重新调度上传。
        this.editorSaving = false
        this._safeDetect()
        return
      }

      // ★ 修复：本地编辑保存提示"已保存"，远程才提示"已保存到服务器"
      this.showToast(this.editorIsRemote ? this.i18n.t('editor.saveSuccess') : (this.i18n.t('editor.saveSuccessLocal') || '已保存'))
      this.editorSaving = false
      // ★ 2026-10-23（Deepseek-V4.1-Flash）：手动保存成功后**不再自动关闭编辑器**（用户要求）。
      //   保存只是「把本地副本推上去」，用户通常还要继续改/对照；关掉会打断节奏、
      //   也让「外部编辑 → 保存 → 再看」来回找文件。
      //   保持打开的前提已经满足：editorOriginalContent 已同步成当前内容、dirty=false（保存键自动置灰）、
      //   文件 watch 与 editorLocalPath/editorTempPath 都还在 ⇒ 继续编辑与再次保存都正常。
      //   ⛔ 别在这里加 closeEditor：关闭只能由用户点「取消 / 关闭」或 Esc 触发。
      this._safeDetect()
    } catch (e) {
      const msg = this.i18n.t('editor.saveFailed')
      try { this.notifications?.error?.(msg, '') } catch {}
      log.error('Editor save failed', e)
    } finally {
      this.editorSaving = false
      this._safeDetect()
    }
  }

  async closeEditor(confirmIfDirty = true): Promise<void> {
    if (this.editorSaving) return
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：关闭编辑器时清理自动上传定时器，避免迟到回调对已关闭会话上传
    if (this._autoUploadTimer) { clearTimeout(this._autoUploadTimer); this._autoUploadTimer = null }
    if (confirmIfDirty && this.editorDirty) {
      // ★ 2026-10-26（Deepseek-V4.1-Flash）：「未保存」提示改用面板内确认框 —— 原生 confirm 点
      //   「取消」后 Electron(Win) 焦点链不归还，编辑器还开着但内容区/按钮全点不动。
      const gen = this._editorGen
      if (!(await this.askConfirm(this.i18n.t('editor.unsaved')))) return
      // ★ 异步后按快照复核（不按「还可见/dirty」判）：确认期间可能已换文件、已保存关闭、
      //   或重新打开了另一个文件——那种情况下不能再拿旧意图把它关掉。
      if (this._editorGen !== gen || !this.editorVisible) return
    }
    // ★ 2026-10-13 P1 修复：递增代际——关闭时在途的加载结果全部作废，
    //   避免迟到回调往已关闭的编辑器写状态、或在错误路径上启 watch
    this._editorGen++
    this._stopEditorFileWatch()
    if (this.editorIsRemote) void this._cleanupEditorTemp()
    this.editorVisible = false
    this.editorLoading = false
    this.editorDirty = false
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：关闭时复位外部改动标志，方案 B 横幅随编辑器一同消失
    this.editorExternalDirty = false
    this.editorContent = ''
    this.editorOriginalContent = ''
    // ★ 2026-10-09：复位编码与提示标记（否则上一文件的 gb18030 会让下一个 UTF-8 文件误判不可保存）
    this.editorEncoding = 'utf-8'
    this._editorEncodingWarned = false
    this.editorLocalPath = ''
    this.editorError = ''
    this._editorSavePath = ''
    this._editorRemoteBaseline = null
    this._editorSession = null
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

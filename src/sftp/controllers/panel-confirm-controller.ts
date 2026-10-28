/**
 * SFTP+ 面板内二次确认（Promise 版）
 * 功能描述：把「消息 + 确定/取消」做成面板内模态框（`sftp-confirm-dialog`），
 *   调用方 `await this.askConfirm(msg)` 即可拿到布尔结果，语义与 `window.confirm()` 一致，
 *   但**不阻塞渲染进程、不破坏 Electron 的焦点链**（见 confirm 组件头部注释）。
 *
 * 为什么单独抽一个基类：面板的控制器是继承链
 *   `SftpFloatingPanel → SftpPanelBookmarkController → SftpPanelViewerController → SftpPanelColumnController`
 * 而确认动作的调用点分散在面板主体（清除传输记录、关闭面板）与查看器控制器（未保存关闭、
 * 远端已变更覆盖）里。放在链尾基类上，两边都能直接 `this.askConfirm()`，不必各自持一份 UI 状态。
 *
 * ⛔ 面板内**禁止**再用 `window.confirm()` / `window.alert()`：取消后焦点链已坏，
 *   用户接着点下拉框/输入框会「没有任何反应」，只能切窗口或开关 devtools 才恢复。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-26
 */
export abstract class SftpPanelConfirmController {
  /** 由宿主组件实现（面板里是 ChangeDetectorRef.markForCheck + NgZone 兜底） */
  protected abstract _safeDetect(): void

  /** 确认框是否可见（模板绑定 / 模态判定 / Esc 栈共用） */
  confirmDialogVisible = false
  /** 标题（空 = 不渲染标题行） */
  confirmDialogTitle = ''
  /** 正文消息 */
  confirmDialogMessage = ''
  /** 确定键文案（空 = 用 app.confirm） */
  confirmDialogConfirmLabel = ''

  private _confirmResolve: ((ok: boolean) => void) | null = null
  /** 宿主已销毁：之后的 askConfirm 直接按「取消」返回，避免往已销毁的视图写状态 */
  private _confirmDisposed = false

  /**
   * 弹出二次确认，等待用户选择。
   * @returns true = 用户点了确定；false = 点了取消 / 按 Esc / 被新的确认顶掉 / 宿主已销毁
   *
   * ⛔ 调用方在 `await` 之后必须**重新校验自己的前置条件**（被确认框挡住的这段时间里，
   *    传输队列、当前连接、编辑器内容都可能已经变了）——见本文件末尾说明。
   */
  askConfirm(message: string, opts?: { title?: string; confirmLabel?: string }): Promise<boolean> {
    if (this._confirmDisposed) return Promise.resolve(false)
    // 同一时刻只允许一个确认框：新的顶掉旧的（旧调用方按「取消」收尾，不会永久挂住）
    this._resolveConfirm(false)
    this.confirmDialogTitle = opts?.title || ''
    this.confirmDialogMessage = message || ''
    this.confirmDialogConfirmLabel = opts?.confirmLabel || ''
    this.confirmDialogVisible = true
    this._safeDetect()
    return new Promise<boolean>(resolve => { this._confirmResolve = resolve })
  }

  /** 模板回调（确定 / 取消按钮） */
  onConfirmDialogResult(ok: boolean): void {
    if (!this.confirmDialogVisible && !this._confirmResolve) return
    // 先关框再结 Promise：调用方的后续代码里可能立刻打开另一个弹层，避免两层叠着闪一下
    this.confirmDialogVisible = false
    this._safeDetect()
    this._resolveConfirm(ok)
  }

  /**
   * 宿主销毁时调用：把未决的 Promise 以「取消」结掉。
   * ⛔ 不结会怎样：`await this.askConfirm()` 的后续代码永不执行，若其中还有 `finally`
   *   里的清理（复位 busy 标志、释放会话），面板销毁后这些状态就永远停在「进行中」。
   */
  disposeConfirmDialog(): void {
    this._confirmDisposed = true
    this.confirmDialogVisible = false
    this._resolveConfirm(false)
  }

  private _resolveConfirm(ok: boolean): void {
    const resolve = this._confirmResolve
    this._confirmResolve = null
    if (resolve) resolve(ok)
  }
}

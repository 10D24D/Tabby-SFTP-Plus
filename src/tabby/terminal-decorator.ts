/**
 * 终端装饰器
 * 功能描述：在终端工具栏注入 SFTP+ 按钮，点击弹出浮动面板
 *   完全参照 tabby-sftp-ui-next 的已验证实现模式
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25
 */
import { Injectable, Injector, ComponentFactoryResolver, ApplicationRef, NgZone, Optional } from '@angular/core'
import { TerminalDecorator } from 'tabby-terminal'
import { NotificationsService, ConfigService, AppService, HotkeysService } from 'tabby-core'
import { SftpFloatingPanel } from '../sftp/sftp-floating-panel.component'
import { SftpWorkspaceTabComponent } from '../sftp/sftp-workspace-tab.component'
import { SFTP_PLUS_TOGGLE_HOTKEY } from './hotkey-provider'
import { isHotkeyRecordingActive } from './hotkey-util'
import { SftpConfigService } from '../services/sftp-config.service'

import { log } from '../services/sftp-logger'
/** SVG 文件夹图标 */
const FOLDER_SVG = '<svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor" style="vertical-align:middle"><path d="M120 344h291.6l112-112H736v224h56V176H500.4l-112 112H64v560l56-130.6z"/><path d="M792 456H232L120 717.4 64 848h728l168-392z"/></svg>'

@Injectable()
export class SftpTerminalDecorator extends TerminalDecorator {
  private _hideStyleEl: HTMLStyleElement | null = null
  private _hideObserver: MutationObserver | null = null
  private _hideNativeTimer: any = null
  private static _hotkeySubscribed = false
  private sftpConfig: SftpConfigService | null = null
  /** 全局"resize 期间禁用过渡"样式是否已注入（一次性） */
  private static _noTransitionStyleInjected = false

  constructor(
    private notifications: NotificationsService,
    private resolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private zone: NgZone,
    private injector: Injector,
    private app: AppService,
    @Optional() private config?: ConfigService,
  ) {
    super()
    try { this.sftpConfig = this.injector.get(SftpConfigService, null as any) } catch { this.sftpConfig = null }
    log.info('Decorator ready')
    this._applyNativeBtnHideRule()
    this._subscribeHotkeys()
  }

  private _subscribeHotkeys(): void {
    // TerminalDecorator 可能被多实例创建，热键只订阅一次
    if (SftpTerminalDecorator._hotkeySubscribed) return
    let hotkeys: HotkeysService | null = null
    try {
      hotkeys = this.injector.get(HotkeysService as any, null) as HotkeysService | null
    } catch {
      hotkeys = null
    }
    // 优先 unfilteredHotkey$：终端焦点下也可能有隐藏 input，避免被 hotkey$ 过滤掉
    const stream = hotkeys?.unfilteredHotkey$ || hotkeys?.hotkey$
    if (!stream?.subscribe) {
      log.warn('HotkeysService unavailable, panel hotkey disabled')
      return
    }
    SftpTerminalDecorator._hotkeySubscribed = true
    try {
      stream.subscribe((id: string) => {
        if (id !== SFTP_PLUS_TOGGLE_HOTKEY) return
        // 设置页录制中：忽略，避免旧热键触发面板导致录制卡死
        if (isHotkeyRecordingActive()) return
        log.info('Panel hotkey triggered')
        this.zone.run(() => this.togglePanelForActiveTerminal())
      })
      log.info('Panel hotkey subscribed')
    } catch (e) {
      SftpTerminalDecorator._hotkeySubscribed = false
      log.warn('Hotkey subscribe failed', e)
    }
  }

  /** 快捷键：切换当前 SSH 标签的 SFTP+ 面板 */
  togglePanelForActiveTerminal(): void {
    const terminal = this._getActiveSshTerminal()
    if (!terminal) {
      this.notifications.error('SFTP+', 'No active SSH session')
      return
    }

    const hostEl = this._resolveHostEl(terminal)
    if (!hostEl) {
      this.notifications.error('SFTP+', 'Cannot find terminal element')
      return
    }

    if (this._openInNewTabByDefault()) {
      this.openWorkspaceTab(terminal)
      return
    }

    if ((hostEl as any).__sftpPlusOpen && (hostEl as any).__sftpPlusMinimized) {
      this.restoreFloatingPanel(hostEl)
      return
    }
    if ((hostEl as any).__sftpPlusOpen) {
      this.closeFloatingPanel(hostEl)
      return
    }
    this.openFloatingPanel(terminal)
  }

  private _isSshTerminal(tab: any): boolean {
    if (!tab) return false
    if (tab.sshSession || tab._sshSession) return true
    const profile = tab.profile ?? tab._profile ?? null
    if (!profile) return false
    if (profile.type === 'ssh') return true
    if (profile.options?.host) return true
    return false
  }

  private _collectLeafTabs(): any[] {
    const out: any[] = []
    const visit = (tab: any): void => {
      if (!tab) return
      if (tab.root?.getAllTabs) {
        for (const child of tab.root.getAllTabs()) visit(child)
        return
      }
      if (typeof tab.getAllTabs === 'function') {
        for (const child of tab.getAllTabs()) visit(child)
        return
      }
      out.push(tab)
    }
    for (const top of this.app.tabs || []) visit(top)
    return out
  }

  private _getActiveSshTerminal(): any | null {
    try {
      const leaves = this._collectLeafTabs()
      // 1) 当前有焦点的 SSH 标签
      const focused = leaves.find(t => t?.hasFocus && this._isSshTerminal(t))
      if (focused?.element?.nativeElement) return focused

      // 2) activeTab / SplitTab 聚焦子标签
      let tab: any = this.app.activeTab
      if (!tab) return null
      if (typeof tab.getFocusedTab === 'function') {
        tab = tab.getFocusedTab() ?? tab
      }
      if (tab?.root && typeof tab.getFocusedTab === 'function') {
        tab = tab.getFocusedTab() ?? tab
      }
      if (this._isSshTerminal(tab) && tab?.element?.nativeElement) return tab

      // 3) 回退：任意已挂载 DOM 的 SSH 标签（单标签场景）
      const anySsh = leaves.find(t => this._isSshTerminal(t) && t?.element?.nativeElement)
      return anySsh || null
    } catch {
      return null
    }
  }

  private closeFloatingPanel(hostEl: HTMLElement): void {
    const cmpRef = (hostEl as any).__sftpPlusCmpRef
    // 优先走组件的 close()：内部带"传输进行中"确认框，与右上角 ✕ 行为一致。
    // 用户在确认框点取消时 close() 直接 return，面板保留、传输不中断；
    // 确认后 close() 会 clearTransfers + saveCurrentPath + disconnect 再回调 onClose 销毁。
    const closeFn = cmpRef?.instance?.close
    if (typeof closeFn === 'function') {
      try {
        this.zone.run(() => cmpRef.instance.close())
        return
      } catch { /* 回退到 onClose/destroy */ }
    }
    const onClose = cmpRef?.instance?.onClose
    if (typeof onClose === 'function') {
      onClose()
      return
    }
    try { cmpRef?.destroy() } catch { /* ignore */ }
    try { (hostEl as any).__sftpPlusOverlay?.remove() } catch { /* ignore */ }
    try { delete (hostEl as any).__sftpPlusOpen } catch { /* ignore */ }
    try { delete (hostEl as any).__sftpPlusMinimized } catch { /* ignore */ }
    try { delete (hostEl as any).__sftpPlusOverlay } catch { /* ignore */ }
    try { delete (hostEl as any).__sftpPlusCmpRef } catch { /* ignore */ }
  }

  override attach(terminal: any): void {
    super.attach(terminal)
    log.info('attach called')

    // Best-effort DOM injection: place button near the existing Reconnect button if present.
    /** 查找终端工具栏容器 */
    const findToolbar = (): HTMLElement | null => {
      try {
        const host = terminal.element?.nativeElement ?? null
        if (!host) return null
        const toolbar =
          host.querySelector('.terminal-toolbar') ??
          host.querySelector('terminal-toolbar') ??
          host.querySelector('.btn-toolbar')
        return (toolbar as HTMLElement) ?? host
      } catch { return null }
    }

    const tryInsert = (): boolean => {
      try {
        // 仅 SSH 连接的 tab 显示 SFTP+ 按钮（检查 profile 而非 session 状态，避免断开后消失）
        const profile = terminal?.profile ?? (terminal as any)?._profile ?? null
        const isSSH = !!(profile?.options?.host) || profile?.type === 'ssh'
        if (!isSSH) return false

        const container = findToolbar()
        if (!container) return false

        // Already injected?
        if (container.querySelector('[data-tabby-sftp-plus-button="1"]')) {
          return true
        }

        const btn = document.createElement('button')
        btn.type = 'button'
        // Match Tabby's terminal toolbar buttons styling
        btn.className = 'btn btn-sm btn-link me-2'
        btn.setAttribute('data-tabby-sftp-plus-button', '1')
        btn.title = 'SFTP+'
        btn.innerHTML = FOLDER_SVG + ' SFTP+'
        btn.style.pointerEvents = 'auto'
        btn.style.zIndex = '10'
        btn.style.position = 'relative'

        btn.addEventListener('mousedown', (ev: MouseEvent) => {
          ev.stopPropagation()
        })
        btn.addEventListener('click', (ev: MouseEvent) => {
          ev.preventDefault()
          ev.stopPropagation()
          // 验证 SSH 会话是否仍处于连接状态
          const ssh = terminal?.sshSession ?? (terminal as any)?._sshSession ?? terminal?._session ?? null
          if (!ssh) {
            this.notifications.error('SFTP+', 'SSH 连接已断开，请先重新连接终端')
            return
          }
          if (ssh.closed$ && typeof ssh.closed$.subscribe === 'function' && ssh.open === false) {
            this.notifications.error('SFTP+', 'SSH 连接已断开，请先重新连接终端')
            return
          }
          // SSH 正常连接中，确保按钮恢复可用状态（处理 reconnect 后 _session 已恢复但按钮仍 disabled 的场景）
          if (btn.disabled) {
            btn.disabled = false
            btn.style.opacity = ''
            btn.style.cursor = ''
            btn.title = 'SFTP+'
          }
          if (this._openInNewTabByDefault()) {
            this.openWorkspaceTab(terminal)
          } else {
            this.openFloatingPanel(terminal)
          }
        })

        // If there's a Reconnect button, insert next to it.
        const allButtons = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[]
        const reconnectButton = allButtons.find(b => {
          const t = `${b.textContent ?? ''} ${b.title ?? ''} ${b.getAttribute('aria-label') ?? ''}`.toLowerCase()
          return t.includes('reconnect') || t.includes('переподключ')
        })

        if (reconnectButton?.parentElement) {
          reconnectButton.parentElement.insertBefore(btn, reconnectButton.nextSibling)
        } else {
          container.appendChild(btn)
        }

        log.info('Button injected into', container.className || container.tagName)

        // 工具栏重建后补一次隐藏（不依赖全局 Observer）
        if (this._shouldHideNativeBtn()) {
          this._hideNativeBtnsOnce(container)
          // 延迟二次隐藏：原生 SFTP 按钮可能在 SFTP+ 注入之后才被其插件创建，
          // 一次扫描会漏掉 → 稍后补扫一次（防偶发漏隐藏）
          this._scheduleHideNativeBtns(container)
        }

        // 监听 SSH 会话断开事件：断开后禁用 SFTP+ 入口按钮
        try {
          const ssh = terminal?.sshSession ?? (terminal as any)?._sshSession ?? terminal?._session ?? null
          if (ssh) {
            // 方法1：使用 RxJS Observable (BaseSession.closed$)
            if (ssh.closed$ && typeof ssh.closed$.subscribe === 'function') {
              const sub = ssh.closed$.subscribe(() => {
                btn.disabled = true
                btn.style.opacity = '0.4'
                btn.style.cursor = 'not-allowed'
                btn.title = 'SFTP+ (SSH disconnected)'
                log.info('SSH disconnected, SFTP+ button disabled')
              })
              // 在 terminal 销毁时自动清理订阅
              this.subscribeUntilDetached(terminal, { unsubscribe: () => { try { sub.unsubscribe() } catch {} } })
            }
            // 方法2（回退）：某些 Tabby 版本可能暴露 .closed 为 Promise
            else if (typeof ssh.closed?.then === 'function') {
              (ssh.closed as Promise<void>).then(() => {
                btn.disabled = true
                btn.style.opacity = '0.4'
                btn.style.cursor = 'not-allowed'
                btn.title = 'SFTP+ (SSH disconnected)'
                log.info('SSH disconnected, SFTP+ button disabled')
              }).catch(() => {})
            }
          }
        } catch { /* ignore */ }

        return true
      } catch (err) {
        log.warn('tryInsert error', err)
        return false
      }
    }

    // try a few times while the view is settling and SSH session establishes
    let attempts = 0
    let btnInjected = false
    const timer = setInterval(() => {
      attempts++
      if (tryInsert()) {
        btnInjected = true
        clearInterval(timer)
        // 注入成功后，监听工具栏 DOM 变化：按钮被移除时自动重新注入（如 reconnect 重建工具栏）
        const container = findToolbar()
        if (container) {
          const obs = new MutationObserver(() => {
            if (!container.querySelector('[data-tabby-sftp-plus-button="1"]')) {
              log.info('Button removed from toolbar, re-injecting...')
              tryInsert()
            }
            // 工具栏 DOM 变化（如 reconnect / 焦点切换重建）可能重新创建原生 SFTP 按钮
            // → 防抖后补扫一次隐藏（仅观察单个工具栏，不挂 document.body，避免卡死）
            if (this._shouldHideNativeBtn()) {
              this._scheduleHideNativeBtns(container)
            }
          })
          obs.observe(container, { childList: true, subtree: true })
          this.subscribeUntilDetached(terminal, { unsubscribe: () => obs.disconnect() })
        }
        return
      }
      if (attempts > 20) {
        clearInterval(timer)
        log.info('No SSH session found on this tab after 20 attempts, hiding SFTP+ button')
      }
    }, 500)

    this.subscribeUntilDetached(terminal, { unsubscribe: () => clearInterval(timer) })

    // 监听设置变更 → 重新应用隐藏规则
    const handler = () => this._applyNativeBtnHideRule()
    window.addEventListener('sftp-plus-settings-changed', handler)
    this.subscribeUntilDetached(terminal, { unsubscribe: () => window.removeEventListener('sftp-plus-settings-changed', handler) })
  }

  /**
   * ★ 2026-08-10 修复 #5：终端销毁（关闭 tab / 断开重连）时必须同步销毁挂在
   *   document.body 上的浮动面板，否则 overlay/rAF 同步循环/resize 监听泄漏，
   *   面板残留在页面上且组件生命周期不再受控。
   */
  override detach(terminal: any): void {
    try {
      const hostEl = this._resolveHostEl(terminal)
      const cmpRef = hostEl ? (hostEl as any).__sftpPlusCmpRef : null
      if (hostEl && cmpRef) {
        this.zone.run(() => {
          try { (hostEl as any).__sftpPlusStopRectSync?.() } catch { /* ignore */ }
          try { delete (hostEl as any).__sftpPlusStopRectSync } catch { /* ignore */ }
          try { (hostEl as any).__sftpPlusResizeCleanup?.() } catch { /* ignore */ }
          try { delete (hostEl as any).__sftpPlusResizeCleanup } catch { /* ignore */ }
          try { cmpRef.destroy() } catch { /* ignore */ }
          try { (hostEl as any).__sftpPlusOverlay?.remove() } catch { /* ignore */ }
          try { delete (hostEl as any).__sftpPlusOpen } catch { /* ignore */ }
          try { delete (hostEl as any).__sftpPlusMinimized } catch { /* ignore */ }
          try { delete (hostEl as any).__sftpPlusOverlay } catch { /* ignore */ }
          try { delete (hostEl as any).__sftpPlusCmpRef } catch { /* ignore */ }
        })
        log.info('Panel destroyed on terminal detach')
      }
    } catch (e) {
      log.warn('detach cleanup failed', e)
    }
    super.detach(terminal)
  }

  private _openInNewTabByDefault(): boolean {
    return this._readBoolConfig('openInNewTabByDefault', 'sftp-plus-settings.openInNewTabByDefault', false)
  }

  private _singleWorkspaceInstance(): boolean {
    return this._readBoolConfig('singleWorkspaceInstance', 'sftp-plus-settings.singleWorkspaceInstance', true)
  }

  private _readBoolConfig(cfgKey: string, lsKey: string, fallback: boolean): boolean {
    // 优先走统一配置服务（新嵌套路径）
    const newPath = this._mapCfgToNewPath(cfgKey)
    if (newPath && this.sftpConfig) {
      const val = this.sftpConfig.get(newPath)
      if (typeof val === 'boolean') return val
    }
    // 回退：从 config 根级读旧 key
    let fromConfig = false
    let value = fallback
    if (this.config?.store) {
      try {
        const cfgVal = this.config.store['tabby-sftp-plus']?.[cfgKey]
        if (cfgVal !== undefined) {
          value = !!cfgVal
          fromConfig = true
        }
      } catch {}
    }
    if (!fromConfig) {
      try {
        const raw = localStorage.getItem(lsKey)
        if (raw !== null) value = JSON.parse(raw)
      } catch {}
    }
    return value
  }

  /** 映射 config 旧 key → SftpConfigService 新路径 */
  private _mapCfgToNewPath(cfgKey: string): string | null {
    const map: Record<string, string> = {
      openInNewTabByDefault: 'ui/openInNewTabByDefault',
      singleWorkspaceInstance: 'ui/singleWorkspaceInstance',
      hideNativeSFTPButton: 'ui/hideNativeSFTPButton',
    }
    return map[cfgKey] || null
  }

  /**
   * 读取配置，注入/移除隐藏原生 SFTP 按钮的 CSS 规则
   * 读取配置，注入/移除隐藏原生 SFTP 按钮的 CSS 规则
   *
   * 注意：不要对 document.body 挂 MutationObserver 全页扫 button。
   * Hotkeys 等设置页 DOM 极重，会触发连环回调导致页面卡死（issue #3）。
   * 主要靠 CSS；仅在应用规则 / 工具栏注入时做一次轻量兜底。
   */
  private _applyNativeBtnHideRule(): void {
    let hide = false
    let fromConfig = false
    if (this.config?.store) {
      try {
        const cfgVal = this.config.store['tabby-sftp-plus']?.hideNativeSFTPButton
        if (cfgVal !== undefined) { hide = cfgVal; fromConfig = true }
      } catch {}
    }
    if (!fromConfig) {
      try {
        const raw = localStorage.getItem('sftp-plus-settings.hideNativeBtn')
        if (raw) hide = JSON.parse(raw)
      } catch {}
    }

    // 确保旧版 body Observer 被拆除（修复升级后仍卡死）
    if (this._hideObserver) {
      this._hideObserver.disconnect()
      this._hideObserver = null
    }

    if (hide) {
      if (!this._hideStyleEl || !document.head.contains(this._hideStyleEl)) {
        this._hideStyleEl = document.createElement('style')
        this._hideStyleEl.setAttribute('data-sftp-plus-hide-native', '1')
        this._hideStyleEl.textContent = `
          button[data-tabby-sftp-ui-button],
          button[title="SFTP" i] {
            display: none !important;
          }
        `
        document.head.appendChild(this._hideStyleEl)
      }
      this._hideNativeBtnsOnce()
    } else {
      if (this._hideStyleEl && document.head.contains(this._hideStyleEl)) {
        this._hideStyleEl.remove()
      }
      this._hideStyleEl = null
      try {
        document.querySelectorAll<HTMLElement>('[data-sftp-plus-hidden-native="1"]').forEach(el => {
          el.style.display = ''
          el.removeAttribute('data-sftp-plus-hidden-native')
        })
      } catch {}
    }
  }

  /** 一次性隐藏当前已存在的原生 SFTP 按钮（不挂全局 Observer） */
  private _hideNativeBtnsOnce(root: ParentNode = document): void {
    try {
      root.querySelectorAll<HTMLElement>('button').forEach(el => {
        if (el.getAttribute('data-tabby-sftp-plus-button') === '1') return
        if (el.getAttribute('data-sftp-plus-hidden-native') === '1') return
        const title = (el.title || '').toLowerCase()
        const text = (el.textContent || '').trim().toLowerCase()
        // 属性存在即隐藏（对齐 CSS 的 button[data-tabby-sftp-ui-button] 属性选择器，
        // 覆盖任意取值，避免原生 SFTP 按钮用非 1/true 的值时漏隐藏）
        const hasNativeAttr = el.hasAttribute('data-tabby-sftp-ui-button')
        if (hasNativeAttr || title === 'sftp' || text === 'sftp') {
          el.style.display = 'none'
          el.setAttribute('data-sftp-plus-hidden-native', '1')
        }
      })
    } catch { /* ignore */ }
  }

  private _shouldHideNativeBtn(): boolean {
    if (this.config?.store) {
      try {
        const cfgVal = this.config.store['tabby-sftp-plus']?.hideNativeSFTPButton
        if (cfgVal !== undefined) return !!cfgVal
      } catch {}
    }
    try {
      const raw = localStorage.getItem('sftp-plus-settings.hideNativeBtn')
      if (raw) return !!JSON.parse(raw)
    } catch {}
    return false
  }

  /**
   * 防抖补扫：工具栏 DOM 变化（reconnect / 焦点切换重建）可能晚于 SFTP+ 注入
   * 才创建原生 SFTP 按钮，一次性扫描会漏 → 延迟一小段时间再补扫一次隐藏。
   * 仅观察单个工具栏容器（由调用方传入），不挂 document.body，避免之前的全页 MutationObserver 卡死问题。
   */
  private _scheduleHideNativeBtns(container: ParentNode | null): void {
    if (!container) return
    if (this._hideNativeTimer) {
      clearTimeout(this._hideNativeTimer)
    }
    this._hideNativeTimer = setTimeout(() => {
      this._hideNativeTimer = null
      try {
        this._hideNativeBtnsOnce(container)
      } catch { /* ignore */ }
    }, 300)
  }

  /** 服务销毁时清理定时器 */
  ngOnDestroy(): void {
    if (this._hideNativeTimer) {
      clearTimeout(this._hideNativeTimer)
      this._hideNativeTimer = null
    }
  }

  /**
   * 注入一次性全局样式：当 <html> 挂 `sftp-plus-suppress-transition` 类时，
   * 关闭全站所有元素的过渡/动画。用于在窗口最大化/还原（resize）瞬间压掉
   * Tabby 布局容器（split-tab / tab-body 等）自带的尺寸补间——否则浮动面板
   * 作为百分比子元素会跟着补间"缓慢缩小"。
   * 创建人：DD1024z + Hy3｜创建时间：2026-07-25
   */
  private _ensureNoTransitionStyle(): void {
    if (SftpTerminalDecorator._noTransitionStyleInjected) return
    const style = document.createElement('style')
    style.setAttribute('data-sftp-plus', 'no-transition')
    style.textContent = `
      html.sftp-plus-suppress-transition,
      html.sftp-plus-suppress-transition * {
        transition: none !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }
    `
    document.head.appendChild(style)
    SftpTerminalDecorator._noTransitionStyleInjected = true
  }

  /**
   * 面板打开期间绑定窗口 resize 监听：resize 一发生即给 <html> 挂抑制类，
   * resize 停止 250ms 后摘除。把清理句柄挂到 hostEl 上供关闭时解绑。
   */
  private _bindResizeSuppression(hostEl: HTMLElement): void {
    this._ensureNoTransitionStyle()
    let settleTimer: any = null
    const onResize = () => {
      document.documentElement.classList.add('sftp-plus-suppress-transition')
      if (settleTimer) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        document.documentElement.classList.remove('sftp-plus-suppress-transition')
      }, 250)
    }
    window.addEventListener('resize', onResize)
    ;(hostEl as any).__sftpPlusResizeCleanup = () => {
      window.removeEventListener('resize', onResize)
      if (settleTimer) clearTimeout(settleTimer)
      document.documentElement.classList.remove('sftp-plus-suppress-transition')
    }
  }

  /**
   * 打开/恢复浮动 SFTP 面板
   * 面板挂载到当前 tab 的 DOM 元素内，实现 tab 级隔离
   * 支持最小化恢复：如果面板已创建但被最小化，直接恢复显示
   */
  /**
   * 解析面板挂载锚点元素。
   * ★ 拆分终端修复（B17）：优先用"终端 front-end"元素（每个 pane 独有、不跨 pane 遮挡）；
   * 回退到整张 Tab 根元素（兼容 front-end 尚未就绪的场景）。
   * 按钮点击、快捷键切换、关闭三处必须共用同一解析，否则 __sftpPlus* 标记会错位。
   */
  private _resolveHostEl(terminal: any): HTMLElement | null {
    const frontendEl = terminal?.frontend?.element?.nativeElement as HTMLElement | null
    return (frontendEl || terminal?.element?.nativeElement) as HTMLElement | null
  }

  private openFloatingPanel(terminal: any): void {
    // ★ 拆分终端修复（B17-2）：把 overlay 挂到 document.body + position: fixed，但
    // 尺寸/位置严格贴合当前 terminal pane 的 getBoundingClientRect()。这样所有面板
    // 共享 body 这一全局层叠上下文，后开的通过递增 z-index 真正浮到最上，解决 split
    // 多 pane 下"后开面板被先开面板压住、关掉先开的才出现"的问题。同时 overlay 不铺满
    // viewport，视觉上仍属于当前 pane，不会盖住标签栏/分屏/工具栏。
    const hostEl = this._resolveHostEl(terminal)
    if (!hostEl) {
      this.notifications.error('SFTP+', 'Cannot find terminal element')
      return
    }

    // 如果面板已创建且被最小化，直接恢复显示
    if ((hostEl as any).__sftpPlusOpen && (hostEl as any).__sftpPlusMinimized) {
      this.restoreFloatingPanel(hostEl)
      return
    }

    // 每个 pane 只允许一个面板（按 terminal 实例区分）
    if ((hostEl as any).__sftpPlusOpen) {
      log.info('Panel already open for this tab')
      return
    }

    // 从 terminal 获取 SSH 会话
    const sshSession =
      terminal?.sshSession ??
      (terminal as any)?._sshSession ??
      terminal?._session ??
      null
    const profile = terminal?.profile ?? terminal?._profile ?? null

    if (!sshSession) {
      this.notifications.error('SFTP+', 'No active SSH session found on this tab')
      return
    }

    this.zone.run(() => {
      try {
        const overlay = document.createElement('div')
        overlay.className = 'sftp-plus-overlay'
        // 非模态：遮罩背景透明 + pointer-events:none，点击事件穿透到下方终端，
        // 点击面板外部即"不聚焦 SFTP+ 面板"，可正常操作终端 / 连接配置。
        // 面板本身 panelHost 仍 pointer-events:auto，保持可交互。
        // 不设置 z-index：各 overlay 严格贴合互不重叠的 pane 矩形，靠 DOM 追加顺序
        // （后开的天然在上）即可；避免硬编码高 z-index 盖过 Tabby 自身弹窗。
        overlay.style.cssText = `
          position: fixed;
          background: transparent; pointer-events: none;
          display: flex; align-items: center; justify-content: center;
          transition: none !important; isolation: isolate;
        `

        const panelHost = document.createElement('div')
        panelHost.style.cssText = `
          width: 96%; height: 94%; max-width: 100%;
          border-radius: 10px; overflow: hidden;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          pointer-events: auto;
          transition: none !important;
        `
        overlay.appendChild(panelHost)
        document.body.appendChild(overlay)

        // 让 fixed overlay 严格贴合当前 pane 矩形；标签切换/隐藏时自动隐藏，避免 body
        // 挂载导致跨 tab 残留。关闭时取消 rAF。
        let rafId: number | null = null
        let visible = true
        const syncRect = () => {
          if (!document.body.contains(overlay)) return
          if (!hostEl.isConnected) {
            if (visible) { overlay.style.display = 'none'; visible = false }
            rafId = requestAnimationFrame(syncRect)
            return
          }
          const rect = hostEl.getBoundingClientRect()
          const hidden = rect.width === 0 && rect.height === 0
          if (hidden) {
            if (visible) { overlay.style.display = 'none'; visible = false }
          } else {
            overlay.style.left = `${rect.left}px`
            overlay.style.top = `${rect.top}px`
            overlay.style.width = `${rect.width}px`
            overlay.style.height = `${rect.height}px`
            if (!visible && !(hostEl as any).__sftpPlusMinimized) {
              overlay.style.display = 'flex'
              visible = true
            }
          }
          rafId = requestAnimationFrame(syncRect)
        }
        ;(hostEl as any).__sftpPlusStopRectSync = () => {
          if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
        }
        syncRect()

        // 面板打开期间抑制窗口 resize 时的容器过渡（防面板缓慢缩小）
        this._bindResizeSuppression(hostEl)
        ;(hostEl as any).__sftpPlusOpen = true
        ;(hostEl as any).__sftpPlusMinimized = false
        ;(hostEl as any).__sftpPlusOverlay = overlay

        const factory = this.resolver.resolveComponentFactory(SftpFloatingPanel)
        const cmpRef = factory.create(this.injector, [], panelHost)
        const cmp = cmpRef.instance
        ;(hostEl as any).__sftpPlusCmpRef = cmpRef

        cmp.sshSession = sshSession
        cmp.terminalRef = terminal
        cmp.profile = profile
        cmp.onClose = () => {
          this.zone.run(() => {
            try { (hostEl as any).__sftpPlusStopRectSync?.() } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusStopRectSync } catch { /* ignore */ }
            try { (hostEl as any).__sftpPlusResizeCleanup?.() } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusResizeCleanup } catch { /* ignore */ }
            try { cmpRef.destroy() } catch { /* ignore */ }
            try { overlay.remove() } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusOpen } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusMinimized } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusOverlay } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusCmpRef } catch { /* ignore */ }
          })
        }

        cmp.onMinimize = () => {
          this.zone.run(() => {
            overlay.style.display = 'none'
            ;(hostEl as any).__sftpPlusMinimized = true
            cmp.minimized = true
          })
        }

        this.appRef.attachView(cmpRef.hostView)
        cmpRef.changeDetectorRef.detectChanges()

        // 非模态：遮罩 pointer-events:none，点面板外部事件直接穿透到下方终端，
        // 终端自然获得光标焦点、可操作连接配置。
        // 但仅拦在 panelHost 层：面板内部 mousedown 停止冒泡，避免冒泡到 Tabby 的
        // 终端聚焦处理器把光标焦点抢回去（否则面板输入框无法获得焦点）。
        // 关闭仍只由右上角 ✕ 按钮。
        panelHost.addEventListener('mousedown', (ev: MouseEvent) => {
          ev.stopPropagation()
        })
        panelHost.addEventListener('click', (ev: MouseEvent) => {
          ev.stopPropagation()
        })

        log.info('Panel opened for tab')
      } catch (e) {
        log.error('Panel error', e)
        this.notifications.error('SFTP+', 'Failed to open: ' + (e as Error).message)
      }
    })
  }

  
  /**
   * 恢复最小化的浮动面板
   */
  private restoreFloatingPanel(hostEl: HTMLElement): void {
    const overlay = (hostEl as any).__sftpPlusOverlay as HTMLElement | null
    const cmpRef = (hostEl as any).__sftpPlusCmpRef as any
    
    if (overlay) {
      overlay.style.display = 'flex'
      ;(hostEl as any).__sftpPlusMinimized = false
      if (cmpRef?.instance) {
        cmpRef.instance.minimized = false
      }
      log.info('Panel restored from minimized state')
    }
  }

  private openWorkspaceTab(terminal: any): void {
    const sshSession = terminal?.sshSession ?? (terminal as any)?._sshSession ?? terminal?._session ?? null
    const profile = terminal?.profile ?? terminal?._profile ?? null
    if (!sshSession) {
      this.notifications.error('SFTP+', 'No active SSH session found on this tab')
      return
    }

    this.zone.run(() => {
      if (this._singleWorkspaceInstance()) {
        const existing = this._findWorkspaceTabForTerminal(terminal)
        if (existing) {
          this._focusWorkspaceTab(existing)
          return
        }
      }

      this.app.openNewTab({
        type: SftpWorkspaceTabComponent,
        inputs: {
          sshSession,
          profile,
          terminalRef: terminal,
          sourceTabKey: this._getTerminalSourceKey(terminal),
        },
      })
    })
  }

  /** 聚焦已有 SFTP+ 工作区标签（需选中顶层 SplitTab 并 focus 子标签） */
  private _focusWorkspaceTab(tab: any): void {
    const parent = this.app.getParentTab(tab)
    if (parent) {
      this.app.selectTab(parent)
      if (typeof parent.focus === 'function') {
        parent.focus(tab)
      }
    } else {
      this.app.selectTab(tab)
    }
    try { tab.emitFocused?.() } catch { /* ignore */ }
  }

  /** 为 SSH 终端生成稳定来源键，用于单实例匹配 */
  private _getTerminalSourceKey(terminal: any): string {
    if (!terminal) return ''
    if (terminal.__sftpPlusSourceKey) return String(terminal.__sftpPlusSourceKey)
    const key = `sftp-src-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    terminal.__sftpPlusSourceKey = key
    return key
  }

  /** 查找同一 SSH 终端已打开的工作区标签 */
  private _findWorkspaceTabForTerminal(terminal: any): any | null {
    const sourceKey = this._getTerminalSourceKey(terminal)
    let found: any = null
    const visit = (tab: any): void => {
      if (found || !tab) return
      if (!tab.sftpPlusWorkspace) return
      if (tab.sourceTabKey && tab.sourceTabKey === sourceKey) {
        found = tab
        return
      }
      if (tab.terminalRef === terminal) {
        if (!tab.sourceTabKey) tab.sourceTabKey = sourceKey
        found = tab
      }
    }

    for (const top of this.app.tabs || []) {
      if (top?.root?.getAllTabs) {
        for (const child of top.root.getAllTabs()) visit(child)
      } else if (typeof top?.getAllTabs === 'function') {
        for (const child of top.getAllTabs()) visit(child)
      } else {
        visit(top)
      }
    }
    return found
  }
}
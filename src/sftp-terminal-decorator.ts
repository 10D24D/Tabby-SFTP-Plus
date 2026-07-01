/**
 * 终端装饰器
 * 功能描述：在终端工具栏注入 SFTP+ 按钮，点击弹出浮动面板
 *   完全参照 tabby-sftp-ui-next 的已验证实现模式
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-25
 *   新增 SSH 断开检测：终端关闭后禁用 SFTP+ 入口按钮
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 替换 emoji 图标为 SVG 图标
 *   - 注入 CSS 规则隐藏原生 SFTP 按钮（设置项: hideNativeSFTPButton）
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 替换文件夹图标为 Bootstrap Icons folder2-open
 *   - 修复隐藏原生SFTP按钮：扩大选择器匹配范围（title通配 + data属性 + 文本内容）
 *     + 取消隐藏时恢复被隐藏的原生按钮
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 替换文件夹图标为新的 SVG 图标
 *   - 隐藏原生SFTP按钮改为精确匹配 button[title="SFTP" i]
 */
import { Injectable, Injector, ComponentFactoryResolver, ApplicationRef, NgZone } from '@angular/core'
import { TerminalDecorator } from 'tabby-terminal'
import { NotificationsService, ConfigService } from 'tabby-core'
import { SftpFloatingPanel } from './sftp-floating-panel.component'

/** SVG 文件夹图标 */
const FOLDER_SVG = '<svg viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor" style="vertical-align:middle"><path d="M120 344h291.6l112-112H736v224h56V176H500.4l-112 112H64v560l56-130.6z"/><path d="M792 456H232L120 717.4 64 848h728l168-392z"/></svg>'

@Injectable()
export class SftpTerminalDecorator extends TerminalDecorator {
  private _hideStyleEl: HTMLStyleElement | null = null
  private _hideObserver: MutationObserver | null = null

  constructor(
    private notifications: NotificationsService,
    private resolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private zone: NgZone,
    private injector: Injector,
    private config?: ConfigService,
  ) {
    super()
    console.log('[SFTP+] Decorator ready')
    this._applyNativeBtnHideRule()
  }

  override attach(terminal: any): void {
    super.attach(terminal)
    console.log('[SFTP+] attach called')

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
          this.openFloatingPanel(terminal)
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

        console.log('[SFTP+] Button injected into', container.className || container.tagName)

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
                console.log('[SFTP+] SSH disconnected, SFTP+ button disabled')
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
                console.log('[SFTP+] SSH disconnected, SFTP+ button disabled')
              }).catch(() => {})
            }
          }
        } catch { /* ignore */ }

        return true
      } catch (err) {
        console.warn('[SFTP+] tryInsert error', err)
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
              console.log('[SFTP+] Button removed from toolbar, re-injecting...')
              tryInsert()
            }
          })
          obs.observe(container, { childList: true, subtree: true })
          this.subscribeUntilDetached(terminal, { unsubscribe: () => obs.disconnect() })
        }
        return
      }
      if (attempts > 20) {
        clearInterval(timer)
        console.log('[SFTP+] No SSH session found on this tab after 20 attempts, hiding SFTP+ button')
      }
    }, 500)

    this.subscribeUntilDetached(terminal, { unsubscribe: () => clearInterval(timer) })

    // 监听设置变更 → 重新应用隐藏规则
    const handler = () => this._applyNativeBtnHideRule()
    window.addEventListener('sftp-plus-settings-changed', handler)
    this.subscribeUntilDetached(terminal, { unsubscribe: () => window.removeEventListener('sftp-plus-settings-changed', handler) })
  }

  /**
   * 读取配置，注入/移除隐藏原生 SFTP 按钮的 CSS 规则
   * 目标：button[title="SFTP"]（精确匹配，不区分大小写）或 data 属性匹配
   */
  private _applyNativeBtnHideRule(): void {
    let hide = false
    let fromConfig = false
    // 优先从 Tabby 配置读取
    if (this.config?.store) {
      try {
        const cfgVal = this.config.store['tabby-sftp-plus']?.hideNativeSFTPButton
        if (cfgVal !== undefined) { hide = cfgVal; fromConfig = true }
      } catch {}
    }
    // 回退：仅当配置未提供值时，才从 localStorage 读取（旧版兼容）
    if (!fromConfig) {
      try {
        const raw = localStorage.getItem('sftp-plus-settings.hideNativeBtn')
        if (raw) hide = JSON.parse(raw)
      } catch {}
    }

    /** 查找原生 SFTP 按钮（title 精确匹配 "SFTP"，不含插件自己的 SFTP+ 按钮） */
    const findNativeSFTPBtns = (): HTMLElement[] => {
      const all: HTMLElement[] = []
      try {
        document.querySelectorAll<HTMLElement>('button').forEach(el => {
          // 跳过插件自己的按钮
          if (el.getAttribute('data-tabby-sftp-plus-button') === '1') return
          const title = (el.title || '').toLowerCase()
          const text = (el.textContent || '').trim().toLowerCase()
          const attr = (el.getAttribute('data-tabby-sftp-ui-button') || '').toLowerCase()
          if (attr === '1' || attr === 'true' || title === 'sftp' || text === 'sftp') {
            all.push(el)
          }
        })
      } catch {}
      return all
    }

    if (hide) {
      if (!this._hideStyleEl || !document.head.contains(this._hideStyleEl)) {
        this._hideStyleEl = document.createElement('style')
        this._hideStyleEl.setAttribute('data-sftp-plus-hide-native', '1')
        this._hideStyleEl.textContent = `
          button[data-tabby-sftp-ui-button="1"] { display: none !important; }
          button[data-tabby-sftp-ui-button="true"] { display: none !important; }
          button[title="SFTP" i] { display: none !important; }
        `
        document.head.appendChild(this._hideStyleEl)
      }
      // 兜底：直接隐藏已存在的 SFTP 按钮
      findNativeSFTPBtns().forEach(el => { el.style.display = 'none' })
      // MutationObserver 监听新注入的 SFTP 按钮并实时隐藏
      if (!this._hideObserver) {
        this._hideObserver = new MutationObserver(() => {
          findNativeSFTPBtns().forEach(el => {
            if (el.style.display !== 'none') el.style.display = 'none'
          })
        })
        this._hideObserver.observe(document.body, { childList: true, subtree: true })
      }
    } else {
      if (this._hideStyleEl && document.head.contains(this._hideStyleEl)) {
        this._hideStyleEl.remove()
      }
      this._hideStyleEl = null
      if (this._hideObserver) {
        this._hideObserver.disconnect()
        this._hideObserver = null
      }
      // 恢复被隐藏的原生按钮
      try {
        document.querySelectorAll<HTMLElement>('button[style*="display: none"]').forEach(el => {
          const title = (el.title || '').toLowerCase()
          const text = (el.textContent || '').trim().toLowerCase()
          if (title === 'sftp' || text === 'sftp') {
            if (el.style.display === 'none') el.style.display = ''
          }
        })
      } catch {}
    }
  }

  /**
   * 打开/恢复浮动 SFTP 面板
   * 面板挂载到当前 tab 的 DOM 元素内，实现 tab 级隔离
   * 支持最小化恢复：如果面板已创建但被最小化，直接恢复显示
   */
  private openFloatingPanel(terminal: any): void {
    const hostEl = terminal?.element?.nativeElement as HTMLElement | null
    if (!hostEl) {
      this.notifications.error('SFTP+', 'Cannot find terminal element')
      return
    }

    // 如果面板已创建且被最小化，直接恢复显示
    if ((hostEl as any).__sftpPlusOpen && (hostEl as any).__sftpPlusMinimized) {
      this.restoreFloatingPanel(hostEl)
      return
    }

    // 每个 tab 只允许一个面板（按 terminal 实例区分）
    if ((hostEl as any).__sftpPlusOpen) {
      console.log('[SFTP+] Panel already open for this tab')
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
        // 确保 host 元素可定位
        const origPosition = hostEl.style.position
        if (!origPosition || origPosition === 'static') {
          hostEl.style.position = 'relative'
        }

        const overlay = document.createElement('div')
        overlay.className = 'sftp-plus-overlay'
        overlay.style.cssText = `
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          z-index: 99999; background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          pointer-events: auto;
        `

        const panelHost = document.createElement('div')
        panelHost.style.cssText = `
          width: 96%; height: 94%; max-width: 100%;
          border-radius: 10px; overflow: hidden;
          box-shadow: 0 12px 48px rgba(0,0,0,0.6);
          pointer-events: auto;
        `
        overlay.appendChild(panelHost)
        hostEl.appendChild(overlay)
        ;(hostEl as any).__sftpPlusOpen = true
        ;(hostEl as any).__sftpPlusMinimized = false
        ;(hostEl as any).__sftpPlusOverlay = overlay
        ;(hostEl as any).__sftpPlusOrigPosition = origPosition

        const factory = this.resolver.resolveComponentFactory(SftpFloatingPanel)
        const cmpRef = factory.create(this.injector, [], panelHost)
        const cmp = cmpRef.instance
        ;(hostEl as any).__sftpPlusCmpRef = cmpRef

        cmp.sshSession = sshSession
        cmp.terminalRef = terminal
        cmp.profile = profile
        cmp.onClose = () => {
          this.zone.run(() => {
            try { cmpRef.destroy() } catch { /* ignore */ }
            try { overlay.remove() } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusOpen } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusMinimized } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusOverlay } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusCmpRef } catch { /* ignore */ }
            // 恢复原始 position
            const savedOrigPos = (hostEl as any).__sftpPlusOrigPosition
            if (hostEl.style.position === 'relative' && !savedOrigPos) {
              hostEl.style.position = ''
            }
            try { delete (hostEl as any).__sftpPlusOrigPosition } catch { /* ignore */ }
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

        // 阻止面板内鼠标事件冒泡到终端宿主，防止终端抢焦点
        // mousedown + click 双重拦截：终端可能通过任一事件重新聚焦
        // 仅拦截冒泡不关闭面板 —— 关闭只能通过右上角 ✕ 按钮
        overlay.addEventListener('mousedown', (ev: MouseEvent) => {
          ev.stopPropagation()
        })
        overlay.addEventListener('click', (ev: MouseEvent) => {
          ev.stopPropagation()
        })
        // 阻止 focus 相关事件冒泡，防止终端重新抢走焦点
        overlay.addEventListener('focusin', (ev: FocusEvent) => {
          ev.stopPropagation()
        })
        overlay.addEventListener('focusout', (ev: FocusEvent) => {
          ev.stopPropagation()
        })

        console.log('[SFTP+] Panel opened for tab')
      } catch (e) {
        console.error('[SFTP+] Panel error', e)
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
      console.log('[SFTP+] Panel restored from minimized state')
    }
  }
}
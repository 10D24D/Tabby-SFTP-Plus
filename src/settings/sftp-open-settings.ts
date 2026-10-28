import { AppService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'
import { SFTP_PLUS_SETTINGS_TAB_ID } from './sftp-settings.component'

/**
 * 打开 Tabby 设置页并定位到 SFTP+ 插件设置
 * 功能描述：从 SFTP+ 面板「设置」按钮跳转设置页。
 * 关键约束：Tabby 设置页使用 ng-bootstrap 的 NgbNav，其 [activeId] 为单向绑定且无 ngOnChanges 同步。
 *   当设置页已经打开、并且用户切换过其他设置菜单后，NgbNav 内部 activeId 已固定为其他值，
 *   此时仅通过 DOM 点击 nav 链接无法可靠地再次切回 SFTP+（NgbNav 在复用/后台挂载后，
 *   click() 发现 activeId 与目标相同会跳过更新，或命中失效的 DOM/指令实例）。
 *   因此本实现采用「关闭旧设置页 → 新建设置页」策略，保证每次 NgbNav 都能从 activeTab
 *   正确初始化并直接显示 SFTP+ 页面。
 * 创建人：DD1024z + Hy3 preview
 * 创建时间：2026-07-22
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — P2-30 修复（两项）：① 原先只在 `app.tabs`（顶层 tab）里找已开设置页，
 *              分屏内的子 tab 根本不在该数组里（宿主是把 pane 挂在 SplitTabComponent 上），
 *              于是已开在另一个 pane 里的 SFTP+ 设置页永远漏关 ⇒ 每次都新建一个 ⇒ 重复堆标签，
 *              且旧的那份仍持有同一份配置内存状态，改了这边那边看不见；改为递归收集子 tab
 *              （SplitTabComponent.getAllTabs），并按 tab 所处层级用正确的方式关闭。
 *              ② 原先的判定（constructor.name 是 SettingsTabComponent / 有 settingsProviders /
 *              宿主 DOM 里存在该 ngbNavItem）对**任意**设置页都成立——SFTP+ 的 provider 注册在
 *              每个设置页里，那条 ngbNavItem 恒存在 ⇒ 会把用户正在浏览的 Tabby 原生设置页
 *              （外观/快捷键/其它插件页）一起关掉，用户刚才看到的位置丢失。改为按「本插件打开的
 *              那一个」识别：openNewTabRaw 的 inputs 经 Object.assign 落到实例上，
 *              `tab.activeTab === tabId` 才是我们自己的实例。
 *              2026-07-22
 */
export function openSftpPlusSettings(app: AppService): void {
  const tabId = SFTP_PLUS_SETTINGS_TAB_ID

  // 判定一个 tab 是否为设置页（多条件，规避正式发布版 minify 后 constructor.name 失配）
  const isSettingsTab = (tab: any): boolean => {
    if (!tab) return false
    if (tab.constructor?.name === 'SettingsTabComponent') return true
    if (tab.settingsProviders) return true
    try {
      const el = tab.hostElement as HTMLElement | undefined
      if (el && el.querySelector && el.querySelector(`[ngbNavItem="${tabId}"]`)) return true
    } catch { /* ignore */ }
    return false
  }

  /**
   * 收集全部 tab（含分屏内的子 tab）。
   * ★ 2026-10-19 P2-30：app.tabs 只有顶层 tab，分屏后真实页面挂在 SplitTabComponent 下，
   *   必须走 SplitTabComponent.getAllTabs() 递归展开才能看到。
   */
  const collectAllTabs = (): any[] => {
    const out: any[] = []
    const visit = (tab: any): void => {
      if (!tab || out.includes(tab)) return
      out.push(tab)
      if (typeof tab.getAllTabs === 'function') {
        for (const child of tab.getAllTabs() || []) visit(child)
      }
    }
    for (const top of app.tabs || []) visit(top)
    return out
  }

  /**
   * 关闭任意层级的 tab。
   * ★ 2026-10-19 P2-30：宿主的 AppService.closeTab 开头就 `if (!this.tabs.includes(tab)) return`
   *   —— 对分屏里的子 tab 直接空转什么也不做，所以这里要用 tab 自身的位置决定关闭方式：
   *   顶层 tab 照旧交给 AppService（它会维护 tabs/activeTab 并保存会话），
   *   子 tab 直接 destroy()（SplitTabComponent 在 attachTabView 里订阅了 tab.destroyed$，
   *   会把它从分屏容器摘掉并触发重排/聚焦转移）。
   */
  const closeTabAnywhere = (tab: any): void => {
    if ((app.tabs || []).includes(tab)) {
      // false = 不询问 canClose，直接销毁；SettingsTabComponent 的 ngOnDestroy 会保存配置
      app.closeTab(tab, false)
      return
    }
    try { tab?.destroy?.() } catch { /* ignore */ }
  }

  // 关闭本插件自己打开的设置页。这是为了保证新建设置页时，NgbNav 能从 inputs.activeTab
  // 正确初始化 activeId，从而直接渲染 SFTP+ 设置面板，避免复用旧实例时的导航失效问题。
  // ★ 2026-10-19 P2-30：只认「本插件打开的那一个」——用户手动打开的 Tabby 原生设置页
  //   （哪怕正停在别的分组）不再被连坐关掉。
  const existingTabs = collectAllTabs().filter(t => isSettingsTab(t) && t?.activeTab === tabId)
  for (const tab of existingTabs) {
    try {
      closeTabAnywhere(tab)
    } catch { /* ignore */ }
  }

  const settingsTab = app.openNewTabRaw({
    type: SettingsTabComponent,
    inputs: { activeTab: tabId },
  }) as any

  if (!settingsTab) return
  app.selectTab(settingsTab)
}

/**
 * 打开 Tabby 设置页并定位到「插件」分组
 * 功能描述：SFTP+ 设置页里「执行 QuickCmd+ 命令后刷新列表」在未检测到 QuickCmd+ 时，
 *   给一个「打开插件页」入口，用户不用自己找菜单。
 * 关键约束：
 *   ① 插件分组的 id 是宿主内置插件 tabby-plugin-manager 自己注册的 'plugins'
 *      （见其 src/settings.ts 的 `id = 'plugins'`），不是 SFTP+ 的 tab id。
 *   ② 只传 activeTab，不模拟点击 nav 链接 —— NgbNav 复用后 click 会失效，
 *      这是 openSftpPlusSettings 当初踩过的同一个坑。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-27
 */
export function openTabbyPluginsSettings(app: AppService): void {
  try {
    const settingsTab = app.openNewTabRaw({
      type: SettingsTabComponent,
      inputs: { activeTab: 'plugins' },
    }) as any
    if (!settingsTab) return
    app.selectTab(settingsTab)
  } catch { /* 宿主版本差异：点不开也不该影响设置页本身 */ }
}

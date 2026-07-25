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
 * 修改人：DD1024z + Hy3 preview
 * 修改时间：2026-07-22
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

  // 关闭所有已打开的设置页。这是为了保证新建设置页时，NgbNav 能从 inputs.activeTab
  // 正确初始化 activeId，从而直接渲染 SFTP+ 设置面板，避免复用旧实例时的导航失效问题。
  const existingTabs = (app.tabs || []).filter(isSettingsTab)
  for (const tab of existingTabs) {
    try {
      // false = 不询问 canClose，直接销毁；SettingsTabComponent 的 ngOnDestroy 会保存配置
      app.closeTab(tab, false)
    } catch { /* ignore */ }
  }

  const settingsTab = app.openNewTabRaw({
    type: SettingsTabComponent,
    inputs: { activeTab: tabId },
  }) as any

  if (!settingsTab) return
  app.selectTab(settingsTab)
}

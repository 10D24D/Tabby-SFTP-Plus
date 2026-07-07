import { AppService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'
import { SFTP_PLUS_SETTINGS_TAB_ID } from './sftp-settings.component'

/** 打开 Tabby 设置页并定位到 SFTP+ 插件设置 */
export function openSftpPlusSettings(app: AppService): void {
  const tabId = SFTP_PLUS_SETTINGS_TAB_ID
  let settingsTab = (app.tabs || []).find((tab: any) =>
    tab?.constructor?.name === 'SettingsTabComponent' || !!tab?.settingsProviders,
  )

  if (settingsTab) {
    settingsTab.activeTab = tabId
    app.selectTab(settingsTab)
    return
  }

  settingsTab = app.openNewTabRaw({
    type: SettingsTabComponent,
    inputs: { activeTab: tabId },
  })
  if (settingsTab && settingsTab.activeTab !== tabId) {
    settingsTab.activeTab = tabId
  }
}

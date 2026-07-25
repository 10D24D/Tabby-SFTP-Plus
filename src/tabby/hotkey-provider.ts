/**
 * SFTP+ 热键提供者
 * 在 Tabby「设置 → 快捷键」中注册可绑定项；默认键位见 ConfigProvider.defaults.hotkeys
 */
import { Injectable, Optional } from '@angular/core'
import { ConfigService, HotkeyProvider } from 'tabby-core'
import { SftpI18nService } from '../services/sftp-i18n.service'

export const SFTP_PLUS_TOGGLE_HOTKEY = 'sftp-plus-toggle-panel'

@Injectable()
export class SftpHotkeyProvider extends HotkeyProvider {
  private i18n: SftpI18nService

  constructor(@Optional() private config?: ConfigService) {
    super()
    this.i18n = new SftpI18nService(config)
  }

  async provide(): Promise<Array<{ id: string; name: string }>> {
    return [
      {
        id: SFTP_PLUS_TOGGLE_HOTKEY,
        // 与原生「打开 SFTP 面板」对齐的命名；按当前语言显示
        name: this.i18n.t('hotkey.togglePanel'),
      },
    ]
  }
}

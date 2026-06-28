/**
 * SFTP+ 插件入口
 * 功能描述：注册 TerminalDecorator（SFTP+ 按钮）+ 浮动面板 + 设置页
 *   参考：tabby-command-workbench 的模块结构
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Claude
 * 修改时间：2026-06-21
 */
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgModule } from '@angular/core'
import TabbyCoreModule from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { TerminalDecorator } from 'tabby-terminal'

import { SftpTerminalDecorator } from './sftp-terminal-decorator'
import { SftpFloatingPanel } from './sftp-floating-panel.component'
import { SftpSettingsTabProvider, SftpSettingsTabComponent } from './sftp-settings.component'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    TabbyCoreModule,
  ],
  declarations: [
    SftpFloatingPanel,
    SftpSettingsTabComponent,
  ],
  providers: [
    { provide: TerminalDecorator, useClass: SftpTerminalDecorator, multi: true },
    { provide: SettingsTabProvider, useClass: SftpSettingsTabProvider, multi: true },
  ],
})
export default class SftpPlusModule {
  constructor() {
    console.log('[SFTP+] Module loaded OK')
  }
}

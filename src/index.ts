/**
 * SFTP+ 插件入口
 * 功能描述：注册 TerminalDecorator（SFTP+ 按钮）+ 浮动面板 + 设置页 + ConfigProvider
 *   参考：tabby-command-workbench 的模块结构
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 注册 SftpPlusConfigProvider（Tabby config.yaml 持久化）
 */
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgModule, Optional } from '@angular/core'
import TabbyCoreModule, { ConfigProvider, HotkeyProvider, LogService } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { TerminalDecorator } from 'tabby-terminal'

import { bindSftpLogger, log } from './services/sftp-logger'
import { SftpTerminalDecorator } from './tabby/terminal-decorator'
import { SftpFloatingPanel } from './sftp/sftp-floating-panel.component'
import { SftpWorkspaceTabComponent } from './sftp/sftp-workspace-tab.component'
import { SftpSettingsTabProvider, SftpSettingsTabComponent } from './settings/sftp-settings.component'
import { SftpPlusConfigProvider } from './tabby/config-provider'
import { SftpHotkeyProvider } from './tabby/hotkey-provider'
import { SftpConflictDialogComponent } from './sftp/components/sftp-conflict-dialog.component'
import { SftpTransferQueueComponent } from './sftp/components/sftp-transfer-queue.component'
import { SftpTransferLogDialogComponent } from './sftp/components/sftp-transfer-log-dialog.component'
import { SftpFilePaneComponent } from './sftp/components/sftp-file-pane.component'
import { SftpContextMenuComponent } from './sftp/components/sftp-context-menu.component'
import { SftpBookmarkPopupComponent } from './sftp/components/sftp-bookmark-popup.component'
import { SftpDeleteDialogComponent } from './sftp/components/sftp-delete-dialog.component'
import { SftpInputDialogComponent } from './sftp/components/sftp-input-dialog.component'
import { SftpPermDialogComponent } from './sftp/components/sftp-perm-dialog.component'
import { SftpDetailsDialogComponent } from './sftp/components/sftp-details-dialog.component'
import { SftpViewerDialogComponent } from './sftp/components/sftp-viewer-dialog.component'
import { SftpEditorDialogComponent } from './sftp/components/sftp-editor-dialog.component'
import { SftpTextContextMenuComponent } from './sftp/components/sftp-text-context-menu.component'
import { SftpCwdSetupDialogComponent } from './sftp/components/sftp-cwd-setup-dialog.component'


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    TabbyCoreModule,
  ],
  declarations: [
    SftpFloatingPanel,
    SftpWorkspaceTabComponent,
    SftpSettingsTabComponent,
    SftpConflictDialogComponent,
    SftpTransferQueueComponent,
    SftpTransferLogDialogComponent,
    SftpFilePaneComponent,
    SftpContextMenuComponent,
    SftpBookmarkPopupComponent,
    SftpDeleteDialogComponent,
    SftpInputDialogComponent,
    SftpPermDialogComponent,
    SftpDetailsDialogComponent,
    SftpViewerDialogComponent,
    SftpEditorDialogComponent,
    SftpTextContextMenuComponent,
    SftpCwdSetupDialogComponent,

  ],
  providers: [
    { provide: TerminalDecorator, useClass: SftpTerminalDecorator, multi: true },
    { provide: SettingsTabProvider, useClass: SftpSettingsTabProvider, multi: true },
    { provide: ConfigProvider, useClass: SftpPlusConfigProvider, multi: true },
    { provide: HotkeyProvider, useClass: SftpHotkeyProvider, multi: true },
  ],
})
export default class SftpPlusModule {
  constructor(@Optional() logService: LogService) {
    bindSftpLogger(logService)
    log.info('Module loaded OK')
  }
}

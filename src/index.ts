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
import { NgModule } from '@angular/core'
import TabbyCoreModule, { ConfigProvider } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { TerminalDecorator } from 'tabby-terminal'

import { SftpTerminalDecorator } from './sftp-terminal-decorator'
import { SftpFloatingPanel } from './sftp-floating-panel.component'
import { SftpWorkspaceTabComponent } from './sftp-workspace-tab.component'
import { SftpSettingsTabProvider, SftpSettingsTabComponent } from './sftp-settings.component'
import { SftpPlusConfigProvider } from './sftp-config-provider'
import { SftpConflictDialogComponent } from './panel/sftp-conflict-dialog.component'
import { SftpTransferQueueComponent } from './panel/sftp-transfer-queue.component'
import { SftpTransferLogDialogComponent } from './panel/sftp-transfer-log-dialog.component'
import { SftpFilePaneComponent } from './panel/sftp-file-pane.component'
import { SftpContextMenuComponent } from './panel/sftp-context-menu.component'
import { SftpBookmarkPopupComponent } from './panel/sftp-bookmark-popup.component'
import { SftpDeleteDialogComponent } from './panel/sftp-delete-dialog.component'
import { SftpInputDialogComponent } from './panel/sftp-input-dialog.component'
import { SftpPermDialogComponent } from './panel/sftp-perm-dialog.component'
import { SftpDetailsDialogComponent } from './panel/sftp-details-dialog.component'
import { SftpViewerDialogComponent } from './panel/sftp-viewer-dialog.component'
import { SftpEditorDialogComponent } from './panel/sftp-editor-dialog.component'


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

  ],
  providers: [
    { provide: TerminalDecorator, useClass: SftpTerminalDecorator, multi: true },
    { provide: SettingsTabProvider, useClass: SftpSettingsTabProvider, multi: true },
    { provide: ConfigProvider, useClass: SftpPlusConfigProvider, multi: true },
  ],
})
export default class SftpPlusModule {
  constructor() {
    console.log('[SFTP+] Module loaded OK')
  }
}

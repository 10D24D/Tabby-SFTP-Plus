import { AfterViewInit, Component, ComponentFactoryResolver, ComponentRef, Injector, ViewChild, ViewContainerRef } from '@angular/core'
import { AppService, BaseTabComponent } from 'tabby-core'
import { SftpFloatingPanel } from './sftp-floating-panel.component'

@Component({
  selector: 'sftp-plus-workspace-tab',
  template: '<div class="sftp-workspace-tab"><ng-container #panelHost></ng-container></div>',
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--body-bg, #111827);
    }
    .sftp-workspace-tab {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
  `],
})
export class SftpWorkspaceTabComponent extends BaseTabComponent implements AfterViewInit {
  /** 供装饰器识别 SFTP+ 工作区标签 */
  readonly sftpPlusWorkspace = true

  sshSession: any = null
  profile: any = null
  terminalRef: any = null
  sourceTabKey = ''

  @ViewChild('panelHost', { read: ViewContainerRef, static: true })
  private panelHost!: ViewContainerRef

  private panelRef: ComponentRef<SftpFloatingPanel> | null = null
  private closingFromPanel = false
  private app: AppService
  private _layoutTimeout: ReturnType<typeof setTimeout> | null = null
  private _layoutRaf: number | null = null

  constructor(injector: Injector, private resolver: ComponentFactoryResolver) {
    super(injector)
    this.app = injector.get(AppService)
    this.title = this._buildTabTitle()
  }

  ngAfterViewInit(): void {
    const factory = this.resolver.resolveComponentFactory(SftpFloatingPanel)
    const ref = this.panelHost.createComponent(factory) as ComponentRef<SftpFloatingPanel>
    const panel = ref.instance
    this.panelRef = ref

    panel.displayMode = 'workspace'
    panel.sshSession = this.sshSession
    panel.profile = this.profile
    panel.terminalRef = this.terminalRef
    panel.onMinimize = null
    panel.onClose = () => {
      this.closingFromPanel = true
      const parent = this.app.getParentTab(this)
      void this.app.closeTab(parent ?? this, true)
    }

    this.title = this._buildTabTitle()

    ref.changeDetectorRef.detectChanges()
    // 工作区标签挂载后，等 Tabby 完成布局再刷新面板尺寸
    this._layoutTimeout = setTimeout(() => panel.refreshWorkspaceLayout(), 0)
    this._layoutRaf = requestAnimationFrame(() => panel.refreshWorkspaceLayout())
  }

  /** 标签标题：原 SSH 终端标签名 - SFTP+ */
  private _buildTabTitle(): string {
    const terminal = this.terminalRef
    const base = String(terminal?.customTitle || terminal?.title || '').trim()
    if (base) return `${base} - SFTP+`

    const host = this.profile?.options?.host || this.profile?.name || ''
    const user = this.profile?.options?.username || this.profile?.options?.user || ''
    const profileTitle = user ? `${user}@${host}` : host
    return profileTitle ? `${profileTitle} - SFTP+` : 'SFTP+'
  }

  async canClose(): Promise<boolean> {
    if (this.closingFromPanel) return true
    const panel = this.panelRef?.instance
    if (panel && (panel as any).transfers?.length > 0) {
      return window.confirm((panel as any).i18n?.t('workspace.closeWithTransfers') || '有正在进行的传输，确定要关闭吗？')
    }
    return true
  }

  override destroy(): void {
    if (this._layoutTimeout != null) { clearTimeout(this._layoutTimeout); this._layoutTimeout = null }
    if (this._layoutRaf != null) { cancelAnimationFrame(this._layoutRaf); this._layoutRaf = null }
    try { this.panelRef?.instance?.disconnect?.() } catch { /* ignore */ }
    super.destroy()
  }

  /** TODO: 实现会话恢复——保存连接信息以便崩溃后自动重连 */
  override async getRecoveryToken(): Promise<null> {
    // 当前不支持会话恢复，面板状态（连接、路径、选中）在崩溃后丢失
    return null
  }
}

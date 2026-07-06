import { AfterViewInit, Component, ComponentFactoryResolver, ComponentRef, Injector, ViewChild, ViewContainerRef } from '@angular/core'
import { BaseTabComponent } from 'tabby-core'
import { SftpFloatingPanel } from './sftp-floating-panel.component'

@Component({
  selector: 'sftp-plus-workspace-tab',
  template: '<div class="sftp-workspace-tab"><ng-container #panelHost></ng-container></div>',
  styles: [`
    :host, .sftp-workspace-tab {
      display: block;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      background: var(--body-bg, #111827);
    }
  `],
})
export class SftpWorkspaceTabComponent extends BaseTabComponent implements AfterViewInit {
  sshSession: any = null
  profile: any = null
  terminalRef: any = null

  @ViewChild('panelHost', { read: ViewContainerRef, static: true })
  private panelHost!: ViewContainerRef

  private panelRef: ComponentRef<SftpFloatingPanel> | null = null
  private closingFromPanel = false

  constructor(injector: Injector, private resolver: ComponentFactoryResolver) {
    super(injector)
    this.title = 'SFTP+'
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
    panel.onOpenInWorkspaceTab = null
    panel.onMinimize = null
    panel.onClose = () => {
      this.closingFromPanel = true
      this.closeTab()
    }

    const host = this.profile?.options?.host || this.profile?.name || 'SFTP+'
    const user = this.profile?.options?.username || this.profile?.options?.user || ''
    this.title = user ? `${user}@${host}` : host

    ref.changeDetectorRef.detectChanges()
  }

  async canClose(): Promise<boolean> {
    if (this.closingFromPanel) return true
    return this.panelRef?.instance?.canClosePanel?.() ?? true
  }

  override destroy(): void {
    try { this.panelRef?.instance?.disconnect?.() } catch {}
    super.destroy()
  }

  override async getRecoveryToken(): Promise<null> {
    return null
  }
}

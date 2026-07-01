/**
 * Tabby 模块类型声明（shim）
 * 功能描述：为 tabby-core、tabby-terminal、tabby-settings 提供最小类型声明
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Claude
 * 修改时间：2026-06-22
 */

// tabby-core 导出声明
declare module 'tabby-core' {
  const TabbyCoreModule: any
  export default TabbyCoreModule
  export class AppService {
    activeTab: any
    openNewTab(options: any): any
    closeTab(tab: any): void
  }
  export class NotificationsService {
    error(title: string, message: string): void
    notice(title: string, message?: string): void
  }
  export class LogService {
    create(name: string): any
  }
  export class HotkeysService {
    hotkey$: any
  }
  export abstract class HotkeyProvider {
    abstract provide(): Promise<Array<{ id: string; name: string }>>
  }
  export abstract class TabContextMenuItemProvider {
    abstract getItems(): Promise<Array<{ label: string; click: () => void }>>
  }
  export abstract class TabRecoveryProvider<T = any> {
    abstract recover(token: unknown): Promise<T | null>
  }
  export interface RecoveredTab {
    type: string
    [key: string]: any
  }
  export interface RecoveryToken {
    type: string
    version: number
    state?: any
  }
  export class BaseTabComponent {
    parent: any
    title: string
    customTitle: string
    hasActivity: boolean
    icon?: string
    _injector: any
    constructor(injector: any)
    closeTab(): void
    destroy(): void
    getRecoveryToken(): Promise<RecoveryToken | null>
  }
  export class SplitTabComponent extends BaseTabComponent {
    getFocusedTab?(): any
  }
  // FileTransfer 相关
  export interface FileTransfer {
    getName(): string
    getSize?(): number
    getCompletedBytes?(): number
    getSpeed?(): number
    isComplete?(): boolean
    isCancelled?(): boolean
    cancel?(): void
  }
  export class FileUpload implements FileTransfer {
    getName(): string
    getMode(): number
    getSize(): number
    read(): Promise<Buffer>
    close(): void
    increaseProgress(bytes: number): void
    getCompletedBytes?(): number
    getSpeed?(): number
    isComplete?(): boolean
    isCancelled?(): boolean
    cancel?(): void
  }
  export class FileDownload implements FileTransfer {
    getName(): string
    getMode(): number
    getSize(): number
    write(buffer: Buffer): Promise<void>
    close(): void
    increaseProgress(bytes: number): void
    getCompletedBytes?(): number
    getSpeed?(): number
    isComplete?(): boolean
    isCancelled?(): boolean
    cancel?(): void
  }
  export class PlatformService {
    // 平台相关方法
  }
  export class ProfilesService {
    // 配置文件相关方法
  }
  export abstract class Theme {
    name: string
    css: string
    terminalBackground: string
  }
  export class ThemesService {
    findCurrentTheme(): Theme
    findTheme(name: string): Theme | null
    applyTheme(theme: Theme): void
    get themeChanged$(): import('rxjs').Observable<Theme>
  }

  /**
   * ConfigService — Tabby 配置读写核心服务
   * 用法：注入 ConfigService，通过 store['yourKey'] 读写插件配置
   */
  export class ConfigService {
    /** 配置存储代理（支持嵌套读写） */
    store: any
    /** 配置就绪后触发一次 */
    readonly ready$: import('rxjs').Observable<boolean>
    /** 配置变更时触发（含跨窗口 IPC 广播） */
    readonly changed$: import('rxjs').Observable<void>
    /** 持久化配置到 config.yaml */
    save(): Promise<void>
    /** 从文件加载配置 */
    load(): Promise<void>
  }

  /**
   * ConfigProvider — 插件声明默认配置的基类
   * 用法：继承此类，设置 defaults 属性，在 NgModule 中注册为 multi provider
   */
  export abstract class ConfigProvider {
    /** 默认配置值（嵌套对象，顶级键即为 config.yaml 中的段名） */
    defaults: any
    /** 平台特定默认值 */
    platformDefaults: Record<string, any>
  }
}

// tabby-terminal 导出声明
declare module 'tabby-terminal' {
  export class TerminalDecorator {
    attach(terminal: any): void
    subscribeUntilDetached(terminal: any, sub: any): void
  }
  export class BaseTerminalTabComponent {
    element?: any
    sshSession?: any
    profile?: any
    customTitle?: string
    title?: string
  }
}

// tabby-settings 导出声明
declare module 'tabby-settings' {
  export abstract class SettingsTabProvider {
    abstract getSettingsTabs(): Promise<Array<{
      title: string
      icon?: string
      weight?: number
      component: any
    }>>
  }
}

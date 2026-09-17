/**
 * SFTP+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 tabby-sftp-plus 配置段的默认值
 *   包含界面设置、书签、路径记忆数据
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
 * 修改人：DD1024z + Hy3 preview
 * 修改时间：2026-08-31 — 面板快捷键升级为多绑定：panelHotkeys 由 {key:string} 改为 {keys:string[]}
 *   （一动作可绑多个键，鼠标侧键以 Mouse3/Mouse4 混存其中）；新增 forward 动作项与 back 对称；
 *   默认：back=[Backspace, Mouse3]、forward=[Mouse4]，使原先硬编码的鼠标侧键变为可配置且行为不退化
 */
import { ConfigProvider } from 'tabby-core'
import type { Locale } from '../services/sftp-i18n.service'
import { MOUSE_BACK_SPEC, MOUSE_FORWARD_SPEC } from './hotkey-util'

/** 面板内置快捷键动作名；数组顺序即设置页展示顺序 */
export const PANEL_HOTKEY_ACTIONS = [
  'delete', 'rename', 'refresh', 'up', 'back', 'forward',
  // ★ 2026-08-31：右键菜单常用动作，默认留空（未绑定即不响应，行为与旧版一致）
  'upload', 'download', 'newFolder', 'newFile', 'details', 'copyPath',
] as const

/** 面板内置快捷键动作类型 */
export type PanelHotkeyAction = typeof PANEL_HOTKEY_ACTIONS[number]

/** 需经右键菜单分发（onContextMenuAction）执行的动作；其余由面板专用方法直接处理 */
export const CONTEXT_ACTION_HOTKEYS: PanelHotkeyAction[] = [
  'upload', 'download', 'newFolder', 'newFile', 'details', 'copyPath',
]

/** 面板快捷键默认值（面板端与设置端共用，避免两处漂移）；每次调用返回新对象，防止共享引用被改脏 */
export function defaultPanelHotkeys(): Record<PanelHotkeyAction, { keys: string[]; enabled: boolean }> {
  return {
    delete: { keys: ['Delete'], enabled: true },
    rename: { keys: ['F2'], enabled: true },
    refresh: { keys: ['F5'], enabled: true },
    up: { keys: ['Shift+Backspace'], enabled: true },
    back: { keys: ['Backspace', MOUSE_BACK_SPEC], enabled: true },
    forward: { keys: [MOUSE_FORWARD_SPEC], enabled: true },
    // 右键菜单动作默认留空：keys 空数组 + enabled=false（双保险，防止 config 清洗空数组后 defaults 回退）
    upload: { keys: [], enabled: false },
    download: { keys: [], enabled: false },
    newFolder: { keys: [], enabled: false },
    newFile: { keys: [], enabled: false },
    details: { keys: [], enabled: false },
    copyPath: { keys: [], enabled: false },
  }
}

export interface SftpPlusPluginConfig {
  lang: '' | Locale
  layoutMode: string
  theme: string
  colorPrimary: string
  colorBg: string
  colorText: string
  colorSurface: string
  colorBorder: string
  colorMuted: string
  tableColBorders: boolean
  tableZebra: boolean
  hideNativeSFTPButton: boolean
  /** 默认路径模式（off/remember/sync）：对未在面板上单独切换过的连接生效 */
  defaultPathMode: 'off' | 'remember' | 'sync'
  /** 默认显示隐藏文件：对从未按过眼睛按钮的面板生效 */
  defaultShowHidden: boolean
  openInNewTabByDefault: boolean
  /** 打开文件/文件夹的触发方式：'double'（默认，双击打开）或 'single'（单击打开） */
  openOnClick: 'double' | 'single'
  /** 查看器不支持的文件：开关开启时改用系统默认程序打开（而非提示不支持） */
  openUnsupportedInSystem: boolean
  /** 在内置文本白名单之外，额外允许内置编辑器打开的扩展名（小写、无点）。 */
  editableFileExtensions: string[]
  /** 忽略扩展名白名单，允许编辑所有非目录文件；二进制内容仍会受到保护。 */
  allowEditAllFiles: boolean
  /** 面板内置操作快捷键：一动作可绑多个键（keys 为空数组 = 未绑定即禁用；enabled=false 为清除双保险标志）。
   *  鼠标侧键以 Mouse3（后退）/Mouse4（前进）混存于 keys 中，与键盘键同等参与匹配。 */
  panelHotkeys: {
    delete: { keys: string[]; enabled: boolean }
    rename: { keys: string[]; enabled: boolean }
    refresh: { keys: string[]; enabled: boolean }
    up: { keys: string[]; enabled: boolean }
    back: { keys: string[]; enabled: boolean }
    forward: { keys: string[]; enabled: boolean }
  }
  /** 右键文件菜单项的显示顺序（数据驱动渲染，按此数组顺序过滤可见项） */
  contextMenuOrder: string[]
  singleWorkspaceInstance: boolean
  /** 兼容选项：选中书签后自动关闭整个浮动面板 */
  closeBookmarkPanelOnSelect: boolean
  /** 兼容选项：自定义时间格式（空串 = 默认 YYYY-MM-DD HH:mm:ss） */
  dateFormat: string
  /** 同时进行的上传数上限（1-10，默认 3）：顶层条目之间与目录内文件级均受此限制 */
  transferUploadConcurrency: number
  /** 同时进行的下载数上限（1-10，默认 3）：顶层条目之间与目录内文件级均受此限制 */
  transferDownloadConcurrency: number
  /** ★ 2026-08-11：快速模式：目录传输跳过预扫描直接开传（无百分比进度） */
  transferFastMode: boolean
  /** ★ 2026-08-28：启用 tar 打包通道加速文件夹传输（全新传输且服务端支持时自动生效） */
  transferTarAcceleration: boolean
  /** 默认上传路径（远程目标目录）；空串 = 使用当前远程目录 */
  defaultUploadPath: string
  /** 默认下载路径（本地目标目录）；空串 = 使用当前本地目录 */
  defaultDownloadPath: string
  /** 自定义文件图标：全局 SVG 资源目录（本地绝对路径），空串 = 不使用自定义图标 */
  iconResourceDir: string
  /** 自定义文件图标规则：扩展名（含点，如 .pdf）→ 资源目录内的 svg 文件名 */
  fileTypeIcons: { ext: string; svg: string }[]
  /** 被禁用的内置图标 svg 文件名列表（这些图标不会用于自动扩展名匹配） */
  disabledIconSvgs: string[]
  /** 文件夹图标 svg 文件名（空串 = 使用 emoji 📁），用于文件列表中所有目录项 */
  folderIconSvg: string
  /** ★ 2026-08-11：隐藏关于区的插件作者信息 */
  hideAuthorInfo: boolean
  paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'>
  /** 被隐藏的工具栏项 */
  paneHiddenItems: string[]
  bookmarks: any[]
  pathMemory: Record<string, any>
  transferLogs: any[]
  /** 面板 UI 状态（列设置、排序、分割比例、已保存路径等） */
  paneState: Record<string, any>
  /** 浮动面板几何（位置/尺寸/最大化），全局跨会话生效 */
  panelGeometry?: { left?: string; top?: string; width?: string; height?: string; maximized?: boolean; followWindow?: boolean }
}

export function defaultSftpPlusConfig(): SftpPlusPluginConfig {
  return {
    lang: '',
    layoutMode: 'auto',
    theme: '',
    colorPrimary: '',
    colorBg: '',
    colorText: '',
    colorSurface: '',
    colorBorder: '',
    colorMuted: '',
    tableColBorders: false,
    tableZebra: false,
    hideNativeSFTPButton: false,
    defaultPathMode: 'off',
    defaultShowHidden: false,
    openInNewTabByDefault: false,
    openOnClick: 'double',
    openUnsupportedInSystem: true,
    editableFileExtensions: [],
    allowEditAllFiles: false,
  panelHotkeys: defaultPanelHotkeys(),
    contextMenuOrder: ['upload', 'download', 'openLocal', 'viewFile', 'viewAsText', 'editFile', 'revealInExplorer', 'copy', 'cut', 'paste', 'rename', 'delete', 'chmod', 'details', 'newFolder', 'newFile', 'refresh', 'selectAll', 'selectInvert', 'copyPath'],
    singleWorkspaceInstance: true,
    closeBookmarkPanelOnSelect: false,
    dateFormat: '',
    transferUploadConcurrency: 3,
    transferDownloadConcurrency: 3,
    transferFastMode: false,
    transferTarAcceleration: true,
    defaultUploadPath: '',
    defaultDownloadPath: '',
    iconResourceDir: '',
    fileTypeIcons: [],
    disabledIconSvgs: [],
    folderIconSvg: 'folder.svg',
    hideAuthorInfo: false,
    paneCustomOrder: ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark'],
    paneHiddenItems: [],
    bookmarks: [],
    pathMemory: {},
    transferLogs: [],
    paneState: {},
    panelGeometry: {},
  }
}

export class SftpPlusConfigProvider extends ConfigProvider {
  defaults = {
    'tabby-sftp-plus': defaultSftpPlusConfig(),
    // 热键默认值：空数组 = 无默认绑定，用户在 Tabby「快捷键」页自行设置
    hotkeys: {
      'sftp-plus-toggle-panel': [],
    },
  }
}

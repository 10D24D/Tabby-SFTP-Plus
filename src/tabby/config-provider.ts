/**
 * SFTP+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 tabby-sftp-plus 配置段的默认值
 *   包含界面设置、书签、路径记忆数据
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-22 — 新增「查看器不支持时系统打开」开关（openUnsupportedInSystem）；新增面板内置操作热键配置（panelHotkeys：delete/rename/refresh/up/back，可改键，key 为空=禁用；back=历史后退，加 panelFocused 守卫避免吞噬终端 Backspace 删字）
 */
import { ConfigProvider } from 'tabby-core'
import type { Locale } from '../services/sftp-i18n.service'

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
  /** 面板内置操作热键：可改键（key 为空串 = 未绑定即禁用） */
  panelHotkeys: {
    delete: { key: string }
    rename: { key: string }
    refresh: { key: string }
    up: { key: string }
    back: { key: string }
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
    panelHotkeys: {
      delete: { key: 'Delete' },
      rename: { key: 'F2' },
      refresh: { key: 'F5' },
      up: { key: 'Shift+Backspace' },
      back: { key: 'Backspace' },
    },
    contextMenuOrder: ['upload', 'download', 'openLocal', 'viewFile', 'viewAsText', 'editFile', 'revealInExplorer', 'copy', 'cut', 'paste', 'rename', 'delete', 'chmod', 'details', 'newFolder', 'newFile', 'refresh', 'selectAll', 'selectInvert', 'copyPath'],
    singleWorkspaceInstance: true,
    closeBookmarkPanelOnSelect: false,
    dateFormat: '',
    transferUploadConcurrency: 3,
    transferDownloadConcurrency: 3,
    transferFastMode: false,
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

/**
 * SFTP+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 tabby-sftp-plus 配置段的默认值
 *   包含界面设置、书签、路径记忆数据
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-23
 *   - 新增 dateFormat 字段（兼容性：自定义时间格式）
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 新增 bookmarks、pathMemory 字段
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
  openInNewTabByDefault: boolean
  singleWorkspaceInstance: boolean
  /** 兼容选项：选中书签后自动关闭整个浮动面板 */
  closeBookmarkPanelOnSelect: boolean
  /** 兼容选项：自定义时间格式（空串 = 默认 YYYY-MM-DD HH:mm:ss） */
  dateFormat: string
  paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'>
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
    openInNewTabByDefault: false,
    singleWorkspaceInstance: true,
    closeBookmarkPanelOnSelect: false,
    dateFormat: '',
    paneCustomOrder: ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'filter', 'bookmark'],
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

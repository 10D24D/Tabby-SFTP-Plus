/**
 * SFTP+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 tabby-sftp-plus 配置段的默认值
 *   包含界面设置、书签、路径记忆数据
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 新增 bookmarks、pathMemory 字段
 */
import { ConfigProvider } from 'tabby-core'

export interface SftpPlusPluginConfig {
  lang: '' | 'zh-CN' | 'en-US'
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
  bookmarks: any[]
  pathMemory: Record<string, any>
  transferLogs: any[]
  /** 面板 UI 状态（列设置、排序、分割比例、已保存路径等） */
  paneState: Record<string, any>
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
    tableColBorders: true,
    tableZebra: true,
    hideNativeSFTPButton: false,
    bookmarks: [],
    pathMemory: {},
    transferLogs: [],
    paneState: {},
  }
}

export class SftpPlusConfigProvider extends ConfigProvider {
  defaults = {
    'tabby-sftp-plus': defaultSftpPlusConfig(),
  }
}

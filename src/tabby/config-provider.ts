/**
 * SFTP+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 tabby-sftp-plus 配置段的默认值
 *   包含界面设置、书签、路径记忆数据
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-09-29 — textCaretWidth（宽度 1–4px）→ textCaretShape（block/beam/underline 三档，
 *              与 Tabby 终端 cursor 取值逐字一致）；新增 CaretShape 类型与 normalizeCaretShape()
 *              2026-09-28 — transferTarAcceleration 替换为 transferChannelMode（smart/sftpOnly/tarOnly/preferSftp/preferTar）
 *              2026-09-20 — 面板热键新增打开/查看/编辑（默认未绑定）
 */
import { ConfigProvider } from 'tabby-core'
import type { Locale } from '../services/sftp-i18n.service'
import { MOUSE_BACK_SPEC, MOUSE_FORWARD_SPEC } from './hotkey-util'

/** 自定义文件图标规则：扩展名 → svg；name 为设置页分组/展示用规则名（可选，兼容旧配置） */
export type FileTypeIconRule = { ext: string; svg: string; name?: string }

/** 查看器自绘插入光标形状三档 —— 取值与 Tabby 终端配置 `store.terminal.cursor` **逐字一致**
 *  （block 方块 / beam 竖线 / underline 下划线），设置页字形也照宿主外观页的 █ | ▁ 来写。
 *  ★ 2026-09-29：由「宽度 1–4px」改为「形状三档」——宽度语义与宿主的分档无法对应。 */
export type CaretShape = 'block' | 'beam' | 'underline'

/** 归一化光标形状：只认三档合法值，其余（含旧配置、手工改坏的字符串）一律回落 beam（细竖线） */
export function normalizeCaretShape(value: unknown): CaretShape {
  return value === 'block' || value === 'underline' ? value : 'beam'
}

/** 面板内置快捷键动作名；数组顺序即设置页展示顺序 */
export const PANEL_HOTKEY_ACTIONS = [
  'delete', 'rename', 'refresh', 'up', 'back', 'forward',
  // ★ 2026-08-31 / 2026-09-20：右键菜单常用动作，默认留空（未绑定即不响应）
  'upload', 'download', 'openLocal', 'viewFile', 'editFile',
  'newFolder', 'newFile', 'details', 'copyPath',
] as const

/** 面板内置快捷键动作类型 */
export type PanelHotkeyAction = typeof PANEL_HOTKEY_ACTIONS[number]

/** 需经右键菜单分发（onContextMenuAction）执行的动作；其余由面板专用方法直接处理 */
export const CONTEXT_ACTION_HOTKEYS: PanelHotkeyAction[] = [
  'upload', 'download', 'openLocal', 'viewFile', 'editFile',
  'newFolder', 'newFile', 'details', 'copyPath',
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
    openLocal: { keys: [], enabled: false },
    viewFile: { keys: [], enabled: false },
    editFile: { keys: [], enabled: false },
    newFolder: { keys: [], enabled: false },
    newFile: { keys: [], enabled: false },
    details: { keys: [], enabled: false },
    copyPath: { keys: [], enabled: false },
  }
}

export interface SftpPlusPluginConfig {
  lang: '' | Locale
  layoutMode: string
  /** 面板界面字号（px），默认 13 */
  fontSize: number
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
  /** 在内置文本白名单之外，额外允许内置查看/编辑器打开的扩展名（小写、无点）；空 = 使用内置预置列表。 */
  editableFileExtensions: string[]
  /** 忽略扩展名白名单，允许查看与编辑所有非目录文件；编辑时二进制内容仍会受到保护。 */
  allowViewEditAllFiles: boolean
  /** @deprecated 已并入 allowViewEditAllFiles，保留以兼容旧配置读取 */
  allowViewAllAsText?: boolean
  /** @deprecated 已并入 allowViewEditAllFiles，保留以兼容旧配置读取 */
  allowEditAllFiles?: boolean
  /** 查看/编辑器是否显示行号（默认 true） */
  showTextLineNumbers: boolean
  /** 查看器自绘插入光标形状（默认 beam）；编辑器为系统原生光标，不受此项影响 */
  textCaretShape: CaretShape
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
  /** ★ 2026-09-28：被停用的右键菜单项集合（含文件动作 + 分组依据 groupBy；groupToggleAll 已并入分组依据子菜单，不再是独立项） */
  contextMenuDisabled: string[]
  singleWorkspaceInstance: boolean
  /** 兼容选项：选中书签后自动关闭整个浮动面板 */
  closeBookmarkPanelOnSelect: boolean
  /** 书签面板是否按「当前连接 / 全局」分组显示（关闭后可跨分组自由拖拽排序） */
  bookmarkPanelGroupByScope: boolean
  /** 分组开启时，分组块的显示顺序（仅含 connection / global） */
  bookmarkPanelGroupOrder: Array<'connection' | 'global'>
  /** 兼容选项：自定义时间格式（空串 = 默认 YYYY-MM-DD HH:mm:ss） */
  dateFormat: string
  /** 同时进行的上传数上限（1-10，默认 3）：顶层条目之间与目录内文件级均受此限制 */
  transferUploadConcurrency: number
  /** 同时进行的下载数上限（1-10，默认 3）：顶层条目之间与目录内文件级均受此限制 */
  transferDownloadConcurrency: number
  /** ★ 2026-09-28：传输通道模式（smart 智能 / sftpOnly 仅SFTP / tarOnly 仅TAR / preferSftp 优先SFTP / preferTar 优先TAR） */
  transferChannelMode: string
  /** 默认上传路径（远程目标目录）；空串 = 使用当前远程目录 */
  defaultUploadPath: string
  /** 默认下载路径（本地目标目录）；空串 = 使用当前本地目录 */
  defaultDownloadPath: string
  /** 自定义文件图标：全局 SVG 资源目录（本地绝对路径），空串 = 不使用自定义图标 */
  iconResourceDir: string
  /** 自定义文件图标规则：扩展名（含点，如 .pdf）→ 资源目录内的 svg 文件名；可选 name 为规则名 */
  fileTypeIcons: FileTypeIconRule[]
  /** 被禁用的内置图标 svg 文件名列表（这些图标不会用于自动扩展名匹配） */
  disabledIconSvgs: string[]
  /** 文件夹图标 svg 文件名（空串 = 使用 emoji 📁），用于文件列表中所有目录项 */
  folderIconSvg: string
  /** ★ 2026-08-11：隐藏关于区的插件作者信息 */
  hideAuthorInfo: boolean
  /** ★ 2026-09-07 issue #15：冲突时计算文件内容摘要（识别「mtime 变了但内容没变」） */
  conflictDigestEnabled: boolean
  /** 内容确认相同时自动跳过，不弹冲突框 */
  conflictAutoSkipSameContent: boolean
  /** 摘要计算的单文件大小上限（MB），超过则跳过计算并按冲突处理 */
  conflictDigestMaxSizeMB: number
  /** 摘要算法：sha1 兼容性最好；sha256 在部分老旧环境无对应命令 */
  conflictDigestAlgo: 'sha1' | 'sha256'
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
    fontSize: 13,
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
    allowViewEditAllFiles: false,
    showTextLineNumbers: true,
    textCaretShape: 'beam',
    panelHotkeys: defaultPanelHotkeys(),
    contextMenuOrder: ['upload', 'download', 'openLocal', 'viewFile', 'editFile', 'revealInExplorer', 'copy', 'cut', 'paste', 'rename', 'delete', 'chmod', 'details', 'newFolder', 'newFile', 'refresh', 'selectAll', 'selectInvert', 'copyPath'],
    contextMenuDisabled: [],
    singleWorkspaceInstance: true,
    closeBookmarkPanelOnSelect: false,
    bookmarkPanelGroupByScope: true,
    bookmarkPanelGroupOrder: ['connection', 'global'],
    dateFormat: '',
    transferUploadConcurrency: 3,
    transferDownloadConcurrency: 3,
    transferChannelMode: 'smart',
    defaultUploadPath: '',
    defaultDownloadPath: '',
    iconResourceDir: '',
    fileTypeIcons: [],
    disabledIconSvgs: [],
    folderIconSvg: 'folder.svg',
    hideAuthorInfo: false,
    conflictDigestEnabled: true,
    conflictAutoSkipSameContent: true,
    conflictDigestMaxSizeMB: 256,
    conflictDigestAlgo: 'sha1',
    paneCustomOrder: ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark'],
    paneHiddenItems: [],
    bookmarks: [],
    // ★ 2026-09-14 F1 审计修复：pathMemory 仅作老备份导出/导入兼容字段保留（业务无写入方，勿删）
    // ★ 2026-09-20 N4 审计修复：与 paneState 同款 __nonStructural 标记，避免嵌套写入静默不落盘的同类陷阱
    pathMemory: { __nonStructural: true } as Record<string, any>,
    transferLogs: [],
    // ★ 2026-09-14 F1 审计修复：__nonStructural 标记让 ConfigProxy 把空对象按「非结构成员」处理——
    //   首次读取（real 无值）时执行 real[key]=clone 并剥离标记（Tabby 官方自举模式），
    //   之后 paneState 下的深路径写入（perHost 路径记忆/布局/列宽等）才会真正落盘。
    //   无此标记时空对象默认被当叶子成员，getter 返回脱离 _store 的临时克隆，深写永不持久化。
    paneState: { __nonStructural: true } as Record<string, any>,
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

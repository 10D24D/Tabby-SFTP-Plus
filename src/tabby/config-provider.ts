/**
 * SFTP+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 tabby-sftp-plus 配置段的默认值
 *   包含界面设置、书签、路径记忆数据
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-23 — 新增 conflictRenameStyle（冲突重命名风格 seq/time/random，默认 seq）：
 *              interface 与 defaults 同时登记 —— 只写 interface 不写 defaults 会让 ConfigProxy 不建
 *              accessor，写进 store 也不落盘（重启回默认）。
 *              续三十六：新增 applySettingsInstantly（设置页保存后立即推送 / 需重开面板生效）。
 *              新增 BookmarkSortMode（manual/usage/name）与 bookmarkSortMode 配置项，替代原 bookmarkSortByUsage 布尔（老值仍可折算，normalizeBookmarkSortMode）；defaultPathMode 联合类型加 'mirror'。
 *              2026-10-20 — 补登记 panelOpacity（10-19 只加了设置页、漏了本文件 ⇒ ConfigProxy 无 accessor ⇒ 写不落盘，
 *              用户实测「改完透明度重启又回 100%」）；同时补齐只读兼容键 allowViewAllFiles / paneHeaderOrder /
 *              paneToolbarOrder / transferTarAcceleration（缺 defaults 时兼容读取恒 undefined，老配置升级后丢值）。
 *              同日续：contextMenuOrder 默认数组补 'transfer'（右键菜单两端同类时的「传输」项；
 *              该数组是白名单，漏登记 ⇒ 菜单项永远不显示）；随后按用户要求把 'transfer' 排到首位
 *              （两端同类时 upload/download 都不显示，它独占该槽，放最上面符合使用习惯）。
 *              同日续（续三十一）：新增 connLabelStyle（顶栏连接显示 别名 / 账号@地址，默认 account）；
 *              同样必须进 defaults —— 否则设置页写的是 proxy 实例属性、重启即回默认值。
 *              2026-10-22（续）：新增 editorAutoUploadExternal（「在系统中编辑」外部保存后自动上传开关，默认 false = 走方案 B 提示）。
 *              2026-10-19 — P2-26 修复：SftpPlusPluginConfig.panelHotkeys 的类型从「手写 6 个动作」
 *              改为 Record<PanelHotkeyAction, …>，与 defaultPanelHotkeys() 返回的 15 个动作对齐
 *              2026-10-08 — 新增 showTextWordWrap（查看器/编辑器长行自动换行，默认 false = 横向滚动）
 *              2026-09-29 — textCaretWidth（宽度 1–4px）→ textCaretShape（block/beam/underline 三档，
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

/**
 * ★ 2026-10-22（Deepseek-V4.1-Flash）：书签排序三档
 *   manual = 拖拽顺序 / usage = 使用频率降序 / name = 名称升序（数字按自然序，忽略大小写）。
 */
export type BookmarkSortMode = 'manual' | 'usage' | 'name'

/**
 * 归一化书签排序：合法三档直接用；老配置只有 bookmarkSortByUsage 布尔 ⇒ true 折算 'usage'。
 * 手工改坏的字符串一律回落 'manual'（拖拽顺序），不抛错。
 */
export function normalizeBookmarkSortMode(value: unknown, legacyByUsage?: unknown): BookmarkSortMode {
  if (value === 'usage' || value === 'name' || value === 'manual') return value
  return legacyByUsage === true ? 'usage' : 'manual'
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
  defaultPathMode: 'off' | 'remember' | 'sync' | 'mirror'
  /**
   * ★ 2026-10-22 续三十六（Deepseek-V4.1-Flash）：设置页保存后是否立即推送到已打开的 SFTP+ 面板。
   *   true（默认）= 广播 `sftp-plus-settings-changed` 后面板当场重读；false = 面板忽略该广播，
   *   需关闭并重开面板才生效（给「一次改很多项、不想被中途刷新打断」的场景用）。
   *   ⛔ 必须在 defaults 里登记，否则 ConfigProxy 不为它建 accessor ⇒ 写了也落不了盘。
   */
  applySettingsInstantly: boolean
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
  /** @deprecated 已并入 allowViewEditAllFiles（最早的四合一键），保留以兼容旧配置读取 */
  allowViewAllFiles?: boolean
  /** @deprecated 已并入 paneCustomOrder，旧版「栏头部顺序」扁平键，仅兼容读取 */
  paneHeaderOrder?: string[]
  /** @deprecated 已并入 paneCustomOrder，旧版「栏工具栏顺序」扁平键，仅兼容读取 */
  paneToolbarOrder?: string[]
  /** @deprecated 已由 transferChannelMode 取代（false→sftpOnly），仅兼容读取 */
  transferTarAcceleration?: boolean
  /** 查看/编辑器是否显示行号（默认 true） */
  showTextLineNumbers: boolean
  /** ★ 2026-10-08：查看器/编辑器长行是否自动换行（默认 false = 长行横向滚动查看完整内容）。
   *  查看器侧为「按可用列宽切行」，编辑器侧为 textarea 的软换行（开启时隐藏行号栏）。 */
  showTextWordWrap: boolean
  /** 查看器自绘插入光标形状（默认 beam）；编辑器为系统原生光标，不受此项影响 */
  textCaretShape: CaretShape
  /**
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：「在系统中编辑」外部保存后自动上传到服务器（方案 A 开关）。
   *   默认 false（关闭）→ 走方案 B 的醒目提示，让用户手动点「立即上传」，避免静默覆盖远端 / SSH 通道打满。
   *   开启后由面板控制器在外部保存且文件稳定后自动调用 saveEditor() 上传；遇远端冲突时降级为方案 B 提示，
   *   绝不静默覆盖。无论开关与否，方案 B 的提示始终作为安全网存在。
   */
  editorAutoUploadExternal: boolean
  /** 面板内置操作快捷键：一动作可绑多个键（keys 为空数组 = 未绑定即禁用；enabled=false 为清除双保险标志）。
   *  鼠标侧键以 Mouse3（后退）/Mouse4（前进）混存于 keys 中，与键盘键同等参与匹配。
   *  ★ 2026-10-19 P2-26 修复：原先这里只写了 6 个 old 动作（delete/rename/refresh/up/back/forward），
   *    而 defaultPanelHotkeys() 实际返回 PANEL_HOTKEY_ACTIONS 全部 15 个 ⇒ 接口与默认值不一致，
   *    面板/设置页按 `SftpPlusPluginConfig` 类型访问 upload/viewFile/newFolder… 等后加动作时
   *    TS 报「属性不存在」，只能就地 `as any` 绕开（类型层与实际数据脱节，改名/漏配不再报错）。
   *    统一按 PanelHotkeyAction 全集声明，与 defaultPanelHotkeys() 及两处消费端口径一致。 */
  panelHotkeys: Record<PanelHotkeyAction, { keys: string[]; enabled: boolean }>
  /** 右键文件菜单项的显示顺序（数据驱动渲染，按此数组顺序过滤可见项） */
  contextMenuOrder: string[]
  /** ★ 2026-09-28：被停用的右键菜单项集合（含文件动作 + 分组依据 groupBy；groupToggleAll 已并入分组依据子菜单，不再是独立项） */
  contextMenuDisabled: string[]
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏（右上角操作按钮）定制。
   *   order    —— 全量顺序（面板顶栏与 ⋯ 菜单同序）
   *   pinned   —— 固定在顶栏的项；其余项在 overflow=true 时收进 ⋯ 菜单
   *   overflow —— 折叠菜单总开关；false 时未固定项**全部平铺**（不折叠）
   *   必须在本 schema 里登记：ConfigProxy 只持久化已知字段，漏登记 = 写了也不落盘。
   */
  topBarOrder: string[]
  topBarPinned: string[]
  topBarOverflow: boolean
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器的唤起方式。
   *   'topbar'        —— 只认顶栏连接标题（默认，历史行为）
   *   'terminalBadge' —— 只认终端工具栏上的 SFTP+ 标识（点它 → 面板顶上弹出切换器）
   *   'both'          —— 两者都可用
   *   必须在这里登记：ConfigProxy 只持久化 schema 已知字段。
   */
  connPickerTrigger: string
  /**
   * ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash，用户诉求「顶栏连接显示的信息，用别名还是账号@地址」）：
   *   'account' —— 账号@地址（默认，与历史行为一致；例如 `root@42.194.230.244`）
   *   'alias'   —— Tabby 配置连接的名字（例如「泰山派3M」「Aliyun」）；没有名字时回落账号@地址。
   *   只影响**顶栏文案**：`hostInfo` / `_leftHostLabel` 仍是 `user@host`，书签锚定连接身份、
   *   传输日志的源/目标主机名全部按它们取，绝不能塞别名（否则同一台机会被当成两个连接）。
   *   必须在这里登记：ConfigProxy 只持久化 schema 已知字段。
   */
  connLabelStyle: 'account' | 'alias'
  singleWorkspaceInstance: boolean
  /** 兼容选项：选中书签后自动关闭整个浮动面板 */
  closeBookmarkPanelOnSelect: boolean
  /** ★ 2026-10-16：键入定位——在文件列表中直接敲字母/数字，按文件名前缀跳转选中（默认开）。
   *  关闭后这些字符不再被面板消费（交还终端/系统），符合「不想让面板吃掉单键」的用户预期。 */
  typeAheadEnabled: boolean
  /** 书签面板是否按「局部 / 全局」分组显示（关闭后可跨分组自由拖拽排序） */
  bookmarkPanelGroupByScope: boolean
  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：「联动书签」开关 —— 开启后书签表单可填联动路径，
   *   点击书签时另一栏也跳到该路径。★ 2026-10-20：默认改为**开**（用户要求）。 */
  bookmarkLinkEnabled: boolean
  /**
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：书签排序方式（三档，取代原来的 bookmarkSortByUsage 布尔）。
   *   manual = 手动拖拽顺序（默认，可拖拽）；usage = 使用频率降序；name = 按名称排序。
   * ⛔ 老配置里的 `bookmarkSortByUsage: true` 仍会被读取并折算成 'usage'
   *   （见面板 _readBehaviorConfig 与设置页导入），不要直接删兼容分支——否则老用户升级后排序被打回手动。
   */
  bookmarkSortMode: BookmarkSortMode
  /**
   * @deprecated ★ 2026-10-22（Deepseek-V4.1-Flash）：**只读兼容键**，已被 bookmarkSortMode 取代。
   * ⛔ 必须留在 defaults 里：ConfigProxy 只对 defaults 出现过的键建 accessor，
   *   缺了它老用户 config.yaml 里的 `bookmarkSortByUsage: true` 读出来恒 undefined ⇒
   *   「升级后书签排序被打回手动」。本插件不再写入此键（新值一律进 bookmarkSortMode）。
   */
  bookmarkSortByUsage: boolean
  /**
   * ★ 2026-10-20（Deepseek-V4.1-Flash）：面板整体不透明度（0.5–1，默认 1）。
   * ⛔ 必须在 defaults 里出现，ConfigProxy 才会为它建立 accessor —— 缺了就是「写了不落盘」：
   *   赋值会落到 proxy 实例而非 _store，`save()` 时 JSON.stringify 看不到它，重启即丢
   *   （2026-10-19 加这个字段时只改了设置页、漏了本文件，用户实测「改完重启又变回 100%」）。
   */
  panelOpacity: number
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
  /**
   * ★ 2026-10-23：冲突「重命名」的命名风格。
   *   `seq` 序号堆叠（默认，`报告 (1).docx`）/ `time` 时间戳（`报告_20261023-103512.docx`）
   *   / `random` 随机后缀（`报告_A1B2C3D4.docx`，旧行为）。
   *   ⛔ 存 string 而非联合字面量：读配置时统一走 normalizeConflictRenameStyle()，
   *     否则旧 config.yaml / 手工改坏的值会让类型断言变成谎话。
   */
  conflictRenameStyle: string
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
    applySettingsInstantly: true,
    defaultShowHidden: false,
    openInNewTabByDefault: false,
    openOnClick: 'double',
    openUnsupportedInSystem: true,
    editableFileExtensions: [],
    allowViewEditAllFiles: false,
    // ★ 2026-10-09 审计根治：下面两个 @deprecated 兼容键原先**只存在于 interface、没有进 defaults**
    //   （默认值对象里缺席）。而宿主的 ConfigProxy 只对 defaults 里出现过的键 defineProperty，
    //   于是 `target.allowEditAllFiles = x` 走的是原生属性赋值 —— 值落在 ConfigProxy **实例**上
    //   而不在 real（_store）里 ⇒ save() 时 JSON.stringify(_store) 根本看不到它
    //   ⇒ 设置页里「兼容旧字段：同步写入，避免回退旧版插件时丢失开关状态」的意图完全无效。
    //   修法不是删掉这两行写入（那会真的丢掉回退兼容），而是**把键补进 defaults**，
    //   让 ConfigProxy 为它们建立真正的 accessor，写入才会进 _store 并落盘。
    //   取值与 allowViewEditAllFiles 保持一致（false），避免旧键与新键语义漂移。
    allowEditAllFiles: false,
    allowViewAllAsText: false,
    // ★ 2026-10-20（Deepseek-V4.1-Flash）：同名四合一兼容键此前只读没登记，老配置里的 true 读不出来
    allowViewAllFiles: false,
    // ★ 2026-10-20：旧版栏布局扁平键（仅兼容读；空数组表示「没有旧数据」）
    paneHeaderOrder: [],
    paneToolbarOrder: [],
    // ★ 2026-10-20：旧「TAR 加速」布尔（迁移时 false → transferChannelMode=sftpOnly）
    transferTarAcceleration: true,
    showTextLineNumbers: true,
    showTextWordWrap: false,
    textCaretShape: 'beam',
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：外部编辑自动上传开关，默认关（走方案 B 提示）
    editorAutoUploadExternal: false,
    panelHotkeys: defaultPanelHotkeys(),
    contextMenuOrder: ['transfer', 'upload', 'download', 'openLocal', 'viewFile', 'editFile', 'revealInExplorer', 'copy', 'cut', 'paste', 'rename', 'delete', 'chmod', 'details', 'newFolder', 'newFile', 'refresh', 'selectAll', 'selectInvert', 'copyPath'],
    contextMenuDisabled: [],
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮默认「全部固定 + 折叠关闭」= 与历史行为一致。
    //   文案 id 必须与 sftp/core/top-bar-items.ts 的 DEFAULT_TOP_BAR_* 一致（此处写死字面量是为了
    //   让 config schema 保持零依赖；两处都由 TOP_BAR_ITEMS 派生，改 id 时两处一起改）。
    topBarOrder: ['pathMode', 'layout', 'transferLog', 'settings', 'minimize', 'maximize'],
    topBarPinned: ['pathMode', 'layout', 'transferLog', 'settings', 'minimize', 'maximize'],
    topBarOverflow: false,
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：默认只认顶栏连接标题 = 与历史行为一致
    connPickerTrigger: 'topbar',
    // ★ 2026-10-20 续三十一：顶栏连接默认显示「账号@地址」= 与历史行为一致
    connLabelStyle: 'account',
    singleWorkspaceInstance: true,
    closeBookmarkPanelOnSelect: false,
    typeAheadEnabled: true,
    bookmarkPanelGroupByScope: true,
    bookmarkLinkEnabled: true,
    bookmarkSortMode: 'manual',
    // ★ 2026-10-22：只读兼容键（老版本的布尔排序开关，升级时折算进 bookmarkSortMode）
    bookmarkSortByUsage: false,
    // ★ 2026-10-20：面板不透明度默认 1（不透明）；缺这一行会导致设置值不落盘
    panelOpacity: 1,
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
    // ★ 2026-10-23：冲突重命名默认「序号堆叠」（旧行为是随机后缀，用户反馈事后找不到文件）
    conflictRenameStyle: 'seq',
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

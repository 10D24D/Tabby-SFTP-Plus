# SFTP+ — Tabby 双栏 SFTP 文件管理器

SFTP+ 是为 [Tabby Terminal](https://tabby.sh/) 开发的 SFTP 文件管理插件，提供双栏（本地↔远程）文件管理器、书签系统、传输日志和多语言支持。

## 功能特性

- **双栏文件管理** — 左右分栏，左侧本地文件系统、右侧远程 SFTP 目录，拖拽上传下载
- **书签系统** — 三级作用域：全局书签（所有连接可见）、连接书签（仅当前 SSH 连接可见）、本地书签
- **传输日志** — 记录所有上传/下载/删除操作，支持按类型筛选和 JSON 导出
- **浮动面板** — 以 overlay 形式覆盖在终端上方，每个 Tab 独立隔离
- **主题跟随** — 默认跟随 Tabby 系统主题（亮/暗），也可在设置中选择独立配色
- **i18n 国际化** — 中文（简体）和 English，五级回退策略
- **灵活列配置** — 可自由显示/隐藏文件大小、修改时间、权限列；支持列宽拖拽调整
- **右键菜单** — 文件列表和表头均提供右键快捷菜单
- **特殊文件操作** — 支持远程 chmod 权限编辑、显示/隐藏隐藏文件

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Angular 9 |
| 语言 | TypeScript 5.8 |
| 构建 | Webpack 5 |
| 样式 | 内联 CSS（CSS 变量 + 自适应回退） |
| 平台依赖 | tabby-core ^1.0.163, tabby-settings ^1.0.163, tabby-terminal ^1.0.163 |
| 传输协议 | SFTP（通过 Tabby SSH Session） |
| 本地文件 | Node.js `fs` / `path` / `os` 模块 |
| 包管理 | npm |

## 目录结构

```
tabby-FTPS+/
├── package.json                 # 项目配置、依赖声明
├── tsconfig.json                # TypeScript 编译配置
├── webpack.config.js            # Webpack 构建配置（external tabby 核心模块）
├── README.md                    # 本文件
├── dist/                        # 构建输出（npm run build）
│   └── index.js                 #   插件入口打包产物
└── src/                         # 源码目录
    ├── index.ts                 #   插件入口 — Angular Module 注册
    ├── sftp-floating-panel.component.ts  #   主面板组件（模板+样式+逻辑）
    ├── sftp-terminal-decorator.ts #   终端装饰器 — 注入 SFTP+ 按钮，管理面板生命周期
    ├── sftp.service.ts          #   SFTP 连接服务 — 封装 SSH Session 的 SFTP 操作
    ├── sftp-bookmarks.service.ts#   书签服务 — 三级作用域书签 CRUD
    ├── sftp-transfer-log.service.ts #   传输日志服务 — 记录和查询传输历史
    ├── sftp-i18n.service.ts     #   国际化服务 — 多语言翻译，五级回退
    ├── sftp-settings.component.ts #   设置页 — 语言/主题/颜色/列配置
    ├── local-transfers.ts       #   本地文件传输适配器 — 实现 FileUpload/FileDownload
    └── tabby-shims.d.ts         #   Tabby 内部模块类型声明
```

## 源码文件说明

### `src/index.ts` — 插件入口

注册 Angular Module，声明组件（`SftpFloatingPanel`、`SftpSettingsTabComponent`），提供 Tabby 扩展点：

- `TerminalDecorator` → `SftpTerminalDecorator`（注入 SFTP+ 按钮）
- `SettingsTabProvider` → `SftpSettingsTabProvider`（设置页入口）

### `src/sftp-terminal-decorator.ts` — 终端装饰器

- 在终端工具栏注入 `📂 SFTP+` 按钮
- 监听按钮点击，动态创建浮动面板组件
- 管理面板生命周期（打开/关闭/清理）
- 从当前 Tab 的 SSH Session 获取连接信息传给面板

### `src/sftp-floating-panel.component.ts` — 主面板组件

**插件最核心的文件**，包含：

- **模板（template）** — 完整的 HTML 结构：标题栏、双栏文件列表、传输队列、书签弹窗、对话框、右键菜单
- **样式（styles）** — 内联 CSS，使用 CSS 变量实现自适应暗/亮主题
- **逻辑（class）** — 文件浏览、选择、排序、拖拽、右键菜单、传输管理、书签交互等全部业务逻辑

### `src/sftp.service.ts` — SFTP 连接服务

- 封装 Tabby SSH Session 的 SFTP 子通道
- 提供统一接口：`readdir`、`mkdir`、`unlink`、`rename`、`upload`、`download`、`chmod`
- 类型定义：`SFTPFile`、`SFTPSessionLike`、`SSHSessionLike`

### `src/sftp-bookmarks.service.ts` — 书签服务

- 基于 `localStorage` 持久化
- 三级作用域：`global`（全局）、`connection`（按 `user@host` 键隔离）
- 书签类型：`local`（本地路径）、`remote`（远程路径）

### `src/sftp-transfer-log.service.ts` — 传输日志服务

- 记录所有文件操作的元信息（时间、类型、路径、大小、耗时、是否成功）
- 支持内存存储 + `localStorage` 备份（最多 500 条）
- 提供筛选和清空方法

### `src/sftp-i18n.service.ts` — 国际化服务

- 支持 `zh-CN` 和 `en-US` 两种语言
- 五级回退策略：SFTP+ 设置 > localStorage > Tabby 系统语言 > 浏览器语言 > `zh-CN`
- 模板语法支持：`{{ key }}` 占位符替换

### `src/sftp-settings.component.ts` — 设置页

- 语言选择（中文/English）
- 主题预设：Follow（跟随系统）、Dark、Light、Green、Purple、Red
- 自定义主色/背景色/文字色（颜色选择器）
- 文件列表列可见性（大小/时间/权限）
- 表格样式（列边框、斑马纹）

### `src/local-transfers.ts` — 本地文件传输适配器

- 实现 `FileUpload` 和 `FileDownload` 接口
- 桥接本地文件系统和 Tabby 的 SFTP 传输管道
- 支持进度回调和取消操作

### `src/tabby-shims.d.ts` — Tabby 类型声明

- 为 Tabby 内部模块（`tabby-core`、`tabby-terminal` 等）提供 TypeScript 类型声明
- 弥补官方包类型不完整的问题

## 界面分区说明

浮动面板由以下区域组成：

```
┌─────────────────────────────────────────────┐
│  SFTP+  user@host           📋日志  ✕关闭   │ ← top-bar（标题栏）
├───────────────────┬─────────────────────────┤
│ 🖥 本地  [路径栏]   │ 🌐 远程  [路径栏]        │ ← pane-title（面板标题）
│ ⬆⌂🔍★             │ ⬆⌂🔍★                   │   pane-actions（操作按钮行）
│ [过滤输入框]        │ [过滤输入框]              │ ← pane-filters（过滤栏，默认隐藏）
│ ─────────────────  │ ─────────────────────── │
│ │ 名称 ↑↓ 大小 时间 │ │ 名称 ↑↓ 大小 时间 权限  │ ← entry.header（表头行，sticky）
│ │ 📁 docs          │ │ 📁 home               │
│ │ 📄 readme.md     │ │ 📄 .bashrc            │ ← entry（文件行，支持斑马纹）
│ │ 📁 src           │ │ 📁 www                │
│ │ ...              │ │ ...                   │
│                   │                         │ ← pane-list（文件列表，可滚动）
│ 选中 2 项   [操作按钮]│ 选中 0 项   [操作按钮]    │ ← pane-actions-bar（底部操作栏）
├───────────────────┴─────────────────────────┤
│ ↑ file.txt  ████████░░ 45%   ✕              │ ← sftp-transfers（传输队列）
└─────────────────────────────────────────────┘
```

### 分区名称对照

| 分区名称 | 对应 CSS 类 | 说明 |
|---------|-----------|------|
| **标题栏** | `.top-bar` | 顶部栏，显示插件名、主机信息、日志入口、关闭按钮 |
| **面板 (Pane)** | `.pane` | 左/右两个独立面板，各含自己的标题、列表、操作栏 |
| **面板标题** | `.pane-title` | 显示面板标签（本地/远程）、路径输入框、快捷按钮 |
| **操作按钮行** | `.pane-actions` | 显示隐藏文件、返回上级、主目录、过滤、书签按钮 |
| **过滤栏** | `.pane-filters` | 文件过滤输入框，点击放大镜按钮切换显示 |
| **文件列表** | `.pane-list` | 可滚动的文件条目容器 |
| **表头行** | `.entry.header` | sticky 置顶，显示列名和排序箭头，右键可切换列 |
| **文件行** | `.entry` | 单行文件/文件夹条目，支持单击选择、双击进入、拖拽 |
| **底部操作栏** | `.pane-actions-bar` | 显示已选数量和新建/重命名/删除按钮 |
| **传输队列** | `.sftp-transfers` | 文件上传/下载进度条列表 |
| **书签弹窗** | `.bookmark-popup` | 浮动定位的弹出菜单，列出书签并支持添加 |
| **对话框** | `.dialog` / `.overlay` | 删除确认、输入对话框、权限编辑等模态层 |
| **右键菜单** | `.context-menu` | `position: fixed` 的浮动菜单 |
| **传输日志** | `.log-dialog` | 传输历史记录弹窗 |

## 构建与开发

```bash
# 安装依赖
npm install

# 开发模式（watch 自动构建）
npm run watch

# 生产构建
npm run build
```

构建产物 `dist/index.js` 即为 Tabby 插件包，放入 Tabby 插件目录并重启即可加载。

## 配色方案

插件使用 CSS 变量实现多级回退的配色策略：

```
SFTP+ 自定义颜色 (--sftp-*)
  → Tabby 主题变量 (--body-bg, --text-color, --primary-color, ...)
    → 自适应回退值（兼容亮色与暗色模式）
```

在设置页可以：
- 选择预设主题（Dark / Light / Green / Purple / Red）
- 手动设置主色调、背景色、文字色
- 选择 "Follow" 让插件完全跟随 Tabby 主题

## License

MIT — 作者 DD1024z

## 说明

> 本插件的功能想法由作者（DD1024z）提供，主要实现代码使用 AI 自动编码生成。
> 如果你遇到任何问题或有功能建议，欢迎提交 [Issue](https://github.com/10D24D/Tabby-SFTP-Plus/issues) 或 Pull Request。

## 免责声明

> 本插件按「原样」提供，不附带任何明示或暗示的担保。作者不对因使用本插件而导致的任何直接或间接损失承担责任。使用本插件即表示您同意自行承担风险。

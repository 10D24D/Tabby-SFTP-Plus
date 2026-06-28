# SFTP+ 架构文档

> 创建人：DD1024z + Deepseek-V4-Flash
> 创建时间：2026-06-25

## 概述

SFTP+ 是为 Tabby Terminal 开发的 SFTP 文件管理插件，采用**浮动面板（Overlay Panel）**架构，以非侵入方式嵌入终端界面。插件不修改 Tabby 核心代码，而是通过 Tabby 提供的扩展点（`TerminalDecorator`、`SettingsTabProvider`）实现集成。

## 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                  Tabby Terminal Host                           │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  tabby-core / tabby-terminal / tabby-settings           │   │
│  └──────────────┬──────────────────────┬──────────────────┘   │
│                 │ TerminalDecorator    │ SettingsTabProvider   │
│                 ▼                      ▼                      │
│  ┌────────────────────────┐  ┌────────────────────────┐       │
│  │ SftpTerminalDecorator  │  │ SftpSettingsTabProvider │       │
│  │  - 注入 SFTP+ 按钮      │  │  - 注册设置页入口        │       │
│  │  - 管理面板生命周期       │  │  - 语言/主题/列配置     │       │
│  │  - 获取 SSH 会话信息     │  └────────────────────────┘       │
│  └───────────┬────────────┘                                     │
│              │ 动态创建                                          │
│              ▼                                                   │
│  ┌────────────────────────┐                                      │
│  │  SftpFloatingPanel     │  ← Angular Component                 │
│  │  (overlay DIV)         │                                      │
│  └────┬───────┬───────┬──┘                                      │
│       │       │       │                                          │
│       ▼       ▼       ▼                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐                                     │
│  │ 服   │ │ 服   │ │ 适   │                                      │
│  │ 务层 │ │ 务层 │ │ 配器 │                                      │
│  └──────┘ └──────┘ └──────┘                                     │
└──────────────────────────────────────────────────────────────┘
```

## 模块层级

### 第 1 层 — 入口层 (`index.ts`)

Angular Module 的注册入口。声明组件、提供 Tabby 扩展点。

```typescript
@NgModule({
  declarations: [SftpFloatingPanel, SftpSettingsTabComponent],
  entryComponents: [SftpFloatingPanel],
  providers: [
    { provide: TerminalDecorator, useClass: SftpTerminalDecorator, multi: true },
    { provide: SettingsTabProvider, useClass: SftpSettingsTabProvider, multi: true },
  ],
})
export class SftpPlusModule {}
```

| 扩展点 | 实现类 | 职责 |
|--------|--------|------|
| `TerminalDecorator` | `SftpTerminalDecorator` | 在终端工具栏注入 SFTP+ 按钮，管理浮动面板生命周期 |
| `SettingsTabProvider` | `SftpSettingsTabProvider` | 在 Tabby 设置页注册 SFTP+ 配置入口 |

### 第 2 层 — 装饰器层 (`sftp-terminal-decorator.ts`)

连接 Tabby 终端与浮动面板的桥梁。

- **按钮注入**：DOM 操作将 SFTP+ 按钮插入到终端工具栏（优先放到 Reconnect 按钮旁，否则追加到末尾）
- **SSH 会话检测**：创建后最多轮询 20 次（每次 500ms，共 10 秒），直到检测到有效的 SSH 会话
- **面板生命周期**：
  ```
  ┌─────────┐  点击按钮   ┌──────────┐  再次点击   ┌──────────┐
  │ 未初始化  │ ────────→ │ 面板打开   │ ────────→ │ 面板关闭   │
  └─────────┘            └──────────┘            └──────────┘
                              │ 最小化按钮             │
                              ▼                       │
                          ┌──────────┐                │
                          │ 最小化    │ ───────────────┘
                          └──────────┘  取消最小化
  ```
- **组件动态挂载**：使用 `ComponentFactoryResolver` + `ApplicationRef.attachView()` 将组件挂在独立的 DOM 容器中，通过 `ngZone.run()` 确保变更检测在 Angular zone 内执行

### 第 3 层 — 面板层 (`sftp-floating-panel.component.ts`)

**插件最核心的文件**（约 2700 行），包含完整的双栏文件管理器 UI 与业务逻辑。

组件内部结构：

```
SftpFloatingPanel 组件
├── 模板（内联 template 字符串）
│   ├── top-bar（标题栏：插件名 + 主机信息 + 日志入口 + 关闭按钮）
│   ├── 主内容区
│   │   ├── 本地 Pane（左栏）
│   │   │   ├── pane-title（标签 + 路径栏 + 操作按钮）
│   │   │   ├── pane-filters（过滤栏，默认隐藏）
│   │   │   ├── pane-list（文件列表，含 sticky 表头）
│   │   │   └── pane-actions-bar（底部操作栏）
│   │   └── 远程 Pane（右栏，同上结构）
│   ├── sftp-transfers（传输进度队列）
│   ├── bookmark-popup（书签弹窗）
│   ├── context-menu（右键菜单）
│   ├── log-dialog（传输日志弹窗）
│   └── dialog overlay（输入框/确认/权限编辑等模态框）
├── 样式（内联 CSS）
│   └── 全部使用 CSS 变量，支持亮/暗主题自适应
└── 类逻辑
    ├── 本地文件操作（cd/ls/mkdir/rename/delete/copy/move）
    ├── 远程 SFTP 操作（通过 SftpConnectionService）
    ├── 选中与多选管理
    ├── 拖拽上传/下载
    ├── 排序与过滤
    ├── 列配置管理
    ├── 传输队列管理
    ├── 书签操作
    ├── 右键菜单逻辑
    ├── 键盘快捷键（方向键/回车/Delete/F5...）
    └── 响应式布局（<=580px 切换上下布局）
```

### 第 4 层 — 服务层

四个纯 TypeScript 服务类，不依赖 Angular DI，通过 `new XxxService()` 直接实例化。

| 服务 | 文件 | 职责 |
|------|------|------|
| `SftpConnectionService` | `sftp.service.ts` | 封装 Tabby SSH Session 的 SFTP 操作 |
| `SftpBookmarksService` | `sftp-bookmarks.service.ts` | 书签 CRUD，localStorage 持久化 |
| `SftpTransferLogService` | `sftp-transfer-log.service.ts` | 传输日志记录与查询 |
| `SftpI18nService` | `sftp-i18n.service.ts` | 国际化翻译，五级语言回退 |

### 第 5 层 — 适配器层 (`local-transfers.ts`)

桥接本地文件系统与 Tabby SFTP 传输管道的适配器。

| 类 | 用途 | 关键接口 |
|----|------|---------|
| `LocalPathFileUpload` | 从本地文件读取数据供 SFTP 上传 | `FileTransfer` |
| `LocalPathFileDownload` | 接收 SFTP 下载数据写入本地文件 | `FileTransfer` |

## 数据流

### 面板启动流程

```
用户点击 SFTP+ 按钮
    │
    ▼
SftpTerminalDecorator.openFloatingPanel()
    │
    ├── 1. 检查 SSH 是否有效（轮询等待最多 10s）
    │       └── 无效 → 显示 "No SSH session" 提示
    │
    ├── 2. 创建 overlay 容器 DIV
    │
    ├── 3. 通过 ComponentFactory 创建 SftpFloatingPanel 实例
    │
    ├── 4. 传入配置：hostKey, profileName, sshSession
    │
    ├── 5. 调用 panel.initialize() 初始化
    │       ├── 读取本地路径
    │       ├── 连接远程 SFTP
    │       ├── 列出文件
    │       └── 挂载拖拽事件
    │
    └── 6. 挂载到 DOM + 定位（包含顶部工具栏高度补偿）
```

### 用户操作数据流

```
用户操作 (点击/拖拽/快捷键)
    │
    ▼
SftpFloatingPanel 事件处理器
    │
    ├── 本地操作 ──→ fs/path (Node.js 内置模块)
    │                  └── 更新本地 fileList
    │
    ├── 远程操作 ──→ SftpConnectionService
    │                  └── SSH Session.openSFTP()
    │                       └── SFTP 协议操作
    │
    ├── 书签操作 ──→ SftpBookmarksService
    │                  └── localStorage
    │
    ├── 传输操作 ──→ local-transfers.ts (FileUpload/Download)
    │                  └── SftpTransferLogService → localStorage
    │
    ├── 语言切换 ──→ SftpI18nService
    │                  └── localStorage('sftp-plus-locale')
    │
    └── UI 配置  ──→ 直接读写 localStorage
```

## 初始化流程

```
SftpFloatingPanel
    │
    ├── constructor()
    │   ├── 初始化 i18n 服务
    │   ├── 初始化书签服务
    │   ├── 初始化传输日志服务
    │   └── 初始化连接服务
    │
    ├── initializeConnection()
    │   ├── 从 hostKey 解析连接信息
    │   ├── 读取路径记忆设置
    │   ├── cd(本地路径) → 列出本地文件
    │   └── openSFTP() → cd(远程路径) → 列出远程文件
    │
    └── ngAfterViewInit()
        ├── 注册 ResizeObserver（响应式布局）
        ├── 注册全局点击事件（关闭弹出层）
        ├── 加载列宽记忆
        └── 初始化传输事件绑定
```

## 关键设计决策

### 1. 为什么服务不通过 Angular DI 注入？

面板组件是通过 `ComponentFactoryResolver` 动态创建的，不在 Angular 的组件树中，会导致 NG0202 循环依赖错误。因此所有服务都通过 `new XxxService()` 直接实例化。只有 Tabby 核心服务（`ConfigService`、`NotificationsService`、`HostAppService`）通过 `Injector.get()` 获取。

### 2. 为什么使用浮动面板而不是 Tab 页？

浮动面板可以覆盖在终端之上，保持终端上下文可见。用户无需切换标签页即可在 SSH 会话中快速执行文件操作，工作流更连续。

### 3. 为什么列宽存储在独立键中？

列宽需要按面板独立（本地列宽 ≠ 远程列宽），因此使用 `sftp-plus-col-widths` 统一存储所有列宽，用列名作为键，本地和远程共用同一组列宽配置。

### 4. 响应式布局策略

使用 `ResizeObserver` 监听面板宽度：
- **> 580px**：左右并排布局（默认）
- **≤ 580px**：上下堆叠布局（窄屏模式）
- 在上下布局下，用户可通过拖拽分割条调整上下区域比例

### 5. 事件监听策略

- 使用 `document.addEventListener` 的**捕获阶段**（`true`）监听点击，确保弹出层（右键菜单、书签弹窗）在外部点击时正确关闭
- 使用自定义事件 `sftp-plus-settings-changed` 让设置页通知面板重载配置
- 拖拽使用原生 HTML5 Drag & Drop API

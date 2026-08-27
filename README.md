# SFTP+ — Tabby 双栏 SFTP 文件管理器

| [中文](https://github.com/10D24D/Tabby-SFTP-Plus/blob/main/README.md) | [English](https://github.com/10D24D/Tabby-SFTP-Plus/blob/main/README.en.md) |

[![Version](https://img.shields.io/github/package-json/v/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=版本&color=7B68EE)](https://github.com/10D24D/Tabby-SFTP-Plus)
[![Stars](https://img.shields.io/github/stars/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=Stars&color=orange)](https://github.com/10D24D/Tabby-SFTP-Plus/stargazers)
[![License](https://img.shields.io/github/license/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=License&color=green)](https://github.com/10D24D/Tabby-SFTP-Plus)

SFTP+ 是 [Tabby Terminal](https://tabby.sh/) 的插件，为 SSH 终端标签页提供**双栏 SFTP 文件管理**功能，支持**书签系统**、**路径记忆**、**拖拽上传下载**、传输日志、文件冲突处理、权限编辑等，无需离开终端即可完成文件操作。

---

## 📋 功能一览

| 类别 | 功能 |
|------|------|
| **📂 双栏管理** | 左本地 + 右远程，可切换 水平/垂直/自适应/单栏 四种布局；分割线可拖拽调整，双击恢复默认 |
| **👁️ 查看 / 编辑** | 内置文本/图片查看器与文本编辑器（本地+远程）；图片支持同目录上一张/下一张导航；支持「复制」「复制选中」；文本查看器/编辑器支持右键复制、剪切、粘贴、全选；支持「以文本方式查看」和「在系统中打开/编辑」 |
| **🎨 文件图标** | 内置彩色 SVG 文件/文件夹图标；支持按扩展名自定义映射、自定义图标目录、禁用内置图标和替换文件夹图标 |
| **🔄 拖拽传输** | 跨栏拖拽即上传/下载，支持文件夹递归传输；<br />支持从系统资源管理器/桌面拖入到本地或远程面板 |
| **⬆️ 右键传输** | 本地面板右键上传、远程面板右键下载（多选批量） |
| **⚡ 高速传输** | 目录内多文件并行传输（并发数 1-10 可调）；海量小文件走 tar 打包通道（本地打包→单文件传输→对端解包），大幅减少网络往返；批量删除优先 SSH `rm -rf` / `fs.rm(recursive)` |
| **🔖 书签系统** | 全局书签（所有连接可见）+ 连接书签（仅当前 SSH 可见），拖拽排序 |
| **📋 传输日志** | 记录所有操作历史，含「编辑加载/编辑保存」分类，支持筛选、统计、JSON 导出 |
| **⚡ 传输控制** | 进度条显示（含百分比）、暂停/继续/取消、断点续传、实时速度 |
| **⚠️ 冲突处理** | 文件冲突时弹出对比界面（显示上传⬆/下载⬇方向），支持覆盖/跳过/重命名，可批量操作；覆盖合并有独立进度面板 |
| **🔐 权限编辑** | 远程文件 chmod — 3×3 勾选框 + 八进制预览 |
| **📌 右键菜单** | 上传/下载、查看/编辑、新建/重命名/删除、复制/剪切/粘贴、刷新、全选/反选；文本查看器/编辑器提供文本专用右键菜单；<br />表头右键：列显隐/列宽调整/面板边框与斑马纹切换 |
| **🔍 过滤排序** | 关键词过滤、多列排序（点击列头）、可配置显示列 |
| **🧭 路径模式** | 三选一：`off` / `remember`（路径记忆）/ `sync`（与终端同步）；可设默认值 |
| **🎨 主题系统** | 7 种预设 + 自定义配色，支持跟随 Tabby 系统主题 |
| **⌨️ 面板快捷键** | 可自定义面板开关快捷键，支持录制/清除/冲突提示 |
| **🌐 国际化** | 中文（简体）与 English，自动检测 Tabby/浏览器语言 |
| **📦 数据备份** | 一键导出/导入全部数据（书签+日志+设置+路径记忆） |

---

## 🖥️ 界面导览

| ![SFTP+ 操作面板](assets/SFTP-Plus_UI_Panel.png) | ![SFTP+ 设置界面](assets/SFTP-Plus_UI_Config.png) |
| :---------------------------------------------: | :---------------------------------------------: |

### 界面分区

| 区域 | 说明 |
|------|------|
| **标题栏** | 插件名称、当前 SSH 连接信息、布局切换、传输日志入口、最小化/关闭 |
| **左/右面板** | 各自独立浏览，支持路径输入、导航按钮、书签、过滤 |
| **文件列表** | 显示文件和目录，支持多列排序、列宽拖拽、列顺序调整 |
| **底部操作栏** | 显示选中项数量和总大小 |
| **传输队列** | 实时展示上传/下载进度、速度、剩余时间，支持暂停/继续/取消 |
| **书签弹窗** | 按「连接书签」和「全局书签」分组，支持拖拽排序和快速跳转 |
| **右键菜单** | 文件/表头右键弹出，提供完整文件操作和列配置入口 |
| **传输日志** | 历史记录弹窗，支持类型筛选、成功/失败过滤、JSON 导出 |

---

## 📥 安装

1. 确保已安装 [Tabby Terminal](https://tabby.sh/)
2. 在 Tabby 设置中配置插件目录
3. 将构建产物放入插件目录（参见下方「开发」），重启 Tabby
4. 打开任意 SSH 终端标签页，工具栏出现 **SFTP+** 按钮即安装成功

---

## 🚀 快速上手

1. **打开** — 在 SSH 终端标签页的工具栏点击 `SFTP+` 按钮
2. **浏览** — 左侧本地文件系统、右侧远程 SFTP 目录，双击进入目录
3. **传输** — 拖拽、右键上传/下载，或选中后使用右键菜单
4. **查看/编辑** — 右键文本或图片文件可内置查看；文本可编辑并保存（远程文件自动上传）

---


## 📏 文件大小限制

| 操作 | 上限 |
|------|------|
| 文本查看 | 2 MB |
| 图片查看 | 15 MB |
| 文本编辑 | 5 MB |

超出上限时仍会提示，并说明具体限制。

---


## ⚙️ 设置面板

在 Tabby 设置页左侧找到「SFTP+」：

| 设置项 | 说明 |
|--------|------|
| **语言** | 跟随系统 / 中文 / English |
| **主题** | 自动 / 深色 / 浅色 / 蓝 / 绿 / 紫 / 红 / 自定义 |
| **自定义颜色** | 独立设置主色、背景、文字、边框颜色 |
| **布局** | 自适应（按面板宽度自动切换）/ 水平 / 垂直 |
| **表格样式** | 显示边框、显示斑马纹 |
| **上传/下载并发数** | 目录内文件级并发数（1-10），即时生效 |
| **快速模式** | 开启后跳过预扫描直接传输（无百分比，有字节进度） |
| **默认上传/下载路径** | 分别设置上传目标目录和下载目标目录；留空时使用当前面板目录 |
| **默认路径模式** | 新连接首次打开面板时的路径模式（off / remember / sync） |
| **默认显示隐藏文件** | 新连接首次打开面板时是否显示隐藏文件 |
| **文件图标** | 选择图标资源目录、配置扩展名映射、禁用内置图标和替换文件夹图标 |
| **工具栏自定义** | 拖拽排序工具栏按钮、隐藏不常用项 |
| **面板快捷键** | 自定义面板开关快捷键 |
| **数据备份** | 导出/导入全部数据（JSON）；清除全部数据（输入 `DELETE` 确认） |
| **兼容性** | 隐藏 Tabby 原生 SFTP 按钮避免冲突 |

---

## 💾 数据备份

所有数据（书签、传输日志、路径记忆、设置）可一键导出为 JSON 文件，也支持导入恢复。

路径：设置页 → 数据备份 → 导出 / 导入

---

## 📜 版本历史

当前开发版本 **v2.1.0**（2026-08-27）— [完整更新日志](CHANGELOG.md)

---

## 🛠️ 开发

### 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Angular 9 |
| 语言 | TypeScript 5.8 |
| 构建 | Webpack 5 |
| 样式 | 内联样式（CSS 变量自适应主题） |
| 平台依赖 | `tabby-core` / `tabby-settings` / `tabby-terminal` |
| 传输协议 | SFTP（复用 Tabby SSH Session） |

### 构建

```bash
# 安装依赖
npm install

# 开发模式（watch 自动构建）
npm run watch

# 生产构建
npm run build
```

构建产物 `dist/index.js` 即为 Tabby 插件包；`dist/package.json` 由 `scripts/copy-sftp-manifest.mjs` 在构建时从根 `package.json` 自动派生（改写入口、剔除开发期脚本），**无需手工维护**。

### 项目结构

```
tabby-FTPS+/
├── docs/                                # 架构与开发文档
├── scripts/                             # 构建辅助（copy-sftp-manifest 自动生成 dist/package.json）
├── src/
│   ├── index.ts                         # 插件入口（Angular Module 注册）
│   ├── tabby-shims.d.ts                 # Tabby 类型声明
│   ├── services/                        # sftp.service / bookmarks / i18n / transfer-log / config（Tabby 约定目录）
│   ├── settings/                        # sftp-settings 设置组件（Tabby 约定目录）
│   ├── tabby/                           # 终端集成：config/hotkey provider、terminal-decorator（工具栏注入按钮）
│   ├── sftp/                            # SFTP 功能模块
│   │   ├── sftp-floating-panel.component.ts   # 主面板（业务编排）
│   │   ├── sftp-workspace-tab.component.ts    # 工作区独立标签页容器
│   │   ├── components/                  # 视图层(V)：文件列表面板、对话框、右键菜单、冲突处理、传输队列等
│   │   ├── controllers/                 # 控制器层(C)：列 / 查看器 / 书签控制器
│   │   └── core/                        # 逻辑/工具/类型：传输、冲突、拖放、剪贴板、路径等
│   └── tabby-plugin-common/             # 跨插件公共工具（theme / utils）
├── dist/                                # 构建输出（index.js + package.json）
├── package.json
└── webpack.config.js
```

更完整的目录说明见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

---

## 🤝 如何贡献

欢迎为 SFTP+ 贡献代码或建议！本插件功能想法由作者（DD1024z）提供，主要实现代码使用 AI 辅助生成。

- 提交 Bug 或功能请求：[GitHub Issues](https://github.com/10D24D/Tabby-SFTP-Plus/issues) 📝
- 贡献代码：Fork 项目并提交 Pull Request 🚀
- 喜欢 SFTP+？可以帮忙点个 [⭐ Star](https://github.com/10D24D/Tabby-SFTP-Plus) 支持一下！

您的点赞与 Star 是我持续开发的动力，感谢支持！❤️

## 🙏 特别鸣谢

SFTP+ 的成长离不开基石项目与社区用户的支持，在此特别感谢：

- [Tabby](https://tabby.sh/) — 强大的跨平台终端，SFTP+ 得以在其生态内运行
- [SFTP（SSH File Transfer Protocol）](https://en.wikipedia.org/wiki/SSH_File_Transfer_Protocol) — 底层文件传输协议，本插件的远程文件管理能力构建于此之上
- [Tabby SFTP-UI](https://github.com/growingupfirst/tabby-sftp-ui) — 早期双栏 SFTP 文件管理器，其交互与实现思路为 SFTP+ 提供了重要参考，部分功能设计受其启发
- [@fweiger](https://github.com/fweiger) — Issue #13 提交了详尽的使用体验优化建议（单击/双击交互、右键菜单排序、快捷键聚焦等），多项已落地 v2.0.2
- [@HarpyWar](https://github.com/HarpyWar) — Issue #3 反馈热键设置页异常，已修复
- [@xingkongxiademodeng](https://github.com/xingkongxiademodeng) — Issue #10 指出目录上传串行无并发的性能瓶颈，为并发传输优化提供方向
- [@Hanzo-Huang](https://github.com/Hanzo-Huang) — Issue #5 提出「获取当前工作目录」功能建议，已实现
- 同时感谢 [@webbrain-one](https://github.com/webbrain-one)、[@JayceVane](https://github.com/JayceVane) 提交 Pull Request 的贡献尝试

## 📝 许可协议

SFTP+ 遵循 [MIT](LICENSE) 开源协议。欢迎使用、修改和分享，但请遵守协议条款。

## ⚠️ 免责声明

SFTP+ 是一个免费的开源项目，主要使用 AI 辅助生成，难免存在一些 BUG 缺陷，作者无法保证功能代码验证到位。使用本插件即表示你同意承担相关风险，开发者不对因使用插件导致的任何问题或损失负责，请酌情使用。

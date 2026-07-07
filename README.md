# SFTP+ — Tabby 双栏 SFTP 文件管理器

| [中文](README.md) | [English](README.en.md) |

[![Version](https://img.shields.io/github/package-json/v/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=版本&color=7B68EE)](https://github.com/10D24D/Tabby-SFTP-Plus)
[![Stars](https://img.shields.io/github/stars/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=Stars&color=orange)](https://github.com/10D24D/Tabby-SFTP-Plus/stargazers)
[![License](https://img.shields.io/github/license/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=License&color=green)](https://github.com/10D24D/Tabby-SFTP-Plus)

SFTP+ 是 [Tabby Terminal](https://tabby.sh/) 的插件，为 SSH 终端标签页提供**双栏 SFTP 文件管理**功能，支持**书签系统**、**路径记忆**、**拖拽上传下载**、传输日志、文件冲突处理、权限编辑等，无需离开终端即可完成文件操作。

---

## 📋 功能一览

| 类别 | 功能 |
|------|------|
| **📂 双栏管理** | 左本地 + 右远程，可切换 水平/垂直/自适应/单栏 四种布局；分割线可拖拽调整，双击恢复默认 |
| **👁️ 查看 / 编辑** | 内置文本/图片查看器与文本编辑器（本地+远程）；支持「在系统中打开/编辑」 |
| **🔄 拖拽传输** | 跨栏拖拽即上传/下载，支持文件夹递归传输；<br />支持从系统资源管理器/桌面拖入到本地或远程面板 |
| **⬆️ 右键传输** | 本地面板右键上传、远程面板右键下载（多选批量） |
| **🔖 书签系统** | 全局书签（所有连接可见）+ 连接书签（仅当前 SSH 可见），拖拽排序 |
| **📋 传输日志** | 记录所有操作历史，含「编辑加载/编辑保存」分类，支持筛选、统计、JSON 导出 |
| **⚡ 传输控制** | 进度条显示、暂停/继续/取消、断点续传、实时速度 |
| **⚠️ 冲突处理** | 文件冲突时弹出对比界面，支持覆盖/跳过/重命名，可批量操作 |
| **🔐 权限编辑** | 远程文件 chmod — 3×3 勾选框 + 八进制预览 |
| **📌 右键菜单** | 上传/下载、查看/编辑、新建/重命名/删除、复制/剪切/粘贴、刷新、全选/反选；<br />表头右键：列显隐/列宽调整/面板边框与斑马纹切换 |
| **🔍 过滤排序** | 关键词过滤、多列排序（点击列头）、可配置显示列 |
| **🧭 路径记忆** | 开关控制，重新打开面板时恢复上次浏览位置 |
| **🎨 主题系统** | 7 种预设 + 自定义配色，支持跟随 Tabby 系统主题 |
| **🌐 国际化** | 中文（简体）与 English，自动检测 Tabby/浏览器语言 |
| **📦 数据备份** | 一键导出/导入全部数据（书签+日志+设置+路径记忆） |

---

## 🖥️ 界面导览

![SFTP+ 操作面板](assets/SFTP-Plus_UI_Panel.png) 

![SFTP+ 设置界面](assets/SFTP-Plus_UI_Config.png) 

---

## ⚙️ 安装

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


## 💾 数据备份

所有数据（书签、传输日志、路径记忆、设置）可一键导出为 JSON 文件，也支持导入恢复。

路径：设置页 → 数据备份 → 导出 / 导入

---

## 📜 版本历史

最新版本 **v1.1.0**（2026-07-07）— [完整更新日志](CHANGELOG.md)

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

构建产物 `dist/index.js` 即为 Tabby 插件包。

### 项目结构

```
tabby-FTPS+/
├── docs/                                # 架构与开发文档
├── src/
│   ├── index.ts                         # 插件入口（Angular Module 注册）
│   ├── sftp-floating-panel.component.ts # 主面板（业务编排，模板+逻辑）
│   ├── sftp-workspace-tab.component.ts  # 工作区独立标签页容器
│   ├── sftp-terminal-decorator.ts       # 终端工具栏注入 SFTP+ 按钮
│   ├── panel/                           # 从主面板拆出的子模块
│   │   ├── sftp-file-pane.component.ts  # 本地/远程文件列表面板
│   │   ├── sftp-context-menu.component.ts
│   │   ├── sftp-viewer-dialog.component.ts
│   │   ├── sftp-editor-dialog.component.ts
│   │   ├── panel-conflict-resolver.ts
│   │   ├── panel-transfer-runtime.ts
│   │   └── …                            # 详见 docs/DEVELOPMENT.md
│   ├── sftp.service.ts                  # SFTP 连接封装
│   ├── sftp-transfer-log.service.ts     # 传输日志
│   └── …
├── dist/                                # 构建输出（index.js）
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

## 📝 许可协议

SFTP+ 遵循 [MIT](LICENSE) 开源协议。欢迎使用、修改和分享，但请遵守协议条款。

## ⚠️ 免责声明

SFTP+ 是一个免费的开源项目。使用本插件即表示你同意承担相关风险。开发者不对因使用插件导致的任何问题或损失负责。

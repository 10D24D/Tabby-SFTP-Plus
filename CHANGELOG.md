# Changelog

All notable changes to **tabby-sftp-plus** will be documented in this file.

## [1.0.4] — 2026-07-05

### 📄 文档

- **README 全面重写** — 结构重组为用户引导优先（功能→界面导览→快速上手→设置），新增 badge 行（含 GitHub 链接）、UI 截图双列表格排版、简化版权声明
- **英文文档** — 新增 `README.en.md`，与中文版间双向跳转链接
- **CHANGELOG** — 新增版本发布历史文档
- **开发文档更新** — `DEVELOPMENT.md` 移除已废弃的 scripts/ 目录引用

---

## [1.0.1] — 2026-07-05

### ✨ 新增

- **配置持久化** — 新增 `sftp-config-provider.ts`，书签、设置、路径记忆等配置统一持久化到 Tabby config.yaml
- **书签系统优化** — 支持连接级书签隔离、书签拖拽排序、全局/连接分组展示
- **传输日志增强** — 记录操作类型扩展（upload/download/delete/rename/mkdir/chmod），支持按 profileName 筛选，上限提升至 1000 条
- **UI 截图** — `assets/` 目录新增主面板和设置页截图
- **英文文档** — 新增 `README.en.md`，与中文版间双向跳转链接

### 🎨 改进

- **README 全面重写** — 结构重组为用户引导优先（功能→界面导览→快速上手→设置），新增 badge 行、UI 截图双列表格排版、简化版权声明
- **新增「关于」区域** — 设置页 About 区添加 GitHub Star 链接、意见反馈入口
- **英文文档** — 新增 `README.en.md`，与中文版间双向跳转链接
- **CHANGELOG** — 新增版本发布历史文档
- **开发文档更新** — `DEVELOPMENT.md` 移除已废弃的 scripts/ 目录引用
- **设置页 UI 调整** — 主题选择改为卡片式、颜色编辑器优化

### 🔧 技术

- **提取公共模块** — `tabby-plugin-common/` 抽取公用工具函数（`theme.ts`、`utils.ts`）
- **代码清理** — 移除废弃的 Python 脚本（`restore_settings.py`、`update_decorator_minimize.py`、`update_settings_layout.py`）

### 📦 完整文件变更

<details>
<summary>展开查看（与 v1.0.0 相比）</summary>

```
A  README.en.md
A  assets/SFTP-Plus_UI_Config.png
A  assets/SFTP-Plus_UI_Panel.png
A  tabby-plugin-common/src/index.ts
A  tabby-plugin-common/src/theme.ts
A  tabby-plugin-common/src/utils.ts
M  .gitignore
M  README.md
M  package.json
M  src/index.ts
M  src/sftp-bookmarks.service.ts
M  src/sftp-config-provider.ts
M  src/sftp-floating-panel.component.ts
M  src/sftp-i18n.service.ts
M  src/sftp-settings.component.ts
M  src/sftp-terminal-decorator.ts
M  src/sftp-transfer-log.service.ts
M  src/sftp.service.ts
M  src/tabby-shims.d.ts
M  tsconfig.json
M  webpack.config.js
D  restore_settings.py
D  update_decorator_minimize.py
D  update_settings_layout.py
```

</details>

---

## [1.0.0] — 2026-06-28

首个可用发布。基于 Tabby SSH Session 的 SFTP 通道实现完整文件管理功能。

### 核心功能

| 类别 | 说明 |
|------|------|
| **双栏文件管理** | 左本地 + 右远程，支持水平/垂直/自适应三种布局 |
| **拖拽传输** | 跨栏拖拽即上传/下载，支持文件夹递归传输 |
| **书签系统** | 全局书签（所有连接可见）+ 连接书签（按 SSH 隔离），支持拖拽排序 |
| **传输日志** | 记录所有文件操作，支持类型筛选、成功/失败过滤、JSON 导出（上限 500 条） |
| **传输控制** | 实时进度条、暂停/继续、断点续传、传输速度显示 |
| **文件冲突处理** | 冲突时左右对比界面，支持覆盖/跳过/重命名，可批量操作 |
| **权限编辑** | 远程文件 chmod — 3×3 勾选框 + 八进制实时预览 |
| **右键菜单** | 文件列表：新建文件/文件夹/重命名/删除/复制/剪切/粘贴/刷新/全选/反选；表头右键：列显隐/列宽调整/面板边框/斑马纹切换 |
| **过滤排序** | 关键词过滤、多列排序（点击列头）、可配置列显隐 |
| **路径记忆** | 开关控制，重新打开面板时恢复上次浏览位置 |
| **主题系统** | 7 种预设（Auto/Dark/Light/Blue/Green/Purple/Red）+ 自定义配色，支持跟随 Tabby 系统主题 |
| **国际化** | 中文（简体）与 English，五级回退策略（设置 > localStorage > Tabby 系统语言 > 浏览器语言 > 默认） |
| **数据备份** | 一键导出/导入全部数据（书签 + 日志 + 设置 + 路径记忆） |
| **隐藏原生 SFTP** | 兼容性设置中可选隐藏 Tabby 自带 SFTP 按钮，避免冲突 |

---

## 版本发布流程

```bash
# 1. 更新 package.json 版本号
# 2. 提交版本变更
git commit -m "chore: bump to v<version>"
git tag v<version>
# 3. 构建
npm run build
# 4. 发布到 npm（如有）
npm publish
```

---

本格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 规范。

# Changelog

All notable changes to **tabby-sftp-plus** will be documented in this file.

## [2.0.0] — 2026-07-25

### ✨ 新增

- **路径模式三选一** — `off` / `remember`（路径记忆）/ `sync`（与终端同步）。`sync` 模式打开面板即定位到终端当前目录，终端 `cd` 时远程面板实时跟随（依赖 Tabby 已内置的 OSC 1337 `CurrentDir` 上报 + `session.getWorkingDirectory`）；默认 **off**，可在面板内切换。拿不到 cwd 时弹出上报设置引导。

### 🐛 修复

- **取消不再残留半截文件** — 上传/下载取消时正确清理 `.tabby-upload` 临时文件与底层流，取消后的不完整文件会被删除而非遗留。
- **上传暂停不再误删文件** — 暂停改为保留临时文件，仅取消才删除；续传基于临时文件实际大小。
- **上传暂停并发修复** — 暂停不再关闭文件句柄，避免与进行中的读取竞争导致误删临时文件 / `EBADF` 异常；各 `read`/`finish`/`error` 分支统一安全闭合 fd，新增 `isPaused()` 安全分支。
- **输入框聚焦** — 新建/重命名聚焦输入框自身；重命名仅聚焦、不高亮全选。
- **窗口缩放即时跟随** — resize 期间挂 `sftp-plus-suppress-transition` 类禁用全站过渡，消除面板缓慢位移 / 收缩。
- **拆分终端多面板互不遮挡** — 面板挂载到 `document.body` 并以 `position: fixed` 严格贴合各 pane 矩形，支持多个拆分终端并行打开各自面板；移除 z-index 依赖。
- **分割调节线 hover 才显示** — 蓝条默认 `opacity:0`，仅 `:hover`/`.active` 时显示。

### 🔧 技术 / 构建

- **`dist/package.json` 自动生成** — 新增 `scripts/copy-sftp-manifest.mjs`，`npm run build` 后从根 `package.json` 派生（改写 `main` 为 `index.js`、剔除开发期脚本与 `devDependencies`，UTF-8 无 BOM），消除手工维护漂移与中文乱码。
- 版本号 bump 至 **2.0.0**。

### ⚠️ 已知限制

- 默认路径模式为 `off`；希望打开即显示终端当前目录的用户，需在面板中将路径模式切到「与终端同步」。已写入 `localStorage` 的旧模式记录不会被新默认覆盖（清掉 `sftp-plus-path-mode.*` 即可恢复默认行为）。
- 文件夹递归传输的子文件冲突、大目录虚拟滚动等架构级项仍待后续版本（参见历史架构文档）。

---

## [1.1.0] — 2026-07-07

### ✨ 新增

- **内置查看 / 编辑** — 本地与远程文本、图片支持右键「查看」「编辑」；远程文件先下载到临时目录再编辑，保存后上传回服务器
- **在系统中打开 / 编辑** — 查看器与编辑器底部可调用系统默认程序；编辑器监听临时文件变更，外部保存后可回传提交
- **右键上传 / 下载** — 本地面板可上传选中项到当前远程目录，远程面板可下载到当前本地目录
- **工作区标签页** — 支持将 SFTP+ 面板固定为独立 Tab（`SftpWorkspaceTabComponent`），适合长时间文件管理
- **传输记录分类** — 新增「编辑加载」「编辑保存」类型（`edit-download` / `edit-upload`），与普通上传/下载区分显示与筛选
- **面板分割线提示** — 悬停显示拖拽说明；双击恢复 50:50 默认比例（拖拽后不会误触发重置）

### 🎨 改进

- **架构拆分** — 主面板 UI 与子逻辑拆至 `src/panel/`（文件列表面板、右键菜单、冲突处理、传输运行时、查看/编辑对话框等），主组件更易维护
- **右键菜单** — 上传/下载置顶；查看/编辑、剪贴板、重命名等分组与顺序优化；新建文件/文件夹在空白区域也可用
- **冲突检测策略** — 上传/下载/拖拽采用边传输边检测（类 Windows 资源管理器）；粘贴仍先全量扫描再执行
- **过大文件提示** — 超出查看/编辑上限时菜单仍可用，点击后对话框与 Toast 明确说明限制
- **滚轮隔离** — 传输记录、查看器、编辑器内滚动不再穿透到底层文件列表
- **工具栏** — 收紧 SFTP+ 按钮间距

### 🐛 修复

- **编辑器外部保存** — 修复「在系统中编辑」后保存按钮仍禁用、或提交时覆盖外部修改的问题（`fs.watch` + 保存前同步磁盘）
- **冲突键过滤** — 修正批量冲突解决后跳过项的键匹配逻辑（上传/下载 pending 流程重构时遗留问题已移除）
- **传输记录滚动** — 修复列表滚到顶/底时误触发背后面板滚动

### 📄 文档

- 更新 `README.md` / `README.en.md` 功能说明与项目结构
- 更新 `docs/ARCHITECTURE.md`、`docs/DEVELOPMENT.md` 反映 `panel/` 模块与新组件

### ⚠️ 已知限制

- 文件夹递归传输时，**子文件**冲突仍可能在传输过程中逐项提示（顶层多选已优化为边传边检）
- 文本查看上限 2MB、图片 15MB、文本编辑 5MB；二进制文件不支持内置编辑
- 内置编辑器与外部程序同时修改同一临时文件时，后保存者会覆盖先保存者

---

## [1.0.5] — 2026-07-06

### 🐛 修复

- **框选（Rubber Band）** — 修复面板缩窄或列宽调整后框选矩形无法正确显示/收缩的问题；改用 JS 动态创建选框、优化列表区 `min-width` 与滚动条布局，框选与拖拽不再互相干扰
- **列宽调整** — 修复拖拽列分隔线时宽度无法正确收缩的问题（直接写入面板列宽属性，避免修改临时对象）
- **书签弹窗** — 修复箭头被裁切、位置偏移问题；打开书签时对应星标按钮显示选中态
- **断点续传写入位置** — 修复本地下载续传时可能从错误偏移写入的问题，确保 `writeSync` 按已完成字节继续写盘
- **连接释放** — 关闭 SSH 会话对应的 SFTP 时正确调用子通道 `end()`，避免会话泄漏
- **连接生命周期** — 重连/断开时释放 SFTP 缓存并清空远程列表；SSH 断开自动清理；`connect()` 失败弹出通知
- **远程元数据** — 按可见列跳过不必要的 `readDirectory`/`stat`/`getent`；所有者解析改为后台非阻塞，避免刷新卡顿
- **远程创建时间** — SFTP 无 birthtime，远程侧禁用「创建时间」列与排序
- **目录冲突** — 修复上传目录冲突时误执行下载覆盖本地源的问题
- **刷新竞态** — 远程列表刷新增加序号校验，避免快速切换目录时列表错乱
- **冲突检测** — 相同大小与修改时间的文件不再弹冲突框
- **传输** — 断连时 cancel 底层流；无进度 15 分钟后超时；0 字节文件日志补全

### ✨ 新增

- **置顶文件夹** — 表头右键菜单新增「置顶文件夹」（默认开启），目录列表排序时文件夹优先
- **操作系统拖放** — 支持从资源管理器/桌面拖入文件或文件夹到本地或远程面板（上传/复制到当前目录）；兼容 Electron `File.path` 与 `webUtils.getPathForFile()`
- **设置页构建信息** — About 区新增构建时间显示，便于确认是否加载最新构建
- **配置同步能力** — 书签与传输日志服务新增 `reload()` / 导入覆盖能力，支持多面板与导入后的状态刷新

### 🎨 改进

- **远程刷新体验** — `refreshRemote()` 采用延迟 150ms 显示 loading，避免快速刷新时 spinner 闪烁导致“变慢”观感
- **拖放交互反馈** — 新增面板级拖入高亮边框（`pane-list-wrap`），并修复横向滚动时高亮错位
- **框选性能** — 框选命中计算改为缓存 + `requestAnimationFrame` 节流 + 二分行区间查找，降低大目录卡顿
- **列表渲染性能** — 选中态引入 `Set` O(1) 查询、过滤结果缓存与 `trackBy`，减少模板重复计算与重绘
- **传输进度性能** — 由单任务计时器改为共享轮询计时器，统一更新速度/进度，降低并发传输开销
- **冲突检测效率** — 优先使用远程 `stat` 查询单文件存在性与元数据，减少 `readdir` 整目录扫描
- **设置页生命周期** — 清理事件监听器（`ngOnDestroy`），避免重复挂载导致的内存与行为问题

---

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

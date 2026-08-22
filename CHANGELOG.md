# Changelog

All notable changes to **tabby-sftp-plus** will be documented in this file.

| [中文](CHANGELOG.md) | [English](CHANGELOG.en.md) |

## [2.0.2] — 2026-08-22

### 🐛 修复

- **批量覆盖/跳过/重命名只剩第一条被处理（重入锁回归）** — 2026-08-15 引入的 `_processing` 重入锁使 `resolve('overwrite-all'/'skip-all'/'rename-all')` 持锁调用 `processNext()` 时被守卫直接拦截，导致批量模式下**仅第一条被处理、剩余队列静默卡死**（冲突对话框已隐藏、传输进度不动）。修复：拆出无锁的 `_drainQueue()` 递归排空整个队列，`resolve` / `processNext` 仅持锁后调用它。
- **上传冲突检测逐文件 stat（性能）** — 同目录多文件上传原每个文件独立 `stat` + `readdir`，N 个文件 = N 次网络往返。修复：按 `parentDir` 缓存一次 `readdir` 结果（并发单飞），目录内所有文件复用同一份 listing，仅在 listing 缺 `size`/`mtime` 字段时对该单文件回退 `stat`。
- **Backspace 在终端被面板抢去做路径回退（issue #13 P4）** — `document:keydown` 全局监听的「历史后退」原硬编码为普通 `Backspace` 且未走 `panelHotkeys` 配置，焦点落在终端 xterm 时仍触发 `localBack()/remoteBack()` 并 `preventDefault()` 吞掉删字。修复：历史后退纳入 `panelHotkeys.back` 配置（默认 `Backspace`、可改键/清空禁用），且**仅在面板自身获得焦点时生效**；焦点在终端时 `Backspace` 正常删字。

### ✨ 新增

- **面板热键 `back`（历史后退）** — 设置页「面板操作热键」新增 `back` 项，与 `delete`/`rename`/`refresh`/`up` 一同可在设置页录制/清除/改键；24 语言自动回退英文基线。
- **文件/文件夹打开方式** — 新增 `openOnClick` 设置：`double`（默认，双击打开）或 `single`（单击打开）；单击模式下双击仍可用。
- **查看器不支持时系统打开** — 新增 `openUnsupportedInSystem` 开关（默认开）：查看器无法预览的文件改用系统默认程序打开，而非仅提示不支持。
- **面板操作热键改键 UI** — `delete`/`rename`/`refresh`/`up`/`back` 全部可在设置页录制/清除/改键（key 为空 = 禁用），`back` 默认 `Backspace`、`up` 默认 `Shift+Backspace`。
- **右键菜单顺序自定义** — 新增 `contextMenuOrder` 配置，右键文件菜单改为数据驱动渲染，按配置数组顺序过滤可见项；设置页可调整顺序并重置。
- **传输设置子分类** — 设置页新增「传输设置」子分类，归并上传/下载并发数与快速传输模式；`fastMode` 中文标签改为「快速传输模式」。
- **书签当前路径高亮** — 书签悬浮菜单中，路径与当前面板目录一致的书签项高亮（本地路径按 Windows 大小写不敏感匹配）。

## [2.0.1] — 2026-08-15

### ✨ 新增

- **目录内文件级并发** — 新增 `ConcurrencyLimiter`（`src/sftp/core/concurrency.ts`），目录内多文件并行传输，并发数 1-10 可调（默认 3），复用现有 `transferUploadConcurrency` / `transferDownloadConcurrency` 设置。ssh2 SFTP 按请求 ID 多路复用，无需多开连接。
- **tar 打包传输通道** — 海量小文件目录走「本地 `tar czf` → SFTP 单文件传输 → 对端 `tar xzf`」路径，大幅减少网络往返。三态返回值（`success`/`fallback`/`failed`）保证安全回退。仅目标不存在（全新传输）时启用，合并/覆盖场景保留逐文件通道。
- **批量删除提速** — 远程目录优先 SSH exec `rm -rf`（单引号转义 + OK 标记校验，超时 60s），失败回退并发 SFTP 递归删除；本地目录优先 `fs.rm(recursive)`。同级子项并发，叶子 IO 限流 8。
- **传输并发设置** — 设置页新增「上传并发数」「下载并发数」滑块（1-10），改设置即时生效无需重启。
- **快速模式** — `transferFastMode` 设置项（默认关）。开启后目录传输跳过预扫描直接开传，进度显示已传字节 + 文件数（无百分比），适合已知目录大小的场景。
- **默认路径模式** — `defaultPathMode` 设置（`off` / `remember` / `sync`），新连接首次打开面板时自动应用。
- **默认显示隐藏文件** — `defaultShowHidden` 设置，新连接首次打开面板时自动应用。
- **工具栏自定义** — `paneCustomOrder` 支持拖拽排序工具栏项；`paneHiddenItems` 支持隐藏不常用的工具栏按钮。
- **隐藏作者信息** — `hideAuthorInfo` 设置项，开启前弹出 Star 确认弹窗（仓库页面自动在浏览器打开）。
- **面板快捷键** — 新增面板快捷键设置项，支持录制/清除/冲突提示。
- **属性对话框增强** — 文件夹新增「计算大小」按钮（递归统计真实大小）；标题动态显示「本地/远程 · 文件夹/文件」；新增「位置」行（本地/远程标识，主题色加粗）。
- **冲突方向标识** — 冲突对话框标题旁显示方向徽章：⬆ 上传（本地→远程，绿色）/ ⬇ 下载（远程→本地，蓝色），复用既有 i18n 键拼装，24 语言自动生效。
- **合并覆盖进度面板** — 冲突覆盖合并时创建「传输中」进度条目（非快速模式预扫描得真实总量+百分比），复用来源传输日志条目避免重复记录。
- **图片预览导航** — 查看器打开图片时自动加载同目录图片列表，支持上一张/下一张按钮 + 键盘左右箭头切换，显示当前位置（N / 总数）。
- **复制 / 复制选中** — 查看器与编辑器均新增「复制」按钮（文本模式复制全文、图片模式复制图片到剪贴板）；有选中文本时额外显示「复制选中」按钮，复制后短暂显示「已复制」反馈。
- **以文本方式查看** — 右键菜单新增「以文本方式查看」，跳过文件类型预检查强制文本解码，适用于未知扩展名或需要查看原始内容的场景。

### 🐛 修复

- **续传上传失败 UI 僵尸态** — `LocalPathFileUpload` 新增 `failed` 状态 + `_markFailed()` 方法（与 `LocalPathFileDownload` 对称），续传流错误时标记失败，避免 UI 冻结最长 15 分钟 stall 超时。
- **断连后暂停传输永久僵尸** — `_tickAllTransfers` 断连分支不再跳过暂停条目，一并 cancel + 记失败。
- **冲突队列重入保护** — `resolve()` / `processNext()` 加 `_processing` 锁，防止并发消费同一条目。
- **覆盖上传/下载后传输记录误标失败** — 冲突项携带 `transferCtx`，覆盖/重命名成功后幂等翻正传输记录；跳过/取消保持失败语义。
- **tar 通道偶发误报失败** — `execSshCommand` 空输出时等 300ms 重开通道重试一次，两次都空才记 warn（含命令前 80 字符便于追查）。
- **合并覆盖无进度面板/忽略快速模式** — `MergeLocalDirUseCase` 创建进度条目 + 尊重 `fastMode` 设置 + `topCtx` 透传聚合子目录进度。
- **终端关闭后面板泄漏** — `terminal-decorator.ts` 重写 `detach()` 清理浮动面板 overlay/rAF 循环/resize 监听。
- **多面板书签并发写入丢失** — `save()` 按 id 合并后再写，保留其它实例/窗口新增的条目。
- **布局模式设置不生效** — 改用 `sftpConfig.get('paneState/layout/mode')` 读取（有 fallback 链），替代直接访问 `store` 顶层属性。
- **迁移守卫 OR 跳过部分迁移** — `typeof layout === 'object' || typeof perHost === 'object'` 改为 `&&`，确保两个子对象均存在时才跳过迁移。
- **HTML 模板重复 `[i18n]` 绑定** — 删除本地面板、远程面板、传输日志、右键菜单各一处重复绑定。
- **「复制选中」按钮点击无效** — 查看器/编辑器的「复制选中」按钮受 `*ngIf="hasSelectionText"` 控制，点击时 `mousedown` 导致 textarea 失焦 → `onTextareaBlur()` 置 `hasSelectionText=false` → 按钮从 DOM 移除 → `click` 永远不触发。修复：按钮加 `(mousedown)="$event.preventDefault()"` 阻止失焦。

### 🎨 改进

- **预扫描提速** — 4 个串行递归函数（`calcDirSize` + `countDirItems` × 2）合并为 2 个单次遍历（`scanLocalDir` / `scanRemoteDir`）；`readdir` 改用 `ConcurrencyLimiter(8)` 并发，仅 IO 调用占槽、目录递归不持槽。
- **传输日志 tombstone 机制** — 删除操作记入 `tombstones` 集合，`save()` 合并时跳过，防止删除被复活。僵尸日志清理阈值 24h→10min，仅应用启动首次构造时执行一次。
- **SSH exec 空输出重试** — 适用于所有 SSH exec 调用（tar xzf/rm -rf/wc -c/command -v tar/id 映射），均为幂等操作。
- **设置面板布局优化** — 隐藏作者开关挪到功能性分组首位；快速模式说明行删除（保留 title 悬停）；面板快捷键挪到自定义时间格式下方。
- **Star 确认弹窗文案** — 追加「您的点赞支持是我开发的动力，感谢支持！」（24 语言本地化感谢语）。

### 🔧 技术 / 构建

- **`tabby-plugin-common` 共享模块** — 抽离 `theme.ts` / `utils.ts` 到独立包，CI 可独立构建；构建脚本路径收敛到仓库内（`scripts/check-common-sync.mjs` + `scripts/copy-sftp-manifest.mjs`）。
- **GitHub Actions 发布** — `publish.yml` 增加 `push:tags` 触发，打 tag 即自动发布到 npm。
- **i18n 辅助脚本** — 新增 12 个脚本（`add-*-i18n.mjs` / `update-*-i18n.mjs`），支持幂等追加/替换 24 语言 .po 文件。
- 版本号 bump 至 **2.0.1**。

### ⚠️ 已知限制

- tar 通道仅用于目标不存在的全新传输；合并/覆盖场景必须保留逐文件通道（冲突检测依赖）。
- 快速模式下目录传输无百分比进度（总量未知），仅显示已传字节 + 文件数。

---

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

/**
 * SFTP+ 浮动面板组件
 * 功能描述：纯 Angular 组件（不继承 BaseTabComponent），由装饰器动态创建为浮动 overlay
 *   双栏文件管理器（本地↔远程）、书签、传输日志、拖拽传输
 * @创建人：DD1024z + Claude
 * @创建时间：2026-06-21
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-09-29 — ★ 查看器自绘光标改为「形状三档」：textCaretWidth(number) → textCaretShape
 *              ('block'|'beam'|'underline')，getter 改名 + normalizeCaretShape() 归一化
 *              （配置被手工改坏时回落 beam，不抛错），模板 [caretWidth] → [caretShape]
 *              同日 — ★ 面板快捷键支持鼠标中键与滚轮上/下滚（用户：快捷键录制无法录制滚轮的点击
 *              和上下滚动）。原 onPaneMouseNav（挂在组件宿主元素 mousedown 上，只认 back/forward）
 *              替换为统一指针分发：_consumePanePointerHotkey() 找命中动作 + _runPanePointerHotkey() 执行，
 *              **全部 15 个动作**都能绑指针事件，可执行性判定与键盘路径同源（_contextHotkeyReady 等）。
 *              接线改为列表级（listMouseDown + 新增 listWheel 输出），中键/滚轮只在文件列表内生效。
 *              命中即吞掉默认行为（中键自动滚动、滚轮滚动列表）；未命中一律不干预。滚轮 150ms 节流，
 *              且节流窗口内**继续拦截**——否则列表会「滚一下停一下」。指针路径无 Shift 语义：
 *              delete 一律走回收站，永久删除仍只由 Shift+键盘触发。
 *              2026-09-29 — ★ 同栏冲突「源文件」内容摘要永远显示「—」（用户实测：把同一个文件粘贴回它
 *              自己所在目录，冲突框里源侧摘要为空、目标侧正常）。根因：`_computeConflictDigests` 一律
 *              **按字段名**选通道（localPath → 本地读盘、remotePath → 远端 sha1sum），而**同栏粘贴**时
 *              这两个字段装的是**同一侧**的两个路径（paste._buildFileConflictItem：localPath=目标、
 *              remotePath=源）→ local→local 对本地源路径跑 sha1sum（实测 log：「execSshCommand empty
 *              output (retried): sha1sum "$(echo 'RDpcRGVza3RvcFx0ZXN0XHRlc3Q=' | base64 -d)" +
 *              「[digest] remote digest output parse failed」），remote→remote 对远端目标路径读本地盘
 *              （实测 log：「[digest] local digest failed」）—— 两端必有一端显示「—」。
 *              修法：冲突队列项把 `samePaneSource` 透传到 `_computeConflictDigests`，两端按**实际所在侧**
 *              选通道（同栏 local→local 两端都走 localDigest、remote→remote 两端都走 remoteDigest），
 *              跨栏（上传/下载）两字段天然分居两侧，逻辑不变。副作用：同栏不再白发 SSH 命令，
 *              「内容相同」提示在这一场景也能正常出现。
 *              2026-09-29 — ★ issue #25（心跳恢复 / 目录刷新反复失败、日志噪声）：
 *              ① 目录刷新撞上「通道已死」（session/channel closed、连接被重置）时**静默换一条
 *              新 SFTP 子通道并重试一次**（refreshRemote → _refreshRemoteInternal + 新增叶子模块
 *              core/session-errors.isChannelDeadError + lifecycle.recoverChannelForListing），
 *              不再每点一次刷新就清空列表 + 刷一条 error（实测日志 129 条 session closed）；
 *              ② 心跳恢复：**没有在途传输被中断就不弹提示**（弱网实测 363 次恢复 = 363 次打扰）、
 *              恢复日志限流（前 3 次 info，其后 debug，每 10 次汇总）、反复恢复按倍率退避；
 *              ③ 心跳探针失败日志降为 debug（每次恢复前必然出现 need 次，弱网下刷满 log.txt）；
 *              ④ issue #17 残留（fweiger 报「Mac 终端 Cmd+C/V 被面板抢」）**核实不成立，未改行为**：
 *              接管标志由「面板内 mousedown」置位、由「面板外 mousedown（含点终端区）」清除，
 *              面板热键入口另有 _isTerminalFocusTarget 守卫 → 焦点一回到终端，Cmd+C/V 完全归终端。
 *              焦点在面板时面板接管剪贴板快捷键是**有意行为**：面板内按 Ctrl+C 必须只做面板复制，
 *              绝不能把 ^C 打进终端（会杀掉对面正在跑的命令）。
 *              曾把该标志改成 4s 有效期，被用户指出是过度修复：既没必要（点终端即交还），
 *              又收窄了「点面板 → 慢慢选文件 → Cmd+C/V」的可用窗口，已回退为原布尔语义。
 *              2026-09-29 — ★ 打包通道失败原因「按发生位置」拆开（用户实测质问：「这是远程打包失败了
 *              呢？还是传输到本地，本地解压失败了？」—— 旧码 packFailed 的文案「打包或解包失败」
 *              同时覆盖远端打包/本机打包/本机解包三件事，答不出来）。TAR_CHANNEL_FAILURE_REASON_KEYS
 *              删 packFailed，新增 localPackFailed / remotePackFailed / localExtractFailed，
 *              并单列 nameEncodingUnsupported（跨系统文件名编码还原不了，有明确解法：换智能或优先
 *              SFTP、或升级远端 tar）。24 语言文案由 scripts/add-tar-failure-split-i18n.mjs 补齐。
 *              （真实根因与修复见 tar-channel.ts 文件头同日记录。）
 *              2026-09-29 — ★ 修复「选了仅 TAR 却走了 SFTP」的**标记与告知**两处：
 *              ① 通道归属改显式：新增 host 回调 markChannelMode，转发链
 *              tar-channel → FolderTransferPort → PanelTransferHost → 本组件；
 *              updateFolderLogSize 不再顺带写 transferMode='tar'（它只在需要回填
 *              真实目录大小时才被调用，用它当副证会出现「走了 tar 却显示 ⇄SFTP」）。
 *              ② 仅 TAR 下「打包通道不适用」（目标已存在 → 只能逐文件增量）不再静默：
 *              TAR_CHANNEL_FAILURE_REASON_KEYS 新增 targetExists，notifyTarChannelFailure
 *              对该 code 改用说明性文案 notify.tarOnlyInapplicable（含解法），不再用
 *              「无法传输」的失败措辞。
 *              （根因是 transfer-coordinator._buildPorts 固化通道模式，已在该文件修复。）
 *              2026-09-29 — 分组表头高亮改为 file-pane 内部按「组内选中比例」判定，不再由父组件下发
 *              「是否全选」：删除上一轮新增的 `_allEntriesSelected(side)`、`local/remoteAllEntriesSelected`
 *              两个模板 getter 与模板上的 `[allEntriesSelected]` 绑定（连同 file-pane 的对应输入）。
 *              用户实测两轮：Ctrl+A 全选、以及非全选只选部分时，被选中的单条目分组表头都不亮，
 *              而同屏 ≥2 项的组头亮 —— 门槛（items.length > 1 / 或全选）本身就不该存在。
 *              新规则见 sftp-file-pane.component.ts 的 groupSelState()。
 *              方向键连发性能（用户实测：按住 Shift+↑/↓ 连续多选「有点延迟卡顿」）。
 *              用产物里的真实代码 + 无头浏览器量出瓶颈后逐项收口（前两项是主要开销）：
 *              ① 变更检测做了两遍：捕获阶段 zone.run 除执行处理函数外，还会在微任务清空时触发
 *                 ApplicationRef.tick()（整站 CD），而方向键分支本就在收尾显式 _safeDetect() ——
 *                 改为方向键走 runOutsideAngular，每步只保留 1 遍面板 CD（其余热键仍走 zone.run）；
 *              ② 每步都做两处 O(n) DOM 扫描（3000 行实测）：syncPaneSelectionVisual 全表
 *                 getAttribute+classList ≈1.07ms、_scrollRowElIntoView 的 querySelectorAll+Array.from+find
 *                 ≈0.79ms → 前者在方向键路径替换为增量的 `_stripSelectionVisual`（只处理
 *                 「上一轮选中、这轮不选」的行，≈0.001ms；新增选中由 CD 的 [class.selected] 绑定负责），
 *                 后者改用属性选择器直取（`_findRowEl`，≈0.024ms，含异常退回线性匹配）；
 *              ③ 导航序列改缓存（`_navCacheFor` + NavCache：out/index/headerPrefix）：
 *                 原先每步重建对象数组 + slice 各分组条目（≈0.16ms），且用 findIndex 线性扫 2~3 遍定位
 *                 焦点/锚点；改为 O(1) Map 查询。Shift 区间在「区间内无表头行」时走直拼快路径，
 *                 免去 Set 去重（≈0.34ms → ≈0.05ms）；
 *              ④ 收尾顺序改为「先滚动定位（尚未写类、几何不受视觉类影响）→ 再补差异视觉 → 最后 CD」，
 *                 避免旧顺序「写完类才读 rect」每步触发一次同步重排。
 *              （同日）键盘游标（用户实测：组内只有 1 个文件的分组头"无法移动选中"）：
 *              根因不在导航序列（表头行本就在序列里、键盘能停上去），而在**焦点没有自己的视觉语言**——
 *              单条目分组里「游标停在表头」与「停在唯一那条文件上」选中集完全相同，而表头高亮又被
 *              file-pane 当时的 groupAllSelected ≥2 项门槛挡住（该门槛已于同日取消，见 groupSelState）
 *              → 屏幕毫无变化，像按键卡住。修复：
 *              `navFocusKey(pane)` 把当前焦点键下发给 file-pane（选中 与 游标 拆成两套语义，
 *              游标由 .nav-focus 表达）；NAV_HEADER_KEY_PREFIX 下沉到 core/grouping（父子共用同一常量）。
 *              分组头纳入方向键导航（用户要求：↑/↓ 也能停在分组头上）：
 *              `_navRows` 返回结构升级为 NavRow（kind/key/entries/listIndex/groupKey，表头行携带整组条目），
 *              表头行被选中 = 全选该组（与鼠标点击表头一致）；Shift 区间按 entries 展开 + fullPath 去重；
 *              焦点/锚点字段由 `_localNavFocusPath` 更名为 `_localNavFocusKey`（兼存表头导航键，
 *              前缀 NAV_HEADER_KEY_PREFIX）；滚动改走 `_scrollNavRowIntoView`（表头按 data-group-key 定位）；
 *              点击表头时同步键盘焦点，与点击条目行对称。
 *              同日：Shift+↑/↓ 连续多选（此前该组合被直接放行，无法多选）：新增
 *              `_handleArrowNav(side, down, extend)` 统一承载「移动」与「Shift 区间扩展」，
 *              焦点/锚点按 fullPath 记录（`_localNavFocusKey` / `_localNavAnchorKey`），
 *              Shift 时取**显示序**区间 [锚点 … 焦点] 整体替换（折叠组内条目不在显示序中，自然不入选）；
 *              `_onPaneClick` 同步焦点/锚点（Shift+点击时锚点不动），
 *              `_dropSelection` / `_pruneSelection` / 分组头全选处一并清理；
 *              `_eventWouldConsumePanelHotkey` 不再排除 Shift —— 需在捕获阶段就认领组合键，
 *              否则会被宿主先消费掉。
 *              同日：方向键导航修复（用户实测：分组模式下从文件夹组末行 uploads 按 ↓ 直接跳到
 *              TMP 组的 .tmp）：分组视图按桶重排渲染，**显示序 ≠ 排序序**，而旧实现拿
 *              getFilteredXxxEntries() 的排序序走下标 → 视觉乱跳。新增 `_navRows()` 返回「显示序」
 *              （分组模式取 groupRows 的 entry 行，折叠组不产生行 → 自动跳过；附带原列表下标供
 *              shift 连选沿用旧语义），方向键上下改用它导航；`_scrollEntryIntoView` 参数由
 *              「列表下标」改为「条目对象」并按 data-path 精确匹配行（原 rows[idx] 在分组模式同样错位）。
 *              分组表头点击改为切换选中：组内全选中→从选择集移除该组（其他组保留），
 *              否则选中该组全部（onLocal/RemoteGroupSelect，按 fullPath 识别条目）；
 *              同日：仅 TAR 模式改为硬失败（打包通道不可用时不再回退逐文件）→ host 新增
 *              notifyTarChannelFailure（按 TarFailureCode 翻译成「原因 + 解决方法」toast，
 *              映射见 TAR_CHANNEL_FAILURE_REASON_KEYS）
 *              2026-09-28 — 传输通道模式：_transferTarAcceleration 替换为 _transferChannelMode
 *              （smart/sftpOnly/tarOnly/preferSftp/preferTar），host 提供 tarChannelMode() 取代 tarAcceleration()；
 *              加载时迁移旧 transferTarAcceleration 开关（false→sftpOnly，其余→smart）
 *              2026-09-28 — 「展开/收起所有分组」从定制项移除（已并入分组依据子菜单）；
 *              contextMenuDisabledEntries 忽略历史配置残留的 groupToggleAll 停用值
 *              2026-09-28 — 修复：分组表头右键被 onPaneContextMenu 误判为空白区右键、
 *              清空已选中的整组（分组头复用 .header 类被 .entry:not(.header) 排除）；
 *              改为分组头右键保留选中态、仍弹面板菜单（动作作用于整组）
 *              2026-09-28 — 文件列表分组（类似 Windows「分组依据」）：localGroupBy/remoteGroupBy
 *              状态（localStorage 持久化）、getLocal/RemoteGroupRows 行缓存（模式/排序方向/折叠
 *              版本签名失效）、分组表头行收展与全选该组处理器、右键空白区菜单「分组依据」分发
 *              2026-09-28 — 传输目标目录预检（用户：默认上传/下载路径不存在时传输直接失败，
 *              应检测并询问是否创建）：右键上传/下载入队前用 statRemotePath（远程）/
 *              fs.stat（本地）预检目标目录，不存在时弹三选一确认框（sftp-dir-missing-dialog）——
 *              创建并传输（远程 _remoteMkdirp 逐级 mkdir / 本地 recursive mkdir）、
 *              本次使用当前目录、取消；每批只问一次，路径存在但是文件时提示后取消
 *              2026-09-26 — 目录传输「行级实时进度」+ 停摆如实显示（用户：「这次似乎又完全不会动了」）：
 *              ① `_doDownloadRaw` 新增尾参 onProgress，400ms 轮询 dl.getCompletedBytes()
 *                 把本文件已落盘字节交给用例层节流上报 —— 目录条目原先只在文件传完时更新一次，
 *                 单个大文件期间整行（百分比/速度/当前文件/剩余时间）完全静止；
 *              ② `_updateFolderProgress` 连续零推进 ≥ SPEED_STALL_ZERO_MS 即如实写 0 B/s、
 *                 speedBps=0（剩余时间随之显示 ∞），不再拿旧速率报一个不动的假数字
 *              2026-09-26 — 传输记录「清除」按钮补可用性判定：新增 transferLogClearableCount
 *              （= 该连接下已结束的记录数）传给对话框，为 0 时按钮禁用、clearLog() 直接返回，
 *              消除「一条记录都没有 / 剩下的全是正在传输中的条目」时仍能点出确认框的空操作
 *              2026-09-26 — _updateFolderProgress（文件夹/打包通道进度）同步维护数值速率
 *              speedBps，供传输中条目显示预估剩余时间
 *              2026-09-26 — 修掉「开机前几秒显示天文数字剩余时间」的真元凶：速度窗口的**首次**
 *              采样把左端当成 0（`_lastSpeedUpdate || 0`）⇒ deltaTime = 纪元毫秒（≈1.79e12）
 *              ⇒ 速率被压到 1e-9 量级，速度显示 "0 B/s"、剩余时间显示
 *              "3255876663332h01m"；且该毒值经 EMA 污染随后窗口（169.2 KB/s 却报 21m07s）。
 *              改为「首次只建基准不出速率」；resumeTransfer 同时重置窗口基准，避免把暂停时长
 *              当成测量窗口把速率摊薄。字段 lastProgressAt 随之删除（见 panel-types）
 *              2026-09-25 — P1 修复：顶层传输入口（downloadRemoteDir / uploadPathToRemote）新增
 *              重复入队只读预检 `_blockDuplicateTransfer`（槽位真源在协调器）——同一
 *              (方向, 远端, 本地) 已在队列/传输中时提示「已在传输队列中，已忽略重复请求」并
 *              直接忽略。此前用户 Ctrl+V 后界面未及时响应、再点一次「下载」，会生成两条相同传输：
 *              并发跑同一 tar 打包/解包 + 并发写同一目标文件（逐文件守卫互相 skip 且都记失败）
 *              → **双双失败且无任何提示**
 *              2026-09-25 — P0-3 修复：向连接生命周期提供 hasActiveTransfers()（心跳据此放宽
 *              「通道死亡」判定阈值，避免大流量下载时探测超时误判 → end 会话中断在途传输）
 *              2026-09-25 — P0-2 修复：downloadRemoteDir 补 `_forceOverwrite` 形参并原样转发给协调器
 *              （此前静默漏转发 → 远程→本地下载、目标文件夹已存在时选「覆盖」必失败：
 *              子文件冲突重新入队 → markHadConflict → 整目录被收尾成失败）
 *              2026-09-25 — 第七轮审计 P3-1 修复：enqueueConflict 不再把冲突总数重置为当前队列长度
 *              （改为只抬高 Math.max），避免 execute 阶段迟到入队的目录冲突使「x/N」进度跳动
 *              2026-09-21 — 冲突对话框文件名图标复用 resolveDetailsIcon（与列表/属性框一致的彩色 SVG）
 *              2026-09-21 — P0 修复：目录切换/刷新后收口选择模型（_dropSelection/_pruneSelection），
 *              此前残留选中项仍指向已离开的目录，按 Delete 会删掉上一个目录里的文件；
 *              删除确认框改为显示目标所在目录（单项与批量），作为第二道防线
 *              2026-09-21 — 修复销毁时未取消在途传输，并向连接生命周期提供存活状态；
 *              第六轮审计修复：新增 _activeUploadTargets 同名并发上传守卫（互踩 .tabby-upload）；
 *              saveCurrentPath 同步写嵌套配置（修复迁移用户路径记忆被旧值卡住）；
 *              右键单文件 auto-skip 无占位条目时补落「已跳过 · 内容相同」日志（此前完全静默）；
 *              ngOnDestroy 补「系统中打开」临时文件清理
 *              2026-09-21 — 过窄/过矮双向回退并 toast 提示；按钮 title 显示偏好→实际；保留用户布局偏好
 *              2026-09-21 — 左右布局在面板过窄时自动退回上下（不改用户偏好）；动态 minPaneW 避免 450 硬下限挤成细条
 *              2026-09-21 — 上下布局动态抬高两侧最小高度，避免多拆分下远程半屏过矮
 *              2026-09-20 — P1-2/P2-1/P2-2 审计修复：目录任务接入「任务作用域」（task-scope），
 *              条目登记自己的 cancelRef，取消/清空按条目所属任务广播（不再误杀并发的新任务）；
 *              拖入兜底临时目录按面板作用域隔离并在销毁时清理
 *              2026-09-20 — 面板热键支持打开/查看/编辑（默认未绑定）
 *              2026-09-20 — A2/A3/A5/A6/A7/A8/A9 审计修复：_destroyed 收口为 _safeDetect/_isAlive（并把「已跳过」延迟移除定时器纳入清理）；
 *              接线 disposeColResize；缓存内置图标目录（消除变更检测中的同步 IO）；传输日志框改按需挂载；
 *              未配置图标时返回共享空数组；删除死成员（hasFileActions/inputDialogIsRename 等）；菜单顺序统一 sanitizeMenuOrder
 *              2026-09-20 — 修复属性等快捷键：不依赖右键 contextMenuEntry，按当前选中项打开
 *              2026-09-20 — 面板热键在捕获阶段拦截，避免与 Tabby 全局键（如 Alt+Enter 全屏）抢触发；右键菜单显示属性等快捷键
 *              2026-09-20 — 粘贴冲突支持「内容相同自动跳过」；传输中进度条展示传输方式（SFTP/打包）
 *              2026-09-20 — 冲突框异步补算内容摘要（粘贴路径此前未入队 digest）
 *              2026-09-20 — 修复 Ctrl+V/Ctrl+A：owns 时勿再用「无选中」清标志交还终端；粘贴目标用 activePane
 *              2026-09-24 — issue #24 修复：终端键入空格被面板键入定位(type-ahead)吞掉。新增 _isTerminalFocusTarget，
 *              在 _handlePanelWindowHotkey 与 _capturePanelHotkeysBeforeTabby 中，焦点位于终端 xterm 时绝不劫持按键；
 *              键入定位改为仅在面板文件列表自身获焦时消费空格/字母，避免启用插件后终端无法键入空格
 */
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import { randomUUID } from 'crypto'

import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ChangeDetectorRef, ElementRef, NgZone, Injector, ViewEncapsulation, Inject, Optional } from '@angular/core'
import { ThemesService, NotificationsService, ConfigService, AppService } from 'tabby-core'

import { LocalPathFileDownload, LocalPathFileUpload, uploadLocalFile, downloadRemoteFile, cancelAllInFlight } from './core/transfer-adapters'
import { currentTaskScope, runInTaskScope, type TaskCancelRef } from './core/task-scope'
import { log } from '../services/sftp-logger'
import { SftpConnectionService, SFTPFile, SFTPSessionLike, SSHSessionLike, SftpEnrichOptions, getSftpConnectionService, enrichSftpFilesWithAtime, enrichRemoteOwnersViaStat, resolveRemoteSymlinkStat, statRemotePath } from '../services/sftp.service'
import { SftpI18nService } from '../services/sftp-i18n.service'
import type { Locale } from '../services/sftp-i18n.service'
import { SftpConfigService } from '../services/sftp-config.service'
import { SftpBookmarksService, Bookmark } from '../services/sftp-bookmarks.service'
import { SftpTransferLogService, TransferLogEntry } from '../services/sftp-transfer-log.service'
import { openSftpPlusSettings } from '../settings/sftp-open-settings'
import { PanelConnectionLifecycle, PathFollowMode } from './components/connection-lifecycle'
import { PanelRubberBand } from './components/panel-rubber-band'
import { PanelHeaderReorder } from './components/panel-header-reorder'
import { PanelFileDnd } from './components/panel-file-dnd'
import { PanelDropAdapter, dragDropTempDir } from './core/drop'
import { PanelTransferCoordinator, SPEED_STALL_ZERO_MS, SPEED_STALL_ZERO_TEXT } from './core/transfer-coordinator'
import { PanelPasteAdapter } from './core/paste'
import { ContentDigestService } from './core/digest'
import { copyLocalDir, copyRemoteDir, deleteLocalRecursive, deleteRemoteRecursive, tryRemoteCpViaSsh, tryRemoteRmViaSsh } from './core/fs-ops'
import { isChannelDeadError } from './core/session-errors'
import { ConcurrencyLimiter } from './core/concurrency'
import { trashLocalPath } from './core/trash-local'
import { PanelConflictResolver } from './components/panel-conflict-resolver'
import { PanelTransferRuntime } from './core/transfer-coordinator'
import { PaneNavHistory } from './core/selection'
import { computeSelection, computeSortToggle } from './core/selection'
import { GroupByMode, GroupDisplayRow, NAV_HEADER_KEY_PREFIX, buildGroupedRows, groupModeSortField, navHeaderKey } from './core/grouping'
import {
  keyboardHotkeySpecs,
  matchPointerHotkeySpecs,
  matchPanelHotkeyKey,
  matchPanelHotkeyKeys,
  normalizePanelHotkeyKeys,
  parsePanelHotkeyKey,
} from '../tabby/hotkey-util'
import {
  CONTEXT_ACTION_HOTKEYS,
  defaultPanelHotkeys,
  normalizeCaretShape,
  PANEL_HOTKEY_ACTIONS,
  type CaretShape,
  type PanelHotkeyAction,
} from '../tabby/config-provider'
import { isColorDark } from '@common/utils'
import { SftpPanelBookmarkController } from './controllers/panel-bookmark-controller'
import {
  isDirByMode,
  isSymlinkByMode,
  filterByHidden,
  filterByName,
  sortLocalEntries,
  sortRemoteEntries,
} from './core/file-utils'
import type {
  LocalEntry,
  ConflictFileInfo,
  DragPayload,
  FolderTransferCtx,
  BookmarkScope,
  PanelTransferItem,
} from './core/panel-types'
import type { AutoSkippedInfo } from './core/conflict'
import {
  formatSize,
  formatDate,
  formatPercent,
  formatLogTime,
  formatLogTimeRange,
  formatDuration,
  formatSpeedFromSize,
  getLogFileName,
  formatFailReason as formatFailReasonFn,
  getDateFormatPattern,
  setDateFormatPattern,
} from './core/file-utils'
import { DEFAULT_ICON_MAP, resolveSftpPlusBundledIconDir } from './core/icon-defaults'
import { SFTP_PANEL_STYLES } from './components/styles'
import { IdNameResolver, execSshCommand, safeEntryName, safeJoinUnder } from './core/path-utils'
import type { PaneNavAction, PaneSortAction } from './components/sftp-file-pane.component'
import type { ContextMenuAction, HeaderMenuAction, ColVisibilityState } from './components/sftp-context-menu.component'
// ★ 2026-09-20 A9：菜单顺序配置的运行期收敛（同时消除 string[] / ContextMenuAction[] 的类型漂移）
import { sanitizeMenuOrder } from './components/sftp-context-menu.component'
import type { PermField } from './components/sftp-perm-dialog.component'
import type { DetailsDisplay } from './components/sftp-details-dialog.component'
import type { ViewerMode } from './components/sftp-viewer-dialog.component'
import type { CwdSetupChoice } from './components/sftp-cwd-setup-dialog.component'
import {
  CWD_SESSION_CMD,
  CWD_BASH_SNIPPET,
  CWD_ZSH_SNIPPET,
} from './components/sftp-cwd-setup-dialog.component'
import {
  isViewableRemoteFileType,
  isImageFile,
  isBinaryBuffer,
  bufferToText,
  bufferToDataUrl,
  isRemoteFileTooLargeForView,
  getViewMaxBytes,
  formatBytesLimit,
} from './core/file-utils'
import {
  downloadRemoteToBuffer,
  downloadRemoteToTempFile,
  writeTextToFile,
  readTextFromFile,
  removeTempFile,
  writeBufferToTemp,
  readLocalFileToBuffer,
} from './core/transfer-adapters'

/** 面板热键"已清除"哨兵值（可打印字符串，Tabby config 清洗不会删除；与 settings 组件 PANEL_HOTKEY_CLEARED 一致） */
const HOTKEY_CLEARED = '__NONE__'

/** ★ 2026-09-29（性能）：方向键差异视觉清理最多逐路径直取多少行；超出则改走全表扫描（见 _stripSelectionVisual） */
const STRIP_QUERY_MAX = 64

/* ★ 2026-09-29：分组表头导航键前缀由本文件局部常量下沉到 core/grouping（NAV_HEADER_KEY_PREFIX），
   file-pane 判定「键盘游标是否停在表头」需要用同一个常量，放在叶子模块才能父子共用而不成环 */

/**
 * 方向键导航序列（_navRows）中的一行。
 * ★ 2026-09-29：分组表头行也参与导航——按 ↑/↓ 可停在分组头上，选中即「全选该组」
 *   （与鼠标点击表头的行为一致）。折叠的分组同样占一行（其条目不可见但不妨碍整体选中）。
 */
interface NavRow {
  kind: 'header' | 'entry'
  /** 焦点标识：entry 行 = fullPath；header 行 = NAV_HEADER_KEY_PREFIX + bucketKey */
  key: string
  /** 该行代表的条目集合：entry 行 = [entry]；header 行 = 该组全部条目（折叠组也带） */
  entries: any[]
  /** entry 行 = 扁平列表中的排序序下标（供 localLastSelectedIndex 沿用旧语义）；header 行 = -1 */
  listIndex: number
  /** 滚动定位用：header 行 = bucketKey（对应 DOM 的 data-group-key） */
  groupKey?: string
}

/**
 * ★ 2026-09-29（性能）：导航序列缓存 —— 方向键连发时避免每步重建序列 + 线性查找。
 * @字段 src/rows      生成缓存时的「过滤列表 / 分组行」引用（两者任一变化即失效）
 * @字段 out           显示序序列（表头行 + 条目行）
 * @字段 index         key → out 下标（焦点/锚点定位由 O(n) findIndex 降为 O(1)）
 * @字段 headerPrefix  headerPrefix[i] = out[0..i-1] 的表头行数；用于判断区间内是否含表头
 *                     （不含表头 → 区间内每行恰好 1 项，可免去 Set 去重，见 _handleArrowNav）
 */
interface NavCache {
  src: any
  rows: any
  out: NavRow[]
  index: Map<string, number>
  headerPrefix: number[]
}

/**
 * ★ 2026-09-20 A7 审计修复：未配置时的共享空数组常量。
 *   原 getter 在「无自定义图标规则 / 无禁用图标」时每轮变更检测都 `return []`（新引用），
 *   而这两个值直接绑给 ngOnChanges 型子组件 sftp-file-pane → 子组件每次 CD 都被判定输入变化。
 *   改为复用同一冻结引用，语义不变（只读使用）且消除该churn。
 */
const EMPTY_ICON_RULES: { ext: string; svg: string; name?: string }[] = Object.freeze([]) as unknown as { ext: string; svg: string; name?: string }[]
const EMPTY_SVG_LIST: string[] = Object.freeze([]) as unknown as string[]

/**
 * ★ 2026-09-29：打包通道失败原因（TarFailureCode）→ i18n key。
 *
 * 仅「仅 TAR 模式」下会用到：该模式不回退逐文件通道，传输必然失败，所以必须把
 * 「为什么失败 + 怎么解决」讲清楚。按**解法**分组，不按代码路径分组（见 tar-channel
 * 的 TarFailureCode 注释）。未知 code 回退「其它原因（详见日志）」。
 */
const TAR_CHANNEL_FAILURE_REASON_KEYS: Record<string, string> = {
  localTarMissing: 'tarchan.reason.localTarMissing',
  remoteTarMissing: 'tarchan.reason.remoteTarMissing',
  symlinkUnsupported: 'tarchan.reason.symlinkUnsupported',
  // ★ 2026-09-29（二）：`packFailed` 一码拆三 —— 用户实测质问「这是远程打包失败了，还是本地解压
  //   失败了？」，而旧文案「打包或解包失败」同时覆盖三种完全不同的发生位置，答不上来。
  //   现在按**哪一端**直接说清（见 tar-channel 的 TarFailureCode 注释）。
  localPackFailed: 'tarchan.reason.localPackFailed',
  remotePackFailed: 'tarchan.reason.remotePackFailed',
  localExtractFailed: 'tarchan.reason.localExtractFailed',
  // ★ 2026-09-29（二）：跨系统文件名编码还原不了（Linux GNU tar 默认格式 ↔ Windows bsdtar），
  //   解法是换通道/升级远端 tar，与「环境故障」不同，单独成码给出可行动的建议。
  nameEncodingUnsupported: 'tarchan.reason.nameEncodingUnsupported',
  tarballFailed: 'tarchan.reason.tarballFailed',
  // ★ 2026-09-29：与上面几条「通道不可用/失败」性质不同 —— 这是**不适用**（目标已存在，
  //   只能走逐文件增量），传输会正常完成。仅 TAR 下也要提示，否则用户只看到 ⇄SFTP 标签，
  //   无法区分「设置没生效」与「本次不适用」（实测）。
  targetExists: 'tarchan.reason.targetExists',
  other: 'tarchan.reason.other',
}

@Component({
  selector: 'sftp-plus-panel',
  template: require('./sftp-floating-panel.component.html'),
  encapsulation: ViewEncapsulation.None,
  styles: [SFTP_PANEL_STYLES],
  // ★ 2026-08-24：tabindex=-1 让面板根可程序化聚焦（不可 Tab 切入），
  //   点击面板时 focus(root) 把焦点拉进面板 DOM 内，onGlobalKeyDown 的
  //   panelFocused（Backspace 历史后退 / Ctrl 拦截）才能正常判定
  host: { 'attr.tabindex': '-1' },
})
export class SftpFloatingPanel extends SftpPanelBookmarkController implements OnInit, AfterViewInit, OnDestroy {
  // ========== 常量 ==========
  // 远程目录条目超过此数视为"超大目录"，跳过按条目 stat 的 owner 补全（B7 缓解）
  private static readonly REMOTE_LISTING_ENRICH_LIMIT = 20000

  // ========== 从外部设置（非 DI）==========
  sshSession: SSHSessionLike | null = null
  profile: any = null
  onClose: (() => void) | null = null   // 关闭回调（销毁面板）
  onMinimize: (() => void) | null = null // 最小化回调（隐藏面板，不销毁）
  displayMode: 'floating' | 'workspace' = 'floating'

  // ========== 服务（直接实例化，非 DI）==========
  private sftpService = getSftpConnectionService()
  i18n: SftpI18nService
  private configService?: ConfigService
  /** 统一配置访问服务（嵌套存取 + 自动迁移旧扁平 key） */
  private sftpConfig: SftpConfigService | null = null
  protected bookmarks!: SftpBookmarksService
  private transferLog: SftpTransferLogService

  // ========== 连接 ==========
  /** 终端 Tab 引用（用于重连时获取最新 sshSession） */
  terminalRef: any = null

  /** NotificationsService（延迟获取，可能为空） */

  /** P2-2: _openPathInSystem 中 keyup 监听和 setTimeout 的引用，供 ngOnDestroy 清理 */

  /** 面板顶部轻提示（复制路径等） */
  toastMessage = ''
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteLoadingTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteFlashTimer: ReturnType<typeof setTimeout> | null = null
  private _localFlashTimer: ReturnType<typeof setTimeout> | null = null
  private _remoteRefreshGen = 0
  private _localRefreshGen = 0
  private static readonly MTIME_TOLERANCE_MS = 2000

  /** 是否正在重连 */
  reconnecting = false

  /** 是否已最小化 */
  minimized = false

  /** ★ BUG-1 修复：组件是否已销毁（防止异步回调操作已销毁组件） */
  private _destroyed = false
  /**
   * ★ 2026-09-20 A2 审计修复：此前 `_destroyed` 只写不读，销毁路径形同虚设——
   *   跨 await / 定时器 / 异步回调仍会对已销毁视图 cdr.detectChanges() → ViewDestroyedError，
   *   并让组件实例被闭包多留一段时间。
   *   现统一收口：视图操作走 _safeDetect()，长延时回调先判 _isAlive。
   */
  /** 「已跳过 · 内容相同」条目延迟移除的定时器句柄（销毁时统一清理，避免回调打在已销毁视图） */
  private _queuedEntryTimers: ReturnType<typeof setTimeout>[] = []

  /** 组件是否仍存活（销毁后所有异步视图操作必须短路） */
  private get _isAlive(): boolean {
    return !this._destroyed
  }

  /** 变更检测安全包装：销毁后 no-op，替代裸 cdr.detectChanges 防 ViewDestroyedError。
   *  不吞异常：非销毁类的真实错误（如开发期表达式变更）仍照常抛出，避免掩盖真问题。 */
  protected override _safeDetect(): void {
    if (this._destroyed) return
    const cdr = this.cdr
    cdr.detectChanges()
  }

  // ========== 浮动面板几何（仅 floating 模式）：拖拽移动 / 缩放 / 最大化 ==========
  /** 是否已初始化浮动几何（floating 且已切换为绝对定位） */
  panelDraggable = false
  /** 拖拽中 / 缩放中（仅用于 CSS 类切换） */
  panelDragging = false
  panelResizing = false
  /** 是否已最大化 */
  panelMaximized = false
  /** 标题栏右键菜单：是否可见 */
  topBarMenuVisible = false
  topBarMenuX = 0
  topBarMenuY = 0
  private _hostEl: HTMLElement | null = null
  private _dragOffsetX = 0
  private _dragOffsetY = 0
  private _dragStartClientX = 0
  private _dragStartClientY = 0
  private _dragThresholdPassed = false
  private _resizing = false
  private _resizeDir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null = null
  private _resizeStart = { left: 0, top: 0, w: 0, h: 0, mx: 0, my: 0 }
  private _prevGeom: { left: string; top: string; width: string; height: string; followWindow?: boolean } | null = null
  private readonly _geomMinW = 360
  private readonly _geomMinH = 240
  private _onGeomMoveBound = (e: MouseEvent): void => this._onGeomMove(e)
  private _onGeomUpBound = (): void => this._onGeomUp()
  private _geomInitRetried = false
  private _geomInitTimer: ReturnType<typeof setTimeout> | null = null
  private _layoutRefreshTimers: ReturnType<typeof setTimeout>[] = []
  /**
   * 是否处于「跟随窗口」默认尺寸模式：
   * true 时几何用百分比定位（96%×94% 居中），Tabby 窗口缩放时面板自动跟随；
   * 用户一旦拖拽/缩放/最大化即切换为固定 px 并持久化为自定义几何。
   */
  private _followWindow = false
  /** 上次保存的面板几何（全局配置，跨会话生效）：位置/尺寸/最大化状态/是否跟随窗口 */
  private _panelGeom: { left?: string; top?: string; width?: string; height?: string; maximized?: boolean; followWindow?: boolean } = {}

  connecting = false
  connected = false
  hostInfo = ''


  // ========== 本地面板 ==========
  localPath: string = os.homedir()
  localEntries: LocalEntry[] = []
  localFilter = ''
  localFilterPending = ''
  localFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private localClickTimer: ReturnType<typeof setTimeout> | null = null
  localPathInput = this.localPath
  localCache: any = null
  /** 本地选中条目（按 fullPath 匹配，避免框选/点击对象引用不一致） */
  private _selectedLocal: LocalEntry[] = []
  private _localSelectedPaths = new Set<string>()
  get selectedLocal(): LocalEntry[] { return this._selectedLocal }
  set selectedLocal(val: LocalEntry[]) {
    this._selectedLocal = val
    this._localSelectedPaths = new Set(val.map(e => e.fullPath))
  }
  localLastSelectedIndex: number | null = null
  /**
   * ★ 2026-09-29：方向键导航的「焦点行」与「Shift 扩展锚点」，按**导航键**记录（NavRow.key）：
   * 条目行 = fullPath，分组头行 = NAV_HEADER_KEY_PREFIX + bucketKey。
   * 与 localLastSelectedIndex（排序序下标，供鼠标 Shift+点击的 computeSelection 用）分开存放：
   * 分组模式下**显示序 ≠ 排序序**（详见 _navRows），键盘连续选择必须按屏幕序算区间，
   * 否则 Shift+↓ 会选中夹在别组里的条目。
   */
  private _localNavFocusKey: string | null = null
  private _localNavAnchorKey: string | null = null
  /**
   * ★ 2026-09-29（性能）：导航序列缓存（详见 _navCacheFor）。
   * 方向键连发时每步都要一份「显示序」序列；原实现每次都重建对象数组并 slice 各分组条目
   * （3000 条目实测 ≈0.16ms/步），还要用 findIndex 线性扫 2~3 遍找焦点/锚点。
   * 缓存的失效条件是「过滤列表引用」或「分组行引用」变化——分组行本身已有缓存（引用稳定），
   * 故一次键盘连发期间命中率接近 100%。
   */
  private _localNavCache: NavCache | null = null
  /**
   * ★ 2026-09-29：**键盘游标是否可见**（与 _localNavFocusKey 分开存）。
   * 焦点键本身在鼠标点击时也会写入（作为方向键的起点 / Shift 区间锚点，见 _onPaneClick），
   * 但「游标」这个视觉语义只在**键盘操作**时才该出现——否则用户随便点一行就会在行上留下
   * 一条无法解释的竖条。故：方向键移动后置 true，鼠标点击/选择集重置后置 false。
   */
  private _localNavCursorOn = false
  /** 上一次发起 listing 的本地目录：用于判定「目录已切换」并丢弃残留选择（见 _dropSelection） */
  private _lastLocalListedPath: string | null = null
  /** 本地面板是否正在加载 */
  _localLoading = false
  /** 本地面板刷新闪烁 */
  _localFlash = false
  /** 本地面板拖拽悬停（桌面文件拖入时高亮） */
  get _localDragOver(): boolean { return this._fileDnd?.localDragOver ?? false }
  /** 本地面板访问错误（权限不足、路径不存在等） */
  _localError = false

  // ========== 远程面板 ==========
  remotePath = '/'
  remoteEntries: SFTPFile[] = []
  remoteFilter = ''
  remoteFilterPending = ''
  remoteFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private remoteClickTimer: ReturnType<typeof setTimeout> | null = null

  // ---- 连接生命周期（connect / heartbeat / reconnect） ----
  private _connLifecycle!: PanelConnectionLifecycle
  remotePathInput = this.remotePath
  remoteCache: any = null
  /** 远程选中条目（按 fullPath 匹配） */
  private _selectedRemote: SFTPFile[] = []
  private _remoteSelectedPaths = new Set<string>()
  get selectedRemote(): SFTPFile[] { return this._selectedRemote }
  set selectedRemote(val: SFTPFile[]) {
    this._selectedRemote = val
    this._remoteSelectedPaths = new Set(val.map(e => e.fullPath))
  }
  remoteLastSelectedIndex: number | null = null
  /** 远端面板的方向键焦点/Shift 锚点（语义同 _localNavFocusKey / _localNavAnchorKey，同为导航键） */
  private _remoteNavFocusKey: string | null = null
  private _remoteNavAnchorKey: string | null = null
  /** 远端面板的导航序列缓存（语义同 _localNavCache） */
  private _remoteNavCache: NavCache | null = null
  /** 远端面板的键盘游标可见性（语义同 _localNavCursorOn） */
  private _remoteNavCursorOn = false
  /** 上一次发起 listing 的远程目录：用于判定「目录已切换」并丢弃残留选择（见 _dropSelection） */
  private _lastRemoteListedPath: string | null = null
  /** 远程面板是否正在加载 */
  _remoteLoading = false
  /** 远程面板刷新闪烁 */
  _remoteFlash = false
  /** 远程面板拖拽悬停（桌面文件拖入时高亮） */
  get _remoteDragOver(): boolean { return this._fileDnd?.remoteDragOver ?? false }
  /** 远程面板访问错误（权限不足、路径不存在等） */
  _remoteError = false

  private _rubberBand!: PanelRubberBand
  protected _headerReorder!: PanelHeaderReorder
  private _fileDnd!: PanelFileDnd
  private _fileDropRuntime!: PanelDropAdapter
  private _transferCoordinator!: PanelTransferCoordinator
  private _pasteAdapter!: PanelPasteAdapter
  private readonly localIdResolver = new IdNameResolver()
  private readonly remoteIdResolver = new IdNameResolver()
  private _conflictResolver!: PanelConflictResolver
  private _transferRuntime!: PanelTransferRuntime

  // ========== 传输 ==========
  transfers: PanelTransferItem[] = []

  // ========== 远程导航历史 ==========
  private readonly _remoteNav = new PaneNavHistory(50)
  private _ignoreNavPush = false
  get canRemoteBack(): boolean { return this._remoteNav.canBack && this.connected }
  get canRemoteForward(): boolean { return this._remoteNav.canForward && this.connected }

  // ========== 本地导航历史 ==========
  private readonly _localNav = new PaneNavHistory(50)
  /** 是否忽略历史记录（后退/前进导航时跳过记录） */
  private _ignoreLocalNavPush = false
  /** 是否可以后退 */
  get canLocalBack(): boolean { return this._localNav.canBack }
  get canLocalForward(): boolean { return this._localNav.canForward }

  // ========== 对话框 ==========
  deleteConfirmVisible = false
  /** ★ 2026-08-26 C4：删除确认单飞，防止 Enter 双通道并行删 */
  private _deleteBusy = false
  private _inputBusy = false
  deleteConfirmBatch = false  // true=批量, false=单个
  /** 单个删除时的条目信息 */
  deleteItemName = ''
  /** ★ 2026-09-21 P0 修复：删除确认框显示目标所在目录（单项与批量共用）——
   *  此前只显示文件名，选择残留跨目录时用户无法判断删的是哪个目录下的文件 */
  deleteItemLocation = ''
  deleteItemIsDir = false
  deleteItemType = ''
  deleteItemSize: string | null = null
  deleteItemDate = ''
  /** 批量删除提示文本 */
  batchDeleteText = ''
  /** 本地删除是否使用回收站（true=移入回收站，false=永久删除） */
  deleteToTrash = true
  private pendingLocalDelete: LocalEntry[] = []
  private pendingRemoteDelete: SFTPFile[] = []

  inputDialogVisible = false
  inputDialogTitle = ''
  inputDialogPlaceholder = ''
  inputDialogValue = ''
  private inputDialogMode: 'local-mkdir' | 'remote-mkdir' | 'local-rename' | 'remote-rename' | 'remote-chmod' | 'local-touch' | 'remote-touch' | null = null
  private inputDialogTargetPath: string | null = null
  private inputDialogRemotePath: string | null = null
  // ★ 2026-09-20 A8 审计修复：删除死成员 get inputDialogIsRename()（全仓库无引用，模板亦未使用）

  // ========== 右键菜单 ==========
  contextMenuX = 0
  contextMenuY = 0
  contextMenuPane: 'local' | 'remote' = 'local'

  // ========== 剪贴板 ==========
  clipboardEntries: (LocalEntry | SFTPFile)[] = []
  clipboardSource: 'local' | 'remote' = 'local'
  clipboardMode: 'copy' | 'cut' = 'copy'
  /** 最后点击/操作的面板，用于快捷键判断作用域 */
  activePane: 'local' | 'remote' = 'local'
  /** 方向键导航使用的面板（仅在实际点击条目时更新，不受 mouseenter 悬停影响） */
  private _arrowNavPane: 'local' | 'remote' | null = null
  /** 键入定位缓冲区（资源管理器式 type-ahead） */
  private _typeAheadBuf = ''
  /** 上次成功命中的前缀；用于「再输入同一前缀 → 下一个匹配」 */
  private _typeAheadLastHitPrefix = ''
  private _typeAheadResetTimer: ReturnType<typeof setTimeout> | null = null
  /** 最近一次 IME compositionend 时间，用于避免与后续 keydown 重复消费同一汉字 */
  private _typeAheadLastComposeAt = 0
  private static readonly _TYPE_AHEAD_RESET_MS = 800

  // ========== 详细信息对话框 ==========
  detailsVisible = false
  detailsEntry: LocalEntry | SFTPFile | null = null
  detailsIsLocal = false
  /** ★ 2026-08-11：文件夹大小按需计算的状态与结果（token 防异步过期回填） */
  detailsCalcState: 'idle' | 'calculating' | 'error' = 'idle'
  detailsCalcResult: string | null = null
  detailsCalcToken = 0


  /** P2-6: 表头右键菜单所需的列可见性快照（模板 [cols] 绑定） */
  get contextColVisibility(): ColVisibilityState {
    const isLocal = this.contextMenuPane === 'local'
    const v = (col: string): boolean => isLocal ? this._localColVisible(col) : this._remoteColVisible(col)
    return {
      size: v('size'),
      date: v('date'),
      created: v('created'),
      access: v('access'),
      owner: v('owner'),
      group: v('group'),
      perms: v('perms'),
      mode: v('mode'),
      path: v('path'),
      ext: v('ext'),
    }
  }
  // 表头右键菜单状态
  /** 表头右键菜单：当前右键的列名（如 'name', 'size'），用于"调整列宽" */

  // ========== 权限编辑对话框 ==========
  showPermDialog = false
  permOwnerRead = false
  permOwnerWrite = false
  permOwnerExec = false
  permGroupRead = false
  permGroupWrite = false
  permGroupExec = false
  permOtherRead = false
  permOtherWrite = false
  permOtherExec = false
  permModePreview = '755'
  permTargetPath = ''
  /** 当前修改权限的文件/文件夹名（供对话框显示） */
  permTargetName = ''

  // ========== 文件列表分组（★ 2026-09-28，类似 Windows「分组依据」）==========
  /** 本地面板分组依据（none=默认不分组），持久化到 localStorage */
  localGroupBy: GroupByMode = 'none'
  /** 远程面板分组依据 */
  remoteGroupBy: GroupByMode = 'none'
  /** 已折叠分组 key 集合（会话内状态，不持久化） */
  private _localCollapsedGroups = new Set<string>()
  private _remoteCollapsedGroups = new Set<string>()
  /** 折叠状态版本号（变更后使行缓存失效） */
  private _localCollapsedVersion = 0
  private _remoteCollapsedVersion = 0
  /** 分组行缓存（以过滤缓存引用 + 签名判定失效） */
  private _localRowsCache: GroupDisplayRow[] | null = null
  private _localRowsSource: any[] | null = null
  private _localRowsSig = ''
  private _remoteRowsCache: GroupDisplayRow[] | null = null
  private _remoteRowsSource: any[] | null = null
  private _remoteRowsSig = ''

  private _loadGroupBy(): void {
    try {
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const gl = localStorage.getItem(`${keyPrefix}.groupByLocal`) as GroupByMode | null
      const gr = localStorage.getItem(`${keyPrefix}.groupByRemote`) as GroupByMode | null
      const valid: GroupByMode[] = ['none', 'name', 'modified', 'type', 'size']
      if (gl && valid.includes(gl)) this.localGroupBy = gl
      if (gr && valid.includes(gr)) this.remoteGroupBy = gr
    } catch { /* 使用默认值 */ }
  }

  private _saveGroupBy(pane: 'local' | 'remote'): void {
    try {
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const v = pane === 'local' ? this.localGroupBy : this.remoteGroupBy
      localStorage.setItem(`${keyPrefix}.groupBy${pane === 'local' ? 'Local' : 'Remote'}`, v)
    } catch { /* 忽略持久化失败 */ }
  }

  /** 设置某面板的分组依据；切回 none 时清空折叠状态与行缓存 */
  setGroupBy(pane: 'local' | 'remote', mode: GroupByMode): void {
    if (pane === 'local') {
      this.localGroupBy = mode
      this._localCollapsedGroups.clear()
      this._localCollapsedVersion++
    } else {
      this.remoteGroupBy = mode
      this._remoteCollapsedGroups.clear()
      this._remoteCollapsedVersion++
    }
    this._saveGroupBy(pane)
  }

  /** 分组行签名：过滤缓存引用变化 / 模式 / 排序方向 / 折叠版本任一变化即失效 */
  private _rowsSig(pane: 'local' | 'remote'): string {
    const mode = pane === 'local' ? this.localGroupBy : this.remoteGroupBy
    const asc = pane === 'local' ? this.localSortAsc : this.remoteSortAsc
    const sortBy = pane === 'local' ? this.localSortBy : this.remoteSortBy
    const ver = pane === 'local' ? this._localCollapsedVersion : this._remoteCollapsedVersion
    return `${mode}|${asc ? 1 : 0}|${sortBy}|${ver}`
  }

  /** 分组显示行（分组关闭返回 null；模板据此走扁平路径） */
  getLocalGroupRows(): GroupDisplayRow[] | null {
    if (this.localGroupBy === 'none') return null
    const list = this.getFilteredLocalEntries()
    const sig = this._rowsSig('local')
    if (this._localRowsSource === list && this._localRowsSig === sig && this._localRowsCache) return this._localRowsCache
    const rows = buildGroupedRows(list, this.localGroupBy, this._reverseGroups('local'), this._localCollapsedGroups, b => this._groupLabel(b))
    this._localRowsCache = rows
    this._localRowsSource = list
    this._localRowsSig = sig
    return rows
  }

  getRemoteGroupRows(): GroupDisplayRow[] | null {
    if (this.remoteGroupBy === 'none') return null
    const list = this.getFilteredRemoteEntries()
    const sig = this._rowsSig('remote')
    if (this._remoteRowsSource === list && this._remoteRowsSig === sig && this._remoteRowsCache) return this._remoteRowsCache
    const rows = buildGroupedRows(list, this.remoteGroupBy, this._reverseGroups('remote'), this._remoteCollapsedGroups, b => this._groupLabel(b))
    this._remoteRowsCache = rows
    this._remoteRowsSource = list
    this._remoteRowsSig = sig
    return rows
  }

  /** 组序是否应反转：分组维度与当前排序列一致且为降序时反转（贴近资源管理器行为） */
  private _reverseGroups(pane: 'local' | 'remote'): boolean {
    const mode = pane === 'local' ? this.localGroupBy : this.remoteGroupBy
    const field = groupModeSortField(mode)
    if (!field) return false
    const sortBy = pane === 'local' ? this.localSortBy : this.remoteSortBy
    const asc = pane === 'local' ? this.localSortAsc : this.remoteSortAsc
    return sortBy === field && !asc
  }

  /** 分组桶 → 显示文本（type 模式的扩展名桶拼接「EXT 文件」；其余直接翻译） */
  private _groupLabel(b: { labelKey: string; arg?: string }): string {
    const base = this.i18n ? this.i18n.t(b.labelKey) : ''
    if (b.labelKey === 'group.typeFiles') return b.arg ? `${b.arg} ${base}` : base
    return base
  }

  /** 分组表头行：箭头点击 → 收/展 */
  onLocalGroupToggle(key: string): void {
    if (this._localCollapsedGroups.has(key)) this._localCollapsedGroups.delete(key)
    else this._localCollapsedGroups.add(key)
    this._localCollapsedVersion++
  }

  onRemoteGroupToggle(key: string): void {
    if (this._remoteCollapsedGroups.has(key)) this._remoteCollapsedGroups.delete(key)
    else this._remoteCollapsedGroups.add(key)
    this._remoteCollapsedVersion++
  }

  /**
   * 分组表头行：其余区域点击 → 切换该组选中态（★ 2026-09-29 由「仅全选」改为「全选⇄取消」）：
   * 组内条目已全部选中 → 从当前选择集中移除该组条目（其他组的选择保留）；
   * 否则 → 选中该组全部条目（替换当前选择，与原行为一致）。
   * 条目按 fullPath 识别，不依赖对象引用。
   */
  onLocalGroupSelect(key: string): void {
    const rows = this.getLocalGroupRows()
    const g = rows?.find(r => r.kind === 'header' && r.bucketKey === key)
    if (!g) return
    const items = (g.items || []) as any[]
    if (!items.length) return
    const sel = (this.selectedLocal || []) as any[]
    const paths = new Set(items.map((it: any) => it.fullPath))
    const allSelected = items.every((it: any) => sel.some((s: any) => s.fullPath === it.fullPath))
    if (allSelected) {
      this.selectedLocal = sel.filter((s: any) => !paths.has(s.fullPath)) as any
    } else {
      this.selectedLocal = [...items] as any
    }
    this.selectedRemote = []
    this.localLastSelectedIndex = null
    // ★ 2026-09-29：与点击条目行对称——键盘焦点/锚点落在该分组头（导航键），
    //   之后按 Shift+↑/↓ 即可从这一组（表头行）起算区间。
    this._localNavFocusKey = navHeaderKey(key)
    this._localNavAnchorKey = this._localNavFocusKey
    this._localNavCursorOn = false
  }

  /** 分组表头行：其余区域点击 → 切换该组选中态（逻辑同 onLocalGroupSelect，作用于远端面板） */
  onRemoteGroupSelect(key: string): void {
    const rows = this.getRemoteGroupRows()
    const g = rows?.find(r => r.kind === 'header' && r.bucketKey === key)
    if (!g) return
    const items = (g.items || []) as any[]
    if (!items.length) return
    const sel = (this.selectedRemote || []) as any[]
    const paths = new Set(items.map((it: any) => it.fullPath))
    const allSelected = items.every((it: any) => sel.some((s: any) => s.fullPath === it.fullPath))
    if (allSelected) {
      this.selectedRemote = sel.filter((s: any) => !paths.has(s.fullPath)) as any
    } else {
      this.selectedRemote = [...items] as any
    }
    this.selectedLocal = []
    this.remoteLastSelectedIndex = null
    // ★ 2026-09-29：同 onLocalGroupSelect，键盘焦点/锚点落在该分组头
    this._remoteNavFocusKey = navHeaderKey(key)
    this._remoteNavAnchorKey = this._remoteNavFocusKey
    this._remoteNavCursorOn = false
  }

  /** 右键菜单「分组依据」分发 */
  onGroupByMenuAction(mode: GroupByMode): void {
    const pane = this.contextMenuPane
    this.setGroupBy(pane, mode)
    this.contextMenuVisible = false
    this._safeDetect()
  }

  /** 右键菜单「展开/收起所有分组」分发：当前面板所有分组全折叠⇄全展开 */
  onGroupToggleAll(): void {
    const pane = this.contextMenuPane
    const collapsed = pane === 'local' ? this._localCollapsedGroups : this._remoteCollapsedGroups
    const rows = pane === 'local' ? this.getLocalGroupRows() : this.getRemoteGroupRows()
    const keys = (rows || []).filter(r => r.kind === 'header' && r.bucketKey != null).map(r => r.bucketKey as string)
    // 只要存在一个未折叠分组 → 折叠全部；否则（已全部折叠或为空）→ 展开全部
    const allCollapsed = keys.length > 0 && keys.every(k => collapsed.has(k))
    collapsed.clear()
    if (!allCollapsed) for (const k of keys) collapsed.add(k)
    if (pane === 'local') this._localCollapsedVersion++
    else this._remoteCollapsedVersion++
    this.contextMenuVisible = false
    this._safeDetect()
  }

  /** 当前面板是否所有分组都已折叠（供「展开/收起所有分组」按钮文案） */
  get groupAllCollapsed(): boolean {
    const pane = this.contextMenuPane
    const collapsed = pane === 'local' ? this._localCollapsedGroups : this._remoteCollapsedGroups
    const rows = pane === 'local' ? this.getLocalGroupRows() : this.getRemoteGroupRows()
    const keys = (rows || []).filter(r => r.kind === 'header' && r.bucketKey != null).map(r => r.bucketKey as string)
    return keys.length > 0 && keys.every(k => collapsed.has(k))
  }

  // ========== 表格样式设置（从设置页读取）==========

  private loadTableSettings(): void {
    // ★ 2026-09-28：加载文件列表分组依据
    this._loadGroupBy()
    try {
      // 直接从 localStorage 读取，绕过 _paneStore 缓存
      // 避免因 _paneFlushToConfig 导致的配置覆盖问题
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const borders = localStorage.getItem(`${keyPrefix}.colBorders`)
      const zebra = localStorage.getItem(`${keyPrefix}.zebra`)
      const pinLocal = localStorage.getItem(`${keyPrefix}.pinFoldersLocal`)
      const pinRemote = localStorage.getItem(`${keyPrefix}.pinFoldersRemote`)
      if (borders !== null) this.showColBorders = JSON.parse(borders)
      if (zebra !== null) this.showZebra = JSON.parse(zebra)
      if (pinLocal !== null) this.pinFoldersLocal = JSON.parse(pinLocal)
      if (pinRemote !== null) this.pinFoldersRemote = JSON.parse(pinRemote)
    } catch { /* 使用默认值 */ }
    // 显示隐藏文件：优先用眼睛按钮切换过的持久化状态；从未切换过则用设置页「默认显示隐藏文件」
    try {
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const hidLocal = localStorage.getItem(`${keyPrefix}.showHiddenLocal`)
      const hidRemote = localStorage.getItem(`${keyPrefix}.showHiddenRemote`)
      const defShow = this._readDefaultShowHidden()
      const newLocal = hidLocal !== null ? JSON.parse(hidLocal) === true : defShow
      const newRemote = hidRemote !== null ? JSON.parse(hidRemote) === true : defShow
      if (newLocal !== this.showHiddenLocal) { this.showHiddenLocal = newLocal; this._invalidateLocalCache() }
      if (newRemote !== this.showHiddenRemote) { this.showHiddenRemote = newRemote; this._invalidateRemoteCache() }
    } catch { /* 使用默认值 */ }
  }

  /** 读取设置页「其它」中的「默认显示隐藏文件」（全局，仅对从未按过眼睛按钮的面板生效） */
  private _readDefaultShowHidden(): boolean {
    try {
      return this.configService?.store?.['tabby-sftp-plus']?.defaultShowHidden === true
    } catch { return false }
  }

  // ========== 列宽调节 ==========
  /** 防止 resize / 表头拖拽后立即触发 sort click */

  get localResizingCol(): string | null {
    return this.resizing && this.resizePane === 'local' ? this.resizeCol : null
  }

  get remoteResizingCol(): string | null {
    return this.resizing && this.resizePane === 'remote' ? this.resizeCol : null
  }

  get localDraggingCol(): string | null {
    return this._headerReorder?.draggingColFor('local') ?? null
  }

  get remoteDraggingCol(): string | null {
    return this._headerReorder?.draggingColFor('remote') ?? null
  }

  get localHeaderPreviewCols(): string[] | null {
    return this._headerReorder?.previewColsFor('local') ?? null
  }

  get remoteHeaderPreviewCols(): string[] | null {
    return this._headerReorder?.previewColsFor('remote') ?? null
  }

  get localHeaderPreviewWidths(): string {
    const preview = this.localHeaderPreviewCols
    return preview ? this._buildColWidths('local', preview) : ''
  }

  get remoteHeaderPreviewWidths(): string {
    const preview = this.remoteHeaderPreviewCols
    return preview ? this._buildColWidths('remote', preview) : ''
  }

  get localDropIndicatorCol(): string | null {
    return this._headerReorder?.dropIndicatorColFor('local') ?? null
  }

  get localDropIndicatorAfter(): boolean {
    return this._headerReorder?.dropIndicatorAfterFor('local') ?? false
  }

  get remoteDropIndicatorCol(): string | null {
    return this._headerReorder?.dropIndicatorColFor('remote') ?? null
  }

  get remoteDropIndicatorAfter(): boolean {
    return this._headerReorder?.dropIndicatorAfterFor('remote') ?? false
  }


  /** 根据列和面板获取当前排序箭头 */

  /** 列值渲染（同时适用于 LocalEntry 和 SFTPFile） */









  /** 移动列位置 */


  /** 切换文件夹置顶 */

  /** 切换显示隐藏文件 */



  /** 将当前右键的列调整为合适的大小 */

  /** 将所有列调整为合适的大小 */

  /** P2-12: 复用 canvas 测量文本宽度，避免每次创建新 canvas */

  /** 测量列内容的渲染宽度 */

  /** 设置指定列的宽度 */


  /** 面板空白区域右键：显示面板级上下文菜单 */
  onPaneContextMenu(ev: MouseEvent): void {
    ev.preventDefault()
    ev.stopPropagation()
    // 先清除框选遗留的菜单抑制标志（与 _onPaneContextMenu 文件项右键保持一致），
    // 否则左键刚按下时挂起的 400ms 抑制会把这次空白区右键菜单吞掉（双键同按场景）
    this._rubberBand.clearContextMenuSuppress()
    // 关闭表头右键菜单，只保留最新右键的菜单
    this.headerMenuVisible = false
    this.headerMenuCol = null
    if (this._rubberBand.active) return
    if (this._rubberBand.suppressContextMenu || this._rubberBand.skipNextContextMenu) return

    // 空白区域右键：清除该面板选中，显示面板级上下文菜单
    const target = ev.target as HTMLElement
    const paneList = target.closest('.pane-list') as HTMLElement | null
    // ★ 2026-09-28 修复：分组表头复用 .header 类，会被上面 .entry:not(.header) 判定误判为「空白区」，
    //   导致右键分组头把已选中的整组清空。分组头右键应保留选中（菜单动作作用于整组选择集）
    const onGroupHeader = !!(target.closest('.entry.header.group-row'))
    if (!target.closest('.entry:not(.header)') && paneList) {
      // 清除该面板选中（分组头右键除外，保留选中态）
      if (!onGroupHeader) {
        if (paneList.classList.contains('local-pane')) {
          this.selectedLocal = []
          this.localLastSelectedIndex = null
        } else if (paneList.classList.contains('remote-pane')) {
          this.selectedRemote = []
          this.remoteLastSelectedIndex = null
        }
        try { this._safeDetect() } catch {}
      }

      // 显示面板级上下文菜单（新建、刷新等）
      const pane = paneList.classList.contains('local-pane') ? 'local' : 'remote'
      this.contextMenuEntry = null
      this.contextMenuPane = pane
      this.zone.run(() => {
        this.closeBookmarks()
        this.headerMenuVisible = false
        this.contextMenuX = ev.clientX
        this.contextMenuY = ev.clientY
        this.contextMenuVisible = true
        this._safeDetect()
        this.fixContextMenuPosition(ev.clientX, ev.clientY)
      })
      return
    }
  }





  /** 获取本地面板列宽引用对象（用于 resize 修改） */

  /** 获取远程面板列宽引用对象（用于 resize 修改） */





  // ========== 路径模式（方案 A：三选一）==========
  /** off=关闭 / remember=路径记忆 / sync=与终端同步 */
  pathMode: PathFollowMode = 'off'
  private static PATH_MODE_KEY = 'sftp-plus-path-mode'
  private static REMEMBER_PATH_KEY = 'sftp-plus-path-mem'
  private static SAVED_LOCAL_PATH_KEY = 'sftp-plus-saved-local-path'
  private static SAVED_REMOTE_PATH_KEY = 'sftp-plus-saved-remote-path'
  private _cwdSyncTimer: ReturnType<typeof setTimeout> | null = null
  private _cwdPolling = false
  private _lastSyncedCwd = ''

  /** 兼容旧逻辑的 getter（仅路径记忆模式为 true） */
  get rememberPath(): boolean {
    return this.pathMode === 'remember'
  }

  /** 获取当前配置的唯一标识，用于 per-profile 独立路径记忆 */
  private get _hostKey(): string {
    const h = this.profile?.options?.host || ''
    const u = this.profile?.options?.username || this.profile?.options?.user || ''
    return (u ? `${u}@` : '') + h || '__default'
  }

  private _profileKey(base: string): string {
    return `${base}.${this._hostKey}`
  }

  private loadPathMode(): void {
    try {
      // 优先读 localStorage（savePathMode 写入点）
      const raw = localStorage.getItem(this._profileKey(SftpFloatingPanel.PATH_MODE_KEY))
      if (raw === 'off' || raw === 'remember' || raw === 'sync') {
        this.pathMode = raw as PathFollowMode
        return
      }
      // 兼容旧版 rememberPath 布尔开关
      const legacy = localStorage.getItem(this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY))
      if (legacy === 'true') {
        this.pathMode = 'remember'
        return
      }
    } catch { /* 使用默认值 */ }
    // 该连接未单独切换过 → 使用设置页「其它」中配置的默认路径模式
    this.pathMode = this._readDefaultPathMode()
  }

  /** 读取设置页「其它」中的默认路径模式（全局，仅对未单独切换过的连接生效） */
  private _readDefaultPathMode(): PathFollowMode {
    try {
      const v = this.configService?.store?.['tabby-sftp-plus']?.defaultPathMode
      if (v === 'off' || v === 'remember' || v === 'sync') return v
    } catch { /* ignore */ }
    return 'off'
  }

  /** 设置页默认路径模式变更时套用（仅当该连接从未在面板上单独切换过路径模式） */
  private _applyDefaultPathMode(): void {
    try {
      const raw = localStorage.getItem(this._profileKey(SftpFloatingPanel.PATH_MODE_KEY))
      if (raw === 'off' || raw === 'remember' || raw === 'sync') return // 已单独设置，保持不变
      const legacy = localStorage.getItem(this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY))
      if (legacy === 'true') return
    } catch { return }
    const def = this._readDefaultPathMode()
    if (def === this.pathMode) return
    this.pathMode = def
    // 不调用 savePathMode()：默认值不写 per-host key，连接继续跟随全局默认
    if (def === 'sync') {
      this._cwdSetupPrompted = false
      this._startCwdSync()
      void this._syncRemoteToTerminalCwd(true)
    } else {
      this._stopCwdSync()
      this.cwdSetupVisible = false
      this._cwdSetupPrompted = false
    }
    if (def === 'remember') this.saveCurrentPath()
  }

  private savePathMode(): void {
    try {
      localStorage.setItem(this._profileKey(SftpFloatingPanel.PATH_MODE_KEY), this.pathMode)
      localStorage.setItem(
        this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY),
        this.pathMode === 'remember' ? 'true' : 'false',
      )
    } catch { /* ignore */ }
  }

/** 保存当前路径（仅路径记忆模式）。
 *  ★ configService.save() 经 sftpConfig.set() 路径已被证实无法落盘（sftpConfig 内的 configService 为 null），
 *    改为 localStorage 直接读写，稳定可靠且不触碰 config.yaml。 */
  protected saveCurrentPath(): void {
    if (this.pathMode !== 'remember') return
    try {
      localStorage.setItem(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY), this.localPath)
      localStorage.setItem(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY), this.remotePath)
      // ★ 2026-09-21 P2 修复：同步写嵌套配置路径——_restoreSavedRemotePath 经 _paneGet
      //   嵌套优先读取，只写 localStorage 会让迁移用户的嵌套旧值永远压过新值（路径记忆「卡住」）
      this._paneSet(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY), this.localPath)
      this._paneSet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY), this.remotePath)
    } catch { /* ignore */ }
  }

  pathModeTitle(): string {
    if (this.pathMode === 'remember') return this.i18n.t('path.modeRemember')
    if (this.pathMode === 'sync') return this.i18n.t('path.modeSync')
    return this.i18n.t('path.modeOff')
  }

  /** 循环：关闭 → 路径记忆 → 终端同步 → 关闭 */
  cyclePathMode(): void {
    const order: PathFollowMode[] = ['off', 'remember', 'sync']
    const idx = order.indexOf(this.pathMode)
    const next = order[(idx + 1) % order.length]
    this.setPathMode(next)
  }

  private setPathMode(mode: PathFollowMode): void {
    const prev = this.pathMode
    this.pathMode = mode
    this.savePathMode()

    if (mode === 'remember') {
      this.saveCurrentPath()
    } else if (prev === 'remember') {
      try {
        const localKey = this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY)
        const remoteKey = this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY)
        // 从新配置结构删除（remove 自动 flush）
        const localNew = this._mapPaneKey(localKey)
        const remoteNew = this._mapPaneKey(remoteKey)
        if (localNew && this.sftpConfig) this.sftpConfig.remove(localNew)
        if (remoteNew && this.sftpConfig) this.sftpConfig.remove(remoteNew)
        try { localStorage.removeItem(localKey) } catch {}
        try { localStorage.removeItem(remoteKey) } catch {}
      } catch { /* ignore */ }
    }

    if (mode === 'sync') {
      this._cwdSetupPrompted = false
      this._startCwdSync()
      void this._syncRemoteToTerminalCwd(true)
    } else {
      this._stopCwdSync()
      this.cwdSetupVisible = false
      this._cwdSetupPrompted = false
    }
  }

  /**
   * 读取终端当前工作目录。
   * 依赖 shell 上报 OSC 1337 CurrentDir（需用户确认后配置；插件不会擅自向终端注入命令）。
   */
  private async tryGetTerminalCwd(): Promise<string | null> {
    try {
      const term = this.terminalRef as {
        session?: {
          supportsWorkingDirectory?: () => boolean
          getWorkingDirectory?: () => Promise<string | null>
          reportedCWD?: string | null
        } | null
      } | null
      const session = term?.session
      if (!session) return null
      if (typeof session.reportedCWD === 'string' && session.reportedCWD) {
        return this._normalizeRemoteCwd(session.reportedCWD)
      }
      if (!session.getWorkingDirectory) return null
      if (session.supportsWorkingDirectory && !session.supportsWorkingDirectory()) return null
      const cwd = await session.getWorkingDirectory()
      if (!cwd || typeof cwd !== 'string') return null
      return this._normalizeRemoteCwd(cwd)
    } catch {
      return null
    }
  }

  private _normalizeRemoteCwd(cwd: string): string {
    const normalized = cwd.replace(/\\/g, '/').replace(/\/+$/, '') || '/'
    return normalized.startsWith('/') ? normalized : `/${normalized}`
  }

  private _startCwdSync(): void {
    if (this._cwdSyncTimer) {
      clearTimeout(this._cwdSyncTimer)
      this._cwdSyncTimer = null
    }
    this._cwdPolling = false
    if (this.pathMode !== 'sync') return
    const tick = (): void => {
      if (this._cwdPolling) {
        // 上一轮尚未完成，等下一轮再试
        this._cwdSyncTimer = setTimeout(tick, 800)
        return
      }
      this._cwdPolling = true
      void this._syncRemoteToTerminalCwd(false).finally(() => {
        this._cwdPolling = false
        if (this.pathMode === 'sync') {
          this._cwdSyncTimer = setTimeout(tick, 800)
        }
      })
    }
    this._cwdSyncTimer = setTimeout(tick, 800)
  }

  private _stopCwdSync(): void {
    if (this._cwdSyncTimer) {
      clearTimeout(this._cwdSyncTimer)
      this._cwdSyncTimer = null
    }
    this._cwdPolling = false
    this._lastSyncedCwd = ''
  }

  cwdSetupVisible = false
  private _cwdSetupPrompted = false

  /**
   * 将远程面板路径跟随终端 cwd（仅 sync 模式）。
   * @param offerSetup 用户主动切换到同步且尚无 cwd 时，弹出确认配置对话框（不自动注入）
   */
  private async _syncRemoteToTerminalCwd(offerSetup: boolean): Promise<void> {
    if (this.pathMode !== 'sync' || !this.connected) return

    const cwd = await this.tryGetTerminalCwd()
    if (!cwd) {
      if (offerSetup && !this.cwdSetupVisible && !this._cwdSetupPrompted) {
        this._cwdSetupPrompted = true
        this.cwdSetupVisible = true
        this._safeDetect()
      }
      return
    }
    this._cwdSetupPrompted = false
    if (!offerSetup && cwd === this._lastSyncedCwd) return
    if (!offerSetup && cwd === this.remotePath) {
      this._lastSyncedCwd = cwd
      return
    }
    this._lastSyncedCwd = cwd
    this.remotePath = cwd
    this.remotePathInput = cwd
    if (offerSetup) this._pushRemoteNav(cwd)
    await this.refreshRemote()
    this._safeDetect()
  }

  async onCwdSetupChoice(choice: CwdSetupChoice): Promise<void> {
    this.cwdSetupVisible = false
    if (choice === 'cancel') {
      // 取消 = 放弃同步，回到路径模式关闭
      this.setPathMode('off')
      this._safeDetect()
      return
    }
    const ok = choice === 'permanent'
      ? await this._enableCwdReporterPermanent()
      : this._enableCwdReporterSession()
    if (!ok) {
      this.showToast(this.i18n.t('path.cwdSetupFailed'))
      this.setPathMode('off')
      this._safeDetect()
      return
    }
    this.showToast(this.i18n.t('path.cwdSetupDone'))
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 200))
      if (this.pathMode !== 'sync') return
      const cwd = await this.tryGetTerminalCwd()
      if (cwd) {
        this._lastSyncedCwd = cwd
        this.remotePath = cwd
        this.remotePathInput = cwd
        this._pushRemoteNav(cwd)
        await this.refreshRemote()
        this._safeDetect()
        return
      }
    }
    this._safeDetect()
  }

  /** 仅当前交互会话：用户确认后向终端发送临时 PS1 上报 */
  private _enableCwdReporterSession(): boolean {
    const term = this.terminalRef as { sendInput?: (data: string) => void } | null
    if (!term?.sendInput) return false
    try {
      term.sendInput(CWD_SESSION_CMD + '\n')
      return true
    } catch (e) {
      log.warn('Session cwd reporter failed', e)
      return false
    }
  }

  /**
   * 永久写入：经确认后通过独立 SSH exec 追加到 ~/.bashrc 或 ~/.zshrc，
   * 再向当前终端 source + 立即上报（仍经用户点击「永久写入」确认）。
   */
  private async _enableCwdReporterPermanent(): Promise<boolean> {
    if (!this.sshSession) return false
    const marker = '# tabby-sftp-plus cwd reporting'
    const shellOut = (await execSshCommand(
      this.sshSession,
      'echo "${SHELL:-}"; [ -n "${BASH_VERSION:-}" ] && echo BASH; [ -n "${ZSH_VERSION:-}" ] && echo ZSH; true',
    )).toLowerCase()
    const useZsh = /zsh/.test(shellOut)
    const rcFile = useZsh ? '$HOME/.zshrc' : '$HOME/.bashrc'
    const snippet = useZsh ? CWD_ZSH_SNIPPET + '\n' : CWD_BASH_SNIPPET + '\n'

    log.info(`Enabling permanent CWD reporting — target: ${useZsh ? '~/.zshrc' : '~/.bashrc'}`)

    const b64 = Buffer.from(snippet, 'utf8').toString('base64')
    /* Shell logic (all in one SSH round-trip):
     *  1. Idempotency — if marker already present, skip write entirely.
     *  2. One-time backup — copy rcFile → rcFile.sftp-plus-backup only when
     *     we are about to modify it for the first time.
     *  3. Append the base64-decoded snippet.
     */
    const writeCmd =
      `RC=${rcFile}; ` +
      `if grep -qF '${marker}' "$RC" 2>/dev/null; then ` +
        `echo ALREADY; ` +
      `else ` +
        `cp -p "$RC" "$RC.sftp-plus-backup" 2>/dev/null; ` +
        `echo '${b64}' | base64 -d >> "$RC"; ` +
        `echo WRITTEN; ` +
      `fi`
    const result = await execSshCommand(this.sshSession, writeCmd)
    if (/\bALREADY\b/.test(result)) {
      log.info('CWD reporting already present in rc file — skipped write')
    } else if (/\bWRITTEN\b/.test(result)) {
      log.warn(`Backed up original to ${useZsh ? '~/.zshrc.sftp-plus-backup' : '~/.bashrc.sftp-plus-backup'} and appended CWD reporting snippet`)
    } else {
      log.warn('Unexpected response when writing CWD reporter:', result)
      return false
    }

    const term = this.terminalRef as { sendInput?: (data: string) => void } | null
    if (term?.sendInput) {
      const apply = useZsh
        ? `source ~/.zshrc >/dev/null 2>&1; printf "\\033]1337;CurrentDir=%s\\007" "\${PWD:-\$(pwd)}"\n`
        : `source ~/.bashrc >/dev/null 2>&1; printf "\\033]1337;CurrentDir=%s\\007" "\${PWD:-\$(pwd)}"\n`
      try { term.sendInput(apply) } catch { /* 文件已写入即可 */ }
    }
    return true
  }

  /**
   * 根据偏好布局 + 实际宽高，计算「真正渲染」的布局。
   * 偏好（_layoutMode）始终保留；空间不够时临时回退，并记录原因供提示。
   * - horizontal + 过窄 → 上下（too-narrow）
   * - vertical + 过矮 → 左右（too-short）；若同时过窄 → 单栏（too-cramped）
   * - auto：按宽高自适应，不算「违背偏好」，不弹强制回退提示
   */
  private _resolveEffectiveLayout(measuredW?: number, measuredH?: number): {
    split: 'horizontal' | 'vertical' | 'single'
    reason: null | 'too-narrow' | 'too-short' | 'too-cramped'
  } {
    if (this._layoutMode === 'single') return { split: 'single', reason: null }

    const w = typeof measuredW === 'number' && measuredW > 0
      ? measuredW
      : this._measureLayoutWidth()
    let h = typeof measuredH === 'number' && measuredH > 0 ? measuredH : 0
    if (h <= 0) {
      try {
        const body = this.elRef?.nativeElement?.querySelector('.sftp-body') as HTMLElement | null
        if (body) h = this._measureBodySize(body).h
      } catch { /* ignore */ }
    }
    if (h <= 0) h = 480

    const tooNarrow = w < SftpFloatingPanel._HORIZONTAL_FALLBACK_WIDTH
    const tooShort = h < SftpFloatingPanel._VERTICAL_FALLBACK_HEIGHT

    if (this._layoutMode === 'horizontal') {
      if (tooNarrow && tooShort) return { split: 'single', reason: 'too-cramped' }
      if (tooNarrow) return { split: 'vertical', reason: 'too-narrow' }
      return { split: 'horizontal', reason: null }
    }

    if (this._layoutMode === 'vertical') {
      if (tooShort && tooNarrow) return { split: 'single', reason: 'too-cramped' }
      if (tooShort) return { split: 'horizontal', reason: 'too-short' }
      return { split: 'vertical', reason: null }
    }

    // auto：按空间选最合适；过窄且过矮时单栏更可用
    if (tooNarrow && tooShort) return { split: 'single', reason: 'too-cramped' }
    if (tooNarrow || w <= SftpFloatingPanel._AUTO_NARROW_WIDTH) return { split: 'vertical', reason: null }
    if (tooShort) return { split: 'horizontal', reason: null }
    return { split: 'horizontal', reason: null }
  }

  /** 同步有效布局到 `_effectiveLayout` / `_isNarrowLayout` / 回退原因 */
  private _syncNarrowLayout(measuredW?: number, measuredH?: number): void {
    const { split, reason } = this._resolveEffectiveLayout(measuredW, measuredH)
    this._effectiveLayout = split
    this._layoutOverrideReason = reason
    this._isNarrowLayout = split === 'vertical'
  }

  /** 布局回退文案（面板内 toast + 按钮 title） */
  private _layoutOverrideToastMessage(): string {
    const reason = this._layoutOverrideReason
    if (!reason) return ''
    const key =
      reason === 'too-narrow' ? 'layout.override.tooNarrow'
        : reason === 'too-short' ? 'layout.override.tooShort'
          : 'layout.override.tooCramped'
    return this.i18n.t(key)
  }

  /**
   * 在偏好被空间限制临时改写时提示用户。
   * - force：用户手动点布局按钮时必提示（若有回退）
   * - 否则仅在 reason 变化时提示，避免 resize 刷屏
   */
  private _maybeAnnounceLayoutOverride(force = false): void {
    const reason = this._layoutOverrideReason
    // auto 的 too-cramped 也提示；其它 auto 自适应不算「违背偏好」
    const shouldTell =
      !!reason &&
      (force || reason !== this._lastAnnouncedOverrideReason) &&
      (this._layoutMode !== 'auto' || reason === 'too-cramped' || force)
    if (!shouldTell) {
      if (!reason) this._lastAnnouncedOverrideReason = null
      return
    }
    this._lastAnnouncedOverrideReason = reason
    const msg = this._layoutOverrideToastMessage()
    if (msg) this.showToast(msg, force ? 4200 : 3200)
  }

  /** 循环切换布局模式：auto → horizontal → vertical → single → auto
   *  写入 configService.store（Tabby config.yaml），通知设置页同步 */
  cycleLayoutMode(): void {
    const order: Array<'auto' | 'horizontal' | 'vertical' | 'single'> = ['auto', 'horizontal', 'vertical', 'single']
    const idx = order.indexOf(this._layoutMode)
    this._layoutMode = order[(idx + 1) % order.length]
    try {
      // 修复：写入与面板读取一致的路径（paneState/layout/mode）。
      // 原仅写顶层 store.layoutMode，而面板 ngOnInit 与设置变更 handler 均读
      // sftpConfig.get('paneState/layout/mode')（嵌套路径），导致切换后立即可被
      // settings-changed 事件覆盖回 auto（顶部按钮"无法切换自适应布局"）。
      // 双写：嵌套路径（面板实际读取）+ 顶层（兼容 config schema / 设置页读取）。
      this.sftpConfig?.set('paneState/layout/mode', this._layoutMode)
      const target = this.configService?.store?.['tabby-sftp-plus']
      if (target) { target.layoutMode = this._layoutMode; this.configService?.save() }
    } catch {}
    if (this._layoutMode === 'single') this.activePane = 'remote'
    this._syncNarrowLayout()
    setTimeout(() => {
      this._safeDetect() // 先让 *ngIf 按 _effectiveLayout 卸掉本地面板
      this._applyPaneSplit()
      this._maybeAnnounceLayoutOverride(true)
    }, 50)
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch {}
  }

  /** 根据容器宽度更新自动布局状态 */
  private _updateAutoLayout(): void {
    if (this._layoutMode !== 'auto') return
    this._syncNarrowLayout()
  }

  /** 读取可用于布局计算的容器宽度 */
  private _measureLayoutWidth(): number {
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return SftpFloatingPanel._AUTO_NARROW_WIDTH
    // 浮动面板：以面板自身宽度判断窄屏（祖先为遮罩/终端，远大于面板，不能取最大值）
    if (this.displayMode === 'floating') {
      return root.clientWidth > 0 ? root.clientWidth : SftpFloatingPanel._AUTO_NARROW_WIDTH
    }
    const widths: number[] = []
    let el: HTMLElement | null = root
    for (let i = 0; i < 6 && el; i++) {
      if (el.clientWidth > 0) widths.push(el.clientWidth)
      el = el.parentElement
    }
    if (widths.length) return Math.max(...widths)
    return SftpFloatingPanel._AUTO_NARROW_WIDTH
  }

  /** 工作区标签页：在宿主布局稳定后刷新自适应布局 */
  refreshWorkspaceLayout(): void {
    if (this.displayMode !== 'workspace') return
    this._scheduleLayoutRefresh()
  }

  /**
   * 布局刷新调度。
   *
   * ResizeObserver 回调在浏览器完成 Layout 阶段之后执行，此时
   * clientWidth/clientHeight 已是最新值，无需强制同步回流。
   * 频繁的 `void elem.offsetHeight`（尤其是文件传输时）会导致严重卡顿。
   *
   * 去重逻辑：先读 body 尺寸，无变化则直接跳过——无布局计算、无 detectChanges。
   */
  private _scheduleLayoutRefresh(): void {
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return

    const body = root.querySelector('.sftp-body') as HTMLElement | null
    if (body) {
      const { w, h } = this._measureBodySize(body)
      if (this._layoutMode === 'single') {
        this._effectiveLayout = 'single'
        this._layoutOverrideReason = null
        this._isNarrowLayout = false
      } else {
        this._syncNarrowLayout(w > 0 ? w : undefined, h > 0 ? h : undefined)
      }
      if (
        w === this._lastLayoutBodyW &&
        h === this._lastLayoutBodyH &&
        this._isNarrowLayout === this._lastLayoutNarrow &&
        this._effectiveLayout === this._lastEffectiveLayout &&
        this._layoutOverrideReason === this._lastOverrideReason
      ) return
      this._lastLayoutBodyW = w
      this._lastLayoutBodyH = h
      this._lastLayoutNarrow = this._isNarrowLayout
      this._lastEffectiveLayout = this._effectiveLayout
      this._lastOverrideReason = this._layoutOverrideReason
    } else if (this._layoutMode !== 'single') {
      this._syncNarrowLayout()
    } else {
      this._effectiveLayout = 'single'
      this._layoutOverrideReason = null
      this._isNarrowLayout = false
    }
    this._applyPaneSplit()
    this._maybeAnnounceLayoutOverride(false)
    this._safeDetect()
  }

  /** 窗口尺寸变化时关闭悬浮菜单，避免位置错位 */
  private _closeFloatingPanelsOnResize(): void {
    let changed = false
    if (this.showBookmarks) {
      this.closeBookmarks()
      changed = true
    }
    if (this.contextMenuVisible) {
      this.contextMenuVisible = false
      this.contextMenuEntry = null
      changed = true
    }
    if (this.headerMenuVisible) {
      this.headerMenuVisible = false
      this.headerMenuCol = null
      changed = true
    }
    if (changed) this._safeDetect()
  }

  private _bindLayoutObservers(): void {
    const root = this.elRef?.nativeElement as HTMLElement | null
    if (!root) return

    this._ro = new ResizeObserver(() => this._scheduleLayoutRefresh())
    this._ro.observe(root)

    if (this.displayMode === 'workspace') {
      const seen = new Set<HTMLElement>()
      let el: HTMLElement | null = root
      for (let i = 0; i < 6 && el; i++) {
        if (!seen.has(el)) {
          seen.add(el)
          try { this._ro.observe(el) } catch { /* ignore */ }
        }
        el = el.parentElement
      }
    }
    if (!this._winResizeHandler) {
      this._winResizeHandler = () => {
        this._closeFloatingPanelsOnResize()
        this._clampGeometryToParent()
        this._scheduleLayoutRefresh()
      }
      window.addEventListener('resize', this._winResizeHandler)
    }
  }

  /** 读取双栏主体可用宽高（工作区标签页会向上查找宿主尺寸） */
  private _measureBodySize(body: HTMLElement): { w: number; h: number } {
    let w = body.clientWidth
    let h = body.clientHeight
    if (this.displayMode === 'workspace' && (w <= 0 || h <= 0)) {
      const host = body.closest('sftp-plus-workspace-tab') as HTMLElement | null
      if (host) {
        if (w <= 0) w = host.clientWidth
        if (h <= 0) h = host.clientHeight
      }
    }
    if (w <= 0) w = this._measureLayoutWidth()
    if (h <= 0) h = Math.max(320, (window.innerHeight || 800) - 140)
    return { w, h }
  }

  /** 布局模式按钮悬浮提示（有回退时标明偏好→实际） */
  layoutModeTitle(): string {
    const map: Record<string, string> = {
      auto: this.i18n.t('layout.mode.auto'),
      horizontal: this.i18n.t('layout.mode.horizontal'),
      vertical: this.i18n.t('layout.mode.vertical'),
      single: this.i18n.t('layout.mode.single'),
    }
    const preferred = map[this._layoutMode] || this.i18n.t('layout.mode.auto')
    if (!this._layoutOverrideReason) return preferred
    const actual = map[this._effectiveLayout] || this._effectiveLayout
    const reason =
      this._layoutOverrideReason === 'too-narrow' ? this.i18n.t('layout.override.reasonNarrow')
        : this._layoutOverrideReason === 'too-short' ? this.i18n.t('layout.override.reasonShort')
          : this.i18n.t('layout.override.reasonCramped')
    return this.i18n.t('layout.override.title', { preferred, actual, reason })
  }

  /** 面板分割线悬浮提示 */
  splitterTitle(): string {
    return this._isNarrowLayout
      ? this.i18n.t('pane.splitterHintVertical')
      : this.i18n.t('pane.splitterHintHorizontal')
  }

  /** 恢复路径（仅路径记忆模式），优先读 localStorage（saveCurrentPath 写入点）。 */
  private _loadSavedPaths(): void {
    this.loadPathMode()
    if (this.pathMode !== 'remember') return
    try {
      const savedLocal = localStorage.getItem(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY))
      if (savedLocal && typeof savedLocal === 'string') {
        this.localPath = savedLocal; this.localPathInput = savedLocal
      }
      const savedRemote = localStorage.getItem(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
      if (savedRemote && typeof savedRemote === 'string') {
        this.remotePath = savedRemote; this.remotePathInput = savedRemote
      }
    } catch (e) { log.warn('Failed to load saved paths', e) }
  }

  /** connect() 后恢复远程路径（防止 getDefaultRemotePath 覆盖） */
  private _restoreSavedRemotePath(): void {
    try {
      const savedRemote = this._paneGet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
      if (savedRemote) {
        this.remotePath = savedRemote
        this.remotePathInput = savedRemote
      }
    } catch { /* 忽略 */ }
  }

  // ========== 传输日志 ==========
  showTransferLog = false
  transfersMinimized = false  // 传输面板是否最小化（显示小指示器）
  transfersHidden = false     // 传输面板是否完全隐藏（不影响传输继续）
  paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'> = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
  /** 被隐藏的工具栏项（设置页定制工具栏中取消勾选的项） */
  paneHiddenItems: string[] = []
  logFilterOp: '' | TransferLogEntry['operation'] = ''
  logFilterStatus: '' | 'success' | 'failed' = ''
  logFilterTimeRange: '' | 'today' | '7d' | '30d' | 'custom' = ''
  logFilterDateFrom = ''
  logFilterDateTo = ''

  // ========== 文件冲突对话框 ==========
  showConflictDialog = false
  conflictData: ConflictFileInfo | null = null

  // ========== 传输目标目录不存在对话框（2026-09-28） ==========
  dirMissingVisible = false
  /** 不存在的目标目录完整路径（仅用于展示） */
  dirMissingDir = ''
  /** true = 远程目录（上传）；false = 本地目录（下载） */
  dirMissingIsRemote = false
  /** 请求目录与面板当前目录不同时才显示「使用当前目录」回退按钮 */
  dirMissingShowFallback = true
  /** 等待用户在目录不存在对话框上做出选择的 resolver */
  private _dirMissingResolve: ((c: 'create' | 'fallback' | 'cancel') => void) | null = null
  /**
   * ★ 2026-09-21：冲突框文件名旁图标与列表/属性框共用 resolveDetailsIcon
   *   （如 .log → text.svg），避免再显示与列表不一致的 📄 emoji。
   */
  get conflictFileIconUrl(): string | null {
    const d = this.conflictData
    if (!d) return null
    return this.resolveDetailsIcon({ name: d.fileName, isDirectory: !!d.isDirectory })
  }
  /** 当前冲突在处理队列中的索引（从 1 开始），-1 表示未知 */
  conflictCurrIdx = 1
  /** 总冲突数 */
  conflictTotalIdx = 1
  /** 原始冲突总数（第一次入队时记录，后续不随队列缩短而变化） */
  conflictOriginalTotal = 1
  /** 待处理的冲突队列 */
  private _conflictQueue: Array<{
    localPath: string; remoteDir: string; fileName: string;
    remotePath: string; localStat: fsSync.Stats;
    /** 冲突方向：上传（本地→远程）或下载（远程→本地） */
    direction: 'upload' | 'download';
    /** 下载冲突时远程文件的原始大小 */
    remoteFileSize?: number;
    /** 下载冲突时远程文件的原始 mtimeMs */
    remoteFileMtime?: number;
    /** 是否为同面板粘贴操作导致的冲突 */
    isSamePane?: boolean;
    /** 同面板时的源面板 */
    samePaneSource?: 'local' | 'remote';
    /** 是否为目录冲突 */
    isDirectory?: boolean;
  }> = []
  /** "全部"操作的记忆模式: 'ask' | 'overwrite' | 'skip' | 'rename' */
  private _conflictAllMode: string = 'ask'

  // ========== 面板分割线（上下/左右布局共用） ==========
  _isNarrowLayout = false
  /** 实际渲染布局（可能因空间不足与偏好 _layoutMode 不同） */
  _effectiveLayout: 'horizontal' | 'vertical' | 'single' = 'horizontal'
  /** 空间不足导致的临时回退原因；null = 按偏好原样显示 */
  _layoutOverrideReason: null | 'too-narrow' | 'too-short' | 'too-cramped' = null
  private _lastAnnouncedOverrideReason: null | 'too-narrow' | 'too-short' | 'too-cramped' = null
  /** 自适应：面板宽度 ≤ 此值时切上下 */
  private static readonly _AUTO_NARROW_WIDTH = 960
  /** 强制左右时：body 低于此宽度仍临时改上下（约 2×320+分割线） */
  private static readonly _HORIZONTAL_FALLBACK_WIDTH = 680
  /** 强制上下时：body 低于此高度仍临时改左右（约 2×160+分割线） */
  private static readonly _VERTICAL_FALLBACK_HEIGHT = 360
  /** 布局模式偏好: 'auto' | 'horizontal' | 'vertical' | 'single' */
  _layoutMode: 'auto' | 'horizontal' | 'vertical' | 'single' = 'auto'
  _verticalSplitRatio = 0.5   // 上下布局比例（本地面板占比，默认50%）
  _horizontalSplitRatio = 0.5 // 左右布局比例
  private _splitDragStartX = 0
  private _splitDragStartY = 0
  private _splitDragStartRatio = 0.5
  private _splitMoveHandler: ((e: MouseEvent) => void) | null = null
  private _splitUpHandler: ((e: MouseEvent) => void) | null = null
  // ★ 暂停下载时取消当前子文件的引用
  _cancelRef: { current: any; active?: Set<any> } | null = null
  // ★ BUG-2 修复：独立的取消引用集合（按传输任务隔离，避免全局共享导致误取消）
  private _cancelRefs = new Set<{ current: any; active?: Set<any> }>()
  /** ★ 2026-09-20 P2-2：本面板的「拖入兜底临时目录」作用域（面板级唯一），销毁时定向清理自己产生的副本 */
  private readonly _dropTmpScope = randomUUID()
  // ★ 2026-07-25：并发同名下载守卫（防止两个下载写同一个 .tmp 造成数据损坏，见 B3）
  private _activeDownloadTargets = new Set<string>()
  // ★ 2026-09-21 P1：并发同名上传守卫（对称下载）——防止两个并发上传互踩同一 .tabby-upload
  private _activeUploadTargets = new Set<string>()
  private _splitterDidDrag = false

  constructor(
    protected cdr: ChangeDetectorRef,
    protected elRef: ElementRef,
    protected zone: NgZone,
    private themesService: ThemesService,
    private injector: Injector,
    @Optional() @Inject('BOOTSTRAP_DATA') private bootstrapData?: any,
  ) {
    super()
    // 通过 Injector 安全获取 ConfigService（避免 NG0202 DI 错误）
    try {
      this.configService = injector.get(ConfigService, null as any)
    } catch {
      // ConfigService 在插件环境中不可用，忽略
      this.configService = undefined
    }
    // 统一配置服务
    try {
      this.sftpConfig = injector.get(SftpConfigService, null as any)
    } catch {
      this.sftpConfig = null
    }
    // 安全获取 NotificationsService（用于重连失败提示）
    try {
      this.notifications = injector.get(NotificationsService, null as any)
    } catch {
      this.notifications = null
    }
    // 将 ConfigService 传给 i18n service，让 Auto 模式能读取 Tabby 系统语言
    this.i18n = new SftpI18nService(this.configService)
    // 将 ConfigService 传给 bookmarks / transferLog service，确保数据写入 Tabby 配置
    this.bookmarks = new SftpBookmarksService(this.configService)
    this.transferLog = new SftpTransferLogService(this.configService)
    const panel = this
    this._rubberBand = new PanelRubberBand({
      zone: this.zone,
      cdr: this.cdr,
      elRef: this.elRef,
      get selectedLocal() { return panel.selectedLocal },
      set selectedLocal(v) { panel.selectedLocal = v },
      get selectedRemote() { return panel.selectedRemote },
      set selectedRemote(v) { panel.selectedRemote = v },
      get localLastSelectedIndex() { return panel.localLastSelectedIndex },
      set localLastSelectedIndex(v) { panel.localLastSelectedIndex = v },
      get remoteLastSelectedIndex() { return panel.remoteLastSelectedIndex },
      set remoteLastSelectedIndex(v) { panel.remoteLastSelectedIndex = v },
      getFilteredLocalEntries: () => panel.getFilteredLocalEntries(),
      getFilteredRemoteEntries: () => panel.getFilteredRemoteEntries(),
      closeContextMenu: () => panel.closeContextMenu(),
      closeBookmarks: () => panel.closeBookmarks(),
      fixContextMenuPosition: (x, y) => panel.fixContextMenuPosition(x, y),
      get contextMenuX() { return panel.contextMenuX },
      set contextMenuX(v) { panel.contextMenuX = v },
      get contextMenuY() { return panel.contextMenuY },
      set contextMenuY(v) { panel.contextMenuY = v },
      get contextMenuPane() { return panel.contextMenuPane },
      set contextMenuPane(v) { panel.contextMenuPane = v },
      get contextMenuEntry() { return panel.contextMenuEntry },
      set contextMenuEntry(v) { panel.contextMenuEntry = v },
      get contextMenuVisible() { return panel.contextMenuVisible },
      set contextMenuVisible(v) { panel.contextMenuVisible = v },
      get headerMenuVisible() { return panel.headerMenuVisible },
      set headerMenuVisible(v) { panel.headerMenuVisible = v },
      syncPaneSelectionVisual: (p) => panel.syncPaneSelectionVisual(p),
    })
    this._headerReorder = new PanelHeaderReorder({
      cdr: this.cdr,
      elRef: this.elRef,
      get resizing() { return panel.resizing },
      get localVisibleCols() { return panel.localVisibleCols },
      get remoteVisibleCols() { return panel.remoteVisibleCols },
      get localColOrder() { return panel.localColOrder },
      set localColOrder(v) { panel.localColOrder = v },
      get remoteColOrder() { return panel.remoteColOrder },
      set remoteColOrder(v) { panel.remoteColOrder = v },
      saveLocalColSettings: () => panel.saveLocalColSettings(),
      saveRemoteColSettings: () => panel.saveRemoteColSettings(),
      markJustResized: () => { panel._colJustResized = true },
      clearJustResizedSoon: (ms) => { setTimeout(() => { panel._colJustResized = false }, ms ?? 200) },
    })
    this._fileDnd = new PanelFileDnd({
      cdr: this.cdr,
      elRef: this.elRef,
      isHeaderReorderActive: () => !!panel._headerReorder?.active,
    })
    this._fileDropRuntime = new PanelDropAdapter({
      cdr: this.cdr,
      markViewDirty: () => panel._safeDetect(),
      // ★ 2026-09-20 P2-2：拖入兜底临时目录归属本面板，销毁时定向清理
      dropTmpScope: panel._dropTmpScope,
      get connected() { return panel.connected },
      get sftpSession() { return panel.sftpSession },
      get remotePath() { return panel.remotePath },
      get localPath() { return panel.localPath },
      get effectiveLang() { return panel.effectiveLang },
      get i18n() { return panel.i18n },
      get notifications() { return panel.notifications },
      get selectedLocal() { return panel.selectedLocal as any[] },
      set selectedLocal(v) { panel.selectedLocal = v as any },
      get selectedRemote() { return panel.selectedRemote as any[] },
      set selectedRemote(v) { panel.selectedRemote = v as any },
      hasConflictQueue: () => panel._conflictQueue.length > 0,
      resetFileDragState: () => panel._resetFileDragState(),
      uploadPathToRemote: (remoteDir, localPath) => panel.uploadPathToRemote(remoteDir, localPath),
      streamUploadOne: (localPath, destRemoteDir) => panel._streamUploadOne(localPath, destRemoteDir),
      // ★ 2026-09-29（四）：拖拽链路的多选批量打包入口（与 ctxUpload 共用同一个实现，
      //   保证「多选」这个事实只在 _tryBatchUpload 一处被翻译成批量请求）
      tryUploadBatch: (localPaths, remoteDir) => panel._tryBatchUpload(localPaths, remoteDir),
      streamDownloadOne: (file, targetLocalDir) => panel._streamDownloadOne(file, targetLocalDir),
      refreshLocal: () => panel.refreshLocal(),
      refreshRemote: () => panel.refreshRemote(),
      showConflictDialog: () => panel._showConflictDialog(),
    })
    this._transferCoordinator = new PanelTransferCoordinator({
      get sftpSession() { return panel.sftpSession },
      // ★ 2026-08-11：tar 打包通道需要 SSH exec（打包/解包）
      get sshSession() { return panel.sshSession },
      mtimeToleranceMs: SftpFloatingPanel.MTIME_TOLERANCE_MS,
      get localPath() { return panel.localPath },
      // ★ 2026-09-25 P1：协调器识别到「同一 方向/远端/本地 已在传输中」时提示用户。
      //   走这里而不是各调用点，是因为右键/菜单/拖拽下载绕过面板方法、直达协调器。
      notifyDuplicateTransfer: (displayName: string) => {
        try {
          panel.showToast(panel.i18n.t('notify.duplicateTransfer', { name: displayName }), 4200)
        } catch { /* ignore */ }
      },
      // ★ 2026-09-29：仅 TAR 模式下打包通道不可用/失败 —— 该模式**不回退**，所以这里必须
      //   把「原因 + 解决方法」讲清楚，否则用户只看到一次失败的传输而不知道怎么继续。
      //   技术细节（原始报错/路径）只进日志（tar-channel 已完整写盘），toast 里只给结论。
      notifyTarChannelFailure: (name: string, code: string, detail: string) => {
        try {
          const reasonKey = TAR_CHANNEL_FAILURE_REASON_KEYS[code] ?? 'tarchan.reason.other'
          // ★ 2026-09-29：'targetExists' 是「不适用」而非失败 —— 目标已存在时只能走逐文件增量，
          //   传输会正常完成。用说明性文案 + 解法，避免「失败」措辞让用户以为传输出错。
          const inapplicable = code === 'targetExists'
          panel.showToast(panel.i18n.t(
            inapplicable ? 'notify.tarOnlyInapplicable' : 'notify.tarOnlyFailed',
            { name, reason: panel.i18n.t(reasonKey) },
          ), inapplicable ? 6000 : 7000)
        } catch { /* ignore */ }
        log.warn(`[tar-only] channel ${code === 'targetExists' ? 'not applicable' : 'unusable'} for "${name}" (${code}): ${detail}`)
      },
      enqueueConflict: (item) => {
        panel._conflictQueue.push(item)
        // ★ 2026-09-25 P3-1 修复：只抬高不重置——原先每次入队都把总数写成「当前队列长度」，
        //   execute 阶段迟到入队的目录冲突会把 N 改小为剩余数，导致「x/N」进度跳动。
        panel.conflictOriginalTotal = Math.max(panel.conflictOriginalTotal, panel._conflictQueue.length)
      },
      showConflictDialog: () => panel._showConflictDialog(),
      // ★ 2026-08-11：size/count 合并为单次遍历 + 并发 readdir（原 4 个串行递归函数）
      scanLocalDir: (p) => panel._scanLocalDir(p),
      scanRemoteDir: (p) => panel._scanRemoteDir(p),
      tarChannelMode: () => panel._transferChannelMode,
      // ★ 2026-09-07 issue #15：内容摘要配置（实时读，改设置后无需重建协调器）
      conflictDigestOptions: () => (panel._conflictDigestEnabled ? {
        enabled: true,
        autoSkipSameContent: panel._conflictAutoSkipSameContent,
        maxBytes: panel._conflictDigestMaxSizeMB * 1024 * 1024,
        algo: panel._conflictDigestAlgo,
      } : null),
      downloadTarBall: (remotePath, localPath, size, onProgress, shouldAbort) =>
        panel._downloadTarBall(remotePath, localPath, size, onProgress, shouldAbort),
      startFolderTransfer: (name, direction, remotePath, localPath, totalSize, itemCount, reuseLogEntryId) => {
        const { transferEntry: t, startTime, logEntryId } = panel._startFolderTransfer(
          name, direction, remotePath, localPath, totalSize, itemCount, reuseLogEntryId,
        )
        return { t, startTime, logEntryId, bytesDone: 0, itemDone: 0 }
      },
      finishFolderTransfer: (ctx, success) =>
        panel._finishFolderTransfer(ctx.t, ctx.startTime, ctx.logEntryId, success),
      discardFolderTransfer: (ctx) => {
        panel.transfers = panel.transfers.filter(x => x !== ctx.t)
        try { panel.transferLog.remove(ctx.logEntryId) } catch { /* ignore */ }
        panel._safeDetect()
      },
      // ★ 2026-09-29：通道归属改为**显式**标记 —— 此前 transferMode='tar' 是在这里顺带写的，
      //   而本回调只在「需要回填真实目录大小」时才会被 tar 通道调用（下载要求 realSize>0，
      //   否则要等解包后兜底扫描且非 mergeIntoExisting）→ 明明走了 tar 却显示 ⇄SFTP。
      markChannelMode: (ctx, mode) => {
        try {
          panel.transferLog.update(ctx.logEntryId, { transferMode: mode, fileCount: 0 })
        } catch { /* ignore */ }
        try {
          ctx.t.transferMode = mode
          panel._safeDetect()
        } catch { /* ignore */ }
      },
      updateFolderLogSize: (ctx, size) => {
        try { panel.transferLog.update(ctx.logEntryId, { size }) } catch { /* ignore */ }
      },
      updateFolderProgress: (ctx, bytesDone, currentItem, itemDone, currentItemSize) =>
        panel._updateFolderProgress(ctx.t, bytesDone, currentItem, itemDone, currentItemSize),
      // ★ 2026-09-07 issue #15+：detector 命中「自动跳过」时同步回调，把传输记录标为「已跳过 · 内容相同」
      onTransferSkipped: (info) => panel._markTransferAsSkipped(info),
      uploadTopLevel: (remotePath, localPath) => panel._doUpload(remotePath, localPath),
      uploadRaw: (remotePath, localPath) => panel._doUploadRaw(remotePath, localPath),
      downloadTopLevel: (remotePath, localPath, mode, size) =>
        panel._doDownload(remotePath, localPath, mode, size),
      downloadRaw: (remotePath, localPath, mode, size, onProgress) =>
        panel._doDownloadRaw(remotePath, localPath, mode, size, onProgress),
      refreshRemote: () => panel.refreshRemote(),
      // ★ 2026-08-10：目录内文件级并发复用上传/下载并发数设置（实时生效）
      dirUploadConcurrency: () => panel._uploadConcurrency,
      dirDownloadConcurrency: () => panel._downloadConcurrency,
    })
    this._pasteAdapter = new PanelPasteAdapter({
      get sftpSession() { return panel.sftpSession },
      get sshSession() { return panel.sshSession },
      get effectiveLang() { return panel.effectiveLang },
      get i18n() { return panel.i18n },
      get notifications() { return panel.notifications },
      scanLocalDir: (p) => panel._scanLocalDir(p),
      uploadFile: (remotePath, localPath) => panel._doUpload(remotePath, localPath),
      downloadFile: (remotePath, localPath, mode, size) =>
        panel._doDownload(remotePath, localPath, mode, size),
      uploadDirectory: (localSrc, remoteDestParent) =>
        panel.uploadPathToRemote(remoteDestParent, localSrc),
      downloadDirectory: (remoteSrc, localDestParent) =>
        panel.downloadRemoteDir(remoteSrc, localDestParent, 'local'),
      checkRemotePathExists: (remotePath, expectDir) =>
        panel._transferCoordinator.checkRemotePathExists(remotePath, expectDir),
      enqueueConflict: (item) => {
        panel._conflictQueue.push(item)
      },
      showConflictDialog: () => panel._showConflictDialog(),
      getConflictQueueLength: () => panel._conflictQueue.length,
      setConflictOriginalTotal: (count) => { panel.conflictOriginalTotal = count },
      savePendingPaste: (entries, destPane, destPath, mode, source) => {
        panel._pendingPasteEntries = entries as any
        panel._pendingPasteDestPane = destPane
        panel._pendingPasteDestPath = destPath
        panel._pendingPasteMode = mode
        panel._pendingPasteSource = source
      },
      renameRemote: async (src, dest) => {
        if (!panel.sftpSession) return
        await panel.sftpSession.rename(src, dest)
      },
      refreshLocal: () => panel.refreshLocal(),
      refreshRemote: () => panel.refreshRemote(),
    })
    this._conflictResolver = new PanelConflictResolver({
      get sftpSession() { return panel.sftpSession },
      get cdr() { return panel.cdr },
      // ★ 2026-09-20 A2：面板销毁后，冲突框的异步 stat / 扫描 / 摘要回调必须短路
      isAlive: () => panel._isAlive,
      renameRemote: async (src, dest) => {
        if (!panel.sftpSession) return
        await panel.sftpSession.rename(src, dest)
      },

      get conflictData() { return panel.conflictData },
      set conflictData(v) { panel.conflictData = v },
      get showConflictDialog() { return panel.showConflictDialog },
      set showConflictDialog(v) { panel.showConflictDialog = v },
      get conflictCurrIdx() { return panel.conflictCurrIdx },
      set conflictCurrIdx(v) { panel.conflictCurrIdx = v },
      get conflictTotalIdx() { return panel.conflictTotalIdx },
      set conflictTotalIdx(v) { panel.conflictTotalIdx = v },
      get conflictOriginalTotal() { return panel.conflictOriginalTotal },
      set conflictOriginalTotal(v) { panel.conflictOriginalTotal = v },

      get conflictQueue() { return panel._conflictQueue },
      set conflictQueue(v) { panel._conflictQueue = v },
      get conflictAllMode() { return panel._conflictAllMode as any },
      set conflictAllMode(v) { panel._conflictAllMode = v },
      get conflictResolvedKeys() { return panel._conflictResolvedKeys },
      set conflictResolvedKeys(v) { panel._conflictResolvedKeys = v },

      get selectedLocal() { return panel.selectedLocal },
      set selectedLocal(v) { panel.selectedLocal = v },
      get selectedRemote() { return panel.selectedRemote },
      set selectedRemote(v) { panel.selectedRemote = v },

      get clipboardEntries() { return panel.clipboardEntries as any },
      set clipboardEntries(v) { panel.clipboardEntries = v as any },
      get clipboardSource() { return panel.clipboardSource },
      set clipboardSource(v) { panel.clipboardSource = v },
      get clipboardMode() { return panel.clipboardMode },
      set clipboardMode(v) { panel.clipboardMode = v },
      get pendingPasteEntries() { return panel._pendingPasteEntries as any },
      set pendingPasteEntries(v) { panel._pendingPasteEntries = v as any },
      get pendingPasteDestPane() { return panel._pendingPasteDestPane },
      set pendingPasteDestPane(v) { panel._pendingPasteDestPane = v },
      get pendingPasteDestPath() { return panel._pendingPasteDestPath },
      set pendingPasteDestPath(v) { panel._pendingPasteDestPath = v },
      get pendingPasteMode() { return panel._pendingPasteMode },
      set pendingPasteMode(v) { panel._pendingPasteMode = v },
      get pendingPasteSource() { return panel._pendingPasteSource },
      set pendingPasteSource(v) { panel._pendingPasteSource = v },

      refreshRemote: () => panel.refreshRemote(),
      refreshLocal: () => panel.refreshLocal(),
      executePaste: (entries, destPane, destPath, mode, source) =>
        panel._pasteAdapter.executePaste(entries as any, destPane, destPath, mode, source),

      doDownload: (remotePath, localPath, mode, size) => panel._doDownload(remotePath, localPath, mode, size),
      doUpload: (remotePath, localPath) => panel._doUpload(remotePath, localPath),
      downloadRemoteDir: (remoteDir, localDestDir, targetPane, top, renameTo, forceOverwrite) =>
        panel._transferCoordinator.downloadRemoteDir(remoteDir, localDestDir, top, renameTo, forceOverwrite),
      // ★ 2026-09-03 修复：此前适配器签名漏转发第三参 reuseLogEntryId，导致目录冲突
      //   覆盖/重命名时合并上传无法复用来源记录（入队时已被 finish(false) 误记失败的那条），
      //   转而新建成功记录 → 传输记录出现「一失败一成功」两条同目录条目（拖拽路径必现）
      mergeLocalDirToRemote: (localSrc, remoteDest, reuseLogEntryId) =>
        panel._transferCoordinator.mergeLocalDirToRemote(localSrc, remoteDest, reuseLogEntryId),
      // ★ 2026-08-11：冲突解决成功后翻正来源传输记录（入队时已被 finish(false) 误记失败）；
      //   _finishFolderTransfer 对已移除的进度条目无副作用，transferLog.update 幂等翻正
      markTransferSucceeded: (ctx) => panel._finishFolderTransfer(ctx.t, ctx.startTime, ctx.logEntryId, true),
      discardTransferLog: (ctx) => {
        try { panel.transferLog.remove(ctx.logEntryId) } catch { /* ignore */ }
      },
      copyLocalDir: (src, dest) => copyLocalDir(src, dest),
      scanLocalDir: (p) => panel._scanLocalDir(p),
      scanRemoteDir: (p) => panel._scanRemoteDir(p),
      computeConflictDigests: (args) => panel._computeConflictDigests(args),
      shouldAutoSkipSameContent: () =>
        !!(panel._conflictDigestEnabled && panel._conflictAutoSkipSameContent),
      notifyConflictAutoSkipped: (fileName) => {
        try {
          const tip = panel.i18n.t('transfer.skippedAsDuplicate')
          panel.showToast(`${fileName} — ${tip}`)
        } catch {
          panel.showToast(`${fileName}: skipped (same content)`)
        }
      },
      copyRemoteDir: (srcRemotePath, destRemotePath, isDirectory) => copyRemoteDir(
        srcRemotePath, destRemotePath, isDirectory, {
          hasSession: () => !!panel.sftpSession,
          mkdir: async (p) => { await panel.sftpSession!.mkdir(p) },
          readdir: async (p) => {
            const entries = await panel.sftpSession!.readdir(p)
            return entries.map(e => ({
              name: e.name,
              isDirectory: !!e.isDirectory,
              isSymbolicLink: !!(e as any).isSymlink || !!(e as any).isSymbolicLink,
            }))
          },
          download: (r, l) => panel._doDownload(r, l),
          upload: (r, l) => panel._doUpload(r, l),
          tryServerCopy: (src, dest, isDir) =>
            tryRemoteCpViaSsh(panel.sshSession, src, dest, isDir),
        },
      ),
    })
    this._transferRuntime = new PanelTransferRuntime({
      get connected() { return panel.connected },
      get sftpSession() { return panel.sftpSession },
      get transfers() { return panel.transfers },
      set transfers(v) { panel.transfers = v },
      get transferLog() { return panel.transferLog },
      get profile() { return panel.profile },
      get effectiveLang() { return panel.effectiveLang },
      get notifications() { return panel.notifications },
      get cdr() { return panel.cdr },
      detectChanges: () => panel._safeDetect(),
      get zone() { return panel.zone },
      formatSpeed: (bytes, ms) => panel._formatSpeed(bytes, ms),
    })
    // 面板 UI 状态已由 SftpConfigService 自动迁移（集中管理）
    this.loadLocalColSettings()
    this.loadRemoteColSettings()
    this.loadTableSettings()
    this.loadLocalColWidths()
    this.loadRemoteColWidths()
    // refreshLocal 移至 ngOnInit 中 _loadSavedPaths 后执行，避免构造函数中的异步
    // 读取覆盖了路径记忆恢复的正确路径
  }

  // _paneStore 已移除，统一经 SftpConfigService 读写

  /** 读取面板状态（优先新嵌套路径，回退旧 localStorage） */
  protected _paneGet(key: string, def?: any): any {
    const newPath = this._mapPaneKey(key)
    if (newPath && this.sftpConfig) {
      const val = this.sftpConfig.get(newPath)
      if (val !== undefined) return val
    }
    // 回退：直接从 localStorage 读旧 key（兼容未迁移 / 旧版升级过渡期）
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return raw
    } catch {}
    return def
  }

  /** 写入面板状态：经统一配置服务（高频操作不入磁盘，flush 时落盘） */
  protected _paneSet(key: string, val: any): void {
    const newPath = this._mapPaneKey(key)
    if (newPath && this.sftpConfig) {
      this.sftpConfig.set(newPath, val)
    } else {
      // 无映射时回退 localStorage
      try { localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val)) } catch {}
    }
  }

  /**
   * 将旧扁平 key（如 sftp-plus-path-mode.root@host）映射为新嵌套路径
   * 无匹配返回 null（保持向下兼容）
   */
  private _mapPaneKey(key: string): string | null {
    const perHostPrefixes = [
      'sftp-plus-path-mode.',
      'sftp-plus-path-mem.',
      'sftp-plus-saved-local-path.',
      'sftp-plus-saved-remote-path.',
    ]
    for (const prefix of perHostPrefixes) {
      if (key.startsWith(prefix)) {
        const host = key.substring(prefix.length)
        const fieldMap: Record<string, string> = {
          'sftp-plus-path-mode.': 'pathMode',
          'sftp-plus-path-mem.': 'rememberPath',
          'sftp-plus-saved-local-path.': 'savedLocalPath',
          'sftp-plus-saved-remote-path.': 'savedRemotePath',
        }
        return `paneState/perHost/${host}/${fieldMap[prefix]}`
      }
    }
    const keyMap: Record<string, string> = {
      'sftp-plus-layout-mode': 'paneState/layout/mode',
      'sftp-plus-settings.layoutMode': 'paneState/layout/mode',
      'sftp-plus-horizontal-split-ratio': 'paneState/layout/horizontalSplitRatio',
      'sftp-plus-vertical-split-ratio': 'paneState/layout/verticalSplitRatio',
      'sftp-plus-local-sort': 'paneState/local/sort',
      'sftp-plus-local-cols': 'paneState/local/cols',
      'sftp-plus-local-cols-order': 'paneState/local/colsOrder',
      'sftp-plus-remote-sort': 'paneState/remote/sort',
      'sftp-plus-remote-cols': 'paneState/remote/cols',
      'sftp-plus-remote-cols-order': 'paneState/remote/colsOrder',
      'sftp-plus-local-col-widths': 'paneState/local/colWidths',
      'sftp-plus-remote-col-widths': 'paneState/remote/colWidths',
      'sftp-plus-pane-custom-order': 'paneCustomOrder',
      'sftp-plus-pane-hidden-items': 'paneHiddenItems',
    }
    return keyMap[key] || null
  }

  private _loadPaneToolbarLayout(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (Array.isArray(cfg?.paneCustomOrder) && cfg.paneCustomOrder.length) {
        this.paneCustomOrder = cfg.paneCustomOrder as any
      } else if (Array.isArray(cfg?.paneHeaderOrder) && Array.isArray(cfg?.paneToolbarOrder)) {
        const header = cfg.paneHeaderOrder as Array<'label' | 'path' | 'toolbar'>
        const toolbar = cfg.paneToolbarOrder as Array<'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark'>
        const items: any[] = []
        for (const part of header) {
          if (part === 'toolbar') items.push(...toolbar)
          else items.push(part)
        }
        this.paneCustomOrder = items as any
      }
      // 保证 'hidden'（眼睛图标项）始终存在，老配置缺该项时插到 'filter' 前面
      this.paneCustomOrder = this._ensureHiddenItem(this.paneCustomOrder)
      // 注意：空数组也要赋值（全部重新勾选后隐藏列表为空，必须覆盖旧值才能重新显示）
      if (Array.isArray(cfg?.paneHiddenItems)) {
        this.paneHiddenItems = cfg.paneHiddenItems as string[]
      }
      return
    } catch { /* ignore */ }
    try {
      const raw = this._paneGet('sftp-plus-pane-custom-order')
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(parsed) && parsed.length) this.paneCustomOrder = parsed as any
      }
      this.paneCustomOrder = this._ensureHiddenItem(this.paneCustomOrder)
      const hiddenRaw = this._paneGet('sftp-plus-pane-hidden-items')
      if (hiddenRaw) {
        const parsed = typeof hiddenRaw === 'string' ? JSON.parse(hiddenRaw) : hiddenRaw
        if (Array.isArray(parsed)) this.paneHiddenItems = parsed as string[]
      }
    } catch { /* ignore */ }
  }

  /** 保证工具栏顺序中存在 'hidden'（眼睛图标项）：缺失时插到 'filter' 前面（无 filter 则追加末尾） */
  private _ensureHiddenItem(order: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'>): Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'> {
    // 一次性迁移：旧默认顺序（hidden 追加在末尾）→ 新默认顺序（hidden 在 filter 前）；用户自定义过的顺序不动
    if (order.join(',') === 'label,back,forward,up,refresh,home,path,filter,bookmark,hidden') {
      return ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
    }
    if (order.includes('hidden')) return order
    const next = [...order]
    const idx = next.indexOf('filter')
    next.splice(idx >= 0 ? idx : next.length, 0, 'hidden')
    return next
  }

  /** 将面板状态持久化到 Tabby 配置（经统一配置服务落盘） */
  private _paneFlushToConfig(): void {
    this.sftpConfig?.flush()
  }

  /** 供列控制器基类调用的落盘入口 */
  protected override _paneFlush(): void {
    this._paneFlushToConfig()
  }

  /** 使用界面语言（代理到 i18n service） */
  get effectiveLang(): Locale {
    return this.i18n.getLocale()
  }

  ngOnInit(): void {
    const panel = this
    this._connLifecycle = new PanelConnectionLifecycle({
      get sshSession() { return panel.sshSession },
      set sshSession(v) { panel.sshSession = v },
      get sftpSession() { return panel.sftpSession },
      set sftpSession(v) { panel.sftpSession = v },
      get connected() { return panel.connected },
      set connected(v) { panel.connected = v },
      get connecting() { return panel.connecting },
      set connecting(v) { panel.connecting = v },
      get reconnecting() { return panel.reconnecting },
      set reconnecting(v) { panel.reconnecting = v },
      get pathMode() { return panel.pathMode },
      get remotePath() { return panel.remotePath },
      set remotePath(v) { panel.remotePath = v },
      get remotePathInput() { return panel.remotePathInput },
      set remotePathInput(v) { panel.remotePathInput = v },
      get terminalRef() { return panel.terminalRef },
      sftpService: this.sftpService,
      notifications: this.notifications,
      getI18n: () => panel.i18n,
      zone: this.zone,
      cdr: this.cdr,
      getDefaultRemotePath: () => panel.getDefaultRemotePath(),
      refreshRemote: () => panel.refreshRemote(),
      restoreSavedRemotePath: () => panel._restoreSavedRemotePath(),
      tryGetTerminalCwd: () => panel.tryGetTerminalCwd(),
      pushRemoteNav: (p) => panel._pushRemoteNav(p),
      clearNavHistory: () => {
        panel._remoteNav.clear()
        panel._localNav.clear()
      },
      clearRemoteListing: () => panel.clearRemoteListing(),
      setRemoteLoading: (loading) => { panel._remoteLoading = loading },
      isAlive: () => panel._isAlive,
      abortInFlightTransfers: () => {
        try { panel.clearTransfers() } catch { /* ignore */ }
      },
      // ★ 2026-09-25 P0-3：心跳据此判断是否有在途传输，从而放宽「通道死亡」判定阈值
      //   （大流量下载时探测请求易被数据挤超时，不能在单次超时后拆会话/中断传输）
      hasActiveTransfers: () => {
        try { return panel.transfers.length > 0 } catch { return false }
      },
    })

    // profile 已就绪，此时加载路径模式才能正确匹配 per-profile 的 key
    this._loadSavedPaths()
    this._cwdSetupPrompted = false
    if (this.pathMode === 'sync') this._startCwdSync()
    // 本地导航历史：记录初始路径
    this._pushLocalNav(this.localPath)
    // 路径记忆可能更新了 localPath，刷新本地列表显示正确的目录内容
    void this.refreshLocal()

    // 确定 host info
    if (this.profile?.options?.host) {
      const user = this.profile.options.username || this.profile.options.user || ''
      this.hostInfo = user ? `${user}@${this.profile.options.host}` : this.profile.options.host
    }
    if (this.sshSession) {
      void this.connect()
    }

    // 窄屏布局检测（ResizeObserver 监听容器宽度变化）
    try {
      // 加载保存的分割比例与布局模式
      const vsaved = this._paneGet('sftp-plus-vertical-split-ratio')
      if (vsaved) this._verticalSplitRatio = Math.max(0.15, Math.min(0.85, parseFloat(vsaved) || 0.5))
      const hsaved = this._paneGet('sftp-plus-horizontal-split-ratio')
      if (hsaved) this._horizontalSplitRatio = Math.max(0.15, Math.min(0.85, parseFloat(hsaved) || 0.5))
      // ★ 2026-08-15 修复 #5：布局模式应通过 sftpConfig.get() 读取（有 fallback 链），
      //   而非直接访问 store 顶层属性（迁移后数据在 paneState/layout/mode 嵌套路径）
      const lmode = this.sftpConfig?.get('paneState/layout/mode')
      if (lmode === 'horizontal' || lmode === 'vertical' || lmode === 'single') this._layoutMode = lmode

      this._bindLayoutObservers()
    } catch { /* ResizeObserver 不可用时忽略 */ }

    // Auto 模式：跟随 Tabby 当前主题配色
    this._applyAutoTheme()
    this._applyFontSize()
    this._loadPaneToolbarLayout()
    this._readBehaviorConfig()

    // 监听 Tabby 主题切换 → 面板实时跟随
    this._themeSub = this.themesService.themeChanged$.subscribe(() => {
      this._applyAutoTheme()
    })

    // 监听设置页变更 → 同步刷新面板显示
    this._settingsChangedHandler = () => {
      this.loadLocalColSettings()
    this.loadRemoteColSettings()
      this.loadTableSettings()
      this.loadLocalColWidths()
    this.loadRemoteColWidths()
      // 重建 i18n service 以应用语言设置变更
      this.i18n = new SftpI18nService(this.configService)
      // 同步书签与传输日志（其他面板或导入后可能已变更）
      this.bookmarks.reload()
      this.transferLog.reload()
      this._loadPaneToolbarLayout()
      this._readBehaviorConfig()
      // 默认路径模式变更 → 未单独切换过的连接即时跟随
      this._applyDefaultPathMode()
      // 重新读取布局模式并立即应用（同步窄屏判断 + 面板分割）
      const lmode = this.sftpConfig?.get('paneState/layout/mode')
      if (lmode === 'horizontal' || lmode === 'vertical' || lmode === 'single') this._layoutMode = lmode
      else this._layoutMode = 'auto'
      if (this._layoutMode === 'single') {
        this._effectiveLayout = 'single'
        this._layoutOverrideReason = null
        this._isNarrowLayout = false
      } else {
        const bodyEl = this.elRef?.nativeElement?.querySelector('.sftp-body') as HTMLElement | null
        if (bodyEl) {
          const { w, h } = this._measureBodySize(bodyEl)
          this._syncNarrowLayout(w > 0 ? w : undefined, h > 0 ? h : undefined)
        } else {
          this._syncNarrowLayout()
        }
      }
      this._applyPaneSplit()
      this._maybeAnnounceLayoutOverride(true)
      this._applyAutoTheme()
      this._applyFontSize()
      this._safeDetect()
      this.cdr.markForCheck()
    }
    window.addEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)

    // 捕获阶段 document click：关闭书签悬浮面板 & 右键菜单 & 表头菜单
    // overlay 的 stopPropagation 阻止了冒泡阶段到达 document，但捕获阶段不受影响
    this._docClickCapture = (ev: MouseEvent) => {
      // Early return: skip expensive DOM queries when no popup/menu is open
      if (!this.showBookmarks && !this.contextMenuVisible && !this.headerMenuVisible
        && !this.localFilterVisible && !this.remoteFilterVisible) return
      const target = ev.target as HTMLElement | null
      const clickedInFilterUi = !!(target?.closest('.pane-filters') || target?.closest('.filter-toggle-btn'))
      let changed = false
      if (!clickedInFilterUi) {
        if (this.localFilterVisible && !this.localFilterPending.trim()) {
          this.localFilterVisible = false
          changed = true
        }
        if (this.remoteFilterVisible && !this.remoteFilterPending.trim()) {
          this.remoteFilterVisible = false
          changed = true
        }
      }
      if (this.showBookmarks) {
        if (this._bookmarkJustOpened) return
        if (!target?.closest('.bookmark-popup') && !target?.closest('.bm-btn')) {
          this.zone.run(() => {
            this.closeBookmarks()
            if (changed) this._safeDetect()
          })
          return
        }
      }
      if (this.contextMenuVisible) {
        if (!target?.closest('.context-menu')) {
          this.zone.run(() => {
            this.contextMenuVisible = false
            this._safeDetect()
          })
          return
        }
      }
      if (this.headerMenuVisible) {
        if (!target?.closest('.context-menu')) {
          this.zone.run(() => {
            this.headerMenuVisible = false
            this._safeDetect()
          })
          return
        }
      }
      if (changed) {
        this.zone.run(() => this._safeDetect())
      }
    }
    document.addEventListener('click', this._docClickCapture, true)

    // ★ 2026-09-20：关 Tabby 窗口时 Electron 可能来不及走完整 destroy；beforeunload 再 flush 一次
    this._beforeUnloadFlush = () => {
      try { this._paneFlushToConfig() } catch { /* ignore */ }
      try {
        if (this.displayMode !== 'workspace') this._persistPanelGeometry()
      } catch { /* ignore */ }
    }
    window.addEventListener('beforeunload', this._beforeUnloadFlush)

    // 滚轮事件关闭所有悬浮面板/菜单（捕获阶段）
    // 注意：必须在捕获阶段判断目标归属，因为模板绑定的 (wheel) 冒泡阶段 stopPropagation()
    // 无法阻止捕获阶段已触发的监听器。仿照 _docClickCapture 做目标排除。
    this._docWheelCapture = (ev: WheelEvent) => {
      if (!this.showBookmarks && !this.contextMenuVisible && !this.headerMenuVisible) return
      const target = ev.target as HTMLElement | null
      if (this.showBookmarks) {
        if (target?.closest('.bookmark-popup')) return
      }
      if (this.contextMenuVisible) {
        if (target?.closest('.context-menu')) return
      }
      if (this.headerMenuVisible) {
        if (target?.closest('.context-menu')) return
      }
      // 轮到了真正需要关闭的情况
      this.zone.run(() => {
        if (this.showBookmarks) this.closeBookmarks()
        if (this.contextMenuVisible) this.contextMenuVisible = false
        if (this.headerMenuVisible) this.headerMenuVisible = false
        this._safeDetect()
      })
    }
    document.addEventListener('wheel', this._docWheelCapture, true)

    // ★ 2026-09-17 issue #21：捕获阶段屏蔽 Cmd/Ctrl+C/X/V/A 穿透到终端。
    //   Angular HostListener(document:keydown) 在冒泡阶段，晚于 Tabby/xterm 的捕获监听；
    //   macOS 上 Cmd+V 会先被终端吃掉，保存后回到终端才看到粘贴内容。不 preventDefault
    //   当焦点已在面板 textarea/input 内，以便原生粘贴仍可用。
    this.zone.runOutsideAngular(() => {
      this._termKeyShieldKeydown = (ev: KeyboardEvent) => this._shieldTerminalClipboardKeys(ev)
      this._termKeyShieldPaste = (ev: Event) => this._shieldTerminalPaste(ev as ClipboardEvent)
      // ★ 2026-09-20：捕获阶段抢先消费已绑定的面板热键，避免 Tabby 全局热键（Alt+Enter=全屏）先触发
      this._panelHotkeyCaptureKeydown = (ev: KeyboardEvent) => this._capturePanelHotkeysBeforeTabby(ev)
      window.addEventListener('keydown', this._termKeyShieldKeydown, true)
      window.addEventListener('keydown', this._panelHotkeyCaptureKeydown, true)
      window.addEventListener('paste', this._termKeyShieldPaste, true)

      // ★ 2026-09-17：从其他窗口点回面板时，Electron 常在激活后把焦点还原到 xterm；
      //   捕获阶段抢焦点 + 短时 focusin/window focus 回抢，避免「选中了文件但终端光标仍在闪」。
      this._panelFocusMouseDownCapture = (ev: MouseEvent) => this._handlePanelPointerFocus(ev)
      this._panelFocusInGuard = (ev: FocusEvent) => this._onPanelFocusInGuard(ev)
      this._panelWindowFocusGuard = () => this._onPanelWindowFocusGuard()
      const host = this.elRef?.nativeElement as HTMLElement | undefined
      host?.addEventListener('mousedown', this._panelFocusMouseDownCapture, true)
      document.addEventListener('focusin', this._panelFocusInGuard, true)
      window.addEventListener('focus', this._panelWindowFocusGuard)
    })
  }

  ngAfterViewInit(): void {
    // 兜底：在视图完全初始化后再次应用主题，确保 inline 样式不丢失
    // 某些场景下 ngOnInit 时 themesService 可能尚未完全就绪
    this._applyAutoTheme()
    // 初始化自动布局检测（视图已渲染，clientWidth 可用）
    this._scheduleLayoutRefresh()
    if (this.displayMode === 'workspace') {
      this._layoutRefreshTimers.push(setTimeout(() => this._scheduleLayoutRefresh(), 0))
      this._layoutRefreshTimers.push(setTimeout(() => this._scheduleLayoutRefresh(), 120))
    }
    // 浮动模式：初始化面板拖拽 / 缩放 / 最大化的几何（切换为绝对定位）
    if (this.displayMode !== 'workspace') {
      this._loadPanelGeometry()
      this._initPanelGeometry()
    }
  }

  ngOnDestroy(): void {
    this._destroyed = true
    // 必须先中止拖拽预缓存下载，再 disconnect；否则后台 SFTP read 会继续占满 SSH 通道，
    // 关面板重开后进入文件夹仍会卡，直到重启 Tabby。
    this._cancelRemoteDragCache()
    this._clearCustomDragPreview()
    this._fileDnd?.reset()
    this._headerReorder?.dispose()
    this._rubberBand.dispose()
    this.clearTransfers()
    this._transferRuntime.dispose()
    if (this._geomInitTimer) {
      clearTimeout(this._geomInitTimer)
      this._geomInitTimer = null
    }
    for (const t of this._layoutRefreshTimers) {
      clearTimeout(t)
    }
    this._layoutRefreshTimers = []
    if (this._splitMoveHandler) {
      document.removeEventListener('mousemove', this._splitMoveHandler)
      this._splitMoveHandler = null
    }
    if (this._splitUpHandler) {
      document.removeEventListener('mouseup', this._splitUpHandler)
      this._splitUpHandler = null
    }
    // ★ 2026-09-20 A3 审计修复：列宽拖拽的 document 监听器清理此前从未接线
    //   （disposeColResize 只有定义无调用点）——拖拽列宽期间销毁面板时 mouseup 永不触发，
    //   两个 document 监听器会残留并强引用整个面板实例，之后每次鼠标移动都在
    //   已销毁组件上跑 zone.run 改写列宽字段。
    this.disposeColResize()
    // 清理几何拖拽/缩放事件监听器（防止销毁时正在拖拽导致泄漏）
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    this.saveCurrentPath()
    // ★ 2026-09-20：关面板/关 Tabby 前再落一次几何，防止最后一次拖拽后未 save 就退出
    if (this.displayMode !== 'workspace') {
      try { this._persistPanelGeometry() } catch { /* ignore */ }
    }
    this._stopCwdSync()
    this.cwdSetupVisible = false
    this._cwdSetupPrompted = false
    this._paneFlushToConfig()  // 面板销毁前持久化所有 UI 状态到 config
    this.disconnect()
    this._clearPanelTimers()
    if (this._docClickCapture) {
      document.removeEventListener('click', this._docClickCapture, true)
      this._docClickCapture = null
    }
    if (this._beforeUnloadFlush) {
      window.removeEventListener('beforeunload', this._beforeUnloadFlush)
      this._beforeUnloadFlush = null
    }
    if (this._docWheelCapture) {
      document.removeEventListener('wheel', this._docWheelCapture, true)
      this._docWheelCapture = null
    }
    if (this._termKeyShieldKeydown) {
      window.removeEventListener('keydown', this._termKeyShieldKeydown, true)
      this._termKeyShieldKeydown = null
    }
    if (this._panelHotkeyCaptureKeydown) {
      window.removeEventListener('keydown', this._panelHotkeyCaptureKeydown, true)
      this._panelHotkeyCaptureKeydown = null
    }
    if (this._termKeyShieldPaste) {
      window.removeEventListener('paste', this._termKeyShieldPaste, true)
      this._termKeyShieldPaste = null
    }
    if (this._panelFocusMouseDownCapture) {
      const host = this.elRef?.nativeElement as HTMLElement | undefined
      host?.removeEventListener('mousedown', this._panelFocusMouseDownCapture, true)
      this._panelFocusMouseDownCapture = null
    }
    if (this._panelFocusInGuard) {
      document.removeEventListener('focusin', this._panelFocusInGuard, true)
      this._panelFocusInGuard = null
    }
    if (this._panelWindowFocusGuard) {
      window.removeEventListener('focus', this._panelWindowFocusGuard)
      this._panelWindowFocusGuard = null
    }
    this._clearPanelFocusStealTimers()
    this._panelFocusWantedUntil = 0
    this._panelOwnsClipboardHotkeys = false
    if (this._themeSub) { this._themeSub.unsubscribe(); this._themeSub = null }
    if (this._settingsChangedHandler) {
      window.removeEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)
    }
    if (this.localClickTimer) clearTimeout(this.localClickTimer)
    if (this.remoteClickTimer) clearTimeout(this.remoteClickTimer)
    this._clearTypeAhead()
    // 清理所有进行中的传输与续传定时器
    this._transferRuntime.clearTransfers()
    // 断开 ResizeObserver 与窗口缩放监听
    if (this._ro) {
      try { this._ro.disconnect() } catch {}
      this._ro = null
    }
    if (this._winResizeHandler) {
      window.removeEventListener('resize', this._winResizeHandler)
      this._winResizeHandler = null
    }
    // P2-1: 清理远程拖拽缓存临时目录
    void fs.rm(path.join(os.tmpdir(), 'sftp-plus-dragout'), { recursive: true, force: true }).catch(() => {})
    // ★ 2026-09-20 P2-2: 清理「拖入兜底」临时目录（仅本面板作用域内的副本，不误删其它面板的）
    void fs.rm(dragDropTempDir(this._dropTmpScope), { recursive: true, force: true }).catch(() => {})
    // P2-2: 清理 _openPathInSystem 可能残留的 keyup 监听和定时器
    if (this._openPathKeyupHandler) {
      window.removeEventListener('keyup', this._openPathKeyupHandler, true)
      this._openPathKeyupHandler = null
    }
    if (this._openPathTimeoutId) {
      clearTimeout(this._openPathTimeoutId)
      this._openPathTimeoutId = null
    }
    void this._cleanupEditorTemp()
    void this._cleanupViewerTemp()
    // ★ 2026-09-21 P2：清理「系统中打开」下载的临时文件（best-effort）
    void this._cleanupSystemOpenTempFiles()
  }

  private _settingsChangedHandler: (() => void) | null = null
  private _themeSub: any = null
  private _docClickCapture: ((ev: MouseEvent) => void) | null = null
  private _beforeUnloadFlush: (() => void) | null = null
  private _docWheelCapture: ((ev: WheelEvent) => void) | null = null
  /** ★ 2026-09-17 issue #21：捕获阶段剪贴板热键/粘贴屏蔽（防穿透终端） */
  private _termKeyShieldKeydown: ((ev: KeyboardEvent) => void) | null = null
  private _panelHotkeyCaptureKeydown: ((ev: KeyboardEvent) => void) | null = null
  /**
   * ★ 2026-09-29：指针类面板热键（中键/滚轮）最近一次触发时间。
   * 滚轮一次物理滑动会连发数十个 wheel 事件，动作必须节流（否则「删除」绑滚轮会连删一堆）。
   */
  private _pointerHotkeyLastFire = 0
  /** 滚轮连发热键的节流窗口（ms） */
  private static readonly _POINTER_WHEEL_THROTTLE_MS = 150
  private _termKeyShieldPaste: ((ev: Event) => void) | null = null
  /** ★ 2026-09-17：从其他窗口点回面板时，防止 xterm 抢回焦点 */
  private _panelFocusMouseDownCapture: ((ev: MouseEvent) => void) | null = null
  private _panelFocusInGuard: ((ev: FocusEvent) => void) | null = null
  private _panelWindowFocusGuard: (() => void) | null = null
  private _panelFocusWantedUntil = 0
  private _panelFocusStealTimers: ReturnType<typeof setTimeout>[] = []
  /**
   * 用户最近在面板内点击过：即使焦点仍卡在 xterm，剪贴板热键也归面板。
   * 清除时机只有三处：面板外任意 mousedown（含点终端区）/ 面板销毁 / owns 下焦点在终端且 C/X 无选中。
   * ★ 2026-09-29：曾把它改成「4s 有效期」，经用户指出属过度修复后已回退 —— 焦点在面板里时面板
   *   本就该接管剪贴板快捷键（选中文件 → Cmd/Ctrl+C/V），且这是**有意设计**：面板内按 Ctrl+C 不能
   *   变成打进终端的 ^C（会杀掉对面命令）；点一下终端即清除标志，终端侧复制粘贴从未被抢。
   */
  private _panelOwnsClipboardHotkeys = false
  private _ro: ResizeObserver | null = null
  /** 布局去重：上次 _scheduleLayoutRefresh 实测的 body 尺寸与窄屏标记 */
  private _lastLayoutBodyW = -1
  private _lastLayoutBodyH = -1
  private _lastEffectiveLayout: 'horizontal' | 'vertical' | 'single' | '' = ''
  private _lastOverrideReason: null | 'too-narrow' | 'too-short' | 'too-cramped' | undefined = undefined
  private _lastLayoutNarrow = false
  private _winResizeHandler: (() => void) | null = null

  /** 当前 Auto 模式检测到的主题名称（供设置面板显示） */
  autoDetectedThemeName = ''

  /**
   * 应用设置页字号到面板 CSS 变量 --sftp-font-size
   * 创建人：DD1024z + Composer
   * 创建时间：2026-09-17
   */
  private _applyFontSize(): void {
    const el = this.elRef?.nativeElement as HTMLElement | undefined
    if (!el) return
    let size = 13
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      const raw = Number(cfg?.fontSize)
      if (Number.isFinite(raw)) size = Math.max(11, Math.min(18, Math.round(raw)))
    } catch { /* keep default */ }
    // 同时写 --sftp-font-size 与 --_fs，避免样式表默认值或缓存链导致不刷新
    el.style.setProperty('--sftp-font-size', `${size}px`)
    el.style.setProperty('--_fs', `${size}px`)
  }

  /**
   * 在 Auto 模式下根据 Tabby UI 主题设置推导面板配色
   * 功能描述：通过读取 document.documentElement 的 --body-bg CSS 变量来判断
   *            Tabby 当前的 UI 暗/亮模式（而非配色方案的终端背景色）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-23
   */
  private _applyAutoTheme(): void {
    const el = this.elRef.nativeElement as HTMLElement

    // 读取主题设置（优先从 Tabby 配置，回退 localStorage）
    let themeValue = ''
    let themePrimary = ''
    let themeBg = ''
    let themeText = ''
    let themeBorder = ''
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (cfg?.theme) {
        themeValue = cfg.theme
        themePrimary = cfg.colorPrimary || ''
        themeBg = cfg.colorBg || ''
        themeText = cfg.colorText || ''
        themeBorder = cfg.colorBorder || ''
      } else {
        const raw = this._paneGet('sftp-plus-settings.theme')
        themeValue = raw ? JSON.parse(raw) : ''
        if (themeValue) {
          themePrimary = this._paneGet('sftp-plus-settings.primaryColor')
          themeBg = this._paneGet('sftp-plus-settings.bgColor')
          themeText = this._paneGet('sftp-plus-settings.textColor')
          themeBorder = this._paneGet('sftp-plus-settings.borderColor')
          try {
            if (themePrimary) themePrimary = JSON.parse(themePrimary)
            if (themeBg) themeBg = JSON.parse(themeBg)
            if (themeText) themeText = JSON.parse(themeText)
            if (themeBorder) themeBorder = JSON.parse(themeBorder)
          } catch {}
        }
      }
    } catch { /* use empty */ }

    const vars = ['--_bg','--_text','--_primary','--_border','--_content','--_surface','--_hover','--_active','--_input-bg','--_scroll-track','--_scroll-thumb','--_scroll-thumb-hover']
    const hasPreset = !!themeValue

    if (hasPreset && themePrimary && themeBg && themeText) {
      // 预设/自定义主题：用保存的颜色值设置内联样式，面板独立启动不依赖设置页
      el.style.setProperty('--_bg', themeBg, 'important')
      el.style.setProperty('--_text', themeText, 'important')
      el.style.setProperty('--_primary', themePrimary, 'important')
      el.style.setProperty('--_border', themeBorder || 'rgba(128,128,128,0.2)', 'important')
      el.style.setProperty('--_content', themeBg, 'important')
      // 表面色和 hover 色基于背景色自动计算
      const isDark = isColorDark(themeBg)
      if (isDark) {
        el.style.setProperty('--_surface', 'rgba(255,255,255,0.06)', 'important')
        el.style.setProperty('--_hover', 'rgba(255,255,255,0.12)', 'important')
        el.style.setProperty('--_active', 'rgba(255,255,255,0.18)', 'important')
        el.style.setProperty('--_input-bg', 'rgba(255,255,255,0.06)', 'important')
        el.style.setProperty('--_scroll-track', 'rgba(255,255,255,0.05)', 'important')
        el.style.setProperty('--_scroll-thumb', 'rgba(255,255,255,0.2)', 'important')
        el.style.setProperty('--_scroll-thumb-hover', 'rgba(255,255,255,0.35)', 'important')
      } else {
        el.style.setProperty('--_surface', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_hover', 'rgba(0,0,0,0.08)', 'important')
        el.style.setProperty('--_active', 'rgba(0,0,0,0.12)', 'important')
        el.style.setProperty('--_input-bg', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_scroll-track', 'rgba(0,0,0,0.04)', 'important')
        el.style.setProperty('--_scroll-thumb', 'rgba(0,0,0,0.18)', 'important')
        el.style.setProperty('--_scroll-thumb-hover', 'rgba(0,0,0,0.3)', 'important')
      }
      this.autoDetectedThemeName = ''
      return
    }

    if (hasPreset) {
      // 预设主题但颜色值不全，清除内联样式回退 CSS 变量链
      vars.forEach(v => el.style.removeProperty(v))
      this.autoDetectedThemeName = ''
      return
    }

    // Auto 模式：通过 Tabby 的 --body-bg CSS 变量判断 UI 暗/亮模式
    // --body-bg 由 Tabby 根据"始终使用暗色/亮色/跟随系统"设置自动更新
    let bodyBg = '#1e1e2e' // 默认暗色
    try {
      const computedStyle = getComputedStyle(document.documentElement)
      const cssBg = computedStyle.getPropertyValue('--body-bg').trim()
      if (cssBg && cssBg !== '') {
        bodyBg = cssBg
      } else {
        // --body-bg 不可用时，回退到系统颜色方案偏好
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
      }
    } catch {
      // 兜底：使用系统偏好
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
    }

    // 解析 hex → RGB，计算亮度判定暗/亮（支持 rgb()/rgba() 格式）
    let r = 30, g = 30, b = 46
    if (bodyBg.startsWith('rgb')) {
      const match = bodyBg.match(/\d+/g)
      if (match && match.length >= 3) { r = +match[0]; g = +match[1]; b = +match[2] }
    } else {
      const hex = bodyBg.replace('#', '')
      r = parseInt(hex.substring(0, 2), 16) || 30
      g = parseInt(hex.substring(2, 4), 16) || 30
      b = parseInt(hex.substring(4, 6), 16) || 46
    }

    // 感知亮度公式（ITU-R BT.601）
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const isDark = lum < 128

    // 更新公开属性，供设置面板显示当前映射的主题名
    this.autoDetectedThemeName = isDark ? 'dark' : 'light'

    // 使用 setProperty 第三参数 'important' 确保 inline 样式不被 :host CSS 覆盖
    // Auto 模式颜色与设置页 dark/light 预设主题保持一致
    if (isDark) {
      const bg = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
      el.style.setProperty('--_bg', bg, 'important')
      el.style.setProperty('--_text', '#e8edf5', 'important')
      el.style.setProperty('--_primary', '#b6b6c3', 'important')
      el.style.setProperty('--_border', '#2d3242', 'important')
      el.style.setProperty('--_content', bg, 'important')
      el.style.setProperty('--_surface', 'rgba(255,255,255,0.06)', 'important')
      el.style.setProperty('--_hover', 'rgba(255,255,255,0.12)', 'important')
      el.style.setProperty('--_active', 'rgba(255,255,255,0.18)', 'important')
      el.style.setProperty('--_input-bg', 'rgba(255,255,255,0.06)', 'important')
      el.style.setProperty('--_scroll-track', 'rgba(255,255,255,0.05)', 'important')
      el.style.setProperty('--_scroll-thumb', 'rgba(255,255,255,0.2)', 'important')
      el.style.setProperty('--_scroll-thumb-hover', 'rgba(255,255,255,0.35)', 'important')
    } else {
      el.style.setProperty('--_bg', '#ffffff', 'important')
      el.style.setProperty('--_text', '#333333', 'important')
      el.style.setProperty('--_primary', '#2563eb', 'important')
      el.style.setProperty('--_border', '#d1d5db', 'important')
      el.style.setProperty('--_content', '#ffffff', 'important')
      el.style.setProperty('--_surface', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_hover', 'rgba(0,0,0,0.08)', 'important')
      el.style.setProperty('--_active', 'rgba(0,0,0,0.12)', 'important')
      el.style.setProperty('--_input-bg', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_scroll-track', 'rgba(0,0,0,0.04)', 'important')
      el.style.setProperty('--_scroll-thumb', 'rgba(0,0,0,0.18)', 'important')
      el.style.setProperty('--_scroll-thumb-hover', 'rgba(0,0,0,0.3)', 'important')
    }
    // 强制 Angular 变更检测，确保子元素 CSS 变量重新计算
    this._safeDetect()
  }

  /** 格式化传输速度 */
  private _formatSpeed(bytes: number, ms: number): string {
    if (bytes <= 0 || ms <= 0) return ''
    const bps = (bytes / ms) * 1000
    if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
    if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
    return Math.round(bps) + ' B/s'
  }

  close(): void {
    // 有正在进行的传输时，提示用户确认
    if (this.transfers.length > 0) {
      const msg = this.i18n.t('notify.closeWithTransfers', { count: this.transfers.length })
      if (!confirm(msg)) return
      // 用户确认关闭 → 取消所有传输
      this.clearTransfers()
    }
    this.saveCurrentPath()
    if (this.displayMode !== 'workspace') {
      this.disconnect()
    }
    this.onClose?.()
  }

  /** 读取行为类开关（选中书签后关闭书签面板） */
  private _readBehaviorConfig(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (cfg?.closeBookmarkPanelOnSelect !== undefined) {
        this.closeBookmarkPanelOnSelect = !!cfg.closeBookmarkPanelOnSelect
      }
      if (cfg?.bookmarkPanelGroupByScope !== undefined) {
        this.bookmarkPanelGroupByScope = cfg.bookmarkPanelGroupByScope !== false
      }
      if (Array.isArray(cfg?.bookmarkPanelGroupOrder) && cfg.bookmarkPanelGroupOrder.length) {
        const valid = (cfg.bookmarkPanelGroupOrder as string[]).filter(
          (x): x is 'connection' | 'global' => x === 'connection' || x === 'global',
        )
        if (valid.includes('connection') && valid.includes('global')) {
          this.bookmarkPanelGroupOrder = [valid[0], valid.find(x => x !== valid[0])!]
        }
      }
      // 自定义时间格式：pattern 变化后 formatDate 输出改变，必须失效 _cells 预计算缓存
      const fmt = typeof cfg?.dateFormat === 'string' ? cfg.dateFormat.trim() : ''
      if (fmt !== getDateFormatPattern()) {
        setDateFormatPattern(fmt)
        this._invalidateLocalCache()
        this._invalidateRemoteCache()
      }
      // ★ 上传/下载并发数（1-10，默认 3）：调高后立即启动更多排队条目
      const up = Number(cfg?.transferUploadConcurrency)
      const dl = Number(cfg?.transferDownloadConcurrency)
      this._uploadConcurrency = this._clampConcurrency(Number.isFinite(up) ? up : 3)
      this._downloadConcurrency = this._clampConcurrency(Number.isFinite(dl) ? dl : 3)
      // ★ 2026-09-28：传输通道模式（含旧 transferTarAcceleration 开关迁移：false→sftpOnly，true/缺省→smart）
      const legacy = (cfg as any)?.transferTarAcceleration
      if ((cfg as any)?.transferChannelMode && ['smart', 'sftpOnly', 'tarOnly', 'preferSftp', 'preferTar'].includes((cfg as any).transferChannelMode)) {
        this._transferChannelMode = (cfg as any).transferChannelMode
      } else if (legacy === false) {
        this._transferChannelMode = 'sftpOnly'
      } else {
        this._transferChannelMode = 'smart'
      }
      // ★ 2026-09-07 issue #15：冲突内容摘要（关闭时行为与旧版完全一致：仅按 size+mtime 判定）
      this._conflictDigestEnabled = cfg?.conflictDigestEnabled !== false
      this._conflictAutoSkipSameContent = cfg?.conflictAutoSkipSameContent !== false
      // ★ 2026-09-21 P2 修复：补上界 [1, 4096]MB —— 面板是摘要的实际消费方，
      //   配置里被写入极大值时每次冲突检测都会对巨型文件求 hash
      const digestMaxMB = Number(cfg?.conflictDigestMaxSizeMB)
      this._conflictDigestMaxSizeMB = Number.isFinite(digestMaxMB) && digestMaxMB > 0
        ? Math.min(4096, Math.max(1, Math.floor(digestMaxMB)))
        : 256
      this._conflictDigestAlgo = cfg?.conflictDigestAlgo === 'sha256' ? 'sha256' : 'sha1'
      this._pumpUploadQueue()
      this._pumpDownloadQueue()
    } catch { /* ignore */ }
  }

  /** 并发数范围约束（1-10，非法值回落默认 3） */
  private _clampConcurrency(v: number): number {
    if (!Number.isFinite(v)) return 3
    return Math.min(10, Math.max(1, Math.round(v)))
  }

  /** 读取面板几何（位置/尺寸/最大化），全局配置跨会话生效 */
  private _loadPanelGeometry(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      let g = cfg?.panelGeometry
      // ★ 2026-09-20：config 为空时回退 localStorage（此前只写 store 不 save，重启易丢失）
      if ((!g || typeof g !== 'object' || !(g.width || g.height)) && typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('sftp-plus-panel-geometry')
          if (raw) g = JSON.parse(raw)
        } catch { /* ignore */ }
      }
      if (g && typeof g === 'object') {
        this._panelGeom = {
          left: typeof g.left === 'string' ? g.left : undefined,
          top: typeof g.top === 'string' ? g.top : undefined,
          width: typeof g.width === 'string' ? g.width : undefined,
          height: typeof g.height === 'string' ? g.height : undefined,
          maximized: !!g.maximized,
          followWindow: !!g.followWindow,
        }
      }
    } catch { /* ignore */ }
  }

  /**
   * 持久化面板几何。
   * ★ 2026-09-20 核实：旧注释写「交给 Tabby 退出时统一落盘、勿 save()」，但实际只改
   *   store 内存、不 save 时，直接关 Tabby 经常丢尺寸（ConfigService 未必把嵌套赋值标脏）。
   *   缩放/拖拽结束本来就只调一次，立即 save() 安全；并双写 localStorage 兜底。
   *   （历史「频繁 save 损坏 yaml」来自 mousemove 每帧 save，不是 mouseup 一次。）
   */
  private _persistPanelGeometry(): void {
    if (!this.configService?.store && typeof localStorage === 'undefined') return
    try {
      // 最大化时宿主 style 是 100%，需存还原后的真实几何（已是百分比），否则重载无法复原
      const g = (this.panelMaximized && this._prevGeom)
        ? this._prevGeom
        : {
            left: this._hostEl?.style.left || '',
            top: this._hostEl?.style.top || '',
            width: this._hostEl?.style.width || '',
            height: this._hostEl?.style.height || '',
          }
      // ★ 归一化为百分比：px → 相对父窗口的 %；已为 % 则原样保留
      const payload = {
        left: this._toPct(g.left as string, 'x'),
        top: this._toPct(g.top as string, 'y'),
        width: this._toPct(g.width as string, 'w'),
        height: this._toPct(g.height as string, 'h'),
        maximized: !!this.panelMaximized,
        // 百分比几何始终跟随窗口缩放与多窗口适配
        followWindow: true,
      }
      this._panelGeom = { ...payload }

      if (this.configService?.store) {
        if (!this.configService.store['tabby-sftp-plus']) {
          this.configService.store['tabby-sftp-plus'] = {}
        }
        const target = this.configService.store['tabby-sftp-plus']
        target.panelGeometry = payload
        try { this.configService.save() } catch (e) {
          log.warn('[panel-geom] configService.save failed:', e)
        }
      }
      try {
        localStorage.setItem('sftp-plus-panel-geometry', JSON.stringify(payload))
      } catch { /* ignore */ }
    } catch (e) {
      log.warn('[panel-geom] persist failed:', e)
    }
  }

  /** 把几何值归一化为「相对父窗口的百分比」。
   *  - 已是 %（如 "96%"）原样返回；
   *  - px（如 "820px"）按当前父窗口尺寸换算为 %；
   *  - 空/非法值返回空串（由调用方 fallback 处理）。 */
  private _toPct(v: string | undefined, axis: 'x' | 'y' | 'w' | 'h'): string {
    if (!v) return ''
    if (v.includes('%')) return v
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return v
    const pr = parent.getBoundingClientRect()
    const px = parseFloat(v)
    if (!Number.isFinite(px)) return v
    const base = (axis === 'x' || axis === 'w') ? pr.width : pr.height
    if (base <= 0) return v
    return (px / base * 100).toFixed(2) + '%'
  }

  /** 若已存值为百分比则采用，否则回退默认百分比（用于初始化套用） */
  private _pctOr(v: string | undefined, fallback: string): string {
    return (typeof v === 'string' && v.includes('%')) ? v : fallback
  }

  /** 判断已保存几何是否为百分比几何（区别于旧版固定 px） */
  private _isPctGeom(g: { width?: string; height?: string }): boolean {
    return (typeof g.width === 'string' && g.width.includes('%')) ||
           (typeof g.height === 'string' && g.height.includes('%'))
  }

  /** 最小化面板（不销毁，下次点击入口直接恢复） */
  minimize(): void {
    this.saveCurrentPath()
    this.minimized = true
    this.onMinimize?.()
  }

  // ========== 浮动面板几何：拖拽移动 / 缩放 / 最大化（仅 floating 模式）==========

  /** floating 模式下把面板宿主从 flex 居中切换为绝对定位，并应用已保存（或默认居中）几何 */
  private _initPanelGeometry(): void {
    const host = this.elRef.nativeElement as HTMLElement
    this._hostEl = host
    const parent = host.offsetParent as HTMLElement | null
    if (!parent) {
      // 宿主尚未挂载到可定位父级，稍后重试一次（避免拖拽/缩放/最大化静默失效）
      if (!this._geomInitRetried) {
        this._geomInitRetried = true
        this._geomInitTimer = setTimeout(() => this._initPanelGeometry(), 50)
      }
      return
    }
    const r = host.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    host.style.position = 'absolute'
    const saved = this._panelGeom
    if (saved.maximized) {
      // 恢复最大化：记录还原基准几何（已是百分比，自定义尺寸也能正确还原），再铺满
      this._prevGeom = {
        left: this._pctOr(saved.left, '2%'),
        top: this._pctOr(saved.top, '3%'),
        width: this._pctOr(saved.width, '96%'),
        height: this._pctOr(saved.height, '94%'),
        followWindow: true,
      }
      host.style.left = '0px'
      host.style.top = '0px'
      host.style.width = '100%'
      host.style.height = '100%'
      this.panelMaximized = true
    } else if (!saved.width || !saved.height || this._isPctGeom(saved)) {
      // 默认 / 百分比几何：直接套用百分比定位（默认 96%×94% 居中）。
      // 各 Tabby 窗口（含较小的拆分窗口）大小不同也能自动适配，不再互相串味。
      this._followWindow = true
      host.style.left = this._pctOr(saved.left, '2%')
      host.style.top = this._pctOr(saved.top, '3%')
      host.style.width = this._pctOr(saved.width, '96%')
      host.style.height = this._pctOr(saved.height, '94%')
    } else {
      // 旧版固定 px 几何（升级前的历史数据）：按当前父容器边界 clamp 适配，
      // 下次任意交互后 _persistPanelGeometry 会自动归一化为百分比。
      this._followWindow = false
      let w = parseFloat(saved.width as string) || r.width
      let h = parseFloat(saved.height as string) || r.height
      let left = saved.left != null ? parseFloat(saved.left) : (r.left - pr.left)
      let top = saved.top != null ? parseFloat(saved.top) : (r.top - pr.top)
      w = Math.max(this._geomMinW, Math.min(w, pr.width))
      h = Math.max(this._geomMinH, Math.min(h, pr.height))
      left = Math.min(Math.max(0, left), pr.width - w)
      top = Math.min(Math.max(0, top), pr.height - h)
      host.style.left = left + 'px'
      host.style.top = top + 'px'
      host.style.width = w + 'px'
      host.style.height = h + 'px'
    }
    this.panelDraggable = true
    this._safeDetect()
  }

  /** 应用「跟随窗口」默认几何：96%×94% 居中，使用百分比定位 → Tabby 窗口缩放时面板自动跟随 */
  private _applyDefaultGeometry(): void {
    const host = this._hostEl
    if (!host) return
    host.style.left = '2%'
    host.style.top = '3%'
    host.style.width = '96%'
    host.style.height = '94%'
    this._followWindow = true
    this.panelMaximized = false
    this._prevGeom = null
    this._safeDetect()
    this._scheduleLayoutRefresh()
  }

  /** 把「跟随窗口」百分比几何转换为固定 px（拖拽/缩放开始时调用，避免百分比参与像素运算） */
  private _convertFollowToPx(): void {
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    const r = host.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    host.style.left = (r.left - pr.left) + 'px'
    host.style.top = (r.top - pr.top) + 'px'
    host.style.width = r.width + 'px'
    host.style.height = r.height + 'px'
    this._followWindow = false
  }

  /** 浮动模式：Tabby 窗口缩放后，若自定义固定 px 几何超出新的父容器边界，
   * 重新 clamp 到父容器，避免后续拖拽移动时 clamp 下界（pr.width - host.offsetWidth）
   * 为负导致面板飞出/错位。仅在非最大化、非跟随窗口（即固定 px）时处理；
   * 跟随窗口百分比几何由浏览器自动适配，不在此处理。 */
  private _clampGeometryToParent(): void {
    if (this.displayMode === 'workspace' || this.panelMaximized || this._followWindow) return
    if (this._resizing || this.panelDragging) return
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    // 百分比几何不 clamp（理论上 _followWindow=false 时已是 px，这里双保险）
    if (host.style.width.includes('%') || host.style.height.includes('%')) return
    const pr = parent.getBoundingClientRect()
    let w = parseFloat(host.style.width) || host.offsetWidth
    let h = parseFloat(host.style.height) || host.offsetHeight
    let left = parseFloat(host.style.left) || 0
    let top = parseFloat(host.style.top) || 0
    w = Math.max(this._geomMinW, Math.min(w, pr.width))
    h = Math.max(this._geomMinH, Math.min(h, pr.height))
    left = Math.min(Math.max(0, left), Math.max(0, pr.width - w))
    top = Math.min(Math.max(0, top), Math.max(0, pr.height - h))
    host.style.left = left + 'px'
    host.style.top = top + 'px'
    host.style.width = w + 'px'
    host.style.height = h + 'px'
  }

  /** 顶部标题栏按下：开始拖拽移动（仅左键，且需移动超过阈值才生效，避免误触） */
  onTopBarMouseDown(e: MouseEvent): void {
    if (this.displayMode === 'workspace' || this.panelMaximized || !this.panelDraggable) return
    // ★ 2026-08-25：仅左键拖拽；右键/中键交回系统（如右键菜单）
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('button, input, a, .disconnect-indicator, .reconnect-btn')) return
    const host = this._hostEl
    if (!host) return
    // 跟随窗口模式下先转换为固定 px，避免百分比参与拖拽像素运算
    if (this._followWindow) this._convertFollowToPx()
    e.preventDefault()
    const r = host.getBoundingClientRect()
    this._dragOffsetX = e.clientX - r.left
    this._dragOffsetY = e.clientY - r.top
    this._dragStartClientX = e.clientX
    this._dragStartClientY = e.clientY
    // 先不置 panelDragging：未超过移动阈值前视为「点击」，不移动也不显示拖拽态
    this._dragThresholdPassed = false
    this.panelDragging = false
    this._safeDetect()
    // 防重复绑定：先移除再添加
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    document.addEventListener('mousemove', this._onGeomMoveBound)
    document.addEventListener('mouseup', this._onGeomUpBound)
  }

  /** 缩放手柄按下：开始缩放 */
  onResizeStart(e: MouseEvent, dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'): void {
    if (this.displayMode === 'workspace' || this.panelMaximized || !this.panelDraggable) return
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    // 跟随窗口模式下先转换为固定 px，避免百分比参与缩放像素运算
    if (this._followWindow) this._convertFollowToPx()
    e.preventDefault()
    e.stopPropagation()
    const r = host.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    this._resizing = true
    this._resizeDir = dir
    this._resizeStart = { left: r.left - pr.left, top: r.top - pr.top, w: r.width, h: r.height, mx: e.clientX, my: e.clientY }
    this.panelResizing = true
    this._safeDetect()
    // 防重复绑定：先移除再添加
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    document.addEventListener('mousemove', this._onGeomMoveBound)
    document.addEventListener('mouseup', this._onGeomUpBound)
  }

  private _onGeomMove(e: MouseEvent): void {
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    const pr = parent.getBoundingClientRect()
    if (this._resizing && this._resizeDir) {
      const dx = e.clientX - this._resizeStart.mx
      const dy = e.clientY - this._resizeStart.my
      let left = this._resizeStart.left
      let top = this._resizeStart.top
      let w = this._resizeStart.w
      let h = this._resizeStart.h
      const dir = this._resizeDir
      if (dir.includes('e')) w = this._resizeStart.w + dx
      if (dir.includes('s')) h = this._resizeStart.h + dy
      if (dir.includes('w')) { w = this._resizeStart.w - dx; left = this._resizeStart.left + dx }
      if (dir.includes('n')) { h = this._resizeStart.h - dy; top = this._resizeStart.top + dy }
      w = Math.max(this._geomMinW, Math.min(w, pr.width))
      h = Math.max(this._geomMinH, Math.min(h, pr.height))
      left = Math.min(Math.max(0, left), pr.width - w)
      top = Math.min(Math.max(0, top), pr.height - h)
      host.style.left = left + 'px'
      host.style.top = top + 'px'
      host.style.width = w + 'px'
      host.style.height = h + 'px'
      // 拖拽缩放过程中实时触发布局自适应（窄屏切换 / 分栏重排），rAF 已节流
      this._scheduleLayoutRefresh()
    } else {
      // ★ 2026-08-25：移动未超过阈值（约 4px）视为点击，不移动面板，避免误触
      if (!this._dragThresholdPassed) {
        const dx = Math.abs(e.clientX - this._dragStartClientX)
        const dy = Math.abs(e.clientY - this._dragStartClientY)
        if (dx < 4 && dy < 4) return
        this._dragThresholdPassed = true
        this.panelDragging = true
        this._safeDetect()
      }
      let nx = e.clientX - pr.left - this._dragOffsetX
      let ny = e.clientY - pr.top - this._dragOffsetY
      nx = Math.min(Math.max(0, nx), pr.width - host.offsetWidth)
      ny = Math.min(Math.max(0, ny), pr.height - host.offsetHeight)
      host.style.left = nx + 'px'
      host.style.top = ny + 'px'
    }
  }

  private _onGeomUp(): void {
    document.removeEventListener('mousemove', this._onGeomMoveBound)
    document.removeEventListener('mouseup', this._onGeomUpBound)
    this._resizing = false
    this._resizeDir = null
    this.panelDragging = false
    this.panelResizing = false
    this._safeDetect()
    // 拖拽 / 缩放结束：持久化几何到全局配置（落盘时已归一化为百分比，各窗口自动适配）
    this._persistPanelGeometry()
    // 还原为「跟随窗口」语义：百分比几何随窗口大小自适应，窗口缩放时不再 clamp
    this._followWindow = true
  }

  /** 最大化 / 还原（仅在 floating 模式） */
  toggleMaximize(): void {
    if (this.displayMode === 'workspace' || !this.panelDraggable) return
    const host = this._hostEl
    if (!host) return
    if (!this.panelMaximized) {
      this._prevGeom = {
        left: host.style.left,
        top: host.style.top,
        width: host.style.width,
        height: host.style.height,
        followWindow: this._followWindow,
      }
      host.style.left = '0px'
      host.style.top = '0px'
      host.style.width = '100%'
      host.style.height = '100%'
      this.panelMaximized = true
    } else {
      if (this._prevGeom) {
        host.style.left = this._prevGeom.left
        host.style.top = this._prevGeom.top
        host.style.width = this._prevGeom.width
        host.style.height = this._prevGeom.height
        this._followWindow = !!this._prevGeom.followWindow
      }
      this.panelMaximized = false
      // 还原时同步刷新布局：强制回流后立即应用正确的面板分割比例，
      // 避免下一帧才通过 requestAnimationFrame 修正导致视觉跳跃（#layout-delay）
      if (this._layoutMode === 'single') {
        this._isNarrowLayout = false
        this.activePane = 'remote'
      } else {
        this._syncNarrowLayout()
      }
      void host.offsetHeight // 强制回流，确保 .sftp-body 尺寸已更新
      this._applyPaneSplit()
    }
    this._safeDetect()
    this._scheduleLayoutRefresh()
    this._persistPanelGeometry()
  }

  /** 打开 Tabby 设置并定位到 SFTP+ 页面 */
  openPluginSettings(): void {
    this.zone.run(() => {
      try {
        const app = this.injector.get(AppService)
        openSftpPlusSettings(app)
      } catch (e) {
        log.error('openPluginSettings failed', e)
      }
    })
  }

  // ========== 连接管理（委托 panel/connection-lifecycle） ==========
  async connect(): Promise<void> {
    await this._connLifecycle.connect()
    if (this.pathMode === 'sync' && this.connected) {
      this._startCwdSync()
      void this._syncRemoteToTerminalCwd(true)
    }
  }

  disconnect(): void {
    this._stopCwdSync()
    this._connLifecycle?.disconnect()
  }

  onReconnect(): Promise<void> {
    return this._reconnectKeepingSync()
  }

  private async _reconnectKeepingSync(): Promise<void> {
    await this._connLifecycle.reconnect()
    if (this.pathMode === 'sync' && this.connected) {
      this._cwdSetupPrompted = false
      this._startCwdSync()
      void this._syncRemoteToTerminalCwd(true)
    }
  }

  /** 清空远程列表与 uid 映射（断开/会话失效时调用） */
  clearRemoteListing(): void {
    // ★ 2026-07-25：B4 修复——递增刷新代际，使断连时在途的 refreshRemote 因 gen 不匹配而丢弃结果，
    //   避免过期远程列表在断开后被写回（本地刷新侧已有 _localRefreshGen++，远端此前遗漏）。
    this._remoteRefreshGen++
    this.remoteEntries = []
    this._remoteError = false
    this._invalidateRemoteCache()
    this.remoteIdResolver.reset()
    // ★ 2026-09-21 P0 修复：列表已清空，选中项不得留到重连后（否则重连回同一目录时
    //   _lastRemoteListedPath 未变、不会触发 _dropSelection，残留项会「复活」）
    this._dropSelection('remote')
    this._lastRemoteListedPath = null
  }

  private _clearPanelTimers(): void {
    if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null }
    if (this._remoteLoadingTimer) { clearTimeout(this._remoteLoadingTimer); this._remoteLoadingTimer = null }
    if (this._remoteFlashTimer) { clearTimeout(this._remoteFlashTimer); this._remoteFlashTimer = null }
    if (this._localFlashTimer) { clearTimeout(this._localFlashTimer); this._localFlashTimer = null }
    this._clearQueuedEntryTimers()
  }

  /** ★ 2026-09-20 A2：把「已跳过条目延迟移除」定时器收进可清理数组（原 setTimeout 无句柄、销毁后仍触发） */
  private _scheduleQueuedEntryRemoval(entry: PanelTransferItem, delayMs = 4000): void {
    const timer = setTimeout(() => {
      this._queuedEntryTimers = this._queuedEntryTimers.filter(t => t !== timer)
      if (!this._isAlive) return
      this._removeQueuedEntry(entry)
    }, delayMs)
    this._queuedEntryTimers.push(timer)
  }

  private _clearQueuedEntryTimers(): void {
    for (const timer of this._queuedEntryTimers) clearTimeout(timer)
    this._queuedEntryTimers = []
  }

  /**
   * 冲突解决：将本地目录合并上传到远程目标路径（覆盖同名文件）
   */
  async mergeLocalDirToRemote(localSrc: string, remoteDest: string, reuseLogEntryId?: string): Promise<boolean> {
    // ★ 2026-09-20 P1-2：合并覆盖同样是一个独立的目录任务，需自带任务 ref + 作用域，
    //   否则其子文件流会被登记到别的任务的 ref 上（取消别的任务时被连带中断）
    const cancelRef = { current: null as any, active: new Set<any>() }
    this._cancelRefs.add(cancelRef)
    const prevRef = this._cancelRef
    this._cancelRef = cancelRef
    try {
      return await runInTaskScope(cancelRef, () =>
        this._transferCoordinator.mergeLocalDirToRemote(localSrc, remoteDest, reuseLogEntryId))
    } finally {
      this._cancelRefs.delete(cancelRef)
      if (this._cancelRef === cancelRef) this._cancelRef = prevRef
      if (this._cancelRef && !this._cancelRef.current && !(this._cancelRef.active?.size)) this._cancelRef = null
    }
  }

  private _remoteEnrichOptions(): SftpEnrichOptions {
    const wantOwner = this.remoteShowColOwner || this.remoteShowColGroup
    return {
      atime: this.remoteShowColAccess,
      ownerGroup: wantOwner,
      statFallback: false,
    }
  }

  private _remoteNeedsEnrich(): boolean {
    return this.remoteShowColAccess
      || this.remoteShowColOwner
      || this.remoteShowColGroup
  }

  private async _enrichRemoteMetadata(
    snapshotPath: string,
    baseEntries: SFTPFile[],
    refreshGen: number,
  ): Promise<void> {
    if (!this.connected || !this.sftpSession || this.remotePath !== snapshotPath) return
    if (refreshGen !== this._remoteRefreshGen) return

    let entries = baseEntries
    if (this._remoteNeedsEnrich()) {
      entries = await enrichSftpFilesWithAtime(
        this.sftpSession, snapshotPath, baseEntries, this._remoteEnrichOptions(),
      )
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._invalidateRemoteCache()
        this._safeDetect()
      })
    }

    const wantOwner = this.remoteShowColOwner || this.remoteShowColGroup
    // ★ 2026-07-25 B7：超大目录（超阈值）跳过按条目 stat 的 owner 补全，
    //   避免产生 N 次网络 stat 风暴把 UI 卡死；仅渲染廉价的 atime 补全（上方已完成）。
    //   注：数万级条目的渲染卡顿仍需虚拟滚动（架构级），此处为低风险缓解。
    const hugeDir = entries.length > SftpFloatingPanel.REMOTE_LISTING_ENRICH_LIMIT
    if (wantOwner && !this.remoteIdResolver.remoteExecDisabled && !hugeDir) {
      entries = await enrichRemoteOwnersViaStat(this.sftpSession, entries)
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._invalidateRemoteCache()
        this._safeDetect()
      })
    }

    if (!wantOwner || !this.sshSession) return
    await this.remoteIdResolver.ensureUidMap(this.sshSession)
    if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
    const named = this.applyRemoteOwnerGroupNames(entries)
    this.zone.run(() => {
      if (!this.connected || this.remotePath !== snapshotPath || refreshGen !== this._remoteRefreshGen) return
      this.remoteEntries = named
      this._invalidateRemoteCache()
      this._safeDetect()
    })
  }

  private getDefaultRemotePath(): string {
    return '/'
  }

  private applyRemoteOwnerGroupNames(entries: SFTPFile[]): SFTPFile[] {
    const r = this.remoteIdResolver
    return entries.map(e => {
      const ownerUid = e.ownerUid ?? this.numericIdFromLabel(e.owner)
      const groupGid = e.groupGid ?? this.numericIdFromLabel(e.group)
      const ownerLabel = this.nonNumericLabel(e.owner)
      const groupLabel = this.nonNumericLabel(e.group)
      return {
        ...e,
        ownerUid,
        groupGid,
        owner: r.ownerName(ownerLabel, ownerUid),
        group: r.groupName(groupLabel, groupGid),
      }
    })
  }

  private nonNumericLabel(v: unknown): string | undefined {
    if (v == null) return undefined
    const s = String(v).trim()
    return s && !/^\d+$/.test(s) ? s : undefined
  }

  private numericIdFromLabel(v: unknown): number | undefined {
    if (v == null) return undefined
    const s = String(v).trim()
    if (!/^\d+$/.test(s)) return undefined
    const n = parseInt(s, 10)
    return Number.isNaN(n) ? undefined : n
  }

  // ========== 本地文件 ==========
  async refreshLocal(): Promise<void> {
    this.localPathInput = this.localPath
    if (!this.localPath || typeof this.localPath !== 'string') {
      log.warn('refreshLocal skipped: localPath is invalid')
      return
    }
    const gen = ++this._localRefreshGen
    const requestedPath = this.localPath
    // ★ 2026-09-21 P0 修复：目录切换即丢弃选择（详见 _dropSelection）。必须在 await 之前同步执行，
    //   否则 listing 期间用户按 Delete 仍会命中上一个目录的残留项。
    if (this._lastLocalListedPath !== requestedPath) {
      this._lastLocalListedPath = requestedPath
      this._dropSelection('local')
    }
    // 刷新时不显示 loading 动画（避免布局 reflow 导致晃动），直接用闪烁反馈
    this._localFlash = false
    // this._safeDetect()  // 去掉强制变更检测，避免重绘抖动
    try {
      const names = await fs.readdir(requestedPath)
      if (gen !== this._localRefreshGen) return
      const needOwner = this.localShowColOwner || this.localShowColGroup
      // 并行 stat，分批（每批 100）避免压垮文件系统
      const BATCH = 100
      // ★ 2026-09-08 issue #16：改用 lstat —— 只有 lstat 能识别符号链接（isSymbolicLink()）。
      //   fs.stat 会 follow 链接，symlink 目录会被直接当目录，无法叠加链接角标。
      const statResults: (import('fs').Stats | null)[] = []
      for (let i = 0; i < names.length; i += BATCH) {
        const batch = names.slice(i, i + BATCH)
        const results = await Promise.all(
          batch.map(name => fs.lstat(path.join(requestedPath, name)).catch(() => null))
        )
        if (gen !== this._localRefreshGen) return
        statResults.push(...results)
      }
      const entries: LocalEntry[] = []
      const isWin = os.platform() === 'win32'
      for (let i = 0; i < names.length; i++) {
        const name = names[i]
        const fp = path.join(requestedPath, name)
        const lst = statResults[i]
        if (lst) {
          let isDirectory = lst.isDirectory()
          let isSymlink = false
          let linkTarget: string | undefined
          // 展示用元数据：默认 lstat；真 symlink 时切到 follow 后的目标 stat（与旧 fs.stat 行为一致）
          let meta: import('fs').Stats = lst
          try { isSymlink = lst.isSymbolicLink() } catch { /* ignore */ }

          if (isWin && name.toLowerCase().endsWith('.lnk')) {
            // ★ 2026-08-24 修复：Windows .lnk 快捷方式 → 不是 symlink，lstat 也解析不了目标类型，
            //   需用 Electron shell.readShortcutLink 读取目标路径后再 stat 目标。
            try {
              const { shell } = require('electron')
              const shortcut = shell.readShortcutLink(fp)
              linkTarget = shortcut.target
              const targetStat = await fs.stat(linkTarget).catch(() => null)
              if (targetStat) isDirectory = targetStat.isDirectory()
            } catch { /* 解析失败则保持原 stat 结果（普通文件） */ }
          } else if (isSymlink) {
            // ★ 2026-09-08 issue #16：真 symlink（POSIX / Windows mklink、junction）——
            //   lstat 不 follow，需再 stat 拿目标真实类型 + 目标元数据。
            const targetStat = await fs.stat(fp).catch(() => null)
            if (targetStat) { isDirectory = targetStat.isDirectory(); meta = targetStat }
          }
          entries.push({
            name, fullPath: fp,
            isDirectory,
            isSymlink,
            linkTarget,
            mode: meta.mode, size: meta.size,
            mtimeMs: meta.mtimeMs, atimeMs: meta.atimeMs,
            birthtimeMs: meta.birthtimeMs,
            owner: needOwner ? meta.uid : undefined,
            group: needOwner ? meta.gid : undefined,
          })
        } else {
          entries.push({ name, fullPath: fp, isDirectory: true, inaccessible: true })
        }
      }
      // 丢弃过期结果：路径已变更则不写入
      if (gen !== this._localRefreshGen) return
      if (this.localPath !== requestedPath) return
      this.zone.run(() => {
        this.localEntries = entries
        this._localError = false
        this._invalidateLocalCache()
        // 同目录刷新：外部已删除/重命名的条目从选择中剔除
        this._pruneSelection('local')
      })
      if (needOwner) {
        void this._enrichLocalOwnerNames(entries)
      }
    } catch (e) {
      if (gen !== this._localRefreshGen) return
      log.error('Local listing failed', e)
      this.zone.run(() => {
        this.localEntries = []
        this._localError = true
        this._invalidateLocalCache()
        this._pruneSelection('local')
      })
    }
    if (gen !== this._localRefreshGen) return
    this._localFlash = true
    this._safeDetect()
    if (this._localFlashTimer) clearTimeout(this._localFlashTimer)
    this._localFlashTimer = setTimeout(() => { this._localFlash = false; this._localFlashTimer = null }, 260)
  }

  private async _enrichLocalOwnerNames(baseEntries: LocalEntry[]): Promise<void> {
    const snapshotPath = this.localPath
    await this.localIdResolver.ensureLocalMaps()
    if (this.localPath !== snapshotPath) return
    const enriched = baseEntries.map(e => ({
      ...e,
      owner: typeof e.owner === 'number'
        ? this.localIdResolver.ownerName(undefined, e.owner)
        : e.owner,
      group: typeof e.group === 'number'
        ? this.localIdResolver.groupName(undefined, e.group)
        : e.group,
    }))
    this.zone.run(() => {
      if (this.localPath !== snapshotPath) return
      this.localEntries = enriched
      this._invalidateLocalCache()
      this._safeDetect()
    })
  }

  canLocalUp(): boolean {
    if (!this.localPath || typeof this.localPath !== 'string') return false
    return path.dirname(this.localPath) !== this.localPath
  }

  canRemoteUp(): boolean {
    if (!this.remotePath || typeof this.remotePath !== 'string') return false
    return this.remotePath !== '/'
  }

  localUp(): void { this._paneUp('local') }

  goLocalHome(): void { this._paneGoHome('local') }

  /** 统一上级目录导航 */
  private _paneUp(side: 'local' | 'remote'): void {
    if (side === 'local') {
      const parent = path.dirname(this.localPath)
      if (parent !== this.localPath) {
        this._pushLocalNav(parent); this.localPath = parent; this.localPathInput = parent
        this.saveCurrentPath(); void this.refreshLocal()
      }
    } else {
      if (!this.connected || this.remotePath === '/') return
      const next = path.posix.dirname(this.remotePath)
      const dest = next === '.' ? '/' : next
      this._pushRemoteNav(dest); this.remotePath = dest; this.remotePathInput = this.remotePath
      this.saveCurrentPath(); void this.refreshRemote()
    }
  }

  /** 统一回到主目录 */
  private _paneGoHome(side: 'local' | 'remote'): void {
    const home = side === 'local' ? os.homedir() : '/'
    if (side === 'remote' && (!this.connected || !this.sftpSession)) return
    if (side === 'local') this._pushLocalNav(home)
    else this._pushRemoteNav(home)
    if (side === 'local') { this.localPath = home; this.localPathInput = home }
    else { this.remotePath = home; this.remotePathInput = home }
    this.saveCurrentPath()
    if (side === 'local') void this.refreshLocal()
    else void this.refreshRemote()
  }

  goToLocalPathInput(): void {
    const target = this.normalizeLocalPath(this.localPathInput || this.localPath)
    if (target === this.localPath) return
    this._pushLocalNav(target)
    this.localPath = target
    this.localPathInput = this.localPath
    this.saveCurrentPath()
    void this.refreshLocal()
  }

  private normalizeLocalPath(p: string): string {
    if (!p) return this.localPath || ''
    const base = this.localPath || ''
    const joined = path.isAbsolute(p) ? p : path.join(base, p)
    // ★ 2026-08-26：normalize/resolve，折叠 .. 与混用分隔符
    return path.resolve(path.normalize(joined))
  }

  // ========== 远程文件 ==========
  async refreshRemote(): Promise<boolean> {
    // ★ 2026-09-29 issue #25：实现搬到 _refreshRemoteInternal，带上「是否已自愈重试过」标志，
    //   使「通道已死 → 静默换通道 → 重试一次」不会递归成无限重试。
    return this._refreshRemoteInternal(false)
  }

  private async _refreshRemoteInternal(retriedAfterReopen: boolean): Promise<boolean> {
    if (!this.connected || !this.sftpSession) return false
    const refreshGen = ++this._remoteRefreshGen
    this.remotePathInput = this.remotePath
    if (!this.remotePath || typeof this.remotePath !== 'string') {
      log.warn('refreshRemote skipped: remotePath is invalid, resetting to /')
      this.remotePath = '/'
      this.remotePathInput = '/'
    }
    this._remoteFlash = false

    if (this._remoteLoadingTimer) {
      clearTimeout(this._remoteLoadingTimer)
      this._remoteLoadingTimer = null
    }
    this._remoteLoadingTimer = setTimeout(() => {
      if (refreshGen !== this._remoteRefreshGen) return
      this._remoteLoading = true
      this._safeDetect()
    }, 150)

    const snapshotPath = this.remotePath
    // ★ 2026-09-21 P0 修复：目录切换即丢弃选择（详见 _dropSelection），须在 await 之前同步执行
    if (this._lastRemoteListedPath !== snapshotPath) {
      this._lastRemoteListedPath = snapshotPath
      this._dropSelection('remote')
    }
    try {
      const entries = await this.sftpSession.readdir(snapshotPath)
      if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return true
      if (this._remoteLoadingTimer) {
        clearTimeout(this._remoteLoadingTimer)
        this._remoteLoadingTimer = null
      }
      this._remoteLoading = false
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = entries
        this._remoteError = false
        this._invalidateRemoteCache()
        // 同目录刷新：远端已删除/重命名的条目从选择中剔除
        this._pruneSelection('remote')
      })
      if (this._remoteNeedsEnrich()) {
        void this._enrichRemoteMetadata(snapshotPath, entries, refreshGen)
      }
    } catch (e) {
      if (refreshGen !== this._remoteRefreshGen) return false
      if (this._remoteLoadingTimer) {
        clearTimeout(this._remoteLoadingTimer)
        this._remoteLoadingTimer = null
      }
      this._remoteLoading = false
      // ★ 2026-09-29 issue #25：通道已死（session closed / channel closed / 连接被重置）时，
      //   先**静默换一条新的 SFTP 子通道再重试一次**，而不是把错误直接甩给用户并清空列表。
      //   实测日志里 129 条 `Remote listing failed UnexpectedBehavior("session closed")`
      //   就是这么刷出来的：弱网把通道关掉后，用户每点一次刷新/切一次目录就多一条 error。
      //   只在第一次尝试时自愈（retriedAfterReopen=false），失败通道上绝不无限递归重试。
      //   自愈本身不弹通知、不打断在途传输（有传输时交给心跳处理，见 recoverChannelForListing）。
      if (!retriedAfterReopen && isChannelDeadError(e) && this._connLifecycle?.recoverChannelForListing) {
        const healed = await this._connLifecycle.recoverChannelForListing()
        // 期间可能已有更新的刷新在跑 / 面板已销毁 → 让那一次说了算
        if (healed && refreshGen === this._remoteRefreshGen && this._isAlive) {
          log.info('Remote listing retried on a freshly reopened SFTP session')
          return this._refreshRemoteInternal(true)
        }
      }
      log.error('Remote listing failed', e)
      this.zone.run(() => {
        if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return
        this.remoteEntries = []
        this._remoteError = true
        this._invalidateRemoteCache()
        this._pruneSelection('remote')
      })
      this._safeDetect()
      return false
    }
    if (refreshGen !== this._remoteRefreshGen || snapshotPath !== this.remotePath) return true
    this._remoteFlash = true
    this._safeDetect()
    if (this._remoteFlashTimer) clearTimeout(this._remoteFlashTimer)
    this._remoteFlashTimer = setTimeout(() => {
      this._remoteFlash = false
      this._remoteFlashTimer = null
    }, 260)
    return true
  }

  // ========== 远程导航历史 ==========

  /**
   * 将路径加入导航历史（后退/前进用）
   */
  protected _pushRemoteNav(newPath: string): void {
    this._remoteNav.push(newPath, this._ignoreNavPush)
  }

  /** 后退 */
  async remoteBack(): Promise<void> { await this._paneNavToTarget('remote', 'back') }

  /** 前进 */
  async remoteForward(): Promise<void> { await this._paneNavToTarget('remote', 'forward') }

  /** 统一导航到历史目标 */
  private async _paneNavToTarget(side: 'local' | 'remote', dir: 'back' | 'forward'): Promise<void> {
    const nav = side === 'local' ? this._localNav : this._remoteNav
    const canGo = side === 'local' ? (dir === 'back' ? this.canLocalBack : this.canLocalForward)
                                   : (dir === 'back' ? this.canRemoteBack : this.canRemoteForward)
    if (!canGo) return
    const target = dir === 'back' ? nav.back() : nav.forward()
    if (!target) {
      log.warn(`${side}Nav ${dir}: history entry invalid, aborting`)
      return
    }
    if (side === 'local') {
      this._ignoreLocalNavPush = true
      this.localPath = target; this.localPathInput = target
      this.saveCurrentPath(); void this.refreshLocal()
      this._ignoreLocalNavPush = false
    } else {
      this._ignoreNavPush = true
      this.remotePath = target; this.remotePathInput = target
      this.saveCurrentPath(); await this.refreshRemote()
      this._ignoreNavPush = false
    }
  }

  remoteUp(): void { this._paneUp('remote') }

  goRemoteHome(): void { this._paneGoHome('remote') }

  goToRemotePathInput(): void {
    if (!this.connected) return
    const target = this.normalizeRemotePath(this.remotePathInput || '/')
    if (target === this.remotePath) return
    this._pushRemoteNav(target)
    this.remotePath = target
    this.remotePathInput = this.remotePath
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  private normalizeRemotePath(p: string): string {
    if (!p) return '/'
    let r = p.trim()
    if (!r.startsWith('/')) r = '/' + r
    // 折叠连续斜杠并解析 .. / . 段，防止路径遍历
    r = path.posix.normalize(r.replace(/\/+/g, '/'))
    if (!r.startsWith('/')) r = '/' + r
    return r
  }

  // ========== 本地导航历史 ==========

  /**
   * 将本地路径加入导航历史（后退/前进用）
   */
  protected _pushLocalNav(newPath: string): void {
    this._localNav.push(newPath, this._ignoreLocalNavPush)
  }

  /** 后退 */
  localBack(): void { this._paneNavToTarget('local', 'back') }

  /** 前进 */
  localForward(): void { this._paneNavToTarget('local', 'forward') }

  /**
   * 指针类面板热键的统一入口（鼠标中键 / 滚轮上滚下滚）（★ 2026-09-29）
   *
   * 背景：原 `onPaneMouseNav()` 挂在组件宿主元素的 mousedown 上，但只认 back/forward 两个动作，
   *   中键与滚轮则完全录不进来。现改为「任何动作都能绑指针事件」的统一分发：
   *   - 匹配与录制共用 `pointerSpecFromEvent()`，录得出来就一定匹配得上；
   *   - 可执行性判定与键盘路径同源（`_contextHotkeyReady` 等），不另造一套；
   *   - 命中即吞掉默认行为（中键自动滚动、滚轮滚动列表）——滚轮绑定后列表就不再滚动，
   *     这是「要触发动作就必须吞默认滚动」的必然代价，设置页保存时会明确提示；
   *   - 未命中一律不干预，列表滚动照旧。
   * 返回 true 表示事件已被消费（调用方不应再继续默认处理）。
   */
  private _consumePanePointerHotkey(side: 'local' | 'remote', event: MouseEvent | WheelEvent): boolean {
    if (!this._isPanelActive) return false
    if (this._isPanelModalOpen()) return false
    // 先找命中的动作（PANEL_HOTKEY_ACTIONS 顺序 ⇒ back 先于 forward，与既有优先级一致）
    let hit: PanelHotkeyAction | null = null
    for (const a of PANEL_HOTKEY_ACTIONS) {
      if (!this._panelHotkeyEnabled(a)) continue
      if (matchPointerHotkeySpecs(event, this._panelHotkeyKeys(a))) { hit = a; break }
    }
    if (!hit) return false
    event.preventDefault()
    event.stopPropagation()
    // 滚轮连发节流：一次触控板滑动会产生几十个 wheel 事件，动作只应触发一次；
    // 但节流窗口内仍然拦截（继续返回 true）——否则列表会「滚一下停一下」，比完全不滚更别扭
    if (typeof (event as WheelEvent).deltaY === 'number') {
      const now = Date.now()
      if (now - this._pointerHotkeyLastFire < SftpFloatingPanel._POINTER_WHEEL_THROTTLE_MS) return true
      this._pointerHotkeyLastFire = now
    }
    this._runPanePointerHotkey(hit, side)
    return true
  }

  /**
   * 执行指针热键命中的动作。
   * 与键盘路径的差别只在「目标侧从哪来」：键盘靠 _resolveTargetPane()（最后交互侧），
   * 指针事件本身带了落点信息（点/滚在哪一侧的列表上），直接用它更准。
   */
  private _runPanePointerHotkey(action: PanelHotkeyAction, side: 'local' | 'remote'): void {
    switch (action) {
      case 'up':
        if (side === 'local') this.localUp(); else this.remoteUp()
        return
      case 'back':
        if (side === 'local') this.localBack(); else this.remoteBack()
        return
      case 'forward':
        if (side === 'local') this.localForward(); else this.remoteForward()
        return
      case 'refresh':
        if (side === 'local') void this.refreshLocal(); else void this.refreshRemote()
        return
      case 'delete': {
        const sel = side === 'local' ? this.selectedLocal : this.selectedRemote
        if (!sel.length) return
        // 指针路径没有 Shift 语义（指针 spec 里的 Shift 是匹配用的修饰键，不是「永久删除」）：
        // 一律走回收站，永久删除仍只由 Shift+键盘触发
        this._paneDelete(side, false)
        return
      }
      case 'rename': {
        const sel = side === 'local' ? this.selectedLocal : this.selectedRemote
        if (sel.length !== 1) return
        if (side === 'local') this.localRename(); else this.remoteRename()
        return
      }
      default: {
        // 右键菜单类动作（上传/下载/打开/查看/编辑/新建/属性/复制路径）：判定沿用键盘路径的 _contextHotkeyReady
        const a = action as PanelHotkeyAction
        if (!CONTEXT_ACTION_HOTKEYS.includes(a)) return
        const pane: 'local' | 'remote' =
          (a === 'upload' || a === 'openLocal') ? 'local'
            : a === 'download' ? 'remote'
              : side
        if (!this._contextHotkeyReady(a, pane)) return
        this.contextMenuPane = pane
        if (SftpFloatingPanel._CTX_HOTKEYS_NEED_ENTRY.has(a)) {
          const sel = pane === 'local' ? this.selectedLocal : this.selectedRemote
          this.contextMenuEntry = (sel[0] as any) ?? null
        }
        this.onContextMenuAction(a as ContextMenuAction)
        return
      }
    }
  }

  /** 文件列表上的滚轮：先让指针热键认领（命中则吞掉滚动），未命中保持原生滚动 */
  onPaneWheel(event: WheelEvent, pane: 'local' | 'remote'): void {
    this._consumePanePointerHotkey(pane, event)
  }

  // ========== 框选（委托 panel/panel-rubber-band） ==========
  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._rubberBand.onPaneListClick(event, pane)
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._commitAllPathInputs()
    // ★ 2026-09-29：指针类热键（中键）优先认领——命中则吞掉，不再进入框选起手逻辑
    if (this._consumePanePointerHotkey(pane, event)) return
    this._rubberBand.onPaneMouseDown(event, pane)
  }

  /** 失焦或点击列表时：放弃未提交的编辑，恢复为当前路径 */
  onLocalPathBlur(): void {
    this.localPathInput = this.localPath
  }

  onRemotePathBlur(): void {
    this.remotePathInput = this.remotePath
  }

  private _commitAllPathInputs(): void {
    const root = this.elRef.nativeElement as HTMLElement
    root.querySelectorAll('.path-input').forEach(node => {
      const inp = node as HTMLInputElement
      if (document.activeElement === inp) inp.blur()
    })
    this.localPathInput = this.localPath
    this.remotePathInput = this.remotePath
  }

  // ========== 窄屏上下布局分割线 ==========

  /** 根据当前布局应用面板分割比例 */
  private _applyPaneSplit(): void {
    if (!this.elRef?.nativeElement) return
    const body = this.elRef.nativeElement.querySelector('.sftp-body') as HTMLElement | null
    if (!body) return
    const panes: HTMLElement[] = Array.from(body.querySelectorAll(':scope > sftp-file-pane'))
    if (panes.length < 1) return

    const splitterSize = 5
    const { w: bodyW, h: bodyH } = this._measureBodySize(body)

    // 以 body 实测宽高再判：过窄/过矮时临时回退，偏好（_layoutMode）不变
    if (this._layoutMode !== 'single') {
      this._syncNarrowLayout(bodyW > 0 ? bodyW : undefined, bodyH > 0 ? bodyH : undefined)
    } else {
      this._effectiveLayout = 'single'
      this._layoutOverrideReason = null
      this._isNarrowLayout = false
    }

    // 单栏（偏好或临时回退）：仅远程面板全宽
    if (this._effectiveLayout === 'single') {
      body.style.flexDirection = 'row'
      body.classList.remove('narrow-layout')
      panes.forEach((p, i) => {
        const isRemote = i === panes.length - 1
        p.style.display = isRemote ? '' : 'none'
        p.style.flex = isRemote ? '1' : ''
        p.style.width = isRemote ? 'auto' : ''
        p.style.height = ''
        p.style.minWidth = isRemote ? '0' : ''
        p.style.minHeight = ''
      })
      return
    }

    if (panes.length < 2) return

    // 清除之前可能残留的内联样式（防止宽窄切换后样式残留）
    panes.forEach(p => {
      p.style.display = ''
      p.style.flex = ''
      p.style.width = ''
      p.style.height = ''
      p.style.minWidth = ''
      p.style.minHeight = ''
    })

    // 用 JS 控制 flex-direction，避免 CSS @media 用视口宽度与元素宽度不同步
    body.style.flexDirection = this._isNarrowLayout ? 'column' : 'row'
    body.classList.toggle('narrow-layout', this._isNarrowLayout)

    if (this._isNarrowLayout) {
      // 窄屏上下布局：按比例分配高度；动态抬高两侧最小高度，避免远程半屏挤成「不可用」
      const usable = Math.max(0, bodyH - splitterSize)
      const minPaneH = Math.min(140, Math.max(88, Math.floor(usable * 0.3)))
      let h0 = Math.round(usable * this._verticalSplitRatio)
      h0 = Math.max(minPaneH, Math.min(h0, usable - minPaneH))
      if (usable > 0) this._verticalSplitRatio = h0 / usable
      panes[0].style.flex = 'none'
      panes[0].style.height = h0 + 'px'
      panes[1].style.flex = '1'
      panes[1].style.minHeight = minPaneH + 'px'
    } else {
      // 宽屏左右布局：minPaneW 随可用宽度动态收缩，禁止固定 450 在窄窗把一侧挤成细条
      const usable = Math.max(0, bodyW - splitterSize)
      const minPaneW = Math.min(450, Math.max(160, Math.floor(usable / 2)))
      let w0 = Math.round(usable * this._horizontalSplitRatio)
      w0 = Math.max(minPaneW, Math.min(w0, usable - minPaneW))
      if (usable > 0) this._horizontalSplitRatio = w0 / usable
      panes[0].style.flex = 'none'
      panes[0].style.width = w0 + 'px'
      panes[1].style.flex = '1'
      panes[1].style.minWidth = minPaneW + 'px'
    }
  }

  /** 分割线按下 */
  onSplitterDown(ev: MouseEvent): void {
    ev.preventDefault()
    this._splitterDidDrag = false
    this._splitDragStartX = ev.clientX
    this._splitDragStartY = ev.clientY
    this._splitDragStartRatio = this._isNarrowLayout ? this._verticalSplitRatio : this._horizontalSplitRatio

    const body = this.elRef.nativeElement.querySelector('.sftp-body')
    if (!body) return
    const bodyH = body.clientHeight
    const bodyW = body.clientWidth

    // 给分割线加 active 样式
    const splitterEl = ev.currentTarget as HTMLElement
    splitterEl.classList.add('active')

    this._splitMoveHandler = (e: MouseEvent): void => {
      if (Math.abs(e.clientX - this._splitDragStartX) > 3 || Math.abs(e.clientY - this._splitDragStartY) > 3) {
        this._splitterDidDrag = true
      }
      if (this._isNarrowLayout) {
        const delta = e.clientY - this._splitDragStartY
        this._verticalSplitRatio = Math.max(0.15, Math.min(0.85, this._splitDragStartRatio + delta / bodyH))
      } else {
        const delta = e.clientX - this._splitDragStartX
        this._horizontalSplitRatio = Math.max(0.15, Math.min(0.85, this._splitDragStartRatio + delta / bodyW))
      }
      this._applyPaneSplit()
    }
    this._splitUpHandler = (_e: MouseEvent): void => {
      splitterEl.classList.remove('active')
      document.removeEventListener('mousemove', this._splitMoveHandler!)
      document.removeEventListener('mouseup', this._splitUpHandler!)
      this._splitMoveHandler = null
      this._splitUpHandler = null
      // 持久化比例
      const key = this._isNarrowLayout ? 'sftp-plus-vertical-split-ratio' : 'sftp-plus-horizontal-split-ratio'
      const val = this._isNarrowLayout ? this._verticalSplitRatio : this._horizontalSplitRatio
      try { this._paneSet(key, String(val)) } catch {}
    }
    document.addEventListener('mousemove', this._splitMoveHandler)
    document.addEventListener('mouseup', this._splitUpHandler)
  }

  onSplitterDblClick(ev: MouseEvent): void {
    ev.preventDefault()
    if (this._splitterDidDrag) {
      this._splitterDidDrag = false
      return
    }
    this.resetSplitter()
  }

  /** 双击分割线恢复默认大小 */
  resetSplitter(): void {
    this._verticalSplitRatio = 0.5
    this._horizontalSplitRatio = 0.5
    this._applyPaneSplit()
    try {
      this._paneSet('sftp-plus-vertical-split-ratio', '0.5')
      this._paneSet('sftp-plus-horizontal-split-ratio', '0.5')
    } catch {}
  }

  // ========== 选择 ==========
  /**
   * ★ 2026-09-29：供模板绑定——某侧面板当前的方向键**焦点键**（条目行 = fullPath；
   * 分组头行 = navHeaderKey(bucketKey)）；null = 该侧无键盘焦点。
   *
   * 用途：file-pane 用它给「游标所在行」加 .nav-focus，使 ↑/↓ 的停留位置始终可见。
   * 背景（用户实测反馈）：单条目分组里「游标停在表头」与「游标停在那唯一一条文件上」
   * 选中集完全相同（都是这 1 条），而表头高亮当时又被 groupAllSelected 的 ≥2 项门槛挡住
   * （该门槛已于同日取消，改为按组内选中比例判定，见 file-pane 的 groupSelState），
   * 于是屏幕毫无变化、像按键卡住。游标样式与「选中」实底分开表达，两个语义各归各位。
   *
   * 返回原始字符串：CD 期间按值比较，不会像返回对象/闭包那样让子组件 ngOnChanges 每轮都判变。
   * 仅 _xxxNavCursorOn 为 true（最近一次是键盘操作）时才下发，鼠标点击不留游标。
   */
  navFocusKey(pane: 'local' | 'remote'): string | null {
    const on = pane === 'local' ? this._localNavCursorOn : this._remoteNavCursorOn
    if (!on) return null
    return pane === 'local' ? this._localNavFocusKey : this._remoteNavFocusKey
  }

  /** 将列表行 DOM 的 selected 类与当前选中模型对齐（框选会直接改 DOM，需兜底）。
   *  ★ 2026-09-29（性能）：本方法恒 O(n)（扫全表 + 逐行 getAttribute/classList，3000 行实测 ≈1.07ms），
   *    只适合鼠标点击 / 框选 / 右键菜单这类**低频**入口；方向键连发（~30 次/秒）走
   *    `_stripSelectionVisual` 的增量版本，勿在该路径改回本方法。 */
  syncPaneSelectionVisual(pane: 'local' | 'remote'): void {
    const listEl = this.elRef.nativeElement.querySelector(`.pane-list.${pane}-pane`) as HTMLElement | null
    if (!listEl) return
    const paths = pane === 'local' ? this._localSelectedPaths : this._remoteSelectedPaths
    listEl.querySelectorAll('.entry[data-path]').forEach(el => {
      const p = el.getAttribute('data-path')
      if (p && paths.has(p)) el.classList.add('selected')
      else el.classList.remove('selected')
    })
  }

  /**
   * ★ 2026-09-29（性能）：方向键路径的「差异式」选中视觉兜底。
   *
   * 与 syncPaneSelectionVisual 的分工：后者恒 O(n)，适合低频入口；方向键连发每秒可达 30 步，
   * 必须按差值来做。这里只处理**一个方向**：`prev` 里有、当前选择集里没有的行（即由选中变未选中），
   * 逐路径用属性选择器直取行元素去类（3000 行实测：全表扫描 1.07ms/步 → 增量 0.001ms/步）。
   *
   * 为什么不需要手动「加类」：切换后紧跟 `_safeDetect()`，`[class.selected]` 绑定的值由 false 翻 true，
   * Angular 必然写 DOM；只有「绑定值没变但 DOM 上残留了类」这种情况（框选拖拽期间的直接 DOM 操作）
   * 才需要兜底 —— 那正是「由选中变未选中」这一侧。
   *
   * 差值过大（例如全选 3000 项后按一次无 Shift 的 ↓，只剩 1 项）时逐路径 querySelector 反而更慢，
   * 直接退回全表扫描。
   */
  private _stripSelectionVisual(side: 'local' | 'remote', prevPaths: Set<string>): void {
    if (!prevPaths.size) return
    const cur = side === 'local' ? this._localSelectedPaths : this._remoteSelectedPaths
    const stale: string[] = []
    let overflow = false
    for (const p of prevPaths) {
      if (cur.has(p)) continue
      if (stale.length >= STRIP_QUERY_MAX) { overflow = true; break }
      stale.push(p)
    }
    if (overflow) { this.syncPaneSelectionVisual(side); return }
    if (!stale.length) return
    const listEl = this.elRef.nativeElement.querySelector(`.pane-list.${side}-pane`) as HTMLElement | null
    if (!listEl) return
    for (const p of stale) {
      const el = this._findRowEl(listEl, 'data-path', p)
      if (el) el.classList.remove('selected')
    }
  }

  selectLocal(entry: LocalEntry, event: MouseEvent, idx: number): void {
    if (this.selectedRemote.length > 0) this.selectedRemote = []
    const r = computeSelection(this.selectedLocal, entry, event, idx, this.localLastSelectedIndex, this.getFilteredLocalEntries(), this._localSelectedPaths)
    this.selectedLocal = r.selection; this.localLastSelectedIndex = r.lastIndex
    this.syncPaneSelectionVisual('local')
    this._safeDetect()
  }

  isLocalSelected(e: LocalEntry): boolean { return this._localSelectedPaths.has(e.fullPath) }

  /** 方向键移动选中项后，将目标行滚动进可视区域（仅滚动列表容器自身） */
  /**
   * 将指定行滚动进可见区。
   * 注意列表表头为 sticky 固定（styles.ts: .entry.header position:sticky;top:0），
   * 使用 scrollIntoView({block:'nearest'}) 会忽略表头遮挡——当行滚入"表头遮挡带"时
   * 被误判为已在可视区内而不滚动，导致选中项被表头盖住。故此处用 rect 精确计算，
   * 把表头高度排除在有效可见区之外。
   * ★ 2026-09-29：参数由「列表下标」改为「条目对象」，改为按 data-path 精确定位行元素。
   *   原实现取 rows[idx]，前提是「DOM 行序 === 列表序」——该前提只在扁平模式成立；
   *   分组模式下列表按桶重排渲染（DOM 序 = 分组桶序），下标对位会滚到毫不相干的行。
   * @param entry 目标条目（取 fullPath 匹配行），传空则不滚动
   * @param align nearest=方向键最小滚动；center=键入定位等跳跃时滚到可视区中部
   */
  private _scrollEntryIntoView(
    side: 'local' | 'remote',
    entry: { fullPath?: string } | null | undefined,
    align: 'nearest' | 'center' = 'nearest',
  ): void {
    const path = entry && entry.fullPath
    if (!path) return
    this._scrollRowElIntoView(side, 'data-path', path, align)
  }

  /**
   * ★ 2026-09-29：按**导航行**滚动——分组头行没有 data-path，改按 data-group-key 定位。
   * （分组模式下分组头也是导航中的一行，焦点停在表头时必须把它滚进可视区。）
   */
  private _scrollNavRowIntoView(side: 'local' | 'remote', row: NavRow | null, align: 'nearest' | 'center' = 'nearest'): void {
    if (!row) return
    if (row.kind === 'header') {
      const gk = row.groupKey
      if (!gk) return
      this._scrollRowElIntoView(side, 'data-group-key', gk, align)
      return
    }
    const path = row.entries[0] && row.entries[0].fullPath
    if (!path) return
    this._scrollRowElIntoView(side, 'data-path', path, align)
  }

  /**
   * ★ 2026-09-29（性能）：按「属性名 + 值」定位行元素。
   * 旧实现用 `querySelectorAll('.entry[data-path], .entry.header[data-group-key]')` + Array.from
   * + find 逐行 getAttribute —— 3000 行实测 0.79ms/步；改成属性选择器直取后 0.024ms/步（≈33×）。
   * 选择器语法出错（路径含 `"`、反斜杠或控制字符）时退回线性匹配，保证功能不丢。
   */
  private _findRowEl(listEl: HTMLElement, attr: 'data-path' | 'data-group-key', value: string): HTMLElement | null {
    try {
      // 属性值转义：反斜杠与双引号（Windows 路径必含反斜杠，Linux 文件名可能含双引号）
      const escaped = value.replace(/["\\]/g, '\\$&')
      return listEl.querySelector(`[${attr}="${escaped}"]`) as HTMLElement | null
    } catch {
      const els = Array.from(listEl.querySelectorAll(`.entry[${attr}]`)) as HTMLElement[]
      return els.find(el => el.getAttribute(attr) === value) || null
    }
  }

  /** 定位并滚动（分组模式下 DOM 序 = 显示序，一律按属性精确匹配而非下标） */
  private _scrollRowElIntoView(
    side: 'local' | 'remote',
    attr: 'data-path' | 'data-group-key',
    value: string,
    align: 'nearest' | 'center' = 'nearest',
  ): void {
    try {
      const listEl = this.elRef.nativeElement.querySelector(`.pane-list.${side}-pane`) as HTMLElement | null
      if (!listEl) return
      const rowEl = this._findRowEl(listEl, attr, value)
      if (!rowEl) return
      const headerEl = listEl.querySelector('.entry.header') as HTMLElement | null
      const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0
      const listRect = listEl.getBoundingClientRect()
      const rowRect = rowEl.getBoundingClientRect()
      // 有效可见区（排除顶部 sticky 表头）：[listRect.top + headerH, listRect.bottom]
      const visibleTop = listRect.top + headerH
      const visibleBottom = listRect.bottom

      if (align === 'center') {
        // 键入定位：把目标行尽量放到可视区垂直中部，避免贴顶/贴底难以辨认
        const viewMid = (visibleTop + visibleBottom) / 2
        const rowMid = (rowRect.top + rowRect.bottom) / 2
        listEl.scrollTop += (rowMid - viewMid)
        return
      }

      // nearest：仅在越界时最小滚动，并留约半行边距，避免贴边被底栏/表头挤住
      const edgePad = Math.min(12, Math.max(4, rowRect.height * 0.35))
      if (rowRect.top < visibleTop + edgePad) {
        listEl.scrollTop += (rowRect.top - visibleTop - edgePad)
      } else if (rowRect.bottom > visibleBottom - edgePad) {
        listEl.scrollTop += (rowRect.bottom - visibleBottom + edgePad)
      }
    } catch {}
  }

  /**
   * ★ 2026-09-29：方向键导航序列 = **显示序**（用户实测：分组模式下从文件夹组末行 uploads 按 ↓
   * 跳到 TMP 组的 .tmp —— 因为旧实现走 getFilteredXxxEntries() 的「排序序」，而屏幕上是分组桶序）。
   * 返回每行在原始扁平列表中的下标 listIndex，供 shift 连选 / 上次锚点沿用既有「列表序」语义。
   * - 扁平模式（未分组）：显示序即列表序本身。
   * - 分组模式：取 groupRows 的**全部行**（表头行 + 条目行）。表头行同样是一行，按 ↑/↓ 必须能停在
   *   它上面（用户要求）；折叠组只有表头行、无条目行，故进入该组时焦点自然落在表头上。
   */
  private _navRows(side: 'local' | 'remote'): NavRow[] {
    return this._navCacheFor(side).out
  }

  /**
   * ★ 2026-09-29（性能）：导航序列缓存（方向键连发时不再每步重建）。
   *
   * 原实现每次按键都重建整个序列：为每行新建对象，还要给每个表头行 slice 一份 items
   * （3000 条目实测 ≈0.16ms/步），而 _handleArrowNav 拿到数组后还要 findIndex 线性扫
   * 2~3 遍定位焦点/锚点、并在 Shift 区间里对区间内所有条目做 Set 去重（≈0.34ms/步 @3000 项）。
   * 改为缓存后每步只做 Map 查询 + 按区间拼数组。
   *
   * 失效条件：过滤列表引用 或 分组行引用变化。分组行本身已有缓存（引用稳定），
   * 因此一次键盘连发期间命中率几乎 100%；换目录/刷新/改排序/改分组/折叠都会让引用变化。
   */
  private _navCacheFor(side: 'local' | 'remote'): NavCache {
    const list = side === 'local' ? this.getFilteredLocalEntries() : this.getFilteredRemoteEntries()
    const rows = side === 'local' ? this.getLocalGroupRows() : this.getRemoteGroupRows()
    const cached = side === 'local' ? this._localNavCache : this._remoteNavCache
    if (cached && cached.src === list && cached.rows === rows) return cached

    const out: NavRow[] = []
    if (!rows || !rows.length) {
      const flat = list || []
      for (let i = 0; i < flat.length; i++) {
        const e = flat[i]
        out.push({ kind: 'entry', key: e.fullPath, entries: [e], listIndex: i })
      }
    } else {
      for (const r of rows) {
        if (r.kind === 'header') {
          if (r.bucketKey == null) continue
          out.push({
            kind: 'header',
            key: navHeaderKey(r.bucketKey),
            entries: ((r.items || []) as any[]).slice(),
            listIndex: -1,
            groupKey: r.bucketKey,
          })
        } else if (r.entry) {
          out.push({
            kind: 'entry',
            key: r.entry.fullPath,
            entries: [r.entry],
            listIndex: typeof r.index === 'number' ? r.index : -1,
          })
        }
      }
    }

    const index = new Map<string, number>()
    const headerPrefix: number[] = new Array(out.length + 1)
    headerPrefix[0] = 0
    for (let i = 0; i < out.length; i++) {
      index.set(out[i].key, i)
      headerPrefix[i + 1] = headerPrefix[i] + (out[i].kind === 'header' ? 1 : 0)
    }
    const built: NavCache = { src: list, rows, out, index, headerPrefix }
    if (side === 'local') this._localNavCache = built
    else this._remoteNavCache = built
    return built
  }

  /** ★ 2026-09-29：清理方向键导航的焦点/锚点（选择集被整体替换或列表内容变更时调用） */
  private _resetNavFocus(side: 'local' | 'remote'): void {
    if (side === 'local') {
      this._localNavFocusKey = null
      this._localNavAnchorKey = null
      this._localNavCursorOn = false
    } else {
      this._remoteNavFocusKey = null
      this._remoteNavAnchorKey = null
      this._remoteNavCursorOn = false
    }
  }

  /**
   * ★ 2026-09-29：方向键导航（含 Shift 连续多选）。
   * 序 = 显示序（_navRows），因此分组模式下也是「屏幕上相邻的一行」，不会跨组乱跳。
   *
   * - 无 Shift：焦点单点移动，锚点跟随焦点（下一次 Shift 从这里起算）；
   *             焦点落在**分组头**行时选中集 = 该组全部条目（与鼠标点击分组头一致）；
   *             移动后置亮**键盘游标**（_xxxNavCursorOn）——游标是「停留位置」的独立视觉语义，
   *             否则单条目分组里「停在表头」与「停在唯一那条文件上」屏幕完全一样（用户实测像卡键）；
   * - Shift  ：把可见区间 [锚点 … 焦点] **整体替换**为选择集（可来回扩展/收缩，同资源管理器）；
   *             区间内的分组头行按其全部条目展开，与组内条目行重叠时按 fullPath 去重（保持显示序）。
   *
   * 状态回退顺序：记录的焦点 → 当前选中项首项 → 记录的锚点 → 列表端点（首次按键）。
   * @returns 是否真的移动了（false = 已在端点/无可导航行，调用方不应消费按键）
   */
  private _handleArrowNav(side: 'local' | 'remote', down: boolean, extend: boolean): boolean {
    const cache = this._navCacheFor(side)
    const nav = cache.out
    if (!nav.length) return false
    // ★ 2026-09-29（性能）：抓住**移动前**的选择集引用 —— selectedLocal 的 setter 会换成新 Set，
    //   故旧引用零成本即可留作「差异视觉清理」的 prev（见 _stripSelectionVisual）。
    const prevPaths = side === 'local' ? this._localSelectedPaths : this._remoteSelectedPaths
    const prevFocus = side === 'local' ? this._localNavFocusKey : this._remoteNavFocusKey
    const prevAnchor = side === 'local' ? this._localNavAnchorKey : this._remoteNavAnchorKey

    // 焦点定位：条目行 key = fullPath，故「选中集首项」（本身是 fullPath）可直接命中；
    // 分组头行 key 带 NUL 前缀，绝不会与真实路径误配。
    // ★ 2026-09-29（性能）：走缓存的 Map 定位（O(1)），不再每步 findIndex 线性扫 2~3 遍。
    let focusIdx = -1
    const candidates = [prevFocus, prevPaths.size ? [...prevPaths][0] : null, prevAnchor]
    for (const probe of candidates) {
      if (!probe) continue
      const hit = cache.index.get(probe)
      if (hit !== undefined) { focusIdx = hit; break }
    }
    const newIdx = down
      ? (focusIdx < 0 ? 0 : Math.min(nav.length - 1, focusIdx + 1))
      : (focusIdx < 0 ? nav.length - 1 : Math.max(0, focusIdx - 1))
    if (newIdx < 0 || newIdx === focusIdx) return false

    const focusRow = nav[newIdx]
    const focusListIdx = focusRow.kind === 'entry' && focusRow.listIndex >= 0 ? focusRow.listIndex : null
    let entries: any[]
    let anchorKey: string
    if (!extend) {
      // 分组头行 → 整组条目；条目行 → 单条（同一行模型，无需分支）
      entries = focusRow.entries.slice()
      anchorKey = focusRow.key
    } else {
      // 首次 Shift+↓（无锚点记录）以「当前焦点」为锚点起点，即先扩一格
      const startKey = prevAnchor || (focusIdx >= 0 ? nav[focusIdx].key : focusRow.key)
      const startHit = cache.index.get(startKey)
      const aIdx = startHit !== undefined ? startHit : newIdx
      const lo = Math.min(aIdx, newIdx)
      const hi = Math.max(aIdx, newIdx)
      entries = []
      // ★ 2026-09-29（性能）：区间内**没有表头行**时每行恰好 1 项 → 直接拼接。
      //   只有含表头行才可能出现「表头携带的整组条目」与「组内条目行」重叠，才需要 Set 去重
      //   （按 fullPath，保持显示序）。大目录连续多选时前者占绝对多数（3000 项区间实测
      //   去重版 ≈0.34ms/步 → 直拼 ≈0.05ms/步）。
      if (cache.headerPrefix[hi + 1] - cache.headerPrefix[lo] > 0) {
        const seen = new Set<string>()
        for (let k = lo; k <= hi; k++) {
          for (const e of nav[k].entries) {
            if (!e || seen.has(e.fullPath)) continue
            seen.add(e.fullPath)
            entries.push(e)
          }
        }
      } else {
        for (let k = lo; k <= hi; k++) entries.push(nav[k].entries[0])
      }
      anchorKey = startKey
    }

    if (side === 'local') {
      if (this.selectedRemote.length) this.selectedRemote = []
      this.selectedLocal = entries
      this.localLastSelectedIndex = focusListIdx
      this._localNavFocusKey = focusRow.key
      this._localNavAnchorKey = anchorKey
      this._localNavCursorOn = true
    } else {
      if (this.selectedLocal.length) this.selectedLocal = []
      this.selectedRemote = entries
      this.remoteLastSelectedIndex = focusListIdx
      this._remoteNavFocusKey = focusRow.key
      this._remoteNavAnchorKey = anchorKey
      this._remoteNavCursorOn = true
    }
    // ★ 2026-09-29（性能，用户反馈「按住 Shift 连选有点延迟卡顿」）：收尾三步的顺序与做法都按
    //   「每步都跑、且按住键会以 ~30 次/秒连发」来设计：
    //   ① 先滚动定位：此刻尚未写选中类，而 selected / nav-focus 都不改布局（背景色 + inset 阴影）
    //      → 先测量后写入，避免「写完类再读 rect」触发同步重排（旧顺序每步多一次强制布局）；
    //   ② 再做差异视觉清理：只处理「上一轮选中、这轮不选」的行，不再全表扫描
    //      （3000 行实测 1.07ms/步 → 0.001ms/步）；新选中的行交给紧随其后的 CD 写类；
    //   ③ 最后 CD：方向键分支已在 _capturePanelHotkeysBeforeTabby 里改为**出 zone**执行，
    //      因此这里的一次 _safeDetect() 就是本轮唯一一遍整树变更检测（不再叠加整站 tick）。
    this._scrollNavRowIntoView(side, focusRow)
    this._stripSelectionVisual(side, prevPaths)
    this._safeDetect()
    return true
  }

  selectRemote(entry: SFTPFile, event: MouseEvent, idx: number): void {
    if (this.selectedLocal.length > 0) this.selectedLocal = []
    const r = computeSelection(this.selectedRemote, entry, event, idx, this.remoteLastSelectedIndex, this.getFilteredRemoteEntries(), this._remoteSelectedPaths)
    this.selectedRemote = r.selection; this.remoteLastSelectedIndex = r.lastIndex
    this.syncPaneSelectionVisual('remote')
    this._safeDetect()
  }

  isRemoteSelected(e: SFTPFile): boolean { return this._remoteSelectedPaths.has(e.fullPath) }

  /**
   * ★ 2026-09-21 P0 修复：目录切换后丢弃残留选择。
   * selectedLocal/selectedRemote 按 fullPath 保存，此前所有导航入口（上一级 / 主目录 /
   * 路径输入 / 双击进目录 / 历史前后退 / 书签跳转）都不清理，残留项仍指向已离开的目录——
   * 状态栏照旧显示「已选 N 项」，但当前列表里没有任何高亮行，用户无从得知选的是什么；
   * 此时按 Delete 会删掉上一个目录里的文件（confirmDelete 直接拿 fullPath 执行 fs.rm）。
   * 收口点放在 refreshLocal/refreshRemote 而不是逐个导航入口，避免以后新增跳转路径漏改。
   */
  private _dropSelection(side: 'local' | 'remote'): void {
    if (side === 'local') {
      if (this._selectedLocal.length) this.selectedLocal = []
      this.localLastSelectedIndex = null
    } else {
      if (this._selectedRemote.length) this.selectedRemote = []
      this.remoteLastSelectedIndex = null
    }
    // ★ 2026-09-29：方向键的焦点/Shift 锚点一并失效（目录已换，路径不再存在）
    this._resetNavFocus(side)
  }

  /**
   * 同目录刷新后与新 listing 求交集：被外部删除/重命名的条目不得留在选择模型里，
   * 否则后续删除/传输仍会按旧 fullPath 操作。锚点索引一并失效（列表下标已变）。
   */
  private _pruneSelection(side: 'local' | 'remote'): void {
    if (side === 'local') {
      if (!this._selectedLocal.length) return
      const alive = new Set(this.localEntries.map(e => e.fullPath))
      const kept = this._selectedLocal.filter(e => alive.has(e.fullPath))
      if (kept.length === this._selectedLocal.length) return
      this.selectedLocal = kept
      this.localLastSelectedIndex = null
    } else {
      if (!this._selectedRemote.length) return
      const alive = new Set(this.remoteEntries.map(e => e.fullPath))
      const kept = this._selectedRemote.filter(e => alive.has(e.fullPath))
      if (kept.length === this._selectedRemote.length) return
      this.selectedRemote = kept
      this.remoteLastSelectedIndex = null
    }
    // ★ 2026-09-29：选择集被裁剪过 → 方向键焦点/Shift 锚点可能指向已消失的条目，一并清掉
    this._resetNavFocus(side)
  }

  // ========== 排序 ==========
  setLocalSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    const r = computeSortToggle(this.localSortBy, this.localSortAsc, f, this._colJustResized)
    if (!r) return
    this.localSortBy = r.by; this.localSortAsc = r.asc
    this._invalidateLocalCache()
    // ★ 2026-09-20：存对象（非 JSON 字符串）+ 立即落盘，避免关窗未 destroy 时排序丢失
    try {
      this._paneSet('sftp-plus-local-sort', { by: r.by, asc: r.asc })
      this._paneFlush()
    } catch {}
  }

  setRemoteSort(f: 'name' | 'size' | 'modified' | 'birthtime'): void {
    if (f === 'birthtime') return
    const r = computeSortToggle(this.remoteSortBy, this.remoteSortAsc, f, this._colJustResized)
    if (!r) return
    this.remoteSortBy = r.by; this.remoteSortAsc = r.asc
    this._invalidateRemoteCache()
    try {
      this._paneSet('sftp-plus-remote-sort', { by: r.by, asc: r.asc })
      this._paneFlush()
    } catch {}
  }

  // ========== 过滤 ==========

  private _applyFilter(side: 'local' | 'remote'): void {
    if (side === 'local') { this.localFilter = this.localFilterPending; this.localFilterVisible = false; this._invalidateLocalCache() }
    else { this.remoteFilter = this.remoteFilterPending; this.remoteFilterVisible = false; this._invalidateRemoteCache() }
  }

  private _clearFilter(side: 'local' | 'remote'): void {
    if (side === 'local') { this.localFilterPending = ''; this.localFilter = ''; this.localFilterVisible = false; this._invalidateLocalCache() }
    else { this.remoteFilterPending = ''; this.remoteFilter = ''; this.remoteFilterVisible = false; this._invalidateRemoteCache() }
  }

  /** 应用本地过滤（pending → actual）并隐藏输入框 */
  applyLocalFilter(): void { this._applyFilter('local') }

  /** 清空本地过滤并隐藏输入框 */
  clearLocalFilter(): void { this._clearFilter('local') }

  /** 应用远程过滤（pending → actual）并隐藏输入框 */
  applyRemoteFilter(): void { this._applyFilter('remote') }

  /** 清空远程过滤并隐藏输入框 */
  clearRemoteFilter(): void { this._clearFilter('remote') }

  // ========== 过滤结果缓存（P1-10：避免每次变更检测重复计算） ==========
  private _localFilteredCache: LocalEntry[] | null = null
  private _localFilterDirty = true
  private _remoteFilteredCache: SFTPFile[] | null = null
  private _remoteFilterDirty = true
  // 记录各面板 _cells 预计算时使用的 date pattern；命中缓存时若与当前 pattern 不一致则重算，
  // 确保自定义时间格式在任意时序/缓存窗口下对本地、远程时间列统一生效
  private _decoratedLocalPattern = ''
  private _decoratedRemotePattern = ''

  protected _invalidateLocalCache(): void { this._localFilterDirty = true }
  protected _invalidateRemoteCache(): void { this._remoteFilterDirty = true }

  /** trackBy 函数：避免 *ngFor 每次变更检测重建所有 DOM 节点 */
  trackLocalEntryBy(_index: number, item: LocalEntry): string { return item.fullPath }
  trackRemoteEntryBy(_index: number, item: SFTPFile): string { return item.fullPath }

  /**
   * 需要预计算显示串的数据列（不含 name，name 走模板独立绑定）。
   */
  private readonly _cellCols = ['size', 'date', 'created', 'perms', 'mode', 'access', 'owner', 'group', 'path', 'ext']

  /**
   * 功能描述：为每个 entry 预计算各列显示串并挂到 e._cells，供模板直接查表绑定，
   *          避免文件列表模板在每次变更检测里逐格调用 colValue（内部含 formatSize/formatDate）。
   *          显示串是纯函数（仅依赖 entry 原始数据，与语言/主题/设置无关），
   *          因此只需随过滤缓存一同失效（entries/过滤/排序变化时重建），无需在语言切换时重算。
   * 创建人：DD1024z + Hy3
   * 创建时间：2026-07-23
   */
  private _decorateCells(list: any[]): void {
    for (const e of list) {
      const cells: Record<string, string> = {}
      for (const col of this._cellCols) cells[col] = this.colValue(col, e)
      e._cells = cells
    }
  }

  getFilteredLocalEntries(): LocalEntry[] {
    if (!this._localFilterDirty && this._localFilteredCache) {
      // 自定义时间格式可能在缓存构建后变化（设置页修改 / 初始化时序），
      // 若当前 pattern 与装饰时不一致，重算 _cells（本地、远程统一处理）
      if (getDateFormatPattern() !== this._decoratedLocalPattern) {
        this._decorateCells(this._localFilteredCache)
        this._decoratedLocalPattern = getDateFormatPattern()
      }
      return this._localFilteredCache
    }
    let entries = filterByHidden([...this.localEntries], this.showHiddenLocal)
    entries = filterByName(entries, this.localFilter)
    this._localFilteredCache = sortLocalEntries(entries, this.localSortBy, this.localSortAsc, this.pinFoldersLocal)
    this._decorateCells(this._localFilteredCache)
    this._decoratedLocalPattern = getDateFormatPattern()
    this._localFilterDirty = false
    return this._localFilteredCache
  }

  getFilteredRemoteEntries(): SFTPFile[] {
    if (!this._remoteFilterDirty && this._remoteFilteredCache) {
      if (getDateFormatPattern() !== this._decoratedRemotePattern) {
        this._decorateCells(this._remoteFilteredCache)
        this._decoratedRemotePattern = getDateFormatPattern()
      }
      return this._remoteFilteredCache
    }
    let entries = filterByHidden([...this.remoteEntries], this.showHiddenRemote)
    entries = filterByName(entries, this.remoteFilter)
    this._remoteFilteredCache = sortRemoteEntries(entries, this.remoteSortBy, this.remoteSortAsc, this.pinFoldersRemote)
    this._decorateCells(this._remoteFilteredCache)
    this._decoratedRemotePattern = getDateFormatPattern()
    this._remoteFilterDirty = false
    return this._remoteFilteredCache
  }

  // ========== 打开 ==========
  /** 单击处理：统一逻辑，避免与双击冲突 */
  private _onPaneClick(side: 'local' | 'remote', entry: { fullPath: string }, event: MouseEvent, idx: number, selectFn: () => void): void {
    this.activePane = side
    this._arrowNavPane = side
    if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
    // ★ 2026-09-29：键盘焦点跟随鼠标点击，Shift+↑/↓ 才能从刚点的那一行开始扩展；
    //   Shift+点击 时不动锚点（与 computeSelection 的 shift 语义一致：锚点保持在原处）
    if (side === 'local') {
      this._localNavFocusKey = entry.fullPath
      this._localNavCursorOn = false
      if (!event.shiftKey) this._localNavAnchorKey = entry.fullPath
    } else {
      this._remoteNavFocusKey = entry.fullPath
      this._remoteNavCursorOn = false
      if (!event.shiftKey) this._remoteNavAnchorKey = entry.fullPath
    }
    if (side === 'local') {
      if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
      this.localClickTimer = setTimeout(() => { this.localClickTimer = null }, 250)
    } else {
      if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
      this.remoteClickTimer = setTimeout(() => { this.remoteClickTimer = null }, 250)
    }
    selectFn()
  }

  /** 打开方式开关：'double'（默认，双击打开）或 'single'（单击打开） */
  private get _openOnClick(): 'double' | 'single' {
    const v = this.configService?.store?.['tabby-sftp-plus']?.openOnClick
    return (v === 'single' || v === 'double') ? v : 'double'
  }

  /** 查看器不支持时系统打开开关：开启则对不支持的文件改用系统默认程序打开 */
  private get _openUnsupportedInSystem(): boolean {
    return this.configService?.store?.['tabby-sftp-plus']?.openUnsupportedInSystem === true
  }

  /** 查看/编辑器是否显示行号（默认 true） */
  get showTextLineNumbers(): boolean {
    return this.configService?.store?.['tabby-sftp-plus']?.showTextLineNumbers !== false
  }

  /** 查看器自绘插入光标形状（block/beam/underline，默认 beam）；编辑器为系统原生光标，不受此项影响 */
  get textCaretShape(): CaretShape {
    return normalizeCaretShape(this.configService?.store?.['tabby-sftp-plus']?.textCaretShape)
  }

  /** 设置页的可查看/编辑文本扩展名（已在 file-utils 中再次规范化，防御手工配置）。 */
  protected getCustomEditableExtensions(): string[] {
    const value = this.configService?.store?.['tabby-sftp-plus']?.editableFileExtensions
    return Array.isArray(value) ? value.filter((item: unknown): item is string => typeof item === 'string') : []
  }

  /** 忽略扩展名白名单，允许查看与编辑所有非目录文件。 */
  protected getAllowViewEditAllFiles(): boolean {
    const cfg = this.configService?.store?.['tabby-sftp-plus']
    return cfg?.allowViewEditAllFiles === true
      || cfg?.allowEditAllFiles === true
      || cfg?.allowViewAllAsText === true
      || cfg?.allowViewAllFiles === true
  }

  /** 默认上传路径（远程目标目录）；空串则回退当前远程目录 */
  private get _defaultUploadPath(): string {
    const v = this.configService?.store?.['tabby-sftp-plus']?.defaultUploadPath
    return typeof v === 'string' ? v.trim() : ''
  }
  /** 默认下载路径（本地目标目录）；空串则回退当前本地目录 */
  private get _defaultDownloadPath(): string {
    const v = this.configService?.store?.['tabby-sftp-plus']?.defaultDownloadPath
    return typeof v === 'string' ? v.trim() : ''
  }
  /** 自定义图标：全局 SVG 资源目录（本地绝对路径） */
  private get _iconResourceDir(): string {
    const v = this.configService?.store?.['tabby-sftp-plus']?.iconResourceDir
    return typeof v === 'string' ? v.trim() : ''
  }
  /** 自定义图标规则：扩展名 → svg 文件名 */
  private get _fileTypeIcons(): { ext: string; svg: string; name?: string }[] {
    const v = this.configService?.store?.['tabby-sftp-plus']?.fileTypeIcons
    // ★ A7：未配置时返回共享常量，避免每 CD 新数组引用（会恒定触发子组件 ngOnChanges）
    return Array.isArray(v) ? v : EMPTY_ICON_RULES
  }
  /** 被禁用的内置图标 svg 文件名 */
  private get _disabledIconSvgs(): string[] {
    const v = this.configService?.store?.['tabby-sftp-plus']?.disabledIconSvgs
    return Array.isArray(v) ? v : EMPTY_SVG_LIST
  }
  /** 文件夹图标 svg 文件名（默认 'folder.svg'，空/缺失时不再回退 emoji） */
  private get _folderIconSvg(): string {
    const v = this.configService?.store?.['tabby-sftp-plus']?.folderIconSvg
    return (typeof v === 'string' && v) ? v : 'folder.svg'
  }

  /**
   * 插件内置图标目录：开发链接 / 手动安装 / 源码三种布局由 resolveSftpPlusBundledIconDir 统一解析。
   * ★ 2026-09-20 A5 审计修复：本 getter 被模板绑定（[bundledIconDir] 与 effectiveIconBaseDir），
   *   而 resolveBundledIconDir 内部对 3 个候选目录做同步 fs.existsSync（并遍历 installedPlugins）
   *   → 单次变更检测最多 ~12 次同步系统调用（2 面板 × 2 处绑定）。传输中进度回调会高频
   *   detectChanges，等于把磁盘 IO 塞进首屏/滚动路径。此处缓存解析结果：
   *   bootstrapData（插件安装路径）在进程生命周期内不变，故一次解析即可。
   */
  private _bundledIconDirCache: string | null = null

  private get _bundledIconDir(): string {
    if (this._bundledIconDirCache === null) {
      this._bundledIconDirCache = resolveSftpPlusBundledIconDir(this.bootstrapData)
    }
    return this._bundledIconDirCache
  }

  /** 有效图标目录：用户指定优先；留空则回退插件内置目录 */
  private get effectiveIconBaseDir(): string {
    const u = (this._iconResourceDir || '').trim()
    return u ? u : this._bundledIconDir
  }

  /** 面板内置操作快捷键配置（keys[]/enabled）；缺省回退内置默认值，并兼容旧的单键 key 字段 */
  private get _panelHotkeys(): Record<PanelHotkeyAction, { keys: string[]; enabled: boolean }> {
    const cfg = this.configService?.store?.['tabby-sftp-plus']?.panelHotkeys
    const def = defaultPanelHotkeys()
    if (!cfg || typeof cfg !== 'object') return def
    for (const a of PANEL_HOTKEY_ACTIONS) {
      const h = (cfg as any)[a]
      if (!h || typeof h !== 'object') continue
      // ★ 2026-08-31：兼容旧格式 { key: 'Delete' } 与新格式 { keys: [...] }
      const keys = normalizePanelHotkeyKeys((h as any).keys ?? (h as any).key, HOTKEY_CLEARED)
      def[a] = { keys, enabled: (h as any).enabled !== false }
    }
    return def
  }

  /** 取某动作的绑定列表（已归一化，剔除哨兵/空值）；enabled=false 视为未绑定 */
  private _panelHotkeyKeys(action: PanelHotkeyAction): string[] {
    const h = this._panelHotkeys[action]
    if (!h || h.enabled === false) return []
    return Array.isArray(h.keys) ? h.keys : []
  }

  /** 判断某面板快捷键是否已绑定（至少一个有效绑定，且未标记 enabled=false） */
  private _isPanelHotkeyBound(action: PanelHotkeyAction): boolean {
    return this._panelHotkeyKeys(action).length > 0
  }

  private _panelHotkeyEnabled(action: PanelHotkeyAction): boolean {
    return this._isPanelHotkeyBound(action)
  }

  /** 取该动作的首个键盘绑定（用于右键菜单展示；鼠标键不计入，多绑定时只显示第一个） */
  private _panelHotkeyKey(action: PanelHotkeyAction): string {
    const kb = keyboardHotkeySpecs(this._panelHotkeyKeys(action))
    return kb.length ? kb[0] : ''
  }

  /** 面板快捷键匹配（忽略 shift 差异，支持多绑定）：用于 Delete 等 shift 作为语义修饰符的操作 */
  private _matchPanelHotkeyKeysIgnoreShift(event: KeyboardEvent, specs: string[]): boolean {
    for (const spec of keyboardHotkeySpecs(specs)) {
      const p = parsePanelHotkeyKey(spec)
      if (!p) continue
      if (event.ctrlKey !== p.ctrl) continue
      if (event.altKey !== p.alt) continue
      if (event.metaKey !== p.meta) continue
      // shift 不比较——允许 Shift+Delete 在配置为 Delete 时触发（shift 透传给 _paneDelete 作"强制删除"标志）
      const ek = event.key
      if (p.key.length === 1 ? ek.toLowerCase() === p.key.toLowerCase() : ek === p.key) return true
    }
    return false
  }

  /** 统一的「打开」逻辑：目录进入；文件 Ctrl/Cmd+点击=系统打开，否则查看 */
  private async _activateEntry(pane: 'local' | 'remote', entry: any, event?: MouseEvent): Promise<void> {
    let isDir = !!entry?.isDirectory || this.isDirByMode(entry?.mode)
    // ★ 2026-08-24 修复：远程 symlink 指向目录时，readdir 为 lstat 语义（isDirectory=false、
    //   isSymlink=true）→ 双重判否点不进目录。需 stat(follow) 解析目标真实类型。
    //   根因：russh stat 的 JS 层展开 napi 对象丢失 permissions，旧 statRemotePath 只认
    //   'directory' 字符串/permissions 位 → 恒判非目录。本地侧无需此修复（fs.stat 已跟随）。
    if (!isDir && pane === 'remote' && (entry?.isSymlink || isSymlinkByMode(entry?.mode))) {
      isDir = await this._resolveRemoteSymlinkIsDir(entry.fullPath)
    }
    if (isDir) {
      if (pane === 'local') this.openLocal(entry, event)
      else void this.openRemote(entry, event)
      return
    }
    const openInSystem = !!(event && (os.platform() === 'darwin' ? event.metaKey : event.ctrlKey))
    if (openInSystem) {
      if (pane === 'local') this._openPathInSystem(entry.linkTarget || entry.fullPath, { waitForModRelease: true })
      else void this._openRemoteInSystem(entry)
      return
    }
    // ★ 2026-08-24：查看器不支持的文件，若开关开启则改用系统默认程序打开
    if (this._openUnsupportedInSystem && !isViewableRemoteFileType(
      entry.name,
      this.getCustomEditableExtensions(),
      this.getAllowViewEditAllFiles(),
    )) {
      if (pane === 'local') this._openPathInSystem(entry.linkTarget || entry.fullPath, { waitForModRelease: true })
      else void this._openRemoteInSystem(entry)
      return
    }
    if (pane === 'local') {
      // ★ 2026-08-24：Windows .lnk 指向文件时，直接系统打开目标文件（不尝试查看 .lnk 二进制本身）
      if (entry.linkTarget) {
        this._openPathInSystem(entry.linkTarget, { waitForModRelease: true })
        return
      }
      void this._viewLocalFile(entry)
    }
    else void this._viewRemoteFile(entry)
  }

  onLocalClick(entry: LocalEntry, event: MouseEvent, idx: number): void {
    if (this._openOnClick === 'single') {
      this.selectLocal(entry, event, idx)
      void this._activateEntry('local', entry, event)
      return
    }
    this._onPaneClick('local', entry, event, idx, () => this.selectLocal(entry, event, idx))
  }

  /**
   * 通过 POSIX mode 位判断是否为目录
   * 功能描述：用 (mode & S_IFMT) === S_IFDIR 检测，比 isDirectory 更可靠
   *          因为 Windows SFTP 对 junction/reparse point 目录可能误报 isDirectory = false
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-22
   */
  private isDirByMode = isDirByMode

  /**
   * 功能描述：远程 symlink→目录解析。SFTP readdir 返回 lstat 语义，symlink 指向目录时
   *   isDirectory=false、mode=S_IFLNK，需 stat(follow) 解析目标真实类型。
   *   实际委托 sftp.service.resolveRemoteSymlinkStat：
   *   优先 Tabby 包装层 stat（type 数字枚举已正确映射），回退 russh 原生 stat，
   *   个别服务器 STAT 不跟随时再 readlink→resolve→stat（对齐 Tabby 官方面板）。
   * 创建人：DD1024z + Claude
   * 创建时间：2026-08-24
   */
  private async _resolveRemoteSymlinkIsDir(fullPath: string): Promise<boolean> {
    if (!this.connected || !this.sftpSession) return false
    const st = await resolveRemoteSymlinkStat(this.sftpSession, fullPath)
    return !!st?.isDirectory
  }

  openLocal(e: LocalEntry, $event?: MouseEvent): void {
    // 取消单击计时器
    if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
    if ($event) $event.preventDefault()
    // isDirectory 优先，mode 位作为兜底
    if (!e.isDirectory && !this.isDirByMode(e.mode)) return
    // ★ 2026-08-24：Windows .lnk 指向目录时，进入目标路径而非 .lnk 文件路径
    const targetPath = e.linkTarget || e.fullPath
    this._pushLocalNav(targetPath)
    this.localPath = targetPath
    this.localPathInput = targetPath
    this.saveCurrentPath()
    void this.refreshLocal()
  }

  /** 本地双击：复用统一打开逻辑（文件夹进入 / 文件查看 / Ctrl+Cmd+双击系统打开） */
  onLocalEntryDblClick(e: LocalEntry, $event?: MouseEvent): void {
    // 单击打开模式下，单击已触发打开，双击不再重复处理
    if (this._openOnClick === 'single') return
    if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
    if ($event) $event.preventDefault()
    void this._activateEntry('local', e, $event)
  }

  /** 远程面板双击进入目录（或文件选择逻辑） */
  async openRemote(e: SFTPFile, $event?: MouseEvent): Promise<void> {
    if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
    if ($event) $event.preventDefault()
    if (!this.connected) return
    let isDir = e.isDirectory || this.isDirByMode(e.mode)
    // ★ 2026-08-24 修复：symlink 指向目录时，readdir lstat 不跟随 → 需 stat(follow) 解析
    if (!isDir && (e.isSymlink || isSymlinkByMode(e.mode))) {
      isDir = await this._resolveRemoteSymlinkIsDir(e.fullPath)
    }
    if (!isDir) return
    this._pushRemoteNav(e.fullPath)
    this.remotePath = e.fullPath
    this.remotePathInput = e.fullPath
    this.saveCurrentPath()
    void this.refreshRemote()
  }

  /** 远程双击：复用统一打开逻辑（文件夹进入 / 文件查看 / Ctrl+Cmd+双击系统打开） */
  onRemoteEntryDblClick(e: SFTPFile, $event?: MouseEvent): void {
    // 单击打开模式下，单击已触发打开，双击不再重复处理
    if (this._openOnClick === 'single') return
    if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
    if ($event) $event.preventDefault()
    if (!this.connected) return
    void this._activateEntry('remote', e, $event)
  }

  /** 远程面板单击处理 */
  onRemoteClick(entry: SFTPFile, event: MouseEvent, idx: number): void {
    if (this._openOnClick === 'single') {
      this.selectRemote(entry, event, idx)
      void this._activateEntry('remote', entry, event)
      return
    }
    this._onPaneClick('remote', entry, event, idx, () => this.selectRemote(entry, event, idx))
  }


  // ========== 子组件桥接 ==========
  colHeaderLabelFn = (col: string) => this.colHeaderLabel(col)
  // P1-perf：优先读预计算的 e._cells（廉价查表）；缺失时回退到实时计算，保证正确性
  colValueFn = (col: string, e: any) => (e && e._cells && col in e._cells) ? e._cells[col] : this.colValue(col, e)
  isLocalSelectedFn = (e: LocalEntry) => this.isLocalSelected(e)
  isRemoteSelectedFn = (e: SFTPFile) => this.isRemoteSelected(e)
  localSortArrowFn = (col: string) => this.sortArrow(col, 'local')
  remoteSortArrowFn = (col: string) => this.sortArrow(col, 'remote')

  /** 右键菜单项顺序（数据驱动渲染）：读取设置；缺省回退默认顺序。
   *  ★ A9：返回类型收敛为 ContextMenuAction[]（此前声明 string[] 与子组件输入不一致，
   *  靠 strict 关闭掩盖；现由 sanitizeMenuOrder 在入口过滤未知项并保证类型正确）。
   *  结果按配置数组引用缓存，避免每轮变更检测重新 filter 出新的数组引用。 */
  private _menuOrderCache: { src: unknown; out: ContextMenuAction[] } | null = null

  get contextMenuOrder(): ContextMenuAction[] {
    const v = this.configService?.store?.['tabby-sftp-plus']?.contextMenuOrder
    if (this._menuOrderCache && this._menuOrderCache.src === v) return this._menuOrderCache.out
    const out = sanitizeMenuOrder(v)
    this._menuOrderCache = { src: v, out }
    return out
  }

  /** ★ 2026-09-28：被停用的右键菜单项集合（设置页定制），含文件动作 + groupBy；
   *  groupToggleAll 已并入分组依据子菜单、不再是独立定制项——历史配置残留值直接忽略 */
  get contextMenuDisabledEntries(): Set<string> {
    const v = this.configService?.store?.['tabby-sftp-plus']?.contextMenuDisabled
    const arr = v && Array.isArray(v) ? (v as string[]).filter(a => a !== 'groupToggleAll') : []
    return new Set<string>(arr)
  }

  /**
   * 右键菜单动态快捷键映射：action → key 字符串。
   * 将面板热键配置（panelHotkeys）映射到菜单 action 名，
   * 供 context-menu 组件按需显示/隐藏快捷键文本。
   * 用户清除某热键后对应值为空串 → 菜单不显示该快捷键。
   */
  get contextMenuHotkeyShortcuts(): Record<string, string> {
    const out: Record<string, string> = {
      delete: this._panelHotkeyKey('delete'),
      rename: this._panelHotkeyKey('rename'),
      refresh: this._panelHotkeyKey('refresh'),
    }
    // ★ 2026-09-20：属性/上传/下载等可配置动作也要显示在右键菜单
    for (const a of CONTEXT_ACTION_HOTKEYS) {
      out[a] = this._panelHotkeyKey(a)
    }
    return out
  }

  /**
   * ★ 2026-08-25：属性对话框图标复用与文件列表完全一致的映射逻辑
   *   —— 文件夹→folder.svg、文件→扩展名映射→default.svg 兜底，均为彩色 SVG（file://），
   *      取代原先 dialog 内部硬编码的线条 emoji 风 SVG，保证属性弹窗与列表图标统一。
   * ★ 2026-09-21：冲突对话框文件名旁图标亦经此函数解析（conflictFileIconUrl）。
   */
  private resolveDetailsIcon(e: any): string | null {
    if (!e) return null
    const disabled = this._disabledIconSvgs || []
    const base = this.effectiveIconBaseDir
    if (!base) return null
    const joinUrl = (svg: string): string => 'file://' + path.join(base, svg)
    const exists = (svg: string): boolean => {
      try { return fsSync.existsSync(path.join(base, svg)) } catch { return false }
    }
    // 无扩展名文件也走 default.svg 兜底（与列表一致），这里先行处理
    if (e.isDirectory) {
      const svg = (this._folderIconSvg || '').trim()
      if (svg && !disabled.includes(svg) && exists(svg)) return joinUrl(svg)
      return null  // 极端情况下回退 dialog 内置线条 SVG
    }
    const name: string = e.name || ''
    const dot = name.lastIndexOf('.')
    if (dot <= 0) {
      const def = 'default.svg'
      if (!disabled.includes(def) && exists(def)) return joinUrl(def)
      return null
    }
    const ext = name.slice(dot).toLowerCase()
    // 1) 用户自定义规则（最高优先级）
    if (this._fileTypeIcons && this._fileTypeIcons.length) {
      const rule = this._fileTypeIcons.find(r => (r.ext || '').toLowerCase() === ext)
      if (rule && rule.svg && !disabled.includes(rule.svg) && exists(rule.svg)) return joinUrl(rule.svg)
    }
    // 2) 内置默认扩展名映射（DEFAULT_ICON_MAP）
    const svg = DEFAULT_ICON_MAP[ext]
    if (svg && !disabled.includes(svg) && exists(svg)) return joinUrl(svg)
    // 3) default.svg 兜底
    const def = 'default.svg'
    if (!disabled.includes(def) && exists(def)) return joinUrl(def)
    return null
  }

  get detailsDisplay(): DetailsDisplay | null {
    const e = this.detailsEntry
    if (!e) return null
    return {
      name: e.name,
      isFolder: !!e.isDirectory,
      /** ★ 2026-08-25：复用列表图标映射的彩色 SVG URL（null 时 dialog 回退内置线条图标） */
      iconUrl: this.resolveDetailsIcon(e),
      type: e.isDirectory ? this.i18n.t('type.folder') : (this.getFileExt(e.name) || this.i18n.t('type.file')),
      // ★ 2026-08-11：来源位置标签（本地/远程），属性对话框一眼可辨
      location: this.detailsIsLocal ? this.i18n.t('pane.local') : this.i18n.t('pane.remote'),
      path: this.getEntryPath(e),
      // ★ 2026-08-11：文件夹默认不显示大小，点击「计算」按钮后显示真实值
      size: e.isDirectory ? (this.detailsCalcResult ?? undefined) : this.formatSize(this.getEntrySize(e)),
      sizeCalculable: !!e.isDirectory,
      sizeCalcState: this.detailsCalcState,
      modified: this.formatDate(this.getEntryMtime(e)),
      created: this.getEntryBirthtimeMs(e) ? this.formatDate(this.getEntryBirthtimeMs(e)) : undefined,
      accessed: this.getEntryAtimeMs(e) ? this.formatDate(this.getEntryAtimeMs(e)) : undefined,
      perms: this.getEntryMode(e) != null
        ? this.formatMode(this.getEntryMode(e)) + ' (' + this.formatOctalMode(this.getEntryMode(e)) + ')'
        : undefined,
      owner: this.getEntryOwner(e) != null ? String(this.getEntryOwner(e)) : undefined,
      group: this.getEntryGroup(e) != null ? String(this.getEntryGroup(e)) : undefined,
    }
  }

  getLocalSelectionInfo(): string {
    const count = this.getFilteredLocalEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this.selectedLocal.length) {
      const sizePart = this.formatSelectedSizeLocal()
        + (this.selectedHasDirLocal() ? this.i18n.t('pane.exclFolders') : '')
      s += this.i18n.t('pane.selectedInfo', { n: this.selectedLocal.length, size: sizePart })
    }
    return s
  }

  getRemoteSelectionInfo(): string {
    const count = this.getFilteredRemoteEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this.selectedRemote.length) {
      const sizePart = this.formatSelectedSizeRemote()
        + (this.selectedHasDirRemote() ? this.i18n.t('pane.exclFolders') : '')
      s += this.i18n.t('pane.selectedInfo', { n: this.selectedRemote.length, size: sizePart })
    }
    return s
  }

  onLocalPaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this.localBack(); break
      case 'forward': this.localForward(); break
      case 'up': this.localUp(); break
      case 'home': this.goLocalHome(); break
      case 'refresh': void this.refreshLocal(); break
      case 'toggleFilter': this.localFilterVisible = !this.localFilterVisible; break
      case 'toggleHidden': this.toggleShowHidden('local'); break
    }
  }

  onRemotePaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this.remoteBack(); break
      case 'forward': this.remoteForward(); break
      case 'up': this.remoteUp(); break
      case 'home': this.goRemoteHome(); break
      case 'refresh': void this.refreshRemote(); break
      case 'toggleFilter': this.remoteFilterVisible = !this.remoteFilterVisible; break
      case 'toggleHidden': this.toggleShowHidden('remote'); break
    }
  }

  onLocalSort(e: PaneSortAction): void { this.setLocalSort(e.col as any) }
  onRemoteSort(e: PaneSortAction): void { this.setRemoteSort(e.col as any) }

  onContextMenuAction(action: ContextMenuAction): void {
    switch (action) {
      case 'newFolder': this.ctxNewFolder(); break
      case 'newFile': this.ctxNewFile(); break
      case 'rename': this.ctxRename(); break
      case 'delete': this.ctxDelete(); break
      case 'openLocal': this.ctxOpenLocal(); break
      case 'viewFile': void this.ctxViewFile(); break
      case 'editFile': void this.ctxEditFile(); break
      case 'upload': void this.ctxUpload(); break
      case 'download': void this.ctxDownload(); break
      case 'revealInExplorer': this.ctxRevealInExplorer(); break
      case 'chmod': this.ctxChmod(); break
      case 'details': this.ctxDetails(); break
      case 'copy': this.ctxClipboardCopy(); break
      case 'cut': this.ctxClipboardCut(); break
      case 'paste': this.ctxClipboardPaste(); break
      case 'refresh': this.ctxRefresh(); break
      case 'selectAll': this.ctxSelectAll(); break
      case 'selectInvert': this.ctxSelectInvert(); break
      case 'copyPath': this.ctxCopyPath(); break
    }
  }

  onHeaderMenuAction(action: HeaderMenuAction): void {
    if (action === 'adjustCol') { this.adjustColumnWidth(); return }
    if (action === 'adjustAllCols') { this.adjustAllColumnsWidth(); return }
    if (action === 'togglePinFolders') { this.togglePinFolders(this.contextMenuPane); return }
    if (action === 'toggleHidden') { this.toggleShowHidden(this.contextMenuPane); return }
    if (action === 'toggleColBorders') { this.toggleColBorders(); return }
    if (action === 'toggleZebra') { this.toggleZebra(); return }
    if (action.startsWith('toggleCol:')) {
      this.toggleColumn(action.slice('toggleCol:'.length), this.contextMenuPane)
    }
  }

  /** Whitelist of property names allowed for dynamic assignment via permission field changes */
  private static readonly _PERM_PROP_WHITELIST = new Set<string>([
    'permOwnerRead', 'permOwnerWrite', 'permOwnerExec',
    'permGroupRead', 'permGroupWrite', 'permGroupExec',
    'permOtherRead', 'permOtherWrite', 'permOtherExec',
  ])

  onPermFieldChange(e: { field: PermField; value: boolean }): void {
    const map: Record<PermField, string> = {
      ownerRead: 'permOwnerRead', ownerWrite: 'permOwnerWrite', ownerExec: 'permOwnerExec',
      groupRead: 'permGroupRead', groupWrite: 'permGroupWrite', groupExec: 'permGroupExec',
      otherRead: 'permOtherRead', otherWrite: 'permOtherWrite', otherExec: 'permOtherExec',
    }
    const prop = map[e.field]
    if (!SftpFloatingPanel._PERM_PROP_WHITELIST.has(prop)) {
      log.warn('Blocked dynamic assignment to non-whitelisted property:', prop)
      return
    }
    ;(this as any)[prop] = e.value
    this.updatePermMode()
  }

  // ========== 格式（委托 panel/panel-format） ==========
  formatSize = formatSize
  formatDate = formatDate
  formatPercent = formatPercent
  formatLogTime = formatLogTime
  formatLogTimeRange = formatLogTimeRange
  formatDuration = formatDuration
  formatSpeedFromSize = formatSpeedFromSize
  getLogFileName = getLogFileName

  formatFailReason(entry: TransferLogEntry): string {
    return formatFailReasonFn(entry, this.i18n.t.bind(this.i18n))
  }


  /** 计算本地选中文件的总大小（含目录不计） */
  formatSelectedSizeLocal(): string {
    const total = this.selectedLocal.reduce((sum, e) => sum + (e.isDirectory ? 0 : (e.size ?? 0)), 0)
    return this.formatSize(total)
  }

  /** 本地选中是否包含目录 */
  selectedHasDirLocal(): boolean {
    return this.selectedLocal.some(e => e.isDirectory)
  }

  /** 计算远程选中文件的总大小（含目录不计） */
  formatSelectedSizeRemote(): string {
    const total = this.selectedRemote.reduce((sum, e) => sum + (e.isDirectory ? 0 : (e.size ?? 0)), 0)
    return this.formatSize(total)
  }

  /** 远程选中是否包含目录 */
  selectedHasDirRemote(): boolean {
    return this.selectedRemote.some(e => e.isDirectory)
  }

  formatMode(mode: number): string {
    // 将数字模式（如 755）转换为 rwxr-xr-x 格式
    const m = mode & 0o777
    const r = (m & 0o400) ? 'r' : '-'
    const w = (m & 0o200) ? 'w' : '-'
    const x = (m & 0o100) ? 'x' : '-'
    const rg = (m & 0o040) ? 'r' : '-'
    const wg = (m & 0o020) ? 'w' : '-'
    const xg = (m & 0o010) ? 'x' : '-'
    const ro = (m & 0o004) ? 'r' : '-'
    const wo = (m & 0o002) ? 'w' : '-'
    const xo = (m & 0o001) ? 'x' : '-'
    return `${r}${w}${x}${rg}${wg}${xg}${ro}${wo}${xo}`
  }

  /** 将 mode 数字转换为八进制权限字符串（如 644、755） */
  formatOctalMode(mode: number): string {
    return (mode & 0o777).toString(8).padStart(3, '0')
  }

  getExt(name: string): string {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.substring(dot + 1).toLowerCase() : ''
  }

  // ========== 拖拽 ==========
  private _normRemoteDir(p: string): string {
    const n = path.posix.normalize(p || '/')
    return n.length > 1 && n.endsWith('/') ? n.slice(0, -1) : n
  }

  private _isInternalSameDirDrag(targetPane: 'local' | 'remote'): boolean {
    return this._fileDnd.isInternalSameDirDrag(targetPane)
  }

  private _resetFileDragState(): void {
    this._fileDnd.reset()
  }

  onEntryDragEnd(): void {
    // 拖拽结束（含拖回原位取消）：立刻中止尚未开始/进行中的预缓存下载
    this._cancelRemoteDragCache()
    this._fileDnd.onEntryDragEnd(() => this._clearCustomDragPreview())
  }

  private _customDragPreviewEl: HTMLElement | null = null

  /**
   * 远程→桌面拖出预缓存策略：
   * - 仅小文件（≤4MB）、延迟启动；目录与大文件绝不在 dragstart 拉全量
   * - dragend / 面板销毁时必须 cancel，否则 SFTP read 会继续占满 SSH，关面板也消不掉
   */
  private static readonly DRAG_CACHE_MAX_BYTES = 4 * 1024 * 1024
  private static readonly DRAG_CACHE_DELAY_MS = 450
  private _dragCacheTimer: ReturnType<typeof setTimeout> | null = null
  private _dragCacheGen = 0
  private _dragCacheTransfers: Array<{ cancel: () => void | Promise<void> }> = []
  private _dragCacheInFlight = new Set<string>()

  private _clearCustomDragPreview(): void {
    if (this._customDragPreviewEl) {
      try { this._customDragPreviewEl.remove() } catch {}
      this._customDragPreviewEl = null
    }
  }

  /** 中止延迟定时器与所有进行中的拖拽预缓存下载 */
  private _cancelRemoteDragCache(): void {
    this._dragCacheGen++
    if (this._dragCacheTimer) {
      clearTimeout(this._dragCacheTimer)
      this._dragCacheTimer = null
    }
    const pending = this._dragCacheTransfers.splice(0)
    for (const t of pending) {
      try { void Promise.resolve(t.cancel()).catch(() => {}) } catch { /* ignore */ }
    }
    this._dragCacheInFlight.clear()
  }

  /** 延迟调度小文件预缓存；快速取消拖拽时定时器会被清掉，不会启动下载 */
  private _scheduleRemoteDragCache(entries: SFTPFile[]): void {
    this._cancelRemoteDragCache()
    const eligible = entries.filter(e =>
      !e.isDirectory
      && (e.size ?? 0) > 0
      && (e.size ?? 0) <= SftpFloatingPanel.DRAG_CACHE_MAX_BYTES,
    )
    if (!eligible.length) return
    const gen = this._dragCacheGen
    this._dragCacheTimer = setTimeout(() => {
      this._dragCacheTimer = null
      if (gen !== this._dragCacheGen) return
      void this._cacheRemoteFilesForDrag(eligible, gen)
    }, SftpFloatingPanel.DRAG_CACHE_DELAY_MS)
  }

  private _setCustomDragPreview(ev: DragEvent, items: Array<{ name: string; isDirectory: boolean }>): void {
    const dt = ev.dataTransfer
    if (!dt || !items.length) return
    this._clearCustomDragPreview()

    const wrap = document.createElement('div')
    wrap.style.position = 'fixed'
    wrap.style.left = '-99999px'
    wrap.style.top = '-99999px'
    wrap.style.pointerEvents = 'none'
    wrap.style.zIndex = '2147483647'
    wrap.style.display = 'inline-flex'
    wrap.style.alignItems = 'center'
    wrap.style.gap = '8px'
    // 左侧多留：叠标不被鼠标指针遮挡；Chromium setDragImage 对 emoji 左缘也易裁切
    wrap.style.padding = '7px 12px 7px 22px'
    wrap.style.borderRadius = '8px'
    wrap.style.border = '1px solid rgba(128,128,128,0.35)'
    wrap.style.background = 'rgba(20, 20, 22, 0.92)'
    wrap.style.color = '#f3f4f6'
    wrap.style.fontSize = '12px'
    wrap.style.lineHeight = '1'
    wrap.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)'
    wrap.style.boxSizing = 'border-box'
    wrap.style.overflow = 'visible'

    if (items.length === 1) {
      const one = items[0]
      const icon = document.createElement('span')
      icon.textContent = one.isDirectory ? '📁' : '📄'
      icon.style.fontSize = '14px'
      icon.style.lineHeight = '1'
      icon.style.flexShrink = '0'
      const name = document.createElement('span')
      name.textContent = one.name
      name.style.maxWidth = '260px'
      name.style.overflow = 'hidden'
      name.style.textOverflow = 'ellipsis'
      name.style.whiteSpace = 'nowrap'
      wrap.appendChild(icon)
      wrap.appendChild(name)
    } else {
      const iconStack = document.createElement('span')
      iconStack.style.position = 'relative'
      iconStack.style.display = 'inline-block'
      iconStack.style.flexShrink = '0'
      iconStack.style.width = '36px'
      iconStack.style.height = '18px'
      iconStack.style.marginLeft = '4px'
      const uniqueIcons = Array.from(new Set(items.map(i => i.isDirectory ? '📁' : '📄'))).slice(0, 3)
      uniqueIcons.forEach((ic, idx) => {
        const s = document.createElement('span')
        s.textContent = ic
        s.style.position = 'absolute'
        s.style.left = `${6 + idx * 8}px`
        s.style.top = '1px'
        s.style.fontSize = '14px'
        s.style.lineHeight = '1'
        iconStack.appendChild(s)
      })
      const count = document.createElement('span')
      count.textContent = `${items.length}`
      count.style.fontWeight = '600'
      count.style.paddingLeft = '2px'
      wrap.appendChild(iconStack)
      wrap.appendChild(count)
    }

    document.body.appendChild(wrap)
    this._customDragPreviewEl = wrap
    // 热点靠左：预览整体落在指针右侧，叠标不被鼠标状态图标挡住
    dt.setDragImage(wrap, 8, 14)
  }

  onDragOver(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragOver(ev, targetPane)
  }

  onDragEnter(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragEnter(ev, targetPane)
  }

  onDragLeave(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragLeave(ev, targetPane)
  }

  onDragStartLocal(ev: DragEvent, entry: LocalEntry): void {
    const src = this._resolveDragSource(ev, entry, this.selectedLocal)
    if (!src) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    const cur = path.resolve(this.localPath)
    this._fileDnd.setDragSource('local', src.every(e => path.resolve(path.dirname(e.fullPath)) === cur))
    const p: DragPayload = { kind: 'local-paths', paths: src.map(e => ({ fullPath: e.linkTarget || e.fullPath, name: e.name, isDirectory: e.isDirectory })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))

    // 本地文件真实存在于磁盘，设置 OS 拖拽数据（FilePath + text/uri-list）以支持拖到桌面/资源管理器
    const uriList: string[] = []
    for (const e of src) {
      try {
        const file = new File([''], e.name)
        ;(file as any).path = e.fullPath
        ev.dataTransfer?.items.add(file)
        uriList.push(encodeURI(`file:///${e.fullPath.replace(/\\/g, '/')}`))
      } catch { /* 跳过无法添加的文件 */ }
    }
    if (uriList.length) {
      ev.dataTransfer?.setData('text/uri-list', uriList.join('\r\n'))
      ev.dataTransfer!.dropEffect = 'copy'
      ev.dataTransfer!.effectAllowed = 'copy'
    }
  }

  onDragStartRemote(ev: DragEvent, entry: SFTPFile): void {
    if (!this.connected) return
    const src = this._resolveDragSource(ev, entry, this.selectedRemote)
    if (!src) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    const cur = this._normRemoteDir(this.remotePath)
    this._fileDnd.setDragSource('remote', src.every(e => this._normRemoteDir(path.posix.dirname(e.fullPath)) === cur))
    log.info('[dragstart] remote modified:', src.map(e => ({ name: e.name, modified: e.modified, modifiedMs: e.modified?.getTime?.() })))
    const p: DragPayload = { kind: 'remote-paths', paths: src.map(e => ({ remotePath: e.fullPath, name: e.name, isDirectory: e.isDirectory, size: e.size, mode: e.mode, modified: e.modified?.getTime?.() })) }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))

    // 同步检查临时缓存：只在实际文件已缓存时设置 OS 拖拽数据，否则不设置
    // 避免生成无效的 .url 快捷方式文件
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragout')
    const uriList: string[] = []
    for (const e of src) {
      const tmpPath = path.join(tmpDir, e.name)
      try {
        const st = fsSync.statSync(tmpPath)
        if (e.isDirectory) {
          if (st.isDirectory() && fsSync.statSync(path.join(tmpPath, '.sftp-cache-done'))) {
            try { const file = new File([''], e.name); (file as any).path = tmpPath; ev.dataTransfer?.items.add(file) } catch {}
            uriList.push(`file:///${tmpPath.replace(/\\/g, '/')}`)
          }
        } else if (st.size === (e.size ?? 0)) {
          try { const file = new File([''], e.name); (file as any).path = tmpPath; ev.dataTransfer?.items.add(file) } catch {}
          uriList.push(`file:///${tmpPath.replace(/\\/g, '/')}`)
        }
      } catch { /* 缓存未命中 */ }
    }

    // 全部缓存命中时通知 OS 这是一次文件拖拽；部分命中时不设置，避免产生不完整的拖拽
    if (uriList.length > 0 && uriList.length === src.length) {
      ev.dataTransfer?.setData('text/uri-list', uriList.join('\r\n'))
      ev.dataTransfer!.dropEffect = 'copy'
      ev.dataTransfer!.effectAllowed = 'copy'
      return
    }

    // 缓存部分/全部未命中：不设置 OS 拖拽数据，避免生成快捷方式
    // 保留 application/x-sftp-plus 供面板间内部拖拽（本地↔远程），此功能不受缓存影响
    // 仅对小文件延迟预缓存（供下次拖出桌面）；大文件/目录绝不在 dragstart 拉全量。
    // 快速拖回取消时由 dragend 中止定时器与下载，避免占满 SFTP/SSH 通道。
    if (uriList.length < src.length) {
      this._scheduleRemoteDragCache(src)
    }
  }

  /** 拖拽源解析：检查选中状态、清理框选、返回实际拖拽条目列表；返回 null 表示已取消拖拽 */
  private _resolveDragSource<T extends { fullPath: string }>(ev: DragEvent, entry: T, selected: T[]): T[] | null {
    if (!selected.some(e => e.fullPath === entry.fullPath)) {
      ev.preventDefault()
      this._rubberBand.markDragCancelled()
      return null
    }
    this._rubberBand.cleanup()
    return selected.length ? selected : [entry]
  }

  /**
   * 异步预缓存远程小文件到临时目录（供后续拖到桌面）。
   * 目录/大文件已在调度层过滤；gen 与当前代不一致时立即退出。
   */
  private async _cacheRemoteFilesForDrag(entries: SFTPFile[], gen: number): Promise<void> {
    if (!this.sftpSession || gen !== this._dragCacheGen) return
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragout')
    await fs.mkdir(tmpDir, { recursive: true }).catch(() => {})
    if (gen !== this._dragCacheGen) return

    for (const entry of entries) {
      if (gen !== this._dragCacheGen || !this.sftpSession) return
      // ★ 2026-09-20 N2 审计修复：统一用 safeEntryName 净化远程文件名（与全库一致，防 . / .. / 穿越 / 控制字符）
      const safeName = safeEntryName(entry.name)
      if (!safeName || safeName === '.' || safeName === '..') continue
      if (entry.isDirectory) continue
      if ((entry.size ?? 0) > SftpFloatingPanel.DRAG_CACHE_MAX_BYTES) continue

      const flightKey = entry.fullPath
      if (this._dragCacheInFlight.has(flightKey)) continue
      this._dragCacheInFlight.add(flightKey)
      try {
        const tmpPath = path.join(tmpDir, safeName)
        const cached = await fs.stat(tmpPath).then(s => s.size === (entry.size ?? 0)).catch(() => false)
        if (cached || gen !== this._dragCacheGen) continue

        // 独立 cancel 列表，不占用文件夹传输的共享 _cancelRef（★ 2026-09-20 P1-2：改用显式 ref 入参）
        const dragCancelRef: { current: { cancel?: () => void | Promise<void> } | null } = { current: null }
        const ctx = this._byteTransferCtx(dragCancelRef)
        await downloadRemoteFile(ctx, entry.fullPath, tmpPath, undefined, entry.size, {
          exposeCancel: true,
          onTransfer: (dl) => {
            if (gen !== this._dragCacheGen) {
              void dl.cancel()
              return
            }
            this._dragCacheTransfers.push(dl)
          },
        })
      } catch {
        /* 跳过失败项 */
      } finally {
        this._dragCacheInFlight.delete(flightKey)
        // 清理已结束的 transfer 引用，避免列表无限增长
        this._dragCacheTransfers = this._dragCacheTransfers.filter(t => {
          const anyT = t as { isCancelled?: () => boolean; isComplete?: () => boolean }
          if (typeof anyT.isCancelled === 'function' && anyT.isCancelled()) return false
          if (typeof anyT.isComplete === 'function' && anyT.isComplete()) return false
          return true
        })
      }
    }
  }

  async onDrop(ev: DragEvent, targetPane: 'local' | 'remote'): Promise<void> {
    const destDir = this._resolveDropDestDir(ev, targetPane)
    await this._fileDropRuntime.onDrop(ev, targetPane, destDir)
  }

  /** ★ 2026-09-20：拖放到文件夹行时解析落点目录；落到文件行则用其父目录 */
  private _resolveDropDestDir(ev: DragEvent, targetPane: 'local' | 'remote'): string | undefined {
    const el = (ev.target as HTMLElement | null)?.closest?.('[data-path]') as HTMLElement | null
    if (!el) return undefined
    const p = el.getAttribute('data-path')
    if (!p) return undefined
    const isDir = el.getAttribute('data-isdir') === '1'
    if (targetPane === 'remote') {
      return isDir ? p : path.posix.dirname(p)
    }
    return isDir ? p : path.dirname(p)
  }

  // ========== 文件夹传输进度 ==========

  /** ★ 2026-08-11 提速：递归扫描本地目录，单次遍历同时得出总大小与文件数。
   *   仅对 readdir 调用限流（并发 8）；目录递归本身不占槽——持槽等待子任务
   *   会形成 hold-and-wait 死锁（见 concurrency.ts 注释）。 */
  private async _scanLocalDir(dirPath: string): Promise<{ size: number; count: number }> {
    const limiter = new ConcurrencyLimiter(8)
    const scan = async (dir: string): Promise<{ size: number; count: number }> => {
      let entries: import('fs').Dirent[]
      try {
        entries = await limiter.run(() => fs.readdir(dir, { withFileTypes: true }))
      } catch { return { size: 0, count: 0 } }
      let size = 0
      let count = 0
      const subs: Array<Promise<{ size: number; count: number }>> = []
      for (const item of entries) {
        if (item.isSymbolicLink()) continue
        const p = path.join(dir, item.name)
        if (item.isDirectory()) {
          subs.push(scan(p))
        } else {
          const st = await fs.stat(p).catch(() => null)
          if (st) { size += st.size; count++ }
        }
      }
      for (const r of await Promise.all(subs)) { size += r.size; count += r.count }
      return { size, count }
    }
    return scan(dirPath)
  }

  /** ★ 2026-08-11 提速：递归扫描远程目录，单次遍历同时得出总大小与文件数。
   *   原实现为 size、count 各一次串行递归遍历（每个子目录一次 readdir 往返挨个等），
   *   dist 这类深层目录要几百次串行往返才开始传第一个字节。现改为并发 readdir
   *   （SFTP 请求在同一会话上多路复用），仅 IO 调用占槽、递归不持槽。 */
  private async _scanRemoteDir(remotePath: string): Promise<{ size: number; count: number }> {
    const session = this.sftpSession
    if (!session) return { size: 0, count: 0 }
    const limiter = new ConcurrencyLimiter(8)
    const scan = async (dir: string): Promise<{ size: number; count: number }> => {
      let entries: Array<{ name: string; isDirectory: boolean; size?: number }>
      try {
        entries = await limiter.run(() => session.readdir(dir))
      } catch { return { size: 0, count: 0 } }
      let size = 0
      let count = 0
      const subs: Array<Promise<{ size: number; count: number }>> = []
      for (const e of entries) {
        // ★ 2026-08-26 M2：扫描跳过 symlink，避免跟随扩大范围
        if ((e as any).isSymlink || (e as any).isSymbolicLink) continue
        if (e.isDirectory) {
          subs.push(scan(path.posix.join(dir, e.name)))
        } else {
          size += e.size || 0
          count++  // 包括 0 字节文件
        }
      }
      for (const r of await Promise.all(subs)) { size += r.size; count += r.count }
      return { size, count }
    }
    return scan(remotePath)
  }

  /**
   * ★ 2026-09-25 P1：重复入队**只读预检**——真源是协调器的 `_activeTransferSlots`
   *   （见 PanelTransferCoordinator._claimTransferSlot）。这里只查询、不认领，避免出现
   *   两套槽位表互相误判；提前查一次是为了在请求刚发出、进度条目尚未创建时也能立刻提示。
   *
   * 用户实测场景：Ctrl+V 粘贴后界面未及时响应，以为没生效又点一次「下载」→ 生成两条完全相同的
   *   传输（同远端、同本地）：并发在服务端 tar 打包/下载 tar 包、逐文件阶段两条流写同一批目标文件
   *   （`activeDownloadTargets` 守卫互相 skip 且都被记为失败）→ **双双失败**，此前无任何提示。
   *
   * @returns true 表示已识别为重复并提示用户，调用方应直接判失败返回
   */
  private _blockDuplicateTransfer(
    direction: 'upload' | 'download', remotePath: string, localPath: string, displayName: string,
  ): boolean {
    let active = false
    try { active = this._transferCoordinator.isTransferSlotActive(direction, remotePath, localPath) } catch { /* ignore */ }
    if (!active) return false
    log.warn('[dup-transfer] ignored duplicate request:', direction, remotePath, localPath)
    try {
      this.showToast(this.i18n.t('notify.duplicateTransfer', { name: displayName }), 4200)
    } catch { /* ignore */ }
    return true
  }

  /** 开始一个文件夹传输（创建进度条目和初始日志）；reuseLogEntryId 传入时复用既有
   *  传输记录（冲突覆盖合并场景，避免重复条目） */
  private _startFolderTransfer(
    name: string, direction: 'upload' | 'download',
    remotePath: string, localPath: string,
    totalSize: number, itemCount: number,
    reuseLogEntryId?: string,
  ): { transferEntry: typeof this.transfers[0]; startTime: number; logEntryId: string } {
    // ★ 2026-09-20 P1-2：解析本条目所属任务的 cancelRef（优先当前任务作用域，其次面板「最近任务」字段）。
    //   必须在此刻定死：任务运行期间面板的 _cancelRef 会被后续并发任务改写，
    //   若取消时再去读 _cancelRef，广播就落到别的任务的在途子流上了。
    const taskRef = currentTaskScope() ?? this._cancelRef
    // ★ 2026-08-10：认领预注册的排队占位条目（多选拖拽下载的目录），
    //   原地升级为文件夹条目并复用其日志，避免占位与文件夹条目重复显示
    // ★ 2026-09-14 F6：认领键补 remotePath（与 trackTransfer 同步），防同名 localPath 认领错条目
    const queuedEntries = this.transfers.filter(
      e => e.queued && e.direction === direction && e.localPath === localPath,
    )
    const queuedEntry = queuedEntries.find(e => e.remotePath === remotePath)
      ?? queuedEntries.find(e => !e.remotePath)
    if (queuedEntry) {
      // ★ 2026-08-10 修复：占位条目在排队期间已被取消（竞态窗口内用例已启动）——
      //   不认领，移除条目与占位日志，并标 _aborted 令用例循环立即终止
      if (this._transferRuntime.consumeQueuedCancel(direction, localPath, remotePath)) {
        this.transfers = this.transfers.filter(x => x !== queuedEntry)
        if (queuedEntry.logEntryId != null) {
          try { this.transferLog.remove(queuedEntry.logEntryId) } catch { /* ignore */ }
        }
        ;(queuedEntry as any)._aborted = true
        ;(queuedEntry as any)._taskCancelRef = taskRef
        this._safeDetect()
        return { transferEntry: queuedEntry, startTime: Date.now(), logEntryId: queuedEntry.logEntryId! }
      }
      Object.assign(queuedEntry, {
        transfer: null, name, remotePath,
        percent: 0, speed: '', bytesDone: 0, bytesTotal: totalSize,
        paused: false, queued: false,
        isFolder: true, currentItem: '', itemCount, itemDone: 0,
        _taskCancelRef: taskRef,
        // ★ 2026-09-20：开传时先标方式；若随后走 tar 通道会再改成 'tar'
        transferMode: 'sftp',
      })
      if (queuedEntry.logEntryId != null) {
        // ★ 2026-09-03：回填目录传输模式与文件数（预扫描后记录真实文件数）
        this.transferLog.update(queuedEntry.logEntryId, {
          size: totalSize, startTime: Date.now(),
          transferMode: 'sftp',
          fileCount: itemCount || 0,
        })
      }
      this.transfersMinimized = false
      this.transfersHidden = false
      this._safeDetect()
      return { transferEntry: queuedEntry, startTime: Date.now(), logEntryId: queuedEntry.logEntryId! }
    }
    const logEntry = reuseLogEntryId
      ? { id: reuseLogEntryId }
      : this.transferLog.add({
        operation: direction,
        localPath,
        remotePath,
        profileName: this.profile?.name || undefined,
        success: true,
        size: totalSize,
        duration: 0,
        startTime: Date.now(),
        pending: true,  // ★ 修复：标记进行中，避免日志误显示"下载成功 ✓ 0ms"
        // ★ 2026-09-03：记录目录传输模式与文件数（预扫描后记录真实文件数）
        transferMode: 'sftp',
        fileCount: itemCount || 0,
      })
    if (reuseLogEntryId) {
      // 复用既有记录：重置为进行中，完成后由 finish 回填结果
      try {
        this.transferLog.update(reuseLogEntryId, {
          pending: true, success: true, duration: 0, startTime: Date.now(),
          transferMode: 'sftp',
          fileCount: itemCount || 0,
        })
      } catch { /* ignore */ }
    }
    const transferEntry = {
      transfer: null, direction, name, remotePath, localPath,
      percent: 0, speed: '', bytesDone: 0, bytesTotal: totalSize,
      paused: false, logEntryId: logEntry.id,
      isFolder: true, currentItem: '', itemCount, itemDone: 0,
      _taskCancelRef: taskRef,
      transferMode: 'sftp',
    } as typeof this.transfers[0]
    this.transfers.push(transferEntry)
    this.transfersMinimized = false  // 新文件夹传输自动展开面板
    this.transfersHidden = false
    this._safeDetect()
    return { transferEntry, startTime: Date.now(), logEntryId: logEntry.id }
  }

  /** 更新文件夹传输进度 */
  private _updateFolderProgress(
    t: typeof this.transfers[0], bytesDone: number, currentItem: string, itemDone: number,
    currentItemSize?: number,
  ): void {
    // 暂停中不更新（用户暂停后当前文件可能刚好完成）
    if (t.paused) return
    t.bytesDone = bytesDone
    t.currentItem = currentItem
    t.currentItemSize = currentItemSize
    t.itemDone = itemDone
    t.percent = t.bytesTotal > 0 ? Math.min(100, Math.round((bytesDone / t.bytesTotal) * 100)) : 0
    // 简易速度：每 500ms 刷新一次（与 runtime 单文件传输的 500ms 窗口对齐）
    const now = Date.now()
    const lastUpdate = (t as any)._lastSpeedUpdate || 0
    const lastBytes = (t as any)._lastBytes || 0
    if (now - lastUpdate >= 500) {
      const deltaBytes = bytesDone - lastBytes
      const deltaTime = Math.max(1, now - lastUpdate)
      // ★ 2026-09-26 修复（用户截图实测）：**必须先有上一次采样时刻，才能把它当窗口左端**。
      //   首次调用时 `_lastSpeedUpdate` 还是 0 ⇒ deltaTime = now − 0 = **纪元毫秒**（≈1.79e12，
      //   即 55 年）⇒ 瞬时速率被压到 1e-9 量级：
      //     · 速度显示成 "0 B/s"（用户截图里的 `0 B/s`）；
      //     · 剩余时间 = 剩余字节 / 1e-9 ⇒ 显示 `剩余 3255876663332h01m`。
      //   而且这个近 0 的毒值还会经 EMA(0.65/0.35) 污染随后几个窗口：
      //     bps ≈ 0.35 × 真值 ⇒ 显示 `169.2 KB/s` 却报 `剩余 21m07s`
      //     （按 169.2 KB/s 应约 7m24s，差 2.8 倍 ≈ 1/0.35）—— 两张截图同一个根因。
      //   ⇒ 第一次采样（lastUpdate === 0）只建立基准、不产出速率；下一个窗口才是真测量。
      //   ⚠ 这里**不能**再叠加「窗口上限」保护：文件夹通道的 bytesDone 只在「一个文件传完」
      //     时跳变，一个 84.9MB 的文件传 8 分钟期间没有任何进度事件，长窗口正是该文件的
      //     真实均速，必须照常使用（单文件通道相反，那边加了上限，见 transfer-coordinator）。
      const baselineOk = lastUpdate > 0
      // ★ 2026-09-26（用户：「这次似乎又完全不会动了」）：`_lastGrowAt` = **最后一次看到字节
      //   增长的窗口时刻**。首次采样（只建基准那一次）也置它，等于「从开传开始计时」。
      if (!baselineOk || deltaBytes > 0) (t as any)._lastGrowAt = now
      // 仅在有新进度时更新速率；delta=0 时保留上次速度（避免卡顿时闪烁为空）
      if (baselineOk && deltaBytes > 0) {
        t.speed = this._formatSpeed(deltaBytes, deltaTime)
        // ★ 2026-09-26：数值速率（EMA 平滑）供「剩余时间」使用，见 transfer-coordinator 同处注释
        const inst = (deltaBytes * 1000) / deltaTime
        const prevBps = Number(t.speedBps) || 0
        t.speedBps = prevBps > 0 ? prevBps * 0.65 + inst * 0.35 : inst
      } else if (baselineOk) {
        // 连续零推进持续到阈值，就如实承认「现在没在动」——速度显示 0 B/s、speedBps 置 0
        // （剩余时间随之显示 ∞）。阈值与单文件通道共用同一个常量。
        // ⚠ 计时基准必须是**最后一次字节增长**，不能是「第一次空窗口」：后者会白饶一个窗口
        //   （产物探针实测：真实零推进已 16s，却只从上一窗口算起 2s ⇒ 迟迟不显示停摆）。
        const lastGrowAt = Number((t as any)._lastGrowAt) || now
        if (now - lastGrowAt >= SPEED_STALL_ZERO_MS && t.speed !== SPEED_STALL_ZERO_TEXT) {
          t.speed = SPEED_STALL_ZERO_TEXT
          t.speedBps = 0
        }
      }
      // 始终推进基准点，保证下次计算窗口正确
      ;(t as any)._lastSpeedUpdate = now
      ;(t as any)._lastBytes = bytesDone
    }
    this._safeDetect()
  }

  /** 完成文件夹传输 */
  private _finishFolderTransfer(
    t: typeof this.transfers[0], startTime: number, logEntryId: string, success: boolean,
  ): void {
    this.transfers = this.transfers.filter(x => x !== t)
    const now = Date.now()
    // ★ 兜底：总量未知（预扫描失败等 bytesTotal=0）时，完成时用实际已传字节回填日志 size
    const patch: { success: boolean; duration: number; endTime: number; pending: boolean; size?: number } =
      { success, duration: now - startTime, endTime: now, pending: false }
    if (!(t.bytesTotal > 0) && t.bytesDone > 0) patch.size = t.bytesDone
    this.transferLog.update(logEntryId, patch)
  }

  // ========== 传输 ==========
  /**
   * 功能描述：上传文件/目录到远程，带冲突检测和进度显示。
   *   目录 → 预计算大小，显示文件夹级进度条和当前文件
   *   单文件 → 用 _doUpload 走 trackTransfer 进度
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 集成文件夹进度追踪
   */
  private async uploadPathToRemote(
    remoteDir: string, localPath: string,
    _top?: FolderTransferCtx,
  ): Promise<boolean> {
    // ★ 2026-09-25 P1：仅顶层调用做重复入队只读预检（真正的槽位由协调器认领/释放；
    //   嵌套子目录/冲突覆盖重入必须放行）。远端目标与 UploadPathUseCase 一致
    const slotBaseName = path.basename(localPath)
    const slotRemote = path.posix.join(remoteDir, slotBaseName)
    if (!_top && this._blockDuplicateTransfer('upload', slotRemote, localPath, slotBaseName)) return false
    // ★ BUG-2 修复：为每个传输任务创建独立的 cancelRef，避免并发任务互相影响
    const cancelRef = { current: null as any, active: new Set<any>() }
    this._cancelRefs.add(cancelRef)
    const prevRef = this._cancelRef
    this._cancelRef = cancelRef
    try {
      // ★ 2026-09-20 P1-2：把任务 ref 绑到异步调用链上——该任务（含递归子目录、并发子文件）
      //   里所有叶子传输都经 currentTaskScope() 解析到这个 ref，不再被后启动任务覆盖
      return await runInTaskScope(cancelRef, () =>
        this._transferCoordinator.uploadPathToRemote(remoteDir, localPath, _top))
    } finally {
      this._cancelRefs.delete(cancelRef)
      if (this._cancelRef === cancelRef) this._cancelRef = prevRef
      if (this._cancelRef && !this._cancelRef.current && !(this._cancelRef.active?.size)) this._cancelRef = null
    }
}

  /**
   * 功能描述：不检测冲突，直接上传
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Composer
   * 修改时间：2026-07-25 — 字节级逻辑下沉 transfer-adapters.uploadLocalFile
   */
  protected async _doUpload(
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'edit-upload',
  ): Promise<boolean> {
    if (!this.sftpSession) return false
    return uploadLocalFile(this._byteTransferCtx(), remotePath, localPath, {
      track: true,
      logOperation,
    })
  }

  /** 上传文件（不记录传输日志，文件夹内部使用） */
  private async _doUploadRaw(remotePath: string, localPath: string): Promise<boolean> {
    if (!this.sftpSession) return false
    return uploadLocalFile(this._byteTransferCtx(), remotePath, localPath, {
      exposeCancel: true,
    })
  }

  /**
   * 功能描述：下载远程文件到本地，不检测冲突（冲突已在前置步骤处理）
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   * 修改人：DD1024z + Composer
   * 修改时间：2026-07-25 — 字节级逻辑下沉 transfer-adapters.downloadRemoteFile
   */
  private async _doDownload(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean> {
    if (!this.sftpSession) return false
    return downloadRemoteFile(this._byteTransferCtx(), remotePath, localPath, mode, size, {
      track: true,
    })
  }

  /** 下载文件（不记录传输日志，文件夹内部使用）
   *  ☆ 通过 cancelRef 暴露 dl 引用，供暂停/取消时中断
   *  ★ 2026-09-26：新增 `onProgress`（本文件已落盘字节）——目录条目原先只在「文件传完」时
   *    拿到一次进度，单个大文件期间整行静止（用户：「这次似乎又完全不会动了」）。
   *    `downloadRemoteFile` 只在创建时通过 `onTransfer` 交出一次 dl 引用（与 tar 通道
   *    `_downloadTarBall` 同一套路），故这里用 400ms 轮询其 `getCompletedBytes()`。
   *    轮询在 finally 里清除；无 onProgress 时**不建定时器**（单文件顶层下载走
   *    `_doDownload`/track 通道，由协调器 200ms tick 负责，不经此处）。 */
  private async _doDownloadRaw(
    remotePath: string, localPath: string, mode?: number, size?: number,
    onProgress?: (bytes: number) => void,
  ): Promise<boolean> {
    if (!this.sftpSession) return false
    let dl: LocalPathFileDownload | null = null
    const timer = onProgress
      ? setInterval(() => { if (dl) onProgress(Number(dl.getCompletedBytes?.()) || 0) }, 400)
      : null
    try {
      return await downloadRemoteFile(this._byteTransferCtx(), remotePath, localPath, mode, size, {
        exposeCancel: true,
        onTransfer: (d) => { dl = d },
      })
    } finally {
      if (timer !== null) clearInterval(timer)
    }
  }

  /** ★ 2026-08-11：tar 打包通道下载 tar 包（不产生 UI 条目）；
   *   轮询 dl 引用上报进度，shouldAbort 为 true 时中断字节流 */
  private async _downloadTarBall(
    remotePath: string,
    localPath: string,
    size: number,
    onProgress?: (bytes: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<boolean> {
    if (!this.sftpSession) return false
    let dl: LocalPathFileDownload | null = null
    const timer = setInterval(() => {
      if (shouldAbort?.() && dl && !dl.isCancelled() && !dl.isPaused()) void dl.cancel()
      if (dl && onProgress) onProgress(dl.getCompletedBytes())
    }, 400)
    try {
      return await downloadRemoteFile(this._byteTransferCtx(), remotePath, localPath, undefined, size, {
        onTransfer: (d) => { dl = d },
        // ★ 2026-09-26：把 tar 通道的中止信号透传给下载层——分块通道每块检查，
        //   用户取消/条目被 abort 时立刻停手（原先只能等下一次整文件超时才发现）
        shouldAbort: () => shouldAbort?.() === true,
      })
    } finally {
      clearInterval(timer)
    }
  }

  /** 组装字节级传输上下文（会话 + 守卫 + 进度回调）
   *  ★ 2026-09-20 P1-2：cancelRef 解析顺序 = 显式传入 → 所属任务作用域 → 面板「最近任务」字段。
   *   中间一级是关键：并发多目录任务时，子文件流必须登记到**自己任务**的 ref，
   *   此前直接用 this._cancelRef（=最后启动的任务）会导致登记归属错位、取消时互杀。 */
  private _byteTransferCtx(taskRef?: TaskCancelRef | null) {
    return {
      session: this.sftpSession!,
      activeDownloadTargets: this._activeDownloadTargets,
      // ★ 2026-09-21 P1：同名并发上传守卫（uploadLocalFile 消费）
      activeUploadTargets: this._activeUploadTargets,
      cancelRef: taskRef ?? currentTaskScope() ?? this._cancelRef,
      trackTransfer: (
        t: LocalPathFileUpload | LocalPathFileDownload,
        direction: 'upload' | 'download',
        remotePath: string,
        localPath: string,
        logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
      ) => this.trackTransfer(t, direction, remotePath, localPath, logOperation as any),
      onUploadError: (_remotePath: string, localPath: string) => {
        const name = path.basename(localPath)
        const msg = this.i18n.t('notify.uploadFailed', { name })
        try { this.notifications?.error?.(msg, '') } catch { /* ignore */ }
      },
      onDownloadError: (remotePath: string) => {
        const name = path.basename(remotePath)
        const msg = this.i18n.t('notify.downloadFailed', { name })
        try { this.notifications?.error?.(msg, '') } catch { /* ignore */ }
      },
    }
  }

  // ========== 冲突处理 ==========

  /**
   * 功能描述：显示冲突对话框（仅当有等待处理的冲突项时）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   * 修改人：DD1024z + Deepseek-V4-Flash
   * 修改时间：2026-06-25 — 支持下载方向的冲突，不再重复获取远程信息（下载已携带）
   */
  private _showConflictDialog(): void {
    this._conflictResolver.showConflictDialog()
  }

  /**
   * 功能描述：用户点击冲突对话框的操作
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-24
   */
  resolveConflict(action: string): void {
    this._conflictResolver.resolveConflict(action)
  }

  // ========== 传输进度轮询（委托 panel/panel-transfer-runtime） ==========

  private trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): void {
    this._transferRuntime.trackTransfer(t, direction, remotePath, localPath, logOperation)
    // P2-3: 仅首个传输自动展开面板，后续传输不覆盖用户的最小化/隐藏操作
    if (this.transfers.length <= 1) {
      this.transfersMinimized = false
      this.transfersHidden = false
    }
  }

  protected _logEditorTransfer(
    operation: 'edit-upload' | 'edit-download',
    remotePath: string,
    localPath: string,
    size: number,
    success: boolean,
    startTime: number,
    failReason?: TransferLogEntry['failReason'],
  ): void {
    const now = Date.now()
    this.transferLog.add({
      operation,
      localPath,
      remotePath,
      profileName: this.profile?.name || undefined,
      success,
      size,
      duration: now - startTime,
      startTime,
      endTime: now,
      failReason,
    })
  }

  /**
   * 取该条目所属任务的 cancelRef。
   * ★ 2026-09-20 P1-2 审计修复：此前一律用 this._cancelRef 广播，而它永远指向
   *   「最后启动且仍在跑」的任务 —— 取消旧任务时会把新任务的在途子流全部 cancel（误杀）。
   *   改用条目自身记录的 _taskCancelRef；缺失时（旧数据/非目录任务）才退回面板字段。
   */
  private _taskRefOf(entry: any): TaskCancelRef | null {
    return (entry?._taskCancelRef as TaskCancelRef | undefined) ?? this._cancelRef
  }

  cancelTransfer(entry: { transfer: any; logEntryId?: string; paused?: boolean; isFolder?: boolean }): void {
    this._transferRuntime.cancelTransfer(entry)
    // ★ 2026-08-10：排队占位条目无底层流——不得碰 _cancelRef，
    //   否则可能误杀其它文件夹传输正在进行的子文件流
    if ((entry as any).queued) return
    // ★ 2026-08-26 H2：文件夹取消时广播全部在途子流（并发>1）
    // ★ 2026-09-20 P1-2：广播范围限定为「本条目所属任务」的 ref
    if (entry.isFolder) cancelAllInFlight(this._taskRefOf(entry))
  }

  /** 取消当前文件（文件夹：跳过此文件，循环继续） */
  cancelCurrentFile(entry: { isFolder?: boolean }): void {
    this._transferRuntime.cancelCurrentFile(entry)
    // ★ 2026-08-26 H2：中断当前在途子流集合
    // ★ 2026-09-20 P1-2：同样是「本任务」的集合，不是面板最近任务的
    if (entry.isFolder) cancelAllInFlight(this._taskRefOf(entry))
  }

  /** 暂停传输 */
  pauseTransfer(entry: any): void {
    this._transferRuntime.pauseTransfer(entry)
  }

  /** 继续传输（断点续传） */
  async resumeTransfer(entry: any): Promise<void> {
    // ★ 2026-09-26：文件夹条目恢复传输时**重置速度窗口基准**。
    //   文件夹的进度只在「一个文件传完」时上报（见 _updateFolderProgress），暂停期间
    //   `_lastSpeedUpdate` 不会推进；若照常按窗口左端算，暂停的整段时间会被并进 deltaTime，
    //   速率被摊薄到暂停时长上（暂停 10 分钟 ⇒ 速率低几十倍 ⇒ 剩余时间虚高几十倍）。
    //   置 0 即「无基准」⇒ 恢复后的第一次上报只重新建立基准、不产出速率（见 _updateFolderProgress）。
    //   单文件条目的窗口基准在协调器里（resume 时已重置 meta.prevBytes/prevTime），此处不涉。
    if (entry?.isFolder) (entry as any)._lastSpeedUpdate = 0
    await this._transferRuntime.resumeTransfer(entry)
  }

  /**
   * 内部：执行续传操作
   * 功能描述：用新的 transfer 适配器从指定 offset 继续传输
   *           优先尝试原始 ssh2 SFTP createReadStream/createWriteStream
   *           （支持 start 偏移，实现真断点续传），否则回退到标准 upload/download
   */
  // 续传内部实现已迁移至 panel/panel-transfer-runtime.ts

  /**
   * 用原始 ssh2 SFTP createWriteStream 实现断点续传上传
   */
  // 原始 ssh2 续传上传已迁移至 panel/panel-transfer-runtime.ts

  /**
   * 用原始 ssh2 SFTP createReadStream 实现断点续传下载
   */
  // 原始 ssh2 续传下载已迁移至 panel/panel-transfer-runtime.ts

  /** 关闭整个传输面板 */
  clearTransfers(): void {
    // ★ 2026-08-26 H3：清空队列时广播取消所有在途子流
    // ★ 2026-09-20 P1-2：必须广播到**全部**在途任务的 ref（旧实现只播 _cancelRef = 最近任务，
    //   其它并发目录任务的子流不会被中断——clearTransfers 之后仍继续往对端写文件）。
    //   条目可能在 runtime.clearTransfers() 里被清空，故先快照 ref 集合。
    const refs = new Set<TaskCancelRef>()
    if (this._cancelRef) refs.add(this._cancelRef)
    for (const r of this._cancelRefs) refs.add(r)
    for (const t of this.transfers) {
      const r = (t as any)._taskCancelRef as TaskCancelRef | undefined
      if (r) refs.add(r)
    }
    this._transferRuntime.clearTransfers()
    for (const r of refs) cancelAllInFlight(r)
  }

  // ========== 权限编辑对话框 ==========
  openPermDialog(entry: SFTPFile): void {
    // ★ 2026-09-20：mode 缺失时 undefined&0o777===0，确认会 chmod 000；先拒绝或补 stat
    const rawMode = entry.mode
    if (rawMode == null || !Number.isFinite(Number(rawMode))) {
      if (this.sftpSession && typeof (this.sftpSession as any).stat === 'function') {
        void (this.sftpSession as any).stat(entry.fullPath).then((st: any) => {
          const m = Number(st?.mode ?? st?.attrs?.permissions ?? st?.attrs?.mode)
          if (!Number.isFinite(m)) {
            this.showToast(this.i18n.t('perm.modeUnknown') || '无法读取权限，已取消')
            return
          }
          this.openPermDialog({ ...entry, mode: m })
        }).catch(() => {
          this.showToast(this.i18n.t('perm.modeUnknown') || '无法读取权限，已取消')
        })
        return
      }
      this.showToast(this.i18n.t('perm.modeUnknown') || '无法读取权限，已取消')
      return
    }
    this.permTargetPath = entry.fullPath
    this.permTargetName = entry.name
    const m = Number(rawMode) & 0o777
    this.permOwnerRead = (m & 0o400) !== 0
    this.permOwnerWrite = (m & 0o200) !== 0
    this.permOwnerExec = (m & 0o100) !== 0
    this.permGroupRead = (m & 0o040) !== 0
    this.permGroupWrite = (m & 0o020) !== 0
    this.permGroupExec = (m & 0o010) !== 0
    this.permOtherRead = (m & 0o004) !== 0
    this.permOtherWrite = (m & 0o002) !== 0
    this.permOtherExec = (m & 0o001) !== 0
    this.updatePermMode()
    this.showPermDialog = true
  }

  updatePermMode(): void {
    let m = 0
    if (this.permOwnerRead) m |= 0o400
    if (this.permOwnerWrite) m |= 0o200
    if (this.permOwnerExec) m |= 0o100
    if (this.permGroupRead) m |= 0o040
    if (this.permGroupWrite) m |= 0o020
    if (this.permGroupExec) m |= 0o010
    if (this.permOtherRead) m |= 0o004
    if (this.permOtherWrite) m |= 0o002
    if (this.permOtherExec) m |= 0o001
    this.permModePreview = m.toString(8).padStart(3, '0')
  }

  confirmPermDialog(): void {
    if (!this.permTargetPath || !this.sftpSession) return
    const m = parseInt(this.permModePreview, 8)
    this.sftpSession.chmod(this.permTargetPath, m)
      .then(() => this.refreshRemote())
      .catch(e => {
        log.error('chmod failed', e)
        this.showToast(this.i18n.t('permission.chmodFailed') || '权限修改失败', 3000)
      })
    this.showPermDialog = false
    this.permTargetPath = ''
  }

  cancelPermDialog(): void {
    this.showPermDialog = false
    this.permTargetPath = ''
  }

  /** 检查远程目录下是否已有同名条目（新建/上传冲突检测）；用 stat 准确判断文件/目录类型 */
  private async _remoteEntryExists(parentPath: string, name: string): Promise<{ exists: boolean; isDirectory: boolean }> {
    if (!this.sftpSession) return { exists: false, isDirectory: false }
    const fullPath = path.posix.join(parentPath, name)
    // 优先用 stat 准确判断（readdir 的 isDirectory 字段不一定可靠）
    if (this.sftpSession.stat) {
      try {
        const st = await this.sftpSession.stat(fullPath)
        // ★ 2026-09-14 F7：isDirectory 可能是函数形态（ssh2/russh 层），旧写法 `?? false`
        //   会把函数本身当 truthy → 普通文件被误判为目录（新建/重命名冲突提示全错）。
        //   对齐 conflict.ts 的三态处理，并兜底 russh-napi 的数字 type（0=目录/1=文件/2=链接）
        const raw = st as any
        let isDir = false
        if (typeof raw.isDirectory === 'function') isDir = !!raw.isDirectory()
        else if (typeof raw.isDirectory === 'boolean') isDir = raw.isDirectory
        else if (typeof raw.type === 'number') isDir = raw.type === 0
        return { exists: true, isDirectory: isDir }
      } catch (e: any) {
        if (e?.code === 'ENOENT' || /not exist/i.test(String(e?.message))) return { exists: false, isDirectory: false }
        // stat 失败（如无 stat 权限）→ 回退到 readdir
      }
    }
    try {
      const entries = await this.sftpSession.readdir(parentPath)
      const found = entries.find((e: any) => e.name === name)
      if (!found) return { exists: false, isDirectory: false }
      return { exists: true, isDirectory: !!found.isDirectory }
    } catch { return { exists: false, isDirectory: false } }
  }

  // ========== 文件操作 ==========
  localNewFolder(): void { this.openInputDialog('local-mkdir', this.i18n.t('app.newFolder'), '', '', this.localPath) }
  localNewFile(): void { this.openInputDialog('local-touch', this.i18n.t('app.newFile'), '', '', this.localPath) }
  localRename(): void {
    if (this.selectedLocal.length !== 1) return
    this.openInputDialog('local-rename', this.i18n.t('app.rename'), this.selectedLocal[0].name, this.selectedLocal[0].name, this.selectedLocal[0].fullPath)
  }
  /** 面板操作级热键：删除(Delete)/重命名(F2)/刷新(F5)/返回上级(Shift+Backspace)，均可在设置页开关或改键 */
  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    // 捕获阶段已处理过的事件：避免重复执行
    if ((event as any).__sftpPlusPanelHotkeyHandled) return
    this._handlePanelWindowHotkey(event)
  }

  /**
   * ★ 2026-09-20：window 捕获阶段先于 Tabby HotkeysService 消费面板热键。
   * Angular HostListener 在冒泡阶段，晚于 Tabby；仅 stopPropagation 挡不住 Alt+Enter 全屏等全局键。
   */
  private _capturePanelHotkeysBeforeTabby(event: KeyboardEvent): void {
    if (!this._isPanelActive) return
    if (this._isPanelModalOpen()) return
    if (!this._isPanelDomFocused() && !this._panelOwnsClipboardHotkeys) return
    if (this._isPanelTyping(event)) return
    // ★ issue #24：焦点在终端时不抢 Tabby 全局键，避免吞掉终端按键（如空格）
    if (this._isTerminalFocusTarget(event)) return
    if (!this._eventWouldConsumePanelHotkey(event)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    ;(event as any).__sftpPlusPanelHotkeyHandled = true
    // ★ 2026-09-29（性能，用户反馈「按住 Shift 连选卡顿」）：
    //   方向键是**连发**键（按住 ~30 次/秒），而 zone.run 除了执行处理函数，还会在微任务清空时
    //   触发 ApplicationRef.tick()——即整站变更检测。方向键分支（_handleArrowNav）本就在收尾处
    //   显式调用 _safeDetect()，自己就能把面板视图刷好，于是每次按键白付一遍全量 CD。
    //   这里对方向键改走 runOutsideAngular：每步只保留 1 遍面板 CD（其余热键仍走 zone.run，
    //   它们依赖 tick 更新对话框等视图）。
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      this.zone.runOutsideAngular(() => this._handlePanelWindowHotkey(event))
      return
    }
    this.zone.run(() => this._handlePanelWindowHotkey(event))
  }

  /**
   * ★ 2026-09-20：右键菜单类热键的目标面板解析
   * - 上传/打开：固定本地；下载：固定远程；其余跟当前选中侧
   */
  private _resolveContextHotkeyPane(a: PanelHotkeyAction): 'local' | 'remote' {
    if (a === 'upload' || a === 'openLocal') return 'local'
    if (a === 'download') return 'remote'
    return this._resolveTargetPane()
  }

  /**
   * ★ 2026-09-20：判断某右键菜单热键当前是否可执行（有选中 / 打开仅本地单选 / 查看编辑需文件可看可编）
   */
  private _contextHotkeyReady(a: PanelHotkeyAction, pane: 'local' | 'remote'): boolean {
    if (a === 'upload') return this.selectedLocal.length > 0
    if (a === 'download') return this.selectedRemote.length > 0
    if (a === 'newFolder' || a === 'newFile') return true
    const sel = pane === 'local' ? this.selectedLocal : this.selectedRemote
    if (a === 'details' || a === 'copyPath') return sel.length > 0
    if (a === 'openLocal') return pane === 'local' && sel.length === 1
    if (a === 'viewFile' || a === 'editFile') {
      if (sel.length !== 1) return false
      const e = sel[0]
      return a === 'viewFile' ? this.canViewEntry(e) : this.canEditEntry(e)
    }
    return true
  }

  /** 需要写入 contextMenuEntry 再分发的菜单热键 */
  private static readonly _CTX_HOTKEYS_NEED_ENTRY: ReadonlySet<string> = new Set([
    'openLocal', 'viewFile', 'editFile', 'details', 'copyPath',
  ])

  /** 与 onWindowKeyDown 相同的命中条件，但不执行动作（供捕获阶段判断是否要抢走 Tabby） */
  private _eventWouldConsumePanelHotkey(event: KeyboardEvent): boolean {
    // ★ 2026-09-29：Shift 也纳入 —— Shift+↑/↓ 现在是面板的连续多选，需在捕获阶段就认领，
    //   否则宿主可能先消费掉组合键；Ctrl/Alt/Meta 组合仍不认领。
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown')
      && !event.ctrlKey && !event.metaKey && !event.altKey
      && this._arrowNavPane) {
      return true
    }
    if (this._panelHotkeyEnabled('up') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('up'))) {
      return true
    }
    if (this._panelHotkeyEnabled('delete') && this._matchPanelHotkeyKeysIgnoreShift(event, this._panelHotkeyKeys('delete'))) {
      const side = this._resolveTargetPane()
      const sel = side === 'local' ? this._selectedLocal : this._selectedRemote
      return !!(sel && sel.length > 0)
    }
    if (this._panelHotkeyEnabled('rename') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('rename'))) {
      const pane = this._resolveTargetPane()
      if (pane === 'local' && this.selectedLocal.length === 1) return true
      if (pane === 'remote' && this.selectedRemote.length === 1) return true
      return false
    }
    if (this._panelHotkeyEnabled('refresh') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('refresh'))) {
      return true
    }
    for (const a of CONTEXT_ACTION_HOTKEYS) {
      if (!this._panelHotkeyEnabled(a)) continue
      if (!matchPanelHotkeyKeys(event, this._panelHotkeyKeys(a))) continue
      const pane = this._resolveContextHotkeyPane(a)
      if (!this._contextHotkeyReady(a, pane)) continue
      return true
    }
    return false
  }

  private _handlePanelWindowHotkey(event: KeyboardEvent): void {
    // 面板不可见（最小化/所在 tab 未激活，如打开设置页或切到其它终端）时不响应
    if (!this._isPanelActive) return
    // ★ 2026-08-26 H9/C3：任意模态打开时短路面板热键，避免查看器下误删等
    if (this._isPanelModalOpen()) return
    // ★ 2026-09-20：焦点不在面板 DOM 时不劫持 Delete/方向键/F2/F5（与 Backspace 历史一致）
    //   否则点选文件后点回终端，Delete 会误删、方向键会改选中
    if (!this._isPanelDomFocused() && !this._panelOwnsClipboardHotkeys) return
    // 仅面板自身输入框内才视为正在输入；终端 textarea 在面板之外不拦截
    if (this._isPanelTyping(event)) return
    // ★ issue #24：焦点位于终端(xterm)时绝不劫持按键——空格/字母等必须正常输入终端
    if (this._isTerminalFocusTarget(event)) return

    // 方向键上下移动选中项（仅在实际点击过的面板内生效，不受 mouseenter 悬停影响）
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      this._clearTypeAhead()
      // Ctrl/Alt/Meta 组合仍不拦截，留给其它功能；
      // ★ 2026-09-29：Shift 不再放行 —— Shift+↑/↓ = 连续多选（由 _handleArrowNav 的 extend 分支处理）
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // 未曾在任一面板点击过条目 → 不响应方向键（避免鼠标悬停切换面板后误触发）
      const side = this._arrowNavPane
      if (!side) return
      // 仅在真的发生移动时消费按键（已在列表端点则把按键留给宿主）
      if (!this._handleArrowNav(side, event.key === 'ArrowDown', event.shiftKey)) return
      event.preventDefault()
      event.stopPropagation()
      return
    }

    // 返回上级（默认 Shift+Backspace）：目标面板与 Delete 一致走 _resolveTargetPane
    if (this._panelHotkeyEnabled('up') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('up'))) {
      event.preventDefault()
      event.stopPropagation()
      const pane = this._resolveTargetPane()
      if (pane === 'local') this.localUp()
      else this.remoteUp()
      return
    }
    // 删除选中（默认 Delete；Shift+Delete = 跳过回收站，仍弹确认）
    // 注意：shift 不参与热键匹配——它作为"强制永久删除"语义修饰符始终透传给 _paneDelete
    if (this._panelHotkeyEnabled('delete') && this._matchPanelHotkeyKeysIgnoreShift(event, this._panelHotkeyKeys('delete'))) {
      const side = this._resolveTargetPane()
      const sel = side === 'local' ? this._selectedLocal : this._selectedRemote
      if (sel && sel.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        this._paneDelete(side, event.shiftKey)
      }
      return
    }
    // 重命名（默认 F2）
    if (this._panelHotkeyEnabled('rename') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('rename'))) {
      const pane = this._resolveTargetPane()
      if (pane === 'local' && this.selectedLocal.length === 1) {
        event.preventDefault()
        event.stopPropagation()
        this.localRename()
      } else if (pane === 'remote' && this.selectedRemote.length === 1) {
        event.preventDefault()
        event.stopPropagation()
        this.remoteRename()
      }
      return
    }
    // 刷新当前面板（默认 F5）
    if (this._panelHotkeyEnabled('refresh') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('refresh'))) {
      event.preventDefault()
      event.stopPropagation()
      const pane = this._resolveTargetPane()
      if (pane === 'local') void this.refreshLocal()
      else void this.refreshRemote()
      return
    }
    // ★ 2026-08-31 / 2026-09-20：右键菜单常用动作的可配置快捷键（默认留空，未绑定即不响应）
    //   上传/下载/打开/查看/编辑等按目标侧与选中态判断；不满足时不拦截，避免抢走其它键位。
    for (const a of CONTEXT_ACTION_HOTKEYS) {
      if (!this._panelHotkeyEnabled(a)) continue
      if (!matchPanelHotkeyKeys(event, this._panelHotkeyKeys(a))) continue
      const pane = this._resolveContextHotkeyPane(a)
      if (!this._contextHotkeyReady(a, pane)) continue
      event.preventDefault()
      event.stopPropagation()
      this.contextMenuPane = pane
      if (SftpFloatingPanel._CTX_HOTKEYS_NEED_ENTRY.has(a)) {
        const sel = pane === 'local' ? this.selectedLocal : this.selectedRemote
        this.contextMenuEntry = (sel[0] as any) ?? null
      }
      this.onContextMenuAction(a as ContextMenuAction)
      return
    }

    // 键入定位：未命中其它热键时，按文件名前缀跳转选中
    // ★ issue #24：仅当面板文件列表自身获得焦点时才消费空格/字母；
    //   面板仅"拥有剪贴板热键"而未获焦点的场景（如刚点过面板又切回终端）不吞字符，交还终端。
    if (this._isPanelDomFocused() && this._tryTypeAheadFind(event)) return
  }

  /** 清空键入定位缓冲区 */
  private _clearTypeAhead(): void {
    this._typeAheadBuf = ''
    this._typeAheadLastHitPrefix = ''
    if (this._typeAheadResetTimer) {
      clearTimeout(this._typeAheadResetTimer)
      this._typeAheadResetTimer = null
    }
  }

  private _bumpTypeAheadTimer(): void {
    if (this._typeAheadResetTimer) clearTimeout(this._typeAheadResetTimer)
    this._typeAheadResetTimer = setTimeout(() => {
      // 仅清空输入缓冲，保留 lastHit，以便超时后再敲同一前缀时跳到下一匹配
      this._typeAheadBuf = ''
      this._typeAheadResetTimer = null
    }, SftpFloatingPanel._TYPE_AHEAD_RESET_MS)
  }

  /**
   * 键入定位（type-ahead find）：连续输入字符按前缀匹配文件/文件夹名并选中。
   * - 追加字符且当前项仍匹配 → 留在当前（如 t→te 收窄）
   * - 追加后无匹配 → 用末字符重新开搜（如 de 后再按 d → 按 d 循环）
   * - 再次输入与上次相同的完整前缀 → 跳到下一个匹配
   * - 连按同一字母 → 在同前缀项之间循环
   * - 中文等 IME：keydown 在 isComposing 时忽略，由 compositionend 提交字符
   */
  private _tryTypeAheadFind(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) return false
    // IME 拼写过程中的拉丁字母/Process 键不参与定位（等 compositionend）
    if (event.isComposing || event.key === 'Process') return false
    if (event.key === 'Backspace') return false

    // 单字符可打印；排除 Enter/Tab/F 键等
    if (event.key.length !== 1) return false
    if (event.key.charCodeAt(0) < 32) return false

    // compositionend 刚提交过同一非 ASCII 字符时，跳过紧随的 keydown，避免消费两次
    if (event.key.charCodeAt(0) > 127 && Date.now() - this._typeAheadLastComposeAt < 80) {
      event.preventDefault()
      event.stopPropagation()
      return true
    }

    event.preventDefault()
    event.stopPropagation()
    return this._typeAheadConsumeChar(event.key)
  }

  /** IME 上屏（中文/日文/韩文等）：提交的正文参与键入定位 */
  @HostListener('window:compositionend', ['$event'])
  onTypeAheadCompositionEnd(ev: CompositionEvent): void {
    if (!this._isPanelActive) return
    if (this._isPanelModalOpen()) return
    const el = document.activeElement as HTMLElement | null
    if (el && this.elRef?.nativeElement?.contains(el)) {
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as any).isContentEditable) return
    }
    const data = (ev.data || '').normalize('NFC')
    if (!data) return
    this._typeAheadLastComposeAt = Date.now()
    for (const ch of data) {
      if (ch.charCodeAt(0) < 32) continue
      this._typeAheadConsumeChar(ch)
    }
  }

  /** 将一个字符写入键入定位缓冲并选中匹配项 */
  private _typeAheadConsumeChar(rawCh: string): boolean {
    const side = this._arrowNavPane || this._resolveTargetPane()
    if (!side) return false
    const ch = rawCh.normalize('NFC')
    if (!ch) return false

    const prev = this._typeAheadBuf
    let mode: 'append' | 'cycle' | 'fresh' = 'fresh'
    if (!prev) {
      this._typeAheadBuf = ch
      mode = 'fresh'
    } else if (prev.length === 1 && this._typeAheadNorm(prev) === this._typeAheadNorm(ch)) {
      mode = 'cycle'
    } else {
      this._typeAheadBuf = prev + ch
      mode = 'append'
    }
    this._bumpTypeAheadTimer()
    let hit = this._applyTypeAhead(side, mode)
    // 追加后全表仍无匹配：
    // - 原前缀已 ≥2 字符再按新键（如 de→ded）：用末字符重新开搜（继续按 d 循环）
    // - 原前缀仅 1 字符（如 d→de 且无 de*）：撤回该键，留在当前，避免误跳到 e*
    if (!hit && mode === 'append') {
      if (prev.length >= 2) {
        this._typeAheadBuf = ch
        this._applyTypeAhead(side, 'fresh')
      } else {
        this._typeAheadBuf = prev
      }
    }
    return true
  }

  private _typeAheadNorm(s: string): string {
    return s.normalize('NFC').toLocaleLowerCase()
  }

  /** @returns 是否找到并选中了匹配项 */
  private _applyTypeAhead(side: 'local' | 'remote', mode: 'append' | 'cycle' | 'fresh'): boolean {
    const prefix = this._typeAheadNorm(this._typeAheadBuf)
    if (!prefix) return false

    const pick = <T extends { name: string; fullPath: string }>(
      list: T[],
      selectedPaths: Set<string>,
    ): number => {
      if (!list.length) return -1
      const cur = selectedPaths.size > 0
        ? list.findIndex(e => e.fullPath === [...selectedPaths][0])
        : -1
      const currentMatches = cur >= 0 && this._typeAheadNorm(list[cur].name || '').startsWith(prefix)
      const lastHit = this._typeAheadLastHitPrefix

      const findFrom = (start: number): number => {
        for (let i = start; i < list.length; i++) {
          if (this._typeAheadNorm(list[i].name || '').startsWith(prefix)) return i
        }
        return -1
      }
      const nextAfterCurrent = (): number => {
        if (cur < 0) return findFrom(0)
        let idx = findFrom(cur + 1)
        if (idx < 0) idx = findFrom(0)
        return idx
      }

      if (mode === 'cycle') return nextAfterCurrent()

      // 追加收窄：当前仍匹配则留下（t→te）；敲完与上次相同完整前缀则下一个
      if (mode === 'append' && currentMatches) {
        if (prefix === lastHit) return nextAfterCurrent()
        return cur
      }
      // 当前不匹配更长前缀 → 在全列表中查找（勿直接失败，否则会误用末字符重搜）
      if (mode === 'append') return findFrom(0)

      // fresh：当前已匹配则下一个；否则从头找
      if (currentMatches) return nextAfterCurrent()
      return findFrom(0)
    }

    if (side === 'local') {
      const list = this.getFilteredLocalEntries()
      if (!list || !list.length) return false
      const idx = pick(list, this._localSelectedPaths)
      if (idx < 0) return false
      if (this.selectedRemote.length) this.selectedRemote = []
      this.selectedLocal = [list[idx]]
      this.localLastSelectedIndex = idx
      this._arrowNavPane = 'local'
      this._typeAheadLastHitPrefix = prefix
      this.syncPaneSelectionVisual('local')
      this._safeDetect()
      this._scrollEntryIntoView('local', list[idx], 'center')
      return true
    }

    const list = this.getFilteredRemoteEntries()
    if (!list || !list.length) return false
    const idx = pick(list, this._remoteSelectedPaths)
    if (idx < 0) return false
    if (this.selectedLocal.length) this.selectedLocal = []
    this.selectedRemote = [list[idx]]
    this.remoteLastSelectedIndex = idx
    this._arrowNavPane = 'remote'
    this._typeAheadLastHitPrefix = prefix
    this.syncPaneSelectionVisual('remote')
    this._safeDetect()
    this._scrollEntryIntoView('remote', list[idx], 'center')
    return true
  }

  localDelete(): void { this._paneDelete('local', false) }
  remoteNewFolder(): void {
    if (!this.connected) return
    this.openInputDialog('remote-mkdir', this.i18n.t('app.newFolder'), '', '', this.remotePath)
  }
  remoteNewFile(): void {
    if (!this.connected) return
    this.openInputDialog('remote-touch', this.i18n.t('app.newFile'), '', '', this.remotePath)
  }
  remoteRename(): void {
    if (this.selectedRemote.length !== 1 || !this.connected) return
    this.openInputDialog('remote-rename', this.i18n.t('app.rename'), this.selectedRemote[0].name, this.selectedRemote[0].name, '', this.selectedRemote[0].fullPath)
  }
  remoteDelete(): void { this._paneDelete('remote') }

  private _paneDelete(side: 'local' | 'remote', forcePermanent?: boolean): void {
    const sel = side === 'local' ? this.selectedLocal : this.selectedRemote
    if (!sel.length) return
    // 本地文件：默认移入回收站（Delete 键），Shift+Delete 或右键菜单+永久删除走永久删除
    // 远程文件只能永久删除（SFTP 无回收站概念）
    this.deleteToTrash = side === 'local' && !(forcePermanent ?? false)
    if (side === 'local') this.pendingLocalDelete = sel.slice() as LocalEntry[]
    else this.pendingRemoteDelete = sel.slice() as SFTPFile[]
    this.prepareDeleteConfirm(sel, side)
    this.deleteConfirmVisible = true
  }
  remoteChmod(): void {
    if (this.selectedRemote.length !== 1) return
    this.openPermDialog(this.selectedRemote[0])
  }

  private openInputDialog(mode: NonNullable<SftpFloatingPanel['inputDialogMode']>, title: string, placeholder: string, value: string, targetPath: string, remotePath?: string): void {
    this.inputDialogMode = mode
    this.inputDialogTitle = title
    this.inputDialogPlaceholder = placeholder
    this.inputDialogValue = value
    this.inputDialogTargetPath = targetPath
    this.inputDialogRemotePath = remotePath ?? null
    this.inputDialogVisible = true
    // 输入框聚焦交给 sftp-input-dialog 组件自身处理（visible 变 true 时聚焦输入框）
  }

  cancelInputDialog(): void { this.inputDialogVisible = false; this.inputDialogMode = null; this.inputDialogValue = '' }

  /** 准备删除确认对话框的显示内容 */
  private prepareDeleteConfirm(entries: Array<LocalEntry | SFTPFile>, side: 'local' | 'remote'): void {
    this.deleteItemLocation = this._deleteTargetsLocation(entries, side)
    if (entries.length === 1) {
      const e = entries[0]
      this.deleteConfirmBatch = false
      this.deleteItemName = e.name
      this.deleteItemIsDir = e.isDirectory
      this.deleteItemType = e.isDirectory ? '' : this.getFileTypeName(e.name)
      const size = (e as any).size
      this.deleteItemSize = e.isDirectory ? null : (size != null ? this.formatFileSize(size) : null)
      const mtime = (e as SFTPFile).modified ?? ((e as LocalEntry).mtimeMs ? new Date((e as LocalEntry).mtimeMs!) : null)
      this.deleteItemDate = mtime ? this.formatDeleteDate(mtime) : ''
    } else {
      this.deleteConfirmBatch = true
      const count = entries.length
      this.batchDeleteText = this.i18n.t('app.deleteConfirmMultiple').replace('{count}', String(count))
    }
  }

  /**
   * ★ 2026-09-21 P0 修复：算出删除目标所在目录，供确认框展示。
   * 不用 localPath/remotePath，而是从条目自身的 fullPath 反推——这样即使选择模型
   * 与当前目录不一致（残留、外部改动），对话框显示的也是真实删除位置。
   * 目录不唯一时并列展示，避免「看着像当前目录」而误删。
   */
  private _deleteTargetsLocation(entries: Array<LocalEntry | SFTPFile>, side: 'local' | 'remote'): string {
    const dirname = side === 'local' ? path.dirname.bind(path) : path.posix.dirname.bind(path.posix)
    const dirs: string[] = []
    for (const e of entries) {
      if (!e?.fullPath) continue
      const d = dirname(e.fullPath)
      if (!dirs.includes(d)) dirs.push(d)
    }
    if (!dirs.length) return ''
    return dirs.length === 1 ? dirs[0] : dirs.join('  |  ')
  }

  /** 根据文件扩展名获取类型描述 */
  getFileTypeName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
      txt: this.i18n.t('fileType.txt'),
      log: this.i18n.t('fileType.log'),
      md: this.i18n.t('fileType.md'),
      json: this.i18n.t('fileType.json'),
      xml: this.i18n.t('fileType.xml'),
      yml: this.i18n.t('fileType.data'),
      yaml: this.i18n.t('fileType.data'),
      cfg: this.i18n.t('fileType.config'),
      ini: this.i18n.t('fileType.config'),
      toml: this.i18n.t('fileType.config'),
      js: this.i18n.t('fileType.js'),
      ts: this.i18n.t('fileType.ts'),
      jsx: this.i18n.t('fileType.js'),
      tsx: this.i18n.t('fileType.ts'),
      py: this.i18n.t('fileType.code'),
      java: this.i18n.t('fileType.code'),
      cpp: this.i18n.t('fileType.code'),
      c: this.i18n.t('fileType.code'),
      h: this.i18n.t('fileType.code'),
      go: this.i18n.t('fileType.code'),
      rs: this.i18n.t('fileType.code'),
      rb: this.i18n.t('fileType.code'),
      php: this.i18n.t('fileType.code'),
      html: this.i18n.t('fileType.html'),
      htm: this.i18n.t('fileType.html'),
      css: this.i18n.t('fileType.css'),
      scss: this.i18n.t('fileType.css'),
      less: this.i18n.t('fileType.css'),
      vue: this.i18n.t('fileType.code'),
      svelte: this.i18n.t('fileType.code'),
      png: this.i18n.t('fileType.image'),
      jpg: this.i18n.t('fileType.image'),
      jpeg: this.i18n.t('fileType.image'),
      gif: this.i18n.t('fileType.image'),
      svg: this.i18n.t('fileType.image'),
      ico: this.i18n.t('fileType.image'),
      bmp: this.i18n.t('fileType.image'),
      webp: this.i18n.t('fileType.image'),
      pdf: this.i18n.t('fileType.doc'),
      doc: this.i18n.t('fileType.doc'),
      docx: this.i18n.t('fileType.doc'),
      xls: this.i18n.t('fileType.doc'),
      xlsx: this.i18n.t('fileType.doc'),
      ppt: this.i18n.t('fileType.doc'),
      pptx: this.i18n.t('fileType.doc'),
      zip: this.i18n.t('fileType.archive'),
      rar: this.i18n.t('fileType.archive'),
      tar: this.i18n.t('fileType.archive'),
      gz: this.i18n.t('fileType.archive'),
      '7z': this.i18n.t('fileType.archive'),
      bz2: this.i18n.t('fileType.archive'),
      mp3: this.i18n.t('fileType.audio'),
      wav: this.i18n.t('fileType.audio'),
      flac: this.i18n.t('fileType.audio'),
      ogg: this.i18n.t('fileType.audio'),
      mp4: this.i18n.t('fileType.video'),
      avi: this.i18n.t('fileType.video'),
      mkv: this.i18n.t('fileType.video'),
      mov: this.i18n.t('fileType.video'),
      exe: this.i18n.t('fileType.executable'),
      dll: this.i18n.t('fileType.executable'),
      so: this.i18n.t('fileType.executable'),
      sh: this.i18n.t('fileType.executable'),
      bat: this.i18n.t('fileType.executable'),
      sql: this.i18n.t('fileType.data'),
      db: this.i18n.t('fileType.data'),
      sqlite: this.i18n.t('fileType.data'),
      iso: this.i18n.t('fileType.archive'),
      img: this.i18n.t('fileType.archive'),
      env: this.i18n.t('fileType.config'),
      pem: this.i18n.t('fileType.cert'),
      key: this.i18n.t('fileType.cert'),
      crt: this.i18n.t('fileType.cert'),
      lock: this.i18n.t('fileType.config'),
      gitignore: this.i18n.t('fileType.config'),
      dockerfile: this.i18n.t('fileType.config'),
    }
    return map[ext] || (ext ? `${ext.toUpperCase()} ${this.i18n.t('fileType.unknown')}` : this.i18n.t('fileType.unknown'))
  }

  /** 格式化文件大小 */
  formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = Math.floor(Math.log(bytes) / Math.log(1024))
    if (i >= units.length) i = units.length - 1
    const val = bytes / Math.pow(1024, i)
    return `${val >= 10 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
  }

  /** 格式化日期为删除对话框显示格式 */
  formatDeleteDate(d: Date): string {
    return formatDate(d.getTime())
  }

  async confirmInputDialog(): Promise<void> {
    if (!this.inputDialogVisible || !this.inputDialogMode || this._inputBusy) return
    const mode = this.inputDialogMode
    const rawVal = this.inputDialogValue.trim()
    const tp = this.inputDialogTargetPath
    const rp = this.inputDialogRemotePath
    if (!rawVal || !tp && !rp) return

    // chmod 不走文件名净化
    const val = mode === 'remote-chmod' ? rawVal : (safeEntryName(rawVal) || '')
    if (mode !== 'remote-chmod' && !val) {
      this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000)
      return
    }

    this._inputBusy = true
    try {
      switch (mode) {
        case 'local-mkdir': {
          const existing = safeJoinUnder(tp!, val, false)
          if (!existing) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          let exType: 'file' | 'dir' | null = null
          try { const st = await fs.stat(existing); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
          if (exType === 'dir') { this._showInputConflict('dir-dup', val); break }
          if (exType === 'file') { this._showInputConflict('file-when-mkdir', val); break }
          await fs.mkdir(existing, { recursive: true }); this.cancelInputDialog(); await this.refreshLocal(); break
        }
        case 'local-rename': {
          const newPath = safeJoinUnder(this.localPath, val, false)
          if (!newPath) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          if (newPath !== tp) {
            let exType: 'file' | 'dir' | null = null
            try { const st = await fs.stat(newPath); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
            if (exType === 'dir') { this._showInputConflict('dir-dup', val); break }
            if (exType === 'file') { this._showInputConflict('file-dup', val); break }
          }
          await fs.rename(tp!, newPath); this.cancelInputDialog(); await this.refreshLocal(); break
        }
        case 'remote-mkdir': {
          if (!this.sftpSession) return
          const dest = safeJoinUnder(tp!, val, true)
          if (!dest) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          const r = await this._remoteEntryExists(tp!, val)
          if (r.isDirectory) { this._showInputConflict('dir-dup', val); break }
          if (r.exists) { this._showInputConflict('file-when-mkdir', val); break }
          await this.sftpSession.mkdir(dest); this.cancelInputDialog(); await this.refreshRemote(); break
        }
        case 'local-touch': {
          const newPath = safeJoinUnder(tp!, val, false)
          if (!newPath) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          let exType: 'file' | 'dir' | null = null
          try { const st = await fs.stat(newPath); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
          if (exType === 'dir') { this._showInputConflict('dir-when-touch', val); break }
          if (exType === 'file') { this._showInputConflict('file-dup', val); break }
          await fs.writeFile(newPath, ''); this.cancelInputDialog(); await this.refreshLocal(); break
        }
        case 'remote-touch': {
          if (!this.sftpSession) return
          const dest = safeJoinUnder(tp!, val, true)
          if (!dest) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          const r = await this._remoteEntryExists(tp!, val)
          if (r.isDirectory) { this._showInputConflict('dir-when-touch', val); break }
          if (r.exists) { this._showInputConflict('file-dup', val); break }
          const touchTmp = path.join(os.tmpdir(), `sftp-touch-${Date.now()}`)
          await fs.writeFile(touchTmp, '')
          const touchUp = new LocalPathFileUpload(touchTmp)
          try {
            await this.sftpSession.upload(dest, touchUp as any)
          } finally {
            await fs.unlink(touchTmp).catch(() => {})
          }
          this.cancelInputDialog(); await this.refreshRemote(); break
        }
        case 'remote-rename': {
          if (!this.sftpSession) return
          const newPath = safeJoinUnder(this.remotePath, val, true)
          if (!newPath) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          if (newPath !== rp) {
            const r = await this._remoteEntryExists(this.remotePath, val)
            if (r.isDirectory) { this._showInputConflict('dir-dup', val); break }
            if (r.exists) { this._showInputConflict('file-dup', val); break }
          }
          await this.sftpSession.rename(rp!, newPath); this.cancelInputDialog(); await this.refreshRemote(); break
        }
        case 'remote-chmod':
          if (!this.sftpSession) return
          if (!/^[0-7]{3,4}$/.test(val)) return
          const m = parseInt(val, 8)
          if (!isNaN(m)) { await this.sftpSession.chmod(rp!, m); this.cancelInputDialog(); await this.refreshRemote() }
          break
      }
    } catch (e) {
      log.error('Operation failed', e)
      const reason = (e as Error)?.message || String(e)
      const mode = this.inputDialogMode || ''
      // 失败时不关闭对话框，便于用户改个名字/路径立即重试
      if (mode.includes('rename')) {
        this.showToast(this.i18n.t('op.renameFailed', { reason }), 4000)
      } else if (mode.includes('mkdir')) {
        this.showToast(this.i18n.t('op.mkdirFailed', { reason }), 4000)
      } else if (mode.includes('touch')) {
        this.showToast(this.i18n.t('op.touchFailed', { reason }), 4000)
      } else if (mode.includes('chmod')) {
        this.showToast(this.i18n.t('op.chmodFailed', { reason }), 4000)
      } else {
        this.showToast(this.i18n.t('op.failed', { reason }), 4000)
      }
    } finally {
      this._inputBusy = false
    }
  }

  /**
   * 输入对话框冲突提示：在对话框上方 toast 提示，不清对话框，用户可立即改名字
   * kind 说明见上面 switch 里的调用注释
   */
  private _showInputConflict(kind: 'dir-dup' | 'file-dup' | 'file-when-mkdir' | 'dir-when-touch', val: string): void {
    const key = kind === 'dir-dup' ? 'input.dirExists'
      : kind === 'file-dup' ? 'input.fileExists'
      : kind === 'file-when-mkdir' ? 'input.fileWhenMkdir'
      : 'input.dirWhenTouch'
    // ★ 统一用面板顶部 toast，不关对话框
    this.showToast(this.i18n.t(key, { val }), 3000)
  }

  async confirmDelete(): Promise<void> {
    // ★ 2026-08-26 C4：单飞 + 立即冻结 pending，防止 Enter 双通道并行删除
    if (this._deleteBusy) return
    this._deleteBusy = true
    this.deleteConfirmVisible = false
    const localPending = this.pendingLocalDelete.slice()
    const remotePending = this.pendingRemoteDelete.slice()
    this.pendingLocalDelete = []
    this.pendingRemoteDelete = []
    const failed: string[] = []
    const trashFailed: string[] = []  // 回收站失败（不回退永久删除）
    try {
      if (localPending.length) {
        if (this.deleteToTrash) {
          // 移入回收站：优先 Electron shell.trashItem；失败再走 Windows 安全回退。
          // 不再使用 powershell -EncodedCommand（会被 360 等误报为「命令执行攻击」）。
          for (const e of localPending) {
            try {
              await trashLocalPath(e.fullPath, !!(e as any).isDirectory)
            } catch (err) {
              trashFailed.push(e.fullPath)
              log.error('trash failed for', e.fullPath, err)
            }
          }
        } else {
          // ★ 2026-08-11 提速：目录优先 Node 原生 fs.rm（比 JS 层逐文件删快得多），
          //   失败再回退并发递归以收集失败明细；多项并行，共享同一限制器
          const delLim = new ConcurrencyLimiter(8)
          await Promise.all(localPending.map(async (e) => {
            if ((e as any).isDirectory) {
              try { await fs.rm(e.fullPath, { recursive: true, force: true }); return }
              catch (err) { log.warn('fs.rm failed, fallback to recursive:', e.fullPath, err) }
            }
            await deleteLocalRecursive(e.fullPath, failed, 0, delLim)
          }))
        }
        await this.refreshLocal(); this.selectedLocal = []
      }
      if (remotePending.length && this.sftpSession) {
        // ★ 2026-08-11 提速：目录优先服务端 `rm -rf` 整目录删除（SSH exec 可用时），
        //   不可用/失败自动回退 SFTP 并发递归删除；多项并行，共享同一限制器
        const delLim = new ConcurrencyLimiter(8)
        await Promise.all(remotePending.map(async (e) => {
          if ((e as any).isDirectory && await tryRemoteRmViaSsh(this.sshSession, e.fullPath)) return
          await deleteRemoteRecursive(this.sftpSession, e.fullPath, failed, 0, delLim)
        }))
        await this.refreshRemote(); this.selectedRemote = []
      }
    } catch (e) { log.error('Delete failed', e) }
    finally { this._deleteBusy = false }
    if (failed.length) {
      this.showToast(this.i18n.t('notify.deleteFailed', { n: failed.length }), 4000)
    }
    if (trashFailed.length) {
      this.showToast(
        this.i18n.t('notify.trashFailed', { n: trashFailed.length })
          || `有 ${trashFailed.length} 项移入回收站失败，文件未被删除（请尝试 Shift+Delete 永久删除）`,
        6000,
      )
    }
  }

  cancelDelete(): void {
    this.deleteConfirmVisible = false
    this.pendingLocalDelete = []
    this.pendingRemoteDelete = []
    this._deleteBusy = false
  }

  // ========== 书签 ==========

  // ========== 传输日志 ==========
  get transferLogTotalCount(): number {
    return this.transferLog.filter({
      profileName: this.profile?.name || undefined,
    }).length
  }

  /**
   * 可清除的记录数（该连接下**已结束**的记录，排除正在传输中的 pending）。
   * ★ 2026-09-26：「清除」按钮据此禁用——没有记录、或只剩下正在传输中的条目时
   *   都不该让按钮可点（点了也清不掉任何东西）。
   */
  get transferLogClearableCount(): number {
    return this.transferLog.countClearable(this.profile?.name || undefined)
  }

  get filteredTransferLogs(): TransferLogEntry[] {
    const filter: {
      operation?: TransferLogEntry['operation']
      success?: boolean
      profileName?: string
      since?: number
      until?: number
    } = {
      operation: this.logFilterOp || undefined,
      profileName: this.profile?.name || undefined,
      ...this._getLogTimeBounds(),
    }
    if (this.logFilterStatus === 'success') filter.success = true
    else if (this.logFilterStatus === 'failed') filter.success = false
    return this.transferLog.filter(filter)
  }

  private _getLogTimeBounds(): { since?: number; until?: number } {
    const now = Date.now()
    switch (this.logFilterTimeRange) {
      case 'today': {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        return { since: start.getTime(), until: now }
      }
      case '7d':
        return { since: now - 7 * 24 * 60 * 60 * 1000, until: now }
      case '30d':
        return { since: now - 30 * 24 * 60 * 60 * 1000, until: now }
      case 'custom': {
        const bounds: { since?: number; until?: number } = {}
        if (this.logFilterDateFrom) bounds.since = this._parseLogDateStart(this.logFilterDateFrom)
        if (this.logFilterDateTo) bounds.until = this._parseLogDateEnd(this.logFilterDateTo)
        return bounds
      }
      default:
        return {}
    }
  }

  private _parseLogDateStart(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }

  private _parseLogDateEnd(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
  }

  /** 切换传输记录对话框（打开时强制刷新日志，防止多面板/标签间 localStorage 数据不同步） */
  toggleTransferLog(): void {
    if (!this.showTransferLog) {
      // 即将打开 → 先从 localStorage 重新加载最新日志
      this.transferLog.reload()
      this._safeDetect()
    }
    this.showTransferLog = !this.showTransferLog
  }

  exportLog(): void {
    const json = this.transferLog.exportAsJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `sftp-plus-log-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    // ★ BUG-16 修复：延迟释放 Blob URL，确保浏览器有足够时间完成下载
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  clearLog(): void {
    const profileName = this.profile?.name
    // ★ 2026-09-26：没有「可清除记录」时直接返回（无记录 / 只剩下正在传输中的条目）。
    //   按钮已 disabled，这里再兜一层：避免键盘触发或程序化调用弹出一个「什么都清不掉」的确认框。
    if (this.transferLogClearableCount <= 0) return
    if (!confirm(this.i18n.t('transfer.clearConfirm'))) return
    if (profileName) {
      this.transferLog.clearProfile(profileName)
    } else {
      this.transferLog.clear()
    }
  }

  // ========== 右键菜单 ==========
  onLocalContextMenu(entry: LocalEntry, ev: MouseEvent): void { this._onPaneContextMenu('local', entry, ev) }
  onRemoteContextMenu(entry: SFTPFile, ev: MouseEvent): void { this._onPaneContextMenu('remote', entry, ev) }

  private _onPaneContextMenu(side: 'local' | 'remote', entry: { fullPath: string }, ev: MouseEvent): void {
    this._rubberBand.clearContextMenuSuppress()
    if (this._rubberBand.active) { ev.preventDefault(); return }
    if (this._rubberBand.skipNextContextMenu) { ev.preventDefault(); return }
    ev.preventDefault()
    ev.stopPropagation()
    this.headerMenuVisible = false
    this.headerMenuCol = null
    if (side === 'local') {
      if (this.localClickTimer) { clearTimeout(this.localClickTimer); this.localClickTimer = null }
      if (!this._localSelectedPaths.has(entry.fullPath)) {
        this.selectedLocal = [entry as any]; this.selectedRemote = []
        this.localLastSelectedIndex = this.getFilteredLocalEntries().findIndex(e => e.fullPath === entry.fullPath)
      }
    } else {
      if (this.remoteClickTimer) { clearTimeout(this.remoteClickTimer); this.remoteClickTimer = null }
      if (!this._remoteSelectedPaths.has(entry.fullPath)) {
        this.selectedRemote = [entry as any]; this.selectedLocal = []
        this.remoteLastSelectedIndex = this.getFilteredRemoteEntries().findIndex(e => e.fullPath === entry.fullPath)
      }
    }
    this.syncPaneSelectionVisual(side)
    this.zone.run(() => {
      this.closeBookmarks()
      this.contextMenuPane = side
      this.contextMenuEntry = entry as any
      this.contextMenuX = ev.clientX
      this.contextMenuY = ev.clientY
      this.contextMenuVisible = true
      this._safeDetect()
      this.fixContextMenuPosition(ev.clientX, ev.clientY)
    })
  }

  /** 渲染后测量实际菜单尺寸并修正位置，防止超出视口 */
  private fixContextMenuPosition(anchorX: number, anchorY: number): void {
    // 使用微任务等待 DOM 更新完成
    setTimeout(() => {
      const menuEl = this.elRef.nativeElement.querySelector('.context-menu') as HTMLElement | null
      if (!menuEl || !this.contextMenuVisible) return
      const rect = menuEl.getBoundingClientRect()
      const margin = 8
      let x = anchorX
      let y = anchorY

      // ★ BUG-12 修复：优先使用 visualViewport API（支持 DPI 缩放、多显示器、移动端键盘弹出等场景）
      const vv = (window as any).visualViewport
      const vw = vv ? vv.width : window.innerWidth
      const vh = vv ? vv.height : window.innerHeight

      // 右边界：超出则向左偏移
      if (x + rect.width > vw - margin) {
        x = Math.max(margin, vw - rect.width - margin)
      }
      // 下边界：超出则向上弹出
      if (y + rect.height > vh - margin) {
        y = Math.max(margin, vh - rect.height - margin)
      }
      // 保卫左/上边界
      if (x < margin) x = margin
      if (y < margin) y = margin

      if (x !== this.contextMenuX || y !== this.contextMenuY) {
        this.contextMenuX = x
        this.contextMenuY = y
        this._safeDetect()
      }
    }, 0)
  }

  /** 面板滚动时关闭右键菜单 */
  onPaneScroll(): void {
    if (this.contextMenuVisible) {
      this.contextMenuVisible = false
      this.contextMenuEntry = null
    }
    if (this.headerMenuVisible) {
      this.headerMenuVisible = false
      this.headerMenuCol = null
    }
  }

  closeContextMenu(): void {
    this.contextMenuVisible = false
    this.contextMenuEntry = null
  }

  ctxNewFolder(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localNewFolder()
    else this.remoteNewFolder()
  }

  ctxNewFile(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localNewFile()
    else this.remoteNewFile()
  }

  ctxRename(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localRename()
    else this.remoteRename()
  }

  ctxDelete(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.localDelete()
    else this.remoteDelete()
  }

  ctxRefresh(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') this.refreshLocal()
    else this.refreshRemote()
  }

  ctxSelectAll(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') {
      const all = this.getFilteredLocalEntries()
      this.selectedLocal = this.selectedLocal.length === all.length ? [] : [...all]
    } else {
      const all = this.getFilteredRemoteEntries()
      this.selectedRemote = this.selectedRemote.length === all.length ? [] : [...all]
    }
  }

  /** 反选：选中当前未选的条目，取消已选的条目 */
  ctxSelectInvert(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'local') {
      const all = this.getFilteredLocalEntries()
      this.selectedLocal = all.filter(e => !this._localSelectedPaths.has(e.fullPath))
    } else {
      const all = this.getFilteredRemoteEntries()
      this.selectedRemote = all.filter(e => !this._remoteSelectedPaths.has(e.fullPath))
    }
    this.syncPaneSelectionVisual(this.contextMenuPane)
  }

  ctxCopyPath(): void {
    const pane = this.contextMenuPane
    const selected = pane === 'local' ? this.selectedLocal : this.selectedRemote
    const paths = (selected.length > 0 ? selected : (this.contextMenuEntry ? [this.contextMenuEntry] : []))
      .map(e => this.getEntryPath(e))
      .filter(Boolean)
    if (paths.length && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(paths.join(' ')).then(() => {
        this._notifyPathCopied(paths.length)
      }).catch(() => {})
    }
    this.closeContextMenu()
  }

  private _notifyPathCopied(count: number): void {
    this.showToast(this.i18n.t('notify.pathCopied', { n: count }))
  }

  /** 面板顶部轻提示（替代 Tabby 底部通知） */
  showToast(message: string, ms?: number): void {
    this.toastMessage = message
    const base = ms ?? (message.length > 40 ? 4500 : 2200)
    this._toastDurationMs = base
    this._toastHovering = false
    this._armToastDismiss()
    try { this._safeDetect() } catch {}
  }

  /**
   * 顶层通知：调用 Tabby 的 NotificationsService.error/info，不论面板是否可见都显示在主窗口顶部
   * 用于冲突提示等关键错误，UX 更明显
   */
  showTopNotification(message: string, kind: 'error' | 'warning' = 'error', detail = ''): void {
    try {
      this.notifications?.[kind]?.(message, detail)
    } catch { /* 兜底仍显示面板内 toast */
      this.showToast(message, 3000)
    }
  }

  onToastMouseEnter(): void {
    this._toastHovering = true
    if (this.toastTimer) {
      clearTimeout(this.toastTimer)
      this.toastTimer = null
    }
  }

  onToastMouseLeave(): void {
    this._toastHovering = false
    if (this.toastMessage) this._armToastDismiss()
  }

  private _toastDurationMs = 2200
  private _toastHovering = false

  private _armToastDismiss(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      if (this._toastHovering) return
      this.toastMessage = ''
      this.toastTimer = null
      try { this._safeDetect() } catch {}
    }, this._toastDurationMs)
  }

  /** 右键菜单 → 更改权限（仅远程） */
  ctxChmod(): void {
    this.closeContextMenu()
    if (this.selectedRemote.length === 1) {
      this.openPermDialog(this.selectedRemote[0])
    }
  }

  /** 右键菜单 → 打开（文件夹：进入目录；文件：系统默认程序） */
  ctxOpenLocal(): void {
    // ★ 2026-09-20：快捷键路径可能无右键 entry，回退到本地选中项
    const entry = (this.contextMenuEntry as LocalEntry | null)
      || (this.selectedLocal.length === 1 ? this.selectedLocal[0] : null)
    this.closeContextMenu()
    if (!entry?.fullPath) return
    if (entry.isDirectory || this.isDirByMode(entry.mode)) {
      this.openLocal(entry)
      return
    }
    this._openPathInSystem(entry.linkTarget || entry.fullPath)
  }

  /** 右键菜单 → 打开本地文件（用系统默认程序） */
  ctxOpenLocalFile(): void {
    this.ctxOpenLocal()
  }

  /** 右键菜单 → 在文件管理器中显示 */
  ctxRevealInExplorer(): void {
    const entry = this.contextMenuEntry as LocalEntry
    const filePath = entry?.linkTarget || entry?.fullPath
    this.closeContextMenu()
    if (!filePath) return
    log.info('Reveal in explorer:', filePath)
    try {
      const { shell } = require('electron')
      shell.showItemInFolder(filePath)
    } catch (e) {
      log.error('Reveal in explorer failed:', e)
    }
  }

  /** 检查当前右键菜单面板是否有选中项 */
  hasContextSelection(): boolean {
    return this.contextMenuPane === 'local' ? this.selectedLocal.length > 0 : this.selectedRemote.length > 0
  }

  /** 获取当前上下文的选中项列表 */
  private getContextSelection(): (LocalEntry | SFTPFile)[] {
    return this.contextMenuPane === 'local' ? this.selectedLocal : this.selectedRemote
  }

  /** 获取修饰键名称（macOS=Cmd，其他=Ctrl） */
  get modKey(): string {
    return os.platform() === 'darwin' ? '⌘' : 'Ctrl+'
  }

  /** 获取 entry 的路径 */
  getEntryPath(e: LocalEntry | SFTPFile): string { return (e as LocalEntry).fullPath ?? (e as SFTPFile).fullPath ?? '' }

  /** 获取 entry 的大小 */
  getEntrySize(e: LocalEntry | SFTPFile): number | undefined { return (e as LocalEntry).size ?? (e as SFTPFile).size ?? undefined }

  /** 获取 entry 的修改时间（毫秒） */
  getEntryMtime(e: LocalEntry | SFTPFile): number | undefined {
    if (this.detailsIsLocal) return (e as LocalEntry).mtimeMs
    const m = (e as SFTPFile).modified
    return m ? m.getTime() : undefined
  }

  /** 获取 entry 的 mode */
  getEntryMode(e: LocalEntry | SFTPFile): number | undefined { return (e as LocalEntry).mode ?? (e as SFTPFile).mode ?? undefined }

  /** 获取 entry 的 owner */
  getEntryOwner(e: LocalEntry | SFTPFile): string | undefined {
    const o = (e as LocalEntry).owner ?? (e as SFTPFile).owner
    return o != null ? String(o) : undefined
  }

  /** 获取 entry 的 group */
  getEntryGroup(e: LocalEntry | SFTPFile): string | undefined {
    const g = (e as LocalEntry).group ?? (e as SFTPFile).group
    return g != null ? String(g) : undefined
  }

  /** 获取 entry 的创建时间（毫秒），仅本地文件有 */
  getEntryBirthtimeMs(e: LocalEntry | SFTPFile): number | undefined {
    if (!this.detailsIsLocal) return undefined
    return (e as LocalEntry).birthtimeMs ?? undefined
  }

  /** 获取 entry 的访问时间（毫秒） */
  getEntryAtimeMs(e: LocalEntry | SFTPFile): number | undefined {
    const local = (e as LocalEntry).atimeMs
    if (local != null) return local
    return (e as SFTPFile).atimeMs
  }

  /** 获取文件扩展名 */
  getFileExt(name: string): string {
    const i = name.lastIndexOf('.')
    return i > 0 ? name.substring(i + 1).toUpperCase() : ''
  }

  // ========== 详细信息 ==========
  ctxDetails(): void {
    // ★ 2026-09-20：快捷键路径无右键 entry（关菜单会清空 contextMenuEntry），回退到当前侧选中项
    const pane = this.contextMenuPane
    const selected = pane === 'local' ? this.selectedLocal : this.selectedRemote
    const entry = (this.contextMenuEntry as LocalEntry | SFTPFile | null)
      || (selected.length ? selected[0] : null)
    if (!entry) return
    this.detailsEntry = entry
    this.detailsIsLocal = pane === 'local'
    // ★ 2026-08-11：每次打开重置大小计算状态（token 递增使在途扫描作废）
    this.detailsCalcState = 'idle'
    this.detailsCalcResult = null
    this.detailsCalcToken++
    this.detailsVisible = true
    this.closeContextMenu()
  }

  /** ★ 2026-08-11：按需计算文件夹真实大小（复用传输预扫描的并发扫描实现） */
  async onDetailsCalcSize(): Promise<void> {
    const e = this.detailsEntry
    if (!e || !e.isDirectory || this.detailsCalcState === 'calculating') return
    const target = this.getEntryPath(e)
    const isLocal = this.detailsIsLocal
    const token = ++this.detailsCalcToken
    this.detailsCalcState = 'calculating'
    this.detailsCalcResult = null
    this._safeDetect()
    try {
      const r = isLocal ? await this._scanLocalDir(target) : await this._scanRemoteDir(target)
      if (token !== this.detailsCalcToken || !this.detailsVisible) return
      this.detailsCalcResult = this.i18n.t('file.folderSizeDetail', { size: this.formatSize(r.size), count: r.count })
      this.detailsCalcState = 'idle'
    } catch {
      if (token !== this.detailsCalcToken || !this.detailsVisible) return
      this.detailsCalcState = 'error'
    }
    this._safeDetect()
  }

  canViewEntry(entry: LocalEntry | SFTPFile | null): boolean {
    if (!entry || (entry as any).isDirectory) return false
    return isViewableRemoteFileType(
      entry.name,
      this.getCustomEditableExtensions(),
      this.getAllowViewEditAllFiles(),
    )
  }

  canEditEntry(entry: LocalEntry | SFTPFile | null): boolean {
    if (!entry || (entry as any).isDirectory) return false
    return this.isFileNameEditable(entry.name)
  }

  get viewerShowSystemAction(): boolean {
    return !!this.viewerSystemPath && !this.viewerError && !this.viewerLoading
  }

  get editorShowSystemAction(): boolean {
    return !!this.editorLocalPath && !this.editorError && !this.editorLoading
  }

  // ========== 传输目标目录预检（2026-09-28） ==========
  // 用户反馈：默认上传/下载路径不存在时传输直接失败（远程 readdir 抛错 / 本地 ENOENT），
  // 应在传输前检测并询问「是否创建」。每批传输只询问一次；目录存在时零打扰。

  /**
   * 传输前目标目录预检：存在且为目录 → 原样返回；不存在 → 弹三选一确认框。
   * @returns 可用的目标目录；用户取消或创建失败时返回 null（调用方应放弃本批传输）
   */
  private async _ensureTransferTargetDir(direction: 'upload' | 'download', requestedDir: string): Promise<string | null> {
    const isRemote = direction === 'upload'
    const fallbackDir = isRemote ? this.remotePath : this.localPath
    const dir = requestedDir?.trim() || fallbackDir
    let exists = false
    let isDir = false
    try {
      if (isRemote) {
        // 远程走 statRemotePath（已处理 russh 数字 type / 包装层 stat 差异）
        const st = this.sftpSession ? await statRemotePath(this.sftpSession, dir) : null
        exists = !!st
        isDir = !!st?.isDirectory
      } else {
        const st = await fs.stat(dir).catch(() => null)
        exists = !!st
        isDir = !!st?.isDirectory()
      }
    } catch {
      exists = false
    }
    if (exists && isDir) return dir
    if (exists && !isDir) {
      // 路径存在但不是目录：无法「创建」，直接提示后取消
      this.showToast(this.i18n.t('app.targetNotDir', { dir }), 4000)
      return null
    }
    const choice = await this._askDirMissing(dir, isRemote, dir !== fallbackDir)
    if (choice === 'cancel') return null
    if (choice === 'fallback') return fallbackDir
    // create：远程逐级创建，本地 recursive 一步到位
    try {
      if (isRemote) {
        await this._remoteMkdirp(dir)
      } else {
        await fs.mkdir(dir, { recursive: true })
      }
      this.showToast(this.i18n.t('app.dirCreated', { dir }))
      return dir
    } catch (e) {
      const reason = (e as Error)?.message || String(e)
      log.error('create target dir failed:', dir, reason)
      this.showToast(this.i18n.t('app.mkdirpFailed', { reason }), 4000)
      return null
    }
  }

  /** 弹出「目录不存在」三选一确认框并等待用户选择 */
  private _askDirMissing(dir: string, isRemote: boolean, showFallback: boolean): Promise<'create' | 'fallback' | 'cancel'> {
    return new Promise((resolve) => {
      this.dirMissingDir = dir
      this.dirMissingIsRemote = isRemote
      this.dirMissingShowFallback = showFallback
      this.dirMissingVisible = true
      this._dirMissingResolve = resolve
      this._safeDetect()
    })
  }

  /** 目录不存在对话框选择回调（模板绑定） */
  resolveDirMissing(c: 'create' | 'fallback' | 'cancel'): void {
    this.dirMissingVisible = false
    const resolve = this._dirMissingResolve
    this._dirMissingResolve = null
    resolve?.(c)
    this._safeDetect()
  }

  /**
   * 远程逐级创建目录（mkdir -p 语义）：逐段 stat，已存在的目录段跳过；
   * 中间段存在但非目录、或最终复核失败均抛错。SFTP 服务端均为 POSIX 路径。
   */
  private async _remoteMkdirp(dir: string): Promise<void> {
    const session = this.sftpSession
    if (!session) throw new Error('no sftp session')
    const norm = path.posix.normalize(String(dir).replace(/\/+$/, '') || '/')
    if (!norm || norm === '/') return
    const parts = norm.split('/').filter(Boolean)
    let cur = ''
    for (const seg of parts) {
      cur += '/' + seg
      const st = await statRemotePath(session, cur).catch(() => null)
      if (st?.isDirectory) continue
      if (st) throw new Error(`not a directory: ${cur}`)
      await session.mkdir(cur)
    }
    const finalSt = await statRemotePath(session, norm).catch(() => null)
    if (!finalSt?.isDirectory) throw new Error(`verify failed: ${norm}`)
  }

  async ctxUpload(): Promise<void> {
    this.closeContextMenu()
    if (!this.connected || !this.sftpSession) {
      this.showToast(this.i18n.t('notify.notConnectedUpload'))
      return
    }
    const items = this.getContextSelection() as LocalEntry[]
    if (!items.length) return
    // ★ 2026-08-10：并行入队（非串行 await），全部条目立即预注册到传输列表，
    //   实际并发由 _streamUploadOne 内部调度泵限制；默认上传路径（远程目标目录）优先
    // ★ 2026-09-28：入队前预检目标目录（默认路径可能不存在）——不存在时弹框询问
    //   创建/回退当前目录/取消，避免整批上传直接失败（远程 readdir 抛错）
    const requestedUploadDir = this._defaultUploadPath || this.remotePath
    const uploadDir = await this._ensureTransferTargetDir('upload', requestedUploadDir)
    if (!uploadDir) return
    // ★ 2026-09-29（四）：多选先试「整批打一个包」。返回 true 表示已接管（含仅 TAR 下的硬失败），
    //   此时**必须直接收工**——再走下面的逐项入队会把整批重传一遍。
    if (await this._tryBatchUpload(items.map(e => e.fullPath), uploadDir)) {
      await this.refreshRemote()
      this._safeDetect()
      return
    }
    await Promise.all(items.map(e => this._streamUploadOne(e.fullPath, uploadDir)))
    await this.refreshRemote()
    this._safeDetect()
  }

  async ctxDownload(): Promise<void> {
    this.closeContextMenu()
    if (!this.connected || !this.sftpSession) {
      this.showToast(this.i18n.t('notify.notConnectedDownload'))
      return
    }
    const items = this.getContextSelection() as SFTPFile[]
    if (!items.length) return
    // ★ 2026-08-10：并行入队（非串行 await），全部条目立即预注册到传输列表，
    //   实际并发由 _streamDownloadOne 内部调度泵限制；默认下载路径（本地目标目录）优先
    // ★ 2026-09-28：入队前预检目标目录（默认路径可能不存在，如 D:\Downloads 被删/换盘）
    //   ——不存在时弹框询问 创建/回退当前目录/取消，避免整批下载 ENOENT 失败
    const requestedDownloadDir = this._defaultDownloadPath || this.localPath
    const downloadDir = await this._ensureTransferTargetDir('download', requestedDownloadDir)
    if (!downloadDir) return
    await Promise.all(items.map(p => this._streamDownloadOne(p, downloadDir)))
    if (this._conflictQueue.length) this._showConflictDialog()
    // ★ 2026-08-11：与上传对称——下载完成后自动刷新本地面板（拖拽路径在 drop.ts 已刷新，
    //   菜单路径此前漏刷；冲突分支由冲突解决器 refreshPanes 兼顾）
    await this.refreshLocal()
    this._safeDetect()
  }

  // ========== 下载队列调度（多选拖拽/菜单下载） ==========

  /** 同时进行中的下载数上限（设置页可改，1-10），避免一次拖入大量文件时打开过多 SFTP 读流 */
  private _downloadConcurrency = 3
  private _dlActiveCount = 0
  private _dlQueue: Array<{ file: SFTPFile; entry: PanelTransferItem; finish: () => void }> = []

  /**
   * 边下载边检测冲突：无冲突立即传输，有冲突入队等待用户处理。
   * ★ 2026-08-10：调用时先预注册 queued 占位条目，多选/拖拽的全部文件立即出现在
   *   传输列表中；真正开始传输时由 trackTransfer/_startFolderTransfer 认领占位条目，
   *   并发由 _downloadConcurrency 限制。
   */
  private _streamDownloadOne(p: SFTPFile, targetLocalDir?: string): Promise<void> {
    const safeName = safeEntryName(p.name)
    if (!safeName) {
      log.warn('skip download with unsafe name:', p.name)
      return Promise.resolve()
    }
    // 默认下载路径优先；未设置则回退当前本地目录（保证右键/拖拽/旧API 统一走默认路径）
    const localDir = (targetLocalDir?.trim()) || this._defaultDownloadPath || this.localPath
    const localTarget = path.join(localDir, safeName)
    const logEntry = this.transferLog.add({
      operation: 'download',
      localPath: localTarget,
      remotePath: p.fullPath,
      profileName: this.profile?.name || undefined,
      success: true,
      size: p.size ?? 0,
      duration: 0,
      startTime: Date.now(),
      pending: true,
    })
    const entry: PanelTransferItem = {
      transfer: null, direction: 'download', name: safeName,
      remotePath: p.fullPath, localPath: localTarget,
      percent: 0, speed: '', bytesDone: 0, bytesTotal: p.size ?? 0,
      paused: false, queued: true, logEntryId: logEntry.id,
      isFolder: p.isDirectory,
    }
    this.transfers.push(entry)
    this.transfersMinimized = false
    this.transfersHidden = false
    this._safeDetect()
    return new Promise<void>((resolve) => {
      const finish = () => {
        // 传输结束仍处排队态 ⇒ 未真正开始；自动跳过（skippedAsDuplicate）保留为「已跳过 · 内容相同」展示一段后再移除
        if (entry.queued && this.transfers.includes(entry)) {
          if (entry.skippedAsDuplicate) {
            entry.queued = false
            entry.percent = 100
            entry.speed = ''
            // 短暂保留传输列表展示后自动移除（_removeQueuedEntry 保留日志不删）
            // ★ 2026-09-20 A2：改走可清理的定时器（原裸 setTimeout 无句柄，面板销毁后仍会对已销毁视图 detectChanges）
            this._scheduleQueuedEntryRemoval(entry)
          } else {
            this._removeQueuedEntry(entry)
          }
        }
        resolve()
      }
      this._dlQueue.push({ file: p, entry, finish })
      this._pumpDownloadQueue()
    })
  }

  /** 调度泵：活跃下载数未达上限时出队启动下一个 */
  private _pumpDownloadQueue(): void {
    while (this._dlActiveCount < this._downloadConcurrency && this._dlQueue.length) {
      const item = this._dlQueue.shift()!
      this._dlActiveCount++
      void this._runQueuedDownload(item)
    }
  }

  private async _runQueuedDownload(
    item: { file: SFTPFile; entry: PanelTransferItem; finish: () => void },
  ): Promise<void> {
    try {
      // 条目可能在排队期间被用户取消/清空 ⇒ 不再执行
      if (this.transfers.includes(item.entry)) {
        // ★ 2026-08-24：从 entry.localPath 提取目标目录传给执行层（修复右键下载默认路径不生效：
        //   ctxDownload 正确计算了 downloadDir 但此前 streamDownloadOne 只传 file 未传目标 dir，
        //   导致 DownloadOneUseCase.execute 回退到 host.localPath 即当前面板目录）
        const targetDir = item.entry.localPath ? path.dirname(item.entry.localPath) : undefined
        await this._transferCoordinator.streamDownloadOne(item.file, targetDir)
      }
    } catch (e) {
      log.error('Queued download failed for', item.file.fullPath, e)
    } finally {
      // ★ BUG-7 修复：先递减计数器再启动调度泵，避免调度泵异常导致计数器不一致
      this._dlActiveCount--
      item.finish()
      try { this._pumpDownloadQueue() } catch (e) { log.error('Pump download queue failed', e) }
    }
  }

  /** 移除未真正开始的排队占位条目及其占位日志 */
  private _removeQueuedEntry(entry: PanelTransferItem): void {
    // ★ 2026-09-20 A2：面板已销毁时不得再碰视图/状态（延迟移除定时器与异步 finish 都可能晚到）
    if (!this._isAlive) return
    if (!this.transfers.includes(entry)) return
    this.transfers = this.transfers.filter(x => x !== entry)
    // ★ 2026-09-07 issue #15+：已被标记为「自动跳过」的条目，日志保留（让传输记录 UI 能看到「已跳过 · 内容相同」）
    if (entry.logEntryId != null && !entry.skippedAsDuplicate) {
      try { this.transferLog.remove(entry.logEntryId) } catch { /* ignore */ }
    }
    this._safeDetect()
  }

  /**
   * ★ 2026-09-07 issue #15+：被协调器通知「内容已确认相同，自动跳过」时同步回调，
   * 把对应传输条目标为已跳过、并把对应 logEntry 标 skippedAsDuplicate=true。
   * 注意：协调器在 await use case resolve **之前** 同步触发本回调——比 finish() 早，
   * 因此 finish() 检测 entry.skippedAsDuplicate 即可识别「没真传输」状态。
   */
  private _markTransferAsSkipped(info: AutoSkippedInfo): void {
    const entry = this.transfers.find(e =>
      e.direction === info.direction
      && e.remotePath === info.remotePath
      && e.localPath === info.localPath,
    )
    if (!entry) {
      // ★ 2026-09-21 P2 修复：右键单文件上传/下载走 uploadTopLevel/downloadTopLevel，
      //   auto-skip 发生在 trackTransfer 之前 → 列表无占位条目可标，此前完全静默
      //   （无条目、无日志、无提示）。落一条「已跳过 · 内容相同」日志让用户可见。
      log.warn('[auto-skip] no matching transfer entry for:', info.remotePath)
      try {
        const now = Date.now()
        this.transferLog.add({
          operation: info.direction,
          localPath: info.localPath,
          remotePath: info.remotePath,
          profileName: this.profile?.name || undefined,
          success: true,
          duration: 0,
          startTime: now,
          endTime: now,
          pending: false,
          skippedAsDuplicate: {
            reason: 'content-identical',
            algo: this._conflictDigestAlgo,
            at: now,
          },
        })
      } catch (e) {
        log.warn('[auto-skip] fallback log add failed:', e)
      }
      return
    }
    entry.skippedAsDuplicate = true
    if (entry.logEntryId != null) {
      try {
        const now = Date.now()
        const start = this.transferLog.getAll().find(l => l.id === entry.logEntryId)?.startTime ?? now
        this.transferLog.update(entry.logEntryId, {
          success: true,
          pending: false,
          endTime: now,
          duration: Math.max(0, now - start),
          skippedAsDuplicate: {
            reason: 'content-identical',
            algo: this._conflictDigestAlgo,
            at: now,
          },
        })
      } catch (e) {
        log.warn('[auto-skip] transferLog.update failed:', e)
      }
    }
    this._safeDetect()
  }

  // ========== 上传队列调度（多选右键/拖拽上传） ==========

  /** 同时进行中的上传数上限（设置页可改，1-10） */
  private _uploadConcurrency = 3
  /** ★ 2026-09-28：传输通道模式（smart/sftpOnly/tarOnly/preferSftp/preferTar） */
  private _transferChannelMode = 'smart'
  /** ★ 2026-09-07 issue #15：冲突内容摘要设置（识别「mtime 变了但内容没变」，避免误报冲突） */
  private _conflictDigestEnabled = true
  private _conflictAutoSkipSameContent = true
  private _conflictDigestMaxSizeMB = 256
  private _conflictDigestAlgo: 'sha1' | 'sha256' = 'sha1'
  /** 面板侧摘要服务（粘贴冲突框补算）；配置变更时重建 */
  private _panelDigestSvc: ContentDigestService | null = null
  private _panelDigestSvcKey = ''
  private _upActiveCount = 0
  private _upQueue: Array<{ localPath: string; entry: PanelTransferItem; finish: () => void; remoteDir: string }> = []

  /**
   * ★ 2026-09-20：为冲突对话框补算两端内容摘要（粘贴/同栏冲突入队时通常未计算）。
   *
   * ★ 2026-09-29 修复「同栏冲突的源侧摘要永远是 —」：本方法原先把 localPath 一律当本地、remotePath
   *   一律当远端（按**字段名**选通道），但**同栏粘贴**时这两个字段装的是**同一侧**的两个路径
   *   （paste._buildFileConflictItem：localPath=目标、remotePath=源）——
   *   - local→local：remotePath 是本地源路径 → 对 Windows 路径跑 `sha1sum`，远端必然报
   *     `sha1sum: ...: No such file or directory`（实测 log：「execSshCommand empty output (retried)」
   *     +「[digest] remote digest output parse failed」）→ 源侧显示「—」；
   *   - remote→remote：localPath 是远端目标路径 → 本地读盘 ENOENT（实测 log：「[digest] local
   *     digest failed」）→ 目标侧显示「—」。
   *   两侧因此**必有一端**拿不到摘要。现按 samePaneSource 判定两端的**实际所在侧**再选通道；
   *   跨栏（上传/下载）两字段天然分居两侧，行为与原先一致（samePaneSource 缺省即走原逻辑）。
   */
  private async _computeConflictDigests(args: {
    localPath: string
    remotePath: string
    localSize?: number
    localMtime?: number
    remoteSize?: number
    remoteMtime?: number
    /** ★ 同栏冲突时的源侧：'local'/'remote' 表示两端同处本地或同处远端 */
    samePaneSource?: 'local' | 'remote'
  }): Promise<{ localDigest: string | null; remoteDigest: string | null }> {
    if (!this._conflictDigestEnabled) return { localDigest: null, remoteDigest: null }
    const key = `${this._conflictDigestAlgo}|${this._conflictDigestMaxSizeMB}`
    if (!this._panelDigestSvc || this._panelDigestSvcKey !== key) {
      this._panelDigestSvc = new ContentDigestService(() => this.sshSession ?? null, {
        algo: this._conflictDigestAlgo,
        maxBytes: this._conflictDigestMaxSizeMB * 1024 * 1024,
      })
      this._panelDigestSvcKey = key
    }
    const svc = this._panelDigestSvc
    // 同栏：两端同侧 —— 源侧字段(remotePath)与目标侧字段(localPath)都按 samePaneSource 选通道；
    // 跨栏（samePaneSource 缺省）：源侧走远端、目标侧走本地（原逻辑）。
    const samePaneSource = args.samePaneSource
    const hashSource = (p: string, size?: number, mtime?: number) =>
      samePaneSource === 'local' ? svc.localDigest(p, size, mtime) : svc.remoteDigest(p, size, mtime)
    const hashTarget = (p: string, size?: number, mtime?: number) =>
      samePaneSource === 'remote' ? svc.remoteDigest(p, size, mtime) : svc.localDigest(p, size, mtime)
    try {
      const [localDigest, remoteDigest] = await Promise.all([
        args.localPath ? hashTarget(args.localPath, args.localSize, args.localMtime) : Promise.resolve(null),
        args.remotePath ? hashSource(args.remotePath, args.remoteSize, args.remoteMtime) : Promise.resolve(null),
      ])
      return { localDigest, remoteDigest }
    } catch (e) {
      log.warn('[conflict-digest] compute failed:', e)
      return { localDigest: null, remoteDigest: null }
    }
  }
  /**
   * ★ 2026-09-29（四）：多选批量上传 —— 先试「整批打成**一个**归档」。
   *
   * 为什么需要这一层：多选在面板里被拆成 N 个独立任务（各自预注册占位条目、各自占队列槽），
   * 于是选中的文件夹各自打一个包、散装文件恒走逐文件 ——
   * 「一次选一批小文件」反而完全用不上打包通道，而它正是该通道的主场。
   *
   * 返回 true 表示本批已由打包通道处理（成功，或仅 TAR 模式下的硬失败），调用方**必须直接收工**
   * ——绝不能继续逐项入队，否则整批会被重传一遍。返回 false 表示未接管，按原样逐项处理。
   *
   * 入口共三处（右键/菜单上传、拖拽的两个 payload 分支），全部经由本方法：
   * 「多选」这个事实只有这一处被翻译成批量请求，避免三条链各自判断而行为不一致。
   */
  private async _tryBatchUpload(localPaths: string[], remoteDir: string): Promise<boolean> {
    if (localPaths.length < 2) return false
    // 危险条目名（. / .. / 含分隔符 / 控制字符）直接放弃整批 —— 不做「过滤掉危险项后凑一批」，
    // 那会让用户以为整批都传了。逐项路径本来就会各自 skip 并留日志，交回给它更诚实。
    for (const p of localPaths) {
      if (!safeEntryName(path.basename(p))) return false
    }
    let label: string
    try {
      label = this.i18n.t('transfer.batchUpload', {
        n: localPaths.length,
        dir: path.basename(path.dirname(localPaths[0])) || path.dirname(localPaths[0]),
      })
    } catch {
      // i18n 不可用不该阻断传输：退化成语言中性的「父目录名 (项数)」
      label = `${path.basename(remoteDir)} (${localPaths.length})`
    }
    try {
      return await this._transferCoordinator.uploadBatchToRemote(localPaths, remoteDir, label)
    } catch (e) {
      log.warn('[batch-upload] batch path unavailable, using per-file flow:', e)
      return false
    }
  }

  /**
   * ★ 2026-08-10：与 _streamDownloadOne 对称——调用时先预注册 queued 占位条目，
   *   多选/拖拽的全部条目立即出现在传输列表中；真正开始传输时由
   *   trackTransfer/_startFolderTransfer 认领占位条目，并发由 _uploadConcurrency 限制。
   */
  private _streamUploadOne(localPath: string, targetRemoteDir?: string): Promise<void> {
    const base = path.basename(localPath)
    const safeName = safeEntryName(base)
    if (!safeName) {
      log.warn('skip upload with unsafe name:', base)
      return Promise.resolve()
    }
    let isFolder = false
    let size = 0
    try {
      const st = fsSync.statSync(localPath)
      isFolder = st.isDirectory()
      size = isFolder ? 0 : (st.size || 0)
    } catch { /* stat 失败按文件处理，上传时由用例内 lstat 再次校验 */ }
    // 默认上传路径（远程目标目录）优先；未设置则回退当前远程目录
    const remoteDir = targetRemoteDir?.trim() || this.remotePath
    const remoteTarget = path.posix.join(remoteDir, safeName)
    const logEntry = this.transferLog.add({
      operation: 'upload',
      localPath,
      remotePath: remoteTarget,
      profileName: this.profile?.name || undefined,
      success: true,
      size,
      duration: 0,
      startTime: Date.now(),
      pending: true,
    })
    const entry: PanelTransferItem = {
      transfer: null, direction: 'upload', name: safeName,
      remotePath: remoteTarget, localPath,
      percent: 0, speed: '', bytesDone: 0, bytesTotal: size,
      paused: false, queued: true, logEntryId: logEntry.id,
      isFolder,
    }
    this.transfers.push(entry)
    this.transfersMinimized = false
    this.transfersHidden = false
    this._safeDetect()
    return new Promise<void>((resolve) => {
      const finish = () => {
        // 传输结束仍处排队态 ⇒ 未真正开始；自动跳过（skippedAsDuplicate）保留为「已跳过 · 内容相同」展示一段后再移除
        if (entry.queued && this.transfers.includes(entry)) {
          if (entry.skippedAsDuplicate) {
            entry.queued = false
            entry.percent = 100
            entry.speed = ''
            // 短暂保留传输列表展示后自动移除（_removeQueuedEntry 保留日志不删）
            // ★ 2026-09-20 A2：改走可清理的定时器（原裸 setTimeout 无句柄，面板销毁后仍会对已销毁视图 detectChanges）
            this._scheduleQueuedEntryRemoval(entry)
          } else {
            this._removeQueuedEntry(entry)
          }
        }
        resolve()
      }
      this._upQueue.push({ localPath, entry, finish, remoteDir })
      this._pumpUploadQueue()
    })
  }

  /** 调度泵：活跃上传数未达上限时出队启动下一个 */
  private _pumpUploadQueue(): void {
    while (this._upActiveCount < this._uploadConcurrency && this._upQueue.length) {
      const item = this._upQueue.shift()!
      this._upActiveCount++
      void this._runQueuedUpload(item)
    }
  }

  private async _runQueuedUpload(
    item: { localPath: string; entry: PanelTransferItem; finish: () => void; remoteDir: string },
  ): Promise<void> {
    try {
      // 条目可能在排队期间被用户取消/清空 ⇒ 不再执行
      if (this.transfers.includes(item.entry)) {
        // 使用入队时记录的目标远程目录（默认上传路径优先，否则当前远程目录）
        await this.uploadPathToRemote(item.remoteDir, item.localPath)
      }
    } catch (e) {
      log.error('Queued upload failed for', item.localPath, e)
    } finally {
      // ★ BUG-7 修复：先递减计数器再启动调度泵，避免调度泵异常导致计数器不一致
      this._upActiveCount--
      item.finish()
      try { this._pumpUploadQueue() } catch (e) { log.error('Pump upload queue failed', e) }
    }
  }


  // ========== 剪贴板操作 ==========
  ctxClipboardCopy(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'copy'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    this.showToast(this.i18n.t('notify.copied', { n: count }))
    log.info(`Copy ${count} items from ${this.clipboardSource}`)
  }

  ctxClipboardCut(): void {
    this.clipboardEntries = this.getContextSelection().slice()
    this.clipboardSource = this.contextMenuPane
    this.clipboardMode = 'cut'
    this.closeContextMenu()
    const count = this.clipboardEntries.length
    this.showToast(this.i18n.t('notify.cut', { n: count }))
    log.info(`Cut ${count} items from ${this.clipboardSource}`)
  }

  async ctxClipboardPaste(): Promise<void> {
    if (!this.clipboardEntries.length) return
    this.closeContextMenu()
    const destPane = this.contextMenuPane
    const destPath = destPane === 'local' ? this.localPath : this.remotePath
    const entries = this.clipboardEntries.slice()
    const mode = this.clipboardMode
    const source = this.clipboardSource

    log.info(`Paste ${entries.length} items (${mode}) from ${source} to ${destPane}`)
    this.clipboardEntries = []

    await this._pasteAdapter.paste(
      entries.map(e => ({
        name: e.name,
        fullPath: (e as LocalEntry).fullPath ?? (e as SFTPFile).fullPath,
        isDirectory: e.isDirectory,
        mode: (e as SFTPFile).mode,
        size: (e as any).size,
        mtimeMs: (e as any).mtimeMs,
      })),
      destPane, destPath, mode, source,
    )
  }

  /** 待粘贴的临时状态（冲突解决前暂存） */
  private _pendingPasteEntries: (LocalEntry | SFTPFile)[] = []
  private _pendingPasteDestPane: 'local' | 'remote' = 'local'
  private _pendingPasteDestPath = ''
  private _pendingPasteMode: 'copy' | 'cut' = 'copy'
  private _pendingPasteSource: 'local' | 'remote' = 'local'
  /** 冲突对话框中已处理的文件名集合（用于粘贴时过滤） */
  private _conflictResolvedKeys = new Set<string>()

  /** 执行实际粘贴操作（冲突解决后由 resolver 调用） */
  private async _executePaste(
    entries: (LocalEntry | SFTPFile)[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    return this._pasteAdapter.executePaste(
      entries.map(e => ({
        name: e.name,
        fullPath: (e as LocalEntry).fullPath ?? (e as SFTPFile).fullPath,
        isDirectory: e.isDirectory,
        mode: (e as SFTPFile).mode,
        size: (e as any).size,
        mtimeMs: (e as any).mtimeMs,
      })),
      destPane, destPath, mode, source,
    )
  }

  /**
   * 递归下载远程目录到本地（整个目录记一条日志，内部文件不单独记录）
   * 修改人：DD1024z + Deepseek-V4-Pro
   * 修改时间：2026-07-01 — 添加文件夹级进度追踪，显示当前文件及完成数
   */
  private async downloadRemoteDir(
    remoteSrc: string, localDest: string, destPane: 'local' | 'remote',
    _top?: FolderTransferCtx,
    _localName?: string,
    /**
     * ★ 2026-09-25 P0-2 修复：**此前漏了本形参**（且 TS 对「实参多、形参少」不报错，静默吞掉）——
     *   用户选「覆盖」时 `forceOverwrite` 到不了用例层，`DownloadDirUseCase` 照常对每个子文件
     *   做冲突检测：已存在的本地子文件重新入队 → `markHadConflict(ctx)` → 收尾
     *   `finish(ctx, success && !hadConflict)` 把**整个目录记成失败**。
     *   症状：远程→本地下载、目标文件夹已存在时选「覆盖」必失败。此参数须**原样转发**给协调器。
     */
    _forceOverwrite?: boolean,
  ): Promise<boolean> {
    // ★ 2026-09-25 P1：仅顶层调用做重复入队只读预检（真正的槽位由协调器认领/释放；
    //   嵌套子目录/冲突覆盖重入必须放行）。本地目标与 DownloadDirUseCase 一致
    const slotName = _localName || path.posix.basename(remoteSrc)
    const slotLocal = path.join(localDest, slotName)
    if (!_top && this._blockDuplicateTransfer('download', remoteSrc, slotLocal, slotName)) return false
    // ★ BUG-2 修复：为每个传输任务创建独立的 cancelRef，避免并发任务互相影响
    const cancelRef = { current: null as any, active: new Set<any>() }
    this._cancelRefs.add(cancelRef)
    const prevRef = this._cancelRef
    this._cancelRef = cancelRef
    try {
      // ★ 2026-09-20 P1-2：把任务 ref 绑到异步调用链上（子文件流/进度条目各自解析到自己的 ref）
      return await runInTaskScope(cancelRef, () =>
        this._transferCoordinator.downloadRemoteDir(remoteSrc, localDest, _top, _localName, _forceOverwrite))
    } finally {
      this._cancelRefs.delete(cancelRef)
      if (this._cancelRef === cancelRef) this._cancelRef = prevRef
      if (this._cancelRef && !this._cancelRef.current && !(this._cancelRef.active?.size)) this._cancelRef = null
    }
  }

  // ========== 全局事件 ==========
  /** 返回当前面板是否处于可见且可交互状态 */
  private get _isPanelActive(): boolean {
    // 面板最小化时不响应快捷键
    if (this.minimized) return false
    // 面板挂载在当前终端 tab 的 DOM 内；tab 未激活时 Tabby 会隐藏其 DOM（display:none），
    // 此时面板虽“存在”但不可见、不可交互（如切到设置页、切到其它终端 tab），
    // 全局 keydown 仍会冒泡触发，故需检测面板根元素是否真实可见。
    const el = this.elRef?.nativeElement as HTMLElement | null
    if (!el || el.getClientRects().length === 0) return false
    return true
  }

  /** ★ 2026-08-26：查看/编辑/删除/输入/冲突等模态打开时，面板热键应短路 */
  private _isPanelModalOpen(): boolean {
    return !!(
      this.viewerVisible ||
      this.editorVisible ||
      this.deleteConfirmVisible ||
      this.inputDialogVisible ||
      this.showConflictDialog ||
      this.detailsVisible ||
      this.showTransferLog ||
      this.showBookmarks ||
      // ★ 2026-09-20：权限/CWD 此前漏计，打开时 Delete/F5 仍会穿透
      this.showPermDialog ||
      this.cwdSetupVisible
    )
  }

  /**
   * ★ 2026-09-17 issue #21：当前焦点是否在面板内可编辑控件（不含 xterm 隐藏 textarea）。
   */
  private _isFocusInPanelEditable(): boolean {
    const el = document.activeElement as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    const editable = tag === 'TEXTAREA' || tag === 'INPUT' || !!(el as any).isContentEditable
    if (!editable) return false
    if (el.closest?.('.xterm')) return false
    return !!this.elRef?.nativeElement?.contains(el)
  }

  /** 焦点是否落在面板 DOM 内（含面板根 tabindex，不含仅「面板开着」） */
  private _isPanelDomFocused(): boolean {
    const a = document.activeElement as HTMLElement | null
    const r = this.elRef?.nativeElement as HTMLElement | null
    return !!(a && r && r.contains(a))
  }

  /**
   * ★ 2026-09-17：捕获阶段拦截剪贴板类快捷键，避免 Tabby/xterm 先于面板收到。
   * - 查看/编辑器打开，或焦点在面板输入框：挡终端（可编辑时不 preventDefault，保留原生复制）
   * - 焦点在面板文件列表/根节点，或**刚在面板点过（owns）**：
   *   挡终端并执行面板复制/剪切/粘贴/全选
   *   （window 捕获阶段 stopImmediatePropagation 后，document 冒泡里的 onGlobalKeyDown 收不到事件）
   *
   * ★ 2026-09-20：owns + 焦点在 xterm 时按键分流，勿一刀切「无选中就清 owns」——
   *   那会把随后的 Ctrl+V / Ctrl+A 一并废掉（点过面板但尚未选中、或粘贴前已取消选中时必现）。
   *   - C/X：无选中 → 交还终端（^C 中断）；有选中 → 面板复制/剪切
   *   - V：面板剪贴板有内容 → 粘贴；否则交还终端粘贴（不清 owns）
   *   - A：owns 时始终面板全选
   *
   * ★ 2026-09-29：本函数的守卫**不引入时间窗口**。焦点在面板时面板必须接管剪贴板快捷键
   *   （选中文件 → Cmd/Ctrl+C/V 是主要用法），而且这正是**有意设计**：焦点在面板里按 Ctrl+C
   *   绝不该把 ^C 打进终端、杀掉对面正在跑的命令；要发 ^C 就先点回终端。
   *   焦点在终端时由「面板外 mousedown 清 owns」+ `_isTerminalFocusTarget` 守卫保证终端侧完整可用。
   *   曾试过 4s 短窗口 → 过度修复（还收窄了面板内「慢慢选文件再 Cmd+C」的窗口），已回退。
   */
  private _shieldTerminalClipboardKeys(ev: KeyboardEvent): void {
    if (!this._isPanelActive) return
    const isMod = os.platform() === 'darwin' ? ev.metaKey : ev.ctrlKey
    if (!isMod) return
    const k = ev.key
    if (!['c', 'C', 'x', 'X', 'v', 'V', 'a', 'A'].includes(k)) return
    const kLower = k.toLowerCase()

    const inPanelEditable = this._isFocusInPanelEditable()
    const textUiOpen = !!(this.editorVisible || this.viewerVisible || this.inputDialogVisible)
    const panelFocused = this._isPanelDomFocused()
    const panelOwns = this._panelOwnsClipboardHotkeys

    // 焦点在终端、未开文本 UI、且用户未在面板内操作：放行（终端里 Ctrl+C 中断等）
    if (!panelFocused && !panelOwns && !textUiOpen && !inPanelEditable) return

    // owns 但焦点已在终端：仅 C/X 在无选中时交还；V/A 另判，绝不因「无选中」清掉 owns
    if (!panelFocused && panelOwns && !textUiOpen && !inPanelEditable) {
      if (kLower === 'c' || kLower === 'x') {
        const hasSel = this.selectedLocal.length > 0 || this.selectedRemote.length > 0
        if (!hasSel) {
          this._panelOwnsClipboardHotkeys = false
          return
        }
      } else if (kLower === 'v' && !this.clipboardEntries.length) {
        // 面板无可粘贴项 → 交给终端粘贴系统剪贴板；保留 owns，避免后续 Ctrl+A 失效
        return
      }
      // 'a' 或 'v'+有剪贴板：继续走面板
    }

    // 面板内输入框/查看器文本区：只挡 Tabby，保留浏览器原生剪贴板
    if (inPanelEditable) {
      ev.stopImmediatePropagation()
      return
    }

    // 必须在捕获阶段拦住，否则 xterm 先吃到 ^C，冒泡里再复制就变成「复制 + ^C」双触发
    ev.stopImmediatePropagation()
    ev.preventDefault()

    if ((panelFocused || panelOwns) && !textUiOpen) {
      this.zone.run(() => this._runPanelClipboardHotkey(k))
    }
  }

  /** 面板文件列表侧的 Ctrl/Cmd+C/X/V/A（由捕获屏蔽器调用） */
  private _runPanelClipboardHotkey(key: string): void {
    if (this._isPanelModalOpen()) return
    const k = key.toLowerCase()
    // ★ V/A：目标 = activePane（悬停/最后点击的一侧），勿用「有选中优先」——那会把粘贴/全选锁回复制源面板
    if (k === 'v' || k === 'a') {
      this.contextMenuPane = this.activePane
      if (k === 'v') void this.ctxClipboardPaste()
      else this.ctxSelectAll()
      return
    }
    this.contextMenuPane = this._resolveTargetPane()
    if (k === 'c') this.ctxClipboardCopy()
    else if (k === 'x') this.ctxClipboardCut()
  }

  /**
   * ★ 2026-09-17 issue #21：捕获阶段拦截 paste 事件落到面板外（终端）。
   */
  private _shieldTerminalPaste(ev: ClipboardEvent): void {
    if (!this._isPanelActive) return
    const textUiOpen = !!(this.editorVisible || this.viewerVisible || this.inputDialogVisible)
    if (!textUiOpen && !this._isFocusInPanelEditable()) return
    const t = ev.target as HTMLElement | null
    if (t && this.elRef?.nativeElement?.contains(t)) {
      const tag = t.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT' || (t as any).isContentEditable) return
    }
    // 目标不在面板可编辑控件上（常见：焦点仍在 xterm）→ 阻止粘贴进终端
    ev.preventDefault()
    ev.stopImmediatePropagation()
  }

  /** 判断焦点是否落在「正在编辑文字」的输入控件中（面板路径框/筛选框/对话框，
   *  以及面板之外的任何输入框——如设置页的时间格式输入框）。
   *  若为真则不劫持快捷键（允许正常编辑文字，Backspace/Delete 可正常删字）。
   *  唯一例外：终端 xterm 的隐藏 <textarea>（.xterm 容器内）不算「正在输入」——
   *  面板浮层打开后焦点仍在终端，若把它当输入态，面板 Backspace/Delete 快捷键会失效。
   *  修改人：DD1024z + Hy3
   *  修改时间：2026-07-23（修复：设置页等面板外输入框的 Backspace/Delete 被面板全局热键吞掉） */
  private _isPanelTyping(event: KeyboardEvent): boolean {
    const el = event.target as HTMLElement | null
    if (!el) return false
    const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as any).isContentEditable
    if (!isInput) return false
    // 面板自身的输入框 → 正在输入
    if (this.elRef?.nativeElement?.contains(el)) return true
    // 面板之外：只有终端 xterm 的隐藏 textarea 例外（继续放行快捷键），
    // 其余任何输入框（设置页、其他插件等）一律视为正在输入，不得劫持按键
    return !(typeof el.closest === 'function' && el.closest('.xterm'))
  }

  /**
   * ★ issue #24（2026-09-24）：判断按键事件是否落在终端 xterm 上。
   * 落在终端的按键（空格/字母/方向键等）一律不应被面板热键或键入定位劫持，必须透传终端，
   * 否则会出现「启用插件后无法在终端键入空格」等复现。
   */
  private _isTerminalFocusTarget(event: KeyboardEvent): boolean {
    const el = (event.target as HTMLElement | null)
      ?? (document.activeElement as HTMLElement | null)
    if (!el) return false
    return typeof el.closest === 'function' && !!el.closest('.xterm')
  }

  /** 智能判断快捷键/右键操作的目标面板
   *  - 若仅一侧有选中项 → 使用该侧
   *  - 若两侧均有/均无 → 使用 activePane（鼠标悬停的面板） */
  private _resolveTargetPane(): 'local' | 'remote' {
    if (this.selectedLocal.length > 0 && this.selectedRemote.length === 0) return 'local'
    if (this.selectedRemote.length > 0 && this.selectedLocal.length === 0) return 'remote'
    return this.activePane
  }

  /** 点击面板内任意元素时，主动管理焦点，确保面板级快捷键（后退/删除等）正常触发 */
  @HostListener('mousedown', ['$event'])
  onPanelMouseDown(event: MouseEvent): void {
    // 右键菜单已展开时，点菜单以外的区域则关闭菜单（点菜单项由自身 click 关闭）
    if (this.topBarMenuVisible && !(event.target as HTMLElement)?.closest?.('.sftp-title-menu')) {
      this.topBarMenuVisible = false
    }
    // 冒泡阶段再处理一次（捕获阶段也可能已处理；内部幂等）
    this._handlePanelPointerFocus(event)
  }

  /**
   * ★ 2026-09-17：把焦点从终端 xterm（或其它面板外元素）拉回面板。
   * Electron/Chromium 在窗口从后台激活时，常在 click 之后把焦点还原到上次焦点（终端），
   * 所以除了同步抢焦点，还要短时监听 focusin / window focus 并延迟回抢。
   */
  private _handlePanelPointerFocus(event: MouseEvent): void {
    if (event.button !== 0 && event.button !== 2) return
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return

    // 只要在面板内按下，剪贴板热键就归面板（即使焦点仍卡在 xterm）
    this._panelOwnsClipboardHotkeys = true

    const target = event.target as HTMLElement | null
    const tag = target?.tagName ?? ''
    const isInteractiveTarget = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
      tag === 'BUTTON' || !!(target as any)?.isContentEditable ||
      !!target?.closest?.('button, [role="button"], a, input, textarea, select, [contenteditable="true"]')

    const active = document.activeElement as HTMLElement | null
    const isFocusOnInput = !!active && (
      active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' || !!(active as any).isContentEditable
    )
    const focusOutside = !active || (active !== root && !root.contains(active))

    // 点击可编辑控件：让浏览器自然聚焦目标，但仍标记「需要面板焦点」，防窗口激活后被 xterm 抢走
    if (isInteractiveTarget && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(target as any)?.isContentEditable)) {
      this._markPanelFocusWanted()
      this._scheduleEnsurePanelFocus()
      return
    }

    // 焦点在面板外（如终端）→ 拉回面板根
    // ★ 2026-09-20：对话框/编辑器内焦点在 textarea 时，点标题等非交互区不再抢根焦点（否则无法继续键入）
    if (focusOutside) {
      this._stealFocusToPanelRoot()
      this._markPanelFocusWanted()
      this._scheduleEnsurePanelFocus()
      return
    }
    const inDialog = !!target?.closest?.('.overlay, .file-dialog-shell, .dialog, .conflict-dialog, sftp-editor-dialog, sftp-viewer-dialog, sftp-input-dialog, sftp-perm-dialog')
    if (isFocusOnInput && !isInteractiveTarget && !!active && root.contains(active) && !inDialog) {
      this._stealFocusToPanelRoot()
      this._markPanelFocusWanted()
      this._scheduleEnsurePanelFocus()
    }
  }

  private _markPanelFocusWanted(): void {
    this._panelFocusWantedUntil = Date.now() + 450
    this._panelOwnsClipboardHotkeys = true
  }

  private _clearPanelFocusStealTimers(): void {
    for (const t of this._panelFocusStealTimers) clearTimeout(t)
    this._panelFocusStealTimers = []
  }

  private _stealFocusToPanelRoot(): void {
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return
    const active = document.activeElement as HTMLElement | null
    if (active && active !== root && !root.contains(active)) {
      try { active.blur() } catch { /* ignore */ }
    }
    try { root.focus({ preventScroll: true }) } catch { /* ignore */ }
  }

  /** 若焦点已落在面板内（含 path/filter/对话框）则不动；否则抢回面板根 */
  private _ensurePanelFocusIfWanted(): void {
    if (Date.now() > this._panelFocusWantedUntil) return
    if (!this._isPanelActive) return
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    if (!root) return
    const active = document.activeElement as HTMLElement | null
    if (active && root.contains(active)) return
    this._stealFocusToPanelRoot()
  }

  private _scheduleEnsurePanelFocus(): void {
    this._clearPanelFocusStealTimers()
    const run = (): void => this._ensurePanelFocusIfWanted()
    run()
    try { requestAnimationFrame(run) } catch { /* ignore */ }
    for (const delay of [0, 32, 80, 160]) {
      this._panelFocusStealTimers.push(setTimeout(run, delay))
    }
  }

  private _onPanelFocusInGuard(ev: FocusEvent): void {
    if (Date.now() > this._panelFocusWantedUntil) return
    if (!this._isPanelActive) return
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    const target = ev.target as HTMLElement | null
    if (!root || !target) return
    // 焦点已进入面板 → OK；焦点被拉到面板外（典型：xterm 隐藏 textarea）→ 立刻抢回
    if (root.contains(target)) return
    this._stealFocusToPanelRoot()
  }

  private _onPanelWindowFocusGuard(): void {
    if (Date.now() > this._panelFocusWantedUntil) return
    this._scheduleEnsurePanelFocus()
  }

  /** 点击面板外（终端区）时关闭标题栏右键菜单，并取消面板焦点回抢 / 剪贴板热键接管 */
  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDownForMenu(event: MouseEvent): void {
    if (this.topBarMenuVisible) this.topBarMenuVisible = false
    const root = this.elRef?.nativeElement as HTMLElement | undefined
    const target = event.target as HTMLElement | null
    if (root && target && !root.contains(target)) {
      this._panelFocusWantedUntil = 0
      this._panelOwnsClipboardHotkeys = false
      this._clearPanelFocusStealTimers()
    }
  }

  /** 标题栏右键：打开菜单（定位到鼠标处） */
  onTopBarContextMenu(e: MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    this.topBarMenuX = e.clientX
    this.topBarMenuY = e.clientY
    this.topBarMenuVisible = true
    this._safeDetect()
  }

  /** 关闭标题栏右键菜单 */
  closeTopBarMenu(): void {
    this.topBarMenuVisible = false
  }

  /** 还原面板为默认大小（居中 96%×94%，百分比定位 → 跟随 Tabby 窗口缩放），并清掉已保存的自定义几何 */
  restoreDefaultSize(): void {
    this.topBarMenuVisible = false
    if (this.displayMode === 'workspace' || !this._hostEl) return
    this._applyDefaultGeometry()
    this._persistPanelGeometry()
  }


  /**
   * ★ 2026-09-17 PR #22（@waylandun / issue #21）：
   * 面板根节点隔离文本输入的 keydown/keyup，使事件到不了 Tabby 的 document 热键监听。
   * 不 preventDefault，保留原生粘贴/复制/撤销与 Tab 切焦点。Esc 交给 onGlobalKeyDown。
   * 与 window 捕获阶段的 _shieldTerminalClipboardKeys / _shieldTerminalPaste 叠加，
   * 覆盖「焦点还在 xterm」的 macOS 场景。
   */
  @HostListener('keydown', ['$event'])
  @HostListener('keyup', ['$event'])
  onTextInputKeyEvent(event: KeyboardEvent): void {
    if (!this._isPanelActive || event.key === 'Escape') return
    const target = event.target as HTMLElement | null
    if (!target || !this.elRef.nativeElement.contains(target)) return
    if (!this._isPanelTyping(event)) return

    event.stopPropagation()
  }

  /** 全局面板快捷键；文本输入事件已在面板根节点隔离，Esc 仍由此处处理。 */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent): void {
    if (!this._isPanelActive) return
    // ★ 焦点检测：面板获得焦点时屏蔽 Ctrl 快捷键直达终端
    const panelFocused = (() => {
      const a = document.activeElement as HTMLElement | null
      const r = this.elRef?.nativeElement as HTMLElement | null
      return !!(a && r && r.contains(a))
    })()
    if (panelFocused && (os.platform() === 'darwin' ? event.metaKey : event.ctrlKey) && ['c','C','x','X','v','V','a','A'].includes(event.key)) {
      event.stopImmediatePropagation()
    }
    // 仅当焦点位于「本面板自身」的输入框（path input、filter input、对话框等）时才视为正在输入，
    // 终端 xterm 的隐藏 textarea 在面板之外，不拦截面板快捷键；Esc 例外（查看/编辑器要能关闭）
    if (this._isPanelTyping(event) && event.key !== 'Escape') {
      // 兜底：面板内 textarea/input 的 Ctrl/Cmd+C/X/V/A 仍在 document 冒泡层切断 Tabby
      // （主路径是 onTextInputKeyEvent + window 捕获屏蔽；此处防漏）
      const isMod = os.platform() === 'darwin' ? event.metaKey : event.ctrlKey
      if (isMod && ['c','C','x','X','v','V','a','A'].includes(event.key)) {
        const el = event.target as HTMLElement | null
        if (el && this.elRef?.nativeElement?.contains(el)) {
          event.stopImmediatePropagation()
        }
      }
      return
    }

    const isMod = os.platform() === 'darwin' ? event.metaKey : event.ctrlKey
    if (!isMod) {
      // ★ 2026-08-26 C4：删除确认仅由对话框自身处理 Enter；document 层只兜底 Esc
      //   （此前对话框 emit + document 双通道会并行 confirmDelete）
      if (this.deleteConfirmVisible) {
        if (event.key === 'Escape') { event.preventDefault(); this.cancelDelete(); return }
        return
      }
      // ★ 2026-08-22 修复（issue #13 P4）：历史后退改为配置驱动（panelHotkeys.back）且
      //   仅在面板自身获得焦点时生效；焦点在终端 xterm 时让 Backspace 正常删字，不再被路径回退吞掉。
      // ★ 2026-08-31：改为多绑定匹配（键盘 + 鼠标侧键）；新增 forward，与 back 对称。
      //   排除 shiftKey：up 默认用 Shift+Backspace，避免前进/后退与之抢触发。
      if (panelFocused && !event.shiftKey) {
        // 键入定位缓冲非空时，Backspace 删缓冲字符，不触发历史后退
        if (event.key === 'Backspace' && this._typeAheadBuf) {
          event.preventDefault()
          event.stopPropagation()
          this._typeAheadBuf = this._typeAheadBuf.slice(0, -1)
          this._bumpTypeAheadTimer()
          const side = this._arrowNavPane || this._resolveTargetPane()
          if (this._typeAheadBuf && side) this._applyTypeAhead(side, 'append')
          return
        }
        const navPane = this._resolveTargetPane()
        if (this._panelHotkeyEnabled('back') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('back'))) {
          event.preventDefault()
          event.stopPropagation()
          this._clearTypeAhead()
          if (navPane === 'local') this.localBack()
          else this.remoteBack()
          return
        }
        if (this._panelHotkeyEnabled('forward') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('forward'))) {
          event.preventDefault()
          event.stopPropagation()
          this._clearTypeAhead()
          if (navPane === 'local') this.localForward()
          else this.remoteForward()
          return
        }
      }
      if (event.key === 'Escape') {
        // 键入定位有缓冲时，Esc 先清空缓冲，不关闭面板
        if (this._typeAheadBuf) {
          event.preventDefault()
          this._clearTypeAhead()
          return
        }
        // 如果 Esc 已被子组件（对话框、输入框等）preventDefault 处理，
        // 不再让面板接管，避免对话框关完后又把面板也关了
        if (event.defaultPrevented) return
        if (this.viewerVisible) {
          event.preventDefault()
          this.closeViewer()
          return
        }
        if (this.editorVisible) {
          event.preventDefault()
          this.closeEditor()
          return
        }
        // ★ 2026-09-21 P1 修复：冲突框此前不在 Esc 栈里 —— 它自己的 Esc 绑在 overlay 的
        //   (keydown) 上、靠打开时 autofocus 维持，用户一旦点了文件列表焦点就转移，
        //   Esc 冒泡到这里会直接 this.close() 关掉整个面板（连带在途批量传输）。
        if (this.showConflictDialog) { event.preventDefault(); this.resolveConflict('cancel'); return }
        if (this.cwdSetupVisible) { this.onCwdSetupChoice('cancel'); return }
        if (this.inputDialogVisible) { this.cancelInputDialog(); return }
        if (this.showBookmarks) { this.closeBookmarks(); return }
        if (this.showTransferLog) { this.showTransferLog = false; return }
        if (this.detailsVisible) { this.detailsVisible = false; return }
        if (this.showPermDialog) { this.showPermDialog = false; return }
        this.close(); return
      }
      return
    }

    if (this._isPanelTyping(event)) return

    // 查看/编辑对话框打开时，不抢占 Ctrl+A/C/X/V（由文本区原生处理），
    // 但用 stopImmediatePropagation 阻断终端连接收到 Ctrl+C/X/V/A
    if (this.viewerVisible || this.editorVisible) {
      if ((os.platform() === 'darwin' ? event.metaKey : event.ctrlKey) && ['c','C','x','X','v','V','a','A'].includes(event.key)) {
        event.stopImmediatePropagation()
      }
      return
    }

    // ★ 2026-09-20：剪贴板热键必须带修饰键，且焦点在面板或 owns（点过面板）时才处理
    //   避免捕获屏蔽失效时与终端双触发；也避免裸键 c/x/v/a 误触发复制
    //   （主路径已是 window 捕获 _shieldTerminalClipboardKeys；此处仅兜底）
    const isClipboardMod = os.platform() === 'darwin' ? event.metaKey : event.ctrlKey
    if (!isClipboardMod || !['c', 'C', 'x', 'X', 'v', 'V', 'a', 'A'].includes(event.key)) return
    if (!panelFocused && !this._panelOwnsClipboardHotkeys) return

    event.preventDefault()
    event.stopImmediatePropagation()
    this._runPanelClipboardHotkey(event.key)
  }
}

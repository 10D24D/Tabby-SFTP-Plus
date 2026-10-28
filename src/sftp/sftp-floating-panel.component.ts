/**
 * SFTP+ 浮动面板组件
 * 功能描述：纯 Angular 组件（不继承 BaseTabComponent），由装饰器动态创建为浮动 overlay
 *   双栏文件管理器（本地↔远程）、书签、传输日志、拖拽传输
 * @创建人：DD1024z + Claude
 * @创建时间：2026-06-21
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-27 — 续四十六：路径记忆写入通道补齐 —— `saveCurrentPath()` 末尾排一次落盘
 *              （`_schedulePaneFlush()`，与 `_rememberLeftPath()` 同口径 1.2s 合并写）：
 *              `_paneSet` 只写内存 + `_cache`，不落盘时只剩 localStorage 那份是新的，而
 *              `_restoreSavedRemotePath()` 走 `_paneGet`（config 优先）⇒ 下次启动被旧值压回去。
 *              并补上「联动书签跳转」这条漏掉写入的入口（见 panel-bookmark-controller.ts）。
 *              续四十五：拖拽落点收口 —— 新增设置项「拖拽只投放到当前目录」（默认开，
 *              配置键 dropToCurrentDir）：`_resolveDropDestDir` 在「跨栏 / 外部拖入 + 开关打开」时
 *              直接返回 undefined（= 目标栏当前目录），指针压在文件夹行上也不再改落点 ——
 *              原先从 A 栏拖到 B 栏手滑停在文件夹行上，文件会被静默存进那个子目录，列表毫无变化，
 *              用户以为传输失败。同栏内拖到子文件夹不受影响（复制到该目录的通用手势）。
 *              开关关闭时，拖拽期间给指针下的文件夹行加 `.drop-into` + `data-drop-hint`（「放入此
 *              文件夹」小标）显式提示去向；dragover 每帧触发 ⇒ 只在目标元素变化时动 DOM，
 *              并在 drop / dragend / 离开列表三处撤回。
 *              续四十四：⋯ 折叠菜单参与顶栏排序 —— `TopBarItemId` 新增 `'overflow'`，
 *              位置由它在 `topBarOrder` 里的下标决定（默认排在 ✕ 之前，用户可在设置页拖到任意位置）：
 *              ① `topBarInlineItems` 对 `overflow` 单开分支（它是溢出容器不是功能按钮，不受
 *              `topBarDisabled` / `topBarPinned` 影响，只看折叠总开关 + 菜单非空）；
 *              ② `topBarMenuItems` 排除 `overflow`（否则菜单里会出现「点它打开自己」的递归入口）；
 *              ③ 删除上一版的 `topBarOverflowAtEnd`（那是「⋯ 固定贴 ✕」方案的末位兜底，现已不需要）。
 *              续四十三：记忆槽身份锁定（`_hostSlotKey`）—— 原先 `_tabSlotBase()` 每次现读
 *              `this.profile`，而 `switchRemoteSession()`（右栏换连接）会改写它 ⇒ 切端点时把
 *              `endpoints/left` 写进了**另一个 perTab 槽**，重启后读回原槽的旧值 'remote'，
 *              于是又去恢复那个远程连接（用户实测「切成本地、重启后又变回等待连接」）。
 *              现在 ngOnInit 早期快照宿主槽，之后不随端点切换漂移；并加两条可 grep 诊断日志
 *              （`persist left endpoint: kind=… slot=… profileHost=…` / `restore left endpoint: slot=… kind=…`）。
 *              续四十二：左栏自动恢复的「用户抢占」收口 —— 重启 Tabby 后恢复上次远程端点期间
 *              （最多轮询 30s）用户把左栏切成「本地」，恢复流程必须立刻放弃：
 *              ① `_revertLeftToLocal()` 置 `_leftRestoreAbort`，并就地清 `_leftRestoring` 与顶栏
 *              「连接中 <目标>」（否则切完还要挂半秒「等待连接」）；
 *              ② 轮询命中连接、真正 switch 之前**再复查一次** abort（await 期间用户可能已抢占）；
 *              ③ 超时分支在 `_enterLeftDisconnectedState` **之前**判 abort —— 这一步是元凶：
 *              原先超时无条件把左栏置回「远程（已断开）」，用户实测「切成本地后那个连接又出现了」。
 *              续四十一：图钉「面板常驻」语义扩展 —— 常驻时**点面板其它位置 / 滚轮 /
 *              右键（文件条目与面板空白）/ 框选 / 窗口缩放都不再关闭**书签弹层，只有「关闭」按钮、
 *              再点一次 ★ 按钮、Esc 才关（用户要求：常驻就该待在原地）。点外部与滚轮两处**不 return**，
 *              好让右键/表头菜单照旧按「点外部关闭」收掉；缩放改为 `_clampBookmarkPopupToRoot()` 钳制。
 *              模板绑定改读控制器 getter `bookmarkPinned`（取反只在 getter 里做一次）。
 *              续四十：新增 `readConflictRenameStyle()`（冲突重命名风格 seq/time/random），
 *              由 PanelConflictResolver 经 host 端口读取，决定冲突里选「重命名」时新名字怎么起。
 *              续三十九：书签弹层 footer 新增图钉「面板常驻」（toggleBookmarkPanelPinned）——
 *              写的就是 `closeBookmarkPanelOnSelect`（钉住 = false），照 `toggleBookmarkSortMode` 的路子：
 *              本面板即时生效 + setAndFlush 落盘 + 广播 sftp-plus-settings-changed 同步设置页与其它面板。
 *              续三十八：撤销续三十六里「设置页改默认路径模式 → 清本连接覆盖」的做法 ——
 *              面板上单独切换过的路径模式随该标签页连接保存（per-host 覆盖优先），设置页「默认路径模式」
 *              只对**没有覆盖的新连接**生效；移除 `sftp-plus-default-pathmode-changed` 专用事件与
 *              `_applyDefaultPathMode(force)`，方法回到「有覆盖就 return」（用户 2026-10-22 拍板）。
 *              续三十七：按用户要求收紧「同步路径」入口 —— 两栏不是「本地↔本地 / 远程↔远程」
 *              时面板循环**跳过该档并 toast 说明**（不再「切过去但不生效」），设置页默认值同样拦截；
 *              日志 `default path mode 'mirror' skipped: panes differ`。
 *              续三十六：新增配置 `applySettingsInstantly`（配置保存后立即生效 / 需重开面板生效）：
 *              关闭时 `_settingsApplyLive()` 让本面板忽略一切设置变更广播，重开面板构造期自然读到新值。
 *              （该轮另一项「设置页改默认路径模式 → 专用事件清本连接覆盖」已由续三十八撤销。）
 *              续三十五：修「同步路径」静默不同步——远程侧的存在性探测
 *              （_otherPanePathExists）把宿主 stat 返回的**布尔** isDirectory 当函数调用
 *              （st.isDirectory()），目录恒抛 TypeError ⇒ 被 catch 成 false ⇒「任何目录都判成
 *              对端不存在」，于是 mirror 每次 `peer has no such dir, skip`（用户 log.txt 实证），
 *              书签联动跳目录同样被误拦。改走 statRemotePath（包装层→russh 原生 stat 回退），
 *              拿不到结论时放行；补齐 `mirror: <from> -> <src>` 成功日志与 skip 日志的 from 字段。
 *              续三十四：路径模式新增「同步路径」（mirror）——两栏锁同一目录，在 _mirrorFollowFrom 里按端点类型把路径推给另一栏（本地↔本地走 _rlGo、远程↔远程走 refreshRemote）；两栏不同类时同样可以切到该档，只提示「暂不生效」，两栏调成同类后由 _onPaneKindChanged 自动接上（首版是循环跳过，用户实测「面板里根本切不到，只能去设置页设」）；书签排序改三档（bookmarkSortMode，新增名称排序）。
 *              2026-10-21 — 端点/路径记忆按标签页分槽（paneState/perTab/<user@host:port>/…）：
 *              此前 endpoints/left、leftRemoteHost、leftRemotePath、leftLocalPath、endpoints/right、
 *              rightLocalPath 全是全局单槽，多标签页互相覆盖 ⇒ 重启后每个标签页都恢复成
 *              「最后一个落盘的连接」。现按面板所属标签页的连接身份分槽读写（_ptGet/_ptSet）。
 *              同日：右键菜单新增 `_ctxPeerSameConnection`（远程↔远程是否同一 SSH 连接）——
 *              不同连接显示「上传」而非「传输」；`_ctxTransferToPeer` 的 r2r 分支一律只认
 *              对端当前目录，不让「默认上传路径」当远端落点。
 *              2026-10-20 — 右键菜单上传/下载改按「端点类型」判定，不再按左/右栏位置。
 *              2026-10-20 全量审计：① _pasteDirect 非 r2r 分支补「自我覆盖 + 自我包含」守卫（同栏粘贴
 *                原会把源文件截断成 0 字节）；② _doEndpointTransfer 远程↔远程分支补同类守卫；③ switchLeftEndpoint
 *                新增 _leftSwitchGen 代际，快速连点时过期结果释放自己开的通道后退出（防状态覆盖 + 通道泄漏）；
 *                ④ _dropRemoteToRemoteEndpoint 区分「入队冲突」与真失败并给出提示；⑤ downloadRemoteDir 的 r2r
 *                目录分支补 remote-copy 记录（新增 _logR2rTransfer）；⑥ _syncRemoteToTerminalCwd 异步后复查
 *                会话与 pathMode；⑦ _computeConflictDigests 两侧通道各自判定（localSideRemote/remoteSideRemote）；
 *                ⑧ _clearPanelTimers 纳入 rl 三个定时器；⑨ 修 15 处 tsc 类型错误（RowsSource 三字段类型、
 *                SshSession extends SSHSessionLike、SFTPSessionLike.end）。
 *              新增 _ctxPaneIsLocal / _ctxActionPane（本栏连的是本机磁盘还是 SFTP 远程）与
 *              _ctxPeerPane（对端栏位），子组件新增 dataPane 输入承担文件动作判定；_ctxCanTransfer
 *              由「rl 一律禁用」改为「任一端为远程即可」。ctxUpload/ctxDownload 增加方向守卫：
 *              非经典布局（左栏远程 → 下载、右栏本机磁盘 → 上传）改走新的端点直传
 *              _ctxTransferToPeer，复用 _transferBetweenEndpoints 的四组合分派。
 *              连带修正：属性框数据形态/文件夹大小扫描会话、chmod 会话与选中集均按端点取。
 *              同日续：两端端点**同类**时不再显示「上传/下载」，改显「传输」（新增 transfer 动作 +
 *              子组件 peerPane 输入）。本机↔本机走 _ctxCopyToPeerLocal（跨栏复制，已存在跳过），
 *              远程↔远程复用 _transferBetweenEndpoints 的服务端直传；两栏同目录时不给传输项。
 *              同日续二（用户反馈：远程↔远程右键传输无记录、不弹冲突、不能拖拽）：
 *              ① 远程↔远程的「传输」改走 _streamUploadOneRemote / _streamDownloadOneRemote ——
 *              原先直调 _transferBetweenEndpoints 裸通道，既不写 remote-copy 记录也不进传输列表，
 *              目标已存在时还静默跳过；现与拖拽/粘贴共用同一条 r2r 通道（服务端 cp 快路径 →
 *              流式队列 + r2r 冲突项 覆盖/跳过/重命名）。
 *              ② 新增 _dropRemoteToRemoteEndpoint + drop 端口 transferRemoteEntries：远程条目拖到
 *              另一栏远程端点不再被「暂不支持拖放到此」拒绝（isLocalPaneTarget 补右栏 rl 判定）。
 *              同日续三（四种组合复核）：① 远程↔远程的**粘贴**同样算互传 —— _pasteDirect 的 r2r
 *              分支改走 _streamUploadOneRemote/_streamDownloadOneRemote（此前裸通道：无 remote-copy
 *              记录、不弹冲突框、目标已存在直接跳过）；剪切仅在真正传成功后删源（通道回传 boolean）。
 *              ② 冲突框里选「覆盖/重命名」后执行的 doR2rTransfer **补写 remote-copy 记录**（此前
 *              只弹框不记录）。③ 本机↔本机互传补 `local-copy` 记录：右键「传输」与粘贴同栏复制
 *              两处都写（该操作类型与日志渲染早已存在，此前全项目没有写入点）。
 *              同日续四（冲突执行体端点化）：覆盖/重命名不再假定「本机磁盘 ↔ 面板主会话」。
 *              ① 实现 _doEndpointTransfer（按两端 isLocal 四组合分派：fs / _doUpload / _doDownload /
 *              服务端 cp→流式）与 deleteAtEndpoint 端口，执行后写同口径传输记录（local-copy /
 *              upload / download / remote-copy）——此前「左栏远程↔本机」目标已存在只能跳过；
 *              ② 新增 _enqueueEndpointConflict / _epStatEntry：目标已存在即入队覆盖/跳过/重命名，
 *              接入 _pasteDirect（左栏远程端点组合）与 _ctxTransferToPeer（混合方向）；
 *              ③ 实现 drop 端口 uploadLocalToRemoteEndpoint（_dropLocalToRemoteEndpoint）：本机条目
 *              拖到左栏远程端点从「暂不支持」改为真正上传 + 冲突框。
 *              本机↔本机（_ctxCopyToPeerLocal）仍保持「已存在即跳过」——两端同为本地时对话框的
 *              「本地文件/远程文件」两栏标题与上传/下载徽章都不成立，改文案的收益不抵风险。
 *              2026-10-19 — P0 修复：_pasteRemoteAware（远程↔远程粘贴）剪切分支的数据丢失。原先
 *              tryRemoteCpViaSsh/transferRemoteDirToRemote/transferRemoteToRemoteFile 的返回值 ok
 *              只用于置 allOk，完全没有 gate 下方的 deleteRemoteRecursive——复制失败（SSH exec
 *              被禁用的服务器上 cp 必然失败）时源文件照样被递归删除，目标却没有副本。修复：任一
 *              通道失败即 continue（不删源）；同栏 cp 失败回退内存流式传输兜底（此前同栏分支无任何
 *              兜底）。另含本轮全量审计的多项 P1/P2 修复（吞键洞、sync 定时器、rl 导航/槽位、Shift
 *              锚点、左远程拖放守卫、下载槽位、Esc 栈等，逐项见代码内 ★ 2026-10-19 注释）。
 *              续四：rl 右键菜单对齐左右栏（反馈③）——补 rl 面板 entryContextMenu/listContextMenu 绑定、syncPaneSelectionVisual 扩 'rl' 防串色、框选菜单去 rl 早退归 rl 路由；并含上轮 2026-10-18 的 P2 收尾/r2r 日志/选择器下沉/右栏本地端点框选与排序修正。续五：rl 分组状态独立（rlGroupBy+折叠集+行缓存，去 _normCtxPane 串改左栏本地）与分组头点击切换整组选中⇄取消（修复再点无法取消）；分组头框选起手 + 框选后分组头 click 抑制；面板几何拖拽/缩放结束后 live style 归一化为百分比（修复窗口缩放后面板超出容器）。续七：rl 地址栏对齐 issue #26 定位语义——输入文件路径回车改为「跳父目录 + 高亮定位」（此前整段当目录 stat 必报无法访问），_scrollRowElIntoView 扩 'rl' 防串栏。续八：rl 表头右键菜单/列宽拖拽/自适应/表头重排/隐藏文件开关对齐左右栏（rl 模板补 headerContextMenu、colResizeStart/AutoFit、colHeaderReorderStart 绑定与 rl* 交互态 getter；onHeaderContextMenu 按 .rl-pane 判 rl；toggleHidden rl 走 _rlShowHidden 独立持久化 showHiddenRl；_rlRefresh needOwner 随列可见性；_ctxShowHidden rl 分支）。
 *              续九：取消归属的保守兜底 —— _taskRefOf 在**并发多任务**时不再回落到「最后启动的任务」（ALS 已禁用的已知代价），拿不到明确归属时宁可不广播也不误杀别的任务（详见该函数内 ★ 2026-10-19 注释）。
 *              续十：新建/重命名/删除后的自动刷新修正 —— ① 刷新侧改为「打开对话框时显式指定」（cancelInputDialog 不再复位），修复左栏本地增删改刷错栏；② 新增 _refreshSiblingPanes：'同连接 + 同目录'的另一栏同步刷新（左本地⇄右本地、左远程⇄右远程）；③ 删除确认后同样联动；④ 左栏远程端点按 F2 改走第二会话（原会拿 POSIX 路径做本地 fs.rename）。
 *              续十一：「数据变更后的刷新」一律按**文件系统**而不是按左/右 —— 新增 _refreshLocalFsPanes / _refreshRemoteFsPanes，
 *              并替换 paste / drop / transfer-coordinator / conflict-resolver 四个适配器与 ctxUpload/ctxDownload/_pasteRemoteAware 的
 *              refreshLocal/refreshRemote 接线。原先「本地 FS 变了就刷左栏」在右栏本地浏览器（rl）与左栏远程端点下会把刷新打到错误的栏，
 *              实测：右栏本地粘贴遇同名文件选「重命名」后左栏刷出来了、右栏本身不刷新（必须手动 F5）。
 *              续十二：端点抽象收口 —— 新增 PaneEndpoint + _paneEndpoint(side)（连接类型/目录/会话/连接身份一处判定），
 *              `_paneSyncTarget` 并入其中，刷新助手改走 `_refreshPanesOfFs(isLocal)`；粘贴路由改按端点分派
 *              （原 `_pasteRemoteAware` 泛化为 `_pasteDirect`，补齐「左栏远程端点 ↔ 本机磁盘」两个方向：
 *              文件走带 session 的 `_doUpload`/`_doDownload`，目录递归 `_uploadDirViaSession`/`_downloadDirViaSession`），
 *              同时修掉「右栏本地 rl → 右栏远程」被误判成左栏远程的串线。`_doDownload` 增加尾参 session（与 _doUpload 对称）。
 *              续十三：本地删除「移入回收站」提速 —— 原实现串行地「每个文件 await 一次 powershell.exe」（≈1s/项），
 *              多选删除时列表长时间不更新（表现为卡死）。改为 `trashLocalPaths` 批量（一次进程、≤80 项/批、
 *              路径经环境变量 JSON 传入），并缓存 `shell.trashItem` 可用性（实测本机恒报
 *              `Failed to create FileOperation instance`，此前每次删除都白失败一次再回退）。
 *              续十四：顶栏按钮可定制（_readTopBarConfig / topBarInlineItems / topBarMenuItems / runTopBarItem）——
 *              按 core/top-bar-items.ts 的顺序渲染，未固定的收进 ⋯ 折叠菜单；数据变更后的提示条改贴底（不挡顶栏按钮）。
 *              ★ 2026-10-23：⋯ 菜单由「只列被收起项」改为「列全部可用项 + 每行图钉就地切固定」
 *              （toggleTopBarItemPinned 写回 topBarPinned 并广播；⋯ 按钮在启用折叠后常驻显示）。
 *              续十五：连接切换器唤起方式可配置（connPickerTrigger：topbar 默认 / paneToolbar / both）——
 *              顶栏标题点击入口受开关约束（关闭时只显示连接、cursor 变默认）；paneToolbar 模式下改由
 *              **面板栏工具栏的端点标识**（file-pane 的 labelClick 输出）唤起，按栏分别打开左右候选；
 *              标识被「栏工具栏定制」隐藏时顶栏自动回退可点，避免切换器没有入口。
 *              续十六：顶栏按钮补「启用」维度（topBarDisabled：停用项顶栏与 ⋯ 菜单都不出现，与「收起」独立）；
 *              按钮图标抽成共用 ng-template（tbIconPathMode 等 6 个），顶栏按钮与 ⋯ 菜单项共用同一份 SVG。
 *              续十七：修「点栏标识关不掉切换器」——document 捕获阶段的「点外部关闭」把可点标识也算作了外部，
 *              先关再被标识自己的 click 重新打开；白名单补 .pane-label--clickable，开关统一由标识自己收口。
 *              续十八：新增面板整体透明度（panelOpacity 0.5–1 → 写 CSS 变量 --_panel-opacity，禁止全透明）。
 *              续十九：书签「联动书签」开关（bookmarkLinkEnabled）+ 书签表单联动路径（点击书签时另一栏也跳转）。
 *              续二十：书签排序方式可切换（bookmarkSortByUsage：拖拽顺序 / 使用频率降序，footer 按钮与设置页共用配置）；
 *              联动跳转前用 _otherPanePathExists 探测目标路径（本地 fs.stat / 远程会话 stat，不存在不跳）。
 *              续二十一：连接状态内联到顶栏连接分段（用户诉求：去掉独立的「● 已断开 [重连]」徽标）。
 *              每个分段渲染「● 远程(user@host) ⟳」——断开时前缀闪烁红点、尾部图标按钮重连；
 *              双远程时左段/右段各带各的状态，一眼看出是哪一栏断了（旧徽标只能表达「某个连接断了」）。
 *              左栏远程端点此前**完全没有连接状态**（右栏 _connLifecycle 只管主会话），现新增
 *              _leftConnected/_leftConnecting/_leftReconnecting + _watchLeftSession（closed$ +
 *              open===false 2s 兜底轮询）/ _markLeftDisconnected / _reconnectLeftPane：
 *              "Tabby 里关掉连接标签"会立刻在左段点亮红点；重连时 SSH 会话已死则改为打开连接选择器
 *              并提示（SFTP 无法复活一个已销毁的 SSH 会话）。同时给面板传 connLost，断开态空列表
 *              不再误报「无法访问（权限不足或路径不存在）」。
 *              续二十二（用户实测：关掉左栏所连的 Tabby 标签后只剩「无法访问」、重启后另一个远程连接不恢复）：
 *              ① 断线监控的根因修正 —— 宿主的 SSHSession **没有 closed$ / .closed，destroy() 也不把
 *              open 置回 false**（实证 tabby-ssh/src/session/ssh.ts），唯一可靠信号是 `willDestroy$`。
 *              上一版只订阅前者 ⇒ 关标签后状态永远不翻。现改为 willDestroy$ 为主 + closed$/open 兜底。
 *              ② 刷新失败兜底 _leftSessionLooksDead：readdir 报错时先判「会话是否已死」（销毁标记 /
 *              open===false / channel/socket/EOF 类文案），是则翻成 disconnected 并清列表，
 *              空态显示「连接已断开」而不是误报权限不足。
 *              ③ 左栏端点持久化/恢复（此前完全没有）—— _persistLeftEndpoint 存 kind + host/user/port/label
 *              + 两侧路径；ngOnInit 的 _restoreLeftEndpoint 轮询标签树最多 30s 按身份匹配同一个连接，
 *              命中后走同一条 switchLeftEndpoint 并套用上次远程路径；未命中则提示
 *              notify.leftEndpointNotRestored（避免看起来像记忆失效）。
 *              续二十三：悬停文案去方位化 —— 「选择左侧面板端点 / 选择远程连接」改为统一的
 *              「切换连接」（conn.pickerTitle）。布局可在左右/上下/单栏之间切换，方位词会在
 *              上下布局与单栏下自相矛盾；两段共用同一条文案，由分段位置与浮层锚点表达是哪一栏。
 *              左栏 pane 标识的 labelTitle 同样改用 conn.pickerTitle（conn.leftPickerTitle 不再被引用）。
 *              续二十四（用户实测：点重连后仍显示已连接、切换连接里也找不到那个连接）：
 *              ① 「会话还活着」判据修正 —— 宿主 destroy() 不置 open=false ⇒ 已销毁会话看起来仍 open，
 *              重连走到「重开通道」分支并命中缓存死通道。改用 _leftSessionDestroyed（willDestroy$ 置位）；
 *              并修掉 _watchLeftSession 每次重挂都无条件复位该标记（导致失败后 _leftSessionLooksDead 恒假）。
 *              ② 通道开成功 ≠ 能用：新增 _verifyLeftChannel（readdir('/') 探针），通过后才置「已连接」；
 *              失败即释放清空并升级到 ③，不再停留在「显示已连接、操作全失败」的僵尸态。
 *              ③ 会话已销毁时用记住的 profile 经宿主 ProfilesService.openNewTabForProfile 重开该连接
 *              （等认证 open===true 再挂、按新增会话匹配、恢复原远程目录）；无 profile 才退化为提示 + 选择器。
 *              ④ 旧通道释放全部改走 sftpService.closeForSSHSession（裸 end() 不维护引用计数与缓存）；
 *              服务侧补 willDestroy$ 监听，销毁即 forceInvalidate 清掉缓存通道。
 *              ⑤ 连接选择器补「已断开」占位行（dead，不可点），让列表与顶栏显示的连接对齐。
 *              续二十五（用户反馈：关闭面板重开后，左栏的远程目录变回 '/'，而右栏保持原目录）：
 *              路径记忆此前只有「本地槽（左栏 localPath）+ 远程槽（右栏 remotePath）」两个槽，
 *              左栏切成远程后它自己的远程目录**没有归属槽**；且 _restoreLeftEndpoint 是在
 *              `await switchLeftEndpoint()` **之后**才读配置 —— 而 switch 内部刚把 localPath 复位成 '/'
 *              并落了一次盘 ⇒ 读回来的永远是复位值。
 *              ① 恢复前先快照 paneState/leftRemotePath｜leftLocalPath，switch 之后再套用（不再读配置）。
 *              ② _persistLeftEndpoint(keepPath)：切换连接的「复位 '/'」是同机临时值，不得覆盖已记住的路径；
 *              换机器（_leftEndpointHostKey 不等）才写新值。
 *              ③ 新增 _leftPathMemorySuppressed 屏蔽窗口 —— refreshLocal 成功后会调 _rememberLeftPath、
 *              remember 模式下还会调 saveCurrentPath，两者都会把复位值当用户路径写进记忆
 *              （keepPath 只挡落盘，挡不住已经写进内存的值）。
 *              ④ remember 模式补写左栏远程槽；切到远程时另把「切走前的本地目录」存进 leftLocalPath，
 *              避免重启后切回本地只能落到 home。
 *              续二十六（用户诉求：没在 Tabby 打开过的配置连接，能不能直接在面板里选）：
 *              ① 连接选择器新增「未打开」候选段 —— ProfilesService.getProfiles（异步）缓存进
 *              _knownProfiles，打开浮层时后台拉一次并原地重建；已打开的同一条连接（host+user+port）
 *              不重复出现，未打开项带 unopened 标记 + 「+」前缀 + 「未打开」副文本。
 *              ② 选中未打开项走 _connectUnopenedProfile：宿主 openNewTabForProfile 开标签页 →
 *              轮询新增会话 open===true（最多 60s，认证要用户输入）→ 复用 switchLeftEndpoint /
 *              switchRightEndpoint 挂到该栏 —— 与手动切换完全同一条链路（含路径重置、持久化）。
 *              ③ _openProfileTab 结束时把焦点切回打开之前的标签页：addTabRaw 会激活新标签，而面板
 *              挂在原标签的终端上，不切回用户就看不到面板（体感「点了没反应」）。
 *              ⛔ 判活不能用宿主 `BaseTabComponent.destroyed`（那是 Subject，恒 truthy），
 *              只能订阅 `destroyed$` 或查标签树 —— 否则「每次点击都失败」/「永远不切回」。
 *              续二十七（用户反馈「闪烁感明显，左栏先加载一下才到记忆路径，显得迟钝」）：
 *              ① 首目录由调用方给：`switchLeftEndpoint(opt, startPath?)` —— 恢复/重连把记忆路径
 *              直接作为首目录传进去，只刷新一次就落在目标目录；不再「先列 '/' 空文件夹 → 再闪回」。
 *              ② 闪烁收口到 `_flashPaneList()`：恢复/切换期间 `_suppressPaneFlash` 整体抑制
 *              （连刷两次 0.25s 淡蓝背景就是用户看到的「闪两下」），且首帧填充不闪。
 *              ③ 顶栏不跳变：`_leftRestoring` 期间 `leftConnState='connecting'` + 标签显示「连接中」，
 *              不再先亮「本地」再跳成「远程(x@y)」；恢复失败才落回本地。
 *              ④ 等待期先显示**上次的本地目录**（`_primeLeftLocalPathForRestore`），而不是 home ——
 *              异步等待窗口里至少是用户熟悉的内容。
 *              ⑤ 用户操作优先：选连接 / 点重连即置 `_leftRestoreAbort`，恢复轮询立刻放弃，
 *              不会在几秒后把用户刚选的东西覆盖回去。
 *              续二十八（用户反馈：①「连接中」看不出在连哪个连接；②选了未打开的配置连接要点两次才连上）：
 *              ① 顶栏「连接中」必须带**目标连接名**：新增 `_leftPendingLabel` / `_rightPendingLabel`，
 *              恢复左栏端点、切换会话、开未打开配置连接的**整个等待窗口**都显示「连接中 root@host」；
 *              左栏状态判定改由 `_leftPendingLabel` 主导（`_leftKind` 还是 local 时也要亮忙碌点）。
 *              ② `_openTabAndWaitSession` 取代「枚举标签树 → 与开标签页之前相减」：宿主的
 *              `SSHMultiplexerService` 在 `profile.options.reuseSession` 且同 host:port:user 时会
 *              **复用已存在的 SSHSession**，新标签页拿到的是同一个会话对象 ⇒ 被 `seen` 去重掉，
 *              「新会话」永远不出现，于是空等 60s 超时（用户看到的「要点第二次」：第一次只是把
 *              标签页开出来了）。现在优先直接读**刚开的那个标签页**（含 SplitTabComponent 展开），
 *              枚举相减只作兜底；并且先查「已打开且 open===true 的同一条连接」直接复用。
 *              ③ 同一 profile 的连点合并到**同一个进行中的 Promise**（`_profileOpenInFlight`）：
 *              再点一次等于等第一次的结果，不会并排开出第二个标签页。
 *              ④ 失败提示带上连接名（`notify.connOpenFailed` 新增 `{host}`），超时日志也带名字。
 *              续二十九（用户反馈：①连接选择器的滚动条丑、要对齐；②「未打开」也要像「（当前）」一样加小括号）：
 *              只改 `styles.ts` 与 24 个语言包（本文件未动）—— 滚动条补项目统一的 6px 细滚动条，
 *              并用 margin-right 抵消 scrollbar-gutter 造成的左右留白不对称；
 *              `conn.current` / `conn.otherPane` / `conn.notOpened` 全部改为**英文半角**括号。
 *              续三十（用户诉求：「断开连接应该不是底部只有一个按钮？而是每一个选项的右侧都有一个减号的图标按钮？」）：
 *              ① 移除浮层底部那个单独的红字「断开连接」按钮（连同 `_connPickerShowDisconnect` /
 *              `_connPickerDisconnect` 与 `.conn-opt-disc` 样式）：它的语义只是「把面板从当前连接撤下来」。
 *              ② 每个已打开的连接项右侧新增 `.conn-opt-kill` 减号（悬停本行才显形，宽度恒占位、
 *              行宽不跳），点击 = 关闭**这一条连接**：`_connPickerCloseOption` 先让用到它的栏退回本地
 *              （左栏解绑通道 / 右栏断 SFTP），再走宿主 `app.closeTab(tab)` 把标签页关掉。
 *              ③ ⛔ 若那条连接正挂在**面板自己所在的标签页**上，只退面板、**不关标签页** ——
 *              `closeTab` 会把面板一起销毁，用户会以为整个 SFTP+ 消失；改为提示 `notify.connPanelTabKept`。
 *              ④ `listRemoteConnectionOptions()` 的候选项新增 `tab` 字段：关标签页需要对象，
 *              只带 `sshSession` 是关不掉的。
 *              续三十一（用户诉求：①顶栏连接显示能在「别名 / 账号@地址」之间切换；②重启后自动恢复
 *              超时不要退回本地，而应像「断开」一样保留端点并可点重连）：
 *              ① 新配置 connLabelStyle（account 默认 / alias）。展示层统一走 `_connDisplayText()`，
 *              只作用于**顶栏文案**（左/右分段、「连接中 <目标>」、断开占位行）；`hostInfo` /
 *              `_leftHostLabel` 仍是 `user@host` —— 书签锚定连接身份、传输日志主机名、
 *              `_connMatchesSaved` 都靠它们，塞别名会让同一台机被当成两条连接。
 *              ② `_restoreLeftEndpoint` 超时不再退回本地，改为 `_enterLeftDisconnectedState`：
 *              `_leftKind='remote'` + 保留 label/profile + `_leftSessionDestroyed=true` + 清列表
 *              ⇒ 顶栏红点 + 重连图标，路径停在记忆的远程目录，点一下即可重连。
 *              ⛔ 断开态**不能调 `_persistLeftEndpoint()`**：它按 `_leftProfile.options` 反写身份，
 *              此时 profile 可能为空/兜底对象 ⇒ 原 host/user/port 会被覆盖成空串，记忆被自己抹掉。
 *              ③ 新增 `_resolveProfileByIdentity()`：按 host/user/port/label 到配置连接里找 profile，
 *              供「别名显示」与「断开后点重连」使用（这两条路走下来 `_leftProfile` 都还是空的）；
 *              `_leftSavedIdentity()` 在 profile 缺失时退回持久化的 `paneState/leftRemoteHost`。
 *              续三十二（用户截图三连问：①连接中却列着本地文件；②明明已有 Tab 还新开一个；③重连后停在 '/'）：
 *              ① 新增 `leftPanePending` / `rightPanePending`（= 该侧 `connState === 'connecting'`），
 *              文件面板 `pending` 时不渲染 entries、地址栏留空、空态写「连接中」。左栏等待窗口里
 *              entries 仍是复用状态槽里的**本机**目录 ⇒ 用户看到「顶栏连接中 + 下面本地文件」。
 *              ② `_openTabAndWaitSession` 新增「已有标签页就就地复活」：`_findTabForSaved()` 走标签树
 *              （不看 sshSession，因为 Tabby 恢复出来的标签页可能还没会话对象）→ `_reviveTabAndWait()`
 *              激活该标签页并调宿主 `tab.reconnect()`（tabby-terminal connectableTerminalTab）→
 *              轮询 `open === true`。**不再 openNewTabForProfile 开第二个同名标签页**。
 *              ③ 新增 `_leftRememberedPath()` / `_leftStartPathForReconnect()`：重连起始目录在
 *              「paneState/leftRemotePath」与当前 localPath 间取更具体的那个 —— '/' 几乎总是
 *              端点切换的复位值，不能盖掉记忆；`_enterLeftDisconnectedState` 也用它兜底。
 *              续三十三（用户三问：①文案应是「等待连接」；②重连复用已有 tab 时界面闪白）：
 *              ① 新增 `_leftPendingMode` / `_rightPendingMode`（'connecting' | 'waiting'）与
 *              `status.waitingConn`（24 语言）。自动恢复 / 重连 / 开未打开连接 → waiting
 *              （等的是 Tabby 标签页与用户认证），只有在开 SFTP 通道时才是 connecting；
 *              `_setConnPending` 里 waiting **不会被内层 connecting 覆盖**，否则收尾时文案会跳一下。
 *              栏内占位文案由 `leftPanePendingText` 注入 file-pane 的 `pendingLabel`。
 *              ② `_reviveTabAndWait` **不再一进来就 selectTab**：后台 `tab.reconnect()` + 轮询，
 *              只有超过 2.5s 仍未就绪（≈ 需要用户输密码/确认指纹）才把那个标签页切到前台，
 *              且只在「确实切过」时切回 —— 免密/密钥场景全程零切换，不再闪白。
 *              ③ 路径记忆补落盘：`_rememberLeftPath` 末尾 `_schedulePaneFlush()`（1.2s 合并写盘），
 *              解决「直接退出 Tabby 时 _paneSet 只在内存、记忆退回旧值（常为 '/'）」。

 */

/**
 * 2026-10-18 — issue #27 前置（P1/P2 收尾）：可点击的连接标识 + 连接选择器。
 *              右侧远程面板不再写死为「面板所属终端标签页」的会话：点击顶栏连接地址（conn-address）
 *              弹出选择器，可把远程面板切到任意「已开的 SSH 终端标签页」。左栏端点亦可在顶栏左段切换
 *              （本地↔远程）。选择器浮层由 sftp-file-pane 内部渲染，触发入口统一收到顶栏；
 *              面板标签不再挂选择器（用户要求：不要在标识中点击弹出，改到顶栏地址）。
 */
import * as path from 'path'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as os from 'os'
import { randomUUID } from 'crypto'

import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ChangeDetectorRef, ElementRef, NgZone, Injector, ViewChild, ViewEncapsulation, Inject, Optional } from '@angular/core'
import { ThemesService, NotificationsService, ConfigService, AppService, ProfilesService } from 'tabby-core'

import { LocalPathFileDownload, LocalPathFileUpload, uploadLocalFile, downloadRemoteFile, cancelAllInFlight, transferRemoteToRemoteFile, transferRemoteDirToRemote } from './core/transfer-adapters'
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
import { copyLocalDir, copyRemoteDir, deleteLocalRecursive, deleteRemoteRecursive, isPathInside, tryRemoteCpViaSsh, tryRemoteRmViaSsh } from './core/fs-ops'
import { isChannelDeadError } from './core/session-errors'
// ★ 2026-10-27（Deepseek-V4.1-Flash）：与 QuickCmd+ 的刷新联动（事件契约 + 观察期轮询）
import { QC_REFRESH_REQUEST_EVENT, QcRefreshObserver, normalizeRefreshRequest, markQuickCmdSeen } from './core/quickcmd-link'
import { ConcurrencyLimiter } from './core/concurrency'
import type { SshSession, ProfileInfo, ConnectionOption } from './core/session-types'
import { trashLocalPaths } from './core/trash-local'
import {
  TOP_BAR_ITEMS, TOP_BAR_ITEM_IDS, DEFAULT_TOP_BAR_ORDER, DEFAULT_TOP_BAR_PINNED, DEFAULT_TOP_BAR_DISABLED, TOP_BAR_CFG_FIELDS,
  normalizeTopBarOrder, normalizeTopBarPinned, normalizeTopBarDisabled,
  type TopBarItemId,
} from './core/top-bar-items'
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
import { SFTP_PLUS_TOGGLE_HOTKEY } from '../tabby/hotkey-provider'
import {
  CONTEXT_ACTION_HOTKEYS,
  defaultPanelHotkeys,
  normalizeBookmarkSortMode,
  normalizeCaretShape,
  PANEL_HOTKEY_ACTIONS,
  type BookmarkSortMode,
  type CaretShape,
  type PanelHotkeyAction,
} from '../tabby/config-provider'
import { isColorDark } from '@common/utils'
import { SftpPanelBookmarkController } from './controllers/panel-bookmark-controller'
// ★ 2026-10-14：剪贴板屏蔽器需要把「查看器的 Ctrl+A」转交给对话框实现 —— 它无法自己完成：
//   正文是自绘虚拟列表（没有可全选的表单对象），而屏蔽器又**必须**在捕获阶段把按键拦下来
//   （拦 Tabby/xterm 靠的是 stopImmediatePropagation，preventDefault 拦不住「把 ^C 写进远端」
//   这种 JS 行为），于是对话框的遮罩级监听根本收不到 —— 只能由面板反向调用。
import { SftpViewerDialogComponent } from './components/sftp-viewer-dialog.component'
import { SftpEditorDialogComponent } from './components/sftp-editor-dialog.component'
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
  ConflictQueueItem,
  EndpointRef,
} from './core/panel-types'
import { normalizeConflictRenameStyle, type ConflictRenameStyle } from './core/conflict'
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
import { IdNameResolver, execSshCommand, safeEntryName, safeRemoteEntryName, localEntryName, safeJoinUnder } from './core/path-utils'
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
 * ★ 2026-10-19（Hy3）：**端点**抽象——三栏（左栏本地 / 左栏远程 / 右栏远程 / 右栏本地 rl）统一描述。
 *
 * 为什么需要它：右栏可以是本地浏览器（rl）、左栏也可以是远程端点之后，代码里大量
 * 「local ⇔ 左栏、remote ⇔ 右栏」的 2 值假设全部失真（刷新刷错栏、粘贴用错会话、
 * 路径拼接用错语义）。凡是要「按连接类型（本地/远程）而不是按左右栏」判断的地方，
 * 一律先取端点再分派——刷新、粘贴、存在性探测、删除、拼接路径共用同一份判定。
 */
interface PaneEndpoint {
  /** 物理栏位：'local' = 左栏（其 FS 由 isLocal 决定）、'remote' = 右栏远程、'rl' = 右栏本地 */
  side: 'local' | 'remote' | 'rl'
  /** 该栏连接的是本机磁盘（true）还是 SFTP 远程（false） */
  isLocal: boolean
  /** 该栏当前目录（本地为 win32 语义，远程为 POSIX 语义） */
  dir: string
  /** 远程会话（本地为 null） */
  sftp: any
  /** 远程 SSH 会话（本地为 null；用于服务端 cp 等 exec 通道） */
  ssh: any
  /** 连接身份：本地恒为 'local'，远程为 SSH 会话对象（SFTP 子通道对象每侧各一条，不能拿来比） */
  connKey: any
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

  // ★ 2026-10-14：剪贴板屏蔽器要用它俩实现「Ctrl+A 全选」（详见 _shieldTerminalClipboardKeys
  //   中「文本 UI 打开」分支的注释）。模板里的这两个子组件常驻（内部用 *ngIf 控制遮罩），
  //   故不需要 { static: false } 之外的额外处理。
  @ViewChild(SftpViewerDialogComponent) private viewerDialog?: SftpViewerDialogComponent
  @ViewChild(SftpEditorDialogComponent) private editorDialog?: SftpEditorDialogComponent

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
  /**
   * ★ 2026-10-20 续三十三（用户截图：重连后左栏仍在 '/'）：
   *   左栏远程路径记忆只在 `_paneSet`（内存）里，落盘全靠 ngOnDestroy/beforeunload；
   *   用户直接退出 Tabby 时那条异步 IPC 很可能赶不上 ⇒ 记忆退回上一次 flush 的旧值（常是 '/'）。
   *   目录刷新成功后延迟落盘一次（合并连续导航），保证「浏览过就记得住」。
   */
  private _paneFlushTimer: ReturnType<typeof setTimeout> | null = null
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
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制（全局 UI 偏好，存设置配置，所有连接共用）。
   *   面板小的时候顶栏塞 6 个图标会把连接地址挤没，故支持「固定到顶栏 / 收进 ⋯ 菜单」两态 +
   *   折叠菜单总开关。默认「全部固定 + 折叠关闭」⇒ 不配置时与历史行为完全一致。
   *   登记表与默认值见 core/top-bar-items.ts（设置页共用同一份，禁止各写一套 id）。
   */
  private _topBarOrder: TopBarItemId[] = [...DEFAULT_TOP_BAR_ORDER]
  private _topBarPinned: TopBarItemId[] = [...DEFAULT_TOP_BAR_PINNED]
  /** 被停用的按钮：顶栏与 ⋯ 菜单都不出现（与「收起」是两回事） */
  private _topBarDisabled: TopBarItemId[] = [...DEFAULT_TOP_BAR_DISABLED]
  private _topBarOverflowEnabled = false
  /** ⋯ 折叠菜单是否展开 */
  _topBarOverflowVisible = false
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器唤起方式（全局配置）。
   *   'topbar' = 只认顶栏连接标题（默认）；'paneToolbar' = 只认**面板栏工具栏上的端点标识**
   *   （🖥 本地 / 🌐 远程，点哪栏开哪栏的候选）；'both' = 两者都可用。
   *   顶栏入口关闭时，顶栏标题仍显示当前连接，但点击不再弹切换器。
   */
  private _connPickerTrigger: 'topbar' | 'paneToolbar' | 'both' = 'topbar'
  /**
   * ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash，用户诉求「顶栏连接显示用别名还是账号@地址」）：
   *   'account' = 账号@地址（默认，历史行为）；'alias' = Tabby 配置连接名（无名字时回落账号@地址）。
   * ⛔ 只影响**顶栏文案**：`hostInfo` / `_leftHostLabel` 保持 `user@host` —— 书签锚定连接身份、
   *   传输日志的源/目标主机名、`_connMatchesSaved` 的匹配全按它们取，塞别名会让同一台机被当成两条连接。
   */
  private _connLabelStyle: 'account' | 'alias' = 'account'
  /** 栏标识入口时的浮层平移量（相对 .conn-address-wrap 左上角）；null = 顶栏分段锚定 */
  private _pickerAnchor: { x: number; y: number } | null = null
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
  /** 面板最小几何（px）。宽 420：顶栏「标题 + 完整 user@host + 7 个 28px 按钮」实测需要 ≈410px
   *  （374px 时顶栏溢出面板右缘，最大化 / 关闭按钮被裁掉，见 2026-09-30 修订） */
  private readonly _geomMinW = 420
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
  /** issue #27 P3（Task #45 落地前恒为 'remote'）：右栏端点类型。当前右栏恒远程；
   *  实现右栏本地端点后，可切为 'local'（第二本地浏览器）以支撑 本地↔本地 / 远程↔本地 组合。 */
  _rightKind: 'local' | 'remote' = 'remote'

  // ========== issue #27 P1/P0：连接选择器 ==========
  // 注：顶栏连接地址（conn-address）可点击切换端点，选择器浮层由 sftp-file-pane 渲染；
  // 切换端点走顶栏左/右段（左段→左端点选择器，右段→远程连接选择器），面板标签不再触发。
  /** 当前浮层里的可选项（展开时一次性算好，避免模板里反复遍历标签页树） */
  _connOptions: ConnectionOption[] = []
  /** 当前远程会话是否来自「面板所属终端标签页」（决定 cwd 同步是否有意义） */
  _remoteBelongsToOwnTab = true
  /** Tabby AppService，用于枚举所有已开的 SSH 终端标签页 */
  private _appService: AppService | null = null

  // ========== issue #27 P0：左栏连接端点（本地 | 远程） ==========
  /** 左栏当前端点类型：'local' = 本地磁盘（默认，零回归）；'remote' = 独立的第二 SSH 会话 */
  _leftKind: 'local' | 'remote' = 'local'
  /** 左栏远程模式下的 SSH 会话（来源：连接选择器选中的另一个终端标签页） */
  _leftSshSession: SshSession | null = null
  /** 左栏远程模式下的 SFTP 会话（经 sftpService.openFromSSHSession 独立开启） */
  _leftSftpSession: SFTPSessionLike | null = null
  _leftProfile: ProfileInfo | null = null
  /** 左栏远程端点的展示标签（user@host），用于顶栏双地址与选择器 active 标记 */
  _leftHostLabel: string = ''
  /**
   * ★ 2026-10-20：左栏远程端点的连接状态（与右栏 connected/connecting 对称）。
   *
   * 为什么需要独立一套：左栏是**独立的第二 SFTP 通道**（`_leftSftpSession`），右栏的
   *   `_connLifecycle` 心跳/closed$ 监听完全不管它。于是「Tabby 里关掉某个连接标签 →
   *   左栏通道随之失效」时，面板此前毫无反应（用户诉求：双远程时分不清哪个断了）。
   *   左栏自己也订阅一次 SSH 会话的 closed$，并用 `open === false` 兜底轮询。
   */
  _leftConnected = false
  /** 左栏正在建立通道（首次切换 / 重连中），顶栏显示灰点而非红点 */
  _leftConnecting = false
  /** 左栏重连进行中（重连图标置灰防重入） */
  _leftReconnecting = false
  /**
   * 左栏端点切换代际号（★ 2026-10-20 全量审计）。
   * 每次 `switchLeftEndpoint` 领号，异步让出后据此判断自己是否已被后来的切换取代。
   */
  private _leftSwitchGen = 0
  /** 左栏 SSH 会话 closed$ 订阅句柄 */
  private _leftCloseSub: { unsubscribe: () => void } | null = null
  /** 左栏 `open === false` 兜底轮询（closed$ 在个别宿主会话实现上不发射） */
  private _leftCloseWatchTimer: ReturnType<typeof setInterval> | null = null
  /**
   * ★ 2026-10-20：左栏 SSH 会话已销毁（宿主 `willDestroy$` 已发射）。
   *
   * 为什么必须单独记这个标记：实测宿主 `tabby-ssh/src/session/ssh.ts` 的 `destroy()` 只做
   *   `willDestroy$.next()` + `ssh.disconnect()` —— **不会把 `open` 置回 false**，SSHSession 也
   *   没有 `closed$` / `.closed`。上一轮只订阅后两者 ⇒ 关掉 Tabby 标签后左栏毫无反应（用户实测）。
   *   标记留着给「刷新失败」兜底判据用（异步事件可能比刷新晚到）。
   */
  private _leftSessionDestroyed = false
  /** 左栏端点恢复只尝试一次（避免每次面板重建都重新拉一遍标签树） */
  private _leftRestoreTried = false
  /** issue #27 P3：全局唯一连接端点选择器浮层当前展开在哪一栏（null = 收起）。
   *  选择器浮层统一锚定在顶栏地址栏下方，由 _connPickerSide 决定展示左栏还是右栏的候选。 */
  _connPickerSide: 'left' | 'right' | null = null
  /** 左栏选择器候选（本地 + 所有已开 SSH 会话），由 _buildLeftConnOptions 生成 */
  private _leftConnOptions: ConnectionOption[] = []
  /** 右栏选择器候选（远程连接 + 切到本地），由 _buildRightConnOptions 生成 */
  private _rightConnOptions: ConnectionOption[] = []
  /**
   * ★ 2026-10-20 续二十六（用户诉求）：连接选择器要能选**配置里存在但没在 Tabby 打开**的连接。
   *   `listRemoteConnectionOptions()` 走标签树，只能看到已开标签页；未打开的配置只能从
   *   `ProfilesService.getProfiles()` 拿（异步）⇒ 这里缓存一份，供同步构建候选时使用。
   */
  private _knownProfiles: ProfileInfo[] = []
  private _profilesLoading = false
  /** 切到远程前暂存的左栏本地路径，切回「本地」时恢复 */
  private _leftLocalPathReturn = ''
  /** ★ 2026-10-20 续十二：切换端点期间屏蔽「当前目录记忆」——避免把临时复位的 '/' 当成用户选的路径 */
  private _leftPathMemorySuppressed = false
  /**
   * ★ 2026-10-20 续二十七（用户反馈「闪烁感明显、先加载一下才到记忆路径」）：
   *   左栏端点恢复流程进行中 —— 顶栏显示「连接中」而不是先「本地」再跳成远程；
   *   切换时第一次刷新直接用记忆路径（不再先列一次 '/' 空目录）。
   */
  private _leftRestoring = false
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：记忆槽身份（`paneState/perTab/<user@host:port>`）在面板
   *   初始化时**快照**下来，之后不随端点切换（`switchRemoteSession` 会改写 `this.profile`）而漂移。
   *   未初始化时由 `_tabSlotBase()` 首次调用时补算（workspace 模式 profile 可能晚一帧到位）。
   */
  private _hostSlotKey: string | null = null
  /** 用户手动接管（选了别的连接 / 切回本地）→ 放弃恢复轮询，否则稍后会把用户的选择覆盖回去 */
  private _leftRestoreAbort = false
  /** 恢复/切换期间抑制列表刷新的 0.25s 闪烁：连刷两次（'/' → 记忆路径）看起来就是「闪两下」 */
  private _suppressPaneFlash = false
  /** 首帧列表填充完成标记（第一次渲染不闪 —— 面板刚打开时那一下「刷新」没有信息量） */
  private _firstListPainted = false
  /**
   * ★ 2026-10-20 续二十八（用户反馈「连接中是什么意思？看不出在连哪个」）：
   *   两栏各自「正在建立/恢复哪一个连接」的**目标连接名**（空 = 空闲）。
   *   非空时顶栏显示「连接中 <目标>」+ 忙碌点，等待结束（成功/失败/取消）才清空。
   *   右栏也要有：从本地端点选一个远程连接时，`_rightKind` 在切换完成前仍是 local，
   *   只用右栏自身状态判断会显示「本地」，用户同样看不出在连哪台。
   */
  private _leftPendingLabel = ''
  private _rightPendingLabel = ''
  /**
   * ★ 2026-10-20 续三十三（用户纠正文案）：「连接中」说的是**我们自己正在发起连接**，
   *   而自动恢复 / 点重连等待时，实际是在**等 Tabby 那个标签页把会话建起来**（可能还要用户
   *   输密码 / 确认主机指纹）—— 用户原话：「实际上不应该是连接中吧，而是等待连接」。
   *   waiting 与 connecting 共用同一套 pending 机制，只是顶栏与栏内占位文案不同；
   *   `_setConnPending` 里 waiting **不会被内层的 connecting 覆盖**（见该方法注释）。
   */
  private _leftPendingMode: 'connecting' | 'waiting' = 'connecting'
  private _rightPendingMode: 'connecting' | 'waiting' = 'connecting'
  /**
   * 同一 profile 的「打开连接标签页」进行中的 Promise。
   *   用户连点同一条未打开连接时**合并**到同一次开场（否则会并排开出好几个标签页，
   *   而后开的那个又因为会话复用拿不到「新会话」）。
   */
  private _profileOpenInFlight = new Map<string, Promise<unknown | null>>()
  /** ★ issue #27 P0：输入对话框的会话/刷新覆盖——左栏远程端点时 remote-* 操作作用于第二会话 */
  private _inputSessionOverride: SFTPSessionLike | null = null
  private _inputRefreshSide: 'local' | 'remote' | 'rl' = 'remote'

  // ========== 本地面板 ==========
  localPath: string = os.homedir()
  localEntries: LocalEntry[] = []
  /**
   * ★ 2026-10-20（Deepseek-V4.1-Flash）：连接建立期间给文件面板的**恒定空列表**。
   *   模板里不能写 `pending ? [] : …` —— 字面量每轮变更检测都是新数组，
   *   `getLocalGroupRows()` 的缓存按 list 引用比对（_localRowsSource）会被逐轮击穿。
   */
  readonly _EMPTY_LIST: readonly unknown[] = Object.freeze([])
  localFilter = ''
  localFilterPending = ''
  localFilterVisible = false
  /** 单击延迟计时器：防止 click 与 dblclick 冲突 */
  private localClickTimer: ReturnType<typeof setTimeout> | null = null
  localPathInput = this.localPath
  localCache: LocalEntry[] | null = null
  /** 本地选中条目（按 fullPath 匹配，避免框选/点击对象引用不一致） */
  private _selectedLocal: LocalEntry[] = []
  private _localSelectedPaths = new Set<string>()
  get selectedLocal(): LocalEntry[] { return this._selectedLocal }
  set selectedLocal(val: LocalEntry[]) {
    // ★ 2026-10-20：引用相同时避免重复重建 Set（Angular 变更检测可能传递相同引用）
    if (this._selectedLocal === val) return
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
  /** 地址栏定位高亮：当前需要闪烁定位的条目 fullPath（由子组件 sftp-file-pane 读取渲染 .locate-flash） */
  localLocatedPath: string | null = null
  remoteLocatedPath: string | null = null
  private _locateFlashTimer: ReturnType<typeof setTimeout> | null = null
  remoteCache: SFTPFile[] | null = null
  /** 远程选中条目（按 fullPath 匹配） */
  private _selectedRemote: SFTPFile[] = []
  private _remoteSelectedPaths = new Set<string>()
  get selectedRemote(): SFTPFile[] { return this._selectedRemote }
  set selectedRemote(val: SFTPFile[]) {
    // ★ 2026-10-20：引用相同时避免重复重建 Set（Angular 变更检测可能传递相同引用）
    if (this._selectedRemote === val) return
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
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：上一次远程列表刷新失败是否属于「通道已死」
   *   （`isChannelDeadError`：session closed / channel closed / 连接重置）。
   *   connect/reconnect 的「首刷失败」处理据此区分——通道死时保留记忆路径，不回退 '/'。
   *   ⛔ 别用它做 UI 判断（_remoteError 才是给用户看的错误态）。
   */
  _lastRemoteListDead = false

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
  private pendingRlDelete: LocalEntry[] = []

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
  contextMenuPane: 'local' | 'remote' | 'rl' = 'local'

  // ========== 剪贴板 ==========
  clipboardEntries: (LocalEntry | SFTPFile)[] = []
  clipboardSource: 'local' | 'remote' | 'rl' = 'local'
  clipboardMode: 'copy' | 'cut' = 'copy'
  /** 最后点击/操作的面板，用于快捷键判断作用域。
   *  ★ 2026-10-19 P1 修复：由两值扩为三值 —— 右栏可切本地端点（rl），数据槽是
   *    `_rlSelected/_rlPath`，与 `selectedRemote/remotePath` 完全独立。此前 rl 交互一律
   *    把 activePane 置 'remote' ⇒ Delete/F2/F5/Ctrl+C/V/A 全部解析到**陈旧的远程选中集**
   *    （用户看不见、可能已断连）⇒ 确认框里是「幽灵条目」，回车即误删远程文件。
   *    现在 rl 交互置 'rl'，由各入口按三值分流到 `_rl*` 槽位。 */
  activePane: 'local' | 'remote' | 'rl' = 'local'
  /** 方向键导航使用的面板（仅在实际点击条目时更新，不受 mouseenter 悬停影响） */
  private _arrowNavPane: 'local' | 'remote' | 'rl' | null = null
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
  /** ★ 2026-10-20：属性框打开时的远程会话（左栏远程端点用第二会话，null=沿用右栏主会话） */
  private _detailsSession: SFTPSessionLike | null = null
  /** ★ 2026-08-11：文件夹大小按需计算的状态与结果（token 防异步过期回填） */
  detailsCalcState: 'idle' | 'calculating' | 'error' = 'idle'
  detailsCalcResult: string | null = null
  detailsCalcToken = 0


  /** P2-6: 表头右键菜单所需的列可见性快照（模板 [cols] 绑定） */
  get contextColVisibility(): ColVisibilityState {
    const isLocal = this._ctxIsLocalData
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
  /** ★ 2026-10-20：本次 chmod 使用的会话（左栏远程端点为第二会话；null=右栏主会话） */
  private _permSessionOverride: SFTPSessionLike | null = null
  /** 当前修改权限的文件/文件夹名（供对话框显示） */
  permTargetName = ''
  /** ★ 2026-10-16：权限对话框头部图标（与「文件属性」同源：resolveDetailsIcon 的彩色 SVG，
   *  为空时对话框回退内置线条图标） */
  permTargetIsDir = false
  permTargetIcon: string | null = null

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
  /**
   * 分组行缓存（以过滤缓存引用 + 签名判定失效）
   * ★ 2026-10-20 全量审计：三个 `*RowsSource` 存的是**原始条目列表**（LocalEntry/SFTPFile）
   *   的引用，此前被误声明成 `GroupDisplayRow[]` —— 运行时引用比对照旧可用，但类型层面
   *   「与 GroupDisplayRow[] 无重叠」，让 tsc 把缓存命中判定当成永假，掩盖了真实类型错误。
   */
  private _localRowsCache: GroupDisplayRow[] | null = null
  private _localRowsSource: readonly LocalEntry[] | null = null
  private _localRowsSig = ''
  private _remoteRowsCache: GroupDisplayRow[] | null = null
  private _remoteRowsSource: readonly SFTPFile[] | null = null
  private _remoteRowsSig = ''
  /** ★ 2026-10-19：右栏本地端点（rl）分组依据——与左栏本地、远程各自独立，避免互相串改 */
  rlGroupBy: GroupByMode = 'none'
  private _rlCollapsedGroups = new Set<string>()
  private _rlCollapsedVersion = 0
  private _rlRowsCache: GroupDisplayRow[] | null = null
  private _rlRowsSource: readonly LocalEntry[] | null = null
  private _rlRowsSig = ''

  private _loadGroupBy(): void {
    try {
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const gl = localStorage.getItem(`${keyPrefix}.groupByLocal`) as GroupByMode | null
      const gr = localStorage.getItem(`${keyPrefix}.groupByRemote`) as GroupByMode | null
      const gRl = localStorage.getItem(`${keyPrefix}.groupByRl`) as GroupByMode | null
      const valid: GroupByMode[] = ['none', 'name', 'modified', 'type', 'size']
      if (gl && valid.includes(gl)) this.localGroupBy = gl
      if (gr && valid.includes(gr)) this.remoteGroupBy = gr
      if (gRl && valid.includes(gRl)) this.rlGroupBy = gRl
    } catch { /* 使用默认值 */ }
  }

  private _saveGroupBy(pane: 'local' | 'remote' | 'rl'): void {
    try {
      const keyPrefix = SftpFloatingPanel.TABLE_SETTINGS_KEY
      const v = pane === 'local' ? this.localGroupBy : pane === 'remote' ? this.remoteGroupBy : this.rlGroupBy
      const key = pane === 'local' ? 'Local' : pane === 'remote' ? 'Remote' : 'Rl'
      localStorage.setItem(`${keyPrefix}.groupBy${key}`, v)
    } catch { /* 忽略持久化失败 */ }
  }

  /** 设置某面板的分组依据；切回 none 时清空折叠状态与行缓存 */
  setGroupBy(pane: 'local' | 'remote' | 'rl', mode: GroupByMode): void {
    if (pane === 'local') {
      this.localGroupBy = mode
      this._localCollapsedGroups.clear()
      this._localCollapsedVersion++
    } else if (pane === 'remote') {
      this.remoteGroupBy = mode
      this._remoteCollapsedGroups.clear()
      this._remoteCollapsedVersion++
    } else {
      this.rlGroupBy = mode
      this._rlCollapsedGroups.clear()
      this._rlCollapsedVersion++
    }
    this._saveGroupBy(pane)
  }

  /**
   * 分组行签名：过滤缓存引用变化 / 模式 / 排序方向 / 折叠版本 / **界面语言** 任一变化即失效。
   *
   * ★ 2026-10-09 审计根治：原签名只有 `mode|asc|sortBy|collapsedVersion`，**不含 i18n 实例**。
   *   而 buildGroupedRows 会在构建时就把 labeler(b) **求值成字符串**（grouping.ts 里
   *   `row.label = labeler(b)`），于是分组表头文案在缓存里被固化成构建那一刻的语言。
   *   切换语言时（本文件会 `this.i18n = new SftpI18nService(...)` 重建 i18n 实例，
   *   但既不清 _localRowsCache/_remoteRowsCache，也不动签名）
   *   ⇒ 列表引用不变 + 签名不变 ⇒ 缓存命中 ⇒ 返回旧语言的 label
   *   ⇒ **分组表头永久停留旧语言**，而条目行的日期格式会更新（那条路径单独检查了 pattern）
   *   ⇒ 同一屏内「表头是旧语言、行内日期是新语言」的割裂现象。
   *   根治：把 effectiveLang 纳入签名（比 i18n 实例更直接 —— 语言变了这个字符串就变）。
   */
  private _rowsSig(pane: 'local' | 'remote' | 'rl'): string {
    const mode = pane === 'local' ? this.localGroupBy : pane === 'remote' ? this.remoteGroupBy : this.rlGroupBy
    const asc = pane === 'local' ? this.localSortAsc : pane === 'remote' ? this.remoteSortAsc : this._rlSortAsc
    const sortBy = pane === 'local' ? this.localSortBy : pane === 'remote' ? this.remoteSortBy : this._rlSortBy
    const ver = pane === 'local' ? this._localCollapsedVersion : pane === 'remote' ? this._remoteCollapsedVersion : this._rlCollapsedVersion
    // ★ 语言维度：分组表头 label 在 buildGroupedRows 里被求值成字符串，必须参与缓存签名
    const lang = this.effectiveLang || ''
    return `${mode}|${asc ? 1 : 0}|${sortBy}|${ver}|${lang}`
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

  /** ★ 2026-10-19：右栏本地端点（rl）分组显示行——独立状态槽，不与左栏本地串改 */
  getRlGroupRows(): GroupDisplayRow[] | null {
    if (this.rlGroupBy === 'none') return null
    const list = this.getFilteredRlEntries()
    const sig = this._rowsSig('rl')
    if (this._rlRowsSource === list && this._rlRowsSig === sig && this._rlRowsCache) return this._rlRowsCache
    const rows = buildGroupedRows(list, this.rlGroupBy, this._reverseGroups('rl'), this._rlCollapsedGroups, b => this._groupLabel(b))
    this._rlRowsCache = rows
    this._rlRowsSource = list
    this._rlRowsSig = sig
    return rows
  }

  /** 组序是否应反转：分组维度与当前排序列一致且为降序时反转（贴近资源管理器行为） */
  private _reverseGroups(pane: 'local' | 'remote' | 'rl'): boolean {
    const mode = pane === 'local' ? this.localGroupBy : pane === 'remote' ? this.remoteGroupBy : this.rlGroupBy
    const field = groupModeSortField(mode)
    if (!field) return false
    const sortBy = pane === 'local' ? this.localSortBy : pane === 'remote' ? this.remoteSortBy : this._rlSortBy
    const asc = pane === 'local' ? this.localSortAsc : pane === 'remote' ? this.remoteSortAsc : this._rlSortAsc
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
   * 分组表头行：其余区域点击 → 切换该组选中态（全选⇄取消）：
   * 组内条目已全部选中 → 从当前选择集中移除该组条目（其他组的选择保留）；
   * 否则 → 选中该组全部条目（替换当前选择）。
   * 条目按 fullPath 识别，不依赖对象引用。
   * ★ 2026-10-19 修正：此前无修饰键点击永远「整组选中」，导致再次点击无法取消；
   *   现统一为「已全选则取消该组、否则整组选中」的切换语义（对齐文档与用户预期）。
   */
  onLocalGroupSelect(key: string, event: MouseEvent): void {
    // ★ 2026-10-19：框选结束落在分组头上时抑制紧随的 click，保护框选结果（一次性守卫，每链路一处）
    if (this._rubberBand.shouldSuppressGroupHeaderClick()) return
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
    // ★ 2026-10-09 审计根治：本侧锚点清了，对侧却只清选中集、留着 remoteLastSelectedIndex
    //   ⇒ 「远程点第 5 行 → 本地点头（全选）→ 回远程 Shift+点」仍从陈旧的第 5 行起算。
    //   改为两侧都走 _dropSelection（统一口径，同时清锚点与方向键焦点）。
    this._dropSelection('remote')
    this.localLastSelectedIndex = null
    // ★ 2026-09-29：与点击条目行对称——键盘焦点/锚点落在该分组头（导航键），
    //   之后按 Shift+↑/↓ 即可从这一组（表头行）起算区间。
    this._localNavFocusKey = navHeaderKey(key)
    this._localNavAnchorKey = this._localNavFocusKey
    this._localNavCursorOn = false
  }

  /** 分组表头行：其余区域点击（逻辑同 onLocalGroupSelect，作用于远端面板） */
  onRemoteGroupSelect(key: string, event: MouseEvent): void {
    // ★ 2026-10-19：同 onLocalGroupSelect——框选结束后抑制分组头误触 click
    if (this._rubberBand.shouldSuppressGroupHeaderClick()) return
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
    // ★ 2026-10-09：同 onLocalGroupSelect —— 对侧必须连锚点一起清，统一走 _dropSelection
    this._dropSelection('local')
    this.remoteLastSelectedIndex = null
    // ★ 2026-09-29：同 onLocalGroupSelect，键盘焦点/锚点落在该分组头
    this._remoteNavFocusKey = navHeaderKey(key)
    this._remoteNavAnchorKey = this._remoteNavFocusKey
    this._remoteNavCursorOn = false
  }

  /** ★ 2026-10-19：右键菜单「分组依据」分发——按真实面板（含 rl）设置，不再把 rl 误归一为 left-local */
  onGroupByMenuAction(mode: GroupByMode): void {
    const pane = this.contextMenuPane
    this.setGroupBy(pane, mode)
    this.contextMenuVisible = false
    this._safeDetect()
  }

  /** ★ 2026-10-19：右栏本地端点（rl）分组表头箭头点击 → 收/展 */
  onRlGroupToggle(key: string): void {
    if (this._rlCollapsedGroups.has(key)) this._rlCollapsedGroups.delete(key)
    else this._rlCollapsedGroups.add(key)
    this._rlCollapsedVersion++
  }

  /** ★ 2026-10-19：右栏本地端点（rl）分组表头其余区域点击 → 切换该组选中态（全选⇄取消），与左右栏一致 */
  onRlGroupSelect(key: string, event: MouseEvent): void {
    // ★ 2026-10-19：同 onLocalGroupSelect——框选结束后抑制分组头误触 click
    if (this._rubberBand.shouldSuppressGroupHeaderClick()) return
    const rows = this.getRlGroupRows()
    const g = rows?.find(r => r.kind === 'header' && r.bucketKey === key)
    if (!g) return
    const items = (g.items || []) as any[]
    if (!items.length) return
    const sel = (this._rlSelected || []) as any[]
    const paths = new Set(items.map((it: any) => it.fullPath))
    const allSelected = items.every((it: any) => sel.some((s: any) => s.fullPath === it.fullPath))
    if (allSelected) {
      this._rlSelected = sel.filter((s: any) => !paths.has(s.fullPath)) as any
    } else {
      this._rlSelected = [...items] as any
    }
    this._syncRlSelPaths()
    // 对侧选中一并清（统一口径，避免锚点串栏）
    if (this.selectedLocal.length) this._dropSelection('local')
    if (this.selectedRemote.length) this._dropSelection('remote')
    this._rlLastSelectedIndex = null
  }

  /** 右键菜单「展开/收起所有分组」分发：当前面板所有分组全折叠⇄全展开 */
  onGroupToggleAll(): void {
    const pane = this.contextMenuPane
    const collapsed = pane === 'local' ? this._localCollapsedGroups : pane === 'remote' ? this._remoteCollapsedGroups : this._rlCollapsedGroups
    const rows = pane === 'local' ? this.getLocalGroupRows() : pane === 'remote' ? this.getRemoteGroupRows() : this.getRlGroupRows()
    const keys = (rows || []).filter(r => r.kind === 'header' && r.bucketKey != null).map(r => r.bucketKey as string)
    // 只要存在一个未折叠分组 → 折叠全部；否则（已全部折叠或为空）→ 展开全部
    const allCollapsed = keys.length > 0 && keys.every(k => collapsed.has(k))
    collapsed.clear()
    if (!allCollapsed) for (const k of keys) collapsed.add(k)
    if (pane === 'local') this._localCollapsedVersion++
    else if (pane === 'remote') this._remoteCollapsedVersion++
    else this._rlCollapsedVersion++
    this.contextMenuVisible = false
    this._safeDetect()
  }

  /** 当前面板是否所有分组都已折叠（供「展开/收起所有分组」按钮文案） */
  get groupAllCollapsed(): boolean {
    const pane = this.contextMenuPane
    const collapsed = pane === 'local' ? this._localCollapsedGroups : pane === 'remote' ? this._remoteCollapsedGroups : this._rlCollapsedGroups
    const rows = pane === 'local' ? this.getLocalGroupRows() : pane === 'remote' ? this.getRemoteGroupRows() : this.getRlGroupRows()
    const keys = (rows || []).filter(r => r.kind === 'header' && r.bucketKey != null).map(r => r.bucketKey as string)
    return keys.length > 0 && keys.every(k => collapsed.has(k))
  }

  // ========== 表格样式设置（从设置页读取）==========

  private loadTableSettings(): void {
    // ★ 2026-09-28：加载文件列表分组依据
    this._loadGroupBy()
    this._loadRlSort()
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
      const hidRl = localStorage.getItem(`${keyPrefix}.showHiddenRl`)
      const defShow = this._readDefaultShowHidden()
      const newLocal = hidLocal !== null ? JSON.parse(hidLocal) === true : defShow
      const newRemote = hidRemote !== null ? JSON.parse(hidRemote) === true : defShow
      // ★ 2026-10-19 续八：rl 隐藏文件开关独立（表头右键菜单入口），持久化 showHiddenRl
      const newRl = hidRl !== null ? JSON.parse(hidRl) === true : defShow
      if (newLocal !== this.showHiddenLocal) { this.showHiddenLocal = newLocal; this._invalidateLocalCache() }
      if (newRemote !== this.showHiddenRemote) { this.showHiddenRemote = newRemote; this._invalidateRemoteCache() }
      if (newRl !== this._rlShowHidden) { this._rlShowHidden = newRl; this._rlInvalidateCache() }
    } catch { /* 使用默认值 */ }
  }

  /**
   * ★ 2026-10-19 P2-40：恢复右栏本地端点（rl）的排序设置。
   *   与 loadLocalColSettings/loadRemoteColSettings 同口径（读 `paneState/*`、吸收异常），
   *   缺该项时保持默认「按名升序」。
   */
  private _loadRlSort(): void {
    try {
      const raw = this._paneGet('paneState/rightLocalSort')
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (s && s.by && s.by !== 'birthtime') {
        this._rlSortBy = s.by
        this._rlSortAsc = s.asc !== false
      }
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

  // ★ 2026-10-19 续八：rl（右栏本地端点）表头交互态——重排/缩放高亮走 'rl' 键，
  //   避免复用 local* getter 时与左栏本地表头串显（左右都是本地时双表头同时预览）。
  get rlResizingCol(): string | null {
    return this.resizing && this.resizePane === 'rl' ? this.resizeCol : null
  }

  get rlDraggingCol(): string | null {
    return this._headerReorder?.draggingColFor('rl') ?? null
  }

  get rlHeaderPreviewCols(): string[] | null {
    return this._headerReorder?.previewColsFor('rl') ?? null
  }

  get rlHeaderPreviewWidths(): string {
    const preview = this.rlHeaderPreviewCols
    // rl 列序/列宽与左栏本地同组，预览宽度按 local 口径构建
    return preview ? this._buildColWidths('local', preview) : ''
  }

  get rlDropIndicatorCol(): string | null {
    return this._headerReorder?.dropIndicatorColFor('rl') ?? null
  }

  get rlDropIndicatorAfter(): boolean {
    return this._headerReorder?.dropIndicatorAfterFor('rl') ?? false
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
        if (paneList.classList.contains('rl-pane')) {
          this._rlSelected = []
          this._syncRlSelPaths()
        } else if (paneList.classList.contains('local-pane')) {
          this.selectedLocal = []
          this.localLastSelectedIndex = null
        } else if (paneList.classList.contains('remote-pane')) {
          this.selectedRemote = []
          this.remoteLastSelectedIndex = null
        }
        try { this._safeDetect() } catch {}
      }

      // 显示面板级上下文菜单（新建、刷新等）
      // ★ 2026-10-19：右栏本地（rl）面板带 rl-pane 类（与 remote-pane 共存），须优先识别
      const pane: 'local' | 'remote' | 'rl' =
        paneList.classList.contains('rl-pane') ? 'rl'
          : paneList.classList.contains('local-pane') ? 'local' : 'remote'
      this.contextMenuEntry = null
      this.contextMenuPane = pane
      this.zone.run(() => {
        // ★ 2026-10-23：常驻时右键面板空白也不收书签弹层（走 IfNotPinned，与点外部同一口径）
        this.closeBookmarksIfNotPinned()
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





  // ========== 路径模式（四选一）==========
  /** off=关闭 / remember=路径记忆 / sync=与终端同步 / mirror=两栏同步路径（★ 2026-10-22 新增） */
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
      if (raw === 'off' || raw === 'remember' || raw === 'sync' || raw === 'mirror') {
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
      if (v === 'off' || v === 'remember' || v === 'sync' || v === 'mirror') return v
    } catch { /* ignore */ }
    return 'off'
  }

  /**
   * ★ 2026-10-22 续三十六（Deepseek-V4.1-Flash）：设置变更是否应当**立即**应用到本面板。
   *   设置页「配置保存后立即生效」关闭时返回 false，面板忽略 `sftp-plus-settings-changed`
   *   ⇒ 需关闭并重开面板，构造期自然读到新配置。
   *   缺省 true（老用户升级后行为不变）。
   */
  private _settingsApplyLive(): boolean {
    try {
      return this.configService?.store?.['tabby-sftp-plus']?.applySettingsInstantly !== false
    } catch { return true }
  }

  /**
   * 设置页默认路径模式变更时套用（**仅当该连接从未在面板上单独切换过路径模式**）
   * ★ 2026-10-22 续三十八（Deepseek-V4.1-Flash）：去掉 `force` 形参 —— 用户拍板「单独切换过路径模式的
   *   要随该标签页连接保存，只有没有配置的新连接才用默认值」，所以本方法一旦发现 per-host 覆盖就
   *   整段返回，任何入口都不得清覆盖。
   */
  private _applyDefaultPathMode(): void {
    try {
      const raw = localStorage.getItem(this._profileKey(SftpFloatingPanel.PATH_MODE_KEY))
      if (raw === 'off' || raw === 'remember' || raw === 'sync' || raw === 'mirror') return // 已单独设置，保持不变
      const legacy = localStorage.getItem(this._profileKey(SftpFloatingPanel.REMEMBER_PATH_KEY))
      if (legacy === 'true') return
    } catch { return }
    const def = this._readDefaultPathMode()
    // ★ 2026-10-22 续三十七（Deepseek-V4.1-Flash）：两栏不同类时不允许进入「同步路径」——
    //   面板循环入口已禁止，设置页默认值这条路径同样要拦（否则「面板切不到、设置页却生效」）。
    if (def === 'mirror' && !this._panesSameKind()) {
      log.info(`[SFTP+] default path mode 'mirror' skipped: panes differ (left=${this._leftKind}, right=${this._rightKind})`)
      return
    }
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
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：默认值若是「同步路径」，同样立刻对齐一次（两栏同类才动作）
    if (def === 'mirror') void this._mirrorAlignNow()
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
 *    改为 localStorage 直接读写，稳定可靠且不触碰 config.yaml。
 *
 *  ⛔ 2026-10-27（Deepseek-V4.1-Flash）：**这是路径记忆的持久化写入点**，任何「改变当前目录」的入口都必须经过它
 *    （书签本栏跳转 / 书签联动另一栏 / 地址栏回车 / 前进后退 / 上级 / 主目录 / 双击进目录）。
 *    读侧：左栏本地优先 `_ptGet('leftLocalPath')`（导航级记忆，本方法写的 `savedLocalPath` 作兜底），
 *    右栏远程只认本方法写的 `savedRemotePath`（`_loadSavedPaths` 先读 localStorage 同名键，
 *    连上后 `_restoreSavedRemotePath` 再从 config 补一次）。
 *    用户实测反例：点带联动路径的书签后左栏跳到本地数据库目录，重启又回到旧目录；config 里
 *    `leftLocalPath`（导航级记忆）已是新目录、`perHost/<host>/savedLocalPath` 却是旧值 ⇒ 该入口漏调本方法。
 *  ★ 末尾 `_schedulePaneFlush()`：`_paneSet` 只写内存 + `_cache`，不排落盘就只剩 localStorage 那份是新的，
 *    而 `_restoreSavedRemotePath()` 走 `_paneGet`（config 优先）⇒ 下次启动会被 config 里的旧值压回去。
 *    与 `_rememberLeftPath()` 同口径（1.2s 合并写盘）。
 */
  protected saveCurrentPath(): void {
    if (this.pathMode !== 'remember') return
    // ★ 2026-10-20 续十二：切换端点期间 localPath 是被复位的 '/'，不是用户选的路径
    if (this._leftPathMemorySuppressed) return
    try {
      // ★ issue #27 P0：左栏远程端点时 localPath 是 POSIX 路径，不得写入本地路径记忆
      //（否则切回本地后被恢复成 /home/... 之类非法本地路径）
      if (this._leftKind !== 'remote') {
        localStorage.setItem(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY), this.localPath)
        this._paneSet(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY), this.localPath)
      } else if (typeof this.localPath === 'string' && this.localPath.startsWith('/') && this.localPath !== '/') {
        // ★ 2026-10-20 续十二（用户反馈「左栏改远程后路径丢失」）：路径记忆模式此前只有
        //   「本地槽（左栏）+ 远程槽（右栏 remotePath）」两个槽，左栏切到远程后 localPath 是
        //   远程路径却没有归属槽 ⇒ 左栏目录从未被记住。这里补写左栏远程槽（端点记忆命名空间，
        //   与右栏 left/right 对称）。★ 2026-10-21：改走按标签页分槽（_ptSet）。
        //   ★ 2026-10-23：'/' 不写 —— 它几乎总是「端点切换复位值」或「首刷失败兜底值」，
        //     写进记忆会把真实路径永久覆盖成根目录（重连后像丢了路径）。
        this._ptSet('leftRemotePath', this.localPath)
      }
      // ★ 2026-10-23：'/' 不写（同上）；记忆里保留上一次真正的目录，重连后仍能回去
      if (typeof this.remotePath === 'string' && this.remotePath.startsWith('/') && this.remotePath !== '/') {
        localStorage.setItem(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY), this.remotePath)
        // ★ 2026-09-21 P2 修复：同步写嵌套配置路径——_restoreSavedRemotePath 经 _paneGet
        //   嵌套优先读取，只写 localStorage 会让迁移用户的嵌套旧值永远压过新值（路径记忆「卡住」）
        this._paneSet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY), this.remotePath)
      }
    } catch (e) { log.warn('[SFTP+] save path failed', e) }
    // ★ 2026-10-27：排一次落盘（见方法头注释）—— 只在 remember 模式且未被抑制时才走到这里
    this._schedulePaneFlush()
  }

  pathModeTitle(): string {
    if (this.pathMode === 'remember') return this.i18n.t('path.modeRemember')
    if (this.pathMode === 'sync') return this.i18n.t('path.modeSync')
    if (this.pathMode === 'mirror') {
      const base = this.i18n.t('path.modeMirror')
      // ★ 2026-10-22（Deepseek-V4.1-Flash）：不可用时把原因写进 tooltip —— 用户只看到图标高亮
      //   却不明白为什么两栏不跟随（原生 title 支持 \n 换行）
      return this._panesSameKind() ? base : base + '\n' + this.i18n.t('path.mirrorUnavailable')
    }
    return this.i18n.t('path.modeOff')
  }

  /**
   * 循环：关闭 → 路径记忆 → 终端同步 → 同步路径 → 关闭
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：新增「同步路径」档。
   *
   * ★ 2026-10-22 续三十七（Deepseek-V4.1-Flash）：两栏**不同类时不允许切到这一档**
   *   （用户要求「面板中不可以切换到同步路径」）⇒ 跳过它，直接回到「关闭」。
   *   ⛔ 跳过时**必须给提示**：更早的版本是静默跳过，用户以为这一档根本不存在
   *     （原话「为什么面板里切不到同步路径，只能去设置页设」）。现在跳过并 toast 说明原因，
   *     用户知道「不是没有这功能，是当前两栏不是同类」。
   *   ⛔ 也别改成「切过去但不生效」——那会让顶栏高亮一个实际没工作的模式。
   */
  cyclePathMode(): void {
    const order: PathFollowMode[] = ['off', 'remember', 'sync', 'mirror']
    const idx = order.indexOf(this.pathMode)
    let next = order[((idx < 0 ? 0 : idx) + 1) % order.length]
    if (next === 'mirror' && !this._panesSameKind()) {
      this.showToast(this.i18n.t('path.mirrorUnavailable'), 4000)
      next = 'off'
    }
    this.setPathMode(next)
  }

  /**
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：「同步路径」是否可用于当前两栏 —— 端点类型相同即可。
   *   左栏远程 + 右栏远程（哪怕不是同一台主机）⇒ 可用，路径存在性由 _mirrorFollowFrom 探测；
   *   一边本地一边远程 ⇒ 不可用（本地盘路径与远端 POSIX 路径没有可比性）。
   */
  private _panesSameKind(): boolean {
    return (this._leftKind === 'remote') === (this._rightKind === 'remote')
  }

  /**
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：任一栏的**端点类型**变化后调用。
   *   「同步路径」允许在两栏不同类时也切过去（用户能看见这一档），所以必须在两侧都变成
   *   同类的那一刻自动接上 —— 否则用户切到 mirror 后还得再点一次循环，会以为功能没生效。
   *   ⛔ 只在 `pathMode === 'mirror'` 时动作；`_mirrorApplying` 期间直接返回（跟随本身会改路径）。
   */
  private _onPaneKindChanged(): void {
    if (this.pathMode !== 'mirror') return
    if (this._mirrorApplying) return
    if (!this._panesSameKind()) {
      log.info(`[SFTP+] mirror paused: panes differ (left=${this._leftKind}, right=${this._rightKind})`)
      return
    }
    log.info(`[SFTP+] mirror resumed: panes now same kind (left=${this._leftKind}, right=${this._rightKind})`)
    void this._mirrorAlignNow()
  }

  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：镜像同步「正在写另一栏」的守卫，避免两侧互相触发成回路 */
  private _mirrorApplying = false

  /**
   * 进入「同步路径」时对齐一次：先按左栏路径对齐右栏；左栏路径在另一侧不存在时反向对齐。
   * 两栏不同类（本地↔远程）时直接不动。
   */
  private async _mirrorAlignNow(): Promise<void> {
    if (this.pathMode !== 'mirror' || !this._panesSameKind()) return
    if (await this._mirrorFollowFrom('left', true)) return
    await this._mirrorFollowFrom('right', true)
  }

  /**
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：「同步路径」——把 from 栏的当前目录同步到另一栏。
   * 返回是否真的导航了（供 _mirrorAlignNow 判断要不要反向再来一次）。
   *
   * ⛔ 只在 `pathMode === 'mirror'` 且两栏同类时动作；对端没有该目录时**静默跳过**并写 info 日志：
   *   远程↔远程常是两台不同主机，目录结构未必一致，弹「无法访问」会打断正常浏览。
   * ⛔ `_mirrorApplying` 必须在 await 之前置位、finally 复位：跟随动作本身会触发另一栏的
   *   refresh 回调（那里也会调本方法），没有这个守卫会让两侧互相追着跑。
   */
  private async _mirrorFollowFrom(from: 'left' | 'right', force = false): Promise<boolean> {
    if (this.pathMode !== 'mirror') return false
    if (!this._panesSameKind()) return false
    if (this._mirrorApplying) return false
    const peerIsLocal = from === 'left' ? this._rightKind === 'local' : this._leftKind === 'local'
    const src = from === 'left'
      ? this.localPath
      : (this._rightKind === 'remote' ? this.remotePath : this._rlPath)
    const peer = from === 'left'
      ? (this._rightKind === 'remote' ? this.remotePath : this._rlPath)
      : this.localPath
    if (!src || typeof src !== 'string') return false
    if (!force && this._sameDirText(src, peer, peerIsLocal)) return false

    let exists = true
    try { exists = await this._otherPanePathExists(from, src) } catch { exists = true }
    if (!exists) {
      log.info(`[SFTP+] mirror: peer pane has no dir, skip ${from} -> ${src}`)
      return false
    }

    this._mirrorApplying = true
    try {
      if (from === 'left') {
        if (this._rightKind === 'remote') {
          if (!this.connected || !this.sftpSession) return false
          this._pushRemoteNav(src)
          this.remotePath = src
          this.remotePathInput = src
          await this.refreshRemote()
        } else {
          await this._rlGo(src)
        }
      } else {
        this._pushLocalNav(src)
        this.localPath = src
        this.localPathInput = src
        await this.refreshLocal()
      }
      // ★ 2026-10-22 续三十五（Deepseek-V4.1-Flash）：成功跟随留一行可 grep 的日志，
      //   与上面的 skip 日志配对 —— 用户报「不同步」时只需看 `[SFTP+] mirror:` 这两类
      log.info(`[SFTP+] mirror: ${from} -> ${src}`)
      return true
    } catch (e) {
      log.warn('[SFTP+] mirror follow failed:', e)
      return false
    } finally {
      this._mirrorApplying = false
    }
  }

  private setPathMode(mode: PathFollowMode): void {
    const prev = this.pathMode
    this.pathMode = mode
    this.savePathMode()
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：一行日志定论「切没切过去 / 为什么没跟随」，
    //   排查看 log.txt 里的 `[SFTP+] path mode ->`
    log.info(`[SFTP+] path mode -> ${mode} (left=${this._leftKind}, right=${this._rightKind}, mirrorUsable=${this._panesSameKind()})`)

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
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：切到「同步路径」时立即对齐一次（两栏当前目录不同的情况）
    if (mode === 'mirror') void this._mirrorAlignNow()
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
    // ★ 2026-10-20 全量审计 P2：`tryGetTerminalCwd()` 是一次 SSH exec（可能耗时数秒）。
    //   原实现只在 await **之前**查了 pathMode/connected，之后直接拿结果写 `remotePath` 并刷新：
    //   等待期间用户若关掉同步、断开连接或切换会话，一个**过期终端的 CWD** 会覆盖当前远程
    //   目录并把列表刷到别的机器上。这里快照两个前置条件，回来后逐条复查。
    const sshAtCall = this.sshSession
    const pathModeAtCall = this.pathMode

    const cwd = await this.tryGetTerminalCwd()
    if (this.pathMode !== pathModeAtCall || !this.connected) return
    if (sshAtCall && this.sshSession !== sshAtCall) return
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
   *   ★ 优先级：过矮(too-short) > 偏窄(≤_AUTO_NARROW_WIDTH) —— 矮面板里上下堆叠会把两侧
   *   列表压到看不见数据行，只有左右并排两边都留得下可滚动区域（2026-09-30 用户实测）
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
    // ★ 2026-09-30：过矮优先于「偏窄」。原判定把 `w <= _AUTO_NARROW_WIDTH`（960）放在过矮之前，
    //   于是 ≈895×322 这类「略窄又过矮」的面板被短路成上下堆叠：堆叠要占两份工具栏 + 两份状态行，
    //   竖直空间再一分为二，两侧列表各只剩「列头 + 计数」行、一条数据都看不到（用户截图实测）。
    //   矮面板里只有左右并排能给两边都留下可滚动的数据行，故把 tooShort 提到窄判之前。
    if (tooShort) return { split: 'horizontal', reason: null }
    if (tooNarrow || w <= SftpFloatingPanel._AUTO_NARROW_WIDTH) return { split: 'vertical', reason: null }
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
    if (this.showBookmarks && !this.bookmarkPinned) {
      // ★ 2026-10-23（Deepseek-V4.1-Flash）：**非常驻**才关。常驻时用户宁可位置略挪也不愿弹层凭空消失，
      //   重锚交给 `_resyncBookmarkPopupsOnLayout()`（在 `_applyPaneSplit()` 尾部、**布局已应用之后**）。
      //   ⛔ 别在这里提前 clamp：此时 pane 还是旧几何，横排→竖排切换会算错贴齐位置。
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

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：布局/分栏尺寸变化后，把已打开的书签弹层重新贴回本栏。
   *   调用点唯一：`_applyPaneSplit()` 尾部（布局已落盘的单一出口），因此分栏拖动、最大化/还原、
   *   设置页改布局、窄窗横竖排切换都会走到这里。
   *   ⛔ 别改成「缩放就关弹层」：常驻语义就是留在原地（用户明确要求）。
   *   ⛔ 别挪到 `_closeFloatingPanelsOnResize()`：那时布局还没应用，pane 仍是旧几何。
   * ★ 2026-10-23 续：**不再只对常驻生效**（原先 `if (!bookmarkPinned) return`）。
   *   非常驻弹层在窗口缩放时仍由 `_closeFloatingPanelsOnResize()` 关掉；但「改布局 / 拖分栏」
   *   这类不改窗口尺寸的路径不会触发那条关闭逻辑，不重排就会停在旧坐标。
   */
  private _resyncBookmarkPopupsOnLayout(): void {
    if (!this.showBookmarks) return
    this._clampBookmarkPopupToRoot()
    this._safeDetect()
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

  /**
   * 恢复路径（仅路径记忆模式）。
   * 写法：左栏本地路径优先 `paneState/leftLocalPath`（perTab 导航级记忆，每次列表刷新成功必写），
   *      perHost `savedLocalPath`（localStorage，saveCurrentPath 写入点）兜底；右栏远程路径读
   *      perHost `savedRemotePath`（localStorage），连上后 `_restoreSavedRemotePath()` 再从 config 补一次。
   */
  private _loadSavedPaths(): void {
    this.loadPathMode()
    // ★ issue #27 P3：端点记忆（与路径记忆模式相互独立，pathMode 关闭也要恢复）
    this._restoreRightEndpoint()
    try {
      if (this.pathMode === 'remember') {
        // ★ 2026-10-27（Deepseek-V4.1-Flash）：左栏本地路径**优先取 perTab `leftLocalPath`**。
        //   它是导航级记忆（refreshLocal 成功后由 `_rememberLeftPath()` 必写、不看 pathMode），
        //   比 perHost `savedLocalPath` 更新更全 —— 后者依赖每个导航入口自觉调用 saveCurrentPath()，
        //   历史上漏过（书签联动那条路），旧值会让「明明跳过去了、重启又回到上一轮目录」。
        //   perHost 值仍作兜底：老配置里可能只有它。⛔ 取的是绝对路径才用（'/' 等复位值不算）。
        const tabLocal = this._ptGet('leftLocalPath')
        const savedLocal = localStorage.getItem(this._profileKey(SftpFloatingPanel.SAVED_LOCAL_PATH_KEY))
        const effLocal = (typeof tabLocal === 'string' && tabLocal && path.isAbsolute(tabLocal))
          ? tabLocal
          : savedLocal
        if (effLocal && typeof effLocal === 'string') {
          this.localPath = effLocal; this.localPathInput = effLocal
        }
        const savedRemote = localStorage.getItem(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
        // ★ 2026-10-23：'/' 视作被兜底值污染的旧记忆，忽略（见 saveCurrentPath 的同条注释）
        if (savedRemote && savedRemote !== '/' && typeof savedRemote === 'string') {
          this.remotePath = savedRemote; this.remotePathInput = savedRemote
        }
      }
    } catch (e) { log.warn('Failed to load saved paths', e) }
    // ★ 续二十七：这次左栏要恢复成远程时，等待期间先显示**上次的本地目录**（而不是 home）——
    //   恢复是异步的（等 Tabby 建好连接标签），这段窗口里列表至少是用户熟悉的内容，
    //   不会出现「一个陌生目录闪一下又变成远程」。
    this._primeLeftLocalPathForRestore()
  }

  /** 左栏记忆中「切走前的本地目录」预置为当前路径（仅在左栏本次要恢复为远程时生效） */
  private _primeLeftLocalPathForRestore(): void {
    try {
      if (this._ptGet('endpoints/left') !== 'remote') return
      const p = this._ptGet('leftLocalPath')
      if (typeof p !== 'string' || !path.isAbsolute(p)) return
      this.localPath = p
      this.localPathInput = p
      this._leftLocalPathReturn = p
    } catch { /* ignore */ }
  }

  /** connect() 后恢复远程路径（防止 getDefaultRemotePath 覆盖） */
  private _restoreSavedRemotePath(): void {
    try {
      const savedRemote = this._paneGet(this._profileKey(SftpFloatingPanel.SAVED_REMOTE_PATH_KEY))
      // ★ 2026-10-23：'/' 视为「被首刷失败兜底值污染」的旧记忆，忽略它（别把用户钉在根目录）
      if (typeof savedRemote === 'string' && savedRemote.startsWith('/') && savedRemote !== '/') {
        this.remotePath = savedRemote
        this.remotePathInput = savedRemote
      }
    } catch { /* 忽略 */ }
  }

  // ========== issue #27 P3：右栏本地端点（第二本地浏览器，与左栏状态完全独立） ==========
  _rlPath = ''
  _rlPathInput = ''
  _rlEntries: LocalEntry[] = []
  _rlSelected: LocalEntry[] = []
  private _rlSelectedPaths = new Set<string>()
  private readonly _rlNav = new PaneNavHistory(50)
  private _rlRefreshGen = 0
  private _rlLastListedPath = ''
  private _rlEntriesRev = 0
  _rlSortBy: 'name' | 'size' | 'modified' | 'birthtime' = 'name'
  _rlSortAsc = true
  /** v1 限制：隐藏文件开关暂与右栏远程独立且无 UI 入口（列配置/排序持久化复用左栏本地） */
  _rlShowHidden = false
  _rlFilter = ''
  _rlFilterVisible = false
  _rlFilterPending = ''
  _rlLoading = false
  _rlFlash = false
  private _rlFlashTimer: ReturnType<typeof setTimeout> | null = null
  _rlError = false
  _rlDragOver = false
  /** ★ 2026-10-19 续七：地址栏定位高亮（sftp-file-pane [locatedPath] 渲染 .locate-flash） */
  _rlLocatedPath: string | null = null
  private _rlLocateFlashTimer: ReturnType<typeof setTimeout> | null = null
  private _rlFilteredCache: LocalEntry[] | null = null
  private _rlCacheKey = ''
  private _rlLastSelectedIndex: number | null = null
  private _rlClickTimer: ReturnType<typeof setTimeout> | null = null

  get canRlBack(): boolean { return this._rlNav.canBack }
  get canRlForward(): boolean { return this._rlNav.canForward }
  canRlUp(): boolean {
    if (!this._rlPath) return false
    const parent = path.dirname(this._rlPath)
    return parent !== this._rlPath
  }

  isRlSelectedFn = (e: LocalEntry): boolean => this._rlSelectedPaths.has(e.fullPath)
  _rlSortArrowFn = (col: string): string => {
    // ★ 2026-10-18：与 sortArrow() 统一字符（▲/▼）并补列名映射（date→modified、created→birthtime）——
    //   此前用 ↑/↓ 且拿原始列 id 直接比对 _rlSortBy：字符与左右栏不一致，日期列箭头永不显示。
    const mapped = col === 'date' ? 'modified' : col === 'created' ? 'birthtime' : col
    return mapped === this._rlSortBy ? (this._rlSortAsc ? '▲' : '▼') : ''
  }

  private _syncRlSelPaths(): void {
    this._rlSelectedPaths = new Set(this._rlSelected.map(e => e.fullPath))
  }

  private _pruneRlSelection(): void {
    if (!this._rlSelected.length) return
    const alive = new Set(this._rlEntries.map(e => e.fullPath))
    const next = this._rlSelected.filter(e => alive.has(e.fullPath))
    if (next.length !== this._rlSelected.length) {
      this._rlSelected = next
      this._syncRlSelPaths()
    }
  }

  private _rlInvalidateCache(): void {
    this._rlFilteredCache = null
    this._rlCacheKey = ''
  }

  getFilteredRlEntries(): LocalEntry[] {
    const key = `${this._rlEntriesRev}|${this._rlFilter}|${this._rlSortBy}|${this._rlSortAsc}|${this._rlShowHidden}|${this.pinFoldersLocal}|${getDateFormatPattern()}`
    if (this._rlFilteredCache && key === this._rlCacheKey) return this._rlFilteredCache
    let entries = filterByHidden([...this._rlEntries], this._rlShowHidden)
    entries = filterByName(entries, this._rlFilter)
    this._rlFilteredCache = sortLocalEntries(entries, this._rlSortBy, this._rlSortAsc, this.pinFoldersLocal)
    this._decorateCells(this._rlFilteredCache)
    this._rlCacheKey = key
    return this._rlFilteredCache
  }

  /** ★ 2026-10-19 续八：列控制器钩子——rl owner/group 列开关后重列 rl（覆写基类 no-op） */
  protected override async refreshRl(): Promise<void> {
    await this._rlRefresh()
  }

  /** 右栏本地目录刷新（结构与左栏 refreshLocal 一致，状态写入 _rl* 槽位） */
  async _rlRefresh(): Promise<void> {
    if (!this._rlPath || typeof this._rlPath !== 'string') return
    this._rlPathInput = this._rlPath
    const gen = ++this._rlRefreshGen
    const requestedPath = this._rlPath
    // 目录切换即丢弃选择（与左栏同规则：在 await 之前同步执行）
    if (this._rlLastListedPath !== requestedPath) {
      this._rlLastListedPath = requestedPath
      this._rlSelected = []
      this._syncRlSelPaths()
    }
    this._rlFlash = false
    try {
      // v1：owner/group 列显示原始 uid/gid（不复用 _enrichLocalOwnerNames——它绑定左栏状态槽）
      // ★ 2026-10-19 续八：needOwner 随列可见性动态取（rl 共用左栏本地列开关），
      //   否则表头右键开启 owner/group 列后 rl 永远空白列
      const needOwner = this.localShowColOwner || this.localShowColGroup
      const entries = await this._listLocalEntries(requestedPath, needOwner)
      if (gen !== this._rlRefreshGen) return
      if (this._rlPath !== requestedPath) return
      this.zone.run(() => {
        this._rlEntries = entries
        this._rlEntriesRev++
        this._rlError = false
        this._rlInvalidateCache()
        this._pruneRlSelection()
      })
    } catch (e) {
      if (gen !== this._rlRefreshGen) return
      log.error('[rl] Local listing failed', e)
      this.zone.run(() => {
        this._rlEntries = []
        this._rlEntriesRev++
        this._rlError = true
        this._rlInvalidateCache()
      })
    }
    if (gen !== this._rlRefreshGen) return
    // ★ 2026-10-22：同步路径模式（右栏本地 → 左栏本地）
    void this._mirrorFollowFrom('right')
    this._rlFlash = true
    this._safeDetect()
    if (this._rlFlashTimer) clearTimeout(this._rlFlashTimer)
    this._rlFlashTimer = setTimeout(() => { this._rlFlash = false; this._rlFlashTimer = null }, 260)
  }

  private async _rlNavigateTo(target: string, ignorePush: boolean): Promise<void> {
    const t = path.resolve(target)
    if (!t) return
    if (t === this._rlPath) { this._rlPathInput = this._rlPath; return }
    this._rlNav.push(t, ignorePush)
    this._rlPath = t
    this._rlPathInput = t
    this._persistRightEndpoint()
    await this._rlRefresh()
  }

  async _rlGo(dir: string): Promise<void> { await this._rlNavigateTo(dir, false) }
  _rlBack(): void { const t = this._rlNav.back(); if (t) void this._rlNavigateTo(t, true) }
  _rlForward(): void { const t = this._rlNav.forward(); if (t) void this._rlNavigateTo(t, true) }
  _rlUp(): void { if (this._rlPath) void this._rlGo(path.dirname(this._rlPath)) }
  _rlHome(): void { void this._rlGo(os.homedir()) }

  _rlPathEnter(): void {
    const raw = (this._rlPathInput || '').trim()
    if (!raw) { this._rlPathInput = this._rlPath; return }
    // ★ 2026-10-19 续七：对齐 issue #26 地址栏定位语义——
    //   以分隔符结尾 ⇒ 整段当目录；否则拆「父目录 + 末段」：末段是目录则进入，
    //   是文件则跳到父目录并高亮定位（此前整段直接当目录 stat，文件路径必报「无法访问」）。
    const trailingSep = /[\\/]$/.test(raw)
    const eff = path.resolve(path.isAbsolute(raw) ? raw : path.join(this._rlPath || os.homedir(), raw))
    if (trailingSep) { void this._rlNavigateTo(path.normalize(eff), false); return }
    const leaf = path.basename(eff)
    const navDir = path.dirname(eff)
    void (async () => {
      if (navDir !== this._rlPath) await this._rlNavigateTo(navDir, false)
      else await this._rlRefresh()
      // 父目录列表就绪后定位末段（对齐 _afterLocateCheck 的三态语义）
      const list = this.getFilteredRlEntries()
      const entry = list && list.length ? list.find(e => e.name === leaf) : null
      if (!entry) return
      if (entry.isDirectory) {
        if (eff !== this._rlPath) await this._rlNavigateTo(eff, false)
        return
      }
      this._rlLocateEntry(entry)
    })()
  }

  /** ★ 2026-10-19 续七：rl 面板条目定位——单选 + 清对侧选中 + 滚动居中 + 闪烁（对齐 _locateEntryByName） */
  private _rlLocateEntry(entry: LocalEntry): void {
    const list = this.getFilteredRlEntries()
    if (!list || !list.length) return
    if (this.selectedLocal.length) this.selectedLocal = []
    if (this.selectedRemote.length) this.selectedRemote = []
    this._rlSelected = [entry]
    this._syncRlSelPaths()
    this._rlLastSelectedIndex = list.indexOf(entry)
    this.syncPaneSelectionVisual('rl')
    this._safeDetect()
    // 闪烁：先清后设保证重复定位可重放；rAF 内再滚动——列表刚刷新需等下一帧 CD 渲染
    this._rlLocatedPath = null
    this._safeDetect()
    requestAnimationFrame(() => {
      if (!this._isAlive) return
      this._rlLocatedPath = entry.fullPath ?? null
      this._safeDetect()
      this._scrollRowElIntoView('rl', 'data-path', entry.fullPath, 'center')
      if (this._rlLocateFlashTimer) clearTimeout(this._rlLocateFlashTimer)
      this._rlLocateFlashTimer = setTimeout(() => {
        this._rlLocatedPath = null
        this._safeDetect()
        this._rlLocateFlashTimer = null
      }, 1300)
    })
  }

  onRlPathBlur(): void {
    this._rlPathInput = this._rlPath
    this._safeDetect()
  }

  /** ★ 2026-10-18：形参修正为 PaneSortAction——onSortCol emit 的是 {col} 对象，此前把对象
   *  当字段名传给 computeSortToggle 导致 _rlSortBy 被污染，rl 表头排序自诞生起从未生效
   *  （模板 JIT 绑定不查类型，构建期零报错）。与 onLocalSort/onRemoteSort 同构。 */
  onRlSort(e: PaneSortAction): void {
    const r = computeSortToggle(this._rlSortBy, this._rlSortAsc, e.col as any, this._colJustResized)
    if (!r) return
    this._rlSortBy = r.by
    this._rlSortAsc = r.asc
    // ★ 2026-10-19 P1（audit）：顺序变了 ⇒ Shift 连选下标/锚点失效（同 setLocalSort）
    this._resetSelectionIndex('rl')
    // ★ 2026-10-19 P2-40：rl 排序此前从不持久化（左右栏都有 `sftp-plus-*-sort` + flush，
    //   唯独 rl 漏掉）⇒ 换个 Tabby 会话就回到默认「按名升序」，三栏行为不一致。
    //   同 *_paneSet 铁律：写内存后必须紧跟 _paneFlush()，否则直接关窗口（不走 ngOnDestroy）就丢。
    try {
      this._paneSet('paneState/rightLocalSort', { by: r.by, asc: r.asc })
      this._paneFlush()
    } catch {}
    this._rlInvalidateCache()
    this._safeDetect()
  }

  applyRlFilter(): void { this._applyFilter('rl'); this._safeDetect() }

  clearRlFilter(): void { this._clearFilter('rl'); this._safeDetect() }

  /** 单击选择：与 selectLocal 同语义（框选抑制守卫在入口、跨面板清选、computeSelection 复用） */
  _rlClick(entry: LocalEntry, event: MouseEvent, idx: number): void {
    // ★ 2026-10-19 P1：rl 交互必须落 'rl'，否则 Delete/F2/F5/Ctrl+C/V/A 全解析到
    //   陈旧的 selectedRemote（幽灵条目）。方向键导航在 rl 侧尚未支持，置 'rl' 后
    //   _handleArrowNav 直接不认领（按键交还宿主），绝不再去动远程选中集。
    this.activePane = 'rl'
    this._arrowNavPane = 'rl'
    if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
    if (this.selectedLocal.length > 0) this._dropSelection('local')
    if (this.selectedRemote.length > 0) this._dropSelection('remote')
    if (this._rlClickTimer) { clearTimeout(this._rlClickTimer); this._rlClickTimer = null }
    this._rlClickTimer = setTimeout(() => { this._rlClickTimer = null }, 250)
    const r = computeSelection(this._rlSelected, entry, event, idx, this._rlLastSelectedIndex, this.getFilteredRlEntries(), this._rlSelectedPaths, null)
    this._rlSelected = r.selection
    this._rlLastSelectedIndex = r.lastIndex
    this._syncRlSelPaths()
    this._safeDetect()
  }

  /** 双击：目录进入；文件用系统默认程序打开（v1 不接内置查看器） */
  _rlDblClick(entry: LocalEntry, event: MouseEvent): void {
    if (this._rlClickTimer) { clearTimeout(this._rlClickTimer); this._rlClickTimer = null }
    if (entry.isDirectory) { void this._rlGo(entry.fullPath); return }
    try {
      const { shell } = require('electron')
      void shell.openPath(entry.linkTarget || entry.fullPath)
    } catch (e) { log.warn('[rl] openPath failed', e) }
  }

  getRlSelectionInfo(): string {
    const count = this.getFilteredRlEntries().length
    let s = this.i18n.t('pane.items', { count })
    if (this._rlSelected.length) {
      const total = this._rlSelected.reduce((a, e) => a + (e.isDirectory ? 0 : (e.size ?? 0)), 0)
      const sizePart = this.formatSize(total)
      s += this.i18n.t('pane.selectedInfo', { n: this._rlSelected.length, size: sizePart })
    }
    return s
  }

  /** 拖拽起点：与 onDragStartLocal 同构（OS 拖出 + 面板间 local-paths payload），源换成 _rl 槽位 */
  onDragStartRl(ev: DragEvent, entry: LocalEntry): void {
    const src = this._resolveDragSource(ev, entry, this._rlSelected)
    if (!src) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    const cur = path.resolve(this._rlPath)
    this._fileDnd.setDragSource('remote', src.every(e => path.resolve(path.dirname(e.fullPath)) === cur))
    const p: DragPayload = { kind: 'local-paths', paths: src.map(e => ({ fullPath: e.linkTarget || e.fullPath, name: e.name, isDirectory: e.isDirectory })), srcPane: 'right' }
    ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p))

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

  onDragOverRl(ev: DragEvent): void {
    ev.preventDefault()
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
    if (!this._rlDragOver) { this._rlDragOver = true; this._safeDetect() }
    this._updateDropFolderHint(ev)
  }

  onDragEnterRl(ev: DragEvent): void { this.onDragOverRl(ev) }

  onDragLeaveRl(ev: DragEvent): void {
    this._onDropHintLeave(ev)
    if (this._rlDragOver) { this._rlDragOver = false; this._safeDetect() }
  }

  async onDropRl(ev: DragEvent): Promise<void> {
    this._clearDropFolderHint()
    // ★ v1 明确不收「远程 → 右本地」内部拖拽：drop.ts 的下载通道绑定右栏远程会话，
    //   来源若为左栏远程端点时会话归属错误——宁可明确拒收也不能错传（后续扩展会话感知端口后放开）。
    try {
      const raw = ev.dataTransfer?.getData('application/x-sftp-plus')
      if (raw && JSON.parse(raw)?.kind === 'remote-paths') { ev.preventDefault(); return }
    } catch { /* 非 JSON payload 按 OS 拖放处理 */ }
    this._rlDragOver = false
    // 落点：文件夹行 → 该目录；其余 → 当前目录（与左栏本地同规则）
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：跨栏 / 外部拖入且开启「只投放到当前目录」时，
    //   _resolveDropDestDir 返回 undefined ⇒ 落到 _rlPath（右栏当前目录）。
    const crossPane = this._dropPayloadSrcPane(ev) !== 'right'
    const destDir = this._resolveDropDestDir(ev, 'local', crossPane) || this._rlPath
    // ★ issue #27 P3：右栏是物理右栏——跨栏同目录拖放需要绕过「同目录无操作」早退
    await this._fileDropRuntime.onDrop(ev, 'local', destDir, 'right')
    void this._rlRefresh()
    this._safeDetect()
  }

  /** 切换右栏到本地端点（保留远程会话对象，切回远程时免重连） */
  async _switchRightToLocal(): Promise<void> {
    this._rightKind = 'local'
    // ★ 2026-10-19 P1：切到 rl 时必须**清空远程槽位**。此前不清 ⇒ 右栏已是本地浏览器但
    //   selectedRemote 仍留着切走前的选中集，Delete/F2/Ctrl+C 会作用于这批「看不见的幽灵条目」
    //   （_resolveTargetPane 已三值化不再回落 remote，这里补上数据层面的兜底清理）。
    if (this.selectedRemote.length) {
      this.selectedRemote = []
      this.remoteLastSelectedIndex = null
    }
    this._remoteNavFocusKey = null
    this._remoteNavAnchorKey = null
    this._remoteNavCursorOn = false
    if (this._arrowNavPane === 'remote') this._arrowNavPane = null
    if (this.activePane === 'remote') this.activePane = 'rl'
    this._rlNav.clear()
    this._rlSelected = []
    this._syncRlSelPaths()
    let saved: unknown = null
    try { saved = this._ptGet('rightLocalPath') } catch { /* ignore */ }
    const p = (typeof saved === 'string' && saved) ? saved : os.homedir()
    this._rlPath = ''
    this._rlPathInput = ''
    await this._rlNavigateTo(p, false)
    this._persistRightEndpoint()
    this._safeDetect()
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：右栏切成本地后与左本地同类 ⇒ mirror 立刻对齐一次
    this._onPaneKindChanged()
  }

  /** 端点记忆：右栏端点类型 + 本地路径持久化（★ 2026-10-21 起按标签页分槽） */
  private _persistRightEndpoint(): void {
    try {
      this._ptSet('endpoints/right', this._rightKind)
      if (this._rlPath) this._ptSet('rightLocalPath', this._rlPath)
      this._paneFlush()
    } catch { /* ignore */ }
  }

  /** 端点记忆恢复（_loadSavedPaths 内调用，与路径记忆相互独立）。
   *  v1 只恢复 right='local'（免连远程即可交互）；'remote' 保持默认初始流程（自动重连所属标签页会话）。 */
  private _restoreRightEndpoint(): void {
    try {
      const kind = this._ptGet('endpoints/right')
      if (kind !== 'local') return
      this._rightKind = 'local'
      const saved = this._ptGet('rightLocalPath')
      const p = (typeof saved === 'string' && saved) ? saved : os.homedir()
      this._rlPath = p
      this._rlPathInput = p
      void this._rlRefresh()
    } catch { /* ignore */ }
  }

  // ========== 2026-10-20：左栏端点记忆（与右栏端点记忆对称） ==========

  /**
   * ★ 2026-10-21（用户反馈「多标签页左栏互相串台，重启后都变成最后一次切换的连接」）：
   *   端点/路径记忆必须按**标签页**分槽，不能全局单槽。
   *
   * 此前 `paneState/endpoints/left`、`paneState/leftRemoteHost`、`paneState/leftRemotePath`、
   * `paneState/leftLocalPath`、`paneState/endpoints/right`、`paneState/rightLocalPath` 全是
   * **全局单槽**：每个标签页的面板实例都读写同一份 ⇒ 会话中后导航的标签页覆盖先前的，
   * 重启后每个标签页都恢复成「最后一个落盘的连接/路径」。
   * 现按面板所属标签页的连接身份（user@host:port，来自 `this.profile`——面板挂在哪个
   * SSH 标签页下就是哪台机）分槽存取；无 profile 的本地标签页沿用全局槽（兼容旧行为）。
   * 读取时 perTab 槽优先、全局槽兜底（老版本升级过渡期仍能读到旧值）。
   */
  private _tabSlotBase(): string | null {
    // ★ 2026-10-23（Deepseek-V4.1-Flash）：槽身份**只认宿主标签页**，初始化后锁定。
    //   成因（用户实测「切成本地，重启后又变回远程等待」）：原先每次都现读 `this.profile`，
    //   而 `switchRemoteSession()`（右栏换连接）会把它改写成新连接 ⇒ 此后 `_persistLeftEndpoint()`
    //   把端点写进了**另一个槽**；重启后面板 profile 回到宿主标签，读的是原槽 ⇒ 读到旧的
    //   `endpoints/left: remote`，于是又去恢复那个远程连接。配置里能看到两个 perTab 槽
    //   各自记着不同的 left 值，就是槽位漂移的直接证据。
    if (!this._hostSlotKey) {
      const k = this._computeHostSlotKey()
      if (k) this._hostSlotKey = k
    }
    return this._hostSlotKey
  }

  /** 由当前 profile 计算宿主槽 key（只在初始化时用一次，见 _hostSlotKey） */
  private _computeHostSlotKey(): string | null {
    const o: any = this.profile?.options || {}
    const host = String(o.host || '').trim().toLowerCase()
    if (!host) return null
    const user = String(o.username || o.user || '')
    const port = Number(o.port) || 22
    return `paneState/perTab/${encodeURIComponent(user)}@${encodeURIComponent(host)}:${port}`
  }

  /**
   * 按标签页分槽读（perTab 槽优先，全局槽兜底）。
   *
   * ⛔ 身份类字段（endpoints/*、leftRemoteHost）在有 perTab 槽身份时**不回退全局槽**：
   *   老版全局槽的语义是「最后一个写者的连接」——首个升级重启若回退它，会复现
   *   「多标签页全部恢复成同一个连接」。路径类字段回退无害（顶多路径不对），保留兜底。
   */
  private _ptGet(field: string, def?: any): any {
    const base = this._tabSlotBase()
    if (base) {
      const v = this._paneGet(`${base}/${field}`)
      if (v !== undefined) return v
      if (field === 'endpoints/left' || field === 'endpoints/right' || field === 'leftRemoteHost') return def
    }
    return this._paneGet(`paneState/${field}`, def)
  }

  /** 按标签页分槽写（全局槽同步写一份：无身份面板唯一可用槽 + 旧版本回退仍可读） */
  private _ptSet(field: string, val: any): void {
    const base = this._tabSlotBase()
    if (base) this._paneSet(`${base}/${field}`, val)
    this._paneSet(`paneState/${field}`, val)
  }

  /**
   * ★ 2026-10-20（用户诉求）：左栏端点此前**完全没有持久化** ——
   *   `_persistRightEndpoint` 只存右栏，`_leftKind` / `_leftSshSession` / `_leftHostLabel`
   *   全是内存态 ⇒ 「双远程各连一个」重启 Tabby 后只有右栏恢复，左栏退回本机磁盘。
   *
   * 只存**连接身份**（host/user/port + 展示标签），不存 session 对象：重启后 session 早已重建，
   *   恢复时按身份到当前标签树里重新匹配（见 _restoreLeftEndpoint）。
   *
   * ★ 2026-10-20 续十二（用户反馈「切成本地→远程后路径丢失」）：
   *   ① `keepPath=true` —— `switchLeftEndpoint` 切连接时会把 `localPath` 复位成 '/'（防跨主机串目录），
   *      那是**临时复位值、不是用户选的路径**，不能拿它覆盖已记住的 `leftRemotePath`；
   *   ② 存 remote 端点时顺带保住 `leftLocalPath`（左栏切走前的本地目录）。否则切到远程后
   *      本地返回路径只剩内存里的 `_leftLocalPathReturn`，重启即丢，切回本地只能落到 home。
   */
  private _persistLeftEndpoint(keepPath = false): void {
    try {
      // 诊断（可 grep）：kind + 落到的槽 + 当前 profile host（槽位漂移时两者会对不上）
      log.info('[SFTP+] persist left endpoint: kind=' + this._leftKind
        + ' slot=' + String(this._tabSlotBase() || '(global)')
        + ' profileHost=' + String(this.profile?.options?.host || '(none)'))
      this._ptSet('endpoints/left', this._leftKind)
      if (this._leftKind === 'remote') {
        const o = this._leftProfile?.options || {}
        const host = String(o.host || '')
        // ⛔ 2026-10-21：断开态（`_leftProfile` 为空 / 恢复超时）时**不覆盖已存的连接身份**。
        //   本方法会被 ngOnDestroy 无条件调用，若此处把 host/user/port 写成空串，下次启动
        //   连「上次连的是哪台」都匹配不上 —— 记忆被自己的收尾逻辑抹掉。
        if (host) {
          this._ptSet('leftRemoteHost', {
            host,
            user: String(o.username || o.user || ''),
            port: Number(o.port) || 22,
            label: this._leftHostLabel || '',
          })
        } else if (this._leftRememberedIdentity()) {
          this._ptSet('leftRemoteHost', this._leftRememberedIdentity())
        }
        if (!keepPath && typeof this.localPath === 'string' && this.localPath.startsWith('/')) {
          this._ptSet('leftRemotePath', this.localPath)
        }
        // 切到远程时把「切走前的本地目录」一并落盘（localPath 此刻是 POSIX 路径，不能写进本地槽）
        if (this._leftLocalPathReturn && path.isAbsolute(this._leftLocalPathReturn)) {
          this._ptSet('leftLocalPath', this._leftLocalPathReturn)
        }
      } else if (typeof this.localPath === 'string' && this.localPath) {
        this._ptSet('leftLocalPath', this.localPath)
      }
      this._paneFlush()
    } catch { /* ignore */ }
  }

  /** 已记住的左栏远程连接身份（perTab 槽优先，全局槽兜底）；无则 null */
  private _leftRememberedIdentity(): { host: string; user: string; port: number; label: string } | null {
    try {
      const s: any = this._ptGet('leftRemoteHost')
      if (s && typeof s === 'object' && s.host) {
        return {
          host: String(s.host),
          user: String(s.user || ''),
          port: Number(s.port) || 22,
          label: String(s.label || ''),
        }
      }
    } catch { /* ignore */ }
    return null
  }

  /**
   * 左栏当前连接的身份指纹（`user@host:port`）。用于判断「切换连接前后是不是同一台机」：
   *   同一台机 → 保留已记住的远程路径；换了机器 → 路径记忆必须跟着换，不能拿旧机的目录去列新机。
   */
  private _leftEndpointHostKey(): string {
    const o = this._leftProfile?.options || {}
    const host = String(o.host || '').trim().toLowerCase()
    if (!host) return ''
    const user = String(o.username || o.user || '')
    const port = Number(o.port) || 22
    return `${user}@${host}:${port}`
  }

  /**
   * 左栏当前目录记忆（不 flush —— 与既有 `_paneSet` 约定一致：内存写入，随 ngOnDestroy /
   *   beforeunload 一起落盘）。导航级调用，频率可控。
   *
   * ⛔ 2026-10-20 续十二：`switchLeftEndpoint` 会把 localPath 临时复位成 '/' 再 refreshLocal，
   *   而 refreshLocal 成功后会调本方法 —— 若不屏蔽，「复位值」会被当成用户选的路径写进记忆
   *   （`_persistLeftEndpoint(keepPath)` 只跳过写盘，挡不住这里已经写进内存的值）。
   */
  private _rememberLeftPath(): void {
    if (this._leftPathMemorySuppressed) return
    try {
      if (this._leftKind === 'remote') {
        // ★ 2026-10-23：'/' 不写 —— 复位值/首刷失败兜底值不该覆盖真正的路径记忆
        if (typeof this.localPath === 'string' && this.localPath.startsWith('/') && this.localPath !== '/') {
          this._ptSet('leftRemotePath', this.localPath)
        }
      } else if (typeof this.localPath === 'string' && this.localPath) {
        this._ptSet('leftLocalPath', this.localPath)
      }
    } catch { /* ignore */ }
    // ★ 续三十三：记忆立即进内存，但落盘必须排一次 —— 否则直接退出 Tabby 时这一笔会丢，
    //   下次启动读到的还是上一次 flush 的旧路径（用户实测重连后停在 '/'）。
    this._schedulePaneFlush()
  }

  /** 保存的连接身份 ↔ 当前候选连接（host+user+port 全等才算同一个；缺 host 时退回标签比对） */
  private _connMatchesSaved(
    opt: any,
    saved: { host?: string; user?: string; port?: number; label?: string },
  ): boolean {
    if (!opt) return false
    const o = opt.profile?.options || {}
    const host = String(o.host || '').trim().toLowerCase()
    const user = String(o.username || o.user || '').trim()
    const port = Number(o.port) || 22
    const wantHost = String(saved.host || '').trim().toLowerCase()
    if (wantHost && host) {
      if (host !== wantHost) return false
      if (saved.user && user && user !== saved.user) return false
      if (saved.port && port !== Number(saved.port)) return false
      return true
    }
    // 拿不到 profile（个别 provider）时退回展示标签比对，避免直接放弃恢复
    return !!saved.label && String(opt.label || '') === saved.label
  }

  /**
   * ★ 续三十一（Deepseek-V4.1-Flash）：按**连接身份**到 Tabby 配置里找 profile。
   *
   * 用途：重启后自动恢复超时 → 左栏进「断开态」，此时 `_leftProfile` 是空的（本次从未 switch 成功），
   *   而断开态的两件事都离不开 profile：① 别名模式下顶栏要显示连接名；② 点重连要
   *   `openNewTabForProfile(profile)` 重开标签页。没有它就只能弹「该连接已关闭」+ 让用户手选。
   *
   * 查不到不是错误：返回 null，调用方按兜底路径处理（顶栏显示账号@地址 / 重连时弹连接选择器）。
   */
  private async _resolveProfileByIdentity(saved: any): Promise<any | null> {
    if (!saved) return null
    // 0) 已经有 profile 且就是这一条 → 直接用
    if (this._leftProfile && this._connMatchesSaved({ profile: this._leftProfile, label: this._leftHostLabel }, saved)) {
      return this._leftProfile
    }
    // 1) 缓存为空 → 拉一次（getProfiles 是 async，且 'includeBuiltin:false' 只留能连 SFTP 的）
    if (!this._knownProfiles.length) await this._refreshKnownProfiles()
    // 2) 并发时 `_refreshKnownProfiles` 会因 in-flight 守卫立刻返回、缓存仍为空 ⇒ 短轮询等它填好
    //    （最多 2s；查不到就走兜底，绝不阻塞恢复流程本身）
    for (let i = 0; i < 20 && !this._knownProfiles.length; i++) {
      if (!this._isAlive) return null
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    const hit = this._knownProfiles.find((p: any) => {
      const o: any = p?.options || {}
      const host = String(o.host || '').trim()
      if (!host) return false
      const user = String(o.username || o.user || '')
      const port = Number(o.port) || 22
      return this._connMatchesSaved({ profile: p, label: user ? `${user}@${host}` : host }, saved)
    })
    return hit || null
  }

  /**
   * ★ 2026-10-20：重启后恢复左栏远程端点。
   *
   * 时序坑：Tabby 恢复标签页与建立 SSH 会话都是异步的，面板 ngOnInit 时标签树可能还没就绪
   *   （`tab.sshSession` 为 null）⇒ 这里最多轮询 30s（60 × 500ms）等目标连接出现，
   *   找到后走与手动切换**完全相同**的 `switchLeftEndpoint`（复用开通道/清导航栈/刷新逻辑）。
   * ★ 续三十一（用户诉求）：等不到不再「退回本机磁盘」，而是保留该远程端点并置为**断开态**
   *   （顶栏红点 + 重连图标，见 `_enterLeftDisconnectedState`）—— 用户点一下就重连。
   */
  private async _restoreLeftEndpoint(): Promise<void> {
    // 只跑一次（ngOnInit 调用）。此处不判 `_leftKind === 'remote'`：TS 会在函数入口把这个字段
    // 窄化成 'local'，之后 `await switchLeftEndpoint()` 的副作用它不认 ⇒ 后面的 remote 判断报 TS2367。
    if (this._leftRestoreTried) return
    let kind: any = null
    let saved: any = null
    try {
      // ★ 2026-10-21：按标签页分槽读取（perTab 优先，全局槽兜底）
      kind = this._ptGet('endpoints/left')
      saved = this._ptGet('leftRemoteHost')
    } catch { /* ignore */ }
    // 诊断（可 grep）：读到的槽与内容 —— 「切本地重启后仍恢复远程」看这一行即可定位槽位是否漂移
    log.info('[SFTP+] restore left endpoint: slot=' + String(this._tabSlotBase() || '(global)')
      + ' kind=' + String(kind) + ' saved=' + String(saved?.label || saved?.host || '(none)')
      + ' profileHost=' + String(this.profile?.options?.host || '(none)'))
    if (kind !== 'remote' || !saved || (!saved.host && !saved.label)) return
    this._leftRestoreTried = true
    // ⛔ 2026-10-20 续十二（用户反馈「重开面板左栏变回 /」）：路径必须在 `switchLeftEndpoint`
    //   **之前**快照。switch 内部会把 localPath 复位成 '/' 并 `_persistLeftEndpoint(true)`；
    //   若在 switch 之后再读配置，读到的可能已是复位值（旧版就是这样，永远恢复成 '/'）。
    let savedPath = ''
    let savedLocalPath = ''
    try {
      const p = this._ptGet('leftRemotePath')
      if (typeof p === 'string' && p.startsWith('/')) savedPath = p
      const lp = this._ptGet('leftLocalPath')
      if (typeof lp === 'string' && path.isAbsolute(lp)) savedLocalPath = lp
    } catch { /* ignore */ }
    // ★ 续三十一：先按身份把 profile 找出来 —— 别名显示与「断开后点重连」都需要它
    //   （这时 `_leftProfile` 还是 null：本次从未 switch 成功过）。
    const profile = await this._resolveProfileByIdentity({ host: saved.host, user: saved.user, port: saved.port, label: saved.label })
    // 最多等 30s：Tabby 恢复标签页 → 建立 SSH（可能要认证）全部是异步的
    // ★ 续二十七：等待期间顶栏就显示「连接中」，而不是先显示「本地」再跳成远程（那种跳变很刺眼）
    this._leftRestoring = true
    this._suppressPaneFlash = true
    // ★ 续二十八：等待窗口（最长 30s）就报出**要恢复的是哪个连接** —— 自动恢复时用户早就
    //   忘了上次左栏连的是谁，只写「连接中」等于没说。
    // ★ 续三十一：按设置格式化（别名 / 账号@地址）
    // ★ 续三十三：自动恢复是「等 Tabby 把标签页/会话建起来」⇒ waiting，不是我们自己连接中。
    this._setConnPending('left', this._connDisplayText(String(saved.label || saved.host || ''), profile), 'waiting')
    try {
      for (let i = 0; i < 60; i++) {
        if (!this._isAlive || this._leftRestoreAbort) return
        const opt = this.listRemoteConnectionOptions().find(o => this._connMatchesSaved(o, saved))
        if (opt) {
          // ★ 2026-10-23：命中连接后还要复查一次 —— 上面的 await（profile 解析 / 500ms 间隔）
          //   期间用户可能已经切成本地或点过重连，那时不能再抢回来。
          if (this._leftRestoreAbort) {
            log.info('[SFTP+] left endpoint restore superseded before switch, skip')
            return
          }
          log.info('[SFTP+] restoring left endpoint:', saved.label || saved.host)
          // ★ 续二十七：把记忆路径作为首目录传进去 —— 只刷新一次，直接落在目标目录
          //   （`_leftRestoring` 保持到 switch 结束，顶栏全程显示「连接中」，结束后直接落到远程态）
          await this.switchLeftEndpoint(opt, savedPath || undefined)
          if (this._leftKind === 'remote') {
            try {
              if (savedLocalPath) this._leftLocalPathReturn = savedLocalPath
              // switch 内部已按 firstPath 刷新并落盘；这里只补「切走前的本地目录」
              this._persistLeftEndpoint()
            } catch { /* ignore */ }
          }
          return
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    } finally {
      this._leftRestoring = false
      this._suppressPaneFlash = false
      // ★ 续二十八：恢复结束（成功 / 失败 / 用户抢占）都要清掉「连接中 <目标>」
      this._clearConnPending('left')
    }
    // ★ 2026-10-23（Deepseek-V4.1-Flash）：用户已抢占恢复（切本地 / 点重连 / 打开选择器）⇒
    //   什么都别做：既不改左栏状态，也不弹「未恢复」toast（用户已经自己处理了，再弹等于骂人）。
    //   ⛔ 这行判断必须放在 _enterLeftDisconnectedState 之前 —— 它就是「超时后远程又回来」的元凶。
    if (this._leftRestoreAbort) {
      log.info('[SFTP+] left endpoint restore aborted by user action, skip disconnected fallback:', saved.label || saved.host)
      return
    }
    log.info('[SFTP+] left endpoint not restored (connection not found):', saved.label || saved.host)
    // ★ 续三十一（用户诉求原话：「如果未在时间内连上，不用断开改为本地连接，而是像断开一样，
    //   然后可以点击重连」）：这里**不再退回本机磁盘**，改为把左栏置成「远程但已断开」——
    //   顶栏显示红点 + 重连图标，用户点一下就重开这个连接。
    //   原实现在这里静默变成本地，用户只会以为「左栏路径/连接记忆又失效了」。
    this._enterLeftDisconnectedState(saved, profile, savedPath, savedLocalPath)
    // 告知原因（不再说「已回到本机磁盘」——那已经不是实际行为了，文案同步改过）
    try {
      this.showToast(this.i18n.t('notify.leftEndpointNotRestored', { host: saved.label || saved.host }), 5000)
    } catch { /* ignore */ }
  }

  /**
   * ★ 续三十一（Deepseek-V4.1-Flash，用户诉求）：自动恢复等不到连接时，把左栏置为
   *   「远程端点 + 已断开」而不是退回本地。
   *
   * 为什么不能退回本地：重启 Tabby 后左栏悄悄变回本机磁盘，用户第一反应是「记忆失效/插件坏了」；
   *   而「远程(x@y) + 红点 + 重连图标」语义明确 —— 这台机这次没连上，点一下重连即可。
   *
   * ⛔ 只改内存态，**不调用 `_persistLeftEndpoint()`**：它按 `_leftProfile.options` 反写
   *   `paneState/leftRemoteHost`，而这里的 profile 可能是 null 或兜底查来的另一份对象 ⇒
   *   会把原来正确的 host/user/port 写成空串，下次启动连身份都匹配不上（记忆被自己抹掉）。
   *   只把 `endpoints/left` 维持为 'remote' 就够了，身份沿用配置里原有的那份。
   */
  private _enterLeftDisconnectedState(saved: any, profile: any, savedPath: string, savedLocalPath: string): void {
    this._leftKind = 'remote'
    this._leftHostLabel = String(saved?.label || saved?.host || '')
    if (profile) this._leftProfile = profile
    this._leftSshSession = null
    this._leftSftpSession = null
    this._leftConnected = false
    this._leftConnecting = false
    this._leftReconnecting = false
    // 会话不存在 ⇒ 点重连时必须走「重开标签页」那条路（_reconnectLeftPane 的首个判据就是它）
    this._leftSessionDestroyed = true
    this._unwatchLeftSession()
    // 停在记忆里的远程目录：重连成功后直接回到这里，而不是先落在 '/'
    if (savedLocalPath) this._leftLocalPathReturn = savedLocalPath
    // ★ 2026-10-20（Deepseek-V4.1-Flash）：调用方传进来的 savedPath 可能为空（恢复流程取值时机
    //   或历史版本没写这个槽）——此时绝不能直接落到 '/'：那会让「记忆路径」看起来像是被清掉了。
    //   再回读一次持久化记忆兜底（同一份数据，但时机更晚、更可能是有效值）。
    const p = (typeof savedPath === 'string' && savedPath.startsWith('/')) ? savedPath : (this._leftRememberedPath() || '/')
    this.localPath = p
    this.localPathInput = p
    // 列表清空 + 走「连接已断开」空态（与 _markLeftDisconnected 同一套渲染路径）
    this.localEntries = []
    this._localError = false
    this._invalidateLocalCache()
    this._lastLocalListedPath = null
    try { this._ptSet('endpoints/left', 'remote') } catch { /* ignore */ }
    this._safeDetect()
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
  // ★ 2026-10-25：「全部连接」筛选（空字符串 = 全部连接）
  logFilterProfile = ''
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
  /**
   * 等待用户在目录不存在对话框上做出选择的 resolver **队列**。
   *
   * ★ 2026-10-19 P2-14：原先是**单槽**字段 `_dirMissingResolve`，两个致命后果：
   *   ① 并发预检（多选批量传输里每个 `_ensureTransferTargetDir` 都是 async）时，第二个
   *      `_askDirMissing` 会把第一个的 resolve **覆盖掉** ⇒ 第一个 await 永远不 settle
   *      ⇒ 那批传输永久挂起、进度条目卡在「传输中」；
   *   ② 面板销毁后没有任何人再 resolve ⇒ promise 永不返回（await 后面的代码全不执行）。
   *   改为队列：用户做一次选择就一次性 resolve 全部等待者（同一目录的同一决定）；
   *   ngOnDestroy 统一按 'cancel' 收口，杜绝「永不 settle」。
   */
  private _dirMissingResolvers: Array<(c: 'create' | 'fallback' | 'cancel') => void> = []
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
    /** ★ issue #27 P3：操作模式（copy/cut）；剪切模式覆盖/重命名成功后删源 */
    mode?: 'copy' | 'cut';
    /** 与原始粘贴条目对应的稳定键（粘贴去重用） */
    entryKey?: string;
    /** 来源传输上下文（目录传输冲突入队时携带，覆盖/重命名成功后翻正传输记录） */
    transferCtx?: any;
    /** ★ issue #27 P3：远程↔远程冲突——携带两端会话与主机标签，覆盖/重命名由 doR2rTransfer 执行 */
    r2rTransfer?: {
      srcSession: any; dstSession: any; isDir: boolean; mode?: number;
      srcHostLabel?: string; dstHostLabel?: string;
    };
    /**
     * ★ 2026-10-20：**端点化冲突**——源/目标可以是「本机磁盘 / 左栏远程（第二会话）/ 右栏远程 /
     *   右栏本地(rl)」任意组合。字段映射与 r2rTransfer 一致：localPath=源、remotePath=目标；
     *   覆盖/重命名由面板的 `_doEndpointTransfer` 按两端 isLocal 分派执行（见 core/conflict.ts）。
     */
    endpointTransfer?: NonNullable<ConflictQueueItem['endpointTransfer']>;
    /** 内容摘要（冲突框展示用） */
    localDigest?: string | null;
    remoteDigest?: string | null;
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
    // ★ 2026-10-16 issue #27 P1：枚举已开 SSH 标签页（连接选择器数据源）
    try {
      this._appService = injector.get(AppService, null as any)
    } catch {
      this._appService = null
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
      // ★ 2026-10-23：框选（拖出选择框）属于「点其它位置」，常驻时不收书签弹层
      closeBookmarks: () => panel.closeBookmarksIfNotPinned(),
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
      // ★ 2026-10-18 issue #27：右栏端点路由 —— 右栏为本地浏览器（rl）时 'remote' 侧数据槽
      //   切到 _rlSelected/getFilteredRlEntries（rl 选中集写入后须同步路径集，供 isRlSelectedFn 高亮）
      rightPaneIsLocalBrowser: () => panel._rightKind === 'local',
      getRightPaneSelection: () => panel._rightKind === 'local' ? panel._rlSelected : panel.selectedRemote,
      setRightPaneSelection: (v) => {
        if (panel._rightKind === 'local') { panel._rlSelected = v as any; panel._syncRlSelPaths() }
        else panel.selectedRemote = v as any
      },
      getRightPaneLastSelectedIndex: () => panel._rightKind === 'local' ? panel._rlLastSelectedIndex : panel.remoteLastSelectedIndex,
      setRightPaneLastSelectedIndex: (v) => {
        if (panel._rightKind === 'local') panel._rlLastSelectedIndex = v
        else panel.remoteLastSelectedIndex = v
      },
      getRightPaneFilteredEntries: () => panel._rightKind === 'local' ? panel.getFilteredRlEntries() : panel.getFilteredRemoteEntries(),
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
      // ★ issue #27 P3：本地→本地复制分支的守卫（左栏为远程端点时 localPath 是 POSIX 路径，不可写）
      // ★ 2026-10-20：补右栏判断 —— 右栏可切成本地浏览器（rl），此时它才是真本地磁盘；
      //   缺这条时「拖到右栏本地」会被当成远程落点。
      isLocalPaneTarget: (pane) => pane === 'local'
        ? panel._leftKind !== 'remote'
        : panel._rightKind === 'local',
      get effectiveLang() { return panel.effectiveLang },
      get i18n() { return panel.i18n },
      get notifications() { return panel.notifications },
      get selectedLocal() { return panel.selectedLocal as any[] },
      set selectedLocal(v) { panel.selectedLocal = v as any },
      get selectedRemote() { return panel.selectedRemote as any[] },
      set selectedRemote(v) { panel.selectedRemote = v as any },
      hasConflictQueue: () => panel._conflictQueue.length > 0,
      // ★ issue #27 P3：本地→本地复制遇同名时入队「本地同栏」冲突（覆盖/跳过/重命名），
      //   复用 conflict.ts 的 _samePaneOverwrite/_samePaneRename 解决。drop.ts 的 _copyIntoLocalDir
      //   在循环末统一调 showConflictDialog()，此处只负责构造并推入冲突项。
      enqueueLocalSamePaneConflict: (src, dest, isDir) => {
        let srcSt: { size: number; mtimeMs: number } | null = null
        let dstSt: { size: number; mtimeMs: number } | null = null
        try { srcSt = fsSync.statSync(src) } catch { /* 源不可读按 0 */ }
        try { dstSt = fsSync.statSync(dest) } catch { /* 目标不可读按 0 */ }
        const item = {
          localPath: dest,          // 目标（对话框「本地」侧）
          remotePath: src,          // 源（对话框「远程」侧）
          remoteDir: path.dirname(src),
          fileName: path.basename(dest),
          localStat: ((dstSt ?? { size: 0, mtimeMs: 0 }) as any) as unknown as fsSync.Stats,
          remoteFileSize: srcSt?.size,
          remoteFileMtime: srcSt?.mtimeMs,
          direction: 'upload' as const,
          isSamePane: true,
          samePaneSource: 'local' as const,
          isDirectory: isDir,
          mode: 'copy' as const,
        }
        panel._conflictQueue.push(item)
        panel.conflictOriginalTotal = Math.max(panel.conflictOriginalTotal, panel._conflictQueue.length)
      },
      resetFileDragState: () => panel._resetFileDragState(),
      uploadPathToRemote: (remoteDir, localPath) => panel.uploadPathToRemote(remoteDir, localPath),
      streamUploadOne: (localPath, destRemoteDir) => panel._streamUploadOne(localPath, destRemoteDir),
      // ★ 2026-09-29（四）：拖拽链路的多选批量打包入口（与 ctxUpload 共用同一个实现，
      //   保证「多选」这个事实只在 _tryBatchUpload 一处被翻译成批量请求）
      tryUploadBatch: (localPaths, remoteDir) => panel._tryBatchUpload(localPaths, remoteDir),
      streamDownloadOne: (file, targetLocalDir) => panel._streamDownloadOne(file, targetLocalDir),
      // ★ 2026-10-20（用户反馈）：目标栏是远程端点时的拖放落点 —— 与右键「传输」
      //   走同一条 r2r 通道（冲突框 / remote-copy 记录 / 进度条目）。
      transferRemoteEntries: (entries, destDir, destPane) =>
        panel._dropRemoteToRemoteEndpoint(entries, destDir, destPane),
      // ★ 2026-10-20：本机条目拖到左栏远程端点（上传）——冲突执行体端点化后不再需要拒绝
      uploadLocalToRemoteEndpoint: (localPaths, destDir) =>
        panel._dropLocalToRemoteEndpoint(localPaths, destDir),
      // ★ 2026-10-19（Hy3）：按文件系统刷新（左栏本地 + 右栏本地 rl / 右栏远程 + 左栏远程端点），
      //   拖放落到 rl 或左栏远程端点时，原先的 refreshLocal/refreshRemote 会刷到错误的栏
      refreshLocal: () => panel._refreshLocalFsPanes(),
      refreshRemote: () => panel._refreshRemoteFsPanes(),
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
      // ★ 2026-10-19 P2-9：把「被取消」如实传给日志 —— 取消/中断与真出错必须可区分，
      //   否则取消一个目录传输在日志里也显示成「出错」。
      finishFolderTransfer: (ctx, success, reason) =>
        panel._finishFolderTransfer(ctx.t, ctx.startTime, ctx.logEntryId, success, reason),
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
      uploadRaw: (remotePath, localPath, onProgress) =>
        panel._doUploadRaw(remotePath, localPath, onProgress),
      downloadTopLevel: (remotePath, localPath, mode, size) =>
        panel._doDownload(remotePath, localPath, mode, size),
      downloadRaw: (remotePath, localPath, mode, size, onProgress) =>
        panel._doDownloadRaw(remotePath, localPath, mode, size, onProgress),
      refreshRemote: () => panel._refreshRemoteFsPanes(),
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
      refreshLocal: () => panel._refreshLocalFsPanes(),
      refreshRemote: () => panel._refreshRemoteFsPanes(),
      // ★ 2026-10-20（用户反馈）：「本机↔本机」的粘贴复制也记一条 local-copy ——
      //   与右键「传输」口径一致（该操作类型与日志对话框渲染早已存在，此前没有任何写入点）。
      onLocalCopy: (srcPath, dstPath, isDirectory) => {
        const now = Date.now()
        try {
          panel.transferLog.add({
            operation: 'local-copy',
            localPath: srcPath,
            remotePath: dstPath,
            srcPath,
            dstPath,
            srcHostLabel: panel.i18n.t('pane.local'),
            dstHostLabel: panel.i18n.t('pane.local'),
            success: true,
            size: undefined,
            duration: 0,
            startTime: now,
            pending: false,
          })
        } catch (e) { log.warn('[paste] local-copy log failed:', e) }
        panel._safeDetect()
      },
      // ★ 2026-10-20 全量审计：同栏**远程**粘贴复制补一条 remote-copy（与右键「传输」、
      //   拖拽、跨栏粘贴同一 operation 口径）。此前该动作在传输日志里完全不可见。
      onRemoteCopy: (srcPath, dstPath, isDirectory) => {
        const now = Date.now()
        try {
          panel.transferLog.add({
            operation: 'remote-copy',
            localPath: srcPath,
            remotePath: dstPath,
            srcPath,
            dstPath,
            srcHostLabel: panel.hostInfo || undefined,
            dstHostLabel: panel.hostInfo || undefined,
            success: true,
            size: undefined,
            duration: 0,
            startTime: now,
            pending: false,
          })
        } catch (e) { log.warn('[paste] remote-copy log failed:', e) }
        panel._safeDetect()
      },
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

      // 注意：冲突解决器的 refreshRemote 契约返回 boolean（此处没有调用方使用该值）
      refreshRemote: () => panel._refreshRemoteFsPanes().then(() => true),
      refreshLocal: () => panel._refreshLocalFsPanes(),
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
      // ★ 2026-10-20：远程侧扫描必须能带会话 —— 端点化冲突的远程侧可能是左栏远程端点（第二会话）
      scanRemoteDir: (p, sessionOverride) => panel._scanRemoteDir(p, sessionOverride),
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
      // ★ issue #27 P3：远程↔远程冲突（覆盖/重命名）执行体——源/目标会话由冲突项的 r2rTransfer 携带。
      //   文件走 transferRemoteToRemoteFile（写入即覆盖），目录走 transferRemoteDirToRemote（mkdir 已存在忽略 + 逐子项覆盖）。
      doR2rTransfer: async (srcPath, dstPath, isDir, payload) => {
        const t0 = Date.now()
        let ok = false
        try {
          if (isDir) {
            ok = await transferRemoteDirToRemote(payload.srcSession, srcPath, payload.dstSession, dstPath, {})
          } else {
            ok = await transferRemoteToRemoteFile(payload.srcSession, srcPath, payload.dstSession, dstPath, { mode: payload.mode })
          }
        } catch (e) {
          log.error('[r2r] conflict doR2rTransfer failed:', srcPath, '->', dstPath, e)
          ok = false
        }
        // ★ 2026-10-20（用户反馈）：冲突框里选「覆盖/重命名」后真正执行的这次 r2r 复制原先**不写记录**
        //   （入队时只弹了框，没有任何日志）⇒ 用户在传输记录里完全看不到这次互传。现补一条终态记录。
        try {
          panel.transferLog.add({
            operation: 'remote-copy',
            localPath: srcPath,
            remotePath: dstPath,
            srcPath,
            dstPath,
            srcHostLabel: payload.srcHostLabel,
            dstHostLabel: payload.dstHostLabel,
            success: ok,
            size: undefined,
            duration: Date.now() - t0,
            startTime: t0,
            pending: false,
          })
        } catch (e) { log.warn('[r2r] conflict log failed:', e) }
        panel._safeDetect()
        return ok
      },
      // ★ 2026-10-20（用户诉求）：冲突执行体端点化 —— 覆盖/重命名不再假定「本机磁盘 ↔ 面板主会话」，
      //   两端真实身份（本机 / 左栏远程第二会话 / 右栏远程 / 右栏本地 rl）由冲突项的 endpointTransfer
      //   携带，这里按两端 isLocal 四组合分派（执行与记录都在 _doEndpointTransfer 里收口）。
      doEndpointTransfer: (srcPath, dstPath, payload) =>
        panel._doEndpointTransfer(srcPath, dstPath, payload),
      deleteAtEndpoint: (p, isDir, payload) =>
        panel._deleteAtEndpoint({ isLocal: payload.src.isLocal, sftp: payload.src.session }, p, isDir),
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
    // ★ 2026-10-19 P2-29：新式嵌套路径（`paneState/...`）**原样透传**。
    //   本表此前只做「旧扁平 key → 新嵌套路径」的单向映射，而 issue #27 起的右栏端点代码
    //   （_persistRightEndpoint / _restoreRightEndpoint）直接以 `paneState/endpoints/right`、
    //   `paneState/rightLocalPath` 调用 _paneSet/_paneGet ⇒ 查表必然 miss ⇒ 全部回落
    //   localStorage：既进不了 config.yaml，导出时不带、导入时也不认（导出/导入不对称）。
    //   透传后读写走同一份 config；旧数据仍由 _paneGet 的 localStorage 兜底读到，不丢。
    if (key.startsWith('paneState/')) return key
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
      } else if (Array.isArray(cfg?.paneHeaderOrder) && cfg.paneHeaderOrder.length && Array.isArray(cfg?.paneToolbarOrder)) {
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
      // ★ 2026-10-23：首刷失败时区分「通道死」与「目录不可用」，前者保留记忆路径不回退 '/'
      lastRemoteListErrorWasDead: () => panel._lastRemoteListDead,
      tryGetTerminalCwd: () => panel.tryGetTerminalCwd(),
      pushRemoteNav: (p) => panel._pushRemoteNav(p),
      clearNavHistory: () => {
        // ★ 2026-10-19 P2-7：这里**只清远程导航栈**。原先连 `panel._localNav` 一起清，
        //   而本回调的唯一调用方是 disconnect()（切换右栏远程会话、断开连接、面板销毁），
        //   本地栏根本没换目录 —— 切一下右栏会话就把本地的「后退/前进」历史抹掉，
        //   用户无法再回到刚才浏览过的本地目录。
        panel._remoteNav.clear()
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

    // ★ 2026-10-23：槽身份要在任何「切换端点」动作之前锁定（switchRemoteSession 会改写 this.profile）
    this._hostSlotKey = this._computeHostSlotKey()
    // profile 已就绪，此时加载路径模式才能正确匹配 per-profile 的 key
    this._loadSavedPaths()
    this._cwdSetupPrompted = false
    if (this.pathMode === 'sync') this._startCwdSync()
    // 本地导航历史：记录初始路径
    this._pushLocalNav(this.localPath)
    // 路径记忆可能更新了 localPath，刷新本地列表显示正确的目录内容
    void this.refreshLocal()
    // ★ 2026-10-20 续三十一：顶栏连接显示内容必须**先于** `_restoreLeftEndpoint()` 读好 ——
    //   自动恢复是 async 发起，但它的「连接中 <目标>」在首个 await 之后就要按设置格式化；
    //   不依赖「ngOnInit 后面的同步代码会先跑完」这种 microtask 时序（改一次顺序就会静默走默认值）。
    this._readConnLabelStyle()
    // ★ 2026-10-20：恢复左栏远程端点（异步轮询标签树，等 Tabby 把另一个连接建好）
    void this._restoreLeftEndpoint()

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
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：面板整体透明度（0.5–1，最低 50%）
    this._applyPanelOpacity()
    this._loadPaneToolbarLayout()
    this._readBehaviorConfig()
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制（固定态/顺序/折叠开关）
    this._readTopBarConfig()
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器唤起方式（顶栏标题 / 终端标识）
    this._readConnPickerTrigger()

    // 监听 Tabby 主题切换 → 面板实时跟随
    this._themeSub = this.themesService.themeChanged$.subscribe(() => {
      this._applyAutoTheme()
    })

    // 监听设置页变更 → 同步刷新面板显示
    this._settingsChangedHandler = () => {
      // ★ 2026-10-22 续三十六（Deepseek-V4.1-Flash）：设置页「配置保存后立即生效」关闭时，
      //   本面板忽略一切设置变更广播 —— 用户要的是「改完一批后再重开面板一次全部生效」。
      //   ⛔ 不要在这里只跳过部分项：半套生效比完全不生效更难解释。
      if (!this._settingsApplyLive()) {
        log.info('[SFTP+] settings changed ignored (applySettingsInstantly=false, reopen panel to apply)')
        return
      }
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
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：设置页改完顶栏按钮配置后立即生效
      this._readTopBarConfig()
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器唤起方式同步
      this._readConnPickerTrigger()
      // ★ 2026-10-20 续三十一：设置页切完「别名 / 账号@地址」→ 顶栏文案立即跟随
      this._readConnLabelStyle()
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
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：设置页改完透明度后立即生效
      this._applyPanelOpacity()
      this._safeDetect()
      this.cdr.markForCheck()
    }
    window.addEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)

    // ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 执行命令后请求刷新（契约见 core/quickcmd-link.ts）。
    //   监听挂在 window 上、事件带 session 引用 ⇒ 同一窗口里哪个 Tabby 标签的命令都能精确找回本面板。
    this._qcRefreshHandler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail
      // 事件来自别的插件，可能在任何时机派发 ⇒ 统一进 zone 再动状态，最后补一次检测
      this.zone.run(() => {
        try { this._onQuickCmdRefreshRequest(detail) } catch (e) { log.warn('quickcmd refresh request failed:', e) }
        this._safeDetect()
      })
    }
    window.addEventListener(QC_REFRESH_REQUEST_EVENT, this._qcRefreshHandler)

    // 捕获阶段 document click：关闭书签悬浮面板 & 右键菜单 & 表头菜单
    // overlay 的 stopPropagation 阻止了冒泡阶段到达 document，但捕获阶段不受影响
    this._docClickCapture = (ev: MouseEvent) => {
      // Early return: skip expensive DOM queries when no popup/menu is open
      if (!this.showBookmarks && !this.contextMenuVisible && !this.headerMenuVisible
        && !this.localFilterVisible && !this.remoteFilterVisible && !this._connPickerSide
        && !this._topBarOverflowVisible) return
      const target = ev.target as HTMLElement | null
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：⋯ 折叠菜单点外部关闭（捕获阶段，理由同连接选择器）
      if (this._topBarOverflowVisible
        && !target?.closest('.topbar-overflow-menu') && !target?.closest('.btn-overflow')) {
        this.zone.run(() => {
          this._topBarOverflowVisible = false
          this._safeDetect()
        })
      }
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
      // ★ 2026-10-18 issue #27 P3：全局连接选择器浮层「点外部关闭」必须挂捕获阶段——
      //   面板内文件条目等点击会 stopPropagation()，冒泡阶段的 document:click 收不到（铁律 #18 同源教训）。
      //   点在浮层内不关；点在地址栏分段上不关（开/关切换由分段自己的 click 处理器收口，否则 toggle 失效）。
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：栏工具栏上的可点端点标识同理 —— 它自己的 click 里会做
      //   「同侧已开 ⇒ 收起」的开关收口；若捕获阶段先把它关掉，紧接着 click 又判定「未开 ⇒ 打开」，
      //   表现就是「再点标识关不掉」（关一次又开一次）。所以这里必须放行 .pane-label--clickable。
      if (this._connPickerSide) {
        if (!target?.closest('.global-conn-picker') && !target?.closest('.conn-seg')
          && !target?.closest('.conn-address-single') && !target?.closest('.pane-label--clickable')) {
          this.zone.run(() => this._closeConnPicker())
        }
      }
      if (this.showBookmarks) {
        if (this._bookmarkJustOpened) return
        if (!target?.closest('.bookmark-popup') && !target?.closest('.bm-btn')) {
          // ★ 2026-10-23（Deepseek-V4.1-Flash）：图钉钉住（常驻）⇒ 点面板其它位置**不关**弹层，
          //   只有「关闭」按钮、再点一次 ★ 按钮、Esc 才关（用户要求：常驻就该待在原地）。
          //   ⛔ 常驻分支**不能 return**：下面的右键/表头菜单仍要按「点外部关闭」的规则收掉，
          //     否则常驻时点了外面，菜单会僵在那里（常驻只管书签弹层这一件事）。
          if (!this.bookmarkPinned) {
            this.zone.run(() => {
              this.closeBookmarks()
              if (changed) this._safeDetect()
            })
            return
          }
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
      // ★ 2026-10-23（Deepseek-V4.1-Flash）：常驻时滚轮**也不关**书签弹层 —— 与「点外部不关」同一套语义。
      //   否则钉住后往文件列表一滚弹层就没了，「常驻」等于没生效。菜单类仍照常关闭。
      const bookmarksClosable = this.showBookmarks && !this.bookmarkPinned
      if (!bookmarksClosable && !this.contextMenuVisible && !this.headerMenuVisible) return
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
        if (bookmarksClosable) this.closeBookmarks()
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
      // ⛔ 别的插件浮层会在自己宿主上 stopPropagation mousedown（QuickCmd+ 面板就是），
      //    document 冒泡收不到 ⇒ owns 残留、把 Ctrl+A/C/V 从对方输入框抢走。改用 window 捕获。
      this._ownsClearCapture = (ev: MouseEvent) => this._clearOwnsOnOutsideMouseDown(ev)
      window.addEventListener('mousedown', this._ownsClearCapture, true)
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
    // ★ 2026-10-26（Deepseek-V4.1-Flash）：未决的二次确认按「取消」结掉 ——
    //   否则 await askConfirm() 的后续代码永不执行（其中的清理/复位全部卡住）。
    this.disposeConfirmDialog()
    // ★ 2026-10-20：左栏会话的 closed$ 订阅 + 兜底轮询必须摘下，否则它强引用整个面板，
    //   面板销毁后仍会每 2s 触发一次变更检测并把状态写回已销毁视图。
    this._unwatchLeftSession()
    // ★ 2026-10-20：销毁前把左栏端点/路径落盘（_paneSet 只写内存，靠这里 flush）
    this._persistLeftEndpoint()
    // 必须先中止拖拽预缓存下载，再 disconnect；否则后台 SFTP read 会继续占满 SSH 通道，
    // 关面板重开后进入文件夹仍会卡，直到重启 Tabby。
    this._cancelRemoteDragCache()
    this._clearCustomDragPreview()
    this._fileDnd?.reset()
    this._headerReorder?.dispose()
    this._rubberBand.dispose()
    this.clearTransfers()
    // ★ 2026-10-09 审计根治：通知连接生命周期「本面板已彻底销毁」。
    //   与 stopHeartbeat 的区别：后者只是停止/重启心跳周期（在途静默重建仍应作为
    //   并发互斥依据保留），而 markDestroyed 会让 isAlive() 恒 false，
    //   所有在途异步回调（装通道 / 通知 / detectChanges）立即短路，
    //   并释放 _silentReopen 与 _openingSftp 单飞闸门（WeakMap 持有 in-flight Promise）。
    try { this._connLifecycle?.markDestroyed() } catch { /* ignore */ }
    this._transferRuntime.dispose()
    // ★ 2026-10-09 审计 P0-1 根治：协调器此前**从未被 dispose**，导致它内部的
    //   _disposed 守卫恒为 false（dispose 后仍会启动新传输），
    //   且 _activeTransferSlots 一直持有含完整远端/本地路径的槽位键。
    this._transferCoordinator.dispose()
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
    // ★ 2026-10-25 BUG-H1 修复：书签弹窗尺寸拖拽的 document 监听器泄漏。
    //   拖拽过程中面板被销毁时 onUp 永不触发，_bmResizeCleanup 只在用户松手时设置。
    //   此处兜底调用，确保拖拽中销毁也能摘掉 document 级 mousemove/mouseup。
    this._bmResizeCleanup?.()
    this._bmResizeCleanup = null
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
    // ★ 2026-10-19 P2-14：面板销毁时把仍在等「目录不存在」对话框的预检全部判为取消。
    //   此前这些 promise 永不 settle —— await 之后的传输代码（含 finally 清理）一行都不执行。
    if (this._dirMissingResolvers.length) this.resolveDirMissing('cancel')
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
    if (this._ownsClearCapture) {
      window.removeEventListener('mousedown', this._ownsClearCapture, true)
      this._ownsClearCapture = null
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
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动 —— 监听与观察期定时器都必须摘掉，
    //   否则定时器强引用整个面板，销毁后还会继续对远端 readdir。
    this._qcObserver?.stop('panel destroyed')
    this._qcObserver = null
    if (this._qcRefreshHandler) {
      window.removeEventListener(QC_REFRESH_REQUEST_EVENT, this._qcRefreshHandler)
      this._qcRefreshHandler = null
    }
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新同理 —— 不清会强引用面板并对远端持续 readdir
    if (this._autoRefreshTimer) { clearInterval(this._autoRefreshTimer); this._autoRefreshTimer = null }
    this._autoRefreshBusy = false
    this._autoRefreshQuiet = false
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
    // ★ 2026-10-25 BUG-M7 修复：面板销毁时异步 rm 可能未执行完毕就被 GC，
    //   导致临时目录残留。改用同步 rmSync，确保销毁前清理完成。
    try { fsSync.rmSync(path.join(os.tmpdir(), 'sftp-plus-dragout'), { recursive: true, force: true }) } catch {}
    // ★ 2026-09-20 P2-2: 清理「拖入兜底」临时目录（仅本面板作用域内的副本，不误删其它面板的）
    try { fsSync.rmSync(dragDropTempDir(this._dropTmpScope), { recursive: true, force: true }) } catch {}
    // P2-2: 清理 _openPathInSystem 可能残留的 keyup 监听和定时器
    if (this._openPathKeyupHandler) {
      window.removeEventListener('keyup', this._openPathKeyupHandler, true)
      this._openPathKeyupHandler = null
    }
    if (this._openPathTimeoutId) {
      clearTimeout(this._openPathTimeoutId)
      this._openPathTimeoutId = null
    }
    // ★ 2026-10-16 issue #26：清理地址栏定位闪烁定时器（避免面板销毁后对其改值触发变更检测）
    if (this._locateFlashTimer) {
      clearTimeout(this._locateFlashTimer)
      this._locateFlashTimer = null
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
  /** 捕获阶段的「面板外 mousedown ⇒ 交出剪贴板热键归属」监听（见 _clearOwnsOnOutsideMouseDown） */
  private _ownsClearCapture: ((ev: MouseEvent) => void) | null = null
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
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：面板整体透明度（设置页「主题」）。
   *   - 写 CSS 变量 `--_panel-opacity`，由 `.sftp-root` 消费（宿主内继承，无需改模板）；
   *   - 钳制在 0.5–1：**不允许全透明**（下限一半），保证内容仍可读、点击目标仍可见；
   *   - 语义是「整体」：面板内的浮层/对话框/toast 一并半透明（opacity 无法只作用于背景）；
   *     若后续只想让背景透出，应改为「背景色 alpha + 内层容器透明」，那是另一套实现。
   */
  private _applyPanelOpacity(): void {
    const el = this.elRef?.nativeElement as HTMLElement | undefined
    if (!el) return
    let v = 1
    try {
      const raw = Number(this.configService?.store?.['tabby-sftp-plus']?.panelOpacity)
      if (Number.isFinite(raw)) v = Math.min(1, Math.max(0.5, raw))
    } catch { /* 配置不可用时用默认值 */ }
    el.style.setProperty('--_panel-opacity', String(v))
  }

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
        // ★ 2026-10-25 L1-L4 修复：JSON.parse 可能失败，单独 catch 避免影响整体主题加载
        try { themeValue = raw ? JSON.parse(raw) : '' } catch { themeValue = "" }
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

  async close(): Promise<void> {
    // 有正在进行的传输时，提示用户确认
    // ★ 2026-10-26（Deepseek-V4.1-Flash）：改用面板内确认框。原生 confirm 点「取消」后
    //   Electron(Windows) 不交还焦点链 ⇒ 面板还在、但下拉框/输入框点不动（见 clearLog 注释）。
    //   ⛔ close() 现在返回 Promise：terminal-decorator 的 closeFloatingPanel 是「调用后即返回」，
    //     面板会在用户选择之后才真正销毁，与之前同步语义一致。
    if (this.transfers.length > 0) {
      const msg = this.i18n.t('notify.closeWithTransfers', { count: this.transfers.length })
      if (!(await this.askConfirm(msg))) return
      // ★ 异步后校验：确认期间面板可能已被其它路径关掉（Tabby 关标签 / 热键），别再动已销毁的会话
      if (this._destroyed) return
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
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：联动书签开关（关掉后表单不显示联动路径、点击也不联动）
      // ★ 2026-10-20：默认改为**开** ⇒ 判定改成 !== false（配置里缺省/旧版无此键时按开启处理）
      this.bookmarkLinkEnabled = cfg?.bookmarkLinkEnabled !== false
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：排序方式必须在**开机时回读**——之前只写了配置没读，
      //   重启后回到默认值，表现为「改完关掉 Tabby 就丢」。
      // ★ 2026-10-22：三档归一化；老配置只有 bookmarkSortByUsage 布尔 ⇒ true 折算成 usage。
      this.bookmarkSortMode = normalizeBookmarkSortMode(cfg?.bookmarkSortMode, cfg?.bookmarkSortByUsage)
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
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点只认当前目录（缺键按「开」；旧配置无此键）
      this._dropToCurrentDirOnly = cfg?.dropToCurrentDir !== false
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动 —— 缺键按「关」处理（新增能力不默默开启）；
      //   观察期时长夹到 1–120 秒，与设置页同口径（这里再夹一次：配置可能被手改）
      this._refreshOnQuickCmd = cfg?.refreshOnQuickCmd === true
      const winSec = Number(cfg?.refreshOnQuickCmdWindow)
      this._refreshOnQuickCmdWindowMs = (isFinite(winSec) && winSec > 0 ? Math.max(1, Math.min(120, Math.round(winSec))) : 10) * 1000
      // 开关被关掉时立刻停掉可能还在跑的观察期（否则「关了还在刷」）
      if (!this._refreshOnQuickCmd) this._qcObserver?.stop('disabled by config')
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新（缺键按「关」；间隔夹到 5–3600 秒，与设置页同口径）
      this._autoRefreshEnabled = cfg?.autoRefreshEnabled === true
      const ivSec = Number(cfg?.autoRefreshInterval)
      this._autoRefreshIntervalMs = (isFinite(ivSec) && ivSec > 0 ? Math.max(5, Math.min(3600, Math.round(ivSec))) : 60) * 1000
      // ★ 2026-10-28（Deepseek-V4.1-Flash）：列表刷新闪烁（缺键按「开」；老配置无此键 ⇒ 保留原有反馈）
      this._flashEnabled = cfg?.listRefreshFlash !== false
      // ⛔ 开关/间隔任一变化都要重排定时器（只改间隔不重启 ⇒ 仍按老间隔跑，用户以为没生效）
      this._syncAutoRefreshTimer()
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
    // ★ 2026-10-20：断开态的重连图标从顶栏拖拽热区里排除（原为 .disconnect-indicator，该徽标已并入连接分段）
    if (t.closest('button, input, a, .conn-retry, .reconnect-btn')) return
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
    // ★ 2026-10-19 修复「窗口缩放后面板超出容器」：拖拽/缩放期间 live style 是 px
    //   （_convertFollowToPx 转换），此前只在持久化载荷里归一化为百分比、live style 仍是 px，
    //   而 _followWindow 已被置 true → _clampGeometryToParent 早退 ⇒ 窗口缩放时 px 几何
    //   不随动，面板溢出容器。现把 live style 同步归一化为百分比，真正恢复「跟随窗口」语义。
    this._normalizeLiveGeomToPct()
    // 还原为「跟随窗口」语义：百分比几何随窗口大小自适应，窗口缩放时不再 clamp
    this._followWindow = true
  }

  /**
   * 把宿主元素 live style 的 px 几何换算为相对父容器的百分比（拖拽/缩放结束时调用）。
   * ★ 2026-10-19：与 _persistPanelGeometry 的载荷归一化配套——载荷归一化只影响下次启动，
   * live style 不写回的话，本次会话内窗口缩放时面板（px）不会随动、会溢出容器。
   * 同时保证 left+width ≤ 100%、top+height ≤ 100%（防 toFixed 取整累积溢出）。
   */
  private _normalizeLiveGeomToPct(): void {
    if (this.displayMode === 'workspace' || this.panelMaximized) return
    const host = this._hostEl
    const parent = host?.offsetParent as HTMLElement | null
    if (!host || !parent) return
    const pr = parent.getBoundingClientRect()
    if (pr.width <= 0 || pr.height <= 0) return
    const l = parseFloat(host.style.left)
    const t = parseFloat(host.style.top)
    const w = parseFloat(host.style.width)
    const h = parseFloat(host.style.height)
    if (![l, t, w, h].every(Number.isFinite)) return
    if (host.style.left.includes('%') && host.style.width.includes('%') && host.style.top.includes('%') && host.style.height.includes('%')) return
    let pw = l / pr.width * 100
    let qw = w / pr.width * 100
    let ph = t / pr.height * 100
    let qh = h / pr.height * 100
    if (pw + qw > 100) qw = Math.max(0, 100 - pw)
    if (ph + qh > 100) qh = Math.max(0, 100 - ph)
    host.style.left = pw.toFixed(2) + '%'
    host.style.top = ph.toFixed(2) + '%'
    host.style.width = qw.toFixed(2) + '%'
    host.style.height = qh.toFixed(2) + '%'
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
    // ★ 2026-10-16 issue #27 P1：只有远程会话来自「面板所属终端标签页」时，
    //   cwd 同步（把远程面板路径跟随终端 cwd）才有意义；切到别的服务器后不再跟随。
    if (this.pathMode === 'sync' && this.connected && this._remoteBelongsToOwnTab) {
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

  // ========== issue #27 P1：连接选择器（点顶栏连接地址切换远程会话） ==========

  /**
   * 枚举所有已开的 SSH 终端标签页，作为「可切到的远程连接」候选。
   * 复用宿主标签树（与 terminal-decorator._collectLeafTabs 同口径），
   * 跳过重复会话；标记当前面板正在用的那一个为 active。
   */
  listRemoteConnectionOptions(): any[] {
    const out: any[] = []
    try {
      const app: any = this._appService
      if (!app?.tabs) return out
      const seen = new Set<any>()
      const visit = (tab: any): void => {
        if (!tab) return
        if (tab.root?.getAllTabs) { for (const c of tab.root.getAllTabs()) visit(c); return }
        if (typeof tab.getAllTabs === 'function') { for (const c of tab.getAllTabs()) visit(c); return }
        const ss = tab.sshSession ?? tab._sshSession ?? tab._session ?? null
        if (!ss || seen.has(ss)) return
        seen.add(ss)
        const prof = tab.profile ?? tab._profile ?? null
        const host = prof?.options?.host || (ss as any)?.connection?.host || 'unknown-host'
        const user = prof?.options?.username || prof?.options?.user || ''
        const label = user ? `${user}@${host}` : String(host)
        out.push({
          key: (tab as any).__sftpPlusSourceKey || (tab as any).id || label,
          label,
          sub: prof?.name || 'SSH',
          sshSession: ss,
          profile: prof,
          active: ss === this.sshSession,
          // ★ 2026-10-20 续三十（用户诉求）：带上标签页对象 —— 选择器每项右侧的减号
          //   要调宿主 `closeTab(tab)` 把这条连接彻底关掉，光有 sshSession 关不掉标签页。
          tab,
        })
      }
      for (const top of app.tabs || []) visit(top)
    } catch {
      /* 枚举失败不阻断面板主流程 */
    }
    return out
  }

  /**
   * 把右侧远程面板切到另一个已开的 SSH 会话。
   * 仅释放旧会话的 SFTP 通道（不关 SSH，它属于别的终端标签页），再用新会话重连。
   * 默认远程路径回到默认，避免沿用旧会话的目录。
   */
  async switchRemoteSession(opt: any): Promise<void> {
    this._closeConnPicker()
    this._connOptions = []
    if (!opt || !opt.sshSession) { this._safeDetect(); return }
    if (opt.sshSession === this.sshSession) { this._safeDetect(); return }
    // ★ 2026-10-19 P1 修复：必须走面板的 disconnect()（含 _stopCwdSync），不能只调
    //   _connLifecycle?.disconnect()——「终端同步」模式下 800ms tick 只校验
    //   pathMode==='sync' && connected，不校验终端归属：切到别的 SSH 会话后旧定时器
    //   存活，把**旧终端**的 cwd 周期写回 remotePath 并刷新，新会话里导航任何目录
    //   都会被弹回。connect() 内有 _remoteBelongsToOwnTab 守卫，切会话后不会误重启。
    this.disconnect()
    this.sshSession = opt.sshSession
    this.profile = opt.profile || this.profile
    this._remoteBelongsToOwnTab = false
    if (this.profile?.options?.host) {
      const user = this.profile.options.username || this.profile.options.user || ''
      this.hostInfo = user ? `${user}@${this.profile.options.host}` : this.profile.options.host
    }
    this.remotePath = this.getDefaultRemotePath()
    this.remotePathInput = this.remotePath
    await this.connect()
  }

  /** 左栏端点是否为远程（模板/守卫用） */
  get leftIsRemote(): boolean { return this._leftKind === 'remote' }

  /** 顶栏连接地址（issue #27 P2 收尾，用户要求）：左段文案——本地面板端点，远程时显示其主机标签 */
  get leftConnLabel(): string {
    // ★ 续二十八：正在建立/恢复连接时必须报出**目标连接名**——
    //   只写「连接中」用户根本不知道在连哪台（尤其是自动恢复：他可能早忘了上次左栏连的是谁）。
    if (this._leftPendingLabel) return this._connPendingText(this._leftPendingLabel, this._leftPendingMode)
    if (this._leftKind === 'remote') {
      // ★ 续三十一：显示内容按设置（账号@地址 / 配置连接名）；空名字回落「远程」
      const who = this._connDisplayText(this._leftHostLabel, this._leftProfile)
      return who ? `远程(${who})` : this.i18n.t('pane.remote')
    }
    return this.i18n.t('pane.local')
  }
  /** 顶栏连接地址：右段文案——右栏端点（远程时显示主机；本地时为「本地」） */
  get rightConnLabel(): string {
    // ★ 续二十八：同上——从本地端点切到远程连接、或重开已关掉的连接时，右栏自身状态还是「本地」
    if (this._rightPendingLabel) return this._connPendingText(this._rightPendingLabel, this._rightPendingMode)
    if (this._rightKind === 'local') return this.i18n.t('pane.local')
    // ★ 续三十一：同左段——按设置显示连接名或账号@地址
    const who = this._connDisplayText(this.hostInfo, this.profile)
    return who ? `远程(${who})` : this.i18n.t('pane.remote')
  }
  /** 单栏布局下顶栏仅显示右栏连接芯片（仍可点击切换） */
  get singleConnLabel(): string {
    return this.rightConnLabel
  }

  /**
   * ★ 续三十一（Deepseek-V4.1-Flash，用户诉求「顶栏连接显示用别名还是账号@地址」）：
   *   按设置把连接身份格式化成**顶栏展示文本**。
   *
   * ⛔ 只在展示层用：`account` 参数传的是 `user@host`（`hostInfo` / `_leftHostLabel`），
   *   返回值**绝不回写**到那些字段 —— 书签锚定连接身份、传输日志的源/目标主机名、
   *   `_connMatchesSaved` 的身份匹配全部依赖 `user@host`；写进别名会让同一台机被当成两条连接，
   *   表现为「重启后书签不认这台机」「传输日志主机名前后不一致」。
   *
   * 别名模式下拿不到连接名（临时会话、provider 不暴露 profile、profile.name 为空）→ 回落账号@地址，
   *   绝不显示空串（空串会让顶栏只剩「远程()」）。
   */
  private _connDisplayText(account: string, profile: any): string {
    if (this._connLabelStyle === 'alias') {
      const alias = String(profile?.name || '').trim()
      if (alias) return alias
    }
    return String(account || '').trim()
  }

  /**
   * ★ 续二十八：「连接中 <目标连接名>」的统一文案。
   *   状态由顶栏忙碌点表达，这里补上**目标**——用户提的正是「只写连接中，不知道在连哪个」。
   * ★ 续三十三（用户纠正）：`mode='waiting'` 时是「等待连接 <目标>」——自动恢复 / 点重连
   *   本质是在等 Tabby 的标签页（或用户认证）就绪，不是我们自己在发起连接。
   */
  private _connPendingText(label: string, mode: 'connecting' | 'waiting' = 'connecting'): string {
    const waiting = mode === 'waiting'
    let base = waiting ? '等待连接' : '连接中'
    try {
      base = this.i18n.t(waiting ? 'status.waitingConn' : 'status.connecting')
    } catch { /* i18n 不可用时用中文兜底 */ }
    return label ? `${base} ${label}` : base
  }

  /** 该栏当前是否处于「等待外部就绪」（waiting 语义，顶栏与栏内占位都改文案） */
  private _pendingIsWaiting(side: 'left' | 'right'): boolean {
    return (side === 'left' ? this._leftPendingMode : this._rightPendingMode) === 'waiting'
  }

  /**
   * 标记某一栏「正在连接 / 等待连接哪一个连接」（label 为空 = 清空）。
   *
   * ★ 续三十三：waiting 一旦置位就**不被内层 connecting 覆盖** —— 自动恢复会把整段等待
   *   标记为 waiting，而结束时 `switchLeftEndpoint` 还会自己标一次 connecting；
   *   若允许覆盖，顶栏会在最后一刻从「等待连接」跳回「连接中」再跳「远程(x)」，白闪一次文案。
   */
  private _setConnPending(side: 'left' | 'right', label: string, mode: 'connecting' | 'waiting' = 'connecting'): void {
    const v = String(label || '').trim()
    if (side === 'left') {
      const next = v ? ((this._leftPendingMode === 'waiting' && mode === 'connecting') ? 'waiting' : mode) : 'connecting'
      if (this._leftPendingLabel === v && this._leftPendingMode === next) return
      this._leftPendingLabel = v
      this._leftPendingMode = next
    } else {
      const next = v ? ((this._rightPendingMode === 'waiting' && mode === 'connecting') ? 'waiting' : mode) : 'connecting'
      if (this._rightPendingLabel === v && this._rightPendingMode === next) return
      this._rightPendingLabel = v
      this._rightPendingMode = next
    }
    this._safeDetect()
  }

  /** 清空「正在连接」标记（成功/失败/取消后都要调，否则顶栏会一直卡在「连接中」） */
  private _clearConnPending(side: 'left' | 'right'): void {
    this._setConnPending(side, '')
  }

  /**
   * ★ 2026-10-20（用户诉求）：顶栏连接分段自带状态——断开时在连接名前显示闪烁红点、名字后显示重连图标。
   *   'local' 段不显示任何状态点（本机磁盘没有连接概念）。
   *
   * 左栏判定：`_leftConnected` 由切换/重连成功置位、由 closed$ 与 open===false 轮询复位；
   *   另外还要用 `open === false` 做**读取期兜底**——事件可能晚到一拍，而模板每轮变更检测都会读它。
   */
  get leftConnState(): 'local' | 'connected' | 'connecting' | 'disconnected' {
    // ★ 续二十七：端点恢复中（面板刚打开、正等 Tabby 把连接标签建好）——顶栏直接显示「连接中」，
    //   不再先显示「本地」再跳成「远程(x@y)」。否则一开面板就是两个状态连闪。
    // ★ 续二十八：判据扩到 `_leftConnecting` 与 `_leftPendingLabel`，且必须排在「本地」分支**之前**：
    //   从左栏本地端点选一条未打开的远程连接时，`_leftKind` 要等切换完成才变 remote，
    //   排在后面就会「标签写着连接中、状态点还是本地」，两者自相矛盾。
    if (this._leftRestoring || this._leftConnecting || this._leftPendingLabel) return 'connecting'
    if (this._leftKind !== 'remote') return 'local'
    if (!this._leftConnected || !this._leftSftpSession) return 'disconnected'
    const ssh: any = this._leftSshSession
    if (ssh && ssh.open === false) return 'disconnected'
    return 'connected'
  }
  /** 右栏连接状态：右栏本地端点不显示状态；远程端点沿用主会话的 connected/connecting */
  get rightConnState(): 'local' | 'connected' | 'connecting' | 'disconnected' {
    // ★ 续二十八：右栏同左栏——正在连某个连接时先报 connecting（含从本地端点切远程的过程）
    if (this._rightPendingLabel) return 'connecting'
    if (this._rightKind === 'local') return 'local'
    if (this.connecting || this.reconnecting) return 'connecting'
    if (this.connected) return 'connected'
    // 还没有拿到 SSH 会话时（首帧 / 尚未 connect）不判「已断开」——否则面板一打开就闪一下红点。
    // 原独立徽标的条件同样是 `sshSession && !connected`，这里保持同一判据。
    return this.sshSession ? 'disconnected' : 'connected'
  }
  /**
   * ★ 2026-10-20（Deepseek-V4.1-Flash，用户诉求原话：「连接中的时候文件列表不是默认显示本地，
   *   不应该有内容才对？！」）：
   *   该栏是否处于「正在建立连接」的等待窗口（左栏切远程、自动恢复、重连、选未打开连接都算）。
   *
   * 为什么必须藏内容：左栏在 `_leftKind` 变成 'remote' 之前仍然复用的是**本地面板的状态槽**
   *   （`localEntries` / `localPath`）⇒ 等待窗口里渲染出来的就是本机目录的文件列表。
   *   顶栏写着「连接中 root@42.194.230.244」、下面列着 `D:\Desktop\test` 的文件，
   *   用户看到的是「一个连上了的本地目录」，还会以为连接已经成功了（截图实证）。
   *   语义上连接尚未建立 = 没有任何可信内容可展示，只留「连接中」占位。
   */
  get leftPanePending(): boolean { return this.leftConnState === 'connecting' }
  /** 左栏占位文案：等待外部就绪时是「等待连接」，自己开通道时是「连接中」（与顶栏同源） */
  get leftPanePendingText(): string {
    try { return this.i18n.t(this._leftPendingMode === 'waiting' ? 'status.waitingConn' : 'status.connecting') } catch { return '' }
  }
  /** 右栏同理：从本地端点切远程 / 重连期间不展示上一个端点的列表 */
  get rightPanePending(): boolean { return this.rightConnState === 'connecting' }
  get rightPanePendingText(): string {
    try { return this.i18n.t(this._rightPendingMode === 'waiting' ? 'status.waitingConn' : 'status.connecting') } catch { return '' }
  }

  /**
   * ★ 2026-10-20（用户反馈）：悬停提示不再带「左/右」方位词。
   *   布局可切换（左右并排 / 上下堆叠 / 单栏），「选择左侧面板端点」这类文案在上下布局、
   *   单栏下直接自相矛盾；而这个动作的本质只是「把这一栏的端点换成另一个连接」。
   *   两段共用同一条 `conn.pickerTitle`（切换连接），具体是哪一栏由分段位置 + 浮层锚点表达。
   *
   * 同时补上连接名：窄面板下分段文字会被省略（ellipsis），悬停是唯一能看到完整 host 的地方；
   *   断开时按「连接名 · 已断开 · 切换连接」拼，不额外占顶栏空间。
   */
  private _connSegTitle(state: 'local' | 'connected' | 'connecting' | 'disconnected', label: string): string {
    const parts: string[] = []
    if (label) parts.push(label)
    if (state === 'disconnected') parts.push(this.i18n.t('status.disconnected'))
    parts.push(this.i18n.t('conn.pickerTitle'))
    return parts.join(' · ')
  }
  /** 左段悬停提示 */
  get leftConnTitle(): string {
    return this._connSegTitle(this.leftConnState, this.leftConnLabel)
  }
  /** 右段悬停提示（与左段同一条文案，不带方位词） */
  get rightConnTitle(): string {
    return this._connSegTitle(this.rightConnState, this.rightConnLabel)
  }

  /** 左栏 pane-label 文案/图标：远程模式时与右栏同款（服务器身份在选择器与顶栏可见） */
  get leftPaneLabel(): string {
    // ★ 2026-10-20（Deepseek-V4.1-Flash）：正在连远程时 `_leftKind` 还是 'local'，但目标已确定是远程
    //   ⇒ 标签必须跟着顶栏写「远程」，否则同一时刻顶栏「连接中 root@x」、栏头「🖥 本地」自相矛盾。
    if (this.leftPanePending) return this.i18n.t('pane.remote')
    return this._leftKind === 'remote' ? this.i18n.t('pane.remote') : this.i18n.t('pane.local')
  }
  get leftPaneIcon(): string { return (this.leftPanePending || this._leftKind === 'remote') ? '🌐' : '🖥' }
  /** 右栏 pane-label 文案/图标：随右栏端点类型变化（本地=🖥/本地，远程=🌐/远程） */
  get rightPaneLabel(): string { return this._rightKind === 'remote' ? this.i18n.t('pane.remote') : this.i18n.t('pane.local') }
  get rightPaneIcon(): string { return this._rightKind === 'remote' ? '🌐' : '🖥' }

  /** 收起全局连接端点选择器浮层（清掉两侧候选缓存） */
  private _closeConnPicker(): void {
    if (!this._connPickerSide) return
    this._connPickerSide = null
    this._pickerAnchor = null
    this._leftConnOptions = []
    this._rightConnOptions = []
    this._safeDetect()
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：面板栏工具栏的端点标识（🖥 本地 / 🌐 远程）唤起切换器。
   *   点哪一栏就开哪一栏的候选；浮层平移到该标识正下方（与顶栏入口共用同一份浮层）。
   */
  openConnPickerFromPaneLabel(side: 'left' | 'right', ev?: MouseEvent): void {
    if (!this.connPickerPaneToolbarEnabled) return
    this._toggleConnPicker(side, (ev?.currentTarget as HTMLElement) ?? null)
  }

  /** 展开/收起左栏连接选择器（点顶栏地址栏左段；再次点击收起）。浮层锚定在被点分段正下方 */
  openLeftConnPicker(_ev?: MouseEvent): void {
    // 已展开时始终允许点标题收起（否则「终端标识」模式下标题点了没反应会像卡住）
    if (this._connPickerSide === 'left') { this._closeConnPicker(); return }
    if (!this.connPickerTopbarEnabled) return
    this._toggleConnPicker('left')
  }

  /** 展开/收起右栏连接选择器（点顶栏地址栏右段/单栏芯片；再次点击收起）。浮层位置由 _connPickerLeftPx 动态锚定 */
  openRightPaneConnPicker(_ev?: MouseEvent): void {
    if (this._connPickerSide === 'right') { this._closeConnPicker(); return }
    if (!this.connPickerTopbarEnabled) return
    this._toggleConnPicker('right')
  }

  /** 面板工具栏上的端点标识（🖥 本地 / 🌐 远程）是否可点（paneToolbar / both 模式） */
  get connPickerPaneToolbarEnabled(): boolean {
    return this._connPickerTrigger !== 'topbar'
  }

  /**
   * 顶栏连接标题的点击是否还能唤起切换器。
   * paneToolbar 模式下一律让位给栏工具栏标识；但若用户把「标识」从栏工具栏里删掉
   * （paneCustomOrder 不含 label，或进了 paneHiddenItems），顶栏仍可点 —— 否则切换器彻底没有入口。
   */
  get connPickerTopbarEnabled(): boolean {
    if (this._connPickerTrigger === 'paneToolbar') return !this._paneLabelVisible
    return true
  }

  /** 栏工具栏的「标识」项当前是否可见（受栏工具栏定制顺序 / 隐藏项控制） */
  private get _paneLabelVisible(): boolean {
    return this.paneCustomOrder.includes('label') && !this.paneHiddenItems.includes('label')
  }

  /**
   * 打开/收起某一栏的连接切换器。
   * @param anchorEl 传入「被点击的入口元素」时，浮层平移到它正下方（栏工具栏标识这条入口）；
   *                 传 null 则沿用顶栏分段锚定逻辑（历史行为）。
   */
  private _toggleConnPicker(side: 'left' | 'right', anchorEl: HTMLElement | null = null): void {
    if (this._connPickerSide === side) { this._closeConnPicker(); return }
    this._connPickerSide = side
    this._pickerAnchor = anchorEl ? this._computePickerAnchor(anchorEl) : null
    if (side === 'left') this._leftConnOptions = this._buildLeftConnOptions()
    else this._rightConnOptions = this._buildRightConnOptions()
    // ★ 2026-10-20 续二十六：异步补「未打开的配置连接」（首次打开时缓存为空，回来后原地重建）
    void this._refreshKnownProfiles()
    this._safeDetect()
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：把浮层平移到被点入口的正下方。
   *   x 相对 `.conn-address-wrap`（浮层所在容器）计算，并按面板左右边界钳制（左侧标识靠近面板左缘，
   *   不钳制会横向溢出被 `.sftp-main` 裁掉）；y 取「入口底边 - 容器底边」，叠加浮层自身的 top:100%。
   */
  private _computePickerAnchor(el: HTMLElement): { x: number; y: number } | null {
    try {
      const wrap = this.elRef?.nativeElement?.querySelector('.conn-address-wrap') as HTMLElement | null
      if (!wrap) return null
      const w = wrap.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const root = wrap.closest('.sftp-root') as HTMLElement | null
      const rr = root?.getBoundingClientRect() ?? null
      let x = Math.round(r.left - w.left)
      if (rr) {
        // 至少留 4px 左边距；右侧按浮层最大宽 320 预留
        const minX = Math.round(4 - (w.left - rr.left))
        const maxX = Math.round(rr.width - 326 - (w.left - rr.left))
        x = Math.min(Math.max(x, minX), Math.max(minX, maxX))
      }
      return { x, y: Math.round(r.bottom - w.bottom + 2) }
    } catch { return null }
  }

  /** 栏标识入口时的平移量（null = 沿用顶栏分段锚定） */
  get _connPickerTransform(): string | null {
    const a = this._pickerAnchor
    return a ? `translate(${a.x}px, ${a.y}px)` : null
  }

  /**
   * ★ 2026-10-18 issue #27 P3 二轮修复：浮层水平偏移改为「动态获取」——每次变更检测从 DOM
   * 实时读取当前激活分段（.conn-seg.active / .conn-address-single.active）相对锚点容器
   * （.conn-address-wrap，position:relative）的位置。地址文本长度变化、窗口缩放均自适应，
   * 不再依赖点击时一次性捕获的快照。右缘钳制以面板根（.sftp-root）为界——wrap 会被
   * flex 压缩（min-width:0），其宽度不能当右界（长地址下钳制值失真的根因）。
   */
  get _connPickerLeftPx(): number {
    if (!this._connPickerSide) return 0
    // 栏标识入口已自带 translate（浮层横向由 _connPickerTransform 决定），不再叠加分段偏移
    if (this._pickerAnchor) return 0
    try {
      const wrap = this.elRef?.nativeElement?.querySelector('.conn-address-wrap') as HTMLElement | null
      const seg = wrap?.querySelector('.conn-seg.active, .conn-address-single.active') as HTMLElement | null
      if (!wrap || !seg) return 0
      const wrapLeft = wrap.getBoundingClientRect().left
      let left = seg.getBoundingClientRect().left - wrapLeft
      const root = wrap.closest('.sftp-root') as HTMLElement | null
      if (root) {
        // 248 ≈ 浮层 min-width 220 + 内边距 12 + 右侧留白
        const maxLeft = root.getBoundingClientRect().right - wrapLeft - 248
        left = Math.min(left, Math.max(0, maxLeft))
      }
      return Math.max(0, left)
    } catch { return 0 }
  }

  /** 全局选择器当前展示的候选（按展开侧取对应候选集） */
  get _connPickerOptions(): any[] {
    return this._connPickerSide === 'left' ? this._leftConnOptions : this._connPickerSide === 'right' ? this._rightConnOptions : []
  }

  /**
   * ★ 2026-10-18 issue #27 P3 六轮：选择器选项副文本统一在此拼装——
   * 本地选项 sub 为空串，此前模板无条件前缀「 · 」会渲染出孤立的圆点
   * （用户反馈「本地连接时不应显示·」）；空 sub 时不加分隔符。
   */
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：副文本 = 端点标识 + 状态后缀，用**空格**分隔。
   *   原先 join(' · ') 让每个远程项都多一个圆点（视觉噪音）；本地项又因 sub 为空只剩下「（当前）」，
   *   与远程行参差 ⇒ 本地项补 'local' 副文本（见 _buildLeftConnOptions / _buildRightConnOptions）。
   */
  _connOptSubText(o: any): string {
    const parts: string[] = []
    if (o?.sub) parts.push(o.sub)
    // ★ 2026-10-20 续二十六：「未打开」组的标记（这些项选中后会现开一个标签页拿会话）
    if (o?.hint) parts.push(o.hint)
    try {
      if (o?.active) parts.push(this.i18n.t('conn.current'))
      else if (o?.otherActive) parts.push(this.i18n.t('conn.otherPane'))
    } catch { /* i18n 不可用时省略状态后缀 */ }
    return parts.join(' ')
  }

  /** 全局选择器选项点击：按展开侧分发到对应回调 */
  _connPickerSelect(opt: any): void {
    // ★ 2026-10-20：「已断开」占位行不可选（它代表那个已经被关掉的连接，没有可用的会话对象）
    if (!opt || opt.dead) return
    // ★ 续二十七：用户主动选了端点 = 抢占还没跑完的自动恢复（否则恢复轮询稍后命中同一连接，
    //   会把用户刚选的东西覆盖回去）。只在左栏入口置位——恢复流程只针对左栏。
    if (this._connPickerSide === 'left') this._leftRestoreAbort = true
    if (this._connPickerSide === 'left') void this.switchLeftEndpoint(opt)
    else if (this._connPickerSide === 'right') void this.switchRightEndpoint(opt)
  }

  /**
   * ★ 2026-10-20 续三十（Deepseek-V4.1-Flash，用户诉求）：
   *   连接项右侧的减号 —— **关闭这一条连接**（取代原先浮层底部那个单独的红字「断开连接」按钮）。
   *
   * 用户原话：「断开连接应该不是底部只有一个按钮？而是每一个选项的右侧都有一个减号的图标按钮？」
   * 所以语义从「把面板从当前连接上撤下来」升级为「关掉列表里的某一条连接」，要点：
   *   ① 关掉该连接对应的 SSH 标签页（宿主 `app.closeTab`）—— 只 end 会话会留下一个死标签页；
   *   ② 若本栏 / 另一栏正用着它，先把对应栏退回本地，否则端点会悬在一个已关闭的会话上；
   *   ③ ⛔ 若那条连接正承载**面板自己所在的标签页** → 只退面板、**不关标签页**（关掉它会把
   *      面板一起销毁，用户会以为整个 SFTP+ 没了），改为提示 `notify.connPanelTabKept`。
   *
   * 已知边界：`o.tab` 缺失（个别 provider 的标签页拿不到对象）时只做①②，不做③之外的关闭动作。
   */
  async _connPickerCloseOption(o: any, ev?: Event): Promise<void> {
    // ⛔ 减号在 conn-opt 按钮内部：不 stopPropagation 会连带触发 _connPickerSelect（先切过去再关，闪一下）
    try { ev?.stopPropagation() } catch { /* ignore */ }
    const ss = o?.sshSession
    if (!ss) return
    // 先把浮层关掉：后面的「退面板 / 关标签页」都会重建候选，浮层开着会看到列表闪变
    this._closeConnPicker()
    // ① 面板正用着这条连接 → 对应栏退回本地（左栏只解绑通道，右栏断 SFTP 会话）
    const usedByLeft = this._leftKind === 'remote' && ss === this._leftSshSession
    const usedByRight = this._rightKind === 'remote' && ss === this.sshSession
    if (usedByLeft) this._revertLeftToLocal()
    if (usedByRight) this.disconnect()
    // ② 这条连接是否就挂在面板所在的标签页上。拿不到 activeTab 时退化为「面板正在用它」——
    //   宁可保留标签页（用户手动关即可），也不能赌一把把承载面板的标签页关掉。
    const activeTab: any = this._appService?.activeTab || null
    const inPanelTab = activeTab ? this._sessionIsInTab(activeTab, ss) : (usedByLeft || usedByRight)
    if (inPanelTab) {
      try { this.showToast(this.i18n.t('notify.connPanelTabKept'), 4000) } catch { /* ignore */ }
      return
    }
    // ③ 关掉它的标签页（= 断开这条连接）
    const app: any = this._appService
    const tab = o?.tab
    if (!tab || typeof app?.closeTab !== 'function') return
    try {
      await app.closeTab(tab, true)
    } catch (e) {
      log.error('[SFTP+] close connection tab failed:', e)
    }
  }

  /**
   * ★ 2026-10-20 续三十：某个标签页（可能是 SplitTabComponent）里是否承载着指定 SSH 会话。
   *   用于判断「这条连接是不是面板自己所在的标签页」—— 是的话不能 closeTab（会把面板一起关掉）。
   */
  private _sessionIsInTab(tab: any, ss: any): boolean {
    if (!tab || !ss) return false
    try {
      return this._collectTabSessionOptions(tab).some((x: any) => x.sshSession === ss)
    } catch { return false }
  }

  /**
   * 左栏选择器的候选：「本地」常驻首项 + 所有已开 SSH 标签页。
   * active = 左栏当前端点/会话（本栏选中，强高亮）；otherActive = 右栏已选（另一栏选中，弱高亮）。
   */
  private _buildLeftConnOptions(): any[] {
    // ★ 2026-10-18：active/otherActive 都必须先确认**本栏/另一栏端点确实是远程**——
    //   切到本地后 sshSession 对象仍保留（供快速切回），仅按「o.sshSession === …」判定
    //   会把残留会话误标：active→远程项与「本地」同时强高亮「（当前）」；
    //   otherActive→误标「（另一栏）」弱高亮（双本地实测截图实锤）。
    const rightIsRemote = this._rightKind === 'remote'
    const opts = this.listRemoteConnectionOptions().map(o => ({
      ...o,
      active: this._leftKind === 'remote' && o.sshSession === this._leftSshSession,
      otherActive: rightIsRemote && o.sshSession === this.sshSession,
    }))
    let localLabel = '本地'
    try { localLabel = this.i18n.t('pane.local') } catch { /* i18n 不可用时用中文名 */ }
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：本地项也带副文本 'local' —— 与远程项的 host 副文本对称，
    //   状态后缀（当前 / 另一栏）才在两行里对齐；不随语言翻译，保持技术标识一致性。
    opts.unshift({ local: true, label: localLabel, sub: 'local', active: this._leftKind === 'local', otherActive: this._rightKind === 'local' })
    // ★ 2026-10-20（用户反馈）：「顶栏显示着 远程(x@y)，点开切换连接却找不到它」。
    //   原因是那个连接标签页已被关掉 ⇒ 它不在标签树里 ⇒ 候选列表里没有它；而顶栏仍留着
    //   这个名字（用于告诉用户「是哪一条断了」）。两边不一致会让人以为列表漏了东西。
    //   这里补一条「已断开」占位行（dead，不可点击），让列表与顶栏对齐；
    //   真正的恢复入口仍是顶栏那个重连图标（会用 profile 重开该连接）。
    if (this._leftKind === 'remote' && !this._leftConnected && !opts.some(o => o.active)) {
      // ★ 续三十一：与顶栏同一套显示文本（别名 / 账号@地址），否则断开时顶栏与列表里同一连接两种叫法
      const deadName = this._connDisplayText(this._leftHostLabel, this._leftProfile)
      let deadLabel = deadName ? `远程(${deadName})` : ''
      try { if (!deadLabel) deadLabel = this.i18n.t('pane.remote') } catch { /* ignore */ }
      let deadSub = ''
      try { deadSub = this.i18n.t('status.disconnected') } catch { /* ignore */ }
      opts.splice(1, 0, { dead: true, label: deadLabel, sub: deadSub, sshSession: null })
    }
    // ★ 2026-10-20 续二十六：最后追加「配置里有、Tabby 里没打开」的连接（选中后现开标签页）
    this._appendUnopenedOptions(opts)
    return opts
  }

  /**
   * 右栏选择器的候选：「本地」常驻首项 + 所有已开 SSH 标签页（issue #27 P3）。
   * active = 右栏当前端点/会话（本栏选中，强高亮）；otherActive = 左栏已选（另一栏选中，弱高亮）。
   */
  private _buildRightConnOptions(): any[] {
    // ★ 2026-10-18：同 _buildLeftConnOptions —— active/otherActive 都按端点类型门控
    //   （右栏切本地后 sshSession 残留，未门控会把该会话误标强高亮「（当前）」）
    const leftIsRemote = this._leftKind === 'remote'
    const opts = this.listRemoteConnectionOptions().map(o => ({
      ...o,
      active: this._rightKind === 'remote' && o.sshSession === this.sshSession,
      otherActive: leftIsRemote && o.sshSession === this._leftSshSession,
    }))
    let localLabel = '本地'
    try { localLabel = this.i18n.t('pane.local') } catch { /* i18n 不可用时用中文名 */ }
    opts.unshift({ local: true, label: localLabel, sub: 'local', active: this._rightKind === 'local', otherActive: this._leftKind === 'local' })
    this._appendUnopenedOptions(opts)
    return opts
  }

  // ========== 2026-10-20 续二十六：候选里的「未打开配置连接」 ==========

  /**
   * 拉取一次 Tabby 的配置连接（只取带 host 的 SSH profile），缓存给同步构建候选使用。
   *   `getProfiles()` 是 async，而 `_buildLeftConnOptions/_buildRightConnOptions` 是同步渲染的
   *   ⇒ 打开选择器时先出「已打开会话」，本方法回来后重建候选把「未打开」补齐（同一次浮层内可见）。
   */
  private async _refreshKnownProfiles(): Promise<void> {
    if (this._profilesLoading) return
    this._profilesLoading = true
    try {
      const svc: any = this.injector.get(ProfilesService as any, null as any)
      if (typeof svc?.getProfiles !== 'function') {
        this._knownProfiles = []
        return
      }
      // includeBuiltin:false —— 内置 profile（本地终端 / PowerShell 等）没有 host，也连不出 SFTP
      const list = await svc.getProfiles({ includeBuiltin: false })
      this._knownProfiles = (Array.isArray(list) ? list : [])
        .filter((p: any) => String(p?.options?.host || '').trim())
    } catch {
      this._knownProfiles = []
    } finally {
      this._profilesLoading = false
      // 浮层还开着就重建（首次打开时缓存为空，拉取完成后补上这一段）
      if (this._connPickerSide === 'left') this._leftConnOptions = this._buildLeftConnOptions()
      else if (this._connPickerSide === 'right') this._rightConnOptions = this._buildRightConnOptions()
      this._safeDetect()
    }
  }

  /**
   * 把「配置里存在、但没在 Tabby 打开」的连接追加到候选尾部。
   *   已打开的同一条连接（host+user+port 全等）不重复出现 —— 它已经在上面那批里，且带「当前」状态。
   *   这些项 `unopened=true`：选中后要先去宿主开一个标签页拿到 SSH 会话（见 _connectUnopenedProfile）。
   */
  private _appendUnopenedOptions(opts: any[]): void {
    if (!this._knownProfiles.length) return
    const opened = this.listRemoteConnectionOptions()
    let hint = ''
    try { hint = this.i18n.t('conn.notOpened') } catch { /* ignore */ }
    for (const p of this._knownProfiles) {
      const o: any = p?.options || {}
      const host = String(o.host || '').trim()
      if (!host) continue
      const user = String(o.username || o.user || '')
      const port = Number(o.port) || 22
      const label = user ? `${user}@${host}` : host
      if (opened.some(x => this._connMatchesSaved(x, { host, user, port, label }))) continue
      opts.push({
        unopened: true,
        key: 'profile:' + String(p.id || p.name || label),
        label,
        sub: p.name || 'SSH',
        hint,
        profile: p,
        sshSession: null,
        active: false,
        otherActive: false,
      })
    }
  }

  /**
   * 用配置连接开一个 Tabby 标签页，等它认证完成，再把焦点切回打开之前的标签页。
   *
   * 为什么必须开标签页：SFTP 需要一个 `SSHSession`，而它只能由宿主的 SSH 标签页持有
   *   （或自己 new SSHSession，但那样认证弹窗、跳板机、密钥代理、断线重连全要面板自己扛）。
   *   走 `openNewTabForProfile` 与 Tabby「新建标签页」完全同一条路径，行为一致。
   *
   * 为什么必须切回：`addTabRaw` 会把新标签设为激活标签，而本面板挂在**原标签**的终端上，
   *   不切回的话用户被带到新标签、看不到面板，体感就是「点了没反应」。
   *
   * @returns 匹配到的候选（含 sshSession/profile/label），失败或超时返回 null
   */
  private async _openProfileTab(profile: any): Promise<any | null> {
    return this._openTabAndWaitSession(profile, {
      host: String(profile?.options?.host || ''),
      user: String(profile?.options?.username || profile?.options?.user || ''),
      port: Number(profile?.options?.port) || 22,
      label: '',
    })
  }

  /**
   * ★ 续二十八：用配置连接开标签页 → 等认证完成 → 返回可挂载的候选。
   *
   * ⛔ 旧实现是「枚举整棵标签树 → 与开标签页之前的会话集合相减」找新会话，宿主的
   *   `SSHMultiplexerService` 会打破这个假设（实证
   *   D:/Develop/Tabby/resources/builtin-plugins/tabby-ssh/src/services/sshMultiplexer.service.ts）：
   *   `profile.options.reuseSession` 为真且 host/port/user 相同时，`setupOneSession` 直接把
   *   **已存在的 SSHSession 对象**给新标签页 ⇒ `listRemoteConnectionOptions()` 按会话去重
   *   （`seen.has(ss)`）会把新标签页整个跳过 ⇒「新会话」永远不出现 ⇒ 空等满 60s 才失败，
   *   而这 60s 里标签页其实早就连上了（用户体感：「点一次没反应，再点一次才连上」）。
   *
   * 因此改成：
   *   ① 开标签页之前先看**同一条连接是否已经开好**（open===true）→ 直接复用，不再开新标签；
   *   ② 开完优先直接读**返回的这个标签页**（可能是 SplitTabComponent，要展开子标签拿会话）；
   *   ③ 只有直接读不到时才退回「枚举相减」，且不再要求「必须是新会话对象」。
   *
   * @param saved 期望匹配的连接身份（host/user/port/label）
   * @param timeoutMs 等待认证的上限（默认 60s：认证要用户手输密码 / 确认 host key）
   */
  private async _openTabAndWaitSession(profile: any, saved: any, timeoutMs = 60000): Promise<any | null> {
    const svc: any = this.injector.get(ProfilesService as any, null as any)
    if (typeof svc?.openNewTabForProfile !== 'function') return null
    const wantLabel = String(saved?.label || '') || this._profileDisplayLabel(profile)
    // ① 已经开好同一条连接（用户第一次点击其实已把标签页开出来、只是没挂上）→ 直接复用，
    //   否则「再点一次」会并排开出第二个标签页。
    const existing = this.listRemoteConnectionOptions().find(o =>
      o.sshSession && this._isSessionReady(o.sshSession) && this._connMatchesSaved(o, saved))
    if (existing) return this._fillOptionIdentity(existing, profile, wantLabel)

    // ★ 2026-10-20（Deepseek-V4.1-Flash，用户诉求原话：「明明 Tabby 的 Tab 中已经有打开的配置连接，
    //   只是需要手动点进去后，才能重新连接，所以点重连后不应再开一个新的 tab 会比较好？」）：
    //   ② 该连接**已经有标签页**（哪怕会话没建起来 / 已经断了）⇒ 就地复活那个标签页，
    //   绝不再开第二个。判据必须走标签树而不是 `listRemoteConnectionOptions()`：
    //   后者只收集「有 sshSession 的标签页」，而 Tabby 恢复出来的标签页可能还没有会话对象。
    const reuseTab = this._findTabForSaved(saved)
    if (reuseTab) {
      log.info(`[SFTP+] reuse existing tab instead of opening a new one: ${wantLabel}`)
      const revived = await this._reviveTabAndWait(reuseTab, profile, wantLabel, timeoutMs)
      if (revived) return revived
      log.info(`[SFTP+] reuse existing tab failed (session never became ready): ${wantLabel}`)
      return null
    }

    const app: any = this._appService
    let prevTab: any = null
    try { prevTab = app?.activeTab || null } catch { /* ignore */ }
    const before = new Set<any>(this.listRemoteConnectionOptions().map(o => o.sshSession))
    // ⛔ 不能用 `newTab.destroyed` 判「标签已关闭」——宿主的 destroyed 是 **Subject**
    //   （baseTab.component.ts: `private destroyed = new Subject<void>()`），恒为 truthy，
    //   写成 `if (newTab.destroyed)` 会让每次点击都立刻失败。只能订阅 destroyed$ 立标志。
    let tabClosed = false
    let closedSub: { unsubscribe: () => void } | null = null
    try {
      const newTab: any = await svc.openNewTabForProfile(profile)
      if (!newTab) {
        log.info(`[SFTP+] open tab: openNewTabForProfile returned null: ${wantLabel}`)
        return null
      }
      try { closedSub = newTab.destroyed$?.subscribe(() => { tabClosed = true }) ?? null } catch { /* ignore */ }
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (!this._isAlive) return null
        // 用户把刚开出来的标签直接关了 → 不会再有会话，别再空等
        if (tabClosed) {
          log.info(`[SFTP+] open tab: tab closed before session ready: ${wantLabel}`)
          return null
        }
        // ② 直接读刚开的标签页（会话复用场景下它拿到的可能就是旧会话对象）
        const own = this._collectTabSessionOptions(newTab)
        const ownHit = own.find(o => this._isSessionReady(o.sshSession))
        if (ownHit) return this._fillOptionIdentity(ownHit, profile, wantLabel)
        // ③ 兜底：标签树里出现的新会话（个别 provider 的标签不是 openNewTab 返回的那个对象）
        const fresh = this.listRemoteConnectionOptions().filter(o => !before.has(o.sshSession))
        const cand = fresh.find(o => this._connMatchesSaved(o, saved)) || fresh[0]
        if (cand && this._isSessionReady(cand.sshSession)) return this._fillOptionIdentity(cand, profile, wantLabel)
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      log.info(`[SFTP+] open tab: session not ready in ${Math.round(timeoutMs / 1000)}s: ${wantLabel}`)
      return null
    } catch (e) {
      log.error(`[SFTP+] open tab failed: ${wantLabel} ${(e as Error)?.message || e}`)
      return null
    } finally {
      try { closedSub?.unsubscribe() } catch { /* ignore */ }
      // 无论成功/失败/超时都切回 —— 面板在那边，用户下一步一定是在面板上操作
      this._refocusTab(prevTab)
    }
  }

  /** 会话是否已认证完成、可用于开 SFTP 通道（宿主 SSHSession.open 在 start() 成功后才置 true） */
  private _isSessionReady(ss: any): boolean {
    return !!ss && ss.open === true
  }

  /**
   * ★ 2026-10-20（Deepseek-V4.1-Flash，用户诉求）：
   *   在标签树里找「这条连接」已有的标签页 —— **不要求会话已就绪**。
   *
   * 为什么不能用 `listRemoteConnectionOptions()`：它按 `tab.sshSession` 收集候选，而 Tabby 重启
   *   恢复出来的标签页可能还没有会话对象（或会话已销毁）⇒ 候选里根本没有这一项 ⇒ 我们会误判成
   *   「这条连接没开」→ 又 `openNewTabForProfile` 开一个同样的标签页（用户截图实证：
   *   标签栏里本来就有那条连接，点重连却并排又多出一个）。
   *
   * 匹配口径与 `_connMatchesSaved` 完全一致（host/user/port 全等；缺 host 时退回标签比对），
   *   身份优先取 `tab.profile.options`，被回收时退回 `session.connection`（宿主 SSHSession 上带着）。
   */
  private _findTabForSaved(saved: any): any | null {
    const app: any = this._appService
    if (!app?.tabs) return null
    const leaves: any[] = []
    const visit = (tab: any): void => {
      if (!tab) return
      try {
        // SplitTabComponent 用 getAllTabs 展开；叶子标签页没有（子树为空时才把它当叶子）
        if (tab.root?.getAllTabs) {
          const kids = tab.root.getAllTabs().filter((c: any) => c !== tab)
          if (kids.length) { for (const c of kids) visit(c); return }
        }
        if (typeof tab.getAllTabs === 'function') {
          const kids = tab.getAllTabs().filter((c: any) => c !== tab)
          if (kids.length) { for (const c of kids) visit(c); return }
        }
      } catch { /* ignore */ }
      leaves.push(tab)
    }
    try { for (const t of app.tabs || []) visit(t) } catch { return null }
    for (const tab of leaves) {
      const desc = this._tabConnIdentity(tab)
      if (desc && this._connMatchesSaved(desc, saved)) return tab
    }
    return null
  }

  /** 归一化标签页的连接身份（host 取不到返回 null ⇒ 本地终端等不参与匹配） */
  private _tabConnIdentity(tab: any): any {
    const prof: any = tab?.profile ?? tab?._profile ?? null
    const ss: any = tab?.sshSession ?? tab?._sshSession ?? tab?._session ?? null
    const conn: any = ss?.connection || {}
    const opts: any = prof?.options || {}
    const host = String(opts.host || conn.host || '').trim()
    if (!host) return null
    const user = String(opts.username || opts.user || conn.user || '').trim()
    const port = Number(opts.port || conn.port) || 22
    return {
      profile: { options: { host, username: user, port } },
      label: user ? `${user}@${host}` : host,
    }
  }

  /**
   * ★ 2026-10-20（Deepseek-V4.1-Flash，用户诉求）：就地复活一个**已存在**的连接标签页。
   *
   * 做法等价于「用户点进那个标签页、再让它重连」，不产生第二个标签页：
   *   ① `app.selectTab(tab)` —— 认证提示（密码 / 主机指纹 / 跳板机确认）都渲染在这个标签页里，
   *      不切过去用户根本看不到，只会觉得插件卡住了（旧版新开标签页正好掩盖了这个问题）；
   *   ② 会话没就绪时调宿主 `ConnectableTerminalTabComponent.reconnect()`
   *      （tabby-terminal/src/api/connectableTerminalTab.component.ts:119）：销毁旧会话、
   *      重建一条并挂回**同一个**标签页；
   *   ③ 轮询该标签页自己的会话直到 `open === true`（认证要用户手输密码，给足 timeoutMs）。
   *
   * ⛔ 不能用调用方手里的旧 session 对象判就绪：`reconnect()` 会换掉 `tab.sshSession`
   *   ⇒ 必须每轮重新 `_collectTabSessionOptions(tab)` 读。
   *
   * ⛔ 2026-10-20 续三十三（用户反馈「重连后界面闪白」）：**默认不在前台切换标签页**。
   *   上一版一进来就 `app.selectTab(tab)`（等于把用户的视线从面板搬到那个 SSH 标签页），
   *   认证完再切回面板 ⇒ 用户看到的是「面板 → 空白终端 → 面板」两次跳转（截图：整屏白）。
   *   现在的做法：会话在后台直接 `reconnect()`，只有当**超过 INTERACTIVE_AFTER 仍未就绪**
   *   （基本等于要用户输密码 / 确认主机指纹）才把那个标签页切到前台；结束时只在
   *   「确实切过」的情况下切回 —— 免密/密钥场景全程零切换、零闪烁。
   */
  private async _reviveTabAndWait(tab: any, profile: any, wantLabel: string, timeoutMs: number): Promise<any | null> {
    const app: any = this._appService
    let prevTab: any = null
    try { prevTab = app?.activeTab || null } catch { /* ignore */ }
    const ready = (): any => this._collectTabSessionOptions(tab).find(o => this._isSessionReady(o.sshSession)) || null
    /** 已经等这么久还没连上 ⇒ 多半在等用户交互，此时才值得把那个标签页搬到前台 */
    const INTERACTIVE_AFTER_MS = 2500
    let activated = false
    try {
      let hit = ready()
      if (!hit) {
        // 先给标签页一个自己连上的机会（Tabby 恢复标签页时可能正在后台重连），
        // 但这段时间**不切标签页** —— 切走就是用户看到的那下白屏。
        await new Promise(resolve => setTimeout(resolve, 600))
        hit = ready()
      }
      if (!hit && typeof tab?.reconnect === 'function') {
        // 后台重连：不抢焦点（Tabby 的 session 建立与前端是否可见无关）
        try { await tab.reconnect() } catch (e) {
          log.info(`[SFTP+] reuse tab: reconnect() failed: ${wantLabel} ${(e as Error)?.message || e}`)
        }
      } else if (!hit) {
        log.info(`[SFTP+] reuse tab: tab has no reconnect(): ${wantLabel}`)
      }
      const startedAt = Date.now()
      const deadline = startedAt + timeoutMs
      while (Date.now() < deadline) {
        if (!this._isAlive) return null
        hit = ready()
        if (hit) return this._fillOptionIdentity(hit, profile, wantLabel)
        if (!activated && tab !== prevTab && Date.now() - startedAt >= INTERACTIVE_AFTER_MS) {
          // 迟迟不就绪：认证提示渲染在那个标签页里，不切过去用户根本看不到（只能干等超时）
          try { if (typeof app?.selectTab === 'function') app.selectTab(tab) } catch { /* ignore */ }
          activated = true
        }
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      return null
    } finally {
      // 只在**真的切过去过**时切回：没切过就没有可恢复的焦点，也避免无谓的一次跳转
      if (activated) this._refocusTab(prevTab)
    }
  }

  /**
   * 补齐候选的连接身份。
   *   个别 provider 的标签页不暴露 `profile`（或 host 取不到），直接拿去 switch 会让
   *   `_leftProfile` / `_leftHostLabel` 变空 ⇒ 顶栏显示「远程」、下次重连也没有 profile 可用。
   *   开标签页时我们手里就有 profile，这里回填即可。
   */
  private _fillOptionIdentity(opt: any, profile: any, label: string): any {
    if (!opt) return opt
    if (!opt.profile && profile) opt.profile = profile
    if ((!opt.label || opt.label === 'unknown-host') && label) opt.label = label
    return opt
  }

  /** 从 profile 生成展示用的连接名（user@host），与候选列表口径一致 */
  private _profileDisplayLabel(profile: any): string {
    const o: any = profile?.options || {}
    const host = String(o.host || '').trim()
    const user = String(o.username || o.user || '')
    if (!host) return String(profile?.name || '')
    return user ? `${user}@${host}` : host
  }

  /**
   * 收集**指定标签页**（含 SplitTabComponent 展开的子标签）上的 SSH 会话。
   *   用于「刚开出来的那个标签页」，不依赖整棵标签树的枚举与去重。
   */
  private _collectTabSessionOptions(root: any): any[] {
    const out: any[] = []
    const seen = new Set<any>()
    const visit = (t: any): void => {
      if (!t) return
      try {
        // SplitTabComponent / SplitContainer 才有 getAllTabs；叶子 SSHTabComponent 没有。
        // 只返回自己的实现（未来版本若把 getAllTabs 上移到基类）要落到下面读会话，不能直接 return。
        const all = typeof t.getAllTabs === 'function' ? t.getAllTabs() : null
        if (Array.isArray(all)) {
          const kids = all.filter((c: any) => c !== t)
          if (kids.length) {
            for (const c of kids) visit(c)
            return
          }
        }
      } catch { /* ignore */ }
      const ss = t.sshSession ?? t._sshSession ?? t._session ?? null
      if (!ss || seen.has(ss)) return
      seen.add(ss)
      const prof = t.profile ?? t._profile ?? null
      const o: any = prof?.options || {}
      const host = o.host || ss?.connection?.host || 'unknown-host'
      const user = o.username || o.user || ''
      const label = user ? `${user}@${host}` : String(host)
      out.push({
        key: t.id || label,
        label,
        sub: prof?.name || 'SSH',
        sshSession: ss,
        profile: prof,
        active: false,
        // ★ 2026-10-20（Deepseek-V4.1-Flash）：带上标签页对象 —— 复用/重连这条连接时要
        //   `app.selectTab(tab)` 与 `tab.reconnect()`，光有 sshSession 拿不到标签页。
        tab: t,
      })
    }
    visit(root)
    return out
  }

  /**
   * 把激活标签切回打开连接之前那一个。
   * ⛔ 判活**只能查标签树**：宿主 `BaseTabComponent.destroyed` 是 Subject（恒 truthy），
   *   `if (tab.destroyed) return` 会导致永远不切回（用户被留在新标签、看不到面板）。
   */
  private _refocusTab(tab: any): void {
    if (!tab) return
    try {
      const app: any = this._appService
      if (!app || app.activeTab === tab) return
      const tabs: any[] = Array.isArray(app.tabs) ? app.tabs : []
      if (!tabs.some(t => t === tab || this._tabContains(t, tab))) return
      app.selectTab?.(tab)
    } catch { /* ignore */ }
  }

  /** 顶层标签（可能是 SplitTabComponent）是否包含给定子标签 */
  private _tabContains(root: any, target: any): boolean {
    if (!root || !target) return false
    if (root === target) return true
    try {
      const all = typeof root.getAllTabs === 'function' ? root.getAllTabs() : null
      if (Array.isArray(all)) return all.includes(target)
    } catch { /* ignore */ }
    return false
  }

  /** 选择器里点了「未打开的配置连接」：开标签页 → 等认证 → 把会话挂到指定栏 */
  private async _connectUnopenedProfile(opt: any, side: 'left' | 'right'): Promise<void> {
    const profile = opt?.profile
    if (!profile) return
    // ★ 续二十八：整个等待窗口（可能要用户手输密码，最长 60s）顶栏就报出**目标连接名**，
    //   而不是只亮一个「连接中」让用户猜在连哪台。
    const label = String(opt?.label || '') || this._profileDisplayLabel(profile)
    // ★ 续三十一：顶栏文案按设置格式化（别名 / 账号@地址）
    // ★ 续三十三：选「未打开」的配置连接 = 先开标签页再等认证 ⇒ waiting
    this._setConnPending(side, this._connDisplayText(label, profile), 'waiting')
    // 复用现有「连接中」状态：左栏看 _leftConnecting，右栏看 reconnecting（rightConnState 认它）
    if (side === 'left') this._leftConnecting = true
    else this.reconnecting = true
    this._safeDetect()
    try {
      // ★ 续二十八：同一 profile 的连点合并到同一次开场 —— 用户「再点一次」时若上一次还在跑，
      //   等它就行；否则会并排开出第二个标签页（后开的那个还会因会话复用拿不到新会话）。
      const key = String(profile.id || profile.name || label)
      let pending = this._profileOpenInFlight.get(key)
      if (!pending) {
        pending = (async () => {
          try {
            return await this._openProfileTab(profile)
          } finally {
            this._profileOpenInFlight.delete(key)
          }
        })()
        this._profileOpenInFlight.set(key, pending)
      }
      const found = await pending
      if (!found) {
        this.showToast(this.i18n.t('notify.connOpenFailed', { host: label }), 6000)
        return
      }
      if (side === 'left') await this.switchLeftEndpoint(found)
      else await this.switchRightEndpoint(found)
    } finally {
      if (side === 'left') this._leftConnecting = false
      else this.reconnecting = false
      this._clearConnPending(side)
      this._safeDetect()
    }
  }

  /** 右栏选择器选中回调：切到本地端点，或切到某个已开 SSH 会话（issue #27 P3） */
  async switchRightEndpoint(opt: any): Promise<void> {
    this._closeConnPicker()
    this._safeDetect()
    if (!opt) return
    if (opt.local) {
      if (this._rightKind !== 'local') await this._switchRightToLocal()
      return
    }
    // ★ 2026-10-20 续二十六：配置里存在但没打开的连接 —— 现开标签页拿会话再切
    if (opt.unopened) { await this._connectUnopenedProfile(opt, 'right'); return }
    if (!opt.sshSession) return
    // 右栏当前为本地端点：先翻回 remote 再走既有远程切换（会话对象一直保留，同会话免重连）
    if (this._rightKind !== 'remote') {
      this._rightKind = 'remote'
      // ★ 2026-10-19 P1：留出 rl 时对称清空 rl 槽位（方向与 _switchRightToLocal 一致）
      if (this._rlSelected.length) { this._rlSelected = []; this._syncRlSelPaths() }
      if (this._arrowNavPane === 'rl') this._arrowNavPane = null
      if (this.activePane === 'rl') this.activePane = 'remote'
    }
    // ★ 续二十八：右栏从本地端点切远程 / 切会话时，`_rightKind` 已经先翻成 remote，
    //   但会话还没连上 ⇒ 顶栏要报出目标连接名，否则用户在等待窗口里只看到「远程(...)」分不清状态。
    //   同左栏：只在拿得到名字时置位/清空，空值会把上层刚设好的目标名抹掉。
    const pendingLabel = String(opt.label || '')
    // ★ 续三十三：外层若已把这段等待标成 waiting（自动恢复 / 开未打开连接），
    //   这里就不要再抢着写「连接中」、更不要在 finally 里清掉它——否则文案会在收尾时跳一下。
    const ownPending = !!pendingLabel && !this._pendingIsWaiting('right')
    if (ownPending) this._setConnPending('right', this._connDisplayText(pendingLabel, opt.profile))
    try {
      await this.switchRemoteSession(opt)
      this._persistRightEndpoint()
      // ★ 2026-10-22（Deepseek-V4.1-Flash）：右栏切远程后重新判可用性（左栏也是远程 ⇒ mirror 接上）
      this._onPaneKindChanged()
    } finally {
      if (ownPending) this._clearConnPending('right')
    }
  }

  /**
   * 左栏选择器选中回调：切回本地，或切到某个已开 SSH 会话。
   * @param startPath 切换后的首目录（省略 = '/'，防跨主机串目录）。恢复/重连流程传上次记住的路径，
   *                  让第一次刷新就落在目标目录（否则会先列一次根目录，看起来「卡一下才加载」）。
   */
  async switchLeftEndpoint(opt: any, startPath?: string): Promise<void> {
    this._closeConnPicker()
    this._leftConnOptions = []
    this._safeDetect()
    // 注意顺序：`opt.local` 项本身没有 sshSession，必须先处理「切回本地」再判 sshSession 是否存在，
    // 否则「本地」分支会被下面的空会话守卫提前 return 掉（切不回去）。
    if (!opt) return
    // ★ 「本地」常驻后可重复点击：已是本地时不得重入 _revertLeftToLocal（会把当前路径重置回主目录）
    if (opt.local) { if (this._leftKind !== 'local') this._revertLeftToLocal(); return }
    // ★ 2026-10-20 续二十六：配置里存在但没打开的连接 —— 现开标签页拿会话再切
    if (opt.unopened) { await this._connectUnopenedProfile(opt, 'left'); return }
    if (!opt.sshSession || opt.sshSession === this._leftSshSession) return
    // ★ 2026-10-20 全量审计 P1：切换代际。原实现没有任何并发保护 —— 用户在连接选择器里
    //   快速连点 A→B→A，两次 `switchLeftEndpoint` 会同时挂在 `await openFromSSHSession()`
    //   上，谁后返回谁说了算：先返回的 B 可能把后发起的 A 覆盖，且被覆盖那次开出来的
    //   SFTP 通道**没人释放**（引用计数永远为正 ⇒ 缓存里留死通道）。
    //   现每次进入领一个代际号，每个 await 之后复查；过期则释放自己开的通道并退出。
    const gen = ++this._leftSwitchGen
    this._leftConnecting = true
    // ★ 续二十八：开 SFTP 通道期间顶栏报出目标连接名（用户要求：别只写「连接中」）。
    //   只在拿得到名字时才置位/清空——个别 provider 的候选没有 label，空值会**清掉**上层
    //   （_connectUnopenedProfile / 自动恢复）刚设好的目标名，顶栏就会在中途「忘掉」在连谁。
    const pendingLabel = String(opt.label || '')
    // ★ 续三十三：外层已标 waiting（自动恢复 / 开未打开连接）时，不要用「连接中」覆盖、
    //   finally 也不要清掉它 —— 整段等待应保持「等待连接 <目标>」这一个措辞。
    const ownPending = !!pendingLabel && !this._pendingIsWaiting('left')
    if (ownPending) this._setConnPending('left', this._connDisplayText(pendingLabel, opt.profile))
    this._safeDetect()
    try {
      // 先开新通道再弃旧通道：openFromSSHSession 失败时保持现状，不把左栏切崩
      const sftp = await this.sftpService.openFromSSHSession(opt.sshSession)
      // ★ 2026-10-20 全量审计：本次切换已被后来的操作取代 ⇒ 释放刚开的通道后退出，
      //   既不改任何左栏状态，也不留引用计数。
      if (gen !== this._leftSwitchGen) {
        try { this.sftpService.closeForSSHSession(opt.sshSession, sftp) } catch { /* ignore */ }
        log.warn('[left] switch superseded before apply:', opt.label || '')
        return
      }
      if (this._leftKind !== 'remote') this._leftLocalPathReturn = this.localPath
      // ★ 2026-10-20：旧通道的释放同样必须走 closeForSSHSession —— 直接 end() 不更新服务的
      //   引用计数与缓存，缓存里会留下一条已关闭的通道（重连时会命中它）。
      const oldSftp = this._leftSftpSession
      const oldSsh = this._leftSshSession
      // ★ 2026-10-20 续十二：切连接前记下旧连接身份 —— 切到**同一台机**时保留原远程路径记忆，
      //   切到别的机器则必须让路径记忆跟着换（否则会拿 A 机的目录去列 B 机，必然报错）。
      const oldHostKey = this._leftEndpointHostKey()
      this._leftSftpSession = null
      if (oldSftp) {
        try {
          if (oldSsh && oldSsh !== opt.sshSession) this.sftpService.closeForSSHSession(oldSsh, oldSftp)
          else if (oldSftp !== sftp) oldSftp.end?.()
        } catch { /* ignore */ }
      }
      this._leftSshSession = opt.sshSession
      this._leftSftpSession = sftp
      this._leftProfile = opt.profile || null
      this._leftHostLabel = opt.label || ''
      this._leftKind = 'remote'
      this._leftConnected = true
      // ★ 2026-10-20：新通道已建立 ⇒ 清掉「上一个会话已销毁」的记录，再重挂监听。
      //   （_watchLeftSession 内部不再复位这个标记，见其注释。）
      this._leftSessionDestroyed = false
      // ★ 2026-10-20：新会话接管 → 重挂 closed$ 监听（旧会话的订阅在此一并释放）
      this._watchLeftSession()
      // ★ 2026-10-19 P2-6：左栏端点切换必须**分流/清空本栏导航历史**。
      //   `_localNav` 是左栏独占的一栈，而左栏端点可在本机磁盘与远程之间来回切：
      //   切之前栈里是 Windows 路径（C:\Users\...）、切之后压入的是 POSIX 路径（/home/...），
      //   两者混在同一个栈里 ⇒ 左栏按「后退」会读到**对端类型**的路径并拿去列目录
      //   （Windows 路径当远程 stat / POSIX 路径当本地 fs.stat）⇒ 列表报错。
      //   这里随端点切换清空该栈；随后 _pushLocalNav 会以新端点的首目录重新起栈。
      this._localNav.clear()
      // ★ 2026-10-20 续二十七（用户反馈「先加载一下才到记忆路径」）：
      //   首目录默认 '/'（防跨主机串目录）；**恢复/重连流程**传入上次记住的路径，
      //   这样只刷新一次就落在目标目录，不再先列一次根目录「空文件夹」再闪回目标目录。
      // ★ 2026-10-20 续三十四（用户反馈「两个连接互相切换路径记忆丢失」）：
      //   同一个连接切换时读左栏记忆；新连接（含端点互换）读右栏按 profile 存储的 SAVED_REMOTE_PATH_KEY。
      const newHostKey = this._leftEndpointHostKey()
      const sameHost = !!oldHostKey && oldHostKey === newHostKey
      let firstPath: string
      if (typeof startPath === 'string' && startPath.startsWith('/')) {
        firstPath = startPath
      } else if (sameHost) {
        // 同一连接切换：读左栏共享记忆
        const savedPath = this._leftRememberedPath()
        firstPath = (savedPath && savedPath.startsWith('/')) ? savedPath : '/'
      } else {
        // 新连接（含本地↔远程互换）：按 profile 读右栏持久化记忆，避免共享键串台
        let savedPath = ''
        if (opt.profile) {
          const h = opt.profile.options?.host || ''
          const u = opt.profile.options?.username || opt.profile.options?.user || ''
          const hostKey = (u ? `${u}@` : '') + h || '__default'
          const key = `${SftpFloatingPanel.SAVED_REMOTE_PATH_KEY}.${hostKey}`
          const fromRight = this._paneGet(key)
          if (typeof fromRight === 'string' && fromRight.startsWith('/')) savedPath = fromRight
        }
        firstPath = (savedPath && savedPath.startsWith('/')) ? savedPath : '/'
      }
      this.localPath = firstPath
      this.localPathInput = this.localPath
      this._lastLocalListedPath = null
      // ★ 2026-10-20 续十二：refreshLocal 成功后会调 _rememberLeftPath()，会把复位的 '/'
      //   当成用户路径写进记忆（内存级，keepPath 只挡落盘）⇒ 切换期间屏蔽，恢复后再记。
      this._leftPathMemorySuppressed = true
      // ★ 续二十七：切换过程整体不闪（复位目录 → 目标目录这类连刷会看起来闪两下）
      this._suppressPaneFlash = true
      try {
        await this.refreshLocal()
      } finally {
        this._leftPathMemorySuppressed = false
        this._suppressPaneFlash = false
      }
      // ★ 2026-10-20：端点切换成功后立即落盘 —— 重启 Tabby 后据此匹配同一个连接自动恢复
      // ★ 2026-10-20 续十二：`localPath` 刚被复位成 '/'，同机切换时不能拿它覆盖已记住的远程路径
      // ★ 2026-10-20 全量审计：refreshLocal() 是最后一个 await，期间若被新切换取代，
      //   这里的落盘会用**过期的端点身份**覆盖掉新切换刚写的记忆 ⇒ 重启后连错机器。
      if (gen === this._leftSwitchGen) this._persistLeftEndpoint(sameHost)
      this._onPaneKindChanged()
    } catch (e) {
      log.error('Left pane switch to remote failed:', e)
      this.showToast(this.i18n.t('notify.leftRemoteSwitchFailed') || '切换失败', 4000)
    } finally {
      this._leftConnecting = false
      // ★ 续二十八：切换结束（成功/失败）才清掉「连接中 <目标>」，否则顶栏会一直卡在连接中。
      // ★ 续三十三：只清**自己设过**的（ownPending），外层 waiting 由它自己的 finally 清。
      if (ownPending) this._clearConnPending('left')
      this._safeDetect()
    }
  }

  /** 左栏切回本地磁盘：释放第二 SFTP 会话，恢复切走前的本地路径 */
  private _revertLeftToLocal(): void {
    // ★ 2026-10-23（Deepseek-V4.1-Flash）：切本地 = 用户**抢占**了「左栏自动恢复」。
    //   重启 Tabby 后左栏会自动恢复上次的远程端点，恢复流程最多轮询 30s；
    //   用户在这段时间里把左栏换成「本地」时，恢复流程必须就此放弃 ——
    //   否则超时分支会把刚切好的本地又改回「远程（已断开）」（用户实测的「又出现」）。
    this._leftRestoreAbort = true
    // 恢复流程的 finally 要等下一次轮询才发现 abort（最多 500ms 后 return）——
    //   先把「恢复中」与顶栏「连接中 <目标>」就地清掉，用户切完本地立刻看到本地面板，
    //   而不是顶栏还挂着「等待连接」等半秒。
    this._leftRestoring = false
    this._clearConnPending('left')
    // ★ 2026-10-20：端点切走后必须摘下 closed$ 订阅与兜底轮询，否则旧会话的迟到事件
    //   会把已经变成「本地」的左栏重新标成断开。
    this._unwatchLeftSession()
    this._leftConnected = false
    this._leftConnecting = false
    this._leftReconnecting = false
    if (this._leftSftpSession) {
      const oldSftp = this._leftSftpSession
      const oldSsh = this._leftSshSession
      this._leftSftpSession = null
      try {
        // 同 switchLeftEndpoint：释放引用计数而非裸 end()
        if (oldSsh) this.sftpService.closeForSSHSession(oldSsh, oldSftp)
        else oldSftp.end?.()
      } catch { /* ignore */ }
    }
    this._leftSshSession = null
    this._leftSftpSession = null
    this._leftProfile = null
    this._leftHostLabel = ''
    this._leftKind = 'local'
    // 端点已回到本机磁盘：「会话已销毁」的记录没有意义，清掉免得下次切远程时被误判成断线
    this._leftSessionDestroyed = false
    // ★ 2026-10-19 P2-6：同 switchLeftEndpoint —— 端点切回本机磁盘时同样清空左栏导航栈，
    //   避免残留的 POSIX 历史条目被本地「后退」读到（对端类型路径 ⇒ 列表报错）。
    this._localNav.clear()
    const restore = (this._leftLocalPathReturn && path.isAbsolute(this._leftLocalPathReturn))
      ? this._leftLocalPathReturn
      : os.homedir()
    this.localPath = restore
    this.localPathInput = restore
    this._leftLocalPathReturn = ''
    this._lastLocalListedPath = null
    void this.refreshLocal()
    // ★ 2026-10-20：写回 kind='local'，否则重启后还会按「remote」去找那个连接
    this._persistLeftEndpoint()
    // ★ 2026-10-22（Deepseek-V4.1-Flash）：左栏回到本地后可能刚好与右本地「同类」⇒ 让 mirror 接上
    this._onPaneKindChanged()
  }

  // ========== 2026-10-20：左栏远程连接的状态监视 / 重连 ==========

  /**
   * ★ 2026-10-20（用户诉求）：左栏远程通道的死亡监听。
   *
   * 为什么右栏那套不能复用：右栏的会话丢失由 `PanelConnectionLifecycle.startHeartbeat()`
   *   监听 `ssh.closed$` / `open === false` / `terminal.session === null` 判定；而左栏是
   *   另一条独立 SFTP 通道（`_leftSftpSession`），生命周期里根本没有它 ⇒「在 Tabby 里
   *   关掉那个连接标签」时，左栏界面毫无反应（用户实测：双远程时分不清是哪一栏断了）。
   *
   * 这里订阅同一套硬信号：closed$（主）/ `.closed` Promise（次）+ `open === false` 轮询兜底。
   *   轮询是纯内存读标志位，2s 一次，不做网络探测（不碰 SFTP 通道，避免干扰在途传输）。
   */
  private _watchLeftSession(): void {
    this._unwatchLeftSession()
    // ⛔ 这里**不再**无条件 `_leftSessionDestroyed = false`。
    //   宿主的 destroy() 只发 willDestroy$ 并 disconnect，不会把 open 置回 false
    //   （tabby-ssh/src/session/ssh.ts）⇒ `_leftSessionDestroyed` 是「会话已销毁」的唯一可靠记录。
    //   上一版每次重挂监听都把它清掉，导致重连失败后 `_leftSessionLooksDead()` 恒判 false：
    //   面板停在「顶栏显示已连接、列表报无法访问」的僵尸态（用户实测截图）。
    //   现在改由「确认活着」的一方显式清零：switchLeftEndpoint 开新通道成功后、
    //   _reconnectLeftPane 探针通过后、_revertLeftToLocal 切回本机后。
    const ssh: any = this._leftSshSession
    if (!ssh) return
    const subs: Array<{ unsubscribe: () => void }> = []
    const onDead = (reason: string) => this._markLeftDisconnected(reason)
    try {
      // ① 宿主 SSHSession 的 willDestroy$ —— Tabby v1.x 里**唯一**可靠的「会话要销毁了」信号。
      //    实证（D:/Develop/Tabby/resources/builtin-plugins/tabby-ssh/src/session/ssh.ts）：
      //      destroy() { this.willDestroy.next(); ...; this.ssh.disconnect() }
      //    既没有 closed$、也没有 .closed，更不会把 open 置回 false。上一轮只订阅后两者
      //    ⇒ 用户在 Tabby 里关掉那个连接标签时，左栏状态**永远不会翻**（用户实测）。
      if (ssh.willDestroy$ && typeof ssh.willDestroy$.subscribe === 'function') {
        subs.push(ssh.willDestroy$.subscribe({ next: () => onDead('willDestroy$') }))
      }
      // ② 兼容：其他 SSH provider / 未来版本可能提供 closed$ 或 .closed
      if (ssh.closed$ && typeof ssh.closed$.subscribe === 'function') {
        subs.push(ssh.closed$.subscribe({ next: () => onDead('closed$') }))
      } else if (typeof ssh.closed?.then === 'function') {
        void (ssh.closed as Promise<void>).then(() => onDead('.closed promise')).catch(() => { /* ignore */ })
      }
    } catch { /* ignore */ }
    this._leftCloseSub = subs.length
      ? {
          unsubscribe: () => {
            for (const s of subs) { try { s.unsubscribe() } catch { /* ignore */ } }
          },
        }
      : null
    // ③ 最后一道兜底：`open === false` 轮询（对不提供 willDestroy$ 的会话实现有意义）。
    // ⛔ 必须 runOutsideAngular：本定时器只为轮询标志位，跑在 zone 内会每 2s 诱发一次
    //   整面板变更检测（面板里有虚拟列表/分组缓存，代价不低）。状态翻转时由 _safeDetect 主动刷新。
    this._leftCloseWatchTimer = this.zone.runOutsideAngular(() => setInterval(() => {
      const s: any = this._leftSshSession
      if (!s) { this._unwatchLeftSession(); return }
      if (s.open === false) this._markLeftDisconnected('open=false')
    }, 2000))
  }

  /** 摘下左栏会话监听（切换端点 / 卸载时调用） */
  private _unwatchLeftSession(): void {
    if (this._leftCloseSub) {
      try { this._leftCloseSub.unsubscribe() } catch { /* ignore */ }
      this._leftCloseSub = null
    }
    if (this._leftCloseWatchTimer) {
      clearInterval(this._leftCloseWatchTimer)
      this._leftCloseWatchTimer = null
    }
  }

  /**
   * 左栏通道判定失效：只翻状态、保留列表现场（用户还可能想对着旧目录复制路径），
   * 不弹错误弹窗——顶栏红点 + 重连图标就是唯一提示，避免断开瞬间连续弹窗。
   */
  private _markLeftDisconnected(reason: string): void {
    if (this._leftKind !== 'remote' || !this._leftConnected) return
    this._leftConnected = false
    this._leftSessionDestroyed = true
    const dead = this._leftSftpSession
    // ⛔ 必须走 closeForSSHSession（不是裸 end()）：服务的引用计数与 `sessions` 缓存都在它里面维护。
    //   裸 end() 会让缓存里残留一条**已 end** 的通道，之后 openFromSSHSession 命中缓存直接返回它
    //   ⇒ 重连"看似成功"、实际所有操作都失败（用户实测：重连后仍连不上、还显示已连接）。
    this._leftSftpSession = null
    if (dead) {
      try {
        const ssh = this._leftSshSession
        if (ssh) this.sftpService.closeForSSHSession(ssh, dead)
        else dead.end?.()
      } catch { /* ignore */ }
    }
    this._unwatchLeftSession()
    // 断开后列表只剩「上次看到的内容」，再点进去只会继续报错 —— 清空并让空态显示「连接已断开」。
    // （保留 selected 会让人以为还能操作；路径保留，重连后仍回到同一目录。）
    this.localEntries = []
    this._localError = false
    this._invalidateLocalCache()
    log.info(`[SFTP+] left pane channel lost (${reason})`)
    this._safeDetect()
  }

  /**
   * ★ 2026-10-20：左栏通道操作失败后，判断「到底是会话死了，还是这个目录没权限/不存在」。
   *
   * 用户实测场景：左栏远程连的是**另一个 Tabby 标签页**的会话，把那个标签关掉后回到面板点刷新，
   *   之前只会显示「无法访问（权限不足或路径不存在）」——把断线误报成权限问题。
   *   判据优先级：willDestroy$ 已发射 > open===false > 错误文案是连接类（channel/socket/EOF 等）。
   *   只在**确实像连接断了**时才翻状态，避免「目录不存在」被误判成断线。
   */
  private _leftSessionLooksDead(err?: unknown): boolean {
    if (this._leftSessionDestroyed) return true
    const ssh: any = this._leftSshSession
    if (!ssh) return true
    if (ssh.open === false) return true
    const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
    if (!msg) return false
    return /channel.*clos|connection.*clos|connection lost|not open|no response|econnreset|etimedout|broken pipe|socket hang up|sftp session (is )?close|eof\b/.test(msg)
  }

  /** 顶栏连接分段的重连图标（左栏）：先拦冒泡，避免同时触发连接选择器 */
  onReconnectLeft(ev?: MouseEvent): void {
    ev?.stopPropagation()
    // ★ 续二十七：用户点重连 = 抢占自动恢复（恢复还在轮询时不要跟用户的动作抢）
    this._leftRestoreAbort = true
    void this._reconnectLeftPane()
  }

  /** 顶栏连接分段的重连图标（右栏 / 单栏）：与旧的「重连」按钮同一入口 */
  onReconnectFromBar(ev?: MouseEvent): void {
    ev?.stopPropagation()
    void this.onReconnect()
  }

  /**
   * 左栏重连。按「会话还在不在」分两条路：
   *
   * ① **SSH 会话还活着**（只是 SFTP 子通道坏了）→ 重新开一条通道，不动 Tabby 标签页。
   * ② **会话本身已销毁**（用户在 Tabby 里关掉了那个连接标签）→ SFTP 无从复活，
   *    用左栏记住的 profile **重新打开这个连接**（新标签页 → 等认证 → 挂到左栏），见 `_reopenLeftConnection`。
   *
   * ⛔ 判「还活着」不能只看 `ssh.open === false`：宿主 `destroy()` 只 `willDestroy$.next()`
   *   + `ssh.disconnect()`，**不会**把 open 置回 false（tabby-ssh/src/session/ssh.ts）
   *   ⇒ 已销毁的会话在这里看起来依然 open，于是走到 ①，对死会话 `openSFTP()` /
   *   命中缓存死通道，最后面板显示「已连接」却什么都做不了（用户实测）。
   *   可靠判据是 `_leftSessionDestroyed`（_watchLeftSession 订阅 willDestroy$ 时置位）。
   *
   * ⛔ 通道开成功 ≠ 能用：`openFromSSHSession` 命中缓存时会直接把旧的（可能已死的）通道返回，
   *   不抛错。所以必须先用 readdir('/') 探一次真实可用性，通过后才置「已连接」。
   */
  private async _reconnectLeftPane(): Promise<void> {
    if (this._leftReconnecting) return
    const ssh: any = this._leftSshSession
    if (!ssh || this._leftSessionDestroyed || ssh.open === false) {
      await this._reopenLeftConnection()
      return
    }
    this._leftReconnecting = true
    this._leftConnecting = true
    this._safeDetect()
    // ① 走不通（开不出来 / 探针不通过）时置位，离开 try 后改走 ② 重开连接。
    //   必须在 finally 复位 `_leftReconnecting` 之后才能调用 _reopenLeftConnection——
    //   它自己有同名守卫，提前调用会被直接 return 掉（点了没反应）。
    let needReopen = false
    try {
      // ⛔ 必须先释放旧通道再开新的：服务缓存里若留着这条死通道，`openFromSSHSession`
      //   会直接命中缓存返回它（不抛错）⇒「重连看着成功、实际连不上」。走 closeForSSHSession
      //   才能同时维护引用计数与缓存（裸 end() 只关通道，缓存条目仍在）。
      const old = this._leftSftpSession
      if (old) {
        try { this.sftpService.closeForSSHSession(ssh, old) } catch { /* ignore */ }
        if (this._leftSftpSession === old) this._leftSftpSession = null
      }
      const sftp = await this.sftpService.openFromSSHSession(ssh)
      this._leftSftpSession = sftp
      if (!await this._verifyLeftChannel()) {
        // 探针失败 = 这条通道真的不能用：立即释放并清空，绝不让死通道留在字段里再报「已连接」。
        // ⛔ 不能在这里调 _markLeftDisconnected —— 它带 `!this._leftConnected` 早退守卫，
        //   而走到重连时状态本来就是 disconnected，会被直接 return 掉（什么都不做）。
        try { this.sftpService.closeForSSHSession(ssh, sftp) } catch { /* ignore */ }
        if (this._leftSftpSession === sftp) this._leftSftpSession = null
        needReopen = true
      } else {
        this._leftSessionDestroyed = false
        this._leftConnected = true
        this._leftConnecting = false
        this._leftReconnecting = false
        // 旧订阅在 _markLeftDisconnected 里已摘下；重连成功后必须重挂，否则会再次「静默失效」
        this._watchLeftSession()
        this._safeDetect()
        // ★ 2026-10-20（Deepseek-V4.1-Flash，用户诉求「重连成功后应该要打开上次的路径记忆的路径」）：
        //   `localPath` 若已被端点切换/失败的恢复复位成 '/'，这里必须先补回记忆值再刷新——
        //   否则重连确实成功了，但左栏停在根目录、列表空，看起来像「路径记忆失效」（用户截图实证）。
        if (this.localPath === '/') {
          const remembered = this._leftRememberedPath()
          if (remembered && remembered !== '/') {
            this.localPath = remembered
            this.localPathInput = remembered
          }
        }
        await this.refreshLocal()
        this._persistLeftEndpoint()
      }
    } catch (e) {
      log.error('[SFTP+] left pane reconnect failed:', e)
      this._leftConnected = false
      // 只有「像连接断了」才升级到重开标签页；纯粹的瞬时失败仍按普通重连失败提示，
      // 否则用户会遇到「点重连结果多开一个标签页」的意外行为。
      if (this._leftSessionLooksDead(e)) needReopen = true
      else this.showToast(this.i18n.t('notify.leftRemoteSwitchFailed') || '重连失败', 4000)
    } finally {
      this._leftReconnecting = false
      this._leftConnecting = false
      this._safeDetect()
    }
    if (needReopen) await this._reopenLeftConnection()
  }

  /**
   * 通道真实可用性探针：对根目录 readdir 一次。
   *
   * 为什么探 `/` 而不是当前目录：当前目录可能只是被删了 / 没权限，那是「目录问题」不是「通道问题」，
   *   拿它当判据会把活通道误判成死通道（把用户踢进重连循环）。`/` 恒存在。
   */
  private async _verifyLeftChannel(): Promise<boolean> {
    const sftp: any = this._leftSftpSession
    if (!sftp || typeof sftp.readdir !== 'function') return false
    try {
      await sftp.readdir('/')
      return true
    } catch (e) {
      log.warn('[SFTP+] left channel probe failed:', (e as Error)?.message)
      return false
    }
  }

  /**
   * ★ 2026-10-20（Deepseek-V4.1-Flash）：左栏远程路径**持久化记忆**（`paneState/leftRemotePath`）。
   *   每次远程列表刷新成功 `_rememberLeftPath()` 都会更新它，是「上次停在哪」的唯一权威来源。
   *   非法值（非 POSIX 绝对路径）返回空串，调用方自行兜底。
   */
  private _leftRememberedPath(): string {
    try {
      const p = this._ptGet('leftRemotePath')
      return (typeof p === 'string' && p.startsWith('/')) ? p : ''
    } catch { return '' }
  }

  /**
   * ★ 2026-10-20（Deepseek-V4.1-Flash，用户诉求：「重连成功后应该要打开上次的路径记忆的路径吧」）：
   *   重连时应该打开的起始目录。
   *
   * 两个来源取「更具体」的那个：
   *   ① `paneState/leftRemotePath` —— 真正的路径记忆；
   *   ② 当前 `localPath` —— 断开态下它名义上也是上次停的目录，但端点切换的「复位 '/'」
   *      逻辑、以及一次失败的自动恢复都可能把它写成 '/'。
   *   '/' 几乎总是复位值/默认值：它绝不能盖掉一条更深的记忆（否则重连就停在根目录、列表空）。
   */
  private _leftStartPathForReconnect(): string {
    const remembered = this._leftRememberedPath()
    const current = (typeof this.localPath === 'string' && this.localPath.startsWith('/')) ? this.localPath : ''
    if (remembered && current) return current.length > remembered.length ? current : remembered
    return remembered || current
  }

  /** 左栏记住的连接身份（host/user/port + 展示标签），供重开连接后重新匹配 */
  private _leftSavedIdentity(): { host?: string; user?: string; port?: number; label?: string } {
    const o: any = this._leftProfile?.options || {}
    const id = {
      host: String(o.host || ''),
      user: String(o.username || o.user || ''),
      port: Number(o.port) || 22,
      label: this._leftHostLabel || '',
    }
    // ★ 续三十一：断开态下 `_leftProfile` 可能为空（恢复超时时从未 switch 成功）⇒ host/user/port
    //   全空，后面按身份找 profile 就只能靠 label 撞运气。退回持久化的连接身份，匹配才有依据。
    if (!id.host) {
      try {
        // ★ 2026-10-21：按标签页分槽读取（perTab 优先，全局槽兜底）
        const saved: any = this._ptGet('leftRemoteHost')
        if (saved && typeof saved === 'object') {
          id.host = String(saved.host || '')
          id.user = String(saved.user || '')
          id.port = Number(saved.port) || 22
          if (!id.label) id.label = String(saved.label || '')
        }
      } catch { /* ignore */ }
    }
    return id
  }

  /**
   * 会话已销毁时**真正的**重连：Tabby 标签页关掉后 SSH 会话对象无法复用，只能重开一个同样的连接。
   *   走宿主的 `ProfilesService.openNewTabForProfile(profile)`（Tabby 自己的「新建标签页」同一条路径，
   *   认证、密码提示、跳板机等行为都保持一致），然后轮询标签树等新会话 `open === true`，再挂到左栏。
   *
   * 没有 profile（个别 provider 不暴露 profile）或无 ProfilesService 时退化为
   *   「提示 + 打开连接选择器」，绝不让顶栏继续显示一个假的「已连接」。
   */
  private async _reopenLeftConnection(): Promise<void> {
    if (this._leftReconnecting) return
    const saved = this._leftSavedIdentity()
    let profile: any = this._leftProfile
    let profiles: any = null
    try { profiles = this.injector.get(ProfilesService as any, null as any) } catch { profiles = null }
    // ★ 续三十一：断开态（尤其是「重启后自动恢复超时」那种）`_leftProfile` 是空的，
    //   而用户此时点重连的唯一期望就是重开这条连接 ⇒ 先按身份到配置里查一次，别直接放弃。
    if (!profile) profile = await this._resolveProfileByIdentity(saved)
    if (!profile || typeof profiles?.openNewTabForProfile !== 'function') {
      this.showToast(this.i18n.t('notify.paneConnClosed'), 5000)
      this.openLeftConnPicker()
      return
    }
    this._leftReconnecting = true
    this._leftConnecting = true
    // ★ 续二十八：重开连接同样要报出目标连接名（等待认证期间可能长达 60s）
    // ★ 续三十三：重开连接前要先等标签页会话就绪 ⇒ waiting（用户原话：「应该是等待连接」）
    this._setConnPending('left', this._connDisplayText(String(saved.label || ''), profile), 'waiting')
    this._safeDetect()
    // ★ 2026-10-20（Deepseek-V4.1-Flash）：起始目录取「记忆路径 vs 当前路径」中更具体的那个 ——
    //   断开态下 localPath 可能是复位出来的 '/'，直接拿它会导致「重连成功但停在根目录」。
    const keepPath = this._leftStartPathForReconnect()
    // 诊断（用户可在 log.txt 里 grep 这行核对「重连到底用了哪条路径、记忆里存的是什么」）
    log.info(`[SFTP+] left reopen: start="${keepPath}" remembered="${this._leftRememberedPath()}" current="${this.localPath}"`)
    try {
      // ★ 续二十八：改走与「开未打开配置连接」同一个实现 —— 旧版靠「枚举标签树再相减」找新会话，
      //   会话被宿主 multiplexer 复用时永远找不到「新会话」，白等满 60s（见 _openTabAndWaitSession 注释）。
      const opt: any = await this._openTabAndWaitSession(profile, saved)
      if (!opt) {
        log.info(`[SFTP+] left pane reopen: session not ready in time: ${saved.label || ''}`)
        this.showToast(this.i18n.t('notify.connOpenFailed', { host: saved.label || '' }), 6000)
        return
      }
      // ★ 续二十七：把原目录作为首目录传进去 —— 只刷一次，不再「先 '/' 再闪回原目录」
      await this.switchLeftEndpoint(opt, keepPath.startsWith('/') ? keepPath : undefined)
      // switchLeftEndpoint 会把 profile 置成新标签页的那份；个别 provider 取不到时补回旧值，
      // 否则下一次重连就没有 profile 可用了（重连能力被永久切断）。
      if (!this._leftProfile) this._leftProfile = profile
      if (this._leftKind === 'remote' && this._leftConnected) this._persistLeftEndpoint()
    } catch (e) {
      log.error('[SFTP+] left pane reopen failed:', e)
      this.showToast(this.i18n.t('notify.leftRemoteSwitchFailed') || '重连失败', 4000)
    } finally {
      this._leftReconnecting = false
      this._leftConnecting = false
      this._clearConnPending('left')
      this._safeDetect()
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
    if (this._paneFlushTimer) { clearTimeout(this._paneFlushTimer); this._paneFlushTimer = null }
    // ★ 2026-10-20 全量审计：右栏本地（rl）端点新增的三个定时器此前没接入统一清理表，
    //   销毁后最长还会持有整个面板约 1.3s（回调里直接改状态 + 触发变更检测）。
    if (this._rlFlashTimer) { clearTimeout(this._rlFlashTimer); this._rlFlashTimer = null }
    if (this._rlLocateFlashTimer) { clearTimeout(this._rlLocateFlashTimer); this._rlLocateFlashTimer = null }
    if (this._rlClickTimer) { clearTimeout(this._rlClickTimer); this._rlClickTimer = null }
    this._clearQueuedEntryTimers()
  }

  /**
   * ★ 2026-10-20 续三十三：把面板状态（含左栏远程路径记忆）延迟落盘。
   *   合并连续导航：已有排期就不再叠（最多每 delayMs 落一次盘），避免快速浏览目录时反复写 config.yaml。
   */
  private _schedulePaneFlush(delayMs = 1200): void {
    if (this._paneFlushTimer) return
    this._paneFlushTimer = setTimeout(() => {
      this._paneFlushTimer = null
      if (!this._isAlive) return
      try { this._paneFlush() } catch { /* ignore */ }
    }, delayMs)
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
      // ★ 高危#13修复：将清理逻辑原子化，只在当前cancelRef确实属于自己时才清理，
      //   避免并发任务覆盖this._cancelRef后误清理其它任务的引用
      if (this._cancelRef === cancelRef) {
        this._cancelRef = prevRef
        if (this._cancelRef && !this._cancelRef.current && !(this._cancelRef.active?.size)) this._cancelRef = null
      }
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
    // ★ issue #27 P0：左栏处于远程端点时，本地列表改由第二 SFTP 会话驱动（POSIX 语义）
    if (this._leftKind === 'remote') return this._refreshLeftRemote()
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
    const needOwner = this.localShowColOwner || this.localShowColGroup
    try {
      const entries = await this._listLocalEntries(requestedPath, needOwner)
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
      // ★ 2026-10-20：记住左栏本地路径（重启后恢复；不 flush，随销毁时统一落盘）
      this._rememberLeftPath()
      // ★ 2026-10-22：同步路径模式 —— 左栏换目录就把右栏带过去（路径没变时内部早退，不会额外刷新）
      void this._mirrorFollowFrom('left')
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
    this._flashPaneList()
  }

  /**
   * 列表刷新成功后的闪烁反馈。
   * ⛔ 2026-10-20 续二十七：恢复/切换端点时会连续刷两次（复位目录 → 记忆目录），
   *   两次 0.25s 淡蓝背景叠起来就是用户看到的「闪两下」⇒ 这些流程里整体抑制。
   *   另外**首帧填充不闪**：面板刚打开时列表是从无到有，那一下「刷新」没有任何信息量。
   */
  /**
   * ★ 2026-10-28（Deepseek-V4.1-Flash）：统一判定「当前这次刷新是否应闪烁」。
   *   本地 / 远程两侧共用，四道闸门：① 全局开关关 ⇒ 不闪；② 恢复/切换端点（连续刷两次）⇒ 不闪；
   *   ③ 定时刷新（无信息量）⇒ 不闪；④ 面板首帧填充（从无到有）⇒ 不闪。
   *   ⛔ 之前远程栏直接 `this._remoteFlash = true`、不认 ②③，导致定时刷新 / 恢复切换时远程栏仍闪、
   *      与本地不对称 —— 这次一并修掉：两侧都走本判定。
   *   首帧那一下同时把标志置 true，保证只被吞一次。
   */
  private _shouldFlashPane(): boolean {
    if (!this._flashEnabled) return false
    if (this._suppressPaneFlash) return false
    if (this._autoRefreshQuiet) return false
    if (!this._firstListPainted) { this._firstListPainted = true; return false }
    return true
  }

  private _flashPaneList(): void {
    if (!this._shouldFlashPane()) return
    this._localFlash = true
    this._safeDetect()
    if (this._localFlashTimer) clearTimeout(this._localFlashTimer)
    this._localFlashTimer = setTimeout(() => { this._localFlash = false; this._localFlashTimer = null }, 260)
  }
  /**
   * ★ issue #27 P3：列出本地目录条目（纯扫描，不含任何面板状态写入）。
   * 从 refreshLocal 抽出，供左栏本地与右栏本地（_rl*）两个浏览器共用同一套
   * readdir + 分批 lstat + Windows .lnk / symlink 解析逻辑，避免双份漂移。
   * （命名避开同文件既有的 _scanLocalDir——那是目录体积统计。）
   */
  private async _listLocalEntries(requestedPath: string, needOwner: boolean): Promise<LocalEntry[]> {
    const names = await fs.readdir(requestedPath)
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
    return entries
  }

  /**
   * ★ issue #27 P0：左栏远程端点的目录列表。
   * 复用本地面板的状态槽（localPath/localEntries/选中集/刷新代际），数据源换成第二 SFTP 会话；
   * 条目直接映射 tabby readdir 的 SFTPFile（fullPath 已是 POSIX 全路径），保号段与本地一致。
   */
  private async _refreshLeftRemote(): Promise<void> {
    this.localPathInput = this.localPath
    const session = this._leftSftpSession
    if (!session) return
    const gen = ++this._localRefreshGen
    const requestedPath = this.localPath
    if (this._lastLocalListedPath !== requestedPath) {
      this._lastLocalListedPath = requestedPath
      this._dropSelection('local')
    }
    this._localFlash = false
    try {
      const items: any[] = await session.readdir(requestedPath)
      if (gen !== this._localRefreshGen) return
      const entries: LocalEntry[] = (items || []).map((it: any) => ({
        name: it.name,
        fullPath: it.fullPath || path.posix.join(requestedPath === '/' ? '' : requestedPath, it.name),
        isDirectory: !!it.isDirectory,
        isSymlink: !!it.isSymlink,
        mode: it.mode ?? 0,
        size: it.size ?? 0,
        mtimeMs: it.modified ? new Date(it.modified).getTime() : (it.mtimeMs ?? 0),
      }))
      this.zone.run(() => {
        if (gen !== this._localRefreshGen) return
        this.localEntries = entries
        this._localError = false
        this._invalidateLocalCache()
        this._pruneSelection('local')
        this._safeDetect()
      })
      // ★ 2026-10-20：记住左栏远程当前目录（重启后连同连接一起恢复）
      this._rememberLeftPath()
      // ★ 2026-10-22：同步路径模式（左栏远程 → 右栏远程）
      void this._mirrorFollowFrom('left')
    } catch (e) {
      if (gen !== this._localRefreshGen) return
      log.error('Left remote listing failed', e)
      // ★ 2026-10-20（用户反馈）：先判断是不是**会话已经死了**（Tabby 标签被关掉）。
      //   是的话不能落到 hasError 分支——那会显示「无法访问（权限不足或路径不存在）」，
      //   把断线误报成权限问题；改为翻成 disconnected，空态交给 connLost 文案。
      if (this._leftSessionLooksDead(e)) {
        this._markLeftDisconnected('listing failed')
        this.zone.run(() => {
          if (gen !== this._localRefreshGen) return
          this.localEntries = []
          this._localError = false
          this._invalidateLocalCache()
          this._pruneSelection('local')
          this._safeDetect()
        })
        return
      }
      this.zone.run(() => {
        if (gen !== this._localRefreshGen) return
        this.localEntries = []
        this._localError = true
        this._invalidateLocalCache()
        this._pruneSelection('local')
        this._safeDetect()
      })
      return
    }
    if (gen !== this._localRefreshGen) return
    this._flashPaneList()
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
    // ★ issue #27 P0：左栏远程端点按 POSIX 语义判定（'/' 即根）
    if (this._leftKind === 'remote') return this.localPath !== '/'
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
      // ★ issue #27 P0：左栏远程端点 → POSIX 上级目录
      if (this._leftKind === 'remote') {
        if (this.localPath === '/' || !this._leftSftpSession) return
        const next = path.posix.dirname(this.localPath)
        const dest = next === '.' ? '/' : next
        this._pushLocalNav(dest); this.localPath = dest; this.localPathInput = dest
        this.saveCurrentPath(); void this.refreshLocal()
        return
      }
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
    // ★ issue #27 P0：左栏远程端点的「主目录」= 根目录（第二会话无统一 home 语义）
    const home = side === 'local'
      ? (this._leftKind === 'remote' ? '/' : os.homedir())
      : '/'
    if (side === 'remote' && (!this.connected || !this.sftpSession)) return
    if (side === 'local' && this._leftKind === 'remote' && !this._leftSftpSession) return
    if (side === 'local') this._pushLocalNav(home)
    else this._pushRemoteNav(home)
    if (side === 'local') { this.localPath = home; this.localPathInput = home }
    else { this.remotePath = home; this.remotePathInput = home }
    this.saveCurrentPath()
    if (side === 'local') void this.refreshLocal()
    else void this.refreshRemote()
  }

  goToLocalPathInput(): void {
    void this._goToPathInput('local', this.localPathInput || this.localPath)
  }

  private normalizeLocalPath(p: string): string {
    // ★ issue #27 P0：左栏远程端点 → POSIX 语义（与 normalizeRemotePath 同规则）
    if (this._leftKind === 'remote') {
      if (!p) return this.localPath || '/'
      let r = p.trim()
      if (!r) return this.localPath || '/'
      if (!r.startsWith('/')) r = (this.localPath || '/') + '/' + r
      r = path.posix.normalize(r.replace(/\/+/g, '/'))
      if (!r.startsWith('/')) r = '/' + r
      return r
    }
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
        // ★ 2026-10-23：刷新成功 ⇒ 通道是活的，清掉「通道死」标记（连接生命周期的首刷回退判据）
        this._lastRemoteListDead = false
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
      // ★ 2026-10-23：记下失败性质 —— 通道死（可自愈，别丢记忆路径）vs 目录不可用（该回退 '/'）
      this._lastRemoteListDead = isChannelDeadError(e)
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
    // ★ 2026-10-22：同步路径模式 —— 右栏远程换目录就把左栏带过去
    void this._mirrorFollowFrom('right')
    // ★ 2026-10-28（Deepseek-V4.1-Flash）：远程栏也走统一闪烁判定（修掉之前漏判定时/恢复导致的不对称）
    if (this._shouldFlashPane()) {
      this._remoteFlash = true
      this._safeDetect()
      if (this._remoteFlashTimer) clearTimeout(this._remoteFlashTimer)
      this._remoteFlashTimer = setTimeout(() => {
        this._remoteFlash = false
        this._remoteFlashTimer = null
      }, 260)
    }
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
    void this._goToPathInput('remote', this.remotePathInput || '/')
  }

  /**
   * ★ 2026-10-16 issue #26：地址栏回车导航（本地/远程统一入口）。
   *   若输入为「目录路径」（以分隔符结尾，或末段在父目录里确实是文件夹）→ 直接进该目录（保持旧行为）；
   *   若输入「含文件名的绝对路径」→ 进入父目录，并把该文件高亮定位（选中 + 滚动居中 + 闪烁）。
   *   末段在父目录列表里找不到时，仅停留在父目录，不再把文件当目录去列导致报错。
   */
  private async _goToPathInput(side: 'local' | 'remote', input: string): Promise<void> {
    if (side === 'remote' && !this.connected) return
    const { navDir, leaf } = this._splitPathForLocate(input, side)
    const curPath = side === 'local' ? this.localPath : this.remotePath
    const target = side === 'local' ? this.normalizeLocalPath(navDir || curPath) : this.normalizeRemotePath(navDir || '/')
    if (target !== curPath) {
      if (side === 'local') { this._pushLocalNav(target); this.localPath = target; this.localPathInput = target; this.saveCurrentPath() }
      else { this._pushRemoteNav(target); this.remotePath = target; this.remotePathInput = target; this.saveCurrentPath() }
    }
    // 先跳到「父目录」并刷新列表（即使 target === curPath 也要刷新，确保列表是最新的、能定位到 leaf）
    if (side === 'local') await this.refreshLocal()
    else await this.refreshRemote()
    if (leaf) this._afterLocateCheck(side, input, leaf)
  }

  /**
   * ★ 2026-10-16 issue #26：地址栏路径拆分。
   *   以分隔符结尾 ⇒ 整段当作目录（leaf 为空，走纯目录导航）。
   *   否则按「父目录 + 末段文件名」拆分，末段用于后续高亮定位。
   */
  private _splitPathForLocate(input: string, side: 'local' | 'remote'): { navDir: string; leaf: string } {
    const raw = (input || '').trim()
    // ★ issue #27 P0：左栏远程端点按 POSIX 拆分（'/' 结尾判定也随端点切换）
    const leftPosix = side === 'local' && this._leftKind === 'remote'
    const trailingSep = (side === 'local' && !leftPosix) ? /[\\/]$/ : /\/$/
    if (!raw || trailingSep.test(raw)) return { navDir: raw, leaf: '' }
    let eff: string
    if (side === 'remote' || leftPosix) {
      eff = side === 'local' ? this.normalizeLocalPath(raw) : this.normalizeRemotePath(raw)
      const leaf = path.posix.basename(eff)
      const navDir = path.posix.dirname(eff) || '/'
      return { navDir, leaf }
    }
    if (side === 'local') {
      const base = path.isAbsolute(raw) ? raw : path.join(this.localPath || '', raw)
      eff = path.resolve(path.normalize(base))
    }
    const leaf = path.basename(eff)
    const navDir = path.dirname(eff)
    return { navDir, leaf }
  }

  /**
   * ★ 2026-10-16 issue #26：父目录刷新后，定位末段。
   *   - 末段在父目录里是文件夹 ⇒ 进该文件夹（保留旧目录导航语义，不闪烁）；
   *   - 末段是文件 ⇒ 高亮定位（选中 + 滚动居中 + 闪烁）；
   *   - 末段不存在 ⇒ 仅停留在父目录。
   */
  private _afterLocateCheck(side: 'local' | 'remote', fullRaw: string, leaf: string): void {
    const list = side === 'local' ? this.getFilteredLocalEntries() : this.getFilteredRemoteEntries()
    if (!list || !list.length) return
    const entry = list.find(e => e.name === leaf)
    if (!entry) return
    if (entry.isDirectory) {
      const curPath = side === 'local' ? this.localPath : this.remotePath
      const fullDir = side === 'local' ? this.normalizeLocalPath(fullRaw || curPath) : this.normalizeRemotePath(fullRaw || '/')
      if (fullDir && fullDir !== curPath) {
        if (side === 'local') { this._pushLocalNav(fullDir); this.localPath = fullDir; this.localPathInput = fullDir; this.saveCurrentPath(); void this.refreshLocal() }
        else { this._pushRemoteNav(fullDir); this.remotePath = fullDir; this.remotePathInput = fullDir; this.saveCurrentPath(); void this.refreshRemote() }
      }
      return
    }
    this._locateEntryByName(side, leaf)
  }

  /**
   * ★ 2026-10-16 issue #26：选中并按文件名高亮定位某条目（与键入定位共用滚动/选中逻辑）。
   *   选中态提供持久高亮，闪烁动画（.locate-flash）提供一次性视觉强调。
   */
  private _locateEntryByName(side: 'local' | 'remote', name: string): boolean {
    if (side === 'local') {
      const list = this.getFilteredLocalEntries()
      if (!list || !list.length) return false
      const entry = list.find(e => e.name === name)
      if (!entry) return false
      if (this.selectedRemote.length) this.selectedRemote = []
      this.selectedLocal = [entry]
      this.localLastSelectedIndex = list.indexOf(entry)
      this._arrowNavPane = 'local'
      this.syncPaneSelectionVisual('local')
      this._safeDetect()
      this._flashLocate('local', entry)
      return true
    }
    const list = this.getFilteredRemoteEntries()
    if (!list || !list.length) return false
    const entry = list.find(e => e.name === name)
    if (!entry) return false
    if (this.selectedLocal.length) this.selectedLocal = []
    this.selectedRemote = [entry]
    this.remoteLastSelectedIndex = list.indexOf(entry)
    this._arrowNavPane = 'remote'
    this.syncPaneSelectionVisual('remote')
    this._safeDetect()
    this._flashLocate('remote', entry)
    return true
  }

  /** 触发一次定位闪烁：先清后设，确保动画在重复定位同一文件时也能重放。
      滚动放到 rAF 里——地址栏刚切到父目录，列表需等下一帧 CD 才渲染出新行，同步滚会扑空。 */
  private _flashLocate(side: 'local' | 'remote', entry: { fullPath?: string }): void {
    const prop = side === 'local' ? 'localLocatedPath' : 'remoteLocatedPath'
    this[prop] = null
    this._safeDetect()
    requestAnimationFrame(() => {
      if (!this._isAlive) return
      this[prop] = entry.fullPath ?? null
      this._safeDetect()
      // 此刻新目录列表已渲染，再滚动居中
      this._scrollEntryIntoView(side, entry, 'center')
      if (this._locateFlashTimer) clearTimeout(this._locateFlashTimer)
      this._locateFlashTimer = setTimeout(() => {
        this[prop] = null
        this._safeDetect()
        this._locateFlashTimer = null
      }, 1300)
    })
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
  private _consumePanePointerHotkey(side: 'local' | 'remote' | 'rl', event: MouseEvent | WheelEvent): boolean {
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
  private _runPanePointerHotkey(action: PanelHotkeyAction, side: 'local' | 'remote' | 'rl'): void {
    // ★ 2026-10-19 P1：指针路径的 'remote' 是**几何语义**（右栏），而右栏可切本地端点。
    //   框选（panel-rubber-band）正是靠这层几何语义 + 宿主 getRightPaneSelection 抽象来
    //   路由到 rl 槽位的，故 HTML 侧仍传 'remote'、不改动它；这里统一归一化到真实数据槽，
    //   否则中键热键（后退/前进/刷新/删除/重命名）会打到陈旧的远程槽位。
    side = this._pointerSideToPane(side)
    switch (action) {
      case 'up':
        if (side === 'local') this.localUp()
        else if (side === 'rl') this._rlUp()
        else this.remoteUp()
        return
      case 'back':
        if (side === 'local') this.localBack()
        else if (side === 'rl') this._rlBack()
        else this.remoteBack()
        return
      case 'forward':
        if (side === 'local') this.localForward()
        else if (side === 'rl') this._rlForward()
        else this.remoteForward()
        return
      case 'refresh':
        if (side === 'local') void this.refreshLocal()
        else if (side === 'rl') void this._rlRefresh()
        else void this.refreshRemote()
        return
      case 'delete': {
        // ★ 2026-10-19 P1：三值槽位（rl 命中 _rlSelected，不再误删陈旧远程选中集）
        const sel = this._paneSelection(side)
        if (!sel.length) return
        // 指针路径没有 Shift 语义（指针 spec 里的 Shift 是匹配用的修饰键，不是「永久删除」）：
        // 一律走回收站，永久删除仍只由 Shift+键盘触发
        this._paneDelete(side, false)
        return
      }
      case 'rename': {
        const sel = this._paneSelection(side)
        if (sel.length !== 1) return
        if (side === 'rl') { this.contextMenuPane = 'rl'; this.ctxRename() }
        else if (side === 'local') this.localRename()
        else this.remoteRename()
        return
      }
      default: {
        // 右键菜单类动作（上传/下载/打开/查看/编辑/新建/属性/复制路径）：判定沿用键盘路径的 _contextHotkeyReady
        const a = action as PanelHotkeyAction
        if (!CONTEXT_ACTION_HOTKEYS.includes(a)) return
        const pane: 'local' | 'remote' | 'rl' =
          (a === 'upload' || a === 'openLocal') ? 'local'
            : a === 'download' ? 'remote'
              : side
        if (!this._contextHotkeyReady(a, pane)) return
        this.contextMenuPane = pane
        if (SftpFloatingPanel._CTX_HOTKEYS_NEED_ENTRY.has(a)) {
          const sel = this._paneSelection(pane)
          this.contextMenuEntry = (sel[0] as any) ?? null
        }
        this.onContextMenuAction(a as ContextMenuAction)
        return
      }
    }
  }

  /** 文件列表上的滚轮：先让指针热键认领（命中则吞掉滚动），未命中保持原生滚动 */
  onPaneWheel(event: WheelEvent, pane: 'local' | 'remote' | 'rl'): void {
    this._consumePanePointerHotkey(pane, event)
  }

  /**
   * ★ 2026-10-19 P1：指针事件侧（几何语义：左栏/右栏）→ 真实数据槽。
   * 右栏为本地端点（rl）时右栏的 'remote' 一律映射为 'rl'，避免热键打到陈旧的远程槽位。
   */
  private _pointerSideToPane(side: 'local' | 'remote' | 'rl'): 'local' | 'remote' | 'rl' {
    if (side !== 'remote') return side
    return this._rightKind === 'local' ? 'rl' : 'remote'
  }

  // ========== 框选（委托 panel/panel-rubber-band） ==========
  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._rubberBand.onPaneListClick(event, pane)
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote' | 'rl'): void {
    this._commitAllPathInputs()
    // ★ 2026-09-29：指针类热键（中键）优先认领——命中则吞掉，不再进入框选起手逻辑
    if (this._consumePanePointerHotkey(pane, event)) return
    // 框选（rubber-band）仍是「左/右栏」几何语义（'remote' = 右栏），其内部靠宿主的
    // getRightPaneSelection/setRightPaneSelection 抽象再落到 rl 槽位 ⇒ 先归一再传入。
    this._rubberBand.onPaneMouseDown(event, pane === 'rl' ? 'remote' : pane)
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
    this._applyPaneSplitCore()
    // ★ 2026-10-23（Deepseek-V4.1-Flash）：**布局应用之后**再把常驻的书签弹层重锚一次。
    //   原先只在 window.resize 里 clamp，漏了两条路径（用户实测截图）：
    //   ①拖左右分栏 —— 只改 pane 宽度，`.sftp-body` 尺寸不变 ⇒ ResizeObserver 不触发；
    //   ②窄窗横排→竖排切换 —— resize 里先 clamp 再换布局 ⇒ 用的是旧 pane 几何。
    //   放在这里（单一口子）两条路径一起覆盖：分栏拖动、最大化/还原、设置页改布局都走本方法。
    this._resyncBookmarkPopupsOnLayout()
  }

  private _applyPaneSplitCore(): void {
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
      // ★ 2026-10-13 P2 修复：_paneSet 只写内存，落盘靠 ngOnDestroy/beforeunload——
      //   后者是异步 IPC，直接关 Tabby 窗口必丢。用户可见设置变更必须紧跟 flush。
      try { this._paneFlush() } catch {}
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
      // ★ 2026-10-13 P2 修复：同上——重置也是用户可见变更，紧跟 flush 防直接关窗丢失
      this._paneFlush()
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
  // ★ 2026-10-19 反馈③：rl（右栏本地端点）复用 remote-pane 视觉类，但其选中集是独立的 _rlSelectedPaths，
  //   故须用 .pane-list.rl-pane 精确选择器，避免与真正的 remote-pane（如左栏远程）互相串色。
  syncPaneSelectionVisual(pane: 'local' | 'remote' | 'rl'): void {
    const sel = pane === 'rl' ? '.pane-list.rl-pane' : `.pane-list.${pane}-pane`
    const listEl = this.elRef.nativeElement.querySelector(sel) as HTMLElement | null
    if (!listEl) return
    const paths = pane === 'local'
      ? this._localSelectedPaths
      : pane === 'rl'
        ? this._rlSelectedPaths
        : this._remoteSelectedPaths
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
    // ★ 2026-10-09 框选回归修复（根因，务必保留此守卫）：
    //   框选拖拽结束后，浏览器会在松手位置派发一次 click。
    //   本方法走的是 **click** 路径，若不拦，computeSelection 的「无 shift ⇒ 单选」
    //   分支会返回 [entry]，把框选选中的 N 条**替换成 1 条**（用户看到「框选没生效」）。
    //   原实现只在 _onPaneClick 里做了抑制（shouldSuppressEntryClick），但本方法
    //   还有别的调用方（如 _openOnClick === 'single' 分支直接调它，绕过 _onPaneClick），
    //   守卫覆盖不全 ⇒ 框选后必被 click 覆盖。
    //   根治：守卫下沉到**选择入口本身**，所有调用路径（click / single 打开 /
    //   拖拽后 click / 程序化）统一受保护，不再依赖调用方记得转发。
    if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
    // ★ 2026-10-09 审计根治：原写 `if (this.selectedRemote.length > 0) this.selectedRemote = []`
    //   —— 只清了对侧的**选中集**，没清 `remoteLastSelectedIndex`（Shift 连选的锚点）。
    //   而 computeSelection 的 Shift 分支正是用 lastIndex 算区间
    //   ⇒ 「远程点第 5 行 → 本地点某行 → 回远程 Shift+点第 2 行」会从陈旧的第 5 行起算，
    //     选中错误的行（状态栏显示 0 项已选，用户以为没选上）。
    //   根治：改用 _dropSelection（既有正确实现，同时清选中集 + 锚点 + 方向键焦点），
    //   不再自己手写半清理 —— 本类已有多处同类半清理，统一走它才不会再次漏项。
    if (this.selectedRemote.length > 0) this._dropSelection('remote')
    // ★ 2026-10-13 P1 修复：分组模式下 Shift 区间按**显示序**算（DOM 序 = 分组桶序），
    //   不再按扁平排序序切片——否则选中的是「排序序上相邻」而非「屏幕上相邻」的一批
    const displayOrder = this._displayEntryOrder('local')
    const r = computeSelection(this.selectedLocal, entry, event, idx, this.localLastSelectedIndex, this.getFilteredLocalEntries(), this._localSelectedPaths, displayOrder)
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
    side: 'local' | 'remote' | 'rl',
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
    side: 'local' | 'remote' | 'rl',
    attr: 'data-path' | 'data-group-key',
    value: string,
    align: 'nearest' | 'center' = 'nearest',
  ): void {
    try {
      // ★ 2026-10-19 续七：rl 复用 remote-pane 视觉类，必须走 .rl-pane 精确选择器防串栏
      const sel = side === 'rl' ? '.pane-list.rl-pane' : `.pane-list.${side}-pane`
      const listEl = this.elRef.nativeElement.querySelector(sel) as HTMLElement | null
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
  /**
   * ★ 2026-10-13 P1 修复：分组模式下的**显示序** fullPath 序列（鼠标 Shift+点击区间用）。
   *
   * 复用键盘导航的 _navRows 缓存（它就是显示序）：entry 行按序取 key，分组头行不计入
   * （鼠标 Shift 选的是条目，不整组选）。扁平模式（无分组行）返回 null，调用方走
   * 原来的扁平切片路径（显示序 === 排序序，行为不变）。
   */
  private _displayEntryOrder(side: 'local' | 'remote' | 'rl'): string[] | null {
    // ★ 2026-10-19 P2-10：三值化 —— rl（右栏本地端点）此前不在参数类型里，
    //   而键入定位在 rl 分支也要按显示序循环（右栏同样是分组视图）。
    //   rl 没有方向键导航缓存（_navCacheFor 只服务两侧），直接由 rl 分组行取条目序。
    if (side === 'rl') {
      const rows = this.getRlGroupRows()
      if (!rows || !rows.length) return null
      const out: string[] = []
      for (const r of rows) {
        if (r.kind !== 'header' && r.entry) out.push(r.entry.fullPath as string)
      }
      return out.length ? out : null
    }
    const rows = side === 'local' ? this.getLocalGroupRows() : this.getRemoteGroupRows()
    if (!rows || !rows.length) return null
    return this._navCacheFor(side).out.filter(r => r.kind === 'entry').map(r => r.key)
  }

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
   * ★ 2026-10-19 P2-16：方向键「会不会真的移动焦点」的只读预判。
   *
   * 冒泡阶段的 `_handlePanelWindowHotkey` 明确写着「仅在真的发生移动时消费按键
   * （已在列表端点则把按键留给宿主）」，但捕获阶段的 `_eventWouldConsumePanelHotkey`
   * 只要 `_arrowNavPane` 非空就**无条件认领** ⇒ 端点处的方向键被 preventDefault +
   * stopImmediatePropagation 吞掉，宿主（列表原生滚动 / 终端）永远收不到 —— 与本类
   * 自己的意图相悖。本方法把同一判据搬到捕获阶段，只有真的会移动才认领。
   *
   * ⚠ 焦点定位与端点计算必须与 `_handleArrowNav` **保持一致**（那里是权威实现），
   *   改动时两处同步：回退顺序 = 记录焦点 → 选中集首项 → 记录锚点 → 端点。
   */
  private _arrowNavWouldMove(side: 'local' | 'remote' | 'rl', down: boolean): boolean {
    // rl（右栏本地端点）暂不支持方向键导航（_handleArrowNav 对它直接返回 false）⇒ 不认领
    if (side === 'rl') return false
    const cache = this._navCacheFor(side)
    const nav = cache.out
    if (!nav.length) return false
    const prevPaths = side === 'local' ? this._localSelectedPaths : this._remoteSelectedPaths
    const prevFocus = side === 'local' ? this._localNavFocusKey : this._remoteNavFocusKey
    const prevAnchor = side === 'local' ? this._localNavAnchorKey : this._remoteNavAnchorKey
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
    return newIdx >= 0 && newIdx !== focusIdx
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
  private _handleArrowNav(side: 'local' | 'remote' | 'rl', down: boolean, extend: boolean): boolean {
    // ★ 2026-10-19 P1：rl（右栏本地端点）暂不支持方向键导航（导航缓存/游标/滚动均为两侧设计）。
    //   此前 rl 点击会把 _arrowNavPane 留在 'remote' ⇒ 方向键改写的是**看不见的远程选中集**
    //   （配合 Delete 就是误删幽灵条目）。现在 rl 点击置 'rl'，这里直接不认领 ⇒ 按键交还宿主。
    if (side === 'rl') return false
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
    // ★ 2026-10-19 P2-11：焦点停在**分组头**行时原先记 `null`，而 null 是「无锚点」语义 ——
    //   之后再用鼠标 Shift+点击时 computeSelection 只在 `lastIndex !== null` 时走范围分支，
    //   于是连选退化成单选（用户现象：方向键选过分组头后 Shift 选不了一段）。
    //   这里退而用「本组首个条目」在排序序中的下标做锚点（分组头行的 listIndex 恒为 -1）。
    let focusListIdx: number | null =
      focusRow.kind === 'entry' && focusRow.listIndex >= 0 ? focusRow.listIndex : null
    if (focusListIdx === null) {
      const firstPath = focusRow.entries?.[0]?.fullPath as string | undefined
      if (firstPath) {
        const i = (cache.src as any[]).findIndex((e: any) => e?.fullPath === firstPath)
        if (i >= 0) focusListIdx = i
      }
    }
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
    // ★ 2026-10-09 框选回归修复：同 selectLocal —— 守卫必须下沉到选择入口本身，
    //   否则框选后的 click 会用单选语义覆盖框选结果（远程侧同理）。
    if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
    // ★ 2026-10-09：同 selectLocal —— 必须连对侧锚点一起清，复用 _dropSelection
    if (this.selectedLocal.length > 0) this._dropSelection('local')
    // ★ 2026-10-13 P1 修复：分组模式下 Shift 区间按**显示序**算（同 selectLocal）
    const displayOrder = this._displayEntryOrder('remote')
    const r = computeSelection(this.selectedRemote, entry, event, idx, this.remoteLastSelectedIndex, this.getFilteredRemoteEntries(), this._remoteSelectedPaths, displayOrder)
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
    // ★ 2026-10-19 P1（audit）：排序/过滤/隐藏文件切换会让列表下标重排，旧的
    //   lastSelectedIndex 与方向键锚点指向的已不是同一条目 ⇒ 必须一并失效。
    this._resetSelectionIndex('local')
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
    this._resetSelectionIndex('remote')
    this._invalidateRemoteCache()
    try {
      this._paneSet('sftp-plus-remote-sort', { by: r.by, asc: r.asc })
      this._paneFlush()
    } catch {}
  }

  // ========== 过滤 ==========

  private _applyFilter(side: 'local' | 'remote' | 'rl'): void {
    if (side === 'rl') { this._rlFilter = this._rlFilterPending; this._rlFilterVisible = false; this._resetSelectionIndex('rl'); this._rlInvalidateCache(); return }
    // ★ 2026-10-19 P1（audit）：过滤改变可见集合 ⇒ Shift 连选锚点/下标一并失效
    if (side === 'local') { this.localFilter = this.localFilterPending; this.localFilterVisible = false; this._resetSelectionIndex('local'); this._invalidateLocalCache() }
    else { this.remoteFilter = this.remoteFilterPending; this.remoteFilterVisible = false; this._resetSelectionIndex('remote'); this._invalidateRemoteCache() }
  }

  private _clearFilter(side: 'local' | 'remote' | 'rl'): void {
    if (side === 'rl') { this._rlFilterPending = ''; this._rlFilter = ''; this._rlFilterVisible = false; this._resetSelectionIndex('rl'); this._rlInvalidateCache(); return }
    if (side === 'local') { this.localFilterPending = ''; this.localFilter = ''; this.localFilterVisible = false; this._resetSelectionIndex('local'); this._invalidateLocalCache() }
    else { this.remoteFilterPending = ''; this.remoteFilter = ''; this.remoteFilterVisible = false; this._resetSelectionIndex('remote'); this._invalidateRemoteCache() }
  }

  /** 应用本地过滤（pending → actual）并隐藏输入框 */
  applyLocalFilter(): void { this._applyFilter('local') }

  /** 清空本地过滤并隐藏输入框 */
  clearLocalFilter(): void { this._clearFilter('local') }

  /** 应用远程过滤（pending → actual）并隐藏输入框 */
  applyRemoteFilter(): void { this._applyFilter('remote') }

  /** 清空远程过滤并隐藏输入框 */
  clearRemoteFilter(): void { this._clearFilter('remote') }

  /**
   * ★ 2026-10-19 P1（audit）：列表**顺序/可见集合**发生变化时调用（排序、过滤、隐藏文件开关）。
   *
   * 成因：`computeSelection` 的 Shift 区间是按**下标**算的，而 lastSelectedIndex / 方向键锚点
   *   记录的是变更前的下标。变更后再 Shift+点击 ⇒ 用陈旧下标到新列表取锚点条目 ⇒
   *   选中「排序后占据该下标的陌生条目」到点击项之间的整个区间；紧接着 Delete/上传即作用于
   *   非预期集合（全文唯一能直接引出误删的路径）。此处统一失效，代价只是下次连选从头起算。
   */
  private _resetSelectionIndex(side: 'local' | 'remote' | 'rl'): void {
    if (side === 'local') this.localLastSelectedIndex = null
    else if (side === 'rl') this._rlLastSelectedIndex = null
    else this.remoteLastSelectedIndex = null
    if (side !== 'rl') this._resetNavFocus(side)
  }

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
    // ★ 2026-10-09 框选回归修复：此处的 shouldSuppressEntryClick 守卫已**移除**，
    //   改由 selectLocal / selectRemote **入口自己**负责（全项目仅此两处守）。
    //
    //   为什么必须只有一处：shouldSuppressEntryClick 有副作用（命中即 clearClickSuppress），
    //   若本函数与入口各守一次 —— 第一次把 _rbSuppressClickPath 清空、第二次返回 false
    //   ⇒ 守卫等于没加，框选结果照样被 click 的单选语义覆盖。
    //
    //   为什么守在入口更对：selectLocal 还有**绕过本函数**的调用方
    //   （_openOnClick === 'single' 分支直接调它），只守本函数必然漏。
    //   单一职责原则：谁改选中集，谁负责框选 click 抑制。
    //
    //   注意 activePane / _arrowNavPane 的赋值要留在守卫**之外**：
    //   它们表示「用户点了哪个面板」，与选中是否被抑制无关（面板级状态应照常更新）。
    this.activePane = side
    this._arrowNavPane = side
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

  /** ★ 2026-10-08：查看/编辑器长行是否自动换行（默认 false = 横向滚动查看完整内容） */
  get showTextWordWrap(): boolean {
    return this.configService?.store?.['tabby-sftp-plus']?.showTextWordWrap === true
  }

  /** ★ 2026-10-08：对话框内的「自动换行」开关变更 → 写配置并落盘。
   *  写的是顶层叶子（与 cycleLayoutMode 同路：读出的嵌套对象是 ConfigProxy，
   *  只在叶子上赋值才生效）；落盘后广播 sftp-plus-settings-changed 让其它面板/设置页同步。 */
  onTextViewWordWrapChange(value: boolean): void {
    this._saveTextViewPref('showTextWordWrap', value)
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：弹层 footer 的排序切换。
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：改为三档循环 manual → usage → name → manual。
   *   写 config 并落盘（与 _saveTextViewPref 同一套：configService.store 直接赋值 + save），
   *   再广播 settings-changed 让其它已开面板同步；本面板立即改内存值。
   *   注意不能只改内存 —— 否则关掉面板重开又回到旧排序（用户会认为开关没生效）。
   */
  toggleBookmarkSortMode(): void {
    const order: BookmarkSortMode[] = ['manual', 'usage', 'name']
    const idx = order.indexOf(this.bookmarkSortMode)
    const next = order[(idx + 1) % order.length]
    this.bookmarkSortMode = next
    try {
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：走插件统一配置服务（set + flush 真正落盘）；
      //   仅在没有 sftpConfig 时才退回直接写 store，避免「内存改了、config.yaml 没写」。
      if (this.sftpConfig) {
        this.sftpConfig.setAndFlush('bookmarkSortMode', next)
      } else {
        const target = this.configService?.store?.['tabby-sftp-plus']
        if (target) { target.bookmarkSortMode = next; this.configService?.save() }
      }
    } catch (e) {
      log.warn('[SFTP+] save bookmarkSortMode failed:', e)
    }
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch { /* ignore */ }
    this.cdr.markForCheck()
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：书签弹层 footer 的图钉「面板常驻」。
   *   与设置页「选中书签后关闭书签面板」写**同一份配置** `closeBookmarkPanelOnSelect`，
   *   只是语义相反：图钉钉住 = 选中后**不**关闭 = 配置项 false。
   *   落盘/广播写法照搬 `toggleBookmarkSortMode`：本面板当场生效 + setAndFlush 真正落盘 +
   *   广播让设置页与其它已开面板同步（只改内存会在重开面板后回到旧值）。
   *   ⛔ 设置页那边必须回读本项（见 sftp-settings 的 `_settingsChangedHandler`），否则设置页
   *     内存里的旧值会在它下次 _saveToConfig() 时把这里的改动覆盖回去（P2-31 同源）。
   */
  toggleBookmarkPanelPinned(): void {
    const next = !this.closeBookmarkPanelOnSelect
    this.closeBookmarkPanelOnSelect = next
    try {
      if (this.sftpConfig) {
        this.sftpConfig.setAndFlush('closeBookmarkPanelOnSelect', next)
      } else {
        const target = this.configService?.store?.['tabby-sftp-plus']
        if (target) { target.closeBookmarkPanelOnSelect = next; this.configService?.save() }
      }
    } catch (e) {
      log.warn('[SFTP+] save closeBookmarkPanelOnSelect failed:', e)
    }
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch { /* ignore */ }
    this.cdr.markForCheck()
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：冲突「重命名」的命名风格，供冲突解决器（PanelConflictResolver）读取。
   *   设置页「传输」分区的「冲突重命名风格」写 `conflictRenameStyle`：seq 序号堆叠（默认）/ time 时间戳 /
   *   random 随机后缀。每次现读 config store（同步内存取值，开销可忽略）——重命名是低频动作，
   *   没必要为它维护一份缓存与失效逻辑。未知值/读失败一律回落 seq。
   */
  readConflictRenameStyle(): ConflictRenameStyle {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      return normalizeConflictRenameStyle(cfg?.conflictRenameStyle)
    } catch { return 'seq' }
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：联动书签跳转前的存在性探测（覆写控制器默认放行）。
   *   目标栏是本地 → `fs.stat`（fs/promises）判断是否目录；目标是远程 → 用该栏 SSH 会话的 stat 探测。
   *   会话不可用 / 不支持 stat 时**放行**（返回 true），交给原导航逻辑自己报错，避免误拦正常跳转。
   */
  protected async _otherPanePathExists(side: 'left' | 'right' | null, target: string): Promise<boolean> {
    const targetIsRemote = side === 'left' ? this._rightKind === 'remote' : this._leftKind === 'remote'
    if (!targetIsRemote) {
      try {
        const st: any = await fs.stat(target)
        // fs.stat 的 isDirectory 是方法；统一成「函数就调、布尔就直取」，不再假设单一形态
        return typeof st?.isDirectory === 'function' ? st.isDirectory() : true
      } catch { return false }
    }
    // ★ 2026-10-22 续三十五（Deepseek-V4.1-Flash）：探测左栏远程要用**SFTP 子通道**
    //   （_leftSftpSession 才有 stat），SSHSession 上没有 stat ⇒ 恒放行（书签联动同时受益）。
    const sess: any = side === 'left' ? this.sftpSession : (this._leftSftpSession || this._leftSshSession)
    if (!sess) return true
    // ★ 2026-10-22 续三十五（Deepseek-V4.1-Flash）：⛔ 旧实现 `st?.isDirectory ? st.isDirectory() : true`
    //   在**远程**这一侧是错的：宿主 `SFTPSession.stat()` 返回的 `isDirectory` 是**布尔**
    //   （tabby-ssh/session/sftp.ts:77 `isDirectory: stats.type === Directory`），于是「目录」命中
    //   三元真支 ⇒ 执行 `true()` ⇒ TypeError ⇒ 被 catch 成 false ⇒ **任何目录都判成对端不存在**。
    //   实证（用户机器 log.txt）：启用「同步路径」后每次跟随都打
    //   `mirror: peer has no such dir, skip: /usr/local`，而右栏明明就停在 /usr/local；
    //   书签联动跳目录同样被这条误拦。
    //   ⛔ 三层判定，缺一层都会退化成「恒 skip」或「恒放行」：
    //     ① 包装层 stat 成功 ⇒ 按**布尔** isDirectory 定论（不再当函数调用）；
    //     ② 包装层抛「明确不存在」⇒ 笃定返回 false（书签 bookmark.linkMissing 提示靠它）；
    //     ③ 其余情况（会话抖动 / 接口不支持）走 statRemotePath 回退，**仍拿不到结论就放行**。
    if (typeof sess.stat === 'function') {
      try {
        const st: any = await sess.stat(target)
        if (st) return st.isDirectory !== false
      } catch (e) {
        if (this._isMissingPathError(e)) return false
      }
    }
    const st: any = await statRemotePath(sess as SFTPSessionLike, target).catch(() => null)
    if (!st) return true
    return st.isDirectory !== false
  }

  /**
   * ★ 2026-10-22 续三十五（Deepseek-V4.1-Flash）：remote stat 的「路径确实不存在」判定。
   *   russh 的 SFTP 错误码 2 = NoSuchFile；包装层可能把它包成 message 文案，故两条都认。
   *   只在这里用于「可以笃定不存在」，其余错误一律当「探测不可用」处理。
   */
  private _isMissingPathError(e: unknown): boolean {
    const code = (e as { code?: unknown })?.code ?? (e as { errno?: unknown })?.errno
    if (code === 2 || code === 'ENOENT' || code === 'ENOTDIR') return true
    const msg = String((e as { message?: unknown })?.message ?? e ?? '')
    return /no such file|nosuchfile|not found|does not exist/i.test(msg)
  }

  /** ★ 2026-10-08：对话框内的「显示行号」开关变更 → 写配置并落盘（同上） */
  onTextViewLineNumbersChange(value: boolean): void {
    this._saveTextViewPref('showTextLineNumbers', value)
  }

  private _saveTextViewPref(key: 'showTextWordWrap' | 'showTextLineNumbers', value: boolean): void {
    try {
      const target = this.configService?.store?.['tabby-sftp-plus']
      if (target) { target[key] = value; this.configService?.save() }
    } catch (e) {
      log.warn('[SFTP+] save ' + key + ' failed:', e)
    }
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch { /* ignore */ }
    this.cdr.markForCheck()
  }

  /** 查看器自绘插入光标形状（block/beam/underline，默认 beam）；编辑器为系统原生光标，不受此项影响 */
  get textCaretShape(): CaretShape {
    return normalizeCaretShape(this.configService?.store?.['tabby-sftp-plus']?.textCaretShape)
  }

  /**
   * ★ 2026-10-16：键入定位（在文件列表中敲字母/数字按文件名前缀跳转选中）是否启用。
   *   设置页「其它 → 交互」有开关，默认开。
   *   **读取走 getter 直读配置叶子**（与 showTextLineNumbers 同路）：键入是逐键高频路径，
   *   不需要也不应该额外做一次「设置变更 → 同步到字段」的缓存，永远取最新值最省心。
   */
  get typeAheadEnabled(): boolean {
    return this.configService?.store?.['tabby-sftp-plus']?.typeAheadEnabled !== false
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

  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 A 开关 —— 读取「外部编辑自动上传」配置项（默认 false） */
  protected _getEditorAutoUpload(): boolean {
    return this.configService?.store?.['tabby-sftp-plus']?.editorAutoUploadExternal === true
  }

  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：方案 C 命名空间 —— 返回编辑所属连接的 user@host 标识 */
  protected _getEditorConnectionLabel(isLeft: boolean): string {
    return isLeft ? (this._leftHostLabel || '') : (this.hostInfo || '')
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
    if (!isDir && (entry?.isSymlink || isSymlinkByMode(entry?.mode))) {
      // ★ 2026-10-18 issue #27：symlink→目录解析按归属栏会话（左栏远程=第二会话）
      if (pane === 'remote') {
        isDir = await this._resolveRemoteSymlinkIsDir(entry.fullPath)
      } else if (pane === 'local' && this._leftKind === 'remote') {
        isDir = await this._resolveRemoteSymlinkIsDir(entry.fullPath, this._leftSftpSession)
      }
    }
    if (isDir) {
      if (pane === 'local') this.openLocal(entry, event)
      else void this.openRemote(entry, event)
      return
    }
    const openInSystem = !!(event && (os.platform() === 'darwin' ? event.metaKey : event.ctrlKey))
    // ★ 2026-10-18 issue #27：左栏远程端点的文件 → 与右栏远程**同一套**查看/系统打开流程
    //   （第二会话承载；viewerSystemPath 落 temp 值，「在系统中打开」按钮随之出现）。
    //   原实现直接 toast「暂不支持」拒绝（P0 占位，M2 接管即本改动）。
    if (pane === 'local' && this._leftKind === 'remote') {
      if (!this._leftSftpSession) return
      if (openInSystem || (this._openUnsupportedInSystem && !isViewableRemoteFileType(
        entry.name,
        this.getCustomEditableExtensions(),
        this.getAllowViewEditAllFiles(),
      ))) {
        void this._openRemoteInSystem(entry, this._leftSftpSession)
        return
      }
      void this._viewRemoteFile(entry, this._leftSftpSession)
      return
    }
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
      // ★ 2026-10-13 P1 修复：框选松手后浏览器会在落点派发 click。此前 single 分支绕过
      //   _onPaneClick 的统一收口——selectLocal 里的抑制守卫命中时提前 return（状态被
      //   消费掉），_activateEntry 却**无条件**执行 ⇒ 框选落在文件行上即误开查看器、
      //   落在目录行即误入目录。抑制判定前置：命中则整个点击作废（守卫只此一处调用，
      //   未命中时 selectLocal 内部的二次调用恒为 false，无重复消费问题）。
      if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
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
   * 修改人：DD1024z + Hy3
   * 修改时间：2026-10-18 — session 参数化：左栏远程端点用第二会话解析 symlink
   */
  private async _resolveRemoteSymlinkIsDir(fullPath: string, session?: any): Promise<boolean> {
    const sftp = session ?? this.sftpSession
    if (!sftp) return false
    const st = await resolveRemoteSymlinkStat(sftp, fullPath)
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
      // ★ 2026-10-13 P1 修复：同 onLocalClick——框选松手的落点 click 不得触发激活
      if (this._rubberBand.shouldSuppressEntryClick(entry.fullPath)) return
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

  /**
   * 「显示隐藏文件」开关的统一入口（工具栏 / 右键菜单共用）。
   * ★ 2026-10-19 P1（audit）：开关改变的是**可见集合**，条目下标随之重排 ⇒
   *   Shift 连选的锚点下标必须一并失效（原因与 setLocalSort 处一致，见 _resetSelectionIndex）。
   */
  private _toggleHidden(pane: 'local' | 'remote' | 'rl'): void {
    this._resetSelectionIndex(pane)
    this.toggleShowHidden(pane)
  }

  onLocalPaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this.localBack(); break
      case 'forward': this.localForward(); break
      case 'up': this.localUp(); break
      case 'home': this.goLocalHome(); break
      case 'refresh': void this.refreshLocal(); break
      case 'toggleFilter': this.localFilterVisible = !this.localFilterVisible; break
      case 'toggleHidden': this._toggleHidden('local'); break
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
      case 'toggleHidden': this._toggleHidden('remote'); break
    }
  }

  /**
   * ★ 2026-10-19 P1 修复：rl（右栏本地端点）工具栏导航处理器。此前 rl 的
   * <sftp-file-pane> **漏绑 (nav) 输出**——file-pane 的 onToolbarAction 对
   * back/forward/up/refresh/home/hidden/filter 一律 nav.emit，rl 面板没接 ⇒
   * 顶栏右段切「本地」后 7 个工具栏按钮全部静默失效，只能双击目录或地址栏回车。
   * 数据槽全部走 _rl*（与左右栏完全独立）。
   */
  onRlPaneNav(action: PaneNavAction): void {
    switch (action) {
      case 'back': this._rlBack(); break
      case 'forward': this._rlForward(); break
      case 'up': this._rlUp(); break
      case 'home': this._rlHome(); break
      case 'refresh': void this._rlRefresh(); break
      case 'toggleFilter': this._rlFilterVisible = !this._rlFilterVisible; break
      case 'toggleHidden': this._toggleHidden('rl'); break
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
      // ★ 2026-10-20：两端端点同类（本机↔本机 / 远程↔远程）——没有上/下方向
      case 'transfer': void this.ctxTransfer(); break
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
    // ★ 2026-10-19 续八：rl 的隐藏文件开关走 _rlShowHidden（独立字段），不能归到 showHiddenLocal
    if (action === 'toggleHidden' && this.contextMenuPane === 'rl') {
      this._rlShowHidden = !this._rlShowHidden
      try { localStorage.setItem(`${SftpFloatingPanel.TABLE_SETTINGS_KEY}.showHiddenRl`, JSON.stringify(this._rlShowHidden)) } catch {}
      this._rlInvalidateCache()
      this.headerMenuVisible = false
      this.headerMenuCol = null
      this._safeDetect()
      return
    }
    if (action === 'toggleHidden') { this._toggleHidden(this.contextMenuPane); return }
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
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽结束/落手时一并撤掉落点标注，避免残留高亮
    this._clearDropFolderHint()
    this._fileDnd.reset()
  }

  onEntryDragEnd(): void {
    // 拖拽结束（含拖回原位取消）：立刻中止尚未开始/进行中的预缓存下载
    this._cancelRemoteDragCache()
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽取消/结束时撤掉落点标注（源侧 dragend 也要撤，
    //   否则「拖起后又松开取消」会把某一行永久留在高亮态）
    this._clearDropFolderHint()
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
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：关掉「只投放到当前目录」时，把指针下的文件夹行标出来
    this._updateDropFolderHint(ev)
  }

  onDragEnter(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragEnter(ev, targetPane)
    this._updateDropFolderHint(ev)
  }

  onDragLeave(ev: DragEvent, targetPane: 'local' | 'remote'): void {
    this._fileDnd.onDragLeave(ev, targetPane)
    this._onDropHintLeave(ev)
  }

  onDragStartLocal(ev: DragEvent, entry: LocalEntry): void {
    // ★ 2026-10-19 P1（audit）：左栏可切到远程端点（issue #27），此时模板里这个
    //   (entryDragStart) 仍然绑本方法，但条目实质是 **SFTP 远端条目**。原实现一律产出
    //   kind='local-paths' + POSIX fullPath ⇒ 拖到右栏时被当本地磁盘路径去 stat ⇒ ENOENT
    //   全败；拖到本地 ⇒ copyIntoLocalDir 把 `/var/www` 当路径写入。
    //   这里按端点真实性分流到 remote-paths（srcPane='left'），由接收侧按远端语义处理。
    if (this._leftKind === 'remote') { this._onDragStartLeftRemote(ev, entry as unknown as SFTPFile); return }
    const src = this._resolveDragSource(ev, entry, this.selectedLocal)
    if (!src) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    const cur = path.resolve(this.localPath)
    this._fileDnd.setDragSource('local', src.every(e => path.resolve(path.dirname(e.fullPath)) === cur))
    const p: DragPayload = { kind: 'local-paths', paths: src.map(e => ({ fullPath: e.linkTarget || e.fullPath, name: e.name, isDirectory: e.isDirectory })), srcPane: 'left' }
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

  /**
   * ★ 2026-10-19 P1（audit）：左栏处于远程端点时的拖拽起手（由 onDragStartLocal 分流而来）。
   *
   * 语义与 onDragStartRemote 一致（条目是 SFTP 远端条目），差别只在 srcPane='left'，
   * 让接收方能正确判定「跨栏拖放」（左远端 → 右本地/右远端）。
   * 刻意**不设置 OS 文件数据**：本侧没有右栏那样的临时缓存，设了会拖出无效的 .url 快捷方式，
   * 所以这类拖拽只在面板内部生效（这与拖到桌面的 ENOENT 相比是明确的降级，优于静默失败）。
   */
  private _onDragStartLeftRemote(ev: DragEvent, entry: SFTPFile): void {
    const sel = this.selectedLocal as unknown as SFTPFile[]
    const src = this._resolveDragSource(ev, entry as any, sel as any) as unknown as SFTPFile[] | null
    if (!src || !src.length) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    this._fileDnd.setDragSource('remote', false)
    const p: DragPayload = {
      kind: 'remote-paths',
      paths: src.map(e => ({
        remotePath: e.fullPath,
        name: e.name,
        isDirectory: e.isDirectory,
        size: e.size,
        mode: e.mode,
        modified: (e as SFTPFile).modified?.getTime?.(),
      })),
      srcPane: 'left',
    }
    try { ev.dataTransfer?.setData('application/x-sftp-plus', JSON.stringify(p)) } catch {}
  }

  onDragStartRemote(ev: DragEvent, entry: SFTPFile): void {
    if (!this.connected) return
    const src = this._resolveDragSource(ev, entry, this.selectedRemote)
    if (!src) return
    this._setCustomDragPreview(ev, src.map(e => ({ name: e.name, isDirectory: e.isDirectory })))
    const cur = this._normRemoteDir(this.remotePath)
    this._fileDnd.setDragSource('remote', src.every(e => this._normRemoteDir(path.posix.dirname(e.fullPath)) === cur))
    log.info('[dragstart] remote modified:', src.map(e => ({ name: e.name, modified: e.modified, modifiedMs: e.modified?.getTime?.() })))
    const p: DragPayload = { kind: 'remote-paths', paths: src.map(e => ({ remotePath: e.fullPath, name: e.name, isDirectory: e.isDirectory, size: e.size, mode: e.mode, modified: e.modified?.getTime?.() })), srcPane: 'right' }
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
    this._clearDropFolderHint()
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：跨栏 / 外部拖入才受「只投放到当前目录」约束 ——
    //   同栏内拖到子文件夹是文件管理器的通用手势（复制进该目录），不归这个开关管。
    const srcPane = this._dropPayloadSrcPane(ev)
    const crossPane = !srcPane || srcPane !== (targetPane === 'local' ? 'left' : 'right')
    const destDir = this._resolveDropDestDir(ev, targetPane, crossPane)
    // ★ issue #27 P3：targetPane 与物理栏一一对应（'local'=左栏、'remote'=右栏），
    //   供跨栏同目录拖放绕过「同目录无操作」早退（右栏本地面板走 onDropRl 单独传 'right'）
    await this._fileDropRuntime.onDrop(ev, targetPane, destDir, targetPane === 'local' ? 'left' : 'right')
  }

  /** 读拖拽源栏（仅在 drop 事件里可靠：dragover 阶段浏览器对 dataTransfer 处于保护模式，读出来是空串） */
  private _dropPayloadSrcPane(ev: DragEvent): 'left' | 'right' | null {
    try {
      const raw = ev.dataTransfer?.getData('application/x-sftp-plus')
      if (!raw) return null
      const src = JSON.parse(raw)?.srcPane
      return src === 'left' || src === 'right' ? src : null
    } catch { return null }
  }

  /**
   * 拖放到文件夹行时解析落点目录；落到文件行则用其父目录。
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：`crossPane && _dropToCurrentDirOnly` 时**直接返回 undefined**
   *   （= 用该栏当前打开的目录）。成因：从 A 栏拖一个文件到 B 栏，手滑停在某个文件夹行上时，
   *   旧逻辑会把文件静默存进那个子目录 —— 列表本身毫无变化，用户以为传输失败，事后只能从
   *   传输记录的路径才看出「被吞了」。开关在设置页「传输设置 → 拖拽只投放到当前目录」，默认开。
   * @param crossPane 是否为跨栏 / 外部拖入（同栏内拖到子文件夹不受此开关约束）
   */
  private _resolveDropDestDir(ev: DragEvent, targetPane: 'local' | 'remote', crossPane = true): string | undefined {
    if (crossPane && this._dropToCurrentDirOnly) return undefined
    const el = (ev.target as HTMLElement | null)?.closest?.('[data-path]') as HTMLElement | null
    if (!el) return undefined
    const p = el.getAttribute('data-path')
    if (!p) return undefined
    const isDir = el.getAttribute('data-isdir') === '1'
    if (targetPane === 'remote') {
      return isDir ? p : path.posix.dirname(p)
    }
    // ★ 2026-10-19 P1（audit）：左栏切到远程端点时，'local' 这一侧的行 **仍是 POSIX 远端
    //   路径**，win32 的 path.dirname('/home/a/b.txt') 在 Windows 上产出 `\\home\\a`
    //   ——混合分隔符的伪本地路径，后续 stat/copy 全部失效且不报错。按端点真实性分流。
    if (this._leftKind === 'remote') {
      return isDir ? p : path.posix.dirname(p)
    }
    return isDir ? p : path.dirname(p)
  }

  /**
   * 拖拽落点提示：把指针下的文件夹行标注出来（`关闭「只投放到当前目录」` 时才有意义）。
   * 功能描述：设置页关掉「拖拽只投放到当前目录」后，拖到文件夹行上会真的存进那个文件夹 ——
   *          光靠落手后的结果看不出来，所以在拖拽期间给该行加 `.drop-into` 类 + `data-drop-hint`
   *          文案（CSS 用 `::after { content: attr(data-drop-hint) }` 画出「放入此文件夹」小标）。
   *          开关打开时落点与行无关 ⇒ 不加任何标注，否则又会让人以为「这一行是目标」。
   * 性能：dragover 每帧都触发，所以**只在目标元素变化时**动 DOM（不 detectChanges、不改绑定）。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  private _updateDropFolderHint(ev: DragEvent): void {
    if (this._dropToCurrentDirOnly) { this._clearDropFolderHint(); return }
    const row = (ev.target as HTMLElement | null)?.closest?.('[data-isdir="1"]') as HTMLElement | null
    if (row === this._dropHintEl) return
    this._clearDropFolderHint()
    if (!row) return
    this._dropHintEl = row
    row.classList.add('drop-into')
    row.setAttribute('data-drop-hint', this.i18n.t('notify.dropIntoFolder'))
  }

  /** 撤掉拖拽落点标注（行已被刷新销毁时也安全：对游离节点改类名不抛错） */
  private _clearDropFolderHint(): void {
    const el = this._dropHintEl
    if (!el) return
    this._dropHintEl = null
    el.classList.remove('drop-into')
    el.removeAttribute('data-drop-hint')
  }

  /** 离开某栏列表时撤标注（鼠标在子元素间移动会反复 dragleave，必须先判 relatedTarget 是否还在同一列表内） */
  private _onDropHintLeave(ev: DragEvent): void {
    if (!this._dropHintEl) return
    const related = ev.relatedTarget as Node | null
    const list = (ev.target as HTMLElement | null)?.closest?.('.pane-list')
    if (list && related && list.contains(related)) return
    this._clearDropFolderHint()
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
  private async _scanRemoteDir(
    remotePath: string,
    /** ★ 2026-10-20：可显式指定会话——左栏远程端点的属性框若沿用右栏主会话，扫的是**另一台机器** */
    sessionOverride?: any,
  ): Promise<{ size: number; count: number }> {
    const session = sessionOverride ?? this.sftpSession
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
    /** ★ 2026-10-19 P2-9：失败原因。目录传输此前只写 `success:false`，**从不写 failReason**，
     *  而传输日志正是靠 failReason 区分「已取消 / 已中断 / 出错」（file-utils 的文案分支），
     *  缺失 ⇒ 日志里只有干巴巴一个「失败」，用户看不出是取消、断线还是真出错。
     *  未显式传入时按 'error' 记（普通失败）；取消/中断由协调器显式传入。 */
    reason?: TransferLogEntry['failReason'],
  ): void {
    this.transfers = this.transfers.filter(x => x !== t)
    const now = Date.now()
    // ★ 兜底：总量未知（预扫描失败等 bytesTotal=0）时，完成时用实际已传字节回填日志 size
    const patch: { success: boolean; duration: number; endTime: number; pending: boolean; size?: number; failReason?: TransferLogEntry['failReason'] } =
      { success, duration: now - startTime, endTime: now, pending: false }
    if (!success) patch.failReason = reason ?? 'error'
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
      // ★ 高危#13修复：将清理逻辑原子化，只在当前cancelRef确实属于自己时才清理，
      //   避免并发任务覆盖this._cancelRef后误清理其它任务的引用
      if (this._cancelRef === cancelRef) {
        this._cancelRef = prevRef
        if (this._cancelRef && !this._cancelRef.current && !(this._cancelRef.active?.size)) this._cancelRef = null
      }
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
    session?: any,
  ): Promise<boolean> {
    // ★ 2026-10-18 issue #27：session 归属参数化——左栏远程编辑保存回传用第二会话
    if (!session && !this.sftpSession) return false
    return uploadLocalFile(this._byteTransferCtx(undefined, session), remotePath, localPath, {
      track: true,
      logOperation,
    })
  }

  /** 上传文件（不记录传输日志，文件夹内部使用）
   *  ★ 2026-10-13 P1 修复：新增 `onProgress`（本文件已上传字节）——与 _doDownloadRaw 对称。
   *    目录上传的条目进度原先只在「文件传完」时上报一次，大文件上传期间整行静止
   *    （用户看不到任何动静，只能判断成「卡死了」）。uploadLocalFile 通过
   *    UploadByteOptions.onTransfer 在创建时交出 up 引用，这里用 400ms 轮询其
   *    getCompletedBytes()；轮询在 finally 里清除；无 onProgress 时不建定时器。 */
  private async _doUploadRaw(
    remotePath: string, localPath: string,
    onProgress?: (bytes: number) => void,
  ): Promise<boolean> {
    if (!this.sftpSession) return false
    let up: LocalPathFileUpload | null = null
    const timer = onProgress
      ? setInterval(() => { if (up) onProgress(Number(up.getCompletedBytes?.()) || 0) }, 400)
      : null
    try {
      return await uploadLocalFile(this._byteTransferCtx(), remotePath, localPath, {
        exposeCancel: true,
        onTransfer: (u) => { up = u },
      })
    } finally {
      if (timer !== null) clearInterval(timer)
    }
  }

  /**
   * 功能描述：下载远程文件到本地，不检测冲突（冲突已在前置步骤处理）
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   * 修改人：DD1024z + Composer
   * 修改时间：2026-07-25 — 字节级逻辑下沉 transfer-adapters.downloadRemoteFile
   * ★ 2026-10-19（Hy3）：新增尾参 session —— 左栏远程端点 → 本机磁盘的粘贴必须用第二会话，
   *   与 _doUpload 的同名参数对称（TS 对「实参多、形参少」不报错，加参数时务必核对调用方）。
   */
  private async _doDownload(
    remotePath: string, localPath: string, mode?: number, size?: number, session?: any,
  ): Promise<boolean> {
    if (!session && !this.sftpSession) return false
    return downloadRemoteFile(this._byteTransferCtx(undefined, session), remotePath, localPath, mode, size, {
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
   *   此前直接用 this._cancelRef（=最后启动的任务）会导致登记归属错位、取消时互杀。
   * ★ 2026-10-18 issue #27：sessionOverride —— 编辑器保存回传左栏远程文件时须用第二会话。 */
  private _byteTransferCtx(taskRef?: TaskCancelRef | null, sessionOverride?: any) {
    return {
      session: sessionOverride ?? this.sftpSession!,
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
   *
   * ★ 2026-10-19 P2（保守兜底）：`this._cancelRef` 这一级回落**只在归属无歧义时才允许**。
   *   core/task-scope.ts 因 Electron 渲染进程的 V8 fatal abort 已把 AsyncLocalStorage 关闭
   *   （ALS_DISABLED=true）⇒ currentTaskScope() 恒为 undefined ⇒ 任务内创建的条目与子流
   *   只能靠 this._cancelRef 归属，而它永远指向**最后启动**的任务：并发多目录任务时，
   *   取消 A 会广播到 B 的在途子流（误杀），A 自己的子流反而没被中断。
   *   根治需要改 task-scope 的公共契约（把 ref 沿调用链显式传递），改动面与风险都超出本次，
   *   故这里只加兜底：**只有在途任务恰好一个**（_cancelRefs.size <= 1）时才回落 _cancelRef；
   *   并发时不广播（漏掉的取消由条目自身 transfer.cancel() 与循环里的 _aborted 复查兜住
   *   ——「少中断一个子流」明显轻于「误杀别的任务」）。
   */
  private _taskRefOf(entry: any): TaskCancelRef | null {
    const own = (entry?._taskCancelRef as TaskCancelRef | undefined) ?? null
    if (own) return own
    if (this._cancelRefs.size <= 1) return this._cancelRef
    log.warn('[cancel] no task scope and multiple tasks in flight: skip cancel broadcast to avoid hitting the wrong task')
    return null
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
  /**
   * @param session ★ 2026-10-20：操作所在的 SFTP 会话。左栏切远程端点时是 `_leftSftpSession`，
   *   不传则沿用右栏主会话（经典布局）。
   */
  openPermDialog(entry: SFTPFile, session?: any): void {
    const sess = session ?? this.sftpSession
    // ★ 2026-09-20：mode 缺失时 undefined&0o777===0，确认会 chmod 000；先拒绝或补 stat
    const rawMode = entry.mode
    if (rawMode == null || !Number.isFinite(Number(rawMode))) {
      if (sess && typeof (sess as any).stat === 'function') {
        void (sess as any).stat(entry.fullPath).then((st: any) => {
          const m = Number(st?.mode ?? st?.attrs?.permissions ?? st?.attrs?.mode)
          if (!Number.isFinite(m)) {
            this.showToast(this.i18n.t('perm.modeUnknown') || '无法读取权限，已取消')
            return
          }
          this.openPermDialog({ ...entry, mode: m }, session)
        }).catch(() => {
          this.showToast(this.i18n.t('perm.modeUnknown') || '无法读取权限，已取消')
        })
        return
      }
      this.showToast(this.i18n.t('perm.modeUnknown') || '无法读取权限，已取消')
      return
    }
    this._permSessionOverride = session ?? null
    this.permTargetPath = entry.fullPath
    this.permTargetName = entry.name
    // ★ 2026-10-16：头部图标与「文件属性」用同一套解析，保证同一对象在两个对话框里长得一样
    this.permTargetIsDir = !!entry.isDirectory
    this.permTargetIcon = this.resolveDetailsIcon(entry)
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
    // ★ 2026-10-20：会话按打开对话框的那一栏取（左栏远程端点走第二会话），不能用主会话兜底
    const sess = this._permSessionOverride ?? this.sftpSession
    if (!this.permTargetPath || !sess) return
    const m = parseInt(this.permModePreview, 8)
    sess.chmod(this.permTargetPath, m)
      .then(() => this._refreshPanesOfFs(false))
      .catch(e => {
        log.error('chmod failed', e)
        this.showToast(this.i18n.t('permission.chmodFailed') || '权限修改失败', 3000)
      })
    this.showPermDialog = false
    this.permTargetPath = ''
    this.permTargetIcon = null
    this._permSessionOverride = null
  }

  cancelPermDialog(): void {
    this.showPermDialog = false
    this.permTargetPath = ''
    this.permTargetIcon = null
    this._permSessionOverride = null
  }

  /** 检查远程目录下是否已有同名条目（新建/上传冲突检测）；用 stat 准确判断文件/目录类型 */
  private async _remoteEntryExists(parentPath: string, name: string, session?: any): Promise<{ exists: boolean; isDirectory: boolean }> {
    const sess = session || this.sftpSession
    if (!sess) return { exists: false, isDirectory: false }
    const fullPath = path.posix.join(parentPath, name)
    // 优先用 stat 准确判断（readdir 的 isDirectory 字段不一定可靠）
    if (sess.stat) {
      try {
        const st = await sess.stat(fullPath)
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
      const entries = await sess.readdir(parentPath)
      const found = entries.find((e: any) => e.name === name)
      if (!found) return { exists: false, isDirectory: false }
      return { exists: true, isDirectory: !!found.isDirectory }
    } catch { return { exists: false, isDirectory: false } }
  }

  // ========== 文件操作 ==========
  // ★ 2026-10-19（Hy3）：刷新目标侧必须在**打开对话框时**显式指定。此前只有 rl/左栏远程
  //   两个入口设置了 `_inputRefreshSide`，左栏本地的这三个入口沿用旧值（默认 'remote'）
  //   ⇒ 左栏新建/重命名成功后刷的是**右栏远程**，左栏自己保持陈旧。
  localNewFolder(): void { this._inputRefreshSide = 'local'; this.openInputDialog('local-mkdir', this.i18n.t('app.newFolder'), '', '', this.localPath) }
  localNewFile(): void { this._inputRefreshSide = 'local'; this.openInputDialog('local-touch', this.i18n.t('app.newFile'), '', '', this.localPath) }
  localRename(): void {
    if (this.selectedLocal.length !== 1) return
    // ★ 2026-10-19（Hy3）：左栏切到远程端点后，选中项仍存在 selectedLocal 里，F2 会直接走到
    //   本方法 ⇒ 拿 POSIX 路径去做本地 fs.rename（必失败）。与右键菜单对齐，改走第二会话。
    if (this._leftKind === 'remote') {
      this._leftRemoteDialog('remote-rename', this.i18n.t('app.rename'), this.selectedLocal[0].name, this.selectedLocal[0].fullPath)
      return
    }
    this._inputRefreshSide = 'local'
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
    // ★ 2026-10-09：IME 组合态一律不接管（与 _shieldTerminalClipboardKeys 同一理由）。
    //   本函数是「捕获阶段抢先消费」，比后者更早，若不拦，输入法组字时按 Delete/F5 等
    //   面板热键会把按键从 IME 手里抢走，导致候选词无法上屏。
    if (event.isComposing || (event as unknown as { keyCode?: number }).keyCode === 229) return
    if (!this._isPanelDomFocused() && !this._ownsHotkeysApply()) return
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
  private _resolveContextHotkeyPane(a: PanelHotkeyAction): 'local' | 'remote' | 'rl' {
    if (a === 'upload' || a === 'openLocal') return 'local'
    if (a === 'download') return 'remote'
    return this._resolveTargetPane()
  }

  /**
   * ★ 2026-09-20：判断某右键菜单热键当前是否可执行（有选中 / 打开仅本地单选 / 查看编辑需文件可看可编）
   * ★ 2026-10-19 P1：支持 rl 端点（选中集统一走 _paneSelection，下载类动作按端点可达性判定）
   */
  private _contextHotkeyReady(a: PanelHotkeyAction, pane: 'local' | 'remote' | 'rl'): boolean {
    if (a === 'upload') return this.selectedLocal.length > 0
    // ★ 2026-10-19 P1：右栏切本地端点时远程面板不存在 ⇒ 下载不可用（防陈旧 remote 槽位幽灵下载）。
    //   selectedRemote 在 _switchRightToLocal 时已被清空，此处再判一次属双保险。
    if (a === 'download') return this._rightKind !== 'local' && this.selectedRemote.length > 0
    if (a === 'newFolder' || a === 'newFile') return true
    const sel = this._paneSelection(pane)
    if (a === 'details' || a === 'copyPath') return sel.length > 0
    if (a === 'openLocal') return (pane === 'local' || pane === 'rl') && sel.length === 1
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
    // ★ 2026-10-16 修复（用户报障：「选中文件后按字母/数字键定位文件名失败」）：
    //   **键入定位也必须由捕获阶段认领**。
    //
    //   根因是路径不对称：方向键 / Delete / F2 / F5 等都由**本函数**在 window 捕获阶段认领
    //   （见 _capturePanelHotkeysBeforeTabby），而键入定位是**唯一**只挂在 window 冒泡路径上的
    //   功能（onWindowKeyDown → _handlePanelWindowHotkey 末尾那次调用）。冒泡路径只要被任何
    //   上游 `stopPropagation()` 掐断（宿主或第三方监听器都可能），就恰好表现为
    //   「热键全都好使、只有字母/数字定位静默失效」—— 与用户现象完全一致。
    //
    //   守卫刻意与 _handlePanelWindowHotkey 对齐，且**只认焦点在面板内**（不认 owns）：
    //   不聚焦时仍走原冒泡路径，避免把「刚点过面板又跑去别处（设置页等）打字」的按键抢走。
    //   · 正在输入框打字 / IME 组合态 / 焦点在终端 ⇒ 一律不认领（交还输入框与终端）
    //   · 设置页关闭「键入定位」后**必须一并不认领** —— 否则按键会在捕获阶段被 preventDefault
    //     掉、随后 _tryTypeAheadFind 直接返回 false，字符被静默吞掉（比不生效更糟）
    if (this.typeAheadEnabled
      && event.key.length === 1
      && !event.ctrlKey && !event.metaKey && !event.altKey
      && !event.isComposing
      && event.key.charCodeAt(0) >= 32
      && this._isPanelDomFocused()
      // ★ 2026-10-19 P2-15：目标是面板内 button 且按的是空格 → **不认领**，把按键
      //   交还浏览器去激活按钮（捕获阶段一旦认领就会 preventDefault，按钮再也按不动）
      && !this._isSpaceOnPanelButton(event)
      && !this._isPanelTyping(event)
      && !this._isTerminalFocusTarget(event)) {
      return true
    }
    // ★ 2026-09-29：Shift 也纳入 —— Shift+↑/↓ 现在是面板的连续多选，需在捕获阶段就认领，
    //   否则宿主可能先消费掉组合键；Ctrl/Alt/Meta 组合仍不认领。
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown')
      && !event.ctrlKey && !event.metaKey && !event.altKey
      && this._arrowNavPane
      // ★ 2026-10-19 P2-16：捕获阶段此前**无条件**认领方向键，而冒泡阶段
      //   （_handlePanelWindowHotkey）只在「真的发生移动」时才消费 —— 列表端点处刻意
      //   不消费、把按键留给宿主。两者不一致 ⇒ 端点处的方向键在捕获阶段就被
      //   preventDefault + stopImmediatePropagation 吞掉，宿主永远收不到。
      //   这里补上同一判据：rl（暂不支持方向键导航）与「已在端点」一律不认领。
      && this._arrowNavWouldMove(this._arrowNavPane, event.key === 'ArrowDown')) {
      return true
    }
    if (this._panelHotkeyEnabled('up') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('up'))) {
      return true
    }
    if (this._panelHotkeyEnabled('delete') && this._matchPanelHotkeyKeysIgnoreShift(event, this._panelHotkeyKeys('delete'))) {
      // ★ 2026-10-19 P1：三值槽位（rl 端点命中 _rlSelected，不再误落陈旧 remote 槽位）
      const side = this._resolveTargetPane()
      const sel = this._paneSelection(side)
      return !!(sel && sel.length > 0)
    }
    if (this._panelHotkeyEnabled('rename') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('rename'))) {
      const pane = this._resolveTargetPane()
      return this._paneSelection(pane).length === 1
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
    if (!this._isPanelDomFocused() && !this._ownsHotkeysApply()) return
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
      else if (pane === 'rl') this._rlUp()
      else this.remoteUp()
      return
    }
    // 删除选中（默认 Delete；Shift+Delete = 跳过回收站，仍弹确认）
    // 注意：shift 不参与热键匹配——它作为"强制永久删除"语义修饰符始终透传给 _paneDelete
    if (this._panelHotkeyEnabled('delete') && this._matchPanelHotkeyKeysIgnoreShift(event, this._panelHotkeyKeys('delete'))) {
      // ★ 2026-10-19 P1：三值槽位。此前 rl 侧 Delete 落到陈旧 selectedRemote ⇒ 删幽灵远程文件
      const side = this._resolveTargetPane()
      const sel = this._paneSelection(side)
      if (sel && sel.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        this._paneDelete(side, event.shiftKey)
      }
      return
    }
    // 重命名（默认 F2）
    // ★ 2026-10-19 P1：目标侧扩三值，rl 走 ctxRename（本地 fs 重命名，刷新右栏）
    if (this._panelHotkeyEnabled('rename') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('rename'))) {
      const pane = this._resolveTargetPane()
      const sel = this._paneSelection(pane)
      if (sel.length === 1) {
        event.preventDefault()
        event.stopPropagation()
        if (pane === 'rl') { this.contextMenuPane = 'rl'; this.ctxRename() }
        else if (pane === 'local') this.localRename()
        else this.remoteRename()
      }
      return
    }
    // 刷新当前面板（默认 F5）
    // ★ 2026-10-19 P1：rl 侧 F5 此前刷的是远程面板（右栏内容丝毫不更新）
    if (this._panelHotkeyEnabled('refresh') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('refresh'))) {
      event.preventDefault()
      event.stopPropagation()
      const pane = this._resolveTargetPane()
      if (pane === 'local') void this.refreshLocal()
      else if (pane === 'rl') void this._rlRefresh()
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
        const sel = this._paneSelection(pane)
        this.contextMenuEntry = (sel[0] as any) ?? null
      }
      this.onContextMenuAction(a as ContextMenuAction)
      return
    }

    // 键入定位：未命中其它热键时，按文件名前缀跳转选中
    // ★ issue #24：仅当面板文件列表自身获得焦点时才消费空格/字母；
    //   面板仅"拥有剪贴板热键"而未获焦点的场景（如刚点过面板又切回终端）不吞字符，交还终端。
    if (this._isPanelDomFocused() && this._tryTypeAheadFind(event)) return
    // ★ 2026-10-16：与守卫 #3 对齐 —— `owns`（刚在面板内按过鼠标）也允许键入定位。
    //
    //   起因：本行原先**只认 `_isPanelDomFocused()`**，而面板的焦点窃取一度失效
    //   （见 _stealFocusToPanelRoot 的根治注释），点击文件后 document.activeElement 停在 BODY
    //   ⇒ 方向键/Delete/F2/F5 照常好使（它们走守卫 #3，接受 owns），
    //   **只有键入定位全灭** —— 现象正是用户报的「热键都好、单字母定位不行」。
    //   焦点窃取已修，但这里再与 #3 对齐，避免同类失效再次只砸中一个功能。
    //
    //   安全性：能走到这里说明已经过 #2（无模态）、#4（不在输入框打字）、#5（焦点不在终端）；
    //   而 `owns` 会在**面板外任何 mousedown** 时被 onDocumentMouseDownForMenu 清零
    //   ⇒ 不会出现「人在设置页等别处打字、字母被面板吃掉」的情形。
    if (this._ownsHotkeysApply() && this._tryTypeAheadFind(event)) return
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
   * ★ 2026-10-19 P2-15：焦点落在面板内 `<button>` 上时，空格是**按钮的激活键**。
   *
   * 键入定位把「单字符可打印」全认领（空格 charCode=32 也符合），于是焦点在面板
   * 工具栏按钮（刷新/新建/传输日志…）上按空格时：捕获阶段就 preventDefault +
   * stopImmediatePropagation，浏览器默认的「空格激活按钮」被掐掉 ⇒ 按钮只能用
   * 鼠标点、键盘完全按不动（E1 代理独立复现同一现象）。
   *
   * 判定刻意只认「目标是 button 且按键是空格」这一最窄组合：其余字符/其余目标
   * 一律维持原行为，不影响键入定位。
   */
  private _isSpaceOnPanelButton(event: KeyboardEvent): boolean {
    if (event.key !== ' ' && event.key !== 'Spacebar') return false
    const el = (event.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null)
    if (!el || typeof el.closest !== 'function') return false
    return !!el.closest('button')
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
    // ★ 2026-10-19 P2-15：空格在面板内 button 上是「激活按钮」，不能被键入定位吞掉
    //   （否则按钮只能鼠标点）。置于最前：本方法一旦返回 true 就会 preventDefault。
    if (this._isSpaceOnPanelButton(event)) return false
    // ★ 2026-10-16：设置页可关闭（默认开）
    if (!this.typeAheadEnabled) return false
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
    // ★ 2026-10-16：键入定位关闭时，IME 上屏的正文也不参与定位（本方法是**独立入口**，
    //   不能只在前两条路径上把关，否则关掉开关后中文仍会跳选）
    if (!this.typeAheadEnabled) return
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
  private _applyTypeAhead(side: 'local' | 'remote' | 'rl', mode: 'append' | 'cycle' | 'fresh'): boolean {
    const prefix = this._typeAheadNorm(this._typeAheadBuf)
    if (!prefix) return false

    const pick = <T extends { name: string; fullPath: string }>(
      list: T[],
      selectedPaths: Set<string>,
      /**
       * ★ 2026-10-19 P2-10：按**显示序**（分组桶序）循环，而不是排序序。
       *
       * 方向键导航早在 2026-09-29 就改成走显示序（_navRows），而键入定位这一路漏改：
       * `list` 是过滤后的**排序序**，分组模式下 DOM 行序 = 分组桶序 ≠ 排序序 ⇒
       * 连按同一字母时会在「排序序上相邻、屏幕上相隔很远」的项之间跳（用户看到光标
       * 在屏幕上乱跳、跨组乱窜）。这里把扫描序列换成显示序再映射回 list 下标：
       * 不传（扁平模式 / 分组关闭）时 seq 就是恒等序列，行为与原来完全一致。
       */
      displayOrder?: readonly string[] | null,
    ): number => {
      if (!list.length) return -1
      let seq: number[] | null = null
      const byPath = new Map<string, number>()
      if (displayOrder && displayOrder.length) {
        for (let i = 0; i < list.length; i++) byPath.set(list[i].fullPath, i)
        seq = []
        for (const p of displayOrder) {
          const i = byPath.get(p)
          if (i !== undefined) seq.push(i)
        }
        if (!seq.length) seq = null
      }
      if (!seq) seq = list.map((_, i) => i)

      const curListIdx = selectedPaths.size > 0
        ? (byPath.get([...selectedPaths][0]) ?? list.findIndex(e => e.fullPath === [...selectedPaths][0]))
        : -1
      const cur = curListIdx >= 0 ? seq.indexOf(curListIdx) : -1
      const currentMatches = cur >= 0 && this._typeAheadNorm(list[seq[cur]].name || '').startsWith(prefix)
      const lastHit = this._typeAheadLastHitPrefix

      const findFrom = (start: number): number => {
        for (let i = start; i < seq!.length; i++) {
          if (this._typeAheadNorm(list[seq![i]].name || '').startsWith(prefix)) return seq![i]
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
        return seq[cur]
      }
      // 当前不匹配更长前缀 → 在全列表中查找（勿直接失败，否则会误用末字符重搜）
      if (mode === 'append') return findFrom(0)

      // fresh：当前已匹配则下一个；否则从头找
      if (currentMatches) return nextAfterCurrent()
      return findFrom(0)
    }

    // ★ 2026-10-19 P1：右栏为本地端点（rl）时键入定位作用在 rl 列表上，
    //   此前会去改 selectedRemote（看不见的远程选中集，配合 Delete 即误删幽灵条目）
    if (side === 'rl') {
      const list = this.getFilteredRlEntries()
      if (!list || !list.length) return false
      const idx = pick(list, this._rlSelectedPaths, this._displayEntryOrder('rl'))
      if (idx < 0) return false
      if (this.selectedLocal.length) this.selectedLocal = []
      if (this.selectedRemote.length) this.selectedRemote = []
      this._rlSelected = [list[idx]]
      this._rlLastSelectedIndex = idx
      this._syncRlSelPaths()
      this._arrowNavPane = 'rl'
      this.activePane = 'rl'
      this._typeAheadLastHitPrefix = prefix
      this.syncPaneSelectionVisual('rl')
      this._safeDetect()
      this._scrollEntryIntoView('rl', list[idx], 'center')
      return true
    }

    if (side === 'local') {
      const list = this.getFilteredLocalEntries()
      if (!list || !list.length) return false
      const idx = pick(list, this._localSelectedPaths, this._displayEntryOrder('local'))
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
    const idx = pick(list, this._remoteSelectedPaths, this._displayEntryOrder('remote'))
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
  // ★ 2026-10-19（Hy3）：同 localNewFolder —— 右栏远程（含左栏远程端点之外的远程入口）显式指定刷新侧
  remoteNewFolder(): void {
    if (!this.connected) return
    this._inputRefreshSide = 'remote'
    this.openInputDialog('remote-mkdir', this.i18n.t('app.newFolder'), '', '', this.remotePath)
  }
  remoteNewFile(): void {
    if (!this.connected) return
    this._inputRefreshSide = 'remote'
    this.openInputDialog('remote-touch', this.i18n.t('app.newFile'), '', '', this.remotePath)
  }
  remoteRename(): void {
    if (this.selectedRemote.length !== 1 || !this.connected) return
    this._inputRefreshSide = 'remote'
    this.openInputDialog('remote-rename', this.i18n.t('app.rename'), this.selectedRemote[0].name, this.selectedRemote[0].name, '', this.selectedRemote[0].fullPath)
  }
  remoteDelete(): void { this._paneDelete('remote') }

  /**
   * ★ 2026-10-20：某栏的**文件系统**是否为本机磁盘（端点语义，不是栏位语义）。
   *   `side === 'local'` 只是「左栏」，左栏切远程端点后它是 SFTP —— 删除提示、路径分隔符、
   *   属性字段形态都曾按栏位判，导致左栏远程显示「移入回收站」、用 win32 dirname 反推 POSIX 路径。
   *   端点不可用（未连接/路径空）时按旧语义兜底，避免调不出对话框。
   */
  private _paneIsLocalFs(side: 'local' | 'remote' | 'rl'): boolean {
    const ep = this._paneEndpoint(side)
    if (ep) return ep.isLocal
    return side !== 'remote'
  }

  private _paneDelete(side: 'local' | 'remote' | 'rl', forcePermanent?: boolean): void {
    const sel = side === 'local' ? this.selectedLocal
      : side === 'rl' ? this._rlSelected
        : this.selectedRemote
    if (!sel.length) return
    // 本地文件：默认移入回收站（Delete 键），Shift+Delete 或右键菜单+永久删除走永久删除
    // 远程文件只能永久删除（SFTP 无回收站概念）
    // ★ issue #27 P0：左栏远程端点同样是 SFTP，只能永久删除；右栏本地（rl）是本地 fs，支持回收站
    // ★ 2026-10-20：改按**端点**判定。原 `side !== 'remote'` 把左栏远程端点也算成「可回收站」⇒
    //   确认框显示「📥 移入回收站」，而 confirmDelete 实际走第二会话递归删除（提示与行为不符）。
    this.deleteToTrash = this._paneIsLocalFs(side) && !(forcePermanent ?? false)
    if (side === 'local') this.pendingLocalDelete = sel.slice() as LocalEntry[]
    else if (side === 'rl') this.pendingRlDelete = sel.slice() as LocalEntry[]
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

  cancelInputDialog(): void {
    this.inputDialogVisible = false; this.inputDialogMode = null; this.inputDialogValue = ''
    // ★ issue #27 P0：清掉左栏远程端点的会话覆盖
    this._inputSessionOverride = null
    // ★ 2026-10-19（Hy3）：**不再**在这里把 `_inputRefreshSide` 复位成 'remote'。
    //   确认流程是 `cancelInputDialog()` → `_refreshForInputDialog()`，先复位就把刚完成的
    //   操作侧信息抹掉了 ⇒ 本地/左栏远程/rl 的增删改一律去刷右栏远程，操作栏自己不刷新。
    //   刷新侧改为各入口打开对话框时显式赋值，取消时残留旧值无害（下次打开必覆盖）。
  }

  /**
   * ★ issue #27 P0：输入对话框完成后的刷新——左栏远程端点刷左栏，右栏本地（rl）刷右栏，其余刷右栏（远程）
   * ★ 2026-10-19（Hy3）：先刷操作栏，再联动刷新「同连接 + 同目录」的另一栏（见 _refreshSiblingPanes）
   */
  private async _refreshForInputDialog(): Promise<void> {
    const side = this._inputRefreshSide
    await this._refreshPaneSide(side)
    await this._refreshSiblingPanes(side)
  }

  /** 按侧调用对应的刷新实现（'local' 侧内部自行区分左栏本地 / 左栏远程端点） */
  private async _refreshPaneSide(side: 'local' | 'remote' | 'rl'): Promise<void> {
    if (side === 'rl') await this._rlRefresh()
    else if (side === 'local') await this.refreshLocal()
    else await this.refreshRemote()
  }

  /**
   * ★ 2026-10-19（Hy3）：取某一栏的**端点**（连接类型 + 目录 + 会话）。返回 null 表示该栏当前不可用
   *   （不可见 / 未连接 / 路径为空）。刷新、粘贴、存在性探测、删除、路径拼接全部以它为准，
   *   不再各自散写 `side === 'local' ? … : …`（那套 2 值假设在双端点模式下必错一端）。
   */
  private _paneEndpoint(side: 'local' | 'remote' | 'rl'): PaneEndpoint | null {
    if (side === 'rl') {
      if (this._rightKind !== 'local' || !this._rlPath) return null
      return { side, isLocal: true, dir: this._rlPath, sftp: null, ssh: null, connKey: 'local' }
    }
    if (side === 'local') {
      if (!this.localPath) return null
      if (this._leftKind === 'remote') {
        if (!this._leftSftpSession) return null
        // 左栏远程端点：连接身份取「SSH 会话」而不是新建出来的 SFTP 子通道——
        // 同一个 SSH 标签页两侧各开一条子通道，拿 SFTP 对象比较会永远不相等。
        return {
          side, isLocal: false, dir: this.localPath,
          sftp: this._leftSftpSession, ssh: this._leftSshSession,
          connKey: this._leftSshSession || this._leftSftpSession,
        }
      }
      return { side, isLocal: true, dir: this.localPath, sftp: null, ssh: null, connKey: 'local' }
    }
    if (this._rightKind !== 'remote' || !this.remotePath || !this.sftpSession) return null
    return {
      side, isLocal: false, dir: this.remotePath,
      sftp: this.sftpSession, ssh: this.sshSession,
      connKey: this.sshSession || this.sftpSession,
    }
  }

  /** 该栏是否需要走「端点直传」（左栏远程端点无法被 paste/drop 适配器的 2 值 local/remote 语义表达） */
  private _needsDirectTransfer(ep: PaneEndpoint | null): boolean {
    return !!ep && ep.side === 'local' && !ep.isLocal
  }

  /** 同一目录判定：本地按 path.resolve（Windows 大小写不敏感），远程按 POSIX 语义（只去尾部斜杠） */
  private _sameDirText(a: string, b: string, isLocalFs: boolean): boolean {
    if (!a || !b) return false
    if (isLocalFs) {
      let na = a
      let nb = b
      try { na = path.resolve(a) } catch { /* 保留原值 */ }
      try { nb = path.resolve(b) } catch { /* 保留原值 */ }
      if (os.platform() === 'win32') { na = na.toLowerCase(); nb = nb.toLowerCase() }
      return na === nb
    }
    const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p)
    return strip(a) === strip(b)
  }

  /**
   * ★ 2026-10-19（Hy3）：操作栏新建/重命名/删除后，把「同一个连接 + 同一个目录」的另一栏也刷一次。
   *   - 两栏都指向本机磁盘（左栏本地 + 右栏本地 rl）：同一目录即联动；
   *   - 两栏指向同一个 SSH 连接（左栏远程端点 + 右栏远程）：同一目录即联动。
   *   只做同目录联动：目录不同时该栏内容没有变化，刷新只会丢用户的滚动位置与选中。
   */
  private async _refreshSiblingPanes(side: 'local' | 'remote' | 'rl'): Promise<void> {
    const src = this._paneEndpoint(side)
    if (!src || !this._isAlive) return
    for (const other of ['local', 'remote', 'rl'] as const) {
      if (other === side) continue
      const dst = this._paneEndpoint(other)
      if (!dst || dst.connKey !== src.connKey) continue
      if (!this._sameDirText(src.dir, dst.dir, dst.isLocal)) continue
      try {
        await this._refreshPaneSide(other)
      } catch (e) {
        log.warn('sibling pane refresh failed:', other, e)
      }
    }
  }

  /**
   * ★ 2026-10-19（Hy3）：数据变更后的刷新必须按**文件系统**、不能按「左/右」。
   *   右侧面板可以是本地浏览器（rl）、左栏也可以是远程端点，而 paste/drop/传输/冲突
   *   四个适配器拿到的回调叫 refreshLocal / refreshRemote ——「本地 FS 变了 ⇒ 刷左栏」这条
   *   旧假设会把刷新打到错误的栏。实测：右栏本地粘贴遇到同名文件选「重命名」后，
   *   左栏（同为本地）刷出来了、右栏本身不刷新，必须手动 F5。
   *   统一实现：遍历三栏端点，刷「连接类型匹配」的那些栏。
   */
  private async _refreshPanesOfFs(isLocal: boolean): Promise<void> {
    for (const side of ['local', 'remote', 'rl'] as const) {
      const ep = this._paneEndpoint(side)
      if (!ep || ep.isLocal !== isLocal) continue
      try {
        await this._refreshPaneSide(side)
      } catch (e) {
        log.warn('pane refresh failed:', side, e)
      }
    }
  }

  /** 刷新所有「本机磁盘」栏（左栏本地 + 右栏本地 rl）；理由见 _refreshPanesOfFs */
  private _refreshLocalFsPanes(): Promise<void> {
    return this._refreshPanesOfFs(true)
  }

  /* ------------------------------------------------------------------------- *
   * QuickCmd+ 联动（接收侧）—— 事件契约见 core/quickcmd-link.ts
   * ------------------------------------------------------------------------- */

  /**
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：处理 QuickCmd+ 的刷新请求。
   *
   * 匹配规则（宁可不刷，也不去骚扰别的连接）：
   *   ① 设置开关关闭 ⇒ 直接忽略（默认关，用户显式打开才生效）；
   *   ② detail.session 是本面板持有/关联的 SSH 会话 ⇒ 刷「远程栏」；
   *   ③ detail.isSsh === false（命令跑在本地 shell）⇒ 刷「本地栏」—— 本机磁盘全局只有一份，
   *      不需要按连接匹配；
   *   ④ 带了 session 但对不上 ⇒ 忽略（另一台服务器上跑的命令不该刷本面板）；
   *   ⑤ 没带 session（旧版本 / 第三方派发）⇒ 退化为「已连接就刷远程，否则刷本地」，并记日志。
   *
   * ⛔ 只刷新、不跳转、不改路径：命令写进哪个目录只有 shell 自己知道，猜错会把用户
   *    带离工作目录。同目录刷新由 refreshRemote 的 _pruneSelection 兜住，当前选择不会丢。
   */
  private _onQuickCmdRefreshRequest(raw: any): void {
    const d = normalizeRefreshRequest(raw)
    if (!d) return
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：先记「对面真的活着」，再判开关 ——
    //   设置页靠这条记录判定 QuickCmd+ 是否装好（开关关着也算装上，避免误报未安装）。
    markQuickCmdSeen()
    if (!this._refreshOnQuickCmd) {
      log.info('[SFTP+] quickcmd refresh ignored: refreshOnQuickCmd=false')
      return
    }
    const label = (d.commandName || '?') + (d.hostLabel ? ' @ ' + d.hostLabel : '')
    if (d.isSsh === false) {
      log.info('[SFTP+] quickcmd refresh: local fs (' + label + ')')
      this._startQuickCmdObserve(true)
      return
    }
    if (d.session) {
      // ⛔ 引用比对而不是 host 字符串：同一 host 可以开多个标签页，命令只该刷「它自己那一份」
      const ours = d.session === this.sshSession || d.session === this._leftSshSession
      if (!ours) return
      log.info('[SFTP+] quickcmd refresh: remote session matched (' + label + ')')
      this._startQuickCmdObserve(false)
      return
    }
    log.info('[SFTP+] quickcmd refresh: no session in detail, fallback connected=' + this.connected)
    this._startQuickCmdObserve(!this.connected)
  }

  /**
   * 启动（或重置）观察期轮询。
   * @param local true = 刷本地栏；false = 刷远程栏
   * ⛔ 重复请求走同一个 observer 的 start —— 它内部先 stop 再排新定时器，
   *   绝不会出现「连按两次快捷命令，两份定时器同时刷」。
   */
  private _startQuickCmdObserve(local: boolean): void {
    if (!this._qcObserver) this._qcObserver = new QcRefreshObserver()
    this._qcObserver.start({
      windowMs: this._refreshOnQuickCmdWindowMs,
      tick: async () => {
        if (!this._isAlive) return ''
        await this._refreshPanesOfFs(local)
        return this._paneListFingerprint(local)
      },
      isAlive: () => this._isAlive,
      log: msg => log.info('[SFTP+] ' + msg),
    })
  }

  /**
   * 列表指纹（判断「远端是否还在改动该目录」）：名字 + 大小 + 目录标志 + 修改时间。
   * ⛔ 用 FNV-1a 折成短串再比：备份目录动辄上千项，每 1.5s 拼一次长串既费 CPU 又费内存。
   * ⛔ 不要只比长度/条目数：备份文件是「先建后长大」，条目数一直不变，只有 size/mtime 在动。
   */
  private _paneListFingerprint(local: boolean): string {
    let h = 2166136261
    let n = 0
    const feed = (arr: any[]) => {
      for (const e of arr || []) {
        if (!e) continue
        n++
        const s = (e.name || '') + '|' + (e.size ?? '') + '|' + (e.isDirectory ? 'd' : 'f') + '|'
          + ((e as any).modified ?? (e as any).mtimeMs ?? '')
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i)
          h = Math.imul(h, 16777619)
        }
      }
    }
    if (local) { feed(this.localEntries); feed(this._rlEntries) }
    else { feed(this.remoteEntries) }
    return n + ':' + (h >>> 0).toString(36)
  }


  /* ------------------------------------------------------------------ *
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新列表（设置项 autoRefreshEnabled，默认关）
   *   与上面 QuickCmd+ 联动的区别：那条是「对面刚跑过命令」触发的一次性观察期，
   *   这条是「外面有人在写这台机器」（日志/监控截图/CI 产物）的场景，按固定间隔一直刷。
   * ------------------------------------------------------------------ */

  /**
   * 同步定时器：开关关闭、间隔改动、面板销毁都走这一个出口。
   * ⛔ 只改间隔不重排 ⇒ 定时器还按老间隔跑，用户会以为设置没生效（所以先 clear 再 set）。
   */
  private _syncAutoRefreshTimer(): void {
    if (this._autoRefreshTimer) {
      clearInterval(this._autoRefreshTimer)
      this._autoRefreshTimer = null
    }
    if (!this._autoRefreshEnabled || !this._isAlive) return
    this._autoRefreshTimer = setInterval(() => { void this._autoRefreshTick() }, this._autoRefreshIntervalMs)
  }

  /**
   * 定时刷新一轮：本地栏 + 远程栏都刷。
   * ⛔ 只刷新、不跳转、不改路径、不动选择（同目录刷新由 _pruneSelection 兜住）。
   * ⛔ 不闪蓝：定时刷新没有「用户刚做完动作」的信息量，每 N 秒闪一下纯骚扰 ⇒ _autoRefreshQuiet。
   * ⛔ 窗口不可见时跳过 —— 用户在别处干活时这份列表没人看，不必给远端 readdir 施压。
   * ⛔ 右键菜单开着时跳过：菜单是挂在选中行上的，刷新会把消失的条目从选择里剔掉，
   *    菜单失去锚点还悬在那里（用户正要点「删除/重命名」，不该被打断）。
   * ⛔ 上一轮没回来（弱网/大目录）就跳过本轮，绝不并发压 readdir。
   */
  private async _autoRefreshTick(): Promise<void> {
    if (!this._isAlive || this._autoRefreshBusy) return
    if (typeof document !== 'undefined' && document.hidden) return
    if (this.contextMenuVisible) return
    this._autoRefreshBusy = true
    this._autoRefreshQuiet = true
    try {
      await this._refreshPanesOfFs(true)
      await this._refreshPanesOfFs(false)
    } catch (e) {
      log.warn('[SFTP+] auto refresh failed:', e)
    } finally {
      this._autoRefreshQuiet = false
      this._autoRefreshBusy = false
    }
  }


  /** 刷新所有「远程」栏（右栏远程 + 左栏远程端点）；理由见 _refreshPanesOfFs */
  private _refreshRemoteFsPanes(): Promise<void> {
    return this._refreshPanesOfFs(false)
  }

  /** 准备删除确认对话框的显示内容 */
  private prepareDeleteConfirm(entries: Array<LocalEntry | SFTPFile>, side: 'local' | 'remote' | 'rl'): void {
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
  private _deleteTargetsLocation(entries: Array<LocalEntry | SFTPFile>, side: 'local' | 'remote' | 'rl'): string {
    // ★ 2026-10-18 反馈③：rl 走本地（Windows）路径 dirname
    // ★ 2026-10-20：改按**端点**判定 —— 左栏切远程端点后 fullPath 是 POSIX，
    //   用 win32 的 path.dirname 反推会得到 `\home\user` 这种反斜杠串（显示错、且看着像本地路径）。
    const dirname = this._paneIsLocalFs(side)
      ? path.dirname.bind(path)
      : path.posix.dirname.bind(path.posix)
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
          await fs.mkdir(existing, { recursive: true }); this.cancelInputDialog(); await this._refreshForInputDialog(); break
        }
        case 'local-rename': {
          // ★ 2026-10-19：右栏本地（rl）重命名 baseDir 用 _rlPath，其余用 localPath
          const baseDir = this._inputRefreshSide === 'rl' ? this._rlPath : this.localPath
          const newPath = safeJoinUnder(baseDir, val, false)
          if (!newPath) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          if (newPath !== tp) {
            let exType: 'file' | 'dir' | null = null
            try { const st = await fs.stat(newPath); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
            if (exType === 'dir') { this._showInputConflict('dir-dup', val); break }
            if (exType === 'file') { this._showInputConflict('file-dup', val); break }
          }
          await fs.rename(tp!, newPath); this.cancelInputDialog(); await this._refreshForInputDialog(); break
        }
        case 'remote-mkdir': {
          // ★ issue #27 P0：会话/刷新可被左栏远程端点覆盖（_inputSessionOverride/_inputRefreshSide）
          const sess = this._inputSessionOverride || this.sftpSession
          if (!sess) return
          const dest = safeJoinUnder(tp!, val, true)
          if (!dest) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          const r = await this._remoteEntryExists(tp!, val, sess)
          if (r.isDirectory) { this._showInputConflict('dir-dup', val); break }
          if (r.exists) { this._showInputConflict('file-when-mkdir', val); break }
          await sess.mkdir(dest); this.cancelInputDialog(); await this._refreshForInputDialog(); break
        }
        case 'local-touch': {
          const newPath = safeJoinUnder(tp!, val, false)
          if (!newPath) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          let exType: 'file' | 'dir' | null = null
          try { const st = await fs.stat(newPath); exType = st.isDirectory() ? 'dir' : 'file' } catch { /* 不存在 */ }
          if (exType === 'dir') { this._showInputConflict('dir-when-touch', val); break }
          if (exType === 'file') { this._showInputConflict('file-dup', val); break }
          await fs.writeFile(newPath, ''); this.cancelInputDialog(); await this._refreshForInputDialog(); break
        }
        case 'remote-touch': {
          const sess = this._inputSessionOverride || this.sftpSession
          if (!sess) return
          const dest = safeJoinUnder(tp!, val, true)
          if (!dest) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          const r = await this._remoteEntryExists(tp!, val, sess)
          if (r.isDirectory) { this._showInputConflict('dir-when-touch', val); break }
          if (r.exists) { this._showInputConflict('file-dup', val); break }
          const touchTmp = path.join(os.tmpdir(), `sftp-touch-${Date.now()}`)
          await fs.writeFile(touchTmp, '')
          const touchUp = new LocalPathFileUpload(touchTmp)
          try {
            await sess.upload(dest, touchUp as any)
          } finally {
            await fs.unlink(touchTmp).catch(() => {})
          }
          this.cancelInputDialog(); await this._refreshForInputDialog(); break
        }
        case 'remote-rename': {
          const sess = this._inputSessionOverride || this.sftpSession
          if (!sess) return
          // ★ issue #27 P0：左栏远程端点时 baseDir 是 localPath（POSIX），其余同右栏
          const baseDir = this._inputSessionOverride ? this.localPath : this.remotePath
          const newPath = safeJoinUnder(baseDir, val, true)
          if (!newPath) { this.showToast(this.i18n.t('op.failed', { reason: 'invalid name' }) || 'Invalid name', 3000); break }
          if (newPath !== rp) {
            const r = await this._remoteEntryExists(baseDir, val, sess)
            if (r.isDirectory) { this._showInputConflict('dir-dup', val); break }
            if (r.exists) { this._showInputConflict('file-dup', val); break }
          }
          await sess.rename(rp!, newPath); this.cancelInputDialog(); await this._refreshForInputDialog(); break
        }
        case 'remote-chmod':
          {
            const sess = this._inputSessionOverride || this.sftpSession
            if (!sess) return
            if (!/^[0-7]{3,4}$/.test(val)) return
            const m = parseInt(val, 8)
            if (!isNaN(m)) { await sess.chmod(rp!, m); this.cancelInputDialog(); await this._refreshForInputDialog() }
          }
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
    const rlPending = this.pendingRlDelete.slice()
    const remotePending = this.pendingRemoteDelete.slice()
    this.pendingLocalDelete = []
    this.pendingRlDelete = []
    this.pendingRemoteDelete = []
    const failed: string[] = []
    const trashFailed: string[] = []  // 回收站失败（不回退永久删除）
    try {
      if (localPending.length) {
        // ★ issue #27 P0：左栏远程端点 → 走第二会话的远程递归删除（无回收站语义）
        if (this._leftKind === 'remote' && this._leftSftpSession) {
          const delLim = new ConcurrencyLimiter(8)
          await Promise.all(localPending.map(async (e) => {
            if ((e as any).isDirectory && await tryRemoteRmViaSsh(this._leftSshSession, e.fullPath)) return
            await deleteRemoteRecursive(this._leftSftpSession, e.fullPath, failed, 0, delLim)
          }))
        } else {
          await this._deleteLocalFs(localPending, failed, trashFailed)
        }
        await this.refreshLocal(); this.selectedLocal = []
        // ★ 2026-10-19（Hy3）：删除后联动刷新「同连接 + 同目录」的另一栏（左本地⇄rl、左远程⇄右远程）
        await this._refreshSiblingPanes('local')
      }
      if (rlPending.length) {
        // ★ 2026-10-19：右栏本地（rl）与左栏本地同属本地 fs，走回收站/永久删除
        await this._deleteLocalFs(rlPending, failed, trashFailed)
        await this._rlRefresh(); this._rlSelected = []
        await this._refreshSiblingPanes('rl')
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
        await this._refreshSiblingPanes('remote')
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

  /** ★ 2026-10-19：本地 fs 删除（左栏本地 + 右栏本地 rl 共用）——按 deleteToTrash 走回收站或永久删除 */
  private async _deleteLocalFs(pending: LocalEntry[], failed: string[], trashFailed: string[]): Promise<void> {
    if (this.deleteToTrash) {
      // ★ 2026-10-19（Hy3）：整批一次移入回收站。
      //   原实现是「每个文件 await 一次 powershell.exe」（实测 ≈1s/项且串行）——多选删除时
      //   列表长时间不更新，表现就是「卡死」。批量接口把整批交给一次进程，失败项逐条回报。
      //   仍然遵守既有约定：回收失败**不改走永久删除**，而是提示用户（文件未被删除）。
      try {
        const res = await trashLocalPaths(pending.map(e => ({
          path: e.fullPath,
          isDirectory: !!(e as any).isDirectory,
        })))
        for (const f of res.failed) {
          trashFailed.push(f.path)
          log.error('trash failed for', f.path, f.reason)
        }
      } catch (err) {
        for (const e of pending) trashFailed.push(e.fullPath)
        log.error('trash batch failed:', err)
      }
    } else {
      // ★ 2026-08-11 提速：目录优先 Node 原生 fs.rm（比 JS 层逐文件删快得多），
      //   失败再回退并发递归以收集失败明细；多项并行，共享同一限制器
      const delLim = new ConcurrencyLimiter(8)
      await Promise.all(pending.map(async (e) => {
        if ((e as any).isDirectory) {
          try { await fs.rm(e.fullPath, { recursive: true, force: true }); return }
          catch (err) { log.warn('fs.rm failed, fallback to recursive:', e.fullPath, err) }
        }
        await deleteLocalRecursive(e.fullPath, failed, 0, delLim)
      }))
    }
  }

  cancelDelete(): void {
    this.deleteConfirmVisible = false
    this.pendingLocalDelete = []
    this.pendingRlDelete = []
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
      // ★ 2026-10-25：「全部连接」筛选——空字符串表示全部连接，否则按指定连接筛选
      profileName: this.logFilterProfile || this.profile?.name || undefined,
      ...this._getLogTimeBounds(),
    }
    if (this.logFilterStatus === 'success') filter.success = true
    else if (this.logFilterStatus === 'failed') filter.success = false
    return this.transferLog.filter(filter)
  }

  /** 获取所有不重复的连接名称列表（用于「全部连接」筛选下拉框） */
  get logProfileNames(): string[] {
    return this.transferLog.getProfileNames()
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

  /** 当前导出格式（json / csv） */
  exportFormat: 'json' | 'csv' = 'json'

  exportLog(): void {
    const isCsv = this.exportFormat === 'csv'
    // ★ 2026-10-25：导出当前筛选条件下的日志，而非全部日志
    const entries = this.filteredTransferLogs
    const data = isCsv ? this.transferLog.exportAsCsv(entries) : this.transferLog.exportAsJson(entries)
    const mimeType = isCsv ? 'text/csv;charset=utf-8' : 'application/json'
    const ext = isCsv ? 'csv' : 'json'
    const blob = new Blob([data], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `sftp-plus-log-${new Date().toISOString().slice(0, 10)}.${ext}`
    a.click()
    // ★ BUG-16 修复：延迟释放 Blob URL，确保浏览器有足够时间完成下载
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  /**
   * 清除传输记录。
   * ★ 2026-10-26（Deepseek-V4.1-Flash）：二次确认从 `window.confirm()` 换成面板内确认框。
   *   ⛔ 别改回原生 confirm —— Electron(Windows) 关闭原生对话框后**焦点链不归还渲染进程**，
   *   此后工具栏那四个筛选下拉框点开毫无反应（用户实测报障「清除传输记录后筛选下拉框点不动」，
   *   对应 electron/electron#31917 / #22923，官方至今未修）。详见 sftp-confirm-dialog 头部注释。
   */
  async clearLog(): Promise<void> {
    // ★ 2026-09-26：没有「可清除记录」时直接返回（无记录 / 只剩下正在传输中的条目）。
    //   按钮已 disabled，这里再兜一层：避免键盘触发或程序化调用弹出一个「什么都清不掉」的确认框。
    if (this.transferLogClearableCount <= 0) return
    // await 前快照归属（确认框挡住期间用户可能在别的面板清了同一份存储）
    const profileName = this.profile?.name
    if (!(await this.askConfirm(this.i18n.t('transfer.clearConfirm')))) return
    // ★ 异步后按快照复核，不按「此刻是否还有记录」猜：被确认框挡住这段时间里
    //   另一面板可能已清空 / 当前连接的记录可能已被替换。
    if (this.transferLogClearableCount <= 0) return
    if (profileName) {
      this.transferLog.clearProfile(profileName)
    } else {
      this.transferLog.clear()
    }
    // ★ 清完后「全部连接」筛选项可能已不存在（该连接最后一条记录被清掉）——
    //   筛选值停在已消失的选项上会让列表恒为空且看不出原因，复位成「全部连接」。
    if (this.logFilterProfile && !this.logProfileNames.includes(this.logFilterProfile)) {
      this.logFilterProfile = ''
    }
    this._safeDetect()
  }

  // ========== 右键菜单 ==========
  onLocalContextMenu(entry: LocalEntry, ev: MouseEvent): void { this._onPaneContextMenu('local', entry, ev) }
  onRemoteContextMenu(entry: SFTPFile, ev: MouseEvent): void { this._onPaneContextMenu('remote', entry, ev) }
  /** ★ 2026-10-19：右栏本地端点（rl）条目右键 → 复用本地数据侧逻辑、选中集走 _rlSelected */
  onRlContextMenu(entry: LocalEntry, ev: MouseEvent): void { this._onPaneContextMenu('rl', entry, ev) }

  private _onPaneContextMenu(side: 'local' | 'remote' | 'rl', entry: { fullPath: string }, ev: MouseEvent): void {
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
    } else if (side === 'rl') {
      // ★ 2026-10-19：rl 选中集独立（_rlSelected），并清掉另一栏的选中，保持单栏选中模型
      // ★ 2026-10-19 P2-8：此前这里算了 findIndex 却 `void` 丢弃 ⇒ `_rlLastSelectedIndex`
      //   一直停在上一次点击的（可能已因刷新而失效的）下标上，rl 栏右键之后 Shift 连选
      //   的锚点陈旧/退化。现在把下标真正写进锚点（左右栏早已这么做了）。
      const rlIdx = this.getFilteredRlEntries().findIndex(e => e.fullPath === entry.fullPath)
      if (rlIdx >= 0) this._rlLastSelectedIndex = rlIdx
      if (this._rlSelectedPaths.has(entry.fullPath)) {
        // 已选中则保留整组选中（不重置），便于对整组操作
      } else {
        this._rlSelected = [entry as any]
        this._syncRlSelPaths()
        this.selectedLocal = []
        this.selectedRemote = []
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
      // ★ 2026-10-23：常驻时右键文件条目也不收书签弹层（走 IfNotPinned，与点外部同一口径）
      this.closeBookmarksIfNotPinned()
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
      // ★ 高危#14修复：组件已销毁时不访问DOM
      if (!this._isAlive) return
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
    if (this.contextMenuPane === 'rl') {
      // ★ 2026-10-19：右栏本地（rl）新建目录走本地 fs，刷新右栏
      this._inputRefreshSide = 'rl'
      this.openInputDialog('local-mkdir', this.i18n.t('app.newFolder'), '', '', this._rlPath)
      return
    }
    if (this.contextMenuPane === 'local') {
      // ★ issue #27 P0：左栏远程端点 → 新建目录走第二会话（复用 remote-mkdir 语义）
      if (this._leftKind === 'remote') { this._leftRemoteDialog('remote-mkdir', this.i18n.t('app.newFolder'), ''); return }
      this.localNewFolder()
    } else this.remoteNewFolder()
  }

  ctxNewFile(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'rl') {
      this._inputRefreshSide = 'rl'
      this.openInputDialog('local-touch', this.i18n.t('app.newFile'), '', '', this._rlPath)
      return
    }
    if (this.contextMenuPane === 'local') {
      if (this._leftKind === 'remote') { this._leftRemoteDialog('remote-touch', this.i18n.t('app.newFile'), ''); return }
      this.localNewFile()
    } else this.remoteNewFile()
  }

  ctxRename(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'rl') {
      if (this._rlSelected.length !== 1) return
      const e = this._rlSelected[0]
      this._inputRefreshSide = 'rl'
      this.openInputDialog('local-rename', this.i18n.t('app.rename'), e.name, e.name, e.fullPath)
      return
    }
    if (this.contextMenuPane === 'local') {
      if (this._leftKind === 'remote') {
        if (this.selectedLocal.length !== 1) return
        this._leftRemoteDialog('remote-rename', this.i18n.t('app.rename'), this.selectedLocal[0].name, this.selectedLocal[0].fullPath)
        return
      }
      this.localRename()
    } else this.remoteRename()
  }

  /**
   * ★ issue #27 P0：左栏远程端点的输入对话框。
   * 复用 remote-* 模式（POSIX 语义、SFTP 会话），但会话指向第二 SSH、刷新指向左栏。
   */
  private _leftRemoteDialog(
    mode: 'remote-mkdir' | 'remote-touch' | 'remote-rename',
    title: string, value: string, remotePath?: string,
  ): void {
    this._inputSessionOverride = this._leftSftpSession
    this._inputRefreshSide = 'local'
    this.openInputDialog(mode, title, value, value, this.localPath, remotePath)
  }

  ctxDelete(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'rl') { this._paneDelete('rl', false); return }
    if (this.contextMenuPane === 'local') this.localDelete()
    else this.remoteDelete()
  }

  ctxRefresh(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'rl') { void this._rlRefresh(); return }
    if (this.contextMenuPane === 'local') this.refreshLocal()
    else this.refreshRemote()
  }

  ctxSelectAll(): void {
    this.closeContextMenu()
    if (this.contextMenuPane === 'rl') {
      const all = this.getFilteredRlEntries()
      this._rlSelected = this._rlSelected.length === all.length ? [] : [...all]
      this._syncRlSelPaths(); this.syncPaneSelectionVisual('rl'); return
    }
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
    if (this.contextMenuPane === 'rl') {
      const all = this.getFilteredRlEntries()
      this._rlSelected = all.filter(e => !this._rlSelectedPaths.has(e.fullPath))
      this._syncRlSelPaths(); this.syncPaneSelectionVisual('rl'); return
    }
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
    const selected = this._ctxSelected
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

  /** 右键菜单 → 更改权限（仅 SFTP 远程） */
  ctxChmod(): void {
    this.closeContextMenu()
    // ★ 2026-10-20：按端点判定而非栏位。左栏切远程端点后选中集在 `selectedLocal` 里、
    //   会话在 `_leftSftpSession` 上；沿用 `selectedRemote` 会拿到**右栏**（可能是本地）的
    //   条目，沿用 `this.sftpSession` 会把 chmod 打到另一台服务器。
    if (this._ctxPaneIsLocal) return
    const sel = this._ctxSelected
    if (sel.length !== 1) return
    const session = this._paneEndpoint(this.contextMenuPane)?.sftp ?? null
    this.openPermDialog(sel[0] as SFTPFile, session ?? undefined)
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

  /** ★ 2026-10-19 issue #27 P3：右栏本地端点（rl）作为「本地数据侧」接入右键菜单。
   *   rl 是显示在右栏的第二个本地浏览器，数据仍是本地 fs，但与左栏本地共用同一套「本地」配置
   *   （列可见性/隐藏/置顶）与本地文件操作（删除走回收站、新建/重命名走本地 fs），
   *   仅选中集/当前目录/刷新槽位是独立的 _rl*。下列 getter 把 contextMenuPane 的三种取值
   *   统一收敛，菜单动作与子组件显示均复用，避免把 rl 误当远程去跑 SFTP 操作。 */
  private get _ctxIsLocalData(): boolean { return this.contextMenuPane !== 'remote' }
  /** 子组件显示用 pane：rl 按本地套显示动作（openLocal/viewFile/editFile/reveal 等） */
  get contextMenuDisplayPane(): 'local' | 'remote' { return this._ctxIsLocalData ? 'local' : 'remote' }
  /**
   * ★ 2026-10-20：右键所在栏**连的是不是本机磁盘** —— 端点语义，与上面的「配置槽位」不是一个轴。
   *   - 右栏远程（'remote'）恒为 false；右栏本地（'rl'）恒为 true；
   *   - 左栏（'local'）由 `_leftKind` 决定：双端点模式下左栏可以切到 SFTP 远程。
   *   上传/下载/打开/在文件夹中显示/权限 一律按它判定，不看栏位。
   *   为什么不能直接用 `_ctxIsLocalData`：左栏切远程时槽位仍是 local（列可见性/隐藏/置顶/
   *   分组读的都是本地那份配置，见 `_groupedLocalRows`），但数据在远端 ⇒ 菜单动作必须按 remote。
   */
  private get _ctxPaneIsLocal(): boolean {
    if (this.contextMenuPane === 'remote') return false
    if (this.contextMenuPane === 'rl') return true
    return this._leftKind !== 'remote'
  }
  /** 子组件 `dataPane` 绑定值（文件动作按端点判定） */
  get _ctxActionPane(): 'local' | 'remote' { return this._ctxPaneIsLocal ? 'local' : 'remote' }
  /**
   * 子组件 `peerPane` 绑定值：**另一栏**的端点类型。上传/下载只在两端异类时成立，
   * 两端同类（本机↔本机 / 远程↔远程）显示「传输」——只看本栏 dataPane 的话，
   * 远程↔远程的两栏会一起显示「下载」。
   */
  get _ctxPeerActionPane(): 'local' | 'remote' {
    const ep = this._paneEndpoint(this._ctxPeerPane)
    return ep && !ep.isLocal ? 'remote' : 'local'
  }
  /** 另一栏的物理槽位（上传/下载的对端） */
  private get _ctxPeerPane(): 'local' | 'remote' | 'rl' {
    if (this.contextMenuPane === 'local') return this._rightKind === 'local' ? 'rl' : 'remote'
    return 'local'
  }
  /**
   * ★ 2026-10-21（用户诉求）：右键栏与另一栏是否**同一台机**（同一 SSH 连接）。
   *
   * 用途：远程↔远程时区分菜单文案 ——
   *   - 不同连接：本栏推到另一台服务器，本质是一次上传 ⇒ 显示「上传」；
   *   - 同一连接：服务端 `cp` 直传、不过网，没有上/下方向 ⇒ 仍显示「传输」。
   * 取不到端点（断开/未加载）时按「同一连接」处理，保持原「传输」文案，避免误报上传。
   */
  get _ctxPeerSameConnection(): boolean {
    const src = this._paneEndpoint(this.contextMenuPane)
    const dst = this._paneEndpoint(this._ctxPeerPane)
    if (!src || !dst) return true
    return src.connKey === dst.connKey
  }
  /** 当前侧选中集（统一取数，菜单动作复用） */
  private get _ctxSelected(): Array<LocalEntry | SFTPFile> {
    if (this.contextMenuPane === 'remote') return this.selectedRemote
    if (this.contextMenuPane === 'rl') return this._rlSelected
    return this.selectedLocal
  }
  /** 当前侧过滤后条目 */
  private get _ctxFiltered(): Array<LocalEntry | SFTPFile> {
    if (this.contextMenuPane === 'remote') return this.getFilteredRemoteEntries()
    if (this.contextMenuPane === 'rl') return this.getFilteredRlEntries()
    return this.getFilteredLocalEntries()
  }
  /** 当前侧 cwd */
  private get _ctxPath(): string {
    if (this.contextMenuPane === 'remote') return this.remotePath
    if (this.contextMenuPane === 'rl') return this._rlPath
    return this.localPath
  }
  /**
   * 能否上传/下载/传输：两端端点都可用，且不是「两栏指向同一目录」自己传自己。
   * ★ 2026-10-20：原实现 `contextMenuPane !== 'rl' && this.connected` 把「右栏本地」整片禁掉，
   *   而「右栏本机磁盘 + 左栏远程」恰恰最需要「上传」（右栏 → 左栏远端）；
   *   反过来「左栏远程 + 右栏本地」的左栏也需要「下载」。改为按两端端点判定。
   * ★ 同日续：两端同类时显示「传输」（本机↔本机＝跨栏复制、远程↔远程＝服务端直传），
   *   故本机↔本机不再一律 false，只排除「同连接 + 同路径」。
   */
  private get _ctxCanTransfer(): boolean {
    const src = this._paneEndpoint(this.contextMenuPane)
    const dst = this._paneEndpoint(this._ctxPeerPane)
    if (!src || !dst) return false
    // 两栏同一目录（本机同盘同路径 / 同一 SSH 连接同一路径）：传输自己等于空转
    if (src.connKey === dst.connKey && this._sameDirText(src.dir, dst.dir, src.isLocal)) return false
    if (src.isLocal && dst.isLocal) return true
    // 右栏远程端点仍以 connected 为准（断线/连接中时 sftpSession 可能残留，传不了）
    if ((!src.isLocal && src.side === 'remote') || (!dst.isLocal && dst.side === 'remote')) return this.connected
    return true
  }

  /** 模板绑定：当前侧是否单选 */
  get _ctxSingleSelected(): boolean { return this._ctxSelected.length === 1 }
  /** 右键菜单「分组依据」当前值：rl 取独立分组状态，不再与左栏本地串改 */
  get _ctxGroupBy(): string {
    if (this.contextMenuPane === 'rl') return this.rlGroupBy
    return this._ctxIsLocalData ? this.localGroupBy : this.remoteGroupBy
  }
  get _ctxPinFolders(): boolean { return this._ctxIsLocalData ? this.pinFoldersLocal : this.pinFoldersRemote }
  get _ctxShowHidden(): boolean {
    // ★ 2026-10-19 续八：rl 隐藏文件开关独立（_rlShowHidden），菜单勾选态须与 rl 实际一致
    if (this.contextMenuPane === 'rl') return this._rlShowHidden
    return this._ctxIsLocalData ? this.showHiddenLocal : this.showHiddenRemote
  }

  /** 检查当前右键菜单面板是否有选中项 */
  hasContextSelection(): boolean {
    return this._ctxSelected.length > 0
  }

  /** 获取当前上下文的选中项列表 */
  private getContextSelection(): (LocalEntry | SFTPFile)[] {
    return this._ctxSelected
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
    const selected = this._ctxSelected
    const entry = (this.contextMenuEntry as LocalEntry | SFTPFile | null)
      || (selected.length ? selected[0] : null)
    if (!entry) return
    this.detailsEntry = entry
    // ★ 2026-10-20：属性框的「数据形态」按端点判定（不是配置槽位）。左栏切远程后条目是
    //   SFTPFile 形态（modified/mode/owner），若仍按本地读 mtimeMs ⇒ 修改时间列空白、
    //   「计算文件夹大小」也会去扫本机磁盘上不存在的路径。
    this.detailsIsLocal = this._ctxPaneIsLocal
    // 远程侧会话随属性框一起记下：左栏远程端点必须用第二会话扫，不能借右栏主会话
    const detailEp = this._paneEndpoint(this.contextMenuPane)
    this._detailsSession = detailEp && !detailEp.isLocal ? detailEp.sftp : null
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
      const r = isLocal
        ? await this._scanLocalDir(target)
        : await this._scanRemoteDir(target, this._detailsSession ?? undefined)
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
  private async _ensureTransferTargetDir(
    direction: 'upload' | 'download',
    requestedDir: string,
    /**
     * ★ 2026-10-19 P2-13：目标端「物理语义」覆写 + 建目录所用的会话。
     *
     * r2r（左栏为远程端点）下「下载」的 `direction` 仍是 'download'，但目标其实是
     * **左栏远程**的 POSIX 目录 —— 原先一律按「本地」语义 `fs.stat(dir)`，
     * Windows 上 `/home/x` 被解析成 `C:\home\x` ⇒ 必然不存在 ⇒ 每次都弹
     * 「目录不存在」；点「创建」还会在**盘根**建目录（或直接 EPERM）。
     *
     * `direction` 只用来决定「回退目录」（下载回退左栏当前目录，上传回退右栏当前目录），
     * 目标端的 stat / mkdir 语义与会话由本参数显式指定。
     */
    targetRemote?: { session: any } | null,
    /**
     * ★ 2026-10-20：回退目录覆写。默认按 direction 猜（下载回退左栏、上传回退右栏），
     *   但菜单上传/下载改成「右键栏 → 另一栏」后，右栏本机磁盘→左栏远程这条路上
     *   `this.remotePath`（右栏）已经没有意义，回退会拿到空目录。由调用方传目标栏当前目录。
     */
    fallbackOverride?: string,
  ): Promise<string | null> {
    const isRemote = !!targetRemote || direction === 'upload'
    const fallbackDir = fallbackOverride?.trim() || (direction === 'download' ? this.localPath : this.remotePath)
    const dir = requestedDir?.trim() || fallbackDir
    let exists = false
    let isDir = false
    try {
      if (isRemote) {
        // 远程走 statRemotePath（已处理 russh 数字 type / 包装层 stat 差异）
        // ★ 2026-10-19 P2-13：r2r 下目标在**左栏远程会话**上，必须用它去 stat，
        //   用右栏会话（this.sftpSession）查的是另一台机器，照样判成「不存在」。
        const session = (targetRemote?.session ?? this.sftpSession) as SFTPSessionLike | null
        const st = session ? await statRemotePath(session, dir) : null
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
        await this._remoteMkdirp(dir, targetRemote?.session)
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
      this._dirMissingResolvers.push(resolve)
      this._safeDetect()
    })
  }

  /** 目录不存在对话框选择回调（模板绑定） */
  resolveDirMissing(c: 'create' | 'fallback' | 'cancel'): void {
    this.dirMissingVisible = false
    // ★ 2026-10-19 P2-14：一次性 resolve **全部**等待者（并发预检可能排了多个）
    const resolvers = this._dirMissingResolvers
    this._dirMissingResolvers = []
    for (const r of resolvers) {
      try { r(c) } catch { /* 单个等待者抛错不影响其余 */ }
    }
    this._safeDetect()
  }

  /**
   * 远程逐级创建目录（mkdir -p 语义）：逐段 stat，已存在的目录段跳过；
   * 中间段存在但非目录、或最终复核失败均抛错。SFTP 服务端均为 POSIX 路径。
   */
  private async _remoteMkdirp(dir: string, session?: any): Promise<void> {
    // ★ 2026-10-19 P2-13：会话可显式指定 —— r2r（左栏远程端点）下目标在左栏会话上，
    //   若沿用 this.sftpSession（右栏）就会把目录建到**另一台服务器**。
    const sftp = (session ?? this.sftpSession) as SFTPSessionLike | null
    if (!sftp) throw new Error('no sftp session')
    const norm = path.posix.normalize(String(dir).replace(/\/+$/, '') || '/')
    if (!norm || norm === '/') return
    const parts = norm.split('/').filter(Boolean)
    let cur = ''
    for (const seg of parts) {
      cur += '/' + seg
      const st = await statRemotePath(sftp, cur).catch(() => null)
      if (st?.isDirectory) continue
      if (st) throw new Error(`not a directory: ${cur}`)
      await sftp.mkdir(cur)
    }
    const finalSt = await statRemotePath(sftp, norm).catch(() => null)
    if (!finalSt?.isDirectory) throw new Error(`verify failed: ${norm}`)
  }

  /**
   * 右键「上传」＝**右键所在栏（本机磁盘）→ 另一栏（SFTP 远程）**。
   * ★ 2026-10-20：方向由端点决定，不再假定「左栏本地 → 右栏远程」。
   *   经典布局（左栏本机磁盘 + 右栏远程）仍走原链路：TAR 批量打包、冲突对话框、传输队列；
   *   其余组合（右栏本机磁盘 → 左栏远程）走端点直传 —— 原链路把目标写死成
   *   `this.remotePath` / `this.sftpSession`（右栏），在这条路上会传到另一台/另一侧。
   */
  async ctxUpload(): Promise<void> {
    const srcEp = this._paneEndpoint(this.contextMenuPane)
    const dstEp = this._paneEndpoint(this._ctxPeerPane)
    const classicUpload = srcEp?.side === 'local' && srcEp.isLocal && dstEp?.side === 'remote' && !dstEp.isLocal
    if (!classicUpload) { await this._ctxTransferToPeer('upload'); return }
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
    // ★ issue #27 P2：左栏远程端点时源在远程，打包通道基于本地磁盘扫描，故跳过整批打包、走逐项远程↔远程。
    if (this._leftKind !== 'remote' && await this._tryBatchUpload(items.map(e => e.fullPath), uploadDir)) {
      // ★ 2026-10-19（Hy3）：按文件系统刷新（覆盖左栏远程端点 + 右栏远程）
      await this._refreshRemoteFsPanes()
      this._safeDetect()
      return
    }
    await Promise.all(items.map(e => this._streamUploadOne(e.fullPath, uploadDir)))
    await this._refreshRemoteFsPanes()
    this._safeDetect()
  }

  /**
   * 右键「下载」＝**右键所在栏（SFTP 远程）→ 另一栏（本机磁盘 / 另一台远程）**。
   * ★ 2026-10-20：方向由端点决定。经典布局（源＝右栏远程）保留原链路（传输队列 + 冲突框）；
   *   左栏切远程端点后源变成左栏，原链路会把 `this.selectedRemote` / `this.remotePath`
   *   （右栏）当成源，下载出来的是另一栏的内容，故改走端点直传。
   */
  async ctxDownload(): Promise<void> {
    if (this.contextMenuPane !== 'remote') { await this._ctxTransferToPeer('download'); return }
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
    // ★ 2026-10-19 P2-13：左栏为远程端点时「下载」= 右栏远程 → **左栏远程**（r2r），
    //   目标目录是 POSIX 路径，预检必须按远程语义走，并用左栏会话去 stat / mkdir。
    //   此前一律按本地语义（fs.stat）⇒ Windows 上把 /home/x 解析成 C:\home\x，
    //   必然判成「不存在」；点「创建」还会在盘根建目录或 EPERM。
    const downloadDir = await this._ensureTransferTargetDir(
      'download',
      requestedDownloadDir,
      this._leftKind === 'remote' ? { session: this._leftSftpSession } : null,
    )
    if (!downloadDir) return
    await Promise.all(items.map(p => this._streamDownloadOne(p, downloadDir)))
    if (this._conflictQueue.length) this._showConflictDialog()
    // ★ 2026-08-11：与上传对称——下载完成后自动刷新本地面板（拖拽路径在 drop.ts 已刷新，
    //   菜单路径此前漏刷；冲突分支由冲突解决器 refreshPanes 兼顾）
    // ★ 2026-10-19（Hy3）：按文件系统刷新。下载目标可能是本机磁盘（左栏本地 / 右栏本地 rl），
    //   也可能是左栏远程端点（r2r）。原先一律 refreshLocal()，右栏本地时刷的是左栏、左栏远程时
    //   刷到的是错误侧 —— 两栏都得手动 F5。
    if (this._leftKind === 'remote') await this._refreshRemoteFsPanes()
    else await this._refreshLocalFsPanes()
    this._safeDetect()
  }

  /**
   * 端点直传：把**右键所在栏**的选中项传到**另一栏**（上传/下载/传输共用）。
   *
   * ★ 2026-10-20：菜单项已按端点显示（左栏远程→「下载」、右栏本机磁盘→「上传」），但
   *   动作实现此前仍假定「上传＝左栏本地→右栏远程、下载＝右栏远程→左栏本地」。非经典布局
   *   必须走这里，否则「左栏远程 → 下载」会去取右栏（本机磁盘）的选中集，
   *   「右栏本机磁盘 → 上传」会把右栏条目当成左栏本机路径去读。
   *
   * ★ 同日续：两端同类时没有方向（kind = 'transfer'）——本机↔本机走 `_ctxCopyToPeerLocal`
   *   跨栏复制（`copyLocalDir` / `fs.copyFile`，已存在跳过）。
   *
   * ★ 同日续二（用户反馈）：远程↔远程的「传输」此前走 `_transferBetweenEndpoints` 裸通道 ⇒
   *   **没有传输记录、没有进度条目、目标已存在时静默跳过（不弹冲突框）**。现改走
   *   `_streamUploadOneRemote` / `_streamDownloadOneRemote` —— 与拖拽、粘贴共用同一条 r2r 通道，
   *   自带「服务端 cp 快路径 → 流式队列」「remote-copy 日志」「r2r 冲突项（覆盖/跳过/重命名）」。
   *
   * 冲突策略：本机↔远程的经典方向仍走 `_transferBetweenEndpoints`，但目标已存在时不再静默跳过 ——
   *   ★ 2026-10-20（冲突执行体端点化）起改为入队覆盖/跳过/重命名，由 `_doEndpointTransfer` 按端点执行
   *   （此前执行体只认主会话，涉及左栏远程端点的组合会打到错误的连接，所以只能跳过）。
   *   远程↔远程的方向由 r2r 冲突项携带两端会话，走 `_streamXxxRemote` 通道。
   */
  private async _ctxTransferToPeer(kind: 'upload' | 'download' | 'transfer'): Promise<void> {
    const srcEp = this._paneEndpoint(this.contextMenuPane)
    const dstEp = this._paneEndpoint(this._ctxPeerPane)
    // 方向必须在 closeContextMenu() 之前记录（该方法目前只清 visible/entry，但别依赖这个细节）
    const fromRightPane = this.contextMenuPane === 'remote'
    this.closeContextMenu()
    if (!srcEp || !dstEp) {
      // 传输没有方向语义，两端缺一样板地报「未连接上传」——这里给中性文案
      this.showToast(this.i18n.t(kind === 'download' ? 'notify.notConnectedDownload' : 'notify.notConnectedUpload'))
      return
    }
    if (srcEp.isLocal && dstEp.isLocal) { await this._ctxCopyToPeerLocal(dstEp); return }
    const items = this.getContextSelection()
    if (!items.length) return
    // 目标目录：默认路径只在「方向与落点 FS 匹配」时使用（上传默认=远程目录、下载默认=本机目录）；
    // 远程↔远程没有方向（★ 2026-10-21 起菜单文案显示「上传」，但语义仍是「推到另一栏」），
    // 只认另一栏当前目录 —— 否则会拿「默认上传路径」当落点，文件落到用户没预期的远端目录。
    const bothRemote = !srcEp.isLocal && !dstEp.isLocal
    const requestedDir =
      bothRemote ? dstEp.dir
        : kind === 'upload' && !dstEp.isLocal ? (this._defaultUploadPath || dstEp.dir)
          : kind === 'download' && dstEp.isLocal ? (this._defaultDownloadPath || dstEp.dir)
            : dstEp.dir
    const targetDir = await this._ensureTransferTargetDir(
      dstEp.isLocal ? 'download' : 'upload',
      requestedDir,
      dstEp.isLocal ? null : { session: dstEp.sftp },
      dstEp.dir,
    )
    if (!targetDir) return

    // ★ 远程↔远程：复用 r2r 通道（冲突框 + 传输记录 + 进度条目）。方向由「右键在哪一栏」决定：
    //   右键在右栏 → 右栏远程 → 左栏远程；右键在左栏 → 左栏远程 → 右栏远程。
    if (!srcEp.isLocal && !dstEp.isLocal) {
      for (const e of items) {
        if (fromRightPane) await this._streamDownloadOneRemote(e as any, targetDir)
        else await this._streamUploadOneRemote((e as any).fullPath, targetDir)
      }
      // 冲突项在遍历中入队，循环结束后统一弹框（与 drop.ts 各分支一致）
      if (this._conflictQueue.length) this._showConflictDialog()
      await this._refreshRemoteFsPanes()
      this._safeDetect()
      return
    }

    let ok = true
    for (const e of items) {
      // 名字净化按**落点**语义选：落到本机磁盘才套 Windows 落地规则
      const safeName = dstEp.isLocal ? safeEntryName(e.name) : safeRemoteEntryName(e.name)
      if (!safeName) { log.warn('[ctx-transfer] skip unsafe entry name:', e.name); continue }
      const dstChild = this._epJoin(dstEp, targetDir, safeName)
      // ★ 2026-10-20：目标已存在 ⇒ 入队端点化冲突（覆盖/跳过/重命名），不再静默跳过计数
      const dstStat = await this._epStatEntry(dstEp, dstChild)
      if (dstStat.exists) {
        this._enqueueEndpointConflict({
          srcEp, dstEp,
          entry: {
            name: e.name, fullPath: (e as any).fullPath, isDirectory: e.isDirectory,
            mode: (e as any).mode, size: (e as any).size,
            mtimeMs: (e as any).mtimeMs ?? ((e as any).modified ? new Date((e as any).modified).getTime() : undefined),
          },
          dstPath: dstChild, dstStat, mode: 'copy',
        })
        continue
      }
      if (!await this._transferBetweenEndpoints(srcEp, e as any, dstEp, dstChild)) ok = false
    }
    if (srcEp.isLocal || dstEp.isLocal) await this._refreshLocalFsPanes()
    if (!srcEp.isLocal || !dstEp.isLocal) await this._refreshRemoteFsPanes()
    this._safeDetect()
    if (this._conflictQueue.length) this._showConflictDialog()
    if (!ok) {
      const failKey = kind === 'upload' ? 'notify.uploadFailed'
        : kind === 'download' ? 'notify.downloadFailed' : 'notify.transferFailed'
      this.showToast(this.i18n.t(failKey), 4000)
    }
  }

  /**
   * 「传输」的两栏都是本机磁盘时＝**跨栏复制到另一栏**（目标已存在则跳过）。
   *
   * 为什么不复用粘贴适配器：它只接受 'local' / 'remote' 二值语义（假定 local=左栏、
   *   remote=右栏），而这里落点来自 `_paneEndpoint`——可能是右栏本地面板（rl），
   *   也可能两栏同为本机但指向不同盘/目录。刷新与跳过提示也按端点自行处理。
   */
  private async _ctxCopyToPeerLocal(dstEp: PaneEndpoint): Promise<void> {
    const items = this.getContextSelection() as LocalEntry[]
    if (!items.length) return
    const targetDir = await this._ensureTransferTargetDir('download', dstEp.dir, null, dstEp.dir)
    if (!targetDir) return
    let ok = true
    let skipped = 0
    for (const e of items) {
      const t0 = Date.now()
      try {
        const safeName = safeEntryName(e.name)
        if (!safeName) { log.warn('[ctx-transfer] skip unsafe entry name:', e.name); continue }
        const dstChild = this._epJoin(dstEp, targetDir, safeName)
        // 自我拷贝守卫：源与落点同一路径时 fs.copyFile 会先截断再读（文件变空白）、
        // copyLocalDir 会无限递归 —— 上游已排除「两栏同目录」，这里再挡一次逐项重叠
        if (this._sameDirText(e.fullPath, dstChild, true)) { skipped++; continue }
        // ★ 2026-10-20：本机↔本机仍保持「目标已存在即跳过」——两端同为本地时，冲突对话框的
        //   「本地文件 / 远程文件」两栏标题与上传/下载方向徽章都不成立（要改文案得动对话框语义），
        //   而这条路径本来就有「已跳过 N 项」提示，收益不足以承担该风险。
        const existing = await this._epEntryExists(dstEp, targetDir, safeName)
        if (existing.exists) { skipped++; continue }
        if (e.isDirectory) await copyLocalDir(e.fullPath, dstChild)
        else await fs.copyFile(e.fullPath, dstChild)
        // ★ 2026-10-20：「本机↔本机」也是互传的一种 —— 记录 local-copy。
        //   该类型与日志对话框的渲染早已存在，但此前**没有任何写入点**（日志里永远看不到本地复制）。
        this.transferLog.add({
          operation: 'local-copy',
          localPath: e.fullPath,
          remotePath: dstChild,
          srcPath: e.fullPath,
          dstPath: dstChild,
          srcHostLabel: this.i18n.t('pane.local'),
          dstHostLabel: this.i18n.t('pane.local'),
          success: true,
          size: e.isDirectory ? undefined : (e as any).size,
          duration: Date.now() - t0,
          startTime: t0,
          pending: false,
        })
      } catch (err) {
        log.error('[ctx-transfer] local copy failed:', e.name, err)
        ok = false
        this.transferLog.add({
          operation: 'local-copy',
          localPath: e.fullPath,
          remotePath: this._epJoin(dstEp, targetDir, safeEntryName(e.name) ?? e.name),
          srcPath: e.fullPath,
          dstPath: this._epJoin(dstEp, targetDir, safeEntryName(e.name) ?? e.name),
          srcHostLabel: this.i18n.t('pane.local'),
          dstHostLabel: this.i18n.t('pane.local'),
          success: false,
          error: String((err as any)?.message ?? err),
          duration: Date.now() - t0,
          startTime: t0,
          pending: false,
        })
      }
    }
    await this._refreshLocalFsPanes()
    this._safeDetect()
    if (skipped > 0) this.showToast(this.i18n.t('notify.pasteSkippedExists', { n: skipped }), 4000)
    if (!ok) this.showToast(this.i18n.t('notify.transferFailed'), 4000)
  }

  /**
   * 右键「传输」＝**右键所在栏 → 另一栏**，用于两端端点同类的情况：
   *   本机↔本机（跨盘/跨目录复制）、远程↔远程（服务端 cp，失败回退内存流式）。
   *   两端异类时菜单显示的是「上传」/「下载」，不会走到这里。
   */
  async ctxTransfer(): Promise<void> {
    await this._ctxTransferToPeer('transfer')
  }

  // ========== 下载队列调度（多选拖拽/菜单下载） ==========

  /** 同时进行中的下载数上限（设置页可改，1-10），避免一次拖入大量文件时打开过多 SFTP 读流 */
  private _downloadConcurrency = 3
  private _dlActiveCount = 0
  private _dlQueue: Array<{
    file: SFTPFile; entry: PanelTransferItem; finish: () => void
    /** ★ issue #27 P2：远程↔远程（左栏远程端点时，下载目标为左栏远程会话） */
    r2r?: boolean; srcPath?: string; dstPath?: string; srcSession?: any; dstSession?: any; isDir?: boolean; mode?: number
  }> = []

  /**
   * 边下载边检测冲突：无冲突立即传输，有冲突入队等待用户处理。
   * ★ 2026-08-10：调用时先预注册 queued 占位条目，多选/拖拽的全部文件立即出现在
   *   传输列表中；真正开始传输时由 trackTransfer/_startFolderTransfer 认领占位条目，
   *   并发由 _downloadConcurrency 限制。
   */
  private _streamDownloadOne(p: SFTPFile, targetLocalDir?: string): Promise<void> {
    // ★ issue #27 P2：左栏远程端点 → 下载目标是左栏远程会话（右栏远程 → 左栏远程）
    if (this._leftKind === 'remote') {
      // r2r 通道回传的是「是否真的传成功」，本包装按旧签名吞掉（调用方不需要）
      return this._streamDownloadOneRemote(p, targetLocalDir).then(() => undefined)
    }
    // ★ 2026-10-19 P1 修复：远端合法文件名不再被静默丢弃。原先只用 safeEntryName
    //   （Windows 落地规则）——CON.txt、'a\b'、尾随空格等 Linux 合法名直接 log.warn +
    //   return，无条目、无 toast、无日志记录，文件凭空消失（下载 100 个本地只有 97 个）。
    //   与 DownloadOneUseCase/transfer-ops 对齐：safeEntryName 通过 ⇒ 原名落地；
    //   不通过 ⇒ localEntryName 转写（全角对应字符）落地并记 info 日志。
    const safeName = safeEntryName(p.name) ?? localEntryName(p.name)
    if (safeName !== p.name) {
      log.info(`[download] remote entry name rewritten for local FS: ${JSON.stringify(p.name)} -> ${JSON.stringify(safeName)}`)
    }
    if (!safeName) {
      log.warn('skip download with unsafe name:', p.name)
      return Promise.resolve()
    }
    // 默认下载路径优先；未设置则回退当前本地目录（保证右键/拖拽/旧API 统一走默认路径）
    const localDir = (targetLocalDir?.trim()) || this._defaultDownloadPath || this.localPath
    const localTarget = path.join(localDir, safeName)
    // ★ 2026-10-19 P1 修复：单文件下载补重复入队预检（目录下载 downloadRemoteDir 与上传侧
    //   早有，唯独单文件下载漏修）。同一文件短时间内两次下载会都通过冲突预检、并发双流
    //   写同一 .tmp ⇒ 交叉写坏或双失败。协调器侧同步补了槽位认领（streamDownloadOne），
    //   这里提前查一次，避免生成第二条幽灵队列条目。
    if (this._blockDuplicateTransfer('download', p.fullPath, localTarget, safeName)) {
      return Promise.resolve()
    }
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
    // ★ 2026-10-13 P1 修复：新排队条目创建时清除同键的旧粘性取消标记——
    //   否则「取消排队条目后 10s 内对同一路径重新发起」会被旧标记拦截、静默 abort
    //   （无条目、无提示）。旧标记只为 abort「已过调度检查、认领前被取消」的那一个
    //   任务，窗口是微秒级，用户不可能在同一窗口内先取消再重发。
    try { this._transferRuntime.clearQueuedCancel('download', localTarget, p.fullPath) } catch { /* ignore */ }
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

  /**
   * ★ issue #27 P3：远程↔远程拖拽前冲突检测。若目标侧（dstSession）已存在同名路径，
   * 入队一个带 r2rTransfer 凭据的冲突项，由冲突框弹出覆盖/跳过/重命名；用户选覆盖/重命名后
   * 由 resolver 的 doR2rTransfer 端口执行 r2r 复制（不走协调器 / 常规上传下载语义）。
   * 返回 true 表示已入队冲突（调用方应放弃直接传输），false 表示目标不存在可直传。
   * 仅在与 r2r 相关的入口（_streamUploadOneRemote / _streamDownloadOneRemote）调用。
   */
  private async _enqueueR2rConflictIfNeeded(args: {
    srcSession: any; dstSession: any; srcPath: string; dstPath: string;
    isDir: boolean; mode?: number; srcHostLabel?: string; dstHostLabel?: string;
    srcSize?: number; srcMtime?: number;
  }): Promise<boolean> {
    const { srcSession, dstSession, srcPath, dstPath, isDir, mode, srcHostLabel, dstHostLabel, srcSize, srcMtime } = args
    if (!dstSession) return false
    // 探测目标是否存在 + 取大小 / mtime（用于冲突框展示）——目标不存在则不冲突，直传
    let dstSize: number | undefined
    let dstMtime: number | undefined
    try {
      const st = dstSession.stat?.(dstPath)
      const resolved = st && typeof (st as any).then === 'function' ? await (st as Promise<any>) : st
      if (!resolved) return false
      dstSize = (resolved.size ?? resolved.attrs?.size) || undefined
      const m = resolved.modified ?? resolved.mtime ?? resolved.mtimeMs ?? resolved.attrs?.modified ?? resolved.attrs?.mtime
      if (m != null) {
        const n = (m instanceof Date) ? m.getTime() : Number(m)
        if (Number.isFinite(n) && n > 0) dstMtime = n < 1e10 ? n * 1000 : n
      }
    } catch {
      // stat 失败：保守按「不存在」处理，直接传输（实际覆盖 / 重命名由底层通道反馈）
      return false
    }
    const item = {
      localPath: srcPath,          // 源（对话框「本地」侧）
      remotePath: dstPath,         // 目标（对话框「远程」侧）
      remoteDir: path.posix.dirname(dstPath),
      fileName: path.posix.basename(dstPath),
      localStat: (({ size: srcSize ?? 0, mtimeMs: srcMtime ?? 0 }) as any) as unknown as fsSync.Stats,
      remoteFileSize: dstSize,
      remoteFileMtime: dstMtime,
      direction: 'upload' as const, // 占位；applyAction 优先走 r2r 分支
      isDirectory: isDir,
      r2rTransfer: { srcSession, dstSession, isDir, mode, srcHostLabel, dstHostLabel },
    }
    this._conflictQueue.push(item)
    this.conflictOriginalTotal = Math.max(this.conflictOriginalTotal, this._conflictQueue.length)
    return true
  }

  /**
   * ★ issue #27 P2：左栏远程端点下的「下载」= 右栏远程 → 左栏远程（内存流式）。
   * 源是右栏远程文件 p.fullPath；目标是左栏远程当前目录（localPath 此时承载左远程路径）。
   */
  private async _streamDownloadOneRemote(p: SFTPFile, targetLocalDir?: string): Promise<boolean> {
    // ★ 2026-10-19 P1 修复：本分支目标是**左栏远程 POSIX 目录**，文件名最终落在远端
    //   文件系统上——套用 Windows 落地规则（safeEntryName）会把 CON.txt、'a\b'、尾随
    //   空格等 Linux 合法名静默跳过。改用 safeRemoteEntryName（只防路径穿越/控制字符）。
    const safeName = safeRemoteEntryName(p.name)
    if (!safeName) {
      log.warn('skip download (remote dst) with unsafe name:', p.name)
      return false
    }
    // 左栏远程：localPath 即左栏远程当前目录（POSIX）
    const localDir = (targetLocalDir?.trim()) || this.localPath
    const localTarget = path.posix.join(localDir, safeName)
    // ★ issue #27 P3：拖拽前先探测目标（左栏远程）是否已存在同名路径，存在则入队 r2r 冲突
    // （覆盖/跳过/重命名），避免静默覆盖；目标不存在才走实际传输。
    if (await this._enqueueR2rConflictIfNeeded({
      srcSession: this.sftpSession, dstSession: this._leftSftpSession,
      srcPath: p.fullPath, dstPath: localTarget,
      isDir: !!p.isDirectory, mode: (p as any).mode,
      srcHostLabel: this.hostInfo || undefined, dstHostLabel: this._leftHostLabel || undefined,
      srcSize: p.size, srcMtime: (p as any).modified,
    })) {
      // 冲突已入队 ⇒ 本次没有实际传输（剪切粘贴据此保留源文件，等待用户在冲突框里决定）
      return false
    }
    // ★ issue #27 P3：同服务器先试服务端 cp（数据不经外网绕行本机）；不适用/失败落回既有流式通道
    const t0 = Date.now()
    if (await this._tryServerSideCopyForR2R(p.fullPath, localTarget, p.isDirectory)) {
      this.transferLog.add({
        operation: 'remote-copy',
        localPath: localTarget,
        remotePath: p.fullPath,
        srcPath: p.fullPath,
        dstPath: localTarget,
        srcHostLabel: this.hostInfo || undefined,
        dstHostLabel: this._leftHostLabel || undefined,
        profileName: this.profile?.name || undefined,
        success: true,
        size: p.size ?? 0,
        duration: Date.now() - t0,
        startTime: t0,
        pending: false,
      })
      this._safeDetect()
      return true
    }
    const logEntry = this.transferLog.add({
      operation: 'remote-copy',
      localPath: localTarget,
      remotePath: p.fullPath,
      // ★ issue #27：远程↔远程（右栏远程 → 左栏远程）无上传/下载之分；记录两端完整路径与主机标签
      srcPath: p.fullPath,
      dstPath: localTarget,
      srcHostLabel: this.hostInfo || undefined,
      dstHostLabel: this._leftHostLabel || undefined,
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
    try { this._transferRuntime.clearQueuedCancel('download', localTarget, p.fullPath) } catch { /* ignore */ }
    this.transfers.push(entry)
    this.transfersMinimized = false
    this.transfersHidden = false
    this._safeDetect()
    return new Promise<boolean>((resolve) => {
      const finish = () => {
        if (entry.queued && this.transfers.includes(entry)) {
          if (entry.skippedAsDuplicate) {
            entry.queued = false
            entry.percent = 100
            entry.speed = ''
            this._scheduleQueuedEntryRemoval(entry)
          } else {
            this._removeQueuedEntry(entry)
          }
        }
        // ★ 2026-10-20：回传真实成败 —— 剪切粘贴要靠它决定是否删源（未成功删源=数据丢失）。
        //   取消时条目会被移除但 failed 仍为 false，故以 percent 是否真正到 100 作为完成判据。
        resolve(!entry.failed && entry.percent >= 100)
      }
      this._dlQueue.push({
        file: p, entry, finish,
        r2r: true, srcPath: p.fullPath, dstPath: localTarget,
        srcSession: this.sftpSession, dstSession: this._leftSftpSession,
        isDir: p.isDirectory, mode: (p as any).mode,
      })
      this._pumpDownloadQueue()
    })
  }

  /**
   * ★ 2026-10-20（用户反馈）：远程条目拖到**另一栏的远程端点**（远程↔远程拖拽）。
   *
   * 此前 drop 只认「左栏本地」，左栏切远程后一律被守卫拒绝并提示「暂不支持拖放到此」——
   * 而右键菜单的「传输」已经能完成同一件事，两条入口行为不一致。
   * 现逐项复用 `_streamUploadOneRemote` / `_streamDownloadOneRemote`：与右键「传输」、粘贴
   * 共用同一条 r2r 通道，目标已存在时入队冲突项（覆盖 / 跳过 / 重命名），实际传输写
   * remote-copy 记录并进传输列表。方向由**目标栏**决定（源恒为另一栏）。
   */
  private async _dropRemoteToRemoteEndpoint(
    entries: Array<{ remotePath: string; name: string; isDirectory: boolean; size?: number; mode?: number; modified?: number }>,
    destDir: string,
    destPane: 'left' | 'right',
  ): Promise<boolean> {
    // ★ 2026-10-20 全量审计 P2：原实现丢弃每个 `_streamXxxRemote` 的返回值并恒 return true
    //   ⇒ 逐项失败被完全吞掉：用户拖过去什么也没发生、没有任何提示。
    //   注意 `_streamXxxRemote` 返回 false 有两种含义，必须分开：目标已存在时它**入队冲突项**
    //   后返回 false（不是失败，后续会弹框）；只有「队列长度没变」才是真的失败。
    let failed = 0
    for (const e of entries) {
      const conflictBefore = this._conflictQueue.length
      let ok = false
      if (destPane === 'left') {
        // 目标=左栏远程 ⇒ 源=右栏远程（主会话）
        const file = {
          name: e.name,
          fullPath: e.remotePath,
          isDirectory: e.isDirectory,
          size: e.size ?? 0,
          mode: e.mode,
          modified: e.modified,
        } as unknown as SFTPFile
        ok = await this._streamDownloadOneRemote(file, destDir)
      } else {
        // 目标=右栏远程 ⇒ 源=左栏远程（左栏会话）
        ok = await this._streamUploadOneRemote(e.remotePath, destDir)
      }
      if (!ok && this._conflictQueue.length === conflictBefore) failed++
    }
    // 冲突项在遍历中入队，循环结束后统一弹框（与 drop.ts 各分支一致）
    if (this._conflictQueue.length) this._showConflictDialog()
    await this._refreshRemoteFsPanes()
    this._safeDetect()
    // 返回值语义是「这次拖放已由 r2r 通道接管」——即使有失败项也不能让上游回落到
    // 「暂不支持拖放到此」，改为明确告知用户有几项没成功。
    if (failed > 0) {
      log.warn('[drop] remote→remote had failures:', destDir, failed)
      this.showTopNotification(this.i18n.t('notify.remoteToRemoteFailed'))
    }
    return true
  }

  /**
   * ★ 2026-10-20（用户诉求，冲突执行体端点化后解锁）：**本机条目拖到左栏远程端点**＝上传。
   *
   * 此前 drop.ts 只对「远程条目→左栏远程」实现了端口，本机条目那条分支没有实现，走的是
   * 「显式拒绝 + 暂不支持」提示。冲突执行体端点化后，目标已存在也能正常弹「覆盖/跳过/重命名」，
   * 于是这里按端点通道真正上传（与右键「上传」共用 `_transferBetweenEndpoints` 底层）。
   */
  private async _dropLocalToRemoteEndpoint(localPaths: string[], destDir: string): Promise<boolean> {
    const dstEp = this._paneEndpoint('local')
    if (!dstEp || dstEp.isLocal) return false
    // 源侧是本机磁盘（拖拽 payload 的 local-paths 恒来自本机文件系统）
    const srcEp: PaneEndpoint = { side: 'rl', isLocal: true, dir: '', sftp: null, ssh: null, connKey: 'local' }
    let ok = true
    for (const p of localPaths) {
      const base = path.basename(p)
      const name = safeRemoteEntryName(base)
      if (!name) { log.warn('[drop] skip unsafe name on upload:', base); ok = false; continue }
      let st: { size: number; mtimeMs: number; isDirectory: boolean }
      try {
        const s = await fs.stat(p)
        st = { size: s.size, mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() }
      } catch (e) {
        log.warn('[drop] stat local source failed:', p, e)
        ok = false
        continue
      }
      const dstChild = path.posix.join(destDir, name)
      const dstStat = await this._epStatEntry(dstEp, dstChild)
      if (dstStat.exists) {
        // 目标已存在 ⇒ 入队端点化冲突，用户点「覆盖/重命名」后由 _doEndpointTransfer 落地
        this._enqueueEndpointConflict({
          srcEp, dstEp, entry: { name, fullPath: p, ...st }, dstPath: dstChild, dstStat, mode: 'copy',
        })
        continue
      }
      if (!await this._transferBetweenEndpoints(srcEp, { name, fullPath: p, ...st }, dstEp, dstChild)) ok = false
    }
    if (this._conflictQueue.length) this._showConflictDialog()
    await this._refreshRemoteFsPanes()
    this._safeDetect()
    // 返回值语义是「这次拖放已由端点通道处理」——逐项失败只记日志，别让上游落到
    // 「暂不支持拖放到此」的兜底提示（那是误导）
    if (!ok) log.warn('[drop] upload to left remote endpoint had failures:', destDir)
    return true
  }

  /**
   * ★ issue #27 P2：远程↔远程实际传输执行体（上传/下载队列泵共用）。
   * 源/目标会话已由入队时按方向填好（上传：src=左栏远程、dst=右栏远程；下载反之）。
   * 目录走 transferRemoteDirToRemote，文件走 transferRemoteToRemoteFile；进度回调刷新条目。
   */
  private async _doRemoteToRemoteTransfer(item: {
    srcPath: string; dstPath: string; srcSession: any; dstSession: any; isDir?: boolean; mode?: number; entry: PanelTransferItem
  }): Promise<void> {
    const entry = item.entry
    const startTime = Date.now()
    try {
      entry.queued = false
      // 总量未知（stat 失败）时兜底：用进度回调的实际字节回填日志 size
      let lastBytes = 0
      const onProgress = (bytes: number) => {
        entry.bytesDone = bytes
        entry.percent = entry.bytesTotal > 0 ? Math.min(100, bytes / entry.bytesTotal * 100) : 0
        lastBytes = bytes
        this._safeDetect()
      }
      let ok = true
      if (item.isDir) {
        ok = await transferRemoteDirToRemote(item.srcSession, item.srcPath, item.dstSession, item.dstPath, { onProgress })
      } else {
        ok = await transferRemoteToRemoteFile(
          item.srcSession, item.srcPath, item.dstSession, item.dstPath,
          { size: entry.bytesTotal > 0 ? entry.bytesTotal : undefined, mode: item.mode, onProgress },
        )
      }
      entry.bytesDone = entry.bytesTotal > 0 ? entry.bytesTotal : lastBytes
      entry.percent = 100
      if (!ok) { entry.failed = true }
      // ★ issue #27 P2 修复：r2r 不经过协调器 ⇒ 完成后必须自己收口——日志条目翻终态
      //   （此前永远停在 pending「传输中」）+ 传输条目移出列表（对齐协调器单文件完成语义）
      this._finalizeR2REntry(entry, ok, startTime)
    } catch (e) {
      log.error('[r2r] transfer failed:', item.srcPath, e)
      entry.failed = true
      this._finalizeR2REntry(entry, false, startTime)
    }
  }

  /** ★ issue #27 P2：r2r 条目收口——日志终态 + 移出传输列表（镜像 transfer-coordinator 完成分支） */
  private _finalizeR2REntry(entry: PanelTransferItem, success: boolean, startTime: number): void {
    const now = Date.now()
    if (entry.logEntryId != null) {
      const patch: Record<string, unknown> = {
        success,
        duration: now - startTime,
        endTime: now,
        pending: false,
        transferMode: 'sftp',
      }
      if (!success) patch.failReason = 'error'
      // 兜底：总量未知时用实际已传字节回填 size（与 _finishFolderTransfer 同款）
      if (!(entry.bytesTotal > 0) && entry.bytesDone > 0) patch.size = entry.bytesDone
      try { this.transferLog.update(entry.logEntryId, patch) } catch (e) { log.warn('[r2r] finalize log failed:', e) }
    }
    if (this.transfers.includes(entry)) {
      this.transfers = this.transfers.filter(x => x !== entry)
    }
    this._safeDetect()
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
    item: {
      file: SFTPFile; entry: PanelTransferItem; finish: () => void
      /** ★ issue #27 P2：远程↔远程标记与源/目标会话 */
      r2r?: boolean; srcPath?: string; dstPath?: string; srcSession?: any; dstSession?: any; isDir?: boolean; mode?: number
    },
  ): Promise<void> {
    try {
      // 条目可能在排队期间被用户取消/清空 ⇒ 不再执行
      if (this.transfers.includes(item.entry)) {
        if (item.r2r) {
          // ★ issue #27 P2：左栏远程端点 → 远程↔远程（内存流式）
          await this._doRemoteToRemoteTransfer({
            srcPath: item.srcPath!, dstPath: item.dstPath!,
            srcSession: item.srcSession!, dstSession: item.dstSession!,
            isDir: item.isDir, mode: item.mode, entry: item.entry,
          })
        } else {
          // ★ 2026-08-24：从 entry.localPath 提取目标目录传给执行层（修复右键下载默认路径不生效：
          //   ctxDownload 正确计算了 downloadDir 但此前 streamDownloadOne 只传 file 未传目标 dir，
          //   导致 DownloadOneUseCase.execute 回退到 host.localPath 即当前面板目录）
          const targetDir = item.entry.localPath ? path.dirname(item.entry.localPath) : undefined
          await this._transferCoordinator.streamDownloadOne(item.file, targetDir)
        }
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
  /**
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：跨栏拖拽的落点是否**只认目标栏当前目录**（默认开）。
   *   开：指针压在文件夹行上也不改变投递目标 ⇒ 不会出现「文件被静默吞进 B 栏某个子目录」。
   *   关：旧行为（压在文件夹行上就进那个文件夹），此时拖拽期间该行会高亮并标注去向。
   *   ⚠ 只作用于跨栏 / 系统资源管理器拖入；**同栏内**拖到子文件夹不受影响（那是复制到该目录的
   *     通用手势，不是「传输」）。
   *   缓存成字段而非每次现读配置：_updateDropFolderHint 在 dragover（每帧触发）里要用它。
   */
  private _dropToCurrentDirOnly = true
  /** 当前被标注为「放入此文件夹」的文件夹行（dragover 里按元素变化才动 DOM） */
  private _dropHintEl: HTMLElement | null = null
  /* ------------------------------------------------------------------ *
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动（接收侧）
   *   两个插件是独立 bundle、互不 import ⇒ 靠 window 事件通信（契约见 core/quickcmd-link.ts）：
   *   QuickCmd+ 执行完命令只广播「我发了命令」，本面板自己决定听不听（设置项 refreshOnQuickCmd）。
   *   ⛔ 为什么不「收到就刷一次」：QuickCmd+ 只把文本写进 pty，拿不到远端命令结束信号
   *      （备份数据库可能要跑几十秒）⇒ 改为观察期轮询，列表稳定/超时才停。
   * ------------------------------------------------------------------ */
  /** 是否接收 QuickCmd+ 的刷新请求（配置 refreshOnQuickCmd，缺省关） */
  private _refreshOnQuickCmd = false
  /** 观察期基础时长（毫秒），来自配置 refreshOnQuickCmdWindow（秒） */
  private _refreshOnQuickCmdWindowMs = 10000
  /** 观察期执行器：一栏一份，重复请求重置而不叠加定时器 */
  private _qcObserver: QcRefreshObserver | null = null
  /** window 事件监听引用（ngOnDestroy 必须摘，否则强引用整个面板） */
  private _qcRefreshHandler: ((ev: Event) => void) | null = null
  /* ------------------------------------------------------------------ *
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新列表（配置 autoRefreshEnabled / autoRefreshInterval）
   * ------------------------------------------------------------------ */
  /** 是否开启定时刷新（缺键按「关」） */
  private _autoRefreshEnabled = false
  /** 定时刷新间隔（毫秒），来自配置 autoRefreshInterval（秒，5–3600） */
  private _autoRefreshIntervalMs = 60000
  /** 定时器句柄（销毁/关开关/改间隔都要清） */
  private _autoRefreshTimer: ReturnType<typeof setInterval> | null = null
  /** 上一轮还没返回 ⇒ 跳过本轮（慢连接下不并发压 readdir） */
  private _autoRefreshBusy = false
  /** 定时刷新期间抑制列表闪烁（与 _suppressPaneFlash 分开：后者由恢复/切换流程持有，不能互相覆盖） */
  private _autoRefreshQuiet = false
  /** 列表刷新闪烁开关（配置 listRefreshFlash，缺键按「开」）：用户可在「功能性」分区关闭 */
  private _flashEnabled = true
  /** 面板侧摘要服务（粘贴冲突框补算）；配置变更时重建 */
  private _panelDigestSvc: ContentDigestService | null = null
  private _panelDigestSvcKey = ''
  private _upActiveCount = 0
  private _upQueue: Array<{
    localPath: string; entry: PanelTransferItem; finish: () => void; remoteDir: string
    /** ★ issue #27 P2：远程↔远程（左栏远程端点时，上传源为左栏远程会话） */
    r2r?: boolean; srcPath?: string; dstPath?: string; srcSession?: any; dstSession?: any; isDir?: boolean; mode?: number
  }> = []

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
    /** ★ 端点化冲突时传入源端/目标端的 SSH 会话，用于非面板主会话的远端摘要计算 */
    srcSession?: any
    dstSession?: any
    /**
     * ★ 2026-10-20 全量审计：`localPath` / `remotePath` 两侧**各自**是否在远端。
     *   原先只靠 `samePaneSource` 一个值同时决定两侧通道，它只能表达「两端同侧」，
     *   表达不了端点化冲突里最常见的「源在远程、目标在本机」（左栏远程 → 本机磁盘）：
     *   hashTarget 需要 remote、hashSource 需要 local，一个枚举值给不出这对组合 ⇒
     *   两侧摘要恒为 null，对话框双列都显示「—」，「内容相同自动跳过」也永远不生效。
     *   未显式传入时仍按 samePaneSource 推导，兼容既有同栏/经典路径（行为不变）。
     */
    localSideRemote?: boolean
    remoteSideRemote?: boolean
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
    // ★ 2026-10-20 全量审计：两侧通道各自判定（缺省值等价于原 samePaneSource 推导，行为不变）
    const localSideRemote = args.localSideRemote ?? (samePaneSource === 'remote')
    const remoteSideRemote = args.remoteSideRemote ?? (samePaneSource !== 'local')
    const hashSide = (p: string, size?: number, mtime?: number, session?: any, isRemote?: boolean) =>
      isRemote ? svc.remoteDigest(p, size, mtime, session) : svc.localDigest(p, size, mtime)
    try {
      const [localDigest, remoteDigest] = await Promise.all([
        args.localPath ? hashSide(args.localPath, args.localSize, args.localMtime, args.srcSession, localSideRemote) : Promise.resolve(null),
        args.remotePath ? hashSide(args.remotePath, args.remoteSize, args.remoteMtime, args.dstSession, remoteSideRemote) : Promise.resolve(null),
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
    // ★ issue #27 P2：左栏远程端点 → 上传源是左栏远程会话，目标是右栏远程会话（远程↔远程）
    if (this._leftKind === 'remote') {
      // r2r 通道回传的是「是否真的传成功」，本包装按旧签名吞掉（调用方不需要）
      return this._streamUploadOneRemote(localPath, targetRemoteDir).then(() => undefined)
    }
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
    // ★ 2026-10-13 P1 修复：同 _streamDownloadOne——新排队条目创建时清除同键的
    //   旧粘性取消标记，避免取消后立刻重试同一路径被静默拦截
    try { this._transferRuntime.clearQueuedCancel('upload', localPath, remoteTarget) } catch { /* ignore */ }
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

  /**
   * ★ issue #27 P3：远程↔远程同服务器加速。
   * 左右两栏指向同一台服务器（同一 SSH 会话，或不同会话但同主机）时，流式 r2r
   * 「下载到本机再上传」会把数据经外网绕一圈；改为直接在服务端执行 cp，一次到位。
   * 返回 true = 服务端复制已完成；false = 不适用或失败（调用方落回既有流式通道，行为不回退）。
   */
  private async _tryServerSideCopyForR2R(srcPath: string, dstPath: string, isDir: boolean): Promise<boolean> {
    if (this._leftKind !== 'remote') return false
    const sameSession = !!this._leftSshSession && this._leftSshSession === this.sshSession
    let sameHost = false
    try {
      const lh = this._leftProfile?.options?.host
      const rh = this.profile?.options?.host
      sameHost = !!lh && !!rh && lh === rh
    } catch { /* ignore */ }
    if (!sameSession && !sameHost) return false
    if (!this.sshSession) return false
    return tryRemoteCpViaSsh(this.sshSession, srcPath, dstPath, isDir)
  }

  /**
   * ★ issue #27 P2：左栏远程端点下的「上传」= 左栏远程 → 右栏远程（内存流式）。
   * 源路径是左栏远程会话上的 POSIX 全路径；目标目录是右栏远程当前目录（或默认上传目录）。
   * 复用既有上传队列泵与进度条目（entry.localPath 存源、remotePath 存目标，UI 仅作展示）。
   */
  private async _streamUploadOneRemote(localPath: string, targetRemoteDir?: string): Promise<boolean> {
    const base = path.basename(localPath)
    // ★ 2026-10-19 P1 修复：本分支源是**左栏远程 POSIX 路径**、目标是右栏远程目录，
    //   名字两端都在远端文件系统上——safeEntryName 的 Windows 保留名规则会静默跳过
    //   Linux 合法名。改用 safeRemoteEntryName（只防路径穿越/控制字符）。
    const safeName = safeRemoteEntryName(base)
    if (!safeName) {
      log.warn('skip upload (remote src) with unsafe name:', base)
      return false
    }
    let isFolder = false
    let size = 0
    let mode = 0o644
    let mtimeMs = 0
    try {
      const st = this._leftSftpSession?.stat?.(localPath)
      // stat 可能是同步返回值或 Promise，统一 await
      const resolved = st && typeof (st as any).then === 'function' ? await (st as Promise<any>) : st
      if (resolved) {
        isFolder = !!resolved.isDirectory
        size = (resolved.size ?? resolved.attrs?.size) || 0
        mode = resolved.mode ?? resolved.attrs?.mode ?? 0o644
        const m = resolved.modified ?? resolved.mtime ?? resolved.mtimeMs ?? resolved.attrs?.modified ?? resolved.attrs?.mtime
        if (m != null) {
          const n = (m instanceof Date) ? m.getTime() : Number(m)
          if (Number.isFinite(n) && n > 0) mtimeMs = n < 1e10 ? n * 1000 : n
        }
      }
    } catch { /* stat 失败按文件处理，传输时由底层再次校验 */ }
    const remoteDir = targetRemoteDir?.trim() || this.remotePath
    const remoteTarget = path.posix.join(remoteDir, safeName)
    // ★ issue #27 P3：拖拽前先探测目标（右栏远程）是否已存在同名路径，存在则入队 r2r 冲突
    // （覆盖/跳过/重命名），避免静默覆盖；目标不存在才走实际传输。
    if (await this._enqueueR2rConflictIfNeeded({
      srcSession: this._leftSftpSession, dstSession: this.sftpSession,
      srcPath: localPath, dstPath: remoteTarget,
      isDir: isFolder, mode,
      srcHostLabel: this._leftHostLabel || undefined, dstHostLabel: this.hostInfo || undefined,
      srcSize: size, srcMtime: mtimeMs,
    })) {
      // 冲突已入队 ⇒ 本次没有实际传输（剪切粘贴据此保留源文件，等待用户在冲突框里决定）
      return false
    }
    // ★ issue #27 P3：同服务器先试服务端 cp（数据不经外网绕行本机）；不适用/失败落回既有流式通道
    const t0 = Date.now()
    if (await this._tryServerSideCopyForR2R(localPath, remoteTarget, isFolder)) {
      this.transferLog.add({
        operation: 'remote-copy',
        localPath,
        remotePath: remoteTarget,
        srcPath: localPath,
        dstPath: remoteTarget,
        srcHostLabel: this._leftHostLabel || undefined,
        dstHostLabel: this.hostInfo || undefined,
        profileName: this.profile?.name || undefined,
        success: true,
        size,
        duration: Date.now() - t0,
        startTime: t0,
        pending: false,
      })
      this._safeDetect()
      return true
    }
    const logEntry = this.transferLog.add({
      operation: 'remote-copy',
      localPath,
      remotePath: remoteTarget,
      // ★ issue #27：远程↔远程（左栏远程 → 右栏远程）无上传/下载之分；记录两端完整路径与主机标签
      srcPath: localPath,
      dstPath: remoteTarget,
      srcHostLabel: this._leftHostLabel || undefined,
      dstHostLabel: this.hostInfo || undefined,
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
    try { this._transferRuntime.clearQueuedCancel('upload', localPath, remoteTarget) } catch { /* ignore */ }
    this.transfers.push(entry)
    this.transfersMinimized = false
    this.transfersHidden = false
    this._safeDetect()
    return new Promise<boolean>((resolve) => {
      const finish = () => {
        if (entry.queued && this.transfers.includes(entry)) {
          if (entry.skippedAsDuplicate) {
            entry.queued = false
            entry.percent = 100
            entry.speed = ''
            this._scheduleQueuedEntryRemoval(entry)
          } else {
            this._removeQueuedEntry(entry)
          }
        }
        // ★ 2026-10-20：回传真实成败 —— 剪切粘贴要靠它决定是否删源（取消时 failed 仍 false，
        //   故以 percent 是否真正到 100 作为完成判据）
        resolve(!entry.failed && entry.percent >= 100)
      }
      this._upQueue.push({
        localPath, entry, finish, remoteDir,
        r2r: true, srcPath: localPath, dstPath: remoteTarget,
        srcSession: this._leftSftpSession, dstSession: this.sftpSession, isDir: isFolder, mode,
      })
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
    item: {
      localPath: string; entry: PanelTransferItem; finish: () => void; remoteDir: string
      /** ★ issue #27 P2：远程↔远程标记与源/目标会话 */
      r2r?: boolean; srcPath?: string; dstPath?: string; srcSession?: any; dstSession?: any; isDir?: boolean; mode?: number
    },
  ): Promise<void> {
    try {
      // 条目可能在排队期间被用户取消/清空 ⇒ 不再执行
      if (this.transfers.includes(item.entry)) {
        if (item.r2r) {
          // ★ issue #27 P2：左栏远程端点 → 远程↔远程（内存流式）
          await this._doRemoteToRemoteTransfer({
            srcPath: item.srcPath!, dstPath: item.dstPath!,
            srcSession: item.srcSession!, dstSession: item.dstSession!,
            isDir: item.isDir, mode: item.mode, entry: item.entry,
          })
        } else {
          // 使用入队时记录的目标远程目录（默认上传路径优先，否则当前远程目录）
          await this.uploadPathToRemote(item.remoteDir, item.localPath)
        }
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
    const entries = this.clipboardEntries.slice()
    const mode = this.clipboardMode
    // ★ 2026-10-19（Hy3）：源/目标都按**端点**判定，不再按左/右栏猜本地还是远程。
    //   旧实现用 `_leftKind === 'remote' && (effSource === 'local' || adapterDest === 'local')`：
    //   ① 把 rl 归一成 'local' 后，左栏远程端点 + 右栏本地这一组合必然被误判成「左栏远程」；
    //   ② 反过来「右栏本地 → 右栏远程」也会被误判成本地→左远程。
    const srcEp = this._paneEndpoint(this.clipboardSource)
    const dstEp = this._paneEndpoint(this.contextMenuPane)
    log.info(`Paste ${entries.length} items (${mode}) from ${srcEp?.side}/local=${srcEp?.isLocal} to ${dstEp?.side}/local=${dstEp?.isLocal}`)
    this.clipboardEntries = []
    if (!srcEp || !dstEp) {
      log.warn('paste aborted: source/destination endpoint unavailable')
      return
    }
    const payload = entries.map(e => ({
      name: e.name,
      fullPath: (e as LocalEntry).fullPath ?? (e as SFTPFile).fullPath,
      isDirectory: e.isDirectory,
      mode: (e as SFTPFile).mode,
      size: (e as any).size,
      mtimeMs: (e as any).mtimeMs,
    }))

    // 任一端是「左栏远程端点」⇒ 适配器的 2 值语义表达不了（它假定 local=左栏、remote=右栏，
    // 且刷新/冲突框都只认主会话），改走端点直传（远程↔远程 / 远程↔本机磁盘 全支持）。
    if (this._needsDirectTransfer(srcEp) || this._needsDirectTransfer(dstEp)) {
      await this._pasteDirect(payload, srcEp, dstEp, mode)
      return
    }

    // 常规组合（左栏本地 + 右栏远程 / 左栏本地 + 右栏本地）：交给既有适配器（含冲突对话框）
    await this._pasteAdapter.paste(payload, dstEp.isLocal ? 'local' : 'remote', dstEp.dir, mode, srcEp.isLocal ? 'local' : 'remote')
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
   * ★ 2026-10-19（Hy3）：端点直传粘贴（替代原 _pasteRemoteAware）。
   *
   * 为什么需要它：粘贴适配器（core/paste.ts + 冲突框）只认「local = 左栏本地、remote = 右栏远程」，
   *   而左栏可以切到远程端点。凡涉及左栏远程端点的粘贴都由这里按 **端点** 分派，覆盖全部组合：
   *   - 远程 ↔ 远程：同连接优先服务端 cp（数据不经本机绕行），否则内存流式 transferRemote*；
   *   - 远程 → 本机磁盘、本机磁盘 → 远程：`_doUpload` / `_doDownload` 带 session 参数直传（目录递归）。
   *
   * ★ 2026-10-20（用户反馈）：「远程↔远程的复制、粘贴也算互传」。
   *   此前 r2r 粘贴走 `_transferBetweenEndpoints` 裸通道 —— 不写 remote-copy 记录、不进传输列表、
   *   目标已存在时直接跳过（连冲突框都没有）。现与右键「传输」、拖拽共用同一条 r2r 通道
   *   （`_streamUploadOneRemote` / `_streamDownloadOneRemote`）：冲突框、记录、进度三件套齐全。
   *
   * ★ 2026-10-20（冲突执行体端点化）：混合组合（一本地一远程）目标已存在时不再静默跳过 ——
   *   `_enqueueEndpointConflict` 入队覆盖/跳过/重命名，用户确认后由 `_doEndpointTransfer` 按端点执行。
   */
  private async _pasteDirect(
    entries: Array<{ name: string; fullPath: string; isDirectory: boolean; mode?: number; size?: number }>,
    srcEp: PaneEndpoint,
    dstEp: PaneEndpoint,
    mode: 'copy' | 'cut',
  ): Promise<void> {
    let allOk = true
    let skipped = 0
    // 远程↔远程：存在性预检交给 r2r 通道（它自己 stat 并弹冲突框），这里不能再抢先跳过
    // ★ 同栏粘贴（源=目标端点）不走 r2r 通道：`_streamXxxRemote` 的方向固定为「写到另一栏」，
    //   同栏粘贴会误传到对面。保持原行为（目标同名即跳过）。
    const r2r = !srcEp.isLocal && !dstEp.isLocal && srcEp.side !== dstEp.side
    for (const e of entries) {
      try {
        if (r2r) {
          // 方向由**源栏**决定：源是右栏远程 → 写左栏；源是左栏远程 → 写右栏
          const conflictBefore = this._conflictQueue.length
          const ok = srcEp.side === 'remote'
            ? await this._streamDownloadOneRemote(e as any, dstEp.dir)
            : await this._streamUploadOneRemote(e.fullPath, dstEp.dir)
          // 目标已存在时通道会入队冲突项并返回 false —— 这不是失败，别弹「粘贴失败」吓人
          if (!ok) {
            if (this._conflictQueue.length === conflictBefore) allOk = false
            continue
          }
          // 剪切：**成功后**才删源（冲突入队/取消/失败时 ok=false，源必须保留）
          if (mode === 'cut') await this._deleteAtEndpoint(srcEp, e.fullPath, e.isDirectory)
          continue
        }
        // 名字净化按**落点**语义选：落到本机磁盘才套 Windows 落地规则
        const safeName = dstEp.isLocal ? safeEntryName(e.name) : safeRemoteEntryName(e.name)
        if (!safeName) { log.warn('[paste] skip unsafe entry name:', e.name); continue }
        const dstChild = this._epJoin(dstEp, dstEp.dir, safeName)
        // ★ 2026-10-20 全量审计 P0：端点化粘贴缺「自我覆盖」守卫 ⇒ 同栏粘贴会截断自己。
        //   r2r 分支（见上方 r2r 常量）专供「两个不同栏位的远程端点互传」，而**同栏粘贴**
        //   （srcEp.side === dstEp.side，例如左栏切到远程端点后在本栏 Ctrl+C → Ctrl+V）
        //   被判成非 r2r，掉进本通用分支：dstChild 与 e.fullPath 同路径 ⇒ _epStatEntry 报
        //   存在 ⇒ 入队端点冲突 ⇒ 用户点「覆盖」⇒ _doEndpointTransfer 的远程↔远程分支
        //   （transferRemoteToRemoteFile 先截断目标、再读源）⇒ **源文件被清空，数据丢失**。
        //   与 paste.ts 的 _pasteSamePane 保持同一口径：先自我跳过，再自我包含跳过。
        if (this._sameDirText(e.fullPath, dstChild, dstEp.isLocal)) {
          log.warn('[paste] self-copy skipped:', e.fullPath)
          skipped++
          continue
        }
        // 目录粘进自身子目录 ⇒ 无限递归复制（与 _pasteSamePane / copyRemoteDir 同口径）
        if (e.isDirectory && isPathInside(e.fullPath, dstChild, !dstEp.isLocal)) {
          log.warn('[paste] refused copy into self:', e.fullPath, '->', dstChild)
          this.showTopNotification(this.i18n.t('op.cannotCopyIntoSelf', { name: e.name }))
          allOk = false
          continue
        }
        // ★ 2026-10-20：目标已存在不再静默跳过 —— 端点化冲突执行体就位后，这一组合也能弹
        //   「覆盖/跳过/重命名」了（原先只有经典本机↔主会话方向能弹框，涉及左栏远程端点的组合
        //   一律 skip，用户以为「粘贴没反应」）。
        const dstStat = await this._epStatEntry(dstEp, dstChild)
        if (dstStat.exists) {
          this._enqueueEndpointConflict({
            srcEp, dstEp, entry: e, dstPath: dstChild, dstStat, mode,
          })
          continue
        }
        const ok = await this._transferBetweenEndpoints(srcEp, e, dstEp, dstChild)
        if (!ok) { allOk = false; continue }
        // 剪切：**成功后**才删源（失败删源=数据丢失，见 2026-10-19 P0 修复）
        if (mode === 'cut') await this._deleteAtEndpoint(srcEp, e.fullPath, e.isDirectory)
      } catch (err) {
        log.error('[paste] item failed:', e.name, err)
        allOk = false
      }
    }
    if (srcEp.isLocal || dstEp.isLocal) await this._refreshLocalFsPanes()
    if (!srcEp.isLocal || !dstEp.isLocal) await this._refreshRemoteFsPanes()
    this._safeDetect()
    // 冲突项在遍历中入队，循环结束后统一弹框（与 drop.ts 各分支一致）
    if (this._conflictQueue.length) this._showConflictDialog()
    if (skipped > 0) this.showToast(this.i18n.t('notify.pasteSkippedExists', { n: skipped }), 4000)
    if (!allOk) this.showToast(this.i18n.t('notify.pasteFailed'), 4000)
  }

  /** 端点内单个条目传输（四种组合分派） */
  private async _transferBetweenEndpoints(
    srcEp: PaneEndpoint,
    entry: { name: string; fullPath: string; isDirectory: boolean; mode?: number; size?: number },
    dstEp: PaneEndpoint,
    dstChild: string,
  ): Promise<boolean> {
    const src = entry.fullPath
    if (srcEp.isLocal && !dstEp.isLocal) {
      return entry.isDirectory
        ? this._uploadDirViaSession(src, dstChild, dstEp.sftp)
        : this._doUpload(dstChild, src, undefined, dstEp.sftp)
    }
    if (!srcEp.isLocal && dstEp.isLocal) {
      return entry.isDirectory
        ? this._downloadDirViaSession(src, dstChild, srcEp.sftp)
        : this._doDownload(src, dstChild, entry.mode, entry.size, srcEp.sftp)
    }
    if (!srcEp.isLocal && !dstEp.isLocal) {
      if (srcEp.connKey === dstEp.connKey) {
        const ok = await tryRemoteCpViaSsh(srcEp.ssh, src, dstChild, entry.isDirectory)
        if (ok) return true
        // SSH exec 被禁用（仅放行 SFTP 的服务器很常见）时 cp 必然失败 → 回退流式，别整体判失败
        log.info('[paste] ssh cp unavailable, falling back to stream transfer:', src)
      }
      return entry.isDirectory
        ? transferRemoteDirToRemote(srcEp.sftp, src, dstEp.sftp, dstChild, {})
        : transferRemoteToRemoteFile(srcEp.sftp, src, dstEp.sftp, dstChild, { size: entry.size, mode: entry.mode })
    }
    // 本机磁盘 ↔ 本机磁盘不走本方法（调用方已分流给粘贴适配器），此处只做兜底记录
    log.warn('[paste] _transferBetweenEndpoints called for local→local, ignored:', src)
    return false
  }

  /** 按端点 FS 语义拼接子路径（本机磁盘用 path 的本地语义，远程恒 POSIX） */
  private _epJoin(ep: PaneEndpoint, dir: string, name: string): string {
    return ep.isLocal ? path.join(dir, name) : path.posix.join(dir, name)
  }

  /** 目标条目是否已存在（本机磁盘 fs.stat / 远程 readdir） */
  private async _epEntryExists(
    ep: PaneEndpoint, parentDir: string, name: string,
  ): Promise<{ exists: boolean; isDirectory: boolean }> {
    if (!ep.isLocal) {
      return this._remoteEntryExists(parentDir, name, ep.sftp).catch(() => ({ exists: false, isDirectory: false }))
    }
    try {
      const st = await fs.stat(this._epJoin(ep, parentDir, name))
      return { exists: true, isDirectory: st.isDirectory() }
    } catch {
      return { exists: false, isDirectory: false }
    }
  }

  /**
   * ★ 2026-10-20（用户诉求）：**端点化冲突**入队 —— 目标已存在时不再静默跳过，改为弹
   *   「覆盖 / 跳过 / 重命名」。
   *
   * 背景：冲突框的覆盖/重命名执行体原先写死「本机磁盘 ↔ 面板主会话」（`doDownload`/`doUpload`/
   *   `renameRemote`），所以凡涉及左栏远程端点（第二会话）或右栏本地（rl）的组合一律只能
   *   「目标存在即跳过」，用户看不到任何冲突提示。现由 `endpointTransfer` 携带两端真实身份，
   *   执行体（`_doEndpointTransfer`）按两端 isLocal 四组合分派，这些组合才敢弹框。
   *
   * 字段映射与 r2rTransfer 一致：`localPath`=源、`remotePath`=目标（对话框的左右侧归位在
   *   panel-conflict-resolver._presentConflictDialog 里按 src.isLocal 处理）。
   */
  private _enqueueEndpointConflict(args: {
    srcEp: PaneEndpoint
    dstEp: PaneEndpoint
    entry: { name: string; fullPath: string; isDirectory: boolean; mode?: number; size?: number; mtimeMs?: number }
    dstPath: string
    dstStat: { isDirectory: boolean; size?: number; mtimeMs?: number }
    mode: 'copy' | 'cut'
  }): void {
    const { srcEp, dstEp, entry, dstPath, dstStat, mode } = args
    const labelOf = (ep: PaneEndpoint): string => {
      if (ep.isLocal) return this.i18n.t('pane.local')
      return ep.side === 'local' ? (this._leftHostLabel || '') : (this.hostInfo || '')
    }
    const srcRef: EndpointRef = {
      isLocal: srcEp.isLocal, side: srcEp.side, dir: srcEp.dir,
      session: srcEp.isLocal ? undefined : srcEp.sftp,
      ssh: srcEp.isLocal ? undefined : srcEp.ssh,
      hostLabel: labelOf(srcEp),
    }
    const dstRef: EndpointRef = {
      isLocal: dstEp.isLocal, side: dstEp.side, dir: dstEp.dir,
      session: dstEp.isLocal ? undefined : dstEp.sftp,
      ssh: dstEp.isLocal ? undefined : dstEp.ssh,
      hostLabel: labelOf(dstEp),
    }
    const sep = dstEp.isLocal ? path : path.posix
    this._conflictQueue.push({
      localPath: entry.fullPath,
      remotePath: dstPath,
      remoteDir: sep.dirname(dstPath),
      fileName: sep.basename(dstPath),
      // 源侧元数据放 localStat（端点项里它是「源统计」，不一定来自本机磁盘）——与 r2r 入队同一约定
      localStat: (({ size: entry.size ?? 0, mtimeMs: entry.mtimeMs ?? 0 }) as any) as unknown as fsSync.Stats,
      remoteFileSize: dstStat.size,
      remoteFileMtime: dstStat.mtimeMs,
      // 方向只用于对话框的「上传/下载」徽章与文案：源在本机=上传、源在远程=下载
      direction: srcEp.isLocal ? 'upload' : 'download',
      isDirectory: entry.isDirectory,
      mode,
      endpointTransfer: {
        src: srcRef, dst: dstRef,
        isDir: entry.isDirectory, mode: entry.mode, size: entry.size,
      },
    })
    this.conflictOriginalTotal = Math.max(this.conflictOriginalTotal, this._conflictQueue.length)
    log.info('[conflict] endpoint conflict queued:', entry.fullPath, '->', dstPath,
      'src=' + (srcRef.isLocal ? 'local' : srcRef.side), 'dst=' + (dstRef.isLocal ? 'local' : dstRef.side))
  }

  /** 端点内单个条目的存在性 + 元数据（本机 fs.stat / 远程 sftp.stat） */
  private async _epStatEntry(
    ep: PaneEndpoint, fullPath: string,
  ): Promise<{ exists: boolean; isDirectory: boolean; size?: number; mtimeMs?: number }> {
    if (ep.isLocal) {
      try {
        const st = await fs.stat(fullPath)
        return { exists: true, isDirectory: st.isDirectory(), size: st.size, mtimeMs: st.mtimeMs }
      } catch { return { exists: false, isDirectory: false } }
    }
    try {
      if (!ep.sftp || typeof ep.sftp.stat !== 'function') return { exists: false, isDirectory: false }
      const raw = ep.sftp.stat(fullPath)
      const st = raw && typeof raw.then === 'function' ? await raw : raw
      if (!st) return { exists: false, isDirectory: false }
      const size = Number(st.size ?? st.attrs?.size)
      let mtimeMs: number | undefined
      const m = st.modified ?? st.mtime ?? st.mtimeMs ?? st.attrs?.modified ?? st.attrs?.mtime
      if (m != null) {
        const n = (m instanceof Date) ? m.getTime() : Number(m)
        if (Number.isFinite(n) && n > 0) mtimeMs = n < 1e10 ? n * 1000 : n
      }
      return {
        exists: true,
        isDirectory: !!(st.isDirectory ?? (st.mode != null && isDirByMode(st.mode))),
        size: Number.isFinite(size) ? size : undefined,
        mtimeMs,
      }
    } catch { return { exists: false, isDirectory: false } }
  }

  /**
   * ★ 2026-10-20（用户诉求）：**端点化冲突的执行体** —— 用户选「覆盖 / 重命名」后真正落地。
   *
   * 按两端 isLocal 四组合分派（与 `_transferBetweenEndpoints` 同一套底层通道，避免第二份实现）：
   *   本机↔本机：fs.copyFile / copyLocalDir（含自我覆盖守卫）
   *   本机→远程：_doUpload / _uploadDirViaSession（写入即覆盖）
   *   远程→本机：_doDownload / _downloadDirViaSession
   *   远程↔远程：同服服务端 cp 优先，失败落回内存流式 transferRemote*
   *
   * 目前真正会入队端点化冲突的是**一本地一远程**的组合（左栏远程↔右栏本地、本机→左栏远程等）；
   * 本机↔本机仍走「目标已存在即跳过」（见 `_ctxCopyToPeerLocal`：两端同为本地时对话框的
   * 「本地/远程」两栏标题不成立），远程↔远程走 r2rTransfer 分支。本机↔本机这条分支保留为完整性兜底。
   *
   * 传输记录：上传/下载由底层 `trackTransfer` 记账（这里不重复补），只有 r2r 内存流式与本机 fs
   *   复制没有任何记录层，才在这里补 remote-copy / local-copy —— 否则「冲突框里点覆盖」这条路径
   *   在传输记录里永远看不到。
   */
  private async _doEndpointTransfer(
    srcPath: string,
    dstPath: string,
    payload: NonNullable<ConflictQueueItem['endpointTransfer']>,
  ): Promise<boolean> {
    const { src, dst, isDir } = payload
    const t0 = Date.now()
    let operation: 'upload' | 'download' | 'remote-copy' | 'local-copy' = 'remote-copy'
    let ok = false
    try {
      if (src.isLocal && dst.isLocal) {
        operation = 'local-copy'
        // 自我覆盖守卫：fs.copyFile 会先截断目标再读已清空的源（文件变空白）、copyLocalDir 无限递归
        if (this._sameDirText(srcPath, dstPath, true)) {
          log.warn('[conflict] endpoint transfer skipped (source equals target):', srcPath)
          return false
        }
        if (isDir) await copyLocalDir(srcPath, dstPath)
        else await fs.copyFile(srcPath, dstPath)
        ok = true
      } else if (src.isLocal) {
        operation = 'upload'
        ok = isDir
          ? await this._uploadDirViaSession(srcPath, dstPath, dst.session)
          : await this._doUpload(dstPath, srcPath, undefined, dst.session)
      } else if (dst.isLocal) {
        operation = 'download'
        ok = isDir
          ? await this._downloadDirViaSession(srcPath, dstPath, src.session)
          : await this._doDownload(srcPath, dstPath, payload.mode, payload.size, src.session)
      } else {
        operation = 'remote-copy'
        // ★ 2026-10-20 全量审计 P0：远程↔远程分支原本缺自我覆盖守卫（只有上面的
        //   local↔local 组合有）。同栏粘贴时 src === dst：服务端 cp 报「same file」失败 →
        //   落回 transferRemoteToRemoteFile，后者先以写方式打开目标（=源）截断它、再从
        //   被清空的源读 ⇒ 文件变成 0 字节，数据不可恢复。覆盖动作在入队前必须拦下。
        if (this._sameDirText(srcPath, dstPath, false)) {
          log.warn('[conflict] endpoint transfer skipped (remote source equals target):', srcPath)
          return false
        }
        // 目录进自身子目录 ⇒ 无限递归（与 copyRemoteDir / transferRemoteDirToRemote 同口径）
        if (isDir && isPathInside(srcPath, dstPath, true)) {
          log.warn('[conflict] endpoint transfer refused copy into self:', srcPath, '->', dstPath)
          return false
        }
        // 同一会话 ⇒ 服务端 cp（数据不经外网绕行本机）；不适用/失败落回内存流式，与 r2r 通道口径一致
        const sameConn = !!src.session && src.session === dst.session
        if (sameConn && src.ssh && await tryRemoteCpViaSsh(src.ssh, srcPath, dstPath, isDir)) {
          ok = true
        } else {
          ok = isDir
            ? await transferRemoteDirToRemote(src.session, srcPath, dst.session, dstPath, {})
            : await transferRemoteToRemoteFile(src.session, srcPath, dst.session, dstPath, { mode: payload.mode, size: payload.size })
        }
      }
    } catch (e) {
      log.error('[conflict] endpoint transfer failed:', srcPath, '->', dstPath, e)
      ok = false
    }
    // ★ 记录口径：上传/下载**不在这里补记录** —— `_doUpload`/`_doDownload` 底层已通过
    //   trackTransfer 写了 upload / download 条目，再补一条就是同一动作两条记录。
    //   只有 r2r 内存流式（transferRemote*）与本机 fs 复制没有任何记录层，才由这里补
    //   remote-copy / local-copy（与 doR2rTransfer、_ctxCopyToPeerLocal 同一口径）。
    if (operation === 'remote-copy' || operation === 'local-copy') {
      try {
        this.transferLog.add({
          operation,
          localPath: srcPath,
          remotePath: dstPath,
          srcPath,
          dstPath,
          srcHostLabel: src.hostLabel,
          dstHostLabel: dst.hostLabel,
          success: ok,
          size: payload.size,
          duration: Date.now() - t0,
          startTime: t0,
          pending: false,
        })
      } catch (e) { log.warn('[conflict] endpoint transfer log failed:', e) }
    }
    this._safeDetect()
    return ok
  }

  /** 剪切粘贴成功后删除源（按端点类型选删除通道） */
  private async _deleteAtEndpoint(ep: { isLocal: boolean; sftp: any }, p: string, isDir: boolean): Promise<void> {
    try {
      if (ep.isLocal) { await fs.rm(p, { recursive: true, force: true }); return }
      if (isDir) { await deleteRemoteRecursive(ep.sftp, p); return }
      await ep.sftp.unlink(p)
    } catch (e) {
      log.warn('[paste] cut: delete source failed:', p, e)
    }
  }

  /** 本机磁盘目录 → 指定远程会话（递归，文件名落到远端才用 POSIX 语义） */
  private async _uploadDirViaSession(localSrc: string, remoteDst: string, sftp: any, depth = 0): Promise<boolean> {
    if (!sftp || depth > 64) return false
    try { await sftp.mkdir(remoteDst) } catch { /* 已存在或不可建，下面逐项传输时会暴露真实错误 */ }
    let ok = true
    let dirents: any[]
    try { dirents = await fs.readdir(localSrc, { withFileTypes: true }) } catch (e) {
      log.warn('[paste] readdir local failed:', localSrc, e)
      return false
    }
    for (const d of dirents) {
      const s = path.join(localSrc, d.name)
      const name = safeRemoteEntryName(d.name)
      if (!name) { log.warn('[paste] skip unsafe name on upload:', d.name); ok = false; continue }
      const t = path.posix.join(remoteDst, name)
      if (d.isDirectory()) {
        if (!await this._uploadDirViaSession(s, t, sftp, depth + 1)) ok = false
      } else if (!await this._doUpload(t, s, undefined, sftp)) ok = false
    }
    return ok
  }

  /** 指定远程会话目录 → 本机磁盘（递归，落本地才用 Windows/本地语义与名字净化） */
  private async _downloadDirViaSession(remoteSrc: string, localDst: string, sftp: any, depth = 0): Promise<boolean> {
    if (!sftp || depth > 64) return false
    try { await fs.mkdir(localDst, { recursive: true }) } catch (e) {
      log.warn('[paste] mkdir local failed:', localDst, e)
      return false
    }
    let items: any[]
    try { items = await sftp.readdir(remoteSrc) } catch (e) {
      log.warn('[paste] readdir remote failed:', remoteSrc, e)
      return false
    }
    let ok = true
    for (const it of items || []) {
      const s = it.fullPath || path.posix.join(remoteSrc, it.name)
      const name = safeEntryName(it.name)
      if (!name) { log.warn('[paste] skip unsafe name on download:', it.name); ok = false; continue }
      const t = path.join(localDst, name)
      if (it.isDirectory) {
        if (!await this._downloadDirViaSession(s, t, sftp, depth + 1)) ok = false
      } else if (!await this._doDownload(s, t, it.mode, it.size, sftp)) ok = false
    }
    return ok
  }

  /**
   * 远程↔远程目录互传的传输记录收口（右栏远程 → 左栏远程方向）。
   * 与 `_doEndpointTransfer` / `doR2rTransfer` 的 remote-copy 记录字段集保持一致。
   * @创建人：DD1024z + Hy4 preview
   * @创建时间：2026-10-20
   */
  private _logR2rTransfer(srcPath: string, dstPath: string, ok: boolean, startTime: number): void {
    try {
      this.transferLog.add({
        operation: 'remote-copy',
        localPath: srcPath,
        remotePath: dstPath,
        srcPath,
        dstPath,
        srcHostLabel: this.hostInfo || undefined,
        dstHostLabel: this._leftHostLabel || undefined,
        success: ok,
        size: undefined,
        duration: Date.now() - startTime,
        startTime,
        pending: false,
      })
    } catch (e) { log.warn('[r2r] directory log failed:', e) }
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
    // ★ issue #27 P2：左栏远程端点 + 目标为左栏 → 右栏远程 → 左栏远程（内存流式递归目录）。
    //   绕过协调器的「本地磁盘」假设，直接走双会话流式传输。
    if (destPane === 'local' && this._leftKind === 'remote') {
      // ★ 2026-10-20 全量审计 P2：补 `remote-copy` 传输记录。文件侧 r2r 有记（执行体
      //   `_doEndpointTransfer` / `doR2rTransfer`），唯独**目录**这条短路分支直接调裸通道后
      //   return，既不写记录也不进传输列表 ⇒ 用户在「传输日志」里完全看不到这次互传，
      //   与同一动作的其它入口（右键「传输」、拖拽、粘贴）口径不一致。
      const r2rT0 = Date.now()
      try {
        await transferRemoteDirToRemote(this.sftpSession, remoteSrc, this._leftSftpSession, localDest, {})
        this._logR2rTransfer(remoteSrc, localDest, true, r2rT0)
        return true
      } catch (e) {
        log.error('[r2r] directory transfer failed:', remoteSrc, e)
        this._logR2rTransfer(remoteSrc, localDest, false, r2rT0)
        return false
      }
    }
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
      // ★ 高危#13修复：将清理逻辑原子化，只在当前cancelRef确实属于自己时才清理，
      //   避免并发任务覆盖this._cancelRef后误清理其它任务的引用
      if (this._cancelRef === cancelRef) {
        this._cancelRef = prevRef
        if (this._cancelRef && !this._cancelRef.current && !(this._cancelRef.active?.size)) this._cancelRef = null
      }
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
  /**
   * 面板内是否有模态对话框正打开（模态期间必须禁止面板热键，否则按键会穿透到被遮挡的列表）。
   *
   * ★ 2026-10-09 审计根治：原实现是一串手写的 `xxxVisible ||` 枚举，本轮又发现它
   *   **又漏了一个**：dirMissingVisible（「目标目录不存在」三选一对话框，2026-08 之后新增）。
   *   注释里已记录过同款历史漏项（2026-09-20 权限 / CWD）—— 说明「手工枚举」这个
   *   模式本身就是缺陷来源：每加一个对话框就可能再漏一次，且漏了没有任何编译/测试提示。
   *   后果实测可致数据损失：对话框打开时按 Delete → 热键判定命中 → preventDefault +
   *   stopImmediatePropagation → **被遮挡列表里的选中项被删除**（远程侧同理可触发永久删除）。
   *
   *   根治：改为「按对话框的 DOM 存在性」判定，而不是枚举字段 ——
   *     · 所有模态都渲染在面板根节点内、遮罩层带统一 class；
   *     · 新增对话框只要遵循这个约定就自动被纳入，**不再需要改这里**；
   *     · 同时保留关键字段的显式枚举作为双保险（任一命中即认为是模态），
   *       避免因某个对话框尚未渲染出遮罩而漏判。
   */
  private _isPanelModalOpen(): boolean {
    // ① DOM 判定（主）：面板内存在模态遮罩即认为模态开启 —— 新增对话框自动生效。
    //    实测本项目 10 个对话框的遮罩**全部**是 `.overlay` 且都由 *ngIf="visible" 控制
    //    （已逐一核对 sftp-viewer / editor / conflict / delete / details / dir-missing /
    //      cwd-setup / input / perm / transfer-log），故选 .overlay 即可全覆盖，
    //    不需要为每个对话框维护一份 class 列表（那正是本缺陷的成因）。
    try {
      const root = this.elRef?.nativeElement as HTMLElement | undefined
      if (root?.querySelector('.sftp-overlays .overlay')) return true
    } catch { /* 视图已销毁，走下面的字段判定 */ }
    // ② 字段枚举（双保险）：与 DOM 判定取或
    return !!(
      this.viewerVisible ||
      this.editorVisible ||
      this.deleteConfirmVisible ||
      this.inputDialogVisible ||
      this.showConflictDialog ||
      this.detailsVisible ||
      this.showTransferLog ||
      // ★ 2026-10-23 续：读「可见」而非「还开着」——被布局挂起（窄窗单栏）的书签弹层
      //   屏幕上不存在，不该继续拦 Delete/F5 等全局快捷键。
      this.bookmarksVisible ||
      // ★ 2026-09-20：权限/CWD 此前漏计，打开时 Delete/F5 仍会穿透
      this.showPermDialog ||
      this.cwdSetupVisible ||
      // ★ 2026-10-09：「目标目录不存在」对话框同样漏计（见方法注释）
      this.dirMissingVisible
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

  /**
   * 「点过面板 ⇒ 剪贴板热键归面板」（owns）当前是否仍成立。
   * owns 的本意是「刚点过面板、但焦点被宿主的 focus 回抢卡在 xterm」，此时焦点仍留在**终端**。
   * ⛔ 一旦焦点落到**别的插件/宿主的界面**（例如 QuickCmd+ 编辑命令弹窗的输入框），owns 必须失效：
   *   别的插件浮层通常在自己的宿主元素上 stopPropagation 掉 mousedown（QuickCmd+ 正是如此），
   *   本面板那套「面板外 mousedown 清 owns」收不到事件 ⇒ owns 残留为 true ⇒
   *   Ctrl+A/C/X/V、Delete、单字母定位全被本面板抢走，对方输入框毫无反应（2026-10-28 用户实测）。
   * 判定：焦点在面板内 → 交给 panelFocused 分支（此处返回 false）；焦点在终端或已丢失（body/html）→ 保留原行为。
   */
  private _ownsHotkeysApply(): boolean {
    if (!this._panelOwnsClipboardHotkeys) return false
    const a = document.activeElement as HTMLElement | null
    const root = this.elRef?.nativeElement as HTMLElement | null
    if (!a) return true
    if (root && root.contains(a)) return false
    const tag = a.tagName
    if (tag === 'BODY' || tag === 'HTML') return true
    if (a.closest?.('.xterm')) return true
    return false
  }

  /**
   * 捕获阶段：**任何**面板外 mousedown 都立即交出剪贴板热键归属。
   * 挂在 window 捕获上而不是 document 冒泡，是因为别的插件浮层会在自己的宿主上
   * stopPropagation（QuickCmd+ 面板就这么做），document 冒泡根本收不到这次点击。
   */
  private _clearOwnsOnOutsideMouseDown(ev: MouseEvent): void {
    const root = this.elRef?.nativeElement as HTMLElement | null
    if (!root) return
    const t = ev.target as Node | null
    if (t && root.contains(t)) return
    if (!this._panelOwnsClipboardHotkeys && !this._panelFocusWantedUntil) return
    this._panelOwnsClipboardHotkeys = false
    this._panelFocusWantedUntil = 0
    this._clearPanelFocusStealTimers()
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
    // ★ 2026-10-09 审计根治（IME 组合态）：本函数原先只看 ev.key 就接管 Ctrl/⌘+C/X/V/A，
    //   **没有检查 ev.isComposing**。而本项目在 _tryTypeAheadFind（6697 附近）与
    //   onTypeAheadCompositionEnd 里都显式处理了 IME（`if (event.isComposing) return`），
    //   说明 IME 状态是被意识到的 —— 这条路径单独漏了。
    //   表现：中文输入法组字过程中（候选词还没上屏）按 Ctrl+V，ev.key === 'v' 且
    //   isComposing === true ⇒ 被面板抢走并复制面板剪贴板内容，终端收不到系统剪贴板。
    //   根治：组合态一律**不接管**（把按键交还 IME / 终端）。这与「焦点决定、绝不引入
    //   时间窗口」的既定原则一致 —— isComposing 是事件自带的硬事实，不是时序猜测。
    if (ev.isComposing || (ev as unknown as { keyCode?: number }).keyCode === 229) return
    const isMod = os.platform() === 'darwin' ? ev.metaKey : ev.ctrlKey
    if (!isMod) return
    const k = ev.key
    if (!['c', 'C', 'x', 'X', 'v', 'V', 'a', 'A'].includes(k)) return
    const kLower = k.toLowerCase()

    const inPanelEditable = this._isFocusInPanelEditable()
    const textUiOpen = !!(this.editorVisible || this.viewerVisible || this.inputDialogVisible)
    const panelFocused = this._isPanelDomFocused()
    const panelOwns = this._ownsHotkeysApply()

    // 焦点在终端、未开文本 UI、且用户未在面板内操作：放行（终端里 Ctrl+C 中断等）
    if (!panelFocused && !panelOwns && !textUiOpen && !inPanelEditable) return
    // ★ 2026-10-19 P1 修复：文本 UI（查看器/编辑器/输入框）开着、但焦点已回终端时，
    //   上方守卫因 textUiOpen=true 不生效，而下面三个分支（textUiOpen&&面板聚焦 /
    //   owns / 面板内可编辑）也都不成立 ⇒ 落到无条件 stopImmediatePropagation +
    //   preventDefault：终端收不到、面板也不执行——Ctrl+C 中断命令、Ctrl+V 粘贴、
    //   Ctrl+X、Ctrl+A 全部无任何反应（查看器无外点关闭逻辑，该组合很容易发生）。
    //   焦点既不在面板 DOM、也不在面板可编辑区时一律放行，交还终端。
    if (!panelFocused && !panelOwns && !inPanelEditable) return

    // ★ 2026-10-14 修复（用户报障：「查看/编辑器里右键全选不生效，Ctrl+A 毫无反应」
    //   → 第一次修正后追加报障：「Ctrl+C 复制还会穿透到 SSH」）：
    //   文本 UI（查看器 / 编辑器 / 输入框）打开且焦点在面板内时的正确处理是
    //   **保留 stopImmediatePropagation，但去掉 preventDefault**。
    //
    //   为什么不能「直接 return 让事件透传」（那是第一次修正的写法，已被实测证伪）：
    //   把 `^C` 送到远端 shell 是 xterm/Tabby 的 **JS 行为**，不是浏览器的默认动作 ——
    //   preventDefault 对它完全无效，唯一有效的就是让事件根本到不了它们的监听器。
    //   透传的后果用户当场复现：查看器里按 Ctrl+C 复制，远端 prompt 上同时刷出 `^C`，
    //   正好打断正在跑的命令。
    //
    //   反过来，**原生复制/剪切/粘贴是浏览器的默认动作**，只有 preventDefault 能拦 →
    //   所以这里绝不能 preventDefault，否则又回到「查看器里 Ctrl+C 复制不了」。
    //
    //   两者合起来：stop 只挡 Tabby/xterm，不挡浏览器原生行为。
    //   唯一需要自己实现的是 **Ctrl+A**：
    //     · 查看器正文是自绘虚拟列表（没有可全选的表单对象）⇒ 交给它自己的 selectAllText()；
    //     · 编辑器焦点不在正文时，原生全选会去选**整个文档**（连面板列表与终端文字）
    //       ⇒ 同样交给我们，转为「聚焦正文 + 全选编辑器内容」；
    //     · 编辑器焦点**已在正文**时交还浏览器原生（保留撤销栈），故不 preventDefault。
    //
    //   为什么 Ctrl+A 必须由屏蔽器转交、而不是让对话框自己监听：屏蔽器一旦 stop，
    //   事件就不会再抵达对话框（无论遮罩级还是 document 级）—— 顺序上它是第一个。
    if (textUiOpen && this._isPanelDomFocused()) {
      ev.stopImmediatePropagation()
      if (kLower === 'a') {
        if (this.viewerVisible) {
          ev.preventDefault()
          this.zone.run(() => this.viewerDialog?.selectAllText())
        } else if (this.editorVisible && !inPanelEditable) {
          ev.preventDefault()
          this.zone.run(() => this.editorDialog?.selectAllText())
        }
        // 编辑器焦点已在正文：不 preventDefault，交还浏览器原生全选（保留撤销栈）
      } else if (kLower === 'c') {
        // ★ 2026-10-14：Ctrl+C 也改由对话框自己执行（用户报障：「快捷键复制后没有任何反馈，
        //   而且分不清复制的是全部还是选中」）。原生复制在这里有三个问题：
        //     ① 没有任何反馈 —— 不像点「复制」按钮那样能看到「已复制全部 / 已复制选中」；
        //     ② 结果不可区分 —— 原生复制的永远是 DOM 选区，用户无从判断；
        //     ③ 查看器换行模式下原生复制拿到的是**渲染行**文本，折行处会多出换行符，
        //        粘出来已不是原文件内容。
        //   对话框侧的 copyForShortcut() 与按钮共用同一实现：有选区复制选中、无选区复制全文，
        //   并各自点亮对应按钮的反馈文案。仅在焦点确实落在该类对话框内时才接管 ——
        //   重命名等输入框（只有 inputDialogVisible）必须保持原生复制。
        if (this.viewerVisible) {
          ev.preventDefault()
          this.zone.run(() => this.viewerDialog?.copyForShortcut())
        } else if (this.editorVisible) {
          // 不加 inPanelEditable 判据：编辑器打开时焦点可能停在遮罩/底部按钮上，
          // 那种情况同样应该给反馈。编辑器对话框内的可编辑控件只有它自己的正文
          //（inputDialogVisible 不会与 editorVisible 同时成立），故不存在误接管输入框复制。
          ev.preventDefault()
          this.zone.run(() => this.editorDialog?.copyForShortcut())
        }
      }
      return
    }

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
    const t = ev.target as HTMLElement | null
    // ★ 2026-10-19 P1 修复（与 _shieldTerminalClipboardKeys 同款吞键洞）：原先只看
    //   textUiOpen 不看事件目标是否在面板内——查看器/编辑器开着、焦点已回终端时，
    //   目标为 xterm 的隐藏 textarea，照样被 preventDefault ⇒ 终端里 Ctrl+V 粘贴
    //   无反应。目标不在面板内一律放行（终端管自己的粘贴）。
    if (!t || !this.elRef?.nativeElement?.contains(t)) return
    const tag = t.tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || (t as any).isContentEditable) return
    const textUiOpen = !!(this.editorVisible || this.viewerVisible || this.inputDialogVisible)
    if (!textUiOpen && !this._isFocusInPanelEditable()) return
    // 目标在面板内且不是可编辑控件 → 阻止粘贴穿透到终端
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
   *  - 若两侧均有/均无 → 使用 activePane（鼠标悬停的面板）
   *  ★ 2026-10-19 P1 修复：扩为三值并感知右栏端点类型。
   *    右栏为本地端点时 `selectedRemote` 槽位不可达（界面上没有远程面板），
   *    解析结果必须在 'local' / 'rl' 之间二选一，绝不能回落到 'remote'。 */
  private _resolveTargetPane(): 'local' | 'remote' | 'rl' {
    if (this._rightKind === 'local') {
      const inRl = this._rlSelected.length > 0
      const inLocal = this.selectedLocal.length > 0
      if (inRl && !inLocal) return 'rl'
      if (inLocal && !inRl) return 'local'
      // 两侧均无（或均有）选中 → 以最后交互侧为准；左右栏之外的 'remote' 一律归一到 'rl'
      return this.activePane === 'local' ? 'local' : 'rl'
    }
    if (this.selectedLocal.length > 0 && this.selectedRemote.length === 0) return 'local'
    if (this.selectedRemote.length > 0 && this.selectedLocal.length === 0) return 'remote'
    // 陈旧值兜底：右栏已是本地端点时不会走到这里，这里只处理右栏=远程时的历史值
    return this.activePane === 'rl' ? 'remote' : this.activePane
  }

  /** 取某侧的当前选中集（三值统一入口，避免各处 `=== 'local' ? … : …` 漏掉 rl 分支） */
  private _paneSelection(side: 'local' | 'remote' | 'rl'): any[] {
    if (side === 'local') return this._selectedLocal
    if (side === 'rl') return this._rlSelected
    return this._selectedRemote
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
    // ★ 2026-10-16 根治（用户报障「选中文件后按字母/数字无法定位」）：
    //   本方法原先直接 `root.focus()`。但 `root`（elRef.nativeElement）**不是** `<sftp-plus-panel>`，
    //   而是装饰器 `factory.create(injector, [], panelHost)` 传进去的那个**自建 div**
    //   （tabby/terminal-decorator.ts）—— 装饰器上的 `host: {'attr.tabindex': '-1'}`
    //   在「自定义宿主节点」这条路径下**没有落到该 div 上**。
    //   于是 `root.focus()` 对非可聚焦元素是**静默 no-op**；而本方法**先 blur 了原焦点**
    //   ⇒ document.activeElement 停在 BODY。
    //   后果实测（诊断日志）：`stage=enter ... domFocused=false ... active=BODY` ——
    //     · 方向键 / Delete / F2 / F5 照常好使（它们的守卫接受 `owns`）；
    //     · **唯独键入定位全灭**（它是唯一硬要求 `_isPanelDomFocused()` 的功能）。
    //   修法：优先聚焦模板里那个**自带 tabindex="0" 的 `.sftp-root`**（必然可聚焦），
    //   退化时才用 root，保证行为只会变好不会变坏。
    const focusTarget = (root.querySelector('.sftp-root') as HTMLElement | null) ?? root
    const active = document.activeElement as HTMLElement | null
    if (active && active !== focusTarget && !focusTarget.contains(active)) {
      try { active.blur() } catch { /* ignore */ }
    }
    try { focusTarget.focus({ preventScroll: true }) } catch { /* ignore */ }
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

  // ========== 顶栏按钮定制（固定 / ⋯ 折叠菜单） ==========

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：读取顶栏按钮配置。
   *   读 `configService.store` 而不是 localStorage——设置页写的也是配置，两边只有一个数据源；
   *   设置页保存后会广播 `sftp-plus-settings-changed`，由监听器重跑本方法（见 _settingsChangedHandler）。
   */
  private _readTopBarConfig(): void {
    let cfg: any = null
    try { cfg = this.configService?.store?.['tabby-sftp-plus'] } catch { cfg = null }
    this._topBarOrder = normalizeTopBarOrder(cfg?.[TOP_BAR_CFG_FIELDS.order])
    this._topBarPinned = normalizeTopBarPinned(cfg?.[TOP_BAR_CFG_FIELDS.pinned])
    this._topBarDisabled = normalizeTopBarDisabled(cfg?.[TOP_BAR_CFG_FIELDS.disabled])
    // 未配置时默认关闭折叠菜单（= 历史行为）；只有显式 true 才启用
    this._topBarOverflowEnabled = cfg?.[TOP_BAR_CFG_FIELDS.overflow] === true
    if (!this._topBarOverflowEnabled) this._topBarOverflowVisible = false
  }

  /** 读取「连接切换器唤起方式」（设置页「其它」）；读到非法值按默认 'topbar' 处理 */
  private _readConnPickerTrigger(): void {
    let raw: any = null
    try { raw = this.configService?.store?.['tabby-sftp-plus']?.connPickerTrigger } catch { raw = null }
    // 兼容旧值 terminalBadge（曾把入口误解成 Tabby 终端工具栏按钮，现已改为面板栏工具栏标识 paneToolbar）
    if (raw === 'terminalBadge') raw = 'paneToolbar'
    this._connPickerTrigger = (raw === 'paneToolbar' || raw === 'both') ? raw : 'topbar'
  }

  /**
   * 读取「顶栏连接显示内容」（设置页「其它」→ 别名 / 账号@地址）。
   * 只有显式 'alias' 才用别名，其余（缺失、旧配置、手改坏的值）一律按 'account' ——
   * 与历史行为一致，老用户升级后顶栏不会突然变成另一套文字。
   */
  private _readConnLabelStyle(): void {
    let raw: any = null
    try { raw = this.configService?.store?.['tabby-sftp-plus']?.connLabelStyle } catch { raw = null }
    this._connLabelStyle = raw === 'alias' ? 'alias' : 'account'
  }

  /** 顶栏内联显示的按钮（按配置顺序；折叠菜单关闭时全部平铺） */
  get topBarInlineItems(): TopBarItemId[] {
    const list = this._topBarOrder.filter(id => {
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：⋯ 是**溢出容器**不是功能按钮 —— 不受「是否有停用 /
      //   是否固定」影响（它没有这两态），只看折叠总开关与「菜单里确实列得出东西」。
      //   渲染位置完全由它在 topBarOrder 里的下标决定（用户可在设置页拖到任意位置）。
      if (id === 'overflow') return this.topBarOverflowButtonVisible
      return this.topBarItemAvailable(id)
        && !this._topBarDisabled.includes(id)
        && (!this._topBarOverflowEnabled || this._topBarPinned.includes(id))
    })
    // ★ 2026-10-23（Deepseek-V4.1-Flash）：关闭按钮兜底 —— 没给面板配「开关快捷键」时始终显示 ✕。
    //   否则用户把 ✕ 停用/收起后，面板就没有稳定出口了（Esc 只有焦点在面板内才生效）。
    if (!this.panelToggleHotkeyBound && !list.includes('close')) list.push('close')
    return list
  }

  /**
   * 是否给「SFTP+ 面板」绑了开关快捷键（Tabby 设置 → 快捷键 → `sftp-plus-toggle-panel`）。
   * ★ 2026-10-23：它是「关闭按钮能否被停用 / 收进 ⋯ 菜单」的判据 —— 有快捷键才允许，
   *   没有的话 ✕ 是唯一稳定出口（见 `topBarInlineItems` 的兜底与设置页该项的禁用态）。
   */
  get panelToggleHotkeyBound(): boolean {
    try {
      const hk = (this.configService?.store as any)?.hotkeys?.[SFTP_PLUS_TOGGLE_HOTKEY]
      if (Array.isArray(hk)) return hk.length > 0
      return typeof hk === 'string' ? hk.trim().length > 0 : false
    } catch { return false }
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：⋯ 菜单改成列**全部**可用按钮（含已固定的），
   *   每行右侧带一个图钉可就地「固定 / 收进 ⋯」。
   *   用户要求：「点击后弹出来的面板需要显示所有选项，然后旁边可以点击是否固定」——
   *   免得为了固定某一项还得跑去设置页。
   *   ⛔ 别退回「只列未固定项」（原 topBarOverflowItems，已删）：那样全部固定时菜单是空的，
   *     用户既看不到选项也没有调整入口。
   */
  get topBarMenuItems(): TopBarItemId[] {
    return this._topBarOrder.filter(id =>
      // ★ 2026-10-27：⋯ 自己不进菜单（否则菜单里会出现「点它打开自己」的递归入口）
      id !== 'overflow'
      && this.topBarItemAvailable(id)
      && !this._topBarDisabled.includes(id)
      // ★ 2026-10-23：未配面板快捷键时 close 恒在顶栏（兜底），不进菜单 —— 免得同一动作两个入口
      && (id !== 'close' || this.panelToggleHotkeyBound))
  }

  /**
   * ⋯ 按钮是否显示：**启用折叠菜单就常驻**。
   * ★ 2026-10-23：原判断是 `topBarOverflowItems.length`（确有按钮被收起才出现）⇒
   *   「全部固定」的默认状态下根本没有入口去点开菜单调固定（用户反馈的现象）。
   *   现在只要能列出菜单项就显示；折叠菜单关闭时整个按钮不出现（老行为不变）。
   * ★ 2026-10-27：⋯ 已作为 `overflow` 项进入 topBarOrder（用户可拖拽排序），本 getter 只负责
   *   「要不要渲染」，位置由 topBarInlineItems 的过滤顺序决定。
   */
  get topBarOverflowButtonVisible(): boolean {
    return this._topBarOverflowEnabled && this.topBarMenuItems.length > 0
  }

  /** 该项当前是否固定在顶栏（⋯ 菜单行内图钉读它） */
  isTopBarPinned(id: TopBarItemId): boolean {
    return this._topBarPinned.includes(id)
  }

  /**
   * 在 ⋯ 菜单里就地切换「固定到顶栏 / 收进 ⋯」。
   *   写的是设置页**同一个配置项** `topBarPinned`，落盘 + 广播，写法照搬 `toggleBookmarkPanelPinned`
   *   （只改内存会在重开面板后回到旧值）。
   *   ⛔ 设置页 `_settingsChangedHandler` 必须回读 topBarPinned，否则它下次 `_saveToConfig()`
   *     （45+ 字段整体写回）会把这里的改动覆盖回去（P2-31 同源）。
   *   ⛔ 菜单保持展开：用户常要连着固定/取消好几项，别在这里关菜单。
   */
  toggleTopBarItemPinned(id: TopBarItemId, e?: MouseEvent): void {
    e?.stopPropagation()
    e?.preventDefault()
    const set = new Set(this._topBarPinned)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    // 按全量顺序规整：配置里的数组顺序稳定，导出/导入对得上，也便于 git diff
    const next = TOP_BAR_ITEM_IDS.filter(x => set.has(x))
    this._topBarPinned = next
    try {
      if (this.sftpConfig) {
        this.sftpConfig.setAndFlush(TOP_BAR_CFG_FIELDS.pinned, [...next])
      } else {
        const target = this.configService?.store?.['tabby-sftp-plus'] as any
        if (target) {
          target[TOP_BAR_CFG_FIELDS.pinned] = [...next]
          this.configService?.save()
        }
      }
    } catch (err) {
      log.warn('[SFTP+] save topBarPinned failed:', err)
    }
    try { window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed')) } catch { /* ignore */ }
    this._safeDetect()
  }

  /** 按钮在当前显示模式下是否可用（workspace 模式没有最小化/最大化） */
  topBarItemAvailable(id: TopBarItemId): boolean {
    if ((id === 'minimize' || id === 'maximize') && this.displayMode === 'workspace') return false
    return true
  }

  /** 菜单项文案（最大化按当前状态显示「最大化 / 还原」） */
  topBarItemLabel(id: TopBarItemId): string {
    if (id === 'maximize') return this.panelMaximized ? this.i18n.t('app.restore') : this.i18n.t('app.maximize')
    const def = TOP_BAR_ITEMS.find(i => i.id === id)
    return def ? this.i18n.t(def.labelKey) : id
  }

  /** 菜单项激活态（与顶栏按钮的 .active 视觉对齐） */
  topBarItemActive(id: TopBarItemId): boolean {
    if (id === 'pathMode') return this.pathMode !== 'off'
    if (id === 'layout') return !!this._layoutOverrideReason
    if (id === 'transferLog') return this.showTransferLog
    if (id === 'maximize') return this.panelMaximized
    return false
  }

  /** 展开/收起 ⋯ 菜单 */
  toggleTopBarOverflow(e?: MouseEvent): void {
    e?.stopPropagation()
    e?.preventDefault()
    this._topBarOverflowVisible = !this._topBarOverflowVisible
    this._safeDetect()
  }

  /** 执行菜单里的按钮动作（与顶栏同名按钮同一实现，不复制逻辑） */
  runTopBarItem(id: TopBarItemId): void {
    this._topBarOverflowVisible = false
    switch (id) {
      case 'pathMode': this.cyclePathMode(); break
      case 'layout': this.cycleLayoutMode(); break
      case 'transferLog': this.toggleTransferLog(); break
      case 'settings': this.openPluginSettings(); break
      case 'minimize': this.minimize(); break
      case 'maximize': this.toggleMaximize(); break
      case 'close': this.close(); break
    }
    this._safeDetect()
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
      // ★ 2026-10-26（Deepseek-V4.1-Flash）：通用确认框排在最前 —— 它可能叠在查看器/编辑器
      //   （未保存关闭、远端已变更覆盖）之上，Esc 必须先取消它，而不是把下层对话框一起关掉。
      //   Esc 的 preventDefault 同时让下面「event.defaultPrevented ⇒ return」生效，避免连关两层。
      if (this.confirmDialogVisible) {
        if (event.key === 'Escape') { event.preventDefault(); this.onConfirmDialogResult(false) }
        return
      }
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
          else if (navPane === 'rl') this._rlBack()
          else this.remoteBack()
          return
        }
        if (this._panelHotkeyEnabled('forward') && matchPanelHotkeyKeys(event, this._panelHotkeyKeys('forward'))) {
          event.preventDefault()
          event.stopPropagation()
          this._clearTypeAhead()
          if (navPane === 'local') this.localForward()
          else if (navPane === 'rl') this._rlForward()
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
        // ★ 2026-10-19 P1（audit）：「目录不存在」框此前不在 Esc 栈里 —— 与冲突框完全同款，
        //   焦点转移后 Esc 会穿透到 this.close() 关掉整个面板（连带在途批量传输）。
        //   语义取 'cancel'（非破坏性）：既不同于 create（凭空建目录）也不同于 fallback。
        if (this.dirMissingVisible) { event.preventDefault(); this.resolveDirMissing('cancel'); return }
        if (this.inputDialogVisible) { this.cancelInputDialog(); return }
        if (this.showBookmarks) { this.closeBookmarks(); return }
        if (this.showTransferLog) { this.showTransferLog = false; return }
        if (this.detailsVisible) { this.detailsVisible = false; return }
        if (this.showPermDialog) { this.showPermDialog = false; return }
        // ★ 2026-10-13 P1 修复：右键/表头/标题栏菜单此前不在 Esc 栈里——菜单开着按 Esc 会
        //   一路穿透到 this.close() **关掉整个面板**（有在途传输时还会弹原生 confirm 并
        //   可能 clearTransfers 取消全部传输）。2026-09-21 已为冲突框修过完全同款的缺陷，
        //   菜单类漏网。菜单组件自身无 keydown 绑定，事件必到达此处。
        if (this.contextMenuVisible) { event.preventDefault(); this.contextMenuVisible = false; return }
        if (this.headerMenuVisible) { event.preventDefault(); this.headerMenuVisible = false; return }
        if (this.topBarMenuVisible) { event.preventDefault(); this.topBarMenuVisible = false; return }
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
    if (!panelFocused && !this._ownsHotkeysApply()) return

    event.preventDefault()
    event.stopImmediatePropagation()
    this._runPanelClipboardHotkey(event.key)
  }
}

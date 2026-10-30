/**
 * SFTP+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 SFTP+ 配置入口（语言、主题、布局、其它、数据、关于）
 *   支持双存储模式：Tabby 配置（config.yaml）或 浏览器缓存（localStorage）
 * @创建人：DD1024z + Hy3 preview
 * @创建时间：2026-06-21
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-27 — ⑱「传输设置」分区新增「拖拽只投放到当前目录」开关（默认开，
 *              配置键 dropToCurrentDir）：跨栏 / 系统资源管理器拖入时落点恒为目标栏当前目录，
 *              避免停在文件夹行上时文件被静默吞进子目录；关闭后拖到文件夹行会真的存进去
 *              （面板侧在拖拽期间高亮该行并标注「放入此文件夹」）。
 *              ⑰「定制顶栏按钮」列表纳入 ⋯（overflow）行：可拖拽排序 —— 复选框禁用、
 *              勾选态直接反映上方「启用折叠菜单」总开关，没有图钉（恒在顶栏）；同时移除上一版加的
 *              「⋯ 不参与排序」说明小字与 `settings.topBarOverflowFixedPos`（24 份 .po 条目一并删除）。
 *              ⑯「关于」区版本号也可点击：跳当前版本的 Release tag
 *              （/releases/tag/v<version>，package.json 的 version 不带 v，拼 URL 时自动补、已带则不重复补）；
 *              可点文字样式抽成通用 .ss-about-click（版本号与作者名共用一套 hover 反馈）；
 *              同时把 5 处重复的 shell.openExternal try/catch 收口成 _openExternal(url)，
 *              仓库地址抽成 repoUrl，issue 表单 URL 也改为基于它拼接。
 *              ⑮「关于」区作者名（作者: DD1024z）改为可点击入口：点击跳转
 *              https://github.com/10D24D；hover 提亮 + 实线下划线（用 text-decoration 不占布局，
 *              避免把 .ss-about-row 撑高 1px）+ 手型光标，反馈与同排 .ss-about-link 一致。
 *              2026-10-23 — ⑭「调整配置立即生效」开关改到「数据」分区导出/导入/清空按钮组**上方**
 *              （用户第三次调位：先说改动是否即时生效，再执行数据操作；仍保留
 *              .ss-apply-instant-wrap{margin-top:0} 紧贴分区标题，按钮组自带 4px 上边距）。
 *              ⑬取消「字体」分组标题：字号大小与上方面板透明度**平级**
 *              （同为 .ss-toggle-row + .ss-range-wrap + .ss-range-val），去掉 ss-sub-head 标题行
 *              与 ss-toggle-sub 的 18px 左缩进；重置按钮改挂「字号大小」标签右侧
 *              （.ss-label-with-reset，行内按钮压到 18px 保行高一致）；删除已无引用的
 *              .ss-font-row / .ss-font-control / .ss-font-val。settings.font 这个 key 保留 ——
 *              「导入/导出说明」那一行还在用，只去掉分组标题这一处用法。
 *              ⑫新增「冲突重命名风格」下拉（设置页「传输」分区，紧接冲突摘要那组）：
 *              配置 `conflictRenameStyle` = seq 序号堆叠（默认）/ time 时间戳 / random 随机后缀；
 *              六处登记（字段 / 回读 / 写回 / 导出 config / 导出 localStorage / 导入，+ 导出分类 transfer）；
 *              导出与导入都过 `normalizeConflictRenameStyle`（外部 JSON 不可信，未知值回落 seq）。
 *              ⑪书签弹层 footer 新增图钉「面板常驻」，它写的就是本页「选中书签后关闭书签面板」
 *              那一项（钉住 = closeBookmarkPanelOnSelect false）⇒ `_settingsChangedHandler` 补回读本项，
 *              否则设置页内存里的旧值会在下次 _saveToConfig()（45+ 字段整体写回）时把图钉的改动覆盖掉。
 *              ⑩「字体字号」整块（字体标题 + 重置按钮 + 字号滑块）从「布局」分区末尾
 *              移到「主题」分区的「面板透明度」下方（用户提议：两个都是滑块、同属面板外观）；
 *              EXPORT_CATEGORY_FIELDS 里 fontSize 随之由 layout 换到 theme，导出分类与 UI 分区一致。
 *              ⛔ 导入侧按扁平 key 取值、不读分类，所以换组不影响老备份导入（勿"顺手"改导入逻辑）。
 *              2026-10-22 — ⑨「关于」区新增赞助入口：在 NPM 源码与「点赞支持」之间插入「请喝咖啡」
 *              （图标 src/assets/icons/kofi.svg，点击走 openKofi() 打开 https://ko-fi.com/dd1024z）；
 *              「隐藏作者信息」确认框同步补同一入口（用 ☕ 与同处 ⭐ 风格一致），README 中英同步；
 *              新增 i18n key settings.buyCoffee（24 语言，脚本 scripts/add-kofi-i18n.mjs）。
 *              ⛔ 英文一律写 Treat me to a coffee，不用 Buy me a coffee（后者是注册商标）。
 *              ⑧撤销③：默认路径模式**不再**因设置页改默认值而清掉本连接的 per-host 覆盖 ——
 *              面板上单独切换过的模式随该标签页连接保存，「默认路径模式」只用于**没有覆盖的新连接**；
 *              随之移除 `sftp-plus-default-pathmode-changed` 专用事件（用户 2026-10-22 拍板）。
 *              ⑦「配置保存后立即生效」改名「调整配置立即生效」（24 语言），
 *              并加 `.ss-apply-instant-wrap { margin-top:0 }` 让它紧贴上方按钮组。
 *              ⑥「配置保存后立即生效」开关移到「数据」分区导出/导入/清空按钮组**下方**
 *              （用户指定：先动数据，再说数据何时落到面板）。
 *              ⑤「配置保存后立即生效」开关改放到「数据」分区（用户要求），
 *              书签排序第三档文案对齐为「名称排序」（settings.bookmarkSortHint 同步措辞）。
 *              ③（已于⑧撤销）曾让 saveDefaultPathMode 额外派发 `sftp-plus-default-pathmode-changed`，
 *              面板收到后清本连接覆盖再套用；该行为与「单独切换过的随连接保存」冲突，现已移除；
 *              ④新增配置 `applySettingsInstantly`（配置保存后立即生效 / 需重开面板生效，默认立即），
 *              设置页在「默认路径模式」下方提供开关，导出/导入/字段清单同步登记。
 *              ①默认路径模式加第四档「同步路径」（settings.pathModeMirror）；②书签排序由两档扩为三档（manual/usage/name，settings.bookmarkSortHint），配置键 bookmarkSortByUsage → bookmarkSortMode，导入兼容老备份。
 *              2026-10-20 — 定制右键菜单的「补齐缺失动作」改走 fillMenuOrder（按默认顺序相对位置插入）：
 *              原逻辑一律 append 到末尾，老配置里没有「传输」时它在设置页列表与右键菜单里都沉底。
 *              2026-10-19 — 设置页五项审计修复（audit §3 P2-31..P2-35）：
 *              ① P2-31 已打开的设置页不同步面板「查看偏好」：面板底部就地切换行号/自动换行后
 *                 会广播 sftp-plus-settings-changed，而本组件的监听原先**只回读 layoutMode 与
 *                 fontSize** ⇒ 设置页内存值仍是旧的；用户随后在设置页动任一开关时，
 *                 _saveToConfig() 会把 45+ 字段连同这两个**陈旧值**一起写回，面板刚做的修改
 *                 被静默覆盖。现随同一事件一并回读 showTextLineNumbers / showTextWordWrap
 *                 （复用既有监听，不新开轮询）。
 *              ② P2-32 paneState 导出/导入不对称：导出侧是整份 paneState 克隆，导入侧却只认
 *                 layout/local/remote 三个分节 ⇒ endpoints（右栏端点类型，面板
 *                 _persistRightEndpoint 写入）与 rightLocalPath（右栏本地路径，**标量**，
 *                 进不了分节循环的 typeof 检查）被静默丢弃。现补 endpoints 分节 +
 *                 rightLocalPath 标量回写（非空串且不含控制字符）。
 *              ③ P2-33 字号滑块绑的是 (input)，拖动一次连发几十个事件 × 每次 _saveToConfig()
 *                 全量重写 config.yaml。改为 300ms 尾随写（内存值即时更新、UI 零延迟），
 *                 并在 resetFontSize / ngOnDestroy 冲刷，保证最后一次改动一定落盘。
 *              ④ P2-34 「只勾传输记录且本机无日志」时点导出：filterExportData 过滤结果为空 ⇒
 *                 既不下载文件也不给提示，用户只看到弹窗关了。现补一条 i18n 提示
 *                 settings.exportNothing（新增 24 语言，脚本 scripts/add-export-nothing-i18n.mjs），
 *                 沿用本文件导入完成/失败那套 alert 口径，不新增 UI 组件与依赖。
 *              ⑤ P2-35 导入的 lang 未做白名单校验 ⇒ 任意非法语言码落库后，effectiveLang 的
 *                 validLocales.includes 恒为 false、静默回退 detectSystemLocale()，
 *                 与面板（各自构造时读 lang）行为不一致且用户无从察觉。现只接受白名单内的
 *                 规范码（大小写不敏感归一，如 zh-cn → zh-CN）或空串（跟随系统），
 *                 非法值直接丢弃、保留本机原 lang。
 *              2026-10-08 — 新增 showTextWordWrap（查看/编辑器长行自动换行，默认 false）：
 *              「查看与编辑」小节新增开关行，并在 EXPORT_CATEGORY_FIELDS 的 other 类登记、
 *              补齐导出快照 / 导入基线 / 导入回写 —— 漏登记则该字段永远导不出去。
 *              2026-09-29 — 导出数据改为「按配置类别可勾选」：点「导出数据」先弹出勾选弹窗
 *              （界面与外观 / 面板与行为 / 传输与冲突 / 书签与记录 / 图标与文件类型，默认全选、
 *              可一键全选·全不选、一类未勾时禁用导出按钮），未勾选的类别**完全不写入** JSON。
 *              安全性来自导入侧的「字段不存在 = 不覆盖」语义 —— 所以「只导外观」的备份导入时
 *              不会清空书签、路径记忆与传输日志。类别→字段映射见 EXPORT_CATEGORY_FIELDS：
 *              ⚠ 新增配置项必须同步登记，否则该字段永远不会被导出（探针会逐键核对）。
 *              ★ 同日二次调整（用户：主要是传输记录要拆出来，其余按设置界面的分类来）：
 *              类别由 5 项改为 9 项，**逐项对齐设置页自己的分区标题与顺序** ——
 *              语言 / 主题 / 布局 / 对象图标 / 其它 / 传输设置 / 快捷键 / 数据 / 传输记录；
 *              「传输记录」(transferLogs) 从原「书签与记录」拆出**独立成项**（它是历史日志、
 *              体积通常最大，备份诉求与其他配置不同）；「数据」项只留书签/路径记忆/面板状态。
 *              类别名直接复用设置页分区标题的 key（settings.language/theme/layout/iconSettings/
 *              other/transferSection/hotkeys/data + transfer.log）⇒ 本次**不新增任何 i18n key**，
 *              并清掉了上一轮为旧分类新增的 5 个 exportCat* key（24 份 .po 同步移除）。
 *              类别增至 9 项 → 新增 .ss-export-list 列表内滚（max-height min(58vh,520px)，常规窗口下 9 行完整可见），
 *              底部按钮不被顶出屏幕。
 *              ★ 同日三次调整（用户：数据改叫「书签数据」、快捷键不要子标题、滚动条对齐 SFTP+ 面板）：
 *              ① 第 8 项类别名由设置页的「数据」(settings.data) 换为新 key settings.exportCatBookmarkData
 *                 （书签数据）—— settings.data 仍被设置页分区标题引用，不能改译文，故另起 key（新增 24 语言 × 1）；
 *                 该项子标题「书签」随之删除（名称已含「书签」）。
 *              ② 「快捷键」项子标题（settings.hotkey）删除 —— 该类只含一项内容，子描述纯冗余。
 *              ③ .ss-export-list 滚动条对齐面板 .sftp-root .pane-list 规格（8px / 圆角 4px /
 *                 三档灰度 0.06·0.28·0.45、按住主色 + Firefox scrollbar-width/color）。
 *                 ⚠ 数值取面板 `:host` 变量定义的**实际生效值**，不是面板 CSS 里
 *                 `var(--_scroll-thumb, rgba(...,0.35))` 那组兜底值（变量始终有定义，兜底轮不到）；
 *                 面板 --_scroll-* 为 :host 私有变量，设置页取不到 ⇒ 写字面值，主色取 --primary-color。
 *              ④ 底部按钮顺序**维持原样**（主操作在左、取消在右）：用户先问「取消不是在左边吗」，随后自行确认
 *                 「取消好像就是在右边」，故不做变更；该顺序也与面板内各对话框、设置页其余三个确认弹窗一致。
 *              ★ 同日四次修复（用户：为什么已经清空数据了，结果似乎还有残留的数据？）：
 *              doClearData 原实现是单层裸循环 `target[k] = defaults[k]`，在第 23 个键 panelHotkeys
 *              （ConfigProxy 的**结构成员** —— 非空对象 ⇒ 只有 getter 没有 setter）处抛 TypeError
 *              → 整个循环中断，其后的 contextMenuOrder / 传输设置 / 图标 / 冲突摘要 / 书签 / 路径记忆 /
 *              面板状态 / 传输日志 / 面板几何**全部没被清掉**；异常还被最外层 catch 吞掉，连带跳过
 *              localStorage 清理、界面刷新与提示 —— 用户看到的「点了清空但还有残留」即此。
 *              现：① localStorage 先清；② config 逐键独立 try/catch（单键失败不牵连其余）+ 新增
 *              `_resetConfigKey()` 对结构成员递归到叶子赋值；③ 补清 Tabby 级 store.hotkeys 里的
 *              「面板开关快捷键」（不在插件子树内，旧实现完全漏掉）；④ 无论 config 侧是否出错都刷新
 *              界面并通知面板，失败时把未清干净的键名附在提示里（正常路径不会走到）。
 *              配套读侧修复：清空后磁盘上 panelHotkeys 会留 `{delete:{}}` 空壳（结构成员的叶子值等于
 *              默认值时会 ConfigProxy 清洗掉）→ _readFromConfig 原先会把空壳读成「未绑定」，现改为
 *              「keys/key 与 enabled 双双缺省 ⇒ 保留默认绑定」，避免清空后 Delete/F2/F5 显示成未绑定。
 *              探针 .workbuddy/verify/clear-data-residual-probe.cjs（37 项；含用宿主机真实 ConfigProxy
 *              复现「旧写法残留 28 键 vs 新写法残留 0 键」的对照实验）。
 *              ★ 同日五次调整（用户：定制右键菜单的边框像定制工具栏那样，使用虚线边框）：
 *              .ss-menu-row 边框由 1px solid rgba(128,128,128,0.25) 改为
 *              1px dashed rgba(128,128,128,0.35) —— 与「定制工具栏」的 .ss-layout-chip 同规格
 *              （同虚线、同灰度），行背景/圆角/内距与拖拽手柄保持不变。
 *              探针 .workbuddy/verify/settings-menu-row-border-probe.cjs（同时锁死与 .ss-layout-chip 的
 *              虚线规格一致性，避免日后单边改动导致两块视觉分叉）。
 *              ★ 同日六次调整（用户：定制工具栏的行高可以对齐定制右键菜单的）：
 *              .ss-layout-chip 垂直内距 7px → 4px（与 .ss-menu-row 的 4px 一致）⇒ 两块行框**精确等高**。
 *              依据：无头浏览器量测 .workbuddy/verify/settings-row-height-bench.html ——
 *              line-height:2 环境下菜单行 34.0px、chip 改前 40.0px、改后 34.0px（34px 与用户截图实测吻合）；
 *              normal 环境下 26.0 / 32.0 / 26.0 ⇒ 差值恒为 6px，**与宿主 line-height 无关**。
 *              本质条件：两块内容盒同高（同字号 + 同 14px 复选框）⇒ 只要垂直内距相同就必然等高
 *              （所以不硬写 height，避免字体/缩放变化后失配）。
 *              ⚠ 量测坑：flex 容器默认 align-items:stretch 会把矮 chip 拉伸到同行最高者，
 *              第一次量测因此得到「padding 4px 也是 40px」的假结果 —— 必须 flex-start 再量。
 *              ★ 同日七次调整（用户：字号大小对齐 Tabby「窗口」菜单里的滑块、也是靠右显示的；
 *              查看编辑器的光标对齐 Tabby 外观的光标形状）：
 *              ① 「字号大小」滑块**整块靠右**：.ss-font-control 加 justify-content:flex-end，
 *                 滑块宽度保持不变（仍 flex:1 + max-width:280px），「13px」落到行尾最右。
 *                 另补两处让右边缘与其它行的控件**落在同一条竖线**上（无头量测 settings-right-align-bench.html）：
 *                 .ss-font-row 补 padding-right:10px（与 .ss-toggle-row 的水平内距一致）；
 *                 .ss-font-val 补 text-align:right（盒宽 36px > 文字 30px，左对齐会内缩 6px）。
 *                 量测：改前「数值文字右边缘 594 vs 开关控件右边缘 590」（右探 4px）⇒ 改后两者均为 590，差 0。
 *                 依据：Tabby 用 .form-line .header{margin-right:auto} 把控件
 *                 顶到行尾（图1 实测「间隔」滑块右边缘 x=1065px 与「窗口框架样式」按钮组右边缘
 *                 x=1064px 重合 = 内容列右边界），故本插件同款处理。
 *                 注：轨道 #111 / 4px、圆点 #aaa / 12px 由宿主全局 input[type=range] 样式提供，
 *                 实测与 Tabby 的滑块逐字相同（截图取样 track 均为 rgb(17,17,17)、thumb 均 rgb(170,170,170)），
 *                 故本次**不动滑块自身样式**，只改位置。
 *              ② 「查看编辑器光标」由 range 滑块改为**图标按钮组**（形制对齐 Tabby 外观页的
 *                 「光标形状」：btn-group + 方块字形按钮 █ │ ▁）；行仍是 .ss-toggle-row ⇒
 *                 按钮组天然靠右。原「2px」数值不再单独渲染，改为各按钮 title。
 *                 ⚠ 该按钮组的**档位语义**在同日九次调整里由「宽度 1–4px」改成「形状三档」，见下。
 *              探针 .workbuddy/verify/settings-right-align-probe.cjs（靠右与形制）
 *              ★ 同日八次调整（用户：快捷键的录制似乎无法录制滚轮的点击和上下滚动）：
 *              面板快捷键录制新增「鼠标中键」与「滚轮上滚/下滚」两类**指针绑定**
 *              （Mouse1 / WheelUp / WheelDown，可带修饰键如 Alt+WheelUp），且可绑到全部 15 个动作
 *              （原鼠标侧键只在 back/forward 两个动作上生效）。两处关键实现：
 *              ① 录制期对 wheel 必须用 `{ capture: true, passive: false }` —— window/document 上的
 *                 wheel 监听默认 passive:true，此时 preventDefault() 是空操作（浏览器只打警告），
 *                 设置页会跟着一起滚，录制框滑出视野；
 *              ② 录制与匹配共用 hotkey-util 的 pointerSpecFromEvent()，同一构造口径 ⇒ 录得出来必然匹配得上。
 *              裸滚轮（无修饰键）绑定会顶掉面板列表的滚动（要触发动作就必须吞掉默认滚动），
 *              保存后明确提示，chip 悬停也有说明（新增 settings.hotkeyWheelHint /
 *              settings.panelHotkeyWheelBareWarning 两个 key，24 语言）。
 *              探针 .workbuddy/verify/panel-pointer-hotkey-probe.cjs
 *              ★ 同日九次调整（用户：查看编辑器光标宽度「也许要改为查看编辑器光标形状了」，
 *              像 Tabby 的光标形状一样三个选项三种形状；另把「定制书签面板」挪到「表格样式」上方、
 *              「字体」挪到「表格样式」下方）：
 *              ① 「查看编辑器光标」由**宽度 1–4px 四档**改为**形状三档**，与宿主逐字同源：
 *                 取值 block / beam / underline（= Tabby 终端 store.terminal.cursor 的三档取值，
 *                 见宿主 tabby-terminal 的 appearanceSettingsTab：id cursorBlock/cursorBeam/cursorUnderline），
 *                 字形 █ │ ▁（照宿主外观页「光标形状」），仍靠右显示；行标签改为 settings.textCaretShape。
 *                 存储：textCaretWidth(number) → textCaretShape('block'|'beam'|'underline')，默认 beam
 *                 （与原 2px 竖线视觉一致；老配置里的宽度值不再读取）。
 *                 配置链路共六处入口必须同步改名 —— 默认值/类型、设置页读写、导出快照、导入回写、
 *                 EXPORT_CATEGORY_FIELDS 登记（漏登记 = 该项永远导不出去，探针 A 段锁键集严格相等）。
 *                 旧 key settings.textCaretWidth / textCaretWidthHint 已从 24 语言 po 中删除
 *                 （迁移脚本 scripts/add-caret-shape-i18n.mjs：删 2 个死 key、加 5 个形状文案 × 24 语言）。
 *              ② 「布局」分区小节重排：定制工具栏 → 定制右键菜单 → 定制书签面板 → 表格样式 → 字体
 *                 （改前：字体 → 定制工具栏 → 定制书签面板 → 定制右键菜单 → 表格样式）。
 *                 前三块都是「面板内容定制」故集中相邻；表格样式与字体收尾。
 *                 ⚠ 搬块时注意：小节由「标题容器 + 正文容器」两部分组成，按 8 空格缩进的 </div>
 *                 切块会只切到标题容器 —— 必须确认正文（字号滑块行 / 书签分组开关 + 顺序 chips）一并搬走。
 *              探针 .workbuddy/verify/caret-shape-probe.cjs（形状与配置链路）、
 *              settings-layout-sections-probe.cjs（小节顺序与块完整性）
 *              传输通道模式选项重排：「优先 TAR / 优先 SFTP」提到「仅 TAR / 仅 SFTP」之前
 *              （用户：把优先的选项提一提、仅 XX 放后），顺序 = 智能 → 优先 TAR → 优先 SFTP → 仅 TAR → 仅 SFTP
 *              同日：传输通道模式行布局与提示调整：
 *              ① 该行原先漏了 ss-toggle-row 类 → 不是两端对齐布局、下拉框未靠右；补上后与并发数/开关行一致右对齐；
 *              ② 新增 .ss-channel-select 固定宽 220px（默认 .ss-select 为 100%/max 280px，在两端对齐行里被撑满、与其它控件不协调）；
 *              ③ 模式说明不再常驻显示在行下方（移除 <p class="ss-channel-desc"> 与 channelModeDesc()），
 *                 改为各 <option> 的 title（悬停选项即显示该模式说明，i18n key 复用 settings.channelMode.*Desc）
 *              2026-09-28 — 传输设置：原「TAR 打包加速」开关升级为「传输通道模式」五选一下拉
 *              （smart/sftpOnly/tarOnly/preferSftp/preferTar）；transferChannelMode 字段替代 transferTarAcceleration，
 *              加载/保存/导出/导入均迁移旧值（false→sftpOnly）；新增 saveChannelMode() 与 channelModeDesc()
 *              2026-09-28 — 定制右键菜单改为复选框启用/停用 + 新增分组依据项；
 *              同日修订：「展开/收起所有分组」已并入「分组依据」子菜单，从定制列表移除
 *              （ContextMenuCustomId 不再含 groupToggleAll，历史配置残留值读取时丢弃）
 *              2026-09-24 — 意见反馈拆分为「报告问题 / 提出需求」两个入口；两类模板均按界面语言路由中/英表单（新增 feature_request.yml / feature_request_en.yml，字段 id 与中文版一致）
 *              2026-09-24 — 意见反馈模板按界面语言路由：中文用 bug_report.yml、其余语言用 bug_report_en.yml（新增英文版表单）
 *              2026-09-24 — 修复反馈环境信息的 Windows 版本取不准：getOSRelease 给的是 NT 内核号（10.0.26200），
 *              Win11 沿用该内核号故被误读成 Win10；改为按 build 反查市场版本名（Windows 11 25H2 (build 26200, x64)）
 *              2026-09-24 — 意见反馈预填环境信息（issues/new?body=）：模板 + Version/Tabby/Platform/Frontend/Plugins，不含隐私字段
 *              2026-09-21 — P2 修复：摘要大小上限统一经 _clampDigestMaxMB 约束到 [1,4096]MB ——
 *              原先只判 >0，输入框的 max="4096" 只是 UI 提示，手动输入与配置导入都能写进极大值
 *              2026-09-21 — 备份导入统一清洗书签、路径记忆与传输日志；
 *              隐藏原生 SFTP 开关同步写入 localStorage，与装饰器双读一致
 *              2026-09-20 — 面板热键支持打开/查看/编辑（默认未绑定）
 *              2026-09-20 — A4 审计修复：ngOnDestroy 补 _teardownPanelHotkeyRecording（面板快捷键录制中关闭设置页会残留 window 捕获监听器且全局热键未恢复）
 *              2026-09-20 — 面板热键绑定检测 Tabby 全局冲突（如 Alt+Enter=全屏）；属性等快捷键同步到右键菜单
 *              2026-09-18 — 定制书签面板开关变更后 notifyPanels，面板即时生效
 */
import { Component, Injectable, Optional, OnDestroy, Inject } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { ConfigService, HotkeysService, PlatformService, HostAppService, AppService } from 'tabby-core'
import { defaultSftpPlusConfig, normalizeCaretShape, type CaretShape } from '../tabby/config-provider'
import { SftpI18nService } from '../services/sftp-i18n.service'
import type { Locale } from '../services/sftp-i18n.service'
import { SftpConfigService } from '../services/sftp-config.service'
import { SftpTransferLogService } from '../services/sftp-transfer-log.service'
import { normalizeBookmarkPath, SftpBookmarksService } from '../services/sftp-bookmarks.service'
import { SFTP_PLUS_TOGGLE_HOTKEY } from '../tabby/hotkey-provider'
import {
  findHotkeyConflicts,
  formatHotkeyBinding,
  getKeystrokeNameFromEvent,
  isHotkeyRecordingActive,
  readToggleHotkeyBindings,
  setHotkeyRecordingActive,
  eventToPanelHotkeySpec,
  isMouseHotkeySpec,
  isWheelHotkeySpec,
  isPointerHotkeySpec,
  isBareWheelSpec,
  pointerSpecFromEvent,
  normalizePanelHotkeyKeys,
  panelHotkeySpecToTabbyBinding,
  MOUSE_BACK_SPEC,
  MOUSE_FORWARD_SPEC,
  MOUSE_MIDDLE_SPEC,
  WHEEL_UP_SPEC,
  WHEEL_DOWN_SPEC,
  type HotkeyBinding,
} from '../tabby/hotkey-util'
import {
  defaultPanelHotkeys,
  normalizeBookmarkSortMode,
  PANEL_HOTKEY_ACTIONS,
  type BookmarkSortMode,
  type FileTypeIconRule,
  type PanelHotkeyAction,
} from '../tabby/config-provider'
// ★ 2026-10-22（Deepseek-V4.1-Flash）：默认路径模式新增「同步路径」档，类型与面板共用同一联合类型
import type { PathFollowMode } from '../sftp/components/connection-lifecycle'
import { detectSystemLocale, isColorDark, parseColorLuminance } from '@common/utils'
import { DEFAULT_DATE_FORMAT, formatTextExtensionsForInput, normalizeEditableExtensions, setDateFormatPattern } from '../sftp/core/file-utils'
import { DEFAULT_ICON_MAP, BUILTIN_ICON_FILES, BUILTIN_ICON_EXTS, FOLDER_ICON_SVG, resolveSftpPlusBundledIconDir } from '../sftp/core/icon-defaults'
import { ContextMenuAction, FILE_MENU_REGISTRY, DEFAULT_FILE_MENU_ORDER, fillMenuOrder, GROUP_BY_MODES } from '../sftp/components/sftp-context-menu.component'
import {
  TOP_BAR_ITEMS, DEFAULT_TOP_BAR_ORDER, DEFAULT_TOP_BAR_PINNED, DEFAULT_TOP_BAR_DISABLED, TOP_BAR_CFG_FIELDS,
  normalizeTopBarOrder, normalizeTopBarPinned, normalizeTopBarDisabled,
  type TopBarItemId,
} from '../sftp/core/top-bar-items'
// ★ 2026-10-23：冲突重命名风格（seq / time / random）——归一化函数与面板/冲突解决器共用同一份
import { normalizeConflictRenameStyle } from '../sftp/core/conflict'
// ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动开关的「装没装」探测（契约与面板共用同一份）
import { detectQuickCmdPresence, type QuickCmdPresence } from '../sftp/core/quickcmd-link'
import { openTabbyPluginsSettings } from './sftp-open-settings'

/** ★ 2026-09-28（同日修订）：右键菜单定制项 id（文件动作 + 分组依据）。
 *  「展开/收起所有分组」已并入「分组依据」子菜单，不再作为独立定制项（用户定稿）。 */
export type ContextMenuCustomId = ContextMenuAction | 'groupBy'

import * as fs from 'fs'
import * as path from 'path'
import { log } from '../services/sftp-logger'
/** Tabby 设置页中 SFTP+ 侧栏项 ID（与 SettingsTabProvider.id 一致） */
export const SFTP_PLUS_SETTINGS_TAB_ID = 'sftp-settings'

/** webpack DefinePlugin 在每次 build 时注入的 ISO 时间戳 */
declare const __SFTP_PLUS_BUILD_TIME__: string

/** 本地存储的 key 前缀（仅浮层面板缓存和旧版兼容，不再用于设置数据） */
const PREFIX = 'sftp-plus-settings'

/** 面板热键"已清除"哨兵值：用普通可打印字符串（NUL/空串会被 Tabby 的 config 清洗逻辑删除导致 defaults 回退） */
const PANEL_HOTKEY_CLEARED = '__NONE__'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}.${key}`)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (parsed === null || parsed === undefined) return fallback
    // Basic type guard: if fallback is a primitive, ensure parsed matches
    if (typeof fallback === 'string' && typeof parsed !== 'string') return fallback
    if (typeof fallback === 'boolean' && typeof parsed !== 'boolean') return fallback
    if (typeof fallback === 'number' && typeof parsed !== 'number') return fallback
    return parsed
  } catch { return fallback }
}

/**
 * QuickCmd+ 联动的观察期时长归一化（秒）。
 * ★ 2026-10-27（Deepseek-V4.1-Flash）：外部 JSON / 手工输入都不可信 —— 上下界必须夹死：
 *   下界 1s（0 会让观察期立刻结束、等于没开）、上界 120s（再长就该去手动刷新，而不是让定时器
 *   长时间对远端 readdir 施压）。非数字/NaN/Infinity 一律回落默认 10s。
 */
function normalizeRefreshWindowSec(v: unknown): number {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return 10
  return Math.max(1, Math.min(120, Math.round(n)))
}

/**
 * 定时刷新间隔归一化（秒）。
 * ★ 2026-10-27（Deepseek-V4.1-Flash）：外部 JSON / 手工输入不可信，上下界夹死：
 *   下界 5s（低于 5 秒等于持续压远端 readdir，弱网会把通道打挂）、上界 3600s（再长就不如手动刷）。
 *   非数字/NaN/Infinity 一律回落默认 60s。
 */
function normalizeAutoRefreshIntervalSec(v: unknown): number {
  const n = Number(v)
  if (!isFinite(n) || n <= 0) return 60
  return Math.max(5, Math.min(3600, Math.round(n)))
}

/** 合并旧开关：allowViewEditAllFiles / allowEditAllFiles / allowViewAllAsText / allowViewAllFiles */
function resolveAllowViewEditAllFiles(cfg: Record<string, unknown> | null | undefined): boolean {
  if (!cfg || typeof cfg !== 'object') return false
  return cfg['allowViewEditAllFiles'] === true
    || cfg['allowEditAllFiles'] === true
    || cfg['allowViewAllAsText'] === true
    || cfg['allowViewAllFiles'] === true
}

function loadAllowViewEditAllFiles(): boolean {
  if (load('allowViewEditAllFiles', false)) return true
  if (load('allowEditAllFiles', false)) return true
  if (load('allowViewAllAsText', false)) return true
  if (load('allowViewAllFiles', false)) return true
  return false
}


const TABLE_SETTINGS_KEY = 'sftp-plus-table'

function loadTableSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`${TABLE_SETTINGS_KEY}.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

/**
 * Windows build 号 → 市场版本代号，按 build 升序（取 ≤ build 的最大条目）
 * 背景：Windows 自 Vista 起内核版本号固定 10.0.<build>，Win10/Win11 共用同一主版本，
 *       只有 build 号能区分（≥22000 = Windows 11），故必须靠此表还原出「25H2」这类用户可辨识的版本名
 */
/**
 * ★ 2026-09-29：导出类别 → 字段名清单（对应设置页「导出数据」弹窗里的勾选项）。
 * ⚠ 铁律：collectAllData() 产出的**每一个**键都必须登记在这里 —— 未登记的键永远不会被导出。
 *   新增配置项时要同步补进本表；探针 .workbuddy/verify/sftp-export-picker-probe.cjs 会拿
 *   collectAllData 的真实产出逐键核对，漏登记会被当场抓出来。
 * ★ 2026-09-29（二次调整，用户要求）：分类口径**逐项对齐设置页自己的分区标题**，
 *   顺序即设置页从下往上的分区顺序 —— 语言 / 主题 / 布局 / 对象图标 / 其它 /
 *   传输设置 / 快捷键 / 数据；并把「传输记录」从原「书签与记录」里**拆出来单独成项**
 *   （它是历史日志、体积通常最大，且备份诉求与其他配置完全不同）。
 *   弹窗里的类别名直接复用设置页分区标题的 key（settings.language/theme/layout/iconSettings/
 *   other/transferSection/hotkeys/data + transfer.log），所以本次**不新增任何 i18n key**。
 */
const EXPORT_CATEGORY_FIELDS: Record<string, string[]> = {
  // 语言（设置页「语言」分区）
  lang: ['lang'],
  // 主题（设置页「主题」分区：配色方案 + 四个自定义色 + 面板透明度 + 字体字号）
  // ★ 2026-10-23（Deepseek-V4.1-Flash）：fontSize 随 UI 从「布局」分区移到「主题」分区
  //   （字号滑块挪到「面板透明度」下方），导出分类跟着走 —— 否则用户勾「主题」导出会漏掉字号。
  //   导入侧按扁平 key 查找、不读分类，故把键换组**不影响老备份导入**。
  theme: ['theme', 'colorPrimary', 'colorBg', 'colorText', 'colorBorder', 'panelOpacity', 'fontSize'],
  // 布局（设置页「布局」分区：面板布局、定制工具栏、定制书签面板、定制右键菜单、表格样式）
  layout: [
    'layoutMode', 'tableColBorders', 'tableZebra',
    'paneCustomOrder', 'paneHiddenItems',
    'bookmarkPanelGroupByScope', 'bookmarkPanelGroupOrder', 'bookmarkLinkEnabled', 'bookmarkSortMode',
    // ★ 2026-10-22：只读兼容键一并进备份（老备份/老客户端之间来回迁移不丢排序），导入侧会折算
    'bookmarkSortByUsage',
    'contextMenuOrder', 'contextMenuDisabled',
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制（顺序 / 固定态 / 折叠开关）
    TOP_BAR_CFG_FIELDS.order, TOP_BAR_CFG_FIELDS.pinned, TOP_BAR_CFG_FIELDS.overflow, TOP_BAR_CFG_FIELDS.disabled,
  ],
  // 对象图标（设置页「对象图标」分区）
  icons: ['iconResourceDir', 'fileTypeIcons', 'disabledIconSvgs', 'folderIconSvg'],
  // 其它（设置页「其它」分区：交互、日期格式、查看/编辑、文本编辑器）
  other: [
    'hideAuthorInfo', 'hideNativeSFTPButton', 'defaultPathMode', 'applySettingsInstantly', 'defaultShowHidden',
    'openInNewTabByDefault', 'singleWorkspaceInstance', 'closeBookmarkPanelOnSelect',
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器唤起方式（顶栏标题 / 终端标识 / 两者）
    'connPickerTrigger',
    // ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash）：顶栏连接显示（别名 / 账号@地址）
    'connLabelStyle',
    'typeAheadEnabled',
    'openOnClick', 'dateFormat', 'openUnsupportedInSystem',
    // ★ 2026-10-30（meta）：文件默认动作（查看/编辑）
    'openFileDefaultAction',
    'allowViewEditAllFiles', 'allowEditAllFiles', 'allowViewAllAsText', 'editableFileExtensions',
    'showTextLineNumbers', 'showTextWordWrap', 'editorAutoUploadExternal', 'textCaretShape',
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：跨插件联动（是否接收刷新请求 + 观察期时长）——
    //   设置项在「功能性」分区，导出分类跟着走；导入侧按扁平 key 查找，换组不影响老备份。
    'refreshOnQuickCmd', 'refreshOnQuickCmdWindow',
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新列表（开关 + 间隔），同样在「功能性」分区
    'autoRefreshEnabled', 'autoRefreshInterval',
    // ★ 2026-10-28（Deepseek-V4.1-Flash）：列表刷新闪烁（默认开，在「功能性」分区）
    'listRefreshFlash',
  ],
  // 传输设置（设置页「传输设置」分区：并发、通道模式、冲突摘要、默认路径）
  transfer: [
    'transferUploadConcurrency', 'transferDownloadConcurrency', 'transferChannelMode',
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点是否只认当前目录
    'dropToCurrentDir',
    'conflictDigestEnabled', 'conflictAutoSkipSameContent',
    'conflictDigestMaxSizeMB', 'conflictDigestAlgo', 'conflictRenameStyle',
    'defaultUploadPath', 'defaultDownloadPath',
  ],
  // 快捷键（设置页「快捷键」分区：面板项快捷键）
  hotkeys: ['panelHotkeys'],
  // 数据（书签 / 路径记忆 / 面板状态）
  data: ['bookmarks', 'pathMemory', 'paneState'],
  // 传输记录（★ 2026-09-29 拆出独立成项）
  logs: ['transferLogs'],
}

const WINDOWS_BUILD_RELEASES: Array<[number, string]> = [
  [10240, '1507'], [10586, '1511'], [14393, '1607'], [15063, '1703'], [16299, '1709'],
  [17134, '1803'], [17763, '1809'], [18362, '1903'], [18363, '1909'], [19041, '2004'],
  [19042, '20H2'], [19043, '21H1'], [19044, '21H2'], [19045, '22H2'],
  [22000, '21H2'], [22621, '22H2'], [22631, '23H2'], [26100, '24H2'], [26200, '25H2'],
]

/** Darwin 内核主版本 → macOS 市场版本（19=10.15 Catalina … 24=15 Sequoia、25=26 Tahoe） */
const MACOS_BY_DARWIN: Record<number, string> = {
  19: '10.15', 20: '11', 21: '12', 22: '13', 23: '14', 24: '15', 25: '26',
}

@Component({
  template: `
    <div class="sftp-settings-page">
      <h3 class="ss-title">SFTP+</h3>
      <p class="ss-desc">{{ i18n.t('settings.desc') }}</p>

      <!-- 语言 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.language') }}</label>
        <select [(ngModel)]="lang" (ngModelChange)="saveLang()" class="ss-select">
          <option value="">{{ i18n.t('settings.followTabby') }}</option>
          <option *ngFor="let l of locales" [value]="l.code">{{ l.name }}</option>
        </select>
      </div>

      <!-- 主题 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.theme') }}</label>
        <div class="ss-color-row">
          <label *ngFor="let c of colorThemes"
            [class.ss-color-active]="theme === c.value"
            class="ss-color-swatch"
            (click)="setTheme(c.value)">
            <span class="ss-color-swatch-name">{{ themeLabel(c) }}</span>
            <span class="ss-color-swatch-preview" [style.background]="swatchPreviewBg(c)">
              <span class="ss-cp-pane">
                <span class="ss-cp-header" [style.background]="swatchCustomSurface(c)" [style.color]="swatchCustomText(c)">
                  <span class="ss-cp-hdot" [style.background]="swatchCustomText(c)"></span>
                  <span class="ss-cp-hdot" [style.background]="swatchCustomText(c)"></span>
                  <span class="ss-cp-hdot" [style.background]="swatchCustomText(c)"></span>
                  <span class="ss-cp-hpath" [style.background]="swatchCustomBorder ? swatchCustomBorder(c) : ''"></span>
                </span>
                <span class="ss-cp-rows" [style.borderColor]="swatchCustomBorder ? swatchCustomBorder(c) : ''">
                  <span class="ss-cp-row">
                    <span class="ss-cp-icon" [style.background]="swatchCustomPrimary(c)"></span>
                    <span class="ss-cp-fname" [style.background]="swatchCustomText(c)"></span>
                    <span class="ss-cp-fsize" [style.background]="swatchCustomMuted(c)"></span>
                  </span>
                  <span class="ss-cp-row">
                    <span class="ss-cp-icon" [style.background]="swatchCustomPrimary(c)"></span>
                    <span class="ss-cp-fname" [style.background]="swatchCustomText(c)"></span>
                    <span class="ss-cp-fsize" [style.background]="swatchCustomMuted(c)"></span>
                  </span>
                  <span class="ss-cp-row">
                    <span class="ss-cp-icon" [style.background]="swatchCustomPrimary(c)"></span>
                    <span class="ss-cp-fname" [style.background]="swatchCustomText(c)"></span>
                    <span class="ss-cp-fsize" [style.background]="swatchCustomMuted(c)"></span>
                  </span>
                </span>
              </span>
            </span>
          </label>
        </div>

        <!-- 配色方案详情 -->
        <div class="ss-scheme-preview" *ngFor="let c of colorThemes" [hidden]="theme !== c.value">
          <div class="ss-color-fields">
            <div class="ss-color-field">
              <label>{{ i18n.t('settings.primary') }}</label>
              <input type="color" [ngModel]="themePrimary" (change)="onColorChange('primary', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themePrimary }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ i18n.t('settings.bg') }}</label>
              <input type="color" [ngModel]="themeBg" (change)="onColorChange('bg', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBg }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ i18n.t('settings.text') }}</label>
              <input type="color" [ngModel]="themeText" (change)="onColorChange('text', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeText }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ i18n.t('settings.border') }}</label>
              <input type="color" [ngModel]="themeBorder" (change)="onColorChange('border', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBorder }}</span>
            </div>
          </div>
        </div>

        <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：面板整体透明度（50%–100%，不可全透明）。
             作用于整个 .sftp-root（含浮层/对话框/toast），拖动时 150ms 合并落盘并广播面板即时生效。 -->
        <div class="ss-toggle-row ss-pathmode-row" style="margin-top:10px;"
          title="{{ i18n.t('settings.panelOpacityHint') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.panelOpacity') }}</span>
          <div class="ss-range-wrap">
            <input class="ss-range" type="range" min="50" max="100" step="5"
              [ngModel]="panelOpacityPercent"
              (ngModelChange)="onPanelOpacityChange($event)" />
            <span class="ss-range-val">{{ panelOpacityPercent }}%</span>
          </div>
        </div>

        <!-- ★ 2026-10-23（Deepseek-V4.1-Flash）：字号的「字体」分组标题已取消（用户要求）。
             字号大小本身就是一条滑块行，与上方面板透明度**平级**即可 —— 不再套 ss-sub-head，
             也不再走带左缩进的 ss-toggle-sub；类名/结构与透明度行逐项对齐（ss-toggle-row + ss-range-wrap）。
             重置按钮随「字体」标题一起去掉后没地方放，改为挂在「字号大小」文字右侧（仍走 resetFontSize）。 -->
        <div class="ss-toggle-row ss-pathmode-row" style="margin-top:4px;">
          <span class="ss-label-with-reset">
            <span class="ss-toggle-label">{{ i18n.t('settings.fontSize') }}</span>
            <button class="ss-reset-icon-btn" (click)="resetFontSize()" [title]="i18n.t('settings.resetFont')">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13 8a5 5 0 1 1-1.8-3.85"/>
                <path d="M13 3.5v2.9h-2.9"/>
              </svg>
            </button>
          </span>
          <div class="ss-range-wrap">
            <input class="ss-range" type="range" min="11" max="18" step="1"
              [value]="fontSize" (input)="onFontSizeChange(+$any($event.target).value)" />
            <span class="ss-range-val">{{ fontSize }}px</span>
          </div>
        </div>
      </div>

      <!-- 布局 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.layout') }}</label>
        <!-- 面板布局 -->
        <div class="ss-layout-row">
          <!-- 自适应 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'auto'" (click)="setLayoutMode('auto')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="9" height="9" rx="1.5"/>
                <rect x="13" y="2" width="9" height="9" rx="1.5"/>
                <rect x="2" y="13" width="9" height="9" rx="1.5"/>
                <rect x="13" y="13" width="9" height="9" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ i18n.t('settings.layoutAdaptive') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutAdaptiveSub') }}</span>
          </div>
          <!-- 左右布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'horizontal'" (click)="setLayoutMode('horizontal')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="9" height="20" rx="1.5"/>
                <rect x="13" y="2" width="9" height="20" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ i18n.t('settings.layoutHorizontal') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutHorizontalSub') }}</span>
          </div>
          <!-- 上下布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'vertical'" (click)="setLayoutMode('vertical')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="9" rx="1.5"/>
                <rect x="2" y="13" width="20" height="9" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ i18n.t('settings.layoutVertical') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutVerticalSub') }}</span>
          </div>
          <!-- 单栏布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'single'" (click)="setLayoutMode('single')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="20" rx="1.5"/>
                <circle cx="16" cy="12" r="2.5" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ i18n.t('settings.layoutSingle') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutSingleSub') }}</span>
          </div>
        </div>


        <div class="ss-sub-head" style="margin-top:16px;">
          <div class="ss-sub-label" style="margin:0;">{{ i18n.t('settings.customToolbar') }}</div>
          <button class="ss-reset-icon-btn" (click)="resetPaneLayout()" [title]="i18n.t('settings.resetLayout')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 8a5 5 0 1 1-1.8-3.85"/>
              <path d="M13 3.5v2.9h-2.9"/>
            </svg>
          </button>
        </div>
        <div class="ss-layout-preview">
          <div class="ss-layout-chip"
            *ngFor="let item of paneCustomOrder"
            draggable="true"
            [class.dragging]="draggingCustomItem === item"
            [class.hidden]="isPaneItemHidden(item)"
            (dragstart)="onCustomDragStart(item, $event)"
            (dragover)="onCustomDragOver(item, $event)"
            (drop)="onCustomDrop(item, $event)"
            (dragend)="onCustomDragEnd()">
            <input type="checkbox" class="ss-chip-check" [checked]="!isPaneItemHidden(item)"
              (mousedown)="$event.stopPropagation()" (dragstart)="$event.stopPropagation()"
              (change)="togglePaneItemHidden(item)" />
            <span class="ss-layout-chip-handle">⋮⋮</span>
            <span>{{ paneCustomItemLabel(item) }}</span>
          </div>
        </div>
        <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：定制顶栏按钮（右上角操作按钮）：
             拖拽排序 + 「固定到顶栏 / 在 ⋯ 菜单」两态；折叠开关关闭时全部平铺（不折叠）。
             登记表与面板共用 core/top-bar-items.ts。 -->
        <div class="ss-sub-head" style="margin-top:16px;">
          <div class="ss-sub-label" style="margin:0;">{{ i18n.t('settings.customTopBar') }}</div>
          <button class="ss-reset-icon-btn" (click)="resetTopBar()" [title]="i18n.t('settings.resetTopBar')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 8a5 5 0 1 1-1.8-3.85"/>
              <path d="M13 3.5v2.9h-2.9"/>
            </svg>
          </button>
        </div>
        <div class="ss-toggle-wrap">
          <label class="ss-toggle-row" title="{{ i18n.t('settings.topBarOverflow') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.topBarOverflow') }}</span>
            <span class="ss-toggle-track" [class.active]="topBarOverflowEnabled" (click)="toggleTopBarOverflow()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
        </div>
        <div class="ss-menu-preview">
          <div class="ss-menu-row"
            *ngFor="let a of topBarOrder"
            draggable="true"
            [class.dragging]="draggingTopBarItem === a"
            (dragstart)="onTopBarDragStart(a, $event)"
            (dragover)="onTopBarDragOver(a, $event)"
            (drop)="onTopBarDrop(a, $event)"
            (dragend)="onTopBarDragEnd()">
            <span class="ss-menu-handle">⋮⋮</span>
            <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：「是否启用」复选框（与右键菜单定制同款）。
                 勾掉 = 该按钮顶栏与 ⋯ 菜单都不出现；与右侧「固定/收起」是互相独立的两件事。 -->
            <!-- ★ 2026-10-23（Deepseek-V4.1-Flash）：「关闭」（✕）也进本列表 —— 但没给面板配开关快捷键时
                 不允许停用/收起（锁住并给出说明），否则面板会失去唯一稳定出口（Esc 需焦点在面板内）。 -->
            <!-- ★ 2026-10-27（Deepseek-V4.1-Flash）：⋯（overflow）也进这个列表 —— 用户可把它拖到顶栏任意位置。
                 它不是功能按钮：复选框禁用、勾选态直接反映上方「启用折叠菜单」总开关；没有图钉（恒在顶栏，
                 不存在「收进自己」）。 -->
            <input class="ss-menu-check" type="checkbox"
              [checked]="a === 'overflow' ? topBarOverflowEnabled : isTopBarEnabled(a)"
              [disabled]="isTopBarCloseLocked(a) || a === 'overflow'"
              (change)="toggleTopBarEnabled(a)"
              (mousedown)="$event.stopPropagation()"
              [title]="a === 'overflow'
                ? i18n.t('settings.topBarOverflow')
                : (isTopBarCloseLocked(a) ? i18n.t('settings.topBarCloseNeedsHotkey') : i18n.t('settings.enableItem'))" />
            <span class="ss-menu-label" [class.disabled]="a !== 'overflow' && !isTopBarEnabled(a)">{{ topBarItemLabel(a) }}</span>
            <span class="ss-menu-note" *ngIf="isTopBarCloseLocked(a)">{{ i18n.t('settings.topBarCloseNeedsHotkey') }}</span>
            <button *ngIf="topBarOverflowEnabled && a !== 'overflow'" class="ss-pin-btn"
              [class.pinned]="isTopBarPinned(a)"
              [disabled]="!isTopBarEnabled(a) || isTopBarCloseLocked(a)"
              (mousedown)="$event.stopPropagation()"
              (click)="toggleTopBarPinned(a)"
              [title]="isTopBarPinned(a) ? i18n.t('settings.topBarPinned') : i18n.t('settings.topBarInMenu')">
              {{ isTopBarPinned(a) ? i18n.t('settings.topBarPinned') : i18n.t('settings.topBarInMenu') }}
            </button>
          </div>
        </div>
        <!-- 定制右键菜单（2026-08-22 挪到定制工具栏下方，改为每行一项） -->
        <div class="ss-sub-head" style="margin-top:16px;">
          <div class="ss-sub-label" style="margin:0;">{{ i18n.t('settings.customContextMenu') }}</div>
          <button class="ss-reset-icon-btn" (click)="resetMenuOrder()" [title]="i18n.t('settings.resetMenu')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 8a5 5 0 1 1-1.8-3.85"/>
              <path d="M13 3.5v2.9h-2.9"/>
            </svg>
          </button>
        </div>
        <div class="ss-menu-preview">
          <div class="ss-menu-row"
            *ngFor="let a of contextMenuOrder"
            draggable="true"
            [class.dragging]="draggingMenuItem === a"
            (dragstart)="onMenuDragStart(a, $event)"
            (dragover)="onMenuDragOver(a, $event)"
            (drop)="onMenuDrop(a, $event)"
            (dragend)="onMenuDragEnd()">
            <span class="ss-menu-handle">⋮⋮</span>
            <input class="ss-menu-check" type="checkbox"
              [checked]="isMenuEnabled(a)"
              (change)="toggleMenuEnabled(a)"
              (mousedown)="$event.stopPropagation()"
              [title]="i18n.t('settings.enableItem')" />
            <span class="ss-menu-label" [class.disabled]="!isMenuEnabled(a)">{{ contextMenuItemLabel(a) }}</span>
          </div>
        </div>
        <!-- 定制书签面板（2026-09-29 移到「表格样式」之前，与工具栏/右键菜单同为面板内容定制） -->
        <div class="ss-sub-head" style="margin-top:16px;">
          <div class="ss-sub-label" style="margin:0;">{{ i18n.t('settings.customBookmarkPanel') }}</div>
          <button class="ss-reset-icon-btn" (click)="resetBookmarkPanel()" [title]="i18n.t('settings.resetBookmarkPanel')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 8a5 5 0 1 1-1.8-3.85"/>
              <path d="M13 3.5v2.9h-2.9"/>
            </svg>
          </button>
        </div>
        <div class="ss-toggle-wrap">
          <label class="ss-toggle-row" title="{{ i18n.t('settings.bookmarkGroupByScopeHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.bookmarkGroupByScope') }}</span>
            <span class="ss-toggle-track" [class.active]="bookmarkPanelGroupByScope" (click)="toggleBookmarkPanelGroupByScope()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：「联动书签」——开启后新增/编辑表单多出联动路径，
               点击书签时另一栏也会跳到该路径。 -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.bookmarkLinkHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.bookmarkLink') }}</span>
            <span class="ss-toggle-track" [class.active]="bookmarkLinkEnabled" (click)="toggleBookmarkLinkEnabled()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：书签排序模式——显式选择（与弹层 footer 的图标按钮同一配置项），
               比单开关更直观：各模式的名称同时可见。
               ★ 2026-10-22（Deepseek-V4.1-Flash）：两档扩成三档（新增「名称排序」）。 -->
          <div class="ss-toggle-row ss-pathmode-row" title="{{ i18n.t('settings.bookmarkSortHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.bookmarkSort') }}</span>
            <div class="ss-segmented">
              <button type="button" class="ss-segment"
                [class.active]="bookmarkSortMode === 'manual'"
                (click)="setBookmarkSort('manual')">{{ i18n.t('bookmark.sortManual') }}</button>
              <button type="button" class="ss-segment"
                [class.active]="bookmarkSortMode === 'usage'"
                (click)="setBookmarkSort('usage')">{{ i18n.t('bookmark.sortUsage') }}</button>
              <button type="button" class="ss-segment"
                [class.active]="bookmarkSortMode === 'name'"
                (click)="setBookmarkSort('name')">{{ i18n.t('bookmark.sortName') }}</button>
            </div>
          </div>
          <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：仅「频率排序」下显示重置统计入口（拖拽/名称排序用不到计数）。
               整行右对齐 —— 与上方各开关的右缘对齐（.ss-toggle-row 的右内边距 10px）。 -->
          <div class="ss-reset-row" *ngIf="bookmarkSortMode === 'usage'">
            <span class="ss-reset-msg" *ngIf="bookmarkResetMsg">{{ bookmarkResetMsg }}</span>
            <button type="button" class="ss-mini-btn" (click)="resetBookmarkUsage()">
              {{ i18n.t('settings.bookmarkResetUsage') }}
            </button>
          </div>
        </div>
        <div class="ss-layout-preview" *ngIf="bookmarkPanelGroupByScope" style="margin-top:8px;">
          <div class="ss-layout-chip"
            *ngFor="let g of bookmarkPanelGroupOrder"
            draggable="true"
            [class.dragging]="draggingBookmarkGroup === g"
            (dragstart)="onBookmarkGroupDragStart(g, $event)"
            (dragover)="onBookmarkGroupDragOver(g, $event)"
            (drop)="onBookmarkGroupDrop(g, $event)"
            (dragend)="onBookmarkGroupDragEnd()">
            <span class="ss-layout-chip-handle">⋮⋮</span>
            <span>{{ bookmarkGroupLabel(g) }}</span>
          </div>
        </div>
        <!-- 表格样式（属于布局的子选项） -->
        <div class="ss-sub-label" style="margin-top:16px;">{{ i18n.t('settings.tableStyle') }}</div>
        <div class="ss-toggle-wrap">
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('view.colBorder') }}</span>
            <span class="ss-toggle-track" [class.active]="showColBorders" (click)="showColBorders=!showColBorders; saveTableSettings()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('view.zebra') }}</span>
            <span class="ss-toggle-track" [class.active]="showZebra" (click)="showZebra=!showZebra; saveTableSettings()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
        </div>
        <div class="ss-hint">{{ i18n.t('settings.tableStyleHint') }}</div>
        <!-- ★ 2026-10-23（Deepseek-V4.1-Flash）：字体小分栏已移到「主题」分区的「面板透明度」下方
             —— 两个都是滑块、同属面板外观，放在一起更好找；本分区改回由「表格样式」收尾。
             （历史：2026-09-29 曾由「定制工具栏」上方移到这里，理由是由表格样式收尾。） -->
      </div>

      <!-- ★ 2026-09-20：对象图标升为独立大节（原挂在「布局」下，语义不符） -->
      <div class="ss-section">
        <div class="ss-sub-head">
          <label class="ss-label" style="margin:0;">{{ i18n.t('settings.iconSettings') }}</label>
          <button class="ss-reset-icon-btn" (click)="resetIconSettings()" [title]="i18n.t('settings.resetIcons')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 8a5 5 0 1 1-1.8-3.85"/>
              <path d="M13 3.5v2.9h-2.9"/>
            </svg>
          </button>
        </div>
        <!-- 图标目录：标签与输入框同行。默认直接显示内置图标目录实际路径（非占位符） -->
        <div class="ss-toggle-row ss-path-row">
          <span class="ss-toggle-label">{{ i18n.t('settings.iconResourceDir') }}</span>
          <input class="ss-path-input" type="text" [(ngModel)]="iconDirDisplay"
            (change)="_saveToConfig()" spellcheck="false" />
        </div>

        <!-- 图标网格：文件夹 + 内置 + 自定义，hover 可编辑/删除 -->
        <div class="ss-builtin">
          <div class="ss-icon-grid">
            <!-- ① 文件夹单元格（仅显示 + hover 操作；编辑/校验在下方独立行） -->
            <div class="ss-icon-cell ss-icon-cell--folder"
              [class.ss-icon-cell--editing]="_editingFolderIcon"
              [class.ss-icon-cell--disabled]="!folderIconSvg">
              <img class="ss-icon-cell-img" [src]="'file://' + bundledIconPreviewPath(folderIconSvg || 'folder.svg')" alt="folder" draggable="false" />
              <span class="ss-icon-cell-name">folder</span>
              <span class="ss-icon-cell-exts">{{ i18n.t('settings.iconFolderHint') }}</span>
              <!-- hover 操作浮层：文件夹为系统默认规则，可编辑但不可删除/回退 emoji；禁用/恢复在左、编辑在右 -->
              <div class="ss-icon-cell-actions">
                <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--del"
                  *ngIf="!folderIconSvg"
                  (click)="restoreFolderIcon()">
                  {{ i18n.t('settings.iconEnable') }}
                </button>
                <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--edit"
                  (click)="startEditFolderIcon()">{{ i18n.t('settings.iconEdit') }}</button>
              </div>
            </div>

            <!-- ② 内置 / 自定义图标单元格（folder 已在 BUILTIN_ICON_FILES 中排除） -->
            <div class="ss-icon-cell"
              *ngFor="let item of iconGridItems; trackBy: trackByIcon"
              [class.ss-icon-cell--disabled]="isIconDisabled(item.svg)"
              [class.ss-icon-cell--editing]="_editingRuleKey === item.key">
              <img class="ss-icon-cell-img" [src]="'file://' + bundledIconPreviewPath(item.svg)" [alt]="item.name" draggable="false"
                [class.ss-icon-cell-img--dim]="isIconDisabled(item.svg)" />
              <span class="ss-icon-cell-name">{{ item.name }}</span>
              <span class="ss-icon-cell-exts">{{ item.svg === 'default.svg' ? i18n.t('settings.iconFileHint') : item.exts.join(' ') }}</span>
              <!-- hover 操作浮层：default.svg 为系统兜底图标（未匹配文件统一回退），可编辑但不可删除/禁用；禁用/删除在左、编辑在右 -->
              <div class="ss-icon-cell-actions">
                <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--del"
                  *ngIf="!isLockedIcon(item.svg)"
                  (click)="deleteIcon(item)">
                  {{ item.isBuiltin ? (isIconDisabled(item.svg) ? i18n.t('settings.iconEnable') : i18n.t('settings.iconDisable')) : i18n.t('settings.iconDelete') }}
                </button>
                <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--edit"
                  (click)="startEditIcon(item)">{{ i18n.t('settings.iconEdit') }}</button>
              </div>
            </div>

            <!-- ③ 新增自定义规则单元格（+ 号，简化：仅切换状态，表单在下方独立行） -->
            <div class="ss-icon-cell ss-icon-cell--add" (click)="toggleAddCustomRule()">
              <ng-container *ngIf="!_addingCustomRule">
                <span class="ss-icon-cell-plus">+</span>
                <span class="ss-icon-cell-name">{{ i18n.t('settings.iconAddRule') }}</span>
              </ng-container>
              <ng-container *ngIf="_addingCustomRule">
                <span class="ss-icon-cell-name" style="font-size:10px;opacity:.7">FORM ↓</span>
                <span class="ss-icon-cell-name" style="font-size:9px;opacity:.55">已展开</span>
              </ng-container>
            </div>
          </div>

          <!-- ④ 编辑图标行：卡片式多行布局 -->
          <div *ngIf="_editingRuleKey !== null" class="ss-icon-form-card">
            <div class="ss-icon-form-header">{{ i18n.t('settings.iconEdit') }}: <b>{{ _editingRuleKey }}</b></div>
            <div class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconRuleName') }}</span>
              <input class="ss-icon-form-input" type="text" [(ngModel)]="_editingRuleName"
                spellcheck="false" [placeholder]="i18n.t('settings.iconRuleNamePh')"
                [readonly]="isSystemRuleName(_editingRuleKey)"
                [attr.aria-readonly]="isSystemRuleName(_editingRuleKey) ? 'true' : null"
                [class.ss-icon-form-input--locked]="isSystemRuleName(_editingRuleKey)"
                (keydown.enter)="confirmEditIcon()" (keydown.escape)="cancelEditIcon()" />
            </div>
            <div class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconSvgNameHint') || '文件名' }}</span>
              <!-- 内置/自定义图标的文件名均可编辑（默认文件允许改图标文件名） -->
              <input class="ss-icon-form-input" type="text" [(ngModel)]="_editingIconSvgName"
                spellcheck="false" placeholder="name.svg" (keydown.enter)="confirmEditIcon()" (keydown.escape)="cancelEditIcon()" />
            </div>
            <div *ngIf="_editingIconSvgName !== 'default.svg'" class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconExtLabel') || '扩展名' }}</span>
              <input class="ss-icon-form-input ss-icon-form-input--wide" type="text" [(ngModel)]="_editingIconExts"
                spellcheck="false" (keydown.enter)="confirmEditIcon()" (keydown.escape)="cancelEditIcon()" />
            </div>
            <div *ngIf="_iconRuleError" class="ss-icon-rule-error">{{ _iconRuleError }}</div>
            <div class="ss-icon-form-actions">
              <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--ok" (click)="confirmEditIcon()">✓ {{ i18n.t('app.confirm') }}</button>
              <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--cancel" (click)="cancelEditIcon()">✕ {{ i18n.t('app.cancel') }}</button>
            </div>
          </div>

          <!-- ⑤ 编辑文件夹图标行：卡片式多行布局（规则名只读，与默认 file 一致） -->
          <div *ngIf="_editingFolderIcon" class="ss-icon-form-card">
            <div class="ss-icon-form-header">{{ i18n.t('settings.iconEdit') }}: <b>folder</b></div>
            <div class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconRuleName') }}</span>
              <input class="ss-icon-form-input ss-icon-form-input--locked" type="text" value="folder"
                readonly aria-readonly="true" spellcheck="false" tabindex="-1" />
            </div>
            <div class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconSvgNameHint') || '文件名' }}</span>
              <input class="ss-icon-form-input" type="text" [(ngModel)]="_folderIconDraft"
                spellcheck="false" placeholder="name.svg" (keydown.enter)="confirmEditFolderIcon()" (keydown.escape)="cancelEditFolderIcon()" />
            </div>
            <div *ngIf="_folderIconError" class="ss-icon-rule-error">{{ _folderIconError }}</div>
            <div class="ss-icon-form-actions">
              <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--ok" (click)="confirmEditFolderIcon()">✓ {{ i18n.t('app.confirm') }}</button>
              <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--cancel" (click)="cancelEditFolderIcon()">✕ {{ i18n.t('app.cancel') }}</button>
            </div>
          </div>

          <!-- ⑥ 新增自定义规则表单：卡片式多行布局 -->
          <div *ngIf="_addingCustomRule" class="ss-icon-form-card">
            <div class="ss-icon-form-header">{{ i18n.t('settings.iconAddRule') }}</div>
            <div class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconRuleName') }}</span>
              <input class="ss-icon-form-input" type="text" [(ngModel)]="_newRuleName" spellcheck="false"
                [placeholder]="i18n.t('settings.iconRuleNamePh')"
                (keydown.enter)="confirmAddCustomRule()" (keydown.escape)="cancelAddCustomRule()" />
            </div>
            <div class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconSvgNameHint') || '文件名' }}</span>
              <input class="ss-icon-form-input" type="text" [(ngModel)]="_newRuleSvg" spellcheck="false"
                placeholder="name.svg" (keydown.enter)="confirmAddCustomRule()" (keydown.escape)="cancelAddCustomRule()" />
            </div>
            <div class="ss-icon-form-field">
              <span class="ss-icon-form-flabel">{{ i18n.t('settings.iconExtLabel') || '扩展名' }}</span>
              <input class="ss-icon-form-input ss-icon-form-input--wide" type="text" [(ngModel)]="_newRuleExt" spellcheck="false"
                placeholder=".ext" (keydown.enter)="confirmAddCustomRule()" (keydown.escape)="cancelAddCustomRule()" />
            </div>
            <div *ngIf="_iconRuleError" class="ss-icon-rule-error">{{ _iconRuleError }}</div>
            <div class="ss-icon-form-actions">
              <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--ok" (click)="confirmAddCustomRule()">✓ {{ i18n.t('app.confirm') }}</button>
              <button type="button" class="ss-icon-cell-btn ss-icon-cell-btn--cancel" (click)="cancelAddCustomRule()">✕ {{ i18n.t('app.cancel') }}</button>
            </div>
          </div>
        </div>
      </div>


      <!-- ★ 2026-09-20：功能性瘦身——交互 / 查看与编辑；传输与快捷键升为独立大节 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.other') }}</label>
        <div class="ss-toggle-wrap">
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.hideAuthorInfo') }}</span>
            <span class="ss-toggle-track" [class.active]="hideAuthorInfo" (click)="toggleHideAuthorInfo()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.hideNativeBtn') }}</span>
            <span class="ss-toggle-track" [class.active]="hideNativeBtn" (click)="toggleHideNativeBtn()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <!-- ★ 2026-10-27（Deepseek-V4.1-Flash）：跨插件联动（默认关）——收到命令执行通知后
               进入「观察期轮询」刷新列表，命令产生的新文件一出现就能看到，不用手动刷新。
               持续刷新时长可配：列表仍在变化时会自动顺延，最多 4 倍且不超过 180s。 -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.refreshOnQuickCmdDesc') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.refreshOnQuickCmd') }}</span>
          <span class="ss-toggle-track" [class.active]="refreshOnQuickCmd" (click)="toggleRefreshOnQuickCmd()">
          <span class="ss-toggle-thumb"></span>
          </span>
          </label>
          <!-- ★ 2026-10-27（Deepseek-V4.1-Flash）：附属选项必须按子行缩进（与「只打开一个实例」同款 ss-toggle-sub），
               否则和上面的开关平级，用户会以为它是独立功能 -->
          <div class="ss-toggle-row ss-concurrency-row ss-toggle-sub" *ngIf="refreshOnQuickCmd"
          title="{{ i18n.t('settings.refreshOnQuickCmdDesc') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.refreshOnQuickCmdWindow') }}</span>
          <input class="ss-concurrency-input" type="number" min="1" max="120" step="1"
          [(ngModel)]="refreshOnQuickCmdWindow" (change)="saveRefreshOnQuickCmdWindow()" />
          </div>
          <!-- ★ 2026-10-27（Deepseek-V4.1-Flash）：开关开着但对面没装/被停用时就地提示（不弹原生框，铁律 31）。
               清单读不到（unknown）时不提示，避免冤枉用户。 -->
          <div class="ss-hint ss-quickcmd-hint" *ngIf="showQuickCmdPluginHint">
            {{ i18n.t(quickCmdPluginHintKey) }}
            <button type="button" class="ss-link-btn"
              (click)="openPluginsSettings()">{{ i18n.t('settings.refreshOnQuickCmdOpenPlugins') }}</button>
          </div>

          <!-- ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新列表（默认关）——
               与上面的 QuickCmd+ 联动互补：那条是「对面刚跑过命令」，这条是「外面一直在写这台机器」
               （日志、监控截图、CI 产物），按固定间隔刷，不需要任何插件配合。 -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.autoRefreshDesc') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.autoRefresh') }}</span>
            <span class="ss-toggle-track" [class.active]="autoRefreshEnabled" (click)="toggleAutoRefresh()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <div class="ss-toggle-row ss-concurrency-row ss-toggle-sub" *ngIf="autoRefreshEnabled"
            title="{{ i18n.t('settings.autoRefreshDesc') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.autoRefreshInterval') }}</span>
            <input class="ss-concurrency-input" type="number" min="5" max="3600" step="1"
              [(ngModel)]="autoRefreshInterval" (change)="saveAutoRefreshInterval()" />
          </div>
          <!-- ★ 2026-10-28（Deepseek-V4.1-Flash）：列表刷新闪烁（默认开）——
               切换文件夹 / 手动刷新后当前栏的淡蓝背景闪烁；关掉则不闪，其它提示（定位高亮 / 连接告警）保留。 -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.listRefreshFlash') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.listRefreshFlash') }}</span>
            <span class="ss-toggle-track" [class.active]="listRefreshFlash" (click)="toggleListRefreshFlash()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>

          <div class="ss-sub-label" style="margin-top:16px;">{{ i18n.t('settings.interaction') }}</div>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.closeBookmarkPanel') }}</span>
            <span class="ss-toggle-track" [class.active]="closeBookmarkPanelOnSelect" (click)="toggleCloseBookmarkPanelOnSelect()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row" [title]="i18n.t('settings.typeAheadHint')">
            <span class="ss-toggle-label">{{ i18n.t('settings.typeAhead') }}</span>
            <span class="ss-toggle-track" [class.active]="typeAheadEnabled" (click)="toggleTypeAheadEnabled()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.openInNewTab') }}</span>
            <span class="ss-toggle-track" [class.active]="openInNewTabByDefault" (click)="toggleOpenInNewTabByDefault()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row ss-toggle-sub" [class.disabled]="!openInNewTabByDefault">
            <span class="ss-toggle-label">{{ i18n.t('settings.singleWorkspaceInstance') }}</span>
            <span class="ss-toggle-track" [class.active]="singleWorkspaceInstance" (click)="toggleSingleWorkspaceInstance()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.defaultShowHidden') }}</span>
            <span class="ss-toggle-track" [class.active]="defaultShowHidden" (click)="toggleDefaultShowHidden()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <!-- ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器（连接面板）的唤起方式。
               三选一：顶栏连接标题（默认）/ 终端工具栏 SFTP+ 标识 / 两者都支持。 -->
          <div class="ss-toggle-row ss-pathmode-row" title="{{ i18n.t('settings.connPickerTriggerHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.connPickerTrigger') }}</span>
            <div class="ss-segmented">
              <button type="button" class="ss-segment"
                [class.active]="connPickerTrigger === 'topbar'"
                (click)="setConnPickerTrigger('topbar')">
                {{ i18n.t('settings.connPickerTopbar') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="connPickerTrigger === 'paneToolbar'"
                (click)="setConnPickerTrigger('paneToolbar')">
                {{ i18n.t('settings.connPickerBadge') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="connPickerTrigger === 'both'"
                (click)="setConnPickerTrigger('both')">
                {{ i18n.t('settings.connPickerBoth') }}
              </button>
            </div>
          </div>
          <!-- ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash）：顶栏连接显示内容（别名 / 账号@地址）。
               只影响顶栏两段文案，连接选择器浮层里的条目仍是账号@地址（其副文本本就是连接名）。 -->
          <div class="ss-toggle-row ss-pathmode-row" title="{{ i18n.t('settings.connLabelStyleHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.connLabelStyle') }}</span>
            <div class="ss-segmented">
              <button type="button" class="ss-segment"
                [class.active]="connLabelStyle === 'account'"
                (click)="setConnLabelStyle('account')">
                {{ i18n.t('settings.connLabelAccount') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="connLabelStyle === 'alias'"
                (click)="setConnLabelStyle('alias')">
                {{ i18n.t('settings.connLabelAlias') }}
              </button>
            </div>
          </div>
          <div class="ss-toggle-row ss-pathmode-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.openOnClick') }}</span>
            <div class="ss-segmented">
              <button type="button" class="ss-segment"
                [class.active]="openOnClick === 'double'"
                (click)="openOnClick = 'double'; saveInteraction()">
                {{ i18n.t('settings.clickDouble') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="openOnClick === 'single'"
                (click)="openOnClick = 'single'; saveInteraction()">
                {{ i18n.t('settings.clickSingle') }}
              </button>
            </div>
          </div>
          <!-- ★ 2026-10-30（meta）：文件默认动作（查看/编辑） -->
          <div class="ss-toggle-row ss-pathmode-row" title="{{ i18n.t('settings.openFileDefaultActionHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.openFileDefaultAction') }}</span>
            <div class="ss-segmented">
              <button type="button" class="ss-segment"
                [class.active]="openFileDefaultAction === 'view'"
                (click)="openFileDefaultAction = 'view'; saveInteraction()">
                {{ i18n.t('settings.defaultActionView') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="openFileDefaultAction === 'edit'"
                (click)="openFileDefaultAction = 'edit'; saveInteraction()">
                {{ i18n.t('settings.defaultActionEdit') }}
              </button>
            </div>
          </div>
          <div class="ss-toggle-row ss-pathmode-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.defaultPathMode') }}</span>
            <div class="ss-segmented">
              <button type="button" class="ss-segment"
                [class.active]="defaultPathMode === 'off'"
                (click)="defaultPathMode = 'off'; saveDefaultPathMode()">
                {{ i18n.t('settings.pathModeOff') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="defaultPathMode === 'remember'"
                (click)="defaultPathMode = 'remember'; saveDefaultPathMode()">
                {{ i18n.t('settings.pathModeRemember') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="defaultPathMode === 'sync'"
                (click)="defaultPathMode = 'sync'; saveDefaultPathMode()">
                {{ i18n.t('settings.pathModeSync') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="defaultPathMode === 'mirror'"
                (click)="defaultPathMode = 'mirror'; saveDefaultPathMode()"
                title="{{ i18n.t('settings.pathModeMirrorHint') }}">
                {{ i18n.t('settings.pathModeMirror') }}
              </button>
            </div>
          </div>
          <div class="ss-toggle-row ss-datefmt-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.dateFormat') }}</span>
            <div class="ss-datefmt-field">
              <input class="ss-datefmt-input" type="text" [(ngModel)]="dateFormat"
                (change)="saveDateFormat()" spellcheck="false" />
              <button type="button" class="ss-datefmt-clear" *ngIf="dateFormat !== defaultDateFormat"
                (click)="resetDateFormat(); $event.stopPropagation()"
                [title]="i18n.t('settings.dateFormatReset')">&times;</button>
            </div>
          </div>

          <div class="ss-sub-label" style="margin-top:16px;">{{ i18n.t('settings.viewerEditor') }}</div>
          <label class="ss-toggle-row" title="{{ i18n.t('settings.allowViewEditAllFilesHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.allowViewEditAllFiles') }}</span>
            <span class="ss-toggle-track" [class.active]="allowViewEditAllFiles" (click)="toggleAllowViewEditAllFiles()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <div class="ss-toggle-row ss-path-row ss-toggle-sub" *ngIf="!allowViewEditAllFiles"
            title="{{ i18n.t('settings.editableExtensionsHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.editableExtensions') }}</span>
            <input class="ss-path-input" type="text" [(ngModel)]="editableFileExtensionsText"
              (change)="saveEditorOptions()" spellcheck="false" />
          </div>
          <!-- ★ 2026-10-18：下移一行到「显示行号」之上——该开关与「可编辑/查看类型」同属文件类型策略，
               与下面的显示偏好（行号/换行/光标）分开，阅读顺序更自然 -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.openUnsupportedInSystemDesc') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.openUnsupportedInSystem') }}</span>
            <span class="ss-toggle-track" [class.active]="openUnsupportedInSystem" (click)="toggleOpenUnsupportedInSystem()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row" title="{{ i18n.t('settings.showTextLineNumbersHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.showTextLineNumbers') }}</span>
            <span class="ss-toggle-track" [class.active]="showTextLineNumbers" (click)="toggleShowTextLineNumbers()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <!-- ★ 2026-10-08：查看器/编辑器长行自动换行（查看器=按列宽切行，编辑器=textarea 软换行并隐藏行号栏） -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.showTextWordWrapHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.showTextWordWrap') }}</span>
            <span class="ss-toggle-track" [class.active]="showTextWordWrap" (click)="toggleShowTextWordWrap()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <!-- ★ 2026-10-22（Deepseek-V4.1-Flash）：外部编辑自动上传（方案 A 开关，默认关 → 走方案 B 提示） -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.editorAutoUploadExternalHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.editorAutoUploadExternal') }}</span>
            <span class="ss-toggle-track" [class.active]="editorAutoUploadExternal" (click)="toggleEditorAutoUploadExternal()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <!-- ★ 2026-09-29：光标由「宽度 1–4px」滑块改为「形状三档」按钮组 ——
               与 Tabby 外观页「光标形状」同源（同三档取值 block/beam/underline、同 █ | ▁ 字形、靠右显示） -->
          <div class="ss-toggle-row" title="{{ i18n.t('settings.textCaretShapeHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.textCaretShape') }}</span>
            <div class="ss-segmented ss-caret-seg">
              <button type="button" class="ss-segment"
                *ngFor="let opt of caretShapeOptions"
                [class.active]="textCaretShape === opt.shape"
                [title]="i18n.t(opt.labelKey)"
                (click)="onTextCaretShapeChange(opt.shape)">{{ opt.glyph }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ★ 2026-09-20：传输设置独立大节 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.transferSection') }}</label>
        <div class="ss-toggle-wrap">
            <div class="ss-toggle-row ss-concurrency-row">
          <span class="ss-toggle-label">{{ i18n.t('settings.uploadConcurrency') }}</span>
          <input class="ss-concurrency-input" type="number" min="1" max="10" step="1"
          [(ngModel)]="uploadConcurrency" (change)="saveConcurrency()" />
          </div>
          <div class="ss-toggle-row ss-concurrency-row">
          <span class="ss-toggle-label">{{ i18n.t('settings.downloadConcurrency') }}</span>
          <input class="ss-concurrency-input" type="number" min="1" max="10" step="1"
          [(ngModel)]="downloadConcurrency" (change)="saveConcurrency()" />
          </div>
          <!-- ★ 2026-09-28：传输通道模式（原「TAR 打包加速」开关升级为五选一下拉）
               ★ 2026-09-29：补 ss-toggle-row → 与其它行同为 flex 两端对齐，下拉框靠右；说明文案下移到各 option 的 title -->
          <div class="ss-toggle-row ss-concurrency-row" title="{{ i18n.t('settings.channelModeDesc') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.channelMode') }}</span>
          <select class="ss-select ss-channel-select" [(ngModel)]="transferChannelMode" (change)="saveChannelMode()">
          <option value="smart" title="{{ i18n.t('settings.channelMode.smartDesc') }}">{{ i18n.t('settings.channelMode.smart') }}</option>
          <option value="preferTar" title="{{ i18n.t('settings.channelMode.preferTarDesc') }}">{{ i18n.t('settings.channelMode.preferTar') }}</option>
          <option value="preferSftp" title="{{ i18n.t('settings.channelMode.preferSftpDesc') }}">{{ i18n.t('settings.channelMode.preferSftp') }}</option>
          <option value="tarOnly" title="{{ i18n.t('settings.channelMode.tarOnlyDesc') }}">{{ i18n.t('settings.channelMode.tarOnly') }}</option>
          <option value="sftpOnly" title="{{ i18n.t('settings.channelMode.sftpOnlyDesc') }}">{{ i18n.t('settings.channelMode.sftpOnly') }}</option>
          </select>
          </div>
          <!-- ★ 2026-09-07 issue #15：冲突时计算内容摘要，识别「mtime 变了但内容没变」 -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.conflictDigestDesc') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.conflictDigest') }}</span>
          <span class="ss-toggle-track" [class.active]="conflictDigestEnabled" (click)="toggleConflictDigest()">
          <span class="ss-toggle-thumb"></span>
          </span>
          </label>
          <label class="ss-toggle-row" *ngIf="conflictDigestEnabled" title="{{ i18n.t('settings.conflictAutoSkipDesc') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.conflictAutoSkip') }}</span>
          <span class="ss-toggle-track" [class.active]="conflictAutoSkipSameContent" (click)="toggleConflictAutoSkip()">
          <span class="ss-toggle-thumb"></span>
          </span>
          </label>
          <div class="ss-toggle-row ss-concurrency-row" *ngIf="conflictDigestEnabled"
          title="{{ i18n.t('settings.conflictDigestMaxSizeDesc') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.conflictDigestMaxSize') }}</span>
          <input class="ss-concurrency-input" type="number" min="1" max="4096" step="1"
          [(ngModel)]="conflictDigestMaxSizeMB" (change)="saveConflictDigestMaxSize()" />
          </div>
          <!-- ★ 2026-10-23：冲突「重命名」的命名风格（用户反馈随机后缀事后找不到文件）。
               控件与「传输通道模式」同款（ss-channel-select 固定宽），说明放在行 title 与各 option 的 title（示例名）。 -->
          <div class="ss-toggle-row ss-concurrency-row" title="{{ i18n.t('settings.conflictRenameStyleHint') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.conflictRenameStyle') }}</span>
          <select class="ss-select ss-channel-select" [(ngModel)]="conflictRenameStyle" (change)="saveConflictRenameStyle()">
          <option value="seq" title="file (1).txt">{{ i18n.t('settings.renameStyleSeq') }}</option>
          <option value="time" title="file_20261023-103512.txt">{{ i18n.t('settings.renameStyleTime') }}</option>
          <option value="random" title="file_A1B2C3D4.txt">{{ i18n.t('settings.renameStyleRandom') }}</option>
          </select>
          </div>
          <!-- 默认上传/下载路径 -->
          <div class="ss-toggle-row ss-path-row">
          <span class="ss-toggle-label">{{ i18n.t('settings.defaultUploadPath') }}</span>
          <input class="ss-path-input" type="text" [(ngModel)]="defaultUploadPath"
          (change)="_saveToConfig()" [placeholder]="i18n.t('settings.defaultUploadPathPh')" spellcheck="false" />
          </div>
          <div class="ss-toggle-row ss-path-row">
          <span class="ss-toggle-label">{{ i18n.t('settings.defaultDownloadPath') }}</span>
          <input class="ss-path-input" type="text" [(ngModel)]="defaultDownloadPath"
          (change)="_saveToConfig()" [placeholder]="i18n.t('settings.defaultDownloadPathPh')" spellcheck="false" />
          </div>
          <!-- ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点是否只认当前目录（默认开）。
               用户反馈：从 A 栏拖到 B 栏时手滑停在某个文件夹行上，文件被静默吞进该子目录，
               列表毫无变化，事后只能从传输记录的路径才看出来。 -->
          <label class="ss-toggle-row" title="{{ i18n.t('settings.dropToCurrentDirDesc') }}">
          <span class="ss-toggle-label">{{ i18n.t('settings.dropToCurrentDir') }}</span>
          <span class="ss-toggle-track" [class.active]="dropToCurrentDir" (click)="toggleDropToCurrentDir()">
          <span class="ss-toggle-thumb"></span>
          </span>
          </label>
        </div>
      </div>

      <!-- ★ 2026-09-20：快捷键独立大节 -->
      <div class="ss-section">
        <div class="ss-sub-head">
          <label class="ss-label" style="margin:0;">{{ i18n.t('settings.hotkeys') }}</label>
          <button class="ss-reset-icon-btn" (click)="resetPanelHotkeys()" [title]="i18n.t('settings.resetPanelHotkeys')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 8a5 5 0 1 1-1.8-3.85"/><path d="M13 3.5v2.9h-2.9"/>
            </svg>
          </button>
        </div>
            <!-- 面板 Toggle 快捷键（Tabby 全局）—— 置于第一位 -->
            <div class="ss-phk-row">
              <span class="ss-phk-label">{{ i18n.t('settings.hotkey') }}</span>
              <div class="ss-hotkey-field"
                [class.recording]="hotkeyRecording"
                [class.has-value]="!!hotkeyBindingLabel && !hotkeyRecording"
                [class.unbound]="!hotkeyBindingLabel && !hotkeyRecording">
                <button type="button" class="ss-hotkey-display"
                  (click)="startHotkeyRecording()"
                  [disabled]="!configService"
                  [title]="i18n.t('settings.hotkeyClickToSet')">
                  <ng-container *ngIf="hotkeyRecording; else hotkeyIdle">
                    {{ hotkeyRecordingPreview || i18n.t('settings.hotkeyRecording') }}
                  </ng-container>
                  <ng-template #hotkeyIdle>
                    {{ hotkeyBindingLabel || i18n.t('settings.hotkeyUnbound') }}
                  </ng-template>
                </button>
                <button type="button" class="ss-hotkey-clear" *ngIf="hotkeyRecording"
                  (click)="cancelHotkeyRecording(); $event.stopPropagation()" [title]="i18n.t('app.cancel')">×</button>
                <button type="button" class="ss-hotkey-clear" *ngIf="!hotkeyRecording && hotkeyBindingLabel"
                  (click)="clearHotkeyBinding(); $event.stopPropagation()" [title]="i18n.t('settings.hotkeyClear')">×</button>
              </div>
            </div>
            <!-- 面板操作快捷键（多绑定：每个绑定一个 chip，末尾 + 追加） -->
            <div class="ss-phk-row" *ngFor="let a of panelHotkeyActions">
              <span class="ss-phk-label">{{ i18n.t(panelHotkeyLabelKey(a)) }}</span>
              <div class="ss-hotkey-field ss-hotkey-multi"
                [class.recording]="panelHotkeyRecording === a"
                [class.has-value]="isPanelHotkeyBound(a) && panelHotkeyRecording !== a">
                <ng-container *ngIf="panelHotkeyRecording === a; else phkChips">
                  <span class="ss-hotkey-recording"
                    (click)="startPanelHotkeyRecording(a)"
                    [title]="i18n.t('settings.hotkeyClickToSet')">
                    {{ panelHotkeyRecordingPreview || i18n.t('settings.hotkeyRecording') }}
                  </span>
                </ng-container>
                <ng-template #phkChips>
                  <span class="ss-hotkey-chip" *ngFor="let k of panelHotkeyKeys(a); let i = index"
                    [class.is-mouse]="isPanelPointerHotkey(k)"
                    [title]="hotkeyChipHint(k)"
                    (click)="startPanelHotkeyRecording(a)">
                    {{ panelHotkeyLabel(k) }}
                    <button type="button" class="ss-chip-remove"
                      (click)="removePanelHotkeyAt(a, i); $event.stopPropagation()"
                      [title]="i18n.t('settings.hotkeyClear')">×</button>
                  </span>
                  <button type="button" class="ss-hotkey-add"
                    (click)="startPanelHotkeyRecording(a)"
                    [title]="i18n.t('settings.hotkeyAdd')">+</button>
                </ng-template>
              </div>
            </div>
            <!-- ★ 2026-08-31：已占用快捷键（只读，默认收起）——列出固定占用的键位，便于排查冲突 -->
            <div class="ss-occupied">
              <button type="button" class="ss-occupied-head" (click)="toggleOccupiedHotkeys()"
                [attr.aria-expanded]="occupiedHotkeysExpanded">
                <span class="ss-occupied-caret">{{ occupiedHotkeysExpanded ? '▾' : '▸' }}</span>
                <span>{{ i18n.t('settings.occupied.title') }}</span>
              </button>
              <div class="ss-occupied-body" *ngIf="occupiedHotkeysExpanded">
                <div class="ss-hint ss-occupied-hint">{{ i18n.t('settings.occupied.hint') }}</div>
                <div class="ss-occupied-group" *ngFor="let g of occupiedHotkeyGroups">
                  <div class="ss-occupied-group-title">{{ i18n.t(g.titleKey) }}</div>
                  <div class="ss-occupied-row" *ngFor="let it of g.items">
                    <span class="ss-occupied-keys">{{ formatOccupiedKeys(it.keys) }}</span>
                    <span class="ss-occupied-desc">{{ i18n.t(it.descKey) }}</span>
                  </div>
                </div>
              </div>
            </div>
        <div class="ss-hint ss-hotkey-conflict" *ngIf="hotkeyConflictNames">
          {{ i18n.t('settings.hotkeyConflict', { names: hotkeyConflictNames }) }}
        </div>
        <div class="ss-hint ss-hotkey-ok" *ngIf="hotkeySaveMessage">{{ hotkeySaveMessage }}</div>
      </div>
      <!-- 数据 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.data') }}</label>

        <!-- ★ 2026-10-23（Deepseek-V4.1-Flash）：本开关移到导出/导入/清空按钮组**上方**（用户第三次调位）。
             语义顺序：先说「改动是否即时落到面板」，再执行数据操作。
             原注释（2026-10-22 续三十八）：「配置保存后立即生效」还是「重开面板生效」；
             关闭时面板忽略设置变更广播，需关闭并重开 SFTP+ 面板；重新打开会广播一次把差异追平。
             ★ 续三十九：文案改为「调整配置立即生效」，去掉 .ss-toggle-wrap 自带 8px 上边距
               （.ss-apply-instant-wrap{margin-top:0}）—— 现在紧贴「数据」标题，按钮组自带 4px 上边距。 -->
        <div class="ss-toggle-wrap ss-apply-instant-wrap">
          <label class="ss-toggle-row" title="{{ i18n.t('settings.applyInstantHint') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.applyInstant') }}</span>
            <span class="ss-toggle-track" [class.active]="applySettingsInstantly" (click)="toggleApplySettingsInstantly()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
        </div>

        <!-- 数据导入导出 -->
        <div class="ss-backup-row">
          <button class="ss-btn" (click)="openExportDialog()">[&darr;] {{ i18n.t('settings.export') }}</button>
          <label class="ss-btn ss-btn-import">[&uarr;] {{ i18n.t('settings.import') }}
            <input type="file" accept=".json" (change)="importData($event)" style="display:none" />
          </label>
          <button class="ss-btn ss-btn-danger" (click)="openClearConfirm()">[&times;] {{ i18n.t('settings.clearAll') }}</button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.about') }}</label>
        <div class="ss-about-row">
          <!-- ★ 2026-10-27：版本号做成可点击入口（hover 提亮 + 下划线），点击打开当前版本的 GitHub Release -->
          <span class="ss-about-item ss-about-click" (click)="openVersionRelease()"
            [title]="versionReleaseUrl">{{ i18n.t('settings.version') }}: {{ pkgVersion }}</span>
          <span class="ss-about-item">{{ i18n.t('settings.buildTime') }}: {{ formatBuildTime() }}</span>
          <!-- ★ 2026-08-11：作者信息可按需隐藏（开启需点 Star 确认） -->
          <!-- ★ 2026-10-27：作者名做成可点击入口（hover 提亮 + 下划线），点击跳到作者 GitHub 主页 -->
          <span class="ss-about-item ss-about-click" *ngIf="!hideAuthorInfo"
            (click)="openAuthorProfile()"
            [title]="authorProfileUrl">{{ i18n.t('settings.author') }}: DD1024z</span>
        </div>
        <div class="ss-about-row ss-about-links">
          <span class="ss-about-link" (click)="openGithub()">
            <img class="ss-about-icon" [src]="'file://' + bundledIconPreviewPath('github.svg')"
              alt="" aria-hidden="true" draggable="false" />
            <span class="ss-about-label">{{ i18n.t('settings.githubSource') }}</span>
          </span>
          <!-- ★ 2026-08-25：GitHub 源码右侧新增 NPM 包链接 -->
          <span class="ss-about-link" (click)="openNpm()">
            <img class="ss-about-icon" [src]="'file://' + bundledIconPreviewPath('npm.svg')"
              alt="" aria-hidden="true" draggable="false" />
            <span class="ss-about-label">{{ i18n.t('settings.npmSource') }}</span>
          </span>
          <!-- ★ 2026-10-22：赞助入口（ko-fi），按用户要求置于「点赞支持」左侧 -->
          <span class="ss-about-link" (click)="openKofi()">
            <img class="ss-about-icon" [src]="'file://' + bundledIconPreviewPath('kofi.svg')"
              alt="" aria-hidden="true" draggable="false" />
            <span class="ss-about-label">{{ i18n.t('settings.buyCoffee') }}</span>
          </span>
          <span class="ss-about-link" (click)="openGithub()">
            ⭐ <span class="ss-about-label">{{ i18n.t('settings.giveStar') }}</span>
          </span>
          <span class="ss-about-link" (click)="openBugReport()">
            🐞 <span class="ss-about-label">{{ i18n.t('settings.reportBug') }}</span>
          </span>
          <span class="ss-about-link" (click)="openFeatureRequest()">
            💡 <span class="ss-about-label">{{ i18n.t('settings.featureRequest') }}</span>
          </span>
        </div>
      </div>

      <!-- 主题颜色修改确认弹窗 -->
      <div class="ss-overlay" *ngIf="showThemeColorConfirm" (click)="cancelThemeColorOverwrite()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title">{{ i18n.t('settings.modifyColors') }}</div>
          <div class="ss-edit-field">
            <p>{{ i18n.t('settings.overwriteConfirm') }}</p>
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn ss-btn-danger" (click)="confirmThemeColorOverwrite()">{{ i18n.t('settings.overwrite') }}</button>
            <button class="ss-btn" (click)="cancelThemeColorOverwrite()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- ★ 2026-09-29：导出内容勾选弹窗（按配置类别选择要写入备份文件的内容）。
           未勾选的类别完全不写入 JSON —— 导入侧是「字段不存在 = 不覆盖」语义，
           故「只导外观」的备份导入时不会动到书签、路径记忆等数据。 -->
      <div class="ss-overlay" *ngIf="showExportDialog" (click)="closeExportDialog()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal ss-export-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode"
          (click)="$event.stopPropagation()">
          <div class="ss-edit-title">{{ i18n.t('settings.export') }}</div>
          <div class="ss-edit-field">
            <p class="ss-export-hint">{{ i18n.t('settings.exportPickHint') }}</p>

            <!-- ★ 2026-09-29：九类逐项对齐设置页分区标题；.ss-export-list 内滚，避免弹窗超高 -->
            <div class="ss-export-list">
              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickLang" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.language') }}</span>
                  <span class="ss-export-sub">{{ i18n.t('settings.followTabby') }}</span>
                </span>
              </label>

              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickTheme" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.theme') }}</span>
                  <span class="ss-export-sub">{{ i18n.t('settings.primary') }} · {{ i18n.t('settings.bg') }} · {{ i18n.t('settings.text') }} · {{ i18n.t('settings.border') }}</span>
                </span>
              </label>

              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickLayout" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.layout') }}</span>
                  <span class="ss-export-sub">{{ i18n.t('settings.font') }} · {{ i18n.t('settings.customToolbar') }} · {{ i18n.t('settings.customContextMenu') }} · {{ i18n.t('settings.customBookmarkPanel') }}</span>
                </span>
              </label>

              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickIcons" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.iconSettings') }}</span>
                  <span class="ss-export-sub">{{ i18n.t('settings.iconResourceDir') }}</span>
                </span>
              </label>

              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickOther" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.other') }}</span>
                  <span class="ss-export-sub">{{ i18n.t('settings.interaction') }} · {{ i18n.t('settings.dateFormat') }}</span>
                </span>
              </label>

              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickTransfer" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.transferSection') }}</span>
                  <span class="ss-export-sub">{{ i18n.t('settings.uploadConcurrency') }} · {{ i18n.t('settings.channelMode') }} · {{ i18n.t('settings.conflictDigest') }} · {{ i18n.t('settings.conflictRenameStyle') }}</span>
                </span>
              </label>

              <!-- 快捷键 / 书签数据：只有一项内容，子描述纯属冗余（用户 2026-09-29 提出删掉） -->
              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickHotkeys" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.hotkeys') }}</span>
                </span>
              </label>

              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickData" class="ss-export-check" />
                <span class="ss-export-text">
                  <span class="ss-export-name">{{ i18n.t('settings.exportCatBookmarkData') }}</span>
                </span>
              </label>

              <label class="ss-export-item">
                <input type="checkbox" [(ngModel)]="exportPickLogs" class="ss-export-check" />
                <span class="ss-export-text">
                  <!-- 传输记录无更贴切的现成子描述 key（settings.clearCompleted 并不存在），故只留标题 -->
                  <span class="ss-export-name">{{ i18n.t('transfer.log') }}</span>
                </span>
              </label>
            </div>

            <div class="ss-export-foot">
              <button type="button" class="ss-btn-xs" (click)="toggleExportAll()">
                {{ exportAllPicked ? i18n.t('settings.exportDeselectAll') : i18n.t('settings.exportSelectAll') }}
              </button>
            </div>
          </div>
          <!-- 底部顺序：主操作在左、取消在右（★ 2026-09-29：用户一度要求换序，随后自行确认「取消就是在右边」，
               故维持原序，与面板内对话框及设置页其余三个确认弹窗一致） -->
          <div class="ss-edit-footer">
            <button class="ss-btn ss-btn-primary" (click)="exportData()"
              [disabled]="!exportPickCount">{{ i18n.t('settings.export') }}</button>
            <button class="ss-btn" (click)="closeExportDialog()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- 清空数据确认弹窗 -->
      <div class="ss-overlay" *ngIf="showClearConfirm" (click)="closeClearConfirm()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title" style="color:var(--primary-color,#e24b4a);">{{ i18n.t('settings.clearAllTitle') }}</div>
          <div class="ss-edit-field">
            <p>
              {{ i18n.t('settings.clearAllConfirm') }}
            </p>
            <label>{{ i18n.t('settings.clearAllPrompt') }}</label>
            <input class="ss-edit-input" type="text" [(ngModel)]="clearConfirmInput"
              (keydown.enter)="doClearData()" placeholder="DELETE" />
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn ss-btn-danger" (click)="doClearData()"
              [style.opacity]="clearConfirmInput !== 'DELETE' ? '0.5' : '1'"
              [disabled]="clearConfirmInput !== 'DELETE'">{{ i18n.t('settings.clear') }}</button>
            <button class="ss-btn" (click)="closeClearConfirm()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- ★ 2026-08-11：隐藏作者信息确认弹窗（点击开启时已自动打开仓库链接） -->
      <div class="ss-overlay" *ngIf="showHideAuthorConfirm" (click)="cancelHideAuthor()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title">⭐ {{ i18n.t('settings.hideAuthorInfo') }}</div>
          <div class="ss-edit-field">
            <p>{{ i18n.t('settings.hideAuthorConfirmText') }}</p>
          <span class="ss-about-link" (click)="openKofi()">☕ <span class="ss-about-label">{{ i18n.t('settings.buyCoffee') }}</span></span>
          <span class="ss-about-link" (click)="openGithub()">⭐ <span class="ss-about-label">{{ i18n.t('settings.giveStar') }}</span></span>
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn" (click)="confirmHideAuthor()">{{ i18n.t('settings.starredConfirm') }}</button>
            <button class="ss-btn" (click)="cancelHideAuthor()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .sftp-settings-page { padding:20px; max-width:600px; }
    .ss-title { color:var(--primary-color,#3b82f6); font-size:18px; margin-bottom:6px; }
    .ss-desc { opacity:.7; font-size:13px; line-height:1.6; margin-bottom:24px; }
    .ss-section { border-top:1px solid rgba(128,128,128,0.2); padding-top:16px; margin-bottom:16px; }
    .ss-label { display:block; font-size:16px; font-weight:600; margin-bottom:10px; }
    .ss-sub-label { font-size:14px; font-weight:600; margin-top:16px; margin-bottom:8px; opacity:.85; }
    .ss-select {
      width:100%; max-width:280px;
      padding:7px 10px; border-radius:6px;
      background: rgba(128,128,128,0.1);
      border:1px solid rgba(128,128,128,0.25);
      font-size:13px; cursor:pointer; outline:none;
      color: inherit;
      color-scheme: inherit;
    }
    .ss-select option { color: initial; }
    .ss-pathmode-row { display:flex; align-items:center; justify-content:space-between; }
    .ss-segmented {
      display:inline-flex; align-items:center;
      border:1px solid rgba(128,128,128,0.25); border-radius:6px;
      overflow:hidden; background:rgba(128,128,128,0.08);
    }
    .ss-segment {
      appearance:none; border:none; background:transparent;
      padding:5px 14px; font-size:13px; color:inherit;
      cursor:pointer; outline:none; line-height:1.4;
      transition: background .12s, color .12s;
    }
    .ss-segment + .ss-segment { border-left:1px solid rgba(128,128,128,0.2); }
    .ss-segment:hover { background:rgba(128,128,128,0.12); }
    .ss-segment.active { background:rgba(128,128,128,0.35); }
    .ss-select:focus { border-color: var(--primary-color, #3b82f6); }
    /* ★ 2026-09-29：传输通道模式下拉——靠右并与数字输入框/开关的右边缘对齐。
       默认 .ss-select 是 width:100%/max-width:280px，在两端对齐行里会被撑满、观感与其它控件不一致，故收敛为固定宽；
       flex:0 0 auto 防止被 flex 压缩（语言切换后选项文案变长时仍完整显示）。 */
    .ss-channel-select { width: 220px; max-width: 220px; flex: 0 0 auto; }
    .ss-auto-badge { opacity:.85; color: var(--primary-color, #3b82f6); font-size:11px; }

    .ss-color-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
    .ss-color-swatch {
      display:inline-flex; flex-direction:column; align-items:center; gap:4px;
      padding:8px; border-radius:10px; border:2px solid transparent;
      font-size:12px; font-weight:500; cursor:pointer; transition:border-color .15s;
      min-width:80px;
    }
    .ss-color-swatch:hover { opacity:.85; }
    .ss-color-active { border-color: var(--primary-color,#3b82f6) !important; box-shadow:0 0 0 1px rgba(59,130,246,.3); }
    .ss-color-swatch-name { font-size:11px; font-weight:600; }
    .ss-color-swatch-preview {
      display:flex; flex-direction:column; border-radius:6px; overflow:hidden;
      width:86px; border:1px solid rgba(128,128,128,.2);
    }
    /* 迷你面板预览 */
    .ss-cp-pane { display:flex; flex-direction:column; flex:1; }
    .ss-cp-header { display:flex; align-items:center; gap:3px; padding:4px 6px; }
    .ss-cp-hdot { width:5px; height:5px; border-radius:50%; opacity:0.5; flex-shrink:0; }
    .ss-cp-hpath { flex:1; height:3px; border-radius:2px; opacity:0.25; min-width:0; }
    .ss-cp-rows { display:flex; flex-direction:column; gap:2px; padding:3px 4px; border-top:1px solid transparent; }
    .ss-cp-row { display:flex; align-items:center; gap:3px; }
    .ss-cp-icon { width:8px; height:8px; border-radius:2px; opacity:0.7; flex-shrink:0; }
    .ss-cp-fname { flex:1; height:3px; border-radius:2px; opacity:0.5; min-width:0; }
    .ss-cp-fsize { width:18px; height:3px; border-radius:2px; opacity:0.3; flex-shrink:0; }

    .ss-scheme-preview { margin-top:8px; }
    .ss-color-fields { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; }
    .ss-color-field { display:flex; flex-direction:column; gap:3px; }
    .ss-color-field label { font-size:12px; font-weight:500; }
    .ss-color-input { width:44px; height:30px; border:none; border-radius:6px; cursor:pointer; }
    .ss-color-val { font-size:11px; font-family:monospace; opacity:.6; }

    .ss-col-list { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
    .ss-col-item {
      display:flex; align-items:center; gap:8px;
      padding:6px 10px; border-radius:6px;
      font-size:13px; cursor:pointer; flex:1;
    }
    .ss-col-item input { margin:0; }
    .ss-col-item:hover { background: rgba(128,128,128,0.08); }

    /* 表格样式 - Tabby 风格开关 */
    .ss-toggle-wrap { display:flex; flex-direction:column; gap:4px; margin-top:8px; }
    /* ★ 2026-10-22 续三十九（Deepseek-V4.1-Flash）：「调整配置立即生效」紧跟数据区按钮组，
       不能沿用 ss-toggle-wrap 的 8px 上边距（叠加 ss-toggle-row 的 8px padding ⇒ 视觉上离按钮太远）。 */
    .ss-apply-instant-wrap { margin-top: 0; }
    .ss-toggle-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 10px; border-radius:6px;
      font-size:13px; cursor:pointer; user-select:none;
    }
    .ss-toggle-row:hover { background:rgba(128,128,128,0.06); }
    .ss-toggle-label { font-size:13px; line-height:1.4; }
    .ss-toggle-track {
      position:relative; flex-shrink:0;
      width:36px; height:20px; border-radius:10px;
      background:rgba(128,128,128,0.25);
      transition:background .2s; cursor:pointer;
    }
    .ss-toggle-track.active { background:var(--primary-color,#3b82f6); }
    .ss-toggle-thumb {
      position:absolute; top:2px; left:2px;
      width:16px; height:16px; border-radius:50%;
      background:#fff; transition:transform .2s;
    }
    .ss-toggle-track.active .ss-toggle-thumb { transform:translateX(16px); }
    .ss-toggle-sub { padding-left: 18px; }
    .ss-toggle-sub.disabled { opacity: .45; pointer-events: none; }

    /* 设置面板提示文字 */
    .ss-hint { font-size:11px; opacity:.5; margin-top:6px; }
    /* ★ 2026-10-23（Deepseek-V4.1-Flash）：取消 .ss-font-row / .ss-font-control / .ss-font-val
       （⛔ 注释里别写反引号：本文件样式是模板字符串，反引号会提前闭合）。
       字号行改为与「面板透明度」同一套类（ss-toggle-row + ss-range-wrap + ss-range-val），
       两行的滑块宽度、数值列宽、右缘位置因此天然一致（原先靠 padding-right:10px 手工对齐）。
       注：轨道 #111 / 圆点 #aaa 仍由宿主全局 input[type=range] 样式提供。 */
    .ss-range {
      flex:1; min-width:120px; max-width:280px; height:4px; cursor:pointer;
      accent-color: var(--primary-color, #3b82f6);
    }
    /* 行内「标签 + 小重置图标」：字号行去掉分组标题后，重置入口跟着标签走。
       图标压到 18px —— 与标签行高(13px × 1.4 ≈ 18px)等高，行高不会因按钮从 34px 涨到 40px，
       否则与相邻的「面板透明度」行不等高。 */
    .ss-label-with-reset { display:inline-flex; align-items:center; gap:4px; }
    .ss-label-with-reset .ss-reset-icon-btn { width:18px; height:18px; border-radius:5px; }
    .ss-label-with-reset .ss-reset-icon-btn svg { width:12px; height:12px; }
    /* ★ 2026-09-29：查看编辑器光标宽度按钮组 —— 形制对齐 Tabby 外观页「光标形状」
       （等宽方块字形按钮：▏▎▍▌ 表示 1–4px；行本身是 .ss-toggle-row，故按钮组天然靠右） */
    .ss-caret-seg .ss-segment {
      width:34px; padding:5px 0; text-align:center;
      font-family:monospace; font-size:13px;
    }
    .ss-datefmt-row { gap: 12px; cursor: default; }
    .ss-datefmt-field {
      position: relative; display: inline-flex; align-items: center;
      flex-shrink: 0; min-width: 140px; max-width: 240px;
    }
    .ss-datefmt-input {
      flex: 1; min-width: 0; width: 100%;
      padding: 6px 28px 6px 10px; border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
      color: inherit; font-size: 12px; outline: none;
      font-family: monospace; box-sizing: border-box;
      /* 覆盖 .ss-toggle-row 继承的 user-select:none —— 否则输入框在 Electron 下无法编辑 */
      user-select: text; -webkit-user-select: text; cursor: text;
    }
    .ss-datefmt-input:focus { border-color: var(--primary-color, #3b82f6); }
    .ss-datefmt-input::placeholder { color: inherit; opacity: .4; }
    .ss-datefmt-clear {
      position: absolute; right: 2px; top: 50%; transform: translateY(-50%);
      width: 20px; height: 20px; padding: 0; line-height: 1;
      border: none; border-radius: 4px;
      background: transparent; color: inherit; opacity: .45; cursor: pointer;
      font-size: 15px;
    }
    .ss-datefmt-clear:hover { opacity: .9; background: rgba(128,128,128,0.14); }
    .ss-datefmt-hint { margin-top: 2px; line-height: 1.6; }
    .ss-concurrency-row { gap: 12px; cursor: default; }
    .ss-concurrency-input {
      width: 64px; padding: 6px 8px; border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
      color: inherit; font-size: 13px; outline: none;
      text-align: center; box-sizing: border-box;
    }
    .ss-concurrency-input:focus { border-color: var(--primary-color, #3b82f6); }
    .ss-path-row { gap: 12px; cursor: default; }
    .ss-path-input {
      flex: 1; min-width: 0; padding: 6px 8px; border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
      color: inherit; font-size: 13px; outline: none;
      box-sizing: border-box;
      user-select: text; -webkit-user-select: text; cursor: text;
    }
    .ss-path-input:focus { border-color: var(--primary-color, #3b82f6); }
    .ss-icon-rules { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .ss-icon-rule-head, .ss-icon-rule {
      display: grid; grid-template-columns: 90px 1fr 36px 28px; gap: 8px; align-items: center;
    }
    .ss-icon-rule-head { font-size: 11px; opacity: .65; padding: 0 2px; }
    .ss-icon-rule { }
    .ss-icon-ext-input, .ss-icon-svg-input {
      width: 100%; padding: 5px 8px; border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
      color: inherit; font-size: 12px; outline: none; box-sizing: border-box;
    }
    .ss-icon-ext-input:focus, .ss-icon-svg-input:focus { border-color: var(--primary-color, #3b82f6); }
    .ss-icon-prev { display: flex; align-items: center; justify-content: center; }
    .ss-icon-prev img { width: 18px; height: 18px; object-fit: contain; }
    .ss-icon-del {
      width: 24px; height: 24px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06); color: inherit; cursor: pointer; font-size: 14px; line-height: 1;
    }
    .ss-icon-del:hover { background: rgba(226,75,74,0.14); border-color: rgba(226,75,74,0.4); }
    .ss-icon-add { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
    .ss-icon-hint { font-size: 11px; opacity: .6; }

    /* ── 图标网格（2026-08-24 重构）── */
    .ss-builtin { margin-top: 6px; }
    .ss-icon-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px;
    }
    .ss-icon-cell {
      position:relative; display:flex; flex-direction:column; align-items:center; gap:3px;
      padding:10px 6px; border-radius:10px; border:1px solid rgba(128,128,128,0.18);
      background:rgba(128,128,128,0.05); text-align:center; cursor:default;
      transition:border-color .15s, box-shadow .15s, opacity .2s;
    }
    .ss-icon-cell:hover {
      border-color: var(--primary-color, #3b82f6); box-shadow: 0 0 0 1px rgba(59,130,246,.12);
    }
    .ss-icon-cell--disabled { opacity:.4; }
    .ss-icon-cell--editing {
      border-color: var(--primary-color, #3b82f6); box-shadow: 0 0 0 2px rgba(59,130,246,.18);
    }
    .ss-icon-cell--add {
      border-style:dashed; cursor:pointer; justify-content:center; min-height:90px;
    }
    .ss-icon-cell--add:hover { border-color: var(--primary-color, #3b82f6); background:rgba(59,130,246,.06); }
    .ss-icon-cell-img { width:28px; height:28px; object-fit:contain; transition:opacity .2s; }
    .ss-icon-cell-img--dim { opacity:.35; }
    .ss-icon-cell-name { font-size:11px; opacity:.85; word-break:break-all; line-height:1.2; }
    .ss-icon-cell-exts { font-size:9.5px; opacity:.5; word-break:break-all; line-height:1.3; max-height:36px; overflow:hidden; }
    /* hover 操作浮层：纯 CSS :hover 驱动（不依赖 JS 状态，避免 *ngFor 重建 DOM 后 mouseleave 丢失导致按钮常驻） */
    .ss-icon-cell-actions {
      position:absolute; bottom:4px; right:4px; z-index:2; display:flex; gap:4px;
      opacity:0; pointer-events:none; transition:opacity .15s;
    }
    .ss-icon-cell:hover .ss-icon-cell-actions,
    .ss-icon-cell-actions:hover { opacity:1; pointer-events:auto; }
    .ss-icon-cell-btn {
      height:20px; padding:0 7px; border-radius:5px; border:1px solid rgba(128,128,128,.3);
      background:rgba(48,52,60,.94); color:#fff; cursor:pointer;
      font-size:10px; line-height:1; display:flex; align-items:center; justify-content:center; white-space:nowrap;
      transition:background .12s, border-color .12s;
    }
    .ss-icon-cell-btn:hover { background:rgba(128,128,128,.2); }
    .ss-icon-cell-btn--edit:hover { background:rgba(59,130,246,.14); border-color:rgba(59,130,246,.4); }
    .ss-icon-cell-btn--del:hover { background:rgba(220,53,69,.12); border-color:rgba(220,53,69,.35); }
    .ss-icon-cell-btn--ok:hover { background:rgba(40,167,69,.14); border-color:rgba(40,167,69,.4); }
    .ss-icon-cell-btn--cancel:hover { background:rgba(220,53,69,.12); border-color:rgba(220,53,69,.35); }
    /* 编辑态 inline input */
    .ss-icon-cell-ext-input {
      width:100%; padding:3px 5px; border-radius:5px; border:1px solid rgba(128,128,128,.25);
      background:rgba(128,128,128,.08); color:inherit; font-size:11px; outline:none;
      text-align:center; box-sizing:border-box;
    }
    .ss-icon-cell-ext-input:focus { border-color:var(--primary-color,#3b82f6); }
    .ss-icon-cell-edit-actions { display:flex; gap:4px; margin-top:2px; }
    .ss-icon-cell-plus { font-size:22px; line-height:1; opacity:.55; }
    .ss-icon-cell-add-form {
      display:flex; flex-direction:column; align-items:center; gap:4px; width:100%;
    }
    .ss-icon-cell-edit-form {
      display:flex; flex-direction:column; align-items:center; gap:4px; width:100%;
    }
    .ss-icon-cell-ext-input[readonly] {
      opacity:.6; cursor:not-allowed; background:rgba(128,128,128,.04);
    }
    .ss-icon-rule-error {
      display:flex; align-items:center; justify-content:center; gap:4px;
      font-size:10.5px; color:#fff; background:rgba(226,91,74,.9);
      padding:3px 6px; border-radius:4px; line-height:1.3; text-align:center; word-break:break-all;
      font-weight:500;
    }
    .ss-icon-rule-error::before { content:'⚠'; }
    .ss-icon-cell--folder { background:rgba(227,179,65,.06); border-color:rgba(227,179,65,.25); }
    /* 卡片式表单（编辑/新增/编辑文件夹）：每字段独占一行，扩展名输入框给足宽度 */
    .ss-icon-form-card {
      display:flex; flex-direction:column; gap:10px; margin-top:12px;
      padding:14px 16px; border-radius:10px; border:1px dashed rgba(59,130,246,.4);
      background:rgba(59,130,246,.04);
    }
    .ss-icon-form-header {
      font-size:12.5px; font-weight:600; opacity:.9; border-bottom:1px solid rgba(128,128,128,.15);
      padding-bottom:8px; margin-bottom:2px;
    }
    .ss-icon-form-field {
      display:flex; align-items:center; gap:10px;
    }
    .ss-icon-form-flabel {
      font-size:11px; opacity:.65; flex:0 0 auto; min-width:42px;
    }
    .ss-icon-form-input {
      flex:1 1 auto; padding:6px 10px; border-radius:6px; border:1px solid rgba(128,128,128,.25);
      background:rgba(128,128,128,.08); color:inherit; font-size:12px; outline:none;
      box-sizing:border-box; min-width:0;
    }
    .ss-icon-form-input:focus { border-color:var(--primary-color,#3b82f6); }
    .ss-icon-form-input[readonly],
    .ss-icon-form-input--locked { opacity:.55; cursor:not-allowed; background:rgba(128,128,128,.04); pointer-events:none; }
    .ss-icon-form-input--wide { min-height:32px; }
    .ss-icon-form-actions {
      display:flex; justify-content:flex-end; gap:8px; margin-top:4px;
    }
    .ss-hotkey-row {
      display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px;
    }
    .ss-hotkey-toggle-row {
      gap: 12px;
    }
    .ss-hotkey-field {
      position: relative;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      min-width: 140px;
      max-width: 240px;
      border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
    }
    .ss-hotkey-field.has-value {
      border-color: rgba(128,128,128,0.35);
    }
    .ss-hotkey-field.recording {
      border-color: var(--primary-color,#3b82f6);
      box-shadow: 0 0 0 1px var(--primary-color,#3b82f6);
      animation: ss-hotkey-pulse 1.2s ease-in-out infinite;
    }
    .ss-hotkey-display {
      flex: 1;
      min-width: 0;
      text-align: center;
      padding: 4px 28px 4px 10px;
      border: none;
      background: transparent;
      color: inherit;
      font-size: 12px;
      font-family: ui-monospace, Consolas, monospace;
      cursor: pointer;
      opacity: .85;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ss-hotkey-field.has-value .ss-hotkey-display,
    .ss-hotkey-field.recording .ss-hotkey-display {
      opacity: 1;
    }
    .ss-hotkey-display:disabled { opacity:.45; cursor:not-allowed; }
    .ss-hotkey-clear {
      position: absolute;
      right: 2px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px; height: 20px; padding: 0;
      border: none; border-radius: 4px;
      background: transparent; color: inherit; opacity: .45; cursor: pointer;
      font-size: 14px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .ss-hotkey-clear:hover { opacity: .9; background: rgba(128,128,128,0.14); }
    @keyframes ss-hotkey-pulse {
      0%,100% { background: rgba(59,130,246,0.06); }
      50% { background: rgba(59,130,246,0.14); }
    }
    .ss-hotkey-conflict { color:#e24b4a; opacity:.9; }
    .ss-hotkey-ok { color:#22a06b; opacity:.9; }
    /* 2026-10-27：QuickCmd+ 未安装/被停用时的就地提示（琥珀色，弱于错误红，不抢眼但要能看见） */
    .ss-quickcmd-hint { color:#e2a03f; opacity:.9; }
    .ss-quickcmd-hint .ss-link-btn {
      background:none;
      border:0;
      padding:0;
      margin-left:6px;
      color:inherit;
      font:inherit;
      text-decoration:underline;
      text-underline-offset:2px;
      cursor:pointer;
    }
    .ss-quickcmd-hint .ss-link-btn:hover { opacity:.8; }

    /* 面板快捷键行（作为子分类，不使用分隔线条）—— 与 ss-toggle-row 左对齐 */
    .ss-phk-row {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 10px; border-radius: 6px;
    }
    /* ★ 2026-08-24：与 .ss-toggle-row 保持一致的 hover 反馈（视觉对称，整行非点击区但需反馈） */
    .ss-phk-row:hover { background: rgba(128,128,128,0.06); }
    .ss-phk-label { flex: 1; font-size: 12.5px; }
    .ss-hotkey-field.unbound { border-style: dashed; opacity: .65; }

    /* ★ 2026-08-31：多绑定 chip 列表（一动作可绑多个键，鼠标侧键以不同配色区分） */
    .ss-hotkey-multi {
      min-width: 0; max-width: none; flex-wrap: wrap;
      gap: 4px; padding: 3px 4px;
      align-items: center;
    }
    .ss-hotkey-chip {
      display: inline-flex; align-items: center; gap: 2px;
      padding: 2px 4px 2px 7px; border-radius: 4px;
      border: 1px solid rgba(128,128,128,0.3);
      background: rgba(128,128,128,0.1);
      font-size: 11.5px; line-height: 1.5; white-space: nowrap;
      font-family: ui-monospace, Consolas, monospace;
      cursor: pointer;
    }
    /* 鼠标侧键绑定：用主题主色弱填充，与键盘键区分 */
    .ss-hotkey-chip.is-mouse {
      border-color: var(--primary-color,#3b82f6);
      color: var(--primary-color,#3b82f6);
      background: rgba(59,130,246,0.1);
    }
    .ss-chip-remove {
      width: 15px; height: 15px; padding: 0; margin-left: 1px;
      border: none; border-radius: 3px;
      background: transparent; color: inherit; opacity: .5;
      cursor: pointer; font-size: 12px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .ss-chip-remove:hover { opacity: 1; background: rgba(128,128,128,0.2); }
    .ss-hotkey-add {
      width: 22px; height: 20px; padding: 0; flex-shrink: 0;
      border: 1px dashed rgba(128,128,128,0.45); border-radius: 4px;
      background: transparent; color: inherit; opacity: .55;
      cursor: pointer; font-size: 13px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .ss-hotkey-add:hover { opacity: 1; border-color: var(--primary-color,#3b82f6); color: var(--primary-color,#3b82f6); }
    .ss-hotkey-recording {
      flex: 1; min-width: 90px; text-align: center;
      padding: 3px 8px; font-size: 12px; cursor: pointer;
      font-family: ui-monospace, Consolas, monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* ★ 2026-08-31：已占用快捷键清单（只读，可折叠） */
    .ss-occupied { margin: 6px 0 2px; }
    .ss-occupied-head {
      display: flex; align-items: center; gap: 6px;
      width: 100%; padding: 4px 10px; border: none; border-radius: 6px;
      background: transparent; color: inherit; cursor: pointer;
      font-size: 12.5px; text-align: left;
    }
    .ss-occupied-head:hover { background: rgba(128,128,128,0.06); }
    .ss-occupied-caret { width: 10px; font-size: 10px; opacity: .6; }
    .ss-occupied-body { padding: 2px 10px 6px 26px; }
    .ss-occupied-hint { margin-bottom: 6px; opacity: .75; }
    .ss-occupied-group + .ss-occupied-group { margin-top: 6px; }
    .ss-occupied-group-title { font-size: 11.5px; opacity: .55; margin-bottom: 2px; }
    .ss-occupied-row { display: flex; align-items: center; gap: 10px; padding: 1px 0; font-size: 12px; }
    .ss-occupied-keys {
      flex-shrink: 0; min-width: 74px;
      font-family: ui-monospace, Consolas, monospace;
      opacity: .9;
    }
    .ss-occupied-desc { opacity: .8; }

    .ss-backup-row {
      display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;
    }
    .ss-btn {
      display:inline-flex; align-items:center; gap:6px;
      padding:8px 20px; border-radius:8px;
      border:1px solid rgba(128,128,128,0.25);
      background: rgba(128,128,128,0.08);
      font-size:13px; cursor:pointer; transition:background .15s;
      color: inherit;
    }
    .ss-btn:hover { background: rgba(128,128,128,0.15); }
    .ss-btn-import { cursor:pointer; }
    .ss-btn-danger { color: #e24b4a; border-color: rgba(226,75,74,0.3); }
    .ss-btn-danger:hover { background: rgba(226,75,74,0.12); }
    /* ★ 2026-09-29 导出勾选弹窗：主按钮 + 小号按钮 + 类别行。
       顺序/特异性要点：.ss-btn-primary 与 .ss-btn 同为 (0,1,0) → 必须排在其后；
       .ss-btn 的 :hover 是 (0,1,1) 会盖掉主色 → 需自带 :hover 版本；
       类别行必须带 .ss-edit-modal 前缀（(0,2,0)），否则会被 .ss-edit-modal label 的
       display/opacity/margin 压掉（(0,1,1)），只写 .ss-export-item 会失效。 */
    .ss-btn-primary { background: rgba(59,130,246,0.16); border-color: rgba(59,130,246,0.45); color: var(--primary-color,#3b82f6); }
    .ss-btn-primary:hover { background: rgba(59,130,246,0.26); }
    .ss-btn-xs {
      padding:2px 10px; border-radius:5px; border:1px solid rgba(128,128,128,0.2);
      background: rgba(128,128,128,0.06); font-size:11px; line-height:1.5; cursor:pointer; color:inherit;
    }
    .ss-btn-xs:hover { background: rgba(128,128,128,0.15); }
    .ss-export-modal { max-width: 480px; }
    /* ★ 2026-09-29：类别增至 9 项 → 列表内滚，弹窗高度封顶，不把底部按钮顶出屏幕。
       阈值取 58vh / 520px：常规窗口下 9 行（约 460px）能完整显示不滚动，
       只有小窗口才回退成滚动，避免最后一项「传输记录」被默认藏起来。 */
    .ss-export-list { max-height: min(58vh, 520px); overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }
    /* ★ 2026-09-29：滚动条对齐 SFTP+ 面板（.sftp-root .pane-list）的视觉规格 —— 8px 宽、4px 圆角、
       轨道/滑块/悬停三档灰度。⚠ 数值取面板变量链的**实际生效值**
       （styles.ts 的 :host 里 --_scroll-track / --_scroll-thumb / --_scroll-thumb-hover = 0.06 / 0.28 / 0.45），
       不是面板 CSS 里那个「var(--_scroll-thumb, rgba(...,0.35))」式兜底值 —— 变量在面板里始终有定义，兜底永远轮不到。
       面板用的是 --_scroll-* 私有变量（面板 :host 作用域），设置页取不到 ⇒ 直接写字面值；
       主色沿用设置页的 --primary-color（面板 --_primary 的链尾也是它，等价）。
       Firefox/新版 Chromium 走 scrollbar-width/color 那一对，写法与面板逐字一致；
       旧 Chromium 才吃下面这组 ::-webkit-* 规则 —— 两种路径都与面板同款。 */
    .ss-export-list { scrollbar-width: thin; scrollbar-color: rgba(128,128,128,0.28) rgba(128,128,128,0.06); }
    .ss-export-list::-webkit-scrollbar { width: 8px; height: 8px; }
    .ss-export-list::-webkit-scrollbar-track { background: rgba(128,128,128,0.06); border-radius: 4px; }
    .ss-export-list::-webkit-scrollbar-thumb {
      background: rgba(128,128,128,0.28); border-radius: 4px;
      min-height: 30px; min-width: 30px; transition: background 0.2s;
    }
    .ss-export-list::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.45); }
    .ss-export-list::-webkit-scrollbar-thumb:active { background: var(--primary-color,#3b82f6); }
    .ss-export-list::-webkit-scrollbar-corner { background: rgba(128,128,128,0.06); }
    .ss-edit-modal .ss-export-hint { font-size:12px; opacity:.75; line-height:1.6; margin:0 0 12px 0; }
    .ss-edit-modal .ss-export-item {
      display:flex; align-items:center; gap:10px;
      padding:8px 10px; margin-bottom:6px;
      border:1px solid rgba(128,128,128,0.22); border-radius:8px;
      cursor:pointer; opacity:1; font-size:13px;
    }
    .ss-edit-modal .ss-export-item:hover { background: rgba(128,128,128,0.08); }
    .ss-export-check { width:15px; height:15px; flex-shrink:0; margin:0; cursor:pointer; accent-color: var(--primary-color,#3b82f6); }
    .ss-export-text { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
    .ss-export-name { font-size:13px; font-weight:500; }
    .ss-export-sub { font-size:11px; opacity:.6; line-height:1.4; }
    .ss-export-foot { display:flex; justify-content:flex-end; margin-top:8px; }
    .ss-btn:disabled { opacity:.45; cursor:not-allowed; }

    /* 关于 */
    .ss-about-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:13px; }
    .ss-about-links { margin-top:8px; }
    .ss-about-item { opacity:.75; }
    /* ★ 2026-10-27：关于区的可点文字（版本号 / 作者名）—— hover 提亮 + 实线下划线给出可点反馈，光标换手型。
       下划线用 text-decoration 而非 border-bottom：不占布局空间，不会把 .ss-about-row 顶高 1px
       （该行是 flex align-items:center，多 1px 下边框会让同排的其它项整体偏移 1px）。 */
    .ss-about-click { cursor:pointer; }
    .ss-about-click:hover { opacity:1; text-decoration:underline; text-underline-offset:2px; }
    .ss-about-link {
      display:inline-flex; align-items:center; gap:4px;
      cursor:pointer; opacity:.7; transition:opacity .15s;
    }
    .ss-about-link:hover { opacity:1; }
    .ss-about-link:hover .ss-about-label { text-decoration:underline; }
    .ss-about-link svg,
    .ss-about-link .ss-about-icon {
      width:12px; height:12px; vertical-align:middle; flex-shrink:0;
    }
    /* 官方 npm 方形 Logo 使用 14px 显示，与其他源码图标保持协调 */
    .ss-about-link .ss-about-icon { width:14px; height:14px; }

    /* 确认弹窗 - 统一使用 ss-edit-* 类名（与 QC+ 同步） */
    .ss-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,0.5);
      display:flex; align-items:center; justify-content:center; z-index:9999;
    }
    .ss-edit-modal {
      background:var(--body-bg,#1a1d23); color:var(--text-color,#e8edf5);
      border:1px solid rgba(128,128,128,0.25); border-radius:12px;
      padding:24px; max-width:400px; width:90%;
    }
    .ss-edit-modal.ss-dark { color:#fff; }
    .ss-edit-modal.ss-light { color:#222; }
    .ss-edit-modal p, .ss-edit-modal label { color:inherit; font-size:13px; line-height:1.6; }
    .ss-edit-modal p { margin:0 0 12px 0; }
    .ss-edit-modal label { font-size:12px; opacity:.8; display:block; margin-bottom:6px; }
    .ss-edit-title { font-size:16px; font-weight:700; margin-bottom:16px; color:inherit; }
    .ss-edit-field { margin-bottom:16px; }
    .ss-edit-input {
      width:100%; padding:8px 12px; border-radius:6px;
      border:1px solid rgba(128,128,128,0.3);
      background:rgba(0,0,0,0.2); color:inherit; font-size:13px; outline:none;
      box-sizing:border-box;
    }
    .ss-edit-input::placeholder {
      color: inherit;
      opacity: .45;
    }
    .ss-edit-input::-webkit-input-placeholder {
      color: inherit;
      opacity: .45;
    }
    .ss-edit-input:focus { border-color:var(--primary-color,#3b82f6); }
    .ss-edit-footer { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }

    /* 布局卡片选择器 */
    .ss-layout-row { display:flex; gap:8px; flex-wrap:wrap; }
    .ss-layout-card {
      display:flex; flex-direction:column; align-items:center; gap:4px;
      flex:1; min-width:100px; padding:10px 8px;
      border-radius:8px; border:2px solid rgba(128,128,128,0.2);
      background: rgba(128,128,128,0.04);
      cursor:pointer; transition:border-color .15s, background .15s;
      text-align:center;
    }
    .ss-layout-card:hover {
      border-color: rgba(128,128,128,0.35);
      background: rgba(128,128,128,0.08);
    }
    .ss-layout-active {
      border-color: var(--primary-color, #3b82f6) !important;
      background: rgba(59,130,246,0.08);
    }
    .ss-layout-icon {
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:6px;
      background: rgba(128,128,128,0.08);
      color: inherit; opacity:.85;
    }
    .ss-layout-active .ss-layout-icon {
      background: rgba(59,130,246,0.15);
      color: var(--primary-color, #3b82f6); opacity:1;
    }
    .ss-layout-text { font-size:13px; font-weight:600; line-height:1.2; }
    .ss-layout-sub { font-size:10px; opacity:.5; line-height:1.3; }
    .ss-sub-head { display:flex; align-items:center; justify-content:flex-start; gap:8px; }
    .ss-reset-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .ss-reset-icon-btn svg { width: 13px; height: 13px; }
    .ss-reset-icon-btn:hover { background: rgba(128,128,128,0.1); }
    .ss-layout-preview {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .ss-layout-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      /* 垂直内距与「定制右键菜单」.ss-menu-row 同步（同为 4px）⇒ 两块行高精确相等；
         两侧内容盒同高（同字号、同 14px 复选框），故只要垂直内距相同就必然等高，
         与宿主 line-height 取值无关（改前 7px 使 chip 高出菜单行 6px）。 */
      padding: 4px 10px;
      border-radius: 8px;
      border: 1px dashed rgba(128,128,128,0.35);
      background: rgba(128,128,128,0.06);
      font-size: 12px;
      cursor: grab;
      user-select: none;
    }
    .ss-layout-chip.dragging { opacity: 0.5; }
    .ss-layout-chip.hidden { opacity: 0.45; border-style: dotted; }
    .ss-layout-chip.hidden .ss-layout-chip-handle { opacity: .3; }
    .ss-chip-check { width: 14px; height: 14px; margin: 0; cursor: pointer; }
    .ss-layout-chip-handle { opacity: .5; letter-spacing: -1px; }
    .ss-btn-ghost { padding: 6px 12px; font-size: 12px; }
    .ss-menu-preview {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 6px;
    }
    .ss-menu-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px dashed rgba(128,128,128,0.35);
      background: rgba(128,128,128,0.05);
      font-size: 12px;
      cursor: grab;
      user-select: none;
    }
    .ss-menu-row.dragging { opacity: 0.5; }
    .ss-menu-handle { opacity: .5; letter-spacing: -1px; cursor: grab; }
    .ss-menu-check { width: 14px; height: 14px; margin: 0; cursor: pointer; flex: none; }
    .ss-menu-label { flex: 1; }
    /* ★ 2026-10-23（Deepseek-V4.1-Flash）：行尾小字说明（当前用于「关闭按钮需先设面板快捷键」）。
       不用 flex:1，紧跟标签、不抢固定按钮的位置；字号与 .ss-pin-btn 同档。 */
    .ss-menu-note { flex: none; font-size: 11px; opacity: .55; white-space: nowrap; }
    .ss-menu-label.disabled { opacity: 0.4; text-decoration: line-through; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮「固定 / 在 ⋯ 菜单」切换（布局分区的定制列表用） */
    .ss-pin-btn {
      flex: none;
      padding: 1px 8px;
      font-size: 11px;
      line-height: 16px;
      border-radius: 9px;
      border: 1px solid rgba(128, 128, 128, 0.4);
      background: transparent;
      color: inherit;
      opacity: 0.7;
      cursor: pointer;
      white-space: nowrap;
    }
    .ss-pin-btn:hover { opacity: 1; }
    .ss-pin-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：面板透明度滑块（主题区） */
    .ss-range-wrap { display: flex; align-items: center; gap: 8px; flex: none; }
    .ss-range { width: 150px; accent-color: var(--_primary, #3b82f6); cursor: pointer; }
    .ss-range-val { min-width: 38px; text-align: right; font-size: 12px; opacity: 0.75; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：书签「重置统计」按钮与结果提示。
       整行右对齐：与上方 .ss-toggle-row（padding 8px 10px）的右缘齐平；提示文字在按钮左侧，避免把按钮挤离右缘。 */
    .ss-reset-row {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 8px; margin-top: 2px; padding: 0 10px;
    }
    .ss-mini-btn {
      padding: 3px 10px; font-size: 12px; border-radius: 5px;
      border: 1px solid var(--_border); background: transparent;
      color: var(--_text); cursor: pointer;
    }
    .ss-mini-btn:hover { background: var(--_hover, rgba(128,128,128,0.12)); }
    .ss-reset-msg { font-size: 12px; opacity: 0.7; }
    .ss-pin-btn.pinned {
      opacity: 1;
      border-color: var(--_primary, #3b82f6);
      color: var(--_primary, #3b82f6);
    }

  `],
})
export class SftpSettingsTabComponent implements OnDestroy {
  // @ts-ignore — ts-loader 可能无法正确处理 JSON 模块类型
  /** 插件版本号（webpack 构建时内联 package.json） */
  readonly pkgVersion: string = require('../../package.json').version
  /** 构建时间（webpack 每次 build 时注入，用于确认是否已重新打包） */
  readonly pkgBuildTime: string = typeof __SFTP_PLUS_BUILD_TIME__ !== 'undefined' ? __SFTP_PLUS_BUILD_TIME__ : ''

  /** 格式化构建时间为本地可读字符串 */
  formatBuildTime(): string {
    if (!this.pkgBuildTime) return '—'
    const d = new Date(this.pkgBuildTime)
    if (isNaN(d.getTime())) return this.pkgBuildTime
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  /** 国际化服务（key-based，支持动态切换语言） */
  readonly i18n: SftpI18nService

  /** 主题颜色标签 key 映射（统一走 .po 翻译） */
  private readonly themeLabelKeys: Record<string, string> = {
    '':       'theme.auto',
    dark:     'theme.dark',
    light:    'theme.light',
    blue:     'theme.blue',
    green:    'theme.green',
    purple:   'theme.purple',
    red:      'theme.red',
    custom:   'theme.custom',
  }

  /** 获取主题颜色的翻译标签 */
  themeLabel(c: { value: string; label: string }): string {
    const key = this.themeLabelKeys[c.value]
    return key ? this.i18n.t(key) : c.label
  }

  /** 获取色卡预览背景（Auto 用渐变，其他用固定色） */
  swatchPreviewBg(c: { value: string; bg: string }): string {
    if (c.value === '') return 'linear-gradient(135deg, var(--body-bg, #1e1e2e), var(--text-color, #cdd6f4))'
    if (c.value === 'custom') {
      // 自定义主题：从 localStorage 读取实际保存的配色
      const savedBg = load('bgColor', '')
      return savedBg || c.bg
    }
    return c.bg
  }

  /** 自定义主题预览色：主色 */
  swatchCustomPrimary(c: { value: string; primary?: string }): string {
    if (c.value === 'custom') {
      const saved = load('primaryColor', '')
      return saved || c.primary || 'var(--primary-color, #3b82f6)'
    }
    return c.primary || 'var(--primary-color, #3b82f6)'
  }

  /** 自定义主题预览色：表面色（仅预设主题使用，自定义主题使用 bg） */
  swatchCustomSurface(c: { value: string; surface?: string; bg?: string }): string {
    if (c.value === 'custom') return c.bg || '#313244'
    return c.surface || c.bg || '#313244'
  }

  /** 自定义主题预览色：文字色 */
  swatchCustomText(c: { value: string; text: string }): string {
    if (c.value === 'custom') {
      const saved = load('textColor', '')
      return saved || c.text
    }
    return c.text
  }

  /** 自定义主题预览色：弱化色（仅预设主题使用，自定义主题降低文字透明度） */
  swatchCustomMuted(c: { value: string; muted?: string; text: string }): string {
    if (c.value === 'custom') return c.text  // 无 muted 设置，直接用文字色
    return c.muted || c.text
  }

  /** 自定义主题预览色：边框色 */
  swatchCustomBorder(c: { value: string; border?: string }): string {
    if (c.value === 'custom') {
      const saved = load('borderColor', '')
      return saved || c.border || ''
    }
    return c.border || ''
  }

  /** 支持的语言列表（按语言代码排序） */
  readonly locales: { code: Locale; name: string }[] = [
    { code: 'af-ZA', name: 'Afrikaans' },
    { code: 'bg-BG', name: 'Български' },
    { code: 'cs-CZ', name: 'Čeština' },
    { code: 'da-DK', name: 'Dansk' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'hr-HR', name: 'Hrvatski' },
    { code: 'id-ID', name: 'Bahasa Indonesia' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'pl-PL', name: 'Polski' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'pt-PT', name: 'Português' },
    { code: 'ru-RU', name: 'Русский' },
    { code: 'sr-Latn', name: 'Srpski' },
    { code: 'sv-SE', name: 'Svenska' },
    { code: 'tr-TR', name: 'Türkçe' },
    { code: 'uk-UA', name: 'Українська' },
    { code: 'zh-CN', name: '中文（简体）' },
    { code: 'zh-TW', name: '中文（繁體）' },
  ]

  /** 界面语言（空 = 自动跟随系统） */
  lang: '' | Locale = (load('lang', '') as string || '') as '' | Locale

  /** 使用界面语言（Auto 模式时检测系统语言） */
  get effectiveLang(): Locale {
    const validLocales: Locale[] = this.locales.map(l => l.code)
    if (this.lang && validLocales.includes(this.lang as Locale)) return this.lang as Locale
    return detectSystemLocale() as Locale
  }

  /** 预设主题（含配色预览色值） */
  colorThemes = [
    { value: '',       label: 'Auto',   bg: '#1e1e2e', text: '#cdd6f4', primary: '#b4befe', surface: '#313244', border: '#585b70', muted: '#6c7086' },
    { value: 'dark',  label: 'Dark',  bg: '#1a1d23', text: '#e8edf5', primary: '#b6b6c3', surface: '#252830', border: '#2d3242', muted: '#5a5f6f' },
    { value: 'light', label: 'Light', bg: '#f0f4f8', text: '#333333', primary: '#2563eb', surface: '#e5e7eb', border: '#d1d5db', muted: '#9ca3af' },
    { value: 'blue',  label: 'Blue',  bg: '#0b1929', text: '#e6f0ff', primary: '#3b9eff', surface: '#0f2035', border: '#1e3a5f', muted: '#5a7ea0' },
    { value: 'green', label: 'Green', bg: '#0a2016', text: '#e8fce8', primary: '#4ade80', surface: '#0e281a', border: '#1a5030', muted: '#4a8a60' },
    { value: 'purple',label: 'Purple',bg: '#160e23', text: '#ebe0fc', primary: '#b794f4', surface: '#1c1430', border: '#3a2558', muted: '#7a5aa0' },
    { value: 'red',   label: 'Red',    bg: '#1a0808', text: '#ffe0dd', primary: '#f87171', surface: '#220a0a', border: '#502020', muted: '#904040' },
    { value: 'custom',label: 'Custom', bg: '#313244', text: '#cdd6f4', primary: '#b4befe', surface: '#45475a', border: '#585b70', muted: '#6c7086' },
  ]

  /** 当前主题 */
  theme: string = load('theme', '')

  /** Auto 模式下检测到的映射主题名（'dark' | 'light' | ''） */
  detectedAutoTheme: 'dark' | 'light' | '' = ''

  /** 判断当前是否为深色模式（读取 Tabby CSS 变量亮度） */
  get isDarkMode(): boolean {
    try {
      const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
      if (textColor) {
        const lum = parseColorLuminance(textColor)
        if (lum >= 0) return lum > 128
      }
      // --text-color 不可用 → 尝试 --body-bg
      const bodyBg = getComputedStyle(document.documentElement).getPropertyValue('--body-bg').trim()
      if (bodyBg) {
        const lum = parseColorLuminance(bodyBg)
        if (lum >= 0) return lum < 128  // 背景暗 → 深色模式
      }
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  /** 检测当前 Tabby UI 主题的暗/亮模式（读取 --body-bg CSS 变量） */
  detectAutoTheme(): void {
    let bodyBg = '#1e1e2e'
    try {
      const computedStyle = getComputedStyle(document.documentElement)
      const cssBg = computedStyle.getPropertyValue('--body-bg').trim()
      if (cssBg && cssBg !== '') {
        bodyBg = cssBg
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
      }
    } catch {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
    }

    // 使用公共工具判断暗/亮
    this.detectedAutoTheme = isColorDark(bodyBg) ? 'dark' : 'light'
  }

  /** 获取 Auto 映射主题名的显示文本 */
  get autoThemeLabel(): string {
    if (this.detectedAutoTheme === 'dark') return this.i18n.t('settings.dark')
    if (this.detectedAutoTheme === 'light') return this.i18n.t('settings.light')
    return ''
  }

  /** 主题颜色值（从 localStorage 或预设加载） */
  themePrimary = load('primaryColor', '')
  themeBg = load('bgColor', '')
  themeText = load('textColor', '')
  themeBorder = load('borderColor', '')

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：面板整体透明度（0.5–1，默认 1）。
   *   下限 50% —— 不允许全透明（全透明等于面板消失且内容不可读）。
   */
  panelOpacity = 1

  /** 面板布局 */
  layoutMode: string = 'auto'
  /** 面板界面字号（px），默认 13，范围 11–18 */
  fontSize = 13

  /** 表格样式设置 */
  showColBorders = loadTableSetting('colBorders', false)
  showZebra = loadTableSetting('zebra', false)

  /** 隐藏原生 SFTP 按钮 */
  hideNativeBtn = load('hideNativeBtn', false)

  /** 默认路径模式（off/remember/sync）：对未在面板上单独切换过的连接生效 */
  defaultPathMode: PathFollowMode = load('defaultPathMode', 'off') as PathFollowMode

  /**
   * ★ 2026-10-22 续三十六（Deepseek-V4.1-Flash）：设置保存后是否立即推送到已打开的面板。
   *   false = 面板忽略设置变更广播，需关闭并重开 SFTP+ 面板才生效。
   */
  applySettingsInstantly: boolean = load('applySettingsInstantly', true) as boolean

  /** 默认显示隐藏文件：对从未按过眼睛按钮的面板生效 */
  defaultShowHidden = load('defaultShowHidden', false)

  /** 热键录制状态 */
  hotkeyRecording = false
  hotkeyRecordingPreview = ''
  hotkeyConflictNames = ''
  hotkeySaveMessage = ''
  private _hotkeyStrokeSub: { unsubscribe(): void } | null = null
  private _hotkeyKeyEventSub: { unsubscribe(): void } | null = null
  private _hotkeyDomHandler: ((ev: KeyboardEvent) => void) | null = null
  private _hotkeyCommitTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeySafetyTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeyMsgTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeyDescCache: Record<string, string> = {}
  private _pendingHotkeyStrokes: string[] = []
  private _hotkeyDisableHeld = false

  /** 当前「切换 SFTP+ 面板」热键绑定文案（来自 Tabby hotkeys 配置） */
  get hotkeyBindingLabel(): string {
    try {
      const list = readToggleHotkeyBindings(this.configService?.store?.hotkeys)
      return list.map(formatHotkeyBinding).filter(Boolean).join(' / ')
    } catch {
      return ''
    }
  }

  /** 工具栏入口在新标签页打开 */
  openInNewTabByDefault = load('openInNewTabByDefault', false)

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器（连接面板）的唤起方式。
   *   topbar = 点顶栏连接标题（默认，历史行为）；paneToolbar = 点面板栏工具栏上的本地/远程标识；
   *   both = 两者都可以。装饰器与面板都读同一个 config 键 connPickerTrigger。
   */
  connPickerTrigger: 'topbar' | 'paneToolbar' | 'both' = 'topbar'

  /**
   * ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash，用户诉求）：顶栏连接显示内容。
   *   account = 账号@地址（默认，历史行为）；alias = Tabby 配置连接的名字（无名字时回落账号@地址）。
   *   面板侧同名配置由 `_readConnLabelStyle()` 读取，改完广播 `sftp-plus-settings-changed` 即时生效。
   */
  connLabelStyle: 'account' | 'alias' = 'account'

  /** 新标签页模式：同一 SSH 终端只保留一个 SFTP+ 标签 */
  singleWorkspaceInstance = load('singleWorkspaceInstance', true)
  /** 兼容选项：选中书签后关闭面板 */
  closeBookmarkPanelOnSelect = load('closeBookmarkPanelOnSelect', false)
  /** ★ 2026-10-16：键入定位（在文件列表中敲字母/数字按文件名前缀跳转选中），默认开 */
  typeAheadEnabled = load('typeAheadEnabled', true)
  /** 书签面板是否按「局部 / 全局」分组（默认开启） */
  bookmarkPanelGroupByScope = load('bookmarkPanelGroupByScope', true)
  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：联动书签开关（★ 2026-10-20 默认改为开） */
  bookmarkLinkEnabled = true
  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：书签按使用频率排序（默认关 = 拖拽顺序） */
  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：书签排序三档（manual / usage / name），替代原布尔开关 */
  bookmarkSortMode: BookmarkSortMode = 'manual'
  /** 重置统计后的临时提示（2.6s 自动消失） */
  bookmarkResetMsg = ''
  private _bookmarkResetMsgTimer: ReturnType<typeof setTimeout> | null = null
  /** 分组块显示顺序 */
  bookmarkPanelGroupOrder: Array<'connection' | 'global'> = (() => {
    try {
      const raw = load<unknown>('bookmarkPanelGroupOrder', ['connection', 'global'])
      if (Array.isArray(raw) && raw.length) {
        const valid = raw.filter((x): x is 'connection' | 'global' => x === 'connection' || x === 'global')
        if (valid.includes('connection') && valid.includes('global')) {
          return [valid[0], valid.find(x => x !== valid[0])!]
        }
      }
    } catch {}
    return ['connection', 'global']
  })()
  draggingBookmarkGroup: 'connection' | 'global' | null = null
  /** 兼容选项：自定义时间格式（输入框始终显示具体格式，默认为 DEFAULT_DATE_FORMAT） */
  dateFormat = load('dateFormat', '') || DEFAULT_DATE_FORMAT
  /** 默认时间格式 */
  readonly defaultDateFormat = DEFAULT_DATE_FORMAT
  /** 同时进行的上传/下载数上限（1-10，默认 3） */
  uploadConcurrency = 3
  downloadConcurrency = 3
  /** ★ 2026-09-28：传输通道模式（smart/sftpOnly/tarOnly/preferSftp/preferTar） */
  transferChannelMode = 'smart'
  /** ★ 2026-09-07 issue #15：冲突内容摘要相关设置 */
  conflictDigestEnabled = true
  conflictAutoSkipSameContent = true
  conflictDigestMaxSizeMB = 256
  /** ★ 2026-10-23：冲突「重命名」命名风格（seq 序号堆叠 / time 时间戳 / random 随机后缀） */
  conflictRenameStyle = normalizeConflictRenameStyle(load('conflictRenameStyle', 'seq'))
  /**
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点只认当前目录（默认开）。
   *   初值取自 localStorage（`load` 自带类型守卫，非布尔值回落 true）；真正的配置值在
   *   `_applyConfig` 里回读，判定统一用 `cfg.dropToCurrentDir !== false` —— 旧配置里根本没有
   *   这个键，缺省必须按「开」处理（否则升级后反而把那类「文件被吞进子目录」的坑重新打开）。
   */
  dropToCurrentDir = load<boolean>('dropToCurrentDir', true)
  /**
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：是否接收 QuickCmd+ 的刷新请求（默认 **关**）。
   *   ⛔ 与 dropToCurrentDir 相反，这里缺键必须按「关」处理：跨插件联动是新增能力，
   *      升级不能替用户悄悄打开（打开后每次快捷命令都会给远端多加几次 readdir）。
   */
  refreshOnQuickCmd = load<boolean>('refreshOnQuickCmd', false) === true
  /** QuickCmd+ 触发后的持续刷新时长（秒，1–120，默认 10）：列表还在变化时会自动顺延（上限 4 倍/180s） */
  refreshOnQuickCmdWindow = normalizeRefreshWindowSec(load<number>('refreshOnQuickCmdWindow', 10))
  /**
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新列表（默认 **关**）。
   *   与 refreshOnQuickCmd 同一个理由：定时 readdir 有代价，升级不能替用户默默打开。
   */
  autoRefreshEnabled = load<boolean>('autoRefreshEnabled', false) === true
  /** 定时刷新间隔（秒，5–3600，默认 60） */
  autoRefreshInterval = normalizeAutoRefreshIntervalSec(load<number>('autoRefreshInterval', 60))
  /**
   * ★ 2026-10-28（Deepseek-V4.1-Flash）：列表刷新闪烁（默认 **开**）。
   *   切换文件夹 / 手动刷新后当前栏的淡蓝背景闪烁；关掉则不闪，其它提示（定位高亮 / 连接告警）保留。
   */
  listRefreshFlash = load<boolean>('listRefreshFlash', true) === true
  /** 默认上传路径（远程目标目录）；空串 = 使用当前远程目录 */
  defaultUploadPath = ''
  /** 默认下载路径（本地目标目录）；空串 = 使用当前本地目录 */
  defaultDownloadPath = ''
  /** 自定义图标：全局 SVG 资源目录（本地绝对路径） */
  iconResourceDir = ''
  /** 自定义图标规则：扩展名 → svg 文件名（可选 name 为规则名） */
  fileTypeIcons: FileTypeIconRule[] = []
  /** 被禁用的内置图标 svg 文件名 */
  disabledIconSvgs: string[] = []
  /** 文件夹图标 svg 文件名（空串 = 走 emoji 📁，默认 'folder.svg'） */
  folderIconSvg = 'folder.svg'
  /** 图标网格交互状态 */
  _editingRuleKey: string | null = null      // 正在编辑的规则 key（规则名）
  _editingRuleName: string = ''               // 编辑中的规则名
  _editingIconExts: string = ''               // 编辑中的扩展名字符串
  _editingIconSvgName: string = ''            // 编辑中的 svg 文件名（可修改）
  _editingFolderIcon = false                  // 是否在编辑文件夹图标
  _folderIconDraft = ''                       // 文件夹图标编辑草稿
  _folderIconError = ''                       // 文件夹图标编辑错误
  _addingCustomRule = false                   // 是否显示新增自定义规则表单
  _newRuleName = ''                           // 新增规则的规则名
  _newRuleExt = ''                            // 新增规则的扩展名
  _newRuleSvg = ''                            // 新增规则的 svg 文件名
  _iconRuleError = ''                         // 新增/编辑规则时的校验错误提示（空=无错误）
  /** ★ 2026-08-11：隐藏关于区的插件作者信息（开启需点 Star 确认） */
  hideAuthorInfo = false
  /** 隐藏作者信息确认弹窗是否显示 */
  showHideAuthorConfirm = false
  paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'> = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
  /** 被隐藏的工具栏项（设置页定制工具栏中取消勾选的项） */
  paneHiddenItems: string[] = []
  draggingCustomItem: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden' | null = null

  /** ★ 2026-08-22：文件/文件夹打开方式（单击/双击） */
  openOnClick: 'double' | 'single' = load('openOnClick', 'double')
  /** ★ 2026-10-30（meta）：文件默认动作（查看/编辑，默认编辑） */
  openFileDefaultAction: 'view' | 'edit' = load('openFileDefaultAction', 'edit')
  /** ★ 2026-08-22：查看器不支持的文件改用系统默认程序打开 */
  openUnsupportedInSystem = load('openUnsupportedInSystem', true)
  /** 可查看/编辑文本扩展名；界面展示预置列表，接受 .conf / *.conf / conf，空格分隔。 */
  editableFileExtensionsText = formatTextExtensionsForInput(load<unknown>('editableFileExtensions', []))
  /** 忽略扩展名白名单，允许查看与编辑所有非目录文件（编辑仍受二进制保护）。 */
  allowViewEditAllFiles = loadAllowViewEditAllFiles()
  /** ★ 2026-09-20：查看/编辑器显示行号；★ 2026-10-08：查看/编辑器长行自动换行（2026-09-29 光标由宽度改为形状三档） */
  showTextLineNumbers = load('showTextLineNumbers', true)
  showTextWordWrap = load('showTextWordWrap', false)
  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：外部编辑自动上传开关（方案 A），默认关 → 走方案 B 提示 */
  editorAutoUploadExternal = load('editorAutoUploadExternal', false)
  textCaretShape: CaretShape = normalizeCaretShape(load<unknown>('textCaretShape', 'beam'))
  /** ★ 2026-09-29：光标形状按钮组选项（三档取值与 Tabby 终端 cursor 逐字一致，字形照宿主外观页的 █ | ▁）
   *  形制对齐 Tabby 外观页「光标形状」的方块字形按钮组；文案 key 同时作为按钮 title。 */
  caretShapeOptions: { shape: CaretShape; glyph: string; labelKey: string }[] = [
    { shape: 'block', glyph: '█', labelKey: 'settings.caretShapeBlock' },
    { shape: 'beam', glyph: '|', labelKey: 'settings.caretShapeBeam' },
    { shape: 'underline', glyph: '▁', labelKey: 'settings.caretShapeUnderline' },
  ]
  /** ★ 2026-08-22（2026-09-28 扩展）：右键菜单定制项（数据驱动渲染）。
   *  顺序数组 + 停用集合共同决定：顺序用于拖拽排序，disabling 用于复选框启用/停用。 */
  contextMenuOrder: ContextMenuCustomId[] = [...DEFAULT_FILE_MENU_ORDER, 'groupBy']
  /** ★ 2026-09-28：被停用的右键菜单项（复选框取消勾选）；空 = 全部启用 */
  contextMenuDisabled: ContextMenuCustomId[] = []
  /** 右键菜单排序拖拽中的项 */
  draggingMenuItem: ContextMenuCustomId | null = null

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制（右上角操作按钮）。
   *   topBarOrder   —— 全量顺序（决定顶栏顺序与 ⋯ 菜单顺序）
   *   topBarPinned  —— 固定在顶栏的项；其余项在「启用折叠菜单」时收进 ⋯
   *   topBarOverflowEnabled —— 折叠菜单总开关；关闭时未固定项**全部平铺**（用户已确认的语义）
   *   登记表来自 core/top-bar-items.ts，与面板共用，禁止在本文件另写一份 id 数组。
   */
  topBarOrder: TopBarItemId[] = [...DEFAULT_TOP_BAR_ORDER]
  topBarPinned: TopBarItemId[] = [...DEFAULT_TOP_BAR_PINNED]
  /** 被停用的按钮（顶栏与 ⋯ 菜单都不显示；空 = 全部启用） */
  topBarDisabled: TopBarItemId[] = [...DEFAULT_TOP_BAR_DISABLED]
  topBarOverflowEnabled = false
  /** 顶栏按钮排序拖拽中的项 */
  draggingTopBarItem: TopBarItemId | null = null

  /** ★ 2026-08-31：面板内置操作快捷键，一动作可绑多个键
   *  （keys 空数组 = 未绑定即禁用；enabled=false 为双保险标记，防 Tabby config 清洗空数组后 defaults 回退） */
  panelHotkeys: Record<PanelHotkeyAction, { keys: string[]; enabled: boolean }> = defaultPanelHotkeys()
  /** 面板快捷键录制中：当前正在录制的动作（null = 未在录制） */
  panelHotkeyRecording: PanelHotkeyAction | null = null
  /** 面板快捷键录制实时预览串 */
  panelHotkeyRecordingPreview = ''
  /** 面板快捷键录制对应的键盘监听句柄，便于卸载 */
  private _panelHotkeyDomHandler: ((ev: KeyboardEvent) => void) | null = null
  /** 面板快捷键录制对应的鼠标监听句柄（用于录制鼠标侧键/中键） */
  private _panelHotkeyMouseHandler: ((ev: MouseEvent) => void) | null = null
  /** 面板快捷键录制对应的滚轮监听句柄（用于录制滚轮上/下滚） */
  private _panelHotkeyWheelHandler: ((ev: WheelEvent) => void) | null = null
  /** 本次待提交的 spec，用于识别「同一 spec 的连续事件」（滚轮一次操作会连发多个 wheel） */
  private _panelHotkeyPendingSpec = ''
  private _panelHotkeyTimer: any = null
  private _panelHotkeySafeTimer: any = null
  /** 面板快捷键动作枚举（设置页列表顺序） */
  panelHotkeyActions: PanelHotkeyAction[] = [...PANEL_HOTKEY_ACTIONS]

  /** 主题颜色修改确认弹窗 */
  showThemeColorConfirm = false
  /** 待提交的颜色修改 */
  private _pendingColorKey = ''
  private _pendingColorVal = ''
  /** 发起修改时的主题模式（弹窗确认后用于复制色值） */
  private _pendingOrigTheme = ''

  /** 存储模式：仅使用 Tabby 配置存储 */
  storageMode = 'config'
  private readonly transferLogImport: SftpTransferLogService

  constructor(
    @Optional() public configService?: ConfigService,
    @Optional() private hotkeys?: HotkeysService,
    @Optional() private sftpConfig?: SftpConfigService,
    @Optional() @Inject('BOOTSTRAP_DATA') private bootstrapData?: any,
    // ★ 2026-09-24：意见反馈预填环境信息（对齐 Tabby 原生「报告问题」）
    @Optional() private platformService?: PlatformService,
    @Optional() private hostApp?: HostAppService,
    @Optional() private appService?: AppService,
  ) {
    // ConfigService 是可选的，如果注入失败（开发环境/Tabby 版本不支持），回退到 localStorage
    this.i18n = new SftpI18nService(configService)
    this.transferLogImport = new SftpTransferLogService(configService)
  }

  /** 缓存事件监听引用，便于 ngOnDestroy 清理（P1-7） */
  private _settingsChangedHandler: (() => void) | null = null

  ngOnInit(): void {
    // 首次加载：刷新配置 + 注册一次性事件监听
    this._refreshFromConfig()

    // 监听面板上的布局切换 → 同步更新设置页显示（只注册一次）
    if (!this._settingsChangedHandler) {
      this._settingsChangedHandler = () => {
        // 从 config store 读取面板端切换的布局
        const cfg = this.configService?.store?.['tabby-sftp-plus']
        if (cfg?.layoutMode) this.layoutMode = cfg.layoutMode as string
        if (typeof cfg?.fontSize === 'number') this.fontSize = this._clampFontSize(cfg.fontSize)
        // ★ 2026-10-19 P2-31（audit）：补同步「查看与编辑」的查看偏好两开关。
        //   浮动面板底部可就地切换行号/自动换行（_saveTextViewPref 写 config 后广播本事件），
        //   但本监听原先只回读 layoutMode / fontSize ⇒ 面板改完、已打开的设置页内存值仍是旧的，
        //   用户随后在设置页动任一开关 → _saveToConfig() 把 45+ 字段**连同这两个旧值**一起写回，
        //   面板刚做的修改被静默覆盖。此处随事件回读即可（不新开轮询）。
        const lineNumbers = cfg?.showTextLineNumbers
        if (typeof lineNumbers === 'boolean') this.showTextLineNumbers = lineNumbers
        const wordWrap = cfg?.showTextWordWrap
        if (typeof wordWrap === 'boolean') this.showTextWordWrap = wordWrap
        // ★ 2026-10-22（Deepseek-V4.1-Flash）：回读「外部编辑自动上传」开关，避免面板改动后被设置页旧值覆盖
        const autoUpload = cfg?.editorAutoUploadExternal
        if (typeof autoUpload === 'boolean') this.editorAutoUploadExternal = autoUpload
        // ★ 2026-10-19（Deepseek-V4.1-Flash）：书签弹层 footer 也能切排序方式（写同一配置项），
        //   这里必须回读；否则设置页内存里的旧值会在下次 _saveToConfig() 时把它覆盖回去（P2-31 同源）。
        this.bookmarkSortMode = normalizeBookmarkSortMode(cfg?.bookmarkSortMode, cfg?.bookmarkSortByUsage)
        // ★ 2026-10-23（Deepseek-V4.1-Flash）：书签弹层 footer 的图钉「面板常驻」写的就是这一项
        //   （图钉钉住 = closeBookmarkPanelOnSelect false），理由与上一行 bookmarkSortMode 完全同源：
        //   不回读 ⇒ 设置页内存里的旧值会在下次 _saveToConfig()（含 45+ 字段）时把图钉改动写回去。
        if (typeof cfg?.closeBookmarkPanelOnSelect === 'boolean') {
          this.closeBookmarkPanelOnSelect = cfg.closeBookmarkPanelOnSelect
        }
        // ★ 2026-10-23（Deepseek-V4.1-Flash）：面板 ⋯ 菜单可就地切「固定 / 收进 ⋯」
        //   （sftp-floating-panel 的 toggleTopBarItemPinned 写的就是本项 topBarPinned）。
        //   理由与上面两条同源：不回读 ⇒ 设置页内存里的旧数组会在下次 _saveToConfig()
        //   （45+ 字段整体写回）时把面板刚做的固定改动覆盖回去（P2-31）。
        const pinnedRaw = (cfg as any)?.[TOP_BAR_CFG_FIELDS.pinned]
        if (Array.isArray(pinnedRaw)) this.topBarPinned = normalizeTopBarPinned(pinnedRaw)
      }
      window.addEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)
    }
  }

  ngOnDestroy(): void {
    // ★ 2026-10-19 P2-33：销毁前冲刷节流里挂着的字号落盘 —— 拖完滑块立刻关掉设置页
    //   时，尾随定时器随组件一起消失，最后一次改动必须在此补写，否则字号丢失。
    this._flushFontSizeSave()
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：透明度同理——拖完滑块立刻关设置页，尾随定时器会被销毁
    this._flushPanelOpacitySave()
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：重置提示的定时器
    if (this._bookmarkResetMsgTimer) { clearTimeout(this._bookmarkResetMsgTimer); this._bookmarkResetMsgTimer = null }
    this.cancelHotkeyRecording()
    // ★ 2026-09-20 A4 审计修复：此前漏掉「面板操作快捷键」录制链的清理——
    //   录制中关闭/切换设置页会残留两个 window 捕获监听器（最多 12s 到安全定时器才自愈），
    //   期间 Esc 与鼠标侧键被吞、且 hotkeys.disable() 状态未立即恢复（全局热键失效）。
    if (this.panelHotkeyRecording) this._teardownPanelHotkeyRecording()
    if (this._settingsChangedHandler) {
      window.removeEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)
      this._settingsChangedHandler = null
    }
    if (this._hotkeyMsgTimer) {
      clearTimeout(this._hotkeyMsgTimer)
      this._hotkeyMsgTimer = null
    }
  }

  /** 开始录制面板开关快捷键 */
  startHotkeyRecording(): void {
    if (!this.configService?.store || this.hotkeyRecording) return
    this.hotkeyConflictNames = ''
    this.hotkeySaveMessage = ''
    this.hotkeyRecording = true
    this.hotkeyRecordingPreview = ''
    this._pendingHotkeyStrokes = []
    setHotkeyRecordingActive(true)
    void this._ensureHotkeyDescriptions()

    try { this.hotkeys?.clearCurrentKeystrokes?.() } catch { /* ignore */ }
    try {
      this.hotkeys?.disable?.()
      this._hotkeyDisableHeld = true
    } catch {
      this._hotkeyDisableHeld = false
    }

    // 始终用捕获阶段 DOM 监听兜底：按下「当前已绑定热键」时 Tabby 可能不再发 keystroke$
    this._hotkeyDomHandler = (ev: KeyboardEvent) => {
      if (!this.hotkeyRecording) return
      ev.preventDefault()
      ev.stopPropagation()
      if (ev.key === 'Escape') {
        this.cancelHotkeyRecording()
        return
      }
      if (ev.repeat) return
      if (ev.key === 'Control' || ev.key === 'Meta' || ev.key === 'Alt' || ev.key === 'Shift') return
      const stroke = getKeystrokeNameFromEvent(ev)
      if (!stroke) return
      this._pendingHotkeyStrokes = [stroke]
      this.hotkeyRecordingPreview = stroke
      this._scheduleHotkeyCommit()
    }
    window.addEventListener('keydown', this._hotkeyDomHandler, true)

    if (this.hotkeys?.keystroke$?.subscribe) {
      this._hotkeyStrokeSub = this.hotkeys.keystroke$.subscribe((stroke: string) => {
        if (!stroke || !this.hotkeyRecording) return
        // DOM 已捕获过则不再重复追加，避免序列错乱
        if (this._pendingHotkeyStrokes.length === 1 && this._pendingHotkeyStrokes[0] === stroke) {
          this._scheduleHotkeyCommit()
          return
        }
        if (!this._pendingHotkeyStrokes.includes(stroke)) {
          this._pendingHotkeyStrokes.push(stroke)
        }
        this.hotkeyRecordingPreview = this._pendingHotkeyStrokes.join(' › ')
        this._scheduleHotkeyCommit()
      })
    }
    if (this.hotkeys?.keyEvent$?.subscribe) {
      this._hotkeyKeyEventSub = this.hotkeys.keyEvent$.subscribe((ev: any) => {
        if (ev instanceof KeyboardEvent) {
          ev.preventDefault()
          ev.stopPropagation()
        }
      })
    }

    // 安全超时：避免 disable() 后录制中断导致全局热键一直失效
    if (this._hotkeySafetyTimer) clearTimeout(this._hotkeySafetyTimer)
    this._hotkeySafetyTimer = setTimeout(() => {
      if (this.hotkeyRecording) {
        this.cancelHotkeyRecording()
        this._flashHotkeyMessage(this.i18n.t('settings.hotkeyRecordTimeout'))
      }
    }, 12000)
  }

  cancelHotkeyRecording(): void {
    this._teardownHotkeyRecording(false)
  }

  async clearHotkeyBinding(): Promise<void> {
    if (!this.configService?.store) return
    this.cancelHotkeyRecording()
    try {
      if (!this.configService.store.hotkeys) this.configService.store.hotkeys = {}
      this.configService.store.hotkeys[SFTP_PLUS_TOGGLE_HOTKEY] = []
      await this.configService.save()
      this.hotkeyConflictNames = ''
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeyCleared'))
    } catch (e) {
      log.warn('clear hotkey failed', e)
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeySaveFailed'))
    }
  }

  private _scheduleHotkeyCommit(): void {
    if (this._hotkeyCommitTimer) clearTimeout(this._hotkeyCommitTimer)
    // 单键稍短提交，降低与旧热键冲突窗口
    const delay = this._pendingHotkeyStrokes.length > 1 ? 800 : 350
    this._hotkeyCommitTimer = setTimeout(() => {
      this._hotkeyCommitTimer = null
      void this._commitHotkeyRecording()
    }, delay)
  }

  private async _commitHotkeyRecording(): Promise<void> {
    const strokes = [...this._pendingHotkeyStrokes]
    this._teardownHotkeyRecording(true)
    if (!strokes.length || !this.configService?.store) return

    const binding: HotkeyBinding = strokes.length === 1 ? strokes[0] : strokes
    const current = readToggleHotkeyBindings(this.configService.store.hotkeys)
    const sameAsCurrent = current.length === 1
      && formatHotkeyBinding(current[0]) === formatHotkeyBinding(binding)
    if (sameAsCurrent) {
      // 又按了一次当前绑定：直接结束录制，不重复写入
      this.hotkeyConflictNames = ''
      return
    }

    const conflicts = findHotkeyConflicts(binding, this.configService.store.hotkeys, SFTP_PLUS_TOGGLE_HOTKEY)
    if (conflicts.length) {
      const names = await this._resolveHotkeyNames(conflicts)
      this.hotkeyConflictNames = names.join(', ')
      const ok = confirm(this.i18n.t('settings.hotkeyConflictConfirm', {
        keys: formatHotkeyBinding(binding),
        names: this.hotkeyConflictNames,
      }))
      if (!ok) {
        this.hotkeyConflictNames = ''
        return
      }
    } else {
      this.hotkeyConflictNames = ''
    }

    try {
      if (!this.configService.store.hotkeys) this.configService.store.hotkeys = {}
      this.configService.store.hotkeys[SFTP_PLUS_TOGGLE_HOTKEY] = [binding]
      await this.configService.save()
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeySaved', {
        keys: formatHotkeyBinding(binding),
      }))
    } catch (e) {
      log.warn('save hotkey failed', e)
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeySaveFailed'))
    }
  }

  private _teardownHotkeyRecording(_keepPreview: boolean): void {
    if (this._hotkeyCommitTimer) {
      clearTimeout(this._hotkeyCommitTimer)
      this._hotkeyCommitTimer = null
    }
    if (this._hotkeySafetyTimer) {
      clearTimeout(this._hotkeySafetyTimer)
      this._hotkeySafetyTimer = null
    }
    try { this._hotkeyStrokeSub?.unsubscribe() } catch { /* ignore */ }
    try { this._hotkeyKeyEventSub?.unsubscribe() } catch { /* ignore */ }
    this._hotkeyStrokeSub = null
    this._hotkeyKeyEventSub = null
    if (this._hotkeyDomHandler) {
      window.removeEventListener('keydown', this._hotkeyDomHandler, true)
      this._hotkeyDomHandler = null
    }
    try { this.hotkeys?.clearCurrentKeystrokes?.() } catch { /* ignore */ }
    if (this._hotkeyDisableHeld) {
      try { this.hotkeys?.enable?.() } catch { /* ignore */ }
      this._hotkeyDisableHeld = false
    }
    setHotkeyRecordingActive(false)
    this.hotkeyRecording = false
    this._pendingHotkeyStrokes = []
    this.hotkeyRecordingPreview = ''
  }

  private _flashHotkeyMessage(msg: string): void {
    this.hotkeySaveMessage = msg
    if (this._hotkeyMsgTimer) clearTimeout(this._hotkeyMsgTimer)
    this._hotkeyMsgTimer = setTimeout(() => {
      this.hotkeySaveMessage = ''
      this._hotkeyMsgTimer = null
    }, 2500)
  }

  /** 开始录制某个面板操作快捷键（追加为新绑定；键盘单键 + 鼠标侧键，区别于 Tabby 多键序列格式） */
  startPanelHotkeyRecording(action: PanelHotkeyAction): void {
    if (this.panelHotkeyRecording) this._teardownPanelHotkeyRecording()
    this.panelHotkeyRecording = action
    this.panelHotkeyRecordingPreview = ''
    setHotkeyRecordingActive(true)
    try { this.hotkeys?.disable?.() } catch { /* ignore */ }

    const commit = (spec: string | null) => {
      if (!spec) return
      this.panelHotkeyRecordingPreview = this.panelHotkeyLabel(spec)
      // ★ 2026-09-29：滚轮一次物理操作会连发多个 wheel 事件，同一 spec 只保留首次的提交计时，
      //   否则事件流持续期间计时器被反复重置，松手后仍要再等一个延迟才提交。
      if (spec === this._panelHotkeyPendingSpec && this._panelHotkeyTimer) return
      if (this._panelHotkeyTimer) clearTimeout(this._panelHotkeyTimer)
      this._panelHotkeyPendingSpec = spec
      this._panelHotkeyTimer = setTimeout(() => {
        this._panelHotkeyTimer = null
        this._commitPanelHotkey(action, spec)
      }, 250)
    }

    this._panelHotkeyDomHandler = (ev: KeyboardEvent) => {
      if (!this.panelHotkeyRecording) return
      ev.preventDefault()
      ev.stopPropagation()
      if (ev.key === 'Escape') { this._teardownPanelHotkeyRecording(); return }
      if (ev.repeat) return
      commit(eventToPanelHotkeySpec(ev))
    }
    // ★ 2026-08-31：鼠标键录制（button 1 = 中键 / 3 = 后退 / 4 = 前进）；
    //   左键(0)与右键(2)返回 null ⇒ 不参与绑定也不吞事件
    this._panelHotkeyMouseHandler = (ev: MouseEvent) => {
      if (!this.panelHotkeyRecording) return
      const spec = pointerSpecFromEvent(ev)
      if (!spec) return
      ev.preventDefault()
      ev.stopPropagation()
      commit(spec)
    }
    // ★ 2026-09-29：滚轮录制。两个要点缺一不可：
    //   ① 只在录制期监听，且捕获阶段就 preventDefault —— 否则设置页自己会跟着滚，
    //      滚到别的行上用户就看不到录制框了；
    //   ② 必须显式 passive:false —— window/document 上的 wheel 监听默认 passive:true，
    //      此时 preventDefault() 是空操作（浏览器只打一条警告），页面照样滚。
    this._panelHotkeyWheelHandler = (ev: WheelEvent) => {
      if (!this.panelHotkeyRecording) return
      ev.preventDefault()
      ev.stopPropagation()
      commit(pointerSpecFromEvent(ev))
    }
    window.addEventListener('keydown', this._panelHotkeyDomHandler, true)
    window.addEventListener('mousedown', this._panelHotkeyMouseHandler, true)
    window.addEventListener('wheel', this._panelHotkeyWheelHandler, { capture: true, passive: false })

    if (this._panelHotkeySafeTimer) clearTimeout(this._panelHotkeySafeTimer)
    this._panelHotkeySafeTimer = setTimeout(() => {
      if (this.panelHotkeyRecording) {
        this._teardownPanelHotkeyRecording()
        this._flashHotkeyMessage(this.i18n.t('settings.hotkeyRecordTimeout'))
      }
    }, 12000)
  }

  private _teardownPanelHotkeyRecording(): void {
    if (this._panelHotkeyTimer) { clearTimeout(this._panelHotkeyTimer); this._panelHotkeyTimer = null }
    if (this._panelHotkeySafeTimer) { clearTimeout(this._panelHotkeySafeTimer); this._panelHotkeySafeTimer = null }
    if (this._panelHotkeyDomHandler) {
      window.removeEventListener('keydown', this._panelHotkeyDomHandler, true)
      this._panelHotkeyDomHandler = null
    }
    if (this._panelHotkeyMouseHandler) {
      window.removeEventListener('mousedown', this._panelHotkeyMouseHandler, true)
      this._panelHotkeyMouseHandler = null
    }
    if (this._panelHotkeyWheelHandler) {
      // 移除只需 capture 标志一致；passive 不参与匹配
      window.removeEventListener('wheel', this._panelHotkeyWheelHandler, { capture: true })
      this._panelHotkeyWheelHandler = null
    }
    this._panelHotkeyPendingSpec = ''
    try { this.hotkeys?.enable?.() } catch { /* ignore */ }
    setHotkeyRecordingActive(false)
    this.panelHotkeyRecording = null
    this.panelHotkeyRecordingPreview = ''
  }

  private async _commitPanelHotkey(action: PanelHotkeyAction, spec: string): Promise<void> {
    this._teardownPanelHotkeyRecording()
    // 不与其它动作的绑定重复
    for (const a of this.panelHotkeyActions) {
      if (a !== action && this.panelHotkeyKeys(a).includes(spec)) {
        this._flashHotkeyMessage(this.i18n.t('settings.panelHotkeyConflict', { keys: this.panelHotkeyLabel(spec) }))
        return
      }
    }
    const list = this.panelHotkeys[action]
    if (list.keys.includes(spec)) {
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeyDuplicate'))
      return
    }
    // ★ 2026-09-20：对照 Tabby 全局热键（如默认 Alt-Enter = 切换全屏），避免绑上却被 Tabby 抢走且无提示
    const tabbyStroke = panelHotkeySpecToTabbyBinding(spec)
    if (tabbyStroke && this.configService?.store?.hotkeys) {
      const conflicts = findHotkeyConflicts(tabbyStroke, this.configService.store.hotkeys, '')
      if (conflicts.length) {
        const names = await this._resolveHotkeyNames(conflicts)
        this.hotkeyConflictNames = names.join(', ')
        const ok = confirm(this.i18n.t('settings.hotkeyConflictConfirm', {
          keys: this.panelHotkeyLabel(spec),
          names: this.hotkeyConflictNames,
        }))
        if (!ok) {
          this.hotkeyConflictNames = ''
          return
        }
        this.hotkeyConflictNames = ''
      }
    }
    list.keys = [...list.keys, spec]
    list.enabled = true
    this._saveToConfig()
    this.notifyPanels()
    // ★ 2026-09-29：裸滚轮（无修饰键）绑定会把面板列表的滚动顶掉——绑上必须明说，
    //   否则用户只会觉得「列表突然滚不动了」（吞事件才能触发动作，二者不可兼得）
    this._flashHotkeyMessage(isBareWheelSpec(spec)
      ? this.i18n.t('settings.panelHotkeyWheelBareWarning', { keys: this.panelHotkeyLabel(spec) })
      : this.i18n.t('settings.hotkeySaved', { keys: this.panelHotkeyLabel(spec) }))
  }

  /** 移除某个动作的单个快捷键绑定 */
  removePanelHotkeyAt(action: PanelHotkeyAction, index: number): void {
    const list = this.panelHotkeys[action]
    if (!list || index < 0 || index >= list.keys.length) return
    list.keys = list.keys.filter((_, i) => i !== index)
    // 全部移除后置 enabled=false 双保险，防止 config 清洗空数组后 defaults 回退
    if (!list.keys.length) list.enabled = false
    this._saveToConfig()
    this.notifyPanels()
    this._flashHotkeyMessage(this.i18n.t('settings.hotkeyCleared'))
  }

  /** 清除某个动作的全部快捷键绑定 */
  clearPanelHotkey(action: PanelHotkeyAction): void {
    this.panelHotkeys[action] = { keys: [], enabled: false }
    this._saveToConfig()
    this.notifyPanels()
    this._flashHotkeyMessage(this.i18n.t('settings.hotkeyCleared'))
  }

  /** 判断某面板快捷键是否已绑定（至少一个有效绑定，且 enabled 未被标记为 false） */
  isPanelHotkeyBound(action: PanelHotkeyAction): boolean {
    return this.panelHotkeyKeys(action).length > 0
  }

  /** 取某动作的绑定列表（已归一化，剔除哨兵/空值）；enabled=false 视为未绑定 */
  panelHotkeyKeys(action: PanelHotkeyAction): string[] {
    const h = (this.panelHotkeys as any)[action]
    if (!h || h.enabled === false) return []
    return normalizePanelHotkeyKeys(h.keys, PANEL_HOTKEY_CLEARED)
  }

  /** 单个绑定的显示文案：指针类用固定符号（鼠标键 MouseN / 滚轮 Wheel↑↓），空格键显示 Space */
  panelHotkeyLabel(spec: string): string {
    if (!spec) return ''
    if (spec === ' ') return 'Space'
    // 带修饰键时只替换主键部分（'Alt+WheelUp' → 'Alt+Wheel↑'）
    const cut = spec.lastIndexOf('+')
    const mods = cut >= 0 ? spec.slice(0, cut + 1) : ''
    const main = cut >= 0 ? spec.slice(cut + 1) : spec
    const special: Record<string, string> = {
      [MOUSE_MIDDLE_SPEC]: 'Mouse1',
      [MOUSE_BACK_SPEC]: 'Mouse3',
      [MOUSE_FORWARD_SPEC]: 'Mouse4',
      [WHEEL_UP_SPEC]: 'Wheel↑',
      [WHEEL_DOWN_SPEC]: 'Wheel↓',
    }
    return mods + (special[main] ?? main)
  }

  /** 是否为指针类绑定（鼠标键/滚轮；模板据此用不同配色区分） */
  isPanelPointerHotkey(spec: string): boolean {
    return isPointerHotkeySpec(spec)
  }

  /** 绑定 chip 的悬停提示：滚轮 → 滚动被顶掉的提醒；鼠标键 → 侧键/中键说明；其余 → 点击重新录制 */
  hotkeyChipHint(spec: string): string {
    if (isWheelHotkeySpec(spec)) return this.i18n.t('settings.hotkeyWheelHint')
    if (isMouseHotkeySpec(spec)) return this.i18n.t('settings.hotkeyMouseHint')
    return this.i18n.t('settings.hotkeyClickToSet')
  }

  /** 重置面板快捷键为默认值 */
  resetPanelHotkeys(): void {
    this.panelHotkeys = defaultPanelHotkeys()
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 面板快捷键动作的标签 i18n key。新增动作复用右键菜单既有文案，避免重复翻译 24 语言 */
  private readonly panelHotkeyLabelKeys: Record<PanelHotkeyAction, string> = {
    delete: 'settings.phk.delete',
    rename: 'settings.phk.rename',
    refresh: 'settings.phk.refresh',
    up: 'settings.phk.up',
    back: 'settings.phk.back',
    forward: 'settings.phk.forward',
    upload: 'app.upload',
    download: 'app.download',
    openLocal: 'file.open',
    viewFile: 'file.view',
    editFile: 'file.edit',
    newFolder: 'file.newFolder',
    newFile: 'file.newFile',
    details: 'file.properties',
    copyPath: 'pane.copyPath',
  }

  panelHotkeyLabelKey(action: PanelHotkeyAction): string {
    return this.panelHotkeyLabelKeys[action] ?? action
  }

  /** 系统修饰键文本（macOS 为 ⌘，其余为 Ctrl） */
  get modKeyText(): string {
    const p = (typeof navigator !== 'undefined' ? navigator.platform : '') || ''
    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || ''
    return /Mac|iPod|iPhone|iPad/.test(p || ua) ? '⌘' : 'Ctrl'
  }

  /** 占用清单中把 '${mod}' 占位符替换为系统修饰键 */
  formatOccupiedKeys(keys: string): string {
    return String(keys).replace('${mod}', this.modKeyText)
  }

  /** 「已占用快捷键」清单展开状态（默认收起） */
  occupiedHotkeysExpanded = false

  toggleOccupiedHotkeys(): void {
    this.occupiedHotkeysExpanded = !this.occupiedHotkeysExpanded
  }

  /**
   * 由 SFTP+ 固定占用、用户不可修改的键位（只读展示）。
   * 列出这些可避免用户把上面的可配置快捷键设成已被占用的组合而互相抢触发。
   */
  readonly occupiedHotkeyGroups: Array<{
    titleKey: string
    items: Array<{ keys: string; descKey: string }>
  }> = [
    {
      titleKey: 'settings.occupied.groupPanel',
      items: [
        { keys: '${mod}+A', descKey: 'pane.selectAll' },
        { keys: '${mod}+C', descKey: 'file.copy' },
        { keys: '${mod}+X', descKey: 'file.cut' },
        { keys: '${mod}+V', descKey: 'file.paste' },
        { keys: '↑ ↓', descKey: 'settings.occupied.moveSelection' },
        { keys: '${mod}+Click', descKey: 'settings.occupied.multiSelect' },
        { keys: 'A–Z …', descKey: 'settings.occupied.typeAhead' },
      ],
    },
    {
      titleKey: 'settings.occupied.groupViewer',
      items: [
        { keys: '← →', descKey: 'settings.occupied.prevNextImage' },
      ],
    },
    {
      titleKey: 'settings.occupied.groupDialog',
      items: [
        { keys: 'Esc', descKey: 'settings.occupied.closeDialog' },
        { keys: 'Enter', descKey: 'settings.occupied.confirmDelete' },
      ],
    },
  ]

  private async _ensureHotkeyDescriptions(): Promise<void> {
    if (Object.keys(this._hotkeyDescCache).length) return
    try {
      const list = await this.hotkeys?.getHotkeyDescriptions?.()
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item?.id) this._hotkeyDescCache[item.id] = item.name || item.id
        }
      }
    } catch { /* ignore */ }
  }

  private async _resolveHotkeyNames(ids: string[]): Promise<string[]> {
    await this._ensureHotkeyDescriptions()
    return ids.map(id => this._hotkeyDescCache[id] || id)
  }

  /** 从配置重新加载所有设置并刷新主题（可安全重复调用） */
  private _refreshFromConfig(): void {
    const root = document.documentElement

    // 从 Tabby 配置加载存储的设置
    this._readFromConfig()

    // Auto 模式下检测当前 Tabby UI 主题，并加载对应预设色值
    if (!this.theme) {
      this.detectAutoTheme()
      const autoPreset = this.detectedAutoTheme === 'light' ? this.getPreset('light') : this.getPreset('dark')
      if (autoPreset) {
        this.themePrimary = autoPreset.primary
        this.themeBg = autoPreset.bg
        this.themeText = autoPreset.text
        this.themeBorder = autoPreset.border
      }
      this.clearColorVars()
    } else if (this.theme !== 'custom') {
      const p = this.getPreset(this.theme)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeBorder = p.border
        this.applyColors(root)
      }
    } else {
      // 自定义主题：从 localStorage 恢复自定义颜色（config 可能被预定义主题覆盖）
      this._restoreCustomColors()
      this.applyColors(root)
    }
  }

  /**
   * ★ 2026-10-09 审计新增：_readFromConfig 中读到「需要清理失效图标规则」时置位，
   *   待本方法**全部字段读完**后再执行（避免中途 _saveToConfig 覆盖未读入的真实配置）。
   */
  private _pendingIconRuleCleanup = false

  /** 从 Tabby 配置加载所有设置 */
  private _readFromConfig(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (!cfg) return
      if (cfg.lang !== undefined) this.lang = cfg.lang as '' | Locale
      if (cfg.layoutMode !== undefined) this.layoutMode = cfg.layoutMode as string
      if (typeof cfg.fontSize === 'number' && Number.isFinite(cfg.fontSize)) {
        this.fontSize = this._clampFontSize(cfg.fontSize)
      }
      if (cfg.theme !== undefined) this.theme = cfg.theme as string
      if (cfg.colorPrimary !== undefined) this.themePrimary = cfg.colorPrimary as string
      if (cfg.colorBg !== undefined) this.themeBg = cfg.colorBg as string
      if (cfg.colorText !== undefined) this.themeText = cfg.colorText as string
      if (cfg.colorBorder !== undefined) this.themeBorder = cfg.colorBorder as string
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：面板透明度（钳制 0.5–1，历史缺失值按 1）
      if (Number.isFinite(Number(cfg.panelOpacity))) this.panelOpacity = Math.min(1, Math.max(0.5, Number(cfg.panelOpacity)))
      if (cfg.tableColBorders !== undefined) this.showColBorders = cfg.tableColBorders as boolean
      if (cfg.tableZebra !== undefined) this.showZebra = cfg.tableZebra as boolean
      if (cfg.hideNativeSFTPButton !== undefined) this.hideNativeBtn = cfg.hideNativeSFTPButton as boolean
      // ★ 2026-10-22（Deepseek-V4.1-Flash）：第四档 mirror（同步路径）也要能回读
      if (cfg.defaultPathMode === 'off' || cfg.defaultPathMode === 'remember'
        || cfg.defaultPathMode === 'sync' || cfg.defaultPathMode === 'mirror') this.defaultPathMode = cfg.defaultPathMode
      // ★ 2026-10-22 续三十六（Deepseek-V4.1-Flash）：缺省按 true（老用户升级后行为不变）
      if (cfg.applySettingsInstantly !== undefined) this.applySettingsInstantly = cfg.applySettingsInstantly !== false
      if (cfg.defaultShowHidden !== undefined) this.defaultShowHidden = cfg.defaultShowHidden === true
      if (cfg.openInNewTabByDefault !== undefined) this.openInNewTabByDefault = cfg.openInNewTabByDefault as boolean
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器唤起方式
      if (cfg.connPickerTrigger === 'paneToolbar' || cfg.connPickerTrigger === 'both') this.connPickerTrigger = cfg.connPickerTrigger
      else if (cfg.connPickerTrigger === 'terminalBadge') this.connPickerTrigger = 'paneToolbar'  // 兼容旧值
      else if (cfg.connPickerTrigger === 'topbar') this.connPickerTrigger = 'topbar'
      // ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash）：顶栏连接显示 别名 / 账号@地址（缺省 = account）
      if (cfg.connLabelStyle === 'alias') this.connLabelStyle = 'alias'
      else if (cfg.connLabelStyle === 'account') this.connLabelStyle = 'account'
      if (cfg.singleWorkspaceInstance !== undefined) this.singleWorkspaceInstance = cfg.singleWorkspaceInstance as boolean
      if (cfg.closeBookmarkPanelOnSelect !== undefined) this.closeBookmarkPanelOnSelect = cfg.closeBookmarkPanelOnSelect as boolean
      if (cfg.typeAheadEnabled !== undefined) this.typeAheadEnabled = cfg.typeAheadEnabled !== false
      if (cfg.bookmarkPanelGroupByScope !== undefined) this.bookmarkPanelGroupByScope = cfg.bookmarkPanelGroupByScope !== false
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：联动书签（★ 2026-10-20 默认改为开 ⇒ 缺省按开处理）
      this.bookmarkLinkEnabled = cfg.bookmarkLinkEnabled !== false
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：书签排序方式（默认拖拽顺序）
      // ★ 2026-10-22（Deepseek-V4.1-Flash）：三档归一化，老配置 bookmarkSortByUsage=true 折算 usage
      this.bookmarkSortMode = normalizeBookmarkSortMode(cfg.bookmarkSortMode, cfg.bookmarkSortByUsage)
      if (Array.isArray(cfg.bookmarkPanelGroupOrder) && cfg.bookmarkPanelGroupOrder.length) {
        const valid = (cfg.bookmarkPanelGroupOrder as string[]).filter(
          (x): x is 'connection' | 'global' => x === 'connection' || x === 'global',
        )
        if (valid.includes('connection') && valid.includes('global')) {
          this.bookmarkPanelGroupOrder = [valid[0], valid.find(x => x !== valid[0])!]
        }
      }
      if (cfg.dateFormat !== undefined) {
        this.dateFormat = (cfg.dateFormat as string) || DEFAULT_DATE_FORMAT
        setDateFormatPattern(this.dateFormat)
      }
      if (typeof cfg.transferUploadConcurrency === 'number') this.uploadConcurrency = this._clampConcurrency(cfg.transferUploadConcurrency)
      if (typeof cfg.transferDownloadConcurrency === 'number') this.downloadConcurrency = this._clampConcurrency(cfg.transferDownloadConcurrency)
      // ★ 2026-09-28：传输通道模式（含旧 transferTarAcceleration 开关迁移）
      if ((cfg as any).transferChannelMode && ['smart', 'sftpOnly', 'tarOnly', 'preferSftp', 'preferTar'].includes((cfg as any).transferChannelMode)) {
        this.transferChannelMode = (cfg as any).transferChannelMode
      } else if ((cfg as any).transferTarAcceleration === false) {
        this.transferChannelMode = 'sftpOnly'
      } else {
        this.transferChannelMode = 'smart'
      }
      // ★ 2026-09-07 issue #15：冲突内容摘要
      if (cfg.conflictDigestEnabled !== undefined) this.conflictDigestEnabled = cfg.conflictDigestEnabled !== false
      if (cfg.conflictAutoSkipSameContent !== undefined) this.conflictAutoSkipSameContent = cfg.conflictAutoSkipSameContent !== false
      if (cfg.conflictDigestMaxSizeMB !== undefined) {
        this.conflictDigestMaxSizeMB = this._clampDigestMaxMB(cfg.conflictDigestMaxSizeMB)
      }
      // ★ 2026-10-23：冲突重命名风格（旧配置没有此键 ⇒ 归一化回落到 seq）
      this.conflictRenameStyle = normalizeConflictRenameStyle(cfg.conflictRenameStyle)
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点只认当前目录（缺键按「开」）
      this.dropToCurrentDir = cfg.dropToCurrentDir !== false
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动（缺键按「关」+ 观察期夹到 1–120s）
      this.refreshOnQuickCmd = cfg.refreshOnQuickCmd === true
      this.refreshOnQuickCmdWindow = normalizeRefreshWindowSec(
        cfg.refreshOnQuickCmdWindow !== undefined ? cfg.refreshOnQuickCmdWindow : 10)
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新（缺键按「关」+ 间隔夹到 5–3600s）
      this.autoRefreshEnabled = cfg.autoRefreshEnabled === true
      this.autoRefreshInterval = normalizeAutoRefreshIntervalSec(
        cfg.autoRefreshInterval !== undefined ? cfg.autoRefreshInterval : 60)
      // ★ 2026-10-28（Deepseek-V4.1-Flash）：列表刷新闪烁（缺键按「开」；老配置无此键 ⇒ 保留原有反馈）
      this.listRefreshFlash = cfg.listRefreshFlash !== false
      if (typeof cfg.defaultUploadPath === 'string') this.defaultUploadPath = cfg.defaultUploadPath
      if (typeof cfg.defaultDownloadPath === 'string') this.defaultDownloadPath = cfg.defaultDownloadPath
      if (typeof cfg.iconResourceDir === 'string') this.iconResourceDir = cfg.iconResourceDir
      if (Array.isArray(cfg.fileTypeIcons)) {
        this.fileTypeIcons = cfg.fileTypeIcons
          .filter((r: any) => r && typeof r.ext === 'string' && typeof r.svg === 'string')
          .map((r: any) => {
            const rule: FileTypeIconRule = { ext: r.ext, svg: r.svg }
            if (typeof r.name === 'string' && r.name.trim()) rule.name = r.name.trim()
            return rule
          })
      }
      if (Array.isArray(cfg.disabledIconSvgs)) this.disabledIconSvgs = cfg.disabledIconSvgs.filter((s: any) => typeof s === 'string')
      if (typeof cfg.folderIconSvg === 'string') this.folderIconSvg = cfg.folderIconSvg || 'folder.svg'
      // ★ 2026-10-09 审计根治：原在此处直接调 _autoCleanInvalidRules()，而后者内部
      //   在发现失效规则时会调 _saveToConfig() —— 把**全部 40+ 字段**从组件当前内存值
      //   写进 store。但此刻本方法才执行到一半：paneCustomOrder / contextMenuOrder /
      //   contextMenuDisabled / panelHotkeys / hideAuthorInfo 等**还没从 cfg 读出**，
      //   仍是构造期的默认值/硬编码初始值 ⇒ 用户真实配置被默认值覆盖并 save() 落盘。
      //   触发路径：配了自定义图标规则且其中有失效项 → 打开设置页 ⇒ 工具栏顺序 /
      //   右键菜单顺序 / 快捷键被静默重置。
      //   根治：**延后**到本方法全部字段读完之后再执行（见下方 _pendingIconRuleCleanup），
      //   此时内存值已与 config 一致，_saveToConfig() 写回的是真实值。
      this._pendingIconRuleCleanup = true
      if (cfg.hideAuthorInfo !== undefined) this.hideAuthorInfo = cfg.hideAuthorInfo === true
      if (Array.isArray(cfg.paneCustomOrder) && cfg.paneCustomOrder.length) this.paneCustomOrder = cfg.paneCustomOrder as any
      // 一次性迁移：旧默认顺序（hidden 追加在末尾）→ 新默认顺序（hidden 在 filter 前）；用户自定义过的顺序不动
      if (this.paneCustomOrder.join(',') === 'label,back,forward,up,refresh,home,path,filter,bookmark,hidden') {
        this.paneCustomOrder = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
      }
      // 保证 'hidden'（眼睛图标项）始终存在于顺序中：缺失时插到 'filter' 前面（无 filter 则追加末尾）
      if (!this.paneCustomOrder.includes('hidden')) {
        const next = [...this.paneCustomOrder]
        const idx = next.indexOf('filter')
        next.splice(idx >= 0 ? idx : next.length, 0, 'hidden')
        this.paneCustomOrder = next
      }
      // 注意：空数组也要赋值（全部重新勾选后隐藏列表为空，必须覆盖旧值），仅当 config 无该字段时才回退 localStorage
      if (Array.isArray(cfg.paneHiddenItems)) {
        this.paneHiddenItems = cfg.paneHiddenItems as string[]
      } else {
        try {
          const raw = localStorage.getItem('sftp-plus-pane-hidden-items')
          if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) this.paneHiddenItems = parsed as string[] }
        } catch { /* ignore */ }
      }
      // ★ 2026-08-22：交互设置
      if (cfg.openOnClick === 'single' || cfg.openOnClick === 'double') this.openOnClick = cfg.openOnClick
      // ★ 2026-10-30（meta）：文件默认动作（查看/编辑）
      if (cfg.openFileDefaultAction === 'view' || cfg.openFileDefaultAction === 'edit') this.openFileDefaultAction = cfg.openFileDefaultAction
      if (cfg.openUnsupportedInSystem !== undefined) this.openUnsupportedInSystem = cfg.openUnsupportedInSystem === true
      if (cfg.editableFileExtensions !== undefined) {
        this.editableFileExtensionsText = formatTextExtensionsForInput(cfg.editableFileExtensions)
      }
      this.allowViewEditAllFiles = resolveAllowViewEditAllFiles(cfg as Record<string, unknown>)
      if (cfg.showTextLineNumbers !== undefined) this.showTextLineNumbers = cfg.showTextLineNumbers !== false
      if (cfg.showTextWordWrap !== undefined) this.showTextWordWrap = cfg.showTextWordWrap === true
      if (cfg.editorAutoUploadExternal !== undefined) this.editorAutoUploadExternal = cfg.editorAutoUploadExternal === true
      if (cfg.textCaretShape !== undefined) this.textCaretShape = normalizeCaretShape(cfg.textCaretShape)
      if (Array.isArray(cfg.contextMenuOrder) && cfg.contextMenuOrder.length) {
        const valid = (cfg.contextMenuOrder as string[]).filter(a => (a in FILE_MENU_REGISTRY)) as ContextMenuAction[]
        // 补齐可能缺失的已知项（★ 2026-10-20：改由 fillMenuOrder 按默认顺序相对位置插入，
        // 不再一律追加末尾 —— 否则老配置升级后新增的「传输」会沉到列表最下面）
        this.contextMenuOrder = [...fillMenuOrder(valid), 'groupBy'] as ContextMenuCustomId[]
      }
      if (Array.isArray(cfg.contextMenuDisabled)) {
        // groupToggleAll 已并入分组依据子菜单，不再是独立定制项——历史配置里的该值直接丢弃
        this.contextMenuDisabled = (cfg.contextMenuDisabled as string[])
          .filter(a => (a in FILE_MENU_REGISTRY) || a === 'groupBy') as ContextMenuCustomId[]
      }
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制。normalize 会剔除未知 id 并补齐新增项，
      //   缺失字段（老配置）自动落到默认值 ⇒ 不配置时行为与历史一致。
      this.topBarOrder = normalizeTopBarOrder((cfg as any)[TOP_BAR_CFG_FIELDS.order])
      this.topBarPinned = normalizeTopBarPinned((cfg as any)[TOP_BAR_CFG_FIELDS.pinned])
      this.topBarDisabled = normalizeTopBarDisabled((cfg as any)[TOP_BAR_CFG_FIELDS.disabled])
      this.topBarOverflowEnabled = (cfg as any)[TOP_BAR_CFG_FIELDS.overflow] === true
      // ★ 2026-08-31：面板内置操作快捷键（多绑定）。与默认值合并保证动作齐全。
      // ★ 2026-08-24 修复：空串/NUL/空数组会被 Tabby config 清洗删除（{} → defaults 回退 F2/F5）。
      //    双保险：无绑定时写 enabled=false（布尔一定保留），读取时据此判为未绑定。
      if (cfg.panelHotkeys && typeof cfg.panelHotkeys === 'object') {
        const ph = cfg.panelHotkeys as any
        const def = this.panelHotkeys
        for (const a of PANEL_HOTKEY_ACTIONS) {
          if (ph[a] && typeof ph[a] === 'object') {
            const isDisabled = ph[a].enabled === false
            // 兼容旧格式 { key: 'Delete' } 与新格式 { keys: ['Delete'] }
            const raw = (ph[a] as any).keys ?? (ph[a] as any).key
            // ★ 2026-09-29：「keys/key 与 enabled 双双缺省」= 清空数据后留下的空壳
            //   （ConfigProxy 对结构成员的叶子，一旦值等于默认值就会被 delete，故「已恢复默认」
            //   在磁盘上表现为 `{}` 而不是 `{keys:['Delete'],enabled:true}`）。
            //   此时必须**保留默认绑定** —— 否则「清空数据」会把 Delete / F2 / F5 等默认快捷键
            //   显示成「未绑定」（看着像删过头，其实是读法把空壳误判成显式解绑）。
            //   注意：显式解绑一定是 `keys: []`（有定义）或 `enabled: false`，不会落到这里。
            if (raw === undefined && !isDisabled) continue
            const keys = isDisabled ? [] : normalizePanelHotkeyKeys(raw, PANEL_HOTKEY_CLEARED)
            def[a] = { keys, enabled: !isDisabled }
          }
        }
        this.panelHotkeys = def
      }
    } catch { /* ignore */ }

    // ★ 2026-10-09 审计根治：此处才是执行「自动清理失效图标规则」的**正确时机** ——
    //   上面所有字段（含 paneCustomOrder / contextMenuOrder / contextMenuDisabled /
    //   panelHotkeys / hideAuthorInfo）都已从 config 读入，内存值与 config 一致，
    //   此时 _autoCleanInvalidRules() 内部的 _saveToConfig() 写回的是**真实值**，
    //   不会用默认值覆盖用户配置。（原先它在方法中段就调用，是配置被静默重置的根因。）
    //   用 try/catch 兜住：清理失败不应让整个设置页加载失败。
    if (this._pendingIconRuleCleanup) {
      this._pendingIconRuleCleanup = false
      try { this._autoCleanInvalidRules() } catch (e) { log.warn('auto clean invalid icon rules failed:', e) }
    }
  }

  /**
   * 写入 Tabby config（per-property update 避免 ConfigProxy 覆盖问题）
   */
  private async _saveToConfig(): Promise<void> {
    try { localStorage.setItem('sftp-plus-pane-custom-order', JSON.stringify(this.paneCustomOrder)) } catch {}
    try { localStorage.setItem('sftp-plus-pane-hidden-items', JSON.stringify(this.paneHiddenItems)) } catch {}
    try { localStorage.setItem('sftp-plus-context-menu-order', JSON.stringify(this.contextMenuOrder)) } catch {}
    try { localStorage.setItem('sftp-plus-context-menu-disabled', JSON.stringify(this.contextMenuDisabled)) } catch {}
    if (!this.configService) return
    try {
      const target = this.configService.store['tabby-sftp-plus']
      if (!target) return  // 配置段未就绪，静默跳过
      target.lang = this.lang
      target.layoutMode = this.layoutMode
      target.fontSize = this.fontSize
      // 同步写入面板读取的嵌套路径（与浮动面板 cycleLayoutMode 一致），修复设置页切换布局后面板不生效
      this.sftpConfig?.set('paneState/layout/mode', this.layoutMode)
      target.theme = this.theme
      target.colorPrimary = this.themePrimary
      target.colorBg = this.themeBg
      target.colorText = this.themeText
      target.colorBorder = this.themeBorder
      target.panelOpacity = this.panelOpacity
      target.tableColBorders = this.showColBorders
      target.tableZebra = this.showZebra
      target.hideNativeSFTPButton = this.hideNativeBtn
      target.defaultPathMode = this.defaultPathMode
      target.applySettingsInstantly = this.applySettingsInstantly
      target.defaultShowHidden = this.defaultShowHidden
      target.openInNewTabByDefault = this.openInNewTabByDefault
      target.connPickerTrigger = this.connPickerTrigger
      // ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash）：顶栏连接显示（别名 / 账号@地址）
      target.connLabelStyle = this.connLabelStyle
      target.singleWorkspaceInstance = this.singleWorkspaceInstance
      target.closeBookmarkPanelOnSelect = this.closeBookmarkPanelOnSelect
      target.typeAheadEnabled = this.typeAheadEnabled
      target.bookmarkPanelGroupByScope = this.bookmarkPanelGroupByScope
      target.bookmarkLinkEnabled = this.bookmarkLinkEnabled
      target.bookmarkSortMode = this.bookmarkSortMode
      target.bookmarkPanelGroupOrder = this.bookmarkPanelGroupOrder
      target.dateFormat = this.dateFormat
      target.transferUploadConcurrency = this.uploadConcurrency
      target.transferDownloadConcurrency = this.downloadConcurrency
      target.transferChannelMode = this.transferChannelMode
      // ★ 2026-09-07 issue #15：三者均为标量叶子，可直接赋值（符合 ConfigProxy「只有叶子标量可写」的要求）
      target.conflictDigestEnabled = this.conflictDigestEnabled
      target.conflictAutoSkipSameContent = this.conflictAutoSkipSameContent
      target.conflictDigestMaxSizeMB = this.conflictDigestMaxSizeMB
      // ★ 2026-10-23：冲突重命名风格（标量叶子，可直接赋值）
      target.conflictRenameStyle = this.conflictRenameStyle
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点只认当前目录（标量叶子）
      target.dropToCurrentDir = this.dropToCurrentDir
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动（均为标量叶子，可直接赋值）
      target.refreshOnQuickCmd = this.refreshOnQuickCmd
      target.refreshOnQuickCmdWindow = normalizeRefreshWindowSec(this.refreshOnQuickCmdWindow)
      // ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新（均为标量叶子）
      target.autoRefreshEnabled = this.autoRefreshEnabled
      target.autoRefreshInterval = normalizeAutoRefreshIntervalSec(this.autoRefreshInterval)
      // ★ 2026-10-28（Deepseek-V4.1-Flash）：列表刷新闪烁（标量叶子）
      target.listRefreshFlash = this.listRefreshFlash
      target.defaultUploadPath = this.defaultUploadPath
      target.defaultDownloadPath = this.defaultDownloadPath
      target.iconResourceDir = this.iconResourceDir
      target.fileTypeIcons = this.fileTypeIcons
      target.disabledIconSvgs = this.disabledIconSvgs
      target.folderIconSvg = this.folderIconSvg
      target.hideAuthorInfo = this.hideAuthorInfo
      target.paneCustomOrder = this.paneCustomOrder
      target.paneHiddenItems = this.paneHiddenItems
      target.openOnClick = this.openOnClick
      // ★ 2026-10-30（meta）：文件默认动作
      target.openFileDefaultAction = this.openFileDefaultAction
      target.openUnsupportedInSystem = this.openUnsupportedInSystem
      target.editableFileExtensions = normalizeEditableExtensions(this.editableFileExtensionsText)
      target.allowViewEditAllFiles = this.allowViewEditAllFiles
      target.showTextLineNumbers = this.showTextLineNumbers
      target.showTextWordWrap = this.showTextWordWrap
      target.editorAutoUploadExternal = this.editorAutoUploadExternal
      target.textCaretShape = this.textCaretShape
      // 兼容旧字段：同步写入，避免回退旧版插件时丢失开关状态。
      // ★ 2026-10-09：这两个键原先在 defaultSftpPlusConfig() 里**缺席**，而宿主 ConfigProxy
      //   只为 defaults 里出现过的键建立 accessor ⇒ 这两行是原生属性赋值，值落在 Proxy 实例上
      //   而不在 _store ⇒ save() 时被 JSON.stringify 丢掉 ⇒ 意图完全无效。
      //   已在 config-provider.ts 把它们补进 defaults（含各自独立 try/catch 语义），
      //   此处写入现在才真正落盘。
      target.allowEditAllFiles = this.allowViewEditAllFiles
      target.allowViewAllAsText = this.allowViewEditAllFiles
      target.contextMenuOrder = this.contextMenuOrder
      target.contextMenuDisabled = this.contextMenuDisabled
      // ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制（面板从同一份配置读取）
      ;(target as any)[TOP_BAR_CFG_FIELDS.order] = [...this.topBarOrder]
      ;(target as any)[TOP_BAR_CFG_FIELDS.pinned] = [...this.topBarPinned]
      ;(target as any)[TOP_BAR_CFG_FIELDS.disabled] = [...this.topBarDisabled]
      ;(target as any)[TOP_BAR_CFG_FIELDS.overflow] = this.topBarOverflowEnabled
      // ★ 2026-08-24 修复：panelHotkeys 是 ConfigProxy 的「结构成员」（对象），只有 getter 没有 setter。
      //    直接 `target.panelHotkeys = x` 不生效（严格模式抛 TypeError 被 catch 吞掉 / 非严格静默忽略），
      //    导致绑定从未落盘 → config.yaml 写成 {} → 重启后 defaults 回退 F2/F5。
      //    必须逐叶子赋值：先经 getter 取到嵌套 proxy，再对 keys/enabled 叶子调用 setter。
      // ★ 2026-08-31：改为多绑定 keys[]。空数组会被 config 清洗（等于默认值时 delete），
      //    故同时写 enabled=false 作双保险；并把旧单键字段 key 改写为哨兵，
      //    防止旧值在 keys 被清洗后「复活」成意外绑定。
      const ph = (target as any).panelHotkeys
      if (ph) {
        for (const a of PANEL_HOTKEY_ACTIONS) {
          const dst = ph[a]
          if (dst) {
            const keys = this.panelHotkeyKeys(a)
            dst.keys = keys
            dst.enabled = keys.length > 0 && this.panelHotkeys[a].enabled !== false
            dst.key = PANEL_HOTKEY_CLEARED
          }
        }
      }
      await this.configService.save()
    } catch (e) {
      log.error('Failed to save to config', e)
    }
  }

  /**
   * 迁移数据：localStorage ↔ config.store（切换存储模式时调用）
   */
  saveLang(): void {
    this._saveToConfig()
    this.i18n.setLocale(this.effectiveLang)
    this.notifyPanels()
  }

  private getPreset(value: string): typeof this.colorThemes[0] | undefined {
    return this.colorThemes.find(t => t.value === value)
  }

  private applyColors(root: HTMLElement): void {
    if (!this.themePrimary || !this.themeBg || !this.themeText) return
    root.style.setProperty('--sftp-primary', this.themePrimary)
    root.style.setProperty('--sftp-bg', this.themeBg)
    root.style.setProperty('--sftp-text', this.themeText)
    root.style.setProperty('--sftp-border', this.themeBorder || '')
  }

  private clearColorVars(): void {
    const root = document.documentElement
    root.style.removeProperty('--sftp-primary')
    root.style.removeProperty('--sftp-bg')
    root.style.removeProperty('--sftp-text')
    root.style.removeProperty('--sftp-border')
  }

  setTheme(value: string): void {
    this.theme = value

    const root = document.documentElement
    if (!value) {
      this.clearColorVars()
      this.detectAutoTheme()
      // 加载检测到的明/暗模式的预设色值，让颜色面板有值可显示
      const autoPreset = this.detectedAutoTheme === 'light' ? this.getPreset('light') : this.getPreset('dark')
      if (autoPreset) {
        this.themePrimary = autoPreset.primary
        this.themeBg = autoPreset.bg
        this.themeText = autoPreset.text
        this.themeBorder = autoPreset.border
        // 不保存到 localStorage，避免覆盖自定义配色缓存
      }
      this._saveToConfig()
      this.notifyPanels()
      return
    }

    if (value === 'custom') {
      // 从 localStorage 恢复自定义配色
      this._restoreCustomColors()
      this.applyColors(root)
      this.saveAllColors()
    } else {
      const p = this.getPreset(value)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeBorder = p.border
        // 不保存到 localStorage，避免覆盖自定义配色缓存
        this.applyColors(root)
      }
      this._saveToConfig()
    }
    this.notifyPanels()
  }

  onColorChange(key: string, val: string): void {
    if (this.theme !== 'custom') {
      // 非自定义模式：记录待修改值，弹窗询问
      this._pendingColorKey = key
      this._pendingColorVal = val
      this._pendingOrigTheme = this.theme
      this.showThemeColorConfirm = true
      return
    }
    // Update the specific color field
    const updates: Record<string, string> = { primary: this.themePrimary, bg: this.themeBg, text: this.themeText, border: this.themeBorder }
    updates[key] = val
    this.themePrimary = updates.primary
    this.themeBg = updates.bg
    this.themeText = updates.text
    this.themeBorder = updates.border
    this.saveAllColors()
    this.applyColors(document.documentElement)
    this.notifyPanels()
  }

  private saveAllColors(): void {
    // 写入 localStorage（load() 依赖 localStorage 读取）
    try { localStorage.setItem(`${PREFIX}.primaryColor`, JSON.stringify(this.themePrimary)) } catch {}
    try { localStorage.setItem(`${PREFIX}.bgColor`, JSON.stringify(this.themeBg)) } catch {}
    try { localStorage.setItem(`${PREFIX}.textColor`, JSON.stringify(this.themeText)) } catch {}
    try { localStorage.setItem(`${PREFIX}.borderColor`, JSON.stringify(this.themeBorder)) } catch {}
    this._saveToConfig()
  }

  /** 从 localStorage 恢复自定义配色（config 中可能被预定义主题覆盖） */
  private _restoreCustomColors(): void {
    const savedPrimary = load('primaryColor', '')
    if (savedPrimary) {
      this.themePrimary = savedPrimary
      this.themeBg = load('bgColor', '#313244')
      this.themeText = load('textColor', '#cdd6f4')
      this.themeBorder = load('borderColor', '#585b70')
    }
  }

  saveTableSettings(): void {
    // 写入 localStorage 供浮动面板读取（面板不支持直接从 config 读取）
    try { localStorage.setItem('sftp-plus-table.colBorders', JSON.stringify(this.showColBorders)) } catch {}
    try { localStorage.setItem('sftp-plus-table.zebra', JSON.stringify(this.showZebra)) } catch {}
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 切换隐藏原生 SFTP 按钮 */
  toggleHideNativeBtn(): void {
    this.hideNativeBtn = !this.hideNativeBtn
    try { localStorage.setItem('sftp-plus-settings.hideNativeBtn', JSON.stringify(this.hideNativeBtn)) } catch {}
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * 保存默认路径模式
   * ★ 2026-10-22 续三十八（Deepseek-V4.1-Flash）：这里**只**广播通用设置变更，不再派发专用事件。
   *   语义按用户拍板：面板上单独切换过的路径模式随该标签页连接保存（per-host 覆盖优先），
   *   「默认路径模式」只管**没有覆盖的新连接**；改默认值不应把老连接的局部设定抹掉。
   */
  saveDefaultPathMode(): void {
    if (this.defaultPathMode !== 'off' && this.defaultPathMode !== 'remember'
      && this.defaultPathMode !== 'sync' && this.defaultPathMode !== 'mirror') this.defaultPathMode = 'off'
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * ★ 2026-10-22 续三十六（Deepseek-V4.1-Flash）：切换「配置保存后立即生效」。
   *   关掉后本页仍会广播设置变更，但面板侧会忽略广播 ⇒ 需关闭并重开 SFTP+ 面板才看到效果。
   *   从关改回开时会广播一次，正好让所有面板把期间改过的配置一次性追平（无需重开）。
   */
  toggleApplySettingsInstantly(): void {
    this.applySettingsInstantly = !this.applySettingsInstantly
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 切换默认显示隐藏文件 */
  toggleDefaultShowHidden(): void {
    this.defaultShowHidden = !this.defaultShowHidden
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-08-22：切换「查看器不支持的文件改用系统默认程序打开」 */
  toggleOpenUnsupportedInSystem(): void {
    this.openUnsupportedInSystem = !this.openUnsupportedInSystem
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 规范化扩展名后保存；例如 `.conf` 与 `*.conf` 都存为 `conf`，展示用空格分隔。 */
  saveEditorOptions(): void {
    this.editableFileExtensionsText = formatTextExtensionsForInput(this.editableFileExtensionsText)
    this._saveToConfig()
    this.notifyPanels()
  }

  toggleAllowViewEditAllFiles(): void {
    this.allowViewEditAllFiles = !this.allowViewEditAllFiles
    this._saveToConfig()
    this.notifyPanels()
  }

  toggleShowTextLineNumbers(): void {
    this.showTextLineNumbers = !this.showTextLineNumbers
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-10-08：查看器/编辑器长行自动换行 */
  toggleShowTextWordWrap(): void {
    this.showTextWordWrap = !this.showTextWordWrap
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-10-22（Deepseek-V4.1-Flash）：外部编辑自动上传开关（方案 A） */
  toggleEditorAutoUploadExternal(): void {
    this.editorAutoUploadExternal = !this.editorAutoUploadExternal
    this._saveToConfig()
    this.notifyPanels()
  }

  onTextCaretShapeChange(shape: CaretShape): void {
    this.textCaretShape = normalizeCaretShape(shape)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 切换工具栏入口默认在新标签页打开 */
  toggleOpenInNewTabByDefault(): void {
    this.openInNewTabByDefault = !this.openInNewTabByDefault
    if (this.openInNewTabByDefault) {
      this.singleWorkspaceInstance = true
    }
    this._saveToConfig()
  }

  /** 切换新标签页模式是否复用已有实例 */
  toggleSingleWorkspaceInstance(): void {
    if (!this.openInNewTabByDefault) return
    this.singleWorkspaceInstance = !this.singleWorkspaceInstance
    this._saveToConfig()
  }

  /* ───────────────────────── 图标网格交互方法 ───────────────────────── */

  /** 内置/旧配置无规则名时的默认展示名 */
  private defaultIconRuleName(svg: string): string {
    const s = (svg || '').trim()
    // 系统默认两项：文件夹 → folder，兜底文件 → file
    if (s === FOLDER_ICON_SVG || s === 'folder.svg') return 'folder'
    if (s === 'default.svg') return 'file'
    return s.replace(/\.svg$/i, '') || s
  }

  /** 规则条目的有效规则名（分组 key） */
  private _ruleNameOf(r: FileTypeIconRule): string {
    const n = (r.name || '').trim()
    // 兼容旧配置：default.svg 曾默认名为 default，统一归并为 file
    if (r.svg === 'default.svg' && (!n || n === 'default')) return 'file'
    if ((r.svg === FOLDER_ICON_SVG || r.svg === 'folder.svg') && (!n || n === 'folder.svg')) return 'folder'
    return n || this.defaultIconRuleName(r.svg)
  }

  /** trackBy：用规则名 key，避免 getter 每次返回新对象导致 *ngFor 频繁重建 DOM */
  trackByIcon(_index: number, item: { key: string }): string {
    return item.key
  }

  get iconGridItems(): { key: string; name: string; svg: string; isBuiltin: boolean; exts: string[] }[] {
    const items: { key: string; name: string; svg: string; isBuiltin: boolean; exts: string[] }[] = []

    // 按规则名聚合所有自定义条目
    const byName = new Map<string, { svg: string; exts: string[] }>()
    for (const r of this.fileTypeIcons) {
      if (!r.svg || r.svg === FOLDER_ICON_SVG) continue
      const name = this._ruleNameOf(r)
      if (!byName.has(name)) byName.set(name, { svg: r.svg, exts: [] })
      const g = byName.get(name)!
      g.svg = r.svg || g.svg
      const e = (r.ext || '').trim().toLowerCase()
      if (e) g.exts.push(e)
    }

    // ① 内置图标单元格：始终展示；扩展名优先取「规则名 = 默认名」的覆盖
    const ordered = [...BUILTIN_ICON_FILES].filter(f => f !== FOLDER_ICON_SVG)
    const defaultIdx = ordered.indexOf('default.svg')
    if (defaultIdx > 0) {
      ordered.splice(defaultIdx, 1)
      ordered.unshift('default.svg')
    }
    const consumed = new Set<string>()
    for (const f of ordered) {
      const key = this.defaultIconRuleName(f)
      const group = byName.get(key)
      const exts = group
        ? [...new Set(group.exts)]
        : [...(BUILTIN_ICON_EXTS[f] || [])]
      items.push({
        key,
        name: key,
        svg: group?.svg || f,
        isBuiltin: true,
        exts,
      })
      consumed.add(key)
    }

    // ② 其余自定义规则：按规则名展示（可与内置共用同一 svg，但独立分类）
    for (const [name, g] of byName) {
      if (consumed.has(name)) continue
      if (!g.svg) continue
      items.push({
        key: name,
        name,
        svg: g.svg,
        isBuiltin: false,
        exts: [...new Set(g.exts)],
      })
    }
    return items
  }

  /** 某个内置图标是否被禁用 */
  isIconDisabled(svg: string): boolean {
    return this.disabledIconSvgs.includes(svg)
  }

  /** 切换图标禁用状态 */
  toggleIconDisable(svg: string): void {
    if (this.isLockedIcon(svg)) return  // default.svg 锁死，不可禁用（系统兜底回退）
    if (this.disabledIconSvgs.includes(svg)) {
      this.disabledIconSvgs = this.disabledIconSvgs.filter(s => s !== svg)
    } else {
      this.disabledIconSvgs = [...this.disabledIconSvgs, svg]
    }
    this._saveToConfig()
  }

  /** 某个 svg 是否为内置图标（文件名在内置列表中） */
  isBuiltinSvg(svg: string): boolean {
    return BUILTIN_ICON_FILES.includes(svg)
  }

  /** ★ 2026-08-25：default.svg 是系统级兜底图标（未匹配文件的统一回退），不可删除/禁用，但允许在编辑页修改其扩展名关联 */
  isLockedIcon(svg: string): boolean {
    return svg === 'default.svg'
  }

  /** 系统保留规则名：file / folder 不可改名 */
  isSystemRuleName(key: string | null | undefined): boolean {
    return key === 'file' || key === 'folder'
  }

  /** svg 文件是否真实存在于有效图标目录 */
  private svgExists(svgName: string): boolean {
    const dir = this.effectiveIconBaseDir
    if (!dir || !svgName) return false
    try { return fs.existsSync(path.join(dir, svgName)) } catch { return false }
  }

  /** 取某规则名当前生效的扩展名列表 */
  private _extsForRuleName(ruleName: string, fallbackSvg?: string): string[] {
    const key = (ruleName || '').trim()
    const fromRules = this.fileTypeIcons
      .filter(r => this._ruleNameOf(r) === key)
      .map(r => (r.ext || '').trim().toLowerCase())
      .filter(Boolean)
    if (fromRules.length) return [...new Set(fromRules)]
    const svg = fallbackSvg || ''
    if (svg && this.defaultIconRuleName(svg) === key) {
      return [...(BUILTIN_ICON_EXTS[svg] || [])]
    }
    return []
  }

  /** 取某规则当前绑定的 svg（无则回退 fallback） */
  private _svgForRuleName(ruleName: string, fallbackSvg = ''): string {
    const key = (ruleName || '').trim()
    const hit = this.fileTypeIcons.find(r => this._ruleNameOf(r) === key && r.svg)
    return hit?.svg || fallbackSvg
  }

  startEditIcon(item: { key: string; name: string; svg: string }): void {
    this._addingCustomRule = false
    this._editingFolderIcon = false
    this._iconRuleError = ''
    this._editingRuleKey = item.key
    this._editingRuleName = item.name
    this._editingIconSvgName = item.svg
    this._editingIconExts = this._extsForRuleName(item.key, item.svg).join(' ')
  }

  /** 取消编辑 */
  cancelEditIcon(): void {
    this._editingRuleKey = null
    this._editingRuleName = ''
    this._editingIconExts = ''
    this._editingIconSvgName = ''
    this._iconRuleError = ''
  }

  /**
   * 解析并规范化图标扩展名输入。
   * 支持空格/逗号/分号分隔；允许省略前导点（test → .test）；全角标点先归一化。
   * 合法形如 `.ext`：以字母或数字开头，后续仅字母/数字/._+-
   */
  private _parseIconExtensions(raw: string): { valid: string[]; invalid: string[] } {
    const normalized = String(raw || '')
      .replace(/[。．]/g, '.')
      .replace(/[，、]/g, ',')
      .replace(/[；;]/g, ';')
      .trim()
    const tokens = normalized.split(/[\s,;|]+/).map(t => t.trim()).filter(Boolean)
    const valid: string[] = []
    const invalid: string[] = []
    const seen = new Set<string>()
    for (const token of tokens) {
      const withDot = token.startsWith('.') ? token : `.${token}`
      const ext = withDot.toLowerCase()
      // 拒绝单独的 "."、含空格、以及非扩展名字符
      if (!/^\.[a-z0-9][a-z0-9._+-]*$/i.test(ext) || ext.length > 32) {
        invalid.push(token)
        continue
      }
      if (!seen.has(ext)) {
        seen.add(ext)
        valid.push(ext)
      }
    }
    return { valid, invalid }
  }

  /** 检测扩展名冲突：返回第一个冲突的 {ext, ownerSvg}，无冲突返回 null */
  private checkExtConflict(extList: string[], excludeRuleName?: string): { ext: string; ownerSvg: string } | null {
    const extMap = new Map<string, string>()
    // 内置默认映射
    for (const [ext, svg] of Object.entries(DEFAULT_ICON_MAP)) {
      const key = ext.toLowerCase()
      if (!extMap.has(key)) extMap.set(key, svg)
    }
    // 自定义规则（排除正在编辑/追加的那条规则名）
    for (const r of this.fileTypeIcons) {
      if (excludeRuleName && this._ruleNameOf(r) === excludeRuleName) continue
      const e = (r.ext || '').trim().toLowerCase()
      if (!e) continue
      extMap.set(e, r.svg)
    }
    // 若排除的是内置默认规则名，同时剔除该内置 svg 在 DEFAULT_ICON_MAP 中的占用
    if (excludeRuleName) {
      for (const [ext, svg] of Object.entries(DEFAULT_ICON_MAP)) {
        if (this.defaultIconRuleName(svg) === excludeRuleName) {
          const key = ext.toLowerCase()
          if (extMap.get(key) === svg) extMap.delete(key)
        }
      }
    }
    for (const ext of extList) {
      const key = (ext || '').trim().toLowerCase()
      const owner = extMap.get(key)
      if (owner) return { ext: key, ownerSvg: owner }
    }
    return null
  }

  /** 确认编辑：按规则名更新 name/svg/扩展名 */
  confirmEditIcon(): void {
    if (!this._editingRuleKey) return
    const oldKey = this._editingRuleKey
    // 系统规则名锁定：file / folder 不允许改名
    const newName = this.isSystemRuleName(oldKey)
      ? oldKey
      : (this._editingRuleName || '').trim()
    const newSvg = this._editingIconSvgName.trim()
    if (!newName) {
      this._iconRuleError = this.i18n.t('settings.iconErrorEmptyName')
      return
    }
    if (!this.svgExists(newSvg)) {
      this._iconRuleError = this.i18n.t('settings.iconErrorMissingSvg')
      return
    }
    // 规则名冲突：不允许与其它规则重名
    if (newName !== oldKey && this.iconGridItems.some(i => i.key === newName)) {
      this._iconRuleError = this.i18n.t('settings.iconErrorNameConflict')
        .replace('{name}', newName)
      return
    }
    const { valid: extList, invalid } = this._parseIconExtensions(this._editingIconExts)
    if (invalid.length) {
      this._iconRuleError = this.i18n.t('settings.iconErrorInvalidExt')
        .replace('{ext}', invalid.join(', '))
      return
    }
    // default.svg 允许空扩展名（兜底图标）；其它图标至少保留一个扩展名
    if (!extList.length && newSvg !== 'default.svg') {
      this._iconRuleError = this.i18n.t('settings.iconErrorEmpty')
      return
    }
    const conflict = this.checkExtConflict(extList, oldKey)
    if (conflict) {
      this._iconRuleError = this.i18n.t('settings.iconErrorExtConflict')
        .replace('{ext}', conflict.ext).replace('{svg}', conflict.ownerSvg)
      return
    }
    const others = this.fileTypeIcons.filter(r => this._ruleNameOf(r) !== oldKey)
    const newRules: FileTypeIconRule[] = extList.map(ext => ({ ext, svg: newSvg, name: newName }))
    this.fileTypeIcons = [...others, ...newRules]
    this._editingRuleKey = null
    this._editingRuleName = ''
    this._editingIconExts = ''
    this._editingIconSvgName = ''
    this._iconRuleError = ''
    this._saveToConfig()
  }

  /** 切换新增自定义规则表单的显示（"+"单元格用，与下方独立行表单配合） */
  toggleAddCustomRule(): void {
    if (this._addingCustomRule) {
      this.cancelAddCustomRule()
    } else {
      this._editingRuleKey = null
      this._editingFolderIcon = false
      this._iconRuleError = ''
      this._addingCustomRule = true
      this._newRuleName = ''
      this._newRuleExt = ''
      this._newRuleSvg = ''
    }
  }
  /** 显示新增自定义规则表单（保留旧入口兼容） */
  showAddCustomRule(): void {
    this._iconRuleError = ''
    this._addingCustomRule = true
    this._newRuleName = ''
    this._newRuleExt = ''
    this._newRuleSvg = ''
  }

  /** 取消新增 */
  cancelAddCustomRule(): void {
    this._addingCustomRule = false
    this._newRuleName = ''
    this._newRuleExt = ''
    this._newRuleSvg = ''
    this._iconRuleError = ''
  }

  /** 确认新增自定义规则：以规则名为 key；同名则追加合并，不同名则新建分类 */
  confirmAddCustomRule(): void {
    const name = (this._newRuleName || '').trim()
    const svg = (this._newRuleSvg || '').trim()
    if (!name || !svg || !(this._newRuleExt || '').trim()) {
      this._iconRuleError = this.i18n.t('settings.iconErrorEmpty')
      return
    }
    if (!this.svgExists(svg)) {
      this._iconRuleError = this.i18n.t('settings.iconErrorMissingSvg')
      return
    }
    const { valid: extList, invalid } = this._parseIconExtensions(this._newRuleExt)
    if (invalid.length) {
      this._iconRuleError = this.i18n.t('settings.iconErrorInvalidExt')
        .replace('{ext}', invalid.join(', '))
      return
    }
    if (!extList.length) {
      this._iconRuleError = this.i18n.t('settings.iconErrorEmpty')
      return
    }
    const conflict = this.checkExtConflict(extList, name)
    if (conflict) {
      this._iconRuleError = this.i18n.t('settings.iconErrorExtConflict')
        .replace('{ext}', conflict.ext).replace('{svg}', conflict.ownerSvg)
      return
    }

    const existingSvg = this._svgForRuleName(name, svg)
    // 同名规则若已绑定其它 svg，禁止悄悄改图标，避免分类混乱
    if (existingSvg && existingSvg !== svg && this.fileTypeIcons.some(r => this._ruleNameOf(r) === name)) {
      this._iconRuleError = this.i18n.t('settings.iconErrorNameSvgMismatch')
        .replace('{name}', name).replace('{svg}', existingSvg)
      return
    }

    const isBuiltinDefault = this.isBuiltinSvg(svg) && this.defaultIconRuleName(svg) === name
    const builtin = isBuiltinDefault ? [...(BUILTIN_ICON_EXTS[svg] || [])] : []
    const existing = this._extsForRuleName(name, svg)
    const merged = [...new Set([
      ...builtin.map(e => e.toLowerCase()),
      ...existing.map(e => e.toLowerCase()),
      ...extList,
    ])]
    const others = this.fileTypeIcons.filter(r => this._ruleNameOf(r) !== name)
    this.fileTypeIcons = [
      ...others,
      ...merged.map(ext => ({ ext, svg, name } as FileTypeIconRule)),
    ]
    this._addingCustomRule = false
    this._newRuleName = ''
    this._newRuleExt = ''
    this._newRuleSvg = ''
    this._iconRuleError = ''
    this._saveToConfig()
  }

  /** 删除单元格：内置图标=禁用/恢复；自定义规则=按规则名移除全部条目（需确认） */
  deleteIcon(item: { key: string; svg: string; isBuiltin: boolean }): void {
    if (this.isLockedIcon(item.svg)) return  // default.svg 锁死，不可删/禁用
    if (item.isBuiltin) {
      this.toggleIconDisable(item.svg)
    } else {
      const ok = confirm(this.i18n.t('settings.iconDeleteConfirm', { name: item.key }))
      if (!ok) return
      this.fileTypeIcons = this.fileTypeIcons.filter(r => this._ruleNameOf(r) !== item.key)
      this._saveToConfig()
    }
    // 修复：若正在编辑的正是被删除/禁用的图标，关闭编辑表单，避免删完还残留编辑态
    if (this._editingRuleKey === item.key) {
      this._editingRuleKey = null
      this._editingRuleName = ''
      this._editingIconSvgName = ''
      this._editingIconExts = ''
      this._iconRuleError = ''
    }
  }

  /** 进入文件夹图标编辑态 */
  startEditFolderIcon(): void {
    this._addingCustomRule = false
    this._editingRuleKey = null
    this._folderIconError = ''
    this._editingFolderIcon = true
    this._folderIconDraft = this.folderIconSvg || ''
  }
  /** 确认文件夹图标（校验文件存在） */
  confirmEditFolderIcon(): void {
    const svg = (this._folderIconDraft || '').trim()
    if (!svg) {
      this._folderIconError = this.i18n.t('settings.iconErrorEmpty')
      return
    }
    if (!this.svgExists(svg)) {
      this._folderIconError = this.i18n.t('settings.iconErrorMissingSvg')
      return
    }
    this.folderIconSvg = svg
    this._editingFolderIcon = false
    this._folderIconDraft = ''
    this._folderIconError = ''
    this._saveToConfig()
  }
  /** 取消文件夹图标编辑 */
  cancelEditFolderIcon(): void {
    this._editingFolderIcon = false
    this._folderIconDraft = ''
    this._folderIconError = ''
  }
  /** 恢复默认文件夹图标（'folder.svg'） */
  restoreFolderIcon(): void {
    this.folderIconSvg = FOLDER_ICON_SVG
    this._editingFolderIcon = false
    this._folderIconError = ''
    this._saveToConfig()
  }

  /** ★ 2026-09-17：一键恢复对象图标默认配置（目录/规则/禁用/文件夹图标） */
  resetIconSettings(): void {
    this.iconResourceDir = ''
    this.fileTypeIcons = []
    this.disabledIconSvgs = []
    this.folderIconSvg = FOLDER_ICON_SVG
    this._editingRuleKey = null
    this._editingRuleName = ''
    this._editingIconExts = ''
    this._editingIconSvgName = ''
    this._editingFolderIcon = false
    this._folderIconDraft = ''
    this._folderIconError = ''
    this._addingCustomRule = false
    this._newRuleName = ''
    this._newRuleExt = ''
    this._newRuleSvg = ''
    this._iconRuleError = ''
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 启动时自动清理：仅当图标目录可读且包含 svg 时执行（避免临时不可用的自定义目录导致误删） */
  private _autoCleanInvalidRules(): void {
    const dir = this.effectiveIconBaseDir
    if (!dir) return
    // ★ 2026-10-09：原先写成 `Array.isArray(fs.readdirSync(dir)) && fs.readdirSync(dir).some(...)`
    //   —— **同步读了两遍目录**（图标目录动辄数百个文件），而这函数在每次打开设置页时都会跑。
    //   改为读一次存局部变量复用；语义完全等价（readdirSync 抛错仍由 catch 兜住 return）。
    let files: string[]
    try {
      const listing = fs.readdirSync(dir)
      if (!Array.isArray(listing)) return
      files = listing
    } catch { return }
    if (!files.some((f: string) => f.toLowerCase().endsWith('.svg'))) return
    const before = this.fileTypeIcons.length
    this.fileTypeIcons = this.fileTypeIcons.filter(r => r && r.svg && r.ext && this.svgExists(r.svg))
    if (this.fileTypeIcons.length !== before) this._saveToConfig()
  }
  /** 新增一条自定义图标规则（保留兼容旧入口） */
  addIconRule(): void {
    this.showAddCustomRule()
  }
  /** 删除第 i 条自定义图标规则（保留兼容旧入口） */
  removeIconRule(i: number): void {
    this.fileTypeIcons = this.fileTypeIcons.filter((_, idx) => idx !== i)
    this._saveToConfig()
  }
  /** 拼出规则内 svg 的完整 file:// 路径（供预览显示） */
  /** 插件内置图标目录：开发链接 / 手动安装 / 源码三种布局由 resolveSftpPlusBundledIconDir 统一解析 */
  private get _bundledIconDir(): string {
    return resolveSftpPlusBundledIconDir(this.bootstrapData)
  }

  /** 有效图标目录：用户指定优先；留空则回退插件内置目录 */
  private get effectiveIconBaseDir(): string {
    const u = (this.iconResourceDir || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
    return u ? u : this._bundledIconDir
  }

  iconPreviewPath(svg: string): string {
    const dir = this.effectiveIconBaseDir
    const file = (svg || '').trim().replace(/^\/+/, '')
    if (!dir || !file) return ''
    return dir + '/' + file
  }

  /** 内置图标预览：始终以内置目录为基，不受用户自定义目录影响 */
  bundledIconPreviewPath(svg: string): string {
    const dir = this._bundledIconDir
    const file = (svg || '').trim().replace(/^\/+/, '')
    if (!dir || !file) return ''
    return dir + '/' + file
  }

  /** 内置图标文件名列表（供预览网格渲染） */
  get builtinIconFiles(): string[] { return BUILTIN_ICON_FILES }

  /** 内置图标 → 关联扩展名列表（供预览展示） */
  get builtinIconExts(): Record<string, string[]> { return BUILTIN_ICON_EXTS }

  /** SVG 资源目录输入框的占位符：默认指向插件内置图标目录 */
  get bundledIconDirPlaceholder(): string {
    return this._bundledIconDir
      ? this._bundledIconDir
      : this.i18n.t('settings.iconResourceDirPh')
  }

  /** ★ 2026-08-24：图标目录输入框显示值。默认（未配置）时直接显示内置图标目录实际路径，
   *  而非占位符；输入等于内置目录或为空都视为「使用默认」，存为空字符串。 */
  get iconDirDisplay(): string {
    const v = (this.iconResourceDir || '').trim()
    if (v) return v
    return this._bundledIconDir || ''
  }
  set iconDirDisplay(v: string) {
    const s = (v || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
    const bundled = (this._bundledIconDir || '').replace(/\\/g, '/').replace(/\/+$/, '')
    // 输入等于内置目录或为空 → 视为默认（存为空字符串）
    this.iconResourceDir = (!s || s === bundled) ? '' : s
  }

  /** 切换「选中书签后关闭面板」 */
  toggleCloseBookmarkPanelOnSelect(): void {
    this.closeBookmarkPanelOnSelect = !this.closeBookmarkPanelOnSelect
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-10-16：切换「键入定位」（文件列表里敲字母/数字按文件名前缀跳转选中） */
  toggleTypeAheadEnabled(): void {
    this.typeAheadEnabled = !this.typeAheadEnabled
    this._saveToConfig()
    this.notifyPanels()
  }

  toggleBookmarkPanelGroupByScope(): void {
    this.bookmarkPanelGroupByScope = !this.bookmarkPanelGroupByScope
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：「联动书签」开关（设置页「定制书签面板」） */
  toggleBookmarkLinkEnabled(): void {
    this.bookmarkLinkEnabled = !this.bookmarkLinkEnabled
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：设置「书签排序」两档（manual=拖拽顺序 / usage=使用频率降序）。
   * ★ 2026-10-22（Deepseek-V4.1-Flash）：扩成三档，新增 name（名称升序，数字按自然序）。
   *   与弹层 footer 的图标按钮写同一个配置项 bookmarkSortMode。
   */
  setBookmarkSort(mode: BookmarkSortMode): void {
    if (this.bookmarkSortMode === mode) return
    this.bookmarkSortMode = mode
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：重置书签使用次数统计（仅「频率排序」下显示入口）。
   *   设置页没有注入书签服务，这里临时 new 一个同源实例——构造函数会先从同一份存储加载，
   *   清零后 save() 写回，再 notifyPanels() 广播让已打开的面板 bookmarks.reload()。
   */
  resetBookmarkUsage(): void {
    try {
      const svc = new SftpBookmarksService(this.configService as any)
      const n = svc.resetUsage()
      this.bookmarkResetMsg = n > 0 ? this.i18n.t('settings.bookmarkResetUsageDone', { count: n }) : ''
      this.notifyPanels()
    } catch (e) {
      log.warn('[SFTP+] reset bookmark usage failed:', e)
      return
    }
    if (this._bookmarkResetMsgTimer) clearTimeout(this._bookmarkResetMsgTimer)
    this._bookmarkResetMsgTimer = setTimeout(() => {
      this._bookmarkResetMsgTimer = null
      this.bookmarkResetMsg = ''
    }, 2600)
  }

  bookmarkGroupLabel(g: 'connection' | 'global'): string {
    return g === 'connection'
      ? this.i18n.t('bookmark.forConnection')
      : this.i18n.t('bookmark.global')
  }

  onBookmarkGroupDragStart(g: 'connection' | 'global', event: DragEvent): void {
    this.draggingBookmarkGroup = g
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', g)
    }
  }

  onBookmarkGroupDragOver(_g: 'connection' | 'global', event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onBookmarkGroupDrop(target: 'connection' | 'global', event: DragEvent): void {
    event.preventDefault()
    const source = this.draggingBookmarkGroup
    this.draggingBookmarkGroup = null
    if (!source || source === target) return
    const next = this.bookmarkPanelGroupOrder.filter(x => x !== source)
    const ti = next.indexOf(target)
    if (ti < 0) next.push(source)
    else next.splice(ti, 0, source)
    if (!next.includes('connection')) next.push('connection')
    if (!next.includes('global')) next.push('global')
    this.bookmarkPanelGroupOrder = next.slice(0, 2) as Array<'connection' | 'global'>
    this._saveToConfig()
    this.notifyPanels()
  }

  onBookmarkGroupDragEnd(): void {
    this.draggingBookmarkGroup = null
  }

  resetBookmarkPanel(): void {
    this.bookmarkPanelGroupByScope = true
    this.bookmarkPanelGroupOrder = ['connection', 'global']
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 保存自定义时间格式（input change/blur 触发，避免逐键通知面板）；清空时自动回落默认格式 */
  saveDateFormat(): void {
    this.dateFormat = (this.dateFormat || '').trim() || DEFAULT_DATE_FORMAT
    setDateFormatPattern(this.dateFormat)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 并发数范围约束（1-10，非法值回落默认 3） */
  private _clampConcurrency(v: unknown): number {
    const n = Number(v)
    if (!Number.isFinite(n)) return 3
    return Math.min(10, Math.max(1, Math.round(n)))
  }

  /** 保存上传/下载并发数（input change 触发） */
  saveConcurrency(): void {
    this.uploadConcurrency = this._clampConcurrency(this.uploadConcurrency)
    this.downloadConcurrency = this._clampConcurrency(this.downloadConcurrency)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-09-28：保存传输通道模式（下拉选择即生效） */
  saveChannelMode(): void {
    if (!['smart', 'sftpOnly', 'tarOnly', 'preferSftp', 'preferTar'].includes(this.transferChannelMode)) {
      this.transferChannelMode = 'smart'
    }
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * ★ 2026-10-23：保存「冲突重命名风格」（设置页「传输」分区下拉）。
   *   归一化后再写：旧备份 / 手工改坏的 config.yaml 里可能有未知值，写进配置会让面板侧
   *   `normalizeConflictRenameStyle` 之外的地方（例如未来新增的读取方）拿到脏值。
   */
  saveConflictRenameStyle(): void {
    this.conflictRenameStyle = normalizeConflictRenameStyle(this.conflictRenameStyle)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-09-07 issue #15：切换冲突内容摘要（关闭后退化为仅按 size+mtime 判定，行为同旧版） */
  toggleConflictDigest(): void {
    this.conflictDigestEnabled = !this.conflictDigestEnabled
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 切换「内容确认相同时自动跳过」（关闭则仅展示摘要，仍会弹框） */
  toggleConflictAutoSkip(): void {
    this.conflictAutoSkipSameContent = !this.conflictAutoSkipSameContent
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * 切换「拖拽只投放到当前目录」（设置页「传输设置」分区）。
   * 功能描述：开（默认）—— 跨栏拖拽 / 从系统资源管理器拖入时，落点恒为该栏**当前打开的目录**，
   *          指针压在哪一行都不改变投递目标，避免手滑停在文件夹行上、文件被静默吞进子目录。
   *          关 —— 恢复旧行为：压在文件夹行上就进那个文件夹（拖拽期间该行会高亮并标注去向）。
   *          同栏内拖到子文件夹不受影响（那是文件管理器的通用手势，不是「传输」）。
   * 说明：只改内存值 + 落盘 + 广播，面板侧 `_readBehaviorConfig` 收到广播后重读，
   *      因此不需要重启面板即可生效（「配置保存后立即生效」关闭时除外，见面板的 _settingsApplyLive）。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  toggleDropToCurrentDir(): void {
    this.dropToCurrentDir = !this.dropToCurrentDir
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：开关「接收 QuickCmd+ 的刷新请求」。
   * 说明：与 toggleDropToCurrentDir 同款 —— 只改内存值 + 落盘 + 广播，面板在
   *      `_readBehaviorConfig` 里重读，所以不需要重开面板
   *      （除非用户把「配置保存后立即生效」关了，那是全局约定，不在这里单开例外）。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  toggleRefreshOnQuickCmd(): void {
    this.refreshOnQuickCmd = !this.refreshOnQuickCmd
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 观察期时长（秒）改动后落盘：先夹到 1–120，避免手输 0 / 9999 直接进配置 */
  saveRefreshOnQuickCmdWindow(): void {
    this.refreshOnQuickCmdWindow = normalizeRefreshWindowSec(this.refreshOnQuickCmdWindow)
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * ★ 2026-10-27（Deepseek-V4.1-Flash）：开关「定时刷新列表」。
   * 与 toggleRefreshOnQuickCmd 同款（改内存值 + 落盘 + 广播，面板在 `_readBehaviorConfig`
   * 里重排定时器，不需要重开面板）。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  toggleAutoRefresh(): void {
    this.autoRefreshEnabled = !this.autoRefreshEnabled
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 定时刷新间隔改动后落盘：先夹到 5–3600 秒（下界防「1 秒一次」把远端 readdir 打满） */
  saveAutoRefreshInterval(): void {
    this.autoRefreshInterval = normalizeAutoRefreshIntervalSec(this.autoRefreshInterval)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 列表刷新闪烁开关（默认开；关闭后切换文件夹 / 手动刷新不再淡蓝背景闪烁） */
  toggleListRefreshFlash(): void {
    this.listRefreshFlash = !this.listRefreshFlash
    this._saveToConfig()
    this.notifyPanels()
  }

  /**
   * QuickCmd+ 的安装状态：enabled / disabled / missing / unknown
   * 数据来源：宿主 BootstrapData.installedPlugins（宿主启动时给的清单，插件页也是读它）
   *   + config.store.pluginBlacklist（宿主自带的停用清单）；本窗口真收到过联动请求则直接算 enabled。
   * ⛔ unknown 时一律不提示 —— 清单读不到可能是宿主版本差异，不能把「装了但读不到」说成「没装」。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  get quickCmdPresence(): QuickCmdPresence {
    try {
      return detectQuickCmdPresence(
        (this.bootstrapData as any)?.installedPlugins,
        (this.configService as any)?.store?.pluginBlacklist,
      )
    } catch {
      return 'unknown'
    }
  }

  /** 开关打开、且确实判定为「没装 / 被停用」时才显示就地提示（装了就不啰嗦） */
  get showQuickCmdPluginHint(): boolean {
    if (!this.refreshOnQuickCmd) return false
    const s = this.quickCmdPresence
    return s === 'missing' || s === 'disabled'
  }

  /** 提示文案 key：没装 vs 装了但被停用，两种情况给的话不一样 */
  get quickCmdPluginHintKey(): string {
    return this.quickCmdPresence === 'disabled'
      ? 'settings.refreshOnQuickCmdDisabled'
      : 'settings.refreshOnQuickCmdMissing'
  }

  /** 提示里的「打开插件页」：跳到宿主设置页的插件分组 */
  openPluginsSettings(): void {
    if (!this.appService) return
    openTabbyPluginsSettings(this.appService)
  }

  /**
   * 摘要大小上限取值约束：[1, 4096] MB，非法值回落 256。
   * ★ 2026-09-21 P2 修复：原先只判 > 0，没有上界——输入框的 max="4096" 只是 UI 提示，
   * 手动输入/粘贴/导入配置都能写进极大值，随后每次冲突检测都会对巨型文件求 hash。
   */
  private _clampDigestMaxMB(v: unknown): number {
    const mb = Number(v)
    if (!Number.isFinite(mb) || mb <= 0) return 256
    return Math.min(4096, Math.max(1, Math.floor(mb)))
  }

  /** 保存摘要计算的文件大小上限（MB） */
  saveConflictDigestMaxSize(): void {
    this.conflictDigestMaxSizeMB = this._clampDigestMaxMB(this.conflictDigestMaxSizeMB)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-08-11：切换隐藏作者信息：关闭直接生效；开启需确认（先打开仓库链接，
   *   用户点「我已点 Star 支持」后才隐藏） */
  toggleHideAuthorInfo(): void {
    if (this.hideAuthorInfo) {
      this.hideAuthorInfo = false
      this._saveToConfig()
      return
    }
    this.openGithub()
    this.showHideAuthorConfirm = true
  }

  confirmHideAuthor(): void {
    this.showHideAuthorConfirm = false
    this.hideAuthorInfo = true
    this._saveToConfig()
  }

  cancelHideAuthor(): void { this.showHideAuthorConfirm = false }

  /** 清空按钮：恢复为默认时间格式并立即保存生效 */
  resetDateFormat(): void {
    this.dateFormat = DEFAULT_DATE_FORMAT
    setDateFormatPattern(this.dateFormat)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 确认：将自动/预设配色复制到自定义并应用修改 */
  confirmThemeColorOverwrite(): void {
    // 加载原始主题的预设色值
    const orig = this._pendingOrigTheme
    let p: typeof this.colorThemes[0] | undefined
    if (!orig) {
      // Auto 模式：使用检测到的明/暗预设
      const themeName = this.detectedAutoTheme === 'light' ? 'light' : 'dark'
      p = this.getPreset(themeName)
    } else {
      p = this.getPreset(orig)
    }
    if (p) {
      this.themePrimary = p.primary
      this.themeBg = p.bg
      this.themeText = p.text
      this.themeBorder = p.border
    }
    this.theme = 'custom'
    // 应用待修改的颜色值
    const updates: Record<string, string> = { primary: this.themePrimary, bg: this.themeBg, text: this.themeText, border: this.themeBorder }
    updates[this._pendingColorKey] = this._pendingColorVal
    this.themePrimary = updates.primary
    this.themeBg = updates.bg
    this.themeText = updates.text
    this.themeBorder = updates.border
    this.saveAllColors()
    this.applyColors(document.documentElement)
    this.notifyPanels()
    this.showThemeColorConfirm = false
  }

  /** 取消：关闭弹窗，不应用修改 */
  cancelThemeColorOverwrite(): void {
    this.showThemeColorConfirm = false
    this._pendingColorKey = ''
    this._pendingColorVal = ''
    // 恢复颜色输入框显示（强制刷新 ngModel 绑定）
    this._refreshColorInputs()
  }

  /** 刷新颜色输入框，确保取消后恢复到原值 */
  private _refreshColorInputs(): void {
    // 从当前主题预设或缓存重新加载颜色值
    if (!this.theme || this.theme === 'custom') {
      // custom 模式下从 localStorage 加载
      this.themePrimary = load('primaryColor', this.themePrimary)
      this.themeBg = load('bgColor', this.themeBg)
      this.themeText = load('textColor', this.themeText)
      this.themeBorder = load('borderColor', this.themeBorder)
    } else {
      // 预设模式从预设值重新加载
      const p = this.getPreset(this.theme)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeBorder = p.border
      }
    }
  }

  setLayoutMode(mode: string): void {
    this.layoutMode = mode
    this.saveLayoutMode()
  }

  saveLayoutMode(): void {
    try { localStorage.setItem('sftp-plus-layout-mode', this.layoutMode) } catch {}
    this._saveToConfig()
    this.notifyPanels()
  }

  private _clampFontSize(val: number): number {
    const n = Math.round(Number(val) || 13)
    return Math.max(11, Math.min(18, n))
  }

  /**
   * ★ 2026-10-19 P2-33（audit）：字号滑块落盘节流定时器（尾随写）。
   *   滑块绑的是 (input)，拖动一次会连发几十个事件；每个事件一次 _saveToConfig()
   *   = 45+ 字段整段重写 config.yaml（Electron 同步写文件），拖到底就是几十次全量落盘。
   *   现改为 300ms 尾随：内存值立即更新（UI 零延迟），停手后才落盘并通知面板一次。
   */
  private _fontSizeSaveTimer: ReturnType<typeof setTimeout> | null = null

  onFontSizeChange(val: number): void {
    this.fontSize = this._clampFontSize(val)
    if (this._fontSizeSaveTimer) clearTimeout(this._fontSizeSaveTimer)
    this._fontSizeSaveTimer = setTimeout(() => {
      this._fontSizeSaveTimer = null
      void this._saveToConfig().then(() => this.notifyPanels())
    }, 300)
  }

  /** 冲刷挂起的字号落盘（重置字号、组件销毁前调用，保证最后一次改动一定写盘） */
  private _flushFontSizeSave(): void {
    if (!this._fontSizeSaveTimer) return
    clearTimeout(this._fontSizeSaveTimer)
    this._fontSizeSaveTimer = null
    void this._saveToConfig().then(() => this.notifyPanels())
  }

  resetFontSize(): void {
    this.fontSize = 13
    // 先冲刷再即时落盘：否则拖完立刻点重置，节流里挂着的旧值会在 300ms 后把 13 覆盖回去
    if (this._fontSizeSaveTimer) {
      clearTimeout(this._fontSizeSaveTimer)
      this._fontSizeSaveTimer = null
    }
    void this._saveToConfig().then(() => this.notifyPanels())
  }

  paneCustomItemLabel(item: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'): string {
    if (item === 'label') return this.i18n.t('settings.paneLabel')
    if (item === 'path') return this.i18n.t('settings.addressBar')
    if (item === 'hidden') return this.i18n.t('pane.showHidden')
    return this.i18n.t(`settings.toolbarItem.${item}`)
  }

  /** 某项工具栏项是否被隐藏（设置页取消勾选） */
  isPaneItemHidden(item: string): boolean {
    return this.paneHiddenItems.includes(item)
  }

  /** 切换某项工具栏项的显示/隐藏，并持久化 */
  togglePaneItemHidden(item: string): void {
    if (this.paneHiddenItems.includes(item)) {
      this.paneHiddenItems = this.paneHiddenItems.filter(i => i !== item)
    } else {
      this.paneHiddenItems = [...this.paneHiddenItems, item]
    }
    this._saveToConfig()
    this.notifyPanels()
  }

  onCustomDragStart(item: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden', event: DragEvent): void {
    this.draggingCustomItem = item
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', item)
    }
  }

  onCustomDragOver(_target: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden', event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onCustomDrop(target: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden', event: DragEvent): void {
    event.preventDefault()
    const source = this.draggingCustomItem || (event.dataTransfer?.getData('text/plain') as any)
    if (!source || source === target) return
    const next = this.paneCustomOrder.filter(i => i !== source)
    const targetIndex = next.indexOf(target)
    if (targetIndex < 0) return
    let insertIndex = targetIndex
    const targetEl = event.currentTarget as HTMLElement | null
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect()
      const placeAfter = event.clientX > (rect.left + rect.width / 2)
      if (placeAfter) insertIndex = targetIndex + 1
    }
    next.splice(insertIndex, 0, source)
    this.paneCustomOrder = next as any
    this._saveToConfig()
    this.notifyPanels()
  }

  onCustomDragEnd(): void { this.draggingCustomItem = null }

  resetPaneLayout(): void {
    this.paneCustomOrder = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
    this.paneHiddenItems = []
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-08-22：保存交互类设置（单击/双击打开 + 右键菜单顺序共用） */
  private async saveInteraction(): Promise<void> {
    await this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-09-28：右键菜单项 id → 显示标签（文件动作复用注册表 i18n key；分组依据用专有 key） */
  contextMenuItemLabel(a: ContextMenuCustomId): string {
    if (a === 'groupBy') return this.i18n.t('pane.groupBy')
    const def = FILE_MENU_REGISTRY[a]
    return def ? this.i18n.t(def.labelKey) : (a as string)
  }

  /** ★ 2026-09-28：右键菜单项是否启用（复选框） */
  isMenuEnabled(a: ContextMenuCustomId): boolean {
    return !this.contextMenuDisabled.includes(a)
  }

  /** ★ 2026-09-28：切换右键菜单项启用/停用（复选框） */
  toggleMenuEnabled(a: ContextMenuCustomId): void {
    if (this.contextMenuDisabled.includes(a)) {
      this.contextMenuDisabled = this.contextMenuDisabled.filter(x => x !== a)
    } else {
      this.contextMenuDisabled = [...this.contextMenuDisabled, a]
    }
    void this.saveInteraction()
  }

  onMenuDragStart(a: ContextMenuCustomId, event: DragEvent): void {
    this.draggingMenuItem = a
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', a)
    }
  }

  onMenuDragOver(_target: ContextMenuCustomId, event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onMenuDrop(target: ContextMenuCustomId, event: DragEvent): void {
    event.preventDefault()
    const source = this.draggingMenuItem || (event.dataTransfer?.getData('text/plain') as ContextMenuCustomId)
    if (!source || source === target) return
    const next = this.contextMenuOrder.filter(i => i !== source)
    const targetIndex = next.indexOf(target)
    if (targetIndex < 0) return
    let insertIndex = targetIndex
    const targetEl = event.currentTarget as HTMLElement | null
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect()
      const placeAfter = event.clientX > (rect.left + rect.width / 2)
      if (placeAfter) insertIndex = targetIndex + 1
    }
    next.splice(insertIndex, 0, source)
    this.contextMenuOrder = next
    void this.saveInteraction()
  }

  onMenuDragEnd(): void { this.draggingMenuItem = null }

  resetMenuOrder(): void {
    this.contextMenuOrder = [...DEFAULT_FILE_MENU_ORDER, 'groupBy']
    this.contextMenuDisabled = []
    void this.saveInteraction()
  }

  // ========== 顶栏按钮定制（2026-10-19，Deepseek-V4.1-Flash） ==========

  /** 顶栏按钮展示名（登记表给出 labelKey，避免与本文件其它文案漂移） */
  topBarItemLabel(a: TopBarItemId): string {
    const def = TOP_BAR_ITEMS.find(i => i.id === a)
    return def ? this.i18n.t(def.labelKey) : a
  }

  /** 该项是否固定在顶栏（否则收进 ⋯ 菜单） */
  isTopBarPinned(a: TopBarItemId): boolean {
    return this.topBarPinned.includes(a)
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：关闭按钮（✕）是否「锁住」—— 未给面板配开关快捷键时
   *   不允许停用 / 收进 ⋯。理由：✕ 是面板唯一稳定出口（Esc 只有焦点在面板内才生效），
   *   面板侧 `topBarInlineItems` 对同一条件做兜底（即使配置里被停用也强制显示）。
   *   ⛔ 两边判据必须一致（都读 hotkeys[SFTP_PLUS_TOGGLE_HOTKEY]），否则会出现「设置页能勾掉、面板还显示」。
   */
  isTopBarCloseLocked(a: TopBarItemId): boolean {
    return a === 'close' && !this.panelToggleHotkeyBound
  }

  /** 是否给「SFTP+ 面板」绑了开关快捷键（Tabby 设置 → 快捷键） */
  get panelToggleHotkeyBound(): boolean {
    try {
      const hk = (this.configService?.store as any)?.hotkeys?.[SFTP_PLUS_TOGGLE_HOTKEY]
      if (Array.isArray(hk)) return hk.length > 0
      return typeof hk === 'string' ? hk.trim().length > 0 : false
    } catch { return false }
  }

  /** 该项是否启用（未勾选 → 顶栏与 ⋯ 菜单都不显示） */
  isTopBarEnabled(a: TopBarItemId): boolean {
    return !this.topBarDisabled.includes(a)
  }

  toggleTopBarEnabled(a: TopBarItemId): void {
    // ★ 2026-10-27：⋯ 的"启用"就是顶层「启用折叠菜单」开关，本行复选框已 disabled，
    //   这里再兜一层 —— 否则程序化触发会把一个不存在的 topBarDisabled 项写进配置。
    if (a === 'overflow') return
    this.topBarDisabled = this.isTopBarEnabled(a)
      ? [...this.topBarDisabled, a]
      : this.topBarDisabled.filter(x => x !== a)
    void this.saveInteraction()
  }

  toggleTopBarPinned(a: TopBarItemId): void {
    // ★ 2026-10-27：⋯ 恒在顶栏，没有「固定在顶栏 / 收进 ⋯」两态（本行图钉也不渲染），兜一层防御
    if (a === 'overflow') return
    this.topBarPinned = this.isTopBarPinned(a)
      ? this.topBarPinned.filter(x => x !== a)
      : [...this.topBarPinned, a]
    void this.saveInteraction()
  }

  toggleTopBarOverflow(): void {
    this.topBarOverflowEnabled = !this.topBarOverflowEnabled
    void this.saveInteraction()
  }

  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：连接切换器唤起方式（三选一，立即落盘并广播） */
  setConnPickerTrigger(v: 'topbar' | 'paneToolbar' | 'both'): void {
    if (this.connPickerTrigger === v) return
    this.connPickerTrigger = v
    void this.saveInteraction()
  }

  /**
   * ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash，用户诉求）：顶栏连接显示内容（两选一，立即落盘并广播）。
   *   面板在 `_settingsChangedHandler` 里重读配置，所以这里保存后顶栏立刻换文案，无需重开面板。
   */
  setConnLabelStyle(v: 'account' | 'alias'): void {
    if (this.connLabelStyle === v) return
    this.connLabelStyle = v
    void this.saveInteraction()
  }

  /** 面板透明度滑块的显示值（0.5–1 → 50–100） */
  get panelOpacityPercent(): number {
    return Math.round(this.panelOpacity * 100)
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：滑块拖动 → 钳制到 0.5–1 并**合并落盘**。
   *   与字号滑块同一套路：内存值立即更新（UI 零延迟），300ms 尾随才写 config 并广播，
   *   避免拖到底时几十次全量 config.yaml 写入 + 面板重算。
   */
  private _panelOpacityTimer: ReturnType<typeof setTimeout> | null = null

  onPanelOpacityChange(v: number | string): void {
    const n = Number(v)
    this.panelOpacity = Math.min(1, Math.max(0.5, Number.isFinite(n) ? n / 100 : 1))
    if (this._panelOpacityTimer) clearTimeout(this._panelOpacityTimer)
    this._panelOpacityTimer = setTimeout(() => {
      this._panelOpacityTimer = null
      void this._saveToConfig().then(() => this.notifyPanels())
    }, 300)
  }

  /** 冲刷挂起的透明度落盘（组件销毁前调用，保证最后一次改动不丢） */
  private _flushPanelOpacitySave(): void {
    if (!this._panelOpacityTimer) return
    clearTimeout(this._panelOpacityTimer)
    this._panelOpacityTimer = null
    void this._saveToConfig().then(() => this.notifyPanels())
  }

  onTopBarDragStart(a: TopBarItemId, event: DragEvent): void {
    this.draggingTopBarItem = a
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', a)
    }
  }

  onTopBarDragOver(_target: TopBarItemId, event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onTopBarDrop(target: TopBarItemId, event: DragEvent): void {
    event.preventDefault()
    const source = this.draggingTopBarItem || (event.dataTransfer?.getData('text/plain') as TopBarItemId)
    if (!source || source === target) return
    const next = this.topBarOrder.filter(i => i !== source)
    const targetIndex = next.indexOf(target)
    if (targetIndex < 0) return
    let insertIndex = targetIndex
    const targetEl = event.currentTarget as HTMLElement | null
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect()
      if (event.clientX > (rect.left + rect.width / 2)) insertIndex = targetIndex + 1
    }
    next.splice(insertIndex, 0, source)
    this.topBarOrder = next
    void this.saveInteraction()
  }

  onTopBarDragEnd(): void {
    this.draggingTopBarItem = null
  }

  resetTopBar(): void {
    this.topBarOrder = [...DEFAULT_TOP_BAR_ORDER]
    this.topBarPinned = [...DEFAULT_TOP_BAR_PINNED]
    this.topBarDisabled = [...DEFAULT_TOP_BAR_DISABLED]
    this.topBarOverflowEnabled = false
    void this.saveInteraction()
  }

  /** 通知所有面板重新读取设置 */
  private notifyPanels(): void {
    // 通过 DOM 事件通知（面板在 ngOnInit 中监听）
    try {
      window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed'))
    } catch (e) { /* 忽略错误 */ }
  }

  // ========== 数据导出导入 ==========

  private _cloneBackupValue(value: unknown, depth = 0): unknown {
    if (depth > 20 || value == null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(item => this._cloneBackupValue(item, depth + 1))
    const out: Record<string, unknown> = Object.create(null)
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '__nonStructural') continue
      out[key] = this._cloneBackupValue(item, depth + 1)
    }
    return out
  }

  /** 收集所有 SFTP+ 相关的 localStorage 数据（尝试解析 JSON，避免导出双重编码） */
  /** 收集所有 SFTP+ 设置数据（优先从 config.store） */
  private collectAllData(): Record<string, unknown> {
    const data: Record<string, unknown> = {}

    // 从 config.store 读取
    if (this.configService?.store) {
      try {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg) {
          data.lang = cfg.lang ?? ''
          data.layoutMode = cfg.layoutMode ?? 'auto'
          data.fontSize = cfg.fontSize ?? 13
          data.theme = cfg.theme ?? ''
          data.colorPrimary = cfg.colorPrimary ?? ''
          data.colorBg = cfg.colorBg ?? ''
          data.colorText = cfg.colorText ?? ''
          data.colorBorder = cfg.colorBorder ?? ''
          // ★ 2026-10-19（Deepseek-V4.1-Flash）：面板透明度（导出时同样钳制到 0.5–1）
          data.panelOpacity = Math.min(1, Math.max(0.5, Number(cfg.panelOpacity) || 1))
          // ★ 2026-10-09 审计根治：兜底值原先是 `?? true`，而 defaultSftpPlusConfig() 里
          //   两者默认都是 **false**、读侧 loadTableSetting(..., false) 也按 false 兜底。
          //   ⇒ 从未改过表格样式的用户导出时 store 里无该键 → 备份里写成 true
          //   → 导入到另一台机器后边框线与斑马纹**全被打开**（用户从没要求过）。
          //   统一成与默认值一致的 false。
          data.tableColBorders = cfg.tableColBorders ?? false
          data.tableZebra = cfg.tableZebra ?? false
          data.hideNativeSFTPButton = cfg.hideNativeSFTPButton ?? false
          data.defaultPathMode = cfg.defaultPathMode ?? 'off'
          data.applySettingsInstantly = cfg.applySettingsInstantly !== false
          data.defaultShowHidden = cfg.defaultShowHidden ?? false
          data.openInNewTabByDefault = cfg.openInNewTabByDefault ?? false
          data.connPickerTrigger = (cfg.connPickerTrigger === 'paneToolbar' || cfg.connPickerTrigger === 'both') ? cfg.connPickerTrigger : (cfg.connPickerTrigger === 'terminalBadge' ? 'paneToolbar' : 'topbar')
          data.singleWorkspaceInstance = cfg.singleWorkspaceInstance ?? true
          data.closeBookmarkPanelOnSelect = cfg.closeBookmarkPanelOnSelect ?? false
          data.typeAheadEnabled = cfg.typeAheadEnabled !== false
          data.bookmarkPanelGroupByScope = cfg.bookmarkPanelGroupByScope !== false
          // ★ 2026-10-19（Deepseek-V4.1-Flash）：联动书签开关
          data.bookmarkLinkEnabled = cfg.bookmarkLinkEnabled !== false
          data.bookmarkSortMode = normalizeBookmarkSortMode(cfg.bookmarkSortMode, cfg.bookmarkSortByUsage)
          // ★ 2026-10-26（Deepseek-V4.1-Flash）：同时写出**只读兼容键** bookmarkSortByUsage ——
          //   它在 EXPORT_CATEGORY_FIELDS.layout 里登记着「一并进备份」，但此前 collectAllData
          //   从不产出 ⇒ 备份里根本没有这个键（注释承诺的行为没落地，探针的「无死项」断言抓出）。
          //   老客户端只认布尔键，写成 `mode === 'usage'` 让它至少能把「按使用频率」带回去。
          data.bookmarkSortByUsage = data.bookmarkSortMode === 'usage'
          data.bookmarkPanelGroupOrder = cfg.bookmarkPanelGroupOrder ?? ['connection', 'global']
          data.dateFormat = cfg.dateFormat ?? ''
          data.transferUploadConcurrency = cfg.transferUploadConcurrency ?? 3
          data.transferDownloadConcurrency = cfg.transferDownloadConcurrency ?? 3
          data.transferChannelMode = (cfg as any).transferChannelMode ?? 'smart'
          data.conflictDigestEnabled = cfg.conflictDigestEnabled ?? true
          data.conflictAutoSkipSameContent = cfg.conflictAutoSkipSameContent ?? true
          data.conflictDigestMaxSizeMB = cfg.conflictDigestMaxSizeMB ?? 256
          data.conflictDigestAlgo = cfg.conflictDigestAlgo === 'sha256' ? 'sha256' : 'sha1'
          data.conflictRenameStyle = normalizeConflictRenameStyle(cfg.conflictRenameStyle)
          // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点只认当前目录（缺键导出成 true，与读侧同口径）
          data.dropToCurrentDir = cfg.dropToCurrentDir !== false
          // ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动（缺键导出成 false / 10s，与读侧同口径）
          data.refreshOnQuickCmd = cfg.refreshOnQuickCmd === true
          data.refreshOnQuickCmdWindow = normalizeRefreshWindowSec((cfg as any).refreshOnQuickCmdWindow)
          data.autoRefreshEnabled = cfg.autoRefreshEnabled === true
          data.autoRefreshInterval = normalizeAutoRefreshIntervalSec((cfg as any).autoRefreshInterval)
          data.listRefreshFlash = cfg.listRefreshFlash !== false
          data.defaultUploadPath = cfg.defaultUploadPath ?? ''
          data.defaultDownloadPath = cfg.defaultDownloadPath ?? ''
          data.iconResourceDir = cfg.iconResourceDir ?? ''
          data.fileTypeIcons = cfg.fileTypeIcons ?? []
          data.disabledIconSvgs = cfg.disabledIconSvgs ?? []
          data.folderIconSvg = cfg.folderIconSvg ?? 'folder.svg'
          data.openOnClick = cfg.openOnClick ?? 'double'
          // ★ 2026-10-30（meta）：文件默认动作
          data.openFileDefaultAction = cfg.openFileDefaultAction ?? 'edit'
          data.openUnsupportedInSystem = cfg.openUnsupportedInSystem ?? true
          data.editableFileExtensions = cfg.editableFileExtensions ?? []
          data.allowViewEditAllFiles = resolveAllowViewEditAllFiles(cfg as Record<string, unknown>)
          data.allowEditAllFiles = data.allowViewEditAllFiles
          data.allowViewAllAsText = data.allowViewEditAllFiles
          data.showTextLineNumbers = cfg.showTextLineNumbers !== false
          data.showTextWordWrap = cfg.showTextWordWrap === true
          data.editorAutoUploadExternal = cfg.editorAutoUploadExternal === true
          data.textCaretShape = normalizeCaretShape(cfg.textCaretShape)
          data.contextMenuOrder = cfg.contextMenuOrder ?? [...DEFAULT_FILE_MENU_ORDER, 'groupBy']
          // ★ 2026-10-09 审计根治：本行原先**缺失**。contextMenuDisabled 在
          //   EXPORT_CATEGORY_FIELDS.layout 里已登记、localStorage 兜底分支也采集了，
          //   唯独 config 分支漏掉 → 而下游 filterExportData 用 `if (field in all)` 过滤
          //   → 正常路径（config 可用，也就是绝大多数情况）下该字段永远不进导出文件。
          //   ⇒ 用户在设置页停用过的右键菜单项，导出后导入到新机器会全部复活。
          data.contextMenuDisabled = cfg.contextMenuDisabled ?? []
          // ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制（顺序 / 固定态 / 折叠开关）
          data[TOP_BAR_CFG_FIELDS.order] = normalizeTopBarOrder((cfg as any)[TOP_BAR_CFG_FIELDS.order])
          data[TOP_BAR_CFG_FIELDS.pinned] = normalizeTopBarPinned((cfg as any)[TOP_BAR_CFG_FIELDS.pinned])
          data[TOP_BAR_CFG_FIELDS.disabled] = normalizeTopBarDisabled((cfg as any)[TOP_BAR_CFG_FIELDS.disabled])
          data[TOP_BAR_CFG_FIELDS.overflow] = (cfg as any)[TOP_BAR_CFG_FIELDS.overflow] === true
          data.panelHotkeys = cfg.panelHotkeys ?? defaultPanelHotkeys()
          data.hideAuthorInfo = cfg.hideAuthorInfo ?? false
          data.paneCustomOrder = cfg.paneCustomOrder ?? ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
          data.paneHiddenItems = cfg.paneHiddenItems ?? []
          // 导出书签、路径记忆（传输日志以 localStorage 为准，见下方）
          if (cfg.bookmarks?.length) data.bookmarks = cfg.bookmarks
          if (cfg.pathMemory && Object.keys(cfg.pathMemory).length) data.pathMemory = cfg.pathMemory
          if (cfg.paneState && typeof cfg.paneState === 'object') {
            data.paneState = this._cloneBackupValue(cfg.paneState)
          }
          // 传输日志权威存储在 localStorage，始终合并
          try {
            const logs = localStorage.getItem('sftp-plus-transfer-logs')
            if (logs) data.transferLogs = JSON.parse(logs)
          } catch {}
          return data
        }
      } catch { /* ignore */ }
    }

    // 回退：从 localStorage 读取
    data.lang = load('lang', '')
    data.layoutMode = load('layoutMode', 'auto')
    data.fontSize = 13
    data.theme = load('theme', '')
    data.colorPrimary = load('primaryColor', '')
    data.colorBg = load('bgColor', '')
    data.colorText = load('textColor', '')
    data.colorBorder = load('borderColor', '')
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：localStorage 兜底分支也要采集，否则 config 不可用时导出丢字段
    data.panelOpacity = Math.min(1, Math.max(0.5, Number(load('panelOpacity', 1)) || 1))
    data.tableColBorders = loadTableSetting('colBorders', false)
    data.tableZebra = loadTableSetting('zebra', true)
    data.hideNativeSFTPButton = load('hideNativeBtn', false)
    data.defaultPathMode = load('defaultPathMode', 'off')
    data.applySettingsInstantly = (load('applySettingsInstantly', true) as boolean) !== false
    data.defaultShowHidden = load('defaultShowHidden', false)
    data.openInNewTabByDefault = load('openInNewTabByDefault', false)
    data.connPickerTrigger = load('connPickerTrigger', 'topbar')
    // ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash）：localStorage 兜底分支同样要采集
    data.connLabelStyle = load('connLabelStyle', 'account')
    data.singleWorkspaceInstance = load('singleWorkspaceInstance', true)
    data.closeBookmarkPanelOnSelect = load('closeBookmarkPanelOnSelect', false)
    data.typeAheadEnabled = load('typeAheadEnabled', true)
    data.bookmarkPanelGroupByScope = load('bookmarkPanelGroupByScope', true)
    data.bookmarkLinkEnabled = load('bookmarkLinkEnabled', true)
    data.bookmarkSortMode = normalizeBookmarkSortMode(load('bookmarkSortMode', 'manual'), load('bookmarkSortByUsage', false))
    // ★ 2026-10-26：兜底分支同样写出只读兼容键（与 config 分支保持同一份导出字段）
    data.bookmarkSortByUsage = data.bookmarkSortMode === 'usage'
    data.bookmarkPanelGroupOrder = load('bookmarkPanelGroupOrder', ['connection', 'global'])
    data.dateFormat = load('dateFormat', '')
    data.conflictRenameStyle = normalizeConflictRenameStyle(load('conflictRenameStyle', 'seq'))
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：localStorage 兜底分支同样要采集（config 不可用时导出别丢字段）
    data.dropToCurrentDir = load<boolean>('dropToCurrentDir', true) !== false
    // ★ 2026-10-27（Deepseek-V4.1-Flash）：兜底分支同样采集 QuickCmd+ 联动两项
    data.refreshOnQuickCmd = load<boolean>('refreshOnQuickCmd', false) === true
    data.refreshOnQuickCmdWindow = normalizeRefreshWindowSec(load<number>('refreshOnQuickCmdWindow', 10))
    data.autoRefreshEnabled = load<boolean>('autoRefreshEnabled', false) === true
    data.autoRefreshInterval = normalizeAutoRefreshIntervalSec(load<number>('autoRefreshInterval', 60))
    data.listRefreshFlash = load<boolean>('listRefreshFlash', true) === true
    data.transferUploadConcurrency = 3
    data.transferDownloadConcurrency = 3
    data.hideAuthorInfo = false
    data.openOnClick = load('openOnClick', 'double')
    // ★ 2026-10-30（meta）：文件默认动作
    data.openFileDefaultAction = load('openFileDefaultAction', 'edit')
    data.openUnsupportedInSystem = load('openUnsupportedInSystem', true)
    data.editableFileExtensions = normalizeEditableExtensions(load<unknown>('editableFileExtensions', []))
    data.allowViewEditAllFiles = loadAllowViewEditAllFiles()
    data.allowEditAllFiles = data.allowViewEditAllFiles
    data.allowViewAllAsText = data.allowViewEditAllFiles
    data.showTextLineNumbers = load('showTextLineNumbers', true)
    data.showTextWordWrap = load('showTextWordWrap', false)
    data.editorAutoUploadExternal = load('editorAutoUploadExternal', false)
    data.textCaretShape = normalizeCaretShape(load<unknown>('textCaretShape', 'beam'))
    data.conflictDigestEnabled = load('conflictDigestEnabled', true)
    data.conflictAutoSkipSameContent = load('conflictAutoSkipSameContent', true)
    data.conflictDigestMaxSizeMB = load('conflictDigestMaxSizeMB', 256)
    data.conflictDigestAlgo = load<'sha1' | 'sha256'>('conflictDigestAlgo', 'sha1')
    try { data.contextMenuOrder = JSON.parse(localStorage.getItem('sftp-plus-context-menu-order') || '[]') } catch { data.contextMenuOrder = [] }
    try { data.contextMenuDisabled = JSON.parse(localStorage.getItem('sftp-plus-context-menu-disabled') || '[]') } catch { data.contextMenuDisabled = [] }
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：localStorage 兜底分支也带上顶栏定制（导出字段必须两分支都采集，
    //   否则 config 不可用时会静默丢字段 —— 与 contextMenuDisabled 曾经漏采集同一类坑）
    data[TOP_BAR_CFG_FIELDS.order] = [...DEFAULT_TOP_BAR_ORDER]
    data[TOP_BAR_CFG_FIELDS.pinned] = [...DEFAULT_TOP_BAR_PINNED]
    data[TOP_BAR_CFG_FIELDS.disabled] = [...DEFAULT_TOP_BAR_DISABLED]
    data[TOP_BAR_CFG_FIELDS.overflow] = false
    data.panelHotkeys = defaultPanelHotkeys()
    try { data.paneCustomOrder = JSON.parse(localStorage.getItem('sftp-plus-pane-custom-order') || '["label","back","forward","up","refresh","home","path","hidden","filter","bookmark"]') } catch { data.paneCustomOrder = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark'] }
    try { data.paneHiddenItems = JSON.parse(localStorage.getItem('sftp-plus-pane-hidden-items') || '[]') } catch { data.paneHiddenItems = [] }
    // 尝试从 localStorage 读取书签和传输日志
    try {
      const bkm = localStorage.getItem('sftp-plus-bookmarks-v2')
      if (bkm) data.bookmarks = JSON.parse(bkm)
    } catch {}
    try {
      const logs = localStorage.getItem('sftp-plus-transfer-logs')
      if (logs) data.transferLogs = JSON.parse(logs)
    } catch {}
    return data
  }

  /**
   * 按勾选的类别过滤导出数据（★ 2026-09-29）。
   * 未勾选的类别**完全不写入** JSON —— 导入侧对不存在的字段是「不覆盖」语义，
   * 所以「只导外观」的备份在导入时不会清空书签、路径记忆与传输日志。
   */
  private filterExportData(all: Record<string, unknown>): Record<string, unknown> {
    // ★ 2026-09-29：九类，与设置页分区一一对应；顺序与弹窗展示顺序一致
    const picks: Array<[boolean, string]> = [
      [this.exportPickLang, 'lang'],
      [this.exportPickTheme, 'theme'],
      [this.exportPickLayout, 'layout'],
      [this.exportPickIcons, 'icons'],
      [this.exportPickOther, 'other'],
      [this.exportPickTransfer, 'transfer'],
      [this.exportPickHotkeys, 'hotkeys'],
      [this.exportPickData, 'data'],
      [this.exportPickLogs, 'logs'],
    ]
    const out: Record<string, unknown> = {}
    for (const [enabled, category] of picks) {
      if (!enabled) continue
      for (const field of EXPORT_CATEGORY_FIELDS[category] ?? []) {
        if (field in all) out[field] = all[field]
      }
    }
    return out
  }

  /**
   * 导出数据为 JSON 文件。
   * ★ 2026-09-29：改为**按弹窗里勾选的配置类别**导出（原实现无条件导出全部内容，
   *   用户要「只备份外观/只备份书签」时只能全量导出再手动删键）。
   */
  exportData(): void {
    const all = this.collectAllData()
    const data = this.filterExportData(all)
    if (!Object.keys(data).length) {
      // 兜底：一类都没勾（按钮已 disabled，这里防键盘/脚本绕过）→ 不生成空备份文件
      // ★ 2026-10-19 P2-34（audit）：这里还有一条**正常用户路径**会走到 —— 勾了类别但该类
      //   本机没有数据。最典型：只勾「传输记录」而本机无日志 ⇒ transferLogs 不在 collectAllData
      //   结果里 ⇒ filterExportData 的 `field in all` 过滤后为空 ⇒ 既不下载也不提示，
      //   用户只看到弹窗关了，以为导出坏了。现补一条 i18n 提示（沿用本文件导入结果那套
      //   alert 口径，不新增 UI 组件/依赖）；一类未勾的纯绕过场景同样给这条提示。
      this.showExportDialog = false
      alert(this.i18n.t('settings.exportNothing'))
      return
    }
    this.showExportDialog = false
    const json = JSON.stringify({ 'tabby-sftp-plus': data }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    a.download = `sftp-plus_backup_${ts}.json`
    a.click()
    // 延迟释放 Blob URL，确保浏览器有足够时间启动下载
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  /**
   * 从 JSON 文件导入数据并写入 Tabby config
   * 写入保护：使用 per-property update 避免 ConfigProxy 值删除
   */
  importData(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string)
        // 防御原型链污染：只接受普通对象
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new Error(this.i18n.t('settings.invalidFormat'))
        }
        const json: Record<string, any> = Object.create(null)
        for (const k of Object.keys(raw)) {
          if (k === '__proto__' || k === 'constructor') continue
          json[k] = raw[k]
        }

        // 格式校验：兼容新格式（带标识）和旧格式（扁平结构）
        let data = json['tabby-sftp-plus']
        if (!data || typeof data !== 'object') {
          // 拒绝 QuickCmd+ 数据（新格式标识或旧格式前缀）
          if (json['tabby-quick-command-plus'] || json['commands'] || json['groups'] || Object.keys(json).some(k => k.startsWith('qc-plus-'))) {
            throw new Error(this.i18n.t('settings.invalidFormat'))
          }
          // 旧格式兼容：扁平结构直接使用（含 prefixed localStorage 格式转换）
          if (Object.keys(json).some(k => k.startsWith('sftp-plus-'))) {
            data = this._convertOldPrefixedFormat(json)
          } else {
            data = json
          }
        }

        // 写入 config.store（per-property update 写入保护）
        if (this.configService?.store) {
          const target = this.configService.store['tabby-sftp-plus']
          // ★ 2026-10-19 P2-35（audit）：导入的 lang 必须先过白名单再落库。
          //   原写法 `target.lang = data.lang` 把任意字符串直接写进 config（外部 JSON 不可信）：
          //   'zh' / 'EN-us' / '自动' 之类非法码一旦落库，effectiveLang 的
          //   validLocales.includes 判定就恒为 false ⇒ 静默退回 detectSystemLocale()，
          //   于是「设置页下拉框显示『跟随 Tabby』、config 里却存着非法值」，与面板
          //   （各自构造时读 lang，同样回退但判定源可能不同）行为不一致，且用户无从察觉。
          //   修法：空串（跟随系统）合法；其余只接受 locales 白名单内的**规范码**
          //   （大小写不敏感归一，如 zh-cn → zh-CN）；非法值直接丢弃、保留本机原 lang。
          if (data.lang !== undefined) {
            const rawLang = typeof data.lang === 'string' ? data.lang.trim() : ''
            if (rawLang === '') {
              target.lang = ''
            } else {
              const hit = this.locales.find(l => l.code.toLowerCase() === rawLang.toLowerCase())
              if (hit) target.lang = hit.code
            }
          }
          if (data.layoutMode !== undefined) target.layoutMode = data.layoutMode
          if (data.fontSize !== undefined) target.fontSize = this._clampFontSize(Number(data.fontSize))
          if (data.theme !== undefined) target.theme = data.theme
          if (data.colorPrimary !== undefined) target.colorPrimary = data.colorPrimary
          if (data.colorBg !== undefined) target.colorBg = data.colorBg
          if (data.colorText !== undefined) target.colorText = data.colorText
          if (data.colorBorder !== undefined) target.colorBorder = data.colorBorder
          // ★ 2026-10-19（Deepseek-V4.1-Flash）：透明度（配置 + 内存同步，导入后设置页立即反映）
          if (data.panelOpacity !== undefined) {
            this.panelOpacity = Math.min(1, Math.max(0.5, Number(data.panelOpacity) || 1))
            target.panelOpacity = this.panelOpacity
          }
          if (data.tableColBorders !== undefined) target.tableColBorders = data.tableColBorders
          if (data.tableZebra !== undefined) target.tableZebra = data.tableZebra
          if (data.hideNativeSFTPButton !== undefined) target.hideNativeSFTPButton = data.hideNativeSFTPButton
          if (data.defaultPathMode !== undefined) target.defaultPathMode = data.defaultPathMode
          // ★ 2026-10-22 续三十六（Deepseek-V4.1-Flash）：导入后设置页与面板都要立即反映
          if (data.applySettingsInstantly !== undefined) {
            this.applySettingsInstantly = data.applySettingsInstantly !== false
            target.applySettingsInstantly = this.applySettingsInstantly
          }
          if (data.defaultShowHidden !== undefined) target.defaultShowHidden = data.defaultShowHidden
          if (data.openInNewTabByDefault !== undefined) target.openInNewTabByDefault = data.openInNewTabByDefault
          if (data.connPickerTrigger !== undefined) {
            this.connPickerTrigger = (data.connPickerTrigger === 'paneToolbar' || data.connPickerTrigger === 'both') ? data.connPickerTrigger : (data.connPickerTrigger === 'terminalBadge' ? 'paneToolbar' : 'topbar')
            target.connPickerTrigger = this.connPickerTrigger
          }
          // ★ 2026-10-20 续三十一（Deepseek-V4.1-Flash）：顶栏连接显示（导入后设置页与面板都要立即反映）
          if (data.connLabelStyle !== undefined) {
            this.connLabelStyle = data.connLabelStyle === 'alias' ? 'alias' : 'account'
            target.connLabelStyle = this.connLabelStyle
          }
          if (data.singleWorkspaceInstance !== undefined) target.singleWorkspaceInstance = data.singleWorkspaceInstance
          if (data.closeBookmarkPanelOnSelect !== undefined) target.closeBookmarkPanelOnSelect = data.closeBookmarkPanelOnSelect
          if (data.typeAheadEnabled !== undefined) target.typeAheadEnabled = data.typeAheadEnabled !== false
          if (data.bookmarkPanelGroupByScope !== undefined) target.bookmarkPanelGroupByScope = data.bookmarkPanelGroupByScope !== false
          if (data.bookmarkLinkEnabled !== undefined) {
            this.bookmarkLinkEnabled = data.bookmarkLinkEnabled !== false
            target.bookmarkLinkEnabled = this.bookmarkLinkEnabled
          }
          // ★ 2026-10-22（Deepseek-V4.1-Flash）：排序三档（兼容老备份里的 bookmarkSortByUsage 布尔）
          if (data.bookmarkSortMode !== undefined || data.bookmarkSortByUsage !== undefined) {
            this.bookmarkSortMode = normalizeBookmarkSortMode(data.bookmarkSortMode, data.bookmarkSortByUsage)
            target.bookmarkSortMode = this.bookmarkSortMode
          }
          if (Array.isArray(data.bookmarkPanelGroupOrder) && data.bookmarkPanelGroupOrder.length) {
            const valid = (data.bookmarkPanelGroupOrder as string[]).filter(
              (x): x is 'connection' | 'global' => x === 'connection' || x === 'global',
            )
            if (valid.includes('connection') && valid.includes('global')) {
              target.bookmarkPanelGroupOrder = [valid[0], valid.find(x => x !== valid[0])!]
            }
          }
          if (data.dateFormat !== undefined) target.dateFormat = data.dateFormat
          if (data.transferUploadConcurrency !== undefined) target.transferUploadConcurrency = data.transferUploadConcurrency
          if (data.transferDownloadConcurrency !== undefined) target.transferDownloadConcurrency = data.transferDownloadConcurrency
          if ((data as any).transferChannelMode !== undefined) target.transferChannelMode = (data as any).transferChannelMode
          if (data.conflictDigestEnabled !== undefined) target.conflictDigestEnabled = data.conflictDigestEnabled !== false
          if (data.conflictAutoSkipSameContent !== undefined) target.conflictAutoSkipSameContent = data.conflictAutoSkipSameContent !== false
          if (data.conflictRenameStyle !== undefined) {
            // ★ 2026-10-23：导入的备份来自外部 JSON，未知值一律回落 seq（不直接信任）
            target.conflictRenameStyle = normalizeConflictRenameStyle(data.conflictRenameStyle)
          }
          if (data.conflictDigestMaxSizeMB !== undefined) {
            // ★ 2026-09-21 P2：导入的配置同样要 clamp 上界（外部 JSON 不可信）
            target.conflictDigestMaxSizeMB = this._clampDigestMaxMB(data.conflictDigestMaxSizeMB)
          }
          if (data.conflictDigestAlgo !== undefined) target.conflictDigestAlgo = data.conflictDigestAlgo === 'sha256' ? 'sha256' : 'sha1'
          // ★ 2026-10-27（Deepseek-V4.1-Flash）：拖拽落点只认当前目录（外部 JSON 不可信 ⇒ 只认真布尔，
          //   其余值一律按「开」，即安全侧；同时同步内存值让设置页立即反映）
          if (data.dropToCurrentDir !== undefined) {
            this.dropToCurrentDir = data.dropToCurrentDir !== false
            target.dropToCurrentDir = this.dropToCurrentDir
          }
          // ★ 2026-10-27（Deepseek-V4.1-Flash）：QuickCmd+ 联动（外部 JSON 不可信 ⇒ 严格判型 + 时长夹界）
          if (data.refreshOnQuickCmd !== undefined) {
            this.refreshOnQuickCmd = data.refreshOnQuickCmd === true
            target.refreshOnQuickCmd = this.refreshOnQuickCmd
          }
          if (data.refreshOnQuickCmdWindow !== undefined) {
            this.refreshOnQuickCmdWindow = normalizeRefreshWindowSec(data.refreshOnQuickCmdWindow)
            target.refreshOnQuickCmdWindow = this.refreshOnQuickCmdWindow
          }
          // ★ 2026-10-27（Deepseek-V4.1-Flash）：定时刷新（同样不可信 ⇒ 严格判型 + 间隔夹界）
          if (data.autoRefreshEnabled !== undefined) {
            this.autoRefreshEnabled = data.autoRefreshEnabled === true
            target.autoRefreshEnabled = this.autoRefreshEnabled
          }
          if (data.autoRefreshInterval !== undefined) {
            this.autoRefreshInterval = normalizeAutoRefreshIntervalSec(data.autoRefreshInterval)
            target.autoRefreshInterval = this.autoRefreshInterval
          }
          if (data.listRefreshFlash !== undefined) {
            this.listRefreshFlash = data.listRefreshFlash !== false
            target.listRefreshFlash = this.listRefreshFlash
          }
          if (data.defaultUploadPath !== undefined) target.defaultUploadPath = data.defaultUploadPath
          if (data.defaultDownloadPath !== undefined) target.defaultDownloadPath = data.defaultDownloadPath
          if (data.iconResourceDir !== undefined) target.iconResourceDir = data.iconResourceDir
          if (data.fileTypeIcons !== undefined) target.fileTypeIcons = data.fileTypeIcons
          if (data.disabledIconSvgs !== undefined) target.disabledIconSvgs = data.disabledIconSvgs
          if (data.folderIconSvg !== undefined) target.folderIconSvg = data.folderIconSvg || 'folder.svg'
          if (data.hideAuthorInfo !== undefined) target.hideAuthorInfo = data.hideAuthorInfo
          if (data.openOnClick !== undefined) target.openOnClick = data.openOnClick
          // ★ 2026-10-30（meta）：文件默认动作
          if (data.openFileDefaultAction !== undefined) target.openFileDefaultAction = data.openFileDefaultAction
          if (data.openUnsupportedInSystem !== undefined) target.openUnsupportedInSystem = data.openUnsupportedInSystem
          if (data.editableFileExtensions !== undefined) target.editableFileExtensions = normalizeEditableExtensions(data.editableFileExtensions)
          if (data.allowViewEditAllFiles !== undefined || data.allowEditAllFiles !== undefined || data.allowViewAllAsText !== undefined || (data as Record<string, unknown>)['allowViewAllFiles'] !== undefined) {
            // ★ 2026-10-09 审计根治：原先在导入侧**手写** `a === true || b === true || c === true`，
            //   与导出侧/读侧共用的 resolveAllowViewEditAllFiles() 不一致，且**漏了第四个旧键
            //   allowViewAllFiles** ⇒ 从旧备份导入该键时开关被强制写成 false（丢配置），
            //   而同一份数据走导出路径却能正确带出 ⇒ 导出/导入不对称。
            //   根治：两侧复用同一个 resolve 函数，语义单一来源。
            const on = resolveAllowViewEditAllFiles(data as Record<string, unknown>)
            target.allowViewEditAllFiles = on
            target.allowEditAllFiles = on
            target.allowViewAllAsText = on
          }
          if (data.showTextLineNumbers !== undefined) target.showTextLineNumbers = data.showTextLineNumbers !== false
          if (data.showTextWordWrap !== undefined) target.showTextWordWrap = data.showTextWordWrap === true
          if (data.editorAutoUploadExternal !== undefined) target.editorAutoUploadExternal = data.editorAutoUploadExternal === true
          if (data.textCaretShape !== undefined) target.textCaretShape = normalizeCaretShape(data.textCaretShape)
          if (data.contextMenuOrder !== undefined) target.contextMenuOrder = data.contextMenuOrder
          if (data.contextMenuDisabled !== undefined) target.contextMenuDisabled = data.contextMenuDisabled
          // ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏按钮定制——配置与内存同步写，
          //   否则导入后设置页仍显示旧布局（直到重开设置页）
          if (data[TOP_BAR_CFG_FIELDS.order] !== undefined) {
            this.topBarOrder = normalizeTopBarOrder(data[TOP_BAR_CFG_FIELDS.order])
            ;(target as any)[TOP_BAR_CFG_FIELDS.order] = [...this.topBarOrder]
          }
          if (data[TOP_BAR_CFG_FIELDS.pinned] !== undefined) {
            this.topBarPinned = normalizeTopBarPinned(data[TOP_BAR_CFG_FIELDS.pinned])
            ;(target as any)[TOP_BAR_CFG_FIELDS.pinned] = [...this.topBarPinned]
          }
          if (data[TOP_BAR_CFG_FIELDS.disabled] !== undefined) {
            this.topBarDisabled = normalizeTopBarDisabled(data[TOP_BAR_CFG_FIELDS.disabled])
            ;(target as any)[TOP_BAR_CFG_FIELDS.disabled] = [...this.topBarDisabled]
          }
          if (data[TOP_BAR_CFG_FIELDS.overflow] !== undefined) {
            this.topBarOverflowEnabled = data[TOP_BAR_CFG_FIELDS.overflow] === true
            ;(target as any)[TOP_BAR_CFG_FIELDS.overflow] = this.topBarOverflowEnabled
          }
          // ★ 2026-08-24 修复：与 _saveToConfig 同理，panelHotkeys 为结构成员须逐叶子赋值
          if (data.panelHotkeys !== undefined) {
            const ph = (target as any).panelHotkeys
            if (ph) {
              for (const a of PANEL_HOTKEY_ACTIONS) {
                const src = (data.panelHotkeys as any)[a]
                const dst = ph[a]
                if (src && dst) {
                  // 兼容旧备份的单键格式 key 与新格式 keys
                  const keys = normalizePanelHotkeyKeys((src as any).keys ?? (src as any).key, PANEL_HOTKEY_CLEARED)
                  dst.keys = keys
                  dst.enabled = keys.length > 0 && src.enabled !== false
                  dst.key = PANEL_HOTKEY_CLEARED
                }
              }
            }
          }
          if (data.paneCustomOrder !== undefined) target.paneCustomOrder = data.paneCustomOrder
          if (data.paneHiddenItems !== undefined) target.paneHiddenItems = data.paneHiddenItems
          // 导入路径记忆：导出已含 pathMemory，导入须写回，否则备份无法恢复（# 导出导入不对称缺陷修复）
          if (data.pathMemory !== undefined) target.pathMemory = data.pathMemory
          // 导入书签：沿用正常添加路径的规范化规则，拒绝畸形记录和无效路径。
          if (Array.isArray(data.bookmarks)) {
            const ids = new Set<string>()
            target.bookmarks = data.bookmarks.flatMap((raw: any, index: number) => {
              if (!raw || (raw.type !== 'local' && raw.type !== 'remote')) return []
              const normalizedPath = normalizeBookmarkPath(raw.path, raw.type)
              if (!normalizedPath) return []
              let id = typeof raw.id === 'string' ? raw.id.slice(0, 256) : ''
              if (!id || ids.has(id)) id = `import-${Date.now().toString(36)}-${index.toString(36)}`
              ids.add(id)
              return [{
                id,
                name: String(raw.name ?? path.basename(normalizedPath) ?? normalizedPath).slice(0, 512),
                path: normalizedPath,
                type: raw.type,
                connectionKey: raw.connectionKey == null ? undefined : String(raw.connectionKey).slice(0, 512),
                createdAt: Number(raw.createdAt) || Date.now(),
              }]
            })
          }
          if (data.paneState && typeof data.paneState === 'object' && !Array.isArray(data.paneState)) {
            const incoming = data.paneState as Record<string, unknown>
            const paneState = target.paneState && typeof target.paneState === 'object'
              ? target.paneState
              : (target.paneState = {})
            // ★ 2026-10-19 P2-32（audit）：补 endpoints 分节。导出侧是整份 paneState 克隆
            //   （下面 rightLocalPath 同因），而导入侧原先只认 layout/local/remote ⇒
            //   右侧端点类型 paneState/endpoints/right（面板 _persistRightEndpoint 写入）
            //   导出带了、导入静默丢弃，新机器恢复后右栏端点回到默认。
            for (const section of ['layout', 'local', 'remote', 'endpoints'] as const) {
              const clean = this._cloneBackupValue(incoming[section])
              if (clean && typeof clean === 'object' && !Array.isArray(clean)) {
                paneState[section] = { ...(paneState[section] ?? {}), ...(clean as Record<string, unknown>) }
              }
            }
            // ★ 2026-10-19 P2-32（audit）：rightLocalPath 是**标量**（右栏本地端点当前路径，
            //   字符串），不属于上面任一分节对象 ⇒ 走上面的循环会被 typeof 检查挡掉、同样被丢弃
            //   （面板 _restoreRightEndpoint 靠它恢复右栏本地目录）。按面板读取口径校验后写回：
            //   非空字符串且不含控制字符（具体能否打开由面板导航自行兜底，与 perHost 路径同口径）。
            const rlPath = incoming['rightLocalPath']
            if (typeof rlPath === 'string' && rlPath.trim() && !/[\0-\x1f]/.test(rlPath)) {
              paneState['rightLocalPath'] = rlPath
            }
          }
          // ★ 2026-10-19 P1（audit）：导入必须镜像到「面板真正读取的那份数据」。
          //   本仓库存在两个数据源分叉：设置页主张写 config，但浮动面板的表格样式
          //   （loadTableSettings）与自定义配色（_restoreCustomColors）**只读 localStorage**。
          //   只写 config 的后果是：① 导入的斑马纹/列边框在面板上永远不生效，且之后用户在
          //   设置页点一下开关就会用旧 localStorage 值覆盖掉刚导入的配置；② 自定义主题色
          //   更严重——_readFromConfig 走 theme==='custom' 分支时被 localStorage 里的旧色
          //   **吞并**，紧接着任何一次 _saveToConfig() 又把旧色写回 config（永久丢失）。
          //   修法：凡设置页正常保存时会写 localStorage 的键，导入也逐项镜像同一份值。
          this._mirrorImportedToLocalStorage(data)
          this.configService.save()
          // 传输日志只写 localStorage，但必须经过服务层清洗、条数及 4MB 上限。
          if (data.transferLogs !== undefined) {
            if (!this.transferLogImport.replaceFromImport(data.transferLogs)) {
              log.warn('Import transfer logs ignored: expected an array')
            }
          }
          // 路径记忆导入 localStorage（与 saveCurrentPath 统一路径）
          if (data.paneState?.perHost) {
            const paneState = target.paneState && typeof target.paneState === 'object'
              ? target.paneState
              : (target.paneState = {})
            const perHost = paneState.perHost && typeof paneState.perHost === 'object'
              ? paneState.perHost
              : (paneState.perHost = {})
            for (const [host, entry] of Object.entries(data.paneState.perHost)) {
              // 防御：仅允许合法主机名字符，拒绝注入。
              // ★ 2026-10-09 审计根治：原正则 `[a-zA-Z0-9._:-]` **不含 @**，
              //   而 perHost 的 key 恰恰就是 `${username}@${host}`（面板 _hostKey）：
              //   root@192.168.1.1、deploy@build.internal 全部含 @ ⇒ 整段被 continue 跳过
              //   ⇒ **路径记忆导入 100% 丢弃**（而导出侧 _cloneBackupValue 不做过滤，
              //   于是表现为「导出成功、导入全丢」的不对称，极具迷惑性）。
              //   修法：把 @ 纳入白名单。它不是注入字符 —— 本正则只校验**键**（用来拼
              //   localStorage key），值里的危险字符仍由下方 4529-4531 行的
              //   控制字符检查 + path.isAbsolute 双重把关。
              if (!/^[a-zA-Z0-9._:@-]+$/.test(host)) continue
              const localRaw = typeof (entry as any).savedLocalPath === 'string' ? (entry as any).savedLocalPath.trim() : ''
              if (localRaw && !/[\0-\x1f]/.test(localRaw)) {
                const localNormalized = path.normalize(localRaw)
                if (path.isAbsolute(localNormalized)) {
                  localStorage.setItem(`sftp-plus-saved-local-path.${host}`, localNormalized)
                  const hostState = perHost[host] && typeof perHost[host] === 'object'
                    ? perHost[host]
                    : (perHost[host] = {})
                  hostState.savedLocalPath = localNormalized
                }
              }
              const remoteRaw = typeof (entry as any).savedRemotePath === 'string' ? (entry as any).savedRemotePath.trim() : ''
              if (remoteRaw.startsWith('/') && !/[\0-\x1f]/.test(remoteRaw)) {
                const remoteNormalized = path.posix.normalize(remoteRaw.replace(/\/+/g, '/'))
                localStorage.setItem(`sftp-plus-saved-remote-path.${host}`, remoteNormalized)
                const hostState = perHost[host] && typeof perHost[host] === 'object'
                  ? perHost[host]
                  : (perHost[host] = {})
                hostState.savedRemotePath = remoteNormalized
              }
              const importedMode = (entry as any).pathMode
              if (importedMode === 'off' || importedMode === 'remember' || importedMode === 'sync') {
                localStorage.setItem(`sftp-plus-path-mode.${host}`, importedMode)
                const hostState = perHost[host] && typeof perHost[host] === 'object'
                  ? perHost[host]
                  : (perHost[host] = {})
                hostState.pathMode = importedMode
              }
            }
            this.configService.save()
          }
          alert(this.i18n.t('settings.importComplete'))
        } else {
          alert(this.i18n.t('settings.importUnavailable'))
        }

        // 刷新当前组件属性
        this._refreshFromConfig()
        // ★ 2026-10-13 P2 修复：导入后同步切换界面语言。
        //   下拉框改语言走 saveLang()（内部会 i18n.setLocale），导入路径却只写了
        //   config.store 的 lang 字段 —— 于是「导入一份英文备份后，设置页仍是中文」，
        //   而面板（各自构造时读 lang）已经是英文，两边语言不一致，直到重启 Tabby 才统一。
        //   注意必须放在 alert 之前，提示语才会用新语言。
        try { this.i18n.setLocale(this.effectiveLang) } catch { /* 语言切换失败不影响导入结果 */ }
        this.notifyPanels()
      } catch (e: any) {
        alert(e?.message || this.i18n.t('settings.importFailed'))
      }
    }
    reader.readAsText(file)
    input.value = ''
  }

  /**
   * 导出勾选弹窗（★ 2026-09-29）：按配置类别选择性导出。
   * ★ 2026-09-29 二次调整：九个类别**逐项对齐设置页自己的分区标题**
   *   （语言 / 主题 / 布局 / 对象图标 / 其它 / 传输设置 / 快捷键 / 数据 / 传输记录），
   *   其中「传输记录」从原「书签与记录」拆出独立成项。类别名直接复用设置页标题的 i18n key。
   */
  showExportDialog = false
  exportPickLang = true
  exportPickTheme = true
  exportPickLayout = true
  exportPickIcons = true
  exportPickOther = true
  exportPickTransfer = true
  exportPickHotkeys = true
  exportPickData = true
  exportPickLogs = true

  /** 导出类别总数（新增/删除类别时改这里，exportAllPicked 与探针都据此判定） */
  get exportPickTotal(): number { return 9 }

  /** 当前勾选状态数组（顺序与 filterExportData 的 picks 一致） */
  private _exportPicks(): boolean[] {
    return [
      this.exportPickLang, this.exportPickTheme, this.exportPickLayout, this.exportPickIcons,
      this.exportPickOther, this.exportPickTransfer, this.exportPickHotkeys,
      this.exportPickData, this.exportPickLogs,
    ]
  }

  /** 一次性把九类设为同一值（打开弹窗 / 全选 / 全不选共用） */
  private _setAllExportPicks(v: boolean): void {
    this.exportPickLang = v
    this.exportPickTheme = v
    this.exportPickLayout = v
    this.exportPickIcons = v
    this.exportPickOther = v
    this.exportPickTransfer = v
    this.exportPickHotkeys = v
    this.exportPickData = v
    this.exportPickLogs = v
  }

  /** 已勾选的类别数（0 → 禁用导出按钮，避免导出空备份） */
  get exportPickCount(): number {
    return this._exportPicks().filter(Boolean).length
  }

  /** 是否九类全勾（决定底部小按钮显示「全选」还是「全不选」） */
  get exportAllPicked(): boolean {
    return this.exportPickCount === this.exportPickTotal
  }

  /** 打开导出勾选弹窗；每次回到全选，避免上次的勾选残留导致「以为全导出了其实没有」 */
  openExportDialog(): void {
    this._setAllExportPicks(true)
    this.showExportDialog = true
  }

  closeExportDialog(): void {
    this.showExportDialog = false
  }

  /** 全选 / 全不选一键切换 */
  toggleExportAll(): void {
    this._setAllExportPicks(!this.exportAllPicked)
  }

  showClearConfirm = false
  clearConfirmInput = ''

  openClearConfirm(): void {
    this.clearConfirmInput = ''
    this.showClearConfirm = true
    setTimeout(() => {
      const input = document.querySelector('.ss-edit-modal .ss-edit-input') as HTMLInputElement | null
      if (input) input.focus()
    }, 50)
  }
  closeClearConfirm(): void { this.showClearConfirm = false; this.clearConfirmInput = '' }

  /**
   * 把 ConfigProxy 上的单个键恢复为插件默认值。
   *
   * ⚠ 结构成员（非空对象、非数组、无 __nonStructural 标记）在 ConfigProxy 里**只有 getter**：
   *   直接 `target[k] = 默认对象` 会抛 TypeError（严格模式）→ 被外层 catch 吞掉 → 该键及其后所有键都不落盘。
   *   宿主判定口径见 tabby-core `isStructuralMember()`：
   *   `v instanceof Object && !(v instanceof Array) && Object.keys(v).length > 0 && !v.__nonStructural`。
   *   故结构成员必须**递归到叶子**逐项赋值（本文件 _saveToConfig 与 importData 对 panelHotkeys 用的是同一套写法）。
   *
   * 非结构成员（标量 / 数组 / 空对象 / 带 __nonStructural 的对象）走 setter：
   *   ConfigProxy.__setValue 在「新值 deepEqual 默认值」时直接 `delete real[key]`，
   *   所以赋默认值 = 真正抹掉该键（重启后由 defaults 兜底）——这正是「清空」想要的语义。
   */
  private _resetConfigKey(target: any, key: string, def: unknown): void {
    const isStructural = def instanceof Object && !(def instanceof Array)
      && Object.keys(def as object).length > 0 && !(def as { __nonStructural?: boolean }).__nonStructural
    if (isStructural) {
      const cur = target[key]
      if (!cur || typeof cur !== 'object') throw new Error(`structural member "${key}" unavailable`)
      for (const sub of Object.keys(def as object)) {
        this._resetConfigKey(cur, sub, (def as Record<string, unknown>)[sub])
      }
      return
    }
    target[key] = def
  }

  /**
   * 清空所有 SFTP+ 数据（需输入 DELETE 确认）
   *
   * ★ 2026-09-29 修复「点了清空仍有残留」：原实现是单层 for 循环裸赋值 `target[k] = defaults[k]`，
   *   在第 23 个键 `panelHotkeys`（结构成员，只有 getter）处抛 TypeError → 整个循环中断，
   *   其后的 contextMenuOrder / 传输设置 / 图标 / 冲突摘要 / 书签 / 路径记忆 / 面板状态 / 传输日志
   *   **全部没被清掉**；异常还被最外层 catch 吞掉，连带跳过了 localStorage 清理、界面刷新与提示。
   *   现在：① localStorage 先清；② config 逐键独立 try/catch（单键失败不牵连其余）；
   *   ③ 结构成员走 _resetConfigKey 递归；④ 顺带清 Tabby 级「面板开关快捷键」（不在插件子树内）；
   *   ⑤ 无论 config 侧是否出错，都刷新界面并给用户提示。
   */
  async doClearData(): Promise<void> {
    if (this.clearConfirmInput !== 'DELETE') return
    this.showClearConfirm = false
    this.clearConfirmInput = ''
    const failed: string[] = []

    // ① localStorage：所有 sftp-plus-* 键（书签墓碑、传输日志、列宽/排序、路径记忆、面板几何…）
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sftp-plus-')) keysToRemove.push(k)
      }
      for (const k of keysToRemove) localStorage.removeItem(k)
    } catch (e) {
      failed.push('localStorage')
      log.error('Clear data: localStorage failed', e)
    }

    // ② config.store 恢复默认值（逐键独立，避免一键失败中断整轮）
    try {
      const target = this.configService?.store?.['tabby-sftp-plus']
      if (target) {
        const defaults = defaultSftpPlusConfig()
        for (const k of Object.keys(defaults)) {
          try {
            this._resetConfigKey(target, k, (defaults as unknown as Record<string, unknown>)[k])
          } catch (e) {
            failed.push(k)
            log.error(`Clear data: reset "${k}" failed`, e)
          }
        }
      }
    } catch (e) {
      failed.push('config')
      log.error('Clear data: config reset failed', e)
    }

    // ③ Tabby 级插件热键（面板开关快捷键）不在这棵插件子树里，须单独清
    try {
      const hk = this.configService?.store?.hotkeys as Record<string, unknown> | undefined
      if (hk && hk[SFTP_PLUS_TOGGLE_HOTKEY]) hk[SFTP_PLUS_TOGGLE_HOTKEY] = []
    } catch (e) {
      failed.push('hotkeys')
      log.error('Clear data: hotkeys failed', e)
    }

    try { await this.configService?.save() } catch (e) { log.error('Clear data: save failed', e) }

    // ④ 设置页状态回默认 + 通知面板重读（无论上面是否出错都要做，否则界面仍显示旧值）
    try { this._refreshFromConfig() } catch (e) { log.error('Clear data: refresh failed', e) }
    this.notifyPanels()

    const msg = this.i18n.t('settings.dataCleared')
    // 兜底诊断：正常路径不会走到这里；真出错时把未清干净的键名一并显示，便于回报问题
    alert(failed.length ? `${msg}\n\n⚠ ${failed.join(', ')}` : msg)
  }

  /** 插件仓库地址（GitHub 源码 / Releases / issue 表单共用一份，避免多处硬编码各写各的） */
  readonly repoUrl = 'https://github.com/10D24D/Tabby-SFTP-Plus'

  /** 作者 GitHub 主页（关于区「作者: DD1024z」的点击目标，同时作为 hover title 提示） */
  readonly authorProfileUrl = 'https://github.com/10D24D'

  /**
   * 当前版本的 GitHub Release 页面
   * 功能描述：关于区「版本: x.y.z」的点击目标 =
   *          https://github.com/10D24D/Tabby-SFTP-Plus/releases/tag/v3.1.0 这样带 tag 的页面，
   *          同时作为 hover 的 title 提示（鼠标停留就能看到会跳到哪个地址）。
   *          package.json 的 version 不带前缀而 GitHub tag 带 v ⇒ 统一补 v；已带 v 则不重复补，
   *          否则会拼出 /tag/vv3.0.0 的死链。版本号取不到时退回 Releases 列表，不拼半截 URL。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  get versionReleaseUrl(): string {
    const v = String(this.pkgVersion || '').trim()
    if (!v) return `${this.repoUrl}/releases`
    return `${this.repoUrl}/releases/tag/${/^v/i.test(v) ? v : 'v' + v}`
  }

  /**
   * 打开「当前版本」的 GitHub Release 页面（关于区版本号点击入口）
   * 功能描述：与作者名 / 源码 / 赞助等入口共用 _openExternal() 一条通道。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  openVersionRelease(): void {
    this._openExternal(this.versionReleaseUrl)
  }

  /**
   * 打开作者 GitHub 主页
   * 功能描述：设置页「关于」区的作者名（作者: DD1024z）可点击，点击跳转 https://github.com/10D24D；
   *          走 _openExternal() 统一通道（Electron shell 优先，回落 window.open，都失败则静默）。
   *          注意：用 (click) 而非 <a href>，Electron 渲染进程里 href 会把整页导航走，Tabby 设置页会白屏。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  openAuthorProfile(): void {
    this._openExternal(this.authorProfileUrl)
  }

  /**
   * 统一的外链打开通道（关于区 / 意见反馈 / 赞助等所有出口都走这里）
   * 功能描述：优先 Electron shell.openExternal（交给系统默认浏览器打开，不占渲染进程窗口）；
   *          非 Electron 环境回落 window.open；两者都失败则静默 —— 外链打不开不该把设置页搞崩。
   *          ⛔ 新增入口只需一行 _openExternal(url)，别再各自复制一份 try/catch（此前已有 5 份副本）。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  private _openExternal(url: string): void {
    try {
      ;(window as any).require('electron').shell.openExternal(url)
    } catch {
      try { window.open(url, '_blank') } catch { /* ignore */ }
    }
  }

  openGithub(): void {
    this._openExternal(this.repoUrl)
  }

  /** ★ 2026-08-25：打开 NPM 包页面（关于信息-GitHub 源码右侧新增链接） */
  openNpm(): void {
    this._openExternal('https://www.npmjs.com/package/tabby-sftp-plus')
  }

  /**
   * 打开 ko-fi 赞助页（关于信息-「请喝咖啡」链接）
   * 功能描述：与 openGithub / openNpm 相同的外部打开通道（现已收口到 _openExternal）。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-22
   */
  openKofi(): void {
    this._openExternal('https://ko-fi.com/dd1024z')
  }

  /**
   * 「报告问题」入口：预填环境信息后打开「缺陷报告」issue 表单（按界面语言路由中/英模板）
   *   机制：GitHub issue forms 的字段 `id` 就是 URL query 参数名（官方文档：id 是 URL query
   *        parameter prefills 的规范标识），配合 ?template=<模板文件> 使用即可自动填好环境信息。
   *   注意：本仓库 config.yml 已关闭 blank_issues_enabled，故不能用 ?body= 空白编辑器方案。
   */
  openBugReport(): void {
    this._openIssue('bug')
  }

  /**
   * 「提出需求」入口：预填环境信息后打开「功能需求」issue 表单（按界面语言路由中/英模板）
   */
  openFeatureRequest(): void {
    this._openIssue('feature')
  }

  /** 统一打开 issue 表单：kind=bug 走缺陷报告模板，kind=feature 走功能需求模板；任一异常都回退为纯新建页 */
  private _openIssue(kind: 'bug' | 'feature'): void {
    this._openExternal(this._buildIssueUrl(kind))
  }

  /**
   * 组装 issue 表单 URL（template + 字段预填）；任何异常都回退为纯新建页，绝不阻塞反馈入口
   *
   * ★ 模板按界面语言路由 —— 中文用 bug_report.yml / feature_request.yml，其余语言用对应 _en 版。
   *   两份语言模板的**字段 id 完全一致**，故这套预填参数在两种语言下通用，不需要分叉。
   *   template 参数放在 try 之外，保证预填失败时用户仍落到正确语言的那份表单。
   */
  private _buildIssueUrl(kind: 'bug' | 'feature'): string {
    const zh = this._isChinese()
    const template = kind === 'bug'
      ? (zh ? 'bug_report.yml' : 'bug_report_en.yml')
      : (zh ? 'feature_request.yml' : 'feature_request_en.yml')
    const base = `${this.repoUrl}/issues/new?template=${template}`
    try {
      const params: string[] = []
      const add = (key: string, value: string): void => {
        if (value) params.push(`${key}=${encodeURIComponent(value)}`)
      }
      add('os_version', this._platformLabel())
      add('tabby_version', this._safeStr(() => this.platformService?.getAppVersion?.(), ''))
      add('sftp_plus_version', this.pkgVersion)
      add('tabby_frontend', this._safeStr(() => this.configService?.store?.terminal?.frontend, ''))
      add('installed_plugins', this._pluginsLabel())
      // base 里已带 ?template=…，预填参数一律用 & 追加
      return params.length ? `${base}&${params.join('&')}` : base
    } catch {
      return base
    }
  }

  /**
   * 界面语言是否为中文 —— 决定意见反馈用哪份 issue 模板
   * 依据 effectiveLang（显式设置优先，Auto 时按系统语言），故中文用户默认拿到中文表单；
   * 取不到时按英文处理（对非中文用户更通用）
   */
  private _isChinese(): boolean {
    try {
      return String(this.effectiveLang || '').toLowerCase().startsWith('zh')
    } catch {
      return false
    }
  }

  /**
   * 平台描述：系统市场版本名 + 精确版本号 + CPU 架构，如 `Windows 11 25H2 (build 26200, x64)`
   *
   * ★ 修复「Windows 版本取不准」：PlatformService.getOSRelease() 底层就是 Node 的 os.release()，
   *   而 Windows 11 沿用 NT 10.0 内核号（本机实测 = `Windows 10.0.26200`），
   *   旧写法把内核号原样透出 → issue 里显示 "Windows 10.0.26200"，用户实机却是 Win11。
   *   现改为按 build 号反查市场版本名：≥22000 判为 Windows 11，并用 WINDOWS_BUILD_RELEASES 定位 21H2/25H2 等代号。
   * 隐私红线：仅取系统版本与 CPU 架构，不采集主机名、用户名、文件路径、服务器地址、书签/Profile 名称等敏感字段
   */
  private _platformLabel(): string {
    const host = this._safeStr(() => this.hostApp?.platform, '')
    const arch = (typeof process !== 'undefined' && (process as any)?.arch) ? String((process as any).arch) : ''
    const raw = this._safeStr(() => this.platformService?.getOSRelease?.(), '')
    // getOSRelease() 形如 `Windows 10.0.26200`，剥掉自带平台名前缀，避免拼出「Windows Windows」
    const ver = raw.replace(/^(Windows|macOS|Linux|Darwin)\s+/i, '').trim()

    const build = this._windowsBuild(ver)
    if (build != null) {
      // Server 与客户端常共用同一 build（如 17763 = Win10 1809 / Server 2019），只能靠产品名区分
      if (/server/i.test(this._osProductName())) {
        return this._platformTail('Windows Server', `build ${build}`, arch)
      }
      const release = this._windowsReleaseName(build)
      const name = `Windows ${build >= 22000 ? 11 : 10}${release ? ` ${release}` : ''}`
      return this._platformTail(name, `build ${build}`, arch)
    }

    // macOS：给的是 Darwin 内核号，按主版本映射回市场版本；主版本 < 18 视为已是市场版本，不干预
    const darwin = /^(\d+)\.(\d+)/.exec(ver)
    if (darwin && Number(darwin[1]) >= 18) {
      const mac = MACOS_BY_DARWIN[Number(darwin[1])]
      return this._platformTail(mac ? `macOS ${mac}` : 'macOS', `Darwin ${ver}`, arch)
    }

    // 其他（Linux 等）：平台名 + 原始内核/系统版本
    return this._platformTail(host || 'unknown', ver || undefined, arch)
  }

  /** 从内核版本号 `10.0.26200` 取 build 号；Windows 自 Vista 起统一为 10.0.<build> 格式 */
  private _windowsBuild(ver: string): number | null {
    const m = /^10\.0\.(\d+)(?:\.|$)/.exec(ver || '')
    return m ? Number(m[1]) : null
  }

  /** build 号 → Windows 市场版本代号（26200 → 25H2）；超出已知表返回空串，不猜 */
  private _windowsReleaseName(build: number): string {
    let name = ''
    for (const [b, n] of WINDOWS_BUILD_RELEASES) {
      if (build >= b) name = n
      else break
    }
    return name
  }

  /**
   * 本机系统产品名（best-effort），Windows 下形如 `Windows 11 Pro` / `Windows Server 2025 Standard`
   * 仅用于区分 Server 版；renderer 无 require('os') 或取不到时返回空串，不影响主流程
   */
  private _osProductName(): string {
    try {
      const req = (typeof window !== 'undefined') ? (window as any).require : null
      return String(req ? req('os')?.version?.() ?? '' : '')
    } catch { return '' }
  }

  /** 拼装 `名称 (细节, 架构)`，空项自动略过；名称缺失时回退 unknown */
  private _platformTail(name: string, detail?: string, arch?: string): string {
    const extras = [detail, arch].filter(x => !!x && x !== 'unknown') as string[]
    return extras.length ? `${name || 'unknown'} (${extras.join(', ')})` : (name || 'unknown')
  }

  /** 已安装的非内置插件列表（name@version），便于作者判断插件组合冲突 */
  private _pluginsLabel(): string {
    try {
      const list = (this.bootstrapData?.installedPlugins || []).filter((p: any) => p && !p.isBuiltin)
      const names = list
        .map((p: any) => (p.version ? `${p.name}@${p.version}` : String(p.name || '')))
        .filter(Boolean)
      return names.join(', ') || 'none'
    } catch { return '' }
  }

  /** 安全读取：服务未注入/取值抛错时返回兜底值，绝不让反馈入口本身崩掉 */
  private _safeStr(fn: () => any, fallback = 'unknown'): string {
    try {
      const v = fn()
      return (v === undefined || v === null || v === '') ? fallback : String(v)
    } catch { return fallback }
  }

  /**
   * ★ 2026-10-19 P1（audit）：把导入数据镜像到 localStorage。
   *   只镜像「正常保存路径也会写 localStorage」的那些键（见 saveTableSettings / _saveToConfig），
   *   保证「导入」与「用户在设置页手改并保存」落到完全相同的数据集，不再出现面板与设置页分叉。
   *   每个键独立 try/catch：单个键写失败（配额/隐私模式）不能中断整次导入。
   */
  private _mirrorImportedToLocalStorage(data: Record<string, any>): void {
    const setLS = (key: string, value: any): void => {
      try { localStorage.setItem(key, JSON.stringify(value)) } catch (e) { log.warn('mirror imported key failed:', key, e) }
    }
    // ① 表格样式：面板 loadTableSettings() 只读 TABLE_SETTINGS_KEY.*
    if (data.tableColBorders !== undefined) setLS(`${TABLE_SETTINGS_KEY}.colBorders`, !!data.tableColBorders)
    if (data.tableZebra !== undefined) setLS(`${TABLE_SETTINGS_KEY}.zebra`, !!data.tableZebra)
    // ② 自定义配色：面板/设置页在 theme === 'custom' 时改从 PREFIX.primaryColor 等读取，
    //    不镜像会被旧色吞并并在下一次保存时反向写回 config（导入的配色永久丢失）
    if (data.theme === 'custom') {
      if (typeof data.colorPrimary === 'string' && data.colorPrimary) {
        setLS(`${PREFIX}.primaryColor`, data.colorPrimary)
        if (typeof data.colorBg === 'string') setLS(`${PREFIX}.bgColor`, data.colorBg)
        if (typeof data.colorText === 'string') setLS(`${PREFIX}.textColor`, data.colorText)
        if (typeof data.colorBorder === 'string') setLS(`${PREFIX}.borderColor`, data.colorBorder)
      }
    }
  }

  /** 转换旧版 prefixed localStorage 格式到新版扁平字段 */
  private _convertOldPrefixedFormat(old: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {}
    const map: Record<string, string> = {
      'sftp-plus-settings.lang': 'lang',
      'sftp-plus-settings.theme': 'theme',
      'sftp-plus-settings.layoutMode': 'layoutMode',
      'sftp-plus-settings.primaryColor': 'colorPrimary',
      'sftp-plus-settings.bgColor': 'colorBg',
      'sftp-plus-settings.textColor': 'colorText',
      'sftp-plus-settings.paneCustomOrder': 'paneCustomOrder',
      'sftp-plus-settings.surfaceColor': 'colorSurface',
      'sftp-plus-settings.borderColor': 'colorBorder',
      'sftp-plus-settings.customPrimaryColor': 'customPrimaryColor',
      'sftp-plus-settings.customBgColor': 'customBgColor',
      'sftp-plus-settings.customTextColor': 'customTextColor',
      'sftp-plus-settings.customBorderColor': 'customBorderColor',
      'sftp-plus-settings.customMutedColor': 'customMutedColor',
      'sftp-plus-layout-mode': 'layoutMode',
      'sftp-plus-table.colBorders': 'tableColBorders',
      'sftp-plus-table.zebra': 'tableZebra',
    }
    for (const [oldKey, newKey] of Object.entries(map)) {
      if (old[oldKey] !== undefined) out[newKey] = old[oldKey]
    }
    // 书签
    if (old['sftp-plus-bookmarks-v2']) out.bookmarks = old['sftp-plus-bookmarks-v2']
    // 传输日志（兼容两种旧版 key：sftp-plus-transfer-log / sftp-plus-transfer-logs）
    if (old['sftp-plus-transfer-logs']) out.transferLogs = old['sftp-plus-transfer-logs']
    else if (old['sftp-plus-transfer-log']) out.transferLogs = old['sftp-plus-transfer-log']
    return out
  }
}

@Injectable()
export class SftpSettingsTabProvider extends SettingsTabProvider {
  id = SFTP_PLUS_SETTINGS_TAB_ID
  icon = 'folder-open'
  title = 'SFTP+'

  getComponentType(): any {
    return SftpSettingsTabComponent
  }

  async getSettingsTabs(): Promise<Array<{
    title: string
    icon?: string
    weight?: number
    component: any
  }>> {
    return [
      {
        title: 'SFTP+',
        icon: 'folder-open',
        weight: 99,
        component: SftpSettingsTabComponent,
      },
    ]
  }
}

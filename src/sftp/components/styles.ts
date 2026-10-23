/** SFTP+ 面板样式（合并自 panel-main-styles + file-dialog-shared-styles）
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-20 — 分组模式斑马纹启用：改用 .entry.zebra（组内序号偶数位，每组首条带）替代被组头打乱的 nth-child；单条分组也可见斑马色。nth-child 规则限定 .pane-list:not(.has-groups)，避免与 .zebra 互补覆盖导致整组同色。
 *             2026-10-19 — .sftp-root 增加 opacity: var(--_panel-opacity, 1)（设置页「面板透明度」，0.5–1）。
 *             新增 .pane-label-caret（可点端点标识的 ▾ 角标，is-open 时翻转）。
 *             2026-10-19 全量审计 P2-36 / P2-37 / P2-38：
 *              P2-36 清除本文件里「已抽成组件」的对话框残留规则（delete / bookmark / ctx / details 四组），
 *              只删已确证在对应组件 styles 里有同名规则的类；
 *              P2-37 .sftp-overlays .overlay 不再写死 z-index:100 —— 该选择器 (0,3,0) 恒压掉对话框组件
 *              自声明的层级 (0,2,0)，组件里写的 z-index（查看/编辑对话框 110）永远不生效；
 *              P2-38 conn-identity / conn-opt / add-btn 三个 active 修饰类补 .active:hover 同参规则，
 *              不再靠源码顺序与 :hover 打平决胜。
 * 修改情况：
 *   - 2026-10-20 (Deepseek-V4.1-Flash)：连接选择器补 .conn-opt.dead —— 已被关掉的那个连接在候选列表里
 *             以「已断开」占位行出现（与顶栏显示对齐、不可点选）；同时显式盖回 :disabled 的 UA 灰化
 *             （opacity:1），否则整行淡到看不清。
 *   - 2026-10-20 (Deepseek-V4.1-Flash)：连接状态内联进顶栏连接分段 —— 新增 .conn-seg-label（承接省略号，
 *             分段容器是 inline-flex，容器上的 text-overflow 对子元素文本无效）、.conn-dot / .conn-dot--busy
 *             （7px 闪烁红点，busy 为主题色）、.conn-retry（16px 重连图标按钮）；删除整套
 *             .disconnect-indicator / .disconnect-dot / .disconnect-tag 规则（对应徽标已移除）。
 *   - 2026-10-18 (Hy3)：issue #27 P3：顶栏连接地址与 SFTP+ 标题基线对齐（标题镜像 .conn-seg 的 1px 内边距+1px 透明边框）；↔ 两侧间距改为「分段 6px 内边距 + 分隔符 4px 外边距」对称构成；连接标签全角括号改半角。
 *   - 2026-10-14 (Deepseek-V4.1-Flash)：新增 .file-dialog-hint；窄面板修复 / 查看器编辑器长行 / 顶栏 ✕ 蓝圈等历史修复（原文见下）。
 *              （历史原文）新增 `.file-dialog-hint`（对话框底部按钮行上方的单行提示，
 *              用于查看器「文件过大：仅选中当前屏幕内容」）。顺带说明：上方 ⑫ 条目里
 *              「.disconnect-indicator 维持 flex-shrink:0」已被 2026-10-13 的窄面板修复**取代**——
 *              该指示器现为可压缩项（flex:0 1 auto + min-width:0，由 .disconnect-tag 承担省略），
 *              以保证断开态下关闭/最大化按钮永不被裁。
 *              2026-10-13 — 2026-10-13 全量审计第二批修复（查看器/编辑器开关与长行显示）：
 *              ⑭ `.file-dialog-vs-window` 补 `width:max-content; min-width:100%`，并去掉
 *                  `.file-dialog-vs-text` 的 `overflow:hidden; text-overflow:ellipsis`——
 *                  查看器长行「省略号截断、横向滚不动」的根因：window 是 `left:0;right:0`
 *                  （宽恒等于视口）+ 文本层 ellipsis 两层叠加，`.file-dialog-vs` 的
 *                  `overflow:auto` 因没有超宽内容而永不产生横向滚动。组件注释（2026-09-26）
 *                  声称的配套修改当时并未落地。换行模式行宽受 packRows 预切行约束，不依赖 ellipsis。
 *              ⑮ 新增 `.file-dialog-editor-wrap .file-dialog-textarea.is-soft-wrap`——编辑器
 *                  「自动换行」开关此前**全仓无对应 CSS 规则**（模板加类无任何样式响应），
 *                  且被上方 (0,2,0) 的 `white-space:pre` 与静态 `wrap="off"` 双重锁死。
 *                  新规则特异性 (0,3,0) 胜出。
 *              2026-09-30 — ⑬ 顶栏 ✕ 的「蓝色光圈」根治，三处并改：
 *                 ① 模板给 .btn-close 加 mousedown preventDefault —— 鼠标点按不再让按钮获得焦点
 *                 （焦点正是那个环的成因：它是聚焦态画的、松开鼠标后仍残留），click 行为不变；
 *                 ② 图标按钮的聚焦态收口由 :focus / :focus-visible 扩到 :active，并补
 *                 box-shadow:none !important 与 -webkit-tap-highlight-color:transparent
 *                 （堵住非 outline 机制的聚焦环）；
 *                 ③ .sftp-main 改 overflow:clip + overflow-clip-margin:4px —— 聚焦环画在按钮盒
 *                 外侧 3~4px，而 .sftp-main 的裁切边界正好压在顶栏上沿，导致环的**上边被削平**。
 *                 现象（用户实测）：按下 ✕ 后外圈浮出一圈蓝环、长按后拖开仍残留，且环没有封顶。
 *              ⑫ 顶栏窄面板抗挤压：.title 锁定不收缩（flex-shrink:0 + nowrap）、
 *                 .host-info 改「唯一可压缩项 + 省略号」（flex:0 1 auto / min-width:0 /
 *                 overflow:hidden / text-overflow:ellipsis / white-space:nowrap），.top-actions
 *                 与 .disconnect-indicator 维持 flex-shrink:0。现象：面板拖到最小时顶栏溢出右缘，
 *                 最大化按钮只剩一半、关闭按钮完全不见（实测 ≈374 CSS px 面板需 ≈410 px）。
 *              ⑪ 工具栏图标按钮禁用浏览器原生聚焦环（.pane-toolbar-btn / .filter-btn 的
 *                 :focus / :focus-visible → outline:none !important）：点击按钮后再按方向键会触发
 *                 Chromium 的 :focus-visible，画出 2px 强调色（#E59700）圆角环，非本项目样式、很突兀。
 *              ⑩ 分组头行宽度对齐（缺口根治）：.entry.group-row 由 display:flex 改回 grid
 *                 （列模板由 file-pane 的 [style.gridTemplateColumns]="colWidths" 绑定，与条目行同一份），
 *                 padding 由 0 8px 0 2px 改为 0 8px、不再声明 gap（继承 .entry 的 4px），
 *                 内容收进新的 .group-inner（跨全部列 + margin-left:-6px 让箭头仍贴行首）。
 *                 根因与取舍详见块内注释：条目行 width:max-content 会随列宽合计溢出面板内容宽，
 *                 分组头没有列模板时宽度只剩 min-width:100%，两者相差「列宽合计 − 面板内容宽」，
 *                 整组选中时分组头右上角露出缺口（用户实测：远程面板显形，本地面板加宽列 5px 同样显形）。
 *              2026-09-29 — ⑨ 自绘光标 .file-dialog-vs-caret 支持三种形状：宽高与竖直位置改由组件按形状
 *                 内联给出（CSS 里的 2×18 只剩兜底作用），并新增 .is-block（mix-blend-mode:difference
 *                 —— 方块光标要的是终端那种**反色**效果，直接铺实心色会把字符盖掉）
 *              ⑧ 链接角标 .link-badge 上移 2px（bottom -1px 改 1px）：用户截图反馈
 *                 「快捷方式的图标超出行高」。实测口径（行高 30px 的列表行）：bottom:-1px 时角标
 *                 **可见底边落在 y=509**，而该行行框下沿 y=508 ⇒ 角标越出行框 1px，且其圆心比同行
 *                 emoji 图标中心低 8px（角标外形 14px，比 emoji 墨迹的 11px 还大，故必然向下探）。
 *                 改为 1px 后底边回到 507（收在框内 1px）。⚠ 只挪角标：emoji 图标本体每行都精确居中
 *                 （墨迹中心 = 行框中心，实测逐行相等），动它会破掉图标列的整列对齐。
 *              ⑦ 新增分组头「部分选中」态 .entry.group-row.partial（主色 40% 半透明底 +
 *                 子 span 转正文色）：配合 file-pane 的 groupSelState()——分组头「选中」高亮改为按
 *                 组内选中比例判定（整组选中 = 原 .selected 77% 实底；部分选中 = 新的 .partial
 *                 弱化表达），取消原先「组内 ≥2 项 / 列表全选」的条目数门槛
 *              ⑥ 新增键盘游标 .entry.nav-focus（左侧 3px 主色竖条 + 未选中时轻底色）：
 *                 把方向键的「停留位置」与「已选中」拆成两套视觉语义，解决单条目分组里
 *                 游标停在表头时屏幕无任何变化的问题（详见样式块内注释）
 *              文件列表分组样式收口：
 *              ① 行高统一：分组头（.entry.header.group-row）自身竖直 padding 归零、子 span padding 2px→3px
 *                 （与内容行一致）；图标 .icon 行框固定 line-height:1，消除 emoji 图标（📁/📄）撑出 1.512em
 *                 行框、使"用 emoji 图标的行"整体偏高的问题 → 全列表行高一致；
 *              ② 分组模式取消行间距：has-groups 下条目 / 组头 margin 归零，选中高亮连成整块（不再被缝隙切成一段段）；
 *              ③ 分组头去背景、仅作加粗分隔；hover 轻高亮（与条目一致、文字转正文色）；
 *                 收展箭头贴行首（分组头 padding-left 8→2px、chevron 14→12px）；
 *              ④ 斑马纹 nth-child 在分组模式奇偶被分组头打乱 → has-groups 下整体禁用；
 *              ⑤ 文件图标右移贴近文件名：.icon 由列内居中改为靠右（justify-self:end）且宽度收缩为
 *                 max-content（图标盒=图标本身宽，链接角标继续贴住图标），图标到文件名仅剩列间 gap 4px；
 *                 同日修订（回归修复）：.icon 命中 `.entry > span` 的 contain:inline-size + overflow:hidden，
 *                 会把 max-content 解析为 0 致图标被裁掉不显示 → 以 `.entry > span.icon`（更高特异性）覆盖为
 *                 contain:none / overflow:visible
 *              2026-09-20 — 编辑器行号栏样式；查看器插入光标/行号可配置
 *              2026-09-20 — 查看器插入光标略加粗（2px）
 *              2026-09-20 — 查看器插入光标自绘；行号与正文间距加大
 *              2026-09-20 — 行号 gutter 间距加大；查看器恢复 text 鼠标光标
 *              2026-09-20 — 查看器虚拟滚动：inner 撑高 + 行号 gutter，减轻滚时空白
 *              2026-09-17 — 编辑器未保存 * 紧挨文件名；支持 --sftp-font-size / --_fs；修复 .entry 字号
 *              2026-09-20 — 编辑/查看焦点高亮统一（wrap:focus-within）
 */

/* ───────── 主面板样式 ───────── */
export const SFTP_PANEL_STYLES = `
    :host {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
      box-sizing: border-box;
      outline: none !important;
      transition: none !important;
    }
    :host(:focus),
    :host(:focus-visible) {
      outline: none !important;
      box-shadow: none !important;
    }
    /* 注意：--_bg / --_text 等 CSS 变量声明必须在 :host 上，
       否则 .sftp-root 子元素的 CSS 声明会覆盖 _applyAutoTheme() 设置的 inline 样式 */
    /* 优先级：_applyAutoTheme inline → --sftp-* 预设变量 → Tabby 主题变量 → 回退值 */
    :host {
      --_bg: var(--sftp-bg, var(--body-bg, #f9fafb));
      --_text: var(--sftp-text, var(--text-color, #1f2937));
      --_primary: var(--sftp-primary, var(--primary-color, #3b82f6));
      --_border: var(--sftp-border, var(--border-color, #e5e7eb));
      --_content: var(--sftp-content, var(--_bg));
      --_fs: var(--sftp-font-size, 13px);
      --_surface: rgba(128, 128, 128, 0.06);
      --_hover: rgba(128, 128, 128, 0.12);
      --_active: rgba(128, 128, 128, 0.18);
      --_input-bg: rgba(128, 128, 128, 0.06);
      /* 滚动条变量：light 模式为浅灰，dark 模式会被 _applyAutoTheme inline 覆盖 */
      --_scroll-track: rgba(128, 128, 128, 0.06);
      --_scroll-thumb: rgba(128, 128, 128, 0.28);
      --_scroll-thumb-hover: rgba(128, 128, 128, 0.45);
    }

    .sftp-root {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      height: 100%;
      width: 100%;
      min-width: 0;
      padding: 8px;
      gap: 0;
      position: relative;
      background: var(--_bg);
      /* ★ 2026-10-19（Deepseek-V4.1-Flash）：面板整体透明度由设置页写入 --_panel-opacity（0.5–1）。
         下限 50% 保证内容可读；无变量时退回 1（历史行为）。 */
      opacity: var(--_panel-opacity, 1);
      color: var(--_text);
      font-size: var(--_fs);
      font-family: var(--font-family, 'Segoe UI', sans-serif);
      box-sizing: border-box;
      pointer-events: auto;
      outline: none;
      border: 1px solid var(--_border);
      border-radius: 10px;
      transition: none !important;
      animation: none !important;
    }
    .sftp-root.workspace-mode {
      padding: 0;
      border-radius: 0;
      border: none;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      height: 100%;
      width: 100%;
    }
    .sftp-root.workspace-mode .sftp-main {
      border-radius: 0;
      flex: 1 1 auto;
      min-height: 0;
    }
    .sftp-root.workspace-mode .sftp-body {
      border-radius: 0;
      flex: 1 1 auto;
      min-height: 0;
    }
    sftp-plus-workspace-tab {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    sftp-plus-workspace-tab .sftp-workspace-tab,
    sftp-plus-workspace-tab sftp-plus-panel {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .sftp-root .sftp-toast {
      position: absolute;
      /* ★ 2026-10-19（Deepseek-V4.1-Flash）：原来贴顶居中（top:10px），而顶栏右上角是操作按钮组，
         长提示（如「面板过窄…已临时改为上下布局」）会整条压住那排按钮，用户没法点。
         改为贴底居中：底部只有非交互的状态行/列表，不挡任何操作入口。 */
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 200010;
      max-width: min(92%, 560px);
      padding: 6px 14px;
      border-radius: 6px;
      background: var(--_bg);
      border: 1px solid var(--_border);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
      font-size: 12px;
      color: var(--_text);
      white-space: normal;
      line-height: 1.4;
      text-align: center;
      pointer-events: auto;
      cursor: default;
      animation: sftp-toast-in 0.18s ease-out;
    }
    @keyframes sftp-toast-in {
      from { opacity: 0; transform: translateX(-50%) translateY(6px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    /* 主内容区：标题栏 + 双栏 + 传输队列，独占剩余高度 */
    .sftp-root .sftp-main {
      flex: 1 1 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      /* ★ 2026-09-30（⑬）：裁切区域外扩 4px —— 让顶栏按钮的聚焦环有地方画。
         现象：顶栏 ✕ 聚焦时浮出的圆角环画在按钮盒外侧 3~4px，而 .sftp-main 的 padding box
         上沿正好压在按钮上沿（顶栏是它的第一个子元素、padding-top 为 0）⇒ 环的**上边被削平**，
         呈现「没有封顶的光圈」（用户实测）。overflow:clip + overflow-clip-margin 既保住裁切
         （外扩 4px 仍落在 .sftp-root 的 8px 内边距之内，不会漏出面板底色），又给聚焦环留出空间。
         不支持 clip 的老内核自然回退到上一行的 overflow:hidden（= 改动前的行为）。 */
      overflow: hidden;
      overflow: clip;
      overflow-clip-margin: 4px;
    }
    /* 浮层容器：绝对定位，不参与 flex 布局，避免撑开双栏 */
    .sftp-root .sftp-overlays {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 100;
      overflow: visible;
    }
    .sftp-root .sftp-overlays > sftp-delete-dialog,
    .sftp-root .sftp-overlays > sftp-input-dialog,
    .sftp-root .sftp-overlays > sftp-cwd-setup-dialog,
    .sftp-root .sftp-overlays > sftp-bookmark-popup,
    .sftp-root .sftp-overlays > sftp-transfer-log-dialog,
    .sftp-root .sftp-overlays > sftp-conflict-dialog,
    .sftp-root .sftp-overlays > sftp-context-menu,
    .sftp-root .sftp-overlays > sftp-perm-dialog,
    .sftp-root .sftp-overlays > sftp-details-dialog {
      position: absolute;
      inset: 0;
      overflow: visible;
      pointer-events: none;
    }
    /* 全屏遮罩对话框：相对浮层容器铺满并居中 */
    /* ★ 2026-10-19 P2-37：本规则原写 z-index:100 —— 选择器 .sftp-root .sftp-overlays .overlay
       特异性 (0,3,0)，恒压过对话框组件自带的 .overlay[_ngcontent-x]（(0,2,0)），
       组件里声明的层级**永远不生效**（查看/编辑对话框走 FILE_DIALOG_SHARED_STYLES 的 110，
       实际被摁成 100），只能靠本文件后面给删除框开特例 120 兜底。
       现去掉这条 z-index：每个对话框的 .overlay 在各自组件里都声明了 z-index
       （delete / input / cwd-setup / details / perm / conflict / transfer-log / dir-missing 均为 100；
       查看器与编辑器走共用样式的 110），层级改由组件自己说了算；
       遮罩整体压在面板内容之上由父级 .sftp-overlays 的 z-index:100 保证，不受影响。 */
    .sftp-root .sftp-overlays .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.6);
      pointer-events: auto;
      transition: none !important;
      animation: none !important;
    }
    .sftp-root .sftp-overlays .bookmark-popup,
    .sftp-root .sftp-overlays .context-menu {
      pointer-events: auto;
    }
    .sftp-root:focus,
    .sftp-root:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
    .sftp-root .top-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0px 5px 5px 5px;
      background: var(--header-bg, var(--_content));
      border-radius: 8px 8px 0 0;
      flex-shrink: 0;
      border-bottom: 1px solid var(--_border);
      position: relative;
    }
    .sftp-root .title { font-weight: 700; color: var(--_primary); font-size: 1.15em; flex-shrink: 0; white-space: nowrap;
      /* ★ issue #27 P3：镜像 .conn-seg 的 1px 上下内边距 + 1px 透明边框。分段有上下内边距/边框而标题没有，
         会使「连接地址」文字相对「SFTP+」标题上移约 1px（用户实测基线不齐）；两者盒模型一致后基线对齐。 */
      padding: 1px 0; border: 1px solid transparent; }
    /* ★ 2026-09-30：.conn-address（原 .host-info）是顶栏里唯一「内容长度不可控」的元素（user@host，长域名 30+ 字符）。
       原先 flex-shrink:0 ⇒ 面板变窄时它一分不让，而右侧 .top-actions 也无法收缩
       （7 个 28px 按钮 + 6 个 2px gap = 208px）⇒ 顶栏整体溢出面板右缘被裁掉，
       最后两个按钮（最大化 / 关闭）直接消失（用户实测：窄面板下 ✕ 完全不见、最大化只剩一半）。
       改为「唯一可压缩项 + 省略号」：先牺牲主机名文字，按钮永不被裁。
       配套：最小宽度已抬到 420px（见 sftp-floating-panel.component.ts 的 _geomMinW）。 */
    /* ★ 2026-10-18 issue #27 P2 收尾：顶栏连接地址（conn-address）控件。
       沿用 .host-info 的「唯一可压缩项 + 省略号」约束，避免窄面板下顶栏右侧按钮被裁。 */
    .sftp-root .conn-address {
      display: inline-flex; align-items: center; gap: 0;
      font-size: 0.92em; opacity: 0.85;
      flex: 0 1 auto; min-width: 0; overflow: hidden; line-height: 1;
    }
    .sftp-root .conn-seg {
      cursor: pointer; user-select: none;
      display: inline-flex; align-items: center; gap: 4px;
      padding: 1px 6px; border-radius: 4px; border: 1px solid transparent;
      min-width: 0; overflow: hidden; white-space: nowrap;
      flex: 0 1 auto; line-height: 1;
    }
    .sftp-root .conn-seg:hover { background: var(--_border); opacity: 1; }
    .sftp-root .conn-seg.active { background: var(--_border); border-color: var(--_primary); opacity: 1; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：唤起方式设为「终端标识」时，顶栏连接标题只显示不再响应点击 */
    .sftp-root .conn-seg.picker-off { cursor: default; }
    .sftp-root .conn-seg.picker-off:hover { background: transparent; }
    .sftp-root .conn-address-single.picker-off { cursor: default; }
    .sftp-root .conn-address-single.picker-off:hover { background: transparent; }
    /* ★ issue #27 P3：↔ 两侧间距完全对称——间距由「分段 6px 内边距 + 此处 4px 外边距」构成，两端相等；
       不再依赖容器 gap（避免与分段内边距叠加导致左右不等），line-height:1 消除行高带来的基线偏差。 */
    .sftp-root .conn-sep { flex-shrink: 0; opacity: 0.6; margin: 0 4px; line-height: 1; }
    .sftp-root .conn-address-single {
      cursor: pointer; user-select: none;
      display: inline-flex; align-items: center; gap: 4px;
      padding: 1px 6px; border-radius: 4px; border: 1px solid transparent;
      font-size: 0.92em; opacity: 0.85;
      flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; line-height: 1;
    }
    .sftp-root .conn-address-single:hover { background: var(--_border); opacity: 1; }
    .sftp-root .conn-address-single.active { background: var(--_border); border-color: var(--_primary); opacity: 1; }
    /* ★ 2026-10-16 issue #27 P1：可点击的连接标识 + 连接选择器 */
    .sftp-root .conn-identity {
      cursor: pointer; user-select: none;
      display: inline-flex; align-items: center; gap: 3px;
      padding: 1px 5px; border-radius: 4px;
      border: 1px solid transparent;
    }
    /* ★ 2026-10-19 P2-38：.conn-identity:hover 与 .conn-identity.active 特异性打平 (0,3,0)，
       只靠源码先后决胜 ⇒ 选中项一被悬停就有丢高亮的风险。补一条 .active:hover（(0,4,0) 更高），
       与同文件 .btn-path-mode.active:hover 的既有写法保持一致。 */
    .sftp-root .conn-identity:hover { opacity: 0.95; background: var(--_border); }
    .sftp-root .conn-identity.active,
    .sftp-root .conn-identity.active:hover { background: var(--_border); border-color: var(--_primary); opacity: 1; }
    /* ★ issue #27 P3：地址栏包裹层（相对定位锚点，承载下沉到地址栏下方的全局选择器浮层） */
    .sftp-root .conn-address-wrap { position: relative; flex: 0 1 auto; min-width: 0; overflow: visible; }
    .sftp-root .conn-picker {
      position: absolute; top: calc(100% - 2px); right: 6px; z-index: 60;
      min-width: 220px; max-width: 320px;
      background: var(--_content); border: 1px solid var(--_border);
      border-radius: 8px; box-shadow: 0 6px 22px rgba(0,0,0,0.28);
      padding: 6px; display: flex; flex-direction: column; gap: 4px;
    }
    /* ★ issue #27 P3：全局唯一选择器浮层——锚定在地址栏正下方（左对齐），覆盖 .conn-picker 的右上对齐 */
    .sftp-root .global-conn-picker {
      top: 100%; left: 0; right: auto;
      max-height: 280px;
    }
    /* ★ 2026-10-20 续二十九（Deepseek-V4.1-Flash，用户反馈「连接选择器的滚动条有点丑，需要对齐」）：
       这里原先只有 overflow-y:auto，走的是 Chromium **默认滚动条**（≈15px 浅灰方块 + 常驻滚动槽），
       在 220~320px 宽的浮层里既吃掉大半可用宽度、又和面板列表 / 书签列表那两套细滚动条完全不同款。
       现补齐项目统一的细滚动条（尺寸与 .bookmark-list 同款 6px；颜色走同一组 --_scroll-* 变量，
       跟随主题与透明面板联动）。scrollbar-gutter:stable 让滚动条出现/消失时条目宽度不跳。 */
    .sftp-root .conn-opt-list {
      display: flex; flex-direction: column; gap: 2px; max-height: 240px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.32)) var(--_scroll-track, rgba(128,128,128,0.06));
      scrollbar-gutter: stable;
      /* gutter 常驻占最右 6px ⇒ 条目右留白会变成 6(浮层 padding)+6 = 12px，
         而左边只有 6px，条目 hover 底色明显偏左。负 margin 把列表盒右缘推进浮层的
         padding 区，滚动条正好落在那 6px 里 ⇒ 条目恢复「左右各 6px」对称，滚动条也贴着右边框。 */
      margin-right: -6px;
    }
    .sftp-root .conn-opt-list::-webkit-scrollbar { width: 6px; height: 6px; }
    .sftp-root .conn-opt-list::-webkit-scrollbar-track {
      background: var(--_scroll-track, rgba(128,128,128,0.06));
      border-radius: 3px;
    }
    .sftp-root .conn-opt-list::-webkit-scrollbar-thumb {
      background: var(--_scroll-thumb, rgba(128,128,128,0.32));
      border-radius: 3px;
      min-height: 24px;
    }
    .sftp-root .conn-opt-list::-webkit-scrollbar-thumb:hover {
      background: var(--_scroll-thumb-hover, rgba(128,128,128,0.5));
    }
    .sftp-root .conn-opt-list::-webkit-scrollbar-thumb:active {
      background: var(--_primary, #4dabff);
    }
    .sftp-root .conn-opt-list::-webkit-scrollbar-corner {
      background: var(--_scroll-track, rgba(128,128,128,0.06));
    }
    /* ★ 2026-10-20 续三十（Deepseek-V4.1-Flash，用户诉求「每个选项的右侧都有一个减号图标按钮」）：
       行布局从 flex-direction:column 改为「左：文本两行（.conn-opt-body）/ 右：关闭减号（.conn-opt-kill）」。
       原 column 布局下图标会被排到第三行，撑高每一条候选。 */
    .sftp-root .conn-opt {
      display: flex; flex-direction: row; align-items: center; gap: 6px;
      text-align: left; padding: 5px 8px; border: 1px solid transparent;
      border-radius: 5px; background: transparent; color: inherit;
      cursor: pointer; font: inherit;
    }
    .sftp-root .conn-opt-body {
      display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
      flex: 1 1 auto; min-width: 0;
    }
    /* 减号：宽度恒占位（悬停显隐时行宽不跳），只有悬停本行 / 键盘聚焦才显形 */
    .sftp-root .conn-opt-kill {
      flex: 0 0 auto;
      display: inline-flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; border-radius: 4px;
      color: rgb(239,68,68);
      opacity: 0; transition: opacity 0.12s, background 0.12s;
      cursor: pointer;
    }
    .sftp-root .conn-opt-kill svg { width: 12px; height: 12px; display: block; }
    .sftp-root .conn-opt:hover .conn-opt-kill,
    .sftp-root .conn-opt-kill:focus-visible { opacity: 1; }
    .sftp-root .conn-opt-kill:hover { background: rgba(239,68,68,0.16); }
    /* ★ 2026-10-19 P2-38：同上（conn-identity）——hover 与 active 打平 (0,3,0) 靠顺序决胜，
       补 .active:hover（(0,4,0)）让当前选中项悬停时仍是蓝底 + 左竖条。 */
    .sftp-root .conn-opt:hover { background: var(--_border); }
    .sftp-root .conn-opt.active,
    .sftp-root .conn-opt.active:hover { border-color: var(--_primary); background: rgba(59,130,246,0.18); box-shadow: inset 2px 0 0 rgba(59,130,246,0.9); }
    /* ★ issue #27 P3：另一栏已选中的连接——弱高亮（淡背景 + 半透明左条），区别于本栏当前选中的强高亮 */
    .sftp-root .conn-opt.other { border-color: rgba(59,130,246,0.45); background: rgba(59,130,246,0.06); box-shadow: inset 2px 0 0 rgba(59,130,246,0.4); }
    /* ★ 2026-10-20：候选列表里的「已断开」占位行（那个连接标签页已被关掉，只剩身份信息）。
       与顶栏分段的断开态同色（#ef4444），不可点、无悬停反馈 —— 它不是可选项，只是让列表与顶栏对齐。
       注意 :disabled 按钮在部分平台上会套用 UA 的 opacity，必须显式盖回来，否则字会灰到看不清。 */
    .sftp-root .conn-opt.dead,
    .sftp-root .conn-opt.dead:hover,
    .sftp-root .conn-opt.dead:disabled {
      color: rgb(239,68,68); opacity: 1; background: transparent;
      border-color: transparent; box-shadow: none; cursor: default;
    }
    .sftp-root .conn-opt.dead .conn-opt-sub { opacity: 0.75; }
    /* ★ 2026-10-20 续二十六：候选里的「配置里有、但没在 Tabby 打开」的连接。
       这类项点下去会先开一个标签页拿会话，用前置「+」表达「尚未连接、点它会新建」，
       文字略降对比度与已打开项区分；仍可点、仍带 hover 反馈。 */
    .sftp-root .conn-opt.unopened .conn-opt-plus { margin-right: 4px; font-weight: 700; opacity: 0.55; }
    .sftp-root .conn-opt.unopened .conn-opt-label { font-weight: 500; opacity: 0.92; }
    /* ★ 续三十：行内减号占掉 22px（16 图标 + 6 gap），长主机名更容易顶破浮层 max-width:320px
       —— 原先文本没有任何截断，超长会直接溢出浮层右缘。两行各自单行省略。 */
    .sftp-root .conn-opt-label {
      font-size: 0.9em; font-weight: 600;
      display: block; max-width: 100%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sftp-root .conn-opt-sub {
      font-size: 0.72em; opacity: 0.6;
      display: block; max-width: 100%;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* ★ 2026-10-20 续三十：原浮层底部的 .conn-opt-disc「断开连接」按钮已移除
       （改为每条连接右侧的 .conn-opt-kill 减号），这里不再保留该规则。 */
    /* ★ 2026-10-20（用户诉求）：连接状态内联进顶栏连接分段 ——「● 远程(user@host) ⟳」。
       取代原先顶栏右侧那条独立的「● 已断开 [重连]」徽标：那玩意一断开就挤占顶栏宽度，
       而且双远程时只能表达「某个连接断了」，无法指出是左栏还是右栏。
       ⛔ 省略号必须由 .conn-seg-label 承担：分段自身是 inline-flex 容器，
         在容器上写 text-overflow:ellipsis 对子元素里的文本不生效（长主机名会溢出）。 */
    .sftp-root .conn-seg-label {
      flex: 0 1 auto; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sftp-root .conn-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #ef4444; flex-shrink: 0;
      animation: pulse-dot 1.5s ease-in-out infinite;
    }
    /* 建立通道中（首次切换 / 重连）：改为主题色慢闪，与「已断开」的红点区分开 */
    .sftp-root .conn-dot--busy {
      background: var(--_primary); opacity: 0.55;
      animation: pulse-dot 1.1s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    /* 断开态：连接名一并泛红，否则 7px 红点在长主机名前面太不起眼 */
    .sftp-root .conn-seg.is-down .conn-seg-label,
    .sftp-root .conn-address-single.is-down .conn-seg-label { color: #ef4444; }
    /* 重连图标按钮：图标本身 14px，但上下各 -1px 外边距把**占位高度**压回 12px（≈0.92em 文本行高），
       否则 16px 的按钮会把连接分段的内容盒从 12px 撑到 16px —— 顶栏（尤其「SFTP+」标题基线）
       会跟着整体位移 4px。溢出那 1px 正好落在分段的 padding 里，不压边框。 */
    .sftp-root .conn-retry {
      flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; margin: -1px 0 -1px 2px; padding: 0;
      border: none; border-radius: 3px; background: transparent;
      color: #ef4444; cursor: pointer; line-height: 1;
    }
    .sftp-root .conn-retry svg { width: 12px; height: 12px; display: block; }
    .sftp-root .conn-retry:hover { background: rgba(239, 68, 68, 0.16); }
    .sftp-root .conn-retry:disabled { opacity: 0.4; cursor: default; background: transparent; }
    .sftp-root .top-actions { display: flex; gap: 2px; align-items: center; margin-left: auto; flex-shrink: 0; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：顶栏 ⋯ 折叠菜单（按钮定制）。
       锚定在 .top-bar（其 position:relative）右下；z-index 高于面板内容但低于 toast（200010）。 */
    .sftp-root .topbar-overflow-menu {
      position: absolute;
      top: calc(100% - 2px);
      right: 6px;
      min-width: 150px;
      padding: 4px;
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 6px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
      z-index: 200005;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    /* ★ 2026-10-23（Deepseek-V4.1-Flash）：每行 = 「执行按钮 + 图钉」，所以行本身从 <button> 改成 div。
       ⛔ 别改回 button：HTML 不允许 button 嵌套 button，浏览器会把图钉拆到行外。 */
    .sftp-root .topbar-overflow-item {
      display: flex;
      align-items: center;
      gap: 2px;
      width: 100%;
      padding: 1px;
      border-radius: 4px;
      color: var(--_text);
      font-size: 12px;
      white-space: nowrap;
    }
    .sftp-root .topbar-overflow-item:hover { background: var(--_hover); }
    .sftp-root .topbar-overflow-item.active { color: var(--_primary); font-weight: 600; }
    /* 行内执行区（点它 = 执行该按钮动作并收起菜单），占据剩余宽度 */
    .sftp-root .topbar-overflow-run {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
      padding: 4px 6px;
      background: none;
      border: none;
      border-radius: 4px;
      color: inherit;
      font-size: 12px;
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      white-space: nowrap;
    }
    /* 行内固定开关：未固定时淡显，已固定时用主色实心（＝这个按钮就在顶栏上）
       ★ 2026-10-23（Deepseek-V4.1-Flash）：20px/12px 图标实测「太小、太淡」（用户截图反馈），
       放大到 26px 按钮 / 17px 图标（用户两次反馈后才定），未固定态不透明度 .4 → .55。
       行高仍由文字撑（约 26px ⇒ 26px 按钮时行高 28px，菜单整体只高几像素）。
       ★ 同日再改：未固定的斜杠改成**图标自带的 SVG**（tbPinOff），这里不再用 CSS 叠线。 */
    .sftp-root .topbar-overflow-pin {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      flex: none;
      background: none;
      border: none;
      border-radius: 5px;
      color: var(--_text);
      opacity: 0.55;
      cursor: pointer;
      transition: opacity 0.15s, background 0.15s;
    }
    .sftp-root .topbar-overflow-pin:hover { opacity: 0.9; background: rgba(128, 128, 128, 0.14); }
    .sftp-root .topbar-overflow-pin.pinned { opacity: 1; color: var(--_primary); }
    .sftp-root .topbar-overflow-pin svg { width: 17px; height: 17px; display: block; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：菜单项图标与顶栏同一份 SVG（tbIcon*），此处只管尺寸与对齐 */
    .sftp-root .topbar-overflow-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      flex: none;
      opacity: 0.8;
    }
    .sftp-root .topbar-overflow-icon svg { width: 14px; height: 14px; }
    .sftp-root .topbar-overflow-label { flex: 1; }
    .sftp-root .btn-link {
      background: none; border: none; color: var(--_text);
      cursor: pointer; border-radius: 4px;
      transition: background 0.15s, opacity 0.15s;
    }
    .sftp-root .btn-link:hover { background: var(--_hover); }
    /* 顶部工具栏图标按钮：统一尺寸与对齐 */
    .sftp-root .top-actions .btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      min-width: 28px;
      padding: 0;
      opacity: 0.65;
      line-height: 0;
      box-sizing: border-box;
    }
    .sftp-root .top-actions .btn-icon svg {
      width: 16px;
      height: 16px;
      display: block;
      flex-shrink: 0;
    }
    .sftp-root .top-actions .btn-path-mode svg,
    .sftp-root .top-actions .btn-settings svg {
      width: 17px;
      height: 17px;
    }
    .sftp-root .top-actions .btn-icon:hover { opacity: 1; }
    .sftp-root .top-actions .btn-path-mode:not(.active) { opacity: 0.5; }
    .sftp-root .top-actions .btn-path-mode.active,
    .sftp-root .top-actions .btn-transfer-log.active {
      opacity: 1;
      background: transparent;
    }
    .sftp-root .top-actions .btn-path-mode.active:hover,
    .sftp-root .top-actions .btn-transfer-log.active:hover {
      background: var(--_hover);
    }
    .sftp-root .top-actions .btn-minimize,
    .sftp-root .top-actions .btn-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      min-width: 28px;
      padding: 0;
      box-sizing: border-box;
    }
    .sftp-root .btn-close {
      background: none; border: none; color: var(--_text, var(--text-color, #888));
      cursor: pointer; font-size: 15px; border-radius: 4px;
      line-height: 1;
    }
    .sftp-root .btn-close:hover { background: rgba(244,67,54,0.12); color: #f44336; }

    /* ===== 标题栏右键菜单：还原默认面板大小 ===== */
    .sftp-root .sftp-title-menu {
      position: fixed;
      z-index: 901;
      min-width: 176px;
      padding: 4px;
      background: var(--context-menu-background, #2b2b2b);
      color: var(--context-menu-foreground, #e0e0e0);
      border: 1px solid var(--border-color, rgba(255,255,255,0.12));
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      font-size: 12px;
      user-select: none;
    }
    .sftp-root .sftp-title-menu__item {
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      white-space: nowrap;
    }
    .sftp-root .sftp-title-menu__item:hover {
      background: var(--border-color, rgba(255,255,255,0.1));
    }

    /* ===== 浮动面板几何：拖拽移动 / 缩放 / 最大化（仅非 workspace 模式） ===== */
    .sftp-root:not(.workspace-mode) .top-bar { cursor: move; }
    .sftp-root:not(.workspace-mode) .top-bar button,
    .sftp-root:not(.workspace-mode) .top-bar a,
    .sftp-root:not(.workspace-mode) .top-bar .conn-retry { cursor: pointer; }
    .sftp-root:not(.workspace-mode).dragging,
    .sftp-root:not(.workspace-mode).resizing { user-select: none; }
    .sftp-root:not(.workspace-mode).dragging .sftp-main { cursor: move; }
    .sftp-root:not(.workspace-mode).resizing .sftp-main { cursor: nwse-resize; }

    /* 缩放手柄层：铺满面板，仅手柄自身捕获鼠标 */
    .sftp-root:not(.workspace-mode) .resize-layer {
      position: absolute; inset: 0; z-index: 50; pointer-events: none;
    }
    .sftp-root:not(.workspace-mode) .resize-handle { position: absolute; pointer-events: auto; }
    .sftp-root:not(.workspace-mode) .rh-n  { top: 0; left: 8px; right: 8px; height: 5px; cursor: ns-resize; }
    .sftp-root:not(.workspace-mode) .rh-s  { bottom: 0; left: 8px; right: 8px; height: 5px; cursor: ns-resize; }
    .sftp-root:not(.workspace-mode) .rh-e  { right: 0; top: 8px; bottom: 8px; width: 5px; cursor: ew-resize; }
    .sftp-root:not(.workspace-mode) .rh-w  { left: 0; top: 8px; bottom: 8px; width: 5px; cursor: ew-resize; }
    .sftp-root:not(.workspace-mode) .rh-ne { top: 0; right: 0; width: 14px; height: 14px; cursor: nesw-resize; }
    .sftp-root:not(.workspace-mode) .rh-nw { top: 0; left: 0; width: 14px; height: 14px; cursor: nwse-resize; }
    .sftp-root:not(.workspace-mode) .rh-se { bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; }
    .sftp-root:not(.workspace-mode) .rh-sw { bottom: 0; left: 0; width: 14px; height: 14px; cursor: nesw-resize; }
    .sftp-root:not(.workspace-mode) .rh-se::after {
      content: ''; position: absolute; right: 3px; bottom: 3px; width: 9px; height: 9px;
      border-right: 2px solid var(--_border); border-bottom: 2px solid var(--_border); opacity: 0.55;
    }
    .sftp-root:not(.workspace-mode) .resize-handle:hover { background: rgba(128,128,128,0.10); }

  .sftp-root .sftp-body {
      display: flex;
      flex-direction: row;
      gap: 0;
      flex: 1 1 0;
      min-height: 0;
      min-width: 0;
      overflow: hidden;
      border-radius: 8px;
      transition: none !important;
    }
    /* 面板分割线（左右布局时为竖线，上下布局时为横线） */
    .sftp-root .pane-splitter {
      flex-shrink: 0;
      width: 5px;
      cursor: ew-resize;
      background: var(--_bg, var(--body-bg, #1e1e2e));
      position: relative;
      z-index: 10;
      transition: none;
    }
    .sftp-root .pane-splitter:hover,
    .sftp-root .pane-splitter.active {
      background: var(--_bg, var(--body-bg, #1e1e2e));
    }
    .sftp-root .pane-splitter::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 3px;
      height: 30px;
      border-radius: 2px;
      background: var(--_primary, #3b82f6);
      opacity: 0;
      transition: opacity 0.15s;
    }
    .sftp-root .pane-splitter:hover::after,
    .sftp-root .pane-splitter.active::after {
      opacity: 1;
    }

    /* 窄屏支撑：flex-direction 由 JS _applyPaneSplit 动态设置 */
    /* 子组件 sftp-file-pane 作为 flex 子项参与双栏布局 */
    .sftp-root .sftp-body > sftp-file-pane {
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-self: stretch;
    }
    .sftp-root sftp-file-pane .pane {
      flex: 1 1 auto;
      min-height: 0;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }
    /* 分割线样式由 JS class 控制，避免 CSS @media 使用视口宽度与元素宽度不同步 */
    .sftp-root .btn-layout { position: relative; }
    .sftp-root .btn-layout.layout-overridden {
      color: var(--_primary, #3b82f6);
      opacity: 0.95;
    }
    .sftp-root .btn-layout.layout-overridden::after {
      content: '';
      position: absolute;
      right: 1px; bottom: 1px;
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--_primary, #3b82f6);
      pointer-events: none;
    }
    .sftp-root .sftp-body.narrow-layout .pane-splitter {
      width: auto;
      height: 5px;
      cursor: ns-resize;
    }
    .sftp-root .sftp-body.narrow-layout .pane-splitter::after {
      width: 30px;
      height: 3px;
    }
    .sftp-root .pane {
      display: flex;
      flex-direction: column;
      position: relative;
      border: 1px solid var(--_border);
      border-radius: 8px;
      /* 不用 overflow:hidden，避免裁切子元素滚动条；border-radius 裁剪由各子元素自行处理 */
      min-height: 0;
      min-width: 0;
      transform: translateZ(0);
      transition: none !important;
    }
    .sftp-root .pane-title {
      display: flex;
      gap: 4px; align-items: center; padding: 4px 8px;
      background: var(--_content);
      border-bottom: 1px solid var(--_border);
      border-radius: 8px 8px 0 0;
      min-width: 0;
      /* ★ issue #27 P0：作为面板级连接选择器浮层的定位上下文 */
      position: relative;
    }
    .sftp-root .pane-label { font-weight: 600; font-size: 1em; white-space: nowrap; flex-shrink: 0; }
    /* ★ 2026-10-19（Deepseek-V4.1-Flash）：端点标识可点（连接切换器入口）时的可交互提示 */
    .sftp-root .pane-label--clickable { cursor: pointer; border-radius: 4px; padding: 0 3px; margin: 0 -3px; }
    .sftp-root .pane-label--clickable:hover { background: var(--_hover); }
    /* ★ 2026-10-19（Hy3）：可点标识右侧的小角标（▾）——「这儿能点」的可发现性提示；
       展开该栏切换器时翻转 180°，兼作开关状态反馈。 */
    .sftp-root .pane-label-caret {
      display: inline-block;
      margin-left: 3px;
      font-size: 0.78em;
      line-height: 1;
      opacity: 0.5;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .sftp-root .pane-label--clickable:hover .pane-label-caret { opacity: 1; }
    .sftp-root .pane-label-caret.is-open { transform: rotate(180deg); opacity: 1; color: var(--_primary); }
    .sftp-root .pane-path { display: flex; gap: 4px; min-width: 0; overflow: hidden; flex: 1 1 auto; }
    .sftp-root .path-input {
      flex: 1; min-width: 40px; padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--input-bg, var(--_input-bg));
      color: var(--_text); font-size: 1em;
      caret-color: var(--_text, currentColor);
      -webkit-text-fill-color: var(--_text, currentColor);
      cursor: text;
      pointer-events: auto;
      user-select: text !important;
      -webkit-user-select: text !important;
      outline: none;
    }
    .sftp-root .path-input:focus,
    .sftp-root .path-input:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
    .sftp-root .path-input.path-input--focused {
      border-color: var(--_primary) !important;
    }
    .sftp-root .path-input:not(.path-input--focused) {
      border-color: var(--_border) !important;
      box-shadow: none !important;
    }
    .sftp-root .pane-toolbar-btn {
      padding: 2px 3px; border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--_text); cursor: pointer;
      font-size: 14px; line-height: 1;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sftp-root .pane-toolbar-btn svg {
      width: 16px;
      height: 16px;
      display: block;
      flex-shrink: 0;
    }
    .sftp-root .pane-toolbar-btn:hover { background: var(--_hover); }
    .sftp-root .pane-title .pane-toolbar-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .sftp-root .pane-title .pane-toolbar-btn:disabled:hover {
      background: transparent;
    }
    .sftp-root .pane-title .pane-toolbar-btn.toggle-btn.active { background: var(--_hover); }
    .sftp-root .pane-title .pane-toolbar-btn.bm-btn.active {
      background: var(--_hover);
      color: var(--_primary);
    }
    /* ★ 2026-09-30：面板上的图标按钮一律禁用浏览器原生聚焦环 —— 覆盖「面板顶栏」与「两侧面板工具栏」两排：
         顶栏 .top-actions button（路径模式/布局/传输日志/设置/最小化/最大化）、.btn-close、.reconnect-btn；
         两侧工具栏 .pane-toolbar-btn（‹ › ↑ ⟳ ⌂ ▽ ★ 👁）、过滤行 .filter-btn。
       现象：点击任意这类按钮后，再按一下方向键，按钮外圈就冒出一圈 2px 主色圆角环，很突兀
             （用户实测：纯点击不出现，点击后再按键才出现）。
       成因：这是 Chromium 的 :focus-visible —— 鼠标点击时原本不算「键盘交互」故不画环，
             但只要之后按任意键就重新判定、立刻把环画出来；环色取 UA 的 -webkit-focus-ring-color，
             本主题下解析为强调色 #E59700（非本项目样式，宿主 asar 内亦无对应规则：
             实测环是 26px 按钮盒外侧的 2px outline + 1px 白色对比边）。
       这些按钮只需鼠标/程序化操作，不需要键盘焦点提示 —— 与文件内 :host / .sftp-root /
       各输入框既有的 outline:none 收口保持一致。⚠ 刻意不写裸 button：对话框按钮的键盘焦点提示要留着。
       ★ 2026-09-30（⑬ 追加）：**鼠标按下同样会聚焦按钮**（Chrome 对未 preventDefault 的 mousedown
         一律把焦点交给按钮）⇒ 顶栏 ✕ 上也会浮出这圈环，而且因为它位于顶栏最右侧、上沿与
         .sftp-main 裁切边界重合，「环的上边被削平」。双重收口：
         ① 顶栏 ✕ 改为 mousedown 时 preventDefault（不再获得焦点，点按仍正常触发 click，见模板注释）；
         ② 本组再补 box-shadow:none !important 与 :active —— 实测本机 UA 的 :focus-visible 环是
            3px 白色 outline（用户机器上呈蓝色，颜色随平台/主题派生），但宿主与平台差异下
            不排除有非 outline 机制的聚焦环（如 box-shadow），一并堵死。 */
    .sftp-root .pane-toolbar-btn:focus,
    .sftp-root .pane-toolbar-btn:focus-visible,
    .sftp-root .pane-toolbar-btn:active,
    .sftp-root .filter-btn:focus,
    .sftp-root .filter-btn:focus-visible,
    .sftp-root .filter-btn:active,
    .sftp-root .top-actions button:focus,
    .sftp-root .top-actions button:focus-visible,
    .sftp-root .top-actions button:active,
    .sftp-root .btn-close:focus,
    .sftp-root .btn-close:focus-visible,
    .sftp-root .btn-close:active,
    .sftp-root .reconnect-btn:focus,
    .sftp-root .reconnect-btn:focus-visible,
    .sftp-root .reconnect-btn:active,
    .sftp-root .conn-retry:focus,
    .sftp-root .conn-retry:focus-visible,
    .sftp-root .conn-retry:active {
      outline: none !important;
      box-shadow: none !important;
      -webkit-tap-highlight-color: transparent;
    }
    .sftp-root .pane-actions button {
      padding: 2px 5px; border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--_text); cursor: pointer;
      font-size: 14px; line-height: 1;
    }
    .sftp-root .pane-actions button:hover { background: var(--_hover); }
    .sftp-root .pane-actions button:disabled { opacity: 0.4; cursor: default; }
    .sftp-root .pane-actions .bm-btn { color: var(--_text-muted, inherit); font-weight: 700; font-size: 14px; }
    .sftp-root .pane-actions .bm-btn:hover { background: var(--_hover); }
    .sftp-root .pane-actions .bm-btn.active { background: var(--_hover); color: var(--_primary); }
    .sftp-root .pane-actions .icon-btn { font-size: 14px; min-width: 26px; text-align: center; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .sftp-root .pane-actions .icon-btn svg { display: block; flex-shrink: 0; }
    .sftp-root .pane-actions .toggle-btn { min-width: 26px; padding: 2px 6px; }
    .sftp-root .pane-actions .toggle-btn.active { background: var(--_hover); }

    .sftp-root .pane-filters {
      position: absolute;
      top: 31px;
      left: 0; right: 0;
      z-index: 10;
      display: flex;
      padding: 6px 10px;
      background: var(--_content);
      border: 1px solid var(--_border);
      border-top: none;
      border-radius: 0 0 6px 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: filterFadeIn 0.12s ease;
    }
    @keyframes filterFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .sftp-root .filter-input {
      flex: 1; padding: 3px 6px; margin-right: 5px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--input-bg, var(--_input-bg));
      color: var(--_text); font-size: 1em;
      caret-color: var(--_text, currentColor);
      -webkit-text-fill-color: var(--_text, currentColor);
      cursor: text;
      pointer-events: auto;
      user-select: text !important;
      -webkit-user-select: text !important;
      outline: none;
    }
    .sftp-root .filter-input:focus,
    .sftp-root .filter-input:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: none !important;
      outline: none !important;
    }
    .sftp-root .filter-btn {
      display: flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; padding: 0; border: none; border-radius: 4px;
      background: transparent; color: var(--_text); cursor: pointer;
      flex-shrink: 0;
    }
    .sftp-root .filter-btn:hover { background: var(--_hover); }
    .sftp-root .filter-confirm { color: #2ecc71; }
    .sftp-root .filter-confirm:hover { background: rgba(46, 204, 113, 0.15); }
    .sftp-root .filter-clear { color: #e74c3c; }
    .sftp-root .filter-clear:hover { background: rgba(231, 76, 60, 0.15); }

    /* 列表外层：不参与滚动，用于固定拖拽高亮边框 */
    .sftp-root .pane-list-wrap {
      flex: 1 1 0;
      min-height: 0;
      min-width: 0;
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* 列表区域：flex 子项用 height:0 撑满剩余空间，消除底部空白 */
    .sftp-root .pane-list {
      flex: 1 1 0;
      min-height: 0;
      height: 0;
      overflow-y: auto; overflow-x: auto;
      /* 允许内容区根据子元素（.entry）的 min-width 撑开宽度，
         .sftp-root 配合 .entry { min-width: max-content } 实现整行背景/边框覆盖 */
      min-width: 0;
      padding: 0 10px 10px 10px;
      /* 滚动条单独占列（仅右侧），不挤占左右 10px 框选空白 */
      scrollbar-gutter: stable;
      /* 确保列表区有实底背景防止穿透 */
      background: var(--_bg);
      margin: 0;
      position: relative;
      user-select: none;
      /* Firefox 滚动条 */
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.08));
    }
    /* WebKit 滚动条 */
    .sftp-root .pane-list::-webkit-scrollbar { width: 8px; height: 8px; }
    .sftp-root .pane-list::-webkit-scrollbar-track {
      background: var(--_scroll-track, rgba(128,128,128,0.08));
      border-radius: 4px;
    }
    .sftp-root .pane-list::-webkit-scrollbar-thumb {
      background: var(--_scroll-thumb, rgba(128,128,128,0.35));
      border-radius: 4px;
      min-height: 30px;
      min-width: 30px;
      transition: background 0.2s;
    }
    .sftp-root .pane-list::-webkit-scrollbar-thumb:hover {
      background: var(--_scroll-thumb-hover, rgba(128,128,128,0.55));
    }
    .sftp-root .pane-list::-webkit-scrollbar-thumb:active {
      background: var(--_primary, #4dabff);
    }
    .sftp-root .pane-list::-webkit-scrollbar-corner {
      background: var(--_scroll-track, rgba(128,128,128,0.08));
    }
    /* 框选矩形（Rubber Band Selection） */
    .sftp-root .rubber-band-rect {
      position: absolute;
      border: 1px dashed rgba(59, 130, 246, 0.7);
      background: rgba(59, 130, 246, 0.12);
      pointer-events: none;
      z-index: 10;
      border-radius: 2px;
    }
    /* 书签列表统一滚动条 */
    .sftp-root .bookmark-list::-webkit-scrollbar { width: 6px; height: 6px; }
    .sftp-root .bookmark-list::-webkit-scrollbar-track {
      background: var(--_scroll-track, rgba(128,128,128,0.06));
      border-radius: 3px;
    }
    .sftp-root .bookmark-list::-webkit-scrollbar-thumb {
      background: var(--_scroll-thumb, rgba(128,128,128,0.32));
      border-radius: 3px;
    }
    .sftp-root .bookmark-list::-webkit-scrollbar-thumb:hover {
      background: var(--_scroll-thumb-hover, rgba(128,128,128,0.5));
    }
    .sftp-root .entry {
      display: grid;
      /* grid-template-columns 由动态绑定设置，此处为默认值 */
      grid-template-columns: 24px 200px 80px 140px 70px;
      gap: 4px; padding: 0 8px;
      cursor: pointer; user-select: none;
      align-items: center;
      font-size: 1em;
      line-height: 1.4;
      width: max-content;
      min-width: 100%;
    }
    .sftp-root .entry > span {
      padding: 3px 0;
      /* 省略号生效关键：
         - min-width: 0 → 允许 grid 子项缩小到内容以下
         - contain: inline-size → 阻止 flex 内容影响容器宽度
         - overflow: hidden + text-overflow: ellipsis → 文本截断 */
      min-width: 0;
      contain: inline-size;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* 列边框开启时，需让 span 撑满行高以保证竖线贯通 */
    .sftp-root.has-col-borders .entry > span {
      align-self: stretch;
      display: flex;
      align-items: center;
      min-height: 22px;
    }
    /* 斑马纹 - 仅在 .has-zebra 时启用 */
    /* 列边框竖线：给每个 entry 内的 span（除最后一个）加右侧分割线 */
    /* 由于 .entry padding 已上移至 span，竖线贯通整行高度 */
    .sftp-root.has-col-borders .entry > span {
      border-right: 1px solid var(--_border, rgba(128,128,128,0.2));
    }
    /* 面板圆角通过 sftp-body 的 border-radius + overflow:hidden 实现 */

    /* ★ 2026-10-20（Deepseek-V4.1-Flash）：nth-child 斑马纹**仅用于非分组列表**（.pane-list:not(.has-groups)）。
       分组模式下组头行也是 .entry，nth-child 的奇偶被组头错位，与 .entry.zebra 的组内奇偶
       恰好「互补覆盖」→ 组内几乎所有条目都被染色，整组看起来一片同色 = 没有斑马纹（2026-10-20 实测）。 */
    .sftp-root.has-zebra .pane-list:not(.has-groups) .entry:not(.header):nth-child(even) { background: var(--_surface); }
    /* 斑马纹偶数行 hover 需更高优先级覆盖斑马纹背景 */
    .sftp-root.has-zebra .pane-list:not(.has-groups) .entry:not(.header):nth-child(even):hover { background: color-mix(in srgb, var(--_primary) 57%, transparent); }
    /* 选中行 - 优先级最高，不受斑马纹影响 */
    .sftp-root .entry.selected,
    .sftp-root.has-zebra .pane-list:not(.has-groups) .entry:not(.header):nth-child(even).selected {
      /* ★ 2026-10-13：静态回退先行 —— color-mix() 在较旧 Electron/Chromium 上整体不被支持，
         声明会被丢弃；选中态是**最高频视觉状态**（点击、框选、Shift 选都依赖它），
         一旦失效用户完全看不出选中了哪些文件。不支持时回落到半透明中性灰底。
         注意：同一条规则里重复声明 background 属标准 fallback 写法（后者不被识别即
         保留前者），但这里两条声明的特异性相同、且带 !important，务必保持此顺序。 */
      background: rgba(128, 128, 128, 0.32) !important;
      background: color-mix(in srgb, var(--_primary) 77%, transparent) !important;
    }
    .sftp-root .entry:hover:not(.selected):not(.header) { background: color-mix(in srgb, var(--_primary) 57%, transparent); }
    /* 隐藏文件/文件夹（名称以 . 开头）：内容淡化区分；选中/hover 背景不受影响 */
    .sftp-root .entry.hidden-entry > span { opacity: 0.5; }
    .sftp-root .entry.hidden-entry.selected > span,
    .sftp-root .entry.hidden-entry:hover > span { opacity: 0.75; }
    .sftp-root .entry.header {
      /* 确保表头完全不透明 */
      background: var(--_content);
      font-weight: 600; font-size: 1em;
      position: sticky; top: 0;
      z-index: 5;
      color: var(--_primary);
      border-bottom: 2px solid var(--_primary);
      padding-top: 6px;
    }
    /* 强制表头所有列文字完全不透明 */
    .sftp-root .entry.header > span { opacity: 1 !important; }
    /* ★ 2026-09-28 文件分组表头行：复用 .header 类以被 :not(.header) 选择器跳过（框选/右键/斑马纹），
       但需覆写真表头的 sticky/边框/配色——分组头是普通行内分隔，不吸附、不高亮 */
    /* ★ 2026-09-28（二次调整）：分组表头行去背景色——用户「不需要背景色会更好看」，
       仅保留字重区分；但保留 hover 轻高亮（见下方 :hover 规则） */
    /* ★ 2026-09-30（缺口根治）：分组头行必须与条目行「同列模板 + 同盒模型」。
       根因：条目行是 grid，列模板由父级 colWidths 绑定，width:max-content ⇒ 列宽合计超过面板内容宽时
       会向右溢出（有意为之：整行底色/边框要盖住横向滚动区）；而分组头行此前固定 display:flex
       且 grid-template-columns:none ⇒ 没有列模板、max-content 只剩箭头+名称那几个字宽，
       宽度退化到 min-width:100%（= 面板内容宽）⇒ 两者相差「列宽合计 − 面板内容宽」那一截，
       整组选中时分组头右上角就露出一个缺口。用户实测：远程面板（列更宽）明显；本地面板把列加宽到
       溢出 5px 后同样显形 —— 与「是否显示某列」无关，只取决于列宽合计有没有超出面板。
       修法：分组头也用父级绑定的同一份列模板（grid，见 file-pane 模板的 [style.gridTemplateColumns]），
       内容统一收进 .group-inner 做 flex 紧凑排列 ⇒ 宽度与条目行逐像素一致，视觉完全不变。
       ⚠ 下面 padding 必须保留 shorthand 形态：一是要与条目行的 0 8px 逐字一致（max-content 含行内边距，
       差 1px 缺口就回来），二是要压掉 .entry.header 的 padding-top:6px + border-bottom ——
       分组头自身竖直内边距必须为 0（行高 = 子 span 的 3px + 行框），否则会比内容行高约 4px，
       出现「分组头↔内容」间距永远大于「内容↔内容」的忽大忽小观感（2026-09-29 四次根治的结论）。
       ⚠ 同理不能在此声明 gap —— 条目行用的是 .entry 的 gap:4px，分组头跟着继承才不会差宽度。 */
    .sftp-root .entry.group-row {
      display: grid;
      position: static;
      z-index: auto;
      border-bottom: none;
      background: transparent;
      font-weight: 600;
      padding: 0 8px;
      cursor: pointer;
    }
    /* 分组头内容层：跨全部列 + 内部 flex 紧凑排列（等价于旧的「箭头 / 名称 / 计数」三个直接子元素）
       ★ 2026-09-29：箭头与名称间距收到 2px，让分组名称贴到图标列，消除"被缩进"观感
       ★ 2026-09-29（五次）：与内容行子 span 的 3px 竖直内边距对齐，使分组头与内容行等高
       ★ 2026-09-30：margin-left:-6px 抵消行内左边距（padding 8px）中的 6px，使箭头仍落在行首 2px 处
       —— 负外边距不影响行宽（列模板全是固定 px，max-content 与子项无关），只挪内容起点；
       min-width:0 同样是为了「不被内容撑宽」，否则长分组名会把分组头撑得比条目行还宽。 */
    .sftp-root .entry.group-row > .group-inner {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: -6px;
      padding: 3px 0;
      min-width: 0;
      contain: none;
      overflow: visible;
      text-overflow: clip;
    }
    /* ★ 2026-09-29：分组头 hover——与文件条目一致的主色轻高亮；文字改回正文色保证对比度 */
    .sftp-root .entry.group-row:hover:not(.selected) {
      background: color-mix(in srgb, var(--_primary) 57%, transparent);
    }
    .sftp-root .entry.group-row:hover:not(.selected) > span {
      color: var(--_text);
    }
    /* 分组头选中态：复用 .entry.selected 的 !important 主色背景；但表头 span 默认主色文字叠主色底对比度差，
       选中时改回正文色（与条目选中一致） */
    .sftp-root .entry.group-row.selected > span { color: var(--_text); opacity: 1; }
    /* ★ 2026-09-29（五次，用户定稿）：分组模式下取消行间距——条目与组头之间不再留缝，
       选中高亮连成整块（不再被 2px 缝隙切成一段段）；配合行高统一，视觉完全均匀 */
    .sftp-root .pane-list.has-groups .entry:not(.header) { margin: 0; }
    .sftp-root .pane-list.has-groups .entry.group-row { margin: 0; }
    /* ★ 2026-09-29：斑马纹 nth-child 在分组模式下奇偶被分组头打乱 → 不规则底色带，当日整体禁用。
       ★ 2026-10-20（Deepseek-V4.1-Flash）：改为按「组内序号」类名驱动（buildGroupedRows 里算 zebra，
       模板挂 .entry.zebra），每组第 1 条带类 ⇒ 单条分组也显示斑马色；组头不参与计数，折叠组也不占号。
       ★ 2026-10-20：上方 nth-child 斑马纹已限定 :not(.has-groups)，分组模式只走本规则，
       否则两者奇偶互补覆盖、组内条目几乎全被染色（整组同色 = 看着没有斑马纹）。
       选中态仍由上方 .selected(!important) 压过，hover 单独提权覆盖。 */
    .sftp-root.has-zebra .pane-list.has-groups .entry.zebra:not(.header) { background: var(--_surface); }
    .sftp-root.has-zebra .pane-list.has-groups .entry.zebra:not(.header):hover {
      background: color-mix(in srgb, var(--_primary) 57%, transparent);
    }
    /* ★ 2026-09-29（五次）的分组头子 span 规则（padding 3px 0 / contain:none / overflow:visible）
       已于 2026-09-30 并入上方 .group-inner —— 内容层下移后，直接子元素只剩它一个。 */
    /* ★ 2026-09-29（六）：键盘游标——方向键当前**停留**的那一行（条目行 / 分组头行共用同一语义）。
       为何要独立语义：单条目分组里「游标停在表头」与「停在那唯一一条文件上」选中集完全相同，
       而表头「选中」高亮当时又被 ≥2 项门槛挡住（该门槛已于同日取消，改为 groupSelState 按选中比例判定），
       两者叠加的结果是屏幕毫无变化 → 用户以为 ↑/↓ 停不到表头（实测反馈）。
       表达方式：左侧 3px 主色竖条（inset box-shadow，不占布局、不改行高，不破坏已定稿的行距）；
       未选中时再叠一层轻底色。与「选中」的 77% 主色实底明确区分：
       实底 = 已选中；细竖条 + 轻底 = 光标停在这里。选中行同时带游标时两者并存（竖条仍在）。 */
    .sftp-root .pane-list .entry.nav-focus { box-shadow: inset 3px 0 0 0 var(--_primary); }
    .sftp-root .pane-list .entry.nav-focus:not(.selected) {
      background: color-mix(in srgb, var(--_primary) 30%, transparent);
    }
    /* 游标行的分组头文字转正文色：分组头默认主色文字，叠主色轻底后对比度不足（同 .selected 的处理） */
    .sftp-root .pane-list .entry.group-row.nav-focus > span { color: var(--_text); opacity: 1; }
    /* ★ 2026-09-29（七，用户定稿）：分组头「部分选中」态——组内有**部分**条目被选中（不是整组）。
       分两档强度的理由：整组选中（.selected，77% 实底）时表头与组内条目连成一整块；部分选中若用同样
       的实底，会被误读成「整组已选」，故用同色系半透明底表达「该组有选中内容」——
       既能一眼看出「这一组里有东西被选了」，又与「整组已选」明确区分。子 span 转正文色保证对比度。
       特异性 (0,5,0) 与 .nav-focus:not(.selected) 相同、且排在其后：键盘游标停在「部分选中」的组头时
       底色保持 40%（不被降回 30%），游标另有左侧竖条可辨识。
       注：与 .group-row:hover:not(.selected) 也同特异性，排后者胜 → 悬停在部分选中的组头上底色不跳变
       （hover 反馈只在未选中的组头上体现）。 */
    .sftp-root .pane-list .entry.group-row.partial {
      background: color-mix(in srgb, var(--_primary) 40%, transparent);
    }
    .sftp-root .pane-list .entry.group-row.partial > span { color: var(--_text); opacity: 1; }
    .sftp-root .group-chevron {
      flex: none; width: 12px; text-align: center;
      cursor: pointer; opacity: 0.8; user-select: none;
    }
    .sftp-root .group-chevron:hover { opacity: 1; color: var(--_primary); }
    .sftp-root .group-label { flex: 0 1 auto; }
    .sftp-root .group-count { flex: none; opacity: 0.55; font-weight: 400; }
    /* 列 resize handle 嵌入在各列 span 内部，position: absolute 始终对齐列边界 */
    .sftp-root .name, .sftp-root .size, .sftp-root .date, .sftp-root .perms, .sftp-root .mode, .sftp-root .access, .sftp-root .owner, .sftp-root .group, .sftp-root .path, .sftp-root .ext {
      position: relative;
      min-width: 0;  /* 防止撑破 grid 列宽导致对齐偏移 */
    }
    .sftp-root .col-resize-handle {
      position: absolute;
      right: -1.5px;   /* gap=4px, 3px宽handle居中于列间 */
      top: 0;
      bottom: 0;
      width: 3px;
      cursor: col-resize;
      z-index: 10;
      background: transparent;
      border-radius: 1px;
      transition: background 0.15s;
    }
    .sftp-root .col-resize-handle:hover,
    .sftp-root .col-resize-handle.resizing {
      background: var(--_primary, #4dabff);
      opacity: 0.7;
    }
    .sftp-root .entry.up-entry { opacity: 0.6; }
    .sftp-root .entry.dim { opacity: 0.5; }
    /* ★ 2026-09-29（五次）：统一行高——图标行框固定为 1 倍。原 font-size:1.08em 叠加继承的 line-height:1.4，
       会让 emoji 图标（📁/📄）撑出 1.512em 的行框，高于文字行框 1.4em → "用 emoji 图标的行"整体偏高、行高不一；
       固定 line-height:1 后图标盒恒小于文字行框，全部行高统一由文字行决定（自定义图标 <img> 亦如此） */
    /* ★ 2026-09-29（六次）：图标在图标列内**靠右**——原先居中（列宽 24px）时图标左右各留 ~3-4px，
       叠加列间 gap:4px 后图标到文件名约 7-8px，观感偏散。改为 justify-self:end 使图标右边缘贴住列右，
       到文件名仅剩 gap 4px。同时 width 由固定 24px 收缩为 max-content → .icon 盒 = 图标本身宽度，
       链接角标 .link-badge（绝对定位于 .icon 左下角）因此继续贴住图标、不再随列宽漂移。
       注：列宽本身（colIconWidth 24px）与表头对齐不变，仅图标列内的水平对齐方式改变。 */
    .sftp-root .icon {
      text-align: center; font-size: 1.08em; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      position: relative;
      justify-self: end;
      width: max-content;
    }
    /* ★ 2026-09-29（六次修订·回归修复）：上面 width:max-content 必须配这条覆盖规则才生效——
       .icon 同时命中 .entry > span 的 contain:inline-size（内联尺寸**不依赖内容**）+ overflow:hidden，
       会把 max-content 解析为 0 → 图标被裁掉、整个图标列空白（用户实测"图标都不显示"）。
       又因 .entry > span（0,2,1）特异性高于 .icon（0,2,0），故此处用 .entry > span.icon（0,3,1）压过它：
       contain:none 让宽度回到内容驱动；overflow:visible 顺带让 .link-badge 角标不被裁。
       注：此处注释禁用反引号——本文件是 TS 模板字符串，反引号会提前截断样式字符串。 */
    .sftp-root .entry > span.icon { contain: none; overflow: visible; }
    .sftp-root .icon .custom-file-icon { width: 1.23em; height: 1.23em; object-fit: contain; flex-shrink: 0; }
    /* ★ 2026-09-08 issue #16：链接角标（符号链接 / 快捷方式），叠在图标左下角。
       ★ 2026-09-29（八次）：bottom 由 -1px 上移为 1px。实测口径（行高 30px 的列表行）：
       bottom:-1px 时角标可见底边 y=509，该行行框下沿 y=508 ⇒ 越出行框 1px（即用户反馈的
       「超出行高」）；上移 2px 后底边 y=507，收在框内 1px。角标外形 14px（12px + 1px 边框×2）。
       ⚠ 只挪角标，不动 .icon 与图标本体 —— 本体每行都精确居中（墨迹中心 = 行框中心），动它会破
       图标列的整列对齐；另注意角标直径 14px 本就大于 emoji 墨迹的 11px，叠在角上必然略微外露。 */
    .sftp-root .icon .link-badge {
      position: absolute; left: -1px; bottom: 1px;
      width: 12px; height: 12px;
      display: inline-flex; align-items: center; justify-content: center;
      background: var(--_bg, var(--body-bg, #1e1e1e));
      border: 1px solid var(--_border, rgba(128,128,128,0.3));
      border-radius: 50%;
      color: var(--_primary, #4dabff);
      pointer-events: none;
    }
    .sftp-root .icon .link-badge svg { width: 9px; height: 9px; display: block; }
    .sftp-root .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 1em; font-family: inherit; }
    .sftp-root .size { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; text-align: left; }
    .sftp-root .date { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; }
    .sftp-root .perms { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; text-align: left; }
    .sftp-root .mode { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; text-align: left; }
    .sftp-root .access { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; }
    .sftp-root .owner { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; text-align: left; }
    .sftp-root .group { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; text-align: left; }
    .sftp-root .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; }
    .sftp-root .ext { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1em; font-family: inherit; text-align: left; }
    .sftp-root .sortable { cursor: pointer; display: inline-flex; align-items: center; gap: 2px; }
    .sftp-root .entry.header > span.sortable:not(.name) { cursor: grab; }
    .sftp-root .entry.header > span.sortable.header-col-dragging { cursor: grabbing; }
    /* 表头列 hover / 拖拽列宽：主色调轻高亮 + 显示右侧分隔线 */
    .sftp-root .entry.header > span.sortable:hover,
    .sftp-root .entry.header > span.sortable.header-col-resizing {
      align-self: stretch;
      display: inline-flex;
      align-items: center;
      background: color-mix(in srgb, var(--_primary) 16%, transparent);
      color: var(--_primary);
      border-right: 1px solid color-mix(in srgb, var(--_primary) 60%, var(--_border, rgba(128,128,128,0.25)));
      z-index: 2;
      padding-left: 2px;
      padding-right: 2px;
      margin-left: -2px;
      margin-right: -2px;
    }
    .sftp-root .entry.header > span.sortable:hover .col-resize-handle,
    .sftp-root .entry.header > span.sortable.header-col-resizing .col-resize-handle {
      background: var(--_primary, #4dabff);
      opacity: 0.9;
    }
    /* 拖拽中：原位置表头变淡，表示"正在拖走" */
    .sftp-root .entry.header > span.sortable.header-col-dragging {
      opacity: 0.28;
      color: var(--_primary);
      background: color-mix(in srgb, var(--_primary) 10%, transparent);
    }
    /* 落点指示线：插入到目标列左/右 */
    .sftp-root .entry.header > span.sortable.header-col-drop-before,
    .sftp-root .entry.header > span.sortable.header-col-drop-after {
      position: relative;
    }
    .sftp-root .entry.header > span.sortable.header-col-drop-before::before,
    .sftp-root .entry.header > span.sortable.header-col-drop-after::after {
      content: '';
      position: absolute;
      top: 1px;
      bottom: 1px;
      width: 2px;
      background: var(--_primary, #4dabff);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--_primary) 30%, transparent);
      border-radius: 2px;
      pointer-events: none;
      z-index: 12;
    }
    .sftp-root .entry.header > span.sortable.header-col-drop-before::before { left: -2px; }
    .sftp-root .entry.header > span.sortable.header-col-drop-after::after { right: -2px; }
    .sftp-root.col-header-reordering,
    .sftp-root.col-header-reordering * {
      user-select: none !important;
      cursor: grabbing !important;
    }
    /* ★ 2026-10-12 修复：拖拽列宽期间保持 col-resize 手势。原仅在把手上设 cursor:col-resize，
       鼠标移出把手落到其它列即变回默认箭头；此处对齐 .col-header-reordering 的做法，
       由 .sftp-root.col-header-resizing 类强制贯穿全程（控制器在 resize 开始/结束加卸该类）。 */
    .sftp-root.col-header-resizing,
    .sftp-root.col-header-resizing * {
      user-select: none !important;
      cursor: col-resize !important;
    }
    /* 跟随鼠标的幽灵表头 */
    .header-col-ghost {
      display: inline-flex !important;
      align-items: center;
      gap: 2px;
      padding: 4px 8px !important;
      border-radius: 4px;
      background: color-mix(in srgb, var(--primary-color, #3b82f6) 18%, var(--content-bg, #1e1e2e)) !important;
      color: var(--primary-color, #3b82f6) !important;
      border: 1px solid color-mix(in srgb, var(--primary-color, #3b82f6) 55%, transparent) !important;
      box-shadow: 0 6px 16px rgba(0,0,0,0.28);
      opacity: 0.95;
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      transform: translateY(-1px) rotate(-0.5deg);
    }
    .header-col-ghost .col-resize-handle { display: none !important; }
    .sftp-root .sortable:hover { color: var(--_primary); }
    .sftp-root .sort-arrow { font-size: 11px; opacity: 1; margin-left: 1px; }
    .sftp-root .pane-empty { padding: 20px; text-align: center; opacity: 0.4; font-size: 1em; }

    /* 加载提示 - 绝对定位覆盖整个 pane（不受 scroll 影响） */
    .sftp-root .pane-loading {
      position: absolute;
      inset: 0;
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--_bg, var(--body-bg, #1e1e2e)) 92%, transparent);
      pointer-events: none;
    }
    .sftp-root .pane-loading .spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--_border, rgba(128,128,128,0.2));
      border-top: 2px solid var(--_primary, #3b82f6);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    /* 加载时锁定滚动 */
    .sftp-root .pane-loading-active { overflow: hidden !important; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* 刷新成功闪烁（极简，避免视觉抖动） */
    .sftp-root .pane-flash {
      animation: flash 0.25s ease-out;
    }
    @keyframes flash {
      0% { background-color: transparent; }
      30% { background-color: rgba(59,130,246,0.06); }
      100% { background-color: transparent; }
    }

    /* ★ 2026-10-16 issue #26：地址栏输入含文件名的绝对路径后，对定位到的条目做一次高亮闪烁。
       仅用 box-shadow 画一圈琥珀色描边，不碰 background（background 已被 .selected 的
       !important 主色底占用），故与选中态叠加而不互相覆盖；动画结束后描边淡出。 */
    .sftp-root .entry.locate-flash {
      animation: entry-locate-flash 1.2s ease-out;
    }
    @keyframes entry-locate-flash {
      0%   { box-shadow: inset 0 0 0 2px #f59e0b, 0 0 10px 2px rgba(245,158,11,0.6); }
      75%  { box-shadow: inset 0 0 0 2px #f59e0b, 0 0 10px 2px rgba(245,158,11,0.6); }
      100% { box-shadow: none; }
    }

    /* 桌面文件拖拽悬停高亮（边框画在不滚动的 wrap 上，不随横向滚动偏移） */
    .sftp-root .pane-list-wrap.pane-drag-over .pane-list {
      background-color: color-mix(in srgb, var(--primary-color, #3b82f6) 8%, transparent);
      background-color: rgba(59,130,246,0.08); /* fallback */
    }
    .sftp-root .pane-list-wrap.pane-drag-over::after {
      content: '';
      position: absolute;
      inset: 0;
      border: 2px solid var(--primary-color, #3b82f6);
      border-radius: 0;
      pointer-events: none;
      z-index: 6;
    }

    .sftp-root .pane-actions-bar {
      display: flex; align-items: center;
      padding: 4px 8px; border-top: 1px solid var(--_border);
      background: var(--_content);
      flex-shrink: 0;
      border-radius: 0 0 8px 8px;
    }
    .sftp-root .selection-info { font-size: 1em; opacity: 0.7; min-width: 60px; }
    .sftp-root .size-hint { opacity: 0.5; font-size: 0.85em; }
    .sftp-root .action-buttons { display: flex; gap: 3px; margin-left: auto; }
    .sftp-root .action-buttons button {
      padding: 2px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer; font-size: 12px;
    }
    .sftp-root .action-buttons button:hover { background: var(--_hover); }
    .sftp-root .action-buttons button:disabled { opacity: 0.4; cursor: default; }

    /* ★ 2026-10-19 P2-37：同样去掉写死的 z-index:100 —— 本规则 (0,2,0) 与组件
       .overlay[_ngcontent-x] (0,2,0) 打平，胜负全看 style 元素插入顺序，属同一类隐患。
       去掉后各对话框沿用组件自声明值（详见上方 .sftp-overlays .overlay 处的注释）。 */
    .sftp-root .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      /* 立即显示，无淡入动效 */
      transition: none !important;
      animation: none !important;
    }
    /* ★ 2026-08-26 C3：删除确认必须压过查看器(z=110)，避免被盖住后 Enter 隐形确认。
       ★ 2026-10-19 P2-37 补充：现在查看器的 110 才真正生效（此前被上方 (0,3,0) 摁成 100），
       故这条 120 特例**必须保留**——它是有意压过组件值的唯一例外（删除框组件自身只声明 100）。 */
    .sftp-root .overlay.sftp-delete-overlay,
    .sftp-root sftp-delete-dialog .overlay {
      z-index: 120;
    }
    .sftp-root .dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px; padding: 16px; min-width: 280px; max-width: 92vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .sftp-root .dialog-text { margin-bottom: 12px; }
    .sftp-root .dialog-title { display:flex; align-items:center; justify-content:space-between; font-weight: 700; margin-bottom: 12px; color: var(--_primary); }
    .sftp-root .dialog-close { font-size:18px; line-height:1; padding:0 2px; opacity:.6; }
    .sftp-root .dialog-close:hover { opacity:1; }
    .sftp-root .dialog-input {
      width: 100%; padding: 6px 8px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_input-bg);
      color: var(--_text); font-size: 1em;
      caret-color: var(--_text, currentColor);
      -webkit-text-fill-color: var(--_text, currentColor);
      cursor: text;
      user-select: text !important;
      -webkit-user-select: text !important;
      margin-bottom: 12px; box-sizing: border-box; outline: none;
    }
    .sftp-root .dialog-input:focus,
    .sftp-root .dialog-input:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--_primary) 35%, transparent) !important;
      outline: none !important;
    }
    .sftp-root .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .sftp-root .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .sftp-root .danger { background: #d32f2f !important; border-color: #ef5350 !important; }

    /* ★ 2026-10-19 P2-36：本段原为「删除确认对话框」的 .delete-* 规则，现整体删除。
       删除框早已抽成独立组件（sftp-delete-dialog）并在自己的 styles 里声明了同套规则；
       而本文件是 ViewEncapsulation.None + 选择器带 .sftp-root 前缀（特异性 (0,2,0)），
       与组件经 emulated 封装后的 .delete-dialog[_ngcontent-x]（同为 (0,2,0)）**打平**，
       只能靠 style 元素插入顺序决胜 ⇒ 典型的「改对了却不生效」。
       逐类核对（组件 sftp-delete-dialog.component.ts 的 styles 均已定义同名规则）：
       delete-dialog / delete-header / delete-header-icon / delete-warn-icon / delete-title /
       delete-text / delete-preview / delete-preview-row / delete-preview-row 相邻间距 /
       delete-preview-icon / delete-preview-name / delete-preview-label / delete-preview-value。
       差异仅一处：delete-header-icon 本文件 14px、组件 16px —— 按「以组件为准」取 16px。
       约定：**对话框样式一律以组件自身为准**，本文件只保留布局 / overlay / 跨组件那类规则。 */

    /* ★ 2026-10-19 P2-36：本段原为书签弹层的 .bookmark-popup / .popup-* 规则，现整体删除。
       书签弹层已抽成组件（sftp-bookmark-popup）并在自己的 styles 里声明同套规则；
       本文件带 sftp-root 前缀的同类规则（(0,2,0)）与组件封装后的
       .bookmark-popup[_ngcontent-x]（(0,2,0)）打平靠顺序决胜，属同一类隐患。
       逐类核对（组件 styles 均已定义同名规则）：
       bookmark-popup / popup-arrow / popup-title / popup-footer / popup-footer button /
       popup-footer button:hover。
       差异：popup-title 内边距本文件 10px 14px 6px、组件 2px 2px（组件另有 .popup-header
       承担外padding，属组件化后的重新分工，以组件为准）。 */

    /* ★ 2026-10-19 P2-36 待验证：以下 bookmark-add-btns / add-btn / add-icon / bookmark-empty /
       bookmark-add-form .bm-form-row 几组在 sftp-bookmark-popup 组件里**没有**同名规则
       （未随组件迁移），但全仓搜索也没有任何 markup 用到它们（疑似组件化改造遗留的死代码）。
       按「宁可少删不可删错」本次保留，待真机确认无引用后再一并清除。 */
    .sftp-root .bookmark-add-btns { display: flex; gap: 6px; padding: 0 14px 10px; }
    .sftp-root .add-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 6px; font-size: 12px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .sftp-root .add-btn:hover { background: var(--_hover); }
    /* ★ 2026-10-19 P2-38：同上——补 .active:hover（(0,4,0)），选中态悬停不丢高亮。 */
    .sftp-root .add-btn.active,
    .sftp-root .add-btn.active:hover { border-color: var(--_primary); background: rgba(59,130,246,0.08); }
    .sftp-root .add-icon { font-weight: 700; font-size: 14px; color: var(--_primary); }
    /* ★ 2026-10-19 P2-36：书签弹层其余同名规则（bookmark-add-form / 其 input 与 :focus /
       btn-confirm / btn-confirm:disabled / bookmark-scope-label / bookmark-list）一并删除，
       组件 sftp-bookmark-popup 的 styles 里均有同名定义（input 字号组件为 12px、本文件为 1em，
       以组件为准）。保留 .bm-form-row 见上方「待验证」注释。 */
    .sftp-root .bookmark-add-form .bm-form-row {
      display: flex; gap: 6px; align-items: center;
    }
    .sftp-root .bookmark-empty {
      padding: 24px 8px; text-align: center;
      font-size: 12px; opacity: 0.4; color: var(--_text);
    }
    /* ★ 2026-10-19 P2-36：书签条目相关规则（bookmark-item 及其 :hover / .dragging /
       .drag-over-top / .drag-over-bottom，bm-drag-handle 及其 :hover，bm-info / bm-name /
       bm-path / bm-remove 及其 :hover）一并删除 —— 组件 styles 里均有同名定义且逐条比对一致。 */

    /* ★ 2026-10-19 P2-36：本段原为右键菜单的 .context-menu / .ctx-* 规则，现整体删除。
       菜单已抽成组件（sftp-context-menu）并在自己的 styles 里声明同套规则（另含
       .ctx-submenu 等新增规则）；本文件带 sftp-root 前缀的同类规则（(0,2,0)）与组件封装后的
       .ctx-item[_ngcontent-x]（(0,2,0)）打平靠顺序决胜，属同一类隐患。
       逐类核对（组件 styles 均已定义同名规则且逐条一致）：
       context-menu / ctx-item / ctx-check / ctx-item:hover / ctx-item.ctx-danger:hover /
       ctx-sep / ctx-item.ctx-disabled / ctx-item.ctx-disabled:hover / ctx-shortcut。
       说明：全仓只有 sftp-context-menu 使用 ctx-* 类名（文本右键菜单用的是 tctx-* 前缀，
       与本段无关），删除不会影响其它组件。 */
    /* ★ 2026-10-19 P2-36 待验证：.sftp-root .mode 未在任何组件的 styles 中找到同名规则，
       也不属于上述四组中的任何一组（疑似更早年代的遗留）。按「宁可少删不可删错」保留。 */
    .sftp-root .mode { font-size: 1em; font-family: inherit; text-align: left; }
    /* ★ 2026-10-19 P2-36：本段原为「文件属性（详细信息）对话框」的 .details-* / .dt-* 规则，
       现整体删除 —— 对话框已抽成组件（sftp-details-dialog）并在自己的 styles 里声明同套规则
       （另含 details-head / dt-calc-* 等新增规则），同特异性打平的问题同上。
       逐类核对（组件 styles 均已定义同名规则且逐条一致）：
       details-dialog / details-body / details-table / details-table td / dt-label / dt-value / dt-path。 */
    /* ★ 2026-10-16：本段原为「权限编辑对话框」的 .perm-* 规则，现整体删除。
       它们是权限对话框**还内联在面板模板里**那个年代留下的残留：对话框早已抽成独立组件
       （sftp-perm-dialog）并在自己的 styles 里声明样式，而本文件是 ViewEncapsulation.None +
       选择器带 sftp-root 前缀（特异性 (0,2,0)），与组件经 Angular emulated 封装后的
       perm-preview[_ngcontent-x]（同为 (0,2,0)）**打平**，只能靠 style 元素插入顺序决胜
       ⇒ 典型的「改对了却不生效」。
       实测：本轮把组件里 .perm-preview 去底去框后界面仍旧是带框的，就是被这里的
       .sftp-root .perm-preview 覆盖。
       另：perm-grid / perm-header / perm-label / perm-target-name 所对应的 markup 早已不存在，
       属纯死代码（矩阵现已改为 .perm-table）。
       约定：**对话框样式一律以组件自身为准**，本文件只保留布局/overlay/跨组件那类规则。 */

    .sftp-root sftp-transfer-queue {
      display: contents;
      flex-shrink: 0;
    }

    /* 输入框兜底：覆盖 Tabby 主题对光标/焦点的干扰（限定在面板内） */
    .sftp-root input[type="text"],
    .sftp-root input:not([type]),
    .sftp-root textarea {
      caret-color: var(--_text, currentColor) !important;
      color: var(--_text, inherit) !important;
      -webkit-text-fill-color: var(--_text, currentColor) !important;
    }
    .sftp-root input[type="text"]::placeholder,
    .sftp-root input:not([type])::placeholder,
    .sftp-root textarea::placeholder {
      color: var(--_text, inherit) !important;
      opacity: 0.45;
    }
    .sftp-root input[type="text"]::-webkit-input-placeholder,
    .sftp-root input:not([type])::-webkit-input-placeholder,
    .sftp-root textarea::-webkit-input-placeholder {
      color: var(--_text, inherit) !important;
      opacity: 0.45;
    }
    .sftp-root .log-toolbar select {
      color: var(--_text, inherit) !important;
      background: var(--_content, var(--_bg)) !important;
    }
    .sftp-root .log-toolbar select:focus,
    .sftp-root .log-toolbar select:focus-visible {
      border-color: var(--_primary, #3b82f6) !important;
      box-shadow: 0 0 0 1px var(--_primary, #3b82f6) !important;
      outline: none !important;
    }
  `

/* ───────── 查看 / 编辑对话框共用布局样式 ───────── */
export const FILE_DIALOG_SHARED_STYLES = `
  .overlay {
    /* ★ 2026-08-15 修复 issue #12：查看/编辑对话框在面板较矮、窗口较高时关闭按钮被 panelHost 的 overflow:hidden 裁剪，导致关不掉。
       根因：.file-dialog-shell 高度用 min(80vh,720px)（基于视口），而遮罩为面板内 absolute，dialog 高度超过面板可视高度即被 panelHost 裁剪。
       修复：保持面板内遮罩不变，见 .file-dialog-shell 的 max-width/max-height:100% 约束（不超面板，关闭按钮始终可见，内容在 .file-dialog-body 内滚动）。 */
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center; z-index: 110;
    transition: none !important; animation: none !important;
  }
  .dialog {
    background: var(--_bg);
    border: 1px solid var(--_border);
    border-radius: 10px; padding: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    display: flex; flex-direction: column;
    box-sizing: border-box;
  }
  .file-dialog-shell {
    width: min(900px, 92vw);
    height: min(80vh, 720px);
    max-width: 100%;
    max-height: 100%;
    /* ★ 2026-08-15 issue #12：max-width/max-height 约束 dialog 不超出面板可视区域（panelHost overflow:hidden），
       避免关闭按钮被裁剪导致无法关闭；内容多时在 .file-dialog-body 内滚动。 */
    /* ★ 2026-07-25 B14：去掉宽高过渡——窗口缩放/还原/最大化时不再缓慢位移缩小，响应与工具栏一致 */
  }
  .file-dialog-shell.is-maximized {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
  }
  .dialog-title {
    display: flex; align-items: center; justify-content: space-between;
    font-weight: 700; margin-bottom: 6px; color: var(--_primary);
    gap: 12px; flex-shrink: 0;
  }
  .file-dialog-window-btns {
    display: flex; align-items: center; gap: 2px; flex-shrink: 0;
  }
  .file-dialog-win-btn {
    box-sizing: border-box;
    flex: 0 0 28px;
    width: 28px; height: 28px;
    min-width: 28px; min-height: 28px;
    max-width: 28px; max-height: 28px;
    margin: 0; padding: 0;
    border: none; border-radius: 6px;
    background: transparent; color: var(--_text);
    display: inline-flex; align-items: center; justify-content: center;
    cursor: pointer;
    line-height: 0;
    font-size: 0;
  }
  .file-dialog-win-btn:hover { background: var(--_hover); }
  .file-dialog-win-btn:disabled { opacity: 0.45; cursor: default; }
  .file-dialog-win-btn:disabled:hover { background: transparent; }
  .file-dialog-win-btn svg {
    width: 12px; height: 12px;
    display: block;
    flex-shrink: 0;
  }
  .file-dialog-title {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-size: 13px; flex: 1; min-width: 0;
  }
  .file-dialog-path {
    font-size: 11px; font-family: monospace;
    opacity: 0.65; margin-bottom: 8px;
    word-break: break-all; flex-shrink: 0;
  }
  /* ★ 2026-10-23（Deepseek-V4.1-Flash）：外部编辑保存后「本地已改动、尚未上传」——
     用户要求不再用黄色横幅提醒，改成 **面板边框高亮 + 保存按钮高亮**：
       · .dialog.has-external-dirty  → 整块对话框描边 + 外圈用警告色（含标题变色呼应）
       · .btn-primary.is-attention   → 底栏保存键改警告色底 + 光晕（⛔ 文案恒为「保存」，用户要求高亮不改名）
     ⛔ 别只留边框不开后门：两道视觉提示缺一，用户会以为「文件已同步」
     （真实语义是本地临时副本已改、服务器还是旧内容）。 */
  .dialog.has-external-dirty {
    border-color: var(--_warn-border, rgba(255, 170, 0, 0.62));
    box-shadow: 0 0 0 1px var(--_warn-border, rgba(255, 170, 0, 0.62)),
                0 8px 32px rgba(0, 0, 0, 0.15);
  }
  .dialog.has-external-dirty .dialog-title { color: var(--_warn-border, #e0a000); }
  .dialog-buttons .btn-primary.is-attention {
    background: var(--_warn-border, #e0a000);
    border-color: var(--_warn-border, #e0a000);
    color: #1b1b1b;
    box-shadow: 0 0 0 2px rgba(255, 170, 0, 0.28);
  }
  .dialog-buttons .btn-primary.is-attention:hover {
    box-shadow: 0 0 0 3px rgba(255, 170, 0, 0.38);
  }
  .file-dialog-body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--_border);
    border-radius: 6px;
    background: var(--_content);
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.4)) var(--_scroll-track, rgba(128,128,128,0.08));
  }
  .file-dialog-body::-webkit-scrollbar,
  .file-dialog-textarea::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .file-dialog-body::-webkit-scrollbar-track,
  .file-dialog-textarea::-webkit-scrollbar-track {
    background: var(--_scroll-track, rgba(128,128,128,0.08));
    border-radius: 4px;
    margin: 2px;
  }
  .file-dialog-body::-webkit-scrollbar-thumb,
  .file-dialog-textarea::-webkit-scrollbar-thumb {
    background: var(--_scroll-thumb, rgba(128,128,128,0.38));
    border-radius: 4px;
    min-height: 28px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  .file-dialog-body::-webkit-scrollbar-thumb:hover,
  .file-dialog-textarea::-webkit-scrollbar-thumb:hover {
    background: var(--_scroll-thumb-hover, rgba(128,128,128,0.55));
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  .file-dialog-body::-webkit-scrollbar-thumb:active,
  .file-dialog-textarea::-webkit-scrollbar-thumb:active {
    background: var(--_primary, #4dabff);
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  .file-dialog-body::-webkit-scrollbar-corner,
  .file-dialog-textarea::-webkit-scrollbar-corner {
    background: transparent;
  }
  .file-dialog-status {
    padding: 24px; text-align: center; font-size: 13px;
  }
  /* ★ 2026-10-14：底部按钮行上方的单行提示（目前用于查看器「文件过大，仅选中当前屏幕内容」） */
  .file-dialog-hint {
    flex-shrink: 0;
    padding: 2px 12px 6px;
    font-size: 11px;
    line-height: 1.5;
    color: var(--_text);
    opacity: 0.72;
    text-align: left;
  }
  /* 加载中：覆盖整个内容区、居中旋转图标，效果对齐面板文件加载（pane-loading） */
  .file-dialog-loading {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--_content, var(--body-bg, #1e1e2e)) 92%, transparent);
    pointer-events: none;
  }
  .file-dialog-loading .spinner {
    width: 24px; height: 24px;
    border: 3px solid var(--_border, rgba(128,128,128,0.25));
    border-top-color: var(--_primary, #4dabff);
    border-radius: 50%;
    animation: sftp-dialog-spin 0.7s linear infinite;
  }
  @keyframes sftp-dialog-spin { to { transform: rotate(360deg); } }
  .file-dialog-error { color: #f44336; }
  .file-dialog-text {
    margin: 0; padding: 12px;
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 12px; line-height: 1.5;
    white-space: pre-wrap; word-break: break-word;
    color: var(--_text);
    user-select: text;
    flex: 0 0 auto;
  }
  .file-dialog-textarea {
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    height: 100%;
    padding: 12px;
    box-sizing: border-box;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--_text);
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 12px; line-height: 1.5;
    resize: none;
    outline: none;
    caret-color: var(--_text, currentColor);
    user-select: text !important;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.4)) var(--_scroll-track, rgba(128,128,128,0.08));
  }
  /* 单独 textarea（无行号包裹）时的焦点环 */
  .file-dialog-textarea:focus {
    box-shadow: inset 0 0 0 1px var(--_primary);
  }
  /* ★ 2026-09-20：编辑器行号 + textarea 并排；焦点环画在整块 wrap 上，与查看器一致 */
  .file-dialog-editor-wrap {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    border-radius: 6px;
  }
  .file-dialog-editor-wrap:focus-within {
    box-shadow: inset 0 0 0 1px var(--_primary);
  }
  .file-dialog-editor-gutter {
    flex: 0 0 auto;
    box-sizing: content-box;
    height: 100%;
    overflow: hidden;
    padding: 12px 16px 12px 8px;
    border-right: 1px solid var(--_border, rgba(128,128,128,0.5));
    margin-right: 0;
    text-align: right;
    color: var(--_text-muted, rgba(128,128,128,0.85));
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 12px;
    line-height: 18px;
    white-space: pre;
    user-select: none;
    pointer-events: none;
    background: transparent;
  }
  .file-dialog-editor-wrap .file-dialog-textarea {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    padding-left: 16px;
    white-space: pre;
    overflow: auto;
    border-radius: 0;
    /* ★ 2026-10-16：显式声明 tab-size:8 —— 与查看器 .file-dialog-vs 的制表位口径一致
       （查看器切行按 tab = 8× 半角，见组件常量 VIEWER_TAB_SIZE）。两处一旦分叉，
       同一个文件在「查看」与「编辑」下制表符占宽不同，看起来像内容被改了；
       此前这里只靠浏览器默认值 8 巧合对齐。 */
    tab-size: 8;
    -moz-tab-size: 8;
  }
  /* ★ 2026-10-13 P1 修复：编辑器「自动换行」开关的落地样式。此前全仓没有任何 .is-soft-wrap
     规则——模板 [class.is-soft-wrap] 加了类也没有样式响应，同时被上方 white-space:pre 与
     静态 wrap="off" 双重锁死（勾选后仅行号栏消失，长行依然横向滚动）。特异性 (0,3,0)
     压过上方 (0,2,0) 的 pre 规则。 */
  .file-dialog-editor-wrap .file-dialog-textarea.is-soft-wrap {
    white-space: pre-wrap;
    overflow-wrap: break-word;
    overflow-x: hidden;
  }
  /* wrap 已画焦点环，避免 textarea 再叠一层 */
  .file-dialog-editor-wrap .file-dialog-textarea:focus {
    box-shadow: none;
  }
  /* ★ 2026-10-13：底部「自动换行 / 显示行号」开关此前全仓无样式定义，走浏览器默认 label
     排版（复选框与文字基线不齐、与相邻按钮间距不一致），且 .is-disabled（换行开启时行号
     开关置灰）没有任何置灰效果 —— 用户看不出它为什么点不动。 */
  .file-dialog-view-opt {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: 4px;
    padding: 2px 4px;
    font-size: 12px;
    line-height: 18px;
    color: var(--_text);
    opacity: 0.85;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .file-dialog-view-opt input[type='checkbox'] {
    width: 13px;
    height: 13px;
    margin: 0;
    accent-color: var(--_primary);
    cursor: pointer;
  }
  .file-dialog-view-opt:hover { opacity: 1; }
  .file-dialog-view-opt.is-disabled {
    opacity: 0.45;
    cursor: default;
  }
  .file-dialog-view-opt.is-disabled input[type='checkbox'] { cursor: default; }
  /* ★ 2026-09-20：查看器文本虚拟滚动（inner 撑滚动高度 + 窗口 translate；左侧行号） */
  .file-dialog-vs {
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
    height: 100%;
    padding: 12px;
    box-sizing: border-box;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--_text);
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 12px;
    line-height: 18px;
    /* ★ 2026-10-13：显式声明 tab-size，与组件常量 VIEWER_TAB_SIZE=8 绑定——
       此前 .file-dialog-vs 没写 tab-size，只是恰好撞上浏览器默认值 8 才与度量对齐；
       一旦宿主/主题注入 tab-size 或浏览器默认变动，渲染宽度与度量就会分叉
       （切行位置错、光标列偏移）。 */
    tab-size: 8;
    -moz-tab-size: 8;
    outline: none;
    overflow: auto;
    overscroll-behavior: contain;
    position: relative;
    cursor: text !important;
    caret-color: var(--_text, currentColor);
    user-select: text !important;
    scrollbar-width: thin;
    scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.4)) var(--_scroll-track, rgba(128,128,128,0.08));
  }
  .file-dialog-vs:focus {
    box-shadow: inset 0 0 0 1px var(--_primary);
  }
  .file-dialog-vs-inner {
    position: relative;
    width: 100%;
    box-sizing: border-box;
  }
  /* 自绘插入光标：宽高与竖直位置由组件按形状（block/beam/underline）内联给出，
     这里的 width/height 只是形状未传入时的兜底（beam 2x18） */
  .file-dialog-vs-caret {
    position: absolute;
    z-index: 2;
    width: 2px;
    height: 18px;
    background: var(--_text, #e5e5e5);
    pointer-events: none;
    animation: file-dialog-vs-caret-blink 1.06s step-end infinite;
  }
  /* 方块光标：与下方文字做差值混合，等价于终端里的「反色方块」——直接铺实心色会盖掉字符 */
  .file-dialog-vs-caret.is-block {
    mix-blend-mode: difference;
  }
  @keyframes file-dialog-vs-caret-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  /* ★ 2026-10-13 P1 修复：window 由 left:0;right:0（宽恒等于视口）改为
     width:max-content + min-width:100%——原结构下没有超宽内容，.file-dialog-vs 的
     overflow:auto 永不产生横向滚动，长行只能被文本层的 ellipsis 截断（「横向滚不动」）。
     换行模式行宽受 packRows 预切行约束，不依赖 ellipsis。 */
  .file-dialog-vs-window {
    position: absolute;
    left: 0;
    top: 0;
    width: max-content;
    min-width: 100%;
    will-change: transform;
  }
  .file-dialog-vs-line {
    display: flex;
    align-items: stretch;
    /* ★ 2026-10-19 P1（audit）：原写死 height/line-height:18px，而 JS 侧为绕 Chromium
       32M px 高度上限会按行数动态压缩行高并写 --vs-row-h（_applyVsRowHeightVar），
       总高 vsTotalHeight 也按压缩值算 —— 但**没有任何 CSS 消费该变量** ⇒
       DOM 行仍是 18px、inner 总高按压缩值算，滚动上限偏小，末尾约 17% 的行永远滚不到。
       改为变量优先、18px 兜底（变量在旧版本/首次渲染未写入时保持原外观）。 */
    height: var(--vs-row-h, 18px);
    line-height: var(--vs-row-h, 18px);
  }
  .file-dialog-vs-gutter {
    flex: 0 0 auto;
    /* content-box：min-width 只约束数字区，左右 padding 不会被吃掉贴死分隔线 */
    box-sizing: content-box;
    padding: 0 16px 0 8px;
    border-right: 1px solid var(--_border, rgba(128,128,128,0.5));
    text-align: right;
    color: var(--_text-muted, rgba(128,128,128,0.85));
    user-select: none;
    pointer-events: none;
  }
  /* ★ 2026-10-13 P1 修复：去掉 overflow:hidden + text-overflow:ellipsis——window 已按
     max-content 撑到最宽行，.file-dialog-vs 负责横向滚动；ellipsis 只会把长行截成
     「……」（且原结构下 scrollLeft 恒 0，根本滚不动）。min-width:0 保留：
     换行模式下预切行受 avail 约束，允许压缩。 */
  .file-dialog-vs-text {
    flex: 1 1 auto;
    min-width: 0;
    padding-left: 16px;
    white-space: pre;
    cursor: text !important;
  }
  .file-dialog-vs-text-nogutter {
    padding-left: 0;
  }
  .file-dialog-image-wrap {
    display: flex; align-items: center; justify-content: center;
    padding: 12px; min-height: 0; flex: 1;
    position: relative;
  }
  .file-dialog-image {
    max-width: 100%; max-height: 100%;
    object-fit: contain;
  }
  .image-nav {
    position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px;
    padding: 5px 10px; border-radius: 999px;
    background: var(--_content); border: 1px solid var(--_border);
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    z-index: 5;
  }
  .image-nav-btn {
    width: 30px; height: 30px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--_border); border-radius: 50%;
    background: transparent; color: var(--_text); cursor: pointer;
  }
  .image-nav-btn svg { width: 16px; height: 16px; }
  .image-nav-btn:hover:not(:disabled) { background: var(--_hover); }
  .image-nav-btn:disabled { opacity: 0.4; cursor: default; }
  .image-nav-pos { font-size: 12px; color: var(--_text); min-width: 52px; text-align: center; user-select: none; }
  .dialog-buttons {
    display: flex; justify-content: flex-end; align-items: center; gap: 8px;
    padding-top: 10px; flex-shrink: 0;
  }
  .dialog-buttons-left {
    margin-right: auto;
    display: flex; gap: 8px; align-items: center;
  }
  .dialog-buttons .file-dialog-system-btn {
    padding: 4px 12px; border-radius: 6px;
    border: 1px solid var(--_border);
    background: var(--_content);
    color: var(--_text); cursor: pointer;
    font-size: 12px; white-space: nowrap;
  }
  .dialog-buttons .file-dialog-system-btn:hover:not(:disabled) { background: var(--_hover); }
  .dialog-buttons .file-dialog-system-btn:disabled { opacity: 0.45; cursor: default; }
  .dialog-buttons button {
    padding: 4px 12px; border-radius: 6px;
    border: 1px solid var(--_border);
    background: var(--_content);
    color: var(--_text); cursor: pointer;
  }
  .dialog-buttons button:disabled { opacity: 0.45; cursor: default; }
  .dialog-buttons .btn-primary {
    background: var(--_primary, #3b82f6);
    border-color: var(--_primary, #3b82f6);
    color: #fff;
  }
  .file-dialog-title-wrap {
    display: flex; align-items: center; gap: 4px;
    flex: 1; min-width: 0;
  }
  /* 未保存标记紧挨文件名，避免被 title 的 flex:1 顶到最大化按钮旁 */
  .editor-dirty {
    color: #f59e0b;
    font-weight: 700;
    font-size: inherit;
    margin-left: 2px;
  }
  /* 编辑器：由 textarea 自行滚动，外层 body 不截断滚轮 */
  .editor-body {
    overflow: hidden;
  }
`

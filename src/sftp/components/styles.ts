/** SFTP+ 面板样式（合并自 panel-main-styles + file-dialog-shared-styles）
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-09-30 — ⑬ 顶栏 ✕ 的「蓝色光圈」根治，三处并改：
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
      top: 10px;
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
      from { opacity: 0; transform: translateX(-50%) translateY(-6px); }
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
    .sftp-root .sftp-overlays .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.6);
      z-index: 100;
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
    }
    .sftp-root .title { font-weight: 700; color: var(--_primary); font-size: 1.15em; flex-shrink: 0; white-space: nowrap; }
    /* ★ 2026-09-30：.host-info 是顶栏里唯一「内容长度不可控」的元素（user@host，长域名 30+ 字符）。
       原先 flex-shrink:0 ⇒ 面板变窄时它一分不让，而右侧 .top-actions 也无法收缩
       （7 个 28px 按钮 + 6 个 2px gap = 208px）⇒ 顶栏整体溢出面板右缘被裁掉，
       最后两个按钮（最大化 / 关闭）直接消失（用户实测：窄面板下 ✕ 完全不见、最大化只剩一半）。
       改为「唯一可压缩项 + 省略号」：先牺牲主机名文字，按钮永不被裁。
       配套：最小宽度已抬到 420px（见 sftp-floating-panel.component.ts 的 _geomMinW）。 */
    .sftp-root .host-info {
      font-size: 0.92em; opacity: 0.6; margin-left: 4px;
      flex: 0 1 auto; min-width: 0; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    /* 断开连接指示器 - 嵌入标题栏 */
    .sftp-root .disconnect-indicator {
      display: inline-flex; align-items: center; gap: 6px;
      margin-left: 8px; padding: 2px 10px 2px 8px;
      border-radius: 4px;
      background: rgba(239, 68, 68, 0.10);
      border: 1px solid rgba(239, 68, 68, 0.25);
      font-size: 12px;
      flex-shrink: 0;
    }
    .sftp-root .disconnect-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #ef4444; flex-shrink: 0;
      animation: pulse-dot 1.5s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .sftp-root .disconnect-tag { color: #ef4444; font-weight: 500; }
    .sftp-root .disconnect-indicator .reconnect-btn {
      padding: 1px 8px; border-radius: 3px;
      border: 1px solid rgba(239, 68, 68, 0.4);
      background: transparent;
      color: #ef4444; font-size: 11px; cursor: pointer;
      transition: background 0.12s;
      line-height: 20px;
    }
    .sftp-root .disconnect-indicator .reconnect-btn:hover { background: rgba(239, 68, 68, 0.15); }
    .sftp-root .disconnect-indicator .reconnect-btn:disabled { opacity: 0.4; cursor: default; }
    .sftp-root .top-actions { display: flex; gap: 2px; align-items: center; margin-left: auto; flex-shrink: 0; }
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
    .sftp-root:not(.workspace-mode) .top-bar .disconnect-indicator { cursor: pointer; }
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
    }
    .sftp-root .pane-label { font-weight: 600; font-size: 1em; white-space: nowrap; flex-shrink: 0; }
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
    .sftp-root .reconnect-btn:active {
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

    .sftp-root.has-zebra .entry:not(.header):nth-child(even) { background: var(--_surface); }
    /* 斑马纹偶数行 hover 需更高优先级覆盖斑马纹背景 */
    .sftp-root.has-zebra .entry:not(.header):nth-child(even):hover { background: color-mix(in srgb, var(--_primary) 57%, transparent); }
    /* 选中行 - 优先级最高，不受斑马纹影响 */
    .sftp-root .entry.selected,
    .sftp-root.has-zebra .entry:not(.header):nth-child(even).selected {
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
    /* ★ 2026-09-29：斑马纹 nth-child 在分组模式下奇偶被分组头打乱 → 不规则底色带，
       视觉上像间距不一；Windows 分组视图无斑马纹，分组模式整体禁用（选中/hover 不受影响） */
    .sftp-root.has-zebra .pane-list.has-groups .entry:not(.header):nth-child(even) { background: transparent; }
    .sftp-root.has-zebra .pane-list.has-groups .entry:not(.header):nth-child(even):hover {
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

    .sftp-root .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 100;
      /* 立即显示，无淡入动效 */
      transition: none !important;
      animation: none !important;
    }
    /* ★ 2026-08-26 C3：删除确认必须压过查看器(z=110)，避免被盖住后 Enter 隐形确认 */
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

    .sftp-root .delete-dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 12px; padding: 20px; min-width: 340px; max-width: 420px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }
    .sftp-root .delete-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .sftp-root .delete-header-icon { flex-shrink: 0; width: 14px !important; height: 14px !important; }
    .sftp-root .delete-warn-icon { flex-shrink: 0; width: 18px !important; height: 18px !important; }
    .sftp-root .delete-title { font-size: 15px; font-weight: 600; color: var(--_text); }
    .sftp-root .delete-text { font-size: 13px; color: var(--_text); margin-bottom: 12px; opacity: 0.85; }
    .sftp-root .delete-preview {
      border: 1px solid var(--_border);
      border-radius: 8px; padding: 12px; margin-bottom: 16px;
      background: var(--_content);
    }
    .sftp-root .delete-preview-row {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; padding: 2px 0;
    }
    .sftp-root .delete-preview-row + .delete-preview-row { margin-top: 3px; }
    .sftp-root .delete-preview-icon { flex-shrink: 0; color: var(--_text); opacity: 0.6; }
    .sftp-root .delete-preview-name { font-weight: 500; color: var(--_text); }
    .sftp-root .delete-preview-label { color: var(--_text); opacity: 0.5; min-width: 60px; }
    .sftp-root .delete-preview-value { color: var(--_text); }

    .sftp-root .bookmark-popup {
      position: absolute;
      width: 320px;
      max-height: 420px;
      box-sizing: border-box;
      display: flex; flex-direction: column;
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      z-index: 200;
      overflow: visible;
      transform: translateZ(0);
      transition: none !important;
      animation: none !important;
    }
    .sftp-root .popup-arrow {
      position: absolute; top: -7px;
      width: 12px; height: 12px;
      background: var(--_bg);
      border-left: 1px solid var(--_border);
      border-top: 1px solid var(--_border);
      transform: rotate(45deg);
      z-index: 1;
      pointer-events: none;
    }
    .sftp-root .popup-title {
      padding: 10px 14px 6px;
      font-weight: 700; color: var(--_primary); font-size: 13px;
    }
    .sftp-root .popup-footer {
      display: flex; justify-content: flex-end;
      padding: 6px 10px; border-top: 1px solid var(--_border);
    }
    .sftp-root .popup-footer button {
      padding: 4px 10px; border-radius: 6px; font-size: 11px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .sftp-root .popup-footer button:hover { background: var(--_hover); }
    .sftp-root .bookmark-add-btns { display: flex; gap: 6px; padding: 0 14px 10px; }
    .sftp-root .add-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 6px; font-size: 12px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .sftp-root .add-btn:hover { background: var(--_hover); }
    .sftp-root .add-btn.active { border-color: var(--_primary); background: rgba(59,130,246,0.08); }
    .sftp-root .add-icon { font-weight: 700; font-size: 14px; color: var(--_primary); }
    .sftp-root .bookmark-add-form {
      display: flex; flex-direction: column; gap: 6px;
      padding: 0 10px 10px;
    }
    .sftp-root .bookmark-add-form .bm-form-row {
      display: flex; gap: 6px; align-items: center;
    }
    .sftp-root .bookmark-add-form input {
      width: 100%; padding: 6px 8px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_input-bg);
      color: var(--_text); font-size: 1em;
      caret-color: var(--_text, currentColor);
      -webkit-text-fill-color: var(--_text, currentColor);
      cursor: text;
      user-select: text !important;
      -webkit-user-select: text !important;
      box-sizing: border-box; outline: none;
    }
    .sftp-root .bookmark-add-form input:focus,
    .sftp-root .bookmark-add-form input:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35) !important;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--_primary) 35%, transparent) !important;
      outline: none !important;
    }
    .sftp-root .bookmark-add-form .btn-confirm {
      align-self: flex-end;
      padding: 6px 16px; border-radius: 4px;
      border: 1px solid var(--_primary);
      background: var(--_primary);
      color: #fff; cursor: pointer; font-size: 12px; white-space: nowrap;
    }
    .sftp-root .bookmark-add-form .btn-confirm:disabled { opacity: 0.4; }
    .sftp-root .bookmark-scope-label {
      padding: 4px 10px 2px; font-size: 10px; font-weight: 600;
      color: var(--_primary); opacity: 0.6; text-transform: uppercase;
      border-bottom: 1px solid var(--_border); margin-bottom: 2px;
    }
    .sftp-root .bookmark-list {
      flex: 1; overflow-y: auto; min-height: 0;
      padding: 0 4px;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
    }
    .sftp-root .bookmark-empty {
      padding: 24px 8px; text-align: center;
      font-size: 12px; opacity: 0.4; color: var(--_text);
    }
    .sftp-root .bookmark-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 6px; margin: 1px 0;
      cursor: pointer; transition: background 0.1s, opacity 0.15s;
    }
    .sftp-root .bookmark-item:hover { background: var(--_hover); }
    .sftp-root .bookmark-item.dragging { opacity: 0.4; }
    .sftp-root .bookmark-item.drag-over-top {
      border-top: 2px solid var(--_primary);
      padding-top: 3px;
    }
    .sftp-root .bookmark-item.drag-over-bottom {
      border-bottom: 2px solid var(--_primary);
      padding-bottom: 3px;
    }
    .sftp-root .bm-drag-handle {
      flex-shrink: 0; font-size: 14px; line-height: 1; color: var(--_text-muted);
      cursor: grab; opacity: 0.5; user-select: none; letter-spacing: -2px;
    }
    .sftp-root .bm-drag-handle:hover { opacity: 0.8; }
    .sftp-root .bm-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 1px;
    }
    .sftp-root .bm-name {
      font-size: 13px; font-weight: 500; color: var(--_text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sftp-root .bm-path {
      font-size: 10px; color: var(--_text); opacity: 0.45;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sftp-root .bm-remove {
      flex-shrink: 0; width: 22px; height: 22px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 4px; background: transparent;
      color: var(--_text); opacity: 0.3; font-size: 12px;
      cursor: pointer; line-height: 1;
    }
    .sftp-root .bm-remove:hover { opacity: 0.8; background: var(--_hover); }

    .sftp-root .context-menu {
      position: fixed;
      z-index: 902;
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 6px;
      padding: 4px 0;
      min-width: 140px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
    }
    .sftp-root .ctx-item {
      padding: 5px 14px;
      cursor: pointer;
      font-size: 12px;
      color: var(--_text);
      white-space: nowrap;
    }
    .sftp-root .ctx-check {
      display: inline-block;
      width: 14px;
      text-align: center;
    }
    .sftp-root .ctx-item:hover {
      background: var(--_hover);
    }
    .sftp-root .ctx-item.ctx-danger:hover {
      background: rgba(244,67,54,0.15);
      color: #f44336;
    }
    .sftp-root .ctx-sep {
      height: 1px;
      background: var(--_border, #334155);
      margin: 3px 0;
    }
    .sftp-root .ctx-item.ctx-disabled {
      cursor: default;
      opacity: 0.5;
    }
    .sftp-root .ctx-item.ctx-disabled:hover {
      background: transparent;
    }
    .sftp-root .ctx-shortcut {
      float: right;
      margin-left: 20px;
      opacity: 0.5;
      font-size: 11px;
    }
    .sftp-root .mode { font-size: 1em; font-family: inherit; text-align: left; }
    /* 详细信息对话框 */
    .sftp-root .details-dialog { min-width: 400px; max-width: 500px; }
    .sftp-root .details-body { margin: 8px 0; }
    .sftp-root .details-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .sftp-root .details-table td { padding: 4px 6px; vertical-align: top; border-bottom: 1px solid var(--_border, #334155); }
    .sftp-root .dt-label { width: 80px; opacity: 0.7; white-space: nowrap; }
    .sftp-root .dt-value { word-break: break-all; }
    .sftp-root .dt-path { font-family: monospace; font-size: 11px; }
    /* 权限编辑对话框 */
    .sftp-root .perm-dialog { min-width: 360px; }
    .sftp-root .perm-target-name {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--_input-bg);
      word-break: break-all;
    }
    .sftp-root .perm-grid {
      display: grid;
      grid-template-columns: 80px repeat(3, auto);
      gap: 8px;
      align-items: center;
      justify-items: center;
      margin: 12px 0;
    }
    .sftp-root .perm-header {
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--_primary);
    }
    .sftp-root .perm-label {
      font-size: 12px;
      font-weight: 600;
      justify-self: start;
    }
    .sftp-root .perm-grid input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--_primary);
      cursor: pointer;
    }
    .sftp-root .perm-preview {
      font-family: monospace;
      font-size: 13px;
      padding: 6px 8px;
      border-radius: 4px;
      background: var(--_input-bg);
      border: 1px solid var(--_border);
      color: var(--_text);
      margin-bottom: 12px;
    }

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
  }
  /* wrap 已画焦点环，避免 textarea 再叠一层 */
  .file-dialog-editor-wrap .file-dialog-textarea:focus {
    box-shadow: none;
  }
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
  .file-dialog-vs-window {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    will-change: transform;
  }
  .file-dialog-vs-line {
    display: flex;
    align-items: stretch;
    height: 18px;
    line-height: 18px;
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
  .file-dialog-vs-text {
    flex: 1 1 auto;
    min-width: 0;
    padding-left: 16px;
    white-space: pre;
    overflow: hidden;
    text-overflow: ellipsis;
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

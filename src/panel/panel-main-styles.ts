/** SFTP+ 主面板样式（从 sftp-floating-panel 抽离） */
export const SFTP_PANEL_STYLES = `
    :host {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
      box-sizing: border-box;
      outline: none !important;
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
      font-size: 13px;
      font-family: var(--font-family, 'Segoe UI', sans-serif);
      box-sizing: border-box;
      pointer-events: auto;
      outline: none;
      transition: none !important;
      animation: none !important;
    }
    .sftp-root.workspace-mode {
      padding: 0;
      border-radius: 0;
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
      overflow: hidden;
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
    .sftp-root .title { font-weight: 700; color: var(--_primary); font-size: 15px; }
    .sftp-root .host-info { font-size: 12px; opacity: 0.6; margin-left: 4px; flex-shrink: 0; }
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
      opacity: 0.5;
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
    .sftp-root .pane-label { font-weight: 600; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
    .sftp-root .pane-path { display: flex; gap: 4px; min-width: 0; overflow: hidden; flex: 1 1 auto; }
    .sftp-root .path-input {
      flex: 1; min-width: 40px; padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--input-bg, var(--_input-bg));
      color: var(--_text); font-size: 12px;
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
      flex: 1; padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--input-bg, var(--_input-bg));
      color: var(--_text); font-size: 12px;
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
      font-size: 12px;
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
    .sftp-root .entry.header {
      /* 确保表头完全不透明 */
      background: var(--_content);
      font-weight: 600; font-size: 12px;
      position: sticky; top: 0;
      z-index: 5;
      color: var(--_primary);
      border-bottom: 2px solid var(--_primary);
      padding-top: 6px;
    }
    /* 强制表头所有列文字完全不透明 */
    .sftp-root .entry.header > span { opacity: 1 !important; }
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
    .sftp-root .icon { text-align: center; font-size: 14px; width: 24px; }
    .sftp-root .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-family: inherit; }
    .sftp-root .size { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .sftp-root .date { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; }
    .sftp-root .perms { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .sftp-root .mode { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .sftp-root .access { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; }
    .sftp-root .owner { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .sftp-root .group { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
    .sftp-root .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; }
    .sftp-root .ext { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-family: inherit; text-align: left; }
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
    /* 拖拽中：原位置表头变淡，表示“正在拖走” */
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
    .sftp-root .pane-empty { padding: 20px; text-align: center; opacity: 0.4; font-size: 12px; }

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
    .sftp-root .selection-info { font-size: 12px; opacity: 0.7; min-width: 60px; }
    .sftp-root .size-hint { opacity: 0.5; font-size: 11px; }
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
      color: var(--_text); font-size: 12px;
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
      color: var(--_text); font-size: 12px;
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
      z-index: 100001;
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
    .sftp-root .mode { font-size: 12px; font-family: inherit; text-align: left; }
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
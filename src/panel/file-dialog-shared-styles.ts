/** 查看 / 编辑对话框共用布局样式 */
export const FILE_DIALOG_SHARED_STYLES = `
  .overlay {
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
    max-height: min(80vh, 720px);
    transition: width 0.15s ease, height 0.15s ease, max-height 0.15s ease, border-radius 0.15s ease;
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
  .file-dialog-textarea:focus {
    box-shadow: inset 0 0 0 1px var(--_primary);
  }
  .file-dialog-image-wrap {
    display: flex; align-items: center; justify-content: center;
    padding: 12px; min-height: 0; flex: 1;
  }
  .file-dialog-image {
    max-width: 100%; max-height: 100%;
    object-fit: contain;
  }
  .dialog-buttons {
    display: flex; justify-content: flex-end; align-items: center; gap: 8px;
    padding-top: 10px; flex-shrink: 0;
  }
  .dialog-buttons .file-dialog-system-btn {
    margin-right: auto;
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
  .editor-dirty { color: #f59e0b; font-size: 16px; flex-shrink: 0; }
  /* 编辑器：由 textarea 自行滚动，外层 body 不截断滚轮 */
  .editor-body {
    overflow: hidden;
  }
`

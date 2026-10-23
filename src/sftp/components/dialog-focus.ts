/**
 * 模态对话框键盘交互共享helper（焦点陷阱 + Enter 按目标分流）
 * 创建人：DD1024z + Step-5-Preview
 * 创建时间：2026-10-13
 *
 * ★ 2026-10-13 全量审计修复的两个 P1，根因相同、形态相同，故收口到本模块：
 *   ① P0/P1「Enter 劫持」：删除确认框 / 目录不存在框 / 冲突框的 overlay 级 keydown 把
 *      Enter 无条件映射为默认动作（confirm / create / skip）且 stopImmediatePropagation。
 *      焦点落在「否 / 取消 / ×」按钮上时，preventDefault 会取消按钮的默认激活，
 *      宿主 document 层兜底又收不到 ⇒ 用户按回车执行的是**非所选动作**
 *      （删除框最严重：焦点在「否」上仍执行删除）。
 *   ② P1「焦点逃逸」：全部模态只做了视觉遮罩，overlay 仅 tabindex=-1 自聚焦，
 *      没有 Tab 循环、背景未设 inert ⇒ Shift+Tab 可退到传输队列等背景控件，
 *      在模态背后触发暂停/取消传输（幽灵交互）。
 *
 * 两个修复都要求「先看 event.target 是谁」，因此合并为一个入口 handleOverlayKeydown，
 * 各对话框的 (keydown) 直接调它，再处理自己的 Esc/默认键。
 *
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-16 — P0 回归修复：Enter 在**全部**模态里失效（用户报障「删除确认框按回车
 *              无法确认」。根因：① 的修法用了 `target.closest('…, [tabindex]:not([tabindex="-1"])')`
 *              判定「焦点是否在可激活元素上」，而 `closest()` 会一路向上**走出对话框**，
 *              命中面板根 `.sftp-root` 的 `tabindex="0"`（它是所有对话框遮罩的祖先）⇒
 *              永远判定为「可激活」⇒ handleOverlayKeydown 一律 return（交还原生），
 *              而焦点其实停在 tabindex="-1" 的遮罩上，原生 Enter 什么也不做 ⇒
 *              删除/冲突/目录不存在三个传了 onEnter 的对话框回车全部失效。
 *              修法：自行向上遍历并**在 container 处止步**（见 isActivatableWithinDialog）。
 */

/** Enter 分流用：对话框内「可激活元素」判定 **不会走出对话框**。
 *
 *  ⛔ 为什么不能直接用 target.closest(SEL)：closest 会穿过对话框一路走到文档根。
 *     本项目所有对话框遮罩的祖先 `.sftp-root` 带 `tabindex="0"`，恰好命中
 *     `[tabindex]:not([tabindex="-1"])` ⇒ 判定恒为真 ⇒ Enter 永远被交还「原生」，
 *     而焦点停在 tabindex="-1" 的遮罩上时原生 Enter 无任何行为 ⇒ 回车彻底失效。
 *     故改为自行向上遍历、遇到 container 即停（container 自身仍参与匹配）。
 *     未传 container 时退化为与 closest 相同的「一路上溯」语义（向后兼容）。
 */
function isActivatableWithinDialog(target: HTMLElement | null, container?: HTMLElement | null): boolean {
  if (!target) return false
  const SEL = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  let el: HTMLElement | null = target
  while (el) {
    if (typeof el.matches === 'function' && el.matches(SEL)) return true
    if (container && el === container) return false
    el = el.parentElement
  }
  return false
}

/**
 * 模态对话框 overlay 的 keydown 统一入口。
 *
 * @param event    keydown 事件
 * @param container overlay 根元素（对话框容器；为空则只做 Enter 分流）
 * @param opts.onEnter 焦点**不在**任何按钮上时 Enter 的默认动作（确认类对话框传）
 *
 * 行为：
 *   · Tab / Shift+Tab —— 在 container 内可聚焦元素间循环（焦点陷阱）；
 *   · Enter           —— 焦点已在 button/input/a 等可激活元素上时**交还原生行为**
 *                       （不 preventDefault、不 stopImmediatePropagation）；
 *                       否则执行 opts.onEnter（默认动作）。
 */
export function handleOverlayKeydown(
  event: KeyboardEvent,
  container?: HTMLElement | null,
  opts?: { onEnter?: () => void },
): void {
  if (event.key === 'Tab' && container) {
    trapDialogTab(event, container)
    return
  }
  if (event.key !== 'Enter') return
  // 焦点已在可激活元素上：交还原生激活（按钮 click / 输入法确认等），绝不劫持。
  // 判定必须**限定在对话框内**，否则会被祖先 .sftp-root 的 tabindex="0" 误判（见上）。
  const target = event.target as HTMLElement | null
  if (isActivatableWithinDialog(target, container)) return
  if (!opts?.onEnter) return
  event.preventDefault()
  event.stopImmediatePropagation()
  opts.onEnter()
}

/** 焦点陷阱：Tab/Shift+Tab 在容器内首尾循环，不逃逸到背景 */
export function trapDialogTab(event: KeyboardEvent, container: HTMLElement): void {
  const focusable = container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
  )
  if (focusable.length === 0) {
    // 没有可聚焦元素：阻止 Tab 逃逸到背景
    event.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (!active || !container.contains(active)) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
    return
  }
  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

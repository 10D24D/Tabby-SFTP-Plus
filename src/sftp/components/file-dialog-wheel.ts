/** 对话框内滚动：阻止滚轮穿透到底层文件面板，但保留区域内原生滚动 */

function isScrollable(el: HTMLElement): boolean {
  const style = getComputedStyle(el)
  const oy = style.overflowY
  const canY = (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollHeight > el.clientHeight + 1
  const ox = style.overflowX
  const canX = (ox === 'auto' || ox === 'scroll' || ox === 'overlay') && el.scrollWidth > el.clientWidth + 1
  return canY || canX
}

function findScrollable(from: EventTarget | null, boundary: EventTarget | null): HTMLElement | null {
  let el = from as HTMLElement | null
  const root = boundary as HTMLElement | null
  while (el && el !== root?.parentElement) {
    if (el instanceof HTMLElement && isScrollable(el)) return el
    if (el === root) break
    el = el.parentElement
  }
  return root && root instanceof HTMLElement && isScrollable(root) ? root : null
}

export function onFileDialogOverlayWheel(ev: WheelEvent): void {
  ev.stopPropagation()
  // 点在蒙层空白处：阻止穿透；对话框内交由内部滚动容器处理
  if (ev.target === ev.currentTarget) {
    ev.preventDefault()
  }
}

export function onFileDialogScrollableWheel(ev: WheelEvent): void {
  // 仅阻断冒泡到面板列表；不擅自 preventDefault，避免把可滚动区域“锁死”
  ev.stopPropagation()

  const boundary = ev.currentTarget as HTMLElement
  const scroller = findScrollable(ev.target, boundary)
  if (!scroller) {
    // 区域内无可滚内容：吞掉以免带动下层面板
    ev.preventDefault()
    return
  }

  const { scrollTop, scrollLeft, scrollHeight, clientHeight, scrollWidth, clientWidth } = scroller
  const atTop = scrollTop <= 0
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1
  const atLeft = scrollLeft <= 0
  const atRight = scrollLeft + clientWidth >= scrollWidth - 1

  const dy = ev.deltaY
  const dx = ev.deltaX
  const verticalBlocked = (dy < 0 && atTop) || (dy > 0 && atBottom)
  const horizontalBlocked = (dx < 0 && atLeft) || (dx > 0 && atRight)

  // 已到边界时阻止链式滚动穿透；中间区域交给浏览器默认滚动
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (verticalBlocked) ev.preventDefault()
  } else if (horizontalBlocked) {
    ev.preventDefault()
  }
}

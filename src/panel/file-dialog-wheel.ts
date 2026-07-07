/** 对话框内滚动：阻止滚轮穿透到底层文件面板 */

export function onFileDialogOverlayWheel(ev: WheelEvent): void {
  ev.stopPropagation()
  if (ev.target === ev.currentTarget) {
    ev.preventDefault()
  }
}

export function onFileDialogScrollableWheel(ev: WheelEvent): void {
  ev.stopPropagation()
  const el = ev.currentTarget as HTMLElement
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollHeight <= clientHeight) {
    ev.preventDefault()
    return
  }
  const atTop = scrollTop <= 0
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1
  if ((ev.deltaY < 0 && atTop) || (ev.deltaY > 0 && atBottom)) {
    ev.preventDefault()
  }
}

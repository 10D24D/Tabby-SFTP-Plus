/**
 * 定时器集中管理器
 * 功能描述：统一管理 setTimeout/setInterval，组件销毁时一键清理全部定时器，避免内存泄漏。
 * @创建人：Qoder (AI Assistant)
 * @创建时间：2026-10-20
 */

export class TimerManager {
  private timeouts = new Set<ReturnType<typeof setTimeout>>()
  private intervals = new Set<ReturnType<typeof setInterval>>()
  private rafs = new Set<number>()

  /**
   * 创建 setTimeout，自动追踪，支持手动取消
   */
  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.timeouts.delete(id)
      fn()
    }, ms)
    this.timeouts.add(id)
    return id
  }

  /**
   * 创建 setInterval，自动追踪，支持手动取消
   */
  setInterval(fn: () => void, ms: number): ReturnType<typeof setInterval> {
    const id = setInterval(() => fn(), ms)
    this.intervals.add(id)
    return id
  }

  /**
   * 创建 requestAnimationFrame，自动追踪
   */
  requestAnimationFrame(fn: () => void): number {
    const id = requestAnimationFrame(() => {
      this.rafs.delete(id)
      fn()
    })
    this.rafs.add(id)
    return id
  }

  /**
   * 手动清理单个 timeout
   */
  clearTimeout(id: ReturnType<typeof setTimeout> | null): void {
    if (id !== null) {
      clearTimeout(id)
      this.timeouts.delete(id)
    }
  }

  /**
   * 手动清理单个 interval
   */
  clearInterval(id: ReturnType<typeof setInterval> | null): void {
    if (id !== null) {
      clearInterval(id)
      this.intervals.delete(id)
    }
  }

  /**
   * 手动清理单个 rAF
   */
  cancelAnimationFrame(id: number | null): void {
    if (id !== null) {
      cancelAnimationFrame(id)
      this.rafs.delete(id)
    }
  }

  /**
   * 清理全部定时器（组件销毁时调用）
   */
  clearAll(): void {
    for (const t of this.timeouts) clearTimeout(t)
    this.timeouts.clear()
    for (const i of this.intervals) clearInterval(i)
    this.intervals.clear()
    for (const r of this.rafs) cancelAnimationFrame(r)
    this.rafs.clear()
  }

  /**
   * 当前追踪中的定时器数量（调试用）
   */
  get size(): number {
    return this.timeouts.size + this.intervals.size + this.rafs.size
  }
}

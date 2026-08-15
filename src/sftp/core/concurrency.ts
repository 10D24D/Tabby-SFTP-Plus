/**
 * 功能描述：SFTP+ 目录内文件级并发控制（并发限制器）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-10
 * 说明：目录传输内部原为 for await 串行递归（GitHub issue #10），大量小文件
 *   每个都要等一次网络往返。本限制器供目录递归各层共享，把单次目录传输的
 *   在途文件流总数限制在并发上限内（SFTP 请求在同一会话上多路复用，无需多开会话）。
 */

/** 并发限制器：槽位交接模式。acquire/release 必须成对；release 时若有等待者
 *  直接把槽位交接过去（不递减计数），否则递减。单线程事件循环下无竞态。 */
export class ConcurrencyLimiter {
  private _active = 0
  private readonly _waiters: Array<() => void> = []

  constructor(private readonly _limit: number) {}

  async acquire(): Promise<void> {
    if (this._active < this._limit) {
      this._active++
      return
    }
    // 槽位由 release() 直接交接，唤醒时即视为已持有
    await new Promise<void>(resolve => this._waiters.push(resolve))
  }

  release(): void {
    const next = this._waiters.shift()
    if (next) {
      next()
    } else {
      this._active--
    }
  }

  /** 占用一个槽位执行任务，无论成败都保证释放 */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }
}

/** 目录内并发数范围约束（1-10），非法/缺省回落默认 3 */
export function clampDirConcurrency(v: number | undefined): number {
  if (v == null || !Number.isFinite(v)) return 3
  return Math.min(10, Math.max(1, Math.round(v)))
}

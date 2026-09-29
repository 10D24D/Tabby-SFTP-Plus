/**
 * 功能描述：全局「传输进度时钟」——记录**最近一次真正搬运了字节**的时刻。
 *
 *   用途：给心跳（connection-lifecycle）提供一个比「发探测请求」更可靠的存活依据。
 *
 *   **为什么需要它（2026-09-26 P0 实证）**：
 *   SFTP 是单通道多路复用，探测用的 `stat('.')` 与数据块的 read/write **共用同一条通道**。
 *   大流量下载时通道被数据请求占满，探测请求只能排队 → 必然超时；心跳于是把
 *   **健康但繁忙**的会话判成「通道死亡」，走恢复流程 `abortInFlightTransfers()` +
 *   `forceInvalidate()`：既取消了正在跑的传输，又 end 掉会话。
 *   用户侧表现 =「凡下载必失败、上传却没事」，且失败是静默的（取消不掉错误）。
 *
 *   **判据反转**：只要字节还在流动，通道就一定是活的——**数据本身才是最可靠的探针**。
 *   因此心跳在探测前先看这里：若近期有字节推进，直接跳过本轮探测并清零失败连击，
 *   既不会误判死亡，也不再给已经饱和的通道加压。
 *
 *   ⚠ 时钟是**模块级全局**（跨面板/跨标签共享）：插件内同一 SSH 会话下的 SFTP 通道是共享的，
 *     任一传输在推进即证明该通道存活；反之若所有传输都停了，时钟自然变旧，心跳恢复探测。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-26
 */

/** 最近一次有字节推进的时刻（0 = 本次进程内从未有过传输） */
let _lastProgressAt = 0

/**
 * 标记「刚刚搬运了字节」。由字节级传输对象在每成功读/写一块后调用，
 * 开销仅一次 `Date.now()`，可放心放在热路径上。
 */
export function markTransferProgress(): void {
  _lastProgressAt = Date.now()
}

/**
 * 距最近一次字节推进的毫秒数。
 * 从未有过任何传输时返回 `Infinity`（含义＝「没有证据表明通道活着」，心跳按原逻辑探测）。
 */
export function getTransferProgressAgeMs(): number {
  if (_lastProgressAt === 0) return Number.POSITIVE_INFINITY
  return Date.now() - _lastProgressAt
}

/** 重置时钟（测试用；正常流程不需要调用） */
export function resetTransferProgressClock(): void {
  _lastProgressAt = 0
}

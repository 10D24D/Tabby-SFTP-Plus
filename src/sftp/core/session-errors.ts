/**
 * 功能描述：SFTP/SSH「通道级故障」错误识别（叶子模块，零依赖，供 core 与组件共用）。
 *   用于区分两类失败：
 *     ① 通道已死（session/channel closed、连接被重置…）→ 可以**静默重建通道后重试**；
 *     ② 普通业务失败（权限、路径不存在、超时…）→ 必须原样报给用户。
 *   背景（issue #25）：网络抖动把 SFTP 子通道关掉后，目录刷新会直接
 *   `log.error('Remote listing failed', …)` 并清空列表；用户每点一次刷新就多一条
 *   `UnexpectedBehavior("session closed")`（实测日志 129 条），而这类失败本可先静默换通道。
 *
 *   ⚠️ 判据刻意保守：**超时类不算通道已死**。大流量下 stat/readdir 排队超时是「活着但忙」，
 *   把它当通道已死正是 2026-09-25 / 09-26 两轮 P0 的成因（误杀健康会话 + 中断在途传输）。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 */

/** 明确表示「会话 / 通道已经关闭」的错误文本（大小写不敏感，逐条比对 message 或 description） */
const CHANNEL_DEAD_TEXT: RegExp[] = [
  /session closed/i,
  /session is closed/i,
  /session has ended/i,
  /channel closed/i,
  /no such session/i,
  /not connected/i,
  /connection (?:lost|reset|closed|ended)/i,
  /broken pipe/i,
]

/** 明确表示「连接已断」的错误码（Node errno / ssh2 code） */
const CHANNEL_DEAD_CODES = new Set([
  'ECONNRESET',
  'ECONNABORTED',
  'ENOTCONN',
  'EPIPE',
  'ERR_SOCKET_CLOSED',
])

/** 取出错误文本（兼容 string / Error / ssh2 的 {description} 形状） */
export function channelErrorText(e: unknown): string {
  if (e === null || e === undefined) return ''
  if (typeof e === 'string') return e
  const any = e as { message?: unknown; description?: unknown; stack?: unknown }
  const parts: string[] = []
  if (typeof any.description === 'string') parts.push(any.description)
  if (typeof any.message === 'string') parts.push(any.message)
  if (!parts.length && typeof any.stack === 'string') parts.push(any.stack)
  return parts.join(' | ')
}

/**
 * 该错误是否表示「通道已死」（可静默重建通道后重试）。
 * 只认明确的 closed / reset / not-connected 信号；超时、权限、路径类一律返回 false。
 */
export function isChannelDeadError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null | undefined)?.code
  if (typeof code === 'string' && CHANNEL_DEAD_CODES.has(code)) return true
  const text = channelErrorText(e)
  if (!text) return false
  return CHANNEL_DEAD_TEXT.some(re => re.test(text))
}

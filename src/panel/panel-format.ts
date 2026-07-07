/**
 * SFTP+ 面板纯函数格式化工具
 */
import type { TransferLogEntry } from '../sftp-transfer-log.service'

export function isUploadLikeOperation(op: TransferLogEntry['operation']): boolean {
  return op === 'upload' || op === 'edit-upload'
}

export function formatSize(bytes?: number): string {
  if (bytes == null) return ''
  if (bytes === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes, i = 0
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

export function formatDate(ms?: number): string {
  if (ms == null) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatPercent(n: number): string {
  return Math.round(n).toString()
}

export function formatLogTime(ts?: number | Date): string {
  if (ts == null) return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatLogTimeRange(entry: TransferLogEntry): string {
  const st = entry.startTime || entry.timestamp
  const et = entry.endTime
  if (!et) {
    const d = new Date(st)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const ds = new Date(st)
  const de = new Date(et)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${fmt(ds)} → ${fmt(de)}`
}

export function formatFailReason(entry: TransferLogEntry, isZh: boolean): string {
  if (entry.success) return ''
  switch (entry.failReason) {
    case 'cancelled': return isZh ? '用户取消' : 'Cancelled'
    case 'interrupted': return isZh ? '连接中断' : 'Disconnected'
    default: return isZh ? '失败' : 'Failed'
  }
}

export function getLogFileName(entry: TransferLogEntry): string {
  if (entry.localPath) {
    const name = entry.localPath.replace(/\\/g, '/').split('/').filter(Boolean).pop()
    if (name) return name
  }
  if (entry.remotePath) {
    const name = entry.remotePath.replace(/\\/g, '/').split('/').filter(Boolean).pop()
    if (name) return name
  }
  return entry.operation
}

export function formatDuration(ms: number): string {
  if (ms == null || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m${s}s`
}

export function formatSpeedFromSize(size: number, duration: number): string {
  if (!size || !duration) return '--'
  const bps = (size / duration) * 1000
  if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
  return Math.round(bps) + ' B/s'
}

export function formatTransferSpeed(bytes: number, ms: number): string {
  if (bytes <= 0 || ms <= 0) return ''
  const bps = (bytes / ms) * 1000
  if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
  return Math.round(bps) + ' B/s'
}

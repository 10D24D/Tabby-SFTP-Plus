/**
 * 传输日志服务
 * 功能描述：记录所有文件传输操作（上传/下载/删除等），支持查看和导出
 *   存储到 localStorage，避免污染 Tabby 配置文件
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Pro
 * 修改时间：2026-07-01
 *   添加日志限制（上限1000条）、按类型/状态筛选、JSON导出功能
 *   传输日志按连接配置隔离（clearProfile）
 *   改为 localStorage 存储，不再写入 Tabby config.yaml
 *   添加 startTime / endTime 字段
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-11
 *   修复"共N条只渲染1行"：_sanitizeIds 在 load/importLogs 时为缺失/重复 id 的旧日志补 id，
 *   配合对话框 trackBy 回退 index，避免 *ngFor 把多条折叠成1行
 * 修改时间：2026-07-12
 *   真因修复"共N条只渲染1行"：_sanitizeIds 同时强转 size/duration/timestamp 等数字字段，
 *   旧日志这些字段可能被序列化成字符串，导致 formatSize 的 .toFixed 抛 TypeError → *ngFor 该行被丢弃
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-23
 *   新增可选字段 pending：传输进行中为 true（add 时即写入，完成/取消时才 update），
 *   修复"传输中误显示下载成功 ✓ 0ms"——旧实现 add 时即写入 success=true/duration=0，
 *   完成才 update，期间日志一直显示成功；新增 pending 后日志可区分进行中/已完成。
 */
import { Injectable, Optional } from '@angular/core'
import { ConfigService } from 'tabby-core'

import { log } from './sftp-logger'
export type TransferLogEntry = {
  id: string
  timestamp: number
  operation: 'upload' | 'download' | 'edit-upload' | 'edit-download' | 'delete' | 'rename' | 'mkdir' | 'chmod'
  localPath: string
  remotePath: string
  profileName?: string
  success: boolean
  error?: string
  size?: number
  duration?: number  // milliseconds
  startTime?: number  // 传输开始时间 (ms timestamp)
  endTime?: number    // 传输结束时间 (ms timestamp)
  failReason?: 'interrupted' | 'cancelled' | 'error'  // 失败原因分类
  /** 传输进行中（未完成）：true=进行中；false/undefined=已完成（按 success 判定成功/失败）。
   *  修复"传输中误显示下载成功"——日志条目在 add 时即写入，传输完成才 update；缺此标志会导致
   *  进度期间日志显示 0ms ✓。 */
  pending?: boolean
}

const STORAGE_KEY = 'sftp-plus-transfer-logs'
const MAX_LOGS = 1000

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

@Injectable()
export class SftpTransferLogService {
  private logs: TransferLogEntry[] = []
  private _loaded = false

  constructor(@Optional() private configService?: ConfigService) {
    this.load()
  }

  private load(): void {
    if (this._loaded) return
    this._loaded = true
    // 从 localStorage 加载
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.logs = this._sanitizeIds(parsed)
          this._reapStaleEntries()
          return
        }
      }
    } catch { /* fall through */ }
    // 迁移：从旧版 Tabby 配置加载（仅首次。检查长度>0 避免重复空删）
    if (this.configService?.store) {
      try {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg && Array.isArray(cfg.transferLogs) && cfg.transferLogs.length > 0) {
          this.logs = this._sanitizeIds([...cfg.transferLogs])
          this._reapStaleEntries()
          // 迁移后彻底删除 config 中的 transferLogs（传输日志只存 localStorage）
          delete cfg.transferLogs
          try { this.configService.save() } catch {}
          this.save()
          return
        }
      } catch {}
    }
    this.logs = []
  }

  /**
   * 清理残留的"传输中"条目：应用重启后，所有 pending=true 的条目都是上次中断遗留的，
   * 标记为 interrupted 避免面板永远显示"传输中"。
   */
  private _reapStaleEntries(): void {
    let changed = false
    const now = Date.now()
    for (const entry of this.logs) {
      if (entry.pending) {
        entry.pending = false
        entry.success = false
        entry.failReason = 'interrupted'
        entry.endTime = now
        changed = true
      }
    }
    if (changed) this.save()
  }

  /** 清洗旧日志：补缺失/重复 id；强转数字字段（旧 config.yaml/JSON 导入时 size/duration/timestamp 可能被序列化成字符串，导致 formatSize 的 .toFixed 抛 TypeError → *ngFor 该行被丢弃 → "共N条只显示1行"） */
  private _sanitizeIds(logs: TransferLogEntry[]): TransferLogEntry[] {
    const seen = new Set<string>()
    const num = (v: unknown): number | undefined => {
      const x = Number(v)
      return isFinite(x) ? x : undefined
    }
    return logs.map(l => {
      let id = l.id
      if (!id || seen.has(id)) id = generateId()
      seen.add(id)
      return {
        ...l,
        id,
        timestamp: num(l.timestamp) ?? Date.now(),
        size: l.size != null ? num(l.size) : undefined,
        duration: l.duration != null ? num(l.duration) : undefined,
        startTime: l.startTime != null ? num(l.startTime) : undefined,
        endTime: l.endTime != null ? num(l.endTime) : undefined,
      }
    })
  }

  private save(): void {
    // 保留最近 MAX_LOGS 条记录
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS)
    }
    // 写入 localStorage（含字节大小保护，防止超出 ~5MB 配额）
    try {
      const MAX_BYTES = 4 * 1024 * 1024 // 4 MB
      let serialized = JSON.stringify(this.logs)
      while (serialized.length > MAX_BYTES && this.logs.length > 1) {
        // 丢弃最旧的一半，直到大小合规
        this.logs = this.logs.slice(-Math.ceil(this.logs.length / 2))
        serialized = JSON.stringify(this.logs)
      }
      localStorage.setItem(STORAGE_KEY, serialized)
    } catch (e) { log.warn('localStorage save failed', e) }
  }

  /**
   * 添加传输日志
   * 功能描述：记录一次文件传输操作
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-21
   */
  add(entry: Omit<TransferLogEntry, 'id' | 'timestamp'>): TransferLogEntry {
    const fullEntry: TransferLogEntry = {
      ...entry,
      id: generateId(),
      timestamp: Date.now(),
    }
    this.logs.push(fullEntry)
    this.save()
    return fullEntry
  }

  /**
   * 更新传输日志
   * 功能描述：根据 ID 更新已有日志条目（用于完成时更新状态）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-23
   */
  update(id: string, updates: Partial<Omit<TransferLogEntry, 'id' | 'timestamp'>>): boolean {
    const idx = this.logs.findIndex(l => l.id === id)
    if (idx < 0) return false
    Object.assign(this.logs[idx], updates)
    this.save()
    return true
  }

  /**
   * 获取所有日志
   * 功能描述：返回所有传输日志，按时间倒序
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  getAll(): TransferLogEntry[] {
    return [...this.logs].reverse()
  }

  /**
   * 按条件筛选日志
   * 功能描述：按操作类型和成功状态筛选日志
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  filter(options?: {
    operation?: TransferLogEntry['operation']
    success?: boolean
    profileName?: string
    since?: number  // timestamp (inclusive)
    until?: number  // timestamp (inclusive)
  }): TransferLogEntry[] {
    let result = [...this.logs]
    if (options?.operation) {
      result = result.filter(l => l.operation === options.operation)
    }
    if (options?.success !== undefined) {
      result = result.filter(l => !l.pending && l.success === options.success)
    }
    if (options?.profileName) {
      result = result.filter(l => l.profileName === options.profileName)
    }
    if (options?.since !== undefined) {
      result = result.filter(l => l.timestamp >= options.since!)
    }
    if (options?.until !== undefined) {
      result = result.filter(l => l.timestamp <= options.until!)
    }
    return result.reverse()
  }

  /**
   * 清除所有日志
   * 功能描述：清空传输日志
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  clear(): void {
    this.logs = []
    localStorage.removeItem(STORAGE_KEY)
  }

  /** 从备份数据导入日志（覆盖当前记录） */
  importLogs(logs: TransferLogEntry[]): void {
    this.logs = Array.isArray(logs) ? this._sanitizeIds(logs).slice(-MAX_LOGS) : []
    this.save()
  }

  /** 重新从 localStorage 加载（多面板 / 导入后同步） */
  reload(): void {
    this._loaded = false
    this.logs = []
    this.load()
  }

  /**
   * 清除指定连接的日志
   * 功能描述：只清除某个连接配置的传输日志
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   */
  clearProfile(profileName: string): void {
    this.logs = this.logs.filter(l => l.profileName !== profileName)
    this.save()
  }

  /**
   * 导出日志为 JSON
   * 功能描述：将日志导出为 JSON 字符串
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  exportAsJson(): string {
    return JSON.stringify(this.getAll(), null, 2)
  }

  /**
   * 获取统计信息
   * 功能描述：返回传输统计（总数、成功数、失败数、总字节数）
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  getStats(): {
    total: number
    success: number
    failed: number
    totalBytes: number
  } {
    const completed = this.logs.filter(l => !l.pending)
    const success = completed.filter(l => l.success).length
    const totalBytes = completed
      .filter(l => l.success && l.size)
      .reduce((sum, l) => sum + (l.size || 0), 0)
    return {
      total: this.logs.length,
      success,
      failed: completed.length - success,
      totalBytes,
    }
  }
}

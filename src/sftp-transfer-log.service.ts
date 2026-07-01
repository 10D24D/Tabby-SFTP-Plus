/**
 * 传输日志服务
 * 功能描述：记录所有文件传输操作（上传/下载/删除等），支持查看和导出
 *   存储到 localStorage，避免污染 Tabby 配置文件
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-25
 *   添加日志限制（上限1000条）、按类型/状态筛选、JSON导出功能
 *   传输日志按连接配置隔离（clearProfile）
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   改为 localStorage 存储，不再写入 Tabby config.yaml
 * 修改人：DD1024z + Deepseek-V4-Pro
 * 修改时间：2026-07-01
 *   添加 startTime / endTime 字段
 */
import { Injectable, Optional } from '@angular/core'
import { ConfigService } from 'tabby-core'

export type TransferLogEntry = {
  id: string
  timestamp: number
  operation: 'upload' | 'download' | 'delete' | 'rename' | 'mkdir' | 'chmod'
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
        this.logs = JSON.parse(raw)
        return
      }
    } catch { /* fall through */ }
    // 迁移：从旧版 Tabby 配置加载（仅首次）
    if (this.configService?.store) {
      try {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg && 'transferLogs' in cfg && Array.isArray(cfg.transferLogs)) {
          this.logs = [...cfg.transferLogs]
          // 迁移后清除 config 中的旧数据
          if (cfg.transferLogs.length > 0) {
            cfg.transferLogs = []
            try { this.configService.save() } catch {}
          }
          this.save()
          return
        }
      } catch {}
    }
    this.logs = []
  }

  private save(): void {
    // 保留最近 MAX_LOGS 条记录
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS)
    }
    // 写入 localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs))
    } catch (e) { console.warn('[SFTP+ TransferLog] localStorage save failed', e) }
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
    since?: number  // timestamp
  }): TransferLogEntry[] {
    let result = [...this.logs]
    if (options?.operation) {
      result = result.filter(l => l.operation === options.operation)
    }
    if (options?.success !== undefined) {
      result = result.filter(l => l.success === options.success)
    }
    if (options?.profileName) {
      result = result.filter(l => l.profileName === options.profileName)
    }
    if (options?.since) {
      result = result.filter(l => l.timestamp >= options.since!)
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
    const success = this.logs.filter(l => l.success).length
    const totalBytes = this.logs
      .filter(l => l.success && l.size)
      .reduce((sum, l) => sum + (l.size || 0), 0)
    return {
      total: this.logs.length,
      success,
      failed: this.logs.length - success,
      totalBytes,
    }
  }
}

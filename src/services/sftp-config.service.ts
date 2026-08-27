/**
 * SFTP+ 配置统一访问服务
 *
 * 封装 configService.store['tabby-sftp-plus'] 的嵌套存取，
 * 提供从旧扁平 key（paneState 下的 sftp-plus-*，如
 *   sftp-plus-path-mode.root@host: remember → paneState.perHost[host].pathMode）
 * 到新嵌套结构的自动迁移与双读兼容。
 *
 * 迁移时机：首次注入（构造函数）时自动执行，保留旧 key 不删。
 * 双读逻辑：get() 时新路径无值则回退旧 key。
 */

import { Injectable, Optional } from '@angular/core'
import { ConfigService } from 'tabby-core'

/** paneState 内旧扁平 key → 新路径前缀的映射表（用于双读回退） */
const OLD_KEY_MAP: Record<string, string> = {
  'sftp-plus-path-mode':        'perHost.{host}.pathMode',
  'sftp-plus-path-mem':         'perHost.{host}.rememberPath',
  'sftp-plus-saved-local-path': 'perHost.{host}.savedLocalPath',
  'sftp-plus-saved-remote-path':'perHost.{host}.savedRemotePath',
}

@Injectable({ providedIn: 'root' })
export class SftpConfigService {
  private _migrated = false
  /** 内存级缓存，区分"编辑中但不立即落盘" */
  private _cache: Record<string, any> = {}
  /** ★ 2026-08-10 修复 #16：ConfigService 不可用时的兜底存储，
   *   避免 set() 写入临时对象后静默丢失（get 永远读不回） */
  private _localRoot: Record<string, any> = {}

  constructor(@Optional() private configService?: ConfigService) {
    this._migrateIfNeeded()
  }

  // ── 顶层配置段访问 ──

  /** 获取 tabby-sftp-plus 根对象（若不存在则初始化） */
  private get root(): Record<string, any> {
    if (!this.configService?.store) return this._localRoot
    const storeKey = 'tabby-sftp-plus'
    if (!(storeKey in this.configService.store)) {
      this.configService.store[storeKey] = {}
    }
    return this.configService.store[storeKey]
  }

  // ── 公开 API ──

  /**
   * 按点路径读取（如 get('paneState.perHost."root@host".pathMode')）
   * 优先读新嵌套路径 → 回退旧扁平 key（双读兼容）→ 返回 fallback
   */
  get(path: string, fallback?: any): any {
    // ★ 2026-08-26 M9：不再优先长期内存缓存——_cache 仅作 set 未 flush 的写缓冲；
    //   读取时若 store 已有值则以 store 为准，避免外部改配置后读陈旧值
    const newVal = this._getByPath(this.root, path)
    if (newVal !== undefined) {
      if (path in this._cache) delete this._cache[path]
      return newVal
    }
    if (path in this._cache) return this._cache[path]
    // 双读回退
    const oldVal = this._fallbackRead(path)
    if (oldVal !== undefined) return oldVal
    return fallback
  }

  /**
   * 按点路径写入（仅更新内存 + store 对象，不立刻 save）
   * 高频操作 set 后由调用方选择时机调用 flush()
   */
  set(path: string, value: any): void {
    this._cache[path] = value
    this._setByPath(this.root, path, value)
  }

  /** 写入并立即落盘（低频操作用） */
  setAndFlush(path: string, value: any): void {
    this.set(path, value)
    this.flush()
  }

  /** 强制落盘到 config.yaml */
  flush(): void {
    try { this.configService?.save() } catch { /* ignore */ }
    // ★ 2026-08-26：落盘后清缓存，下次 get 从 store 读
    this.clearCache()
  }

  /** 清空内存缓存（强制下次 get 从 store 读） */
  clearCache(): void {
    this._cache = {}
  }

  /** 删除指定嵌套路径的属性并落盘 */
  remove(path: string): void {
    const parts = path.split('/')
    const parent = this._getParentObj(this.root, path)
    if (parent) {
      delete parent[parts[parts.length - 1]]
    }
    delete this._cache[path]
    this.flush()
  }

  // ── 自动迁移 ──

  private _migrateIfNeeded(): void {
    if (this._migrated || !this.configService?.store) return
    this._migrated = true
    const paneState = this.root.paneState
    if (!paneState || typeof paneState !== 'object') return
    // 已迁移过的标志：layout / perHost 子对象均存在
    // ★ 2026-08-15 修复 #6：OR → AND，避免仅 layout 已迁移时跳过 perHost 迁移
    if (typeof paneState.layout === 'object' && typeof paneState.perHost === 'object') return

    this._migratePerHost(paneState)
    this._migrateLayout(paneState)
    this._migrateColumns(paneState)
    // 迁移后落盘（保留旧 key 不删，仅写入新结构）
    this.flush()
  }

  /** 主机相关（原 root@host 拼进 key） */
  private _migratePerHost(src: Record<string, any>): void {
    const hostKeys = Object.keys(src).filter(k => k.startsWith('sftp-plus-path-mode.'))
    for (const key of hostKeys) {
      const host = key.substring('sftp-plus-path-mode.'.length)
      this._setByPath(this.root, `paneState/perHost/${host}/pathMode`, src[`sftp-plus-path-mode.${host}`])
      if (`sftp-plus-path-mem.${host}` in src)
        this._setByPath(this.root, `paneState/perHost/${host}/rememberPath`, src[`sftp-plus-path-mem.${host}`])
      if (`sftp-plus-saved-local-path.${host}` in src)
        this._setByPath(this.root, `paneState/perHost/${host}/savedLocalPath`, src[`sftp-plus-saved-local-path.${host}`])
      if (`sftp-plus-saved-remote-path.${host}` in src)
        this._setByPath(this.root, `paneState/perHost/${host}/savedRemotePath`, src[`sftp-plus-saved-remote-path.${host}`])
    }
  }

  /** 布局相关 */
  private _migrateLayout(src: Record<string, any>): void {
    if (src['sftp-plus-layout-mode'] !== undefined)
      this._setByPath(this.root, 'paneState/layout/mode', src['sftp-plus-layout-mode'])
    if (src['sftp-plus-horizontal-split-ratio'] !== undefined)
      this._setByPath(this.root, 'paneState/layout/horizontalSplitRatio',
        this._toNum(src['sftp-plus-horizontal-split-ratio']))
    if (src['sftp-plus-vertical-split-ratio'] !== undefined)
      this._setByPath(this.root, 'paneState/layout/verticalSplitRatio',
        this._toNum(src['sftp-plus-vertical-split-ratio']))
  }

  /** 列配置 */
  private _migrateColumns(src: Record<string, any>): void {
    for (const scope of ['local', 'remote'] as const) {
      const sort = src[`sftp-plus-${scope}-sort`]
      if (sort !== undefined) this._setByPath(this.root, `paneState/${scope}/sort`, this._safeParse(sort))
      const cols = src[`sftp-plus-${scope}-cols`]
      if (cols !== undefined) this._setByPath(this.root, `paneState/${scope}/cols`, this._safeParse(cols))
      const order = src[`sftp-plus-${scope}-cols-order`]
      if (order !== undefined) this._setByPath(this.root, `paneState/${scope}/colsOrder`, this._safeParse(order))
      const widths = src[`sftp-plus-${scope}-col-widths`]
      if (widths !== undefined) this._setByPath(this.root, `paneState/${scope}/colWidths`, this._safeParse(widths))
    }
  }

  // ── 双读回退 ──

  private _fallbackRead(path: string): any {
    const paneState = this.root.paneState
    if (!paneState || typeof paneState !== 'object') return undefined

    // paneState/perHost/{host}/{field} → sftp-plus-{field}.{host}
    const perHostMatch = path.match(
      /^paneState\/perHost\/(.+?)\/(pathMode|rememberPath|savedLocalPath|savedRemotePath)$/
    )
    if (perHostMatch) {
      const host = perHostMatch[1]
      const field = perHostMatch[2]
      const oldFieldMap: Record<string, string> = {
        pathMode: 'sftp-plus-path-mode',
        rememberPath: 'sftp-plus-path-mem',
        savedLocalPath: 'sftp-plus-saved-local-path',
        savedRemotePath: 'sftp-plus-saved-remote-path',
      }
      return paneState[`${oldFieldMap[field]}.${host}`]
    }

    // paneState/layout/*
    if (path === 'paneState/layout/mode')
      return paneState['sftp-plus-layout-mode'] ?? paneState['sftp-plus-settings.layoutMode']
    if (path === 'paneState/layout/horizontalSplitRatio')
      return paneState['sftp-plus-horizontal-split-ratio']
    if (path === 'paneState/layout/verticalSplitRatio')
      return paneState['sftp-plus-vertical-split-ratio']

    // paneState/{local|remote}/{sort|cols|colsOrder|colWidths}
    const colMatch = path.match(/^paneState\/(local|remote)\/(sort|cols|colsOrder|colWidths)$/)
    if (colMatch) {
      const scope = colMatch[1]
      const field = colMatch[2]
      const raw = paneState[`sftp-plus-${scope}-${field}`]
      return raw !== undefined ? this._safeParse(raw) : undefined
    }

    return undefined
  }

  // ── 工具 ──

  private _getByPath(obj: any, path: string): any {
    const parts = path.split('/')
    let cur = obj
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return undefined
      cur = cur[part]
    }
    return cur
  }

  private _setByPath(obj: any, path: string, value: any): void {
    const parts = path.split('/')
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in cur) || cur[part] == null || typeof cur[part] !== 'object') {
        cur[part] = {}
      }
      cur = cur[part]
    }
    cur[parts[parts.length - 1]] = value
  }

  private _safeParse(raw: any): any {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return raw }
    }
    return raw
  }

  private _toNum(v: any): number {
    if (typeof v === 'number') return v
    const n = parseFloat(String(v))
    return isNaN(n) ? 0.5 : n
  }

  private _getParentObj(obj: any, path: string): Record<string, any> | null {
    const parts = path.split('/')
    if (parts.length <= 1) return obj
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur == null || typeof cur !== 'object') return null
      cur = cur[parts[i]]
    }
    return cur
  }
}

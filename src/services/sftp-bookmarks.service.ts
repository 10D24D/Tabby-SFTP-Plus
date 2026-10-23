/**
 * 书签服务
 * 功能描述：管理本地和远程路径的书签，支持全局 / 局部（绑定当前标签页的连接）两种归属范围
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-10-22
 * 修改情况：
 *   - 2026-06-29 (Deepseek-V4-Flash)：同步写入 Tabby 配置（config.yaml），确保多窗口数据一致性。
 *   - 2026-08-26 (Composer)：H11 —— 路径规范化；删除 tombstone 防多窗口复活。
 *   - 2026-10-20 (Hy4 preview)：全量审计 —— save() 对宿主 ConfigService.save() 返回的 Promise 挂
 *     catch，失败时记录并回落 localStorage（抽出 _saveToLocalStorage）。原实现既不 await 也不捕获
 *     异步拒绝，且随后的 return 直接跳过兜底 ⇒ 配置写入失败时书签**静默丢失**。
 *   - 2026-10-22 (Deepseek-V4.1-Flash)：新增 `LOCAL_SCOPE_KEY`（`'[local]'`）——「局部书签」在**本地
 *     标签页**里也要有归属键。原先本地栏没有连接身份 ⇒ 局部书签落库时不带 connectionKey ⇒ 被当成
 *     全局书签、在任何标签页都能看到（用户反馈「+本地」名不副实）。
 *     取值不用 `'local'`：`hostInfo` 在「无用户名 + 主机名恰为 local」时会产出同样字符串（碰撞）；
 *     `'[local]'` 带方括号，不可能由 `user@host` 拼出。
 */
import { Injectable, Optional } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { randomUUID } from 'crypto'
import * as path from 'path'

import { log } from './sftp-logger'
export type Bookmark = {
  id: string
  name: string
  path: string
  type: 'local' | 'remote'
  /** 连接的标识键，如 "root@192.168.1.1"。为空表示全局书签；`LOCAL_SCOPE_KEY` 表示「局部 + 本机」 */
  connectionKey?: string
  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：联动路径（「联动书签」开关开启时可用）。
   *   点击该书签时，除了本栏跳到 path，另一栏也会跳到 linkedPath。
   *   语义 = **照填即开**：另一栏是什么端点就用什么路径（远程栏要填远程路径），
   *   所以这里不做本地/远程归一化，只 trim 后原样保存，导航时交给目标栏的既有逻辑处理。
   */
  linkedPath?: string
  /** ★ 2026-10-19（Deepseek-V4.1-Flash）：被点击次数（「频率排序」的数据来源；缺省视为 0） */
  useCount?: number
  createdAt: number
}

const STORAGE_KEY = 'sftp-plus-bookmarks-v2'
const TOMBSTONE_KEY = 'sftp-plus-bookmarks-tombstones-v1'
const MAX_TOMBSTONES = 500

/**
 * ★ 2026-10-22（Deepseek-V4.1-Flash）：「局部书签」在**本机标签页**里的归属键。
 *   局部 = 只在「当前 Tabby 标签页的连接」下可见。远程标签页用 `user@host` 作键，
 *   而本地标签页没有连接身份，过去只能不带 connectionKey 落库 ⇒ 变成全局书签、
 *   任何标签页都冒出来。这里给本地一个固定伪身份，让「局部」在本地 Tab 也成立。
 * ⛔ 取值必须不可能与 `user@host` 撞车：`hostInfo` 在「无用户名 + 主机名恰好叫 local」
 *   时会拼出 `'local'`，所以这里带方括号。
 */
export const LOCAL_SCOPE_KEY = '[local]'

/** 该归属键是否指向「本机」（本地标签页的局部作用域） */
export function isLocalScopeKey(key: string | undefined | null): boolean {
  return key === LOCAL_SCOPE_KEY
}

let _idCounter = 0
function generateId(): string {
  return Date.now().toString(36) + '-' + (++_idCounter).toString(36) + '-' + randomUUID()
}

/** 规范化书签路径：远程走 posix normalize；本地走 path.normalize */
export function normalizeBookmarkPath(p: string, type: 'local' | 'remote'): string | null {
  if (typeof p !== 'string') return null
  let s = p.trim()
  if (!s) return null
  if (type === 'remote') {
    if (!s.startsWith('/')) s = '/' + s
    s = path.posix.normalize(s.replace(/\/+/g, '/'))
    if (!s.startsWith('/')) s = '/' + s
    return s
  }
  try {
    return path.normalize(s)
  } catch {
    return null
  }
}

@Injectable()
export class SftpBookmarksService {
  private bookmarks: Bookmark[] = []
  private _tombstones: string[] = []
  private _loaded = false

  constructor(@Optional() private configService?: ConfigService) {
    this.load()
  }

  private _loadTombstones(): void {
    try {
      const raw = localStorage.getItem(TOMBSTONE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        this._tombstones = parsed.filter((x: unknown) => typeof x === 'string').slice(-MAX_TOMBSTONES)
      }
    } catch { /* ignore */ }
  }

  private _saveTombstones(): void {
    try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(this._tombstones)) } catch { /* ignore */ }
  }

  private _tombstone(id: string | null | undefined): void {
    if (!id || this._tombstones.includes(id)) return
    this._tombstones.push(id)
    if (this._tombstones.length > MAX_TOMBSTONES) {
      this._tombstones.splice(0, this._tombstones.length - MAX_TOMBSTONES)
    }
    this._saveTombstones()
  }

  private load(): void {
    if (this._loaded) return
    this._loaded = true
    this._loadTombstones()
    // 优先从 Tabby 配置加载
    if (this.configService?.store) {
      try {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg && 'bookmarks' in cfg) {
          this.bookmarks = [...cfg.bookmarks].filter(b => b?.id && !this._tombstones.includes(b.id))
          return
        }
      } catch {}
    }
    // 回退：从 localStorage 加载（旧版兼容）
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        this.bookmarks = (Array.isArray(parsed) ? parsed : []).filter(
          (b: Bookmark) => b?.id && !this._tombstones.includes(b.id),
        )
      }
    } catch {
      this.bookmarks = []
    }
  }

  private save(): void {
    // 写入 Tabby 配置（主存储）
    if (this.configService?.store) {
      try {
        const target = this.configService.store['tabby-sftp-plus']
        if (target) {
          // ★ 2026-08-10 修复 #7：按 id 合并后再写，保留其它实例/窗口新增的条目
          // ★ 2026-08-26 H11：合并时跳过 tombstone，防止已删书签复活
          const deleted = new Set(this._tombstones)
          const stored: Bookmark[] = Array.isArray(target.bookmarks) ? target.bookmarks : []
          const merged = new Map<string, Bookmark>(
            this.bookmarks.filter(b => b?.id && !deleted.has(b.id)).map(b => [b.id, b]),
          )
          for (const b of stored) {
            if (b?.id && !merged.has(b.id) && !deleted.has(b.id)) merged.set(b.id, b)
          }
          this.bookmarks = [...merged.values()]
          target.bookmarks = this.bookmarks
          // ★ 2026-10-20 全量审计 P1：宿主 ConfigService.save() 返回 Promise，原实现既
          //   不 await 也不 .catch —— 同步 try/catch 捕获不到异步拒绝，且随后的 `return`
          //   直接跳过下面的 localStorage 回退 ⇒ 配置写入失败时**静默丢书签**（用户以为
          //   加好了，重启后没了）。改为挂 catch：失败时记录并继续写 localStorage 兜底。
          const saved = this.configService.save()
          if (saved && typeof (saved as any).catch === 'function') {
            ;(saved as Promise<void>).catch((e: unknown) => {
              log.warn('config save failed (async):', e)
              this._saveToLocalStorage()
            })
          }
          return
        }
      } catch (e) { log.warn('config save failed', e) }
    }
    // 回退：写入 localStorage
    this._saveToLocalStorage()
  }

  /** localStorage 兜底写入（配置写入不可用或被拒绝时调用，见 save()） */
  private _saveToLocalStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bookmarks))
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        log.warn('localStorage quota exceeded for bookmarks; config save may still succeed')
      }
    }
  }

  /** 获取所有书签 */
  getAll(): Bookmark[] {
    return [...this.bookmarks]
  }

  /** 获取全局书签（不限连接） */
  getGlobal(): Bookmark[] {
    return this.bookmarks.filter(b => !b.connectionKey)
  }

  /** 获取指定连接的书签 */
  getByConnection(connectionKey: string): Bookmark[] {
    return this.bookmarks.filter(b => b.connectionKey === connectionKey)
  }

  /** 按类型筛选 */
  getByType(type: 'local' | 'remote', connectionKey?: string): Bookmark[] {
    return this.bookmarks.filter(b => {
      if (b.type !== type) return false
      if (connectionKey && b.connectionKey && b.connectionKey !== connectionKey) return false
      return true
    })
  }

  /** 添加书签 */
  add(name: string, pathStr: string, type: 'local' | 'remote', connectionKey?: string, linkedPath?: string): Bookmark | null {
    const normalized = normalizeBookmarkPath(pathStr, type)
    if (!normalized) {
      log.warn('reject bookmark with invalid path:', pathStr)
      return null
    }
    const link = (linkedPath ?? '').trim()
    const bookmark: Bookmark = {
      id: generateId(),
      name,
      path: normalized,
      type,
      connectionKey: connectionKey || undefined,
      linkedPath: link || undefined,
      createdAt: Date.now(),
    }
    this.bookmarks.push(bookmark)
    this.save()
    return bookmark
  }

  /** 移除书签 */
  remove(id: string): void {
    this._tombstone(id)
    this.bookmarks = this.bookmarks.filter(b => b.id !== id)
    this.save()
  }

  /** 更新书签 */
  update(id: string, updates: Partial<Pick<Bookmark, 'name' | 'path' | 'linkedPath' | 'useCount' | 'connectionKey'>>): void {
    const idx = this.bookmarks.findIndex(b => b.id === id)
    if (idx === -1) return
    if (updates.name !== undefined) this.bookmarks[idx].name = updates.name
    // ★ 2026-10-19：使用次数（频率排序）—— 只接受有限数字，负数按 0 处理
    if (updates.useCount !== undefined) {
      const n = Number(updates.useCount)
      this.bookmarks[idx].useCount = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    }
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：归属范围切换（局部 <-> 全局）—— 传空串表示清空为全局，
    //   传 undefined 才是「本次不改」（与 name/path 的既有约定一致）。
    if (updates.connectionKey !== undefined) {
      const ck = updates.connectionKey.trim()
      if (ck) this.bookmarks[idx].connectionKey = ck
      else delete this.bookmarks[idx].connectionKey
    }
    // ★ 2026-10-19（Deepseek-V4.1-Flash）：联动路径原样保存（清空 = 删除该字段，不写空串）
    if (updates.linkedPath !== undefined) {
      const link = updates.linkedPath.trim()
      if (link) this.bookmarks[idx].linkedPath = link
      else delete this.bookmarks[idx].linkedPath
    }
    if (updates.path !== undefined) {
      const type = this.bookmarks[idx].type
      const normalized = normalizeBookmarkPath(updates.path, type)
      if (!normalized) {
        log.warn('reject bookmark update with invalid path:', updates.path)
        return
      }
      this.bookmarks[idx].path = normalized
    }
    this.save()
  }

  /** 检查路径是否已有书签 */
  hasBookmark(pathStr: string, type: 'local' | 'remote'): boolean {
    const normalized = normalizeBookmarkPath(pathStr, type) || pathStr
    return this.bookmarks.some(b => b.path === normalized && b.type === type)
  }

  /** 获取路径对应的书签 */
  getByPath(pathStr: string, type: 'local' | 'remote'): Bookmark | undefined {
    const normalized = normalizeBookmarkPath(pathStr, type) || pathStr
    return this.bookmarks.find(b => b.path === normalized && b.type === type)
  }

  /**
   * ★ 2026-10-19（Deepseek-V4.1-Flash）：清零所有书签的使用次数（「频率排序」的统计重置）。
   *   只清 useCount，不动名称/路径/顺序；无变化时不写盘，避免无意义 IO。
   * @returns 实际被清零的书签条数（供调用方决定是否提示）
   */
  resetUsage(): number {
    let changed = 0
    for (const b of this.bookmarks) {
      if (b.useCount) { b.useCount = 0; changed++ }
    }
    if (changed) this.save()
    return changed
  }

  /** 重新从 config / localStorage 加载（多面板 / 导入后同步） */
  reload(): void {
    this._loaded = false
    this.bookmarks = []
    this.load()
  }

  /** 拖拽重排：将 fromIndex 移动到 toIndex */
  reorder(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.bookmarks.length) return
    if (toIndex < 0 || toIndex >= this.bookmarks.length) return
    if (fromIndex === toIndex) return
    const [item] = this.bookmarks.splice(fromIndex, 1)
    this.bookmarks.splice(toIndex, 0, item)
    this.save()
  }
}

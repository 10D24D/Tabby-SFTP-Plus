/**
 * 书签服务
 * 功能描述：管理本地和远程路径的书签，支持全局/按SSH连接/本地三种范围
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   同步写入 Tabby 配置（config.yaml），确保多窗口数据一致性
 * 修改人：DD1024z + Composer
 * 修改时间：2026-08-26 — H11：路径规范化；删除 tombstone 防多窗口复活
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
  /** 连接的标识键，如 "root@192.168.1.1"。为空表示全局书签 */
  connectionKey?: string
  createdAt: number
}

const STORAGE_KEY = 'sftp-plus-bookmarks-v2'
const TOMBSTONE_KEY = 'sftp-plus-bookmarks-tombstones-v1'
const MAX_TOMBSTONES = 500

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
          this.configService.save()
          return
        }
      } catch (e) { log.warn('config save failed', e) }
    }
    // 回退：写入 localStorage
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
  add(name: string, pathStr: string, type: 'local' | 'remote', connectionKey?: string): Bookmark | null {
    const normalized = normalizeBookmarkPath(pathStr, type)
    if (!normalized) {
      log.warn('reject bookmark with invalid path:', pathStr)
      return null
    }
    const bookmark: Bookmark = {
      id: generateId(),
      name,
      path: normalized,
      type,
      connectionKey: connectionKey || undefined,
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
  update(id: string, updates: Partial<Pick<Bookmark, 'name' | 'path'>>): void {
    const idx = this.bookmarks.findIndex(b => b.id === id)
    if (idx === -1) return
    if (updates.name !== undefined) this.bookmarks[idx].name = updates.name
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

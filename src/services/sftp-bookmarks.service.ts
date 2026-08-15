/**
 * 书签服务
 * 功能描述：管理本地和远程路径的书签，支持全局/按SSH连接/本地三种范围
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   同步写入 Tabby 配置（config.yaml），确保多窗口数据一致性
 */
import { Injectable, Optional } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { randomUUID } from 'crypto'

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

let _idCounter = 0
function generateId(): string {
  return Date.now().toString(36) + '-' + (++_idCounter).toString(36) + '-' + randomUUID()
}

@Injectable()
export class SftpBookmarksService {
  private bookmarks: Bookmark[] = []
  private _loaded = false

  constructor(@Optional() private configService?: ConfigService) {
    this.load()
  }

  private load(): void {
    if (this._loaded) return
    this._loaded = true
    // 优先从 Tabby 配置加载
    if (this.configService?.store) {
      try {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg && 'bookmarks' in cfg) {
          this.bookmarks = [...cfg.bookmarks]
          return
        }
      } catch {}
    }
    // 回退：从 localStorage 加载（旧版兼容）
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        this.bookmarks = Array.isArray(parsed) ? parsed : []
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
          // ★ 2026-08-10 修复 #7：按 id 合并后再写，保留其它实例/窗口新增的条目，
          //   避免整体覆盖丢失（本实例的同 id 条目以本实例为准）
          const stored: Bookmark[] = Array.isArray(target.bookmarks) ? target.bookmarks : []
          const merged = new Map<string, Bookmark>(this.bookmarks.filter(b => b?.id).map(b => [b.id, b]))
          for (const b of stored) {
            if (b?.id && !merged.has(b.id)) merged.set(b.id, b)
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
    } catch {}
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
  add(name: string, path: string, type: 'local' | 'remote', connectionKey?: string): Bookmark {
    const bookmark: Bookmark = {
      id: generateId(),
      name,
      path,
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
    this.bookmarks = this.bookmarks.filter(b => b.id !== id)
    this.save()
  }

  /** 更新书签 */
  update(id: string, updates: Partial<Pick<Bookmark, 'name' | 'path'>>): void {
    const idx = this.bookmarks.findIndex(b => b.id === id)
    if (idx === -1) return
    if (updates.name !== undefined) this.bookmarks[idx].name = updates.name
    if (updates.path !== undefined) this.bookmarks[idx].path = updates.path
    this.save()
  }

  /** 检查路径是否已有书签 */
  hasBookmark(path: string, type: 'local' | 'remote'): boolean {
    return this.bookmarks.some(b => b.path === path && b.type === type)
  }

  /** 获取路径对应的书签 */
  getByPath(path: string, type: 'local' | 'remote'): Bookmark | undefined {
    return this.bookmarks.find(b => b.path === path && b.type === type)
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

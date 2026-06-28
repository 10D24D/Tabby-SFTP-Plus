/**
 * 书签服务
 * 功能描述：管理本地和远程路径的书签，支持全局/按SSH连接/本地三种范围
 *   采用 electerm 风格：全局书签所有连接可见，连接书签仅对应连接可见
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Claude
 * 修改时间：2026-06-22
 */
import { Injectable } from '@angular/core'

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

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

@Injectable()
export class SftpBookmarksService {
  private bookmarks: Bookmark[] = []

  constructor() {
    this.load()
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        this.bookmarks = JSON.parse(raw)
      }
    } catch {
      this.bookmarks = []
    }
  }

  private save(): void {
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

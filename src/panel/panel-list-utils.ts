/**
 * 文件列表排序 / 过滤 / mode 位判断（纯函数）
 */
import type { LocalEntry } from './panel-types'
import type { SFTPFile } from '../sftp.service'

export type PaneSortField = 'name' | 'size' | 'modified' | 'birthtime'

/** 通过 POSIX mode 位判断是否为目录 */
export function isDirByMode(mode: number | undefined): boolean {
  if (mode === undefined) return false
  return (mode & 0o170000) === 0o040000
}

export function filterByHidden<T extends { name: string }>(entries: T[], showHidden: boolean): T[] {
  if (showHidden) return entries
  return entries.filter(e => !e.name.startsWith('.'))
}

export function filterByName<T extends { name: string }>(entries: T[], filter: string): T[] {
  const t = filter.trim().toLowerCase()
  if (!t) return entries
  return entries.filter(e => e.name.toLowerCase().includes(t))
}

export function sortLocalEntries(
  entries: LocalEntry[],
  sortBy: PaneSortField,
  asc: boolean,
  pinFolders = true,
): LocalEntry[] {
  const dir = (a: LocalEntry, b: LocalEntry) =>
    pinFolders ? Number(b.isDirectory) - Number(a.isDirectory) : 0
  return [...entries].sort((a, b) => {
    const d = dir(a, b)
    if (d !== 0) return d
    if (sortBy === 'size') return ((a.size ?? 0) - (b.size ?? 0)) * (asc ? 1 : -1)
    if (sortBy === 'modified') return ((a.mtimeMs ?? 0) - (b.mtimeMs ?? 0)) * (asc ? 1 : -1)
    if (sortBy === 'birthtime') return ((a.birthtimeMs ?? 0) - (b.birthtimeMs ?? 0)) * (asc ? 1 : -1)
    return a.name.localeCompare(b.name) * (asc ? 1 : -1)
  })
}

export function sortRemoteEntries(
  entries: SFTPFile[],
  sortBy: PaneSortField,
  asc: boolean,
  pinFolders = true,
): SFTPFile[] {
  const dir = (a: SFTPFile, b: SFTPFile) =>
    pinFolders ? Number(b.isDirectory) - Number(a.isDirectory) : 0
  return [...entries].sort((a, b) => {
    const d = dir(a, b)
    if (d !== 0) return d
    if (sortBy === 'size') return ((a.size ?? 0) - (b.size ?? 0)) * (asc ? 1 : -1)
    if (sortBy === 'modified') return ((a.modified?.getTime() ?? 0) - (b.modified?.getTime() ?? 0)) * (asc ? 1 : -1)
    if (sortBy === 'birthtime') return ((a.modified?.getTime() ?? 0) - (b.modified?.getTime() ?? 0)) * (asc ? 1 : -1)
    return a.name.localeCompare(b.name) * (asc ? 1 : -1)
  })
}

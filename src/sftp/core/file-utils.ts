/**
 * 功能描述：SFTP+ file-utils 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-16
 * 合并来源：file-type-utils, panel-list-utils, panel-format
 */

import { type LocalEntry } from './panel-types'

import { type SFTPFile } from '../../services/sftp.service'

import { type TransferLogEntry } from '../../services/sftp-transfer-log.service'


/**
 * 远程/本地文件类型判断（查看、编辑能力）
 */

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'ico', 'avif', 'tiff', 'tif', 'svg',
])

const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'md', 'markdown', 'json', 'jsonc', 'json5', 'xml', 'yml', 'yaml',
  'cfg', 'ini', 'toml', 'properties', 'conf', 'config', 'nginx',
  'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs', 'vue', 'svelte',
  'py', 'pyw', 'java', 'cpp', 'cc', 'cxx', 'c', 'h', 'hpp', 'hh',
  'go', 'rs', 'rb', 'php', 'html', 'htm', 'xhtml', 'css', 'scss', 'less', 'sass',
  'sql', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1', 'psm1',
  'swift', 'kt', 'kts', 'scala', 'lua', 'pl', 'pm', 'r', 'dart', 'ex', 'exs',
  'cs', 'vb', 'fs', 'fsx', 'clj', 'cljs', 'erl', 'hrl', 'vim', 'diff', 'patch',
  'csv', 'tsv', 'gradle', 'cmake', 'make', 'mk',
  'env', 'pem', 'crt', 'key', 'csr', 'pub', 'asc', 'lock',
  'gitignore', 'dockerignore', 'editorconfig', 'prettierrc', 'eslintrc',
  'npmrc', 'nvmrc', 'htaccess', 'reg', 'inf',
])

const TEXT_BASENAMES = new Set([
  'dockerfile', 'makefile', 'gemfile', 'rakefile', 'procfile', 'vagrantfile',
  'license', 'readme', 'changelog', 'authors', 'contributors',
  '.gitignore', '.dockerignore', '.env', '.editorconfig', '.prettierrc', '.eslintrc',
  '.npmrc', '.nvmrc', '.htaccess',
])

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',
}

/** 文本查看上限（字节） */
export const VIEW_TEXT_MAX_BYTES = 2 * 1024 * 1024
/** 图片查看上限（字节） */
export const VIEW_IMAGE_MAX_BYTES = 15 * 1024 * 1024
/** 文本编辑上限（字节） */
export const EDIT_TEXT_MAX_BYTES = 5 * 1024 * 1024

export function getFileExtension(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName
  const lower = base.toLowerCase()
  if (TEXT_BASENAMES.has(lower)) return lower.replace(/^\./, '')
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.substring(dot + 1).toLowerCase()
}

export function isImageFile(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(fileName))
}

export function isTextFile(fileName: string): boolean {
  const base = (fileName.split(/[/\\]/).pop() ?? fileName).toLowerCase()
  if (TEXT_BASENAMES.has(base)) return true
  return TEXT_EXTENSIONS.has(getFileExtension(fileName))
}

export function isViewableRemoteFile(fileName: string, size?: number): boolean {
  if (!isViewableRemoteFileType(fileName)) return false
  if (size == null) return true
  return size <= getViewMaxBytes(fileName)
}

/** 仅按扩展名判断是否可查看（不含大小限制） */
export function isViewableRemoteFileType(fileName: string): boolean {
  return isImageFile(fileName) || isTextFile(fileName)
}

export function getViewMaxBytes(fileName: string): number {
  return isImageFile(fileName) ? VIEW_IMAGE_MAX_BYTES : VIEW_TEXT_MAX_BYTES
}

export function isRemoteFileTooLargeForView(fileName: string, size: number): boolean {
  if (!isViewableRemoteFileType(fileName)) return false
  return size > getViewMaxBytes(fileName)
}

export function isEditableRemoteFile(fileName: string, size?: number): boolean {
  if (!isEditableRemoteFileType(fileName)) return false
  if (size == null) return true
  return size <= EDIT_TEXT_MAX_BYTES
}

/** 仅按扩展名判断是否可编辑（不含大小限制） */
export function isEditableRemoteFileType(fileName: string): boolean {
  const ext = getFileExtension(fileName)
  if (ext === 'svg') return true
  if (!isTextFile(fileName)) return false
  if (isImageFile(fileName)) return false
  return true
}

export function isRemoteFileTooLargeForEdit(fileName: string, size: number): boolean {
  if (!isEditableRemoteFileType(fileName)) return false
  return size > EDIT_TEXT_MAX_BYTES
}

export function formatBytesLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024)
    return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`
  }
  if (bytes >= 1024) {
    const kb = bytes / 1024
    return Number.isInteger(kb) ? `${kb} KB` : `${kb.toFixed(1)} KB`
  }
  return `${bytes} B`
}

export function getImageMimeType(fileName: string): string {
  const ext = getFileExtension(fileName)
  return IMAGE_MIME[ext] ?? 'application/octet-stream'
}

export function isBinaryBuffer(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192))
  return sample.includes(0)
}

export function bufferToText(buf: Buffer): { text: string; encoding: string } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf-8' }
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString('utf16le'), encoding: 'utf-16le' }
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    return { text: decoder.decode(buf), encoding: 'utf-8' }
  } catch {
    return { text: buf.toString('latin1'), encoding: 'latin-1' }
  }
}

export function bufferToDataUrl(buf: Buffer, fileName: string): string {
  const mime = getImageMimeType(fileName)
  const b64 = buf.toString('base64')
  return `data:${mime};base64,${b64}`
}

﻿/**
 * 文件列表排序 / 过滤 / mode 位判断（纯函数）
 */

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

/**
 * SFTP+ 面板纯函数格式化工具
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-23
 *   新增自定义时间格式化：setDateFormatPattern/formatDateWithPattern，formatDate 走可配置 pattern
 * 修改时间：2026-07-12
 *   修复 formatSize/formatDuration/formatSpeedFromSize/formatTransferSpeed 对字符串入参崩溃：
 *   旧日志 size/duration 可能被序列化成字符串，.toFixed 抛 TypeError → *ngFor 该行渲染失败被丢弃 → "共N条只显示1行"
 *   统一 Number() 强转 + isFinite 守卫；formatLogTime/formatDate 增加 Invalid Date 守卫
 */

export function isUploadLikeOperation(op: TransferLogEntry['operation']): boolean {
  return op === 'upload' || op === 'edit-upload'
}

export function formatSize(bytes?: number): string {
  if (bytes == null) return ''
  // 强转 Number：旧 config.yaml/JSON 导入的日志 size 可能被序列化成字符串，
  // 字符串 < 1024 时 v.toFixed 会抛 TypeError，导致 *ngFor 该行渲染失败被丢弃
  const n = Number(bytes)
  if (!isFinite(n)) return ''
  if (n === 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n, i = 0
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`
}

/**
 * 自定义时间格式化（兼容性设置）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-23
 *   模块级 pattern 由设置页/面板通过 setDateFormatPattern() 注入；
 *   formatDate 保持原签名，所有调用点（文件列表 _cells 预计算、冲突对话框、属性对话框）自动生效。
 *   注意：pattern 变化后 formatDate 不再"纯"，面板侧需失效 _cells 预计算缓存（见 _readBehaviorConfig）。
 */
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD HH:mm:ss'

let _dateFormatPattern = ''

/** 设置全局时间格式 pattern（空串 = 使用默认格式） */
export function setDateFormatPattern(pattern: string): void {
  _dateFormatPattern = (pattern || '').trim()
}

export function getDateFormatPattern(): string {
  return _dateFormatPattern
}

/**
 * 按 pattern 格式化时间。支持 token：
 * YYYY/YY 年、MM/M 月、DD/D 日、HH/H 24时、hh/h 12时、mm/m 分、ss/s 秒、A/a 上下午
 * 其余字符原样输出
 */
export function formatDateWithPattern(ms: number, pattern: string): string {
  const d = new Date(Number(ms))
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const h24 = d.getHours()
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    DD: pad(d.getDate()),
    D: String(d.getDate()),
    HH: pad(h24),
    H: String(h24),
    hh: pad(h12),
    h: String(h12),
    mm: pad(d.getMinutes()),
    m: String(d.getMinutes()),
    ss: pad(d.getSeconds()),
    s: String(d.getSeconds()),
    A: h24 < 12 ? 'AM' : 'PM',
    a: h24 < 12 ? 'am' : 'pm',
  }
  return pattern.replace(/YYYY|YY|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|A|a/g, t => map[t])
}

export function formatDate(ms?: number): string {
  if (ms == null) return ''
  return formatDateWithPattern(Number(ms), _dateFormatPattern || DEFAULT_DATE_FORMAT)
}

export function formatPercent(n: number): string {
  return Math.round(Number(n) || 0).toString()
}

export function formatLogTime(ts?: number | Date): string {
  if (ts == null) return ''
  const d = ts instanceof Date ? ts : new Date(Number(ts))
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatLogTimeRange(entry: TransferLogEntry): string {
  const st = entry.startTime || entry.timestamp
  const et = entry.endTime
  if (!et) {
    const d = new Date(Number(st))
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const ds = new Date(Number(st))
  const de = new Date(Number(et))
  if (isNaN(ds.getTime()) || isNaN(de.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${fmt(ds)} → ${fmt(de)}`
}

export function formatFailReason(entry: TransferLogEntry, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (entry.success) return ''
  switch (entry.failReason) {
    case 'cancelled': return t('fail.cancelled')
    case 'interrupted': return t('fail.interrupted')
    default: return t('fail.unknown')
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

export function formatDuration(ms?: number): string {
  if (ms == null) return ''
  const n = Number(ms)
  if (!isFinite(n) || n < 0) return ''
  if (n < 1000) return `${n}ms`
  if (n < 60000) return `${(n / 1000).toFixed(1)}s`
  const m = Math.floor(n / 60000)
  const s = Math.round((n % 60000) / 1000)
  return `${m}m${s}s`
}

export function formatSpeedFromSize(size?: number, duration?: number): string {
  const s = Number(size), d = Number(duration)
  if (!isFinite(s) || !isFinite(d) || s <= 0 || d <= 0) return '--'
  const bps = (s / d) * 1000
  if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
  return Math.round(bps) + ' B/s'
}

export function formatTransferSpeed(bytes?: number, ms?: number): string {
  const b = Number(bytes), t = Number(ms)
  if (!isFinite(b) || !isFinite(t) || b <= 0 || t <= 0) return ''
  const bps = (b / t) * 1000
  if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bps >= 1024) return (bps / 1024).toFixed(1) + ' KB/s'
  return Math.round(bps) + ' B/s'
}


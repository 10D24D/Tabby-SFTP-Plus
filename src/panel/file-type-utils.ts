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

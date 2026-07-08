/**
 * Drop 事件数据解析：内部 payload 与 OS 文件路径提取
 */
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'

import type { DragPayload } from './panel-types'

/** 解析内部拖拽数据（getData 在 drop 事件中只能消费一次，建议只调用一次） */
export function parseDragPayload(ev: DragEvent): DragPayload | null {
  const raw = ev.dataTransfer?.getData('application/x-sftp-plus')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/** 从 OS 拖入的 DataTransfer 中提取本地文件系统路径 */
export async function getDroppedOsPaths(ev: DragEvent): Promise<string[]> {
  const dt = ev.dataTransfer
  if (!dt) return []

  // 策略1: Electron File.path（最直接，跨平台，带正确原生路径）
  const files = Array.from(dt.files ?? [])
  const electronPaths = files.map(f => (f as any).path as string | undefined).filter(Boolean) as string[]
  if (electronPaths.length) return electronPaths

  // 策略1b: 遍历 dataTransfer.items 用 webUtils.getPathForFile()（Electron 22+，支持文件和文件夹）
  try {
    const { webUtils } = require('electron')
    const items = Array.from(dt.items ?? [])
    const itemPaths: string[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          const p = webUtils.getPathForFile(file)
          if (p) itemPaths.push(p)
        }
      }
    }
    if (itemPaths.length) return itemPaths
  } catch { /* Electron 版本不支持 webUtils，或未启用 */ }

  // 策略2: File 对象有内容但没有 .path → 写入临时目录后返回路径（仅单文件，非目录）
  if (files.length) {
    const tmpDir = path.join(os.tmpdir(), 'sftp-plus-dragdrop')
    await fs.mkdir(tmpDir, { recursive: true }).catch(() => {})
    const tmpPaths: string[] = []
    for (const file of files) {
      if (!file.name) continue
      const tmpPath = path.join(tmpDir, file.name)
      try {
        const buf = Buffer.from(await file.arrayBuffer())
        if (buf.length === 0 && file.size === 0) continue
        await fs.writeFile(tmpPath, buf)
        tmpPaths.push(tmpPath)
      } catch { /* 跳过无法读取的文件（含文件夹占位项） */ }
    }
    if (tmpPaths.length) return tmpPaths
  }

  // 策略3: text/uri-list 回退（处理 Windows file:///C:/path 格式）
  const uriList = dt.getData('text/uri-list') || ''
  const uris = uriList.split(/\r?\n/g).map(x => x.trim()).filter(x => x && !x.startsWith('#'))
  return uris.map(x => {
    if (!x.startsWith('file://')) return x
    const raw = decodeURIComponent(x.slice('file://'.length)) // 去掉 file://
    // Windows: file:///C:/path → /C:/path → 去掉开头的 /，保持 Drive letter
    if (/^\/[a-zA-Z]:/.test(raw)) {
      return raw.slice(1).replace(/\//g, '\\')
    }
    return raw
  })
}

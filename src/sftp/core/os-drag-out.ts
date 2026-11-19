/**
 * 功能描述：把面板条目「拖出到系统」（桌面 / 资源管理器）的原生拖拽实现。
 *
 * 背景（为什么不用 HTML5 拖拽的数据）：
 *   Electron 32 起渲染进程拿不到 `File.path`（`webUtils.getPathForFile` 只对**拖入**有效），
 *   而 Chromium 在 Windows 上要生成 `CF_HDROP` 必须有一条**真实磁盘路径**。
 *   ⇒ `new File([''], name)` + `file.path = ...` 的做法在新版 Electron（Tabby 1.0.238 = Electron 43）
 *      是彻头彻尾的无效代码：拖出去要么空手、要么变成 `.url` 快捷方式。这是 issue #30 的根因。
 *   唯一可行通道是主进程的 `webContents.startDrag({ file, icon })`，经 `@electron/remote` 调用
 *   （宿主 tabby-electron 自己也是这么用 remote 的；`initModuleLookup` 把
 *   `app.asar/node_modules` 塞进 NODE_PATH，因此插件可解析 `@electron/remote`）。
 *
 * ⚠ 代价（决定了调用点必须用 Alt 做闸门）：
 *   `startDrag` 走 `ipcRenderer.sendSync`，主进程里是阻塞的 `DoDragDrop`，**整个拖拽期间渲染进程
 *   的 JS 线程被冻住**：`dragend` 收不到、Angular 不刷新。因此不能接管普通拖拽（那会让
 *   「面板内两栏互拖」彻底失效），只能作为 Alt+拖拽 的显式动作。
 *
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 * @修改人：DD1024z + DeepSeek-V4.1-Flash
 * @修改时间：2026-11-09 — 多选拖出改用 `files` 数组（Electron v43 只认 files，不认 file: string[]）
 */
import * as os from 'os'
import * as path from 'path'
import * as fsSync from 'fs'

import { log } from '../../services/sftp-logger'

/** 远端拖出缓存根目录（与面板侧 `_dragOutCacheDir()` 必须一致） */
export const OS_DRAG_OUT_TMP_DIR = 'sftp-plus-dragout'

/** `webContents` 上我们真正用到的最小形状（不引 electron 类型，插件不依赖 electron 包） */
interface DragOutWebContentsLike {
  startDrag?: (item: { file?: string; files?: string[]; icon?: string }) => void
  isDestroyed?: () => boolean
}

let wcCache: DragOutWebContentsLike | null = null
/** 一旦解析/调用失败就不再重试（每次拖拽都打一遍 remote 栈警告会淹掉宿主 log.txt） */
let wcUnavailable = false
/** 上一次生成的拖拽图标路径：下次生成前删掉，避免临时目录里堆几百个 png */
let lastIconPath: string | null = null

/**
 * 取当前窗口的 webContents（`@electron/remote` 的成员调用是同步 IPC，故这里缓存一份）。
 * 解析失败（宿主未开 remote / 未来 Electron 移除 remote）时返回 null，调用方按「不支持」降级。
 */
function getWebContents(): DragOutWebContentsLike | null {
  if (wcCache) {
    try {
      if (typeof wcCache.isDestroyed !== 'function' || !wcCache.isDestroyed()) return wcCache
    } catch { /* 跨进程对象已失效 ⇒ 重新取 */ }
    wcCache = null
  }
  if (wcUnavailable) return null
  try {
    // webpack externals 已登记 @electron/remote（见 webpack.config.js）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const remote = require('@electron/remote')
    const wc = remote?.getCurrentWebContents?.()
    if (!wc || typeof wc.startDrag !== 'function') {
      wcUnavailable = true
      log.warn('[SFTP+] dragout: webContents.startDrag 不可用，拖出到系统已降级')
      return null
    }
    wcCache = wc as DragOutWebContentsLike
    return wcCache
  } catch (e) {
    wcUnavailable = true
    log.warn('[SFTP+] dragout: @electron/remote 不可用，拖出到系统已降级：' + (e as Error)?.message)
    return null
  }
}

/** 供设置页/面板提前判断能力（不触发真实拖拽） */
export function isOsDragOutAvailable(): boolean {
  return getWebContents() !== null
}

// ── 拖拽图标 ──────────────────────────────────────────────
// startDrag 的 icon 在 Windows 上虽是可选，但 Electron 侧是 createFromPath(icon) 读盘；
// 传空串/不存在的路径可能直接不启动拖拽。这里用 canvas 现画一枚「药丸」图标，
// 与面板自绘的 setDragImage 预览视觉一致（emoji + 文件名），落成临时 png 再交给主进程。

const ICON_CSS_W = 176
const ICON_CSS_H = 40
const ICON_DPR = 2

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(out + '…').width > maxWidth) out = out.slice(0, -1)
  return out + '…'
}

/**
 * 生成一枚拖拽图标并返回其**绝对路径**（供主进程 `nativeImage.createFromPath` 读取）。
 * @param label 显示文案（文件名 / 「N 个项目」）
 * @param isDirectory 目录用文件夹字形
 * @returns 图标文件路径；canvas 不可用或写盘失败时返回 null（调用方降级为不传 icon）
 */
export function buildDragOutIcon(label: string, isDirectory: boolean): string | null {
  try {
    if (typeof document === 'undefined') return null
    const dir = path.join(os.tmpdir(), OS_DRAG_OUT_TMP_DIR, '.icon')
    fsSync.mkdirSync(dir, { recursive: true })

    const canvas = document.createElement('canvas')
    canvas.width = ICON_CSS_W * ICON_DPR
    canvas.height = ICON_CSS_H * ICON_DPR
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(ICON_DPR, ICON_DPR)

    // 圆角底板
    const r = 9
    const w = ICON_CSS_W - 2
    const h = ICON_CSS_H - 2
    ctx.beginPath()
    if (typeof (ctx as any).roundRect === 'function') {
      ;(ctx as any).roundRect(1, 1, w, h, r)
    } else {
      ctx.rect(1, 1, w, h)
    }
    ctx.fillStyle = 'rgba(20, 20, 22, 0.94)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)'
    ctx.stroke()

    // 左侧字形
    ctx.font = '15px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f3f4f6'
    ctx.fillText(isDirectory ? '📁' : '📄', 13, h / 2 + 1)

    // 文件名（超宽截断）
    ctx.font = '12px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = '#e5e7eb'
    const text = truncateToWidth(ctx, label || 'file', ICON_CSS_W - 40 - 12)
    ctx.fillText(text, 38, h / 2 + 1)

    const dataUrl = canvas.toDataURL('image/png')
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const file = path.join(dir, `drag-icon-${process.pid}.png`)
    fsSync.writeFileSync(file, Buffer.from(dataUrl.slice(comma + 1), 'base64'))
    if (lastIconPath && lastIconPath !== file) {
      try { fsSync.unlinkSync(lastIconPath) } catch { /* 已被占用/已删，忽略 */ }
    }
    lastIconPath = file
    return file
  } catch (e) {
    log.warn('[SFTP+] dragout: 生成拖拽图标失败（降级为无图标）：' + (e as Error)?.message)
    return null
  }
}

/**
 * 发起一次原生拖出。**同步阻塞直到拖拽结束**（见文件头说明），调用点必须已做过 Alt 闸门。
 * @param paths 真实磁盘路径（1 个或多个）；必须全部存在，主进程不改写/不做校验
 * @param iconPath `buildDragOutIcon` 的返回值，可为空串
 * @returns true = 原生拖拽已发起（或已结束）；false = 环境不支持 / 调用失败
 */
export function startNativeDragOut(paths: string[], iconPath: string): boolean {
  const wc = getWebContents()
  if (!wc || typeof wc.startDrag !== 'function') return false
  const list = (paths || []).filter(p => typeof p === 'string' && p.length > 0)
  if (!list.length) return false
  const icon = iconPath || ''
  // ⛔ Electron v43 `WebContents::StartDrag`（electron_api_web_contents.cc）只读两个字段：
  //      `if (!item.Get("files", &files) && item.Get("file", &file)) files.push_back(file)`
  //    多文件必须走 `files: string[]`。写成 `file: string[]` 时 gin 无法把数组转成 base::FilePath，
  //    files 为空 ⇒ 主进程直接抛 "Must specify either 'file' or 'files' option"，多选拖出只剩第一个。
  try {
    wc.startDrag(list.length === 1 ? { file: list[0], icon } : { files: list, icon })
    log.info('[SFTP+] dragout: startDrag ok count=' + list.length)
    return true
  } catch (e) {
    // 老版本 Electron 可能没有 files 字段 ⇒ 退化成「只拖第一个」，至少别让用户空手
    if (list.length > 1) {
      try {
        wc.startDrag({ file: list[0], icon })
        log.info('[SFTP+] dragout: startDrag ok (single fallback)')
        return true
      } catch (e2) {
        log.warn('[SFTP+] dragout: startDrag 失败（多文件 + 单文件回退都失败）：' + (e2 as Error)?.message)
        return false
      }
    }
    log.warn('[SFTP+] dragout: startDrag 失败：' + (e as Error)?.message)
    return false
  }
}

/** 清空模块级缓存（面板销毁 / 探针复位用，避免旧 webContents 跨窗口残留） */
export function resetOsDragOutState(): void {
  wcCache = null
  wcUnavailable = false
  if (lastIconPath) {
    try { fsSync.unlinkSync(lastIconPath) } catch { /* ignore */ }
    lastIconPath = null
  }
}

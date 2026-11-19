/**
 * 功能描述：把面板条目「拖出到系统」时，为 Chromium 的非标准拖拽类型 `DownloadURL` 提供内容源。
 *
 * 背景（为什么这是比 `webContents.startDrag` 更合适的通道）：
 *   Chromium 在 Windows 上原生支持 `dataTransfer.setData('DownloadURL', 'MIME:文件名:URL')`：
 *   `WebContentsViewAura::PrepareDragData` 会优先走 `PrepareDragForDownload`，在**松手所在目录**
 *   建一个临时占位文件（CF_HDROP），再由 `DragDownloadFile` 向该 URL 发起下载并把内容写进去。
 *   ⇒ 拖到桌面落在桌面、拖到资源管理器某个文件夹就落在该文件夹，天然满足「下载到拖拽所在位置」。
 *
 *   相比之下 Electron 的 `webContents.startDrag` 要求主进程同步跑 DoDragDrop，会冻结渲染线程，
 *   且在某些 Windows 环境（权限完整性级别 / 拖拽会话被 Blink 抢占）下目标窗口始终拒绝落文件。
 *   DownloadURL 走的是 Chromium 自己的拖拽数据，不碰主进程，也不影响面板内两栏互拖。
 *
 * 关键约束：`dragstart` 处理器必须**同步** `setData`，而远程文件此刻还没有内容。
 *   ⇒ 这里在插件加载时起一个只绑定 127.0.0.1 的临时 HTTP 服务，URL 里带一次性随机 token；
 *     等用户真正松手、Chromium 来 GET 这个 URL 时，才回调 `open()` 去 SFTP 下载（延迟渲染）。
 *
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 * @修改人：DD1024z + DeepSeek-V4.1-Flash
 * @修改时间：2026-11-09 — 增加 onServeStart / onServeEnd 回调：DownloadURL 通道绕开了常规
 *             传输队列，面板需要靠「系统真的来 GET / 流真的结束」这两个信号写传输记录。
 */
import * as http from 'http'
import { randomBytes } from 'crypto'
import type { Readable } from 'stream'

import { log } from '../../services/sftp-logger'

/** 一次拖出的内容提供者。`open()` 直到系统真正来取文件时才调用（可以异步下载远端文件）。 */
export interface DragDownloadSpec {
  /** 落盘文件名（调用方已按本机规则净化） */
  filename: string
  /** 可选大小，仅用于日志/诊断；不写 Content-Length 以免与实际字节数不符导致下载中断 */
  size?: number
  mime?: string
  open: () => Promise<Readable>
  /**
   * 系统真正来 GET 内容时触发一次（= 用户已把文件放到某个系统目录）。
   * ⚠ HEAD 只算探测，不触发；dragstart 本身也不能算开始，否则「拖起来又放回面板」
   *   会写一条永远收不了尾的 pending 日志。
   */
  onServeStart?: () => void
  /** 内容出流正常结束 / 中途失败时触发且只触发一次；bytes 为实际写出的字节数。 */
  onServeEnd?: (result: { ok: boolean; bytes: number; error?: string }) => void
}

interface Registered {
  spec: DragDownloadSpec
  expiresAt: number
}

const TOKEN_TTL_MS = 10 * 60 * 1000
const registry = new Map<string, Registered>()
let port = 0
let serverError = ''
let server: http.Server | null = null

/**
 * 文件名里不能出现半角冒号 —— DownloadURL 的解析器按前两个 `:` 切成
 * `MIME:文件名:URL`，文件名带冒号会把 URL 截断。控制字符/路径分隔符也一并清掉。
 */
function sanitizeFileName(name: string): string {
  const out = String(name || '')
    .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, 180)
  return out || 'download'
}

/**
 * Windows 保留名（Chromium `base::IsReservedNameOnWindows`，base/files/file_util.cc）：
 *   - kKnownDevices：DOS 设备名，按「第一个点之前的前缀」匹配，故 `con.txt` 也算保留名；
 *   - kMagicNames：shell 特殊文件，只按全名匹配（desktop.ini / thumbs.db / conin$ / conout$）。
 */
const WIN_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul', 'clock$',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
])
const WIN_MAGIC_NAMES = new Set(['desktop.ini', 'thumbs.db', 'conin$', 'conout$'])

/**
 * 功能描述：预测 Chromium 在 Windows 上最终把文件落成什么名字。
 *
 * 背景：`PrepareDragForDownload`（content/browser/web_contents/web_contents_view_aura.cc）
 *   会拿 DownloadURL 的 suggested_file_name 调 `net::GenerateFileName`，其中
 *   `GenerateSafeFileName()` 对 Windows 保留名**强制前置下划线**。
 *   这是浏览器刻意的安全策略：否则任意网页都能把 `desktop.ini` 拖进用户的文件夹，
 *   借「自定义文件夹」功能劫持文件夹图标/行为。插件侧**无法让这类文件以原名落盘**。
 *   ⇒ 这里复刻规则，让 DownloadURL 的 filename / URL / Content-Disposition 与落盘名一致，
 *     并由面板提前提示用户，避免「本地拖拽莫名多一个下划线」。
 *   注意：这与「本地端点 / 远程端点」无关，远程的 desktop.ini 同样会加下划线。
 *
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 */
export function predictLandingFileName(name: string): string {
  const clean = sanitizeFileName(name)
  const lower = clean.toLowerCase().replace(/[ .]+$/, '')
  const prefix = lower.split('.')[0]
  const reserved = WIN_DEVICE_NAMES.has(lower) || WIN_DEVICE_NAMES.has(prefix) || WIN_MAGIC_NAMES.has(lower)
  return reserved ? '_' + clean : clean
}

/**
 * ★ 2026-11-15 审计修复（A1，修改人：DD1024z，修改时间：2026-11-15）：
 *   原先回 `Access-Control-Allow-Origin: *` 且不校验 Host —— 绑定在 127.0.0.1 的端点
 *   仍可被 DNS rebinding（攻击页面的域名解析到回环地址）访问到，CORS `*` 又允许读取
 *   响应体，整个端点只剩「128bit token」一道屏障。
 *   下载（Chromium DownloadURL）是导航级请求，**不受 CORS 约束**，因此这里直接去掉
 *   CORS 头、并对 Host 做严格白名单（只认 127.0.0.1/localhost + 本服务端口）。
 */
function responseHeaders(spec: DragDownloadSpec): Record<string, string> {
  const asciiName = spec.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return {
    'Content-Type': spec.mime || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(spec.filename)}`,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  }
}

/** ★ 2026-11-15 审计修复（A1）：Host 必须是本机回环 + 本服务端口，否则视为 rebinding 直接拒绝 */
function isAllowedHostHeader(host: string | undefined): boolean {
  if (!host || !port) return false
  const h = host.trim().toLowerCase()
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`
}

function pruneExpired(): void {
  const now = Date.now()
  for (const [token, item] of registry) {
    if (item.expiresAt < now) registry.delete(token)
  }
}

async function serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const m = /^\/f\/([0-9a-f]{32})(?:\/|$)/.exec(req.url || '')
  if (!m) {
    res.writeHead(404)
    res.end()
    return
  }
  // ★ 2026-11-15 审计修复（A1）：先验 Host 再验 token —— rebinding 场景下 Host 是攻击者域名
  if (!isAllowedHostHeader(req.headers.host)) {
    log.warn('[SFTP+] drag-download: 拒绝非本机 Host 请求 host=' + String(req.headers.host))
    res.writeHead(404)
    res.end()
    return
  }
  if (req.method === 'OPTIONS') {
    // 已不再宣告 CORS 许可；预检只回 204，避免给跨源页面任何「可读」信号
    res.writeHead(204)
    res.end()
    return
  }
  pruneExpired()
  const item = registry.get(m[1])
  if (!item) {
    log.warn('[SFTP+] drag-download: token 无效/已过期 ' + m[1])
    res.writeHead(410)
    res.end()
    return
  }
  // 可 grep 的关键诊断：只要 Chromium 真的采用了 DownloadURL，log.txt 里必有这一行
  log.info('[SFTP+] drag-download: ' + req.method + ' name=' + item.spec.filename + ' token=' + m[1].slice(0, 8))
  const headers = responseHeaders(item.spec)
  if (req.method === 'HEAD') {
    res.writeHead(200, headers)
    res.end()
    return
  }
  // ⚠ 不删除 token：Chromium 的下载管理器可能对同一 URL 重试；靠 TTL 回收即可。
  //   结算只做一次：重试时可能再来一次 GET，传输记录不该记两条。
  let bytes = 0
  let settled = false
  const settle = (ok: boolean, error?: string): void => {
    if (settled) return
    settled = true
    try { item.spec.onServeEnd?.({ ok, bytes, error }) } catch (e) {
      log.warn('[SFTP+] drag-download: 传输记录结算回调异常：' + (e as Error)?.message)
    }
  }
  try { item.spec.onServeStart?.() } catch (e) {
    log.warn('[SFTP+] drag-download: 传输记录起始回调异常：' + (e as Error)?.message)
  }
  let stream: Readable
  try {
    stream = await item.spec.open()
  } catch (e) {
    const msg = (e as Error)?.message || 'unknown'
    log.warn('[SFTP+] drag-download: 准备内容失败：' + msg)
    settle(false, msg)
    res.writeHead(502)
    res.end('source unavailable')
    return
  }
  res.writeHead(200, headers)
  let streamEnded = false
  stream.on('data', (chunk: Buffer | string) => {
    bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length
  })
  stream.on('end', () => {
    streamEnded = true
    log.info('[SFTP+] drag-download: stream end name=' + item.spec.filename + ' bytes=' + bytes)
    settle(true)
  })
  stream.on('error', (e) => {
    log.warn('[SFTP+] drag-download: 读取内容中断：' + (e as Error)?.message)
    settle(false, (e as Error)?.message)
    res.destroy()
  })
  // 用户中途取消 / 连接被断开时流不会 'end' ⇒ 用 close 收尾，避免日志永远停在「进行中」。
  res.on('close', () => {
    if (!streamEnded) settle(false, 'download closed before stream end')
  })
  stream.pipe(res)
}

/** 插件加载即启动：dragstart 是同步事件，等用户拖时端口必须已经就绪。 */
function startServer(): void {
  if (server) return
  try {
    server = http.createServer((req, res) => { void serve(req, res) })
    server.on('error', (e) => {
      serverError = (e as Error)?.message || 'unknown'
      log.warn('[SFTP+] drag-download: 本机服务启动失败：' + serverError)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server?.address()
      port = typeof addr === 'object' && addr ? addr.port : 0
      log.info('[SFTP+] drag-download: server ready port=' + port)
    })
  } catch (e) {
    serverError = (e as Error)?.message || 'unknown'
    log.warn('[SFTP+] drag-download: 本机服务初始化异常：' + serverError)
  }
}
startServer()

/**
 * 登记一次拖出并返回可直接写进 `dataTransfer.setData('DownloadURL', ...)` 的字符串。
 * @returns null = 本机服务尚未就绪/不可用，调用方应降级（不要发起注定失败的拖出）
 */
export function registerDragDownload(spec: DragDownloadSpec): string | null {
  startServer()
  if (!port) {
    log.warn('[SFTP+] drag-download: 端口未就绪，本次拖出降级' + (serverError ? '（' + serverError + '）' : ''))
    return null
  }
  const filename = sanitizeFileName(spec.filename)
  const mime = (spec.mime || 'application/octet-stream').replace(/:/g, '_')
  const token = randomBytes(16).toString('hex')
  registry.set(token, { spec: { ...spec, filename, mime }, expiresAt: Date.now() + TOKEN_TTL_MS })
  const url = `http://127.0.0.1:${port}/f/${token}/${encodeURIComponent(filename)}`
  return `${mime}:${filename}:${url}`
}

/**
 * ★ 2026-11-19（修改人：DD1024z）：撤销一次已登记的拖出下载。
 *
 * 用途：拖拽过程中用户按鼠标右键取消本次拖拽。Chromium 没有中止进行中 HTML5 拖拽的 API，
 * 渲染侧只能尽量让落手不产生结果；而「拖出到系统」的落手会由系统去 GET 本机端点 ——
 * 把 token 从登记表里摘掉，落手时端点回 404，磁盘上就不会多出一个半成品文件。
 * @param value `registerDragDownload` 的返回值（`mime:filename:url`），或裸 URL；传空/无法解析时静默返回
 * @returns true = 确实撤销了一条登记
 */
export function revokeDragDownload(value: string | null | undefined): boolean {
  if (!value) return false
  const m = /\/f\/([0-9a-f]{32})(?:\/|\b)/.exec(String(value))
  if (!m) return false
  const token = m[1]
  if (!registry.has(token)) return false
  registry.delete(token)
  log.info('[SFTP+] drag-download: 拖拽已取消，撤销 token=' + token.slice(0, 8))
  return true
}

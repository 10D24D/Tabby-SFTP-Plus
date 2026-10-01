/**
 * SFTP+ 统一日志
 * 功能描述：封装 Tabby LogService；未绑定时回退 console。供 DI 组件与纯函数模块共用。
 *   ★ 2026-09-30：Tabby 的 log.txt 是宿主与**所有插件共用**的一份 winston 文件日志
 *   （`resources/builtin-plugins/tabby-electron/src/services/log.service.ts`，单一 File transport），
 *   而 `WinstonAndConsoleLogger.doLog()` 只把 `create(name)` 的 name 交给 console，winston 那条
 *   仅收到 `...args` —— 本插件的日志在 log.txt 里**既没有名字、参数还会被改写**：
 *     · 消息里没有 `%` 占位符时，logform 的 splat 变换会把多余参数 `Object.assign` 摊进 info 对象
 *       （对象 → 变成行尾一串 JSON；字符串 → 摊成 `{"0":"x","1":"y"}` 这类垃圾键）；
 *       logform 源码注释原文即 "you are going to have a bad time"。
 *       实证：宿主自打的 `logger.info('v', platform.getAppVersion())` 在 log.txt 里只剩 `info: v`。
 *   因此这里统一两件事：
 *     ① 每条日志都带 `[SFTP+]` 前缀 —— 共用日志里可一眼/grep 过滤出本插件；
 *     ② 先把所有参数拼成**单个字符串**再交给宿主 logger —— 无论宿主后端如何展开 splat，
 *        内容都完整落盘。
 *   ⚠ 绑定成功时 console 会出现 `[sftp-plus] [SFTP+] …` 的双标记（前者是 Tabby ConsoleLogger
 *   自动加的 scope 名），属预期；log.txt 里只有 `[SFTP+]`。
 * 创建人：DD1024z + Composer
 * 创建时间：2026-07-25
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-09-30
 * 修改情况：
 *   - 2026-09-30 (Deepseek-V4.1-Flash)：统一 `[SFTP+]` 行首前缀；多参合并为单参落盘（避免宿主
 *     winston 的 splat 摊平/丢参）；Error 单行化并带上 code/errno/syscall/path 与栈顶两帧。
 */

export type SftpLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'log'

export interface SftpLoggerLike {
  debug(...args: any[]): void
  info(...args: any[]): void
  warn(...args: any[]): void
  error(...args: any[]): void
  log(...args: any[]): void
}

/** Tabby LogService.create 返回的最小形状 */
interface TabbyLogger {
  debug?(...args: any[]): void
  info?(...args: any[]): void
  warn?(...args: any[]): void
  error?(...args: any[]): void
  log?(...args: any[]): void
}

interface TabbyLogServiceLike {
  create(name: string): TabbyLogger
}

/** 传给宿主 LogService.create 的 scope 名（只有 console 会显示；winston 侧不写） */
const SCOPE = 'sftp-plus'
/** 行首标记：log.txt 与宿主/其它插件混排，靠它过滤出本插件的行 */
const PREFIX = '[SFTP+]'
/** 单个参数序列化后的上限（防止把巨型对象整份灌进日志文件） */
const MAX_ARG_CHARS = 2000

function clampText(s: string): string {
  return s.length > MAX_ARG_CHARS ? `${s.slice(0, MAX_ARG_CHARS)}…(+${s.length - MAX_ARG_CHARS})` : s
}

/**
 * 单个参数 → 便于阅读的单行文本。
 * 之所以自己格式化：宿主 winston 后端会把多余参数摊平进对象属性，非首参基本不可用。
 */
function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a
  if (a === null) return 'null'
  if (a === undefined) return 'undefined'
  if (a instanceof Error) return formatError(a)
  // 函数/类：只留名字，避免把整段源码灌进日志
  if (typeof a === 'function') return `[Function ${(a as { name?: string }).name || 'anonymous'}]`
  if (typeof a === 'object') {
    try {
      return clampText(JSON.stringify(a))
    } catch {
      // 循环引用等 → 退化为类型串
      return Object.prototype.toString.call(a)
    }
  }
  return clampText(String(a))
}

/**
 * Error → 单行文本：`Name: message (code=…, errno=…, syscall=…, path=…) <- 栈顶两帧`。
 * 目的：① 落盘后能直接看出错因（宿主只看首参，`log.error('x failed', e)` 过去只剩半句）；
 *      ② 不因 stack 里的换行把一条日志撑成几十行。
 */
function formatError(e: Error): string {
  const extra = e as Error & { code?: unknown; errno?: unknown; syscall?: unknown; path?: unknown }
  const bits: string[] = []
  if (extra.code !== undefined) bits.push(`code=${String(extra.code)}`)
  if (extra.errno !== undefined) bits.push(`errno=${String(extra.errno)}`)
  if (extra.syscall !== undefined) bits.push(`syscall=${String(extra.syscall)}`)
  if (extra.path !== undefined) bits.push(`path=${String(extra.path)}`)
  const frames = (e.stack || '')
    .split('\n')
    .slice(1, 3)
    .map(s => s.trim())
    .filter(Boolean)
    .join(' < ')
  const head = e.message ? `${e.name || 'Error'}: ${e.message}` : String(e)
  return `${head}${bits.length ? ` (${bits.join(', ')})` : ''}${frames ? ` <- ${frames}` : ''}`
}

/** 全部参数 → 单行文本；前缀只在这里加一次（本模块写日志的唯一出口） */
function formatArgs(args: any[]): string {
  return `${PREFIX} ${args.map(stringifyArg).join(' ')}`
}

function consoleFallback(level: SftpLogLevel, args: any[]): void {
  const fn = (console as any)[level] || console.log
  // 回退路径没有宿主 scope 参与，前缀完全由 formatArgs 提供
  fn.call(console, formatArgs(args))
}

let bound: SftpLoggerLike | null = null

function getImpl(): SftpLoggerLike {
  if (bound) return bound
  return {
    debug: (...args) => consoleFallback('debug', args),
    info: (...args) => consoleFallback('info', args),
    warn: (...args) => consoleFallback('warn', args),
    error: (...args) => consoleFallback('error', args),
    log: (...args) => consoleFallback('log', args),
  }
}

/**
 * 在插件模块构造时绑定 Tabby LogService。
 * 可重复调用；首次成功即锁定（避免多实例互相覆盖）。
 */
export function bindSftpLogger(logService: TabbyLogServiceLike | null | undefined): void {
  if (bound || !logService?.create) return
  try {
    const l = logService.create(SCOPE)
    // ★ 关键：先把整行拼成**单个字符串**，再以唯一实参交给宿主 ——
    //   宿主 winston 只把首参当 message，多参会被 splat 摊平成对象属性甚至整段丢失。
    const wrap = (level: SftpLogLevel) => (...args: any[]): void => {
      const line = formatArgs(args)
      const fn = (l as Record<string, unknown>)[level]
      if (typeof fn === 'function') {
        try {
          (fn as (...a: any[]) => void).call(l, line)
          return
        } catch {
          // 宿主 logger 抛错 → 落到 console 回退
        }
      }
      consoleFallback(level, args)
    }
    bound = {
      debug: wrap('debug'),
      info: wrap('info'),
      warn: wrap('warn'),
      error: wrap('error'),
      log: wrap('log'),
    }
  } catch {
    // 保持 console 回退
  }
}

/** 模块级日志入口（核心/适配器无 DI 处直接 import） */
export const log: SftpLoggerLike = {
  debug: (...args) => getImpl().debug(...args),
  info: (...args) => getImpl().info(...args),
  warn: (...args) => getImpl().warn(...args),
  error: (...args) => getImpl().error(...args),
  log: (...args) => getImpl().log(...args),
}

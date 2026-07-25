/**
 * SFTP+ 统一日志
 * 功能描述：封装 Tabby LogService；未绑定时回退 console。供 DI 组件与纯函数模块共用。
 * 创建人：DD1024z + Composer
 * 创建时间：2026-07-25
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

const PREFIX = 'sftp-plus'

function consoleFallback(level: SftpLogLevel, args: any[]): void {
  const fn = (console as any)[level] || console.log
  // Tabby ConsoleLogger 会自带 [name]；回退路径手工加前缀，便于过滤
  fn.call(console, `[${PREFIX}]`, ...args)
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
    const l = logService.create(PREFIX)
    bound = {
      debug: (...args) => (l.debug ? l.debug(...args) : consoleFallback('debug', args)),
      info: (...args) => (l.info ? l.info(...args) : consoleFallback('info', args)),
      warn: (...args) => (l.warn ? l.warn(...args) : consoleFallback('warn', args)),
      error: (...args) => (l.error ? l.error(...args) : consoleFallback('error', args)),
      log: (...args) => (l.log ? l.log(...args) : consoleFallback('log', args)),
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

/**
 * SFTP+ ⇄ QuickCmd+ 联动契约（本文件是 **接收侧** 的唯一定义处）
 * 功能描述：
 *   两个插件是各自独立的 webpack bundle，互不 import（任一方都可能没装），
 *   因此用 window CustomEvent 做松耦合：QuickCmd+ 执行命令后只广播一条「无副作用」的
 *   刷新请求，SFTP+ 自己决定要不要听（设置项 refreshOnQuickCmd，默认关）。
 *
 *   ── 事件协议（QuickCmd+ 侧照抄即可，事件名请勿改动）──────────────────────
 *   window.dispatchEvent(new CustomEvent('sftp-plus-refresh-request', { detail: {
 *     source: 'qc-plus',              // 可选：来源标识，仅日志用
 *     session: terminal.sshSession,   // SSH 会话对象（引用比对，不可序列化）；本地 shell 传 null
 *     isSsh: true,                    // false/缺省 = 本地 shell ⇒ SFTP+ 改为刷「本地栏」
 *     hostLabel: 'root@10.0.0.5',     // 可选：仅日志用
 *     commandName: '备份数据库',        // 可选：仅日志用
 *   }}))
 *   ──────────────────────────────────────────────────────────────────────
 *
 *   ⛔ 为什么不是「发一次、刷一次」：QuickCmd+ 只是把文本写进 pty，**拿不到远端命令的
 *      结束信号**（mysqldump 可能跑几十秒）。所以收到请求后进入「观察期轮询」：
 *      立即刷一次 → 之后按间隔重刷 → 列表连续两次没有变化（或触到硬上限）才停。
 *      这样备份文件一出现（≤1 个间隔）就能看到，长任务也不会被固定等待时间卡死。
 *      实现见下方 QcRefreshObserver。
 *
 *   ⛔ 事件只做「刷新」，不做「跳转 / 改路径 / 改选择」：命令写到哪个目录只有 shell 自己
 *      知道，插件猜不准；同目录刷新由面板的 _pruneSelection 兜住，用户当前选择不会丢。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-27
 */

/** 事件名：QuickCmd+ 派发、SFTP+ 监听。跨仓库字面量，改名必须两侧同步。 */
export const QC_REFRESH_REQUEST_EVENT = 'sftp-plus-refresh-request'

/** 观察期轮询间隔（毫秒）：1.5s 是「远端 readdir 开销」与「文件出现延迟」的折中 */
const OBSERVE_INTERVAL_MS = 1500
/** 观察期硬上限倍数：列表一直在变（备份文件正在写入）时，最多把窗口延长到基础时长的 4 倍 */
const OBSERVE_MAX_MULTIPLIER = 4
/** 观察期绝对硬上限（毫秒）：无论配置多大都不超过 3 分钟，避免忘了关的定时器长期轮询远端 */
const OBSERVE_HARD_CAP_MS = 180000
/** 连续几次指纹相同即认定「列表已稳定」 */
const OBSERVE_STABLE_HITS = 2

/** QuickCmd+ 发来的刷新请求（已归一化） */
export interface SftpRefreshRequest {
  /** 来源标识（'qc-plus'），仅日志用 */
  source: string
  /** 命令所属终端会话对象引用；null/undefined = 发送方未提供（退化为「不区分连接」） */
  session: any
  /** 命令是否跑在 SSH 会话上；false = 本地 shell ⇒ 刷本地栏 */
  isSsh: boolean
  /** 会话可读标识（user@host），仅日志用 */
  hostLabel: string
  /** 命令名，仅日志用 */
  commandName: string
}

/**
 * 校验并归一化事件 detail。
 * ⛔ 跨插件传进来的东西不可信（可能是别的插件、旧版本、手写的 dispatch）——
 *   不校验就解引用 session，会把一个无关事件变成面板里的 TypeError。
 */
export function normalizeRefreshRequest(raw: any): SftpRefreshRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as any
  return {
    source: typeof r.source === 'string' ? r.source : '',
    session: r.session ?? null,
    // 语义：只有明确写 false 才算本地 shell（与面板配置项「缺省按开启」的判定习惯一致）
    isSsh: r.isSsh !== false,
    hostLabel: typeof r.hostLabel === 'string' ? r.hostLabel : '',
    commandName: typeof r.commandName === 'string' ? r.commandName : '',
  }
}

/**
 * QuickCmd+ 插件的 npm 包名（Tabby 以包名登记插件；老包名一并认，避免改名后探测失效）
 * 数据来源：tabby-QuickCmd+/package.json 的 name 字段
 */
export const QUICKCMD_PLUGIN_PACKAGE_NAMES = ['tabby-quick-command-plus', 'tabby-quickcmd-plus']

/** 探测结果的四种状态（unknown = 宿主没给插件清单，此时**不要**提示「未安装」，否则会冤枉用户） */
export type QuickCmdPresence = 'enabled' | 'disabled' | 'missing' | 'unknown'

/** 本窗口是否真的收到过 QuickCmd+ 的刷新请求（收到过 ⇒ 一定装着且活着，比查清单更可信） */
let _quickCmdSeen = false

/** 收到一条合法的联动请求时调用（面板侧收口处调用一次即可） */
export function markQuickCmdSeen(): void {
  _quickCmdSeen = true
}

export function quickCmdEverSeen(): boolean {
  return _quickCmdSeen
}

function _normId(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

function _isQuickCmdPlugin(p: any): boolean {
  if (!p || typeof p !== 'object') return false
  const ids = [_normId(p.name), _normId(p.packageName)]
  if (ids.some(id => QUICKCMD_PLUGIN_PACKAGE_NAMES.includes(id))) return true
  // 有些版本 PluginInfo.path 指向包目录，末段就是包名
  const base = _normId(p.path).split(/[\\/]/).filter(Boolean).pop() || ''
  return !!base && QUICKCMD_PLUGIN_PACKAGE_NAMES.includes(base)
}

/**
 * 探测 QuickCmd+ 是否装在当前 Tabby 里（设置页用来决定是否显示「需先安装」提示）。
 * @param installedPlugins BootstrapData.installedPlugins（宿主启动时给的插件清单）
 * @param pluginBlacklist config.store.pluginBlacklist（被停用的插件名清单，宿主自带机制）
 * 判定顺序：本窗口收到过真实请求 > 清单里找到且未被停用 > 找到但被停用 > 清单里没有。
 * ⛔ 清单缺失/为空一律返回 unknown —— 宁可不说，也不能把「装了但清单读不到」说成「没装」。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-27
 */
export function detectQuickCmdPresence(installedPlugins: any, pluginBlacklist?: any): QuickCmdPresence {
  if (_quickCmdSeen) return 'enabled'
  if (!Array.isArray(installedPlugins) || installedPlugins.length === 0) return 'unknown'
  const hits = installedPlugins.filter(_isQuickCmdPlugin)
  if (hits.length === 0) return 'missing'
  const black = Array.isArray(pluginBlacklist) ? pluginBlacklist.map(_normId) : []
  const enabled = hits.some(p => !black.includes(_normId(p?.name)) && !black.includes(_normId(p?.packageName)))
  return enabled ? 'enabled' : 'disabled'
}

export interface QcObserveOptions {
  /** 基础观察时长（毫秒）；列表还在变化时可延长，但有硬上限 */
  windowMs: number
  /** 轮询间隔（毫秒），缺省 1500 */
  intervalMs?: number
  /**
   * 每次 tick 的动作：刷新一栏并返回「列表指纹」。
   * 指纹相同 ⇒ 认为远端没有再改动该目录；指纹变化 ⇒ 窗口顺延。
   */
  tick: () => Promise<string>
  /** 面板是否还活着（销毁后立即停，避免定时器强引用整棵组件） */
  isAlive?: () => boolean
  /** 诊断日志（可 grep 前缀由调用方给） */
  log?: (msg: string) => void
}

/**
 * 「观察期轮询」执行器：一只面板同时只跑一份（重复 start 会重置，不叠加定时器）。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-27
 */
export class QcRefreshObserver {
  private _timer: any = null
  private _opts: QcObserveOptions | null = null
  private _lastFp = ''
  private _sameCount = 0
  private _deadline = 0
  private _hardDeadline = 0
  private _ticks = 0
  private _running = false
  /** 上一轮刷新还没返回（慢连接）⇒ 本轮跳过，绝不并发压 readdir */
  private _busy = false

  get running(): boolean { return this._running }
  get ticks(): number { return this._ticks }

  start(opts: QcObserveOptions): void {
    this.stop('')
    const windowMs = this._clampWindow(opts.windowMs)
    const now = Date.now()
    this._opts = opts
    this._running = true
    this._busy = false
    this._ticks = 0
    this._sameCount = 0
    this._lastFp = ''
    this._deadline = now + windowMs
    this._hardDeadline = now + Math.min(OBSERVE_HARD_CAP_MS, windowMs * OBSERVE_MAX_MULTIPLIER)
    opts.log?.('quickcmd observe start: window=' + windowMs + 'ms')
    void this._tick()
  }

  stop(reason: string): void {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    if (this._running) {
      this._running = false
      this._opts?.log?.('quickcmd observe stop' + (reason ? ': ' + reason : '') + ' ticks=' + this._ticks)
    }
    this._busy = false
    this._opts = null
  }

  private _clampWindow(ms: number): number {
    const v = Number(ms)
    if (!isFinite(v) || v <= 0) return 10000
    return Math.max(1000, Math.min(OBSERVE_HARD_CAP_MS, v))
  }

  private async _tick(): Promise<void> {
    if (!this._running) return
    const opts = this._opts
    if (!opts) return
    if (opts.isAlive && !opts.isAlive()) { this.stop('panel gone'); return }
    if (this._busy) { this._schedule(); return }
    this._busy = true
    this._ticks++
    try {
      const fp = (await opts.tick()) || ''
      if (!this._running) return
      if (fp && fp === this._lastFp) this._sameCount++
      else this._sameCount = 0
      this._lastFp = fp
      // 列表还在变（备份文件正在写入 / mtime 一直在动）⇒ 顺延窗口，最多推到硬上限
      if (this._sameCount === 0) {
        this._deadline = Math.min(this._hardDeadline, Date.now() + this._clampWindow(opts.windowMs))
      }
    } catch (e) {
      opts.log?.('quickcmd observe tick failed: ' + String(e))
    } finally {
      this._busy = false
    }
    if (!this._running) return
    if (this._sameCount >= OBSERVE_STABLE_HITS) { this.stop('list stable'); return }
    if (Date.now() >= this._deadline) { this.stop('window elapsed'); return }
    this._schedule()
  }

  private _schedule(): void {
    if (!this._running || !this._opts) return
    if (this._timer) clearTimeout(this._timer)
    const iv = Math.max(200, Number(this._opts.intervalMs) || OBSERVE_INTERVAL_MS)
    this._timer = setTimeout(() => { this._timer = null; void this._tick() }, iv)
  }
}

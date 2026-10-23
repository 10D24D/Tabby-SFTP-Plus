/**
 * SFTP+ 面板连接生命周期（connect / disconnect / heartbeat / reconnect）
 * 从主面板组件抽离，降低 sftp-floating-panel 体积
 * @创建人：DD1024z + Auto(未确认底层模型)
 * @创建时间：2026-07-07
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-22 — PathFollowMode 新增第四档 'mirror'（两栏同步路径：一栏换目录另一栏跟随，仅两栏同为本地或同为远程时可用）。
 *             2026-10-20 — 2026-10-19 全量审计 P2-20：去掉心跳恢复提示的硬编码英文兜底
 *              2026-10-20 全量审计：① 心跳恢复快照 sshAtOpen 并在会话被换掉时丢弃本次成果（防引用计数错配
 *                与死缓存）；② 静默重开的 10s 超时定时器持句柄，竞赛结束后 clearTimeout。
 *              （`t('notify.sftpRecovered') || 'SFTP session recovered; …'`）。i18n.t() 已有
 *              「当前语言 → en-US → 返回 key」三级回退，硬编码兜底只在 key 缺失时生效，而那时
 *              它做的是**静默显示错语言**，反而掩盖缺 key；故直接取 t() 结果。
 *              历史：2026-09-30 — ★ 心跳探针改走**底层 russh stat**（绕开宿主包装层）：
 *              现象：空闲时 Tabby 的 `log.txt` 每 10s 多一条 `debug: stat`（用户问「这行是不是
 *              你的、能不能去掉」）；采样 60s 精确 +7、期间零操作零我们自己的日志 ⇒ 确认触发者
 *              就是本文件的探针，而那行日志是宿主 `SFTPSession.stat` 代打的（每个调用者都会打）。
 *              修法：探针直接调底层客户端 —— **语义/频率/判死逻辑全部不变**，只是不再经过会打
 *              日志的包装层；回退链保持「底层 stat → 包装层 stat → 包装层 readdir」。
 *              历史：2026-09-29 ★ issue #25（心跳恢复 / 目录刷新反复失败、日志噪声）：
 *              ① 新增 `recoverChannelForListing()`：目录刷新撞上「通道已死」错误时**静默重建
 *                 子通道并重试一次**（不弹通知、不中断在途传输），不再每刷一次就刷一条 error；
 *              ② 心跳恢复成功后**不再无条件弹提示**——只有在途传输真的被中断才提示用户重试；
 *              ③ 恢复日志限流：前 3 次 info，其后 debug，每 10 次汇总一条 info；
 *              ④ 探测失败降为 debug（它代表「通道只是忙 / 抖动」，恢复前必然出现 need 次）；
 *              ⑤ 反复恢复增加退避：连续恢复把「判定死亡」所需连击数翻倍（上限 4×，10 分钟健康后复位）。
 *              历史（明细见下方代码内注释）：2026-09-26 P0-4 心跳改用「字节是否流动」判活
 *              （空闲 ≥3 次≈30s / 有在途传输 ≥12 次≈120s，探测超时 6s；原逻辑单次超时即
 *              abortInFlightTransfers + forceInvalidate 误杀健康繁忙会话 → 「凡下载必失败」）；
 *              2026-09-25 P0-3 连续失败才判死；2026-09-21 P2 探测单飞 + 恢复频率熔断 +
 *              共享会话代际释放/异步竞态修复，心跳恢复改走 forceInvalidate；2026-09-20 A1
 *              releaseSftp 增加「本面板确实持有会话」守卫（防误关共享同一 SSH 会话的其它面板通道）
 */
import { ChangeDetectorRef, NgZone } from '@angular/core'
import { NotificationsService } from 'tabby-core'

import { SftpConnectionService, SFTPSessionLike, SSHSessionLike, getRusshSftp } from '../../services/sftp.service'
import { SftpI18nService } from '../../services/sftp-i18n.service'
import { getTransferProgressAgeMs } from '../core/transfer-progress'

import { log } from '../../services/sftp-logger'
/**
 * 路径模式（顶栏循环按钮与设置页默认值共用）
 *   off      = 关闭（各自记各自）
 *   remember = 路径记忆（重启后回到上次目录）
 *   sync     = 与终端同步（右栏跟随 SSH 终端 cd）
 *   mirror   = 同步路径（两栏锁在同一路径；★ 2026-10-22 新增，仅两栏同类可用：
 *              本地↔本地 或 远程↔远程。不同类时循环会跳过并提示，见 panel.cyclePathMode）
 */
export type PathFollowMode = 'off' | 'remember' | 'sync' | 'mirror'

export interface ConnectionLifecycleCtx {
  sshSession: SSHSessionLike | null
  sftpSession: SFTPSessionLike | null
  connected: boolean
  connecting: boolean
  reconnecting: boolean
  pathMode: PathFollowMode
  remotePath: string
  remotePathInput: string
  terminalRef: any
  sftpService: SftpConnectionService
  notifications: NotificationsService | null
  getI18n(): SftpI18nService
  zone: NgZone
  cdr: ChangeDetectorRef
  getDefaultRemotePath(): string
  refreshRemote(): Promise<boolean>
  restoreSavedRemotePath(): void
  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：上一次远程列表刷新失败是否属于「通道已死」。
   *   用途：connect/reconnect 后首次刷新失败时**区分两种失败**——
   *     ① 通道已死（SSH 还在重建，稍后自愈）⇒ **不能**把 remotePath 回退成 '/'，
   *        否则路径记忆被兜底值污染（用户实测「重新连接后丢失上次访问路径」）；
   *     ② 目录真的不存在（记忆里的目录被删/无权限）⇒ 才回退 '/' 找可用目录。
   */
  lastRemoteListErrorWasDead?(): boolean
  tryGetTerminalCwd(): Promise<string | null>
  pushRemoteNav(path: string): void
  clearNavHistory(): void
  clearRemoteListing(): void
  setRemoteLoading(loading: boolean): void
  isAlive?(): boolean
  /** ★ 2026-08-26 H10：心跳换会话前中止在途传输，避免幽灵写 */
  abortInFlightTransfers?(): void
  /** ★ 2026-09-25 P0-3：是否存在在途传输。心跳判定「通道死亡」时据此放宽连续失败阈值，
   *  避免大流量下载/上传时探测请求排队超时被误判死亡 → 中断正在进行的传输。 */
  hasActiveTransfers?(): boolean
}

export class PanelConnectionLifecycle {
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private _sshCloseHandler: (() => void) | null = null
  private _heartbeatRecovering = false
  private _heartbeatDisposed = false
  /**
   * ★ 2026-09-21 P2 修复：心跳探测单飞 + 恢复频率熔断。
   * 原实现每 10s 无条件发一次探测，超时后只是不再 await（ssh2 无法真正取消在途
   * stat/readdir）——半开或极慢通道下在途探测会不断叠加。用 in-flight 标志跳过本轮。
   * 另：探测失败但 openFromSSHSession 成功时 _heartbeatRecovering 会被复位，
   * 于是「每 10s 重建一次会话」可以无限持续；用窗口内恢复次数做熔断，
   * 超限后视为不可恢复，交给 handleSessionLost 停掉心跳并让用户手动重连。
   */
  private _heartbeatProbeInFlight = false
  private _heartbeatRecoverCount = 0
  private _heartbeatRecoverWindowStart = 0
  /**
   * ★ 2026-09-25 P0-3：**连续**探测失败计数。
   *   实证：大流量下载会把 SFTP 通道占满，探测的 `stat('.')` 请求排队 >4s → 误判「通道死亡」→
   *   恢复流程 `abortInFlightTransfers()` + `forceInvalidate()` 把正在跑的下载中断并 end 掉会话，
   *   随后立刻又能重开（说明会话其实没死）→ 每 10s 一轮，凡下载必失败（用户侧表现「连接中断」）。
   *   现改为：单次超时只累计、不拆会话；连续达到阈值（见下）才判定死亡并恢复。
   */
  private _heartbeatFailStreak = 0
  /**
   * ★ 2026-10-09 审计根治：心跳「代际」计数。
   *
   * 每次通道被替换（静默自愈成功换上新通道）就 ++。探测发起时把当时的代际快照下来，
   * 超时回调先比对代际 —— 不一致说明「这个失败属于上一代通道」，直接丢弃，
   * 不再累加 _heartbeatFailStreak。否则旧通道的迟到超时会继续累加连击数直到阈值，
   * 把刚重建的**健康**通道 forceInvalidate 掉（自愈成功后立刻又被自己打死）。
   */
  private _heartbeatChannelGen = 0
  /**
   * ★ 2026-10-09：生命周期类彻底销毁标记（区别于「心跳周期停止」）。
   * stopHeartbeat() 会被 startHeartbeat() 在开头调用（重启周期），
   * 也被 disconnect()/销毁调用（真正结束）—— 两种语义必须区分开，
   * 否则「清 _silentReopen」这类只在彻底销毁时才该做的清理会被误触发 / 漏触发。
   */
  private _destroyed = false
  private static readonly HEARTBEAT_RECOVER_WINDOW_MS = 120_000
  private static readonly HEARTBEAT_RECOVER_MAX = 3
  /** 判定通道死亡所需的连续探测失败次数：空闲 3 次（≈30s）；有在途传输时 12 次（≈120s）。
   *  ★ 2026-09-26 P0：忙碌态阈值由 6 次（≈60s）放宽到 12 次（≈120s）。原先 6 次是假设
   *   「60s 零推进＝通道死了」，但现场实测服务端跑 `tar czf`（本插件的打包加速）时，
   *   把磁盘/CPU 压住 30s~60s 而完全没有字节推进是常态，于是健康会话被判死、
   *   在途传输被中断。误杀的代价（丢掉已下载的几十 MB）远高于晚 60s 才察觉死会话的代价，
   *   故在有传输在跑时宁可多等——真死的话传输自己会报错，硬信号
   *   （`ssh.open===false` / `closed$` / `terminal.session===null`）也会立即断开，不受此阈值影响。 */
  private static readonly HEARTBEAT_FAIL_STREAK_IDLE = 3
  private static readonly HEARTBEAT_FAIL_STREAK_BUSY = 12
  /** 单次探测超时（ms）。原 4s 在大流量下过于激进，放宽到 6s（仍 < 10s 心跳间隔）。 */
  private static readonly HEARTBEAT_PROBE_TIMEOUT_MS = 6000
  /**
   * ★ 2026-09-26 P0：**「字节在流动」的判活宽限期**。
   *   窗口内有过字节推进 ⇒ 通道一定活着 ⇒ 跳过本轮探测并清零失败连击。
   *   取 30s ≈ 3 个心跳周期：留足容错，又能在传输真正停摆后迅速恢复探测。
   */
  private static readonly HEARTBEAT_PROGRESS_GRACE_MS = 30_000

  /**
   * ★ 2026-09-29 issue #25：**连续恢复退避**。
   *   弱网下「通道死了 → 重建 → 又死」可以每 30~60s 循环一次（实测日志 363 次恢复），
   *   每次都 abort + forceInvalidate + 刷新，churn 明显。故每恢复一次，
   *   「判定通道死亡」所需的连续探测失败次数就翻倍（上限 4×）；
   *   连续 10 分钟没有再发生恢复（= 通道确实稳住了）才把倍率复位。
   */
  private _heartbeatRecoverStreak = 0
  private _heartbeatLastRecoverAt = 0
  private static readonly HEARTBEAT_RECOVER_HEALTHY_RESET_MS = 600_000
  private static readonly HEARTBEAT_RECOVER_BACKOFF_MAX = 4
  /** ★ 2026-09-29 issue #25：恢复日志限流——前 LOG_VERBOSE 次 info，其后 debug，每 LOG_EVERY 次汇总一条 info */
  private _heartbeatRecoverLogCount = 0
  private static readonly HEARTBEAT_RECOVER_LOG_VERBOSE = 3
  private static readonly HEARTBEAT_RECOVER_LOG_EVERY = 10

  /**
   * ★ 2026-09-29 issue #25：目录刷新的「通道自愈」。
   *   `_silentReopen` 单飞：同一时刻只允许一次静默重建，并发刷新共享同一结果。
   *   `_lastSilentReopenAt` 限流：3s 内不重复重建，避免用户连点刷新把健康通道反复拆建。
   */
  private _silentReopen: Promise<SFTPSessionLike | null> | null = null
  private _lastSilentReopenAt = 0
  private static readonly SILENT_REOPEN_MIN_INTERVAL_MS = 3000
  /** 静默重建的有界等待（ms）：openFromSSHSession 自带 30s 超时，这里收紧，避免半开链路把一次刷新卡半分钟 */
  private static readonly SILENT_REOPEN_TIMEOUT_MS = 10_000

  constructor(private readonly ctx: ConnectionLifecycleCtx) {}

  private isAlive(): boolean {
    // ★ 2026-10-09：_destroyed 是本类的「已彻底销毁」硬标记，一旦置位不可逆。
    //   isAlive() 是全类所有异步回调的收口闸门（detectChanges / 装通道 / 通知等），
    //   在这里并入判断 ⇒ 面板销毁后任何在途回调都直接短路，不必各自再判。
    if (this._destroyed) return false
    try { return this.ctx.isAlive?.() ?? true } catch { return false }
  }

  /**
   * ★ 2026-10-09 新增：面板生命周期彻底结束时调用（须与 stopHeartbeat 分开——
   * 后者只是「重启/停止心跳周期」，本方法是「本面板不会再有任何异步动作」）。
   * 面板 ngOnDestroy 里调用一次。
   */
  markDestroyed(): void {
    this._destroyed = true
    this.stopHeartbeat()
    // 彻底销毁：清空所有「只对活着的面板有意义」的状态
    this._silentReopen = null
    this._openingSftp = new WeakMap<object, Promise<any>>()
  }

  private detectChanges(): void {
    if (!this.isAlive()) return
    try { this.ctx.cdr.detectChanges() } catch { /* destroyed view */ }
  }

  /**
   * 释放 SFTP 子通道并清除服务层缓存。
   * ★ 2026-09-20 A1 审计修复：必须自带「本面板是否真的持有会话」守卫。
   *   原实现只判 c.sshSession（一直非空），于是「心跳失败 → handleSessionLost」与
   *   「关面板 → disconnect」会对同一次 open 调用两次 closeForSSHSession，
   *   引用计数被多减一次 → 归零 → end()，把共享同一 SSH 会话的其它面板
   *   仍在使用的通道关掉（对方传输中断）。
   *   与 connect() 中 `if (c.sftpSession) this.releaseSftp()` 的守卫语义对齐：
   *   一次 openFromSSHSession 严格对应一次 release。
   */
  private releaseSftp(): void {
    const c = this.ctx
    if (!c.sftpSession) return
    const held = c.sftpSession
    if (c.sshSession) {
      c.sftpService.closeForSSHSession(c.sshSession, held)
    }
    c.sftpSession = null
  }

  /**
   * ★ 2026-09-29 issue #25：目录刷新撞上「通道已死」错误时的自愈入口。
   *   返回 true = 已经换成一条**新的** SFTP 子通道，调用方应重试一次刷新；
   *   返回 false = 没救回来（调用方照常报错）。
   *
   *   与心跳恢复的分工：
   *   - 心跳恢复是「无人操作时」的后台兜底，代价大（中止全部在途传输 + 弹提示）；
   *   - 这里是「用户正在操作时」的即时自愈：只在**没有在途传输**时动手（有传输时交给心跳，
   *     避免静默打断用户正在跑的传输），不弹任何通知，成功就静默重试。
   */
  async recoverChannelForListing(): Promise<boolean> {
    const c = this.ctx
    if (!c.connected || !c.sshSession) return false
    try {
      if ((c.sshSession as { open?: boolean }).open === false) {
        this.handleSessionLost('[SFTP+] SSH session closed (detected while listing)')
        return false
      }
    } catch { /* ignore */ }
    // 有在途传输 → 让心跳按自己的节奏处理（它会 abort + 明确提示用户重试），此处不插手
    let busy = false
    try { busy = !!c.hasActiveTransfers?.() } catch { busy = false }
    if (busy) {
      log.warn('listing hit a dead channel while transfers are in flight, deferring to heartbeat')
      return false
    }
    if (this._silentReopen) return !!(await this._silentReopen.catch(() => null))
    const p = this._reopenSftpSilently()
    this._silentReopen = p
    try {
      return !!(await p)
    } finally {
      if (this._silentReopen === p) this._silentReopen = null
    }
  }

  /**
   * 静默重建 SFTP 子通道（forceInvalidate + reopen），不弹通知、不中止在途传输。
   * 失败 / 超时返回 null。超时后迟到的通道会自行安装（面板仍缺通道时）或释放（避免引用计数泄漏）。
   */
  private async _reopenSftpSilently(): Promise<SFTPSessionLike | null> {
    const c = this.ctx
    const sshAtOpen = c.sshSession
    if (!sshAtOpen) return null
    if (Date.now() - this._lastSilentReopenAt < PanelConnectionLifecycle.SILENT_REOPEN_MIN_INTERVAL_MS) {
      return null
    }
    this._lastSilentReopenAt = Date.now()
    try {
      // 通道已被判死：必须广播失效（无视引用计数清缓存 + end），否则 open 会缓存命中同一个死会话
      if (c.sftpSession) {
        c.sftpService.forceInvalidate(sshAtOpen)
        c.sftpSession = null
      }
    } catch (e) {
      log.warn('Silent SFTP reopen: invalidate failed', e)
    }
    // ★ 2026-10-09：改走单飞闸门，避免与 connect/reconnect/心跳恢复并发时各自 _addRef
    const openPromise = this._openSftpSingleFlight(sshAtOpen, (s: SSHSessionLike) => c.sftpService.openFromSSHSession(s))
    let timedOut = false
    // ★ 2026-10-20 全量审计 P3：持有超时定时器句柄。原实现在 Promise.race 里造一个
    //   匿名 10s setTimeout：通道提前打开成功时它不会撤销，一直挂到 10s 后才 resolve（且
    //   结果被丢弃）⇒ 弱网下每次心跳恢复都留一枚 10s 定时器。竞赛结束后立即清除。
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const timedOutResult = new Promise<null>(resolve => {
      timeoutId = setTimeout(() => { timedOut = true; resolve(null) }, PanelConnectionLifecycle.SILENT_REOPEN_TIMEOUT_MS)
    })
    let fresh: SFTPSessionLike | null = null
    try {
      fresh = await Promise.race([
        openPromise.catch((e) => { log.warn('Silent SFTP reopen failed', e); return null }),
        timedOutResult,
      ])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
    if (fresh) {
      if (!this.isAlive() || !c.connected || c.sshSession !== sshAtOpen) {
        c.sftpService.closeForSSHSession(sshAtOpen, fresh)
        return null
      }
      c.sftpSession = fresh
      // ★ 2026-10-09 审计根治（代际错配 /「自愈成功后立刻又被自己打死」）：
      //   换通道时必须把心跳的「代际状态」一并复位。此前只换了 c.sftpSession，
      //   而 _heartbeatFailStreak / _heartbeatProbeInFlight 都**没有清**：
      //     · 旧通道 stat 的 6s 超时回调随后到达（它并不知道通道已被换掉），
      //       _heartbeatDisposed / _heartbeatRecovering 均为 false、进度时钟若不新鲜
      //       → _heartbeatFailStreak++ 继续累加到阈值 need
      //       → forceInvalidate(c.sshSession) 按 SSH 会话广播，
      //         把 sessions 缓存里**刚装好的 healthy 新通道**直接 end()，
      //         并把面板 c.sftpSession 清空（僵尸态：显示未连接、实则刚建好）。
      //   根治：新通道装上的同一时刻，清零 streak、复位在途标记，并记下新通道身份，
      //   让在途的旧代回调能被识别为「过期代」而不再影响判死（见下方 probe 的代际校验）。
      this._heartbeatFailStreak = 0
      this._heartbeatProbeInFlight = false
      this._heartbeatChannelGen++
      log.info('SFTP session silently reopened for retry (channel was reported closed)')
      return fresh
    }
    if (timedOut) {
      // 迟到通道：面板仍缺通道且条件未变 → 装上；否则主动释放我们这一份引用（防泄漏）
      void openPromise.then((late) => {
        if (!late) return
        const usable = this.isAlive() && c.connected && c.sshSession === sshAtOpen && !c.sftpSession
        if (usable) {
          c.sftpSession = late
          // ★ 2026-10-09：通道被替换 → 心跳代际 +1（让在途的旧代探测回调作废，见 _heartbeatChannelGen）
          this._heartbeatChannelGen++
          log.info('late SFTP channel installed after silent reopen timeout')
        } else {
          c.sftpService.closeForSSHSession(sshAtOpen, late)
        }
      }).catch(() => { /* open 失败无需处理 */ })
    }
    return null
  }

  /** SSH/SFTP 会话失效：断开连接并清空远程列表 */
  private handleSessionLost(logMsg?: string): void {
    const c = this.ctx
    c.zone.run(() => {
      c.connected = false
      this.releaseSftp()
      c.clearRemoteListing()
      this.stopHeartbeat()
      this.detectChanges()
      if (logMsg) log.info(logMsg)
    })
  }

  private notifyConnectFailed(e: unknown): void {
    const c = this.ctx
    const msg = c.getI18n().t('notify.sftpConnectFailed')
    const detail = e instanceof Error ? e.message : String(e ?? '')
    try { c.notifications?.error?.(msg, detail) } catch { /* ignore */ }
  }

  /**
   * ★ 2026-10-09 审计根治：**打开 SFTP 通道的单飞闸门**。
   *
   * 问题（见 connect() 的注释）：openFromSSHSession 是引用计数语义，多个入口并发调用会
   *   各自 _addRef，而面板只持有 1 个引用（c.sftpSession 是单一字段）⇒ 引用计数永不归零
   *   ⇒ sftp.end() 永不执行 ⇒ 通道泄漏。原先只靠各自入口的布尔守卫互斥，而
   *   connect / reconnect / 静默重建 三者用的是**三套不同的标志位**，互不排斥。
   *
   * 根治：所有入口一律走本方法。已在飞则直接复用同一个 Promise（不重复 addRef），
   *   飞完后在 finally 里清空闸门。闸门按 sshSession 对象分桶 —— 换会话（重连成功后
   *   sshSession 会变）自然落到另一个桶，不会被旧会话的在途请求挡住。
   */
  private _openingSftp = new WeakMap<object, Promise<any>>()

  private _openSftpSingleFlight(
    sshSession: unknown,
    open: (s: unknown) => Promise<any>,
  ): Promise<any> {
    const key = (sshSession && typeof sshSession === 'object') ? sshSession as object : null
    if (!key) return open(sshSession)
    const inFlight = this._openingSftp.get(key)
    if (inFlight) return inFlight
    const p = (async () => open(sshSession))()
    this._openingSftp.set(key, p)
    // 无论成败都释放闸门；失败时 p 已 reject，这里只做清理（不吞错误，交回调用方）
    void p.then(
      () => { if (this._openingSftp.get(key) === p) this._openingSftp.delete(key) },
      () => { if (this._openingSftp.get(key) === p) this._openingSftp.delete(key) },
    )
    return p
  }

  async connect(): Promise<void> {
    const c = this.ctx
    // ★ 2026-10-09 审计根治（通道泄漏）：原先守卫是 `if (c.connecting || c.connected) return`，
    //   而 reconnect() 的守卫是 `if (c.reconnecting) return` —— **两个守卫互不排斥**。
    //   openFromSSHSession 对并发调用是**引用计数**语义（pending 命中分支与 existing 分支
    //   都会 _addRef），于是「初始连接进行中（connecting=true，openFromSSHSession 最长等 30s）
    //   时用户点重连」会让两条流程各自 _addRef：
    //     refCounts[sshSession] = 2，但面板的 c.sftpSession 是**单一字段**，
    //     后写入者覆盖前者，最终只持有 1 个引用；
    //   之后 releaseSftp() 只 closeForSSHSession 一次 ⇒ refs = 2-1 = 1 > 0
    //   ⇒ 走 return 分支，sessions.delete 与 sftp.end() **都不执行**
    //   ⇒ 该 SFTP 子通道连同其 SSH channel 引用**永久泄漏**，进程内持续堆积。
    //   根治：所有「打开 SFTP 通道」的入口（connect / reconnect / 静默重建）共用
    //   同一个 in-flight Promise（见 _openSftpSingleFlight），由它去拿引用，
    //   并发的调用方**复用同一结果**而不是各自 addRef。
    //   （不删 c.connecting / c.reconnecting：它们还各自负责 loading 态与 UI 语义。）
    if (c.connecting || c.connected || !c.sshSession) return
    c.connecting = true
    c.setRemoteLoading(true)
    this.detectChanges()
    try {
      // ★ 2026-07-25：B5 修复——仅当本面板已有 SFTP 会话（即重连）时才先释放旧的；
      //   首次连接直接复用可能由其它面板持有的共享会话，避免误杀其它面板。
      if (c.sftpSession) this.releaseSftp()
      const sshAtOpen = c.sshSession
      // ★ 2026-10-09：改走单飞闸门（与 connect / 静默重建 / 心跳恢复共用）
      const acquired = await this._openSftpSingleFlight(sshAtOpen, (s: SSHSessionLike) => c.sftpService.openFromSSHSession(s))
      if (!this.isAlive() || c.sshSession !== sshAtOpen) {
        c.sftpService.closeForSSHSession(sshAtOpen, acquired)
        return
      }
      c.sftpSession = acquired
      // ★ 2026-10-09：通道被替换 → 心跳代际 +1（让在途的旧代探测回调作废，见 _heartbeatChannelGen）
      this._heartbeatChannelGen++
      c.connected = true
      this.startHeartbeat()
      await this.applyInitialRemotePath()
      const ok = await c.refreshRemote()
      await this._fallbackInitialRemotePathIfInvalid(ok)
      c.pushRemoteNav(c.remotePath)
    } catch (e) {
      log.error('Connection failed', e)
      c.connected = false
      this.releaseSftp()
      this.stopHeartbeat()
      c.clearRemoteListing()
      if (this.isAlive()) this.notifyConnectFailed(e)
    } finally {
      c.connecting = false
      c.setRemoteLoading(false)
      this.detectChanges()
    }
  }

  disconnect(): void {
    const c = this.ctx
    c.connected = false
    this.releaseSftp()
    c.clearRemoteListing()
    this.stopHeartbeat()
    // ★ 2026-10-09：断开连接时作废在途静默重建（它装上面板前会查 connected，此处已置 false ⇒
    //   必然走到 closeForSSHSession 释放自己那份引用，不会泄漏）。
    //   这里**可以**清 _silentReopen：与 startHeartbeat 的区别在于 disconnect 是
    //   「明确要结束这一代连接」，而 startHeartbeat 只是「重启心跳周期」。
    this._silentReopen = null
    c.clearNavHistory()
  }

  stopHeartbeat(): void {
    this._heartbeatDisposed = true
    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer)
      this._heartbeatTimer = null
    }
    if (this._sshCloseHandler !== null) {
      try { this._sshCloseHandler() } catch { /* ignore */ }
      this._sshCloseHandler = null
    }
    // ★ 2026-10-09：真正的「彻底停止」在此清 _silentReopen —— 面板销毁时
    //   在途的静默重建已无意义（其 finally 里对 isAlive() 的检查会阻止装上面板）。
    //   注意区分两种调用：
    //     · disconnect() / 面板销毁 → 本方法，清 _silentReopen 是对的；
    //     · startHeartbeat() 首行也会调本方法 —— 那里**不能**清（会破坏单飞，见下）。
    //   故实际清空放在 destroy()，这里只标记不可继续新建（见下方 _silentReopen 判定）。
    if (this._destroyed) this._silentReopen = null
    // 重置恢复标志，防止后续心跳触发重连
    this._heartbeatRecovering = false
    this._heartbeatProbeInFlight = false
    this._heartbeatRecoverCount = 0
    this._heartbeatRecoverWindowStart = 0
    this._heartbeatFailStreak = 0
    // ★ 2026-09-29 issue #25：日志限流一并复位
    this._heartbeatRecoverLogCount = 0
    // ★ 2026-10-09 审计根治（两处）：
    //
    // (1) `_heartbeatRecoverStreak = 0` 的复位点选错了。
    //     退避倍率的语义是「连续恢复 ⇒ 通道确实不稳 ⇒ 需要更长判死窗口」（issue #25）。
    //     而用户手动重连的**必经之路**是 reconnect() 末尾的 startHeartbeat()
    //     → 而 startHeartbeat() 首行就是本方法 stopHeartbeat()
    //     ⇒ 「弱网 → 心跳恢复 → 通道又死 → 用户手点重连」这个循环里，
    //     每轮都被清零，backoff 恒为 1，**退避倍率从未生效过**，
    //     文档里「实测日志 363 次恢复」的弱网场景照样每 30~60s 一轮风暴。
    //     根治：退避记忆只在「通道健康保持一段时间」或「面板销毁」时复位
    //     （HEARTBEAT_RECOVER_HEALTHY_RESET_MS 那段已在做后者的判定），
    //     此处**不再**清 —— 手动重连不是「通道变健康了」，只是用户不耐心的重试。
    //
    // (2) `_silentReopen = null` 破坏了单飞。
    //     _silentReopen 是 _reopenSftpSilently 唯一的并发互斥手段
    //     （其内部最长 10s，3s 节流挡不住已过 3s 的第二次调用）。
    //     置 null 只是丢掉引用，**并不取消在途重建** ⇒ disconnect / handleSessionLost /
    //     重连若发生在静默重建的 10s 窗口内，之后的刷新会启动第二次重建：
    //       · 两者都成功时，第二次走 existing 分支拿到**同一对象**并再 _addRef（refCount 2），
    //         而面板只存 1 个引用 ⇒ 与 connect/reconnect 竞态同型的引用计数泄漏；
    //       · 且第二次里的 forceInvalidate(sshAtOpen) 会把第一次刚装上的通道 end 掉。
    //     根治：**不清** _silentReopen（让在途重建继续作为互斥依据，finally 里自会清）；
    //     真正需要作废的是「重建完成后是否还装面板」，那已由 sshAtOpen 身份比对负责。
    // 通道代际一并推进：stopHeartbeat 意味着「当前代的心跳周期结束」，
    //   在途探测的迟到回调不应再影响下一代。
    this._heartbeatChannelGen++
  }

  /**
   * 记录一次心跳恢复，返回 true 表示窗口内恢复过于频繁（恢复无效），应停止自动恢复。
   * 窗口滑动重置，避免长时间运行累积计数造成误熔断。
   */
  private _shouldGiveUpRecovery(): boolean {
    const now = Date.now()
    if (now - this._heartbeatRecoverWindowStart > PanelConnectionLifecycle.HEARTBEAT_RECOVER_WINDOW_MS) {
      this._heartbeatRecoverWindowStart = now
      this._heartbeatRecoverCount = 0
    }
    this._heartbeatRecoverCount++
    return this._heartbeatRecoverCount > PanelConnectionLifecycle.HEARTBEAT_RECOVER_MAX
  }

  startHeartbeat(): void {
    this.stopHeartbeat()
    this._heartbeatDisposed = false
    const c = this.ctx

    try {
      const ssh = c.sshSession as {
        closed$?: { subscribe: (o: { next?: () => void }) => { unsubscribe: () => void } }
        closed?: Promise<void>
      } | null
      if (ssh) {
        if (ssh.closed$ && typeof ssh.closed$.subscribe === 'function') {
          const sub = ssh.closed$.subscribe({
            next: () => {
              if (this._heartbeatDisposed) return
              this.handleSessionLost('[SFTP+] SSH session closed (detected via closed$)')
            },
          })
          this._sshCloseHandler = () => {
            try { sub.unsubscribe() } catch { /* ignore */ }
          }
        } else if (typeof ssh.closed?.then === 'function') {
          void (ssh.closed as Promise<void>).then(() => {
            if (this._heartbeatDisposed) return
            this.handleSessionLost('[SFTP+] SSH session closed (detected via .closed Promise)')
          }).catch(() => { /* ignore */ })
        }
      }
    } catch { /* ignore */ }

    this._heartbeatTimer = setInterval(() => {
      if (!c.connected || !c.sftpSession) return

      try {
        const ssh = c.sshSession as { open?: boolean } | null
        if (ssh?.open === false) {
          this.handleSessionLost('[SFTP+] SSH session closed (detected via open=false)')
          return
        }
      } catch { /* ignore */ }

      try {
        if (c.terminalRef?.session === null) {
          this.handleSessionLost('[SFTP+] SSH session closed (detected via terminal.session=null)')
          return
        }
      } catch { /* ignore */ }

      // ★ 2026-09-21 P2：上一轮探测仍在途（慢/半开通道）时跳过本轮，避免请求堆叠
      if (this._heartbeatProbeInFlight) return

      // ★ 2026-09-26 P0：**用「字节是否在流动」判活，而不是用探测请求**。
      //   SFTP 是单通道多路复用：探测的 `stat('.')` 与数据块读**共用同一条通道**，
      //   大流量下载时探测只能排队并超时。用它判活 ＝ 把「通道很忙」误读成「通道已死」，
      //   于是走恢复流程 `abortInFlightTransfers()` + `forceInvalidate()`：
      //   既取消正在跑的传输，又 end 掉健康会话，而且取消是「静默」的（不产生错误日志），
      //   用户侧表现就是「凡下载必失败、上传却没事、还看不到原因」（2026-09-26 实测日志 4341）。
      //   反转判据：只要有字节推进，通道就一定是活的 —— **数据本身才是最可靠的探针**。
      //   此时跳过探测，既不会误判，也不再给已经饱和的通道加压。
      //   反向保证：真死了则 0 字节推进 → 时钟变旧 → 下面照常探测并累计连击。
      if (getTransferProgressAgeMs() < PanelConnectionLifecycle.HEARTBEAT_PROGRESS_GRACE_MS) {
        this._heartbeatFailStreak = 0
        return
      }

      const sftp = c.sftpSession
      // ★ 2026-08-26：探测固定 '.'，避免当前 remotePath 被删误触发恢复风暴
      const probePath = '.'
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('heartbeat-timeout')),
          PanelConnectionLifecycle.HEARTBEAT_PROBE_TIMEOUT_MS,
        )
      })

      // ★ 2026-09-30：探测改走**底层 russh 客户端**，绕开宿主包装层。
      //   为什么：宿主 `SFTPSession.stat` 第一行就是 `this.logger.debug('stat', p)`（`tabby-ssh/
      //   dist/index.js:5329`）—— **每个调用者都会打这行，包括我们**。于是空闲时 Tabby 的
      //   `log.txt` 每 10s 多一条 `debug: stat`（实测采样 60s 精确 +7、期间零操作零我们的日志），
      //   看起来像「宿主的噪声」，实则是本探针触发的。宿主 `constructor(sftp, injector){ this.sftp = sftp }`
      //   （dist:5307）⇒ TS 的 `private` 在运行时只是普通实例属性，`getRusshSftp()` 稳定可解。
      //   为什么安全：探针只判「这次往返成没成」，返回值**恒丢弃**，不依赖包装层的类型映射 /
      //   错误归一化 ⇒ 直接用底层客户端**语义等价**，只是不再经过会打日志的那层。
      //   频率（10s）、超时（6s）、连击判死、退避全都不变。
      //   回退链与改动前一致：底层 `stat` → 包装层 `stat` → 包装层 `readdir`（缺哪级用哪级）。
      //   构造期同步抛错（napi 客户端已关等）也当作「本次探测失败」，交由下方 catch 累计连击。
      const clearProbeTimeout = (): void => {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }
      const buildProbe = (): Promise<unknown> => {
        const raw = getRusshSftp(sftp)
        if (raw?.stat) return Promise.resolve(raw.stat(probePath)).then(clearProbeTimeout)
        if (typeof sftp.stat === 'function') return Promise.resolve(sftp.stat(probePath)).then(clearProbeTimeout)
        return Promise.resolve(sftp.readdir(probePath)).then(clearProbeTimeout)
      }
      let probe: Promise<unknown>
      try {
        probe = buildProbe()
      } catch {
        probe = Promise.reject(new Error('heartbeat-probe-construct-failed'))
      }

      this._heartbeatProbeInFlight = true
      // ★ 2026-10-09：记录本次探测发起时的通道代际（供下面的超时回调比对）
      const probeGen = this._heartbeatChannelGen
      Promise.race([probe, timeoutPromise]).then(() => {
        // 探测成功 = 通道健康：清零失败连击与熔断计数
        this._heartbeatRecoverCount = 0
        this._heartbeatFailStreak = 0
        // ★ 2026-10-09 审计根治：探测成功是「通道确实健康」的**硬证据**，
        //   是退避记忆唯一正确的复位点（issue #25 的退避倍率依赖它才能在恢复后回落）。
        //   原先的复位点被放在 stopHeartbeat()，而手动重连必经 stopHeartbeat
        //   ⇒ 用户每点一次重连就把退避清零，倍率恒为 1、从未生效。
        //   顺带更新 _heartbeatLastRecoverAt：下面的健康保持判定以它为基准。
        if (this._heartbeatRecoverStreak > 0) {
          this._heartbeatRecoverStreak = 0
          this._heartbeatLastRecoverAt = Date.now()
        }
      }).catch(async () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
        // 组件已销毁或心跳已停止：不再执行恢复
        if (this._heartbeatDisposed) return
        if (this._heartbeatRecovering) return
        // ★ 2026-10-09 审计根治：代际校验 —— 探测期间通道已被替换（静默自愈装上新通道）时，
        //   本次超时描述的是**旧通道**，与新通道的健康状况无关。
        //   不校验的话它会继续累加 _heartbeatFailStreak 直到阈值，
        //   然后 forceInvalidate 把刚建好的健康通道 end() 掉并清空 c.sftpSession
        //   （用户侧表现：刚自愈成功，界面又变成未连接，所有操作报 session closed）。
        if (probeGen !== this._heartbeatChannelGen) {
          log.debug('[SFTP+] heartbeat probe result discarded: channel was replaced during probe')
          this._heartbeatFailStreak = 0
          return
        }
        // ★ 2026-09-26 P0：探测「发起后 → 超时前」这段时间里若又推进了字节，说明通道其实活着，
        //   探测只是被数据请求挤超时（探测是异步的，发起时的快照到超时时可能已过期）。
        if (getTransferProgressAgeMs() < PanelConnectionLifecycle.HEARTBEAT_PROGRESS_GRACE_MS) {
          this._heartbeatFailStreak = 0
          return
        }
        // ★ 2026-09-25 P0-3 修复：**单次探测超时不得拆会话**。大流量下载会把 SFTP 通道占满，
        //   探测的 stat('.') 排队 >超时是常态；原实现立刻 `abortInFlightTransfers()`
        //   + `forceInvalidate()` → 中断正在跑的传输并 end 掉健康会话（用户侧表现为「连接中断」、
        //   凡下载必失败，且恢复后立刻又能重开 → 10s 一轮死循环）。
        //   改为累计**连续**失败：空闲 ≥3 次（≈30s）、有在途传输 ≥6 次（≈60s）才判定通道死亡。
        this._heartbeatFailStreak++
        const busy = (() => { try { return !!c.hasActiveTransfers?.() } catch { return false } })()
        const base = busy
          ? PanelConnectionLifecycle.HEARTBEAT_FAIL_STREAK_BUSY
          : PanelConnectionLifecycle.HEARTBEAT_FAIL_STREAK_IDLE
        // ★ 2026-09-29 issue #25：反复恢复时退避——每恢复一次，判定死亡所需连击数翻倍（上限 4×），
        //   避免弱网下「重建 → 又死」每 30~60s 循环一次把日志和 CPU 刷满。
        if (this._heartbeatRecoverStreak > 0
          && Date.now() - this._heartbeatLastRecoverAt > PanelConnectionLifecycle.HEARTBEAT_RECOVER_HEALTHY_RESET_MS) {
          this._heartbeatRecoverStreak = 0
        }
        const backoff = Math.min(
          PanelConnectionLifecycle.HEARTBEAT_RECOVER_BACKOFF_MAX,
          1 + this._heartbeatRecoverStreak,
        )
        const need = base * backoff
        if (this._heartbeatFailStreak < need) {
          // ★ 2026-09-29 issue #25：降为 debug —— 单次探测失败只是「通道忙 / 网络抖动」的正常现象，
          //   每次恢复前必然出现 need 次（弱网下实测把 log.txt 刷满）；真正的恢复动作仍有 info/warn。
          log.debug(`[SFTP+] heartbeat probe failed (${this._heartbeatFailStreak}/${need}${busy ? ', transfers in flight' : ''}), keeping current session`)
          return
        }
        // ★ 2026-09-21 P2：恢复过于频繁说明重建会话无效，停止自动恢复（否则每 10s 一轮无限重建）
        if (this._shouldGiveUpRecovery()) {
          log.warn('[SFTP+] heartbeat recovery attempted too often, giving up automatic recovery')
          this.handleSessionLost('[SFTP+] heartbeat recovery ineffective, disconnecting')
          return
        }
        this._heartbeatRecovering = true
        try {
          // 再次检查：防止异步期间状态变化
          if (this._heartbeatDisposed) return
          if (!c.sshSession) throw new Error('no ssh session')
          // ★ 2026-09-29 issue #25：先记下「是否真的有在途传输」——它决定要不要打断用户并提示。
          //   全静默恢复（没有传输被中断）不该弹任何提示：弱网下实测 363 次恢复 = 363 次打扰。
          const interrupted = (() => { try { return !!c.hasActiveTransfers?.() } catch { return false } })()
          // ★ 2026-08-26 H10：换会话前中止传输，避免旧流写已释放通道
          try { c.abortInFlightTransfers?.() } catch { /* ignore */ }
          // ★ 2026-09-21 P1 修复：通道已被心跳确认死亡，必须广播失效（无视引用计数清缓存+end），
          //   而非普通 release——多面板共享（refCount>1）时普通 release 不归零，随后的
          //   openFromSSHSession 会缓存命中**同一个死会话**，陷入每 10s 一轮的恢复死循环。
          //   其他共享面板持有的旧对象会在下次操作失败后走各自心跳（幂等）重建。
          // ★ 2026-10-20 全量审计 P1：打开通道前**快照**当时的 SSH 会话。原实现在 await
          //   之前与之后都现读 `c.sshSession`：若心跳恢复期间连接被切换/重连（换对象），
          //   收尾会用**新会话**去 closeForSSHSession 刚为**旧会话**开的通道 ⇒ 新会话的
          //   引用计数被误减、旧会话的计数永远为正 ⇒ 后续 openFromSSHSession 命中死缓存。
          const sshAtOpen = c.sshSession
          if (c.sftpSession) {
            c.sftpService.forceInvalidate(sshAtOpen)
            c.sftpSession = null
          }
          // ★ 2026-10-09：改走单飞闸门
          const fresh = await this._openSftpSingleFlight(sshAtOpen, (s: SSHSessionLike) => c.sftpService.openFromSSHSession(s))
          // 再次检查：openFromSSHSession 是异步的，期间可能组件已销毁
          if (this._heartbeatDisposed) {
            c.sftpService.closeForSSHSession(sshAtOpen, fresh)
            return
          }
          // 期间会话已被换掉 ⇒ 本次恢复的成果对新会话无意义，按旧会话释放，不安装
          if (c.sshSession !== sshAtOpen) {
            log.warn('[heartbeat] session replaced during recovery; dropping reopened channel')
            c.sftpService.closeForSSHSession(sshAtOpen, fresh)
            return
          }
          c.sftpSession = fresh
          // ★ 2026-10-09：通道被替换 → 心跳代际 +1（让在途的旧代探测回调作废，见 _heartbeatChannelGen）
          this._heartbeatChannelGen++
          // ★ 2026-09-26 P0：恢复成功必须**清零失败连击数**。原实现只在「探测成功」分支清零，
          //   而刚重建的会话若仍忙于在途传输，下一轮探测照样超时 → 连击数直接带着旧值达标 →
          //   再走一次 abortInFlightTransfers() + forceInvalidate()，形成「杀完再杀」的连击
          //   （2026-09-26 实测日志 4341 与 4345 相邻两行各杀一次）。
          this._heartbeatFailStreak = 0
          // ★ 2026-09-29 issue #25：记录本次恢复（退避倍率 + 日志限流），
          //   并把「连续恢复」计入退避——10 分钟没再恢复才复位。
          this._heartbeatRecoverStreak++
          this._heartbeatLastRecoverAt = Date.now()
          this._heartbeatRecoverLogCount++
          const n = this._heartbeatRecoverLogCount
          if (n <= PanelConnectionLifecycle.HEARTBEAT_RECOVER_LOG_VERBOSE
            || n % PanelConnectionLifecycle.HEARTBEAT_RECOVER_LOG_EVERY === 0) {
            log.info(`Heartbeat recovered with new SFTP session${n > 1 ? ` (total ${n})` : ''}`)
          } else {
            log.debug('Heartbeat recovered with new SFTP session (no. ' + n + ')')
          }
          c.zone.run(() => {
            // 再次检查：zone.run 是异步的，期间可能组件已销毁
            if (this._heartbeatDisposed) return
            // ★ 2026-09-29 issue #25：只有在途传输真的被这次恢复中断时才提示用户去重试；
            //   纯空闲通道的恢复对用户是透明的，不打扰。
            if (interrupted) {
              try {
                const msg = c.getI18n().t('notify.sftpRecovered')
                ;(c.notifications as any)?.success?.(msg, '')
              } catch { /* ignore */ }
            }
            void c.refreshRemote()
          })
        } catch (e) {
          log.error('Heartbeat recovery failed', e)
          this.handleSessionLost()
        } finally {
          this._heartbeatRecovering = false
        }
      }).finally(() => {
        this._heartbeatProbeInFlight = false
      })
    }, 10000)
  }

  async reconnect(): Promise<void> {
    const c = this.ctx
    if (c.reconnecting) return
    c.reconnecting = true
    c.setRemoteLoading(true)
    this.detectChanges()
    try {
      // ★ 2026-09-21 P1 修复：先释放旧 SFTP 会话（此刻 c.sshSession 仍是旧 session，能命中
      //   正确的缓存条目按引用计数释放）；若先换 sshSession 再 release，closeForSSHSession
      //   会拿新 session 去关缓存 → 旧会话的引用计数永远减不到 → 旧通道泄漏
      this.releaseSftp()
      if (c.terminalRef) {
        try {
          const termEl = (c.terminalRef as { element?: { nativeElement?: HTMLElement } }).element?.nativeElement
          if (termEl) {
            termEl.click()
            termEl.focus?.()
          }
          const reconnect = (c.terminalRef as { reconnect?: () => Promise<void> }).reconnect
            || (c.terminalRef as { _reconnect?: () => Promise<void> })._reconnect
          if (typeof reconnect === 'function') {
            await reconnect.call(c.terminalRef)
          }
          if (c.sshSession && typeof c.sshSession === 'object') {
            const sessReconnect = (c.sshSession as { reconnect?: () => Promise<void> }).reconnect
            if (typeof sessReconnect === 'function') {
              await sessReconnect.call(c.sshSession)
            }
          }
        } catch (e) {
          log.info('Terminal reconnect trigger failed, will retry', e)
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
        if (!this.isAlive()) return

        const fresh =
          (c.terminalRef as { sshSession?: SSHSessionLike }).sshSession
          || (c.terminalRef as { _sshSession?: SSHSessionLike })._sshSession
          || (c.terminalRef as { _session?: SSHSessionLike })._session
        if (fresh && fresh !== c.sshSession) {
          c.sshSession = fresh
        }
      }

      if (!c.sshSession) {
        c.connected = false
        this.releaseSftp()
        c.clearRemoteListing()
        try { c.notifications?.error?.(c.getI18n().t('notify.reconnectNoTerminal'), '') } catch { /* ignore */ }
        return
      }

      // ★ 2026-09-21：旧 SFTP 会话已在方法开头（更换 sshSession 之前）释放，此处无需重复 release
      const sshAtOpen = c.sshSession
      // ★ 2026-10-09：改走单飞闸门。与 connect 的区别是 reconnect 在此之前已换过
      //   sshSession（重连后是新对象）⇒ 闸门按对象分桶，本行落到新桶，
      //   不会被旧会话的在途请求挡住；而与用户「再点一次重连」造成的自身重入则命中同一桶。
      const acquired = await this._openSftpSingleFlight(sshAtOpen, (s: SSHSessionLike) => c.sftpService.openFromSSHSession(s))
      if (!this.isAlive() || c.sshSession !== sshAtOpen) {
        c.sftpService.closeForSSHSession(sshAtOpen, acquired)
        return
      }
      c.sftpSession = acquired
      // ★ 2026-10-09：通道被替换 → 心跳代际 +1（让在途的旧代探测回调作废，见 _heartbeatChannelGen）
      this._heartbeatChannelGen++
      c.connected = true
      await this.applyInitialRemotePath(true)
      const ok = await c.refreshRemote()
      await this._fallbackInitialRemotePathIfInvalid(ok)
      c.pushRemoteNav(c.remotePath)
      this.startHeartbeat()
    } catch (e) {
      log.error('Reconnect failed', e)
      c.connected = false
      this.releaseSftp()
      this.stopHeartbeat()
      c.clearRemoteListing()
      if (this.isAlive()) {
        try { c.notifications?.error?.(c.getI18n().t('notify.reconnectFailed'), '') } catch { /* ignore */ }
      }
    } finally {
      c.reconnecting = false
      c.setRemoteLoading(false)
      this.detectChanges()
    }
  }

  /**
   * ★ 2026-10-23（Deepseek-V4.1-Flash）：connect / reconnect 后首次刷新失败的处理。
   *
   * 为什么不能一律回退 '/'（用户实测「重新连接后丢失面板上次的访问路径」）：
   *   SSH 断线时 Tabby 会销毁旧会话再重建，这期间 `openFromSSHSession` 可能拿到一条
   *   **立即关闭**的通道（日志实证：`Session destroyed` → `Panel opened` → `silently reopened`
   *   → `Remote listing failed UnexpectedBehavior("session closed")`）。此时「记忆路径读不出来」
   *   并不是路径有问题，而是通道还没活过来。原来的实现在这里把 remotePath 改成 '/'
   *   ⇒ ① 用户看到根目录（像丢了路径）；② 之后任一次 `saveCurrentPath()` 都会把 '/'
   *   落进路径记忆 ⇒ **记忆被兜底值永久污染**。
   *
   * 现在的判据：只有「目录真的不可用」（非通道死）才回退；通道死则保留记忆路径，
   *   等心跳自愈/用户重连后的刷新自然落到原目录。
   */
  private async _fallbackInitialRemotePathIfInvalid(ok: boolean): Promise<void> {
    const c = this.ctx
    if (ok || c.remotePath === '/') return
    if (c.lastRemoteListErrorWasDead?.()) {
      log.info('[SFTP+] keep remembered remote path (channel dead, retry after recovery):', c.remotePath)
      return
    }
    log.warn('Initial remote path invalid, falling back to /')
    c.remotePath = '/'
    c.remotePathInput = '/'
    await c.refreshRemote()
  }

  /**
   * 远程初始路径：终端同步 > 路径记忆 > 默认
   * （方案 A：三选一互斥）
   *
   * @param preserveCurrent ★ 2026-10-23（Deepseek-V4.1-Flash）：**重连**传 true。
   *   重连不是「重新打开面板」——断开前停的目录就是用户要回的位置，此时不该先写默认值
   *   再靠 pathMode 恢复（off / sync 模式下根本没有「恢复」这一步 ⇒ 一重连就跳走，
   *   正是用户反馈的「重新连接后丢失上次访问路径」）。当前值合法（POSIX 绝对路径且非 '/'）
   *   就直接沿用，任何模式都一样。
   */
  private async applyInitialRemotePath(preserveCurrent = false): Promise<void> {
    const c = this.ctx
    if (preserveCurrent) {
      const cur = typeof c.remotePath === 'string' ? c.remotePath : ''
      if (cur.startsWith('/') && cur !== '/') {
        c.remotePathInput = cur
        return
      }
    }
    c.remotePath = c.getDefaultRemotePath()
    c.remotePathInput = c.remotePath

    if (c.pathMode === 'sync') {
      const cwd = await c.tryGetTerminalCwd()
      if (cwd) {
        c.remotePath = cwd
        c.remotePathInput = cwd
        return
      }
      return
    }

    if (c.pathMode === 'remember') {
      c.restoreSavedRemotePath()
    }
  }
}

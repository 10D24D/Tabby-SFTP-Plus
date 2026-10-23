/**
 * 功能描述：SFTP+ path-utils 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Step-5-Preview
 * 修改时间：2026-10-13 — P1 修复：新增 safeRemoteEntryName——**纯远端操作**（远程→远程复制）
 *              的条目名净化。原先用 safeEntryName（套用 Windows 落地规则：保留名/尾随点空格/
 *              含 \），导致 `CON`、`file `、`a\b` 等 Linux 合法名在 Windows 客户端上被
 *              **静默跳过**（复制完文件少几个、无提示，且行为随客户端平台变化）。
 *              win32 规则只应在生成本地路径时叠加，远端场景只拒绝对远端真正危险的成分
 *              （空/'.'/'..'/控制字符/含 '/'）。
 *              2026-09-21 — 第六轮审计 P2 修复：safeEntryName 删除 includes('..') 误杀（a..b 等合法名曾被静默跳过）
 *              2026-09-20 — N3 审计修复：safeEntryName 拦截控制字符（含换行），防恶意服务器下发带换行文件名
 * 合并来源：panel-id-resolver
 */

import * as fs from 'fs'

import * as path from 'path'

import { exec } from 'child_process'

import { promisify } from 'util'

import { log } from '../../services/sftp-logger'

/**
 * uid/gid → 用户名/组名 解析（本地 /etc 与远程 getent）
 */

const execAsync = promisify(exec)

export type IdMaps = {
  uidToName: Map<number, string>
  gidToName: Map<number, string>
}

export function parsePasswd(content: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const line of content.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split(':')
    if (parts.length < 2) continue
    // awk 精简格式 name:uid；完整 passwd 为 name:x:uid:...
    const uid = parts.length >= 3 ? parseInt(parts[2], 10) : parseInt(parts[1], 10)
    const name = parts[0]?.trim()
    if (!Number.isNaN(uid) && name) map.set(uid, name)
  }
  return map
}

export function parseGroup(content: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const line of content.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const parts = line.split(':')
    if (parts.length < 2) continue
    const gid = parts.length >= 3 ? parseInt(parts[2], 10) : parseInt(parts[1], 10)
    const name = parts[0]?.trim()
    if (!Number.isNaN(gid) && name) map.set(gid, name)
  }
  return map
}

export function loadLocalIdMaps(): IdMaps {
  const uidToName = new Map<number, string>()
  const gidToName = new Map<number, string>()
  if (process.platform === 'win32') {
    return { uidToName, gidToName }
  }
  try {
    for (const [k, v] of parsePasswd(fs.readFileSync('/etc/passwd', 'utf8'))) uidToName.set(k, v)
  } catch { /* 非 POSIX 或权限不足 */ }
  try {
    for (const [k, v] of parseGroup(fs.readFileSync('/etc/group', 'utf8'))) gidToName.set(k, v)
  } catch { /* ignore */ }
  return { uidToName, gidToName }
}

/** Windows：后台通过 WMI 将 RID 映射到本地账户/组名（避免阻塞首屏） */
export async function loadWindowsIdMapsAsync(): Promise<IdMaps> {
  const uidToName = new Map<number, string>()
  const gidToName = new Map<number, string>()
  try {
    const [userResult, groupResult] = await Promise.all([
      execAsync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_UserAccount -Filter \'LocalAccount=True\' | ForEach-Object { $_.Name + \':\' + $_.SID }"',
        { encoding: 'utf8', timeout: 8000 },
      ),
      execAsync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_Group | ForEach-Object { $_.Name + \':\' + $_.SID }"',
        { encoding: 'utf8', timeout: 8000 },
      ),
    ])
    for (const line of userResult.stdout.split('\n')) {
      const m = line.trim().match(/^([^:]+):S-1-5-21(?:-\d+){3}-(\d+)$/i)
      if (m) uidToName.set(parseInt(m[2], 10), m[1])
    }
    for (const line of groupResult.stdout.split('\n')) {
      const m = line.trim().match(/^([^:]+):S-1-5-21(?:-\d+){3}-(\d+)$/i)
      if (m) gidToName.set(parseInt(m[2], 10), m[1])
    }
  } catch { /* PowerShell 不可用或权限不足 */ }
  return { uidToName, gidToName }
}

function isNumericIdStr(v: unknown): v is string {
  return typeof v === 'string' && /^\d+$/.test(v.trim())
}

export function resolveOwnerDisplay(
  maps: IdMaps,
  name?: string,
  uid?: number,
): string | undefined {
  const numericName = name != null && isNumericIdStr(String(name)) ? parseInt(String(name).trim(), 10) : undefined
  const id = uid ?? numericName
  if (name && !isNumericIdStr(String(name))) return String(name).trim()
  if (id != null) {
    const resolved = maps.uidToName.get(id)
    if (resolved) return resolved
    return String(id)
  }
  return name != null ? String(name) : undefined
}

export function resolveGroupDisplay(
  maps: IdMaps,
  name?: string,
  gid?: number,
): string | undefined {
  const numericName = name != null && isNumericIdStr(String(name)) ? parseInt(String(name).trim(), 10) : undefined
  const id = gid ?? numericName
  if (name && !isNumericIdStr(String(name))) return String(name).trim()
  if (id != null) {
    const resolved = maps.gidToName.get(id)
    if (resolved) return resolved
    return String(id)
  }
  return name != null ? String(name) : undefined
}

/** 通过 Tabby SSH 会话执行单次命令并收集 stdout；timeoutMs 缺省 12s，
 *  长耗时命令（如 rm -rf 巨型目录）可调大。
 *  ★ 2026-09-14 F2 审计修复：空输出整体重试一次（为修 tar 标记漏检）只对
 *    「幂等/只读」命令安全——cp -a / mv 等非幂等命令若首次已成功而标记输出
 *    丢失（通道竞争），重放会把源再复制/移动进已存在的目标 → 嵌套副本。
 *    故新增 retryOnEmpty 选项：默认 true（探测类命令保持旧行为），
 *    非幂等命令的调用方必须显式传 false——宁误报失败回退，不毁数据。
 *  ★ 2026-09-20 P1-13 审计修复：默认值改为 false（安全优先），
 *    只对确认幂等的探测类调用方显式传 true，避免未来新增非幂等调用时踩坑。 */
export async function execSshCommand(
  sshSession: unknown,
  command: string,
  timeoutMs = 12000,
  opts?: { retryOnEmpty?: boolean; onTimeout?: 'resolve' | 'reject' },
): Promise<string> {
  const typed = sshSession as { ssh?: {
    openSessionChannel?: () => Promise<unknown>
    activateChannel?: (ch: unknown) => Promise<{
      requestExec: (cmd: string) => Promise<void>
      data$: { subscribe: (o: { next?: (d: Uint8Array) => void; error?: (e: unknown) => void }) => { unsubscribe: () => void } }
      closed$: { subscribe: (fn: () => void) => { unsubscribe: () => void } }
      close: () => Promise<void>
    }>
  } }
  const ssh = typed?.ssh
  if (!ssh?.openSessionChannel || !ssh.activateChannel) {
    // ★ 2026-09-18 issue #15 诊断修复：记录 SSH session 结构，帮助排查 exec 通道不可用问题
    const hasSsh = !!typed?.ssh
    const hasOpen = !!typed?.ssh?.openSessionChannel
    const hasActivate = !!typed?.ssh?.activateChannel
    log.warn('[execSshCommand] SSH exec unavailable: hasSsh=', hasSsh, 'hasOpen=', hasOpen, 'hasActivate=', hasActivate)
    return ''
  }

  // ★ 2026-08-11 修复：exec 通道在 SFTP 大流量传输刚结束后偶尔拿不到任何输出
  //   （通道开关太快/通道复用竞争），导致 tar 通道 OK 标记漏检——实际解包成功却误报失败。
  //   空输出对带标记命令属异常信号：整体重试一次（重新开通道）再定性
  const execOnce = async (): Promise<string> => {
    let channel: Awaited<ReturnType<NonNullable<typeof ssh.activateChannel>>> | null = null
    try {
      const newCh = await ssh.openSessionChannel()
      channel = await ssh.activateChannel(newCh)
      await channel.requestExec(command)

      const chunks: Uint8Array[] = []
      let channelClosed = false
      await new Promise<void>((resolve, reject) => {
        // ★ 2026-08-10 修复 #25：超时定时器保存句柄并在结束时统一清理，
        //   data$ / closed$ 订阅在所有结束路径（正常关闭/出错/超时）都 unsubscribe
        let settled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        let dataSub: { unsubscribe: () => void } | null = null
        let closedSub: { unsubscribe: () => void } | null = null
        const done = (err?: unknown) => {
          if (settled) return
          settled = true
          if (timer != null) clearTimeout(timer)
          try { dataSub?.unsubscribe() } catch { /* ignore */ }
          try { closedSub?.unsubscribe() } catch { /* ignore */ }
          if (err !== undefined) reject(err)
          else resolve()
        }
        dataSub = channel!.data$.subscribe({
          next: d => chunks.push(d),
          error: err => done(err),
        })
        closedSub = channel!.closed$.subscribe(() => {
          channelClosed = true
          done()
        })
        timer = setTimeout(() => {
          if (!channelClosed) {
            try { void channel?.close() } catch { /* ignore */ }
          }
          // ★ 2026-10-13 P2 修复：超时原先一律 `done()` —— 即**按成功 resolve**，调用方
          //   拿到的是"命令跑完了但没输出"，与"命令真的失败且无输出"完全无法区分。
          //   对 rm -rf 这类大目录操作尤其致命：60s 超时后服务端那条命令很可能**还在跑**
          //   （甚至马上就跑完），调用方却把它当成"失败"去触发 SFTP 逐文件递归重删，
          //   两条删除并发跑在同一个目录上，报出一堆莫名的 ENOENT。
          //   现在由调用方按需选 'reject'（抛可辨识的超时错误），默认仍是 'resolve'
          //   以保住既有调用点的行为。
          if (opts?.onTimeout === 'reject') {
            done(new Error(`execSshCommand timed out after ${timeoutMs}ms: ${command.slice(0, 120)}`))
          } else {
            done()
          }
        }, timeoutMs)
      })

      return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8')
    } catch {
      return ''
    } finally {
      try { await channel?.close() } catch { /* ignore */ }
    }
  }

  const first = await execOnce()
  if (first !== '') return first
  // ★ 2026-09-20 P1-13 审计修复：默认不重试（安全优先）。
  //   仅当调用方显式传入 retryOnEmpty=true 时才重试（确认幂等的探测类命令）。
  //   非幂等命令（cp/mv/rm）不传 opts 即走安全路径，宁误报失败不毁数据。
  if (opts?.retryOnEmpty !== true) {
    if (opts?.retryOnEmpty === false) {
      log.warn(`execSshCommand empty output (retry explicitly disabled): ${command.slice(0, 80)}`)
    }
    return first
  }
  await new Promise(r => setTimeout(r, 300))
  const second = await execOnce()
  if (second === '') log.warn(`execSshCommand empty output (retried): ${command.slice(0, 80)}`)
  return second
}

export async function loadRemoteIdMaps(sshSession: unknown): Promise<IdMaps> {
  // 顺序执行，避免同时开两个 SSH exec 通道导致 passwd 输出丢失
  // ★ 2026-09-20 P1-13：幂等探测命令显式启用重试
  const passwdOut = await execSshCommand(
    sshSession,
    "getent passwd 2>/dev/null | awk -F: '{print $1\":\"$3}' || awk -F: '{print $1\":\"$3}' /etc/passwd 2>/dev/null",
    12000,
    { retryOnEmpty: true },
  )
  const groupOut = await execSshCommand(
    sshSession,
    "getent group 2>/dev/null | awk -F: '{print $1\":\"$3}' || awk -F: '{print $1\":\"$3}' /etc/group 2>/dev/null",
    12000,
    { retryOnEmpty: true },
  )
  return {
    uidToName: parsePasswd(passwdOut),
    gidToName: parseGroup(groupOut),
  }
}

export class IdNameResolver {
  private maps: IdMaps = { uidToName: new Map(), gidToName: new Map() }
  private loading: Promise<void> | null = null
  private localLoaded = false
  private localLoading: Promise<void> | null = null
  private execDisabled = false
  private execFailCount = 0

  get loaded(): boolean {
    return this.maps.uidToName.size > 0 || this.maps.gidToName.size > 0
  }

  get uidMapReady(): boolean {
    return this.maps.uidToName.size > 0
  }

  get remoteExecDisabled(): boolean {
    return this.execDisabled
  }

  mergeMaps(maps: IdMaps): void {
    for (const [k, v] of maps.uidToName) this.maps.uidToName.set(k, v)
    for (const [k, v] of maps.gidToName) this.maps.gidToName.set(k, v)
  }

  setMaps(maps: IdMaps): void {
    this.maps = maps
  }

  loadLocal(): void {
    if (this.localLoaded) return
    this.maps = loadLocalIdMaps()
    this.localLoaded = true
  }

  /** 本地 uid 映射（Windows 异步，不阻塞列表首屏） */
  ensureLocalMaps(): Promise<void> {
    if (this.localLoaded) return Promise.resolve()
    if (this.localLoading) return this.localLoading
    if (process.platform !== 'win32') {
      this.loadLocal()
      return Promise.resolve()
    }
    this.localLoading = loadWindowsIdMapsAsync().then(maps => {
      // ★ 2026-08-10 修复 #25：本地映射异步到达时可能已有远程映射（mergeMaps），
      //   整体覆盖 this.maps 会丢失远程 uid/gid 映射 → 改为并入现有 maps
      this.mergeMaps(maps)
      this.localLoaded = true
    }).finally(() => {
      this.localLoading = null
    })
    return this.localLoading
  }

  loadRemote(sshSession: unknown): Promise<void> {
    if (this.execDisabled) return Promise.resolve()
    if (this.loading) return this.loading
    this.loading = loadRemoteIdMaps(sshSession).then(maps => {
      this.mergeMaps(maps)
      if (!this.uidMapReady) {
        this.execFailCount++
        if (this.execFailCount >= 3) this.execDisabled = true
      } else {
        this.execFailCount = 0
      }
    }).finally(() => {
      this.loading = null
    })
    return this.loading
  }

  /** passwd 映射缺失时重试；失败一次后不再阻塞后续刷新 */
  ensureUidMap(sshSession: unknown): Promise<void> {
    if (this.uidMapReady || this.execDisabled) return Promise.resolve()
    return this.loadRemote(sshSession)
  }

  reset(): void {
    this.maps = { uidToName: new Map(), gidToName: new Map() }
    this.loading = null
    this.localLoaded = false
    this.localLoading = null
    this.execDisabled = false
    this.execFailCount = 0
  }

  ownerName(name?: string, uid?: number): string | undefined {
    return resolveOwnerDisplay(this.maps, name, uid)
  }

  groupName(name?: string, gid?: number): string | undefined {
    return resolveGroupDisplay(this.maps, name, gid)
  }
}

/**
 * 从服务器返回的文件名中提取安全的基名，防止路径穿越。
 * 恶意服务器可能返回 "../../.bashrc" 之类文件名，直接用 path.join(dest, name)
 * 会把文件写到 dest 之外。本函数剥离所有目录组件与 '..' 段，仅保留最后一级
 * 安全基名；若名称无法安全使用（空、'.'、'..'、仍含分隔符/'..'）返回 null，调用方应跳过。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-25
 */
/** Windows 设备保留名（CON/NUL/COM1 等），创建会失败或产生怪异行为 */
const WIN_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i

export function safeEntryName(name: string): string | null {
  if (typeof name !== 'string' || name.length === 0) return null
  // ★ 2026-10-12 P2 修复（根因）：改用 **path.posix.basename**，不再用 path.basename。
  //
  //   原用 path.basename —— 在 Windows 上它是 win32 语义，把 `\` 也当分隔符。
  //   而本函数的入参绝大多数是**远端（Linux）目录项名**，在 Linux 上 `\` 是合法
  //   文件名字符（实测：`a\b.txt`、`with\slash` 都是合法文件名）。
  //   win32.basename('a\\b.txt') 返回 `b.txt` —— 名字被**悄悄改写**（而非被拦截）：
  //     · 下载时按 `b.txt` 落地，用户发现文件名变了；
  //     · 某些调用点拿改写后的 basename 反查远端条目 ⇒ 找不到 ⇒ **静默跳过**（文件消失）；
  //     · 远端路径含 `\` 时反查同样失败。
  //   实测（path.win32）：`a\b.txt`→`b.txt`、`C:\notes.txt`→`notes.txt`、`with\slash`→`slash`。
  //
  //   根治：远端名字一律按 **POSIX** 语义取 basename（只认 `/`），
  //   这样 `\` 会被当作普通字符保留；随后由下面的控制字符 / 保留名检查
  //   决定它在**本地 Windows** 上是否可安全创建（不可创建则明确拒绝，而不是悄悄改名）。
  const base = path.posix.basename(name)
  if (base === '' || base === '.' || base === '..') return null
  // ★ 2026-09-20 N3 审计修复：拦截控制字符（含换行 \n / \r 与所有 C0/C1 控制符），
  //   恶意服务器下发带换行文件名时本地不应创建带真实换行的怪异文件（Linux 合法、Windows 抛错）。
  //   注：\0 已被 \x00 覆盖。
  // ★ 2026-09-21 P2 修复：删除 base.includes('..') 误杀——basename 之后已无路径语义，
  //   `..` 单独成段不可能出现（上一行已拦 base === '..'），含双点的合法文件名
  //   （如 a..b、report..txt、..foo）此前被静默跳过（下载/上传该文件直接消失）
  if (/[\x00-\x1f\x7f]/.test(base)) return null
  // 防御性兜底：posix.basename 之后不应再有 /；若调用方传的是 Windows 侧名字
  //   且含 \，也一并拦掉（宁可拒绝也不要制造穿越路径）
  if (base.includes('/') || base.includes('\\')) return null
  // ★ 2026-08-26：拦截 Windows 保留设备名与尾随点/空格
  if (process.platform === 'win32') {
    if (WIN_RESERVED_NAME.test(base)) return null
    if (/[. ]$/.test(base)) return null
  }
  return base
}

/**
 * ★ 2026-10-13 P1 修复：**远端条目名**安全判定（远程→远程操作用）。
 *
 * 与 safeEntryName 的分工（刻意分开，避免纯远端操作误杀合法名）：
 *   · safeEntryName      —— 「名字能否安全使用」，套用 **Windows 落地规则**（保留名 /
 *                          尾随点空格 / 含 \），不可用返回 null，调用方跳过该条目；
 *   · safeRemoteEntryName —— 纯远端场景（远程→远程复制等）只拒绝真正危险的成分：
 *                          空 / '.' / '..' / 控制字符 / 含 '/'。**不套用 Windows 规则**。
 *
 * 为什么需要：远程→远程复制目录时原先也用 safeEntryName，于是名为 `CON`、`aux`、
 * `file `（尾随空格）、`a\b` 的远端条目在 **Windows 客户端**上被静默跳过——这些名字在
 * Linux 上完全合法，复制完成后文件「少了几个」且无任何提示，且行为随客户端平台变化。
 * win32 规则只应在「生成本地路径」时叠加（本地落地场景），纯远端操作不适用。
 */
export function safeRemoteEntryName(name: string): string | null {
  if (typeof name !== 'string' || name.length === 0) return null
  const base = path.posix.basename(name)
  if (base === '' || base === '.' || base === '..') return null
  // 控制字符（含 \0 / 换行）在任何文件系统上都不应出现
  if (/[\x00-\x1f\x7f]/.test(base)) return null
  // basename 之后不应再有 /；防御性兜底
  if (base.includes('/')) return null
  return base
}

/**
 * ★ 2026-10-12 新增：把**远端名字**转成可在本地 Windows 安全落地的名字。
 *
 * 与 safeEntryName 的分工（刻意分开，避免破坏既有拒绝语义）：
 *   · safeEntryName —— 「这个名字是否安全可用」，不安全返回 null，调用方**跳过**该条目；
 *   · localEntryName —— 「怎么把远端名字落到本地」，**永不返回 null**，
 *     不可直接落地时做**可逆度更高的转写**（而不是丢弃）。
 *
 * 为什么需要：Linux 上 `\`、`:`、`*`、`?`、`"`、`<`、`>`、`|` 都是合法文件名字符，
 *   但 Windows 一律不允许。原先这些名字走 safeEntryName 被拦 ⇒ 下载时**文件直接消失**
 *   （用户看到「传了 100 个、本地只有 97 个」却没有任何提示）。
 *
 * 策略：把 Windows 保留字符替换为**全角对应字符**（`\`→`＼` 等）。
 *   选全角而不是下划线/URL 编码的原因：
 *     · 全角字符在 Windows 文件名合法，且**视觉上可辨认**（用户看得出原字符是什么）；
 *     · 不会与「本来就叫 a_b.txt 的文件」撞名；
 *     · 不引入 `%XX` 这类对用户不友好的形态。
 *   尾随点/空格与保留设备名（CON/PRN/AUX/NUL/COM1..）同样按全角转写。
 *   ⚠ 不保证与原名可程序化还原（用户可能重命名），但视觉可读性优先。
 */
export function localEntryName(name: string): string {
  const base = path.posix.basename(String(name ?? ''))
  // Windows 文件名非法字符 → 全角对应（U+FF3C 等）
  const WIN_ILLEGAL: Record<string, string> = {
    '<': '＜', '>': '＞', ':': '：', '"': '＂',
    '\\': '＼', '/': '／', '|': '｜', '?': '？', '*': '＊',
  }
  let out = ''
  for (const ch of base) {
    out += WIN_ILLEGAL[ch] ?? ch
  }
  // 控制字符一律剔除（本地不可能创建，也没有可读的全角对应）
  out = out.replace(/[\x00-\x1f\x7f]/g, '')
  // 尾随点/空格：Windows 会静默去掉，补一个全角句点避免改名歧义
  out = out.replace(/[. ]+$/, (m) => '．'.repeat(m.length))
  if (out === '') out = 'unnamed'
  // Windows 保留设备名（CON/PRN/AUX/NUL/COM1..9/LPT1..9，不分扩展名）：
  //   直接创建会失败或落到设备上。前缀加全角下划线既保持可读又确保不冲突。
  const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i
  if (RESERVED.test(out)) out = '＿' + out
  return out
}

/**
 * 断言 join(parent, name) 仍落在 parent 之下（防 ../ 穿越）。
 * 返回净化后的绝对/规范化子路径；非法时返回 null。
 */
export function safeJoinUnder(parent: string, name: string, posix = false): string | null {
  const safe = safeEntryName(name)
  if (!safe) return null
  const joinFn = posix ? path.posix.join : path.join
  const resolveFn = posix ? path.posix.resolve : path.resolve
  const normParent = resolveFn(parent)
  const child = resolveFn(joinFn(parent, safe))
  const sep = posix ? '/' : path.sep
  const prefix = normParent.endsWith(sep) ? normParent : normParent + sep
  if (child !== normParent && !child.startsWith(prefix)) return null
  return child
}


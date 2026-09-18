/**
 * 功能描述：SFTP+ path-utils 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — 新增 safeEntryName 防路径穿越
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
 *    非幂等命令的调用方必须显式传 false——宁误报失败回退，不毁数据。 */
export async function execSshCommand(
  sshSession: unknown,
  command: string,
  timeoutMs = 12000,
  opts?: { retryOnEmpty?: boolean },
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
          done()
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
  // 空输出重试：稍候重开通道再执行一次（仅幂等/只读命令可安全重放）
  if (opts?.retryOnEmpty === false) {
    log.warn(`execSshCommand empty output (retry disabled for non-idempotent command): ${command.slice(0, 80)}`)
    return first
  }
  await new Promise(r => setTimeout(r, 300))
  const second = await execOnce()
  if (second === '') log.warn(`execSshCommand empty output (retried): ${command.slice(0, 80)}`)
  return second
}

export async function loadRemoteIdMaps(sshSession: unknown): Promise<IdMaps> {
  // 顺序执行，避免同时开两个 SSH exec 通道导致 passwd 输出丢失
  const passwdOut = await execSshCommand(
    sshSession,
    "getent passwd 2>/dev/null | awk -F: '{print $1\":\"$3}' || awk -F: '{print $1\":\"$3}' /etc/passwd 2>/dev/null",
  )
  const groupOut = await execSshCommand(
    sshSession,
    "getent group 2>/dev/null | awk -F: '{print $1\":\"$3}' || awk -F: '{print $1\":\"$3}' /etc/group 2>/dev/null",
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
  const base = path.basename(name) // path.basename 同时处理 / 与 \ 分隔符
  if (base === '' || base === '.' || base === '..') return null
  if (base.includes('..') || base.includes('/') || base.includes('\\') || base.includes('\0')) return null
  // ★ 2026-08-26：拦截 Windows 保留设备名与尾随点/空格
  if (process.platform === 'win32') {
    if (WIN_RESERVED_NAME.test(base)) return null
    if (/[. ]$/.test(base)) return null
  }
  return base
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


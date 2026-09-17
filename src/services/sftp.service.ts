/**
 * SFTP 连接服务
 * 功能描述：封装 Tabby SSH Session 的 SFTP 连接，提供统一的文件操作接口
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 */
import { Injectable } from '@angular/core'
import * as posix from 'path'

import { log } from './sftp-logger'
/** 远程列表元数据补全选项（按可见列跳过不必要 I/O） */
export type SftpEnrichOptions = {
  atime?: boolean
  ownerGroup?: boolean
  statFallback?: boolean
}

const DEFAULT_ENRICH: Readonly<SftpEnrichOptions> = Object.freeze({
  atime: true,
  ownerGroup: true,
  statFallback: true,
})

type RawSftpMetadata = {
  type?: unknown
  permissions?: number
  size?: number
  mtime?: number
  atime?: number
  user?: string
  group?: string
  uid?: number
  gid?: number
}

type RawSftpDirEntry = {
  name: string
  type?: unknown
  metadata?: unknown
  longname?: string
  long_name?: string
}

type RusshSftpClient = {
  readDirectory?: (p: string) => Promise<RawSftpDirEntry[]>
  stat?: (p: string) => Promise<unknown>
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && !Number.isNaN(v) && Number.isFinite(v)) return v
  if (typeof v === 'bigint') {
    if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(-Number.MAX_SAFE_INTEGER)) {
      log.warn('asNumber: BigInt exceeds safe integer range, precision may be lost:', v.toString())
    }
    return Number(v)
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (!Number.isNaN(n) && Number.isFinite(n)) return n
  }
  return undefined
}

/** 兼容 russh 普通对象 metadata 与 native 类（metadata.type()） */
function extractRawFields(entry: RawSftpDirEntry): Record<string, unknown> {
  let meta = entry.metadata as Record<string, unknown> | undefined
  if (typeof meta === 'function') {
    try { meta = (meta as () => Record<string, unknown>)() } catch (e) { meta = undefined; log.warn('metadata() call failed:', (e as Error)?.message) }
  }
  if (meta && typeof (meta as { type?: () => unknown }).type === 'function') {
    const m = meta as {
      type: () => unknown
      permissions?: number
      size?: unknown
      mtime?: number
      atime?: number
      user?: string
      group?: string
      uid?: number
      gid?: number
    }
    return {
      type: m.type(),
      permissions: m.permissions,
      size: m.size,
      mtime: m.mtime,
      atime: m.atime,
      user: m.user,
      group: m.group,
      uid: m.uid,
      gid: m.gid,
    }
  }
  // Only spread known metadata fields; exclude entry-specific fields that are not metadata
  const { name: _name, longname: _ln, long_name: _ln2, metadata: _md, ...entryRest } = entry as Record<string, unknown> & { name?: unknown; longname?: unknown; long_name?: unknown; metadata?: unknown }
  const base = { ...(meta ?? {}), ...entryRest }
  if (entry.type != null && base.type == null) base.type = entry.type
  return base
}

function normalizeRawMeta(entry: RawSftpDirEntry): RawSftpMetadata {
  const raw = extractRawFields(entry)
  const groupVal = raw.group
  const permissions = asNumber(raw.permissions ?? raw.mode)
  return {
    type: raw.type ?? raw.file_type ?? raw.fileType,
    permissions,
    size: asNumber(raw.size),
    mtime: asNumber(raw.mtime),
    atime: asNumber(raw.atime ?? raw.access_time ?? raw.accessTime),
    user: typeof raw.user === 'string' && !isNumericIdStr(raw.user) ? raw.user
      : (typeof raw.username === 'string' && !isNumericIdStr(raw.username) ? raw.username : undefined),
    group: typeof groupVal === 'string' && !isNumericIdStr(groupVal) ? groupVal
      : (typeof raw.groupname === 'string' && !isNumericIdStr(raw.groupname) ? raw.groupname : undefined),
    uid: uidFromRaw(raw),
    gid: gidFromRaw(raw),
  }
}

function uidFromRaw(raw: Record<string, unknown>): number | undefined {
  const fromUid = asNumber(raw.uid)
  if (fromUid != null) return fromUid
  if (isNumericIdStr(raw.user as string)) return parseInt(String(raw.user).trim(), 10)
  if (typeof raw.owner === 'number') return raw.owner
  if (isNumericIdStr(raw.owner as string)) return parseInt(String(raw.owner).trim(), 10)
  return undefined
}

function gidFromRaw(raw: Record<string, unknown>): number | undefined {
  const fromGid = asNumber(raw.gid)
  if (fromGid != null) return fromGid
  if (isNumericIdStr(raw.group as string)) return parseInt(String(raw.group).trim(), 10)
  return undefined
}

function isNumericIdStr(v: unknown): v is string {
  return typeof v === 'string' && /^\d+$/.test(v.trim())
}

/** ls -l longname 解析：drwxr-xr-x  3 owner group  4096 Jan 1 2024 dirname */
const _LONGNAME_RE = /^[dlbcps\-]\S+\s+\d+\s+(\S+)\s+(\S+)\s+/
/** 备用宽松正则：兼容 Windows OpenSSH 等非标准格式（跳过 link count 列可能缺失的情况） */
const _LONGNAME_FALLBACK_RE = /^[dlbcps\-]\S+\s+(?:\d+\s+)?(\S+)\s+(\S+)\s+/

function ownerNameFromMeta(meta: RawSftpMetadata, longname?: string): string | undefined {
  if (meta.user && !isNumericIdStr(meta.user)) return meta.user
  if (!longname) return undefined
  const m = longname.match(_LONGNAME_RE) ?? longname.match(_LONGNAME_FALLBACK_RE)
  const name = m?.[1]
  return name && !isNumericIdStr(name) ? name : undefined
}

function groupNameFromMeta(meta: RawSftpMetadata, longname?: string): string | undefined {
  if (meta.group && !isNumericIdStr(meta.group)) return meta.group
  if (!longname) return undefined
  const m = longname.match(_LONGNAME_RE) ?? longname.match(_LONGNAME_FALLBACK_RE)
  const name = m?.[2]
  return name && !isNumericIdStr(name) ? name : undefined
}

const russhClientBySession = new WeakMap<SFTPSessionLike, RusshSftpClient>()

export function registerRusshClient(session: SFTPSessionLike): void {
  const russh = (session as { sftp?: RusshSftpClient }).sftp
  if (russh) russhClientBySession.set(session, russh)
}

export function getRusshSftp(session: SFTPSessionLike): RusshSftpClient | undefined {
  return russhClientBySession.get(session) ?? (session as { sftp?: RusshSftpClient }).sftp
}

/**
 * 功能描述：对远程路径做 stat（解析符号链接目标类型）。
 *   根因（2026-08-24）：russh 的 stat 走 SSH_FXP_STAT（协议上跟随符号链接），但其 JS 层
 *   用 {...md} 展开 napi 对象会丢失 permissions 等字段（官方源码注释 "Can't just spread
 *   a napi object"），返回结果中只有 type（数字枚举：0=目录 1=文件 2=符号链接）和 size 可靠。
 *   旧实现只认 meta.type === 'directory'（字符串，永远不匹配）和 permissions 位（已丢失）
 *   → 符号链接永远被判为「非目录」→ 被当文件打开。
 *   解析顺序：
 *   1) 优先用 Tabby SFTPSession 包装层的 stat()（内部已把 type 数字枚举正确映射为
 *      isDirectory/isSymlink，见 tabby-ssh SFTPSession.stat）；
 *   2) 回退到 russh 原生 stat：按 type 数字枚举 + permissions 位双重判断；
 * 创建人：DD1024z + Claude
 * 创建时间：2026-08-24
 */
export async function statRemotePath(
  session: SFTPSessionLike,
  fullPath: string,
): Promise<{ isDirectory: boolean; isSymlink?: boolean; mode?: number; size?: number; mtime?: Date } | null> {
  // 1) Tabby SFTPSession 包装层 stat（运行时存在，类型声明未列出）
  const wrapperStat = (session as {
    stat?: (p: string) => Promise<{ isDirectory: boolean; isSymlink?: boolean; mode?: number; size?: number; modified?: Date }>
  }).stat
  if (typeof wrapperStat === 'function') {
    try {
      const st = await wrapperStat.call(session, fullPath)
      if (st) {
        return { isDirectory: !!st.isDirectory, isSymlink: !!st.isSymlink, mode: st.mode, size: st.size, mtime: st.modified }
      }
    } catch (e) {
      log.warn('statRemotePath (wrapper stat) failed:', (e as Error).message)
    }
  }
  // 2) russh 原生 stat 回退
  const inner = getRusshSftp(session)
  if (!inner?.stat) return null
  try {
    const raw = await inner.stat(fullPath)
    if (!raw) return null
    if (typeof (raw as { isDirectory?: unknown }).isDirectory === 'function') {
      const mode = asNumber((raw as { mode?: unknown }).mode)
      const size = asNumber((raw as { size?: unknown }).size)
      const mtimeVal = asNumber((raw as { mtime?: unknown }).mtime)
      const mtime = (raw as { mtime?: unknown }).mtime instanceof Date ? (raw as { mtime?: Date }).mtime
        : mtimeVal ? new Date(mtimeVal * 1000) : undefined
      return { isDirectory: (raw as { isDirectory: () => boolean }).isDirectory(), mode, size, mtime }
    }
    const rawType = asNumber((raw as { type?: unknown }).type)
    const meta = normalizeRawMeta({ name: '', metadata: raw })
    const permissions = meta.permissions ?? 0
    return {
      // russh type 数字枚举：0=Directory 2=Symlink；permissions 含类型位时按位兜底
      isDirectory: rawType === 0
        || meta.type === 'directory'
        || (permissions !== 0 && (permissions & 0o170000) === 0o040000),
      isSymlink: rawType === 2
        || meta.type === 'symlink'
        || (permissions !== 0 && (permissions & 0o170000) === 0o120000),
      mode: permissions || undefined,
      size: meta.size,
      mtime: meta.mtime && meta.mtime > 0 ? new Date(meta.mtime * 1000) : undefined,
    }
  } catch (e) {
    log.warn('statRemotePath failed:', (e as Error).message)
    return null
  }
}

/**
 * 功能描述：解析远程符号链接的目标类型（供「双击/回车进入目录」判定使用）。
 *   stat 通常已跟随符号链接（SSH_FXP_STAT）；若个别服务器 STAT 不跟随（返回链接自身），
 *   则照搬 Tabby 官方 SFTP 面板的做法：readlink → posix.resolve → 再 stat 目标路径。
 * 创建人：DD1024z + Claude
 * 创建时间：2026-08-24
 */
export async function resolveRemoteSymlinkStat(
  session: SFTPSessionLike,
  fullPath: string,
): Promise<{ isDirectory: boolean; mode?: number; size?: number; mtime?: Date } | null> {
  let st = await statRemotePath(session, fullPath)
  if (st && !st.isDirectory && st.isSymlink) {
    // 个别服务器 STAT 不跟随链接 → 对齐 Tabby 官方 SFTP 面板：readlink 解析真实目标再 stat
    const sessionReadlink = (session as { readlink?: (p: string) => Promise<string> }).readlink
    const inner = getRusshSftp(session)
    const innerReadlink = (inner as { readlink?: (p: string) => Promise<string> } | undefined)?.readlink
    if (typeof sessionReadlink === 'function') {
      try {
        const target = await sessionReadlink.call(session, fullPath)
        st = await statRemotePath(session, posix.resolve(posix.dirname(fullPath), target))
      } catch (e) {
        log.warn('resolveRemoteSymlinkStat readlink failed:', (e as Error).message)
      }
    } else if (typeof innerReadlink === 'function') {
      try {
        const target = await innerReadlink.call(inner, fullPath)
        st = await statRemotePath(session, posix.resolve(posix.dirname(fullPath), target))
      } catch (e) {
        log.warn('resolveRemoteSymlinkStat readlink (russh) failed:', (e as Error).message)
      }
    }
  }
  return st
}

export type SFTPFile = {
  name: string
  fullPath: string
  isDirectory: boolean
  isSymlink: boolean
  mode: number
  size: number
  modified: Date
  atimeMs?: number
  owner?: string
  group?: string
  ownerUid?: number
  groupGid?: number
}

export type SFTPSessionLike = {
  readdir: (p: string) => Promise<SFTPFile[]>
  mkdir: (p: string) => Promise<void>
  rmdir: (p: string) => Promise<void>
  unlink: (p: string) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  upload: (remotePath: string, transfer: import('tabby-core').FileUpload) => Promise<void>
  download: (remotePath: string, transfer: import('tabby-core').FileDownload) => Promise<void>
  chmod: (path: string, mode: number) => Promise<void>
  /** ★ 2026-08-24：Tabby SFTPSession 包装层运行时还提供 stat(follow)/readlink，
   *    用于符号链接目标类型解析（readdir 为 lstat 语义不跟随链接）。
   *    stat 返回 isDirectory/isSymlink 已由包装层把 russh type 数字枚举正确映射。 */
  stat?: (p: string) => Promise<{ isDirectory?: boolean; isSymlink?: boolean; mode?: number; size?: number; modified?: Date; mtime?: number }>
  readlink?: (p: string) => Promise<string>
}

export type SSHSessionLike = {
  openSFTP: () => Promise<SFTPSessionLike>
}

@Injectable({ providedIn: 'root' })
export class SftpConnectionService {
  // WeakMap: avoids strong references to SSHSessionLike keys, allowing GC when sessions are disposed
  private sessions = new WeakMap<SSHSessionLike, SFTPSessionLike>()
  private pending = new Map<SSHSessionLike, Promise<SFTPSessionLike>>()
  private sessionGen = new WeakMap<SSHSessionLike, number>()
  // ★ 2026-07-25：B5 引用计数——多个浮动面板可能共用同一 SSH 会话的 SFTP 子通道，
  //   仅当引用归零才真正 end() 通道，避免一个面板关闭/断开连累其它共用面板。
  private refCounts = new WeakMap<SSHSessionLike, number>()

  private getGen(sshSession: SSHSessionLike): number {
    return this.sessionGen.get(sshSession) ?? 0
  }

  private bumpGen(sshSession: SSHSessionLike): void {
    this.sessionGen.set(sshSession, this.getGen(sshSession) + 1)
  }

  private _addRef(sshSession: SSHSessionLike): void {
    this.refCounts.set(sshSession, (this.refCounts.get(sshSession) ?? 0) + 1)
  }

  async openFromSSHSession(sshSession: SSHSessionLike): Promise<SFTPSessionLike> {
    const gen = this.getGen(sshSession)
    const existing = this.sessions.get(sshSession)
    if (existing) {
      this._addRef(sshSession) // ★ B5：复用共享会话，引用 +1
      return existing
    }
    const pendingSession = this.pending.get(sshSession)
    if (pendingSession) {
      const sftpSession = await pendingSession
      this._addRef(sshSession) // ★ B5：并发等待同一连接，每方各计一引用
      return sftpSession
    }
    const SFTP_OPEN_TIMEOUT_MS = 30_000
    const openPromise = sshSession.openSFTP()
    // ★ 2026-08-10 修复 #15：超时/被取代后，迟到的通道若仍开成功必须主动释放，否则泄漏。
    //   consumed 记录已被 race 消费（安装或 end）的通道实例，后注册的回调先比对再决定是否 end，
    //   避免微任务顺序误杀正常通道
    let consumed: SFTPSessionLike | null = null
    const raceWinner = openPromise.then((s) => { consumed = s; return s })
    openPromise.then((late) => {
      if (consumed === late) return
      log.warn('late SFTP channel arrived after timeout/supersede, ending it')
      try {
        const endResult = (late as { end?: () => unknown }).end?.()
        if (endResult && typeof (endResult as Promise<unknown>).catch === 'function') {
          (endResult as Promise<unknown>).catch(() => {})
        }
      } catch { /* ignore */ }
    }).catch(() => { /* open 失败无需处理 */ })
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        this.pending.delete(sshSession)
        reject(new Error(`SFTP open timed out after ${SFTP_OPEN_TIMEOUT_MS}ms`))
      }, SFTP_OPEN_TIMEOUT_MS)
    })
    const promise = Promise.race([raceWinner, timeoutPromise])
    this.pending.set(sshSession, promise)
    try {
      const sftpSession = await promise
      // ★ 修复：成功连接后清除超时计时器，避免超时回调在已成功的连接上触发
      if (this.getGen(sshSession) !== gen) {
        try {
          const endResult = (sftpSession as { end?: () => unknown }).end?.()
          if (endResult && typeof (endResult as Promise<unknown>).catch === 'function') {
            (endResult as Promise<unknown>).catch(() => {})
          }
        } catch (e) { log.warn('stale sftp.end() sync error:', (e as Error)?.message) }
        throw new Error('SFTP connection superseded')
      }
      registerRusshClient(sftpSession)
      this.sessions.set(sshSession, sftpSession)
      this._addRef(sshSession) // ★ B5：首个引用
      return sftpSession
    } finally {
      // ★ 2026-08-10 修复 #15：无论成败都清理超时定时器，不得只在成功路径清
      if (timeoutId != null) clearTimeout(timeoutId)
      this.pending.delete(sshSession)
    }
  }

  closeForSSHSession(sshSession: SSHSessionLike): void {
    this.pending.delete(sshSession)
    // ★ 2026-08-10 修复 #6：关闭时立即 bumpGen（而非仅引用归零时）——
    //   若此刻仍有 pending 的 openSFTP，其迟到结果会因 gen 失配被 end() 释放，
    //   否则通道既未注册也无人关闭 → 泄漏
    this.bumpGen(sshSession)
    const sftp = this.sessions.get(sshSession)
    if (!sftp) return
    // ★ B5：引用计数——仅当引用归零才真正结束通道
    const refs = (this.refCounts.get(sshSession) ?? 1) - 1
    if (refs > 0) {
      this.refCounts.set(sshSession, refs)
      return
    }
    this.refCounts.delete(sshSession)
    this.sessions.delete(sshSession)
    try {
      const result = (sftp as { end?: () => unknown }).end?.()
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => {})
      }
    } catch (e) { log.warn('sftp.end() sync error during cleanup:', (e as Error)?.message) }
  }
}

let sharedSftpConnectionService: SftpConnectionService | null = null

/** 多面板共享同一 SFTP 会话缓存（组件非 DI 时使用） */
export function getSftpConnectionService(): SftpConnectionService {
  if (!sharedSftpConnectionService) {
    sharedSftpConnectionService = new SftpConnectionService()
  }
  return sharedSftpConnectionService
}

/**
 * 列出远程目录：以 Tabby readdir 为准（目录类型正确），再补全 atime/owner/group。
 */
export async function readSftpDirectory(
  session: SFTPSessionLike,
  dirPath: string,
  options: SftpEnrichOptions = DEFAULT_ENRICH,
): Promise<SFTPFile[]> {
  const entries = await session.readdir(dirPath)
  const opts = { ...DEFAULT_ENRICH, ...options }
  if (!opts.atime && !opts.ownerGroup) return entries
  return enrichSftpFilesFromRaw(session, dirPath, entries, opts)
}

export async function enrichSftpFilesWithAtime(
  session: SFTPSessionLike,
  dirPath: string,
  entries: SFTPFile[],
  options: SftpEnrichOptions = DEFAULT_ENRICH,
): Promise<SFTPFile[]> {
  return enrichSftpFilesFromRaw(session, dirPath, entries, { ...DEFAULT_ENRICH, ...options })
}

async function enrichSftpFilesFromRaw(
  session: SFTPSessionLike,
  dirPath: string,
  entries: SFTPFile[],
  options: SftpEnrichOptions,
): Promise<SFTPFile[]> {
  if (!entries.length) return entries
  const inner = getRusshSftp(session)
  const wantOwner = !!options.ownerGroup
  const wantAtime = !!options.atime

  let result = entries
  if (inner?.readDirectory && (wantOwner || wantAtime)) {
    try {
      const rawList = await inner.readDirectory(dirPath)
      const rawByName = new Map(rawList.map(item => [item.name, item]))
      const missing = entries.filter(e => !rawByName.has(e.name))
      if (missing.length) {
        log.warn(`readdir/readDirectory mismatch: ${missing.length} entries not found in readDirectory result (possible TOCTOU)`)
      }
      result = entries.map(e => {
        const raw = rawByName.get(e.name)
        if (!raw) return e
        const meta = normalizeRawMeta(raw)
        const longname = raw.longname ?? raw.long_name
        const atimeMs = wantAtime && meta.atime != null && meta.atime > 0 ? meta.atime * 1000 : e.atimeMs
        const owner = wantOwner ? (ownerNameFromMeta(meta, longname) ?? e.owner) : e.owner
        const group = wantOwner ? (groupNameFromMeta(meta, longname) ?? e.group) : e.group
        const ownerUid = wantOwner ? (meta.uid ?? e.ownerUid) : e.ownerUid
        const groupGid = wantOwner ? (meta.gid ?? e.groupGid) : e.groupGid
        if (atimeMs === e.atimeMs && owner === e.owner && group === e.group
          && ownerUid === e.ownerUid && groupGid === e.groupGid) return e
        return { ...e, atimeMs, owner, group, ownerUid, groupGid }
      })
    } catch (e) {
      log.warn('enrichment failed:', (e as Error).message)
    }
  }

  return result
}

/** 后台对缺 owner 的项批量 stat（不阻塞首屏列表） */
export async function enrichRemoteOwnersViaStat(
  session: SFTPSessionLike,
  entries: SFTPFile[],
): Promise<SFTPFile[]> {
  const inner = getRusshSftp(session)
  return enrichOwnersViaStat(inner, entries)
}

/** 目录列表常不带 uid/gid，对缺字段项用 stat 补全（限制并发） */
async function enrichOwnersViaStat(
  inner: RusshSftpClient | undefined,
  entries: SFTPFile[],
): Promise<SFTPFile[]> {
  if (!inner?.stat) return entries
  const missing = entries.filter(e =>
    (e.ownerUid == null && e.groupGid == null && !e.owner && !e.group)
    || (e.ownerUid != null && !e.owner) || (e.groupGid != null && !e.group),
  )
  if (!missing.length) return entries

  const patches = new Map<string, { owner?: string; group?: string; ownerUid?: number; groupGid?: number; atimeMs?: number }>()
  const batchSize = 12
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize)
    await Promise.all(batch.map(async e => {
      try {
        const raw = await inner.stat!(e.fullPath)
        const meta = normalizeRawMeta({ name: e.name, metadata: raw })
        const owner = ownerNameFromMeta(meta)
        const group = groupNameFromMeta(meta)
        const ownerUid = meta.uid
        const groupGid = meta.gid
        const atimeMs = meta.atime != null && meta.atime > 0 ? meta.atime * 1000 : undefined
        if (owner || group || ownerUid != null || groupGid != null || atimeMs != null) {
          patches.set(e.name, { owner, group, ownerUid, groupGid, atimeMs })
        }
      } catch (e) {
        log.warn('stat enrichment failed:', (e as Error).message)
      }
    }))
  }

  if (!patches.size) return entries
  return entries.map(e => {
    const patch = patches.get(e.name)
    if (!patch) return e
    return {
      ...e,
      owner: patch.owner ?? e.owner,
      group: patch.group ?? e.group,
      ownerUid: patch.ownerUid ?? e.ownerUid,
      groupGid: patch.groupGid ?? e.groupGid,
      atimeMs: patch.atimeMs ?? e.atimeMs,
    }
  })
}

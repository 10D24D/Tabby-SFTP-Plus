/**
 * SFTP 连接服务
 * 功能描述：封装 Tabby SSH Session 的 SFTP 连接，提供统一的文件操作接口
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 */
import { Injectable } from '@angular/core'

/** 远程列表元数据补全选项（按可见列跳过不必要 I/O） */
export type SftpEnrichOptions = {
  atime?: boolean
  ownerGroup?: boolean
  statFallback?: boolean
}

const DEFAULT_ENRICH: SftpEnrichOptions = {
  atime: true,
  ownerGroup: true,
  statFallback: true,
}

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
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'bigint') return Number(v)
  if (typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))) return Number(v)
  return undefined
}

/** 兼容 russh 普通对象 metadata 与 native 类（metadata.type()） */
function extractRawFields(entry: RawSftpDirEntry): Record<string, unknown> {
  let meta = entry.metadata as Record<string, unknown> | undefined
  if (typeof meta === 'function') {
    try { meta = (meta as () => Record<string, unknown>)() } catch { meta = undefined }
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
  const base = { ...(meta ?? {}), ...(entry as Record<string, unknown>) }
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

function ownerNameFromMeta(meta: RawSftpMetadata, longname?: string): string | undefined {
  if (meta.user && !isNumericIdStr(meta.user)) return meta.user
  if (!longname) return undefined
  const m = longname.match(/^[dlbcps\-]\S+\s+\d+\s+(\S+)\s+(\S+)\s+/)
  const name = m?.[1]
  return name && !isNumericIdStr(name) ? name : undefined
}

function groupNameFromMeta(meta: RawSftpMetadata, longname?: string): string | undefined {
  if (meta.group && !isNumericIdStr(meta.group)) return meta.group
  if (!longname) return undefined
  const m = longname.match(/^[dlbcps\-]\S+\s+\d+\s+(\S+)\s+(\S+)\s+/)
  const name = m?.[2]
  return name && !isNumericIdStr(name) ? name : undefined
}

const russhClientBySession = new WeakMap<SFTPSessionLike, RusshSftpClient>()

export function registerRusshClient(session: SFTPSessionLike): void {
  const russh = (session as { sftp?: RusshSftpClient }).sftp
  if (russh) russhClientBySession.set(session, russh)
}

function getRusshSftp(session: SFTPSessionLike): RusshSftpClient | undefined {
  return russhClientBySession.get(session) ?? (session as { sftp?: RusshSftpClient }).sftp
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
  stat?: (p: string) => Promise<{ size: number; modified?: Date; mtime?: number }>
}

export type SSHSessionLike = {
  openSFTP: () => Promise<SFTPSessionLike>
}

@Injectable({ providedIn: 'root' })
export class SftpConnectionService {
  private sessions = new Map<SSHSessionLike, SFTPSessionLike>()
  private pending = new Map<SSHSessionLike, Promise<SFTPSessionLike>>()
  private sessionGen = new WeakMap<SSHSessionLike, number>()

  private getGen(sshSession: SSHSessionLike): number {
    return this.sessionGen.get(sshSession) ?? 0
  }

  private bumpGen(sshSession: SSHSessionLike): void {
    this.sessionGen.set(sshSession, this.getGen(sshSession) + 1)
  }

  async openFromSSHSession(sshSession: SSHSessionLike): Promise<SFTPSessionLike> {
    const gen = this.getGen(sshSession)
    if (this.sessions.has(sshSession)) {
      return this.sessions.get(sshSession)!
    }
    if (this.pending.has(sshSession)) {
      return this.pending.get(sshSession)!
    }
    const promise = sshSession.openSFTP()
    this.pending.set(sshSession, promise)
    try {
      const sftpSession = await promise
      if (this.getGen(sshSession) !== gen) {
        try { (sftpSession as { end?: () => void }).end?.() } catch { /* ignore */ }
        throw new Error('SFTP connection superseded')
      }
      registerRusshClient(sftpSession)
      this.sessions.set(sshSession, sftpSession)
      return sftpSession
    } finally {
      this.pending.delete(sshSession)
    }
  }

  closeForSSHSession(sshSession: SSHSessionLike): void {
    this.bumpGen(sshSession)
    this.pending.delete(sshSession)
    const sftp = this.sessions.get(sshSession)
    if (sftp) {
      try { (sftp as { end?: () => void }).end?.() } catch { /* ignore */ }
    }
    this.sessions.delete(sshSession)
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
    } catch {
      /* 补全失败不影响列表 */
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
      } catch {
        /* 忽略单文件 stat 失败 */
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

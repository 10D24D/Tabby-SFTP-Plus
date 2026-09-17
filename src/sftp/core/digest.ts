/**
 * 文件内容摘要（用于传输冲突时判断内容是否真的发生变化）
 *
 * 背景：Git 切换分支、rsync 同步等场景下，文件的 mtime 会变化但内容并未修改。
 * 仅凭 size + mtime 判定会把这类文件误报为冲突，反复弹框打扰用户。
 * 本模块提供两端内容摘要，供「size 相同但 mtime 超出容差」时做精确判断（回应 issue #15）。
 *
 * 设计原则（安全优先）：
 *   - 任一端的摘要拿不到（无 SSH exec 权限 / 远端命令缺失 / 超时 / 超过大小阈值 / 读取失败）
 *     一律返回 null，调用方必须按「无法确认」保守处理（照常弹冲突框），
 *     **绝不允许**在只有单端摘要或摘要缺失的情况下判定「内容相同」。
 *   - 摘要仅用于内容比对，不用于安全校验，因此 sha1 完全足够；
 *     且 sha1sum 在各类 Linux 发行版与 BusyBox 上的兼容性明显好于 sha256sum。
 *
 * 创建人：DD1024z + Hy4 preview
 * 创建时间：2026-09-07
 */

import { createHash } from 'crypto'
import { createReadStream, promises as fsp } from 'fs'
import { execSshCommand } from './path-utils'
import { shellQuotePosix } from './fs-ops'

export type DigestAlgo = 'sha1' | 'sha256'

export interface DigestOptions {
  /** 摘要算法，默认 sha1（远端兼容性最好） */
  algo?: DigestAlgo
  /** 超过此字节数不计算，直接返回 null，避免大文件拖慢冲突检测 */
  maxBytes?: number
  /** 远端 exec 超时，默认 20s */
  timeoutMs?: number
}

export interface ContentDigestPort {
  readonly algo: DigestAlgo
  /** 本地文件摘要；无法计算时返回 null */
  localDigest(localPath: string, size?: number, mtime?: number): Promise<string | null>
  /** 远端文件摘要；无 exec 权限或命令缺失时返回 null */
  remoteDigest(remotePath: string, size?: number, mtime?: number): Promise<string | null>
}

const DEFAULT_MAX_BYTES = 256 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 20000
/** 缓存条目上限，防止长会话内存堆积 */
const CACHE_LIMIT = 256

interface CacheEntry {
  key: string
  digest: string
}

/** 摘要长度：sha1 = 40 hex，sha256 = 64 hex */
const HEX_RE = /\b([0-9a-fA-F]{40}|[0-9a-fA-F]{64})\b/

export class ContentDigestService implements ContentDigestPort {
  readonly algo: DigestAlgo
  private readonly maxBytes: number
  private readonly timeoutMs: number

  /** 结果缓存：path → { size:mtime, digest }，size/mtime 变化即失效 */
  private readonly cache = new Map<string, CacheEntry>()
  /** 并发单飞：同一路径同时发起时复用同一个 Promise，避免重复 exec / 重复读盘 */
  private readonly pending = new Map<string, Promise<string | null>>()

  /** undefined = 尚未探测；null = 不可用（无 exec 或无命令） */
  private remoteBin: 'sha1sum' | 'sha256sum' | 'openssl' | null | undefined
  private remoteProbe: Promise<void> | null = null

  constructor(
    private readonly getSshSession: () => unknown,
    opts: DigestOptions = {},
  ) {
    this.algo = opts.algo === 'sha256' ? 'sha256' : 'sha1'
    this.maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async localDigest(localPath: string, size?: number, mtime?: number): Promise<string | null> {
    return this._withDedupe('L|' + localPath, async () => {
      try {
        let s = size
        let m = mtime
        if (s == null || m == null) {
          const st = await fsp.stat(localPath)
          s = st.size
          m = st.mtimeMs
        }
        if (!this._withinLimit(s)) return null
        const key = `${s}:${m}`
        const hit = this.cache.get('L|' + localPath)
        if (hit && hit.key === key) return hit.digest
        const digest = await this._hashLocalFile(localPath)
        this._put('L|' + localPath, key, digest)
        return digest
      } catch {
        // 读不到就当作无法确认，绝不猜
        return null
      }
    })
  }

  async remoteDigest(remotePath: string, size?: number, mtime?: number): Promise<string | null> {
    return this._withDedupe('R|' + remotePath, async () => {
      try {
        const ssh = this.getSshSession()
        if (!ssh) return null
        if (size != null && !this._withinLimit(size)) return null
        await this._ensureRemoteBin(ssh)
        if (!this.remoteBin) return null
        const key = `${size ?? '?'}:${mtime ?? '?'}`
        const hit = this.cache.get('R|' + remotePath)
        if (hit && hit.key === key) return hit.digest

        const cmd = this.remoteBin === 'openssl'
          ? `openssl dgst -${this.algo} ${shellQuotePosix(remotePath)}`
          : `${this.remoteBin} ${shellQuotePosix(remotePath)}`
        const out = await execSshCommand(ssh, cmd, this.timeoutMs)
        const m = HEX_RE.exec(out || '')
        if (!m) return null
        const digest = m[1].toLowerCase()
        this._put('R|' + remotePath, key, digest)
        return digest
      } catch {
        return null
      }
    })
  }

  private _withinLimit(size: number | undefined): boolean {
    if (size == null) return true
    return size >= 0 && size <= this.maxBytes
  }

  private _hashLocalFile(p: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const h = createHash(this.algo)
      const s = createReadStream(p)
      s.on('error', reject)
      s.on('data', (chunk) => h.update(chunk))
      s.on('end', () => resolve(h.digest('hex')))
    })
  }

  /** 探测远端可用的摘要命令（按兼容性排序），结果缓存，失败不再反复探测 */
  private async _ensureRemoteBin(ssh: unknown): Promise<void> {
    if (this.remoteBin !== undefined) return
    if (this.remoteProbe) return this.remoteProbe
    this.remoteProbe = (async () => {
      const candidates: Array<'sha1sum' | 'sha256sum' | 'openssl'> =
        this.algo === 'sha256' ? ['sha256sum', 'openssl'] : ['sha1sum', 'openssl']
      for (const bin of candidates) {
        try {
          const out = await execSshCommand(ssh, `command -v ${bin} 2>/dev/null`, Math.min(this.timeoutMs, 8000))
          if (out && out.trim()) {
            this.remoteBin = bin
            return
          }
        } catch {
          // 继续尝试下一个
        }
      }
      this.remoteBin = null
    })()
    try {
      await this.remoteProbe
    } finally {
      this.remoteProbe = null
    }
  }

  /** 并发单飞 + 结束后清理 */
  private async _withDedupe(key: string, run: () => Promise<string | null>): Promise<string | null> {
    const existing = this.pending.get(key)
    if (existing) return existing
    const p = run()
    this.pending.set(key, p)
    try {
      return await p
    } finally {
      this.pending.delete(key)
    }
  }

  private _put(key: string, version: string, digest: string): void {
    if (this.cache.size >= CACHE_LIMIT) {
      // 简易淘汰：清掉最早插入的一批（Map 保持插入顺序）
      const drop = Math.ceil(CACHE_LIMIT / 4)
      let i = 0
      for (const k of this.cache.keys()) {
        if (i++ >= drop) break
        this.cache.delete(k)
      }
    }
    this.cache.set(key, { key: version, digest })
  }
}

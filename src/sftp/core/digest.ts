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
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — P2 修复：缓存键 `size:mtime` 里 mtime 用 `?? '?'` 兜底，
 *              mtime 未知（调用方未传）时键退化成 `<size>:?` —— 此后只要大小不变就一直
 *              命中同一条缓存，文件被改写（大小恰好不变）也返回旧摘要 ⇒ 判定「内容相同」
 *              ⇒ 跳过传输、用户修改被静默丢弃。改为：mtime 未知时本轮**既不读缓存也不写缓存**
 *              （多算一次 hash，换取绝不误判）。
 */

import { createHash } from 'crypto'
import { createReadStream, promises as fsp } from 'fs'
import { execSshCommand } from './path-utils'
import { shellQuotePosix } from './fs-ops'
import { log } from '../../services/sftp-logger'

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
  /** 远端文件摘要；无 exec 权限或命令缺失时返回 null
   *  @param session 可选的 SSH 会话，用于端点化冲突（远程↔远程）时指定非面板主会话 */
  remoteDigest(remotePath: string, size?: number, mtime?: number, session?: any): Promise<string | null>
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
const HEX40 = '[0-9a-fA-F]{40}'
const HEX64 = '[0-9a-fA-F]{64}'

/**
 * ★ 2026-10-09 审计根治：原先只有一个宽松的 `HEX_RE = /\b([0-9a-fA-F]{40}|{64})\b/` 取
 * **首个**匹配，隐含假设「hash 总在输出最前面」。
 * 该假设只在 sha1sum 成立（格式 `<hash>  <path>`），而 openssl 回退路径的输出是
 * `SHA1(/data/deadbeef…/config.js)= <hash>` —— **路径在前、hash 在 `=` 之后**。
 * 于是当远端没有 sha1sum/sha256sum（回退 openssl）且路径中含 40/64 位连续十六进制
 * （内容寻址 cache 目录、CI 产物目录等），会匹配到**路径里那串**并当成文件摘要返回，
 * 由于格式合法而通过全部校验 ⇒ isContentIdentical 返回「双方文件名相同就相同、
 * 与内容无关」的假摘要 ⇒ **跳过传输，用户对文件的修改被静默丢弃**。
 *
 * 根治要点（三条，缺一不可）：
 *   ① 按每种命令的**真实输出格式**分别锚定（sha*sum 锚行首、openssl 锚 `=` 右侧）；
 *   ② 校验取到的 hex **长度必须与本实例算法一致**（sha1=40 / sha256=64），
 *      宁可解析失败返回 null，也不要一个宽度不符的串；
 *   ③ 逐行尝试（远端可能先吐 banner / warning 行）。
 * 解析不出 ⇒ 返回 null（上层保守弹冲突框），绝不猜。
 */
function parseDigestOutput(
  out: string | null | undefined,
  bin: 'sha1sum' | 'sha256sum' | 'openssl',
  algo: DigestAlgo,
): string | null {
  const hex = algo === 'sha256' ? HEX64 : HEX40
  const text = String(out ?? '')
  if (!text.trim()) return null

  // 逐行匹配：远端 stdout 常混入 banner / locale 提示 / stderr 合并内容
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    if (bin === 'openssl') {
      // 格式：`SHA1(/path/to/file)= <hash>` / `SHA2-256(/path)= <hash>`
      // 关键：用**非贪婪单行**匹配 + 锚定行尾的 `= <hex>`，确保取的是 `=` 右侧的摘要。
      // `[^=\n]*` 保证不会跨行、也不会越过 `=` 去取别的东西。
      const re = new RegExp(`^[^=\\n]*=[ \\t]*(${hex})[ \\t]*$`, 'i')
      const m = re.exec(line)
      if (m) return m[1].toLowerCase()
      continue
    }

    // sha1sum / sha256sum：`<hash>  <path>` 或 `<hash> *<path>`
    // 必须锚定**行首**且后跟至少一个空白 + 路径字符，否则路径里的 hex 会被误取。
    const re = new RegExp(`^[ \\t]*(${hex})[ \\t]+[*]?\\S`, 'i')
    const m = re.exec(line)
    if (m) return m[1].toLowerCase()
  }
  return null
}

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
        if (!this._withinLimit(s)) {
          log.warn('[digest] local file exceeds max size limit:', localPath, 'size:', s)
          return null
        }
        const key = `${s}:${m}`
        const hit = this.cache.get('L|' + localPath)
        if (hit && hit.key === key) return hit.digest
        const digest = await this._hashLocalFile(localPath)
        this._put('L|' + localPath, key, digest)
        return digest
      } catch (e) {
        log.warn('[digest] local digest failed:', localPath, e)
        return null
      }
    })
  }

  async remoteDigest(remotePath: string, size?: number, mtime?: number, session?: any): Promise<string | null> {
    return this._withDedupe('R|' + remotePath, async () => {
      try {
        const ssh = session ?? this.getSshSession()
        if (!ssh) {
          log.warn('[digest] remote digest skipped: no SSH session for', remotePath)
          return null
        }
        // ★ 2026-09-21 P2 修复：size 为 null 时原先直接放行（_withinLimit 返回 true），
        //   于是对大小未知的远端文件会整文件求 hash，完全绕过 maxBytes——
        //   冲突检测路径未带 size 时，远端大文件会吃满 CPU/IO 直到 timeoutMs。
        //   未知大小改为保守拒绝（返回 null ⇒ 上层照常弹冲突框让用户决定）。
        if (size == null) {
          log.warn('[digest] remote size unknown, skipping digest to avoid unbounded hashing:', remotePath)
          return null
        }
        if (!this._withinLimit(size)) {
          log.warn('[digest] remote file exceeds max size limit:', remotePath, 'size:', size)
          return null
        }
        await this._ensureRemoteBin(ssh)
        if (!this.remoteBin) {
          log.warn('[digest] remote digest skipped: no sha1sum/sha256sum/openssl available on remote server for', remotePath)
          return null
        }
        // ★ 2026-10-19 P2：mtime 未知时**不参与缓存**（既不读也不写）。
        //   原写法把未知的 mtime 兜成 '?'，键变成 `<size>:?` —— 只要大小不变就永远命中，
        //   文件被改写（大小恰好不变）也照旧返回旧摘要 ⇒ 上层判定「内容相同」⇒ 跳过传输。
        //   宁可多跑一次远端 hash，也不返回可能陈旧的摘要。
        const version = mtime == null ? null : `${size ?? '?'}:${mtime}`
        const hit = version == null ? undefined : this.cache.get('R|' + remotePath)
        if (hit && hit.key === version) return hit.digest

        const cmd = this.remoteBin === 'openssl'
          ? `openssl dgst -${this.algo} ${shellQuotePosix(remotePath)}`
          : `${this.remoteBin} ${shellQuotePosix(remotePath)}`
        // ★ 2026-09-20 P1-13：幂等命令显式启用重试
        const out = await execSshCommand(ssh, cmd, this.timeoutMs, { retryOnEmpty: true })
        // ★ 2026-10-09 审计根治：按命令真实格式解析 + 校验宽度（原 HEX_RE 取首个匹配，
        //   openssl 路径会把「路径里的 hex」当成摘要 ⇒ 误判内容相同 ⇒ 静默跳过传输）
        const digest = parseDigestOutput(out, this.remoteBin, this.algo)
        if (!digest) {
          log.warn('[digest] remote digest output parse failed for', remotePath, 'bin:', this.remoteBin, 'output:', out?.slice(0, 200))
          return null
        }
        if (version != null) this._put('R|' + remotePath, version, digest)
        return digest
      } catch (e) {
        log.warn('[digest] remote digest failed:', remotePath, e)
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
          // ★ 2026-09-20 P1-13：幂等探测命令显式启用重试
          const out = await execSshCommand(ssh, `command -v ${bin} 2>/dev/null`, Math.min(this.timeoutMs, 8000), { retryOnEmpty: true })
          if (out && out.trim()) {
            log.info('[digest] remote bin detected:', bin)
            this.remoteBin = bin
            return
          }
        } catch {
          // 继续尝试下一个
        }
      }
      log.warn('[digest] no remote digest command found (tried:', candidates.join(', '), ')')
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

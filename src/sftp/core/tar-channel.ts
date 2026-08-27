/**
 * 功能描述：SFTP+ 目录打包传输通道（tar channel）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 * 说明：海量小文件目录（dist/node_modules 等）逐文件 SFTP 传输时每个文件都要吃
 *   数次网络往返，天然慢。本通道把整目录打成单个 tar.gz 走「单文件」传输，再在
 *   对端解包，等效 electerm 的打包思路。因 Tabby SSH exec 通道不能写 stdin，
 *   不做流式直灌，改为「临时文件 + 现有 SFTP 管道」：
 *     上传：本地 tar czf → SFTP 上传 tar 包 → 服务端 tar xzf → 清理
 *     下载：服务端 tar czf → SFTP 下载 tar 包 → 本地 tar xzf → 清理
 *
 * 启用边界（与用户商定的设计）：
 *   - 仅当目标不存在（全新传输）时由用例层调用；合并/增量覆盖场景必须保留
 *     逐文件通道（冲突检测依赖它）。
 *   - 本地或远端无 tar（探测一次并缓存）→ 'fallback'，用例回退逐文件通道。
 *
 * 结果三态：
 *   'fallback' — 通道未接管（无环境/打包前失败），未创建任何进度条目，可安全回退
 *   'success'  — 已完整传输（进度条目已收尾）
 *   'failed'   — 已提交传输但失败/取消（进度条目已记失败），不应再回退重试
 */

import { spawn } from 'child_process'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { randomUUID } from 'crypto'

import type { FolderTransferPort } from './transfer-types'
import { shellQuotePosix } from './fs-ops'
import { log } from '../../services/sftp-logger'

export type TarChannelResult = 'fallback' | 'success' | 'failed'

export interface TarChannelDeps {
  hasSsh(): boolean
  /** SSH exec 收集 stdout；timeoutMs 缺省由实现决定 */
  exec(cmd: string, timeoutMs?: number): Promise<string>
  /** 单文件 SFTP 传输（不产生 UI 条目）；onProgress 上报字节数，shouldAbort 返回 true 时中断 */
  uploadFile(localPath: string, remotePath: string, onProgress?: (bytes: number) => void, shouldAbort?: () => boolean): Promise<boolean>
  downloadFile(remotePath: string, localPath: string, size: number, onProgress?: (bytes: number) => void, shouldAbort?: () => boolean): Promise<boolean>
  remoteUnlink(remotePath: string): Promise<void>
  /** ★ 2026-08-11：本地目录真实大小（回填传输记录用；本地扫描开销低，失败返回 0） */
  scanLocalSize(localDir: string): Promise<number>
  /** ★ 2026-08-11：远端目录真实大小（下载进度显示用；快速模式下调用方返回 0 跳过扫描） */
  scanRemoteSize(remotePath: string): Promise<number>
}

const TAR_OK = 'SFTP_PLUS_TAR_OK'
/** 服务端打包/解包超时：巨型目录留足余量 */
const REMOTE_TAR_TIMEOUT_MS = 120_000

/** 本地 tar 子进程封装：成功返回 true */
function runLocalTar(args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn('tar', args)
      let settled = false
      const done = (ok: boolean) => {
        if (settled) return
        settled = true
        resolve(ok)
      }
      child.on('error', () => done(false))
      child.on('close', code => done(code === 0))
    } catch {
      resolve(false)
    }
  })
}

/**
 * ★ 2026-08-26 C2：校验解包树全部落在 root 内（防 zip-slip）。
 * 遇越界路径返回 false；不跟随 symlink 递归（lstat）。
 */
async function assertExtractedUnderRoot(root: string): Promise<boolean> {
  const rootReal = await fs.realpath(root).catch(() => path.resolve(root))
  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep
  const walk = async (dir: string): Promise<boolean> => {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      // symlink：只允许链接本身存在于 root 下，不跟随
      let real: string
      try {
        real = e.isSymbolicLink() ? full : await fs.realpath(full)
      } catch {
        return false
      }
      if (real !== rootReal && !real.startsWith(prefix)) {
        log.warn('tar channel: zip-slip rejected path:', real)
        return false
      }
      if (e.isDirectory() && !e.isSymbolicLink()) {
        if (!(await walk(full))) return false
      }
    }
    return true
  }
  return walk(root)
}

/** 安全本地解包到沙箱再移入目标（失败不污染 localDest） */
async function extractTarSafely(tarFile: string, localDest: string, expectedBase: string): Promise<boolean> {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'sftp-plus-untar-')).catch(() => null)
  if (!sandbox) return false
  try {
    // 优先尝试禁用绝对路径的标志（GNU/部分 bsdtar）；不支持时回退基础参数
    let extracted = await runLocalTar(['-xzf', tarFile, '-C', sandbox, '--no-absolute-filenames'])
    if (!extracted) {
      extracted = await runLocalTar(['-xzf', tarFile, '-C', sandbox])
    }
    if (!extracted) return false
    if (!(await assertExtractedUnderRoot(sandbox))) {
      return false
    }
    const extractedDir = path.join(sandbox, expectedBase)
    const st = await fs.lstat(extractedDir).catch(() => null)
    if (!st) {
      log.warn('tar channel: expected top-level entry missing after extract:', expectedBase)
      return false
    }
    await fs.mkdir(localDest, { recursive: true }).catch(() => {})
    const finalDest = path.join(localDest, expectedBase)
    // 目标应不存在（调用方保证）；若存在则失败以免覆盖
    if (await fs.stat(finalDest).then(() => true).catch(() => false)) {
      log.warn('tar channel: destination already exists, abort move:', finalDest)
      return false
    }
    try {
      await fs.rename(extractedDir, finalDest)
    } catch {
      // 跨设备：复制再删
      if (typeof (fs as any).cp === 'function') {
        await (fs as any).cp(extractedDir, finalDest, { recursive: true, dereference: false })
      } else {
        return false
      }
    }
    return true
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true }).catch(() => {})
  }
}

export class TarChannel {
  private localTarOk: boolean | null = null
  private remoteTarOk: boolean | null = null

  constructor(private readonly deps: TarChannelDeps) {}

  /** 本地 tar 可用性探测（缓存）：Win10+ 自带 bsdtar */
  private async _localTarAvailable(): Promise<boolean> {
    if (this.localTarOk !== null) return this.localTarOk
    this.localTarOk = await new Promise<boolean>((resolve) => {
      try {
        const child = spawn('tar', ['--version'])
        let settled = false
        const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok) } }
        child.on('error', () => done(false))
        child.on('close', code => done(code === 0))
        setTimeout(() => { try { child.kill() } catch { /* ignore */ }; done(false) }, 5000)
      } catch {
        resolve(false)
      }
    })
    return this.localTarOk
  }

  /** 远端 tar 可用性探测（缓存） */
  private async _remoteTarAvailable(): Promise<boolean> {
    if (this.remoteTarOk !== null) return this.remoteTarOk
    try {
      const out = await this.deps.exec('command -v tar || which tar')
      this.remoteTarOk = /\btar\b/.test(out)
    } catch {
      this.remoteTarOk = false
    }
    return this.remoteTarOk
  }

  /** 上传：本地目录 → tar.gz → SFTP → 服务端解包。remoteTarget 必须不存在（调用方保证） */
  async tryUploadDir(
    localPath: string,
    remoteTarget: string,
    folder: FolderTransferPort,
    name: string,
  ): Promise<TarChannelResult> {
    if (!this.deps.hasSsh()) return 'fallback'
    if (localPath.includes('\0') || remoteTarget.includes('\0')) return 'fallback'
    if (!(await this._localTarAvailable()) || !(await this._remoteTarAvailable())) return 'fallback'

    // 1. 本地打包（提交前：失败静默回退，不产生进度条目）
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sftp-plus-tar-')).catch(() => null)
    if (!tmpDir) return 'fallback'
    const tarFile = path.join(tmpDir, `${randomUUID()}.tar.gz`)
    const packed = await runLocalTar(['-czf', tarFile, '-C', path.dirname(localPath), path.basename(localPath)])
    if (!packed) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      log.warn('tar channel: local pack failed, fallback:', localPath)
      return 'fallback'
    }
    const tarSize = (await fs.stat(tarFile).catch(() => null))?.size ?? 0
    if (tarSize <= 0) {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      return 'fallback'
    }

    // 2. 提交：创建文件夹进度条目。
    //   ★ 2026-08-11：总量与进度按真实目录大小显示（压缩包大小会误导用户以为传少了），
    //   实际传输字节按比例折算；本地扫描不可得真实大小时退回按 tar 包字节显示
    const parent = path.posix.dirname(remoteTarget)
    const remoteTar = path.posix.join(parent, `.sftp-plus-tar-${randomUUID()}.tar.gz`)
    const realSize = await this.deps.scanLocalSize(localPath).catch(() => 0)
    const displayTotal = realSize > 0 ? realSize : tarSize
    const disp = (b: number) => displayTotal === tarSize ? b : Math.round(b * displayTotal / tarSize)
    const ctx = folder.start(name, 'upload', remoteTarget, localPath, displayTotal, 1)
    if (realSize > 0) folder.updateLogSize?.(ctx, realSize)
    try {
      if (folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      const upOk = await this.deps.uploadFile(
        tarFile, remoteTar,
        bytes => folder.updateProgress(ctx, disp(bytes), name, 0, displayTotal),
        () => folder.isAborted(ctx),
      )
      if (!upOk || folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      // 3. 服务端解包到临时目录再 mv 期望基名，降低 zip-slip 面
      // 注意：tar -f 后必须紧跟归档文件名，不能加 --（否则 -- 会被当作文件名）
      const remoteExtractDir = path.posix.join(parent, `.sftp-plus-untar-${randomUUID()}`)
      const out = await this.deps.exec(
        `mkdir -p ${shellQuotePosix(remoteExtractDir)} ` +
        `&& tar xzf ${shellQuotePosix(remoteTar)} -C ${shellQuotePosix(remoteExtractDir)} ` +
        `&& test -e ${shellQuotePosix(path.posix.join(remoteExtractDir, path.posix.basename(remoteTarget)))} ` +
        `&& mv ${shellQuotePosix(path.posix.join(remoteExtractDir, path.posix.basename(remoteTarget)))} ${shellQuotePosix(remoteTarget)} ` +
        `&& rm -rf ${shellQuotePosix(remoteExtractDir)} ` +
        `&& printf '${TAR_OK}\\n'`,
        REMOTE_TAR_TIMEOUT_MS,
      )
      if (!new RegExp(`\\b${TAR_OK}\\b`).test(out)) {
        log.warn('tar channel: remote extract failed:', remoteTarget, out?.trim())
        // 尽力清理临时解包目录
        this.deps.exec(`rm -rf ${shellQuotePosix(remoteExtractDir)}`).catch(() => {})
        folder.finish(ctx, false)
        return 'failed'
      }
      folder.updateProgress(ctx, displayTotal, name, 1, displayTotal)
      folder.finish(ctx, true)
      log.info('tar channel upload OK:', localPath, '->', remoteTarget)
      return 'success'
    } catch (e) {
      log.warn('tar channel upload error:', remoteTarget, e)
      try { folder.finish(ctx, false) } catch { /* ignore */ }
      return 'failed'
    } finally {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** 下载：服务端打包 → SFTP → 本地解包。本地目标目录必须不存在（调用方保证） */
  async tryDownloadDir(
    remoteSrc: string,
    localDest: string,
    folder: FolderTransferPort,
    name: string,
  ): Promise<TarChannelResult> {
    if (!this.deps.hasSsh()) return 'fallback'
    if (remoteSrc.includes('\0') || localDest.includes('\0')) return 'fallback'
    if (!(await this._localTarAvailable()) || !(await this._remoteTarAvailable())) return 'fallback'

    const parent = path.posix.dirname(remoteSrc)
    const base = path.posix.basename(remoteSrc)
    const remoteTar = path.posix.join(parent, `.sftp-plus-tar-${randomUUID()}.tar.gz`)

    // 1. 服务端打包（提交前：失败静默回退）；真实大小扫描与打包并行，不额外增加等待
    // 注意：tar -f 后必须紧跟归档文件名，不能加 --（否则 -- 会被当作文件名）
    const sizeProbe = this.deps.scanRemoteSize(remoteSrc).catch(() => 0)
    let out = await this.deps.exec(
      `tar czf ${shellQuotePosix(remoteTar)} -C ${shellQuotePosix(parent)} ${shellQuotePosix(base)} ` +
      `&& printf '${TAR_OK}\\n'`,
      REMOTE_TAR_TIMEOUT_MS,
    )
    if (!new RegExp(`\\b${TAR_OK}\\b`).test(out)) {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      log.warn('tar channel: remote pack failed, fallback:', remoteSrc, out?.trim())
      return 'fallback'
    }
    // tar 包大小（进度总量）：wc -c 兼容 GNU/BSD
    out = await this.deps.exec(`wc -c < ${shellQuotePosix(remoteTar)}`)
    const tarSize = parseInt(out.trim(), 10)
    if (!Number.isFinite(tarSize) || tarSize <= 0) {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      return 'fallback'
    }

    // 2. 提交：创建文件夹进度条目。
    //   ★ 2026-08-11：与上传对称——总量与进度按真实目录大小显示（快速模式/扫描不可得时
    //   退回按 tar 包字节显示），实际传输字节按比例折算
    const realSize = await sizeProbe
    const displayTotal = realSize > 0 ? realSize : tarSize
    const disp = (b: number) => displayTotal === tarSize ? b : Math.round(b * displayTotal / tarSize)
    const ctx = folder.start(name, 'download', remoteSrc, path.join(localDest, base), displayTotal, 1)
    if (realSize > 0) folder.updateLogSize?.(ctx, realSize)
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sftp-plus-tar-')).catch(() => null)
    const tarFile = tmpDir ? path.join(tmpDir, `${randomUUID()}.tar.gz`) : null
    try {
      if (!tmpDir || !tarFile || folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      const dlOk = await this.deps.downloadFile(
        remoteTar, tarFile, tarSize,
        bytes => folder.updateProgress(ctx, disp(bytes), name, 0, displayTotal),
        () => folder.isAborted(ctx),
      )
      if (!dlOk || folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      // 3. 本地安全解包（沙箱 + zip-slip 校验 + 原子移入；目标不存在由调用方保证）
      const extracted = await extractTarSafely(tarFile, localDest, base)
      if (!extracted) {
        log.warn('tar channel: local extract failed:', localDest)
        folder.finish(ctx, false)
        return 'failed'
      }
      // ★ 2026-08-11：扫描不可得真实大小时，解包成功后用本地解出目录大小兜底回填传输记录
      if (!(realSize > 0)) {
        const extractedSize = await this.deps.scanLocalSize(path.join(localDest, base)).catch(() => 0)
        if (extractedSize > 0) folder.updateLogSize?.(ctx, extractedSize)
      }
      folder.updateProgress(ctx, displayTotal, name, 1, displayTotal)
      folder.finish(ctx, true)
      log.info('tar channel download OK:', remoteSrc, '->', localDest)
      return 'success'
    } catch (e) {
      log.warn('tar channel download error:', remoteSrc, e)
      try { folder.finish(ctx, false) } catch { /* ignore */ }
      return 'failed'
    } finally {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

/**
 * 本地/远程文件系统操作：递归删除 + 目录/文件复制
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25
 */
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import type { SFTPFile, SFTPSessionLike } from '../../services/sftp.service'
import { execSshCommand } from './path-utils'
import { ConcurrencyLimiter } from './concurrency'

import { log } from '../../services/sftp-logger'
/* ── 递归删除 ───────────────────────────────────
 * failed: 可选，收集删除失败（被占用/无权限等）的路径，便于上层统一提示。
 * 失败时只记录到 failed 并继续处理同级其它项，避免单个占用文件中断整批删除。
 * ★ 2026-08-11 提速：原为串行递归（每个文件一次 unlink 往返捱个等，海量小文件目录极慢），
 *   现改为叶子 IO（unlink/rmdir）限流并发、同级子项并行；目录递归本身不占槽
 *   ——持槽等待子删除会形成 hold-and-wait 死锁。limiter 可由调用方传入，
 *   多路径批量删除共享同一个在途上限。 */

const DELETE_CONCURRENCY = 8

export async function deleteLocalRecursive(
  localPath: string,
  failed?: string[],
  depth = 0,
  limiter?: ConcurrencyLimiter,
): Promise<void> {
  if (depth > 100) {
    log.warn('deleteLocalRecursive max depth at', localPath)
    failed?.push(localPath)
    return
  }
  const lim = limiter ?? new ConcurrencyLimiter(DELETE_CONCURRENCY)
  const st = await fs.lstat(localPath).catch(() => null)
  if (!st) return
  if (st.isSymbolicLink() || !st.isDirectory()) {
    try { await lim.run(() => fs.unlink(localPath)) } catch (e) { failed?.push(localPath); log.warn('unlink failed', localPath, e) }
    return
  }
  let children: string[] = []
  try { children = await fs.readdir(localPath) } catch (e) { log.warn('readdir failed', localPath, e) }
  await Promise.all(children.map(child => deleteLocalRecursive(path.join(localPath, child), failed, depth + 1, lim)))
  try { await lim.run(() => fs.rmdir(localPath)) } catch (e) { failed?.push(localPath); log.warn('rmdir failed', localPath, e) }
}

export async function deleteRemoteRecursive(
  session: SFTPSessionLike | null,
  remotePath: string,
  failed?: string[],
  depth = 0,
  limiter?: ConcurrencyLimiter,
): Promise<void> {
  if (depth > 100 || !session) {
    if (depth > 100) log.warn('deleteRemoteRecursive max depth at', remotePath)
    if (!session) failed?.push(remotePath)
    return
  }
  const lim = limiter ?? new ConcurrencyLimiter(DELETE_CONCURRENCY)
  const entries = await session.readdir(remotePath).catch(() => null)
  if (!entries) {
    try { await lim.run(() => session.unlink(remotePath)) } catch (e) { failed?.push(remotePath); log.warn('unlink failed', remotePath, e) }
    return
  }
  const tasks = (entries as SFTPFile[]).map(async (e) => {
    const childPath = e.fullPath || path.posix.resolve(remotePath, e.name)
    // ★ 2026-07-25：子树越界断言，防止恶意服务器用 fullPath 把删除指向目标目录之外
    const normParent = path.posix.resolve(remotePath)
    const normChild = path.posix.resolve(childPath)
    if (normChild !== normParent && !normChild.startsWith(normParent + '/')) {
      log.warn('delete skipped out-of-tree path:', childPath)
      failed?.push(childPath)
      return
    }
    // ★ 2026-07-25：不跟随符号链接，仅删除链接本身，避免越权删除目标树之外的文件
    if (e.isSymlink) {
      try { await lim.run(() => session.unlink(childPath)) } catch (e2) { failed?.push(childPath); log.warn('unlink failed', childPath, e2) }
      return
    }
    if (e.isDirectory) {
      // 目录递归不占槽，只在其内部叶子 IO 处限流
      try { await deleteRemoteRecursive(session, childPath, failed, depth + 1, lim) } catch { failed?.push(childPath) }
    } else {
      try { await lim.run(() => session.unlink(childPath)) } catch (e2) { failed?.push(childPath); log.warn('unlink failed', childPath, e2) }
    }
  })
  await Promise.all(tasks)
  try { await lim.run(() => session.rmdir(remotePath)) } catch (e) { failed?.push(remotePath); log.warn('rmdir failed', remotePath, e) }
}

/* ── 目录/文件复制 ────────────────────────────── */

/** 带重试的 copyFile：Windows 上文件可能被锁，自动重试 */
async function copyFileWithRetry(src: string, dest: string, maxRetries = 3): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.copyFile(src, dest)
      return
    } catch (e: any) {
      const isBusy = e?.code === 'EBUSY' || e?.code === 'EPERM'
      if (isBusy && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 100 * (i + 1)))
        continue
      }
      throw e
    }
  }
}

export async function copyLocalDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  for (const item of await fs.readdir(src, { withFileTypes: true })) {
    const srcP = path.join(src, item.name)
    const destP = path.join(dest, item.name)
    if (item.isSymbolicLink()) {
      log.warn('copyLocalDir: skipping symbolic link', srcP)
      continue
    }
    if (item.isDirectory()) {
      await copyLocalDir(srcP, destP)
    } else {
      await copyFileWithRetry(srcP, destP)
    }
  }
}

export interface RemoteCopyDeps {
  hasSession(): boolean
  mkdir(remotePath: string): Promise<void>
  readdir(remoteSrc: string): Promise<Array<{ name: string; isDirectory: boolean; isSymbolicLink?: boolean }>>
  /** 返回 boolean：true=完整成功；取消/暂停/失败=false */
  download(remotePath: string, localPath: string): Promise<boolean>
  upload(remotePath: string, localPath: string): Promise<boolean>
  /**
   * 可选：在远端主机上直接复制（如 SSH `cp`）。
   * 成功返回 true；不可用/失败返回 false，由 copyRemoteDir 回退到 download+upload。
   */
  tryServerCopy?(src: string, dest: string, isDir: boolean): Promise<boolean>
}

/** POSIX shell 单引号转义，安全嵌入路径 */
export function shellQuotePosix(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

/**
 * 经 SSH exec 在远端执行 `cp`（文件用 -p，目录用 -a）。
 * 成功返回 true；通道不可用、命令失败或非 POSIX 环境返回 false。
 */
export async function tryRemoteCpViaSsh(
  sshSession: unknown,
  src: string,
  dest: string,
  isDir: boolean,
): Promise<boolean> {
  if (!sshSession || !src || !dest || src === dest) return false
  // 拒绝明显危险的空字节，避免截断命令
  if (src.includes('\0') || dest.includes('\0')) return false
  const flag = isDir ? '-a' : '-p'
  const cmd =
    `cp ${flag} -- ${shellQuotePosix(src)} ${shellQuotePosix(dest)} ` +
    `&& printf 'SFTP_PLUS_CP_OK\\n' || printf 'SFTP_PLUS_CP_FAIL\\n'`
  try {
    const out = await execSshCommand(sshSession, cmd)
    if (/\bSFTP_PLUS_CP_OK\b/.test(out)) {
      log.info('Remote server-side cp OK:', src, '->', dest)
      return true
    }
    if (out) log.warn('Remote server-side cp failed:', src, '->', dest, out.trim())
    else log.warn('Remote server-side cp unavailable or empty response:', src, '->', dest)
  } catch (e) {
    log.warn('Remote server-side cp error:', src, '->', dest, e)
  }
  return false
}

/**
 * ★ 2026-08-11：经 SSH exec 在远端执行 `rm -rf` 整目录删除（服务端一次处理，
 *   无逐文件 SFTP 往返）。成功返回 true；通道不可用、非 POSIX 环境或命令失败返回
 *   false，由调用方回退 SFTP 并发递归删除。安全约束与 tryRemoteCpViaSsh 一致：
 *   拒绝空字节、单引号转义、`--` 防短横线参数注入；不带尾斜杠的 rm -rf 不会
 *   跟随符号链接（与逐文件路径的「只删链接本身」语义一致）。
 */
export async function tryRemoteRmViaSsh(sshSession: unknown, remotePath: string): Promise<boolean> {
  if (!sshSession || !remotePath) return false
  if (remotePath.includes('\0')) return false
  const cmd =
    `rm -rf -- ${shellQuotePosix(remotePath)} ` +
    `&& printf 'SFTP_PLUS_RM_OK\\n' || printf 'SFTP_PLUS_RM_FAIL\\n'`
  try {
    // 巨型目录服务端删除可能超过默认 12s，放宽到 60s
    const out = await execSshCommand(sshSession, cmd, 60000)
    if (/\bSFTP_PLUS_RM_OK\b/.test(out)) {
      log.info('Remote server-side rm OK:', remotePath)
      return true
    }
    if (out) log.warn('Remote server-side rm failed:', remotePath, out.trim())
    else log.warn('Remote server-side rm unavailable or empty response:', remotePath)
  } catch (e) {
    log.warn('Remote server-side rm error:', remotePath, e)
  }
  return false
}

/** ★ 2026-08-10 修复 #18：递归深度上限，防止恶意/异常目录结构导致无限递归栈溢出 */
const REMOTE_COPY_MAX_DEPTH = 64

export async function copyRemoteDir(
  src: string,
  dest: string,
  isDir: boolean,
  deps: RemoteCopyDeps,
  depth = 0,
): Promise<void> {
  if (!deps.hasSession()) return
  if (depth > REMOTE_COPY_MAX_DEPTH) {
    throw new Error('Remote copy exceeded max depth: ' + src)
  }

  // ★ 优先服务端直接复制：同机 remote→remote 不应再本地下载再上传
  if (deps.tryServerCopy) {
    try {
      if (await deps.tryServerCopy(src, dest, isDir)) return
    } catch (e) {
      log.warn('tryServerCopy threw, fallback to download+upload:', e)
    }
  }

  if (!isDir) {
    // ★ 2026-07-25：S3 修复——用 randomUUID 专属子目录代替可预测的 `sftp-copy-${Date.now()}-...` 文件名，
    //   防止多用户共享主机上的 TOCTOU 符号链接攻击（攻击者预建同名 symlink 指向受害者敏感文件）。
    const tmpDir = await fs.mkdir(path.join(os.tmpdir(), `sftp-copy-${randomUUID()}`), { recursive: true })
    const tmpFile = path.join(tmpDir, path.basename(src))
    try {
      // ★ 2026-08-10：传输未完整成功时抛错，避免把半截文件复制成新文件还误报成功
      const dlOk = await deps.download(src, tmpFile)
      if (!dlOk) throw new Error('Remote copy download incomplete: ' + src)
      const upOk = await deps.upload(dest, tmpFile)
      if (!upOk) throw new Error('Remote copy upload incomplete: ' + dest)
    } finally {
      try { await fs.unlink(tmpFile) } catch {}
      try { await fs.rmdir(tmpDir) } catch {}
    }
    return
  }
  await deps.mkdir(dest)
  const entries = await deps.readdir(src)
  for (const entry of entries) {
    // ★ 2026-08-10 修复 #18：跳过符号链接条目，防止指向上级目录的 symlink 造成循环递归/路径穿越
    if (entry.isSymbolicLink) {
      log.warn('copyRemoteDir skip symlink entry:', path.posix.join(src, entry.name))
      continue
    }
    const srcP = path.posix.join(src, entry.name)
    const destP = path.posix.join(dest, entry.name)
    if (entry.isDirectory) {
      await copyRemoteDir(srcP, destP, true, deps, depth + 1)
    } else {
      await copyRemoteDir(srcP, destP, false, deps, depth + 1)
    }
  }
}

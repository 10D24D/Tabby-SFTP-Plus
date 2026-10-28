/**
 * 本地/远程文件系统操作：递归删除 + 目录/文件复制
 * @创建人：DD1024z + Auto(未确认底层模型)
 * @创建时间：2026-07-25
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-13 — P1 修复：copyRemoteDir 的条目名净化改用 **safeRemoteEntryName**
 *              （纯远端口径）。原用 safeEntryName——它套用 Windows 落地规则（保留名/尾随点
 *              空格/含 \），`CON`、`file `、`a\b` 等 Linux 合法名在 Windows 客户端上被
 *              **静默跳过**：复制完成后文件「少了几个」且无任何提示，行为还随客户端平台变化。
 *              2026-09-21 — 递归删除每一层均探测 symlink，避免子目录链接被跟随；
 *              第六轮审计 P2 修复：deleteRemoteRecursive 顶层 symlink 探测补 russh 数字 type=2
 *              2026-09-20 — 远程删除顶层 symlink 只 unlink；rm -rf 规范化危险路径；isPathInside 只比 resolve；copyRemoteDir 净化名与 symlink 字段
 *              2026-07-25 — 子树越界断言、不跟随子项 symlink
 */
import { randomUUID } from 'crypto'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import type { SFTPFile, SFTPSessionLike } from '../../services/sftp.service'
import { execSshCommand, safeRemoteEntryName } from './path-utils'
import { ConcurrencyLimiter } from './concurrency'

import { log } from '../../services/sftp-logger'

/**
 * ★ 2026-09-14 issue #17 修复：判断 child 是否落在 parent 之内（含相等）。
 * 用于复制守卫，避免「把目录复制到自身或其子目录」导致无限递归
 * （如 cp -a /a /a/a 在 BusyBox 上会无限循环 data3t/data3t/data3t/…）。
 * @param posix true=远程 POSIX 路径；false=本地 OS 路径
 *
 * ★ 2026-09-20：删除「parent.includes('..') → false」捷径——未折叠的 parent=/tmp/../data
 *   在 resolve 后 child 实际在内时会被误判为「不在内部」，自复制守卫失效。
 *   一律先 resolve 再比较；Windows 本地路径大小写不敏感。
 *
 * ★ 2026-10-12 P2 修复：**盘符根 / 文件系统根失效**。
 *   原实现 `normChild.startsWith(norm + sep)`：当 parent 是根目录时
 *   resolve 结果**已以分隔符结尾**（Windows `D:\`、POSIX `/`），
 *   再拼一个 sep 就变成 `D:\\` / `//`，而 child 的规范形式是 `D:\x`
 *   ⇒ 永远不匹配 ⇒ **根目录下的一切都被判为「不在内部」**。
 *   实测（path.win32）：parent='D:\' + child='D:\x' → false（应为 true）。
 *   后果：把目录复制到 `D:\` 根时自复制守卫完全失效 → 递归自复制直到
 *   **写满整个磁盘**（用户侧表现为磁盘被莫名填满）。
 *   根治：根目录**不追加**分隔符（它本来就有），非根才追加。
 *   判断方式：标准化后末字符已是分隔符即视为根。
 */
export function isPathInside(parent: string, child: string, posix = false): boolean {
  let norm = posix ? path.posix.resolve(parent) : path.resolve(parent)
  let normChild = posix ? path.posix.resolve(child) : path.resolve(child)
  if (!posix && process.platform === 'win32') {
    norm = norm.toLowerCase()
    normChild = normChild.toLowerCase()
  }
  if (normChild === norm) return true
  const sep = posix ? '/' : path.sep
  // ★ 根目录规范化后已自带尾分隔符，再拼 sep 会变成 "D:\\" / "//" 而永远不匹配
  const prefix = norm.endsWith(sep) ? norm : norm + sep
  return normChild.startsWith(prefix)
}

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
  // ★ 2026-10-12 P2 修复：lstat 失败时**不得静默 return**。
  //   原实现 `const st = await fs.lstat(...).catch(() => null); if (!st) return` —— 这里
  //   确实无法区分「文件已不存在」与「无权限 / EBUSY（Windows 独占锁定）/ ELOOP」。
  //   静默 return 会让上层拿到「零个失败项」⇒ 弹窗显示删除成功、状态栏清空，
  //   但文件**原封不动躺在那里**，用户反复点删除永远「成功」（最典型的假成功投诉）。
  //   根治：把探测失败也记进 failed，让上层如实告知「部分项未删除」。
  const st = await fs.lstat(localPath).catch((e) => {
    failed?.push(localPath)
    log.warn('lstat failed (counted as failure):', localPath, e)
    return null
  })
  if (!st) return
  if (st.isSymbolicLink() || !st.isDirectory()) {
    try { await lim.run(() => fs.unlink(localPath)) } catch (e) { failed?.push(localPath); log.warn('unlink failed', localPath, e) }
    return
  }
  let children: string[] = []
  // ★ 2026-10-12：readdir 失败原先只记日志、**不记 failed**，随后仍会去 rmdir ——
  //   而 EACCES 下 rmdir 必然也失败（最终会记 failed），但若是「读到了部分内容、
  //   某个子项权限不足」的场景，readdir 抛错后 children 为空数组 → 直接 rmdir 整个目录
  //   → 非空目录 rmdir 失败 → 才落到 failed。看似能覆盖，实则**依赖下层恰好也失败**，
  //   属于偶然正确。根治：readdir 失败立即记 failed 并**跳过 rmdir**（内容未清空，
  //   此时 rmdir 只会产生一条误导性的 "rmdir failed" 日志）。
  try {
    children = await fs.readdir(localPath)
  } catch (e) {
    failed?.push(localPath)
    log.warn('readdir failed (counted as failure, skip rmdir):', localPath, e)
    return
  }
  // ★ 2026-10-25 BUG-M3 修复：Promise.all 任一子目录删除失败都会直接抛异常，
  //   导致后续 rmdir 不执行，且其它子目录的删除结果也拿不到。
  //   改为对每个子任务单独 catch，与 deleteRemoteRecursive 保持一致。
  await Promise.all(children.map(async child => {
    const childPath = path.join(localPath, child)
    try {
      await deleteLocalRecursive(childPath, failed, depth + 1, lim)
    } catch (e) {
      failed?.push(childPath)
      log.warn('delete child failed', childPath, e)
    }
  }))
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

  // 每一层都必须在 readdir 前识别 symlink。仅依赖父目录 listing 的 isSymlink
  // 会在服务端元数据缺失时把 symlink→dir 当目录递归，清空链接目标树。
  {
    try {
      const lstat = (session as any).lstat
      const readlink = (session as any).readlink
      // stat 会跟随链接，不能作为删除前的安全探测。两种不跟随链接的 API 都不可用时
      // 保守拒绝递归，避免把 symlink→dir 的目标树当成当前目录删除。
      if (typeof lstat !== 'function' && typeof readlink !== 'function') {
        log.warn('deleteRemoteRecursive refused: no lstat/readlink support:', remotePath)
        failed?.push(remotePath)
        return
      }
      const st: any = typeof lstat === 'function'
        ? await lstat.call(session, remotePath).catch(() => null)
        : null
      if (!st && typeof readlink !== 'function') {
        log.warn('deleteRemoteRecursive refused: symlink probe failed:', remotePath)
        failed?.push(remotePath)
        return
      }
      const isLink = !!(st && (
        st.isSymbolicLink === true ||
        (typeof st.isSymbolicLink === 'function' && st.isSymbolicLink()) ||
        st.isSymlink === true ||
        // ★ 2026-09-21 P2 修复：补 russh 数字 type 枚举（2=符号链接）——此前只认字符串
        //   'symbolic-link'，russh 环境下漏判，只能靠 readlink 兜底（不可用时对
        //   symlink→dir 会 readdir 跟随并清空目标树）
        st.type === 2 ||
        (st.attrs && (st.attrs.isSymlink || st.attrs.type === 'symbolic-link' || st.attrs.type === 2))
      ))
      // 无可靠 lstat 时：readdir 对普通文件会失败再 unlink；对 symlink→dir 仍危险。
      // 另试 readlink：成功则必为链接，只删链接本身。
      if (!isLink && typeof readlink === 'function') {
        try {
          await readlink.call(session, remotePath)
          // readlink 成功 ⇒ 是符号链接
          try { await lim.run(() => session.unlink(remotePath)) } catch (e) {
            failed?.push(remotePath); log.warn('unlink symlink failed', remotePath, e)
          }
          return
        } catch { /* 不是链接或 readlink 不可用 */ }
      }
      if (isLink) {
        try { await lim.run(() => session.unlink(remotePath)) } catch (e) {
          failed?.push(remotePath); log.warn('unlink symlink failed', remotePath, e)
        }
        return
      }
    } catch (e) {
      log.warn('deleteRemoteRecursive symlink probe failed:', remotePath, e)
    }
  }

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

/** ★ 2026-09-14 issue #17 修复 #18：递归深度上限，防止异常目录结构 / 自包含复制导致无限递归 */
const LOCAL_COPY_MAX_DEPTH = 64

export async function copyLocalDir(src: string, dest: string, depth = 0): Promise<void> {
  // ★ 2026-09-14 issue #17：拒绝「目标落在源目录之内」（如把 /a 复制到 /a/a），
  //   否则会无限递归 data3t/data3t/data3t/…，最终栈溢出或磁盘写满。
  if (isPathInside(src, dest, false)) {
    throw new Error('Cannot copy a directory into itself or its subdirectory: ' + src)
  }
  if (depth > LOCAL_COPY_MAX_DEPTH) {
    throw new Error('Local copy exceeded max depth: ' + src)
  }
  await fs.mkdir(dest, { recursive: true })
  for (const item of await fs.readdir(src, { withFileTypes: true })) {
    const srcP = path.join(src, item.name)
    const destP = path.join(dest, item.name)
    if (item.isSymbolicLink()) {
      log.warn('copyLocalDir: skipping symbolic link', srcP)
      continue
    }
    if (item.isDirectory()) {
      await copyLocalDir(srcP, destP, depth + 1)
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
/**
 * POSIX shell 路径/参数转义。
 *
 * ★ 2026-10-12 P2 修复：原实现无条件依赖远端有 `base64` 命令：
 *   `"$(echo '<b64>' | base64 -d)"`。而**精简镜像（BusyBox / Alpine / 部分国产系统）
 *   常不带 base64**，此时 shell 内 `base64 -d` 报 command not found、替换结果为空串
 *   ⇒ 命令变成 `cp -a -- "" ""` ⇒ 静默「成功」却什么也没复制（用户看不到任何报错），
 *   或更糟：空参数被某些 cp 解释成当前目录。
 *
 * 根治：按可用性选择策略 —— ① 有 base64 时沿用原方案（最彻底）；
 *   ② 无 base64 时回退到**纯 POSIX 单引号转义**（POSIX sh 语法内建、零外部依赖）：
 *   把 `'` 写成 `'\''`（结束-转义-重开），这能覆盖 `& | ; $ \` ( ) < > * ? ! # ~` 等
 *   **全部** shell 元字符，安全性与 base64 方案等价。
 *
 * 说明：单引号方案无法防御「新命令行注入」以外的场景—— 但这里传入的是**已有文件名**，
 *   不含我们无法表示的内容；真正的风险是元字符展开，单引号已完全覆盖。
 */
/**
 * ★ 2026-10-12：远端 base64 可用性缓存（**声明必须在使用之前**，否则 TDZ 报错）。
 *
 * 默认「不可用」是刻意的**保守默认**：误判「可用」会让 base64 -d 失败、替换结果为空串
 * （命令变成 cp -a -- "" ""，静默什么都没做）；误判「不可用」只是退回同样安全的
 * 单引号转义方案。探测一次即锁定，避免每条远程命令都多一次 exec 往返。
 */
let _remoteHasBase64 = false
let _remoteBase64Probed = false

export function shellQuotePosix(value: string): string {
  // ① 空值早退：避免产出 `''` 之外的歧义
  if (value === '') return "''"
  // ② base64 方案：能力可用时最彻底（单行、无任何 shell 展开）
  if (_remoteHasBase64) return `"$(echo '${Buffer.from(value).toString('base64')}' | base64 -d)"`
  // ③ 纯 POSIX 单引号转义（零外部依赖）：内部 ' → '\''
  return `'${value.replace(/'/g, "'\\''")}'`
}

/**
 * 探测远端是否具备 base64 命令（在首个真正需要转义的远程命令执行前调一次）。
 *
 * ★ 2026-10-12：探测结果一旦确定即**永久锁定**（_remoteBase64Probed），
 *   避免每条远程命令都多一次 exec 往返 —— 与本项目 digest 服务的 remoteBin 探测同范式。
 *   判定的保守方向见 _remoteHasBase64 的声明处注释。
 *
 * @param exec 远程命令执行器。**两种形态都支持**（供不同调用方使用）：
 *   ① (cmd, timeoutMs?, opts?) => Promise<string> —— tar 通道只有 deps.exec、拿不到 ssh 对象；
 *   ② sshSession 对象 —— fs-ops 自己的 cp / rm 走 execSshCommand。
 */
export async function probeRemoteBase64(
  source: unknown,
): Promise<void> {
  if (_remoteBase64Probed) return
  const PROBE = 'command -v base64 2>/dev/null'
  try {
    let out: string | null = null
    if (typeof source === 'function') {
      out = await (source as (c: string, t?: number) => Promise<string>)(PROBE, 8000)
    } else if (source && typeof source === 'object') {
      out = await execSshCommand(source as any, PROBE, 8000, { retryOnEmpty: true })
    } else {
      return // 拿不到执行器：保持「不可用」的保守默认，不锁定
    }
    _remoteHasBase64 = !!(out && String(out).trim())
    if (!_remoteHasBase64) {
      log.info('[shell-quote] remote has no base64, falling back to POSIX single-quote escaping')
    }
    _remoteBase64Probed = true
  } catch {
    _remoteHasBase64 = false
    _remoteBase64Probed = true
  }
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
  // ★ 2026-09-14 issue #17：拒绝「目标落在源目录之内」的请求（如 cp -a /a /a/a）。
  //   BusyBox 的 cp 无自我包含检测，会无限递归 data3t/data3t/data3t/… 直到磁盘写满；
  //   即便 GNU cp 会自我保护，这种复制也无意义，直接拒绝让上层回退/报错。
  if (isPathInside(src, dest, true)) {
    log.warn('Remote server-side cp refused: dest is inside src (would recurse):', src, '->', dest)
    return false
  }
  // 拒绝明显危险的空字节，避免截断命令
  if (src.includes('\0') || dest.includes('\0')) return false
  const flag = isDir ? '-a' : '-p'
  // ★ 2026-10-12：首次使用前探测 base64（缺失则 shellQuotePosix 自动回退单引号转义）
  await probeRemoteBase64(sshSession)
  const cmd =
    `cp ${flag} -- ${shellQuotePosix(src)} ${shellQuotePosix(dest)} ` +
    `&& printf 'SFTP_PLUS_CP_OK\\n' || printf 'SFTP_PLUS_CP_FAIL\\n'`
  try {
    // ★ 2026-09-14 F2：cp 非幂等——首次成功而标记丢失时空输出重放会把 src 复制进已存在的 dest（嵌套副本），禁用重试
    const out = await execSshCommand(sshSession, cmd, 12000, { retryOnEmpty: false })
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
 *   false，由调用方回退 SFTP 并发递归删除。
 * ★ 2026-09-20：危险路径先 posix.resolve 再判（防止 /. /tmp/.. 绕过）；命令强制无尾斜杠
 *   （带尾斜杠的 rm -rf link/ 常跟随 symlink 清空目标内容，与「只删链接」语义相悖）。
 */
export async function tryRemoteRmViaSsh(sshSession: unknown, remotePath: string): Promise<boolean> {
  if (!sshSession || !remotePath) return false
  if (remotePath.includes('\0')) return false
  const resolved = path.posix.resolve(remotePath.replace(/\/+$/, '') || '/')
  if (
    resolved === '/' ||
    resolved === '.' ||
    resolved === '..' ||
    resolved.length < 2
  ) {
    log.warn('Remote server-side rm refused dangerous path:', remotePath, '→', resolved)
    return false
  }
  const banned = new Set(['/bin', '/boot', '/dev', '/etc', '/lib', '/lib64', '/proc', '/root', '/sbin', '/sys', '/usr', '/var', '/home', '/Users'])
  if (banned.has(resolved)) {
    log.warn('Remote server-side rm refused system path:', remotePath, '→', resolved)
    return false
  }
  // 深度过浅（仅一层，如 /tmp）也拒绝 SSH 快删，回退受限 SFTP
  const depth = resolved.split('/').filter(Boolean).length
  if (depth < 2) {
    log.warn('Remote server-side rm refused shallow path:', remotePath, '→', resolved)
    return false
  }
  // ★ 2026-10-12：探测 base64（缺失则 shellQuotePosix 自动回退单引号转义）
  await probeRemoteBase64(sshSession)
  const cmd =
    `rm -rf -- ${shellQuotePosix(resolved)} ` +
    `&& printf 'SFTP_PLUS_RM_OK\\n' || printf 'SFTP_PLUS_RM_FAIL\\n'`
  try {
    // 巨型目录服务端删除可能超过默认 12s，放宽到 60s
    // ★ 2026-10-13 P2：超时改为 reject（onTimeout:'reject'）——60s 到点时服务端那条
    //   rm -rf 很可能仍在运行。若按原来的"静默 resolve"处理，out 为空串会被当成
    //   "命令失败"，进而触发 SFTP 逐文件递归重删，与还在跑的服务端删除并发操作同一目录。
    const out = await execSshCommand(sshSession, cmd, 60000, { onTimeout: 'reject' })
    if (/\bSFTP_PLUS_RM_OK\b/.test(out)) {
      log.info('Remote server-side rm OK:', resolved)
      return true
    }
    if (out) log.warn('Remote server-side rm failed:', resolved, out.trim())
    else log.warn('Remote server-side rm unavailable or empty response:', resolved)
  } catch (e) {
    log.warn('Remote server-side rm error:', resolved, e)
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
  // ★ 2026-09-14 issue #17：拒绝「目标落在源目录之内」（如把 /a 复制到 /a/a）。
  //   既防止无自我检测能力的服务端 cp 无限递归，也避免下载+上传回退路径产生无意义的嵌套副本。
  if (isPathInside(src, dest, true)) {
    throw new Error('Cannot copy a directory into itself or its subdirectory: ' + src)
  }
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
    //
    // ★ 2026-10-12 P2 修复：暂存目录**不再是固定 os.tmpdir()**。
    //   Windows 上 os.tmpdir() 几乎总是 C 盘，而用户的目标常在 D 盘 —— 于是
    //   「下载到 C 盘临时目录 → 上传到 D 盘目标」跨盘，虽不报错但要多走一遍全量读写；
    //   更现实的风险是系统盘空间不足（几个 GB 的文件直接下载失败，而 D 盘还很空）。
    //   根治：复用 tar-channel 的 resolveStagingRoot（目标父目录下的隐藏目录，
    //   同盘同文件系统；目录不可写时才回退系统临时目录，行为与旧版一致）。
    // ★ 2026-10-13 P2 修复：**撤销**上一版把「远端路径」喂给本地暂存解析器的做法。
    //   copyRemoteDir 走的是「下载→上传」过路复制，src/dest 都是 **POSIX 远端路径**，
    //   而 `path.dirname(dest)` 在 Windows 上按 win32 规则处理 `/home/user/f` 得到
    //   `/home/user`，再 path.join 出 `\\home\\user\\.sftp-plus-tmp\\…` ⇒ 变成**盘符相对
    //   路径**（C:\home\user\…），多半 EPERM 后静默回退；在 POSIX 主机上更糟——若本地恰好
    //   存在同名目录，就会**真的在落盘创建** `/home/user/.sftp-plus-tmp`（污染）。
    //   「同盘暂存」铁律的前提是「目标是本地路径」，本分支根本不适用：数据只是过路客户端，
    //   没有"与目标同盘"的收益。这里显式用系统临时目录（**明文例外**，理由见上）。
    const stagingRoot = os.tmpdir()
    const tmpDir = path.join(stagingRoot, `sftp-copy-${randomUUID()}`)
    await fs.mkdir(tmpDir, { recursive: true })
    // ★ 远端名一律按 POSIX 取基名（win32 的 basename 遇到反斜杠名会切错）
    const tmpFile = path.join(tmpDir, path.posix.basename(src))
    try {
      // ★ 2026-08-10：传输未完整成功时抛错，避免把半截文件复制成新文件还误报成功
      const dlOk = await deps.download(src, tmpFile)
      if (!dlOk) throw new Error('Remote copy download incomplete: ' + src)
      const upOk = await deps.upload(dest, tmpFile)
      if (!upOk) throw new Error('Remote copy upload incomplete: ' + dest)
    } finally {
      try { await fs.unlink(tmpFile) } catch {}
      // 只删本次专属子目录；暂存根非空（并发任务在用）时 rmdir 会失败，静默保留
      try { await fs.rmdir(tmpDir) } catch {}
    }
    return
  }
  await deps.mkdir(dest)
  const entries = await deps.readdir(src)
  for (const entry of entries) {
    // ★ 2026-09-20：同时认 isSymlink / isSymbolicLink（适配器曾只写后者导致守卫失效）
    if (entry.isSymbolicLink || (entry as any).isSymlink) {
      log.warn('copyRemoteDir skip symlink entry:', path.posix.join(src, entry.name))
      continue
    }
    // ★ 2026-10-13 P1 修复：远程→远程复制改用 **safeRemoteEntryName**（只拒绝对远端
    //   真正危险的成分）。原先用 safeEntryName——它套用 Windows 落地规则（保留名/尾随点
    //   空格/含 \），导致 `CON`、`file `、`a\b` 等 Linux 合法名在 Windows 客户端上被
    //   **静默跳过**（复制完文件少几个、无提示，且行为随客户端平台变化）。
    const safeName = safeRemoteEntryName(entry.name)
    if (!safeName) {
      log.warn('copyRemoteDir skip unsafe entry name:', entry.name)
      continue
    }
    const srcP = path.posix.join(src, safeName)
    const destP = path.posix.join(dest, safeName)
    if (entry.isDirectory) {
      await copyRemoteDir(srcP, destP, true, deps, depth + 1)
    } else {
      await copyRemoteDir(srcP, destP, false, deps, depth + 1)
    }
  }
}

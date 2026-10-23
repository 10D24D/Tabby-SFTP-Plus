/**
 * 功能描述：SFTP+ 本地暂存区解析（优先与目标/源目录同盘）
 * @创建人：DD1024z + Space Bunny
 * @创建时间：2026-10-12 — 从 tar-channel.ts 提取为独立模块
 *
 * ★ 为什么独立成模块（而不是让 fs-ops.ts 直接 import tar-channel）：
 *   tar-channel.ts 会 import fs-ops.ts（shellQuotePosix），若 fs-ops 再反向 import
 *   tar-channel 就构成**循环依赖** —— webpack/ESM 下模块初始化顺序变得不确定，
 *   表现为「某些路径下 stagingRoot 为 undefined」这类偶发故障。
 *   本模块只依赖 fs / path / os / log，不依赖任何业务模块 ⇒ 单向依赖，无环。
 */

import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import { log } from '../../services/sftp-logger'

/**
 * ★ 2026-09-26 原始常量：暂存区目录名 —— 放目标/源目录下的**隐藏目录**。
 * 与 tar-channel.ts 的同名常量是同一个值（原为私有；提取后各自定义，
 * 改动时**两处必须同步**，否则临时目录会散落在不同位置）。
 */
export const STAGING_DIR_NAME = '.sftp-plus-tmp'

/**
 * ★ 2026-09-26：本地暂存区 —— **优先与目标同盘**。
 *
 * 原实现一律用 `os.tmpdir()`，在 Windows 上通常是 C 盘，而用户目标常在 D 盘，于是：
 *   ① 收尾把解包结果搬进目标目录时跨盘 —— `fs.rename` 抛 EXDEV，退化成 `fs.cp` **全量复制一遍**
 *      （用户「传输完成后还要迁移文件、又需要时间」的直觉正是这一步）；
 *   ② 大目录下载要临时占用**系统盘**等量空间，几个 GB 就危险。
 * 放到「目标父目录 / 源父目录下的隐藏目录」= 同盘同文件系统，收尾 rename 只是改 inode（零拷贝），
 * 也不占用系统盘。目录不可写（只读盘/权限受限）时回退系统临时目录，行为与旧版一致。
 *
 * 注：位置**不影响传输速度**（瓶颈在网络），只影响收尾迁移这一步 —— 这是它唯一的作用。
 *
 * ★ 2026-10-12：改为 **export** —— fs-ops.ts 的 copyRemoteDir 此前自己写死 os.tmpdir()
 *   （Windows 上是 C 盘），与本函数的同盘原则相悖。现统一复用，避免第三套实现再次跑偏。
 */
export async function resolveStagingRoot(nearDir: string): Promise<string> {
  const candidate = path.join(nearDir, STAGING_DIR_NAME)
  try {
    await fs.mkdir(candidate, { recursive: true })
    return candidate
  } catch (e) {
    // ★ 2026-09-26：内联错误详情（Tabby 文件日志只写首参，多参数会被丢弃）
    log.warn(`tar channel: staging dir unusable near target, falling back to system temp: ${candidate} :: ${String((e as Error)?.message ?? e)}`)
    return os.tmpdir()
  }
}

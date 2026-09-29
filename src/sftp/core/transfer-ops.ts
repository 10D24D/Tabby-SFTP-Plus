/**
 * 功能描述：SFTP+ transfer-ops 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-09-29 — ★★ 修复「仅 TAR 模式下上传目录仍走 SFTP」（用户实测质问：「不是已经
 *              开启了仅 TAR 模式吗？怎么还是有走 SFTP 模式？」）。根因＝上传侧缺对称入口：
 *              「目录冲突 → 覆盖」落在 MergeLocalDirUseCase（纯逐文件 uploadRaw），打包通道
 *              拿不到机会，于是仅 TAR 下选了覆盖依旧 ⇄SFTP，而提示偏偏写着「选覆盖即可打包」。
 *              ⇒ ① MergeLocalDirPorts 新增 tarChannel / tarChannelMode(getter) /
 *                   checkRemotePathExists；execute 在 mkdir 与建进度条目**之前**先调
 *                   _tryTarUpload：success → 直接返回 true（严禁再跑一遍逐文件，否则重传整棵树）、
 *                   failed → 直接返回 false（仅 TAR 硬失败，绝不偷偷回退）、null → 继续逐文件合并。
 *                 ② 缺任一端口就不试（尤其缺「目标是否存在」探测时禁止硬试：目标恰好已存在会把
 *                   整目录嵌套进目标里）。reuseLogEntryId 原样透传给打包通道，避免「一条失败
 *                   记录 + 一条成功 TAR 记录」。
 *                 ③ 修正 notifyTarOnlyInapplicable 的文档前提（上传侧那句解题现在才成立）。
 *              2026-09-29 — ★★ 新增「多选批量上传」用例 UploadBatchUseCase（用户提议：多选一批
 *              文件（可含文件夹）其实也能走一个 tar 归档）。此前多选被拆成 N 个独立任务
 *              （面板 ctxUpload 与 drop 两处都是 items.map(streamUploadOne)）：文件夹各自打包、
 *              散装文件恒走逐文件 → 「一次选一批小文件」完全用不上打包通道。
 *              本用例只做**路由前置判定**（真正的打包逻辑在 tar 通道内）：
 *                模式非 sftpOnly、≥2 项、**同一父目录**、远端**全部目标不存在**；
 *              任一不满足即返回 'fallback'，调用方原样跑既有逐项流程。
 *              保守版刻意的取舍：只要有一项目标已存在就整批交回逐项流程 —— 那套流程会照旧
 *              弹冲突框、照旧逐项处理，本用例完全不碰冲突语义（批量冲突框留待下一轮）。
 *              2026-09-29 — 仅 TAR 模式下「打包通道不适用」不再静默：新增模块级
 *              notifyTarOnlyInapplicable()，在「目标已存在 → 只能走逐文件增量」的两处分支
 *              （目录下载 targetExists、目录上传远端目标已存在）触发说明性提示（含解法）。
 *              此前这两条路径只写日志，用户只看到传输记录标着 ⇄SFTP，无从判断是
 *              「设置没生效」还是「本次不适用」（用户实测质问）。
 *              2026-09-28 — 目录上传/下载调用 tryUploadDir/tryDownloadDir 时传入 ports.tarChannelMode（传输通道模式）。
 *              2026-09-26 — 目录下载的「行级实时进度」：目录内单文件改走 downloadRaw 的
 *              `onProgress`，节流后把「已完成字节 + 在途字节峰值之和」上报给目录条目。
 *              此前只有文件传完才上报一次，大文件传输期间整行完全静止 = 用户侧
 *              「似乎又完全不会动了」；零字节的空窗口也要照常上报，面板靠它识别停摆
 *              （见 FOLDER_LIVE_PROGRESS_MS）。在途量记在 **ctx.liveBytes**（按本地路径），
 *              且**实时上报与收口上报都要带上它** —— 少一处就会在并发收口瞬间把整行拉回去
 *              （产物探针实测 74,900,000 → 73,300,000）
 *              2026-09-21 — P1 修复：UploadPathUseCase 补 catch —— listChildren 抛异常时 success 仍为
 *              初值 true，finally 会把压根没传成的目录 finish(ctx, true) 记成「成功」
 *              2026-09-21 — 目录下载逐项探测符号链接，避免服务端 listing 漏标时跟随目录链接；
 *              第六轮审计 P1 修复：MergeLocalDirUseCase 补 catch（listChildren/lstat 异常不再
 *              误报成功）；_uploadDirectory 的 listChildren 挪进 try 块（异常时进度条目不再永久僵尸）
 *              2026-09-17 — 目录冲突：本地大小用递归扫描结果，不再用 inode 的 Stats.size（常为 0）
 * 修改时间：2026-08-02 — B18：下载用例兼容 modified 为 Date/number/string 及 mtime 秒单位，避免远程修改时间被解析成 1970-01-01；B19 增加 sftp.stat 兜底与 attrs 嵌套字段解析；B24：目录冲突优先信任 readdir/payload 的 modified，stat 仅兜底且过滤 epoch 无效时间
 * 合并来源：download-use-cases, upload-use-cases
 */

import * as path from 'path'

import { type Stats } from 'fs'

import { type FolderTransferCtx } from './panel-types'

import { type SFTPFile } from '../../services/sftp.service'

import { safeEntryName } from './path-utils'

import { parseRemoteMtime } from './conflict'

import { ConcurrencyLimiter, clampDirConcurrency } from './concurrency'

// ★ 2026-09-25：目录级失败也内联错误详情（Tabby 文件日志只写首参，多参数会被丢弃）
import { errText } from './transfer-adapters'

import { type DownloadOnePort, type FolderTransferPort, type RemoteDirStatsPort, type SftpDirEntry, type TarChannelPort, type TarChannelResult, type TransferUseCasePorts, type LocalTransferFsPort, type SftpTransferPort, type TransferExecutionPort } from './transfer-types'


import { log } from '../../services/sftp-logger'

/** 统一把 SFTPFile / readdir 条目的 modified/mtime 转成毫秒时间戳。
 *  兼容 runtime 中 modified 可能是 Date/number/string 的情况（拖拽 payload、某些 SFTP 后端）。
 *  SFTP 协议 mtime 为秒，数值小于 1e10 时乘 1000（1e10 秒≈2286 年，足够区分秒/毫秒）。
 *  注意：缺失/无效时返回当前时间，仅作占位；需要判断真值请用 entryMtimeToMsOrUndefined。 */
function entryMtimeToMs(e: { modified?: Date | number | string | null; mtime?: number | null; attrs?: { mtime?: number; modified?: Date | number | string } }): number {
  return entryMtimeToMsOrUndefined(e) ?? Date.now()
}

/** Unix epoch 阈值：小于此值的毫秒时间戳视为 1970-01-01 附近的无效时间 */
const EPOCH_THRESHOLD_MS = 86400000

/**
 * ★ 2026-09-26：目录内单文件「字节级进度」上报给目录条目的节流间隔（ms）。
 *
 *   原先目录条目只在**文件传完**时上报一次，于是单个大文件传输期间整行（百分比 / 速度 /
 *   当前文件 / 剩余时间）完全静止 —— 用户看到的就是「这次似乎又完全不会动了」。
 *   现在由 `downloadRaw` 的 `onProgress` 把本文件已落盘字节喂过来，按此间隔节流后上报。
 *
 *   取值对齐上游节奏：接口层 400ms 轮询（面板 _doDownloadRaw）＋面板 500ms 速度窗口，
 *   节流比 400ms 略小，保证每个窗口都能拿到新样本，又不会高频 detectChanges。
 *
 *   ⚠ 即使本文件**没有**新字节也要照常上报（值为上次的末值）：面板正是靠这些空窗口
 *     发现「连续零推进」并把速度如实置成 `0 B/s`（见 SPEED_STALL_ZERO_MS）。
 */
const FOLDER_LIVE_PROGRESS_MS = 350

/** 判断毫秒时间戳是否落在 Unix epoch 附近（通常表示服务器未返回有效修改时间） */
function isEpoch1970(ms: number): boolean {
  return !Number.isFinite(ms) || ms < EPOCH_THRESHOLD_MS
}

/** 同 entryMtimeToMs，但无效/Epoch 时间返回 undefined，方便调用方判断"是否拿到真值"。 */
function entryMtimeToMsOrUndefined(e: { modified?: Date | number | string | null; mtime?: number | null; attrs?: { mtime?: number; modified?: Date | number | string } }): number | undefined {
  const rawModified = e.modified ?? e.attrs?.modified
  if (rawModified instanceof Date) {
    const t = rawModified.getTime()
    return isEpoch1970(t) ? undefined : t
  }
  if (typeof rawModified === 'number' && Number.isFinite(rawModified)) {
    const ms = rawModified < 1e10 ? rawModified * 1000 : rawModified
    return isEpoch1970(ms) ? undefined : ms
  }
  if (typeof rawModified === 'string') {
    const d = new Date(rawModified).getTime()
    if (Number.isFinite(d) && !isEpoch1970(d)) return d
  }
  const rawMtime = e.mtime ?? e.attrs?.mtime
  if (rawMtime != null) {
    const n = Number(rawMtime)
    if (Number.isFinite(n)) {
      const ms = n < 1e10 ? n * 1000 : n
      return isEpoch1970(ms) ? undefined : ms
    }
  }
  return undefined
}

/** 中止/暂停门控（目录上传/下载共用）：中止检查 → 等暂停 → 复查中止。
 *  返回 false 表示已中止，任务不应启动。目录/文件共用。 */
async function dirGate(
  folder: TransferUseCasePorts['folder'],
  ctx: FolderTransferCtx | undefined,
): Promise<boolean> {
  if (!ctx) return true
  if (folder.isAborted(ctx)) return false
  await folder.waitWhilePaused(ctx)
  if (folder.isAborted(ctx)) return false
  return true
}

/** 文件任务门控：中止/暂停检查 + 占槽执行。
 *  ★ 目录任务绝不能用本函数：目录持槽等待子项会形成 hold-and-wait，
 *  嵌套层数 ≥ 并发数时槽位被目录占满，文件任务永远拿不到槽 → 死锁卡死。 */
async function gatedDirTask(
  folder: TransferUseCasePorts['folder'],
  ctx: FolderTransferCtx | undefined,
  limiter: ConcurrencyLimiter,
  fn: () => Promise<boolean>,
): Promise<boolean> {
  if (!(await dirGate(folder, ctx))) return false
  return limiter.run(fn)
}

/** 汇总并发任务结果：任一失败/抛错都记失败；返回首个异常供调用方重抛 */
function foldSettled(settled: PromiseSettledResult<boolean>[]): { success: boolean; firstErr: unknown } {
  let success = true
  let firstErr: unknown = null
  for (const r of settled) {
    if (r.status === 'rejected') {
      success = false
      if (firstErr == null) firstErr = r.reason
    } else if (!r.value) {
      success = false
    }
  }
  return { success, firstErr }
}

/**
 * ★ 2026-09-29：仅 TAR 模式下「打包通道不适用」的告知 —— 当前唯一触发场景是**目标已存在**。
 *
 * 与 tar 通道内 _decline（通道不可用/失败）区分：这不是失败。目标已存在时，这一**次自动流程**
 * 只能先走逐文件通道（增量必须经过目录冲突检测），传输会正常完成、只是没打包。
 *
 * 为什么必须提示：用户既然选了「仅 TAR」，只看到传输记录标着 ⇄SFTP 时无从判断这是
 * 「设置没生效」还是「本次不适用」，只能来问（实测）。提示里同时给出解法——
 * 在目录冲突提示中选择「覆盖」，或在传输前先删除目标目录/文件。
 *
 * ★ 2026-09-29（三）修正提示的**后半句前提**：此前「选『覆盖』即可打包」对**上传**方向是假的
 * ——上传的覆盖出口（MergeLocalDirUseCase）当时没有任何打包入口，用户照做仍是 ⇄SFTP，
 * 于是提示与行为不符。现已让 MergeLocalDirUseCase 先试打包通道，两端的这句解法都成立。
 *
 * 仅 tarOnly 触发：其余模式本就是按规模与条件择路，走逐文件是预期行为，不需要解释。
 */
function notifyTarOnlyInapplicable(
  ports: TransferUseCasePorts,
  name: string,
  target: string,
  direction: 'upload' | 'download',
): void {
  if (ports.tarChannelMode !== 'tarOnly') return
  try {
    ports.notifyTarOnlyInapplicable?.(name, 'targetExists', `${direction} target already exists: ${target}`)
  } catch { /* 提示失败绝不影响传输本身 */ }
}

﻿/**
 * 下载用例（单文件 + 目录递归）
 * 合并自: download-dir-use-case.ts, download-one-use-case.ts
 */



// ─── 目录下载 ───────────────────────────────────────────────

export class DownloadDirUseCase {
  constructor(
    private readonly ports: TransferUseCasePorts,
    private readonly remoteStats: RemoteDirStatsPort,
    /** ★ 2026-08-10：目录内文件级并发数 getter（实时读设置），缺省默认 3 */
    private readonly dirConcurrency?: () => number | undefined,
  ) {}

  async execute(
    remoteSrc: string,
    localDest: string,
    topCtx?: FolderTransferCtx,
    localName?: string,
    inLimiter?: ConcurrencyLimiter,
    /** ★ 2026-09-20：用户已选目录覆盖时跳过子文件冲突检测 */
    forceOverwrite = false,
  ): Promise<boolean> {
    if (!this.ports.sftp.hasSession()) return false

    const rawBase = localName || path.posix.basename(remoteSrc)
    const base = safeEntryName(rawBase)
    if (!base) {
      log.warn('skip download dir with unsafe name:', rawBase)
      return false
    }
    const localDir = path.join(localDest, base)
    const isTop = !topCtx
    let ctx = topCtx

    if (isTop) {
      // ★ 2026-08-11：tar 打包通道——目标不存在（全新下载）时启用；
      //   success 传输成功；failed 中止；fallback 则平滑回退到常规逐文件流式传输
      // ★ 2026-09-26：目标已存在时不再一律跳过 tar —— 用户在目录冲突里选了「覆盖」时
      //   （forceOverwrite=true）本就会跳过全部子文件冲突检测，语义与「解包后整目录覆盖合并」
      //   完全等价（都只覆盖同名项，保留本地独有文件）。此前守卫不看 forceOverwrite，
      //   于是「TAR 打包传输加速」开着、目标目录恰好在本地已存在时就静默走逐文件通道
      //   （用户实测：远端 /usr/local/test/dist → 本地已存在的 Desktop\test\dist，标签显示 ⇄SFTP）。
      //   仍须留在逐文件通道的是 forceOverwrite=false 的增量场景 —— 冲突检测依赖它。
      const targetExists = await this.ports.localFs.pathExists(localDir)
      if (this.ports.tarChannel && (!targetExists || forceOverwrite)) {
        const r = await this.ports.tarChannel.tryDownloadDir(remoteSrc, localDest, this.ports.folder, base, targetExists, this.ports.tarChannelMode)
        if (r === 'success') return true
        if (r === 'failed') return false
        log.info('[download-dir] tar channel fell back, starting standard file-by-file transfer:', remoteSrc)
      } else if (targetExists) {
        // ★ 2026-09-26：把「为什么没走打包加速」写进日志 —— 否则用户只能看到 ⇄SFTP 标签，无从判断
        log.info('[download-dir] tar channel skipped (local target exists, overwrite not confirmed):', localDir)
        // ★ 2026-09-29：仅 TAR 模式下必须让用户知道 —— 这种「不适用」不是降级（增量下载必须走
        //   逐文件通道，冲突检测依赖它），但选了「仅」却只看到 ⇄SFTP 标签，用户无从判断是
        //   「设置没生效」还是「这次不适用」，只能来问（实测）。提示文案含解法：选「覆盖」或先删目标。
        notifyTarOnlyInapplicable(this.ports, base, localDir, 'download')
      }
      // ★ 2026-09-28：目录下载始终预扫描得真实总量（移除快速模式后进度永远有百分比）
      let totalSize = 0
      let itemCount = 0
      const s = await this.remoteStats.scanDir(remoteSrc)
      totalSize = s.size
      itemCount = s.count
      ctx = this.ports.folder.start(base, 'download', remoteSrc, localDir, totalSize, itemCount)
    }

    let success = true
    // ★ 2026-08-10：目录内文件级并发（issue #10）——原 for await 串行让每个小文件都吃一次
    //   网络往返；改为递归各层共享的限制器池，单次目录传输在途流总数 ≤ 并发数
    const limiter = inLimiter ?? new ConcurrencyLimiter(clampDirConcurrency(this.dirConcurrency?.()))
    try {
      await this.ports.localFs.mkdirRecursive(localDir)
      const entries = await this.ports.sftp.readdir(remoteSrc)

      const tasks = entries.map(async (entry): Promise<boolean> => {
        // ★ 2026-07-25：剥离服务器返回文件名中的目录组件与 ..，防止路径穿越
        const safeName = safeEntryName(entry.name)
        if (!safeName) {
          log.warn('skip unsafe entry name:', entry.name)
          return true
        }
        const remoteP = path.posix.join(remoteSrc, safeName)
        const localP = path.join(localDir, safeName)
        // 父目录 listing 的类型标志并非所有服务端都可靠；递归前逐项 lstat/readlink，
        // 防止 symlink→dir 被误标为普通目录后扩大下载范围。
        if (entry.isSymlink || await this.ports.sftp.isSymlink(remoteP)) {
          log.info('skip symlink during folder download:', entry.name)
          return true
        }

        if (entry.isDirectory) {
          // ★ 2026-08-10 修复：目录只过中止/暂停门控、不占槽直接递归——
          //   目录持槽等子项会在嵌套层数 ≥ 并发数时死锁（槽位被目录占满）。
          //   递归子目录失败时向上传播失败标记（共享同一限制器）
          if (!(await dirGate(this.ports.folder, ctx))) return false
          return this.execute(remoteP, localDir, ctx, undefined, limiter, forceOverwrite)
        }

        // 文件：门控 + 占槽，实际字节传输受限制器约束
        return gatedDirTask(this.ports.folder, ctx, limiter, async (): Promise<boolean> => {
          const sz = entry.size || 0
          // ★ 2026-09-20：modified===0 时旧逻辑用 Date.now() 占位且不进 stat；现无效一律 stat
          let remoteMtime = entryMtimeToMsOrUndefined(entry) ?? 0
          if (remoteMtime === 0) {
            try {
              const st = await this.ports.sftp.stat(remoteP)
              if (st) remoteMtime = entryMtimeToMsOrUndefined(st) ?? 0
            } catch (e) {
              log.warn('stat fallback for folder download conflict failed:', remoteP, e)
            }
          }
          if (!forceOverwrite) {
            const conflictResult = await this.ports.conflictDetection.checkLocalConflict(localP, remoteP, sz, remoteMtime)
            if (conflictResult.kind === 'auto-skipped') {
              log.info('[download-dir] auto-skipped (content identical):', remoteP)
              return true
            }
            if (conflictResult.kind === 'conflict') {
              const conflictInfo = conflictResult.info
              this.ports.conflictQueue.enqueue({
                localPath: localP,
                remoteDir: path.posix.dirname(remoteP),
                fileName: safeName,
                remotePath: remoteP,
                localStat: { size: conflictInfo.localSize, mtimeMs: conflictInfo.localMtime } as Stats,
                direction: 'download',
                remoteFileSize: sz,
                remoteFileMtime: remoteMtime,
                transferCtx: ctx,
                localDigest: conflictInfo.localDigest,
                remoteDigest: conflictInfo.remoteDigest,
              })
              if (ctx) this.ports.folder.markHadConflict(ctx)
              this.ports.conflictQueue.showDialog()
              return true
            }
          }

          // ★ 2026-09-26：把「本文件已落盘字节」实时上报给目录条目 —— 见端口注释。
          //   · 在途字节记在 **ctx**（key＝本地路径，值为峰值）：同目录文件是 3 路并发，
          //     若各报各的「基准 + 自己的字节」，后起步的文件会把界面拉回去；
          //   · 条目进度 = `ctx.bytesDone`（已完成文件之和）+ 在途峰值之和 ⇒ 天然单调；
          //   · 本文件完成/失败后立即从表中摘除，最终值仍由下面的 `ctx.bytesDone += sz` 精确收口；
          //   · **零字节的空窗口也要上报**：面板正是靠这些窗口发现「连续零推进」并把速度
          //     如实置成 0 B/s（见 SPEED_STALL_ZERO_MS），不上报就等于让界面继续假装在跑。
          const liveMap = ctx ? (ctx.liveBytes || (ctx.liveBytes = new Map<string, number>())) : null
          /** 在途峰值之和（含本文件）。收口时也要带上它 —— 见下方「防回退」注释 */
          const inFlightBytes = (): number => {
            if (!liveMap) return 0
            let sum = 0
            for (const v of liveMap.values()) sum += v
            return sum
          }
          let liveReportAt = 0
          const onLive = ctx && liveMap
            ? (bytes: number): void => {
                if (bytes > 0) liveMap.set(localP, Math.max(liveMap.get(localP) || 0, bytes))
                const now = Date.now()
                if (now - liveReportAt < FOLDER_LIVE_PROGRESS_MS) return
                liveReportAt = now
                this.ports.folder.updateProgress(ctx, ctx.bytesDone + inFlightBytes(), safeName, ctx.itemDone, sz)
              }
            : undefined
          const ok = await this.ports.execution.downloadRaw(remoteP, localP, entry.mode, entry.size, onLive)
          // 本文件已结束（成功或失败）→ 从在途表中摘除，避免其峰值永久占着进度
          liveMap?.delete(localP)
          // ★ 2026-09-20：跳过当前若已落盘则记成功，避免父目录整夹失败；未落盘才失败
          if (ctx && this.ports.folder.consumeAbortCurrent(ctx)) {
            if (!ok) return false
          } else if (!ok) {
            return false
          }
          if (ctx) {
            if (sz > 0) ctx.bytesDone += sz
            ctx.itemDone++
            // ★ 2026-09-26 **防回退**（产物探针实测出来的）：收口这一报必须**仍然带上在途字节**。
            //   本文件完成时刚把自己从在途表摘掉、并把 sz 加进 bytesDone —— 数值虽然没变，
            //   但同目录**其它还在跑的文件**的峰值只在「在途表」里，若这里只报 ctx.bytesDone，
            //   整行会瞬间**倒退**（实测 74,900,000 → 73,300,000：大文件收口时把同批
            //   1.6MB 小文件的在途量丢掉了）。带上 inFlightBytes() 后两条通道恒单调。
            this.ports.folder.updateProgress(ctx, ctx.bytesDone + inFlightBytes(), safeName, ctx.itemDone, sz)
          }
          return true
        })
      })
      const folded = foldSettled(await Promise.allSettled(tasks))
      success = folded.success
      if (folded.firstErr != null) throw folded.firstErr
    } catch (e) {
      success = false
      log.error(`folder download failed: ${remoteSrc} :: ${errText(e)}`)
      throw e
    } finally {
      // ★ 2026-07-25：无论成功/失败/取消都收尾，避免传输条目永久卡"进行中"
      if (isTop && ctx) {
        const ok = success && !ctx.hadConflict && !this.ports.folder.isAborted(ctx)
        this.ports.folder.finish(ctx, ok)
      }
    }
    return success
  }
}

// ─── 单文件/目录下载 ────────────────────────────────────────

export class DownloadOneUseCase {
  constructor(
    private readonly ports: TransferUseCasePorts,
    private readonly downloadOne: DownloadOnePort,
  ) {}

  async execute(file: SFTPFile, targetLocalDir?: string): Promise<void> {
    const localBase = targetLocalDir?.trim() || this.downloadOne.getLocalPath()

    if (file.isDirectory) {
      // ★ 2026-07-25：剥离目录组件与 ..，防路径穿越
      const safeName = safeEntryName(file.name)
      if (!safeName) {
        log.warn('skip download dir with unsafe name:', file.name)
        return
      }
      const localDir = path.join(localBase, safeName)

      // SFTP 服务器对目录的 stat 经常返回 1970-01-01 等无效修改时间，而 readdir/payload 中的 modified 是正确的。
      // 因此优先信任 payload 的 modified，仅当无效时才用 stat 兜底，并且 stat 结果也要过滤 epoch 时间。
      let remoteSize = file.size ?? 0
      let remoteMtime = entryMtimeToMsOrUndefined(file)
      log.info('[download-one] dir initial modified:', file.modified, 'remoteMtime:', remoteMtime, 'path:', file.fullPath)
      if (remoteMtime == null) {
        try {
          const st = await this.ports.sftp.stat(file.fullPath)
          log.info('[download-one] dir stat fallback result:', st)
          if (st) {
            const stMtime = entryMtimeToMsOrUndefined(st)
            if (stMtime != null) remoteMtime = stMtime
            remoteSize = Number(st.size ?? st.attrs?.size ?? remoteSize)
          }
        } catch (e) {
          log.warn('[download-one] stat for dir conflict failed:', file.fullPath, e)
        }
      }
      if (remoteMtime == null) remoteMtime = 0
      log.info('[download-one] dir final remoteMtime:', remoteMtime)

      if (await this.ports.localFs.pathExists(localDir)) {
        this.ports.conflictQueue.enqueue({
          localPath: localDir,
          remoteDir: path.posix.dirname(file.fullPath),
          fileName: safeName,
          remotePath: file.fullPath,
          localStat: { size: 0, mtimeMs: Date.now() } as Stats,
          direction: 'download',
          isDirectory: true,
          remoteFileSize: remoteSize,
          remoteFileMtime: remoteMtime,
        })
        return
      }
      await this.downloadOne.downloadDir(file.fullPath, localBase)
      return
    }

    // ★ 2026-07-25：剥离目录组件与 ..，防路径穿越
    const safeName = safeEntryName(file.name)
    if (!safeName) {
      log.warn('skip download file with unsafe name:', file.name)
      return
    }
    const localPath = path.join(localBase, safeName)
    let remoteMtime = entryMtimeToMsOrUndefined(file)
    log.info('[download-one] file.modified:', file.modified, 'initial remoteMtime:', remoteMtime, 'path:', file.fullPath)
    // payload 有效时优先使用；无效时才用 stat 兜底，避免某些 SFTP 后端 stat 返回错误时间
    if (remoteMtime == null) {
      try {
        const st = await this.ports.sftp.stat(file.fullPath)
        log.info('[download-one] stat fallback result:', st)
        const stMtime = entryMtimeToMsOrUndefined(st)
        if (stMtime != null) remoteMtime = stMtime
      } catch (e) {
        log.warn('[download-one] stat for file conflict failed:', file.fullPath, e)
      }
    }
    if (remoteMtime == null) remoteMtime = 0
    log.info('[download-one] final remoteMtime:', remoteMtime)
    const conflictResult = await this.ports.conflictDetection.checkLocalConflict(
      localPath, file.fullPath, file.size ?? 0, remoteMtime,
    )
    if (conflictResult.kind === 'auto-skipped') {
      // ★ 2026-09-07 issue #15+：内容已确认相同，跳过本次下载（不覆盖本地文件）。
      //   detector 已通过构造回调同步通知 host 把对应的传输记录标为「已跳过」。
      log.info('[download-one] auto-skipped (content identical):', file.fullPath)
      return
    }
    if (conflictResult.kind === 'conflict') {
      const conflictInfo = conflictResult.info
      this.ports.conflictQueue.enqueue({
        localPath,
        remoteDir: path.posix.dirname(file.fullPath),
        fileName: safeName,
        remotePath: file.fullPath,
        localStat: { size: conflictInfo.localSize, mtimeMs: conflictInfo.localMtime } as Stats,
        direction: 'download',
        remoteFileSize: file.size ?? 0,
        remoteFileMtime: remoteMtime,
        // ★ 2026-09-18 issue #15 修复：携带内容摘要供对话框展示
        localDigest: conflictInfo.localDigest,
        remoteDigest: conflictInfo.remoteDigest,
      })
      return
    }

    // no-conflict：正常下载
    await this.ports.execution.downloadTopLevel(
      file.fullPath, localPath, file.mode, file.size,
    )
  }
}

export type { SftpDirEntry }

/**
 * 上传用例（路径上传 + 本地目录合并）
 * 合并自: merge-local-dir-use-case.ts, upload-path-use-case.ts
 */


// ─── 本地目录合并上传（冲突覆盖时直接合并，跳过冲突检测）─────

export interface MergeLocalDirPorts {
  localFs: Pick<LocalTransferFsPort, 'listChildren' | 'lstat'>
  sftp: Pick<SftpTransferPort, 'hasSession' | 'mkdir'>
  execution: Pick<TransferExecutionPort, 'uploadRaw'>
  refreshRemote(): Promise<unknown>
  /** ★ 2026-08-11：进度面板（合并覆盖也要可见；缺省时静默兼容旧行为） */
  folder?: FolderTransferPort
  /** ★ 2026-08-11：预扫描本地目录得真实总量（与常规目录上传一致） */
  scanLocalDir?(dirPath: string): Promise<{ size: number; count: number }>
  /**
   * ★ 2026-09-29（三）：打包通道（可选）。合并上传在动工前先试它 —— 这条出口正是用户在
   * 目录冲突里选「覆盖」/「重命名」后的实际执行体，缺了它，仅 TAR 模式下选了「覆盖」
   * 依然只会逐文件 uploadRaw（实测：用户质问「不是已经开启了仅 TAR 模式吗？怎么还是有走
   * SFTP 模式？」）。缺省（未注入）时行为与改动前完全一致。
   */
  tarChannel?: TarChannelPort
  /**
   * ★ 2026-09-29（三）：传输通道模式 —— 必须是**取值函数**而非值。
   *
   * 本对象在协调器构造函数里建好、长期复用（同 _buildPorts 的 P0 教训）：写成属性就是把
   * 构造时的模式冻住，用户之后改成「仅 TAR」，这里还是旧的 smart → 打包被「不划算」门槛挡掉，
   * 表现为「设置没生效」。
   */
  tarChannelMode?(): string
  /**
   * ★ 2026-09-29（三）：远端目标是否已存在 —— 决定打包通道走「合并覆盖」还是「原子搬入」。
   * 缺省（未注入）时不尝试打包通道：宁可不加速，也不能在目标已存在时误走 mv 分支
   * （那会把整目录嵌套进目标里）。
   */
  checkRemotePathExists?(remotePath: string, expectDir?: boolean): Promise<boolean>
}

export class MergeLocalDirUseCase {
  constructor(private readonly ports: MergeLocalDirPorts) {}

  // ★ 2026-08-10：返回 boolean（true=全部子项成功）；仅顶层刷新远程列表，
  //   避免递归每层都触发 refreshRemote
  // ★ 2026-08-11：顶层创建「传输中」进度条目（reuseLogEntryId 复用来源传输的日志，
  //   避免重复记录）；非快速模式预扫描得真实总量（有百分比进度），快速模式才跳过扫描；
  //   topCtx 透传保证子目录内的文件进度也汇总到顶层条目
  async execute(
    localSrc: string, remoteDest: string, isTop = true,
    reuseLogEntryId?: string, topCtx: FolderTransferCtx | null = null,
  ): Promise<boolean> {
    if (!this.ports.sftp.hasSession()) return false
    // ★ 2026-09-29（三）：动工前先试打包通道 —— 本用例正是「目录冲突 → 覆盖 / 重命名」的落地执行体，
    //   此前它只会逐文件 uploadRaw，导致仅 TAR 模式下用户选了「覆盖」依旧 ⇄SFTP（UI 提示却写着
    //   「选『覆盖』即可打包传输」）。放在 mkdir / 建进度条目**之前**：未接管时不留任何痕迹。
    if (isTop && !topCtx) {
      const tar = await this._tryTarUpload(localSrc, remoteDest, reuseLogEntryId)
      if (tar !== null) return tar
    }
    try { await this.ports.sftp.mkdir(remoteDest) } catch { /* 已存在 */ }

    let ownCtx: FolderTransferCtx | null = null
    if (isTop && !topCtx && this.ports.folder) {
      let totalSize = 0
      let itemCount = 0
      if (this.ports.scanLocalDir) {
        try {
          const s = await this.ports.scanLocalDir(localSrc)
          totalSize = s.size
          itemCount = s.count
        } catch { /* 扫描失败回退总量未知 */ }
      }
      ownCtx = this.ports.folder.start(
        path.basename(localSrc), 'upload', remoteDest, localSrc, totalSize, itemCount, reuseLogEntryId,
      )
    }
    const ctx = topCtx ?? ownCtx

    let success = true
    try {
      const children = await this.ports.localFs.listChildren(localSrc)
      for (const c of children) {
        // ★ 2026-09-20：合并覆盖接入中止/暂停门控（与常规目录上传对齐）
        if (ctx && this.ports.folder) {
          if (this.ports.folder.isAborted(ctx)) {
            success = false
            break
          }
          await this.ports.folder.waitWhilePaused(ctx)
          if (this.ports.folder.isAborted(ctx)) {
            success = false
            break
          }
        }
        if (c.isSymbolicLink) continue
        const safeName = safeEntryName(c.name)
        if (!safeName) {
          log.warn('skip unsafe local entry name during merge:', c.name)
          continue
        }
        const localP = path.join(localSrc, safeName)
        const remoteP = path.posix.join(remoteDest, safeName)
        const st = await this.ports.localFs.lstat(localP)
        if (!st) continue
        if (st.isDirectory()) {
          const childOk = await this.execute(localP, remoteP, false, undefined, ctx)
          if (!childOk) success = false
        } else {
          const ok = await this.ports.execution.uploadRaw(remoteP, localP)
          if (ctx && this.ports.folder?.consumeAbortCurrent(ctx)) {
            if (!ok) success = false
            else {
              ctx.itemDone++
              if (st.size > 0) ctx.bytesDone += st.size
              this.ports.folder.updateProgress(ctx, ctx.bytesDone, c.name, ctx.itemDone, st.size)
            }
            continue
          }
          if (!ok) success = false
          else if (ctx && this.ports.folder) {
            ctx.itemDone++
            if (st.size > 0) ctx.bytesDone += st.size
            this.ports.folder.updateProgress(ctx, ctx.bytesDone, c.name, ctx.itemDone, st.size)
          }
        }
      }
    } catch (e) {
      // ★ 2026-09-21 P1 修复：此前没有 catch——listChildren/lstat 抛异常时 success 仍为 true，
      //   finally 的 finish(ownCtx, true) 会把「压根没传」记成成功（异常经 resolve catch 只留 error log）
      success = false
      log.error(`merge local dir failed: ${localSrc} :: ${errText(e)}`)
      throw e
    } finally {
      if (ownCtx && this.ports.folder) this.ports.folder.finish(ownCtx, success)
    }
    if (isTop) await this.ports.refreshRemote()
    return success
  }

  /**
   * ★ 2026-09-29（三）：合并上传前先试打包通道。
   *
   * 为什么放在这里：用户在目录冲突里选「覆盖」后，实际执行体是本用例（逐文件 uploadRaw），
   * 打包通道完全拿不到机会 —— 于是「仅 TAR」模式下选了「覆盖」依然走 ⇄SFTP，
   * 而提示文案偏偏写着「选『覆盖』即可打包传输」（提示与行为不符，用户实测质问）。
   * 下载侧 2026-09-26 已用 forceOverwrite 解决同一问题，这里补上对称的一段。
   *
   * 返回语义（调用方必须严格区分）：
   *   · true     —— 打包通道已完整完成本次合并上传，直接返回 true。
   *                 **不能再继续逐文件合并**，否则整棵树会被重传一遍。
   *   · false    —— 打包通道已接管但硬失败（仅 TAR 模式）。通道内已把原因+解法告知用户、
   *                 并把进度条目收尾为失败；此处绝不能偷偷回退逐文件（那正是「仅 TAR 走了 SFTP」）。
   *   · null     —— 通道未接管，调用方继续原来的逐文件合并（无任何副作用）。
   *
   * 三处端口缺一不可：没有「目标是否存在」的探测就硬试是危险的 —— 目标恰好已存在时
   * 打包通道的 mv 分支会把整目录**嵌套**进目标里（见 tar-channel 的 placeStep 说明）。
   */
  private async _tryTarUpload(
    localSrc: string,
    remoteDest: string,
    reuseLogEntryId?: string,
  ): Promise<boolean | null> {
    const tarChannel = this.ports.tarChannel
    const probe = this.ports.checkRemotePathExists
    const folder = this.ports.folder
    if (!tarChannel || !probe || !folder) return null
    let exists = false
    try {
      exists = await probe(remoteDest, true)
    } catch (e) {
      log.warn('[merge-upload] remote target probe failed, skip tar channel:', errText(e))
      return null
    }
    // ★ 实时取值（tarChannelMode 是 getter）—— 快照会导致改设置不生效，见 MergeLocalDirPorts 说明
    const mode = this.ports.tarChannelMode?.() ?? 'smart'
    const r = await tarChannel.tryUploadDir(
      localSrc, remoteDest, folder, path.basename(localSrc), exists, mode, reuseLogEntryId,
    )
    if (r === 'success') {
      log.info(`[merge-upload] packed by tar channel (${exists ? 'merge-into-existing' : 'fresh'}):`, localSrc, '->', remoteDest)
      return true
    }
    if (r === 'failed') {
      log.warn('[merge-upload] tar channel required but unusable, merge aborted:', localSrc, '->', remoteDest)
      return false
    }
    log.info('[merge-upload] tar channel not taken, falling back to per-file merge:', localSrc, '->', remoteDest)
    return null
  }
}

// ─── 多选批量上传（★ 2026-09-29（四））────────────────────────

/**
 * ★ 2026-09-29（四）：把「一次多选」交给打包通道打成一个归档。
 *
 * 为什么需要单独一个用例：多选在面板层被拆成 N 个独立任务（各自预注册占位条目、各自占一个
 * 队列槽），「这批可以合成一个包」这个事实只有**入口处**知道，逐项的 UploadPathUseCase 看不到。
 * 于是本用例只做**路由前置判定**，真正的打包/落地逻辑全在 tar 通道内（tryUploadBatch）——
 * 保持「用例管路由、通道管实现」的既有分层。
 *
 * 前置条件（任一不满足即 'fallback'，调用方原样走既有逐项流程）：
 *   ① 通道实现了 tryUploadBatch（老产物/测试替身可能没有）；
 *   ② 模式不是 sftpOnly（用户明确要求逐文件时，一次探测都不该做）；
 *   ③ ≥2 个条目（单项没有合并收益，且单文件本就恒走逐文件）；
 *   ④ **同一父目录** —— 多选天然满足；不同来源会有多个落点，保守版不处理；
 *   ⑤ 远端**全部目标不存在**。
 *
 * ⑤ 是保守版的硬条件，也是与用户商定的边界：只要有一项目标已存在，就不接管 —— 交回逐项流程，
 * 由它照旧弹冲突框、照旧按项处理（跳过/重命名/覆盖各自生效）。本用例**完全不碰冲突语义**，
 * 因此不可能改变现有冲突行为。另有两点必须注意：
 *   · 探测本身可能失败（会话抖动）→ 按「不接管」处理，不能把探测故障升级成传输失败；
 *   · 探测窗口与真正落地之间有竞态（对方在这期间创建了同名项）→ 由通道的落地命令兜住：
 *     它在**任何 mv 之前**先全量复查所有目标仍不存在，失败则整批不动（见 buildRemoteUploadBatchLanding）。
 *
 * 返回语义与 MergeLocalDirUseCase._tryTarUpload 一致：
 *   'success' 已完整完成本批（调用方**不得**再逐项入队，否则整批会被重传一遍）；
 *   'failed'  通道已接管但硬失败（仅 TAR 模式），调用方同样不得回退逐项；
 *   'fallback' 未接管 / 已可恢复回退，调用方继续逐项流程。
 */
export class UploadBatchUseCase {
  constructor(private readonly ports: TransferUseCasePorts) {}

  async execute(localPaths: string[], remoteDir: string, name: string): Promise<TarChannelResult> {
    const tarChannel = this.ports.tarChannel
    const probe = this.ports.conflictDetection?.checkRemotePathExists
    const folder = this.ports.folder
    if (!tarChannel?.tryUploadBatch || !probe || !folder) return 'fallback'
    // ★ 实时取值：tarChannelMode 在 ports 上是 getter（见 TransferUseCasePorts 的 P0 说明），
    //   写成局部快照会让用户改设置不生效
    const mode = this.ports.tarChannelMode ?? 'smart'
    if (mode === 'sftpOnly') return 'fallback'
    if (localPaths.length < 2) return 'fallback'
    if (new Set(localPaths.map(p => path.dirname(p))).size !== 1) return 'fallback'
    for (const p of localPaths) {
      const target = path.posix.join(remoteDir, path.basename(p))
      let exists = false
      try {
        exists = await probe(target)
      } catch (e) {
        log.warn('[batch-upload] remote target probe failed, batch packing skipped:', errText(e))
        return 'fallback'
      }
      if (exists) {
        log.info('[batch-upload] a target already exists, batch packing skipped (per-file flow decides):', target)
        return 'fallback'
      }
    }
    const r = await tarChannel.tryUploadBatch(localPaths, remoteDir, folder, name, mode)
    if (r === 'success') {
      log.info(`[batch-upload] packed by tar channel: ${localPaths.length} entries ->`, remoteDir)
    } else if (r === 'failed') {
      log.warn(`[batch-upload] tar channel required but unusable, batch aborted: ${localPaths.length} entries ->`, remoteDir)
    }
    return r
  }
}

// ─── 路径上传（单文件/目录递归）──────────────────────────────

export class UploadPathUseCase {
  constructor(
    private readonly ports: TransferUseCasePorts,
    /** ★ 2026-08-10：目录内文件级并发数 getter（实时读设置），缺省默认 3 */
    private readonly dirConcurrency?: () => number | undefined,
  ) {}

  async execute(
    remoteDir: string,
    localPath: string,
    topCtx?: FolderTransferCtx,
    inLimiter?: ConcurrencyLimiter,
  ): Promise<boolean> {
    if (!this.ports.sftp.hasSession()) return false
    const st = await this.ports.localFs.lstat(localPath)
    if (!st) return false
    if (st.isSymbolicLink()) return false

    const base = path.basename(localPath)
    const remoteTarget = path.posix.join(remoteDir, base)
    const isTop = !topCtx

    if (st.isDirectory()) {
      return this._uploadDirectory(remoteDir, localPath, remoteTarget, st, isTop, topCtx, inLimiter)
    }

    return this._uploadFile(remoteDir, localPath, remoteTarget, st, isTop, topCtx)
  }

  private async _uploadDirectory(
    remoteDir: string,
    localPath: string,
    remoteTarget: string,
    st: import('fs').Stats,
    isTop: boolean,
    topCtx?: FolderTransferCtx,
    inLimiter?: ConcurrencyLimiter,
  ): Promise<boolean> {
    let ctx = topCtx
    if (isTop) {
      const base = path.basename(localPath)
      // ★ 2026-08-11：tar 打包通道——仅当远端目标不存在（全新上传）时启用；
      //   success 传输成功；failed 中止；fallback 则平滑回退到常规逐文件流式传输
      if (this.ports.tarChannel && !(await this.ports.conflictDetection.checkRemotePathExists(remoteTarget, true))) {
        // ★ 2026-09-29（三）：此处 mergeIntoExisting 恒为 false —— 目标不存在才走到这里，
        //   走的必然是「原子 mv 搬入」。目标**已存在**时不在这里强行打包：先弹目录冲突让用户
        //   确认（跳过/重命名/覆盖），用户选「覆盖」后由 MergeLocalDirUseCase → 打包通道
        //   的 mergeIntoExisting=true 分支接手（见 _tryTarUpload），此时才允许合并覆盖。
        const r = await this.ports.tarChannel.tryUploadDir(localPath, remoteTarget, this.ports.folder, base, false, this.ports.tarChannelMode)
        if (r === 'success') return true
        // ★ 2026-09-29：仅 TAR 模式下 'failed' 既可能是用户中止，也可能是打包通道不可用
        //   （此时通道内已提示原因与解决方法、并把进度条目收尾为失败），一律不再回退。
        if (r === 'failed') return false
        log.info('[upload-dir] tar channel fell back, starting standard file-by-file transfer:', localPath)
      } else if (this.ports.tarChannel && this.ports.tarChannelMode === 'tarOnly') {
        // ★ 2026-09-29：给「仅 TAR 却走了逐文件」留下取证锚点 —— 这种情形不是回退，而是
        //   打包上传通道在**本次自动流程**里不适用（它要求远端目标不存在；目标已存在时必须先让
        //   用户确认冲突处理方式，目录冲突检测依赖逐文件通道）。仅 TAR 的说明文案里写明了这个例外。
        log.info('[upload-dir] tar-only mode, but remote target already exists; per-file channel is the only option:', remoteTarget)
        // ★ 2026-09-29（三）：文案里「选『覆盖』即可让打包通道接管」这句现在**真的成立**了 ——
        //   覆盖出口 MergeLocalDirUseCase 已接入打包通道（见 _tryTarUpload）。此前上传侧没有任何
        //   打包入口，用户照着提示选了覆盖却依旧 ⇄SFTP（实测质问）。
        notifyTarOnlyInapplicable(this.ports, base, remoteTarget, 'upload')
      }
      // ★ 2026-09-28：目录上传始终预扫描得真实总量（移除快速模式后进度永远有百分比）
      let totalSize = 0
      let itemCount = 0
      const s = await this.ports.localFs.scanDir(localPath)
      totalSize = s.size
      itemCount = s.count
      ctx = this.ports.folder.start(base, 'upload', remoteTarget, localPath, totalSize, itemCount)
      if (await this.ports.conflictDetection.checkRemotePathExists(remoteTarget, true)) {
        let remoteFileSize: number | undefined
        let remoteFileMtime: number | undefined

        // 目录的 sftp.stat 通常拿不到真实修改时间（常见返回 1970-01-01），优先从父目录 listing 中找目标目录项
        try {
          const entries = await this.ports.sftp.readdir(remoteDir)
          const found = entries.find(e => e.name === base)
          if (found) {
            const sz = found.size ?? found.attrs?.size
            remoteFileSize = sz != null ? Number(sz) : undefined
            remoteFileMtime = entryMtimeToMsOrUndefined(found)
            log.info('[upload-dir] readdir remote dir', remoteTarget, 'size:', remoteFileSize, 'mtime:', remoteFileMtime)
          }
        } catch (e) {
          log.warn('[upload-dir] readdir remote dir failed:', remoteTarget, e)
        }

        // readdir 找不到或 modified 无效时，再尝试 stat 兜底
        if (remoteFileMtime == null) {
          try {
            const rstat = await this.ports.sftp.stat(remoteTarget)
            if (rstat) {
              if (remoteFileSize == null) remoteFileSize = rstat.size ?? rstat.attrs?.size
              remoteFileMtime = parseRemoteMtime(rstat)
              log.info('[upload-dir] stat fallback remote dir', remoteTarget, 'size:', remoteFileSize, 'mtime:', remoteFileMtime)
            }
          } catch (e) {
            log.warn('[upload-dir] stat remote dir failed:', remoteTarget, e)
          }
        }

        // ★ 2026-09-17：冲突对话框展示「目录内容总大小」；fs.Stats.size 对目录无意义（Windows 常为 0）
        let localContentSize = totalSize
        if (localContentSize <= 0) {
          try {
            const s = await this.ports.localFs.scanDir(localPath)
            localContentSize = s.size
            if (itemCount <= 0) itemCount = s.count
          } catch (e) {
            log.warn('[upload-dir] scan local dir size for conflict failed:', localPath, e)
          }
        }

        this.ports.conflictQueue.enqueue({
          localPath,
          remoteDir,
          fileName: base,
          remotePath: remoteTarget,
          localStat: { size: localContentSize, mtimeMs: st.mtimeMs } as Stats,
          direction: 'upload',
          isDirectory: true,
          remoteFileSize,
          remoteFileMtime,
          // ★ 2026-08-11：携带来源传输 ctx，覆盖/重命名成功后翻正被误记失败的记录
          transferCtx: ctx,
          // ★ 2026-09-18 issue #15 修复：携带内容摘要供对话框展示
          localDigest: null,
          remoteDigest: null,
        })
        this.ports.folder.markHadConflict(ctx)
        this.ports.conflictQueue.showDialog()
        this.ports.folder.finish(ctx, false)
        return false
      }
    }

    try { await this.ports.sftp.mkdir(remoteTarget) } catch {}
    // ★ 2026-08-10：目录内文件级并发（issue #10）——原 for await 串行改为递归各层
    //   共享的限制器池；暂停/中止门控在每个任务占槽前检查，已在途文件传完即停
    const limiter = inLimiter ?? new ConcurrencyLimiter(clampDirConcurrency(this.dirConcurrency?.()))
    // ★ 2026-08-10：跟踪子项失败并向上传播（中断/失败不得误报成功）
    let success = true
    try {
      // ★ 2026-09-21 P1 修复：listChildren 必须挪进 try——它在 ctx start 之后、try 之外时，
      //   抛异常（权限/目录被删/磁盘错误）会绕过 finally 的 finish，folder 进度条目永久卡「传输中」
      //   （folder 条目不参与 _tickAllTransfers，15 分钟 stall 清理也到不了它）
      const children = await this.ports.localFs.listChildren(localPath)
      const tasks = children
        .filter(c => !c.isSymbolicLink)
        .map(async (c): Promise<boolean> => {
          const safeName = safeEntryName(c.name)
          if (!safeName) {
            log.warn('skip unsafe local entry during upload:', c.name)
            return true
          }
          const childLocal = path.join(localPath, safeName)
          const st = await this.ports.localFs.lstat(childLocal)
          if (!st) return false
          if (st.isDirectory()) {
            // ★ 2026-08-10 修复：目录只过中止/暂停门控、不占槽直接递归——
            //   目录持槽等子项会在嵌套层数 ≥ 并发数时死锁（槽位被目录占满）
            if (!(await dirGate(this.ports.folder, ctx))) return false
            return this.execute(remoteTarget, childLocal, ctx, limiter)
          }
          // 文件：门控 + 占槽，实际字节传输受限制器约束
          return gatedDirTask(this.ports.folder, ctx, limiter, () =>
            this._uploadFile(
              remoteTarget, childLocal, path.posix.join(remoteTarget, safeName), st, false, ctx,
            ))
        })
      const folded = foldSettled(await Promise.allSettled(tasks))
      success = folded.success
      if (folded.firstErr != null) throw folded.firstErr
    } catch (e) {
      // ★ 2026-09-21 P1 修复：此前无 catch —— listChildren（无读权限/目录被删/磁盘错误）
      //   在 success 被赋值前抛出时，success 仍是初值 true，finally 会把压根没传成的
      //   目录 finish(ctx, true) 记成「成功」。与 MergeLocalDirUseCase 的处理保持一致。
      success = false
      log.error(`upload dir failed: ${localPath} :: ${errText(e)}`)
      throw e
    } finally {
      if (isTop && ctx) {
        const ok = success && !ctx.hadConflict && !this.ports.folder.isAborted(ctx)
        this.ports.folder.finish(ctx, ok)
      }
    }
    return success
  }

  private async _uploadFile(
    remoteDir: string,
    localPath: string,
    remoteTarget: string,
    st: import('fs').Stats,
    isTop: boolean,
    topCtx?: FolderTransferCtx,
  ): Promise<boolean> {
    const base = path.basename(localPath)
    const conflictResult = await this.ports.conflictDetection.checkUploadConflict(
      remoteTarget, localPath, st.size, st.mtimeMs,
    )
    if (conflictResult.kind === 'auto-skipped') {
      // ★ 2026-09-07 issue #15+：内容已确认相同，跳过本次上传。
      //   detector 已通过构造回调同步通知 host 把对应的传输记录标为「已跳过」。
      log.info('[upload-file] auto-skipped (content identical):', remoteTarget)
      // 对调用方而言视作"成功完成"（不阻断父级文件计数/进度推进），不调任何 download/upload。
      return true
    }
    if (conflictResult.kind === 'conflict') {
      const conflictInfo = conflictResult.info
      log.info('[upload-one] conflict for', remoteTarget, 'remoteSize:', conflictInfo.remoteSize, 'remoteMtime:', conflictInfo.remoteMtime)
      this.ports.conflictQueue.enqueue({
        localPath,
        remoteDir,
        fileName: base,
        remotePath: remoteTarget,
        localStat: st,
        direction: 'upload',
        remoteFileSize: conflictInfo.remoteSize,
        remoteFileMtime: conflictInfo.remoteMtime,
        // ★ 2026-08-11：携带来源传输 ctx（目录内子文件冲突时存在），解决成功后翻正记录
        transferCtx: topCtx,
        // ★ 2026-09-18 issue #15 修复：携带内容摘要供对话框展示
        localDigest: conflictInfo.localDigest,
        remoteDigest: conflictInfo.remoteDigest,
      })
      if (topCtx) this.ports.folder.markHadConflict(topCtx)
      this.ports.conflictQueue.showDialog()
      return true
    }

    // no-conflict：正常上传
    if (isTop) {
      return this.ports.execution.uploadTopLevel(remoteTarget, localPath)
    }

    const ok = await this.ports.execution.uploadRaw(remoteTarget, localPath)
    // ★ 2026-09-20：跳过当前若已落盘则记成功
    if (topCtx && this.ports.folder.consumeAbortCurrent(topCtx)) {
      if (!ok) return false
    } else if (!ok) {
      return false
    }
    if (topCtx) {
      topCtx.itemDone++
      if (st.size > 0) topCtx.bytesDone += st.size
      this.ports.folder.updateProgress(topCtx, topCtx.bytesDone, base, topCtx.itemDone, st.size)
    }
    return true
  }
}


/**
 * 功能描述：SFTP+ transfer-ops 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Composer
 * 修改时间：2026-09-17 — 目录冲突：本地大小用递归扫描结果，不再用 inode 的 Stats.size（常为 0）
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

import { type DownloadOnePort, type FolderTransferPort, type RemoteDirStatsPort, type SftpDirEntry, type TransferUseCasePorts, type LocalTransferFsPort, type SftpTransferPort, type TransferExecutionPort } from './transfer-types'


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
    /** ★ 2026-08-11：快速模式 getter：true 时跳过目录预扫描（无百分比进度） */
    private readonly fastMode?: () => boolean,
  ) {}

  async execute(
    remoteSrc: string,
    localDest: string,
    topCtx?: FolderTransferCtx,
    localName?: string,
    inLimiter?: ConcurrencyLimiter,
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
      // ★ 2026-08-11：tar 打包通道——仅当本地目标不存在（全新下载）时启用；
      //   success 传输成功；failed 中止；fallback 则平滑回退到常规逐文件流式传输
      if (this.ports.tarChannel && !(await this.ports.localFs.pathExists(localDir))) {
        const r = await this.ports.tarChannel.tryDownloadDir(remoteSrc, localDest, this.ports.folder, base)
        if (r === 'success') return true
        if (r === 'failed') return false
        log.info('[download-dir] tar channel fell back, starting standard file-by-file transfer:', remoteSrc)
      }
      // ★ 2026-08-11：快速模式跳过预扫描直接开传（总量未知 → 只显示已传字节/文件数）
      let totalSize = 0
      let itemCount = 0
      if (!this.fastMode?.()) {
        const s = await this.remoteStats.scanDir(remoteSrc)
        totalSize = s.size
        itemCount = s.count
      }
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
        // ★ 2026-08-26 M2：跳过 symlink（与删除/复制路径一致），避免跟随扩大下载范围
        if (entry.isSymlink) {
          log.info('skip symlink during folder download:', entry.name)
          return true
        }
        // ★ 2026-07-25：剥离服务器返回文件名中的目录组件与 ..，防止路径穿越
        const safeName = safeEntryName(entry.name)
        if (!safeName) {
          log.warn('skip unsafe entry name:', entry.name)
          return true
        }
        const remoteP = path.posix.join(remoteSrc, safeName)
        const localP = path.join(localDir, safeName)

        if (entry.isDirectory) {
          // ★ 2026-08-10 修复：目录只过中止/暂停门控、不占槽直接递归——
          //   目录持槽等子项会在嵌套层数 ≥ 并发数时死锁（槽位被目录占满）。
          //   递归子目录失败时向上传播失败标记（共享同一限制器）
          if (!(await dirGate(this.ports.folder, ctx))) return false
          return this.execute(remoteP, localDir, ctx, undefined, limiter)
        }

        // 文件：门控 + 占槽，实际字节传输受限制器约束
        return gatedDirTask(this.ports.folder, ctx, limiter, async (): Promise<boolean> => {
          const sz = entry.size || 0
          let remoteMtime = entryMtimeToMs(entry)
          if (remoteMtime === 0 || entry.modified == null) {
            try {
              const st = await this.ports.sftp.stat(remoteP)
              if (st) remoteMtime = entryMtimeToMs(st)
            } catch (e) {
              log.warn('stat fallback for folder download conflict failed:', remoteP, e)
            }
          }
          const conflictResult = await this.ports.conflictDetection.checkLocalConflict(localP, remoteP, sz, remoteMtime)
          if (conflictResult.kind === 'auto-skipped') {
            // ★ 2026-09-07 issue #15+：内容已确认相同，跳过该子文件（不覆盖本地）。
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
              // ★ 2026-08-11：携带来源传输 ctx，覆盖/重命名成功后翻正被误记失败的记录
              transferCtx: ctx,
            })
            if (ctx) this.ports.folder.markHadConflict(ctx)
            this.ports.conflictQueue.showDialog()
            return true
          }

          const ok = await this.ports.execution.downloadRaw(remoteP, localP, entry.mode, entry.size)
          // ★ 2026-08-26：跳过当前文件与上传侧对齐，记失败而非成功
          if (ctx && this.ports.folder.consumeAbortCurrent(ctx)) return false
          // ★ 2026-08-10 修复：静默失败的子文件不得计入进度/成功，否则含失败文件的
          //   文件夹传输被标记"成功 100%"；继续处理其余子文件但整体记为失败
          if (!ok) return false
          if (ctx) {
            // 单线程事件循环下同步自增无竞态
            if (sz > 0) ctx.bytesDone += sz
            ctx.itemDone++
            this.ports.folder.updateProgress(ctx, ctx.bytesDone, safeName, ctx.itemDone, sz)
          }
          return true
        })
      })
      const folded = foldSettled(await Promise.allSettled(tasks))
      success = folded.success
      if (folded.firstErr != null) throw folded.firstErr
    } catch (e) {
      success = false
      log.error('folder download failed:', remoteSrc, e)
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
  /** ★ 2026-08-11：非快速模式预扫描本地目录得真实总量（与常规目录上传一致） */
  scanLocalDir?(dirPath: string): Promise<{ size: number; count: number }>
  fastMode?(): boolean
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
    try { await this.ports.sftp.mkdir(remoteDest) } catch { /* 已存在 */ }

    let ownCtx: FolderTransferCtx | null = null
    if (isTop && !topCtx && this.ports.folder) {
      let totalSize = 0
      let itemCount = 0
      if (!this.ports.fastMode?.() && this.ports.scanLocalDir) {
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
          if (!ok) success = false
          else if (ctx && this.ports.folder) {
            ctx.itemDone++
            if (st.size > 0) ctx.bytesDone += st.size
            this.ports.folder.updateProgress(ctx, ctx.bytesDone, c.name, ctx.itemDone, st.size)
          }
        }
      }
    } finally {
      if (ownCtx && this.ports.folder) this.ports.folder.finish(ownCtx, success)
    }
    if (isTop) await this.ports.refreshRemote()
    return success
  }
}

// ─── 路径上传（单文件/目录递归）──────────────────────────────

export class UploadPathUseCase {
  constructor(
    private readonly ports: TransferUseCasePorts,
    /** ★ 2026-08-10：目录内文件级并发数 getter（实时读设置），缺省默认 3 */
    private readonly dirConcurrency?: () => number | undefined,
    /** ★ 2026-08-11：快速模式 getter：true 时跳过目录预扫描（无百分比进度） */
    private readonly fastMode?: () => boolean,
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
        const r = await this.ports.tarChannel.tryUploadDir(localPath, remoteTarget, this.ports.folder, base)
        if (r === 'success') return true
        if (r === 'failed') return false
        log.info('[upload-dir] tar channel fell back, starting standard file-by-file transfer:', localPath)
      }
      // ★ 2026-08-11：快速模式跳过预扫描直接开传（总量未知 → 只显示已传字节/文件数）
      let totalSize = 0
      let itemCount = 0
      if (!this.fastMode?.()) {
        const s = await this.ports.localFs.scanDir(localPath)
        totalSize = s.size
        itemCount = s.count
      }
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
        })
        this.ports.folder.markHadConflict(ctx)
        this.ports.conflictQueue.showDialog()
        this.ports.folder.finish(ctx, false)
        return false
      }
    }

    try { await this.ports.sftp.mkdir(remoteTarget) } catch {}
    const children = await this.ports.localFs.listChildren(localPath)
    // ★ 2026-08-10：目录内文件级并发（issue #10）——原 for await 串行改为递归各层
    //   共享的限制器池；暂停/中止门控在每个任务占槽前检查，已在途文件传完即停
    const limiter = inLimiter ?? new ConcurrencyLimiter(clampDirConcurrency(this.dirConcurrency?.()))
    // ★ 2026-08-10：跟踪子项失败并向上传播（中断/失败不得误报成功）
    let success = true
    try {
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
    if (topCtx && this.ports.folder.consumeAbortCurrent(topCtx)) return false
    // ★ 2026-08-10：上传失败的子文件不得计入进度，整体记为失败
    if (!ok) return false
    if (topCtx) {
      topCtx.itemDone++
      if (st.size > 0) topCtx.bytesDone += st.size
      this.ports.folder.updateProgress(topCtx, topCtx.bytesDone, base, topCtx.itemDone, st.size)
    }
    return true
  }
}


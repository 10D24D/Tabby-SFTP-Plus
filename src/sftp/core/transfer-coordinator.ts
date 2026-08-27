/**
 * 功能描述：SFTP+ transfer-coordinator 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-08-02 — B19：SftpTransferPort 实现 stat 方法，支持 attrs 嵌套字段
 * 合并来源：panel-transfer-coordinator, panel-transfer-runtime
 */

import * as fs from 'fs/promises'

import { type SFTPFile } from '../../services/sftp.service'

import { type ConflictDetectionPort, type ConflictQueuePort, SftpConflictDetector } from './conflict'

import { DownloadDirUseCase, DownloadOneUseCase, MergeLocalDirUseCase, UploadPathUseCase } from './transfer-ops'

import { type FolderTransferPort, type LocalTransferFsPort, type RemoteDirStatsPort, type SftpTransferPort, type TransferExecutionPort, type TransferUseCasePorts } from './transfer-types'

import { type ConflictFileInfo, type ConflictQueueItem, type FolderTransferCtx, type PanelTransferItem } from './panel-types'

import * as fsSync from 'fs'

import * as path from 'path'

import { LocalPathFileDownload, LocalPathFileUpload, uploadViaRawToTemp } from './transfer-adapters'

import { TarChannel } from './tar-channel'

import { execSshCommand } from './path-utils'

import { log } from '../../services/sftp-logger'
﻿/**
 * 传输用例协调器：组装 ports、冲突检测器与用例，供面板组件委托调用
 */


export interface PanelTransferHost {
  sftpSession: unknown
  /** ★ 2026-08-11：SSH 会话（tar 打包通道经 exec 打包/解包；可为 null） */
  sshSession?: unknown
  mtimeToleranceMs: number
  localPath: string
  enqueueConflict(item: ConflictQueueItem): void
  showConflictDialog(): void
  /** ★ 2026-08-11：单次遍历同时得出总大小与文件数（原 4 个串行递归函数） */
  scanLocalDir(dirPath: string): Promise<{ size: number; count: number }>
  scanRemoteDir(remotePath: string): Promise<{ size: number; count: number }>
  /** ★ 2026-08-11：快速模式（实时读设置）：目录传输跳过预扫描直接开传，代价是没有百分比进度 */
  fastMode?(): boolean
  startFolderTransfer(
    name: string,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    totalSize: number,
    itemCount: number,
    /** ★ 2026-08-11：复用既有传输记录条目（冲突覆盖合并用） */
    reuseLogEntryId?: string,
  ): FolderTransferCtx
  finishFolderTransfer(ctx: FolderTransferCtx, success: boolean): void
  /** ★ 2026-08-11：回填传输记录的真实目录大小（tar 打包通道用） */
  updateFolderLogSize(ctx: FolderTransferCtx, size: number): void
  updateFolderProgress(
    ctx: FolderTransferCtx,
    bytesDone: number,
    currentItem: string,
    itemDone: number,
    currentItemSize?: number,
  ): void
  // ★ 2026-08-10：传输方法返回 boolean（true=完整成功），供剪切粘贴删源前校验
  uploadTopLevel(remotePath: string, localPath: string): Promise<boolean>
  uploadRaw(remotePath: string, localPath: string): Promise<boolean>
  downloadTopLevel(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  downloadRaw(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  refreshRemote(): Promise<unknown>
  /** ★ 2026-08-10：目录内文件级并发数（1-10，实时读设置）；可选，缺省回落默认 3 */
  dirUploadConcurrency?(): number
  dirDownloadConcurrency?(): number
  /** ★ 2026-08-11：tar 通道下载 tar 包（不产生 UI 条目）；onProgress 上报字节，shouldAbort 为 true 时中断 */
  downloadTarBall(
    remotePath: string,
    localPath: string,
    size: number,
    onProgress?: (bytes: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<boolean>
}

export class PanelTransferCoordinator {
  readonly conflictDetection: ConflictDetectionPort
  private readonly uploadUseCase: UploadPathUseCase
  private readonly downloadOneUseCase: DownloadOneUseCase
  private readonly downloadDirUseCase: DownloadDirUseCase
  private readonly mergeLocalDirUseCase: MergeLocalDirUseCase

  constructor(private readonly host: PanelTransferHost) {
    this.conflictDetection = new SftpConflictDetector(
      () => host.sftpSession as any,
      host.mtimeToleranceMs,
    )
    const ports = this._buildPorts()
    this.downloadDirUseCase = new DownloadDirUseCase(
      ports, this._remoteStats(), () => host.dirDownloadConcurrency?.(), () => !!host.fastMode?.(),
    )
    this.downloadOneUseCase = new DownloadOneUseCase(ports, {
      getLocalPath: () => host.localPath,
      downloadDir: (remoteSrc, localDest) => this.downloadRemoteDir(remoteSrc, localDest),
    })
    this.uploadUseCase = new UploadPathUseCase(ports, () => host.dirUploadConcurrency?.(), () => !!host.fastMode?.())
    this.mergeLocalDirUseCase = new MergeLocalDirUseCase({
      localFs: ports.localFs,
      sftp: ports.sftp,
      execution: ports.execution,
      refreshRemote: () => host.refreshRemote(),
      // ★ 2026-08-11：合并覆盖也要有「传输中」面板（此前无进度条目，用户以为没在传）；
      //   非快速模式预扫描得真实总量，与常规目录上传一致
      folder: ports.folder,
      scanLocalDir: (dirPath) => host.scanLocalDir(dirPath),
      fastMode: () => !!host.fastMode?.(),
    })
  }

  uploadPathToRemote(remoteDir: string, localPath: string, top?: FolderTransferCtx): Promise<boolean> {
    return this.uploadUseCase.execute(remoteDir, localPath, top)
  }

  streamDownloadOne(file: SFTPFile, targetLocalDir?: string): Promise<void> {
    return this.downloadOneUseCase.execute(file, targetLocalDir)
  }

  downloadRemoteDir(
    remoteSrc: string,
    localDest: string,
    top?: FolderTransferCtx,
    localName?: string,
  ): Promise<boolean> {
    return this.downloadDirUseCase.execute(remoteSrc, localDest, top, localName)
  }

  mergeLocalDirToRemote(localSrc: string, remoteDest: string, reuseLogEntryId?: string): Promise<boolean> {
    return this.mergeLocalDirUseCase.execute(localSrc, remoteDest, true, reuseLogEntryId)
  }

  checkUploadConflict(
    remotePath: string,
    localPath: string,
    localSize: number,
    localMtime: number,
  ): Promise<ConflictFileInfo | null> {
    return this.conflictDetection.checkUploadConflict(remotePath, localPath, localSize, localMtime)
  }

  checkLocalConflict(
    localPath: string,
    remotePath: string,
    remoteSize: number,
    remoteMtime: number,
  ): Promise<ConflictFileInfo | null> {
    return this.conflictDetection.checkLocalConflict(localPath, remotePath, remoteSize, remoteMtime)
  }

  checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean> {
    return this.conflictDetection.checkRemotePathExists(remotePath, expectDir)
  }

  private _remoteStats(): RemoteDirStatsPort {
    const host = this.host
    return {
      scanDir: (p) => host.scanRemoteDir(p),
    }
  }

  /** ★ 2026-08-11：组装 tar 打包通道（仅目标不存在的全新传输时由用例启用） */
  private _tarChannel(): TarChannel {
    const host = this.host
    return new TarChannel({
      hasSsh: () => !!host.sshSession,
      exec: (cmd, timeoutMs) => execSshCommand(host.sshSession, cmd, timeoutMs),
      uploadFile: async (localPath, remotePath, onProgress, shouldAbort) => {
        const raw = host.sftpSession as any
        if (!raw) return false
        const up = new LocalPathFileUpload(localPath)
        const timer = setInterval(() => {
          if (shouldAbort?.() && !up.isCancelled()) void up.cancel()
          onProgress?.(up.getCompletedBytes())
        }, 400)
        try {
          // ★ 2026-08-11 修复：新版 Tabby（russh）的 SFTPSession 无 createWriteStream，
          //   直接调 uploadViaRawToTemp 会同步抛 TypeError 导致打包通道必败；
          //   与 uploadLocalFile 同款能力探测，无 raw stream 时回退标准 upload() API
          if (typeof raw.createWriteStream === 'function') {
            await uploadViaRawToTemp(raw, remotePath, up, 0)
          } else {
            await raw.upload(remotePath, up)
          }
          return !up.isCancelled() && !up.isPaused() && up.isComplete()
        } catch (e) {
          log.warn('tar channel tarball upload failed:', remotePath, e)
          return false
        } finally {
          clearInterval(timer)
          up.close().catch(() => {})
        }
      },
      downloadFile: (remotePath, localPath, size, onProgress, shouldAbort) =>
        host.downloadTarBall(remotePath, localPath, size, onProgress, shouldAbort),
      remoteUnlink: async (p) => {
        try { await (host.sftpSession as any).unlink(p) } catch { /* ignore */ }
      },
      // ★ 2026-08-11：本地扫描开销低，复用合并遍历的 scanLocalDir 取真实目录大小
      scanLocalSize: (p) => host.scanLocalDir(p).then(s => s?.size ?? 0).catch(() => 0),
      // ★ 2026-08-11：下载进度按真实大小显示；快速模式跳过远端扫描（尊重其提速语义）
      scanRemoteSize: (p) => host.fastMode?.()
        ? Promise.resolve(0)
        : host.scanRemoteDir(p).then(s => s?.size ?? 0).catch(() => 0),
    })
  }

  private _buildPorts(): TransferUseCasePorts {
    const host = this.host
    const conflictQueue: ConflictQueuePort = {
      enqueue: (item) => host.enqueueConflict(item),
      showDialog: () => host.showConflictDialog(),
    }
    const localFs: LocalTransferFsPort = {
      lstat: (p) => fs.lstat(p).catch(() => null),
      listChildren: async (p) => {
        const entries = await fs.readdir(p, { withFileTypes: true })
        return entries.map(e => ({ name: e.name, isSymbolicLink: e.isSymbolicLink() }))
      },
      scanDir: (p) => host.scanLocalDir(p),
      pathExists: (p) => fs.stat(p).then(() => true).catch(() => false),
      mkdirRecursive: async (p) => { try { await fs.mkdir(p, { recursive: true }) } catch {} },
    }
    const sftp: SftpTransferPort = {
      hasSession: () => !!host.sftpSession,
      mkdir: async (remotePath) => {
        try { await (host.sftpSession as any).mkdir(remotePath) } catch {}
      },
      readdir: async (remoteSrc) => {
        const entries = await (host.sftpSession as any).readdir(remoteSrc)
        return entries.map((e: any) => ({
          name: e.name,
          isDirectory: !!e.isDirectory,
          isSymlink: !!(e.isSymlink || e.isSymbolicLink),
          size: e.size,
          mode: e.mode,
          modified: e.modified,
        }))
      },
      stat: async (remotePath) => {
        const session = host.sftpSession as any
        if (!session?.stat) return null
        try {
          const st = await session.stat(remotePath)
          if (!st) return null
          return {
            name: path.posix.basename(remotePath),
            isDirectory: !!st.isDirectory,
            size: st.size ?? st.attrs?.size,
            mode: st.mode ?? st.attrs?.permissions ?? st.attrs?.mode,
            modified: st.modified ?? st.mtime ?? st.mtimeMs ?? st.attrs?.modified ?? st.attrs?.mtime,
            mtime: st.mtime ?? st.attrs?.mtime,
            attrs: st.attrs,
          }
        } catch (e: any) {
          if (e?.code === 'ENOENT' || /not exist/i.test(String(e?.message))) return null
          log.warn('sftp stat failed in transfer coordinator:', remotePath, e?.message)
          return null
        }
      },
    }
    const folder: FolderTransferPort = {
      start: (...args) => host.startFolderTransfer(...args),
      finish: (ctx, success) => host.finishFolderTransfer(ctx, success),
      updateLogSize: (ctx, size) => host.updateFolderLogSize(ctx, size),
      updateProgress: (...args) => host.updateFolderProgress(...args),
      markHadConflict: (ctx) => { ctx.hadConflict = true },
      isAborted: (ctx) => !!(ctx.t as any)?._aborted,
      isPaused: (ctx) => !!(ctx.t as any)?._paused,
      waitWhilePaused: async (ctx) => {
        while ((ctx.t as any)?._paused) {
          await new Promise(r => setTimeout(r, 1000))
          if ((ctx.t as any)?._aborted) break
        }
      },
      consumeAbortCurrent: (ctx) => {
        if ((ctx.t as any)?._abortCurrent) {
          delete (ctx.t as any)._abortCurrent
          return true
        }
        return false
      },
    }
    const execution: TransferExecutionPort = {
      uploadTopLevel: (remotePath, localPath) => host.uploadTopLevel(remotePath, localPath),
      uploadRaw: (remotePath, localPath) => host.uploadRaw(remotePath, localPath),
      downloadTopLevel: (remotePath, localPath, mode, size) =>
        host.downloadTopLevel(remotePath, localPath, mode, size),
      downloadRaw: (remotePath, localPath, mode, size) =>
        host.downloadRaw(remotePath, localPath, mode, size),
    }
    return {
      localFs,
      sftp,
      folder,
      execution,
      conflictDetection: this.conflictDetection,
      // ★ 2026-08-11：tar 打包通道（用例层仅在目标不存在时启用）
      tarChannel: this._tarChannel(),
      conflictQueue,
    }
  }
}



export interface PanelTransferRuntimeHost {
  connected: boolean
  sftpSession: any
  transfers: PanelTransferItem[]
  transferLog: {
    add(input: any): { id: string }
    update(id: string, patch: any): void
    remove(id: string): boolean
    getAll(): any[]
  }
  profile?: { name?: string }
  effectiveLang: string
  notifications: { error?: (message: string, detail?: string) => void } | null
  cdr: { detectChanges(): void }
  zone: { run<T>(fn: () => T): T }
  formatSpeed(bytes: number, ms: number): string
}

export class PanelTransferRuntime {
  private _transferMeta = new WeakMap<object, {
    prevBytes: number
    prevTime: number
    startTime: number
    lastProgressTime: number
  }>()
  private _transferTimer: ReturnType<typeof setInterval> | null = null
  private _trackedTransferCount = 0

  /**
   * ★ 2026-08-10 修复：排队条目取消的"粘性标记"（key=direction|localPath → 取消时刻）。
   * 竞态：_runQueuedUpload/Download 已通过 transfers.includes 检查开始执行，但尚未走到
   * trackTransfer 认领（中间隔着冲突检测 stat 等 RTT）；此时用户取消 queued 条目只删了 UI 条目，
   * 传输继续 → trackTransfer 找不到占位会新建条目 → "取消失败"（文件照传、条目再现）。
   * 认领前消费此标记：命中则直接 abort 底层传输且不建条目。短 TTL 避免误伤后续重新发起的同名传输。
   */
  private _queuedCancelKeys = new Map<string, number>()
  private static readonly QUEUED_CANCEL_TTL_MS = 10_000

  constructor(private readonly host: PanelTransferRuntimeHost) {}

  private _queuedCancelKey(direction: string, localPath: string, remotePath?: string): string {
    return direction + '|' + localPath + '|' + (remotePath || '')
  }

  /** 记录一次排队条目的取消（供 trackTransfer/_startFolderTransfer 认领前拦截） */
  recordQueuedCancel(direction?: string, localPath?: string, remotePath?: string): void {
    if (!direction || !localPath) return
    const now = Date.now()
    // ★ 2026-08-26 M18：TTL 扫描清理，避免粗暴删首项误伤有效取消标记
    for (const [k, ts] of this._queuedCancelKeys) {
      if (now - ts > PanelTransferRuntime.QUEUED_CANCEL_TTL_MS) this._queuedCancelKeys.delete(k)
    }
    this._queuedCancelKeys.set(this._queuedCancelKey(direction, localPath, remotePath), now)
  }

  /** 消费粘性取消标记：true=该传输在排队期间已被取消，调用方应立即 abort 且不建条目 */
  consumeQueuedCancel(direction?: string, localPath?: string, remotePath?: string): boolean {
    if (!direction || !localPath) return false
    // 兼容旧键（无 remotePath）与新键
    const keys = [
      this._queuedCancelKey(direction, localPath, remotePath),
      this._queuedCancelKey(direction, localPath),
    ]
    for (const key of keys) {
      const ts = this._queuedCancelKeys.get(key)
      if (ts == null) continue
      this._queuedCancelKeys.delete(key)
      return Date.now() - ts <= PanelTransferRuntime.QUEUED_CANCEL_TTL_MS
    }
    return false
  }

  async trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): Promise<void> {
    // ★ 2026-08-10 修复：排队期间已被取消（竞态窗口内传输已启动）——
    //   直接 abort 底层传输且不认领/新建条目，避免"取消后文件照传、条目再现"
    if (this.consumeQueuedCancel(direction, localPath)) {
      try { await t.cancel?.() } catch { /* ignore */ }
      return
    }
    // ★ 修复：getSize 可能是异步的（LocalPathFileUpload 返回 Promise<number>），
    //   必须 await，否则 bytesTotal 会被设成 Promise → percent 计算为 NaN → 进度条宽度崩、百分比恒为 0
    const sz = (await Promise.resolve(t.getSize?.())) || 0
    const profileName = this.host.profile?.name || undefined
    const operation = logOperation ?? direction

    // ★ 2026-08-10：认领预注册的排队占位条目（多选拖拽/下载）——复用占位条目与日志，
    //   避免占位条目与实际传输条目重复显示
    const claimed = this.host.transfers.find(
      e => e.queued && e.direction === direction && e.localPath === localPath,
    )
    if (claimed) {
      if (sz === 0) {
        // 空文件立即完成：移除占位并收尾日志
        this.host.transfers = this.host.transfers.filter(x => x !== claimed)
        if (claimed.logEntryId != null) {
          this.host.transferLog.update(claimed.logEntryId, { success: true, duration: 0, endTime: Date.now(), pending: false })
        }
        return
      }
      claimed.transfer = t
      claimed.queued = false
      claimed.bytesTotal = sz
      claimed.bytesDone = 0
      claimed.percent = 0
      if (claimed.logEntryId != null) {
        this.host.transferLog.update(claimed.logEntryId, { size: sz, startTime: Date.now() })
      }
      const claimNow = Date.now()
      this._transferMeta.set(claimed, { prevBytes: 0, prevTime: claimNow, startTime: claimNow, lastProgressTime: claimNow })
      this._trackedTransferCount++
      this._startTransferTimer()
      return
    }

    const logEntry = this.host.transferLog.add({
      operation,
      localPath,
      remotePath,
      profileName,
      success: true,
      size: sz,
      duration: 0,
      startTime: Date.now(),
      pending: sz > 0,  // ★ 修复：sz=0 立即完成无需 pending；>0 时标进行中
    })

    if (sz === 0) {
      this.host.transferLog.update(logEntry.id, { success: true, duration: 0, endTime: Date.now() })
      return
    }

    const entry: PanelTransferItem = {
      transfer: t,
      direction,
      // ★ 2026-08-10：下载走 .tmp 原子落盘、上传走 .tabby-upload，getName() 会带临时后缀，
      //   展示层统一剥离，避免传输列表显示 xxx.tmp
      name: String(t.getName()).replace(/\.(tmp|tabby-upload)$/, ''),
      remotePath,
      localPath,
      percent: 0,
      speed: '',
      bytesDone: 0,
      bytesTotal: sz,
      logEntryId: logEntry.id,
      paused: false,
    }
    this.host.transfers.push(entry)

    const now = Date.now()
    this._transferMeta.set(entry, { prevBytes: 0, prevTime: now, startTime: now, lastProgressTime: now })
    this._trackedTransferCount++
    this._startTransferTimer()
  }

  cancelTransfer(entry: { transfer: any; logEntryId?: string; paused?: boolean; isFolder?: boolean }): void {
    // ★ 2026-08-10：排队占位条目尚未开始传输——直接移除条目并删掉占位日志（不产生"已取消"记录）。
    //   同时记粘性取消标记：若传输已过调度检查正在启动（尚未认领），trackTransfer/认领处会拦截 abort
    if ((entry as any).queued) {
      this.recordQueuedCancel((entry as any).direction, (entry as any).localPath)
      this.host.transfers = this.host.transfers.filter(x => x !== entry)
      if (entry.logEntryId != null) {
        try { this.host.transferLog.remove(entry.logEntryId) } catch { /* ignore */ }
      }
      return
    }
    if (entry.transfer) {
      try {
        if (typeof entry.transfer.cancel === 'function') entry.transfer.cancel()
        else if (typeof entry.transfer.destroy === 'function') entry.transfer.destroy()
      } catch {}
    }
    if (entry.isFolder) {
      ;(entry as any)._aborted = true
    }
    // ★ 2026-07-25 B12：取消"暂停态"的下载时清理孤儿 .tmp——
    //   活动中的下载由 downloadRemoteFile 自己收尾；但暂停态的下载其收尾逻辑早已退出
    //   （暂停分支特意保留 .tmp 供续传），此时取消便无人删除半截 .tmp，永久残留。
    this._cleanupPausedDownloadTmp(entry)
    this._cleanupPausedUploadTmp(entry)
    this.host.transfers = this.host.transfers.filter(x => x !== entry)
    if (this._transferMeta.has(entry as any)) {
      this._transferMeta.delete(entry as any)
      this._trackedTransferCount--
      if (this._trackedTransferCount <= 0) {
        this._trackedTransferCount = 0
        this._stopTransferTimer()
      }
    }
    if (entry.logEntryId != null) {
      this.host.transferLog.update(entry.logEntryId, { success: false, endTime: Date.now(), failReason: 'cancelled', pending: false })
    }
  }

  cancelCurrentFile(entry: { isFolder?: boolean }): void {
    if (entry.isFolder) {
      ;(entry as any)._abortCurrent = true
    }
  }

  /**
   * ★ 2026-07-25 B12：清理"暂停态下载"取消后的孤儿 .tmp。
   *   仅对 paused 的单文件下载生效（无活动写入方，删除安全）；
   *   活动中的下载各自的收尾逻辑（downloadRemoteFile / 续传路径）负责自清理。
   */
  private _cleanupPausedDownloadTmp(entry: any): void {
    if (entry?.isFolder || !entry?.paused) return
    if (entry.direction !== 'download' || !entry.localPath) return
    const tmp = entry.localPath + '.tmp'
    try { fsSync.unlinkSync(tmp) } catch { /* 不存在或已被清理 */ }
  }

  /**
   * ★ 2026-07-25 B13：清理"暂停态上传"取消后的孤儿 .tabby-upload 临时文件。
   *   上传暂停时 uploadViaRawToTemp 已结束流但保留临时文件（供续传）；若此时再取消，
   *   上传循环已退出、无人删临时文件，需在此补删。仅对 paused 的单文件上传生效（无活动写入方）。
   */
  private _cleanupPausedUploadTmp(entry: any): void {
    if (entry?.isFolder || !entry?.paused) return
    if (entry.direction !== 'upload' || !entry.remotePath) return
    // ★ 2026-08-10 修复：remotePath 是远程 POSIX 路径，必须用 SFTP 会话删除。
    //   旧实现用本地 fsSync.unlinkSync：Windows 上被解析为当前盘符相对路径，
    //   远程孤儿临时文件永远无法清理，还可能误删本地同名文件。
    const session = this.host.sftpSession
    if (!session || typeof session.unlink !== 'function') return
    try {
      const p = session.unlink(entry.remotePath + '.tabby-upload')
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => { /* 不存在或已改名 */ })
      }
    } catch { /* ignore */ }
  }

  /**
   * 暂停传输（文件夹：标记 _paused，等当前子文件完成后再停；
   *             单文件：关闭 fd 并取消底层 SFTP 流，返回当前偏移用于续传）
   * 修改人：DD1024z + Hy3
   * 修改时间：2026-07-23
   *   ① await pause()：offset 是 async 返回值 Promise<number>，不加 await 会把 Promise 当 number 传给 resume，
   *      导致续传时 resumeOffset 为 NaN → 文件 'w' 截断写入 → 下载重头开始。
   *   ② await cancel()：pause() 只关 fd 不杀 SFTP 流，流会回调 write() 重新打开 fd；
   *      resume 又起新传输 → 两个传输同时写同一文件 → 数据损坏。
   */
  async pauseTransfer(entry: any): Promise<void> {
    if (entry.queued) return  // ★ 2026-08-10：排队条目无底层传输对象，不可暂停
    if (entry.paused) return
    if (entry.isFolder) {
      // ★ 文件夹暂停：只设标记不cancel当前子文件，等当前文件完成后在下一文件开始前停，
      //   避免打断当前文件导致续传后该文件丢失或重头下载。
      ;(entry as any)._paused = true
      entry.paused = true
      this.host.cdr.detectChanges()
      return
    }
    try {
      const offset = await entry.transfer.pause?.() ?? 0
      // ★ 2026-07-25 B13：单文件上传走 raw stream，暂停只结束流、保留 .tabby-upload 临时文件，
      //   故不再调 cancel()（cancel 会置 cancelled 触发删临时文件）。下载/文件夹仍需 cancel() 杀底层流。
      if (entry.direction !== 'upload') {
        await entry.transfer.cancel?.()
      }
      this.host.zone.run(() => { entry.paused = true })
      entry._pauseOffset = offset
      log.info(`Transfer paused: ${entry.name} at offset ${offset}`)
    } catch (e) {
      log.error('Pause failed', e)
    }
  }

  /**
   * 恢复传输（文件夹：取消 _paused 标记，下载循环继续下个子文件；
   *             单文件：用续传位创建新 transfer 替换旧对象）
   * 修改人：DD1024z + Hy3
   * 修改时间：2026-07-23
   *   续传后重置 meta.prevBytes/prevTime/startTime，避免使用旧 transfer 的 stale 基准点：
   *   prevBytes=0 ⇒ 下个 tick 算 delta = offset - 0 ⇒ 速率飙升；
   *   startTime=original ⇒ 日志耗时包含暂停时长 ⇒ 虚高。
   */
  async resumeTransfer(entry: any): Promise<void> {
    if (entry.queued) return  // ★ 2026-08-10：排队条目无底层传输对象，不可续传
    if (!entry.paused) return
    if (entry.isFolder) {
      delete (entry as any)._paused
      this.host.zone.run(() => { entry.paused = false })
      this.host.cdr.detectChanges()
      return
    }
    try {
      this.host.zone.run(() => { entry.paused = false })
      this.host.cdr.detectChanges()
      // 上传和下载必须走不同续传实现。此前这里无条件调用 _resumeWithRawRead，
      // 会把远端半成品下载回来并最终覆盖本地上传源文件。
      const direction = entry.direction as 'upload' | 'download'
      const remotePath = entry.remotePath as string
      const localPath = entry.localPath as string
      const tmpPath = localPath + '.tmp'
      const mode = entry.transfer.getMode?.() || 0o644
      const totalSize = (await Promise.resolve(entry.transfer.getSize?.())) || 0
      const offset = entry._pauseOffset ?? 0
      const info = direction === 'upload'
        ? await this._resumeTransfer(entry, 'upload', remotePath, localPath, offset)
        : await this._resumeWithRawRead(entry, remotePath, tmpPath, localPath, mode, totalSize, offset)
      this.host.zone.run(() => {
        entry.transfer = info.transfer
        entry.percent = info.percent
        // ★ 修复：重置速率/耗时基准点，避免续传后用了旧 transfer 的 stale prevBytes/startTime
        const meta = this._transferMeta.get(entry as any)
        if (meta) {
          meta.prevBytes = info.transfer.getCompletedBytes?.() ?? 0
          meta.prevTime = Date.now()
          meta.startTime = Date.now()
          meta.lastProgressTime = Date.now()
        }
      })
      delete entry._pauseOffset
      log.info(`Transfer resumed: ${entry.name} (${direction})`)
    } catch (e) {
      log.error('Resume failed', e)
      entry.paused = true
    }
  }

  clearTransfers(): void {
    const now = Date.now()
    for (const t of this.host.transfers) {
      // ★ 2026-08-26 H3：目录用例必须标 _aborted，否则清空/销毁后仍继续跑
      if ((t as any).isFolder) {
        ;(t as any)._aborted = true
      }
      // ★ 2026-08-10：排队占位条目从未开始传输，直接删除占位日志而非标记 interrupted
      if ((t as any).queued) {
        if (t.logEntryId) {
          try { this.host.transferLog.remove(t.logEntryId) } catch { /* ignore */ }
        }
        continue
      }
      // 同步更新日志状态，避免 pending:true 残留
      if (t.logEntryId) {
        try {
          this.host.transferLog.update(t.logEntryId, {
            success: false, endTime: now, failReason: 'interrupted', pending: false,
          })
        } catch {}
      }
      if (t.transfer) {
        try {
          if (typeof t.transfer.cancel === 'function') t.transfer.cancel()
          else if (typeof t.transfer.destroy === 'function') t.transfer.destroy()
        } catch {}
      }
      // ★ 2026-07-25 B12：批量清理时同样处理暂停态下载的孤儿 .tmp
      // ★ 2026-07-25 B13：以及暂停态上传的孤儿 .tabby-upload
      this._cleanupPausedDownloadTmp(t)
      this._cleanupPausedUploadTmp(t)
    }
    this.host.transfers = []
    this._trackedTransferCount = 0
    this._stopTransferTimer()
  }

  dispose(): void {
    this._stopTransferTimer()
  }

  private _startTransferTimer(): void {
    if (this._transferTimer) return
    this._transferTimer = setInterval(() => this._tickAllTransfers(), 200)
  }

  private _stopTransferTimer(): void {
    if (this._transferTimer) {
      clearInterval(this._transferTimer)
      this._transferTimer = null
    }
  }

  private _tickAllTransfers(): void {
    if (this.host.transfers.length === 0) {
      this._stopTransferTimer()
      return
    }
    let needsDetect = false
    const toRemove: PanelTransferItem[] = []
    for (const entry of this.host.transfers) {
      const meta = this._transferMeta.get(entry as any)
      if (!meta) continue
      const t = entry.transfer
      try {
        if (!this.host.connected) {
          // ★ 2026-08-15 修复 #2：断连后暂停传输也无法恢复（SFTP 会话已丢失），
          //   一并清理避免 UI 永久僵尸
          try {
            if (typeof t.cancel === 'function') t.cancel()
            else if (typeof t.destroy === 'function') t.destroy()
          } catch { /* ignore */ }
          toRemove.push(entry)
          this.host.transferLog.update(entry.logEntryId!, {
            success: false,
            duration: Date.now() - meta.startTime,
            endTime: Date.now(),
            failReason: 'interrupted',
            pending: false,
          })
          continue
        }
        if (entry.paused) { entry.speed = ''; continue }
        const done = Number(t.getCompletedBytes?.()) || 0
        // ★ 兜底：bytesTotal 若出现非有限数字（如历史 Promise 残留），按 0 处理避免 percent=NaN 污染 UI
        const total = Number(entry.bytesTotal) || 0
        const newPercent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
        entry.bytesDone = done
        const now = Date.now()
        if (done > meta.prevBytes || newPercent >= 100) {
          meta.lastProgressTime = now
        }
        const elapsed = now - meta.prevTime
        if (elapsed >= 500) {
          const delta = done - meta.prevBytes
          // 仅在有新进度时更新速率；delta=0 时保留上次速度（避免卡顿时闪烁为空）
          if (delta > 0) {
            entry.speed = this.host.formatSpeed(delta, elapsed)
          }
          // 始终推进基准点，保证下次计算窗口正确
          meta.prevBytes = done
          meta.prevTime = now
        }
        if (newPercent !== entry.percent) {
          entry.percent = newPercent
          needsDetect = true
        } else if (elapsed >= 1000) {
          needsDetect = true
        }
        const stallMs = now - meta.lastProgressTime
        if (stallMs > 900000) {
          try {
            if (typeof t.cancel === 'function') t.cancel()
            else if (typeof t.destroy === 'function') t.destroy()
          } catch { /* ignore */ }
          toRemove.push(entry)
          this.host.transferLog.update(entry.logEntryId!, {
            success: false,
            duration: now - meta.startTime,
            endTime: now,
            failReason: 'error',
            pending: false,
          })
          continue
        }
        if (t.isComplete?.() || t.isCancelled?.() || t.isFailed?.() || entry.percent >= 100) {
          // 兜底：若速率窗口未触发（极快传输 <500ms 完成），用总平均速度填充，避免最后仍显示 '--'
          if (!entry.speed && done > 0) {
            const dur = Math.max(1, now - meta.startTime)
            entry.speed = this.host.formatSpeed(done, dur)
          }
          toRemove.push(entry)
          // ★ 2026-08-10：失败标记（raw 读错误等）也计入失败，避免非取消类错误被误报成功
          const finalSuccess = !t.isCancelled?.() && !t.isFailed?.()
          this.host.transferLog.update(entry.logEntryId!, { success: finalSuccess, duration: now - meta.startTime, endTime: now, failReason: finalSuccess ? undefined : 'error', pending: false })
        }
      } catch {
        toRemove.push(entry)
        this.host.transferLog.update(entry.logEntryId!, { success: false, duration: Date.now() - meta.startTime, endTime: Date.now(), failReason: 'error', pending: false })
      }
    }
    for (const entry of toRemove) {
      this._transferMeta.delete(entry as any)
      this.host.transfers = this.host.transfers.filter(x => x !== entry)
      this._trackedTransferCount--
    }
    if (needsDetect) this.host.cdr.detectChanges()
    if (this._trackedTransferCount <= 0) {
      this._trackedTransferCount = 0
      this._stopTransferTimer()
    }
  }

  private async _resumeTransfer(
    entry: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    offset: number,
  ): Promise<{ transfer: any; percent: number }> {
    if (!this.host.sftpSession) throw new Error('No SFTP session')
    // 兼容异步 getSize（LocalPathFileUpload 返回 Promise）
    const totalSize = (await Promise.resolve(entry.transfer.getSize?.())) || 0
    const rawSftp = this.host.sftpSession as any
    const hasRawStream = direction === 'upload'
      ? typeof rawSftp.createWriteStream === 'function'
      : typeof rawSftp.createReadStream === 'function'

    if (direction === 'upload') {
      // ★ 2026-07-25 B13：初始上传也写 `remotePath.tabby-upload` 临时文件，故续传点取该临时文件实际大小
      let remoteOffset = 0
      const tempPath = remotePath + '.tabby-upload'
      try {
        const tempStat = await this.host.sftpSession.stat(tempPath)
        const tempSize = Number(tempStat?.size)
        if (Number.isFinite(tempSize) && tempSize > 0 && tempSize <= totalSize) {
          remoteOffset = tempSize
        }
      } catch {
        // 临时文件不存在：从头上传
      }

      let up: LocalPathFileUpload
      if (hasRawStream) {
        up = new LocalPathFileUpload(localPath, remoteOffset)
        // ★ 2026-08-10：补 catch——流错误时避免 unhandled rejection（对比非 raw 分支已有 catch）
        // ★ 2026-08-15 修复 #1：流失败时标记 failed，避免 UI 僵尸态（最长等 15 分钟 stall 超时）
        uploadViaRawToTemp(rawSftp, remotePath, up, remoteOffset).catch(async (e: unknown) => {
          if (!up.isCancelled?.() && !up.isPaused()) {
            try { await up._markFailed?.() } catch {}
            log.error('Resume raw upload failed', e)
          }
        })
      } else {
        // 标准 upload API 不支持远端 offset；传入本地 offset 会只上传后缀并截断目标。
        // 因此不支持 raw stream 时必须完整重传，优先保证数据完整性。
        remoteOffset = 0
        up = new LocalPathFileUpload(localPath)
        // ★ 2026-08-15 修复 #1：标准 upload 失败也标记 failed
        this.host.sftpSession.upload(remotePath, up as any).catch(async (e: any) => {
          if (!up.isCancelled?.()) {
            try { await up._markFailed?.() } catch {}
            log.error('Resume upload failed', e)
          }
        })
      }
      const percent = totalSize > 0 ? Math.min(99, Math.round((remoteOffset / totalSize) * 100)) : 0
      return { transfer: up, percent }
    } else {
      const percent = totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 0
      // ★ 2026-07-24：续传写入 .tmp，下载完成且大小匹配才改名
      // 始终走 sftpSession.download（标准 SFTP read 带 offset），不用 createReadStream（部分服务端不 honor start 选项，导致从字节 0 重发）
      const tmpPath = localPath + '.tmp'
      const dl = new LocalPathFileDownload(
        tmpPath, entry.transfer.getMode?.() || 0o644, totalSize, offset,
      )
      const cleanupOnCancel = (): boolean => {
        // ★ 2026-07-25 B12：续传中被"取消"（非暂停）→ 删除半截 .tmp；暂停则保留供下次续传
        if (dl.isCancelled?.() && !(dl as any).paused) {
          try { fsSync.unlinkSync(tmpPath) } catch { /* ignore */ }
          return true
        }
        return false
      }
      const renameOnDone = () => {
        if (cleanupOnCancel() || (dl as any).paused) return
        try {
          const stat = fsSync.statSync(tmpPath)
          if (totalSize > 0 && stat.size !== totalSize) {
            log.error(`Resume size mismatch: expected ${totalSize}, got ${stat.size}. Keep ${tmpPath}`)
            return
          }
          fsSync.renameSync(tmpPath, localPath)
          log.info(`Resume completed & renamed: ${localPath}`)
        } catch (e) {
          log.error('Resume rename failed:', e)
        }
      }
      this.host.sftpSession.download(remotePath, dl as any)
        .then(() => renameOnDone())
        .catch((e: any) => {
          if (cleanupOnCancel()) return
          if (!dl.isCancelled?.()) log.error('Resume download failed', e)
        })
      return { transfer: dl, percent }
    }
  }

  private _rawDownload(rawSftp: any, remotePath: string, dl: LocalPathFileDownload, offset: number, onComplete?: () => void): void {
    const dir = path.dirname(dl.targetPath)
    if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true })
    const flags = offset > 0 ? 'r+' : 'w'
    let localFd: number | null = null
    let fdClosed = false
    const closeFd = () => {
      if (localFd !== null && !fdClosed) {
        try { fsSync.closeSync(localFd) } catch {}
        fdClosed = true
        localFd = null
      }
    }
    try {
      localFd = fsSync.openSync(dl.targetPath, flags)
      if (offset > 0) fsSync.ftruncateSync(localFd, offset)
    } catch (e) {
      log.error('Raw download open error', e)
      // ★ 2026-08-10：打开失败记为失败而非完成，避免传输日志误报成功
      try { (dl as any)._markFailed?.() } catch {}
      return
    }
    const readStream = rawSftp.createReadStream(remotePath, { start: offset })
    let writePos = offset
    readStream.on('data', (chunk: Buffer) => {
      try {
        if (fdClosed || localFd === null) { readStream.destroy(); return }
        fsSync.writeSync(localFd, chunk, 0, chunk.length, writePos)
        writePos += chunk.length
        dl.increaseProgress(chunk.length)
        if (dl.isCancelled?.()) {
          readStream.destroy()
          closeFd()
        }
      } catch (e) {
        log.error('Raw download write error', e)
        closeFd()
        readStream.destroy()
      }
    })
    readStream.on('end', () => {
      closeFd()
      void Promise.resolve(dl._markComplete())
      if (onComplete) onComplete()
    })
    readStream.on('error', (err: Error) => {
      closeFd()
      if (!dl.isCancelled?.()) {
        log.error('Raw download stream error', err)
        try { (dl as any)._markFailed?.() } catch {}
      }
    })
  }

  /**
   * ★ 2026-07-24：用底层 SFTP open/read（支持 offset）实现真正的断点续传下载。
   *   绕过 Tabby download API（不支持 offset）和 createReadStream（start 不靠谱）。
   */
  private async _resumeWithRawRead(
    entry: any, remotePath: string, tmpPath: string, localPath: string,
    mode: number, totalSize: number, offset: number,
  ): Promise<{ transfer: any; percent: number }> {
    const rawSftp = this.host.sftpSession as any
    // ★ 检测底层 API 是否存在——不存在则回退全量重下
    if (!rawSftp || typeof rawSftp.open !== 'function' || typeof rawSftp.read !== 'function') {
      log.warn('Raw SFTP open/read not available, fallback to full redownload')
      // 清理 .tmp，全量重下
      try { fsSync.unlinkSync(tmpPath) } catch {}
      try { fsSync.unlinkSync(localPath) } catch {}
      return this._resumeTransfer(entry, 'download', remotePath, localPath, 0)
    }
    const bufSize = 1024 * 1024
    const percent = totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 0
    const dl = new LocalPathFileDownload(tmpPath, mode, totalSize, offset)
    this._rawReadLoop(rawSftp, remotePath, dl, tmpPath, localPath, offset, totalSize, bufSize).catch(
      (e: any) => { if (!dl.isCancelled?.()) log.error('Raw resume failed', e) },
    )
    return { transfer: dl, percent }
  }

  private async _rawReadLoop(
    rawSftp: any, remotePath: string, dl: LocalPathFileDownload,
    tmpPath: string, localPath: string,
    offset: number, totalSize: number, bufSize: number,
  ): Promise<void> {
    let position = offset
    let handle: Buffer | null = null
    try {
      handle = await new Promise<Buffer>((resolve, reject) => {
        rawSftp.open(remotePath, 'r', (err: any, h: Buffer) => { if (err) reject(err); else resolve(h) })
      })
      while (position < totalSize && !dl.isCancelled?.()) {
        const buf = Buffer.alloc(bufSize)
        const bytesRead = await new Promise<number>((resolve, reject) => {
          rawSftp.read(handle, buf, 0, bufSize, position, (err: any, br: number) => {
            if (err) reject(err); else resolve(br)
          })
        })
        if (bytesRead === 0) break
        await dl.write(buf.subarray(0, bytesRead))
        position += bytesRead
      }
      await dl.close()
      // ★ 2026-07-25 B12：raw 续传中被"取消"（非暂停）→ 删除半截 .tmp 后直接退出；暂停保留供续传
      if (dl.isCancelled?.() && !(dl as any).paused) {
        try { fsSync.unlinkSync(tmpPath) } catch { /* ignore */ }
        return
      }
      try {
        const stat = fsSync.statSync(tmpPath)
        if (totalSize > 0 && stat.size !== totalSize) {
          log.error(`Raw resume size mismatch: expected ${totalSize}, got ${stat.size}`)
          // ★ 2026-08-10：大小不匹配记为失败，避免传输条目挂到 15 分钟 stall 超时才移除
          try { await dl._markFailed?.() } catch {}
          return
        }
        fsSync.renameSync(tmpPath, localPath)
        log.info(`Raw resume completed: ${localPath}`)
        dl._markComplete?.()
      } catch (e) {
        log.error('Raw resume rename failed', e)
        try { await dl._markFailed?.() } catch {}
      }
    } catch (e) {
      // ★ 2026-08-10 修复：区分取消/暂停/真错误。
      //   旧实现无条件 _markComplete() 导致非取消类错误（读错误/权限）被记为成功；
      //   且取消时 dl.write() 抛错直接进 catch，跳过了 .tmp 清理。
      try { await dl.close() } catch {}
      if (dl.isCancelled?.() && !(dl as any).paused) {
        // 取消（非暂停）：删除半截 .tmp
        try { fsSync.unlinkSync(tmpPath) } catch { /* ignore */ }
      } else if ((dl as any).paused) {
        // 暂停：保留 .tmp 供下次续传，不标记完成/失败
      } else {
        log.error('Raw resume error', e)
        try { await dl._markFailed?.() } catch {}
      }
    } finally {
      if (handle) {
        try {
          await new Promise<void>((resolve) => {
            const closeTimeout = setTimeout(() => {
              log.warn('SFTP close handle timed out')
              resolve()
            }, 5000)
            rawSftp.close(handle, () => {
              clearTimeout(closeTimeout)
              resolve()
            })
          })
        } catch {}
      }
    }
  }
}


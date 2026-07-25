/**
 * 功能描述：SFTP+ transfer-coordinator 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-16
 * 合并来源：panel-transfer-coordinator, panel-transfer-runtime
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-23
 *   trackTransfer 与所有 finish/cancel/disconnect/stall/catch 的 transferLog.update
 *   均补 pending 标记：add 时 pending=true（sz>0 时），update 完成时 pending=false，
 *   与 sftp-transfer-log.service 新增字段对齐，修复日志"传输中误显示成功"bug。
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — B12 取消下载清理半截 .tmp：
 *   ① cancelTransfer/clearTransfers 对"暂停态"下载删除孤儿 .tmp；
 *   ② _resumeTransfer 下载分支与 _rawReadLoop 在"取消（非暂停）"时删除 .tmp 并退出。
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — B13 上传改走 raw stream（uploadViaRawToTemp 写 .tabby-upload 临时文件）：
 *   暂停只结束流保留临时文件（供续传）、取消删临时文件保留原文件；初始与续传语义统一，
 *   故 pauseTransfer 对单文件上传不再调 cancel()；cancelTransfer/clearTransfers 补删暂停态上传孤儿 .tabby-upload。
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


import { log } from '../../services/sftp-logger'
﻿/**
 * 传输用例协调器：组装 ports、冲突检测器与用例，供面板组件委托调用
 */


export interface PanelTransferHost {
  sftpSession: unknown
  mtimeToleranceMs: number
  localPath: string
  enqueueConflict(item: ConflictQueueItem): void
  showConflictDialog(): void
  calcLocalDirSize(dirPath: string): Promise<number>
  countLocalDirItems(dirPath: string): Promise<number>
  calcRemoteDirSize(remotePath: string): Promise<number>
  countRemoteDirItems(remotePath: string): Promise<number>
  startFolderTransfer(
    name: string,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    totalSize: number,
    itemCount: number,
  ): FolderTransferCtx
  finishFolderTransfer(ctx: FolderTransferCtx, success: boolean): void
  updateFolderProgress(
    ctx: FolderTransferCtx,
    bytesDone: number,
    currentItem: string,
    itemDone: number,
    currentItemSize?: number,
  ): void
  uploadTopLevel(remotePath: string, localPath: string): Promise<void>
  uploadRaw(remotePath: string, localPath: string): Promise<void>
  downloadTopLevel(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void>
  downloadRaw(remotePath: string, localPath: string, mode?: number, size?: number): Promise<void>
  refreshRemote(): Promise<unknown>
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
    this.downloadDirUseCase = new DownloadDirUseCase(ports, this._remoteStats())
    this.downloadOneUseCase = new DownloadOneUseCase(ports, {
      getLocalPath: () => host.localPath,
      downloadDir: (remoteSrc, localDest) => this.downloadRemoteDir(remoteSrc, localDest),
    })
    this.uploadUseCase = new UploadPathUseCase(ports)
    this.mergeLocalDirUseCase = new MergeLocalDirUseCase({
      localFs: ports.localFs,
      sftp: ports.sftp,
      execution: ports.execution,
      refreshRemote: () => host.refreshRemote(),
    })
  }

  uploadPathToRemote(remoteDir: string, localPath: string, top?: FolderTransferCtx): Promise<void> {
    return this.uploadUseCase.execute(remoteDir, localPath, top)
  }

  streamDownloadOne(file: SFTPFile): Promise<void> {
    return this.downloadOneUseCase.execute(file)
  }

  downloadRemoteDir(
    remoteSrc: string,
    localDest: string,
    top?: FolderTransferCtx,
    localName?: string,
  ): Promise<void> {
    return this.downloadDirUseCase.execute(remoteSrc, localDest, top, localName)
  }

  mergeLocalDirToRemote(localSrc: string, remoteDest: string): Promise<void> {
    return this.mergeLocalDirUseCase.execute(localSrc, remoteDest)
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
      calcDirSize: (p) => host.calcRemoteDirSize(p),
      countDirItems: (p) => host.countRemoteDirItems(p),
    }
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
      calcDirSize: (p) => host.calcLocalDirSize(p),
      countDirItems: (p) => host.countLocalDirItems(p),
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
          size: e.size,
          mode: e.mode,
          modified: e.modified,
        }))
      },
    }
    const folder: FolderTransferPort = {
      start: (...args) => host.startFolderTransfer(...args),
      finish: (ctx, success) => host.finishFolderTransfer(ctx, success),
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

  constructor(private readonly host: PanelTransferRuntimeHost) {}

  async trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): Promise<void> {
    // ★ 修复：getSize 可能是异步的（LocalPathFileUpload 返回 Promise<number>），
    //   必须 await，否则 bytesTotal 会被设成 Promise → percent 计算为 NaN → 进度条宽度崩、百分比恒为 0
    const sz = (await Promise.resolve(t.getSize?.())) || 0
    const profileName = this.host.profile?.name || undefined
    const operation = logOperation ?? direction

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
      name: t.getName(),
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
    try { fsSync.unlinkSync(entry.remotePath + '.tabby-upload') } catch { /* 不存在或已改名 */ }
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
          if (!entry.paused) {
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
          }
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
        if (t.isComplete?.() || t.isCancelled?.() || entry.percent >= 100) {
          // 兜底：若速率窗口未触发（极快传输 <500ms 完成），用总平均速度填充，避免最后仍显示 '--'
          if (!entry.speed && done > 0) {
            const dur = Math.max(1, now - meta.startTime)
            entry.speed = this.host.formatSpeed(done, dur)
          }
          toRemove.push(entry)
          const finalSuccess = !t.isCancelled?.()
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
        uploadViaRawToTemp(rawSftp, remotePath, up, remoteOffset)
      } else {
        // 标准 upload API 不支持远端 offset；传入本地 offset 会只上传后缀并截断目标。
        // 因此不支持 raw stream 时必须完整重传，优先保证数据完整性。
        remoteOffset = 0
        up = new LocalPathFileUpload(localPath)
        this.host.sftpSession.upload(remotePath, up as any).catch((e: any) => {
          if (!up.isCancelled?.()) log.error('Resume upload failed', e)
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
      try { (dl as any)._markComplete?.() } catch {}
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
      if (!dl.isCancelled?.()) log.error('Raw download stream error', err)
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
          return
        }
        fsSync.renameSync(tmpPath, localPath)
        log.info(`Raw resume completed: ${localPath}`)
        dl._markComplete?.()
      } catch (e) {
        log.error('Raw resume rename failed', e)
      }
    } catch (e) {
      log.error('Raw resume error', e)
      // 确保下载对象被正确关闭并标记完成，避免 UI 卡死 15 分钟
      try { await dl.close() } catch {}
      try { dl._markComplete?.() } catch {}
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


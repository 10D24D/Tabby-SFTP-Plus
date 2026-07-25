/**
 * 功能描述：SFTP+ transfer-ops 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25 — safeEntryName 防路径穿越；文件夹下载 try/finally 收尾
 * 合并来源：download-use-cases, upload-use-cases
 */

import * as path from 'path'

import { type Stats } from 'fs'

import { type FolderTransferCtx } from './panel-types'

import { type SFTPFile } from '../../services/sftp.service'

import { safeEntryName } from './path-utils'

import { type DownloadOnePort, type RemoteDirStatsPort, type SftpDirEntry, type TransferUseCasePorts, type LocalTransferFsPort, type SftpTransferPort, type TransferExecutionPort } from './transfer-types'


import { log } from '../../services/sftp-logger'
﻿/**
 * 下载用例（单文件 + 目录递归）
 * 合并自: download-dir-use-case.ts, download-one-use-case.ts
 */



// ─── 目录下载 ───────────────────────────────────────────────

export class DownloadDirUseCase {
  constructor(
    private readonly ports: TransferUseCasePorts,
    private readonly remoteStats: RemoteDirStatsPort,
  ) {}

  async execute(
    remoteSrc: string,
    localDest: string,
    topCtx?: FolderTransferCtx,
    localName?: string,
  ): Promise<void> {
    if (!this.ports.sftp.hasSession()) return

    const rawBase = localName || path.posix.basename(remoteSrc)
    const base = safeEntryName(rawBase)
    if (!base) {
      log.warn('skip download dir with unsafe name:', rawBase)
      return
    }
    const localDir = path.join(localDest, base)
    const isTop = !topCtx
    let ctx = topCtx

    if (isTop) {
      const [totalSize, itemCount] = await Promise.all([
        this.remoteStats.calcDirSize(remoteSrc),
        this.remoteStats.countDirItems(remoteSrc),
      ])
      ctx = this.ports.folder.start(base, 'download', remoteSrc, localDir, totalSize, itemCount)
    }

    let success = true
    try {
      await this.ports.localFs.mkdirRecursive(localDir)
      const entries = await this.ports.sftp.readdir(remoteSrc)

      for (const entry of entries) {
        if (ctx && this.ports.folder.isAborted(ctx)) { success = false; break }
        if (ctx) await this.ports.folder.waitWhilePaused(ctx)
        if (ctx && this.ports.folder.isAborted(ctx)) { success = false; break }

        // ★ 2026-07-25：剥离服务器返回文件名中的目录组件与 ..，防止路径穿越
        const safeName = safeEntryName(entry.name)
        if (!safeName) {
          log.warn('skip unsafe entry name:', entry.name)
          continue
        }
        const remoteP = path.posix.join(remoteSrc, safeName)
        const localP = path.join(localDir, safeName)

        if (entry.isDirectory) {
          await this.execute(remoteP, localDir, ctx)
          continue
        }

        const sz = entry.size || 0
        const remoteMtime = entry.modified?.getTime?.() ?? Date.now()
        const conflict = await this.ports.conflictDetection.checkLocalConflict(localP, remoteP, sz, remoteMtime)
        if (conflict) {
          this.ports.conflictQueue.enqueue({
            localPath: localP,
            remoteDir: path.posix.dirname(remoteP),
            fileName: safeName,
            remotePath: remoteP,
            localStat: { size: conflict.localSize, mtimeMs: conflict.localMtime } as Stats,
            direction: 'download',
            remoteFileSize: sz,
            remoteFileMtime: remoteMtime,
          })
          if (ctx) this.ports.folder.markHadConflict(ctx)
          this.ports.conflictQueue.showDialog()
          continue
        }

        await this.ports.execution.downloadRaw(remoteP, localP, entry.mode, entry.size)
        if (ctx && this.ports.folder.consumeAbortCurrent(ctx)) continue
        if (ctx) {
          if (sz > 0) ctx.bytesDone += sz
          ctx.itemDone++
          this.ports.folder.updateProgress(ctx, ctx.bytesDone, safeName, ctx.itemDone, sz)
        }
      }
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
  }
}

// ─── 单文件/目录下载 ────────────────────────────────────────

export class DownloadOneUseCase {
  constructor(
    private readonly ports: TransferUseCasePorts,
    private readonly downloadOne: DownloadOnePort,
  ) {}

  async execute(file: SFTPFile): Promise<void> {
    const localBase = this.downloadOne.getLocalPath()

    if (file.isDirectory) {
      // ★ 2026-07-25：剥离目录组件与 ..，防路径穿越
      const safeName = safeEntryName(file.name)
      if (!safeName) {
        log.warn('skip download dir with unsafe name:', file.name)
        return
      }
      const localDir = path.join(localBase, safeName)
      if (await this.ports.localFs.pathExists(localDir)) {
        this.ports.conflictQueue.enqueue({
          localPath: localDir,
          remoteDir: path.posix.dirname(file.fullPath),
          fileName: safeName,
          remotePath: file.fullPath,
          localStat: { size: 0, mtimeMs: Date.now() } as Stats,
          direction: 'download',
          isDirectory: true,
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
    const remoteMtime = file.modified?.getTime?.() ?? Date.now()
    const conflict = await this.ports.conflictDetection.checkLocalConflict(
      localPath, file.fullPath, file.size ?? 0, remoteMtime,
    )
    if (conflict) {
      this.ports.conflictQueue.enqueue({
        localPath,
        remoteDir: path.posix.dirname(file.fullPath),
        fileName: safeName,
        remotePath: file.fullPath,
        localStat: { size: conflict.localSize, mtimeMs: conflict.localMtime } as Stats,
        direction: 'download',
        remoteFileSize: file.size ?? 0,
        remoteFileMtime: remoteMtime,
      })
      return
    }

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
}

export class MergeLocalDirUseCase {
  constructor(private readonly ports: MergeLocalDirPorts) {}

  async execute(localSrc: string, remoteDest: string): Promise<void> {
    if (!this.ports.sftp.hasSession()) return
    try { await this.ports.sftp.mkdir(remoteDest) } catch { /* 已存在 */ }

    const children = await this.ports.localFs.listChildren(localSrc)
    for (const c of children) {
      if (c.isSymbolicLink) continue
      const localP = path.join(localSrc, c.name)
      const remoteP = path.posix.join(remoteDest, c.name)
      const st = await this.ports.localFs.lstat(localP)
      if (!st) continue
      if (st.isDirectory()) {
        await this.execute(localP, remoteP)
      } else {
        await this.ports.execution.uploadRaw(remoteP, localP)
      }
    }
    await this.ports.refreshRemote()
  }
}

// ─── 路径上传（单文件/目录递归）──────────────────────────────

export class UploadPathUseCase {
  constructor(private readonly ports: TransferUseCasePorts) {}

  async execute(
    remoteDir: string,
    localPath: string,
    topCtx?: FolderTransferCtx,
  ): Promise<void> {
    if (!this.ports.sftp.hasSession()) return
    const st = await this.ports.localFs.lstat(localPath)
    if (!st) return
    if (st.isSymbolicLink()) return

    const base = path.basename(localPath)
    const remoteTarget = path.posix.join(remoteDir, base)
    const isTop = !topCtx

    if (st.isDirectory()) {
      await this._uploadDirectory(remoteDir, localPath, remoteTarget, st, isTop, topCtx)
      return
    }

    await this._uploadFile(remoteDir, localPath, remoteTarget, st, isTop, topCtx)
  }

  private async _uploadDirectory(
    remoteDir: string,
    localPath: string,
    remoteTarget: string,
    st: import('fs').Stats,
    isTop: boolean,
    topCtx?: FolderTransferCtx,
  ): Promise<void> {
    let ctx = topCtx
    if (isTop) {
      const [totalSize, itemCount] = await Promise.all([
        this.ports.localFs.calcDirSize(localPath),
        this.ports.localFs.countDirItems(localPath),
      ])
      const base = path.basename(localPath)
      ctx = this.ports.folder.start(base, 'upload', remoteTarget, localPath, totalSize, itemCount)
      if (await this.ports.conflictDetection.checkRemotePathExists(remoteTarget, true)) {
        this.ports.conflictQueue.enqueue({
          localPath,
          remoteDir,
          fileName: base,
          remotePath: remoteTarget,
          localStat: st,
          direction: 'upload',
          isDirectory: true,
        })
        this.ports.folder.markHadConflict(ctx)
        this.ports.conflictQueue.showDialog()
        this.ports.folder.finish(ctx, false)
        return
      }
    }

    try { await this.ports.sftp.mkdir(remoteTarget) } catch {}
    const children = await this.ports.localFs.listChildren(localPath)
    try {
      for (const c of children) {
        if (c.isSymbolicLink) continue
        if (ctx && this.ports.folder.isAborted(ctx)) break
        if (ctx) await this.ports.folder.waitWhilePaused(ctx)
        if (ctx && this.ports.folder.isAborted(ctx)) break
        await this.execute(remoteTarget, path.join(localPath, c.name), ctx)
      }
    } finally {
      if (isTop && ctx) {
        const ok = !ctx.hadConflict && !this.ports.folder.isAborted(ctx)
        this.ports.folder.finish(ctx, ok)
      }
    }
  }

  private async _uploadFile(
    remoteDir: string,
    localPath: string,
    remoteTarget: string,
    st: import('fs').Stats,
    isTop: boolean,
    topCtx?: FolderTransferCtx,
  ): Promise<void> {
    const base = path.basename(localPath)
    const conflict = await this.ports.conflictDetection.checkUploadConflict(
      remoteTarget, localPath, st.size, st.mtimeMs,
    )
    if (conflict) {
      this.ports.conflictQueue.enqueue({
        localPath,
        remoteDir,
        fileName: base,
        remotePath: remoteTarget,
        localStat: st,
        direction: 'upload',
      })
      if (topCtx) this.ports.folder.markHadConflict(topCtx)
      this.ports.conflictQueue.showDialog()
      return
    }

    if (isTop) {
      await this.ports.execution.uploadTopLevel(remoteTarget, localPath)
      return
    }

    await this.ports.execution.uploadRaw(remoteTarget, localPath)
    if (topCtx && this.ports.folder.consumeAbortCurrent(topCtx)) return
    if (topCtx) {
      topCtx.itemDone++
      if (st.size > 0) topCtx.bytesDone += st.size
      this.ports.folder.updateProgress(topCtx, topCtx.bytesDone, base, topCtx.itemDone, st.size)
    }
  }
}


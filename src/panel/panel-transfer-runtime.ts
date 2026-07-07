import * as fsSync from 'fs'
import * as path from 'path'

import { LocalPathFileDownload, LocalPathFileUpload } from '../local-transfers'
import type { PanelTransferItem } from './panel-types'

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

  trackTransfer(
    t: any,
    direction: 'upload' | 'download',
    remotePath: string,
    localPath: string,
    logOperation?: 'upload' | 'download' | 'edit-upload' | 'edit-download',
  ): void {
    const sz = t.getSize?.() || 0
    const profileName = this.host.profile?.name || ''
    const operation = logOperation ?? direction
    console.log('[SFTP+][trackTransfer] called', { direction, operation, localPath, remotePath, size: sz })

    const logEntry = this.host.transferLog.add({
      operation,
      localPath,
      remotePath,
      profileName,
      success: true,
      size: sz,
      duration: 0,
      startTime: Date.now(),
    })
    console.log('[SFTP+][trackTransfer] log entry added, id=', logEntry.id, 'total logs=', this.host.transferLog.getAll().length)

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
      this.host.transferLog.update(entry.logEntryId, { success: false, endTime: Date.now(), failReason: 'cancelled' })
    }
  }

  cancelCurrentFile(entry: { isFolder?: boolean }): void {
    if (entry.isFolder) {
      ;(entry as any)._abortCurrent = true
    }
  }

  pauseTransfer(entry: any): void {
    if (entry.paused) return
    if (entry.isFolder) {
      ;(entry as any)._paused = true
      entry.paused = true
      this.host.cdr.detectChanges()
      return
    }
    try {
      const offset = entry.transfer.pause?.() ?? 0
      this.host.zone.run(() => { entry.paused = true })
      entry._pauseOffset = offset
      console.log(`[SFTP+] Transfer paused: ${entry.name} at offset ${offset}`)
    } catch (e) {
      console.error('[SFTP+] Pause failed', e)
    }
  }

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
      const offset = entry._pauseOffset ?? entry.transfer.getCompletedBytes?.() ?? 0
      const direction = entry.direction as 'upload' | 'download'
      const remotePath = entry.remotePath as string
      const localPath = entry.localPath as string
      const info = await this._resumeTransfer(entry, direction, remotePath, localPath, offset)
      this.host.zone.run(() => {
        entry.transfer = info.transfer
        entry.percent = info.percent
      })
      delete entry._pauseOffset
      console.log(`[SFTP+] Transfer resumed: ${entry.name} from offset ${offset}`)
    } catch (e) {
      console.error('[SFTP+] Resume failed', e)
      entry.paused = true
    }
  }

  clearTransfers(): void {
    for (const t of this.host.transfers) {
      if (t.transfer) {
        try {
          if (typeof t.transfer.cancel === 'function') t.transfer.cancel()
          else if (typeof t.transfer.destroy === 'function') t.transfer.destroy()
        } catch {}
      }
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
            })
          }
          continue
        }
        if (entry.paused) { entry.speed = ''; continue }
        const done = t.getCompletedBytes?.() || 0
        const newPercent = Math.min(100, Math.round((done / entry.bytesTotal) * 100))
        entry.bytesDone = done
        const now = Date.now()
        if (done > meta.prevBytes || newPercent >= 100) {
          meta.lastProgressTime = now
        }
        const elapsed = now - meta.prevTime
        if (elapsed >= 1000) {
          const delta = done - meta.prevBytes
          entry.speed = this.host.formatSpeed(delta, elapsed)
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
          })
          continue
        }
        if (t.isComplete?.() || t.isCancelled?.() || entry.percent >= 100) {
          toRemove.push(entry)
          const finalSuccess = !t.isCancelled?.()
          this.host.transferLog.update(entry.logEntryId!, { success: finalSuccess, duration: now - meta.startTime, endTime: now, failReason: finalSuccess ? undefined : 'error' })
        }
      } catch {
        toRemove.push(entry)
        this.host.transferLog.update(entry.logEntryId!, { success: false, duration: Date.now() - meta.startTime, endTime: Date.now(), failReason: 'error' })
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
    const totalSize = entry.transfer.getSize?.() || 0
    const percent = totalSize > 0 ? Math.min(99, Math.round((offset / totalSize) * 100)) : 0
    const rawSftp = this.host.sftpSession as any
    const hasRawStream = direction === 'upload'
      ? typeof rawSftp.createWriteStream === 'function'
      : typeof rawSftp.createReadStream === 'function'

    if (direction === 'upload') {
      const up = new LocalPathFileUpload(localPath, offset)
      if (hasRawStream) {
        this._rawUpload(rawSftp, remotePath, up, offset)
      } else {
        this.host.sftpSession.upload(remotePath, up as any).catch((e: any) => {
          if (!up.isCancelled?.()) console.error('[SFTP+] Resume upload failed', e)
        })
      }
      return { transfer: up, percent }
    } else {
      const dl = new LocalPathFileDownload(
        localPath, entry.transfer.getMode?.() || 0o644, totalSize, offset,
      )
      if (hasRawStream) {
        this._rawDownload(rawSftp, remotePath, dl, offset)
      } else {
        this.host.sftpSession.download(remotePath, dl as any).catch((e: any) => {
          if (!dl.isCancelled?.()) console.error('[SFTP+] Resume download failed', e)
        })
      }
      return { transfer: dl, percent }
    }
  }

  private _rawUpload(rawSftp: any, remotePath: string, up: LocalPathFileUpload, offset: number): void {
    const writeStream = rawSftp.createWriteStream(remotePath, { start: offset })
    const readNext = () => {
      up.read().then(buf => {
        if (up.isCancelled?.()) { writeStream.destroy(); return }
        if (buf.length === 0) { writeStream.end(); return }
        writeStream.write(buf, () => readNext())
      }).catch(e => {
        console.error('[SFTP+] Raw upload read error', e)
        writeStream.destroy()
      })
    }
    writeStream.on('finish', () => {
      try { (up as any)._markComplete?.() } catch {}
    })
    writeStream.on('error', (err: Error) => {
      if (!up.isCancelled?.()) console.error('[SFTP+] Raw upload stream error', err)
    })
    readNext()
  }

  private _rawDownload(rawSftp: any, remotePath: string, dl: LocalPathFileDownload, offset: number): void {
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
      console.error('[SFTP+] Raw download open error', e)
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
        console.error('[SFTP+] Raw download write error', e)
        closeFd()
        readStream.destroy()
      }
    })
    readStream.on('end', () => {
      closeFd()
      dl._markComplete()
    })
    readStream.on('error', (err: Error) => {
      closeFd()
      if (!dl.isCancelled?.()) console.error('[SFTP+] Raw download stream error', err)
    })
  }
}

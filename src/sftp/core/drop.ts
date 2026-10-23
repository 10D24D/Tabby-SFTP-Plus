/**
 * 功能描述：SFTP+ drop 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Hy4 preview
 * @修改时间：2026-10-20 — 拖放落点接入收尾（冲突执行体端点化后解锁）：local-paths → 左栏远程
 *              2026-10-20 全量审计：_handleOsPaths 的「OS 文件拖入左栏远程端点」由显式拒绝改为接入
 *                uploadLocalToRemoteEndpoint —— 与面板内本机条目拖入同一条通道，消除行为分叉。
 *              （上传）此前端口未实现、只能显式拒绝，现已由面板 `uploadLocalToRemoteEndpoint`
 *              真正上传，目标已存在时入队端点化冲突（覆盖 / 跳过 / 重命名）而不是静默跳过；
 *              兜底提示保留（端口未实现或端点会话不可用时仍需显式拒绝，别静默吞掉拖放）。
 *              2026-10-20 — 左栏切远程端点后的**拖放落点**（用户反馈：远程↔远程右键能传、拖拽却
 *              提示「暂不支持拖放到此」）：新增 DropTransferPort.transferRemoteEntries? /
 *              uploadLocalToRemoteEndpoint? 与 PanelDropHost 同名可选成员（逐跳显式判存在性，
 *              两端都是 `?` 成员时 TS 不报漏转发）。_handleInternalPayload 增加两个分支：
 *              remote-paths → 另一栏远程端点（destPane 决定方向，跨栏限定，同栏仍由面板自身处理）、
 *              local-paths → 左栏远程（上传，暂未接线 ⇒ 显式拒绝提示，不静默）。同时把
 *              _handleInternalPayload 接收 crossPane，右栏本地(rl) 时 isLocalPaneTarget('remote')
 *              也参与判定。
 *              2026-10-19 — ★ 全量审计 P1-10 修复（左栏可切远程端点 ⇒ 拖放目标栏不可信）：
 *              ① internal payload 的 remote-paths→local 分支与 ② OS 路径的 local 分支都补
 *              _isReallyLocalPane 守卫（此前只有 local-paths 分支有），并新增
 *              DropNotifyPort.dropTargetNotLocal? 做显式拒绝提示（新 key notify.dropTargetNotLocal，
 *              24 语言由 scripts/add-drop-target-not-local-i18n.mjs 追加）；
 *              面板侧 onDragStartLocal 按 _leftKind 分流到 _onDragStartLeftRemote（此前左栏远程
 *              条目恒产出 kind='local-paths' + POSIX fullPath ⇒ 接收侧当本地路径读，ENOENT 全败），
 *              _resolveDropDestDir 对左栏远程端点改用 posix.dirname（win32 dirname 会产出混合分隔符）。
 *              2026-09-29 — ★ 接入「多选批量上传」（用户提议：多选一批文件、可含文件夹，其实也能
 *              走一个 tar 归档）。此前 drop 两处（内部 payload 与 OS 路径）都是
 *              paths.map(streamUploadOne) → 文件夹各自打包、散装文件恒走逐文件。现在两处都在
 *              Promise.all 之前先试 _tryBatchUpload：返回 true（本批已被单个 tar 归档接管）则
 *              刷新远端并直接返回；返回 false 则完全按原流程逐项处理。
 *              DropTransferPort / PanelDropHost 各加可选 tryUploadBatch?，适配层按存在性转发。
 *              2026-09-21 — 修复旧 Node 复制回退跟随符号链接，并让异步 UI 刷新走安全入口；
 *              第六轮审计 P2 修复：_toSftpFile 的 modified 占位改 epoch(0)
 *              （让下载用例的 stat 兜底真正生效，此前 new Date() 占位使其永不触发）
 *              2026-09-20 — P2-2 审计修复：拖入兜底临时目录 sftp-plus-dragdrop 按面板作用域分目录，
 *              新增 dragDropTempDir()，供面板销毁时定向清理（此前该目录无任何清理路径）
 *              2026-08-02 — B19：_toSftpFile 增加 modified 无效 fallback 与诊断 log
 * 合并来源：drop-rules, drop-use-case, panel-drop-adapter, panel-file-drop-parser
 */

import * as path from 'path'
import { randomUUID } from 'crypto'

import { type DragPayload } from './panel-types'

import * as fs from 'fs/promises'

import { type ChangeDetectorRef } from '@angular/core'

import { type SFTPFile } from '../../services/sftp.service'

import { isPathInside } from './fs-ops'

import * as os from 'os'

import { safeEntryName } from './path-utils'

import { log } from '../../services/sftp-logger'
/**
 * Drop 领域规则（纯函数，无 Angular / DOM / IO）
 */


export type DropPane = 'local' | 'remote'

export type RemoteDropEntry = {
  remotePath: string
  name: string
  isDirectory: boolean
  size?: number
  mode?: number
  modified?: number
}

/** POSIX 远程目录归一化（去掉尾部斜杠，保留根路径） */
export function normRemoteDir(p: string): string {
  const n = path.posix.normalize(p || '/')
  return n.length > 1 && n.endsWith('/') ? n.slice(0, -1) : n
}

/** 内部拖拽落点与源在同一目录（同面板拖放无意义） */
export function isSameDirInternalDrop(
  payload: DragPayload,
  targetPane: DropPane,
  localPath: string,
  remotePath: string,
): boolean {
  if (payload.kind === 'local-paths' && targetPane === 'local') {
    const cur = path.resolve(localPath)
    return payload.paths.every(p => path.resolve(path.dirname(p.fullPath)) === cur)
  }
  if (payload.kind === 'remote-paths' && targetPane === 'remote') {
    const cur = normRemoteDir(remotePath)
    return payload.paths.every(p => normRemoteDir(path.posix.dirname(p.remotePath)) === cur)
  }
  return false
}

/** OS 拖入路径是否全部来自本地面板当前目录（同目录无操作） */
export function isOsDropIntoSameLocalDir(osPaths: string[], localPath: string): boolean {
  if (!osPaths.length) return false
  const cur = path.resolve(localPath)
  return osPaths.every(p => path.resolve(path.dirname(p)) === cur)
}

/**
 * Drop 用例：端口定义 + 编排逻辑
 * 合并自: drop-ports.ts, drop-use-case.ts
 */

// ─── 端口定义 ───────────────────────────────────────────────

/** 用例输入：由基础设施层从 DOM 事件解析后传入 */
export interface DropExecuteInput {
  targetPane: DropPane
  rawPayload: DragPayload | null
  osPaths: string[]
  /** ★ 2026-09-20：拖到文件夹行时覆盖落点目录（否则用当前 cwd） */
  destDirOverride?: string
  /**
   * ★ issue #27 P3：目标栏标识（左栏/右栏）。与 rawPayload.srcPane 配合判定「跨栏拖放」——
   * 跨栏时即使两栏当前目录相同也不得走「同目录无操作」早退（那会把 左栏→右栏 的同目录
   * 拖放静默吞掉，用户拖一个同名文件毫无反馈）。缺省（旧调用方）保持原行为。
   */
  targetPaneId?: 'left' | 'right'
}

export interface DropContextPort {
  getLocalPath(): string
  getRemotePath(): string
  isConnected(): boolean
  hasSftpSession(): boolean
  /**
   * ★ issue #27 P3（可选）：目标 pane 是否真是「本地磁盘」端点。
   * 左栏处于远程端点时 getLocalPath() 返回的是 POSIX 路径，绝不能当本地目录写入——
   * 本地→本地复制分支必须经此守卫。未实现时按「不可复制」处理（保守）。
   */
  isLocalPaneTarget?(pane: DropPane): boolean
}

export interface DropTransferPort {
  uploadToRemote(remoteDir: string, localPath: string): Promise<boolean>
  /** 上传入队：预注册占位条目 + 并发调度（与下载对称）；destRemoteDir 可选覆盖目标目录 */
  streamUploadOne(localPath: string, destRemoteDir?: string): Promise<void>
  /**
   * ★ 2026-09-29（四）：多选/拖拽多项先试「整批打成一个归档」。
   * 返回 true = 本批已由打包通道处理完，调用方**必须直接收工**（再逐项入队会重传整批）；
   * 返回 false = 未接管，按原有逐项流程处理。
   * 可选成员：未实现时按「未接管」处理 —— 拖拽在任何情况下都不能因这条加速路径变差。
   */
  tryUploadBatch?(localPaths: string[], remoteDir: string): Promise<boolean>
  downloadRemoteEntry(entry: RemoteDropEntry, destLocalDir?: string): Promise<void>
  /**
   * ★ 2026-10-20（用户反馈）：目标栏是**远程端点**（左栏切到远程 / 右栏本身是远程）时的跨栏通道 ——
   *   此前左栏远程时这类拖放一律被 `_isReallyLocalPane` 守卫拒绝并提示「暂不支持拖放到此」，
   *   而右键菜单的「传输」已经能做同样的事。两个端口分别对应：
   *   - `transferRemoteEntries`：远程条目 → 另一栏的远程端点（远程↔远程直传，方向由 destPane 定）
   *   - `uploadLocalToRemoteEndpoint`：本机条目 → 左栏远程（上传）
   *   返回 true = 已接管（含已入队的冲突项）；未实现时调用方退回「拒绝并提示」的旧行为。
   */
  transferRemoteEntries?(entries: RemoteDropEntry[], destDir: string, destPane: 'left' | 'right'): Promise<boolean>
  uploadLocalToRemoteEndpoint?(localPaths: string[], destDir: string): Promise<boolean>
}

export interface DropPanePort {
  refreshLocal(): Promise<void>
  refreshRemote(): Promise<void>
  clearLocalSelection(): void
  clearRemoteSelection(): void
}

export interface DropConflictPort {
  hasPendingConflicts(): boolean
  showConflictDialog(): void
}

export interface DropFilesystemPort {
  copyIntoLocalDir(sources: string[], destDir: string): Promise<void>
}

export interface DropNotifyPort {
  copyFailed(fileName: string): void
  /**
   * ★ 2026-10-19 P1（audit）：目标栏不是本地磁盘端点（左栏切到了远程端点）时的拒绝提示。
   * 可选成员：未实现（旧调用方/未接线）时静默拒绝，绝不退化成「往 POSIX 路径写本地文件」。
   */
  dropTargetNotLocal?(): void
}

export interface DropDragStatePort {
  reset(): void
}

export interface DropUiPort {
  markViewDirty(): void
}

export interface DropPorts {
  context: DropContextPort
  transfer: DropTransferPort
  pane: DropPanePort
  conflict: DropConflictPort
  filesystem: DropFilesystemPort
  notify: DropNotifyPort
  dragState: DropDragStatePort
  ui: DropUiPort
}

// ─── 用例编排 ───────────────────────────────────────────────

export class DropUseCase {
  constructor(private readonly ports: DropPorts) {}

  async execute(input: DropExecuteInput): Promise<void> {
    const { targetPane, rawPayload, osPaths, destDirOverride } = input
    const ctx = this.ports.context

    // ★ issue #27 P3：跨栏拖放（源栏≠目标栏）即使两栏目录相同也不早退——
    // 同目录跨栏拖同名文件应弹出冲突提示，而非静默吞掉。
    // 源/目标栏标识任一缺失（旧调用方/OS 拖入）按原逻辑早退。
    const crossPane = !!rawPayload?.srcPane && !!input.targetPaneId && rawPayload.srcPane !== input.targetPaneId
    if (rawPayload && !crossPane && isSameDirInternalDrop(
      rawPayload,
      targetPane,
      destDirOverride || ctx.getLocalPath(),
      destDirOverride || ctx.getRemotePath(),
    )) {
      this.ports.dragState.reset()
      this.ports.ui.markViewDirty()
      return
    }

    this.ports.dragState.reset()

    if (rawPayload) {
      const handled = await this._handleInternalPayload(rawPayload, targetPane, destDirOverride, crossPane)
      if (handled) return
    }

    await this._handleOsPaths(osPaths, targetPane, destDirOverride, crossPane)
  }

  /**
   * ★ 2026-09-29（四）：拖拽多项先试「整批打成一个归档」。
   *
   * 返回 true = 本批已由打包通道处理完，调用方**必须直接收工**（继续逐项入队会把整批重传一遍）。
   * 端口未实现 / 抛异常一律按「未接管」处理：批量打包只是叠加在逐项通道之上的加速，
   * 它自己出任何意外都不该让这次拖拽失败（那会比没有它更差）。
   */
  private async _tryBatchUpload(paths: string[], remoteDir: string): Promise<boolean> {
    if (paths.length < 2) return false
    const f = this.ports.transfer.tryUploadBatch
    if (!f) return false
    try {
      return await f(paths, remoteDir)
    } catch (e) {
      log.warn('[batch-upload] drop batch path threw, using per-file flow:', e)
      return false
    }
  }

  /**
   * ★ 2026-10-19 P1（audit）：判断目标栏是否**真的是本地磁盘**。
   * targetPane 是几何语义（左栏='local'、右栏='remote'），而左栏可以切到远程端点，
   * 此时 ctx.getLocalPath() 返回的是 POSIX 路径，任何 copyIntoLocalDir/downloadRemoteEntry
   * 都会把东西写到 `C:\var\www` 这类凭空拼出的盘根路径上且毫无报错。
   * 端口未实现时按「真的本地」放行（保持旧行为，避免误伤未接线的调用方）。
   */
  private _isReallyLocalPane(ctx: DropContextPort, pane: DropPane): boolean {
    if (typeof ctx.isLocalPaneTarget !== 'function') return true
    return ctx.isLocalPaneTarget(pane)
  }

  private async _handleInternalPayload(
    payload: DragPayload,
    targetPane: DropPane,
    destDirOverride?: string,
    crossPane = false,
  ): Promise<boolean> {
    const ctx = this.ports.context
    if (!ctx.isConnected() || !ctx.hasSftpSession()) return false

    if (payload.kind === 'local-paths' && targetPane === 'remote') {
      const remoteDir = destDirOverride || ctx.getRemotePath()
      // ★ 2026-09-29（四）：多项时先试整批打包；已接管则直接收工（勿再逐项入队）
      if (await this._tryBatchUpload(payload.paths.map(p => p.fullPath), remoteDir)) {
        if (this.ports.conflict.hasPendingConflicts()) {
          this.ports.conflict.showConflictDialog()
        }
        await this.ports.pane.refreshRemote()
        this.ports.pane.clearLocalSelection()
        this.ports.ui.markViewDirty()
        return true
      }
      await Promise.all(payload.paths.map(async (p) => {
        try {
          await this.ports.transfer.streamUploadOne(p.fullPath, remoteDir)
        } catch (e) {
          log.error('Upload failed for', p.fullPath, e)
        }
      }))
      if (this.ports.conflict.hasPendingConflicts()) {
        this.ports.conflict.showConflictDialog()
      }
      await this.ports.pane.refreshRemote()
      this.ports.pane.clearLocalSelection()
      this.ports.ui.markViewDirty()
      return true
    }

    // ★ 2026-10-20（用户反馈）：左栏切到远程端点时，落点在几何上仍是「左栏」，但它是 SFTP 目录。
    //   不能当本地写（旧守卫），也不该直接拒绝——右键菜单的「传输」已经能做同样的事，拖拽却提示
    //   「暂不支持」，两条入口行为不一致。按 payload 类型分派到端点通道：
    //   local-paths → 上传；remote-paths → 远程↔远程直传（与右键共用 r2r 通道：冲突框/记录/进度）。
    //   ★ 只处理**跨栏**拖放：左栏远程自己拖给自己属于面板内的移动，不归 drop 用例管。
    if (targetPane === 'local' && crossPane && !this._isReallyLocalPane(ctx, 'local')) {
      const epDir = destDirOverride || ctx.getLocalPath()
      if (payload.kind === 'local-paths' && this.ports.transfer.uploadLocalToRemoteEndpoint) {
        const ok = await this.ports.transfer.uploadLocalToRemoteEndpoint(payload.paths.map(p => p.fullPath), epDir)
        if (ok) {
          await this.ports.pane.refreshLocal()
          this.ports.ui.markViewDirty()
          return true
        }
      }
      if (payload.kind === 'remote-paths' && this.ports.transfer.transferRemoteEntries) {
        const ok = await this.ports.transfer.transferRemoteEntries(
          payload.paths.map(p => ({
            remotePath: p.remotePath,
            name: p.name,
            isDirectory: p.isDirectory,
            size: p.size,
            mode: p.mode,
            modified: p.modified,
          })),
          epDir,
          'left',
        )
        if (ok) {
          this.ports.ui.markViewDirty()
          return true
        }
      }
      // ★ 2026-10-20：两条端点端口都已在面板实现（冲突执行体端点化后，「本机→左栏远程」的
      //   目标已存在也能弹覆盖/重命名，不再是「暂不支持」）。仍保留兜底：端口未实现 / 端点不可用
      //   （例如左栏切回远程但会话已断）时显式拒绝，别静默吞掉这次拖放。
      this.ports.notify.dropTargetNotLocal?.()
      return true
    }

    // ★ 2026-10-20（用户反馈）：远程条目拖到**另一栏的远程端点**（远程↔远程拖拽的另一方向：
    //   左栏远程 → 右栏远程）。同栏拖拽（!crossPane）不在此处理，仍由面板自身的移动逻辑接管。
    if (payload.kind === 'remote-paths' && targetPane === 'remote' && crossPane
      && !this._isReallyLocalPane(ctx, 'remote') && this.ports.transfer.transferRemoteEntries) {
      const ok = await this.ports.transfer.transferRemoteEntries(
        payload.paths.map(p => ({
          remotePath: p.remotePath,
          name: p.name,
          isDirectory: p.isDirectory,
          size: p.size,
          mode: p.mode,
          modified: p.modified,
        })),
        destDirOverride || ctx.getRemotePath(),
        'right',
      )
      if (ok) {
        this.ports.ui.markViewDirty()
        return true
      }
    }

    // ★ issue #27 P3：本地 → 本地（右栏本地端点 / 左栏本地）：面板间本地复制。
    // 守卫：目标必须真是本地磁盘端点——左栏为远程端点时 ctx.getLocalPath() 是 POSIX 路径，
    // 写入它等于往不存在的本地路径复制（右栏本地拖到左远程走的是上传通道，不进本分支）。
    if (payload.kind === 'local-paths' && targetPane === 'local'
      && (!ctx.isLocalPaneTarget || ctx.isLocalPaneTarget('local'))) {
      const localDir = destDirOverride || ctx.getLocalPath()
      await this.ports.filesystem.copyIntoLocalDir(payload.paths.map(p => p.fullPath), localDir)
      await this.ports.pane.refreshLocal()
      this.ports.ui.markViewDirty()
      return true
    }

    // ★ 2026-10-19 P1（audit）：同上守卫。左栏为远程端点时 targetPane 仍是几何上的 'local'，
    //   缺守卫 ⇒ downloadRemoteEntry 把 POSIX 路径当本地目录用 ⇒ 静默落盘 C:\var\www 一类
    //   盘根路径且毫无报错。守卫不通过时不静默 no-op，显式提示（见 _notifyNonLocalTarget）。
    if (payload.kind === 'remote-paths' && targetPane === 'local') {
      if (!this._isReallyLocalPane(ctx, 'local')) {
        this.ports.notify.dropTargetNotLocal?.()
        return true
      }
      const localDir = destDirOverride || ctx.getLocalPath()
      log.info('[drop] remote→local payload.paths.length:', payload.paths.length)
      await Promise.all(payload.paths.map(async (p, i) => {
        log.info('[drop] downloading remote entry #' + i + ':', p.name, p.remotePath, 'isDir:', p.isDirectory)
        try {
          await this.ports.transfer.downloadRemoteEntry(p, localDir)
        } catch (e) {
          log.error('Download failed for', p.remotePath, e)
        }
      }))
      if (this.ports.conflict.hasPendingConflicts()) {
        this.ports.conflict.showConflictDialog()
      }
      await this.ports.pane.refreshLocal()
      this.ports.pane.clearRemoteSelection()
      this.ports.ui.markViewDirty()
      return true
    }

    return false
  }

  private async _handleOsPaths(osPaths: string[], targetPane: DropPane, destDirOverride?: string, crossPane = false): Promise<void> {
    if (!osPaths.length) return

    const ctx = this.ports.context
    const localDest = destDirOverride || ctx.getLocalPath()

    // ★ 2026-10-20 全量审计：此前「OS 文件拖到左栏远程端点」被直接拒绝，而**面板内**的
    //   本机条目拖到同一位置却可以上传（_handleInternalPayload 走 uploadLocalToRemoteEndpoint）
    //   ⇒ 同一动作两个入口行为分叉：资源管理器拖进来提示「暂不支持」，面板内拖进去正常上传。
    //   OS 路径本身就是本机磁盘路径，语义与面板内本机条目完全一致，接入同一条上传通道。
    if (targetPane === 'local' && !crossPane && !this._isReallyLocalPane(ctx, 'local')) {
      if (this.ports.transfer.uploadLocalToRemoteEndpoint) {
        const ok = await this.ports.transfer.uploadLocalToRemoteEndpoint(osPaths, localDest)
        if (ok) {
          await this.ports.pane.refreshLocal()
          this.ports.ui.markViewDirty()
          return
        }
      }
      // 端口未实现 / 端点不可用（左栏已切回远程但会话断了）⇒ 保留原显式拒绝提示
      this.ports.notify.dropTargetNotLocal?.()
      return
    }

    // ★ issue #27 P3：跨栏（另一栏本地面板拖入）同目录不早退，交由 copyIntoLocalDir
    //   的冲突检测给出提示（源=目标时 _samePaneOverwrite 有自我覆盖守卫，安全）。
    if (targetPane === 'local' && !crossPane && isOsDropIntoSameLocalDir(osPaths, localDest)) {
      this.ports.dragState.reset()
      this.ports.ui.markViewDirty()
      return
    }

    if (targetPane === 'remote') {
      if (!ctx.isConnected() || !ctx.hasSftpSession()) return
      const remoteDir = destDirOverride || ctx.getRemotePath()
      // ★ 2026-09-29（四）：从系统资源管理器拖入多个条目时同样先试整批打包
      if (await this._tryBatchUpload(osPaths, remoteDir)) {
        if (this.ports.conflict.hasPendingConflicts()) {
          this.ports.conflict.showConflictDialog()
        }
        await this.ports.pane.refreshRemote()
        // ★ 2026-10-13 P2 修复：与上方 internal-payload 分支（约 222-244 行）补齐同款收尾 ——
        //   OS 拖入分支漏了 clearLocalSelection() 与 markViewDirty()，导致上传成功后本地
        //   面板仍保留拖入前的选中高亮，且视图不重绘（要等下一次交互才更新）。
        this.ports.pane.clearLocalSelection()
        this.ports.ui.markViewDirty()
        return
      }
      await Promise.all(osPaths.map(async (p) => {
        try {
          await this.ports.transfer.streamUploadOne(p, remoteDir)
        } catch (e) {
          log.error('Upload failed for', p, e)
        }
      }))
      if (this.ports.conflict.hasPendingConflicts()) {
        this.ports.conflict.showConflictDialog()
      }
      await this.ports.pane.refreshRemote()
      // ★ 2026-10-13 P2：同上，逐项上传路径也补齐收尾
      this.ports.pane.clearLocalSelection()
      this.ports.ui.markViewDirty()
      return
    }

    if (targetPane === 'local') {
      await this.ports.filesystem.copyIntoLocalDir(osPaths, localDest)
      await this.ports.pane.refreshLocal()
    }
  }
}

﻿/**
 * Drop 基础设施适配器：DOM 解析 + 端口实现 + 用例调用
 */


export interface PanelDropHost {
  cdr: ChangeDetectorRef
  markViewDirty?(): void
  connected: boolean
  sftpSession: unknown
  remotePath: string
  localPath: string
  /** ★ 2026-09-20 P2-2：拖入兜底临时目录的作用域（面板级唯一），供销毁时定向清理 */
  dropTmpScope?: string
  effectiveLang: string
  i18n: { t(key: string, params?: Record<string, string | number>): string }
  notifications: { error?(msg: string, detail: string): void } | null
  selectedLocal: unknown[]
  selectedRemote: unknown[]
  hasConflictQueue(): boolean
  resetFileDragState(): void
  /** ★ issue #27 P3：目标 pane 是否真是本地磁盘端点（可选，未实现按「不可」处理） */
  isLocalPaneTarget?(pane: DropPane): boolean
  /**
   * ★ issue #27 P3：本地→本地复制遇同名时入队冲突（弹覆盖/跳过/重命名对话框），
   * 替代原先的「复制失败」错误 toast。可选：未实现时保持旧 toast 行为。
   */
  enqueueLocalSamePaneConflict?(src: string, dest: string, isDir: boolean): Promise<void> | void
  uploadPathToRemote(remoteDir: string, localPath: string): Promise<boolean>
  streamUploadOne(localPath: string, destRemoteDir?: string): Promise<void>
  /** ★ 2026-09-29（四）：多选批量打包入口（可选，未实现则一律逐项） */
  tryUploadBatch?(localPaths: string[], remoteDir: string): Promise<boolean>
  streamDownloadOne(file: SFTPFile, targetLocalDir?: string): Promise<void>
  /**
   * ★ 2026-10-20（用户反馈）：远程条目拖到**另一栏的远程端点**（远程↔远程拖拽）。
   * `destPane` 是目标栏标识（几何语义），源恒为另一栏 —— 面板侧据此选方向：
   * 目标是左栏远程时源是右栏远程（`_streamDownloadOneRemote`），反之 `_streamUploadOneRemote`。
   * 未实现时退回「拒绝并提示」，不静默。
   */
  transferRemoteEntries?(
    entries: Array<{ remotePath: string; name: string; isDirectory: boolean; size?: number; mode?: number; modified?: number }>,
    destDir: string,
    destPane: 'left' | 'right',
  ): Promise<boolean>
  uploadLocalToRemoteEndpoint?(localPaths: string[], destDir: string): Promise<boolean>
  refreshLocal(): Promise<unknown>
  refreshRemote(): Promise<unknown>
  showConflictDialog(): void
}

export class PanelDropAdapter {
  private readonly useCase: DropUseCase

  constructor(private readonly host: PanelDropHost) {
    this.useCase = new DropUseCase(this._buildPorts())
  }

  async onDrop(ev: DragEvent, targetPane: DropPane, destDirOverride?: string, targetPaneId?: 'left' | 'right'): Promise<void> {
    ev.preventDefault()
    const rawPayload = parseDragPayload(ev)
    const osPaths = await getDroppedOsPaths(ev, this.host.dropTmpScope)
    await this.useCase.execute({ targetPane, rawPayload, osPaths, destDirOverride, targetPaneId })
  }

  private _buildPorts(): DropPorts {
    const host = this.host
    return {
      context: {
        getLocalPath: () => host.localPath,
        getRemotePath: () => host.remotePath,
        isConnected: () => host.connected,
        hasSftpSession: () => !!host.sftpSession,
        // ★ issue #27 P3：可选端口逐跳转发（两端都是 `?` 成员 TS 不报漏转发，显式判断）
        isLocalPaneTarget: (pane) => (host.isLocalPaneTarget ? host.isLocalPaneTarget(pane) : false),
      },
      transfer: {
        uploadToRemote: (remoteDir, localPath) => host.uploadPathToRemote(remoteDir, localPath),
        streamUploadOne: (localPath, destRemoteDir) => host.streamUploadOne(localPath, destRemoteDir),
        // ★ 2026-09-29（四）：可选端口逐跳转发。两端都是 `?` 成员时 TS 不会报「漏转发」，
        //   故此处显式做一次存在性判断（未实现即视为「未接管」）
        tryUploadBatch: (localPaths, remoteDir) =>
          host.tryUploadBatch ? host.tryUploadBatch(localPaths, remoteDir) : Promise.resolve(false),
        downloadRemoteEntry: (entry, destLocalDir) => host.streamDownloadOne(this._toSftpFile(entry), destLocalDir),
        // ★ 2026-10-20：目标栏是远程端点时的跨栏直传（可选端口，同样显式判存在性）
        transferRemoteEntries: (entries, destDir, destPane) =>
          host.transferRemoteEntries
            ? host.transferRemoteEntries(entries, destDir, destPane)
            : Promise.resolve(false),
        uploadLocalToRemoteEndpoint: (localPaths, destDir) =>
          host.uploadLocalToRemoteEndpoint
            ? host.uploadLocalToRemoteEndpoint(localPaths, destDir)
            : Promise.resolve(false),
      },
      pane: {
        refreshLocal: async () => { await host.refreshLocal() },
        refreshRemote: async () => { await host.refreshRemote() },
        clearLocalSelection: () => { host.selectedLocal = [] },
        clearRemoteSelection: () => { host.selectedRemote = [] },
      },
      conflict: {
        hasPendingConflicts: () => host.hasConflictQueue(),
        showConflictDialog: () => host.showConflictDialog(),
      },
      filesystem: {
        copyIntoLocalDir: (sources, destDir) => this._copyIntoLocalDir(sources, destDir),
      },
      notify: {
        copyFailed: (fileName) => this._notifyCopyFailed(fileName),
        // ★ 2026-10-19 P1：目标栏为左栏远程端点时的拒绝提示（见 DropNotifyPort 注释）
        dropTargetNotLocal: () => this._notifyNonLocalTarget(),
      },
      dragState: {
        reset: () => host.resetFileDragState(),
      },
      ui: {
        markViewDirty: () => {
          if (host.markViewDirty) host.markViewDirty()
          else {
            try { host.cdr.detectChanges() } catch { /* destroyed view */ }
          }
        },
      },
    }
  }

  private _toSftpFile(entry: RemoteDropEntry): SFTPFile {
    const mtime = entry.modified
    log.info('[drop] _toSftpFile modified raw:', mtime, 'name:', entry.name)
    // ★ 2026-09-21 P2 修复：modified 缺失时改用 epoch(0) 占位而非当前时间——
    //   entryMtimeToMsOrUndefined 会过滤 epoch 返回 undefined，使下载用例的 stat 兜底
    //   （remoteMtime == null 才 stat）真正生效；此前 new Date() 占位让兜底永远不触发
    const modified = (mtime != null && mtime > 0) ? new Date(mtime) : new Date(0)
    return {
      name: entry.name,
      fullPath: entry.remotePath,
      isDirectory: entry.isDirectory,
      isSymlink: false,
      mode: entry.mode ?? 0o644,
      size: entry.size ?? 0,
      modified,
    } as SFTPFile
  }

  private _notifyCopyFailed(fileName: string): void {
    const msg = this.host.i18n.t('notify.copyFailed', { name: fileName })
    try { this.host.notifications?.error?.(msg, '') } catch {}
  }

  /** ★ 2026-10-19 P1（audit，供下方的 PanelDropAdapter 构造端口用）：目标栏为左栏远程端点时的拒绝提示。
   *  详见 DropUseCase._isReallyLocalPane 的成因注释。 */
  private _notifyNonLocalTarget(): void {
    log.warn('[drop] reject drop: target pane is not a local disk endpoint (left panel switched to remote)')
    try {
      const msg = this.host.i18n.t('notify.dropTargetNotLocal')
      this.host.notifications?.error?.(msg, '')
    } catch {}
  }

  private async _copyIntoLocalDir(sources: string[], destDir: string): Promise<void> {
    // ★ issue #27 P3：任一条目因同名入队冲突后，循环结束统一拉起冲突对话框
    let conflictQueued = false
    for (const p of sources) {
      const baseName = path.basename(p)
      const dest = path.join(destDir, baseName)
      try {
        // ★ 2026-09-14 issue #17：拒绝「把目录拖到自己或其子目录内」（如 /a 拖进 /a/a），
        //   否则本地复制会无限递归直到磁盘写满；与底层 copyLocalDir 守卫形成纵深防御。
        if (await fs.stat(p).then(s => s.isDirectory()).catch(() => false) && isPathInside(p, dest, false)) {
          const msg = this.host.i18n.t('op.cannotCopyIntoSelf', { name: baseName })
          this.host.notifications?.error?.(msg, '')
          log.warn('Skip OS drop into local: destination is inside source (would recurse):', p, '->', dest)
          continue
        }
        // ★ 2026-08-26：同名已存在时拒绝静默覆盖。
        // ★ issue #27 P3：改走冲突队列（覆盖/跳过/重命名对话框），与其它方向对齐；
        //   端口未实现（旧调用方）时回退「复制失败」toast。自我覆盖（源==目标）由
        //   _samePaneOverwrite 的 sameFile 守卫兜底，选覆盖也不会自我截断。
        const exists = await fs.stat(dest).then(() => true).catch(() => false)
        if (exists) {
          if (this.host.enqueueLocalSamePaneConflict) {
            const isDirSrc = await fs.stat(p).then(s => s.isDirectory()).catch(() => false)
            await this.host.enqueueLocalSamePaneConflict(p, dest, isDirSrc)
            conflictQueued = true
          } else {
            this._notifyCopyFailed(baseName)
          }
          log.warn('OS drop into local: destination already exists:', dest)
          continue
        }
        // fs.cp 需要 Node.js >= 16.7.0；旧版本回退到 copyLocalDir + copyFile
        if (typeof (fs as any).cp === 'function') {
          await (fs as any).cp(p, dest, { recursive: true, errorOnExist: true, dereference: false })
        } else {
          await this._copyIntoLocalDirFallback(p, dest)
        }
      } catch (e) {
        log.error('Copy local failed:', p, e)
        this._notifyCopyFailed(baseName)
      }
    }
    // ★ issue #27 P3：有同名冲突入队时统一弹框（队列空时不弹）
    if (conflictQueued) this.host.showConflictDialog()
  }

  /** fs.cp 的兼容性回退（Node.js < 16.7） */
  private async _copyIntoLocalDirFallback(src: string, dest: string, depth = 0): Promise<void> {
    // ★ 2026-09-20 P1-8 审计修复：递归深度上限，防止异常目录结构导致无限递归
    if (depth > 64) {
      log.warn('_copyIntoLocalDirFallback max depth exceeded:', src)
      return
    }
    const st = await fs.lstat(src).catch(() => null)
    if (!st) return
    // 与 fs.cp({ dereference: false }) 及常规目录复制保持一致：不跟随链接目标。
    if (st.isSymbolicLink()) {
      log.info('Skip symlink in OS drop fallback:', src)
      return
    }
    if (st.isDirectory()) {
      await fs.mkdir(dest, { recursive: true })
      const entries = await fs.readdir(src)
      for (const entry of entries) {
        await this._copyIntoLocalDirFallback(path.join(src, entry), path.join(dest, entry), depth + 1)
      }
    } else {
      await fs.copyFile(src, dest)
    }
  }
}

/**
 * Drop 事件数据解析：内部 payload 与 OS 文件路径提取
 */


/** 解析内部拖拽数据（getData 在 drop 事件中只能消费一次，建议只调用一次） */
export function parseDragPayload(ev: DragEvent): DragPayload | null {
  const raw = ev.dataTransfer?.getData('application/x-sftp-plus')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as DragPayload
    // ★ 2026-08-26：基本形状校验，拒绝畸形/注入 payload
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed) || !Array.isArray((parsed as any).paths)) {
      return null
    }
    if (parsed.kind !== 'local-paths' && parsed.kind !== 'remote-paths') return null
    return parsed
  } catch { return null }
}

/** ★ 2026-09-20 P2-2：拖入兜底临时目录（按调用方作用域分目录，便于各面板各自清理）
 *  作用域缺省时用 shared 目录，保证旧调用方行为不变。 */
export function dragDropTempDir(scope?: string): string {
  const safeScope = (safeEntryName(scope ?? '') || '').replace(/[\\/]/g, '')
  return path.join(os.tmpdir(), 'sftp-plus-dragdrop', safeScope || 'shared')
}

/** 从 OS 拖入的 DataTransfer 中提取本地文件系统路径
 *  ★ 2026-09-20 P2-2：策略2（写入临时目录兜底）产生的文件此前无任何清理路径——
 *  目录按 tmpScope 分组，由调用方（面板）在销毁时清理自己作用域内的副本。 */
export async function getDroppedOsPaths(ev: DragEvent, tmpScope?: string): Promise<string[]> {
  const dt = ev.dataTransfer
  if (!dt) return []

  // 策略1: Electron File.path（最直接，跨平台，带正确原生路径）
  const files = Array.from(dt.files ?? [])
  const electronPaths = files.map(f => (f as any).path as string | undefined).filter(Boolean) as string[]
  if (electronPaths.length) return electronPaths

  // 策略1b: 遍历 dataTransfer.items 用 webUtils.getPathForFile()（Electron 22+，支持文件和文件夹）
  try {
    const { webUtils } = require('electron')
    const items = Array.from(dt.items ?? [])
    const itemPaths: string[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          const p = webUtils.getPathForFile(file)
          if (p) itemPaths.push(p)
        }
      }
    }
    if (itemPaths.length) return itemPaths
  } catch { /* Electron 版本不支持 webUtils，或未启用 */ }

  // 策略2: File 对象有内容但没有 .path → 写入临时目录后返回路径（仅单文件，非目录）
  // ★ 2026-08-26 C1：每轮 UUID 子目录 + safeEntryName，防 file.name 路径穿越与同名碰撞
  // ★ 2026-09-14 D1 修复：dt.files 为空时从 dt.items 提取 file 对象，
  //   修复偶现 OS 拖入无响应（Electron 某些场景下 dt.files 为空但 items 有内容）
  let fileObjects = files
  if (!fileObjects.length && dt.items?.length) {
    fileObjects = []
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) fileObjects.push(file)
      }
    }
  }
  if (fileObjects.length) {
    const sessionDir = path.join(dragDropTempDir(tmpScope), randomUUID())
    let dirOk = false
    try {
      await fs.mkdir(sessionDir, { recursive: true })
      dirOk = true
    } catch (e) {
      log.error('[drop] failed to create temp dir for drag-drop:', e)
    }
    if (dirOk) {
      const sessionReal = await fs.realpath(sessionDir).catch(() => sessionDir)
      const tmpPaths: string[] = []
      for (const file of fileObjects) {
        const safe = safeEntryName(file.name)
        if (!safe) {
          log.warn('[drop] skip unsafe drag file name:', file.name)
          continue
        }
        const tmpPath = path.join(sessionDir, safe)
        try {
          const buf = Buffer.from(await file.arrayBuffer())
          // ★ 2026-08-10 修复 #19：0 字节也是合法空文件，照常落盘传输，不得静默丢弃
          await fs.writeFile(tmpPath, buf)
          const real = await fs.realpath(tmpPath).catch(() => tmpPath)
          const prefix = sessionReal.endsWith(path.sep) ? sessionReal : sessionReal + path.sep
          if (real !== sessionReal && !real.startsWith(prefix)) {
            log.warn('[drop] reject path escape after write:', file.name, real)
            await fs.unlink(tmpPath).catch(() => {})
            continue
          }
          tmpPaths.push(tmpPath)
        } catch { /* 跳过无法读取的文件（含文件夹占位项） */ }
      }
      if (tmpPaths.length) return tmpPaths
      await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  // 策略3: text/uri-list 回退（处理 Windows file:///C:/path 格式）
  const uriList = dt.getData('text/uri-list') || ''
  const uris = uriList.split(/\r?\n/g).map(x => x.trim()).filter(x => x && !x.startsWith('#'))
  const out: string[] = []
  for (const x of uris) {
    // ★ 2026-08-10 修复 #19：非 file:// URI（http:// 等）不是本地路径，直接丢弃，
    //   此前会把 URL 当路径去读本地文件 → 上传报错
    if (!x.startsWith('file://')) {
      log.warn('[drop] skip non-file URI in uri-list:', x)
      continue
    }
    let raw: string
    try {
      raw = decodeURIComponent(x.slice('file://'.length)) // 去掉 file://
    } catch {
      // ★ 2026-08-10 修复 #19：非法百分号编码时回退未解码路径，避免 URIError 中断整个拖放
      raw = x.slice('file://'.length)
    }
    // Windows: file:///C:/path → /C:/path → 去掉开头的 /，保持 Drive letter
    if (/^\/[a-zA-Z]:/.test(raw)) {
      out.push(raw.slice(1).replace(/\//g, '\\'))
    } else {
      out.push(raw)
    }
  }
  return out
}


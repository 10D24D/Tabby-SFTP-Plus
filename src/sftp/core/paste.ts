/**
 * 功能描述：SFTP+ paste 逻辑聚合模块（由旧 core 多文件合并）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-07-16
 * @修改人：DD1024z + Hy4 preview
 * @修改时间：2026-10-20 — 同栏本地复制补 `local-copy` 传输记录：新增可选端口
 *              2026-10-20 全量审计：同栏**远程**复制补 remote-copy 传输记录 —— 新增可选端口 onRemoteCopy
 *                （PasteFsPort / PanelPasteHost / 适配器逐跳转发 / 面板实现），与右键「传输」口径一致。
 *              `PasteFsPort.onLocalCopy` / `PanelPasteHost.onLocalCopy`（逐跳显式转发），
 *              `_pasteSamePane` 的本地复制分支成功后回调面板写日志——「粘贴」与右键「传输」
 *              口径一致（此前 `local-copy` 只有类型与 UI 渲染，全项目没有任何写入点）。
 *              2026-10-13 — P1 修复：粘贴无 localEntryName 回退 ⇒ 远端合法但 Windows 不可直建的
 *              名字（a\b.txt、a:b.txt、CON.txt）粘贴到本地栏时**静默丢失**（无弹窗、无提示）。
 *              scanConflicts / execute 两处原先只用 safeEntryName，null 即 continue；而
 *              transfer-ops 的下载路径 2026-10-12 已补 `?? localEntryName(...)` 回退，paste 遗漏。
 *              现按同一约定补：**落本地**时 safeEntryName 不可用则转写为 localEntryName
 *              （全角替换，视觉可辨）；**落远端**时保持严格拒绝（远端名不经 Windows 规则），与
 *              transfer-ops 上传侧 safeEntryName 无回退的口径一致。
 *              2026-10-13 — P2 修复（F10）：三处下载冲突入队（scanConflicts 目录分支 /
 *              _pasteRemoteToLocal 目录分支 / _buildFileConflictItem 文件分支）透传
 *              remoteFileMode（entry.mode）——下载覆盖/重命名落地时保留远端权限位，
 *              不再硬编码 0o644（可执行脚本落地后不可执行）。
 *              2026-09-21 — P1 修复：scanConflicts 补同面板目录的同名冲突预检 —— 原先 source===destPane
 *              时直接 continue，execute 会径直 copyLocalDir/copyRemoteDir 合并进已存在的同名目录
 *              并覆盖同名文件，既无对话框也无提示（同面板的「文件」本就走 checkDestExists，只有目录漏了）
 *              2026-09-21 — 第六轮审计 P2 修复：execute 的 try/catch 挪进条目循环
 *              （单条目失败不再中断整批，刷新独立兜底，有失败才统一提示）
 *              2026-09-20 — 跨栏粘贴冲突补齐远端 dest 元数据，勿用本地 size 冒充 remoteFileSize
 *              2026-09-17 — 目录冲突预检补齐远程 mtime（与拖拽上传一致，避免粘贴显示 1970）
 *              2026-07-25 — safeEntryName 防路径穿越
 * 合并来源：paste-use-case, panel-paste-adapter
 */

import * as path from 'path'

import { type Stats } from 'fs'

import { pasteEntryKey, parseRemoteMtime } from './conflict'

import { safeEntryName, localEntryName } from './path-utils'

import { type ConflictQueueItem } from './panel-types'

import * as fs from 'fs/promises'

import { copyLocalDir, copyRemoteDir, deleteLocalRecursive, deleteRemoteRecursive, isPathInside, tryRemoteCpViaSsh } from './fs-ops'


import { log } from '../../services/sftp-logger'
/**
 * 粘贴用例：端口定义 + 冲突预检 + 执行逻辑
 * 合并自: paste-ports.ts, paste-use-case.ts
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-11
 *   每个冲突入队项写入 entryKey=pasteEntryKey(entry)，使 resumePaste 准确排除已解决项；
 *   _pasteSamePane 增加同路径自我拷贝守卫，防止 fs.copyFile 清空文件
 * 修改时间：2026-07-12
 *   _pasteSamePane 加诊断日志，确认 resumePaste 是否在重命名后重复调用同路径拷贝
 */



// ─── 端口定义 ───────────────────────────────────────────────

export type PasteEntry = {
  name: string
  fullPath?: string
  isDirectory: boolean
  mode?: number
  size?: number
  mtimeMs?: number
}

export interface PasteTransferPort {
  // ★ 2026-08-10：返回 boolean（true=完整成功），剪切粘贴删源前必须校验
  uploadFile(remotePath: string, localPath: string): Promise<boolean>
  downloadFile(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  uploadDirectory(localSrc: string, remoteDestParent: string): Promise<boolean>
  downloadDirectory(remoteSrc: string, localDestParent: string): Promise<boolean>
}

export interface PasteFsPort {
  copyLocalDir(src: string, dest: string): Promise<void>
  copyLocalFile(src: string, dest: string): Promise<void>
  renameLocal(src: string, dest: string): Promise<void>
  copyRemoteDir(src: string, dest: string, isDir: boolean): Promise<void>
  renameRemote(src: string, dest: string): Promise<void>
  deleteLocalRecursive(path: string): Promise<void>
  deleteRemoteRecursive(path: string): Promise<void>
  localDirExists(path: string): Promise<boolean>
  statLocal(path: string): Promise<Stats | null>
  /** 目录内容总大小（与拖拽上传预扫描一致，供冲突框直接展示） */
  scanLocalDir?(dirPath: string): Promise<{ size: number; count: number }>
  readdirRemote(parentDir: string): Promise<Array<{
    name: string
    size?: number
    modified?: Date | number | string
    mtime?: number
    attrs?: { size?: number; mtime?: number; modified?: Date | number | string }
  }>>
  /**
   * ★ 2026-10-20：同栏本地复制成功后回调（面板侧据此写一条 `local-copy` 传输记录）。
   * 可选：未实现时不记录 —— 只影响日志完整性，不影响复制本身。
   */
  onLocalCopy?(srcPath: string, dstPath: string, isDirectory: boolean): void
  /**
   * ★ 2026-10-20 全量审计：同栏**远程**复制成功后回调（写一条 `remote-copy` 传输记录）。
   * 对齐铁律「同一动作多入口必须写同一种 operation」：右键「传输」/拖拽/粘贴的远程↔远程
   * 都记 remote-copy，唯独同栏远程粘贴此前静默无记录。可选端口，未实现则不记。
   */
  onRemoteCopy?(srcPath: string, dstPath: string, isDirectory: boolean): void
}

export interface PasteConflictPort {
  checkDestExists(pane: 'local' | 'remote', filePath: string): Promise<boolean>
  checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean>
  enqueue(item: ConflictQueueItem): void
  showDialog(): void
  queueLength(): number
  setOriginalTotal(count: number): void
}

export interface PastePendingPort {
  save(entries: PasteEntry[], destPane: 'local' | 'remote', destPath: string, mode: 'copy' | 'cut', source: 'local' | 'remote'): void
}

export interface PasteUiPort {
  refreshLocal(): Promise<void>
  refreshRemote(): Promise<unknown>
  notifyPasteFailed(): void
  hasSftpSession(): boolean
}

export interface PastePorts {
  transfer: PasteTransferPort
  fs: PasteFsPort
  conflict: PasteConflictPort
  pending: PastePendingPort
  ui: PasteUiPort
  /** ★ 2026-09-14 issue #17：用于复制守卫被拦截时向用户提示（如「不能复制到自身内」） */
  notify: {
    error(key: string, params?: Record<string, string | number>): void
  }
}

// ─── 用例实现 ───────────────────────────────────────────────

export class PasteUseCase {
  constructor(private readonly ports: PastePorts) {}

  /** 预检冲突并入队，返回是否存在需用户确认的冲突 */
  async scanConflicts(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    source: 'local' | 'remote',
    mode: 'copy' | 'cut',
  ): Promise<boolean> {
    for (const entry of entries) {
      // ★ 2026-08-10 修复 #4：冲突预检同样净化文件名，防止 ../ 路径穿越参与落点计算
      // ★ 2026-10-13 P1 修复：落本地时补 localEntryName 回退——safeEntryName 对 Windows 保留名/
      //   尾随点/含 \ 的远端合法名返回 null，原先直接 continue ⇒ 文件静默丢失；落远端仍严格拒绝。
      const safeName = safeEntryName(entry.name)
        ?? (destPane === 'local' ? localEntryName(entry.name) : null)
      if (!safeName) {
        log.warn('skip unsafe paste entry in scanConflicts:', entry.name)
        continue
      }
      const destFilePath = destPane === 'local'
        ? path.join(destPath, safeName)
        : path.posix.join(destPath, safeName)

      if (entry.isDirectory) {
        if (source === 'local' && destPane === 'remote') {
          if (await this.ports.conflict.checkRemotePathExists(destFilePath, true)) {
            const st = await this.ports.fs.statLocal(entry.fullPath ?? '')
            // ★ 2026-09-17：与拖拽上传一致，从父目录 listing 取远程目录真实 mtime
            //   （sftp.stat 对目录常返回 epoch，不填则冲突框显示 1970-01-01）
            const remoteMeta = await this._remoteListingMeta(destPath, safeName)
            // 本地目录 fs.Stats.size 无意义；预扫内容总大小，冲突框可直接展示免二次扫描
            let localContentSize = 0
            const localPath = entry.fullPath ?? ''
            if (localPath && this.ports.fs.scanLocalDir) {
              try {
                const scanned = await this.ports.fs.scanLocalDir(localPath)
                localContentSize = scanned?.size ?? 0
              } catch (e) {
                log.warn('[paste] scanLocalDir for conflict failed:', localPath, e)
              }
            }
            this.ports.conflict.enqueue({
              localPath,
              remoteDir: destPath,
              fileName: safeName,
              remotePath: destFilePath,
              localStat: {
                size: localContentSize,
                mtimeMs: st?.mtimeMs ?? Date.now(),
              } as Stats,
              direction: 'upload',
              isDirectory: true,
              remoteFileSize: remoteMeta.size,
              remoteFileMtime: remoteMeta.mtimeMs,
              entryKey: pasteEntryKey(entry),
              mode,
            })
          }
        } else if (source === destPane) {
          // ★ 2026-09-21 P1 修复：同面板粘贴目录此前直接 continue，不做同名预检——
          //   execute 会径直 copyLocalDir/copyRemoteDir 合并进已存在的同名目录并覆盖同名文件，
          //   既无对话框也无提示（同面板的「文件」是走下面 checkDestExists 的，只有目录漏了）。
          const exists = await this.ports.conflict.checkDestExists(destPane, destFilePath)
          if (exists) {
            const srcPath = entry.fullPath ?? ''
            // ★ 2026-10-12 P1 修复（两处不对称，均为「用源侧元数据冒充目标侧」）：
            //
            // (1) destStat 原先直接取 `entry.size / entry.mtimeMs` —— 那是**源目录**的
            //     size/mtime，而 localStat 的契约是「目标侧（本地）元数据」，
            //     由 _computeConflictDigests 与冲突框的「目标侧」信息展示消费。
            //     同面板的**文件**分支（下方 233 行起）是老老实实 statLocal /
            //     readdirRemote 取目标元数据的，只有目录分支抄了近路。
            //     后果：本地↔本地同面板粘贴目录时，冲突框「目标侧大小/时间」显示的是
            //     **源**的大小时间（内容摘要对比也会拿错的一侧去算）。
            //
            // (2) remoteDir 原先写 `destPane === 'remote' ? destPath : dirname(srcPath)`。
            //     同栏时 localPath/remotePath 装的是**同一侧的两个路径**（目标/源），
            //     而 remoteDir 描述的是「远端目录」—— 同栏本地时 destPane 是 'local'，
            //     此时根本没有远端路径可用，传 dirname(srcPath)（一个本地路径）
            //     会在后续按字段名推断所在侧的逻辑里把它误当远端目录。
            //     改为只在该字段确实有意义时给值，否则留空由消费方按 isSamePane 判定。
            let destStat: Stats = { size: 0, mtimeMs: Date.now() } as Stats
            let remoteDir = ''
            if (destPane === 'local') {
              const st = await this.ports.fs.statLocal(destFilePath)
              if (st) destStat = st as Stats
            } else {
              remoteDir = destPath
              if (this.ports.ui.hasSftpSession()) {
                try {
                  const dir = path.posix.dirname(destFilePath)
                  const name = path.posix.basename(destFilePath)
                  const remoteEntries = await this.ports.fs.readdirRemote(dir)
                  const found = remoteEntries.find(e => e.name === name)
                  if (found) {
                    destStat = {
                      size: found.size ?? found.attrs?.size ?? 0,
                      mtimeMs: parseRemoteMtime(found) ?? Date.now(),
                    } as Stats
                  }
                } catch { /* 目标元数据取不到：保留零值兜底，不影响冲突流程本身 */ }
              }
            }
            this.ports.conflict.enqueue({
              localPath: destFilePath,
              remoteDir,
              fileName: safeName,
              remotePath: srcPath,
              localStat: destStat,
              direction: 'upload',
              isDirectory: true,
              isSamePane: true,
              samePaneSource: source,
              // remoteFileSize/Mtime 才是**源侧**元数据，保持原语义（源 = entry）
              remoteFileSize: entry.size ?? 0,
              remoteFileMtime: entry.mtimeMs ?? Date.now(),
              entryKey: pasteEntryKey(entry),
              mode,
            })
          }
        } else if (source === 'remote' && destPane === 'local') {
          if (await this.ports.fs.localDirExists(destFilePath)) {
            const remoteMeta = await this._remoteListingMeta(
              path.posix.dirname(entry.fullPath ?? ''),
              safeName,
            )
            this.ports.conflict.enqueue({
              localPath: destFilePath,
              remoteDir: path.posix.dirname(entry.fullPath ?? ''),
              fileName: safeName,
              remotePath: entry.fullPath ?? '',
              localStat: { size: 0, mtimeMs: Date.now() } as Stats,
              direction: 'download',
              isDirectory: true,
              remoteFileSize: remoteMeta.size ?? entry.size,
              remoteFileMtime: remoteMeta.mtimeMs ?? entry.mtimeMs,
              // ★ 2026-10-13 P2 修复：透传远端 mode，下载覆盖/重命名落地时保留权限位
              remoteFileMode: entry.mode,
              entryKey: pasteEntryKey(entry),
              mode,
            })
          }
        }
        continue
      }

      const exists = await this.ports.conflict.checkDestExists(destPane, destFilePath)
      if (!exists) continue

      const isSamePane = source === destPane
      const direction: 'upload' | 'download' = isSamePane ? 'upload'
        : (source === 'local' && destPane === 'remote') ? 'upload'
        : 'download'

      let destStat: Stats = { size: 0, mtimeMs: Date.now() } as Stats
      if (isSamePane) {
        if (destPane === 'local') {
          const st = await this.ports.fs.statLocal(destFilePath)
          if (st) destStat = st
        } else if (this.ports.ui.hasSftpSession()) {
          try {
            const dir = path.posix.dirname(destFilePath)
            const name = path.posix.basename(destFilePath)
            const remoteEntries = await this.ports.fs.readdirRemote(dir)
            const found = remoteEntries.find(e => e.name === name)
            if (found) {
              destStat = {
                size: found.size ?? found.attrs?.size ?? 0,
                mtimeMs: parseRemoteMtime(found) ?? Date.now(),
              } as Stats
            }
          } catch { /* ignore */ }
        }
      } else if (destPane === 'remote') {
        // ★ 2026-09-20：跨栏上传冲突需取远端目标元数据（勿用本地 entry.size 冒充 remoteFileSize）
        const meta = await this._remoteListingMeta(destPath, safeName)
        destStat = {
          size: meta.size ?? 0,
          mtimeMs: meta.mtimeMs ?? Date.now(),
        } as Stats
      } else if (destPane === 'local') {
        const st = await this.ports.fs.statLocal(destFilePath)
        if (st) destStat = st
      }

      this.ports.conflict.enqueue(this._buildFileConflictItem(
        entry, destPane, destPath, source, destFilePath, isSamePane, direction, destStat, mode,
      ))
    }

    return this.ports.conflict.queueLength() > 0
  }

  async execute(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    // ★ 2026-09-21 P2 修复：try/catch 从循环外挪进循环内——原实现单条目失败会中断整批，
    //   剩余条目静默不处理（用户只看到一条 pasteFailed，不知道哪些没执行）
    let failed = 0
    for (const entry of entries) {
      try {
        const srcPath = entry.fullPath ?? ''
        if (!srcPath) continue
        // ★ 2026-07-25：剥离服务器返回文件名中的目录组件与 ..，防止路径穿越
        // ★ 2026-10-13 P1 修复：同 scanConflicts——落本地补 localEntryName 回退，避免静默丢失
        const safeName = safeEntryName(entry.name)
          ?? (destPane === 'local' ? localEntryName(entry.name) : null)
        if (!safeName) {
          log.warn('skip unsafe paste entry name:', entry.name)
          continue
        }
        const destFilePath = destPane === 'local'
          ? path.join(destPath, safeName)
          : path.posix.join(destPath, safeName)

        if (source === destPane) {
          await this._pasteSamePane(entry, srcPath, destFilePath, destPane, mode)
        } else if (source === 'local' && destPane === 'remote') {
          await this._pasteLocalToRemote(entry, srcPath, destPath, destFilePath, mode)
        } else {
          await this._pasteRemoteToLocal(entry, srcPath, destPath, destFilePath, mode)
        }
      } catch (e) {
        failed++
        log.error('Paste entry failed:', entry.name, e)
      }
    }
    try {
      if (destPane === 'local' || source === 'local') await this.ports.ui.refreshLocal()
      if (destPane === 'remote' || source === 'remote') await this.ports.ui.refreshRemote()
    } catch (e) {
      log.warn('Paste post-refresh failed:', e)
    }
    if (failed > 0) {
      this.ports.ui.notifyPasteFailed()
    }
  }

  private async _pasteSamePane(
    entry: PasteEntry,
    srcPath: string,
    destFilePath: string,
    destPane: 'local' | 'remote',
    mode: 'copy' | 'cut',
  ): Promise<void> {
    // [诊断] 记录同面板粘贴调用（若重命名后这里又被调用=resumePaste 重复执行）
    log.info('_pasteSamePane:', { srcPath, destFilePath, destPane, mode, isDir: entry.isDirectory })
    // 防御：源与目标为同一路径时，fs.copyFile 会先截断 dest 再读已清空的 src → 文件变空白，直接跳过
    if (destPane === 'local'
      ? path.resolve(srcPath) === path.resolve(destFilePath)
      : srcPath === destFilePath) {
      log.warn('_pasteSamePane self-copy skipped:', srcPath)
      return
    }
    // ★ 2026-09-14 issue #17：防御「把目录粘贴/复制到自身或其子目录内」（如 /a 粘贴进 /a/a），
    //   否则会触发无限递归复制（BusyBox cp 无自我包含检测）。入口即拦截并给出明确提示，
    //   与底层 copyLocalDir/copyRemoteDir 的守卫形成纵深防御。
    if (entry.isDirectory && isPathInside(srcPath, destFilePath, destPane !== 'local')) {
      log.warn('_pasteSamePane refused copy into self:', srcPath, '->', destFilePath)
      this.ports.notify.error('op.cannotCopyIntoSelf', { name: entry.name })
      return
    }
    if (destPane === 'local') {
      if (mode === 'copy') {
        if (entry.isDirectory) await this.ports.fs.copyLocalDir(srcPath, destFilePath)
        else await this.ports.fs.copyLocalFile(srcPath, destFilePath)
        // ★ 2026-10-20：本地复制也写传输记录（`local-copy`）——「粘贴」与右键「传输」口径一致
        try { this.ports.fs.onLocalCopy?.(srcPath, destFilePath, !!entry.isDirectory) } catch { /* 日志失败不影响复制 */ }
      } else {
        await this.ports.fs.renameLocal(srcPath, destFilePath)
      }
      return
    }
    if (mode === 'copy') {
      await this.ports.fs.copyRemoteDir(srcPath, destFilePath, entry.isDirectory)
      // ★ 2026-10-20 全量审计：同栏远程复制与右键「传输」/拖拽走的是不同代码路径，
      //   但都是 remote-copy 动作 —— 补上记录，日志口径才一致（日志失败不影响复制本身）。
      try { this.ports.fs.onRemoteCopy?.(srcPath, destFilePath, !!entry.isDirectory) } catch { /* 记录失败不影响复制 */ }
    } else if (this.ports.ui.hasSftpSession()) {
      await this.ports.fs.renameRemote(srcPath, destFilePath)
    }
  }

  private async _pasteLocalToRemote(
    entry: PasteEntry,
    srcPath: string,
    destPath: string,
    destFilePath: string,
    mode: 'copy' | 'cut',
  ): Promise<void> {
    if (entry.isDirectory) {
      const ok = await this.ports.transfer.uploadDirectory(srcPath, destPath)
      // ★ 2026-08-26 H1：必须以传输成功为准；仅「目标目录存在」不足以证明完整成功
      if (mode === 'cut') {
        if (!ok) throw new Error('Cut-paste aborted: directory upload not completed: ' + srcPath)
        if (!await this.ports.conflict.checkRemotePathExists(destFilePath, true)) {
          throw new Error('Cut-paste aborted: destination directory not found: ' + destFilePath)
        }
        await this.ports.fs.deleteLocalRecursive(srcPath)
      }
    } else {
      const ok = await this.ports.transfer.uploadFile(destFilePath, srcPath)
      // ★ 2026-08-10 修复 #1：传输未完整成功（取消/暂停/失败）时绝不删本地源，避免数据丢失
      if (mode === 'cut') {
        if (!ok) throw new Error('Cut-paste aborted: upload not completed: ' + srcPath)
        await this.ports.fs.deleteLocalRecursive(srcPath)
      }
    }
  }

  private async _pasteRemoteToLocal(
    entry: PasteEntry,
    srcPath: string,
    destPath: string,
    destFilePath: string,
    mode: 'copy' | 'cut',
  ): Promise<void> {
    if (entry.isDirectory) {
      // ★ 2026-07-25：直接使用已净化的 destFilePath（剥离了目录组件与 ..）
      const destDir = destFilePath
      if (await this.ports.fs.localDirExists(destDir)) {
        this.ports.conflict.enqueue({
          localPath: destDir,
          remoteDir: path.posix.dirname(srcPath),
          fileName: entry.name,
            remotePath: srcPath,
            localStat: { size: 0, mtimeMs: Date.now() } as Stats,
            direction: 'download',
            isDirectory: true,
            // ★ 2026-10-13 P2 修复：透传远端 mode，下载覆盖/重命名落地时保留权限位
            remoteFileMode: entry.mode,
            entryKey: pasteEntryKey(entry),
            mode,
        })
        this.ports.conflict.setOriginalTotal(this.ports.conflict.queueLength())
        this.ports.conflict.showDialog()
        return
      }
      const ok = await this.ports.transfer.downloadDirectory(srcPath, destPath)
      // ★ 2026-08-26 H1：必须以传输成功为准；仅「目标目录存在」不足以证明完整成功
      if (mode === 'cut' && this.ports.ui.hasSftpSession()) {
        if (!ok) throw new Error('Cut-paste aborted: directory download not completed: ' + srcPath)
        if (!await this.ports.fs.localDirExists(destFilePath)) {
          throw new Error('Cut-paste aborted: destination directory not found: ' + destFilePath)
        }
        await this.ports.fs.deleteRemoteRecursive(srcPath)
      }
    } else {
      const ok = await this.ports.transfer.downloadFile(srcPath, destFilePath, entry.mode, entry.size)
      // ★ 2026-08-10 修复 #1：传输未完整成功时绝不删远程源，避免数据丢失
      if (mode === 'cut' && this.ports.ui.hasSftpSession()) {
        if (!ok) throw new Error('Cut-paste aborted: download not completed: ' + srcPath)
        await this.ports.fs.deleteRemoteRecursive(srcPath)
      }
    }
  }

  private _buildFileConflictItem(
    entry: PasteEntry,
    destPane: 'local' | 'remote',
    destPath: string,
    source: 'local' | 'remote',
    destFilePath: string,
    isSamePane: boolean,
    direction: 'upload' | 'download',
    destStat: Stats,
    mode: 'copy' | 'cut',
  ): ConflictQueueItem {
    // ★ 2026-09-20：远端侧 size/mtime 一律用 destStat（跨栏上传）或 entry（跨栏下载的源）
    const remoteSize = destPane === 'remote'
      ? Number(destStat.size) || 0
      : (entry.size ?? 0)
    const remoteMtime = destPane === 'remote'
      ? Number(destStat.mtimeMs) || Date.now()
      : (entry.mtimeMs ?? Date.now())
    const localStat = isSamePane
      ? destStat
      : (source === 'local'
        ? { size: entry.size ?? 0, mtimeMs: entry.mtimeMs ?? Date.now() } as Stats
        : destStat)
    return {
      localPath: isSamePane ? destFilePath : (source === 'local' ? (entry.fullPath ?? '') : destFilePath),
      // ★ 2026-10-13 P2 修复：与上方**目录**分支（约 208-220 行）保持同口径 —— 目录分支早在
      //   2026-09 就改成「只在 destPane==='remote' 时给值、否则留空」，文件分支却还写着
      //   `dirname(entry.fullPath)`：同栏本地→本地时那是一个 **Windows 本地路径**，
      //   被塞进名为 remoteDir 的字段里，正是铁律「按字段名推断所在侧」的残留。
      //   消费方 panel-conflict-resolver 以 `remotePath || join(remoteDir, fileName)` 兜底，
      //   一旦 remotePath 为空就会拼出 `D:\photos\a.txt` 这种混合分隔符路径。
      remoteDir: destPane === 'remote' ? destPath : '',
      fileName: entry.name,
      remotePath: isSamePane ? (entry.fullPath ?? '') : (destPane === 'remote' ? destFilePath : (entry.fullPath ?? '')),
      localStat,
      direction,
      remoteFileSize: remoteSize,
      remoteFileMtime: remoteMtime,
      // ★ 2026-10-13 P2 修复：透传来源条目 mode——下载覆盖/重命名落地时保留远端权限位
      //   （消费方只在 direction==='download' 时使用）
      remoteFileMode: entry.mode,
      isSamePane,
      samePaneSource: isSamePane ? source : undefined,
      entryKey: pasteEntryKey(entry),
      mode,
    }
  }

  /** 从父目录 listing 读取目标条目 size/mtime（目录 stat 常为 epoch，listing 更可靠） */
  private async _remoteListingMeta(
    parentDir: string,
    name: string,
  ): Promise<{ size?: number; mtimeMs?: number }> {
    if (!parentDir || !name) return {}
    try {
      const entries = await this.ports.fs.readdirRemote(parentDir)
      const found = entries.find(e => e.name === name)
      if (!found) return {}
      const sz = found.size ?? found.attrs?.size
      const mtimeMs = parseRemoteMtime(found)
      return {
        size: sz != null && Number.isFinite(Number(sz)) ? Number(sz) : undefined,
        mtimeMs,
      }
    } catch (e) {
      log.warn('[paste] readdir remote listing meta failed:', parentDir, name, e)
      return {}
    }
  }
}

/**
 * 粘贴基础设施适配器
 * 修改人：DD1024z + Composer
 * 修改时间：2026-09-17 — readdirRemote 透传 attrs/mtime；接入 scanLocalDir 供目录冲突预扫
 *              2026-07-12 — copyLocalFile 加底层 realpath 自我拷贝守卫
 */


export interface PanelPasteHost {
  sftpSession: unknown
  /** 用于远程同机 `cp`；缺失时 copyRemoteDir 回退到本地下载+上传 */
  sshSession?: unknown
  effectiveLang: string
  i18n: { t(key: string, params?: Record<string, string | number>): string }
  notifications: { error?(msg: string, detail: string): void } | null
  /** ★ 2026-09-17：粘贴目录冲突预扫本地内容总大小 */
  scanLocalDir?(dirPath: string): Promise<{ size: number; count: number }>

  uploadFile(remotePath: string, localPath: string): Promise<boolean>
  downloadFile(remotePath: string, localPath: string, mode?: number, size?: number): Promise<boolean>
  uploadDirectory(localSrc: string, remoteDestParent: string): Promise<boolean>
  downloadDirectory(remoteSrc: string, localDestParent: string): Promise<boolean>

  checkRemotePathExists(remotePath: string, expectDir?: boolean): Promise<boolean>
  enqueueConflict(item: import('../core/panel-types').ConflictQueueItem): void
  showConflictDialog(): void
  getConflictQueueLength(): number
  setConflictOriginalTotal(count: number): void

  savePendingPaste(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): void

  renameRemote(src: string, dest: string): Promise<void>
  refreshLocal(): Promise<void>
  refreshRemote(): Promise<unknown>
  /** ★ 2026-10-20：同栏本地复制记录回调（可选，未实现则不记 local-copy） */
  onLocalCopy?(srcPath: string, dstPath: string, isDirectory: boolean): void
  /** ★ 2026-10-20 全量审计：同栏远程复制记录回调（可选，未实现则不记 remote-copy） */
  onRemoteCopy?(srcPath: string, dstPath: string, isDirectory: boolean): void
}

export class PanelPasteAdapter {
  private readonly useCase: PasteUseCase

  constructor(private readonly host: PanelPasteHost) {
    this.useCase = new PasteUseCase(this._buildPorts())
  }

  async paste(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    const hasConflicts = await this.useCase.scanConflicts(entries, destPane, destPath, source, mode)
    if (hasConflicts) {
      this.host.savePendingPaste(entries, destPane, destPath, mode, source)
      this.host.setConflictOriginalTotal(this.host.getConflictQueueLength())
      this.host.showConflictDialog()
      return
    }
    await this.useCase.execute(entries, destPane, destPath, mode, source)
  }

  executePaste(
    entries: PasteEntry[],
    destPane: 'local' | 'remote',
    destPath: string,
    mode: 'copy' | 'cut',
    source: 'local' | 'remote',
  ): Promise<void> {
    return this.useCase.execute(entries, destPane, destPath, mode, source)
  }

  private _buildPorts(): PastePorts {
    const host = this.host
    const remoteCopyDeps = {
      hasSession: () => !!host.sftpSession,
      mkdir: async (p: string) => { await (host.sftpSession as any).mkdir(p) },
      readdir: async (p: string) => {
        const entries = await (host.sftpSession as any).readdir(p)
        return entries.map((e: any) => ({
          name: e.name,
          isDirectory: !!e.isDirectory,
          isSymbolicLink: !!(e.isSymlink || e.isSymbolicLink),
        }))
      },
      download: (r: string, l: string) => host.downloadFile(r, l),
      upload: (r: string, l: string) => host.uploadFile(r, l),
      tryServerCopy: (src: string, dest: string, isDir: boolean) =>
        tryRemoteCpViaSsh(host.sshSession, src, dest, isDir),
    }
    return {
      transfer: {
        uploadFile: (remotePath, localPath) => host.uploadFile(remotePath, localPath),
        downloadFile: (remotePath, localPath, mode, size) =>
          host.downloadFile(remotePath, localPath, mode, size),
        uploadDirectory: (localSrc, remoteDestParent) =>
          host.uploadDirectory(localSrc, remoteDestParent),
        downloadDirectory: (remoteSrc, localDestParent) =>
          host.downloadDirectory(remoteSrc, localDestParent),
      },
      notify: {
        error: (key, params) => {
          try { host.notifications?.error?.(host.i18n.t(key, params), '') } catch { /* ignore */ }
        },
      },
      fs: {
        copyLocalDir: (src, dest) => copyLocalDir(src, dest),
        copyLocalFile: async (src, dest) => {
          // 底层自我拷贝守卫：fs.copyFile(src, src) 会先截断 dest(=src) 再读已清空的 src → 文件变空白
          // 用 realpath 比对真实路径（处理符号链接/大小写/路径分隔符差异），兜住所有上层调用方
          // dest 不存在（如重命名新文件）则放行让 copyFile 正常创建
          try {
            const ra = await fs.realpath(src)
            const rb = await fs.realpath(dest).catch(() => null)
            if (rb && (ra === rb || (process.platform === 'win32' && ra.toLowerCase() === rb.toLowerCase()))) {
              log.warn('copyLocalFile self-copy skipped:', src, '->', dest)
              return
            }
          } catch { /* src 不存在，放行让 copyFile 抛错 */ }
          log.info('copyLocalFile:', src, '->', dest)
          return fs.copyFile(src, dest)
        },
        renameLocal: (src, dest) => fs.rename(src, dest),
        copyRemoteDir: (src, dest, isDir) => copyRemoteDir(src, dest, isDir, remoteCopyDeps),
        renameRemote: (src, dest) => host.renameRemote(src, dest),
        deleteLocalRecursive: (p) => deleteLocalRecursive(p),
        deleteRemoteRecursive: (p) => deleteRemoteRecursive(host.sftpSession as any, p),
        localDirExists: (p) => fs.stat(p).then(() => true).catch(() => false),
        statLocal: (p) => fs.stat(p).catch(() => null),
        scanLocalDir: host.scanLocalDir
          ? (p) => host.scanLocalDir!(p)
          : undefined,
        // ★ 2026-10-20：可选端口逐跳转发（两端都是 `?` 成员时 TS 不报漏转发）
        onLocalCopy: host.onLocalCopy
          ? (src, dest, isDir) => host.onLocalCopy!(src, dest, isDir)
          : undefined,
        onRemoteCopy: host.onRemoteCopy
          ? (src, dest, isDir) => host.onRemoteCopy!(src, dest, isDir)
          : undefined,
        readdirRemote: async (parentDir) => {
          const entries = await (host.sftpSession as any).readdir(parentDir)
          return entries.map((e: any) => ({
            name: e.name,
            size: e.size ?? e.attrs?.size,
            modified: e.modified ?? e.attrs?.modified,
            mtime: e.mtime ?? e.attrs?.mtime,
            attrs: e.attrs,
          }))
        },
      },
      conflict: {
        checkDestExists: async (pane, filePath) => {
          if (pane === 'local') {
            try { await fs.access(filePath); return true } catch { return false }
          }
          if (!host.sftpSession) return false
          const dir = path.posix.dirname(filePath)
          const name = path.posix.basename(filePath)
          try {
            const entries = await (host.sftpSession as any).readdir(dir)
            return entries.some((e: any) => e.name === name)
          } catch {
            return false
          }
        },
        checkRemotePathExists: (remotePath, expectDir) =>
          host.checkRemotePathExists(remotePath, expectDir),
        enqueue: (item) => host.enqueueConflict(item),
        showDialog: () => host.showConflictDialog(),
        queueLength: () => host.getConflictQueueLength(),
        setOriginalTotal: (count) => host.setConflictOriginalTotal(count),
      },
      pending: {
        save: (entries, destPane, destPath, mode, source) =>
          host.savePendingPaste(entries, destPane, destPath, mode, source),
      },
      ui: {
        refreshLocal: () => host.refreshLocal(),
        refreshRemote: () => host.refreshRemote(),
        notifyPasteFailed: () => {
          const msg = host.i18n.t('notify.pasteFailed')
          try { host.notifications?.error?.(msg, '') } catch {}
        },
        hasSftpSession: () => !!host.sftpSession,
      },
    }
  }
}


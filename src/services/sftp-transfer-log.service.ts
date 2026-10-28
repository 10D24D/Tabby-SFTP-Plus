/**
 * 传输日志服务
 * 功能描述：记录所有文件传输操作（上传/下载/删除等），支持查看和导出
 *   存储到 localStorage，避免污染 Tabby 配置文件
 * @创建人：DD1024z + Claude
 * @创建时间：2026-06-21
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — P2-25 修复：僵尸收口（>10min 的 pending 改判 interrupted）原先只由
 *              实例级 `_bootReaped` 把关，而本服务每个面板/设置页各 new 一个实例 ⇒
 *              「第二个面板一构造」就把第一个面板正在跑的长传输标成「已中断」（传输毫发无损，
 *              只有日志/对话框显示错位）。改为进程级认主（mainInstance）：只有本进程第一个
 *              构造的实例做收口，后续实例一律不收口；真正的异常退出会连带进程一起没，
 *              下次启动的第一个实例照旧清僵尸。
 *              2026-10-18 — issue #27 收尾：TransferLogEntry 新增 remote-copy/local-copy 操作与
 *              srcPath/dstPath/srcHostLabel/dstHostLabel 端点字段，使「服务器互传/本地复制」
 *              不再误标上传/下载，并能在日志里记录两端连接归属；导入白名单同步放开
 *              2026-09-26 — 清除记录不再吞掉「正在传输中」的条目：clear()/clearProfile() 跳过
 *              pending 条目（原实现一并 tombstone → 传输结束时 update(id) 找不到 id，
 *              这次传输在记录里彻底消失：既无「进行中」也无最终结果）；配套新增
 *              countClearable()，供「清除」按钮在无「可清除记录」时禁用
 *              2026-09-21 — P2 修复：save() 合并 storage 中其它窗口的条目时就地收口过期 pending，
 *              避免异常退出留下的僵尸记录被回写并长期显示「传输中」（load 时的 _reapStaleEntries
 *              只清过本实例读到的那一批）
 *              2026-09-21 — 新增受限的备份日志导入入口，统一执行类型清洗、条数与体积约束；
 *              2026-09-20 — transferMode 增加 sftp（标准逐文件），与进度条/日志统一展示
 *              2026-09-03 — 新增 transferMode/fileCount 字段（传输模式与文件数展示）
 */
import { Injectable, Optional } from '@angular/core'
import { ConfigService } from 'tabby-core'

import { log } from './sftp-logger'
export type TransferLogEntry = {
  id: string
  timestamp: number
  operation: 'upload' | 'download' | 'edit-upload' | 'edit-download' | 'delete' | 'rename' | 'mkdir' | 'chmod'
    | 'remote-copy' | 'local-copy'
  localPath: string
  remotePath: string
  profileName?: string
  /**
   * ★ issue #27：远程↔远程（服务器互传）时两端都是远程会话，没有上传/下载之分，用
   *   `remote-copy` 区分；本地↔本地复制用 `local-copy`。二者记录源/目标**完整路径**与
   *   **两端主机标签**，使「是哪个连接传的」在日志里一目了然。
   *   经典上传/下载不填这四个字段，对话框按 🖥/🌐 方向渲染（保持旧行为）。
   */
  srcPath?: string
  dstPath?: string
  /** 源端可读主机标签（远程互传=源远程主机；本地复制=本地标识「本机」） */
  srcHostLabel?: string
  /** 目标端可读主机标签（远程互传=目标远程主机；本地复制=本地标识「本机」） */
  dstHostLabel?: string
  success: boolean
  error?: string
  size?: number
  duration?: number  // milliseconds
  startTime?: number  // 传输开始时间 (ms timestamp)
  endTime?: number    // 传输结束时间 (ms timestamp)
  failReason?: 'interrupted' | 'cancelled' | 'error'  // 失败原因分类
  /** 传输进行中（未完成）：true=进行中；false/undefined=已完成（按 success 判定成功/失败）。
   *  修复"传输中误显示下载成功"——日志条目在 add 时即写入，传输完成才 update；缺此标志会导致
   *  进度期间日志显示 0ms ✓。 */
  pending?: boolean
  /** ★ 2026-09-03：目录/文件传输方式。
   *  sftp=标准逐文件 SFTP；tar=打包加速；
   *  undefined=历史条目（仅 fileCount 可暗示标准目录模式） */
  transferMode?: 'sftp' | 'tar'
  /** ★ 2026-09-03：目录传输的文件总数。仅标准预扫描后记录（tar 打包通道走整包不记）；
   *  单文件传输无此字段。0 表示未知/已被 tar 模式取代 */
  fileCount?: number
  /** ★ 2026-09-07 issue #15+：本条目因「内容已确认相同」被自动跳过，未实际传输。
   *  与 success:true 共存——成功语义是「传输意图已完成」，跳过也是意图达成。
   *  UI 通过这个字段区分「真的下载/上传了」与「内容相同未传」，
   *  解决「重复拖同一个文件看不到任何反馈」的问题。 */
  skippedAsDuplicate?: { reason: 'content-identical'; algo?: 'sha1' | 'sha256'; at: number }
}

const STORAGE_KEY = 'sftp-plus-transfer-logs'
const MAX_LOGS = 1000
// ★ 2026-08-10 修复 #9：tombstone（已删 id 持久化清单）。
//   修复 #7 的 save() 合并逻辑会把 localStorage 中现存条目合并回内存——
//   导致 remove/clear/clearProfile 刚删掉的条目在下一次 save 时原地复活（"记录无法清除"、
//   "取消排队传输后日志残留'传输中'"）。删除操作把 id 记入 tombstone 并持久化，
//   save() 合并时跳过这些 id，删除才能真正落盘（多窗口场景同样生效）。
const TOMBSTONE_KEY = 'sftp-plus-transfer-logs-deleted'
const MAX_TOMBSTONES = 1000

/**
 * ★ 2026-10-19 P2-25：本进程的「主实例」（第一个构造出来的那个服务实例）。
 *
 * 背景：本服务**不是 root 单例**——浮动面板（`sftp-floating-panel.component.ts` 内
 * `new SftpTransferLogService(...)`，每个面板一个）与设置页各 new 一个实例，共享同一份
 * localStorage。而「把超过 10 分钟的 pending 条目改判 interrupted」的僵尸收口
 * （_reapStaleEntries / save() 合并时的就地收口）原先只看实例自己的 `_bootReaped` 标志
 * ⇒ **每个新实例都算一次「应用启动」**：第二个面板（或设置页）一构造就把存储里年龄超阈值的
 * pending 条目改判中断并立刻写盘。于是「面板 A 正在跑一个 20 分钟的大文件下载」时再开一个
 * 面板，这条仍在传输的记录就被标成「已中断」——传输本身毫发无损，只有日志/传输对话框错位。
 *
 * 修法（保守，按指令优先加「实例身份」判据）：收口认定为**进程级一次性**动作，只有本进程
 * 第一个构造的实例（主实例）有权执行；同窗口里后开的面板/设置页实例一律不收口 —— 它们既
 * 无从判断别人是不是在传，也没有比主实例更及时的信息。
 * 这样既不再误伤在传任务，又保留了原有价值：**真正的异常退出会连带进程一起没**，下次启动的
 * 第一个实例照旧会把僵尸清掉。
 * 遗留：跨窗口（各窗口是独立渲染进程、模块级变量不共享）仍是历史口径 —— 窗口 B 打开面板时
 * 可能收口窗口 A 的超长传输条目。该取舍与原先注释里写的「10min 阈值仅可能误伤其它窗口」
 * 一致，本次不扩大改动面。
 */
let mainInstance: SftpTransferLogService | null = null

/**
 * 进程级自增序列号，确保同一毫秒内生成的 ID 不重复。
 * ★ 2026-10-25 BUG-H3 修复：原实现仅用 Date.now() + 6 位随机数，
 *   在批量操作（如一次拖拽多个文件）时毫秒级碰撞概率虽低但非零。
 *   现增加进程级自增计数器，同一毫秒内 seq 单调递增，彻底消除碰撞风险。
 */
let _idSeq = 0
function generateId(): string {
  const seq = ++_idSeq
  return Date.now().toString(36) + seq.toString(36).padStart(4, '0') + Math.random().toString(36).substring(2, 6)
}

@Injectable()
export class SftpTransferLogService {
  private logs: TransferLogEntry[] = []
  private _loaded = false
  /** 已删除条目 id 清单（尾部较新）：save() 合并时跳过，防止删除被复活 */
  private _tombstones: string[] = []
  /** 僵尸 pending 清理只在应用启动（首次构造）时执行一次：
   *  reload()（打开日志对话框/多面板同步）时本实例可能有进行中的长传输，不得误清 */
  private _bootReaped = false

  constructor(@Optional() private configService?: ConfigService) {
    // ★ 2026-10-19 P2-25：认主（详见 mainInstance 注释）——先到先得，只有主实例做僵尸收口
    if (!mainInstance) mainInstance = this
    this.load()
  }

  private load(): void {
    if (this._loaded) return
    this._loaded = true
    this._loadTombstones()
    // 从 localStorage 加载
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this.logs = this._sanitizeIds(parsed)
          this._reapStaleEntriesOnce()
          return
        }
      }
    } catch { /* fall through */ }
    // 迁移：从旧版 Tabby 配置加载（仅首次。检查长度>0 避免重复空删）
    if (this.configService?.store) {
      try {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg && Array.isArray(cfg.transferLogs) && cfg.transferLogs.length > 0) {
          this.logs = this._sanitizeIds([...cfg.transferLogs])
          this._reapStaleEntriesOnce()
          // 迁移后彻底删除 config 中的 transferLogs（传输日志只存 localStorage）
          delete cfg.transferLogs
          try { this.configService.save() } catch {}
          this.save()
          return
        }
      } catch {}
    }
    this.logs = []
  }

  /**
   * 清理残留的"传输中"条目：主实例构造（应用启动）时本实例必然没有任何进行中的传输，
   * pending=true 的条目都是上次异常退出/卡死（如目录并发死锁）遗留的僵尸记录。
   * ★ 2026-10-19 P2-25：限定主实例执行（非主实例可能是「第二个面板」，它构造时主实例
   *   的长传输正在跑，见 mainInstance 注释）。
   * ★ 2026-08-10 修复 #8：短阈值（10min）兜底清理——仅可能误伤其它窗口刚开始的
   *   超长传输，属可接受代价；原 24h 阈值让当天遗留的僵尸记录整天显示"传输中"。
   */
  private _reapStaleEntriesOnce(): void {
    if (this._bootReaped) return
    // ★ 2026-10-19 P2-25：非主实例（第二个面板 / 设置页）不做收口 —— 它们构造时本进程
    //   可能正有其它实例的传输在跑，>10min 的 pending 不是「僵尸」而是「正在传」。
    if (this !== mainInstance) return
    this._bootReaped = true
    this._reapStaleEntries()
  }

  private _reapStaleEntries(): void {
    const REAP_PENDING_MAX_AGE_MS = 10 * 60 * 1000 // 10min：启动时超过该时长的 pending 必为遗留
    let changed = false
    const now = Date.now()
    for (const entry of this.logs) {
      if (entry.pending) {
        const age = now - (entry.startTime ?? entry.timestamp)
        if (!Number.isFinite(age) || age < REAP_PENDING_MAX_AGE_MS) continue
        entry.pending = false
        entry.success = false
        entry.failReason = 'interrupted'
        entry.endTime = now
        changed = true
      }
    }
    if (changed) this.save()
  }

  /** 清洗旧日志：补缺失/重复 id；强转数字字段（旧 config.yaml/JSON 导入时 size/duration/timestamp 可能被序列化成字符串，导致 formatSize 的 .toFixed 抛 TypeError → *ngFor 该行被丢弃 → "共N条只显示1行"） */
  private _sanitizeIds(logs: TransferLogEntry[]): TransferLogEntry[] {
    const seen = new Set<string>()
    const num = (v: unknown): number | undefined => {
      const x = Number(v)
      return isFinite(x) ? x : undefined
    }
    return logs.map(l => {
      let id = l.id
      if (!id || seen.has(id)) id = generateId()
      seen.add(id)
      return {
        ...l,
        id,
        timestamp: num(l.timestamp) ?? Date.now(),
        size: l.size != null ? num(l.size) : undefined,
        duration: l.duration != null ? num(l.duration) : undefined,
        startTime: l.startTime != null ? num(l.startTime) : undefined,
        endTime: l.endTime != null ? num(l.endTime) : undefined,
      }
    })
  }

  private _loadTombstones(): void {
    try {
      const raw = localStorage.getItem(TOMBSTONE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          this._tombstones = parsed.filter((x: unknown) => typeof x === 'string').slice(-MAX_TOMBSTONES)
        }
      }
    } catch { /* ignore */ }
  }

  private _saveTombstones(): void {
    try { localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(this._tombstones)) } catch { /* ignore */ }
  }

  private _tombstone(id: string | null | undefined): void {
    if (!id || this._tombstones.includes(id)) return
    this._tombstones.push(id)
    if (this._tombstones.length > MAX_TOMBSTONES) {
      this._tombstones.splice(0, this._tombstones.length - MAX_TOMBSTONES)
    }
  }

  private save(): void {
    // ★ 2026-08-10 修复 #7：写入前与存储中现有记录按 id 合并，避免多实例/多面板
    //   整体覆盖丢失其它实例新增的条目；合并后按时间戳排序保持时序。
    // ★ 2026-08-10 修复 #9：合并时跳过 tombstone 中的 id——否则 remove/clear/clearProfile
    //   刚删掉的条目会被存储中的旧数据复活（"记录无法清除"的根因）
    const deleted = new Set(this._tombstones)
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored = JSON.parse(raw)
        if (Array.isArray(stored)) {
          const merged = new Map<string, TransferLogEntry>(
            this.logs.filter(l => l?.id && !deleted.has(l.id)).map(l => [l.id, l]),
          )
          // ★ 2026-09-21 P2 修复：从存储并入的条目原样落库，其中可能有其它窗口异常退出
          //   留下的 pending 僵尸；本实例 load() 时的 _reapStaleEntries 只清过自己读到的那批，
          //   合并回写会让僵尸复活并长期显示「传输中」。这里按同样的年龄阈值就地收口。
          const now = Date.now()
          const REAP_PENDING_MAX_AGE_MS = 10 * 60 * 1000
          for (const l of stored) {
            if (!l?.id || deleted.has(l.id) || merged.has(l.id)) continue
            // ★ 2026-10-19 P2-25：这里的就地收口同样只由主实例执行 —— 非主实例（第二个面板 /
            //   设置页）一次普通的 save() 合并就会把别的实例正在跑的长条目标成中断，
            //   判据与来源见 mainInstance 注释。
            if (l.pending && this === mainInstance) {
              const age = now - (l.startTime ?? l.timestamp)
              if (Number.isFinite(age) && age >= REAP_PENDING_MAX_AGE_MS) {
                l.pending = false
                l.success = false
                l.failReason = 'interrupted'
                l.endTime = now
              }
            }
            merged.set(l.id, l)
          }
          this.logs = [...merged.values()].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        }
      }
    } catch { /* 存储不可读时按当前内存数据写入 */ }
    // 保留最近 MAX_LOGS 条记录
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS)
    }
    // 写入 localStorage（含字节大小保护，防止超出 ~5MB 配额）
    try {
      const MAX_BYTES = 4 * 1024 * 1024 // 4 MB
      let serialized = JSON.stringify(this.logs)
      // ★ 2026-09-20 P2-12 审计修复：serialized.length 返回 UTF-16 字符数而非字节数。
      //   中文路径 1 字符 = 3 字节（UTF-8），仅按字符数判断会低估实际大小，导致
      //   看似 4MB 字符 ≈ 8~12MB 字节 → 超出 localStorage 配额 → save 静默失败。
      //   改用 Blob 估算真实字节数（Electron 环境下可用），回退字符数 × 2。
      let estimatedBytes: number
      try {
        estimatedBytes = new Blob([serialized]).size
      } catch {
        estimatedBytes = serialized.length * 2 // UTF-16 worst case
      }
      while (estimatedBytes > MAX_BYTES && this.logs.length > 1) {
        // 丢弃最旧的一半，直到大小合规
        this.logs = this.logs.slice(-Math.ceil(this.logs.length / 2))
        serialized = JSON.stringify(this.logs)
        try {
          estimatedBytes = new Blob([serialized]).size
        } catch {
          estimatedBytes = serialized.length * 2
        }
      }
      localStorage.setItem(STORAGE_KEY, serialized)
      this._saveTombstones()
    } catch (e) { log.warn('localStorage save failed', e) }
  }

  /** 从设置备份替换导入日志；导入数据不得绕过运行时的清洗与存储上限。 */
  replaceFromImport(raw: unknown): boolean {
    if (!Array.isArray(raw)) return false
    const operations = new Set<TransferLogEntry['operation']>([
      'upload', 'download', 'edit-upload', 'edit-download',
      'delete', 'rename', 'mkdir', 'chmod', 'remote-copy', 'local-copy',
    ])
    const modes = new Set<NonNullable<TransferLogEntry['transferMode']>>(['sftp', 'tar'])
    const now = Date.now()
    const finiteNumber = (value: unknown): number | undefined => {
      const number = Number(value)
      return Number.isFinite(number) ? number : undefined
    }
    const imported: TransferLogEntry[] = []
    for (const value of raw.slice(-MAX_LOGS)) {
      if (!value || typeof value !== 'object') continue
      const source = value as Record<string, unknown>
      const operation = String(source.operation ?? '') as TransferLogEntry['operation']
      if (!operations.has(operation)) continue
      const wasPending = source.pending === true
      const mode = String(source.transferMode ?? '') as NonNullable<TransferLogEntry['transferMode']>
      imported.push({
        id: typeof source.id === 'string' ? source.id.slice(0, 256) : '',
        timestamp: finiteNumber(source.timestamp) ?? now,
        operation,
        localPath: String(source.localPath ?? '').slice(0, 4096),
        remotePath: String(source.remotePath ?? '').slice(0, 4096),
        profileName: source.profileName == null ? undefined : String(source.profileName).slice(0, 512),
        success: wasPending ? false : source.success === true,
        error: source.error == null ? undefined : String(source.error).slice(0, 16384),
        size: finiteNumber(source.size),
        duration: finiteNumber(source.duration),
        startTime: finiteNumber(source.startTime),
        endTime: wasPending ? now : finiteNumber(source.endTime),
        failReason: wasPending ? 'interrupted'
          : (source.failReason === 'cancelled' || source.failReason === 'interrupted' || source.failReason === 'error'
              ? source.failReason : undefined),
        pending: false,
        transferMode: modes.has(mode) ? mode : undefined,
        fileCount: finiteNumber(source.fileCount),
      })
    }
    this.logs = this._sanitizeIds(imported)
    this._tombstones = []
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(TOMBSTONE_KEY)
    } catch { /* save() will report storage failures */ }
    this.save()
    return true
  }

  /**
   * 添加传输日志
   * 功能描述：记录一次文件传输操作
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-21
   */
  add(entry: Omit<TransferLogEntry, 'id' | 'timestamp'>): TransferLogEntry {
    const fullEntry: TransferLogEntry = {
      ...entry,
      id: generateId(),
      timestamp: Date.now(),
    }
    this.logs.push(fullEntry)
    const _name = (entry.remotePath || entry.localPath || '').split('/').pop() || (entry.localPath || '').split(/[\\/]/).pop() || '?'
    log.info('[transfer-log] add #' + this.logs.length + ' op=' + entry.operation + ' profile=' + (entry.profileName ?? '∅') + ' file=' + _name + ' pending=' + !!entry.pending)
    this.save()
    return fullEntry
  }

  /**
   * 更新传输日志
   * 功能描述：根据 ID 更新已有日志条目（用于完成时更新状态）
   * 创建人：DD1024z + Hy3 preview
   * 创建时间：2026-06-23
   */
  update(id: string, updates: Partial<Omit<TransferLogEntry, 'id' | 'timestamp'>>): boolean {
    const idx = this.logs.findIndex(l => l.id === id)
    if (idx < 0) return false
    Object.assign(this.logs[idx], updates)
    this.save()
    return true
  }

  /**
   * 删除指定日志条目
   * 功能描述：用于清理从未真正开始的排队占位日志（冲突/跳过/取消），避免日志污染
   * 创建人：DD1024z + Hy3
   * 创建时间：2026-08-10
   */
  remove(id: string): boolean {
    const idx = this.logs.findIndex(l => l.id === id)
    if (idx < 0) return false
    this.logs.splice(idx, 1)
    this._tombstone(id)
    this.save()
    return true
  }

  /**
   * 获取所有日志
   * 功能描述：返回所有传输日志，按时间倒序
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  getAll(): TransferLogEntry[] {
    return [...this.logs].reverse()
  }

  /**
   * 获取所有不重复的连接名称列表（按出现顺序）。
   * 用于「全部连接」筛选下拉框的选项数据源。
   */
  getProfileNames(): string[] {
    const names = new Set<string>()
    for (const l of this.logs) {
      if (l.profileName) names.add(l.profileName)
    }
    return Array.from(names)
  }

  /**
   * 按条件筛选日志
   * 功能描述：按操作类型和成功状态筛选日志
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  filter(options?: {
    operation?: TransferLogEntry['operation']
    success?: boolean
    profileName?: string
    since?: number  // timestamp (inclusive)
    until?: number  // timestamp (inclusive)
  }): TransferLogEntry[] {
    let result = [...this.logs]
    if (options?.operation) {
      result = result.filter(l => l.operation === options.operation)
    }
    if (options?.success !== undefined) {
      result = result.filter(l => !l.pending && l.success === options.success)
    }
    if (options?.profileName) {
      // 仅排除「明确归属其他连接」的记录；无 profile 归属（旧日志/未关联）仍显示，
      // 避免某条传输记录的 profileName 为空时被当前连接筛选误排除（导致「2 次传输只显示 1 条」）
      // ★ 2026-09-26：抽成 _profileMatches——清除动作（clearProfile）与「可清除计数」
      //   必须用同一归属规则，否则会出现「列表里看得到、点清除却清不掉」。
      result = result.filter(l => this._profileMatches(l, options.profileName))
    }
    if (options?.since !== undefined) {
      result = result.filter(l => l.timestamp >= options.since!)
    }
    if (options?.until !== undefined) {
      result = result.filter(l => l.timestamp <= options.until!)
    }
    return result.reverse()
  }

  /**
   * 清除所有日志
   * 功能描述：清空传输日志
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  clear(): void {
    // ★ 2026-08-10 修复 #9：不再直接 removeItem——先 tombstone 再经 save() 写空，
    //   保证其它窗口后续 save() 合并时也不会把已清记录复活
    // ★ 2026-09-26：**只清「已结束」的记录，保留 pending（正在传输中）**。
    //   原实现把 pending 一起 tombstone：正在传输的条目被清掉后，该次传输结束时
    //   transferLog.update(logEntryId) 找不到 id（返回 false）→ 这次传输在记录里
    //   彻底消失（既无「进行中」也无最终结果），用户侧＝「我明明在传，记录却没了」。
    //   界面侧由「清除」按钮的 disabled（clearableCount）兜住；此处仍保留 pending，
    //   因为 clear() 亦可被其它入口调用（如导入覆盖、测试）。
    const keptPending = this.logs.filter(l => l.pending === true)
    for (const l of this.logs) {
      if (l.pending !== true) this._tombstone(l.id)
    }
    this.logs = keptPending
    this.save()
  }

  /** 从备份数据导入日志（覆盖当前记录） */
  importLogs(logs: TransferLogEntry[]): void {
    const imported = Array.isArray(logs) ? this._sanitizeIds(logs).slice(-MAX_LOGS) : []
    const keep = new Set(imported.map(l => l.id))
    // 覆盖语义：不在导入集中的旧条目（内存 + 存储）一律 tombstone，防止 save() 合并复活
    for (const l of this.logs) {
      if (!keep.has(l.id)) this._tombstone(l.id)
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored = JSON.parse(raw)
        if (Array.isArray(stored)) {
          for (const l of stored) {
            if (l?.id && !keep.has(l.id)) this._tombstone(l.id)
          }
        }
      }
    } catch { /* ignore */ }
    this.logs = imported
    this.save()
  }

  /** 重新从 localStorage 加载（多面板 / 导入后同步） */
  reload(): void {
    this._loaded = false
    this.logs = []
    this.load()
  }

  /**
   * 清除指定连接的日志
   * 功能描述：只清除某个连接配置的传输日志
   * 创建人：DD1024z + Deepseek-V4-Flash
   * 创建时间：2026-06-25
   */
  clearProfile(profileName: string): void {
    // ★ 2026-08-10 修复 #9：被清除的条目记入 tombstone，否则 save() 合并会立即复活
    // ★ 2026-09-26：① 跳过 pending（正在传输中）——只清该连接下「已结束」的记录；
    //   ② 归属判定与 filter() 统一走 _profileMatches（无归属的旧记录也归本连接显示），
    //   否则会出现「列表里看得到、点清除却清不掉」的不一致。
    for (const l of this.logs) {
      if (l.pending !== true && this._profileMatches(l, profileName)) this._tombstone(l.id)
    }
    this.logs = this.logs.filter(l => l.pending === true || !this._profileMatches(l, profileName))
    this.save()
  }

  /**
   * profile 归属匹配（filter / clearProfile / countClearable 共用同一规则）。
   * 无 profileName 归属的记录（旧日志、未关联）视为属于当前连接，保持与界面显示一致。
   */
  private _profileMatches(l: TransferLogEntry, profileName?: string): boolean {
    if (profileName === undefined) return true
    return !l.profileName || l.profileName === profileName
  }

  /**
   * 统计「可清除」的记录数（排除正在传输中的 pending 条目）。
   * ★ 2026-09-26：供「清除」按钮判定可用性——列表本身为空、或剩下的全是
   *   「正在传输中」时都不该让按钮可点（点了也清不掉任何东西）。
   *   范围与清除动作严格一致：按 profileName 归属（不叠加界面上的 op/状态/时间筛选，
   *   否则「筛选后为空但实际有记录」会误禁用）。
   */
  countClearable(profileName?: string): number {
    return this.logs.filter(l =>
      l.pending !== true && this._profileMatches(l, profileName),
    ).length
  }

  /**
   * 导出日志为 JSON
   * 功能描述：将日志导出为 JSON 字符串
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   * ★ 2026-10-25：支持传入指定 entries，实现按筛选条件导出
   */
  exportAsJson(entries?: TransferLogEntry[]): string {
    return JSON.stringify(entries ?? this.getAll(), null, 2)
  }

  /**
   * ★ 2026-10-25：导出日志为 CSV
   * 功能描述：将日志导出为 CSV 字符串（UTF-8 BOM + 表头），方便 Excel 打开分析
   * ★ 2026-10-25：支持传入指定 entries，实现按筛选条件导出
   */
  exportAsCsv(entries?: TransferLogEntry[]): string {
    const BOM = '\uFEFF'
    // ★ 列名优化：更直观的中文表头
    const headers = ['传输时间', '操作类型', '本地路径', '远程路径', '源路径', '目标路径', '状态', '文件大小', '耗时', '失败原因', '传输模式']
    const escapeCsv = (val: unknown): string => {
      if (val == null) return ''
      const s = String(val)
      // 包含逗号/换行/引号时用引号包裹，内部引号转义为两个
      if (/[\r\n,"]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
    const rows = (entries ?? this.getAll()).map(e => {
      const status = e.pending ? '进行中' : (e.success ? '成功' : '失败')
      // ★ 时间格式：YYYY-MM-DD HH:mm:ss（比 ISO 8601 更直观）
      const d = new Date(e.timestamp)
      const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
      // ★ 大小格式：使用人类可读的单位（KB/MB/GB）
      const sizeStr = this._formatSizeForCsv(e.size)
      // ★ 耗时格式：带单位
      const durationStr = e.duration != null ? `${e.duration} ms` : ''
      return [
        timeStr,
        e.operation,
        e.localPath,
        e.remotePath,
        e.srcPath || '',
        e.dstPath || '',
        status,
        sizeStr,
        durationStr,
        e.failReason || '',
        e.transferMode || '',
      ].map(escapeCsv).join(',')
    })
    return BOM + [headers.join(','), ...rows].join('\n')
  }

  /** 辅助：将字节数转为人类可读的 CSV 显示（与 file-utils.ts 的 formatSize 保持一致） */
  private _formatSizeForCsv(bytes?: number): string {
    if (bytes == null || bytes < 0) return ''
    if (bytes === 0) return '0 B'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let v = bytes, i = 0
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
    return `${v.toFixed(i === 0 ? 0 : 2)} ${u[i]}`
  }

  /**
   * 获取统计信息
   * 功能描述：返回传输统计（总数、成功数、失败数、总字节数）
   * 创建人：DD1024z + Claude
   * 创建时间：2026-06-21
   */
  getStats(): {
    total: number
    success: number
    failed: number
    totalBytes: number
  } {
    const completed = this.logs.filter(l => !l.pending)
    const success = completed.filter(l => l.success).length
    const totalBytes = completed
      .filter(l => l.success && l.size)
      .reduce((sum, l) => sum + (l.size || 0), 0)
    return {
      total: this.logs.length,
      success,
      failed: completed.length - success,
      totalBytes,
    }
  }
}

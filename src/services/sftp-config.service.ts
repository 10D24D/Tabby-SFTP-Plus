/**
 * SFTP+ 配置统一访问服务
 *
 * 封装 configService.store['tabby-sftp-plus'] 的嵌套存取，
 * 提供从旧扁平 key（paneState 下的 sftp-plus-*，如
 *   sftp-plus-path-mode.root@host: remember → paneState.perHost[host].pathMode）
 * 到新嵌套结构的自动迁移与双读兼容。
 *
 * 迁移时机：首次注入（构造函数）时自动执行，保留旧 key 不删。
 * 双读逻辑：get() 时新路径无值则回退旧 key。
 *
 * @修改人：DD1024z + Hy4 preview
 * @修改时间：2026-10-20 — P2-24 修复：_migrateIfNeeded 的「已迁移」判定原为一条
 *              2026-10-20 全量审计：root getter 校验配置段形态（非空普通对象），非法时重建 {}，
 *                修手改 config.yaml 置 null 后构造期崩溃。
 *              `typeof layout === 'object' && typeof perHost === 'object' ⇒ 跳过全部`，
 *              两处缺陷：① `typeof null === 'object'`，layout/perHost 为 null 的脏数据被
 *              当成已迁移；② 连坐——只要这两段已迁，就把后加的 _migrateColumns（列配置）
 *              与 _cleanupOldKeys（旧 key 清理）一并跳过 ⇒ 旧列 key 永久残留、
 *              列配置永远回不到新结构。改为按「还有没有旧 key」逐类判定，各迁移函数
 *              自身按新目标是否已有值幂等，三类互不连坐。
 */

import { Injectable, Optional } from '@angular/core'
import { ConfigService } from 'tabby-core'

import { log } from './sftp-logger'

/** paneState 内旧扁平 key → 新路径前缀的映射表（用于双读回退） */
const OLD_KEY_MAP: Record<string, string> = {
  'sftp-plus-path-mode':        'perHost.{host}.pathMode',
  'sftp-plus-path-mem':         'perHost.{host}.rememberPath',
  'sftp-plus-saved-local-path': 'perHost.{host}.savedLocalPath',
  'sftp-plus-saved-remote-path':'perHost.{host}.savedRemotePath',
}

@Injectable({ providedIn: 'root' })
export class SftpConfigService {
  private _migrated = false
  /** 内存级缓存，区分"编辑中但不立即落盘" */
  private _cache: Record<string, any> = {}
  /** ★ 2026-08-10 修复 #16：ConfigService 不可用时的兜底存储，
   *   避免 set() 写入临时对象后静默丢失（get 永远读不回） */
  private _localRoot: Record<string, any> = {}

  constructor(@Optional() private configService?: ConfigService) {
    this._migrateIfNeeded()
  }

  // ── 顶层配置段访问 ──

  /**
   * 获取 tabby-sftp-plus 根对象（若不存在则初始化）
   * ★ 2026-10-20 全量审计：原判据只测「key 是否存在」。用户手改 config.yaml 把该段写成
   *   `tabby-sftp-plus: null`（或标量/数组）时，key 存在但值不是对象 ⇒ root 返回 null，
   *   构造期的 `_migrateIfNeeded()` 随即访问 `root.paneState` 抛 TypeError，
   *   表现为「插件整个面板起不来」且无有效日志。这里校验形态，非法就重建为 {}。
   */
  private get root(): Record<string, any> {
    if (!this.configService?.store) return this._localRoot
    const storeKey = 'tabby-sftp-plus'
    const existing = this.configService.store[storeKey]
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) return existing
    if (existing !== undefined && existing !== null) {
      log.warn('config root has invalid shape; resetting:', typeof existing)
    }
    this.configService.store[storeKey] = {}
    return this.configService.store[storeKey]
  }

  // ── 公开 API ──

  /**
   * 按点路径读取（如 get('paneState.perHost."root@host".pathMode')）
   * 优先读新嵌套路径 → 回退旧扁平 key（双读兼容）→ 返回 fallback
   */
  get(path: string, fallback?: any): any {
    // ★ 2026-08-26 M9：不再优先长期内存缓存——_cache 仅作 set 未 flush 的写缓冲；
    //   读取时若 store 已有值则以 store 为准，避免外部改配置后读陈旧值
    const newVal = this._getByPath(this.root, path)
    if (newVal !== undefined) {
      if (path in this._cache) delete this._cache[path]
      return newVal
    }
    if (path in this._cache) return this._cache[path]
    // 双读回退
    const oldVal = this._fallbackRead(path)
    if (oldVal !== undefined) return oldVal
    return fallback
  }

  /**
   * 按点路径写入（仅更新内存 + store 对象，不立刻 save）
   * 高频操作 set 后由调用方选择时机调用 flush()
   */
  set(path: string, value: any): void {
    this._cache[path] = value
    this._setByPath(this.root, path, value)
  }

  /** 写入并立即落盘（低频操作用） */
  setAndFlush(path: string, value: any): void {
    this.set(path, value)
    this.flush()
  }

  /**
   * 强制落盘到 config.yaml
   *
   * ★ 2026-10-09 审计根治（unhandled rejection + 写缓冲丢失）：
   *   原写法是同步 try/catch 包住 configService.save()，外加无条件 clearCache()。
   *   宿主 ConfigService.save() 的签名是 `save(): Promise<void>`（内部 await ready$
   *   后才 platform.saveConfig），**同步 try/catch 捕获不到 Promise rejection**：
   *     ① 写盘失败 / ready$ 未 resolve → unhandled promise rejection
   *        （Electron 渲染进程会打到 DevTools，宿主可能还有全局 rejection 处理）；
   *     ② clearCache() 已无条件执行 —— 而 _cache 的存在意义正是「set() 尚未 flush 的
   *        写缓冲」（set 只写 _cache + _setByPath，_setByPath 写 ConfigProxy 结构成员
   *        失败时会抛错被吞，此时值只在 _cache 里）。一次失败的 flush 就把它彻底抹掉
   *        ⇒ **配置改动静默丢失**。
   *   根治：真正 await save()；失败时**保留缓存**并写日志，绝不假装落盘成功。
   */
  flush(): void {
    const svc = this.configService
    if (!svc) {
      // 无宿主 ConfigService（测试/替身）：无盘可落，但缓存仍要在下次 get 时能被清掉
      this.clearCache()
      return
    }
    try {
      const r = svc.save()
      if (r && typeof (r as Promise<void>).then === 'function') {
        void (r as Promise<void>).then(
          () => { this.clearCache() },
          (e: unknown) => {
            // ★ 保留 _cache：写盘失败时若清掉，用户改动就彻底丢了；
            //   保留它，后续 get() 仍能读到本次的内存值（至少在本会话内不丢）。
            log.warn('sftp config flush failed, cache kept:', e)
          },
        )
        return
      }
      // 同步返回（如测试替身）：视为成功
      this.clearCache()
    } catch (e) {
      log.warn('sftp config flush threw, cache kept:', e)
    }
  }

  /** 清空内存缓存（强制下次 get 从 store 读） */
  clearCache(): void {
    this._cache = {}
  }

  /** 删除指定嵌套路径的属性并落盘 */
  remove(path: string): void {
    const parts = path.split('/')
    const parent = this._getParentObj(this.root, path)
    if (parent) {
      delete parent[parts[parts.length - 1]]
    }
    delete this._cache[path]
    this.flush()
  }

  // ── 自动迁移 ──

  private _migrateIfNeeded(): void {
    if (this._migrated || !this.configService?.store) return
    this._migrated = true
    const paneState = this.root.paneState
    if (!paneState || typeof paneState !== 'object') return
    // 已迁移过的判定：按类别看「还有没有待迁移的旧 key」，而不是用一个总闸一次性跳过。
    // ★ 2026-10-19 P2-24 修复：原写法 `typeof paneState.layout === 'object' && typeof
    //   paneState.perHost === 'object' ⇒ return` 有两个问题——
    //   ① `typeof null === 'object'`：layout/perHost 为 null 的脏数据被误判为「已迁移」；
    //   ② 连坐：只要这两段已迁，就把后加的 _migrateColumns（列配置）与 _cleanupOldKeys
    //      （旧 key 清理）一并跳过 ⇒ 旧列 key 永久残留、列配置永远回不到 paneState/{local,remote}。
    //   现在三类各按自己的旧 key 判定，互不牵连；迁移函数内部对新目标已有值的字段不覆盖，
    //   因此在「perHost/layout 早迁、列符号后加」的存量配置上补跑也是安全的。
    const hasOldPerHost = Object.keys(paneState).some(k => k.startsWith('sftp-plus-path-mode.'))
    const hasOldLayout = [
      'sftp-plus-layout-mode',
      'sftp-plus-horizontal-split-ratio',
      'sftp-plus-vertical-split-ratio',
    ].some(k => paneState[k] !== undefined)
    const hasOldColumns = (['local', 'remote'] as const).some(scope =>
      ['sort', 'cols', 'cols-order', 'col-widths'].some(f => paneState[`sftp-plus-${scope}-${f}`] !== undefined))
    if (!hasOldPerHost && !hasOldLayout && !hasOldColumns) return

    this._migratePerHost(paneState)
    this._migrateLayout(paneState)
    this._migrateColumns(paneState)
    // ★ BUG-10 修复：迁移后清理旧 key，避免旧数据残留
    this._cleanupOldKeys(paneState)
    this.flush()
  }

  /** 清理迁移后的旧扁平 key，避免旧数据残留 */
  private _cleanupOldKeys(paneState: Record<string, any>): void {
    // perHost 旧 key
    const hostKeys = Object.keys(paneState).filter(k => k.startsWith('sftp-plus-path-mode.'))
    for (const key of hostKeys) {
      const host = key.substring('sftp-plus-path-mode.'.length)
      delete paneState[`sftp-plus-path-mode.${host}`]
      delete paneState[`sftp-plus-path-mem.${host}`]
      delete paneState[`sftp-plus-saved-local-path.${host}`]
      delete paneState[`sftp-plus-saved-remote-path.${host}`]
    }
    // layout 旧 key
    delete paneState['sftp-plus-layout-mode']
    delete paneState['sftp-plus-horizontal-split-ratio']
    delete paneState['sftp-plus-vertical-split-ratio']
    // columns 旧 key
    for (const scope of ['local', 'remote'] as const) {
      delete paneState[`sftp-plus-${scope}-sort`]
      delete paneState[`sftp-plus-${scope}-cols`]
      delete paneState[`sftp-plus-${scope}-cols-order`]
      delete paneState[`sftp-plus-${scope}-col-widths`]
    }
  }

  /** 主机相关（原 root@host 拼进 key） */
  private _migratePerHost(src: Record<string, any>): void {
    const hostKeys = Object.keys(src).filter(k => k.startsWith('sftp-plus-path-mode.'))
    for (const key of hostKeys) {
      const host = key.substring('sftp-plus-path-mode.'.length)
      // ★ 2026-10-19 P2-24：该主机已迁到 paneState/perHost/{host} 则不再回填——
      //   本函数会在「perHost 已迁过但旧 key 仍在」的存量配置上被补跑，此时用户在面板里
      //   改过的路径模式不能被旧扁平 key 覆盖回去。
      if (this._getByPath(this.root, `paneState/perHost/${host}`) !== undefined) continue
      this._setByPath(this.root, `paneState/perHost/${host}/pathMode`, src[`sftp-plus-path-mode.${host}`])
      if (`sftp-plus-path-mem.${host}` in src)
        this._setByPath(this.root, `paneState/perHost/${host}/rememberPath`, src[`sftp-plus-path-mem.${host}`])
      if (`sftp-plus-saved-local-path.${host}` in src)
        this._setByPath(this.root, `paneState/perHost/${host}/savedLocalPath`, src[`sftp-plus-saved-local-path.${host}`])
      if (`sftp-plus-saved-remote-path.${host}` in src)
        this._setByPath(this.root, `paneState/perHost/${host}/savedRemotePath`, src[`sftp-plus-saved-remote-path.${host}`])
    }
  }

  /** 布局相关 */
  private _migrateLayout(src: Record<string, any>): void {
    // ★ 2026-10-19 P2-24：逐项判「新路径是否已有值」，已有则跳过（同上，避免旧值回填覆盖现值）
    const pairs: Array<[string, string]> = [
      ['mode', 'sftp-plus-layout-mode'],
      ['horizontalSplitRatio', 'sftp-plus-horizontal-split-ratio'],
      ['verticalSplitRatio', 'sftp-plus-vertical-split-ratio'],
    ]
    for (const [field, oldKey] of pairs) {
      if (src[oldKey] === undefined) continue
      const newPath = `paneState/layout/${field}`
      if (this._getByPath(this.root, newPath) !== undefined) continue
      this._setByPath(this.root, newPath, field === 'mode' ? src[oldKey] : this._toNum(src[oldKey]))
    }
  }

  /** 列配置 */
  private _migrateColumns(src: Record<string, any>): void {
    // ★ 2026-10-19 P2-24：逐字段判「新路径是否已有值」，已有则跳过。列是最常被改动的
    //   一类（面板随时会改排序/列宽），补跑时绝不能用旧扁平 key 覆盖用户的新值。
    for (const scope of ['local', 'remote'] as const) {
      const fields: Record<string, string> = {
        sort: `sftp-plus-${scope}-sort`,
        cols: `sftp-plus-${scope}-cols`,
        colsOrder: `sftp-plus-${scope}-cols-order`,
        colWidths: `sftp-plus-${scope}-col-widths`,
      }
      for (const field of Object.keys(fields)) {
        const raw = src[fields[field]]
        if (raw === undefined) continue
        const newPath = `paneState/${scope}/${field}`
        if (this._getByPath(this.root, newPath) !== undefined) continue
        this._setByPath(this.root, newPath, this._safeParse(raw))
      }
    }
  }

  // ── 双读回退 ──

  private _fallbackRead(path: string): any {
    const paneState = this.root.paneState
    if (!paneState || typeof paneState !== 'object') return undefined

    // paneState/perHost/{host}/{field} → sftp-plus-{field}.{host}
    const perHostMatch = path.match(
      /^paneState\/perHost\/(.+?)\/(pathMode|rememberPath|savedLocalPath|savedRemotePath)$/
    )
    if (perHostMatch) {
      const host = perHostMatch[1]
      const field = perHostMatch[2]
      const oldFieldMap: Record<string, string> = {
        pathMode: 'sftp-plus-path-mode',
        rememberPath: 'sftp-plus-path-mem',
        savedLocalPath: 'sftp-plus-saved-local-path',
        savedRemotePath: 'sftp-plus-saved-remote-path',
      }
      return paneState[`${oldFieldMap[field]}.${host}`]
    }

    // paneState/layout/*
    if (path === 'paneState/layout/mode')
      return paneState['sftp-plus-layout-mode'] ?? paneState['sftp-plus-settings.layoutMode']
    if (path === 'paneState/layout/horizontalSplitRatio')
      return paneState['sftp-plus-horizontal-split-ratio']
    if (path === 'paneState/layout/verticalSplitRatio')
      return paneState['sftp-plus-vertical-split-ratio']

    // paneState/{local|remote}/{sort|cols|colsOrder|colWidths}
    const colMatch = path.match(/^paneState\/(local|remote)\/(sort|cols|colsOrder|colWidths)$/)
    if (colMatch) {
      const scope = colMatch[1]
      const field = colMatch[2]
      // ★ 2026-09-21 P2 修复：旧扁平 key 用的是 kebab-case（sftp-plus-local-cols-order /
      //   -col-widths，见 _migrateColumns），这里直接拼驼峰 field 拼出的是不存在的
      //   sftp-plus-local-colsOrder → 迁移被跳过时列顺序/列宽的双读回退永远拿不到值。
      //   sort/cols 两个名字恰好一致，所以只有这两个字段受影响。
      const legacyField = field === 'colsOrder' ? 'cols-order'
        : field === 'colWidths' ? 'col-widths'
        : field
      const raw = paneState[`sftp-plus-${scope}-${legacyField}`]
      return raw !== undefined ? this._safeParse(raw) : undefined
    }

    return undefined
  }

  // ── 工具 ──

  private _getByPath(obj: any, path: string): any {
    const parts = path.split('/')
    let cur = obj
    for (const part of parts) {
      if (cur == null || typeof cur !== 'object') return undefined
      cur = cur[part]
    }
    return cur
  }

  private _setByPath(obj: any, path: string, value: any): void {
    const parts = path.split('/')
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in cur) || cur[part] == null || typeof cur[part] !== 'object') {
        cur[part] = {}
      }
      cur = cur[part]
    }
    cur[parts[parts.length - 1]] = value
  }

  private _safeParse(raw: any): any {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return raw }
    }
    return raw
  }

  private _toNum(v: any): number {
    if (typeof v === 'number') return v
    const n = parseFloat(String(v))
    return isNaN(n) ? 0.5 : n
  }

  private _getParentObj(obj: any, path: string): Record<string, any> | null {
    const parts = path.split('/')
    if (parts.length <= 1) return obj
    let cur = obj
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur == null || typeof cur !== 'object') return null
      cur = cur[parts[i]]
    }
    return cur
  }
}

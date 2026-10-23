/**
 * 功能描述：SFTP+ selection 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Step-5-Preview
 * 修改时间：2026-10-13 — P1 修复：computeSelection 新增可选 `displayOrder`（显示序 fullPath
 *              序列）。分组模式下鼠标 Shift+点击原先按**扁平排序序**切片（list.slice），
 *              选中的是「排序序上相邻」而非「屏幕上相邻」的一批——实例：视觉区间
 *              {a,b,m,n} 实际选中 {a,z,m}（n 未选中、远处另一组的 z 反被选中），
 *              后续批量操作作用于错误集合。传入 displayOrder 时 Shift 分支改按显示序
 *              取区间再映射回条目；不传（扁平模式）行为与原来完全一致。
 * 合并来源：panel-pane-controller, panel-nav-history
 */

/**
 * 面板选择 / 排序 / 过滤——纯逻辑抽取
 * 功能描述：将 sftp-floating-panel 中 local↔remote 对称方法的重复逻辑
 *          抽取为无状态纯函数，消除 selectLocal/selectRemote 等成对方法的代码重复
 * 创建人：DD1024z + QoderWork
 * 创建时间：2026-07-11
 */

/**
 * 统一的多选 / Ctrl+点击 / Shift+范围选 计算
 * 原 selectLocal 与 selectRemote 结构完全相同，仅字段名不同
 *
 * ★ 2026-10-13 P1 修复：新增可选 `displayOrder`（**显示序**的 fullPath 序列）。
 *   分组模式下 DOM 序 = 分组桶序，而 list 是扁平排序序——Shift 区间若按 list.slice
 *   取，选中的是「排序序上相邻」而非「屏幕上相邻」的一批（实例：视觉区间 {a,b,m,n}
 *   实际选中 {a,z,m}，n 未选中、远处另一组的 z 反被选中）。传入 displayOrder 时
 *   Shift 分支改按显示序取区间，再把 key 映射回 list 中的条目；不传（扁平模式，
 *   显示序 === 排序序）行为与原来完全一致。
 */
export function computeSelection<T extends { fullPath: string }>(
  current: T[],
  entry: T,
  event: MouseEvent,
  idx: number,
  lastIndex: number | null,
  list: readonly T[],
  selectedPaths: Set<string>,
  displayOrder?: readonly string[] | null,
): { selection: T[]; lastIndex: number } {
  if (event.ctrlKey || event.metaKey) {
    const sel = selectedPaths.has(entry.fullPath)
      ? current.filter(e => e.fullPath !== entry.fullPath)
      : [...current, entry]
    return { selection: sel, lastIndex: idx }
  }
  if (event.shiftKey && lastIndex !== null) {
    const set = new Map(current.map(e => [e.fullPath, e]))
    if (displayOrder && displayOrder.length) {
      // 分组模式：按显示序取 [锚点 … 终点] 区间（锚点由 lastIndex 在 list 中解析）
      const anchor = lastIndex >= 0 && lastIndex < list.length ? list[lastIndex] : undefined
      const a = anchor ? displayOrder.indexOf(anchor.fullPath) : -1
      const b = displayOrder.indexOf(entry.fullPath)
      if (a >= 0 && b >= 0) {
        const [f, t] = a < b ? [a, b] : [b, a]
        const byPath = new Map(list.map(e => [e.fullPath, e]))
        for (let i = f; i <= t; i++) {
          const e = byPath.get(displayOrder[i])
          if (e) set.set(e.fullPath, e)
        }
        return { selection: Array.from(set.values()), lastIndex }
      }
      // 锚点或终点不在显示序里（列表刚变化）：退回扁平切片，与原行为一致
    }
    const [f, t] = lastIndex < idx ? [lastIndex, idx] : [idx, lastIndex]
    list.slice(f, t + 1).forEach(e => set.set(e.fullPath, e))
    return { selection: Array.from(set.values()), lastIndex }
  }
  if (selectedPaths.has(entry.fullPath)) {
    return {
      selection: current.length === 1 ? [] : [entry],
      lastIndex: idx,
    }
  }
  return { selection: [entry], lastIndex: idx }
}

/**
 * 统一排序切换：点击同列翻转方向，点击新列默认升序
 * 返回 null 表示应忽略本次排序（如拖拽列宽冷却期内）
 */
export function computeSortToggle(
  currentBy: 'name' | 'size' | 'modified' | 'birthtime',
  currentAsc: boolean,
  newField: 'name' | 'size' | 'modified' | 'birthtime',
  colJustResized: boolean,
): { by: typeof currentBy; asc: boolean } | null {
  if (colJustResized) return null
  return {
    by: newField,
    asc: currentBy === newField ? !currentAsc : true,
  }
}

/**
 * 面板路径导航历史（后退 / 前进）
 */
export class PaneNavHistory {
  private _history: string[] = []
  private _index = -1

  constructor(private readonly max = 50) {}

  get canBack(): boolean { return this._index > 0 }
  get canForward(): boolean { return this._index < this._history.length - 1 }

  push(newPath: string, ignorePush: boolean): void {
    if (ignorePush) return
    if (this._index < this._history.length - 1) {
      this._history = this._history.slice(0, this._index + 1)
    }
    this._history.push(newPath)
    if (this._history.length > this.max) {
      this._history.shift()
    }
    this._index = this._history.length - 1
  }

  back(): string | null {
    if (!this.canBack) return null
    this._index--
    const target = this._history[this._index]
    if (!target || typeof target !== 'string') {
      this._index++
      return null
    }
    return target
  }

  forward(): string | null {
    if (!this.canForward) return null
    this._index++
    const target = this._history[this._index]
    if (!target || typeof target !== 'string') {
      this._index--
      return null
    }
    return target
  }

  clear(): void {
    this._history = []
    this._index = -1
  }
}


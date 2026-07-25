/**
 * 功能描述：SFTP+ selection 逻辑聚合模块（由旧 core 多文件合并）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-16
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-16
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
 */
export function computeSelection<T extends { fullPath: string }>(
  current: T[],
  entry: T,
  event: MouseEvent,
  idx: number,
  lastIndex: number | null,
  list: readonly T[],
  selectedPaths: Set<string>,
): { selection: T[]; lastIndex: number } {
  if (event.ctrlKey || event.metaKey) {
    const sel = selectedPaths.has(entry.fullPath)
      ? current.filter(e => e.fullPath !== entry.fullPath)
      : [...current, entry]
    return { selection: sel, lastIndex: idx }
  }
  if (event.shiftKey && lastIndex !== null) {
    const [f, t] = lastIndex < idx ? [lastIndex, idx] : [idx, lastIndex]
    const set = new Map(current.map(e => [e.fullPath, e]))
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


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
  const additive = event.ctrlKey || event.metaKey
  // ★ 2026-11-15 修复（修改人：DD1024z）——Shift/Ctrl 选中语义三条偏差：
  //   ① Ctrl/⌘+Shift 原被下面的 Ctrl 分支先截走 ⇒ 退化为单项 toggle，区间选不出来。
  //      现由 Shift 分支优先处理，additive 为真时「追加区间」。
  //   ② 纯 Shift 区间原以 current 预填充 ⇒ 区间「叠加」在旧选中上，与资源管理器
  //      「Shift+点击 = 用锚点到点击项的区间**替换**选中」不一致（残留的旧选中项会被
  //      随后的 Delete/上传等批量操作误伤）。现改为纯 Shift 替换、Ctrl+Shift 追加。
  //   ③ lastIndex === null（首次点击 / 刷新·排序·过滤·点分组头后锚点已清空）时原实现
  //      跳过 Shift 分支落到「点击已选中项」判断：只有 1 项被选中时该分支返回 []
  //      ⇒ Shift+点一下就把选中清空（状态栏 0 项，用户以为键卡了）。现按普通单选收口。
  if (event.shiftKey) {
    if (lastIndex === null) return { selection: [entry], lastIndex: idx }
    // ★ 2026-11-15（修改人：DD1024z）加固：锚点下标越界（列表已缩短但锚点未及时失效）
    //   时按「无锚点」处理，避免拿陈旧下标到新列表切片选出一段无关条目。
    if (lastIndex < 0 || lastIndex >= list.length) return { selection: [entry], lastIndex: idx }
    const set = additive ? new Map(current.map(e => [e.fullPath, e])) : new Map<string, T>()
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
  if (additive) {
    // Ctrl/⌘+点击：按选中集做增/删（落点即新的 Shift 锚点）
    const sel = selectedPaths.has(entry.fullPath)
      ? current.filter(e => e.fullPath !== entry.fullPath)
      : [...current, entry]
    return { selection: sel, lastIndex: idx }
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
    // ★ 2026-11-20（Deepseek-V4.1-Flash）：同一目录重复进入不产生新纪录。
    //   否则「后退」会停在原地（路径没变、列表不刷新），而「前进」又亮起来 —— 两个按钮空转。
    //   创建人：DD1024z（Deepseek-V4.1-Flash） 创建时间：2026-11-20
    if (this._index >= 0 && this._history[this._index] === newPath) return
    if (this._index < this._history.length - 1) {
      this._history = this._history.slice(0, this._index + 1)
    }
    this._history.push(newPath)
    if (this._history.length > this.max) {
      this._history.shift()
    }
    this._index = this._history.length - 1
  }

  /**
   * 用 newPath 就地替换栈顶（oldPath 必须仍是栈顶才生效）。
   * 场景：地址栏「父目录 + 末段」两段式导航，末段其实是目录时，
   * 父目录只是中间过渡，不该在后退历史里留下一条。
   * 创建人：DD1024z（Deepseek-V4.1-Flash） 创建时间：2026-11-20
   */
  amendTop(oldPath: string, newPath: string): void {
    if (this._index < 0 || this._index >= this._history.length) return
    if (this._history[this._index] !== oldPath) return
    if (oldPath === newPath) return
    this._history[this._index] = newPath
  }

  /**
   * 历史为空时，把「当前所在目录」补成第 0 条。
   * 场景：重启/恢复上次路径时路径是直接赋值进来的、从没 push 过，
   * 于是「第一次跳转」后栈里只有一条，后退必然不可用（用户实测「单栏点一下面包屑就退不回去」）。
   * 创建人：DD1024z（Deepseek-V4.1-Flash） 创建时间：2026-11-20
   */
  seed(currentPath: string): void {
    if (this._index >= 0) return
    if (!currentPath) return
    this._history = [currentPath]
    this._index = 0
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


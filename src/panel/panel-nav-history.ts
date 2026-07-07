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

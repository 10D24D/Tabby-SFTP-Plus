import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(__dirname, '../src/sftp-floating-panel.component.ts')
const out = path.join(__dirname, '../src/panel/panel-rubber-band.ts')
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/)

const header = `/**
 * 框选（Rubber Band Selection）逻辑
 */
import { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core'
import type { LocalEntry } from './panel-types'
import type { SFTPFile } from '../sftp.service'

export interface RubberBandState {
  active: boolean
  pane: 'local' | 'remote' | ''
  startX: number; startY: number
  currentX: number; currentY: number
  rectLeft: number; rectTop: number; rectWidth: number; rectHeight: number
  startedOnEntry: boolean
}

export interface RubberBandHost {
  zone: NgZone
  cdr: ChangeDetectorRef
  elRef: ElementRef
  selectedLocal: LocalEntry[]
  selectedRemote: SFTPFile[]
  localLastSelectedIndex: number | null
  remoteLastSelectedIndex: number | null
  getFilteredLocalEntries(): LocalEntry[]
  getFilteredRemoteEntries(): SFTPFile[]
  closeContextMenu(): void
  closeBookmarks(): void
  fixContextMenuPosition(x: number, y: number): void
  contextMenuX: number
  contextMenuY: number
  contextMenuPane: 'local' | 'remote'
  contextMenuEntry: LocalEntry | SFTPFile | null
  contextMenuVisible: boolean
  headerMenuVisible: boolean
}

export class PanelRubberBand {
  readonly rubberBand: RubberBandState = {
    active: false,
    pane: '',
    startX: 0, startY: 0,
    currentX: 0, currentY: 0,
    rectLeft: 0, rectTop: 0, rectWidth: 0, rectHeight: 0,
    startedOnEntry: false,
  }

  private _rbLongPressTimer: ReturnType<typeof setTimeout> | null = null
  private _rbLongPress = false
  private _rbStartClientX = 0
  private _rbStartClientY = 0
  private _rbMoveHandler: ((e: MouseEvent) => void) | null = null
  private _rbUpHandler: ((e: MouseEvent) => void) | null = null
  private _rbMoved = false
  private _rbSuppressDrag = false
  private _rbDragCancelled = false
  private _rbIsLeftClick = false
  private _rbSuppressContextMenu = false
  private _rbContextMenuSuppressTimer: ReturnType<typeof setTimeout> | null = null
  private _rbSkipNextContextMenu = false
  private _rbEntryRects: Array<{ top: number; left: number; width: number; height: number }> = []
  private _rbEntryEls: HTMLElement[] = []
  private _rbPaneListEl: HTMLElement | null = null
  private _rbPaneListRect: DOMRect | null = null
  private _rbRectEl: HTMLElement | null = null
  private _rbCtrlHeld = false
  private _rbRightClick = false
  private _rbCachedLocalEntries: LocalEntry[] | null = null
  private _rbCachedRemoteEntries: SFTPFile[] | null = null
  private _rbPathToIndex = new Map<string, number>()
  private _rbInitialSelectedIndices: Set<number> | null = null
  private _rbLiveSelectedIndices = new Set<number>()
  private _rbFrameId: number | null = null

  constructor(private readonly host: RubberBandHost) {}

  get active(): boolean { return this.rubberBand.active }
  get suppressContextMenu(): boolean { return this._rbSuppressContextMenu }
  get skipNextContextMenu(): boolean { return this._rbSkipNextContextMenu }

  consumeMoved(): boolean {
    if (!this._rbMoved) return false
    this._rbMoved = false
    return true
  }

  markDragCancelled(): void { this._rbDragCancelled = true }

  dispose(): void {
    this.cleanup()
    if (this._rbContextMenuSuppressTimer) {
      clearTimeout(this._rbContextMenuSuppressTimer)
      this._rbContextMenuSuppressTimer = null
    }
  }

  cleanup(): void { this._rbCleanup() }

`

// lines 2335-2842 (1-based) => index 2334-2841
let body = lines.slice(2334, 2842).join('\n')
body = body.replace(/^  onPaneListClick/m, '  onPaneListClick')
// Replace host-bound refs
const hostProps = [
  'selectedLocal', 'selectedRemote', 'localLastSelectedIndex', 'remoteLastSelectedIndex',
  'zone', 'cdr', 'elRef', 'closeContextMenu', 'closeBookmarks', 'fixContextMenuPosition',
  'contextMenuX', 'contextMenuY', 'contextMenuPane', 'contextMenuEntry', 'contextMenuVisible',
  'headerMenuVisible', 'getFilteredLocalEntries', 'getFilteredRemoteEntries',
]
for (const p of hostProps) {
  body = body.replace(new RegExp(`this\\.${p}\\b`, 'g'), `this.host.${p}`)
}
body = body.replace(/this\.rubberBand/g, 'this.rubberBand')

fs.writeFileSync(out, header + body + '\n}\n')
console.log('Wrote', out, 'lines:', (header + body).split('\n').length)

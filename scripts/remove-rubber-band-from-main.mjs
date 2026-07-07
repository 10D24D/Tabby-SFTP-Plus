import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '../src/sftp-floating-panel.component.ts')
let text = fs.readFileSync(file, 'utf8')

const startMarker = '  // ========== 框选（Rubber Band Selection）=========='
const endMarker = '  // ========== 窄屏上下布局分割线 =========='
const start = text.indexOf(startMarker)
const end = text.indexOf(endMarker)
if (start < 0 || end < 0) {
  console.error('markers not found', start, end)
  process.exit(1)
}

const replacement = `  // ========== 框选（委托 panel/panel-rubber-band） ==========
  onPaneListClick(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._rubberBand.onPaneListClick(event, pane)
  }

  onPaneMouseDown(event: MouseEvent, pane: 'local' | 'remote'): void {
    this._rubberBand.onPaneMouseDown(event, pane)
  }

`
text = text.slice(0, start) + replacement + text.slice(end)
fs.writeFileSync(file, text)
console.log('removed rubber band block')

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcPath = path.join(__dirname, '../src/sftp-floating-panel.component.ts')
const outPath = path.join(__dirname, '../src/panel/panel-main-styles.ts')
const s = fs.readFileSync(srcPath, 'utf8')
const start = s.indexOf('styles: [`')
if (start < 0) throw new Error('styles block not found')
const cssStart = start + 'styles: [`'.length
const end = s.indexOf('`],', cssStart)
if (end < 0) throw new Error('styles block end not found')
const css = s.slice(cssStart, end)
fs.writeFileSync(outPath, `/** SFTP+ 主面板样式（从 sftp-floating-panel 抽离） */\nexport const SFTP_PANEL_STYLES = \`${css}\`\n`)
console.log('wrote', outPath, 'chars', css.length)

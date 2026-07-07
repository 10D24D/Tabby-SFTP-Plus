import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcPath = path.join(__dirname, '../src/sftp-floating-panel.component.ts')
let s = fs.readFileSync(srcPath, 'utf8')

if (!s.includes("from './panel/panel-main-styles'")) {
  s = s.replace(
    "} from './panel/panel-format'\n",
    "} from './panel/panel-format'\nimport { SFTP_PANEL_STYLES } from './panel/panel-main-styles'\n",
  )
}

const start = s.indexOf('styles: [`')
const end = s.indexOf('`],', start)
if (start < 0 || end < 0) throw new Error('styles block not found')
s = s.slice(0, start) + 'styles: [SFTP_PANEL_STYLES],' + s.slice(end + 4)
fs.writeFileSync(srcPath, s)
console.log('updated main component styles import')

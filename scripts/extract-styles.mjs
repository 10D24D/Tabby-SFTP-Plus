import fs from 'fs'
import path from 'path'

const stylesPath = path.resolve('src/sftp/components/styles.ts')
const outputPath = path.resolve('src/sftp/sftp-floating-panel.component.scss')

const content = fs.readFileSync(stylesPath, 'utf8')
const lines = content.split(/\r?\n/)

let start = 0
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('export const SFTP_PANEL_STYLES = `')) {
    start = i + 1
    break
  }
}

const cssLines = []
for (let i = start; i < lines.length; i++) {
  const line = lines[i]
  if (line === '`') break
  cssLines.push(line)
}

fs.writeFileSync(outputPath, cssLines.join('\n'), 'utf8')
console.log(`Written ${cssLines.length} lines to ${outputPath}`)

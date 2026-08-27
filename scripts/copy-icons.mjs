/**
 * 构建期复制内置 SVG 图标到 dist
 * 功能描述：将 src/assets/icons/*.svg 复制到 dist/assets/icons/，
 *          使插件在「用户未指定 iconResourceDir」时也能引用内置图标目录，
 *          且打包发布（npm publish 仅含 dist/）后图标依然可用。
 *          - 幂等：目标已存在则覆盖；无源目录则静默跳过
 *          - 零新依赖，纯 node fs
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-24
 */
import { mkdirSync, readdirSync, copyFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'src', 'assets', 'icons')
const dest = join(root, 'dist', 'assets', 'icons')

if (!existsSync(src)) {
  console.log('[copy-icons] 源目录不存在，跳过：', src)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
let count = 0
for (const f of readdirSync(src)) {
  if (f.toLowerCase().endsWith('.svg')) {
    copyFileSync(join(src, f), join(dest, f))
    count++
    console.log('[copy-icons]', f)
  }
}
console.log(`[copy-icons] 已复制 ${count} 个图标到 dist/assets/icons/`)

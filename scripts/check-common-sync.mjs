/**
 * 检查各插件是否仍指向仓库根 tabby-plugin-common，并检测嵌套副本漂移。
 * 功能描述：monorepo 级一致性检查（根 tabby-plugin-common 为唯一真源，
 *           各插件不应保留嵌套 tabby-plugin-common/src 副本，webpack/tsconfig 的
 *           @common alias 必须指向 ../tabby-plugin-common/src）。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-25
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25
 *   v2.0.0 发布修复：由 monorepo 根 scripts/ 收敛进本仓库 scripts/。
 *   增加环境自适应——当不在 monorepo 根（如 CI 仅 checkout 单插件仓库、
 *   `../` 内无 tabby-plugin-common / 兄弟插件）时自动跳过，避免误伤 CI 构建。
 *
 * 用法（monorepo 根）：node scripts/check-common-sync.mjs
 * 用法（单插件仓库，CI）：npm run check-common —— 检测不到 monorepo 则跳过
 * exit 0 = OK / 跳过；exit 1 = 在 monorepo 环境下发现漂移
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 脚本位于 <plugin>/scripts/，故 __dirname 的父目录即插件根，再上一级为 monorepo 根
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const ROOT = path.resolve(__dirname, '..', '..')
const CANON = path.join(ROOT, 'tabby-plugin-common', 'src')
const PLUGINS = ['tabby-FTPS+', 'tabby-QuickCmd+']

// 环境自适应：仅当检测到 monorepo 结构时才执行检查，否则跳过
const inMonorepo =
  fs.existsSync(CANON) &&
  PLUGINS.some((p) => fs.existsSync(path.join(ROOT, p)))

if (!inMonorepo) {
  console.log('[check-common-sync] skip — not in monorepo context (CI / standalone checkout), nothing to verify')
  process.exit(0)
}

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')
}

let failed = false

for (const name of ['utils.ts', 'theme.ts', 'index.ts']) {
  const p = path.join(CANON, name)
  if (!fs.existsSync(p)) {
    console.error('[FAIL] missing canonical', p)
    failed = true
  }
}

for (const plugin of PLUGINS) {
  const nested = path.join(ROOT, plugin, 'tabby-plugin-common')
  if (fs.existsSync(nested)) {
    // 允许仅留 README；若仍有 src/ 则视为错误副本
    const nestedSrc = path.join(nested, 'src')
    if (fs.existsSync(nestedSrc)) {
      console.error(`[FAIL] ${plugin}/tabby-plugin-common/src still exists — delete nested copy, use root`)
      failed = true
      // 若仍存在，对比漂移便于定位
      for (const name of ['utils.ts', 'theme.ts']) {
        const a = path.join(CANON, name)
        const b = path.join(nestedSrc, name)
        if (fs.existsSync(a) && fs.existsSync(b) && md5(a) !== md5(b)) {
          console.error(`  drift: ${name}`)
        }
      }
    }
  }

  const webpack = path.join(ROOT, plugin, 'webpack.config.js')
  const tsconfig = path.join(ROOT, plugin, 'tsconfig.json')
  if (fs.existsSync(webpack)) {
    const w = fs.readFileSync(webpack, 'utf8')
    if (!w.includes('../tabby-plugin-common/src')) {
      console.error(`[FAIL] ${plugin}/webpack.config.js @common alias must point to ../tabby-plugin-common/src`)
      failed = true
    }
  }
  if (fs.existsSync(tsconfig)) {
    const t = fs.readFileSync(tsconfig, 'utf8')
    if (!t.includes('../tabby-plugin-common/src')) {
      console.error(`[FAIL] ${plugin}/tsconfig.json paths.@common must point to ../tabby-plugin-common/src`)
      failed = true
    }
  }
}

if (failed) {
  console.error('check-common-sync: FAILED')
  process.exit(1)
}
console.log('check-common-sync: OK (canonical root tabby-plugin-common)')

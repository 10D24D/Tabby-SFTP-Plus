/**
 * 功能描述：tabby-plugin-common 副本同步与校验（prebuild 钩子）。
 *   策略（v2.0.1 修正）：插件仓库内保留一份已提交的 tabby-plugin-common/src 副本，
 *   webpack/tsconfig 的 @common alias 指向仓库内副本 → 仓库自包含，CI 可独立构建。
 *   - monorepo 环境（../tabby-plugin-common/src 存在）：以根为唯一真源，
 *     自动把根 src 同步覆盖到本插件副本（开发时只需改根，构建即同步）。
 *   - CI / 单仓库环境（根不存在）：仅校验仓库内副本文件齐全，缺失则失败。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-25
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-07-25
 *   v2.0.0 CI 构建失败根因修复：@common 由指向仓库外根目录改为指向仓库内副本，
 *   本脚本语义由「禁止嵌套副本」反转为「自动同步嵌套副本」。
 *
 * 用法：npm run check-common（prebuild 自动执行）
 * exit 0 = 同步完成 / 校验通过；exit 1 = CI 环境下副本缺失
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 脚本位于 <plugin>/scripts/，父目录即插件根，再上一级为 monorepo 根
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const CANON = path.resolve(PLUGIN_ROOT, '..', 'tabby-plugin-common', 'src')
const LOCAL = path.join(PLUGIN_ROOT, 'tabby-plugin-common', 'src')
const FILES = ['index.ts', 'theme.ts', 'utils.ts']

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex')
}

if (fs.existsSync(CANON)) {
  // monorepo 环境：根 → 插件内副本 自动同步
  fs.mkdirSync(LOCAL, { recursive: true })
  let synced = 0
  for (const name of FILES) {
    const src = path.join(CANON, name)
    const dst = path.join(LOCAL, name)
    if (!fs.existsSync(src)) {
      console.error(`[check-common-sync] WARN canonical missing: ${src}`)
      continue
    }
    if (!fs.existsSync(dst) || md5(src) !== md5(dst)) {
      fs.copyFileSync(src, dst)
      console.log(`[check-common-sync] synced ${name} (root -> plugin copy)`)
      synced++
    }
  }
  console.log(`check-common-sync: OK (monorepo mode, ${synced} file(s) synced)`)
  process.exit(0)
}

// CI / 单仓库环境：校验仓库内副本齐全
let failed = false
for (const name of FILES) {
  const p = path.join(LOCAL, name)
  if (!fs.existsSync(p)) {
    console.error(`[FAIL] missing bundled copy: ${p} — commit tabby-plugin-common/src into this repo`)
    failed = true
  }
}
if (failed) {
  console.error('check-common-sync: FAILED (standalone mode, bundled copy incomplete)')
  process.exit(1)
}
console.log('check-common-sync: OK (standalone/CI mode, bundled copy verified)')

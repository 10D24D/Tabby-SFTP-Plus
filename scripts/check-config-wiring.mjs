#!/usr/bin/env node
/**
 * 配置项接线体检
 *   1) interface 有、defaults 缺 → ⛔ 致命：ConfigProxy 不会为它建 accessor，赋值落到实例上，save() 不落盘（重启即丢）
 *   2) defaults 有、设置页未写 → 仅默认值/面板写入
 *   3) 设置页写了、未回读 → 重启后设置页显示默认值（假丢）
 *   4) 未进导出快照 → 备份/迁移会丢
 *
 * 用法：node scripts/check-config-wiring.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-20
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const root = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const provider = read('src/tabby/config-provider.ts')
const settings = read('src/settings/sftp-settings.component.ts')

// ── 1. interface 键 ────────────────────────────────────
function parseInterfaceKeys(src) {
  const start = src.indexOf('interface SftpPlusPluginConfig')
  if (start < 0) throw new Error('找不到 SftpPlusPluginConfig 接口')
  const open = src.indexOf('{', start)
  let depth = 0
  let end = -1
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  const body = src.slice(open + 1, end)
  const keys = new Set()
  for (const line of body.split('\n')) {
    const m = /^\s{2}([A-Za-z_$][\w$]*)\??\s*:/.exec(line)
    if (m) keys.add(m[1])
  }
  return keys
}

// ── 2. defaults 键 ─────────────────────────────────────
function parseDefaultsKeys(src) {
  const start = src.indexOf('export function defaultSftpPlusConfig')
  if (start < 0) throw new Error('找不到 defaultSftpPlusConfig')
  const open = src.indexOf('{', start)
  let depth = 0
  let end = -1
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  const body = src.slice(open + 1, end)
  const keys = new Set()
  for (const line of body.split('\n')) {
    const m = /^\s{4}([A-Za-z_$][\w$]*)\s*:/.exec(line)
    if (m) keys.add(m[1])
  }
  return keys
}

const ifaceKeys = parseInterfaceKeys(provider)
const defaultKeys = parseDefaultsKeys(provider)

// ── 3. 设置页接线（按属性名出现形式判断）──────────────
const has = (re) => new RegExp(re).test(settings)
/** 读配置：兼容 cfg.x / cfg?.x / cfg['x'] / (cfg as any).x */
const cfgRead = (k) =>
  has(`cfg\\??\\.${k}\\b`) ||
  has(`cfg\\??\\.?\\[['"]${k}['"]\\]`) ||
  has(`\\(cfg as any\\)\\.${k}\\b`) ||
  has(`\\(cfg as any\\)\\[['"]${k}['"]\\]`)
const wired = (k) => {
  // 顶栏三项：设置页用常量下标写入/读取（(target as any)[TOP_BAR_CFG_FIELDS.order]），
  // 正则抓不到 —— 直接按常量值视为已接线，避免每轮都报假阳性。
  if (constCovered.has(k)) {
    return { load: true, save: true, exportCfg: true, exportLs: true, importBack: true }
  }
  return {
    load: cfgRead(k),
    save: has(`target\\.${k}\\s*=`),
    exportCfg: has(`data\\.${k}\\s*=\\s*cfg\\.${k}`),
    exportLs: has(`data\\.${k}\\s*=\\s*load\\(`),
    importBack: has(`data\\.${k}\\s*!==\\s*undefined`),
  }
}

// ★ 2026-10-20：新增「代码在用、但 defaults 里没有」的检查 ——
//   ConfigProxy 的 accessor 只按 defaults（合并后的默认值对象）建立，defaults 缺少的键
//   即便 interface 里也没写（TS 因 target 是 any 不报错），赋值也只会落在 proxy 实例上，
//   save() 时序列化不到 ⇒ 重启即丢。panelOpacity 就是这么丢的。
const usedKeys = new Set()
{
  const sources = [
    settings,
    read('src/sftp/sftp-floating-panel.component.ts'),
  ]
  for (const src of sources) {
    for (const m of src.matchAll(/target\.([A-Za-z_$][\w$]*)\s*=/g)) usedKeys.add(m[1])
    for (const m of src.matchAll(/cfg\??\.([A-Za-z_$][\w$]*)\b/g)) usedKeys.add(m[1])
    // `(cfg as any).xxx` 与 `(cfg as any)['xxx']` 两种绕过类型的写法
    for (const m of src.matchAll(/\(cfg as any\)\.([A-Za-z_$][\w$]*)/g)) usedKeys.add(m[1])
    for (const m of src.matchAll(/\(cfg as any\)\[['"]([\w]+)['"]\]/g)) usedKeys.add(m[1])
    for (const m of src.matchAll(/data\.([A-Za-z_$][\w$]*)\s*=/g)) usedKeys.add(m[1])
    for (const m of src.matchAll(/sftpConfig\??\.set\('([\w/]+)'/g)) usedKeys.add(m[1].split('/')[0])
  }
  // 这些是运行时对象/非配置字段，排除
  for (const k of ['value', 'name', 'length', 'textContent', 'style', 'checked']) usedKeys.delete(k)
}

// 顶栏定制三项的键名来自常量表（写入/导出都用常量下标），先把常量值解析出来
const constCovered = new Set(
  [...read('src/sftp/core/top-bar-items.ts').matchAll(/:\s*'(topBar\w+)'/g)].map((m) => m[1]),
)

// 导出快照里出现的键（按 EXPORT_CATEGORY_FIELDS 判断所属分类的字段名）
const exportCats = new Set()
{
  const re = /^ {2}(\w+):\s*\[([\s\S]*?)\],/gm
  let m
  while ((m = re.exec(settings))) {
    for (const f of m[2].matchAll(/'([\w.]+)'/g)) exportCats.add(f[1])
  }
}

// 面板读写的键（面板侧自主维护的不用管）
const panelOnly = new Set([
  'paneState', 'pathMemory', 'transferLogs', 'panelGeometry', 'hotkeys',
])

// 仅用于「旧配置兼容读取」的键：不要求设置页写入/导出，但**必须在 defaults 里**（否则读不到旧值）
const compatOnly = new Set([
  'allowViewAllFiles', 'allowEditAllFiles', 'allowViewAllAsText',
  'paneHeaderOrder', 'paneToolbarOrder', 'transferTarAcceleration',
  // 2026-10-20：配置里预留但当前无 UI 写入、面板也不读的两个主题色（历史遗留）
  'colorSurface', 'colorMuted',
])

const fatal = []       // interface 有 / defaults 缺
const orphan = []      // 代码在用 / defaults 缺（最隐蔽：TS 也不报错）
const noSave = []      // defaults 有 / 设置页从不写
const writeOnly = []   // 写了但不回读
const notExported = [] // 未进导出快照

for (const k of ifaceKeys) {
  if (!defaultKeys.has(k)) fatal.push(k)
}

// 代码里写入/读取、但 defaults 没登记的键 → 同上后果，且 TS 抓不到
for (const k of usedKeys) {
  if (panelOnly.has(k)) continue
  if (!defaultKeys.has(k)) orphan.push(k)
}

for (const k of defaultKeys) {
  if (panelOnly.has(k) || compatOnly.has(k)) continue
  const w = wired(k)
  if (!w.save && !/^(paneState|panelGeometry)$/.test(k)) noSave.push({ k, w })
  if (w.save && !w.load) writeOnly.push({ k, w })
  if (!exportCats.has(k) && !w.exportCfg && !panelOnly.has(k)) notExported.push(k)
}

const pad = (s, n) => String(s).padEnd(n)
console.log('══ 配置接线体检 ══')
console.log(`interface 键: ${ifaceKeys.size}  /  defaults 键: ${defaultKeys.size}`)
console.log('')

if (fatal.length) {
  console.log('⛔ 致命 · interface 已声明但 defaults 缺失（写入不落盘，重启即丢）：')
  for (const k of fatal) console.log('   · ' + k)
} else {
  console.log('✅ interface 与 defaults 键集合一致')
}
console.log('')

if (orphan.length) {
  console.log('⛔ 致命 · 代码在用但 defaults 未登记（ConfigProxy 不建 accessor，save() 序列化不到 ⇒ 重启即丢）：')
  for (const k of orphan) console.log('   · ' + k)
  console.log('')
}

if (noSave.length) {
  console.log('⚠️  设置页从不写入（只能取默认值，需确认是否由面板/其他入口维护）：')
  for (const { k } of noSave) console.log('   · ' + k)
  console.log('')
}

if (writeOnly.length) {
  console.log('⚠️  设置页写了但不回读（重启后界面显示默认值，表现为「保存失败」）：')
  for (const { k } of writeOnly) console.log('   · ' + k)
  console.log('')
}

if (notExported.length) {
  console.log('⚠️  未纳入导出快照（备份/迁移会丢）：')
  for (const k of notExported) console.log('   · ' + k)
  console.log('')
}

const problems = fatal.length + writeOnly.length + notExported.length
console.log(problems === 0 ? '✅ 无阻塞问题' : `❗ 共 ${fatal.length} 个致命 + ${writeOnly.length} 个只写不读 + ${notExported.length} 个未导出`)
process.exitCode = fatal.length > 0 ? 1 : 0

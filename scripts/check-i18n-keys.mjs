/**
 * 功能描述：校验源码中引用的 i18n key 都存在于基准语言包（prebuild 钩子）。
 *   背景：SftpI18nService.t() 在 key 缺失时返回 key 本身（而非空串），因此
 *   代码里常见的 `t('x.y') || '兜底文案'` 写法**永远走不到兜底**——用户会直接
 *   看到裸 key 字符串。这类问题编译期无感知、运行期只在特定分支才暴露，
 *   故在 prebuild 阶段静态拦截。
 *   基准语言取 zh-CN + en-US：t() 对其它语言缺失项会回退 en-US，
 *   只要这两份齐全就不会出现裸 key。
 * @创建人：DD1024z + Claude Opus 5
 * @创建时间：2026-09-21
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-30
 *
 * 用法：npm run check-i18n（prebuild 自动执行）
 * exit 0 = 校验通过；exit 1 = 存在缺失 key / 结构错误
 *
 * 2026-10-30（SF-32）补强：
 *   ① 从「只查 2 种语言」扩到**全部 locale**：其它语言缺失时 t() 回退 en-US 不会崩，
 *      但用户切到该语言会看到英文混排，属于静默劣化，构建期就该拦。
 *   ② 新增 .po **结构校验**（重复 msgid / msgid 与 msgstr 数量不等）：
 *      解析器是覆盖式 `translations[key] = value`，重复 key 的生效值取决于块顺序，
 *      且 msgmerge/msgfmt 会直接报错；此前这类问题只能靠人工翻 .po 发现。
 *   ③ 空 msgstr 只告警不阻塞（个别条目可能刻意保留原文）。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(PLUGIN_ROOT, 'src')
const LOCALE_DIR = path.join(PLUGIN_ROOT, 'locale')
const BASE_LOCALES = ['zh-CN', 'en-US']

/** 只匹配字面量 key；t('transfer.' + op) 这类动态拼接无法静态求值，跳过 */
const T_CALL = /\.t\(\s*'([a-zA-Z0-9_.]+)'/g

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|html)$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * 解析一个 .po：返回 msgid 集合 + 结构问题。
 * 只做本仓库实际用到的简单格式（单行 msgid/msgstr，无复数形式）。
 */
function parsePo(file) {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const ids = new Set()
  const dup = []
  let msgidCount = 0
  let msgstrCount = 0
  let emptyStr = 0
  let lastMsgidEmpty = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const idm = /^msgid "(.*)"$/.exec(line)
    if (idm) {
      msgidCount++
      const id = idm[1]
      lastMsgidEmpty = id === ''
      if (id !== '') {
        if (ids.has(id)) dup.push(id)
        else ids.add(id)
      }
      continue
    }
    if (/^msgstr /.test(line)) {
      msgstrCount++
      // 头部块（msgid ""）的 msgstr 本来就是空的，不算「未翻译」
      if (/^msgstr ""$/.test(line) && !lastMsgidEmpty) emptyStr++
    }
  }
  return { ids, dup, msgidCount, msgstrCount, emptyStr }
}

const used = new Map()
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8')
  for (const m of text.matchAll(T_CALL)) {
    const key = m[1]
    // 动态拼接的前缀（如 'transfer.'）以点结尾，不是完整 key
    if (key.endsWith('.')) continue
    if (!used.has(key)) used.set(key, path.relative(PLUGIN_ROOT, file))
  }
}

const poFiles = fs.readdirSync(LOCALE_DIR).filter((f) => f.endsWith('.po')).sort()
const parsed = new Map()
for (const f of poFiles) {
  parsed.set(f.replace(/\.po$/, ''), parsePo(path.join(LOCALE_DIR, f)))
}

let failed = false

// ── 1. 基准语言：代码引用的 key 必须存在 ─────────────────
for (const locale of BASE_LOCALES) {
  const p = parsed.get(locale)
  if (!p) {
    failed = true
    console.error(`[FAIL] locale/${locale}.po missing`)
    continue
  }
  const missing = [...used.keys()].filter(k => !p.ids.has(k)).sort()
  if (missing.length) {
    failed = true
    console.error(`[FAIL] ${locale}.po missing ${missing.length} key(s) used in source:`)
    for (const k of missing) console.error(`  ${k}   <= ${used.get(k)}`)
  }
}

// ── 2. 全部语言：覆盖 en-US、无重复、结构配平 ────────────
const baseIds = parsed.get('en-US')?.ids ?? new Set()
for (const [locale, p] of parsed) {
  if (p.dup.length) {
    failed = true
    console.error(`[FAIL] ${locale}.po has duplicate msgid(s):`)
    for (const id of [...new Set(p.dup)]) console.error(`  ${id}`)
  }
  if (p.msgidCount !== p.msgstrCount) {
    failed = true
    console.error(`[FAIL] ${locale}.po msgid/msgstr count mismatch: ${p.msgidCount} vs ${p.msgstrCount} (解析会错位)`)
  }
  if (locale !== 'en-US') {
    const missing = [...baseIds].filter(k => !p.ids.has(k)).sort()
    if (missing.length) {
      failed = true
      console.error(`[FAIL] ${locale}.po missing ${missing.length} key(s) present in en-US:`)
      for (const k of missing.slice(0, 20)) console.error(`  ${k}`)
      if (missing.length > 20) console.error(`  ... 共 ${missing.length} 条`)
    }
    if (p.emptyStr > 0) {
      console.warn(`[WARN] ${locale}.po has ${p.emptyStr} empty msgstr (will fall back to en-US)`)
    }
  }
}

if (failed) {
  console.error('check-i18n-keys: FAILED — 修正上面的 msgid/msgstr/结构问题，否则用户会看到裸 key 或错位译文')
  process.exit(1)
}
console.log(`check-i18n-keys: OK (${used.size} literal keys verified; ${parsed.size} locales structurally valid)`)

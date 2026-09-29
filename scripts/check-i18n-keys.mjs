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
 *
 * 用法：npm run check-i18n（prebuild 自动执行）
 * exit 0 = 校验通过；exit 1 = 存在缺失 key
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(__dirname, '..')
const SRC = path.join(PLUGIN_ROOT, 'src')
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

function loadMsgids(locale) {
  const file = path.join(PLUGIN_ROOT, 'locale', `${locale}.po`)
  const ids = new Set()
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^msgid "(.+)"$/.exec(line)
    if (m) ids.add(m[1])
  }
  return ids
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

let failed = false
for (const locale of BASE_LOCALES) {
  const ids = loadMsgids(locale)
  const missing = [...used.keys()].filter(k => !ids.has(k)).sort()
  if (missing.length) {
    failed = true
    console.error(`[FAIL] ${locale}.po missing ${missing.length} key(s) used in source:`)
    for (const k of missing) console.error(`  ${k}   <= ${used.get(k)}`)
  }
}

if (failed) {
  console.error('check-i18n-keys: FAILED — add the msgid/msgstr pairs above, otherwise users see raw keys')
  process.exit(1)
}
console.log(`check-i18n-keys: OK (${used.size} literal keys verified against ${BASE_LOCALES.join(', ')})`)

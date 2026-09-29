/**
 * 为 24 个 locale/*.po 追加「意见反馈拆分为报告问题 / 提出需求」两个按钮文案 i18n（幂等，可重复执行）：
 *   新增 2 个 key：settings.reportBug / settings.featureRequest
 * 用途：SFTP+ 设置「关于」区将单一「意见反馈」拆分为「报告问题」「提出需求」两个入口，需各自文案。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-09-24
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

/** 新增 key 的 24 语言译文（未列出的语言回退 en-US） */
const NEW_KEYS = {
  'settings.reportBug': {
    'zh-CN': '报告问题', 'zh-TW': '報告問題',
    'en-US': 'Report a Bug', 'en-GB': 'Report a Bug',
  },
  'settings.featureRequest': {
    'zh-CN': '提出需求', 'zh-TW': '提出需求',
    'en-US': 'Feature Request', 'en-GB': 'Feature Request',
  },
}

function poEscape(s) {
  // 用 \u0000 作占位符保护字面 \n（.po 的换行转义序列），避免被下面的反斜杠转义破坏；最后还原
  return String(s)
    .replace(/\r/g, '')
    .replace(/\\n/g, '\u0000')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\u0000/g, '\\n')
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasKey(txt, key) {
  return new RegExp(`^msgid\\s+"${escRe(key)}"\\s*$`, 'm').test(txt)
}

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let added = 0

for (const file of files) {
  const lang = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')

  const blocks = []
  for (const [key, perLang] of Object.entries(NEW_KEYS)) {
    const val = perLang[lang] ?? perLang['en-US']
    if (!val || hasKey(txt, key)) continue
    blocks.push(`\nmsgid "${key}"\nmsgstr "${poEscape(val)}"\n`)
  }
  if (blocks.length) {
    if (!txt.endsWith('\n')) txt += '\n'
    txt += blocks.join('')
    added += blocks.length
  }

  fs.writeFileSync(full, txt, 'utf8')
}

console.log(`[i18n] 追加新 key ${added} 条，处理 ${files.length} 个语言文件`)

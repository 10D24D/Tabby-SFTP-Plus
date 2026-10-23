#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 2026-10-19 全量审计 P2-19 / P2-20 / P2-21 所需 key
 *   conflict.digestUnavailableRemote  冲突框：远程侧内容摘要不可用时「—」的 tooltip
 *   conflict.digestUnavailableLocal   冲突框：本地侧内容摘要不可用时「—」的 tooltip
 *   transfer.skippedAsDuplicateHint   传输中「已跳过」标签的 tooltip（原为硬编码英文）
 *   app.invalidNameChars              新建/重命名输入框：含路径分隔符或控制字符时的即时提示
 * 用法：node scripts/add-dialog-p2-i18n.mjs
 * 说明：已存在的 key 会被跳过（幂等）；条目追加到文件末尾。
 *   英文按 en-US 文案，zh-CN / zh-TW 给中文，其余语言先填英文原文（项目既有做法）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Step-5-Preview
 * @创建时间：2026-10-19
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — 面向 audit「对话框/查看器细节」：清掉硬编码文案所需的 i18n key。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'conflict.digestUnavailableRemote',
  'conflict.digestUnavailableLocal',
  'transfer.skippedAsDuplicateHint',
  'app.invalidNameChars',
]

const T = {
  'conflict.digestUnavailableRemote': {
    'en-GB': 'Digest unavailable (sizes differ, or the remote server does not support it)',
    'en-US': 'Digest unavailable (sizes differ, or the remote server does not support it)',
    'zh-CN': '摘要不可用（文件大小不同，或远程服务器不支持）',
    'zh-TW': '摘要不可用（檔案大小不同，或遠端伺服器不支援）',
  },
  'conflict.digestUnavailableLocal': {
    'en-GB': 'Digest unavailable (sizes differ, or the local file could not be read)',
    'en-US': 'Digest unavailable (sizes differ, or the local file could not be read)',
    'zh-CN': '摘要不可用（文件大小不同，或本地文件读取失败）',
    'zh-TW': '摘要不可用（檔案大小不同，或本機檔案讀取失敗）',
  },
  'transfer.skippedAsDuplicateHint': {
    'en-GB': 'Content is identical on both sides, so the transfer was not executed',
    'en-US': 'Content is identical on both sides, so the transfer was not executed',
    'zh-CN': '两侧内容完全相同，本次未实际传输',
    'zh-TW': '兩側內容完全相同，本次未實際傳輸',
  },
  'app.invalidNameChars': {
    'en-GB': 'The name cannot contain a path separator (slash or backslash) or control characters',
    'en-US': 'The name cannot contain a path separator (slash or backslash) or control characters',
    'zh-CN': '名称不能包含路径分隔符（正斜杠或反斜杠）或控制字符',
    'zh-TW': '名稱不能包含路徑分隔符（正斜線或反斜線）或控制字元',
  },
}

/** 未单独提供译文的语言：先填英文原文（项目既有做法），后续由翻译补齐 */
const EN_FALLBACK = {}
for (const key of KEYS) EN_FALLBACK[key] = T[key]['en-US']

const LOCALES = [
  'af-ZA', 'bg-BG', 'cs-CZ', 'da-DK', 'de-DE', 'en-GB', 'en-US', 'es-ES', 'fr-FR',
  'hr-HR', 'id-ID', 'it-IT', 'ja-JP', 'ko-KR', 'pl-PL', 'pt-BR', 'pt-PT', 'ru-RU',
  'sr-Latn', 'sv-SE', 'tr-TR', 'uk-UA', 'zh-CN', 'zh-TW',
]

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  if (!LOCALES.includes(locale)) { console.warn('skip unknown locale file:', file); continue }
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  let added = 0
  for (const key of KEYS) {
    const text = T[key][locale] ?? EN_FALLBACK[key]
    if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue  // 已存在则跳过（幂等）
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)

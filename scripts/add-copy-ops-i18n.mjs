#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 issue #27 收尾相关 key
 *   transfer.remote-copy  服务器互传（远程↔远程）
 *   transfer.local-copy   本地复制（本地↔本地）
 * 用法：node scripts/add-copy-ops-i18n.mjs
 * 说明：已存在的 key 会被跳过（幂等）；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-10-18
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'transfer.remote-copy',
  'transfer.local-copy',
  'notify.remoteToRemoteFailed',
]

// 仅 zh-CN/zh-TW 给中文，其余统一英文（运行时按 locale 取，英文串作兜底；同时保证 i18n gap 基线不变）
const T = {
  'transfer.remote-copy': {
    'en-US': 'Server↔Server', 'en-GB': 'Server↔Server',
    'zh-CN': '服务器互传', 'zh-TW': '遠端互傳',
    'af-ZA': 'Server↔Server', 'bg-BG': 'Server↔Server', 'cs-CZ': 'Server↔Server',
    'da-DK': 'Server↔Server', 'de-DE': 'Server↔Server', 'es-ES': 'Server↔Server',
    'fr-FR': 'Server↔Server', 'hr-HR': 'Server↔Server', 'id-ID': 'Server↔Server',
    'it-IT': 'Server↔Server', 'ja-JP': 'Server↔Server', 'ko-KR': 'Server↔Server',
    'pl-PL': 'Server↔Server', 'pt-BR': 'Server↔Server', 'pt-PT': 'Server↔Server',
    'ru-RU': 'Server↔Server', 'sr-Latn': 'Server↔Server', 'sv-SE': 'Server↔Server',
    'tr-TR': 'Server↔Server', 'uk-UA': 'Server↔Server',
  },
  'transfer.local-copy': {
    'en-US': 'Local copy', 'en-GB': 'Local copy',
    'zh-CN': '本地复制', 'zh-TW': '本地複製',
    'af-ZA': 'Local copy', 'bg-BG': 'Local copy', 'cs-CZ': 'Local copy',
    'da-DK': 'Local copy', 'de-DE': 'Local copy', 'es-ES': 'Local copy',
    'fr-FR': 'Local copy', 'hr-HR': 'Local copy', 'id-ID': 'Local copy',
    'it-IT': 'Local copy', 'ja-JP': 'Local copy', 'ko-KR': 'Local copy',
    'pl-PL': 'Local copy', 'pt-BR': 'Local copy', 'pt-PT': 'Local copy',
    'ru-RU': 'Local copy', 'sr-Latn': 'Local copy', 'sv-SE': 'Local copy',
    'tr-TR': 'Local copy', 'uk-UA': 'Local copy',
  },
  'notify.remoteToRemoteFailed': {
    'en-US': 'Remote-to-remote transfer failed', 'en-GB': 'Remote-to-remote transfer failed',
    'zh-CN': '远程↔远程传输失败', 'zh-TW': '遠端↔遠端傳輸失敗',
    'af-ZA': 'Remote-to-remote transfer failed', 'bg-BG': 'Remote-to-remote transfer failed', 'cs-CZ': 'Remote-to-remote transfer failed',
    'da-DK': 'Remote-to-remote transfer failed', 'de-DE': 'Remote-to-remote transfer failed', 'es-ES': 'Remote-to-remote transfer failed',
    'fr-FR': 'Remote-to-remote transfer failed', 'hr-HR': 'Remote-to-remote transfer failed', 'id-ID': 'Remote-to-remote transfer failed',
    'it-IT': 'Remote-to-remote transfer failed', 'ja-JP': 'Remote-to-remote transfer failed', 'ko-KR': 'Remote-to-remote transfer failed',
    'pl-PL': 'Remote-to-remote transfer failed', 'pt-BR': 'Remote-to-remote transfer failed', 'pt-PT': 'Remote-to-remote transfer failed',
    'ru-RU': 'Remote-to-remote transfer failed', 'sr-Latn': 'Remote-to-remote transfer failed', 'sv-SE': 'Remote-to-remote transfer failed',
    'tr-TR': 'Remote-to-remote transfer failed', 'uk-UA': 'Remote-to-remote transfer failed',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  let added = 0
  for (const key of KEYS) {
    const text = T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
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

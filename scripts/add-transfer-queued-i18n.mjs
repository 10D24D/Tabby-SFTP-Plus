#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加传输队列「排队中」提示 key
 *   transfer.queued  ⏳ 标记的 title 提示（队列中，尚未开始传输）
 * 用法：node scripts/add-transfer-queued-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾（与
 *   fill-missing-i18n.mjs 等既往补丁脚本保持一致）。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEY = 'transfer.queued'

const T = {
  'af-ZA': 'In waglys',
  'bg-BG': 'На опашка',
  'cs-CZ': 'Ve frontě',
  'da-DK': 'I kø',
  'de-DE': 'In Warteschlange',
  'en-GB': 'Queued',
  'en-US': 'Queued',
  'es-ES': 'En cola',
  'fr-FR': "En file d'attente",
  'hr-HR': 'U redu čekanja',
  'id-ID': 'Dalam antrean',
  'it-IT': 'In coda',
  'ja-JP': 'キュー待ち',
  'ko-KR': '대기 중',
  'pl-PL': 'W kolejce',
  'pt-BR': 'Na fila',
  'pt-PT': 'Na fila',
  'ru-RU': 'В очереди',
  'sr-Latn': 'U redu čekanja',
  'sv-SE': 'I kö',
  'tr-TR': 'Kuyrukta',
  'uk-UA': 'У черзі',
  'zh-CN': '队列中',
  'zh-TW': '佇列中',
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }

  const fp = path.join(localeDir, file)
  const raw = fs.readFileSync(fp, 'utf8')
  if (raw.includes(`msgid "${KEY}"`)) continue  // 已存在则跳过（幂等）
  const out = raw.replace(/\s*$/, '\n\n') + `msgid "${KEY}"\nmsgstr "${text}"\n\n`
  fs.writeFileSync(fp, out, 'utf8')
  console.log('patched:', file)
  totalAdded++
}
console.log(`Done. added=${totalAdded}`)

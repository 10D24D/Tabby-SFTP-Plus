#!/usr/bin/env node
/**
 * 一次性补丁脚本：把 settings.occupied.confirmDelete 的文案从「确认删除」改为「确认」
 *   —— 该行说明的是「Enter 在对话框里的作用」，而对话框不只有删除（重命名/新建文件夹/冲突确认等），
 *   写「删除」会以偏概全。
 * 用法：node scripts/fix-occupied-confirm-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-20
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')
const KEY = 'settings.occupied.confirmDelete'

const T = {
  'af-ZA': 'Bevestig', 'bg-BG': 'Потвърждаване', 'cs-CZ': 'Potvrdit', 'da-DK': 'Bekræft',
  'de-DE': 'Bestätigen', 'en-GB': 'Confirm', 'en-US': 'Confirm', 'es-ES': 'Confirmar',
  'fr-FR': 'Confirmer', 'hr-HR': 'Potvrdi', 'id-ID': 'Konfirmasi', 'it-IT': 'Conferma',
  'ja-JP': '確定', 'ko-KR': '확인', 'pl-PL': 'Potwierdź', 'pt-BR': 'Confirmar',
  'pt-PT': 'Confirmar', 'ru-RU': 'Подтвердить', 'sr-Latn': 'Potvrdi', 'sv-SE': 'Bekräfta',
  'tr-TR': 'Onayla', 'uk-UA': 'Підтвердити', 'zh-CN': '确认', 'zh-TW': '確認',
}

let changed = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }
  const fp = path.join(localeDir, file)
  const lines = fs.readFileSync(fp, 'utf8').split('\n')
  const idx = lines.findIndex(l => l.trim() === `msgid "${KEY}"`)
  if (idx === -1) { console.warn('key missing:', file); continue }
  const strIdx = lines.findIndex((l, i) => i > idx && l.startsWith('msgstr '))
  if (strIdx === -1) { console.warn('msgstr missing:', file); continue }
  const before = lines[strIdx]
  lines[strIdx] = `msgstr "${text}"`
  if (before !== lines[strIdx]) { fs.writeFileSync(fp, lines.join('\n'), 'utf8'); changed++ }
}
console.log(`Done. localesChanged=${changed}`)

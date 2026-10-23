#!/usr/bin/env node
/**
 * 一次性补丁脚本：为 24 种语言追加 settings.bookmarkSort
 *   （设置页「书签排序」两档分段控件的标题）
 * 用法：node scripts/add-bookmark-sort-label-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')
const KEY = 'settings.bookmarkSort'

const T = {
  'af-ZA': 'Boekmerk-sortering',
  'bg-BG': 'Сортиране на отметки',
  'cs-CZ': 'Řazení záložek',
  'da-DK': 'Sortering af bogmærker',
  'de-DE': 'Lesezeichen-Sortierung',
  'en-GB': 'Bookmark sorting',
  'en-US': 'Bookmark sorting',
  'es-ES': 'Orden de marcadores',
  'fr-FR': 'Tri des signets',
  'hr-HR': 'Sortiranje oznaka',
  'id-ID': 'Pengurutan markah',
  'it-IT': 'Ordinamento segnalibri',
  'ja-JP': 'ブックマークの並び順',
  'ko-KR': '북마크 정렬',
  'pl-PL': 'Sortowanie zakładek',
  'pt-BR': 'Ordenação dos favoritos',
  'pt-PT': 'Ordenação dos favoritos',
  'ru-RU': 'Сортировка закладок',
  'sr-Latn': 'Sortiranje oznaka',
  'sv-SE': 'Sortering av bokmärken',
  'tr-TR': 'Yer imi sıralaması',
  'uk-UA': 'Сортування закладок',
  'zh-CN': '书签排序',
  'zh-TW': '書籤排序',
}

let changed = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  if (raw.includes(`msgid "${KEY}"`)) continue
  raw = raw.replace(/\s*$/, '\n\n') + `msgid "${KEY}"\nmsgstr "${text}"\n\n`
  fs.writeFileSync(fp, raw, 'utf8')
  changed++
}
console.log(`Done. localesChanged=${changed}`)

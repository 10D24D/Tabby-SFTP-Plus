#!/usr/bin/env node
/**
 * 功能描述：为全部 24 种语言的 .po 追加「导出类别名：书签数据」key
 *   settings.exportCatBookmarkData  书签数据
 * 背景：导出勾选弹窗第 8 项原样复用设置页分区标题 key「数据」(settings.data)，
 *   但该分区实际只勾选 bookmarks / pathMemory / paneState 三项用户数据，
 *   名称改为更精确的「书签数据」；因 settings.data 仍被设置页分区标题引用，
 *   不能直接改它的译文，故另起一个新 key。
 * 用法：node scripts/add-bookmark-data-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾（与
 *   add-export-picker-i18n.mjs 等既往补丁脚本保持一致）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.exportCatBookmarkData']

const T = {
  'settings.exportCatBookmarkData': {
    'af-ZA': 'Boekmerkdata',
    'bg-BG': 'Данни за отметки',
    'cs-CZ': 'Data záložek',
    'da-DK': 'Bogmærkedata',
    'de-DE': 'Lesezeichendaten',
    'en-GB': 'Bookmark data',
    'en-US': 'Bookmark data',
    'es-ES': 'Datos de marcadores',
    'fr-FR': 'Données de signets',
    'hr-HR': 'Podaci zabilješki',
    'id-ID': 'Data penanda',
    'it-IT': 'Dati segnalibri',
    'ja-JP': 'ブックマークデータ',
    'ko-KR': '북마크 데이터',
    'pl-PL': 'Dane zakładek',
    'pt-BR': 'Dados de favoritos',
    'pt-PT': 'Dados de favoritos',
    'ru-RU': 'Данные закладок',
    'sr-Latn': 'Podaci obeleživača',
    'sv-SE': 'Bokmärkesdata',
    'tr-TR': 'Yer imi verileri',
    'uk-UA': 'Дані закладок',
    'zh-CN': '书签数据',
    'zh-TW': '書籤資料',
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

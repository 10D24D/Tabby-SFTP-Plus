#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「展开/收起所有分组」相关 key
 *   group.toggleAll   展开/收起所有分组（定制右键菜单列表里的统一标签）
 *   group.expandAll    全部展开（子菜单按钮文案，当存在折叠分组时）
 *   group.collapseAll  全部折叠（子菜单按钮文案，当全部已展开时）
 * 用法：node scripts/add-group-toggleall-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['group.toggleAll', 'group.expandAll', 'group.collapseAll', 'settings.enableItem']

const T = {
  'group.toggleAll': {
    'af-ZA': 'Vou alle grupe uit/ineen', 'bg-BG': 'Разгъни/свий всички групи', 'cs-CZ': 'Rozbalit/sbalit vše', 'da-DK': 'Udvid/skjul alle',
    'de-DE': 'Alle Gruppen ein-/ausklappen', 'en-GB': 'Expand/collapse all groups', 'en-US': 'Expand/collapse all groups', 'es-ES': 'Expandir/contraer todo',
    'fr-FR': 'Développer/réduire tout', 'hr-HR': 'Proširi/skupi sve', 'id-ID': 'Perluas/ciutkan semua', 'it-IT': 'Espandi/comprimi tutto',
    'ja-JP': 'すべて展開/折りたたみ', 'ko-KR': '모두 펼치기/접기', 'pl-PL': 'Rozwiń/zwiń wszystko', 'pt-BR': 'Expandir/recolher tudo',
    'pt-PT': 'Expandir/recolher tudo', 'ru-RU': 'Развернуть/свернуть все', 'sr-Latn': 'Proširi/skupi sve', 'sv-SE': 'Utöka/fäll ihop alla',
    'tr-TR': 'Tümünü genişlet/daralt', 'uk-UA': 'Розгорнути/згорнути все', 'zh-CN': '展开/收起所有分组', 'zh-TW': '展開/摺疊所有分組',
  },
  'group.expandAll': {
    'af-ZA': 'Vou alle uit', 'bg-BG': 'Разгъни всички', 'cs-CZ': 'Rozbalit vše', 'da-DK': 'Udvid alle',
    'de-DE': 'Alle ausklappen', 'en-GB': 'Expand all', 'en-US': 'Expand all', 'es-ES': 'Expandir todo',
    'fr-FR': 'Tout développer', 'hr-HR': 'Proširi sve', 'id-ID': 'Perluas semua', 'it-IT': 'Espandi tutto',
    'ja-JP': 'すべて展開', 'ko-KR': '모두 펼치기', 'pl-PL': 'Rozwiń wszystko', 'pt-BR': 'Expandir tudo',
    'pt-PT': 'Expandir tudo', 'ru-RU': 'Развернуть все', 'sr-Latn': 'Proširi sve', 'sv-SE': 'Utöka alla',
    'tr-TR': 'Tümünü genişlet', 'uk-UA': 'Розгорнути все', 'zh-CN': '全部展开', 'zh-TW': '全部展開',
  },
  'group.collapseAll': {
    'af-ZA': 'Vou alle in', 'bg-BG': 'Свий всички', 'cs-CZ': 'Sbalit vše', 'da-DK': 'Skjul alle',
    'de-DE': 'Alle einklappen', 'en-GB': 'Collapse all', 'en-US': 'Collapse all', 'es-ES': 'Contraer todo',
    'fr-FR': 'Tout réduire', 'hr-HR': 'Skupi sve', 'id-ID': 'Ciutkan semua', 'it-IT': 'Comprimi tutto',
    'ja-JP': 'すべて折りたたむ', 'ko-KR': '모두 접기', 'pl-PL': 'Zwiń wszystko', 'pt-BR': 'Recolher tudo',
    'pt-PT': 'Recolher tudo', 'ru-RU': 'Свернуть все', 'sr-Latn': 'Skupi sve', 'sv-SE': 'Fäll ihop alla',
    'tr-TR': 'Tümünü daralt', 'uk-UA': 'Згорнути все', 'zh-CN': '全部折叠', 'zh-TW': '全部摺疊',
  },
  'settings.enableItem': {
    'af-ZA': 'Aktiveer item', 'bg-BG': 'Активирай елемент', 'cs-CZ': 'Povolit položku', 'da-DK': 'Aktivér element',
    'de-DE': 'Element aktivieren', 'en-GB': 'Enable item', 'en-US': 'Enable item', 'es-ES': 'Habilitar elemento',
    'fr-FR': 'Activer l’élément', 'hr-HR': 'Omogući stavku', 'id-ID': 'Aktifkan item', 'it-IT': 'Abilita elemento',
    'ja-JP': '項目を有効にする', 'ko-KR': '항목 사용', 'pl-PL': 'Włącz element', 'pt-BR': 'Ativar item',
    'pt-PT': 'Ativar item', 'ru-RU': 'Включить элемент', 'sr-Latn': 'Omogući stavku', 'sv-SE': 'Aktivera objekt',
    'tr-TR': 'Öğeyi etkinleştir', 'uk-UA': 'Увімкнути елемент', 'zh-CN': '启用该项', 'zh-TW': '啟用該項',
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
    const text = T[key] && T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
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

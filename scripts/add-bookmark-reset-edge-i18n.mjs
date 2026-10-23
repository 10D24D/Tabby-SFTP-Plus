#!/usr/bin/env node
/**
 * 一次性补丁脚本：为 24 种语言追加手柄双击还原提示
 *   bookmark.resetWidth   双击还原默认宽度（左边框手柄）
 *   bookmark.resetHeight  双击还原默认高度（下边框手柄）
 * 用法：node scripts/add-bookmark-reset-edge-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['bookmark.resetWidth', 'bookmark.resetHeight']

const T = {
  'bookmark.resetWidth': {
    'af-ZA': 'Dubbelklik om verstekbreedte te herstel',
    'bg-BG': 'Двукратно щракване за възстановяване на ширината',
    'cs-CZ': 'Dvojklikem obnovíte výchozí šířku',
    'da-DK': 'Dobbeltklik for at gendanne standardbredde',
    'de-DE': 'Doppelklick setzt die Standardbreite zurück',
    'en-GB': 'Double-click to reset width',
    'en-US': 'Double-click to reset width',
    'es-ES': 'Doble clic para restablecer el ancho',
    'fr-FR': 'Double-cliquez pour rétablir la largeur',
    'hr-HR': 'Dvoklik za vraćanje zadane širine',
    'id-ID': 'Klik dua kali untuk mengatur ulang lebar',
    'it-IT': 'Doppio clic per ripristinare la larghezza',
    'ja-JP': 'ダブルクリックで既定の幅に戻す',
    'ko-KR': '두 번 클릭하여 기본 너비로 재설정',
    'pl-PL': 'Dwuklik przywraca domyślną szerokość',
    'pt-BR': 'Clique duplo para restaurar a largura',
    'pt-PT': 'Duplo clique para restaurar a largura',
    'ru-RU': 'Двойной щелчок вернёт ширину по умолчанию',
    'sr-Latn': 'Dvoklik za vraćanje podrazumevane širine',
    'sv-SE': 'Dubbelklicka för att återställa bredden',
    'tr-TR': 'Genişliği sıfırlamak için çift tıklayın',
    'uk-UA': 'Подвійний клік повертає типову ширину',
    'zh-CN': '双击还原默认宽度',
    'zh-TW': '雙擊還原預設寬度',
  },
  'bookmark.resetHeight': {
    'af-ZA': 'Dubbelklik om verstekhoogte te herstel',
    'bg-BG': 'Двукратно щракване за възстановяване на височината',
    'cs-CZ': 'Dvojklikem obnovíte výchozí výšku',
    'da-DK': 'Dobbeltklik for at gendanne standardhøjde',
    'de-DE': 'Doppelklick setzt die Standardhöhe zurück',
    'en-GB': 'Double-click to reset height',
    'en-US': 'Double-click to reset height',
    'es-ES': 'Doble clic para restablecer la altura',
    'fr-FR': 'Double-cliquez pour rétablir la hauteur',
    'hr-HR': 'Dvoklik za vraćanje zadane visine',
    'id-ID': 'Klik dua kali untuk mengatur ulang tinggi',
    'it-IT': 'Doppio clic per ripristinare l altezza',
    'ja-JP': 'ダブルクリックで既定の高さに戻す',
    'ko-KR': '두 번 클릭하여 기본 높이로 재설정',
    'pl-PL': 'Dwuklik przywraca domyślną wysokość',
    'pt-BR': 'Clique duplo para restaurar a altura',
    'pt-PT': 'Duplo clique para restaurar a altura',
    'ru-RU': 'Двойной щелчок вернёт высоту по умолчанию',
    'sr-Latn': 'Dvoklik za vraćanje podrazumevane visine',
    'sv-SE': 'Dubbelklicka för att återställa höjden',
    'tr-TR': 'Yüksekliği sıfırlamak için çift tıklayın',
    'uk-UA': 'Подвійний клік повертає типову висоту',
    'zh-CN': '双击还原默认高度',
    'zh-TW': '雙擊還原預設高度',
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
    if (text.includes('"')) { console.error('FATAL: double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) { fs.writeFileSync(fp, raw, 'utf8'); totalAdded += added }
}
console.log(`Done. totalAdded=${totalAdded}`)

#!/usr/bin/env node
/**
 * 一次性补丁脚本：为 24 种语言追加 bookmark.resetSize
 *   （书签弹层左下角拖拽手柄的 tooltip：双击还原默认大小）
 * 用法：node scripts/add-bookmark-reset-size-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')
const KEY = 'bookmark.resetSize'

const T = {
  'af-ZA': 'Dubbelklik om na verstekgrootte te herstel',
  'bg-BG': 'Двукратно щракване за възстановяване на размера',
  'cs-CZ': 'Dvojklikem obnovíte výchozí velikost',
  'da-DK': 'Dobbeltklik for at gendanne standardstørrelse',
  'de-DE': 'Doppelklick setzt die Standardgröße zurück',
  'en-GB': 'Double-click to reset size',
  'en-US': 'Double-click to reset size',
  'es-ES': 'Doble clic para restablecer el tamaño',
  'fr-FR': 'Double-cliquez pour rétablir la taille par défaut',
  'hr-HR': 'Dvoklik za vraćanje zadane veličine',
  'id-ID': 'Klik dua kali untuk mengatur ulang ukuran',
  'it-IT': 'Doppio clic per ripristinare la dimensione',
  'ja-JP': 'ダブルクリックで既定のサイズに戻す',
  'ko-KR': '두 번 클릭하여 기본 크기로 재설정',
  'pl-PL': 'Dwuklik przywraca domyślny rozmiar',
  'pt-BR': 'Clique duplo para restaurar o tamanho',
  'pt-PT': 'Duplo clique para restaurar o tamanho',
  'ru-RU': 'Двойной щелчок вернёт размер по умолчанию',
  'sr-Latn': 'Dvoklik za vraćanje podrazumevane veličine',
  'sv-SE': 'Dubbelklicka för att återställa storleken',
  'tr-TR': 'Boyutu sıfırlamak için çift tıklayın',
  'uk-UA': 'Подвійний клік повертає типовий розмір',
  'zh-CN': '双击还原默认大小',
  'zh-TW': '雙擊還原預設大小',
}

let changed = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }
  if (text.includes('"')) { console.error('FATAL: double quote in text:', locale); process.exit(1) }
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  if (raw.includes(`msgid "${KEY}"`)) continue
  raw = raw.replace(/\s*$/, '\n\n') + `msgid "${KEY}"\nmsgstr "${text}"\n\n`
  fs.writeFileSync(fp, raw, 'utf8')
  changed++
}
console.log(`Done. localesChanged=${changed}`)

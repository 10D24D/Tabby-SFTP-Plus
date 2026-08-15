/**
 * 新增键 file.location（属性对话框「位置」行标签，值为 pane.local/pane.remote）（幂等）
 * 注意：locale/*.po 为 CRLF 换行，行匹配必须用 \r?\n
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEYS = {
  'file.location': {
    'zh-CN': '位置', 'zh-TW': '位置',
    'en-US': 'Location', 'en-GB': 'Location',
    'ja-JP': '場所', 'ko-KR': '위치',
    'de-DE': 'Ort', 'fr-FR': 'Emplacement',
    'es-ES': 'Ubicación', 'it-IT': 'Posizione',
    'pt-BR': 'Localização', 'pt-PT': 'Localização',
    'ru-RU': 'Расположение', 'uk-UA': 'Розташування',
    'pl-PL': 'Lokalizacja', 'cs-CZ': 'Umístění',
    'tr-TR': 'Konum', 'sv-SE': 'Plats',
    'da-DK': 'Placering', 'bg-BG': 'Местоположение',
    'hr-HR': 'Lokacija', 'sr-Latn': 'Lokacija',
    'id-ID': 'Lokasi', 'af-ZA': 'Ligging',
  },
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
const locales = ['zh-CN','zh-TW','en-US','en-GB','ja-JP','ko-KR','de-DE','fr-FR','es-ES','it-IT','pt-BR','pt-PT','ru-RU','uk-UA','pl-PL','cs-CZ','tr-TR','sv-SE','da-DK','bg-BG','hr-HR','sr-Latn','id-ID','af-ZA']

let touched = 0
for (const locale of locales) {
  const full = path.join(localeDir, `${locale}.po`)
  if (!fs.existsSync(full)) { console.warn(`跳过（文件不存在）: ${locale}.po`); continue }
  let txt = fs.readFileSync(full, 'utf8')
  let changed = false
  let append = ''
  for (const [key, trans] of Object.entries(KEYS)) {
    if (txt.includes(`msgid "${key}"`)) continue // 幂等
    append += `\nmsgid "${key}"\nmsgstr "${esc(trans[locale] ?? '')}"\n`
    changed = true
  }
  if (changed) {
    if (!txt.endsWith('\n')) txt += '\n'
    fs.writeFileSync(full, txt + append, 'utf8')
    touched++
  }
}
console.log(`完成。写入 ${touched} 个文件。`)

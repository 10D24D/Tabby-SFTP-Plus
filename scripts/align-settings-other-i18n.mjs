/**
 * 将 22 个 locale/*.po（zh-CN/zh-TW 已手工改完）中既有键 settings.other 的译文
 * 由「Other」类措辞统一对齐为「功能性/Functionality」（幂等：已是目标值则跳过）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const TRANS = {
  'en-US': 'Functionality',
  'en-GB': 'Functionality',
  'ja-JP': '機能',
  'ko-KR': '기능',
  'de-DE': 'Funktionalität',
  'fr-FR': 'Fonctionnalités',
  'es-ES': 'Funcionalidad',
  'it-IT': 'Funzionalità',
  'pt-BR': 'Funcionalidades',
  'pt-PT': 'Funcionalidades',
  'ru-RU': 'Функциональность',
  'uk-UA': 'Функціональність',
  'pl-PL': 'Funkcjonalność',
  'cs-CZ': 'Funkčnost',
  'tr-TR': 'İşlevsellik',
  'sv-SE': 'Funktionalitet',
  'da-DK': 'Funktionalitet',
  'bg-BG': 'Функционалност',
  'hr-HR': 'Funkcionalnost',
  'sr-Latn': 'Funkcionalnost',
  'id-ID': 'Fungsionalitas',
  'af-ZA': 'Funksionaliteit',
}

const KEY = 'settings.other'
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

let touched = 0
for (const [locale, tr] of Object.entries(TRANS)) {
  const full = path.join(localeDir, `${locale}.po`)
  if (!fs.existsSync(full)) { console.warn(`跳过（文件不存在）: ${locale}.po`); continue }
  let txt = fs.readFileSync(full, 'utf8')
  const re = new RegExp(`(msgid "${KEY.replace(/\./g, '\\.')}")(\\r?\\n)msgstr ".*?"`, 'm')
  const m = txt.match(re)
  if (!m) { console.warn(`跳过（未找到键）: ${locale}.po`); continue }
  if (m[0].endsWith(`msgstr "${esc(tr)}"`)) continue // 幂等：已是目标值
  txt = txt.replace(re, `$1$2msgstr "${esc(tr)}"`)
  fs.writeFileSync(full, txt, 'utf8')
  touched++
}
console.log(`完成。写入 ${touched} 个文件。`)

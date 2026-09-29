/**
 * 新增键 transfer.etaRemaining：传输中条目的「预估剩余时间」文案（含 {time} 占位符）
 * 形如 zh: 「剩余 1m23s」/ en: 「1m23s left」——{time} 由 formatEta 生成，各语言只负责语序
 * 幂等：已存在该 msgid 则跳过。文案内不得含双引号（PO 字符串以双引号包裹）。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-26
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEY = 'transfer.etaRemaining'
const TRANS = {
  'zh-CN': '剩余 {time}',
  'zh-TW': '剩餘 {time}',
  'en-US': '{time} left',
  'en-GB': '{time} left',
  'ja-JP': '残り {time}',
  'ko-KR': '남은 시간 {time}',
  'de-DE': 'noch {time}',
  'fr-FR': '{time} restant',
  'es-ES': 'quedan {time}',
  'it-IT': '{time} rimanenti',
  'pt-BR': '{time} restantes',
  'pt-PT': '{time} restantes',
  'ru-RU': 'осталось {time}',
  'uk-UA': 'залишилось {time}',
  'pl-PL': 'pozostało {time}',
  'cs-CZ': 'zbývá {time}',
  'tr-TR': '{time} kaldı',
  'sv-SE': '{time} kvar',
  'da-DK': '{time} tilbage',
  'bg-BG': 'остават {time}',
  'hr-HR': 'još {time}',
  'sr-Latn': 'još {time}',
  'id-ID': 'sisa {time}',
  'af-ZA': 'nog {time} oor',
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

let added = 0
let skipped = 0
for (const [locale, tr] of Object.entries(TRANS)) {
  const fp = path.join(localeDir, `${locale}.po`)
  if (!fs.existsSync(fp)) { console.warn(`跳过（文件不存在）: ${locale}.po`); continue }
  const raw = fs.readFileSync(fp, 'utf8')
  if (new RegExp(`^msgid "${KEY.replace(/\./g, '\\.')}"`, 'm').test(raw)) { skipped++; continue }
  // 追加到文件末尾：与既有 add-*-i18n 脚本一致（parsePo 对顺序不敏感）
  const out = raw.replace(/\s*$/, '\n\n') + `msgid "${KEY}"\nmsgstr "${esc(tr)}"\n\n`
  fs.writeFileSync(fp, out, 'utf8')
  added++
}
console.log(`完成。新增 ${added} 个文件，跳过（已存在） ${skipped} 个。`)

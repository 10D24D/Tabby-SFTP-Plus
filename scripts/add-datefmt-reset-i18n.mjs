/**
 * 功能描述：为「自定义时间格式」清空/恢复默认按钮补齐 1 个 i18n key 到全部 24 个 .po 文件
 *   settings.dateFormatReset（按钮 title：恢复默认时间格式）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-23
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-23
 *
 * 说明：幂等脚本——已存在该 key 的文件跳过，避免重复写入。翻译真源是 .po。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localeDir = join(__dirname, '..', 'locale')

// locale -> "恢复默认" 文案
const RESET = {
  'af-ZA': 'Herstel verstek',
  'bg-BG': 'Възстанови по подразбиране',
  'cs-CZ': 'Obnovit výchozí',
  'da-DK': 'Nulstil til standard',
  'de-DE': 'Auf Standard zurücksetzen',
  'en-GB': 'Reset to default',
  'en-US': 'Reset to default',
  'es-ES': 'Restablecer predeterminado',
  'fr-FR': 'Réinitialiser par défaut',
  'hr-HR': 'Vrati na zadano',
  'id-ID': 'Setel ulang ke bawaan',
  'it-IT': 'Ripristina predefinito',
  'ja-JP': '既定に戻す',
  'ko-KR': '기본값으로 재설정',
  'pl-PL': 'Przywróć domyślne',
  'pt-BR': 'Redefinir para padrão',
  'pt-PT': 'Repor predefinição',
  'ru-RU': 'Сбросить по умолчанию',
  'sr-Latn': 'Vrati na podrazumevano',
  'sv-SE': 'Återställ standard',
  'tr-TR': 'Varsayılana sıfırla',
  'uk-UA': 'Скинути до типового',
  'zh-CN': '恢复默认',
  'zh-TW': '恢復預設',
}

const KEY = 'settings.dateFormatReset'

function hasKey(text, key) {
  return new RegExp(`^msgid "\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*"\\s*$`, 'm').test(text)
}
function poEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

let added = 0, skipped = 0
for (const [locale, msg] of Object.entries(RESET)) {
  const file = join(localeDir, `${locale}.po`)
  if (!existsSync(file)) { console.log(`SKIP (missing file): ${locale}.po`); continue }
  let text = readFileSync(file, 'utf8')
  if (hasKey(text, KEY)) { skipped++; continue }
  if (!text.endsWith('\n')) text += '\n'
  text += `\nmsgid "${KEY}"\nmsgstr "${poEscape(msg)}"\n`
  writeFileSync(file, text, 'utf8')
  added++
  console.log(`UPDATED: ${locale}.po`)
}
console.log(`\nDone. added=${added} skipped=${skipped} locales=${Object.keys(RESET).length}`)

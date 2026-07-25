/**
 * 功能描述：为「自定义时间格式」兼容设置补齐 3 个 i18n key 到全部 24 个 .po 文件
 *   settings.dateFormat / settings.dateFormatHint / settings.dateFormatPreview
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-23
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-23
 *
 * 说明：幂等脚本——已存在该 key 的文件跳过，避免重复写入。
 *       翻译真源是 .po，本脚本仅做一次性补齐。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localeDir = join(__dirname, '..', 'locale')

const TOKENS = 'YYYY / YY / MM / DD / HH / hh / mm / ss / A'

// locale -> { label, hint, preview }
const MAP = {
  'af-ZA': { label: 'Pasgemaakte tydformaat', hint: `Tekens: ${TOKENS} (leeg = verstek)`, preview: 'Voorskou' },
  'bg-BG': { label: 'Персонализиран формат на часа', hint: `Токени: ${TOKENS} (празно = по подразбиране)`, preview: 'Преглед' },
  'cs-CZ': { label: 'Vlastní formát času', hint: `Tokeny: ${TOKENS} (prázdné = výchozí)`, preview: 'Náhled' },
  'da-DK': { label: 'Brugerdefineret tidsformat', hint: `Tokens: ${TOKENS} (tom = standard)`, preview: 'Forhåndsvisning' },
  'de-DE': { label: 'Benutzerdefiniertes Zeitformat', hint: `Platzhalter: ${TOKENS} (leer = Standard)`, preview: 'Vorschau' },
  'en-GB': { label: 'Custom time format', hint: `Tokens: ${TOKENS} (empty = default)`, preview: 'Preview' },
  'en-US': { label: 'Custom time format', hint: `Tokens: ${TOKENS} (empty = default)`, preview: 'Preview' },
  'es-ES': { label: 'Formato de hora personalizado', hint: `Tokens: ${TOKENS} (vacío = predeterminado)`, preview: 'Vista previa' },
  'fr-FR': { label: 'Format d\'heure personnalisé', hint: `Jetons : ${TOKENS} (vide = défaut)`, preview: 'Aperçu' },
  'hr-HR': { label: 'Prilagođeni format vremena', hint: `Tokeni: ${TOKENS} (prazno = zadano)`, preview: 'Pregled' },
  'id-ID': { label: 'Format waktu kustom', hint: `Token: ${TOKENS} (kosong = bawaan)`, preview: 'Pratinjau' },
  'it-IT': { label: 'Formato ora personalizzato', hint: `Token: ${TOKENS} (vuoto = predefinito)`, preview: 'Anteprima' },
  'ja-JP': { label: 'カスタム時刻形式', hint: `トークン: ${TOKENS}（空欄 = 既定）`, preview: 'プレビュー' },
  'ko-KR': { label: '사용자 지정 시간 형식', hint: `토큰: ${TOKENS} (비워두면 기본값)`, preview: '미리보기' },
  'pl-PL': { label: 'Niestandardowy format czasu', hint: `Tokeny: ${TOKENS} (puste = domyślny)`, preview: 'Podgląd' },
  'pt-BR': { label: 'Formato de hora personalizado', hint: `Tokens: ${TOKENS} (vazio = padrão)`, preview: 'Pré-visualização' },
  'pt-PT': { label: 'Formato de hora personalizado', hint: `Tokens: ${TOKENS} (vazio = predefinição)`, preview: 'Pré-visualização' },
  'ru-RU': { label: 'Пользовательский формат времени', hint: `Токены: ${TOKENS} (пусто = по умолчанию)`, preview: 'Предпросмотр' },
  'sr-Latn': { label: 'Prilagođeni format vremena', hint: `Tokeni: ${TOKENS} (prazno = podrazumevano)`, preview: 'Pregled' },
  'sv-SE': { label: 'Anpassat tidsformat', hint: `Tokens: ${TOKENS} (tomt = standard)`, preview: 'Förhandsgranskning' },
  'tr-TR': { label: 'Özel zaman biçimi', hint: `Belirteçler: ${TOKENS} (boş = varsayılan)`, preview: 'Önizleme' },
  'uk-UA': { label: 'Власний формат часу', hint: `Токени: ${TOKENS} (порожньо = типовий)`, preview: 'Попередній перегляд' },
  'zh-CN': { label: '自定义时间格式', hint: `支持占位符：${TOKENS}（留空 = 默认格式）`, preview: '预览' },
  'zh-TW': { label: '自訂時間格式', hint: `支援占位符：${TOKENS}（留空 = 預設格式）`, preview: '預覽' },
}

const KEYS = {
  'settings.dateFormat': 'label',
  'settings.dateFormatHint': 'hint',
  'settings.dateFormatPreview': 'preview',
}

function hasKey(text, key) {
  return new RegExp(`^msgid "\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*"\\s*$`, 'm').test(text)
}

function poEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

let added = 0
let skipped = 0
for (const [locale, tr] of Object.entries(MAP)) {
  const file = join(localeDir, `${locale}.po`)
  if (!existsSync(file)) {
    console.log(`SKIP (missing file): ${locale}.po`)
    continue
  }
  let text = readFileSync(file, 'utf8')
  let changed = false
  for (const [key, field] of Object.entries(KEYS)) {
    if (hasKey(text, key)) { skipped++; continue }
    if (!text.endsWith('\n')) text += '\n'
    text += `\nmsgid "${key}"\nmsgstr "${poEscape(tr[field])}"\n`
    added++
    changed = true
  }
  if (changed) {
    writeFileSync(file, text, 'utf8')
    console.log(`UPDATED: ${locale}.po`)
  }
}

console.log(`\nDone. added=${added} skipped=${skipped} locales=${Object.keys(MAP).length}`)

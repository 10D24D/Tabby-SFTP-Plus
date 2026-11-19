#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 `notify.dragOutRenamed`
 *   场景：Chromium 的 GenerateSafeFileName 会给 Windows 保留名（desktop.ini / thumbs.db / con…）
 *   强制前置下划线；拖出时提前提示实际落盘名，避免「莫名多一个下划线」。
 * 用法：node scripts/add-drag-out-renamed-i18n.mjs
 * 说明：已存在则跳过（幂等）；条目追加到文件末尾，保持原文件的换行符（CRLF/LF）不被改写。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEY = 'notify.dragOutRenamed'
const T = {
  'af-ZA': 'Windows-gereserveerde naam — \'n onderstreping word bygevoeg (inhoud ongeskonde):',
  'bg-BG': 'Запазено име в Windows — ще се добави долна черта (съдържанието е непокътнато):',
  'cs-CZ': 'Rezervovaný název systému Windows — přidá se podtržítko (obsah zůstává):',
  'da-DK': 'Reserveret Windows-navn — der tilføjes et underscore (indholdet er intakt):',
  'de-DE': 'Von Windows reservierter Name — ein Unterstrich wird vorangestellt (Inhalt vollständig):',
  'en-GB': 'Windows reserved name — an underscore prefix is added (content intact):',
  'en-US': 'Windows reserved name — an underscore prefix is added (content intact):',
  'es-ES': 'Nombre reservado de Windows: se añade un guion bajo (el contenido está intacto):',
  'fr-FR': 'Nom réservé par Windows — un tiret bas est ajouté (contenu intact) :',
  'hr-HR': 'Rezervirano Windows ime — dodaje se podvlaka (sadržaj je netaknut):',
  'id-ID': 'Nama khusus Windows — akan ditambahkan garis bawah (isi tetap utuh):',
  'it-IT': 'Nome riservato di Windows — verrà aggiunto un trattino basso (contenuto integro):',
  'ja-JP': 'Windows の予約名のため、先頭にアンダースコアが付きます（内容は完全です）:',
  'ko-KR': 'Windows 예약 이름 — 앞에 밑줄이 추가됩니다 (내용은 그대로):',
  'pl-PL': 'Nazwa zarezerwowana w Windows — zostanie dodany podkreślnik (zawartość nienaruszona):',
  'pt-BR': 'Nome reservado do Windows — um sublinhado será adicionado (conteúdo intacto):',
  'pt-PT': 'Nome reservado do Windows — é adicionado um sublinhado (conteúdo intacto):',
  'ru-RU': 'Зарезервированное имя Windows — будет добавлено подчёркивание (содержимое не изменено):',
  'sr-Latn': 'Rezervisano Windows ime — dodaje se donja crta (sadržaj je netaknut):',
  'sv-SE': 'Reserverat Windows-namn — ett understreck läggs till (innehållet är intakt):',
  'tr-TR': 'Windows ayrılmış adı — başa alt çizgi eklenir (içerik eksiksiz):',
  'uk-UA': 'Зарезервована назва Windows — буде додано підкреслення (вміст не змінено):',
  'zh-CN': 'Windows 保留名，落盘时会自动加下划线前缀（内容完整）:',
  'zh-TW': 'Windows 保留名稱，儲存時會自動加上底線前綴（內容完整）:',
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  const raw = fs.readFileSync(fp, 'utf8')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }
  if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale); process.exit(1) }
  if (raw.includes(`msgid "${KEY}"`)) continue
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const body = raw.replace(/(?:\r?\n)+$/, '')
  const entry = [`msgid "${KEY}"`, `msgstr "${text}"`, ''].join(eol)
  fs.writeFileSync(fp, body + eol + eol + entry, 'utf8')
  totalAdded++
}
console.log(`Done. totalAdded=${totalAdded}`)

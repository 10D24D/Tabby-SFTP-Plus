#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 key
 *   notify.pasteSkippedExists  「端点直传粘贴」目标已存在时跳过若干项的汇总提示
 * 用法：node scripts/add-paste-skip-exists-i18n.mjs
 * 说明：已存在的 key 会被跳过（幂等）；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['notify.pasteSkippedExists']

const T = {
  'notify.pasteSkippedExists': {
    'af-ZA': '{n} item oorgeslaan — teiken bestaan reeds',
    'bg-BG': 'Пропуснати {n} елемента — целта вече съществува',
    'cs-CZ': 'Přeskočeno {n} položek — cíl již existuje',
    'da-DK': '{n} elementer sprunget over — målet findes allerede',
    'de-DE': '{n} Elemente übersprungen — Ziel existiert bereits',
    'en-GB': '{n} item(s) skipped — target already exists',
    'en-US': '{n} item(s) skipped — target already exists',
    'es-ES': 'Se omitieron {n} elementos — el destino ya existe',
    'fr-FR': '{n} élément(s) ignoré(s) — la cible existe déjà',
    'hr-HR': 'Preskočeno {n} stavki — cilj već postoji',
    'id-ID': '{n} item dilewati — tujuan sudah ada',
    'it-IT': '{n} elementi saltati — la destinazione esiste già',
    'ja-JP': '{n} 件をスキップしました — 同名の項目が既に存在します',
    'ko-KR': '{n}개 항목을 건너뛰었습니다 — 대상이 이미 존재합니다',
    'pl-PL': 'Pominięto {n} elementów — cel już istnieje',
    'pt-BR': '{n} item(ns) ignorado(s) — o destino já existe',
    'pt-PT': '{n} item(ns) ignorado(s) — o destino já existe',
    'ru-RU': 'Пропущено {n} элементов — цель уже существует',
    'sr-Latn': 'Preskočeno {n} stavki — cilj već postoji',
    'sv-SE': '{n} objekt hoppades över — målet finns redan',
    'tr-TR': '{n} öğe atlandı — hedef zaten var',
    'uk-UA': 'Пропущено {n} елементів — ціль уже існує',
    'zh-CN': '{n} 项已存在，已跳过',
    'zh-TW': '{n} 項已存在，已略過',
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

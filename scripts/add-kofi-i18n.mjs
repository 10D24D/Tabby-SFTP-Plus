#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「请喝咖啡」（ko-fi 赞助入口）所需 key
 *   settings.buyCoffee   设置页「关于」区的赞助链接文案
 * 用法：node scripts/add-kofi-i18n.mjs
 *
 * 注：本脚本把 key **追加到文件末尾**，不做「锚点后插入」——锚点插入一旦把
 *   msgid 落到另一条 msgstr 后面，就会变成「连续 msgid + 顺延 msgstr」的错位
 *   （gettext 不报错、界面直接显 key）。
 * 注：英文一律用 "Treat me to a coffee" 而非 "Buy me a coffee"——后者是
 *   Publisherr Inc. 的注册商标，不能用作按钮文案。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-22
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.buyCoffee']

const T = {
  'settings.buyCoffee': {
    'af-ZA': 'Trakteer my op koffie',
    'bg-BG': 'Почерпете ме с кафе',
    'cs-CZ': 'Kupte mi kávu',
    'da-DK': 'Giv mig en kop kaffe',
    'de-DE': 'Spendier mir einen Kaffee',
    'en-GB': 'Treat me to a coffee',
    'en-US': 'Treat me to a coffee',
    'es-ES': 'Invítame a un café',
    'fr-FR': 'Offrez-moi un café',
    'hr-HR': 'Časti me kavom',
    'id-ID': 'Traktir saya kopi',
    'it-IT': 'Offrimi un caffè',
    'ja-JP': 'コーヒーをおごる',
    'ko-KR': '커피 한 잔 사주기',
    'pl-PL': 'Postaw mi kawę',
    'pt-BR': 'Me pague um café',
    'pt-PT': 'Pague-me um café',
    'ru-RU': 'Угостите кофе',
    'sr-Latn': 'Časti me kafom',
    'sv-SE': 'Bjud mig på kaffe',
    'tr-TR': 'Bana bir kahve ısmarla',
    'uk-UA': 'Пригостіть кавою',
    'zh-CN': '请喝咖啡',
    'zh-TW': '請喝咖啡',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  let added = 0
  for (const key of KEYS) {
    const text = T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: double quote in translation:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
    raw = raw.replace(/\s*$/, eol + eol) + `msgid "${key}"${eol}msgstr "${text}"${eol}${eol}`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)

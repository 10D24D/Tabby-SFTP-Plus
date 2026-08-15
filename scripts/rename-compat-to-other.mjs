#!/usr/bin/env node
/**
 * 将 .po 中的设置项 key：settings.compatibility → settings.other
 * 并把对应 msgstr 改为各语言对「其它 / Other」的译法。
 * 仅改这两个点，不动其它 key。
 *
 * 安全说明：脚本只读 locale/*.po 并就地重写匹配到的两行；
 * 不会触碰 src、不会删除文件、不会访问网络。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

// 各语言对「其它 / Other」的译法
const TRANS = {
  'zh-CN': '其它',
  'zh-TW': '其它',
  'en-US': 'Other',
  'en-GB': 'Other',
  'ja-JP': 'その他',
  'ko-KR': '기타',
  'af-ZA': 'Ander',
  'bg-BG': 'Други',
  'cs-CZ': 'Ostatní',
  'da-DK': 'Andet',
  'de-DE': 'Sonstiges',
  'es-ES': 'Otro',
  'fr-FR': 'Autre',
  'hr-HR': 'Ostalo',
  'id-ID': 'Lainnya',
  'it-IT': 'Altro',
  'pl-PL': 'Inne',
  'pt-BR': 'Outro',
  'pt-PT': 'Outro',
  'ru-RU': 'Прочее',
  'sr-Latn': 'Ostalo',
  'sv-SE': 'Övrigt',
  'tr-TR': 'Diğer',
  'uk-UA': 'Інше',
}

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
let renamed = 0
for (const file of files) {
  const locale = file.replace('.po', '')
  const tr = TRANS[locale]
  if (!tr) { console.warn(`跳过（无译法）: ${file}`); continue }
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  // 匹配：msgid "settings.compatibility" 紧邻的 msgstr "..."（单行）
  const re = /msgid "settings\.compatibility"\nmsgstr ".*"/g
  if (re.test(txt)) {
    txt = txt.replace(re, `msgid "settings.other"\nmsgstr "${tr}"`)
    renamed++
    fs.writeFileSync(full, txt, 'utf8')
  } else if (txt.includes('msgid "settings.other"')) {
    // 已重命名过，跳过
    console.log(`已存在 settings.other，跳过: ${file}`)
  }
}
console.log(`完成。重命名 ${renamed} 个 .po 文件。`)

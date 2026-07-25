/**
 * 批量更新多语言 .po 文件的 header
 * 用法：node scripts/update-po-headers.mjs
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '..', 'locale')

const locales = [
  { code: 'ja-JP', pluralForms: 'nplurals=1; plural=0;', language: 'ja_JP' },
  { code: 'ko-KR', pluralForms: 'nplurals=1; plural=0;', language: 'ko_KR' },
  { code: 'fr-FR', pluralForms: 'nplurals=2; plural=(n > 1);', language: 'fr_FR' },
  { code: 'de-DE', pluralForms: 'nplurals=2; plural=(n != 1);', language: 'de_DE' },
  { code: 'es-ES', pluralForms: 'nplurals=2; plural=(n != 1);', language: 'es_ES' },
  { code: 'pt-BR', pluralForms: 'nplurals=2; plural=(n > 1);', language: 'pt_BR' },
  { code: 'ru-RU', pluralForms: 'nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);', language: 'ru_RU' },
  { code: 'it-IT', pluralForms: 'nplurals=2; plural=(n != 1);', language: 'it_IT' },
]

for (const { code, pluralForms, language } of locales) {
  const poPath = path.join(localeDir, `${code}.po`)
  if (!fs.existsSync(poPath)) {
    console.warn(`⚠️ 文件不存在: ${poPath}`)
    continue
  }

  let content = fs.readFileSync(poPath, 'utf-8')

  // 替换 header
  content = content.replace(
    /"Plural-Forms: nplurals=\d; plural=[^;]+;\\n"/,
    `"Plural-Forms: ${pluralForms}\\n"`
  )
  content = content.replace(
    /"Language: [^\\]+\\n"/,
    `"Language: ${language}\\n"`
  )

  fs.writeFileSync(poPath, content, 'utf-8')
  console.log(`✅ 已更新 ${code}.po header`)
}

console.log(`\n所有 .po 文件 header 已更新！`)

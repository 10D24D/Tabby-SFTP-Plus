#!/usr/bin/env node
/**
 * 转换脚本：从 sftp-i18n.service.ts 提取 TRANSLATIONS 生成 .po 文件
 * 用法：node scripts/convert-to-po.mjs
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const rootDir = path.resolve(__dirname, '..')
const srcFile = path.join(rootDir, 'src', 'services', 'sftp-i18n.service.ts')

function extractTranslations(text, locale) {
  const pattern = new RegExp(`'${locale}':\\s*\\{([\\s\\S]*?)\\n\\s{2,4}\},?`)
  const match = text.match(pattern)
  if (!match) {
    console.error(`❌ 无法找到 ${locale} 翻译块`)
    return []
  }

  const lines = match[1].split('\n')
  const translations = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue

    // 匹配 'key': 'value', 格式（支持 value 中包含单引号）
    const matchResult = trimmed.match(/^'([^']+)':\s*'([^']*(?:\\'[^']*)*)',?/)
    if (matchResult) {
      translations.push({
        key: matchResult[1],
        value: matchResult[2].replace(/\\'/g, "'")
      })
    }
  }

  return translations
}

function escapePoValue(value) {
  return value
    .replace(/"/g, '\\"')
    .replace(/\\n/g, '\\n')
}

function generatePo(translations, locale) {
  const headers = {
    'zh-CN': {
      pluralForms: 'nplurals=1; plural=0;',
      language: 'zh_CN'
    },
    'en-US': {
      pluralForms: 'nplurals=2; plural=(n != 1);',
      language: 'en_US'
    }
  }

  const h = headers[locale]
  let po = `msgid ""
msgstr ""
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: ${h.pluralForms}\\n"
"Language: ${h.language}\\n"

`

  for (const { key, value } of translations) {
    const escapedValue = escapePoValue(value)
    po += `msgid "${key}"\nmsgstr "${escapedValue}"\n\n`
  }

  return po
}

// 读取源文件
const content = fs.readFileSync(srcFile, 'utf-8')

// 提取并生成 .po 文件
const localeDir = path.join(rootDir, 'locale')
if (!fs.existsSync(localeDir)) {
  fs.mkdirSync(localeDir, { recursive: true })
}

for (const locale of ['zh-CN', 'en-US']) {
  const translations = extractTranslations(content, locale)
  if (translations.length > 0) {
    const poContent = generatePo(translations, locale)
    const poPath = path.join(localeDir, `${locale}.po`)
    fs.writeFileSync(poPath, poContent, 'utf-8')
    console.log(`✅ 已生成 ${locale}.po（${translations.length} 条翻译）`)
  }
}

console.log(`\n .po 文件已输出到: ${localeDir}`)

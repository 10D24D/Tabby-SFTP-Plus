import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.resolve(__dirname, '../locale')

const enPath = path.join(localeDir, 'en-US.po')
const enContent = fs.readFileSync(enPath, 'utf8')

// New languages to generate (based on Tabby Crowdin list)
const newLangs = [
  { code: 'id-ID', base: 'en-US' },
  { code: 'cs-CZ', base: 'en-US' },
  { code: 'da-DK', base: 'en-US' },
  { code: 'en-GB', base: 'en-US' },
  { code: 'hr-HR', base: 'en-US' },
  { code: 'pl-PL', base: 'en-US' },
  { code: 'pt-PT', base: 'pt-BR' },
  { code: 'sv-SE', base: 'en-US' },
  { code: 'tr-TR', base: 'en-US' },
  { code: 'bg-BG', base: 'en-US' },
  { code: 'sr-Latn', base: 'en-US' },
  { code: 'uk-UA', base: 'en-US' },
  { code: 'af-ZA', base: 'en-US' },
]

for (const { code, base } of newLangs) {
  let content
  if (base === 'en-US') {
    content = enContent
  } else {
    const basePath = path.join(localeDir, `${base}.po`)
    content = fs.readFileSync(basePath, 'utf8')
  }
  
  // Replace Language header
  const langHeader = `Language: ${code.replace('-', '_')}`
  content = content.replace(/Language: \w+/, langHeader)
  
  const outputPath = path.join(localeDir, `${code}.po`)
  fs.writeFileSync(outputPath, content, 'utf8')
  console.log(`Generated: ${outputPath}`)
}

console.log('All done!')

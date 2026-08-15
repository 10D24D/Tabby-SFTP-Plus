/**
 * 为 24 个 locale/*.po 追加属性对话框标题 2 个新 i18n key（幂等：已存在则跳过）
 *   file.fileProperties / file.folderProperties
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEYS = {
  'file.fileProperties': {
    'zh-CN': '文件属性',
    'zh-TW': '檔案屬性',
    'en-US': 'File properties',
    'en-GB': 'File properties',
    'ja-JP': 'ファイルのプロパティ',
    'ko-KR': '파일 속성',
    'de-DE': 'Dateieigenschaften',
    'fr-FR': 'Propriétés du fichier',
    'es-ES': 'Propiedades del archivo',
    'it-IT': 'Proprietà del file',
    'pt-BR': 'Propriedades do arquivo',
    'pt-PT': 'Propriedades do ficheiro',
    'ru-RU': 'Свойства файла',
    'uk-UA': 'Властивості файлу',
    'pl-PL': 'Właściwości pliku',
    'cs-CZ': 'Vlastnosti souboru',
    'tr-TR': 'Dosya özellikleri',
    'sv-SE': 'Filegenskaper',
    'da-DK': 'Filegenskaber',
    'bg-BG': 'Свойства на файла',
    'hr-HR': 'Svojstva datoteke',
    'sr-Latn': 'Svojstva datoteke',
    'id-ID': 'Properti file',
    'af-ZA': 'Lêereienskappe',
  },
  'file.folderProperties': {
    'zh-CN': '文件夹属性',
    'zh-TW': '資料夾屬性',
    'en-US': 'Folder properties',
    'en-GB': 'Folder properties',
    'ja-JP': 'フォルダーのプロパティ',
    'ko-KR': '폴더 속성',
    'de-DE': 'Ordner-Eigenschaften',
    'fr-FR': 'Propriétés du dossier',
    'es-ES': 'Propiedades de la carpeta',
    'it-IT': 'Proprietà della cartella',
    'pt-BR': 'Propriedades da pasta',
    'pt-PT': 'Propriedades da pasta',
    'ru-RU': 'Свойства папки',
    'uk-UA': 'Властивості папки',
    'pl-PL': 'Właściwości folderu',
    'cs-CZ': 'Vlastnosti složky',
    'tr-TR': 'Klasör özellikleri',
    'sv-SE': 'Mappegenskaper',
    'da-DK': 'Mappeegenskaber',
    'bg-BG': 'Свойства на папката',
    'hr-HR': 'Svojstva mape',
    'sr-Latn': 'Svojstva fascikle',
    'id-ID': 'Properti folder',
    'af-ZA': 'Vouereienskappe',
  },
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
let touched = 0
for (const file of files) {
  const locale = file.replace('.po', '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  let added = ''
  for (const [key, trans] of Object.entries(KEYS)) {
    const tr = trans[locale]
    if (!tr) { console.warn(`跳过（无译法）: ${file} ${key}`); continue }
    if (txt.includes(`msgid "${key}"`)) continue // 幂等：已存在跳过
    added += `\nmsgid "${key}"\nmsgstr "${esc(tr)}"\n`
  }
  if (!added) continue
  if (!txt.endsWith('\n')) txt += '\n'
  fs.writeFileSync(full, txt + added, 'utf8')
  touched++
}
console.log(`完成。写入 ${touched} 个文件。`)

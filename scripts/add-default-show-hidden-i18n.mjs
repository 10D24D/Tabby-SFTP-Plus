/**
 * 为 24 个 locale/*.po 追加「默认显示隐藏文件」1 个新 i18n key（幂等：已存在则跳过）
 *   settings.defaultShowHidden
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-29
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const TRANS = {
  'zh-CN': '默认显示隐藏文件',
  'zh-TW': '預設顯示隱藏檔案',
  'en-US': 'Show hidden files by default',
  'en-GB': 'Show hidden files by default',
  'ja-JP': '隠しファイルをデフォルトで表示',
  'ko-KR': '기본적으로 숨김 파일 표시',
  'de-DE': 'Versteckte Dateien standardmäßig anzeigen',
  'fr-FR': 'Afficher les fichiers cachés par défaut',
  'es-ES': 'Mostrar archivos ocultos por defecto',
  'it-IT': 'Mostra file nascosti per impostazione predefinita',
  'pt-BR': 'Mostrar arquivos ocultos por padrão',
  'pt-PT': 'Mostrar ficheiros ocultos por predefinição',
  'ru-RU': 'Показывать скрытые файлы по умолчанию',
  'uk-UA': 'Показувати приховані файли за замовчуванням',
  'pl-PL': 'Domyślnie pokazuj ukryte pliki',
  'cs-CZ': 'Ve výchozím nastavení zobrazovat skryté soubory',
  'tr-TR': 'Gizli dosyaları varsayılan olarak göster',
  'sv-SE': 'Visa dolda filer som standard',
  'da-DK': 'Vis skjulte filer som standard',
  'bg-BG': 'Показване на скритите файлове по подразбиране',
  'hr-HR': 'Zadano prikaži skrivene datoteke',
  'sr-Latn': 'Podrazumevano prikaži skrivene datoteke',
  'id-ID': 'Tampilkan file tersembunyi secara default',
  'af-ZA': 'Wys verborge lêers by verstek',
}

const KEY = 'settings.defaultShowHidden'
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
let touched = 0
for (const file of files) {
  const locale = file.replace('.po', '')
  const tr = TRANS[locale]
  if (!tr) { console.warn(`跳过（无译法）: ${file}`); continue }
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  if (txt.includes(`msgid "${KEY}"`)) continue // 幂等：已存在跳过
  if (!txt.endsWith('\n')) txt += '\n'
  fs.writeFileSync(full, txt + `\nmsgid "${KEY}"\nmsgstr "${esc(tr)}"\n`, 'utf8')
  touched++
}
console.log(`完成。写入 ${touched} 个文件。`)

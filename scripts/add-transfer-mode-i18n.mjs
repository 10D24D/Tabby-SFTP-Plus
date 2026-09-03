/**
 * 为 24 个 locale/*.po 追加「目录传输模式 / 文件数」展示相关 i18n（幂等，可重复执行）：
 *   新增 3 个 key：log.modeFast / log.modeTar / log.fileCount
 * 用途：传输记录对话框显示目录传输的模式标签（快速模式 / tar 打包加速），
 *   标准模式则显示本次传输的文件数量。
 * 创建人：DD1024z + Hy4 preview
 * 创建时间：2026-09-03
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

/** 新增 key 的 24 语言译文 */
const NEW_KEYS = {
  'log.modeFast': {
    'zh-CN': '快速模式', 'zh-TW': '快速模式',
    'en-US': 'Fast mode', 'en-GB': 'Fast mode',
    'ja-JP': '高速モード', 'ko-KR': '빠른 모드',
    'de-DE': 'Schnellmodus', 'fr-FR': 'Mode rapide',
    'es-ES': 'Modo rápido', 'it-IT': 'Modalità rapida',
    'pt-BR': 'Modo rápido', 'pt-PT': 'Modo rápido',
    'ru-RU': 'Быстрый режим', 'uk-UA': 'Швидкий режим',
    'pl-PL': 'Tryb szybki', 'cs-CZ': 'Rychlý režim',
    'tr-TR': 'Hızlı mod', 'sv-SE': 'Snabbläge',
    'da-DK': 'Hurtig tilstand', 'bg-BG': 'Бърз режим',
    'hr-HR': 'Brzi način', 'sr-Latn': 'Brzi režim',
    'id-ID': 'Mode cepat', 'af-ZA': 'Vinnige modus',
  },
  'log.modeTar': {
    'zh-CN': '打包加速', 'zh-TW': '打包加速',
    'en-US': 'Tar packing', 'en-GB': 'Tar packing',
    'ja-JP': 'パック転送', 'ko-KR': '패킹 전송',
    'de-DE': 'Tar-Paket', 'fr-FR': 'Paquet tar',
    'es-ES': 'Empaquetado tar', 'it-IT': 'Pacchetto tar',
    'pt-BR': 'Pacote tar', 'pt-PT': 'Pacote tar',
    'ru-RU': 'tar-упаковка', 'uk-UA': 'tar-упаковка',
    'pl-PL': 'Paczka tar', 'cs-CZ': 'Tar balíček',
    'tr-TR': 'Tar paketleme', 'sv-SE': 'Tar-paketering',
    'da-DK': 'Tar-pakning', 'bg-BG': 'tar-опаковка',
    'hr-HR': 'Tar paket', 'sr-Latn': 'Tar paket',
    'id-ID': 'Paket tar', 'af-ZA': 'Tar-pakket',
  },
  'log.fileCount': {
    'zh-CN': '{n} 个文件', 'zh-TW': '{n} 個檔案',
    'en-US': '{n} files', 'en-GB': '{n} files',
    'ja-JP': '{n} ファイル', 'ko-KR': '{n}개 파일',
    'de-DE': '{n} Dateien', 'fr-FR': '{n} fichiers',
    'es-ES': '{n} archivos', 'it-IT': '{n} file',
    'pt-BR': '{n} arquivos', 'pt-PT': '{n} ficheiros',
    'ru-RU': '{n} файлов', 'uk-UA': '{n} файлів',
    'pl-PL': '{n} plików', 'cs-CZ': '{n} souborů',
    'tr-TR': '{n} dosya', 'sv-SE': '{n} filer',
    'da-DK': '{n} filer', 'bg-BG': '{n} файла',
    'hr-HR': '{n} datoteka', 'sr-Latn': '{n} datoteka',
    'id-ID': '{n} berkas', 'af-ZA': '{n} lêers',
  },
}

function poEscape(s) {
  // 用 \u0000 作占位符保护字面 \n（.po 的换行转义序列），避免被下面的反斜杠转义破坏；最后还原
  return String(s)
    .replace(/\r/g, '')
    .replace(/\\n/g, '\u0000')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\u0000/g, '\\n')
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasKey(txt, key) {
  return new RegExp(`^msgid\\s+"${escRe(key)}"\\s*$`, 'm').test(txt)
}

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let added = 0

for (const file of files) {
  const lang = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')

  const blocks = []
  for (const [key, perLang] of Object.entries(NEW_KEYS)) {
    const val = perLang[lang] ?? perLang['en-US']
    if (!val || hasKey(txt, key)) continue
    blocks.push(`\nmsgid "${key}"\nmsgstr "${poEscape(val)}"\n`)
  }
  if (blocks.length) {
    if (!txt.endsWith('\n')) txt += '\n'
    txt += blocks.join('')
    added += blocks.length
  }

  fs.writeFileSync(full, txt, 'utf8')
}

console.log(`[i18n] 追加新 key ${added} 条，处理 ${files.length} 个语言文件`)

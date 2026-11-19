#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 `notify.dragOutPacked`
 *   场景：Chromium 的 DownloadURL 一次只能落一个文件，多选拖出改为打包 ZIP；
 *         拖出时提示用户「解压即可得到全部文件」，避免以为只传了一个。
 * 用法：node scripts/add-drag-out-packed-i18n.mjs
 * 说明：已存在则跳过（幂等）；条目追加到文件末尾，保持原文件的换行符（CRLF/LF）不被改写。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEY = 'notify.dragOutPacked'
const T = {
  'af-ZA': '{count} lêers is in een ZIP saamgepak (vouers uitgesluit). Pak dit uit om al die lêers te kry.',
  'bg-BG': '{count} файла са опаковани в един ZIP (папките са изключени). Разархивирайте, за да получите всички файлове.',
  'cs-CZ': '{count} souborů bylo zabaleno do jednoho ZIP (složky vynechány). Rozbalte jej pro všechny soubory.',
  'da-DK': '{count} filer er pakket i én ZIP (mapper er udeladt). Udpak den for at få alle filer.',
  'de-DE': '{count} Dateien wurden in einem ZIP zusammengefasst (Ordner ausgenommen). Entpacken, um alle Dateien zu erhalten.',
  'en-GB': 'Packed {count} files into one ZIP (folders excluded). Extract it to get all files.',
  'en-US': 'Packed {count} files into one ZIP (folders excluded). Extract it to get all files.',
  'es-ES': 'Se han empaquetado {count} archivos en un ZIP (carpetas excluidas). Extráigalo para obtener todos los archivos.',
  'fr-FR': '{count} fichiers ont été réunis dans une archive ZIP (dossiers exclus). Décompressez-la pour obtenir tous les fichiers.',
  'hr-HR': '{count} datoteka je zapakirano u jedan ZIP (mape su isključene). Raspakirajte za sve datoteke.',
  'id-ID': '{count} berkas dikemas ke dalam satu ZIP (folder tidak disertakan). Ekstrak untuk mendapatkan semua berkas.',
  'it-IT': '{count} file sono stati racchiusi in un unico ZIP (cartelle escluse). Estrarlo per ottenere tutti i file.',
  'ja-JP': '{count} 個のファイルを 1 つの ZIP にまとめました（フォルダーは対象外）。展開すると全ファイルが取得できます。',
  'ko-KR': '{count}개 파일을 ZIP 하나로 묶었습니다(폴더 제외). 압축을 풀면 모든 파일을 얻을 수 있습니다.',
  'pl-PL': '{count} plików spakowano do jednego ZIP (foldery pominięte). Rozpakuj, aby otrzymać wszystkie pliki.',
  'pt-BR': '{count} arquivos foram empacotados em um único ZIP (pastas excluídas). Extraia para obter todos os arquivos.',
  'pt-PT': '{count} ficheiros foram agrupados num único ZIP (pastas excluídas). Extraia para obter todos os ficheiros.',
  'ru-RU': '{count} файлов упаковано в один ZIP (папки не включены). Распакуйте, чтобы получить все файлы.',
  'sr-Latn': '{count} datoteka je upakovano u jedan ZIP (folderi su isključeni). Raspakujte da biste dobili sve datoteke.',
  'sv-SE': '{count} filer har packats i en ZIP (mappar undantagna). Packa upp för att få alla filer.',
  'tr-TR': '{count} dosya tek bir ZIP içinde paketlendi (klasörler hariç). Tüm dosyalar için arşivi açın.',
  'uk-UA': '{count} файлів упаковано в один ZIP (папки не включено). Розпакуйте, щоб отримати всі файли.',
  'zh-CN': '已把 {count} 个文件打包成一个 ZIP（目录不参与），解压即可得到全部文件',
  'zh-TW': '已將 {count} 個檔案打包成一個 ZIP（資料夾不包含），解壓縮即可取得全部檔案',
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
  if (!text.includes('{count}')) { console.error('FATAL: missing {count} placeholder:', locale); process.exit(1) }
  if (raw.includes(`msgid "${KEY}"`)) continue
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const body = raw.replace(/(?:\r?\n)+$/, '')
  const entry = [`msgid "${KEY}"`, `msgstr "${text}"`, ''].join(eol)
  fs.writeFileSync(fp, body + eol + eol + entry, 'utf8')
  totalAdded++
}
console.log(`Done. totalAdded=${totalAdded}`)

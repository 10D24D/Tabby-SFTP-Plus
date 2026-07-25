/**
 * 功能描述：为 conflict.existsSamePane 新增 key 补齐到全部 24 个 .po 文件
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-21
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-21
 *
 * 说明：幂等脚本——已存在该 key 的文件跳过，避免重复写入。
 *       翻译真源是 .po，本脚本仅做一次性补齐。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localeDir = join(__dirname, '..', 'locale')

const KEY = 'conflict.existsSamePane'

// locale -> 译文（与 en-US 语义一致："目标位置已存在同名文件"）
const MAP = {
  'af-ZA': 'Lêer met dieselfde naam bestaan reeds op teikengebied',
  'bg-BG': 'Файл със същото име вече съществува в целевото местоположение',
  'cs-CZ': 'Soubor se stejným názvem již v cílovém umístění existuje',
  'da-DK': 'En fil med samme navn findes allerede på destinationsstedet',
  'de-DE': 'Eine Datei mit demselben Namen existiert bereits am Zielort',
  'en-GB': 'A file with the same name already exists at the target location',
  'en-US': 'A file with the same name already exists at the target location',
  'es-ES': 'Ya existe un archivo con el mismo nombre en la ubicación de destino',
  'fr-FR': 'Un fichier portant le même nom existe déjà à l\'emplacement cible',
  'hr-HR': 'Datoteka s istim nazivom već postoji na odredišnom mjestu',
  'id-ID': 'Berkas dengan nama yang sama sudah ada di lokasi tujuan',
  'it-IT': 'Esiste già un file con lo stesso nome nella posizione di destinazione',
  'ja-JP': '宛先に同じ名前のファイルが既に存在します',
  'ko-KR': '대상 위치에 동일한 이름의 파일이 이미 있습니다',
  'pl-PL': 'Plik o tej samej nazwie już istnieje w lokalizacji docelowej',
  'pt-BR': 'Já existe um arquivo com o mesmo nome no local de destino',
  'pt-PT': 'Já existe um ficheiro com o mesmo nome no local de destino',
  'ru-RU': 'Файл с таким же именем уже существует в целевом расположении',
  'sr-Latn': 'Fajl sa istim imenom već postoji na odredišnom mestu',
  'sv-SE': 'En fil med samma namn finns redan på målplatsen',
  'tr-TR': 'Hedef konumda aynı ada sahip dosya zaten mevcut',
  'uk-UA': 'Файл з такою ж назвою вже існує у цільовому розташуванні',
  'zh-CN': '目标位置已存在同名文件',
  'zh-TW': '目標位置已存在同名檔案',
}

function hasKey(text, key) {
  return new RegExp(`^msgid "\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*"\\s*$`, 'm').test(text)
}

let added = 0
let skipped = 0
for (const [locale, value] of Object.entries(MAP)) {
  const file = join(localeDir, `${locale}.po`)
  if (!existsSync(file)) {
    console.log(`SKIP (missing file): ${locale}.po`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  if (hasKey(text, KEY)) {
    skipped++
    continue
  }
  const block = `\nmsgid "${KEY}"\nmsgstr "${value}"\n`
  // 保证结尾有换行后再追加
  const base = text.endsWith('\n') ? text : text + '\n'
  writeFileSync(file, base + block, 'utf8')
  added++
  console.log(`ADDED: ${locale}.po`)
}

console.log(`\nDone. added=${added} skipped=${skipped} total=${Object.keys(MAP).length}`)

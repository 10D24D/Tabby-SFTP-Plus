#!/usr/bin/env node
/**
 * 补丁脚本：为全部 24 种语言的 .po 追加 / 同步 3 个 key
 *   - log.dragOutNote           传输记录目标路径里的**占位目录**（如 <拖放目录>），浏览器拿不到真实落盘目录
 *   - file.downloadTo           右键「下载到指定目录...」菜单文案
 *   - notify.downloadToUnavailable  系统目录选择框不可用时的提示
 * 用法：node scripts/add-download-to-folder-i18n.mjs
 * 说明：幂等 —— key 不存在则追加到文件末尾，已存在则只替换紧跟其后的**单行 msgstr**；
 *   保持原文件换行符（CRLF/LF）与空行格式不被改写，不触碰其它条目。
 *   ⚠ 文案中禁止出现半角双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Hy4
 * @创建时间：2026-11-09
 * @修改人：DD1024z + Hy4
 * @修改时间：2026-11-09 — log.dragOutNote 由「系统拖放落点」改为尖括号占位目录
 *            （用户口径：宁可写 <拖放目录>/文件名，也不要一个不像路径的说明词），
 *            并支持对已存在的 key 做 msgstr 幂等更新。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const T = {
  'log.dragOutNote': {
    'af-ZA': '<Bestemmingsmap>',
    'bg-BG': '<Папка за пускане>',
    'cs-CZ': '<Cílová složka>',
    'da-DK': '<Droppemappe>',
    'de-DE': '<Zielordner>',
    'en-GB': '<Drop folder>',
    'en-US': '<Drop folder>',
    'es-ES': '<Carpeta de destino>',
    'fr-FR': '<Dossier de destination>',
    'hr-HR': '<Odredišna mapa>',
    'id-ID': '<Folder tujuan>',
    'it-IT': '<Cartella di destinazione>',
    'ja-JP': '<ドロップ先フォルダー>',
    'ko-KR': '<놓은 폴더>',
    'pl-PL': '<Folder docelowy>',
    'pt-BR': '<Pasta de destino>',
    'pt-PT': '<Pasta de destino>',
    'ru-RU': '<Папка назначения>',
    'sr-Latn': '<Odredišna fascikla>',
    'sv-SE': '<Släppmapp>',
    'tr-TR': '<Bırakma klasörü>',
    'uk-UA': '<Папка призначення>',
    'zh-CN': '<拖放目录>',
    'zh-TW': '<拖放目錄>',
  },
  'file.downloadTo': {
    'af-ZA': 'Laai af na vouer...',
    'bg-BG': 'Изтегляне в папка...',
    'cs-CZ': 'Stáhnout do složky...',
    'da-DK': 'Download til mappe...',
    'de-DE': 'In Ordner herunterladen...',
    'en-GB': 'Download to folder...',
    'en-US': 'Download to folder...',
    'es-ES': 'Descargar a carpeta...',
    'fr-FR': 'Télécharger dans un dossier...',
    'hr-HR': 'Preuzmi u mapu...',
    'id-ID': 'Unduh ke folder...',
    'it-IT': 'Scarica nella cartella...',
    'ja-JP': 'フォルダーにダウンロード...',
    'ko-KR': '폴더로 다운로드...',
    'pl-PL': 'Pobierz do folderu...',
    'pt-BR': 'Baixar para pasta...',
    'pt-PT': 'Transferir para pasta...',
    'ru-RU': 'Скачать в папку...',
    'sr-Latn': 'Preuzmi u fasciklu...',
    'sv-SE': 'Ladda ner till mapp...',
    'tr-TR': 'Klasöre indir...',
    'uk-UA': 'Завантажити в папку...',
    'zh-CN': '下载到指定目录...',
    'zh-TW': '下載到指定目錄...',
  },
  'notify.downloadToUnavailable': {
    'af-ZA': 'Kon nie die vouerkieser open nie (remote-module nie beskikbaar nie).',
    'bg-BG': 'Не може да се отвори изборът на папка (remote модулът не е наличен).',
    'cs-CZ': 'Nelze otevřít výběr složky (modul remote není dostupný).',
    'da-DK': 'Mappevælgeren kunne ikke åbnes (remote-modulet er ikke tilgængeligt).',
    'de-DE': 'Ordnerauswahl konnte nicht geöffnet werden (remote-Modul nicht verfügbar).',
    'en-GB': 'Cannot open the folder picker (remote module unavailable).',
    'en-US': 'Cannot open the folder picker (remote module unavailable).',
    'es-ES': 'No se puede abrir el selector de carpeta (módulo remote no disponible).',
    'fr-FR': 'Impossible d\'ouvrir le sélecteur de dossier (module remote indisponible).',
    'hr-HR': 'Nije moguće otvoriti odabir mape (remote modul nije dostupan).',
    'id-ID': 'Tidak dapat membuka pemilih folder (modul remote tidak tersedia).',
    'it-IT': 'Impossibile aprire la selezione cartella (modulo remote non disponibile).',
    'ja-JP': 'フォルダー選択を開けません（remote モジュールが利用できません）。',
    'ko-KR': '폴더 선택 창을 열 수 없습니다 (remote 모듈을 사용할 수 없음).',
    'pl-PL': 'Nie można otworzyć wyboru folderu (moduł remote niedostępny).',
    'pt-BR': 'Não foi possível abrir o seletor de pasta (módulo remote indisponível).',
    'pt-PT': 'Não foi possível abrir o seletor de pasta (módulo remote indisponível).',
    'ru-RU': 'Не удалось открыть выбор папки (модуль remote недоступен).',
    'sr-Latn': 'Nije moguće otvoriti izbor fascikle (remote modul nije dostupan).',
    'sv-SE': 'Kunde inte öppna mappväljaren (remote-modulen är otillgänglig).',
    'tr-TR': 'Klasör seçici açılamadı (remote modülü kullanılamıyor).',
    'uk-UA': 'Не вдалося відкрити вибір папки (модуль remote недоступний).',
    'zh-CN': '无法打开系统目录选择框（remote 模块不可用）',
    'zh-TW': '無法開啟系統目錄選擇框（remote 模組不可用）',
  },
}

let totalAdded = 0
let totalUpdated = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const added = []
  let updated = 0
  for (const [key, table] of Object.entries(T)) {
    const text = table[locale]
    if (!text) { console.error('FATAL: missing locale:', locale, key); process.exit(1) }
    if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale, key); process.exit(1) }
    const marker = `msgid "${key}"`
    const i = raw.indexOf(marker)
    if (i >= 0) {
      // 已存在：只替换紧跟其后的单行 msgstr。禁止整文件重写/规范化空行，否则 diff 会爆。
      const nl = raw.indexOf('\n', i)
      if (nl < 0) { console.error('FATAL: no newline after msgid:', locale, key); process.exit(1) }
      const lineStart = nl + 1
      const m = /^msgstr "[^"]*"/.exec(raw.slice(lineStart))
      if (!m) { console.error('FATAL: expected single-line msgstr:', locale, key); process.exit(1) }
      const next = `msgstr "${text}"`
      if (m[0] !== next) {
        raw = raw.slice(0, lineStart) + next + raw.slice(lineStart + m[0].length)
        updated++
      }
      continue
    }
    added.push([`msgid "${key}"`, `msgstr "${text}"`, ''].join(eol))
  }
  if (!added.length && !updated) continue
  if (added.length) {
    const body = raw.replace(/(?:\r?\n)+$/, '')
    raw = body + eol + eol + added.join(eol)
  }
  fs.writeFileSync(fp, raw, 'utf8')
  totalAdded += added.length
  totalUpdated += updated
}
console.log(`Done. totalAdded=${totalAdded} totalUpdated=${totalUpdated}`)

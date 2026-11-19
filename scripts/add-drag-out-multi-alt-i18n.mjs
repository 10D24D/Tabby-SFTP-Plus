#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 `notify.dragOutMultiAltHint`
 *   场景：Chromium 的 DownloadURL 一次拖拽只能落一个文件，多选默认打成一个 ZIP；
 *         若用户想要「松手目录里直接出现 N 个独立文件」，需按住 Alt 走主进程
 *         CF_HDROP（webContents.startDrag({files})）。此处把该手势显式告知用户。
 * 用法：node scripts/add-drag-out-multi-alt-i18n.mjs
 * 说明：已存在则跳过（幂等）；条目追加到文件末尾，保持原文件的换行符（CRLF/LF）不被改写。
 *   ⚠ 文案中禁止出现半角双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEY = 'notify.dragOutMultiAltHint'
const T = {
  'af-ZA': 'Hou Alt in terwyl jy sleep om {count} aparte lêers in plaas van een ZIP te laat val.',
  'bg-BG': 'Задръжте Alt при влачене, за да пуснете {count} отделни файла вместо един ZIP.',
  'cs-CZ': 'Při přetažení podržte Alt a místo jednoho ZIPu uložíte {count} samostatných souborů.',
  'da-DK': 'Hold Alt nede under træk for at slippe {count} separate filer i stedet for én ZIP.',
  'de-DE': 'Halte beim Ziehen Alt gedrückt, um {count} einzelne Dateien statt einer ZIP abzulegen.',
  'en-GB': 'Hold Alt while dragging to drop {count} separate files instead of one ZIP.',
  'en-US': 'Hold Alt while dragging to drop {count} separate files instead of one ZIP.',
  'es-ES': 'Mantén Alt al arrastrar para soltar {count} archivos separados en lugar de un ZIP.',
  'fr-FR': "Maintenez Alt pendant le glisser pour déposer {count} fichiers séparés au lieu d'un ZIP.",
  'hr-HR': 'Držite Alt tijekom povlačenja da biste ispustili {count} zasebnih datoteka umjesto jednog ZIP-a.',
  'id-ID': 'Tahan Alt saat menyeret untuk menjatuhkan {count} berkas terpisah, bukan satu ZIP.',
  'it-IT': 'Tieni premuto Alt durante il trascinamento per rilasciare {count} file separati invece di uno ZIP.',
  'ja-JP': 'Alt を押しながらドラッグすると、ZIP ではなく {count} 個の個別ファイルをそのまま配置できます。',
  'ko-KR': 'Alt 키를 누른 채 끌어다 놓으면 ZIP 대신 {count}개의 개별 파일이 바로 생성됩니다.',
  'pl-PL': 'Przytrzymaj Alt podczas przeciągania, aby upuścić {count} osobnych plików zamiast jednego ZIP.',
  'pt-BR': 'Mantenha Alt ao arrastar para soltar {count} arquivos separados em vez de um ZIP.',
  'pt-PT': 'Mantenha Alt premido ao arrastar para largar {count} ficheiros separados em vez de um ZIP.',
  'ru-RU': 'Удерживайте Alt при перетаскивании, чтобы разместить {count} отдельных файлов вместо одного ZIP.',
  'sr-Latn': 'Držite Alt tokom prevlačenja da biste spustili {count} odvojenih fajlova umesto jednog ZIP-a.',
  'sv-SE': 'Håll Alt nedtryckt medan du drar för att släppa {count} separata filer i stället för en ZIP.',
  'tr-TR': 'Sürüklerken Alt tuşunu basılı tutarak tek ZIP yerine {count} ayrı dosya bırakabilirsiniz.',
  'uk-UA': 'Утримуйте Alt під час перетягування, щоб розмістити {count} окремих файлів замість одного ZIP.',
  'zh-CN': '按住 Alt 拖拽可直接落下 {count} 个独立文件（不打包 ZIP）',
  'zh-TW': '按住 Alt 拖曳可直接放下 {count} 個獨立檔案（不打包 ZIP）',
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

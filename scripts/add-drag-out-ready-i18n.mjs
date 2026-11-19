#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 `notify.dragOutReady`
 *   场景：远程文件 Alt+拖出时需先下载，下载完成时用户已松手 ⇒ 提示「再拖一次」（文件已缓存，第二次秒出）。
 * 用法：node scripts/add-drag-out-ready-i18n.mjs
 * 说明：已存在则跳过（幂等）；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEY = 'notify.dragOutReady'
const T = {
  'af-ZA': 'Lêer is gereed — hou Alt en sleep weer',
  'bg-BG': 'Файлът е готов — задръжте Alt и плъзнете отново',
  'cs-CZ': 'Soubor je připraven — podržte Alt a přetáhněte znovu',
  'da-DK': 'Filen er klar — hold Alt nede og træk igen',
  'de-DE': 'Datei ist bereit — Alt gedrückt halten und erneut ziehen',
  'en-GB': 'File is ready — hold Alt and drag again',
  'en-US': 'File is ready — hold Alt and drag again',
  'es-ES': 'El archivo está listo: mantén Alt y arrastra de nuevo',
  'fr-FR': 'Le fichier est prêt : maintenez Alt et glissez à nouveau',
  'hr-HR': 'Datoteka je spremna — držite Alt i ponovno povucite',
  'id-ID': 'Berkas siap — tahan Alt dan seret lagi',
  'it-IT': 'File pronto: tieni premuto Alt e trascina di nuovo',
  'ja-JP': 'ファイルの準備ができました。Alt キーを押しながらもう一度ドラッグしてください',
  'ko-KR': '파일 준비 완료 — Alt 키를 누른 채 다시 끌어 주세요',
  'pl-PL': 'Plik jest gotowy — przytrzymaj Alt i przeciągnij ponownie',
  'pt-BR': 'Arquivo pronto — segure Alt e arraste novamente',
  'pt-PT': 'Ficheiro pronto — mantenha Alt e arraste novamente',
  'ru-RU': 'Файл готов — удерживайте Alt и перетащите снова',
  'sr-Latn': 'Datoteka je spremna — držite Alt i ponovo prevucite',
  'sv-SE': 'Filen är klar — håll ned Alt och dra igen',
  'tr-TR': 'Dosya hazır — Alt tuşunu basılı tutup yeniden sürükleyin',
  'uk-UA': 'Файл готовий — утримуйте Alt і перетягніть ще раз',
  'zh-CN': '文件已准备好，按住 Alt 再拖一次即可',
  'zh-TW': '檔案已準備好，按住 Alt 再拖曳一次即可',
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }
  if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale); process.exit(1) }
  if (raw.includes(`msgid "${KEY}"`)) continue
  raw = raw.replace(/\s*$/, '\n\n') + `msgid "${KEY}"\nmsgstr "${text}"\n\n`
  fs.writeFileSync(fp, raw, 'utf8')
  totalAdded++
}
console.log(`Done. totalAdded=${totalAdded}`)

#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「右键取消拖拽」的提示文案
 *   notify.dragCanceled   拖拽已被右键取消，松开鼠标即可
 * 创建人：DD1024z
 * 创建时间：2026-11-19
 * 用法：node scripts/add-drag-cancel-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['notify.dragCanceled']

const T = {
  'notify.dragCanceled': {
    'af-ZA': 'Sleep is gekanselleer; laat net die muisknop los',
    'bg-BG': 'Плъзгането е отменено; просто отпуснете бутона на мишката',
    'cs-CZ': 'Přetahování zrušeno; stačí uvolnit tlačítko myši',
    'da-DK': 'Trækket er annulleret; slip blot museknappen',
    'de-DE': 'Ziehen abgebrochen; Maustaste einfach loslassen',
    'en-GB': 'Drag cancelled; just release the mouse button',
    'en-US': 'Drag cancelled; just release the mouse button',
    'es-ES': 'Arrastre cancelado; solo suelta el botón del ratón',
    'fr-FR': 'Glisser annulé ; il suffit de relâcher le bouton de la souris',
    'hr-HR': 'Povlačenje je otkazano; samo otpustite tipku miša',
    'id-ID': 'Seret dibatalkan; cukup lepaskan tombol mouse',
    'it-IT': 'Trascinamento annullato; basta rilasciare il pulsante del mouse',
    'ja-JP': 'ドラッグをキャンセルしました。マウスボタンを離してください',
    'ko-KR': '드래그가 취소되었습니다. 마우스 버튼을 놓으면 됩니다',
    'pl-PL': 'Przeciąganie anulowane; wystarczy zwolnić przycisk myszy',
    'pt-BR': 'Arrasto cancelado; basta soltar o botão do mouse',
    'pt-PT': 'Arrasto cancelado; basta largar o botão do rato',
    'ru-RU': 'Перетаскивание отменено; просто отпустите кнопку мыши',
    'sr-Latn': 'Prevlačenje je otkazano; samo otpustite dugme miša',
    'sv-SE': 'Draget avbröts; släpp bara musknappen',
    'tr-TR': 'Sürükleme iptal edildi; fare düğmesini bırakmanız yeterli',
    'uk-UA': 'Перетягування скасовано; просто відпустіть кнопку миші',
    'zh-CN': '已取消拖拽，松开鼠标即可',
    'zh-TW': '已取消拖曳，放開滑鼠即可',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  let added = 0
  for (const key of KEYS) {
    const text = T[key] && T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue  // 已存在则跳过（幂等）
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)

#!/usr/bin/env node
/**
 * 一次性补丁脚本：把 24 种语言的 `bookmark.pinHint` 改写为「常驻后点其它位置也不关闭」的口径
 *   （2026-10-23 图钉语义扩展：常驻 = 点外部 / 滚轮 / 右键 / 框选 / 窗口缩放都不关，
 *     只有「关闭」按钮、再点一次 ★ 按钮、Esc 才关）
 * 用法：node scripts/update-bookmark-pin-hint-i18n.mjs
 *
 * 注：本脚本做的是**原地替换 msgstr 单行**（不新增 key、不动 msgid 顺序）。
 *   若某语言的 msgid 不存在或 msgstr 不是单行，直接报错退出，避免静默改错文件。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-23
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')
const KEY = 'bookmark.pinHint'

const T = {
  'af-ZA': 'Klik om te wissel: bly oop (klik elders sluit nie) / maak toe na keuse',
  'bg-BG': 'Щракнете за превключване: остава отворен (клик другаде не затваря) / затваря при избор',
  'cs-CZ': 'Kliknutím přepnete: zůstane otevřený (klik jinde nezavře) / zavřít po výběru',
  'da-DK': 'Klik for at skifte: forbliv åben (klik andre steder lukker ikke) / luk ved valg',
  'de-DE': 'Klicken zum Umschalten: bleibt offen (Klick woanders schließt nicht) / nach Auswahl schließen',
  'en-GB': 'Click to toggle: stay open (clicking elsewhere will not close it) / close on select',
  'en-US': 'Click to toggle: stay open (clicking elsewhere will not close it) / close on select',
  'es-ES': 'Clic para alternar: siempre abierto (un clic fuera no lo cierra) / cerrar al seleccionar',
  'fr-FR': 'Cliquer pour basculer : rester ouvert (un clic ailleurs ne ferme pas) / fermer après sélection',
  'hr-HR': 'Kliknite za prebacivanje: ostaje otvoreno (klik drugdje ne zatvara) / zatvori nakon odabira',
  'id-ID': 'Klik untuk beralih: tetap terbuka (klik di luar tidak menutup) / tutup setelah memilih',
  'it-IT': 'Clic per alternare: resta aperto (un clic altrove non chiude) / chiudi dopo la selezione',
  'ja-JP': 'クリックで切り替え：常時表示（外側をクリックしても閉じません）／選択後に閉じる',
  'ko-KR': '클릭하여 전환: 항상 열기(바깥을 클릭해도 닫히지 않음) / 선택 후 닫기',
  'pl-PL': 'Kliknij, aby przełączyć: pozostaje otwarty (kliknięcie obok nie zamyka) / zamknij po wybraniu',
  'pt-BR': 'Clique para alternar: sempre aberto (clique fora não fecha) / fechar ao selecionar',
  'pt-PT': 'Clique para alternar: sempre aberto (clique fora não fecha) / fechar ao selecionar',
  'ru-RU': 'Нажмите для переключения: остаётся открытой (клик вне не закрывает) / закрывать после выбора',
  'sr-Latn': 'Kliknite za prebacivanje: ostaje otvoren (klik drugde ne zatvara) / zatvori nakon izbora',
  'sv-SE': 'Klicka för att växla: förblir öppen (klick utanför stänger inte) / stäng vid val',
  'tr-TR': 'Değiştirmek için tıklayın: açık kalır (dışına tıklamak kapatmaz) / seçimden sonra kapat',
  'uk-UA': 'Натисніть, щоб перемкнути: залишається відкритою (клік поза не закриває) / закривати після вибору',
  'zh-CN': '点击切换：常驻（点其它位置不关闭）/ 选中后关闭',
  'zh-TW': '點擊切換：常駐（點其它位置不關閉）/ 選取後關閉',
}

let patched = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const text = T[locale]
  if (!text) { console.error('FATAL: unknown locale:', file); process.exit(1) }
  if (text.includes('"')) { console.error('FATAL: double quote in translation:', locale); process.exit(1) }
  const fp = path.join(localeDir, file)
  const raw = fs.readFileSync(fp, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(eol)
  const at = lines.indexOf(`msgid "${KEY}"`)
  if (at < 0) { console.error('FATAL: msgid not found:', file, KEY); process.exit(1) }
  if (!lines[at + 1]?.startsWith('msgstr "')) {
    console.error('FATAL: msgstr is not a single line:', file, KEY)
    process.exit(1)
  }
  lines[at + 1] = `msgstr "${text}"`
  fs.writeFileSync(fp, lines.join(eol), 'utf8')
  patched++
}
console.log(`Done. patched=${patched}`)

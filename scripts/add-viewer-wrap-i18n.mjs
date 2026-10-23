#!/usr/bin/env node
/**
 * 功能描述：24 语言 .po 的「查看器/编辑器 自动换行 + 行号开关」文案迁移
 *   新增：
 *     settings.showTextWordWrap        设置页「查看与编辑」小节的开关标签
 *     settings.showTextWordWrapHint    该开关 tooltip
 *     viewer.wordWrap                  查看器/编辑器底部开关的短标签：自动换行
 *     viewer.lineNumbers               查看器/编辑器底部开关的短标签：行号
 *     viewer.lineNumbersOffByWrap      编辑器里「行号」开关在换行开启时的禁用提示
 * 背景：查看器此前把长行以 text-overflow:ellipsis 硬截断，且横向永远滚不动
 *   （.file-dialog-vs-window 是 left:0;right:0），长行内容根本读不到。
 *   修掉截断后顺带把「自动换行」做成可切换项，并复用设置页已有的行号开关口径，
 *   故这里只补短标签与禁用提示；行号的设置页标签沿用既有的 settings.showTextLineNumbers。
 * 用法：node scripts/add-viewer-wrap-i18n.mjs
 * 说明：幂等 —— 新 key 已存在则跳过；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-10-08
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const NEW_KEYS = [
  'settings.showTextWordWrap',
  'settings.showTextWordWrapHint',
  'viewer.wordWrap',
  'viewer.lineNumbers',
  'viewer.lineNumbersOffByWrap',
]

const T = {
  'settings.showTextWordWrap': {
    'af-ZA': 'Woordomvou (kyker/redigeerder)',
    'bg-BG': 'Пренасяне на редове (преглед/редактор)',
    'cs-CZ': 'Zalamování řádků (prohlížeč/editor)',
    'da-DK': 'Tekstombrydning (viser/editor)',
    'de-DE': 'Zeilenumbruch in Ansicht/Editor',
    'en-GB': 'Viewer/editor word wrap',
    'en-US': 'Viewer/editor word wrap',
    'es-ES': 'Ajuste de línea (visor/editor)',
    'fr-FR': 'Retour à la ligne (visionneuse/éditeur)',
    'hr-HR': 'Prijelom retka (preglednik/uređivač)',
    'id-ID': 'Bungkus baris (penampil/editor)',
    'it-IT': 'A capo automatico (visualizzatore/editor)',
    'ja-JP': 'ビューア/エディタの折り返し',
    'ko-KR': '뷰어/편집기 자동 줄 바꿈',
    'pl-PL': 'Zawijanie wierszy (podgląd/edytor)',
    'pt-BR': 'Quebra de linha (visualizador/editor)',
    'pt-PT': 'Quebra de linha (visualizador/editor)',
    'ru-RU': 'Перенос строк (просмотр/редактор)',
    'sr-Latn': 'Prelamanje redova (pregledač/uređivač)',
    'sv-SE': 'Radbrytning (visare/redigerare)',
    'tr-TR': 'Sözcük kaydırma (görüntüleyici/düzenleyici)',
    'uk-UA': 'Перенесення рядків (перегляд/редактор)',
    'zh-CN': '查看编辑器自动换行',
    'zh-TW': '檢視編輯器自動換行',
  },
  'settings.showTextWordWrapHint': {
    'af-ZA': 'Vou lang reëls in die kyker en redigeerder eerder as om horisontaal te rol.',
    'bg-BG': 'Пренася дълги редове в прегледа и редактора вместо хоризонтално превъртане.',
    'cs-CZ': 'Zalamovat dlouhé řádky v prohlížeči a editoru místo vodorovného posouvání.',
    'da-DK': 'Ombrud af lange linjer i viseren og editoren i stedet for vandret rulning.',
    'de-DE': 'Lange Zeilen in Ansicht und Editor umbrechen statt horizontal zu scrollen.',
    'en-GB': 'Wrap long lines in the built-in viewer and editor instead of scrolling horizontally.',
    'en-US': 'Wrap long lines in the built-in viewer and editor instead of scrolling horizontally.',
    'es-ES': 'Ajusta las líneas largas en el visor y el editor en lugar de desplazarse en horizontal.',
    'fr-FR': "Renvoyer à la ligne dans la visionneuse et l'éditeur au lieu de défiler horizontalement.",
    'hr-HR': 'Prijelomi duge retke u pregledniku i uređivaču umjesto vodoravnog pomicanja.',
    'id-ID': 'Bungkus baris panjang di penampil dan editor alih-alih menggulir mendatar.',
    'it-IT': "Manda a capo le righe lunghe nel visualizzatore e nell'editor invece di scorrere in orizzontale.",
    'ja-JP': 'ビューアとエディタで長い行を折り返して表示し、横スクロールを不要にします。',
    'ko-KR': '뷰어와 편집기에서 긴 줄을 자동으로 줄 바꿈해 가로 스크롤을 없앱니다.',
    'pl-PL': 'Zawijaj długie wiersze w podglądzie i edytorze zamiast przewijać w poziomie.',
    'pt-BR': 'Quebra linhas longas no visualizador e editor em vez de rolar na horizontal.',
    'pt-PT': 'Quebra linhas longas no visualizador e editor em vez de rolar na horizontal.',
    'ru-RU': 'Переносить длинные строки в просмотрщике и редакторе вместо горизонтальной прокрутки.',
    'sr-Latn': 'Prelomi duge redove u pregledaču i uređivaču umesto vodoravnog pomeranja.',
    'sv-SE': 'Radbryt långa rader i visaren och redigeraren i stället för vågrät rullning.',
    'tr-TR': 'Uzun satırları görüntüleyici ve düzenleyicide yatay kaydırma yerine kaydırır.',
    'uk-UA': 'Переносити довгі рядки в переглядачі та редакторі замість горизонтального прокручування.',
    'zh-CN': '长行在内置查看器与编辑器中自动折行显示，不再横向滚动。',
    'zh-TW': '長行在內建檢視器與編輯器中自動折行顯示，不再橫向捲動。',
  },
  'viewer.wordWrap': {
    'af-ZA': 'Vou', 'bg-BG': 'Пренасяне', 'cs-CZ': 'Zalamovat', 'da-DK': 'Ombryd',
    'de-DE': 'Umbruch', 'en-GB': 'Wrap', 'en-US': 'Wrap', 'es-ES': 'Ajustar',
    'fr-FR': 'Retour à la ligne', 'hr-HR': 'Prijelom', 'id-ID': 'Bungkus',
    'it-IT': 'A capo', 'ja-JP': '折り返し', 'ko-KR': '자동 줄 바꿈', 'pl-PL': 'Zawijaj',
    'pt-BR': 'Quebrar', 'pt-PT': 'Quebrar', 'ru-RU': 'Перенос', 'sr-Latn': 'Prelom',
    'sv-SE': 'Radbryt', 'tr-TR': 'Kaydır', 'uk-UA': 'Перенос',
    'zh-CN': '自动换行', 'zh-TW': '自動換行',
  },
  'viewer.lineNumbers': {
    'af-ZA': 'Lynnommers', 'bg-BG': 'Номера на редове', 'cs-CZ': 'Čísla řádků', 'da-DK': 'Linjenumre',
    'de-DE': 'Zeilennummern', 'en-GB': 'Line numbers', 'en-US': 'Line numbers',
    'es-ES': 'Números de línea', 'fr-FR': 'Numéros de ligne', 'hr-HR': 'Brojevi redaka',
    'id-ID': 'Nomor baris', 'it-IT': 'Numeri di riga', 'ja-JP': '行番号', 'ko-KR': '줄 번호',
    'pl-PL': 'Numery wierszy', 'pt-BR': 'Números de linha', 'pt-PT': 'Números de linha',
    'ru-RU': 'Номера строк', 'sr-Latn': 'Brojevi redova', 'sv-SE': 'Radnummer',
    'tr-TR': 'Satır numaraları', 'uk-UA': 'Номери рядків',
    'zh-CN': '行号', 'zh-TW': '行號',
  },
  'viewer.lineNumbersOffByWrap': {
    'af-ZA': 'Lynnommers is nie beskikbaar wanneer vou aan is nie',
    'bg-BG': 'Номерата на редовете не са налични при включено пренасяне',
    'cs-CZ': 'Čísla řádků nejsou při zalamování dostupná',
    'da-DK': 'Linjenumre er utilgængelige, når ombrydning er slået til',
    'de-DE': 'Zeilennummern sind bei aktivem Umbruch nicht verfügbar',
    'en-GB': 'Line numbers are hidden while word wrap is on',
    'en-US': 'Line numbers are hidden while word wrap is on',
    'es-ES': 'Los números de línea se ocultan con el ajuste de línea activado',
    'fr-FR': "Les numéros de ligne sont masqués quand le retour à la ligne est actif",
    'hr-HR': 'Brojevi redaka su skriveni dok je prijelom uključen',
    'id-ID': 'Nomor baris disembunyikan saat bungkus baris aktif',
    'it-IT': "I numeri di riga sono nascosti con l'andata a capo attiva",
    'ja-JP': '折り返し中は行番号を表示できません',
    'ko-KR': '자동 줄 바꿈 중에는 줄 번호가 숨겨집니다',
    'pl-PL': 'Numery wierszy są ukryte przy włączonym zawijaniu',
    'pt-BR': 'Os números de linha ficam ocultos com a quebra de linha ativada',
    'pt-PT': 'Os números de linha ficam ocultos com a quebra de linha ativada',
    'ru-RU': 'Номера строк скрыты при включённом переносе',
    'sr-Latn': 'Brojevi redova su skriveni dok je prelamanje uključeno',
    'sv-SE': 'Radnummer döljs när radbrytning är på',
    'tr-TR': 'Sözcük kaydırma açıkken satır numaraları gizlenir',
    'uk-UA': 'Номери рядків приховано, коли увімкнено перенесення',
    'zh-CN': '自动换行开启时行号不可用（折行后无法与逻辑行对齐）',
    'zh-TW': '自動換行開啟時行號不可用（折行後無法與邏輯行對齊）',
  },
}

const esc = k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasKey = (text, key) => new RegExp(`(?:^|\\n)msgid "${esc(key)}"`).test(text)

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let added = 0, skipped = 0
const missingLocale = []

for (const file of files) {
  const loc = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let text = fs.readFileSync(full, 'utf8')
  const before = text

  const additions = []
  for (const key of NEW_KEYS) {
    if (hasKey(text, key)) { skipped++; continue }
    const msg = (T[key] || {})[loc]
    if (!msg) { missingLocale.push(`${loc}:${key}`); continue }
    if (msg.includes('"')) throw new Error(`译文含双引号，破坏 po 语法：${loc} ${key}`)
    additions.push(`msgid "${key}"\nmsgstr "${msg}"\n`)
    added++
  }
  if (additions.length) {
    if (!text.endsWith('\n')) text += '\n'
    text += additions.join('')
  }
  if (text !== before) fs.writeFileSync(full, text)
}

console.log(`新增条目 ${added}，跳过已存在 ${skipped}`)
if (missingLocale.length) {
  console.log('缺少译文的语言:', missingLocale.join(', '))
  process.exitCode = 1
}

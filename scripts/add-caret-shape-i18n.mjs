#!/usr/bin/env node
/**
 * 功能描述：24 语言 .po 的「光标形状」文案迁移
 *   新增：
 *     settings.textCaretShape         设置页「查看与编辑」小节的行标签
 *     settings.textCaretShapeHint     该行 tooltip
 *     settings.caretShapeBlock        按钮 title：方块（█）
 *     settings.caretShapeBeam         按钮 title：竖线（|）
 *     settings.caretShapeUnderline    按钮 title：下划线（▁）
 *   删除（已无任何引用）：
 *     settings.textCaretWidth / settings.textCaretWidthHint
 * 背景：查看器自绘光标由「宽度 1–4px 滑块」改为「形状三档」（block/beam/underline），
 *   取值与 Tabby 终端 store.terminal.cursor 逐字一致，设置页字形也照宿主外观页的 █ | ▁ 来写。
 *   术语沿用旧条目（如 de 的 Caret-、ja 的 キャレット、zh 的「光标/游標」）以免同一功能出现两套译法。
 * 用法：node scripts/add-caret-shape-i18n.mjs
 * 说明：幂等 —— 新 key 已存在则跳过，旧 key 缺失也不报错；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const NEW_KEYS = [
  'settings.textCaretShape',
  'settings.textCaretShapeHint',
  'settings.caretShapeBlock',
  'settings.caretShapeBeam',
  'settings.caretShapeUnderline',
]
const DEAD_KEYS = ['settings.textCaretWidth', 'settings.textCaretWidthHint']

const T = {
  'settings.textCaretShape': {
    'af-ZA': 'Wyservorm (kyker/redigeerder)',
    'bg-BG': 'Форма на курсора (преглед/редактор)',
    'cs-CZ': 'Tvar kurzoru (prohlížeč/editor)',
    'da-DK': 'Markørform (viser/editor)',
    'de-DE': 'Caret-Form in Ansicht/Editor',
    'en-GB': 'Viewer/editor caret shape',
    'en-US': 'Viewer/editor caret shape',
    'es-ES': 'Forma del cursor (visor/editor)',
    'fr-FR': 'Forme du curseur (visionneuse/éditeur)',
    'hr-HR': 'Oblik kursora (preglednik/uređivač)',
    'id-ID': 'Bentuk kursor (penampil/editor)',
    'it-IT': 'Forma del cursore (visualizzatore/editor)',
    'ja-JP': 'ビューア/エディタのキャレット形状',
    'ko-KR': '뷰어/편집기 캐럿 모양',
    'pl-PL': 'Kształt kursora (podgląd/edytor)',
    'pt-BR': 'Forma do cursor (visualizador/editor)',
    'pt-PT': 'Forma do cursor (visualizador/editor)',
    'ru-RU': 'Форма курсора (просмотр/редактор)',
    'sr-Latn': 'Oblik kursora (pregledač/uređivač)',
    'sv-SE': 'Markörform (visare/redigerare)',
    'tr-TR': 'İmleç şekli (görüntüleyici/düzenleyici)',
    'uk-UA': 'Форма курсора (перегляд/редактор)',
    'zh-CN': '查看编辑器光标形状',
    'zh-TW': '檢視編輯器游標形狀',
  },
  'settings.textCaretShapeHint': {
    'af-ZA': 'Vorm van die wyser wat in die kyker geteken word. Die drie opsies stem ooreen met die kursor van die Tabby-terminaal. Die redigeerder gebruik die stelselwyser.',
    'bg-BG': 'Форма на курсора, рисуван в прегледа. Трите опции отговарят на курсора в терминала на Tabby. Редакторът използва системния курсор.',
    'cs-CZ': 'Tvar kurzoru vykreslovaného v prohlížeči. Tři volby odpovídají kurzoru terminálu Tabby. Editor používá systémový kurzor.',
    'da-DK': 'Formen af den markør, der tegnes i viseren. De tre valg svarer til markøren i Tabby-terminalen. Editoren bruger systemmarkøren.',
    'de-DE': 'Form des in der Ansicht gezeichneten Carets. Die drei Optionen entsprechen dem Cursor des Tabby-Terminals. Der Editor nutzt den System-Caret.',
    'en-GB': 'Shape of the caret drawn in the viewer. The three options mirror the cursor of the Tabby terminal. The editor uses the system caret.',
    'en-US': 'Shape of the caret drawn in the viewer. The three options mirror the cursor of the Tabby terminal. The editor uses the system caret.',
    'es-ES': 'Forma del cursor que se dibuja en el visor. Las tres opciones imitan el cursor del terminal de Tabby. El editor usa el cursor del sistema.',
    'fr-FR': 'Forme du curseur dessiné dans la visionneuse. Les trois options reprennent le curseur du terminal Tabby. L éditeur utilise le curseur système.',
    'hr-HR': 'Oblik kursora koji se crta u pregledniku. Tri opcije odgovaraju kursoru terminala Tabby. Uređivač koristi sistemski kursor.',
    'id-ID': 'Bentuk kursor yang digambar di penampil. Tiga opsi mengikuti kursor terminal Tabby. Editor memakai kursor sistem.',
    'it-IT': 'Forma del cursore disegnato nel visualizzatore. Le tre opzioni riprendono il cursore del terminale Tabby. L editor usa il cursore di sistema.',
    'ja-JP': 'ビューアに描画されるキャレットの形状です。3 つの選択肢は Tabby ターミナルのカーソルに対応します。エディタはシステムのキャレットを使用します。',
    'ko-KR': '뷰어에 그려지는 캐럿의 모양입니다. 세 가지 옵션은 Tabby 터미널의 커서와 같습니다. 편집기는 시스템 캐럿을 사용합니다.',
    'pl-PL': 'Kształt kursora rysowanego w podglądzie. Trzy opcje odpowiadają kursorowi terminala Tabby. Edytor używa kursora systemowego.',
    'pt-BR': 'Forma do cursor desenhado no visualizador. As três opções seguem o cursor do terminal do Tabby. O editor usa o cursor do sistema.',
    'pt-PT': 'Forma do cursor desenhado no visualizador. As três opções seguem o cursor do terminal do Tabby. O editor usa o cursor do sistema.',
    'ru-RU': 'Форма курсора, отрисовываемого в просмотре. Три варианта соответствуют курсору терминала Tabby. В редакторе используется системный курсор.',
    'sr-Latn': 'Oblik kursora koji se crta u pregledaču. Tri opcije odgovaraju kursoru terminala Tabby. Uređivač koristi sistemski kursor.',
    'sv-SE': 'Formen på markören som ritas i visaren. De tre valen motsvarar markören i Tabby-terminalen. Redigeraren använder systemmarkören.',
    'tr-TR': 'Görüntüleyicide çizilen imlecin şekli. Üç seçenek Tabby terminal imlecini yansıtır. Düzenleyici sistem imlecini kullanır.',
    'uk-UA': 'Форма курсора, що малюється в перегляді. Три варіанти відповідають курсору термінала Tabby. У редакторі використовується системний курсор.',
    'zh-CN': '查看器中绘制的插入光标形状。三档与 Tabby 终端的光标形状一致。编辑器使用系统原生光标。',
    'zh-TW': '檢視器中繪製的插入游標形狀。三檔與 Tabby 終端機的游標形狀一致。編輯器使用系統原生游標。',
  },
  'settings.caretShapeBlock': {
    'af-ZA': 'Blok', 'bg-BG': 'Блок', 'cs-CZ': 'Blok', 'da-DK': 'Blok', 'de-DE': 'Block',
    'en-GB': 'Block', 'en-US': 'Block', 'es-ES': 'Bloque', 'fr-FR': 'Bloc', 'hr-HR': 'Blok',
    'id-ID': 'Blok', 'it-IT': 'Blocco', 'ja-JP': 'ブロック', 'ko-KR': '블록', 'pl-PL': 'Blok',
    'pt-BR': 'Bloco', 'pt-PT': 'Bloco', 'ru-RU': 'Блок', 'sr-Latn': 'Blok', 'sv-SE': 'Block',
    'tr-TR': 'Blok', 'uk-UA': 'Блок', 'zh-CN': '方块', 'zh-TW': '方塊',
  },
  'settings.caretShapeBeam': {
    'af-ZA': 'Vertikale streep', 'bg-BG': 'Вертикална линия', 'cs-CZ': 'Svislá čára',
    'da-DK': 'Lodret streg', 'de-DE': 'Senkrechter Strich', 'en-GB': 'Vertical bar',
    'en-US': 'Vertical bar', 'es-ES': 'Barra vertical', 'fr-FR': 'Barre verticale',
    'hr-HR': 'Okomita crta', 'id-ID': 'Garis vertikal', 'it-IT': 'Barra verticale',
    'ja-JP': '縦線', 'ko-KR': '세로줄', 'pl-PL': 'Pionowa kreska', 'pt-BR': 'Barra vertical',
    'pt-PT': 'Barra vertical', 'ru-RU': 'Вертикальная линия', 'sr-Latn': 'Vertikalna crta',
    'sv-SE': 'Lodrät streck', 'tr-TR': 'Dikey çizgi', 'uk-UA': 'Вертикальна лінія',
    'zh-CN': '竖线', 'zh-TW': '直線',
  },
  'settings.caretShapeUnderline': {
    'af-ZA': 'Onderstreep', 'bg-BG': 'Подчертаване', 'cs-CZ': 'Podtržení', 'da-DK': 'Understregning',
    'de-DE': 'Unterstrich', 'en-GB': 'Underline', 'en-US': 'Underline', 'es-ES': 'Subrayado',
    'fr-FR': 'Soulignement', 'hr-HR': 'Donja crta', 'id-ID': 'Garis bawah', 'it-IT': 'Sottolineatura',
    'ja-JP': '下線', 'ko-KR': '밑줄', 'pl-PL': 'Podkreślenie', 'pt-BR': 'Sublinhado',
    'pt-PT': 'Sublinhado', 'ru-RU': 'Подчёркивание', 'sr-Latn': 'Donja crta', 'sv-SE': 'Understrykning',
    'tr-TR': 'Alt çizgi', 'uk-UA': 'Підкреслення', 'zh-CN': '下划线', 'zh-TW': '底線',
  },
}

const esc = k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasKey = (text, key) => new RegExp(`(?:^|\\n)msgid "${esc(key)}"`).test(text)

/** 删除一条 msgid/msgstr 对（含行尾；条目在文件里是紧凑相邻的两行） */
const dropKey = (text, key) =>
  text.replace(new RegExp(`msgid "${esc(key)}"\\r?\\nmsgstr "[^"]*"\\r?\\n?`, 'g'), '')

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let added = 0, removed = 0, skipped = 0
const missingLocale = []

for (const file of files) {
  const loc = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let text = fs.readFileSync(full, 'utf8')
  const before = text

  for (const key of DEAD_KEYS) {
    if (hasKey(text, key)) { text = dropKey(text, key); removed++ }
  }

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

console.log(`新增条目 ${added}，删除旧条目 ${removed}，跳过已存在 ${skipped}`)
if (missingLocale.length) {
  console.log('缺少译文的语言:', missingLocale.join(', '))
  process.exitCode = 1
}

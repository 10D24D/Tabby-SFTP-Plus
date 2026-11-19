#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「分组时列边框开关为何置灰」的悬浮提示
 *   view.colBorderGroupedHint   分组视图下不显示列边框，取消分组后可开启
 * 创建人：DD1024z
 * 创建时间：2026-11-15
 * 用法：node scripts/add-colborder-grouped-hint-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['view.colBorderGroupedHint']

const T = {
  'view.colBorderGroupedHint': {
    'af-ZA': 'Kolrandjies word nie in die gegroepeerde aansig gewys nie; ontgroepeer om dit te aktiveer',
    'bg-BG': 'При групиран изглед рамките на колоните не се показват; премахнете групирането, за да ги включите',
    'cs-CZ': 'V seskupeném zobrazení se sloupce nezobrazují; zrušte seskupení pro zapnutí',
    'da-DK': 'Kollegrænser vises ikke i grupperet visning; fjern grupperingen for at slå det til',
    'de-DE': 'In der gruppierten Ansicht werden keine Spaltenrahmen angezeigt; Gruppierung aufheben, um sie zu aktivieren',
    'en-GB': 'Column borders are hidden in grouped view; ungroup to enable them',
    'en-US': 'Column borders are hidden in grouped view; ungroup to enable them',
    'es-ES': 'Los bordes de columna se ocultan en la vista agrupada; desagrupa para activarlos',
    'fr-FR': 'Les bordures de colonnes sont masquées en vue groupée ; annulez le regroupement pour les activer',
    'hr-HR': 'Obrubi stupaca skriveni su u grupiranom prikazu; poništite grupiranje da biste ih omogućili',
    'id-ID': 'Garis kolom disembunyikan dalam tampilan berkelompok; batalkan pengelompokan untuk mengaktifkannya',
    'it-IT': 'I bordi delle colonne sono nascosti nella vista raggruppata; annulla il raggruppamento per attivarli',
    'ja-JP': 'グループ表示では列の罫線は表示されません。グループ解除すると有効になります',
    'ko-KR': '그룹 보기에서는 열 테두리가 표시되지 않습니다. 그룹 해제 후 사용할 수 있습니다',
    'pl-PL': 'W widoku grupowanym obramowania kolumn są ukryte; usuń grupowanie, aby je włączyć',
    'pt-BR': 'As bordas das colunas ficam ocultas na visualização agrupada; desagrupe para ativá-las',
    'pt-PT': 'As bordas das colunas ficam ocultas na vista agrupada; desagrupe para as ativar',
    'ru-RU': 'В группированном виде границы столбцов скрыты; отмените группировку, чтобы включить их',
    'sr-Latn': 'Ivice kolona su skrivene u grupisanom prikazu; poništite grupisanje da biste ih uključili',
    'sv-SE': 'Kolumnkanter visas inte i grupperad vy; avgruppera för att aktivera dem',
    'tr-TR': 'Gruplanmış görünümde sütun kenarlıkları gizlenir; etkinleştirmek için gruplamayı kaldırın',
    'uk-UA': 'У групованому вигляді межі стовпців приховано; скасуйте групування, щоб увімкнути їх',
    'zh-CN': '分组视图下不显示列边框，取消分组后可开启',
    'zh-TW': '分組檢視下不顯示欄框，取消分組後可開啟',
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

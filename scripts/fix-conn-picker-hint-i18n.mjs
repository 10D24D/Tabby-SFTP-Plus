#!/usr/bin/env node
/**
 * 一次性补丁脚本：改写 settings.connPickerTriggerHint 的文案（24 语言）
 *   —— 唤起入口从「Tabby 终端工具栏的 SFTP+ 标识」纠正为「面板每栏工具栏上的本地/远程标识」。
 * 用法：node scripts/fix-conn-picker-hint-i18n.mjs
 * 说明：只替换该 msgid 紧随的 msgstr 行；其它条目不动（幂等）。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')
const KEY = 'settings.connPickerTriggerHint'

const T = {
  'af-ZA': 'Kies hoe die verbindingsneller oopgemaak word: die titel in die balk of die plaaslik/afgeleë etiket in elke paneel se nutsbalk',
  'bg-BG': 'Изберете как се отваря превключвателят: заглавието в горната лента или етикетът локално/отдалечено в лентата на всеки панел',
  'cs-CZ': 'Zvolte, jak se přepínač připojení otevírá: název v horní liště nebo štítek místní/vzdálený na liště každého panelu',
  'da-DK': 'Vælg hvordan forbindelsesskifteren åbnes: titlen i den øverste bjælke eller lokal/fjern mærket i hvert panels værktøjslinje',
  'de-DE': 'Wählen Sie, wie der Verbindungswechsler geöffnet wird: Titel in der oberen Leiste oder Lokal/Remote-Kennzeichnung in der Werkzeugleiste jedes Bereichs',
  'en-GB': 'Choose how the connection switcher opens: the title in the top bar or the local/remote label in each pane toolbar',
  'en-US': 'Choose how the connection switcher opens: the title in the top bar or the local/remote label in each pane toolbar',
  'es-ES': 'Elige cómo se abre el conmutador de conexiones: el título de la barra superior o la etiqueta local/remoto en la barra de cada panel',
  'fr-FR': 'Choisissez comment ouvrir le sélecteur de connexion: le titre de la barre supérieure ou l\'étiquette local/distant de la barre de chaque panneau',
  'hr-HR': 'Odaberite kako se otvara prebacivač veza: naslov u gornjoj traci ili oznaka lokalno/udaljeno na traci svakog panela',
  'id-ID': 'Pilih cara membuka pengalih koneksi: judul di bilah atas atau label lokal/jarak jauh di bilah setiap panel',
  'it-IT': 'Scegli come aprire il selettore connessioni: il titolo nella barra superiore o l\'etichetta locale/remoto nella barra di ciascun pannello',
  'ja-JP': '接続切り替えを開く方法を選択します。上部バーのタイトル、または各ペインのツールバーにあるローカル/リモートの表示',
  'ko-KR': '연결 전환기를 여는 방법을 선택하세요. 상단 표시줄 제목 또는 각 창 도구 모음의 로컬/원격 표시',
  'pl-PL': 'Wybierz sposób otwierania przełącznika połączeń: tytuł na górnym pasku lub etykieta lokalny/zdalny na pasku każdego panelu',
  'pt-BR': 'Escolha como o seletor de conexões abre: o título da barra superior ou o rótulo local/remoto na barra de cada painel',
  'pt-PT': 'Escolha como o seletor de ligações abre: o título da barra superior ou o rótulo local/remoto na barra de cada painel',
  'ru-RU': 'Выберите, как открывать переключатель подключений: заголовок в верхней панели или метка локально/удалённо на панели каждого раздела',
  'sr-Latn': 'Izaberite kako se otvara prebacivač veza: naslov u gornjoj traci ili oznaka lokalno/udaljeno na traci svakog panela',
  'sv-SE': 'Välj hur anslutningsväxlaren öppnas: titeln i det översta fältet eller lokal/fjärr etiketten i varje panels verktygsfält',
  'tr-TR': 'Bağlantı değiştiricinin nasıl açılacağını seçin: üst çubuktaki başlık veya her bölmenin araç çubuğundaki yerel/uzak etiketi',
  'uk-UA': 'Виберіть, як відкривати перемикач зєднань: заголовок у верхній панелі або позначка локально/віддалено на панелі кожного розділу',
  'zh-CN': '选择连接切换器的弹出方式：面板顶栏的连接标题，或每栏工具栏上的本地/远程标识',
  'zh-TW': '選擇連線切換器的彈出方式：面板頂欄的連線標題，或每欄工具列上的本機/遠端標識',
}

let changed = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }
  if (text.includes('"')) { console.error('FATAL: double quote in text:', locale); process.exit(1) }
  const fp = path.join(localeDir, file)
  const raw = fs.readFileSync(fp, 'utf8')
  const idx = raw.indexOf(`msgid "${KEY}"`)
  if (idx < 0) { console.warn('msgid missing:', file); continue }
  const nextMsgstr = raw.indexOf('\nmsgstr "', idx)
  if (nextMsgstr < 0 || nextMsgstr > idx + KEY.length + 20) { console.warn('msgstr not adjacent:', file); continue }
  const lineEnd = raw.indexOf('\n', nextMsgstr + 1)
  const updated = raw.slice(0, nextMsgstr) + `\nmsgstr "${text}"` + raw.slice(lineEnd)
  if (updated !== raw) { fs.writeFileSync(fp, updated, 'utf8'); changed++ }
}
console.log(`Done. localesChanged=${changed}`)

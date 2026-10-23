#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「连接切换器唤起方式」所需 key
 *   settings.connPickerTrigger       连接切换器唤起方式（设置项标题）
 *   settings.connPickerTriggerHint   说明（tooltip）
 *   settings.connPickerTopbar        顶栏标题（分段按钮）
 *   settings.connPickerBadge         工具栏标识（分段按钮）
 *   settings.connPickerBoth          两者都（分段按钮）
 * 用法：node scripts/add-conn-picker-trigger-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'settings.connPickerTrigger',
  'settings.connPickerTriggerHint',
  'settings.connPickerTopbar',
  'settings.connPickerBadge',
  'settings.connPickerBoth',
]

const T = {
  'settings.connPickerTrigger': {
    'af-ZA': 'Sneller vir verbindingskeuse',
    'bg-BG': 'Извикване на превключвателя за връзки',
    'cs-CZ': 'Spouštění přepínače připojení',
    'da-DK': 'Udløser for forbindelsesskifter',
    'de-DE': 'Auslöser für Verbindungswechsler',
    'en-GB': 'Connection switcher trigger',
    'en-US': 'Connection switcher trigger',
    'es-ES': 'Disparador del conmutador de conexiones',
    'fr-FR': 'Déclencheur du sélecteur de connexion',
    'hr-HR': 'Okidač prebacivanja veza',
    'id-ID': 'Pemicu pengalih koneksi',
    'it-IT': 'Attivatore del selettore connessioni',
    'ja-JP': '接続切り替えの呼び出し方',
    'ko-KR': '연결 전환기 호출 방식',
    'pl-PL': 'Sposób wywoływania przełącznika połączeń',
    'pt-BR': 'Acionador do seletor de conexões',
    'pt-PT': 'Acionador do seletor de ligações',
    'ru-RU': 'Способ вызова переключателя подключений',
    'sr-Latn': 'Okidač prebacivanja veza',
    'sv-SE': 'Utlösare för anslutningsväxlare',
    'tr-TR': 'Bağlantı değiştirici tetikleyicisi',
    'uk-UA': 'Спосіб виклику перемикача зєднань',
    'zh-CN': '连接切换器唤起方式',
    'zh-TW': '連線切換器喚起方式',
  },
  'settings.connPickerTriggerHint': {
    'af-ZA': 'Kies hoe die verbindingsneller oopgemaak word: die titel in die balk of die SFTP+ etiket op die terminaalnutsbalk',
    'bg-BG': 'Изберете как се отваря превключвателят: заглавието в горната лента или етикетът SFTP+ в лентата с инструменти на терминала',
    'cs-CZ': 'Zvolte, jak se přepínač připojení otevírá: název v horní liště nebo štítek SFTP+ na panelu nástrojů terminálu',
    'da-DK': 'Vælg hvordan forbindelsesskifteren åbnes: titlen i den øverste bjælke eller SFTP+ mærket på terminalværktøjslinjen',
    'de-DE': 'Wählen Sie, wie der Verbindungswechsler geöffnet wird: Titel in der oberen Leiste oder SFTP+ Kennzeichnung in der Terminal-Werkzeugleiste',
    'en-GB': 'Choose how the connection switcher opens: the title in the top bar or the SFTP+ badge on the terminal toolbar',
    'en-US': 'Choose how the connection switcher opens: the title in the top bar or the SFTP+ badge on the terminal toolbar',
    'es-ES': 'Elige cómo se abre el conmutador de conexiones: el título de la barra superior o la insignia SFTP+ de la barra del terminal',
    'fr-FR': 'Choisissez comment ouvrir le sélecteur de connexion: le titre de la barre supérieure ou le badge SFTP+ de la barre du terminal',
    'hr-HR': 'Odaberite kako se otvara prebacivač veza: naslov u gornjoj traci ili oznaka SFTP+ na alatnoj traci terminala',
    'id-ID': 'Pilih cara membuka pengalih koneksi: judul di bilah atas atau lencana SFTP+ di bilah alat terminal',
    'it-IT': 'Scegli come aprire il selettore connessioni: il titolo nella barra superiore o il badge SFTP+ nella barra del terminale',
    'ja-JP': '接続切り替えを開く方法を選択します。上部バーのタイトルか、ターミナルツールバーの SFTP+ バッジ',
    'ko-KR': '연결 전환기를 여는 방법을 선택하세요. 상단 표시줄 제목 또는 터미널 도구 모음의 SFTP+ 배지',
    'pl-PL': 'Wybierz sposób otwierania przełącznika połączeń: tytuł na górnym pasku lub plakietka SFTP+ na pasku narzędzi terminala',
    'pt-BR': 'Escolha como o seletor de conexões abre: o título da barra superior ou o selo SFTP+ na barra do terminal',
    'pt-PT': 'Escolha como o seletor de ligações abre: o título da barra superior ou o selo SFTP+ na barra do terminal',
    'ru-RU': 'Выберите, как открывать переключатель подключений: заголовок в верхней панели или значок SFTP+ на панели терминала',
    'sr-Latn': 'Izaberite kako se otvara prebacivač veza: naslov u gornjoj traci ili oznaka SFTP+ na traci alata terminala',
    'sv-SE': 'Välj hur anslutningsväxlaren öppnas: titeln i det översta fältet eller SFTP+ märket i terminalens verktygsfält',
    'tr-TR': 'Bağlantı değiştiricinin nasıl açılacağını seçin: üst çubuktaki başlık veya terminal araç çubuğundaki SFTP+ rozeti',
    'uk-UA': 'Виберіть, як відкривати перемикач зєднань: заголовок у верхній панелі або значок SFTP+ на панелі термінала',
    'zh-CN': '选择连接切换器的弹出方式：面板顶栏的连接标题，或终端工具栏上的 SFTP+ 标识',
    'zh-TW': '選擇連線切換器的彈出方式：面板頂欄的連線標題，或終端工具列上的 SFTP+ 標識',
  },
  'settings.connPickerTopbar': {
    'af-ZA': 'Balktitel',
    'bg-BG': 'Заглавие в лентата',
    'cs-CZ': 'Název v liště',
    'da-DK': 'Titel i bjælke',
    'de-DE': 'Titel in Leiste',
    'en-GB': 'Top bar title',
    'en-US': 'Top bar title',
    'es-ES': 'Título superior',
    'fr-FR': 'Titre supérieur',
    'hr-HR': 'Naslov u traci',
    'id-ID': 'Judul bilah atas',
    'it-IT': 'Titolo in alto',
    'ja-JP': '上部バーのタイトル',
    'ko-KR': '상단 표시줄 제목',
    'pl-PL': 'Tytuł na pasku',
    'pt-BR': 'Título superior',
    'pt-PT': 'Título superior',
    'ru-RU': 'Заголовок панели',
    'sr-Latn': 'Naslov u traci',
    'sv-SE': 'Titel i fältet',
    'tr-TR': 'Üst çubuk başlığı',
    'uk-UA': 'Заголовок панелі',
    'zh-CN': '顶栏标题',
    'zh-TW': '頂欄標題',
  },
  'settings.connPickerBadge': {
    'af-ZA': 'Nutsbalketiket',
    'bg-BG': 'Етикет в лентата',
    'cs-CZ': 'Štítek v liště',
    'da-DK': 'Mærke i værktøjslinje',
    'de-DE': 'Kennzeichnung in Leiste',
    'en-GB': 'Toolbar badge',
    'en-US': 'Toolbar badge',
    'es-ES': 'Insignia de barra',
    'fr-FR': 'Badge de barre',
    'hr-HR': 'Oznaka u traci',
    'id-ID': 'Lencana bilah alat',
    'it-IT': 'Badge barra',
    'ja-JP': 'ツールバーのバッジ',
    'ko-KR': '도구 모음 배지',
    'pl-PL': 'Plakietka paska',
    'pt-BR': 'Selo da barra',
    'pt-PT': 'Selo da barra',
    'ru-RU': 'Значок панели',
    'sr-Latn': 'Oznaka u traci',
    'sv-SE': 'Märke i fältet',
    'tr-TR': 'Araç çubuğu rozeti',
    'uk-UA': 'Значок панелі',
    'zh-CN': '工具栏标识',
    'zh-TW': '工具列標識',
  },
  'settings.connPickerBoth': {
    'af-ZA': 'Beide',
    'bg-BG': 'И двете',
    'cs-CZ': 'Obojí',
    'da-DK': 'Begge',
    'de-DE': 'Beides',
    'en-GB': 'Both',
    'en-US': 'Both',
    'es-ES': 'Ambos',
    'fr-FR': 'Les deux',
    'hr-HR': 'Oboje',
    'id-ID': 'Keduanya',
    'it-IT': 'Entrambi',
    'ja-JP': '両方',
    'ko-KR': '둘 다',
    'pl-PL': 'Oba',
    'pt-BR': 'Ambos',
    'pt-PT': 'Ambos',
    'ru-RU': 'Оба',
    'sr-Latn': 'Oba',
    'sv-SE': 'Båda',
    'tr-TR': 'İkisi de',
    'uk-UA': 'Обидва',
    'zh-CN': '两者都',
    'zh-TW': '兩者都',
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
    const text = T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: double quote in translation:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
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

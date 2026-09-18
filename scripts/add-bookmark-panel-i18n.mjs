#!/usr/bin/env node
/**
 * 追加书签面板定制相关 i18n（幂等）
 * 创建人：DD1024z + Composer
 * 创建时间：2026-09-18
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEYS = {
  'settings.customBookmarkPanel': {
    'zh-CN': '定制书签面板', 'zh-TW': '自訂書籤面板',
    'en-US': 'Customize bookmark panel', 'en-GB': 'Customise bookmark panel',
    'ja-JP': 'ブックマークパネルのカスタマイズ', 'ko-KR': '책갈피 패널 사용자 지정',
    'de-DE': 'Lesezeichenfenster anpassen', 'fr-FR': 'Personnaliser le panneau de favoris',
    'es-ES': 'Personalizar panel de marcadores', 'it-IT': 'Personalizza pannello segnalibri',
    'pt-BR': 'Personalizar painel de favoritos', 'pt-PT': 'Personalizar painel de favoritos',
    'ru-RU': 'Настройка панели закладок', 'uk-UA': 'Налаштування панелі закладок',
    'pl-PL': 'Dostosuj panel zakładek', 'cs-CZ': 'Přizpůsobit panel záložek',
    'tr-TR': 'Yer imi panelini özelleştir', 'sv-SE': 'Anpassa bokmärkespanelen',
    'da-DK': 'Tilpas bogmærkepanelet', 'bg-BG': 'Персонализиране на панела с отметки',
    'hr-HR': 'Prilagodi ploču oznaka', 'sr-Latn': 'Prilagodi panel obeleživača',
    'id-ID': 'Sesuaikan panel penanda', 'af-ZA': 'Pas boekmerkpaneel aan',
  },
  'settings.resetBookmarkPanel': {
    'zh-CN': '恢复默认书签面板', 'zh-TW': '還原預設書籤面板',
    'en-US': 'Reset bookmark panel', 'en-GB': 'Reset bookmark panel',
    'ja-JP': 'ブックマークパネルをリセット', 'ko-KR': '책갈피 패널 초기화',
    'de-DE': 'Lesezeichenfenster zurücksetzen', 'fr-FR': 'Réinitialiser le panneau de favoris',
    'es-ES': 'Restablecer panel de marcadores', 'it-IT': 'Reimposta pannello segnalibri',
    'pt-BR': 'Redefinir painel de favoritos', 'pt-PT': 'Repor painel de favoritos',
    'ru-RU': 'Сбросить панель закладок', 'uk-UA': 'Скинути панель закладок',
    'pl-PL': 'Przywróć panel zakładek', 'cs-CZ': 'Obnovit panel záložek',
    'tr-TR': 'Yer imi panelini sıfırla', 'sv-SE': 'Återställ bokmärkespanelen',
    'da-DK': 'Nulstil bogmærkepanelet', 'bg-BG': 'Нулирай панела с отметки',
    'hr-HR': 'Vrati ploču oznaka', 'sr-Latn': 'Vrati panel obeleživača',
    'id-ID': 'Reset panel penanda', 'af-ZA': 'Stel boekmerkpaneel terug',
  },
  'settings.bookmarkGroupByScope': {
    'zh-CN': '按「当前连接 / 全局」分组', 'zh-TW': '依「目前連線 / 全域」分組',
    'en-US': 'Group by connection / global', 'en-GB': 'Group by connection / global',
    'ja-JP': '接続 / グローバルでグループ化', 'ko-KR': '연결 / 전역으로 그룹화',
    'de-DE': 'Nach Verbindung / Global gruppieren', 'fr-FR': 'Grouper par connexion / global',
    'es-ES': 'Agrupar por conexión / global', 'it-IT': 'Raggruppa per connessione / globale',
    'pt-BR': 'Agrupar por conexão / global', 'pt-PT': 'Agrupar por ligação / global',
    'ru-RU': 'Группировать по подключению / глобальным', 'uk-UA': 'Групувати за з’єднанням / глобальними',
    'pl-PL': 'Grupuj według połączenia / globalnych', 'cs-CZ': 'Seskupit podle připojení / globálních',
    'tr-TR': 'Bağlantı / genel olarak grupla', 'sv-SE': 'Gruppera efter anslutning / globala',
    'da-DK': 'Gruppér efter forbindelse / globale', 'bg-BG': 'Групирай по връзка / глобални',
    'hr-HR': 'Grupiraj po vezi / globalnim', 'sr-Latn': 'Grupiši po vezi / globalnim',
    'id-ID': 'Kelompokkan menurut koneksi / global', 'af-ZA': 'Groepeer volgens verbinding / globaal',
  },
  'settings.bookmarkGroupByScopeHint': {
    'zh-CN': '开启后书签按当前连接与全局分块显示；关闭后混排并可跨范围拖拽排序',
    'zh-TW': '開啟後書籤依目前連線與全域分塊顯示；關閉後混排並可跨範圍拖曳排序',
    'en-US': 'When on, bookmarks are shown in connection / global sections. When off, they mix freely and can be reordered across scopes.',
    'en-GB': 'When on, bookmarks are shown in connection / global sections. When off, they mix freely and can be reordered across scopes.',
    'ja-JP': 'オン時は接続 / グローバルのブロック表示。オフ時は混在し、範囲をまたいで並べ替えできます。',
    'ko-KR': '켜면 연결/전역 구역으로 표시합니다. 끄면 섞여 표시되며 범위를 넘어 순서를 바꿀 수 있습니다.',
    'de-DE': 'Ein: Anzeige in Verbindungs-/Globalblöcken. Aus: gemischt und über Bereiche hinweg sortierbar.',
    'fr-FR': 'Activé : sections connexion / global. Désactivé : liste mixte, réordonnable entre portées.',
    'es-ES': 'Activado: secciones conexión / global. Desactivado: lista mixta y reordenable entre ámbitos.',
    'it-IT': 'Attivo: sezioni connessione / globale. Disattivo: elenco misto, riordinabile tra ambiti.',
    'pt-BR': 'Ativado: seções conexão / global. Desativado: lista mista, reordenável entre escopos.',
    'pt-PT': 'Ativado: secções ligação / global. Desativado: lista mista, reordenável entre âmbitos.',
    'ru-RU': 'Вкл.: блоки подключения / глобальных. Выкл.: смешанный список с перетаскиванием между областями.',
    'uk-UA': 'Увімк.: блоки з’єднання / глобальних. Вимк.: змішаний список із перетягуванням між областями.',
    'pl-PL': 'Wł.: sekcje połączenia / globalne. Wył.: lista mieszana, sortowanie między zakresami.',
    'cs-CZ': 'Zapnuto: bloky připojení / globální. Vypnuto: smíšený seznam s řazením napříč.',
    'tr-TR': 'Açık: bağlantı / genel bölümleri. Kapalı: karışık liste, kapsamlar arası sürükle-bırak.',
    'sv-SE': 'På: sektioner anslutning / globala. Av: blandad lista, omordningsbar över omfattningar.',
    'da-DK': 'Til: sektioner forbindelse / globale. Fra: blandet liste, kan omordnes på tværs.',
    'bg-BG': 'Вкл.: блокове връзка / глобални. Изкл.: смесен списък с пренареждане между обхвати.',
    'hr-HR': 'Uključeno: odjeljci veza / globalno. Isključeno: miješani popis, razvrstavanje između opsega.',
    'sr-Latn': 'Uključeno: odeljci veza / globalno. Isključeno: mešoviti spisak, razvrstavanje između opsega.',
    'id-ID': 'Aktif: bagian koneksi / global. Nonaktif: daftar campuran, bisa diurut ulang lintas cakupan.',
    'af-ZA': 'Aan: afdelings verbinding / globaal. Af: gemengde lys, kan oor omvang hersorteer word.',
  },
  'settings.bookmarkGroupOrderHint': {
    'zh-CN': '拖拽调整「当前连接」与「全局」分组块的先后顺序',
    'zh-TW': '拖曳調整「目前連線」與「全域」分組塊的先後順序',
    'en-US': 'Drag to set which group appears first: connection or global',
    'en-GB': 'Drag to set which group appears first: connection or global',
    'ja-JP': '接続 / グローバルの表示順をドラッグで変更',
    'ko-KR': '연결 / 전역 그룹 표시 순서를 끌어 변경',
    'de-DE': 'Ziehen, um die Reihenfolge der Gruppen Verbindung / Global festzulegen',
    'fr-FR': 'Faites glisser pour définir l’ordre des groupes connexion / global',
    'es-ES': 'Arrastre para definir el orden de los grupos conexión / global',
    'it-IT': 'Trascina per impostare l’ordine dei gruppi connessione / globale',
    'pt-BR': 'Arraste para definir a ordem dos grupos conexão / global',
    'pt-PT': 'Arraste para definir a ordem dos grupos ligação / global',
    'ru-RU': 'Перетащите, чтобы задать порядок блоков подключения / глобальных',
    'uk-UA': 'Перетягніть, щоб задати порядок блоків з’єднання / глобальних',
    'pl-PL': 'Przeciągnij, aby ustawić kolejność grup połączenie / globalne',
    'cs-CZ': 'Přetažením nastavte pořadí skupin připojení / globální',
    'tr-TR': 'Bağlantı / genel grup sırasını sürükleyerek ayarlayın',
    'sv-SE': 'Dra för att ställa in ordningen för grupperna anslutning / globala',
    'da-DK': 'Træk for at indstille rækkefølgen for grupperne forbindelse / globale',
    'bg-BG': 'Плъзнете, за да зададете реда на групите връзка / глобални',
    'hr-HR': 'Povucite za redoslijed grupa veza / globalno',
    'sr-Latn': 'Prevucite za redosled grupa veza / globalno',
    'id-ID': 'Seret untuk mengatur urutan grup koneksi / global',
    'af-ZA': 'Sleep om die volgorde van groepe verbinding / globaal te stel',
  },
  'settings.bookmarkFlatHint': {
    'zh-CN': '关闭分组后，全局书签左侧会显示「全局」标签，并可与当前连接书签自由拖拽混排',
    'zh-TW': '關閉分組後，全域書籤左側會顯示「全域」標籤，並可與目前連線書籤自由拖曳混排',
    'en-US': 'With grouping off, global bookmarks show a Global badge and can be freely mixed with connection bookmarks.',
    'en-GB': 'With grouping off, global bookmarks show a Global badge and can be freely mixed with connection bookmarks.',
    'ja-JP': 'グループ化オフ時、グローバルブックマークに「グローバル」バッジが付き、接続ブックマークと自由に並べ替えできます。',
    'ko-KR': '그룹화를 끄면 전역 책갈피에 「전역」 배지가 표시되며 연결 책갈피와 자유롭게 섞어 정렬할 수 있습니다.',
    'de-DE': 'Ohne Gruppierung zeigen globale Lesezeichen ein Global-Abzeichen und lassen sich frei mit Verbindungsmarken mischen.',
    'fr-FR': 'Sans regroupement, les favoris globaux affichent un badge Global et se mélangent librement avec ceux de connexion.',
    'es-ES': 'Sin agrupación, los marcadores globales muestran una etiqueta Global y se mezclan libremente con los de conexión.',
    'it-IT': 'Senza raggruppamento, i segnalibri globali mostrano un badge Globale e si mescolano liberamente con quelli di connessione.',
    'pt-BR': 'Sem agrupamento, favoritos globais mostram o selo Global e podem ser misturados livremente com os da conexão.',
    'pt-PT': 'Sem agrupamento, os favoritos globais mostram o selo Global e podem misturar-se com os da ligação.',
    'ru-RU': 'Без группировки у глобальных закладок есть метка «Глобал», их можно свободно смешивать с закладками подключения.',
    'uk-UA': 'Без групування глобальні закладки мають мітку «Глобал» і вільно змішуються із закладками з’єднання.',
    'pl-PL': 'Bez grupowania globalne zakładki mają znacznik Global i można je mieszać z zakładkami połączenia.',
    'cs-CZ': 'Bez seskupení mají globální záložky štítek Globální a lze je volně míchat se záložkami připojení.',
    'tr-TR': 'Gruplama kapalıyken genel yer imlerinde Genel rozeti görünür ve bağlantı yer imleriyle serbestçe karıştırılabilir.',
    'sv-SE': 'Utan gruppering visar globala bokmärken en Global-bricka och kan blandas fritt med anslutningsbokmärken.',
    'da-DK': 'Uden gruppering viser globale bogmærker et Global-mærke og kan frit blandes med forbindelsesbogmærker.',
    'bg-BG': 'Без групиране глобалните отметки показват етикет „Глобални“ и могат свободно да се смесват с тези на връзката.',
    'hr-HR': 'Bez grupiranja globalne oznake imaju oznaku Globalno i mogu se slobodno miješati s oznakama veze.',
    'sr-Latn': 'Bez grupisanja globalni obeleživači imaju oznaku Globalno i mogu se slobodno mešati sa obeleživačima veze.',
    'id-ID': 'Tanpa pengelompokan, penanda global menampilkan lencana Global dan dapat dicampur bebas dengan penanda koneksi.',
    'af-ZA': 'Sonder groepering toon globale boekmerke ’n Globaal-kenteken en kan vrylik met verbindingsboekmerke gemeng word.',
  },
  'bookmark.globalBadge': {
    'zh-CN': '全局', 'zh-TW': '全域',
    'en-US': 'Global', 'en-GB': 'Global',
    'ja-JP': 'グローバル', 'ko-KR': '전역',
    'de-DE': 'Global', 'fr-FR': 'Global',
    'es-ES': 'Global', 'it-IT': 'Globale',
    'pt-BR': 'Global', 'pt-PT': 'Global',
    'ru-RU': 'Глобал', 'uk-UA': 'Глобал',
    'pl-PL': 'Globalne', 'cs-CZ': 'Globální',
    'tr-TR': 'Genel', 'sv-SE': 'Global',
    'da-DK': 'Global', 'bg-BG': 'Глобални',
    'hr-HR': 'Globalno', 'sr-Latn': 'Globalno',
    'id-ID': 'Global', 'af-ZA': 'Globaal',
  },
}

function poEscape(s) {
  return String(s)
    .replace(/\r/g, '')
    .replace(/\\n/g, '\u0000')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\u0000/g, '\\n')
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasKey(txt, key) {
  return new RegExp(`^msgid\\s+"${escRe(key)}"\\s*$`, 'm').test(txt)
}

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let added = 0
for (const file of files) {
  const lang = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  const blocks = []
  for (const [key, perLang] of Object.entries(KEYS)) {
    const val = perLang[lang] ?? perLang['en-US']
    if (!val || hasKey(txt, key)) continue
    blocks.push(`\nmsgid "${key}"\nmsgstr "${poEscape(val)}"\n`)
  }
  if (blocks.length) {
    if (!txt.endsWith('\n')) txt += '\n'
    txt += blocks.join('')
    fs.writeFileSync(full, txt, 'utf8')
    added += blocks.length
    console.log(`[ok] ${file} +${blocks.length}`)
  } else {
    console.log(`[skip] ${file}`)
  }
}
console.log(`[i18n] added ${added} entries`)

#!/usr/bin/env node
/**
 * 更新书签分组相关文案（幂等 upsert）
 * - bookmark.forConnection → 当前书签
 * - settings.bookmarkGroupByScope → 书签分组
 * - 同步 hint / flatHint；保留未再展示的 groupOrderHint 文案以免缺 key
 * 创建人：DD1024z + Composer
 * 创建时间：2026-09-18
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEYS = {
  'bookmark.forConnection': {
    'zh-CN': '当前书签', 'zh-TW': '目前書籤',
    'en-US': 'Current Bookmarks', 'en-GB': 'Current Bookmarks',
    'ja-JP': '現在のブックマーク', 'ko-KR': '현재 책갈피',
    'de-DE': 'Aktuelle Lesezeichen', 'fr-FR': 'Favoris actuels',
    'es-ES': 'Marcadores actuales', 'it-IT': 'Segnalibri attuali',
    'pt-BR': 'Favoritos atuais', 'pt-PT': 'Favoritos atuais',
    'ru-RU': 'Текущие закладки', 'uk-UA': 'Поточні закладки',
    'pl-PL': 'Bieżące zakładki', 'cs-CZ': 'Aktuální záložky',
    'tr-TR': 'Geçerli yer imleri', 'sv-SE': 'Aktuella bokmärken',
    'da-DK': 'Aktuelle bogmærker', 'bg-BG': 'Текущи отметки',
    'hr-HR': 'Trenutne oznake', 'sr-Latn': 'Trenutni obeleživači',
    'id-ID': 'Penanda saat ini', 'af-ZA': 'Huidige boekmerke',
  },
  'settings.bookmarkGroupByScope': {
    'zh-CN': '书签分组', 'zh-TW': '書籤分組',
    'en-US': 'Bookmark grouping', 'en-GB': 'Bookmark grouping',
    'ja-JP': 'ブックマークのグループ化', 'ko-KR': '책갈피 그룹화',
    'de-DE': 'Lesezeichen gruppieren', 'fr-FR': 'Groupement des favoris',
    'es-ES': 'Agrupación de marcadores', 'it-IT': 'Raggruppamento segnalibri',
    'pt-BR': 'Agrupamento de favoritos', 'pt-PT': 'Agrupamento de favoritos',
    'ru-RU': 'Группировка закладок', 'uk-UA': 'Групування закладок',
    'pl-PL': 'Grupowanie zakładek', 'cs-CZ': 'Seskupení záložek',
    'tr-TR': 'Yer imi gruplama', 'sv-SE': 'Bokmärkesgruppering',
    'da-DK': 'Bogmærkegruppering', 'bg-BG': 'Групиране на отметки',
    'hr-HR': 'Grupiranje oznaka', 'sr-Latn': 'Grupisanje obeleživača',
    'id-ID': 'Pengelompokan penanda', 'af-ZA': 'Boekmerkgroepering',
  },
  'settings.bookmarkGroupByScopeHint': {
    'zh-CN': '开启后书签按「当前书签 / 全局书签」分块显示；关闭后混排并可跨范围拖拽排序',
    'zh-TW': '開啟後書籤依「目前書籤 / 全域書籤」分塊顯示；關閉後混排並可跨範圍拖曳排序',
    'en-US': 'When on, bookmarks are shown in Current / Global sections. When off, they mix freely and can be reordered across scopes.',
    'en-GB': 'When on, bookmarks are shown in Current / Global sections. When off, they mix freely and can be reordered across scopes.',
    'ja-JP': 'オン時は「現在 / グローバル」のブロック表示。オフ時は混在し、範囲をまたいで並べ替えできます。',
    'ko-KR': '켜면 「현재 / 전역」 구역으로 표시합니다. 끄면 섞여 표시되며 범위를 넘어 순서를 바꿀 수 있습니다.',
    'de-DE': 'Ein: Anzeige in Aktuell-/Globalblöcken. Aus: gemischt und über Bereiche hinweg sortierbar.',
    'fr-FR': 'Activé : sections Actuels / Global. Désactivé : liste mixte, réordonnable entre portées.',
    'es-ES': 'Activado: secciones Actuales / Global. Desactivado: lista mixta y reordenable entre ámbitos.',
    'it-IT': 'Attivo: sezioni Attuali / Globale. Disattivo: elenco misto, riordinabile tra ambiti.',
    'pt-BR': 'Ativado: seções Atuais / Global. Desativado: lista mista, reordenável entre escopos.',
    'pt-PT': 'Ativado: secções Atuais / Global. Desativado: lista mista, reordenável entre âmbitos.',
    'ru-RU': 'Вкл.: блоки текущих / глобальных. Выкл.: смешанный список с перетаскиванием между областями.',
    'uk-UA': 'Увімк.: блоки поточних / глобальних. Вимк.: змішаний список із перетягуванням між областями.',
    'pl-PL': 'Wł.: sekcje bieżące / globalne. Wył.: lista mieszana, sortowanie między zakresami.',
    'cs-CZ': 'Zapnuto: bloky aktuální / globální. Vypnuto: smíšený seznam s řazením napříč.',
    'tr-TR': 'Açık: Geçerli / Genel bölümleri. Kapalı: karışık liste, kapsamlar arası sürükle-bırak.',
    'sv-SE': 'På: sektioner Aktuella / Globala. Av: blandad lista, omordningsbar över omfattningar.',
    'da-DK': 'Til: sektioner Aktuelle / Globale. Fra: blandet liste, kan omordnes på tværs.',
    'bg-BG': 'Вкл.: блокове текущи / глобални. Изкл.: смесен списък с пренареждане между обхвати.',
    'hr-HR': 'Uključeno: odjeljci Trenutne / Globalno. Isključeno: miješani popis, razvrstavanje između opsega.',
    'sr-Latn': 'Uključeno: odeljci Trenutni / Globalno. Isključeno: mešoviti spisak, razvrstavanje između opsega.',
    'id-ID': 'Aktif: bagian Saat ini / Global. Nonaktif: daftar campuran, bisa diurut ulang lintas cakupan.',
    'af-ZA': 'Aan: afdelings Huidig / Globaal. Af: gemengde lys, kan oor omvang hersorteer word.',
  },
  'settings.bookmarkFlatHint': {
    'zh-CN': '关闭分组后，全局书签名称右侧会显示「全局」标签，并可与当前书签自由拖拽混排',
    'zh-TW': '關閉分組後，全域書籤名稱右側會顯示「全域」標籤，並可與目前書籤自由拖曳混排',
    'en-US': 'With grouping off, global bookmarks show a Global badge next to the name and can be freely mixed with current bookmarks.',
    'en-GB': 'With grouping off, global bookmarks show a Global badge next to the name and can be freely mixed with current bookmarks.',
    'ja-JP': 'グループ化オフ時、グローバルブックマーク名の右に「グローバル」バッジが付き、現在のブックマークと自由に並べ替えできます。',
    'ko-KR': '그룹화를 끄면 전역 책갈피 이름 오른쪽에 「전역」 배지가 표시되며 현재 책갈피와 자유롭게 섞어 정렬할 수 있습니다.',
    'de-DE': 'Ohne Gruppierung zeigen globale Lesezeichen ein Global-Abzeichen rechts neben dem Namen und lassen sich frei mit aktuellen Lesezeichen mischen.',
    'fr-FR': 'Sans regroupement, les favoris globaux affichent un badge Global à droite du nom et se mélangent librement avec les favoris actuels.',
    'es-ES': 'Sin agrupación, los marcadores globales muestran una etiqueta Global a la derecha del nombre y se mezclan libremente con los actuales.',
    'it-IT': 'Senza raggruppamento, i segnalibri globali mostrano un badge Globale a destra del nome e si mescolano liberamente con quelli attuali.',
    'pt-BR': 'Sem agrupamento, favoritos globais mostram o selo Global à direita do nome e podem ser misturados livremente com os atuais.',
    'pt-PT': 'Sem agrupamento, os favoritos globais mostram o selo Global à direita do nome e podem misturar-se com os atuais.',
    'ru-RU': 'Без группировки у глобальных закладок метка «Глобал» справа от имени; их можно свободно смешивать с текущими закладками.',
    'uk-UA': 'Без групування глобальні закладки мають мітку «Глобал» праворуч від назви й вільно змішуються з поточними закладками.',
    'pl-PL': 'Bez grupowania globalne zakładki mają znacznik Global obok nazwy i można je mieszać z bieżącymi zakładkami.',
    'cs-CZ': 'Bez seskupení mají globální záložky štítek Globální vpravo od názvu a lze je volně míchat s aktuálními záložkami.',
    'tr-TR': 'Gruplama kapalıyken genel yer imlerinde adın sağında Genel rozeti görünür ve geçerli yer imleriyle serbestçe karıştırılabilir.',
    'sv-SE': 'Utan gruppering visar globala bokmärken en Global-bricka till höger om namnet och kan blandas fritt med aktuella bokmärken.',
    'da-DK': 'Uden gruppering viser globale bogmærker et Global-mærke til højre for navnet og kan frit blandes med aktuelle bogmærker.',
    'bg-BG': 'Без групиране глобалните отметки показват етикет „Глобални“ вдясно от името и могат свободно да се смесват с текущите.',
    'hr-HR': 'Bez grupiranja globalne oznake imaju oznaku Globalno desno od naziva i mogu se slobodno miješati s trenutnim oznakama.',
    'sr-Latn': 'Bez grupisanja globalni obeleživači imaju oznaku Globalno desno od naziva i mogu se slobodno mešati sa trenutnim.',
    'id-ID': 'Tanpa pengelompokan, penanda global menampilkan lencana Global di kanan nama dan dapat dicampur bebas dengan penanda saat ini.',
    'af-ZA': 'Sonder groepering toon globale boekmerke ’n Globaal-kenteken regs van die naam en kan vrylik met huidige boekmerke gemeng word.',
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

function setOrAppendKey(txt, key, val) {
  const block = `msgid "${key}"\nmsgstr "${poEscape(val)}"\n`
  const re = new RegExp(
    `^msgid\\s+"${escRe(key)}"\\s*\\nmsgstr\\s+"(?:\\\\.|[^"\\\\])*"\\s*\\n(?:^"(?:\\\\.|[^"\\\\])*"\\s*\\n)*`,
    'm',
  )
  if (re.test(txt)) return txt.replace(re, block)
  if (!txt.endsWith('\n')) txt += '\n'
  return txt + '\n' + block
}

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let n = 0
for (const file of files) {
  const lang = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  const before = txt
  for (const [key, perLang] of Object.entries(KEYS)) {
    const val = perLang[lang] ?? perLang['en-US']
    if (!val) continue
    txt = setOrAppendKey(txt, key, val)
  }
  if (txt !== before) {
    fs.writeFileSync(full, txt, 'utf8')
    n++
    console.log(`[ok] ${file}`)
  } else {
    console.log(`[skip] ${file}`)
  }
}
console.log(`[i18n] updated ${n} locale files`)

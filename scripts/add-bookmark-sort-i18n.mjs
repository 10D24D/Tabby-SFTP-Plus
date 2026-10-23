#!/usr/bin/env node
/**
 * 一次性补丁脚本：为 24 种语言追加「联动标签 + 书签排序」所需 key
 *   bookmark.linkBadge                     书签列表里的「联动」标签
 *   bookmark.sortManual                    排序按钮：拖拽排序
 *   bookmark.sortUsage                     排序按钮：频率排序
 *   bookmark.sortHint                      排序按钮 tooltip
 *   settings.bookmarkSortByUsage           设置项：按使用频率排序
 *   settings.bookmarkSortByUsageHint       设置项说明
 * 用法：node scripts/add-bookmark-sort-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'bookmark.linkBadge',
  'bookmark.sortManual',
  'bookmark.sortUsage',
  'bookmark.sortHint',
  'settings.bookmarkSortByUsage',
  'settings.bookmarkSortByUsageHint',
]

const T = {
  'bookmark.linkBadge': {
    'af-ZA': 'Gekoppel', 'bg-BG': 'Свързан', 'cs-CZ': 'Propojeno', 'da-DK': 'Knyttet',
    'de-DE': 'Verknüpft', 'en-GB': 'Linked', 'en-US': 'Linked', 'es-ES': 'Vinculado',
    'fr-FR': 'Lié', 'hr-HR': 'Povezano', 'id-ID': 'Tertaut', 'it-IT': 'Collegato',
    'ja-JP': '連動', 'ko-KR': '연동', 'pl-PL': 'Powiązane', 'pt-BR': 'Vinculado',
    'pt-PT': 'Ligado', 'ru-RU': 'Связано', 'sr-Latn': 'Povezano', 'sv-SE': 'Länkad',
    'tr-TR': 'Bağlantılı', 'uk-UA': 'Повязано', 'zh-CN': '联动', 'zh-TW': '聯動',
  },
  'bookmark.sortManual': {
    'af-ZA': 'Sleep-volgorde', 'bg-BG': 'Ред на плъзгане', 'cs-CZ': 'Pořadí tažení',
    'da-DK': 'Trækrækkefølge', 'de-DE': 'Zieh-Reihenfolge', 'en-GB': 'Drag order',
    'en-US': 'Drag order', 'es-ES': 'Orden manual', 'fr-FR': 'Ordre manuel',
    'hr-HR': 'Redoslijed povlačenja', 'id-ID': 'Urutan seret', 'it-IT': 'Ordine manuale',
    'ja-JP': 'ドラッグ順', 'ko-KR': '드래그 순서', 'pl-PL': 'Kolejność ręczna',
    'pt-BR': 'Ordem manual', 'pt-PT': 'Ordem manual', 'ru-RU': 'Порядок перетаскивания',
    'sr-Latn': 'Redosled prevlačenja', 'sv-SE': 'Dra ordning', 'tr-TR': 'Sürükleme sırası',
    'uk-UA': 'Порядок перетягування', 'zh-CN': '拖拽排序', 'zh-TW': '拖曳排序',
  },
  'bookmark.sortUsage': {
    'af-ZA': 'Gebruik-volgorde', 'bg-BG': 'По използване', 'cs-CZ': 'Podle použití',
    'da-DK': 'Efter brug', 'de-DE': 'Nach Nutzung', 'en-GB': 'By usage', 'en-US': 'By usage',
    'es-ES': 'Por uso', 'fr-FR': 'Par usage', 'hr-HR': 'Po upotrebi', 'id-ID': 'Berdasarkan penggunaan',
    'it-IT': 'Per utilizzo', 'ja-JP': '使用回数順', 'ko-KR': '사용 빈도순',
    'pl-PL': 'Według użycia', 'pt-BR': 'Por uso', 'pt-PT': 'Por utilização',
    'ru-RU': 'По частоте', 'sr-Latn': 'Po upotrebi', 'sv-SE': 'Efter användning',
    'tr-TR': 'Kullanıma göre', 'uk-UA': 'За частотою', 'zh-CN': '频率排序', 'zh-TW': '頻率排序',
  },
  'bookmark.sortHint': {
    'af-ZA': 'Klik om na die ander sorteervolgorde te skakel', 'bg-BG': 'Щракнете за превключване на другия ред',
    'cs-CZ': 'Kliknutím přepnete na druhé řazení', 'da-DK': 'Klik for at skifte sortering',
    'de-DE': 'Klicken, um die andere Sortierung zu verwenden', 'en-GB': 'Click to switch sort order',
    'en-US': 'Click to switch sort order', 'es-ES': 'Clic para cambiar el orden',
    'fr-FR': 'Cliquez pour changer le tri', 'hr-HR': 'Kliknite za promjenu sortiranja',
    'id-ID': 'Klik untuk mengganti urutan', 'it-IT': 'Fai clic per cambiare ordinamento',
    'ja-JP': 'クリックで並び順を切り替え', 'ko-KR': '클릭하여 정렬 방식 전환',
    'pl-PL': 'Kliknij, aby zmienić sortowanie', 'pt-BR': 'Clique para alternar a ordenação',
    'pt-PT': 'Clique para alternar a ordenação', 'ru-RU': 'Щелчок меняет порядок сортировки',
    'sr-Latn': 'Kliknite za promenu sortiranja', 'sv-SE': 'Klicka för att byta sortering',
    'tr-TR': 'Sıralamayı değiştirmek için tıklayın', 'uk-UA': 'Клік змінює порядок сортування',
    'zh-CN': '点击切换排序方式', 'zh-TW': '點擊切換排序方式',
  },
  'settings.bookmarkSortByUsage': {
    'af-ZA': 'Sorteer volgens gebruik', 'bg-BG': 'Сортиране по използване', 'cs-CZ': 'Řadit podle použití',
    'da-DK': 'Sortér efter brug', 'de-DE': 'Nach Nutzung sortieren', 'en-GB': 'Sort by usage',
    'en-US': 'Sort by usage', 'es-ES': 'Ordenar por uso', 'fr-FR': 'Trier par usage',
    'hr-HR': 'Sortiraj po upotrebi', 'id-ID': 'Urutkan menurut penggunaan', 'it-IT': 'Ordina per utilizzo',
    'ja-JP': '使用回数で並べ替え', 'ko-KR': '사용 빈도로 정렬', 'pl-PL': 'Sortuj według użycia',
    'pt-BR': 'Ordenar por uso', 'pt-PT': 'Ordenar por utilização', 'ru-RU': 'Сортировать по частоте',
    'sr-Latn': 'Sortiraj po upotrebi', 'sv-SE': 'Sortera efter användning',
    'tr-TR': 'Kullanıma göre sırala', 'uk-UA': 'Сортувати за частотою',
    'zh-CN': '按使用频率排序', 'zh-TW': '按使用頻率排序',
  },
  'settings.bookmarkSortByUsageHint': {
    'af-ZA': 'Af: handmatige sleep-volgorde. Aan: gesorteer volgens hoe gereeld n boekmerk geklik is',
    'bg-BG': 'Изкл.: ръчен ред. Вкл.: по брой щраквания върху отметката',
    'cs-CZ': 'Vypnuto: ruční pořadí. Zapnuto: podle počtu kliknutí na záložku',
    'da-DK': 'Fra: manuel rækkefølge. Til: efter antal klik på bogmærket',
    'de-DE': 'Aus: manuelle Reihenfolge. An: nach Anzahl der Klicks auf das Lesezeichen',
    'en-GB': 'Off: manual drag order. On: by how often the bookmark was clicked',
    'en-US': 'Off: manual drag order. On: by how often the bookmark was clicked',
    'es-ES': 'Desactivado: orden manual. Activado: según las veces que se pulsó el marcador',
    'fr-FR': 'Désactivé: ordre manuel. Activé: selon le nombre de clics sur le signet',
    'hr-HR': 'Isključeno: ručni redoslijed. Uključeno: prema broju klikova na oznaku',
    'id-ID': 'Mati: urutan manual. Nyala: menurut berapa kali markah diklik',
    'it-IT': 'Off: ordine manuale. On: in base ai clic sul segnalibro',
    'ja-JP': 'オフ: 手動の並び順。オン: ブックマークのクリック回数順',
    'ko-KR': '끔: 수동 순서. 켬: 북마크 클릭 횟수순',
    'pl-PL': 'Wył.: kolejność ręczna. Wł.: według liczby kliknięć zakładki',
    'pt-BR': 'Desligado: ordem manual. Ligado: pela frequência de cliques no favorito',
    'pt-PT': 'Desligado: ordem manual. Ligado: pela frequência de cliques no favorito',
    'ru-RU': 'Выкл.: ручной порядок. Вкл.: по числу нажатий на закладку',
    'sr-Latn': 'Isključeno: ručni redosled. Uključeno: prema broju klikova na oznaku',
    'sv-SE': 'Av: manuell ordning. På: efter antal klick på bokmärket',
    'tr-TR': 'Kapalı: elle sıralama. Açık: yer imine tıklanma sayısına göre',
    'uk-UA': 'Вимк.: ручний порядок. Увімк.: за кількістю натискань на закладку',
    'zh-CN': '关闭时按手动拖拽顺序；开启后按书签被点击的次数降序',
    'zh-TW': '關閉時按手動拖曳順序；開啟後按書籤被點擊的次數降序',
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
    if (text.includes('"')) { console.error('FATAL: double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) { fs.writeFileSync(fp, raw, 'utf8'); totalAdded += added }
}
console.log(`Done. totalAdded=${totalAdded}`)

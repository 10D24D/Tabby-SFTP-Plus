#!/usr/bin/env node
/**
 * 一次性补丁脚本：为 24 种语言追加「联动书签」所需 key
 *   settings.bookmarkLink      联动书签（设置页开关）
 *   settings.bookmarkLinkHint  开关说明（tooltip）
 *   bookmark.linkPath          联动路径（书签表单输入框占位）
 * 用法：node scripts/add-bookmark-link-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.bookmarkLink', 'settings.bookmarkLinkHint', 'bookmark.linkPath']

const T = {
  'settings.bookmarkLink': {
    'af-ZA': 'Gekoppelde boekmerke',
    'bg-BG': 'Свързани отметки',
    'cs-CZ': 'Propojené záložky',
    'da-DK': 'Knyttede bogmærker',
    'de-DE': 'Verknüpfte Lesezeichen',
    'en-GB': 'Linked bookmarks',
    'en-US': 'Linked bookmarks',
    'es-ES': 'Marcadores vinculados',
    'fr-FR': 'Signets liés',
    'hr-HR': 'Povezane oznake',
    'id-ID': 'Markah tertaut',
    'it-IT': 'Segnalibri collegati',
    'ja-JP': '連動ブックマーク',
    'ko-KR': '연동 북마크',
    'pl-PL': 'Powiązane zakładki',
    'pt-BR': 'Favoritos vinculados',
    'pt-PT': 'Favoritos ligados',
    'ru-RU': 'Связанные закладки',
    'sr-Latn': 'Povezane oznake',
    'sv-SE': 'Länkade bokmärken',
    'tr-TR': 'Bağlantılı yer imleri',
    'uk-UA': 'Повязані закладки',
    'zh-CN': '联动书签',
    'zh-TW': '聯動書籤',
  },
  'settings.bookmarkLinkHint': {
    'af-ZA': 'Wanneer dit aangeskakel is, kan n boekmerk n gekoppelde pad kry; as jy daarop klik, spring die ander paneel ook na daardie pad',
    'bg-BG': 'Когато е включено, отметка може да има свързан път; при щракване другият панел също отива там',
    'cs-CZ': 'Po zapnutí může mít záložka propojenou cestu; po kliknutí se na ni přesune i druhý panel',
    'da-DK': 'Når det er slået til, kan et bogmærke have en knyttet sti; ved klik springer det andet panel også dertil',
    'de-DE': 'Wenn aktiviert, kann ein Lesezeichen einen verknüpften Pfad haben; beim Klick springt auch der andere Bereich dorthin',
    'en-GB': 'When on, a bookmark can carry a linked path; clicking it also moves the other pane there',
    'en-US': 'When on, a bookmark can carry a linked path; clicking it also moves the other pane there',
    'es-ES': 'Si está activado, un marcador puede tener una ruta vinculada; al pulsarlo, el otro panel también va allí',
    'fr-FR': 'Si activé, un signet peut avoir un chemin lié; en cliquant, l autre panneau sy rend aussi',
    'hr-HR': 'Kad je uključeno, oznaka može imati povezanu putanju; klikom se i drugi panel prebacuje tamo',
    'id-ID': 'Jika aktif, markah dapat memiliki jalur tertaut; saat diklik, panel lain juga berpindah ke sana',
    'it-IT': 'Se attivo, un segnalibro può avere un percorso collegato; facendo clic anche l altro pannello va lì',
    'ja-JP': 'オンにすると、ブックマークに連動パスを設定でき、クリック時に反対側のペインもそのパスへ移動します',
    'ko-KR': '켜면 북마크에 연동 경로를 설정할 수 있고, 클릭하면 반대쪽 창도 해당 경로로 이동합니다',
    'pl-PL': 'Po włączeniu zakładka może mieć powiązaną ścieżkę; kliknięcie przenosi tam także drugi panel',
    'pt-BR': 'Quando ativado, um favorito pode ter um caminho vinculado; ao clicar, o outro painel também vai para lá',
    'pt-PT': 'Quando ativado, um favorito pode ter um caminho ligado; ao clicar, o outro painel também vai para lá',
    'ru-RU': 'Если включено, закладка может иметь связанный путь; по щелчку вторая панель тоже переходит туда',
    'sr-Latn': 'Kada je uključeno, oznaka može imati povezanu putanju; klikom se i drugi panel prebacuje tamo',
    'sv-SE': 'När det är på kan ett bokmärke ha en länkad sökväg; vid klick går även andra panelen dit',
    'tr-TR': 'Açıkken yer imine bağlantılı yol eklenebilir; tıklandığında diğer bölme de oraya gider',
    'uk-UA': 'Коли ввімкнено, закладка може мати повязаний шлях; під час кліку друга панель також переходить туди',
    'zh-CN': '开启后书签可设置联动路径；点击该书签时另一栏也会跳到该路径',
    'zh-TW': '開啟後書籤可設定聯動路徑；點擊該書籤時另一欄也會跳到該路徑',
  },
  'bookmark.linkPath': {
    'af-ZA': 'Gekoppelde pad (ander paneel, opsioneel)',
    'bg-BG': 'Свързан път (друг панел, по избор)',
    'cs-CZ': 'Propojená cesta (druhý panel, volitelné)',
    'da-DK': 'Knyttet sti (andet panel, valgfrit)',
    'de-DE': 'Verknüpfter Pfad (anderer Bereich, optional)',
    'en-GB': 'Linked path (other pane, optional)',
    'en-US': 'Linked path (other pane, optional)',
    'es-ES': 'Ruta vinculada (otro panel, opcional)',
    'fr-FR': 'Chemin lié (autre panneau, facultatif)',
    'hr-HR': 'Povezana putanja (drugi panel, neobavezno)',
    'id-ID': 'Jalur tertaut (panel lain, opsional)',
    'it-IT': 'Percorso collegato (altro pannello, opzionale)',
    'ja-JP': '連動パス（反対側のペイン、任意）',
    'ko-KR': '연동 경로 (반대쪽 창, 선택)',
    'pl-PL': 'Powiązana ścieżka (drugi panel, opcjonalnie)',
    'pt-BR': 'Caminho vinculado (outro painel, opcional)',
    'pt-PT': 'Caminho ligado (outro painel, opcional)',
    'ru-RU': 'Связанный путь (другая панель, необязательно)',
    'sr-Latn': 'Povezana putanja (drugi panel, opciono)',
    'sv-SE': 'Länkad sökväg (andra panelen, valfritt)',
    'tr-TR': 'Bağlantılı yol (diğer bölme, isteğe bağlı)',
    'uk-UA': 'Повязаний шлях (інша панель, необовязково)',
    'zh-CN': '联动路径（另一栏，可选）',
    'zh-TW': '聯動路徑（另一欄，可選）',
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

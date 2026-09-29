#!/usr/bin/env node
/**
 * 功能描述：为全部 24 种语言的 .po 追加「导出内容勾选」相关 key
 *   settings.exportPickHint     选择要包含在导出文件中的内容。
 *   settings.exportCatUi        界面与外观
 *   settings.exportCatPanel     面板与行为
 *   settings.exportCatTransfer  传输与冲突
 *   settings.exportCatData      书签与记录
 *   settings.exportCatIcons     图标与文件类型
 *   settings.exportSelectAll    全选
 *   settings.exportDeselectAll  全不选
 * 用法：node scripts/add-export-picker-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾（与
 *   add-dir-missing-i18n.mjs 等既往补丁脚本保持一致）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'settings.exportPickHint',
  'settings.exportCatUi',
  'settings.exportCatPanel',
  'settings.exportCatTransfer',
  'settings.exportCatData',
  'settings.exportCatIcons',
  'settings.exportSelectAll',
  'settings.exportDeselectAll',
]

const T = {
  'settings.exportPickHint': {
    'af-ZA': 'Kies wat in die uitvoerlêer ingesluit moet word.',
    'bg-BG': 'Изберете какво да се включи във файла за експорт.',
    'cs-CZ': 'Vyberte, co má být součástí exportovaného souboru.',
    'da-DK': 'Vælg, hvad der skal med i eksportfilen.',
    'de-DE': 'Wählen Sie, was in die Exportdatei aufgenommen werden soll.',
    'en-GB': 'Choose what to include in the export file.',
    'en-US': 'Choose what to include in the export file.',
    'es-ES': 'Elige qué incluir en el archivo de exportación.',
    'fr-FR': 'Choisissez ce qui doit être inclus dans le fichier d\'export.',
    'hr-HR': 'Odaberite što uključiti u izvoznu datoteku.',
    'id-ID': 'Pilih apa yang akan disertakan dalam file ekspor.',
    'it-IT': 'Scegli cosa includere nel file di esportazione.',
    'ja-JP': 'エクスポートファイルに含める内容を選択してください。',
    'ko-KR': '내보내기 파일에 포함할 항목을 선택하세요.',
    'pl-PL': 'Wybierz, co ma zostać uwzględnione w pliku eksportu.',
    'pt-BR': 'Escolha o que incluir no arquivo de exportação.',
    'pt-PT': 'Escolha o que incluir no ficheiro de exportação.',
    'ru-RU': 'Выберите, что включить в файл экспорта.',
    'sr-Latn': 'Izaberite šta uključiti u izvoznu datoteku.',
    'sv-SE': 'Välj vad som ska ingå i exportfilen.',
    'tr-TR': 'Dışa aktarma dosyasına nelerin dahil edileceğini seçin.',
    'uk-UA': 'Виберіть, що включити до файлу експорту.',
    'zh-CN': '选择要包含在导出文件中的内容。',
    'zh-TW': '選擇要包含在匯出檔案中的內容。',
  },
  'settings.exportCatUi': {
    'af-ZA': 'Koppelvlak en voorkoms',
    'bg-BG': 'Интерфейс и външен вид',
    'cs-CZ': 'Rozhraní a vzhled',
    'da-DK': 'Grænseflade og udseende',
    'de-DE': 'Oberfläche und Aussehen',
    'en-GB': 'Interface and appearance',
    'en-US': 'Interface and appearance',
    'es-ES': 'Interfaz y apariencia',
    'fr-FR': 'Interface et apparence',
    'hr-HR': 'Sučelje i izgled',
    'id-ID': 'Antarmuka dan tampilan',
    'it-IT': 'Interfaccia e aspetto',
    'ja-JP': 'インターフェースと外観',
    'ko-KR': '인터페이스 및 모양',
    'pl-PL': 'Interfejs i wygląd',
    'pt-BR': 'Interface e aparência',
    'pt-PT': 'Interface e aparência',
    'ru-RU': 'Интерфейс и внешний вид',
    'sr-Latn': 'Interfejs i izgled',
    'sv-SE': 'Gränssnitt och utseende',
    'tr-TR': 'Arayüz ve görünüm',
    'uk-UA': 'Інтерфейс і вигляд',
    'zh-CN': '界面与外观',
    'zh-TW': '介面與外觀',
  },
  'settings.exportCatPanel': {
    'af-ZA': 'Paneel en gedrag',
    'bg-BG': 'Панел и поведение',
    'cs-CZ': 'Panel a chování',
    'da-DK': 'Panel og adfærd',
    'de-DE': 'Panel und Verhalten',
    'en-GB': 'Panel and behavior',
    'en-US': 'Panel and behavior',
    'es-ES': 'Panel y comportamiento',
    'fr-FR': 'Panneau et comportement',
    'hr-HR': 'Ploča i ponašanje',
    'id-ID': 'Panel dan perilaku',
    'it-IT': 'Pannello e comportamento',
    'ja-JP': 'パネルと動作',
    'ko-KR': '패널 및 동작',
    'pl-PL': 'Panel i zachowanie',
    'pt-BR': 'Painel e comportamento',
    'pt-PT': 'Painel e comportamento',
    'ru-RU': 'Панель и поведение',
    'sr-Latn': 'Panel i ponašanje',
    'sv-SE': 'Panel och beteende',
    'tr-TR': 'Panel ve davranış',
    'uk-UA': 'Панель і поведінка',
    'zh-CN': '面板与行为',
    'zh-TW': '面板與行為',
  },
  'settings.exportCatTransfer': {
    'af-ZA': 'Oordrag en konflikte',
    'bg-BG': 'Трансфер и конфликти',
    'cs-CZ': 'Přenos a konflikty',
    'da-DK': 'Overførsel og konflikter',
    'de-DE': 'Übertragung und Konflikte',
    'en-GB': 'Transfer and conflicts',
    'en-US': 'Transfer and conflicts',
    'es-ES': 'Transferencia y conflictos',
    'fr-FR': 'Transfert et conflits',
    'hr-HR': 'Prijenos i sukobi',
    'id-ID': 'Transfer dan konflik',
    'it-IT': 'Trasferimento e conflitti',
    'ja-JP': '転送と競合',
    'ko-KR': '전송 및 충돌',
    'pl-PL': 'Transfer i konflikty',
    'pt-BR': 'Transferência e conflitos',
    'pt-PT': 'Transferência e conflitos',
    'ru-RU': 'Передача и конфликты',
    'sr-Latn': 'Prenos i konflikti',
    'sv-SE': 'Överföring och konflikter',
    'tr-TR': 'Aktarım ve çakışmalar',
    'uk-UA': 'Передавання та конфлікти',
    'zh-CN': '传输与冲突',
    'zh-TW': '傳輸與衝突',
  },
  'settings.exportCatData': {
    'af-ZA': 'Boekmerke en rekords',
    'bg-BG': 'Отметки и записи',
    'cs-CZ': 'Záložky a záznamy',
    'da-DK': 'Bogmærker og poster',
    'de-DE': 'Lesezeichen und Aufzeichnungen',
    'en-GB': 'Bookmarks and records',
    'en-US': 'Bookmarks and records',
    'es-ES': 'Marcadores y registros',
    'fr-FR': 'Signets et enregistrements',
    'hr-HR': 'Oznake i zapisi',
    'id-ID': 'Markah dan catatan',
    'it-IT': 'Segnalibri e registri',
    'ja-JP': 'ブックマークと記録',
    'ko-KR': '북마크 및 기록',
    'pl-PL': 'Zakładki i rekordy',
    'pt-BR': 'Favoritos e registros',
    'pt-PT': 'Favoritos e registos',
    'ru-RU': 'Закладки и записи',
    'sr-Latn': 'Oznake i zapisi',
    'sv-SE': 'Bokmärken och poster',
    'tr-TR': 'Yer imleri ve kayıtlar',
    'uk-UA': 'Закладки та записи',
    'zh-CN': '书签与记录',
    'zh-TW': '書籤與記錄',
  },
  'settings.exportCatIcons': {
    'af-ZA': 'Ikone en lêertipes',
    'bg-BG': 'Икони и типове файлове',
    'cs-CZ': 'Ikony a typy souborů',
    'da-DK': 'Ikoner og filtyper',
    'de-DE': 'Symbole und Dateitypen',
    'en-GB': 'Icons and file types',
    'en-US': 'Icons and file types',
    'es-ES': 'Iconos y tipos de archivo',
    'fr-FR': 'Icônes et types de fichiers',
    'hr-HR': 'Ikone i vrste datoteka',
    'id-ID': 'Ikon dan jenis file',
    'it-IT': 'Icone e tipi di file',
    'ja-JP': 'アイコンとファイルの種類',
    'ko-KR': '아이콘 및 파일 형식',
    'pl-PL': 'Ikony i typy plików',
    'pt-BR': 'Ícones e tipos de arquivo',
    'pt-PT': 'Ícones e tipos de ficheiro',
    'ru-RU': 'Значки и типы файлов',
    'sr-Latn': 'Ikone i tipovi datoteka',
    'sv-SE': 'Ikoner och filtyper',
    'tr-TR': 'Simgeler ve dosya türleri',
    'uk-UA': 'Значки та типи файлів',
    'zh-CN': '图标与文件类型',
    'zh-TW': '圖示與檔案類型',
  },
  'settings.exportSelectAll': {
    'af-ZA': 'Kies alles',
    'bg-BG': 'Избери всички',
    'cs-CZ': 'Vybrat vše',
    'da-DK': 'Vælg alle',
    'de-DE': 'Alle auswählen',
    'en-GB': 'Select All',
    'en-US': 'Select All',
    'es-ES': 'Seleccionar todo',
    'fr-FR': 'Tout sélectionner',
    'hr-HR': 'Odaberi sve',
    'id-ID': 'Pilih semua',
    'it-IT': 'Seleziona tutto',
    'ja-JP': 'すべて選択',
    'ko-KR': '모두 선택',
    'pl-PL': 'Zaznacz wszystko',
    'pt-BR': 'Selecionar tudo',
    'pt-PT': 'Selecionar tudo',
    'ru-RU': 'Выбрать все',
    'sr-Latn': 'Izaberi sve',
    'sv-SE': 'Välj alla',
    'tr-TR': 'Tümünü seç',
    'uk-UA': 'Вибрати все',
    'zh-CN': '全选',
    'zh-TW': '全選',
  },
  'settings.exportDeselectAll': {
    'af-ZA': 'Ontkies alles',
    'bg-BG': 'Изчисти избора',
    'cs-CZ': 'Zrušit výběr',
    'da-DK': 'Ryd valg',
    'de-DE': 'Auswahl aufheben',
    'en-GB': 'Clear Selection',
    'en-US': 'Clear Selection',
    'es-ES': 'Borrar selección',
    'fr-FR': 'Effacer la sélection',
    'hr-HR': 'Očisti odabir',
    'id-ID': 'Hapus pilihan',
    'it-IT': 'Deseleziona tutto',
    'ja-JP': '選択を解除',
    'ko-KR': '선택 해제',
    'pl-PL': 'Wyczyść wybór',
    'pt-BR': 'Limpar seleção',
    'pt-PT': 'Limpar seleção',
    'ru-RU': 'Снять выделение',
    'sr-Latn': 'Očisti izbor',
    'sv-SE': 'Rensa val',
    'tr-TR': 'Seçimi temizle',
    'uk-UA': 'Очистити вибір',
    'zh-CN': '全不选',
    'zh-TW': '全不選',
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

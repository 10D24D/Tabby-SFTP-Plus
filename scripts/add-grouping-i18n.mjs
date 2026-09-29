#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「文件列表分组」相关 key
 *   pane.groupBy            分组依据（右键菜单区段标题）
 *   group.none/name/modified/type/size  分组依据五个选项
 *   group.expand/collapse   分组表头箭头悬停提示
 *   group.today/yesterday/thisWeek/thisMonth/earlierThisYear/longAgo  日期分组桶
 *   group.folder/noExt/typeFiles  类型分组桶（typeFiles 为「ZIP 文件」的后缀词）
 *   group.sizeTiny..sizeSuper 大小分组桶
 *   group.digit/a2h/i2p/q2z/pyAF/pyGL/pyMS/pyTZ/other  名称分组桶
 * 用法：node scripts/add-grouping-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'pane.groupBy',
  'group.none', 'group.name', 'group.modified', 'group.type', 'group.size',
  'group.expand', 'group.collapse',
  'group.today', 'group.yesterday', 'group.thisWeek', 'group.thisMonth', 'group.earlierThisYear', 'group.longAgo',
  'group.folder', 'group.noExt', 'group.typeFiles',
  'group.sizeTiny', 'group.sizeSmall', 'group.sizeMedium', 'group.sizeLarge', 'group.sizeHuge', 'group.sizeSuper',
  'group.digit', 'group.a2h', 'group.i2p', 'group.q2z',
  'group.pyAF', 'group.pyGL', 'group.pyMS', 'group.pyTZ', 'group.other',
]

const T = {
  'pane.groupBy': {
    'af-ZA': 'Groepeer volgens', 'bg-BG': 'Групиране по', 'cs-CZ': 'Seskupit podle', 'da-DK': 'Gruppér efter',
    'de-DE': 'Gruppieren nach', 'en-GB': 'Group by', 'en-US': 'Group by', 'es-ES': 'Agrupar por',
    'fr-FR': 'Grouper par', 'hr-HR': 'Grupiraj prema', 'id-ID': 'Kelompokkan menurut', 'it-IT': 'Raggruppa per',
    'ja-JP': 'グループ化', 'ko-KR': '그룹 기준', 'pl-PL': 'Grupuj według', 'pt-BR': 'Agrupar por',
    'pt-PT': 'Agrupar por', 'ru-RU': 'Группировать по', 'sr-Latn': 'Grupiši po', 'sv-SE': 'Gruppera efter',
    'tr-TR': 'Gruplandır', 'uk-UA': 'Групувати за', 'zh-CN': '分组依据', 'zh-TW': '分組依據',
  },
  'group.none': {
    'af-ZA': 'Geen', 'bg-BG': 'Няма', 'cs-CZ': 'Žádná', 'da-DK': 'Ingen',
    'de-DE': 'Keine', 'en-GB': 'None', 'en-US': 'None', 'es-ES': 'Ninguno',
    'fr-FR': 'Aucun', 'hr-HR': 'Nema', 'id-ID': 'Tidak ada', 'it-IT': 'Nessuno',
    'ja-JP': 'なし', 'ko-KR': '없음', 'pl-PL': 'Brak', 'pt-BR': 'Nenhum',
    'pt-PT': 'Nenhum', 'ru-RU': 'Нет', 'sr-Latn': 'Nema', 'sv-SE': 'Ingen',
    'tr-TR': 'Yok', 'uk-UA': 'Немає', 'zh-CN': '无', 'zh-TW': '無',
  },
  'group.name': {
    'af-ZA': 'Naam', 'bg-BG': 'Име', 'cs-CZ': 'Název', 'da-DK': 'Navn',
    'de-DE': 'Name', 'en-GB': 'Name', 'en-US': 'Name', 'es-ES': 'Nombre',
    'fr-FR': 'Nom', 'hr-HR': 'Naziv', 'id-ID': 'Nama', 'it-IT': 'Nome',
    'ja-JP': '名前', 'ko-KR': '이름', 'pl-PL': 'Nazwa', 'pt-BR': 'Nome',
    'pt-PT': 'Nome', 'ru-RU': 'Имя', 'sr-Latn': 'Naziv', 'sv-SE': 'Namn',
    'tr-TR': 'Ad', 'uk-UA': 'Імʼя', 'zh-CN': '名称', 'zh-TW': '名稱',
  },
  'group.modified': {
    'af-ZA': 'Wysigingsdatum', 'bg-BG': 'Дата на промяна', 'cs-CZ': 'Datum úpravy', 'da-DK': 'Ændringsdato',
    'de-DE': 'Änderungsdatum', 'en-GB': 'Date modified', 'en-US': 'Date modified', 'es-ES': 'Fecha de modificación',
    'fr-FR': 'Date de modification', 'hr-HR': 'Datum izmjene', 'id-ID': 'Tanggal diubah', 'it-IT': 'Data modifica',
    'ja-JP': '更新日時', 'ko-KR': '수정한 날짜', 'pl-PL': 'Data modyfikacji', 'pt-BR': 'Data de modificação',
    'pt-PT': 'Data de modificação', 'ru-RU': 'Дата изменения', 'sr-Latn': 'Datum izmene', 'sv-SE': 'Ändringsdatum',
    'tr-TR': 'Değiştirme tarihi', 'uk-UA': 'Дата змінення', 'zh-CN': '修改日期', 'zh-TW': '修改日期',
  },
  'group.type': {
    'af-ZA': 'Tipe', 'bg-BG': 'Тип', 'cs-CZ': 'Typ', 'da-DK': 'Type',
    'de-DE': 'Typ', 'en-GB': 'Type', 'en-US': 'Type', 'es-ES': 'Tipo',
    'fr-FR': 'Type', 'hr-HR': 'Vrsta', 'id-ID': 'Tipe', 'it-IT': 'Tipo',
    'ja-JP': '種類', 'ko-KR': '종류', 'pl-PL': 'Typ', 'pt-BR': 'Tipo',
    'pt-PT': 'Tipo', 'ru-RU': 'Тип', 'sr-Latn': 'Vrsta', 'sv-SE': 'Typ',
    'tr-TR': 'Tür', 'uk-UA': 'Тип', 'zh-CN': '类型', 'zh-TW': '類型',
  },
  'group.size': {
    'af-ZA': 'Grootte', 'bg-BG': 'Размер', 'cs-CZ': 'Velikost', 'da-DK': 'Størrelse',
    'de-DE': 'Größe', 'en-GB': 'Size', 'en-US': 'Size', 'es-ES': 'Tamaño',
    'fr-FR': 'Taille', 'hr-HR': 'Veličina', 'id-ID': 'Ukuran', 'it-IT': 'Dimensione',
    'ja-JP': 'サイズ', 'ko-KR': '크기', 'pl-PL': 'Rozmiar', 'pt-BR': 'Tamanho',
    'pt-PT': 'Tamanho', 'ru-RU': 'Размер', 'sr-Latn': 'Veličina', 'sv-SE': 'Storlek',
    'tr-TR': 'Boyut', 'uk-UA': 'Розмір', 'zh-CN': '大小', 'zh-TW': '大小',
  },
  'group.expand': {
    'af-ZA': 'Vou uit', 'bg-BG': 'Разгъване', 'cs-CZ': 'Rozbalit', 'da-DK': 'Udvid',
    'de-DE': 'Ausklappen', 'en-GB': 'Expand', 'en-US': 'Expand', 'es-ES': 'Expandir',
    'fr-FR': 'Développer', 'hr-HR': 'Proširi', 'id-ID': 'Perluas', 'it-IT': 'Espandi',
    'ja-JP': '展開', 'ko-KR': '펼치기', 'pl-PL': 'Rozwiń', 'pt-BR': 'Expandir',
    'pt-PT': 'Expandir', 'ru-RU': 'Развернуть', 'sr-Latn': 'Proširi', 'sv-SE': 'Utöka',
    'tr-TR': 'Genişlet', 'uk-UA': 'Розгорнути', 'zh-CN': '展开', 'zh-TW': '展開',
  },
  'group.collapse': {
    'af-ZA': 'Vou in', 'bg-BG': 'Свиване', 'cs-CZ': 'Sbalit', 'da-DK': 'Skjul',
    'de-DE': 'Einklappen', 'en-GB': 'Collapse', 'en-US': 'Collapse', 'es-ES': 'Contraer',
    'fr-FR': 'Réduire', 'hr-HR': 'Skupi', 'id-ID': 'Ciutkan', 'it-IT': 'Comprimi',
    'ja-JP': '折りたたむ', 'ko-KR': '접기', 'pl-PL': 'Zwiń', 'pt-BR': 'Recolher',
    'pt-PT': 'Recolher', 'ru-RU': 'Свернуть', 'sr-Latn': 'Skupi', 'sv-SE': 'Fäll ihop',
    'tr-TR': 'Daralt', 'uk-UA': 'Згорнути', 'zh-CN': '折叠', 'zh-TW': '摺疊',
  },
  'group.today': {
    'af-ZA': 'Vandag', 'bg-BG': 'Днес', 'cs-CZ': 'Dnes', 'da-DK': 'I dag',
    'de-DE': 'Heute', 'en-GB': 'Today', 'en-US': 'Today', 'es-ES': 'Hoy',
    'fr-FR': 'Aujourdʼhui', 'hr-HR': 'Danas', 'id-ID': 'Hari ini', 'it-IT': 'Oggi',
    'ja-JP': '今日', 'ko-KR': '오늘', 'pl-PL': 'Dzisiaj', 'pt-BR': 'Hoje',
    'pt-PT': 'Hoje', 'ru-RU': 'Сегодня', 'sr-Latn': 'Danas', 'sv-SE': 'Idag',
    'tr-TR': 'Bugün', 'uk-UA': 'Сьогодні', 'zh-CN': '今天', 'zh-TW': '今天',
  },
  'group.yesterday': {
    'af-ZA': 'Gister', 'bg-BG': 'Вчера', 'cs-CZ': 'Včera', 'da-DK': 'I går',
    'de-DE': 'Gestern', 'en-GB': 'Yesterday', 'en-US': 'Yesterday', 'es-ES': 'Ayer',
    'fr-FR': 'Hier', 'hr-HR': 'Jučer', 'id-ID': 'Kemarin', 'it-IT': 'Ieri',
    'ja-JP': '昨日', 'ko-KR': '어제', 'pl-PL': 'Wczoraj', 'pt-BR': 'Ontem',
    'pt-PT': 'Ontem', 'ru-RU': 'Вчера', 'sr-Latn': 'Juče', 'sv-SE': 'Igår',
    'tr-TR': 'Dün', 'uk-UA': 'Вчора', 'zh-CN': '昨天', 'zh-TW': '昨天',
  },
  'group.thisWeek': {
    'af-ZA': 'Vroeër hierdie week', 'bg-BG': 'По-рано тази седмица', 'cs-CZ': 'Dříve tento týden', 'da-DK': 'Tidligere på ugen',
    'de-DE': 'Früher diese Woche', 'en-GB': 'Earlier this week', 'en-US': 'Earlier this week', 'es-ES': 'Anteriormente esta semana',
    'fr-FR': 'Plus tôt cette semaine', 'hr-HR': 'Ranije ovaj tjedan', 'id-ID': 'Lebih awal pekan ini', 'it-IT': 'Prima di questa settimana',
    'ja-JP': '今週', 'ko-KR': '이번 주', 'pl-PL': 'Wcześniej w tym tygodniu', 'pt-BR': 'Anteriormente nesta semana',
    'pt-PT': 'Anteriormente nesta semana', 'ru-RU': 'Ранее на этой неделе', 'sr-Latn': 'Ranije ove nedelje', 'sv-SE': 'Tidigare denna vecka',
    'tr-TR': 'Bu hafta daha erken', 'uk-UA': 'Раніше цього тижня', 'zh-CN': '本周', 'zh-TW': '本週',
  },
  'group.thisMonth': {
    'af-ZA': 'Vroeër hierdie maand', 'bg-BG': 'По-рано този месец', 'cs-CZ': 'Dříve tento měsíc', 'da-DK': 'Tidligere på måneden',
    'de-DE': 'Früher diesen Monat', 'en-GB': 'Earlier this month', 'en-US': 'Earlier this month', 'es-ES': 'Anteriormente este mes',
    'fr-FR': 'Plus tôt ce mois-ci', 'hr-HR': 'Ranije ovaj mjesec', 'id-ID': 'Lebih awal bulan ini', 'it-IT': 'Prima di questo mese',
    'ja-JP': '今月', 'ko-KR': '이번 달', 'pl-PL': 'Wcześniej w tym miesiącu', 'pt-BR': 'Anteriormente neste mês',
    'pt-PT': 'Anteriormente neste mês', 'ru-RU': 'Ранее в этом месяце', 'sr-Latn': 'Ranije ovog meseca', 'sv-SE': 'Tidigare denna månad',
    'tr-TR': 'Bu ay daha erken', 'uk-UA': 'Раніше цього місяця', 'zh-CN': '本月', 'zh-TW': '本月',
  },
  'group.earlierThisYear': {
    'af-ZA': 'Vroeër vanjaar', 'bg-BG': 'По-рано тази година', 'cs-CZ': 'Dříve tento rok', 'da-DK': 'Tidligere på året',
    'de-DE': 'Früher in diesem Jahr', 'en-GB': 'Earlier this year', 'en-US': 'Earlier this year', 'es-ES': 'Anteriormente este año',
    'fr-FR': 'Plus tôt cette année', 'hr-HR': 'Ranije ove godine', 'id-ID': 'Lebih awal tahun ini', 'it-IT': 'Prima di questʼanno',
    'ja-JP': '今年', 'ko-KR': '올해', 'pl-PL': 'Wcześniej w tym roku', 'pt-BR': 'Anteriormente este ano',
    'pt-PT': 'Anteriormente este ano', 'ru-RU': 'Ранее в этом году', 'sr-Latn': 'Ranije ove godine', 'sv-SE': 'Tidigare i år',
    'tr-TR': 'Bu yıl daha erken', 'uk-UA': 'Раніше цього року', 'zh-CN': '今年早些时候', 'zh-TW': '今年較早時候',
  },
  'group.longAgo': {
    'af-ZA': 'Lank gelede', 'bg-BG': 'Отдавна', 'cs-CZ': 'Dávno', 'da-DK': 'For længe siden',
    'de-DE': 'Vor langer Zeit', 'en-GB': 'A long time ago', 'en-US': 'A long time ago', 'es-ES': 'Hace mucho tiempo',
    'fr-FR': 'Il y a longtemps', 'hr-HR': 'Davno', 'id-ID': 'Lama sekali', 'it-IT': 'Molto tempo fa',
    'ja-JP': 'ずっと前', 'ko-KR': '오래 전', 'pl-PL': 'Dawno temu', 'pt-BR': 'Há muito tempo',
    'pt-PT': 'Há muito tempo', 'ru-RU': 'Давно', 'sr-Latn': 'Davno', 'sv-SE': 'Länge sedan',
    'tr-TR': 'Uzun zaman önce', 'uk-UA': 'Давно', 'zh-CN': '很久以前', 'zh-TW': '很久以前',
  },
  'group.folder': {
    'af-ZA': 'Vouer', 'bg-BG': 'Папка', 'cs-CZ': 'Složka', 'da-DK': 'Mappe',
    'de-DE': 'Ordner', 'en-GB': 'Folder', 'en-US': 'Folder', 'es-ES': 'Carpeta',
    'fr-FR': 'Dossier', 'hr-HR': 'Mapa', 'id-ID': 'Folder', 'it-IT': 'Cartella',
    'ja-JP': 'フォルダー', 'ko-KR': '폴더', 'pl-PL': 'Folder', 'pt-BR': 'Pasta',
    'pt-PT': 'Pasta', 'ru-RU': 'Папка', 'sr-Latn': 'Fascikla', 'sv-SE': 'Mapp',
    'tr-TR': 'Klasör', 'uk-UA': 'Папка', 'zh-CN': '文件夹', 'zh-TW': '資料夾',
  },
  'group.noExt': {
    'af-ZA': 'Ander lêers', 'bg-BG': 'Други файлове', 'cs-CZ': 'Ostatní soubory', 'da-DK': 'Andre filer',
    'de-DE': 'Sonstige Dateien', 'en-GB': 'Other files', 'en-US': 'Other files', 'es-ES': 'Otros archivos',
    'fr-FR': 'Autres fichiers', 'hr-HR': 'Ostale datoteke', 'id-ID': 'File lain', 'it-IT': 'Altri file',
    'ja-JP': 'その他のファイル', 'ko-KR': '기타 파일', 'pl-PL': 'Inne pliki', 'pt-BR': 'Outros arquivos',
    'pt-PT': 'Outros ficheiros', 'ru-RU': 'Другие файлы', 'sr-Latn': 'Ostale datoteke', 'sv-SE': 'Andra filer',
    'tr-TR': 'Diğer dosyalar', 'uk-UA': 'Інші файли', 'zh-CN': '其他文件', 'zh-TW': '其他檔案',
  },
  'group.typeFiles': {
    'af-ZA': 'lêers', 'bg-BG': 'файлове', 'cs-CZ': 'soubory', 'da-DK': 'filer',
    'de-DE': 'Dateien', 'en-GB': 'files', 'en-US': 'files', 'es-ES': 'archivos',
    'fr-FR': 'fichiers', 'hr-HR': 'datoteke', 'id-ID': 'file', 'it-IT': 'file',
    'ja-JP': 'ファイル', 'ko-KR': '파일', 'pl-PL': 'pliki', 'pt-BR': 'arquivos',
    'pt-PT': 'ficheiros', 'ru-RU': 'файлы', 'sr-Latn': 'datoteke', 'sv-SE': 'filer',
    'tr-TR': 'dosyaları', 'uk-UA': 'файли', 'zh-CN': '文件', 'zh-TW': '檔案',
  },
  'group.sizeTiny': {
    'af-ZA': 'Baie klein (0-16 KB)', 'bg-BG': 'Много малък (0-16 KB)', 'cs-CZ': 'Velmi malý (0-16 KB)', 'da-DK': 'Meget lille (0-16 KB)',
    'de-DE': 'Winzig (0-16 KB)', 'en-GB': 'Tiny (0-16 KB)', 'en-US': 'Tiny (0-16 KB)', 'es-ES': 'Diminuto (0-16 KB)',
    'fr-FR': 'Minuscule (0-16 KB)', 'hr-HR': 'Vrlo mala (0-16 KB)', 'id-ID': 'Sangat kecil (0-16 KB)', 'it-IT': 'Minuscolo (0-16 KB)',
    'ja-JP': '極小 (0-16 KB)', 'ko-KR': '극소 (0-16 KB)', 'pl-PL': 'Bardzo mały (0-16 KB)', 'pt-BR': 'Minúsculo (0-16 KB)',
    'pt-PT': 'Minúsculo (0-16 KB)', 'ru-RU': 'Крошечный (0-16 KB)', 'sr-Latn': 'Vrlo mala (0-16 KB)', 'sv-SE': 'Mycket liten (0-16 KB)',
    'tr-TR': 'Çok küçük (0-16 KB)', 'uk-UA': 'Дуже малий (0-16 KB)', 'zh-CN': '极小(0-16 KB)', 'zh-TW': '極小(0-16 KB)',
  },
  'group.sizeSmall': {
    'af-ZA': 'Klein (16 KB - 1 MB)', 'bg-BG': 'Малък (16 KB - 1 MB)', 'cs-CZ': 'Malý (16 KB - 1 MB)', 'da-DK': 'Lille (16 KB - 1 MB)',
    'de-DE': 'Klein (16 KB - 1 MB)', 'en-GB': 'Small (16 KB - 1 MB)', 'en-US': 'Small (16 KB - 1 MB)', 'es-ES': 'Pequeño (16 KB - 1 MB)',
    'fr-FR': 'Petit (16 KB - 1 MB)', 'hr-HR': 'Mala (16 KB - 1 MB)', 'id-ID': 'Kecil (16 KB - 1 MB)', 'it-IT': 'Piccolo (16 KB - 1 MB)',
    'ja-JP': '小 (16 KB - 1 MB)', 'ko-KR': '소 (16 KB - 1 MB)', 'pl-PL': 'Mały (16 KB - 1 MB)', 'pt-BR': 'Pequeno (16 KB - 1 MB)',
    'pt-PT': 'Pequeno (16 KB - 1 MB)', 'ru-RU': 'Малый (16 KB - 1 MB)', 'sr-Latn': 'Mala (16 KB - 1 MB)', 'sv-SE': 'Liten (16 KB - 1 MB)',
    'tr-TR': 'Küçük (16 KB - 1 MB)', 'uk-UA': 'Малий (16 KB - 1 MB)', 'zh-CN': '小(16 KB - 1 MB)', 'zh-TW': '小(16 KB - 1 MB)',
  },
  'group.sizeMedium': {
    'af-ZA': 'Medium (1-128 MB)', 'bg-BG': 'Среден (1-128 MB)', 'cs-CZ': 'Střední (1-128 MB)', 'da-DK': 'Mellem (1-128 MB)',
    'de-DE': 'Mittel (1-128 MB)', 'en-GB': 'Medium (1-128 MB)', 'en-US': 'Medium (1-128 MB)', 'es-ES': 'Mediano (1-128 MB)',
    'fr-FR': 'Moyen (1-128 MB)', 'hr-HR': 'Srednja (1-128 MB)', 'id-ID': 'Sedang (1-128 MB)', 'it-IT': 'Medio (1-128 MB)',
    'ja-JP': '中 (1-128 MB)', 'ko-KR': '중간 (1-128 MB)', 'pl-PL': 'Średni (1-128 MB)', 'pt-BR': 'Médio (1-128 MB)',
    'pt-PT': 'Médio (1-128 MB)', 'ru-RU': 'Средний (1-128 MB)', 'sr-Latn': 'Srednja (1-128 MB)', 'sv-SE': 'Medel (1-128 MB)',
    'tr-TR': 'Orta (1-128 MB)', 'uk-UA': 'Середній (1-128 MB)', 'zh-CN': '中等(1-128 MB)', 'zh-TW': '中等(1-128 MB)',
  },
  'group.sizeLarge': {
    'af-ZA': 'Groot (128 MB - 1 GB)', 'bg-BG': 'Голям (128 MB - 1 GB)', 'cs-CZ': 'Velký (128 MB - 1 GB)', 'da-DK': 'Stor (128 MB - 1 GB)',
    'de-DE': 'Groß (128 MB - 1 GB)', 'en-GB': 'Large (128 MB - 1 GB)', 'en-US': 'Large (128 MB - 1 GB)', 'es-ES': 'Grande (128 MB - 1 GB)',
    'fr-FR': 'Grand (128 MB - 1 GB)', 'hr-HR': 'Velika (128 MB - 1 GB)', 'id-ID': 'Besar (128 MB - 1 GB)', 'it-IT': 'Grande (128 MB - 1 GB)',
    'ja-JP': '大 (128 MB - 1 GB)', 'ko-KR': '대 (128 MB - 1 GB)', 'pl-PL': 'Duży (128 MB - 1 GB)', 'pt-BR': 'Grande (128 MB - 1 GB)',
    'pt-PT': 'Grande (128 MB - 1 GB)', 'ru-RU': 'Большой (128 MB - 1 GB)', 'sr-Latn': 'Velika (128 MB - 1 GB)', 'sv-SE': 'Stor (128 MB - 1 GB)',
    'tr-TR': 'Büyük (128 MB - 1 GB)', 'uk-UA': 'Великий (128 MB - 1 GB)', 'zh-CN': '大(128 MB - 1 GB)', 'zh-TW': '大(128 MB - 1 GB)',
  },
  'group.sizeHuge': {
    'af-ZA': 'Reuse (1-4 GB)', 'bg-BG': 'Огромен (1-4 GB)', 'cs-CZ': 'Obrovský (1-4 GB)', 'da-DK': 'Kæmpe (1-4 GB)',
    'de-DE': 'Riesig (1-4 GB)', 'en-GB': 'Huge (1-4 GB)', 'en-US': 'Huge (1-4 GB)', 'es-ES': 'Enorme (1-4 GB)',
    'fr-FR': 'Énorme (1-4 GB)', 'hr-HR': 'Ogromna (1-4 GB)', 'id-ID': 'Raksasa (1-4 GB)', 'it-IT': 'Enorme (1-4 GB)',
    'ja-JP': '巨大 (1-4 GB)', 'ko-KR': '거대 (1-4 GB)', 'pl-PL': 'Ogromny (1-4 GB)', 'pt-BR': 'Enorme (1-4 GB)',
    'pt-PT': 'Enorme (1-4 GB)', 'ru-RU': 'Огромный (1-4 GB)', 'sr-Latn': 'Ogromna (1-4 GB)', 'sv-SE': 'Enorm (1-4 GB)',
    'tr-TR': 'Dev (1-4 GB)', 'uk-UA': 'Величезний (1-4 GB)', 'zh-CN': '巨大(1-4 GB)', 'zh-TW': '巨大(1-4 GB)',
  },
  'group.sizeSuper': {
    'af-ZA': 'Enorm (>4 GB)', 'bg-BG': 'Гигантски (>4 GB)', 'cs-CZ': 'Obří (>4 GB)', 'da-DK': 'Enorm (>4 GB)',
    'de-DE': 'Enorm (>4 GB)', 'en-GB': 'Enormous (>4 GB)', 'en-US': 'Enormous (>4 GB)', 'es-ES': 'Gigante (>4 GB)',
    'fr-FR': 'Gigantesque (>4 GB)', 'hr-HR': 'Gigantska (>4 GB)', 'id-ID': 'Sangat besar (>4 GB)', 'it-IT': 'Gigante (>4 GB)',
    'ja-JP': '超大 (>4 GB)', 'ko-KR': '초대 (>4 GB)', 'pl-PL': 'Gigantyczny (>4 GB)', 'pt-BR': 'Gigante (>4 GB)',
    'pt-PT': 'Gigante (>4 GB)', 'ru-RU': 'Гигантский (>4 GB)', 'sr-Latn': 'Gigantska (>4 GB)', 'sv-SE': 'Jättelik (>4 GB)',
    'tr-TR': 'Kocaman (>4 GB)', 'uk-UA': 'Гігантський (>4 GB)', 'zh-CN': '超大(>4 GB)', 'zh-TW': '超大(>4 GB)',
  },
  'group.digit': {
    'af-ZA': '0-9', 'bg-BG': '0-9', 'cs-CZ': '0-9', 'da-DK': '0-9',
    'de-DE': '0-9', 'en-GB': '0-9', 'en-US': '0-9', 'es-ES': '0-9',
    'fr-FR': '0-9', 'hr-HR': '0-9', 'id-ID': '0-9', 'it-IT': '0-9',
    'ja-JP': '0-9', 'ko-KR': '0-9', 'pl-PL': '0-9', 'pt-BR': '0-9',
    'pt-PT': '0-9', 'ru-RU': '0-9', 'sr-Latn': '0-9', 'sv-SE': '0-9',
    'tr-TR': '0-9', 'uk-UA': '0-9', 'zh-CN': '0-9', 'zh-TW': '0-9',
  },
  'group.a2h': {
    'af-ZA': 'A-H', 'bg-BG': 'A-H', 'cs-CZ': 'A-H', 'da-DK': 'A-H',
    'de-DE': 'A-H', 'en-GB': 'A-H', 'en-US': 'A-H', 'es-ES': 'A-H',
    'fr-FR': 'A-H', 'hr-HR': 'A-H', 'id-ID': 'A-H', 'it-IT': 'A-H',
    'ja-JP': 'A-H', 'ko-KR': 'A-H', 'pl-PL': 'A-H', 'pt-BR': 'A-H',
    'pt-PT': 'A-H', 'ru-RU': 'A-H', 'sr-Latn': 'A-H', 'sv-SE': 'A-H',
    'tr-TR': 'A-H', 'uk-UA': 'A-H', 'zh-CN': 'A-H', 'zh-TW': 'A-H',
  },
  'group.i2p': {
    'af-ZA': 'I-P', 'bg-BG': 'I-P', 'cs-CZ': 'I-P', 'da-DK': 'I-P',
    'de-DE': 'I-P', 'en-GB': 'I-P', 'en-US': 'I-P', 'es-ES': 'I-P',
    'fr-FR': 'I-P', 'hr-HR': 'I-P', 'id-ID': 'I-P', 'it-IT': 'I-P',
    'ja-JP': 'I-P', 'ko-KR': 'I-P', 'pl-PL': 'I-P', 'pt-BR': 'I-P',
    'pt-PT': 'I-P', 'ru-RU': 'I-P', 'sr-Latn': 'I-P', 'sv-SE': 'I-P',
    'tr-TR': 'I-P', 'uk-UA': 'I-P', 'zh-CN': 'I-P', 'zh-TW': 'I-P',
  },
  'group.q2z': {
    'af-ZA': 'Q-Z', 'bg-BG': 'Q-Z', 'cs-CZ': 'Q-Z', 'da-DK': 'Q-Z',
    'de-DE': 'Q-Z', 'en-GB': 'Q-Z', 'en-US': 'Q-Z', 'es-ES': 'Q-Z',
    'fr-FR': 'Q-Z', 'hr-HR': 'Q-Z', 'id-ID': 'Q-Z', 'it-IT': 'Q-Z',
    'ja-JP': 'Q-Z', 'ko-KR': 'Q-Z', 'pl-PL': 'Q-Z', 'pt-BR': 'Q-Z',
    'pt-PT': 'Q-Z', 'ru-RU': 'Q-Z', 'sr-Latn': 'Q-Z', 'sv-SE': 'Q-Z',
    'tr-TR': 'Q-Z', 'uk-UA': 'Q-Z', 'zh-CN': 'Q-Z', 'zh-TW': 'Q-Z',
  },
  'group.pyAF': {
    'af-ZA': 'Pinyin A-F', 'bg-BG': 'Пинин A-F', 'cs-CZ': 'Pinyin A-F', 'da-DK': 'Pinyin A-F',
    'de-DE': 'Pinyin A-F', 'en-GB': 'Pinyin A-F', 'en-US': 'Pinyin A-F', 'es-ES': 'Pinyin A-F',
    'fr-FR': 'Pinyin A-F', 'hr-HR': 'Pinyin A-F', 'id-ID': 'Pinyin A-F', 'it-IT': 'Pinyin A-F',
    'ja-JP': 'ピンイン A-F', 'ko-KR': '병음 A-F', 'pl-PL': 'Pinyin A-F', 'pt-BR': 'Pinyin A-F',
    'pt-PT': 'Pinyin A-F', 'ru-RU': 'Пиньинь A-F', 'sr-Latn': 'Pinyin A-F', 'sv-SE': 'Pinyin A-F',
    'tr-TR': 'Pinyin A-F', 'uk-UA': 'Піньїнь A-F', 'zh-CN': '拼音 A-F', 'zh-TW': '拼音 A-F',
  },
  'group.pyGL': {
    'af-ZA': 'Pinyin G-L', 'bg-BG': 'Пинин G-L', 'cs-CZ': 'Pinyin G-L', 'da-DK': 'Pinyin G-L',
    'de-DE': 'Pinyin G-L', 'en-GB': 'Pinyin G-L', 'en-US': 'Pinyin G-L', 'es-ES': 'Pinyin G-L',
    'fr-FR': 'Pinyin G-L', 'hr-HR': 'Pinyin G-L', 'id-ID': 'Pinyin G-L', 'it-IT': 'Pinyin G-L',
    'ja-JP': 'ピンイン G-L', 'ko-KR': '병음 G-L', 'pl-PL': 'Pinyin G-L', 'pt-BR': 'Pinyin G-L',
    'pt-PT': 'Pinyin G-L', 'ru-RU': 'Пиньинь G-L', 'sr-Latn': 'Pinyin G-L', 'sv-SE': 'Pinyin G-L',
    'tr-TR': 'Pinyin G-L', 'uk-UA': 'Піньїнь G-L', 'zh-CN': '拼音 G-L', 'zh-TW': '拼音 G-L',
  },
  'group.pyMS': {
    'af-ZA': 'Pinyin M-S', 'bg-BG': 'Пинин M-S', 'cs-CZ': 'Pinyin M-S', 'da-DK': 'Pinyin M-S',
    'de-DE': 'Pinyin M-S', 'en-GB': 'Pinyin M-S', 'en-US': 'Pinyin M-S', 'es-ES': 'Pinyin M-S',
    'fr-FR': 'Pinyin M-S', 'hr-HR': 'Pinyin M-S', 'id-ID': 'Pinyin M-S', 'it-IT': 'Pinyin M-S',
    'ja-JP': 'ピンイン M-S', 'ko-KR': '병음 M-S', 'pl-PL': 'Pinyin M-S', 'pt-BR': 'Pinyin M-S',
    'pt-PT': 'Pinyin M-S', 'ru-RU': 'Пиньинь M-S', 'sr-Latn': 'Pinyin M-S', 'sv-SE': 'Pinyin M-S',
    'tr-TR': 'Pinyin M-S', 'uk-UA': 'Піньїнь M-S', 'zh-CN': '拼音 M-S', 'zh-TW': '拼音 M-S',
  },
  'group.pyTZ': {
    'af-ZA': 'Pinyin T-Z', 'bg-BG': 'Пинин T-Z', 'cs-CZ': 'Pinyin T-Z', 'da-DK': 'Pinyin T-Z',
    'de-DE': 'Pinyin T-Z', 'en-GB': 'Pinyin T-Z', 'en-US': 'Pinyin T-Z', 'es-ES': 'Pinyin T-Z',
    'fr-FR': 'Pinyin T-Z', 'hr-HR': 'Pinyin T-Z', 'id-ID': 'Pinyin T-Z', 'it-IT': 'Pinyin T-Z',
    'ja-JP': 'ピンイン T-Z', 'ko-KR': '병음 T-Z', 'pl-PL': 'Pinyin T-Z', 'pt-BR': 'Pinyin T-Z',
    'pt-PT': 'Pinyin T-Z', 'ru-RU': 'Пиньинь T-Z', 'sr-Latn': 'Pinyin T-Z', 'sv-SE': 'Pinyin T-Z',
    'tr-TR': 'Pinyin T-Z', 'uk-UA': 'Піньїнь T-Z', 'zh-CN': '拼音 T-Z', 'zh-TW': '拼音 T-Z',
  },
  'group.other': {
    'af-ZA': 'Ander', 'bg-BG': 'Други', 'cs-CZ': 'Ostatní', 'da-DK': 'Andre',
    'de-DE': 'Sonstige', 'en-GB': 'Other', 'en-US': 'Other', 'es-ES': 'Otros',
    'fr-FR': 'Autres', 'hr-HR': 'Ostalo', 'id-ID': 'Lainnya', 'it-IT': 'Altro',
    'ja-JP': 'その他', 'ko-KR': '기타', 'pl-PL': 'Inne', 'pt-BR': 'Outros',
    'pt-PT': 'Outros', 'ru-RU': 'Другое', 'sr-Latn': 'Ostalo', 'sv-SE': 'Andra',
    'tr-TR': 'Diğer', 'uk-UA': 'Інші', 'zh-CN': '其他', 'zh-TW': '其他',
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

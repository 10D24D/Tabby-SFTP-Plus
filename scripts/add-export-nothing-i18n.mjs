#!/usr/bin/env node
/**
 * 功能描述：24 语言 .po 的「导出内容为空」提示文案迁移
 *   新增：
 *     settings.exportNothing        点「导出数据」后，勾选的类别在本机没有数据
 *                                   （最典型：只勾「传输记录」但本机无传输日志）
 *                                   ⇒ 不生成备份文件时的提示
 * 背景（audit P2-34）：exportData 用 `if (field in all)` 过滤勾选类别，本机没有的字段
 *   根本不在 all 里 ⇒ 过滤结果为空 ⇒ 静默关闭弹窗、不下载也不提示，用户以为导出坏了。
 *   修法是在该分支补 alert(this.i18n.t('settings.exportNothing'))，故需此文案。
 *   已核查既有 key（settings.exportPickHint / importComplete / importFailed 等）均无
 *   语义相符者可复用 ⇒ 新增本 key。
 * 用法：node scripts/add-export-nothing-i18n.mjs
 * 说明：幂等 —— 新 key 已存在则跳过；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Step-5-Preview
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const NEW_KEYS = [
  'settings.exportNothing',
]

const T = {
  'settings.exportNothing': {
    'af-ZA': 'Niks om uit te voer nie: die gekose kategorieë bevat geen data nie (bv. geen oordraglogboeke op hierdie rekenaar nie). Geen rugsteunlêer is geskep nie.',
    'bg-BG': 'Няма данни за експорт: избраните категории не съдържат данни (напр. няма журнал за трансфери на този компютър). Не е създаден резервен файл.',
    'cs-CZ': 'Není co exportovat: vybrané kategorie neobsahují žádná data (např. na tomto počítači nejsou záznamy přenosů). Záložní soubor nebyl vytvořen.',
    'da-DK': 'Intet at eksportere: de valgte kategorier indeholder ingen data (f.eks. ingen overførselslog på denne maskine). Der blev ikke oprettet nogen sikkerhedskopifil.',
    'de-DE': 'Nichts zu exportieren: Die ausgewählten Kategorien enthalten keine Daten (z. B. keine Übertragungsprotokolle auf diesem Rechner). Es wurde keine Sicherungsdatei erstellt.',
    'en-GB': 'Nothing to export: the selected categories contain no data (e.g. no transfer logs on this machine). No backup file was created.',
    'en-US': 'Nothing to export: the selected categories contain no data (e.g. no transfer logs on this machine). No backup file was created.',
    'es-ES': 'No hay nada que exportar: las categorías seleccionadas no contienen datos (p. ej. no hay registros de transferencia en este equipo). No se creó ningún archivo de copia de seguridad.',
    'fr-FR': "Rien à exporter : les catégories sélectionnées ne contiennent aucune donnée (par ex. aucun journal de transfert sur cette machine). Aucun fichier de sauvegarde n'a été créé.",
    'hr-HR': 'Nema podataka za izvoz: odabrane kategorije ne sadrže podatke (npr. nema zapisa prijenosa na ovom računalu). Sigurnosna datoteka nije stvorena.',
    'id-ID': 'Tidak ada yang diekspor: kategori yang dipilih tidak berisi data (mis. tidak ada log transfer di komputer ini). Tidak ada file cadangan yang dibuat.',
    'it-IT': 'Niente da esportare: le categorie selezionate non contengono dati (ad es. nessun registro trasferimenti su questo computer). Nessun file di backup è stato creato.',
    'ja-JP': '書き出すデータがありません。選択したカテゴリにデータが存在しません（例：この端末に転送ログがない）。バックアップファイルは作成されませんでした。',
    'ko-KR': '내보낼 데이터가 없습니다. 선택한 범주에 데이터가 없습니다(예: 이 컴퓨터에 전송 기록이 없음). 백업 파일이 생성되지 않았습니다.',
    'pl-PL': 'Nie ma nic do wyeksportowania: wybrane kategorie nie zawierają danych (np. brak dziennika transferów na tym komputerze). Nie utworzono pliku kopii zapasowej.',
    'pt-BR': 'Nada a exportar: as categorias selecionadas não contêm dados (por exemplo, não há registros de transferência nesta máquina). Nenhum arquivo de backup foi criado.',
    'pt-PT': 'Nada para exportar: as categorias selecionadas não contêm dados (por exemplo, não há registos de transferência neste computador). Não foi criado qualquer ficheiro de cópia de segurança.',
    'ru-RU': 'Нечего экспортировать: в выбранных категориях нет данных (например, на этом компьютере нет журнала передач). Файл резервной копии не создан.',
    'sr-Latn': 'Nema podataka za izvoz: izabrane kategorije ne sadrže podatke (npr. nema zapisa prenosa na ovom računaru). Datoteka rezervne kopije nije napravljena.',
    'sv-SE': 'Inget att exportera: de valda kategorierna innehåller inga data (t.ex. inga överföringsloggar på den här datorn). Ingen säkerhetskopia skapades.',
    'tr-TR': 'Dışa aktarılacak bir şey yok: seçilen kategorilerde veri bulunmuyor (örn. bu makinede aktarım kaydı yok). Yedekleme dosyası oluşturulmadı.',
    'uk-UA': "Нічого експортувати: вибрані категорії не містять даних (наприклад, на цьому комп'ютері немає журналу передач). Файл резервної копії не створено.",
    'zh-CN': '没有可导出的数据：勾选的类别中没有内容（例如本机没有传输记录）。未生成备份文件。',
    'zh-TW': '沒有可匯出的資料：勾選的類別中沒有內容（例如本機沒有傳輸記錄）。未產生備份檔案。',
  },
}

const esc = k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasKey = (text, key) => new RegExp(`(?:^|\\n)msgid "${esc(key)}"`).test(text)

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po')).sort()
let added = 0, skipped = 0
const missingLocale = []

for (const file of files) {
  const loc = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let text = fs.readFileSync(full, 'utf8')
  const before = text

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

console.log(`新增条目 ${added}，跳过已存在 ${skipped}`)
if (missingLocale.length) {
  console.log('缺少译文的语言:', missingLocale.join(', '))
  process.exitCode = 1
}

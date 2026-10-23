#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 issue #27 P0（左栏端点可切换）相关 key
 *   conn.leftPickerTitle          左栏端点选择器标题
 *   notify.leftRemoteSwitchFailed 左栏切到远程失败提示
 *   notify.leftRemoteViewUnsupported 左栏远程文件暂不支持直接打开提示
 * 用法：node scripts/add-issue27-left-pane-i18n.mjs
 * 说明：已存在的 key 会被跳过（幂等）；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-10-16
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'conn.leftPickerTitle',
  'notify.leftRemoteSwitchFailed',
  'notify.leftRemoteViewUnsupported',
]

const T = {
  'conn.leftPickerTitle': {
    'af-ZA': 'Kies linkerpaneel-eindpunt',
    'bg-BG': 'Избор на източник за левия панел',
    'cs-CZ': 'Vybrat zdroj levého panelu',
    'da-DK': 'Vælg venstre panels endepunkt',
    'de-DE': 'Quelle des linken Panels wählen',
    'en-GB': 'Select left panel endpoint',
    'en-US': 'Select left panel endpoint',
    'es-ES': 'Seleccionar origen del panel izquierdo',
    'fr-FR': 'Sélectionner la source du panneau gauche',
    'hr-HR': 'Odaberi izvor lijevog panela',
    'id-ID': 'Pilih sumber panel kiri',
    'it-IT': 'Seleziona origine pannello sinistro',
    'ja-JP': '左パネルの接続先を選択',
    'ko-KR': '왼쪽 패널 엔드포인트 선택',
    'pl-PL': 'Wybierz źródło lewego panelu',
    'pt-BR': 'Selecionar origem do painel esquerdo',
    'pt-PT': 'Selecionar origem do painel esquerdo',
    'ru-RU': 'Выбрать источник левой панели',
    'sr-Latn': 'Izaberi izvor levog panela',
    'sv-SE': 'Välj vänster panelens källa',
    'tr-TR': 'Sol panel uç noktasını seç',
    'uk-UA': 'Вибрати джерело лівої панелі',
    'zh-CN': '选择左侧面板端点',
    'zh-TW': '選擇左側面板端點',
  },
  'notify.leftRemoteSwitchFailed': {
    'af-ZA': 'Kan nie linkerpaneel na afgeleë skakel nie',
    'bg-BG': 'Неуспешно превключване на левия панел към отдалечен',
    'cs-CZ': 'Přepnutí levého panelu na vzdálený se nezdařilo',
    'da-DK': 'Kunne ikke skifte venstre panel til fjern',
    'de-DE': 'Umschalten des linken Panels auf fern fehlgeschlagen',
    'en-GB': 'Failed to switch left panel to remote',
    'en-US': 'Failed to switch left panel to remote',
    'es-ES': 'No se pudo cambiar el panel izquierdo a remoto',
    'fr-FR': 'Échec du basculement du panneau gauche en distant',
    'hr-HR': 'Neuspjelo prebacivanje lijevog panela na udaljeni',
    'id-ID': 'Gagal mengalihkan panel kiri ke jarak jauh',
    'it-IT': 'Passaggio del pannello sinistro a remoto non riuscito',
    'ja-JP': '左パネルのリモートへの切り替えに失敗しました',
    'ko-KR': '왼쪽 패널을 원격으로 전환하지 못했습니다',
    'pl-PL': 'Nie udało się przełączyć lewego panelu na zdalny',
    'pt-BR': 'Falha ao alternar o painel esquerdo para remoto',
    'pt-PT': 'Falha ao alternar o painel esquerdo para remoto',
    'ru-RU': 'Не удалось переключить левую панель на удалённую',
    'sr-Latn': 'Neuspeo prebacivanje levog panela na udaljeni',
    'sv-SE': 'Misslyckades växla vänster panel till fjärr',
    'tr-TR': 'Sol panel uzak bağlantıya geçemedi',
    'uk-UA': 'Не вдалося перемкнути ліву панель на віддалену',
    'zh-CN': '左侧面板切换到远程失败',
    'zh-TW': '左側面板切換到遠端失敗',
  },
  'notify.leftRemoteViewUnsupported': {
    'af-ZA': 'Open van afgeleë lêers in linkerpaneel word nog nie ondersteun nie',
    'bg-BG': 'Отварянето на отдалечени файлове в левия панел все още не се поддържа',
    'cs-CZ': 'Otevírání vzdálených souborů v levém panelu zatím není podporováno',
    'da-DK': 'Åbning af fjernfiler i venstre panel understøttes ikke endnu',
    'de-DE': 'Öffnen von Remote-Dateien im linken Panel wird noch nicht unterstützt',
    'en-GB': 'Opening remote files in the left panel is not supported yet',
    'en-US': 'Opening remote files in the left panel is not supported yet',
    'es-ES': 'Abrir archivos remotos en el panel izquierdo aún no es compatible',
    'fr-FR': 'L\'ouverture de fichiers distants dans le panneau gauche n\'est pas encore prise en charge',
    'hr-HR': 'Otvaranje udaljenih datoteka u lijevom panelu još nije podržano',
    'id-ID': 'Membuka berkas jarak jauh di panel kiri belum didukung',
    'it-IT': 'L\'apertura di file remoti nel pannello sinistro non è ancora supportata',
    'ja-JP': '左パネルでのリモートファイルのオープンはまだサポートされていません',
    'ko-KR': '왼쪽 패널에서 원격 파일 열기는 아직 지원되지 않습니다',
    'pl-PL': 'Otwieranie zdalnych plików w lewym panelu nie jest jeszcze obsługiwane',
    'pt-BR': 'Abrir arquivos remotos no painel esquerdo ainda não é suportado',
    'pt-PT': 'Abrir ficheiros remotos no painel esquerdo ainda não é suportado',
    'ru-RU': 'Открытие удалённых файлов в левой панели пока не поддерживается',
    'sr-Latn': 'Otvaranje udaljenih fajlova u levom panelu još uvek nije podržano',
    'sv-SE': 'Öppning av fjärrfiler i vänster panel stöds inte ännu',
    'tr-TR': 'Sol panelde uzak dosya açma henüz desteklenmiyor',
    'uk-UA': 'Відкриття віддалених файлів у лівій панелі ще не підтримується',
    'zh-CN': '暂不支持在左侧面板直接打开远程文件',
    'zh-TW': '暫不支援在左側面板直接開啟遠端檔案',
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

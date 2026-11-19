#!/usr/bin/env node
/**
 * 一次性补丁脚本：把 `settings.dragOutToSystem` / `...Desc` 的 24 语言文案
 *   从「Alt + 拖拽」改为「普通拖拽即可」（实现改走 Chromium DownloadURL，不再需要修饰键）。
 * 用法：node scripts/update-drag-out-settings-i18n.mjs
 * 说明：按 msgid 精确替换紧随其后的 msgstr，幂等；文案禁止出现双引号。
 * @创建人：DD1024z + DeepSeek-V4.1-Flash
 * @创建时间：2026-11-09
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const LABEL = {
  'af-ZA': 'Sleep uit na stelsel (egte lêer)',
  'bg-BG': 'Плъзгане към системата (реален файл)',
  'cs-CZ': 'Přetáhnout do systému (skutečný soubor)',
  'da-DK': 'Træk ud til systemet (rigtig fil)',
  'de-DE': 'Ins System ziehen (echte Datei)',
  'en-GB': 'Drag out to the system (real file)',
  'en-US': 'Drag out to the system (real file)',
  'es-ES': 'Arrastrar al sistema (archivo real)',
  'fr-FR': 'Glisser vers le système (fichier réel)',
  'hr-HR': 'Povlačenje u sustav (prava datoteka)',
  'id-ID': 'Seret keluar ke sistem (berkas asli)',
  'it-IT': 'Trascina nel sistema (file reale)',
  'ja-JP': 'システムへドラッグ（実ファイル）',
  'ko-KR': '시스템으로 끌어내기 (실제 파일)',
  'pl-PL': 'Przeciągnij do systemu (prawdziwy plik)',
  'pt-BR': 'Arrastar para o sistema (arquivo real)',
  'pt-PT': 'Arrastar para o sistema (ficheiro real)',
  'ru-RU': 'Перетаскивание в систему (реальный файл)',
  'sr-Latn': 'Prevlačenje u sistem (prava datoteka)',
  'sv-SE': 'Dra ut till systemet (riktig fil)',
  'tr-TR': 'Sisteme sürükle (gerçek dosya)',
  'uk-UA': 'Перетягування в систему (реальний файл)',
  'zh-CN': '拖出到系统（真实文件）',
  'zh-TW': '拖曳到系統（真實檔案）',
}

const DESC = {
  'af-ZA': 'Sleep eenvoudig n lêer na die lessenaar of Verkenner om n egte kopie op die plek te kry waar jy loslaat; afgeleë lêers word eers dan afgelaai. Sleep binne die paneel bly onveranderd.',
  'bg-BG': 'Просто плъзнете файл към работния плот или Проводника, за да получите истинско копие на мястото на пускане; отдалечените файлове се изтеглят тогава. Плъзгането вътре в панела не се променя.',
  'cs-CZ': 'Stačí přetáhnout soubor na plochu nebo do Průzkumníka a na místě puštění vznikne skutečná kopie; vzdálené soubory se stáhnou až tehdy. Přetahování uvnitř panelu zůstává beze změny.',
  'da-DK': 'Træk blot en fil til skrivebordet eller Stifinder for at få en rigtig kopi dér, hvor du slipper; fjernfiler hentes først på det tidspunkt. Træk inde i panelet er uændret.',
  'de-DE': 'Einfach eine Datei auf den Desktop oder in den Explorer ziehen: Am Ablageort entsteht eine echte Kopie, entfernte Dateien werden erst dann heruntergeladen. Ziehen innerhalb des Panels bleibt unverändert.',
  'en-GB': 'Just drag a file onto the desktop or File Explorer to get a real copy at the drop location; remote files are downloaded at that moment. Dragging between panes is unaffected.',
  'en-US': 'Just drag a file onto the desktop or File Explorer to get a real copy at the drop location; remote files are downloaded at that moment. Dragging between panes is unaffected.',
  'es-ES': 'Basta con arrastrar un archivo al escritorio o al Explorador para obtener una copia real en el lugar donde se suelta; los archivos remotos se descargan en ese momento. Arrastrar dentro del panel no cambia.',
  'fr-FR': 'Glissez simplement un fichier sur le bureau ou dans l explorateur pour obtenir une vraie copie à l endroit du dépôt ; les fichiers distants sont téléchargés à ce moment. Le glisser dans le panneau reste inchangé.',
  'hr-HR': 'Samo povucite datoteku na radnu površinu ili u Explorer da biste na mjestu ispuštanja dobili pravu kopiju; udaljene datoteke se tada preuzimaju. Povlačenje unutar panela ostaje nepromijenjeno.',
  'id-ID': 'Cukup seret berkas ke desktop atau File Explorer untuk mendapat salinan asli di lokasi pelepasan; berkas jarak jauh diunduh saat itu. Seret di dalam panel tetap tidak berubah.',
  'it-IT': 'Basta trascinare un file sul desktop o in Esplora file per ottenere una copia reale nel punto di rilascio; i file remoti vengono scaricati in quel momento. Il trascinamento nel pannello resta invariato.',
  'ja-JP': 'ファイルをデスクトップやエクスプローラーへドラッグするだけで、離した場所に実体のコピーが保存されます。リモートファイルはその時点でダウンロードされます。パネル内のドラッグは従来どおりです。',
  'ko-KR': '파일을 바탕 화면이나 탐색기로 끌어다 놓기만 하면 놓은 위치에 실제 복사본이 생깁니다. 원격 파일은 그 시점에 다운로드됩니다. 패널 안쪽 끌기는 그대로입니다.',
  'pl-PL': 'Wystarczy przeciągnąć plik na pulpit lub do Eksploratora, aby w miejscu upuszczenia powstała prawdziwa kopia; pliki zdalne są pobierane właśnie wtedy. Przeciąganie wewnątrz panelu pozostaje bez zmian.',
  'pt-BR': 'Basta arrastar um arquivo para a área de trabalho ou o Explorador para obter uma cópia real no local onde soltar; arquivos remotos são baixados nesse momento. Arrastar dentro do painel não muda.',
  'pt-PT': 'Basta arrastar um ficheiro para o ambiente de trabalho ou o Explorador para obter uma cópia real no local onde largar; os ficheiros remotos são transferidos nesse momento. Arrastar dentro do painel não muda.',
  'ru-RU': 'Просто перетащите файл на рабочий стол или в Проводник, чтобы в месте отпускания появилась настоящая копия; удалённые файлы скачиваются в этот момент. Перетаскивание внутри панели не изменилось.',
  'sr-Latn': 'Samo prevucite datoteku na radnu površinu ili u Explorer da biste na mestu ispuštanja dobili pravu kopiju; udaljene datoteke se tada preuzimaju. Prevlačenje unutar panela ostaje nepromenjeno.',
  'sv-SE': 'Dra helt enkelt en fil till skrivbordet eller Utforskaren för att få en riktig kopia där du släpper; fjärrfiler hämtas just då. Dragning inuti panelen är oförändrad.',
  'tr-TR': 'Bir dosyayı masaüstüne veya Dosya Gezgini ne sürüklemeniz yeterli: bıraktığınız yerde gerçek bir kopya oluşur, uzak dosyalar o anda indirilir. Panel içi sürükleme değişmez.',
  'uk-UA': 'Просто перетягніть файл на робочий стіл або до Провідника, щоб у місці відпускання зявилася справжня копія; віддалені файли завантажуються саме тоді. Перетягування всередині панелі не змінилося.',
  'zh-CN': '直接把文件拖到桌面或资源管理器，即可在松手的位置得到真实副本；远程文件会在落手时自动下载。面板内互拖不受影响。',
  'zh-TW': '直接把檔案拖到桌面或檔案總管，即可在鬆手的位置得到真實副本；遠端檔案會在落手時自動下載。面板內互拖不受影響。',
}

let changed = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const label = LABEL[locale]
  const desc = DESC[locale]
  if (!label || !desc) { console.warn('skip unknown locale:', file); continue }
  if (label.includes('"') || desc.includes('"')) { console.error('FATAL: double quote in', locale); process.exit(1) }
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  for (const [key, text] of [['settings.dragOutToSystem', label], ['settings.dragOutToSystemDesc', desc]]) {
    const re = new RegExp('(msgid "' + key.replace(/\./g, '\\.') + '"\\r?\\nmsgstr ")[^"]*(")')
    if (!re.test(raw)) { console.warn('missing key:', file, key); continue }
    raw = raw.replace(re, (_m, a, b) => a + text + b)
  }
  fs.writeFileSync(fp, raw, 'utf8')
  changed++
}
console.log(`Done. updated=${changed}`)

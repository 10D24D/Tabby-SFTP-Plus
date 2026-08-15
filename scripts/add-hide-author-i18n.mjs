/**
 * i18n 批量更新（幂等）：
 *   1. 替换既有键 settings.fastMode / settings.fastModeDesc 的译文（措辞更易懂）
 *   2. 追加新键 settings.hideAuthorInfo / settings.hideAuthorConfirmText / settings.starredConfirm
 * 注意：locale/*.po 为 CRLF 换行，行匹配必须用 \r?\n
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

// ---- 既有键：整体替换译文 ----
const REPLACE = {
  'settings.fastMode': {
    'zh-CN': '传输快速模式',
    'zh-TW': '傳輸快速模式',
    'en-US': 'Fast Transfer Mode',
    'en-GB': 'Fast Transfer Mode',
    'ja-JP': '高速転送モード',
    'ko-KR': '빠른 전송 모드',
    'de-DE': 'Schneller Übertragungsmodus',
    'fr-FR': 'Mode de transfert rapide',
    'es-ES': 'Modo de transferencia rápida',
    'it-IT': 'Modalità trasferimento veloce',
    'pt-BR': 'Modo de transferência rápida',
    'pt-PT': 'Modo de transferência rápida',
    'ru-RU': 'Быстрый режим передачи',
    'uk-UA': 'Швидкий режим передачі',
    'pl-PL': 'Tryb szybkiego transferu',
    'cs-CZ': 'Režim rychlého přenosu',
    'tr-TR': 'Hızlı aktarım modu',
    'sv-SE': 'Snabbt överföringsläge',
    'da-DK': 'Hurtig overførselstilstand',
    'bg-BG': 'Бърз режим на пренос',
    'hr-HR': 'Brzi način prijenosa',
    'sr-Latn': 'Brzi režim prenosa',
    'id-ID': 'Mode transfer cepat',
    'af-ZA': 'Vinnige oordragmodus',
  },
  'settings.fastModeDesc': {
    'zh-CN': '传输目录时跳过大小预扫描立即开始：启动更快，但传输中无法计算总大小与百分比进度（只显示已传量）',
    'zh-TW': '傳輸目錄時略過大小預先掃描立即開始：啟動更快，但傳輸中無法計算總大小與百分比進度（只顯示已傳量）',
    'en-US': 'Skip the size pre-scan and start directory transfers immediately: faster start, but total size and percentage progress cannot be calculated during the transfer (only transferred bytes are shown)',
    'en-GB': 'Skip the size pre-scan and start directory transfers immediately: faster start, but total size and percentage progress cannot be calculated during the transfer (only transferred bytes are shown)',
    'ja-JP': 'ディレクトリ転送時にサイズの事前スキャンを省略して即座に開始：開始は速いが、転送中に総サイズと進捗率は表示できない（転送済み量のみ表示）',
    'ko-KR': '디렉터리 전송 시 크기 사전 검사를 건너뛰고 즉시 시작: 시작은 빠르지만 전송 중 총 크기와 진행률을 계산할 수 없음(전송된 양만 표시)',
    'de-DE': 'Startet Verzeichnisübertragungen sofort ohne Größen-Vorscan: schnellerer Start, aber Gesamtgröße und Prozentfortschritt können während der Übertragung nicht angezeigt werden (nur übertragene Bytes)',
    'fr-FR': 'Démarre les transferts de dossiers immédiatement sans analyse préalable : démarrage plus rapide, mais la taille totale et la progression en pourcentage ne peuvent pas être affichées pendant le transfert (seuls les octets transférés le sont)',
    'es-ES': 'Inicia las transferencias de carpetas de inmediato sin análisis previo: arranque más rápido, pero el tamaño total y el progreso porcentual no pueden mostrarse durante la transferencia (solo los bytes transferidos)',
    'it-IT': 'Avvia i trasferimenti di cartelle immediatamente senza scansione preliminare: avvio più rapido, ma dimensione totale e avanzamento percentuale non possono essere mostrati durante il trasferimento (solo i byte trasferiti)',
    'pt-BR': 'Inicia transferências de pastas imediatamente sem verificação prévia: início mais rápido, mas o tamanho total e o progresso percentual não podem ser exibidos durante a transferência (apenas os bytes transferidos)',
    'pt-PT': 'Inicia transferências de pastas imediatamente sem análise prévia: início mais rápido, mas o tamanho total e o progresso percentual não podem ser apresentados durante a transferência (apenas os bytes transferidos)',
    'ru-RU': 'Запускает передачу папок сразу без предварительного сканирования: быстрее старт, но общий размер и процент выполнения нельзя показать во время передачи (только переданный объём)',
    'uk-UA': 'Запускає передачу папок одразу без попереднього сканування: швидший старт, але загальний розмір і відсоток виконання не можна показати під час передачі (лише переданий обсяг)',
    'pl-PL': 'Rozpoczyna transfer katalogów natychmiast bez wcześniejszego skanowania: szybszy start, ale rozmiar całkowity i postęp procentowy nie mogą być pokazane podczas transferu (tylko przesłane bajty)',
    'cs-CZ': 'Spustí přenos adresáře okamžitě bez předchozího skenování: rychlejší start, ale celkovou velikost a procentuální průběh nelze během přenosu zobrazit (jen přenesené bajty)',
    'tr-TR': 'Dizin aktarımlarını ön tarama olmadan hemen başlatır: daha hızlı başlar, ancak aktarım sırasında toplam boyut ve yüzde ilerleme gösterilemez (yalnızca aktarılan baytlar)',
    'sv-SE': 'Startar katalogöverföringar direkt utan föregående skanning: snabbare start, men total storlek och procentuellt förlopp kan inte visas under överföringen (bara överförda byte)',
    'da-DK': 'Starter mappeoverførsler straks uden forudgående scanning: hurtigere start, men samlet størrelse og procentvis fremdrift kan ikke vises under overførslen (kun overførte bytes)',
    'bg-BG': 'Започва преноса на папки веднага без предварително сканиране: по-бързо стартиране, но общият размер и процентът на напредък не могат да се покажат по време на преноса (само пренесените байтове)',
    'hr-HR': 'Pokreće prijenos mapa odmah bez prethodnog skeniranja: brži početak, ali ukupna veličina i postotak napretka ne mogu se prikazati tijekom prijenosa (samo preneseni bajtovi)',
    'sr-Latn': 'Pokreće prenos fascikli odmah bez prethodnog skeniranja: brži početak, ali ukupna veličina i procenat napretka ne mogu se prikazati tokom prenosa (samo preneseni bajtovi)',
    'id-ID': 'Memulai transfer direktori segera tanpa pemindaian awal: mulai lebih cepat, tetapi ukuran total dan progres persentase tidak dapat ditampilkan selama transfer (hanya byte yang ditransfer)',
    'af-ZA': 'Begin gids-oordragte onmiddellik sonder vooraf skandering: vinniger begin, maar totale grootte en persentasie-vordering kan nie tydens die oordrag gewys word nie (slegs oorgedraagre bytes)',
  },
}

// ---- 新键：追加 ----
const ADD = {
  'settings.hideAuthorInfo': {
    'zh-CN': '隐藏插件作者信息',
    'zh-TW': '隱藏外掛作者資訊',
    'en-US': 'Hide plugin author info',
    'en-GB': 'Hide plugin author info',
    'ja-JP': 'プラグイン作者情報を非表示',
    'ko-KR': '플러그인 제작자 정보 숨기기',
    'de-DE': 'Plugin-Autoreninformationen ausblenden',
    'fr-FR': "Masquer les informations sur l'auteur du plugin",
    'es-ES': 'Ocultar información del autor del complemento',
    'it-IT': "Nascondi informazioni sull'autore del plugin",
    'pt-BR': 'Ocultar informações do autor do plugin',
    'pt-PT': 'Ocultar informações do autor do plugin',
    'ru-RU': 'Скрыть информацию об авторе плагина',
    'uk-UA': 'Приховати інформацію про автора плагіна',
    'pl-PL': 'Ukryj informacje o autorze wtyczki',
    'cs-CZ': 'Skrýt informace o autorovi pluginu',
    'tr-TR': 'Eklenti yazarı bilgilerini gizle',
    'sv-SE': 'Dölj pluginförfattarinformation',
    'da-DK': 'Skjul plugin-forfatteroplysninger',
    'bg-BG': 'Скрий информацията за автора на плъгина',
    'hr-HR': 'Sakrij podatke o autoru dodatka',
    'sr-Latn': 'Sakrij podatke o autoru dodatka',
    'id-ID': 'Sembunyikan info pembuat plugin',
    'af-ZA': 'Versteek inprop-outeurinligting',
  },
  'settings.hideAuthorConfirmText': {
    'zh-CN': '隐藏作者信息前，请先为插件仓库点 Star 支持一下。仓库页面已在浏览器中打开。',
    'zh-TW': '隱藏作者資訊前，請先為外掛倉庫點 Star 支持一下。倉庫頁面已在瀏覽器中打開。',
    'en-US': 'Before hiding the author info, please star the plugin repository to show your support. The repository page has been opened in your browser.',
    'en-GB': 'Before hiding the author info, please star the plugin repository to show your support. The repository page has been opened in your browser.',
    'ja-JP': '作者情報を非表示にする前に、プラグインのリポジトリに Star を付けて応援してください。リポジトリページはブラウザで開かれました。',
    'ko-KR': '제작자 정보를 숨기기 전에 플러그인 저장소에 Star를 눌러 응원해 주세요. 저장소 페이지가 브라우저에서 열렸습니다.',
    'de-DE': 'Bevor Sie die Autoreninformationen ausblenden, geben Sie dem Plugin-Repository bitte einen Star. Die Repository-Seite wurde im Browser geöffnet.',
    'fr-FR': "Avant de masquer les informations sur l'auteur, merci d'ajouter une étoile au dépôt du plugin. La page du dépôt a été ouverte dans votre navigateur.",
    'es-ES': 'Antes de ocultar la información del autor, dale una estrella al repositorio del complemento. La página del repositorio se ha abierto en tu navegador.',
    'it-IT': "Prima di nascondere le informazioni sull'autore, metti una stella al repository del plugin. La pagina del repository è stata aperta nel browser.",
    'pt-BR': 'Antes de ocultar as informações do autor, dê uma estrela ao repositório do plugin. A página do repositório foi aberta no navegador.',
    'pt-PT': 'Antes de ocultar as informações do autor, dê uma estrela ao repositório do plugin. A página do repositório foi aberta no navegador.',
    'ru-RU': 'Прежде чем скрыть информацию об авторе, поставьте звезду репозиторию плагина. Страница репозитория открыта в браузере.',
    'uk-UA': 'Перш ніж приховати інформацію про автора, поставте зірку репозиторію плагіна. Сторінку репозиторію відкрито у браузері.',
    'pl-PL': 'Przed ukryciem informacji o autorze dodaj gwiazdkę repozytorium wtyczki. Strona repozytorium została otwarta w przeglądarce.',
    'cs-CZ': 'Než skryjete informace o autorovi, dejte prosím hvězdičku repozitáři pluginu. Stránka repozitáře byla otevřena v prohlížeči.',
    'tr-TR': 'Yazar bilgilerini gizlemeden önce lütfen eklenti deposuna bir yıldız verin. Depo sayfası tarayıcınızda açıldı.',
    'sv-SE': 'Innan du döljer författarinformationen, ge gärna pluginförrådet en stjärna. Förrådssidan har öppnats i webbläsaren.',
    'da-DK': 'Før du skjuler forfatteroplysningerne, giv venligst plugin-lageret en stjerne. Lagersiden er åbnet i din browser.',
    'bg-BG': 'Преди да скриете информацията за автора, моля, дайте звезда на хранилището на плъгина. Страницата на хранилището е отворена в браузъра.',
    'hr-HR': 'Prije skrivanja podataka o autoru, dajte zvjezdicu repozitoriju dodatka. Stranica repozitorija otvorena je u pregledniku.',
    'sr-Latn': 'Pre skrivanja podataka o autoru, dajte zvezdicu repozitorijumu dodatka. Stranica repozitorijuma otvorena je u pregledaču.',
    'id-ID': 'Sebelum menyembunyikan info pembuat, berikan bintang ke repositori plugin. Halaman repositori telah dibuka di browser.',
    'af-ZA': "Voordat jy die outeurinligting versteek, gee asseblief 'n ster aan die inprop-bewaarplek. Die bewaarplekblad is in jou blaaier oopgemaak.",
  },
  'settings.starredConfirm': {
    'zh-CN': '我已点 Star 支持',
    'zh-TW': '我已點 Star 支持',
    'en-US': "I've starred it",
    'en-GB': "I've starred it",
    'ja-JP': 'Star を付けた',
    'ko-KR': 'Star를 눌렀습니다',
    'de-DE': 'Ich habe einen Star gegeben',
    'fr-FR': "J'ai mis une étoile",
    'es-ES': 'Ya le di una estrella',
    'it-IT': 'Ho messo la stella',
    'pt-BR': 'Já dei minha estrela',
    'pt-PT': 'Já dei a minha estrela',
    'ru-RU': 'Я поставил(а) звезду',
    'uk-UA': 'Я поставив(-ла) зірку',
    'pl-PL': 'Dodałem/am gwiazdkę',
    'cs-CZ': 'Dal(a) jsem hvězdičku',
    'tr-TR': 'Yıldız verdim',
    'sv-SE': 'Jag har gett en stjärna',
    'da-DK': 'Jeg har givet en stjerne',
    'bg-BG': 'Дадох звезда',
    'hr-HR': 'Dao/la sam zvjezdicu',
    'sr-Latn': 'Dao/la sam zvezdicu',
    'id-ID': 'Saya sudah memberi bintang',
    'af-ZA': "Ek het 'n ster gegee",
  },
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

let touched = 0
const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
for (const file of files) {
  const locale = file.replace('.po', '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  let changed = false

  // 1. 替换既有键译文
  for (const [key, trans] of Object.entries(REPLACE)) {
    const tr = trans[locale]
    if (!tr) continue
    const re = new RegExp(`(msgid "${key.replace(/\./g, '\\.')}")(\\r?\\n)msgstr ".*?"`, 'm')
    const m = txt.match(re)
    if (!m) { console.warn(`警告（未找到既有键）: ${file} ${key}`); continue }
    if (m[0].endsWith(`msgstr "${esc(tr)}"`)) continue // 幂等
    txt = txt.replace(re, `$1$2msgstr "${esc(tr)}"`)
    changed = true
  }

  // 2. 追加新键
  let added = ''
  for (const [key, trans] of Object.entries(ADD)) {
    const tr = trans[locale]
    if (!tr) { console.warn(`跳过（无译法）: ${file} ${key}`); continue }
    if (txt.includes(`msgid "${key}"`)) continue // 幂等
    added += `\nmsgid "${key}"\nmsgstr "${esc(tr)}"\n`
  }
  if (added) {
    if (!txt.endsWith('\n')) txt += '\n'
    txt += added
    changed = true
  }

  if (changed) { fs.writeFileSync(full, txt, 'utf8'); touched++ }
}
console.log(`完成。写入 ${touched} 个文件。`)

/**
 * 为 24 个 locale/*.po 追加「快速模式」2 个新 i18n key（幂等：已存在则跳过）
 *   settings.fastMode      — 设置项标签
 *   settings.fastModeDesc  — 设置项说明（悬停提示）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEYS = {
  'settings.fastMode': {
    'zh-CN': '快速模式',
    'zh-TW': '快速模式',
    'en-US': 'Fast mode',
    'en-GB': 'Fast mode',
    'ja-JP': '高速モード',
    'ko-KR': '빠른 모드',
    'de-DE': 'Schnellmodus',
    'fr-FR': 'Mode rapide',
    'es-ES': 'Modo rápido',
    'it-IT': 'Modalità rapida',
    'pt-BR': 'Modo rápido',
    'pt-PT': 'Modo rápido',
    'ru-RU': 'Быстрый режим',
    'uk-UA': 'Швидкий режим',
    'pl-PL': 'Tryb szybki',
    'cs-CZ': 'Rychlý režim',
    'tr-TR': 'Hızlı mod',
    'sv-SE': 'Snabbläge',
    'da-DK': 'Hurtig tilstand',
    'bg-BG': 'Бърз режим',
    'hr-HR': 'Brzi način',
    'sr-Latn': 'Brzi režim',
    'id-ID': 'Mode cepat',
    'af-ZA': 'Vinnige modus',
  },
  'settings.fastModeDesc': {
    'zh-CN': '目录传输跳过预扫描立即开始，提速但传输中没有百分比进度',
    'zh-TW': '目錄傳輸略過預先掃描立即開始，提速但傳輸中沒有百分比進度',
    'en-US': 'Folder transfers start immediately without pre-scanning. Faster, but no percentage progress during transfer.',
    'en-GB': 'Folder transfers start immediately without pre-scanning. Faster, but no percentage progress during transfer.',
    'ja-JP': 'フォルダ転送時に事前スキャンを省略して即開始。高速化されますが、転送中にパーセント表示がありません。',
    'ko-KR': '폴더 전송 시 사전 검사를 건너뛰고 즉시 시작합니다. 더 빠르지만 전송 중 백분율 진행률이 표시되지 않습니다.',
    'de-DE': 'Ordnerübertragungen starten ohne Vorab-Scan sofort. Schneller, aber keine Prozentanzeige während der Übertragung.',
    'fr-FR': 'Les transferts de dossiers démarrent immédiatement sans analyse préalable. Plus rapide, mais sans pourcentage pendant le transfert.',
    'es-ES': 'Las transferencias de carpetas comienzan de inmediato sin análisis previo. Más rápido, pero sin porcentaje durante la transferencia.',
    'it-IT': 'I trasferimenti di cartelle iniziano subito senza scansione preliminare. Più veloce, ma senza percentuale durante il trasferimento.',
    'pt-BR': 'Transferências de pastas iniciam imediatamente sem verificação prévia. Mais rápido, mas sem percentual durante a transferência.',
    'pt-PT': 'As transferências de pastas começam imediatamente sem análise prévia. Mais rápido, mas sem percentagem durante a transferência.',
    'ru-RU': 'Передача папок начинается сразу без предварительного сканирования. Быстрее, но без процентов во время передачи.',
    'uk-UA': 'Передача тек починається одразу без попереднього сканування. Швидше, але без відсотків під час передачі.',
    'pl-PL': 'Transfery folderów zaczynają się natychmiast bez wcześniejszego skanowania. Szybciej, ale bez procentów podczas transferu.',
    'cs-CZ': 'Přenosy složek začínají okamžitě bez předchozího skenování. Rychlejší, ale bez procent během přenosu.',
    'tr-TR': 'Klasör aktarımları ön tarama olmadan hemen başlar. Daha hızlıdır, ancak aktarım sırasında yüzde gösterilmez.',
    'sv-SE': 'Mappöverföringar startar direkt utan föregående skanning. Snabbare, men ingen procentvisning under överföringen.',
    'da-DK': 'Mappeoverførsler starter straks uden forudgående scanning. Hurtigere, men ingen procentvisning under overførslen.',
    'bg-BG': 'Прехвърлянето на папки започва веднага без предварително сканиране. По-бързо, но без проценти по време на прехвърляне.',
    'hr-HR': 'Prijenosi mapa počinju odmah bez prethodnog skeniranja. Brže, ali bez postotaka tijekom prijenosa.',
    'sr-Latn': 'Prenosi fascikli počinju odmah bez prethodnog skeniranja. Brže, ali bez procenata tokom prenosa.',
    'id-ID': 'Transfer folder langsung dimulai tanpa pemindaian awal. Lebih cepat, tetapi tanpa persentase selama transfer.',
    'af-ZA': 'Gidsoordragte begin dadelik sonder vooraf skandering. Vinniger, maar geen persentasie tydens oordrag nie.',
  },
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
let touched = 0
for (const file of files) {
  const locale = file.replace('.po', '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  let added = ''
  for (const [key, trans] of Object.entries(KEYS)) {
    const tr = trans[locale]
    if (!tr) { console.warn(`跳过（无译法）: ${file} ${key}`); continue }
    if (txt.includes(`msgid "${key}"`)) continue // 幂等：已存在跳过
    added += `\nmsgid "${key}"\nmsgstr "${esc(tr)}"\n`
  }
  if (!added) continue
  if (!txt.endsWith('\n')) txt += '\n'
  fs.writeFileSync(full, txt + added, 'utf8')
  touched++
}
console.log(`完成。写入 ${touched} 个文件。`)

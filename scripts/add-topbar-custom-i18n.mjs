#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「顶栏按钮定制」所需 key
 *   settings.customTopBar      定制顶栏按钮
 *   settings.topBarOverflow    启用折叠菜单（⋯）
 *   settings.topBarPinned      已固定
 *   settings.topBarInMenu      在 ⋯ 菜单
 *   settings.resetTopBar       恢复默认顶栏
 *   topbar.pathMode            路径模式
 *   topbar.minimize            最小化
 * 用法：node scripts/add-topbar-custom-i18n.mjs
 * 说明：已存在的 key 会被跳过（幂等）；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'settings.customTopBar',
  'settings.topBarOverflow',
  'settings.topBarPinned',
  'settings.topBarInMenu',
  'settings.resetTopBar',
  'topbar.pathMode',
  'topbar.minimize',
]

const T = {
  'settings.customTopBar': {
    'af-ZA': 'Pas boonste balk-knoppies aan',
    'bg-BG': 'Персонализиране на бутоните на горната лента',
    'cs-CZ': 'Přizpůsobit tlačítka horní lišty',
    'da-DK': 'Tilpas knapper i øverste bjælke',
    'de-DE': 'Schaltflächen der oberen Leiste anpassen',
    'en-GB': 'Customise top bar buttons',
    'en-US': 'Customize top bar buttons',
    'es-ES': 'Personalizar botones de la barra superior',
    'fr-FR': 'Personnaliser les boutons de la barre supérieure',
    'hr-HR': 'Prilagodi gumbe gornje trake',
    'id-ID': 'Sesuaikan tombol bilah atas',
    'it-IT': 'Personalizza i pulsanti della barra superiore',
    'ja-JP': '上部バーのボタンをカスタマイズ',
    'ko-KR': '상단 표시줄 버튼 사용자 지정',
    'pl-PL': 'Dostosuj przyciski górnego paska',
    'pt-BR': 'Personalizar botões da barra superior',
    'pt-PT': 'Personalizar botões da barra superior',
    'ru-RU': 'Настроить кнопки верхней панели',
    'sr-Latn': 'Prilagodi dugmad gornje trake',
    'sv-SE': 'Anpassa knappar i översta fältet',
    'tr-TR': 'Üst çubuk düğmelerini özelleştir',
    'uk-UA': 'Налаштувати кнопки верхньої панелі',
    'zh-CN': '定制顶栏按钮',
    'zh-TW': '自訂頂欄按鈕',
  },
  'settings.topBarOverflow': {
    'af-ZA': 'Aktiveer oorloopkieslys (⋯)',
    'bg-BG': 'Активиране на меню за препълване (⋯)',
    'cs-CZ': 'Povolit nabídku přetečení (⋯)',
    'da-DK': 'Aktivér overflydningsmenu (⋯)',
    'de-DE': 'Überlaufmenü aktivieren (⋯)',
    'en-GB': 'Enable overflow menu (⋯)',
    'en-US': 'Enable overflow menu (⋯)',
    'es-ES': 'Activar menú desbordado (⋯)',
    'fr-FR': 'Activer le menu de débordement (⋯)',
    'hr-HR': 'Omogući izbornik prelijevanja (⋯)',
    'id-ID': 'Aktifkan menu luapan (⋯)',
    'it-IT': 'Abilita menu di overflow (⋯)',
    'ja-JP': 'オーバーフローメニューを有効にする（⋯）',
    'ko-KR': '오버플로 메뉴 사용 (⋯)',
    'pl-PL': 'Włącz menu przepełnienia (⋯)',
    'pt-BR': 'Ativar menu de excedente (⋯)',
    'pt-PT': 'Ativar menu de excedente (⋯)',
    'ru-RU': 'Включить меню переполнения (⋯)',
    'sr-Latn': 'Omogući meni prelivanja (⋯)',
    'sv-SE': 'Aktivera överflödesmeny (⋯)',
    'tr-TR': 'Taşma menüsünü etkinleştir (⋯)',
    'uk-UA': 'Увімкнути меню переповнення (⋯)',
    'zh-CN': '启用折叠菜单（⋯）',
    'zh-TW': '啟用收合選單（⋯）',
  },
  'settings.topBarPinned': {
    'af-ZA': 'Vasgepen',
    'bg-BG': 'Фиксиран',
    'cs-CZ': 'Připnuto',
    'da-DK': 'Fastgjort',
    'de-DE': 'Angeheftet',
    'en-GB': 'Pinned',
    'en-US': 'Pinned',
    'es-ES': 'Fijado',
    'fr-FR': 'Épinglé',
    'hr-HR': 'Prikvačeno',
    'id-ID': 'Disematkan',
    'it-IT': 'Fissato',
    'ja-JP': '固定中',
    'ko-KR': '고정됨',
    'pl-PL': 'Przypięte',
    'pt-BR': 'Fixado',
    'pt-PT': 'Fixado',
    'ru-RU': 'Закреплено',
    'sr-Latn': 'Prikačeno',
    'sv-SE': 'Fäst',
    'tr-TR': 'Sabitlendi',
    'uk-UA': 'Закріплено',
    'zh-CN': '已固定',
    'zh-TW': '已固定',
  },
  'settings.topBarInMenu': {
    'af-ZA': 'In ⋯-kieslys',
    'bg-BG': 'В меню ⋯',
    'cs-CZ': 'V nabídce ⋯',
    'da-DK': 'I ⋯-menu',
    'de-DE': 'Im ⋯-Menü',
    'en-GB': 'In ⋯ menu',
    'en-US': 'In ⋯ menu',
    'es-ES': 'En el menú ⋯',
    'fr-FR': 'Dans le menu ⋯',
    'hr-HR': 'U izborniku ⋯',
    'id-ID': 'Di menu ⋯',
    'it-IT': 'Nel menu ⋯',
    'ja-JP': '⋯ メニュー内',
    'ko-KR': '⋯ 메뉴에 있음',
    'pl-PL': 'W menu ⋯',
    'pt-BR': 'No menu ⋯',
    'pt-PT': 'No menu ⋯',
    'ru-RU': 'В меню ⋯',
    'sr-Latn': 'U meniju ⋯',
    'sv-SE': 'I ⋯-menyn',
    'tr-TR': '⋯ menüsünde',
    'uk-UA': 'У меню ⋯',
    'zh-CN': '在 ⋯ 菜单',
    'zh-TW': '在 ⋯ 選單',
  },
  'settings.resetTopBar': {
    'af-ZA': 'Herstel verstek boonste balk',
    'bg-BG': 'Възстанови горната лента по подразбиране',
    'cs-CZ': 'Obnovit výchozí horní lištu',
    'da-DK': 'Gendan standard øverste bjælke',
    'de-DE': 'Obere Leiste zurücksetzen',
    'en-GB': 'Reset top bar to default',
    'en-US': 'Reset top bar to default',
    'es-ES': 'Restablecer barra superior',
    'fr-FR': 'Réinitialiser la barre supérieure',
    'hr-HR': 'Vrati gornju traku na zadano',
    'id-ID': 'Atur ulang bilah atas',
    'it-IT': 'Ripristina barra superiore',
    'ja-JP': '上部バーを初期化',
    'ko-KR': '상단 표시줄 기본값으로 재설정',
    'pl-PL': 'Przywróć domyślny górny pasek',
    'pt-BR': 'Restaurar barra superior',
    'pt-PT': 'Restaurar barra superior',
    'ru-RU': 'Сбросить верхнюю панель',
    'sr-Latn': 'Vrati gornju traku na podrazumevano',
    'sv-SE': 'Återställ översta fältet',
    'tr-TR': 'Üst çubuğu sıfırla',
    'uk-UA': 'Скинути верхню панель',
    'zh-CN': '恢复默认顶栏',
    'zh-TW': '恢復預設頂欄',
  },
  'topbar.pathMode': {
    'af-ZA': 'Padmodus',
    'bg-BG': 'Режим на пътя',
    'cs-CZ': 'Režim cesty',
    'da-DK': 'Stitilstand',
    'de-DE': 'Pfadmodus',
    'en-GB': 'Path mode',
    'en-US': 'Path mode',
    'es-ES': 'Modo de ruta',
    'fr-FR': 'Mode chemin',
    'hr-HR': 'Način putanje',
    'id-ID': 'Mode jalur',
    'it-IT': 'Modalità percorso',
    'ja-JP': 'パスモード',
    'ko-KR': '경로 모드',
    'pl-PL': 'Tryb ścieżki',
    'pt-BR': 'Modo de caminho',
    'pt-PT': 'Modo de caminho',
    'ru-RU': 'Режим пути',
    'sr-Latn': 'Režim putanje',
    'sv-SE': 'Söklägesläge',
    'tr-TR': 'Yol modu',
    'uk-UA': 'Режим шляху',
    'zh-CN': '路径模式',
    'zh-TW': '路徑模式',
  },
  'topbar.minimize': {
    'af-ZA': 'Minimeer',
    'bg-BG': 'Минимизиране',
    'cs-CZ': 'Minimalizovat',
    'da-DK': 'Minimer',
    'de-DE': 'Minimieren',
    'en-GB': 'Minimize',
    'en-US': 'Minimize',
    'es-ES': 'Minimizar',
    'fr-FR': 'Réduire',
    'hr-HR': 'Minimiziraj',
    'id-ID': 'Perkecil',
    'it-IT': 'Riduci a icona',
    'ja-JP': '最小化',
    'ko-KR': '최소화',
    'pl-PL': 'Minimalizuj',
    'pt-BR': 'Minimizar',
    'pt-PT': 'Minimizar',
    'ru-RU': 'Свернуть',
    'sr-Latn': 'Minimizuj',
    'sv-SE': 'Minimera',
    'tr-TR': 'Küçült',
    'uk-UA': 'Згорнути',
    'zh-CN': '最小化',
    'zh-TW': '最小化',
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

#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「书签弹层图钉 · 面板常驻」所需 key
 *   bookmark.pinOn     图钉激活态 tooltip（面板常驻）
 *   bookmark.pinOff    图钉未激活态 tooltip（选中后关闭）
 *   bookmark.pinHint   两个状态共用的操作提示（点击切换）
 * 用法：node scripts/add-bookmark-pin-i18n.mjs
 *
 * 注：本脚本把 key **追加到文件末尾**，不做「锚点后插入」——锚点插入一旦把
 *   msgid 落到另一条 msgstr 后面，就会变成「连续 msgid + 顺延 msgstr」的错位
 *   （gettext 不报错、界面直接显 key）。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-23
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['bookmark.pinOn', 'bookmark.pinOff', 'bookmark.pinHint']

const T = {
  'bookmark.pinOn': {
    'af-ZA': 'Paneel bly oop',
    'bg-BG': 'Панелът остава отворен',
    'cs-CZ': 'Panel zůstane otevřený',
    'da-DK': 'Panelet forbliver åbent',
    'de-DE': 'Panel bleibt offen',
    'en-GB': 'Panel stays open',
    'en-US': 'Panel stays open',
    'es-ES': 'Panel siempre abierto',
    'fr-FR': 'Panneau toujours ouvert',
    'hr-HR': 'Ploča ostaje otvorena',
    'id-ID': 'Panel tetap terbuka',
    'it-IT': 'Pannello sempre aperto',
    'ja-JP': 'パネルを常時表示',
    'ko-KR': '패널 항상 열기',
    'pl-PL': 'Panel pozostaje otwarty',
    'pt-BR': 'Painel sempre aberto',
    'pt-PT': 'Painel sempre aberto',
    'ru-RU': 'Панель остаётся открытой',
    'sr-Latn': 'Panel ostaje otvoren',
    'sv-SE': 'Panelen förblir öppen',
    'tr-TR': 'Panel açık kalır',
    'uk-UA': 'Панель залишається відкритою',
    'zh-CN': '面板常驻',
    'zh-TW': '面板常駐',
  },
  'bookmark.pinOff': {
    'af-ZA': 'Maak toe na keuse',
    'bg-BG': 'Затваряне при избор',
    'cs-CZ': 'Zavřít po výběru',
    'da-DK': 'Luk ved valg',
    'de-DE': 'Nach Auswahl schließen',
    'en-GB': 'Close on select',
    'en-US': 'Close on select',
    'es-ES': 'Cerrar al seleccionar',
    'fr-FR': 'Fermer après sélection',
    'hr-HR': 'Zatvori nakon odabira',
    'id-ID': 'Tutup setelah memilih',
    'it-IT': 'Chiudi dopo la selezione',
    'ja-JP': '選択後に閉じる',
    'ko-KR': '선택 후 닫기',
    'pl-PL': 'Zamknij po wybraniu',
    'pt-BR': 'Fechar ao selecionar',
    'pt-PT': 'Fechar ao selecionar',
    'ru-RU': 'Закрывать после выбора',
    'sr-Latn': 'Zatvori nakon izbora',
    'sv-SE': 'Stäng vid val',
    'tr-TR': 'Seçimden sonra kapat',
    'uk-UA': 'Закривати після вибору',
    'zh-CN': '选中后关闭',
    'zh-TW': '選取後關閉',
  },
  'bookmark.pinHint': {
    'af-ZA': 'Klik om te wissel: bly oop / maak toe',
    'bg-BG': 'Щракнете за превключване: отворен / затваряне',
    'cs-CZ': 'Kliknutím přepnete: zůstat otevřený / zavřít',
    'da-DK': 'Klik for at skifte: hold åbent / luk',
    'de-DE': 'Klicken zum Umschalten: offen bleiben / schließen',
    'en-GB': 'Click to toggle: keep open / close on select',
    'en-US': 'Click to toggle: keep open / close on select',
    'es-ES': 'Clic para alternar: siempre abierto / cerrar',
    'fr-FR': 'Cliquer pour basculer : rester ouvert / fermer',
    'hr-HR': 'Kliknite za prebacivanje: ostani otvoreno / zatvori',
    'id-ID': 'Klik untuk beralih: tetap terbuka / tutup',
    'it-IT': 'Clic per alternare: resta aperto / chiudi',
    'ja-JP': 'クリックで切り替え：常時表示 / 選択後に閉じる',
    'ko-KR': '클릭하여 전환: 항상 열기 / 선택 후 닫기',
    'pl-PL': 'Kliknij, aby przełączyć: pozostań otwarty / zamknij',
    'pt-BR': 'Clique para alternar: sempre aberto / fechar',
    'pt-PT': 'Clique para alternar: sempre aberto / fechar',
    'ru-RU': 'Нажмите для переключения: оставить открытой / закрывать',
    'sr-Latn': 'Kliknite za prebacivanje: ostani otvoren / zatvori',
    'sv-SE': 'Klicka för att växla: håll öppen / stäng',
    'tr-TR': 'Değiştirmek için tıklayın: açık kal / kapat',
    'uk-UA': 'Натисніть, щоб перемкнути: залишати відкритою / закривати',
    'zh-CN': '点击切换常驻 / 选中后关闭',
    'zh-TW': '點擊切換常駐 / 選取後關閉',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  let added = 0
  for (const key of KEYS) {
    const text = T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: double quote in translation:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
    raw = raw.replace(/\s*$/, eol + eol) + `msgid "${key}"${eol}msgstr "${text}"${eol}${eol}`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)

#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「配置保存后立即生效」所需 key
 *   settings.applyInstant      设置项标题（开关）
 *   settings.applyInstantHint  说明（tooltip）：关掉后需重开面板才生效
 * 用法：node scripts/add-apply-instant-i18n.mjs
 *
 * 注：本脚本把 key **追加到文件末尾**，不做「锚点后插入」——锚点插入一旦把
 *   msgid 落到另一条 msgstr 后面，就会变成「连续 msgid + 顺延 msgstr」的错位
 *   （gettext 不报错、界面直接显 key）。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-22
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.applyInstant', 'settings.applyInstantHint']

const T = {
  'settings.applyInstant': {
    'af-ZA': 'Pas instellings onmiddellik toe',
    'bg-BG': 'Прилагай настройките веднага',
    'cs-CZ': 'Použít nastavení okamžitě',
    'da-DK': 'Anvend indstillinger med det samme',
    'de-DE': 'Einstellungen sofort anwenden',
    'en-GB': 'Apply settings immediately',
    'en-US': 'Apply settings immediately',
    'es-ES': 'Aplicar la configuración de inmediato',
    'fr-FR': 'Appliquer les paramètres immédiatement',
    'hr-HR': 'Primijeni postavke odmah',
    'id-ID': 'Terapkan pengaturan segera',
    'it-IT': 'Applica subito le impostazioni',
    'ja-JP': '設定をすぐに反映',
    'ko-KR': '설정 즉시 적용',
    'pl-PL': 'Zastosuj ustawienia natychmiast',
    'pt-BR': 'Aplicar configurações imediatamente',
    'pt-PT': 'Aplicar configurações imediatamente',
    'ru-RU': 'Применять настройки сразу',
    'sr-Latn': 'Primeni postavke odmah',
    'sv-SE': 'Tillämpa inställningar direkt',
    'tr-TR': 'Ayarları hemen uygula',
    'uk-UA': 'Застосовувати налаштування одразу',
    'zh-CN': '配置保存后立即生效',
    'zh-TW': '設定儲存後立即生效',
  },
  'settings.applyInstantHint': {
    'af-ZA': 'Wanneer aan, word veranderinge op hierdie bladsy dadelik na oop SFTP+ panele gestuur. Wanneer af, moet jy die paneel toemaak en weer oopmaak',
    'bg-BG': 'Когато е включено, промените от тази страница се изпращат веднага към отворените SFTP+ панели. Когато е изключено, трябва да затворите и отворите панела отново',
    'cs-CZ': 'Zapnuto: změny na této stránce se okamžitě projeví v otevřených panelech SFTP+. Vypnuto: musíte panel zavřít a znovu otevřít',
    'da-DK': 'Til: ændringer her sendes straks til åbne SFTP+ paneler. Fra: du skal lukke og genåbne panelet',
    'de-DE': 'An: Änderungen werden sofort an geöffnete SFTP+ Panels gesendet. Aus: Panel schließen und erneut öffnen',
    'en-GB': 'On: changes here reach open SFTP+ panels at once. Off: close and reopen the panel to apply',
    'en-US': 'On: changes here reach open SFTP+ panels at once. Off: close and reopen the panel to apply',
    'es-ES': 'Activado: los cambios llegan de inmediato a los paneles SFTP+ abiertos. Desactivado: cierra y vuelve a abrir el panel',
    'fr-FR': 'Activé : les modifications sont appliquées immédiatement aux panneaux SFTP+ ouverts. Désactivé : fermez et rouvrez le panneau',
    'hr-HR': 'Uključeno: promjene odmah stižu u otvorene SFTP+ panele. Isključeno: zatvorite i ponovno otvorite panel',
    'id-ID': 'Aktif: perubahan langsung diterapkan ke panel SFTP+ yang terbuka. Nonaktif: tutup dan buka lagi panel',
    'it-IT': 'Attivo: le modifiche raggiungono subito i pannelli SFTP+ aperti. Disattivo: chiudi e riapri il pannello',
    'ja-JP': 'オン：この画面の変更は開いている SFTP+ パネルへ即座に反映されます。オフ：パネルを閉じて開き直すと反映されます',
    'ko-KR': '켜짐: 이 화면의 변경 사항이 열린 SFTP+ 패널에 즉시 적용됩니다. 꺼짐: 패널을 닫았다가 다시 열어야 적용됩니다',
    'pl-PL': 'Wł.: zmiany trafiają od razu do otwartych paneli SFTP+. Wył.: zamknij i otwórz panel ponownie',
    'pt-BR': 'Ativado: as alterações chegam imediatamente aos painéis SFTP+ abertos. Desativado: feche e reabra o painel',
    'pt-PT': 'Ativado: as alterações chegam imediatamente aos painéis SFTP+ abertos. Desativado: feche e reabra o painel',
    'ru-RU': 'Вкл.: изменения сразу применяются к открытым панелям SFTP+. Выкл.: закройте и снова откройте панель',
    'sr-Latn': 'Uključeno: izmene odmah stižu u otvorene SFTP+ panele. Isključeno: zatvorite i ponovo otvorite panel',
    'sv-SE': 'På: ändringar når öppna SFTP+ paneler direkt. Av: stäng och öppna panelen igen',
    'tr-TR': 'Açık: değişiklikler açık SFTP+ panellerine hemen uygulanır. Kapalı: paneli kapatıp yeniden açın',
    'uk-UA': 'Увімк.: зміни одразу застосовуються до відкритих панелей SFTP+. Вимк.: закрийте й знову відкрийте панель',
    'zh-CN': '开启后设置页的修改会立即推送到已打开的 SFTP+ 面板；关闭后需关闭并重开面板才生效',
    'zh-TW': '開啟後設定頁的修改會立即推送到已開啟的 SFTP+ 面板；關閉後需關閉並重開面板才生效',
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

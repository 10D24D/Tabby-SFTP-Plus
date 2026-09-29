#!/usr/bin/env node
/**
 * 功能描述：为全部 24 种语言的 .po 追加「面板快捷键支持滚轮/中键」相关文案
 *   settings.hotkeyWheelHint             滚轮绑定 chip 的悬停提示
 *   settings.panelHotkeyWheelBareWarning 裸滚轮绑定成功后的提示（带 {keys} 占位符）
 * 背景：面板快捷键录制新增鼠标中键（Mouse1）与滚轮上/下滚（WheelUp/WheelDown）。
 *   滚轮绑定的副作用是「必须吞掉默认滚动才能触发动作」，即裸滚轮会把列表滚动顶掉，
 *   因此 chip 上要能看出这是滚轮绑定，保存后也要明确告知（否则用户只会觉得列表滚不动了）。
 * 用法：node scripts/add-pointer-hotkey-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾（与
 *   add-bookmark-data-i18n.mjs 等既往补丁脚本保持一致）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.hotkeyWheelHint', 'settings.panelHotkeyWheelBareWarning']

const T = {
  'settings.hotkeyWheelHint': {
    'af-ZA': 'Wieltjie-binding, klik om weer op te neem (die lys kan nie meer met die wiel gerol word)',
    'bg-BG': 'Обвързване с колелцето, щракнете за ново записване (списъкът вече не може да се превърта с колелцето)',
    'cs-CZ': 'Vazba na kolečko, kliknutím nahrajete znovu (seznam už nepůjde posouvat kolečkem)',
    'da-DK': 'Rullehjulsbinding, klik for at optage igen (listen kan ikke længere rulles med hjulet)',
    'de-DE': 'Mausrad-Zuordnung, zum Neuaufnehmen klicken (die Liste lässt sich nicht mehr mit dem Rad scrollen)',
    'en-GB': 'Wheel binding, click to re-record (the list can no longer be scrolled with the wheel)',
    'en-US': 'Wheel binding, click to re-record (the list can no longer be scrolled with the wheel)',
    'es-ES': 'Asignación a la rueda, haz clic para volver a grabar (la lista ya no se podrá desplazar con la rueda)',
    'fr-FR': 'Affectation à la molette, cliquez pour réenregistrer (la liste ne défilera plus avec la molette)',
    'hr-HR': 'Veza na kotačić, kliknite za ponovno snimanje (popis se više ne može pomicati kotačićem)',
    'id-ID': 'Ikatan roda gulir, klik untuk merekam ulang (daftar tidak dapat digulir dengan roda lagi)',
    'it-IT': 'Associazione alla rotella, fai clic per registrare di nuovo (l elenco non scorrerà più con la rotella)',
    'ja-JP': 'ホイールの割り当て、クリックで再録音（リストはホイールでスクロールできなくなります）',
    'ko-KR': '휠 바인딩, 클릭하여 다시 녹화 (목록을 휠로 스크롤할 수 없게 됩니다)',
    'pl-PL': 'Przypisanie kółka, kliknij, aby nagrać ponownie (lista nie będzie już przewijana kółkiem)',
    'pt-BR': 'Associação à roda, clique para gravar novamente (a lista não poderá mais ser rolada com a roda)',
    'pt-PT': 'Associação à roda, clique para gravar novamente (a lista não poderá mais ser rolada com a roda)',
    'ru-RU': 'Привязка к колесу, нажмите для повторной записи (список больше не будет прокручиваться колесом)',
    'sr-Latn': 'Veza na točkić, kliknite za ponovno snimanje (lista se više ne može pomerati točkićem)',
    'sv-SE': 'Hjulbindning, klicka för att spela in igen (listan kan inte längre rullas med hjulet)',
    'tr-TR': 'Tekerlek ataması, yeniden kaydetmek için tıklayın (liste artık tekerlekle kaydırılamaz)',
    'uk-UA': 'Привязка до колеса, натисніть, щоб записати знову (список більше не прокручуватиметься колесом)',
    'zh-CN': '滚轮绑定，点击可重新录制（绑定后列表将无法再用滚轮滚动）',
    'zh-TW': '滾輪綁定，點擊可重新錄製（綁定後清單將無法再用滾輪捲動）',
  },
  'settings.panelHotkeyWheelBareWarning': {
    'af-ZA': '{keys} is gebind; die lys kan nie meer met die wiel gerol word (voeg Alt by)',
    'bg-BG': 'Обвързано с {keys}; списъкът вече не може да се превърта с колелцето (добавете Alt)',
    'cs-CZ': 'Přiřazeno k {keys}; seznam už nelze posouvat kolečkem (přidejte Alt)',
    'da-DK': 'Bundet til {keys}; listen kan ikke længere rulles med hjulet (tilføj Alt)',
    'de-DE': '{keys} zugewiesen; die Liste lässt sich nicht mehr mit dem Rad scrollen (Alt hinzufügen)',
    'en-GB': 'Bound to {keys}; the file list can no longer be scrolled with the wheel (add Alt)',
    'en-US': 'Bound to {keys}; the file list can no longer be scrolled with the wheel (add Alt)',
    'es-ES': 'Asignado a {keys}; la lista ya no se podrá desplazar con la rueda (añade Alt)',
    'fr-FR': 'Affecté à {keys} ; la liste ne défilera plus avec la molette (ajoutez Alt)',
    'hr-HR': 'Dodijeljeno na {keys}; popis se više ne može pomicati kotačićem (dodajte Alt)',
    'id-ID': 'Ditugaskan ke {keys}; daftar tidak dapat digulir dengan roda lagi (tambahkan Alt)',
    'it-IT': 'Assegnato a {keys}; l elenco non scorrerà più con la rotella (aggiungi Alt)',
    'ja-JP': '{keys} に割り当てました。リストはホイールでスクロールできなくなります（Alt を併用してください）',
    'ko-KR': '{keys} 에 할당했습니다. 목록을 휠로 스크롤할 수 없게 됩니다 (Alt 를 함께 사용하세요)',
    'pl-PL': 'Przypisano do {keys}; lista nie będzie już przewijana kółkiem (dodaj Alt)',
    'pt-BR': 'Atribuído a {keys}; a lista não poderá mais ser rolada com a roda (adicione Alt)',
    'pt-PT': 'Atribuído a {keys}; a lista não poderá mais ser rolada com a roda (adicione Alt)',
    'ru-RU': 'Назначено на {keys}; список больше не будет прокручиваться колесом (добавьте Alt)',
    'sr-Latn': 'Dodeljeno na {keys}; lista se više ne može pomerati točkićem (dodajte Alt)',
    'sv-SE': 'Kopplat till {keys}; listan kan inte längre rullas med hjulet (lägg till Alt)',
    'tr-TR': '{keys} atandı; liste artık tekerlekle kaydırılamaz (Alt ekleyin)',
    'uk-UA': 'Призначено на {keys}; список більше не прокручуватиметься колесом (додайте Alt)',
    'zh-CN': '已绑定 {keys}；面板列表将无法再用滚轮滚动（建议加 Alt 等修饰键）',
    'zh-TW': '已綁定 {keys}；面板清單將無法再用滾輪捲動（建議加上 Alt 等修飾鍵）',
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

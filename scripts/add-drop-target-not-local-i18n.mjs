#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加 2026-10-19 全量审计 P1 修复所需 key
 *   notify.dropTargetNotLocal  拖放目标为「左栏远程端点」时的拒绝提示
 * 用法：node scripts/add-drop-target-not-local-i18n.mjs
 * 说明：已存在的 key 会被跳过（幂等）；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 * @创建人：DD1024z + Step-5-Preview
 * @创建时间：2026-10-19
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — 面向 issue #27「左栏可切远程端点」：补 drop 侧拒绝提示文案。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['notify.dropTargetNotLocal']

const T = {
  'notify.dropTargetNotLocal': {
    'af-ZA': 'Loslating op die linkerkantpaneel word nie ondersteun terwyl dit \'n afgeleë eindpunt wys nie',
    'bg-BG': 'Пускането върху левия панел не се поддържа, докато показва отдалечен източник',
    'cs-CZ': 'Přetažení na levý panel není podporováno, když zobrazuje vzdálený zdroj',
    'da-DK': 'Drop på venstre panel understøttes ikke, mens det viser et fjernt endepunkt',
    'de-DE': 'Ablegen auf dem linken Panel wird nicht unterstützt, solange es einen Remote-Endpunkt anzeigt',
    'en-GB': 'Dropping onto the left panel is not supported while it shows a remote endpoint',
    'en-US': 'Dropping onto the left panel is not supported while it shows a remote endpoint',
    'es-ES': 'No se admite soltar en el panel izquierdo mientras muestra un origen remoto',
    'fr-FR': 'Le dépôt sur le panneau gauche n\'est pas pris en charge tant qu\'il affiche une source distante',
    'hr-HR': 'Ispuštanje na lijevi panel nije podržano dok prikazuje udaljeni izvor',
    'id-ID': 'Menjatuhkan ke panel kiri tidak didukung saat menampilkan endpoint jarak jauh',
    'it-IT': 'Il rilascio sul pannello sinistro non è supportato mentre mostra un endpoint remoto',
    'ja-JP': '左パネルがリモート接続を表示している間は、そのパネルへのドロップはサポートされていません',
    'ko-KR': '왼쪽 패널이 원격 엔드포인트를 표시하는 동안에는 드롭이 지원되지 않습니다',
    'pl-PL': 'Upuszczanie na lewy panel nie jest obsługiwane, gdy pokazuje on zdalny punkt końcowy',
    'pt-BR': 'Não há suporte para soltar no painel esquerdo enquanto ele exibe uma origem remota',
    'pt-PT': 'Não é suportado largar no painel esquerdo enquanto este apresenta uma origem remota',
    'ru-RU': 'Перетаскивание на левую панель не поддерживается, пока на ней показан удалённый источник',
    'sr-Latn': 'Ispuštanje na levi panel nije podržano dok prikazuje udaljeni izvor',
    'sv-SE': 'Att släppa på den vänstra panelen stöds inte när den visar en fjärrkälla',
    'tr-TR': 'Sol panel uzak uç nokta gösterirken üzerine bırakma desteklenmiyor',
    'uk-UA': 'Перетягування на ліву панель не підтримується, поки на ній відображено віддалене джерело',
    'zh-CN': '左侧面板当前显示为远程端点，暂不支持拖放到此',
    'zh-TW': '左側面板目前顯示為遠端端點，暫不支援拖曳至此',
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

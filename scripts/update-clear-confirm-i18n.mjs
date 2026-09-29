/**
 * 更新既有键 transfer.clearConfirm 的译文：清除范围由「全部」改为「已结束的」，
 * 明确「正在传输中的记录会保留」（幂等）
 * 注意：locale/*.po 为 CRLF 换行，行匹配必须用 \r?\n
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-26
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEY = 'transfer.clearConfirm'
const TRANS = {
  'zh-CN': '确定清除已结束的传输记录吗？正在传输中的记录会保留。',
  'zh-TW': '確定清除已結束的傳輸記錄嗎？正在傳輸中的記錄會保留。',
  'en-US': 'Clear finished transfer records? Records of transfers still in progress are kept.',
  'en-GB': 'Clear finished transfer records? Records of transfers still in progress are kept.',
  'ja-JP': '完了した転送記録を消去しますか？転送中の記録は保持されます。',
  'ko-KR': '완료된 전송 기록을 지우시겠습니까? 전송 중인 기록은 유지됩니다.',
  'de-DE': 'Abgeschlossene Übertragungsaufzeichnungen löschen? Laufende Übertragungen bleiben erhalten.',
  'fr-FR': 'Effacer les enregistrements de transfert terminés ? Les transferts en cours sont conservés.',
  'es-ES': '¿Borrar los registros de transferencia finalizados? Los registros de transferencias en curso se conservan.',
  'it-IT': 'Cancellare i record di trasferimento completati? I record dei trasferimenti in corso vengono conservati.',
  'pt-BR': 'Limpar registros de transferência concluídos? Os registros de transferências em andamento são mantidos.',
  'pt-PT': 'Limpar registos de transferência concluídos? Os registos de transferências em curso são mantidos.',
  'ru-RU': 'Очистить записи о завершённых передачах? Записи о передачах в процессе сохраняются.',
  'uk-UA': 'Очистити записи про завершені передавання? Записи про передавання в процесі зберігаються.',
  'pl-PL': 'Wyczyścić zakończone rekordy transferu? Rekordy trwających transferów zostaną zachowane.',
  'cs-CZ': 'Vymazat dokončené záznamy přenosu? Záznamy probíhajících přenosů budou zachovány.',
  'tr-TR': 'Tamamlanan aktarım kayıtları temizlensin mi? Devam eden aktarımların kayıtları korunur.',
  'sv-SE': 'Rensa avslutade överföringsloggar? Loggar för pågående överföringar behålls.',
  'da-DK': 'Ryd afsluttede overførselsregistreringer? Registreringer for igangværende overførsler bevares.',
  'bg-BG': 'Изчистване на записите за завършени трансфери? Записите за текущи трансфери се запазват.',
  'hr-HR': 'Očistiti zapise dovršenih prijenosa? Zapisi prijenosa u tijeku zadržavaju se.',
  'sr-Latn': 'Očistiti zapise završenih prenosa? Zapisi prenosa u toku se zadržavaju.',
  'id-ID': 'Hapus catatan transfer yang selesai? Catatan transfer yang sedang berlangsung tetap disimpan.',
  'af-ZA': 'Vee voltooide oordragrekords uit? Rekords van oordragte wat tans plaasvind, word behou.',
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

let touched = 0
for (const [locale, tr] of Object.entries(TRANS)) {
  const full = path.join(localeDir, `${locale}.po`)
  if (!fs.existsSync(full)) { console.warn(`跳过（文件不存在）: ${locale}.po`); continue }
  let txt = fs.readFileSync(full, 'utf8')
  const re = new RegExp(`(msgid "${KEY.replace(/\./g, '\\.')}")(\\r?\\n)msgstr ".*?"`, 'm')
  const m = txt.match(re)
  if (!m) { console.warn(`警告（未找到键）: ${locale}.po`); continue }
  if (m[0].endsWith(`msgstr "${esc(tr)}"`)) continue // 幂等：已是目标值
  txt = txt.replace(re, `$1$2msgstr "${esc(tr)}"`)
  fs.writeFileSync(full, txt, 'utf8')
  touched++
}
console.log(`完成。写入 ${touched} 个文件。`)

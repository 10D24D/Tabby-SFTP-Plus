#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「重复入队」提示 key
 *   notify.duplicateTransfer  {name} 已在传输队列中，已忽略重复请求
 * 用法：node scripts/add-duplicate-transfer-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾（与
 *   add-transfer-queued-i18n.mjs 等既往补丁脚本保持一致）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEY = 'notify.duplicateTransfer'

const T = {
  'af-ZA': '{name} is reeds in die oordragtou — duplikaatversoek geïgnoreer',
  'bg-BG': '{name} вече е в опашката за трансфер — дублираната заявка е игнорирана',
  'cs-CZ': '{name} je již ve frontě přenosů — duplicitní požadavek ignorován',
  'da-DK': '{name} er allerede i overførselskøen — dubleret anmodning ignoreret',
  'de-DE': '{name} ist bereits in der Übertragungswarteschlange — doppelte Anforderung ignoriert',
  'en-GB': '{name} is already in the transfer queue — duplicate request ignored',
  'en-US': '{name} is already in the transfer queue — duplicate request ignored',
  'es-ES': '{name} ya está en la cola de transferencia — solicitud duplicada ignorada',
  'fr-FR': '{name} est déjà dans la file de transfert — demande en double ignorée',
  'hr-HR': '{name} je već u redu za prijenos — duplicirani zahtjev zanemaren',
  'id-ID': '{name} sudah ada dalam antrean transfer — permintaan duplikat diabaikan',
  'it-IT': '{name} è già nella coda di trasferimento — richiesta duplicata ignorata',
  'ja-JP': '{name} はすでに転送キューにあります — 重複リクエストを無視しました',
  'ko-KR': '{name}은(는) 이미 전송 대기열에 있습니다 — 중복 요청을 무시했습니다',
  'pl-PL': '{name} jest już w kolejce transferu — zduplikowane żądanie zignorowano',
  'pt-BR': '{name} já está na fila de transferência — solicitação duplicada ignorada',
  'pt-PT': '{name} já está na fila de transferência — pedido duplicado ignorado',
  'ru-RU': '{name} уже в очереди передачи — повторный запрос проигнорирован',
  'sr-Latn': '{name} je već u redu za prenos — duplikovani zahtev zanemaren',
  'sv-SE': '{name} finns redan i överföringskön — dubblerad begäran ignorerades',
  'tr-TR': '{name} zaten aktarım kuyruğunda — yinelenen istek yoksayıldı',
  'uk-UA': '{name} вже в черзі передачі — повторний запит проігноровано',
  'zh-CN': '{name} 已在传输队列中，已忽略重复请求',
  'zh-TW': '{name} 已在傳輸佇列中，已忽略重複請求',
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const text = T[locale]
  if (!text) { console.warn('skip unknown locale:', file); continue }
  if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale); process.exit(1) }

  const fp = path.join(localeDir, file)
  const raw = fs.readFileSync(fp, 'utf8')
  if (raw.includes(`msgid "${KEY}"`)) continue  // 已存在则跳过（幂等）
  const out = raw.replace(/\s*$/, '\n\n') + `msgid "${KEY}"\nmsgstr "${text}"\n\n`
  fs.writeFileSync(fp, out, 'utf8')
  console.log('patched:', file)
  totalAdded++
}
console.log(`Done. added=${totalAdded}`)

/**
 * 功能描述：新增 i18n key —— 编辑器遇到「不可无损往返的编码」时的保存拦截提示
 * @创建人：DD1024z + Space Bunny
 * @创建时间：2026-10-09
 *
 * 背景（2026-10-09 审计修复配套）：
 *   file-utils.bufferToText 原先对非 UTF-8 回退 latin1（不是真实编码），
 *   中文 Windows 的 GBK/GB18030 文件打开即乱码，用户一按保存就永久损坏原文。
 *   已改为「用真实编码解码（gb18030）」，显示恢复正常。
 *   但 Node 运行时**只有 gb18030 解码器、没有编码器**（实测 Buffer.from(text,'gb18030')
 *   抛 Unknown encoding；TextEncoder 按 WHATWG 规范限定 utf-8），
 *   因此无法按原编码写回 —— 强行按 UTF-8 保存会把 GBK 文件改成 UTF-8，同样是破坏。
 *   决策：此类文件**只读**，禁用保存并给出明确提示（引导改用系统编辑器）。
 *
 * 本脚本只往 24 份 .po 各插入一个条目（幂等：已存在则跳过）。
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ES module 没有 __dirname，用 import.meta.url 推导脚本所在目录
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALE_DIR = path.resolve(__dirname, '..', 'locale')
const KEY = 'editor.encodingNotEditable'

/** 24 语言译文（均为「该文件编码无法安全保存，请改用系统编辑器编辑」之意） */
const T = {
  'en-US': 'This file uses an encoding that cannot be saved safely (e.g. GBK/GB18030). Please edit it in the system editor instead.',
  'zh-CN': '该文件的编码无法安全保存（如 GBK/GB18030），请改用系统编辑器编辑。',
  'zh-TW': '此檔案的編碼無法安全儲存（如 GBK/GB18030），請改用系統編輯器編輯。',
  'en-GB': 'This file uses an encoding that cannot be saved safely (e.g. GBK/GB18030). Please edit it in the system editor instead.',
  'ja-JP': 'このファイルのエンコーディングは安全に保存できません（GBK/GB18030 など）。システムエディタで編集してください。',
  'ko-KR': '이 파일의 인코딩은 안전하게 저장할 수 없습니다(예: GBK/GB18030). 시스템 편집기로 편집해 주세요.',
  'fr-FR': "Ce fichier utilise un encodage qui ne peut pas être enregistré en toute sécurité (par ex. GBK/GB18030). Veuillez l'éditer dans l'éditeur système.",
  'de-DE': 'Diese Datei verwendet eine Kodierung, die nicht sicher gespeichert werden kann (z. B. GBK/GB18030). Bitte bearbeiten Sie sie stattdessen im System-Editor.',
  'es-ES': 'Este archivo usa una codificación que no se puede guardar de forma segura (p. ej. GBK/GB18030). Edítelo en el editor del sistema en su lugar.',
  'pt-BR': 'Este arquivo usa uma codificação que não pode ser salva com segurança (ex.: GBK/GB18030). Edite-o no editor do sistema.',
  'pt-PT': 'Este ficheiro utiliza uma codificação que não pode ser guardada em segurança (ex.: GBK/GB18030). Edite-o no editor do sistema.',
  'ru-RU': 'Этот файл использует кодировку, которую нельзя безопасно сохранить (например, GBK/GB18030). Отредактируйте его в системном редакторе.',
  'it-IT': 'Questo file usa una codifica che non può essere salvata in modo sicuro (es. GBK/GB18030). Modificalo nell’editor di sistema.',
  'id-ID': 'Berkas ini memakai enkode yang tidak dapat disimpan dengan aman (mis. GBK/GB18030). Sunting di editor sistem sebagai gantinya.',
  'cs-CZ': 'Tento soubor používá kódování, které nelze bezpečně uložit (např. GBK/GB18030). Upravte jej prosím v systémovém editoru.',
  'da-DK': 'Denne fil bruger en kodning, der ikke kan gemmes sikkert (f.eks. GBK/GB18030). Rediger den i systemets editor i stedet.',
  'hr-HR': 'Ova datoteka koristi kodiranje koje se ne može sigurno spremiti (npr. GBK/GB18030). Uredite je u sistemskom uređivaču.',
  'pl-PL': 'Ten plik używa kodowania, którego nie można bezpiecznie zapisać (np. GBK/GB18030). Edytuj go w systemowym edytorze.',
  'sv-SE': 'Den här filen använder en kodning som inte kan sparas säkert (t.ex. GBK/GB18030). Redigera den i systemredigeraren i stället.',
  'tr-TR': 'Bu dosya güvenle kaydedilemeyen bir kodlama kullanıyor (örn. GBK/GB18030). Lütfen bunun yerine sistem düzenleyicide düzenleyin.',
  'bg-BG': 'Този файл използва кодиране, което не може да бъде записано безопасно (напр. GBK/GB18030). Моля, редактирайте го в системния редактор.',
  'sr-Latn': 'Ova datoteka koristi kodiranje koje se ne može bezbedno sačuvati (npr. GBK/GB18030). Izmenite je u sistemskom editoru.',
  'uk-UA': 'Цей файл використовує кодування, яке неможливо безпечно зберегти (напр., GBK/GB18030). Відредагуйте його в системному редакторі.',
  'af-ZA': 'Hierdie lêer gebruik \'n enkode wat nie veilig gestoor kan word nie (bv. GBK/GB18030). Wysig dit asse in die stelselredigeerder.',
}

/** po 字符串里需要转义的字符 */
function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

let inserted = 0
let skipped = 0
const missing = []

for (const [locale, text] of Object.entries(T)) {
  const file = path.join(LOCALE_DIR, `${locale}.po`)
  if (!fs.existsSync(file)) { missing.push(locale); continue }
  let content = fs.readFileSync(file, 'utf8')
  // 幂等：已存在该 key 则跳过
  if (content.includes(`msgid "${KEY}"`)) { skipped++; continue }
  const block = `\nmsgid "${KEY}"\nmsgstr "${esc(text)}"\n`
  // 插到文件末尾的最后一个条目之后（po 允许任意顺序，解析器按 msgid/msgstr 配对）
  content = content.replace(/\s*$/, '\n') + block
  fs.writeFileSync(file, content, 'utf8')
  inserted++
}

console.log(`[add-editor-encoding-i18n] inserted=${inserted} skipped=${skipped}`)
if (missing.length) console.log(`  ⚠ 缺少 .po 文件: ${missing.join(', ')}`)
console.log(`  key = ${KEY}  （${Object.keys(T).length} 语言）`)

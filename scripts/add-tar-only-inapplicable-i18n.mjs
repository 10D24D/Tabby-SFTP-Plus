#!/usr/bin/env node
/**
 * 功能描述：为「仅 TAR 模式下打包通道不适用」补齐 24 种语言的文案
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 *
 * 背景：用户质问「为什么开启了仅 TAR 模式传输，还是使用了 SFTP 模式？」—— 根因是
 *   transfer-coordinator._buildPorts() 把通道模式**固化**在构造时（已单独修复），
 *   但还有一类情形**确实**只能走逐文件：目标已存在（增量传输，目录冲突检测依赖逐文件通道）。
 *   此前这种情况在仅 TAR 模式下完全静默，用户只看到传输记录标着 ⇄SFTP，无从判断是
 *   「设置没生效」还是「本次不适用」。故补一条**说明性**提示（区别于 notify.tarOnlyFailed 的失败提示）。
 *
 * 新增的 key：
 *   notify.tarOnlyInapplicable      （说明性提示主文案，含 {name} / {reason} 占位符）
 *   tarchan.reason.targetExists     （原因：目标已存在，增量只能走逐文件通道）
 *
 * 用法：node scripts/add-tar-only-inapplicable-i18n.mjs
 * 说明：直接替换已存在的 msgstr（含多行 msgstr），key 不存在则追加到文件末尾；
 *   可安全重复执行（幂等）。未显式给出翻译的语言回退 en-US（与上一批文案一致）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const T = {
  // 仅 TAR 模式下「不适用」的说明性提示（{name} 目录名，{reason} 原因短语，并给出解法）
  'notify.tarOnlyInapplicable': {
    'en-US': 'TAR-only mode: {name} is not using the packed channel - {reason}. To send it as one archive, choose Overwrite in the directory conflict prompt, or delete the destination first and retry',
    'zh-CN': '仅 TAR 模式：{name} 未使用打包通道 —— {reason}。若希望打包传输，请在目录冲突提示中选择「覆盖」，或先删除目标目录后重试',
    'zh-TW': '僅 TAR 模式：{name} 未使用打包通道 —— {reason}。若希望打包傳輸，請在目錄衝突提示中選擇「覆蓋」，或先刪除目標目錄後重試',
  },
  'tarchan.reason.targetExists': {
    'en-US': 'the destination already exists, and an incremental transfer can only go through the per-file channel',
    'zh-CN': '目标已存在，增量传输只能走逐文件通道',
    'zh-TW': '目標已存在，增量傳輸只能走逐檔通道',
  },
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let totalChanged = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  let changed = 0

  for (const key of Object.keys(T)) {
    const text = T[key][locale] ?? T[key]['en-US']
    if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale, key); process.exit(1) }

    // 匹配 msgid 行 + 紧随的 msgstr（含多行拼接形式），整体替换 msgstr 内容
    const re = new RegExp(
      `(msgid "${escapeRe(key)}"\\s*\\nmsgstr )"[^"]*"(?:\\n"[^"]*")*`,
      'g',
    )
    if (re.test(raw)) {
      const next = raw.replace(re, `$1"${text}"`)
      if (next !== raw) { raw = next; changed++ }
    } else {
      raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
      changed++
    }
  }

  if (changed > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${changed} keys)`)
    totalChanged += changed
  }
}
console.log(`Done. totalChanged=${totalChanged}`)

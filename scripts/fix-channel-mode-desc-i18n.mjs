#!/usr/bin/env node
/**
 * 功能描述：修订全部 24 种语言的「传输通道模式」说明文案
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 *
 * 背景：原文案「仅 TAR」写作「始终尝试打包；仅当远端打包失败才回退 SFTP」，
 *   容易被读成"选了仅 TAR 还会偷偷走 SFTP"，与模式名的"仅"字自相矛盾。
 *   实际语义：**仅 = 不做规模择路（小目录也照样打包）**，只有在远端根本没有 tar
 *   这种物理不可用时才兜底逐文件——不回退就只能传输失败。
 *   故本次改写为明确表述，并按用户选择「只改文案、不改行为」。
 *
 * 修订的 key：
 *   settings.channelMode.tarOnlyDesc   （仅 TAR 说明）
 *   settings.channelMode.sftpOnlyDesc  （仅 SFTP 说明）
 *
 * 用法：node scripts/fix-channel-mode-desc-i18n.mjs
 * 说明：直接替换已存在的 msgstr（含多行 msgstr），可安全重复执行（幂等）；
 *   若某 key 不存在则追加到文件末尾。未显式给出翻译的语言回退 en-US。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const T = {
  // 仅 SFTP：不做规模择路、一律逐文件（本身不涉及打包，无回退概念）
  'settings.channelMode.sftpOnlyDesc': {
    'en-US': 'Always transfer file by file; never use tar packing and no size-based routing',
    'zh-CN': '一律逐文件传输，不使用打包通道，不做规模判断',
    'zh-TW': '一律逐檔傳輸，不使用打包通道，不做規模判斷',
  },
  // 仅 TAR：不做规模择路、一律打包；只有远端没有 tar 时才兜底逐文件（否则无法传输）
  'settings.channelMode.tarOnlyDesc': {
    'en-US': 'Always use tar packing with no size-based routing; file-by-file only when the remote lacks tar (otherwise the transfer cannot proceed)',
    'zh-CN': '一律走打包通道，不做规模判断；仅当远端没有 tar 时才兜底逐文件（否则无法传输）',
    'zh-TW': '一律走打包通道，不做規模判斷；僅當遠端沒有 tar 時才兜底逐檔（否則無法傳輸）',
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

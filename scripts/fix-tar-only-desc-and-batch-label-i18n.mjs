#!/usr/bin/env node
/**
 * 功能描述：修订「仅 TAR」说明文案，并补齐多选批量打包的进度条目文案（全部 24 种语言）
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 *
 * 背景一（settings.channelMode.tarOnlyDesc）：上一版在末尾写了
 *   「（目标已存在、需要逐文件冲突检测时除外）」—— 措辞过于绝对，且与本轮新增的
 *   「多选批量打包」一起看已经不准：
 *     · 「目标已存在」不是「打包通道不适用」，只是**第一次自动尝试**必须先走逐文件，
 *       因为增量传输的冲突检测依赖逐文件通道（目录冲突框就是这么弹出来的）；
 *     · 用户在冲突提示里选「覆盖」或「重命名」之后，两条出口都会改走打包通道
 *       （下载侧 2026-09-26、上传侧 2026-09-29 先后补齐，见 tar-channel 文件头）；
 *     · 单个文件在任何模式下都恒走逐文件 —— tar 只能打包目录/多条目集合，
 *       为一个文件单独打包是负收益。这条此前完全没写，是用户最容易误判的地方。
 *   故改为按「主句 + 例外 + 单文件」三段陈述，不再用括注把例外糊在主句尾巴上。
 *
 * 背景二（transfer.batchUpload）：新增「多选批量打包」后，一次多选只产生**一条**进度
 *   条目（不再是 N 条），需要一个能说明「这是哪个目录里的一批东西」的标签。
 *   占位符：{dir} = 这批条目的共同父目录名，{n} = 条目数。
 *
 * 用法：node scripts/fix-tar-only-desc-and-batch-label-i18n.mjs
 * 说明：直接替换已存在的 msgstr（含多行 msgstr），可安全重复执行（幂等）；
 *   若某 key 不存在则追加到文件末尾。未显式给出翻译的语言回退 en-US。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const T = {
  // 仅 TAR：不做规模择路、一律打包；不可用/失败直接硬失败；例外与单文件边界写清楚
  'settings.channelMode.tarOnlyDesc': {
    'en-US': 'Always use tar packing with no size-based routing; when packing is unavailable or fails, report the error instead of falling back to file-by-file. When the destination already exists the first attempt still goes file-by-file so conflicts can be detected; choosing Overwrite or Rename in the conflict prompt then continues with tar packing. A single file is always transferred file by file',
    'zh-CN': '一律走打包通道，不做规模判断；打包不可用或失败时直接提示失败，不回退逐文件。目标已存在时首次尝试仍走逐文件以检测冲突，在冲突提示中选「覆盖」或「重命名」后会改走打包通道；单个文件始终逐文件传输',
    'zh-TW': '一律走打包通道，不做規模判斷；打包不可用或失敗時直接提示失敗，不回退逐檔。目標已存在時首次嘗試仍走逐檔以檢測衝突，在衝突提示中選「覆蓋」或「重新命名」後會改走打包通道；單一檔案始終逐檔傳輸',
  },
  // 多选批量打包的进度条目名（{dir} 共同父目录名，{n} 条目数）
  'transfer.batchUpload': {
    'en-US': '{n} items from {dir}',
    'zh-CN': '{dir} 等 {n} 项',
    'zh-TW': '{dir} 等 {n} 項',
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

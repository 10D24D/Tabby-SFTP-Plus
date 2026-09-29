#!/usr/bin/env node
/**
 * 功能描述：为「仅 TAR 模式硬失败」补齐 24 种语言的文案
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 *
 * 背景：用户质问「为什么仅 XX 模式，还会有回退的？」—— 原「仅 TAR」在打包通道不可用
 *   （本地/远端无 tar、目录含符号链接、打包或解包失败）时静默回退逐文件通道。
 *   现改为**不回退**：直接失败并提示原因与解决方法（见 tar-channel 的 _decline）。
 *
 * 修订/新增的 key：
 *   settings.channelMode.tarOnlyDesc     （仅 TAR 说明，改为「不回退」表述）
 *   notify.tarOnlyFailed                 （失败提示主文案，含 {name} / {reason} 两个占位符）
 *   tarchan.reason.localTarMissing       （原因：本机无 tar）
 *   tarchan.reason.remoteTarMissing      （原因：远端无 tar）
 *   tarchan.reason.symlinkUnsupported    （原因：含符号链接）
 *   tarchan.reason.packFailed            （原因：打包/解包失败）
 *   tarchan.reason.tarballFailed         （原因：归档文件传输失败）
 *   tarchan.reason.other                 （原因：其它，详见日志）
 *
 * 用法：node scripts/add-tar-only-hardfail-i18n.mjs
 * 说明：直接替换已存在的 msgstr（含多行 msgstr），key 不存在则追加到文件末尾；
 *   可安全重复执行（幂等）。未显式给出翻译的语言回退 en-US。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const T = {
  // 仅 TAR：不做规模择路、一律打包；无法打包时直接失败（不再回退逐文件）
  'settings.channelMode.tarOnlyDesc': {
    'en-US': 'Always use tar packing with no size-based routing; if packing is unavailable or fails, report the error instead of falling back to file-by-file (except when the destination already exists and per-file conflict checks are needed)',
    'zh-CN': '一律走打包通道，不做规模判断；无法打包时直接提示失败，不再回退逐文件（目标已存在、需要逐文件冲突检测时除外）',
    'zh-TW': '一律走打包通道，不做規模判斷；無法打包時直接提示失敗，不再回退逐檔（目標已存在、需要逐檔衝突檢測時除外）',
  },
  // 仅 TAR 模式硬失败主提示（{name} 目录名，{reason} 原因短语）
  'notify.tarOnlyFailed': {
    'en-US': 'TAR-only mode: cannot transfer {name} - {reason}. Change Transfer channel mode to Smart / Prefer TAR in Settings, or fix the environment and retry',
    'zh-CN': '仅 TAR 模式：无法传输 {name} —— {reason}。可在「设置 · 传输通道模式」改为智能或优先 TAR，或处理该问题后重试',
    'zh-TW': '僅 TAR 模式：無法傳輸 {name} —— {reason}。可在「設定 · 傳輸通道模式」改為智慧或優先 TAR，或處理該問題後重試',
  },
  'tarchan.reason.localTarMissing': {
    'en-US': 'no usable tar command on this computer',
    'zh-CN': '本机没有可用的 tar 命令',
    'zh-TW': '本機沒有可用的 tar 命令',
  },
  'tarchan.reason.remoteTarMissing': {
    'en-US': 'no usable tar command on the remote server',
    'zh-CN': '远端服务器没有可用的 tar 命令',
    'zh-TW': '遠端伺服器沒有可用的 tar 命令',
  },
  'tarchan.reason.symlinkUnsupported': {
    'en-US': 'the folder contains symbolic links, which the packing channel does not support',
    'zh-CN': '目录内含符号链接，打包通道不支持',
    'zh-TW': '目錄內含符號連結，打包通道不支援',
  },
  'tarchan.reason.packFailed': {
    'en-US': 'packing or extracting the archive failed',
    'zh-CN': '打包或解包失败',
    'zh-TW': '打包或解包失敗',
  },
  'tarchan.reason.tarballFailed': {
    'en-US': 'transferring the archive file failed',
    'zh-CN': '归档文件传输失败',
    'zh-TW': '封存檔傳輸失敗',
  },
  'tarchan.reason.other': {
    'en-US': 'the packing channel is unavailable, see the log for details',
    'zh-CN': '打包通道不可用，详见日志',
    'zh-TW': '打包通道無法使用，詳見日誌',
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

#!/usr/bin/env node
/**
 * 功能描述：把打包通道的「打包或解包失败」一码拆成按**发生位置**区分的四个原因码，补齐 24 语言文案
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 *
 * 背景（用户实测）：仅 TAR 模式下载目录时提示「打包或解包失败」，用户随即质问
 *   「这是远程打包失败了呢？还是传输到本地，本地解压失败了？看样子远程是打包成功的？」
 *   —— 旧码 `packFailed` 同时覆盖「远端打包失败」「本机打包失败」「本机解包失败」三件事，
 *   提示文案无法指出是哪一端出的问题（已定位到的真实原因：见 nameEncodingUnsupported）。
 *   现在按发生位置拆开，并单列「跨系统文件名编码还原不了」这条（它有明确的可行动解法）。
 *
 * 新增的 key：
 *   tarchan.reason.localPackFailed          （本机打包失败）
 *   tarchan.reason.remotePackFailed         （远端打包/解包失败）
 *   tarchan.reason.localExtractFailed       （本机解包失败）
 *   tarchan.reason.nameEncodingUnsupported  （远端文件名编码无法在本机还原）
 *
 * 用法：node scripts/add-tar-failure-split-i18n.mjs
 * 说明：key 不存在则追加到文件末尾，已存在则替换 msgstr；可安全重复执行（幂等）。
 *   未显式给出翻译的语言回退 en-US（与既有约定一致）。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const T = {
  'tarchan.reason.localPackFailed': {
    'en-US': 'packing the folder on this computer failed, possibly due to disk space or permissions',
    'zh-CN': '本机打包失败，可能是磁盘空间或权限问题',
    'zh-TW': '本機打包失敗，可能是磁碟空間或權限問題',
  },
  'tarchan.reason.remotePackFailed': {
    'en-US': 'packing or extracting on the remote server failed, possibly due to disk space or permissions',
    'zh-CN': '远端打包或解包失败，可能是磁盘空间或权限问题',
    'zh-TW': '遠端打包或解包失敗，可能是磁碟空間或權限問題',
  },
  'tarchan.reason.localExtractFailed': {
    'en-US': 'extracting the archive on this computer failed, see the log for details',
    'zh-CN': '本机解包失败，详见日志',
    'zh-TW': '本機解包失敗，詳見日誌',
  },
  'tarchan.reason.nameEncodingUnsupported': {
    'en-US': 'the file names on the remote server cannot be decoded on this computer; switch to Smart or Prefer SFTP mode, or upgrade the tar command on the server',
    'zh-CN': '远端文件名编码无法在本机还原；请改用智能或优先 SFTP 模式，或升级服务器上的 tar 命令',
    'zh-TW': '遠端檔名編碼無法在本機還原；請改用智慧或優先 SFTP 模式，或升級伺服器上的 tar 命令',
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

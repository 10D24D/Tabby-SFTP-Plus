/**
 * 将 tabby-FTPS+/src 内裸 console.* 替换为统一 log.*，并自动补 import。
 * 用法：node scripts/replace-console-with-logger.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '../src')
const LOGGER_FILE = path.normalize(path.join(SRC, 'services', 'sftp-logger.ts'))

const LEVEL_MAP = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug',
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (ent.isFile() && ent.name.endsWith('.ts')) out.push(p)
  }
  return out
}

function relImport(fromFile) {
  let rel = path.relative(path.dirname(fromFile), path.join(SRC, 'services', 'sftp-logger'))
    .replace(/\\/g, '/')
  if (!rel.startsWith('.')) rel = './' + rel
  return rel
}

function stripSftpPrefix(src) {
  // console.X('[SFTP+] msg' → log.Y('msg'
  // console.X(`[SFTP+] ${x}` → log.Y(`${x}`
  // console.X('[SFTP+ Foo] msg' → log.Y('msg'
  return src
    .replace(/console\.(log|info|warn|error|debug)\(\s*'\[SFTP\+[^\]]*\]\s*/g, (m, level) => {
      return `log.${LEVEL_MAP[level]}('`
    })
    .replace(/console\.(log|info|warn|error|debug)\(\s*"\[SFTP\+[^\]]*\]\s*/g, (m, level) => {
      return `log.${LEVEL_MAP[level]}("`
    })
    .replace(/console\.(log|info|warn|error|debug)\(\s*`\[SFTP\+[^\]]*\]\s*/g, (m, level) => {
      return `log.${LEVEL_MAP[level]}(\``
    })
    .replace(/console\.(log|info|warn|error|debug)\(/g, (m, level) => {
      return `log.${LEVEL_MAP[level]}(`
    })
}

function processFile(file) {
  if (path.normalize(file) === LOGGER_FILE) return false
  let text = fs.readFileSync(file, 'utf8')
  if (!/\bconsole\.(log|info|warn|error|debug)\s*\(/.test(text)) return false

  const next = stripSftpPrefix(text)
  if (next === text) return false

  // 已有 import 则跳过补 import
  if (!/from ['"].*sftp-logger['"]/.test(next) && /\blog\.(debug|info|warn|error|log)\s*\(/.test(next)) {
    const importLine = `import { log } from '${relImport(file)}'\n`
    // 插在最后一个 import 之后
    const importRe = /^(import[\s\S]*?from\s+['"][^'"]+['"];?\s*\r?\n)+/m
    if (importRe.test(next)) {
      text = next.replace(importRe, (block) => block + importLine)
    } else {
      text = importLine + next
    }
  } else {
    text = next
  }

  fs.writeFileSync(file, text)
  return true
}

const files = walk(SRC)
let n = 0
for (const f of files) {
  if (processFile(f)) {
    n++
    console.log('updated', path.relative(SRC, f))
  }
}
console.log(`done: ${n} files`)

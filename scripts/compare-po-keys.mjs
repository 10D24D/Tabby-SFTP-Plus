import fs from 'fs'
import path from 'path'

const localeDir = path.join(process.cwd(), 'locale')

function keys(file) {
  const c = fs.readFileSync(path.join(localeDir, file), 'utf8')
  const s = new Set()
  for (const m of c.matchAll(/^msgid "([^"]+)"/gm)) {
    if (m[1]) s.add(m[1])
  }
  return s
}

const zh = keys('zh-CN.po')
const en = keys('en-US.po')
const onlyZh = [...zh].filter((k) => !en.has(k)).sort()
const onlyEn = [...en].filter((k) => !zh.has(k)).sort()
console.log(JSON.stringify({ zhCount: zh.size, enCount: en.size, onlyZh, onlyEn }, null, 2))

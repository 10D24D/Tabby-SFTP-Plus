#!/usr/bin/env node
/**
 * Compare all locale/*.po against en-US.po for missing / empty entries.
 * Robust against literal newlines inside quoted strings.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

function unescapePo(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function parsePo(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  const entries = new Map()
  let msgid = null
  let msgstr = null
  let collecting = null
  let fuzzy = false
  let pendingFuzzy = false

  const flush = () => {
    if (msgid !== null && msgstr !== null && msgid !== '') {
      entries.set(msgid, { msgstr, fuzzy: fuzzy || pendingFuzzy })
    }
    msgid = null
    msgstr = null
    collecting = null
    fuzzy = false
    pendingFuzzy = false
  }

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('#,') && line.includes('fuzzy')) {
      pendingFuzzy = true
      continue
    }
    const idMatch = line.match(/^msgid\s+"(.*)"\s*$/)
    if (idMatch) {
      if (msgid !== null && msgstr !== null) flush()
      collecting = 'id'
      msgid = unescapePo(idMatch[1])
      msgstr = null
      fuzzy = pendingFuzzy
      pendingFuzzy = false
      continue
    }
    const strMatch = line.match(/^msgstr\s+"(.*)"\s*$/)
    if (strMatch) {
      collecting = 'str'
      msgstr = unescapePo(strMatch[1])
      continue
    }
    const cont = line.match(/^"(.*)"\s*$/)
    if (cont && collecting) {
      const piece = unescapePo(cont[1])
      if (collecting === 'id') msgid = (msgid || '') + piece
      else msgstr = (msgstr || '') + piece
      continue
    }
    if (!line.trim()) flush()
  }
  flush()
  return entries
}

const ref = parsePo(path.join(localeDir, 'en-US.po'))
const refIds = [...ref.keys()]
console.log(`en-US entries: ${refIds.length}`)

const files = fs.readdirSync(localeDir).filter((f) => f.endsWith('.po')).sort()
const summary = []
for (const f of files) {
  if (f === 'en-US.po') continue
  const ents = parsePo(path.join(localeDir, f))
  const missing = refIds.filter((m) => !ents.has(m))
  const empty = refIds.filter((m) => ents.has(m) && !ents.get(m).msgstr)
  const staleAllow = [...ents.keys()].filter((k) =>
    k === 'settings.allowEditAllFiles' ||
    k === 'settings.allowEditAllFilesHint' ||
    k === 'settings.allowViewAllAsText' ||
    k === 'settings.allowViewAllAsTextHint' ||
    k === 'settings.allowViewAllFiles'
  )
  summary.push({ f, missing: missing.length, empty: empty.length, staleAllow, missingKeys: missing })
  if (missing.length || empty.length || staleAllow.length) {
    console.log(`\n== ${f} == missing=${missing.length} empty=${empty.length} staleAllow=${staleAllow.length}`)
    for (const m of missing) console.log('  MISSING:', m)
    for (const m of empty) console.log('  EMPTY:', m)
    for (const m of staleAllow) console.log('  STALE:', m, '=>', JSON.stringify(ents.get(m).msgstr).slice(0, 70))
  }
}

const allMissing = new Set()
for (const s of summary) for (const k of s.missingKeys) allMissing.add(k)
console.log('\n=== UNIQUE MISSING KEYS ACROSS LOCALES ===')
for (const k of [...allMissing].sort()) {
  console.log(`  ${k}: ${JSON.stringify(ref.get(k)?.msgstr || '')}`)
}
console.log(`\nTotal unique missing keys: ${allMissing.size}`)

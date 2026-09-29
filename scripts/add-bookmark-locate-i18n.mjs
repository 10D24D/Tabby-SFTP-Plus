#!/usr/bin/env node
/**
 * 追加书签「定位当前」相关 i18n（幂等）
 * 创建人：DD1024z + Composer
 * 创建时间：2026-09-20
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEYS = {
  'bookmark.locate': {
    'zh-CN': '定位当前书签', 'zh-TW': '定位目前書籤',
    'en-US': 'Locate current bookmark', 'en-GB': 'Locate current bookmark',
    'ja-JP': '現在のブックマークへ移動', 'ko-KR': '현재 책갈피로 이동',
    'de-DE': 'Aktuelles Lesezeichen anzeigen', 'fr-FR': 'Localiser le favori actuel',
    'es-ES': 'Localizar marcador actual', 'it-IT': 'Individua segnalibro corrente',
    'pt-BR': 'Localizar favorito atual', 'pt-PT': 'Localizar favorito atual',
    'ru-RU': 'Перейти к текущей закладке', 'uk-UA': 'Перейти до поточної закладки',
    'pl-PL': 'Pokaż bieżącą zakładkę', 'cs-CZ': 'Přejít na aktuální záložku',
    'tr-TR': 'Geçerli yer imine git', 'sv-SE': 'Hitta aktuellt bokmärke',
    'da-DK': 'Find aktuelt bogmærke', 'bg-BG': 'Отиди до текущата отметка',
    'hr-HR': 'Pronađi trenutnu oznaku', 'sr-Latn': 'Pronađi trenutni obeleživač',
    'id-ID': 'Temukan penanda saat ini', 'af-ZA': 'Vind huidige boekmerk',
  },
  'bookmark.locateNone': {
    'zh-CN': '当前路径没有对应书签', 'zh-TW': '目前路徑沒有對應書籤',
    'en-US': 'No bookmark for current path', 'en-GB': 'No bookmark for current path',
    'ja-JP': '現在のパスにブックマークがありません', 'ko-KR': '현재 경로에 책갈피가 없습니다',
    'de-DE': 'Kein Lesezeichen für den aktuellen Pfad', 'fr-FR': 'Aucun favori pour le chemin actuel',
    'es-ES': 'No hay marcador para la ruta actual', 'it-IT': 'Nessun segnalibro per il percorso corrente',
    'pt-BR': 'Nenhum favorito para o caminho atual', 'pt-PT': 'Nenhum favorito para o caminho atual',
    'ru-RU': 'Нет закладки для текущего пути', 'uk-UA': 'Немає закладки для поточного шляху',
    'pl-PL': 'Brak zakładki dla bieżącej ścieżki', 'cs-CZ': 'Pro aktuální cestu není záložka',
    'tr-TR': 'Geçerli yol için yer imi yok', 'sv-SE': 'Inget bokmärke för aktuell sökväg',
    'da-DK': 'Intet bogmærke for aktuel sti', 'bg-BG': 'Няма отметка за текущия път',
    'hr-HR': 'Nema oznake za trenutnu putanju', 'sr-Latn': 'Nema obeleživača za trenutnu putanju',
    'id-ID': 'Tidak ada penanda untuk jalur saat ini', 'af-ZA': 'Geen boekmerk vir huidige pad nie',
  },
}

function poEscape(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasKey(txt, key) {
  return new RegExp(`^msgid\\s+"${escRe(key)}"\\s*$`, 'm').test(txt)
}

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
let added = 0
for (const file of files) {
  const lang = file.replace(/\.po$/, '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  const blocks = []
  for (const [key, perLang] of Object.entries(KEYS)) {
    const val = perLang[lang] ?? perLang['en-US']
    if (!val || hasKey(txt, key)) continue
    blocks.push(`\nmsgid "${key}"\nmsgstr "${poEscape(val)}"\n`)
  }
  if (blocks.length) {
    if (!txt.endsWith('\n')) txt += '\n'
    txt += blocks.join('')
    fs.writeFileSync(full, txt, 'utf8')
    added += blocks.length
    console.log(`[ok] ${file} +${blocks.length}`)
  } else {
    console.log(`[skip] ${file}`)
  }
}
console.log(`[i18n] added ${added} entries`)

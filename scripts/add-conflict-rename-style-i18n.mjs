#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「冲突重命名风格」所需 key
 *   settings.conflictRenameStyle      设置页「传输」分区下拉标题
 *   settings.conflictRenameStyleHint  该行 title（说明这个选项管什么）
 *   settings.renameStyleSeq           档位：序号堆叠（file (1).txt）
 *   settings.renameStyleTime          档位：时间戳（file_20261023-103512.txt）
 *   settings.renameStyleRandom        档位：随机后缀（file_A1B2C3D4.txt）
 * 用法：node scripts/add-conflict-rename-style-i18n.mjs
 *
 * 注：本脚本把 key **追加到文件末尾**，不做「锚点后插入」——锚点插入一旦把
 *   msgid 落到另一条 msgstr 后面，就会变成「连续 msgid + 顺延 msgstr」的错位
 *   （gettext 不报错、界面直接显 key）。
 *
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-23
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'settings.conflictRenameStyle',
  'settings.conflictRenameStyleHint',
  'settings.renameStyleSeq',
  'settings.renameStyleTime',
  'settings.renameStyleRandom',
]

const T = {
  'settings.conflictRenameStyle': {
    'af-ZA': 'Hername-styl vir botsings',
    'bg-BG': 'Стил на преименуване при конфликт',
    'cs-CZ': 'Styl přejmenování při konfliktu',
    'da-DK': 'Omdøbningsstil ved konflikt',
    'de-DE': 'Umbenennungsstil bei Konflikt',
    'en-GB': 'Conflict rename style',
    'en-US': 'Conflict rename style',
    'es-ES': 'Estilo de renombrado en conflictos',
    'fr-FR': 'Style de renommage en cas de conflit',
    'hr-HR': 'Stil preimenovanja pri sukobu',
    'id-ID': 'Gaya penamaan ulang saat konflik',
    'it-IT': 'Stile di rinomina in caso di conflitto',
    'ja-JP': '競合時の名前変更スタイル',
    'ko-KR': '충돌 시 이름 변경 방식',
    'pl-PL': 'Styl zmiany nazwy przy konflikcie',
    'pt-BR': 'Estilo de renomeação em conflito',
    'pt-PT': 'Estilo de renomeação em conflito',
    'ru-RU': 'Стиль переименования при конфликте',
    'sr-Latn': 'Stil preimenovanja pri sukobu',
    'sv-SE': 'Namnstil vid konflikt',
    'tr-TR': 'Çakışmada yeniden adlandırma stili',
    'uk-UA': 'Стиль перейменування при конфлікті',
    'zh-CN': '冲突重命名风格',
    'zh-TW': '衝突重新命名風格',
  },
  'settings.conflictRenameStyleHint': {
    'af-ZA': 'Hoe nuwe name geskep word wanneer jy Rename op n botsing kies (nommers by verstek)',
    'bg-BG': 'Как се създават нови имена при избор на Преименуване (по подразбиране номера)',
    'cs-CZ': 'Jak se tvoří nové názvy při volbě Přejmenovat (výchozí je číslování)',
    'da-DK': 'Hvordan nye navne dannes, når du vælger Omdøb ved en konflikt (nummerering som standard)',
    'de-DE': 'Wie neue Namen beim Umbenennen gebildet werden (standardmäßig nummeriert)',
    'en-GB': 'How a new name is built when you choose Rename on a conflict (numbered by default)',
    'en-US': 'How a new name is built when you choose Rename on a conflict (numbered by default)',
    'es-ES': 'Cómo se genera el nuevo nombre al elegir Renombrar en un conflicto (numerado por defecto)',
    'fr-FR': 'Comment le nouveau nom est construit quand vous choisissez Renommer (numéroté par défaut)',
    'hr-HR': 'Kako se sastavlja novo ime kad odaberete Preimenuj pri sukobu (brojevi po zadanom)',
    'id-ID': 'Cara nama baru dibuat saat memilih Ganti nama pada konflik (bernomor secara bawaan)',
    'it-IT': 'Come viene creato il nuovo nome scegliendo Rinomina (numerato per impostazione predefinita)',
    'ja-JP': '競合で「名前を変更」を選んだときの新しい名前の作り方（既定は連番）',
    'ko-KR': '충돌 시 이름 변경을 선택할 때 새 이름을 만드는 방식 (기본은 번호 붙이기)',
    'pl-PL': 'Jak powstaje nowa nazwa po wybraniu Zmień nazwę (domyślnie numerowanie)',
    'pt-BR': 'Como o novo nome é criado ao escolher Renomear em um conflito (numerado por padrão)',
    'pt-PT': 'Como o novo nome é criado ao escolher Renomear num conflito (numerado por omissão)',
    'ru-RU': 'Как формируется новое имя при выборе «Переименовать» (по умолчанию с номером)',
    'sr-Latn': 'Kako se sastavlja novo ime kad izaberete Preimenuj pri sukobu (brojevi po podrazumevanom)',
    'sv-SE': 'Hur nya namn skapas när du väljer Byt namn vid en konflikt (numreras som standard)',
    'tr-TR': 'Çakışmada Yeniden adlandır seçildiğinde yeni adın nasıl oluşturulacağı (varsayılan numaralı)',
    'uk-UA': 'Як формується нове ім’я після вибору «Перейменувати» (типово з номером)',
    'zh-CN': '冲突时选「重命名」的新名字怎么起（默认按序号堆叠）',
    'zh-TW': '衝突時選「重新命名」的新名稱怎麼起（預設按序號堆疊）',
  },
  'settings.renameStyleSeq': {
    'af-ZA': 'Genomnommer',
    'bg-BG': 'С номера',
    'cs-CZ': 'Číslované',
    'da-DK': 'Nummereret',
    'de-DE': 'Nummeriert',
    'en-GB': 'Numbered',
    'en-US': 'Numbered',
    'es-ES': 'Numerado',
    'fr-FR': 'Numéroté',
    'hr-HR': 'Numerirano',
    'id-ID': 'Bernomor',
    'it-IT': 'Numerato',
    'ja-JP': '連番',
    'ko-KR': '번호 붙이기',
    'pl-PL': 'Numerowane',
    'pt-BR': 'Numerado',
    'pt-PT': 'Numerado',
    'ru-RU': 'С номером',
    'sr-Latn': 'Numerisano',
    'sv-SE': 'Numrerat',
    'tr-TR': 'Numaralı',
    'uk-UA': 'З номером',
    'zh-CN': '序号堆叠',
    'zh-TW': '序號堆疊',
  },
  'settings.renameStyleTime': {
    'af-ZA': 'Tydstempel',
    'bg-BG': 'С времеви печат',
    'cs-CZ': 'S časovým razítkem',
    'da-DK': 'Tidsstempel',
    'de-DE': 'Zeitstempel',
    'en-GB': 'Timestamp',
    'en-US': 'Timestamp',
    'es-ES': 'Marca de tiempo',
    'fr-FR': 'Horodatage',
    'hr-HR': 'Vremenska oznaka',
    'id-ID': 'Stempel waktu',
    'it-IT': 'Data e ora',
    'ja-JP': 'タイムスタンプ',
    'ko-KR': '타임스탬프',
    'pl-PL': 'Znacznik czasu',
    'pt-BR': 'Data e hora',
    'pt-PT': 'Data e hora',
    'ru-RU': 'С меткой времени',
    'sr-Latn': 'Vremenska oznaka',
    'sv-SE': 'Tidsstämpel',
    'tr-TR': 'Zaman damgası',
    'uk-UA': 'З міткою часу',
    'zh-CN': '时间戳',
    'zh-TW': '時間戳記',
  },
  'settings.renameStyleRandom': {
    'af-ZA': 'Lukrake agtervoegsel',
    'bg-BG': 'Случаен наставка',
    'cs-CZ': 'Náhodná přípona',
    'da-DK': 'Tilfældig endelse',
    'de-DE': 'Zufälliges Suffix',
    'en-GB': 'Random suffix',
    'en-US': 'Random suffix',
    'es-ES': 'Sufijo aleatorio',
    'fr-FR': 'Suffixe aléatoire',
    'hr-HR': 'Slučajni sufiks',
    'id-ID': 'Akhiran acak',
    'it-IT': 'Suffisso casuale',
    'ja-JP': 'ランダム接尾辞',
    'ko-KR': '임의 접미사',
    'pl-PL': 'Losowy sufiks',
    'pt-BR': 'Sufixo aleatório',
    'pt-PT': 'Sufixo aleatório',
    'ru-RU': 'Случайный суффикс',
    'sr-Latn': 'Slučajni sufiks',
    'sv-SE': 'Slumpmässigt suffix',
    'tr-TR': 'Rastgele son ek',
    'uk-UA': 'Випадковий суфікс',
    'zh-CN': '随机后缀',
    'zh-TW': '隨機後綴',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  let added = 0
  for (const key of KEYS) {
    const text = T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: double quote in translation:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
    raw = raw.replace(/\s*$/, eol + eol) + `msgid "${key}"${eol}msgstr "${text}"${eol}${eol}`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)

const fs = require('fs')
const path = require('path')

const DIR = 'D:/My/CodeProject/TabbyPlugins/tabby-FTPS+/locale'

const T = {
  'af-ZA': 'Beklemtoon lys by hernuwe',
  'bg-BG': 'Подчертаване на списъка при опресняване',
  'cs-CZ': 'Zvýraznit seznam při obnovení',
  'da-DK': 'Fremhæv liste ved opdatering',
  'de-DE': 'Liste bei Aktualisierung hervorheben',
  'en-GB': 'Highlight list on refresh',
  'en-US': 'Highlight list on refresh',
  'es-ES': 'Resaltar lista al actualizar',
  'fr-FR': 'Mettre en évidence la liste lors de l’actualisation',
  'hr-HR': 'Istakni popis pri osvježavanju',
  'id-ID': 'Sorot daftar saat menyegarkan',
  'it-IT': 'Evidenzia elenco all’aggiornamento',
  'ja-JP': '更新時にリストを強調',
  'ko-KR': '새로 고침 시 목록 강조',
  'pl-PL': 'Podświetl listę przy odświeżaniu',
  'pt-BR': 'Realçar lista ao atualizar',
  'pt-PT': 'Realçar lista ao atualizar',
  'ru-RU': 'Подсветка списка при обновлении',
  'sr-Latn': 'Istakni listu pri osvežavanju',
  'sv-SE': 'Markera lista vid uppdatering',
  'tr-TR': 'Yenilemede listeyi vurgula',
  'uk-UA': 'Підсвічування списку при оновленні',
  'zh-CN': '列表刷新闪烁',
  'zh-TW': '列表刷新閃爍',
}

const ANCHOR = 'msgid "settings.autoRefreshDesc"'
const report = []
for (const code of Object.keys(T)) {
  const f = path.join(DIR, code + '.po')
  const raw = fs.readFileSync(f, 'utf8')
  const crlf = raw.includes('\r\n')
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const i = lines.indexOf(ANCHOR)
  if (i < 0) { report.push(code + ': 缺锚点'); continue }
  let j = i + 1
  while (j < lines.length && !lines[j].startsWith('msgstr ')) j++
  let k = j + 1
  while (k < lines.length && !lines[k].startsWith('msgid "')) k++
  const block = ['', 'msgid "settings.listRefreshFlash"', 'msgstr "' + T[code] + '"', '']
  lines.splice(k, 0, ...block)
  let out = lines.join('\n')
  if (crlf) out = out.replace(/\n/g, '\r\n')
  fs.writeFileSync(f, out, 'utf8')
  report.push(code + ': OK')
}
console.log(report.join('\n'))

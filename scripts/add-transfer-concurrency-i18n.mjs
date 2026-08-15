#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「设置 - 上传/下载并发数」两个新 key
 *   settings.uploadConcurrency   同时进行的上传数上限
 *   settings.downloadConcurrency 同时进行的下载数上限
 * 用法：node scripts/add-transfer-concurrency-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾（与
 *   fill-missing-i18n.mjs 等既往补丁脚本保持一致）。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.uploadConcurrency', 'settings.downloadConcurrency']

const T = {
  'af-ZA': ['Gelyktydige oplaaie', 'Gelyktydige aflaaie'],
  'bg-BG': ['Едновременни качвания', 'Едновременни изтегляния'],
  'cs-CZ': ['Souběžná nahrávání', 'Souběžná stahování'],
  'da-DK': ['Samtidige uploads', 'Samtidige downloads'],
  'de-DE': ['Gleichzeitige Uploads', 'Gleichzeitige Downloads'],
  'en-GB': ['Concurrent uploads', 'Concurrent downloads'],
  'en-US': ['Concurrent uploads', 'Concurrent downloads'],
  'es-ES': ['Subidas simultáneas', 'Descargas simultáneas'],
  'fr-FR': ['Téléversements simultanés', 'Téléchargements simultanés'],
  'hr-HR': ['Istovremena slanja', 'Istovremena preuzimanja'],
  'id-ID': ['Unggahan simultan', 'Unduhan simultan'],
  'it-IT': ['Caricamenti simultanei', 'Download simultanei'],
  'ja-JP': ['同時アップロード数', '同時ダウンロード数'],
  'ko-KR': ['동시 업로드 수', '동시 다운로드 수'],
  'pl-PL': ['Jednoczesne wysyłania', 'Jednoczesne pobierania'],
  'pt-BR': ['Uploads simultâneos', 'Downloads simultâneos'],
  'pt-PT': ['Envios simultâneos', 'Descarregamentos simultâneos'],
  'ru-RU': ['Одновременные выгрузки', 'Одновременные загрузки'],
  'sr-Latn': ['Istovremena slanja', 'Istovremena preuzimanja'],
  'sv-SE': ['Samtidiga uppladdningar', 'Samtidiga nedladdningar'],
  'tr-TR': ['Eş zamanlı yüklemeler', 'Eş zamanlı indirmeler'],
  'uk-UA': ['Одночасні вивантаження', 'Одночасні завантаження'],
  'zh-CN': ['上传并发数', '下载并发数'],
  'zh-TW': ['上傳並行數', '下載並行數'],
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const pair = T[locale]
  if (!pair) { console.warn('skip unknown locale:', file); continue }

  const fp = path.join(localeDir, file)
  const raw = fs.readFileSync(fp, 'utf8')
  let appended = ''
  KEYS.forEach((key, i) => {
    if (raw.includes(`msgid "${key}"`)) return  // 已存在则跳过（幂等）
    appended += `msgid "${key}"\nmsgstr "${pair[i]}"\n\n`
    totalAdded++
  })
  if (appended) {
    const out = raw.replace(/\s*$/, '\n\n') + appended
    fs.writeFileSync(fp, out, 'utf8')
    console.log('patched:', file)
  }
}
console.log(`Done. added=${totalAdded}`)

/**
 * 为 24 个 locale/*.po 追加属性对话框「文件夹大小按需计算」相关 4 个新 i18n key（幂等：已存在则跳过）
 *   file.sizeCalculate / file.sizeCalculating / file.sizeCalcFailed / file.folderSizeDetail
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-11
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localeDir = path.join(__dirname, '..', 'locale')

const KEYS = {
  'file.sizeCalculate': {
    'zh-CN': '计算',
    'zh-TW': '計算',
    'en-US': 'Calculate',
    'en-GB': 'Calculate',
    'ja-JP': '計算',
    'ko-KR': '계산',
    'de-DE': 'Berechnen',
    'fr-FR': 'Calculer',
    'es-ES': 'Calcular',
    'it-IT': 'Calcola',
    'pt-BR': 'Calcular',
    'pt-PT': 'Calcular',
    'ru-RU': 'Вычислить',
    'uk-UA': 'Обчислити',
    'pl-PL': 'Oblicz',
    'cs-CZ': 'Vypočítat',
    'tr-TR': 'Hesapla',
    'sv-SE': 'Beräkna',
    'da-DK': 'Beregn',
    'bg-BG': 'Изчисли',
    'hr-HR': 'Izračunaj',
    'sr-Latn': 'Izračunaj',
    'id-ID': 'Hitung',
    'af-ZA': 'Bereken',
  },
  'file.sizeCalculating': {
    'zh-CN': '计算中…',
    'zh-TW': '計算中…',
    'en-US': 'Calculating…',
    'en-GB': 'Calculating…',
    'ja-JP': '計算中…',
    'ko-KR': '계산 중…',
    'de-DE': 'Wird berechnet…',
    'fr-FR': 'Calcul en cours…',
    'es-ES': 'Calculando…',
    'it-IT': 'Calcolo in corso…',
    'pt-BR': 'Calculando…',
    'pt-PT': 'A calcular…',
    'ru-RU': 'Вычисление…',
    'uk-UA': 'Обчислення…',
    'pl-PL': 'Obliczanie…',
    'cs-CZ': 'Vypočítávání…',
    'tr-TR': 'Hesaplanıyor…',
    'sv-SE': 'Beräknar…',
    'da-DK': 'Beregner…',
    'bg-BG': 'Изчисляване…',
    'hr-HR': 'Izračunavanje…',
    'sr-Latn': 'Izračunavanje…',
    'id-ID': 'Menghitung…',
    'af-ZA': 'Bereken tans…',
  },
  'file.sizeCalcFailed': {
    'zh-CN': '计算失败',
    'zh-TW': '計算失敗',
    'en-US': 'Calculation failed',
    'en-GB': 'Calculation failed',
    'ja-JP': '計算に失敗しました',
    'ko-KR': '계산 실패',
    'de-DE': 'Berechnung fehlgeschlagen',
    'fr-FR': 'Échec du calcul',
    'es-ES': 'Error de cálculo',
    'it-IT': 'Calcolo non riuscito',
    'pt-BR': 'Falha no cálculo',
    'pt-PT': 'Falha no cálculo',
    'ru-RU': 'Ошибка вычисления',
    'uk-UA': 'Помилка обчислення',
    'pl-PL': 'Obliczanie nie powiodło się',
    'cs-CZ': 'Výpočet se nezdařil',
    'tr-TR': 'Hesaplama başarısız',
    'sv-SE': 'Beräkningen misslyckades',
    'da-DK': 'Beregning mislykkedes',
    'bg-BG': 'Изчислението е неуспешно',
    'hr-HR': 'Izračun nije uspio',
    'sr-Latn': 'Izračunavanje nije uspelo',
    'id-ID': 'Gagal menghitung',
    'af-ZA': 'Berekening het misluk',
  },
  'file.folderSizeDetail': {
    'zh-CN': '{size}（{count} 个文件）',
    'zh-TW': '{size}（{count} 個檔案）',
    'en-US': '{size} ({count} files)',
    'en-GB': '{size} ({count} files)',
    'ja-JP': '{size}（{count} 個のファイル）',
    'ko-KR': '{size} ({count}개 파일)',
    'de-DE': '{size} ({count} Dateien)',
    'fr-FR': '{size} ({count} fichiers)',
    'es-ES': '{size} ({count} archivos)',
    'it-IT': '{size} ({count} file)',
    'pt-BR': '{size} ({count} arquivos)',
    'pt-PT': '{size} ({count} ficheiros)',
    'ru-RU': '{size} ({count} файлов)',
    'uk-UA': '{size} ({count} файлів)',
    'pl-PL': '{size} ({count} plików)',
    'cs-CZ': '{size} ({count} souborů)',
    'tr-TR': '{size} ({count} dosya)',
    'sv-SE': '{size} ({count} filer)',
    'da-DK': '{size} ({count} filer)',
    'bg-BG': '{size} ({count} файла)',
    'hr-HR': '{size} ({count} datoteka)',
    'sr-Latn': '{size} ({count} datoteka)',
    'id-ID': '{size} ({count} file)',
    'af-ZA': '{size} ({count} lêers)',
  },
}

const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.po'))
let touched = 0
for (const file of files) {
  const locale = file.replace('.po', '')
  const full = path.join(localeDir, file)
  let txt = fs.readFileSync(full, 'utf8')
  let added = ''
  for (const [key, trans] of Object.entries(KEYS)) {
    const tr = trans[locale]
    if (!tr) { console.warn(`跳过（无译法）: ${file} ${key}`); continue }
    if (txt.includes(`msgid "${key}"`)) continue // 幂等：已存在跳过
    added += `\nmsgid "${key}"\nmsgstr "${esc(tr)}"\n`
  }
  if (!added) continue
  if (!txt.endsWith('\n')) txt += '\n'
  fs.writeFileSync(full, txt + added, 'utf8')
  touched++
}
console.log(`完成。写入 ${touched} 个文件。`)

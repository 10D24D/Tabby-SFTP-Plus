#!/usr/bin/env node
/**
 * 一次性补丁脚本：为 24 种语言追加「重置统计 + 联动路径缺失提示」所需 key
 *   settings.bookmarkResetUsage      重置统计（按钮）
 *   settings.bookmarkResetUsageDone  重置完成提示（{count} 条）
 *   bookmark.linkMissing             联动路径不存在，已跳过另一栏跳转
 * 用法：node scripts/add-bookmark-reset-usage-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.bookmarkResetUsage', 'settings.bookmarkResetUsageDone', 'bookmark.linkMissing']

const T = {
  'settings.bookmarkResetUsage': {
    'af-ZA': 'Herstel statistieke', 'bg-BG': 'Нулиране на статистиката', 'cs-CZ': 'Obnovit statistiky',
    'da-DK': 'Nulstil statistik', 'de-DE': 'Statistik zurücksetzen', 'en-GB': 'Reset statistics',
    'en-US': 'Reset statistics', 'es-ES': 'Restablecer estadísticas', 'fr-FR': 'Réinitialiser les statistiques',
    'hr-HR': 'Poništi statistiku', 'id-ID': 'Atur ulang statistik', 'it-IT': 'Reimposta statistiche',
    'ja-JP': '統計をリセット', 'ko-KR': '통계 초기화', 'pl-PL': 'Wyzeruj statystyki',
    'pt-BR': 'Redefinir estatísticas', 'pt-PT': 'Repor estatísticas', 'ru-RU': 'Сбросить статистику',
    'sr-Latn': 'Poništi statistiku', 'sv-SE': 'Återställ statistik', 'tr-TR': 'İstatistikleri sıfırla',
    'uk-UA': 'Скинути статистику', 'zh-CN': '重置统计', 'zh-TW': '重置統計',
  },
  'settings.bookmarkResetUsageDone': {
    'af-ZA': 'Statistieke van {count} boekmerke is herstel', 'bg-BG': 'Статистиката на {count} отметки е нулирана',
    'cs-CZ': 'Statistiky {count} záložek byly obnoveny', 'da-DK': 'Statistik for {count} bogmærker er nulstillet',
    'de-DE': 'Statistik von {count} Lesezeichen zurückgesetzt', 'en-GB': 'Statistics of {count} bookmarks reset',
    'en-US': 'Statistics of {count} bookmarks reset', 'es-ES': 'Estadísticas de {count} marcadores restablecidas',
    'fr-FR': 'Statistiques de {count} signets réinitialisées', 'hr-HR': 'Statistika {count} oznaka poništena',
    'id-ID': 'Statistik {count} markah diatur ulang', 'it-IT': 'Statistiche di {count} segnalibri reimpostate',
    'ja-JP': '{count} 件のブックマークの統計をリセットしました', 'ko-KR': '북마크 {count}개의 통계를 초기화했습니다',
    'pl-PL': 'Wyzerowano statystyki {count} zakładek', 'pt-BR': 'Estatísticas de {count} favoritos redefinidas',
    'pt-PT': 'Estatísticas de {count} favoritos repostas', 'ru-RU': 'Статистика {count} закладок сброшена',
    'sr-Latn': 'Statistika {count} oznaka poništena', 'sv-SE': 'Statistik för {count} bokmärken återställd',
    'tr-TR': '{count} yer imi istatistiği sıfırlandı', 'uk-UA': 'Статистику {count} закладок скинуто',
    'zh-CN': '已重置 {count} 条书签的使用次数', 'zh-TW': '已重置 {count} 條書籤的使用次數',
  },
  'bookmark.linkMissing': {
    'af-ZA': 'Gekoppelde pad bestaan nie; die ander paneel is nie verskuif nie',
    'bg-BG': 'Свързаният път не съществува; другият панел не е преместен',
    'cs-CZ': 'Propojená cesta neexistuje; druhý panel nebyl přesunut',
    'da-DK': 'Den knyttede sti findes ikke; det andet panel blev ikke flyttet',
    'de-DE': 'Verknüpfter Pfad existiert nicht; der andere Bereich wurde nicht verschoben',
    'en-GB': 'Linked path does not exist; the other pane was not moved',
    'en-US': 'Linked path does not exist; the other pane was not moved',
    'es-ES': 'La ruta vinculada no existe; el otro panel no se movió',
    'fr-FR': 'Le chemin lié n existe pas; l autre panneau n a pas été déplacé',
    'hr-HR': 'Povezana putanja ne postoji; drugi panel nije pomaknut',
    'id-ID': 'Jalur tertaut tidak ada; panel lain tidak dipindahkan',
    'it-IT': 'Il percorso collegato non esiste; l altro pannello non è stato spostato',
    'ja-JP': '連動パスが存在しないため、反対側のペインは移動していません',
    'ko-KR': '연동 경로가 없어 반대쪽 창을 이동하지 않았습니다',
    'pl-PL': 'Powiązana ścieżka nie istnieje; drugi panel nie został przeniesiony',
    'pt-BR': 'O caminho vinculado não existe; o outro painel não foi movido',
    'pt-PT': 'O caminho ligado não existe; o outro painel não foi movido',
    'ru-RU': 'Связанный путь не существует; вторая панель не перемещена',
    'sr-Latn': 'Povezana putanja ne postoji; drugi panel nije pomeren',
    'sv-SE': 'Den länkade sökvägen finns inte; andra panelen flyttades inte',
    'tr-TR': 'Bağlantılı yol yok; diğer bölme taşınmadı',
    'uk-UA': 'Повязаний шлях не існує; іншу панель не переміщено',
    'zh-CN': '联动路径不存在，已跳过另一栏跳转',
    'zh-TW': '聯動路徑不存在，已跳過另一欄跳轉',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  let added = 0
  for (const key of KEYS) {
    const text = T[key][locale]
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) { fs.writeFileSync(fp, raw, 'utf8'); totalAdded += added }
}
console.log(`Done. totalAdded=${totalAdded}`)

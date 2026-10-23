#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「面板透明度」所需 key
 *   settings.panelOpacity      面板透明度（设置项标题）
 *   settings.panelOpacityHint  说明（tooltip）：最低 50%，不可全透明
 * 用法：node scripts/add-panel-opacity-i18n.mjs
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = ['settings.panelOpacity', 'settings.panelOpacityHint']

const T = {
  'settings.panelOpacity': {
    'af-ZA': 'Paneel-deursigtigheid',
    'bg-BG': 'Прозрачност на панела',
    'cs-CZ': 'Průhlednost panelu',
    'da-DK': 'Panelgennemsigtighed',
    'de-DE': 'Panel-Transparenz',
    'en-GB': 'Panel opacity',
    'en-US': 'Panel opacity',
    'es-ES': 'Opacidad del panel',
    'fr-FR': 'Opacité du panneau',
    'hr-HR': 'Prozirnost panela',
    'id-ID': 'Opasitas panel',
    'it-IT': 'Opacità del pannello',
    'ja-JP': 'パネルの透明度',
    'ko-KR': '패널 불투명도',
    'pl-PL': 'Krycie panelu',
    'pt-BR': 'Opacidade do painel',
    'pt-PT': 'Opacidade do painel',
    'ru-RU': 'Непрозрачность панели',
    'sr-Latn': 'Prozirnost panela',
    'sv-SE': 'Panelens opacitet',
    'tr-TR': 'Panel opaklığı',
    'uk-UA': 'Непрозорість панелі',
    'zh-CN': '面板透明度',
    'zh-TW': '面板透明度',
  },
  'settings.panelOpacityHint': {
    'af-ZA': 'Pas die algehele deursigtigheid van die paneel aan. Minimum 50 persent, heeltemal deursigtig is nie toegelaat nie',
    'bg-BG': 'Настройте общата прозрачност на панела. Минимум 50 процента, напълно прозрачно не е разрешено',
    'cs-CZ': 'Nastavte celkovou průhlednost panelu. Minimum je 50 procent, plně průhledné není povoleno',
    'da-DK': 'Justér panelens samlede gennemsigtighed. Minimum 50 procent, helt gennemsigtig er ikke tilladt',
    'de-DE': 'Gesamttransparenz des Panels einstellen. Minimum 50 Prozent, vollständig transparent ist nicht erlaubt',
    'en-GB': 'Adjust the overall panel opacity. Minimum 50 percent, fully transparent is not allowed',
    'en-US': 'Adjust the overall panel opacity. Minimum 50 percent, fully transparent is not allowed',
    'es-ES': 'Ajusta la opacidad general del panel. Mínimo 50 por ciento, no se permite totalmente transparente',
    'fr-FR': 'Ajustez l opacité globale du panneau. Minimum 50 pour cent, la transparence totale n est pas autorisée',
    'hr-HR': 'Prilagodite ukupnu prozirnost panela. Najmanje 50 posto, potpuno prozirno nije dopušteno',
    'id-ID': 'Sesuaikan opasitas keseluruhan panel. Minimal 50 persen, sepenuhnya transparan tidak diizinkan',
    'it-IT': 'Regola l opacità complessiva del pannello. Minimo 50 per cento, la trasparenza totale non è consentita',
    'ja-JP': 'パネル全体の透明度を調整します。最小 50 パーセントで、完全な透明にはできません',
    'ko-KR': '패널 전체 불투명도를 조정합니다. 최소 50 퍼센트이며 완전 투명은 허용되지 않습니다',
    'pl-PL': 'Dostosuj ogólne krycie panelu. Minimum 50 procent, pełna przezroczystość jest niedozwolona',
    'pt-BR': 'Ajuste a opacidade geral do painel. Mínimo de 50 por cento, totalmente transparente não é permitido',
    'pt-PT': 'Ajuste a opacidade geral do painel. Mínimo de 50 por cento, totalmente transparente não é permitido',
    'ru-RU': 'Настройте общую непрозрачность панели. Минимум 50 процентов, полностью прозрачная панель запрещена',
    'sr-Latn': 'Prilagodite ukupnu prozirnost panela. Najmanje 50 posto, potpuno prozirno nije dozvoljeno',
    'sv-SE': 'Justera panelens totala opacitet. Minst 50 procent, helt genomskinlig tillåts inte',
    'tr-TR': 'Panelin genel opaklığını ayarlayın. En az 50 yüzde, tamamen saydam olamaz',
    'uk-UA': 'Налаштуйте загальну непрозорість панелі. Мінімум 50 відсотків, повністю прозора панель заборонена',
    'zh-CN': '调整面板整体透明度；最低 50%，不允许全透明',
    'zh-TW': '調整面板整體透明度；最低 50%，不允許全透明',
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
    if (text.includes('"')) { console.error('FATAL: double quote in translation:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)

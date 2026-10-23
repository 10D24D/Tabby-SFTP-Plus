/**
 * i18n 按需加载模块
 * 功能描述：将 24 种语言的翻译从「编译时全部内联」改为「首次使用时按需解析」，
 *   减少初始化开销和内存占用。
 * @创建人：Qoder (AI Assistant)
 * @创建时间：2026-10-20
 */

/** 支持的 Locale 列表 */
export type Locale = 'af-ZA' | 'bg-BG' | 'cs-CZ' | 'da-DK' | 'de-DE' | 'en-GB' | 'en-US' | 'es-ES' | 'fr-FR' | 'hr-HR' | 'id-ID' | 'it-IT' | 'ja-JP' | 'ko-KR' | 'pl-PL' | 'pt-BR' | 'pt-PT' | 'ru-RU' | 'sr-Latn' | 'sv-SE' | 'tr-TR' | 'uk-UA' | 'zh-CN' | 'zh-TW'

/** 翻译缓存：已解析的语言 */  
const translationCache = new Map<Locale, Record<string, string>>()

/** 解析 .po 内容（从 sftp-i18n.service.ts 提取） */
function unescapePo(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
}

function parsePo(content: string): Record<string, string> {
  const translations: Record<string, string> = {}
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let currentKey = ''
  let currentValue = ''
  let inMsgid = false
  let inMsgstr = false

  for (const line of lines) {
    if (line.startsWith('msgid ')) {
      if (currentKey && currentValue) {
        translations[unescapePo(currentKey)] = unescapePo(currentValue)
      }
      currentKey = line.slice(7, -1)
      currentValue = ''
      inMsgid = true
      inMsgstr = false
    } else if (line.startsWith('msgstr ')) {
      currentValue = line.slice(8, -1)
      inMsgid = false
      inMsgstr = true
    } else if (inMsgid && line.startsWith('"') && line.endsWith('"')) {
      currentKey += line.slice(1, -1)
    } else if (inMsgstr && line.startsWith('"') && line.endsWith('"')) {
      currentValue += line.slice(1, -1)
    } else {
      inMsgid = false
      inMsgstr = false
    }
  }

  if (currentKey && currentValue) {
    translations[unescapePo(currentKey)] = unescapePo(currentValue)
  }

  return translations
}

/** 语言 po 文件映射（构建时由 webpack asset/source 内联） */
const PO_FILES: Record<Locale, () => string> = {
  'af-ZA': () => require('../../locale/af-ZA.po'),
  'bg-BG': () => require('../../locale/bg-BG.po'),
  'cs-CZ': () => require('../../locale/cs-CZ.po'),
  'da-DK': () => require('../../locale/da-DK.po'),
  'de-DE': () => require('../../locale/de-DE.po'),
  'en-GB': () => require('../../locale/en-GB.po'),
  'en-US': () => require('../../locale/en-US.po'),
  'es-ES': () => require('../../locale/es-ES.po'),
  'fr-FR': () => require('../../locale/fr-FR.po'),
  'hr-HR': () => require('../../locale/hr-HR.po'),
  'id-ID': () => require('../../locale/id-ID.po'),
  'it-IT': () => require('../../locale/it-IT.po'),
  'ja-JP': () => require('../../locale/ja-JP.po'),
  'ko-KR': () => require('../../locale/ko-KR.po'),
  'pl-PL': () => require('../../locale/pl-PL.po'),
  'pt-BR': () => require('../../locale/pt-BR.po'),
  'pt-PT': () => require('../../locale/pt-PT.po'),
  'ru-RU': () => require('../../locale/ru-RU.po'),
  'sr-Latn': () => require('../../locale/sr-Latn.po'),
  'sv-SE': () => require('../../locale/sv-SE.po'),
  'tr-TR': () => require('../../locale/tr-TR.po'),
  'uk-UA': () => require('../../locale/uk-UA.po'),
  'zh-CN': () => require('../../locale/zh-CN.po'),
  'zh-TW': () => require('../../locale/zh-TW.po'),
}

/** 按需加载指定语言的翻译（首次访问时解析并缓存） */
export function loadLocaleTranslations(locale: Locale): Record<string, string> {
  if (translationCache.has(locale)) {
    return translationCache.get(locale)!
  }
  
  try {
    const raw = PO_FILES[locale]()
    const parsed = parsePo(raw)
    translationCache.set(locale, parsed)
    return parsed
  } catch {
    // 回退到 en-US
    if (locale !== 'en-US') {
      return loadLocaleTranslations('en-US')
    }
    return {}
  }
}

/** 预加载默认语言（在初始化时调用，避免首次翻译时的延迟） */
export function preloadDefaultLocale(locale: Locale): void {
  if (!translationCache.has(locale)) {
    loadLocaleTranslations(locale)
  }
}

/** 清除缓存（用于测试或内存紧张时） */
export function clearTranslationCache(): void {
  translationCache.clear()
}

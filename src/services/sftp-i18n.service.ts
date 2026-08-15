/**
 * 国际化（i18n）服务
 * 功能描述：提供多语言支持，自动跟随 Tabby 系统语言设置
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-21
 *   新增 zh-TW 繁体中文翻译；Locale 类型/词典/语言检测按语言代码排序
 *   重构：从硬编码 TRANSLATIONS 改为加载 .po 文件
 *   新增 setLocale() 方法支持动态切换语言
 *   新增 settings.* 翻译 key（统一设置面板 i18n）
 */
import { Injectable, Optional } from '@angular/core'
import { detectTabbyLanguage } from '@common/utils'

export type Locale = 'af-ZA' | 'bg-BG' | 'cs-CZ' | 'da-DK' | 'de-DE' | 'en-GB' | 'en-US' | 'es-ES' | 'fr-FR' | 'hr-HR' | 'id-ID' | 'it-IT' | 'ja-JP' | 'ko-KR' | 'pl-PL' | 'pt-BR' | 'pt-PT' | 'ru-RU' | 'sr-Latn' | 'sv-SE' | 'tr-TR' | 'uk-UA' | 'zh-CN' | 'zh-TW'

// 通过 webpack asset/source 内联 .po 文件内容
const zhCNPo = require('../../locale/zh-CN.po')
const enUSPo = require('../../locale/en-US.po')
const enGBPo = require('../../locale/en-GB.po')
const jaJPPo = require('../../locale/ja-JP.po')
const koKRPo = require('../../locale/ko-KR.po')
const frFRPo = require('../../locale/fr-FR.po')
const deDEPo = require('../../locale/de-DE.po')
const esESPo = require('../../locale/es-ES.po')
const ptBRPo = require('../../locale/pt-BR.po')
const ptPTPo = require('../../locale/pt-PT.po')
const ruRUPo = require('../../locale/ru-RU.po')
const itITPo = require('../../locale/it-IT.po')
const idIDPo = require('../../locale/id-ID.po')
const csCZPo = require('../../locale/cs-CZ.po')
const daDKPo = require('../../locale/da-DK.po')
const hrHRPo = require('../../locale/hr-HR.po')
const plPLPo = require('../../locale/pl-PL.po')
const svSEPo = require('../../locale/sv-SE.po')
const trTRPo = require('../../locale/tr-TR.po')
const bgBGPo = require('../../locale/bg-BG.po')
const srLatnPo = require('../../locale/sr-Latn.po')
const ukUAPo = require('../../locale/uk-UA.po')
const afZAPo = require('../../locale/af-ZA.po')
const zhTWPo = require('../../locale/zh-TW.po')

/**
 * ★ 2026-08-10 修复 #17：反转义 po 字符串（\" \\ \n \t 等）。
 * 此前不反转义，含 \" 的译文会多出反斜杠甚至截断显示。
 * 单次遍历处理，避免替换顺序导致 \\n 被误解为换行。
 */
function unescapePo(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
}

/**
 * 解析 GNU gettext .po 文件内容为 key-value 映射
 */
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
      currentKey = line.slice(7, -1) // remove msgid "..."
      currentValue = ''
      inMsgid = true
      inMsgstr = false
    } else if (line.startsWith('msgstr ')) {
      currentValue = line.slice(8, -1) // remove msgstr "..."
      inMsgid = false
      inMsgstr = true
    } else if (inMsgid && line.startsWith('"') && line.endsWith('"')) {
      // 多行 msgid 拼接
      currentKey += line.slice(1, -1)
    } else if (inMsgstr && line.startsWith('"') && line.endsWith('"')) {
      // 多行 msgstr 拼接
      currentValue += line.slice(1, -1)
    } else {
      inMsgid = false
      inMsgstr = false
    }
  }

  // 最后一条
  if (currentKey && currentValue) {
    translations[unescapePo(currentKey)] = unescapePo(currentValue)
  }

  return translations
}

const PO_TRANSLATIONS: Record<Locale, Record<string, string>> = {
  'af-ZA': parsePo(afZAPo),
  'bg-BG': parsePo(bgBGPo),
  'cs-CZ': parsePo(csCZPo),
  'da-DK': parsePo(daDKPo),
  'de-DE': parsePo(deDEPo),
  'en-GB': parsePo(enGBPo),
  'en-US': parsePo(enUSPo),
  'es-ES': parsePo(esESPo),
  'fr-FR': parsePo(frFRPo),
  'hr-HR': parsePo(hrHRPo),
  'id-ID': parsePo(idIDPo),
  'it-IT': parsePo(itITPo),
  'ja-JP': parsePo(jaJPPo),
  'ko-KR': parsePo(koKRPo),
  'pl-PL': parsePo(plPLPo),
  'pt-BR': parsePo(ptBRPo),
  'pt-PT': parsePo(ptPTPo),
  'ru-RU': parsePo(ruRUPo),
  'sr-Latn': parsePo(srLatnPo),
  'sv-SE': parsePo(svSEPo),
  'tr-TR': parsePo(trTRPo),
  'uk-UA': parsePo(ukUAPo),
  'zh-CN': parsePo(zhCNPo),
  'zh-TW': parsePo(zhTWPo),
}

/**
 * 根据语言字符串检测对应的 Locale
 */
function detectLocaleFromString(lang: string): Locale | null {
  const langLower = lang.toLowerCase()
  const localeMap: Record<string, Locale> = {
    'zh': 'zh-CN', 'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', 'zh-hk': 'zh-TW',
    'en': 'en-US', 'en-us': 'en-US', 'en-gb': 'en-GB',
    'ja': 'ja-JP', 'ja-jp': 'ja-JP',
    'ko': 'ko-KR', 'ko-kr': 'ko-KR',
    'fr': 'fr-FR', 'fr-fr': 'fr-FR',
    'de': 'de-DE', 'de-de': 'de-DE',
    'es': 'es-ES', 'es-es': 'es-ES',
    'pt': 'pt-BR', 'pt-br': 'pt-BR', 'pt-pt': 'pt-PT',
    'ru': 'ru-RU', 'ru-ru': 'ru-RU',
    'it': 'it-IT', 'it-it': 'it-IT',
    'id': 'id-ID', 'id-id': 'id-ID',
    'cs': 'cs-CZ', 'cs-cz': 'cs-CZ',
    'da': 'da-DK', 'da-dk': 'da-DK',
    'hr': 'hr-HR', 'hr-hr': 'hr-HR',
    'pl': 'pl-PL', 'pl-pl': 'pl-PL',
    'sv': 'sv-SE', 'sv-se': 'sv-SE',
    'tr': 'tr-TR', 'tr-tr': 'tr-TR',
    'bg': 'bg-BG', 'bg-bg': 'bg-BG',
    'sr': 'sr-Latn', 'sr-latn': 'sr-Latn',
    'uk': 'uk-UA', 'uk-ua': 'uk-UA',
    'af': 'af-ZA', 'af-za': 'af-ZA',
  }
  return localeMap[langLower] || null
}

@Injectable()
export class SftpI18nService {
  private locale: Locale = 'en-US'

  constructor(@Optional() configService?: any) {
    // 策略0: SFTP+ 设置页手动选择的语言（最高优先级）
    // 优先从 Tabby 配置读取
    let sftpLocale: Locale | null = null
    try {
      const cfg = configService?.store?.['tabby-sftp-plus']
      if (cfg?.lang) {
        sftpLocale = detectLocaleFromString(cfg.lang) as Locale
      }
    } catch {}
    // 回退：从 localStorage 读取（旧版兼容）
    if (!sftpLocale) {
      try {
        const raw = localStorage.getItem('sftp-plus-locale')
        if (raw) sftpLocale = detectLocaleFromString(raw) as Locale
      } catch {}
    }
    if (sftpLocale) { this.locale = sftpLocale; return }

    // 策略1: 直接读取 Tabby config.yaml 文件
    const tabbyLang = detectTabbyLanguage()
    if (tabbyLang) { this.locale = tabbyLang as Locale; return }

    // 策略2: Tabby ConfigService（仅 Angular DI 场景）
    if (configService) {
      try {
        const cfg = configService.get()
        const lang = cfg?.appearance?.language ?? cfg?.language ?? ''
        if (lang) {
          const detected = detectLocaleFromString(String(lang))
          if (detected) { this.locale = detected; return }
        }
      } catch {}
    }

    // 策略2: document.documentElement.lang（Tabby 可能设置此属性）
    try {
      const dl = document.documentElement?.lang || ''
      if (dl) {
        const detected = detectLocaleFromString(dl)
        if (detected) { this.locale = detected; return }
      }
    } catch {}

    // 策略3: Tabby localStorage（多种可能的 key）
    try {
      const keys = ['locale', 'language', 'tabby-language', 'tabby-locale',
        'config', 'tabby-config', 'settings', 'tabby-settings']
      for (const key of keys) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        // 尝试直接匹配语言值
        const detected = detectLocaleFromString(raw)
        if (detected) { this.locale = detected; return }
        // 尝试解析 JSON 对象（Tabby config 通常存储为 JSON）
        try {
          const obj = JSON.parse(raw)
          if (typeof obj !== 'object' || obj === null) continue
          const lang = obj?.appearance?.language
            || obj?.appearance?.locale
            || obj?.language
            || obj?.locale
            || obj?.app?.language
            || obj?.general?.language
          if (lang) {
            const detected = detectLocaleFromString(String(lang))
            if (detected) { this.locale = detected; return }
          }
        } catch { /* 不是 JSON，忽略 */ }
      }
    } catch {}

    // 策略4: Electron process.env 环境变量（覆盖 navigator，避免 OS 中文覆盖 Tabby 英文）
    try {
      if (typeof process !== 'undefined' && process.env) {
        const lc = process.env.LC_ALL || process.env.LANG || process.env.LANGUAGE || ''
        const detected = detectLocaleFromString(lc)
        if (detected) { this.locale = detected; return }
      }
    } catch {}

    // 策略5: navigator.languages 数组（Electron 中更多语言选项）
    try {
      const langs = navigator.languages || [navigator.language]
      for (const l of langs) {
        const detected = detectLocaleFromString(l)
        if (detected) { this.locale = detected; return }
      }
    } catch {}

    // 策略6: navigator.language 单值
    try {
      const navLang = navigator.language || ''
      if (navLang) {
        const detected = detectLocaleFromString(navLang)
        if (detected) { this.locale = detected; return }
      }
    } catch {}

    // 最终回退：英文（默认）
    this.locale = 'en-US'
  }

  getLocale(): Locale {
    return this.locale
  }

  /** 动态切换语言（支持设置面板内实时切换） */
  setLocale(locale: Locale): void {
    this.locale = locale
  }

  t(key: string, params?: Record<string, string | number>): string {
    let text = PO_TRANSLATIONS[this.locale][key]
    // ★ 2026-07-25：未翻译 key 的 msgstr 可能是空串 ''，必须一并回退英文（原仅判 undefined 会显示空白）
    if (text === undefined || text === '') {
      // 回退到英文
      text = PO_TRANSLATIONS['en-US'][key] ?? key
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.split(`{${k}}`).join(String(v))
      }
    }
    return text
  }
}

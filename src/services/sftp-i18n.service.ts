/**
 * 国际化（i18n）服务
 * 功能描述：提供多语言支持，自动跟随 Tabby 系统语言设置
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * @修改人：DD1024z + Step-5-Preview
 * @修改时间：2026-10-19 — P2-27 修复：新增 _readRawLanguageFromConfigYaml()，在 store 读取失败
 *              回退读 config.yaml 时自取**原始** language 值按本服务的映射解析（zh-tw/zh-hk⇒zh-TW），
 *              不再直接采信 @common/utils 的 detectTabbyLanguage()（它把繁体一并映射成 zh-CN，
 *              导致繁体用户拿到简体译文）；共享模块为同步产物，本次不在其上改动。
 *   2026-07-21
 *   新增 zh-TW 繁体中文翻译；Locale 类型/词典/语言检测按语言代码排序
 *   重构：从硬编码 TRANSLATIONS 改为加载 .po 文件
 *   新增 setLocale() 方法支持动态切换语言
 *   新增 settings.* 翻译 key（统一设置面板 i18n）
 */
import { Injectable, Optional } from '@angular/core'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
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

  /**
   * ★ 2026-10-09 新增：从宿主 ConfigService 的**内存 store** 读取界面语言。
   *
   * 为什么必须读 store 而不是调 configService.get()：
   *   宿主 ConfigService 没有 get() 方法（那是 lodash 风格 API），调它恒抛 TypeError。
   *   语言的真实位置是 store.appearance.language —— appearance 在 CoreConfigProvider
   *   的 defaults 里是**结构成员**（对象），经 ConfigProxy 包装后依然可正常读取。
   *
   * 多位置兼容（宿主不同版本 / 用户自定义 config.yaml 的字段位置可能不同）：
   *   appearance.language → language → appearance.locale → locale
   * 逐个尝试，任一命中且能被 detectLocaleFromString 识别即返回；全不中返回 null
   * （交由后续兜底策略处理，绝不猜一个默认值出来）。
   */
  private _readLanguageFromConfigService(configService: any): Locale | null {
    if (!configService) return null
    try {
      // 必须整体放在 try 内：store 是 ConfigProxy，任意子字段读取都可能抛（未就绪等）
      const store = configService.store
      if (!store) return null
      const appearance = store.appearance
      const candidates = [
        appearance?.language,
        store.language,
        appearance?.locale,
        store.locale,
      ]
      for (const raw of candidates) {
        if (!raw) continue
        const detected = detectLocaleFromString(String(raw))
        if (detected) return detected
      }
      return null
    } catch {
      // store 未就绪 / 结构成员 getter 抛错 —— 属正常情况，交后续兜底
      return null
    }
  }

  /**
   * 直接读取 Tabby config.yaml 里 `language:` 的**原始**值，由本服务自己的映射解析。
   *
   * ★ 2026-10-19 P2-27 修复（双轨分歧）：@common/utils 的 detectTabbyLanguage() 内部
   *   LOCALE_MAP 把 'zh-tw' / 'zh-hk' 一并映射成 'zh-CN'（tabby-plugin-common/src/utils.ts:31），
   *   而本服务的 detectLocaleFromString 是 zh-tw/zh-hk → 'zh-TW'。两处映射不一致的后果：
   *   首选策略 `_readLanguageFromConfigService` 读 store 失败时（ConfigProxy 结构成员 getter
   *   抛错 / 首帧未就绪），回退到 detectTabbyLanguage() ⇒ 繁体用户拿到**简体**译文。
   *   该映射表是多个插件共享的同步产物（sync-common.sh 单向覆盖），本次不改动它，
   *   改为在 SFTP+ 侧自取原值、按本文件的正确映射解析；读取失败返回 null 交后续兜底。
   *   （根治建议：把 utils.ts:31 的 'zh-tw'/'zh-hk' 改成 'zh-TW' 并重新同步。）
   */
  private _readRawLanguageFromConfigYaml(): Locale | null {
    try {
      const home = os.homedir()
      const dir = os.platform() === 'win32'
        ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'tabby')
        : os.platform() === 'darwin'
          ? path.join(home, 'Library', 'Application Support', 'tabby')
          : path.join(home, '.config', 'tabby')
      const raw = fs.readFileSync(path.join(dir, 'config.yaml'), 'utf-8')
      // 与 @common/utils 同一形式的匹配式：行首无缩进的 `language: xx-XX`（支持引号）
      const match = raw.match(/^language\s*:\s*['"]?([a-zA-Z-]+)['"]?\s*$/m)
      return match ? detectLocaleFromString(match[1]) : null
    } catch {
      return null
    }
  }

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

    // ★ 2026-10-09 审计根治（策略顺序 + 一个真 bug）：
    //
    // 【实测澄清】上一轮报告称「策略1 的正则匹配不到缩进在 appearance: 下的 language」——
    //   经读本机真实 config.yaml 确认**该结论错误**：`language: zh-CN` 是与 appearance: 平级的
    //   **顶层键、位于行首、无缩进**，插件正则实测匹配成功。策略1 本身是好的，
    //   用户之所以「测不出跟随 Tabby 语言有没有问题」，是因为他的 Tabby 语言与系统语言同为中文，
    //   后续所有兜底（documentElement.lang / localStorage / navigator）都落到中文 —— 结果一致，
    //   差异被掩盖。只有当「Tabby 语言 ≠ 系统语言」时问题才会暴露。
    //
    // 【真正的 bug】原「策略2」调 `configService.get()` —— 宿主 ConfigService **没有这个方法**
    //   （真实成员只有 store / ready$ / changed$ / mergeDefaults / getDefaults / load / save /
    //     readRaw / writeRaw / requestRestart / enabledServices），故该行恒抛
    //   `TypeError: configService.get is not a function` 并被空 catch 吞掉。
    //   而插件**从不读取语言真正所在的位置** `store.appearance.language`。
    //
    // 【根治】把「读 ConfigService 内存 store」提到**策略1 之前**作为新的最高优先级兜底：
    //   · store 是宿主已解析好的内存对象，无需解析 YAML、不依赖文件路径/权限/时序，
    //     比策略1 的同步读文件更可靠（渲染进程首帧时 config.yaml 可能尚未落盘完成）；
    //   · 直读 store.appearance.language（宿主真实字段，CoreConfigProvider 里 appearance 是结构成员），
    //     不再调用不存在的 get()；
    //   · 保留策略1（读文件）作为 store 不可用（如未注入 ConfigService）时的下一道兜底。
    const storeLang = this._readLanguageFromConfigService(configService)
    if (storeLang) { this.locale = storeLang; return }

    // 策略1: 直接读取 Tabby config.yaml 文件（store 不可用时的兜底）
    // ★ 2026-10-19 P2-27：先自取 config.yaml 里的**原始** language 值（见方法注释），
    //   取到就按本服务的 zh-tw/zh-hk → zh-TW 映射解析；取不到再退回共享模块的
    //   detectTabbyLanguage()（其繁体映射会退化成简体，仅作最后一道兜底）。
    const rawCfgLang = this._readRawLanguageFromConfigYaml()
    if (rawCfgLang) { this.locale = rawCfgLang; return }

    const tabbyLang = detectTabbyLanguage()
    if (tabbyLang) { this.locale = tabbyLang as Locale; return }

    // 策略1b: document.documentElement.lang（宿主可能在此属性上暴露界面语言）
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

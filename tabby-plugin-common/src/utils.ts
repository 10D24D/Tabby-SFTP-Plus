/**
 * 共享工具函数
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-28
 */
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/** 检测字符串是否为类中文 */
export function isLocaleZh(lang: string): boolean {
  return /^zh/i.test(lang)
}

/**
 * Tabby 配置文件目录（跨平台）
 */
function getTabbyConfigDir(): string {
  const home = os.homedir()
  switch (os.platform()) {
    case 'win32': return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'tabby')
    case 'darwin': return path.join(home, 'Library', 'Application Support', 'tabby')
    default: return path.join(home, '.config', 'tabby')
  }
}

/**
 * 语言检测映射表
 */
const LOCALE_MAP: Record<string, string> = {
  'zh': 'zh-CN', 'zh-cn': 'zh-CN', 'zh-tw': 'zh-CN', 'zh-hk': 'zh-CN',
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

function detectLocale(lang: string): string | null {
  return LOCALE_MAP[lang.toLowerCase()] || null
}

/**
 * 从 Tabby config.yaml 读取语言设置
 * 返回对应的 Locale 或 ''（读取失败时返回空字符串）
 */
export function detectTabbyLanguage(): string {
  try {
    const configPath = path.join(getTabbyConfigDir(), 'config.yaml')
    const raw = fs.readFileSync(configPath, 'utf-8')
    // 匹配 language: en-US 或 language: zh-CN（支持引号）
    const match = raw.match(/^language\s*:\s*['"]?([a-zA-Z-]+)['"]?\s*$/m)
    if (match) {
      const lang = match[1]
      const detected = detectLocale(lang)
      if (detected) return detected
    }
  } catch {}
  return ''
}

/**
 * 检测 Tabby 实际使用的系统语言
 * 返回对应的 Locale，默认 'en-US'
 */
export function detectSystemLocale(): string {
  // 策略1: Tabby config.yaml（直接读取配置文件，最准确）
  const tabbyLang = detectTabbyLanguage()
  if (tabbyLang) return tabbyLang

  // 策略2: document.documentElement.lang
  try {
    const dl = document.documentElement?.lang || ''
    if (dl) {
      const detected = detectLocale(dl)
      if (detected) return detected
    }
  } catch {}

  // 策略3: Tabby localStorage
  try {
    const keys = ['locale', 'language', 'tabby-language', 'tabby-locale',
      'config', 'tabby-config', 'settings', 'tabby-settings', 'tabby-config.json']
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const detected = detectLocale(raw)
      if (detected) return detected
      try {
        const obj = JSON.parse(raw)
        const lang = obj?.appearance?.language || obj?.appearance?.locale
          || obj?.language || obj?.locale || obj?.app?.language || obj?.general?.language
        if (lang) {
          const d = detectLocale(String(lang))
          if (d) return d
        }
      } catch {}
    }
  } catch {}

  // 策略4: navigator.languages 数组
  try {
    const langs = navigator.languages || [navigator.language]
    for (const l of langs) {
      const detected = detectLocale(l)
      if (detected) return detected
    }
  } catch {}

  // 策略5: navigator.language 单值
  try {
    const navLang = navigator.language || ''
    if (navLang) {
      const detected = detectLocale(navLang)
      if (detected) return detected
    }
  } catch {}

  return 'en-US'
}

/**
 * 从 Tabby config.yaml 读取界面明暗模式
 * 返回 'light' | 'dark' | ''（读取失败时返回空字符串）
 */
export function detectTabbyThemeMode(): 'light' | 'dark' | '' {
  try {
    const configPath = path.join(getTabbyConfigDir(), 'config.yaml')
    const raw = fs.readFileSync(configPath, 'utf-8')
    const match = raw.match(/^appearance:\s*\n\s+colorSchemeMode:\s*['"]?(\w+)['"]?\s*$/m)
    if (match) {
      const mode = match[1].toLowerCase()
      if (mode === 'dark') return 'dark'
      if (mode === 'light') return 'light'
    }
    // 备选：直接匹配 colorSchemeMode
    const m2 = raw.match(/colorSchemeMode\s*:\s*['"]?(\w+)['"]?\s*$/)
    if (m2) {
      const mode = m2[1].toLowerCase()
      if (mode === 'dark') return 'dark'
      if (mode === 'light') return 'light'
    }
  } catch {}
  return ''
}

/**
 * 检测 Tabby 当前主题是亮色还是暗色
 * 优先从配置文件读取，失败时回退到 CSS 变量检测
 */
export function detectTabbyTheme(): 'light' | 'dark' {
  // 策略1: 直接读取 config.yaml
  const cfg = detectTabbyThemeMode()
  if (cfg) return cfg

  // 策略2: 依据 --body-bg CSS 变量
  let bodyBg = '#1e1e2e'
  try {
    const computedStyle = getComputedStyle(document.documentElement)
    const cssBg = computedStyle.getPropertyValue('--body-bg').trim()
    if (cssBg && cssBg !== '') {
      bodyBg = cssBg
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
    }
  } catch {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    bodyBg = prefersDark ? '#1e1e2e' : '#ffffff'
  }
  return isColorDark(bodyBg) ? 'dark' : 'light'
}

/**
 * 从 Tabby CSS 变量获取标准配色方案
 * 两个插件都调用此函数可获得一致的 Auto 模式颜色
 */
export function getTabbyAutoColors(): { bg: string; text: string; primary: string; border: string } {
  try {
    const style = getComputedStyle(document.documentElement)
    return {
      bg: style.getPropertyValue('--body-bg').trim() || '#1e1e2e',
      text: style.getPropertyValue('--text-color').trim() || '#cdd6f4',
      primary: style.getPropertyValue('--primary-color').trim() || '#b4befe',
      border: style.getPropertyValue('--border-color').trim() || '#585b70',
    }
  } catch {
    return { bg: '#1e1e2e', text: '#cdd6f4', primary: '#b4befe', border: '#585b70' }
  }
}

/**
 * 判断 hex/rgb 颜色是否为暗色（基于亮度）
 */
export function isColorDark(color: string): boolean {
  let r = 30, g = 30, b = 46
  if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g)
    if (match && match.length >= 3) { r = +match[0]; g = +match[1]; b = +match[2] }
  } else {
    const hex = color.replace('#', '')
    r = parseInt(hex.substring(0, 2), 16) || 30
    g = parseInt(hex.substring(2, 4), 16) || 30
    b = parseInt(hex.substring(4, 6), 16) || 46
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128
}

/**
 * 解析颜色的亮度值（ITU-R BT.601），返回 0-255；解析失败返回 -1
 */
export function parseColorLuminance(color: string): number {
  try {
    let r = 0, g = 0, b = 0
    if (color.startsWith('rgb')) {
      const m = color.match(/\d+/g)
      if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2] }
      else return -1
    } else {
      const hex = color.replace(/[^0-9a-f]/gi, '')
      if (hex.length < 6) return -1
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    }
    return 0.299 * r + 0.587 * g + 0.114 * b
  } catch { return -1 }
}

/**
 * localStorage 存取辅助（前缀隔离）
 */
export function loadPrefixed<T>(prefix: string, key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${prefix}.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

export function savePrefixed(prefix: string, key: string, value: unknown): void {
  try { localStorage.setItem(`${prefix}.${key}`, JSON.stringify(value)) } catch {}
}

/**
 * 触发插件设置变更事件（通知面板刷新）
 */
export function notifyPanels(eventName: string): void {
  try { window.dispatchEvent(new CustomEvent(eventName)) } catch {}
}

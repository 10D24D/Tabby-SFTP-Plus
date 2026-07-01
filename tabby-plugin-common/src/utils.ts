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
 * 从 Tabby config.yaml 读取语言设置
 * 返回 'zh-CN' | 'en-US' | ''（读取失败时返回空字符串）
 */
export function detectTabbyLanguage(): 'zh-CN' | 'en-US' | '' {
  try {
    const configPath = path.join(getTabbyConfigDir(), 'config.yaml')
    const raw = fs.readFileSync(configPath, 'utf-8')
    // 匹配 language: en-US 或 language: zh-CN（支持引号）
    const match = raw.match(/^language\s*:\s*['"]?([a-zA-Z-]+)['"]?\s*$/m)
    if (match) {
      const lang = match[1]
      if (isLocaleZh(lang)) return 'zh-CN'
      if (/^en/i.test(lang)) return 'en-US'
    }
  } catch {}
  return ''
}

/**
 * 检测 Tabby 实际使用的系统语言
 * 返回 'zh-CN' 或 'en-US'
 */
export function detectSystemLocale(): 'zh-CN' | 'en-US' {
  // 策略1: Tabby config.yaml（直接读取配置文件，最准确）
  const tabbyLang = detectTabbyLanguage()
  if (tabbyLang) return tabbyLang

  // 策略2: document.documentElement.lang
  try {
    const dl = document.documentElement?.lang || ''
    if (isLocaleZh(dl)) return 'zh-CN'
    if (/^en/i.test(dl)) return 'en-US'
  } catch {}

  // 策略3: Tabby localStorage
  try {
    const keys = ['locale', 'language', 'tabby-language', 'tabby-locale',
      'config', 'tabby-config', 'settings', 'tabby-settings', 'tabby-config.json']
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      if (isLocaleZh(raw)) return 'zh-CN'
      if (/^en/i.test(raw)) return 'en-US'
      try {
        const obj = JSON.parse(raw)
        const lang = obj?.appearance?.language || obj?.appearance?.locale
          || obj?.language || obj?.locale || obj?.app?.language || obj?.general?.language
        if (lang) return isLocaleZh(String(lang)) ? 'zh-CN' : 'en-US'
      } catch {}
    }
  } catch {}

  // 策略4: navigator.languages 数组
  try {
    const langs = navigator.languages || [navigator.language]
    if (langs.find(l => isLocaleZh(l))) return 'zh-CN'
  } catch {}

  // 策略5: navigator.language 单值
  try {
    const navLang = navigator.language || ''
    if (navLang) return isLocaleZh(navLang) ? 'zh-CN' : 'en-US'
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

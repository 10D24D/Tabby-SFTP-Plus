/**
 * 主题配色共享类型和工具
 * 功能描述：Tabby 插件间共享的颜色方案类型定义、预设方案、标签映射
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-28
 */

/** 颜色键名 */
export type ColorKey = 'primary' | 'bg' | 'text' | 'surface' | 'border' | 'muted' | 'hover' | 'inputBg' | 'textMuted'

/** 完整配色方案 */
export interface ColorScheme {
  value: string
  label: string
  primary: string
  bg: string
  text: string
  surface: string
  border: string
  muted: string
  hover?: string
  inputBg?: string
  textMuted?: string
}

/** 获取默认预设方案 */
export function defaultColorThemes(): ColorScheme[] {
  return [
    { value: '',       label: 'Auto',   bg: '#313244', text: '#cdd6f4', primary: '#b4befe', surface: '#45475a', border: '#585b70', muted: '#6c7086' },
    { value: 'dark',  label: 'Dark',  bg: '#1e1e2e', text: '#cdd6f4', primary: '#89b4fa', surface: '#313244', border: '#45475a', muted: '#585b70' },
    { value: 'light', label: 'Light', bg: '#f0f4f8', text: '#333',    primary: '#3b82f6', surface: '#e5e7eb', border: '#d1d5db', muted: '#9ca3af' },
    { value: 'blue',  label: 'Blue',  bg: '#0b1929', text: '#e0e7ff', primary: '#60a5fa', surface: '#172554', border: '#1e3a5f', muted: '#64748b' },
    { value: 'green', label: 'Green', bg: '#0a2016', text: '#d1fae5', primary: '#34d399', surface: '#14532d', border: '#166534', muted: '#6b7280' },
    { value: 'purple',label: 'Purple',bg: '#160e23', text: '#eaddff', primary: '#a78bfa', surface: '#2e1065', border: '#4c1d95', muted: '#7c3aed' },
    { value: 'red',   label: 'Red',    bg: '#1a0808', text: '#fecaca', primary: '#f87171', surface: '#450a0a', border: '#991b1b', muted: '#dc2626' },
    { value: 'custom',label: 'Custom', bg: '#313244', text: '#cdd6f4', primary: '#b4befe', surface: '#45475a', border: '#585b70', muted: '#6c7086' },
  ]
}

/** 主题名称翻译映射 */
export const THEME_LABELS: Record<string, [string, string]> = {
  '':      ['跟随Tabby', 'Follow Tabby'],
  'dark':  ['深色', 'Dark'],
  'light': ['浅色', 'Light'],
  'blue':  ['蓝色', 'Blue'],
  'green': ['绿色', 'Green'],
  'purple':['紫色', 'Purple'],
  'red':   ['红色', 'Red'],
  'custom':['自定义', 'Custom'],
}

/**
 * Tabby 风格快捷键工具：格式化、冲突检测、配置读写
 * 字符串格式与官方一致：Ctrl-Shift-S / Win-K / ⌘-⌥-P
 * 创建人：DD1024z
 * 创建时间：2026-07-25
 * 修改人：DD1024z + Hy3 preview
 * 修改时间：2026-08-31
 */
import { SFTP_PLUS_TOGGLE_HOTKEY } from './hotkey-provider'

export type HotkeyBinding = string | string[]

/** 设置页正在录制快捷键时置位，避免已绑定热键触发面板导致卡死 */
const _hotkeyState = (() => {
  let active = false
  return {
    get: () => active,
    set: (v: boolean) => { active = v },
  }
})()

export function setHotkeyRecordingActive(active: boolean): void {
  _hotkeyState.set(active)
}

export function isHotkeyRecordingActive(): boolean {
  return _hotkeyState.get()
}

const META_NAME =
  typeof process !== 'undefined' && process.platform === 'darwin' ? '⌘'
    : typeof process !== 'undefined' && process.platform === 'win32' ? 'Win'
      : 'Super'
const ALT_NAME =
  typeof process !== 'undefined' && process.platform === 'darwin' ? '⌥' : 'Alt'
const MOD_ORDER = ['Ctrl', META_NAME, ALT_NAME, 'Shift']

const CODE_MAP: Record<string, string> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Space: 'Space',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
}

/** 将 KeyboardEvent 转为 Tabby 主键名 */
export function getKeyName(event: KeyboardEvent): string | null {
  const key = event.key
  if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') return null
  if (/^[a-z]$/i.test(key)) return key.toUpperCase()
  if (CODE_MAP[event.code]) return CODE_MAP[event.code]
  let code = event.code || key
  code = code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '')
  return code || null
}

/** 将当前按下的键拼成 Tabby 热键字符串，如 Ctrl-Shift-S */
export function getKeystrokeNameFromEvent(event: KeyboardEvent): string | null {
  const main = getKeyName(event)
  if (!main) return null
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.metaKey) parts.push(META_NAME)
  if (event.altKey) parts.push(ALT_NAME)
  if (event.shiftKey) parts.push('Shift')
  // 按官方顺序重排修饰键
  const ordered = [
    ...MOD_ORDER.filter(m => parts.includes(m)),
    main,
  ]
  return ordered.join('-')
}

export function toHotkeyIdentifier(hotkey: HotkeyBinding): string {
  return Array.isArray(hotkey) ? hotkey.join('$#!') : String(hotkey)
}

export function formatHotkeyBinding(hotkey: HotkeyBinding): string {
  return Array.isArray(hotkey) ? hotkey.join(' › ') : String(hotkey)
}

/** 展平 config.store.hotkeys（含嵌套对象）为 id → bindings[] */
export function flattenHotkeys(
  store: Record<string, unknown> | null | undefined,
  prefix = '',
): Record<string, HotkeyBinding[]> {
  const out: Record<string, HotkeyBinding[]> = {}
  if (!store || typeof store !== 'object') return out
  for (const [key, value] of Object.entries(store)) {
    const id = prefix ? `${prefix}.${key}` : key
    if (Array.isArray(value)) {
      out[id] = value as HotkeyBinding[]
    } else if (value && typeof value === 'object') {
      Object.assign(out, flattenHotkeys(value as Record<string, unknown>, id))
    }
  }
  return out
}

/** 查找与 candidate 冲突的其它热键 id（排除自身） */
export function findHotkeyConflicts(
  candidate: HotkeyBinding,
  storeHotkeys: Record<string, unknown> | null | undefined,
  selfId: string = SFTP_PLUS_TOGGLE_HOTKEY,
): string[] {
  const needle = toHotkeyIdentifier(candidate)
  if (!needle) return []
  const flat = flattenHotkeys(storeHotkeys)
  const hits: string[] = []
  for (const [id, bindings] of Object.entries(flat)) {
    if (id === selfId) continue
    for (const binding of bindings) {
      if (toHotkeyIdentifier(binding) === needle) hits.push(id)
    }
  }
  return hits
}

export function readToggleHotkeyBindings(
  storeHotkeys: Record<string, unknown> | null | undefined,
): HotkeyBinding[] {
  const raw = storeHotkeys?.[SFTP_PLUS_TOGGLE_HOTKEY]
  if (!raw) return []
  if (Array.isArray(raw)) return raw as HotkeyBinding[]
  return [raw as HotkeyBinding]
}

/* ──────────────────────────────────────────────────────────────
 * 面板内置操作热键：单键格式（'Delete' / 'F2' / 'F5' / 'Shift+Backspace' / 'Ctrl+C'）
 * 与 Tabby 多键序列格式（Ctrl-Shift-S）不同，这里只匹配单个按键 + 修饰键。
 * ────────────────────────────────────────────────────────────── */

export interface PanelHotkeyParsed {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

/** 解析 'Shift+Backspace' → { key:'Backspace', shift:true, ctrl:false, alt:false, meta:false }；空串返回 null */
export function parsePanelHotkeyKey(spec: string): PanelHotkeyParsed | null {
  if (!spec || !spec.trim()) return null
  const tokens = spec.trim().split('+')
  const key = tokens[tokens.length - 1].trim()
  if (!key) return null
  const mods = tokens.slice(0, -1).map(m => m.trim().toLowerCase())
  return {
    key,
    ctrl: mods.includes('ctrl'),
    alt: mods.includes('alt'),
    shift: mods.includes('shift'),
    meta: mods.includes('meta') || mods.includes('cmd') || mods.includes('win'),
  }
}

/** 判断 KeyboardEvent 是否匹配某个面板热键 spec（修饰键精确比较 + 主键比较） */
export function matchPanelHotkeyKey(event: KeyboardEvent, spec: string): boolean {
  const p = parsePanelHotkeyKey(spec)
  if (!p) return false
  if (event.ctrlKey !== p.ctrl) return false
  if (event.altKey !== p.alt) return false
  if (event.shiftKey !== p.shift) return false
  if (event.metaKey !== p.meta) return false
  // 主键比较：单字符忽略大小写；命名键（Backspace/F2/F5…）精确比较
  const ek = event.key
  if (p.key.length === 1) return ek.toLowerCase() === p.key.toLowerCase()
  return ek === p.key
}

/** 显示用：空串返回占位符（调用方决定显示文案） */
export function formatPanelHotkeyKey(spec: string, placeholder = '—'): string {
  return spec && spec.trim() ? spec.trim() : placeholder
}

/** 由 KeyboardEvent 生成面板热键 spec 串（录制时调用） */
export function eventToPanelHotkeySpec(event: KeyboardEvent): string | null {
  if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Alt' || event.key === 'Shift') return null
  const main = event.key.length === 1 ? event.key.toUpperCase() : event.key
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.metaKey) parts.push('Meta')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(main)
  return parts.join('+')
}

/* ──────────────────────────────────────────────────────────────
 * 鼠标侧键绑定（2026-08-31）
 * 前进/后退除键盘外还可绑鼠标侧键：button 3 = 后退（XButton1）、
 * button 4 = 前进（XButton2）。与键盘 spec 混存在同一 keys[] 数组里，
 * 匹配时按来源分流：键盘事件只看键盘 spec，鼠标事件只看鼠标 spec。
 * ────────────────────────────────────────────────────────────── */

/** 鼠标后退键 spec（对应 MouseEvent.button === 3） */
export const MOUSE_BACK_SPEC = 'Mouse3'
/** 鼠标前进键 spec（对应 MouseEvent.button === 4） */
export const MOUSE_FORWARD_SPEC = 'Mouse4'

/** 判断面板热键 spec 是否为鼠标侧键绑定 */
export function isMouseHotkeySpec(spec: string): boolean {
  return spec === MOUSE_BACK_SPEC || spec === MOUSE_FORWARD_SPEC
}

/** 鼠标键 spec → MouseEvent.button；非鼠标键返回 null */
export function mouseButtonFromSpec(spec: string): number | null {
  if (spec === MOUSE_BACK_SPEC) return 3
  if (spec === MOUSE_FORWARD_SPEC) return 4
  return null
}

/** MouseEvent.button → 鼠标键 spec（仅 3/4；其余返回 null，表示不参与绑定） */
export function mouseSpecFromButton(button: number): string | null {
  if (button === 3) return MOUSE_BACK_SPEC
  if (button === 4) return MOUSE_FORWARD_SPEC
  return null
}

/** 判断 MouseEvent.button 是否命中绑定列表中的鼠标键 */
export function matchMouseHotkeySpecs(button: number, specs: string[]): boolean {
  if (!Array.isArray(specs)) return false
  const spec = mouseSpecFromButton(button)
  if (!spec) return false
  return specs.includes(spec)
}

/** 多绑定匹配：任一键盘绑定命中即 true（鼠标键跳过，由鼠标路径单独处理） */
export function matchPanelHotkeyKeys(event: KeyboardEvent, specs: string[]): boolean {
  if (!Array.isArray(specs) || !specs.length) return false
  for (const spec of specs) {
    if (isMouseHotkeySpec(spec)) continue
    if (matchPanelHotkeyKey(event, spec)) return true
  }
  return false
}

/** 取绑定列表中的键盘绑定（过滤鼠标键）；用于右键菜单等只展示键盘键的场合 */
export function keyboardHotkeySpecs(specs: string[]): string[] {
  if (!Array.isArray(specs)) return []
  return specs.filter(s => s && !isMouseHotkeySpec(s))
}

/**
 * 归一化面板热键绑定为字符串数组，兼容旧的单键格式：
 * 旧 { key: 'Delete' } → ['Delete']；新的 { keys: [...] } 原样返回。
 * 同时剔除哨兵值（__NONE__ / 空串）与 NUL 开头的历史脏数据。
 */
export function normalizePanelHotkeyKeys(raw: unknown, cleared = '__NONE__'): string[] {
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter(v => typeof v === 'string')
      .map(v => (v as string).trim())
      .filter(v => !!v && v !== cleared && v.indexOf('\x00') !== 0)
  }
  if (typeof raw === 'string') {
    const v = raw.trim()
    return (v && v !== cleared && v.indexOf('\x00') !== 0) ? [v] : []
  }
  return []
}

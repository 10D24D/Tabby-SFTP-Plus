/**
 * Tabby 风格快捷键工具：格式化、冲突检测、配置读写
 * 字符串格式与官方一致：Ctrl-Shift-S / Win-K / ⌘-⌥-P
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

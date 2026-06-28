/**
 * SFTP+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 SFTP+ 配置入口（语言、UI颜色、字段显示）
 *   注意：纯 localStorage 读写，不注入任何服务（避免设置页卡顿）
 * 创建人：DD1024z + Hy3 preview
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Hy3 preview
 * 修改时间：2026-06-23
 */
import { Component, Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'

/**
 * 检测 Tabby 实际使用的系统语言（与 SftpI18nService 策略2/3/4 一致）
 * 返回 'zh-CN' 或 'en-US'
 */
function detectSystemLocale(): 'zh-CN' | 'en-US' {
  // 策略1: Tabby localStorage（多种可能的 key）
  try {
    const keys = ['locale', 'language', 'tabby-language', 'tabby-locale',
      'config', 'tabby-config', 'settings', 'tabby-settings']
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      if (/^zh/i.test(raw)) return 'zh-CN'
      if (/^en/i.test(raw)) return 'en-US'
      // 尝试解析 JSON 对象
      try {
        const obj = JSON.parse(raw)
        const lang = obj?.appearance?.language
          || obj?.appearance?.locale
          || obj?.language
          || obj?.locale
          || obj?.app?.language
          || obj?.general?.language
        if (lang) return /^zh/i.test(String(lang)) ? 'zh-CN' : 'en-US'
      } catch (e) { /* 不是 JSON */ }
    }
  } catch (e) {}

  // 策略2: navigator.languages 数组
  try {
    const langs = navigator.languages || [navigator.language]
    const zhLang = langs.find(l => /^zh/i.test(l))
    if (zhLang) return 'zh-CN'
  } catch (e) {}

  // 策略3: navigator.language 单值
  try {
    const navLang = navigator.language || ''
    if (navLang) return /^zh/i.test(navLang) ? 'zh-CN' : 'en-US'
  } catch (e) {}

  // 默认返回中文
  return 'zh-CN'
}

/** SFTP+ 设置存储 key 前缀 */
const PREFIX = 'sftp-plus-settings'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch (e) { return fallback }
}

function save(key: string, value: unknown): void {
  try { localStorage.setItem(`${PREFIX}.${key}`, JSON.stringify(value)) } catch (e) {}
}

/** SFTP+ 列设置存储 key */
const COLS_KEY = 'sftp-plus-cols'

function loadCols(): { size: boolean; date: boolean; perms: boolean; mode: boolean; access: boolean; owner: boolean; group: boolean; path: boolean; ext: boolean } {
  try {
    const raw = localStorage.getItem(COLS_KEY)
    if (raw) {
      const c = JSON.parse(raw)
      return {
        size: c.size !== false,
        date: c.date !== false,
        perms: c.perms !== false,
        mode: c.mode === true,
        access: c.access === true,
        owner: c.owner === true,
        group: c.group === true,
        path: c.path === true,
        ext: c.ext === true,
      }
    }
  } catch (e) {}
  return { size: true, date: true, perms: true, mode: false, access: false, owner: false, group: false, path: false, ext: false }
}

function saveCols(cols: Record<string, boolean>): void {
  try { localStorage.setItem(COLS_KEY, JSON.stringify(cols)) } catch (e) {}
}

/** 表格设置存储 key */
const TABLE_SETTINGS_KEY = 'sftp-plus-table'

function loadTableSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`${TABLE_SETTINGS_KEY}.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch (e) { return fallback }
}

function saveTableSetting(key: string, value: boolean): void {
  try { localStorage.setItem(`${TABLE_SETTINGS_KEY}.${key}`, JSON.stringify(value)) } catch (e) {}
}


@Component({
  template: `
    <div class="sftp-settings-page">
      <h3 class="ss-title">SFTP+</h3>
      <p class="ss-desc">SFTP+ 插件设置，修改后即时生效。</p>

      <!-- 界面语言 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '界面语言' : 'Interface Language' }}</label>
        <select [(ngModel)]="lang" (ngModelChange)="saveLang()" class="ss-select">
          <option value="">{{ effectiveLang === 'zh-CN' ? '自动' : 'Auto' }}</option>
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
        </select>
        <p class="ss-hint">
          {{ effectiveLang === 'zh-CN'
            ? '自动跟随 Tabby 系统语言。手动选择后持久化。'
            : 'Defaults to Tabby system language (Auto). Manual choice persists.' }}
        </p>
      </div>

      <!-- UI 颜色 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? 'UI 颜色主题' : 'UI Color Theme' }}</label>
        <div class="ss-color-row">
          <label *ngFor="let c of colorThemes"
            [class.ss-color-active]="theme === c.value"
            [style.background]="swatchBg(c)"
            [style.color]="c.text || null"
            [style.borderColor]="c.value === theme ? 'var(--primary-color, #3b82f6)' : 'transparent'"
            class="ss-color-swatch"
            (click)="setTheme(c.value)">
            {{ c.label }}
          </label>
        </div>
        <p class="ss-hint">
          {{ effectiveLang === 'zh-CN'
            ? '自动跟随 Tabby 主题。选择预设可覆盖面板颜色。'
            : 'Follows Tabby theme by default. Choose a preset to override panel colors.' }}
        </p>
      </div>

      <!-- 自定义主色调（一行显示） -->
      <div class="ss-section" *ngIf="theme !== ''">
        <div class="ss-color-fields">
          <div class="ss-color-field">
            <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '主色调' : 'Primary' }}</label>
            <input type="color" [(ngModel)]="primaryColor" (ngModelChange)="onColorChange()"
                   class="ss-color-input" />
            <span class="ss-color-val">{{ primaryColor }}</span>
          </div>
          <div class="ss-color-field">
            <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '背景色' : 'Background' }}</label>
            <input type="color" [(ngModel)]="bgColor" (ngModelChange)="onColorChange()"
                   class="ss-color-input" />
            <span class="ss-color-val">{{ bgColor }}</span>
          </div>
          <div class="ss-color-field">
            <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '文字颜色' : 'Text' }}</label>
            <input type="color" [(ngModel)]="textColor" (ngModelChange)="onColorChange()"
                   class="ss-color-input" />
            <span class="ss-color-val">{{ textColor }}</span>
          </div>
        </div>
      </div>

      <!-- 文件列表字段 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '文件列表字段' : 'File List Columns' }}</label>
        <p class="ss-hint">
          {{ effectiveLang === 'zh-CN'
            ? '选择文件列表中显示的列。右键表头也可以快速切换。'
            : 'Select which columns to show in the file list. You can also right-click the header.' }}
        </p>
        <div class="ss-col-list">
          <label class="ss-col-item"><input type="checkbox" [checked]="true" [disabled]="true" /> {{ effectiveLang === 'zh-CN' ? '名称' : 'Name' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.size" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '大小' : 'Size' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.date" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '修改时间' : 'Modified' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.access" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '访问时间' : 'Accessed' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.owner" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '所有者' : 'Owner' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.group" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '组' : 'Group' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.perms" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '权限' : 'Permissions' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.mode" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '模式' : 'Mode' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.path" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '路径' : 'Path' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="cols.ext" (ngModelChange)="onColChange()" /> {{ effectiveLang === 'zh-CN' ? '扩展名' : 'Extension' }}</label>
        </div>
      </div>

      <!-- 表格样式 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '表格样式' : 'Table Style' }}</label>
        <div class="ss-col-list">
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="showColBorders" (ngModelChange)="saveTableSettings()" /> {{ effectiveLang === 'zh-CN' ? '显示列边框线' : 'Show column borders' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="showZebra" (ngModelChange)="saveTableSettings()" /> {{ effectiveLang === 'zh-CN' ? '使用斑马纹' : 'Use zebra stripes' }}</label>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .sftp-settings-page { padding:20px; max-width:600px; }
    .ss-title { color:var(--primary-color,#3b82f6); font-size:18px; margin-bottom:6px; }
    .ss-desc { opacity:.7; font-size:13px; line-height:1.6; margin-bottom:24px; }
    .ss-section { border-top:1px solid rgba(128,128,128,0.2); padding-top:16px; margin-bottom:8px; }
    .ss-label { display:block; font-size:14px; font-weight:600; margin-bottom:8px; }
    .ss-select {
      width:100%; max-width:280px;
      padding:7px 10px; border-radius:6px;
      background: rgba(128,128,128,0.1);
      border:1px solid rgba(128,128,128,0.25);
      font-size:13px; cursor:pointer; outline:none;
      color: inherit;
      color-scheme: inherit;
    }
    .ss-select option { color: initial; }
    .ss-select:focus { border-color: var(--primary-color, #3b82f6); }
    .ss-hint { opacity:.6; font-size:12px; line-height:1.5; margin-top:6px; }

    .ss-color-row { display:flex; gap:10px; flex-wrap:wrap; }
    .ss-color-fields { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; }
    .ss-color-field { display:flex; flex-direction:column; gap:4px; }
    .ss-color-swatch {
      display:inline-flex; align-items:center; gap:6px;
      padding:8px 14px; border-radius:8px; border:2px solid transparent;
      font-size:12px; cursor:pointer; transition:border-color .15s;
      background: rgba(128,128,128,0.1);
    }
    .ss-color-swatch:hover { opacity:.85; }
    .ss-color-active { box-shadow:0 0 0 1px rgba(59,130,246,.3); }

    .ss-color-input { width:48px; height:32px; border:none; border-radius:6px; cursor:pointer; vertical-align:middle; }
    .ss-color-val { font-size:12px; font-family:monospace; margin-left:6px; opacity:.7; vertical-align:middle; }

    .ss-col-list { display:flex; flex-direction:column; gap:8px; margin-top:8px; }
    .ss-col-item {
      display:flex; align-items:center; gap:8px;
      padding:6px 10px; border-radius:6px;
      background: rgba(128,128,128,0.04); font-size:13px; cursor:pointer;
    }
    .ss-col-item:hover { background: rgba(128,128,128,0.08); }
    .ss-col-item input { margin:0; }

  `],
})
export class SftpSettingsTabComponent {
  /** 界面语言（空 = 自动跟随系统） */
  lang: '' | 'zh-CN' | 'en-US' = (load('lang', '') as string || '') as '' | 'zh-CN' | 'en-US'

  /** 使用界面语言（Auto 模式时检测系统语言） */
  get effectiveLang(): 'zh-CN' | 'en-US' {
    if (this.lang === 'zh-CN' || this.lang === 'en-US') return this.lang
    return detectSystemLocale()
  }

  /** 预设主题（Light 排在 Dark 后面） */
  colorThemes = [
    { value: '',       label: 'Auto',   bg: 'auto',        text: '' },
    { value: 'dark',  label: 'Dark',  bg: '#1a1d23', text: '#fff' },
    { value: 'light', label: 'Light', bg: '#f0f4f8', text: '#333' },
    { value: 'blue',  label: 'Blue',  bg: '#0b1929', text: '#fff' },
    { value: 'green', label: 'Green', bg: '#0a2016', text: '#fff' },
    { value: 'purple',label: 'Purple',bg: '#160e23', text: '#fff' },
    { value: 'red',   label: 'Red',    bg: '#1a0808', text: '#fff' },
  ]

  /** 当前主题 */
  theme: string = load('theme', '')

  /** 获取颜色块背景样式（Auto 使用渐变，Custom 使用当前背景色） */
  swatchBg(c: { value: string; bg: string; text?: string }): string {
    if (c.bg === 'auto') {
      return 'linear-gradient(135deg, var(--body-bg, #f9fafb), var(--text-color, #333))'
    }
    if (c.value === 'custom') {
      return this.bgColor || c.bg
    }
    return c.bg
  }

  /** 自定义颜色 */
  primaryColor: string = load('primaryColor', '')
  bgColor: string = load('bgColor', '')
  textColor: string = load('textColor', '')

  /** 预设颜色（用于检测是否偏离） */
  private readonly presets: Record<string, { primary: string; bg: string; text: string; border: string }> = {
    dark:      { primary: '#67676f', bg: '#1a1d23', text: '#e8edf5', border: '#2d3242' },
    light:     { primary: '#2563eb', bg: '#ffffff', text: '#1a1a2e', border: '#d1d9e6' },
    blue:      { primary: '#3b9eff', bg: '#0b1929', text: '#e6f0ff', border: '#1e3a5f' },
    green:     { primary: '#4ade80', bg: '#0a2016', text: '#e8fce8', border: '#1a5030' },
    purple:    { primary: '#b794f4', bg: '#160e23', text: '#ebe0fc', border: '#3a2558' },
    red:       { primary: '#f87171', bg: '#1a0808', text: '#ffe0dd', border: '#502020' },
  }

  /** 列设置 */
  cols = loadCols()

  /** 表格样式设置 */
  showColBorders = loadTableSetting('colBorders', true)
  showZebra = loadTableSetting('zebra', true)


  ngOnInit(): void {
    const root = document.documentElement

    if (!this.theme) {
      // Auto 模式：确保没有残留的 --sftp-* CSS 变量
      root.style.removeProperty('--sftp-primary')
      root.style.removeProperty('--sftp-bg')
      root.style.removeProperty('--sftp-text')
      root.style.removeProperty('--sftp-border')
    } else if (this.theme === 'custom') {
      // Custom 主题：应用已保存的自定义颜色
      this.applyCurrentColors(root)
      // 确保 custom 选项在列表中
      if (!this.colorThemes.find(t => t.value === 'custom')) {
        this.colorThemes.push({ value: 'custom', label: this.effectiveLang === 'zh-CN' ? '自定义' : 'Custom', bg: this.bgColor, text: this.textColor })
      }
    } else {
      // 预设主题：应用保存的自定义颜色到 CSS 变量
      this.checkCustom()
      this.applyCurrentColors(root)
    }
  }

  saveLang(): void {
    save('lang', this.lang)
    // 写入 localStorage 让面板组件读取（空字符串 = 自动跟随系统）
    localStorage.setItem('sftp-plus-locale', this.lang)
  }


  setTheme(value: string): void {
    this.theme = value
    save('theme', value)

    // 清除 Custom 选项（切换主题时）
    this.colorThemes = this.colorThemes.filter(t => t.value !== 'custom')

    const root = document.documentElement

    if (value === 'custom') {
      // Custom 主题：保持当前颜色，只显示颜色选择器
      this.applyCurrentColors(root)
      this.notifyPanels()
      return
    }

    if (value && this.presets[value]) {
      // 预设主题：应用预设颜色到 CSS 变量，并保存到 localStorage
      const p = this.presets[value]
      root.style.setProperty('--sftp-primary', p.primary)
      root.style.setProperty('--sftp-bg', p.bg)
      root.style.setProperty('--sftp-text', p.text)
      root.style.setProperty('--sftp-border', p.border)
      this.primaryColor = p.primary
      this.bgColor = p.bg
      this.textColor = p.text
      save('primaryColor', p.primary)
      save('bgColor', p.bg)
      save('textColor', p.text)
    } else {
      // 清除自定义变量 → 回退到 Tabby 变量（Auto 模式由面板 _applyAutoTheme 接管）
      root.style.removeProperty('--sftp-primary')
      root.style.removeProperty('--sftp-bg')
      root.style.removeProperty('--sftp-text')
      root.style.removeProperty('--sftp-border')
      this.primaryColor = ''
      this.bgColor = ''
      this.textColor = ''
    }

    // 通知面板重新读取设置（含 Auto 主题切换）
    this.notifyPanels()
  }

  /** 应用当前自定义颜色到 CSS 变量 */
  private applyCurrentColors(root: HTMLElement): void {
    if (!this.primaryColor || !this.bgColor || !this.textColor) return
    root.style.setProperty('--sftp-primary', this.primaryColor)
    root.style.setProperty('--sftp-bg', this.bgColor)
    root.style.setProperty('--sftp-text', this.textColor)
  }

  /** 颜色变化（用户手动修改颜色） */
  onColorChange(): void {
    if (!this.primaryColor || !this.bgColor || !this.textColor) return
    const root = document.documentElement
    root.style.setProperty('--sftp-primary', this.primaryColor)
    root.style.setProperty('--sftp-bg', this.bgColor)
    root.style.setProperty('--sftp-text', this.textColor)
    save('primaryColor', this.primaryColor)
    save('bgColor', this.bgColor)
    save('textColor', this.textColor)
    this.checkCustom()
    this.notifyPanels()
  }

  onColChange(): void {
    saveCols(this.cols)
    this.notifyPanels()
  }

  /** 检测是否偏离预设，若是则标记为 custom 并选中 */
  private checkCustom(): void {
    if (!this.theme || this.theme === 'custom') return
    const preset = this.presets[this.theme]
    if (!preset) return
    const isCustom = this.primaryColor !== preset.primary
      || this.bgColor !== preset.bg
      || this.textColor !== preset.text
    const customLabel = this.effectiveLang === 'zh-CN' ? '自定义' : 'Custom'
    if (isCustom) {
      // 检测到自定义：添加 Custom 选项并选中
      if (!this.colorThemes.find(t => t.value === 'custom')) {
        this.colorThemes.push({ value: 'custom', label: customLabel, bg: this.bgColor, text: this.textColor })
      }
      this.theme = 'custom'
      save('theme', 'custom')
    } else {
      // 恢复为预设：移除 Custom 选项
      this.colorThemes = this.colorThemes.filter(t => t.value !== 'custom')
    }
  }

  saveTableSettings(): void {
    saveTableSetting('colBorders', this.showColBorders)
    saveTableSetting('zebra', this.showZebra)
    this.notifyPanels()
  }

  /** 通知所有面板重新读取设置 */
  private notifyPanels(): void {
    // 通过 DOM 事件通知（面板在 ngOnInit 中监听）
    try {
      window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed'))
    } catch (e) { /* 忽略错误 */ }
  }
}

@Injectable()
export class SftpSettingsTabProvider extends SettingsTabProvider {
  id = 'sftp-settings'
  icon = 'fas fa-folder-open'
  title = 'SFTP+'

  getComponentType(): any {
    return SftpSettingsTabComponent
  }

  async getSettingsTabs(): Promise<Array<{
    title: string
    icon?: string
    weight?: number
    component: any
  }>> {
    return [
      {
        title: 'SFTP+',
        icon: 'fas fa-folder-open',
        weight: 99,
        component: SftpSettingsTabComponent,
      },
    ]
  }
}

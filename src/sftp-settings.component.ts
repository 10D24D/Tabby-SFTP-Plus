/**
 * SFTP+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 SFTP+ 配置入口（语言、UI颜色、表格样式、数据备份）
 *   注意：纯 localStorage 读写，不注入任何服务（避免设置页卡顿）
 * 创建人：DD1024z + Hy3 preview
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-26
 *
 * 修复项（2026-06-26）：
 * - 面板布局选择器从下拉框改为卡片式图标+文字选择器
 * - 增加数据导出导入功能
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
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '主题颜色' : 'Theme Color' }}</label>
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
          <span *ngIf="theme === '' && autoThemeLabel" class="ss-auto-badge">
            → {{ effectiveLang === 'zh-CN' ? '当前映射' : 'Mapped to' }}: <strong>{{ autoThemeLabel }}</strong>
          </span>
        </p>

        <!-- 自定义颜色（一行显示） -->
        <div class="ss-color-fields" *ngIf="theme !== ''">
          <div class="ss-sub-label">{{ effectiveLang === 'zh-CN' ? '自定义颜色' : 'Custom Colors' }}</div>
          <div class="ss-color-field">
            <label>{{ effectiveLang === 'zh-CN' ? '主色调' : 'Primary' }}</label>
            <input type="color" [(ngModel)]="primaryColor" (ngModelChange)="onColorChange()"
                   class="ss-color-input" />
            <span class="ss-color-val">{{ primaryColor }}</span>
          </div>
          <div class="ss-color-field">
            <label>{{ effectiveLang === 'zh-CN' ? '背景颜色' : 'Background' }}</label>
            <input type="color" [(ngModel)]="bgColor" (ngModelChange)="onColorChange()"
                   class="ss-color-input" />
            <span class="ss-color-val">{{ bgColor }}</span>
          </div>
          <div class="ss-color-field">
            <label>{{ effectiveLang === 'zh-CN' ? '文字颜色' : 'Text' }}</label>
            <input type="color" [(ngModel)]="textColor" (ngModelChange)="onColorChange()"
                   class="ss-color-input" />
            <span class="ss-color-val">{{ textColor }}</span>
          </div>
        </div>
      </div>

      <!-- 面板布局 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '面板布局' : 'Panel Layout' }}</label>
        <div class="ss-layout-row">
          <!-- 自适应 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'auto'" (click)="setLayoutMode('auto')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="9" height="9" rx="1.5"/>
                <rect x="13" y="2" width="9" height="9" rx="1.5"/>
                <rect x="2" y="13" width="9" height="9" rx="1.5"/>
                <rect x="13" y="13" width="9" height="9" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ effectiveLang === 'zh-CN' ? '自适应' : 'Adaptive' }}</span>
            <span class="ss-layout-sub">{{ effectiveLang === 'zh-CN' ? '根据窗口宽度自动切换' : 'Auto switch by width' }}</span>
          </div>
          <!-- 左右布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'horizontal'" (click)="setLayoutMode('horizontal')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="9" height="20" rx="1.5"/>
                <rect x="13" y="2" width="9" height="20" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ effectiveLang === 'zh-CN' ? '左右布局' : 'Horizontal' }}</span>
            <span class="ss-layout-sub">{{ effectiveLang === 'zh-CN' ? '两个面板水平并排' : 'Panes side by side' }}</span>
          </div>
          <!-- 上下布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'vertical'" (click)="setLayoutMode('vertical')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="9" rx="1.5"/>
                <rect x="2" y="13" width="20" height="9" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ effectiveLang === 'zh-CN' ? '上下布局' : 'Vertical' }}</span>
            <span class="ss-layout-sub">{{ effectiveLang === 'zh-CN' ? '两个面板垂直堆叠' : 'Panes stacked' }}</span>
          </div>
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

      <!-- 数据导入导出 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '数据备份' : 'Data Backup' }}</label>
        <p class="ss-hint" style="margin-bottom:10px;">
          {{ effectiveLang === 'zh-CN'
            ? '导出为 JSON 文件，可用于备份和恢复所有设置、书签、传输日志等数据。'
            : 'Export all settings, bookmarks, transfer logs, etc. to a JSON file for backup.' }}
        </p>
        <div class="ss-backup-row">
          <button class="ss-btn" (click)="exportData()">
            📤 {{ effectiveLang === 'zh-CN' ? '导出数据' : 'Export Data' }}
          </button>
          <label class="ss-btn ss-btn-import">
            📥 {{ effectiveLang === 'zh-CN' ? '导入数据' : 'Import Data' }}
            <input type="file" accept=".json" (change)="importData($event)" style="display:none" />
          </label>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .sftp-settings-page { padding:20px; max-width:600px; }
    .ss-title { color:var(--primary-color,#3b82f6); font-size:18px; margin-bottom:6px; }
    .ss-desc { opacity:.7; font-size:13px; line-height:1.6; margin-bottom:24px; }
    .ss-section { border-top:1px solid rgba(128,128,128,0.2); padding-top:16px; margin-bottom:8px; }
    .ss-label { display:block; font-size:16px; font-weight:600; margin-bottom:10px; }
    .ss-sub-label { font-size:14px; font-weight:600; margin-top:16px; margin-bottom:8px; opacity:.85; }
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
    .ss-hint { opacity:.6; font-size:11px; line-height:1.5; margin-top:6px; }
    .ss-auto-badge { opacity:.85; color: var(--primary-color, #3b82f6); }

    .ss-color-row { display:flex; gap:10px; flex-wrap:wrap; }
    .ss-color-fields { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; margin-top:12px; }
    .ss-color-field { display:flex; flex-direction:column; gap:4px; }
    .ss-color-field label { font-size:13px; font-weight:500; }
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

    .ss-col-list { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
    .ss-col-item {
      display:flex; align-items:center; gap:8px;
      padding:6px 10px; border-radius:6px;
      font-size:13px; cursor:pointer; flex:1;
    }
    .ss-col-item input { margin:0; }
    .ss-col-item:hover { background: rgba(128,128,128,0.08); }

    .ss-backup-row {
      display:flex; gap:10px; flex-wrap:wrap; margin-top:4px;
    }
    .ss-btn {
      display:inline-flex; align-items:center; gap:6px;
      padding:8px 20px; border-radius:8px;
      border:1px solid rgba(128,128,128,0.25);
      background: rgba(128,128,128,0.08);
      font-size:13px; cursor:pointer; transition:background .15s;
      color: inherit;
    }
    .ss-btn:hover { background: rgba(128,128,128,0.15); }
    .ss-btn-import { cursor:pointer; }

    /* 布局卡片选择器 */
    .ss-layout-row { display:flex; gap:8px; flex-wrap:wrap; }
    .ss-layout-card {
      display:flex; flex-direction:column; align-items:center; gap:4px;
      flex:1; min-width:100px; padding:10px 8px;
      border-radius:8px; border:2px solid rgba(128,128,128,0.2);
      background: rgba(128,128,128,0.04);
      cursor:pointer; transition:border-color .15s, background .15s;
      text-align:center;
    }
    .ss-layout-card:hover {
      border-color: rgba(128,128,128,0.35);
      background: rgba(128,128,128,0.08);
    }
    .ss-layout-active {
      border-color: var(--primary-color, #3b82f6) !important;
      background: rgba(59,130,246,0.08);
    }
    .ss-layout-icon {
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:6px;
      background: rgba(128,128,128,0.08);
      color: inherit; opacity:.85;
    }
    .ss-layout-active .ss-layout-icon {
      background: rgba(59,130,246,0.15);
      color: var(--primary-color, #3b82f6); opacity:1;
    }
    .ss-layout-text { font-size:13px; font-weight:600; line-height:1.2; }
    .ss-layout-sub { font-size:10px; opacity:.5; line-height:1.3; }

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

  /** Auto 模式下检测到的映射主题名（'dark' | 'light' | ''） */
  detectedAutoTheme: 'dark' | 'light' | '' = ''

  /** 检测当前 Tabby UI 主题的暗/亮模式（读取 --body-bg CSS 变量） */
  detectAutoTheme(): void {
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

    // 解析颜色 → 计算亮度
    let r = 30, g = 30, b = 46
    if (bodyBg.startsWith('rgb')) {
      const match = bodyBg.match(/\d+/g)
      if (match && match.length >= 3) { r = +match[0]; g = +match[1]; b = +match[2] }
    } else {
      const hex = bodyBg.replace('#', '')
      r = parseInt(hex.substring(0, 2), 16) || 30
      g = parseInt(hex.substring(2, 4), 16) || 30
      b = parseInt(hex.substring(4, 6), 16) || 46
    }
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    this.detectedAutoTheme = lum < 128 ? 'dark' : 'light'
  }

  /** 获取 Auto 映射主题名的显示文本 */
  get autoThemeLabel(): string {
    if (this.detectedAutoTheme === 'dark') return this.effectiveLang === 'zh-CN' ? '暗色' : 'Dark'
    if (this.detectedAutoTheme === 'light') return this.effectiveLang === 'zh-CN' ? '亮色' : 'Light'
    return ''
  }

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

  /** 面板布局 */
  layoutMode: string = load('layoutMode', 'auto')

  /** 表格样式设置 */
  showColBorders = loadTableSetting('colBorders', true)
  showZebra = loadTableSetting('zebra', true)


  ngOnInit(): void {
    const root = document.documentElement

    // Auto 模式下检测当前 Tabby UI 主题
    if (!this.theme) {
      this.detectAutoTheme()
    }

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

    // 监听面板上的布局切换 → 同步更新设置页显示
    window.addEventListener('sftp-plus-settings-changed', () => {
      this.layoutMode = load('layoutMode', 'auto')
    })
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
      // 重新检测 Auto 映射的主题名
      this.detectAutoTheme()
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

  /** 通知所有面板重新读取设置 */
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

  setLayoutMode(mode: string): void {
    this.layoutMode = mode
    this.saveLayoutMode()
  }

  saveLayoutMode(): void {
    save('layoutMode', this.layoutMode)
    try { localStorage.setItem('sftp-plus-layout-mode', this.layoutMode) } catch {}
    this.notifyPanels()
  }

  /** 通知所有面板重新读取设置 */
  private notifyPanels(): void {
    // 通过 DOM 事件通知（面板在 ngOnInit 中监听）
    try {
      window.dispatchEvent(new CustomEvent('sftp-plus-settings-changed'))
    } catch (e) { /* 忽略错误 */ }
  }

  // ========== 数据导出导入 ==========

  /** 收集所有 SFTP+ 相关的 localStorage 数据（尝试解析 JSON，避免导出双重编码） */
  private collectAllData(): Record<string, unknown> {
    const data: Record<string, unknown> = {}

    // 1. 读取所有 sftp-plus 前缀的实际存储键
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sftp-plus-')) {
        const raw = localStorage.getItem(key)!
        try {
          data[key] = JSON.parse(raw)
        } catch {
          data[key] = raw
        }
      }
    }

    // 2. 补充未存储的默认值（用户从未修改过的设置）
    const defaults: Record<string, unknown> = {
      'sftp-plus-settings.lang': '',
      'sftp-plus-settings.theme': '',
      'sftp-plus-settings.primaryColor': '',
      'sftp-plus-settings.bgColor': '',
      'sftp-plus-settings.textColor': '',
      'sftp-plus-settings.layoutMode': 'auto',
      'sftp-plus-table.colBorders': true,
      'sftp-plus-table.zebra': true,
    }
    for (const [key, fallback] of Object.entries(defaults)) {
      if (!(key in data)) {
        data[key] = fallback
      }
    }

    return data
  }

  /** 导出数据为 JSON 文件下载 */
  exportData(): void {
    const data = this.collectAllData()
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sftp-plus-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** 从 JSON 文件导入数据 */
  importData(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Record<string, string>
        let count = 0
        for (const [key, value] of Object.entries(data)) {
          if (key.startsWith('sftp-plus-')) {
            localStorage.setItem(key, value)
            count++
          }
        }
        const msg = this.effectiveLang === 'zh-CN'
          ? `数据导入完成，共恢复 ${count} 项数据。部分设置可能需要重新打开 SFTP+ 面板才能生效。`
          : `Import complete. Restored ${count} items. Some settings may require reopening the SFTP+ panel.`
        alert(msg)
        this.notifyPanels()
      } catch {
        const msg = this.effectiveLang === 'zh-CN'
          ? '导入失败：文件格式错误或已损坏。'
          : 'Import failed: invalid or corrupted file.'
        alert(msg)
      }
    }
    reader.readAsText(file)
    // 重置 input 以便重复选择同一文件
    input.value = ''
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

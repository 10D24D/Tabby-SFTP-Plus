/**
 * SFTP+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 SFTP+ 配置入口（语言、主题、布局、数据、关于）
 *   注意：纯 localStorage 读写，不注入任何服务（避免设置页卡顿）
 * 创建人：DD1024z + Hy3 preview
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-26
 *
 * 修复项（2026-06-26）：
 * - 面板布局选择器从下拉框改为卡片式图标+文字选择器
 * - 增加数据导出导入功能
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-28
 *   - 精简标签：界面语言→语言, 主题颜色→主题, 面板布局→布局, 数据备份→数据
 *   - 表格样式归入布局子选项
 *   - 移除多余提示文案
 *   - 新增「关于」区块
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
      <p class="ss-desc">{{ t('SFTP+ 双栏文件管理器，管理远程和本地文件。', 'SFTP+ dual-pane file manager. Manage remote and local files.') }}</p>

      <!-- 语言 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '语言' : 'Language' }}</label>
        <select [(ngModel)]="lang" (ngModelChange)="saveLang()" class="ss-select">
          <option value="">{{ effectiveLang === 'zh-CN' ? '自动' : 'Auto' }}</option>
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
        </select>
      </div>

      <!-- 主题 -->
      <div class="ss-section">
        <label class="ss-label">{{ t('主题', 'Theme') }}</label>
        <div class="ss-color-row">
          <label *ngFor="let c of colorThemes"
            [class.ss-color-active]="theme === c.value"
            class="ss-color-swatch"
            (click)="setTheme(c.value)">
            <span class="ss-color-swatch-name">{{ themeLabel(c) }}</span>
            <span class="ss-color-swatch-preview" [style.background]="swatchPreviewBg(c)">
              <span class="ss-cp-title" [style.background]="c.surface || c.bg" [style.color]="c.text">{{ themeLabel(c) }}</span>
              <span class="ss-cp-body" [style.color]="c.muted || c.text">
                <span class="ss-cp-line" [style.color]="c.text">file</span>
                <span class="ss-cp-accent" [style.background]="c.primary || 'var(--primary-color, #3b82f6)'"></span>
              </span>
            </span>
          </label>
        </div>

        <!-- 配色方案详情 -->
        <div class="ss-scheme-preview" *ngFor="let c of colorThemes" [hidden]="theme !== c.value">
          <div class="ss-color-fields">
            <div class="ss-color-field">
              <label>{{ t('主色调', 'Primary') }}</label>
              <input type="color" [ngModel]="themePrimary" (ngModelChange)="onColorChange('primary', $event)" class="ss-color-input" />
              <span class="ss-color-val">{{ themePrimary }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('背景', 'Bg') }}</label>
              <input type="color" [ngModel]="themeBg" (ngModelChange)="onColorChange('bg', $event)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBg }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('文字', 'Text') }}</label>
              <input type="color" [ngModel]="themeText" (ngModelChange)="onColorChange('text', $event)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeText }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('标题栏', 'Surface') }}</label>
              <input type="color" [ngModel]="themeSurface" (ngModelChange)="onColorChange('surface', $event)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeSurface }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('边框', 'Border') }}</label>
              <input type="color" [ngModel]="themeBorder" (ngModelChange)="onColorChange('border', $event)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBorder }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('次要文字', 'Muted') }}</label>
              <input type="color" [ngModel]="themeMuted" (ngModelChange)="onColorChange('muted', $event)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeMuted }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 布局 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '布局' : 'Layout' }}</label>
        <!-- 面板布局 -->
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

        <!-- 表格样式（属于布局的子选项） -->
        <div class="ss-sub-label" style="margin-top:16px;">{{ effectiveLang === 'zh-CN' ? '表格样式' : 'Table Style' }}</div>
        <div class="ss-col-list">
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="showColBorders" (ngModelChange)="saveTableSettings()" /> {{ effectiveLang === 'zh-CN' ? '显示列边框线' : 'Show column borders' }}</label>
          <label class="ss-col-item"><input type="checkbox" [(ngModel)]="showZebra" (ngModelChange)="saveTableSettings()" /> {{ effectiveLang === 'zh-CN' ? '使用斑马纹' : 'Use zebra stripes' }}</label>
        </div>
      </div>

      <!-- 数据 -->
      <div class="ss-section">
        <label class="ss-label">{{ t('数据', 'Data') }}</label>
        <div class="ss-backup-row">
          <button class="ss-btn" (click)="exportData()">[&uarr;] {{ t('导出数据', 'Export') }}</button>
          <label class="ss-btn ss-btn-import">[&darr;] {{ t('导入数据', 'Import') }}
            <input type="file" accept=".json" (change)="importData($event)" style="display:none" />
          </label>
          <button class="ss-btn ss-btn-danger" (click)="openClearConfirm()">[&times;] {{ t('清空数据', 'Clear All') }}</button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="ss-section">
        <label class="ss-label">{{ t('关于', 'About') }}</label>
        <div class="ss-about-row">
          <span class="ss-about-item">{{ t('版本', 'Version') }}: 1.0.0</span>
          <span class="ss-about-item">{{ t('作者', 'Author') }}: DD1024z</span>
          <span class="ss-about-link" (click)="openGithub()">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>
            {{ t('Github源码', 'GitHub Source') }}
          </span>
          <span class="ss-about-link" (click)="openGithub()" style="margin-left:14px;">
            ⭐ {{ t('点赞支持', 'Give a Star') }}
          </span>
        </div>
      </div>

      <!-- 清空数据确认弹窗 -->
      <div class="ss-overlay" *ngIf="showClearConfirm" (click)="closeClearConfirm()">
        <div class="ss-clear-modal" (click)="$event.stopPropagation()">
          <div class="ss-clear-title" style="color:var(--_primary,#e24b4a);">{{ t('⚠️ 清空数据', '⚠️ Clear All Data') }}</div>
          <div class="ss-clear-body">
            <p>{{ t('此操作将删除所有书签、传输记录和设置数据，不可撤销！', 'This will delete all bookmarks, transfer logs, and settings. Cannot be undone!') }}</p>
            <div class="ss-clear-actions">
              <button class="ss-btn ss-btn-danger" (click)="clearData()">{{ t('确认清空', 'Confirm Clear') }}</button>
              <button class="ss-btn" (click)="closeClearConfirm()">{{ t('取消', 'Cancel') }}</button>
            </div>
          </div>
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
    .ss-auto-badge { opacity:.85; color: var(--primary-color, #3b82f6); font-size:11px; }

    .ss-color-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
    .ss-color-swatch {
      display:inline-flex; flex-direction:column; align-items:center; gap:4px;
      padding:8px; border-radius:10px; border:2px solid transparent;
      font-size:12px; font-weight:500; cursor:pointer; transition:border-color .15s;
      min-width:80px;
    }
    .ss-color-swatch:hover { opacity:.85; }
    .ss-color-active { border-color: var(--primary-color,#3b82f6) !important; box-shadow:0 0 0 1px rgba(59,130,246,.3); }
    .ss-color-swatch-name { font-size:11px; font-weight:600; }
    .ss-color-swatch-preview {
      display:flex; flex-direction:column; border-radius:6px; overflow:hidden;
      width:72px; border:1px solid rgba(128,128,128,.2);
    }
    .ss-cp-title { display:block; padding:4px 6px; font-size:9px; font-weight:600; }
    .ss-cp-body { display:block; padding:4px 6px; font-size:8px; font-family:monospace; min-height:18px; }
    .ss-cp-line { display:block; line-height:1.4; }
    .ss-cp-accent { display:inline-block; width:12px; height:3px; border-radius:2px; margin-top:2px; }

    .ss-scheme-preview { margin-top:8px; }
    .ss-color-fields { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; }
    .ss-color-field { display:flex; flex-direction:column; gap:3px; }
    .ss-color-field label { font-size:12px; font-weight:500; }
    .ss-color-input { width:44px; height:30px; border:none; border-radius:6px; cursor:pointer; }
    .ss-color-val { font-size:11px; font-family:monospace; opacity:.6; }

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
    .ss-btn-danger { color: #e24b4a; border-color: rgba(226,75,74,0.3); }
    .ss-btn-danger:hover { background: rgba(226,75,74,0.12); }

    /* 关于 */
    .ss-about-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:13px; }
    .ss-about-item { opacity:.75; }
    .ss-about-link {
      display:inline-flex; align-items:center; gap:4px;
      cursor:pointer; opacity:.7; transition:opacity .15s;
    }
    .ss-about-link:hover { opacity:1; text-decoration:underline; }
    .ss-about-link svg { width:12px; height:12px; vertical-align:middle; }

    /* 清空确认弹窗 */
    .ss-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,0.5);
      display:flex; align-items:center; justify-content:center; z-index:9999;
    }
    .ss-clear-modal {
      background:var(--body-bg,#1a1d23); color:var(--text-color,#e8edf5);
      border:1px solid rgba(128,128,128,0.25); border-radius:12px;
      padding:24px; max-width:400px; width:90%;
    }
    .ss-clear-title { font-size:16px; font-weight:700; margin-bottom:16px; }
    .ss-clear-body p { font-size:13px; line-height:1.6; margin:0 0 16px 0; opacity:.8; }
    .ss-clear-actions { display:flex; gap:8px; justify-content:flex-end; }
    .ss-clear-actions .ss-btn { padding:6px 16px; }

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
  /** 多语言辅助 */
  t(zh: string, en: string): string {
    return this.effectiveLang === 'zh-CN' ? zh : en
  }

  /** 主题颜色标签翻译映射 */
  private readonly themeLabels: Record<string, [string, string]> = {
    '':       ['自动', 'Auto'],
    dark:     ['深色', 'Dark'],
    light:    ['浅色', 'Light'],
    blue:     ['蓝色', 'Blue'],
    green:    ['绿色', 'Green'],
    purple:   ['紫色', 'Purple'],
    red:      ['红色', 'Red'],
    custom:   ['自定义', 'Custom'],
  }

  /** 获取主题颜色的翻译标签 */
  themeLabel(c: { value: string; label: string }): string {
    const pair = this.themeLabels[c.value]
    return pair ? this.t(pair[0], pair[1]) : c.label
  }

  /** 获取色卡预览背景（Auto 用渐变，其他用固定色） */
  swatchPreviewBg(c: { value: string; bg: string }): string {
    if (c.value === '') return 'linear-gradient(135deg, var(--body-bg, #1e1e2e), var(--text-color, #cdd6f4))'
    return c.bg
  }

  /** 界面语言（空 = 自动跟随系统） */
  lang: '' | 'zh-CN' | 'en-US' = (load('lang', '') as string || '') as '' | 'zh-CN' | 'en-US'

  /** 使用界面语言（Auto 模式时检测系统语言） */
  get effectiveLang(): 'zh-CN' | 'en-US' {
    if (this.lang === 'zh-CN' || this.lang === 'en-US') return this.lang
    return detectSystemLocale()
  }

  /** 预设主题（含配色预览色值） */
  colorThemes = [
    { value: '',       label: 'Auto',   bg: '#1e1e2e', text: '#cdd6f4', primary: '#b4befe', surface: '#313244', border: '#585b70', muted: '#6c7086' },
    { value: 'dark',  label: 'Dark',  bg: '#1a1d23', text: '#e8edf5', primary: '#67676f', surface: '#252830', border: '#2d3242', muted: '#5a5f6f' },
    { value: 'light', label: 'Light', bg: '#f0f4f8', text: '#333',    primary: '#2563eb', surface: '#e5e7eb', border: '#d1d5db', muted: '#9ca3af' },
    { value: 'blue',  label: 'Blue',  bg: '#0b1929', text: '#e6f0ff', primary: '#3b9eff', surface: '#0f2035', border: '#1e3a5f', muted: '#5a7ea0' },
    { value: 'green', label: 'Green', bg: '#0a2016', text: '#e8fce8', primary: '#4ade80', surface: '#0e281a', border: '#1a5030', muted: '#4a8a60' },
    { value: 'purple',label: 'Purple',bg: '#160e23', text: '#ebe0fc', primary: '#b794f4', surface: '#1c1430', border: '#3a2558', muted: '#7a5aa0' },
    { value: 'red',   label: 'Red',    bg: '#1a0808', text: '#ffe0dd', primary: '#f87171', surface: '#220a0a', border: '#502020', muted: '#904040' },
    { value: 'custom',label: 'Custom', bg: '#313244', text: '#cdd6f4', primary: '#b4befe', surface: '#45475a', border: '#585b70', muted: '#6c7086' },
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

  /** 主题颜色值（从 localStorage 或预设加载） */
  themePrimary = load('primaryColor', '')
  themeBg = load('bgColor', '')
  themeText = load('textColor', '')
  themeSurface = load('surfaceColor', '')
  themeBorder = load('borderColor', '')
  themeMuted = load('mutedColor', '')

  /** 面板布局 */
  layoutMode: string = load('layoutMode', 'auto')

  /** 表格样式设置 */
  showColBorders = loadTableSetting('colBorders', true)
  showZebra = loadTableSetting('zebra', true)

  ngOnInit(): void {
    const root = document.documentElement

    // Auto 模式下检测当前 Tabby UI 主题
    if (!this.theme) this.detectAutoTheme()

    if (!this.theme) {
      this.clearColorVars()
    } else if (this.theme !== 'custom') {
      const p = this.getPreset(this.theme)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeSurface = p.surface
        this.themeBorder = p.border
        this.themeMuted = p.muted
        this.applyColors(root)
      }
    } else {
      this.applyColors(root)
    }

    // 监听面板上的布局切换 → 同步更新设置页显示
    window.addEventListener('sftp-plus-settings-changed', () => {
      this.layoutMode = load('layoutMode', 'auto')
    })
  }

  saveLang(): void {
    save('lang', this.lang)
    localStorage.setItem('sftp-plus-locale', this.lang)
  }

  private getPreset(value: string): typeof this.colorThemes[0] | undefined {
    return this.colorThemes.find(t => t.value === value)
  }

  private applyColors(root: HTMLElement): void {
    if (!this.themePrimary || !this.themeBg || !this.themeText) return
    root.style.setProperty('--sftp-primary', this.themePrimary)
    root.style.setProperty('--sftp-bg', this.themeBg)
    root.style.setProperty('--sftp-text', this.themeText)
    root.style.setProperty('--sftp-border', this.themeBorder || this.themeSurface)
  }

  private clearColorVars(): void {
    const root = document.documentElement
    root.style.removeProperty('--sftp-primary')
    root.style.removeProperty('--sftp-bg')
    root.style.removeProperty('--sftp-text')
    root.style.removeProperty('--sftp-border')
  }

  setTheme(value: string): void {
    this.theme = value
    save('theme', value)

    const root = document.documentElement
    if (!value) {
      this.clearColorVars()
      this.detectAutoTheme()
      // 加载 Auto 预设色值，让颜色面板有值可显示
      const autoPreset = this.getPreset('')
      if (autoPreset) {
        this.themePrimary = autoPreset.primary
        this.themeBg = autoPreset.bg
        this.themeText = autoPreset.text
        this.themeSurface = autoPreset.surface
        this.themeBorder = autoPreset.border
        this.themeMuted = autoPreset.muted
        this.saveAllColors()
      }
      this.notifyPanels()
      return
    }

    if (value === 'custom') {
      this.applyColors(root)
    } else {
      const p = this.getPreset(value)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeSurface = p.surface
        this.themeBorder = p.border
        this.themeMuted = p.muted
        this.saveAllColors()
        this.applyColors(root)
      }
    }
    this.notifyPanels()
  }

  onColorChange(key: string, val: string): void {
    if (this.theme !== 'custom') {
      const p = this.getPreset(this.theme)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeSurface = p.surface
        this.themeBorder = p.border
        this.themeMuted = p.muted
      }
      this.theme = 'custom'
      save('theme', 'custom')
    }
    // Update the specific color field
    const updates: Record<string, string> = { primary: this.themePrimary, bg: this.themeBg, text: this.themeText,
      surface: this.themeSurface, border: this.themeBorder, muted: this.themeMuted }
    updates[key] = val
    this.themePrimary = updates.primary
    this.themeBg = updates.bg
    this.themeText = updates.text
    this.themeSurface = updates.surface
    this.themeBorder = updates.border
    this.themeMuted = updates.muted
    this.saveAllColors()
    this.applyColors(document.documentElement)
    this.notifyPanels()
  }

  private saveAllColors(): void {
    save('primaryColor', this.themePrimary)
    save('bgColor', this.themeBg)
    save('textColor', this.themeText)
    save('surfaceColor', this.themeSurface)
    save('borderColor', this.themeBorder)
    save('mutedColor', this.themeMuted)
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

  /** 清除确认弹窗是否显示 */
  showClearConfirm = false

  openClearConfirm(): void { this.showClearConfirm = true }
  closeClearConfirm(): void { this.showClearConfirm = false }

  /** 清空所有 SFTP+ 数据 */
  clearData(): void {
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('sftp-plus-')) keys.push(key)
      }
      for (const key of keys) localStorage.removeItem(key)
      this.showClearConfirm = false
      const msg = this.t('已清空所有数据', 'All data cleared')
      alert(msg)
      this.notifyPanels()
    } catch (e) {
      console.error('[SFTP+] Clear data failed', e)
    }
  }

  openGithub(): void {
    const url = 'https://github.com/10D24D/Tabby-SFTP-Plus'
    try {
      ;(window as any).require('electron').shell.openExternal(url)
    } catch {
      try { window.open(url, '_blank') } catch { /* ignore */ }
    }
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

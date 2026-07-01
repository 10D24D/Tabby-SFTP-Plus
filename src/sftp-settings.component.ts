/**
 * SFTP+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 SFTP+ 配置入口（语言、主题、布局、数据、关于）
 *   支持双存储模式：Tabby 配置（config.yaml）或 浏览器缓存（localStorage）
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
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 添加双存储模式（Tabby 配置 / 浏览器缓存），默认使用 Tabby 配置
 */
import { Component, Injectable, Optional } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { ConfigService } from 'tabby-core'
import { defaultSftpPlusConfig } from './sftp-config-provider'

/**
 * 检测 Tabby 实际使用的系统语言（优先读取 Tabby config.yaml）
 * 返回 'zh-CN' 或 'en-US'
 */
function detectSystemLocale(): 'zh-CN' | 'en-US' {
  // 策略1: 读取 Tabby config.yaml（最准确，反映用户实际设置）
  try {
    // 仅在 Electron/Node 环境中可用
    if (typeof require !== 'undefined') {
      const fs = require('fs')
      const path = require('path')
      const os = require('os')
      const home = os.homedir()
      const configDir = process.platform === 'win32'
        ? (process.env.APPDATA || path.join(home, 'AppData', 'Roaming'))
        : process.platform === 'darwin'
          ? path.join(home, 'Library', 'Application Support')
          : path.join(home, '.config')
      const configPath = path.join(configDir, 'tabby', 'config.yaml')
      const raw = fs.readFileSync(configPath, 'utf-8')
      const match = raw.match(/^language\s*:\s*['"]?([a-zA-Z-]+)['"]?\s*$/m)
      if (match) {
        const lang = match[1]
        if (/^zh/i.test(lang)) return 'zh-CN'
        if (/^en/i.test(lang)) return 'en-US'
      }
    }
  } catch {}

  // 策略2: Tabby localStorage（多种可能的 key）
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

  // 策略3: navigator.languages 数组
  try {
    const langs = navigator.languages || [navigator.language]
    const zhLang = langs.find(l => /^zh/i.test(l))
    if (zhLang) return 'zh-CN'
  } catch (e) {}

  // 策略4: navigator.language 单值
  try {
    const navLang = navigator.language || ''
    if (navLang) return /^zh/i.test(navLang) ? 'zh-CN' : 'en-US'
  } catch (e) {}

  // 默认返回英文
  return 'en-US'
}

/** 本地存储的 key 前缀（仅浮层面板缓存和旧版兼容，不再用于设置数据） */
const PREFIX = 'sftp-plus-settings'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

/** @deprecated 存储已迁移到 Tabby 配置，保留为占位避免编译错误 */
function save(_key: string, _value: unknown): void {}

const TABLE_SETTINGS_KEY = 'sftp-plus-table'

function loadTableSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`${TABLE_SETTINGS_KEY}.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

/** @deprecated 存储已迁移到 Tabby 配置，保留为占位避免编译错误 */
function saveTableSetting(_key: string, _value: boolean): void {}


@Component({
  template: `
    <div class="sftp-settings-page">
      <h3 class="ss-title">SFTP+</h3>
      <p class="ss-desc">{{ t('SFTP+ 双栏文件管理器，管理远程和本地文件。', 'SFTP+ dual-pane file manager. Manage remote and local files.') }}</p>

      <!-- 语言 -->
      <div class="ss-section">
        <label class="ss-label">{{ effectiveLang === 'zh-CN' ? '语言' : 'Language' }}</label>
        <select [(ngModel)]="lang" (ngModelChange)="saveLang()" class="ss-select">
          <option value="">{{ effectiveLang === 'zh-CN' ? '跟随Tabby' : 'Follow Tabby' }}</option>
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
              <span class="ss-cp-pane">
                <span class="ss-cp-header" [style.background]="swatchCustomSurface(c)" [style.color]="swatchCustomText(c)">
                  <span class="ss-cp-hdot" [style.background]="swatchCustomText(c)"></span>
                  <span class="ss-cp-hdot" [style.background]="swatchCustomText(c)"></span>
                  <span class="ss-cp-hdot" [style.background]="swatchCustomText(c)"></span>
                  <span class="ss-cp-hpath" [style.background]="swatchCustomBorder ? swatchCustomBorder(c) : ''"></span>
                </span>
                <span class="ss-cp-rows" [style.borderColor]="swatchCustomBorder ? swatchCustomBorder(c) : ''">
                  <span class="ss-cp-row">
                    <span class="ss-cp-icon" [style.background]="swatchCustomPrimary(c)"></span>
                    <span class="ss-cp-fname" [style.background]="swatchCustomText(c)"></span>
                    <span class="ss-cp-fsize" [style.background]="swatchCustomMuted(c)"></span>
                  </span>
                  <span class="ss-cp-row">
                    <span class="ss-cp-icon" [style.background]="swatchCustomPrimary(c)"></span>
                    <span class="ss-cp-fname" [style.background]="swatchCustomText(c)"></span>
                    <span class="ss-cp-fsize" [style.background]="swatchCustomMuted(c)"></span>
                  </span>
                  <span class="ss-cp-row">
                    <span class="ss-cp-icon" [style.background]="swatchCustomPrimary(c)"></span>
                    <span class="ss-cp-fname" [style.background]="swatchCustomText(c)"></span>
                    <span class="ss-cp-fsize" [style.background]="swatchCustomMuted(c)"></span>
                  </span>
                </span>
              </span>
            </span>
          </label>
        </div>

        <!-- 配色方案详情 -->
        <div class="ss-scheme-preview" *ngFor="let c of colorThemes" [hidden]="theme !== c.value">
          <div class="ss-color-fields">
            <div class="ss-color-field">
              <label>{{ t('主色调', 'Primary') }}</label>
              <input type="color" [ngModel]="themePrimary" (change)="onColorChange('primary', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themePrimary }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('背景', 'Bg') }}</label>
              <input type="color" [ngModel]="themeBg" (change)="onColorChange('bg', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBg }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('文字', 'Text') }}</label>
              <input type="color" [ngModel]="themeText" (change)="onColorChange('text', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeText }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ t('边框', 'Border') }}</label>
              <input type="color" [ngModel]="themeBorder" (change)="onColorChange('border', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBorder }}</span>
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
        <div class="ss-toggle-wrap">
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ effectiveLang === 'zh-CN' ? '显示边框' : 'Show border' }}</span>
            <span class="ss-toggle-track" [class.active]="showColBorders" (click)="showColBorders=!showColBorders; saveTableSettings()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ effectiveLang === 'zh-CN' ? '显示斑马纹' : 'Show zebra stripes' }}</span>
            <span class="ss-toggle-track" [class.active]="showZebra" (click)="showZebra=!showZebra; saveTableSettings()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
        </div>
      </div>

      <!-- 数据 -->
      <div class="ss-section">
        <label class="ss-label">{{ t('数据', 'Data') }}</label>

        <!-- 数据导入导出 -->
        <div class="ss-backup-row">
          <button class="ss-btn" (click)="exportData()">[&darr;] {{ t('导出数据', 'Export') }}</button>
          <label class="ss-btn ss-btn-import">[&uarr;] {{ t('导入数据', 'Import') }}
            <input type="file" accept=".json" (change)="importData($event)" style="display:none" />
          </label>
          <button class="ss-btn ss-btn-danger" (click)="openClearConfirm()">[&times;] {{ t('清空数据', 'Clear All') }}</button>
        </div>
      </div>

      <!-- 兼容性 -->
      <div class="ss-section">
        <label class="ss-label">{{ t('兼容性', 'Compatibility') }}</label>
        <div class="ss-toggle-wrap">
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ t('隐藏原生 SFTP 按钮', 'Hide native SFTP button') }}</span>
            <span class="ss-toggle-track" [class.active]="hideNativeBtn" (click)="toggleHideNativeBtn()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
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
          <span class="ss-about-link" (click)="openGithub()">
            ⭐ {{ t('点赞支持', 'Give a Star') }}
          </span>
          <span class="ss-about-link" (click)="openFeedback()">
            💬 {{ t('意见反馈', 'Feedback') }}
          </span>
        </div>
      </div>

      <!-- 主题颜色修改确认弹窗 -->
      <div class="ss-overlay" *ngIf="showThemeColorConfirm" (click)="cancelThemeColorOverwrite()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title">{{ t('⚠️ 修改配色', '⚠️ Modify Colors') }}</div>
          <div class="ss-edit-field">
            <p>{{ t('当前为自动/预设模式，修改将覆盖到自定义配色方案中。是否继续？', 'You are in Auto/Preset mode. Changes will overwrite the custom color scheme. Continue?') }}</p>
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn ss-btn-danger" (click)="confirmThemeColorOverwrite()">{{ t('确认覆盖', 'Overwrite') }}</button>
            <button class="ss-btn" (click)="cancelThemeColorOverwrite()">{{ t('取消', 'Cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- 清空数据确认弹窗 -->
      <div class="ss-overlay" *ngIf="showClearConfirm" (click)="closeClearConfirm()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title" style="color:var(--primary-color,#e24b4a);">{{ t('⚠️ 清空数据', '⚠️ Clear All Data') }}</div>
          <div class="ss-edit-field">
            <p>
              {{ t('此操作将删除所有书签、传输记录和设置数据，不可撤销！', 'This will delete all bookmarks, transfer logs, and settings. Cannot be undone!') }}
            </p>
            <label>{{ t('请输入 DELETE 确认：', 'Please type DELETE to confirm:') }}</label>
            <input class="ss-edit-input" type="text" [(ngModel)]="clearConfirmInput"
              (keydown.enter)="doClearData()" placeholder="DELETE" />
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn ss-btn-danger" (click)="doClearData()"
              [style.opacity]="clearConfirmInput !== 'DELETE' ? '0.5' : '1'"
              [disabled]="clearConfirmInput !== 'DELETE'">{{ t('清空', 'Clear') }}</button>
            <button class="ss-btn" (click)="closeClearConfirm()">{{ t('取消', 'Cancel') }}</button>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .sftp-settings-page { padding:20px; max-width:600px; }
    .ss-title { color:var(--primary-color,#3b82f6); font-size:18px; margin-bottom:6px; }
    .ss-desc { opacity:.7; font-size:13px; line-height:1.6; margin-bottom:24px; }
    .ss-section { border-top:1px solid rgba(128,128,128,0.2); padding-top:16px; margin-bottom:16px; }
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
      width:86px; border:1px solid rgba(128,128,128,.2);
    }
    /* 迷你面板预览 */
    .ss-cp-pane { display:flex; flex-direction:column; flex:1; }
    .ss-cp-header { display:flex; align-items:center; gap:3px; padding:4px 6px; }
    .ss-cp-hdot { width:5px; height:5px; border-radius:50%; opacity:0.5; flex-shrink:0; }
    .ss-cp-hpath { flex:1; height:3px; border-radius:2px; opacity:0.25; min-width:0; }
    .ss-cp-rows { display:flex; flex-direction:column; gap:2px; padding:3px 4px; border-top:1px solid transparent; }
    .ss-cp-row { display:flex; align-items:center; gap:3px; }
    .ss-cp-icon { width:8px; height:8px; border-radius:2px; opacity:0.7; flex-shrink:0; }
    .ss-cp-fname { flex:1; height:3px; border-radius:2px; opacity:0.5; min-width:0; }
    .ss-cp-fsize { width:18px; height:3px; border-radius:2px; opacity:0.3; flex-shrink:0; }

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

    /* 表格样式 - Tabby 风格开关 */
    .ss-toggle-wrap { display:flex; flex-direction:column; gap:4px; margin-top:8px; }
    .ss-toggle-row {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 10px; border-radius:6px;
      font-size:13px; cursor:pointer; user-select:none;
    }
    .ss-toggle-row:hover { background:rgba(128,128,128,0.06); }
    .ss-toggle-label { font-size:13px; line-height:1.4; }
    .ss-toggle-track {
      position:relative; flex-shrink:0;
      width:36px; height:20px; border-radius:10px;
      background:rgba(128,128,128,0.25);
      transition:background .2s; cursor:pointer;
    }
    .ss-toggle-track.active { background:var(--primary-color,#3b82f6); }
    .ss-toggle-thumb {
      position:absolute; top:2px; left:2px;
      width:16px; height:16px; border-radius:50%;
      background:#fff; transition:transform .2s;
    }
    .ss-toggle-track.active .ss-toggle-thumb { transform:translateX(16px); }

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

    /* 确认弹窗 - 统一使用 ss-edit-* 类名（与 QC+ 同步） */
    .ss-overlay {
      position:fixed; inset:0; background:rgba(0,0,0,0.5);
      display:flex; align-items:center; justify-content:center; z-index:9999;
    }
    .ss-edit-modal {
      background:var(--body-bg,#1a1d23); color:var(--text-color,#e8edf5);
      border:1px solid rgba(128,128,128,0.25); border-radius:12px;
      padding:24px; max-width:400px; width:90%;
    }
    .ss-edit-modal.ss-dark { color:#fff; }
    .ss-edit-modal.ss-light { color:#222; }
    .ss-edit-modal p, .ss-edit-modal label { color:inherit; font-size:13px; line-height:1.6; }
    .ss-edit-modal p { margin:0 0 12px 0; }
    .ss-edit-modal label { font-size:12px; opacity:.8; display:block; margin-bottom:6px; }
    .ss-edit-title { font-size:16px; font-weight:700; margin-bottom:16px; color:inherit; }
    .ss-edit-field { margin-bottom:16px; }
    .ss-edit-input {
      width:100%; padding:8px 12px; border-radius:6px;
      border:1px solid rgba(128,128,128,0.3);
      background:rgba(0,0,0,0.2); color:inherit; font-size:13px; outline:none;
      box-sizing:border-box;
    }
    .ss-edit-input:focus { border-color:var(--primary-color,#3b82f6); }
    .ss-edit-footer { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }

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
    if (c.value === 'custom') {
      // 自定义主题：从 localStorage 读取实际保存的配色
      const savedBg = load('bgColor', '')
      return savedBg || c.bg
    }
    return c.bg
  }

  /** 自定义主题预览色：主色 */
  swatchCustomPrimary(c: { value: string; primary?: string }): string {
    if (c.value === 'custom') {
      const saved = load('primaryColor', '')
      return saved || c.primary || 'var(--primary-color, #3b82f6)'
    }
    return c.primary || 'var(--primary-color, #3b82f6)'
  }

  /** 自定义主题预览色：表面色（仅预设主题使用，自定义主题使用 bg） */
  swatchCustomSurface(c: { value: string; surface?: string; bg?: string }): string {
    if (c.value === 'custom') return c.bg || '#313244'
    return c.surface || c.bg || '#313244'
  }

  /** 自定义主题预览色：文字色 */
  swatchCustomText(c: { value: string; text: string }): string {
    if (c.value === 'custom') {
      const saved = load('textColor', '')
      return saved || c.text
    }
    return c.text
  }

  /** 自定义主题预览色：弱化色（仅预设主题使用，自定义主题降低文字透明度） */
  swatchCustomMuted(c: { value: string; muted?: string; text: string }): string {
    if (c.value === 'custom') return c.text  // 无 muted 设置，直接用文字色
    return c.muted || c.text
  }

  /** 自定义主题预览色：边框色 */
  swatchCustomBorder(c: { value: string; border?: string }): string {
    if (c.value === 'custom') {
      const saved = load('borderColor', '')
      return saved || c.border || ''
    }
    return c.border || ''
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
    { value: 'dark',  label: 'Dark',  bg: '#1a1d23', text: '#e8edf5', primary: '#b6b6c3', surface: '#252830', border: '#2d3242', muted: '#5a5f6f' },
    { value: 'light', label: 'Light', bg: '#f0f4f8', text: '#333333', primary: '#2563eb', surface: '#e5e7eb', border: '#d1d5db', muted: '#9ca3af' },
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

  /** 判断当前是否为深色模式（读取 Tabby CSS 变量亮度） */
  get isDarkMode(): boolean {
    try {
      const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
      if (textColor) {
        const lum = this._parseColorLuminance(textColor)
        if (lum >= 0) return lum > 128
      }
      // --text-color 不可用 → 尝试 --body-bg
      const bodyBg = getComputedStyle(document.documentElement).getPropertyValue('--body-bg').trim()
      if (bodyBg) {
        const lum = this._parseColorLuminance(bodyBg)
        if (lum >= 0) return lum < 128  // 背景暗 → 深色模式
      }
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  /** 解析 CSS 颜色值为亮度（0-255），无法解析返回 -1 */
  private _parseColorLuminance(color: string): number {
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
  themeBorder = load('borderColor', '')

  /** 面板布局 */
  layoutMode: string = load('layoutMode', 'auto')

  /** 表格样式设置 */
  showColBorders = loadTableSetting('colBorders', false)
  showZebra = loadTableSetting('zebra', false)

  /** 隐藏原生 SFTP 按钮 */
  hideNativeBtn = load('hideNativeBtn', false)

  /** 主题颜色修改确认弹窗 */
  showThemeColorConfirm = false
  /** 待提交的颜色修改 */
  private _pendingColorKey = ''
  private _pendingColorVal = ''
  /** 发起修改时的主题模式（弹窗确认后用于复制色值） */
  private _pendingOrigTheme = ''

  /** 存储模式：仅使用 Tabby 配置存储 */
  storageMode = 'config'

  constructor(@Optional() public configService?: ConfigService) {
    // ConfigService 是可选的，如果注入失败（开发环境/Tabby 版本不支持），回退到 localStorage
  }

  ngOnInit(): void {
    const root = document.documentElement

    // 从 Tabby 配置加载存储的设置
    this._readFromConfig()

    // Auto 模式下检测当前 Tabby UI 主题，并加载对应预设色值
    if (!this.theme) {
      this.detectAutoTheme()
      const autoPreset = this.detectedAutoTheme === 'light' ? this.getPreset('light') : this.getPreset('dark')
      if (autoPreset) {
        this.themePrimary = autoPreset.primary
        this.themeBg = autoPreset.bg
        this.themeText = autoPreset.text
        this.themeBorder = autoPreset.border
      }
      this.clearColorVars()
    } else if (this.theme !== 'custom') {
      const p = this.getPreset(this.theme)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeBorder = p.border
        this.applyColors(root)
      }
    } else {
      // 自定义主题：从 localStorage 恢复自定义颜色（config 可能被预定义主题覆盖）
      this._restoreCustomColors()
      this.applyColors(root)
    }

    // 监听面板上的布局切换 → 同步更新设置页显示
    window.addEventListener('sftp-plus-settings-changed', () => {
      this.layoutMode = load('layoutMode', 'auto')
    })
  }

  /** 从 Tabby 配置加载所有设置 */
  private _readFromConfig(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (!cfg) return
      if (cfg.lang !== undefined) this.lang = cfg.lang as '' | 'zh-CN' | 'en-US'
      if (cfg.layoutMode !== undefined) this.layoutMode = cfg.layoutMode as string
      if (cfg.theme !== undefined) this.theme = cfg.theme as string
      if (cfg.colorPrimary !== undefined) this.themePrimary = cfg.colorPrimary as string
      if (cfg.colorBg !== undefined) this.themeBg = cfg.colorBg as string
      if (cfg.colorText !== undefined) this.themeText = cfg.colorText as string
      if (cfg.colorBorder !== undefined) this.themeBorder = cfg.colorBorder as string
      if (cfg.tableColBorders !== undefined) this.showColBorders = cfg.tableColBorders as boolean
      if (cfg.tableZebra !== undefined) this.showZebra = cfg.tableZebra as boolean
      if (cfg.hideNativeSFTPButton !== undefined) this.hideNativeBtn = cfg.hideNativeSFTPButton as boolean
    } catch { /* ignore */ }
  }

  /**
   * 写入 Tabby config（per-property update 避免 ConfigProxy 覆盖问题）
   */
  private _saveToConfig(): void {
    if (!this.configService) return
    try {
      const target = this.configService.store['tabby-sftp-plus']
      if (!target) return  // 配置段未就绪，静默跳过
      target.lang = this.lang
      target.layoutMode = this.layoutMode
      target.theme = this.theme
      target.colorPrimary = this.themePrimary
      target.colorBg = this.themeBg
      target.colorText = this.themeText
      target.colorBorder = this.themeBorder
      target.tableColBorders = this.showColBorders
      target.tableZebra = this.showZebra
      target.hideNativeSFTPButton = this.hideNativeBtn
      this.configService.save()
    } catch (e) {
      console.error('[SFTP+] Failed to save to config', e)
    }
  }

  /**
   * 迁移数据：localStorage ↔ config.store（切换存储模式时调用）
   */
  saveLang(): void {
    this._saveToConfig()
  }

  private getPreset(value: string): typeof this.colorThemes[0] | undefined {
    return this.colorThemes.find(t => t.value === value)
  }

  private applyColors(root: HTMLElement): void {
    if (!this.themePrimary || !this.themeBg || !this.themeText) return
    root.style.setProperty('--sftp-primary', this.themePrimary)
    root.style.setProperty('--sftp-bg', this.themeBg)
    root.style.setProperty('--sftp-text', this.themeText)
    root.style.setProperty('--sftp-border', this.themeBorder || '')
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
      // 加载检测到的明/暗模式的预设色值，让颜色面板有值可显示
      const autoPreset = this.detectedAutoTheme === 'light' ? this.getPreset('light') : this.getPreset('dark')
      if (autoPreset) {
        this.themePrimary = autoPreset.primary
        this.themeBg = autoPreset.bg
        this.themeText = autoPreset.text
        this.themeBorder = autoPreset.border
        // 不保存到 localStorage，避免覆盖自定义配色缓存
      }
      this._saveToConfig()
      this.notifyPanels()
      return
    }

    if (value === 'custom') {
      // 从 localStorage 恢复自定义配色
      this._restoreCustomColors()
      this.applyColors(root)
      this.saveAllColors()
    } else {
      const p = this.getPreset(value)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeBorder = p.border
        // 不保存到 localStorage，避免覆盖自定义配色缓存
        this.applyColors(root)
      }
      this._saveToConfig()
    }
    this.notifyPanels()
  }

  onColorChange(key: string, val: string): void {
    if (this.theme !== 'custom') {
      // 非自定义模式：记录待修改值，弹窗询问
      this._pendingColorKey = key
      this._pendingColorVal = val
      this._pendingOrigTheme = this.theme
      this.showThemeColorConfirm = true
      return
    }
    // Update the specific color field
    const updates: Record<string, string> = { primary: this.themePrimary, bg: this.themeBg, text: this.themeText, border: this.themeBorder }
    updates[key] = val
    this.themePrimary = updates.primary
    this.themeBg = updates.bg
    this.themeText = updates.text
    this.themeBorder = updates.border
    this.saveAllColors()
    this.applyColors(document.documentElement)
    this.notifyPanels()
  }

  private saveAllColors(): void {
    // 写入 localStorage（load() 依赖 localStorage 读取）
    try { localStorage.setItem(`${PREFIX}.primaryColor`, JSON.stringify(this.themePrimary)) } catch {}
    try { localStorage.setItem(`${PREFIX}.bgColor`, JSON.stringify(this.themeBg)) } catch {}
    try { localStorage.setItem(`${PREFIX}.textColor`, JSON.stringify(this.themeText)) } catch {}
    try { localStorage.setItem(`${PREFIX}.borderColor`, JSON.stringify(this.themeBorder)) } catch {}
    this._saveToConfig()
  }

  /** 从 localStorage 恢复自定义配色（config 中可能被预定义主题覆盖） */
  private _restoreCustomColors(): void {
    const savedPrimary = load('primaryColor', '')
    if (savedPrimary) {
      this.themePrimary = savedPrimary
      this.themeBg = load('bgColor', '#313244')
      this.themeText = load('textColor', '#cdd6f4')
      this.themeBorder = load('borderColor', '#585b70')
    }
  }

  saveTableSettings(): void {
    // 写入 localStorage 供浮动面板读取（面板不支持直接从 config 读取）
    try { localStorage.setItem('sftp-plus-table.colBorders', JSON.stringify(this.showColBorders)) } catch {}
    try { localStorage.setItem('sftp-plus-table.zebra', JSON.stringify(this.showZebra)) } catch {}
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 切换隐藏原生 SFTP 按钮 */
  toggleHideNativeBtn(): void {
    this.hideNativeBtn = !this.hideNativeBtn
    save('hideNativeBtn', this.hideNativeBtn)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 确认：将自动/预设配色复制到自定义并应用修改 */
  confirmThemeColorOverwrite(): void {
    // 加载原始主题的预设色值
    const orig = this._pendingOrigTheme
    let p: typeof this.colorThemes[0] | undefined
    if (!orig) {
      // Auto 模式：使用检测到的明/暗预设
      const themeName = this.detectedAutoTheme === 'light' ? 'light' : 'dark'
      p = this.getPreset(themeName)
    } else {
      p = this.getPreset(orig)
    }
    if (p) {
      this.themePrimary = p.primary
      this.themeBg = p.bg
      this.themeText = p.text
      this.themeBorder = p.border
    }
    this.theme = 'custom'
    save('theme', 'custom')
    // 应用待修改的颜色值
    const updates: Record<string, string> = { primary: this.themePrimary, bg: this.themeBg, text: this.themeText, border: this.themeBorder }
    updates[this._pendingColorKey] = this._pendingColorVal
    this.themePrimary = updates.primary
    this.themeBg = updates.bg
    this.themeText = updates.text
    this.themeBorder = updates.border
    this.saveAllColors()
    this.applyColors(document.documentElement)
    this.notifyPanels()
    this.showThemeColorConfirm = false
  }

  /** 取消：关闭弹窗，不应用修改 */
  cancelThemeColorOverwrite(): void {
    this.showThemeColorConfirm = false
    this._pendingColorKey = ''
    this._pendingColorVal = ''
    // 恢复颜色输入框显示（强制刷新 ngModel 绑定）
    this._refreshColorInputs()
  }

  /** 刷新颜色输入框，确保取消后恢复到原值 */
  private _refreshColorInputs(): void {
    // 从当前主题预设或缓存重新加载颜色值
    if (!this.theme || this.theme === 'custom') {
      // custom 模式下从 localStorage 加载
      this.themePrimary = load('primaryColor', this.themePrimary)
      this.themeBg = load('bgColor', this.themeBg)
      this.themeText = load('textColor', this.themeText)
      this.themeBorder = load('borderColor', this.themeBorder)
    } else {
      // 预设模式从预设值重新加载
      const p = this.getPreset(this.theme)
      if (p) {
        this.themePrimary = p.primary
        this.themeBg = p.bg
        this.themeText = p.text
        this.themeBorder = p.border
      }
    }
  }

  setLayoutMode(mode: string): void {
    this.layoutMode = mode
    this.saveLayoutMode()
  }

  saveLayoutMode(): void {
    save('layoutMode', this.layoutMode)
    try { localStorage.setItem('sftp-plus-layout-mode', this.layoutMode) } catch {}
    this._saveToConfig()
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
  /** 收集所有 SFTP+ 设置数据（优先从 config.store） */
  private collectAllData(): Record<string, unknown> {
    const data: Record<string, unknown> = {}

    // 从 config.store 读取
    if (this.configService?.store) {
      try {
        const cfg = this.configService.store['tabby-sftp-plus']
        if (cfg) {
          data.lang = cfg.lang ?? ''
          data.layoutMode = cfg.layoutMode ?? 'auto'
          data.theme = cfg.theme ?? ''
          data.colorPrimary = cfg.colorPrimary ?? ''
          data.colorBg = cfg.colorBg ?? ''
          data.colorText = cfg.colorText ?? ''
          data.colorBorder = cfg.colorBorder ?? ''
          data.tableColBorders = cfg.tableColBorders ?? true
          data.tableZebra = cfg.tableZebra ?? true
          data.hideNativeSFTPButton = cfg.hideNativeSFTPButton ?? false
          // 导出书签、传输记录、路径记忆
          if (cfg.bookmarks?.length) data.bookmarks = cfg.bookmarks
          if (cfg.transferLogs?.length) data.transferLogs = cfg.transferLogs
          if (cfg.pathMemory && Object.keys(cfg.pathMemory).length) data.pathMemory = cfg.pathMemory
          return data
        }
      } catch { /* ignore */ }
    }

    // 回退：从 localStorage 读取
    data.lang = load('lang', '')
    data.layoutMode = load('layoutMode', 'auto')
    data.theme = load('theme', '')
    data.colorPrimary = load('primaryColor', '')
    data.colorBg = load('bgColor', '')
    data.colorText = load('textColor', '')
    data.colorBorder = load('borderColor', '')
    data.tableColBorders = loadTableSetting('colBorders', false)
    data.tableZebra = loadTableSetting('zebra', true)
    data.hideNativeSFTPButton = load('hideNativeBtn', false)
    // 尝试从 localStorage 读取书签和传输日志
    try {
      const bkm = localStorage.getItem('sftp-plus-bookmarks-v2')
      if (bkm) data.bookmarks = JSON.parse(bkm)
    } catch {}
    try {
      const logs = localStorage.getItem('sftp-plus-transfer-logs')
      if (logs) data.transferLogs = JSON.parse(logs)
    } catch {}
    return data
  }

  /** 导出数据为 JSON 文件 */
  exportData(): void {
    const data = this.collectAllData()
    const json = JSON.stringify({ 'tabby-sftp-plus': data }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    a.download = `sftp-plus_backup_${ts}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 从 JSON 文件导入数据并写入 Tabby config
   * 写入保护：使用 per-property update 避免 ConfigProxy 值删除
   */
  importData(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)

        // 格式校验：兼容新格式（带标识）和旧格式（扁平结构）
        let data = json['tabby-sftp-plus']
        if (!data || typeof data !== 'object') {
          // 拒绝 QuickCmd+ 数据（新格式标识或旧格式前缀）
          if (json['tabby-quick-command-plus'] || json['commands'] || json['groups'] || Object.keys(json).some(k => k.startsWith('qc-plus-'))) {
            throw new Error(this.t('无效的数据格式。', 'Invalid data format.'))
          }
          // 旧格式兼容：扁平结构直接使用（含 prefixed localStorage 格式转换）
          if (Object.keys(json).some(k => k.startsWith('sftp-plus-'))) {
            data = this._convertOldPrefixedFormat(json)
          } else {
            data = json
          }
        }

        // 写入 config.store（per-property update 写入保护）
        if (this.configService?.store) {
          const target = this.configService.store['tabby-sftp-plus']
          if (data.lang !== undefined) target.lang = data.lang
          if (data.layoutMode !== undefined) target.layoutMode = data.layoutMode
          if (data.theme !== undefined) target.theme = data.theme
          if (data.colorPrimary !== undefined) target.colorPrimary = data.colorPrimary
          if (data.colorBg !== undefined) target.colorBg = data.colorBg
          if (data.colorText !== undefined) target.colorText = data.colorText
          if (data.colorBorder !== undefined) target.colorBorder = data.colorBorder
          if (data.tableColBorders !== undefined) target.tableColBorders = data.tableColBorders
          if (data.tableZebra !== undefined) target.tableZebra = data.tableZebra
          if (data.hideNativeSFTPButton !== undefined) target.hideNativeSFTPButton = data.hideNativeSFTPButton
          // 导入书签、传输记录、路径记忆
          if (data.bookmarks !== undefined) target.bookmarks = data.bookmarks
          if (data.transferLogs !== undefined) target.transferLogs = data.transferLogs
          if (data.pathMemory !== undefined) target.pathMemory = data.pathMemory
          this.configService.save()
          alert(this.t('数据导入完成。', 'Import complete.'))
        } else {
          alert(this.t('无法导入：ConfigService 不可用。', 'Cannot import: ConfigService not available.'))
        }

        // 刷新当前组件属性
        this.ngOnInit()
        this.notifyPanels()
      } catch (e: any) {
        alert(e?.message || this.t('导入失败：文件格式错误或已损坏。', 'Import failed: invalid or corrupted file.'))
      }
    }
    reader.readAsText(file)
    input.value = ''
  }

  /** 清除确认弹窗是否显示 */
  showClearConfirm = false
  clearConfirmInput = ''

  openClearConfirm(): void {
    this.clearConfirmInput = ''
    this.showClearConfirm = true
    setTimeout(() => {
      const input = document.querySelector('.ss-edit-modal .ss-edit-input') as HTMLInputElement | null
      if (input) input.focus()
    }, 50)
  }
  closeClearConfirm(): void { this.showClearConfirm = false; this.clearConfirmInput = '' }

  /** 清空所有 SFTP+ 数据（需输入 DELETE 确认） */
  doClearData(): void {
    if (this.clearConfirmInput !== 'DELETE') return
    this.showClearConfirm = false
    this.clearConfirmInput = ''
    try {
      // 重置 config.store 为默认值
      if (this.configService?.store) {
        const target = this.configService.store['tabby-sftp-plus']
        const defaults = defaultSftpPlusConfig()
        for (const k of Object.keys(defaults)) {
          target[k] = defaults[k]
        }
        this.configService.save()
      }
      // 重置组件状态到默认值并刷新
      this.ngOnInit()
      this.notifyPanels()
      const msg = this.t('已清空所有数据', 'All data cleared')
      alert(msg)
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

  openFeedback(): void {
    const url = 'https://github.com/10D24D/Tabby-SFTP-Plus/issues'
    try {
      ;(window as any).require('electron').shell.openExternal(url)
    } catch {
      try { window.open(url, '_blank') } catch { /* ignore */ }
    }
  }

  /** 转换旧版 prefixed localStorage 格式到新版扁平字段 */
  private _convertOldPrefixedFormat(old: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {}
    const map: Record<string, string> = {
      'sftp-plus-settings.lang': 'lang',
      'sftp-plus-settings.theme': 'theme',
      'sftp-plus-settings.layoutMode': 'layoutMode',
      'sftp-plus-settings.primaryColor': 'colorPrimary',
      'sftp-plus-settings.bgColor': 'colorBg',
      'sftp-plus-settings.textColor': 'colorText',
      'sftp-plus-settings.surfaceColor': 'colorSurface',
      'sftp-plus-settings.borderColor': 'colorBorder',
      'sftp-plus-settings.customPrimaryColor': 'customPrimaryColor',
      'sftp-plus-settings.customBgColor': 'customBgColor',
      'sftp-plus-settings.customTextColor': 'customTextColor',
      'sftp-plus-settings.customBorderColor': 'customBorderColor',
      'sftp-plus-settings.customMutedColor': 'customMutedColor',
      'sftp-plus-layout-mode': 'layoutMode',
      'sftp-plus-table.colBorders': 'tableColBorders',
      'sftp-plus-table.zebra': 'tableZebra',
    }
    for (const [oldKey, newKey] of Object.entries(map)) {
      if (old[oldKey] !== undefined) out[newKey] = old[oldKey]
    }
    // 书签
    if (old['sftp-plus-bookmarks-v2']) out.bookmarks = old['sftp-plus-bookmarks-v2']
    // 传输日志（兼容两种旧版 key：sftp-plus-transfer-log / sftp-plus-transfer-logs）
    if (old['sftp-plus-transfer-logs']) out.transferLogs = old['sftp-plus-transfer-logs']
    else if (old['sftp-plus-transfer-log']) out.transferLogs = old['sftp-plus-transfer-log']
    return out
  }
}

@Injectable()
export class SftpSettingsTabProvider extends SettingsTabProvider {
  id = 'sftp-settings'
  icon = 'folder-open'
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
        icon: 'folder-open',
        weight: 99,
        component: SftpSettingsTabComponent,
      },
    ]
  }
}

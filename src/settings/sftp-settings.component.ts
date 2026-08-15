/**
 * SFTP+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 SFTP+ 配置入口（语言、主题、布局、其它、数据、关于）
 *   支持双存储模式：Tabby 配置（config.yaml）或 浏览器缓存（localStorage）
 * 创建人：DD1024z + Hy3 preview
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-29
 */
import { Component, Injectable, Optional, OnDestroy } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { ConfigService, HotkeysService } from 'tabby-core'
import { defaultSftpPlusConfig } from '../tabby/config-provider'
import { SftpI18nService } from '../services/sftp-i18n.service'
import type { Locale } from '../services/sftp-i18n.service'
import { SFTP_PLUS_TOGGLE_HOTKEY } from '../tabby/hotkey-provider'
import {
  findHotkeyConflicts,
  formatHotkeyBinding,
  getKeystrokeNameFromEvent,
  isHotkeyRecordingActive,
  readToggleHotkeyBindings,
  setHotkeyRecordingActive,
  type HotkeyBinding,
} from '../tabby/hotkey-util'
import { detectSystemLocale, isColorDark, parseColorLuminance } from '@common/utils'
import { DEFAULT_DATE_FORMAT, setDateFormatPattern } from '../sftp/core/file-utils'

import { log } from '../services/sftp-logger'
/** Tabby 设置页中 SFTP+ 侧栏项 ID（与 SettingsTabProvider.id 一致） */
export const SFTP_PLUS_SETTINGS_TAB_ID = 'sftp-settings'

/** webpack DefinePlugin 在每次 build 时注入的 ISO 时间戳 */
declare const __SFTP_PLUS_BUILD_TIME__: string

/** 本地存储的 key 前缀（仅浮层面板缓存和旧版兼容，不再用于设置数据） */
const PREFIX = 'sftp-plus-settings'

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}.${key}`)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (parsed === null || parsed === undefined) return fallback
    // Basic type guard: if fallback is a primitive, ensure parsed matches
    if (typeof fallback === 'string' && typeof parsed !== 'string') return fallback
    if (typeof fallback === 'boolean' && typeof parsed !== 'boolean') return fallback
    if (typeof fallback === 'number' && typeof parsed !== 'number') return fallback
    return parsed
  } catch { return fallback }
}


const TABLE_SETTINGS_KEY = 'sftp-plus-table'

function loadTableSetting(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`${TABLE_SETTINGS_KEY}.${key}`)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}



@Component({
  template: `
    <div class="sftp-settings-page">
      <h3 class="ss-title">SFTP+</h3>
      <p class="ss-desc">{{ i18n.t('settings.desc') }}</p>

      <!-- 语言 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.language') }}</label>
        <select [(ngModel)]="lang" (ngModelChange)="saveLang()" class="ss-select">
          <option value="">{{ i18n.t('settings.followTabby') }}</option>
          <option *ngFor="let l of locales" [value]="l.code">{{ l.name }}</option>
        </select>
      </div>

      <!-- 主题 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.theme') }}</label>
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
              <label>{{ i18n.t('settings.primary') }}</label>
              <input type="color" [ngModel]="themePrimary" (change)="onColorChange('primary', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themePrimary }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ i18n.t('settings.bg') }}</label>
              <input type="color" [ngModel]="themeBg" (change)="onColorChange('bg', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBg }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ i18n.t('settings.text') }}</label>
              <input type="color" [ngModel]="themeText" (change)="onColorChange('text', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeText }}</span>
            </div>
            <div class="ss-color-field">
              <label>{{ i18n.t('settings.border') }}</label>
              <input type="color" [ngModel]="themeBorder" (change)="onColorChange('border', $event.target.value)" class="ss-color-input" />
              <span class="ss-color-val">{{ themeBorder }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 布局 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.layout') }}</label>
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
            <span class="ss-layout-text">{{ i18n.t('settings.layoutAdaptive') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutAdaptiveSub') }}</span>
          </div>
          <!-- 左右布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'horizontal'" (click)="setLayoutMode('horizontal')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="9" height="20" rx="1.5"/>
                <rect x="13" y="2" width="9" height="20" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ i18n.t('settings.layoutHorizontal') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutHorizontalSub') }}</span>
          </div>
          <!-- 上下布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'vertical'" (click)="setLayoutMode('vertical')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="9" rx="1.5"/>
                <rect x="2" y="13" width="20" height="9" rx="1.5"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ i18n.t('settings.layoutVertical') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutVerticalSub') }}</span>
          </div>
          <!-- 单栏布局 -->
          <div class="ss-layout-card" [class.ss-layout-active]="layoutMode === 'single'" (click)="setLayoutMode('single')">
            <div class="ss-layout-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="20" rx="1.5"/>
                <circle cx="16" cy="12" r="2.5" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <span class="ss-layout-text">{{ i18n.t('settings.layoutSingle') }}</span>
            <span class="ss-layout-sub">{{ i18n.t('settings.layoutSingleSub') }}</span>
          </div>
        </div>

        <div class="ss-sub-head" style="margin-top:16px;">
          <div class="ss-sub-label" style="margin:0;">{{ i18n.t('settings.customToolbar') }}</div>
          <button class="ss-reset-icon-btn" (click)="resetPaneLayout()" [title]="i18n.t('settings.resetLayout')">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 8a5 5 0 1 1-1.8-3.85"/>
              <path d="M13 3.5v2.9h-2.9"/>
            </svg>
          </button>
        </div>
        <div class="ss-layout-preview">
          <div class="ss-layout-chip"
            *ngFor="let item of paneCustomOrder"
            draggable="true"
            [class.dragging]="draggingCustomItem === item"
            [class.hidden]="isPaneItemHidden(item)"
            (dragstart)="onCustomDragStart(item, $event)"
            (dragover)="onCustomDragOver(item, $event)"
            (drop)="onCustomDrop(item, $event)"
            (dragend)="onCustomDragEnd()">
            <input type="checkbox" class="ss-chip-check" [checked]="!isPaneItemHidden(item)"
              (mousedown)="$event.stopPropagation()" (dragstart)="$event.stopPropagation()"
              (change)="togglePaneItemHidden(item)" />
            <span class="ss-layout-chip-handle">⋮⋮</span>
            <span>{{ paneCustomItemLabel(item) }}</span>
          </div>
        </div>
        <!-- 表格样式（属于布局的子选项） -->
        <div class="ss-sub-label" style="margin-top:16px;">{{ i18n.t('settings.tableStyle') }}</div>
        <div class="ss-toggle-wrap">
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('view.colBorder') }}</span>
            <span class="ss-toggle-track" [class.active]="showColBorders" (click)="showColBorders=!showColBorders; saveTableSettings()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('view.zebra') }}</span>
            <span class="ss-toggle-track" [class.active]="showZebra" (click)="showZebra=!showZebra; saveTableSettings()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
        </div>
        <div class="ss-hint">{{ i18n.t('settings.tableStyleHint') }}</div>
      </div>

      <!-- 其它 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.other') }}</label>
        <div class="ss-toggle-wrap">
          <!-- ★ 2026-08-11：隐藏作者信息开关（开启需点 Star 确认）——与隐藏原生按钮同归功能性分组 -->
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.hideAuthorInfo') }}</span>
            <span class="ss-toggle-track" [class.active]="hideAuthorInfo" (click)="toggleHideAuthorInfo()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.hideNativeBtn') }}</span>
            <span class="ss-toggle-track" [class.active]="hideNativeBtn" (click)="toggleHideNativeBtn()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.closeBookmarkPanel') }}</span>
            <span class="ss-toggle-track" [class.active]="closeBookmarkPanelOnSelect" (click)="toggleCloseBookmarkPanelOnSelect()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.openInNewTab') }}</span>
            <span class="ss-toggle-track" [class.active]="openInNewTabByDefault" (click)="toggleOpenInNewTabByDefault()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row ss-toggle-sub" [class.disabled]="!openInNewTabByDefault">
            <span class="ss-toggle-label">{{ i18n.t('settings.singleWorkspaceInstance') }}</span>
            <span class="ss-toggle-track" [class.active]="singleWorkspaceInstance" (click)="toggleSingleWorkspaceInstance()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <label class="ss-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.defaultShowHidden') }}</span>
            <span class="ss-toggle-track" [class.active]="defaultShowHidden" (click)="toggleDefaultShowHidden()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
          <div class="ss-toggle-row ss-pathmode-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.defaultPathMode') }}</span>
            <div class="ss-segmented">
              <button type="button" class="ss-segment"
                [class.active]="defaultPathMode === 'off'"
                (click)="defaultPathMode = 'off'; saveDefaultPathMode()">
                {{ i18n.t('settings.pathModeOff') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="defaultPathMode === 'remember'"
                (click)="defaultPathMode = 'remember'; saveDefaultPathMode()">
                {{ i18n.t('settings.pathModeRemember') }}
              </button>
              <button type="button" class="ss-segment"
                [class.active]="defaultPathMode === 'sync'"
                (click)="defaultPathMode = 'sync'; saveDefaultPathMode()">
                {{ i18n.t('settings.pathModeSync') }}
              </button>
            </div>
          </div>
          <div class="ss-toggle-row ss-datefmt-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.dateFormat') }}</span>
            <div class="ss-datefmt-field">
              <input class="ss-datefmt-input" type="text" [(ngModel)]="dateFormat"
                (change)="saveDateFormat()" spellcheck="false" />
              <button type="button" class="ss-datefmt-clear" *ngIf="dateFormat !== defaultDateFormat"
                (click)="resetDateFormat(); $event.stopPropagation()"
                [title]="i18n.t('settings.dateFormatReset')">&times;</button>
            </div>
          </div>
          <!-- ★ 2026-08-11：面板快捷键挪到自定义时间格式下方（按用户要求调整顺序） -->
          <div class="ss-toggle-row ss-hotkey-toggle-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.hotkey') }}</span>
            <div class="ss-hotkey-field"
              [class.recording]="hotkeyRecording"
              [class.has-value]="!!hotkeyBindingLabel && !hotkeyRecording">
              <button type="button" class="ss-hotkey-display"
                (click)="startHotkeyRecording()"
                [disabled]="!configService"
                [title]="i18n.t('settings.hotkeyClickToSet')">
                <ng-container *ngIf="hotkeyRecording; else hotkeyIdle">
                  {{ hotkeyRecordingPreview || i18n.t('settings.hotkeyRecording') }}
                </ng-container>
                <ng-template #hotkeyIdle>
                  {{ hotkeyBindingLabel || i18n.t('settings.hotkeyUnbound') }}
                </ng-template>
              </button>
              <button type="button" class="ss-hotkey-clear" *ngIf="hotkeyRecording"
                (click)="cancelHotkeyRecording(); $event.stopPropagation()" [title]="i18n.t('app.cancel')">×</button>
              <button type="button" class="ss-hotkey-clear" *ngIf="!hotkeyRecording && hotkeyBindingLabel"
                (click)="clearHotkeyBinding(); $event.stopPropagation()" [title]="i18n.t('settings.hotkeyClear')">×</button>
            </div>
          </div>
          <div class="ss-toggle-row ss-concurrency-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.uploadConcurrency') }}</span>
            <input class="ss-concurrency-input" type="number" min="1" max="10" step="1"
              [(ngModel)]="uploadConcurrency" (change)="saveConcurrency()" />
          </div>
          <div class="ss-toggle-row ss-concurrency-row">
            <span class="ss-toggle-label">{{ i18n.t('settings.downloadConcurrency') }}</span>
            <input class="ss-concurrency-input" type="number" min="1" max="10" step="1"
              [(ngModel)]="downloadConcurrency" (change)="saveConcurrency()" />
          </div>
          <label class="ss-toggle-row" title="{{ i18n.t('settings.fastModeDesc') }}">
            <span class="ss-toggle-label">{{ i18n.t('settings.fastMode') }}</span>
            <span class="ss-toggle-track" [class.active]="transferFastMode" (click)="toggleFastMode()">
              <span class="ss-toggle-thumb"></span>
            </span>
          </label>
        </div>
        <div class="ss-hint ss-hotkey-conflict" *ngIf="hotkeyConflictNames">
          {{ i18n.t('settings.hotkeyConflict', { names: hotkeyConflictNames }) }}
        </div>
        <div class="ss-hint ss-hotkey-ok" *ngIf="hotkeySaveMessage">{{ hotkeySaveMessage }}</div>
      </div>

      <!-- 数据 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.data') }}</label>

        <!-- 数据导入导出 -->
        <div class="ss-backup-row">
          <button class="ss-btn" (click)="exportData()">[&darr;] {{ i18n.t('settings.export') }}</button>
          <label class="ss-btn ss-btn-import">[&uarr;] {{ i18n.t('settings.import') }}
            <input type="file" accept=".json" (change)="importData($event)" style="display:none" />
          </label>
          <button class="ss-btn ss-btn-danger" (click)="openClearConfirm()">[&times;] {{ i18n.t('settings.clearAll') }}</button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="ss-section">
        <label class="ss-label">{{ i18n.t('settings.about') }}</label>
        <div class="ss-about-row">
          <span class="ss-about-item">{{ i18n.t('settings.version') }}: {{ pkgVersion }}</span>
          <span class="ss-about-item">{{ i18n.t('settings.buildTime') }}: {{ formatBuildTime() }}</span>
          <!-- ★ 2026-08-11：作者信息可按需隐藏（开启需点 Star 确认） -->
          <span class="ss-about-item" *ngIf="!hideAuthorInfo">{{ i18n.t('settings.author') }}: DD1024z</span>
        </div>
        <div class="ss-about-row ss-about-links">
          <span class="ss-about-link" (click)="openGithub()">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>
            {{ i18n.t('settings.githubSource') }}
          </span>
          <span class="ss-about-link" (click)="openGithub()">
            ⭐ {{ i18n.t('settings.giveStar') }}
          </span>
          <span class="ss-about-link" (click)="openFeedback()">
            💬 {{ i18n.t('settings.feedback') }}
          </span>
        </div>
      </div>

      <!-- 主题颜色修改确认弹窗 -->
      <div class="ss-overlay" *ngIf="showThemeColorConfirm" (click)="cancelThemeColorOverwrite()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title">{{ i18n.t('settings.modifyColors') }}</div>
          <div class="ss-edit-field">
            <p>{{ i18n.t('settings.overwriteConfirm') }}</p>
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn ss-btn-danger" (click)="confirmThemeColorOverwrite()">{{ i18n.t('settings.overwrite') }}</button>
            <button class="ss-btn" (click)="cancelThemeColorOverwrite()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- 清空数据确认弹窗 -->
      <div class="ss-overlay" *ngIf="showClearConfirm" (click)="closeClearConfirm()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title" style="color:var(--primary-color,#e24b4a);">{{ i18n.t('settings.clearAllTitle') }}</div>
          <div class="ss-edit-field">
            <p>
              {{ i18n.t('settings.clearAllConfirm') }}
            </p>
            <label>{{ i18n.t('settings.clearAllPrompt') }}</label>
            <input class="ss-edit-input" type="text" [(ngModel)]="clearConfirmInput"
              (keydown.enter)="doClearData()" placeholder="DELETE" />
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn ss-btn-danger" (click)="doClearData()"
              [style.opacity]="clearConfirmInput !== 'DELETE' ? '0.5' : '1'"
              [disabled]="clearConfirmInput !== 'DELETE'">{{ i18n.t('settings.clear') }}</button>
            <button class="ss-btn" (click)="closeClearConfirm()">{{ i18n.t('app.cancel') }}</button>
          </div>
        </div>
      </div>

      <!-- ★ 2026-08-11：隐藏作者信息确认弹窗（点击开启时已自动打开仓库链接） -->
      <div class="ss-overlay" *ngIf="showHideAuthorConfirm" (click)="cancelHideAuthor()"
        [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
        <div class="ss-edit-modal" [class.ss-dark]="isDarkMode" [class.ss-light]="!isDarkMode" (click)="$event.stopPropagation()">
          <div class="ss-edit-title">⭐ {{ i18n.t('settings.hideAuthorInfo') }}</div>
          <div class="ss-edit-field">
            <p>{{ i18n.t('settings.hideAuthorConfirmText') }}</p>
            <span class="ss-about-link" (click)="openGithub()">⭐ {{ i18n.t('settings.giveStar') }}</span>
          </div>
          <div class="ss-edit-footer">
            <button class="ss-btn" (click)="confirmHideAuthor()">{{ i18n.t('settings.starredConfirm') }}</button>
            <button class="ss-btn" (click)="cancelHideAuthor()">{{ i18n.t('app.cancel') }}</button>
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
    .ss-pathmode-row { display:flex; align-items:center; justify-content:space-between; }
    .ss-segmented {
      display:inline-flex; align-items:center;
      border:1px solid rgba(128,128,128,0.25); border-radius:6px;
      overflow:hidden; background:rgba(128,128,128,0.08);
    }
    .ss-segment {
      appearance:none; border:none; background:transparent;
      padding:5px 14px; font-size:13px; color:inherit;
      cursor:pointer; outline:none; line-height:1.4;
      transition: background .12s, color .12s;
    }
    .ss-segment + .ss-segment { border-left:1px solid rgba(128,128,128,0.2); }
    .ss-segment:hover { background:rgba(128,128,128,0.12); }
    .ss-segment.active { background:rgba(128,128,128,0.35); }
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
    .ss-toggle-sub { padding-left: 18px; }
    .ss-toggle-sub.disabled { opacity: .45; pointer-events: none; }

    /* 设置面板提示文字 */
    .ss-hint { font-size:11px; opacity:.5; margin-top:6px; }
    .ss-datefmt-row { gap: 12px; cursor: default; }
    .ss-datefmt-field {
      position: relative; display: inline-flex; align-items: center;
      flex-shrink: 0; min-width: 140px; max-width: 240px;
    }
    .ss-datefmt-input {
      flex: 1; min-width: 0; width: 100%;
      padding: 6px 28px 6px 10px; border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
      color: inherit; font-size: 12px; outline: none;
      font-family: monospace; box-sizing: border-box;
      /* 覆盖 .ss-toggle-row 继承的 user-select:none —— 否则输入框在 Electron 下无法编辑 */
      user-select: text; -webkit-user-select: text; cursor: text;
    }
    .ss-datefmt-input:focus { border-color: var(--primary-color, #3b82f6); }
    .ss-datefmt-input::placeholder { color: inherit; opacity: .4; }
    .ss-datefmt-clear {
      position: absolute; right: 2px; top: 50%; transform: translateY(-50%);
      width: 20px; height: 20px; padding: 0; line-height: 1;
      border: none; border-radius: 4px;
      background: transparent; color: inherit; opacity: .45; cursor: pointer;
      font-size: 15px;
    }
    .ss-datefmt-clear:hover { opacity: .9; background: rgba(128,128,128,0.14); }
    .ss-datefmt-hint { margin-top: 2px; line-height: 1.6; }
    .ss-concurrency-row { gap: 12px; cursor: default; }
    .ss-concurrency-input {
      width: 64px; padding: 6px 8px; border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
      color: inherit; font-size: 13px; outline: none;
      text-align: center; box-sizing: border-box;
    }
    .ss-concurrency-input:focus { border-color: var(--primary-color, #3b82f6); }
    .ss-hotkey-row {
      display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px;
    }
    .ss-hotkey-toggle-row {
      gap: 12px;
    }
    .ss-hotkey-field {
      position: relative;
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      min-width: 140px;
      max-width: 240px;
      border-radius: 6px;
      border: 1px solid rgba(128,128,128,0.28);
      background: rgba(128,128,128,0.06);
    }
    .ss-hotkey-field.has-value {
      border-color: rgba(128,128,128,0.35);
    }
    .ss-hotkey-field.recording {
      border-color: var(--primary-color,#3b82f6);
      box-shadow: 0 0 0 1px var(--primary-color,#3b82f6);
      animation: ss-hotkey-pulse 1.2s ease-in-out infinite;
    }
    .ss-hotkey-display {
      flex: 1;
      min-width: 0;
      text-align: center;
      padding: 4px 28px 4px 10px;
      border: none;
      background: transparent;
      color: inherit;
      font-size: 12px;
      font-family: ui-monospace, Consolas, monospace;
      cursor: pointer;
      opacity: .85;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ss-hotkey-field.has-value .ss-hotkey-display,
    .ss-hotkey-field.recording .ss-hotkey-display {
      opacity: 1;
    }
    .ss-hotkey-display:disabled { opacity:.45; cursor:not-allowed; }
    .ss-hotkey-clear {
      position: absolute;
      right: 2px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px; height: 20px; padding: 0;
      border: none; border-radius: 4px;
      background: transparent; color: inherit; opacity: .45; cursor: pointer;
      font-size: 14px; line-height: 1;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .ss-hotkey-clear:hover { opacity: .9; background: rgba(128,128,128,0.14); }
    @keyframes ss-hotkey-pulse {
      0%,100% { background: rgba(59,130,246,0.06); }
      50% { background: rgba(59,130,246,0.14); }
    }
    .ss-hotkey-conflict { color:#e24b4a; opacity:.9; }
    .ss-hotkey-ok { color:#22a06b; opacity:.9; }

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
    .ss-about-links { margin-top:8px; }
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
    .ss-edit-input::placeholder {
      color: inherit;
      opacity: .45;
    }
    .ss-edit-input::-webkit-input-placeholder {
      color: inherit;
      opacity: .45;
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
    .ss-sub-head { display:flex; align-items:center; justify-content:flex-start; gap:8px; }
    .ss-reset-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .ss-reset-icon-btn svg { width: 13px; height: 13px; }
    .ss-reset-icon-btn:hover { background: rgba(128,128,128,0.1); }
    .ss-layout-preview {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    .ss-layout-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px dashed rgba(128,128,128,0.35);
      background: rgba(128,128,128,0.06);
      font-size: 12px;
      cursor: grab;
      user-select: none;
    }
    .ss-layout-chip.dragging { opacity: 0.5; }
    .ss-layout-chip.hidden { opacity: 0.45; border-style: dotted; }
    .ss-layout-chip.hidden .ss-layout-chip-handle { opacity: .3; }
    .ss-chip-check { width: 14px; height: 14px; margin: 0; cursor: pointer; }
    .ss-layout-chip-handle { opacity: .5; letter-spacing: -1px; }
    .ss-btn-ghost { padding: 6px 12px; font-size: 12px; }

  `],
})
export class SftpSettingsTabComponent implements OnDestroy {
  // @ts-ignore — ts-loader 可能无法正确处理 JSON 模块类型
  /** 插件版本号（webpack 构建时内联 package.json） */
  readonly pkgVersion: string = require('../../package.json').version
  /** 构建时间（webpack 每次 build 时注入，用于确认是否已重新打包） */
  readonly pkgBuildTime: string = typeof __SFTP_PLUS_BUILD_TIME__ !== 'undefined' ? __SFTP_PLUS_BUILD_TIME__ : ''

  /** 格式化构建时间为本地可读字符串 */
  formatBuildTime(): string {
    if (!this.pkgBuildTime) return '—'
    const d = new Date(this.pkgBuildTime)
    if (isNaN(d.getTime())) return this.pkgBuildTime
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  /** 国际化服务（key-based，支持动态切换语言） */
  readonly i18n: SftpI18nService

  /** 主题颜色标签 key 映射（统一走 .po 翻译） */
  private readonly themeLabelKeys: Record<string, string> = {
    '':       'theme.auto',
    dark:     'theme.dark',
    light:    'theme.light',
    blue:     'theme.blue',
    green:    'theme.green',
    purple:   'theme.purple',
    red:      'theme.red',
    custom:   'theme.custom',
  }

  /** 获取主题颜色的翻译标签 */
  themeLabel(c: { value: string; label: string }): string {
    const key = this.themeLabelKeys[c.value]
    return key ? this.i18n.t(key) : c.label
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

  /** 支持的语言列表（按语言代码排序） */
  readonly locales: { code: Locale; name: string }[] = [
    { code: 'af-ZA', name: 'Afrikaans' },
    { code: 'bg-BG', name: 'Български' },
    { code: 'cs-CZ', name: 'Čeština' },
    { code: 'da-DK', name: 'Dansk' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'en-US', name: 'English (US)' },
    { code: 'es-ES', name: 'Español' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'hr-HR', name: 'Hrvatski' },
    { code: 'id-ID', name: 'Bahasa Indonesia' },
    { code: 'it-IT', name: 'Italiano' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'ko-KR', name: '한국어' },
    { code: 'pl-PL', name: 'Polski' },
    { code: 'pt-BR', name: 'Português (Brasil)' },
    { code: 'pt-PT', name: 'Português' },
    { code: 'ru-RU', name: 'Русский' },
    { code: 'sr-Latn', name: 'Srpski' },
    { code: 'sv-SE', name: 'Svenska' },
    { code: 'tr-TR', name: 'Türkçe' },
    { code: 'uk-UA', name: 'Українська' },
    { code: 'zh-CN', name: '中文（简体）' },
    { code: 'zh-TW', name: '中文（繁體）' },
  ]

  /** 界面语言（空 = 自动跟随系统） */
  lang: '' | Locale = (load('lang', '') as string || '') as '' | Locale

  /** 使用界面语言（Auto 模式时检测系统语言） */
  get effectiveLang(): Locale {
    const validLocales: Locale[] = this.locales.map(l => l.code)
    if (this.lang && validLocales.includes(this.lang as Locale)) return this.lang as Locale
    return detectSystemLocale() as Locale
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
        const lum = parseColorLuminance(textColor)
        if (lum >= 0) return lum > 128
      }
      // --text-color 不可用 → 尝试 --body-bg
      const bodyBg = getComputedStyle(document.documentElement).getPropertyValue('--body-bg').trim()
      if (bodyBg) {
        const lum = parseColorLuminance(bodyBg)
        if (lum >= 0) return lum < 128  // 背景暗 → 深色模式
      }
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
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

    // 使用公共工具判断暗/亮
    this.detectedAutoTheme = isColorDark(bodyBg) ? 'dark' : 'light'
  }

  /** 获取 Auto 映射主题名的显示文本 */
  get autoThemeLabel(): string {
    if (this.detectedAutoTheme === 'dark') return this.i18n.t('settings.dark')
    if (this.detectedAutoTheme === 'light') return this.i18n.t('settings.light')
    return ''
  }

  /** 主题颜色值（从 localStorage 或预设加载） */
  themePrimary = load('primaryColor', '')
  themeBg = load('bgColor', '')
  themeText = load('textColor', '')
  themeBorder = load('borderColor', '')

  /** 面板布局 */
  layoutMode: string = 'auto'

  /** 表格样式设置 */
  showColBorders = loadTableSetting('colBorders', false)
  showZebra = loadTableSetting('zebra', false)

  /** 隐藏原生 SFTP 按钮 */
  hideNativeBtn = load('hideNativeBtn', false)

  /** 默认路径模式（off/remember/sync）：对未在面板上单独切换过的连接生效 */
  defaultPathMode: 'off' | 'remember' | 'sync' = load('defaultPathMode', 'off') as 'off' | 'remember' | 'sync'

  /** 默认显示隐藏文件：对从未按过眼睛按钮的面板生效 */
  defaultShowHidden = load('defaultShowHidden', false)

  /** 热键录制状态 */
  hotkeyRecording = false
  hotkeyRecordingPreview = ''
  hotkeyConflictNames = ''
  hotkeySaveMessage = ''
  private _hotkeyStrokeSub: { unsubscribe(): void } | null = null
  private _hotkeyKeyEventSub: { unsubscribe(): void } | null = null
  private _hotkeyDomHandler: ((ev: KeyboardEvent) => void) | null = null
  private _hotkeyCommitTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeySafetyTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeyMsgTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeyDescCache: Record<string, string> = {}
  private _pendingHotkeyStrokes: string[] = []
  private _hotkeyDisableHeld = false

  /** 当前「切换 SFTP+ 面板」热键绑定文案（来自 Tabby hotkeys 配置） */
  get hotkeyBindingLabel(): string {
    try {
      const list = readToggleHotkeyBindings(this.configService?.store?.hotkeys)
      return list.map(formatHotkeyBinding).filter(Boolean).join(' / ')
    } catch {
      return ''
    }
  }

  /** 工具栏入口在新标签页打开 */
  openInNewTabByDefault = load('openInNewTabByDefault', false)

  /** 新标签页模式：同一 SSH 终端只保留一个 SFTP+ 标签 */
  singleWorkspaceInstance = load('singleWorkspaceInstance', true)
  /** 兼容选项：选中书签后关闭面板 */
  closeBookmarkPanelOnSelect = load('closeBookmarkPanelOnSelect', false)
  /** 兼容选项：自定义时间格式（输入框始终显示具体格式，默认为 DEFAULT_DATE_FORMAT） */
  dateFormat = load('dateFormat', '') || DEFAULT_DATE_FORMAT
  /** 默认时间格式 */
  readonly defaultDateFormat = DEFAULT_DATE_FORMAT
  /** 同时进行的上传/下载数上限（1-10，默认 3） */
  uploadConcurrency = 3
  downloadConcurrency = 3
  /** ★ 2026-08-11：快速模式：目录传输跳过预扫描直接开传（无百分比进度） */
  transferFastMode = false
  /** ★ 2026-08-11：隐藏关于区的插件作者信息（开启需点 Star 确认） */
  hideAuthorInfo = false
  /** 隐藏作者信息确认弹窗是否显示 */
  showHideAuthorConfirm = false
  paneCustomOrder: Array<'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'> = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
  /** 被隐藏的工具栏项（设置页定制工具栏中取消勾选的项） */
  paneHiddenItems: string[] = []
  draggingCustomItem: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden' | null = null

  /** 主题颜色修改确认弹窗 */
  showThemeColorConfirm = false
  /** 待提交的颜色修改 */
  private _pendingColorKey = ''
  private _pendingColorVal = ''
  /** 发起修改时的主题模式（弹窗确认后用于复制色值） */
  private _pendingOrigTheme = ''

  /** 存储模式：仅使用 Tabby 配置存储 */
  storageMode = 'config'

  constructor(
    @Optional() public configService?: ConfigService,
    @Optional() private hotkeys?: HotkeysService,
  ) {
    // ConfigService 是可选的，如果注入失败（开发环境/Tabby 版本不支持），回退到 localStorage
    this.i18n = new SftpI18nService(configService)
  }

  /** 缓存事件监听引用，便于 ngOnDestroy 清理（P1-7） */
  private _settingsChangedHandler: (() => void) | null = null

  ngOnInit(): void {
    // 首次加载：刷新配置 + 注册一次性事件监听
    this._refreshFromConfig()

    // 监听面板上的布局切换 → 同步更新设置页显示（只注册一次）
    if (!this._settingsChangedHandler) {
      this._settingsChangedHandler = () => {
        // 从 config store 读取面板端切换的布局
        const cfg = this.configService?.store?.['tabby-sftp-plus']
        if (cfg?.layoutMode) this.layoutMode = cfg.layoutMode as string
      }
      window.addEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)
    }
  }

  ngOnDestroy(): void {
    this.cancelHotkeyRecording()
    if (this._settingsChangedHandler) {
      window.removeEventListener('sftp-plus-settings-changed', this._settingsChangedHandler)
      this._settingsChangedHandler = null
    }
    if (this._hotkeyMsgTimer) {
      clearTimeout(this._hotkeyMsgTimer)
      this._hotkeyMsgTimer = null
    }
  }

  /** 开始录制面板开关快捷键 */
  startHotkeyRecording(): void {
    if (!this.configService?.store || this.hotkeyRecording) return
    this.hotkeyConflictNames = ''
    this.hotkeySaveMessage = ''
    this.hotkeyRecording = true
    this.hotkeyRecordingPreview = ''
    this._pendingHotkeyStrokes = []
    setHotkeyRecordingActive(true)
    void this._ensureHotkeyDescriptions()

    try { this.hotkeys?.clearCurrentKeystrokes?.() } catch { /* ignore */ }
    try {
      this.hotkeys?.disable?.()
      this._hotkeyDisableHeld = true
    } catch {
      this._hotkeyDisableHeld = false
    }

    // 始终用捕获阶段 DOM 监听兜底：按下「当前已绑定热键」时 Tabby 可能不再发 keystroke$
    this._hotkeyDomHandler = (ev: KeyboardEvent) => {
      if (!this.hotkeyRecording) return
      ev.preventDefault()
      ev.stopPropagation()
      if (ev.key === 'Escape') {
        this.cancelHotkeyRecording()
        return
      }
      if (ev.repeat) return
      if (ev.key === 'Control' || ev.key === 'Meta' || ev.key === 'Alt' || ev.key === 'Shift') return
      const stroke = getKeystrokeNameFromEvent(ev)
      if (!stroke) return
      this._pendingHotkeyStrokes = [stroke]
      this.hotkeyRecordingPreview = stroke
      this._scheduleHotkeyCommit()
    }
    window.addEventListener('keydown', this._hotkeyDomHandler, true)

    if (this.hotkeys?.keystroke$?.subscribe) {
      this._hotkeyStrokeSub = this.hotkeys.keystroke$.subscribe((stroke: string) => {
        if (!stroke || !this.hotkeyRecording) return
        // DOM 已捕获过则不再重复追加，避免序列错乱
        if (this._pendingHotkeyStrokes.length === 1 && this._pendingHotkeyStrokes[0] === stroke) {
          this._scheduleHotkeyCommit()
          return
        }
        if (!this._pendingHotkeyStrokes.includes(stroke)) {
          this._pendingHotkeyStrokes.push(stroke)
        }
        this.hotkeyRecordingPreview = this._pendingHotkeyStrokes.join(' › ')
        this._scheduleHotkeyCommit()
      })
    }
    if (this.hotkeys?.keyEvent$?.subscribe) {
      this._hotkeyKeyEventSub = this.hotkeys.keyEvent$.subscribe((ev: any) => {
        if (ev instanceof KeyboardEvent) {
          ev.preventDefault()
          ev.stopPropagation()
        }
      })
    }

    // 安全超时：避免 disable() 后录制中断导致全局热键一直失效
    if (this._hotkeySafetyTimer) clearTimeout(this._hotkeySafetyTimer)
    this._hotkeySafetyTimer = setTimeout(() => {
      if (this.hotkeyRecording) {
        this.cancelHotkeyRecording()
        this._flashHotkeyMessage(this.i18n.t('settings.hotkeyRecordTimeout'))
      }
    }, 12000)
  }

  cancelHotkeyRecording(): void {
    this._teardownHotkeyRecording(false)
  }

  async clearHotkeyBinding(): Promise<void> {
    if (!this.configService?.store) return
    this.cancelHotkeyRecording()
    try {
      if (!this.configService.store.hotkeys) this.configService.store.hotkeys = {}
      this.configService.store.hotkeys[SFTP_PLUS_TOGGLE_HOTKEY] = []
      await this.configService.save()
      this.hotkeyConflictNames = ''
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeyCleared'))
    } catch (e) {
      log.warn('clear hotkey failed', e)
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeySaveFailed'))
    }
  }

  private _scheduleHotkeyCommit(): void {
    if (this._hotkeyCommitTimer) clearTimeout(this._hotkeyCommitTimer)
    // 单键稍短提交，降低与旧热键冲突窗口
    const delay = this._pendingHotkeyStrokes.length > 1 ? 800 : 350
    this._hotkeyCommitTimer = setTimeout(() => {
      this._hotkeyCommitTimer = null
      void this._commitHotkeyRecording()
    }, delay)
  }

  private async _commitHotkeyRecording(): Promise<void> {
    const strokes = [...this._pendingHotkeyStrokes]
    this._teardownHotkeyRecording(true)
    if (!strokes.length || !this.configService?.store) return

    const binding: HotkeyBinding = strokes.length === 1 ? strokes[0] : strokes
    const current = readToggleHotkeyBindings(this.configService.store.hotkeys)
    const sameAsCurrent = current.length === 1
      && formatHotkeyBinding(current[0]) === formatHotkeyBinding(binding)
    if (sameAsCurrent) {
      // 又按了一次当前绑定：直接结束录制，不重复写入
      this.hotkeyConflictNames = ''
      return
    }

    const conflicts = findHotkeyConflicts(binding, this.configService.store.hotkeys, SFTP_PLUS_TOGGLE_HOTKEY)
    if (conflicts.length) {
      const names = await this._resolveHotkeyNames(conflicts)
      this.hotkeyConflictNames = names.join(', ')
      const ok = confirm(this.i18n.t('settings.hotkeyConflictConfirm', {
        keys: formatHotkeyBinding(binding),
        names: this.hotkeyConflictNames,
      }))
      if (!ok) {
        this.hotkeyConflictNames = ''
        return
      }
    } else {
      this.hotkeyConflictNames = ''
    }

    try {
      if (!this.configService.store.hotkeys) this.configService.store.hotkeys = {}
      this.configService.store.hotkeys[SFTP_PLUS_TOGGLE_HOTKEY] = [binding]
      await this.configService.save()
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeySaved', {
        keys: formatHotkeyBinding(binding),
      }))
    } catch (e) {
      log.warn('save hotkey failed', e)
      this._flashHotkeyMessage(this.i18n.t('settings.hotkeySaveFailed'))
    }
  }

  private _teardownHotkeyRecording(_keepPreview: boolean): void {
    if (this._hotkeyCommitTimer) {
      clearTimeout(this._hotkeyCommitTimer)
      this._hotkeyCommitTimer = null
    }
    if (this._hotkeySafetyTimer) {
      clearTimeout(this._hotkeySafetyTimer)
      this._hotkeySafetyTimer = null
    }
    try { this._hotkeyStrokeSub?.unsubscribe() } catch { /* ignore */ }
    try { this._hotkeyKeyEventSub?.unsubscribe() } catch { /* ignore */ }
    this._hotkeyStrokeSub = null
    this._hotkeyKeyEventSub = null
    if (this._hotkeyDomHandler) {
      window.removeEventListener('keydown', this._hotkeyDomHandler, true)
      this._hotkeyDomHandler = null
    }
    try { this.hotkeys?.clearCurrentKeystrokes?.() } catch { /* ignore */ }
    if (this._hotkeyDisableHeld) {
      try { this.hotkeys?.enable?.() } catch { /* ignore */ }
      this._hotkeyDisableHeld = false
    }
    setHotkeyRecordingActive(false)
    this.hotkeyRecording = false
    this._pendingHotkeyStrokes = []
    this.hotkeyRecordingPreview = ''
  }

  private _flashHotkeyMessage(msg: string): void {
    this.hotkeySaveMessage = msg
    if (this._hotkeyMsgTimer) clearTimeout(this._hotkeyMsgTimer)
    this._hotkeyMsgTimer = setTimeout(() => {
      this.hotkeySaveMessage = ''
      this._hotkeyMsgTimer = null
    }, 2500)
  }

  private async _ensureHotkeyDescriptions(): Promise<void> {
    if (Object.keys(this._hotkeyDescCache).length) return
    try {
      const list = await this.hotkeys?.getHotkeyDescriptions?.()
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item?.id) this._hotkeyDescCache[item.id] = item.name || item.id
        }
      }
    } catch { /* ignore */ }
  }

  private async _resolveHotkeyNames(ids: string[]): Promise<string[]> {
    await this._ensureHotkeyDescriptions()
    return ids.map(id => this._hotkeyDescCache[id] || id)
  }

  /** 从配置重新加载所有设置并刷新主题（可安全重复调用） */
  private _refreshFromConfig(): void {
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
  }

  /** 从 Tabby 配置加载所有设置 */
  private _readFromConfig(): void {
    try {
      const cfg = this.configService?.store?.['tabby-sftp-plus']
      if (!cfg) return
      if (cfg.lang !== undefined) this.lang = cfg.lang as '' | Locale
      if (cfg.layoutMode !== undefined) this.layoutMode = cfg.layoutMode as string
      if (cfg.theme !== undefined) this.theme = cfg.theme as string
      if (cfg.colorPrimary !== undefined) this.themePrimary = cfg.colorPrimary as string
      if (cfg.colorBg !== undefined) this.themeBg = cfg.colorBg as string
      if (cfg.colorText !== undefined) this.themeText = cfg.colorText as string
      if (cfg.colorBorder !== undefined) this.themeBorder = cfg.colorBorder as string
      if (cfg.tableColBorders !== undefined) this.showColBorders = cfg.tableColBorders as boolean
      if (cfg.tableZebra !== undefined) this.showZebra = cfg.tableZebra as boolean
      if (cfg.hideNativeSFTPButton !== undefined) this.hideNativeBtn = cfg.hideNativeSFTPButton as boolean
      if (cfg.defaultPathMode === 'off' || cfg.defaultPathMode === 'remember' || cfg.defaultPathMode === 'sync') this.defaultPathMode = cfg.defaultPathMode
      if (cfg.defaultShowHidden !== undefined) this.defaultShowHidden = cfg.defaultShowHidden === true
      if (cfg.openInNewTabByDefault !== undefined) this.openInNewTabByDefault = cfg.openInNewTabByDefault as boolean
      if (cfg.singleWorkspaceInstance !== undefined) this.singleWorkspaceInstance = cfg.singleWorkspaceInstance as boolean
      if (cfg.closeBookmarkPanelOnSelect !== undefined) this.closeBookmarkPanelOnSelect = cfg.closeBookmarkPanelOnSelect as boolean
      if (cfg.dateFormat !== undefined) {
        this.dateFormat = (cfg.dateFormat as string) || DEFAULT_DATE_FORMAT
        setDateFormatPattern(this.dateFormat)
      }
      if (typeof cfg.transferUploadConcurrency === 'number') this.uploadConcurrency = this._clampConcurrency(cfg.transferUploadConcurrency)
      if (typeof cfg.transferDownloadConcurrency === 'number') this.downloadConcurrency = this._clampConcurrency(cfg.transferDownloadConcurrency)
      if (cfg.transferFastMode !== undefined) this.transferFastMode = cfg.transferFastMode === true
      if (cfg.hideAuthorInfo !== undefined) this.hideAuthorInfo = cfg.hideAuthorInfo === true
      if (Array.isArray(cfg.paneCustomOrder) && cfg.paneCustomOrder.length) this.paneCustomOrder = cfg.paneCustomOrder as any
      // 一次性迁移：旧默认顺序（hidden 追加在末尾）→ 新默认顺序（hidden 在 filter 前）；用户自定义过的顺序不动
      if (this.paneCustomOrder.join(',') === 'label,back,forward,up,refresh,home,path,filter,bookmark,hidden') {
        this.paneCustomOrder = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
      }
      // 保证 'hidden'（眼睛图标项）始终存在于顺序中：缺失时插到 'filter' 前面（无 filter 则追加末尾）
      if (!this.paneCustomOrder.includes('hidden')) {
        const next = [...this.paneCustomOrder]
        const idx = next.indexOf('filter')
        next.splice(idx >= 0 ? idx : next.length, 0, 'hidden')
        this.paneCustomOrder = next
      }
      // 注意：空数组也要赋值（全部重新勾选后隐藏列表为空，必须覆盖旧值），仅当 config 无该字段时才回退 localStorage
      if (Array.isArray(cfg.paneHiddenItems)) {
        this.paneHiddenItems = cfg.paneHiddenItems as string[]
      } else {
        try {
          const raw = localStorage.getItem('sftp-plus-pane-hidden-items')
          if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) this.paneHiddenItems = parsed as string[] }
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  /**
   * 写入 Tabby config（per-property update 避免 ConfigProxy 覆盖问题）
   */
  private async _saveToConfig(): Promise<void> {
    try { localStorage.setItem('sftp-plus-pane-custom-order', JSON.stringify(this.paneCustomOrder)) } catch {}
    try { localStorage.setItem('sftp-plus-pane-hidden-items', JSON.stringify(this.paneHiddenItems)) } catch {}
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
      target.defaultPathMode = this.defaultPathMode
      target.defaultShowHidden = this.defaultShowHidden
      target.openInNewTabByDefault = this.openInNewTabByDefault
      target.singleWorkspaceInstance = this.singleWorkspaceInstance
      target.closeBookmarkPanelOnSelect = this.closeBookmarkPanelOnSelect
      target.dateFormat = this.dateFormat
      target.transferUploadConcurrency = this.uploadConcurrency
      target.transferDownloadConcurrency = this.downloadConcurrency
      target.transferFastMode = this.transferFastMode
      target.hideAuthorInfo = this.hideAuthorInfo
      target.paneCustomOrder = this.paneCustomOrder
      target.paneHiddenItems = this.paneHiddenItems
      await this.configService.save()
    } catch (e) {
      log.error('Failed to save to config', e)
    }
  }

  /**
   * 迁移数据：localStorage ↔ config.store（切换存储模式时调用）
   */
  saveLang(): void {
    this._saveToConfig()
    this.i18n.setLocale(this.effectiveLang)
    this.notifyPanels()
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
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 保存默认路径模式 */
  saveDefaultPathMode(): void {
    if (this.defaultPathMode !== 'off' && this.defaultPathMode !== 'remember' && this.defaultPathMode !== 'sync') this.defaultPathMode = 'off'
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 切换默认显示隐藏文件 */
  toggleDefaultShowHidden(): void {
    this.defaultShowHidden = !this.defaultShowHidden
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 切换工具栏入口默认在新标签页打开 */
  toggleOpenInNewTabByDefault(): void {
    this.openInNewTabByDefault = !this.openInNewTabByDefault
    if (this.openInNewTabByDefault) {
      this.singleWorkspaceInstance = true
    }
    this._saveToConfig()
  }

  /** 切换新标签页模式是否复用已有实例 */
  toggleSingleWorkspaceInstance(): void {
    if (!this.openInNewTabByDefault) return
    this.singleWorkspaceInstance = !this.singleWorkspaceInstance
    this._saveToConfig()
  }

  /** 切换「选中书签后关闭面板」 */
  toggleCloseBookmarkPanelOnSelect(): void {
    this.closeBookmarkPanelOnSelect = !this.closeBookmarkPanelOnSelect
    this._saveToConfig()
  }

  /** 保存自定义时间格式（input change/blur 触发，避免逐键通知面板）；清空时自动回落默认格式 */
  saveDateFormat(): void {
    this.dateFormat = (this.dateFormat || '').trim() || DEFAULT_DATE_FORMAT
    setDateFormatPattern(this.dateFormat)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 并发数范围约束（1-10，非法值回落默认 3） */
  private _clampConcurrency(v: unknown): number {
    const n = Number(v)
    if (!Number.isFinite(n)) return 3
    return Math.min(10, Math.max(1, Math.round(n)))
  }

  /** 保存上传/下载并发数（input change 触发） */
  saveConcurrency(): void {
    this.uploadConcurrency = this._clampConcurrency(this.uploadConcurrency)
    this.downloadConcurrency = this._clampConcurrency(this.downloadConcurrency)
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-08-11：切换快速模式（目录传输跳过预扫描）；实时通知面板，新发起的传输立即生效 */
  toggleFastMode(): void {
    this.transferFastMode = !this.transferFastMode
    this._saveToConfig()
    this.notifyPanels()
  }

  /** ★ 2026-08-11：切换隐藏作者信息：关闭直接生效；开启需确认（先打开仓库链接，
   *   用户点「我已点 Star 支持」后才隐藏） */
  toggleHideAuthorInfo(): void {
    if (this.hideAuthorInfo) {
      this.hideAuthorInfo = false
      this._saveToConfig()
      return
    }
    this.openGithub()
    this.showHideAuthorConfirm = true
  }

  confirmHideAuthor(): void {
    this.showHideAuthorConfirm = false
    this.hideAuthorInfo = true
    this._saveToConfig()
  }

  cancelHideAuthor(): void { this.showHideAuthorConfirm = false }

  /** 清空按钮：恢复为默认时间格式并立即保存生效 */
  resetDateFormat(): void {
    this.dateFormat = DEFAULT_DATE_FORMAT
    setDateFormatPattern(this.dateFormat)
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
    try { localStorage.setItem('sftp-plus-layout-mode', this.layoutMode) } catch {}
    this._saveToConfig()
    this.notifyPanels()
  }

  paneCustomItemLabel(item: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden'): string {
    if (item === 'label') return this.i18n.t('settings.paneLabel')
    if (item === 'path') return this.i18n.t('settings.addressBar')
    if (item === 'hidden') return this.i18n.t('pane.showHidden')
    return this.i18n.t(`settings.toolbarItem.${item}`)
  }

  /** 某项工具栏项是否被隐藏（设置页取消勾选） */
  isPaneItemHidden(item: string): boolean {
    return this.paneHiddenItems.includes(item)
  }

  /** 切换某项工具栏项的显示/隐藏，并持久化 */
  togglePaneItemHidden(item: string): void {
    if (this.paneHiddenItems.includes(item)) {
      this.paneHiddenItems = this.paneHiddenItems.filter(i => i !== item)
    } else {
      this.paneHiddenItems = [...this.paneHiddenItems, item]
    }
    this._saveToConfig()
    this.notifyPanels()
  }

  onCustomDragStart(item: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden', event: DragEvent): void {
    this.draggingCustomItem = item
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', item)
    }
  }

  onCustomDragOver(_target: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden', event: DragEvent): void {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  }

  onCustomDrop(target: 'label' | 'path' | 'back' | 'forward' | 'up' | 'refresh' | 'home' | 'filter' | 'bookmark' | 'hidden', event: DragEvent): void {
    event.preventDefault()
    const source = this.draggingCustomItem || (event.dataTransfer?.getData('text/plain') as any)
    if (!source || source === target) return
    const next = this.paneCustomOrder.filter(i => i !== source)
    const targetIndex = next.indexOf(target)
    if (targetIndex < 0) return
    let insertIndex = targetIndex
    const targetEl = event.currentTarget as HTMLElement | null
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect()
      const placeAfter = event.clientX > (rect.left + rect.width / 2)
      if (placeAfter) insertIndex = targetIndex + 1
    }
    next.splice(insertIndex, 0, source)
    this.paneCustomOrder = next as any
    this._saveToConfig()
    this.notifyPanels()
  }

  onCustomDragEnd(): void { this.draggingCustomItem = null }

  resetPaneLayout(): void {
    this.paneCustomOrder = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
    this.paneHiddenItems = []
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
          data.defaultPathMode = cfg.defaultPathMode ?? 'off'
          data.defaultShowHidden = cfg.defaultShowHidden ?? false
          data.openInNewTabByDefault = cfg.openInNewTabByDefault ?? false
          data.singleWorkspaceInstance = cfg.singleWorkspaceInstance ?? true
          data.closeBookmarkPanelOnSelect = cfg.closeBookmarkPanelOnSelect ?? false
          data.dateFormat = cfg.dateFormat ?? ''
          data.transferUploadConcurrency = cfg.transferUploadConcurrency ?? 3
          data.transferDownloadConcurrency = cfg.transferDownloadConcurrency ?? 3
          data.transferFastMode = cfg.transferFastMode ?? false
          data.hideAuthorInfo = cfg.hideAuthorInfo ?? false
          data.paneCustomOrder = cfg.paneCustomOrder ?? ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark']
          data.paneHiddenItems = cfg.paneHiddenItems ?? []
          // 导出书签、路径记忆（传输日志以 localStorage 为准，见下方）
          if (cfg.bookmarks?.length) data.bookmarks = cfg.bookmarks
          if (cfg.pathMemory && Object.keys(cfg.pathMemory).length) data.pathMemory = cfg.pathMemory
          // 传输日志权威存储在 localStorage，始终合并
          try {
            const logs = localStorage.getItem('sftp-plus-transfer-logs')
            if (logs) data.transferLogs = JSON.parse(logs)
          } catch {}
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
    data.defaultPathMode = load('defaultPathMode', 'off')
    data.defaultShowHidden = load('defaultShowHidden', false)
    data.openInNewTabByDefault = load('openInNewTabByDefault', false)
    data.singleWorkspaceInstance = load('singleWorkspaceInstance', true)
    data.closeBookmarkPanelOnSelect = load('closeBookmarkPanelOnSelect', false)
    data.dateFormat = load('dateFormat', '')
    data.transferUploadConcurrency = 3
    data.transferDownloadConcurrency = 3
    data.transferFastMode = false
    data.hideAuthorInfo = false
    try { data.paneCustomOrder = JSON.parse(localStorage.getItem('sftp-plus-pane-custom-order') || '["label","back","forward","up","refresh","home","path","hidden","filter","bookmark"]') } catch { data.paneCustomOrder = ['label', 'back', 'forward', 'up', 'refresh', 'home', 'path', 'hidden', 'filter', 'bookmark'] }
    try { data.paneHiddenItems = JSON.parse(localStorage.getItem('sftp-plus-pane-hidden-items') || '[]') } catch { data.paneHiddenItems = [] }
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
    // 延迟释放 Blob URL，确保浏览器有足够时间启动下载
    setTimeout(() => URL.revokeObjectURL(url), 3000)
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
        const raw = JSON.parse(reader.result as string)
        // 防御原型链污染：只接受普通对象
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new Error(this.i18n.t('settings.invalidFormat'))
        }
        const json: Record<string, any> = Object.create(null)
        for (const k of Object.keys(raw)) {
          if (k === '__proto__' || k === 'constructor') continue
          json[k] = raw[k]
        }

        // 格式校验：兼容新格式（带标识）和旧格式（扁平结构）
        let data = json['tabby-sftp-plus']
        if (!data || typeof data !== 'object') {
          // 拒绝 QuickCmd+ 数据（新格式标识或旧格式前缀）
          if (json['tabby-quick-command-plus'] || json['commands'] || json['groups'] || Object.keys(json).some(k => k.startsWith('qc-plus-'))) {
            throw new Error(this.i18n.t('settings.invalidFormat'))
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
          if (data.defaultPathMode !== undefined) target.defaultPathMode = data.defaultPathMode
          if (data.defaultShowHidden !== undefined) target.defaultShowHidden = data.defaultShowHidden
          if (data.openInNewTabByDefault !== undefined) target.openInNewTabByDefault = data.openInNewTabByDefault
          if (data.singleWorkspaceInstance !== undefined) target.singleWorkspaceInstance = data.singleWorkspaceInstance
          if (data.closeBookmarkPanelOnSelect !== undefined) target.closeBookmarkPanelOnSelect = data.closeBookmarkPanelOnSelect
          if (data.dateFormat !== undefined) target.dateFormat = data.dateFormat
          if (data.transferUploadConcurrency !== undefined) target.transferUploadConcurrency = data.transferUploadConcurrency
          if (data.transferDownloadConcurrency !== undefined) target.transferDownloadConcurrency = data.transferDownloadConcurrency
          if (data.transferFastMode !== undefined) target.transferFastMode = data.transferFastMode
          if (data.hideAuthorInfo !== undefined) target.hideAuthorInfo = data.hideAuthorInfo
          if (data.paneCustomOrder !== undefined) target.paneCustomOrder = data.paneCustomOrder
          if (data.paneHiddenItems !== undefined) target.paneHiddenItems = data.paneHiddenItems
          // 导入书签
          if (data.bookmarks !== undefined) target.bookmarks = data.bookmarks
          this.configService.save()
          // 传输日志只写 localStorage（不污染 config.yaml）
          if (data.transferLogs !== undefined) {
            try { localStorage.setItem('sftp-plus-transfer-logs', JSON.stringify(data.transferLogs)) } catch (e) { log.warn('Import transfer logs failed', e) }
          }
          // 路径记忆导入 localStorage（与 saveCurrentPath 统一路径）
          if (data.paneState?.perHost) {
            for (const [host, entry] of Object.entries(data.paneState.perHost)) {
              // 防御：仅允许合法主机名字符，拒绝注入
              if (!/^[a-zA-Z0-9._:-]+$/.test(host)) continue
              if ((entry as any).savedLocalPath) localStorage.setItem(`sftp-plus-saved-local-path.${host}`, (entry as any).savedLocalPath)
              if ((entry as any).savedRemotePath) localStorage.setItem(`sftp-plus-saved-remote-path.${host}`, (entry as any).savedRemotePath)
              if ((entry as any).pathMode) localStorage.setItem(`sftp-plus-path-mode.${host}`, (entry as any).pathMode)
            }
          }
          alert(this.i18n.t('settings.importComplete'))
        } else {
          alert(this.i18n.t('settings.importUnavailable'))
        }

        // 刷新当前组件属性
        this._refreshFromConfig()
        this.notifyPanels()
      } catch (e: any) {
        alert(e?.message || this.i18n.t('settings.importFailed'))
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
      // 清除 localStorage 中所有 sftp-plus-* 遗留数据
      try {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith('sftp-plus-')) keysToRemove.push(k)
        }
        for (const k of keysToRemove) localStorage.removeItem(k)
      } catch {}
      // 重置组件状态到默认值并刷新
      this._refreshFromConfig()
      this.notifyPanels()
      const msg = this.i18n.t('settings.dataCleared')
      alert(msg)
    } catch (e) {
      log.error('Clear data failed', e)
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
      'sftp-plus-settings.paneCustomOrder': 'paneCustomOrder',
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
  id = SFTP_PLUS_SETTINGS_TAB_ID
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

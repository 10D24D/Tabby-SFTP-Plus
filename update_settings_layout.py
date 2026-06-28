#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
更新 sftp-settings.component.ts 的布局
1. 将自定义颜色合并到 UI 颜色主题同一栏
2. 背景色 → 背景颜色
3. 调整字体大小层次
"""

import sys
import io

# 强制 stdout 使用 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 读取文件
with open('src/sftp-settings.component.ts', 'r', encoding='utf-8') as f:
    content = f.read()

print("开始更新...")

# --- 1. 替换模板部分 ---
old_template = """      <!-- UI 颜色 -->
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
      </div>"""

new_template = """      <!-- UI 颜色 -->
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
      </div>"""

if old_template in content:
    content = content.replace(old_template, new_template)
    print("[OK] 模板部分已更新")
else:
    print("[FAIL] 未找到模板部分")
    # 尝试查找差异
    idx = content.find('<!-- UI 颜色 -->')
    if idx >= 0:
        print(f"找到起始位置: {idx}")
        print("上下文:", content[idx:idx+200])

# --- 2. 替换样式部分 ---

# 2.1 更新 .ss-label 字体大小
old_label_style = """.ss-label { display:block; font-size:14px; font-weight:600; margin-bottom:8px; }"""
new_label_style = """.ss-label { display:block; font-size:16px; font-weight:600; margin-bottom:10px; }
    .ss-sub-label { font-size:14px; font-weight:600; margin-top:16px; margin-bottom:8px; opacity:.85; }"""

if old_label_style in content:
    content = content.replace(old_label_style, new_label_style)
    print("[OK] .ss-label 样式已更新")
else:
    print("[FAIL] 未找到 .ss-label 样式")

# 2.2 添加 .ss-color-field label 样式，并更新 .ss-color-fields 添加 margin-top
old_fields_style = """.ss-color-fields { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; }
    .ss-color-field { display:flex; flex-direction:column; gap:4px; }"""
new_fields_style = """.ss-color-fields { display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start; margin-top:12px; }
    .ss-color-field { display:flex; flex-direction:column; gap:4px; }
    .ss-color-field label { font-size:13px; font-weight:500; }"""

if old_fields_style in content:
    content = content.replace(old_fields_style, new_fields_style)
    print("[OK] .ss-color-field label 样式已添加")
else:
    print("[FAIL] 未找到 .ss-color-fields 样式")

# 2.3 更新 .ss-hint 字体大小
old_hint_style = """font-size:12px; line-height:1.5; margin-top:6px; }"""
new_hint_style = """font-size:11px; line-height:1.5; margin-top:6px; }"""

if old_hint_style in content:
    content = content.replace(old_hint_style, new_hint_style)
    print("[OK] .ss-hint 字体大小已更新")
else:
    print("[FAIL] 未找到 .ss-hint 样式")

# 写回文件
with open('src/sftp-settings.component.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n[OK] 文件已保存，正在验证...")

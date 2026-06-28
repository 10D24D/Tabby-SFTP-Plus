#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# 修复 sftp-terminal-decorator.ts 的最小化支持
# 创建人：DD1024z + Claude
# 创建时间：2026-06-23

import re

file_path = r'D:\My\CodeProject\TabbyPlugins\tabby-FTPS+\src\sftp-terminal-decorator.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 修改 openFloatingPanel 方法的注释和添加最小化恢复逻辑
# 替换方法注释
old_comment = '''  /**
   * 打开浮动 SFTP 面板
   * 面板挂载到当前 tab 的 DOM 元素内，实现 tab 级隔离
   */'''
new_comment = '''  /**
   * 打开/恢复浮动 SFTP 面板
   * 面板挂载到当前 tab 的 DOM 元素内，实现 tab 级隔离
   * 支持最小化恢复：如果面板已创建但被最小化，直接恢复显示
   */'''
content = content.replace(old_comment, new_comment)

# 2. 在 `__sftpPlusOpen` 检查前添加最小化恢复检查
old_check = '''    // 每个 tab 只允许一个面板（按 terminal 实例区分）
    if ((hostEl as any).__sftpPlusOpen) {
      console.log('[SFTP+] Panel already open for this tab')
      return
    }'''
new_check = '''    // 如果面板已创建且被最小化，直接恢复显示
    if ((hostEl as any).__sftpPlusOpen && (hostEl as any).__sftpPlusMinimized) {
      this.restoreFloatingPanel(hostEl)
      return
    }

    // 每个 tab 只允许一个面板（按 terminal 实例区分）
    if ((hostEl as any).__sftpPlusOpen) {
      console.log('[SFTP+] Panel already open for this tab')
      return
    }'''
content = content.replace(old_check, new_check)

# 3. 在创建 overlay 后添加状态标记
old_overlay = '''        overlay.appendChild(panelHost)
        hostEl.appendChild(overlay)
        ;(hostEl as any).__sftpPlusOpen = true'''

new_overlay = '''        overlay.appendChild(panelHost)
        hostEl.appendChild(overlay)
        ;(hostEl as any).__sftpPlusOpen = true
        ;(hostEl as any).__sftpPlusMinimized = false
        ;(hostEl as any).__sftpPlusOverlay = overlay
        ;(hostEl as any).__sftpPlusOrigPosition = origPosition'''

content = content.replace(old_overlay, new_overlay)

# 4. 保存 overlay 和 cmpRef 引用（在创建 cmpRef 后）
# 找到 `const cmp = cmpRef.instance` 这一行，在其后添加存储引用
old_cmp = '''        const cmp = cmpRef.instance'''
new_cmp = '''        const cmp = cmpRef.instance
        ;(hostEl as any).__sftpPlusCmpRef = cmpRef'''

content = content.replace(old_cmp, new_cmp)

# 5. 修改 onClose 回调，清理所有标记
old_onclose = '''        cmp.onClose = () => {
          this.zone.run(() => {
            try { cmpRef.destroy() } catch { /* ignore */ }
            try { overlay.remove() } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusOpen } catch { /* ignore */ }
            // 恢复原始 position
            if (hostEl.style.position === 'relative' && !origPosition) {
              hostEl.style.position = ''
            }
          })
        }'''

new_onclose = '''        cmp.onClose = () => {
          this.zone.run(() => {
            try { cmpRef.destroy() } catch { /* ignore */ }
            try { overlay.remove() } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusOpen } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusMinimized } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusOverlay } catch { /* ignore */ }
            try { delete (hostEl as any).__sftpPlusCmpRef } catch { /* ignore */ }
            // 恢复原始 position
            const savedOrigPos = (hostEl as any).__sftpPlusOrigPosition
            if (hostEl.style.position === 'relative' && !savedOrigPos) {
              hostEl.style.position = ''
            }
            try { delete (hostEl as any).__sftpPlusOrigPosition } catch { /* ignore */ }
          })
        }'''

content = content.replace(old_onclose, new_onclose)

# 6. 在 onClose 回调后添加 onMinimize 回调
old_after_onclose = '''        }

        this.appRef.attachView(cmpRef.hostView)'''

new_after_onclose = '''        }

        cmp.onMinimize = () => {
          this.zone.run(() => {
            overlay.style.display = 'none'
            ;(hostEl as any).__sftpPlusMinimized = true
            cmp.minimized = true
          })
        }

        this.appRef.attachView(cmpRef.hostView)'''

if old_after_onclose in content:
    content = content.replace(old_after_onclose, new_after_onclose)
    print('Added onMinimize callback')
else:
    print('WARNING: Could not find location to add onMinimize callback')

# 7. 在文件末尾的 class 中添加 restoreFloatingPanel 方法
# 找到类的结尾（最后一个 `}` 之前），添加新方法
# 先找到 `private openFloatingPanel` 方法前的位置，在类末尾添加新方法

# 更简单的方法：在 `openFloatingPanel` 方法后（文件末尾附近）添加 `restoreFloatingPanel` 方法
# 找到文件末尾的 `}` （类的结束）
restore_method = '''
  
  /**
   * 恢复最小化的浮动面板
   */
  private restoreFloatingPanel(hostEl: HTMLElement): void {
    const overlay = (hostEl as any).__sftpPlusOverlay as HTMLElement | null
    const cmpRef = (hostEl as any).__sftpPlusCmpRef as any
    
    if (overlay) {
      overlay.style.display = 'flex'
      ;(hostEl as any).__sftpPlusMinimized = false
      if (cmpRef?.instance) {
        cmpRef.instance.minimized = false
      }
      console.log('[SFTP+] Panel restored from minimized state')
    }
  }
'''

# 在类的最后一个 `}` 前插入（在 subscribeUntilDetached 调用之后）
# 找到 `this.subscribeUntilDetached(terminal, { unsubscribe: () => clearInterval(timer) })` 之后
old_end = '    this.subscribeUntilDetached(terminal, { unsubscribe: () => clearInterval(timer) })'
if old_end in content:
    # 找到这一行，在其后添加 restore 方法（在类的结束前）
    lines = content.split('\n')
    new_lines = []
    for i, line in enumerate(lines):
        new_lines.append(line)
        if old_end in line:
            # 找到类的结束位置，在最后一个 `}` 前插入
            pass
    
    # 更简单：直接在文件末尾的最后一个 `}` 前插入
    content = content.rstrip()
    if content.endswith('}'):
        content = content[:-1] + restore_method + '}'
        print('Added restoreFloatingPanel method')
    else:
        print('WARNING: Could not find class end to add restore method')
else:
    print('WARNING: Could not find insertion point for restore method')

# 写回文件
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Decorator update complete!')
print('Check: __sftpPlusMinimized in openFloatingPanel:', '__sftpPlusMinimized' in content)
print('Check: restoreFloatingPanel method:', 'restoreFloatingPanel' in content)

/**
 * 国际化（i18n）服务
 * 功能描述：提供多语言支持，自动跟随 Tabby 系统语言设置
 * 创建人：DD1024z + Claude
 * 创建时间：2026-06-21
 * 修改人：DD1024z + Claude
 * 修改时间：2026-06-23
 */
import { Injectable, Optional } from '@angular/core'

export type Locale = 'zh-CN' | 'en-US'

const TRANSLATIONS: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    'app.title': 'SFTP+ 文件管理器',
    'app.open': '打开 SFTP',
    'app.close': '关闭',
    'app.confirm': '确认',
    'app.cancel': '取消',
    'app.delete': '删除',
    'app.deleteFile': '删除文件',
    'app.deleteFolder': '删除文件夹',
    'app.deleteMultiple': '删除多个项目',
    'app.deleteConfirmFile': '确实要删除此文件吗？',
    'app.deleteConfirmFolder': '确实要删除此文件夹吗？',
    'app.deleteConfirmMultiple': '确实要删除这 {count} 个项目吗？',
    'app.rename': '重命名',
    'app.refresh': '刷新',
    'app.upload': '上传',
    'app.download': '下载',
    'app.newFolder': '新建文件夹',
    'app.newFile': '新建文件',
    'app.loading': '加载中...',
    'app.error': '错误',
    'app.success': '成功',
    'app.yes': '是',
    'app.no': '否',
    'app.all': '全部',
    'app.export': '导出',
    'app.clear': '清除',
    'app.optional': '可选',
    'app.settings': '设置',
    'app.modeSwitchSsh': 'SSH',
    'app.modeSwitchSftp': 'SFTP',
    'app.backToTerminal': '返回终端',

    'pane.local': '本地',
    'pane.remote': '远程',
    'pane.path': '路径',
    'pane.up': '返回上级',
    'pane.home': '主目录',
    'pane.go': '跳转',
    'pane.refresh': '刷新',
    'pane.filter': '过滤...',
    'pane.filterBtn': '文件过滤',
    'pane.showHidden': '显示隐藏文件',
    'pane.hideHidden': '不显示隐藏文件',
    'pane.sortByName': '按名称排序',
    'pane.sortBySize': '按大小排序',
    'pane.sortByModified': '按修改时间排序',
    'pane.selectAll': '全选',
    'pane.clearSelection': '清除选择',
    'pane.items': '{count} 项',
    'pane.copyPath': '复制路径',
    'pane.openFolder': '打开文件夹',
    'pane.noMatch': '无匹配文件',
    'pane.empty': '空文件夹',
    'pane.loading': '加载中…',

    'file.name': '名称',
    'file.type': '类型',
    'file.size': '大小',
    'file.modified': '修改时间',
    'file.created': '创建时间',
    'file.accessed': '访问时间',
    'file.permissions': '权限',
    'file.owner': '所有者',
    'file.group': '组',
    'file.mode': '模式',
    'file.path': '路径',
    'file.ext': '扩展名',
    'file.columns': '显示列',
    'file.inaccessible': '受限',
    'file.open': '打开',
    'file.edit': '编辑',
    'file.copy': '复制',
    'file.cut': '剪切',
    'file.paste': '粘贴',
    'file.delete': '删除',
    'file.rename': '重命名',
    'file.newFolder': '新建文件夹',
    'file.newFile': '新建文件',
    'file.properties': '属性',
    'file.openWith': '打开方式',
    'file.showInFolder': '在文件夹中显示',
    'file.adjustCol': '将列调整为合适的大小',
    'file.adjustAllCols': '将所有列调整为合适的大小',

    'transfer.upload': '上传',
    'transfer.download': '下载',
    'transfer.progress': '进度',
    'transfer.speed': '速度',
    'transfer.remaining': '剩余时间',
    'transfer.cancel': '取消',
    'transfer.closePanel': '关闭传输面板',
    'transfer.pause': '暂停',
    'transfer.resume': '继续',
    'transfer.paused': '已暂停',
    'transfer.inProgress': '传输中',
    'transfer.clearCompleted': '清除已完成',
    'transfer.queue': '传输队列',
    'transfer.log': '传输记录',
    'transfer.noTransfers': '无进行中的传输',
    'transfer.clearConfirm': '确定要清空所有传输记录吗？此操作不可撤销。',
    'transfer.clearTitle': '确认清空',
    'transfer.replaceConfirm': '文件已存在，是否替换？',
    'transfer.replaceTitle': '确认替换',
    'transfer.deleteConfirm': '确定要删除选中的 {count} 个项目吗？',
    'transfer.deleteTitle': '确认删除',

    'bookmark.title': '书签',
    'bookmark.add': '添加书签',
    'bookmark.addLocal': '当前添加',
    'bookmark.addGlobal': '全局添加',
    'bookmark.remove': '移除书签',
    'bookmark.edit': '编辑书签',
    'bookmark.noBookmarks': '暂无书签',
    'bookmark.name': '书签名称',
    'bookmark.path': '路径',
    'bookmark.save': '保存书签',
    'bookmark.global': '全局书签',
    'bookmark.forConnection': '当前连接',

    'permission.title': '修改权限',
    'permission.owner': '所有者',
    'permission.group': '用户组',
    'permission.others': '其他用户',
    'permission.read': '读',
    'permission.write': '写',
    'permission.execute': '执行',
    'permission.mode': '权限值 (八进制)',

    'notify.sftpOpened': 'SFTP 已打开',
    'notify.noSSHSession': '当前标签页没有 SSH 会话',
    'notify.transferComplete': '传输完成',
    'notify.transferFailed': '传输失败',
    'notify.connectionLost': '连接已断开',
    'notify.connected': '已连接到',
    'notify.connecting': '正在连接到',
  },
  'en-US': {
    'app.title': 'SFTP+ File Manager',
    'app.open': 'Open SFTP',
    'app.close': 'Close',
    'app.confirm': 'Confirm',
    'app.cancel': 'Cancel',
    'app.delete': 'Delete',
    'app.deleteFile': 'Delete File',
    'app.deleteFolder': 'Delete Folder',
    'app.deleteMultiple': 'Delete Multiple Items',
    'app.deleteConfirmFile': 'Are you sure you want to delete this file?',
    'app.deleteConfirmFolder': 'Are you sure you want to delete this folder?',
    'app.deleteConfirmMultiple': 'Are you sure you want to delete these {count} items?',
    'app.rename': 'Rename',
    'app.refresh': 'Refresh',
    'app.upload': 'Upload',
    'app.download': 'Download',
    'app.newFolder': 'New Folder',
    'app.newFile': 'New File',
    'app.loading': 'Loading...',
    'app.error': 'Error',
    'app.success': 'Success',
    'app.yes': 'Yes',
    'app.no': 'No',
    'app.all': 'All',
    'app.export': 'Export',
    'app.clear': 'Clear',
    'app.optional': 'Optional',
    'app.settings': 'Settings',
    'app.modeSwitchSsh': 'SSH',
    'app.modeSwitchSftp': 'SFTP',
    'app.backToTerminal': 'Back to Terminal',

    'pane.local': 'Local',
    'pane.remote': 'Remote',
    'pane.path': 'Path',
    'pane.up': 'Go Up',
    'pane.home': 'Home',
    'pane.go': 'Go',
    'pane.refresh': 'Refresh',
    'pane.filter': 'Filter...',
    'pane.filterBtn': 'File Filter',
    'pane.showHidden': 'Show Hidden Files',
    'pane.hideHidden': 'Hide Hidden Files',
    'pane.sortByName': 'Sort by Name',
    'pane.sortBySize': 'Sort by Size',
    'pane.sortByModified': 'Sort by Modified',
    'pane.selectAll': 'Select All',
    'pane.clearSelection': 'Clear Selection',
    'pane.items': '{count} items',
    'pane.copyPath': 'Copy Path',
    'pane.openFolder': 'Open Folder',
    'pane.noMatch': 'No matching files',
    'pane.empty': 'Empty folder',
    'pane.loading': 'Loading…',

    'file.name': 'Name',
    'file.type': 'Type',
    'file.size': 'Size',
    'file.modified': 'Modified',
    'file.created': 'Created',
    'file.accessed': 'Accessed',
    'file.permissions': 'Permissions',
    'file.owner': 'Owner',
    'file.group': 'Group',
    'file.mode': 'Mode',
    'file.path': 'Path',
    'file.ext': 'Ext',
    'file.columns': 'Columns',
    'file.inaccessible': 'Inaccessible',
    'file.open': 'Open',
    'file.edit': 'Edit',
    'file.copy': 'Copy',
    'file.cut': 'Cut',
    'file.paste': 'Paste',
    'file.delete': 'Delete',
    'file.rename': 'Rename',
    'file.newFolder': 'New Folder',
    'file.newFile': 'New File',
    'file.properties': 'Properties',
    'file.openWith': 'Open With',
    'file.showInFolder': 'Show in Folder',
    'file.adjustCol': 'Fit Column Width',
    'file.adjustAllCols': 'Fit All Columns',

    'transfer.upload': 'Upload',
    'transfer.download': 'Download',
    'transfer.progress': 'Progress',
    'transfer.speed': 'Speed',
    'transfer.remaining': 'Remaining',
    'transfer.cancel': 'Cancel',
    'transfer.closePanel': 'Close transfer panel',
    'transfer.pause': 'Pause',
    'transfer.resume': 'Resume',
    'transfer.paused': 'Paused',
    'transfer.inProgress': 'In Progress',
    'transfer.clearCompleted': 'Clear Completed',
    'transfer.queue': 'Transfer Queue',
    'transfer.log': 'Transfer History',
    'transfer.noTransfers': 'No active transfers',
    'transfer.clearConfirm': 'Clear all transfer records? This action cannot be undone.',
    'transfer.clearTitle': 'Confirm Clear',
    'transfer.replaceConfirm': 'File already exists. Replace?',
    'transfer.replaceTitle': 'Confirm Replace',
    'transfer.deleteConfirm': 'Delete {count} selected items?',
    'transfer.deleteTitle': 'Confirm Delete',

    'bookmark.title': 'Bookmarks',
    'bookmark.add': 'Add Bookmark',
    'bookmark.addLocal': 'Add Local',
    'bookmark.addGlobal': 'Add Global',
    'bookmark.remove': 'Remove Bookmark',
    'bookmark.edit': 'Edit Bookmark',
    'bookmark.noBookmarks': 'No bookmarks yet',
    'bookmark.name': 'Bookmark Name',
    'bookmark.path': 'Path',
    'bookmark.save': 'Save Bookmark',
    'bookmark.global': 'Global Bookmarks',
    'bookmark.forConnection': 'This Connection',

    'permission.title': 'Edit Permissions',
    'permission.owner': 'Owner',
    'permission.group': 'Group',
    'permission.others': 'Others',
    'permission.read': 'Read',
    'permission.write': 'Write',
    'permission.execute': 'Execute',
    'permission.mode': 'Mode (Octal)',

    'notify.sftpOpened': 'SFTP Opened',
    'notify.noSSHSession': 'No SSH session on current tab',
    'notify.transferComplete': 'Transfer Complete',
    'notify.transferFailed': 'Transfer Failed',
    'notify.connectionLost': 'Connection Lost',
    'notify.connected': 'Connected to',
    'notify.connecting': 'Connecting to',
  },
}

/**
 * 检测语言是否为类中文
 */
function isZhLike(lang: string): boolean {
  return /^zh/i.test(lang)
}

@Injectable()
export class SftpI18nService {
  private locale: Locale = 'zh-CN'

  constructor(@Optional() configService?: any) {
    // 策略0: SFTP+ 设置页手动选择的语言（最高优先级）
    try {
      const sftpLocale = localStorage.getItem('sftp-plus-locale')
      if (sftpLocale === 'zh-CN' || sftpLocale === 'en-US') {
        this.locale = sftpLocale
        return
      }
    } catch {}

    // 策略1: Tabby ConfigService（仅 Angular DI 场景）
    if (configService) {
      try {
        const cfg = configService.get()
        const lang = cfg?.appearance?.language ?? cfg?.language ?? ''
        if (lang) {
          this.locale = isZhLike(String(lang)) ? 'zh-CN' : 'en-US'
          return
        }
      } catch {}
    }

    // 策略2: Tabby localStorage（多种可能的 key）
    try {
      const keys = ['locale', 'language', 'tabby-language', 'tabby-locale',
        'config', 'tabby-config', 'settings', 'tabby-settings']
      for (const key of keys) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        // 尝试直接匹配语言值
        if (isZhLike(raw)) { this.locale = 'zh-CN'; return }
        if (/^en/i.test(raw)) { this.locale = 'en-US'; return }
        // 尝试解析 JSON 对象（Tabby config 通常存储为 JSON）
        try {
          const obj = JSON.parse(raw)
          const lang = obj?.appearance?.language
            || obj?.appearance?.locale
            || obj?.language
            || obj?.locale
            || obj?.app?.language
            || obj?.general?.language
          if (lang) {
            this.locale = isZhLike(String(lang)) ? 'zh-CN' : 'en-US'
            return
          }
        } catch { /* 不是 JSON，忽略 */ }
      }
    } catch {}

    // 策略3: navigator.languages 数组（Electron 中更多语言选项）
    try {
      const langs = navigator.languages || [navigator.language]
      const zhLang = langs.find(l => /^zh/i.test(l))
      if (zhLang) {
        this.locale = 'zh-CN'
        return
      }
    } catch {}

    // 策略4: navigator.language 单值
    try {
      const navLang = navigator.language || ''
      if (navLang) {
        this.locale = isZhLike(navLang) ? 'zh-CN' : 'en-US'
        return
      }
    } catch {}

    // 最终回退：中文（用户区域为中国）
    this.locale = 'zh-CN'
  }

  getLocale(): Locale {
    return this.locale
  }

  t(key: string, params?: Record<string, string | number>): string {
    let text = TRANSLATIONS[this.locale][key]
    if (text === undefined) {
      // 回退到英文
      text = TRANSLATIONS['en-US'][key] ?? key
    }
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }
}

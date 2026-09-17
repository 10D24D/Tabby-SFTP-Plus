/**
 * 内置默认文件图标映射（无需用户配置即生效）
 * 功能描述：集中维护「扩展名 → 内置 svg」的默认映射，供文件列表与设置页共用，避免重复维护
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-24
 * 修改人：DD1024z + Grok 4.6
 * 修改时间：2026-09-17 — 抽出 resolveBundledIconDir，兼容开发链接 / 手动安装 / 源码三种内置图标布局
 */

import * as fs from 'fs'

/** 内置默认扩展名 → 图标映射（命中 dist/assets/icons 内置 svg） */
export const DEFAULT_ICON_MAP: Record<string, string> = {
  // 文本类
  '.txt': 'text.svg', '.log': 'text.svg', '.md': 'text.svg', '.markdown': 'text.svg',
  '.rtf': 'text.svg', '.csv': 'text.svg', '.ini': 'text.svg', '.conf': 'text.svg', '.cfg': 'text.svg',
  '.json': 'code.svg', '.xml': 'code.svg', '.yml': 'code.svg', '.yaml': 'code.svg',
  '.js': 'code.svg', '.ts': 'code.svg', '.jsx': 'code.svg', '.tsx': 'code.svg', '.mjs': 'code.svg',
  '.py': 'code.svg', '.java': 'code.svg', '.go': 'code.svg', '.c': 'code.svg', '.cpp': 'code.svg',
  '.h': 'code.svg', '.cs': 'code.svg', '.php': 'code.svg', '.rb': 'code.svg', '.rs': 'code.svg',
  '.sh': 'code.svg', '.bat': 'code.svg', '.ps1': 'code.svg', '.sql': 'code.svg', '.html': 'code.svg',
  '.css': 'code.svg', '.scss': 'code.svg', '.less': 'code.svg', '.vue': 'code.svg',
  // 文档类
  '.pdf': 'pdf.svg',
  '.doc': 'doc.svg', '.docx': 'doc.svg', '.wps': 'doc.svg',
  '.ppt': 'ppt.svg', '.pptx': 'ppt.svg', '.dps': 'ppt.svg',
  '.xls': 'xls.svg', '.xlsx': 'xls.svg', '.et': 'xls.svg',
  // 压缩包
  '.zip': 'zip.svg', '.rar': 'zip.svg', '.7z': 'zip.svg', '.tar': 'zip.svg',
  '.gz': 'zip.svg', '.bz2': 'zip.svg', '.xz': 'zip.svg', '.tgz': 'zip.svg',
  // 可执行程序
  '.exe': 'exe.svg', '.msi': 'exe.svg', '.com': 'exe.svg', '.scr': 'exe.svg',
  '.dmg': 'exe.svg', '.pkg': 'exe.svg', '.deb': 'exe.svg', '.rpm': 'exe.svg',
  '.run': 'exe.svg', '.bin': 'exe.svg', '.AppImage': 'exe.svg', '.apk': 'exe.svg',
  // 图片
  '.png': 'image.svg', '.jpg': 'image.svg', '.jpeg': 'image.svg', '.gif': 'image.svg',
  '.bmp': 'image.svg', '.webp': 'image.svg', '.svg': 'image.svg', '.ico': 'image.svg',
  '.tiff': 'image.svg', '.tif': 'image.svg', '.heic': 'image.svg', '.avif': 'image.svg',
  // 音频
  '.mp3': 'audio.svg', '.wav': 'audio.svg', '.flac': 'audio.svg', '.m4a': 'audio.svg',
  '.ogg': 'audio.svg', '.aac': 'audio.svg', '.wma': 'audio.svg', '.ape': 'audio.svg',
  // 视频
  '.mp4': 'video.svg', '.mkv': 'video.svg', '.avi': 'video.svg', '.mov': 'video.svg',
  '.webm': 'video.svg', '.flv': 'video.svg', '.wmv': 'video.svg', '.m4v': 'video.svg',
}

/** 内置图标文件名列表（来自 DEFAULT_ICON_MAP 的值去重 + 兜底 default.svg + 文件夹图标） */
export const BUILTIN_ICON_FILES: string[] = (() => {
  const set = new Set<string>(Object.values(DEFAULT_ICON_MAP))
  set.add('default.svg')
  set.add('folder.svg')
  return [...set]
})()

/** 文件夹图标文件名（只读展示，不参与扩展名映射编辑） */
export const FOLDER_ICON_SVG = 'folder.svg'

/** 内置图标 → 关联扩展名列表（用于设置页预览展示；default.svg 无映射扩展名） */
export const BUILTIN_ICON_EXTS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {}
  for (const [ext, svg] of Object.entries(DEFAULT_ICON_MAP)) {
    ;(m[svg] ||= []).push(ext)
  }
  return m
})()

/**
 * 解析插件内置图标目录。兼容：
 *   `<plugin>/dist/assets/icons`  开发链接 / 标准安装
 *   `<plugin>/assets/icons`       手动把 dist 内容拷到插件根
 *   `<plugin>/src/assets/icons`   源码目录直接链接
 */
export function resolveBundledIconDir(pluginPath?: string | null): string {
  if (!pluginPath) return ''
  const base = String(pluginPath).replace(/\\/g, '/').replace(/\/+$/, '')
  const candidates = [
    `${base}/dist/assets/icons`,
    `${base}/assets/icons`,
    `${base}/src/assets/icons`,
  ]
  try {
    return candidates.find(dir => fs.existsSync(dir)) || ''
  } catch {
    return ''
  }
}

/** 从 Tabby bootstrapData.installedPlugins 解析 SFTP+ 内置图标目录 */
export function resolveSftpPlusBundledIconDir(bootstrapData: any): string {
  try {
    const info = bootstrapData?.installedPlugins?.find(
      (p: any) => p.packageName === 'tabby-sftp-plus',
    )
    return resolveBundledIconDir(info?.path)
  } catch {
    return ''
  }
}

/**
 * SFTP+ 剪贴板复制工具（查看器 / 编辑器共用）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-05
 * 功能描述：封装 Electron clipboard，提供复制文本与复制图片（dataURL）能力
 */
import { log } from '../../services/sftp-logger'

/** 复制纯文本到系统剪贴板。返回是否成功。 */
export function copyTextToClipboard(text: string): boolean {
  try {
    const electron = (window as any).require('electron')
    electron.clipboard.writeText(text)
    return true
  } catch (e) {
    log.warn('copyTextToClipboard failed', e)
    return false
  }
}

/** 复制图片到系统剪贴板（dataURL）。返回是否成功。 */
export function copyImageToClipboard(dataUrl: string): boolean {
  try {
    const electron = (window as any).require('electron')
    const img = electron.nativeImage.createFromDataURL(dataUrl)
    electron.clipboard.writeImage(img)
    return true
  } catch (e) {
    log.warn('copyImageToClipboard failed', e)
    return false
  }
}

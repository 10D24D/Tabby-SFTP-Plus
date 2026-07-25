/**
 * 本地移入回收站
 * 功能描述：优先 Electron shell.trashItem；Windows 上回退到 PowerShell VB FileIO。
 *   刻意不使用 -EncodedCommand（base64），避免被 360 等安全软件判为「PowerShell 命令执行攻击」。
 * 创建人：DD1024z + Composer
 * 创建时间：2026-07-25
 */
import { execFile } from 'child_process'
import * as os from 'os'

import { log } from '../../services/sftp-logger'

function getElectronShell(): { trashItem?: (fullPath: string) => Promise<void> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron')
    if (electron?.shell?.trashItem) return electron.shell
  } catch { /* ignore */ }
  return null
}

/**
 * 将本地路径移入系统回收站。
 * @throws 所有方式均失败时抛出错误（调用方不应静默改走永久删除）
 */
export async function trashLocalPath(fullPath: string, isDirectory: boolean): Promise<void> {
  const target = String(fullPath).replace(/\0/g, '')
  if (!target) throw new Error('empty path')

  const shell = getElectronShell()
  if (shell?.trashItem) {
    try {
      await shell.trashItem(target)
      return
    } catch (err) {
      log.warn('shell.trashItem failed, trying Windows fallback:', target, err)
    }
  }

  if (os.platform() !== 'win32') {
    throw new Error('trash API unavailable')
  }

  await trashViaPowerShellEnv(target, isDirectory)
}

/**
 * Windows 回退：路径经环境变量传入，脚本本身为静态字符串。
 * 不用 -EncodedCommand / -ExecutionPolicy Bypass，降低杀软误报。
 */
function trashViaPowerShellEnv(fullPath: string, isDirectory: boolean): Promise<void> {
  const method = isDirectory ? 'DeleteDirectory' : 'DeleteFile'
  // 脚本固定，路径只从 env 读取——无字符串拼接注入面
  const command =
    `Add-Type -AssemblyName Microsoft.VisualBasic; ` +
    `$p = $env:SFTP_PLUS_TRASH_PATH; ` +
    `if (-not $p) { throw 'SFTP_PLUS_TRASH_PATH missing' }; ` +
    `[Microsoft.VisualBasic.FileIO.FileSystem]::${method}(` +
    `$p,` +
    `[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,` +
    `[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)`

  return new Promise<void>((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
      {
        timeout: isDirectory ? 30000 : 15000,
        windowsHide: true,
        env: {
          ...process.env,
          SFTP_PLUS_TRASH_PATH: fullPath,
        },
      },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.toString?.() || err.message || String(err)))
          return
        }
        resolve()
      },
    )
  })
}

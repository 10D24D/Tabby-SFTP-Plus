/**
 * 本地移入回收站
 * 功能描述：优先 Electron shell.trashItem；Windows 上回退到 PowerShell VB FileIO。
 *   刻意不使用 -EncodedCommand（base64），避免被 360 等安全软件判为「PowerShell 命令执行攻击」。
 * @创建人：DD1024z + Composer
 * @创建时间：2026-07-25
 * @修改人：DD1024z + Hy3
 * @修改时间：2026-10-19 — 两处实测缺陷修复：
 *   ① `shell.trashItem` 在部分环境**每次必失败**（实测 Tabby 内报 `Failed to create FileOperation
 *      instance`，见 log.txt），原实现每次都白调一次再回退；现改为「探测一次并记住结果」，
 *      失败后本进程后续直接走回退，不再反复失败 + 刷告警日志。
 *   ② 原回退是**每个文件启动一次 powershell.exe**（实测 ≈1s/个且串行）——多选删除时列表像卡死。
 *      现新增 `trashLocalPaths` 批量接口：一次进程把整批路径全部送进回收站，失败项逐条回报。
 *      路径经环境变量 JSON 传入，脚本本身仍是静态字符串（无拼接注入面，也不触发杀软误报）。
 */
import { execFile } from 'child_process'
import * as os from 'os'

import { log } from '../../services/sftp-logger'

/** 待回收项：路径 + 是否目录（VB 的 DeleteFile/DeleteDirectory 是两个不同方法） */
export interface TrashItem {
  path: string
  isDirectory: boolean
}

function getElectronShell(): { trashItem?: (fullPath: string) => Promise<void> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron')
    if (electron?.shell?.trashItem) return electron.shell
  } catch { /* ignore */ }
  return null
}

/**
 * `shell.trashItem` 可用性探测结果：null = 尚未探测，false = 本进程内已确认不可用。
 * ★ 2026-10-19：实测多台 Windows 上它恒抛 `Failed to create FileOperation instance`，
 *   每次删除都先失败一次既浪费又刷日志，故失败后不再重试。
 */
let shellTrashUsable: boolean | null = null

/**
 * 将单个本地路径移入系统回收站（批量接口的单项封装）。
 * @throws 所有方式均失败时抛出错误（调用方不应静默改走永久删除）
 */
export async function trashLocalPath(fullPath: string, isDirectory: boolean): Promise<void> {
  const res = await trashLocalPaths([{ path: fullPath, isDirectory }])
  if (res.failed.length) throw new Error(res.failed[0].reason)
}

/**
 * 批量移入回收站。
 * @returns failed —— 未能回收的项（含原因），调用方据此提示；成功项不出现在结果里。
 * 说明：Windows 上整批只用**一次** powershell 调用，避免多选删除时的串行进程启动开销。
 */
export async function trashLocalPaths(items: TrashItem[]): Promise<{ failed: Array<{ path: string; reason: string }> }> {
  const failed: Array<{ path: string; reason: string }> = []
  const clean: TrashItem[] = []
  for (const it of items) {
    const p = String(it?.path ?? '').replace(/\0/g, '')
    if (!p) { failed.push({ path: String(it?.path ?? ''), reason: 'empty path' }); continue }
    clean.push({ path: p, isDirectory: !!it.isDirectory })
  }
  if (!clean.length) return { failed }

  // ① Electron 原生通道（macOS/Linux 以及部分 Windows 环境可用，且无进程启动开销）
  if (shellTrashUsable !== false) {
    const shell = getElectronShell()
    if (shell?.trashItem) {
      const results = await Promise.all(clean.map(async (it) => {
        try {
          await shell.trashItem!(it.path)
          return null
        } catch (err) {
          return { item: it, reason: (err as Error)?.message || String(err) }
        }
      }))
      const bad = results.filter(Boolean) as Array<{ item: TrashItem; reason: string }>
      if (!bad.length) {
        shellTrashUsable = true
        return { failed }
      }
      // 第一次就失败 ⇒ 判定本进程内该通道不可用，后续删除不再白跑
      if (shellTrashUsable === null) {
        shellTrashUsable = false
        log.warn('shell.trashItem unavailable in this environment, switching to batch fallback:', bad[0].reason)
      }
      clean.length = 0
      clean.push(...bad.map(b => b.item))
    } else {
      shellTrashUsable = false
    }
  }

  // ② 非 Windows 没有回退通道
  if (os.platform() !== 'win32') {
    for (const it of clean) failed.push({ path: it.path, reason: 'trash API unavailable' })
    return { failed }
  }

  // ③ Windows 批量回退：按批切分（每批 ≤80 项），避免超长环境变量（Windows 环境块上限 32767 字符）
  const CHUNK = 80
  for (let i = 0; i < clean.length; i += CHUNK) {
    const batch = await trashViaPowerShellBatch(clean.slice(i, i + CHUNK))
    failed.push(...batch)
  }
  return { failed }
}

/**
 * Windows 回退：整批路径以 JSON 经环境变量传入，脚本本身为静态字符串。
 * 不用 -EncodedCommand / -ExecutionPolicy Bypass，降低杀软误报。
 * 输出约定：失败项逐行写到 stderr，格式 `<path> :: <message>`。
 */
function trashViaPowerShellBatch(items: TrashItem[]): Promise<Array<{ path: string; reason: string }>> {
  const command =
    `Add-Type -AssemblyName Microsoft.VisualBasic; ` +
    `$raw = $env:SFTP_PLUS_TRASH_PATHS; ` +
    `if (-not $raw) { throw 'SFTP_PLUS_TRASH_PATHS missing' }; ` +
    `$list = $raw | ConvertFrom-Json; ` +
    `$errs = @(); ` +
    `foreach ($it in $list) { ` +
    `try { ` +
    `if ($it.dir) { ` +
    `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($it.path,` +
    `[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,` +
    `[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin) ` +
    `} else { ` +
    `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($it.path,` +
    `[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,` +
    `[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin) ` +
    `} } catch { $errs += ($it.path + ' :: ' + $_.Exception.Message) } }; ` +
    `if ($errs.Count -gt 0) { [Console]::Error.WriteLine(($errs -join [Environment]::NewLine)); exit 2 }`

  const payload = JSON.stringify(items.map(it => ({ path: it.path, dir: it.isDirectory })))
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
      {
        // 整批一次性处理，按项数放宽超时（单个目录最多 30s 的量级）
        timeout: Math.min(180000, 15000 + items.length * 15000),
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          SFTP_PLUS_TRASH_PATHS: payload,
        },
      },
      (err, _stdout, stderr) => {
        if (!err) { resolve([]); return }
        const text = stderr?.toString?.() ?? ''
        // 逐行解析 `<path> :: <message>`；解析不出的行归到「整批失败」
        const out: Array<{ path: string; reason: string }> = []
        for (const line of text.split(/\r?\n/)) {
          const t = line.trim()
          if (!t) continue
          const idx = t.indexOf(' :: ')
          if (idx > 0) out.push({ path: t.slice(0, idx), reason: t.slice(idx + 4) })
        }
        if (!out.length) {
          const reason = text.trim() || err.message || String(err)
          log.warn('trash batch failed:', reason)
          for (const it of items) out.push({ path: it.path, reason })
        }
        resolve(out)
      },
    )
  })
}

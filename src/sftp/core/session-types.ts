/**
 * SSH/SFTP 会话类型定义
 * 功能描述：为宿主 SSHSession/SFTPSession 定义最小可运行接口，替代 any 类型。
 * @创建人：Qoder (AI Assistant)
 * @创建时间：2026-10-20
 * @修改人：DD1024z + Hy4 preview
 * @修改时间：2026-10-20 — SshSession 改为 extends SSHSessionLike（补 openSFTP），消除与面板
 *              SSHSessionLike 的三处参数不兼容与一处「=== 恒假」的类型掩盖。
 */

import type { Observable } from 'rxjs'
import type { SFTPSessionLike, SSHSessionLike } from '../../services/sftp.service'

/**
 * SSH 会话的最小可运行接口（消除 any）
 * ★ 2026-10-20 全量审计：改为 `extends SSHSessionLike`。此前本接口只描述观察类成员
 *   （open / willDestroy$ / …），唯独没有 `openSFTP`，于是 `SshSession` 与
 *   `SSHSessionLike` 在类型上「无重叠」——tsc 直接报 3 处参数不兼容，并把
 *   `_leftSshSession === this.sshSession` 这类身份比较判成永假（掩盖真实缺陷）。
 *   这些值全部来自宿主真实 SSHSession（必然带 openSFTP），收窄为必需成员是正确的。
 */
export interface SshSession extends SSHSessionLike {
  /** 会话是否已建立 */
  open: boolean
  /** 会话标识（host:port:user） */
  id?: string
  /** 连接配置 */
  profile?: ProfileInfo
  /** 会话关闭时发射（Observable） */
  closed$?: Observable<void>
  /** 会话即将销毁时发射 */
  willDestroy$?: Observable<void>
  /** 是否已销毁 */
  destroyed?: boolean
  /** 销毁完成时发射 */
  destroyed$?: Observable<void>
  /** 断开连接 */
  disconnect?(): void
}

/** 连接配置信息（消除 profile 的 any） */
export interface ProfileInfo {
  id?: string
  name?: string
  host?: string
  port?: number
  user?: string
  username?: string
  options?: Record<string, unknown>
}

/** 连接选择器中的候选连接 */
export interface ConnectionOption {
  id: string
  label: string
  host: string
  port: number
  user: string
  sshSession: SshSession | null
  profile?: ProfileInfo
  /** 是否为当前激活的连接 */
  active?: boolean
  /** 是否为未打开的配置连接 */
  unopened?: boolean
}

/** 面板行数据源的统一类型（消除 rowsSource 的 any） */
export interface PaneRowSource {
  entries: LocalEntry[]
  /** 当前路径 */
  path: string
  /** 是否正在加载 */
  loading: boolean
  /** 错误信息（如有） */
  error?: string
}

/** 端点引用中的 session 类型（替代 any） */
export interface EndpointSession extends SFTPSessionLike {
  // SFTP 会话额外方法已继承自 SFTPSessionLike
}

import type { LocalEntry } from './panel-types'

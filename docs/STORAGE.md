# SFTP+ 存储结构文档

> 创建人：DD1024z + Deepseek-V4-Flash
> 创建时间：2026-06-25
> 修改人：DD1024z + Grok 4.6
> 修改时间：2026-09-17 — 按 v2.3.0 校正：主存储为 config.yaml，paneState `__nonStructural`，传输日志仍走 localStorage

## 概述

v2.x 起，设置、书签和面板 UI 状态的**权威存储**是 Tabby 的 `config.yaml` 段 `tabby-sftp-plus`（由 `SftpPlusConfigProvider` 声明默认值，`SftpConfigService` 做嵌套读写与 flush）。

localStorage 仍用于：

- **传输日志**（避免把大量历史写入 yaml）
- 部分瞬时 UI（查看/编辑器最大化）
- 旧版扁平 key 的升级回退

导入/导出在设置页收集 `config.store` + 传输日志，再写回两端。

## 主存储：`config.yaml` → `tabby-sftp-plus`

默认值见 `src/tabby/config-provider.ts` 的 `defaultSftpPlusConfig()`。发布相关字段：

| 字段 | 说明 |
|------|------|
| `lang` / `theme` / `fontSize` / 配色 | 界面 |
| `editableFileExtensions` | 额外可查看/编辑扩展名（无点、小写） |
| `allowViewEditAllFiles` | 允许查看与编辑所有非目录类型（二进制编辑仍拦截） |
| `panelHotkeys` | 面板多绑定快捷键 |
| `conflictDigestEnabled` | issue #15：冲突时计算内容摘要 |
| `conflictAutoSkipSameContent` | 摘要确认相同则自动跳过 |
| `conflictDigestMaxSizeMB` / `conflictDigestAlgo` | 摘要大小上限与算法（默认 sha1） |
| `bookmarks` | 书签数组 |
| `paneState` | 布局、列、per-host 路径记忆等 UI 状态 |
| `panelGeometry` | 浮动面板位置/尺寸 |
| `pathMemory` | **仅兼容导出/导入**，业务不再写入 |
| `transferLogs` | **不再作为权威存储**；导入时日志只写 localStorage |

### `paneState` 与 `__nonStructural`

Tabby 的 ConfigProxy 会把默认值为 `{}` 的对象当成叶子：getter 返回脱离 `_store` 的克隆，深路径写入不会进 `config.yaml`。

因此默认值必须是：

```typescript
paneState: { __nonStructural: true }
```

首次读取时 ConfigProxy 会 `real[key]=clone` 并剥掉该标记，之后 `paneState/layout/mode`、`paneState/perHost/{host}/pathMode` 等才能落盘。

### `paneState` 嵌套结构

```
paneState/
  layout/
    mode
    horizontalSplitRatio
    verticalSplitRatio
  local|remote/
    sort
    cols
    colsOrder
    colWidths
  perHost/{user@host}/
    pathMode
    rememberPath
    savedLocalPath
    savedRemotePath
```

`SftpConfigService` 在首次注入时把旧扁平 key（如 `sftp-plus-path-mode.{host}`）迁到上述路径，**旧 key 不删**，`get()` 仍双读回退。

路径模式与「上次路径」在面板侧仍会同步写一份 localStorage（`sftp-plus-path-mode.{host}` 等），与 yaml 双写，避免多窗口/升级空窗。

## 传输日志：localStorage

| 键 | 用途 |
|----|------|
| `sftp-plus-transfer-logs` | `TransferLogEntry[]`，最多 1000 条 |
| `sftp-plus-transfer-logs-deleted` | 已删 id，防止多窗口 save 合并把记录救活 |

```typescript
interface TransferLogEntry {
  id: string
  timestamp: number
  operation: 'upload' | 'download' | 'edit-upload' | 'edit-download'
    | 'delete' | 'rename' | 'mkdir' | 'chmod'
  localPath: string
  remotePath: string
  profileName?: string
  success: boolean
  error?: string
  size?: number
  duration?: number
  pending?: boolean
  transferMode?: 'fast' | 'tar'
  fileCount?: number
  skippedAsDuplicate?: { reason: 'content-identical'; algo?: 'sha1' | 'sha256'; at: number }
}
```

`skippedAsDuplicate` 表示 issue #15 判定内容相同后自动跳过，并未实际传输。

## 书签

权威数据在 `config.yaml` 的 `bookmarks`。localStorage 键 `sftp-plus-bookmarks-v2` 仅作旧版回退；tombstone：`sftp-plus-bookmarks-tombstones-v1`。

```typescript
interface Bookmark {
  id: string
  name: string
  path: string
  type: 'local' | 'remote'
  connectionKey?: string  // 空 = 全局书签
  createdAt: number
}
```

## 语言

当前语言写在 `tabby-sftp-plus.lang`（空串 = 自动检测）。旧 key `sftp-plus-locale` 仍可被 i18n 服务回退读取。支持的 Locale 见 [I18N.md](I18N.md)。

## 旧版 localStorage 键（只读回退 / 迁移源）

升级前若 yaml 尚无对应字段，面板仍可能读到这些键：

| 旧键 | 现对应 |
|------|--------|
| `sftp-plus-layout-mode` | `paneState/layout/mode` |
| `sftp-plus-local-sort` 等列/排序/列宽 | `paneState/local\|remote/...` |
| `sftp-plus-path-mode.{host}` | `paneState/perHost/{host}/pathMode` |
| `sftp-plus-saved-local-path.{host}` | `paneState/perHost/{host}/savedLocalPath` |
| `sftp-plus-settings.*` | 顶层 `lang` / `theme` / 配色等 |

新写入应走 `SftpConfigService.set()` + `flush()`，不要只写 localStorage（传输日志除外）。

## 数据迁移注意

1. 不要把 `paneState` 默认值改回 `{}`，否则路径记忆/列宽会再次静默丢失。
2. `allowEditAllFiles` / `allowViewAllAsText` 已并入 `allowViewEditAllFiles`，读取时兼容旧字段。
3. 重置设置会清 `config.yaml` 段，并删除所有 `sftp-plus-*` localStorage 键。

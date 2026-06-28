# SFTP+ 存储结构文档

> 创建人：DD1024z + Deepseek-V4-Flash
> 创建时间：2026-06-25

## 概述

SFTP+ 全部持久化数据均通过浏览器 **`localStorage`** 存储。不使用 Tabby 配置文件、文件系统或数据库。每个存储键都以 `sftp-plus-` 为前缀，便于识别和管理。

## 存储键总览

| 存储键 | 用途 | 数据模型 |
|--------|------|---------|
| `sftp-plus-bookmarks-v2` | 书签数据 | `Bookmark[]` |
| `sftp-plus-transfer-log` | 传输日志 | `TransferLogEntry[]` |
| `sftp-plus-locale` | 语言设置 | `string` |
| `sftp-plus-settings.lang` | 设置页 - 语言 | `string` |
| `sftp-plus-settings.theme` | 设置页 - 主题 | `string` |
| `sftp-plus-settings.primaryColor` | 设置页 - 主色 | `string` |
| `sftp-plus-settings.bgColor` | 设置页 - 背景色 | `string` |
| `sftp-plus-settings.textColor` | 设置页 - 文字色 | `string` |
| `sftp-plus-cols` | 设置页 - 列可见性 | `Record<string, boolean>` |
| `sftp-plus-cols-order` | 设置页 - 列顺序 | `string[]` |
| `sftp-plus-table.colBorders` | 设置页 - 列边框 | `boolean` |
| `sftp-plus-table.zebra` | 设置页 - 斑马纹 | `boolean` |
| `sftp-plus-local-cols` | 本地面板 - 列可见性 | `Record<string, boolean>` |
| `sftp-plus-local-cols-order` | 本地面板 - 列顺序 | `string[]` |
| `sftp-plus-remote-cols` | 远程面板 - 列可见性 | `Record<string, boolean>` |
| `sftp-plus-remote-cols-order` | 远程面板 - 列顺序 | `string[]` |
| `sftp-plus-local-sort` | 本地面板 - 排序 | `{ by: string, asc: boolean }` |
| `sftp-plus-remote-sort` | 远程面板 - 排序 | `{ by: string, asc: boolean }` |
| `sftp-plus-col-widths` | 列宽 | `Record<string, number>` |
| `sftp-plus-path-mem.{hostKey}` | 路径记忆开关 | `"true"` / `"false"` |
| `sftp-plus-saved-local-path.{hostKey}` | 保存的本地路径 | `string` |
| `sftp-plus-saved-remote-path.{hostKey}` | 保存的远程路径 | `string` |
| `sftp-plus-vertical-split-ratio` | 窄屏分割比例 | `number` |

---

## 详细数据模型

### 书签 (`sftp-plus-bookmarks-v2`)

由 `SftpBookmarksService` 管理。存储一个 JSON 序列化的 `Bookmark` 数组。

**接口定义：**

```typescript
interface Bookmark {
  id: string;           // 唯一标识：Date.now().toString(36) + Math.random()
  name: string;         // 书签显示名称
  path: string;         // 路径（绝对路径）
  type: 'local' | 'remote';  // 书签类型
  connectionKey?: string;    // 连接键（"user@host" 格式）
                             // 空/未定义 = 全局书签
  createdAt: number;    // 创建时间戳（Unix 毫秒）
}
```

**作用域模型：**

```
全局书签 (connectionKey = "")
  ├── 本地书签 (type = "local")  → 在所有连接的本地面板可见
  └── 远程书签 (type = "remote") → 在所有连接的远程面板可见

连接书签 (connectionKey = "user@host")
  ├── 本地书签 (type = "local")  → 仅在该连接的本地面板可见
  └── 远程书签 (type = "remote") → 仅在该连接的远程面板可见
```

**API：**

| 方法 | 说明 |
|------|------|
| `getBookmarks(connectionKey?, type?)` | 获取书签列表，可按连接键和类型筛选 |
| `addBookmark(name, path, type, connectionKey?)` | 添加书签 |
| `removeBookmark(id)` | 删除书签 |
| `getGlobalBookmarks(type?)` | 获取全局书签 |
| `getConnectionBookmarks(connectionKey, type?)` | 获取指定连接的书签 |

---

### 传输日志 (`sftp-plus-transfer-log`)

由 `SftpTransferLogService` 管理。存储一个 JSON 序列化的 `TransferLogEntry` 数组。

**接口定义：**

```typescript
interface TransferLogEntry {
  id: string;            // 唯一标识
  timestamp: number;     // 操作时间戳（Unix 毫秒）
  operation:             // 操作类型
    | 'upload'
    | 'download'
    | 'delete'
    | 'rename'
    | 'mkdir'
    | 'chmod';
  localPath: string;     // 本地路径
  remotePath: string;    // 远程路径
  profileName?: string;  // 连接配置名称（Tabby profile 名）
  success: boolean;      // 是否成功
  error?: string;        // 错误信息（失败时）
  size?: number;         // 文件大小（字节）
  duration?: number;     // 耗时（毫秒）
}
```

**限制：** 最多保留 **1000 条** 记录，超过时移除最早的条目。

**API：**

| 方法 | 说明 |
|------|------|
| `addLog(entry)` | 添加一条日志 |
| `getLogs(filter?)` | 获取日志列表，支持按操作类型和成功状态筛选 |
| `clearLogs()` | 清空全部日志 |
| `exportToJson()` | 导出全部日志为 JSON 字符串 |

---

### 语言设置 (`sftp-plus-locale` / `sftp-plus-settings.lang`)

由 `SftpI18nService` 和 `SftpSettingsTabComponent` 共同管理。

| 值 | 含义 |
|----|------|
| `""`（空字符串） | 自动检测（五级回退） |
| `"zh-CN"` | 简体中文 |
| `"en-US"` | English |

**注意：** `sftp-plus-locale` 是 i18n 服务直接读取的 key，`sftp-plus-settings.lang` 是设置页使用的 key。两者会通过设置页同步（设置页变更时写 `sftp-plus-locale`）。

---

### 设置页 — 主题 (`sftp-plus-settings.theme`)

| 值 | 含义 |
|----|------|
| `""`（空字符串） | Follow（跟随 Tabby 系统主题） |
| `"dark"` | 暗色主题 |
| `"light"` | 亮色主题 |
| `"blue"` | 蓝色主题 |
| `"green"` | 绿色主题 |
| `"purple"` | 紫色主题 |
| `"red"` | 红色主题 |
| `"custom"` | 自定义配色（使用 primaryColor/bgColor/textColor） |

---

### 列可见性

**数据结构：** `Record<string, boolean>`

| 键名 | 说明 |
|------|------|
| `name` | 文件名 |
| `size` | 文件大小 |
| `modified` | 修改时间 |
| `mode` | 权限（仅远程面板） |
| `owner` | 所有者（预留） |
| `group` | 用户组（预留） |
| `type` | 文件类型 |
| `target` | 链接目标（预留） |
| `permissions` | 权限字符串（预留） |

**存储位置：**
- `sftp-plus-cols` — 设置页全局列可见性
- `sftp-plus-local-cols` — 本地面板独立列可见性
- `sftp-plus-remote-cols` — 远程面板独立列可见性

---

### 列顺序

**数据结构：** `string[]`

列名的有序数组，按显示顺序排列。例如：
```json
["name", "size", "modified", "permissions"]
```

**存储位置：**
- `sftp-plus-cols-order` — 设置页列顺序
- `sftp-plus-local-cols-order` — 本地面板独立列顺序
- `sftp-plus-remote-cols-order` — 远程面板独立列顺序

---

### 排序列宽

**列宽** (`sftp-plus-col-widths`)

```typescript
// 所有面板共用同一组列宽值
Record<string, number>
// 示例：{ "name": 250, "size": 100, "modified": 180 }
// 支持以下列名：name, size, modified, mode, type, target, owner, group, permissions, permissionsStr
```

**排序** (`sftp-plus-local-sort` / `sftp-plus-remote-sort`)

```typescript
{
  by: string;    // 排序列名（如 "name", "size", "modified"）
  asc: boolean;  // true=升序, false=降序
}
```

---

### 路径记忆（按连接隔离）

每个 SSH 连接独立记忆路径，键名中包含 `hostKey`。

| 存储键 | 示例值 | 说明 |
|--------|--------|------|
| `sftp-plus-path-mem.root@192.168.1.1` | `"true"` | 是否记忆路径 |
| `sftp-plus-saved-local-path.root@192.168.1.1` | `"/home/user/local"` | 上次访问的本地路径 |
| `sftp-plus-saved-remote-path.root@192.168.1.1` | `"/var/www"` | 上次访问的远程路径 |

---

### 窄屏布局

`sftp-plus-vertical-split-ratio` — 在 ≤580px 宽度的垂直布局中，上下区域的分割比例。

```typescript
number;  // 取值范围 0.15 ~ 0.85，默认 0.5
```

---

## 存储与主题的 CSS 变量映射

运行时通过 CSS 变量实现主题展示，这些值**不持久化**，每次从设置中加载：

```
--sftp-primary   ← 预设主题主色 / sftp-plus-settings.primaryColor / Tabby --primary-color / #4a90d9
--sftp-bg        ← 预设主题背景色 / sftp-plus-settings.bgColor / Tabby --body-bg / 自动检测亮/暗
--sftp-text      ← 预设主题文字色 / sftp-plus-settings.textColor / Tabby --text-color / 自动检测亮/暗
--sftp-border    ← 计算自 --sftp-text 透明化 (0.15 alpha)
```

## 数据迁移

当前存储格式为 `v2`（书签名带 `-v2` 后缀）。未来如有格式变更，建议：

1. 在 localStorage 中增加版本号 key（`sftp-plus-storage-version`）
2. 在服务初始化时检测版本并运行迁移脚本
3. 避免破坏性变更，优先使用 JSON schema 扩展

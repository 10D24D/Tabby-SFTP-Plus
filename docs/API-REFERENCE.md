# SFTP+ API 参考

> 创建人：DD1024z + Deepseek-V4-Flash
> 创建时间：2026-06-25

---

## SftpConnectionService (`sftp.service.ts`)

SFTP 连接的核心封装，将 Tabby SSH Session 的 SFTP 子通道操作统一成简洁的接口。

### 类型定义

```typescript
interface SFTPFile {
  name: string;           // 文件名
  size: number;           // 文件大小（字节）
  mode: number;           // Unix 权限位
  mtime: number;          // 修改时间戳（Unix 秒）
  atime: number;          // 访问时间戳（Unix 秒）
  isDirectory: boolean;   // 是否为目录
  isFile: boolean;        // 是否为文件
  isSymlink: boolean;     // 是否为符号链接
}

interface SFTPSessionLike {
  openSftp(): Promise<SFTPWrapper>;
  // Tabby SSH Session 的 SFTP 子通道
}

interface SSHSessionLike {
  openSFTP(): Promise<SFTPSessionLike>;
  // Tabby SSH 主会话
}
```

### 方法

#### `readdir(sftpSession: SFTPSessionLike, path: string): Promise<SFTPFile[]>`

列出指定目录的文件列表。

| 参数 | 类型 | 说明 |
|------|------|------|
| `sftpSession` | `SFTPSessionLike` | SFTP 会话实例 |
| `path` | `string` | 远程目录路径 |

**返回：** `SFTPFile[]` — 文件条目数组（已过滤 `.` 和 `..`）

#### `mkdir(sftpSession: SFTPSessionLike, path: string): Promise<void>`

创建远程目录。

#### `rmdir(sftpSession: SFTPSessionLike, path: string): Promise<void>`

删除远程空目录。

#### `unlink(sftpSession: SFTPSessionLike, path: string): Promise<void>`

删除远程文件。

#### `rename(sftpSession: SFTPSessionLike, oldPath: string, newPath: string): Promise<void>`

重命名或移动远程文件/目录。

#### `upload(sftpSession: SFTPSessionLike, localPath: string, remotePath: string): Promise<void>`

上传本地文件到远程。

| 参数 | 类型 | 说明 |
|------|------|------|
| `sftpSession` | `SFTPSessionLike` | SFTP 会话 |
| `localPath` | `string` | 本地文件路径（绝对路径） |
| `remotePath` | `string` | 远程目标路径（绝对路径） |

#### `download(sftpSession: SFTPSessionLike, remotePath: string, localPath: string): Promise<void>`

下载远程文件到本地。

#### `chmod(sftpSession: SFTPSessionLike, path: string, mode: number): Promise<void>`

修改远程文件/目录的权限。

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | 远程路径 |
| `mode` | `number` | Unix 权限位（八进制，如 `0o755`） |

#### `getSftpSession(terminal: any): Promise<{ session: SFTPSessionLike, profileName: string, hostKey: string }>`

从 Tabby 终端实例获取 SFTP 会话。

| 参数 | 类型 | 说明 |
|------|------|------|
| `terminal` | `any` | Tabby 终端实例 |

**返回：**
- `session` — SFTP 会话
- `profileName` — 连接配置名称（Tabby profile name）
- `hostKey` — 主机标识（`user@host:port` 格式）

---

## SftpBookmarksService (`sftp-bookmarks.service.ts`)

三级作用域书签管理。

### 类型定义

```typescript
interface Bookmark {
  id: string;                 // 唯一标识
  name: string;               // 书签名称
  path: string;               // 路径
  type: 'local' | 'remote';  // 书签类型
  connectionKey?: string;     // 连接键（空=全局书签）
  createdAt: number;          // 创建时间戳
}
```

### 方法

#### `getBookmarks(connectionKey?: string, type?: 'local' | 'remote'): Bookmark[]`

获取书签列表。

| 参数 | 说明 |
|------|------|
| `connectionKey` | 可选，按连接键筛选。不传则返回所有书签 |
| `type` | 可选，按类型筛选。不传则返回所有类型 |

**注意：** 不传 `connectionKey` 时会同时返回全局书签和连接书签。传 `connectionKey` 且为空字符串 `""` 时仅返回全局书签。

#### `addBookmark(name: string, path: string, type: 'local' | 'remote', connectionKey?: string): void`

添加书签。

| 参数 | 说明 |
|------|------|
| `name` | 书签名称（必填） |
| `path` | 目录路径（必填） |
| `type` | `'local'` 或 `'remote'` |
| `connectionKey` | 连接键。不传或空字符串 = 全局书签 |

#### `removeBookmark(id: string): void`

按 ID 删除书签。

#### `getGlobalBookmarks(type?: 'local' | 'remote'): Bookmark[]`

获取全局书签（connectionKey 为空的所有书签）。

#### `getConnectionBookmarks(connectionKey: string, type?: 'local' | 'remote'): Bookmark[]`

获取指定连接的书签。

---

## SftpTransferLogService (`sftp-transfer-log.service.ts`)

传输操作历史记录。

### 类型定义

```typescript
interface TransferLogEntry {
  id: string;
  timestamp: number;           // Unix 毫秒
  operation:
    | 'upload'
    | 'download'
    | 'delete'
    | 'rename'
    | 'mkdir'
    | 'chmod';
  localPath: string;
  remotePath: string;
  profileName?: string;
  success: boolean;
  error?: string;
  size?: number;               // 字节
  duration?: number;           // 毫秒
}
```

### 方法

#### `addLog(entry: TransferLogEntry): void`

添加一条传输日志。自动管理上限（最多 1000 条），超出时移除最旧记录。

#### `getLogs(filter?: { operation?: string; success?: boolean }): TransferLogEntry[]`

获取日志列表。

| 参数 | 说明 |
|------|------|
| `filter.operation` | 可选，按操作类型筛选 |
| `filter.success` | 可选，按成功/失败筛选 |

**返回：** 按时间戳降序排列的日志数组（最新在前）。

#### `clearLogs(): void`

清空所有日志。

#### `exportToJson(): string`

将所有日志导出为 JSON 字符串（用于下载/备份）。

---

## SftpI18nService (`sftp-i18n.service.ts`)

轻量级国际化服务。

### 类型定义

```typescript
type Locale = 'zh-CN' | 'en-US';
```

### 方法

#### `t(key: string, params?: Record<string, any>): string`

获取翻译文本。

| 参数 | 类型 | 说明 |
|------|------|------|
| `key` | `string` | 翻译键（如 `'pane.local'`） |
| `params` | `Record<string, any>` (可选) | 模板参数 |

**返回：** 翻译后的字符串。如果键缺失，依次回退 `en-US` → 原键名。

**示例：**
```typescript
i18n.t('pane.local');                         // "本地" / "Local"
i18n.t('pane.nItems', { count: 42 });         // "42 项" / "42 items"
i18n.t('file.kb', { size: '128' });           // "128 KB"
```

#### `getCurrentLocale(): Locale`

获取当前语言环境。

#### `setLocale(locale: Locale): void`

手动设置语言。

| 参数 | 说明 |
|------|------|
| `locale` | `'zh-CN'` 或 `'en-US'` |

---

## 本地传输适配器 (`local-transfers.ts`)

### `LocalPathFileUpload`

从本地文件系统读取数据，供 SFTP 上传管道消费。

**构造函数：** `new LocalPathFileUpload(localPath: string)`

| 参数 | 说明 |
|------|------|
| `localPath` | 本地文件的绝对路径 |

**实现接口：** `FileTransfer`

| 方法 | 说明 |
|------|------|
| `getCompletedBytes()` | 返回已读取的字节数 |
| `isComplete()` | 返回是否已读取完毕 |
| `cancel()` | 取消传输 |

### `LocalPathFileDownload`

接收 SFTP 下载数据并写入本地文件。

**构造函数：** `new LocalPathFileDownload(localPath: string)`

| 参数 | 说明 |
|------|------|
| `localPath` | 本地目标文件的绝对路径 |

**实现接口：** `FileTransfer`（同上）

---

## 面板组件初始化参数

`SftpFloatingPanel` 通过组件输入属性接收配置：

```typescript
interface PanelConfig {
  hostKey: string;          // "user@host:port" 格式的主机标识
  profileName: string;      // Tabby 连接配置名称
  sshSession: any;          // Tabby SSH 会话实例
}
```

面板初始化时：

1. 从 hostKey 解析连接信息
2. 检查路径记忆设置（`sftp-plus-path-mem.{hostKey}`）
3. 如果有记忆，恢复上次访问的本地/远程路径
4. 否则使用当前工作目录作为本地路径，远程默认 `~`
5. 列出文件并显示

---

## CSS 变量

运行时通过 CSS 变量控制主题样式：

| 变量名 | 用途 | 回退链 |
|--------|------|--------|
| `--sftp-primary` | 主色（按钮、选中项、链接） | 预设主题 → 自定义 → Tabby `--primary-color` → `#4a90d9` |
| `--sftp-bg` | 背景色 | 预设主题 → 自定义 → Tabby `--body-bg` → 自动亮/暗检测 |
| `--sftp-text` | 文字色 | 预设主题 → 自定义 → Tabby `--text-color` → 自动亮/暗检测 |
| `--sftp-border` | 边框色 | 从 `--sftp-text` 透明度 0.15 计算 |

---

## 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| `↑` / `↓` | 在文件列表中上下选择 |
| `Enter` | 进入目录 / 打开文件 |
| `Backspace` | 返回上级目录 |
| `Delete` | 删除选中文件 |
| `F5` | 刷新当前面板 |
| `Ctrl+A` | 全选 |
| `Ctrl+C` | 复制文件路径 |
| `Ctrl+F` | 切换过滤栏 |
| `Home` | 回到目录顶部 |
| `End` | 跳到目录底部 |
| `Space` | 切换选中/取消当前项 |
| `Shift+↑` / `Shift+↓` | 范围多选 |

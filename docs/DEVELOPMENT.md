# SFTP+ 开发指南

> 创建人：DD1024z + Deepseek-V4-Flash
> 创建时间：2026-06-25

## 环境要求

| 工具 | 版本 | 备注 |
|------|------|------|
| Node.js | >= 18.x | npm 对应版本 |
| npm | >= 9.x | 随 Node.js 安装 |
| Tabby Terminal | >= 1.0.163 | 目标运行环境 |

## 快速开始

```bash
# 1. 克隆项目后进入目录
cd tabby-FTPS+

# 2. 安装依赖
npm install

# 3. 开发模式（watch）
npm run watch

# 4. 生产构建
npm run build
```

## 项目结构

```
tabby-FTPS+/
├── docs/                        # 文档
├── dist/                        # 构建输出
│   └── index.js                 #   插件打包产物（Tabby 加载入口）
├── src/                         # 源码目录
│   ├── index.ts                 #   入口：NgModule 注册 + 扩展点声明
│   ├── sftp-floating-panel.component.ts  #   主面板组件（≈2700 行）
│   ├── sftp-terminal-decorator.ts #   终端装饰器
│   ├── sftp.service.ts          #   SFTP 连接服务
│   ├── sftp-bookmarks.service.ts#   书签服务
│   ├── sftp-transfer-log.service.ts #   传输日志服务
│   ├── sftp-i18n.service.ts     #   国际化服务
│   ├── sftp-settings.component.ts #   设置页组件
│   ├── local-transfers.ts       #   本地传输适配器
│   └── tabby-shims.d.ts         #   Tabby 类型声明
├── scripts/                     # Python 辅助脚本（迁移/更新工具）
│   ├── restore_settings.py
│   ├── split_col_settings.py
│   ├── update_decorator_minimize.py
│   └── update_settings_layout.py
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## 构建配置

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "es2018",
    "module": "es2015",
    "strict": false,
    "noImplicitAny": false,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  }
}
```

**关键说明：**
- `strict: false` 和 `noImplicitAny: false` — 由于 Tabby 类型声明不完整，放宽了类型检查
- `experimentalDecorators` + `emitDecoratorMetadata` — Angular 编译必需
- `declaration` + `declarationMap` — 生成 `.d.ts` 声明文件方便其他插件的类型引用

### webpack.config.js

```javascript
{
  target: 'node',                       // Node.js 环境
  entry: './src/index.ts',             // 入口文件
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2'         // CommonJS 模块格式
  },
  externals: {
    // Node.js 内置模块——由 Tabby 宿主提供
    'fs', 'path', 'os', 'crypto', 'net', 'stream', 'readline',
    // Electron 模块——由 Tabby 宿主提供
    'electron',
    // 框架模块——外部化，避免重复打包
    /^rxjs/,
    /^@angular/,
    /^tabby-/
  }
}
```

**关键说明：**
- `target: 'node'` — 插件运行在 Electron 的 Node.js 进程中，而非浏览器
- 所有 `externals` 列表中的模块都不打包进 `dist/index.js`，由 Tabby 在运行时提供
- 如果需要增加外部依赖，先在 `package.json` 的 `dependencies` 中添加（注意 Tabby 插件的依赖必须与 Tabby 主程序兼容），然后在 `externals` 中添加对应规则

## 开发工作流

### 1. 代码修改

- 源文件全部在 `src/` 目录下
- 内联模板和样式在组件 `.ts` 文件中直接定义
- 所有服务不依赖 Angular DI，通过构造函数直接 `new` 实例化

### 2. 构建

```bash
npm run build    # 单次构建
npm run watch    # 监听模式，文件变化自动构建
```

### 3. 测试

当前没有单元测试或端到端测试框架。建议通过以下方式验证：

- 构建后将 `dist/index.js` 复制到 Tabby 插件目录
- 重启 Tabby 或在开发者工具中 `Ctrl+R` 重载扩展
- 检查终端工具栏是否出现 SFTP+ 按钮
- 点击按钮打开面板，验证 SSH 连接与文件操作

### 4. 调试

由于插件运行在 Electron 中：

1. 打开 Tabby 开发者工具：`Ctrl+Shift+I`（或者通过菜单 Help → Toggle Developer Tools）
2. 在 Console 面板中可查看插件的 `console.log` 输出
3. 面板组件是动态挂载的 DOM 节点，在 Elements 面板中搜索 `sftp-floating-panel` 可定位
4. Sources 面板中可在 `webpack:///./src/` 下找到源文件（需确保构建时 sourcemap 已生成）

## 编码规范

### 通用约定

- **语言**：TypeScript 5.8，ES2018 target
- **缩进**：2 空格
- **引号**：单引号优先
- **分号**：必须加分号
- **命名**：
  - 类名：PascalCase（`SftpFloatingPanel`）
  - 方法/变量：camelCase（`initializeConnection`）
  - 常量：UPPER_SNAKE_CASE（`MAX_LOGS`）
  - 私有属性：无需特殊前缀

### Angular 特有

- 组件使用内联 `template` 和 `styles`，不分离 `.html`/`.css` 文件
- `ChangeDetectionStrategy.OnPush` 不适用，使用默认策略
- 服务类不继承或实现任何 Angular 类，独立实例化
- 通过 `Injector.get()` 获取 Tabby 核心服务，而非构造函数注入

### 国际化规范

- 所有用户可见文本必须使用 `i18n.t()` 方法
- 新翻译键按功能分组（`app.*`、`file.*`、`transfer.*`、`bookmark.*`、`permission.*`、`notify.*`）
- 字典中使用 `{placeholder}` 语法进行参数替换
- 新增语言时，必须提供 **所有翻译键** 的对应翻译（可先复制 `zh-CN` 后翻译）

## 扩展指南

### 新增功能

1. **新增服务**：在 `src/` 下创建 `sftp-xxx.service.ts`，使用 `new` 实例化
2. **新增 UI 组件**：如果功能简单，直接在 `sftp-floating-panel.component.ts` 的内联模板中增加
3. **新增 Tabby 扩展点**：在 `index.ts` 的 `providers` 数组中注册

### 修改数据模型

1. 在对应的 Service 中修改接口定义
2. 增加版本迁移逻辑（如果 localStorage 中已有旧格式数据）
3. 更新 `docs/STORAGE.md`

### 新增翻译

1. 在 `sftp-i18n.service.ts` 的 `TRANSLATIONS` 中添加键值对
2. 在 `zh-CN` 和 `en-US` 中分别添加
3. 新键按分组放入已有分组中，或新建分组

## 注意事项

### 已知限制

1. **Angular DI 不可用**：由于组件动态创建，服务无法通过 DI 注入
2. **Tabby 类型不完整**：`tabby-shims.d.ts` 中的类型声明可能不全，需根据 Tabby 源码补充
3. **单 Tab 隔离**：每个终端 Tab 有独立的浮动面板实例，互不干扰
4. **localStorage 限制**：所有数据存储在 localStorage 中，单键值大小约 5MB，日志和书签需控制数据量
5. **SSH 会话依赖**：插件仅在有活跃 SSH 会话的 Tab 中可用，本地终端无效

### 常见问题

**Q: 面板没有出现或按钮没有反应？**
A: 检查 SSH 会话是否已建立，等待按钮左侧出现连接状态指示。如果长时间不出现，查看控制台是否有 Angular 编译错误。

**Q: 构建报错关于 Angular 版本？**
A: 确认 `package.json` 中的 Angular 版本与 Tabby 使用的版本兼容。Tabby 1.0.163 使用 Angular 9。

**Q: 修改了类型声明但构建不通过？**
A: 检查 `tabby-shims.d.ts` 中的声明是否与实际 Tabby 版本一致。可以查看 Tabby 源码中的实际类型定义。

**Q: 无法拖拽文件？**
A: 检查是否启用了 Tabby 的安全设置（某些系统配置可能限制 Drag & Drop API）。也确认文件列表区域已经正确挂载了拖拽事件监听器。

/**
 * 功能描述：SFTP+ 传输任务作用域（task scope）
 *   ★ 2026-09-20 P1-2 审计修复。原实现用面板字段 `_cancelRef`（「最后启动的任务」）
 *   充当隐式的「当前任务」上下文，同一面板内并发多个目录任务时会被后启动的任务覆盖：
 *     1) 先启动任务的后续子文件流被登记进后启动任务的 cancelRef（归属错位）；
 *     2) 取消先启动任务时按 _cancelRef 广播 → 实际中断的是后启动任务的在途子流（误杀）。
 *   本模块用 AsyncLocalStorage 把「任务级 cancelRef」绑定到异步调用链上：
 *   任务入口 runInTaskScope(ref, ...) 之后，该任务内所有 await/并发分支里的叶子传输
 *   都能通过 currentTaskScope() 解析到自己的 ref，与面板上的「最新任务」字段彻底解耦。
 *
 *   渐进降级：若运行环境取不到 async_hooks（理论不会，Electron 渲染进程有 node 集成），
 *   runInTaskScope 退化为直接执行、currentTaskScope 恒为 undefined —— 行为等价于修复前，
 *   不会抛错、不影响任何传输。
 * 创建人：DD1024z + Deepseek-V4.1-Flash
 * 创建时间：2026-09-20
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-09-25 — ★ P0 紧急修复：在 Electron 渲染进程**禁用 AsyncLocalStorage**。
 *   实证（Crashpad 崩溃转储）：用户在「目录冲突 → 选择覆盖」时渲染进程发生 V8 致命错误
 *   （ptype=renderer，electron.v8-fatal.location=`Isolate::PushStackTraceAndDie`，
 *    message=`null prototype chain root`；dump 内 OOM / RangeError / Check failed 计数均为 0）。
 *   崩溃栈：SftpConflictDialog「覆盖」click → resolveConflict → applyAction → mergeLocalDirToRemote
 *   → _runScopedFolderTask → currentTaskScope() → als.getStore()
 *   [node:internal/async_local_storage/async_context_frame:77] → V8 abort。
 *   即 V8 在 AsyncLocalStorage(AsyncContextFrame) 取 store 时**进程级 abort**——try/catch 无效。
 *   本模块设计本就带「渐进降级」：als 为 null 时 runInTaskScope 直接执行、currentTaskScope 恒
 *   undefined，传输行为退回 2026-09-20 之前的 `_cancelRef` 语义。此处主动走降级路径：
 *   以「并发目录任务取消归属可能错位（旧行为，轻）」换取「渲染进程不再崩溃（黑屏不可退出，重）」。
 *   待确认 Electron/Node 侧该崩溃已修复后，把 ALS_DISABLED 置 false 即可恢复。
 */

/** 任务级取消引用：current 供单文件取消，active 登记该任务全部在途子传输（目录并发） */
export interface TaskCancelRef {
  current: any
  active?: Set<any>
}

interface AlsLike {
  run<T>(store: TaskCancelRef, fn: () => T): T
  getStore(): TaskCancelRef | undefined
}

/**
 * ★ 2026-09-25 P0：ALS 总开关。true = 禁用 AsyncLocalStorage，走「无作用域」降级路径。
 *   置 false 会重新启用任务作用域，但会在当前 Electron 渲染进程上复现上述 V8 致命崩溃。
 */
const ALS_DISABLED = true

/** 懒加载 + 兜底：任何加载失败都退化为「无作用域」，绝不因本模块使插件无法启动。
 *  ★ 2026-09-25 P0：ALS_DISABLED=true 时直接返回 null（连 require('async_hooks') 都不执行），
 *  确保整条传输链上不存在任何 `als.getStore()` 调用。 */
function loadAsyncLocalStorage(): AlsLike | null {
  if (ALS_DISABLED) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('async_hooks') as { AsyncLocalStorage?: new () => AlsLike }
    return typeof mod?.AsyncLocalStorage === 'function' ? new mod.AsyncLocalStorage() : null
  } catch {
    return null
  }
}

const als: AlsLike | null = loadAsyncLocalStorage()

/** 新建一个任务作用域引用 */
export function createTaskScope(): TaskCancelRef {
  return { current: null, active: new Set<any>() }
}

/** 在指定任务作用域内执行（含其全部异步延续）；无 ALS 环境时退化为直接执行 */
export function runInTaskScope<T>(ref: TaskCancelRef, fn: () => T): T {
  return als ? als.run(ref, fn) : fn()
}

/** 当前异步调用链所属的任务引用；不在任何任务作用域内返回 undefined */
export function currentTaskScope(): TaskCancelRef | undefined {
  try {
    return als?.getStore()
  } catch {
    return undefined
  }
}

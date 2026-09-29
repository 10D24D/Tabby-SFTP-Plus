/**
 * 功能描述：SFTP+ 目录打包传输通道（tar channel）
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-08-11
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-09-29 — ★★ 修复「仅 TAR 模式下**上传**目录仍走 SFTP」（用户实测质问：
 *              「不是已经开启了仅 TAR 模式吗？怎么还是有走 SFTP 模式？」）。
 *              根因＝**上传方向缺少与下载方向对称的「覆盖即允许打包」入口**：
 *                09-26 已为下载修过同一问题（DownloadDirUseCase 增加 forceOverwrite，
 *                用户选「覆盖」→ 允许走 tar + mergeIntoExisting 合并解包）；但上传侧
 *                「目录冲突 → 覆盖」走的是**另一个用例** MergeLocalDirUseCase（逐文件 uploadRaw），
 *                压根没有 tar 入口 → 用户选了「覆盖」也只得到 ⇄SFTP，
 *                而 UI 提示还写着「请在目录冲突提示中选择『覆盖』」→ 提示与行为不符。
 *              ⇒ ① tryUploadDir 增加真实形参 `mergeIntoExisting`（与 tryDownloadDir 完全对称）
 *                   与 `reuseLogEntryId`（合并上传复用来源记录，避免「一条失败 + 一条成功」）；
 *                 ② 远端解包段按 merge 分支：非 merge 保持 `test ! -e` + `mv` 原子搬入；
 *                    merge 改 `mkdir -p <目标>` + `cp -a <解包目录>/<名>/. <目标>/`
 *                    —— 同名覆盖、目标端独有项保留，语义与「用户选覆盖」严格一致；
 *                    cp 幂等 ⇒ merge 分支可安全启用 retryOnEmpty（mv 分支仍必须禁用，
 *                    否则重放会把源目录嵌套进已存在目标）。
 *                 ③ MergeLocalDirUseCase 在**建进度条目之前**先试打包通道：success 直接返回、
 *                    failed 硬失败（仅 TAR）、fallback 继续逐文件合并 —— 于是「覆盖」「重命名」
 *                    两条冲突出口在仅 TAR 下也一律走打包，不再偷偷变 SFTP。
 *              2026-09-29 — ★★ 修复「仅 TAR 下载目录：进度走完却报『打包或解包失败』」（用户实测：
 *              「这是远程打包失败了呢？还是传输到本地，本地解压失败了？」）。三处根因，全部修复：
 *              ① 【真凶】跨系统文件名编码：远端 Linux 的 GNU tar 默认 **gnu 格式**把非 ASCII 名以
 *                 **原始 UTF-8 字节**写进 name 字段（无字符集声明），Windows 自带 bsdtar（libarchive）
 *                 读该字段时按**本机 ANSI 代码页(GBK)** 解码 → 「测试」变「娴嬭瘯」→ 解包后顶层
 *                 目录名与预期不符 + `Invalid empty pathname` + 退出码 1 → 整次下载在**传完之后**失败。
 *                 本机复现（Linux GNU tar 包 → Windows bsdtar 解）：gnu 格式 exit=1 且顶层乱码；
 *                 改用 **pax 格式** exit=0 且顶层/内层中文名与含空格名全对。
 *                 ⇒ 远端打包改用 `--format=pax`（用前先探测，不被支持则退回原命令，见
 *                 _remoteTarSupportsPax）；本地解包侧再补一层 `--options hdrcharset=UTF-8` 兜底。
 *              ② 本机 tar 选型：`spawn('tar')` 命中谁取决于 PATH —— 若命中 Git/PortableGit 的
 *                 **MSYS GNU tar**，所有带盘符的绝对路径都被当成 tar 的远程归档语法（`host:path`）
 *                 → `tar: Cannot connect to D: resolve failed`（exit 128），打包与解包**双双必败**
 *                 （本机实测：`where tar` 首项正是 PortableGit 的 usr\bin\tar.exe）。
 *                 ⇒ 新增 resolveLocalTarCmd()：Windows 上**显式锁定 `%SystemRoot%\System32\tar.exe`**。
 *              ③ 可观测性为零：runLocalTar 原先 stdio 三路全 ignore，失败只剩一个 false，
 *                 日志与提示都只能说「失败」—— 这正是「分不清哪一端」的直接原因。
 *                 ⇒ runLocalTar 改为返回 { ok, code, output }（捕获 stderr 且**持续消费**管道防挂死，
 *                 限长 4000 字符）；解包函数 extractTarSafely 改为返回带 code/detail 的结果对象。
 *              配套：TarFailureCode 的 `packFailed` 按**发生位置**拆成 localPackFailed /
 *              remotePackFailed / localExtractFailed，并单列 nameEncodingUnsupported（有明确解法：
 *              换智能或优先 SFTP、或升级远端 tar）；面板映射表与 24 语言文案同步补齐。
 *              2026-09-29 — ★ 通道标记不再依赖 updateLogSize 的副作用：打包通道在 `folder.start`
 *              之后立即调用新增的 `folder.markChannelMode?.(ctx, 'tar')` 显式声明「本次由打包
 *              通道接管」。原先 transferMode='tar' 只在 updateLogSize 里顺带写入，而该回调仅在
 *              「需要回填真实目录大小」时才触发（`realSize > 0` 或解包后兜底扫描），
 *              于是 `realSize=0 且 mergeIntoExisting` 时明明走了 tar，记录/进度条却显示 ⇄SFTP。
 *              同日：tryUploadDir / tryDownloadDir 入口新增 `mode === 'sftpOnly'` 直接让路
 *              （配套 transfer-coordinator 的 tarChannel 恒挂载）——用户明确要求逐文件时，
 *              连 tar 可用性/规模探测都不做（上传要扫本地目录、下载要扫远端目录，
 *              后者是 SFTP readdir 往返）。这是「用户明确要求」而非降级，故不打 warn。
 *              2026-09-29 — 「仅 TAR」改为硬失败（用户质问「为什么仅 XX 模式，还会有回退的？」）：
 *              此前 tarOnly 在「本地/远端无 tar」「目录含符号链接」「打包或解包失败」等情况下
 *              一律静默回退逐文件通道，与模式名的「仅」字自相矛盾，用户只能看到标签变成 ⇄SFTP。
 *              现所有「不可用」判断统一收口到新增的 _decline()：
 *                · 非 tarOnly → 保持原样：未提交时返回 fallback，已提交时 discard 后 fallback
 *                  （平滑回退，不留双重日志）；
 *                · tarOnly  → **不回退**：记录失败原因、把已提交的进度条目收尾为失败，
 *                  并经 deps.notifyFailure 回调通知用户（失败分级见 TarFailureCode），
 *                  由调用方翻译成「原因 + 解决方法」提示。
 *              另：前置检查由「本地或远端无 tar」的合并判断拆开，以便区分「本机缺 tar」与
 *              「服务器缺 tar」两种不同解法。
 *              2026-09-29 — ★★ 新增「多选批量打包」（用户提议：「如果选择了多个文件、不是文件夹，
 *              也可以包含文件夹，这样传输，实际上也可以走 TAR 模式打包传输的吧」——成立）。
 *              此前多选被拆成 N 个独立任务（面板 ctxUpload / drop 两处都是 `items.map(streamUploadOne)`）：
 *              选中的**文件夹**各自打一个包（3 个文件夹 = 3 个归档），散装**文件**恒走逐文件 ——
 *              于是「一次选一批小文件」恰是本通道最该帮忙、却完全帮不上的场景（N 条独立流、还只有 3 并发）。
 *              ⇒ 新增 tryUploadBatch()：同一父目录下的多个顶层条目打**一个**归档，一次传输后在远端
 *              逐条原子搬入。落地命令抽成纯函数 buildRemoteUploadBatchLanding（可被产物探针直验）。
 *              ⚠ 本轮做的是**保守版**，核心约束是「绝不比现状更差」：
 *                · 入口前置（由 UploadBatchUseCase 判定）：模式非 sftpOnly、≥2 项、**同一父目录**、
 *                  且远端**全部目标都不存在**（保守版不碰冲突语义 —— 只要有一项冲突就整批交回
 *                  逐项流程，该流程会照旧弹冲突框、照旧逐个处理）；
 *                · 通道内一切「不适用」（无 tar / 含符号链接 / 规模不划算 / 不安全名）一律
 *                  **return 'fallback'**，而不是走 _decline 硬失败 —— 因为批量打包是叠加在既有
 *                  逐项通道之上的**优化层**，判定为「不适用」时必须让原路径原样跑完。
 *                  只有「已提交（已建进度条目）之后」的失败才走 _decline（tarOnly 下硬失败），
 *                  与通道内其余路径一致。
 *                · 落地顺序刻意是「先全量校验解包结果 → 再全量校验目标缺席 → 最后统一 mv」：
 *                  若把 test ! -e 与 mv 逐条目交替，第 2 条目标恰在窗口内被创建就会留下
 *                  「前一条已搬入、后一条没搬」的**半落地**状态；全量前置校验把这种情形压成
 *                  「一条都没动」，失败原因明确且可原样重试。
 *              2026-09-28 — 传输通道模式（smart/sftpOnly/tarOnly/preferSftp/preferTar）：tarWorthwhile
 *              改为按模式择路（TAR_THRESHOLDS 三套门槛），tryDownloadDir/tryUploadDir 增加 mode 尾参；
 *              上传方向补本地规模探测并用同一逻辑择路（此前一律打包，与下载不对称）；TarChannelDeps 增加
 *              可选 scanLocalDir。旧 transferTarAcceleration 开关在面板/设置侧迁移为 transferChannelMode。
 *              2026-09-26 — P0 修复（打自己人的三处）：① 下载方向远端打包 `tar czf` → `tar cf`
 *              不再 gzip —— jar/zip 本身已压缩，gzip 只省 8% 却要在 CPU 被限流的 ECS 上满核
 *              烧几十秒，把 sshd 饿死导致每个 SFTP read 都撞 10s 单请求超时（实测 tar 通道与
 *              回退的逐文件通道同时全灭）；② 打包命令加 `nice -n 19`（+ 可用时 `ionice -c3`）
 *              主动让路；③ 目录真实大小扫描从「与打包并行」改为「打包之后串行」，不再往同一条
 *              SFTP 通道灌 8 路 readdir 与数据读抢通道
 *              2026-09-26 — 临时路径与命名（用户提出「打包后文件名不知道是什么」「要不要加缓存
 *              临时路径」）：① 本地暂存区从固定 `os.tmpdir()`（Windows 上多半是 C 盘）改为
 *              **与目标/源同盘**的 `<父目录>/.sftp-plus-tmp/`（见 resolveStagingRoot）——
 *              收尾搬入由跨盘 `fs.cp` 全量复制变成同盘 rename 零拷贝，且不再临时占用系统盘；
 *              ② 远端 tar 包/解包目录、本地 tar 包的名字从纯 `randomUUID()` 改为可读的
 *              `<名称>.sftp-plus-tar-<6位随机>`（前段自解释、后段保证并发不互踩）
 *              2026-09-26 — 下载方向支持「目标已存在 + 用户选覆盖」（用户问「TAR 打包传输加速
 *              开着，怎么还是优先走了 SFTP 模式」）：新增 mergeIntoExisting，解包结果由
 *              「整目录 rename 进目标」改为「合并覆盖进目标」（见 mergeDirInto）——
 *              此前目标已存在就直接不使用打包通道，开关形同失效
 *              同轮：tryDownloadDir 的四处「前置条件不满足」原本**静默** return fallback
 *              （无 ssh 会话 / 路径含 NUL / 本地或远端无 tar / tar 包大小非法），用户侧只能看到
 *              ⇄SFTP 标签、完全无从归因 —— 全部补日志（tar 探测结果是本会话缓存的，一并打出），
 *              并在进通道时加一行 packed download start（含 mergeIntoExisting 标志）作为
 *              「这次到底有没有尝试打包」的取证锚点
 *              2026-09-26 — 用户实测三连问（「怎么这次打包要这么久」「同一目录第二次又变 SFTP」
 *              「为什么有时 SFTP 更快」）的修复：
 *              ① **合并收尾重写**（mergeDirInto 由「边遍历边 rename 搬源 + 单条失败即整体 return
 *                 false」改为「只读源、逐条容错、全量记账」）—— 现场日志
 *                 `merge into existing dir failed at "...\\__next.base\\announcements": ENOENT: ...
 *                 copyfile '<沙箱>\\...\\__PAGE__.txt' -> '<目标>\\...'` 让已传完 1m31s 的打包结果
 *                 整体作废并回退逐文件重下一遍（界面表现：TAR 记录突然变成 ⇄SFTP 新记录）。
 *                 现在 ENOENT（源条目 readdir 后在沙箱里读不到）只记 skipped 不失败；
 *                 真 I/O 失败才 failed 并回退补齐；绝不 `rm -r` 目标目录（原实现有删用户数据风险）。
 *              ② **通道选择看规模**：新增 tarWorthwhile + `_remoteDirStats`（1 次 exec 取文件数/总字节）。
 *                 本通道单流、逐文件通道 3 路并发，实测比值 126 KB/s : 370 KB/s ≈ 1:3，所以只有
 *                 「≥600 个文件且 ≤48MB」才走打包，否则直接逐文件（用户那 289 文件的 dist 因此
 *                 由 1m31s 降到约 30s 量级）；探测不可用时 fail-open 保持旧行为。
 *              ③ 合并前后各一行统计日志（dirs/files/links/skipped/failed），下次出问题可直接定因；
 *              ④ 去掉「每个文件先 `fs.rm` 再 copy」——`fs.copyFile` 本身就会覆盖写那次删除纯属多余，
 *                 而在 Windows（实时防护/过滤驱动/删除拦截层）下它是一次昂贵的逐文件元数据操作：
 *                 本机实测同一棵 288 文件 / 119 目录的树，带 rm 时收尾 **31.4s**，去掉后 **0.33s**
 *                 （相差约 95 倍）。这条也是「打包通道慢」里最容易被忽略的一段本地开销。
 *                 （曾考虑改用并行 `fs.cp` 做快路径，实测无必要且其覆盖前会先 unlink，故未采用。）
 * 说明：海量小文件目录（dist/node_modules 等）逐文件 SFTP 传输时每个文件都要吃
 *   数次网络往返，天然慢。本通道把整目录打成单个 tar 归档走「单文件」传输，再在
 *   对端解包，等效 electerm 的打包思路。因 Tabby SSH exec 通道不能写 stdin，
 *   不做流式直灌，改为「临时文件 + 现有 SFTP 管道」：
 *     上传：本地 tar czf → SFTP 上传 tar 包 → 服务端 tar xzf → 清理
 *     下载：服务端 tar cf（不压缩）→ SFTP 下载 tar 包 → 本地 tar xf → 清理
 *
 * 启用边界（与用户商定的设计）：
 *   - 目标不存在（全新传输）时由用例层调用；forceOverwrite=false 的增量场景必须保留
 *     逐文件通道（冲突检测依赖它）。
 *   - ★ 2026-09-26：目标**已存在**但用户已对目录冲突选「覆盖」（forceOverwrite=true）时也允许 ——
 *     此时逐文件通道本就跳过全部子文件冲突检测，与「解包后整目录覆盖合并」（mergeIntoExisting，
 *     同名项覆盖、本地独有项保留）语义等价。此前守卫不看 forceOverwrite，导致用户开了
 *     「TAR 打包传输加速」却因为目标恰好已在本地存在而静默走逐文件通道。
 *   - ★ 2026-09-29（三）：**上传方向补齐同一能力**。此前只有下载侧有 forceOverwrite 入口，
 *     上传侧「目录冲突 → 覆盖」落在 MergeLocalDirUseCase（纯逐文件），打包通道完全拿不到机会
 *     → 仅 TAR 模式下用户选了「覆盖」仍是 ⇄SFTP，而提示偏偏写着「选『覆盖』即可打包传输」。
 *     现 MergeLocalDirUseCase 在动工前先调本函数（mergeIntoExisting 由远端目标探测决定），
 *     于是「覆盖」「重命名」两条冲突出口在仅 TAR 下也一律打包。
 *   - ★ 2026-09-29（四）：**多选批量打包**（tryUploadBatch）—— 仅当「同一父目录下的 ≥2 个顶层条目
 *     且远端目标全部不存在」时启用；只要有一项目标已存在就整批交回逐项流程（保守版，
 *     见文件头 2026-09-29 该条）。**单文件传输恒走逐文件**（tar 只能打包目录/多条目集合，
 *     为一个文件单独打包是负收益）—— 这是有意边界，不是回退。
 *   - 本地或远端无 tar（探测一次并缓存）→ 非 tarOnly 时 'fallback'（用例回退逐文件通道）；
 *     tarOnly 时 'failed'（★ 2026-09-29：不回退，见 _decline）。
 *
 * 结果三态：
 *   'fallback' — 通道未接管（无环境/打包前失败），未创建进度条目，或已 discard 可安全回退逐文件。
 *                ★ 2026-09-29：**仅 TAR 模式绝不会出现此值** —— 该模式下一切「不可用」都硬失败。
 *   'success'  — 已完整传输（进度条目已收尾成功）
 *   'failed'   — 用户取消/中止（进度条目已记失败），不应再回退重试；
 *                ★ 2026-09-29：也可能来自仅 TAR 模式下打包通道不可用/失败（条目按失败收尾）
 *
 * ★ 2026-09-20 核实：旧实现在 folder.start + finish(false) 后仍返回 fallback，
 *   导致「失败日志 + 再开一条逐文件」双重记录。现对已提交的可恢复失败：
 *   discard 进度条目后返回 fallback（平滑降级且不留双重日志）；用户 abort 仍返回 failed。
 * ★ 2026-09-21（Kimi-K3）：下载方向 mkdtemp 失败改走可恢复 fallback（原为 failed，与上传不对称）；
 *   上传解包链 mv 前补 `test ! -e remoteTarget` 复查（防耗时窗口内目标被创建导致嵌套副本）。
 */

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import type { FolderTransferPort } from './transfer-types'
import type { FolderTransferCtx } from './panel-types'
import { shellQuotePosix } from './fs-ops'
import { log } from '../../services/sftp-logger'

export type TarChannelResult = 'fallback' | 'success' | 'failed'

/**
 * ★ 2026-09-28：传输通道模式（设置页「传输通道模式」下拉）。
 *   - smart    智能模式：按规模自动择路（文件多且总量小才打包，见 tarWorthwhile）
 *   - sftpOnly 仅 SFTP：永远走逐文件通道，不用打包
 *   - tarOnly  仅 TAR：永远尝试打包；**打包通道不可用时不回退**，直接失败并提示原因与解法
 *   - preferSftp 优先 SFTP：仅在「明显」划算时才打包（更严的文件数门槛）
 *   - preferTar  优先 TAR：除非「明显」吃亏才回退（更松的文件数/字节门槛）
 */
export type TarChannelMode = 'smart' | 'sftpOnly' | 'tarOnly' | 'preferSftp' | 'preferTar'

/**
 * ★ 2026-09-29：打包通道「不可用/失败」的原因分级。
 *
 * 存在意义：**仅 TAR 模式不允许回退**，传输会直接失败。此时必须让用户知道
 * 「为什么失败」以及「怎么解决」，而不是像以前那样静默换通道。分级后由调用方
 * （面板）把 code 翻译成本地化文案 —— tar-channel 本身不做 i18n。
 *
 * 粒度的取舍：只按「解法不同」切分，不按代码路径切分：
 *   - localTarMissing  → 装本机 tar（Windows 10+ 自带 bsdtar）
 *   - remoteTarMissing → 在服务器装 tar / 换用智能或逐文件模式
 *   - symlinkUnsupported → 打包通道不支持符号链接，只能换模式
 *   - tarballFailed / other → 网络/异常问题，详见日志
 *
 * ★ 2026-09-29（二）：`packFailed` 一码曾同时覆盖「远端打包失败」「本地打包失败」「本地解包失败」
 *   三件完全不同的事，于是用户看到「打包或解包失败」时**根本分不清是哪一端出了问题**
 *   （实测质问：「这是远程打包失败了，还是本地解压失败了？」）。按**发生位置**拆成三码，
 *   提示文案直接说明是哪一端失败，用户/我们都能立刻定位：
 *   - localPackFailed  → 本机（上传方向先把目录打成包）失败
 *   - remotePackFailed → 远端打包/远端解包失败（下载方向远端先打包、上传方向远端最后解包）
 *   - localExtractFailed → 本地解包失败（下载方向最后一跳）
 *   - nameEncodingUnsupported → ★ 跨系统文件名编码还原不了（见下）
 *
 * 「文件名编码不兼容」单独成码的原因：这是**跨实现**（Linux GNU tar ↔ Windows bsdtar）的
 * 系统性问题，不是环境故障，解法是换通道而不是重试：
 *   GNU tar 默认 gnu 格式把非 ASCII 名以**原始 UTF-8 字节**写进 name 字段，Windows 自带
 *   bsdtar（libarchive）读该字段时按**本机 ANSI 代码页(GBK)**解码 → 「测试」变「娴嬭瘯」
 *   → 顶层目录名对不上、`Invalid empty pathname`、退出码 1。
 *   正解是让远端用 pax 格式打包（非 ASCII 名写进 `path=` 扩展头并声明 UTF-8，两端都能正确读）。
 */
export type TarFailureCode =
  | 'localTarMissing'
  | 'remoteTarMissing'
  | 'symlinkUnsupported'
  | 'localPackFailed'
  | 'remotePackFailed'
  | 'localExtractFailed'
  | 'nameEncodingUnsupported'
  | 'tarballFailed'
  | 'other'

/** 各模式择路门槛（单位：字节）。smart 沿用 2026-09-26 实测定标值 */
const TAR_THRESHOLDS: Record<Exclude<TarChannelMode, 'sftpOnly' | 'tarOnly'>, { minFiles: number; maxBytes: number }> = {
  // 平衡：单流 tar 只在往返次数占主导时划算（文件多 + 总量小）
  smart: { minFiles: 600, maxBytes: 48 * 1024 * 1024 },
  // 偏向 SFTP：必须「明显」多文件才值得打包的固定开销
  preferSftp: { minFiles: 1500, maxBytes: 48 * 1024 * 1024 },
  // 偏向 TAR：几个文件以上 + 不太巨大就打包（除非几十个大文件）
  preferTar: { minFiles: 150, maxBytes: 256 * 1024 * 1024 },
}

export interface TarChannelDeps {
  hasSsh(): boolean
  /** SSH exec 收集 stdout；timeoutMs 缺省由实现决定
   *  ★ 2026-09-14 F2：opts.retryOnEmpty=false 时禁用空输出重试（非幂等命令用） */
  exec(cmd: string, timeoutMs?: number, opts?: { retryOnEmpty?: boolean }): Promise<string>
  /** 单文件 SFTP 传输（不产生 UI 条目）；onProgress 上报字节数，shouldAbort 返回 true 时中断 */
  uploadFile(localPath: string, remotePath: string, onProgress?: (bytes: number) => void, shouldAbort?: () => boolean): Promise<boolean>
  downloadFile(remotePath: string, localPath: string, size: number, onProgress?: (bytes: number) => void, shouldAbort?: () => boolean): Promise<boolean>
  remoteUnlink(remotePath: string): Promise<void>
  /** ★ 2026-08-11：本地目录真实大小（回填传输记录用；本地扫描开销低，失败返回 0） */
  scanLocalSize(localDir: string): Promise<number>
  /** ★ 2026-09-28：本地目录文件数 + 总字节（上传方向择路用；缺失则按 smart/tarOnly 走打包） */
  scanLocalDir?(localDir: string): Promise<{ size: number; count: number }>
  /**
   * ★ 2026-09-29（四）：**多个**本地路径的合计文件数 + 总字节（批量打包择路用）。
   *
   * 不能拿 scanLocalDir 逐个凑：它对**单个文件**调用时 readdir 必然抛错、返回 {0,0}，
   * 于是「选了 200 个散装小文件」会被算成 0 个文件、0 字节 → 恰好把最该打包的场景判掉。
   * 缺失时批量打包按「探测不到」处理（与 tarWorthwhile 的 fail-open 语义一致）。
   */
  scanLocalPaths?(paths: string[]): Promise<{ size: number; count: number }>
  /** ★ 2026-08-11：远端目录真实大小（下载进度显示用；快速模式下调用方返回 0 跳过扫描） */
  scanRemoteSize(remotePath: string): Promise<number>
  /**
   * ★ 2026-09-29：仅 TAR 模式下「打包通道不可用/失败」的用户通知（可选）。
   *
   * 只在该模式下调用 —— 其余模式的失败都会平滑回退逐文件通道，不需要打扰用户。
   * name 为传输条目名（目录名）；detail 为技术细节（原始报错/路径，已同时写日志），
   * 由调用方翻译成人话并给出解决方法。
   */
  notifyFailure?(name: string, code: TarFailureCode, detail: string): void
}

const TAR_OK = 'SFTP_PLUS_TAR_OK'
/** 服务端打包/解包超时：巨型目录留足余量 */
const REMOTE_TAR_TIMEOUT_MS = 120_000
/** 远端目录统计探测超时（find 只走服务端磁盘，不传数据） */
const REMOTE_STATS_TIMEOUT_MS = 30_000

/**
 * ★ 2026-09-29（四）：批量打包时「一批允许的条目名总字符数」上限。
 *
 * 本地打包要把 N 个顶层条目名作为参数交给 tar 子进程，而 Windows 的 CreateProcess
 * 命令行上限约 32k 字符（含引号）。这里按 8000 保守截断并把判据写成**字符数**而不是条数 ——
 * 条目数一样但名字长度可以差十倍（`a.txt` vs 一长串中文定语），只限条数防不住。
 * 超限时不做截断式打包（截断会静默漏传），直接回退逐项流程。
 */
const BATCH_MAX_ARG_CHARS = 8_000

/**
 * ★ 2026-09-26：打包通道启用门槛（按实测吞吐定标，见 tarWorthwhile 注释）。
 *
 * 为什么不无脑打包：本通道是**单流**（一个 tar 包顺序读），而逐文件通道默认
 * `clampDirConcurrency() = 3` 路并发。用户环境实测同一目录：
 *   dist 11.2 MB  tar 通道 126.0 KB/s（1m31s）  vs  逐文件 369.4 / 381.2 KB/s
 * 比值 ≈ 1:3，正好等于并发度差 —— 即「单流带宽 ≈ 120 KB/s，三路并发 ≈ 370 KB/s」。
 * 所以打包只在「往返次数占主导」时才划算：**文件多 + 总量不大**。
 * 具体门槛见 TAR_THRESHOLDS（2026-09-28 抽出为按模式预设）。
 */
/** 合并递归深度上限（防符号链接环把目录树无限展开） */
const MERGE_MAX_DEPTH = 64

/** 已 start 的可恢复失败：discard 进度条目后返回 fallback，避免双重失败日志 */
function tarRecoverableFallback(folder: FolderTransferPort, ctx: FolderTransferCtx): 'fallback' {
  try {
    if (folder.discard) folder.discard(ctx)
    else folder.finish(ctx, false)
  } catch { /* ignore */ }
  return 'fallback'
}

/**
 * ★ 2026-09-26：打包通道是否划算 —— 依据是「文件数 vs 总字节」而不是「有没有开开关」。
 *
 * 用户观察到的「有时候 SFTP 更快、有时候打包更慢」不是随机：本通道**单流**，
 * 逐文件通道 `clampDirConcurrency()=3` 路并发，同一链路上单流带宽只有并发时的 1/3
 * （用户环境实测 tar 126 KB/s vs 逐文件 370 KB/s）。因此：
 *   - 文件少（< TAR_MIN_FILES）：省下的往返次数抵不掉「打包 + 解包 + 合并」的固定开销；
 *   - 字节多（> TAR_MAX_BYTES）：单流吞吐劣势会被放大成分钟级差距。
 * 只有「文件多且总量小」（典型：几千个小文件）才是打包的主场。
 * 探测不到统计（远端无 GNU find -printf / 命令失败 / 快速模式）时**照旧走打包**（fail-open，
 * 与历史行为一致，不因探测失败悄悄改通道）。
 */
/**
 * ★ 2026-09-28：打包通道是否划算 —— 依据「文件数 vs 总字节」+ 用户选择的通道模式。
 *
 * 各模式语义（见 TarChannelMode 注释 + TAR_THRESHOLDS）：
 *   - sftpOnly / tarOnly：直接由 mode 决定，不看规模（两者都是「不做规模择路」的强制档）。
 *   - smart / preferSftp / preferTar：按各自门槛判定；探测不到统计（远端无 GNU find -printf / 命令失败）
 *     时——smart 与 preferTar 照旧走打包（fail-open），preferSftp 因无法确认收益则保守回退 SFTP。
 */
function tarWorthwhile(
  mode: TarChannelMode,
  stats: { size: number; count: number } | null,
): { ok: boolean; reason: string } {
  if (mode === 'sftpOnly') return { ok: false, reason: 'channel mode = SFTP-only: skip tar channel' }
  if (mode === 'tarOnly') {
    // ★ 2026-09-29：不再「打包失败就 fail-open 回退」——不可用时走 _decline 硬失败（见其注释）
    return { ok: true, reason: 'channel mode = TAR-only: force tar (no fallback when packing is unavailable)' }
  }
  const th = TAR_THRESHOLDS[mode]
  const mb = (stats?.size ?? 0) / 1048576
  const mbStr = mb.toFixed(1)
  if (!stats) {
    // 探测不到：smart/preferTar 保守打包；preferSftp 保守回退（用户选择偏 SFTP 且无法确认收益）
    if (mode === 'preferSftp') return { ok: false, reason: 'no remote stats (probe unavailable): prefer-SFTP mode falls back to SFTP' }
    return { ok: true, reason: 'no remote stats (probe unavailable): keep tar channel' }
  }
  if (stats.count >= th.minFiles && stats.size <= th.maxBytes) {
    return { ok: true, reason: `${stats.count} files / ${mbStr} MB: round-trip dominated, tar pays off (${mode})` }
  }
  if (stats.count < th.minFiles) {
    return {
      ok: false,
      reason: `only ${stats.count} files / ${mbStr} MB (< ${th.minFiles} files): pack+extract overhead ` +
        'outweighs saved round-trips, per-file channel is faster',
    }
  }
  return {
    ok: false,
    reason: `${stats.count} files / ${mbStr} MB (> ${Math.round(th.maxBytes / 1048576)} MB): single-stream tar ` +
      'loses to 3-way concurrent per-file transfer',
  }
}

/** 本机 tar 诊断输出保留上限（异常环境下 tar 可能狂吐警告，读掉但不必全留） */
const LOCAL_TAR_OUTPUT_MAX = 4_000
/** 本机 tar 子进程超时（压缩/解包大目录可能很久，主要防挂死；远端的 120s 对本机偏紧） */
const LOCAL_TAR_TIMEOUT_MS = 10 * 60_000

/**
 * ★ 2026-09-29（二）：本机 tar 可执行文件的选择 —— Windows 上必须**显式锁定系统自带 bsdtar**。
 *
 * 起因（用户实测 + 本机复现）：`spawn('tar')` 命中谁完全取决于 PATH 顺序。若命中 Git/PortableGit
 * 附带的 **MSYS GNU tar**，则所有带盘符的 Windows 绝对路径都会被它当成 tar 的「远程归档」语法
 * （`host:path`）→ `tar: Cannot connect to D: resolve failed`（退出码 128），**打包与解包双双必败**；
 * 而且 MSYS 的路径转换还会把 `-C D:\...` 破坏成 `D\:\\...`（`Cannot open: No such file or directory`）。
 * 本机实测：同一台机器上 `where tar` 的首项就是 PortableGit 的 `usr\bin\tar.exe`。
 *
 * `%SystemRoot%\System32\tar.exe`（bsdtar/libarchive）是原生 Windows 程序：路径语义无歧义，
 * 还支持 pax 归档的 UTF-8 文件名（跨系统中文目录名的关键，见 TarFailureCode 注释）。
 * 非 Windows 平台仍用 PATH 里的 `tar`（macOS 自带 bsdtar、Linux 自带 GNU tar 均正常）。
 */
let localTarCmdCache: string | null = null
function resolveLocalTarCmd(): string {
  if (localTarCmdCache) return localTarCmdCache
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
    const candidate = path.join(root, 'System32', 'tar.exe')
    if (existsSync(candidate)) {
      localTarCmdCache = candidate
      return candidate
    }
    // 极端情况（精简系统）下 System32 没有 tar：退回 PATH，但留下痕迹便于事后定因
    log.warn('tar channel: System32\\tar.exe not found, falling back to PATH tar:', candidate)
  }
  localTarCmdCache = 'tar'
  return 'tar'
}

/**
 * 本机 tar 执行结果。
 * ★ 2026-09-29（二）：必须带回 stderr 与退出码 —— 原实现 stdio 三路全 `ignore`，
 *   失败时只剩一个 `false`，日志与用户提示都只能说「失败」。
 *   这正是用户质问「这是远程打包失败了，还是本地解压失败了？」时**无从回答**的根源。
 */
interface LocalTarResult {
  ok: boolean
  code: number | null
  /** tar 的诊断输出（错误信息全走 stderr），已限长 */
  output: string
}

/**
 * 本机 tar 子进程封装。
 * 只捕获 stderr：正常运行时 stdout 无内容（`-f` 写文件），而 tar 的报错/警告全部走 stderr。
 * ★ 必须**持续消费**管道 —— tar 的警告足以填满 ~64KB 管道缓冲，子进程会阻塞在 write 上永不退出
 *   （2026-09-21 修过同类挂死）。此处边到边读、只保留前 LOCAL_TAR_OUTPUT_MAX 字符。
 */
function runLocalTar(args: string[]): Promise<LocalTarResult> {
  return new Promise((resolve) => {
    let settled = false
    const chunks: string[] = []
    let len = 0
    const done = (r: LocalTarResult) => { if (!settled) { settled = true; resolve(r) } }
    const take = (buf: Buffer) => {
      if (len >= LOCAL_TAR_OUTPUT_MAX) return
      const keep = buf.toString('utf8').slice(0, LOCAL_TAR_OUTPUT_MAX - len)
      if (keep) { chunks.push(keep); len += keep.length }
    }
    const text = () => chunks.join('').trim()
    try {
      const child = spawn(resolveLocalTarCmd(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
      child.stderr?.on('data', take)
      child.on('error', (e) => done({ ok: false, code: null, output: `spawn failed: ${(e as Error)?.message ?? e}` }))
      child.on('close', (code) => done({ ok: code === 0, code, output: text() }))
      setTimeout(() => {
        try { child.kill() } catch { /* ignore */ }
        const tail = text()
        done({ ok: false, code: null, output: `${tail}${tail ? ' | ' : ''}timed out after ${LOCAL_TAR_TIMEOUT_MS}ms` })
      }, LOCAL_TAR_TIMEOUT_MS)
    } catch (e) {
      done({ ok: false, code: null, output: `spawn threw: ${String((e as Error)?.message ?? e)}` })
    }
  })
}

type LocalTarFlavor = 'bsd' | 'gnu' | 'unknown'
let localTarFlavorCache: LocalTarFlavor | null = null

/**
 * ★ 2026-09-29（二）：本机 tar 的「方言」—— 决定解包参数怎么给（探测一次并缓存）。
 *   · bsd（bsdtar/libarchive）：基础参数即可；首个参数失败后还能用
 *     `--options hdrcharset=UTF-8` 指定归档头字符集，把 name 字段按 UTF-8（而非本机 ANSI）解释
 *     —— 本机实测它能救回「远端没用 pax 格式」的包。
 *   · gnu（GNU tar）：`-xf <含盘符的 Windows 路径>` 会被当成远程归档（`host:path`）→ 需要 `--force-local`；
 *     它**不认** `--options` / `--hdrcharset` / `--no-absolute-filenames`（MSYS 版实测 exit 64）。
 *   · unknown：两组参数都试（老版本/小众实现），以能跑通为准。
 */
async function detectLocalTarFlavor(): Promise<LocalTarFlavor> {
  if (localTarFlavorCache) return localTarFlavorCache
  const text = await new Promise<string>((resolve) => {
    let settled = false
    const chunks: string[] = []
    const done = (s: string) => { if (!settled) { settled = true; resolve(s) } }
    try {
      const child = spawn(resolveLocalTarCmd(), ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      const take = (b: Buffer) => { if (chunks.join('').length < 2000) chunks.push(b.toString('utf8')) }
      child.stdout?.on('data', take)
      child.stderr?.on('data', take)
      child.on('error', () => done(''))
      child.on('close', () => done(chunks.join('')))
      setTimeout(() => { try { child.kill() } catch { /* ignore */ }; done(chunks.join('')) }, 5000)
    } catch { done('') }
  })
  const lower = text.toLowerCase()
  localTarFlavorCache = /bsdtar|libarchive/.test(lower) ? 'bsd' : /gnu tar/.test(lower) ? 'gnu' : 'unknown'
  return localTarFlavorCache
}

/**
 * ★ 2026-08-26 C2：校验解包树全部落在 root 内（防 zip-slip）。
 * 遇越界路径返回 false；不跟随 symlink 递归（lstat）。
 * ★ 2026-09-14 F4 审计修复：symlink 此前「只查链接本身在 root 下」被放行，
 *   恶意 tar 包可携带指向 /etc/... 等沙箱外绝对路径的链接，落地后经
 *   rename/fs.cp(dereference:false) 进入用户目录，后续覆盖操作会写穿沙箱。
 *   现对每个 symlink 的目标做词法解析（readlink + resolve），逃出 root 即整体拒绝
 *   （回退逐文件通道，其对 symlink 一律跳过，语义更严）。
 */
async function assertExtractedUnderRoot(root: string): Promise<boolean> {
  const rootReal = await fs.realpath(root).catch(() => path.resolve(root))
  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep
  const walk = async (dir: string): Promise<boolean> => {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isSymbolicLink()) {
        // ★ F4：链接本身允许存在于 root 下，但其目标（词法解析后）必须也落在 root 内
        let target: string
        try {
          target = await fs.readlink(full)
        } catch {
          return false
        }
        const resolved = path.resolve(path.dirname(full), target)
        if (resolved !== rootReal && !resolved.startsWith(prefix)) {
          log.warn('tar channel: symlink target escapes sandbox, rejected:', full, '->', target)
          return false
        }
        continue
      }
      let real: string
      try {
        real = await fs.realpath(full)
      } catch {
        return false
      }
      if (real !== rootReal && !real.startsWith(prefix)) {
        log.warn('tar channel: zip-slip rejected path:', real)
        return false
      }
      if (e.isDirectory()) {
        if (!(await walk(full))) return false
      }
    }
    return true
  }
  return walk(root)
}

/** tar 会保留 symlink；上传到远端后无法可靠跨平台校验 linkname，含链接时回退逐文件通道。 */
async function containsSymlink(root: string, depth = 0): Promise<boolean> {
  if (depth > 100) return true
  let names: string[]
  try {
    names = await fs.readdir(root)
  } catch {
    return true
  }
  for (const name of names) {
    const full = path.join(root, name)
    const st = await fs.lstat(full).catch(() => null)
    if (!st) return true
    if (st.isSymbolicLink()) return true
    if (st.isDirectory() && await containsSymlink(full, depth + 1)) return true
  }
  return false
}

/** ★ 2026-09-26：暂存区目录名 —— 放目标/源目录下的隐藏目录，见 resolveStagingRoot */
const STAGING_DIR_NAME = '.sftp-plus-tmp'

/**
 * ★ 2026-09-26：本地暂存区 —— **优先与目标同盘**。
 *
 * 原实现一律用 `os.tmpdir()`，在 Windows 上通常是 C 盘，而用户目标常在 D 盘，于是：
 *   ① 收尾把解包结果搬进目标目录时跨盘 —— `fs.rename` 抛 EXDEV，退化成 `fs.cp` **全量复制一遍**
 *      （用户「传输完成后还要迁移文件、又需要时间」的直觉正是这一步）；
 *   ② 大目录下载要临时占用**系统盘**等量空间，几个 GB 就危险。
 * 放到「目标父目录 / 源父目录下的隐藏目录」= 同盘同文件系统，收尾 rename 只是改 inode（零拷贝），
 * 也不占用系统盘。目录不可写（只读盘/权限受限）时回退系统临时目录，行为与旧版一致。
 *
 * 注：位置**不影响传输速度**（瓶颈在网络），只影响收尾迁移这一步 —— 这是它唯一的作用。
 */
async function resolveStagingRoot(nearDir: string): Promise<string> {
  const candidate = path.join(nearDir, STAGING_DIR_NAME)
  try {
    await fs.mkdir(candidate, { recursive: true })
    return candidate
  } catch (e) {
    // ★ 2026-09-26：内联错误详情（Tabby 文件日志只写首参，多参数会被丢弃）
    log.warn(`tar channel: staging dir unusable near target, falling back to system temp: ${candidate} :: ${String((e as Error)?.message ?? e)}`)
    return os.tmpdir()
  }
}

/**
 * ★ 2026-09-26：清理暂存子目录；随后尝试移除空的暂存根。
 * 暂存根只在「确实为空」时才能删掉（`rmdir` 语义），并发多个传输时另一个任务还在用，
 * 删不掉就静默保留 —— 绝不能在这里做 `rm -rf`，那会误删并发任务的临时数据。
 */
async function cleanupStaging(root: string | null, subDir: string | null): Promise<void> {
  if (subDir) await fs.rm(subDir, { recursive: true, force: true }).catch(() => {})
  if (!root || root === os.tmpdir()) return
  await fs.rmdir(root).catch(() => { /* 非空/被占用：留给下一次传输或用户手动清理 */ })
}

/**
 * ★ 2026-09-26：临时名 —— 可读化。
 *
 * 原为纯 `randomUUID()`（36 位），用户看到 `.sftp-plus-tar-<uuid>.tar` 根本不知道对应哪个目录，
 * 尤其失败残留在源目录里时无从判断该不该删。现改为
 * `<目录名>.sftp-plus-<kind>-<6位随机>`：前段自解释，后段短随机保证同名目录并发/重入
 * （重复下载同一目录）时互不踩踏。适用于远端 tar 包/解包目录与本地 tar 包。
 */
function makeTempName(baseName: string, kind: string): string {
  return `${sanitizeNameSegment(baseName)}.sftp-plus-${kind}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 把任意名称片段变成安全的文件名片段：去掉路径分隔符、控制字符、Windows 保留字符与
 * 前导点（前导点会生成隐藏文件/破坏相对路径语义），空白压成下划线。
 * 按**字符**截断到 40 个（中文按 UTF-8 是 3 字节，40×3 + 后缀 ~30 字节仍远低于 255 字节上限）。
 */
function sanitizeNameSegment(name: string): string {
  const cleaned = String(name ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .trim()
  if (!cleaned) return 'archive'
  return Array.from(cleaned).slice(0, 40).join('')
}

/**
 * ★ 2026-09-29（三）：上传方向「远端落地」命令的**唯一**构造点。
 *
 * 为什么抽成纯函数：这段命令字符串决定「整目录搬入」还是「合并覆盖」，两种语义差别极大
 * （前者要求目标不存在，后者要求目标存在），而它此前是拼在 tryUploadDir 里的一长串模板串 ——
 * 只能靠肉眼读。抽出来后产物探针可以直接从 dist 里抽出本函数、喂真实路径跑断言
 * （见 .workbuddy/verify/tar-upload-merge-probe.cjs）。
 *
 * mergeIntoExisting 的语义：
 *   true  → `mkdir -p <目标> && cp -a <解包>/<名>/. <目标>/`
 *           只覆盖同名项、保留目标端独有项（与用户在目录冲突里选「覆盖」严格一致）；
 *           前补 mkdir -p 兜住「探测时还在、现在被删」的竞态，并让「目标是文件」在此直接失败
 *           （mkdir 失败 → 退出码非 0 → 如实报 remotePackFailed，而不是静默错写）。
 *   false → `test ! -e <目标> && mv <解包>/<名> <目标>` —— 同文件系统原子搬入。
 *           ★ 2026-09-21 P2：mv 前必须复查目标仍不存在 —— tar 包上传耗时的窗口内若目标被
 *           用户/其他进程创建，GNU mv 会把源目录静默**嵌套**进已存在目录（复制出 目标/名）。
 *
 * retryOnEmpty 与之一体两面：mv 链非幂等（重放会嵌套），必须禁用空输出重试；
 * cp -a 链幂等（重放只是再覆盖一遍），可以启用。两者必须同源，避免某天只改一边。
 */
function buildRemoteUploadLanding(opts: {
  remoteTar: string
  remoteExtractDir: string
  expectedBase: string
  remoteTarget: string
  mergeIntoExisting: boolean
}): { cmd: string; retryOnEmpty: boolean } {
  const extractDirEntry = path.posix.join(opts.remoteExtractDir, opts.expectedBase)
  // ⚠ 两条分支都必须自带前导 `&&`：它们被拼在「&& test -e <解包出的顶层条目> 」之后，
  //   少一个 `&&` 就会变成 `test -e A test ! -e B` 这种把两个命令当参数传给 test 的写法
  //   —— 命令照样「能跑完」（test 忽略多余参数），却**完全没有执行力**，
  //   是本项目产物探针实际抓到过一次的真实缺陷（见 tar-upload-merge-probe 的【A】段）。
  const placeStep = opts.mergeIntoExisting
    ? `&& mkdir -p ${shellQuotePosix(opts.remoteTarget)} ` +
      `&& cp -a ${shellQuotePosix(extractDirEntry + '/.')} ${shellQuotePosix(opts.remoteTarget + '/')} `
    : `&& test ! -e ${shellQuotePosix(opts.remoteTarget)} ` +
      `&& mv ${shellQuotePosix(extractDirEntry)} ${shellQuotePosix(opts.remoteTarget)} `
  return {
    cmd:
      // ★ 2026-09-20：解包前用 tar tz 拒绝绝对路径与 .. 成员（本地有 assertExtractedUnderRoot，远端此前缺失）
      `! tar tzf ${shellQuotePosix(opts.remoteTar)} | grep -E '(^/|(^|/)\\.\\.((/|$)))' >/dev/null ` +
      `&& mkdir -p ${shellQuotePosix(opts.remoteExtractDir)} ` +
      `&& tar xzf ${shellQuotePosix(opts.remoteTar)} -C ${shellQuotePosix(opts.remoteExtractDir)} ` +
      `&& test -e ${shellQuotePosix(extractDirEntry)} ` +
      placeStep +
      `&& rm -rf ${shellQuotePosix(opts.remoteExtractDir)} ` +
      `&& printf '${TAR_OK}\\n'`,
    retryOnEmpty: opts.mergeIntoExisting,
  }
}

/**
 * ★ 2026-09-29（四）：多选批量上传的远端落地命令（与 buildRemoteUploadLanding 同族，只服务批量）。
 *
 * 与单目录版的关键差异：**先全量校验、再统一搬入**。
 *   ① `test -e <解包>/<n>` × N —— 确认包内每个顶层条目都解出来了（缺一个立刻失败）；
 *   ② `test ! -e <目标>/<n>` × N —— 确认落点全部空闲；
 *   ③ `mv <解包>/<n> <目标>/<n>` × N —— 同文件系统原子重命名。
 * 若把 ② 与 ③ 逐条交替（`test ! -e n1 && mv n1 && test ! -e n2 && mv n2 ...`），条目 n2 的目标
 * 恰在窗口内被第三方创建时，n1 已经搬入而整链失败 —— 留下**半落地**状态：用户看到一次失败，
 * 但远端已经多了一半文件，重试还会撞上「目标已存在」。前置全量校验把这种情形压成「一条都没动」。
 *
 * 保守版语义：调用方（UploadBatchUseCase）已确认所有目标都不存在，故这里一律走原子 mv，
 * **不做** cp -a 合并分支（合并覆盖只属于「用户明确选了覆盖」的两条冲突出口，见上一条注释）。
 * mv 链非幂等（重放会嵌套），因此 retryOnEmpty 恒为 false —— 与单条目版同一结论。
 *
 * ⚠ 每个片段都必须自带前导 `&&`：漏掉会变成 `test -e A test ! -e B` 之类把两条命令当参数传给
 *   test 的写法 —— 命令照样「跑完」却什么也没做（单条目版重构时真实踩过，见 tar-upload-merge-probe）。
 */
function buildRemoteUploadBatchLanding(opts: {
  remoteTar: string
  remoteExtractDir: string
  remoteDir: string
  /** 顶层条目名（同一父目录下的多个条目，顺序即 tar 内的顺序） */
  names: string[]
}): string {
  const at = (base: string, n: string) => shellQuotePosix(path.posix.join(base, n))
  const entryChecks = opts.names.map(n => `&& test -e ${at(opts.remoteExtractDir, n)} `).join('')
  const targetChecks = opts.names.map(n => `&& test ! -e ${at(opts.remoteDir, n)} `).join('')
  const moves = opts.names.map(n => `&& mv ${at(opts.remoteExtractDir, n)} ${at(opts.remoteDir, n)} `).join('')
  return (
    `! tar tzf ${shellQuotePosix(opts.remoteTar)} | grep -E '(^/|(^|/)\\.\\.((/|$)))' >/dev/null ` +
    `&& mkdir -p ${shellQuotePosix(opts.remoteExtractDir)} ` +
    `&& tar xzf ${shellQuotePosix(opts.remoteTar)} -C ${shellQuotePosix(opts.remoteExtractDir)} ` +
    entryChecks +
    targetChecks +
    moves +
    `&& rm -rf ${shellQuotePosix(opts.remoteExtractDir)} ` +
    `&& printf '${TAR_OK}\\n'`
  )
}

/** 解包结果：成功，或带「哪一步失败 + 为什么」的失败（供 _decline 产出可解释的用户提示） */
type ExtractOutcome = { ok: true } | { ok: false; code: TarFailureCode; detail: string }

/** 安全本地解包到沙箱再移入目标（失败不污染 localDest） */
async function extractTarSafely(
  tarFile: string,
  localDest: string,
  expectedBase: string,
  stagingRoot?: string,
  /** ★ 2026-09-26：目标目录已存在（用户已选「覆盖」）→ 解包结果合并覆盖进目标，不整目录搬入 */
  mergeIntoExisting = false,
): Promise<ExtractOutcome> {
  // ★ 2026-09-26：解包沙箱**同盘优先** —— 沙箱与最终目标同盘时，下面的 rename 只是改 inode；
  //   跨盘（原实现固定用 C 盘 temp）会退化成 `fs.cp` 全量复制，大目录就是「传完还要再搬一遍」。
  const sandbox = await fs.mkdtemp(path.join(stagingRoot ?? os.tmpdir(), 'untar-')).catch(() => null)
  if (!sandbox) {
    return { ok: false, code: 'localExtractFailed', detail: `cannot create extract sandbox under ${stagingRoot ?? os.tmpdir()}` }
  }
  try {
    const flavor = await detectLocalTarFlavor()
    // ★ 2026-09-29（二）：按本机 tar 方言给参数 —— 不再「先试一个必然不被支持的选项」白跑一次子进程。
    //   原实现的首选参数带 `--no-absolute-filenames`，而 Windows 自带 bsdtar **不认**它（本机实测 exit 1），
    //   导致每次解包都要多起一个进程、多一条误导性 stderr。
    //   注：绝对路径逃逸由下面的 assertExtractedUnderRoot（沙箱遍历校验）兜底，比 tar 的该选项更严。
    const base = ['-xf', tarFile, '-C', sandbox]
    const charSetRetry = ['--options', 'hdrcharset=UTF-8', '-xf', tarFile, '-C', sandbox]
    const forceLocalRetry = ['-xf', tarFile, '-C', sandbox, '--force-local']
    const attempts: string[][] =
      flavor === 'gnu'
        // GNU tar：`--force-local` 告诉它「文件名里的冒号不是主机名」，否则 `-f D:\...` 被当远程归档
        ? [forceLocalRetry, base]
        : flavor === 'bsd'
          // bsdtar/libarchive：基础参数即可；失败再用头字符集指定救「远端未用 pax 格式」的包
          ? [base, charSetRetry]
          : [base, forceLocalRetry, charSetRetry]

    let extracted = false
    let lastOutput = ''
    for (const args of attempts) {
      const r = await runLocalTar(args)
      lastOutput = r.output
      if (r.ok) { extracted = true; break }
    }
    if (!extracted) {
      // ★ 2026-09-29（二）：把 tar 的真实 stderr 内联进 detail —— 用户提示与日志都能直接读到原因
      return {
        ok: false,
        code: 'localExtractFailed',
        detail: `local tar extract failed (tar=${flavor}, cmd="${resolveLocalTarCmd()}"): ${localDest} :: output="${lastOutput.slice(0, 400)}"`,
      }
    }
    if (!(await assertExtractedUnderRoot(sandbox))) {
      return { ok: false, code: 'localExtractFailed', detail: `extracted tree escapes sandbox (zip-slip or symbolic link): ${localDest}` }
    }
    const extractedDir = path.join(sandbox, expectedBase)
    const st = await fs.lstat(extractedDir).catch(() => null)
    if (!st) {
      // ★ 2026-09-29（二）：区分「包结构本来就不对」与「名字还原不回来」。
      //   后者是跨系统编码问题：Linux GNU tar 默认 gnu 格式把非 ASCII 名以原始 UTF-8 字节存在
      //   name 字段，Windows bsdtar 按本机 ANSI 代码页解码 → 「测试」变「娴嬭瘯」。包其实解出来了、
      //   只是名不对 —— 此时沙箱里**恰好只有一个顶层目录**即可判定，交给用户可行动的解法。
      const tops = await fs.readdir(sandbox).catch(() => [] as string[])
      const detail =
        `expected top-level entry missing after extract: expected="${expectedBase}" ` +
        `got=${JSON.stringify(tops.slice(0, 3))} (tar=${flavor}): ${localDest}`
      log.warn('tar channel: ' + detail)
      return { ok: false, code: tops.length === 1 ? 'nameEncodingUnsupported' : 'localExtractFailed', detail }
    }
    await fs.mkdir(localDest, { recursive: true }).catch(() => {})
    const finalDest = path.join(localDest, expectedBase)
    // ★ 2026-09-26：目标已存在（用户已对目录冲突选「覆盖」）——把沙箱内容**逐条并进**目标目录。
    //   不能 `rm(finalDest)` 再 rename：那会连「本地独有文件」一起删光，而逐文件通道的覆盖
    //   语义是只覆盖同名项、保留本地独有项。mergeDirInto 同盘 rename 零拷贝。
    if (mergeIntoExisting) {
      // ★ 2026-09-26：逐条容错 + 全量记账的合并（见 mergeDirInto 注释）。
      //   曾试过 `fs.cp` 并行快路径，实测**不必**：去掉「每文件一次 fs.rm」之后，
      //   本机 288 文件 / 119 目录的逐条合并只要 ~325ms（原来的 31s 全是那句多余 rm
      //   在 Windows 上被删除拦截层/实时防护逐次放大所致）。单一机制更好维护，
      //   且 `fs.cp` 覆盖时会先删目标再复制（内部 unlink），不如本实现「原地覆盖」干净。
      const stats: MergeStats = { dirs: 0, files: 0, links: 0, vanished: [], failed: [] }
      const seen = new Set<string>([await fs.realpath(finalDest).catch(() => finalDest)])
      await mergeDirInto(extractedDir, finalDest, stats, seen)
      log.info(
        `tar channel: merge into existing dir done (dirs=${stats.dirs} files=${stats.files} ` +
        `links=${stats.links} skipped=${stats.vanished.length} failed=${stats.failed.length}): ${finalDest}`,
      )
      if (stats.vanished.length) {
        // 源侧在 readdir 之后读不到的条目：目标目录通常已有同名内容，跳过即可（不是失败）
        log.warn(
          `tar channel: merge skipped ${stats.vanished.length} entries (source vanished after listing): ` +
          stats.vanished.slice(0, 5).join(' | '),
        )
      }
      if (stats.failed.length) {
        // 真失败：回退逐文件通道补齐（不静默半成品），但先把逐条原因全部写进日志
        log.warn(
          `tar channel: merge failed ${stats.failed.length} entries, refill via per-file channel: ` +
          stats.failed.slice(0, 5).join(' | '),
        )
        return {
          ok: false,
          code: 'localExtractFailed',
          detail: `merge into existing dir failed at ${stats.failed.length} entries: ${stats.failed.slice(0, 3).join(' | ')}`,
        }
      }
      return { ok: true }
    }
    // 目标应不存在（调用方保证）；若存在则失败以免覆盖
    if (await fs.stat(finalDest).then(() => true).catch(() => false)) {
      log.warn('tar channel: destination already exists, abort move:', finalDest)
      return { ok: false, code: 'localExtractFailed', detail: `destination already exists, abort move: ${finalDest}` }
    }
    try {
      await fs.rename(extractedDir, finalDest)
    } catch (e) {
      // 跨设备：复制再删
      if (typeof (fs as any).cp === 'function') {
        try {
          await (fs as any).cp(extractedDir, finalDest, { recursive: true, dereference: false })
        } catch (e2) {
          return {
            ok: false,
            code: 'localExtractFailed',
            detail: `move into destination failed (rename+cp): ${finalDest} :: ${String((e2 as Error)?.message ?? e2)}`,
          }
        }
      } else {
        return {
          ok: false,
          code: 'localExtractFailed',
          detail: `move into destination failed (rename, no fs.cp available): ${finalDest} :: ${String((e as Error)?.message ?? e)}`,
        }
      }
    }
    return { ok: true }
  } finally {
    await fs.rm(sandbox, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * ★ 2026-09-26：合并统计 —— 合并「进已存在目录」的收尾不再「一条失败全盘作废」。
 * `vanished`：源条目在 readdir 之后读不到（别名/并发/被清理）→ 跳过记账，**不算失败**
 *             （此时目标目录通常已有上一次的完整副本，跳过无副作用）；
 * `failed`  ：真写不进去（权限/占用/目标是目录）→ 非空时整体判失败，交回逐文件通道补齐。
 */
interface MergeStats {
  dirs: number
  files: number
  links: number
  vanished: string[]
  failed: string[]
}

/**
 * ★ 2026-09-26：把 `src` 目录的内容**合并覆盖**进已存在的 `dest` 目录（目录递归、文件覆盖）。
 *
 * 用于 tar 通道「目标已存在 + 用户选覆盖」的收尾，语义与逐文件通道的覆盖**严格一致**：
 * 同名项被替换、`dest` 里的本地独有项原样保留（不做 mirror 删除）。
 *
 * ★ 2026-09-26 重写（用户实测：目标已存在时打包通道走完 1m31s 的传输，却在收尾合并
 *   抛 `ENOENT: copyfile '<沙箱>\\dist\\...\\__PAGE__.txt' -> '<目标>\\...'` 而整体作废、
 *   回退逐文件**重下一遍**，界面上表现为「TAR 记录突然变成 ⇄SFTP」）。旧实现有三处硬伤：
 *   ① 边遍历边 `fs.rename` **把源文件搬走** —— 源是「正在被遍历的树」，任何一条打不开或
 *      被别名重复抵达的条目都会让该条目消失，进而整次合并 return false；
 *   ② 单条失败即 `return false`，已合并好的几百个文件全部白费，且调用方只能整体回退；
 *   ③ 覆盖前 `fs.rm(d, { recursive: true })` —— 若同名目标是**目录**（重名/类型冲突），
 *      会递归删掉用户目标目录里的整棵子树（数据丢失风险）。
 *   现在：**只读源、只写目标**（不再 rename 搬源，源由调用方 finally 统一清理），
 *   逐条容错（坏条目记账后继续），且只删「非普通文件」的同名目标项。
 *   `fs.copyFile` 对**普通文件**目标就是原地覆盖，因此不再有每文件一次的 `fs.rm` ——
 *   本机实测去掉它后同一棵树（288 文件/119 目录）的收尾从 31.4s 降到 0.33s。
 *   另：链接（symlink/junction）按链接重建，建不出才解引用；目录按 realpath 防重入，
 *   避免符号链接环把树无限展开（旧实现遇到指回祖先的链接会递归数分钟）。
 */
async function mergeDirInto(
  src: string,
  dest: string,
  stats: MergeStats,
  seen: Set<string>,
  depth = 0,
): Promise<void> {
  if (depth > MERGE_MAX_DEPTH) {
    stats.failed.push(`depth limit reached at "${dest}"`)
    return
  }
  await fs.mkdir(dest, { recursive: true }).catch(() => {})

  let entries
  try {
    entries = await fs.readdir(src, { withFileTypes: true })
  } catch (err) {
    stats.vanished.push(`${src} :: ${String((err as Error)?.message ?? err)}`)
    return
  }

  for (const e of entries) {
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)

    // dirent 不足以区分「目录」与「指向目录的链接」（Windows 上 libuv 把 junction 报成目录），
    // 统一用 lstat 判定；条目在 readdir 之后消失时只记账不中断。
    let st
    try {
      st = await fs.lstat(s)
    } catch (err) {
      stats.vanished.push(`${s} :: ${String((err as Error)?.message ?? err)}`)
      continue
    }

    if (st.isSymbolicLink()) {
      await copyLinkOrTarget(s, d, stats, seen, depth)
      continue
    }
    if (st.isDirectory()) {
      // 别名防重入：同一物理目录只展开一次，链接环因此不会无限递归
      const real = await fs.realpath(s).catch(() => s)
      if (seen.has(real)) {
        stats.vanished.push(`${s} (alias already merged)`)
        continue
      }
      seen.add(real)
      stats.dirs++
      await mergeDirInto(s, d, stats, seen, depth + 1)
      continue
    }
    await copyEntry(s, d, stats)
    stats.files++
  }
}

/** 链接落地：能建链接就建（保持语义）；建不出才退化解引用；都失败则记账 */
async function copyLinkOrTarget(
  s: string,
  d: string,
  stats: MergeStats,
  seen: Set<string>,
  depth: number,
): Promise<void> {
  const target = await fs.readlink(s).catch(() => null)
  if (target !== null) {
    const dst = await fs.lstat(d).catch(() => null)
    if (dst && !dst.isDirectory()) await fs.rm(d, { force: true }).catch(() => {})
    const ok = await fs.symlink(target, d).then(() => true).catch(() => false)
    if (ok) { stats.links++; return }
  }
  // 建链接失败（Windows 需开发者模式/管理员）：按目标实际类型解引用
  const rst = await fs.stat(s).catch(() => null)
  if (rst?.isDirectory()) {
    const real = await fs.realpath(s).catch(() => s)
    if (seen.has(real)) { stats.vanished.push(`${s} (alias already merged)`); return }
    seen.add(real)
    stats.links++
    await mergeDirInto(s, d, stats, seen, depth + 1)
    return
  }
  if (rst?.isFile()) {
    await copyEntry(s, d, stats)
    stats.links++
    return
  }
  stats.vanished.push(`${s} (dangling link)`)
}

/** 单条目落地：只删「非普通文件」的同名目标项（绝不对目标目录做 recursive 删除） */
async function copyEntry(s: string, d: string, stats: MergeStats): Promise<void> {
  const dst = await fs.lstat(d).catch(() => null)
  if (dst) {
    if (dst.isDirectory()) {
      stats.failed.push(`"${d}" (destination is a directory, refusing to replace)`)
      return
    }
    // ★ 2026-09-26：目标是**普通文件**时不必先删 —— `fs.copyFile` 自己就会覆盖写。
    //   原先「每个文件先 rm 再 copy」在 Windows + 实时防护/过滤驱动/回收站重定向的环境里
    //   每次 rm 都是一次昂贵的元数据操作（实测本机被安全删除拦截层记成 ~100ms/次），
    //   288 个文件就是 30s。只有目标是符号链接等非普通文件时才需要先清掉。
    if (!dst.isFile()) await fs.rm(d, { force: true }).catch(() => {})
  }
  try {
    await fs.copyFile(s, d)
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    // ENOENT = 源在 readdir 之后消失（别名/并发）→ 目标侧多半已有同名内容，跳过即可；
    // 其它 I/O 错误（EACCES/EBUSY/ENOSPC）才是真失败，交回逐文件通道补齐。
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') stats.vanished.push(`${s} :: ${msg}`)
    else stats.failed.push(`${s} -> ${d} :: ${msg}`)
  }
}

export class TarChannel {
  private localTarOk: boolean | null = null
  private remoteTarOk: boolean | null = null
  /** ★ 2026-09-29（二）：远端 tar 是否支持 `--format=pax`（缓存）——
   *  跨系统中文文件名的关键，见 TarFailureCode 的 nameEncodingUnsupported 说明 */
  private remotePaxOk: boolean | null = null
  /** ★ 2026-09-26：远端 ionice 可用性（缓存，仅 Linux 有） */
  private remoteIoniceOk: boolean | null = null

  constructor(private readonly deps: TarChannelDeps) {}

  /**
   * ★ 2026-09-29：打包通道「不可用/失败」的统一出口 —— 按模式决定回退还是硬失败。
   *
   * 为什么必须收口到一处：是否回退不再取决于「失败发生在哪个阶段」，而只取决于用户
   * 选了什么模式。修复前有十来个分支各自 `return 'fallback'`，这正是「选了仅 TAR 却
   * 偷偷走 SFTP、用户无从察觉」的成因。
   *
   *   · 非 tarOnly：未提交（无 ctx）→ 'fallback'（调用方直接走逐文件通道，不产生条目）；
   *                已提交（有 ctx）→ discard 条目后 'fallback'（平滑降级且不留双重失败日志）。
   *   · tarOnly  ：**不回退** —— 已提交的条目按失败收尾（用户能在传输记录里看到这次尝试
   *                确实发生过、且失败了），并通过 deps.notifyFailure 告知原因与解法，
   *                返回 'failed'。未提交时不新建条目：传输压根没开始，提示已说明原因。
   *
   * detail 会被内联进日志（Tabby 文件日志只写首参，多参数会被丢弃），必须自带上下文。
   */
  private _decline(
    mode: TarChannelMode,
    name: string,
    code: TarFailureCode,
    detail: string,
    folder?: FolderTransferPort,
    ctx?: FolderTransferCtx,
  ): TarChannelResult {
    if (mode !== 'tarOnly') {
      log.warn(`tar channel unavailable (${code}), fallback to per-file channel: ${detail}`)
      if (folder && ctx) return tarRecoverableFallback(folder, ctx)
      return 'fallback'
    }
    log.warn(`tar channel required by TAR-only mode but unusable (${code}), transfer will fail: ${detail}`)
    if (folder && ctx) {
      try { folder.finish(ctx, false) } catch { /* ignore */ }
    }
    try { this.deps.notifyFailure?.(name, code, detail) } catch { /* ignore */ }
    return 'failed'
  }

  /** 本地 tar 可用性探测（缓存）：Windows 10+ 自带 bsdtar（选型见 resolveLocalTarCmd） */
  private async _localTarAvailable(): Promise<boolean> {
    if (this.localTarOk !== null) return this.localTarOk
    const r = await runLocalTar(['--version'])
    this.localTarOk = r.ok
    if (!r.ok) log.warn(`tar channel: local tar unusable ("${resolveLocalTarCmd()}"): ${r.output}`)
    return this.localTarOk
  }

  /** 远端 tar 可用性探测（缓存） */
  private async _remoteTarAvailable(): Promise<boolean> {
    if (this.remoteTarOk !== null) return this.remoteTarOk
    try {
      // ★ 2026-09-20 P1-13：幂等探测命令显式启用重试
      const out = await this.deps.exec('command -v tar || which tar', undefined, { retryOnEmpty: true })
      this.remoteTarOk = /\btar\b/.test(out)
    } catch {
      this.remoteTarOk = false
    }
    return this.remoteTarOk
  }

  /**
   * ★ 2026-09-29（二）：远端 tar 是否支持 `--format=pax`（缓存）。
   *
   * 为什么必须探测而不是直接加：命令一旦带上不被支持的选项就会**整体失败**，
   * 结果是「本来能打包、现在报错」，比不修还糟。探测失败时退回原命令（行为与修复前一致，
   * 此时本地还有 `--options hdrcharset=UTF-8` 兜底，见 extractTarSafely）。
   *
   * 探测方式是 `--help` 关键字计数：GNU tar 与 bsdtar 的 help 里都有 `--format`，
   * 且该命令幂等、无副作用（相比「拿 /dev/null 试打一个包」更轻，也不写任何文件）。
   */
  private async _remoteTarSupportsPax(): Promise<boolean> {
    if (this.remotePaxOk !== null) return this.remotePaxOk
    try {
      const out = await this.deps.exec(`tar --help 2>&1 | grep -c -- '--format' || true`, REMOTE_STATS_TIMEOUT_MS, { retryOnEmpty: true })
      this.remotePaxOk = parseInt(String(out).trim(), 10) > 0
    } catch {
      this.remotePaxOk = false
    }
    return this.remotePaxOk
  }

  /** ★ 2026-09-26：远端 ionice 可用性探测（缓存）。BSD/macOS 无此命令，探测失败即跳过 */
  private async _remoteIoniceAvailable(): Promise<boolean> {
    if (this.remoteIoniceOk !== null) return this.remoteIoniceOk
    try {
      const out = await this.deps.exec('command -v ionice || which ionice', undefined, { retryOnEmpty: true })
      this.remoteIoniceOk = /\bionice\b/.test(out)
    } catch {
      this.remoteIoniceOk = false
    }
    return this.remoteIoniceOk
  }

  /**
   * ★ 2026-09-26 P0：远端打包命令的「让路」前缀 —— 打包绝不能和 sshd 抢资源。
   *
   * `nice -n 19`：把打包压到最低 CPU 优先级。若无此让步，`tar czf` 会在 CPU 被限流的
   *   突发性能实例上霸占整核，sshd 的加密/读盘被饿死 → 每个 SFTP read 都撞 10s 超时。
   * `ionice -c3`：idle IO 类，云盘被打满时让打包主动排队到最后（仅 Linux 有，先探测）。
   */
  private async _remoteNicePrefix(): Promise<string> {
    const io = (await this._remoteIoniceAvailable()) ? 'ionice -c3 ' : ''
    return `${io}nice -n 19 `
  }

  /** 上传：本地目录 → tar.gz → SFTP → 服务端解包。remoteTarget 必须不存在（调用方保证） */
  async tryUploadDir(
    localPath: string,
    remoteTarget: string,
    folder: FolderTransferPort,
    name: string,
    /**
     * ★ 2026-09-29（三）：远端目标**已存在**（用户已对目录冲突选「覆盖」，或重命名后的合并）
     * → 解包结果**合并覆盖**进目标目录（同名项覆盖、目标端独有项保留），不再要求目标不存在。
     *
     * 与 tryDownloadDir 的同名形参完全对称 —— 上传侧此前**没有**这个开关，于是用户在冲突
     * 提示里选了「覆盖」，落地执行的 MergeLocalDirUseCase 只会逐文件 uploadRaw，
     * 打包通道永远拿不到机会（实测：仅 TAR 模式下 ⇄SFTP）。
     */
    mergeIntoExisting = false,
    /** ★ 2026-09-28：传输通道模式（决定择路门槛） */
    mode: TarChannelMode = 'smart',
    /**
     * ★ 2026-09-29（三）：来源冲突记录的 id —— 合并上传必须复用同一条日志。
     *
     * 冲突流程会先把来源记录收尾为失败（`folder.finish(ctx, false)`），随后靠 reuseLogEntryId
     * 把它**翻正**为成功。打包通道若自建新条目，用户就会看到「一条红色失败记录 + 一条 📦TAR 成功
     * 记录」，正是 2026-08-11 引入 reuseLogEntryId 要消灭的重复记录。
     */
    reuseLogEntryId?: string,
  ): Promise<TarChannelResult> {
    // ★ 2026-09-29：仅 SFTP 模式在此直接让路 —— 必须放在**最前面**，因为下面每一步都是真实开销：
    //   远端 tar 探测（SSH 往返）、本地/远端目录规模扫描（本地递归遍历 / 远端 readdir 往返）。
    //   用户已明确要求逐文件通道，做这些探测纯属浪费，还会在限流服务器上加剧通道争抢。
    //   注意：这是「用户明确要求」而非通道降级，因此**不走 _decline、不打 warn**（避免每次
    //   sftpOnly 传输都在日志里刷一条无意义的「unavailable」）。tarChannel 恒挂载见
    //   transfer-coordinator._buildPorts 的 P0 修复说明。
    if (mode === 'sftpOnly') return 'fallback'
    // ★ 2026-09-29：以下每一处「不可用」都经 _decline 出口 —— 非 tarOnly 平滑回退，
    //   tarOnly 硬失败并通知用户（见 _decline 注释）。原先这些分支一律静默 return 'fallback'。
    if (!this.deps.hasSsh()) {
      return this._decline(mode, name, 'other', `no ssh session: ${localPath} -> ${remoteTarget}`)
    }
    if (localPath.includes('\0') || remoteTarget.includes('\0')) {
      return this._decline(mode, name, 'other', `NUL byte in path: ${localPath} -> ${remoteTarget}`)
    }
    // ★ 2026-09-29：本地/远端 tar 可用性**拆开**判断 —— 缺哪一端的解法不同
    if (!(await this._localTarAvailable())) {
      return this._decline(mode, name, 'localTarMissing', `local tar unavailable (pack step): ${localPath}`)
    }
    if (!(await this._remoteTarAvailable())) {
      return this._decline(mode, name, 'remoteTarMissing', `remote tar unavailable (extract step): ${remoteTarget}`)
    }
    if (await containsSymlink(localPath)) {
      // 打包通道按设计不支持符号链接（上传后无法跨平台可靠校验 linkname，见 containsSymlink）
      return this._decline(mode, name, 'symlinkUnsupported', `local tree contains symlink: ${localPath}`)
    }
    // ★ 2026-09-28：上传方向同样按通道模式择路（此前一律打包，与下载不对称）。
    //   本地扫描开销低，探测失败则按 smart/tarOnly 保守打包（与下载一致）。
    const localStats = this.deps.scanLocalDir ? await this.deps.scanLocalDir(localPath).catch(() => null) : null
    const verdict = tarWorthwhile(mode, localStats)
    if (!verdict.ok) {
      // tarOnly 在此永远 ok=true（见 tarWorthwhile），该分支实际只服务 smart/preferSftp/preferTar
      return this._decline(mode, name, 'other', `not worthwhile (${verdict.reason}): ${localPath} -> ${remoteTarget}`)
    }
    // ★ 2026-09-29（三）：取证锚点里带上「合并/新建」—— 这是区分两种远端落地方式的关键标志
    log.info(`tar channel: packed upload start (${mergeIntoExisting ? 'merge-into-existing' : 'fresh'}); ${verdict.reason}: ${localPath} -> ${remoteTarget}`)

    // 1. 本地打包（提交前：失败静默回退，不产生进度条目）
    // ★ 2026-09-26：暂存区放**源目录同盘**（原固定 os.tmpdir = 多半 C 盘）——
    //   打包是「读源 + 写 tar」，异盘时两块盘各自忙、还要占用系统盘空间。
    const stagingRoot = await resolveStagingRoot(path.dirname(path.resolve(localPath)))
    const tmpDir = await fs.mkdtemp(path.join(stagingRoot, 'pack-')).catch(() => null)
    if (!tmpDir) {
      return this._decline(mode, name, 'other', `local staging dir unusable (mkdtemp failed): ${stagingRoot}`)
    }
    const tarFile = path.join(tmpDir, `${makeTempName(path.basename(localPath), 'tar')}.tar.gz`)
    // ★ 2026-09-29（二）：本机打包也必须显式避开「含盘符的绝对路径 + MSYS GNU tar」这一组合
    //   （见 resolveLocalTarCmd：`spawn('tar')` 命中 Git 自带 tar 时会以 `Cannot connect to D:` 必败）。
    //   同时用 `--format=pax` 打包：非 ASCII 名写进 pax 的 `path=` 扩展头并声明 UTF-8，
    //   这样无论远端是 GNU tar（Linux）还是 bsdtar（macOS）都能正确还原中文名；
    //   bsdtar 默认本就是 pax，加不加等价；GNU tar 1.13+ 均支持该选项。
    //   老到不认该选项的实现 → 退回原命令重试一次，行为与改动前完全一致。
    const packArgs = ['-czf', tarFile, '-C', path.dirname(localPath), path.basename(localPath)]
    let packed = await runLocalTar(['-czf', '--format=pax', tarFile, '-C', path.dirname(localPath), path.basename(localPath)])
    if (!packed.ok) packed = await runLocalTar(packArgs)
    if (!packed.ok) {
      await cleanupStaging(stagingRoot, tmpDir)
      return this._decline(
        mode, name, 'localPackFailed',
        `local tar pack failed: ${localPath} (tar="${resolveLocalTarCmd()}") :: output="${packed.output.slice(0, 400)}"`,
      )
    }
    const tarSize = (await fs.stat(tarFile).catch(() => null))?.size ?? 0
    if (tarSize <= 0) {
      await cleanupStaging(stagingRoot, tmpDir)
      return this._decline(mode, name, 'localPackFailed', `local tarball empty or unreadable: ${tarFile}`)
    }

    // 2. 提交：创建文件夹进度条目。
    //   ★ 2026-08-11：总量与进度按真实目录大小显示（压缩包大小会误导用户以为传少了），
    //   实际传输字节按比例折算；本地扫描不可得真实大小时退回按 tar 包字节显示
    const parent = path.posix.dirname(remoteTarget)
    // ★ 2026-09-26：可读临时名（原 `randomUUID()` 无从辨认对应目录）
    const remoteTar = path.posix.join(parent, `${makeTempName(path.posix.basename(remoteTarget), 'tar')}.tar.gz`)
    const realSize = await this.deps.scanLocalSize(localPath).catch(() => 0)
    const displayTotal = realSize > 0 ? realSize : tarSize
    const disp = (b: number) => displayTotal === tarSize ? b : Math.round(b * displayTotal / tarSize)
    const ctx = folder.start(name, 'upload', remoteTarget, localPath, displayTotal, 1, reuseLogEntryId)
    // ★ 2026-09-29：此刻起本次传输确定由打包通道接管 —— 显式标记，不再靠 updateLogSize 的副作用
    //   （后者只在需要回填真实大小时才触发，漏标会让记录/进度条误显示 ⇄SFTP）
    folder.markChannelMode?.(ctx, 'tar')
    if (realSize > 0) folder.updateLogSize?.(ctx, realSize)
    let remoteExtractDir: string | null = null
    try {
      if (folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      const upOk = await this.deps.uploadFile(
        tarFile, remoteTar,
        bytes => folder.updateProgress(ctx, disp(bytes), name, 0, displayTotal),
        () => folder.isAborted(ctx),
      )
      if (folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      if (!upOk) {
        return this._decline(mode, name, 'tarballFailed', `tarball upload failed: ${remoteTarget}`, folder, ctx)
      }
      // 3. 服务端：先校验归档成员无 zip-slip，再解包到临时目录后落地（mv 或合并覆盖）
      // 注意：tar -f 后必须紧跟归档文件名，不能加 --（否则 -- 会被当作文件名）
      remoteExtractDir = path.posix.join(parent, makeTempName(path.posix.basename(remoteTarget), 'untar'))
      const expectedBase = path.posix.basename(remoteTarget)
      // ★ 2026-09-29（三）：命令与「是否允许空输出重试」同源构造 —— 抽到 buildRemoteUploadLanding，
      //   理由（含 mv 的嵌套风险、cp 的幂等性）写在该函数注释里，并可被产物探针直接验证。
      const landing = buildRemoteUploadLanding({
        remoteTar, remoteExtractDir, expectedBase, remoteTarget, mergeIntoExisting,
      })
      const out = await this.deps.exec(
        landing.cmd,
        REMOTE_TAR_TIMEOUT_MS,
        { retryOnEmpty: landing.retryOnEmpty },
      )
      if (!new RegExp(`\\b${TAR_OK}\\b`).test(out)) {
        // ★ 2026-09-14 F3：只清理临时解包目录。mv 是同文件系统原子重命名，不产生「部分目标」残留；
        //   此刻 remoteTarget 若存在，只可能是竞态/契约违背下的既有数据——删它会误删用户文件
        this.deps.exec(`rm -rf ${shellQuotePosix(remoteExtractDir)}`).catch(() => {})
        // ★ 2026-09-25 / 2026-09-29：内联远端命令输出（同 pack），便于事后定因
        //   ★ 2026-09-29（二）：错误码改为 remotePackFailed —— 这一步是**远端解包**，
        //   与「本机打包失败」「本地解包失败」是不同的一端，提示文案必须能区分
        return this._decline(
          mode, name, 'remotePackFailed',
          `remote extract failed: ${remoteTarget} :: output="${String(out ?? '').trim().slice(0, 400)}"`,
          folder, ctx,
        )
      }
      folder.updateProgress(ctx, displayTotal, name, 1, displayTotal)
      folder.finish(ctx, true)
      log.info('tar channel upload OK:', localPath, '->', remoteTarget)
      return 'success'
    } catch (e) {
      if (remoteExtractDir) {
        this.deps.exec(`rm -rf ${shellQuotePosix(remoteExtractDir)}`).catch(() => {})
      }
      // ★ 2026-09-29：异常文本内联进日志（原实现把 e 作为第二参数传入，被 Tabby 日志丢弃）
      return this._decline(
        mode, name, 'other',
        `upload via tar channel threw: ${remoteTarget} :: ${String((e as Error)?.message ?? e)}`,
        folder, ctx,
      )
    } finally {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      await cleanupStaging(stagingRoot, tmpDir)
    }
  }

  /**
   * ★ 2026-09-29（四）：多选批量上传 —— 同一父目录下的多个顶层条目打**一个**归档。
   *
   * 与 tryUploadDir 的分工：那个方法服务「单个目录」，本方法服务「一次多选」。
   * 多选此前被拆成 N 个独立任务（文件夹各自打包、散装文件恒走逐文件），
   * 「一次选一批小文件」于是完全用不上打包通道 —— 而它恰恰是该通道的主场。
   *
   * ⚠ 语义上这是**机会型优化层**，不是新的必选路径：所有「不适用」一律 return 'fallback'
   *   （用局部的 skip()，**不经过 _decline**），让调用方原样跑既有的逐项流程。
   *   只有「已 folder.start 之后」的失败才走 _decline —— 那才是「打包通道真的试过并失败了」。
   *   理由：tarOnly 模式下 _decline 会硬失败，而批量打包是叠加在逐项通道之上的加速，
   *   若因为「不适用」就整体硬失败，会让原本能逐文件正常完成的传输反而失败（比现状更差）。
   *
   * 前置条件（由调用方 UploadBatchUseCase 判定并保证，这里再做防御性复核）：
   *   ≥2 个条目、同一父目录、远端**全部目标不存在**。
   */
  async tryUploadBatch(
    localPaths: string[],
    remoteDir: string,
    folder: FolderTransferPort,
    /** 进度/日志条目显示名（多语言文案由面板传入，通道内不做 i18n） */
    name: string,
    mode: TarChannelMode = 'smart',
  ): Promise<TarChannelResult> {
    const skip = (detail: string): TarChannelResult => {
      log.info(`[batch-upload] batch packing not applicable, per-file channel takes over: ${detail}`)
      return 'fallback'
    }
    // 仅 SFTP：连探测都不做（与 tryUploadDir 同一约定）
    if (mode === 'sftpOnly') return 'fallback'
    if (localPaths.length < 2) return skip(`only ${localPaths.length} entry`)
    const parents = [...new Set(localPaths.map(p => path.dirname(p)))]
    if (parents.length !== 1) return skip(`${parents.length} distinct parent dirs (multiple landing points)`)
    if (remoteDir.includes('\0') || localPaths.some(p => p.includes('\0'))) return skip('NUL byte in path')
    const names: string[] = []
    for (const p of localPaths) {
      // 与全库一致地净化：远程落点名绝不允许含路径分隔符或穿越组件
      const b = path.basename(p)
      if (!b || b === '.' || b === '..' || b.includes('/') || b.includes('\\')) return skip(`unsafe entry name: ${JSON.stringify(b)}`)
      names.push(b)
    }
    if (new Set(names).size !== names.length) return skip(`duplicate entry names (${names.length})`)
    // 命令行长度护栏：本地打包要靠 spawn 传 N 个条目名，Windows 命令行有硬上限
    const argChars = names.reduce((n, s) => n + s.length + 1, 0)
    if (argChars > BATCH_MAX_ARG_CHARS) return skip(`too many entry names for one command line (${argChars} chars)`)
    if (!this.deps.hasSsh()) return skip(`no ssh session: ${remoteDir}`)
    if (!(await this._localTarAvailable())) return skip(`local tar unavailable (pack step): ${parents[0]}`)
    if (!(await this._remoteTarAvailable())) return skip(`remote tar unavailable (extract step): ${remoteDir}`)
    // 符号链接：逐条判，目录递归、普通文件只需 lstat。
    //   ⚠ 不能把文件路径直接丢给 containsSymlink —— 它以 fs.readdir 开头，对普通文件必然抛错并
    //     按「无法验证」return true，会把「选了一批普通文件」整体误判成含符号链接（通道因此永不启用）。
    for (const p of localPaths) {
      const st = await fs.lstat(p).catch(() => null)
      if (!st) return skip(`lstat failed: ${p}`)
      if (st.isSymbolicLink()) return skip(`entry is a symlink: ${p}`)
      if (st.isDirectory() && (await containsSymlink(p))) return skip(`local tree contains symlink: ${p}`)
    }
    // 规模择路按**整批合计**判（同一套门槛）：合计口径更容易达到「文件多、总量小」，正是收益所在
    const stats = this.deps.scanLocalPaths ? await this.deps.scanLocalPaths(localPaths).catch(() => null) : null
    const verdict = tarWorthwhile(mode, stats)
    if (!verdict.ok) return skip(`not worthwhile (${verdict.reason}): ${names.length} entries -> ${remoteDir}`)
    log.info(`[batch-upload] packed batch upload start; ${verdict.reason}; ${names.length} entries: ${parents[0]} -> ${remoteDir}`)

    // 1. 本地打包（提交前：失败静默回退，不产生进度条目）
    //    暂存区与源同盘（理由见 resolveStagingRoot）；pax 格式与老实现回退策略同 tryUploadDir
    const stagingRoot = await resolveStagingRoot(parents[0])
    const tmpDir = await fs.mkdtemp(path.join(stagingRoot, 'pack-')).catch(() => null)
    if (!tmpDir) return skip(`local staging dir unusable (mkdtemp failed): ${stagingRoot}`)
    const batchTag = `${path.basename(remoteDir) || 'batch'}-${names.length}`
    const tarFile = path.join(tmpDir, `${makeTempName(batchTag, 'tar')}.tar.gz`)
    // 一次 -C 后跟多个条目名：tar 会把它们全部作为顶层成员收进同一个归档
    const packTail = ['-C', parents[0], ...names]
    let packed = await runLocalTar(['-czf', '--format=pax', tarFile, ...packTail])
    if (!packed.ok) packed = await runLocalTar(['-czf', tarFile, ...packTail])
    if (!packed.ok) {
      await cleanupStaging(stagingRoot, tmpDir)
      return skip(`local tar pack failed (tar="${resolveLocalTarCmd()}") :: output="${packed.output.slice(0, 400)}"`)
    }
    const tarSize = (await fs.stat(tarFile).catch(() => null))?.size ?? 0
    if (tarSize <= 0) {
      await cleanupStaging(stagingRoot, tmpDir)
      return skip(`local tarball empty or unreadable: ${tarFile}`)
    }

    // 2. 提交：创建进度条目（此后失败一律走 _decline，tarOnly 下不回退）
    const realSize = stats?.size ?? 0
    const displayTotal = realSize > 0 ? realSize : tarSize
    const disp = (b: number) => displayTotal === tarSize ? b : Math.round(b * displayTotal / tarSize)
    const remoteTar = path.posix.join(remoteDir, `${makeTempName(batchTag, 'tar')}.tar.gz`)
    const ctx = folder.start(name, 'upload', remoteDir, parents[0], displayTotal, names.length)
    folder.markChannelMode?.(ctx, 'tar')
    if (realSize > 0) folder.updateLogSize?.(ctx, realSize)
    let remoteExtractDir: string | null = null
    try {
      if (folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      const upOk = await this.deps.uploadFile(
        tarFile, remoteTar,
        bytes => folder.updateProgress(ctx, disp(bytes), name, 0, displayTotal),
        () => folder.isAborted(ctx),
      )
      if (folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      if (!upOk) {
        return this._decline(mode, name, 'tarballFailed', `batch tarball upload failed: ${remoteDir}`, folder, ctx)
      }
      remoteExtractDir = path.posix.join(remoteDir, makeTempName(batchTag, 'untar'))
      const out = await this.deps.exec(
        buildRemoteUploadBatchLanding({ remoteTar, remoteExtractDir, remoteDir, names }),
        REMOTE_TAR_TIMEOUT_MS,
        // ★ mv 链非幂等（重放会把源条目嵌套进已存在目标）→ 必须禁用空输出重试（同单条目版结论）
        { retryOnEmpty: false },
      )
      if (!new RegExp(`\\b${TAR_OK}\\b`).test(out)) {
        this.deps.exec(`rm -rf ${shellQuotePosix(remoteExtractDir)}`).catch(() => {})
        return this._decline(
          mode, name, 'remotePackFailed',
          `remote extract/landing failed: ${remoteDir} :: output="${String(out ?? '').trim().slice(0, 400)}"`,
          folder, ctx,
        )
      }
      folder.updateProgress(ctx, displayTotal, name, names.length, displayTotal)
      folder.finish(ctx, true)
      log.info(`[batch-upload] tar channel upload OK: ${names.length} entries -> ${remoteDir}`)
      return 'success'
    } catch (e) {
      if (remoteExtractDir) {
        this.deps.exec(`rm -rf ${shellQuotePosix(remoteExtractDir)}`).catch(() => {})
      }
      return this._decline(
        mode, name, 'other',
        `batch upload via tar channel threw: ${remoteDir} :: ${String((e as Error)?.message ?? e)}`,
        folder, ctx,
      )
    } finally {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      await cleanupStaging(stagingRoot, tmpDir)
    }
  }

  /**
   * ★ 2026-09-26：远端目录「文件数 + 总字节」一次取证（1 次 exec，服务端本地完成，不传数据）。
   *
   * 用途：判断打包通道是否划算（见 tarWorthwhile）。刻意**不用**客户端 readdir 遍历
   * （`scanRemoteSize` 那套要几百次网络往返，只为做个判断不值得）。GNU find 的 `-printf`
   * 不可用（busybox/BSD）或输出不可解析时返回 null，调用方按「照旧走打包」处理。
   */
  private async _remoteDirStats(dir: string): Promise<{ size: number; count: number } | null> {
    try {
      const q = shellQuotePosix(dir)
      const out = await this.deps.exec(
        `find ${q} -type f -printf '%s\\n' 2>/dev/null | awk '{n++; s+=$1} END {print n+0, s+0}'`,
        REMOTE_STATS_TIMEOUT_MS,
        { retryOnEmpty: false },
      )
      const m = String(out ?? '').trim().match(/^(\d+)\s+(\d+)$/)
      if (!m) return null
      return { count: parseInt(m[1], 10), size: parseInt(m[2], 10) }
    } catch {
      return null
    }
  }

  /** 下载：服务端打包 → SFTP → 本地解包。目标不存在，或已存在但用户已确认覆盖（mergeIntoExisting） */
  async tryDownloadDir(
    remoteSrc: string,
    localDest: string,
    folder: FolderTransferPort,
    name: string,
    /** ★ 2026-09-26：目标目录已存在（用户已对目录冲突选「覆盖」）→ 解包结果合并覆盖，不整目录搬入 */
    mergeIntoExisting = false,
    /** ★ 2026-09-28：传输通道模式（决定择路门槛） */
    mode: TarChannelMode = 'smart',
  ): Promise<TarChannelResult> {
    // ★ 2026-09-26：以下三种「前置条件不满足」原先都是**静默 return fallback** ——
    //   用户侧只能看到传输标签是 ⇄SFTP，完全无从判断打包加速为何没生效
    //   （本次「TAR 开着却走了 SFTP」就是因为这条链路没有任何日志，只能靠猜）。
    //   全部补日志，并带上足够的判别信息（tar 探测结果是**本会话缓存**的，一次失败会一直失败）。
    // ★ 2026-09-29：与上传对称 —— 仅 SFTP 模式最前面直接让路（见 tryUploadDir 同类说明：
    //   省掉 tar 探测与远端目录扫描这类真实开销；用户明确要求，不打 warn、不走 _decline）
    if (mode === 'sftpOnly') return 'fallback'
    // ★ 2026-09-29：与上传对称 —— 全部经 _decline 出口（非 tarOnly 平滑回退 / tarOnly 硬失败）
    if (!this.deps.hasSsh()) {
      return this._decline(mode, name, 'other', `no ssh session: ${remoteSrc} -> ${localDest}`)
    }
    if (remoteSrc.includes('\0') || localDest.includes('\0')) {
      return this._decline(mode, name, 'other', `NUL byte in path: ${remoteSrc} -> ${localDest}`)
    }
    if (!(await this._localTarAvailable())) {
      return this._decline(mode, name, 'localTarMissing', `local tar unavailable (extract step): ${localDest}`)
    }
    if (!(await this._remoteTarAvailable())) {
      return this._decline(mode, name, 'remoteTarMissing', `remote tar unavailable (pack step): ${remoteSrc}`)
    }

    const parent = path.posix.dirname(remoteSrc)
    const base = path.posix.basename(remoteSrc)
    // ★ 2026-09-26：先判断「打包是否划算」——用户的「有时候 SFTP 更快、有时候打包更慢」
    //   根因就是通道选择没看规模：本通道单流、逐文件通道 3 路并发（见 tarWorthwhile）。
    //   此时**还没创建进度条目**，返回 fallback 后调用方直接走逐文件通道，不需要 discard。
    const dirStats = await this._remoteDirStats(remoteSrc)
    const verdict = tarWorthwhile(mode, dirStats)
    if (!verdict.ok) {
      // tarOnly 在此永远 ok=true（见 tarWorthwhile），该分支实际只服务 smart/preferSftp/preferTar
      return this._decline(mode, name, 'other', `not worthwhile (${verdict.reason}): ${remoteSrc} -> ${localDest}`)
    }
    // ★ 2026-09-26：进通道时先留一行取证日志（含 merge 标志）—— 事后可据此判断
    //   「这次到底有没有尝试打包加速」，与上面的 skip/fallback 日志凑成完整证据链
    log.info(
      `tar channel: packed download start (mergeIntoExisting=${mergeIntoExisting}); ${verdict.reason}: ` +
      `${remoteSrc} -> ${localDest}`,
    )
    // ★ 2026-09-26：归档不再带 .gz —— 下载方向改为不压缩（见下方命令注释）；
    //   名字从纯 UUID 改为可读形式（`<源目录名>.sftp-plus-tar-<6位>.tar`）
    const remoteTar = path.posix.join(parent, `${makeTempName(base, 'tar')}.tar`)

    // 1. 服务端打包（提交前：失败静默回退）
    // 注意：tar -f 后必须紧跟归档文件名，不能加 --（否则 -- 会被当作文件名）
    // ★ 2026-09-26 P0：`tar czf` → `tar cf`（不压缩）+ nice/ionice 让路。
    //   实测（用户那台 ECS 上的 89MB jar 目录）：gzip 把 88.97MB 只压到 81.33MB（省 8%，
    //   因为 jar/zip 本身就是压缩格式），却要在（很可能是突发性能实例、CPU 积分受限的）
    //   服务端满核烧几十秒。同刻远端的打包/扫描与 SFTP 数据读抢同一份 CPU，
    //   结果是每个 read 都撞 russh 的 ~10s 单请求超时 → tar 通道整条崩掉、回退逐文件也崩。
    //   不压缩后 tar 包字节 ≈ 目录真实字节（只多 tar 头/填充），服务端只剩「读盘 + 加密」，
    //   代价与逐文件通道相同，但往返次数少得多 —— 这才是打包通道该有的样子。
    // ★ 2026-09-20 P1-13：幂等命令显式启用重试
    // ★ 2026-09-29（二）★ 关键修复：远端打包**必须用 pax 格式**。
    //   GNU tar 默认 gnu 格式把非 ASCII 文件名以**原始 UTF-8 字节**写进 name 字段（不带字符集声明），
    //   Windows 自带 bsdtar（libarchive）读该字段时按**本机 ANSI 代码页(GBK)** 解码，于是
    //   「测试」→「娴嬭瘯」：解出来的顶层目录名与预期对不上、并报 `Invalid empty pathname`，
    //   整个下载在「传完之后」失败（用户看到的「打包或解包失败」）。
    //   本机实测（Linux GNU tar 打的包 → Windows bsdtar 解）：
    //     gnu 格式：exit=1，沙箱顶层 = 娴嬭瘯（乱码）        ← 修复前
    //     pax 格式：exit=0，顶层/内层中文名与含空格名全对    ← 修复后
    //   pax 是非 ASCII 名的标准解法（`path=` 扩展头 + UTF-8），GNU tar 1.13+ 与 bsdtar 均支持。
    const paxFlag = (await this._remoteTarSupportsPax()) ? '--format=pax ' : ''
    let out = await this.deps.exec(
      `${await this._remoteNicePrefix()}tar cf ${shellQuotePosix(remoteTar)} ${paxFlag}-C ${shellQuotePosix(parent)} ${shellQuotePosix(base)} ` +
      `&& printf '${TAR_OK}\\n'`,
      REMOTE_TAR_TIMEOUT_MS,
      { retryOnEmpty: true },
    )
    if (!new RegExp(`\\b${TAR_OK}\\b`).test(out)) {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      // ★ 2026-09-25：内联远端命令输出（Tabby 文件日志只写首参，原先 out 被丢弃 → 无法定位远端 tar 失败原因）
      // ★ 2026-09-29（二）：错误码改为 remotePackFailed（发生位置=远端），与本地解包失败区分开
      return this._decline(
        mode, name, 'remotePackFailed',
        `remote pack failed: ${remoteSrc} (pax=${paxFlag ? 'on' : 'off'}) :: output="${String(out ?? '').trim().slice(0, 400)}"`,
      )
    }
    // tar 包大小（进度总量）：wc -c 兼容 GNU/BSD
    out = await this.deps.exec(`wc -c < ${shellQuotePosix(remoteTar)}`, undefined, { retryOnEmpty: true })
    const tarSize = parseInt(out.trim(), 10)
    if (!Number.isFinite(tarSize) || tarSize <= 0) {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      // ★ 2026-09-26 / 2026-09-29：内联 wc 输出，原先是静默 return（详见头部注释）
      return this._decline(
        mode, name, 'remotePackFailed',
        `remote tarball size invalid ("${String(out ?? '').trim().slice(0, 120)}"): ${remoteTar}`,
      )
    }

    // 2. 提交：创建文件夹进度条目。
    //   ★ 2026-08-11：与上传对称——总量与进度按真实目录大小显示（快速模式/扫描不可得时
    //   退回按 tar 包字节显示），实际传输字节按比例折算
    // ★ 2026-09-26 P0：目录大小扫描从「与打包并行」改为「打包之后串行」。
    //   原实现是 `sizeProbe = scanRemoteSize(...)` 与 exec(打包) 同时起飞，而 scanRemoteSize
    //   是**客户端 readdir 遍历**（并发 8，见 _scanRemoteDir）—— 在服务端已被打包压住时，
    //   又往同一条 SFTP 通道灌 8 路请求，正好和数据读抢通道，把「偶尔超时」放大成「全灭」。
    //   改串行后：打包跑完（不再 gzip，很快）→ 再扫描，全程远端只有一件事在跑。
    const realSize = await this.deps.scanRemoteSize(remoteSrc).catch(() => 0)
    const displayTotal = realSize > 0 ? realSize : tarSize
    const disp = (b: number) => displayTotal === tarSize ? b : Math.round(b * displayTotal / tarSize)
    const ctx = folder.start(name, 'download', remoteSrc, path.join(localDest, base), displayTotal, 1)
    // ★ 2026-09-29：与上传对称 —— 显式标记由打包通道接管（见上传路径同类说明）
    folder.markChannelMode?.(ctx, 'tar')
    if (realSize > 0) folder.updateLogSize?.(ctx, realSize)
    // ★ 2026-09-26：暂存区与**目标同盘**（见 resolveStagingRoot）——tar 包本体与解包沙箱
    //   都落在目标盘：收尾搬入是零拷贝 rename，也不再占用系统盘等量空间。
    const stagingRoot = await resolveStagingRoot(localDest)
    const tmpDir = await fs.mkdtemp(path.join(stagingRoot, 'pack-')).catch(() => null)
    // ★ 2026-09-26：本地临时归档同为 .tar（与远端归档一致，不再压缩），名字同样可读
    const tarFile = tmpDir ? path.join(tmpDir, `${makeTempName(base, 'tar')}.tar`) : null
    try {
      if (folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      // ★ 2026-09-21 P2 修复：本地 mkdtemp 失败（TEMP 满/权限）是可恢复失败——
      //   应平滑回退逐文件通道（discard 条目），而不是记 failed 让用户以为传输失败
      //   （与上传路径 mkdtemp 失败即 fallback 的对称行为对齐）
      if (!tmpDir || !tarFile) {
        return this._decline(mode, name, 'other', `local staging dir unusable (mkdtemp failed): ${stagingRoot}`, folder, ctx)
      }
      const dlOk = await this.deps.downloadFile(
        remoteTar, tarFile, tarSize,
        bytes => folder.updateProgress(ctx, disp(bytes), name, 0, displayTotal),
        () => folder.isAborted(ctx),
      )
      if (folder.isAborted(ctx)) {
        folder.finish(ctx, false)
        return 'failed'
      }
      if (!dlOk) {
        return this._decline(mode, name, 'tarballFailed', `tarball download failed: ${remoteSrc}`, folder, ctx)
      }
      // 3. 本地安全解包（沙箱 + zip-slip 校验 + 原子移入；目标不存在由调用方保证，
      //    ★ 2026-09-26：mergeIntoExisting 时目标本就存在，改为合并覆盖进目标目录）
      // ★ 2026-09-29（二）：解包失败带**具体原因与 tar 的真实 stderr**（原实现只返回 false，
      //   用户只能看到笼统的「打包或解包失败」，无法判断是远端打包失败还是本地解包失败）
      const extracted = await extractTarSafely(tarFile, localDest, base, stagingRoot, mergeIntoExisting)
      if (extracted.ok === false) {
        return this._decline(mode, name, extracted.code, extracted.detail, folder, ctx)
      }
      // ★ 2026-08-11：扫描不可得真实大小时，解包成功后用本地解出目录大小兜底回填传输记录
      //   ★ 2026-09-26：合并模式跳过 —— 此时目标目录里含用户原有的文件，扫出来的总大小
      //   会把它们算进去，记录里的体积凭空变大
      if (!(realSize > 0) && !mergeIntoExisting) {
        const extractedSize = await this.deps.scanLocalSize(path.join(localDest, base)).catch(() => 0)
        if (extractedSize > 0) folder.updateLogSize?.(ctx, extractedSize)
      }
      folder.updateProgress(ctx, displayTotal, name, 1, displayTotal)
      folder.finish(ctx, true)
      log.info('tar channel download OK:', remoteSrc, '->', localDest)
      return 'success'
    } catch (e) {
      // ★ 2026-09-29：异常文本内联进日志（原实现把 e 作为第二参数传入，被 Tabby 日志丢弃）
      return this._decline(
        mode, name, 'other',
        `download via tar channel threw: ${remoteSrc} :: ${String((e as Error)?.message ?? e)}`,
        folder, ctx,
      )
    } finally {
      this.deps.remoteUnlink(remoteTar).catch(() => {})
      if (tmpDir) await cleanupStaging(stagingRoot, tmpDir)
    }
  }
}

/**
 * SFTP+ 传输队列面板（从主面板抽离）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-11
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-09-26 — 新增「预估剩余时间」显示（etaText）：用 bytesTotal/bytesDone 与
 *              EMA 平滑后的数值速率 speedBps 估算，随速度/百分比一同展示；总量未知、
 *              暂停、排队、已跳过、或字节停止推进 >5s 时自动隐藏，不给假数字
 *              （⚠「停流即隐藏」已于当日二次修正中**删除**，见下方最后一条）
 *              2026-09-26 — 传输方式标签配色与「传输记录」对话框统一（以记录面板为基准）：
 *              原 📦打包加速=绿 #22c55e、且无描边，记录面板则是
 *              📦青 #26c6da、⚡橙 #ff9800、带 1px 描边 —— 同一笔传输在两个面板显示成两个
 *              颜色（用户截图比对指出）。现两处逐字一致；绿色另留给「成功」语义避免误读
 *              2026-09-26 — 进度条改「跨两列铺满整行」(.bar 加 grid-column: 1/-1)，同时放宽
 *              ETA 停显阈值 5s→30s 并给 ETA 固定槽位宽度。原先进度条装在 .transfer-main 内，
 *              而 .transfer 是 grid 1fr/auto —— 右侧 stats 一旦多出「剩余 3m36s」，第一列
 *              就被压窄，进度条右端实测从 x=1421 缩到 x=1347（用户两图比对：「没延续到
 *              右边」且长度来回跳）。ETA 的 5s 阈值又短于一次 russh 读重试周期（10s 硬超时
 *              + 最长 3s 退避），配合「delta=0 时速度保留旧值」不闪烁的设计，就出现「速度
 *              还在、剩余时间忽有忽无」。现进度条宽度只取决于面板宽度
 *              2026-09-26 — ETA 去掉固定槽位宽（用户二次反馈「剩余时间和进度间距太大」）：
 *              像素实测「76%」与「剩余 5s」之间空 58px，而下一条 flex gap 只有 16px ——
 *              多出的 ~42px 就是 `min-width: 76px; text-align: right` 里短文本吃不掉的槽位
 *              （「剩余 5s」只占 ~34px，右对齐把余量全顶在左侧）。进度条跨整行后槽位防抖
 *              已无意义（抖动影响不到进度条），改为宽度跟随内容；同时给 ETA 加 `*ngIf`，
 *              空串时整段不渲染 —— 只留空 span 它仍是 flex item，会白吃左右各一个 gap
 *              2026-09-26 — 剩余时间两处修正（用户第三次反馈）：
 *              ① **删掉「停流即隐藏」（原 ETA_STALL_HIDE_MS）**：文件夹通道的 bytesDone 只在
 *                 「一个文件传完」时跳变（transfer-ops 里 `ctx.bytesDone += sz` 之后才上报），
 *                 一个 84.9MB 的文件传 8 分钟期间没有任何进度事件 ⇒ 按停流隐藏会把**正在传输**
 *                 的剩余时间抹掉。用户明确要求「即便是没有变化，起码也要显示着之前的预估不要
 *                 消失」。现在只要测到过可信速率就始终显示，**不再有任何时间条件参与判定**
 *                 （顺带彻底消除「忽有忽无」）。估算 >24h 时用 `>24h` 占位，仍是「有值」。
 *              ② 配合面板侧修掉「首个速度窗口 deltaTime=纪元毫秒 ⇒ 速率 1e-9」的毒值
 *                 （见 sftp-floating-panel.component.ts 的 _updateFolderProgress），
 *                 本文件不再读取已删除的 `lastProgressAt` 字段
 *              2026-09-26 — 剩余时间三次修正（用户第四次反馈「似乎又完全不会动了」）：
 *              发散与停摆统一显示 `∞`（原 `>24h`）—— `speedBps` 被如实置 0 时（面板/
 *              协调器连续 15s 零字节推进，见 SPEED_STALL_ZERO_MS）也走同一占位；
 *              而「从未测到速率」仍返回空串，避免开传瞬间先闪一句 ∞。
 *              目录条目本身也改为字节级实时上报（见 transfer-ops 的 downloadRaw onProgress），
 *              整行在单个大文件期间不再静止
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import type { PanelTransferItem } from '../core/panel-types'
import { formatPercent, formatSize } from '../core/file-utils'

/**
 * ★ 2026-09-26（二次修正，取代当日的「停流即隐藏」）：**剩余时间一旦测到就不再消失**。
 *
 * 原设计：字节停止推进超过 `ETA_STALL_HIDE_MS`（先 5s 后 30s）即停显，怕拿旧速度算出假预估。
 * 用户实测否掉了这个设计，两条都不成立：
 *  ① **文件夹通道的 bytesDone 只在「一个文件传完」时跳变**（见 transfer-ops 里
 *     `ctx.bytesDone += sz` 之后才上报 progress）—— 一个 84.9MB 的文件传 8 分钟期间
 *     **没有任何进度事件**，于是「停流 >30s 就隐藏」会把**正在正常传输**的剩余时间抹掉；
 *  ② 速度文本本身就是「delta=0 时保留旧值」的语义（避免卡顿闪烁）。剩余时间必须与它同一套
 *     语义 —— 用户原话：「即便是没有变化，起码也要显示着之前的预估剩余时间不要消失呀」。
 *
 * 于是：**只要已经测到过可信速率就始终显示**；只有「还没测到速率」（开传瞬间、排队、暂停、
 * 总量未知）才是空的。这同时彻底消除了「忽有忽无」的抖动 —— 不再有任何时间条件参与显示判定。
 *
 * ★ 2026-09-26（三次修正，用户：「这次似乎又完全不会动了 …… 如果剩余时间很大，那就显示
 *   一个无穷大的字符吧 ∞」）：把「发散」的表现从 `>24h` 改成 **`∞`**，并补上「速率已被
 *   确证为 0」（通道停摆，面板/协调器零推进超阈值会这么置）→ 也显示 `∞`。
 *   与保留旧速率的区别很关键：**旧速率是「上一次的真实测量」，0 是「当前的真实状态」** ——
 *   停摆时只有后者能让用户一眼看出「没在动」，而不是对着一动不动的假数字猜。
 */

/** 剩余时间「发散」上限：超过 24 小时不再给具体数字，改用 `∞` 占位。
 *  注意这不等于「隐藏」：文案骨架保留（用户要求留着），只是不给一个没有参考价值的天文数字。
 *  它同时兜住「速率趋近 0」（如链路每窗口只推进 1 字节）算出的「几百年」。 */
const ETA_MAX_SEC = 24 * 60 * 60
/** 发散 / 停摆时的占位符：作为 `{time}` 传入 `transfer.etaRemaining` → 显示成「剩余 ∞」。
 *  用真符号而不是 `>24h` 这类文字：一是不必按语言翻译，二是「无限久」的语义直白
 *  （用户明确要求），三是**位置与骨架不变**，不会像隐藏那样让整段消失。 */
const ETA_INFINITE_TEXT = '∞'

@Component({
  selector: 'sftp-transfer-queue',
  template: `
    <div class="sftp-transfers" *ngIf="transfers.length && !hidden && !minimized"
      (mousedown)="$event.stopPropagation()"
      (wheel)="$event.stopPropagation()">
      <div class="transfer-header">
        <span>{{ i18n.t('transfer.inProgress') }} <span class="transfer-count" *ngIf="transfers.length">({{ transfers.length }})</span></span>
        <div class="transfer-header-btns">
          <button class="btn-link" (click)="minimizeChange.emit(true)" title="{{ i18n.t('transfer.minimizePanel') }}">─</button>
          <button class="btn-link" (click)="hiddenChange.emit(true)" title="{{ i18n.t('transfer.hidePanel') || 'Hide' }}">✕</button>
        </div>
      </div>
      <div class="transfer" *ngFor="let t of transfers; trackBy: trackByTransfer">
        <div class="transfer-main">
          <div class="transfer-title">
            <!-- ★ 2026-09-20：彩色方向徽章（对齐冲突框），替代弱对比度的纯 ↑↓ -->
            <span class="dir-badge"
              [class.dir-upload]="t.direction === 'upload'"
              [class.dir-download]="t.direction === 'download'"
              [title]="directionTitle(t)">{{ directionBadge(t) }}</span>
            <span *ngIf="t.isFolder">📁</span>
            <span class="transfer-name" [title]="t.name">{{ t.name }}</span>
            <span class="transfer-size" *ngIf="t.bytesTotal > 0">{{ formatSize(t.bytesTotal) }}</span>
            <span class="transfer-size" *ngIf="!(t.bytesTotal > 0) && t.bytesDone > 0">{{ formatSize(t.bytesDone) }}</span>
            <!-- ★ 2026-09-20：当前传输方式（与传输记录对话框标签一致） -->
            <span *ngIf="modeOf(t) === 'tar'" class="mode-tag tag-tar" [title]="i18n.t('log.modeTar')">📦 {{ i18n.t('log.modeTar') }}</span>
            <span *ngIf="modeOf(t) === 'sftp'" class="mode-tag tag-sftp" [title]="i18n.t('log.modeSftp')">⇄ {{ i18n.t('log.modeSftp') }}</span>
            <span class="paused-tag" *ngIf="t.paused">{{ i18n.t('transfer.paused') }}</span>
            <span class="queued-tag" *ngIf="t.queued" title="{{ i18n.t('transfer.queued') }}">⏳</span>
            <!-- ★ 2026-09-07 issue #15+：自动跳过（内容相同），用灰色 tag + 不显示速度/百分比区分于常规成功 -->
            <span class="skipped-tag" *ngIf="t.skippedAsDuplicate" title="issue #15: content identical, transfer not executed">↪ {{ i18n.t('transfer.skippedAsDuplicate') }}</span>
          </div>
          <div class="transfer-sub" *ngIf="t.isFolder && t.currentItem">
            {{ t.currentItem }}<span *ngIf="t.currentItemSize != null">  {{ formatSize(t.currentItemSize) }}</span> ({{ t.itemDone }}{{ t.itemCount > 0 ? '/' + t.itemCount : '' }})
          </div>
        </div>
        <div class="transfer-stats">
          <!-- ★ issue #15+：已跳过不显示速度（实际未传），仅显示「跳过」结束态 -->
          <span>{{ (t.queued || t.skippedAsDuplicate) ? '--' : (t.speed || '--') }}</span>
          <span *ngIf="!t.skippedAsDuplicate">{{ t.bytesTotal > 0 ? formatPercent(t.percent) + '%' : '--' }}</span>
          <!-- ★ 2026-09-26：预估剩余时间。空串时整段不渲染（*ngIf）—— 只留空 span 不隐藏，
               它作为 flex item 仍会吃掉左右各一个 gap，白送约 12px 空隙 -->
          <span class="transfer-eta" *ngIf="etaText(t) as eta">{{ eta }}</span>
          <button *ngIf="!t.paused && !t.queued && !t.skippedAsDuplicate" class="btn-pause" (click)="pause.emit(t)" title="{{ i18n.t('transfer.pause') }}">⏸</button>
          <button *ngIf="t.paused" class="btn-resume" (click)="resume.emit(t)" title="{{ i18n.t('transfer.resume') }}">▶</button>
          <button *ngIf="t.isFolder && !t.queued && !t.skippedAsDuplicate" class="btn-cancel-current" (click)="cancelCurrent.emit(t)" title="{{ i18n.t('transfer.cancelCurrent') }}">⏹</button>
          <button *ngIf="!t.isFolder && !t.skippedAsDuplicate" class="btn-cancel" (click)="cancel.emit(t)" title="{{ i18n.t('transfer.cancel') }}">⏹</button>
          <button *ngIf="t.isFolder && !t.skippedAsDuplicate" class="btn-cancel" (click)="cancel.emit(t)" title="{{ i18n.t('transfer.cancelAll') }}">✕</button>
        </div>
        <!-- ★ 2026-09-26：进度条移到 .transfer 直属、跨两列铺满整行（见文件头注释） -->
        <div class="bar" *ngIf="!t.skippedAsDuplicate"><div class="fill" [style.width.%]="t.percent"></div></div>
      </div>
    </div>
    <div class="sftp-transfers-mini" *ngIf="transfers.length && !hidden && minimized"
      (click)="minimizeChange.emit(false)" (mousedown)="$event.stopPropagation()">
      <span>📦 {{ i18n.t('transfer.inProgress') }} ({{ transfers.length }})</span>
    </div>
  `,
  styles: [`
    .sftp-transfers {
      display: flex; flex-direction: column; gap: 4px;
      max-height: 100px; overflow-y: auto;
      border-top: 2px solid var(--_primary);
      padding-top: 4px; flex-shrink: 0;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
      position: relative; z-index: 5;
      overscroll-behavior: contain;
    }
    .transfer {
      display: grid; grid-template-columns: 1fr auto; gap: 4px 8px;
      padding: 4px 8px; border-radius: 6px;
      background: var(--_surface); border: 1px solid var(--_border);
      font-size: 11px;
    }
    .transfer-title { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .transfer-name { font-weight: 600; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .transfer-size { font-size: 10px; color: var(--_text-muted); white-space: nowrap; }
    .transfer-sub { font-size: 10px; color: var(--_text-muted); margin-top: 2px; padding-left: 20px; }
    /* ★ 对齐冲突框 .conflict-direction：彩色底 + 粗箭头，一眼分清上传/下载 */
    .dir-badge {
      flex-shrink: 0; font-size: 11px; font-weight: 700;
      padding: 1px 8px; border-radius: 10px; white-space: nowrap; line-height: 1.6;
    }
    .dir-badge.dir-upload {
      background: rgba(76, 175, 80, 0.18); color: #4caf50;
      border: 1px solid rgba(76, 175, 80, 0.45);
    }
    .dir-badge.dir-download {
      background: rgba(33, 150, 243, 0.18); color: #2196f3;
      border: 1px solid rgba(33, 150, 243, 0.45);
    }
    /* ★ 2026-09-26：与传输记录对话框（.log-mode-tag / tag-*）逐字对齐。
       原先两处同一字段两套配色 —— 此处 📦绿 #22c55e、⚡琥珀 #f59e0b 且无描边，
       记录面板 📦青 #26c6da、⚡橙 #ff9800 且带 1px 描边，同一笔传输在「传输中」和
       「记录」里显示成两个颜色。统一以记录面板为准；绿色另留给「成功」语义，避免误读。 */
    .mode-tag {
      display: inline-block; flex-shrink: 0;
      font-size: 10px; font-weight: 600; padding: 0 6px; border-radius: 3px;
      white-space: nowrap; line-height: 1.6;
    }
    .tag-sftp {
      color: var(--_primary, #3b82f6); background: color-mix(in srgb, var(--_primary, #3b82f6) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--_primary, #3b82f6) 40%, transparent);
    }
    .tag-tar { color: #26c6da; background: rgba(38, 198, 218, 0.12); border: 1px solid rgba(38, 198, 218, 0.4); }
    /* ★ 2026-09-26：进度条跨两列铺满整行 —— 宽度只由面板宽度决定，不再被右侧 stats
       （速度/百分比/剩余时间/按钮）的出现与消失挤压。原先它装在 .transfer-main 里，
       stats 多出「剩余 3m36s」就会把 1fr 列压窄 74px，用户看到的就是"没延续到右边"。 */
    .bar {
      grid-column: 1 / -1;
      height: 4px; background: var(--_border); border-radius: 2px; overflow: hidden;
    }
    .fill {
      height: 100%; background: linear-gradient(90deg, var(--_primary), #78ffce);
      border-radius: 2px; transition: width 0.3s;
    }
    .transfer-stats { display: flex; gap: 6px; align-items: center; font-family: monospace; }
    /* ★ 2026-09-26：剩余时间用弱化色，避免与速度/百分比抢注意力。
       ★ 2026-09-26 二次调整：宽度跟随内容。原先 min-width: 76px + text-align: right
       预留固定槽位，但「剩余 5s」只占 ~34px，右对齐把多出的 ~42px 全顶在左侧 ——
       用户看到的「剩余时间和进度间距太大」就是它（像素实测该处间距 58px，
       而下一条 flex gap 只有 16px）。进度条已跨整行，槽位防抖价值消失，故移除。
       tabular-nums 保证秒数跳变时字宽不抖。
       注：此处是模板字符串内的 CSS，注释里禁用反引号（会截断字符串）。 */
    .transfer-eta {
      font-size: 10px; color: var(--_text-muted); white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .transfer-stats button { background: none; border: none; cursor: pointer; padding: 0 2px; font-size: 13px; line-height: 1; opacity: 0.7; }
    .transfer-stats button:hover { opacity: 1; }
    .btn-cancel { color: #ef4444; }
    .btn-cancel-current { color: #f59e0b; }
    .btn-pause { color: var(--_primary); }
    .btn-resume { color: #22c55e; }
    .paused-tag { font-size: 10px; color: #f59e0b; font-weight: 600; margin-left: 4px; }
    .queued-tag { font-size: 10px; opacity: 0.7; margin-left: 4px; }
    .skipped-tag { font-size: 10px; color: var(--_text-muted); margin-left: 4px; }
    .transfer-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 2px 8px; font-size: 12px; font-weight: 600;
      position: sticky; top: 0; z-index: 2;
      border-radius: 6px 6px 0 0;
      background: linear-gradient(var(--_surface), var(--_surface)),
                  linear-gradient(var(--_content, #f9fafb), var(--_content, #f9fafb));
    }
    .transfer-header button { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.6; padding: 0; line-height: 1; }
    .transfer-header button:hover { opacity: 1; }
    .transfer-header-btns { display: flex; gap: 6px; align-items: center; }
    .transfer-count { font-size: 10px; opacity: 0.7; }
    .sftp-transfers-mini {
      padding: 2px 10px; font-size: 11px; cursor: pointer;
      background: var(--_surface); border-radius: 4px;
      color: var(--_text-muted); text-align: center;
      border: 1px solid var(--_border); margin-top: 4px;
    }
    .sftp-transfers-mini:hover { opacity: 0.8; }
  `],
})
export class SftpTransferQueueComponent {
  @Input() transfers: PanelTransferItem[] = []
  @Input() hidden = false
  @Input() minimized = false
  @Output() hiddenChange = new EventEmitter<boolean>()
  @Output() minimizeChange = new EventEmitter<boolean>()
  @Output() pause = new EventEmitter<PanelTransferItem>()
  @Output() resume = new EventEmitter<PanelTransferItem>()
  @Output() cancel = new EventEmitter<PanelTransferItem>()
  @Output() cancelCurrent = new EventEmitter<PanelTransferItem>()

  formatSize = formatSize
  formatPercent = formatPercent
  @Input() i18n!: SftpI18nService

  /** trackBy：按对象引用，避免 200ms 传输 tick 触发 detectChanges 时重建所有传输行 DOM */
  trackByTransfer = (_: number, t: PanelTransferItem): PanelTransferItem => t

  /** 紧凑徽章文案（空间有限）；悬停看完整方向说明 */
  directionBadge(t: PanelTransferItem): string {
    return t.direction === 'upload'
      ? `⬆ ${this.i18n.t('transfer.upload')}`
      : `⬇ ${this.i18n.t('transfer.download')}`
  }

  directionTitle(t: PanelTransferItem): string {
    const local = this.i18n.t('pane.local')
    const remote = this.i18n.t('pane.remote')
    return t.direction === 'upload'
      ? `⬆ ${this.i18n.t('transfer.upload')}：${local} → ${remote}`
      : `⬇ ${this.i18n.t('transfer.download')}：${remote} → ${local}`
  }

  /** 排队中尚未开传时不标方式；开传后缺省按 SFTP 展示 */
  modeOf(t: PanelTransferItem): 'sftp' | 'tar' | null {
    if (t.queued || t.skippedAsDuplicate) return null
    if (t.transferMode === 'tar' || t.transferMode === 'sftp') {
      return t.transferMode
    }
    return 'sftp'
  }

  /**
   * ★ 2026-09-26：预估剩余时间（“剩余 1m23s”）。
   *
   * 数据来自 `bytesTotal - bytesDone` 与 EMA 平滑后的 `speedBps`，两者都由各 tick 维护。
   * 返回空串的**唯一**原因就是「还不存在可信速率」，绝不因为「时间过去了」而撤回：
   * - 暂停 / 排队中 / 已跳过：不产生字节，算出来的只是噪声；
   * - `bytesTotal <= 0`：扫描失败/兜底时总量未知，无从估算（这是最常见的「显示 --」原因）；
   * - `bytesDone <= 0`：一个字节都还没落地，没有速度可测；
   * - `speedBps` 不是有限数字（undefined/NaN）：**从未测到过速率** —— 开传瞬间会短暂空一下，
   *   随即显示并**保持住**。
   *
   * ⚠ 2026-09-26 二次修正：**已删除**原先的「停流超时即隐藏」（原 `ETA_STALL_HIDE_MS`）。
   *   文件夹通道的 bytesDone 只在「一个文件传完」时跳变，大文件传输期间长时间没有进度事件是
   *   **正常**的；按停流隐藏会把正在传输的剩余时间抹掉（用户实测）。详见文件头常量处注释。
   *   估算超过 `ETA_MAX_SEC`（24h）时显示 `∞` —— 仍是「有值」，不是消失。
   *
   * ⚠ 2026-09-26 三次修正：`speedBps === 0` 与「s>0 但 ETA 发散」一样显示 `∞`。
   *   0 不是「没测到」，而是面板/协调器在**连续零推进超阈值后如实写入的当前状态**
   *   （见 SPEED_STALL_ZERO_MS）：此时显示 ∞ 才是真相，而继续挂着旧速率会让人
   *   对着一动不动的界面猜「到底卡了还是在跑」（用户第四次反馈的原话）。
   */
  etaText(t: PanelTransferItem): string {
    if (t.paused || t.queued || t.skippedAsDuplicate) return ''
    if (!(t.bytesTotal > 0) || !(t.bytesDone > 0)) return ''
    // ★ 2026-09-26：区分「从未测到速率」与「测到过、当前为 0」——
    //   前者（开传瞬间/排队前）不显示，否则一开传就先闪一句「剩余 ∞」；
    //   后者是面板/协调器在连续零推进后如实置的 0，代表**通道此刻没在动**，显示 ∞ 才对。
    const bps = t.speedBps
    if (typeof bps !== 'number' || !isFinite(bps)) return ''
    const remain = t.bytesTotal - t.bytesDone
    if (remain <= 0) return ''
    if (bps <= 0) return this.i18n.t('transfer.etaRemaining', { time: ETA_INFINITE_TEXT })
    const sec = remain / bps
    const time = sec > ETA_MAX_SEC ? ETA_INFINITE_TEXT : this._formatEta(sec * 1000)
    return this.i18n.t('transfer.etaRemaining', { time })
  }

  /** 剩余时间格式化：`38s` / `2m05s` / `1h07m`。与 formatDuration 的差别在于
   *  不显示毫秒、分钟以下不保留小数 —— ETA 是估算，给 `2.3s` 这种精度纯属误导。 */
  private _formatEta(ms: number): string {
    const sec = Math.max(1, Math.round(ms / 1000))
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m${String(sec % 60).padStart(2, '0')}s`
    const hr = Math.floor(min / 60)
    return `${hr}h${String(min % 60).padStart(2, '0')}m`
  }
}

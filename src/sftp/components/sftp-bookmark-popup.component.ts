/**
 * SFTP+ 书签悬浮菜单（从主面板抽离）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-08-18
 * 修改人：DD1024z + Composer
 * 修改时间：2026-09-18
 *   支持设置项：是否按连接/全局分组；分组顺序可定制；
 *   关闭分组后可跨范围自由拖拽，全局书签名称右侧显示「全局」标签
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { Bookmark } from '../../services/sftp-bookmarks.service'
import { SftpI18nService } from '../../services/sftp-i18n.service'
import type { BookmarkScope } from '../core/panel-types'

@Component({
  selector: 'sftp-bookmark-popup',
  template: `
    <div class="bookmark-popup"
      [style.top.px]="top"
      [style.left.px]="left"
      (mousedown)="$event.stopPropagation()"
      (wheel)="$event.stopPropagation()">
      <div class="popup-arrow" [style.left.px]="arrowLeft"></div>
      <div class="popup-header">
        <div class="popup-title">{{ paneLabel }} {{ i18n.t('bookmark.title') }}</div>
        <div class="bookmark-header-actions">
          <button class="header-action-btn"
                  (click)="addScopeClick.emit('connection')"
                  [class.active]="addScope === 'connection'"
                  [title]="i18n.t('bookmark.addLocal')">{{ i18n.t('bookmark.addCurrentShort') }}</button>
          <button class="header-action-btn"
                  (click)="addScopeClick.emit('global')"
                  [class.active]="addScope === 'global'"
                  [title]="i18n.t('bookmark.addGlobal')">{{ i18n.t('bookmark.addGlobalShort') }}</button>
        </div>
      </div>
      <div class="bookmark-add-form" *ngIf="addScope">
        <input [ngModel]="newName" (ngModelChange)="newNameChange.emit($event)"
          placeholder="{{ i18n.t('bookmark.name') }} ({{ i18n.t('app.optional') }})" />
        <input [ngModel]="newPath" (ngModelChange)="newPathChange.emit($event)"
          placeholder="{{ i18n.t('bookmark.path') }}" />
        <div class="bookmark-form-actions">
          <button class="btn-cancel" (click)="cancelEdit.emit()">{{ i18n.t('app.cancel') || '取消' }}</button>
          <button class="btn-confirm" (click)="addBookmark.emit()" [disabled]="!newPath.trim()">
            {{ editingId ? (i18n.t('bookmark.save') || '保存书签') : i18n.t('bookmark.add') }}
          </button>
        </div>
      </div>
      <div class="bookmark-list">
        <!-- 分组模式：按 groupOrder 渲染「当前连接 / 全局」块 -->
        <ng-container *ngIf="groupByScope">
          <ng-container *ngFor="let scope of groupOrder">
            <div class="bookmark-scope-label" *ngIf="bookmarksOf(scope).length">
              {{ scopeLabel(scope) }}
            </div>
            <div class="bookmark-item" *ngFor="let b of bookmarksOf(scope); let i = index"
              [class.current]="isCurrent(b)"
              (click)="gotoBookmark.emit(b)"
              (contextmenu)="contextMenu.emit({ bookmark: b, event: $event })"
              draggable="true"
              (dragstart)="dragStart.emit({ event: $event, index: i, scope: scope })"
              (dragover)="dragOver.emit({ event: $event, index: i, scope: scope })"
              (dragend)="dragEnd.emit()"
              (drop)="drop.emit({ event: $event, index: i, scope: scope })"
              [class.drag-over-top]="dragOverIdx === i && dragOverScope === scope && !dragOverBottom"
              [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === scope && dragOverBottom"
              [class.dragging]="dragSourceIdx === i && dragSourceScope === scope"
              [title]="b.path">
              <span class="bm-drag-handle">⠿</span>
              <div class="bm-info">
                <span class="bm-name">{{ b.name }}</span>
                <span class="bm-path">{{ b.path }}</span>
              </div>
              <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark.emit(b.id)"
                title="{{ i18n.t('bookmark.remove') }}">✕</button>
            </div>
          </ng-container>
        </ng-container>

        <!-- 扁平模式：本地/全局混排，可跨范围拖拽；全局项左侧显示标签 -->
        <ng-container *ngIf="!groupByScope">
          <div class="bookmark-item" *ngFor="let b of allBookmarks; let i = index"
            [class.current]="isCurrent(b)"
            (click)="gotoBookmark.emit(b)"
            (contextmenu)="contextMenu.emit({ bookmark: b, event: $event })"
            draggable="true"
            (dragstart)="dragStart.emit({ event: $event, index: i, scope: 'all' })"
            (dragover)="dragOver.emit({ event: $event, index: i, scope: 'all' })"
            (dragend)="dragEnd.emit()"
            (drop)="drop.emit({ event: $event, index: i, scope: 'all' })"
            [class.drag-over-top]="dragOverIdx === i && dragOverScope === 'all' && !dragOverBottom"
            [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === 'all' && dragOverBottom"
            [class.dragging]="dragSourceIdx === i && dragSourceScope === 'all'"
            [title]="b.path">
            <span class="bm-drag-handle">⠿</span>
            <div class="bm-info">
              <span class="bm-name-row">
                <span class="bm-name">{{ b.name }}</span>
                <span class="bm-global-badge" *ngIf="!b.connectionKey"
                  [title]="i18n.t('bookmark.global')">{{ i18n.t('bookmark.globalBadge') }}</span>
              </span>
              <span class="bm-path">{{ b.path }}</span>
            </div>
            <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark.emit(b.id)"
              title="{{ i18n.t('bookmark.remove') }}">✕</button>
          </div>
        </ng-container>
      </div>
      <div class="popup-footer">
        <button (click)="close.emit()">{{ i18n.t('app.close') }}</button>
      </div>
    </div>
  `,
  styles: [`
    .bookmark-popup {
      position: absolute;
      width: 320px; max-height: 420px;
      display: flex; flex-direction: column;
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      z-index: 200;
      overflow: visible;
      transform: translateZ(0);
      transition: none !important;
      animation: none !important;
    }
    .popup-arrow {
      position: absolute; top: -7px;
      width: 12px; height: 12px;
      background: var(--_bg);
      border-left: 1px solid var(--_border);
      border-top: 1px solid var(--_border);
      transform: rotate(45deg);
      z-index: 1;
      pointer-events: none;
    }
    .popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px 4px 10px;
    }
    .popup-title {
      font-weight: 700; color: var(--_primary); font-size: 13px;
      padding: 2px 2px;
    }
    .bookmark-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .header-action-btn {
      width: auto;
      min-width: 46px;
      height: 22px;
      border-radius: 5px;
      border: 1px solid var(--_border);
      background: transparent;
      color: var(--_text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      line-height: 1;
      padding: 0 6px;
      white-space: nowrap;
    }
    .header-action-btn:hover { background: var(--_hover); }
    .header-action-btn.active {
      border-color: var(--_primary);
      background: var(--_hover);
      color: var(--_primary);
    }
    .popup-footer {
      display: flex; justify-content: flex-end;
      padding: 6px 10px; border-top: 1px solid var(--_border);
    }
    .popup-footer button {
      padding: 4px 10px; border-radius: 6px; font-size: 11px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .popup-footer button:hover { background: var(--_hover); }
    .bookmark-add-form {
      display: flex; flex-direction: column; gap: 6px;
      padding: 0 10px 10px;
    }
    .bookmark-add-form input {
      width: 100%; padding: 6px 8px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_input-bg);
      color: var(--_text); font-size: 12px;
      caret-color: var(--_text, currentColor);
      -webkit-text-fill-color: var(--_text, currentColor);
      cursor: text;
      user-select: text !important;
      -webkit-user-select: text !important;
      box-sizing: border-box; outline: none;
    }
    .bookmark-add-form input::placeholder {
      color: var(--_text);
      opacity: 0.45;
    }
    .bookmark-add-form input::-webkit-input-placeholder {
      color: var(--_text);
      opacity: 0.45;
    }
    .bookmark-add-form input:focus,
    .bookmark-add-form input:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35) !important;
      outline: none !important;
    }
    .bookmark-add-form .btn-confirm {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--_primary);
      background: var(--_primary);
      color: #fff;
      cursor: pointer;
      font-size: 11px;
      white-space: nowrap;
    }
    .bookmark-add-form .btn-confirm:disabled { opacity: 0.4; cursor: default; }
    .bookmark-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
    }
    .bookmark-add-form .btn-cancel {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text);
      cursor: pointer;
      white-space: nowrap;
    }
    .bookmark-add-form .btn-cancel:hover { background: var(--_hover); }
    .bookmark-scope-label {
      padding: 4px 10px 2px; font-size: 10px; font-weight: 600;
      color: var(--_primary); opacity: 0.6; text-transform: uppercase;
      border-bottom: 1px solid var(--_border); margin-bottom: 2px;
    }
    .bookmark-list {
      flex: 1; overflow-y: auto; min-height: 0;
      padding: 0 4px;
      scrollbar-width: thin;
      scrollbar-color: var(--_scroll-thumb, rgba(128,128,128,0.35)) var(--_scroll-track, rgba(128,128,128,0.06));
    }
    .bookmark-item {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 8px; border-radius: 6px; margin: 1px 0;
      cursor: pointer; transition: background 0.1s, opacity 0.15s;
    }
    .bookmark-item:hover { background: var(--_hover); }
    .bookmark-item.current {
      background: color-mix(in srgb, var(--_primary) 16%, transparent);
      box-shadow: inset 2px 0 0 var(--_primary);
    }
    .bookmark-item.current .bm-name { color: var(--_primary); }
    .bookmark-item.dragging { opacity: 0.4; }
    .bookmark-item.drag-over-top {
      border-top: 2px solid var(--_primary);
      padding-top: 3px;
    }
    .bookmark-item.drag-over-bottom {
      border-bottom: 2px solid var(--_primary);
      padding-bottom: 3px;
    }
    .bm-drag-handle {
      flex-shrink: 0; font-size: 14px; line-height: 1; color: var(--_text-muted);
      cursor: grab; opacity: 0.5; user-select: none; letter-spacing: -2px;
    }
    .bm-drag-handle:hover { opacity: 0.8; }
    .bm-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 1px;
    }
    .bm-name-row {
      display: flex; align-items: center; gap: 6px;
      min-width: 0;
    }
    .bm-name {
      font-size: 13px; font-weight: 500; color: var(--_text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      min-width: 0;
    }
    .bm-global-badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid color-mix(in srgb, var(--_primary) 45%, var(--_border));
      color: var(--_primary);
      background: color-mix(in srgb, var(--_primary) 12%, transparent);
      white-space: nowrap;
      opacity: 0.9;
      user-select: none;
    }
    .bm-path {
      font-size: 10px; color: var(--_text); opacity: 0.45;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .bm-remove {
      flex-shrink: 0; width: 22px; height: 22px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 4px; background: transparent;
      color: var(--_text); opacity: 0.3; font-size: 12px;
      cursor: pointer; line-height: 1;
    }
    .bm-remove:hover { opacity: 0.8; background: var(--_hover); }
  `],
})
export class SftpBookmarkPopupComponent {
  @Input() top = 0
  @Input() left = 0
  @Input() arrowLeft = 0
  @Input() paneLabel = ''
  @Input() pane: 'local' | 'remote' = 'local'
  @Input() addScope: 'connection' | 'global' | null = null
  @Input() newName = ''
  @Input() newPath = ''
  @Input() editingId: string | null = null
  @Input() connectionBookmarks: Bookmark[] = []
  @Input() globalBookmarks: Bookmark[] = []
  /** 扁平模式用的混排列表（保持书签数组中的相对顺序） */
  @Input() allBookmarks: Bookmark[] = []
  /** 是否按连接/全局分组（来自设置） */
  @Input() groupByScope = true
  /** 分组块顺序 */
  @Input() groupOrder: Array<'connection' | 'global'> = ['connection', 'global']
  @Input() dragSourceIdx = -1
  @Input() dragSourceScope: BookmarkScope | null = null
  @Input() dragOverIdx = -1
  @Input() dragOverScope: BookmarkScope | null = null
  @Input() dragOverBottom = false
  /** 当前面板路径（local/remote 当前目录），用于高亮路径匹配的书签 */
  @Input() currentPath = ''

  @Output() addScopeClick = new EventEmitter<'connection' | 'global'>()
  @Output() newNameChange = new EventEmitter<string>()
  @Output() newPathChange = new EventEmitter<string>()
  @Output() addBookmark = new EventEmitter<void>()
  @Output() cancelEdit = new EventEmitter<void>()
  @Output() gotoBookmark = new EventEmitter<Bookmark>()
  @Output() removeBookmark = new EventEmitter<string>()
  @Output() contextMenu = new EventEmitter<{ bookmark: Bookmark; event: MouseEvent }>()
  @Output() dragStart = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() dragOver = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() dragEnd = new EventEmitter<void>()
  @Output() drop = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() close = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  bookmarksOf(scope: 'connection' | 'global'): Bookmark[] {
    return scope === 'connection' ? this.connectionBookmarks : this.globalBookmarks
  }

  scopeLabel(scope: 'connection' | 'global'): string {
    return scope === 'connection'
      ? this.i18n.t('bookmark.forConnection')
      : this.i18n.t('bookmark.global')
  }

  /** 路径归一化：统一分隔符、去尾部斜杠；本地路径按 Windows 大小写不敏感处理 */
  private _normPath(p: string): string {
    if (!p) return ''
    let s = p.replace(/\\/g, '/').replace(/\/+$/, '')
    if (this.pane === 'local') s = s.toLowerCase()
    return s
  }

  /** 该书签路径是否与当前面板路径一致（用于高亮） */
  isCurrent(b: Bookmark): boolean {
    if (!this.currentPath) return false
    return this._normPath(b.path) === this._normPath(this.currentPath)
  }
}

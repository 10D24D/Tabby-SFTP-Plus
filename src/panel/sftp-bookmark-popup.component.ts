/**
 * SFTP+ 书签悬浮菜单（从主面板抽离）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { Bookmark } from '../sftp-bookmarks.service'
import { SftpI18nService } from '../sftp-i18n.service'
import type { BookmarkScope } from './panel-types'

@Component({
  selector: 'sftp-bookmark-popup',
  template: `
    <div class="bookmark-popup"
      [style.top.px]="top"
      [style.left.px]="left"
      (mousedown)="$event.stopPropagation()"
      (wheel)="$event.stopPropagation()">
      <div class="popup-arrow" [style.left.px]="arrowLeft"></div>
      <div class="popup-title">{{ paneLabel }} {{ i18n.t('bookmark.title') }}</div>
      <div class="bookmark-add-btns">
        <ng-container *ngIf="pane === 'remote' || pane === 'local'; else localAddBtn">
          <button class="add-btn" (click)="addScopeClick.emit('connection')" [class.active]="addScope === 'connection'">
            <span class="add-icon">+</span> {{ i18n.t('bookmark.addLocal') }}
          </button>
          <button class="add-btn" (click)="addScopeClick.emit('global')" [class.active]="addScope === 'global'">
            <span class="add-icon">+</span> {{ i18n.t('bookmark.addGlobal') }}
          </button>
        </ng-container>
        <ng-template #localAddBtn>
          <button class="add-btn" (click)="addScopeClick.emit('connection')" [class.active]="addScope === 'connection'">
            <span class="add-icon">+</span> {{ i18n.t('bookmark.addLocal') }}
          </button>
        </ng-template>
      </div>
      <div class="bookmark-add-form" *ngIf="addScope">
        <input [ngModel]="newName" (ngModelChange)="newNameChange.emit($event)"
          placeholder="{{ i18n.t('bookmark.name') }} ({{ i18n.t('app.optional') }})" />
        <input [ngModel]="newPath" (ngModelChange)="newPathChange.emit($event)"
          placeholder="{{ i18n.t('bookmark.path') }}" />
        <button class="btn-confirm" (click)="addBookmark.emit()" [disabled]="!newPath.trim()">
          {{ editingId ? (i18n.t('bookmark.save') || '保存书签') : i18n.t('bookmark.add') }}
        </button>
      </div>
      <div class="bookmark-list">
        <div class="bookmark-scope-label" *ngIf="connectionBookmarks.length">
          {{ i18n.t('bookmark.forConnection') }}
        </div>
        <div class="bookmark-item" *ngFor="let b of connectionBookmarks; let i = index"
          (click)="gotoBookmark.emit(b)"
          (contextmenu)="contextMenu.emit({ bookmark: b, event: $event })"
          draggable="true"
          (dragstart)="dragStart.emit({ event: $event, index: i, scope: 'connection' })"
          (dragover)="dragOver.emit({ event: $event, index: i, scope: 'connection' })"
          (dragend)="dragEnd.emit()"
          (drop)="drop.emit({ event: $event, index: i, scope: 'connection' })"
          [class.drag-over-top]="dragOverIdx === i && dragOverScope === 'connection' && !dragOverBottom"
          [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === 'connection' && dragOverBottom"
          [class.dragging]="dragSourceIdx === i && dragSourceScope === 'connection'"
          [title]="b.path">
          <span class="bm-drag-handle">⠿</span>
          <div class="bm-info">
            <span class="bm-name">{{ b.name }}</span>
            <span class="bm-path">{{ b.path }}</span>
          </div>
          <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark.emit(b.id)"
            title="{{ i18n.t('bookmark.remove') }}">✕</button>
        </div>
        <div class="bookmark-scope-label" *ngIf="globalBookmarks.length">
          {{ i18n.t('bookmark.global') }}
        </div>
        <div class="bookmark-item" *ngFor="let b of globalBookmarks; let i = index"
          (click)="gotoBookmark.emit(b)"
          (contextmenu)="contextMenu.emit({ bookmark: b, event: $event })"
          draggable="true"
          (dragstart)="dragStart.emit({ event: $event, index: i, scope: 'global' })"
          (dragover)="dragOver.emit({ event: $event, index: i, scope: 'global' })"
          (dragend)="dragEnd.emit()"
          (drop)="drop.emit({ event: $event, index: i, scope: 'global' })"
          [class.drag-over-top]="dragOverIdx === i && dragOverScope === 'global' && !dragOverBottom"
          [class.drag-over-bottom]="dragOverIdx === i && dragOverScope === 'global' && dragOverBottom"
          [class.dragging]="dragSourceIdx === i && dragSourceScope === 'global'"
          [title]="b.path">
          <span class="bm-drag-handle">⠿</span>
          <div class="bm-info">
            <span class="bm-name">{{ b.name }}</span>
            <span class="bm-path">{{ b.path }}</span>
          </div>
          <button class="bm-remove" (mousedown)="$event.stopPropagation()" (click)="removeBookmark.emit(b.id)"
            title="{{ i18n.t('bookmark.remove') }}">✕</button>
        </div>
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
    .popup-title {
      padding: 10px 14px 6px;
      font-weight: 700; color: var(--_primary); font-size: 13px;
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
    .bookmark-add-btns { display: flex; gap: 6px; padding: 0 14px 10px; }
    .add-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 6px; font-size: 12px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .add-btn:hover { background: var(--_hover); }
    .add-btn.active { border-color: var(--_primary); background: rgba(59,130,246,0.08); }
    .add-icon { font-weight: 700; font-size: 14px; color: var(--_primary); }
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
    .bookmark-add-form input:focus,
    .bookmark-add-form input:focus-visible {
      border-color: var(--_primary) !important;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35) !important;
      outline: none !important;
    }
    .bookmark-add-form .btn-confirm {
      align-self: flex-end;
      padding: 6px 16px; border-radius: 4px;
      border: 1px solid var(--_primary);
      background: var(--_primary);
      color: #fff; cursor: pointer; font-size: 12px; white-space: nowrap;
    }
    .bookmark-add-form .btn-confirm:disabled { opacity: 0.4; }
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
    .bm-name {
      font-size: 13px; font-weight: 500; color: var(--_text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
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
  @Input() dragSourceIdx = -1
  @Input() dragSourceScope: BookmarkScope | null = null
  @Input() dragOverIdx = -1
  @Input() dragOverScope: BookmarkScope | null = null
  @Input() dragOverBottom = false

  @Output() addScopeClick = new EventEmitter<'connection' | 'global'>()
  @Output() newNameChange = new EventEmitter<string>()
  @Output() newPathChange = new EventEmitter<string>()
  @Output() addBookmark = new EventEmitter<void>()
  @Output() gotoBookmark = new EventEmitter<Bookmark>()
  @Output() removeBookmark = new EventEmitter<string>()
  @Output() contextMenu = new EventEmitter<{ bookmark: Bookmark; event: MouseEvent }>()
  @Output() dragStart = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() dragOver = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() dragEnd = new EventEmitter<void>()
  @Output() drop = new EventEmitter<{ event: DragEvent; index: number; scope: BookmarkScope }>()
  @Output() close = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService
}

/**
 * SFTP+ 权限编辑对话框（从主面板抽离）
 */
import { Component, EventEmitter, Input, Output } from '@angular/core'

import { SftpI18nService } from '../sftp-i18n.service'

export type PermField =
  | 'ownerRead' | 'ownerWrite' | 'ownerExec'
  | 'groupRead' | 'groupWrite' | 'groupExec'
  | 'otherRead' | 'otherWrite' | 'otherExec'

@Component({
  selector: 'sftp-perm-dialog',
  template: `
    <div class="overlay" *ngIf="visible">
      <div class="dialog perm-dialog">
        <div class="dialog-title">{{ i18n.t('permission.title') }}</div>
        <div class="perm-target-name">{{ targetName }}</div>
        <div class="perm-grid">
          <div class="perm-header"></div>
          <div class="perm-header">{{ i18n.t('permission.read') }}</div>
          <div class="perm-header">{{ i18n.t('permission.write') }}</div>
          <div class="perm-header">{{ i18n.t('permission.execute') }}</div>
          <div class="perm-label">{{ i18n.t('permission.owner') }}</div>
          <input type="checkbox" [ngModel]="ownerRead" (ngModelChange)="onPermChange('ownerRead', $event)" />
          <input type="checkbox" [ngModel]="ownerWrite" (ngModelChange)="onPermChange('ownerWrite', $event)" />
          <input type="checkbox" [ngModel]="ownerExec" (ngModelChange)="onPermChange('ownerExec', $event)" />
          <div class="perm-label">{{ i18n.t('permission.group') }}</div>
          <input type="checkbox" [ngModel]="groupRead" (ngModelChange)="onPermChange('groupRead', $event)" />
          <input type="checkbox" [ngModel]="groupWrite" (ngModelChange)="onPermChange('groupWrite', $event)" />
          <input type="checkbox" [ngModel]="groupExec" (ngModelChange)="onPermChange('groupExec', $event)" />
          <div class="perm-label">{{ i18n.t('permission.others') }}</div>
          <input type="checkbox" [ngModel]="otherRead" (ngModelChange)="onPermChange('otherRead', $event)" />
          <input type="checkbox" [ngModel]="otherWrite" (ngModelChange)="onPermChange('otherWrite', $event)" />
          <input type="checkbox" [ngModel]="otherExec" (ngModelChange)="onPermChange('otherExec', $event)" />
        </div>
        <div class="perm-preview">{{ i18n.t('permission.mode') }}: {{ modePreview }}</div>
        <div class="dialog-buttons">
          <button (click)="confirm.emit()" [disabled]="!targetPath">{{ i18n.t('app.confirm') }}</button>
          <button (click)="cancel.emit()">{{ i18n.t('app.cancel') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center; z-index: 100;
      transition: none !important; animation: none !important;
    }
    .dialog {
      background: var(--_bg);
      border: 1px solid var(--_border);
      border-radius: 10px; padding: 16px; min-width: 280px; max-width: 92vw;
      box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    }
    .dialog-title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; margin-bottom: 12px; color: var(--_primary); }
    .perm-dialog { min-width: 360px; }
    .perm-target-name {
      font-size: 13px; font-weight: 600; margin-bottom: 8px;
      padding: 4px 8px; border-radius: 4px;
      background: var(--_input-bg); word-break: break-all;
    }
    .perm-grid {
      display: grid;
      grid-template-columns: 80px repeat(3, auto);
      gap: 8px; align-items: center; justify-items: center; margin: 12px 0;
    }
    .perm-header {
      text-align: center; font-size: 12px; font-weight: 600; color: var(--_primary);
    }
    .perm-label { font-size: 12px; font-weight: 600; justify-self: start; }
    .perm-grid input[type="checkbox"] {
      width: 18px; height: 18px; accent-color: var(--_primary); cursor: pointer;
    }
    .perm-preview {
      font-family: monospace; font-size: 13px; padding: 6px 8px; border-radius: 4px;
      background: var(--_input-bg); border: 1px solid var(--_border);
      color: var(--_text); margin-bottom: 12px;
    }
    .dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; padding-top: 10px; }
    .dialog-buttons button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
    }
    .dialog-buttons button:disabled { opacity: 0.4; cursor: default; }
  `],
})
export class SftpPermDialogComponent {
  @Input() visible = false
  @Input() targetName = ''
  @Input() targetPath = ''
  @Input() ownerRead = false
  @Input() ownerWrite = false
  @Input() ownerExec = false
  @Input() groupRead = false
  @Input() groupWrite = false
  @Input() groupExec = false
  @Input() otherRead = false
  @Input() otherWrite = false
  @Input() otherExec = false
  @Input() modePreview = ''

  @Output() permChange = new EventEmitter<{ field: PermField; value: boolean }>()
  @Output() confirm = new EventEmitter<void>()
  @Output() cancel = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  onPermChange(field: PermField, value: boolean): void {
    this.permChange.emit({ field, value })
  }
}

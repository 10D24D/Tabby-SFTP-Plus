/**
 * SFTP+ 远程文件查看对话框（文本 / 图片）
 */
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core'

import { SftpI18nService } from '../../services/sftp-i18n.service'
import { FILE_DIALOG_SHARED_STYLES } from './styles'
import { onFileDialogOverlayWheel, onFileDialogScrollableWheel } from './file-dialog-wheel'

import { log } from '../../services/sftp-logger'
export type ViewerMode = 'text' | 'image'

@Component({
  selector: 'sftp-viewer-dialog',
  template: `
    <div class="overlay" *ngIf="visible" (wheel)="onOverlayWheel($event)">
      <div class="dialog file-dialog-shell" [class.is-maximized]="maximized">
        <div class="dialog-title">
          <span class="file-dialog-title">{{ i18n.t('file.view') }} — {{ fileName }}</span>
          <div class="file-dialog-window-btns">
            <button type="button" class="file-dialog-win-btn"
              (click)="toggleMaximize()"
              [title]="maximized ? i18n.t('app.restore') : i18n.t('app.maximize')">
              <svg *ngIf="!maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="1.5" y="1.5" width="9" height="9" rx="0.5"/>
              </svg>
              <svg *ngIf="maximized" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="3.5" y="1.5" width="7" height="7" rx="0.5"/>
                <path d="M1.5 3.5h6.5v6.5H1.5z"/>
              </svg>
            </button>
            <button type="button" class="file-dialog-win-btn"
              (click)="close.emit()" [title]="i18n.t('app.close')">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="file-dialog-path" *ngIf="displayPath">{{ displayPath }}</div>
        <div class="file-dialog-body" [class.editor-body]="!loading && !error && mode === 'text'" (wheel)="onScrollableWheel($event)">
          <div class="file-dialog-status" *ngIf="loading">{{ i18n.t('viewer.loading') }}</div>
          <div class="file-dialog-status file-dialog-error" *ngIf="!loading && error">{{ error }}</div>
          <textarea #viewerTextarea class="file-dialog-textarea"
            *ngIf="!loading && !error && mode === 'text'"
            (wheel)="onScrollableWheel($event)"
            [ngModel]="textContent"
            readonly
            spellcheck="false"></textarea>
          <div class="file-dialog-image-wrap" *ngIf="!loading && !error && mode === 'image'">
            <img class="file-dialog-image" [src]="imageUrl" [alt]="fileName" />
          </div>
        </div>
        <div class="dialog-buttons">
          <button type="button" class="file-dialog-system-btn" *ngIf="showSystemAction"
            (click)="systemAction.emit()" [disabled]="loading || !!error"
            [title]="i18n.t('file.openInSystem')">
            {{ i18n.t('file.openInSystem') }}
          </button>
          <button type="button" (click)="close.emit()">{{ i18n.t('app.close') }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [FILE_DIALOG_SHARED_STYLES],
})
export class SftpViewerDialogComponent implements OnChanges {
  private static readonly MAXIMIZED_KEY = 'sftp-plus-viewer-maximized'

  @ViewChild('viewerTextarea') private viewerTextarea?: ElementRef<HTMLTextAreaElement>

  @Input() visible = false
  @Input() loading = false
  @Input() mode: ViewerMode = 'text'
  @Input() fileName = ''
  @Input() displayPath = ''
  @Input() textContent = ''
  @Input() imageUrl = ''
  @Input() error = ''
  @Input() showSystemAction = false

  @Output() close = new EventEmitter<void>()
  @Output() systemAction = new EventEmitter<void>()

  @Input() i18n!: SftpI18nService

  maximized = SftpViewerDialogComponent.loadMaximized()

  onOverlayWheel = onFileDialogOverlayWheel
  onScrollableWheel = onFileDialogScrollableWheel

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.maximized = SftpViewerDialogComponent.loadMaximized()
    }
    if (this.visible && !this.loading && !this.error && this.mode === 'text'
      && (changes['visible'] || changes['loading'] || changes['textContent'])) {
      setTimeout(() => this.viewerTextarea?.nativeElement.focus(), 0)
    }
  }

  toggleMaximize(): void {
    this.maximized = !this.maximized
    SftpViewerDialogComponent.saveMaximized(this.maximized)
  }

  private static loadMaximized(): boolean {
    try {
      return localStorage.getItem(SftpViewerDialogComponent.MAXIMIZED_KEY) === 'true'
    } catch (e) {
      log.warn('loadMaximized failed', e)
      return false
    }
  }

  private static saveMaximized(value: boolean): void {
    try {
      localStorage.setItem(SftpViewerDialogComponent.MAXIMIZED_KEY, value ? 'true' : 'false')
    } catch (e) { log.warn('saveMaximized failed', e) }
  }
}

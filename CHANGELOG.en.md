# Changelog

All notable changes to **tabby-sftp-plus** will be documented in this file.

| [中文](https://github.com/10D24D/Tabby-SFTP-Plus/blob/main/CHANGELOG.md) | [English](https://github.com/10D24D/Tabby-SFTP-Plus/blob/main/CHANGELOG.en.md) |

### [2.0.2] — 2026-08-22

#### 🐛 Fixed

- **Batch overwrite/skip/rename only processed the first item (re-entrancy lock regression)** — The `_processing` re-entrancy lock introduced on 2026-08-15 caused `resolve('overwrite-all'/'skip-all'/'rename-all')` to call `processNext()` while holding the lock, which was then blocked by the guard. As a result, in batch mode **only the first item was processed and the rest of the queue silently stalled** (conflict dialog hidden, transfer progress frozen). Fix: extracted a lock-free `_drainQueue()` that recursively drains the entire queue; `resolve` / `processNext` only call it after acquiring the lock.
- **Per-file `stat` for upload conflict detection (performance)** — Uploading multiple files in the same directory previously performed an independent `stat` + `readdir` per file, so N files = N network round-trips. Fix: cache a single `readdir` result per `parentDir` (with concurrency single-flight); all files in the directory reuse the same listing, falling back to a single-file `stat` only when the listing lacks `size`/`mtime`.
- **Backspace hijacked by the panel for path navigation in the terminal (issue #13 P4)** — The global `document:keydown` "history back" listener hardcoded a plain `Backspace` and bypassed the `panelHotkeys` config, so when focus was in the terminal xterm it still triggered `localBack()/remoteBack()` and `preventDefault()` swallowed character deletion. Fix: history back now respects the `panelHotkeys.back` config (default `Backspace`, can be remapped or cleared to disable) and **only takes effect when the panel itself has focus**; when focus is in the terminal, `Backspace` deletes characters normally.

#### ✨ Added

- **Panel hotkey `back` (history back)** — The settings page "Panel Operation Hotkeys" now includes a `back` item alongside `delete`/`rename`/`refresh`/`up`, all recordable/clearable/remappable in settings; 24 languages fall back to the English baseline automatically.
- **File/folder open mode** — New `openOnClick` setting: `double` (default, open on double-click) or `single` (open on single-click); double-click still works in single-click mode.
- **Open with system app when the viewer can't preview** — New `openUnsupportedInSystem` toggle (default on): files the viewer can't preview are opened with the OS default application instead of just showing "unsupported".
- **Panel operation hotkey remapping UI** — `delete`/`rename`/`refresh`/`up`/`back` are all recordable/clearable/remappable in settings (empty key = disabled); `back` defaults to `Backspace`, `up` defaults to `Shift+Backspace`.
- **Right-click menu order customization** — New `contextMenuOrder` config; the right-click file menu is now data-driven and renders visible items in the configured order; the settings page lets you reorder and reset.
- **Transfer settings subcategory** — The settings page adds a "Transfer Settings" subcategory grouping upload/download concurrency and fast-transfer mode; the `fastMode` Chinese label changed to "快速传输模式" (Fast Transfer Mode).
- **Current-path highlight for bookmarks** — In the bookmark hover menu, bookmark items whose path matches the current panel directory are highlighted (local paths matched case-insensitively on Windows).

### [2.0.1] — 2026-08-15

#### ✨ Added

- **Intra-directory file-level concurrency** — New `ConcurrencyLimiter` (`src/sftp/core/concurrency.ts`) enables parallel transfers of multiple files within a directory, with a configurable concurrency of 1–10 (default 3), reusing the existing `transferUploadConcurrency` / `transferDownloadConcurrency` settings. ssh2 SFTP multiplexes by request ID, so no extra connections are needed.
- **tar packaging transfer channel** — Massive small-file directories are transferred via "local `tar czf` → single-file SFTP transfer → remote `tar xzf`", greatly reducing network round-trips. A tri-state return value (`success`/`fallback`/`failed`) guarantees safe fallback. Enabled only when the target does not exist (brand-new transfer); merge/overwrite scenarios keep the per-file channel.
- **Batch delete speedup** — Remote directories prefer SSH exec `rm -rf` (single-quote escaping + OK marker validation, 60s timeout), falling back to concurrent SFTP recursive delete on failure; local directories prefer `fs.rm(recursive)`. Sibling items run concurrently, leaf IO throttled to 8.
- **Transfer concurrency settings** — The settings page adds "Upload concurrency" / "Download concurrency" sliders (1–10) that apply immediately without restart.
- **Fast mode** — `transferFastMode` setting (default off). When on, directory transfer skips the pre-scan and starts immediately, showing transferred bytes + file count (no percentage), suited for directories of known size.
- **Default path mode** — `defaultPathMode` setting (`off` / `remember` / `sync`), applied automatically when a panel is first opened for a new connection.
- **Default show hidden files** — `defaultShowHidden` setting, applied automatically when a panel is first opened for a new connection.
- **Toolbar customization** — `paneCustomOrder` supports drag-reordering toolbar items; `paneHiddenItems` supports hiding seldom-used toolbar buttons.
- **Hide author info** — `hideAuthorInfo` setting; enabling it shows a Star confirmation dialog first (opens the repo page in the browser automatically).
- **Panel shortcuts** — New panel shortcut settings with record/clear/conflict-prompt support.
- **Property dialog enhancements** — Folders get a "Calculate Size" button (recursively counts real size); the title dynamically shows "Local/Remote · Folder/File"; a "Location" row is added (local/remote marker, theme-colored bold).
- **Conflict direction badge** — A direction badge appears beside the conflict dialog title: ⬆ upload (local→remote, green) / ⬇ download (remote→local, blue), assembled from existing i18n keys, auto-enabled across 24 languages.
- **Merge/overwrite progress panel** — A "Transferring" progress entry is created during conflict-merge overwrite (non-fast-mode pre-scan yields the real total + percentage), reusing the source transfer-log entry to avoid duplicate records.
- **Image preview navigation** — Opening an image in the viewer auto-loads the same-directory image list, with previous/next buttons + left/right arrow keys, showing current position (N / total).
- **Copy / Copy Selection** — Both viewer and editor get a "Copy" button (copy full text in text mode, copy image to clipboard in image mode); when text is selected, a "Copy Selection" button appears additionally, briefly showing "Copied" feedback.
- **View as text** — The right-click menu adds "View as text", skipping file-type pre-checks to force text decoding, for unknown extensions or viewing raw content.

#### 🐛 Fixed

- **Resume-upload failure UI zombie state** — `LocalPathFileUpload` gains a `failed` state + `_markFailed()` method (symmetric with `LocalPathFileDownload`); on resume stream error it marks failure, avoiding UI freeze up to the 15-minute stall timeout.
- **Paused transfers permanently zombie after disconnect** — The `_tickAllTransfers` disconnect branch no longer skips paused entries; it cancels + records failure for them too.
- **Conflict queue re-entrancy guard** — `resolve()` / `processNext()` gain a `_processing` lock to prevent concurrent consumption of the same entry.
- **Overwrite upload/download mislabeled as failed in transfer log** — Conflict items carry `transferCtx`; on overwrite/rename success the transfer log is idempotently flipped to success; skip/cancel preserves failure semantics.
- **tar channel occasional false failure** — `execSshCommand` on empty output waits 300ms and re-opens the channel to retry once; only if both are empty is a warn logged (with the first 80 chars of the command for tracing).
- **Merge overwrite had no progress panel / ignored fast mode** — `MergeLocalDirUseCase` creates a progress entry + respects `fastMode` + passes `topCtx` to aggregate sub-directory progress.
- **Panel leak after terminal close** — `terminal-decorator.ts` rewrites `detach()` to clean up the floating panel overlay/rAF loop/resize listener.
- **Multi-panel bookmark concurrent write loss** — `save()` merges by id before writing, preserving entries added by other instances/windows.
- **Layout mode setting not taking effect** — Switched to reading via `sftpConfig.get('paneState/layout/mode')` (with fallback chain) instead of directly accessing the top-level `store` property.
- **Migration guard OR skipped some migrations** — Changed `typeof layout === 'object' || typeof perHost === 'object'` to `&&` to ensure migration is skipped only when both sub-objects exist.
- **Duplicate `[i18n]` bindings in HTML templates** — Removed one duplicate binding each from local panel, remote panel, transfer log, and right-click menu.
- **"Copy Selection" button click ineffective** — The viewer/editor "Copy Selection" button is governed by `*ngIf="hasSelectionText"`; on click, `mousedown` caused the textarea to blur → `onTextareaBlur()` set `hasSelectionText=false` → the button was removed from the DOM → `click` never fired. Fix: added `(mousedown)="$event.preventDefault()"` to the button to prevent blur.

#### 🎨 Improved

- **Pre-scan speedup** — 4 serial recursive functions (`calcDirSize` + `countDirItems` × 2) merged into 2 single-pass traversals (`scanLocalDir` / `scanRemoteDir`); `readdir` now uses `ConcurrencyLimiter(8)`, with only IO calls occupying slots and directory recursion not holding slots.
- **Transfer log tombstone mechanism** — Deletions are recorded in a `tombstones` set, skipped during `save()` merge to prevent resurrection. Zombie log cleanup threshold lowered from 24h to 10min, executed once at first construction on app start.
- **SSH exec empty-output retry** — Applies to all SSH exec calls (tar xzf/rm -rf/wc -c/command -v tar/id mapping), all idempotent operations.
- **Settings panel layout optimization** — The hide-author toggle moved to the first position of the functional group; the fast-mode description line removed (title hover retained); panel shortcuts moved below the custom time-format.
- **Star confirmation dialog copy** — Appended "您的点赞支持是我开发的动力，感谢支持！" (Your star support is my motivation to keep developing — thank you!) with 24-language localized thanks.

#### 🔧 Technical / Build

- **`tabby-plugin-common` shared module** — Extracted `theme.ts` / `utils.ts` into an independent package, buildable independently in CI; build-script paths consolidated in-repo (`scripts/check-common-sync.mjs` + `scripts/copy-sftp-manifest.mjs`).
- **GitHub Actions release** — `publish.yml` adds `push:tags` trigger; tagging auto-publishes to npm.
- **i18n helper scripts** — Added 12 scripts (`add-*-i18n.mjs` / `update-*-i18n.mjs`) supporting idempotent append/replace across 24-language .po files.
- Version bumped to **2.0.1**.

#### ⚠️ Known Limitations

- The tar channel is used only for brand-new transfers where the target does not exist; merge/overwrite scenarios must keep the per-file channel (conflict detection depends on it).
- In fast mode, directory transfer has no percentage progress (total unknown), showing only transferred bytes + file count.

---

### [2.0.0] — 2026-07-25

#### ✨ Added

- **Path mode three-way choice** — `off` / `remember` (path memory) / `sync` (sync with terminal). `sync` mode opens the panel at the terminal's current directory and follows the terminal's `cd` in real time (depends on Tabby's built-in OSC 1337 `CurrentDir` report + `session.getWorkingDirectory`); defaults to **off**, switchable within the panel. When cwd can't be obtained, a report-settings guide pops up.

#### 🐛 Fixed

- **Cancel no longer leaves half-files** — On upload/download cancel, the `.tabby-upload` temp file and underlying stream are cleaned up correctly; the incomplete file after cancel is deleted rather than left behind.
- **Upload pause no longer deletes files by mistake** — Pause now keeps the temp file; only cancel deletes it; resume is based on the temp file's actual size.
- **Upload pause concurrency fix** — Pause no longer closes the file handle, avoiding race with in-progress reads that caused temp-file deletion / `EBADF`; unified safe fd closure across `read`/`finish`/`error` branches, plus an `isPaused()` safe branch.
- **Input focus** — New/rename focuses the input itself; rename only focuses, no full-select highlight.
- **Window resize follows instantly** — During resize, the `sftp-plus-suppress-transition` class disables site-wide transitions, eliminating slow panel drift/shrink.
- **Split-terminal multi-panel no mutual occlusion** — Panels mount to `document.body` and strictly align to each pane rectangle via `position: fixed`, supporting multiple split terminals opening their own panels in parallel; z-index dependency removed.
- **Split divider shows only on hover** — Blue bar default `opacity:0`, shown only on `:hover`/`.active`.

#### 🔧 Technical / Build

- **`dist/package.json` auto-generation** — New `scripts/copy-sftp-manifest.mjs` derives from root `package.json` after `npm run build` (rewrites `main` to `index.js`, strips dev scripts and `devDependencies`, UTF-8 no BOM), eliminating manual maintenance drift and Chinese mojibake.
- Version bumped to **2.0.0**.

#### ⚠️ Known Limitations

- Default path mode is `off`; users who want the panel to open at the terminal's current directory must switch the path mode to "Sync with terminal" in the panel. Old mode records written to `localStorage` won't be overridden by the new default (clear `sftp-plus-path-mode.*` to restore default behavior).
- Sub-file conflicts in recursive folder transfers, large-directory virtual scrolling, and other architectural items remain for later versions (see historical architecture docs).

---

### [1.1.0] — 2026-07-07

#### ✨ Added

- **Built-in view / edit** — Local and remote text, images support right-click "View" / "Edit"; remote files are downloaded to a temp dir first, then uploaded back after editing.
- **Open / edit in system** — Viewer and editor bottoms can invoke the OS default program; the editor watches the temp file for external saves to push back.
- **Right-click upload / download** — Local panel can upload selected items to the current remote directory; remote panel can download to the current local directory.
- **Workspace tab** — Supports pinning the SFTP+ panel as an independent Tab (`SftpWorkspaceTabComponent`), suited for long-running file management.
- **Transfer record categorization** — New "edit load" / "edit save" types (`edit-download` / `edit-upload`), distinguished from normal upload/download in display and filtering.
- **Panel divider hint** — Hover shows drag instructions; double-click restores the 50:50 default ratio (drag won't accidentally reset).

#### 🎨 Improved

- **Architecture split** — Main panel UI and sub-logic moved to `src/panel/` (file-list panel, right-click menu, conflict handling, transfer runtime, view/edit dialogs, etc.), making the main component easier to maintain.
- **Right-click menu** — Upload/download moved to top; view/edit, clipboard, rename grouping and order optimized; new file/folder also available in blank areas.
- **Conflict detection strategy** — Upload/download/drag use detect-while-transferring (like Windows Explorer); paste still scans fully before executing.
- **Oversized file hint** — Menu remains available when exceeding view/edit limits; clicking shows a dialog and Toast clearly explaining the limit.
- **Scroll isolation** — Scrolling inside transfer log, viewer, editor no longer passes through to the underlying file list.
- **Toolbar** — Tightened SFTP+ button spacing.

#### 🐛 Fixed

- **Editor external save** — Fixed "edit in system" where the save button stayed disabled after external save, or external modifications were overwritten on submit (`fs.watch` + sync disk before save).
- **Conflict key filtering** — Fixed key-matching logic for skipped items after batch conflict resolution (legacy issue from pending upload/download flow refactor removed).
- **Transfer log scroll** — Fixed list scrolling to top/bottom accidentally triggering the underlying panel scroll.

#### 📄 Documentation

- Updated `README.md` / `README.en.md` feature docs and project structure.
- Updated `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md` to reflect the `panel/` module and new components.

#### ⚠️ Known Limitations

- During recursive folder transfer, **sub-file** conflicts may still prompt item-by-item mid-transfer (top-level multi-select optimized to detect-while-transferring).
- Text view limit 2MB, image 15MB, text edit 5MB; binary files don't support built-in editing.
- When the built-in editor and an external program modify the same temp file simultaneously, the later save overwrites the earlier one.

---

### [1.0.5] — 2026-07-06

#### 🐛 Fixed

- **Rubber Band selection** — Fixed the issue where the selection rectangle failed to display/shrink correctly when the panel narrowed or column widths changed; switched to JS-dynamically-created selection box, optimized list-area `min-width` and scrollbar layout, so selection and drag no longer interfere.
- **Column width adjustment** — Fixed the issue where dragging the column separator couldn't shrink width correctly (writes directly to the panel column-width property, avoiding modifying a temp object).
- **Bookmark popup** — Fixed arrow clipping and position offset; the corresponding star button shows selected state when bookmarks open.
- **Resume write position** — Fixed the issue where local download resume might write from a wrong offset, ensuring `writeSync` continues writing from completed bytes.
- **Connection release** — Correctly calls the sub-channel `end()` when closing the SFTP for an SSH session, avoiding session leaks.
- **Connection lifecycle** — Releases SFTP cache and clears remote list on reconnect/disconnect; auto-cleanup on SSH disconnect; `connect()` failure shows a notification.
- **Remote metadata** — Skips unnecessary `readDirectory`/`stat`/`getent` by visible columns; owner resolution moved to non-blocking background to avoid refresh stutter.
- **Remote creation time** — SFTP has no birthtime; remote disables the "Creation Time" column and sorting.
- **Directory conflict** — Fixed uploading a directory conflict mistakenly executing download-overwrite of the local source.
- **Refresh race** — Remote list refresh adds sequence validation to avoid list corruption on rapid directory switching.
- **Conflict detection** — Files with identical size and mtime no longer pop a conflict dialog.
- **Transfer** — Cancels underlying stream on disconnect; 15-min timeout if no progress; 0-byte file log completed.

#### ✨ Added

- **Pin folders to top** — Table-header right-click menu adds "Pin folders to top" (default on); folders sort first in directory listing.
- **OS drag-and-drop** — Supports dragging files/folders from Explorer/Desktop into local or remote panels (upload/copy to current directory); compatible with Electron `File.path` and `webUtils.getPathForFile()`.
- **Settings page build info** — About section adds build-time display, to confirm the latest build is loaded.
- **Config sync capability** — Bookmark and transfer-log services add `reload()` / import-overwrite capability, supporting multi-panel and post-import state refresh.

#### 🎨 Improved

- **Remote refresh experience** — `refreshRemote()` uses a 150ms delayed loading display, avoiding spinner flicker on rapid refresh that feels "slower".
- **Drag-drop interaction feedback** — New panel-level drag-in highlight border (`pane-list-wrap`), fixed highlight misalignment on horizontal scroll.
- **Rubber Band performance** — Selection hit-testing changed to cache + `requestAnimationFrame` throttle + binary-range lookup, reducing large-directory stutter.
- **List render performance** — Selected state uses `Set` O(1) lookup, filter-result caching and `trackBy`, reducing template recomputation and repaint.
- **Transfer progress performance** — Changed from per-task timer to shared polling timer, uniformly updating speed/progress, reducing concurrent-transfer overhead.
- **Conflict detection efficiency** — Prefers remote `stat` for single-file existence and metadata, reducing full `readdir` scans.
- **Settings page lifecycle** — Cleans up event listeners (`ngOnDestroy`), avoiding memory/behavior issues from duplicate mounting.

---

### [1.0.4] — 2026-07-05

#### 📄 Documentation

- **README full rewrite** — Restructured to user-guidance-first (features → UI tour → quick start → settings), added a badge row (with GitHub links), UI-screenshot two-column table layout, simplified copyright notice.
- **English docs** — Added `README.en.md` with bidirectional jump links to/from the Chinese version.
- **CHANGELOG** — Added version release-history document.
- **Dev docs update** — `DEVELOPMENT.md` removed references to the deprecated scripts/ directory.

---

### [1.0.1] — 2026-07-05

#### ✨ Added

- **Config persistence** — New `sftp-config-provider.ts`; bookmarks, settings, path memory, etc. uniformly persisted to Tabby config.yaml.
- **Bookmark system optimization** — Supports connection-level bookmark isolation, bookmark drag-reorder, global/connection grouped display.
- **Transfer log enhancement** — Operation-type coverage extended (upload/download/delete/rename/mkdir/chmod), filterable by profileName, cap raised to 1000 entries.
- **UI screenshots** — `assets/` adds main-panel and settings-page screenshots.
- **English docs** — Added `README.en.md` with bidirectional jump links to/from the Chinese version.

#### 🎨 Improved

- **README full rewrite** — Restructured to user-guidance-first (features → UI tour → quick start → settings), added badge row, UI-screenshot two-column table layout, simplified copyright notice.
- **New "About" section** — Settings page About section adds GitHub Star link and feedback entry.
- **English docs** — Added `README.en.md` with bidirectional jump links to/from the Chinese version.
- **CHANGELOG** — Added version release-history document.
- **Dev docs update** — `DEVELOPMENT.md` removed references to the deprecated scripts/ directory.
- **Settings page UI tweak** — Theme selection changed to card style, color editor optimized.

#### 🔧 Technical

- **Extract common module** — `tabby-plugin-common/` extracts shared utility functions (`theme.ts`, `utils.ts`).
- **Code cleanup** — Removed deprecated Python scripts (`restore_settings.py`, `update_decorator_minimize.py`, `update_settings_layout.py`).

#### 📦 Full File Changes

<details>
<summary>Expand to view (vs v1.0.0)</summary>

```
A  README.en.md
A  assets/SFTP-Plus_UI_Config.png
A  assets/SFTP-Plus_UI_Panel.png
A  tabby-plugin-common/src/index.ts
A  tabby-plugin-common/src/theme.ts
A  tabby-plugin-common/src/utils.ts
M  .gitignore
M  README.md
M  package.json
M  src/index.ts
M  src/sftp-bookmarks.service.ts
M  src/sftp-config-provider.ts
M  src/sftp-floating-panel.component.ts
M  src/sftp-i18n.service.ts
M  src/sftp-settings.component.ts
M  src/sftp-terminal-decorator.ts
M  src/sftp-transfer-log.service.ts
M  src/sftp.service.ts
M  src/tabby-shims.d.ts
M  tsconfig.json
M  webpack.config.js
D  restore_settings.py
D  update_decorator_minimize.py
D  update_settings_layout.py
```

</details>

---

### [1.0.0] — 2026-06-28

First usable release. A complete file-management implementation built on Tabby's SSH Session SFTP channel.

#### Core Features

| Category | Description |
|----------|-------------|
| **Dual-pane file management** | Left local + right remote, with horizontal/vertical/adaptive layouts |
| **Drag-transfer** | Drag across panes to upload/download, supports recursive folder transfer |
| **Bookmark system** | Global bookmarks (visible to all connections) + connection bookmarks (isolated per SSH), with drag-reorder |
| **Transfer log** | Records all file operations, supports type filtering, success/failure filter, JSON export (cap 500 entries) |
| **Transfer control** | Real-time progress bar, pause/resume, resume-from-breakpoint, transfer speed display |
| **File conflict handling** | Left-right comparison UI on conflict, supports overwrite/skip/rename, batch operations |
| **Permission editing** | Remote file chmod — 3×3 checkboxes + octal live preview |
| **Right-click menu** | File list: new file/folder/rename/delete/copy/cut/paste/refresh/select all/invert selection; header right-click: column show/hide/width adjust/panel border/zebra toggle |
| **Filter & sort** | Keyword filter, multi-column sort (click header), configurable column show/hide |
| **Path memory** | Toggle to restore last browsed location when reopening the panel |
| **Theme system** | 7 presets (Auto/Dark/Light/Blue/Green/Purple/Red) + custom colors, follows Tabby system theme |
| **Internationalization** | Chinese (Simplified) and English, five-level fallback (settings > localStorage > Tabby system language > browser language > default) |
| **Data backup** | One-click export/import of all data (bookmarks + logs + settings + path memory) |
| **Hide native SFTP** | Compatibility setting to optionally hide Tabby's built-in SFTP button to avoid conflicts |

---

## Release Process

```bash
# 1. Update the version in package.json
# 2. Commit the version change
git commit -m "chore: bump to v<version>"
git tag v<version>
# 3. Build
npm run build
# 4. Publish to npm (if applicable)
npm publish
```

---

This file follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) specification.

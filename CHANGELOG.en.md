# Changelog

All notable changes to **tabby-sftp-plus** will be documented in this file.

**[中文](https://github.com/10D24D/Tabby-SFTP-Plus/blob/main/CHANGELOG.md) | English**

## [2.4.0] — 2026-09-29

### ✨ Added

- **Grouped file list (Explorer-style "Group by")** — five modes, from the panel context menu or Settings: **None / Name / Date modified / Type / Size**. Dates bucket into **Today / Yesterday / Earlier this week / Earlier this month / Earlier this year / A long time ago**; sizes into six buckets from 0–16 KB up to >4 GB; types into folders, no-extension, `0-9`, pinyin initial ranges and so on. Group headers collapse individually, or all at once (**Expand all / Collapse all**). Grouping follows the current sort direction (groups reverse when sorting descending) while entries keep their existing order. Keyboard support came along: **↑/↓ now stops on group headers**, clicking a header (or pressing Enter) **selects/deselects the whole group**, and **Shift+↑/↓ range selection** works on the **display order** — collapsed groups are never picked up. Header highlighting follows the **selection ratio inside the group**, so a header lights up even when only part of its group is selected (it previously required two or more entries, which meant single-entry headers never lit up).
- **Five selectable transfer channel modes** — a new "Transfer settings → Transfer channel mode" in Settings: **Smart** (route automatically by file count and size — the previous behaviour) / **SFTP only** (always file by file, without even probing tar availability) / **TAR only** (always pack) / **Prefer SFTP** (pack only when clearly worthwhile) / **Prefer TAR** (pack unless clearly worse). Routing uses three different threshold sets, and the **upload direction gained the directory-size probe it was missing** (uploads previously always packed, even for tiny directories). Legacy settings migrate automatically: the old "tar acceleration" toggle set to off becomes **SFTP only**, anything else becomes **Smart**; the old "fast mode" toggle is folded into this option.
- **Batch packing for multi-selection** — selecting **two or more entries under the same parent directory** (folders and loose files mixed freely) now produces **one** archive, transferred once and then landed entry by entry on the remote side. Previously a multi-selection was split into N independent tasks (each selected folder got its own archive, loose files always went file by file), so "select a batch of small files" — the case that needs packing most — got no benefit at all. Deliberately conservative: as long as one target already exists the whole batch falls back to the per-entry flow (which still shows the conflict dialog and handles each entry); **a single file always goes file by file** (packing one file is a net loss — an intentional boundary, not a fallback).
- **Pre-flight check when the target directory does not exist** — uploading/downloading into a missing target directory no longer just fails; it offers three choices: **create and transfer / use the current directory / cancel**, and reports "creation failed" and "target path is not a directory" separately.
- **Estimated time remaining in the transfer queue** — shows e.g. "3m36s left" next to speed and percentage, estimated from the smoothed numeric rate. Shown only when meaningful (hidden while queued, paused or auto-skipped as duplicate); after **15 seconds without any byte progress the speed is reported honestly as `0 B/s` and the remaining time becomes `∞`** instead of reusing a stale rate.
- **Built-in viewer / editor improvements** — ① large text now uses **virtualized line rendering**, fixing the white screen caused by stuffing a big log into a textarea (issue #23); ② a new **"Viewer/editor line numbers" toggle** (on by default); ③ saving over a remote file that another program changed now asks for **confirmation** instead of overwriting silently; ④ a truncated preview now says "showing the first N lines — use Open in System for the full file".
- **Automatic layout degradation with a stated reason when the panel is too small** — when the panel cannot fit the chosen layout it temporarily degrades (side-by-side → top-bottom → single pane) and the title bar explains it as "preferred → actual (too narrow / too short / too small)" instead of silently changing shape.
- **"Locate current bookmark" in the bookmark panel** — jumps straight to the bookmark matching the current directory; when there is none the button says so.
- **Three new bindable panel hotkey actions** — "Open (local)", "View" and "Edit" can now be bound (empty by default so they do not steal keys); they are also reachable from the mouse middle button / wheel described under Improved.
- **Context-menu items can be disabled** — the context-menu customizer gained a "disable" dimension (previously only ordering), for both file actions and "Group by"; "Expand/collapse all groups" is now part of the "Group by" submenu rather than a separate item.
- **"Feedback" entries in Settings** — "Report a Bug" / "Feature Request" route to the matching issue template for the current UI language and pre-fill the Tabby version, OS, frontend type and installed plugin list (no private fields). A new **English issue template** was added alongside the Chinese one, with **identical field ids** so the pre-fill keeps working after switching language.
- **Clear notices for permission failures and duplicate requests** — unreadable permissions now say "cannot read permissions; cancelled" (previously a silent no-op that looked like nothing happened), a failed chmod reports the error, and a duplicate transfer says "{name} is already in the transfer queue — duplicate request ignored".

### 🎨 Improved

- **Panel hotkeys can be bound to the mouse middle button and wheel up / wheel down, and the wheel no longer scrolls the Settings page while recording** — previously only keyboard keys and the mouse **side** buttons (back / forward) could be recorded, so middle-button or wheel bindings appeared to do nothing. Recording now accepts three pointer inputs: **middle button (wheel click), wheel up, wheel down**, optionally combined with `Ctrl` / `Alt` / `Shift` / `Win` (e.g. `Alt+Wheel up`). Once bound, **any panel action** can be triggered (no longer only back / forward), shown as `Mouse1` / `Wheel↑` / `Wheel↓`. Three details worth stating: ① recording also **suppresses the Settings page's own scrolling** (otherwise the page scrolls away and the recorder leaves the viewport); ② one flick emits dozens of wheel events, so triggering is throttled to 150 ms (binding "delete" will not delete a run of entries); ③ **a bare wheel steals document-list scrolling** — triggering an action requires swallowing the default scroll, and the two cannot coexist, so a notice is shown after saving and the tooltip explains it; using a combination such as `Alt+wheel` avoids the trade-off. Pointer bindings have no Shift semantics: "delete" always goes to the recycle bin, permanent deletion remains keyboard-Shift only.
- **The "Layout" section's customization sub-sections were reordered** from font → toolbar → bookmark panel → context menu → table style to **toolbar → context menu → bookmark panel → table style → font**: the three "panel content" customizers (same drag-to-reorder + checkbox interaction) now sit together, the bookmark panel moved up before table style, and font moved to the end of the section. Only positions changed; items and behaviour are untouched.
- **"Viewer/editor caret width" became "caret shape", with three presets matching Tabby's terminal cursor exactly** — the old option chose a caret **width** of 1–4 px, but width only means something for the thin-line shape, while what terminal users actually want is a **shape**. It now offers the same three presets as Tabby's "Appearance → Cursor shape": **block** (`█`, inverting with difference blending), **beam** (`|`, 2 px — the previous look and the default) and **underline** (`▁`). The values `block` / `beam` / `underline` are **character-for-character** the host terminal's own, and the glyphs follow the host's three buttons. Block and underline derive their width from the **current character width**, so they stay aligned when the font or size changes. The old width value is no longer read and the default (`beam`) preserves the previous look.
- **The font-size slider and its value are right-aligned with other rows** — the slider and "13px" used to hug the label with a large gap to the right, looking out of place among right-aligned switches and dropdowns. The block now sits flush to the row end and the value's right edge lines up exactly with the other rows' controls (slider width, track and thumb are untouched — they already match Tabby's window settings). **Why two adjustments**: pushing the control to the row end alone leaves the value **4 px further right** than the switch controls (measured 594 vs 590), so the row also gets the same 10 px right padding as switch rows and the value is right-aligned inside a fixed 36 px slot, making the two edges coincide.
- **Toolbar customizer row height now matches the context-menu customizer** — both are the same drag-to-reorder + checkbox UI, but each toolbar item was **6 px taller** than a menu row (40 px vs 34 px), so the two blocks looked alternately loose and tight. Toolbar items now use the same vertical padding, making both blocks **exactly 34 px**. Only padding changed; radii, dashed borders and wrapping are untouched. The height is deliberately **not hard-coded**: both blocks already have identical content height (same font size, same 14 px checkbox), so equal padding guarantees equal rows — and they stay in sync if system scaling or fonts change.
- **Context-menu customizer rows use dashed borders, matching the toolbar customizer** — the toolbar used rounded **dashed** chips while each context-menu row had a light-grey **solid** border, reading like table rows and breaking the visual language. Context-menu rows are now dashed too, with border weight and colour **character-for-character identical** to the toolbar chips. Only the border changed; row height, padding, radius, background and drag handle are untouched.
- **Data export is now per-category** — "Export data" first opens a picker with nine categories: **Language / Theme / Layout / Object icons / Other / Transfer settings / Hotkeys / Bookmark data / Transfer logs** — names and order matching the Settings panel's own sections, except the eighth is more precisely called **"Bookmark data"** than the Settings section's "Data". All categories are selected by default; there are select-all/select-none shortcuts; the export button is disabled when nothing is selected; a long list scrolls inside the dialog with the same scrollbar spec as the SFTP+ file list (8 px, rounded, darker on hover, accent-coloured while dragging) and the buttons stay visible. Categories holding a single setting (Hotkeys / Bookmark data / Transfer logs) no longer show a redundant description. **"Transfer logs" was split out of the former "Bookmarks & logs"** (it is a history log and usually the largest item, with entirely different backup needs), and "Bookmark data" now covers only bookmarks, path memory and panel state. Unselected categories are **not written at all** — the import side treats a missing field as "do not overwrite", so an appearance-only backup will not wipe bookmarks, path memory or transfer logs on import.
- **The "Skip" button is highlighted in green when both sides are identical** — the conflict dialog already said "contents are actually identical, safe to skip", but the button looked like Cancel and it was easy to hit the solid-red Overwrite by mistake. The button now gets a green outline and a light green fill (same colour as the green notice bar, not solid so it does not compete with the destructive action) and matches Enter's default action (Skip). The class is not applied when the contents differ, so the appearance is unchanged there.
- **Transfer-queue and transfer-log tags now match character for character** — the "📦 tar" tag for the same transfer used two different palettes (green in the queue, cyan in the log, different borders too), only noticeable by comparing screenshots. Both now follow the log panel as the baseline for colour, border and weight, with green reserved for "success" to avoid misreading. At the same time the progress bar **spans the full row across both columns** (it used to live in the left column, so as soon as the right column grew a "3m36s left" it was squeezed and its right edge kept shrinking and growing); the remaining time no longer occupies a fixed slot width (short text pushed all the spare space to its left, creating ~42 px of dead space before the percentage); and the log dialog's "Clear" button is disabled when there is **nothing clearable** (no records at all, or only in-progress entries left).
- **Stutter while holding Shift+↑/↓ to extend a selection in grouped views** — measured with the real code from the built bundle and fixed item by item: ① the arrow-key branch both ran through `zone.run` (which fires a full-app change detection when the microtask queue drains) and called panel change detection explicitly → now uses `runOutsideAngular`, keeping a single panel change detection per step (other hotkeys keep the original path); ② each step performed two O(n) DOM sweeps over the whole list (measured ≈1.07 ms + 0.79 ms with 3000 rows) → selection visuals became **incremental** (only rows that were selected last round and are not now, ≈0.001 ms; newly selected rows are handled by template bindings) and scrolling now uses an attribute selector directly (≈0.024 ms, with a fallback to linear matching); ③ the navigation sequence is **cached** (it used to rebuild an object array and slice every group's entries each step, then locate focus/anchor with `findIndex` two or three times) and now uses O(1) lookups; Shift ranges take a fast path when no header row falls inside the range, avoiding set de-duplication. The finishing order also changed to "scroll first (visual classes are not written yet, so geometry is unaffected) → then patch visual differences → then run change detection", avoiding the old order's synchronous reflow from reading geometry after writing classes.

### 🐛 Fixed

- **"Clear data" left data behind: bookmarks, panel state and transfer logs survived** — clearing data used to iterate over the default keys and assign each one back. "Panel hotkeys" is a **structural member** in Tabby's config proxy (read-only, no write channel), so assigning the whole object threw and was swallowed by the outermost catch — the loop stopped there and the **28 keys after it** (transfer settings, conflict digest, default upload/download paths, icon settings, context-menu and toolbar customization, bookmarks, path memory, panel state, transfer logs, panel geometry) were never cleared. Worse, the same exception skipped the browser-cache cleanup, the UI refresh and the completion notice, so it looked like the button did nothing. Now: ① the browser cache is cleared first; ② each config key is **individually guarded** (one failure no longer drags down the rest) and structural members are written **leaf by leaf**; ③ the Tabby-level **"panel toggle hotkey"** is cleared too (it lives outside the plugin's own config section and the old code never touched it); ④ the UI refreshes and open floating panels are notified regardless of config-side errors. A read-side bias was fixed as well: clearing used to leave an empty shell on disk that was read back as "unbound", so the default `Delete` / `F2` / `F5` hotkeys showed as empty after clearing — the shell now reads back as the default (an explicit unbind is still "unbound").
- **The conflict digest for same-pane pastes always showed "—" on one side** — pasting a file back into its own directory (or a remote→remote copy inside the panel) left one side's digest empty, so there was no way to tell whether the contents had changed. Root cause: for same-pane conflicts the queue item's `localPath` / `remotePath` hold **two paths on the same side** (target and source), while digest computation picked the channel **by field name** — local→local ran a remote `sha1sum` against a local source path (guaranteed "no such file"), remote→remote tried to read a local disk path (ENOENT). The `samePaneSource` flag now travels with the queue item so both sides pick the channel by the **side they are actually on** (local→local reads locally on both ends, remote→remote uses the remote on both ends); cross-pane upload/download is unchanged. As a side effect, same-pane conflicts no longer fire a pointless SSH command and can now correctly report "contents are identical".
- **Heartbeat recovery and directory refresh failed repeatedly, flooding log.txt with retry noise** (issue #25) — on a flaky link a closed SFTP sub-channel caused cascading failures. Now: ① a directory refresh hitting a "channel is dead" error (`session closed` / `channel closed` / connection reset) **silently opens a new sub-channel and retries once**, instead of clearing the listing and writing a `Remote listing failed` error on every refresh click (129 log lines measured); it stays out of the way while a transfer is in flight (the heartbeat handles that), so a running transfer is never interrupted silently. ② After a heartbeat recovery, a notice is shown **only if an in-flight transfer was actually interrupted** — recovery of an idle channel is now transparent to the user (363 recoveries measured, 363 interruptions before). ③ Recovery logging is throttled (first 3 at info, then debug, one summary every 10) and probe failures drop from warn to debug (several necessarily precede every recovery and would flood the log on a bad link). ④ Repeated recoveries back off: each consecutive recovery doubles the streak needed to declare the channel dead (up to 4×, reset after 10 healthy minutes). **Timeout-class errors are not treated as a dead channel** — the semantics established in the 2026-09-25 / 09-26 P0 rounds (never kill a healthy but busy session) are unchanged.
- **Symlink badges hung below the row box, making the row look taller than it is** — for rows with a ↗ badge the circular badge protruded 1 px below the icon box: its bottom edge sat about 5 px below the sibling folder icon and only about 4 px from the row's bottom edge, so that row's icon looked like it stuck out. Measurement showed a 30 px row box and an 11 px folder icon ink box **perfectly centred in every row** (icon centre = row centre), so the offender was the badge, not the icon. The badge was moved **up 2 px** so its bottom edge aligns with the icon box; **only the badge moved, the icon stays centred** (moving the icon would break the icon column's alignment). A stale comment in the template was corrected too (the badge is at the icon's **bottom-left**, not bottom-right).
- **The residual claim in issue #17 that the panel steals Cmd/Ctrl+C/V from the terminal was disproved; behaviour is unchanged** — the panel only takes over clipboard shortcuts while **focus is inside the panel** (or right after a click inside the panel, before Electron has moved focus). Clicking the terminal area clears that flag immediately and the terminal's own copy/paste resumes. "Focus in the panel → Cmd/Ctrl+C/V belong to the panel" is **intentional**: Ctrl+C inside the panel must only copy in the panel and must never send `^C` to the terminal (which would kill the command running on the remote side). No time window was introduced; the original semantics stand.
- **"TAR only" silently fell back when packing was unavailable, contradicting the word "only"** — the mode used to fall back to the per-file channel whenever tar was missing locally or remotely, the folder contained symlinks, or packing/extracting failed, leaving the user to notice the tag quietly turning into ⇄SFTP (measured complaint: "why does an XX-only mode still fall back?"). All "unavailable" cases now **fail hard** in that mode: the reason is recorded, the committed entry is finished as failed, and the user is notified (reason + remedy). **Non**-TAR-only modes keep the original smooth fallback (fall back immediately if not yet committed, finish the entry first if committed, never leaving two log entries). At the same time the catch-all "packing or extracting failed" was split **by location** into **local pack failed / remote pack or extract failed / local extract failed**, with **file-name encoding failure** listed separately (it has a concrete remedy); "the destination already exists, so only the per-file incremental channel is possible" is no longer phrased as a transfer failure but as an explanatory notice with a remedy. The pre-check was also split from a combined "no tar locally or remotely" test so the two different remedies can be told apart.
- **"TAR only": picking Overwrite for an uploaded directory still used SFTP** — the same trap that had been fixed for downloads, but the upload side lacked the symmetric entry point: downloads had "Overwrite means packing is allowed", while uploads sent "directory conflict → Overwrite" into a **purely per-file** use case that never reached the packing channel — even though the UI told users to pick Overwrite to get packing. Uploads now have a merge entry point **fully symmetric** with downloads (the remote extract stage honours "merge overwrite": same names overwritten, remote-only entries kept — exactly the semantics of choosing Overwrite), so both conflict exits (Overwrite and Rename) now pack in that mode.
- **"TAR only" download of a directory: progress finished, then "packing or extracting failed"** — the user asked whether packing had failed remotely or extraction had failed locally. Three root causes were fixed: ① **cross-system file-name encoding (the real culprit)** — the remote GNU tar defaults to the `gnu` format, which writes non-ASCII names as raw UTF-8 bytes with no charset declaration; Windows' bundled bsdtar decodes them using the local ANSI code page (GBK), turning Chinese names into mojibake and producing `Invalid empty pathname` with exit code 1, so an entire download **failed after transferring everything**. Reproduced locally, then the remote pack was switched to **`--format=pax`** (probed first, falling back to the original command if unsupported) with `--options hdrcharset=UTF-8` added on the local extract side. ② **local tar selection** — `spawn('tar')` depends on PATH; if it hits Git/PortableGit's MSYS GNU tar, drive-letter absolute paths are parsed as tar's remote-archive syntax (`host:path`) → `Cannot connect to D: resolve failed`, so packing and extracting **both always failed**; on Windows the code now pins `%SystemRoot%\System32\tar.exe`. ③ **zero observability** — local tar ignored all three stdio streams and reported only `false` on failure, which is exactly why the failing end could not be identified; stderr is now captured (and consumed continuously so the child never blocks, length-capped) and reported with the failure.
- **Transfers that really used the packing channel showed ⇄SFTP in the log and progress bar** — channel attribution used to ride on the side effect of "backfill the real directory size", and that callback only fires when a size backfill or a post-extract scan is needed, so "real size 0 with a merge overwrite" mislabelled it as SFTP. The packing channel now **declares** its channel explicitly when it takes over.
- **Changing "Transfer channel mode" in Settings had no effect** — the object is built once at construction and **reused for a long time**, but the channel mode was captured as a **value snapshot** at that moment. After changing the mode in Settings the panel field did update while the port still held the old value: an old "Smart" failed the threshold for small directories and silently fell back to per-file (measured: a 4-file, 1.7 MB directory downloaded in "TAR only" was still logged as SFTP); an old "SFTP only" left the channel permanently unavailable, so switching to "TAR only" still went file by file. The mode is now read **live on every access** and the channel is **always mounted**, with the decision to actually pack made against the current mode at call time.
- **Heavy downloads made the heartbeat declare a healthy session dead → "every download fails"** — SFTP multiplexes one channel, so the heartbeat's probe shares the same channel as the data reads and writes; a heavy download saturates it, the probe request queues and necessarily times out, and the heartbeat at the time treated **a single timeout** as "channel dead" → it aborted in-flight transfers and ended the session (which reopened immediately afterwards, proving it was never dead) → repeating every 10 seconds. Users saw "downloads always fail, uploads are fine", and the failure was silent. Now: ① only **consecutive** failures count (roughly 30 s idle, roughly 120 s with transfers in flight — a genuinely dead channel makes the transfer itself error out, a far more reliable signal, and the cost of killing a live one is much higher than noticing late); ② a **byte-progress clock** was introduced: as long as bytes are moving the channel is provably alive, so the heartbeat skips the round entirely and resets the failure streak, neither misjudging nor adding load to an already saturated channel; ③ timeout-class errors do not count as a dead channel ("alive but busy" is not "dead"); ④ probes are single-flight so in-flight probes cannot pile up on a half-open or very slow channel.
- **Enabling packing acceleration starved the server and caused cascading SFTP timeouts** — the remote pack used `tar czf`, but jar/zip files are already compressed, so gzip saved about 8% while burning all cores for tens of seconds on a CPU-throttled machine, starving sshd → every SFTP read hit the 10 s per-request timeout (the packing channel and the per-file fallback **both died together**). It now uses `tar cf` (no compression), the pack command runs under `nice -n 19` (plus `ionice -c3` when available) to yield, and the "scan the real directory size" step moved from running in parallel with packing to running **serially after** it, so it no longer floods the same channel with 8 concurrent readdirs competing with data reads.
- **Slow merge-overwrite finish; a single ENOENT invalidated an entire archive** — ① the finish step became "read-only from the source, tolerate per-entry failures, account for everything": it used to move entries while traversing and **aborted the whole thing on a single failure**, so a live log showed one `ENOENT` invalidating a finished 1m31s packing result and re-downloading everything file by file (in the UI, the TAR entry suddenly turned into a new ⇄SFTP entry); `ENOENT` is now recorded as "skipped" rather than failed, real I/O failures still fall back to fill the gaps, and the target directory is **never deleted** (the old implementation could delete user data). ② the "delete each file then copy it" step was removed: `copyFile` already overwrites, so the delete was pure overhead — and on Windows (real-time protection, filter drivers, delete-interception layers) it is an expensive per-file metadata operation: for the same tree of 288 files / 119 directories the finish step took **31.4 s with the deletes and 0.33 s without (about 95×)**. ③ one statistics line is logged before and after the merge (dirs/files/links/skipped/failed) so the next incident can be diagnosed directly.
- **The same transfer submitted twice: two streams writing the same targets, both failing** — typical triggers: pasting and then clicking download again before the UI responds, or a dragged multi-selection colliding with per-entry downloads. An **in-flight slot table** keyed by "connection + direction + target" now intercepts duplicates and reports "{name} is already in the transfer queue — duplicate request ignored". The table lives in the transfer coordinator rather than the panel because context-menu, menu and drag downloads reach the coordinator directly without going through panel methods.
- **Picking Overwrite in the directory conflict dialog crashed the renderer (black screen, unrecoverable)** — a crash dump proved a V8 fatal error (`Isolate::PushStackTraceAndDie`, `null prototype chain root`, with zero OOM / RangeError counts in the dump), the stack being Overwrite click → merge upload → task scope `store()` → **process-level abort**, unrecoverable by `try/catch`. The related task-scope mechanism now deliberately takes its **degraded path**, prioritising "no more crashes" (see Known limitations below).
- **Concurrent directory tasks in one panel: cancelling an older task killed a newer one** — the panel used a single "last started task" reference as an implicit current-task context: later child streams of an earlier task were registered against a later task's reference (mis-attribution), and cancelling the earlier task broadcast through that reference, actually interrupting the later task's in-flight streams. All three directory-task entry points (upload directory / download directory / merge overwrite) now **create their own cancel reference** and restore the panel field on exit, with child streams registered against the explicitly passed reference.
- **Resume integrity check; "empty file succeeds instantly"** — ① on resume with an unknown total size, a remote `stat` now **verifies completeness** before committing (reading to EOF used to be treated as a complete file); ② the size read result is validated for finiteness so `undefined` / `NaN` is no longer folded to 0, which used to trigger a bogus instant success for empty files.
- **Speed display was off in extreme cases** — a speed window now has an upper bound (a window longer than 5 s can only come from suspend or a blocked main thread; the baseline advances without emitting a rate); pausing no longer zeroes the smoothed rate (so resuming does not flash `∞` first).
- **Space cannot be typed in the terminal after enabling the plugin** (issue #24) — once the SFTP+ floating panel was opened and focused, its type-ahead (file-name jump) swallowed the Space key and all printable characters, so the terminal never received them. Now: ① a new `_isTerminalFocusTarget` guard never hijacks any keystroke whose focus is on the terminal's xterm; ② type-ahead only consumes Space/letters when the panel's file list itself has focus, so keys are passed through to the terminal whenever the panel merely "owns" clipboard hotkeys without focus.

### 🌐 i18n

- Added **103 message keys × 24 locales**: grouped file list (Group by, bucket labels, expand/collapse all), the five transfer channel modes and their descriptions, missing-target-directory pre-flight, estimated time remaining, the split packing-failure reasons, too-small-panel degradation notices, feedback entries, wheel-hotkey hints, viewer caret shape and more. Chinese and English are complete; missing keys in other locales fall back to English.

### 🔧 Build

- **webpack build mode now defaults to `production`** — it previously defaulted to `development` while `npm run build` never set `NODE_ENV`, so **published bundles were unminified development builds** and larger than necessary; set `NODE_ENV=development` explicitly for development builds.
- `prebuild` now runs **`check-i18n`**: it statically verifies that every i18n key referenced in the source exists in the base locale. Background: a missing key makes `t()` return the key itself rather than an empty string, so the common `t('x.y') || 'fallback'` pattern **never reaches the fallback** and users see the raw key — invisible at compile time and only surfacing on specific branches.
- Four new leaf modules for reuse and verification: `core/session-errors.ts` (channel-level failure detection, where **timeouts do not count as a dead channel**), `core/transfer-progress.ts` (byte-progress clock), `core/task-scope.ts` (per-task cancel reference) and `core/grouping.ts` (bucket splitting and display-row generation).
- Local temporary files now live in `<parent>/.sftp-plus-tmp/`, **on the same volume as the target** (the system temp directory, usually C: on Windows, degraded the final move into a cross-volume full copy); remote tarballs and extract directories are named `<name>.sftp-plus-tar-<6 random chars>` instead of a bare UUID (self-describing prefix, random suffix so concurrent transfers cannot collide).
- Added i18n maintenance scripts (bulk key insertion / locale key-set comparison / source reference validation) and wired the validator into `prebuild`.
- Version bumped to **2.4.0**. The **2.3.2** section written earlier was never released (no npm version and no git tag), so it has been merged into this one rather than leaving behind a phantom release.

### ⚠️ Known limitations

- **With several concurrent directory tasks in one panel, cancel attribution can still go astray in extreme interleavings.** This release intended to bind the per-task cancel reference to the asynchronous call chain with `AsyncLocalStorage`, but reading its store inside Electron's renderer triggers a process-level V8 abort (proved by a crash dump: picking Overwrite in a directory conflict produced a black screen that could not be exited, unrecoverable by `try/catch`), so it deliberately degrades to "each task carries its own cancel reference + explicit propagation + panel field restored on exit". That covers the common concurrent-directory-task cases but cannot isolate as strictly as an async scope. Once the upstream crash is fixed, flipping the switch in `core/task-scope.ts` restores strict mode.

## [2.3.1] — 2026-09-18

### 🎨 Improved

- **Customizable bookmark panel** — Toggle grouping by current connection vs global; when on, group blocks can be reordered by drag; when off, bookmarks flatten and can be mixed across scopes.

### 🐛 Fixed

- **Conflict dialog did not show content digests** (issue #15) — Queue items now carry both digests so the dialog can display the full hash. Digests are also attempted when sizes differ (display only; auto-skip still requires matching size + digest). Differing hashes are marked ≠. Failures are logged.

### 🌐 i18n

- Added bookmark-panel grouping strings and “content actually differs” copy (24 locales; zh/en complete, others fall back to English).

### 🔧 Build

- Version bumped to **2.3.1**.

## [2.3.0] — 2026-09-17

### ✨ Added

- **Additional editable extensions / allow all types** ([PR #18](https://github.com/10D24D/Tabby-SFTP-Plus/pull/18) / issue #9, @Purgepyro) — “Allow editing all file types” is the master switch (off by default; binaries still blocked). Extra extensions only appear when it is off. Accepts `.conf` / `*.conf` / `conf`, separated by commas, spaces, or semicolons.
- **Content digest on conflict** (issue #15) — When size matches but mtime differs, compute digests on both sides to detect “mtime changed but content did not”; identical content can be skipped automatically.
- **Symlink / shortcut badge** (issue #16) — Local listing uses `lstat` to recognize symlinks, junctions, and `.lnk` files, and overlays a link badge on the icon.
- **Type-ahead file locate** — With focus on a file list, typing a name prefix jumps to and selects the match (Explorer-style). Repeating the same letter cycles same-prefix items; if appending finds nothing, search restarts from the last character. IME commits (e.g. Chinese) participate. The buffer clears after ~800ms idle; Backspace edits the buffer, Esc clears it before closing the panel.

### 🐛 Fixed

- **Blank built-in icons after a manual install** ([PR #18](https://github.com/10D24D/Tabby-SFTP-Plus/pull/18), @Purgepyro) — Built-in icon lookup now accepts `<plugin>/dist/assets/icons`, `<plugin>/assets/icons`, and `<plugin>/src/assets/icons`.
- **Copy/drop into self caused infinite recursion** (issue #17) — Refuse copying, pasting, or dragging a directory into itself or a subdirectory.
- **Pane state never persisted** — `paneState` is marked `__nonStructural` so path memory, column widths, and layout actually write through to config.yaml.
- **Remote `isDirectory` mis-detection** — Handle function-shaped `isDirectory` and russh numeric `type`, so conflict prompts no longer treat regular files as directories.
- **External-editor save storms** — Editor file watch actually syncs at most once every 800ms.
- **Editor paste leaked into the terminal** (issue #21 / [PR #22](https://github.com/10D24D/Tabby-SFTP-Plus/pull/22), @waylandun) — On macOS, editor `Cmd+V` also wrote into the SSH terminal. Keep the panel-root keydown/keyup isolation from the PR, plus the window-capture clipboard/paste shields.

### 🌐 i18n

- Added strings for editable extensions, allow-edit-all, conflict digest, symlink, and type-ahead locate (24 locales; zh/en complete, others fall back to English).

### 🔧 Build

- Shared `resolveSftpPlusBundledIconDir` for settings and the panel.
- Docs aligned with the current tree: `config.yaml` + `paneState.__nonStructural`, `locale/*.po`, and `src/sftp/{components,controllers,core}`.
- Version bumped to **2.3.0**.

## [2.2.0] — 2026-09-03

### ✨ Added

- **Multi-binding panel hotkeys** — One action can now be bound to several keys. Settings shows each binding as a chip: `+` to add, `×` to remove. Existing single-key configuration migrates automatically.
- **Configurable mouse side buttons** — The previously hardcoded mouse back (Mouse3) / forward (Mouse4) buttons are now part of the hotkey configuration: they can be remapped to any action or cleared. A new `forward` action mirrors `back`.
- **Hotkeys for context-menu actions** — Six common context-menu actions (upload / download / new folder / new file / properties / copy path) can now be bound to hotkeys. They are unbound by default and only fire when the corresponding pane has a selection, so they never steal keys from other features.
- **Occupied-hotkey reference** — A collapsible read-only section in settings lists the reserved key bindings grouped by panel / viewer / dialog, making conflicts easier to diagnose.
- **Tar packing acceleration toggle** — New `transferTarAcceleration` setting (on by default) to disable the tar packing channel for folder transfers.
- **Transfer-log mode tags** — The transfer log now shows how a folder was transferred: ⚡ fast mode, 📦 tar packing, or the file count for the standard mode.

### 🐛 Fixed

- **Duplicate log entries when overwriting a dragged folder** — Dropping a folder with a name conflict and choosing overwrite produced two entries for the same directory (one failed, one succeeded). The panel's merge-upload adapter dropped the reuse-log-entry id, so the entry already marked as failed when the conflict was queued could never be flipped back to success. Now only one successful entry remains.
- **Reversed direction for upload entries in the transfer log** — Upload entries were rendered with the "remote → local" direction icon. Downloads were correct, so only uploads were affected.

### 🎨 Improved

- **Graceful fallback for tar channel failures** — When packing, transferring, or extracting fails, the tar channel no longer aborts the whole transfer. It falls back to the regular file-by-file transfer and cleans up leftover remote temp extraction directories and partial targets.

### 🌐 Localization

- Added strings for the new settings, hotkeys, and transfer-log labels (24 languages).

### 🔧 Technical / Build

- Added idempotent i18n maintenance scripts `scripts/add-multi-hotkey-i18n.mjs` and `scripts/add-transfer-mode-i18n.mjs`.
- Version bumped to **2.2.0**.

### [2.1.0] — 2026-08-27

#### ✨ Added

- **File icon system** — Added built-in colored SVG file/folder icons with extension mapping, custom SVG resource directories, built-in icon disabling, and folder-icon replacement; the file list and details dialog now share the same icon mapping.
- **Default upload/download paths** — The settings page can configure separate upload and download target directories; when unset, the current pane directory is still used.
- **Text context menu** — The viewer and editor now provide copy, copy selection, cut, paste, and select-all actions; large selections use lightweight range checks to avoid unnecessary full-text work.

#### 🐛 Fixed

- **Remote symlink directories could not be opened** — Followed `stat` and, when necessary, resolved `readlink` targets to identify remote symlinks that point to directories.
- **Windows shortcut handling** — `.lnk` targets are recognized so opening, navigating, and dragging use the actual target path.
- **Path safety and normalization** — Local rename/create and remote create operations now reject paths that escape their target directory; bookmark paths are normalized and deleted bookmarks no longer reappear across windows.
- **Transfer cancellation and session recovery** — Cancelling concurrent directory transfers now aborts all in-flight child streams; old transfers are stopped before session replacement and users are prompted to retry.
- **Hotkeys and focus** — Modal dialogs, terminal focus, panel focus, and delete confirmation now handle events more explicitly, preventing accidental or duplicate actions.

#### 🎨 Improved

- **Floating-panel adaptation** — Panel geometry is persisted as percentages and adapts to window size; dragging has a movement threshold, and floating panels share a stacking order across plugins.
- **Configuration consistency** — Improved cache invalidation and persistence of cleared panel hotkeys to prevent stale settings after multi-window updates or restart.
- **Localization** — Added translations for the new settings, icon, and text-menu strings.

#### 🔧 Technical / Build

- Added `scripts/copy-icons.mjs`; production builds now copy bundled SVG icons to `dist/assets/icons/`.
- Version bumped to **2.1.0**.

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
# 2. Sync the hardcoded "Current development version" line in README.md / README.en.md (date + version)
# 3. Update CHANGELOG.md / CHANGELOG.en.md
# 4. Commit
git commit -m "chore: bump to v<version>"
git tag v<version>
# 5. Build
npm run build
# 6. Publish to npm (if applicable)
npm publish
```

---

This file follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) specification.

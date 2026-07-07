# SFTP+ — Dual-Pane SFTP File Manager for Tabby

| [中文](README.md) | [English](README.en.md) |

[![Version](https://img.shields.io/github/package-json/v/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=Version&color=7B68EE)](https://github.com/10D24D/Tabby-SFTP-Plus)
[![Stars](https://img.shields.io/github/stars/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=Stars&color=orange)](https://github.com/10D24D/Tabby-SFTP-Plus/stargazers)
[![License](https://img.shields.io/github/license/10D24D/Tabby-SFTP-Plus?style=for-the-badge&label=License&color=green)](https://github.com/10D24D/Tabby-SFTP-Plus)

SFTP+ is a plugin for [Tabby Terminal](https://tabby.sh/) that adds a **dual-pane SFTP file manager** right inside your SSH terminal tabs. Features include **drag-and-drop transfers**, **bookmark system**, **path memory**, transfer logs, file conflict handling, permission editing, and more — all without leaving the terminal.

---

## 📋 Features at a Glance

| Category | Description |
|----------|-------------|
| **📂 Dual-Pane Manager** | Local (left) + Remote (right); horizontal / vertical / adaptive / single-pane layouts; draggable splitter, double-click to reset |
| **👁️ View / Edit** | Built-in text/image viewer and text editor (local + remote); open or edit in system default app |
| **🔄 Drag & Drop** | Drag across panes to upload/download; recursive folder transfer; drag from OS Explorer/Desktop into either pane |
| **⬆️ Context Transfer** | Right-click upload on local pane, download on remote pane (multi-select batch) |
| **🔖 Bookmark System** | Global bookmarks (visible across all connections) + connection bookmarks (per SSH session); drag-to-reorder |
| **📋 Transfer Log** | Full operation history including **Edit Load** / **Edit Save** types; filtering, stats, JSON export |
| **⚡ Transfer Control** | Progress bars, pause/resume/cancel, resume support, real-time speed |
| **⚠️ File Conflict** | Visual diff on conflict, with overwrite/skip/rename options and batch processing |
| **🔐 Permission Editor** | Remote chmod via 3×3 checkbox matrix with octal preview |
| **📌 Context Menus** | Upload/download, view/edit, new/rename/delete, copy/cut/paste, refresh, select all/invert; <br />Header: column visibility, fit widths, borders & zebra stripes |
| **🔍 Filter & Sort** | Keyword filter, multi-column sorting (click headers), configurable visible columns |
| **🧭 Path Memory** | Toggle to restore last browsed paths when reopening the panel |
| **🎨 Theme System** | 7 presets + custom colors, supports following the Tabby system theme |
| **🌐 Internationalization** | Chinese (Simplified) and English, auto-detects Tabby/browser language |
| **📦 Data Backup** | One-click export/import of all data (bookmarks, logs, settings, path memory) |

---

## 🖥️ Interface Guide

| ![SFTP+ Panel](assets/SFTP-Plus_UI_Panel.png) | ![SFTP+ Settings](assets/SFTP-Plus_UI_Config.png) |
| :------------------------------------------: | :---------------------------------------------: |

### Interface Zones

| Zone | Description |
|------|-------------|
| **Title Bar** | Plugin name, current SSH connection info, layout toggle, transfer log entry, minimize/close |
| **Left / Right Panes** | Independent browsing with path input, navigation buttons, bookmarks, and filtering |
| **File List** | Displays files and directories; multi-column sort, draggable column widths, reorderable columns |
| **Bottom Action Bar** | Shows selection count & total size |
| **Transfer Queue** | Real-time upload/download progress, speed, ETA; supports pause/resume/cancel |
| **Bookmark Popup** | Grouped by "connection bookmarks" and "global bookmarks"; drag-to-reorder and quick jump |
| **Context Menu** | Right-click on files or table headers for full file operations and column configuration |
| **Transfer Log** | History popup with type filtering, success/failure filter, JSON export |

---

## ⚙️ Installation

1. Make sure [Tabby Terminal](https://tabby.sh/) is installed
2. Configure the plugin directory in Tabby settings
3. Place the built plugin (see "Development" section) into the plugin directory, then restart Tabby
4. Open any SSH terminal tab — the **SFTP+** button should appear in the toolbar

---

## 🚀 Quick Start

1. **Open** — Click the `SFTP+` button in the toolbar of an SSH terminal tab
2. **Browse** — Navigate local files on the left and remote SFTP directories on the right; double-click to enter a directory
3. **Transfer** — Drag across panes, or use right-click upload/download
4. **View/Edit** — Right-click text or image files to view in-app; edit text and save (remote files upload automatically)

---

## 📏 File Size Limits

| Operation | Limit |
|-----------|-------|
| Text view | 2 MB |
| Image view | 15 MB |
| Text edit | 5 MB |

Exceeding a limit shows a clear dialog and toast with the cap.

---

## ⚙️ Settings Panel

Navigate to Tabby Settings → "SFTP+" in the left sidebar:

| Setting | Description |
|---------|-------------|
| **Language** | Follow System / Chinese / English |
| **Theme** | Auto / Dark / Light / Blue / Green / Purple / Red / Custom |
| **Custom Colors** | Independently set primary, background, text, and border colors |
| **Layout** | Adaptive (auto-switches based on panel width) / Horizontal / Vertical |
| **Table Style** | Show borders, show zebra stripes |
| **Data Backup** | Export/import all data (JSON); clear all data (requires typing `DELETE` to confirm) |
| **Compatibility** | Hide the native Tabby SFTP button to avoid conflicts |

---

## 💾 Data Backup

All data (bookmarks, transfer logs, path memory, settings) can be exported to or imported from a single JSON file.

Path: Settings → Data Backup → Export / Import

---

## 📜 Changelog

Latest: **v1.1.0** (2026-07-07) — [Full changelog](CHANGELOG.md)

---

## 🛠️ Development

### Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Angular 9 |
| Language | TypeScript 5.8 |
| Build | Webpack 5 |
| Styling | Inline styles (CSS variables for adaptive theming) |
| Dependencies | `tabby-core` / `tabby-settings` / `tabby-terminal` |
| Protocol | SFTP (reuses Tabby SSH Session) |

### Build

```bash
# Install dependencies
npm install

# Development mode (watch mode)
npm run watch

# Production build
npm run build
```

The built plugin bundle is `dist/index.js`.

### Project Structure

```
tabby-FTPS+/
├── docs/
├── src/
│   ├── index.ts
│   ├── sftp-floating-panel.component.ts
│   ├── sftp-workspace-tab.component.ts
│   ├── sftp-terminal-decorator.ts
│   ├── panel/                    # Extracted UI & logic modules
│   │   ├── sftp-file-pane.component.ts
│   │   ├── sftp-viewer-dialog.component.ts
│   │   ├── sftp-editor-dialog.component.ts
│   │   ├── panel-conflict-resolver.ts
│   │   └── …
│   ├── sftp.service.ts
│   └── …
├── dist/index.js
└── package.json
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full tree.

---

## 🤝 How to Contribute

Contributions are always welcome! The plugin was conceived by the author (DD1024z), with the majority of implementation code generated using AI assistance.

- Report bugs or request features: [GitHub Issues](https://github.com/10D24D/Tabby-SFTP-Plus/issues) 📝
- Contribute code: Fork the project and submit a Pull Request 🚀
- Like SFTP+? Give it a [⭐ Star](https://github.com/10D24D/Tabby-SFTP-Plus) to show your support!

## 📝 License

SFTP+ is licensed under the [MIT](LICENSE) license. Feel free to use, modify, and share it — just comply with the terms.

## ⚠️ Disclaimer

SFTP+ is a free and open-source project. By using this plugin, you agree to assume all associated risks. The developer shall not be held liable for any problems or losses arising from its use.

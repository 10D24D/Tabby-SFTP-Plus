import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join(__dirname, '../src/index.ts')

const extraImports = `
import { SftpFilePaneComponent } from './panel/sftp-file-pane.component'
import { SftpContextMenuComponent } from './panel/sftp-context-menu.component'
import { SftpBookmarkPopupComponent } from './panel/sftp-bookmark-popup.component'
import { SftpDeleteDialogComponent } from './panel/sftp-delete-dialog.component'
import { SftpInputDialogComponent } from './panel/sftp-input-dialog.component'
import { SftpPermDialogComponent } from './panel/sftp-perm-dialog.component'
import { SftpDetailsDialogComponent } from './panel/sftp-details-dialog.component'
`

const extraDecls = `
    SftpFilePaneComponent,
    SftpContextMenuComponent,
    SftpBookmarkPopupComponent,
    SftpDeleteDialogComponent,
    SftpInputDialogComponent,
    SftpPermDialogComponent,
    SftpDetailsDialogComponent,
`

let s = fs.readFileSync(indexPath, 'utf8')
if (!s.includes('SftpFilePaneComponent')) {
  s = s.replace(
    "import { SftpTransferLogDialogComponent } from './panel/sftp-transfer-log-dialog.component'",
    "import { SftpTransferLogDialogComponent } from './panel/sftp-transfer-log-dialog.component'" + extraImports,
  )
  s = s.replace(
    '    SftpTransferLogDialogComponent,',
    '    SftpTransferLogDialogComponent,' + extraDecls,
  )
  fs.writeFileSync(indexPath, s)
  console.log('updated index.ts')
} else {
  console.log('index.ts already patched')
}

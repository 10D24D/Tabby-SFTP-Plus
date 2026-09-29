#!/usr/bin/env node
/**
 * 一次性补丁脚本：为全部 24 种语言的 .po 追加「传输通道模式」相关 key
 *   settings.channelMode               设置项标题
 *   settings.channelModeDesc           设置项说明
 *   settings.channelMode.smart         智能模式
 *   settings.channelMode.sftpOnly      仅 SFTP
 *   settings.channelMode.tarOnly       仅 TAR
 *   settings.channelMode.preferSftp    优先 SFTP
 *   settings.channelMode.preferTar     优先 TAR
 *   settings.channelMode.<mode>Desc    各模式说明文案
 * 用法：node scripts/add-channel-mode-i18n.mjs
 * 说明：已存在的 key 会被跳过，脚本可安全重复执行；条目追加到文件末尾。
 *   ⚠ 文案中禁止出现双引号，否则会破坏 po 的 msgstr "..." 语法。
 *   某语言若未显式给出翻译，则回退到 en-US（i18n.t 亦会回退 en-US）。
 */
import fs from 'fs'
import path from 'path'

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const localeDir = path.resolve(__dirname, '../locale')

const KEYS = [
  'settings.channelMode',
  'settings.channelModeDesc',
  'settings.channelMode.smart',
  'settings.channelMode.sftpOnly',
  'settings.channelMode.tarOnly',
  'settings.channelMode.preferSftp',
  'settings.channelMode.preferTar',
  'settings.channelMode.smartDesc',
  'settings.channelMode.sftpOnlyDesc',
  'settings.channelMode.tarOnlyDesc',
  'settings.channelMode.preferSftpDesc',
  'settings.channelMode.preferTarDesc',
]

// 仅给出重点语言，其余回退 en-US
const T = {
  'settings.channelMode': {
    'en-US': 'Transfer channel mode', 'zh-CN': '传输通道模式', 'zh-TW': '傳輸通道模式',
    'de-DE': 'Übertragungskanal-Modus', 'fr-FR': 'Mode du canal de transfert',
    'ja-JP': '転送チャネルモード', 'ko-KR': '전송 채널 모드', 'ru-RU': 'Режим канала передачи',
    'es-ES': 'Modo de canal de transferencia', 'pt-BR': 'Modo do canal de transferência',
  },
  'settings.channelModeDesc': {
    'en-US': 'Choose how folder transfers use tar packaging (TAR) vs file-by-file (SFTP)',
    'zh-CN': '选择文件夹传输时打包(TAR)与逐文件(SFTP)的使用策略',
    'zh-TW': '選擇資料夾傳輸時打包(TAR)與逐檔(SFTP)的使用策略',
  },
  'settings.channelMode.smart': {
    'en-US': 'Smart', 'zh-CN': '智能模式', 'zh-TW': '智慧模式',
    'de-DE': 'Intelligent', 'fr-FR': 'Intelligent', 'ja-JP': 'スマート', 'ko-KR': '스마트',
    'ru-RU': 'Интеллектуальный', 'es-ES': 'Inteligente', 'pt-BR': 'Inteligente',
  },
  'settings.channelMode.sftpOnly': {
    'en-US': 'SFTP only', 'zh-CN': '仅 SFTP', 'zh-TW': '僅 SFTP',
    'de-DE': 'Nur SFTP', 'fr-FR': 'SFTP uniquement', 'ja-JP': 'SFTP のみ', 'ko-KR': 'SFTP 전용',
    'ru-RU': 'Только SFTP', 'es-ES': 'Solo SFTP', 'pt-BR': 'Somente SFTP',
  },
  'settings.channelMode.tarOnly': {
    'en-US': 'TAR only', 'zh-CN': '仅 TAR', 'zh-TW': '僅 TAR',
    'de-DE': 'Nur TAR', 'fr-FR': 'TAR uniquement', 'ja-JP': 'TAR のみ', 'ko-KR': 'TAR 전용',
    'ru-RU': 'Только TAR', 'es-ES': 'Solo TAR', 'pt-BR': 'Somente TAR',
  },
  'settings.channelMode.preferSftp': {
    'en-US': 'Prefer SFTP', 'zh-CN': '优先 SFTP', 'zh-TW': '優先 SFTP',
    'de-DE': 'Bevorzuge SFTP', 'fr-FR': 'Préférer SFTP', 'ja-JP': 'SFTP 優先', 'ko-KR': 'SFTP 우선',
    'ru-RU': 'Предпочитать SFTP', 'es-ES': 'Preferir SFTP', 'pt-BR': 'Preferir SFTP',
  },
  'settings.channelMode.preferTar': {
    'en-US': 'Prefer TAR', 'zh-CN': '优先 TAR', 'zh-TW': '優先 TAR',
    'de-DE': 'Bevorzuge TAR', 'fr-FR': 'Préférer TAR', 'ja-JP': 'TAR 優先', 'ko-KR': 'TAR 우선',
    'ru-RU': 'Предпочитать TAR', 'es-ES': 'Preferir TAR', 'pt-BR': 'Preferir TAR',
  },
  'settings.channelMode.smartDesc': {
    'en-US': 'Auto-pick best channel by folder size and file count',
    'zh-CN': '按文件夹大小与文件数自动选择最优通道',
    'zh-TW': '按資料夾大小與檔案數自動選擇最優通道',
  },
  'settings.channelMode.sftpOnlyDesc': {
    'en-US': 'Always transfer file by file; never use tar packing',
    'zh-CN': '始终逐文件传输，不使用打包',
    'zh-TW': '始終逐檔傳輸，不使用打包',
  },
  'settings.channelMode.tarOnlyDesc': {
    'en-US': 'Always try tar packing; falls back to SFTP only if remote packing fails',
    'zh-CN': '始终尝试打包；仅当远端打包失败才回退 SFTP',
    'zh-TW': '始終嘗試打包；僅當遠端打包失敗才回退 SFTP',
  },
  'settings.channelMode.preferSftpDesc': {
    'en-US': 'Use tar only when clearly beneficial (requires many more files)',
    'zh-CN': '仅当明显划算时才打包（需要更多文件）',
    'zh-TW': '僅當明顯划算時才打包（需要更多檔案）',
  },
  'settings.channelMode.preferTarDesc': {
    'en-US': 'Pack unless clearly worse (huge files); loose threshold',
    'zh-CN': '除非明显吃亏（巨型文件）才回退，门槛宽松',
    'zh-TW': '除非明顯吃虧（巨型檔案）才回退，門檻寬鬆',
  },
}

let totalAdded = 0
for (const file of fs.readdirSync(localeDir)) {
  if (!file.endsWith('.po')) continue
  const locale = file.replace('.po', '')
  const fp = path.join(localeDir, file)
  let raw = fs.readFileSync(fp, 'utf8')
  let added = 0
  for (const key of KEYS) {
    const text = (T[key] && (T[key][locale] ?? T[key]['en-US'])) || T[key]?.['en-US']
    if (!text) { console.warn('skip unknown locale:', file, key); continue }
    if (text.includes('"')) { console.error('FATAL: translation contains a double quote:', locale, key); process.exit(1) }
    if (raw.includes(`msgid "${key}"`)) continue  // 已存在则跳过（幂等）
    raw = raw.replace(/\s*$/, '\n\n') + `msgid "${key}"\nmsgstr "${text}"\n\n`
    added++
  }
  if (added > 0) {
    fs.writeFileSync(fp, raw, 'utf8')
    console.log('patched:', file, `(${added} keys)`)
    totalAdded += added
  }
}
console.log(`Done. totalAdded=${totalAdded}`)

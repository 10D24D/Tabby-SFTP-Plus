#!/usr/bin/env node
/**
 * 功能描述：从全部 locale/*.po 中移除「导出数据」旧分类遗留的 5 个 msgid，并做完整性自检。
 *   背景：2026-09-29 首版导出勾选弹窗用了 5 个类别（界面与外观/面板与行为/传输与冲突/
 *   书签与记录/图标与文件类型），对应新增 5 个 exportCat* key。同日二次调整把类别改为
 *   「逐项对齐设置页分区标题」的 9 项后，这 5 个 key 在源码里已无任何引用 → 属于死 key，
 *   留着会让后来者误以为还有 5 类分类口径，故统一清除。
 *
 *   实现口径（刻意保守）：
 *   ① 只删「从 msgid "settings.exportCatUi" 起、到 msgid "settings.exportSelectAll" 前一行止」
 *      这段**连续区间**——这 5 个块由 scripts/add-export-picker-i18n.mjs 追加在文件末尾，
 *      结构上必然连续；区间外一个字节都不动（保留注释行、续行等原始格式）。
 *   ② 若两个锚点任一缺失（已清理过 / 结构异常）→ 跳过该文件并计入 skipped，绝不猜测删除范围。
 *   ③ 删除后逐文件自检：exportCat 前缀不得残留、两个锚点必须仍在、
 *      msgid 总数必须正好减少 5。
 *
 * 用法：node scripts/remove-export-cat-i18n.mjs [--dry]
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-09-29
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALE_DIR = path.resolve(__dirname, '../locale')

const FIRST_ANCHOR = 'msgid "settings.exportCatUi"'
const LAST_ANCHOR = 'msgid "settings.exportSelectAll"'
const DEAD_MARKER = 'msgid "settings.exportCat'

const dry = process.argv.includes('--dry')

const countMsgids = (lines) => lines.filter((l) => /^msgid "/.test(l)).length

const files = fs.readdirSync(LOCALE_DIR).filter((f) => f.endsWith('.po')).sort()
if (!files.length) {
  console.error('未找到任何 locale/*.po')
  process.exit(1)
}

let changed = 0
let skipped = 0
let removedTotal = 0
const problems = []

for (const file of files) {
  const full = path.join(LOCALE_DIR, file)
  const original = fs.readFileSync(full, 'utf8')
  const lines = original.split('\n')

  const first = lines.indexOf(FIRST_ANCHOR)
  const last = lines.indexOf(LAST_ANCHOR)

  if (first < 0 || last < 0) {
    // 已清理过（或从未加过）——正常跳过
    skipped++
    console.log(`  – ${file}: 无可删区间（first=${first} last=${last}）`)
    continue
  }
  if (last <= first) {
    // 锚点顺序异常 → 结构不符合预期，保守跳过
    skipped++
    problems.push(`${file}: 锚点顺序异常（first=${first} last=${last}）`)
    continue
  }

  // 区间内的每一条 msgid 必须都是要删的 exportCat*，否则说明夹带了别的内容 → 保守跳过
  const block = lines.slice(first, last)
  const innerIds = block.filter((l) => /^msgid "/.test(l))
  const unexpected = innerIds.filter((l) => !l.startsWith(DEAD_MARKER))
  if (unexpected.length) {
    skipped++
    problems.push(`${file}: 待删区间内夹带了非 exportCat 的 msgid → ${unexpected.join(' | ')}`)
    continue
  }

  const before = countMsgids(lines)
  const kept = [...lines.slice(0, first), ...lines.slice(last)]
  const after = countMsgids(kept)

  if (before - after !== innerIds.length) {
    skipped++
    problems.push(`${file}: 自检失败，msgid 数 ${before} → ${after}，期望减少 ${innerIds.length}`)
    continue
  }

  const text = kept.join('\n')
  if (text.includes(DEAD_MARKER)) {
    skipped++
    problems.push(`${file}: 删除后仍残留 exportCat* msgid`)
    continue
  }
  if (!kept.includes(LAST_ANCHOR)) {
    skipped++
    problems.push(`${file}: 删除后 ${LAST_ANCHOR} 丢失`)
    continue
  }

  if (!dry) fs.writeFileSync(full, text, 'utf8')
  changed++
  removedTotal += innerIds.length
  console.log(`  ✓ ${file}: 删除 ${innerIds.length} 个 key（msgid ${before} → ${after}）`)
}

console.log(
  `\nremove-export-cat-i18n：${dry ? '[dry-run] ' : ''}处理 ${changed} 份，跳过 ${skipped} 份，` +
    `共删除 ${removedTotal} 个 msgid`
)
if (problems.length) {
  console.log('异常：')
  for (const p of problems) console.log('  ! ' + p)
  process.exit(1)
}

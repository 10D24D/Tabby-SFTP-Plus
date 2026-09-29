/**
 * SFTP+ 文件列表分组（类似 Windows 资源管理器「分组依据」）
 * 功能描述：把已排序的扁平文件列表按名称/修改日期/类型/大小切分为有序分组，
 *          并产出带表头行/条目行的显示行数组（表头行含折叠状态与组内条目引用）。
 *          条目在组内保持原有排序顺序；组顺序跟随对应排序方向（降序时反组序）。
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-09-28
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-09-29 — 新增 NAV_HEADER_KEY_PREFIX / navHeaderKey()：方向键导航中分组头行的
 *              导航键前缀下沉到本叶子模块，供面板（焦点/锚点）与 file-pane（游标高亮判定）共用
 */

export type GroupByMode = 'none' | 'name' | 'modified' | 'type' | 'size'

/**
 * ★ 2026-09-29：方向键导航中「分组头行」的导航键前缀。
 * 分组头不是文件、没有 fullPath，用「含 NUL 的前缀 + bucketKey」合成导航键；
 * 文件路径不可能包含 NUL，故与任何真实 fullPath 都不相等（不会误配条目）。
 * 面板侧用它生成焦点键、file-pane 侧用同一常量判定「游标是否停在表头」，故放在本模块
 * （叶子模块无任何 import → 父子组件都能引，不会形成循环依赖）。
 */
export const NAV_HEADER_KEY_PREFIX = '\u0000group:'

/** 由分组 bucketKey 合成导航键（分组头行专用；条目行直接用自己的 fullPath） */
export function navHeaderKey(bucketKey: string): string {
  return NAV_HEADER_KEY_PREFIX + bucketKey
}

/** 分组桶描述：key 为稳定标识（折叠状态/选中查找用），labelKey + arg 供父组件翻译 */
export interface GroupBucket {
  key: string
  labelKey: string
  /** 可选附加参数（类型分组的扩展名大写文本等） */
  arg?: string
}

/** 分组显示行：header=分组表头行；entry=文件条目行（index 为扁平列表中的原始下标） */
export interface GroupDisplayRow {
  kind: 'header' | 'entry'
  // header 专用
  bucket?: GroupBucket
  /** header 行的分组 key（模板事件直接用，避免深取 bucket.key） */
  bucketKey?: string
  label?: string
  collapsed?: boolean
  count?: number
  items?: any[]
  // entry 专用
  entry?: any
  index?: number
}

/** 名称分组桶顺序（0-9 / A-H / I-P / Q-Z / 拼音 A-F / G-L / M-S / T-Z / 其他） */
const NAME_BUCKETS: GroupBucket[] = [
  { key: 'digit', labelKey: 'group.digit' },
  { key: 'a2h', labelKey: 'group.a2h' },
  { key: 'i2p', labelKey: 'group.i2p' },
  { key: 'q2z', labelKey: 'group.q2z' },
  { key: 'pyAF', labelKey: 'group.pyAF' },
  { key: 'pyGL', labelKey: 'group.pyGL' },
  { key: 'pyMS', labelKey: 'group.pyMS' },
  { key: 'pyTZ', labelKey: 'group.pyTZ' },
  { key: 'other', labelKey: 'group.other' },
]

/** 修改日期分组桶顺序（今天→很久以前） */
const MODIFIED_BUCKETS: GroupBucket[] = [
  { key: 'today', labelKey: 'group.today' },
  { key: 'yesterday', labelKey: 'group.yesterday' },
  { key: 'thisWeek', labelKey: 'group.thisWeek' },
  { key: 'thisMonth', labelKey: 'group.thisMonth' },
  { key: 'earlierThisYear', labelKey: 'group.earlierThisYear' },
  { key: 'longAgo', labelKey: 'group.longAgo' },
]

/** 大小分组桶顺序（极小→超大） */
const SIZE_BUCKETS: GroupBucket[] = [
  { key: 'tiny', labelKey: 'group.sizeTiny' },
  { key: 'small', labelKey: 'group.sizeSmall' },
  { key: 'medium', labelKey: 'group.sizeMedium' },
  { key: 'large', labelKey: 'group.sizeLarge' },
  { key: 'huge', labelKey: 'group.sizeHuge' },
  { key: 'super', labelKey: 'group.sizeSuper' },
]

/** 拼音分组边界（zh 拼音序下各拼音桶的首字）：比较结果 <0 表示落在前一个桶 */
const PINYIN_BOUNDS = { g: '嘎', m: '妈', t: '塌' }
let _zhCollator: Intl.Collator | null = null
let _zhCollatorOk: boolean | null = null

function zhCompare(a: string, b: string): number | null {
  try {
    if (_zhCollatorOk === null) {
      _zhCollator = new Intl.Collator('zh-u-co-pinyin')
      // 自检：拼音序下「阿」必须排在「匝」之前；不支持的运行环境两者相等 → 禁用拼音分桶
      _zhCollatorOk = _zhCollator.compare('阿', '匝') < 0 ? true : false
    }
    if (!_zhCollatorOk || !_zhCollator) return null
    return _zhCollator.compare(a, b)
  } catch { _zhCollatorOk = false; return null }
}

/** 名称 → 名称分组桶 key */
function nameBucketKey(name: string): string {
  const ch = (name || '').charAt(0)
  if (!ch) return 'other'
  if (ch >= '0' && ch <= '9') return 'digit'
  const up = ch.toUpperCase()
  if (up >= 'A' && up <= 'H') return 'a2h'
  if (up >= 'I' && up <= 'P') return 'i2p'
  if (up >= 'Q' && up <= 'Z') return 'q2z'
  // CJK：尝试按拼音分桶（A-F / G-L / M-S / T-Z）；环境不支持则归入「其他」。
  // ⚠ 不能用「与某个汉字比较」来判定是否 CJK——拼音序与 Unicode 码点序不同
  //   （如 一<yī> 排在 动<dòng> 之后），必须用码点区间判定
  if (/[\u4e00-\u9fff]/.test(ch)) {
    const cmpG = zhCompare(ch, PINYIN_BOUNDS.g)
    if (cmpG === null) return 'other'
    if (cmpG < 0) return 'pyAF'
    if (zhCompare(ch, PINYIN_BOUNDS.m) < 0) return 'pyGL'
    if (zhCompare(ch, PINYIN_BOUNDS.t) < 0) return 'pyMS'
    return 'pyTZ'
  }
  return 'other'
}

/** 修改时间 → 日期分组桶 key（今天/昨天/本周/本月/今年早些时候/很久以前） */
function modifiedBucketKey(ts: number): string {
  if (!ts || ts <= 0) return 'longAgo'
  const d = new Date(ts)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const day = startOfDay(d)
  const today = startOfDay(now)
  const DAY = 24 * 60 * 60 * 1000
  if (day === today) return 'today'
  if (day === today - DAY) return 'yesterday'
  if (day > today - DAY) return 'today' // 时钟轻微偏移兜底
  // 本周：以周一为一周起点（与国内习惯一致）
  const dow = (now.getDay() + 6) % 7 // 周一=0
  const weekStart = today - dow * DAY
  if (day >= weekStart) return 'thisWeek'
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'thisMonth'
  if (d.getFullYear() === now.getFullYear()) return 'earlierThisYear'
  return 'longAgo'
}

/** 大小 → 大小分组桶 key（极小 0-16KB / 小 16KB-1MB / 中等 1-128MB / 大 128MB-1GB / 巨大 1-4GB / 超大 >4GB） */
function sizeBucketKey(size: number): string {
  const KB = 1024, MB = 1024 * KB, GB = 1024 * MB
  const s = Number.isFinite(size) && size > 0 ? size : 0
  if (s < 16 * KB) return 'tiny'
  if (s < 1 * MB) return 'small'
  if (s < 128 * MB) return 'medium'
  if (s < 1 * GB) return 'large'
  if (s < 4 * GB) return 'huge'
  return 'super'
}

/** 扩展名显示文本（无扩展名返回空串） */
export function extDisplay(name: string): string {
  const dot = (name || '').lastIndexOf('.')
  if (dot <= 0) return ''
  const ext = name.slice(dot + 1).trim()
  return ext ? ext.toUpperCase() : ''
}

/** 条目 → 分组桶（type 模式动态生成扩展名桶，其余走固定桶表） */
function bucketFor(e: any, mode: GroupByMode): GroupBucket {
  if (mode === 'name') {
    const key = nameBucketKey(e?.name || '')
    return NAME_BUCKETS.find(b => b.key === key) || NAME_BUCKETS[NAME_BUCKETS.length - 1]
  }
  if (mode === 'modified') {
    const ts = e?.modified?.getTime?.() ?? (e?.mtimeMs ? Number(e.mtimeMs) : 0)
    const key = modifiedBucketKey(ts)
    return MODIFIED_BUCKETS.find(b => b.key === key) || MODIFIED_BUCKETS[MODIFIED_BUCKETS.length - 1]
  }
  if (mode === 'size') {
    const key = sizeBucketKey(Number(e?.size) || 0)
    return SIZE_BUCKETS.find(b => b.key === key) || SIZE_BUCKETS[SIZE_BUCKETS.length - 1]
  }
  // type：文件夹 / 扩展名桶（key 带 ext 前缀，动态桶）/ 无扩展名
  if (e?.isDirectory) return { key: 'folder', labelKey: 'group.folder' }
  const ext = extDisplay(e?.name || '')
  return ext
    ? { key: `ext:${ext.toLowerCase()}`, labelKey: 'group.typeFiles', arg: ext }
    : { key: 'noExt', labelKey: 'group.noExt' }
}

/**
 * 把已排序的扁平列表构建为分组显示行数组。
 * @param entries 已过滤+排序的扁平条目（组内顺序即此顺序）
 * @param mode    分组依据（none 时调用方不应进入本函数）
 * @param reverseGroups true 时组顺序反转（对应排序列为降序，贴近资源管理器行为）
 * @param collapsedSet 已折叠分组的 key 集合（父组件持有，折叠行不展开条目行）
 * @param labeler 桶 → 显示文本（父组件注入 i18n 翻译闭包）
 */
export function buildGroupedRows(
  entries: any[],
  mode: GroupByMode,
  reverseGroups: boolean,
  collapsedSet: Set<string>,
  labeler: (b: GroupBucket) => string,
): GroupDisplayRow[] {
  const rows: GroupDisplayRow[] = []
  if (mode === 'none' || !entries || !entries.length) return rows
  // 按桶聚拢（Map 保持首次出现顺序，随后按固定桶序重排）
  const buckets = new Map<string, { bucket: GroupBucket; items: any[]; indexes: number[] }>()
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const b = bucketFor(e, mode)
    let g = buckets.get(b.key)
    if (!g) { g = { bucket: b, items: [], indexes: [] }; buckets.set(b.key, g) }
    g.items.push(e)
    g.indexes.push(i)
  }
  // 桶排序：固定桶表按表序；type 模式的动态扩展名桶按显示文本排序（文件夹恒最前、无扩展名恒最后）
  let ordered: { bucket: GroupBucket; items: any[]; indexes: number[] }[]
  if (mode === 'type') {
    const fixed = [...buckets.values()].filter(g => g.bucket.key === 'folder')
    const noExt = [...buckets.values()].filter(g => g.bucket.key === 'noExt')
    const exts = [...buckets.values()]
      .filter(g => g.bucket.key.startsWith('ext:'))
      .sort((a, b) => (a.bucket.arg || '').localeCompare(b.bucket.arg || ''))
    ordered = [...fixed, ...exts, ...noExt]
  } else {
    const table = mode === 'name' ? NAME_BUCKETS : mode === 'modified' ? MODIFIED_BUCKETS : SIZE_BUCKETS
    ordered = []
    for (const b of table) {
      const g = buckets.get(b.key)
      if (g) ordered.push(g)
    }
    // 兜底：任何不在固定表里的桶（不应发生）追加在末尾，防丢条目
    for (const g of buckets.values()) {
      if (!ordered.includes(g)) ordered.push(g)
    }
  }
  if (reverseGroups) ordered = ordered.slice().reverse()
  for (const g of ordered) {
    const collapsed = collapsedSet.has(g.bucket.key)
    rows.push({
      kind: 'header',
      bucket: g.bucket,
      bucketKey: g.bucket.key,
      label: labeler(g.bucket),
      collapsed,
      count: g.items.length,
      items: g.items,
    })
    if (collapsed) continue
    for (let j = 0; j < g.items.length; j++) {
      rows.push({ kind: 'entry', entry: g.items[j], index: g.indexes[j] })
    }
  }
  return rows
}

/** 分组维度对应的排序字段（用于判断组序是否应随排序方向反转） */
export function groupModeSortField(mode: GroupByMode): string | null {
  if (mode === 'name') return 'name'
  if (mode === 'modified') return 'modified'
  if (mode === 'size') return 'size'
  return null
}

/**
 * 顶栏功能按钮登记表（面板右上角操作按钮）
 * 功能描述：顶栏按钮的「有哪些 / 默认顺序 / 默认固定态 / 配置字段名」唯一来源。
 *   面板（渲染 + ⋯ 折叠菜单）与设置页（定制列表）必须共用本文件，禁止各写一份 id 数组，
 *   否则新增一个按钮时必然漏改一侧（漏在设置页 = 永远配不到；漏在面板 = 配置了也没效果）。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-19
 * @修改人：DD1024z + Deepseek-V4.1-Flash
 * @修改时间：2026-10-27 — 新增 `overflow`（⋯ 折叠菜单）到登记表，允许用户把它拖到顶栏任意位置；
 *              DEFAULT_TOP_BAR_PINNED 排除它（不是功能按钮、恒在顶栏）；`normalizeTopBarIds` 的补齐
 *              逻辑改为「按默认顺序的相对位置插入」，让老配置升级后 ⋯ 落在 ✕ 之前而不是被追加到末尾。
 */

/**
 * 可定制的顶栏按钮 id。
 * ★ 2026-10-23（Deepseek-V4.1-Flash）：`close`（✕）不再排除在外 —— 用户指出「既然能给面板设
 *   开关快捷键，关闭按钮也应该能调」。限制条件：**未配置 `sftp-plus-toggle-panel` 快捷键时，
 *   ✕ 由面板兜底强制显示且设置页该项禁用**（否则用户可能把面板关不掉的唯一稳定出口关掉；
 *   Esc 只有焦点在面板内才有效）。
 * ★ 2026-10-27（Deepseek-V4.1-Flash）：新增 `overflow`（⋯ 折叠菜单）—— 用户要求它也能参与排序：
 *   「开启折叠菜单后，这三个点应该也要可以参与排序」。它与其它项的区别：
 *     · **不是功能按钮**，而是溢出容器 ⇒ 没有「停用」「收起进菜单」两态，恒在顶栏；
 *     · 是否显示由 `topBarOverflow` 总开关决定（关掉时它连同菜单一起消失）；
 *     · 不进入 ⋯ 菜单自身的列表（否则会出现「点自己打开自己」的递归入口）。
 */
export type TopBarItemId = 'pathMode' | 'layout' | 'transferLog' | 'settings' | 'minimize' | 'maximize' | 'overflow' | 'close'

export interface TopBarItemDef {
  id: TopBarItemId
  /** 菜单/设置页展示用的文案 key（maximize 在面板里按最大化状态动态取 app.restore） */
  labelKey: string
}

/** 全量按钮（顺序即默认顺序） */
export const TOP_BAR_ITEMS: TopBarItemDef[] = [
  { id: 'pathMode', labelKey: 'topbar.pathMode' },
  { id: 'layout', labelKey: 'settings.layout' },
  { id: 'transferLog', labelKey: 'transfer.log' },
  { id: 'settings', labelKey: 'app.openSettings' },
  { id: 'minimize', labelKey: 'topbar.minimize' },
  { id: 'maximize', labelKey: 'app.maximize' },
  // ★ 2026-10-27：⋯ 默认排在 ✕ 之前（✕ 是顶栏最后一个出口），但它可被拖到任意位置。
  //   labelKey 用 topBarItemOverflow（名词短语「折叠菜单（⋯）」）而不是上方开关的
  //   settings.topBarOverflow（「启用折叠菜单（⋯）」）—— 后者放在列表行里动词重复、像第二个开关。
  { id: 'overflow', labelKey: 'settings.topBarItemOverflow' },
  // ★ 2026-10-23：关闭放最后（视觉上恒在最右）；默认固定 + 启用 ⇒ 不配置时与历史一致
  { id: 'close', labelKey: 'app.close' },
]

export const TOP_BAR_ITEM_IDS: TopBarItemId[] = TOP_BAR_ITEMS.map(i => i.id)

/** 默认顺序 */
export const DEFAULT_TOP_BAR_ORDER: TopBarItemId[] = [...TOP_BAR_ITEM_IDS]
/**
 * 默认固定态：全部固定 + 折叠菜单关闭 ⇒ 与历史行为完全一致（不启用定制时用户看不到任何变化）。
 * 想收紧顶栏的用户自行在设置页把部分按钮改为「在 ⋯ 菜单」并打开折叠开关。
 * ★ 2026-10-27：排除 `overflow` —— 它不是可收起的按钮，恒在顶栏，留在 pinned 里只会污染配置
 *   （设置页该行也没有图钉按钮）。
 */
export const DEFAULT_TOP_BAR_PINNED: TopBarItemId[] = TOP_BAR_ITEM_IDS.filter(id => id !== 'overflow')

/**
 * 默认停用集合：空 = 全部启用。
 * ★ 2026-10-19（Deepseek-V4.1-Flash）：与右键菜单定制（contextMenuDisabled）同一套写法——
 *   停用项**顶栏和 ⋯ 菜单都不出现**，与「收起」是两回事（收起只是挪到 ⋯ 里）。
 */
export const DEFAULT_TOP_BAR_DISABLED: TopBarItemId[] = []

/** 配置字段名（settings 配置 / 导出导入共用，改这里即可，别再散写字符串） */
export const TOP_BAR_CFG_FIELDS = {
  order: 'topBarOrder',
  pinned: 'topBarPinned',
  overflow: 'topBarOverflow',
  disabled: 'topBarDisabled',
} as const

/**
 * 通用 id 列表规整器：去重、剔除未知项；可选补齐缺失项。
 * ★ 2026-10-27（Deepseek-V4.1-Flash）：补齐不再是「一律追加到末尾」，改为**按默认顺序的相对位置插入** ——
 *   缺失项会插到「默认顺序里排在它后面、且当前已存在」的第一项之前；找不到锚点才追加。
 *   动机：新增 ⋯（overflow）后，老用户的 topBarOrder 里没有这一项；若按老逻辑追加到末尾，
 *   ⋯ 就会跑到 ✕ 右边（正是用户刚反馈过的位置）。按相对位置插入后，老配置升级即得到
 *   「⋯ 在 ✕ 左侧」，而用户自定义过的其余顺序原样保留。
 */
function normalizeTopBarIds(raw: unknown, fillMissing: boolean): TopBarItemId[] {
  const list: TopBarItemId[] = []
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const id = v as TopBarItemId
      if (TOP_BAR_ITEM_IDS.includes(id) && !list.includes(id)) list.push(id)
    }
  }
  if (fillMissing) {
    for (let i = 0; i < TOP_BAR_ITEM_IDS.length; i++) {
      const id = TOP_BAR_ITEM_IDS[i]
      if (list.includes(id)) continue
      let anchor = -1
      for (let j = i + 1; j < TOP_BAR_ITEM_IDS.length; j++) {
        const pos = list.indexOf(TOP_BAR_ITEM_IDS[j])
        if (pos >= 0) { anchor = pos; break }
      }
      if (anchor >= 0) list.splice(anchor, 0, id)
      else list.push(id)
    }
  }
  return list
}

/** 把任意来源（配置 / 导入文件 / 旧数据）的数组规整成合法 id 列表：去重、剔除未知项、补齐缺失项 */
export function normalizeTopBarOrder(raw: unknown): TopBarItemId[] {
  return normalizeTopBarIds(raw, true)
}

/** 规整固定态：只保留合法 id、去重 */
export function normalizeTopBarPinned(raw: unknown): TopBarItemId[] {
  return normalizeTopBarIds(raw, false)
}

/** 规整停用集合：只保留合法 id、去重（缺失 = 全部启用） */
export function normalizeTopBarDisabled(raw: unknown): TopBarItemId[] {
  return normalizeTopBarIds(raw, false)
}

/**
 * 构建后自动同步 根 package.json -> dist/package.json
 * 功能描述：让 dist/ 成为自包含、可被 Tabby 直接加载的插件包；
 *          同时消除「手工维护 dist/package.json」导致的版本号/字段漂移
 *          （webpack 本身不会复制 package.json，此前是两处手工同步，已出过 GBK 乱码）。
 *          - main 改写为 index.js（dist 内入口）
 *          - 去掉仅开发期使用的脚本（prebuild/check-common/use-in-tabby）
 *          - 剔除 devDependencies / files（消费方无意义）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-25
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-07-25
 *   v2.0.0 发布修复：将脚本由 monorepo 根 scripts/ 收敛进本仓库 scripts/，
 *   使 CI（仅 checkout 单仓库）的 `npm run build` 能找到本文件。
 *
 * 用法（在插件目录内执行）：node scripts/copy-sftp-manifest.mjs
 * 依赖：process.cwd() 即插件根目录
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const srcPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const distPkg = {
  name: srcPkg.name,
  version: srcPkg.version,
  description: srcPkg.description,
  keywords: srcPkg.keywords,
  // dist 内的入口是 index.js（而非 dist/index.js）
  main: 'index.js',
  scripts: {
    build: 'webpack --progress --color',
    watch: 'webpack --progress --color --watch',
    prepublishOnly: 'npm run build',
  },
  author: srcPkg.author,
  license: srcPkg.license,
  repository: srcPkg.repository,
  homepage: srcPkg.homepage,
  bugs: srcPkg.bugs,
}

const outPath = join(root, 'dist', 'package.json')
writeFileSync(outPath, JSON.stringify(distPkg, null, 2) + '\n', 'utf8')
console.log(`[copy-sftp-manifest] wrote ${outPath} (v${distPkg.version}, main=${distPkg.main})`)

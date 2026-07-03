<#
.SYNOPSIS
  Tabby-SFTP-Plus 安装脚本
.DESCRIPTION
  编译插件并将产物复制到 Tabby 插件目录
  用法: pwsh install.ps1 [-NoBuild]
#>
param(
  [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$dst = Join-Path $env:APPDATA 'tabby\plugins\node_modules\tabby-sftp-plus'

Write-Host '[SFTP+] 源目录: ' $src
Write-Host '[SFTP+] 目标目录: ' $dst

if (-not $NoBuild) {
  Write-Host '[SFTP+] 正在编译...' -ForegroundColor Cyan
  Push-Location $src
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw '编译失败' }
  } finally {
    Pop-Location
  }
  Write-Host '[SFTP+] 编译完成' -ForegroundColor Green
}

if (-not (Test-Path (Join-Path $src 'dist\index.js'))) {
  throw '未找到 dist/index.js，请先编译'
}

Write-Host '[SFTP+] 正在部署到插件目录...' -ForegroundColor Cyan

if (Test-Path $dst) {
  Remove-Item -Path $dst -Recurse -Force
}
New-Item -ItemType Directory -Path $dst -Force | Out-Null

Copy-Item -Path (Join-Path $src 'dist') -Destination $dst -Recurse -Force
Copy-Item -Path (Join-Path $src 'package.json') -Destination $dst -Force

Write-Host '[SFTP+] 安装完成，请重启 Tabby' -ForegroundColor Green

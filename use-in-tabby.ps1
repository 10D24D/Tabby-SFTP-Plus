# Build SFTP+ and deploy for local Tabby development.
# Usage: .\use-in-tabby.ps1 [-NoBuild] [-Watch] [-Mode Dev|Link|Copy] [-RestartTabby]

[CmdletBinding()]
param(
  [switch]$NoBuild,
  [switch]$Watch,
  [ValidateSet('Link', 'Copy')]
  [string]$Mode = 'Link',
  [switch]$RestartTabby,
  [switch]$ShowFooter
)

. (Join-Path $PSScriptRoot '..\scripts\use-tabby-plugin.ps1')

$invokeArgs = @{
  Label          = 'SFTP+'
  NpmPackageName = 'tabby-sftp-plus'
  ProjectRoot    = $PSScriptRoot
  Mode           = $Mode
}
if ($NoBuild) { $invokeArgs.NoBuild = $true }
if ($Watch) { $invokeArgs.Watch = $true }
if ($RestartTabby) { $invokeArgs.RestartTabby = $true }
if ($PSBoundParameters.ContainsKey('ShowFooter')) { $invokeArgs.ShowFooter = $ShowFooter.IsPresent }

Invoke-TabbyPluginDeploy @invokeArgs

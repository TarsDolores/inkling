$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $appRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $appRoot 'launcher\ExternalLauncher.cs'
$manifest = Join-Path $appRoot 'launcher\ExternalLauncher.manifest'
$icon = Join-Path $appRoot 'launcher\suiji.ico'
$output = Join-Path $desktop '随记.exe'

foreach ($path in @($csc, $source, $manifest, $icon)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "缺少文件：$path" }
}

& $csc '-nologo' '-target:winexe' '-codepage:65001' "-win32icon:$icon" "-win32manifest:$manifest" "-out:$output" $source '-r:System.Windows.Forms.dll'
if ($LASTEXITCODE -ne 0) { throw '外部启动器编译失败。' }

Write-Output "已生成工作区外启动入口：$output"
Write-Output "应用目录：$workspaceRoot"

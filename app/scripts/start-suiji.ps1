$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
$workspaceRoot = Split-Path -Parent $projectRoot
$dataRoot = Join-Path $workspaceRoot 'sync-data'
$appPort = 4180
$appUrl = "http://127.0.0.1:$appPort"

function Test-SuijiPageRunning {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri $appUrl
        return $response.StatusCode -eq 200 -and $response.Content -match '<div id="root"></div>'
    }
    catch { return $false }
}

function Get-SuijiHealth {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri "$appUrl/api/health"
        if ($response.StatusCode -ne 200) { return $null }
        return $response.Content | ConvertFrom-Json
    }
    catch { return $null }
}

function Test-SuijiRunning {
    if (-not (Test-SuijiPageRunning)) { return $false }
    if ($null -ne (Get-SuijiHealth)) { return $true }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 -Uri "$appUrl/api/sync/snapshot"
        return $response.StatusCode -eq 200 -and $response.Content -match '"notes"' -and $response.Content -match '"topics"'
    }
    catch { return $false }
}

function Test-SuijiPortInUse {
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { return $false }
    $connections = @(Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue)
    return $connections.Count -gt 0
}

function Stop-SuijiService {
    if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
        throw '无法自动关闭旧版随记服务。请重启电脑后再双击“随记.exe”。'
    }
    $connections = @(Get-NetTCPConnection -LocalPort $appPort -State Listen -ErrorAction SilentlyContinue)
    $stopped = $false
    foreach ($connection in $connections) {
        $processId = [int]$connection.OwningProcess
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($null -eq $process) { continue }
        if (@('powershell', 'pwsh') -notcontains $process.ProcessName) { continue }
        Stop-Process -Id $processId -Force -ErrorAction Stop
        $stopped = $true
    }
    if (-not $stopped) { throw '无法自动关闭旧版随记服务。请重启电脑后再双击“随记.exe”。' }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (-not (Test-SuijiPortInUse)) { return }
        Start-Sleep -Milliseconds 200
    }
    throw '旧版随记服务没有及时退出，请重启电脑后再试。'
}

function Get-SuijiSourceHash {
    $fingerprintFile = Join-Path $distRoot 'build-fingerprint.json'
    if (-not (Test-Path -LiteralPath $fingerprintFile -PathType Leaf)) { return '' }
    try { return [string](Get-Content -LiteralPath $fingerprintFile -Raw -Encoding UTF8 | ConvertFrom-Json).sourceHash }
    catch { return '' }
}

try {
    if (-not (Test-SuijiRunning) -and (Test-SuijiPageRunning)) {
        throw '旧版随记服务仍在占用本地端口。请重启电脑一次，再双击启动随记。'
    }

    $needsBuild = -not (Test-Path -LiteralPath (Join-Path $distRoot 'index.html'))
    if (-not $needsBuild) {
        $buildMatchesSource = & (Join-Path $PSScriptRoot 'build-fingerprint.ps1') -Check
        $needsBuild = -not $buildMatchesSource
    }

    if ($needsBuild) {
        if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
            throw '应用源代码有更新，但当前电脑没有 Node.js。请安装 Node.js 20 以上版本后重试。'
        }
        Set-Location -LiteralPath $projectRoot
        if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vite\bin\vite.js'))) {
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
        }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw '生产构建失败。' }
    }

    $currentSourceHash = Get-SuijiSourceHash
    if (Test-SuijiRunning) {
        $health = Get-SuijiHealth
        if ($null -ne $health -and [string]$health.sourceHash -eq $currentSourceHash) {
            Start-Process $appUrl
            exit 0
        }
        Stop-SuijiService
    }

    $serverScript = Join-Path $PSScriptRoot 'serve-suiji.ps1'
    $serverArguments = @('-NoLogo', '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$serverScript`"", '-Root', "`"$distRoot`"", '-DataRoot', "`"$dataRoot`"", '-Port', [string]$appPort)
    Start-Process -FilePath 'powershell.exe' -WorkingDirectory $projectRoot -WindowStyle Hidden -ArgumentList $serverArguments

    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        $health = Get-SuijiHealth
        if ($null -ne $health -and [string]$health.sourceHash -eq $currentSourceHash) {
            Start-Process $appUrl
            exit 0
        }
        Start-Sleep -Milliseconds 250
    }
    throw '本地服务未能在 20 秒内启动。'
}
catch {
    try { Add-Content -LiteralPath (Join-Path $projectRoot 'startup-error.log') -Value "[$(Get-Date -Format s)] $($_.Exception.Message)" -Encoding UTF8 } catch { }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("随记启动失败：`n`n$($_.Exception.Message)", '随记', 'OK', 'Error') | Out-Null
    exit 1
}

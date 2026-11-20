param([switch]$Write, [switch]$Check)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
$recordPath = Join-Path $distRoot 'build-fingerprint.json'

function Get-RelativeFiles([string]$Root, [string]$Directory) {
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    return @(Get-ChildItem -LiteralPath $Directory -Recurse -File | ForEach-Object {
        $_.FullName.Substring($prefix.Length).Replace('\', '/')
    })
}

function Get-FileFingerprint([string]$Root, [string[]]$Files) {
    [Array]::Sort($Files, [StringComparer]::Ordinal)
    $hash = [Security.Cryptography.SHA256]::Create()
    $manifest = [Text.StringBuilder]::new()
    try {
        foreach ($relativePath in $Files) {
            $bytes = [IO.File]::ReadAllBytes((Join-Path $Root $relativePath))
            $digest = [BitConverter]::ToString($hash.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
            [void]$manifest.Append($relativePath).Append(':').Append($digest).Append("`n")
        }
        return [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($manifest.ToString()))).Replace('-', '').ToLowerInvariant()
    }
    finally { $hash.Dispose() }
}

if ($Check -and -not (Test-Path -LiteralPath $recordPath -PathType Leaf)) { return $false }

try {
    $sourceFiles = @(Get-RelativeFiles $projectRoot (Join-Path $projectRoot 'src')) +
        @(Get-RelativeFiles $projectRoot (Join-Path $projectRoot 'public')) +
        @('package.json', 'package-lock.json', 'index.html', 'vite.config.ts',
          'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'scripts/build-fingerprint.ps1',
          'scripts/serve-suiji.ps1', 'scripts/start-suiji.ps1', 'scripts/start-suiji.vbs', 'scripts/ai-suiji.ps1')
    $sourceHash = Get-FileFingerprint $projectRoot $sourceFiles
    if (-not $Write -and -not $Check) { return $sourceHash }

    $outputFiles = @(Get-RelativeFiles $distRoot $distRoot | Where-Object { $_ -ne 'build-fingerprint.json' })
    $outputHash = Get-FileFingerprint $distRoot $outputFiles
    if ($Check) {
        $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
        return $record.version -eq 1 -and $record.sourceHash -eq $sourceHash -and $record.outputHash -eq $outputHash
    }

    $record = [ordered]@{ version = 1; sourceHash = $sourceHash; outputHash = $outputHash } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($recordPath, $record, [Text.UTF8Encoding]::new($false))
    Write-Output 'Build fingerprint saved.'
}
catch {
    if ($Check) { return $false }
    throw
}

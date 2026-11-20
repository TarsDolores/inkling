param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$DataRoot,
    [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$rootPath = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not (Test-Path -LiteralPath (Join-Path $rootPath 'index.html'))) { throw 'Application files are incomplete.' }

$dataRoot = [IO.Path]::GetFullPath($DataRoot)
$notesRoot = Join-Path $dataRoot 'notes'
$topicsRoot = Join-Path $dataRoot 'topics'
$deletionsRoot = Join-Path $dataRoot 'deletions'
$topicDeletionsRoot = Join-Path $dataRoot 'topic-deletions'
$spacesRoot = Join-Path $dataRoot 'spaces'
$spaceIds = @('life', 'research')
$spaceRoots = @{}
foreach ($space in $spaceIds) {
    $root = Join-Path $spacesRoot $space
    $spaceRoots[$space] = [ordered]@{
        root = $root
        notes = Join-Path $root 'notes'
        topics = Join-Path $root 'topics'
        deletions = Join-Path $root 'deletions'
        topicDeletions = Join-Path $root 'topic-deletions'
    }
}
$backupsRoot = Join-Path $dataRoot 'backups'
$reviewsRoot = Join-Path $dataRoot 'ai-reviews'
$directories = @($dataRoot, $notesRoot, $topicsRoot, $deletionsRoot, $topicDeletionsRoot, $spacesRoot, $backupsRoot, $reviewsRoot)
foreach ($space in $spaceIds) {
    $roots = $spaceRoots[$space]
    $directories += @($roots.root, $roots.notes, $roots.topics, $roots.deletions, $roots.topicDeletions)
}
foreach ($directory in $directories) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$utf8 = [Text.UTF8Encoding]::new($false)
$defaultAiPersona = '你像一位温柔、可靠、了解 TA 的好朋友，陪 TA 回看这段时间的文字。你真心希望 TA 成长，也愿意看见 TA 具体的努力和处境；你的鼓励有依据，不溺爱、不空泛夸奖，也不居高临下地说教。你会温和地指出真正值得面对的地方，但始终站在 TA 这一边。'
$defaultSpaces = @([PSCustomObject]@{ id = 'life'; name = '生活' }, [PSCustomObject]@{ id = 'research'; name = '科研' })
$defaultSettings = [ordered]@{ theme = 'system'; fontSize = 18; interfaceFontSize = 13; lineHeight = 1.9; motion = 'full'; typewriterMode = $false; fontDisplay = ''; fontUi = ''; fontMono = ''; fontWriting = ''; aiEnabled = $true; aiPersona = $defaultAiPersona; aiDefaultRange = '30d'; aiDefaultMode = 'excerpt'; echoSize = 'standard'; showEchoKeywords = $true; showHeatmap = $true; spaces = $defaultSpaces }
$backupRetentionDays = 45
$sourceHash = ''
$fingerprintPath = Join-Path $rootPath 'build-fingerprint.json'
if (Test-Path -LiteralPath $fingerprintPath -PathType Leaf) {
    try {
        $fingerprint = Get-Content -LiteralPath $fingerprintPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($fingerprint.sourceHash) { $sourceHash = [string]$fingerprint.sourceHash }
    }
    catch { $sourceHash = '' }
}

function Test-SafeId([string]$Id) {
    return -not [string]::IsNullOrWhiteSpace($Id) -and $Id -match '^[A-Za-z0-9-]{1,100}$'
}

# 空间列表来自 settings.json（1-3 个，可命名）；未配置时退回默认的生活/科研。
$script:configuredSpaces = $null

function Get-DefaultSpaces {
    return @(
        [PSCustomObject]@{ id = 'life'; name = '生活' },
        [PSCustomObject]@{ id = 'research'; name = '科研' }
    )
}

function Get-SafeSpaces($Value) {
    $result = [System.Collections.Generic.List[object]]::new()
    $seen = @{}
    if ($Value -is [array] -or $Value -is [System.Collections.IEnumerable]) {
        foreach ($item in @($Value)) {
            if ($null -eq $item) { continue }
            $id = (Get-SafeString $item.id).Trim()
            if ($id -notmatch '^[a-z][a-z0-9-]{0,19}$' -or $seen.ContainsKey($id)) { continue }
            $name = (Get-SafeString $item.name) -replace '\s+', ' '
            $name = $name.Trim()
            if (-not $name) { continue }
            if ($name.Length -gt 10) { $name = $name.Substring(0, 10) }
            $seen[$id] = $true
            $result.Add([PSCustomObject]@{ id = $id; name = $name })
            if ($result.Count -ge 3) { break }
        }
    }
    if ($result.Count -eq 0) { foreach ($space in @(Get-DefaultSpaces)) { $result.Add($space) } }
    return $result
}

function Get-ConfiguredSpaces {
    if ($null -ne $script:configuredSpaces) { return $script:configuredSpaces }
    $spaces = @()
    $record = Get-LatestSettingsRecord
    if ($null -ne $record -and $null -ne $record.Value -and $null -ne $record.Value.value) {
        $spaces = Get-SafeSpaces $record.Value.value.spaces
    }
    if (-not $spaces.Count) { $spaces = Get-SafeSpaces $null }
    $script:configuredSpaces = $spaces
    return $spaces
}

function Get-ConfiguredSpaceIds {
    return @((Get-ConfiguredSpaces) | ForEach-Object { $_.id })
}

function Resolve-SpaceId([string]$Space) {
    $ids = Get-ConfiguredSpaceIds
    if ($ids -contains $Space) { return $Space }
    return $ids[0]
}

function Get-SpaceRoots([string]$Space) {
    $space = Resolve-SpaceId $Space
    if (-not $spaceRoots.ContainsKey($space)) {
        $root = Join-Path $spacesRoot $space
        $spaceRoots[$space] = [ordered]@{
            root = $root
            notes = Join-Path $root 'notes'
            topics = Join-Path $root 'topics'
            deletions = Join-Path $root 'deletions'
            topicDeletions = Join-Path $root 'topic-deletions'
        }
        foreach ($dir in @($spaceRoots[$space].Values)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        Ensure-SpaceTopics $space
    }
    return $spaceRoots[$space]
}

function Test-LocalRequest($Request) {
    $hostHeader = [string]$Request.Headers['host']
    if ($hostHeader -and $hostHeader -notmatch '^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$') { return $false }
    $origin = [string]$Request.Headers['origin']
    if ($origin -and $origin -notmatch '^http://(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$') { return $false }
    return $true
}

function Write-JsonAtomic([string]$Path, $Value) {
    $json = $Value | ConvertTo-Json -Depth 30
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temporary, $json, $utf8)
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            Move-Item -LiteralPath $temporary -Destination $Path -Force
            return
        }
        catch {
            if ($attempt -eq 2) {
                Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
                throw
            }
            Start-Sleep -Milliseconds 120
        }
    }
}

function Read-JsonFile([string]$Path) {
    try { return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json }
    catch { return $null }
}

function Get-SafeString($Value) {
    if ($Value -is [string]) { return $Value }
    return ''
}

function Get-PayloadSpace($Payload) {
    $configured = Get-ConfiguredSpaceIds
    if ($null -eq $Payload) { return $configured[0] }
    $space = Get-SafeString $Payload.space
    if ($configured -contains $space) { return $space }
    if ($configured -contains 'research' -and ((Get-SafeString $Payload.topicId) -eq 'research' -or (Get-SafeString $Payload.id) -eq 'research')) { return 'research' }
    return $configured[0]
}

function Get-SafeFontName($Value) {
    $name = (Get-SafeString $Value).Trim()
    if ($name.Length -gt 80) { $name = $name.Substring(0, 80) }
    return ($name -replace '["\r\n\\]', '')
}

function Get-SafePersona($Value) {
    $text = (Get-SafeString $Value).Trim()
    if ($text.Length -gt 800) { $text = $text.Substring(0, 800) }
    if (-not $text) { return $defaultAiPersona }
    return $text
}

function Get-SafeNumber($Value, [double]$Default = 0) {
    if ($null -eq $Value -or $Value -is [bool]) { return $Default }
    try {
        $number = [double]$Value
        if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { return $Default }
        return $number
    }
    catch { return $Default }
}

function Get-SafeBool($Value) {
    if ($Value -is [bool]) { return $Value }
    return $false
}

function Get-StringArray($Value) {
    if ($null -eq $Value) { return }
    @($Value) | Where-Object { $_ -is [string] } | ForEach-Object { [string]$_ }
}

function Get-WordCount([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text)) { return 0 }
    $cjkPattern = '[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]'
    $cjk = [regex]::Matches($Text, $cjkPattern).Count
    $latinText = [regex]::Replace($Text, $cjkPattern, ' ')
    $latin = [regex]::Matches($latinText, "[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*").Count
    return $cjk + $latin
}

function Get-FallbackTime($Value, [double]$Fallback = 0) {
    if ($Fallback -gt 0) { return $Fallback }
    if ($Value -is [DateTime]) { return [DateTimeOffset]::new($Value).ToUnixTimeMilliseconds() }
    return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

function ConvertTo-SafeNote($Note, [double]$FallbackTime = 0) {
    if ($null -eq $Note) { return $null }
    $id = [string]$Note.id
    if (-not (Test-SafeId $id)) { return $null }

    $now = Get-FallbackTime $null $FallbackTime
    $createdAt = Get-SafeNumber $Note.createdAt 0
    $updatedAt = Get-SafeNumber $Note.updatedAt 0
    if ($createdAt -le 0) { $createdAt = if ($updatedAt -gt 0) { $updatedAt } else { $now } }
    if ($updatedAt -le 0) { $updatedAt = $createdAt }
    if ($updatedAt -lt $createdAt) { $updatedAt = $createdAt }

    $topicId = Get-SafeString $Note.topicId
    if (-not (Test-SafeId $topicId)) { $topicId = 'fleeting' }
    $content = Get-SafeString $Note.content

    $activeDates = @(Get-StringArray $Note.activeDates | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}$' })
    $wordCount = Get-SafeNumber $Note.wordCount -1
    if ($wordCount -le 0 -and -not [string]::IsNullOrWhiteSpace($content)) { $wordCount = Get-WordCount $content }
    if ($wordCount -lt 0) { $wordCount = 0 }
    $seconds = Get-SafeNumber $Note.accumulatedWritingSeconds 0
    if ($seconds -lt 0) { $seconds = 0 }

    $result = [ordered]@{
        id = $id
        title = (Get-SafeString $Note.title)
        content = $content
        topicId = $topicId
        tags = @(Get-StringArray $Note.tags)
        createdAt = $createdAt
        updatedAt = $updatedAt
        accumulatedWritingSeconds = $seconds
        wordCount = $wordCount
        pinned = (Get-SafeBool $Note.pinned)
        activeDates = $activeDates
    }
    $deletedAt = Get-SafeNumber $Note.deletedAt 0
    if ($deletedAt -gt 0) { $result['deletedAt'] = $deletedAt }
    return $result
}

function ConvertTo-SafeTopic($Topic, [double]$FallbackTime = 0) {
    if ($null -eq $Topic) { return $null }
    $id = [string]$Topic.id
    if (-not (Test-SafeId $id)) { return $null }

    $now = Get-FallbackTime $null $FallbackTime
    $createdAt = Get-SafeNumber $Topic.createdAt 0
    $updatedAt = Get-SafeNumber $Topic.updatedAt 0
    if ($createdAt -le 0) { $createdAt = if ($updatedAt -gt 0) { $updatedAt } else { $now } }
    if ($updatedAt -le 0) { $updatedAt = $createdAt }

    $name = (Get-SafeString $Topic.name).Trim()
    if (-not $name) { $name = '未命名主题' }
    $color = Get-SafeString $Topic.color
    if ($color -notmatch '^#[0-9A-Fa-f]{6}$') { $color = '#708b82' }

    return [ordered]@{
        id = $id
        name = $name
        color = $color
        builtIn = (Get-SafeBool $Topic.builtIn)
        createdAt = $createdAt
        updatedAt = $updatedAt
    }
}

function ConvertTo-SafeSettings($Value) {
    $settings = [ordered]@{ theme = 'system'; fontSize = 18; interfaceFontSize = 13; lineHeight = 1.9; motion = 'full'; typewriterMode = $false; fontDisplay = ''; fontUi = ''; fontMono = ''; fontWriting = ''; aiEnabled = $true; aiPersona = $defaultAiPersona; aiDefaultRange = '30d'; aiDefaultMode = 'excerpt'; echoSize = 'standard'; showEchoKeywords = $true; showHeatmap = $true; spaces = $defaultSpaces }
    if ($null -eq $Value) { return $settings }

    $theme = Get-SafeString $Value.theme
    if (@('light', 'dark', 'system') -contains $theme) { $settings['theme'] = $theme }
    $fontSize = [Math]::Round((Get-SafeNumber $Value.fontSize 18), 0)
    $settings['fontSize'] = [Math]::Min(32, [Math]::Max(12, $fontSize))
    $interfaceFontSize = [Math]::Round((Get-SafeNumber $Value.interfaceFontSize 13), 0)
    $settings['interfaceFontSize'] = [Math]::Min(20, [Math]::Max(10, $interfaceFontSize))
    $lineHeight = [Math]::Round((Get-SafeNumber $Value.lineHeight 1.9), 2)
    $settings['lineHeight'] = [Math]::Min(2.8, [Math]::Max(1.2, $lineHeight))
    $motion = Get-SafeString $Value.motion
    if (@('full', 'reduced', 'off') -contains $motion) { $settings['motion'] = $motion }
    $settings['typewriterMode'] = (Get-SafeBool $Value.typewriterMode)
    foreach ($field in @('fontDisplay', 'fontUi', 'fontMono', 'fontWriting')) {
        $settings[$field] = Get-SafeFontName $Value.$field
    }
    $settings['aiEnabled'] = $Value.aiEnabled -ne $false
    $settings['aiPersona'] = Get-SafePersona $Value.aiPersona
    $range = Get-SafeString $Value.aiDefaultRange
    if (@('7d', '30d', '90d', 'year', 'all') -contains $range) { $settings['aiDefaultRange'] = $range }
    $readMode = Get-SafeString $Value.aiDefaultMode
    if (@('excerpt', 'full') -contains $readMode) { $settings['aiDefaultMode'] = $readMode }
    $echoSize = Get-SafeString $Value.echoSize
    if (@('small', 'standard', 'large') -contains $echoSize) { $settings['echoSize'] = $echoSize }
    $settings['showEchoKeywords'] = $Value.showEchoKeywords -ne $false
    $settings['showHeatmap'] = $Value.showHeatmap -ne $false
    $settings['spaces'] = @(Get-SafeSpaces $Value.spaces)
    return $settings
}

$script:fontFamilyCache = $null

function Get-InstalledFontFamilies {
    if ($null -ne $script:fontFamilyCache) { return @($script:fontFamilyCache) }
    $names = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    try {
        Add-Type -AssemblyName System.Drawing -ErrorAction Stop
        $collection = New-Object System.Drawing.Text.InstalledFontCollection
        foreach ($family in $collection.Families) {
            $name = [string]$family.Name
            if ([string]::IsNullOrWhiteSpace($name) -or $name.StartsWith('@')) { continue }
            $key = $name.ToLowerInvariant()
            if (-not $seen.ContainsKey($key)) {
                $seen[$key] = $true
                [void]$names.Add($name)
            }
        }
    }
    catch {
        foreach ($key in @('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts', 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts')) {
            if (-not (Test-Path -LiteralPath $key)) { continue }
            $properties = Get-ItemProperty -LiteralPath $key -ErrorAction SilentlyContinue
            foreach ($property in $properties.PSObject.Properties) {
                if ($property.Name -like 'PS*') { continue }
                $name = ($property.Name -replace '\s*\([^)]*\)\s*$', '').Trim()
                foreach ($part in ($name -split '\s*&\s*')) {
                    $part = $part.Trim()
                    if ([string]::IsNullOrWhiteSpace($part)) { continue }
                    $lower = $part.ToLowerInvariant()
                    if (-not $seen.ContainsKey($lower)) {
                        $seen[$lower] = $true
                        [void]$names.Add($part)
                    }
                }
            }
        }
    }

    foreach ($name in @('Anthropic Sans Web Text', 'Anthropic Serif Web Text', 'Anthropic Mono Web', 'LXGW WenKai Local')) {
        $key = $name.ToLowerInvariant()
        if (-not $seen.ContainsKey($key)) {
            $seen[$key] = $true
            [void]$names.Add($name)
        }
    }

    $script:fontFamilyCache = @($names | Sort-Object)
    return @($script:fontFamilyCache)
}

function Get-EntityTimestamp($Entity, [string]$Primary, [string]$Fallback) {
    $value = $Entity.$Primary
    if ($null -eq $value -and $Fallback) { $value = $Entity.$Fallback }
    if ($null -eq $value) { return 0.0 }
    try {
        $number = [double]$value
        if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { return 0.0 }
        return $number
    }
    catch { return 0.0 }
}

function Get-EntityFiles([string]$Directory, [string]$Id) {
    if (-not (Test-SafeId $Id)) { return }
    return @(Get-ChildItem -LiteralPath $Directory -Filter "$Id*.json" -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -eq "$Id.json" -or $_.Name -like "$Id.sync-conflict-*.json" })
}

function Get-LatestEntityForId([string]$Directory, [string]$Id, [string]$PrimaryTimestamp, [string]$FallbackTimestamp = '') {
    $latest = $null
    foreach ($file in @(Get-EntityFiles $Directory $Id)) {
        $entity = Read-JsonFile $file.FullName
        if ($null -eq $entity -or [string]$entity.id -ne $Id -or -not (Test-SafeId ([string]$entity.id))) { continue }
        $timestamp = Get-EntityTimestamp $entity $PrimaryTimestamp $FallbackTimestamp
        if ($null -eq $latest -or $timestamp -gt $latest.Timestamp -or ($timestamp -eq $latest.Timestamp -and $file.LastWriteTimeUtc -gt $latest.FileTime)) {
            $latest = [PSCustomObject]@{ Value = $entity; Timestamp = $timestamp; FileTime = $file.LastWriteTimeUtc }
        }
    }
    return $latest
}

function Get-LatestEntityMap([string]$Directory, [string]$PrimaryTimestamp, [string]$FallbackTimestamp = '') {
    $map = @{}
    foreach ($file in @(Get-ChildItem -LiteralPath $Directory -Filter '*.json' -File -ErrorAction SilentlyContinue)) {
        $entity = Read-JsonFile $file.FullName
        if ($null -eq $entity -or -not (Test-SafeId ([string]$entity.id))) { continue }
        $timestamp = Get-EntityTimestamp $entity $PrimaryTimestamp $FallbackTimestamp
        $existing = $map[[string]$entity.id]
        if ($null -eq $existing -or $timestamp -gt $existing.Timestamp -or ($timestamp -eq $existing.Timestamp -and $file.LastWriteTimeUtc -gt $existing.FileTime)) {
            $map[[string]$entity.id] = [PSCustomObject]@{ Value = $entity; Timestamp = $timestamp; FileTime = $file.LastWriteTimeUtc }
        }
    }
    return $map
}

function Get-DeletionMap([string]$Directory) {
    return Get-LatestEntityMap $Directory 'deletedAt'
}

function Get-DeletionForId([string]$Directory, [string]$Id) {
    return Get-LatestEntityForId $Directory $Id 'deletedAt'
}

function Get-LatestSettingsRecord {
    $latest = $null
    foreach ($file in @(Get-ChildItem -LiteralPath $dataRoot -Filter 'settings*.json' -File -ErrorAction SilentlyContinue)) {
        $record = Read-JsonFile $file.FullName
        if ($null -eq $record -or $null -eq $record.value) { continue }
        $timestamp = Get-EntityTimestamp $record 'updatedAt' ''
        if ($null -eq $latest -or $timestamp -gt $latest.Timestamp -or ($timestamp -eq $latest.Timestamp -and $file.LastWriteTimeUtc -gt $latest.FileTime)) {
            $latest = [PSCustomObject]@{ Value = $record; Timestamp = $timestamp; FileTime = $file.LastWriteTimeUtc }
        }
    }
    return $latest
}

function Get-Snapshot([string]$Space = 'life') {
    $space = Resolve-SpaceId $Space
    $roots = Get-SpaceRoots $space
    $noteMap = Get-LatestEntityMap $roots.notes 'updatedAt' 'createdAt'
    $noteDeletions = Get-DeletionMap $roots.deletions
    $notes = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $noteMap.GetEnumerator()) {
        $deletion = $noteDeletions[$entry.Key]
        if ($null -eq $deletion -or $deletion.Timestamp -lt $entry.Value.Timestamp) {
            $fallback = [DateTimeOffset]::new($entry.Value.FileTime).ToUnixTimeMilliseconds()
            $note = ConvertTo-SafeNote $entry.Value.Value $fallback
            if ($null -ne $note) { $notes.Add($note) }
        }
    }

    $topicMap = Get-LatestEntityMap $roots.topics 'updatedAt' 'createdAt'
    $topicDeletions = Get-DeletionMap $roots.topicDeletions
    $topics = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in $topicMap.GetEnumerator()) {
        $deletion = $topicDeletions[$entry.Key]
        if ($null -eq $deletion -or $deletion.Timestamp -lt $entry.Value.Timestamp) {
            $fallback = [DateTimeOffset]::new($entry.Value.FileTime).ToUnixTimeMilliseconds()
            $topic = ConvertTo-SafeTopic $entry.Value.Value $fallback
            if ($null -ne $topic) { $topics.Add($topic) }
        }
    }

    $settingsRecord = Get-LatestSettingsRecord
    $settingsValue = if ($null -ne $settingsRecord) { $settingsRecord.Value.value } else { $defaultSettings }
    return [ordered]@{ space = $space; instanceId = (Get-InstanceId); notes = @($notes); topics = @($topics); settings = (ConvertTo-SafeSettings $settingsValue) }
}

function Save-Note($Note, [string]$Space = 'life') {
    if ($null -eq $Note) { throw 'Invalid note data.' }
    $incomingTime = Get-SafeNumber $Note.updatedAt -1
    if ($incomingTime -le 0) { throw 'Invalid note data.' }
    $safe = ConvertTo-SafeNote $Note $incomingTime
    if ($null -eq $safe) { throw 'Invalid note data.' }
    $id = [string]$safe['id']
    $resolvedSpace = Resolve-SpaceId $Space
    $configuredIds = Get-ConfiguredSpaceIds
    if ($configuredIds -contains [string]$safe['topicId']) { $resolvedSpace = [string]$safe['topicId'] }
    # 空间隔离闸门：同一 id 已存在于其他空间时拒绝写入，防止缓存混存导致跨空间复制
    foreach ($other in $configuredIds) {
        if ($other -eq $resolvedSpace) { continue }
        $otherRoots = Get-SpaceRoots $other
        if (Get-LatestEntityForId $otherRoots.notes $id 'updatedAt' 'createdAt') { return }
    }
    $roots = Get-SpaceRoots $resolvedSpace

    $deletion = Get-DeletionForId $roots.deletions $id
    if ($null -ne $deletion -and $deletion.Timestamp -ge $incomingTime) { return }

    $existing = Get-LatestEntityForId $roots.notes $id 'updatedAt' 'createdAt'
    if ($null -eq $existing -or $incomingTime -ge $existing.Timestamp) {
        Write-JsonAtomic (Join-Path $roots.notes "$id.json") $safe
    }
}

function Save-Topic($Topic, [string]$Space = 'life') {
    if ($null -eq $Topic) { throw 'Invalid topic data.' }
    $incomingTime = Get-SafeNumber $Topic.updatedAt 0
    if ($incomingTime -le 0) { $incomingTime = Get-SafeNumber $Topic.createdAt -1 }
    if ($incomingTime -le 0) { throw 'Invalid topic data.' }
    $safe = ConvertTo-SafeTopic $Topic $incomingTime
    if ($null -eq $safe) { throw 'Invalid topic data.' }
    $id = [string]$safe['id']
    $resolvedSpace = Resolve-SpaceId $Space
    $configuredIds = Get-ConfiguredSpaceIds
    if ($configuredIds -contains $id) { $resolvedSpace = $id }
    # 空间隔离闸门：主题已存在于其他空间时拒绝重复写入
    foreach ($other in $configuredIds) {
        if ($other -eq $resolvedSpace) { continue }
        $otherRoots = Get-SpaceRoots $other
        if (Get-LatestEntityForId $otherRoots.topics $id 'updatedAt' 'createdAt') { return }
    }
    $roots = Get-SpaceRoots $resolvedSpace

    $deletion = Get-DeletionForId $roots.topicDeletions $id
    if ($null -ne $deletion -and $deletion.Timestamp -ge $incomingTime) { return }

    $existing = Get-LatestEntityForId $roots.topics $id 'updatedAt' 'createdAt'
    if ($null -eq $existing -or $incomingTime -ge $existing.Timestamp) {
        Write-JsonAtomic (Join-Path $roots.topics "$id.json") $safe
    }
}

function Save-Settings($Record, [bool]$OnlyWhenMissing = $false) {
    if ($null -eq $Record -or $null -eq $Record.value) { throw 'Invalid settings data.' }
    $existing = Get-LatestSettingsRecord
    if ($OnlyWhenMissing -and $null -ne $existing) { return }
    $incomingTime = Get-EntityTimestamp $Record 'updatedAt' ''
    if ($incomingTime -le 0) { $incomingTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    if ($null -eq $existing -or $incomingTime -ge $existing.Timestamp) {
        $safe = ConvertTo-SafeSettings $Record.value
        Write-JsonAtomic (Join-Path $dataRoot 'settings.json') ([ordered]@{ updatedAt = $incomingTime; value = $safe })
        # 空间列表可能变化：刷新缓存并准备好新空间目录
        $script:configuredSpaces = $null
        foreach ($space in (Get-ConfiguredSpaceIds)) { Ensure-SpaceTopics $space }
    }
}

function Save-Deletion([string]$Directory, $Record) {
    if ($null -eq $Record) { throw 'Invalid deletion marker.' }
    $id = [string]$Record.id
    if (-not (Test-SafeId $id)) { throw 'Invalid deletion marker.' }
    $deletedAt = Get-SafeNumber $Record.deletedAt 0
    if ($deletedAt -le 0) { $deletedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
    $existing = Get-DeletionForId $Directory $id
    if ($null -eq $existing -or $deletedAt -ge $existing.Timestamp) {
        Write-JsonAtomic (Join-Path $Directory "$id.json") ([ordered]@{ id = $id; deletedAt = $deletedAt })
    }
}

$defaultSpaceTopics = [ordered]@{
    life = @(
        [ordered]@{ id = 'fleeting'; name = '闪念'; color = '#708b82'; builtIn = $true; createdAt = 1 },
        [ordered]@{ id = 'essay'; name = '随笔'; color = '#9a846c'; builtIn = $true; createdAt = 2 },
        [ordered]@{ id = 'diary'; name = '日记'; color = '#8a7f91'; builtIn = $true; createdAt = 3 }
    )
    research = @(
        [ordered]@{ id = 'research'; name = '研究'; color = '#718397'; builtIn = $true; createdAt = 1 }
    )
}

function Ensure-SpaceTopics([string]$Space) {
    $space = Resolve-SpaceId $Space
    $roots = Get-SpaceRoots $space
    $defaults = $defaultSpaceTopics[$space]
    if ($null -eq $defaults) {
        $defaults = @([ordered]@{ id = 'inbox'; name = '默认'; color = '#8d766d'; builtIn = $true; createdAt = 1 })
    }
    foreach ($topic in @($defaults)) {
        $path = Join-Path $roots.topics "$($topic.id).json"
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $record = [ordered]@{}
            foreach ($key in $topic.Keys) { $record[$key] = $topic[$key] }
            $record['updatedAt'] = [double]$topic.createdAt
            Write-JsonAtomic $path $record
        }
    }
}

function Remove-LifeResearchTopic {
    if ((Get-ConfiguredSpaceIds) -notcontains 'life') { return }
    $roots = Get-SpaceRoots 'life'
    $path = Join-Path $roots.topics 'research.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return }
    $noteMap = Get-LatestEntityMap $roots.notes 'updatedAt' 'createdAt'
    foreach ($entry in $noteMap.GetEnumerator()) {
        if ([string]$entry.Value.Value.topicId -eq 'research') { return }
    }
    Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
}

function Initialize-Spaces {
    $marker = Join-Path $spacesRoot 'spaces-v2.json'
    $configuredIds = Get-ConfiguredSpaceIds
    if (Test-Path -LiteralPath $marker -PathType Leaf) {
        foreach ($space in $configuredIds) { Ensure-SpaceTopics $space }
        Remove-LifeResearchTopic
        return
    }

    $legacyNotes = Get-LatestEntityMap $notesRoot 'updatedAt' 'createdAt'
    $legacyTopics = Get-LatestEntityMap $topicsRoot 'updatedAt' 'createdAt'
    $fallback = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

    foreach ($entry in $legacyTopics.GetEnumerator()) {
        $topic = ConvertTo-SafeTopic $entry.Value.Value ([DateTimeOffset]::new($entry.Value.FileTime).ToUnixTimeMilliseconds())
        if ($null -eq $topic) { continue }
        $space = if ([string]$topic.id -eq 'research') { 'research' } else { 'life' }
        $roots = Get-SpaceRoots $space
        Write-JsonAtomic (Join-Path $roots.topics "$($topic.id).json") $topic
    }
    foreach ($space in $configuredIds) { Ensure-SpaceTopics $space }

    foreach ($entry in $legacyNotes.GetEnumerator()) {
        $note = ConvertTo-SafeNote $entry.Value.Value ([DateTimeOffset]::new($entry.Value.FileTime).ToUnixTimeMilliseconds())
        if ($null -eq $note) { continue }
        $space = if ([string]$note.topicId -eq 'research') { 'research' } else { 'life' }
        $roots = Get-SpaceRoots $space
        Write-JsonAtomic (Join-Path $roots.notes "$($note.id).json") $note
    }

    foreach ($space in $configuredIds) {
        $roots = Get-SpaceRoots $space
        foreach ($directory in @($roots.deletions, $roots.topicDeletions)) {
            $source = if ($directory -eq $roots.deletions) { $deletionsRoot } else { $topicDeletionsRoot }
            foreach ($file in @(Get-ChildItem -LiteralPath $source -Filter '*.json' -File -ErrorAction SilentlyContinue)) {
                Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $directory $file.Name) -Force -ErrorAction SilentlyContinue
            }
        }
    }

    Write-JsonAtomic $marker ([ordered]@{ version = 2; migratedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() })
}

Initialize-Spaces

function Get-SyncRevision([string]$Space = 'life') {
    $roots = Get-SpaceRoots $Space
    $files = [System.Collections.Generic.List[object]]::new()
    foreach ($directory in @($roots.notes, $roots.topics, $roots.deletions, $roots.topicDeletions)) {
        foreach ($file in @(Get-ChildItem -LiteralPath $directory -Filter '*.json' -File -ErrorAction SilentlyContinue)) {
            $relative = $file.FullName.Substring($dataRoot.Length).TrimStart('\', '/').Replace('\', '/')
            $files.Add([PSCustomObject]@{ Relative = $relative; Length = $file.Length; Ticks = $file.LastWriteTimeUtc.Ticks })
        }
    }
    foreach ($file in @(Get-ChildItem -LiteralPath $dataRoot -Filter 'settings*.json' -File -ErrorAction SilentlyContinue)) {
        $relative = $file.Name
        $files.Add([PSCustomObject]@{ Relative = $relative; Length = $file.Length; Ticks = $file.LastWriteTimeUtc.Ticks })
    }

    $manifest = [Text.StringBuilder]::new()
    foreach ($file in @($files | Sort-Object Relative)) {
        [void]$manifest.Append($file.Relative).Append(':').Append($file.Length).Append(':').Append($file.Ticks).Append("`n")
    }
    $hash = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($manifest.ToString()))).Replace('-', '').ToLowerInvariant()
    }
    finally { $hash.Dispose() }
}

function Get-HostTag {
    $name = [Environment]::MachineName
    if ([string]::IsNullOrWhiteSpace($name)) { return 'pc' }
    $tag = ($name -replace '[^A-Za-z0-9_-]', '-').Trim('-')
    if (-not $tag) { return 'pc' }
    return $tag.Substring(0, [Math]::Min(32, $tag.Length))
}

function Get-BackupInfo([string]$Path) {
    $item = Get-Item -LiteralPath $Path
    $reason = 'backup'
    if ($item.Name -match '^suiji-backup-(daily|manual|before-restore|before-import)-') { $reason = $Matches[1] }
    return [ordered]@{
        name = $item.Name
        size = $item.Length
        modifiedAt = [DateTimeOffset]::new($item.LastWriteTimeUtc).ToUnixTimeMilliseconds()
        reason = $reason
        created = $false
    }
}

function Get-BackupList {
    $files = @(Get-ChildItem -LiteralPath $backupsRoot -Filter 'suiji-backup-*.json' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 60)
    return @(foreach ($file in $files) { Get-BackupInfo $file.FullName })
}

function Get-BackupPath([string]$Name) {
    if ([string]::IsNullOrWhiteSpace($Name)) { return $null }
    if ($Name -notmatch '^suiji-backup-[A-Za-z0-9._-]+\.json$') { return $null }
    $prefix = [IO.Path]::GetFullPath($backupsRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    $candidate = [IO.Path]::GetFullPath((Join-Path $backupsRoot $Name))
    if (-not $candidate.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $null }
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $null }
    return $candidate
}

function Remove-OldBackups {
    $cutoff = (Get-Date).AddDays(-$backupRetentionDays)
    $files = @(Get-ChildItem -LiteralPath $backupsRoot -Filter 'suiji-backup-*.json' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending)
    for ($index = 0; $index -lt $files.Count; $index++) {
        if ($index -lt 7) { continue }
        if ($index -ge 200 -or $files[$index].LastWriteTime -lt $cutoff) {
            try { Remove-Item -LiteralPath $files[$index].FullName -Force -ErrorAction Stop } catch { }
        }
    }
}

function Get-InstanceId {
    # 每个数据目录一个稳定标识：浏览器缓存若来自别的数据目录，客户端据此丢弃缓存
    if ($script:instanceId) { return $script:instanceId }
    $path = Join-Path $dataRoot 'instance.json'
    $id = ''
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        try { $id = [string](Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json).id } catch { $id = '' }
    }
    if ($id -notmatch '^[0-9a-f]{32}$') {
        $id = [Guid]::NewGuid().ToString('N')
        Write-JsonAtomic $path ([ordered]@{ id = $id; createdAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() })
    }
    $script:instanceId = $id
    return $id
}

function Get-CombinedSnapshot {
    $spaces = [ordered]@{}
    foreach ($space in (Get-ConfiguredSpaceIds)) {
        $snapshot = Get-Snapshot $space
        $spaces[$space] = [ordered]@{ notes = @($snapshot.notes); topics = @($snapshot.topics) }
    }
    $firstSpace = (Get-ConfiguredSpaceIds)[0]
    $settings = (Get-Snapshot $firstSpace).settings
    return [ordered]@{ instanceId = (Get-InstanceId); spaces = $spaces; settings = $settings }
}

function New-Backup([string]$Reason = 'manual', [switch]$Force) {
    if ($Reason -notmatch '^[a-z][a-z-]{0,19}$') { $Reason = 'manual' }
    $hostTag = Get-HostTag
    $now = Get-Date
    if ($Reason -eq 'daily') {
        $name = "suiji-backup-daily-$($now.ToString('yyyy-MM-dd'))-$hostTag.json"
    }
    else {
        $name = "suiji-backup-$Reason-$($now.ToString('yyyyMMdd-HHmmss'))-$hostTag.json"
    }
    $path = Join-Path $backupsRoot $name
    if (-not $Force -and (Test-Path -LiteralPath $path -PathType Leaf) -and (Get-Item -LiteralPath $path).Length -gt 0) {
        return Get-BackupInfo $path
    }
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $name = "suiji-backup-$Reason-$($now.ToString('yyyyMMdd-HHmmss'))-$hostTag-$([Guid]::NewGuid().ToString('N').Substring(0, 6)).json"
        $path = Join-Path $backupsRoot $name
    }

    $snapshot = Get-CombinedSnapshot
    $backup = [ordered]@{
        version = 2
        exportedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        spaces = $snapshot.spaces
        settings = $snapshot.settings
        meta = [ordered]@{ reason = $Reason; host = $hostTag }
    }
    Write-JsonAtomic $path $backup
    Remove-OldBackups
    $info = Get-BackupInfo $path
    $info['created'] = $true
    return $info
}

function Restore-SpaceItems([string]$Space, $Notes, $Topics, [double]$Now) {
    $roots = Get-SpaceRoots $Space
    $restoredNotes = 0
    foreach ($item in @($Notes)) {
        $note = ConvertTo-SafeNote $item $Now
        if ($null -eq $note) { continue }
        $note['updatedAt'] = $Now
        if ([double]$note['createdAt'] -le 0) { $note['createdAt'] = $Now }
        $id = [string]$note['id']
        Write-JsonAtomic (Join-Path $roots.notes "$id.json") $note
        foreach ($deletionFile in @(Get-EntityFiles $roots.deletions $id)) {
            Remove-Item -LiteralPath $deletionFile.FullName -Force -ErrorAction SilentlyContinue
        }
        $restoredNotes++
    }

    $restoredTopics = 0
    foreach ($item in @($Topics)) {
        $topic = ConvertTo-SafeTopic $item $Now
        if ($null -eq $topic) { continue }
        $topic['updatedAt'] = $Now
        if ([double]$topic['createdAt'] -le 0) { $topic['createdAt'] = $Now }
        $id = [string]$topic['id']
        Write-JsonAtomic (Join-Path $roots.topics "$id.json") $topic
        foreach ($deletionFile in @(Get-EntityFiles $roots.topicDeletions $id)) {
            Remove-Item -LiteralPath $deletionFile.FullName -Force -ErrorAction SilentlyContinue
        }
        $restoredTopics++
    }
    Ensure-SpaceTopics $Space
    return [ordered]@{ notes = $restoredNotes; topics = $restoredTopics }
}

function Restore-Backup([string]$Name) {
    $path = Get-BackupPath $Name
    if ($null -eq $path) { throw '找不到备份文件。' }
    $backup = Read-JsonFile $path
    if ($null -eq $backup -or ($backup.version -ne 1 -and $backup.version -ne 2)) { throw '备份文件格式无效。' }
    if ($null -eq $backup.settings) { throw '备份内容不完整。' }
    if ($backup.version -eq 2 -and $null -eq $backup.spaces) { throw '备份内容不完整。' }
    if ($backup.version -eq 1 -and ($null -eq $backup.notes -or $null -eq $backup.topics)) { throw '备份内容不完整。' }

    $safety = New-Backup 'before-restore' -Force
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $restoredNotes = 0
    $restoredTopics = 0

    if ($backup.version -eq 2) {
        foreach ($space in (Get-ConfiguredSpaceIds)) {
            $spaceBackup = $backup.spaces.$space
            if ($null -eq $spaceBackup) { continue }
            $restored = Restore-SpaceItems $space $spaceBackup.notes $spaceBackup.topics $now
            $restoredNotes += [int]$restored.notes
            $restoredTopics += [int]$restored.topics
        }
    }
    else {
        $legacyNotes = [System.Collections.Generic.List[object]]::new()
        $legacyTopics = @{}
        foreach ($space in (Get-ConfiguredSpaceIds)) { $legacyTopics[$space] = [System.Collections.Generic.List[object]]::new() }
        foreach ($item in @($backup.notes)) { $legacyNotes.Add($item) }
        foreach ($item in @($backup.topics)) {
            $topic = ConvertTo-SafeTopic $item $now
            if ($null -eq $topic) { continue }
            $space = if ((Get-ConfiguredSpaceIds) -contains [string]$topic.id) { [string]$topic.id } else { (Get-ConfiguredSpaceIds)[0] }
            $legacyTopics[$space].Add($topic)
        }
        foreach ($space in (Get-ConfiguredSpaceIds)) {
            $notesForSpace = @($legacyNotes | Where-Object {
                $topicId = [string]$_.topicId
                if ((Get-ConfiguredSpaceIds) -contains $topicId) { $topicId -eq $space } else { $space -eq (Get-ConfiguredSpaceIds)[0] }
            })
            $restored = Restore-SpaceItems $space $notesForSpace $legacyTopics[$space] $now
            $restoredNotes += [int]$restored.notes
            $restoredTopics += [int]$restored.topics
        }
    }

    Write-JsonAtomic (Join-Path $dataRoot 'settings.json') ([ordered]@{ updatedAt = $now; value = (ConvertTo-SafeSettings $backup.settings) })
    return [ordered]@{ ok = $true; notes = $restoredNotes; topics = $restoredTopics; safetyBackup = $safety.name }
}

# AI 配置按数据目录隔离：同一台电脑上的多个安装（如自用版与开源版）不共享 Key
if (-not $env:SUIJI_AI_CONFIG) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $digest = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($dataRoot.ToLowerInvariant()))
        $tag = -join ($digest[0..3] | ForEach-Object { $_.ToString('x2') })
    }
    finally { $sha.Dispose() }
    $configDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) (Join-Path 'Suiji' $tag)
    $env:SUIJI_AI_CONFIG = Join-Path $configDir 'ai-config.json'
}

. (Join-Path $PSScriptRoot 'ai-suiji.ps1')

function ConvertTo-JsonBytes($Value) {
    return $utf8.GetBytes(($Value | ConvertTo-Json -Depth 30))
}

function Read-HttpRequest([IO.Stream]$Stream) {
    $memory = [IO.MemoryStream]::new()
    $buffer = New-Object byte[] 8192
    $headerEnd = -1
    while ($headerEnd -lt 0) {
        $read = $Stream.Read($buffer, 0, $buffer.Length)
        if ($read -le 0) { return $null }
        $memory.Write($buffer, 0, $read)
        if ($memory.Length -gt 65536) { throw 'Request headers are too large.' }
        $bytes = $memory.ToArray()
        for ($index = [Math]::Max(0, $bytes.Length - $read - 4); $index -le $bytes.Length - 4; $index++) {
            if ($bytes[$index] -eq 13 -and $bytes[$index + 1] -eq 10 -and $bytes[$index + 2] -eq 13 -and $bytes[$index + 3] -eq 10) { $headerEnd = $index; break }
        }
    }

    $allBytes = $memory.ToArray()
    $headerText = [Text.Encoding]::ASCII.GetString($allBytes, 0, $headerEnd)
    $lines = $headerText -split "`r`n"
    $requestParts = $lines[0].Split(' ')
    if ($requestParts.Length -lt 2) { throw 'Invalid request line.' }
    $headers = @{}
    foreach ($line in $lines | Select-Object -Skip 1) {
        $separator = $line.IndexOf(':')
        if ($separator -gt 0) { $headers[$line.Substring(0, $separator).Trim().ToLowerInvariant()] = $line.Substring($separator + 1).Trim() }
    }
    $contentLength = 0
    if ($headers.ContainsKey('content-length')) { $contentLength = [int]$headers['content-length'] }
    if ($contentLength -lt 0 -or $contentLength -gt 50MB) { throw 'Request body is too large.' }
    $bodyStart = $headerEnd + 4
    while ($memory.Length -lt $bodyStart + $contentLength) {
        $remaining = [int][Math]::Min($buffer.Length, $bodyStart + $contentLength - $memory.Length)
        $read = $Stream.Read($buffer, 0, $remaining)
        if ($read -le 0) { throw 'Incomplete request body.' }
        $memory.Write($buffer, 0, $read)
    }
    $allBytes = $memory.ToArray()
    $body = if ($contentLength) { $utf8.GetString($allBytes, $bodyStart, $contentLength) } else { '' }
    return [PSCustomObject]@{ Method = $requestParts[0].ToUpperInvariant(); Target = $requestParts[1]; Body = $body; Headers = $headers }
}

function Send-Response([IO.Stream]$Stream, [int]$Status, [string]$Reason, [string]$ContentType, [byte[]]$Body, [string]$CacheControl = 'no-store') {
    $header = "HTTP/1.1 $Status $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: $CacheControl`r`nX-Content-Type-Options: nosniff`r`nConnection: close`r`n`r`n"
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length) { $Stream.Write($Body, 0, $Body.Length) }
    $Stream.Flush()
}

function Get-QueryValue([string]$Target, [string]$Key) {
    $queryIndex = $Target.IndexOf('?')
    if ($queryIndex -lt 0) { return '' }
    $query = $Target.Substring($queryIndex + 1)
    foreach ($pair in $query.Split('&')) {
        $equals = $pair.IndexOf('=')
        if ($equals -lt 0) { continue }
        if ($pair.Substring(0, $equals) -eq $Key) {
            return [Uri]::UnescapeDataString($pair.Substring($equals + 1))
        }
    }
    return ''
}

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'; '.ttf' = 'font/ttf'; '.woff2' = 'font/woff2'
}

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()
$script:shutdownRequested = $false

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $stream.ReadTimeout = 5000
            $stream.WriteTimeout = 5000
            $request = Read-HttpRequest $stream
            if ($null -eq $request) { continue }
            $requestPath = [Uri]::UnescapeDataString($request.Target.Split('?')[0])

            if ($requestPath.StartsWith('/api/')) {
                if (-not (Test-LocalRequest $request)) {
                    Send-Response $stream 403 'Forbidden' 'text/plain; charset=utf-8' ($utf8.GetBytes('Forbidden'))
                    continue
                }
                try {
                    $payload = if ($request.Body) { $request.Body | ConvertFrom-Json } else { $null }
                    if ($request.Method -eq 'GET' -and $requestPath -eq '/api/health') {
                        $result = [ordered]@{ ok = $true; sourceHash = $sourceHash }
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/fonts') {
                        $result = [ordered]@{ fonts = @(Get-InstalledFontFamilies) }
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/sync/revision') {
                        $space = Resolve-SpaceId (Get-QueryValue $request.Target 'space')
                        $result = [ordered]@{ revision = (Get-SyncRevision $space); space = $space; instanceId = (Get-InstanceId) }
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/sync/snapshot') {
                        $space = Resolve-SpaceId (Get-QueryValue $request.Target 'space')
                        $result = Get-Snapshot $space
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/sync/merge') {
                        $configured = Get-ConfiguredSpaceIds
                        $requestedSpace = if ($null -ne $payload) { Get-SafeString $payload.space } else { '' }
                        if ($configured -notcontains $requestedSpace) {
                            $fallbackSpace = $configured[0]
                            $researchSpace = if ($configured -contains 'research') { 'research' } else { $fallbackSpace }
                            foreach ($note in @($payload.notes)) {
                                $target = if ([string]$note.topicId -eq $researchSpace -and $researchSpace -ne $fallbackSpace) { $researchSpace } else { $fallbackSpace }
                                Save-Note $note $target
                            }
                            foreach ($topic in @($payload.topics)) {
                                $target = if ($configured -contains [string]$topic.id) { [string]$topic.id } else { $fallbackSpace }
                                Save-Topic $topic $target
                            }
                            Save-Settings ([PSCustomObject]@{ value = $payload.settings; updatedAt = 0 }) $true
                            $result = Get-Snapshot $fallbackSpace
                        }
                        else {
                            $space = $requestedSpace
                            foreach ($note in @($payload.notes)) { Save-Note $note $space }
                            foreach ($topic in @($payload.topics)) { Save-Topic $topic $space }
                            Save-Settings ([PSCustomObject]@{ value = $payload.settings; updatedAt = 0 }) $true
                            $result = Get-Snapshot $space
                        }
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/sync/note') { $space = Get-PayloadSpace $payload; Save-Note $payload $space; $result = @{ ok = $true } }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/sync/note/delete') { $space = Get-PayloadSpace $payload; $roots = Get-SpaceRoots $space; Save-Deletion $roots.deletions $payload; $result = @{ ok = $true } }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/sync/topic') { $space = Get-PayloadSpace $payload; Save-Topic $payload $space; $result = @{ ok = $true } }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/sync/topic/delete') { $space = Get-PayloadSpace $payload; $roots = Get-SpaceRoots $space; Save-Deletion $roots.topicDeletions $payload; $result = @{ ok = $true } }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/sync/settings') { Save-Settings $payload; $result = @{ ok = $true } }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/backup/daily') {
                        $backup = New-Backup 'daily'
                        $result = [ordered]@{ created = [bool]$backup['created']; backup = $backup }
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/backup/create') {
                        $reason = if ($null -ne $payload -and $payload.reason) { [string]$payload.reason } else { 'manual' }
                        $result = [ordered]@{ backup = (New-Backup $reason) }
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/backup/list') {
                        $result = [ordered]@{ backups = @(Get-BackupList) }
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/backup/file') {
                        $backupPath = Get-BackupPath (Get-QueryValue $request.Target 'name')
                        if ($null -eq $backupPath) {
                            Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' ($utf8.GetBytes('Not Found'))
                            continue
                        }
                        Send-Response $stream 200 'OK' 'application/json; charset=utf-8' ([IO.File]::ReadAllBytes($backupPath))
                        continue
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/backup/restore') {
                        $name = if ($null -ne $payload) { [string]$payload.name } else { '' }
                        $result = Restore-Backup $name
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/ai/config') {
                        $result = Get-AiConfigStatus
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/ai/config') {
                        $result = Set-AiConfig $payload
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/ai/reviews') {
                        $result = [ordered]@{ reviews = @(Get-AiReviewList) }
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/ai/review') {
                        $config = Get-AiConfig
                        if (-not $config.Configured) {
                            throw "还没有配置 API Key。请在 $($config.Path) 中填写 apiKey，保存后重新检测。"
                        }
                        $range = if ($null -ne $payload -and $payload.range) { [string]$payload.range } else { '30d' }
                        $mode = if ($null -ne $payload -and $payload.mode) { [string]$payload.mode } else { 'excerpt' }
                        $topicId = if ($null -ne $payload -and $payload.topicId) { [string]$payload.topicId } else { 'all' }
                        if (@('7d', '30d', '90d', 'year', 'all') -notcontains $range) { $range = '30d' }
                        if (@('excerpt', 'full') -notcontains $mode) { $mode = 'excerpt' }
                        if ($topicId -ne 'all' -and -not (Test-SafeId $topicId)) { $topicId = 'all' }
                        $personaValue = if ($null -ne $payload -and $null -ne $payload.persona) { $payload.persona } else { '' }
                        $persona = Get-SafePersona $personaValue
                        $context = Get-AiReviewContext $range $mode $topicId
                        $context | Add-Member -NotePropertyName Persona -NotePropertyValue $persona -Force
                        $jobId = Start-AiReviewJob $context $config
                        $result = [ordered]@{
                            id = $jobId
                            noteCount = $context.NoteCount
                            charCount = $context.CharCount
                            omitted = $context.Omitted
                            rangeLabel = $context.RangeLabel
                            endpointHost = (Get-AiEndpointHost $config.Endpoint)
                        }
                    }
                    elseif ($request.Method -eq 'GET' -and $requestPath -eq '/api/ai/review/status') {
                        $result = Get-AiReviewStatus (Get-QueryValue $request.Target 'id')
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/ai/review/delete') {
                        $id = if ($null -ne $payload) { [string]$payload.id } else { '' }
                        Remove-AiReview $id
                        $result = @{ ok = $true }
                    }
                    elseif ($request.Method -eq 'POST' -and $requestPath -eq '/api/app/shutdown') {
                        $script:shutdownRequested = $true
                        $result = [ordered]@{ ok = $true }
                    }
                    else {
                        Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' ($utf8.GetBytes('Not Found'))
                        continue
                    }
                    Send-Response $stream 200 'OK' 'application/json; charset=utf-8' (ConvertTo-JsonBytes $result)
                }
                catch { Send-Response $stream 400 'Bad Request' 'text/plain; charset=utf-8' ($utf8.GetBytes($_.Exception.Message)) }
                if ($script:shutdownRequested) { break }
                continue
            }

            $relativePath = $requestPath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
            if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
            $filePath = [IO.Path]::GetFullPath((Join-Path $rootPath $relativePath))
            $allowed = $filePath.StartsWith($rootPath, [StringComparison]::OrdinalIgnoreCase)
            if ($allowed -and (Test-Path -LiteralPath $filePath -PathType Container)) { $filePath = Join-Path $filePath 'index.html' }
            if ($allowed -and -not (Test-Path -LiteralPath $filePath -PathType Leaf) -and -not [IO.Path]::GetExtension($relativePath)) { $filePath = Join-Path $rootPath 'index.html' }

            if (-not $allowed -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) { Send-Response $stream 404 'Not Found' 'text/plain; charset=utf-8' ($utf8.GetBytes('Not Found')) }
            else {
                $body = [IO.File]::ReadAllBytes($filePath)
                $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
                $contentType = $mimeTypes[$extension]
                if (-not $contentType) { $contentType = 'application/octet-stream' }
                $cacheControl = if ($extension -in @('.html', '.webmanifest') -or [IO.Path]::GetFileName($filePath) -eq 'sw.js') { 'no-cache' } else { 'public, max-age=31536000, immutable' }
                if ($request.Method -eq 'HEAD') { $body = New-Object byte[] 0 }
                Send-Response $stream 200 'OK' $contentType $body $cacheControl
            }
        }
        catch { try { Send-Response $stream 500 'Internal Server Error' 'text/plain; charset=utf-8' ($utf8.GetBytes('Internal Server Error')) } catch { } }
        finally { $client.Close() }
    }
}
finally { $listener.Stop() }

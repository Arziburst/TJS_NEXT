#Requires -Version 7
# Shared helpers for the per-task Supabase stacks. Dot-source it: . "$PSScriptRoot/TjsStack.ps1"
# Stack ids are "tjs-main" (main checkout) and "tjs-<n>" (worktree of task n); nothing here ever
# operates on a stack whose id does not match ^tjs-\d+$.

Set-StrictMode -Version Latest

$script:TjsMainProjectId = 'tjs-main'
$script:TjsMainPortBase = 40900
$script:TjsWorktreePortBase = 41000
$script:TjsPortOffsets = [ordered]@{
    shadow    = 0
    api       = 1
    db        = 2
    studio    = 3
    mail      = 4
    analytics = 7
    pooler    = 9
}
# [edge_runtime] inspector_port: the CLI default in the committed config.toml (the main stack), base + 8
# per worktree stack so two stacks never share it. Bound only by `supabase functions serve --inspect`.
$script:TjsMainInspectorPort = 8083
$script:TjsInspectorOffset = 8

function Get-TjsRepoRoot {
    (Resolve-Path (Join-Path $PSScriptRoot '..' '..')).Path
}

function Get-TjsIssueNumber {
    param([Parameter(Mandatory)][string]$FolderName)
    # Only the leading number of "<n>-<type>-<slug>": a bare \d+ would read the 2 out of "admin-v2".
    if ($FolderName -match '^(\d+)(?:-|$)') {
        $n = [int]$Matches[1]
        if ($n -ge 1) { return $n }
    }
    throw "Cannot read a task number from the folder '$FolderName' (expected '<n>-<type>-<slug>'). Pass -IssueNumber <n>."
}

function Resolve-TjsIssueNumber {
    param([int]$IssueNumber, [Parameter(Mandatory)][string]$RepoRoot)
    if ($IssueNumber -gt 0) { return $IssueNumber }
    Get-TjsIssueNumber -FolderName (Split-Path $RepoRoot -Leaf)
}

function Get-TjsStackPorts {
    param([Parameter(Mandatory)][int]$IssueNumber)
    if ($IssueNumber -lt 1) { throw "Task number must be 1 or more, got $IssueNumber." }
    $devPort = 3000 + $IssueNumber
    if ($devPort -gt 65535) { throw "Dev port $devPort is out of range." }
    $base = $script:TjsWorktreePortBase + ($IssueNumber % 200) * 10
    $ports = [ordered]@{ base = $base }
    foreach ($k in $script:TjsPortOffsets.Keys) { $ports[$k] = $base + $script:TjsPortOffsets[$k] }
    $ports['inspector'] = $base + $script:TjsInspectorOffset
    $ports['dev'] = $devPort
    $ports
}

function Get-TjsMainPorts {
    $ports = [ordered]@{ base = $script:TjsMainPortBase }
    foreach ($k in $script:TjsPortOffsets.Keys) { $ports[$k] = $script:TjsMainPortBase + $script:TjsPortOffsets[$k] }
    $ports['inspector'] = $script:TjsMainInspectorPort
    $ports['dev'] = 3000
    $ports
}

function Test-TjsLinkedWorktree {
    # A linked worktree has its own git dir under <common>/worktrees/<name>; the main checkout's git dir
    # is the common dir itself.
    param([Parameter(Mandatory)][string]$Path)
    $out = & git -C $Path rev-parse --path-format=absolute --git-dir --git-common-dir 2>$null
    if ($LASTEXITCODE -eq 0 -and @($out).Count -eq 2) {
        $gitDir = [IO.Path]::GetFullPath($out[0]).TrimEnd('\', '/')
        $commonDir = [IO.Path]::GetFullPath($out[1]).TrimEnd('\', '/')
        return -not [string]::Equals($gitDir, $commonDir, [StringComparison]::OrdinalIgnoreCase)
    }
    # git unavailable: fall back to the worktree folder convention.
    $Path -match '[\\/]\.claude[\\/]worktrees[\\/]'
}

function Get-TjsConfigProjectId {
    param([Parameter(Mandatory)][string]$ConfigPath)
    $content = Get-Content -LiteralPath $ConfigPath -Raw
    if ($content -match '(?m)^project_id\s*=\s*"([^"]+)"') { return $Matches[1] }
    throw "No top-level project_id in $ConfigPath."
}

function ConvertFrom-TjsStatusEnv {
    # The KEY="value" lines of `supabase status -o env`, as an ordered map; the values the app needs must be there.
    param([Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Lines)
    $values = [ordered]@{}
    foreach ($line in $Lines) {
        if ($line -match '^([A-Z][A-Z0-9_]*)="?(.*?)"?\s*$') { $values[$Matches[1]] = $Matches[2] }
    }
    foreach ($required in 'API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY') {
        if (-not $values.Contains($required)) { throw "supabase status -o env returned no ${required}:`n$($Lines -join "`n")" }
    }
    $values
}

function Get-TjsAppEnvLines {
    # .env lines for a stack: every status value, then the names the app's Supabase clients read
    # (.env.example); the service-role key is server-only. Used by supabase:start:worktree and CI.
    param([Parameter(Mandatory)][System.Collections.Specialized.OrderedDictionary]$Values)
    foreach ($k in $Values.Keys) { "$k=`"$($Values[$k])`"" }
    "NEXT_PUBLIC_SUPABASE_URL=`"$($Values['API_URL'])`""
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=`"$($Values['ANON_KEY'])`""
    "SUPABASE_SERVICE_ROLE_KEY=`"$($Values['SERVICE_ROLE_KEY'])`""
}

function Get-TjsExcludedPortRanges {
    # Hyper-V / WinNAT reserve port ranges that nothing else may bind; they move after a reboot.
    if (-not $IsWindows) { return @() }
    $lines = & netsh interface ipv4 show excludedportrange protocol=tcp 2>$null
    foreach ($line in $lines) {
        if ($line -match '^\s*(\d+)\s+(\d+)') {
            [pscustomobject]@{ Start = [int]$Matches[1]; End = [int]$Matches[2] }
        }
    }
}

function Test-TjsPortInUse {
    param([Parameter(Mandatory)][int]$Port)
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listening) { return $true }
    }
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
    try { $listener.Start(); $false } catch { $true } finally { $listener.Stop() }
}

function Get-TjsPortProblems {
    param([Parameter(Mandatory)][int[]]$Ports)
    $ranges = @(Get-TjsExcludedPortRanges)
    foreach ($port in $Ports) {
        $range = $ranges | Where-Object { $port -ge $_.Start -and $port -le $_.End } | Select-Object -First 1
        if ($range) { "port $port is in a Windows excluded range $($range.Start)-$($range.End)"; continue }
        if (Test-TjsPortInUse -Port $port) { "port $port is in use" }
    }
}

function Assert-TjsTaskProjectId {
    param([Parameter(Mandatory)][string]$ProjectId)
    if ($ProjectId -notmatch '^tjs-\d+$') {
        throw "Refusing to operate on stack '$ProjectId': only per-task stacks tjs-<n> are handled here."
    }
}

function Get-TjsStackContainers {
    # Containers of exactly this stack: supabase_<service>_<id>, matched to the end so tjs-8 never
    # catches tjs-80.
    param([Parameter(Mandatory)][string]$ProjectId)
    $pattern = '^supabase_.+_' + [regex]::Escape($ProjectId) + '$'
    $lines = & docker ps -a --filter 'name=^supabase_' --format '{{.Names}}|{{.State}}|{{.CreatedAt}}'
    if ($LASTEXITCODE -ne 0) { throw 'docker ps failed: is Docker Desktop running?' }
    foreach ($line in $lines) {
        $name, $state, $created = $line -split '\|', 3
        if ($name -match $pattern) {
            [pscustomobject]@{ Name = $name; State = $state; CreatedAt = $created }
        }
    }
}

function Get-TjsStackVolumes {
    param([Parameter(Mandatory)][string]$ProjectId)
    $pattern = '_' + [regex]::Escape($ProjectId) + '$'
    $names = & docker volume ls --format '{{.Name}}'
    if ($LASTEXITCODE -ne 0) { throw 'docker volume ls failed: is Docker Desktop running?' }
    $names | Where-Object { $_ -match '^supabase_' -and $_ -match $pattern }
}

function Get-TjsStackNetworks {
    param([Parameter(Mandatory)][string]$ProjectId)
    $pattern = '^supabase_network_' + [regex]::Escape($ProjectId) + '$'
    & docker network ls --format '{{.Name}}' | Where-Object { $_ -match $pattern }
}

function Remove-TjsStack {
    # Stops one task stack and removes everything left of it (the edge_runtime volume survives
    # `supabase stop --no-backup`).
    param(
        [Parameter(Mandatory)][string]$ProjectId,
        [Parameter(Mandatory)][string]$WorkDir
    )
    Assert-TjsTaskProjectId -ProjectId $ProjectId

    if (@(Get-TjsStackContainers -ProjectId $ProjectId).Count -gt 0) {
        Push-Location $WorkDir
        try {
            & npx supabase stop --project-id $ProjectId --no-backup --yes
            if ($LASTEXITCODE -ne 0) { Write-Warning "supabase stop exited with $LASTEXITCODE; removing what is left directly." }
        } finally { Pop-Location }
    }

    foreach ($c in @(Get-TjsStackContainers -ProjectId $ProjectId)) {
        & docker rm -f $c.Name | Out-Null
    }
    foreach ($v in @(Get-TjsStackVolumes -ProjectId $ProjectId)) {
        & docker volume rm $v | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning "Could not remove volume $v." }
    }
    foreach ($n in @(Get-TjsStackNetworks -ProjectId $ProjectId)) {
        & docker network rm $n | Out-Null
    }
}

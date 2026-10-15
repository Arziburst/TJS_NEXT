#Requires -Version 7
<#
.SYNOPSIS
Removes per-task stacks tjs-<n> whose worktree no longer exists or that are older than -RetentionDays.

.DESCRIPTION
Looks at Docker containers and volumes named supabase_*_tjs-<n>. A stack is stale when no existing
worktree of -RepoPath has the folder number n, or when its newest container (or volume, when no
container is left) is older than -RetentionDays. Stale stacks are stopped and their containers,
volumes and network removed. tjs-main and stacks of other projects are never touched.
Supports -WhatIf.

.EXAMPLE
npm run supabase:cleanup
pwsh -NoProfile -File scripts/dev/Remove-StaleSupabaseWorktrees.ps1 -RepoPath E:/dev/TJS_NEXT -WhatIf
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$RepoPath,
    [int]$RetentionDays = 7
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/TjsStack.ps1"

$repo = (Resolve-Path -LiteralPath $RepoPath).Path

# Task numbers of the worktrees that still exist on disk.
$porcelain = & git -C $repo worktree list --porcelain
if ($LASTEXITCODE -ne 0) { throw "git worktree list failed in $repo." }
$liveNumbers = [System.Collections.Generic.HashSet[int]]::new()
foreach ($line in $porcelain) {
    if ($line -notmatch '^worktree (.+)$') { continue }
    $path = $Matches[1]
    if (-not (Test-Path -LiteralPath $path)) { continue }
    if ((Split-Path $path -Leaf) -match '^(\d+)(?:-|$)') { [void]$liveNumbers.Add([int]$Matches[1]) }
}

function ConvertTo-Age([string]$dockerTime) {
    # "2026-10-15 07:39:00 +0300 EEST": drop the zone abbreviation that [datetimeoffset] cannot parse.
    $clean = ($dockerTime -replace '\s+[A-Za-z]+$', '').Trim()
    $at = [datetimeoffset]::ParseExact($clean, 'yyyy-MM-dd HH:mm:ss zzz', [cultureinfo]::InvariantCulture)
    [datetimeoffset]::Now - $at
}

$ids = [System.Collections.Generic.SortedSet[string]]::new()
foreach ($name in @(& docker ps -a --filter 'name=^supabase_' --format '{{.Names}}') + @(& docker volume ls --format '{{.Name}}')) {
    if ($name -match '^supabase_.+_(tjs-\d+)$') { [void]$ids.Add($Matches[1]) }
}

$removed = 0
foreach ($id in $ids) {
    $n = [int]($id -replace '^tjs-', '')
    $containers = @(Get-TjsStackContainers -ProjectId $id)
    $ages = if ($containers.Count -gt 0) {
        $containers | ForEach-Object { ConvertTo-Age $_.CreatedAt }
    } else {
        Get-TjsStackVolumes -ProjectId $id | ForEach-Object {
            [datetimeoffset]::Now - [datetimeoffset]::Parse((& docker volume inspect $_ --format '{{.CreatedAt}}'), [cultureinfo]::InvariantCulture)
        }
    }
    $youngest = ($ages | Measure-Object -Property TotalDays -Minimum).Minimum

    $reason = if (-not $liveNumbers.Contains($n)) { 'its worktree no longer exists' }
              elseif ($youngest -gt $RetentionDays) { "older than $RetentionDays days ($([math]::Round($youngest, 1)) d)" }
    if (-not $reason) { Write-Host "keep   $id"; continue }

    if ($PSCmdlet.ShouldProcess($id, "remove stack ($reason)")) {
        Remove-TjsStack -ProjectId $id -WorkDir (Get-TjsRepoRoot)
        Write-Host "remove $id ($reason)"
        $removed++
    }
}
Write-Host "Done: $removed stale stack(s) removed."

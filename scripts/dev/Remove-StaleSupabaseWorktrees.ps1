#Requires -Version 7
<#
.SYNOPSIS
Removes per-task stacks tjs-<n> whose worktree no longer exists or that are older than -RetentionDays.

.DESCRIPTION
Looks at Docker containers and volumes named supabase_*_tjs-<n>. A stack is stale when no existing
worktree of -RepoPath owns it, or when its newest container (or volume, when no container is left) is
older than -RetentionDays. A worktree owns the project_id of its supabase/config.toml (written by
npm run supabase:start:worktree), so "15-verify" started as tjs-115 keeps tjs-115; a worktree whose
config.toml was not rewritten keeps tjs-<its folder number>. Stale stacks are stopped and their
containers, volumes and network removed. tjs-main and stacks of other projects are never touched.
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

# Stacks that existing worktrees own: each worktree's configured project_id (the folder number only for a
# worktree whose config.toml was not rewritten).
$liveIds = Get-TjsWorktreeStackIds -RepoPath $repo

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
    $containers = @(Get-TjsStackContainers -ProjectId $id)
    $ages = if ($containers.Count -gt 0) {
        $containers | ForEach-Object { ConvertTo-Age $_.CreatedAt }
    } else {
        Get-TjsStackVolumes -ProjectId $id | ForEach-Object {
            [datetimeoffset]::Now - [datetimeoffset]::Parse((& docker volume inspect $_ --format '{{.CreatedAt}}'), [cultureinfo]::InvariantCulture)
        }
    }
    $youngest = ($ages | Measure-Object -Property TotalDays -Minimum).Minimum

    $reason = if (-not $liveIds.Contains($id)) { 'no existing worktree owns it' }
              elseif ($youngest -gt $RetentionDays) { "older than $RetentionDays days ($([math]::Round($youngest, 1)) d)" }
    if (-not $reason) { Write-Host "keep   $id"; continue }

    if ($PSCmdlet.ShouldProcess($id, "remove stack ($reason)")) {
        Remove-TjsStack -ProjectId $id -WorkDir (Get-TjsRepoRoot)
        Write-Host "remove $id ($reason)"
        $removed++
    }
}
Write-Host "Done: $removed stale stack(s) removed."

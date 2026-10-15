#Requires -Version 7
<#
.SYNOPSIS
Stops this worktree's stack tjs-<n> and removes its containers, volumes and network.

.DESCRIPTION
The stack is the project_id in this worktree's supabase/config.toml, as npm run supabase:start:worktree
wrote it; never a guess from the folder name. -IssueNumber is optional and must match that project_id.
Refuses (and touches nothing) when config.toml was not rewritten (project_id "tjs-main") or the number
differs. Only that stack is touched; tjs-main and every other stack are left alone. The data is not kept
(--no-backup): the next start is a fresh database.

.EXAMPLE
npm run supabase:stop:worktree
npm run supabase:stop:worktree -- 207
#>
[CmdletBinding()]
param(
    [int]$IssueNumber
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/TjsStack.ps1"

$repoRoot = Get-TjsRepoRoot
$projectId = Resolve-TjsConfiguredProjectId -IssueNumber $IssueNumber -RepoRoot $repoRoot

Remove-TjsStack -ProjectId $projectId -WorkDir $repoRoot

$left = @(Get-TjsStackContainers -ProjectId $projectId) + @(Get-TjsStackVolumes -ProjectId $projectId)
if ($left.Count -gt 0) {
    throw "Left over from ${projectId}: $($left | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.Name } })"
}
Write-Host "$projectId stopped; no containers or volumes left."

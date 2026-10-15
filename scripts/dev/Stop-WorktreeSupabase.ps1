#Requires -Version 7
<#
.SYNOPSIS
Stops this worktree's stack tjs-<n> and removes its containers, volumes and network.

.DESCRIPTION
n is the leading number of the worktree folder or -IssueNumber. Only tjs-<n> is touched; tjs-main and
every other stack are left alone. The data is not kept (--no-backup): the next start is a fresh database.

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
$n = Resolve-TjsIssueNumber -IssueNumber $IssueNumber -RepoRoot $repoRoot
$projectId = "tjs-$n"

Remove-TjsStack -ProjectId $projectId -WorkDir $repoRoot

$left = @(Get-TjsStackContainers -ProjectId $projectId) + @(Get-TjsStackVolumes -ProjectId $projectId)
if ($left.Count -gt 0) {
    throw "Left over from ${projectId}: $($left | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.Name } })"
}
Write-Host "$projectId stopped; no containers or volumes left."

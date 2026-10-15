#Requires -Version 7
# npm pre-hook of supabase:start, supabase:stop, db:reset, db:types and test:db. In a linked worktree
# whose supabase/config.toml still says project_id "tjs-main", those commands would act on the shared
# main stack; refuse them. The main checkout (and CI) passes.

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/TjsStack.ps1"

$repoRoot = Get-TjsRepoRoot
if (-not (Test-TjsLinkedWorktree -Path $repoRoot)) { exit 0 }

$projectId = Get-TjsConfigProjectId -ConfigPath (Join-Path $repoRoot 'supabase/config.toml')
if ($projectId -ne 'tjs-main') { exit 0 }

$command = if ($env:npm_lifecycle_event) { $env:npm_lifecycle_event -replace '^pre', '' } else { 'this command' }
[Console]::Error.WriteLine(@"
BLOCKED: npm run $command from the worktree $repoRoot would act on the shared stack 'tjs-main'.
This worktree's supabase/config.toml still has project_id = "tjs-main". Start the worktree's own stack first:
  npm run supabase:start:worktree
then re-run the command; it will use tjs-<n>.
"@)
exit 1

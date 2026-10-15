#Requires -Version 7
<#
.SYNOPSIS
CI: writes the running local stack's values to .env.local under the names the app reads.

.DESCRIPTION
The same lines `npm run supabase:start:worktree` writes into its managed block (Get-TjsAppEnvLines in
scripts/dev/TjsStack.ps1). Next inlines NEXT_PUBLIC_* at build time, and CI builds before the stack starts,
so the job env carries NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY; this script fails when the
running stack reports other values, so the built app never points at a stack that does not exist.

.EXAMPLE
pwsh -NoProfile -File scripts/ci/Write-StackEnv.ps1
#>
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../dev/TjsStack.ps1"

$repoRoot = Get-TjsRepoRoot
Push-Location $repoRoot
try {
    $statusLines = & npx supabase status -o env 2>$null
    if ($LASTEXITCODE -ne 0) { throw "supabase status failed ($LASTEXITCODE)." }
} finally { Pop-Location }

$values = ConvertFrom-TjsStatusEnv -Lines $statusLines
$lines = @(Get-TjsAppEnvLines -Values $values)

foreach ($pair in @(@('NEXT_PUBLIC_SUPABASE_URL', 'API_URL'), @('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'ANON_KEY'))) {
    $built = [Environment]::GetEnvironmentVariable($pair[0])
    if ($built -and $built -ne $values[$pair[1]]) {
        throw "$($pair[0]) in the job env ($built) differs from the running stack's $($pair[1]) ($($values[$pair[1]])); the build used the job env. Update it in .github/workflows/ci.yml."
    }
}

$envPath = Join-Path $repoRoot '.env.local'
[IO.File]::WriteAllText($envPath, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
Write-Host ".env.local written for the stack at $($values['API_URL'])."

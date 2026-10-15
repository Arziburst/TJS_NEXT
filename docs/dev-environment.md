# Local development environment

Every task runs in its own git worktree with its own local Supabase stack, so up to five tasks (and their
verifiers) work in parallel, each on its own database, next to the shared main stack. The scripts are
PowerShell 7 (`pwsh`) in `scripts/dev/`, called through npm; Docker Desktop must be running.

## Stacks and ports

| Stack | Who uses it | Ports | Dev server |
|---|---|---|---|
| `tjs-main` | the main checkout only (stands in for production, mirrors `main`) | `40900`–`40909` | `3000` |
| `tjs-<n>` | the worktree of task `n` (`.claude/worktrees/<n>-<type>-<slug>`) | base `41000 + (n mod 200) × 10` | `3000 + n` |

Port offsets from the base:

| Offset | Service | `config.toml` |
|---|---|---|
| +0 | shadow database (`db diff`) | `[db] shadow_port` |
| +1 | API (Kong: REST, Auth, Storage, Realtime, Functions) | `[api] port` |
| +2 | Postgres | `[db] port` |
| +3 | Studio | `[studio] port` |
| +4 | mail catcher (Mailpit) | `[local_smtp] port` |
| +7 | analytics (disabled, never bound) | `[analytics] port` |
| +8 | edge-runtime inspector (bound only by `supabase functions serve --inspect`; `tjs-main` keeps the CLI default 8083) | `[edge_runtime] inspector_port` |
| +9 | pooler (disabled) | `[db.pooler] port` |

Example: task 8 → stack `tjs-8`, API `http://127.0.0.1:41081`, Postgres `41082`, Studio
`http://127.0.0.1:41083`, mail `http://127.0.0.1:41084`, dev server `3008`.

Tasks `n` and `n + 200` share a port block; the start script refuses the second one while the first runs.
The whole TJS range 40900–42999 sits below the Windows dynamic port range and outside today's Hyper-V
reservations; a change of the port base is a coordinator decision.

## Commands

| Command | What it does |
|---|---|
| `npm run supabase:start:worktree` | Starts this worktree's stack `tjs-<n>` (n from the folder name) and writes `.env.local`. Safe to re-run. |
| `npm run supabase:start:worktree -- 207` | The same with an explicit task number (for a folder without a leading number). |
| `npm run db:reset` | Recreates the database: migrations, then `supabase/seed.sql`. |
| `npm run seed:images` | Generates 3 photos per seeded product (PNG, 800×800, with a blur placeholder), uploads them to the `product-images` bucket under `seed/<product id>/` and upserts their `product_images` rows. Reads `.env.local` (service-role key), refuses a non-loopback URL; idempotent. Run after `db:reset`; the Playwright setup (`e2e/global-setup.ts`) runs it whenever a local stack is configured. |
| `npm run test:db` | pgTAP tests in `supabase/tests/` (`supabase test db`). |
| `npm run db:types` | Regenerates `src/lib/supabase/database.types.ts` from the local schema; commit it with the migration. |
| `npm run supabase:status` | URLs and keys of the stack this checkout points at. |
| `npm run supabase:stop:worktree` | Stops the stack in this worktree's `config.toml` (`project_id`) and removes its containers, volumes and network (data is not kept). |
| `npm run supabase:stop:worktree -- 207` | The same, but refuses unless `config.toml` says `tjs-207`. |
| `npm run supabase:cleanup` | Removes every `tjs-<n>` stack that no existing worktree owns or that is older than 7 days. |
| `npm run check:migrations` | Checks migration names and versions against `origin/main` and the open PRs. |
| `npm run supabase:start` / `supabase:stop` | The main stack `tjs-main` — main checkout only. |

Typical flow in a new worktree:

```sh
npm ci
npm run supabase:start:worktree   # tjs-<n> up, .env.local written
npm run db:reset
npm run seed:images              # product photos (Storage files cannot be seeded by SQL)
npm run test:db
npm run dev -- -p 3008            # 3000 + n
# … work …
npm run supabase:stop:worktree    # when the task is done
```

PowerShell eats a bare `--` before npm's own arguments, so `npm run supabase:start:worktree -- -IssueNumber 207`
reaches the script without `-IssueNumber` (npm reads it as its own option). Pass the number positionally
(`-- 207`), which works from PowerShell, Git Bash and cmd alike, or call the script directly:
`pwsh -NoProfile -File scripts/dev/Start-WorktreeSupabase.ps1 -IssueNumber 207`.

## What `supabase:start:worktree` does

1. Refuses in the main checkout: the main checkout uses `tjs-main` (`npm run supabase:start`).
2. Reads `n` from the folder name (`<n>-<type>-<slug>`, leading number only) or the argument.
3. Unless `tjs-<n>` already runs, checks that every stack port is free and outside the Windows excluded
   ranges (`netsh interface ipv4 show excludedportrange protocol=tcp`), and refuses otherwise.
4. Rewrites this worktree's `supabase/config.toml`: `project_id = "tjs-<n>"`, the ports (with the
   edge-runtime `inspector_port`), and the auth
   `site_url` / redirect URLs to port `3000 + n`. Then
   `git update-index --skip-worktree supabase/config.toml`, so the rewrite never shows in `git status` and is
   never committed.
5. `supabase start`.
6. Writes the output of `supabase status -o env` (`API_URL`, `DB_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`,
   `ANON_KEY`, `SERVICE_ROLE_KEY`, …) plus `SUPABASE_PROJECT_ID`, the app-level names the Supabase clients
   read (`NEXT_PUBLIC_SUPABASE_URL` = `API_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` = `SERVICE_ROLE_KEY`, server-only), `PORT=3000+n` and
   `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000+n` (the same host as the auth `site_url`) into a managed
   block of `.env.local`. Lines outside the
   block are kept. `.env.local` is git-ignored. The keys are the public local demo keys of the CLI, never
   production values.

`next dev` does not take its port from `.env.local`; start it with `-p 3000+n` (or `$env:PORT`).

To change `config.toml` itself in a task, undo the local rewrite first, edit, commit, then start again:

```sh
git update-index --no-skip-worktree supabase/config.toml
git checkout -- supabase/config.toml
# edit and commit supabase/config.toml
npm run supabase:start:worktree
```

Keep every `port = …` line of `config.toml` unique: the script replaces each one by exact match and stops
when a line is missing or doubled.

## Which stack `supabase:stop:worktree` stops

The stack id comes only from this worktree's `supabase/config.toml` `project_id`, the one
`supabase:start:worktree` wrote — never from the folder name. A verifier in `15-verify` started with `-- 115`
stops `tjs-115`, never the worker's `tjs-15`. The script refuses with `Refusing …` and exit code 1, touching
no stack, when:

- an explicit number differs from the configured `project_id` (`-- 15` in a worktree that runs `tjs-115`);
- `config.toml` was not rewritten (`project_id = "tjs-main"`, as in the main checkout or after
  `git checkout -- supabase/config.toml`). A stack started before the restore is then stopped by hand
  (see Cleanup).

## The main-stack guard

`scripts/dev/Assert-NotSharedMainFromWorktree.ps1` runs before `supabase:start`, `supabase:stop`,
`db:reset`, `db:types` and `test:db` (npm `pre` hooks). In a linked worktree (git: `--git-dir` differs from
`--git-common-dir`) whose `config.toml` still says `project_id = "tjs-main"` it stops the command with
`BLOCKED: …` and exit code 1, because the command would act on the shared main stack. Run
`npm run supabase:start:worktree` first. The main checkout and CI pass the guard.

## Cleanup

- When a task ends: `npm run supabase:stop:worktree` in its worktree, then remove the worktree.
- Leftovers (a worktree removed with its stack still up, or a stack forgotten for a week):
  `npm run supabase:cleanup` from any checkout. It finds stacks by their Docker names
  `supabase_<service>_tjs-<n>`, keeps the stacks that the worktrees of `git worktree list` (`-RepoPath`)
  own — each worktree's configured `project_id`, or `tjs-<folder number>` for a worktree whose `config.toml`
  was not rewritten — and stops the stale ones, then removes their volumes (the `edge_runtime` volume survives
  `supabase stop --no-backup`) and network. Options (call the script directly, npm would swallow them):
  `pwsh -NoProfile -File scripts/dev/Remove-StaleSupabaseWorktrees.ps1 -RepoPath . -RetentionDays 7 -WhatIf`.
- By hand for one stack: `npx supabase stop --project-id tjs-<n> --no-backup`, then
  `docker volume ls -q --filter name=_tjs-<n>` and `docker volume rm` — check the names first: the filter is a
  substring, so `_tjs-8` also lists `_tjs-80`.
- Only ever operate on stacks whose id is `tjs-<n>`: other projects run Supabase stacks on the same Docker
  Desktop, and `tjs-main` belongs to the main checkout. None of the scripts touches anything else.

## Migrations

Schema changes only through `supabase/migrations/YYYYMMDDHHMMSS_snake_case.sql`; the version must be unique
across `main` and every open PR (rules in `docs/standards.md` §7). `npm run check:migrations`
(`scripts/ci/check-migration-versions.mjs`) fails on a bad name, a duplicate version, an edited or deleted
migration that exists on the base branch, a version already used on the base branch or claimed by another
open PR, and warns on a version older than the latest on the base branch. Open PRs are read with `gh`;
without `gh` that step is a warning locally and an error in CI. The branch's own PR is no conflict: the one
named by `--pr <n>`, else the PR whose head ref is the current branch or whose head commit HEAD is or contains
(a verifier's worktree, an integration branch). Base: `--base <ref>`, else
`$MIGRATIONS_BASE_REF`, else `origin/$GITHUB_BASE_REF`, else `origin/main` (run `git fetch origin main`
first). The remote migration history stays a manual check.

## Auth

Supabase Auth with email/password and Google (D12); the app side is `src/lib/auth/`, `src/proxy.ts` and
`src/app/[locale]/(auth)/`.

- **Email confirmation** is on (`[auth.email] enable_confirmations`). Locally every email lands in the mail
  catcher (Mailpit) of the stack: `MAILPIT_URL` in `.env.local` (port base + 4), with a web UI and the API the
  e2e tests read (`/api/v1/search`, `/api/v1/message/<id>`).
- **Email links.** The confirmation and recovery templates (`supabase/templates/`) link to
  `/<locale>/auth/confirm?token_hash=…&type=…`, built from `NEXT_PUBLIC_SITE_URL` (never from the request's
  Host). Open the link on that host: the session cookie is set there (locally `127.0.0.1:3000+n`, not
  `localhost`). Production needs the same two templates and subjects in the dashboard (Authentication → Email
  Templates), the site URL and `https://<domain>/**` in the redirect URLs.
- **Google.** Off in `config.toml` until the OAuth client exists. To try it locally: put `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` into `supabase/.env` (git-ignored), set `enabled = true` under
  `[auth.external.google]` in the worktree's `config.toml` (not committed: the start script keeps it
  skip-worktree), add `http://127.0.0.1:<API port>/auth/v1/callback` to the OAuth client's redirect URIs and
  restart the stack. The sign-in page shows the Google button only when `/auth/v1/settings` reports Google on.
- **Rate limits.** Sign-in, sign-up, password reset and new password count 15 attempts per 5 minutes per
  client IP and per email (`src/lib/auth/rate-limit-keys.ts`, the legacy rule) in `private.rate_limit_hits`
  through `public.consume_rate_limit`, which only the service role may call: the app needs
  `SUPABASE_SERVICE_ROLE_KEY` on the server (production too), and refuses the attempt when the counter is
  unreachable. Locally the IP comes from `x-forwarded-for`; the e2e tests send their own per test.
- **Admin role.** Granted only in the database (D12), never through the app or the API. As the database owner
  (SQL editor of the project, or `psql` on the local stack):

  ```sql
  update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'owner@example.com');
  -- revoke: set role = 'customer'
  ```

  The role is read from `profiles` on every request (`getCurrentUser()`), so the change applies at the
  user's next page load. Admin pages call `requireAdmin(locale)` (a guest is sent to sign in, a customer
  gets the not-found page); actions call `getAdmin()`. The API roles cannot read the internal catalog columns
  (`hs_code`, `deleted_at`, `created_by`, `updated_by`; `sku` is public): admin screens read them on the server with the
  service-role client after `requireAdmin()`.

## Delivery abroad: Nova Post

The Nova Post international client (`src/lib/delivery/nova-post/`, #23) reads `NOVA_POST_API_KEY` and
`NOVA_POST_API_URL` on the server at request time. Without a key (today: no contract yet) nothing is
searched and every estimate is the zone flat rate of `nova_post_zone_rates` (TBD until an admin sets it).

- **Fixture server.** `e2e/nova-post-mock.ts` answers `/clients/authorization`, `/settlements`, `/divisions`
  and `/shipments/calculations` from `tests/delivery/fixtures/nova-post/` (shaped after the public OpenAPI
  spec, no real traffic). Playwright starts it on `E2E_PORT + 1000` (CI: 4000) and gives the app
  `NOVA_POST_API_KEY=e2e-fixture-key` and its URL. For a dev walk of the demo page
  (`/<locale>/delivery-demo/nova-post`, needs `TJS_UI_KIT=true`), from Git Bash:

  ```sh
  NOVA_POST_MOCK_PORT=4023 node e2e/nova-post-mock.ts &
  TJS_UI_KIT=true NOVA_POST_API_KEY=e2e-fixture-key NOVA_POST_API_URL=http://127.0.0.1:4023/v.1.0 npx next dev -p 3023
  ```

  Towns with points in the fixtures: Wrocław (PL), Berlin (DE), Paris (FR).
- **Sandbox.** `NOVA_POST_API_URL=https://api-stage.novapost.com/v.1.0` with a sandbox key
  (`POST /test-api-keys` for a phone registered in the Nova Post client portal). Never commit a key.
- **Live calculation.** Even with a key the price is not asked yet: the parcel (packaging, weight, declared and
  insured value) is the owner's decision and `parcelForOrder()` returns none, so the flat rate stands in.

## Windows traps

- **Excluded ports.** Hyper-V / WinNAT reserve port ranges (today 46752–47251, 54320–54538 among others)
  and move them after a reboot; nothing can bind there. The start script checks before `supabase start`.
  If a stack fails to bind after a reboot, run
  `netsh interface ipv4 show excludedportrange protocol=tcp` and tell the coordinator.
- **Analytics off.** `[analytics] enabled = false`: the vector container cannot reach Docker's Windows named
  pipe and crash-loops otherwise. Keep it off.
- **`docker exec` from Git Bash** rewrites `/paths` into Windows paths; prefix it with
  `MSYS_NO_PATHCONV=1` (e.g. `MSYS_NO_PATHCONV=1 docker exec -i supabase_db_tjs-8 psql -U postgres`), or
  use PowerShell.
- **Kill dev servers by port, never by name.** `taskkill /IM node.exe` or `Stop-Process -Name node` stops
  every session's server. Use
  `Get-NetTCPConnection -LocalPort 3008 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }`.
- **Docker Desktop restarts stacks after a reboot** (`restart: unless-stopped`); stop the stacks of paused
  tasks to save memory.
- **Line endings.** With `core.autocrlf=true` the worktree copy of `config.toml` has CRLF; the scripts accept
  both.

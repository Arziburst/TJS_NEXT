# CI

Merges happen without a human watching, so CI is the gate. Three workflows live in `.github/workflows/`.
The repository is public: no job runs pull-request code with a secret.

## `ci.yml` — the required check `ci`

Runs on every `pull_request` (any base, no paths filter) and every push to `main`. The job named `ci`,
on `ubuntu-24.04` with Node from `.nvmrc`, is the check branch protection requires; the job `auth-hook-e2e`
(below) runs next to it in parallel.

| # | Step | Command |
|---|---|---|
| 1 | install | `npm ci` (npm cache from `actions/setup-node`) |
| 2 | migration versions (PRs only, full history) | `npm run check:migrations -- --pr <n>` |
| 3 | lint | `npm run lint` |
| 4 | types | `npm run typecheck` |
| 5 | unit tests | `npm run test:unit` |
| 6 | production build | `npm run build` |
| 7 | local Supabase stack | `npx supabase start -x studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,realtime,supavisor` (CLI from devDependencies) |
| 8 | every migration, then the seed | `npm run db:reset` |
| 9 | database tests (pgTAP) | `npm run test:db` |
| 10 | the stack's values for the app | `pwsh -File scripts/ci/Write-StackEnv.ps1`: `.env.local` with the names the app reads, by the same mapping as `supabase:start:worktree` (`Get-TjsAppEnvLines`); fails if the stack's API URL or anon key differ from the job env |
| 10a | integration tests on the stack | `npm run test:integration` (the `*.integration.test.ts` files; they skip in step 5, where no stack runs yet) |
| 11 | e2e against the built app on the stack | `npx playwright install --with-deps chromium`, `npm run test:e2e` with `E2E_SERVER=start` |
| 12 | evidence | Playwright report (`playwright-report/`) and traces (`test-results/`) as artifacts, 7 days |
| 13 | cleanup (always) | `npx supabase stop --no-backup` |

- A failing step fails `ci`; later steps are skipped, except the uploads (unless cancelled) and the stack stop
  (always). The uploads are `continue-on-error`: a failed upload never fails the build.
- The stack is the committed `supabase/config.toml` (`tjs-main`, ports `40900`–`40909`) on the runner. Mailpit,
  Auth, REST, Storage and Kong run; switch a service back on in step 7 when a test needs it.
- `E2E_SERVER=start` makes `playwright.config.ts` serve `next start` (the build from step 6) instead of
  `next dev`. `TJS_UI_KIT=true` is set for the whole job so the build contains the `/ui-kit` showcase the
  shell tests use; Vercel never sets it, so it stays a 404 in production.
- The build runs before the stack starts, and Next inlines `NEXT_PUBLIC_*` at build time: so
  `NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:40901`) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the CLI's fixed
  public demo key) are in the job's `env`. Step 10 checks them against the running stack. A new `NEXT_PUBLIC_*`
  value from the stack goes into the job `env` the same way; server-only values come from `.env.local`.
- `concurrency` groups runs per PR (`ci-pull_request-<n>`) and per pushed ref (`ci-push-refs/heads/main`) and
  cancels the older run of the same group when a new commit arrives (on `main` too: the newest run covers every
  earlier commit). A fork PR from a branch named `main` never shares a group with the push-to-main runs.
- Permissions: `contents: read`, `pull-requests: read`. `check:migrations` reads the open PRs with the
  workflow's own `GITHUB_TOKEN`; in CI a `gh` failure is an error, not a warning.

### Job `auth-hook-e2e` — Auth's emails through the Send Email Hook (#119)

The emails of sign-up, password reset and email change in the user's language (#99, `docs/dev-environment.md`
"Auth emails in the user's language") are proven on a stack with the hook on. That stack cannot be the `ci` job's:
with the hook on, Auth sends nothing to Mailpit, where the other auth tests read its English templates. So a second
job runs in parallel with `ci`, on `ubuntu-24.04`:

| # | Step | Command |
|---|---|---|
| 1 | install, build | `npm ci`, `npm run build` (the same job `env` as `ci`) |
| 2 | stack with the hook on | `npx supabase start -x …` (the same services as `ci`) with `SUPABASE_AUTH_HOOK_SEND_EMAIL_ENABLED=true` and `SUPABASE_AUTH_HOOK_SEND_EMAIL_URI=http://host.docker.internal:3000/api/auth/send-email` (the app Playwright serves) |
| 3 | database, the app's values | `npm run db:reset`, `pwsh -File scripts/ci/Write-StackEnv.ps1` |
| 4 | e2e of the hook mode | `npx playwright test e2e/auth-emails.e2e.ts` with `E2E_SEND_EMAIL_HOOK=true`, desktop and mobile: the emails go through the app's hook to the notifications stand-in (`e2e/notifications-mock.ts`), where the tests read them |
| 5 | evidence, cleanup | artifacts `playwright-report-auth-hook` and `playwright-traces-auth-hook` (7 days); `npx supabase stop --no-backup` (always) |

- `SEND_EMAIL_HOOK_SECRET` in the job `env` is a test value, not a secret: the stack signs the hook's calls with it
  (`[auth.hook.send_email] secrets` in `config.toml`) and the app started by `playwright.config.ts` checks them with
  it (the config's default is the same value). A stack that signs with another secret gets 401 from the hook, the
  sign-up fails and so does the job.
- The job builds on its own instead of waiting for `ci`'s build, so the workflow's wall time stays that of `ci`.

## `production-migrations.yml` — production migrations

- **Push to `main` touching `supabase/migrations/**`**: job `plan` links the production project and runs
  `supabase migration list` and `supabase db push --include-all --dry-run`. Main shows whether its migrations
  would apply cleanly; nothing is written.
- **Manual run with `confirm` = `apply`, from `main`**: `plan` runs first, then job `apply` runs
  `supabase db push --include-all` and the migration list after it.
- **Why `--include-all`:** each branch claims its migration slot when it starts (`docs/standards.md` §7), and
  branches merge in any order, so main often gets a version older than one production already has (e.g. slot
  `…007700` merged after `…009200` was applied). A plain `db push` refuses such a local version ("Found local
  migration files to be inserted before the last migration on remote database"); `--include-all` applies every
  local version missing on the remote, in version order. It never skips a check the other way: a version on the
  remote that main does not have still fails the push. Any other `confirm` value is only the dry run; a run
  from another ref fails at once.
- Missing secrets: `plan` writes a warning to the log and the job summary ("SKIPPED … nothing was checked")
  and ends without touching production; an explicit `apply` fails instead of ending green.
- `concurrency: production-migrations`, never cancelled. Only code already on `main` runs here.
- Runbook: take a dump first (`npx supabase db dump --linked -f <file>` and `--data-only`), then
  `gh workflow run production-migrations.yml --ref main -f confirm=apply`. If the remote history holds a
  version that is missing locally, the dry run fails: stop and reconcile.

## `project-status.yml` — board automation

`pull_request_target` on `ready_for_review` and `converted_to_draft`. For each issue the PR **closes**
(`Closes #n`, not `Refs #n`) that is on the user project #4 "TJS", it sets Status to **Testing** (ready) or
**In Progress** (back to draft), by the project, field and option node ids written in the workflow (look them
up again if the Status options are recreated). It never checks out or runs PR code: it only calls the GraphQL
API with the PR number. `permissions: {}`; the token is `PROJECT_TOKEN`. Without it the job logs a warning
and a job-summary line and ends green. `pull_request_target` runs the workflow file from `main`, so a change
to it takes effect after the merge.

## Secrets (names only)

| Secret | Used by | Notes |
|---|---|---|
| `SUPABASE_PROJECT_REF` | production-migrations | the production project ref |
| `SUPABASE_ACCESS_TOKEN` | production-migrations | a Supabase personal access token |
| `SUPABASE_DB_PASSWORD` | production-migrations | the production database password |
| `PROJECT_TOKEN` | project-status | a classic PAT with `repo` + `project` (Projects v2 of a user account) |

`ci.yml` uses no secret. The coordinator sets the secrets and the branch protection (required check `ci`).

## Rerun

- A red or cancelled `ci`: `gh run rerun <run-id> --failed` (or "Re-run failed jobs" on the run page);
  `gh pr checks <n>` lists the runs of a PR. A new push reruns it anyway.
- Artifacts of a run: `gh run download <run-id> -n playwright-report` (or `-n playwright-traces`), then
  `npx playwright show-report playwright-report` / `npx playwright show-trace test-results/<test>/trace.zip`.
- Production dry run by hand: `gh workflow run production-migrations.yml --ref main`; apply: add
  `-f confirm=apply`.
- Board move again: convert the PR to draft and back to ready, or set the Status on the board by hand.

## The same checks locally

```sh
npm run check:migrations -- --pr <n>     # --pr only where the branch is not the PR's head ref
npm run lint && npm run typecheck && npm run test:unit
TJS_UI_KIT=true npm run build
npm run supabase:start:worktree && npm run db:reset && npm run test:db
npm run test:integration                 # needs the stack's .env.local
E2E_SERVER=start E2E_PORT=3000+<n> npm run test:e2e
```

`check:migrations` treats the branch's own PR as no conflict: the PR named by `--pr`, else the PR whose head
ref is the current branch or whose head commit HEAD is or contains (a verifier's `<n>-verify` worktree, a
lead's integration branch).

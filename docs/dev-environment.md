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
first). The remote migration history stays a manual check. Production gets the migrations through
`production-migrations.yml` with `supabase db push --include-all`: a slot claimed early may merge after a newer
one is applied (why and the runbook: `docs/ci.md`).

## Legacy catalogue import

`scripts/import/legacy-catalogue.mjs` moves the legacy catalogue (D33) into a Supabase project from a
read-only export folder that lives outside every repository: `products.json` (mongoexport EJSON),
`images.json`, `cloudinary-resources.json` and `cloudinary/image/<public_id>.<ext>` (the archived originals).
It never connects to MongoDB or Cloudinary. Next to the export, a state folder `<export>-import/` (`--state`
to change it) holds what the runs share:

| File | What |
|---|---|
| `translations.json` | uk and en machine translations of every legacy title and description, produced once and reused; each entry carries the hash of its legacy text, so a changed export fails as stale instead of importing an old translation. A uk entry marked `"source": "human"` is the owner's own Ukrainian legacy text, kept verbatim (22 products). The Russian originals stay only in the export. |
| `rate.json` | the NBU USD rate the prices were converted at, pinned by the first real run (written by the importer) |
| `report-local.md`, `report-production.md` | the report of the last run on that target: the rate and its date, counts per category and kind, the price range, the weight-0 products, the questions for the owner, every product with its legacy id, category, kind, UAH and USD price |

What a run does, per product: `products` row keyed by `legacy_id` (a hidden column, migration
`20261016006900`): category from the legacy `type`, `available: false` → made to order without a lead time,
`available: true` → one of a kind, available (D34), USD = UAH / rate half up to the cent, the weight as given (a
missing one is the legacy default 0), `created_at` = `published_at` = the legacy `created`, published. Then the
uk and en texts (`source = machine`, `reviewed_at` null, so the review flow applies; a uk text marked human in
`translations.json` gets `source = human` and `reviewed_at` = the import time; slugs transliterated / from the English title, numbered
`-2`, `-3` … for repeated titles, oldest first, existing slugs never changed), and every photo in its order to
`product-images/legacy/<product id>/<n>-<file>` with width, height, an 8 px blur placeholder and the title as
alt text per locale. A photo is stored as the admin upload stores it (`src/lib/images/encode.ts`: turned
upright, re-encoded without EXIF/XMP/IPTC, so without a GPS position), with the extension of its encoded format.
Customers, orders, views and unused media stay in the archive.

It is idempotent: a second run changes nothing (`plan: products created 0, …`). A photo row counts as done at its
legacy path, or at the new file `scripts/images/strip-metadata.mjs` moved it to (same folder and position), so a
re-run neither uploads it again nor adds a second row; its blur placeholder is not compared (it follows the
encoder). A real re-run is only needed for a fresh database: production is already imported. A row that differs from the
export (edited in the admin since) is kept and listed; `--overwrite` resets it to the export. An interrupted run
is finished by running it again.

```sh
# local: the worktree's stack (.env.local); a non-loopback URL is refused
node scripts/import/legacy-catalogue.mjs C:/Users/arzib/tjs-backups/legacy-20261015 --dry-run   # prints the plan
node scripts/import/legacy-catalogue.mjs C:/Users/arzib/tjs-backups/legacy-20261015
```

Call it with `node`, not through an npm script: npm would take `--dry-run` as its own flag (PowerShell drops
the `--` that keeps it away from npm) and the run would write for real.

Options: `--dry-run` (reads the target, prints the plan, writes nothing), `--production` (allows a non-loopback
URL), `--overwrite`, `--rate-date YYYY-MM-DD` (converts at that day's NBU rate instead of the pinned one; a real
run re-pins it, and only `--overwrite` reprices products already imported), `--state <dir>`.

**Production run (the coordinator only; a worker never writes production).** After the owner has accepted the
local import and the migration is applied to `tjs-prod`, from a checkout of `main`:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://<project ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role key of tjs-prod>"   # from the dashboard; never stored in a file
node scripts/import/legacy-catalogue.mjs C:/Users/arzib/tjs-backups/legacy-20261015 --production --dry-run
node scripts/import/legacy-catalogue.mjs C:/Users/arzib/tjs-backups/legacy-20261015 --production
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY, Env:NEXT_PUBLIC_SUPABASE_URL
```

The variables of the environment win over `.env.local`, which is read only when no URL is set. The run uses the
rate pinned in `rate.json`, so production gets exactly the prices the owner reviewed, and writes
`report-production.md`. Check the dry run's target line (`PRODUCTION`) and its plan (167 products, 334
texts, 441 photos on an empty catalogue) before the real run. The shop's catalogue reads are cached
(`cacheLife("hours")`, `src/lib/catalog/cache.ts`): the products appear within the hour, or at once after a
redeploy. Locally, restart `next dev` (or rebuild) after an import.

Imports before #90 stored the archived originals as they were, EXIF included (one legacy photo carries a GPS
position); `scripts/images/strip-metadata.mjs` below cleans such files.

## Photo metadata cleanup

`scripts/images/strip-metadata.mjs` checks the file of every `product_images` row for metadata (EXIF, XMP,
IPTC) and a GPS position, and lists the files no row points at. With `--apply` it replaces each such row's
file with a clean copy made by the admin upload's code (`src/lib/images/encode.ts`: upright, re-encoded, no
metadata) under a **new** path in the same folder (the image optimizer caches by URL), points the row at it
and deletes the old file. `--gps-only` limits `--apply` to the photos with a position, `--prefix legacy` the run to one folder of the bucket. Files no row points at
are only reported. Dry run by default; the target is chosen like the importer's (`.env.local`, a non-loopback
URL only with `--production`).

```sh
node scripts/images/strip-metadata.mjs            # report only
node scripts/images/strip-metadata.mjs --apply    # clean the local stack
```

On production (the coordinator only), with the variables set as for the import: `--production` for the dry
run, then `--production --apply`. Storefront pages cached before the run still name the old URLs; the image
optimizer may keep serving its cached, metadata-free copies of them (not verified on Vercel) until the pages' cache entries expire or the
next deployment. A later re-run of the legacy importer keeps the cleaned rows as they are.

## Auth

Supabase Auth with email/password and Google (D12); the app side is `src/lib/auth/`, `src/proxy.ts` and
`src/app/[locale]/(auth)/`.

- **Email confirmation** is on (`[auth.email] enable_confirmations`). Locally every email lands in the mail
  catcher (Mailpit) of the stack: `MAILPIT_URL` in `.env.local` (port base + 4), with a web UI and the API the
  e2e tests read (`/api/v1/search`, `/api/v1/message/<id>`).
- **Email links.** The confirmation, recovery and email change templates (`supabase/templates/`) link to
  `/<locale>/auth/confirm?token_hash=…&type=…`, built from `NEXT_PUBLIC_SITE_URL` (never from the request's
  Host). Open the link on that host: the session cookie is set there (locally `127.0.0.1:3000+n`, not
  `localhost`). Production needs the same three templates and subjects in the dashboard (Authentication → Email
  Templates), the site URL and `https://<domain>/**` in the redirect URLs.
- **Auth emails in the user's language** (#99): see the section of that name below.
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
- **Admin area (#17).** `/<locale>/admin` (products), `/<locale>/admin/products/new` and
  `/<locale>/admin/products/<id>`; an admin finds them in the account menu. Each page checks the admin inside its
  own Suspense boundary, so the HTML of a guest or customer holds no admin text: a guest gets status 200 with a
  redirect to the sign-in page (meta refresh and client redirect), a customer status 200 with the not-found page.
  Writes go through `public.admin_save_product`, `admin_set_product_status` and `admin_delete_product` (security
  invoker: RLS and the audit trigger apply; the service role may call them too, e.g. an import script, then
  `created_by` / `updated_by` stay null), and expire the storefront caches by tag (`src/lib/admin/revalidate.ts`).
  A product is published only with its uk translation (checked in those functions, not by a table constraint).
  To try it locally, create a user (sign up, or the Auth admin API of the stack), make it admin with the SQL above
  through `MSYS_NO_PATHCONV=1 docker exec -i supabase_db_tjs-<n> psql -U postgres`, and sign in on
  `127.0.0.1:3000+n`. `e2e/admin.e2e.ts` creates its own admin and customer; it runs in the
  `desktop-catalog-writers` and `mobile-catalog-writers` projects after the storefront tests, because it publishes
  products the listings count.

### Auth emails in the user's language

Supabase Auth's templates have one language. With the **Send Email Hook** on, Auth hands every email to
`POST /api/auth/send-email` instead (`src/lib/auth/send-email-hook.ts`), which:

1. checks the Standard Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature`) with
   `SEND_EMAIL_HOOK_SECRET`, refuses a call signed more than 5 minutes away from now, and refuses an id it has
   seen before (`public.claim_webhook_receipt`, service role only): 401 for all of them, 500 while the secret is
   unset;
2. renders the email of the action type (`signup`, `recovery`, `email_change` — one to the current and one to the
   new address, each with its own token — and `magiclink`, unused today) in the user's locale: `user_metadata.locale`,
   else the locale of the page it was asked from (`redirect_to`), else `en`. The texts are
   `notifications.email.auth.*` (11 locales, machine translation, unreviewed), with HTML and plain-text parts, the
   shop's name and contacts from the admin settings when there are some (#21), and the token-hash link to
   `/<locale>/auth/confirm` on `NEXT_PUBLIC_SITE_URL` (never the payload's host);
3. sends it through the order emails' Resend transport (Notifications below: `NOTIFICATIONS_SEND`,
   `RESEND_API_KEY`, `EMAIL_FROM`). Sending off or unconfigured → 500, so Auth reports the failure (a sign-up is
   then refused) instead of creating an account nobody can confirm. Any other email type → 400. Supabase Auth
   waits 5 s for an HTTP hook: the send here gives up after 4 s (`AUTH_HOOK_SEND_TIMEOUT_MS`; the order emails keep
   10 s) and answers 500, so a slow provider fails with the hook's own message rather than Auth's timeout.

Answers: `{}` with 200 on success, `{ "error": { "http_code", "message" } }` otherwise. The token and the link are
never logged. The locale is stored at sign-up (`options.data.locale`) and, while signed in, when the page's locale
differs from the stored one (the account menu calls `rememberLocale`, at most 20 changes an hour per account). An
account without a stored locale (signed up before #99, with Google, or made by an admin) keeps none: its emails
follow the page they are asked from.

**Locally the hook is off** (`[auth.hook.send_email] enabled = false` in `config.toml`): Auth sends the English
templates of `supabase/templates/` to Mailpit as before, and nothing needs a secret or email keys. To try it, start
the stack with the hook on (the CLI reads `SUPABASE_AUTH_*` overrides of `config.toml`), from Git Bash:

```sh
export SEND_EMAIL_HOOK_SECRET="v1,whsec_$(node -e "console.log(Buffer.from('a local secret').toString('base64'))")"
npm run supabase:stop:worktree -- <n>
SUPABASE_AUTH_HOOK_SEND_EMAIL_ENABLED=true \
SUPABASE_AUTH_HOOK_SEND_EMAIL_URI=http://host.docker.internal:<3000+n>/api/auth/send-email \
  npm run supabase:start:worktree -- <n>
```

The Auth container reaches the dev server through `host.docker.internal` (Docker Desktop; on Linux it needs a
host-gateway entry). Run the app with the same secret and the notifications stand-in as the transport (the dev walk
command of Notifications below, plus `SEND_EMAIL_HOOK_SECRET`), then read the emails at
`GET http://127.0.0.1:<stand-in port>/sent?to=<address>`. The integration e2e of this mode, on that stack, against
the production build:

```sh
TJS_UI_KIT=true npm run build
TJS_UI_KIT=true E2E_PORT=<3000+n> E2E_SERVER=start E2E_SEND_EMAIL_HOOK=true npx playwright test e2e/auth-emails.e2e.ts --workers 2
```

Only that file: with the hook on, the other auth e2e tests find no email in Mailpit. Restart the stack without the
two overrides to return to the default. CI runs both modes: the `ci` job's stack has the hook off
(`e2e/auth-emails.e2e.ts` checks the stored locale only there), and the `auth-hook-e2e` job runs this file on a stack
of its own with the hook on (#119, `docs/ci.md`).

**Production** (owner or coordinator; launch checklist #31). In this order, so no sign-up meets a hook that
cannot send:

1. The email transport works: `NOTIFICATIONS_SEND=true`, `RESEND_API_KEY`, `EMAIL_FROM` on the Vercel production
   environment (the sender address and domain are **TBD, the owner decides**; the domain verified in Resend).
2. Dashboard → Authentication → Auth Hooks → **Send Email** → HTTPS: URL `https://<domain>/api/auth/send-email`,
   generate the secret. Copy it (`v1,whsec_…`) into `SEND_EMAIL_HOOK_SECRET` on the Vercel **production**
   environment only (server only, never `NEXT_PUBLIC_*`); redeploy.
3. Enable the hook. Sign up, ask for a password reset and change an email in two languages and check the emails.
   To undo: disable the hook; Auth sends its dashboard templates again (keep them set, docs above).

## Nova Poshta (delivery in Ukraine)

The server-only client is `src/lib/delivery/nova-poshta/` (API 2.0, `https://api.novaposhta.ua/v2.0/json/`); the
UI pieces for the checkout are `src/components/delivery/`, shown on the dev showcase `/<locale>/delivery-demo`
(on only with `TJS_UI_KIT=true`, like `/ui-kit`).

- **Key.** `NOVA_POSHTA_API_KEY`, server-only, from the owner's Nova Poshta business cabinet. Optional: the
  dictionary methods and `getDocumentPrice` also answer without a key, so the app calls the API without one
  when it is unset. Never put it in a `NEXT_PUBLIC_*` name; the legacy app's key leaked in its client bundle and
  must never be used. `tests/delivery/client-bundle.integration.test.ts` scans the production build's client
  bundle (`.next/static`) for the key and the client's code (CI integration step, after the build).
- **Fixtures.** `NOVA_POSHTA_FIXTURES=true` answers from the recorded API answers
  (`src/lib/delivery/nova-poshta/fixtures/recordings.json`: Kyiv, Lviv, Odesa, Brovary, their branches, streets
  and tariffs) instead of the network: for walks without a network and for the e2e run (`playwright.config.ts`
  sets it for the web server). The fixture transport refuses to serve when `VERCEL_ENV=production`. Re-record
  with `node tests/delivery/record-nova-poshta-fixtures.mjs` (always without a key).
- **Cache.** The settlements and branches customers looked up are cached in `np_lookups`, `np_settlements` and
  `np_warehouses` (service role only, no policy for anon or authenticated). A lookup is served from the cache
  for a day, then fetched again on its next use; when the API fails the stale answer is served. Vercel Cron
  calls `/api/cron/nova-poshta` daily at 02:30 UTC (`Authorization: Bearer $CRON_SECRET`, else 401): it refreshes
  the lookups used within a week, drops those unused for 30 days and the rows no lookup names.
- **Parcel parameters** (`src/lib/delivery/nova-poshta/parcel.ts`): sender city Kyiv, the recipient pays,
  declared value = the order total (D35); handed in at a branch, quotes are estimates on a 10 × 10 × 5 cm box
  that adds 100 g (D37).
- **Rate limits** (`src/lib/delivery/rate-limit.ts`): the public search actions 60 and the quote 20 per minute per
  client IP, counted by `public.consume_rate_limit` like the auth actions (fails closed); the e2e tests send
  their own `x-forwarded-for` per test.

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
- **Live calculation.** With a key, the price is asked for the D37 estimate box (10 × 10 × 5 cm, the goods'
  weight + 100 g), declared and insured at the order total in UAH (`parcelForOrder`, D35), with the recipient as
  the payer (D38: the customer pays the actual price on receipt); without goods of any value the flat rate stands
  in. Every price is shown as an estimate.
- **Rate limits.** The same per-client budget as Nova Poshta (`src/lib/delivery/rate-limit.ts`, shared): town and
  point searches count as `search`, quotes as `quote`; over the budget the shop's "too many attempts" text
  (`auth.errors.rateLimited`) is shown.

## Machine translation (Vercel AI Gateway)

The admin translates a product's texts (title, description, materials, care, clasp, lead-time note, meta
title/description, alt texts) from one locale into the others in one structured-output call per product
(`src/lib/translate/`, #19): AI SDK 7 through the Vercel AI Gateway, model `TRANSLATION_MODEL` in
`src/lib/translate/core.ts` (`anthropic/claude-sonnet-5.5`: the gateway's "provider/model" id with a dotted version,
not the Anthropic API's `claude-sonnet-5-5`; typed against the gateway's list, so an unknown id fails the
typecheck; change it there), the
jewellery glossary in `src/lib/translate/glossary.ts` (data, corrected by PR; not yet checked by native speakers).
Machine rows are saved as `source = machine`, `reviewed_at = null`: the shop shows them, but the product page is
`noindex` and left out of hreflang (and of the sitemap, #30) until the admin marks the locale reviewed
(`src/lib/seo/indexing.ts`). Everything runs on the server; `tests/translate/client-bundle.integration.test.ts`
checks that no key, prompt or glossary reaches the client bundle.

- **Credentials.** Translation is on when the server has one: `AI_GATEWAY_API_KEY` (local development; a key from
  the Vercel dashboard, *AI Gateway → API keys*, in `.env.local`, never committed), or `AI_GATEWAY_OIDC=true` on
  Vercel, where the gateway authenticates with the deployment's OIDC token (no key stored). Neither set: the
  admin shows "machine translation is not configured" and calls nothing. Turning it on in production (billing
  of the AI Gateway) is the owner's and the coordinator's decision.
- **Stand-in gateway.** `e2e/ai-gateway-mock.ts` answers the gateway's `/language-model` endpoint and
  "translates" by prefixing `[de] ` etc.; a source title containing `[omit:cs]` leaves cs out (a partial
  result). Playwright starts it on `E2E_PORT + 1500` (CI: 4500) and gives the app `AI_GATEWAY_API_KEY` and
  `AI_GATEWAY_BASE_URL`. For a dev walk, from Git Bash:

  ```sh
  AI_GATEWAY_MOCK_PORT=4519 node e2e/ai-gateway-mock.ts &
  AI_GATEWAY_API_KEY=e2e-gateway-key AI_GATEWAY_BASE_URL=http://127.0.0.1:4519/v4/ai npx next dev -p 3019
  ```

  `AI_GATEWAY_BASE_URL` is ignored when `VERCEL_ENV=production`.
- **Limits.** One attempt times out after 90 s in the app (three attempts with backoff stay under a function's
  300 s); a gateway 429/5xx or an unusable answer is retried, a refused key is not. A locale that comes back
  missing or over a column limit fails alone, the others are saved. Per admin: 120 translations an hour and 300
  review changes per 10 minutes (`src/lib/admin/rate-limit.ts`).
- **Cost.** About **$0.015 per product** for the 9–10 missing locales of a short legacy text: ~2 400 input tokens
  (the prompt with the glossary) + ~1 000 output tokens at Sonnet 5.5's list price of $2 / $10 per million tokens
  (`TRANSLATION_MODEL_PRICE`; the gateway bills the provider's list price). The whole legacy catalogue (167
  products) is a few dollars; the batch script's dry run prints the estimate for the actual catalogue.
- **Batch.** `scripts/translate/missing.mjs` fills the missing locales of every product with the same code:

  ```sh
  node scripts/translate/missing.mjs                       # dry run: what it would translate, token/cost estimate
  node scripts/translate/missing.mjs --apply --limit 5     # translate five products (needs AI_GATEWAY_API_KEY)
  node scripts/translate/missing.mjs --production          # dry run against production (a non-loopback URL)
  ```

  Options: `--product <id>`, `--source <locale>` (default uk, else en), `--limit <n>`. It reads
  `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from the environment, else `.env.local`, and refuses a
  non-loopback URL without `--production`. It only inserts missing locales (an existing text is never replaced)
  and writes as the service role, so `created_by` stays empty. The shop shows the new texts within a day (the
  product pages' cache life) or at once after the next admin save of that product. Running it on production is
  the coordinator's, after the owner's go.

## Notifications (Telegram and email)

Every order request writes an `order_created` row to `public.outbox_events` in its own transaction (#24). The
processor (`src/lib/notifications/`, #26) sends it to two channels and keeps each one's outcome in the row:

- **Telegram** to the owner's group, in Ukrainian, `parse_mode` HTML with every order value escaped, with a link
  to the admin's order page (`/uk/admin/orders/<number>`, reserved for #27).
- **Email** to the customer through Resend, in the order's locale: the number, the lines and total, the delivery
  estimate with the on-receipt note (D37, D38) and the shop's contact channels (the TBD line until the admin
  settings of #21 provide them). Templates: `src/emails/` (confirmation, and the status change for #27);
  rendered examples: `tests/notifications/__snapshots__/`.

**When it runs.** Right after a placed order (`after()` in the checkout action) and every six hours from
`GET /api/cron/notifications` (`CRON_SECRET`): four `vercel.json` entries of that path at `0 0`, `0 6`, `0 12` and
`0 18` UTC, because Hobby runs each entry once a day (somewhere within its hour). A run claims up to 5 × 10 due
events (`claim_outbox_events`: `FOR UPDATE SKIP LOCKED`, a 5-minute lease, a claim token), so two runs never send
one message twice; a run that dies leaves its events due again when the lease ends. A failed send is retried after
1, 2, 4 … minutes (at most 6 hours) by the next run (the next order's or the next cron's), and marked `failed` at
the 8th attempt. The order itself is never changed by a send. Delivery is at least once: if writing the outcome
fails after a send, the event is claimed again after its lease and the Telegram message may go out twice (the
email is deduplicated by its `Idempotency-Key`).

**Telegram's flood control** (about 20 messages a minute in one group). A run sends at most 15 Telegram messages
(`SENDS_PER_RUN`) and defers the rest by a minute; on a 429 it waits Telegram's `parameters.retry_after` and sends
no more Telegram messages in that run. Neither spends an attempt (`complete_outbox_event(…, p_refund_attempt)`), so
a backlog goes out over the next runs and is never marked `failed` for being throttled; the emails of the same
events go out meanwhile.

**Late confirmations.** The customer's email goes out only for an order placed at most 24 hours ago
(`CONFIRMATION_EMAIL_MAX_AGE_MS`); an older one, e.g. the requests stored before this sender was configured, is
marked `skipped_expired`. The owner's Telegram message has no limit: every order request reaches the owner.

**Outcomes** (`telegram_status`, `email_status`, `last_error` on the outbox row; the admin's view comes with #27):
`pending` → `sent`, or `skipped_unconfigured` (sending is off or the channel's settings are missing; not retried,
the reason in `last_error`), or `skipped_expired` (the confirmation would be over 24 hours late), or `failed` (the
last attempt failed too). To see them locally:

```sql
select o.number, e.telegram_status, e.email_status, e.attempts, e.next_attempt_at, e.last_error
from public.outbox_events e join public.orders o on o.id = e.order_id order by e.created_at desc;
```

**Settings** (server only; `.env.example`). Nothing is sent unless `NOTIFICATIONS_SEND` is exactly `true`: tests,
local runs and CI without it mark every event `skipped_unconfigured`, even with keys in `.env.local`.

| Name | |
|---|---|
| `NOTIFICATIONS_SEND` | `true` only where messages may go out (the production deployment) |
| `TELEGRAM_BOT_TOKEN` | the bot's token (SECRET); the bot is a member of the owner's group — **TBD, the owner provides it** |
| `TELEGRAM_CHAT_ID` | the group's chat id (negative for groups) — **TBD**; a fallback only: the chat id in the admin settings (`/admin/settings`, #21) wins |
| `RESEND_API_KEY` | the Resend API key (SECRET) — **TBD** |
| `EMAIL_FROM` | the sender, e.g. `Shop <orders@<domain>>`, on a domain verified in Resend — **TBD, the owner decides** |
| `EMAIL_REPLY_TO` | optional: where the customer's replies go |
| `TELEGRAM_API_BASE_URL`, `RESEND_API_URL` | local and e2e only: the stand-in below; unset in production |

**Stand-in.** `e2e/notifications-mock.ts` answers `POST /bot<token>/sendMessage` and `POST /emails` and lists what
it got at `GET /sent?number=<order number>` (and every email to one address at `GET /sent?to=<address>`, for
Auth's emails through the hook). Playwright starts it on `E2E_PORT + 2000` (CI: 5000) and points the
app at it with `NOTIFICATIONS_SEND=true` and test keys (`playwright.config.ts`). For a dev walk, from Git Bash:

```sh
NOTIFICATIONS_MOCK_PORT=5026 node e2e/notifications-mock.ts &
NOTIFICATIONS_SEND=true TELEGRAM_BOT_TOKEN=e2e-bot-token TELEGRAM_CHAT_ID=-100123 \
  TELEGRAM_API_BASE_URL=http://127.0.0.1:5026 RESEND_API_KEY=e2e-resend-key RESEND_API_URL=http://127.0.0.1:5026 \
  EMAIL_FROM="TJS dev <orders@example.test>" npx next dev -p 3026
curl "http://127.0.0.1:5026/sent?number=10001"
```

## Vercel

The shop runs on the Vercel project `tjs-next` in the team `arzibursts-projects`, production
`https://tjs-next.vercel.app`, Hobby plan until the owner decides (D32). Project settings and environment
variables are changed only in the dashboard, by the owner or the coordinator; the repository holds
`vercel.json` (deploys and cron).

**Deploys.** Only `main` deploys: every push to `main` (a squash merge) builds a production deployment from
the Vercel Git integration. `git.deploymentEnabled` in `vercel.json` (`"**": false`, `"main": true`) turns off
the deployments of every other branch, so task branches, `assets/<task>` and Dependabot branches build no
preview: there is no preview database (D14), and a preview without one only renders errors. Verification
happens on the local stacks and in CI (`docs/ci.md`). A rollback is an instant rollback to an earlier
production deployment in the dashboard; the database is not rolled back with it.

**Production environment variables** (names only; the values live in the Vercel project, never in a file):

| Name | Read by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | every Supabase client; build time (inlined) and the image optimizer's allowed host |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the browser and server Supabase clients (public by design, RLS guards the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only: the auth rate limits, admin reads, the rates job |
| `NEXT_PUBLIC_SITE_URL` | the shop's public origin for canonical and hreflang URLs; unset → `VERCEL_PROJECT_PRODUCTION_URL` |
| `CRON_SECRET` | the cron routes; Vercel Cron sends it as `Authorization: Bearer …` |
| `NOVA_POSHTA_API_KEY` | server only: the Nova Poshta client (optional, see Nova Poshta above) |
| `NOVA_POST_API_KEY` | server only: Nova Post international delivery (#23); unset → zone flat rates only. `NOVA_POST_API_URL` stays unset in production |
| `AI_GATEWAY_OIDC` | server only: `true` turns on the admin's machine translation through the AI Gateway with the deployment's OIDC token (#19); unset → "not configured". Not set yet: the owner decides on the gateway billing. `AI_GATEWAY_API_KEY` / `AI_GATEWAY_BASE_URL` stay unset in production |
| `NOTIFICATIONS_SEND`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | server only: the order notifications (#26, see Notifications above); the values are TBD from the owner, and until they are set every message is `skipped_unconfigured` |
| `SEND_EMAIL_HOOK_SECRET` | server only: the secret of Supabase Auth's Send Email Hook (#99, Auth emails in the user's language above), production only; set it before the hook is enabled in the dashboard |
| `SENTRY_DSN` | server only, optional: a Sentry-compatible DSN the server errors are also reported to (#31, the provider is TBD by the owner); unset → the errors are only in the function logs |

Set by Vercel itself: `VERCEL_ENV` (`production` turns on Analytics and Speed Insights) and
`VERCEL_PROJECT_PRODUCTION_URL`. `TJS_UI_KIT` and `NOVA_POSHTA_FIXTURES` are never set on Vercel (the `/ui-kit`
and `/delivery-demo` showcases stay a 404; the fixture transport refuses under `VERCEL_ENV=production`).

**Cron.** `vercel.json` `crons` calls `GET /api/cron/fx-rates` daily at `15 14 * * *` (UTC) on the
production deployment only, with `CRON_SECRET`; without the secret the route answers 401. On Hobby, Vercel
fires a daily cron at some minute within that hour, always after NBU publishes at 15:30 Kyiv.
`GET /api/cron/nova-poshta` refreshes the Nova Poshta dictionary cache daily at `30 2 * * *` (UTC), with the same
secret. `GET /api/cron/staged-uploads` (#92) removes photo uploads older than a day that never left the private
`product-image-uploads` staging bucket, daily at `45 3 * * *` (UTC), and `GET /api/cron/notifications` (#26) sends
the due retries of the notifications outbox at `0 0`, `0 6`, `0 12` and `0 18` UTC (four entries of the same path),
all with the same secret (Hobby allows up to 100 crons a project, each at most once a day; the same path may have
several entries; `tests/money/vercel-cron.test.ts` checks every schedule). Runs and
their logs: the project's *Cron Jobs* settings and the function logs.

**Web Analytics and Speed Insights** (enabled in the project by the owner). `src/components/layout/vercel-insights.tsx`
renders `@vercel/analytics/next` and `@vercel/speed-insights/next` in the document of every page only when
`VERCEL_ENV` is `production`: local builds, CI and `next dev` load neither script. Both are cookieless; the
shop sends no custom events, so no personal data leaves through them. Visits and Web Vitals: the project's
*Analytics* and *Speed Insights* tabs.

## Launch, production smoke and server errors

The manual steps to go live, in order: `docs/launch.md` (#31).

**Production smoke** (`e2e/smoke-prod/`): checks of any running deployment that order nothing and sign nobody in
— the home, the shop, a product, search, a guest cart, the sign-in page, robots and the sitemap, the share image
and the security headers. The only writes: the guest cart's cookie in the test's browser and the cart's
rate-limit counter rows (`consume_rate_limit`, per visitor, expiring on their own). It starts no server and needs
no stack:

```sh
E2E_BASE_URL=https://tjs-next.vercel.app npm run test:smoke-prod
E2E_BASE_URL=http://localhost:<3000+n> npm run test:smoke-prod   # against your `next start`
```

On GitHub: Actions → **Production smoke** → Run workflow with the URL (`.github/workflows/smoke-prod.yml`).

**Server errors** (`src/instrumentation.ts`, `src/lib/monitoring/`): every error Next captures on the server is
logged once as a structured JSON event, `{"level":"error","event":"server_error","requestId":…,"path":…,
"errorType":…,"message":…}`, without the query string and with e-mails, phones and tokens masked. Next prints its
own line for the same error too; `console.error` and `console.warn` are wrapped with the same masks (also for an
unhandled rejection), so that line is masked as well. A page response carries its `x-request-id`, so a reported
problem can be found in the logs.
With `SENTRY_DSN` set the event is also sent to that endpoint (a Sentry envelope, 2 s timeout, never retried).

**Legacy shop links** (`src/lib/redirects/`): the old react-router paths (`/shop/see-all`, `/shop/<type>`,
`/product/<MongoDB id>`, `/about-us`, `/sign-in-and-up`, `/cart`, `/order-details`, `/add-item`, `/orders`, …)
answer 308 to the new page in the visitor's locale (the locale cookie, else the browser language, else `en`). A
product id resolves through `products.legacy_id` with the service role (cached 10 minutes per server); an unknown
or unpublished one lands on the shop.

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

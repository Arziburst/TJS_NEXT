# Coding standards

Every change follows these rules; the reviewer checks against them. `AGENTS.md` is the short version.
Business values (prices, markets, locales, statuses …) are not here — they live only in
`docs/decisions.md`.

## 1. Principles

- **Parity of behaviour, not implementation (D20).** A task keeps what the legacy app does for the user
  and rebuilds it the right way for Next.js + Supabase. Never port a legacy workaround; the brief names
  the behaviour to keep and the workaround not to copy.
- **No invented business values.** A value missing from `docs/decisions.md` renders as a visible `TBD`
  (or `—` for a price) and is raised as a question.
- **Smallest correct change.** Stay inside the task; out-of-scope findings become an issue.
- **No new dependency** without a concrete need stated in the PR. Before writing a helper, component,
  hook, type or constant, look for an existing one.

## 2. TypeScript

- `strict: true`; never loosen `tsconfig.json`, never `@ts-ignore`. `any` only with a comment saying why.
- Explicit, typed functions over generic abstractions. Results that can fail are discriminated unions,
  never thrown to the UI:
  ```ts
  type Result = { ok: true; order: Order } | { ok: false; reason: "notAuthorized" | "invalid" | "unexpectedError" };
  ```
- Money in integer minor units (`amount_minor`), checked with `Number.isSafeInteger` on input and on every
  arithmetic result; never floats for money.
- Business time through one shared helper with an explicit IANA time zone, never server-local time.
- Comments only where the *why* is not obvious from the code; no issue narration in comments.

## 3. Next.js App Router

- **Server Components by default.** `"use client"` only for a component that needs interaction, state,
  effects or browser APIs; keep client components small leaves, pass server data in as props.
- Routes compose, fetch and render; business logic lives in `src/lib/<domain>/`, UI in `src/components/`.
  Colocate feature code with its route; promote to shared only when reused.
- **Mutations through Server Actions** (`actions.ts` next to the route). Every action:
  1. validates its input with **zod** (`schema.safeParse`), never trusting the client;
  2. re-checks the user and role itself — an action is a public entry point;
  3. returns a discriminated-union result; then revalidates what changed.
- Route handlers only where a non-browser caller exists (payment webhooks, cron, OAuth callback).
  Webhooks verify signatures; cron routes fail closed when their secret is unset.
- `src/proxy.ts` (Next 16 name, never `middleware.ts`) refreshes the session only; it is **not** the
  authorization boundary — Server Components/Actions check auth, RLS enforces data access.
- Cache Components are on (`cacheComponents: true`): read the Next docs in `node_modules/next/dist/docs/`
  before using `"use cache"`, `cacheLife`, `cacheTag`; never cache per-user data in a shared cache.
- Feature flags are "exactly `true` turns it on" (`process.env.PAYMENTS_LIVE === "true"`).
- **Not found pages (Next 16.4.1 + Cache Components, found in #43).** A `notFound()` thrown while a
  route is prerendered (at build time, or in the fallback shell of a route with unknown params) is
  stored as an empty `<html id="__next_error__">` shell that only client JavaScript fills in: status
  404, but no text and no `<title>` for crawlers and no-JS clients. Making the page dynamic (`await
  params`) is worse: the static layout shell is already sent, so the answer is **200** with an error
  shell that still lacks the not-found text. `next dev` renders it fine, so only a production build shows it. Rules:
  - Unknown URLs need no code: there is no catch-all route; they reach `src/app/global-not-found.tsx`,
    which renders per request in the visitor's locale (the proxy's `X-NEXT-INTL-LOCALE` header via
    `src/i18n/request.ts`) with the site shell, a localized `<title>` and status 404.
  - Do not add a catch-all (`[...rest]`) that calls `notFound()`, and do not rely on `notFound()` in a
    prerendered page for a crawler-visible 404 until a production-build test proves it works on the Next
    version in use.
  - A missing resource under a real route (an unknown product slug, #15/#16) must still answer 404
    with the localized text in the HTML. Prove the chosen way in the task — e.g. the proxy checks the
    slug and rewrites to a path no route matches, which then gets the global 404 (the Next docs'
    suggestion; not yet verified here) — and raise it as a question if none works.
  - Test pattern: an e2e against `next build` + `next start` that requests the URL with `request.get`
    (no JavaScript) and asserts the status 404, `<html lang="<locale>"`, the localized `<title>` and the
    message text in the raw HTML (see "the 404 under a locale is server-rendered …" in
    `e2e/i18n.e2e.ts`).
- **No `"use cache"` database read in a route shell that the header links to (Next 16.4.1, found in
  #15).** Such a read leaves the client's `/_tree` prefetch of that route open once the request carries
  any cookie (the server answers at once; the browser never finishes the request), so pages linking to it
  never reach network idle. Put database reads inside the page's own cached entry (request-time data in
  its Suspense boundary, e.g. the shop listing), and keep shell texts static (category names come from
  the messages).
- **Route registry (`src/config/routes.ts`).** Every shop route is listed once with its locale-less
  `path` and an `enabled` flag; the shell (header nav, mobile menu, cart and account slots) links only to
  enabled routes, because the client router prefetches every link and a link to a page that does not
  exist yet answers 404 (console errors on the production build). The task that lands a page sets its
  route to `enabled: true` in the same change and links to it via `routes.<key>.path`, never a
  hard-coded path. The shell e2e (`expectOnlyEnabledRouteLinks` in `e2e/routes.ts`) assert that enabled
  routes are linked and disabled ones are not; the dev-only `/ui-kit` showcase is not in the registry.

## 4. Data and security

- **Data access only in a server-side layer**: `src/lib/` modules that start with `import "server-only"`.
  Client components never query the database directly.
- **No secret in client code**: the Supabase service-role/secret key, payment private keys, bot tokens and
  API keys are read only on the server and never put in a `NEXT_PUBLIC_*` variable. `.env.example` lists
  names only; real values never enter git.
- **RLS on every table** exposed through the Data API, enabled in the migration that creates it.
  Policies wrap `auth.*` and helper calls in `(select …)`; helpers live in schema `private`; INSERT/UPDATE
  policies constrain attribution columns (`created_by = (select auth.uid())`).
- The admin role is granted only in the database and checked on the server and in RLS — never only in
  the UI.
- Escape user data in every output channel (HTML emails, Telegram HTML).

## 5. UI, layout and text

- shadcn/ui components first (`npx shadcn@<pinned> add <name>`), themed to the TJS tokens (task #9);
  keep their accessibility when customizing. Tailwind v4 CSS-first: tokens in `src/app/globals.css`,
  no `tailwind.config`.
- **Responsive layout in CSS only** — Tailwind breakpoints, container queries, `hidden sm:block`.
  Never branch rendering on `window.innerWidth`, `matchMedia` or a user-agent check.
- **All user-visible text through next-intl** (from task #10): messages per locale, no hard-coded strings
  in components, metadata or emails. The placeholder page of task #7 was moved into messages by #10;
  ESLint `react/jsx-no-literals` fails on literal JSX text.
- Every user-visible change is walked in the browser on desktop 1440 and mobile 390: no console errors,
  no hydration warnings, keyboard focus visible; screenshots in the PR.

## 6. Testing

| Level | Tool | Where | Command |
|---|---|---|---|
| Unit | vitest | `src/**/*.test.ts(x)` next to the code, `tests/**/*.test.ts` | `npm run test:unit` |
| Database | pgTAP | `supabase/tests/<feature>_test.sql` | `npx supabase test db` (from task #8) |
| End to end | Playwright | `e2e/**/*.e2e.ts` | `npm run test:e2e` |

- Definition of done: lint + typecheck + unit + build; with a migration also db reset + pgTAP; e2e for
  every changed flow.
- Mandatory tests on critical paths: checkout and payment (webhook signature, idempotency, charged =
  displayed amount), prices / FX / totals, auth and the admin role, RLS, order creation and notifications.
- pgTAP: `BEGIN; create extension if not exists pgtap with schema extensions; select plan(n);` → fixtures
  with random emails → assertions incl. role switches → `select * from finish(); ROLLBACK;`. RLS needs
  **negative** tests: other users' rows invisible, spoofed attribution rejected, revoked role loses access.
- e2e smoke tests are non-mutating; e2e that writes data runs against a local stack only.
- Never weaken a test, timeout or tolerance to get green; a flaky test is a bug to fix.

## 7. Database migrations

- Schema changes only through `supabase/migrations/`; never edit production by hand, never edit or
  renumber a merged or applied migration — add a new one.
- Name: `YYYYMMDDHHMMSS_snake_case_description.sql`, exactly 14 digits, the version unique across the
  repo and every open branch (Supabase keys history on the version, not the file name).
- **Owned slots:** a branch claims one slot — today's date + `HHMM00` — and writes it in the PR body;
  a second migration in the branch is `+1` on the last digits (`…100000`, `…100001`). Before writing,
  check `origin/main`, every open PR and the remote history; do not use `supabase migration new` blindly
  (it stamps `now()` and parallel branches collide). On a collision, renumber **your** unmerged file.
- Seed / QA data in `supabase/seed.sql`, never in migrations; migrations hold only real reference data.

## 8. Git, commits and PRs

- Branch: `<issue>-<type>-<slug>`, e.g. `12-feat-catalog-page`; one worktree per task.
- Commit: `type(scope): subject (#<issue>)` — types `feat, fix, docs, style, refactor, test, chore`;
  imperative, lowercase, no period, ≤ 72 characters; body with what and why. Commit + push per finished
  green block; never amend or force-push a pushed commit; never commit red or unrelated work.
- PR: draft at the first push, base `main`, title as the commit subject, body from the template
  (`Closes #<n>`, Summary, Test plan with only what was run, migration slot). The verifier marks it ready;
  the coordinator squash-merges.
- Dependencies are pinned to exact versions (`npm install --save-exact`); `package-lock.json` is committed;
  Node comes from `.nvmrc`.

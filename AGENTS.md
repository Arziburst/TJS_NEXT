<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TJS — rules for every agent and reviewer

TJS is a bijouterie web shop (Ukraine + EU + Switzerland), rebuilt from the legacy `TJS_frontend_2` +
`TJS_backend` as one Next.js app on Supabase, deployed on Vercel. These rules apply to every change;
reviewers check against them.

## Read first

1. `docs/decisions.md` — the only source of business values (prices, markets, locales, statuses …).
   A value that is not there is a visible `TBD` and a question to the owner, never a guess.
2. `docs/standards.md` — the coding standards (architecture, data, i18n, layout, tests, migrations, git).
3. The task's issue and its acceptance criteria. Work only inside its scope.

## Stack

Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript strict · Tailwind CSS v4
(CSS-first, no `tailwind.config`) · shadcn/ui (`base-nova` style, Base UI primitives) · vitest ·
Playwright · Node 24 (`.nvmrc`). Coming in later tasks: Supabase (`@supabase/ssr`), next-intl.

## Setup and commands

```sh
nvm use            # Node from .nvmrc
npm ci
npm run dev        # http://localhost:3000; a worktree for issue <n> uses port 3000 + <n>: npm run dev -- -p 3007
npm run lint
npm run typecheck  # runs `next typegen` first (typed routes), then tsc --noEmit
npm run test:unit  # vitest
npm run test:e2e   # Playwright; starts `next dev` on E2E_PORT (default 3000), or targets E2E_BASE_URL
npm run build
```

- First e2e run on a machine: `npx playwright install chromium`.
- If Windows Application Control blocks Turbopack's native SWC binary, fall back to
  `next dev --webpack` / `next build --webpack` and say so in the PR.
- Stop a dev server **by its port** (`Get-NetTCPConnection -LocalPort <port> -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess }`), never by process name — killing `node.exe`
  kills every other session.

## Definition of done

`npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run build` pass; with a migration also
`db reset` + pgTAP; Playwright e2e for every changed flow. Every user-visible change is walked in the
browser on **desktop 1440** and **mobile 390** with no console errors, screenshots in the PR.

## Non-negotiables

- **Parity of behaviour, not implementation (D20).** Keep what the legacy app does for the user; never
  port its workarounds (route trees switched by `isLoggedIn`, layout switched by `window` width, secrets
  in the client bundle, admin checks only in the UI …).
- **Business values only from `docs/decisions.md`**; anything missing renders `TBD` and is raised as a
  question. Never invent prices, rates, texts of legal pages, statuses or limits.
- **Server first.** Server Components by default; `"use client"` only for interaction. Mutations through
  Server Actions validated with zod; each action re-checks the user and role itself.
- **Data access only on the server**, through `src/lib/` server modules (`import "server-only"`). No
  service-role key, private API key or secret in client code or in a `NEXT_PUBLIC_*` variable.
- **RLS on every table**, with negative pgTAP tests.
- **Responsive layout in CSS only** (Tailwind breakpoints, container queries), never by `window` width.
- **All user-visible text through next-intl** (from task #9 on); no hard-coded strings in components.
- Never disable or loosen TypeScript, ESLint, tests, timeouts or tolerances to get green.
- No new dependency without a concrete need named in the PR; versions pinned exactly.

## Change flow

- Branch `<issue>-<type>-<slug>` (e.g. `12-feat-catalog-page`), one worktree per task, never work on `main`.
- Commit `type(scope): subject (#<issue>)`, imperative, lowercase subject, no period; body says what and
  why. Commit and push after every finished green block; never amend or force-push a pushed commit.
- Open the PR as a **draft** at the first push, base `main`, from `.github/pull_request_template.md`:
  title as the commit subject, `Closes #<n>`, Summary, Test plan with only what was actually run, the
  claimed migration slot if any.
- The implementer never marks its own PR ready: the verifier does, on approval with no Blocker / Major.
  Merges are squash merges by the coordinator.
- A question gets an answer, not a change. Out-of-scope findings become a new issue, not a drive-by fix.

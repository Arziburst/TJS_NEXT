# TJS

Web shop for TJS bijouterie: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 +
shadcn/ui, on Supabase, deployed on Vercel.

## Start

```sh
nvm use      # Node 24, from .nvmrc
npm ci
npm run dev  # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | development server (Turbopack) |
| `npm run build` / `npm start` | production build / serve it |
| `npm run lint` | ESLint (flat config, `eslint-config-next`) |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run test:unit` | vitest |
| `npm run test:e2e` | Playwright (first run: `npx playwright install chromium`) |

## Rules

- [`AGENTS.md`](AGENTS.md) — rules for every contributor and agent (`CLAUDE.md` points to it).
- [`docs/standards.md`](docs/standards.md) — coding standards.
- [`docs/decisions.md`](docs/decisions.md) — business decisions, the only source of business values.

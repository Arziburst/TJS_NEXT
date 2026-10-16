# Launch checklist

One list of every manual step between "the code is done" and "real customers order" (#31). It collects the
launch items of #13, #14, #15, #21, #28, #93 and #99 (their comments on issue #31) and the steps of the host and
domain switch. Work top to bottom: a step depends on the ones above it.

Tags: **[owner]** decides, signs up, pays or clicks in a dashboard only the owner can open; **[coordinator]**
does it (or a task it starts); **[owner + coordinator]** the owner gives the value, the coordinator sets it.
Never paste a secret into an issue, a PR or a chat: values go straight into the dashboard of the service that
uses them. Names of the environment variables: `.env.example` and `docs/dev-environment.md` ("Vercel").

## 0. Decisions that are still open

| # | Decision | Who | Status |
|---|---|---|---|
| 0.1 | **Hosting** (D32): Vercel Hobby is for non-commercial use only — before the first real order the shop moves to Vercel Pro (about $20/month) or another host. | owner | **TBD** |
| 0.2 | **Domain**: `tjstore.pp.ua` (the legacy shop's) or another one. Everything below that says `<domain>` waits for it. | owner | **TBD** |
| 0.3 | **Email sender** address and domain for Resend (`EMAIL_FROM`). | owner | **TBD** |
| 0.4 | **Telegram**: the bot and the group for order notifications, or none. | owner | **TBD** |
| 0.5 | **Error monitoring provider** (any Sentry-compatible DSN, or none: the server logs stay the record). | owner | **TBD** |
| 0.6 | **Backups**: a Supabase plan with daily backups, or the manual dump of §7. | owner | **TBD** |
| 0.7 | **Strict script CSP** (follow-up of #31): render every page per request to drop `'unsafe-inline'` for scripts, at the cost of the static shells (`docs/standards.md` §4 "Security headers"). | owner | **TBD** |

## 1. Accounts and keys

1. **[owner]** Resend: add and verify the sender domain (0.3), create an API key.
2. **[owner]** Nova Poshta: a **new** API key. The legacy key was committed in the old repository
   (`coordinator/research/frontend.md`, "committed secret"): revoke it in the Nova Poshta cabinet.
3. **[owner]** Google OAuth client (Google Cloud console): web client, authorized redirect URI
   `https://zmwjhpodaxyphlyzwedf.supabase.co/auth/v1/callback` (the Supabase project's, not the shop's).
4. **[owner]** Telegram (0.4): the bot token and the group's chat id, if chosen.
5. **[owner]** Error monitoring (0.5): the project's DSN, if chosen.

## 2. Production environment variables

**[owner + coordinator]** In the host's production environment (Vercel: Project → Settings → Environment
Variables → Production), then redeploy. Already set (2026-10-15): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.

| Variable | Value from |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://<domain>` once the domain is live (§8); until then unset (the Vercel production URL is used) |
| `NOVA_POSHTA_API_KEY` | §1.2 |
| `NOVA_POST_API_KEY` | the owner's Nova Post contract, when there is one (until then: zone flat rates) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (optional) | §1.1 |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | §1.4 (the chat id set in the admin settings wins over the variable) |
| `NOTIFICATIONS_SEND` | `true` only when the keys above are set: before that every message stays `skipped_unconfigured` |
| `SENTRY_DSN` | §1.5, optional; unset = no reporting, errors only in the server logs |
| `AI_GATEWAY_OIDC` | `true` when the owner accepts the gateway billing (machine translation in the admin) |
| `SEND_EMAIL_HOOK_SECRET` | §3.6 — set before the hook is enabled |

Never set on production: `TJS_UI_KIT`, `NOVA_POSHTA_FIXTURES`, `NOVA_POST_API_URL`, `AI_GATEWAY_API_KEY`,
`AI_GATEWAY_BASE_URL`, `TELEGRAM_API_BASE_URL`, `RESEND_API_URL`.

## 3. Supabase Auth (production project `tjs-prod`, dashboard → Authentication)

1. **[owner]** URL configuration: Site URL and redirect URLs. Set on 2026-10-15 to
   `https://tjs-next.vercel.app` and `https://tjs-next.vercel.app/**`; change both at the domain switch (§8).
2. **[owner]** Email templates and subjects: confirmation, recovery and **email change**, from
   `supabase/templates/` (token-hash links to `/<locale>/auth/confirm`). They stay set even with the hook on:
   Auth uses them again if the hook is disabled.
3. **[owner]** Providers → Google: the client id and secret of §1.3; enable.
4. **[owner + coordinator]** Rate limits: every sign-in and sign-up reaches Supabase from the app's server, so
   Auth's per-IP limit is a **shop-wide** limit. Raise it to a shop-wide budget (the app's own limiter counts
   per visitor and per email: 15 per 5 minutes, `src/lib/auth/rate-limit-keys.ts`). The numbers: **TBD**,
   written down here when chosen.
5. **[owner]** The admin role for the owner's account (SQL editor, as the database owner; the account must exist):

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = '<owner e-mail>');
   ```

6. **[owner + coordinator]** Auth emails in the user's language (#99), in this order
   (`docs/dev-environment.md` "Auth emails in the user's language"): the email transport works (§2:
   `NOTIFICATIONS_SEND`, `RESEND_API_KEY`, `EMAIL_FROM`) → Auth Hooks → Send Email → HTTPS
   `https://<current production origin>/api/auth/send-email`, generate the secret, put it into
   `SEND_EMAIL_HOOK_SECRET` (production only), redeploy → enable the hook → sign up, reset a password and change
   an email in two languages and check the emails.

## 4. Shop data

1. **[coordinator]** The legacy catalogue is imported (D33, `docs/dev-environment.md` "Legacy catalogue
   import"); the legacy product links redirect through `products.legacy_id`. Check in the SQL editor:
   `select count(*) from public.products where legacy_id is not null;` — the number of imported products.
2. **[owner + coordinator]** Shop settings (`/<locale>/admin/settings`, #21), each value confirmed by the
   owner: the contact channels (the legacy site showed a phone, an Instagram account and an e-mail — confirm
   they are still right), the Telegram chat id (§1.4), the About page texts.
3. **[owner]** Walk the catalogue in the admin: prices, photos, texts, categories.

## 5. Scheduled jobs

1. **[coordinator]** Exchange rates: production has no `fx_rates` until the first run, so every price shows
   "—". Right after the first production deploy, once (the secret from the host's environment, never echoed):

   ```sh
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<production origin>/api/cron/fx-rates
   ```

   Then check that a price shows on a product page.
2. **[coordinator]** The same once for `/api/cron/nova-poshta` (the delivery dictionary cache).
3. **[coordinator]** The crons are scheduled: Vercel → Project → Settings → Cron Jobs lists fx-rates,
   nova-poshta, staged-uploads and notifications (`vercel.json`). On another host they need a scheduler of
   its own calling the same paths with `Authorization: Bearer <CRON_SECRET>` on the same schedules.

## 6. Verify the deployment

1. **[coordinator]** Production smoke: GitHub → Actions → **Production smoke** → Run workflow with the
   production URL (`e2e/smoke-prod/`, read-only). All green, including the security headers.
2. **[coordinator]** Legacy links: `/shop/see-all`, `/shop/necklace`, `/about-us` and one `/product/<legacy id>`
   (an id from §4.1) answer 308 to the localized pages.
3. **[coordinator]** Errors: the host's function logs show server errors as one JSON line each
   (`"event":"server_error"`, with `requestId`); with `SENTRY_DSN` set, the same event reaches the provider.
4. **[owner + coordinator]** Cache race check (#93): on Vercel the route-cache race is not covered by
   Vercel's docs. Upload two photos one after another to a product in the admin, then open the product page in a
   fresh browser context and reload after a few seconds: both photos must show. If not, file a bug (the fix:
   `revalidatePath` after the write, or a Vercel-specific workaround).
5. **[owner + coordinator]** One real order end to end with a cheap or test product: the order, the customer's
   email, the Telegram message, the order in the admin; then cancel it in the admin.

## 7. Backups and the restore drill

1. **[owner]** Decide 0.6. Dashboard → Database → Backups shows what the project's plan keeps.
2. **[coordinator]** Without plan backups: a logical dump before launch and then on a schedule the owner sets
   (**TBD**), stored outside Supabase (the owner's backup folder):
   `npx supabase db dump --db-url "<the production connection string>" -f tjs-prod-<date>.sql` and the same
   with `--data-only`. The Storage files (bucket `product-images`) are not in a database dump: copy them through
   the Storage API (a list-and-download of the bucket) to the same place.
3. **[coordinator]** Restore drill, once before launch and after every plan change: restore the latest dump
   into a fresh local stack, run `npm run build` and the smoke suite against it
   (`E2E_BASE_URL=http://localhost:<port> npm run test:smoke-prod`), and write the date and the result here.

## 8. Host and DNS cutover (for any host)

Only after 0.1 and 0.2. The order keeps the shop reachable at every step.

1. **[owner + coordinator]** On a host other than Vercel: Node 24 (`.nvmrc`), `npm ci && npm run build &&
   npm run start` behind an HTTPS reverse proxy that sets `X-Forwarded-Proto: https` (HSTS is sent only then),
   a scheduler for the crons (§5.3), one app process (more processes need a shared cache handler first:
   `docs/standards.md` §3 "Hosting"), and the production variables of §2. Vercel Analytics and Speed Insights
   stay off there (`VERCEL_ENV` is unset).
2. **[owner]** 24–48 hours before: lower the TTL of the domain's current DNS records to 300 s.
3. **[owner]** Add the domain on the host (Vercel: Project → Domains); the host shows the records to set.
4. **[owner]** At the DNS provider: replace the records with the host's (an `A`/`AAAA` for the apex, a `CNAME`
   for `www`, as the host says); keep a note of the old records for the rollback.
5. **[coordinator]** Wait until the host reports the domain valid and its TLS certificate issued;
   `https://<domain>` serves the shop.
6. **[owner + coordinator]** `NEXT_PUBLIC_SITE_URL=https://<domain>` (§2) and redeploy: canonical URLs, the
   sitemap, share images and email links use it.
7. **[owner]** Supabase Auth: Site URL `https://<domain>`, redirect URLs `https://<domain>/**` (keep the old
   origin's until the cutover is done); the Send Email Hook URL `https://<domain>/api/auth/send-email`.
8. **[owner]** Google OAuth client: add `https://<domain>` to the authorized JavaScript origins (the redirect
   URI stays Supabase's).
9. **[coordinator]** §6.1 (smoke) and §6.2 (legacy links) against `https://<domain>`; the legacy shop's URLs
   now land on the new pages with 308.
10. **[owner]** Google Search Console: verify the domain, submit `https://<domain>/sitemap.xml`.
11. **[owner]** A week later, when nothing needs a rollback: raise the TTL again; optionally HSTS with
    `includeSubDomains` (only if every subdomain of the domain serves https — the app sends it without,
    `src/lib/security/headers.ts`).

Rollback: restore the noted DNS records (§8.4); the old origin keeps working while its Auth URLs stay in the
redirect list.

## 9. After launch

- **[coordinator]** Read the function logs for `server_error` lines in the first days.
- **[coordinator]** The browser console of the main pages shows `[Report Only]` CSP violations of the strict
  policy: expected (0.7); anything else is a bug.
- **[owner]** The Vercel Hobby plan is non-commercial: a shop taking orders must not stay on it (0.1).

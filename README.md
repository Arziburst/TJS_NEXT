# #30 assets

Lighthouse 13.5.0, mobile, simulated throttling (default), headless Chrome, Windows, local stack, the server warmed
first. `main-*` = main c5d1347, `pr-*` = PR #103 (merged with c5d1347), both `npm run build` + `next start -p 3030`.
`prod-*` = https://tjs-next.vercel.app (read only, for reference).

| page | main c5d1347 (perf) | PR #103 (perf) | SEO (both) | production (perf / SEO) |
|---|---|---|---|---|
| home `/en` (prod `/uk`) | 85 · 89 · 90 → **89** | 88 · 89 · 89 → **89** | 100 | 94 · 90 · 90 → **90** / 100 |
| shop `/en/shop` (prod `/uk/shop`) | 86 · 88 · 88 → **88** | 89 · 89 · 87 → **89** | 100 | 86 · 89 · 81 → **86** / 100 |
| product `/en/product/coral-drop-earrings` (prod `/uk/product/serezhky-68`) | 87 · 90 · 90 → **90** | 89 · 90 · 90 → **90** | 100 | 92 · 86 · 86 → **86** / 100 |

CLS 0 in every run. The ≥ 90 performance target moved to #105 (client JS budget): the observed LCP is 0.1–0.35 s,
the simulated one 3.4–4.0 s, because every JS chunk (~280 KB gzip) arrives before LCP on localhost and counts in
lantern's LCP graph.

Share images (`og-*.png`, 1200 × 630) from the production build; walk screenshots at 1440 and 390.

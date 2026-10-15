# #53 image optimization — evidence

All on commit 583a367: `npm run build` + `npx next start -p 3053`, local stack tjs-53 with `npm run seed:images`,
Windows 11. Lighthouse 13.5.0 (`npx lighthouse@13.5.0 <url> --only-categories=performance`, default mobile
emulation and simulated throttling, headless Chrome).

| page | run 1 | run 2 | run 3 | run 4 | run 5 | median | CLS |
|---|---|---|---|---|---|---|---|
| /de/shop | 89 | 90 | 90 | 90 | 90 | **90** | 0 in every run |
| /de/product/korallen-tropfenohrringe | 92 | 92 | 91 | 92 | 91 | **92** | 0 in every run |

- `lighthouse-<page>-run<n>.html|json` — the five runs above.
- `lighthouse-<page>-fonts-unchanged.html` — image optimization without the font-preload change and without
  the priority fixes: 82 / 82 (LCP 4.9 s), the diagnosis that led to the font change.
- `optimizer-and-fonts.txt` — curl of one `/_next/image` URL (AVIF 384×384, WebP fallback, 400 for an
  unlisted quality) and the @font-face / preload counts of the build.
- Screenshots (Playwright MCP, production build): `shop-1440-hover.png` (first card hovered),
  `shop-390.png`, `product-1440.png`, `product-390.png`, `product-390-slide2.png`, `home-1440.png`,
  `home-390.png`, `fonts-uk-390.png`, `fonts-cs-390.png`.

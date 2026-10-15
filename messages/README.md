# Messages

All user-visible text of the app, read through next-intl. One folder per locale (D3), one JSON file per
namespace:

```
messages/<locale>/{common,nav,home,catalog,product,cart,checkout,auth,account,admin,errors}.json
```

- `en` is the source: its files define the keys and the TypeScript types (`src/i18n/messages.ts`,
  `AppConfig` in `src/i18n/global.d.ts`), so `t("missing.key")` fails `npm run typecheck`.
- Every locale must have exactly the keys and ICU placeholders of `en`; `tests/i18n/messages.test.ts`
  enforces it and formats every message once. Add a key to all 11 locales in the same change.
- Placeholders are ICU (`{min}`, `{currency}`); never put a straight apostrophe right before `{`.
- `nav.localeNames` holds the autonyms and is identical in every locale.
- A new namespace needs a file in every locale and an entry in `namespaces` and `Messages` in
  `src/i18n/messages.ts`.

## Review status

| Locale | Source | Status |
|---|---|---|
| en | written from the legacy en catalog (`TJS_frontend_2`) | source, reviewed by no native speaker yet |
| uk | legacy uk catalog; keys new in this rebuild translated by machine | legacy keys kept; **new keys unreviewed** |
| de, fr, es, it, pl, nl, cs, pt, ro | machine translation (LLM) from en | **unreviewed** |

Keys new in this rebuild (no legacy text): `home.meta.*`, `home.placeholder.*`, `errors.notFound.*`,
`nav.localeNames.*`, `nav.currency`, `common.price.*`. Legacy `{{ index }}` arguments became named ICU arguments; the legacy admin price
texts named UAH, now the currency is an argument (`{currency}`, D4: the admin enters USD).

Unreviewed machine translations must be checked by a native speaker before the locale is promoted
(D3); business texts keep the legacy meaning and are not reworded here.

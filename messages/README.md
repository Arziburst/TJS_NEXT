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

Keys new in this rebuild (no legacy text): `home.meta.*`, `home.introBrand`, `errors.notFound.*`,
`nav.localeNames.*`, `nav.currency`, `common.price.*`, and from #15 `catalog.sort.newest`,
`catalog.newBadge`, `catalog.loadError`, `catalog.meta.*`, `catalog.pagination.*` (`catalog.shownCount`
now bolds its numbers with `<b>`, as the legacy text did), and from #16 `product.page.*`; from #17 the admin
area (`admin.shell.*`, `admin.status.*`, `admin.fulfillment.*`, `admin.availability.*`, `admin.list.*`,
`admin.actionErrors.*`, `admin.form.*`; the form reuses the legacy `admin.product.*` labels) and the product
page's `product.page.clasp`, `dimensions`, `dimension.*`, `leadTimeRange` — written in en, **uk and the other 9
locales by machine (LLM), unreviewed**; from #22 `checkout.delivery.*` (Nova Poshta city, branch, address and
price; the legacy app had no such texts beyond `errors.form.chooseCity` / `chooseWarehouse`), uk and the other 9
locales by machine, unreviewed; from #21 the settings pages (`admin.shell.settings`, `admin.settings.*`), the
footer's channel names (`common.contact.instagram`, `telegram`, `viber`, `whatsapp`: brand names, the same in
every locale) and the About page's `common.about.tbd` and `fallbackNote` — written in en, uk and the other 9
locales by machine, unreviewed. Legacy `{{ index }}` arguments became named ICU
arguments; the legacy admin price texts named UAH, now the currency is an argument (`{currency}`, D4: the
admin enters USD).

Category names (`catalog.categories.*`) live here until admin-editable names are decided: the shop shell
cannot read them from the database (docs/standards.md, the `"use cache"` rule from #15). The categories
table has its own names; keep the two in step (D31: uk necklaces is «Намиста» in both).

Unreviewed machine translations must be checked by a native speaker before the locale is promoted
(D3); business texts keep the legacy meaning and are not reworded here.

## Reworded legacy texts — for the owner

While porting (#10) some legacy en/uk texts were reworded with the meaning kept. The owner decides per
row: **keep** the new text or **restore** the legacy one (then the other 9 locales are re-translated from
the restored en). Compared with `TJS_frontend_2/src/init/translations/configs/{en,uk}.json`; the
`{{ index }}` → `{min}` / `{url}` placeholder renames are not rewordings and are not listed.

| Key | Locale | Legacy text (legacy key) | Current text | Owner |
|---|---|---|---|---|
| `product.card.onlyOrder` | en | Only order (`cards.product.onlyOrder`) | Made to order | |
| | uk | Тільки замовлення | Тільки на замовлення | |
| `admin.product.deletionError` | en | Uninstall error (`pages.management.uninstallError`) | Deletion error | |
| `admin.order.notFound` | en | Order did not find (`pages.order.textIfNotData`) | Order not found | |
| `admin.order.title` | en | Information about order. (`pages.order.firstTitle`) | Information about the order. | |
| `admin.product.title` | uk | Будь ласка, введіть інформацію про продукт. (`pages.management.title`, `pages.order.secondTitle`) | Будь ласка, введіть інформацію про товар. | |
| `admin.product.typeLabel` | uk | Виберіть правильний тип продукту (`pages.management.labelType`, `pages.order.label`) | Виберіть правильний тип товару | |
| `admin.product.weightLabel` | uk | Введіть вагу продукту в грамах (`pages.management.labelWeight`) | Введіть вагу товару в грамах | |
| `admin.product.confirmDeletionTwice` | uk | Ви впевнені, що хочете видалити цей продукт? (`pages.management.confirmCompleteDeletionTwice`) | Ви впевнені, що хочете видалити цей товар? | |
| `admin.product.priceLabel` | en | Enter product price in UAH/₴ (`pages.management.labelPrice`) | Enter the product price in {currency} | |
| | uk | Введіть ціну товару у гривнях/₴ | Введіть ціну товару в {currency} | |
| `errors.form.priceMin` | en | The price must be at least {{ index }} UAH. (`errors.priceMinLength`) | The price must be at least {min} {currency}. | |
| | uk | Ціна повинна бути не менше {{ index }}грн. | Ціна повинна бути не менше {min} {currency}. | |
| `errors.form.chooseCity` | en | You have to write right city and click your city (`errors.clickRightCity`) | You have to type the right city and choose your city | |
| | uk | Вам потрібно написати правильне місто і натиснути на своє місто | Вам потрібно написати правильне місто і вибрати своє місто | |
| `errors.form.chooseWarehouse` | en | You have to click your warehouse (`errors.clickRightWarehouse`) | You have to choose your post office | |
| | uk | Вам потрібно натиснути на свій склад | Вам потрібно вибрати своє відділення | |
| `errors.form.chooseWarehouseNumber` | en | You have to write or click to number of warehouse (`errors.clickNumberWarehouse`) | You have to type or choose the number of the post office | |
| | uk | Вам потрібно написати або натиснути номер складу | Вам потрібно написати або вибрати номер відділення | |
| `errors.form.minItems` | uk | В поле должно быть минимум {{ index }} элемента (`errors.fieldMustHaveAtLeast`; the legacy uk file had Russian here) | Поле має містити щонайменше {min} елементи | |
| `product.sizeGuide` | uk | Посібник за розмірами (`pages.product.link`) | Таблиця розмірів | |
| `product.addedToCart` | en | The product added to the cart (`pages.product.buttonProductAddedToCart`) | The product was added to the cart | |
| | uk | Продукт було додано до кошика | Товар додано до кошика | |
| `product.images.alt` | en | Image of Product (`altImages.product`) | Image of the product | |
| | uk | Зображення продукту | Зображення товару | |
| `product.images.numberedAlt` | en | {{ index }} image of the product (`altImages.numberProduct`) | Image {index} of the product | |
| | uk | {{ index }} зображення товару | Зображення товару {index} | |
| `product.images.byUrlAlt` | en | Image by URL-adress {{ url }} (`altImages.imageByURL`) | Image by URL {url} | |
| `product.card.firstImageAlt` | en | First image of product (`cards.product.firstAltImageOfCard`) | First image of the product | |
| `product.card.secondImageAlt` | en | Second image of product (`cards.product.secondAltImageOfCard`) | Second image of the product | |
| `catalog.categories.necklaces` | en | Necklace (`categories.necklace`) | Necklaces | |
| `catalog.categories.brooches` | en | Brooch (`categories.brooch`) | Brooches | |
| | uk | Брошка | Брошки | |
| `catalog.categories.rings` | uk | Обручки (`categories.rings`) | Каблучки | |
| `catalog.categories.all`, `home.seeAll` | uk | Всі (`categories.see-all`); все (`pages.root.seeAll`) | Усі | |
| `catalog.shownCount` | en | Showed · from · products (`pages.shop.textShowed`, `textFrom`, `textProducts`, three pieces) | Showed {shown} of {total} products | |
| | uk | Показано · з · товарів | Показано {shown} з {total} товарів | |
| `home.seeAllImageAlt` | en | Image see all (`pages.root.altImage`) | Image "See all" | |
| | uk | Зображення все | Зображення "Усі" | |
| `home.categoryImageAlt` | en | Image of category (`pages.root.linkAltImage`) | Image of the category | |
| `common.noData` | en | Not data (`components.notData`) | No data | |
| `common.cookieConsent.accept` | uk | Зрозумів (`components.cookieConsentBanner.gotIt`) | Зрозуміло | |
| `common.about.intro` | en | My name is Elena , I follow … (`pages.aboutUs.firstTitle`) | My name is Elena, I follow … (space before the comma removed) | |
| | uk | … маю великий досвід роботи з прикрасами | … маю великий досвід роботи з прикрасами. (final period added) | |
| `common.about.motto` | en | Affordable luxury - is my motto! (`pages.aboutUs.secondPartOfSecondTitle`) | Affordable luxury is my motto! | |
| | uk | Доступна розкіш - ось мій девіз! | Доступна розкіш — ось мій девіз! | |
| `common.about.imageAlt` | en | Main image of "About us" page (`pages.aboutUs.mainAltImage`) | Main image of the "About us" page | |

Capitalization only (same words): legacy "select filter", "price (low to high)", "price (high to low)",
"grand total" now start with a capital letter (en and uk: `catalog.sort.*`, `checkout.payment.grandTotal`);
legacy Title Case became sentence case in "Add images from the Gallery", "Image from the Gallery",
"Contact Details", "Your Order", "Make Order", "Add to Cart", "Size Guide", "First Name", "Last Name", "Name and Surname"
and uk "Ел. Пошта", "Оформити Замовлення", "Увійти або Зареєструватися", "Ім'я та Прізвище"
(`admin.product.*`, `checkout.*`, `product.addToCart`, `product.sizeGuide`, `common.fields.*`, `auth.title`).
The nav labels are shown exactly as written (#43 removed the CSS `capitalize` that turned "About us" into
"About Us"); the legacy UI showed them capitalized.

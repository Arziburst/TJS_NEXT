import { expect, test, type Page } from "@playwright/test";
import deCatalog from "../messages/de/catalog.json" with { type: "json" };
import deCommon from "../messages/de/common.json" with { type: "json" };
import deErrors from "../messages/de/errors.json" with { type: "json" };
import enCatalog from "../messages/en/catalog.json" with { type: "json" };
import enCommon from "../messages/en/common.json" with { type: "json" };
import ukCatalog from "../messages/uk/catalog.json" with { type: "json" };
import { fixtureTitle } from "./catalog-fixtures";

// Needs the local stack: the seed plus the 30 brooches of e2e/catalog-fixtures.ts (31 brooches in all).

const SLUGS = ["earrings", "necklaces", "bracelets", "corals", "rings", "brooches"];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

const cards = (page: Page) => page.getByTestId("product-card");

async function chooseSort(page: Page, isMobile: boolean, label: string, value: string) {
  if (isMobile) {
    await page.getByTestId("mobile-filters").getByLabel(enCatalog.filterBy).selectOption(value);
  } else {
    await page.locator("aside").getByRole("link", { name: label }).click();
  }
}

for (const [locale, catalog] of [
  ["en", enCatalog],
  ["uk", ukCatalog],
] as const) {
  test(`home /${locale}: six category tiles linking to the shop`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/${locale}`);
    const tiles = page.getByTestId("category-tile");
    await expect(tiles).toHaveCount(6);
    for (const [index, slug] of SLUGS.entries()) {
      await expect(tiles.nth(index)).toHaveAttribute("href", `/${locale}/shop/${slug}`);
      await expect(tiles.nth(index)).toContainText(`(0${index + 1})`);
    }
    await expect(tiles.nth(5)).toContainText(catalog.categories.brooches, { ignoreCase: true });

    await tiles.nth(4).click();
    await page.waitForURL(`/${locale}/shop/rings`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(catalog.categories.rings, { ignoreCase: true });
    expect(errors).toEqual([]);
  });
}

// D31: the Ukrainian necklace category is plural, like the others
test("uk names the necklace category «Намиста» on the home tile, in the shop and in the metadata", async ({ page, isMobile }) => {
  await page.goto("/uk");
  await expect(page.getByTestId("category-tile").nth(1)).toContainText("Намиста", { ignoreCase: true });

  await page.goto("/uk/shop");
  const filter = isMobile
    ? page.getByTestId("mobile-filters").getByRole("option", { name: "Намиста" })
    : page.locator("aside").getByRole("link", { name: "Намиста" });
  await expect(filter).toHaveCount(1);

  await page.goto("/uk/shop/necklaces");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Намиста", { ignoreCase: true });
  await expect(page).toHaveTitle("Намиста | TJS");
});

test("the home page and a category page carry localized metadata and hreflang", async ({ request }) => {
  const html = await (await request.get("/de/shop/rings")).text();
  expect(html).toContain("<title>Ringe | TJS</title>");
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/de\/shop\/rings"/);
  expect(html).toMatch(/<link rel="alternate" hrefLang="x-default" href="[^"]*\/en\/shop\/rings"/);
  expect(html).toMatch(/<link rel="alternate" hrefLang="uk" href="[^"]*\/uk\/shop\/rings"/);
  expect(html).toContain(deCatalog.meta.categoryDescription.replace("{category}", "Ringe"));

  const shop = await (await request.get("/de/shop?sort=price-asc&page=2")).text();
  expect(shop).toContain(`<title>${deCatalog.meta.title} | TJS</title>`);
  // every sort and page variant names the listing itself as canonical
  expect(shop).toMatch(/<link rel="canonical" href="[^"]*\/de\/shop"/);
});

test("browse, sort, show more, page, and reload keep the state in the URL", async ({ page, isMobile }) => {
  const errors = collectErrors(page);
  await page.goto("/en/shop/brooches");

  // newest first: fixture 01 is the newest brooch
  await expect(cards(page)).toHaveCount(20);
  await expect(cards(page).first()).toContainText(fixtureTitle(1));
  await expect(page.getByTestId("shown-count")).toHaveText("Showed 20 of 31 products");

  await chooseSort(page, isMobile, enCatalog.sort.priceDesc, "price-desc");
  await page.waitForURL("/en/shop/brooches?sort=price-desc");
  await expect(cards(page).first()).toContainText(fixtureTitle(30));

  await page.getByRole("link", { name: enCatalog.showMore }).click();
  await page.waitForURL("/en/shop/brooches?sort=price-desc&page=2&from=1");
  await expect(cards(page)).toHaveCount(31);
  await expect(page.getByTestId("shown-count")).toHaveText("Showed 31 of 31 products");
  await expect(page.getByRole("link", { name: enCatalog.showMore })).toHaveCount(0);

  await page.reload();
  await expect(cards(page)).toHaveCount(31);
  await expect(cards(page).first()).toContainText(fixtureTitle(30));

  // one page only: page 2 holds fixtures 10..01 and the seed's $19.90 brooch
  const pager = page.getByRole("navigation", { name: enCatalog.pagination.label });
  if (isMobile) {
    await page.goto("/en/shop/brooches?sort=price-desc");
    await pager.getByRole("link", { name: enCatalog.pagination.next }).click();
  } else {
    await pager.getByRole("link", { name: "Page 1", exact: true }).click();
    await page.waitForURL("/en/shop/brooches?sort=price-desc");
    await pager.getByRole("link", { name: "Page 2", exact: true }).click();
  }
  await page.waitForURL("/en/shop/brooches?sort=price-desc&page=2");
  await expect(cards(page)).toHaveCount(11);
  await expect(cards(page).first()).toContainText(fixtureTitle(10));
  await expect(page.getByTestId("shown-count")).toHaveText("Showed 31 of 31 products");

  await page.reload();
  await expect(cards(page)).toHaveCount(11);
  expect(errors).toEqual([]);
});

test("price low to high and the all-products listing", async ({ page, isMobile }) => {
  await page.goto("/en/shop");
  await expect(page.getByTestId("shown-count")).toHaveText("Showed 20 of 41 products");
  await chooseSort(page, isMobile, enCatalog.sort.priceAsc, "price-asc");
  await page.waitForURL("/en/shop?sort=price-asc");
  // the cheapest published product of the seed ($16.90)
  await expect(cards(page).first()).toContainText("Adjustable stacking ring");
});

test("a card cross-fades to its second photo on hover and links to the product", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover needs a pointer");
  await page.goto("/en/shop/brooches");
  const card = cards(page).first();
  const [first, second] = [card.locator("img").nth(0), card.locator("img").nth(1)];
  await expect(second).toHaveCSS("opacity", "0");
  await card.hover();
  await expect(second).toHaveCSS("opacity", "1");
  await expect(first).toHaveCSS("opacity", "0");
  await expect(card).toHaveAttribute("href", "/en/product/e2e-brooch-1");
});

test("the new badge marks products younger than 7 days (D9)", async ({ page }) => {
  await page.goto("/en/shop/earrings");
  // seed: 1 day, 3 days and 12 days old
  await expect(cards(page).filter({ hasText: "Coral drop earrings" }).getByTestId("new-badge")).toHaveText(enCatalog.newBadge);
  await expect(cards(page).filter({ hasText: "Pearl stud earrings" }).getByTestId("new-badge")).toBeVisible();
  await expect(cards(page).filter({ hasText: "Gold-tone hoop earrings" }).getByTestId("new-badge")).toHaveCount(0);
});

test("a page past the end shows the empty state with a way back", async ({ page }) => {
  await page.goto("/en/shop/rings?page=9");
  const empty = page.getByTestId("empty-state");
  await expect(empty).toContainText(enCommon.noData);
  await empty.getByRole("link", { name: enCatalog.pagination.first }).click();
  await page.waitForURL("/en/shop/rings");
  await expect(cards(page)).toHaveCount(1);
});

test("an unknown category answers a server-rendered, localized 404", async ({ request }) => {
  const response = await request.get("/de/shop/unknown");
  expect(response.status()).toBe(404);
  const html = await response.text();
  // in the HTML itself, not filled in by client JavaScript
  expect(html).toContain('<html lang="de"');
  expect(html).toContain(`<title>${deErrors.notFound.title} | ${deCommon.brand}</title>`);
  expect(html).toContain(deErrors.notFound.description);
});

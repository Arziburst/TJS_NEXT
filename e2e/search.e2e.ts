import { expect, test, type Page } from "@playwright/test";
import enCatalog from "../messages/en/catalog.json" with { type: "json" };
import enNav from "../messages/en/nav.json" with { type: "json" };
import ukCatalog from "../messages/uk/catalog.json" with { type: "json" };
import ukNav from "../messages/uk/nav.json" with { type: "json" };

/*
 * #25: the site search and the listing filters on the local stack. The seed's materials and colours
 * (supabase/seed.sql): brass on TEST-001/003/004/010, glass on 002/006 (and the draft 011), red on 001/008/009,
 * gold-tone on 001/003/004; the e2e brooches (e2e/catalog-fixtures.ts) have none. Non-mutating.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

// a client navigation keeps the previous page mounted but hidden (Next 16 Activity): only the visible cards count
const cards = (page: Page) => page.getByTestId("product-card").filter({ visible: true });

async function titles(page: Page): Promise<string[]> {
  await expect(cards(page).first()).toBeVisible();
  return (await cards(page).locator(":scope > span:nth-child(2)").allInnerTexts()).map((t) => t.trim()).sort();
}

/** Types into the header's search box (desktop) or the mobile menu's, and submits. */
async function searchFromHeader(page: Page, isMobile: boolean, nav: typeof enNav, query: string) {
  if (isMobile) await page.getByRole("button", { name: nav.openMenu }).click();
  const box = page.getByRole("searchbox", { name: nav.searchLabel }).filter({ visible: true });
  await box.fill(query);
  await box.press("Enter");
}

test("uk: the header search finds by a word prefix and highlights it in the titles", async ({ page, isMobile }) => {
  const errors = collectErrors(page);
  await page.goto("/uk/shop");
  await page.waitForLoadState("networkidle");
  await searchFromHeader(page, isMobile, ukNav, "корал");
  await page.waitForURL(`/uk/search?q=${encodeURIComponent("корал")}`);

  await expect(page.getByRole("heading", { level: 1, name: ukCatalog.search.title })).toBeVisible();
  expect(await titles(page)).toEqual(["Браслет з коралових намистин", "Намисто з червоного коралу", "Сережки-краплі з коралом"]);
  await expect(page.getByTestId("search-summary")).toHaveText("За запитом «корал» знайдено 3 вироби");
  // the matched start of each word is marked; the rest of the title stays plain text
  await expect(cards(page).locator("mark")).toHaveText(["корал", "корал", "корал"], { ignoreCase: true, useInnerText: true });
  expect(errors).toEqual([]);
});

test("en: prefixes, a typo and the en fallback of another locale find the pieces", async ({ page }) => {
  await page.goto("/en/search?q=earr");
  expect(await titles(page)).toEqual(["Coral drop earrings", "Gold-tone hoop earrings", "Pearl stud earrings"]);
  await expect(cards(page).locator("mark").first()).toHaveText("earr");

  await page.goto("/en/search?q=corol");
  await expect(cards(page).filter({ hasText: "Coral drop earrings" })).toBeVisible();

  // de: TEST-009 has no de translation and is found through its en one
  await page.goto("/de/search?q=coral");
  await expect(cards(page)).toHaveCount(3);
});

test("search without a query asks for one; a query without results says so and leads back", async ({ page }) => {
  await page.goto("/en/search");
  await expect(page.getByTestId("search-prompt")).toHaveText(enCatalog.search.prompt);
  await expect(cards(page)).toHaveCount(0);

  await page.goto("/en/search?q=zzzqqq");
  const empty = page.getByTestId("empty-state");
  await expect(empty).toContainText(enCatalog.search.noResults.replace("{query}", "zzzqqq"));
  await empty.getByRole("link", { name: enCatalog.search.browseShop }).click();
  await page.waitForURL("/en/shop");
});

test("the search page is not indexed", async ({ request }) => {
  const html = await (await request.get("/en/search?q=coral")).text();
  expect(html).toMatch(/<meta name="robots" content="noindex, follow"/);
});

test("a shared filter URL reproduces the view, and a ticked filter changes the URL", async ({ page, isMobile }) => {
  const errors = collectErrors(page);
  const shared = "/en/shop?material=brass,glass&availability=made-to-order";
  await page.goto(shared);
  const expected = ["Adjustable stacking ring", "Beaded bracelet", "Coral drop earrings", "Layered chain necklace", "Pearl stud earrings"];
  expect(await titles(page)).toEqual(expected);
  await expect(page.getByTestId("shown-count")).toHaveText("Showed 5 of 5 products");
  await page.reload();
  expect(await titles(page)).toEqual(expected);

  if (isMobile) {
    // the button counts the filters set: two materials and one availability
    await page.getByRole("button", { name: "Filters (3)" }).click();
    const sheet = page.getByTestId("sheet-filters");
    await expect(sheet.getByLabel("Brass")).toBeChecked();
    await sheet.getByLabel("Red").check();
    await sheet.getByRole("button", { name: enCatalog.filters.showResults }).click();
  } else {
    const sidebar = page.getByTestId("desktop-filters");
    await expect(sidebar.getByLabel("Brass")).toBeChecked();
    await expect(sidebar.getByLabel("Glass")).toBeChecked();
    await expect(sidebar.getByLabel("Made to order")).toBeChecked();
    // counts per option: red under brass-or-glass and made to order is TEST-001 alone
    await expect(sidebar.locator("label").filter({ hasText: "Red" })).toContainText("1");
    await sidebar.getByLabel("Red").check();
  }
  await page.waitForURL("/en/shop?material=brass%2Cglass&colour=red&availability=made-to-order");
  expect(await titles(page)).toEqual(["Coral drop earrings"]);
  expect(errors).toEqual([]);
});

test("filters combine with the category, the sort and the pages", async ({ page, isMobile }) => {
  await page.goto("/en/shop/earrings?material=brass&sort=price-desc");
  await expect(cards(page)).toHaveCount(2);
  await expect(cards(page).first()).toContainText("Gold-tone hoop earrings");
  await expect(cards(page).nth(1)).toContainText("Coral drop earrings");

  // changing the sort keeps the filter
  if (isMobile) await page.getByTestId("mobile-filters").getByLabel(enCatalog.filterBy).selectOption("price-asc");
  else await page.locator("aside").getByRole("link", { name: enCatalog.sort.priceAsc }).click();
  await page.waitForURL("/en/shop/earrings?material=brass&sort=price-asc");
  await expect(cards(page).first()).toContainText("Coral drop earrings");

  // a filter that matches nothing offers to clear the filters
  await page.goto("/en/shop/earrings?colour=red&availability=in-stock");
  const empty = page.getByTestId("empty-state");
  await expect(empty).toContainText(enCatalog.filters.noMatch);
  await empty.getByRole("link", { name: enCatalog.filters.clear }).click();
  await page.waitForURL("/en/shop/earrings");
  await expect(cards(page)).toHaveCount(3);
});

test("a price range is in the currency it was set in, whatever currency the visitor sees", async ({ page, baseURL }) => {
  // 1 000–2 000 ₴: the displayed UAH prices of TEST-001, 003 and 004 among the brass pieces (TEST-010 is 789 ₴)
  const shared = "/uk/shop?material=brass&min=1000&max=2000&cur=UAH";
  await page.goto(shared);
  const expected = ["Багатошарове намисто-ланцюжок", "Сережки-кільця золотисті", "Сережки-краплі з коралом"].sort();
  expect(await titles(page)).toEqual(expected);

  await page.context().addCookies([{ name: "TJS_CURRENCY", value: "EUR", url: baseURL }]);
  await page.goto(shared);
  expect(await titles(page)).toEqual(expected);
  await expect(cards(page).first()).toContainText("€");
});

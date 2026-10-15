import { expect, test, type Page } from "@playwright/test";

/*
 * #79: every shopper carries a cookie (currency, cart) and reloads the shop with a warm HTTP cache. A
 * route that `next start` sends with `stale-while-revalidate` (a shell entry whose cacheLife expire is
 * longer than its revalidate) is answered from that cache on the next prefetch, and Chromium's background
 * revalidation never reports its end, so the page never reaches network idle (docs/standards.md §3).
 * Meaningful on the production build (`next build` + `next start`): `next dev` sends `no-store`.
 */

const RELOADS = 10;
const NETWORK_IDLE_MS = 5_000;
const NAVIGATION_MS = 1_000;

const COOKIES = [
  { name: "TJS_CURRENCY", value: "EUR" },
  // the cart (#20) keeps its lines in this cookie; any value makes the request carry it
  { name: "TJS_CART", value: "e2e" },
];

/** Every response of the page that a browser may serve stale from its own cache. */
function collectStaleWhileRevalidate(page: Page): string[] {
  const found: string[] = [];
  page.on("response", (response) => {
    const cacheControl = response.headers()["cache-control"] ?? "";
    if (cacheControl.includes("stale-while-revalidate")) found.push(`${response.url()}: ${cacheControl}`);
  });
  return found;
}

for (const path of ["/en/shop/corals", "/uk/shop"]) {
  test(`${path} with the currency and cart cookies reaches network idle on ${RELOADS} reloads and opens a product at once`, async ({
    page,
    baseURL,
  }) => {
    await page.context().addCookies(COOKIES.map((cookie) => ({ ...cookie, url: baseURL })));
    const staleWhileRevalidate = collectStaleWhileRevalidate(page);
    const cards = page.getByTestId("product-card");

    await page.goto(path);
    await expect(cards.first()).toBeVisible();
    await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_MS });
    for (let reload = 1; reload <= RELOADS; reload++) {
      await page.reload();
      await expect(cards.first()).toBeVisible();
      await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_MS });
    }
    expect(staleWhileRevalidate).toEqual([]);

    const card = cards.first();
    const href = await card.getAttribute("href");
    expect(href).toMatch(/\/product\//);
    // the card's second line is the product title, the product page's h1
    const name = (await card.locator(":scope > span").nth(1).innerText()).trim();
    const title = page.getByRole("heading", { level: 1, name, exact: true });
    await card.click();
    await page.waitForURL(href!, { timeout: NAVIGATION_MS });
    await expect(title).toBeVisible({ timeout: NAVIGATION_MS });
  });
}

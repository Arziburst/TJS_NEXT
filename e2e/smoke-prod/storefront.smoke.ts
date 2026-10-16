// Read-only checks of a deployment (e2e/smoke-prod/playwright.config.ts): the storefront renders and works
// with whatever catalogue it has. Nothing is written but the guest cart cookie of the test's own browser.
import { expect, test, type Page } from "@playwright/test";
import enCart from "../../messages/en/cart.json" with { type: "json" };
import enProduct from "../../messages/en/product.json" with { type: "json" };

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // the strict report-only policy's expected violations (docs/standards.md "Security headers") are not errors
    if (message.type() === "error" && !message.text().includes("[Report Only]")) errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function open(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
  await page.waitForLoadState("networkidle");
}

// a client navigation keeps the previous page mounted but hidden (Next 16 Activity): only the visible cards count
const cards = (page: Page) => page.getByTestId("product-card").filter({ visible: true });

/** The product pages the shop's first listing page links to. */
async function productPaths(page: Page): Promise<string[]> {
  await open(page, "/en/shop");
  await expect(cards(page).first()).toBeVisible();
  const hrefs = await page.locator('a[href^="/en/product/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  return [...new Set(hrefs)];
}

test("home", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "/en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("shop and a product page", async ({ page }) => {
  const errors = collectErrors(page);
  const [path] = await productPaths(page);
  expect(path, "the shop lists a product").toBeTruthy();
  await open(page, path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // the photos come through the image optimizer
  const photo = page.locator('main img[src*="/_next/image"]').first();
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("search finds a listed product by a word of its title", async ({ page }) => {
  const errors = collectErrors(page);
  const [path] = await productPaths(page);
  await open(page, path);
  const title = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
  // the title's longest word
  const word = (title.match(/\p{L}{3,}/gu) ?? []).toSorted((a, b) => b.length - a.length)[0];
  expect(word, `a word in "${title}"`).toBeTruthy();
  await open(page, `/en/search?q=${encodeURIComponent(word)}`);
  // a big catalogue may page the product itself away: any found piece with the word in its title will do
  await expect(cards(page).first()).toContainText(word, { ignoreCase: true });
  expect(errors).toEqual([]);
});

test("the guest cart: add a product and remove it (a cookie only)", async ({ page }) => {
  const errors = collectErrors(page);
  // the first product that can be added as it is (one without sizes or variants to pick, in stock)
  let added: string | null = null;
  for (const path of (await productPaths(page)).slice(0, 8)) {
    await open(page, path);
    const button = page.getByRole("button", { name: enProduct.addToCart });
    if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
    await button.click();
    const inCart = page.getByTestId("in-cart");
    if (await inCart.waitFor({ state: "visible", timeout: 10_000 }).then(() => true, () => false)) {
      added = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
      break;
    }
  }
  expect(added, "a product could be added to the cart").not.toBeNull();
  expect((await page.context().cookies()).some((c) => c.name === "TJS_CART")).toBe(true);

  await open(page, "/en/cart");
  const line = page.getByTestId("cart-line").filter({ hasText: added! });
  await expect(line).toBeVisible();
  await line.getByRole("button", { name: enCart.removeLine.replace("{title}", added!) }).click();
  await expect(page.getByText(enCart.empty)).toBeVisible();
  expect(errors).toEqual([]);
});

test("the sign-in page renders", async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, "/en/sign-in-and-up");
  const form = page.getByRole("tabpanel", { name: "Sign In" });
  await expect(form.getByLabel("Email")).toBeVisible();
  await expect(form.getByLabel("Password")).toBeVisible();
  expect(errors).toEqual([]);
});

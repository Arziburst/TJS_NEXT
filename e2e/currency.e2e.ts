import { expect, test, type Page } from "@playwright/test";
import deNav from "../messages/de/nav.json" with { type: "json" };

// Needs the seeded rates (supabase/seed.sql, NBU 2026-10-15) on the local stack. The demo price block of
// /ui-kit shows $27.80, which is 25,90 € / 119 zł / 1.289 ₴ there.

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

const prices = (page: Page) => page.getByTestId("demo-prices").locator("[data-slot=price]");

// Desktop: the switcher sits in the header nav. Below 1024px: inside the mobile menu sheet.
async function switchCurrency(page: Page, isMobile: boolean, currency: string) {
  if (isMobile) {
    await page.locator("header").getByRole("button", { name: deNav.openMenu }).filter({ visible: true }).click();
    await page.getByRole("dialog").getByLabel(deNav.currency).selectOption(currency);
    await expect(prices(page).first()).toHaveAttribute("data-currency", currency);
    await page.keyboard.press("Escape");
  } else {
    await page.locator("header").getByLabel(deNav.currency).filter({ visible: true }).selectOption(currency);
  }
}

test("the switcher changes every price, keeps the URL and remembers the choice in a cookie", async ({ page, isMobile }) => {
  const errors = collectErrors(page);
  await page.goto("/de/ui-kit");
  const url = page.url();

  // no cookie, no Vercel geo locally: the locale default (D5, de → EUR)
  await expect(prices(page)).toHaveCount(7);
  await expect(prices(page).nth(1)).toHaveText(/^25,90\s€$/);

  await switchCurrency(page, isMobile, "PLN");
  await expect(prices(page).nth(1)).toHaveText(/^119\szł$/);
  for (const price of await prices(page).all()) await expect(price).toHaveAttribute("data-currency", "PLN");
  expect(page.url()).toBe(url);

  await switchCurrency(page, isMobile, "UAH");
  await expect(prices(page).nth(1)).toHaveText(/^1\.289\s₴$/);
  expect(page.url()).toBe(url);

  const cookie = (await page.context().cookies()).find((c) => c.name === "TJS_CURRENCY");
  expect(cookie).toMatchObject({ value: "UAH", httpOnly: true, sameSite: "Lax", path: "/" });

  await page.reload();
  await expect(prices(page).nth(1)).toHaveText(/^1\.289\s₴$/);
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("the visitor's country picks the currency, the cookie overrides it", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-vercel-ip-country": "CH" });
  await page.goto("/en/ui-kit");
  await expect(prices(page).first()).toHaveAttribute("data-currency", "CHF");

  await page.context().addCookies([{ name: "TJS_CURRENCY", value: "CZK", url: page.url() }]);
  await page.reload();
  await expect(prices(page).first()).toHaveAttribute("data-currency", "CZK");
});

test("a forged currency cookie falls back to the locale default", async ({ page }) => {
  await page.goto("/uk/ui-kit");
  await page.context().addCookies([{ name: "TJS_CURRENCY", value: "GBP", url: page.url() }]);
  await page.reload();
  await expect(prices(page).first()).toHaveAttribute("data-currency", "UAH");
});

test("the rates job refuses a call without the cron secret", async ({ request }) => {
  const response = await request.get("/api/cron/fx-rates");
  expect(response.status()).toBe(401);
  const forged = await request.get("/api/cron/fx-rates", { headers: { authorization: "Bearer guess" } });
  expect(forged.status()).toBe(401);
});

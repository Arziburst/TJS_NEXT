import { expect, test, type Locator } from "@playwright/test";

/*
 * The header keeps one row (#80): from 1024px the cart and account icons sit side by side after the language
 * and currency switchers, and the header is as tall as before the cart slot came (#20); below 1024px it is
 * menu button, logo and cart. Heights: desktop pt-6 + one 44px row + pb-3, mobile py-4 + one 44px row.
 */

const PAGE = "/uk/shop";
const DESKTOP_WIDTHS = [1024, 1440, 1920];
const DESKTOP_HEADER_HEIGHT = 24 + 44 + 12;
const MOBILE_HEADER_HEIGHT = 16 + 44 + 16;

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const rect = await locator.boundingBox();
  expect(rect, "rendered box").not.toBeNull();
  return rect!;
}

const centreY = (rect: { y: number; height: number }) => rect.y + rect.height / 2;

test.describe("header row", () => {
  for (const width of DESKTOP_WIDTHS) {
    test(`at ${width}px cart and account share the switchers' row`, async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith("desktop"), "the desktop header exists from 1024px");
      await page.setViewportSize({ width, height: 900 });
      await page.goto(PAGE);
      await page.waitForLoadState("networkidle");
      const header = page.locator("header");

      const cart = await box(header.locator('[data-slot="cart"]'));
      const account = await box(header.locator('[data-slot="account"]'));
      const currency = await box(header.locator('[data-slot="currency-switcher"]'));
      const language = await box(header.locator('[data-slot="language-switcher"]'));
      const logo = await box(header.getByRole("link", { name: "TJS" }));

      expect(account.y, "account on the cart's row").toBe(cart.y);
      expect(account.x, "account after the cart").toBeGreaterThanOrEqual(cart.x + cart.width);
      expect(language.x + language.width, "language before currency").toBeLessThanOrEqual(currency.x);
      expect(currency.x + currency.width, "the switchers before the cart").toBeLessThanOrEqual(cart.x);
      for (const [name, rect] of Object.entries({ language, currency, logo })) {
        expect(Math.abs(centreY(rect) - centreY(cart)), `${name} on the cart's row`).toBeLessThanOrEqual(1);
      }
      expect((await box(header)).height).toBe(DESKTOP_HEADER_HEIGHT);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBe(0);
    });
  }

  test("at 390px the header is menu button, logo and cart", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "the mobile header exists below 1024px");
    await page.goto(PAGE);
    await page.waitForLoadState("networkidle");
    const header = page.locator("header");

    const menu = await box(header.getByRole("button", { name: /меню/i }));
    const logo = await box(header.getByRole("link", { name: "TJS" }));
    const cart = await box(header.locator('[data-slot="cart"]'));
    await expect(header.locator('[data-slot="account"]')).toBeHidden();
    await expect(header.getByRole("navigation")).toBeHidden();

    expect(menu.x + menu.width, "menu before logo").toBeLessThanOrEqual(logo.x);
    expect(logo.x + logo.width, "logo before cart").toBeLessThanOrEqual(cart.x);
    for (const [name, rect] of Object.entries({ menu, logo })) {
      expect(Math.abs(centreY(rect) - centreY(cart)), `${name} on the cart's row`).toBeLessThanOrEqual(1);
    }
    expect((await box(header)).height).toBe(MOBILE_HEADER_HEIGHT);
  });
});

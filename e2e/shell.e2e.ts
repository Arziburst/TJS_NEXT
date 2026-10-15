import { expect, test, type Page } from "@playwright/test";
import { allRouteKeys, expectOnlyEnabledRouteLinks, mobileMenuRouteKeys } from "./routes";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.describe("layout shell", () => {
  test("desktop shows the inline nav, mobile shows the menu button (CSS only)", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto("/ui-kit");
    const header = page.locator("header");
    const isDesktop = testInfo.project.name === "desktop";

    await expect(header.getByRole("link", { name: "TJS" })).toBeVisible();
    await expectOnlyEnabledRouteLinks(header, "en", allRouteKeys);
    await expect(header.getByRole("navigation", { name: "Main" })).toBeVisible({ visible: isDesktop });
    await expect(header.getByRole("button", { name: "Open menu" })).toBeVisible({ visible: !isDesktop });
    await expect(page.locator("footer").first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBe(0);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("the mobile menu opens as a sheet and closes by button and Escape", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the menu button exists below 1024px only");
    const errors = collectErrors(page);
    await page.goto("/ui-kit");

    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();
    await expectOnlyEnabledRouteLinks(menu, "en", mobileMenuRouteKeys);
    await menu.getByRole("button", { name: "Close menu" }).click();
    await expect(menu).toBeHidden();

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("buttons and nav links show a visible focus ring from the keyboard", async ({ page }) => {
    await page.goto("/ui-kit");
    const contained = page.getByRole("button", { name: "Contained" });
    await contained.focus();
    await page.keyboard.press("Tab");
    const outline = page.getByRole("button", { name: "Outline", exact: true });
    await expect(outline).toBeFocused();
    await expect(outline).toHaveCSS("outline-style", "solid");
    await expect(outline).toHaveCSS("outline-width", "2px");

    const logo = page.locator("header").getByRole("link", { name: "TJS" });
    await logo.focus();
    await page.keyboard.press("Tab");
    const next = page.locator(":focus");
    await expect(next).toHaveCSS("outline-style", "solid");
  });
});

test.describe("ui kit", () => {
  test("dialog, select, tabs, switch and toast work", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/ui-kit");

    await page.getByRole("button", { name: "Open dialog" }).click();
    await expect(page.getByRole("dialog", { name: "Delete product?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Open sheet" }).click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    const country = page.getByRole("combobox", { name: "Country" });
    await country.click();
    await page.getByRole("option", { name: "Česko" }).click();
    await expect(country).toContainText("Česko");

    await page.getByRole("tab", { name: "Sign up" }).click();
    // by name: the old panel stays in the DOM (inert) during its exit transition
    await expect(page.getByRole("tabpanel", { name: "Sign up" })).toHaveText("Sign-up panel placeholder.");

    const inStock = page.getByRole("switch").first();
    await expect(inStock).toBeChecked();
    await inStock.click();
    await expect(inStock).not.toBeChecked();

    await page.getByRole("button", { name: "Success toast" }).click();
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toContainText("Added to cart");
    await expect(toast).toHaveCSS("border-radius", "0px");

    expect(errors).toEqual([]);
  });

  test("is not indexed", async ({ page }) => {
    await page.goto("/ui-kit");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

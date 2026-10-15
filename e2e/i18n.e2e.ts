import { expect, test, type Page } from "@playwright/test";
import deCommon from "../messages/de/common.json" with { type: "json" };
import deErrors from "../messages/de/errors.json" with { type: "json" };
import de from "../messages/de/home.json" with { type: "json" };
import deNav from "../messages/de/nav.json" with { type: "json" };
import enErrors from "../messages/en/errors.json" with { type: "json" };
import enNav from "../messages/en/nav.json" with { type: "json" };
import fr from "../messages/fr/home.json" with { type: "json" };
import uk from "../messages/uk/home.json" with { type: "json" };
import ukNav from "../messages/uk/nav.json" with { type: "json" };
import { NAV_LEFT, NAV_RIGHT } from "../src/components/layout/nav-items";
import { routes } from "../src/config/routes";
import { shellRouteKeys, expectOnlyEnabledRouteLinks } from "./routes";

const locales = ["uk", "en", "de", "fr", "es", "it", "pl", "nl", "cs", "pt", "ro"];

type NavMessages = typeof enNav;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // a 404 document is reported by the browser as a failed resource; it is the expected status here
    if (message.type() === "error" && !message.text().includes("status of 404")) {
      errors.push(`console: ${message.text()}`);
    }
  });
  return errors;
}

// Desktop: the switcher sits in the header nav. Below 1024px: inside the mobile menu sheet.
async function switchLocale(page: Page, isMobile: boolean, nav: NavMessages, locale: string) {
  if (isMobile) {
    await page.locator("header").getByRole("button", { name: nav.openMenu }).filter({ visible: true }).click();
    await page.getByRole("dialog").getByLabel(nav.language).selectOption(locale);
  } else {
    await page.locator("header").getByLabel(nav.language).filter({ visible: true }).selectOption(locale);
  }
}

test("GET / with Accept-Language de redirects once to /de", async ({ request }) => {
  const first = await request.get("/", { headers: { "accept-language": "de-DE,de;q=0.9" }, maxRedirects: 0 });
  expect(first.status()).toBe(307);
  expect(new URL(first.headers()["location"], "http://x").pathname).toBe("/de");

  const second = await request.get("/de", { headers: { "accept-language": "de-DE,de;q=0.9" }, maxRedirects: 0 });
  expect(second.status()).toBe(200);
});

test.describe("a Russian browser", () => {
  test.use({ locale: "ru-RU", extraHTTPHeaders: { "accept-language": "ru-RU,ru" } });

  // D27: a browser language outside the 11 locales lands on /en, not on /uk
  test("opening / lands on /en", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test("/fr renders French with lang=fr", async ({ page }) => {
  const response = await page.goto("/fr");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByText(fr.intro)).toBeVisible();
  await expect(page).toHaveTitle(fr.meta.title);
});

test("an unknown locale and an unknown path answer 404", async ({ page }) => {
  const unknownLocale = await page.goto("/ru");
  expect(unknownLocale?.status()).toBe(404);

  const unknownPath = await page.goto("/de/does-not-exist");
  expect(unknownPath?.status()).toBe(404);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("the 404 for an unknown locale uses the en messages", async ({ request }) => {
  const response = await request.get("/xx/yy");
  expect(response.status()).toBe(404);
  expect(await response.text()).toContain(enErrors.notFound.title);
});

test("the 404 under a locale is server-rendered in that locale with a localized title", async ({ request }) => {
  const response = await request.get("/de/does-not-exist");
  expect(response.status()).toBe(404);
  const html = await response.text();
  // in the HTML itself, not filled in by client JavaScript
  expect(html).toContain('<html lang="de"');
  expect(html).toContain(`<title>${deErrors.notFound.title} | ${deCommon.brand}</title>`);
  expect(html).toContain(deErrors.notFound.description);
});

test("the home page has a canonical and 12 hreflang links", async ({ request }) => {
  const html = await (await request.get("/de")).text();
  const hreflangs = [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map(
    ([, lang, href]) => [lang, new URL(href).pathname],
  );

  expect(hreflangs).toHaveLength(12);
  expect(Object.fromEntries(hreflangs)).toEqual({
    ...Object.fromEntries(locales.map((locale) => [locale, `/${locale}`])),
    "x-default": "/en",
  });
  expect(html).toMatch(/<link rel="canonical" href="[^"]*\/de"/);
});

test("the shell (header, menu, footer) is localized", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const isMobile = testInfo.project.name === "mobile";
  await page.goto("/de");
  const header = page.locator("header");
  const navItems = [...NAV_LEFT, ...NAV_RIGHT];

  await expectOnlyEnabledRouteLinks(header, "de", shellRouteKeys);
  if (routes.cart.enabled) {
    // from 1024px up a link to the cart page; below it the mini-cart sheet's button
    const role = isMobile ? "button" : "link";
    await expect(header.getByRole(role, { name: deNav.cart }).filter({ visible: true })).toBeVisible();
  }
  if (isMobile) {
    await header.getByRole("button", { name: deNav.openMenu }).click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("navigation", { name: deNav.main })).toBeVisible();
    await expect(menu.getByRole("combobox", { name: deNav.language })).toBeVisible();
    for (const item of navItems) {
      await expect(menu.getByRole("link", { name: deNav[item.labelKey] })).toHaveAttribute("href", `/de${item.href}`);
    }
    await page.keyboard.press("Escape");
  } else {
    const nav = header.getByRole("navigation", { name: deNav.main });
    for (const item of navItems) {
      await expect(nav.getByRole("link", { name: deNav[item.labelKey] })).toHaveAttribute("href", `/de${item.href}`);
    }
    if (routes.signIn.enabled) await expect(header.getByRole("link", { name: deNav.account })).toBeVisible();
  }
  await expect(page.locator("footer").last()).toContainText(deCommon.footer.rights);
  expect(errors).toEqual([]);
});

test("the switcher changes the locale, keeps the path and sets NEXT_LOCALE", async ({ page, context }, testInfo) => {
  const errors = collectErrors(page);
  const isMobile = testInfo.project.name === "mobile";

  await page.goto("/en");
  await switchLocale(page, isMobile, enNav, "de");
  await expect(page).toHaveURL(/\/de$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByText(de.intro)).toBeVisible();

  await switchLocale(page, isMobile, deNav, "uk");
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(page.getByText(uk.intro)).toBeVisible();

  const cookie = (await context.cookies()).find((entry) => entry.name === "NEXT_LOCALE");
  expect(cookie?.value).toBe("uk");

  // the cookie now wins over Accept-Language on /
  await page.goto("/");
  await expect(page).toHaveURL(/\/uk$/);

  // a deeper path is kept: /uk/shop -> /en/shop
  await page.goto("/uk/shop");
  await switchLocale(page, isMobile, ukNav, "en");
  await expect(page).toHaveURL(/\/en\/shop$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  expect(errors).toEqual([]);
});

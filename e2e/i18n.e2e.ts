import { expect, test } from "@playwright/test";
import de from "../messages/de/home.json" with { type: "json" };
import fr from "../messages/fr/home.json" with { type: "json" };
import uk from "../messages/uk/home.json" with { type: "json" };
import enErrors from "../messages/en/errors.json" with { type: "json" };

const locales = ["uk", "en", "de", "fr", "es", "it", "pl", "nl", "cs", "pt", "ro"];

test("GET / with Accept-Language de redirects once to /de", async ({ request }) => {
  const first = await request.get("/", { headers: { "accept-language": "de-DE,de;q=0.9" }, maxRedirects: 0 });
  expect(first.status()).toBe(307);
  expect(new URL(first.headers()["location"], "http://x").pathname).toBe("/de");

  const second = await request.get("/de", { headers: { "accept-language": "de-DE,de;q=0.9" }, maxRedirects: 0 });
  expect(second.status()).toBe(200);
});

test("/fr renders French with lang=fr", async ({ page }) => {
  const response = await page.goto("/fr");
  expect(response?.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByText(fr.placeholder.text)).toBeVisible();
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

test("the switcher changes the locale, keeps the path and sets NEXT_LOCALE", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto("/en");
  const switcher = page.getByLabel("Language");

  await switcher.selectOption("de");
  await expect(page).toHaveURL(/\/de$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByText(de.placeholder.text)).toBeVisible();

  await page.getByLabel("Sprache").selectOption("uk");
  await expect(page).toHaveURL(/\/uk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "uk");
  await expect(page.getByText(uk.placeholder.text)).toBeVisible();

  const cookie = (await context.cookies()).find((entry) => entry.name === "NEXT_LOCALE");
  expect(cookie?.value).toBe("uk");

  // the cookie now wins over Accept-Language on /
  await page.goto("/");
  await expect(page).toHaveURL(/\/uk$/);

  expect(errors).toEqual([]);
});

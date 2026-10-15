import { expect, test, type Page } from "@playwright/test";
import deCommon from "../messages/de/common.json" with { type: "json" };
import deErrors from "../messages/de/errors.json" with { type: "json" };
import deNav from "../messages/de/nav.json" with { type: "json" };
import fr from "../messages/fr/product.json" with { type: "json" };
import uk from "../messages/uk/product.json" with { type: "json" };

// Seeded products (supabase/seed.sql) with photos from npm run seed:images (e2e/global-setup.ts).
const DE_EARRINGS = "/de/product/korallen-tropfenohrringe";
// the uk translation has materials and care
const UK_EARRINGS = "/uk/product/serezhky-krapli-z-koralom";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

function jsonLd(html: string): { "@graph": Record<string, unknown>[] } {
  const match = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html);
  expect(match, "a JSON-LD script in the HTML").not.toBeNull();
  return JSON.parse(match![1]);
}

test.describe("product page HTML (no JavaScript)", () => {
  test("is server-rendered with its title, canonical, hreflang of translated locales and JSON-LD", async ({ request }) => {
    const response = await request.get(DE_EARRINGS);
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain('<html lang="de"');
    expect(html).toContain(`<title>Korallen-Tropfenohrringe | ${deCommon.brand}</title>`);
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/de\/product\/korallen-tropfenohrringe"/);
    const hreflangs = [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map(
      ([, lang, href]) => [lang, new URL(href).pathname],
    );
    expect(Object.fromEntries(hreflangs)).toEqual({
      uk: "/uk/product/serezhky-krapli-z-koralom",
      en: "/en/product/coral-drop-earrings",
      de: "/de/product/korallen-tropfenohrringe",
      pl: "/pl/product/kolczyki-z-koralem",
      "x-default": "/en/product/coral-drop-earrings",
    });

    expect(html).toContain('<meta property="og:locale" content="de_DE"/>');
    const ogAlternates = [...html.matchAll(/<meta property="og:locale:alternate" content="([^"]+)"/g)].map(([, l]) => l);
    expect(ogAlternates.sort()).toEqual(["en_US", "pl_PL", "uk_UA"]);

    const [product, breadcrumbs] = jsonLd(html)["@graph"];
    expect(product).toMatchObject({ "@type": "Product", name: "Korallen-Tropfenohrringe", sku: "TEST-001" });
    expect(product.image).toHaveLength(3);
    // one currency per URL: de → EUR (D5), the same for every visitor; made-to-order work (TEST-001)
    expect(product.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "EUR",
      availability: "https://schema.org/MadeToOrder",
    });
    expect((product.offers as { price: string }).price).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(breadcrumbs).toMatchObject({ "@type": "BreadcrumbList" });
    expect((breadcrumbs.itemListElement as unknown[]).length).toBe(3);
  });

  test("shows the en content of an untranslated product, canonicalized to the en page", async ({ request }) => {
    const response = await request.get("/fr/product/pearl-stud-earrings");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<html lang="fr"');
    expect(html).toContain(fr.page.untranslated);
    expect(html).toMatch(/<link rel="canonical" href="[^"]*\/en\/product\/pearl-stud-earrings"/);
    expect(html).not.toContain('hrefLang="fr"');
    // the en page states the product; this URL must not give it a second Offer in EUR
    expect(html).not.toContain("application/ld+json");
    expect(html).toContain('<meta property="og:locale" content="en_US"/>');
  });

  test("redirects another locale's slug to the locale's slug", async ({ request }) => {
    const response = await request.get("/de/product/coral-drop-earrings", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers()["location"], "http://x").pathname).toBe(DE_EARRINGS);
  });

  for (const [what, path] of [
    ["an unknown slug", "/de/product/gibt-es-nicht"],
    ["a draft product", "/de/product/cocktail-ring-with-stone"],
    ["an archived product", "/de/product/enamel-bird-brooch"],
    ["a deleted product", "/de/product/steel-cuff-bracelet"],
  ]) {
    test(`answers 404 with the localized text in the HTML for ${what}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      const html = await response.text();
      expect(html).toContain('<html lang="de"');
      expect(html).toContain(`<title>${deErrors.notFound.title} | ${deCommon.brand}</title>`);
      expect(html).toContain(deErrors.notFound.description);
    });
  }
});

test("shows the product and adds it to the cart", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const isMobile = testInfo.project.name === "mobile";
  await page.goto(UK_EARRINGS);

  await expect(page.getByRole("heading", { level: 1, name: "Сережки-краплі з коралом" })).toBeVisible();
  const gallery = page.getByRole("region", { name: uk.page.gallery.label });
  await expect(gallery.getByRole("img")).toHaveCount(3);

  if (isMobile) {
    // a slider: one photo in view, arrows and dots move it
    const dots = gallery.getByRole("button", { name: /\d/ });
    await expect(dots).toHaveCount(3);
    await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
    await gallery.getByRole("button", { name: uk.page.gallery.next }).click();
    await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");
    await dots.nth(2).click();
    await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");
    await expect(gallery.getByRole("button", { name: uk.page.gallery.next })).toBeDisabled();
  } else {
    // photos stacked, the info column sticks while they scroll
    await expect(gallery.getByRole("button", { name: uk.page.gallery.next })).toBeHidden();
    const [first, second] = await Promise.all([0, 1].map((i) => gallery.getByRole("img").nth(i).boundingBox()));
    expect(second!.y).toBeGreaterThan(first!.y + first!.height);
    const heading = page.getByRole("heading", { level: 1 });
    await page.mouse.wheel(0, 1200);
    await expect(heading).toBeInViewport();
  }

  // the visitor's currency: uk without a cookie or geo → UAH
  await expect(page.locator("main [data-slot=price]")).toHaveAttribute("data-currency", "UAH");
  await expect(page.getByText(uk.page.materials, { exact: true })).toBeVisible();
  await expect(page.getByText(uk.page.care, { exact: true })).toBeVisible();
  await expect(page.getByText(uk.page.weight, { exact: true })).toBeVisible();

  const addToCart = page.getByRole("button", { name: uk.addToCart });
  await addToCart.click();
  const added = page.getByRole("button", { name: uk.addedToCart });
  await expect(added).toBeVisible();
  await expect(added).toBeDisabled();
  expect(errors).toEqual([]);
});

test("a sold one-of-a-kind piece says so and cannot be added", async ({ page }) => {
  await page.goto("/uk/product/namysto-z-chervonoho-koralu");
  await expect(page.getByText(uk.page.sold, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: uk.addToCart })).toHaveCount(0);
});

test("switching the language on a product page lands on the slug of that language", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await page.goto(DE_EARRINGS);
  await expect(page.getByRole("heading", { level: 1, name: "Korallen-Tropfenohrringe" })).toBeVisible();
  // desktop: the switcher in the header nav; below 1024px: inside the mobile menu
  if (testInfo.project.name === "mobile") {
    await page.locator("header").getByRole("button", { name: deNav.openMenu }).filter({ visible: true }).click();
    await page.getByRole("dialog").getByLabel(deNav.language).selectOption("uk");
  } else {
    await page.locator("header").getByLabel(deNav.language).filter({ visible: true }).selectOption("uk");
  }
  await expect(page).toHaveURL(/\/uk\/product\/serezhky-krapli-z-koralom$/);
  await expect(page.getByRole("heading", { level: 1, name: "Сережки-краплі з коралом" })).toBeVisible();
  expect(errors).toEqual([]);
});

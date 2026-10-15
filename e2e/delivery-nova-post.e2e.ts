import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { localStack } from "../tests/catalog/local-stack";
import de from "../messages/de/checkout.json" with { type: "json" };
import en from "../messages/en/checkout.json" with { type: "json" };
import fr from "../messages/fr/checkout.json" with { type: "json" };
import pl from "../messages/pl/checkout.json" with { type: "json" };

// The delivery step abroad on its dev-only demo page (/<locale>/delivery-demo/nova-post, behind TJS_UI_KIT).
// Playwright points the app at the Nova Post fixture server (e2e/nova-post-mock.ts): towns, points and the
// calculations come from the fixtures (the server quotes only the D37 box paid by the recipient, D38); where it
// cannot quote, the zone flat rate stands in, TBD until the owner sets it. The bundle scan is
// tests/delivery/client-bundle.integration.test.ts.
test.skip(!!process.env.E2E_BASE_URL, "needs the Nova Post fixture server that Playwright starts with the app");

// the delivery actions are limited per client IP (src/lib/delivery/rate-limit.ts): each test is its own client
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `e2e-nova-post-${crypto.randomUUID()}` });
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

type Texts = (typeof pl)["internationalDelivery"];

async function expectTbdEstimate(page: Page, t: Texts) {
  const line = page.locator("[data-slot=quote-line]");
  await expect(line).toHaveAttribute("data-source", "flatRate");
  await expect(line.locator("[data-slot=estimate-mark]")).toHaveText(t.quote.estimate);
  await expect(line.locator("[data-slot=price-tbd]")).toHaveText("TBD");
  await expect(line).toContainText(t.quote.tbdNote);
  await expect(page.locator("[data-slot=customs-notice]")).toHaveText(t.customsNotice);
}

// Nova Post's price for the D37 estimate box (the fixture server's calculation), in the visitor's currency
async function expectCarrierEstimate(
  page: Page,
  t: Texts,
  locale: string,
  { currency, text, date }: { currency: string; text: RegExp; date: string | null },
) {
  const line = page.locator("[data-slot=quote-line]");
  await expect(line).toHaveAttribute("data-source", "carrier");
  await expect(line.locator("[data-slot=estimate-mark]")).toHaveText(t.quote.estimate);
  await expect(line.locator("[data-slot=price]")).toHaveAttribute("data-currency", currency);
  await expect(line.locator("[data-slot=price]")).toHaveText(text);
  await expect(line).toContainText(t.quote.carrierNote);
  if (date) {
    const shown = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Kyiv" }).format(new Date(date));
    await expect(line).toContainText(t.quote.deliveryDate.replace("{date}", shown));
  } else {
    await expect(line).not.toContainText(t.quote.deliveryDate.replace("{date}", ""));
  }
  await expect(page.locator("[data-slot=customs-notice]")).toHaveText(t.customsNotice);
}

// The fixture calculations: PL 397.50 UAH (21 Oct), DE 11.75 EUR (22 Oct), FR 612.75 UAH (no date); converted
// at the seeded rates with the D28 markup and charm rounding up
test("PL: town, point type filter, parcel locker, then Nova Post's estimate with the customs notice", async ({ page }) => {
  const errors = collectErrors(page);
  const t = pl.internationalDelivery;
  await page.goto("/pl/delivery-demo/nova-post");
  await page.getByLabel(t.country).selectOption("PL");

  await page.getByRole("combobox", { name: t.settlement }).fill("Wroc");
  // the town that receives no parcels (prohibitedIssuance) is not offered
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.getByRole("option", { name: /Wrocław/ }).click();

  const points = page.getByRole("group", { name: t.division }).getByRole("radio");
  await expect(points).toHaveCount(3);
  await page.getByRole("button", { name: t.divisionTypes.Postomat, exact: true }).click();
  await expect(points).toHaveCount(1);
  await points.first().check();
  await expectCarrierEstimate(page, t, "pl", { currency: "PLN", text: /^≈ 39\szł$/, date: "2026-10-21T09:00:00Z" });
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("DE: a courier delivery to an address gets Nova Post's estimate", async ({ page }) => {
  const errors = collectErrors(page);
  const t = de.internationalDelivery;
  await page.goto("/de/delivery-demo/nova-post");
  await page.getByLabel(t.country).selectOption("DE");
  await page.getByRole("radio", { name: t.methods.address }).check();
  await page.getByLabel(t.address.city).fill("Berlin");
  await page.getByLabel(t.address.postCode).fill("10115");
  await page.getByLabel(t.address.street).fill("Invalidenstraße");
  await page.getByLabel(t.address.building).fill("1");
  await page.getByRole("button", { name: t.address.submit }).click();
  await expectCarrierEstimate(page, t, "de", { currency: "EUR", text: /^≈ 12,90\s€$/, date: "2026-10-22T09:00:00Z" });
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("FR: a branch in Paris gets Nova Post's estimate, without a date when the route has none", async ({ page }) => {
  const errors = collectErrors(page);
  const t = fr.internationalDelivery;
  await page.goto("/fr/delivery-demo/nova-post");
  await page.getByLabel(t.country).selectOption("FR");
  await page.getByRole("combobox", { name: t.settlement }).fill("Par");
  await page.getByRole("option", { name: /Paris/ }).click();
  await page.getByRole("group", { name: t.division }).getByRole("radio", { name: /PARIS 1/ }).check();
  await expectCarrierEstimate(page, t, "fr", { currency: "EUR", text: /^≈ 12,90\s€$/, date: null });
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

// The fixture server cannot quote CH (422), so the zone C flat rate stands in: TBD
test("CH: courier only, to the address; no quote from Nova Post falls back to the zone rate", async ({ page }) => {
  const errors = collectErrors(page);
  const t = de.internationalDelivery;
  await page.goto("/de/delivery-demo/nova-post");
  await page.getByLabel(t.country).selectOption("CH");
  await expect(page.getByText(t.courierOnly.replace("{country}", "Schweiz"))).toBeVisible();
  await expect(page.getByRole("combobox", { name: t.settlement })).toHaveCount(0);
  await page.getByLabel(t.address.city).fill("Bern");
  await page.getByLabel(t.address.postCode).fill("3011");
  await page.getByLabel(t.address.street).fill("Marktgasse");
  await page.getByLabel(t.address.building).fill("1");
  await page.getByRole("button", { name: t.address.submit }).click();
  await expectTbdEstimate(page, t);
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

// Writes a test rate for zone B (the other tests use zones A and C) on the local stack and puts it back to TBD
test("a set zone rate is shown in the visitor's currency, marked as an estimate", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one project writes the shared zone row");
  const stack = localStack();
  test.skip(!stack, "no local Supabase stack in .env.local");
  const db = createClient<Database>(stack!.url, stack!.serviceRoleKey, { auth: { persistSession: false } });
  const t = de.internationalDelivery;
  const errors = collectErrors(page);
  // a test amount, not a business value: $15.00
  expect((await db.from("nova_post_zone_rates").update({ amount_minor: 1500, currency: "USD" }).eq("zone", "B")).error).toBeNull();
  try {
    const estimateAustria = async () => {
      await page.goto("/de/delivery-demo/nova-post");
      await page.getByLabel(t.country).selectOption("AT");
      await page.getByLabel(t.address.city).fill("Wien");
      await page.getByLabel(t.address.postCode).fill("1010");
      await page.getByLabel(t.address.street).fill("Graben");
      await page.getByLabel(t.address.building).fill("1");
      await page.getByRole("button", { name: t.address.submit }).click();
      return page.locator("[data-slot=quote-line] [data-slot=price]");
    };

    // de without a cookie or geo: EUR (D5); the seeded rates make $15.00 → 13,90 € and 69 zł (3 % markup, charm rounding up)
    let price = await estimateAustria();
    await expect(price).toHaveAttribute("data-currency", "EUR");
    await expect(price).toHaveText(/^≈ 13,90\s€$/);
    await expect(page.locator("[data-slot=estimate-mark]")).toHaveText(t.quote.estimate);
    await expect(page.locator("[data-slot=quote-line]")).toContainText(t.quote.estimateNote);

    // the header switcher's cookie picks the currency of the estimate too
    await context.addCookies([{ name: "TJS_CURRENCY", value: "PLN", url: page.url() }]);
    price = await estimateAustria();
    await expect(price).toHaveAttribute("data-currency", "PLN");
    await expect(price).toHaveText(/^≈ 69\szł$/);
  } finally {
    await db.from("nova_post_zone_rates").update({ amount_minor: null, currency: null }).eq("zone", "B");
  }
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("the UK is never offered; the EU-27 and Switzerland are", async ({ page }) => {
  await page.goto("/en/delivery-demo/nova-post");
  const codes = await page
    .getByLabel(en.internationalDelivery.country)
    .locator("option:not([disabled])")
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(codes).toHaveLength(28);
  expect(codes).toContain("CH");
  expect(codes).not.toContain("GB");
});

test("the demo page is not indexed", async ({ request }) => {
  const html = await (await request.get("/en/delivery-demo/nova-post")).text();
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
});


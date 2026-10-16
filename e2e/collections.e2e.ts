// Collections and discounts (#67) on the local stack: the admin creates a collection from the phone or desktop, adds
// two pieces, publishes it and starts a 20 % sale on it; the next request shows the collection's page, the home page
// tile and the shop navigation, every price struck through with the sale price next to it in UAH and in EUR, and the
// product's JSON-LD offer at the sale price. An order request during a sale is charged the sale price with the
// regular one kept, and a sale that ends between the checkout page and the submit re-prices the request first. Its
// tests publish products and sales of their own, so they run with the catalog writers (playwright.config.ts).
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import enCheckout from "../messages/en/checkout.json" with { type: "json" };
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import ukCatalog from "../messages/uk/catalog.json" with { type: "json" };
import ukHome from "../messages/uk/home.json" with { type: "json" };
import type { Database } from "../src/lib/supabase/database.types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const stack = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return null;
  return { url, serviceRoleKey };
})();
const db = stack
  ? createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const t = ukAdmin.collections;
const tSale = ukAdmin.sale;
const createdProducts: string[] = [];
const createdUsers: string[] = [];
const createdCollections: string[] = [];
const usedEmails: string[] = [];

type Fixture = { id: string; slug: string; title: string };

/** A published made-to-order ring of its own, titled in uk and en. */
async function createProduct(priceUsd: number): Promise<Fixture> {
  const { data: category, error } = await db!.from("categories").select("id").eq("slug", "rings").single();
  if (error) throw error;
  const id = randomUUID();
  const slug = `e2e-sale-${id.slice(0, 8)}`;
  const title = `E2E sale ring ${id.slice(0, 6)}`;
  const product = await db!.from("products").insert({ id, category_id: category.id, status: "published", price_usd: priceUsd, weight_g: 10 });
  if (product.error) throw product.error;
  createdProducts.push(id);
  const translations = await db!.from("product_translations").insert([
    { product_id: id, locale: "uk", slug, title, source: "human" },
    { product_id: id, locale: "en", slug, title, source: "human" },
  ]);
  if (translations.error) throw translations.error;
  return { id, slug, title };
}

async function signInAdmin(page: Page, next: string) {
  const email = `e2e-collections-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const role = await db!.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  if (role.error) throw role.error;

  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
  await page.goto(`/uk/sign-in-and-up?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  const form = page.getByRole("tabpanel", { name: "Увійти" });
  await form.getByLabel("Ел. пошта").fill(email);
  await form.getByLabel("Пароль").fill(password);
  await form.getByRole("button", { name: "Увійти" }).click();
  await page.waitForURL(next);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function setCurrency(page: Page, baseURL: string, currency: string) {
  await page.context().addCookies([{ name: "TJS_CURRENCY", value: currency, url: baseURL }]);
}

/** The struck regular price and the sale price of a card, in minor units of the shown currency. */
async function salePricesOf(card: ReturnType<Page["locator"]>) {
  const regular = card.locator("[data-slot=regular-price]");
  const sale = card.locator("[data-slot=price][data-sale]");
  await expect(regular).toBeVisible();
  await expect(sale).toBeVisible();
  return {
    regular: Math.round(Number(await regular.getAttribute("data-value")) * 100),
    sale: Math.round(Number(await sale.getAttribute("value")) * 100),
    currency: await sale.getAttribute("data-currency"),
  };
}

test.describe("collections and discounts on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the collections e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    if (usedEmails.length > 0) await db?.from("orders").delete().in("email", usedEmails.splice(0));
    if (createdCollections.length > 0) await db?.from("collections").delete().in("id", createdCollections.splice(0));
    if (createdProducts.length > 0) await db?.from("products").delete().in("id", createdProducts.splice(0));
    for (const id of createdUsers.splice(0)) await db?.auth.admin.deleteUser(id);
  });

  test("the admin creates a collection, adds two pieces and starts a 20 % sale: the shop shows it at once", async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    const [first, second] = [await createProduct(20), await createProduct(30)];
    const name = `E2E Весна ${randomUUID().slice(0, 6)}`;
    const slug = `e2e-vesna-${randomUUID().slice(0, 8)}`;

    await signInAdmin(page, "/uk/admin/collections");
    await page.getByRole("link", { name: t.new }).click();
    await expect(page.getByRole("heading", { level: 1, name: t.newTitle })).toBeVisible();
    const uk = page.locator("[data-locale=uk]");
    await uk.getByLabel(t.fields.name).fill(name);
    await uk.getByLabel(t.fields.slug).fill(slug);
    await uk.getByLabel(t.fields.description).fill("Легкі весняні прикраси.");
    await page.getByRole("switch", { name: t.fields.published }).click();
    await page.getByRole("button", { name: t.save, exact: true }).click();
    await page.waitForURL(/\/uk\/admin\/collections\/[0-9a-f-]{36}$/);
    const collectionId = page.url().split("/").at(-1)!;
    createdCollections.push(collectionId);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    // two pieces from the picker, in the order tapped
    await page.getByRole("button", { name: t.products.add }).click();
    const picker = page.getByRole("dialog", { name: t.products.pickerTitle });
    for (const piece of [first, second]) {
      await picker.getByRole("searchbox").fill(piece.title);
      await picker.getByRole("button", { name: new RegExp(piece.title) }).click();
      await expect(picker.getByRole("button", { name: new RegExp(piece.title) })).toBeDisabled();
    }
    await picker.getByRole("button", { name: t.products.done }).click();
    await expect(page.getByTestId("collection-product")).toHaveCount(2);
    await expect(page.getByTestId("collection-product").first()).toContainText(first.title);

    // a 20 % sale on the whole collection
    const sale = page.getByTestId("collection-sale");
    await sale.getByLabel(tSale.percent).fill("20");
    await sale.getByRole("button", { name: tSale.save }).click();
    await expect(sale.getByTestId("sale-state")).toHaveText(tSale.state.running);
    const stored = await db!.from("collection_sales").select("percent_off").eq("collection_id", collectionId).single();
    expect(stored.data?.percent_off).toBe(20);

    // the next request: the collection's page in UAH, every price struck through with the sale price next to it
    await setCurrency(page, baseURL!, "UAH");
    await open(page, `/uk/collections/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(name));
    const cards = page.getByTestId("product-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText(first.title);
    const uah = await salePricesOf(cards.first());
    expect(uah.currency).toBe("UAH");
    expect(uah.sale).toBeLessThan(uah.regular);
    // the canonical and hreflang of a human translation
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/uk/collections/${slug}$`));
    await expect(page.locator('link[rel="alternate"][hreflang="uk"]')).toHaveCount(1);

    // the same in EUR, by the same rules
    await setCurrency(page, baseURL!, "EUR");
    await open(page, `/uk/collections/${slug}`);
    const eur = await salePricesOf(page.getByTestId("product-card").first());
    expect(eur.currency).toBe("EUR");
    expect(eur.sale).toBeLessThan(eur.regular);

    // the product's page and its offer: the sale price
    await setCurrency(page, baseURL!, "UAH");
    await open(page, `/uk/product/${first.slug}`);
    const shown = await salePricesOf(page.locator("main [data-slot=sale-price]").first());
    expect(shown.sale).toBe(uah.sale);
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    const product = (jsonLd["@graph"] as { "@type": string; offers?: { price: string } }[]).find((node) => node["@type"] === "Product");
    expect(Math.round(Number(product?.offers?.price) * 100)).toBe(uah.sale);

    // linked from the home page and the shop's navigation
    await open(page, "/uk");
    const home = page.getByTestId("home-collections");
    await expect(home.getByRole("heading", { name: ukHome.collections })).toBeVisible();
    await expect(home.getByRole("link", { name })).toHaveAttribute("href", `/uk/collections/${slug}`);
    await open(page, "/uk/shop");
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(page.getByTestId("collection-nav").getByRole("link", { name })).toBeVisible();
    } else {
      await expect(page.getByTestId("mobile-filters").getByRole("option", { name: ukCatalog.collections.option.replace("{name}", name) })).toHaveCount(1);
    }

    // another locale's slug redirects to this locale's; an unknown slug answers the localized 404
    const english = await db!.from("collection_translations").insert({ collection_id: collectionId, locale: "en", slug: `${slug}-en`, name: "E2E Spring" });
    expect(english.error).toBeNull();
    const redirected = await page.request.get(`/uk/collections/${slug}-en`, { maxRedirects: 0 });
    expect(redirected.status()).toBe(308);
    expect(redirected.headers().location).toMatch(new RegExp(`/uk/collections/${slug}$`));
    const missing = await page.request.get(`/uk/collections/e2e-no-such-${randomUUID().slice(0, 8)}`);
    expect(missing.status()).toBe(404);
    expect(await missing.text()).toContain('<html lang="uk"');
    expect(errors).toEqual([]);
  });

  test("an order request is charged the running sale; a sale that ended before the submit re-prices it first", async ({ page, baseURL }) => {
    test.skip(!!process.env.E2E_BASE_URL, "needs the delivery fixtures that Playwright starts with the app");
    const errors = collectErrors(page);
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
    const piece = await createProduct(20);
    const sale = await db!.from("product_sales").insert({ product_id: piece.id, percent_off: 20 });
    expect(sale.error).toBeNull();
    await setCurrency(page, baseURL!, "EUR");
    await page.context().addCookies([
      { name: "TJS_CART", value: encodeURIComponent(JSON.stringify([{ p: piece.id, q: 1 }])), url: baseURL! },
    ]);

    const t = enCheckout.request;
    const fill = async (email: string) => {
      await page.getByLabel(t.contact.firstName).fill("Olena");
      await page.getByLabel(t.contact.phone).fill("+380 50 123 45 67");
      await page.getByLabel(t.contact.email).fill(email);
      await page.getByLabel(enCheckout.internationalDelivery.country).selectOption("UA");
      await page.getByRole("combobox", { name: enCheckout.delivery.city.label }).pressSequentially("Київ");
      await page.getByRole("listbox").getByRole("option").first().click();
      await page.getByRole("combobox", { name: enCheckout.delivery.warehouse.label }).click();
      await page.getByRole("listbox").getByRole("option").first().click();
      await expect(page.locator("[data-slot=delivery-quote] output")).toHaveText(/^≈ /);
    };

    // the checkout shows the sale: the line struck through, then the sale price
    await open(page, "/en/checkout");
    const line = page.getByTestId("checkout-line");
    const during = await salePricesOf(line);
    expect(during.currency).toBe("EUR");

    // the sale ends while the page is open: sending re-prices the request, nothing is stored
    const email = `e2e-collections-${randomUUID()}@example.test`;
    usedEmails.push(email);
    await fill(email);
    const ended = await db!.from("product_sales").delete().eq("product_id", piece.id);
    expect(ended.error).toBeNull();
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page.getByTestId("checkout-error")).toHaveText(t.errors.pricesChanged);
    // the page shows the regular price now, without a struck one
    await expect(line.locator("[data-slot=regular-price]")).toHaveCount(0);
    const regular = Math.round(Number(await line.locator("[data-slot=price]").getAttribute("value")) * 100);
    expect(regular).toBe(during.regular);
    expect((await db!.from("orders").select("id").eq("email", email)).data).toEqual([]);

    // a sale again, then the request goes through at the sale price, the regular price kept on the line
    const again = await db!.from("product_sales").insert({ product_id: piece.id, percent_off: 20 });
    expect(again.error).toBeNull();
    await open(page, "/en/checkout");
    await salePricesOf(line);
    await fill(email);
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);
    const { data: orders } = await db!
      .from("orders")
      .select("currency, items_total_minor, order_items(unit_price_usd_minor, unit_price_minor, regular_unit_price_usd_minor, regular_unit_price_minor)")
      .eq("email", email);
    expect(orders).toHaveLength(1);
    expect(orders![0]).toMatchObject({
      currency: "EUR",
      items_total_minor: during.sale,
      order_items: [
        { unit_price_usd_minor: 1600, unit_price_minor: during.sale, regular_unit_price_usd_minor: 2000, regular_unit_price_minor: during.regular },
      ],
    });
    expect(errors).toEqual([]);
  });
});

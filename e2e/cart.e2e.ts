// The cart on the local stack: its tests create products (and a user) of their own and change them in the
// database, so they run only against a loopback stack (.env.local); in CI a missing stack fails instead.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import enCart from "../messages/en/cart.json" with { type: "json" };
import enProduct from "../messages/en/product.json" with { type: "json" };
import type { Database } from "../src/lib/supabase/database.types";
import { expectOnlyEnabledRouteLinks } from "./routes";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const stack = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return null;
  return { url, serviceRoleKey };
})();

const admin = stack
  ? createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const createdProducts: string[] = [];
const createdUsers: string[] = [];

type Fixture = { id: string; slug: string; title: string; path: string };

/** A published product of its own (no photo), in the rings category. */
async function createProduct(options: { fulfillment: "made_to_order" | "one_of_a_kind"; priceUsd: number }): Promise<Fixture> {
  const { data: category, error: categoryError } = await admin!.from("categories").select("id").eq("slug", "rings").single();
  if (categoryError) throw categoryError;
  const id = randomUUID();
  const slug = `e2e-cart-${id.slice(0, 8)}`;
  const title = `E2E cart ${options.fulfillment === "one_of_a_kind" ? "unique" : "ordered"} ${id.slice(0, 4)}`;
  const product = await admin!.from("products").insert({
    id,
    category_id: category.id,
    status: "published",
    fulfillment: options.fulfillment,
    price_usd: options.priceUsd,
  });
  if (product.error) throw product.error;
  createdProducts.push(id);
  const translation = await admin!
    .from("product_translations")
    .insert({ product_id: id, locale: "en", slug, title, source: "human" });
  if (translation.error) throw translation.error;
  return { id, slug, title, path: `/en/product/${slug}` };
}

async function createUser() {
  const email = `e2e-cart-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Cart Shopper" },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  return { id: data.user.id, email, password };
}

// Each test acts from its own client address, so the per-IP cart rate limit never couples tests.
async function useOwnClientIp(page: Page) {
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/** Opens a page and waits until it has hydrated (a click before that would do nothing). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

// the projects mobile-catalog-writers / desktop-catalog-writers (playwright.config.ts)
const isMobile = (projectName: string) => projectName.startsWith("mobile");

async function addFromProductPage(page: Page, product: Fixture, times = 1) {
  await open(page, product.path);
  await expect(page.getByRole("heading", { level: 1, name: product.title })).toBeVisible();
  for (let i = 1; i <= times; i++) {
    await page.getByRole("button", { name: enProduct.addToCart }).click();
    if (i === 1 || product.title.includes("unique")) {
      await expect(page.getByTestId("in-cart")).toBeVisible();
    } else {
      await expect(page.getByTestId("in-cart")).toContainText(enProduct.cart.inCart.replace("{count}", String(i)));
    }
  }
}

/** The header's cart control: the link from 1024px up, the mini-cart button below. */
function headerCart(page: Page, projectName: string) {
  const header = page.locator("header");
  return isMobile(projectName)
    ? header.getByRole("button", { name: /^Cart,/ })
    : header.getByRole("link", { name: /^Cart,/ });
}

function line(page: Page, title: string) {
  return page.getByTestId("cart-line").filter({ hasText: title });
}

/** Amount of a streamed price element, in minor units of its currency. */
async function minorOf(locator: ReturnType<Page["locator"]>): Promise<number> {
  const value = await locator.getAttribute("value");
  expect(value, "a price with a value").toBeTruthy();
  return Math.round(Number(value) * 100);
}

async function subtotalMinor(page: Page): Promise<number> {
  return minorOf(page.getByTestId("cart-subtotal").locator("[data-slot=price]"));
}

/** The line total of an orderable line: its first price. */
async function lineTotalMinor(page: Page, title: string): Promise<number> {
  return minorOf(line(page, title).locator("[data-slot=price]").first());
}

test.describe("cart on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the cart e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    if (createdProducts.length > 0) await admin?.from("products").delete().in("id", createdProducts.splice(0));
    for (const id of createdUsers.splice(0)) await admin?.auth.admin.deleteUser(id);
  });

  test("a guest adds from two product pages, changes the quantity and removes; the cart survives a reload", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 21 });
    const unique = await createProduct({ fulfillment: "one_of_a_kind", priceUsd: 37 });

    // made to order: a second click raises the quantity
    await addFromProductPage(page, ordered, 2);
    await expect(page.getByRole("button", { name: enProduct.addToCart })).toBeEnabled();
    // one of a kind: added once, then the button says so and stays off, also after a reload
    await addFromProductPage(page, unique);
    await expect(page.getByRole("button", { name: enProduct.addedToCart })).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("button", { name: enProduct.addedToCart })).toBeDisabled();

    // the header counts every piece, without the legacy zero padding
    const cart = headerCart(page, testInfo.project.name);
    await expect(cart).toHaveAccessibleName("Cart, 3 pieces");
    await expect(page.locator("header").getByTestId("cart-count").filter({ visible: true })).toHaveText("3");

    if (isMobile(testInfo.project.name)) {
      // the mini-cart sheet lists the lines and leads to the cart page
      await cart.click();
      const sheet = page.getByRole("dialog", { name: "Cart" });
      await expect(sheet.getByTestId("mini-cart-line")).toHaveCount(2);
      await expect(sheet.getByRole("button", { name: enCart.orderRequest })).toBeDisabled();
      await expect(sheet.getByText(enCart.orderRequestTbd)).toBeVisible();
      await sheet.getByRole("link", { name: enCart.viewCart }).click();
      await expect(sheet).toBeHidden();
    } else {
      await cart.click();
    }
    await expect(page).toHaveURL(/\/en\/cart$/);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    // the next step links to the order request only once that page exists (#24); until then a visible TBD
    await expectOnlyEnabledRouteLinks(page.locator("main"), "en", ["orderRequest", "shop"]);
    await expect(page.getByRole("button", { name: enCart.orderRequest })).toBeDisabled();
    await expect(line(page, ordered.title).getByRole("status")).toHaveText("2");
    // a one-of-a-kind piece has no quantity control
    await expect(line(page, unique.title).getByRole("group")).toHaveCount(0);
    const subtotal = await subtotalMinor(page);
    expect(subtotal).toBe((await lineTotalMinor(page, ordered.title)) + (await lineTotalMinor(page, unique.title)));

    await line(page, ordered.title).getByRole("button", { name: `One more of ${ordered.title}` }).click();
    await expect(line(page, ordered.title).getByRole("status")).toHaveText("3");
    await line(page, ordered.title).getByRole("button", { name: `One less of ${ordered.title}` }).click();
    await expect(line(page, ordered.title).getByRole("status")).toHaveText("2");

    await page.reload();
    await expect(line(page, ordered.title).getByRole("status")).toHaveText("2");
    await expect(page.getByTestId("cart-line")).toHaveCount(2);

    await line(page, unique.title).getByRole("button", { name: `Remove ${unique.title}` }).click();
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(headerCart(page, testInfo.project.name)).toHaveAccessibleName("Cart, 2 pieces");
    expect(await subtotalMinor(page)).toBe(await lineTotalMinor(page, ordered.title));

    await line(page, ordered.title).getByRole("button", { name: `Remove ${ordered.title}` }).click();
    await expect(page.getByTestId("cart-empty")).toBeVisible();
    await expect(headerCart(page, testInfo.project.name)).toHaveAccessibleName("Cart, empty");
    expect(errors).toEqual([]);
  });

  test("a made-to-order line stops at 10 pieces (D36)", async ({ page, context, baseURL }) => {
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 12 });
    // the guest cart cookie, as the server writes it, already at the maximum
    await context.addCookies([
      { name: "TJS_CART", value: encodeURIComponent(JSON.stringify([{ p: ordered.id, q: 10 }])), url: baseURL! },
    ]);

    await open(page, ordered.path);
    await expect(page.getByRole("button", { name: enProduct.addToCart })).toBeDisabled();
    await expect(page.getByTestId("in-cart")).toContainText("At most 10 per product");

    await open(page, "/en/cart");
    await expect(line(page, ordered.title).getByRole("status")).toHaveText("10");
    await expect(line(page, ordered.title).getByRole("button", { name: `One more of ${ordered.title}` })).toBeDisabled();
  });

  test("a piece sold or unpublished after it was added shows as unavailable and leaves the total", async ({ page }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 19 });
    const unique = await createProduct({ fulfillment: "one_of_a_kind", priceUsd: 44 });
    await addFromProductPage(page, ordered);
    await addFromProductPage(page, unique);

    await open(page, "/en/cart");
    const both = await subtotalMinor(page);
    const orderedTotal = await lineTotalMinor(page, ordered.title);
    expect(both).toBe(orderedTotal + (await lineTotalMinor(page, unique.title)));

    // the order flow sells the piece: the next render of the cart re-checks it in the database
    const sold = await admin!.from("products").update({ availability: "sold" }).eq("id", unique.id);
    expect(sold.error).toBeNull();
    await page.reload();
    await page.waitForLoadState("networkidle");
    const soldLine = line(page, unique.title);
    await expect(soldLine).toHaveAttribute("data-status", "sold");
    await expect(soldLine.getByText(enCart.status.sold, { exact: true })).toBeVisible();
    await expect(soldLine.locator("[data-slot=price]")).toHaveCount(0);
    expect(await subtotalMinor(page)).toBe(orderedTotal);
    await expect(page.getByRole("note")).toHaveText(enCart.unavailableNote);

    // an unpublished product is no longer readable at all: shown as a piece that is no longer available
    const unpublished = await admin!.from("products").update({ status: "draft" }).eq("id", ordered.id);
    expect(unpublished.error).toBeNull();
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-testid=cart-line][data-status=unavailable]")).toContainText(enCart.unavailablePiece);
    expect(await subtotalMinor(page)).toBe(0);
    await expect(page.getByRole("button", { name: enCart.orderRequest })).toBeDisabled();

    // both can still be removed
    await soldLine.getByRole("button", { name: `Remove ${unique.title}` }).click();
    await page.getByRole("button", { name: `Remove ${enCart.unavailablePiece}` }).click();
    await expect(page.getByTestId("cart-empty")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("signing in merges the guest cart into the account; it is kept after a reload", async ({ page, context }, testInfo) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const kept = await createProduct({ fulfillment: "made_to_order", priceUsd: 15 });
    const added = await createProduct({ fulfillment: "one_of_a_kind", priceUsd: 52 });
    const user = await createUser();
    // the account already holds 3 of `kept` from an earlier visit
    const saved = await admin!.from("cart_items").insert({ user_id: user.id, product_id: kept.id, quantity: 3 });
    expect(saved.error).toBeNull();

    // as a guest: 1 of `kept` and the one-of-a-kind piece
    await addFromProductPage(page, kept);
    await addFromProductPage(page, added);
    await expect(headerCart(page, testInfo.project.name)).toHaveAccessibleName("Cart, 2 pieces");

    await open(page, "/en/sign-in-and-up");
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(user.email);
    await form.getByLabel("Password").fill(user.password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en$/);

    // merged: the larger quantity of a line in both carts, plus the guest's new line
    await expect(headerCart(page, testInfo.project.name)).toHaveAccessibleName("Cart, 4 pieces");
    await expect
      .poll(async () => {
        const { data } = await admin!.from("cart_items").select("product_id, quantity").eq("user_id", user.id).order("quantity");
        return data;
      }, { message: "the guest lines are written to the account" })
      .toEqual([
        { product_id: added.id, quantity: 1 },
        { product_id: kept.id, quantity: 3 },
      ]);
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === "TJS_CART")).toBe(false);

    await open(page, "/en/cart");
    await expect(line(page, kept.title).getByRole("status")).toHaveText("3");
    await expect(line(page, added.title)).toBeVisible();
    // the merge is idempotent: another render changes nothing
    await page.reload();
    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    await expect(line(page, kept.title).getByRole("status")).toHaveText("3");

    // changes of a signed-in shopper go to the account
    await line(page, kept.title).getByRole("button", { name: `One less of ${kept.title}` }).click();
    await expect(line(page, kept.title).getByRole("status")).toHaveText("2");
    const { data } = await admin!.from("cart_items").select("quantity").eq("user_id", user.id).eq("product_id", kept.id).single();
    expect(data?.quantity).toBe(2);
    expect(errors).toEqual([]);
  });
});

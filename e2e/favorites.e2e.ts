// Favorites and recently viewed on the local stack: the tests create products (and a user) of their own and
// change them in the database, so they run only against a loopback stack (.env.local); in CI a missing stack
// fails instead.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
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

const t = enProduct.favorites;
const toggleName = (title: string) => t.toggle.replace("{title}", title);
const removeName = (title: string) => t.remove.replace("{title}", title);

const createdProducts: string[] = [];
const createdUsers: string[] = [];

type Fixture = { id: string; slug: string; title: string; path: string };

/** A published product of its own (no photo), in the rings category. */
async function createProduct(options: { fulfillment?: "made_to_order" | "one_of_a_kind"; priceUsd?: number } = {}): Promise<Fixture> {
  const { data: category, error: categoryError } = await admin!.from("categories").select("id").eq("slug", "rings").single();
  if (categoryError) throw categoryError;
  const id = randomUUID();
  const slug = `e2e-fav-${id.slice(0, 8)}`;
  const title = `E2E favorite ${id.slice(0, 6)}`;
  const product = await admin!.from("products").insert({
    id,
    category_id: category.id,
    status: "published",
    fulfillment: options.fulfillment ?? "one_of_a_kind",
    price_usd: options.priceUsd ?? 25,
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
  const email = `e2e-fav-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Favorites Shopper" },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  return { id: data.user.id, email, password };
}

// Each test acts from its own client address, so the per-IP rate limit never couples tests.
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

const headerFavorites = (page: Page) => page.locator("header").getByRole("link", { name: /^Favorites/ });
const item = (page: Page, title: string) => page.getByTestId("favorite-item").filter({ hasText: title });
const countName = (count: number) =>
  count === 0 ? "Favorites, empty" : `Favorites, ${count} ${count === 1 ? "piece" : "pieces"}`;

/** Presses the heart of the product page and waits for the server's answer (the header's count). */
async function favoriteOnProductPage(page: Page, product: Fixture, expectedCount: number) {
  await open(page, product.path);
  const heart = page.getByRole("button", { name: toggleName(product.title) });
  await expect(heart).toHaveAttribute("aria-pressed", "false");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await expect(headerFavorites(page)).toHaveAccessibleName(countName(expectedCount));
}

test.describe("favorites and recently viewed on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the favorites e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    if (createdProducts.length > 0) await admin?.from("products").delete().in("id", createdProducts.splice(0));
    for (const id of createdUsers.splice(0)) await admin?.auth.admin.deleteUser(id);
  });

  test("a guest favorites from a catalog card and a product page; the list survives a reload and can be emptied", async ({ page, context }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const product = await createProduct({ priceUsd: 31 });

    // the header links to the favorites page
    await open(page, "/en/shop/earrings");
    await expectOnlyEnabledRouteLinks(page.locator("header"), "en", ["favorites"]);
    await expect(headerFavorites(page)).toHaveAccessibleName(countName(0));

    // a heart on a cached catalog card: a toggle button with a stable name
    const card = page.getByRole("button", { name: toggleName("Coral drop earrings") });
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(headerFavorites(page)).toHaveAccessibleName(countName(1));
    const cookie = (await context.cookies()).find((c) => c.name === "TJS_FAVORITES");
    expect(cookie?.httpOnly, "the guest favorites are a server-written httpOnly cookie").toBe(true);

    await favoriteOnProductPage(page, product, 2);
    await page.reload();
    await expect(page.getByRole("button", { name: toggleName(product.title) })).toHaveAttribute("aria-pressed", "true");

    await headerFavorites(page).click();
    await expect(page).toHaveURL(/\/en\/favorites$/);
    await page.waitForLoadState("networkidle");
    // newest first, each with its current price
    await expect(page.getByTestId("favorite-item")).toHaveCount(2);
    await expect(page.getByTestId("favorite-item").first()).toContainText(product.title);
    await expect(item(page, product.title).locator("[data-slot=price]")).toBeVisible();
    await expect(item(page, "Coral drop earrings").locator("[data-slot=price]")).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("favorite-item")).toHaveCount(2);

    await item(page, product.title).getByRole("button", { name: removeName(product.title) }).click();
    await expect(page.getByTestId("favorite-item")).toHaveCount(1);
    await expect(headerFavorites(page)).toHaveAccessibleName(countName(1));
    await item(page, "Coral drop earrings").getByRole("button", { name: removeName("Coral drop earrings") }).click();
    await expect(page.getByTestId("favorites-empty")).toBeVisible();
    await expect(headerFavorites(page)).toHaveAccessibleName(countName(0));
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === "TJS_FAVORITES")).toBe(false);
    expect(errors).toEqual([]);
  });

  test("a favorite sold or unpublished later shows why and can still be removed", async ({ page }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const sold = await createProduct();
    const gone = await createProduct();
    await favoriteOnProductPage(page, sold, 1);
    await favoriteOnProductPage(page, gone, 2);

    expect((await admin!.from("products").update({ availability: "sold" }).eq("id", sold.id)).error).toBeNull();
    expect((await admin!.from("products").update({ status: "draft" }).eq("id", gone.id)).error).toBeNull();

    await open(page, "/en/favorites");
    const soldItem = item(page, sold.title);
    await expect(soldItem).toHaveAttribute("data-status", "sold");
    await expect(soldItem.getByText(enProduct.page.sold, { exact: true })).toBeVisible();
    await expect(soldItem.locator("[data-slot=price]")).toHaveCount(0);
    const goneItem = page.locator("[data-testid=favorite-item][data-status=unavailable]");
    await expect(goneItem).toContainText(t.unavailablePiece);
    await expect(goneItem).not.toContainText(gone.title);

    await soldItem.getByRole("button", { name: removeName(sold.title) }).click();
    await page.getByRole("button", { name: removeName(t.unavailablePiece) }).click();
    await expect(page.getByTestId("favorites-empty")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("a refused heart rolls back: a piece unpublished while its page is open", async ({ page }) => {
    await useOwnClientIp(page);
    const product = await createProduct();
    await open(page, product.path);
    expect((await admin!.from("products").update({ status: "draft" }).eq("id", product.id)).error).toBeNull();

    const heart = page.getByRole("button", { name: toggleName(product.title) });
    await heart.click();
    await expect(page.getByText(t.errors.unavailable)).toBeVisible();
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await expect(headerFavorites(page)).toHaveAccessibleName(countName(0));
  });

  test("signing in merges the guest favorites into the account; they are kept after a reload", async ({ page, context }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const saved = await createProduct();
    const added = await createProduct();
    const user = await createUser();
    // the account already holds `saved` from an earlier visit
    expect((await admin!.from("favorites").insert({ user_id: user.id, product_id: saved.id })).error).toBeNull();

    // as a guest: `added` and `saved` again (a favorite in both lists)
    await favoriteOnProductPage(page, added, 1);
    await favoriteOnProductPage(page, saved, 2);

    await open(page, "/en/sign-in-and-up");
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(user.email);
    await form.getByLabel("Password").fill(user.password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en$/);

    await expect(headerFavorites(page)).toHaveAccessibleName(countName(2));
    await expect
      .poll(
        async () => {
          const { data } = await admin!.from("favorites").select("product_id").eq("user_id", user.id);
          return data?.map((row) => row.product_id).sort();
        },
        { message: "the guest favorites are written to the account" },
      )
      .toEqual([saved.id, added.id].sort());
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === "TJS_FAVORITES")).toBe(false);

    await open(page, "/en/favorites");
    await expect(page.getByTestId("favorite-item")).toHaveCount(2);
    // the merge is idempotent: another render changes nothing
    await page.reload();
    await expect(page.getByTestId("favorite-item")).toHaveCount(2);

    // a signed-in shopper's hearts read and write the account
    await open(page, added.path);
    const heart = page.getByRole("button", { name: toggleName(added.title) });
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await heart.click();
    await expect(heart).toHaveAttribute("aria-pressed", "false");
    await expect(headerFavorites(page)).toHaveAccessibleName(countName(1));
    const { data } = await admin!.from("favorites").select("product_id").eq("user_id", user.id);
    expect(data?.map((row) => row.product_id)).toEqual([saved.id]);
    expect(errors).toEqual([]);
  });

  test("the product page shows the recently viewed pieces, newest first, without the current and unpublished ones", async ({ page, context }) => {
    const errors = collectErrors(page);
    const [first, second, third, fourth, hidden] = await Promise.all([1, 2, 3, 4, 5].map(() => createProduct()));

    // the first product page has nothing to show yet
    await open(page, first.path);
    await expect(page.getByTestId("recently-viewed")).toHaveCount(0);
    for (const product of [hidden, second, third]) await open(page, product.path);
    expect((await admin!.from("products").update({ status: "draft" }).eq("id", hidden.id)).error).toBeNull();

    await open(page, fourth.path);
    const strip = page.getByTestId("recently-viewed");
    await expect(page.getByRole("heading", { name: enProduct.recentlyViewed.title })).toBeVisible();
    await expect(strip.getByRole("link")).toHaveText([third.title, second.title, first.title].map((title) => new RegExp(title)));

    // viewing one again moves it to the front; the current piece is never in its own strip
    await open(page, first.path);
    await expect(page.getByTestId("recently-viewed").getByRole("link")).toHaveText(
      [fourth.title, third.title, second.title].map((title) => new RegExp(title)),
    );

    // the cookie keeps nothing but product ids
    const cookie = (await context.cookies()).find((c) => c.name === "TJS_RECENT");
    expect(cookie?.value.split(".")).toEqual([first.id, fourth.id, third.id, second.id, hidden.id]);
    expect(errors).toEqual([]);
  });
});

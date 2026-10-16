// The render race of #93: a storefront render that read a product before an admin save and finished after it
// must not leave the old product in the cache for the next visitor. The server holds a render that read the
// test's product while `<RENDER_HOLD_DIR>/<product id>.hold` exists (src/lib/catalog/render-hold.ts, a
// test-only hook the e2e server alone switches on), so the save lands between the read and the store every
// time. Runs on the production build (`next start`), where the route cache keeps rendered pages.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import { RENDER_HOLD_DIR } from "./render-hold";

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
const createdSkus: string[] = [];
const createdUsers: string[] = [];

type Credentials = { email: string; password: string };

async function createAdmin(): Promise<Credentials> {
  const email = `e2e-race-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const { error: roleError } = await db!.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  if (roleError) throw roleError;
  return { email, password };
}

/** Signs in through the form (from its own client address: the auth rate limit is per IP) and goes to `next`. */
async function signIn(page: Page, user: Credentials, next: string) {
  await page
    .context()
    .setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
  await page.goto(`/uk/sign-in-and-up?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  const form = page.getByRole("tabpanel", { name: "Увійти" });
  await form.getByLabel("Ел. пошта").fill(user.email);
  await form.getByLabel("Пароль").fill(user.password);
  await form.getByRole("button", { name: "Увійти" }).click();
  await page.waitForURL(next);
}

/** A published ring with a uk title, newest in the shop (the listings' default order). */
async function insertPublished(title: string): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const sku = `E2E-93-${suffix}`;
  const slug = `e2e-93-${suffix}`;
  const { data: category } = await db!.from("categories").select("id").eq("slug", "rings").single();
  const { data, error } = await db!
    .from("products")
    .insert({ category_id: category!.id, sku, status: "draft", price_usd: 12 })
    .select("id")
    .single();
  if (error) throw error;
  createdSkus.push(sku);
  const translation = await db!.from("product_translations").insert({ product_id: data.id, locale: "uk", slug, title });
  if (translation.error) throw translation.error;
  const published = await db!.from("products").update({ status: "published" }).eq("id", data.id);
  if (published.error) throw published.error;
  return { id: data.id, slug };
}

/** Renames the product through the admin's form: its Server Action expires the storefront's tags (updateTag). */
async function renameInAdmin(page: Page, admin: Credentials, productId: string, title: string) {
  await signIn(page, admin, `/uk/admin/products/${productId}`);
  await page.waitForLoadState("networkidle");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: ukAdmin.form.save }) });
  await form.getByLabel(ukAdmin.form.translation.title).first().fill(title);
  await form.getByRole("button", { name: ukAdmin.form.save }).click();
  await expect(page.getByText(ukAdmin.form.saved)).toBeVisible();
}

/**
 * Starts a request for `path` whose render holds once it has read the product, renames the product in the
 * admin meanwhile, lets the render finish and returns its body (what that render stored).
 */
async function renameDuringRender(
  page: Page,
  request: APIRequestContext,
  { admin, productId, path, title }: { admin: Credentials; productId: string; path: string; title: string },
): Promise<string> {
  const hold = join(RENDER_HOLD_DIR, `${productId}.hold`);
  const held = join(RENDER_HOLD_DIR, `${productId}.held`);
  mkdirSync(RENDER_HOLD_DIR, { recursive: true });
  writeFileSync(hold, "");
  try {
    const render = request.get(path);
    await expect.poll(() => existsSync(held), { message: `a render of ${path} reads the product and holds` }).toBe(true);
    await renameInAdmin(page, admin, productId, title);
    rmSync(hold);
    const response = await render;
    expect(response.status()).toBe(200);
    return await response.text();
  } finally {
    rmSync(hold, { force: true });
    rmSync(held, { force: true });
  }
}

test.describe("a render that read a product before an admin save (#93)", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the cache race e2e must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");
  test.skip(!!process.env.E2E_BASE_URL, "holds renders of the server it starts itself (playwright.config.ts)");
  // the race is the server's, not the viewport's: once is enough, and two projects would share the listings
  test.skip(({ isMobile }) => isMobile, "runs in the desktop project only");

  let admin: Credentials;

  test.beforeAll(async () => {
    admin = await createAdmin();
  });

  test.afterAll(async () => {
    // hard delete: translations go with their product
    if (createdSkus.length > 0) await db?.from("products").delete().in("sku", createdSkus.splice(0));
    for (const id of createdUsers.splice(0)) await db?.auth.admin.deleteUser(id);
  });

  test("the product page: the next request shows the saved title", async ({ page, request }) => {
    const suffix = randomUUID().slice(0, 8);
    const before = `Гонка ${suffix} до`;
    const after = `Гонка ${suffix} після`;
    const product = await insertPublished(before);
    const path = `/uk/product/${product.slug}`;

    const held = await renameDuringRender(page, request, { admin, productId: product.id, path, title: after });
    // the held render read the product before the save
    expect(held).toContain(before);

    const next = await (await request.get(path)).text();
    expect(next).toContain(after);
    expect(next).not.toContain(before);
  });

  for (const path of ["/uk/shop/rings", "/uk/shop"]) {
    test(`the listing ${path}: the next request shows the saved title`, async ({ page, request }) => {
      const suffix = randomUUID().slice(0, 8);
      const before = `Гонка ${suffix} до`;
      const after = `Гонка ${suffix} після`;
      const product = await insertPublished(before);

      const held = await renameDuringRender(page, request, { admin, productId: product.id, path, title: after });
      expect(held).toContain(before);

      const next = await (await request.get(path)).text();
      expect(next).toContain(after);
      expect(next).not.toContain(before);
    });
  }
});

// The admin area on the local Supabase stack: the guard (guest, customer, admin), the refusal of an admin
// action called directly, and the product flow from creation to deletion with the storefront following each
// save. It publishes products, which changes the storefront listings, so it runs in its own projects after
// the storefront tests (playwright.config.ts).
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import ukErrors from "../messages/uk/errors.json" with { type: "json" };
import ukProduct from "../messages/uk/product.json" with { type: "json" };

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
const createdUsers: string[] = [];
const createdSkus: string[] = [];

// texts only the admin area renders: none of them may reach a guest or a customer
const ADMIN_ONLY_TEXTS = [ukAdmin.shell.title, ukAdmin.list.searchPlaceholder, ukAdmin.form.translationsHint];

type Credentials = { email: string; password: string };

async function createUser(role: "admin" | "customer"): Promise<Credentials> {
  const email = `e2e-admin-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  if (role === "admin") {
    const { error: roleError } = await db!.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
    if (roleError) throw roleError;
  }
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

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/** The document and its RSC payload (what a client navigation fetches) contain none of the admin's texts. */
async function expectNothingOfTheAdmin(request: APIRequestContext, path: string, secrets: string[]) {
  const variants: Record<string, string>[] = [{}, { RSC: "1" }];
  for (const headers of variants) {
    const body = await (await request.get(path, { headers, maxRedirects: 0 })).text();
    for (const text of [...ADMIN_ONLY_TEXTS, ...secrets]) expect(body, `${path} ${JSON.stringify(headers)}`).not.toContain(text);
  }
}

async function insertDraft(title: string): Promise<{ id: string; sku: string }> {
  const sku = `E2E-17-${randomUUID().slice(0, 8)}`;
  const { data: category } = await db!.from("categories").select("id").eq("slug", "rings").single();
  const { data, error } = await db!
    .from("products")
    .insert({ category_id: category!.id, sku, status: "draft", price_usd: 12 })
    .select("id")
    .single();
  if (error) throw error;
  createdSkus.push(sku);
  const translation = await db!
    .from("product_translations")
    .insert({ product_id: data.id, locale: "uk", slug: `e2e-17-${randomUUID().slice(0, 8)}`, title });
  if (translation.error) throw translation.error;
  return { id: data.id, sku };
}

async function statusOf(id: string): Promise<string | undefined> {
  const { data } = await db!.from("products").select("status").eq("id", id).single();
  return data?.status;
}

test.describe("admin on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the admin e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    // hard delete: translations go with their product
    if (createdSkus.length > 0) await db?.from("products").delete().in("sku", createdSkus.splice(0));
    for (const id of createdUsers.splice(0)) await db?.auth.admin.deleteUser(id);
  });

  test("a guest is sent to sign in, a customer gets the not-found page, an admin gets the admin", async ({ page, browser, request }) => {
    const draftTitle = `Чернетка ${randomUUID().slice(0, 8)}`;
    await insertDraft(draftTitle);

    // guest: no admin text and no draft in the HTML or the RSC payload, then on to the sign-in page
    await expectNothingOfTheAdmin(request, "/uk/admin", [draftTitle]);
    await page.goto("/uk/admin");
    await page.waitForURL(`/uk/sign-in-and-up?next=${encodeURIComponent("/uk/admin")}`);

    // customer
    const customerContext = await browser.newContext();
    const customer = await customerContext.newPage();
    await signIn(customer, await createUser("customer"), "/uk");
    await customer.goto("/uk/admin");
    await expect(customer.getByRole("heading", { name: ukErrors.notFound.title })).toBeVisible();
    await expect(customer.getByText(draftTitle)).toHaveCount(0);
    await expectNothingOfTheAdmin(customerContext.request, "/uk/admin", [draftTitle]);
    await expectNothingOfTheAdmin(customerContext.request, "/uk/admin/products/new", []);
    await customerContext.close();

    // admin
    const errors = collectErrors(page);
    await signIn(page, await createUser("admin"), "/uk/admin");
    await expect(page.getByRole("heading", { level: 1, name: ukAdmin.list.title })).toBeVisible();
    await expect(page.getByRole("navigation", { name: ukAdmin.shell.nav })).toBeVisible();
    await expect(page.getByRole("link", { name: draftTitle })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the list pages a catalogue the size of the legacy import, keeping the search", async ({ page }) => {
    // 170 drafts (the import brought 167 products): drafts never reach the storefront listings
    const prefix = `E2E-17-PG-${randomUUID().slice(0, 6)}`;
    const { data: category } = await db!.from("categories").select("id").eq("slug", "rings").single();
    const rows = Array.from({ length: 170 }, (_, i) => ({
      category_id: category!.id,
      sku: `${prefix}-${String(i).padStart(3, "0")}`,
      status: "draft" as const,
      price_usd: 10,
    }));
    const { error } = await db!.from("products").insert(rows);
    if (error) throw error;
    createdSkus.push(...rows.map((r) => r.sku));

    await signIn(page, await createUser("admin"), "/uk/admin");
    await page.goto(`/uk/admin?q=${prefix}`);
    await expect(page.getByRole("status")).toHaveText("170 товарів");
    const cards = page.getByRole("main").getByRole("listitem");
    await expect(cards).toHaveCount(50);
    const pages = page.getByRole("navigation", { name: ukAdmin.list.pagination.label });
    await expect(pages).toContainText("Сторінка 1 з 4");
    await pages.getByRole("link", { name: ukAdmin.list.pagination.next }).click();
    await page.waitForURL(`/uk/admin?q=${prefix}&page=2`);
    await expect(pages).toContainText("Сторінка 2 з 4");
    await page.goto(`/uk/admin?q=${prefix}&page=4`);
    await expect(cards).toHaveCount(20);
    await expect(pages.getByRole("link", { name: ukAdmin.list.pagination.next })).toHaveCount(0);
  });

  test("an admin action called directly by a customer or a guest is refused", async ({ page, browser, playwright, baseURL }) => {
    const title = `Пряма дія ${randomUUID().slice(0, 8)}`;
    const product = await insertDraft(title);

    // the admin publishes it once, which reveals the action's id and arguments as the browser sends them
    await signIn(page, await createUser("admin"), "/uk/admin");
    await page.goto(`/uk/admin?q=${product.sku}`);
    const card = page.getByRole("listitem").filter({ hasText: title });
    const [actionRequest] = await Promise.all([
      page.waitForRequest((r) => r.method() === "POST" && r.headers()["next-action"] !== undefined),
      card.getByRole("button", { name: ukAdmin.list.publish }).click(),
    ]);
    await expect.poll(() => statusOf(product.id)).toBe("published");
    const call = {
      url: actionRequest.url(),
      headers: { "next-action": actionRequest.headers()["next-action"], "content-type": actionRequest.headers()["content-type"] },
      data: actionRequest.postData() ?? "",
    };
    expect(call.data).toContain(product.id);

    // back to draft, then the same call from a customer's session and from a guest
    await db!.from("products").update({ status: "draft" }).eq("id", product.id);
    const customerContext = await browser.newContext();
    const customer = await customerContext.newPage();
    await signIn(customer, await createUser("customer"), "/uk");
    const guest = await playwright.request.newContext({ baseURL });
    for (const [who, client] of [["customer", customerContext.request], ["guest", guest]] as const) {
      const response = await client.post(call.url, { headers: call.headers, data: call.data });
      expect(await response.text(), who).toContain("notAuthorized");
      expect(await statusOf(product.id), who).toBe("draft");
    }
    await guest.dispose();
    await customerContext.close();
  });

  test("create a made-to-order product, publish it, edit its price, archive and delete it", async ({ page }) => {
    const errors = collectErrors(page);
    const suffix = randomUUID().slice(0, 8);
    const title = `Каблучка тест ${suffix}`;
    const sku = `E2E-17-${suffix}`;
    createdSkus.push(sku);

    await signIn(page, await createUser("admin"), "/uk/admin");
    await page.getByRole("navigation", { name: ukAdmin.shell.nav }).getByRole("link", { name: ukAdmin.shell.newProduct }).click();
    await page.waitForURL("/uk/admin/products/new");
    await page.waitForLoadState("networkidle");

    // a refused save keeps what was typed and names the field
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: ukAdmin.form.save }) });
    await form.getByLabel(ukAdmin.form.translation.title).first().fill(title);
    await form.getByRole("button", { name: ukAdmin.form.save }).click();
    const price = form.getByLabel(ukAdmin.product.priceLabel.replace("{currency}", "USD"));
    await expect(price).toHaveAttribute("aria-invalid", "true");
    await expect(price).toHaveAccessibleDescription(ukAdmin.form.errors.required);
    await expect(form.getByLabel(ukAdmin.form.translation.title).first()).toHaveValue(title);

    await form.getByLabel(ukAdmin.product.typeLabel).selectOption({ label: "Каблучки" });
    await price.fill("31.50");
    await form.getByLabel(ukAdmin.product.weightLabel).fill("4");
    await form.getByLabel(ukAdmin.form.sku, { exact: true }).fill(sku);
    await form.getByLabel(ukAdmin.form.leadTimeMin, { exact: true }).fill("5");
    await form.getByLabel(ukAdmin.form.leadTimeMax, { exact: true }).fill("9");
    await form.getByLabel(ukAdmin.form.lengthMm).fill("22");
    // the slug follows the title (KMU 2010 transliteration)
    await expect(form.getByLabel(ukAdmin.form.translation.slug).first()).toHaveValue(`kabluchka-test-${suffix}`);
    await form.getByLabel(ukAdmin.form.translation.clasp).first().fill("Без застібки");
    await form.getByLabel(ukAdmin.form.translation.leadTimeNote).first().fill("У грудні довше.");
    await form.getByText(ukAdmin.status.published, { exact: true }).click();
    await form.getByRole("button", { name: ukAdmin.form.save }).click();
    await page.waitForURL(/\/uk\/admin\/products\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    const { data: saved } = await db!
      .from("products")
      .select("id, created_by, updated_by, lead_time_min_days, lead_time_max_days, length_mm")
      .eq("sku", sku)
      .single();
    expect(saved).toMatchObject({ lead_time_min_days: 5, lead_time_max_days: 9, length_mm: 22 });
    expect(saved!.created_by).not.toBeNull();

    // the storefront has it on the next request: the listing and the product page with the new fields
    await page.goto("/uk/shop");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
    const productPath = `/uk/product/kabluchka-test-${suffix}`;
    await page.goto(productPath);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Виготовлення 5–9 днів")).toBeVisible();
    await expect(page.getByText("У грудні довше.")).toBeVisible();
    await expect(page.getByText("Без застібки")).toBeVisible();
    await expect(page.getByText(ukProduct.page.dimensions)).toBeVisible();
    const shownPrice = page.getByRole("main").getByText(/\d\s*₴/).first();
    const priceBefore = await shownPrice.textContent();

    // edit the price: the product page shows the new one without a rebuild
    await page.goto(`/uk/admin/products/${saved!.id}`);
    await page.waitForLoadState("networkidle");
    await price.fill("99.00");
    await form.getByRole("button", { name: ukAdmin.form.save }).click();
    await expect(page.getByText(ukAdmin.form.saved)).toBeVisible();
    await page.goto(productPath);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(shownPrice).not.toHaveText(priceBefore ?? "");

    // archive: gone from the shop
    await page.goto(`/uk/admin/products/${saved!.id}`);
    await page.waitForLoadState("networkidle");
    await form.getByText(ukAdmin.status.archived, { exact: true }).click();
    await form.getByRole("button", { name: ukAdmin.form.save }).click();
    await expect(page.getByText(ukAdmin.form.saved)).toBeVisible();
    await page.goto("/uk/shop");
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);

    // delete with confirmation: gone from the admin list, kept as a soft-deleted row
    await page.goto(`/uk/admin/products/${saved!.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: ukAdmin.form.delete }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(ukAdmin.product.confirmDeletionTwice);
    await dialog.getByRole("button", { name: ukAdmin.form.deleteConfirm }).click();
    await page.waitForURL("/uk/admin");
    await expect(page.getByRole("link", { name: title })).toHaveCount(0);
    const { data: deleted } = await db!.from("products").select("deleted_at").eq("id", saved!.id).single();
    expect(deleted?.deleted_at).not.toBeNull();
    await page.goto(productPath);
    await expect(page.getByRole("heading", { name: ukErrors.notFound.title })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

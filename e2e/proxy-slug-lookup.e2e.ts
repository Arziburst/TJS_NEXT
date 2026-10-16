// The proxy's slug lookup follows an admin change at once (#74): a document request right after a save gets the
// right status, without waiting out a cache. Each URL is requested before the change too, so a cached lookup
// (the old 60 s per-instance cache) would answer the previous status. Requests go without cookies or JavaScript,
// as a crawler sends them. It publishes and unpublishes products and a collection of its own, so it runs with the
// catalog writers (playwright.config.ts).
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import ukCommon from "../messages/uk/common.json" with { type: "json" };
import ukErrors from "../messages/uk/errors.json" with { type: "json" };

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
const createdProducts: string[] = [];
const createdCollections: string[] = [];

async function signInAdmin(page: Page, next: string) {
  const email = `e2e-slug-lookup-${randomUUID()}@example.test`;
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
  await page.waitForLoadState("networkidle");
}

/**
 * Clicks a save button and waits for its Server Action's answer: the write and its cache invalidation are done (a
 * "saved" note may still show from the save before).
 */
async function submitAction(page: Page, button: Locator) {
  const answered = page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined);
  await button.click();
  expect((await answered).ok()).toBe(true);
}

/** The document answers 200 with this text in its HTML. */
async function expectPage(request: APIRequestContext, path: string, text: string) {
  const response = await request.get(path, { maxRedirects: 0 });
  expect(response.status(), path).toBe(200);
  expect(await response.text(), path).toContain(text);
}

/** The document answers 404 with the localized not-found page in its HTML, and nothing of `text`. */
async function expectNotFound(request: APIRequestContext, path: string, text: string) {
  const response = await request.get(path, { maxRedirects: 0 });
  expect(response.status(), path).toBe(404);
  const html = await response.text();
  expect(html).toContain('<html lang="uk"');
  expect(html).toContain(`<title>${ukErrors.notFound.title} | ${ukCommon.brand}</title>`);
  expect(html).toContain(ukErrors.notFound.description);
  expect(html).not.toContain(text);
}

test.describe("the proxy's slug lookup after an admin change (#74)", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the slug lookup e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");
  // one admin flow per run is enough: the proxy does not depend on the viewport
  test.skip(({ isMobile }) => isMobile, "runs in the desktop project only");

  test.afterAll(async () => {
    if (createdCollections.length > 0) await db?.from("collections").delete().in("id", createdCollections.splice(0));
    if (createdProducts.length > 0) await db?.from("products").delete().in("id", createdProducts.splice(0));
    for (const id of createdUsers.splice(0)) await db?.auth.admin.deleteUser(id);
  });

  test("a product: publish, rename, archive, publish, delete — each document request right after the save", async ({ page, request }) => {
    const suffix = randomUUID().slice(0, 8);
    const title = `E2E slug lookup ${suffix}`;
    const slug = `e2e-slug-lookup-${suffix}`;
    const renamed = `${slug}-new`;
    const { data: category, error } = await db!.from("categories").select("id").eq("slug", "rings").single();
    if (error) throw error;
    const id = randomUUID();
    const product = await db!.from("products").insert({ id, category_id: category.id, sku: `E2E-74-${suffix}`, status: "draft", price_usd: 15 });
    if (product.error) throw product.error;
    createdProducts.push(id);
    const translation = await db!.from("product_translations").insert({ product_id: id, locale: "uk", slug, title });
    if (translation.error) throw translation.error;
    const path = `/uk/product/${slug}`;
    const renamedPath = `/uk/product/${renamed}`;

    // a draft: 404 (a lookup cache would now hold "not found" for this slug)
    await expectNotFound(request, path, title);

    await signInAdmin(page, `/uk/admin/products/${id}`);
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: ukAdmin.form.save }) });
    async function save(expected: { status: string; slug: string }) {
      await submitAction(page, form.getByRole("button", { name: ukAdmin.form.save }));
      const { data: row } = await db!.from("products").select("status, product_translations(slug)").eq("id", id).single();
      expect({ status: row?.status, slug: row?.product_translations[0]?.slug }).toEqual(expected);
    }
    async function setStatus(status: keyof typeof ukAdmin.status, currentSlug: string) {
      await form.getByText(ukAdmin.status[status], { exact: true }).click();
      await save({ status, slug: currentSlug });
    }

    await setStatus("published", slug);
    await expectPage(request, path, title);
    await expectNotFound(request, renamedPath, title);

    // a new slug: the new URL answers at once, the old one as it does for any slug no product has (404)
    await form.getByLabel(ukAdmin.form.translation.slug).first().fill(renamed);
    await save({ status: "published", slug: renamed });
    await expectPage(request, renamedPath, title);
    await expectNotFound(request, path, title);

    await setStatus("archived", renamed);
    await expectNotFound(request, renamedPath, title);

    await setStatus("published", renamed);
    await expectPage(request, renamedPath, title);

    await page.getByRole("button", { name: ukAdmin.form.delete }).click();
    await page.getByRole("dialog").getByRole("button", { name: ukAdmin.form.deleteConfirm }).click();
    await page.waitForURL("/uk/admin");
    const { data: deleted } = await db!.from("products").select("deleted_at").eq("id", id).single();
    expect(deleted?.deleted_at).not.toBeNull();
    await expectNotFound(request, renamedPath, title);
  });

  test("a collection: publish, unpublish — each document request right after the save", async ({ page, request }) => {
    const suffix = randomUUID().slice(0, 8);
    const name = `E2E slug lookup ${suffix}`;
    const slug = `e2e-slug-lookup-${suffix}`;
    const { data: collection, error } = await db!.from("collections").insert({ is_published: false }).select("id").single();
    if (error) throw error;
    const collectionId = collection.id;
    createdCollections.push(collectionId);
    const translation = await db!.from("collection_translations").insert({ collection_id: collectionId, locale: "uk", slug, name });
    if (translation.error) throw translation.error;
    const path = `/uk/collections/${slug}`;

    await expectNotFound(request, path, name);

    const t = ukAdmin.collections;
    await signInAdmin(page, `/uk/admin/collections/${collectionId}`);
    const published = page.getByRole("switch", { name: t.fields.published });
    async function togglePublished(checked: boolean) {
      await published.click();
      await submitAction(page, page.getByRole("button", { name: t.save, exact: true }));
      const { data: row } = await db!.from("collections").select("is_published").eq("id", collectionId).single();
      expect(row?.is_published).toBe(checked);
    }

    await togglePublished(true);
    await expectPage(request, path, name);

    await togglePublished(false);
    await expectNotFound(request, path, name);
  });
});

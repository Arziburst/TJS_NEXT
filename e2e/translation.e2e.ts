// Machine translation in the admin on the local Supabase stack, against the AI Gateway stand-in
// (e2e/ai-gateway-mock.ts, started by playwright.config.ts): translate a product into the 10 other languages,
// mark two reviewed, and see the storefront index only those; then the list's bulk actions. It publishes
// products of its own, so it runs with the other catalog writers (playwright.config.ts).
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import ukNav from "../messages/uk/nav.json" with { type: "json" };

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

const OTHER_LOCALES = ["en", "de", "fr", "es", "it", "pl", "nl", "cs", "pt", "ro"] as const;
const tr = ukAdmin.translate;
const localeName = ukNav.localeNames;

type Credentials = { email: string; password: string };

async function createAdmin(): Promise<Credentials> {
  const email = `e2e-translate-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const { error: roleError } = await db!.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  if (roleError) throw roleError;
  return { email, password };
}

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

/** A product with only its Ukrainian (human) text. */
async function insertProduct(title: string, status: "draft" | "published"): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const sku = `E2E-19-${suffix}`;
  const { data: category } = await db!.from("categories").select("id").eq("slug", "rings").single();
  const { data, error } = await db!
    .from("products")
    .insert({ category_id: category!.id, sku, status, price_usd: 25 })
    .select("id")
    .single();
  if (error) throw error;
  createdSkus.push(sku);
  const slug = `e2e-19-${suffix}`;
  const translation = await db!.from("product_translations").insert({
    product_id: data.id,
    locale: "uk",
    slug,
    title,
    description: "Тонка каблучка з коралом.",
    materials: "Латунь, позолота",
    source: "human",
  });
  if (translation.error) throw translation.error;
  return { id: data.id, slug };
}

async function translationsOf(id: string) {
  const { data } = await db!
    .from("product_translations")
    .select("locale, slug, title, source, reviewed_at")
    .eq("product_id", id);
  return new Map((data ?? []).map((row) => [row.locale, row]));
}

const hreflangsOf = (html: string) =>
  Object.fromEntries(
    [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map(([, lang, href]) => [
      lang,
      new URL(href).pathname,
    ]),
  );
const NOINDEX = /<meta name="robots" content="noindex, follow"\/>/;

test.describe("machine translation on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the translation e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    if (createdSkus.length > 0) await db?.from("products").delete().in("sku", createdSkus.splice(0));
    for (const id of createdUsers.splice(0)) await db?.auth.admin.deleteUser(id);
  });

  test("translate a product into 11 locales, mark two reviewed: only those are indexed", async ({ page, request }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const title = `Каблучка переклад ${randomUUID().slice(0, 8)}`;
    const product = await insertProduct(title, "published");
    const admin = await createAdmin();

    await signIn(page, admin, `/uk/admin/products/${product.id}`);
    await page.waitForLoadState("networkidle");
    const panel = page.locator('[data-slot="translate-panel"]');
    await expect(panel.getByLabel(tr.source)).toHaveValue("uk");
    // every missing locale is chosen by default
    for (const locale of OTHER_LOCALES) await expect(panel.getByLabel(localeName[locale], { exact: true })).toBeChecked();

    await panel.getByRole("button", { name: "Перекласти 10 мовами" }).click();
    await expect(panel.getByRole("status").filter({ hasText: "Перекладаємо 10 мовами" })).toBeVisible();
    await expect(panel.getByText(/^Перекладено: /)).toBeVisible({ timeout: 60_000 });

    // saved as machine rows, not reviewed; the uk text stays the human one
    const rows = await translationsOf(product.id);
    expect([...rows.keys()].sort()).toEqual(["uk", ...OTHER_LOCALES].sort());
    expect(rows.get("uk")).toMatchObject({ source: "human", title });
    for (const locale of OTHER_LOCALES) {
      expect(rows.get(locale), locale).toMatchObject({ source: "machine", reviewed_at: null, title: `[${locale}] ${title}` });
    }
    // every target tile now carries its "has a text" badge, on one line (a 12 px line), desktop and phone
    const badges = panel.getByRole("group", { name: tr.targets }).getByText(tr.existing, { exact: true });
    await expect(badges).toHaveCount(10);
    const heights = await badges.evaluateAll((spans) => spans.map((span) => span.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeLessThan(24);
    // the form shows every locale filled, without a reload
    await expect(page.locator("details").filter({ hasText: localeName.cs }).getByText(ukAdmin.form.translation.filled)).toBeVisible();
    const deFields = page.locator("details").filter({ has: page.locator('input[name="tr.de.title"]') });
    await deFields.locator("summary").click();
    await expect(deFields.getByLabel(ukAdmin.form.translation.title, { exact: true })).toHaveValue(`[de] ${title}`);

    // mark de and fr reviewed
    for (const locale of ["de", "fr"] as const) {
      const toggle = panel.getByRole("switch", { name: tr.review.label.replace("{language}", localeName[locale]) });
      await expect(toggle).not.toBeChecked();
      await toggle.click();
      await expect(toggle).toBeChecked();
    }
    const reviewed = await translationsOf(product.id);
    expect(reviewed.get("de")?.reviewed_at).not.toBeNull();
    expect(reviewed.get("fr")?.reviewed_at).not.toBeNull();
    expect(reviewed.get("pl")?.reviewed_at).toBeNull();
    expect(errors).toEqual([]);

    // the storefront: a reviewed translation is indexable and in hreflang; an unreviewed one renders, noindex
    const dePath = `/de/product/${reviewed.get("de")!.slug}`;
    const plPath = `/pl/product/${reviewed.get("pl")!.slug}`;
    const de = await request.get(dePath);
    expect(de.status()).toBe(200);
    const deHtml = await de.text();
    expect(deHtml).toContain(`[de] ${title}`);
    expect(deHtml).not.toMatch(NOINDEX);
    // en is an unreviewed machine translation too: no x-default
    expect(hreflangsOf(deHtml)).toEqual({
      uk: `/uk/product/${product.slug}`,
      de: dePath,
      fr: `/fr/product/${reviewed.get("fr")!.slug}`,
    });

    const pl = await request.get(plPath);
    expect(pl.status()).toBe(200);
    const plHtml = await pl.text();
    expect(plHtml).toContain(`[pl] ${title}`);
    expect(plHtml).toMatch(NOINDEX);
    expect(Object.keys(hreflangsOf(plHtml)).sort()).toEqual(["de", "fr", "uk"]);

    // taking the review back makes the page noindex again
    await page.goto(`/uk/admin/products/${product.id}`);
    await page.waitForLoadState("networkidle");
    const deToggle = panel.getByRole("switch", { name: tr.review.label.replace("{language}", localeName.de) });
    await deToggle.click();
    await expect(deToggle).not.toBeChecked();
    await expect.poll(async () => (await translationsOf(product.id)).get("de")?.reviewed_at ?? null).toBeNull();
    expect(await (await request.get(dePath)).text()).toMatch(NOINDEX);
    expect(errors).toEqual([]);
  });

  test("the list translates the missing locales of the selected products and marks them reviewed", async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    const tag = randomUUID().slice(0, 8);
    // the second one comes back without cs: a partial result, shown in the report
    const first = await insertProduct(`Масова ${tag} перша`, "draft");
    const second = await insertProduct(`Масова ${tag} друга [omit:cs]`, "draft");
    const admin = await createAdmin();

    await signIn(page, admin, `/uk/admin?q=${encodeURIComponent(`Масова ${tag}`)}`);
    await page.waitForLoadState("networkidle");
    const bar = page.locator('[data-slot="bulk-translation-bar"]');
    await expect(page.getByText("Бракує 10 мов", { exact: false }).first()).toBeVisible();
    await bar.getByLabel(tr.bulk.selectAll).check();
    await expect(bar.getByText("Вибрано 2")).toBeVisible();

    await bar.getByRole("button", { name: "Перекласти відсутні мови (2)" }).click();
    const report = bar.getByRole("list", { name: tr.bulk.report });
    await expect(report.getByRole("listitem")).toHaveCount(2, { timeout: 60_000 });
    await expect(report.getByRole("listitem").filter({ hasText: "перша" })).toContainText("перекладено 10 мов");
    await expect(report.getByRole("listitem").filter({ hasText: "друга" })).toContainText("не перекладено: 1");

    expect((await translationsOf(first.id)).size).toBe(11);
    const secondRows = await translationsOf(second.id);
    expect(secondRows.size).toBe(10);
    expect(secondRows.has("cs")).toBe(false);
    // the list now names the unreviewed machine translations
    await expect(page.getByText(/машинних перекладів не перевірено/).first()).toBeVisible();

    await bar.getByRole("button", { name: "Позначити переклади перевіреними (2)" }).click();
    await expect(page.getByText("19 перекладів позначено перевіреними")).toBeVisible();
    for (const id of [first.id, second.id]) {
      const rows = await translationsOf(id);
      for (const [locale, row] of rows) {
        if (locale !== "uk") expect(row.reviewed_at, `${id} ${locale}`).not.toBeNull();
      }
    }
    await expect(page.getByText(/машинних перекладів не перевірено/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

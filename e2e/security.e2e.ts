// The security headers (#31, src/lib/security/headers.ts) on pages, the admin and an API route, and the main
// flows under the enforced Content-Security-Policy with no violation of it: browse, cart, checkout, sign-in,
// an admin edit and a photo upload. Violations of the strict report-only policy (scripts of the prerendered
// shells carry no nonce, docs/standards.md "Security headers") are expected; they are printed, not failed.
import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../src/lib/supabase/database.types";
import { localStack } from "../tests/catalog/local-stack";
import enProduct from "../messages/en/product.json" with { type: "json" };
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };

const stack = localStack();
const db = stack ? createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } }) : null;
const createdUsers: string[] = [];
const createdSkus: string[] = [];

// a catalog fixture (e2e/catalog-fixtures.ts): a brooch, no sizes to pick
const PRODUCT_PATH = "/en/product/e2e-brooch-1";

function directives(policy: string | undefined): Map<string, string[]> {
  return new Map(
    (policy ?? "")
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

type Violation = { disposition: string; directive: string; blocked: string };

/** Records every CSP violation of the page (both policies) and every console or page error. */
async function watch(page: Page) {
  await page.addInitScript(() => {
    const seen: unknown[] = [];
    (window as unknown as { __csp: unknown[] }).__csp = seen;
    document.addEventListener("securitypolicyviolation", (e) =>
      seen.push({ disposition: e.disposition, directive: e.effectiveDirective, blocked: e.blockedURI }),
    );
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // the report-only policy's violations are logged as errors too; they are counted from the event instead
    if (message.type() === "error" && !message.text().includes("[Report Only]")) errors.push(`console: ${message.text()}`);
  });
  const violations: Violation[] = [];
  const collect = async () => {
    // taken out of the page, so the next collect of the same document adds only the new ones
    const found = await page
      .evaluate(() => (window as unknown as { __csp?: Violation[] }).__csp?.splice(0) ?? [])
      .catch(() => [] as Violation[]);
    violations.push(...found);
  };
  return { errors, violations, collect };
}

/** No enforced violation and no error; the report-only ones go to the test's annotations. */
function expectNoEnforcedViolation(watched: Awaited<ReturnType<typeof watch>>, flow: string) {
  const reported = watched.violations.filter((v) => v.disposition === "report");
  test.info().annotations.push({
    type: "csp-report-only",
    description: `${flow}: ${reported.length} report-only violation(s): ${[...new Set(reported.map((v) => `${v.directive} ${v.blocked}`))].join(", ")}`,
  });
  expect(watched.violations.filter((v) => v.disposition === "enforce"), flow).toEqual([]);
  expect(watched.errors, flow).toEqual([]);
}

async function open(page: Page, path: string, watched: Awaited<ReturnType<typeof watch>>) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await watched.collect();
}

test.describe("security headers", () => {
  const paths = {
    home: "/uk",
    product: PRODUCT_PATH,
    admin: "/uk/admin",
    api: "/api/cron/fx-rates",
  };

  for (const [name, path] of Object.entries(paths)) {
    test(`on the ${name} (${path})`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      // the admin answers a guest with a redirect, the cron route a 401: the headers come with every answer
      expect(response.status(), path).toBeLessThan(500);
      const headers = response.headers();
      const csp = directives(headers["content-security-policy"]);
      expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
      expect(csp.get("object-src")).toEqual(["'none'"]);
      expect(csp.get("base-uri")).toEqual(["'self'"]);
      expect(csp.get("form-action")).toEqual(["'self'"]);
      expect(csp.get("default-src")).toEqual(["'self'"]);
      expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
      // the browser reaches Supabase only; Nova Poshta, Nova Post and every other API are server-side
      expect(csp.get("connect-src")?.[0]).toBe("'self'");
      expect(csp.get("connect-src")?.slice(1).every((source) => /supabase|127\.0\.0\.1|localhost/.test(source))).toBe(true);
      expect(headers["content-security-policy"]).not.toMatch(/nova|resend|telegram/i);
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["x-frame-options"]).toBe("DENY");
      // plain http here: no HSTS
      expect(headers["strict-transport-security"]).toBeUndefined();

      // behind an https proxy or CDN
      const https = await request.get(path, { maxRedirects: 0, headers: { "x-forwarded-proto": "https" } });
      expect(https.headers()["strict-transport-security"]).toBe("max-age=63072000");
    });
  }

  test("pages carry the strict policy report-only, with a fresh nonce on the scripts rendered per request", async ({ request }) => {
    const first = await request.get("/uk/shop");
    const policy = first.headers()["content-security-policy-report-only"];
    const script = directives(policy).get("script-src") ?? [];
    expect(script).not.toContain("'unsafe-inline'");
    const nonce = script.find((s) => s.startsWith("'nonce-"))?.slice(7, -1);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(await first.text()).toContain(`nonce="${nonce}"`);
    expect(first.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const second = await request.get("/uk/shop");
    expect(second.headers()["content-security-policy-report-only"]).not.toBe(policy);
  });
});

test.describe("the main flows under the enforced policy", () => {
  test.afterAll(async () => {
    if (createdSkus.length > 0) await db?.from("products").delete().in("sku", createdSkus.splice(0));
    for (const id of createdUsers.splice(0)) await db?.auth.admin.deleteUser(id);
  });

  test("browse, cart and checkout", async ({ page }) => {
    const watched = await watch(page);
    await open(page, "/en", watched);
    await open(page, "/en/shop", watched);
    await open(page, "/en/search?q=ring", watched);
    await open(page, PRODUCT_PATH, watched);
    await page.getByRole("button", { name: enProduct.addToCart }).click();
    await expect(page.getByTestId("in-cart")).toBeVisible();
    await watched.collect();
    await open(page, "/en/cart", watched);
    await expect(page.getByTestId("cart-line").first()).toBeVisible();
    await open(page, "/en/checkout", watched);
    // the photos come through the same-origin image optimizer
    const photo = page.locator('img[src*="/_next/image"]').first();
    await open(page, PRODUCT_PATH, watched);
    await expect(photo).toBeVisible();
    expectNoEnforcedViolation(watched, "browse, cart, checkout");
  });

  test("sign in", async ({ page }) => {
    test.skip(!db, "needs the local Supabase stack (npm run supabase:start:worktree)");
    const email = `e2e-31-${randomUUID()}@example.test`;
    const password = `pw-${randomUUID()}`;
    const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    createdUsers.push(data.user.id);

    const watched = await watch(page);
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.31.${randomInt(256)}.${randomInt(1, 255)}` });
    await open(page, "/en/sign-in-and-up?next=%2Fen%2Faccount", watched);
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Password").fill(password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/en/account");
    await page.waitForLoadState("networkidle");
    await watched.collect();
    expectNoEnforcedViolation(watched, "sign in");
  });

  test("the error pages (#112): the storefront's and the global one", async ({ page, baseURL }) => {
    const watched = await watch(page);
    // the test-only failures of src/lib/test-error.ts (the e2e web server runs with TJS_TEST_ERROR_TRIGGER=true)
    for (const [scope, path] of [["session", "/uk/cart"], ["shell", "/uk/shop"]] as const) {
      await page.context().addCookies([{ name: "tjs-test-error", value: scope, url: baseURL! }]);
      await open(page, path, watched);
      await expect(page.locator("[data-error-boundary]")).toBeVisible();
      await watched.collect();
      await page.context().clearCookies({ name: "tjs-test-error" });
    }
    // a failing render logs its error to the console by design: only the policy is checked here
    expect(watched.violations.filter((v) => v.disposition === "enforce")).toEqual([]);
  });

  test("an admin edit and a photo upload (signed PUT to Storage)", async ({ page }, testInfo) => {
    test.skip(!db, "needs the local Supabase stack (npm run supabase:start:worktree)");
    const email = `e2e-31-admin-${randomUUID()}@example.test`;
    const password = `pw-${randomUUID()}`;
    const { data: user, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    createdUsers.push(user.user.id);
    await db!.from("profiles").update({ role: "admin" }).eq("id", user.user.id);

    // a draft of this test's own: the storefront listings never see it
    const sku = `E2E-31-${randomUUID().slice(0, 8)}`;
    const { data: category } = await db!.from("categories").select("id").eq("slug", "rings").single();
    const { data: product, error: productError } = await db!
      .from("products")
      .insert({ category_id: category!.id, sku, status: "draft", price_usd: 31 })
      .select("id")
      .single();
    if (productError) throw productError;
    createdSkus.push(sku);
    await db!.from("product_translations").insert({ product_id: product.id, locale: "uk", slug: `e2e-31-${randomUUID().slice(0, 8)}`, title: `CSP тест ${sku}` });

    const watched = await watch(page);
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.131.${randomInt(256)}.${randomInt(1, 255)}` });
    const next = `/uk/admin/products/${product.id}`;
    await open(page, `/uk/sign-in-and-up?next=${encodeURIComponent(next)}`, watched);
    const form = page.getByRole("tabpanel", { name: "Увійти" });
    await form.getByLabel("Ел. пошта").fill(email);
    await form.getByLabel("Пароль").fill(password);
    await form.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(`**${next}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: ukAdmin.form.save }).click();
    await expect(page.getByText(ukAdmin.form.saved, { exact: true })).toBeVisible();

    const photo = testInfo.outputPath("csp.jpg");
    await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 90, b: 60 } } }).jpeg().toFile(photo);
    const photos = page.getByRole("region", { name: ukAdmin.form.sections.photos, exact: true });
    await photos.locator('input[type="file"]').setInputFiles(photo);
    await expect(photos.getByText(ukAdmin.images.progress.replace("{done}", "1").replace("{total}", "1"))).toBeVisible({ timeout: 30_000 });
    await expect(photos.getByRole("listitem").filter({ has: page.getByRole("img") })).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    await watched.collect();
    expectNoEnforcedViolation(watched, "admin edit, photo upload");

    const folder = `products/${product.id}`;
    const { data: files } = await db!.storage.from("product-images").list(folder);
    if (files?.length) await db!.storage.from("product-images").remove(files.map((f) => `${folder}/${f.name}`));
  });
});

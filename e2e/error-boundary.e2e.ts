// The error pages (#112) on the production build: failures forced by the test-only cookie of
// src/lib/test-error.ts (the e2e web server runs with TJS_TEST_ERROR_TRIGGER=true, playwright.config.ts).
// An Auth outage leaves the storefront browsable and shows the account's and the admin's own error page; a
// failing root layout shows the global one; each is localized, offers a retry that works once the failure
// is gone, never shows the error's message, and is not indexed. An admin form keeps what was typed when its
// action throws.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import enErrors from "../messages/en/errors.json" with { type: "json" };
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import ukCart from "../messages/uk/cart.json" with { type: "json" };
import ukErrors from "../messages/uk/errors.json" with { type: "json" };

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const COOKIE = "tjs-test-error";
const HEADER_FAILURE = "test-only failure of the header";

async function failWith(page: Page, scope: "session" | "shell") {
  const url = test.info().project.use.baseURL!;
  await page.context().addCookies([{ name: COOKIE, value: scope, url }]);
}

async function recover(page: Page) {
  await page.context().clearCookies({ name: COOKIE });
}

async function expectErrorPage(page: Page, texts: typeof enErrors.boundary) {
  const boundary = page.locator("[data-error-boundary]");
  await expect(boundary.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();
  await expect(boundary.getByText(texts.description)).toBeVisible();
  await expect(boundary.getByRole("button", { name: texts.retry })).toBeVisible();
  await expect(boundary.getByRole("link", { name: texts.home })).toHaveAttribute("href", /^\/(uk|en)$/);
  // never indexed; the message stays on the server, the digest is the reference for support
  await expect(page.locator(`meta[name="robots"][content*="noindex"]`).first()).toBeAttached();
  await expect(page.getByText(HEADER_FAILURE)).toHaveCount(0);
  await expect(page.getByText("the session could not be verified")).toHaveCount(0);
  return boundary;
}

test.describe("error pages (#112)", () => {
  test.afterEach(async ({ page }) => recover(page));

  test("an Auth outage: the shop stays browsable, the header degrades to the sign-in link", async ({ page }) => {
    await failWith(page, "session");
    await page.goto("/uk/shop");
    await expect(page.locator("[data-error-boundary]")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link").filter({ has: page.locator("img") }).first()).toBeVisible();
    const account = page.locator("header [data-account-unavailable]").first();
    await expect(account).toHaveAttribute("title", ukErrors.boundary.accountUnavailable);
    await expect(account).toHaveAttribute("href", "/uk/sign-in-and-up");
  });

  test("the storefront's error page in uk, and retry once the session reads again", async ({ page }) => {
    await failWith(page, "session");
    await page.goto("/uk/cart");
    const boundary = await expectErrorPage(page, ukErrors.boundary);
    await expect(boundary.getByText(/^Код помилки для підтримки: \S+$/)).toBeVisible();
    // the shop's header and footer stay around a segment's error page
    await expect(page.locator("header").first()).toBeVisible();

    await recover(page);
    await boundary.getByRole("button", { name: ukErrors.boundary.retry }).click();
    await expect(page.locator("[data-error-boundary]")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: ukCart.title })).toBeVisible();
  });

  test("the account's error page in en, and retry sends a guest to sign in", async ({ page }) => {
    await failWith(page, "session");
    await page.goto("/en/account");
    const boundary = await expectErrorPage(page, enErrors.boundary);

    await recover(page);
    await boundary.getByRole("button", { name: enErrors.boundary.retry }).click();
    await page.waitForURL(/\/en\/sign-in-and-up/);
  });

  test("the admin's error page in uk", async ({ page }) => {
    await failWith(page, "session");
    await page.goto("/uk/admin");
    await expectErrorPage(page, ukErrors.boundary);
  });

  test("a failing root layout: the global error page in uk and en, and retry", async ({ page }) => {
    await failWith(page, "shell");
    await page.goto("/en");
    await expectErrorPage(page, enErrors.boundary);
    await expect(page).toHaveTitle(enErrors.boundary.title);

    await page.goto("/uk");
    const boundary = await expectErrorPage(page, ukErrors.boundary);
    await expect(page.locator("html")).toHaveAttribute("lang", "uk");

    await recover(page);
    await boundary.getByRole("button", { name: ukErrors.boundary.retry }).click();
    await expect(page.locator("[data-error-boundary]")).toHaveCount(0);
    await expect(page.locator("header").first()).toBeVisible();
  });
});

const stack = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return null;
  return { url, serviceRoleKey };
})();

test.describe("an admin form whose action throws (#112)", () => {
  test.skip(!stack, "needs the local Supabase stack");
  let userId: string | undefined;

  test.afterAll(async () => {
    if (!stack || !userId) return;
    const db = createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });
    await db.auth.admin.deleteUser(userId);
  });

  test("shows the form's 'try again' message and keeps what was typed", async ({ page }) => {
    const db = createClient<Database>(stack!.url, stack!.serviceRoleKey, { auth: { persistSession: false } });
    const email = `e2e-error-${randomUUID()}@example.test`;
    const password = `pw-${randomUUID()}`;
    const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const { error: roleError } = await db.from("profiles").update({ role: "admin" }).eq("id", userId);
    if (roleError) throw roleError;

    // signs in from its own client address (the auth rate limit is per IP)
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
    await page.goto(`/uk/sign-in-and-up?next=${encodeURIComponent("/uk/admin/products/new")}`);
    await page.waitForLoadState("networkidle");
    const signIn = page.getByRole("tabpanel", { name: "Увійти" });
    await signIn.getByLabel("Ел. пошта").fill(email);
    await signIn.getByLabel("Пароль").fill(password);
    await signIn.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL("/uk/admin/products/new");
    await page.waitForLoadState("networkidle");

    const form = page.locator("form").filter({ has: page.getByRole("button", { name: ukAdmin.form.save }) });
    const title = form.getByLabel(ukAdmin.form.translation.title).first();
    await title.fill("Каблучка, що не збереглася");
    // the session cannot be read from now on: the save action throws SessionUnavailableError
    await failWith(page, "session");
    await form.getByRole("button", { name: ukAdmin.form.save }).click();

    await expect(form.getByRole("alert")).toContainText(ukAdmin.form.errors.unexpectedError);
    await expect(page.locator("[data-error-boundary]")).toHaveCount(0);
    await expect(title).toHaveValue("Каблучка, що не збереглася");
  });
});

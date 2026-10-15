// The shop settings on the local Supabase stack: only the admin reaches and changes them; a change of the
// contacts, the markup or the About page shows on the storefront with the next request, without a rebuild; the
// About text is cleaned on the server. The settings are global (every footer, every price), so these tests run
// in their own project after every other one (playwright.config.ts) and restore what they changed.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import ukCommon from "../messages/uk/common.json" with { type: "json" };
import enCommon from "../messages/en/common.json" with { type: "json" };
import deCommon from "../messages/de/common.json" with { type: "json" };
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
const createdSkus: string[] = [];

const settingsText = ukAdmin.settings;
const SETTINGS_PATH = "/uk/admin/settings";
const ABOUT_EDITOR_PATH = "/uk/admin/settings/about";
// texts only the settings pages render
const ADMIN_ONLY_TEXTS = [settingsText.contacts.hint, settingsText.prices.rulesHint, settingsText.about.editorHint];

type Credentials = { email: string; password: string };

async function createUser(role: "admin" | "customer"): Promise<Credentials> {
  const email = `e2e-settings-${randomUUID()}@example.test`;
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

/** A draft product of its own (published through the admin later, which expires the listings), so a price can be
 * watched without touching the seed. */
async function insertDraftProduct(): Promise<{ sku: string; title: string }> {
  const sku = `E2E-21-${randomUUID().slice(0, 8)}`;
  const title = `Каблучка ${sku}`;
  const { data: category } = await db!.from("categories").select("id").eq("slug", "rings").single();
  const { data, error } = await db!
    .from("products")
    .insert({ category_id: category!.id, sku, status: "draft", price_usd: 27.8 })
    .select("id")
    .single();
  if (error) throw error;
  createdSkus.push(sku);
  const translation = await db!
    .from("product_translations")
    .insert({ product_id: data.id, locale: "uk", slug: `e2e-21-${randomUUID().slice(0, 8)}`, title });
  if (translation.error) throw translation.error;
  return { sku, title };
}

const contactsForm = (page: Page) => page.getByRole("form", { name: settingsText.contacts.title });
const pricesForm = (page: Page) => page.getByRole("form", { name: settingsText.prices.title });
const footerContacts = (page: Page) => page.locator("footer").last().locator("[data-slot=footer-contacts]");

async function footerAt(browser: Browser, width: number, height: number, path: string) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(path);
  return { context, page };
}

test.describe("shop settings on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the settings e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    if (!db) return;
    // the database as the migration left it (the server's cached entries were expired by the restore step)
    await db.from("shop_settings").update({
      shop_name: null,
      instagram_handle: null,
      email: null,
      phone: null,
      telegram_url: null,
      viber_url: null,
      whatsapp_url: null,
      telegram_chat_id: null,
    }).eq("id", 1);
    await db.from("currency_settings").update({ markup_bps: 300 }).neq("currency", "");
    await db.from("about_translations").delete().neq("locale", "");
    await db.from("about_page").update({ published: false }).eq("id", 1);
    if (createdSkus.length > 0) await db.from("products").delete().in("sku", createdSkus.splice(0));
    for (const id of createdUsers.splice(0)) await db.auth.admin.deleteUser(id);
  });

  test("a guest is sent to sign in, a customer gets the not-found page", async ({ page, browser, request }) => {
    for (const path of [SETTINGS_PATH, ABOUT_EDITOR_PATH]) {
      for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
        const body = await (await request.get(path, { headers, maxRedirects: 0 })).text();
        for (const text of ADMIN_ONLY_TEXTS) expect(body, `${path} ${JSON.stringify(headers)}`).not.toContain(text);
      }
    }
    await page.goto(SETTINGS_PATH);
    await page.waitForURL(`/uk/sign-in-and-up?next=${encodeURIComponent(SETTINGS_PATH)}`);

    const customerContext = await browser.newContext();
    const customer = await customerContext.newPage();
    await signIn(customer, await createUser("customer"), "/uk");
    for (const path of [SETTINGS_PATH, ABOUT_EDITOR_PATH]) {
      await customer.goto(path);
      await expect(customer.getByRole("heading", { name: ukErrors.notFound.title })).toBeVisible();
      await expect(customer.getByText(settingsText.contacts.hint)).toHaveCount(0);
    }
    await customerContext.close();
  });

  test.describe.serial("a change shows on the storefront with the next request", () => {
    let admin: Credentials;
    let product: { sku: string; title: string };
    const handle = `e2e_${randomUUID().slice(0, 8)}`;
    const chatId = `-100${randomInt(100_000, 999_999)}`;

    test.beforeAll(async () => {
      admin = await createUser("admin");
      product = await insertDraftProduct();
    });

    test("contacts: the footer links the new Instagram at 1440 and 390, the chat id stays private", async ({ page, browser }) => {
      const errors = collectErrors(page);
      await signIn(page, admin, SETTINGS_PATH);
      const form = contactsForm(page);
      await form.getByLabel(settingsText.contacts.instagram).fill(`https://www.instagram.com/${handle}/`);
      await form.getByLabel(settingsText.contacts.telegram).fill("@tjs_shop_e2e");
      await form.getByLabel(settingsText.contacts.telegramChatId).fill(chatId);
      await form.getByRole("button", { name: settingsText.save }).click();
      await expect(page.getByText(settingsText.saved)).toBeVisible();
      // stored in its canonical form, shown back as stored
      await expect(form.getByLabel(settingsText.contacts.instagram)).toHaveValue(`@${handle}`);
      await expect(form.getByLabel(settingsText.contacts.telegram)).toHaveValue("https://t.me/tjs_shop_e2e");
      expect(errors).toEqual([]);

      for (const [width, height] of [[1440, 900], [390, 844]] as const) {
        const { context, page: visitor } = await footerAt(browser, width, height, "/uk/shop");
        const contacts = footerContacts(visitor);
        await expect(contacts.getByRole("link", { name: ukCommon.contact.instagram })).toHaveAttribute(
          "href",
          `https://www.instagram.com/${handle}/`,
        );
        await expect(contacts.getByRole("link", { name: ukCommon.contact.telegram })).toHaveAttribute("href", "https://t.me/tjs_shop_e2e");
        await expect(contacts).not.toContainText(ukCommon.footer.contactsTbd);
        await context.close();
      }

      // the chat id reaches no page and no RSC payload
      for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
        expect(await (await page.request.get("/uk/shop", { headers })).text()).not.toContain(chatId);
      }
    });

    test("an invalid link is refused at its field and nothing is saved", async ({ page }) => {
      await signIn(page, admin, SETTINGS_PATH);
      const form = contactsForm(page);
      await form.getByLabel(settingsText.contacts.whatsapp).fill("javascript:alert(1)");
      await form.getByRole("button", { name: settingsText.save }).click();
      await expect(form.getByRole("alert")).toContainText(settingsText.contacts.invalid.whatsapp);
      await expect(form.getByLabel(settingsText.contacts.whatsapp)).toHaveAttribute("aria-invalid", "true");
      const { data } = await db!.from("shop_settings").select("whatsapp_url").single();
      expect(data?.whatsapp_url).toBeNull();
    });

    test("the settings action called directly by a customer or a guest is refused", async ({ page, browser, playwright, baseURL }) => {
      await signIn(page, admin, SETTINGS_PATH);
      const form = contactsForm(page);
      await form.getByLabel(settingsText.contacts.shopName).fill("Direct call");
      const [actionRequest] = await Promise.all([
        page.waitForRequest((r) => r.method() === "POST" && r.headers()["next-action"] !== undefined),
        form.getByRole("button", { name: settingsText.save }).click(),
      ]);
      await expect(page.getByText(settingsText.saved)).toBeVisible();
      await db!.from("shop_settings").update({ shop_name: null }).eq("id", 1);
      const call = {
        url: actionRequest.url(),
        headers: { "next-action": actionRequest.headers()["next-action"], "content-type": actionRequest.headers()["content-type"] },
        data: actionRequest.postDataBuffer() ?? "",
      };

      const customerContext = await browser.newContext();
      const customer = await customerContext.newPage();
      await signIn(customer, await createUser("customer"), "/uk");
      const guest = await playwright.request.newContext({ baseURL });
      for (const [who, client] of [["customer", customerContext.request], ["guest", guest]] as const) {
        const response = await client.post(call.url, { headers: call.headers, data: call.data });
        expect(await response.text(), who).toContain("notAuthorized");
        const { data } = await db!.from("shop_settings").select("shop_name").single();
        expect(data?.shop_name, who).toBeNull();
      }
      await guest.dispose();
      await customerContext.close();
    });

    // The price on the product's card in its category listing. (The product page itself shows the new price from
    // the second request on: its prerendered shell carries the JSON-LD price and is regenerated in the background,
    // a known gap of the product route reported with #21.)
    test("markup: a product's price follows each change on the next request, without a rebuild", async ({ page }) => {
      const errors = collectErrors(page);
      await signIn(page, admin, "/uk/admin");
      await page.goto(`/uk/admin?q=${product.sku}`);
      await page.getByRole("listitem").filter({ hasText: product.title }).getByRole("button", { name: ukAdmin.list.publish }).click();
      await expect
        .poll(async () => (await db!.from("products").select("status").eq("sku", product.sku).single()).data?.status)
        .toBe("published");

      const cardPrice = page.getByTestId("product-card").filter({ hasText: product.title }).locator("[data-slot=price]");
      async function priceAtMarkup(percent: string): Promise<number> {
        await page.goto(SETTINGS_PATH);
        const form = pricesForm(page);
        await form.getByLabel(settingsText.prices.markup).fill(percent);
        await form.getByRole("button", { name: settingsText.save }).click();
        await expect(page.getByText(settingsText.saved)).toBeVisible();
        await page.goto("/uk/shop/rings");
        await expect(cardPrice).toHaveAttribute("data-currency", "UAH");
        return Number(await cardPrice.getAttribute("value"));
      }

      const atTen = await priceAtMarkup("10");
      const atForty = await priceAtMarkup("40");
      expect(atForty).toBeGreaterThan(atTen);
      expect(errors).toEqual([]);
    });

    test("about: uk and en are shown, an injected script is stripped, other locales fall back without indexing", async ({ page, request }) => {
      const errors = collectErrors(page);
      await signIn(page, admin, ABOUT_EDITOR_PATH);
      const ukEditor = page.locator("#field-about-uk-body");
      await ukEditor.click();
      await page.keyboard.type("Моя історія про прикраси");

      await page.getByRole("main").getByText("English", { exact: true }).click();
      // what a paste of foreign HTML or a crafted request could bring: the server keeps only the format
      await page.locator("#field-about-en-body").evaluate((editor) => {
        editor.innerHTML =
          '<p onclick="window.__clicked = 1">My story about jewellery<script>window.__injected = 1</script></p>' +
          '<p><a href="javascript:window.__injected = 1">a bad link</a></p>';
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.getByText(ukAdmin.status.published, { exact: true }).click();
      await page.getByRole("button", { name: settingsText.save }).click();
      await expect(page.getByText(settingsText.saved)).toBeVisible();
      await expect(page.locator("#field-about-en-body")).toHaveJSProperty(
        "innerHTML",
        "<p>My story about jewellery</p><p>a bad link</p>",
      );
      expect(errors).toEqual([]);

      const uk = await (await request.get("/uk/about")).text();
      expect(uk).toContain("Моя історія про прикраси");
      expect(uk).not.toMatch(/<meta name="robots" content="noindex/);
      expect(uk).toMatch(/hreflang="en"/i);

      const en = await (await request.get("/en/about")).text();
      expect(en).toContain("My story about jewellery");
      expect(en).not.toContain("__injected");
      expect(en).not.toContain('onclick="');
      expect(en).not.toContain('href="javascript');

      // de has no text of its own: the English one, a note, and no indexing
      await page.goto("/de/about");
      await expect(page.getByRole("main")).toContainText("My story about jewellery");
      await expect(page.getByText(deCommon.about.fallbackNote)).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      expect(await page.evaluate(() => (window as { __injected?: number }).__injected)).toBeUndefined();
    });

    test("restore: unpublished, the page shows its TBD note again; contacts and markup as before", async ({ page }) => {
      await signIn(page, admin, ABOUT_EDITOR_PATH);
      await page.getByText(ukAdmin.status.draft, { exact: true }).click();
      await page.getByRole("button", { name: settingsText.save }).click();
      await expect(page.getByText(settingsText.saved)).toBeVisible();
      await page.goto("/en/about");
      await expect(page.getByText(enCommon.about.tbd)).toBeVisible();

      await page.goto(SETTINGS_PATH);
      const contacts = contactsForm(page);
      for (const field of ["shopName", "instagram", "phone", "email", "telegram", "viber", "whatsapp", "telegramChatId"] as const) {
        await contacts.getByLabel(settingsText.contacts[field]).fill("");
      }
      await contacts.getByRole("button", { name: settingsText.save }).click();
      await expect(page.getByText(settingsText.saved)).toBeVisible();
      const prices = pricesForm(page);
      await prices.getByLabel(settingsText.prices.markup).fill("3");
      await prices.getByRole("button", { name: settingsText.save }).click();
      await expect
        .poll(async () => (await db!.from("currency_settings").select("markup_bps").eq("currency", "UAH").single()).data?.markup_bps)
        .toBe(300);

      await page.goto("/uk/shop");
      await expect(footerContacts(page)).toHaveText(ukCommon.footer.contactsTbd);
    });
  });
});

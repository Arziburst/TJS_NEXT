// The admin's orders (#27) on the local stack, end to end from a placed order: a guest sends an order request
// through the checkout, the admin sees it as new (the navigation badge, new requests first in the list, the
// filters), opens it, reads every field, keeps a note and moves it through its statuses with the quick buttons,
// which sells and releases its one-of-a-kind piece (D24). Guests and customers get nothing of it. It sells a
// product of its own, so it runs with the catalog writers (playwright.config.ts). Nova Poshta answers from the
// recorded fixtures.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import enCheckout from "../messages/en/checkout.json" with { type: "json" };
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import enNotifications from "../messages/en/notifications.json" with { type: "json" };
import ukErrors from "../messages/uk/errors.json" with { type: "json" };
import ukNotifications from "../messages/uk/notifications.json" with { type: "json" };
import type { Database } from "../src/lib/supabase/database.types";
import { sentFor } from "./notifications";

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

const t = ukAdmin.orders;
const createdUsers: string[] = [];
const createdProducts: string[] = [];
const usedEmails: string[] = [];

type Credentials = { id: string; email: string; password: string };

async function createUser(role: "admin" | "customer", name?: string): Promise<Credentials> {
  const email = `e2e-orders-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const profile = await db!
    .from("profiles")
    .update({ role, ...(name ? { name } : {}) })
    .eq("id", data.user.id);
  if (profile.error) throw profile.error;
  return { id: data.user.id, email, password };
}

async function fromOwnClientIp(page: Page) {
  await page
    .context()
    .setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
}

/** Signs in through the form (from its own client address: the auth rate limit is per IP) and goes to `next`. */
async function signIn(page: Page, user: Credentials, next: string) {
  await fromOwnClientIp(page);
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

/** A published one-of-a-kind piece of its own (no photo), in the rings category. */
async function createPiece(): Promise<{ id: string; title: string }> {
  const { data: category, error } = await db!.from("categories").select("id").eq("slug", "rings").single();
  if (error) throw error;
  const id = randomUUID();
  const title = `E2E order piece ${id.slice(0, 6)}`;
  const product = await db!
    .from("products")
    .insert({ id, category_id: category.id, status: "published", fulfillment: "one_of_a_kind", price_usd: 27, weight_g: 10 });
  if (product.error) throw product.error;
  createdProducts.push(id);
  const translation = await db!
    .from("product_translations")
    .insert({ product_id: id, locale: "en", slug: `e2e-orders-${id.slice(0, 8)}`, title, source: "human" });
  if (translation.error) throw translation.error;
  return { id, title };
}

async function availability(id: string) {
  const { data, error } = await db!.from("products").select("availability").eq("id", id).single();
  if (error) throw error;
  return data.availability;
}

/** A guest's order request through the checkout (to a Kyiv branch); its number. */
async function placeOrder(page: Page, piece: { id: string }, contact: { name: string; email: string }): Promise<number> {
  const req = enCheckout.request;
  await fromOwnClientIp(page);
  // the guest cart cookie, as the server writes it
  await page.goto("/en");
  await page.context().addCookies([
    { name: "TJS_CART", value: encodeURIComponent(JSON.stringify([{ p: piece.id, q: 1 }])), url: page.url() },
  ]);
  await page.goto("/en/checkout");
  await page.waitForLoadState("networkidle");
  await page.getByLabel(req.contact.firstName).fill(contact.name);
  await page.getByLabel(req.contact.lastName).fill("Koval");
  await page.getByLabel(req.contact.phone).fill("+380 50 123 45 67");
  await page.getByLabel(req.contact.email).fill(contact.email);
  await page.getByLabel(enCheckout.internationalDelivery.country).selectOption("UA");
  await page.getByRole("combobox", { name: enCheckout.delivery.city.label }).pressSequentially("Київ");
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByRole("combobox", { name: enCheckout.delivery.warehouse.label }).click();
  await page.getByRole("listbox").getByRole("option").first().click();
  await expect(page.locator("[data-slot=delivery-quote] output")).toHaveText(/^≈ /);
  await page.getByLabel(enCheckout.fields.comment).fill("Gift wrapping, please");
  await page.getByRole("button", { name: req.submit }).click();
  await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);
  return Number(new URL(page.url()).searchParams.get("order"));
}

/** The order's entry in the list: a card on a phone, a table row on a desktop (only one is displayed). */
function listEntry(page: Page, number: number): Locator {
  return page.locator(`[data-testid=order-card][data-number="${number}"], [data-testid=order-row][data-number="${number}"]`).filter({ visible: true });
}

test.describe("the admin's orders on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the admin order e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");
  test.skip(!!process.env.E2E_BASE_URL, "needs the delivery fixtures that Playwright starts with the app");

  test.afterAll(async () => {
    if (usedEmails.length > 0) await db?.from("orders").delete().in("email", usedEmails.splice(0));
    if (createdProducts.length > 0) await db?.from("products").delete().in("id", createdProducts.splice(0));
    for (const id of createdUsers.splice(0)) await db?.auth.admin.deleteUser(id);
  });

  test("a guest's request reaches the admin as new; she contacts, notes and moves it through its statuses", async ({ page, browser, baseURL }) => {
    const piece = await createPiece();
    const email = `e2e-orders-guest-${randomUUID()}@example.test`;
    usedEmails.push(email);
    const guestContext = await browser.newContext({ baseURL });
    const number = await placeOrder(await guestContext.newPage(), piece, { name: "Iryna", email });
    await guestContext.close();
    expect(await availability(piece.id)).toBe("reserved");

    const errors = collectErrors(page);
    const admin = await createUser("admin", "Олена");
    await signIn(page, admin, "/uk/admin/orders");

    // the dashboard: the new requests counted, the badge on the navigation, new requests first
    await expect(page.getByRole("heading", { level: 1, name: t.title })).toBeVisible();
    await expect(page.getByTestId("new-orders-count")).toHaveText(/[1-9]/);
    const nav = page.getByRole("navigation", { name: ukAdmin.shell.nav });
    await expect(nav.getByTestId("admin-nav-badge-orders")).toHaveText(/^([1-9]\d?|99\+)$/);
    await expect(nav.getByRole("link", { name: /^Замовлення, \d+/ })).toHaveAttribute("aria-current", "page");
    const statuses = await page.getByTestId("order-status").filter({ visible: true }).evaluateAll((badges) =>
      badges.map((badge) => badge.getAttribute("data-status")),
    );
    expect(statuses.length).toBeGreaterThan(0);
    // every new request comes before any other order
    expect(statuses.indexOf("new")).toBe(0);
    expect(statuses.lastIndexOf("new")).toBe(statuses.filter((s) => s === "new").length - 1);

    // the search finds it by email, the phone and the number; another country hides it
    const search = page.getByRole("searchbox", { name: t.searchLabel, exact: true });
    await search.fill(email.toUpperCase());
    await page.getByRole("button", { name: t.apply }).click();
    await expect(page).toHaveURL(/q=/);
    const entry = listEntry(page, number);
    await expect(entry).toBeVisible();
    await expect(entry.getByTestId("order-status")).toHaveText(ukAdmin.orderStatus.new);
    // only this order matches: one new request
    await expect(page.getByTestId("new-orders-count")).toHaveText(/^1\s/);
    await page.goto(`/uk/admin/orders?q=${number}&country=DE`);
    await expect(page.getByText(t.noMatch)).toBeVisible();
    await page.goto(`/uk/admin/orders?q=${encodeURIComponent("050 123 45")}&status=new&country=UA`);
    await expect(listEntry(page, number)).toBeVisible();
    await expect(listEntry(page, number).locator(`a[href="tel:+380501234567"]`)).toBeVisible();

    // the order: the customer, the delivery and the line as ordered
    await listEntry(page, number).getByRole("link", { name: new RegExp(`${number}`) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/uk/admin/orders/${number}$`));
    const detail = page.getByTestId("order-detail");
    await expect(detail.getByRole("heading", { level: 1 })).toHaveText(t.detail.title.replace("{number}", String(number)));
    const customer = page.getByTestId("order-customer");
    await expect(customer.getByText("Iryna Koval")).toBeVisible();
    await expect(customer.getByRole("link", { name: t.detail.contactAction.phone })).toHaveAttribute("href", "tel:+380501234567");
    await expect(customer.getByRole("link", { name: t.detail.contactAction.email })).toHaveAttribute("href", `mailto:${email}`);
    // no messenger the customer did not give
    await expect(customer.locator("[data-contact=viber], [data-contact=whatsapp], [data-contact=telegram], [data-contact=instagram]")).toHaveCount(0);
    await expect(customer.getByText(t.detail.guest)).toBeVisible();
    await expect(customer.getByText("Gift wrapping, please")).toBeVisible();
    const delivery = page.getByTestId("order-delivery");
    await expect(delivery.getByText(t.carrier.nova_poshta)).toBeVisible();
    await expect(delivery.getByText("Київ")).toBeVisible();
    await expect(delivery.getByTestId("order-delivery-estimate")).toContainText("≈");
    const line = page.getByTestId("order-line");
    await expect(line).toHaveCount(1);
    await expect(line.getByText(piece.title)).toBeVisible();
    await expect(line.getByTestId("line-availability")).toHaveText(ukAdmin.availability.reserved);
    await expect(page.getByTestId("order-history").getByTestId("order-history-entry")).toHaveCount(1);

    // an internal note, with its author
    const notes = page.getByTestId("order-notes");
    await notes.getByLabel(t.detail.noteLabel).fill("Оплата карткою, чекаю переказ");
    await notes.getByRole("button", { name: t.detail.addNote }).click();
    await expect(notes.getByTestId("order-note")).toHaveCount(1);
    await expect(notes.getByTestId("order-note")).toContainText("Оплата карткою, чекаю переказ");
    await expect(notes.getByTestId("order-note")).toContainText("Олена");
    await expect(notes.getByLabel(t.detail.noteLabel)).toHaveValue("");

    // the quick status buttons: in processing, accepted (the piece is sold), then canceled (back on sale)
    const status = page.getByTestId("order-status-section");
    await status.getByRole("button", { name: t.actions.to.in_processing }).click();
    await expect(detail.getByTestId("order-status").first()).toHaveText(ukAdmin.orderStatus.in_processing);
    await status.getByRole("button", { name: t.actions.to.accepted }).click();
    await expect(detail.getByTestId("order-status").first()).toHaveText(ukAdmin.orderStatus.accepted);
    await expect(line.getByTestId("line-availability")).toHaveText(ukAdmin.availability.sold);
    expect(await availability(piece.id)).toBe("sold");

    await status.getByRole("button", { name: t.actions.to.canceled }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: t.actions.cancelTitle.replace("{number}", String(number)) })).toBeVisible();
    // keeping the order changes nothing
    await dialog.getByRole("button", { name: t.actions.keep }).click();
    await expect(dialog).toHaveCount(0);
    await expect(detail.getByTestId("order-status").first()).toHaveText(ukAdmin.orderStatus.accepted);
    await status.getByRole("button", { name: t.actions.to.canceled }).click();
    await page.getByRole("dialog").getByRole("button", { name: t.actions.cancelConfirm }).click();
    await expect(detail.getByTestId("order-status").first()).toHaveText(ukAdmin.orderStatus.canceled);
    await expect(status.getByRole("button")).toHaveCount(0);
    await expect(status).toContainText(t.actions.final.replace("{status}", ukAdmin.orderStatus.canceled));
    await expect(line.getByTestId("line-availability")).toHaveText(ukAdmin.availability.available);
    expect(await availability(piece.id)).toBe("available");

    // the history and the events for the notifications (#26)
    await expect(page.getByTestId("order-history").getByTestId("order-history-entry")).toHaveCount(4);
    const { data: stored } = await db!
      .from("orders")
      .select("status, outbox_events(event, payload)")
      .eq("number", number)
      .single();
    expect(stored?.status).toBe("canceled");
    expect(stored?.outbox_events.filter((e) => e.event === "order_status_changed").map((e) => e.payload)).toEqual(
      expect.arrayContaining([
        { number, from: "new", to: "in_processing" },
        { number, from: "in_processing", to: "accepted" },
        { number, from: "accepted", to: "canceled" },
      ]),
    );

    // the notifications (#26) tell the customer, in their language, and the owner of every change
    const enStatus = enNotifications.status;
    const ukStatus = ukNotifications.status;
    const subject = (status: string) =>
      enNotifications.email.statusChange.subject.replace("{number}", String(number)).replace("{status}", status);
    const telegramLine = (from: string, to: string) =>
      ukNotifications.telegram.statusChange.replace("{number}", String(number)).replace("{from}", from).replace("{to}", to);
    await expect
      .poll(async () => (await sentFor(number)).email.map((message) => message.subject), { timeout: 15_000 })
      .toEqual(expect.arrayContaining([subject(enStatus.in_processing), subject(enStatus.accepted), subject(enStatus.canceled)]));
    const sent = await sentFor(number);
    expect(sent.email.every((message) => message.to.includes(email))).toBe(true);
    await expect
      .poll(async () => (await sentFor(number)).telegram.map((message) => message.text), { timeout: 15_000 })
      .toEqual(
        expect.arrayContaining([
          expect.stringContaining(telegramLine(ukStatus.new, ukStatus.in_processing)),
          expect.stringContaining(telegramLine(ukStatus.in_processing, ukStatus.accepted)),
          expect.stringContaining(telegramLine(ukStatus.accepted, ukStatus.canceled)),
        ]),
      );

    // the list filtered by status finds it canceled
    await page.goto(`/uk/admin/orders?status=canceled&q=${number}`);
    await expect(listEntry(page, number).getByTestId("order-status")).toHaveText(ukAdmin.orderStatus.canceled);
    expect(errors).toEqual([]);
  });

  test("a guest is sent to sign in and a customer gets the not-found page, with nothing of the orders", async ({ page, browser, request, baseURL }) => {
    // an order of its own, so its customer's email is known to be in the database
    const piece = await createPiece();
    const email = `e2e-orders-secret-${randomUUID()}@example.test`;
    usedEmails.push(email);
    const placing = await browser.newContext({ baseURL });
    const number = await placeOrder(await placing.newPage(), piece, { name: "Secret", email });
    await placing.close();
    const path = `/uk/admin/orders/${number}`;
    const secrets = [t.searchPlaceholder, t.detail.notesHint, email];

    for (const target of ["/uk/admin/orders", path]) {
      const variants: Record<string, string>[] = [{}, { RSC: "1" }];
      for (const headers of variants) {
        const body = await (await request.get(target, { headers, maxRedirects: 0 })).text();
        for (const text of secrets) expect(body, `${target} ${JSON.stringify(headers)}`).not.toContain(text);
      }
    }
    await page.goto(path);
    await page.waitForURL(`/uk/sign-in-and-up?next=${encodeURIComponent(path)}`);

    const customerContext = await browser.newContext({ baseURL });
    const customer = await customerContext.newPage();
    await signIn(customer, await createUser("customer"), "/uk");
    for (const target of ["/uk/admin/orders", path]) {
      await customer.goto(target);
      await expect(customer.getByRole("heading", { name: ukErrors.notFound.title })).toBeVisible();
      const body = await (await customerContext.request.get(target)).text();
      for (const text of secrets) expect(body, target).not.toContain(text);
    }
    await customerContext.close();
  });
});

// The order request (#24) on the local stack: its tests create products, users and orders of their own and
// reserve pieces, so they run only against a loopback stack (.env.local); in CI a missing stack fails instead.
// Nova Poshta answers from the recorded fixtures and Nova Post from the fixture server (playwright.config.ts).
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import enCart from "../messages/en/cart.json" with { type: "json" };
import en from "../messages/en/checkout.json" with { type: "json" };
import enNotifications from "../messages/en/notifications.json" with { type: "json" };
import type { Database } from "../src/lib/supabase/database.types";
import { sentFor } from "./notifications";

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

const t = en.request;
const createdProducts: string[] = [];
const createdUsers: string[] = [];
const usedEmails: string[] = [];

type Fixture = { id: string; slug: string; title: string; priceUsd: number };

/** A published product of its own (no photo), in the rings category. */
async function createProduct(options: { fulfillment: "made_to_order" | "one_of_a_kind"; priceUsd: number }): Promise<Fixture> {
  const { data: category, error } = await admin!.from("categories").select("id").eq("slug", "rings").single();
  if (error) throw error;
  const id = randomUUID();
  const slug = `e2e-checkout-${id.slice(0, 8)}`;
  const title = `E2E checkout ${options.fulfillment === "one_of_a_kind" ? "unique" : "ordered"} ${id.slice(0, 4)}`;
  const product = await admin!.from("products").insert({
    id,
    category_id: category.id,
    status: "published",
    fulfillment: options.fulfillment,
    price_usd: options.priceUsd,
    weight_g: 12,
  });
  if (product.error) throw product.error;
  createdProducts.push(id);
  const translation = await admin!.from("product_translations").insert({ product_id: id, locale: "en", slug, title, source: "human" });
  if (translation.error) throw translation.error;
  return { id, slug, title, priceUsd: options.priceUsd };
}

function uniqueEmail(): string {
  const email = `e2e-checkout-${randomUUID()}@example.test`;
  usedEmails.push(email);
  return email;
}

async function createUser() {
  const email = uniqueEmail();
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Anna Schmidt", phone: "+4915112345678" },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  return { id: data.user.id, email, password };
}

/** The guest cart cookie, as the server writes it. */
async function guestCart(page: Page, baseURL: string, lines: { product: Fixture; quantity: number }[]) {
  await page.context().addCookies([
    {
      name: "TJS_CART",
      value: encodeURIComponent(JSON.stringify(lines.map(({ product, quantity }) => ({ p: product.id, q: quantity })))),
      url: baseURL,
    },
  ]);
}

// Each test acts from its own client address, so the per-IP limits never couple tests.
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

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function minorOf(locator: ReturnType<Page["locator"]>): Promise<number> {
  const value = await locator.getAttribute("value");
  expect(value, "a price with a value").toBeTruthy();
  return Math.round(Number(value) * 100);
}

async function fillContact(page: Page, email: string) {
  await page.getByLabel(t.contact.firstName).fill("Olena");
  await page.getByLabel(t.contact.phone).fill("+380 50 123 45 67");
  await page.getByLabel(t.contact.email).fill(email);
}

/** Ukraine → Kyiv → its first branch, then waits for the Nova Poshta estimate. */
async function chooseKyivBranch(page: Page) {
  await page.getByLabel(en.internationalDelivery.country).selectOption("UA");
  await page.getByRole("combobox", { name: en.delivery.city.label }).pressSequentially("Київ");
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByRole("combobox", { name: en.delivery.warehouse.label }).click();
  await page.getByRole("listbox").getByRole("option").first().click();
  await expect(page.locator("[data-slot=delivery-quote] output")).toHaveText(/^≈ /);
}

async function ordersOf(email: string) {
  const { data, error } = await admin!
    .from("orders")
    .select("id, number, status, user_id, country, delivery_method, delivery_estimate_state, currency, items_total_minor, items_total_usd_minor, order_items(product_id, quantity, unit_price_usd_minor, unit_price_minor)")
    .eq("email", email);
  if (error) throw error;
  return data;
}

test.describe("order request on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the checkout e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");
  test.skip(!!process.env.E2E_BASE_URL, "needs the delivery fixtures that Playwright starts with the app");

  test.afterAll(async () => {
    if (usedEmails.length > 0) await admin?.from("orders").delete().in("email", usedEmails.splice(0));
    if (createdProducts.length > 0) await admin?.from("products").delete().in("id", createdProducts.splice(0));
    for (const id of createdUsers.splice(0)) await admin?.auth.admin.deleteUser(id);
  });

  test("a guest sends a request to a Kyiv branch; only that browser sees the confirmation", async ({ page, browser, baseURL }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 21 });
    const unique = await createProduct({ fulfillment: "one_of_a_kind", priceUsd: 37 });
    await guestCart(page, baseURL!, [
      { product: ordered, quantity: 2 },
      { product: unique, quantity: 1 },
    ]);

    // the cart's next step leads here
    await open(page, "/en/cart");
    await page.getByRole("main").getByRole("link", { name: enCart.orderRequest }).click();
    await expect(page).toHaveURL(/\/en\/checkout$/);
    await expect(page.getByRole("heading", { level: 1, name: t.title })).toBeVisible();
    await expect(page.getByTestId("checkout-line")).toHaveCount(2);
    const total = await minorOf(page.getByTestId("checkout-total").locator("[data-slot=price]"));

    // nothing filled: every required field says what is missing, and the first one has the focus
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page.getByLabel(t.contact.firstName)).toBeFocused();
    await expect(page.getByLabel(t.contact.firstName)).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel(t.contact.firstName)).toHaveAccessibleDescription(t.errors.firstName);
    await expect(page.getByText(t.errors.phone)).toBeVisible();
    await expect(page.getByText(t.errors.email)).toBeVisible();
    await expect(page.getByText(t.errors.delivery)).toBeVisible();
    await expect(page.getByTestId("checkout-error")).toHaveText(t.errors.title);

    const email = uniqueEmail();
    await fillContact(page, email);
    await chooseKyivBranch(page);
    await page.getByLabel(en.fields.comment).fill("Gift wrapping, please");
    await expect(page.getByTestId("checkout-error")).toHaveCount(0);
    await page.getByRole("button", { name: t.submit }).click();

    await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);
    const number = Number(new URL(page.url()).searchParams.get("order"));
    await expect(page.getByTestId("order-number")).toHaveText(String(number));
    await expect(page.getByTestId("order-confirmation").getByText(en.done.thanks.replace("{name}", "Olena"))).toBeVisible();
    await expect(page.getByTestId("order-line")).toHaveCount(2);
    // the stored total is the one the checkout showed, and the cart is empty now
    expect(await minorOf(page.getByTestId("order-total").locator("[data-slot=price]"))).toBe(total);
    await expect(page.getByTestId("order-delivery")).toContainText("≈");
    await expect(page.getByTestId("contact-channels")).toHaveText(en.done.contactTbd);
    await expect(page.locator("header").getByRole("link", { name: "Cart, empty" }).or(page.locator("header").getByRole("button", { name: "Cart, empty" }))).toBeVisible();

    const [order] = await ordersOf(email);
    expect(order).toMatchObject({
      number,
      status: "new",
      user_id: null,
      country: "UA",
      delivery_method: "warehouse",
      delivery_estimate_state: "amount",
      items_total_minor: total,
      items_total_usd_minor: 21_00 * 2 + 37_00,
    });
    const { data: piece } = await admin!.from("products").select("availability").eq("id", unique.id).single();
    expect(piece?.availability).toBe("reserved");
    const { count } = await admin!.from("outbox_events").select("id", { count: "exact", head: true }).eq("order_id", order!.id).eq("event", "order_created");
    expect(count).toBe(1);

    // right after the answer the owner's Telegram group and the customer's inbox get the order (the stand-ins of
    // playwright.config.ts), each once, and the outbox marks both channels sent
    await expect
      .poll(async () => {
        const { telegram, email: emails } = await sentFor(number);
        return [telegram.length, emails.length];
      })
      .toEqual([1, 1]);
    const sent = await sentFor(number);
    expect(sent.telegram[0]).toMatchObject({ chatId: "-1001234567890", parseMode: "HTML" });
    expect(sent.telegram[0].text).toContain(`<b>${enNotifications.telegram.newOrder.replace("{number}", String(number))}</b>`);
    expect(sent.telegram[0].text).toContain(ordered.title);
    expect(sent.telegram[0].text).toContain("Gift wrapping, please");
    expect(sent.telegram[0].text).toContain(`/admin/orders/${number}"`);
    expect(sent.email[0]).toMatchObject({
      to: [email],
      subject: enNotifications.email.confirmation.subject.replace("{number}", String(number)),
    });
    expect(sent.email[0].html).toContain('<html lang="en"');
    expect(sent.email[0].text).toContain(enNotifications.email.confirmation.thanks.replace("{name}", "Olena"));
    expect(sent.email[0].text).toContain(unique.title);
    expect(sent.email[0].text).toContain(enNotifications.email.contactTbd);
    await expect
      .poll(async () => (await admin!.from("outbox_events").select("telegram_status, email_status, processed_at").eq("order_id", order!.id).single()).data)
      .toMatchObject({ telegram_status: "sent", email_status: "sent", processed_at: expect.any(String) });

    // another visitor with the same URL sees no order data
    const stranger = await browser.newContext();
    const other = await stranger.newPage();
    await other.goto(page.url());
    await expect(other.getByTestId("order-not-available")).toBeVisible();
    await expect(other.getByText(en.done.notAvailable)).toBeVisible();
    await expect(other.getByTestId("order-number")).toHaveCount(0);
    await expect(other.getByText(ordered.title)).toHaveCount(0);
    await stranger.close();
    expect(errors).toEqual([]);
  });

  test("a signed-in customer sends a request to a German parcel locker, prefilled from the profile", async ({ page, context }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 19 });
    const user = await createUser();
    expect((await admin!.from("cart_items").insert({ user_id: user.id, product_id: ordered.id, quantity: 3 })).error).toBeNull();

    await open(page, "/en/sign-in-and-up");
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(user.email);
    await form.getByLabel("Password").fill(user.password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en$/);

    await open(page, "/en/checkout");
    await expect(page.getByLabel(t.contact.firstName)).toHaveValue("Anna");
    await expect(page.getByLabel(t.contact.lastName)).toHaveValue("Schmidt");
    await expect(page.getByLabel(t.contact.phone)).toHaveValue("+4915112345678");
    await expect(page.getByLabel(t.contact.email)).toHaveValue(user.email);
    // the markets of D2: Ukraine, the EU and Switzerland, never the UK
    const country = page.getByLabel(en.internationalDelivery.country);
    await expect(country.locator("option:not([disabled])")).toHaveCount(29);
    await expect(country.locator("option[value=GB]")).toHaveCount(0);

    await country.selectOption("DE");
    await page.getByRole("combobox", { name: en.internationalDelivery.settlement }).pressSequentially("Berl");
    await page.getByRole("option", { name: /^Berlin/ }).click();
    await page.getByRole("button", { name: en.internationalDelivery.divisionTypes.Postomat, exact: true }).click();
    await page.getByRole("radio", { name: /Paketautomat/ }).check();
    await expect(page.locator("[data-slot=quote-line]")).toHaveAttribute("data-source", "carrier");
    await page.getByRole("button", { name: t.submit }).click();

    await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);
    const confirmation = page.getByTestId("order-confirmation");
    await expect(confirmation.getByText(en.done.thanks.replace("{name}", "Anna"))).toBeVisible();
    await expect(confirmation.getByText(en.internationalDelivery.customsNotice)).toBeVisible();
    const [order] = await ordersOf(user.email);
    expect(order).toMatchObject({ user_id: user.id, country: "DE", delivery_method: "division", items_total_usd_minor: 19_00 * 3 });
    const { data: cart } = await admin!.from("cart_items").select("id").eq("user_id", user.id);
    expect(cart).toEqual([]);

    // without the browser's confirmation cookie the account still opens its own order (RLS)
    await context.clearCookies({ name: "TJS_ORDERS" });
    await page.reload();
    await expect(page.getByTestId("order-number")).toHaveText(String(order!.number));
    expect(errors).toEqual([]);
  });

  test("prices, totals and goods injected into the request are ignored: the order has the server's numbers", async ({ page, baseURL }) => {
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 33 });
    await guestCart(page, baseURL!, [{ product: ordered, quantity: 2 }]);
    await open(page, "/en/checkout");
    const total = await minorOf(page.getByTestId("checkout-total").locator("[data-slot=price]"));

    // the Server Action call carries the form as JSON: add prices, totals and goods of the client's own
    let tampered = false;
    await page.route("**/en/checkout", async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
      const [payload] = JSON.parse(request.postData() ?? "[]");
      // the delivery searches are Server Actions too; only the order request names an attempt
      if (typeof payload !== "object" || payload === null || !("attempt" in payload)) return route.continue();
      payload.total = 1;
      payload.currency = "USD";
      payload.goods = { weightGrams: 0, totalUahMinor: 1 };
      payload.parcel = { weightGrams: 1, declaredValueMinor: 1 };
      payload.expected = payload.expected.map((line: object) => ({ ...line, priceUsdMinor: 1, unitMinor: 1 }));
      tampered = true;
      return route.continue({ postData: JSON.stringify([payload]) });
    });

    const email = uniqueEmail();
    await fillContact(page, email);
    await chooseKyivBranch(page);
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);
    expect(tampered).toBe(true);

    const [order] = await ordersOf(email);
    expect(order).toMatchObject({ items_total_usd_minor: 33_00 * 2, items_total_minor: total });
    expect(order!.order_items).toEqual([
      { product_id: ordered.id, quantity: 2, unit_price_usd_minor: 33_00, unit_price_minor: total / 2 },
    ]);
    expect(await minorOf(page.getByTestId("order-total").locator("[data-slot=price]"))).toBe(total);
  });

  test("a double click and a resubmitted request store one order", async ({ page, baseURL }) => {
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 14 });
    await guestCart(page, baseURL!, [{ product: ordered, quantity: 1 }]);
    await open(page, "/en/checkout");
    const email = uniqueEmail();
    await fillContact(page, email);
    await chooseKyivBranch(page);

    const sent: { body: string; headers: Record<string, string> }[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"] && request.postData()?.includes('"attempt"')) {
        sent.push({ body: request.postData() ?? "", headers: request.headers() });
      }
    });
    await page.getByRole("button", { name: t.submit }).dblclick();
    await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);
    const number = Number(new URL(page.url()).searchParams.get("order"));

    // the same attempt sent again, after the first one emptied the cart: the same order comes back
    expect(sent.length).toBeGreaterThan(0);
    const headers = Object.fromEntries(Object.entries(sent[0]!.headers).filter(([name]) => name !== "content-length"));
    const replay = await page.request.post("/en/checkout", { headers, data: sent[0]!.body });
    expect(replay.ok()).toBe(true);
    expect(await replay.text()).toContain(`"number":${number}`);

    const orders = await ordersOf(email);
    expect(orders.map((o) => o.number)).toEqual([number]);
  });

  test("a courier address abroad edited after its estimate must be calculated again; the order has the edited address", async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 23 });
    await guestCart(page, baseURL!, [{ product: ordered, quantity: 1 }]);
    await open(page, "/en/checkout");
    const email = uniqueEmail();
    await fillContact(page, email);

    const ti = en.internationalDelivery;
    const abroad = page.locator("[data-slot=international-delivery]");
    await page.getByLabel(ti.country).selectOption("DE");
    await abroad.getByRole("radio", { name: ti.methods.address }).check();
    await abroad.getByLabel(ti.address.city).fill("Berlin");
    await abroad.getByLabel(ti.address.postCode).fill("10115");
    await abroad.getByLabel(ti.address.street).fill("Invalidenstraße");
    await abroad.getByLabel(ti.address.building).fill("1");

    // typed but not calculated: no destination yet, and the error says what to do
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page.getByText(t.errors.deliveryAddress)).toBeVisible();
    expect(await ordersOf(email)).toEqual([]);

    await abroad.getByRole("button", { name: ti.address.submit }).click();
    await expect(abroad.locator("[data-slot=quote-line]")).toHaveAttribute("data-source", "carrier");
    await expect(page.getByText(t.errors.deliveryAddress)).toHaveCount(0);

    // an edit after calculating drops the estimate and the destination until it is calculated again
    await abroad.getByLabel(ti.address.street).fill("Chausseestraße");
    await abroad.getByLabel(ti.address.building).fill("99");
    await expect(abroad.locator("[data-slot=address-changed]")).toHaveText(ti.address.changed);
    await expect(abroad.locator("[data-slot=quote-line]")).not.toHaveAttribute("data-source", /.+/);
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page.getByText(t.errors.deliveryAddress)).toBeVisible();
    expect(await ordersOf(email)).toEqual([]);

    await abroad.getByRole("button", { name: ti.address.submit }).click();
    await expect(abroad.locator("[data-slot=quote-line]")).toHaveAttribute("data-source", "carrier");
    await expect(abroad.locator("[data-slot=address-changed]")).toHaveCount(0);
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);

    const { data, error } = await admin!.from("orders").select("delivery_method, delivery_destination").eq("email", email).single();
    expect(error).toBeNull();
    expect(data).toEqual({
      delivery_method: "address",
      delivery_destination: { city: "Berlin", postCode: "10115", street: "Chausseestraße", building: "99", flat: null },
    });
    expect(errors).toEqual([]);
  });

  test("the only piece of the request ordered by someone else meanwhile: its name stays on screen", async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const unique = await createProduct({ fulfillment: "one_of_a_kind", priceUsd: 61 });
    await guestCart(page, baseURL!, [{ product: unique, quantity: 1 }]);
    await open(page, "/en/checkout");
    const email = uniqueEmail();
    await fillContact(page, email);
    await chooseKyivBranch(page);

    expect((await admin!.from("products").update({ availability: "sold" }).eq("id", unique.id)).error).toBeNull();
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page.getByTestId("checkout-error")).toHaveText(t.errors.unavailable.replace("{titles}", unique.title));
    // still there a moment later: nothing replaces the form with the empty state
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("checkout-error")).toHaveText(t.errors.unavailable.replace("{titles}", unique.title));
    expect(await ordersOf(email)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("a piece ordered by someone else meanwhile refuses the request with its name; nothing is stored", async ({ page, baseURL }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const ordered = await createProduct({ fulfillment: "made_to_order", priceUsd: 18 });
    const unique = await createProduct({ fulfillment: "one_of_a_kind", priceUsd: 49 });
    await guestCart(page, baseURL!, [
      { product: ordered, quantity: 1 },
      { product: unique, quantity: 1 },
    ]);
    await open(page, "/en/checkout");
    const email = uniqueEmail();
    await fillContact(page, email);
    await chooseKyivBranch(page);

    // another order takes the piece while the form is open
    expect((await admin!.from("products").update({ availability: "reserved" }).eq("id", unique.id)).error).toBeNull();
    await page.getByRole("button", { name: t.submit }).click();
    await expect(page.getByTestId("checkout-error")).toHaveText(t.errors.unavailable.replace("{titles}", unique.title));
    await expect(page).toHaveURL(/\/en\/checkout$/);
    expect(await ordersOf(email)).toEqual([]);
    // the page shows the cart as it is now: the piece is left out
    await expect(page.getByTestId("checkout-line")).toHaveCount(1);
    await expect(page.getByRole("note")).toHaveText(t.summary.unavailableNote);
    expect(errors).toEqual([]);
  });
});

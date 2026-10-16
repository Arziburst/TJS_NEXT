// The customer account (#28) on the local stack: its tests create users, addresses and orders of their own, so
// they run only against a loopback stack (.env.local); in CI a missing stack fails instead. Orders use a seed
// made-to-order product, which ordering leaves unchanged (the catalog tests still count the seed). Nova Poshta
// answers from the recorded fixtures (playwright.config.ts).
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import en from "../messages/en/account.json" with { type: "json" };
import enCheckout from "../messages/en/checkout.json" with { type: "json" };
import enNav from "../messages/en/nav.json" with { type: "json" };
import type { Database } from "../src/lib/supabase/database.types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const stack = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const mailUrl = process.env.MAILPIT_URL || process.env.INBUCKET_URL;
  if (!url || !serviceRoleKey || !mailUrl) return null;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return null;
  return { url, serviceRoleKey, mailUrl };
})();

const admin = stack
  ? createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// seed TEST-006: a published made-to-order bracelet (supabase/seed.sql)
const MADE_TO_ORDER = { id: "a0000000-0000-4000-8000-000000000006", priceUsdMinor: 21_00 };

const createdUsers: string[] = [];
const usedEmails: string[] = [];

type User = { id: string; email: string; password: string };

async function createUser(name = "Olena Kovalenko"): Promise<User> {
  const email = `e2e-account-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone: "+380501234567" },
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  usedEmails.push(email);
  return { id: data.user.id, email, password };
}

/** An order request of `user`, written as the server writes one (the service role), with one line. */
async function createOrder(user: User, createdAt: Date) {
  const { data, error } = await admin!
    .from("orders")
    .insert({
      user_id: user.id,
      idempotency_key: randomUUID(),
      locale: "en",
      first_name: "Olena",
      phone: "+380501234567",
      email: user.email,
      country: "UA",
      delivery_carrier: "nova_poshta",
      delivery_method: "warehouse",
      delivery_destination: {},
      delivery_estimate_state: "unavailable",
      currency: "USD",
      currency_decimals: 2,
      fx_rate: 1,
      markup_bps: 300,
      items_total_usd_minor: MADE_TO_ORDER.priceUsdMinor * 2,
      items_total_minor: MADE_TO_ORDER.priceUsdMinor * 2,
      created_at: createdAt.toISOString(),
    })
    .select("id, number")
    .single();
  if (error) throw error;
  const line = await admin!.from("order_items").insert({
    order_id: data.id,
    position: 0,
    product_id: MADE_TO_ORDER.id,
    fulfillment: "made_to_order",
    title: "E2E bracelet",
    title_locale: "en",
    quantity: 2,
    unit_price_usd_minor: MADE_TO_ORDER.priceUsdMinor,
    unit_price_minor: MADE_TO_ORDER.priceUsdMinor,
    line_total_usd_minor: MADE_TO_ORDER.priceUsdMinor * 2,
    line_total_minor: MADE_TO_ORDER.priceUsdMinor * 2,
  });
  if (line.error) throw line.error;
  return data.number;
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

/** Signs in on the sign-in page (which then returns to `next`, else the home page). */
async function signIn(page: Page, user: User, next?: string) {
  await open(page, next ? `/en/sign-in-and-up?next=${encodeURIComponent(next)}` : "/en/sign-in-and-up");
  const form = page.getByRole("tabpanel", { name: "Sign In" });
  await form.getByLabel("Email").fill(user.email);
  await form.getByLabel("Password").fill(user.password);
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(next ? new RegExp(`${next}$`) : /\/en$/);
}

/** The newest email with `subject` to `to` (the local mail catcher), and the link in it. */
async function mailLink(to: string, subject: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${stack!.mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
        const message = messages.find((m) => m.Subject.includes(subject));
        if (!message) return undefined;
        const full = (await (await fetch(`${stack!.mailUrl}/api/v1/message/${message.ID}`)).json()) as { HTML: string };
        link = full.HTML.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
        return link;
      },
      { message: `an email "${subject}" to ${to}`, timeout: 20_000 },
    )
    .toBeTruthy();
  return link!;
}

test.describe("customer account on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the account e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");
  test.skip(!!process.env.E2E_BASE_URL, "needs the delivery fixtures that Playwright starts with the app");

  test.afterAll(async () => {
    if (usedEmails.length > 0) await admin?.from("orders").delete().in("email", usedEmails.splice(0));
    for (const id of createdUsers.splice(0)) await admin?.auth.admin.deleteUser(id);
  });

  test("a guest is sent to sign in and comes back to the account; account pages are not indexed", async ({ page }) => {
    await useOwnClientIp(page);
    const user = await createUser();
    for (const path of ["/en/account", "/en/account/orders", "/en/account/addresses"]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/en/sign-in-and-up\\?next=${encodeURIComponent(path)}$`));
    }
    await signIn(page, user, "/en/account");
    await expect(page.getByRole("heading", { level: 1, name: en.title })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("a customer edits the profile; after a reload the values are kept, and the menu links the account", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const user = await createUser();
    await signIn(page, user, "/en/account");

    const form = page.getByTestId("profile-form");
    // the sign-up's "Name and surname" is split until the customer saves it
    await expect(form.getByLabel(en.profile.firstName)).toHaveValue("Olena");
    await expect(form.getByLabel(en.profile.lastName)).toHaveValue("Kovalenko");
    await expect(form.getByLabel(en.profile.phone)).toHaveValue("+380501234567");
    await expect(page.getByTestId("current-email")).toHaveText(user.email);

    // a first name is required and a phone must have the country code
    await form.getByLabel(en.profile.firstName).fill("");
    await form.getByLabel(en.profile.phone).fill("0501234567");
    await form.getByRole("button", { name: en.profile.save }).click();
    await expect(form.getByLabel(en.profile.firstName)).toBeFocused();
    await expect(form.getByLabel(en.profile.firstName)).toHaveAccessibleDescription(en.profile.errors.firstName);
    await expect(form.getByText(en.profile.errors.phone)).toBeVisible();

    await form.getByLabel(en.profile.firstName).fill("Anna Maria");
    await form.getByLabel(en.profile.lastName).fill("Schmidt");
    await form.getByLabel(en.profile.phone).fill("+49 151 1234 5678");
    await form.getByRole("button", { name: en.profile.save }).click();
    await expect(page.getByTestId("profile-status")).toHaveText(en.profile.saved);

    await page.reload();
    await expect(form.getByLabel(en.profile.firstName)).toHaveValue("Anna Maria");
    await expect(form.getByLabel(en.profile.lastName)).toHaveValue("Schmidt");
    await expect(form.getByLabel(en.profile.phone)).toHaveValue("+4915112345678");
    const { data: profile } = await admin!.from("profiles").select("first_name, last_name, name, phone").eq("id", user.id).single();
    expect(profile).toEqual({ first_name: "Anna Maria", last_name: "Schmidt", name: "Anna Maria Schmidt", phone: "+4915112345678" });

    // the account menu: the display name, the account pages and the favorites
    await page.waitForLoadState("networkidle");
    const mobile = testInfo.project.name.startsWith("mobile");
    if (mobile) await page.getByRole("button", { name: enNav.openMenu }).click();
    const scope = mobile ? page.getByRole("dialog") : page.locator("header");
    await scope.getByRole("button", { name: enNav.account }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("Anna Maria Schmidt");
    for (const [name, href] of [
      [enNav.profile, "/en/account"],
      [enNav.orders, "/en/account/orders"],
      [enNav.addresses, "/en/account/addresses"],
      [enNav.favorites, "/en/favorites"],
    ]) {
      await expect(menu.getByRole("menuitem", { name })).toHaveAttribute("href", href);
    }
    await menu.getByRole("menuitem", { name: enNav.orders }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders$/);
    // the menu closed with the navigation
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByTestId("orders-empty")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the email changes once the links to the current and to the new address are followed", async ({ page }) => {
    await useOwnClientIp(page);
    const user = await createUser();
    await signIn(page, user, "/en/account");
    const next = `e2e-account-new-${randomUUID()}@example.test`;
    usedEmails.push(next);

    const form = page.getByTestId("email-form");
    await form.getByLabel(en.email.new).fill(user.email);
    await form.getByRole("button", { name: en.email.submit }).click();
    await expect(form.getByText(en.email.errors.same)).toBeVisible();

    await form.getByLabel(en.email.new).fill(next);
    await form.getByRole("button", { name: en.email.submit }).click();
    await expect(page.getByTestId("email-status")).toHaveText(en.email.sent.replace("{email}", next));

    // both confirmation links (double_confirm_changes) land on /<locale>/auth/confirm
    const fromCurrent = await mailLink(user.email, "Confirm your new email");
    const fromNew = await mailLink(next, "Confirm your new email");
    expect(new URL(fromCurrent).pathname).toBe("/en/auth/confirm");
    await page.goto(fromCurrent);
    await open(page, "/en/account");
    await expect(page.getByTestId("current-email")).toHaveText(user.email);
    await page.goto(fromNew);
    await open(page, "/en/account");
    await expect(page.getByTestId("current-email")).toHaveText(next);
    const { data } = await admin!.auth.admin.getUserById(user.id);
    expect(data.user?.email).toBe(next);
  });

  test("a saved address is the default of the checkout, and the order stores it", async ({ page }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const user = await createUser();
    expect((await admin!.from("cart_items").insert({ user_id: user.id, product_id: MADE_TO_ORDER.id, quantity: 1 })).error).toBeNull();
    await signIn(page, user, "/en/account/addresses");
    await expect(page.getByTestId("addresses-empty")).toBeVisible();

    const form = page.getByTestId("new-address-form");
    // nothing chosen: the form says what is missing
    await form.getByRole("button", { name: en.addresses.save }).click();
    await expect(page.getByTestId("new-address-error")).toHaveText(en.addresses.errors.delivery);

    await form.getByLabel(en.addresses.label).fill("Home");
    await form.getByLabel(en.addresses.country).selectOption("UA");
    await form.getByRole("combobox", { name: enCheckout.delivery.city.label }).pressSequentially("Київ");
    await page.getByRole("listbox").getByRole("option").first().click();
    await form.getByRole("combobox", { name: enCheckout.delivery.warehouse.label }).click();
    await page.getByRole("listbox").getByRole("option").first().click();
    await form.getByRole("button", { name: en.addresses.save }).click();
    await expect(page.getByTestId("new-address-status")).toHaveText(en.addresses.saved);

    const saved = page.getByTestId("saved-address");
    await expect(saved).toHaveCount(1);
    await expect(saved).toHaveAttribute("data-default", "true");
    await expect(saved).toContainText("Home");
    await expect(saved.getByTestId("delivery-summary")).toContainText(en.addresses.kinds.novaPoshtaBranch);
    const { data: rows } = await admin!.from("saved_addresses").select("delivery, is_default").eq("user_id", user.id);
    expect(rows).toHaveLength(1);
    const delivery = rows![0]!.delivery as { kind: string; warehouse: { ref: string; name: string } };
    expect(delivery.kind).toBe("novaPoshtaWarehouse");

    await open(page, "/en/checkout");
    const choices = page.getByTestId("saved-addresses");
    await expect(choices.getByRole("radio", { name: /Home/ })).toBeChecked();
    await expect(choices).toContainText(delivery.warehouse.name);
    await expect(page.locator("[data-slot=delivery-quote] output")).toHaveText(/^≈ /);
    // another address shows the usual pieces; the saved one is chosen again
    await choices.getByRole("radio", { name: enCheckout.request.saved.other }).check();
    await expect(page.getByLabel(enCheckout.internationalDelivery.country)).toBeVisible();
    await choices.getByRole("radio", { name: /Home/ }).check();
    await page.getByRole("button", { name: enCheckout.request.submit }).click();

    await expect(page).toHaveURL(/\/en\/checkout\/done\?order=\d+$/);
    const number = Number(new URL(page.url()).searchParams.get("order"));
    const { data: order } = await admin!
      .from("orders")
      .select("user_id, country, delivery_carrier, delivery_method, delivery_destination")
      .eq("number", number)
      .single();
    expect(order).toMatchObject({ user_id: user.id, country: "UA", delivery_carrier: "nova_poshta", delivery_method: "warehouse" });
    expect((order!.delivery_destination as { warehouse: { ref: string } }).warehouse.ref).toBe(delivery.warehouse.ref);

    // the order history has it, with the stored destination
    await open(page, "/en/account/orders");
    await page.getByRole("link", { name: en.orders.details.replace("{number}", String(number)) }).click();
    await expect(page).toHaveURL(new RegExp(`/en/account/orders/${number}$`));
    await expect(page.getByTestId("order-detail")).toContainText(en.orderStatus.new);
    await expect(page.getByTestId("delivery-summary")).toContainText(delivery.warehouse.name);
    expect(errors).toEqual([]);
  });

  test("five addresses at most; a new default takes the mark, deleting it promotes the oldest", async ({ page }) => {
    await useOwnClientIp(page);
    const user = await createUser();
    const rows = ["Kraków", "Wrocław", "Gdańsk", "Poznań", "Łódź"].map((city, i) => ({
      user_id: user.id,
      label: city,
      country: "PL",
      delivery: { kind: "novaPostAddress", country: "PL", city, postCode: "00-001", street: "ul. Długa", building: String(i + 1), flat: null },
      created_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    }));
    for (const row of rows) expect((await admin!.from("saved_addresses").insert(row)).error).toBeNull();
    await signIn(page, user, "/en/account/addresses");

    const saved = page.getByTestId("saved-address");
    await expect(saved).toHaveCount(5);
    await expect(page.getByTestId("addresses-full")).toHaveText(en.addresses.full.replace("{max}", "5"));
    await expect(page.getByTestId("new-address-form")).toHaveCount(0);
    await expect(saved.first()).toContainText("Kraków");
    await expect(saved.first()).toHaveAttribute("data-default", "true");

    await page.getByRole("button", { name: en.addresses.makeDefaultLabel.replace("{name}", "Gdańsk") }).click();
    await expect(saved.first()).toContainText("Gdańsk");
    await expect(page.locator("[data-testid=saved-address][data-default]")).toHaveCount(1);

    await page.getByRole("button", { name: en.addresses.deleteLabel.replace("{name}", "Gdańsk") }).click();
    await expect(saved).toHaveCount(4);
    await expect(saved.first()).toContainText("Kraków");
    await expect(saved.first()).toHaveAttribute("data-default", "true");
    await expect(page.getByTestId("new-address-form")).toBeVisible();
  });

  test("the order history shows the customer's own orders, newest first and paged; another customer's order is not found", async ({ page }) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const [customer, other] = await Promise.all([createUser(), createUser("Iryna Test")]);
    const day = (n: number) => new Date(Date.UTC(2026, 8, n, 12));
    const own: number[] = [];
    // eleven orders: one more than a page
    for (let n = 1; n <= 11; n++) own.push(await createOrder(customer, day(n)));
    const foreign = await createOrder(other, day(20));

    await signIn(page, customer, "/en/account/orders");
    const rows = page.getByTestId("order-row-number");
    await expect(rows).toHaveCount(10);
    // newest first: the eleventh order heads the first page, the first one is alone on the second
    await expect(rows.first()).toHaveText(en.orders.number.replace("{number}", String(own[10])));
    await expect(page.getByTestId("orders-list")).not.toContainText(String(foreign));
    const row = page.getByTestId("order-row").first();
    await expect(row).toContainText(en.orderStatus.new);
    await expect(row).toContainText("2 pieces");
    await expect(row.locator("data")).toHaveAttribute("value", "42.00");

    await page.getByRole("link", { name: en.orders.pagination.next }).click();
    await expect(page).toHaveURL(/\/en\/account\/orders\?page=2$/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText(en.orders.number.replace("{number}", String(own[0])));
    await expect(page.getByText(en.orders.pagination.page.replace("{page}", "2").replace("{pages}", "2"))).toBeVisible();

    // the own order's detail: the stored line
    await open(page, `/en/account/orders/${own[0]}`);
    await expect(page.getByTestId("order-detail")).toContainText(en.order.title.replace("{number}", String(own[0])));
    await expect(page.getByTestId("order-detail-line")).toContainText("E2E bracelet");
    await expect(page.getByTestId("order-detail-total").locator("data")).toHaveAttribute("value", "42.00");

    // another customer's number reads as no order (RLS), like an unknown one
    for (const number of [foreign, 99_999_999]) {
      await open(page, `/en/account/orders/${number}`);
      await expect(page.getByTestId("order-not-found")).toContainText(en.order.notFound.title);
      await expect(page.getByTestId("order-detail")).toHaveCount(0);
      await expect(page.getByText("Iryna")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
});

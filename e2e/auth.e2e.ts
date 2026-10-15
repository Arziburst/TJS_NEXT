// Auth flows on the local Supabase stack: they create users and read emails from its mail catcher, so they
// run only against a loopback stack (.env.local); in CI a missing stack fails instead of skipping.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { AUTH_RATE_LIMIT, rateLimitKeys } from "../src/lib/auth/rate-limit-keys";

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
  ? createClient(stack.url, stack.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const createdUsers: string[] = [];

function uniqueEmail(): string {
  return `e2e-${randomUUID()}@example.test`;
}

// Each test signs in from its own client address, so the auth rate limit (per IP) never couples tests.
async function useOwnClientIp(page: Page): Promise<string> {
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  return ip;
}

async function createUser(options: { confirmed: boolean; name?: string }) {
  const email = uniqueEmail();
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password,
    email_confirm: options.confirmed,
    user_metadata: options.name ? { name: options.name } : {},
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  return { email, password };
}

type MailSummary = { ID: string; Subject: string };

/** The link of the newest email to `to` whose subject contains `subject` (waits for it to arrive). */
async function emailLink(to: string, subject: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(`${stack!.mailUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const { messages } = (await search.json()) as { messages: MailSummary[] };
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

/** Opens a page and waits until it has hydrated (a form submitted before that would post without JS). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

const isMobile = (projectName: string) => projectName === "mobile";

/** The account control of the header; on mobile it sits in the menu sheet. */
async function accountScope(page: Page, projectName: string) {
  await page.waitForLoadState("networkidle");
  if (!isMobile(projectName)) return page.locator("header");
  await page.getByRole("button", { name: "Open menu" }).click();
  return page.getByRole("dialog");
}

async function expectSignedIn(page: Page, projectName: string, name: string) {
  const scope = await accountScope(page, projectName);
  await scope.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("menu")).toContainText(name);
  await page.keyboard.press("Escape");
  if (isMobile(projectName)) await page.keyboard.press("Escape");
}

/** Signs out through the account menu; returns the account scope, open again (on mobile: the menu sheet). */
async function signOut(page: Page, projectName: string) {
  const scope = await accountScope(page, projectName);
  await scope.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/en$/);
  const after = await accountScope(page, projectName);
  await expect(after.getByRole("link", { name: "Account" })).toBeVisible();
  return after;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.describe("auth on the local stack", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the auth e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    for (const id of createdUsers.splice(0)) await admin?.auth.admin.deleteUser(id);
  });

  test("sign up, confirm by email, then the header shows the account", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const email = uniqueEmail();
    const name = `Olena ${randomUUID().slice(0, 8)}`;
    await open(page, "/en/sign-in-and-up");
    await page.getByRole("tab", { name: "Sign Up" }).click();
    const form = page.getByRole("tabpanel", { name: "Sign Up" });
    await form.getByLabel("Name and surname").fill(name);
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Phone").fill("+380 94 682 62 42");
    await form.getByLabel("Password", { exact: true }).fill("e2e-password-1");
    await form.getByLabel("Password again").fill("e2e-password-1");
    await form.getByRole("button", { name: "Sign up" }).click();
    await expect(form.getByRole("status")).toContainText(`We sent a confirmation link to ${email}`);

    // the profile exists from sign-up on, with the normalized phone and the customer role
    const { data: profiles } = await admin!.from("profiles").select("id, phone, role").eq("name", name);
    expect(profiles?.map(({ phone, role }) => ({ phone, role }))).toEqual([{ phone: "+380946826242", role: "customer" }]);
    createdUsers.push(...(profiles ?? []).map((p) => p.id));

    // not confirmed yet: signing in is refused with a hint
    await page.getByRole("tab", { name: "Sign In" }).click();
    const signIn = page.getByRole("tabpanel", { name: "Sign In" });
    await signIn.getByLabel("Email").fill(email);
    await signIn.getByLabel("Password").fill("e2e-password-1");
    await signIn.getByRole("button", { name: "Sign in" }).click();
    await expect(signIn.getByRole("alert")).toHaveText("Please confirm your email first: follow the link we sent you.");

    await open(page, await emailLink(email, "Confirm your email"));
    await expect(page).toHaveURL(/\/en$/);
    await expectSignedIn(page, testInfo.project.name, name);
    expect(errors).toEqual([]);
  });

  test("a wrong password is refused; the right one signs in; sign-out signs out", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const user = await createUser({ confirmed: true, name: "Iryna Test" });
    await open(page, "/en/sign-in-and-up");
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(user.email);
    await form.getByLabel("Password").fill("not-the-password");
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByRole("alert")).toHaveText("Wrong email or password.");
    await expect(form.getByLabel("Email")).toHaveValue(user.email);

    await form.getByLabel("Password").fill(user.password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expectSignedIn(page, testInfo.project.name, "Iryna Test");

    // the sign-in page is for guests: a signed-in visitor goes home
    await open(page, "/en/sign-in-and-up");
    await expect(page).toHaveURL(/\/en$/);

    await signOut(page, testInfo.project.name);
    expect(errors).toEqual([]);
  });

  test("password reset by email, then sign-in with the new password", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await useOwnClientIp(page);
    const user = await createUser({ confirmed: true, name: "Marta Reset" });
    await open(page, "/en/sign-in-and-up");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/en\/forgot-password$/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("textbox", { name: "Email" }).fill(user.email);
    await page.getByRole("button", { name: "Send the link" }).click();
    await expect(page.getByRole("status")).toContainText(`If an account exists for ${user.email}`);

    await open(page, await emailLink(user.email, "Reset your password"));
    await expect(page).toHaveURL(/\/en\/update-password$/);
    await page.getByLabel("New password", { exact: true }).fill("new-e2e-password");
    await page.getByLabel("New password again").fill("something-else");
    await page.getByRole("button", { name: "Save the password" }).click();
    await expect(page.getByText("Passwords do not match")).toBeVisible();
    await expect(page.getByLabel("New password again")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("New password", { exact: true }).fill("new-e2e-password");
    await page.getByLabel("New password again").fill("new-e2e-password");
    await page.getByRole("button", { name: "Save the password" }).click();
    await expect(page).toHaveURL(/\/en$/);
    // the email link set the host the session cookies live on, so stay on it: navigate by links
    const scope = await signOut(page, testInfo.project.name);
    await scope.getByRole("link", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in-and-up$/);
    await page.waitForLoadState("networkidle");
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(user.email);
    await form.getByLabel("Password").fill("new-e2e-password");
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expectSignedIn(page, testInfo.project.name, "Marta Reset");
    expect(errors).toEqual([]);
  });

  test("sign-up form errors are announced with their fields", async ({ page }) => {
    await useOwnClientIp(page);
    await open(page, "/en/sign-in-and-up");
    await page.getByRole("tab", { name: "Sign Up" }).click();
    const form = page.getByRole("tabpanel", { name: "Sign Up" });
    await form.getByLabel("Name and surname").fill("Ann");
    await form.getByLabel("Email").fill("not-an-email");
    await form.getByLabel("Phone").fill("0946826242");
    await form.getByLabel("Password", { exact: true }).fill("12345");
    await form.getByLabel("Password again").fill("54321");
    await form.getByRole("button", { name: "Sign up" }).click();

    await expect(form.getByLabel("Name and surname")).toHaveAccessibleDescription("Name must be at least 4 characters long");
    await expect(form.getByLabel("Email")).toHaveAccessibleDescription("Invalid email format");
    await expect(form.getByLabel("Phone")).toHaveAccessibleDescription(
      "Invalid phone number format. For example +380946826242",
    );
    await expect(form.getByLabel("Password", { exact: true })).toHaveAccessibleDescription(
      "Password must be at least 8 characters long",
    );
    await expect(form.getByLabel("Password again")).toHaveAccessibleDescription("Passwords do not match");
    for (const label of ["Name and surname", "Email", "Phone"]) {
      await expect(form.getByLabel(label)).toHaveAttribute("aria-invalid", "true");
    }
    // what was typed stays (never the passwords)
    await expect(form.getByLabel("Name and surname")).toHaveValue("Ann");
    await expect(form.getByLabel("Password", { exact: true })).toHaveValue("");
  });

  test("too many sign-in attempts from one address are refused", async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo.project.name), "the counter is per address, not per layout");
    const ip = await useOwnClientIp(page);
    // the 15 attempts the window allows, counted straight in the database
    for (const key of rateLimitKeys("sign-in", ip)) {
      for (let i = 0; i < AUTH_RATE_LIMIT.max; i++) {
        const { error } = await admin!.rpc("consume_rate_limit", {
          p_key: key,
          p_max: AUTH_RATE_LIMIT.max,
          p_window_seconds: AUTH_RATE_LIMIT.windowSeconds,
        });
        if (error) throw error;
      }
    }
    const user = await createUser({ confirmed: true });
    await open(page, "/en/sign-in-and-up");
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(user.email);
    await form.getByLabel("Password").fill(user.password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByRole("alert")).toHaveText("Too many attempts. Please wait a few minutes and try again.");
    await expect(page).toHaveURL(/\/en\/sign-in-and-up$/);
  });

  test("an invalid email link explains itself", async ({ page }) => {
    await page.goto("/en/auth/confirm?token_hash=pkce_invalid&type=email");
    await expect(page).toHaveURL(/\/en\/sign-in-and-up\?error=linkInvalid$/);
    await expect(page.getByRole("alert").first()).toHaveText("This link is invalid or has expired.");
  });

  test("update-password sends a guest to sign in", async ({ page }) => {
    await page.goto("/en/update-password");
    await expect(page).toHaveURL(/\/en\/sign-in-and-up\?next=%2Fen%2Fupdate-password$/);
  });
});

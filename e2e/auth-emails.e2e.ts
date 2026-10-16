// Auth's emails in the user's language (#99). The locale goes with the account: stored at sign-up and on a change
// of language while signed in (user_metadata.locale). With the stack started with the Send Email Hook on
// (E2E_SEND_EMAIL_HOOK=true, docs/dev-environment.md "Auth emails in the user's language"), the emails come
// through the app's hook to the notifications stand-in, each in its user's language, and their links work.
// Run that mode on this file only: the other auth tests read the English templates from the mail catcher.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import deAuth from "../messages/de/auth.json" with { type: "json" };
import enNav from "../messages/en/nav.json" with { type: "json" };
import deNav from "../messages/de/nav.json" with { type: "json" };
import ukAccount from "../messages/uk/account.json" with { type: "json" };
import ukAuth from "../messages/uk/auth.json" with { type: "json" };
import ukNav from "../messages/uk/nav.json" with { type: "json" };
import deNotifications from "../messages/de/notifications.json" with { type: "json" };
import ukNotifications from "../messages/uk/notifications.json" with { type: "json" };
import { emailsTo } from "./notifications";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const stack = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return null;
  return { url, serviceRoleKey };
})();
const withHook = process.env.E2E_SEND_EMAIL_HOOK === "true";

const admin = stack
  ? createClient(stack.url, stack.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
const createdUsers: string[] = [];

type AuthMessages = typeof deAuth;

function uniqueEmail(): string {
  return `e2e-${randomUUID()}@example.test`;
}

// Each test signs in from its own client address, so the auth rate limit (per IP) never couples tests.
async function useOwnClientIp(page: Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
}

/** Opens a page and waits until it has hydrated (a form submitted before that would post without JS). */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/** Signs up through the form of `/<locale>/sign-in-and-up`; returns the new user's id. */
async function signUp(page: Page, locale: string, auth: AuthMessages, email: string): Promise<string> {
  const name = `E2e ${randomUUID().slice(0, 8)}`;
  await open(page, `/${locale}/sign-in-and-up`);
  await page.getByRole("tab", { name: auth.signUp.title }).click();
  const form = page.getByRole("tabpanel", { name: auth.signUp.title });
  await form.locator('input[name="name"]').fill(name);
  await form.locator('input[name="email"]').fill(email);
  await form.locator('input[name="phone"]').fill("+380946826242");
  await form.locator('input[name="password"]').fill("e2e-password-1");
  await form.locator('input[name="passwordAgain"]').fill("e2e-password-1");
  await form.getByRole("button", { name: auth.signUp.submit }).click();
  await expect(form.getByRole("status")).toContainText(email);
  const { data: profiles } = await admin!.from("profiles").select("id").eq("name", name);
  expect(profiles).toHaveLength(1);
  createdUsers.push(profiles![0].id);
  return profiles![0].id;
}

async function storedLocale(id: string): Promise<unknown> {
  const { data, error } = await admin!.auth.admin.getUserById(id);
  if (error) throw error;
  return data.user.user_metadata?.locale;
}

/** The newest email to `to` with `subject`, as the stand-in got it from the hook (waits for it). */
async function hookEmail(to: string, subject: string) {
  let found: Awaited<ReturnType<typeof emailsTo>>[number] | undefined;
  await expect
    .poll(
      async () => {
        found = (await emailsTo(to)).findLast((email) => email.subject === subject);
        return found !== undefined;
      },
      { message: `an email "${subject}" to ${to}`, timeout: 20_000 },
    )
    .toBe(true);
  return found!;
}

function linkOf(html: string): string {
  const link = html.match(/href="([^"]+\/auth\/confirm\?[^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
  if (!link) throw new Error("no confirm link in the email");
  return link;
}

test.describe("Auth emails in the user's language", () => {
  test.beforeAll(() => {
    if (!stack && process.env.CI === "true") {
      throw new Error("CI=true but no local Supabase stack in .env.local: the auth e2e tests must not be skipped");
    }
  });
  test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

  test.afterAll(async () => {
    for (const id of createdUsers.splice(0)) await admin?.auth.admin.deleteUser(id);
  });

  test("sign-up on /de stores the locale de", async ({ page }) => {
    await useOwnClientIp(page);
    const id = await signUp(page, "de", deAuth, uniqueEmail());
    expect(await storedLocale(id)).toBe("de");
  });

  test("a change of language while signed in stores the new locale", async ({ page }, testInfo) => {
    await useOwnClientIp(page);
    const email = uniqueEmail();
    const password = `pw-${randomUUID()}`;
    const { data, error } = await admin!.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: "Olena Locale", locale: "en" },
    });
    if (error) throw error;
    createdUsers.push(data.user.id);

    await open(page, "/en/sign-in-and-up");
    const form = page.getByRole("tabpanel", { name: "Sign In" });
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Password").fill(password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await page.waitForLoadState("networkidle");

    if (testInfo.project.name.startsWith("mobile")) {
      await page.locator("header").getByRole("button", { name: enNav.openMenu }).filter({ visible: true }).click();
      await page.getByRole("dialog").getByLabel(enNav.language).selectOption("uk");
    } else {
      await page.locator("header").getByLabel(enNav.language).filter({ visible: true }).selectOption("uk");
    }
    await expect(page).toHaveURL(/\/uk$/);
    await expect.poll(() => storedLocale(data.user.id), { timeout: 10_000 }).toBe("uk");
    // the name and the phone of the metadata stay
    const { data: after } = await admin!.auth.admin.getUserById(data.user.id);
    expect(after.user?.user_metadata?.name).toBe("Olena Locale");
  });

  test.describe("through the Send Email Hook", () => {
    test.skip(!withHook, "needs the stack started with the Send Email Hook on (E2E_SEND_EMAIL_HOOK=true)");

    for (const { locale, auth, nav, notifications } of [
      { locale: "uk", auth: ukAuth, nav: ukNav, notifications: ukNotifications },
      { locale: "de", auth: deAuth, nav: deNav, notifications: deNotifications },
    ]) {
      test(`sign-up in ${locale} gets the confirmation in ${locale}, and its link signs in`, async ({ page }, testInfo) => {
        await useOwnClientIp(page);
        const email = uniqueEmail();
        await signUp(page, locale, auth, email);
        const message = await hookEmail(email, notifications.email.auth.signup.subject);
        expect(message.html).toContain(`<html lang="${locale}"`);
        expect(message.text).toContain(notifications.email.auth.signup.ignore);
        const link = linkOf(message.html);
        expect(link).toMatch(new RegExp(`/${locale}/auth/confirm\\?token_hash=[^&]+&type=email$`));
        await open(page, link);
        await expect(page).toHaveURL(new RegExp(`/${locale}$`));
        // signed in: the header shows the account menu, not the sign-in link
        await page.waitForLoadState("networkidle");
        if (testInfo.project.name.startsWith("mobile")) {
          await page.locator("header").getByRole("button", { name: nav.openMenu }).filter({ visible: true }).click();
          await expect(page.getByRole("dialog").getByRole("button", { name: nav.account })).toBeVisible();
        } else {
          await expect(page.locator("header").getByRole("button", { name: nav.account })).toBeVisible();
        }
      });
    }

    test("an email change sends each address its own link in uk, and both links complete it", async ({ page }) => {
      await useOwnClientIp(page);
      const email = uniqueEmail();
      const password = `pw-${randomUUID()}`;
      const { data, error } = await admin!.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "Olena Change", locale: "uk" },
      });
      if (error) throw error;
      createdUsers.push(data.user.id);

      await open(page, "/uk/sign-in-and-up");
      const signIn = page.getByRole("tabpanel", { name: ukAuth.signIn.title });
      await signIn.locator('input[name="email"]').fill(email);
      await signIn.locator('input[name="password"]').fill(password);
      await signIn.getByRole("button", { name: ukAuth.signIn.submit }).click();
      await expect(page).toHaveURL(/\/uk$/);

      const next = uniqueEmail();
      await open(page, "/uk/account");
      const form = page.getByTestId("email-form");
      await form.getByLabel(ukAccount.email.new).fill(next);
      await form.getByRole("button", { name: ukAccount.email.submit }).click();
      await expect(page.getByTestId("email-status")).toHaveText(ukAccount.email.sent.replace("{email}", next));

      const toCurrent = await hookEmail(email, ukNotifications.email.auth.emailChangeCurrent.subject);
      const toNew = await hookEmail(next, ukNotifications.email.auth.emailChangeNew.subject);
      expect(toCurrent.text).toContain(`${email} на ${next}`);
      const [fromCurrent, fromNew] = [linkOf(toCurrent.html), linkOf(toNew.html)];
      expect(new URL(fromCurrent).searchParams.get("token_hash")).not.toBe(new URL(fromNew).searchParams.get("token_hash"));
      // opened in this browser (the links name the configured site host; the session lives on the test's host)
      const here = (link: string) => new URL(link).pathname + new URL(link).search;

      await page.goto(here(fromCurrent));
      await expect(page).toHaveURL(/\/uk\/account$/);
      await expect(page.getByTestId("current-email")).toHaveText(email);
      await page.goto(here(fromNew));
      await expect(page).toHaveURL(/\/uk\/account$/);
      await expect(page.getByTestId("current-email")).toHaveText(next);
      const { data: changed } = await admin!.auth.admin.getUserById(data.user.id);
      expect(changed.user?.email).toBe(next);
    });

    test("a password reset asked on /de comes in the stored language (uk) with a recovery link", async ({ page }) => {
      await useOwnClientIp(page);
      const email = uniqueEmail();
      const { data, error } = await admin!.auth.admin.createUser({
        email,
        password: `pw-${randomUUID()}`,
        email_confirm: true,
        user_metadata: { name: "Olena Reset", locale: "uk" },
      });
      if (error) throw error;
      createdUsers.push(data.user.id);

      await open(page, "/de/forgot-password");
      await page.locator('input[name="email"]').fill(email);
      await page.getByRole("button", { name: deAuth.forgotPassword.submit }).click();
      await expect(page.getByRole("status")).toContainText(email);

      const message = await hookEmail(email, ukNotifications.email.auth.recovery.subject);
      const link = linkOf(message.html);
      expect(link).toMatch(/\/uk\/auth\/confirm\?token_hash=[^&]+&type=recovery$/);
      await open(page, link);
      await expect(page).toHaveURL(/\/uk\/update-password$/);
    });
  });
});

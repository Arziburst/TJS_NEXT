// A sheet opened on a phone as soon as its trigger answers, while the page's JavaScript is still loading (#113):
// no console error or hydration warning, and the sheet opens. Base UI's modal dialog puts `aria-hidden` on
// everything outside it — down to the siblings of every `[aria-live]` node, which it keeps visible — so a sheet
// that opened before a streamed boundary hydrated would mark nodes React has not hydrated yet (`next dev`
// logged that mismatch on /uk/admin, #96). The production build hydrates the page before the lazy sheet's
// code arrives; these tests keep it so, with every chunk throttled. Run 10 times for the oracle
// (`--repeat-each 10`).
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test as base, type Cookie, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import ukAdmin from "../messages/uk/admin.json" with { type: "json" };
import ukCatalog from "../messages/uk/catalog.json" with { type: "json" };
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

const test = base.extend<object, { adminCookies: Cookie[] }>({
  // a new admin signed in through the form once per worker, from a client address of its own, and deleted after:
  // Supabase Auth limits the sign-ins from the app server's address (30 in 5 minutes), which 10 repeats of a
  // sign-in per test would use up
  adminCookies: [
    async ({ browser }, provide, workerInfo) => {
      const email = `e2e-sheet-${randomUUID()}@example.test`;
      const password = `pw-${randomUUID()}`;
      const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      try {
        const { error: roleError } = await db!.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
        if (roleError) throw roleError;
        const context = await browser.newContext({
          baseURL: workerInfo.project.use.baseURL,
          extraHTTPHeaders: { "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` },
        });
        const page = await context.newPage();
        await page.goto("/uk/sign-in-and-up?next=%2Fuk");
        await page.waitForLoadState("networkidle");
        const form = page.getByRole("tabpanel", { name: "Увійти" });
        await form.getByLabel("Ел. пошта").fill(email);
        await form.getByLabel("Пароль").fill(password);
        await form.getByRole("button", { name: "Увійти" }).click();
        await page.waitForURL("/uk");
        const cookies = await context.cookies();
        await context.close();
        await provide(cookies);
      } finally {
        await db!.auth.admin.deleteUser(data.user.id);
      }
    },
    { scope: "worker" },
  ],
});

// every script chunk answers this much later, so the taps land before the page has hydrated
const CHUNK_DELAY_MS = 1500;

type Problems = { console: string[]; unhydratedHidden: () => Promise<string[]> };

/**
 * Collects the console errors and hydration warnings, and every element below `<body>`'s own children that gets
 * `aria-hidden="true"` while React has not hydrated it yet (no React fiber on it at that moment).
 */
async function watch(page: Page): Promise<Problems> {
  const messages: string[] = [];
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // every error, and every warning about hydration (the browser's own warnings, e.g. on a header, are not this
    // flow's: CI's Chromium warns on the Permissions-Policy feature `bluetooth`)
    if (message.type() === "error" || (message.type() === "warning" && /hydrat/i.test(message.text()))) {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  await page.addInitScript(() => {
    const marks: string[] = [];
    (window as unknown as { __unhydratedHidden: string[] }).__unhydratedHidden = marks;
    new MutationObserver((records) => {
      for (const { target } of records) {
        const element = target as Element;
        if (element.getAttribute("aria-hidden") !== "true" || element.parentElement === document.body) continue;
        if (Object.keys(element).some((key) => key.startsWith("__reactFiber$"))) continue;
        marks.push(`<${element.tagName.toLowerCase()} class="${element.getAttribute("class") ?? ""}">`);
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["aria-hidden"] });
  });
  return {
    console: messages,
    unhydratedHidden: () => page.evaluate(() => (window as unknown as { __unhydratedHidden: string[] }).__unhydratedHidden),
  };
}

async function throttleChunks(page: Page) {
  await page.route(/\/_next\/static\/chunks\/.+\.js(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    await route.continue();
  });
}

/**
 * Taps the trigger as soon as it is on the screen and again until the sheet is open: a tap before the
 * trigger hydrates does nothing (a plain button), the first one after it opens the sheet.
 */
async function tapUntilOpen(trigger: Locator, sheet: Locator) {
  await trigger.waitFor();
  await expect
    .poll(
      async () => {
        if (await sheet.isVisible()) return true;
        await trigger.tap({ timeout: 1_000 }).catch(() => {});
        return sheet.isVisible();
      },
      { timeout: 30_000, intervals: [100] },
    )
    .toBe(true);
}

async function expectNoProblems(page: Page, problems: Problems) {
  await page.waitForLoadState("networkidle");
  expect(await problems.unhydratedHidden(), "aria-hidden on nodes React had not hydrated").toEqual([]);
  expect(problems.console).toEqual([]);
}

test.describe("sheets opened before the page hydrates (#113)", () => {
  test.skip(({ isMobile }) => !isMobile, "the sheets' triggers exist below 1024px");

  test("the menu on the shop", async ({ page }) => {
    const problems = await watch(page);
    await throttleChunks(page);
    await page.goto("/uk/shop", { waitUntil: "commit" });
    const menu = page.getByRole("dialog");
    await tapUntilOpen(page.locator("header").getByRole("button", { name: ukNav.openMenu }), menu);
    await expect(menu.getByRole("navigation", { name: ukNav.main })).toBeVisible();
    await expectNoProblems(page, problems);
    await menu.getByRole("button", { name: ukNav.closeMenu }).click();
    await expect(menu).toHaveCount(0);
  });

  test("the mini-cart on the shop", async ({ page }) => {
    const problems = await watch(page);
    await throttleChunks(page);
    await page.goto("/uk/shop", { waitUntil: "commit" });
    const cart = page.getByRole("dialog");
    const trigger = page.locator("header").getByRole("button", { name: new RegExp(`^${ukNav.cart},`) });
    await tapUntilOpen(trigger, cart);
    await expect(cart.getByRole("button", { name: ukNav.closeCart })).toBeVisible();
    await expectNoProblems(page, problems);
    await page.keyboard.press("Escape");
    await expect(cart).toHaveCount(0);
  });

  test("the filters on the shop", async ({ page }) => {
    const problems = await watch(page);
    await throttleChunks(page);
    await page.goto("/uk/shop", { waitUntil: "commit" });
    const filters = page.getByRole("dialog");
    const trigger = page.getByRole("button", { name: new RegExp(`^${ukCatalog.filters.open.match(/=0 \{(.+?)\}/)![1]}`) });
    await tapUntilOpen(trigger, filters);
    await expectNoProblems(page, problems);
    await page.keyboard.press("Escape");
    await expect(filters).toHaveCount(0);
  });

  test.describe("in the admin", () => {
    test.beforeAll(() => {
      if (!stack && process.env.CI === "true") throw new Error("CI=true but no local Supabase stack in .env.local");
    });
    test.skip(!stack, "needs the local Supabase stack (npm run supabase:start:worktree)");

    // the admin's page streams its list, with live regions in it (#96: where the mismatch was seen in next dev)
    test("the menu in the admin", async ({ page, adminCookies }) => {
      await page.context().addCookies(adminCookies);
      const problems = await watch(page);
      await throttleChunks(page);
      await page.goto("/uk/admin", { waitUntil: "commit" });
      const menu = page.getByRole("dialog");
      await tapUntilOpen(page.locator("header").getByRole("button", { name: ukNav.openMenu }), menu);
      await expect(menu.getByRole("navigation", { name: ukNav.main })).toBeVisible();
      await expectNoProblems(page, problems);
      await menu.getByRole("button", { name: ukNav.closeMenu }).click();
      await expect(menu).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: ukAdmin.list.title })).toBeVisible();
    });
  });
});

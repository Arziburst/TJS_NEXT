// The header's account menu from the keyboard (#105): its Base UI menu loads on first use, and the keyboard
// still opens it as Base UI's own trigger does — Enter and ArrowDown, with the focus on the first item.
import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
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
let userId: string | undefined;

async function signIn(page: Page): Promise<void> {
  const email = `e2e-105-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await db!.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  // from its own client address: the auth rate limit is per IP
  await page
    .context()
    .setExtraHTTPHeaders({ "x-forwarded-for": `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}` });
  await page.goto(`/uk/sign-in-and-up?next=${encodeURIComponent("/uk/shop")}`);
  await page.waitForLoadState("networkidle");
  const form = page.getByRole("tabpanel", { name: "Увійти" });
  await form.getByLabel("Ел. пошта").fill(email);
  await form.getByLabel("Пароль").fill(password);
  await form.getByRole("button", { name: "Увійти" }).click();
  await page.waitForURL("/uk/shop");
}

test.describe("the account menu from the keyboard", () => {
  test.skip(!stack, "needs the local Supabase stack");
  test.skip(({ isMobile }) => isMobile, "the header's account slot shows from 1024px up");

  test.afterAll(async () => {
    if (userId) await db!.auth.admin.deleteUser(userId);
  });

  test("Enter and ArrowDown open it with the focus on the first item; Escape gives it back", async ({ page }) => {
    await signIn(page);
    const trigger = page.locator("header [data-slot=account]").getByRole("button", { name: ukNav.account });
    const firstItem = page.getByRole("menu").getByRole("menuitem").first();

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(firstItem).toBeFocused();
    await expect(firstItem).toHaveAccessibleName(ukNav.profile);
    await expect(firstItem).toHaveAttribute("data-highlighted", "");
    // the arrows move on from it
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: ukNav.orders })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(firstItem).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });
});

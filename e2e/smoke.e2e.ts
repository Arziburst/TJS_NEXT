import { expect, test } from "@playwright/test";

test("home route renders with no console or page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  const response = await page.goto("/");
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(errors).toEqual([]);
});

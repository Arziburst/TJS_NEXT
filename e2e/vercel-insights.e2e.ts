import { expect, test } from "@playwright/test";

// Web Analytics and Speed Insights load only on a Vercel production deployment (VERCEL_ENV=production); a build
// outside Vercel, as CI serves it, never loads their scripts or reports a visit
const VERCEL_SCRIPT = /\/_vercel\/(insights|speed-insights)\/|va\.vercel-scripts\.com/;

test("a build outside Vercel production loads no Vercel Analytics or Speed Insights", async ({ page }) => {
  const vercelRequests: string[] = [];
  page.on("request", (request) => {
    if (VERCEL_SCRIPT.test(request.url())) vercelRequests.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await expect(page.locator("script[src*='/_vercel/'], script[src*='vercel-scripts']")).toHaveCount(0);
  expect(vercelRequests).toEqual([]);
});

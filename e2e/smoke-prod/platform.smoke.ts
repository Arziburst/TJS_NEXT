// Read-only checks of a deployment (e2e/smoke-prod/playwright.config.ts): crawler files, share images and the
// security headers (#31, src/lib/security/headers.ts).
import { expect, test } from "@playwright/test";

const isHttps = (process.env.E2E_BASE_URL ?? "").startsWith("https://");

test("robots.txt and the sitemap", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const sitemapUrl = (await robots.text()).match(/^Sitemap:\s*(\S+)/im)?.[1];
  expect(sitemapUrl, "robots.txt names the sitemap").toBeTruthy();

  const sitemap = await request.get(new URL(sitemapUrl!).pathname);
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("<urlset");
  // products are listed in the locales they have their own texts in
  expect(xml).toMatch(/\/[a-z]{2}\/product\//);
});

test("the share image of the home page", async ({ page, request }) => {
  await page.goto("/en");
  const image = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  expect(image, "og:image").toBeTruthy();
  const response = await request.get(new URL(image!).pathname + new URL(image!).search);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(/^image\//);
});

test("the security headers on a page and an API route", async ({ request }) => {
  for (const path of ["/en", "/api/cron/fx-rates"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBeLessThan(500);
    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";
    for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) {
      expect(csp, `${path}: ${directive}`).toContain(directive);
    }
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    if (isHttps) expect(headers["strict-transport-security"], path).toMatch(/max-age=\d+/);
  }
  const page = await request.get("/en");
  expect(page.headers()["content-security-policy-report-only"]).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
});

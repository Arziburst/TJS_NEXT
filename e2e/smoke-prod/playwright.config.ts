import { defineConfig, devices } from "@playwright/test";

/*
 * The production smoke suite (#31): proves a deployment works, against any running app, without writing data —
 * the guest cart lives in a cookie, nothing is ordered, nobody signs in or up. It needs no local stack and
 * starts no server: E2E_BASE_URL names the deployment.
 *
 *   E2E_BASE_URL=https://tjs-next.vercel.app npx playwright test -c e2e/smoke-prod/playwright.config.ts
 *
 * GitHub: Actions → "Production smoke" → Run workflow with the URL (.github/workflows/smoke-prod.yml).
 */
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error("E2E_BASE_URL is required: the deployment to check, e.g. https://tjs-next.vercel.app");

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.smoke.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // a deployment's cold start can be slow; one retry tells a flake from a broken deploy
  retries: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
});

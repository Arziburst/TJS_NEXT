import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;
const port = Number(process.env.E2E_PORT || 3000);
const externalBaseURL = process.env.E2E_BASE_URL || undefined;
const baseURL = externalBaseURL ?? `http://localhost:${port}`;
// E2E_SERVER=start serves the production build (`npm run build` first), as CI does; default `next dev`.
const serverScript = process.env.E2E_SERVER === "start" ? "start" : "dev";
// The Nova Post fixture server (e2e/nova-post-mock.ts) the app's delivery client talks to instead of the real API
const novaPostMockPort = Number(process.env.NOVA_POST_MOCK_PORT || port + 1000);
const novaPostMockKey = "e2e-fixture-key";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    // products for the catalog flows (e2e/catalog-fixtures.ts), written to the local stack and removed after
    { name: "catalog-fixtures", testMatch: "catalog.setup.ts", teardown: "catalog-fixtures-teardown" },
    { name: "catalog-fixtures-teardown", testMatch: "catalog.teardown.ts" },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["catalog-fixtures"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      dependencies: ["catalog-fixtures"],
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : [
        {
          command: "node e2e/nova-post-mock.ts",
          url: `http://127.0.0.1:${novaPostMockPort}/v.1.0/health`,
          reuseExistingServer: false,
          timeout: 30_000,
          env: { NOVA_POST_MOCK_PORT: String(novaPostMockPort), NOVA_POST_MOCK_KEY: novaPostMockKey },
        },
        {
          command: `npm run ${serverScript} -- --port ${port}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          // the shell tests use the /ui-kit showcase; a production build needs the flag at build time too (CI).
          // The Nova Post key and URL are read at request time and point at the fixture server.
          env: {
            TJS_UI_KIT: "true",
            NOVA_POST_API_KEY: novaPostMockKey,
            NOVA_POST_API_URL: `http://127.0.0.1:${novaPostMockPort}/v.1.0`,
          },
        },
      ],
});

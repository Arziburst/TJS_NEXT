import { defineConfig, devices } from "@playwright/test";
import { RENDER_HOLD_DIR } from "./e2e/render-hold";

const isCI = !!process.env.CI;
const port = Number(process.env.E2E_PORT || 3000);
const externalBaseURL = process.env.E2E_BASE_URL || undefined;
const baseURL = externalBaseURL ?? `http://localhost:${port}`;
// E2E_SERVER=start serves the production build (`npm run build` first), as CI does; default `next dev`.
const serverScript = process.env.E2E_SERVER === "start" ? "start" : "dev";
// The Nova Post fixture server (e2e/nova-post-mock.ts) the app's delivery client talks to instead of the real API
const novaPostMockPort = Number(process.env.NOVA_POST_MOCK_PORT || port + 1000);
const novaPostMockKey = "e2e-fixture-key";
// The AI Gateway stand-in (e2e/ai-gateway-mock.ts) the admin's machine translation talks to
const aiGatewayMockPort = Number(process.env.AI_GATEWAY_MOCK_PORT || port + 1500);
const aiGatewayMockKey = "e2e-gateway-key";
// The Telegram and Resend stand-in (e2e/notifications-mock.ts) the app sends the order notifications to; the
// e2e tests read what it got (e2e/notifications.ts computes the same port)
const notificationsMockPort = Number(process.env.NOTIFICATIONS_MOCK_PORT || port + 2000);
const notificationsMockToken = "e2e-bot-token";
const notificationsMockKey = "e2e-resend-key";
// e2e files that write products of their own to the catalog (see the projects below)
const CATALOG_WRITERS = [
  "**/cart.e2e.ts",
  "**/admin.e2e.ts",
  "**/favorites.e2e.ts",
  "**/checkout.e2e.ts",
  "**/translation.e2e.ts",
  // a ring with a size of its own, ordered with a saved address (#28)
  "**/account.e2e.ts",
  "**/admin-orders.e2e.ts",
  // a product of its own, renamed while a storefront render of it is held (#93)
  "**/cache-race.e2e.ts",
];

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
      testIgnore: CATALOG_WRITERS,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      dependencies: ["catalog-fixtures"],
      testIgnore: CATALOG_WRITERS,
    },
    // tests that publish, sell or unpublish products of their own run after the listings were checked, so the
    // catalog tests always count exactly the seed and the catalog fixtures
    {
      name: "desktop-catalog-writers",
      testMatch: CATALOG_WRITERS,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["desktop", "mobile"],
    },
    {
      name: "mobile-catalog-writers",
      testMatch: CATALOG_WRITERS,
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
      dependencies: ["desktop", "mobile"],
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
          command: "node e2e/ai-gateway-mock.ts",
          url: `http://127.0.0.1:${aiGatewayMockPort}/health`,
          reuseExistingServer: false,
          timeout: 30_000,
          env: { AI_GATEWAY_MOCK_PORT: String(aiGatewayMockPort), AI_GATEWAY_MOCK_KEY: aiGatewayMockKey },
        },
        {
          command: "node e2e/notifications-mock.ts",
          url: `http://127.0.0.1:${notificationsMockPort}/health`,
          reuseExistingServer: false,
          timeout: 30_000,
          env: {
            NOTIFICATIONS_MOCK_PORT: String(notificationsMockPort),
            NOTIFICATIONS_MOCK_BOT_TOKEN: notificationsMockToken,
            NOTIFICATIONS_MOCK_API_KEY: notificationsMockKey,
          },
        },
        {
          command: `npm run ${serverScript} -- --port ${port}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
          // the shell tests use the /ui-kit showcase; a production build needs the flag at build time too (CI).
          // The delivery tests answer Nova Poshta from the recorded fixtures (server-side, read at run time), and
          // Nova Post from the fixture server above (key and URL read at request time), and the machine translation
          // from the AI Gateway stand-in (read at request time too).
          env: {
            TJS_UI_KIT: "true",
            NOVA_POSHTA_FIXTURES: "true",
            NOVA_POST_API_KEY: novaPostMockKey,
            NOVA_POST_API_URL: `http://127.0.0.1:${novaPostMockPort}/v.1.0`,
            AI_GATEWAY_API_KEY: aiGatewayMockKey,
            AI_GATEWAY_BASE_URL: `http://127.0.0.1:${aiGatewayMockPort}/v4/ai`,
            // the order notifications go to the stand-in above (read at request time); the flag lets them be sent
            NOTIFICATIONS_SEND: "true",
            TELEGRAM_BOT_TOKEN: notificationsMockToken,
            TELEGRAM_CHAT_ID: "-1001234567890",
            TELEGRAM_API_BASE_URL: `http://127.0.0.1:${notificationsMockPort}`,
            RESEND_API_KEY: notificationsMockKey,
            RESEND_API_URL: `http://127.0.0.1:${notificationsMockPort}`,
            EMAIL_FROM: "TJS e2e <orders@example.test>",
            // the test-only hold of a storefront render (src/lib/catalog/render-hold.ts, e2e/cache-race.e2e.ts)
            TJS_TEST_RENDER_HOLD_DIR: RENDER_HOLD_DIR,
          },
        },
      ],
});

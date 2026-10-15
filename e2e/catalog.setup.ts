import { test as setup } from "@playwright/test";
import { insertCatalogFixtures } from "./catalog-fixtures";

setup("insert the catalog fixtures on the local stack", async () => {
  const inserted = await insertCatalogFixtures();
  // without a local stack (e.g. E2E_BASE_URL on a deployment) nothing is written; catalog.e2e.ts then fails
  setup.skip(!inserted, "no local Supabase stack in .env.local");
});

import { test as teardown } from "@playwright/test";
import { deleteCatalogFixtures } from "./catalog-fixtures";

teardown("delete the catalog fixtures", async () => {
  await deleteCatalogFixtures();
});

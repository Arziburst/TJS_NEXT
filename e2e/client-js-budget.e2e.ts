import { expect, test } from "@playwright/test";
import { firstLoadScripts, gzipSize, overBudget, type RouteSize } from "./client-js";

/*
 * The client JavaScript budget (#105, docs/standards.md §5): the gzip size of the scripts a page loads before
 * it hydrates. Lighthouse mobile scores the shop's pages ≥ 90 only while this stays small: every byte loaded
 * before the largest paint delays it on a mid-range phone. Raise a budget only with a bundle audit in the PR.
 */
const BUDGETS_KB: Record<string, number> = { home: 180, shop: 190, product: 190 };
// a seeded product (supabase/seed.sql)
const ROUTES: Record<string, string> = {
  home: "/uk",
  shop: "/uk/shop",
  product: "/uk/product/serezhky-krapli-z-koralom",
};

test("first-load JS of the home, the shop and a product page stays within its budget", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the bundle is the same for every viewport");
  // next dev serves unminified chunks; the budget is for the production build (CI: E2E_SERVER=start)
  test.skip(process.env.E2E_SERVER !== "start" && !process.env.E2E_BASE_URL, "measures the production build only");

  const sizes: RouteSize[] = [];
  for (const [route, path] of Object.entries(ROUTES)) {
    const page = await request.get(path);
    expect(page.status(), path).toBe(200);
    const scripts = firstLoadScripts(await page.text());
    expect(scripts.length, `${path} names no scripts`).toBeGreaterThan(0);
    let bytes = 0;
    for (const src of scripts) {
      const script = await request.get(src);
      expect(script.status(), src).toBe(200);
      bytes += gzipSize(await script.body());
    }
    sizes.push({ route, kilobytes: bytes / 1024 });
  }

  await testInfo.attach("first-load-js.json", { body: JSON.stringify(sizes, null, 2), contentType: "application/json" });
  expect(overBudget(sizes, BUDGETS_KB)).toEqual([]);
});

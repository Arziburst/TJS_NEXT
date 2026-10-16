// The legacy shop's URLs (coordinator/research/frontend.md §2) answer a 308 to their page in the visitor's
// locale (#31). Two seed products get a legacy id for the test, as the importer (scripts/import/) sets them, and
// lose it afterwards; each project takes its own two, so the projects never touch each other's rows.
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { localStack } from "../tests/catalog/local-stack";

const stack = localStack();
const db = stack ? createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } }) : null;

type Imported = { id: string; legacyId: string; slugs: Record<string, string> };

/**
 * Gives two seed products of this project a legacy id, as the importer would. In the test itself, not in a
 * beforeAll: with fullyParallel every worker runs the hooks, and one worker's afterAll would clear the ids
 * while another's test reads them.
 */
async function importTwo(projectName: string): Promise<Imported[]> {
  const { data, error } = await db!
    .from("products")
    .select("id, sku, product_translations(locale, slug)")
    .eq("status", "published")
    .is("deleted_at", null)
    .not("sku", "like", "E2E-%")
    .order("sku");
  if (error) throw error;
  const offset = projectName.startsWith("mobile") ? 2 : 0;
  const imported = data.slice(offset, offset + 2).map((row, i) => ({
    id: row.id,
    // a MongoDB ObjectId per project and product
    legacyId: `e2e31${offset + i}`.padEnd(24, "0"),
    slugs: Object.fromEntries(row.product_translations.map((t) => [t.locale, t.slug])),
  }));
  expect(imported).toHaveLength(2);
  for (const product of imported) {
    const { error: updateError } = await db!.from("products").update({ legacy_id: product.legacyId }).eq("id", product.id);
    if (updateError) throw updateError;
  }
  return imported;
}

test.describe("legacy URLs", () => {
  async function location(request: import("@playwright/test").APIRequestContext, path: string, headers = {}) {
    const response = await request.get(path, { headers, maxRedirects: 0 });
    expect(response.status(), path).toBe(308);
    return new URL(response.headers()["location"], "http://x").pathname;
  }

  test("the legacy pages go to their new path in the visitor's locale", async ({ request }) => {
    const uk = { "accept-language": "uk-UA,uk;q=0.9,en;q=0.5" };
    const cases: [string, string][] = [
      ["/shop/see-all", "/uk/shop"],
      ["/shop", "/uk/shop"],
      ["/shop/necklace", "/uk/shop/necklaces"],
      ["/shop/brooch", "/uk/shop/brooches"],
      ["/shop/earrings", "/uk/shop/earrings"],
      ["/shop/corals", "/uk/shop/corals"],
      ["/shop/no-such-type", "/uk/shop"],
      ["/about-us", "/uk/about"],
      ["/sign-in-and-up", "/uk/sign-in-and-up"],
      ["/cart", "/uk/cart"],
      ["/order-details", "/uk/checkout"],
      ["/add-item", "/uk/admin/products/new"],
      ["/orders", "/uk/admin/orders"],
    ];
    for (const [from, to] of cases) expect(await location(request, from, uk), from).toBe(to);
    // the locale cookie wins over the browser language; no language at all: the default
    expect(await location(request, "/about-us", { ...uk, cookie: "NEXT_LOCALE=de" })).toBe("/de/about");
    expect(await location(request, "/shop/rings", { "accept-language": "ja" })).toBe("/en/shop/rings");
  });

  test("a legacy product id goes to the product's localized page; an unknown one to the shop, never a 500", async ({ request, page }, testInfo) => {
    test.skip(!db, "needs the local Supabase stack (npm run supabase:start:worktree)");
    const imported = await importTwo(testInfo.project.name);
    try {
      const [first, second] = imported;
      expect(await location(request, `/product/${first.legacyId}`, { "accept-language": "uk" })).toBe(`/uk/product/${first.slugs.uk ?? first.slugs.en}`);
      expect(await location(request, `/product/${second.legacyId}`, { cookie: "NEXT_LOCALE=en" })).toBe(`/en/product/${second.slugs.en}`);
      expect(await location(request, `/product/${second.legacyId}/management`, { "accept-language": "en" })).toBe(`/en/admin/products/${second.id}`);
      expect(await location(request, "/product/0123456789abcdef01234567", { "accept-language": "en" })).toBe("/en/shop");
      expect(await location(request, "/product/not-a-mongo-id", { "accept-language": "en" })).toBe("/en/shop");

      // a browser follows it to the product page itself
      const response = await page.goto(`/product/${first.legacyId}`);
      expect(response?.status()).toBe(200);
      expect(new URL(page.url()).pathname).toMatch(/^\/[a-z]{2}\/product\/[a-z0-9-]+$/);
    } finally {
      for (const product of imported) await db!.from("products").update({ legacy_id: null }).eq("id", product.id);
    }
  });
});

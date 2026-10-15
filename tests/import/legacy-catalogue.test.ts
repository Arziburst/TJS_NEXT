// The target guard of the legacy importer and its report, without a stack.
import { describe, expect, it } from "vitest";
import { resolveTarget } from "../../scripts/import/legacy-catalogue.mjs";
import { renderReport, summarize } from "../../scripts/import/legacy-report.mjs";

const NO_FILE = { envFile: "does-not-exist.env" };
const KEY = "service-role-key";

describe("resolveTarget", () => {
  it("accepts a loopback stack", () => {
    for (const url of ["http://127.0.0.1:41691", "http://localhost:54321", "http://[::1]:54321"]) {
      const { target } = resolveTarget({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: KEY }, NO_FILE);
      expect(target).toMatchObject({ url, serviceRoleKey: KEY, loopback: true, source: "environment" });
    }
  });

  it("refuses a non-loopback URL without --production", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SERVICE_ROLE_KEY: KEY };
    expect(resolveTarget(env, NO_FILE)).toEqual({
      target: null,
      reason: "refusing the non-loopback Supabase URL abc.supabase.co without --production",
    });
    expect(resolveTarget(env, { ...NO_FILE, production: false }).target).toBeNull();
  });

  it("accepts a non-loopback URL only with --production", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SERVICE_ROLE_KEY: KEY };
    expect(resolveTarget(env, { ...NO_FILE, production: true }).target).toMatchObject({ loopback: false, host: "abc.supabase.co" });
  });

  it("refuses without both the URL and the service-role key", () => {
    expect(resolveTarget({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1" }, NO_FILE).target).toBeNull();
    expect(resolveTarget({ SUPABASE_SERVICE_ROLE_KEY: KEY }, NO_FILE).target).toBeNull();
  });
});

const product = (overrides = {}) => ({
  legacyId: "64e3d6fc0fffc723ced6f133",
  category: "earrings",
  fulfillment: "one_of_a_kind",
  priceUah: 3800,
  priceUsd: "84.48",
  weight: 5,
  weightMissing: false,
  photos: 2,
  titles: { uk: "Сережки", en: "Earrings | pearls" },
  slugs: { uk: "serezhky", en: "earrings" },
  sources: { uk: "machine", en: "machine" },
  ...overrides,
});

describe("the import report", () => {
  const products = [
    product(),
    product({
      legacyId: "a".repeat(24),
      fulfillment: "made_to_order",
      priceUah: 250,
      priceUsd: "5.56",
      weight: 0,
      sources: { uk: "human", en: "machine" },
    }),
    product({ legacyId: "b".repeat(24), category: "rings", priceUah: 12800, priceUsd: "284.57", weight: 0, weightMissing: true }),
  ];

  it("counts per category and kind, the price range and the weight-0 products", () => {
    const s = summarize(products);
    expect(s.perCategory).toEqual({
      earrings: { made_to_order: 1, one_of_a_kind: 1 },
      rings: { made_to_order: 0, one_of_a_kind: 1 },
    });
    expect([s.total, s.madeToOrder, s.oneOfAKind, s.photos]).toEqual([3, 1, 2, 6]);
    expect([s.cheapest?.priceUsd, s.dearest?.priceUsd]).toEqual(["5.56", "284.57"]);
    expect(s.weightZero.map((p) => p.legacyId)).toEqual(["a".repeat(24), "b".repeat(24)]);
    expect(s.humanUk).toBe(1);
  });

  it("states the rate and lists every product with its legacy id, category, kind and both prices", () => {
    const report = renderReport({
      exportName: "legacy-test",
      target: "127.0.0.1 (local)",
      generatedAt: "2026-10-15T12:00:00.000Z",
      rate: { rate: "44.9801", rateDate: "2026-10-15" },
      products,
      orphans: { registry: 3, archive: 4 },
      changes: { "products created": 3 },
    });
    expect(report).toContain("1 USD = 44.9801 UAH, NBU rate of 2026-10-15");
    expect(report).toContain("Prices: 5.56–284.57 USD (250–12800 UAH).");
    expect(report).toContain("Weight 0: 2 products (1 had no weight at all)");
    expect(report).toContain("the 1 made-to-order products have none yet");
    expect(report).toContain("except the 1 uk texts that were already the owner's Ukrainian");
    expect(report).toContain("| 64e3d6fc0fffc723ced6f133 | earrings | one of a kind | 3800 | 84.48 | 5 | 2 | Earrings \\| pearls |");
    expect(report).toContain(`| ${"b".repeat(24)} | rings | one of a kind | 12800 | 284.57 | 0 (none) |`);
    expect(report).toContain("3 entries of the legacy media registry and 4 archived Cloudinary files");
  });
});

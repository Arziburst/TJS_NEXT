// The product page reads against the local stack and its seed (supabase/seed.sql), under the anon role and
// RLS. Skipped when no local stack is configured.
import { describe, expect, it, vi } from "vitest";
import { localStack } from "./local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("product page reads on the local stack", async () => {
  if (!stack) return;
  const { findSlugMatches, getProductSlugs } = await import("@/lib/catalog/product");

  it("finds a slug with all the slugs of its product", async () => {
    const result = await findSlugMatches("korallen-tropfenohrringe");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ productId: "a0000000-0000-4000-8000-000000000001", locale: "de" });
    expect(result.data[0]?.productSlugs.map((t) => t.locale).sort()).toEqual(["de", "en", "pl", "uk"]);
  });

  it("finds no draft, archived or deleted product", async () => {
    for (const slug of ["cocktail-ring-with-stone", "enamel-bird-brooch", "steel-cuff-bracelet"]) {
      const result = await findSlugMatches(slug);
      expect(result).toEqual({ ok: true, data: [] });
    }
  });

  it("rejects a malformed slug without a query", async () => {
    expect(await findSlugMatches("Bad_Slug")).toEqual({ ok: false, reason: "invalid" });
  });

  it("lists one slug per published product in a locale, the fallback slug where it is untranslated", async () => {
    const result = await getProductSlugs("de");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toHaveLength(11);
    expect(result.data).toContain("korallen-tropfenohrringe");
    expect(result.data).toContain("pearl-stud-earrings");
    expect(result.data).not.toContain("coral-drop-earrings");
    expect(result.data).not.toContain("cocktail-ring-with-stone");
  });
});

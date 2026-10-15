// The catalog data layer against the local stack and its seed (supabase/seed.sql): real PostgREST queries
// under the anon role and RLS. Skipped when no local stack is configured.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "./local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("catalog data layer on the local stack", async () => {
  // a skipped describe still runs its body to collect the tests: nothing below may touch the stack
  if (!stack) return;
  const { getCategories, getProducts, getProductBySlug } = await import("@/lib/catalog");
  const admin = createClient<Database>(stack!.url, stack!.serviceRoleKey, { auth: { persistSession: false } });

  const EARRINGS_1 = "a0000000-0000-4000-8000-000000000001";
  const imageIds: string[] = [];

  beforeAll(async () => {
    const { data, error } = await admin
      .from("product_images")
      .insert([
        { product_id: EARRINGS_1, storage_path: `it/${crypto.randomUUID()}/2.jpg`, position: 2, width: 600, height: 600 },
        { product_id: EARRINGS_1, storage_path: `it/${crypto.randomUUID()}/1.jpg`, position: 1, width: 800, height: 1000 },
      ])
      .select("id, position");
    if (error) throw error;
    const first = data.find((r) => r.position === 1)!;
    imageIds.push(...data.map((r) => r.id));
    const alts = await admin.from("product_image_alts").insert({ image_id: first.id, locale: "uk", alt: "Перше фото" });
    if (alts.error) throw alts.error;
  });

  afterAll(async () => {
    if (imageIds.length > 0) await admin.from("product_images").delete().in("id", imageIds);
  });

  it("lists the six categories in order, named per locale", async () => {
    const de = await getCategories("de");
    expect(de.ok && de.data.map((c) => [c.slug, c.name, c.nameSource])).toEqual([
      ["earrings", "Ohrringe", "machine"],
      ["necklaces", "Halsketten", "machine"],
      ["bracelets", "Armbänder", "machine"],
      ["corals", "Korallen", "machine"],
      ["rings", "Ringe", "machine"],
      ["brooches", "Broschen", "machine"],
    ]);
    const en = await getCategories("en");
    expect(en.ok && en.data.every((c) => c.nameSource === "human")).toBe(true);
  });

  it("lists published products only, sold pieces included, newest first", async () => {
    const result = await getProducts({ locale: "en" }, "newest", { page: 1, pageSize: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(11);
    const skus = result.data.items.map((p) => p.sku);
    expect(skus[0]).toBe("TEST-001");
    expect(skus).toContain("TEST-008");
    expect(skus).not.toContain("TEST-011"); // draft
    expect(skus).not.toContain("TEST-013"); // archived
    expect(skus).not.toContain("TEST-014"); // soft-deleted
    expect(result.data.items.find((p) => p.sku === "TEST-008")?.availability).toBe("sold");
  });

  it("filters by category, fulfillment and availability", async () => {
    const earrings = await getProducts({ locale: "en", categorySlug: "earrings" }, "newest", { page: 1, pageSize: 50 });
    expect(earrings.ok && earrings.data.items.map((p) => p.sku)).toEqual(["TEST-001", "TEST-002", "TEST-003"]);

    const unique = await getProducts({ locale: "en", fulfillment: "one_of_a_kind" }, "newest", { page: 1, pageSize: 50 });
    expect(unique.ok && unique.data.items.map((p) => p.sku).sort()).toEqual(["TEST-003", "TEST-005", "TEST-008", "TEST-009"]);

    const buyable = await getProducts({ locale: "en", availability: ["available"] }, "newest", { page: 1, pageSize: 50 });
    expect(buyable.ok && buyable.data.total).toBe(9);

    const none = await getProducts({ locale: "en", categorySlug: "no-such-category" }, "newest", { page: 1, pageSize: 50 });
    expect(none).toEqual({ ok: true, data: { items: [], total: 0, page: 1, pageSize: 50 } });
  });

  it("sorts by price in cents and paginates", async () => {
    const asc = await getProducts({ locale: "en" }, "price_asc", { page: 1, pageSize: 2 });
    expect(asc.ok && asc.data.items.map((p) => [p.sku, p.priceUsdMinor])).toEqual([
      ["TEST-010", 1690],
      ["TEST-002", 1850],
    ]);
    const desc = await getProducts({ locale: "en" }, "price_desc", { page: 1, pageSize: 1 });
    expect(desc.ok && desc.data.items[0]?.priceUsdMinor).toBe(5490);

    const last = await getProducts({ locale: "en" }, "newest", { page: 3, pageSize: 5 });
    expect(last.ok && [last.data.items.length, last.data.total]).toEqual([1, 11]);
    const past = await getProducts({ locale: "en" }, "newest", { page: 4, pageSize: 5 });
    expect(past).toEqual({ ok: true, data: { items: [], total: 11, page: 4, pageSize: 5 } });
  });

  it("uses the locale's translation and falls back to en", async () => {
    const result = await getProducts({ locale: "de", categorySlug: "earrings" }, "newest", { page: 1, pageSize: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first, second] = result.data.items;
    expect(first?.translation).toMatchObject({ locale: "de", slug: "korallen-tropfenohrringe", isFallback: false, source: "machine" });
    expect(first?.translation.reviewedAt).not.toBeNull();
    expect(second?.translation).toMatchObject({ locale: "en", slug: "pearl-stud-earrings", isFallback: true });
  });

  it("returns images in order with public URLs, sizes and alts", async () => {
    const result = await getProductBySlug("uk", "serezhky-krapli-z-koralom");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // the images this test inserted, in gallery order (npm run seed:images may have added others)
    const inserted = result.data.images.filter((i) => imageIds.includes(i.id));
    expect(inserted.map((i) => [i.width, i.height, i.alt])).toEqual([
      [800, 1000, "Перше фото"],
      [600, 600, "Сережки-краплі з коралом на бежевому тлі"],
    ]);
    expect(inserted[0]?.url).toMatch(/\/storage\/v1\/object\/public\/product-images\/it\/.+\/1\.jpg$/);
    expect(result.data).toMatchObject({
      sku: "TEST-001",
      materials: "Латунь, золотисте покриття, синтетичний корал",
      care: "Берегти від вологи; зберігати окремо",
    });
  });

  it("finds a product by slug, with en fallback and the localized slug for redirects", async () => {
    const fallback = await getProductBySlug("de", "pearl-stud-earrings");
    expect(fallback.ok && fallback.data.translation).toMatchObject({ locale: "en", isFallback: true });

    const viaEnSlug = await getProductBySlug("de", "coral-drop-earrings");
    expect(viaEnSlug.ok && viaEnSlug.data.translation.slug).toBe("korallen-tropfenohrringe");

    const sold = await getProductBySlug("en", "red-coral-necklace");
    expect(sold.ok && sold.data.availability).toBe("sold");
  });

  it("does not find hidden or unknown products", async () => {
    for (const slug of ["cocktail-ring-with-stone", "enamel-bird-brooch", "steel-cuff-bracelet", "no-such-product"]) {
      expect(await getProductBySlug("en", slug)).toEqual({ ok: false, reason: "notFound" });
    }
  });
});

import { describe, expect, it } from "vitest";
import { localesFor, mapProduct, pickByLocale, usdTextToMinor, type ProductRow } from "./mappers";

describe("usdTextToMinor", () => {
  it.each([
    ["29.90", 2990],
    ["0.00", 0],
    ["16.9", 1690],
    ["45", 4500],
    ["99999999.99", 9999999999],
  ])("%s -> %i", (text, minor) => {
    expect(usdTextToMinor(text)).toBe(minor);
  });

  it.each(["", "-1.00", "1.234", "abc", "1e3", "29,90"])("rejects %j", (text) => {
    expect(usdTextToMinor(text)).toBeNull();
  });
});

describe("localesFor / pickByLocale", () => {
  it("asks for the locale and the fallback once", () => {
    expect(localesFor("de")).toEqual(["de", "en"]);
    expect(localesFor("en")).toEqual(["en"]);
  });

  it("prefers the requested locale, then the fallback", () => {
    const rows = [{ locale: "en", v: 1 }, { locale: "de", v: 2 }];
    expect(pickByLocale(rows, "de")?.v).toBe(2);
    expect(pickByLocale(rows, "pl")?.v).toBe(1);
    expect(pickByLocale([{ locale: "uk" }], "pl")).toBeNull();
  });
});

describe("mapProduct", () => {
  const row: ProductRow = {
    id: "p1",
    sku: "S-1",
    fulfillment: "one_of_a_kind",
    availability: "sold",
    lead_time_min_days: null,

    lead_time_max_days: null,

    length_mm: null,

    width_mm: null,

    height_mm: null,
    price_usd_text: "54.90",
    weight_g: 30,
    created_at: "2026-10-01T00:00:00Z",
    published_at: "2026-10-02T00:00:00Z",
    category: { id: "c1", slug: "corals" },
    product_translations: [
      {
        locale: "en",
        slug: "red-coral",
        title: "Red coral",
        description: "A strand",
        materials: "Coral",
        care: "Keep dry",
        clasp: null,
        lead_time_note: null,
        alt_text: "Red coral on beige",
        meta_title: null,
        meta_description: null,
        source: "human",
        reviewed_at: null,
      },
    ],
    product_images: [
      { id: "i2", storage_path: "p1/2.jpg", position: 2, width: 10, height: 20, blur_data_url: null, product_image_alts: [] },
      {
        id: "i1",
        storage_path: "p1/1.jpg",
        position: 1,
        width: 800,
        height: 1000,
        blur_data_url: "data:image/png;base64,AA==",
        product_image_alts: [{ locale: "de", alt: "Rote Koralle" }],
      },
    ],
    product_variants: [],
  };
  const urlFor = (path: string) => `https://cdn.test/${path}`;

  it("falls back to the en translation and marks it", () => {
    const p = mapProduct(row, "pl", urlFor);
    expect(p?.translation).toMatchObject({ locale: "en", slug: "red-coral", isFallback: true });
    expect(p?.priceUsdMinor).toBe(5490);
    expect(p?.availability).toBe("sold");
    expect([p?.materials, p?.care]).toEqual(["Coral", "Keep dry"]);
  });

  it("orders images by position and picks the alt per locale, then the product alt text", () => {
    const p = mapProduct(row, "de", urlFor);
    expect(p?.images.map((i) => [i.id, i.url, i.alt])).toEqual([
      ["i1", "https://cdn.test/p1/1.jpg", "Rote Koralle"],
      ["i2", "https://cdn.test/p1/2.jpg", "Red coral on beige"],
    ]);
  });

  it("maps the variants of made-to-order work with their prices, and lists the lowest one as from", () => {
    const variant = (id: string, position: number, delta: number, label: string) => ({
      id,
      position,
      sku_suffix: null,
      price_delta_usd_minor: delta,
      is_available: true,
      product_variant_translations: [{ locale: "uk", label }],
    });
    const sized: ProductRow = {
      ...row,
      fulfillment: "made_to_order",
      availability: "available",
      product_variants: [variant("v2", 1, 300, "18"), variant("v1", 0, -100, "16")],
    };
    const p = mapProduct(sized, "en", urlFor);
    expect(p?.variants.map((v) => [v.id, v.label, v.labelLocale, v.priceUsdMinor])).toEqual([
      ["v1", "16", "uk", 5390],
      ["v2", "18", "uk", 5790],
    ]);
    expect(p?.priceUsdMinor).toBe(5490);
    expect(p?.listPrice).toEqual({ usdMinor: 5390, from: true });
    // a one-of-a-kind piece never shows variants, and a product without any lists its own price
    expect(mapProduct({ ...sized, fulfillment: "one_of_a_kind" }, "en", urlFor)?.variants).toEqual([]);
    expect(mapProduct(row, "en", urlFor)?.listPrice).toEqual({ usdMinor: 5490, from: false });
  });

  it("drops a product without a usable translation or price", () => {
    expect(mapProduct({ ...row, product_translations: [] }, "en", urlFor)).toBeNull();
    expect(mapProduct({ ...row, price_usd_text: "oops" }, "en", urlFor)).toBeNull();
  });
});

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
    lead_time_days: null,
    price_usd_text: "54.90",
    weight_g: 30,
    materials: "Coral",
    care: "Keep dry",
    created_at: "2026-10-01T00:00:00Z",
    published_at: "2026-10-02T00:00:00Z",
    category: { id: "c1", slug: "corals" },
    product_translations: [
      {
        locale: "en",
        slug: "red-coral",
        title: "Red coral",
        description: "A strand",
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
  };
  const urlFor = (path: string) => `https://cdn.test/${path}`;

  it("falls back to the en translation and marks it", () => {
    const p = mapProduct(row, "pl", urlFor);
    expect(p?.translation).toMatchObject({ locale: "en", slug: "red-coral", isFallback: true });
    expect(p?.priceUsdMinor).toBe(5490);
    expect(p?.availability).toBe("sold");
  });

  it("orders images by position and picks the alt per locale, then the product alt text", () => {
    const p = mapProduct(row, "de", urlFor);
    expect(p?.images.map((i) => [i.id, i.url, i.alt])).toEqual([
      ["i1", "https://cdn.test/p1/1.jpg", "Rote Koralle"],
      ["i2", "https://cdn.test/p1/2.jpg", "Red coral on beige"],
    ]);
  });

  it("drops a product without a usable translation or price", () => {
    expect(mapProduct({ ...row, product_translations: [] }, "en", urlFor)).toBeNull();
    expect(mapProduct({ ...row, price_usd_text: "oops" }, "en", urlFor)).toBeNull();
  });
});

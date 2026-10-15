// The rules of the legacy catalogue import (scripts/import/legacy-mapping.mjs), on synthetic legacy products.
import { describe, expect, it } from "vitest";
import {
  CATEGORY_BY_LEGACY_TYPE,
  byCreation,
  categorySlugOf,
  cloudinaryFile,
  kindOf,
  parseLegacyProducts,
  productRowOf,
  slugify,
  sourceHash,
  storagePathOf,
  uahToUsd,
  uniqueSlugs,
  weightOf,
} from "../../scripts/import/legacy-mapping.mjs";

const legacy = (overrides: Record<string, unknown> = {}) => ({
  _id: { $oid: "64e3d6fc0fffc723ced6f133" },
  weight: { $numberInt: "0" },
  available: true,
  images: [
    "https://res.cloudinary.com/tjstore/image/upload/v1692653513/oldsc94wylzdo7nfrniw.jpg",
    "https://res.cloudinary.com/tjstore/image/upload/v1692653514/second.jpg",
  ],
  views: { $numberInt: "5" },
  title: "Test title",
  description: "Test description",
  type: "earrings",
  price: { $numberInt: "3800" },
  discount: { $numberInt: "0" },
  created: { $date: { $numberLong: "1692653308628" } },
  ...overrides,
});

const CATEGORY_IDS = Object.fromEntries(Object.values(CATEGORY_BY_LEGACY_TYPE).map((slug) => [slug, `id-${slug}`]));

describe("parseLegacyProducts", () => {
  it("reads the EJSON of mongoexport", () => {
    const [product] = parseLegacyProducts([legacy()]);
    expect(product).toEqual({
      legacyId: "64e3d6fc0fffc723ced6f133",
      title: "Test title",
      description: "Test description",
      type: "earrings",
      priceUah: 3800,
      weight: 0,
      available: true,
      images: legacy().images,
      created: new Date(1692653308628),
    });
  });

  it("keeps a missing weight as missing and reads fractional weights", () => {
    const withoutWeight: Record<string, unknown> = legacy();
    delete withoutWeight.weight;
    expect(parseLegacyProducts([withoutWeight])[0].weight).toBeNull();
    expect(parseLegacyProducts([legacy({ weight: { $numberDouble: "11.23" } })])[0].weight).toBe(11.23);
  });

  it("refuses a product it would have to guess about", () => {
    expect(() => parseLegacyProducts([legacy({ images: [] })])).toThrow(/images/);
    expect(() => parseLegacyProducts([legacy({ images: ["https://example.com/a.jpg"] })])).toThrow(/Cloudinary/);
    expect(() => parseLegacyProducts([legacy({ _id: { $oid: "nope" } })])).toThrow(/_id/);
    expect(() => parseLegacyProducts([legacy({ price: "3800" })])).toThrow(/price/);
  });
});

describe("category", () => {
  it("maps every legacy type to an existing category row", () => {
    expect(categorySlugOf("bracelets")).toBe("bracelets");
    expect(categorySlugOf("brooch")).toBe("brooches");
    expect(categorySlugOf("corals")).toBe("corals");
    expect(categorySlugOf("earrings")).toBe("earrings");
    expect(categorySlugOf("necklace")).toBe("necklaces");
    expect(categorySlugOf("rings")).toBe("rings");
  });

  it("refuses an unknown type", () => {
    expect(() => categorySlugOf("see-all")).toThrow(/unknown legacy type/);
  });
});

describe("kind (D34)", () => {
  it("maps available false (Only order) to made to order, with no lead time written", () => {
    expect(kindOf(false)).toEqual({ fulfillment: "made_to_order", availability: "available" });
    expect(productRowOf(parseLegacyProducts([legacy({ available: false })])[0], { rate: "40", categoryIds: CATEGORY_IDS }))
      .not.toHaveProperty("lead_time_days");
  });

  it("maps available true to an available one-of-a-kind piece", () => {
    expect(kindOf(true)).toEqual({ fulfillment: "one_of_a_kind", availability: "available" });
  });
});

describe("price UAH → USD (D33)", () => {
  it("divides by the NBU rate and keeps the cent, half up", () => {
    expect(uahToUsd(3800, "44.9801")).toBe("84.48"); // 84.4818…
    expect(uahToUsd(250, "44.9801")).toBe("5.56"); // 5.5580…
    expect(uahToUsd(12800, "44.9801")).toBe("284.57"); // 284.5703…
    expect(uahToUsd(1, "8")).toBe("0.13"); // 0.125 rounds up
    expect(uahToUsd(0, "41.5")).toBe("0.00");
  });

  it("refuses a fractional or negative price and a bad rate", () => {
    expect(() => uahToUsd(10.5, "41")).toThrow(RangeError);
    expect(() => uahToUsd(-1, "41")).toThrow(RangeError);
    expect(() => uahToUsd(10, "0")).toThrow(RangeError);
    expect(() => uahToUsd(10, "abc")).toThrow(RangeError);
  });
});

describe("weight", () => {
  it("keeps the given weight, 0 stays 0, a missing one is the legacy default 0", () => {
    expect(weightOf(11.23)).toBe(11.23);
    expect(weightOf(0)).toBe(0);
    expect(weightOf(null)).toBe(0);
  });
});

describe("productRowOf", () => {
  it("publishes the product with its creation date as created_at and published_at", () => {
    const [product] = parseLegacyProducts([legacy({ type: "necklace", available: false, weight: { $numberInt: "39" } })]);
    expect(productRowOf(product, { rate: "44.9801", categoryIds: CATEGORY_IDS })).toEqual({
      legacy_id: "64e3d6fc0fffc723ced6f133",
      category_id: "id-necklaces",
      status: "published",
      fulfillment: "made_to_order",
      availability: "available",
      price_usd: "84.48",
      weight_g: 39,
      created_at: "2023-08-21T21:28:28.628Z",
      published_at: "2023-08-21T21:28:28.628Z",
    });
  });

  it("refuses a category missing in the target", () => {
    const [product] = parseLegacyProducts([legacy({ type: "rings" })]);
    expect(() => productRowOf(product, { rate: "40", categoryIds: {} })).toThrow(/"rings" is missing/);
  });
});

describe("slugs", () => {
  it("transliterates Ukrainian by the national system", () => {
    expect(slugify("Сережки з барокових перлин", "uk")).toBe("serezhky-z-barokovykh-perlyn");
    expect(slugify("Намисто «Акоя»", "uk")).toBe("namysto-akoia");
    expect(slugify("Ялинка, їжак, юшка, Згода, м’ята", "uk")).toBe("yalynka-yizhak-yushka-zghoda-miata");
    expect(slugify("Брошка-пташечка", "uk")).toBe("broshka-ptashechka");
  });

  it("makes English slugs of lowercase letters, digits and single hyphens", () => {
    expect(slugify("Earrings made of natural baroque pearls.", "en")).toBe("earrings-made-of-natural-baroque-pearls");
    expect(slugify("“Mouse” brooch — 24k gold", "en")).toBe("mouse-brooch-24k-gold");
    expect(slugify("Café crème", "en")).toBe("cafe-creme");
  });

  it("cuts a long slug at a word boundary and never returns an empty one", () => {
    const slug = slugify("Natural baroque pearl earrings with premium findings and cubic zirconia inlay", "en");
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toBe("natural-baroque-pearl-earrings-with-premium-findings-and");
    expect(slugify("☝️", "en")).toBe("product");
  });

  it("numbers repeated slugs and skips the ones already taken", () => {
    expect(uniqueSlugs(["earrings", "earrings", "ring", "earrings"], ["ring", "earrings-2"])).toEqual([
      "earrings",
      "earrings-3",
      "ring-2",
      "earrings-4",
    ]);
  });

  it("gives the plain slug to the oldest product", () => {
    const [newer, older] = parseLegacyProducts([
      legacy({ _id: { $oid: "bbbbbbbbbbbbbbbbbbbbbbbb" }, created: { $date: "2024-01-01T00:00:00Z" } }),
      legacy({ _id: { $oid: "aaaaaaaaaaaaaaaaaaaaaaaa" }, created: { $date: "2023-01-01T00:00:00Z" } }),
    ]);
    expect([newer, older].sort(byCreation).map((p) => p.legacyId)).toEqual([older.legacyId, newer.legacyId]);
  });
});

describe("photos", () => {
  it("finds the archived file of a Cloudinary URL", () => {
    expect(cloudinaryFile("https://res.cloudinary.com/tjstore/image/upload/v1692653513/oldsc94wylzdo7nfrniw.jpg")).toEqual({
      publicId: "oldsc94wylzdo7nfrniw",
      fileName: "oldsc94wylzdo7nfrniw.jpg",
    });
    expect(() => cloudinaryFile("https://example.com/x.jpg")).toThrow();
  });

  it("stores them under legacy/<product id>/ in their order", () => {
    expect(storagePathOf("0b5c…", 0, "abc.jpg")).toBe("legacy/0b5c…/1-abc.jpg");
    expect(storagePathOf("0b5c…", 2, "def.jpg")).toBe("legacy/0b5c…/3-def.jpg");
  });
});

describe("sourceHash", () => {
  it("changes with the legacy title or description", () => {
    const [product] = parseLegacyProducts([legacy()]);
    expect(sourceHash(product)).toMatch(/^[0-9a-f]{64}$/);
    expect(sourceHash({ ...product, title: "Other" })).not.toBe(sourceHash(product));
    expect(sourceHash({ ...product, description: "Other" })).not.toBe(sourceHash(product));
  });
});

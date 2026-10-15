import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Call = [method: string, ...args: unknown[]];
type Response = { data: unknown; error: { code?: string; message: string } | null; count?: number | null };

// A stand-in for the supabase-js query builder: records every call per table and resolves to the next
// queued response when awaited.
const calls: Record<string, Call[]> = {};
const responses: Record<string, Response[]> = {};

function builder(table: string) {
  const log = (calls[table] ??= []);
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          const response = responses[table]?.shift() ?? { data: [], error: null, count: 0 };
          return (resolve: (r: Response) => void) => resolve(response);
        }
        return (...args: unknown[]) => {
          log.push([String(prop), ...args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

const createPublicServerClient = vi.fn(() => ({
  from: (table: string) => builder(table),
  storage: {
    from: (bucket: string) => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
    }),
  },
}));

vi.mock("@/lib/supabase/server", () => ({ createPublicServerClient }));

const { getCategories, getProducts, getProductBySlug } = await import("./index");

function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    sku: null,
    fulfillment: "made_to_order",
    availability: "available",
    lead_time_days: 14,
    price_usd_text: "24.90",
    weight_g: 6,
    created_at: "2026-10-14T00:00:00Z",
    published_at: "2026-10-14T00:00:00Z",
    category: { id: "c1", slug: "earrings" },
    product_translations: [
      {
        locale: "en",
        slug: "coral-drop-earrings",
        title: "Coral drop earrings",
        description: null,
        materials: "Brass",
        care: "Keep dry",
        alt_text: null,
        meta_title: null,
        meta_description: null,
        source: "human",
        reviewed_at: null,
      },
      {
        locale: "de",
        slug: "korallen-ohrringe",
        title: "Korallen-Ohrringe",
        description: null,
        materials: "Messing",
        care: "Trocken aufbewahren",
        alt_text: null,
        meta_title: null,
        meta_description: null,
        source: "machine",
        reviewed_at: null,
      },
    ],
    product_images: [
      { id: "i1", storage_path: "p1/a.jpg", position: 0, width: 800, height: 1000, blur_data_url: null, product_image_alts: [] },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
  for (const key of Object.keys(responses)) delete responses[key];
  createPublicServerClient.mockClear();
});

describe("getCategories", () => {
  it("returns categories named in the locale, falling back to en", async () => {
    responses.categories = [
      {
        data: [
          { id: "c1", slug: "earrings", position: 1, category_translations: [{ locale: "en", name: "Earrings", source: "human" }, { locale: "pl", name: "Kolczyki", source: "machine" }] },
          { id: "c2", slug: "corals", position: 4, category_translations: [{ locale: "en", name: "Corals", source: "human" }] },
        ],
        error: null,
      },
    ];
    const result = await getCategories("pl");
    expect(result).toEqual({
      ok: true,
      data: [
        { id: "c1", slug: "earrings", position: 1, name: "Kolczyki", nameLocale: "pl", nameSource: "machine" },
        { id: "c2", slug: "corals", position: 4, name: "Corals", nameLocale: "en", nameSource: "human" },
      ],
    });
    expect(calls.categories).toContainEqual(["in", "category_translations.locale", ["pl", "en"]]);
    expect(calls.categories).toContainEqual(["order", "position"]);
  });

  it("reports a database error as unexpectedError", async () => {
    responses.categories = [{ data: null, error: { message: "boom" } }];
    expect(await getCategories("en")).toEqual({ ok: false, reason: "unexpectedError" });
  });

  it("refuses an unknown locale without querying", async () => {
    // @ts-expect-error -- a locale outside D3
    expect(await getCategories("ru")).toEqual({ ok: false, reason: "invalid" });
    expect(createPublicServerClient).not.toHaveBeenCalled();
  });

  it("reports a missing configuration as unexpectedError", async () => {
    createPublicServerClient.mockImplementationOnce(() => {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
    });
    expect(await getCategories("en")).toEqual({ ok: false, reason: "unexpectedError" });
  });
});

describe("getProducts", () => {
  it("queries published, not deleted products with the filters, sort and page", async () => {
    responses.products = [{ data: [productRow()], error: null, count: 11 }];
    const result = await getProducts(
      { locale: "de", categorySlug: "earrings", fulfillment: "made_to_order", availability: ["available", "reserved"] },
      "price_asc",
      { page: 3, pageSize: 5 },
    );
    const log = calls.products;
    expect(log).toContainEqual(["eq", "status", "published"]);
    expect(log).toContainEqual(["is", "deleted_at", null]);
    expect(log).toContainEqual(["in", "product_translations.locale", ["de", "en"]]);
    expect(log).toContainEqual(["eq", "category.slug", "earrings"]);
    expect(log).toContainEqual(["eq", "fulfillment", "made_to_order"]);
    expect(log).toContainEqual(["in", "availability", ["available", "reserved"]]);
    expect(log).toContainEqual(["order", "price_usd", { ascending: true }]);
    expect(log).toContainEqual(["range", 10, 14]);
    expect(log.find(([m]) => m === "select")?.[2]).toEqual({ count: "exact", head: false });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ total: 11, page: 3, pageSize: 5 });
    const [item] = result.data.items;
    expect(item).toMatchObject({
      id: "p1",
      priceUsdMinor: 2490,
      leadTimeDays: 14,
      translation: { locale: "de", slug: "korallen-ohrringe", isFallback: false, source: "machine" },
      images: [{ url: "https://storage.test/product-images/p1/a.jpg", alt: "Korallen-Ohrringe", width: 800, height: 1000 }],
    });
    expect(item).not.toHaveProperty("materials");
  });

  it("sorts newest first by default order and price descending on request", async () => {
    await getProducts({ locale: "en" }, "newest", { page: 1, pageSize: 12 });
    expect(calls.products).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(calls.products).toContainEqual(["range", 0, 11]);
    expect(calls.products).toContainEqual(["in", "product_translations.locale", ["en"]]);

    delete calls.products;
    await getProducts({ locale: "en" }, "price_desc", { page: 1, pageSize: 12 });
    expect(calls.products).toContainEqual(["order", "price_usd", { ascending: false }]);
  });

  it("answers a page past the end with an empty page and the total from a head-only count", async () => {
    responses.products = [
      { data: null, error: { code: "PGRST103", message: "Requested range not satisfiable" }, count: null },
      { data: null, error: null, count: 11 },
    ];
    expect(await getProducts({ locale: "en", categorySlug: "rings" }, "newest", { page: 9, pageSize: 5 })).toEqual({
      ok: true,
      data: { items: [], total: 11, page: 9, pageSize: 5 },
    });
    const selects = calls.products.filter(([m]) => m === "select").map((c) => c[2]);
    expect(selects).toEqual([{ count: "exact", head: false }, { count: "exact", head: true }]);
    expect(calls.products.filter(([m, col]) => m === "eq" && col === "category.slug")).toHaveLength(2);
  });

  it("reports other database errors as unexpectedError", async () => {
    responses.products = [{ data: null, error: { code: "42P01", message: "boom" } }];
    expect(await getProducts({ locale: "en" }, "newest", { page: 1, pageSize: 5 })).toEqual({
      ok: false,
      reason: "unexpectedError",
    });
  });

  it.each([
    [{ locale: "en", categorySlug: "Bad Slug" }, "newest", { page: 1, pageSize: 5 }],
    [{ locale: "en", availability: [] }, "newest", { page: 1, pageSize: 5 }],
    [{ locale: "en", availability: ["gone"] }, "newest", { page: 1, pageSize: 5 }],
    [{ locale: "en", fulfillment: "bespoke" }, "newest", { page: 1, pageSize: 5 }],
    [{ locale: "en" }, "random", { page: 1, pageSize: 5 }],
    [{ locale: "en" }, "newest", { page: 0, pageSize: 5 }],
    [{ locale: "en" }, "newest", { page: 1.5, pageSize: 5 }],
    [{ locale: "en" }, "newest", { page: 1, pageSize: 101 }],
    [{ locale: "xx" }, "newest", { page: 1, pageSize: 5 }],
  ])("refuses invalid input %j %j %j", async (filters, sort, page) => {
    // @ts-expect-error -- deliberately invalid input from an untyped caller
    expect(await getProducts(filters, sort, page)).toEqual({ ok: false, reason: "invalid" });
    expect(createPublicServerClient).not.toHaveBeenCalled();
  });
});

describe("getProductBySlug", () => {
  it("prefers the translation in the locale and loads its product", async () => {
    responses.product_translations = [
      { data: [{ product_id: "p9", locale: "en" }, { product_id: "p1", locale: "de" }], error: null },
    ];
    responses.products = [{ data: productRow(), error: null }];
    const result = await getProductBySlug("de", "korallen-ohrringe");
    expect(calls.product_translations).toContainEqual(["eq", "slug", "korallen-ohrringe"]);
    expect(calls.products).toContainEqual(["eq", "id", "p1"]);
    expect(calls.products).toContainEqual(["eq", "status", "published"]);
    expect(result.ok && result.data).toMatchObject({
      materials: "Messing",
      care: "Trocken aufbewahren",
      translation: { locale: "de" },
    });
  });

  it("returns the localized translation when reached by the en slug, so the caller can redirect", async () => {
    responses.product_translations = [{ data: [{ product_id: "p1", locale: "en" }], error: null }];
    responses.products = [{ data: productRow(), error: null }];
    const result = await getProductBySlug("de", "coral-drop-earrings");
    expect(result.ok && result.data.translation.slug).toBe("korallen-ohrringe");
  });

  it("is notFound when no translation matches or the product is hidden", async () => {
    responses.product_translations = [{ data: [], error: null }];
    expect(await getProductBySlug("en", "nope")).toEqual({ ok: false, reason: "notFound" });

    responses.product_translations = [{ data: [{ product_id: "p1", locale: "en" }], error: null }];
    responses.products = [{ data: null, error: null }];
    expect(await getProductBySlug("en", "coral-drop-earrings")).toEqual({ ok: false, reason: "notFound" });
  });

  it("refuses a malformed slug", async () => {
    expect(await getProductBySlug("en", "../etc")).toEqual({ ok: false, reason: "invalid" });
    expect(createPublicServerClient).not.toHaveBeenCalled();
  });
});

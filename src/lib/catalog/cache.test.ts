import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The "use cache" directive is a plain string outside Next's compiler: the wrappers run as ordinary functions
// and these spies record the lifetime each one gives its entry.
const cacheLife = vi.fn();
const cacheTag = vi.fn();
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));

type Response = { data: unknown; error: { message: string } | null };

// A supabase-js stand-in: each table answers the next queued response when awaited, an Error rejects the
// request as a network failure would, and an empty queue answers like an unreachable database.
const responses: Record<string, (Response | Error)[]> = {};

function builder(table: string) {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          const response = responses[table]?.shift() ?? new TypeError("fetch failed");
          return (resolve: (r: Response) => void, reject: (e: Error) => void) =>
            response instanceof Error ? reject(response) : resolve(response);
        }
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase/server", () => ({
  createPublicServerClient: () => ({
    from: (table: string) => builder(table),
    // a database function answers like a table named rpc:<function>
    rpc: (fn: string) => builder(`rpc:${fn}`),
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
      }),
    },
  }),
}));

const { FAILED_READ_LIFE } = await import("@/lib/failed-read");
const { getCachedCategories, getCachedFacets, getCachedListingPage, getCachedTaxonomyTerms } = await import("./cache");
const { getProductPage } = await import("./product");

const failure: Response = { data: null, error: { message: "boom" } };

const listing = (categorySlug: string | null) => ({
  locale: "de" as const,
  categorySlug,
  collectionId: null,
  terms: [],
  materials: [],
  colours: [],
  priceMinUsdMinor: null,
  priceMaxUsdMinor: null,
  availability: [],
});
const noIds: Response = { data: { ids: [], total: 0 }, error: null };

const categoryRows: Response = {
  data: [{ id: "c1", slug: "earrings", position: 1, category_translations: [{ locale: "de", name: "Ohrringe", source: "human" }] }],
  error: null,
};

const translation = (locale: string, slug: string, title: string) => ({
  locale,
  slug,
  title,
  description: null,
  materials: null,
  care: null,
  clasp: null,
  lead_time_note: null,
  alt_text: null,
  meta_title: null,
  meta_description: null,
  source: "human",
  reviewed_at: null,
});

const productRow = {
  id: "p1",
  sku: "TEST-001",
  fulfillment: "made_to_order",
  availability: "available",
  lead_time_min_days: 14,

  lead_time_max_days: 14,

  length_mm: null,

  width_mm: null,

  height_mm: null,
  price_usd_text: "24.90",
  weight_g: 6,
  created_at: "2026-10-14T00:00:00Z",
  published_at: "2026-10-14T00:00:00Z",
  category: { id: "c1", slug: "earrings" },
  product_translations: [
    translation("en", "coral-drop-earrings", "Coral drop earrings"),
    translation("de", "korallen-ohrringe", "Korallen-Ohrringe"),
  ],
  product_images: [],
  product_variants: [],
  product_sales: null,
  collection_products: [],
};

const slugMatches: Response = {
  data: [
    {
      product_id: "p1",
      locale: "de",
      slug: "korallen-ohrringe",
      product: {
        product_translations: [
          { locale: "en", slug: "coral-drop-earrings" },
          { locale: "de", slug: "korallen-ohrringe" },
        ],
      },
    },
  ],
  error: null,
};

/** The product page's reads up to its product: the slug lookup, then getProductBySlug's two queries. */
function productReads() {
  responses.product_translations = [slugMatches, { data: [{ product_id: "p1", locale: "de" }], error: null }];
  responses.products = [{ data: productRow, error: null }];
}

/** Next 16.4.1: an entry with a zero revalidate or an expire under 5 minutes is never prerendered. */
function isExcludedFromPrerender(life: { revalidate?: number; expire?: number }) {
  return life.revalidate === 0 || (life.expire ?? Infinity) < 300;
}

const noSaleChange: Response = { data: null, error: null };

beforeEach(() => {
  for (const key of Object.keys(responses)) delete responses[key];
  // no sale starts or ends: the entries keep their own lifetimes (#67)
  responses["rpc:next_sale_change"] = [noSaleChange, noSaleChange];
  cacheLife.mockClear();
  cacheTag.mockClear();
});

describe("the lifetime of a failed read", () => {
  it("is zero: never served again and never prerendered", () => {
    expect(FAILED_READ_LIFE).toEqual({ stale: 0, revalidate: 0, expire: 0 });
    expect(isExcludedFromPrerender(FAILED_READ_LIFE)).toBe(true);
  });
});

describe("getCachedCategories", () => {
  it.each([
    ["a database error", failure],
    ["a network failure", new TypeError("fetch failed")],
  ])("caches %s with zero lifetime", async (_what, response) => {
    responses.categories = [response];
    expect(await getCachedCategories("de")).toEqual({ ok: false, reason: "unexpectedError" });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps the categories for hours", async () => {
    responses.categories = [categoryRows];
    expect(await getCachedCategories("de")).toMatchObject({ ok: true, data: [{ slug: "earrings", name: "Ohrringe" }] });
    expect(cacheLife.mock.calls).toEqual([["hours"]]);
  });
});

describe("getCachedListingPage", () => {
  it("caches a failed search with zero lifetime", async () => {
    responses["rpc:shop_search"] = [failure];
    expect(await getCachedListingPage(listing(null), "newest", 1, 24)).toEqual({ ok: false, reason: "unexpectedError" });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("caches a failed product read with zero lifetime", async () => {
    responses["rpc:shop_search"] = [{ data: { ids: ["p1"], total: 1 }, error: null }];
    responses.products = [failure];
    expect(await getCachedListingPage(listing(null), "newest", 1, 24)).toEqual({ ok: false, reason: "unexpectedError" });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("caches a category listing with zero lifetime when the categories cannot be read", async () => {
    // the products are there, but without the category's id the entry would miss its revalidation tag
    responses["rpc:shop_search"] = [noIds];
    responses.categories = [failure];
    expect(await getCachedListingPage(listing("earrings"), "newest", 1, 24)).toMatchObject({ ok: true });
    expect(cacheLife).toHaveBeenLastCalledWith(FAILED_READ_LIFE);
    expect(cacheLife).not.toHaveBeenCalledWith("hours");
  });

  it("keeps a complete listing for hours, tagged with its category", async () => {
    responses["rpc:shop_search"] = [noIds];
    responses.categories = [categoryRows];
    expect(await getCachedListingPage(listing("earrings"), "newest", 1, 24)).toMatchObject({ ok: true });
    expect(cacheLife).toHaveBeenLastCalledWith("hours");
    expect(cacheTag).toHaveBeenCalledWith("category:c1");
  });
});

describe("getCachedFacets", () => {
  it.each([
    ["a database error", failure],
    ["a network failure", new TypeError("fetch failed")],
  ])("caches %s with zero lifetime", async (_what, response) => {
    responses["rpc:shop_facets"] = [response];
    expect(await getCachedFacets(listing(null))).toEqual({ ok: false, reason: "unexpectedError" });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps the counts for hours", async () => {
    responses["rpc:shop_facets"] = [
      {
        data: [
          { facet: "material", value: "brass", count: 3 },
          { facet: "availability", value: "in_stock", count: 1 },
        ],
        error: null,
      },
    ];
    expect(await getCachedFacets(listing(null))).toEqual({
      ok: true,
      data: { material: { brass: 3 }, colour: {}, availability: { in_stock: 1 } },
    });
    expect(cacheLife.mock.calls).toEqual([["hours"]]);
  });
});

describe("getCachedTaxonomyTerms", () => {
  it("caches a failed read with zero lifetime", async () => {
    responses.taxonomy_terms = [failure];
    expect(await getCachedTaxonomyTerms("de")).toEqual({ ok: false, reason: "unexpectedError" });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps the lists for hours, named in the locale, else en, else uk", async () => {
    responses.taxonomy_terms = [
      {
        data: [
          { id: "t1", kind: "material", slug: "brass", position: 0, taxonomy_term_translations: [{ locale: "uk", name: "Латунь" }, { locale: "en", name: "Brass" }] },
          { id: "t2", kind: "colour", slug: "red", position: 0, taxonomy_term_translations: [{ locale: "uk", name: "Червоний" }, { locale: "de", name: "Rot" }] },
          { id: "t3", kind: "colour", slug: "blue", position: 0, taxonomy_term_translations: [{ locale: "uk", name: "Синій" }] },
        ],
        error: null,
      },
    ];
    const result = await getCachedTaxonomyTerms("de");
    expect(result.ok && result.data.map((t) => [t.slug, t.name, t.nameLocale])).toEqual([
      ["brass", "Brass", "en"],
      ["red", "Rot", "de"],
      ["blue", "Синій", "uk"],
    ]);
    expect(cacheLife.mock.calls).toEqual([["hours"]]);
  });
});

describe("getProductPage", () => {
  it.each([
    ["a database error", failure],
    ["a network failure", new TypeError("fetch failed")],
  ])("caches %s of the slug lookup with zero lifetime", async (_what, response) => {
    responses.product_translations = [response];
    expect(await getProductPage("de", "korallen-ohrringe")).toEqual({ kind: "unexpectedError" });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("caches a failed product read with zero lifetime", async () => {
    responses.product_translations = [slugMatches, failure];
    responses.categories = [categoryRows];
    expect(await getProductPage("de", "korallen-ohrringe")).toEqual({ kind: "unexpectedError" });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("caches a page without its category (no breadcrumb) with zero lifetime", async () => {
    productReads();
    responses.categories = [failure];
    expect(await getProductPage("de", "korallen-ohrringe")).toMatchObject({ kind: "ok", categoryName: null });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps a complete page for a day without a stale window, tagged with its product", async () => {
    productReads();
    responses.categories = [categoryRows];
    expect(await getProductPage("de", "korallen-ohrringe")).toMatchObject({ kind: "ok", categoryName: "Ohrringe" });
    expect(cacheLife.mock.calls).toEqual([["daysNoSwr"]]);
    expect(cacheTag).toHaveBeenCalledWith("product:p1");
  });
});

describe("entries with prices and the sales (#67)", () => {
  it("live no longer than until the next sale starts or ends", async () => {
    const inTenMinutes = new Date(Date.now() + 600_000).toISOString();
    responses["rpc:next_sale_change"] = [{ data: inTenMinutes, error: null }];
    responses["rpc:shop_search"] = [noIds];
    expect(await getCachedListingPage(listing(null), "newest", 1, 24)).toMatchObject({ ok: true });
    const [life] = cacheLife.mock.calls.at(-1)!;
    expect(life.revalidate).toBeGreaterThan(590);
    expect(life.revalidate).toBeLessThanOrEqual(600);
    expect(life.expire).toBe(life.revalidate);

    cacheLife.mockClear();
    productReads();
    responses.categories = [categoryRows];
    responses["rpc:next_sale_change"] = [{ data: inTenMinutes, error: null }];
    expect(await getProductPage("de", "korallen-ohrringe")).toMatchObject({ kind: "ok" });
    expect(cacheLife.mock.calls).toHaveLength(1);
    expect(cacheLife.mock.calls[0]?.[0].expire).toBeLessThanOrEqual(600);
  });

  it("are failed reads when the next sale change cannot be read", async () => {
    responses["rpc:next_sale_change"] = [failure, failure, failure];
    responses["rpc:shop_search"] = [noIds];
    await getCachedListingPage(listing(null), "newest", 1, 24);
    responses["rpc:shop_facets"] = [{ data: [], error: null }];
    await getCachedFacets(listing(null));
    productReads();
    responses.categories = [categoryRows];
    await getProductPage("de", "korallen-ohrringe");
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE], [FAILED_READ_LIFE], [FAILED_READ_LIFE]]);
  });

  it("tag a collection's listing with the collection", async () => {
    responses["rpc:shop_search"] = [noIds];
    await getCachedListingPage({ ...listing(null), collectionId: "d6700000-0000-4000-8000-000000000001" }, "position", 1, 24);
    expect(cacheTag).toHaveBeenCalledWith("collection:d6700000-0000-4000-8000-000000000001");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The "use cache" directive is a plain string outside Next's compiler: these spies record the entry's life and tags.
const cacheLife = vi.fn();
const cacheTag = vi.fn();
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));

type Response = { data: unknown; error: { message: string } | null };

// supabase-js stand-in: each table answers its next queued response when awaited; an empty queue fails like an
// unreachable database. The ranges asked for are recorded.
const responses: Record<string, (Response | Error)[]> = {};
const ranges: [number, number][] = [];

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
        if (prop === "range") return (from: number, to: number) => (ranges.push([from, to]), proxy);
        return () => proxy;
      },
    },
  );
  return proxy;
}

vi.mock("@/lib/supabase/server", () => ({
  createPublicServerClient: () => ({ from: (table: string) => builder(table) }),
}));

const { FAILED_READ_LIFE } = await import("@/lib/failed-read");
const { CATALOG_TAG } = await import("./cache");
const { getSitemapCatalog } = await import("./sitemap");

function productRow(n: number) {
  return {
    id: `p${n}`,
    updated_at: "2026-10-10T10:00:00Z",
    category: { slug: "rings" },
    product_translations: [
      { locale: "en", slug: `ring-${n}`, source: "human", reviewed_at: null, updated_at: "2026-10-11T10:00:00Z" },
      // a locale the shop does not serve (any more) is ignored
      { locale: "ru", slug: `kolco-${n}`, source: "human", reviewed_at: null, updated_at: "2026-10-11T10:00:00Z" },
    ],
    product_images: [{ updated_at: "2026-10-12T10:00:00Z" }, { updated_at: "2026-10-09T10:00:00Z" }],
  };
}

const categories: Response = { data: [{ slug: "rings", updated_at: "2026-10-01T00:00:00Z" }], error: null };

beforeEach(() => {
  cacheLife.mockClear();
  cacheTag.mockClear();
  ranges.length = 0;
  for (const table of Object.keys(responses)) delete responses[table];
});

describe("getSitemapCatalog", () => {
  it("reads every page of published products, tagged with the catalogue and kept for hours", async () => {
    responses.products = [
      { data: Array.from({ length: 500 }, (_, i) => productRow(i)), error: null },
      { data: [productRow(500)], error: null },
    ];
    responses.categories = [categories];

    const result = await getSitemapCatalog();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(result.data.products).toHaveLength(501);
    expect(result.data.products[0]).toEqual({
      categorySlug: "rings",
      updatedAt: "2026-10-10T10:00:00Z",
      imagesUpdatedAt: "2026-10-12T10:00:00Z",
      translations: [
        { locale: "en", slug: "ring-0", source: "human", reviewedAt: null, updatedAt: "2026-10-11T10:00:00Z" },
      ],
    });
    expect(result.data.categories).toEqual([{ slug: "rings", updatedAt: "2026-10-01T00:00:00Z" }]);
    expect(cacheTag).toHaveBeenCalledWith(CATALOG_TAG);
    expect(cacheLife).toHaveBeenLastCalledWith("hours");
  });

  it("never keeps a failed read: an error answer, a failed later page or a network failure", async () => {
    responses.products = [{ data: null, error: { message: "boom" } }];
    responses.categories = [categories];
    expect(await getSitemapCatalog()).toEqual({ ok: false, reason: "unexpectedError" });
    expect(cacheLife).toHaveBeenLastCalledWith(FAILED_READ_LIFE);

    responses.products = [
      { data: Array.from({ length: 500 }, (_, i) => productRow(i)), error: null },
      { data: null, error: { message: "boom" } },
    ];
    responses.categories = [categories];
    expect((await getSitemapCatalog()).ok).toBe(false);
    expect(cacheLife).toHaveBeenLastCalledWith(FAILED_READ_LIFE);

    responses.products = [{ data: [productRow(1)], error: null }];
    // no queued categories: the request rejects like an unreachable database
    expect((await getSitemapCatalog()).ok).toBe(false);
    expect(cacheLife).toHaveBeenLastCalledWith(FAILED_READ_LIFE);
    expect(cacheLife).not.toHaveBeenCalledWith("hours");
  });
});

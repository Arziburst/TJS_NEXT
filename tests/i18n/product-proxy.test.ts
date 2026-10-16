import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locales } from "@/i18n/routing";
import proxy from "@/proxy";

const earrings = [
  { locale: "en", slug: "coral-drop-earrings" },
  { locale: "de", slug: "korallen-tropfenohrringe" },
];

// The Data API answer for product_translations?slug=eq.<slug> (published products only).
function rowsFor(slug: string) {
  return earrings
    .filter((t) => t.slug === slug)
    .map((t) => ({ product_id: "p1", locale: t.locale, slug: t.slug, product: { product_translations: earrings } }));
}

const fetchMock = vi.fn(async (input: string | URL | Request) => {
  const slug = new URL(String(input)).searchParams.get("slug")!.replace(/^eq\./, "");
  return new Response(JSON.stringify(rowsFor(slug)), { status: 200 });
});

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://localhost:3016"), { headers });
}

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("proxy for product pages", () => {
  it("lets a known slug through to the page", async () => {
    const response = await proxy(request("/de/product/korallen-tropfenohrringe"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("rewrites an unknown slug to a path no route matches, in the request's locale", async () => {
    const response = await proxy(request("/de/product/does-not-exist"));
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/de/_not-found-product");
    expect(response.headers.get("x-middleware-request-x-next-intl-locale")).toBe("de");
  });

  it("rewrites a malformed slug without asking the database", async () => {
    const response = await proxy(request("/en/product/Bad_Slug"));
    expect(response.headers.get("x-middleware-rewrite")).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects another locale's slug to the locale's slug (308)", async () => {
    const response = await proxy(request("/de/product/coral-drop-earrings?ref=x"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("http://localhost:3016/de/product/korallen-tropfenohrringe?ref=x");
  });

  it("leaves RSC requests and prefetches to the page", async () => {
    const nonDocument: Record<string, string>[] = [{ rsc: "1" }, { "next-router-prefetch": "1" }, { "sec-fetch-dest": "empty" }];
    for (const headers of nonDocument) {
      const response = await proxy(request("/de/product/does-not-exist", headers));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the database on every document request, so an admin change shows at once (#74)", async () => {
    await proxy(request("/de/product/korallen-tropfenohrringe"));
    // unpublished in the admin meanwhile: the Data API no longer returns it
    fetchMock.mockResolvedValueOnce(new Response("[]", { status: 200 }));
    const response = await proxy(request("/de/product/korallen-tropfenohrringe"));
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/de/_not-found-product");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("looks the slug up through the unique (locale, slug) index: every locale named", async () => {
    await proxy(request("/de/product/korallen-tropfenohrringe"));
    const query = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    expect(query.get("locale")).toBe(`in.(${locales.join(",")})`);
    expect(query.get("slug")).toBe("eq.korallen-tropfenohrringe");
    expect(query.get("product.status")).toBe("eq.published");
  });

  it("fails open when the lookup fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const response = await proxy(request("/de/product/does-not-exist"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.status).toBe(200);
  });
});

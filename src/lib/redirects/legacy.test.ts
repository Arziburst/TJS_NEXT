import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { legacyTarget, visitorLocale } from "./legacy";
import { clearLegacyProductLookups } from "./legacy-product";
import { legacyRedirect } from "./proxy";

const ID = "64f1a2b3c4d5e6f708192a3b";

describe("legacyTarget", () => {
  it("maps the legacy shop and category URLs, an unknown type to the shop", () => {
    expect(legacyTarget("/shop")).toEqual({ kind: "path", path: "/shop" });
    expect(legacyTarget("/shop/")).toEqual({ kind: "path", path: "/shop" });
    expect(legacyTarget("/shop/see-all")).toEqual({ kind: "path", path: "/shop" });
    expect(legacyTarget("/shop/necklace")).toEqual({ kind: "path", path: "/shop/necklaces" });
    expect(legacyTarget("/shop/brooch")).toEqual({ kind: "path", path: "/shop/brooches" });
    expect(legacyTarget("/shop/Corals")).toEqual({ kind: "path", path: "/shop/corals" });
    expect(legacyTarget("/shop/earrings")).toEqual({ kind: "path", path: "/shop/earrings" });
    expect(legacyTarget("/shop/hats")).toEqual({ kind: "path", path: "/shop" });
  });

  it("maps the fixed legacy pages", () => {
    expect(legacyTarget("/about-us")).toEqual({ kind: "path", path: "/about" });
    expect(legacyTarget("/cart/")).toEqual({ kind: "path", path: "/cart" });
    expect(legacyTarget("/sign-in-and-up")).toEqual({ kind: "path", path: "/sign-in-and-up" });
    expect(legacyTarget("/order-details")).toEqual({ kind: "path", path: "/checkout" });
    expect(legacyTarget("/add-item")).toEqual({ kind: "path", path: "/admin/products/new" });
    expect(legacyTarget("/orders")).toEqual({ kind: "path", path: "/admin/orders" });
    expect(legacyTarget(`/order/${ID}`)).toEqual({ kind: "path", path: "/admin/orders" });
  });

  it("asks for a lookup of a well-formed product id only", () => {
    expect(legacyTarget(`/product/${ID}`)).toEqual({ kind: "product", legacyId: ID, management: false });
    expect(legacyTarget(`/product/${ID.toUpperCase()}/management`)).toEqual({ kind: "product", legacyId: ID, management: true });
    expect(legacyTarget("/product/not-an-id")).toEqual({ kind: "path", path: "/shop" });
  });

  it("leaves the new routes and everything else alone", () => {
    for (const path of ["/", "/uk/shop", "/en/shop/rings", "/uk/product/x", "/shop/rings/extra", `/product/${ID}/edit`, "/about"]) {
      expect(legacyTarget(path), path).toBeNull();
    }
  });
});

describe("visitorLocale", () => {
  it("takes the locale cookie first", () => {
    expect(visitorLocale("de", "uk")).toBe("de");
    expect(visitorLocale("xx", "uk")).toBe("uk");
  });

  it("takes the best supported browser language by quality, then the default", () => {
    expect(visitorLocale(undefined, "ru;q=0.9,uk-UA;q=0.8,en;q=0.7")).toBe("uk");
    expect(visitorLocale(undefined, "en;q=0.5,pl;q=0.9")).toBe("pl");
    expect(visitorLocale(undefined, "pt-BR")).toBe("pt");
    expect(visitorLocale(undefined, "ru,ja")).toBe("en");
    expect(visitorLocale(undefined, null)).toBe("en");
  });
});

describe("legacyRedirect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearLegacyProductLookups();
  });

  function request(path: string, headers: Record<string, string> = {}) {
    return new NextRequest(`http://localhost${path}`, { headers });
  }

  it("answers 308 to the localized path and keeps the query", async () => {
    const response = await legacyRedirect(request("/shop/necklace?sort=priceAsc", { "accept-language": "uk" }));
    expect(response?.status).toBe(308);
    expect(response?.headers.get("location")).toBe("http://localhost/uk/shop/necklaces?sort=priceAsc");
  });

  it("sends a product to its slug in the visitor's locale and an unknown or unreachable one to the shop", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const fetchMock = vi.fn(async (url: string) => {
      const known = url.includes(`legacy_id=eq.${ID}`);
      const rows = known
        ? [{ id: "6a1f0c1e-0000-4000-8000-000000000001", product_translations: [{ locale: "en", slug: "coral-ring" }, { locale: "de", slug: "korallenring" }] }]
        : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const de = await legacyRedirect(request(`/product/${ID}`, { cookie: "NEXT_LOCALE=de" }));
    expect(de?.headers.get("location")).toBe("http://localhost/de/product/korallenring");
    // no slug in this locale: the default locale's
    const pl = await legacyRedirect(request(`/product/${ID}`, { "accept-language": "pl" }));
    expect(pl?.headers.get("location")).toBe("http://localhost/pl/product/coral-ring");
    const admin = await legacyRedirect(request(`/product/${ID}/management`));
    expect(admin?.headers.get("location")).toBe("http://localhost/en/admin/products/6a1f0c1e-0000-4000-8000-000000000001");
    // cached: one query for the three requests
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const query = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(query.get("status")).toBe("eq.published");
    expect(query.get("deleted_at")).toBe("is.null");

    const unknown = await legacyRedirect(request("/product/0123456789abcdef01234567"));
    expect(unknown?.status).toBe(308);
    expect(unknown?.headers.get("location")).toBe("http://localhost/en/shop");

    clearLegacyProductLookups();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const failed = await legacyRedirect(request(`/product/${ID}`));
    expect(failed?.headers.get("location")).toBe("http://localhost/en/shop");
  });

  it("ignores other methods and other paths", async () => {
    expect(await legacyRedirect(new NextRequest("http://localhost/shop", { method: "POST" }))).toBeNull();
    expect(await legacyRedirect(request("/en/shop"))).toBeNull();
  });
});

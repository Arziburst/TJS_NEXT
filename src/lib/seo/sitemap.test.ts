import { describe, expect, it } from "vitest";
import { locales } from "@/i18n/routing";
import { CATEGORY_SLUGS } from "@/lib/catalog/categories";
import { buildSitemap, latest, type SitemapProduct } from "./sitemap";

const base = new URL("https://tjs.example");
const human = { source: "human", reviewedAt: null } as const;

// the seeded coral earrings (supabase/seed.sql): uk + en human, de a reviewed and pl an unreviewed machine text
const earrings: SitemapProduct = {
  categorySlug: "earrings",
  updatedAt: "2026-10-10T10:00:00.000Z",
  imagesUpdatedAt: "2026-10-11T10:00:00.000Z",
  translations: [
    { locale: "en", slug: "coral-drop-earrings", ...human, updatedAt: "2026-10-09T10:00:00.000Z" },
    { locale: "uk", slug: "serezhky-krapli-z-koralom", ...human, updatedAt: "2026-10-12T10:00:00.000Z" },
    { locale: "de", slug: "korallen-tropfenohrringe", source: "machine", reviewedAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-09T10:00:00.000Z" },
    { locale: "pl", slug: "kolczyki-z-koralem", source: "machine", reviewedAt: null, updatedAt: "2026-10-13T10:00:00.000Z" },
  ],
};

// a ring known only by an unreviewed machine text in en and a human one in fr: no x-default
const ring: SitemapProduct = {
  categorySlug: "rings",
  updatedAt: "2026-10-01T10:00:00.000Z",
  imagesUpdatedAt: null,
  translations: [
    { locale: "en", slug: "silver-ring", source: "machine", reviewedAt: null, updatedAt: "2026-10-01T10:00:00.000Z" },
    { locale: "fr", slug: "bague-argent", ...human, updatedAt: "2026-10-02T10:00:00.000Z" },
  ],
};

// nothing indexable yet
const brooch: SitemapProduct = {
  categorySlug: "brooches",
  updatedAt: "2026-10-14T10:00:00.000Z",
  imagesUpdatedAt: null,
  translations: [{ locale: "en", slug: "bee-brooch", source: "machine", reviewedAt: null, updatedAt: "2026-10-14T10:00:00.000Z" }],
};

const categories = CATEGORY_SLUGS.map((slug) => ({ slug, updatedAt: "2026-10-05T10:00:00.000Z" }));

function build(products: SitemapProduct[] = [earrings, ring, brooch]) {
  return buildSitemap({ base, products, categories });
}

function find(url: string) {
  const entry = build().find((e) => e.url === url);
  expect(entry, url).toBeDefined();
  return entry!;
}

describe("buildSitemap", () => {
  it("lists every shop page once per locale with all locales and x-default /en as alternates", () => {
    const sitemap = build([]);
    // home, shop and the six categories in 11 locales (About is not live yet)
    expect(sitemap).toHaveLength(8 * locales.length);

    const home = find("https://tjs.example/de");
    expect(home.alternates?.languages).toEqual({
      ...Object.fromEntries(locales.map((l) => [l, `https://tjs.example/${l}`])),
      "x-default": "https://tjs.example/en",
    });
    expect(home.lastModified).toBeUndefined();
    for (const slug of CATEGORY_SLUGS) find(`https://tjs.example/uk/shop/${slug}`);
  });

  it("lists a product only in its indexable locales, with alternates among them", () => {
    const urls = build().map((e) => e.url);
    expect(urls).toContain("https://tjs.example/uk/product/serezhky-krapli-z-koralom");
    expect(urls).toContain("https://tjs.example/de/product/korallen-tropfenohrringe");
    // an unreviewed machine translation stays out, as does a product with nothing indexable
    expect(urls).not.toContain("https://tjs.example/pl/product/kolczyki-z-koralem");
    expect(urls.some((url) => url.includes("bee-brooch"))).toBe(false);

    const expected = {
      uk: "https://tjs.example/uk/product/serezhky-krapli-z-koralom",
      en: "https://tjs.example/en/product/coral-drop-earrings",
      de: "https://tjs.example/de/product/korallen-tropfenohrringe",
      "x-default": "https://tjs.example/en/product/coral-drop-earrings",
    };
    for (const url of Object.values(expected)) expect(find(url).alternates?.languages).toEqual(expected);
  });

  it("states no x-default when the fallback locale's text is not indexable", () => {
    const entries = build().filter((e) => /\/product\/(silver-ring|bague-argent)$/.test(e.url));
    expect(entries.map((e) => e.url)).toEqual(["https://tjs.example/fr/product/bague-argent"]);
    expect(entries[0].alternates?.languages).toEqual({ fr: "https://tjs.example/fr/product/bague-argent" });
  });

  it("dates a product page by its newest change: the product, its photos or its own translation", () => {
    expect(find("https://tjs.example/en/product/coral-drop-earrings").lastModified).toBe("2026-10-11T10:00:00.000Z");
    expect(find("https://tjs.example/uk/product/serezhky-krapli-z-koralom").lastModified).toBe("2026-10-12T10:00:00.000Z");
  });

  it("dates the listing and a category by the newest change of their products or categories", () => {
    // the newest product change is the unindexed brooch's: the listing shows it all the same
    expect(find("https://tjs.example/en/shop").lastModified).toBe("2026-10-14T10:00:00.000Z");
    expect(find("https://tjs.example/en/shop/earrings").lastModified).toBe("2026-10-13T10:00:00.000Z");
    expect(find("https://tjs.example/en/shop/necklaces").lastModified).toBe("2026-10-05T10:00:00.000Z");
  });

  it("makes every URL absolute on the base and never lists a noindex page", () => {
    const urls = build().flatMap((e) => [e.url, ...Object.values(e.alternates?.languages ?? {}).filter((u) => u !== undefined)]);
    for (const url of urls) {
      expect(new URL(url).origin).toBe("https://tjs.example");
      expect(url).not.toMatch(/\/(search|cart|checkout|favorites|account|admin|delivery-demo|ui-kit|sign-in-and-up)\b/);
    }
  });
});

describe("latest", () => {
  it("picks the newest valid timestamp", () => {
    expect(latest("2026-01-01T00:00:00Z", null, "garbage", "2026-02-01T00:00:00Z", undefined)).toBe("2026-02-01T00:00:00.000Z");
    expect(latest(null, undefined)).toBeUndefined();
  });
});

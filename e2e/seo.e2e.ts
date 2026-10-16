import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import deCatalog from "../messages/de/catalog.json" with { type: "json" };
import enHome from "../messages/en/home.json" with { type: "json" };

// The sitemap, robots.txt, share images and the home page's structured data, as a crawler reads them: plain
// requests, no JavaScript. Seeded products (supabase/seed.sql): the coral earrings are written by a human in uk
// and en, by machine in de (reviewed) and pl (not reviewed).

const locales = ["uk", "en", "de", "fr", "es", "it", "pl", "nl", "cs", "pt", "ro"];
const EARRINGS = {
  uk: "/uk/product/serezhky-krapli-z-koralom",
  en: "/en/product/coral-drop-earrings",
  de: "/de/product/korallen-tropfenohrringe",
};
const UNREVIEWED_PL = "/pl/product/kolczyki-z-koralem";
// pages search engines must never get from the sitemap (noindex or private)
const NOINDEX = /^\/[a-z]{2}\/(search|cart|checkout|favorites|account|admin|delivery-demo|ui-kit|sign-in-and-up|forgot-password|update-password)\b/;

/** The origin canonical URLs are absolute on (getMetadataBase()), read from a page's canonical link. */
async function siteOrigin(request: APIRequestContext): Promise<string> {
  const html = await (await request.get("/en")).text();
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
  expect(canonical, "the home page's canonical link").not.toBeNull();
  return new URL(canonical![1]).origin;
}

type SitemapUrl = { loc: string; lastmod: string | null; alternates: Record<string, string> };

/** Parses the sitemap with the browser's XML parser: a malformed document fails here. */
async function parseSitemap(page: Page, xml: string): Promise<{ namespace: string | null; urls: SitemapUrl[] }> {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "application/xml");
    const error = doc.querySelector("parsererror");
    if (error) throw new Error(`sitemap.xml is not well-formed XML: ${error.textContent}`);
    const urls = [...doc.documentElement.children].map((url) => {
      const child = (name: string) => [...url.children].find((c) => c.localName === name)?.textContent ?? null;
      const alternates: Record<string, string> = {};
      for (const link of [...url.children].filter((c) => c.localName === "link")) {
        alternates[link.getAttribute("hreflang")!] = link.getAttribute("href")!;
      }
      return { loc: child("loc")!, lastmod: child("lastmod"), alternates };
    });
    return { namespace: doc.documentElement.namespaceURI, urls };
  }, xml);
}

/** The pixel size of a PNG, from its IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(1, 4).toString("ascii"), "a PNG signature").toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function metaContent(html: string, property: string): string | null {
  const match = new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`).exec(html);
  return match ? match[1].replace(/&amp;/g, "&") : null;
}

test.describe("sitemap.xml", () => {
  test("is valid XML with absolute URLs, every locale, and hreflang only for indexable translations", async ({ page, request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const { namespace, urls } = await parseSitemap(page, await response.text());
    expect(namespace).toBe("http://www.sitemaps.org/schemas/sitemap/0.9");

    const origin = await siteOrigin(request);
    for (const url of urls) {
      for (const href of [url.loc, ...Object.values(url.alternates)]) {
        expect(new URL(href).origin, href).toBe(origin);
        expect(new URL(href).pathname, href).not.toMatch(NOINDEX);
      }
      if (url.lastmod !== null) expect(Number.isNaN(Date.parse(url.lastmod)), url.lastmod).toBe(false);
    }

    const byPath = new Map(urls.map((url) => [new URL(url.loc).pathname, url]));
    // the shop's own pages in every locale, each with all 11 locales and x-default /en
    for (const locale of locales) {
      for (const path of [`/${locale}`, `/${locale}/shop`, `/${locale}/shop/earrings`]) {
        const url = byPath.get(path);
        expect(url, path).toBeDefined();
        expect(Object.keys(url!.alternates).sort()).toEqual([...locales, "x-default"].sort());
        expect(new URL(url!.alternates["x-default"]).pathname).toBe(path.replace(`/${locale}`, "/en"));
      }
    }

    // a product: one URL per indexable translation, alternates among those only (pl is an unreviewed machine text)
    expect(byPath.has(UNREVIEWED_PL)).toBe(false);
    const expected = { ...EARRINGS, "x-default": EARRINGS.en };
    for (const path of Object.values(EARRINGS)) {
      const url = byPath.get(path);
      expect(url, path).toBeDefined();
      expect(Object.fromEntries(Object.entries(url!.alternates).map(([l, href]) => [l, new URL(href).pathname]))).toEqual(expected);
      expect(url!.lastmod, `${path} lastmod`).not.toBeNull();
    }
  });

  test("lists only pages that answer 200 and are indexable", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the same requests on every viewport");
    const { urls } = await parseSitemap(page, await (await request.get("/sitemap.xml")).text());
    expect(urls.length).toBeGreaterThan(locales.length * 8);
    for (const { loc } of urls) {
      const response = await request.get(new URL(loc).pathname, { maxRedirects: 0 });
      expect(response.status(), loc).toBe(200);
      const html = await response.text();
      expect(html, loc).not.toContain('<meta name="robots" content="noindex');
      // its canonical is the listed URL itself
      expect(/<link rel="canonical" href="([^"]+)"/.exec(html)?.[1], loc).toBe(loc);
    }
  });
});

test("robots.txt opens the storefront, closes the private areas in every locale and names the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const lines = (await response.text()).split("\n").map((line) => line.trim());
  expect(lines).toContain("User-Agent: *");
  expect(lines).toContain("Allow: /");
  expect(lines).toContain("Disallow: /api/");
  for (const locale of locales) {
    for (const path of ["admin", "account", "cart", "checkout", "delivery-demo"]) {
      expect(lines).toContain(`Disallow: /${locale}/${path}`);
    }
  }
  expect(lines.filter((line) => line.startsWith("Disallow: ")).some((line) => /\/(shop|product|search)\b/.test(line))).toBe(false);
  expect(lines).toContain(`Sitemap: ${await siteOrigin(request)}/sitemap.xml`);
});

test.describe("share images", () => {
  for (const [what, path, alt] of [
    ["a product", EARRINGS.de, "Korallen-Tropfenohrringe"],
    ["a category", "/de/shop/earrings", deCatalog.categories.earrings],
    ["the listing", "/de/shop", deCatalog.meta.title],
    ["the home page", "/en", enHome.meta.title],
  ]) {
    test(`${what} has an og:image and an X large card: a 1200×630 PNG in its locale`, async ({ request }) => {
      const html = await (await request.get(path)).text();
      const image = metaContent(html, "og:image");
      expect(image, "og:image").not.toBeNull();
      expect(new URL(image!).pathname.startsWith(`${path}/opengraph-image`)).toBe(true);
      expect(metaContent(html, "og:image:width")).toBe("1200");
      expect(metaContent(html, "og:image:height")).toBe("630");
      expect(metaContent(html, "og:image:alt")).toBe(alt);
      expect(metaContent(html, "twitter:card")).toBe("summary_large_image");

      const response = await request.get(new URL(image!).pathname + new URL(image!).search);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
      expect(pngSize(await response.body())).toEqual({ width: 1200, height: 630 });
    });
  }

  test("the og:locale of a shop page is its own, every other locale an alternate", async ({ request }) => {
    const html = await (await request.get("/de/shop/earrings")).text();
    expect(metaContent(html, "og:locale")).toBe("de_DE");
    const alternates = [...html.matchAll(/<meta property="og:locale:alternate" content="([^"]+)"/g)].map(([, l]) => l);
    expect(alternates).toHaveLength(locales.length - 1);
    expect(alternates).not.toContain("de_DE");
    expect(metaContent(html, "og:url")).toMatch(/\/de\/shop\/earrings$/);
  });

  test("a product's image still renders without its data (an unknown slug gets the shop's plain image)", async ({ request }) => {
    const response = await request.get("/de/product/gibt-es-nicht/opengraph-image/share");
    expect(response.status()).toBe(200);
    expect(pngSize(await response.body())).toEqual({ width: 1200, height: 630 });
    // the product page itself is the 404 of the proxy, untouched by the image route
    expect((await request.get("/de/product/gibt-es-nicht")).status()).toBe(404);
  });
});

test("the home page states the Organization and the WebSite with its search action", async ({ request }) => {
  const html = await (await request.get("/de")).text();
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(([, json]) => JSON.parse(json));
  expect(scripts).toHaveLength(1);
  const [organization, website] = scripts[0]["@graph"];
  const origin = await siteOrigin(request);

  expect(scripts[0]["@context"]).toBe("https://schema.org");
  expect(organization).toMatchObject({ "@type": "Organization", "@id": `${origin}/#organization`, url: `${origin}/de` });
  expect(website).toMatchObject({
    "@type": "WebSite",
    url: `${origin}/de`,
    inLanguage: "de",
    publisher: { "@id": `${origin}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${origin}/de/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  });
  // shipping and return policies are not decided: never stated
  expect(JSON.stringify(scripts[0])).not.toMatch(/hasMerchantReturnPolicy|shippingDetails/);
});

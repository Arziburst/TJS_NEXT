import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Seeded products (supabase/seed.sql) with photos from npm run seed:images (e2e/global-setup.ts).
const SHOP = "/de/shop";
const PRODUCT = "/de/product/korallen-tropfenohrringe";

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]?.replaceAll("&amp;", "&");
}

/** The first `<img …>` or `<link …>` tag of the HTML that matches `pattern`. */
function firstTag(html: string, pattern: RegExp): string {
  const tag = html.match(new RegExp(pattern.source, "g"))?.[0];
  expect(tag, `a tag matching ${pattern}`).toBeDefined();
  return tag!;
}

function srcsetUrls(srcset: string): string[] {
  return srcset.split(", ").map((candidate) => candidate.split(" ")[0]);
}

async function optimized(request: APIRequestContext, url: string, accept: string) {
  const response = await request.get(url, { headers: { Accept: accept } });
  expect(response.status()).toBe(200);
  return response.headers()["content-type"];
}

test.describe("photos through the image optimizer (no JavaScript)", () => {
  test("shop cards: optimizer srcset, card sizes, the first row at high priority", async ({ request }) => {
    const html = await (await request.get(SHOP)).text();
    const first = firstTag(html, /<img alt="[^"]+"[^>]*>/);
    expect(attr(first, "sizes")).toBe("(min-width: 64rem) 200px, 164px");
    expect(attr(first, "fetchPriority")).toBe("high");
    expect(attr(first, "loading")).toBe("eager");
    const urls = srcsetUrls(attr(first, "srcSet")!);
    expect(urls.length).toBeGreaterThan(1);
    for (const url of urls) expect(url).toMatch(/^\/_next\/image\?url=.+&w=\d+&q=75$/);

    // the hidden hover photo waits behind the visible ones
    const hover = firstTag(html, /<img alt=""[^>]*opacity-0[^>]*>/);
    expect(attr(hover, "loading")).toBe("lazy");
    expect(attr(hover, "fetchPriority")).toBe("low");

    // no photo bypasses the optimizer
    expect(html).not.toMatch(/<img[^>]*\ssrc="https?:\/\/[^"]*\/storage\/v1\//);
  });

  test("the optimizer answers AVIF, or WebP to a browser without AVIF", async ({ request }) => {
    const html = await (await request.get(SHOP)).text();
    const url = srcsetUrls(attr(firstTag(html, /<img alt="[^"]+"[^>]*>/), "srcSet")!).find((u) => u.includes("&w=384&"));
    expect(url).toBeDefined();
    expect(await optimized(request, url!, "image/avif,image/webp,*/*")).toBe("image/avif");
    expect(await optimized(request, url!, "image/webp,*/*")).toBe("image/webp");
    // only the configured qualities are served
    expect((await request.get(url!.replace("&q=75", "&q=50"))).status()).toBe(400);
  });

  test("product gallery: the first photo is preloaded at high priority with the gallery sizes", async ({ request }) => {
    const html = await (await request.get(PRODUCT)).text();
    const preload = firstTag(html, /<link rel="preload" as="image"[^>]*>/);
    expect(attr(preload, "fetchPriority")).toBe("high");
    expect(attr(preload, "imageSizes")).toBe(
      "(min-width: 125rem) 916px, (min-width: 64rem) calc(50vw - 84px), calc(100vw - 32px)",
    );
    for (const url of srcsetUrls(attr(preload, "imageSrcSet")!)) expect(url).toMatch(/^\/_next\/image\?url=.+&q=85$/);
  });
});

/** The page's cumulative layout shift so far (shifts after input excluded, as CLS does). */
async function layoutShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const shifts = list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[];
          resolve(shifts.filter((shift) => !shift.hadRecentInput).reduce((sum, shift) => sum + shift.value, 0));
        }).observe({ type: "layout-shift", buffered: true });
        // no entry at all: the observer never calls back
        setTimeout(() => resolve(0), 500);
      }),
  );
}

/** Waits until every photo in view has loaded, then checks it came from the optimizer at a fitting width. */
async function expectPhotosLoaded(page: Page) {
  await expect
    .poll(() =>
      page.locator("main img").evaluateAll((images) =>
        (images as HTMLImageElement[])
          .filter((image) => image.getBoundingClientRect().top < window.innerHeight && image.loading !== "lazy")
          .every((image) => image.complete && image.naturalWidth > 0),
      ),
    )
    .toBe(true);
  const visible = await page.locator("main img").evaluateAll((images) =>
    (images as HTMLImageElement[])
      .filter((image) => image.complete && image.naturalWidth > 0 && !image.currentSrc.startsWith("data:"))
      .map((image) => ({ src: image.currentSrc, rendered: image.clientWidth })),
  );
  expect(visible.length).toBeGreaterThan(0);
  for (const image of visible) {
    expect(image.src).toContain("/_next/image?");
    // the width the browser picked from `sizes` is never narrower than the photo's box
    const width = Number(new URL(image.src).searchParams.get("w"));
    expect(width).toBeGreaterThanOrEqual(image.rendered);
  }
}

for (const path of [SHOP, PRODUCT]) {
  test(`photos of ${path} load optimized and shift nothing`, async ({ page }) => {
    await page.goto(path);
    await expectPhotosLoaded(page);
    expect(await layoutShift(page)).toBeLessThan(0.01);
  });
}

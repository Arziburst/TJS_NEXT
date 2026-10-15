import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import de from "../messages/de/product.json" with { type: "json" };

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

type ShiftWindow = Window & { photoShift?: number };

/** Two frames: whatever was inserted before has been laid out and its layout shift reported. */
function afterTwoFrames(page: Page): Promise<void> {
  return page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/**
 * Counts the layout shift from now on (input-driven shifts excluded, as CLS does). Started once the photos
 * are in the DOM, it measures what loading them shifts — not the earlier swap of a streamed Suspense
 * fallback for its content, which moves the footer whether or not a page has photos.
 */
async function recordShiftFromNow(page: Page) {
  await afterTwoFrames(page);
  await page.evaluate(() => {
    const w = window as ShiftWindow;
    w.photoShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) w.photoShift! += entry.value;
      }
    }).observe({ type: "layout-shift" });
  });
}

async function recordedShift(page: Page): Promise<number> {
  await afterTwoFrames(page);
  return page.evaluate(() => (window as ShiftWindow).photoShift!);
}

function photoBoxes(photos: Locator) {
  return photos.evaluateAll((images) =>
    images.map((image) => {
      const { width, height } = image.getBoundingClientRect();
      return { width, height };
    }),
  );
}

/**
 * Waits until the photos that load at once (not lazy) have loaded, and checks each loaded photo came from
 * the optimizer at a fitting width.
 */
async function expectPhotosLoaded(photos: Locator) {
  await expect
    .poll(() =>
      photos.evaluateAll((images) => {
        const eager = (images as HTMLImageElement[]).filter((image) => image.loading !== "lazy");
        return eager.length > 0 && eager.every((image) => image.complete && image.naturalWidth > 0);
      }),
    )
    .toBe(true);
  const loaded = await photos.evaluateAll((images) =>
    (images as HTMLImageElement[])
      .filter((image) => image.complete && image.naturalWidth > 0 && !image.currentSrc.startsWith("data:"))
      .map((image) => ({ src: image.currentSrc, rendered: image.clientWidth })),
  );
  expect(loaded.length).toBeGreaterThan(0);
  for (const image of loaded) {
    expect(image.src).toContain("/_next/image?");
    // the width the browser picked from `sizes` is never narrower than the photo's box
    const width = Number(new URL(image.src).searchParams.get("w"));
    expect(width).toBeGreaterThanOrEqual(image.rendered);
  }
}

const PAGES = [
  // the first-row cards (EAGER_CARDS in shop-view.tsx) load at once
  { path: SHOP, photos: (page: Page) => page.getByTestId("product-grid").locator('img[fetchpriority="high"]'), count: 4 },
  // the seeded product has three photos; the first loads at once
  { path: PRODUCT, photos: (page: Page) => page.getByRole("region", { name: de.page.gallery.label }).getByRole("img"), count: 3 },
];

for (const { path, photos, count } of PAGES) {
  test(`photos of ${path} load optimized and shift nothing`, async ({ page }) => {
    await page.goto(path);
    // the listing and the gallery stream in after the shell: wait for the page's photos first
    await expect(photos(page)).toHaveCount(count);
    await recordShiftFromNow(page);
    const boxes = await photoBoxes(photos(page));
    await expectPhotosLoaded(photos(page));
    // a loaded photo keeps the box it had before, and loading the photos shifts nothing
    expect(await photoBoxes(photos(page))).toEqual(boxes);
    expect(await recordedShift(page)).toBeLessThan(0.01);
  });
}

import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import type { TagManifestEntry } from "next/dist/server/lib/incremental-cache/tags-manifest.external";
import RouteCacheHandler, { changedSince, routeTags } from "./route-cache-handler";

// the tags manifest Next's updateTag writes to (the same module instance the handler reads)
const require = createRequire(import.meta.url);
const { tagsManifest }: { tagsManifest: Map<string, TagManifestEntry> } = require(
  "next/dist/server/lib/incremental-cache/tags-manifest.external.js",
);
const { nodeFs } = require("next/dist/server/lib/node-fs-methods.js");

const distDir = mkdtempSync(join(tmpdir(), "tjs-route-cache-"));
const usedTags: string[] = [];

type GetCtx = Parameters<RouteCacheHandler["get"]>[1];
type SetData = Parameters<RouteCacheHandler["set"]>[1];
type SetCtx = Parameters<RouteCacheHandler["set"]>[2];

// one handler per request, as Next creates them
function handler() {
  return new RouteCacheHandler({
    fs: nodeFs,
    serverDistDir: distDir,
    flushToDisk: false,
    // Next's default: the stored pages live in memory (and on disk, left out here)
    maxMemoryCacheSize: 50 * 1024 * 1024,
    revalidatedTags: [],
    _requestHeaders: {},
  });
}

const PAGE = { kind: "APP_PAGE", isRoutePPREnabled: false, isFallback: false } as unknown as GetCtx;
const STORE = { cacheControl: { revalidate: 86_400, expire: 86_400 } } as SetCtx;

function page(tags: string[]): SetData {
  return {
    kind: "APP_PAGE",
    html: "<p>the product</p>",
    rscData: undefined,
    headers: { "x-next-cache-tags": tags.join(",") },
    postponed: undefined,
    status: 200,
    segmentData: undefined,
  } as unknown as SetData;
}

function newTag(): string {
  const tag = `product:${randomUUID()}`;
  usedTags.push(tag);
  return tag;
}

// what Next's updateTag does: the tag expires now
function updateTag(tag: string, at = Date.now()) {
  tagsManifest.set(tag, { expired: at });
}

// a few milliseconds between two steps, more than the skew of Next's two clocks
const sleep = () => new Promise((resolve) => setTimeout(resolve, 5));

const routeKey = () => `/route-cache/APP_PAGE/test/$/uk/product/${randomUUID()}`;

afterEach(() => {
  for (const tag of usedTags.splice(0)) tagsManifest.delete(tag);
});
afterAll(() => rmSync(distDir, { recursive: true, force: true }));

describe("changedSince", () => {
  const manifest = new Map<string, TagManifestEntry>([
    ["written", { expired: 2_000 }],
    ["stale", { stale: 2_000 }],
    ["later", { expired: 9_000 }],
  ]);

  it("counts a tag expired or marked stale between the start and now, both ends included", () => {
    expect(changedSince(["written"], 1_000, 3_000, manifest)).toBe(true);
    expect(changedSince(["written"], 2_000, 2_000, manifest)).toBe(true);
    expect(changedSince(["stale"], 1_000, 3_000, manifest)).toBe(true);
  });

  it("ignores a write before the start, a future expiry and unknown tags", () => {
    expect(changedSince(["written"], 2_001, 3_000, manifest)).toBe(false);
    expect(changedSince(["later"], 1_000, 3_000, manifest)).toBe(false);
    expect(changedSince(["unknown"], 1_000, 3_000, manifest)).toBe(false);
    expect(changedSince([], 1_000, 3_000, manifest)).toBe(false);
  });
});

describe("routeTags", () => {
  it("reads a rendered route's tags header", () => {
    expect(routeTags(page(["catalog", "product:1"]))).toEqual(["catalog", "product:1"]);
  });

  it("is empty for an entry without tags and for anything that is not a route", () => {
    expect(routeTags(page([]))).toEqual([]);
    expect(routeTags(null)).toEqual([]);
    expect(routeTags({ kind: "FETCH", data: { headers: {}, body: "", url: "" }, revalidate: 60 } as unknown as SetData)).toEqual([]);
  });
});

describe("RouteCacheHandler", () => {
  it("stores a render when nothing it shows was written meanwhile", async () => {
    const key = routeKey();
    const tag = newTag();
    const request = handler();
    expect(await request.get(key, PAGE)).toBeNull();
    await request.set(key, page([tag]), STORE);
    expect((await handler().get(key, PAGE))?.value).toMatchObject({ kind: "APP_PAGE" });
  });

  it("stores a render that started after the write", async () => {
    const key = routeKey();
    const tag = newTag();
    updateTag(tag, Date.now() - 1_000);
    const request = handler();
    await request.get(key, PAGE);
    await request.set(key, page([tag]), STORE);
    expect(await handler().get(key, PAGE)).not.toBeNull();
  });

  it("does not store a render during which one of its tags was expired (#93)", async () => {
    const key = routeKey();
    const tag = newTag();
    const request = handler();
    await request.get(key, PAGE);
    updateTag(tag);
    await request.set(key, page(["catalog", tag]), STORE);
    expect(await handler().get(key, PAGE)).toBeNull();
  });

  it("keeps the expired page instead: the next request renders it again", async () => {
    const key = routeKey();
    const tag = newTag();
    const first = handler();
    await first.get(key, PAGE);
    await first.set(key, page([tag]), STORE);

    // #18: a first photo's save expires the page, a render starts, a second photo's save lands during it
    await sleep();
    updateTag(tag);
    await sleep();
    const second = handler();
    expect(await second.get(key, PAGE)).toBeNull();
    await sleep();
    updateTag(tag);
    await second.set(key, page([tag]), STORE);
    // that render is not stored over the expired page: the next request renders it again (a read stamps a
    // render as due from the earlier of Next's two clocks, so it comes a few milliseconds after the write here)
    await sleep();
    expect(await handler().get(key, PAGE)).toBeNull();

    // and that render, after both writes, is stored
    await sleep();
    const third = handler();
    await third.get(key, PAGE);
    await third.set(key, page([tag]), STORE);
    expect(await handler().get(key, PAGE)).not.toBeNull();
  });

  it("does not store a background render over a stale page when the tag changes again during it", async () => {
    const key = routeKey();
    const tag = newTag();
    const first = handler();
    await first.get(key, PAGE);
    await first.set(key, page([tag]), STORE);
    const stored = await handler().get(key, PAGE);

    // revalidateTag with a profile marks the tag stale: Next serves the page and renders it in the background
    await sleep();
    tagsManifest.set(tag, { stale: Date.now() });
    await sleep();
    const second = handler();
    expect(await second.get(key, PAGE)).not.toBeNull();
    await sleep();
    tagsManifest.set(tag, { stale: Date.now() });
    await second.set(key, page([tag]), STORE);
    // the stale page stays (and is rendered again in the background by the next request)
    expect((await handler().get(key, PAGE))?.lastModified).toBe(stored?.lastModified);
  });

  it("does not store a render that another request's handler stores (a background upgrade)", async () => {
    const key = routeKey();
    const tag = newTag();
    await handler().get(key, PAGE);
    updateTag(tag);
    await handler().set(key, page([tag]), STORE);
    expect(await handler().get(key, PAGE)).toBeNull();
  });

  it("dates the render from the first read: a later read during it does not hide the write", async () => {
    const key = routeKey();
    const tag = newTag();
    await handler().get(key, PAGE);
    updateTag(tag);
    await sleep();
    await handler().get(key, PAGE);
    await handler().set(key, page([tag]), STORE);
    expect(await handler().get(key, PAGE)).toBeNull();
  });
});

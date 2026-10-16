/*
 * The route cache of a self-hosted server (`next start`, the CI e2e), without the render race of #93.
 *
 * Next 16.4.1 stores a rendered page with the time it was STORED: a render that read the catalog before an
 * admin write's updateTag and finished after it is kept as newer than the write, so its old data is served
 * until the page's revalidate time or the next write (docs/standards.md §3, "A render that started before a
 * write is never stored"). This handler is Next's own file system cache, except that it refuses to store a
 * page whose tags were expired (or marked stale) while it rendered: the cached page then stays expired and
 * the next request renders it again with the written data.
 *
 * Loaded by Node itself for the pages (next.config.ts `cacheHandler`) and bundled into the route handlers'
 * chunks by the build, so: no path aliases, no "server-only", erasable TypeScript only, shared state on
 * globalThis. Not used on Vercel, whose own cache serves the pages there.
 */
import { createRequire } from "node:module";
import type { CacheHandler } from "next/dist/server/lib/incremental-cache";
import type NextFileSystemCache from "next/dist/server/lib/incremental-cache/file-system-cache";
import type { TagManifestEntry } from "next/dist/server/lib/incremental-cache/tags-manifest.external";

const require = createRequire(import.meta.url);
// Next's own modules (exact version pinned in package.json); the tags manifest is the one module instance the
// server's updateTag and revalidateTag write to (the ".external" modules are shared, never bundled)
const FileSystemCache: typeof NextFileSystemCache = require("next/dist/server/lib/incremental-cache/file-system-cache.js").default;
const { tagsManifest }: { tagsManifest: Map<string, TagManifestEntry> } = require(
  "next/dist/server/lib/incremental-cache/tags-manifest.external.js",
);

type GetArgs = Parameters<CacheHandler["get"]>;
type SetArgs = Parameters<CacheHandler["set"]>;

/** The entries of a rendered route (a page, a route handler); not the fetch cache, not optimized images. */
const RESPONSE_KINDS: ReadonlySet<string> = new Set(["APP_PAGE", "APP_ROUTE", "PAGES"]);
// the header Next stores a rendered route's cache tags in (next/dist/lib/constants NEXT_CACHE_TAGS_HEADER)
const TAGS_HEADER = "x-next-cache-tags";

/**
 * Whether any of `tags` was expired or marked stale in [startedAt, now]: the render that started at
 * `startedAt` may have read the data before that write.
 */
export function changedSince(
  tags: readonly string[],
  startedAt: number,
  now: number,
  manifest: ReadonlyMap<string, TagManifestEntry> = tagsManifest,
): boolean {
  return tags.some((tag) => {
    const entry = manifest.get(tag);
    return [entry?.expired, entry?.stale].some((at) => at !== undefined && at >= startedAt && at <= now);
  });
}

/** The cache tags a rendered route was stored with, empty for anything else. */
export function routeTags(data: SetArgs[1]): string[] {
  if (data === null || !RESPONSE_KINDS.has(data.kind) || !("headers" in data)) return [];
  const header = data.headers?.[TAGS_HEADER];
  return typeof header === "string" && header !== "" ? header.split(",") : [];
}

// Next stamps tags with two clocks (Date.now and performance time): a render is due from the earlier of them
// and stored at the later, so a write at either end is never missed
function clocks(): [earlier: number, later: number] {
  const wall = Date.now();
  const performanceTime = performance.timeOrigin + performance.now();
  return [Math.min(wall, performanceTime), Math.max(wall, performanceTime)];
}

type CachedRoute = Awaited<ReturnType<CacheHandler["get"]>>;

/**
 * Whether Next may render the route again after this read: nothing usable cached (missing, or a tag expired),
 * past its revalidate time, a tag marked stale since it was stored, or a lifetime this handler cannot see (#116:
 * a page seeded by the build has no cacheControl in its metadata, Next takes it from the prerender manifest). An
 * unknown lifetime counts as due: if no render follows, the next store is checked from this earlier read, which
 * at worst refuses one store and costs one more render; never a store left unchecked.
 */
function needsRender(cached: CachedRoute, now: number): boolean {
  if (cached === null || cached.value === null) return true;
  if (cached.cacheControl === undefined) return true;
  const revalidate = cached.cacheControl.revalidate;
  if (typeof revalidate === "number" && cached.lastModified + revalidate * 1000 <= now) return true;
  return routeTags(cached.value).some((tag) => (tagsManifest.get(tag)?.stale ?? 0) > cached.lastModified);
}

/**
 * Since when a render of each route is due: set by the read that found the route missing, expired or past its
 * revalidate time (a render follows it), cleared by the store of that render. Kept for the whole server, not
 * per handler: Next creates a handler per request, and a render it upgrades in the background (a page first
 * served from its fallback shell) is stored by another request's handler. The first read counts, so a later
 * read during the render cannot hide a write that came before it. On globalThis: the build also bundles a copy
 * of this module into the route handlers' chunks, and both copies must see the same renders.
 */
const RENDER_DUE_SINCE = Symbol.for("tjs.routeCache.renderDueSince");
const renderDueSince: Map<string, number> = ((globalThis as Record<symbol, unknown>)[RENDER_DUE_SINCE] ??=
  new Map<string, number>()) as Map<string, number>;

export default class RouteCacheHandler extends FileSystemCache {
  override async get(...args: GetArgs) {
    const [key, ctx] = args;
    const [readAt] = clocks();
    const cached = await super.get(...args);
    if (RESPONSE_KINDS.has(ctx.kind) && !renderDueSince.has(key) && needsRender(cached, readAt)) {
      renderDueSince.set(key, readAt);
    }
    return cached;
  }

  override async set(...args: SetArgs) {
    const [key, data] = args;
    const startedAt = renderDueSince.get(key);
    renderDueSince.delete(key);
    // the render may have read the data before a write that expired its tags: keep the expired entry instead
    if (startedAt !== undefined && changedSince(routeTags(data), startedAt, clocks()[1])) return;
    return super.set(...args);
  }
}

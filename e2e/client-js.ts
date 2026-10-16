import { gzipSync } from "node:zlib";

/*
 * First-load JavaScript of a page (#105): every script the HTML makes the browser load before it can hydrate —
 * the <script src> tags and the chunks the inline RSC payload and Turbopack's bootstrap name — without the
 * nomodule polyfills a module browser skips. Chunks loaded later (a sheet on first use, the toaster after the
 * page) are not named in the HTML, so they do not count.
 */
export function firstLoadScripts(html: string): string[] {
  const scripts = new Set<string>();
  const nomodule = new Set<string>();
  for (const [tag, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)) {
    if (/\bnomodule\b/i.test(tag)) nomodule.add(src);
    else scripts.add(src);
  }
  for (const [path] of html.matchAll(/static\/chunks\/[\w.~-]+\.js/g)) {
    const src = `/_next/${path}`;
    if (!nomodule.has(src)) scripts.add(src);
  }
  return [...scripts].sort();
}

/** The transfer size of a script as the server's gzip sends it (zlib's default level, as `next start`). */
export function gzipSize(body: Buffer): number {
  return gzipSync(body).length;
}

export type RouteSize = { route: string; kilobytes: number };

/** The routes over their budget, as messages; empty when all fit. */
export function overBudget(sizes: RouteSize[], budgets: Record<string, number>): string[] {
  return sizes
    .filter(({ route, kilobytes }) => kilobytes > budgets[route])
    .map(({ route, kilobytes }) => `${route}: ${kilobytes.toFixed(1)} KB of first-load JS, budget ${budgets[route]} KB`);
}

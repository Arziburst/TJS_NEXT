import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Product photos come from the public product-images bucket of the production Supabase project and of the
// configured one (a local stack in dev and e2e), so every build optimizes production photos.
const PRODUCT_IMAGES_PATH = "/storage/v1/object/public/product-images/**";
const PRODUCTION_SUPABASE_URL = "https://zmwjhpodaxyphlyzwedf.supabase.co";

function productImagesPatterns(): URL[] {
  const urls = new Set([PRODUCTION_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]);
  return [...urls].filter((url) => url !== undefined && url !== "").map((url) => new URL(PRODUCT_IMAGES_PATH, url));
}

const imagesPatterns = productImagesPatterns();
// a local Supabase stack listens on a loopback address, which the image optimizer refuses by default
const isLocalStack = imagesPatterns.some(({ hostname }) => ["127.0.0.1", "localhost"].includes(hostname));

const nextConfig: NextConfig = {
  // the Vercel image optimizer serves every photo; the choice and its cost notes: docs/standards.md §5
  images: {
    remotePatterns: imagesPatterns,
    dangerouslyAllowLocalIP: isLocalStack,
    // AVIF first (about 20% smaller than WebP), WebP for browsers without AVIF
    formats: ["image/avif", "image/webp"],
    // srcset widths: cards (164/200px) and tiles (60/100px) at 1–3x, the gallery up to 916px at 2x; no
    // 32/48 (smaller than any photo box at 1x) and no 2048/3840 (wider than any photo at 2x)
    imageSizes: [64, 96, 128, 256, 384],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // 75 for thumbnails (catalog cards, category tiles), 85 for the product gallery
    qualities: [75, 85],
    // optimized photos stay cached for 31 days: a changed photo gets a new storage path, never an overwrite
    minimumCacheTTL: 2_678_400,
  },
  // a self-hosted server (`next start`, the CI e2e) never stores a page whose tags were expired while it
  // rendered (#93, docs/standards.md §3); on Vercel the platform's cache serves the pages, so Next's stays
  cacheHandler: process.env.VERCEL ? undefined : fileURLToPath(new URL("./src/lib/catalog/route-cache-handler.ts", import.meta.url)),
  cacheComponents: true,
  cacheLife: {
    // `days` without its stale window (expire = revalidate) for entries in a prerendered route shell: a
    // longer expire makes `next start` send `stale-while-revalidate` with the route, so the browser answers
    // its prefetch from the HTTP cache and revalidates in the background (#79, docs/standards.md §3)
    daysNoSwr: { stale: 300, revalidate: 86_400, expire: 86_400 },
  },
  partialPrefetching: true,
  typedRoutes: true,
  // dev only: browser tooling that opens 127.0.0.1 instead of localhost would otherwise get
  // every dev chunk blocked as cross-origin, and the page never hydrates
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // the root layout is app/[locale]/layout.tsx, so an unknown locale needs a layout-free 404
    globalNotFound: true,
  },
};

export default withNextIntl(nextConfig);

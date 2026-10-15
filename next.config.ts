import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Product photos come from the public product-images bucket of the configured Supabase project.
function productImagesPattern(): URL | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? new URL("/storage/v1/object/public/product-images/**", url) : null;
}

const imagesPattern = productImagesPattern();
// a local Supabase stack listens on a loopback address, which the image optimizer refuses by default
const isLocalStack = imagesPattern !== null && ["127.0.0.1", "localhost"].includes(imagesPattern.hostname);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: imagesPattern ? [imagesPattern] : [],
    dangerouslyAllowLocalIP: isLocalStack,
  },
  cacheComponents: true,
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

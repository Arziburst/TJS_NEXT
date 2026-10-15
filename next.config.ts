import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  // dev only: browser tooling that opens 127.0.0.1 instead of localhost would otherwise get
  // every dev chunk blocked as cross-origin, and the page never hydrates
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;

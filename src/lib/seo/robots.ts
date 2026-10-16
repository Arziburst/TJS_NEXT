import type { MetadataRoute } from "next";
import { routes } from "@/config/routes";
import { locales } from "@/i18n/routing";

/*
 * One robots.txt for every locale: the storefront is open, the private and technical areas are not crawled.
 * Each private path is listed per locale prefix: a wildcard for the locale segment would match anywhere in the
 * path, so also a product slug that happens to start with "cart". Pages that are only noindex (search, favorites, sign-in) stay crawlable,
 * so a crawler can read their noindex and follow their links.
 */
const PRIVATE_PATHS = [
  routes.admin.path,
  // the customer's account (#28)
  routes.account.path,
  routes.cart.path,
  routes.orderRequest.path,
  // the delivery demo and the dev-only UI kit
  "/delivery-demo",
  "/ui-kit",
] as const;

export function buildRobots(base: URL): MetadataRoute.Robots {
  const disallow = ["/api/", ...locales.flatMap((locale) => PRIVATE_PATHS.map((path) => `/${locale}${path}`))];
  return {
    rules: { userAgent: "*", allow: "/", disallow },
    sitemap: new URL("/sitemap.xml", base).href,
  };
}

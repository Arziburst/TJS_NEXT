import { hasLocale } from "next-intl";
import { defaultLocale, routing, type Locale } from "@/i18n/routing";
import type { CategorySlug } from "@/lib/catalog/categories";

/*
 * The URL shapes of the legacy shop (coordinator/research/frontend.md §2: react-router paths without a locale)
 * and where each one lives now (#31). Pure: src/proxy.ts answers them with a 308 in the visitor's locale, and
 * src/lib/redirects/legacy-product.ts resolves a legacy product id.
 */

// the legacy `type` segment (ENUM_CATEGORIES) → the category slug of D9
const LEGACY_CATEGORIES: Record<string, CategorySlug> = {
  earrings: "earrings",
  necklace: "necklaces",
  bracelets: "bracelets",
  corals: "corals",
  rings: "rings",
  brooch: "brooches",
};

// a MongoDB ObjectId, the form of products.legacy_id
const LEGACY_ID = /^[0-9a-f]{24}$/;

// legacy pages with a fixed new path (after /<locale>)
const FIXED_PATHS: Record<string, string> = {
  "/about-us": "/about",
  "/cart": "/cart",
  // the mobile checkout form of the legacy cart
  "/order-details": "/checkout",
  // the legacy order confirmation and failure pages had no state of their own once left
  "/payment-success": "/shop",
  "/payment-fail": "/cart",
  "/sign-in-and-up": "/sign-in-and-up",
  "/add-item": "/admin/products/new",
  "/orders": "/admin/orders",
};

export type LegacyTarget =
  /** a path below /<locale> */
  | { kind: "path"; path: string }
  /** /product/<legacy id>[/management]: the product's page or its admin edit page, once the id is resolved */
  | { kind: "product"; legacyId: string; management: boolean };

/** Where a legacy URL goes, or null when the path is not one of the legacy shapes. */
export function legacyTarget(pathname: string): LegacyTarget | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const segments = path.split("/").filter(Boolean);
  const [first, second, third] = segments;

  if (FIXED_PATHS[path]) return { kind: "path", path: FIXED_PATHS[path] };

  if (first === "shop" && segments.length <= 2) {
    // /shop, /shop/see-all and an unknown type all list the whole shop
    const category = second === undefined ? undefined : LEGACY_CATEGORIES[second.toLowerCase()];
    return { kind: "path", path: category ? `/shop/${category}` : "/shop" };
  }

  if (first === "product" && (segments.length === 2 || (segments.length === 3 && third === "management"))) {
    const legacyId = second.toLowerCase();
    // a malformed id cannot be one of ours: straight to the shop, no lookup
    if (!LEGACY_ID.test(legacyId)) return { kind: "path", path: "/shop" };
    return { kind: "product", legacyId, management: segments.length === 3 };
  }

  // the legacy admin order page: its Mongo order ids have no counterpart, so the orders list
  if (first === "order" && segments.length === 2) return { kind: "path", path: "/admin/orders" };

  return null;
}

// the locale cookie of src/i18n/routing.ts
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * The visitor's locale as next-intl would pick it for an unprefixed URL (src/i18n/routing.ts): the locale
 * cookie, then the best Accept-Language range among our locales (D27: by primary language, regional variants
 * match), then the default.
 */
export function visitorLocale(cookieLocale: string | undefined, acceptLanguage: string | null): Locale {
  if (cookieLocale && hasLocale(routing.locales, cookieLocale)) return cookieLocale;
  const ranges = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [range, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { language: range.split("-")[0].trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { language } of ranges) if (hasLocale(routing.locales, language)) return language;
  return defaultLocale;
}

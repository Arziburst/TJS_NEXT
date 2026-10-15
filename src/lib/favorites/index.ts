import "server-only";

import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";
import { cache } from "react";
import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { getCartProducts, type CartProduct } from "@/lib/cart/products";
import { createSessionClient } from "@/lib/supabase/server";
import { mergeFavorites } from "./ids";
import { readAccountFavorites, readGuestFavorites } from "./store";

export type FavoriteIds =
  | {
      ok: true;
      /** Newest first. */
      ids: string[];
      /** A signed-in shopper still has a guest cookie: its favorites are shown and not yet written to the account. */
      pendingMerge: boolean;
    }
  | { ok: false };

/**
 * The current request's favorites: the guest cookie, or for a signed-in shopper their saved favorites merged
 * with any guest favorites from before the sign-in. Read once per request (header and page share it).
 * Request-time data: render callers inside <Suspense>.
 */
export const getFavoriteIds = cache(async (): Promise<FavoriteIds> => {
  const [user, guest] = await Promise.all([getCurrentUser(), readGuestFavorites()]);
  if (!user) return { ok: true, ids: guest, pendingMerge: false };
  try {
    const account = await readAccountFavorites(await createSessionClient());
    if (!account) return { ok: false };
    return { ok: true, ids: mergeFavorites(account, guest), pendingMerge: guest.length > 0 };
  } catch {
    return { ok: false };
  }
});

/** Sold, reserved by an order, or no longer published (or deleted). */
export type FavoriteStatus = "available" | "sold" | "reserved" | "unavailable";

export type FavoriteItem = {
  productId: string;
  /** null when the product is no longer published (or was deleted): only its removal is offered. */
  product: CartProduct | null;
  status: FavoriteStatus;
};

export type FavoritesView = { ok: true; items: FavoriteItem[] } | { ok: false };

/**
 * The favorites with every product re-read from the catalog (status, price) on each render, as the cart does;
 * nothing about a product comes from the client. Read once per request.
 */
export const getFavoritesView = cache(async (): Promise<FavoritesView> => {
  const [favorites, requested] = await Promise.all([getFavoriteIds(), getLocale()]);
  if (!favorites.ok) return { ok: false };
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const read = await getCartProducts(favorites.ids, locale);
  if (!read.ok) return { ok: false };
  return {
    ok: true,
    items: favorites.ids.map((productId): FavoriteItem => {
      const product = read.products.get(productId) ?? null;
      return { productId, product, status: product ? product.availability : "unavailable" };
    }),
  };
});

import "server-only";

import { getLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { cache } from "react";
import { routing, type Locale } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";
import type { ProductVariant } from "@/lib/catalog/types";
import { checkLineVariant, clampQuantity, countPieces, mergeLines, type CartLine } from "./lines";
import { getCartProducts, type CartProduct } from "./products";
import { readAccountLines, readGuestLines } from "./store";

export type { CartLine } from "./lines";
export type { CartProduct } from "./products";

export type CartLines =
  | {
      ok: true;
      lines: CartLine[];
      /** A signed-in shopper still has a guest cookie: its lines are shown and not yet written to the account. */
      pendingMerge: boolean;
    }
  | { ok: false };

/**
 * The current request's cart lines: the guest cookie, or for a signed-in shopper their saved lines merged
 * with any guest lines from before the sign-in. Read once per request (header and page share it).
 * Request-time data: render callers inside <Suspense>.
 */
export const getCartLines = cache(async (): Promise<CartLines> => {
  const [user, guest] = await Promise.all([getCurrentUser(), readGuestLines()]);
  if (!user) return { ok: true, lines: guest, pendingMerge: false };
  try {
    const account = await readAccountLines(await createSessionClient());
    if (!account) return { ok: false };
    return { ok: true, lines: mergeLines(account, guest), pendingMerge: guest.length > 0 };
  } catch {
    return { ok: false };
  }
});

/** Why a line cannot be ordered: sold, reserved by another order, or no longer published (or deleted). */
export type CartItemStatus = "available" | "sold" | "reserved" | "unavailable";

export type CartItem = {
  line: CartLine;
  /** null when the product is no longer published (or was deleted): only its removal is offered. */
  product: CartProduct | null;
  /** The line's size (#66), also when it cannot be ordered now; null without one or when it was deleted. */
  variant: ProductVariant | null;
  /** The line's unit price in USD cents: the variant's price, else the product's. */
  unitUsdMinor: number;
  status: CartItemStatus;
  /** The line's quantity within the product's limits (a one-of-a-kind piece is always 1). */
  quantity: number;
};

export type CartView =
  | {
      ok: true;
      items: CartItem[];
      /** Every piece in the cart, orderable or not: the header's count. */
      pieces: number;
      pendingMerge: boolean;
    }
  | { ok: false };

/** A line of a sold or reserved piece says so; a missing product, or a size that is gone or off, is unavailable. */
function statusOf(product: CartProduct | null, line: CartLine): CartItemStatus {
  if (!product) return "unavailable";
  if (product.availability !== "available") return product.availability;
  return checkLineVariant(product.variants, line.variantId).ok ? "available" : "unavailable";
}

/**
 * The cart with every product re-checked against the catalog (status, price) on each render; nothing about a
 * product comes from the client. Read once per request.
 */
export const getCartView = cache(async (): Promise<CartView> => {
  const requested = await getLocale();
  return readCartView(hasLocale(routing.locales, requested) ? requested : routing.defaultLocale);
});

/**
 * The cart view in a given locale, read fresh: for a Server Action, which has no route locale to read (the
 * checkout takes it as validated input).
 */
export async function readCartView(locale: Locale): Promise<CartView> {
  const cart = await getCartLines();
  if (!cart.ok) return { ok: false };
  const read = await getCartProducts(
    cart.lines.map((line) => line.productId),
    locale,
  );
  if (!read.ok) return { ok: false };
  const items = cart.lines.map((line): CartItem => {
    const product = read.products.get(line.productId) ?? null;
    const variant = product?.variants.find((v) => v.id === line.variantId) ?? null;
    return {
      line,
      product,
      variant,
      unitUsdMinor: variant?.priceUsdMinor ?? product?.priceUsdMinor ?? 0,
      status: statusOf(product, line),
      quantity: clampQuantity(line.quantity, product?.fulfillment ?? null),
    };
  });
  return {
    ok: true,
    items,
    pieces: countPieces(items.map((item) => ({ ...item.line, quantity: item.quantity }))),
    pendingMerge: cart.pendingMerge,
  };
}

/** The lines that count towards the subtotal: orderable lines only, at their current database price. */
export function orderableLines(items: readonly CartItem[]): { usdMinor: number; quantity: number }[] {
  return items
    .filter((item): item is CartItem & { product: CartProduct } => item.status === "available" && item.product !== null)
    .map((item) => ({ usdMinor: item.unitUsdMinor, quantity: item.quantity }));
}

/** The key of a cart line in a list (two sizes of one product are two lines). */
export function lineKey(line: CartLine): string {
  return `${line.productId}:${line.variantId ?? ""}`;
}

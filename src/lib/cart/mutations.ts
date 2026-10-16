import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { clientIp } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";
import type { ProductAvailability, ProductFulfillment } from "@/lib/catalog/types";
import { createPublicServerClient, createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { checkLineVariant, clampQuantity, mergeLines, type CartLine } from "./lines";
import { readAccountLines, readGuestLines, saveAccountLines, writeGuestLines } from "./store";

// Technical: generous for a person (one cart click a second, sustained), tight enough for a script.
export const CART_RATE_LIMIT = { max: 60, windowSeconds: 60 } as const;

function hashed(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** A per-visitor limit of a shop action: at most `max` calls in `windowSeconds`. */
export type VisitorRateLimit = { readonly max: number; readonly windowSeconds: number };

/**
 * Counts one action of the caller in `scope` (the account when signed in, else the client's IP) and answers
 * whether it may go ahead. Fails closed: without the counter the database is unreachable for the action too.
 * Shared by the cart and the favorites.
 */
export async function allowVisitorAction(scope: string, limit: VisitorRateLimit, userId: string | null): Promise<boolean> {
  const who = userId ? `user:${hashed(userId)}` : `ip:${hashed(clientIp(await headers()))}`;
  try {
    const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
      p_key: `${scope}:${who}`,
      p_max: limit.max,
      p_window_seconds: limit.windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export type OrderableProduct = {
  id: string;
  fulfillment: ProductFulfillment;
  availability: ProductAvailability;
  /** Its live variants (RLS hides the deleted ones). */
  variants: { id: string; available: boolean }[];
};

/** A published product as the public sees it (RLS hides drafts and deleted ones), or null; read fresh. */
export async function readProductForCart(productId: string): Promise<OrderableProduct | null | "error"> {
  try {
    const { data, error } = await createPublicServerClient()
      .from("products")
      .select("id, fulfillment, availability, product_variants(id, is_available)")
      .eq("id", productId)
      .eq("status", "published")
      .maybeSingle();
    if (error) return "error";
    if (!data) return null;
    const { product_variants: variants, ...product } = data;
    return { ...product, variants: variants.map((v) => ({ id: v.id, available: v.is_available })) };
  } catch {
    return "error";
  }
}

/**
 * Refuses a line the product cannot take now: the product is unpublished, sold or reserved, or the line's variant
 * is missing (a product with variants), gone, off, or named for a product without variants (#66).
 */
export function refuseLine(
  product: OrderableProduct | null,
  variantId: string | null,
): "unavailable" | "variantRequired" | null {
  if (!product || product.availability !== "available") return "unavailable";
  const check = checkLineVariant(product.variants, variantId);
  return check.ok ? null : check.reason;
}

export type VisibleProduct = { fulfillment: ProductFulfillment; variantIds: ReadonlySet<string> };

/**
 * The products among `ids` that the public can see, with their fulfillment and live variants: anything else cannot
 * be written to an account (the cart_items and favorites policies refuse it) and is dropped when a guest list is
 * merged. Null when the read fails.
 */
export async function visibleProducts(ids: readonly string[]): Promise<Map<string, VisibleProduct> | null> {
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await createPublicServerClient()
      .from("products")
      .select("id, fulfillment, product_variants(id)")
      .in("id", [...new Set(ids)])
      .eq("status", "published");
    if (error) return null;
    return new Map(
      data.map((row) => [row.id, { fulfillment: row.fulfillment, variantIds: new Set(row.product_variants.map((v) => v.id)) }]),
    );
  } catch {
    return null;
  }
}

/** A change's outcome: the new lines and what to answer, or a refusal (nothing is written). */
export type CartChange<R, F extends string> = { lines: CartLine[]; result: R } | { refused: F };

export type MutationFailure = "rateLimited" | "unexpectedError";

export type ChangeCartResult<R, F extends string> = { ok: true; result: R } | { ok: false; reason: F | MutationFailure };

/**
 * Runs one cart change for the current visitor, who is re-read from the session (never trusted from the
 * client). A guest's lines live in the cookie; a signed-in shopper's in cart_items, where any guest lines
 * from before the sign-in are merged in first (idempotently) and the cookie is then cleared.
 */
export async function changeCart<R, F extends string>(
  change: (lines: CartLine[]) => Promise<CartChange<R, F>>,
): Promise<ChangeCartResult<R, F>> {
  const user = await getCurrentUser();
  if (!(await allowVisitorAction("cart", CART_RATE_LIMIT, user?.id ?? null))) return { ok: false, reason: "rateLimited" };
  try {
    const guest = await readGuestLines();
    if (!user) {
      const outcome = await change(guest);
      if ("refused" in outcome) return { ok: false, reason: outcome.refused };
      await writeGuestLines(outcome.lines);
      return { ok: true, result: outcome.result };
    }

    const client = await createSessionClient();
    const account = await readAccountLines(client);
    if (!account) return { ok: false, reason: "unexpectedError" };
    const visible = await visibleProducts(guest.map((line) => line.productId));
    if (!visible) return { ok: false, reason: "unexpectedError" };
    const base = mergeLines(
      account,
      guest.flatMap((line) => {
        const product = visible.get(line.productId);
        // the policies take only a live variant of the line's product
        if (!product || (line.variantId !== null && !product.variantIds.has(line.variantId))) return [];
        return [{ ...line, quantity: clampQuantity(line.quantity, product.fulfillment) }];
      }),
    );

    const outcome = await change(base);
    if ("refused" in outcome) {
      // a refused change still keeps the merge, so the cookie never outlives the sign-in for long
      if (guest.length > 0 && (await saveAccountLines(client, user.id, account, base))) await writeGuestLines([]);
      return { ok: false, reason: outcome.refused };
    }
    if (!(await saveAccountLines(client, user.id, account, outcome.lines))) return { ok: false, reason: "unexpectedError" };
    if (guest.length > 0) await writeGuestLines([]);
    return { ok: true, result: outcome.result };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

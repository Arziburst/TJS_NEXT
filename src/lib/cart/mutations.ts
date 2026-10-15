import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { clientIp } from "@/lib/auth/rate-limit";
import { getCurrentUser } from "@/lib/auth/session";
import type { ProductAvailability, ProductFulfillment } from "@/lib/catalog/types";
import { createPublicServerClient, createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { clampQuantity, mergeLines, type CartLine } from "./lines";
import { readAccountLines, readGuestLines, saveAccountLines, writeGuestLines } from "./store";

// Technical: generous for a person (one cart click a second, sustained), tight enough for a script.
export const CART_RATE_LIMIT = { max: 60, windowSeconds: 60 } as const;

function hashed(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/**
 * Counts one cart action of the caller (the account when signed in, else the client's IP) and answers
 * whether it may go ahead. Fails closed: without the counter the database is unreachable for the cart too.
 */
async function allowCartAction(userId: string | null): Promise<boolean> {
  const who = userId ? `user:${hashed(userId)}` : `ip:${hashed(clientIp(await headers()))}`;
  try {
    const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
      p_key: `cart:${who}`,
      p_max: CART_RATE_LIMIT.max,
      p_window_seconds: CART_RATE_LIMIT.windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export type OrderableProduct = { id: string; fulfillment: ProductFulfillment; availability: ProductAvailability };

/** A published product as the public sees it (RLS hides drafts and deleted ones), or null; read fresh. */
export async function readProductForCart(productId: string): Promise<OrderableProduct | null | "error"> {
  try {
    const { data, error } = await createPublicServerClient()
      .from("products")
      .select("id, fulfillment, availability")
      .eq("id", productId)
      .eq("status", "published")
      .maybeSingle();
    if (error) return "error";
    return data;
  } catch {
    return "error";
  }
}

// The products among `ids` that the public can see, with their fulfillment: lines naming anything else cannot
// be written to an account (the cart_items policies refuse them) and are dropped when a guest cart is merged.
async function visibleProducts(ids: readonly string[]): Promise<Map<string, ProductFulfillment> | null> {
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await createPublicServerClient()
      .from("products")
      .select("id, fulfillment")
      .in("id", [...new Set(ids)])
      .eq("status", "published");
    if (error) return null;
    return new Map(data.map((row) => [row.id, row.fulfillment]));
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
  if (!(await allowCartAction(user?.id ?? null))) return { ok: false, reason: "rateLimited" };
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
        const fulfillment = visible.get(line.productId);
        return fulfillment ? [{ ...line, quantity: clampQuantity(line.quantity, fulfillment) }] : [];
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

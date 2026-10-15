import "server-only";

import { cookies } from "next/headers";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { parseGuestCart, sameLine, serializeGuestCart, type CartLine } from "./lines";

/** The guest cart: a first-party, httpOnly cookie that only the server reads and writes. */
export const GUEST_CART_COOKIE = "TJS_CART";
// technical: a guest's cart outlives a browsing session, as the legacy localStorage cart did
const GUEST_CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export async function readGuestLines(): Promise<CartLine[]> {
  return parseGuestCart((await cookies()).get(GUEST_CART_COOKIE)?.value);
}

/** Server Actions only: a Server Component cannot write cookies. An empty cart deletes the cookie. */
export async function writeGuestLines(lines: readonly CartLine[]): Promise<void> {
  const store = await cookies();
  if (lines.length === 0) {
    if (store.has(GUEST_CART_COOKIE)) store.delete(GUEST_CART_COOKIE);
    return;
  }
  store.set(GUEST_CART_COOKIE, serializeGuestCart(lines), {
    path: "/",
    maxAge: GUEST_CART_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/** The signed-in shopper's lines, oldest first; `client` is their session client, so RLS returns only theirs. */
export async function readAccountLines(client: ServerSupabaseClient): Promise<CartLine[] | null> {
  const { data, error } = await client
    .from("cart_items")
    .select("product_id, variant_id, quantity")
    .order("created_at")
    .order("id");
  if (error) return null;
  return data.map((row) => ({ productId: row.product_id, variantId: row.variant_id, quantity: row.quantity }));
}

/**
 * Writes the difference between `before` (what the table holds) and `after`: upserts new and changed lines,
 * deletes removed ones. Returns false when any write fails.
 */
export async function saveAccountLines(
  client: ServerSupabaseClient,
  userId: string,
  before: readonly CartLine[],
  after: readonly CartLine[],
): Promise<boolean> {
  const changed = after.filter((line) => {
    const old = before.find((b) => sameLine(b, line));
    return !old || old.quantity !== line.quantity;
  });
  const removed = before.filter((line) => !after.some((a) => sameLine(a, line)));

  if (changed.length > 0) {
    const { error } = await client.from("cart_items").upsert(
      changed.map((line) => ({
        user_id: userId,
        product_id: line.productId,
        variant_id: line.variantId,
        quantity: line.quantity,
      })),
      { onConflict: "user_id,product_id,variant_id" },
    );
    if (error) return false;
  }
  for (const line of removed) {
    let query = client.from("cart_items").delete().eq("product_id", line.productId);
    query = line.variantId === null ? query.is("variant_id", null) : query.eq("variant_id", line.variantId);
    const { error } = await query;
    if (error) return false;
  }
  return true;
}

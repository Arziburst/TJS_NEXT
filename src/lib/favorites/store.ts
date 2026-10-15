import "server-only";

import { cookies } from "next/headers";
import { GUEST_COOKIE_OPTIONS } from "@/lib/cart/store";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { MAX_FAVORITES, parseIdList, serializeIdList } from "./ids";

/** A guest's favorites: a first-party, httpOnly cookie that only the server reads and writes (as the cart). */
export const GUEST_FAVORITES_COOKIE = "TJS_FAVORITES";

export async function readGuestFavorites(): Promise<string[]> {
  return parseIdList((await cookies()).get(GUEST_FAVORITES_COOKIE)?.value, MAX_FAVORITES);
}

/** Server Actions only: a Server Component cannot write cookies. An empty list deletes the cookie. */
export async function writeGuestFavorites(ids: readonly string[]): Promise<void> {
  const store = await cookies();
  if (ids.length === 0) {
    if (store.has(GUEST_FAVORITES_COOKIE)) store.delete(GUEST_FAVORITES_COOKIE);
    return;
  }
  store.set(GUEST_FAVORITES_COOKIE, serializeIdList(ids, MAX_FAVORITES), GUEST_COOKIE_OPTIONS);
}

/** The signed-in shopper's favorites, newest first; `client` is their session client, so RLS returns only theirs. */
export async function readAccountFavorites(client: ServerSupabaseClient): Promise<string[] | null> {
  const { data, error } = await client
    .from("favorites")
    .select("product_id")
    .order("created_at", { ascending: false })
    .order("product_id");
  if (error) return null;
  return data.map((row) => row.product_id);
}

/**
 * Writes the difference between `before` (what the table holds) and `after` (newest first): inserts the new
 * favorites (oldest first, so the table's order matches; one already there is left alone), deletes the removed
 * ones. Returns false when any write fails.
 */
export async function saveAccountFavorites(
  client: ServerSupabaseClient,
  userId: string,
  before: readonly string[],
  after: readonly string[],
): Promise<boolean> {
  const added = after.filter((id) => !before.includes(id)).reverse();
  const removed = before.filter((id) => !after.includes(id));

  if (added.length > 0) {
    const { error } = await client
      .from("favorites")
      .upsert(
        added.map((productId) => ({ user_id: userId, product_id: productId })),
        { onConflict: "user_id,product_id", ignoreDuplicates: true },
      );
    if (error) return false;
  }
  if (removed.length > 0) {
    const { error } = await client.from("favorites").delete().in("product_id", removed);
    if (error) return false;
  }
  return true;
}

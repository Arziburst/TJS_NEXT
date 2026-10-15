"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { readProductForCart, type MutationFailure } from "@/lib/cart/mutations";
import { setFavorite as setFavoriteIn } from "@/lib/favorites/ids";
import { changeFavorites } from "@/lib/favorites/mutations";

// Every action is a public entry point: the input is validated here, the visitor is re-read from the session
// by changeFavorites, and whether a product can be added comes from the database, never from the client.

const setFavoriteInput = z.object({ productId: z.uuid(), favorite: z.boolean() });

type SetRefusal = "unavailable" | "favoritesFull" | "unexpectedError";

export type SetFavoriteResult = { ok: true; ids: string[] } | { ok: false; reason: "invalid" | SetRefusal | MutationFailure };

/**
 * Adds a piece to the visitor's favorites or removes it (a guest's cookie or the signed-in account). Idempotent:
 * the heart sends the state it wants, so a repeated or late click never flips it the wrong way. Any published
 * piece can be added (also a sold one: it stays visible as sold, D24); any favorite can be removed.
 */
export async function setFavorite(input: unknown): Promise<SetFavoriteResult> {
  const parsed = setFavoriteInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { productId, favorite } = parsed.data;

  const outcome = await changeFavorites<SetRefusal>(async (ids) => {
    if (favorite && !ids.includes(productId)) {
      const product = await readProductForCart(productId);
      if (product === "error") return { refused: "unexpectedError" };
      if (!product) return { refused: "unavailable" };
    }
    const set = setFavoriteIn(ids, productId, favorite);
    if (!set.ok) return { refused: set.reason };
    return { ids: set.ids };
  });
  if (!outcome.ok) return outcome;
  refresh();
  return { ok: true, ids: outcome.ids };
}

export type MergeGuestFavoritesResult = { ok: true } | { ok: false; reason: MutationFailure };

/**
 * Writes guest favorites left from before the sign-in into the account and clears the cookie (the header calls
 * it once it sees both). Idempotent; for a guest it changes nothing.
 */
export async function mergeGuestFavorites(): Promise<MergeGuestFavoritesResult> {
  const outcome = await changeFavorites<never>(async (ids) => ({ ids }));
  if (!outcome.ok) return outcome;
  refresh();
  return { ok: true };
}

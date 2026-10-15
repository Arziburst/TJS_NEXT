import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { allowVisitorAction, visibleProducts, type MutationFailure } from "@/lib/cart/mutations";
import { createSessionClient } from "@/lib/supabase/server";
import { mergeFavorites } from "./ids";
import { readAccountFavorites, readGuestFavorites, saveAccountFavorites, writeGuestFavorites } from "./store";

// Technical: generous for a person (a heart click a second, sustained), tight enough for a script.
export const FAVORITES_RATE_LIMIT = { max: 60, windowSeconds: 60 } as const;

/** A change's outcome: the new favorites (newest first), or a refusal (nothing is written). */
export type FavoritesChange<F extends string> = { ids: string[] } | { refused: F };

export type ChangeFavoritesResult<F extends string> = { ok: true; ids: string[] } | { ok: false; reason: F | MutationFailure };

/**
 * Runs one change of the current visitor's favorites, who is re-read from the session (never trusted from the
 * client). A guest's favorites live in the cookie; a signed-in shopper's in the favorites table, where any
 * guest favorites from before the sign-in are merged in first (idempotently) and the cookie is then cleared,
 * the same way as the cart (src/lib/cart/mutations.ts).
 */
export async function changeFavorites<F extends string>(
  change: (ids: string[]) => Promise<FavoritesChange<F>>,
): Promise<ChangeFavoritesResult<F>> {
  const user = await getCurrentUser();
  if (!(await allowVisitorAction("favorites", FAVORITES_RATE_LIMIT, user?.id ?? null))) {
    return { ok: false, reason: "rateLimited" };
  }
  try {
    const guest = await readGuestFavorites();
    if (!user) {
      const outcome = await change(guest);
      if ("refused" in outcome) return { ok: false, reason: outcome.refused };
      await writeGuestFavorites(outcome.ids);
      return { ok: true, ids: outcome.ids };
    }

    const client = await createSessionClient();
    const account = await readAccountFavorites(client);
    if (!account) return { ok: false, reason: "unexpectedError" };
    // only products the public can see can be written to the account (the favorites policies refuse others)
    const visible = await visibleProducts(guest);
    if (!visible) return { ok: false, reason: "unexpectedError" };
    const base = mergeFavorites(
      account,
      guest.filter((id) => visible.has(id)),
    );

    const outcome = await change(base);
    if ("refused" in outcome) {
      // a refused change still keeps the merge, so the cookie never outlives the sign-in for long
      if (guest.length > 0 && (await saveAccountFavorites(client, user.id, account, base))) await writeGuestFavorites([]);
      return { ok: false, reason: outcome.refused };
    }
    if (!(await saveAccountFavorites(client, user.id, account, outcome.ids))) return { ok: false, reason: "unexpectedError" };
    if (guest.length > 0) await writeGuestFavorites([]);
    return { ok: true, ids: outcome.ids };
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
}

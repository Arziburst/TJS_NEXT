// Pure rules of the favorites and the recently viewed pieces, shared by the server, the browser and the
// tests. No "server-only": nothing here reads data.

/** Technical bound: keeps the guest favorites cookie well below the browser's 4 KB per cookie. */
export const MAX_FAVORITES = 50;

/** Technical: how many recently viewed pieces a visitor's cookie keeps (the strip shows them less the current one). */
export const RECENTLY_VIEWED_LIMIT = 12;

// a product id (uuid); a regular expression rather than zod, so the browser bundle stays small
const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ID_SEPARATOR = ".";

/**
 * Product ids from a cookie value (newest first, dot-separated: cookie-safe without encoding). The cookie is
 * client data: anything that is not a product id is dropped (a broken cookie is an empty list, never an
 * error), duplicates are dropped and the list is bounded.
 */
export function parseIdList(value: string | undefined, limit: number): string[] {
  if (!value) return [];
  const ids: string[] = [];
  for (const part of value.split(ID_SEPARATOR, limit * 2)) {
    const id = part.trim().toLowerCase();
    if (PRODUCT_ID.test(id) && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export function serializeIdList(ids: readonly string[], limit: number): string {
  return ids.slice(0, limit).join(ID_SEPARATOR);
}

export type SetFavoriteResult = { ok: true; ids: string[] } | { ok: false; reason: "favoritesFull" };

/**
 * Adds a product to the front of the favorites (newest first) or removes it. Idempotent: adding a favorite
 * again or removing one that is not there changes nothing. A full list refuses a new favorite.
 */
export function setFavorite(ids: readonly string[], id: string, favorite: boolean): SetFavoriteResult {
  const has = ids.includes(id);
  if (!favorite) return { ok: true, ids: has ? ids.filter((other) => other !== id) : [...ids] };
  if (has) return { ok: true, ids: [...ids] };
  if (ids.length >= MAX_FAVORITES) return { ok: false, reason: "favoritesFull" };
  return { ok: true, ids: [id, ...ids] };
}

/**
 * The account's favorites after sign-in: the guest's favorites it lacks first (they are the newest), then its
 * own. Idempotent (merging the same guest list again changes nothing), so a merge that runs twice (two tabs, a
 * retry) is harmless. Guest favorites past MAX_FAVORITES are dropped; the account's own are never dropped.
 */
export function mergeFavorites(account: readonly string[], guest: readonly string[]): string[] {
  const room = Math.max(0, MAX_FAVORITES - account.length);
  const added = guest.filter((id) => !account.includes(id)).slice(0, room);
  return [...added, ...account];
}

/** The recently viewed list after a view of `id`: it moves to the front, the oldest beyond the limit drop off. */
export function recordView(ids: readonly string[], id: string): string[] {
  return [id, ...ids.filter((other) => other !== id)].slice(0, RECENTLY_VIEWED_LIMIT);
}

/**
 * The recently viewed pieces: product ids, newest first. Written by the browser on each product view (a view
 * costs no request), read by the server for the product page's strip; it holds nothing but public product ids.
 */
export const RECENTLY_VIEWED_COOKIE = "TJS_RECENT";

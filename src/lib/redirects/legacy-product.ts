// Used by src/proxy.ts only (no "server-only": the proxy bundle is not built with the react-server condition).
// Server code all the same: it reads with the service-role key, which never reaches a client bundle.

/*
 * A legacy product URL (/product/<MongoDB id>) → the product the importer created from it (products.legacy_id,
 * scripts/import/). legacy_id is internal (no Data API grant for anon), so the lookup reads with the service
 * role, published and not deleted products only. Cached per server instance; a failure is not cached.
 */

export type LegacyProduct = { id: string; slugs: { locale: string; slug: string }[] };

const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const LOOKUP_TIMEOUT_MS = 2_000;

// null = no such published product (cached too, so a crawler replaying dead ids costs one query per id)
const lookups = new Map<string, { expires: number; product: LegacyProduct | null }>();

type Row = { id: string; product_translations: { locale: string; slug: string }[] };

/** The published product imported from this legacy id; null when there is none; undefined when the lookup failed. */
export async function findLegacyProduct(legacyId: string): Promise<LegacyProduct | null | undefined> {
  const now = Date.now();
  const cached = lookups.get(legacyId);
  if (cached && cached.expires > now) return cached.product;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return undefined;
  const query = new URLSearchParams({
    select: "id,product_translations(locale,slug)",
    legacy_id: `eq.${legacyId}`,
    status: "eq.published",
    deleted_at: "is.null",
  });
  try {
    const response = await fetch(`${url}/rest/v1/products?${query}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    const [row] = (await response.json()) as Row[];
    const product = row ? { id: row.id, slugs: row.product_translations } : null;
    if (lookups.size >= CACHE_MAX_ENTRIES) lookups.clear();
    lookups.set(legacyId, { expires: now + CACHE_TTL_MS, product });
    return product;
  } catch {
    return undefined;
  }
}

/** Empties the lookup cache (tests). */
export function clearLegacyProductLookups(): void {
  lookups.clear();
}

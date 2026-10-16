// Used by src/proxy.ts only (no "server-only": the proxy bundle is not built with the react-server condition).
// Server code all the same: it reads with the service-role key, which never reaches a client bundle.

/*
 * A legacy product URL (/product/<MongoDB id>) → the product the importer created from it (products.legacy_id,
 * scripts/import/). legacy_id is internal (no Data API grant for anon), so the lookup reads with the service
 * role, published and not deleted products only. Not cached (#74): a legacy id never changes, but the answer
 * carries the product's status and slugs, which the admin changes; a cached one would send a just-unpublished
 * piece's old link to a 404 instead of the shop, or a renamed one to its old slug, for the cache's lifetime on
 * each server instance. One query per legacy product URL through the unique legacy_id index.
 */

export type LegacyProduct = { id: string; slugs: { locale: string; slug: string }[] };

const LOOKUP_TIMEOUT_MS = 2_000;

type Row = { id: string; product_translations: { locale: string; slug: string }[] };

/** The published product imported from this legacy id; null when there is none; undefined when the lookup failed. */
export async function findLegacyProduct(legacyId: string): Promise<LegacyProduct | null | undefined> {
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
    return row ? { id: row.id, slugs: row.product_translations } : null;
  } catch {
    return undefined;
  }
}

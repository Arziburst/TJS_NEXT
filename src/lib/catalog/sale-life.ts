import "server-only";

import { createPublicServerClient } from "@/lib/supabase/server";

/**
 * The next moment a sale starts or ends (ms since the epoch), null when none is ahead, undefined when it could not be
 * read. Read inside a cached entry with prices: the entry then lives no longer than until then (lifeUntilSaleChange
 * in ./sale.ts), so a sale's prices appear and disappear on time without an admin write.
 */
export async function readNextSaleChange(): Promise<number | null | undefined> {
  try {
    const { data, error } = await createPublicServerClient().rpc("next_sale_change");
    if (error) return undefined;
    if (data === null) return null;
    const at = Date.parse(data);
    return Number.isNaN(at) ? undefined : at;
  } catch {
    return undefined;
  }
}

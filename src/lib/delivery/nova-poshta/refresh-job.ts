import "server-only";

import type { NovaPoshtaClient } from "./api";
import {
  LOOKUP_KEEP_MS,
  REFRESH_AFTER_MS,
  REFRESH_BATCH,
  REFRESH_USED_WITHIN_MS,
  fetchLookup,
  lookupParamsSchema,
  type DictionaryStore,
} from "./dictionary";

export type RefreshResult = {
  // ok: every due lookup refreshed; partial: some kept their last answer; failed: none refreshed
  status: "ok" | "partial" | "failed";
  refreshed: number;
  failed: number;
  prunedLookups: number;
  prunedSettlements: number;
  prunedWarehouses: number;
};

/*
 * The daily dictionary job: drop the lookups nobody used for LOOKUP_KEEP_MS, fetch again the recently used
 * ones older than REFRESH_AFTER_MS (oldest first, at most REFRESH_BATCH, one at a time to stay gentle on the
 * API), then drop the rows no lookup names any more. A lookup whose refresh fails keeps its last answer.
 */
export async function refreshDictionary({
  now,
  store,
  client,
}: {
  now: Date;
  store: DictionaryStore;
  client: NovaPoshtaClient;
}): Promise<RefreshResult> {
  const prunedLookups = await store.pruneLookups(new Date(now.getTime() - LOOKUP_KEEP_MS));
  const due = await store.lookupsToRefresh(
    new Date(now.getTime() - REFRESH_USED_WITHIN_MS),
    new Date(now.getTime() - REFRESH_AFTER_MS),
    REFRESH_BATCH,
  );

  let refreshed = 0;
  let failed = 0;
  for (const { key, params } of due) {
    const parsed = lookupParamsSchema.safeParse(params);
    const lookup = parsed.success ? parsed.data : null;
    let saved = false;
    if (lookup?.kind === "settlements") {
      const result = await fetchLookup(client, lookup);
      if (result.ok) await store.saveSettlements(key, lookup, result.data, now, { used: false });
      saved = result.ok;
    } else if (lookup?.kind === "warehouses") {
      const result = await fetchLookup(client, lookup);
      if (result.ok) await store.saveWarehouses(key, lookup, result.data, now, { used: false });
      saved = result.ok;
    }
    if (saved) refreshed += 1;
    else failed += 1;
  }

  const pruned = await store.pruneRows();
  return {
    status: failed === 0 ? "ok" : refreshed > 0 ? "partial" : "failed",
    refreshed,
    failed,
    prunedLookups,
    prunedSettlements: pruned.settlements,
    prunedWarehouses: pruned.warehouses,
  };
}

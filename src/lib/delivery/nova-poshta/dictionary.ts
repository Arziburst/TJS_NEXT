import "server-only";

import { z } from "zod";
import {
  INVALID_CHARACTERS_CODE,
  NP_REF,
  WAREHOUSE_TYPES_OF_KIND,
  type NovaPoshtaClient,
  type NovaPoshtaError,
  type NovaPoshtaResult,
  type Settlement,
  type Street,
  type Warehouse,
} from "./api";
import type { WarehouseFilter } from "./types";

// Refresh policy of the cached dictionaries (see the migration 20261016002200):
// a lookup is served from the cache for a day, then fetched again on its next use
export const LOOKUP_FRESH_MS = 24 * 60 * 60 * 1000;
// the daily job refreshes the lookups used within this window and fetched longer than REFRESH_AFTER_MS ago
export const REFRESH_USED_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;
export const REFRESH_BATCH = 100;
// lookups unused this long are dropped, and with them the rows no other lookup names
export const LOOKUP_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export const SETTLEMENT_LIMIT = 10;
export const WAREHOUSE_LIMIT = 50;
export const STREET_LIMIT = 20;
// shorter searches are not sent: a letter or two match hundreds of places
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 60;

export type { WarehouseFilter };

export const lookupParamsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("settlements"), query: z.string().max(MAX_QUERY_LENGTH) }),
  z.object({
    kind: z.literal("warehouses"),
    settlementRef: z.string().regex(NP_REF),
    filter: z.enum(["all", "branch", "postomat"]),
    query: z.string().max(MAX_QUERY_LENGTH),
  }),
]);

export type LookupParams = z.infer<typeof lookupParamsSchema>;

type Items<P extends LookupParams> = P extends { kind: "settlements" } ? Settlement[] : Warehouse[];

// What the dictionary needs from the database; the Supabase implementation lives in ./dictionary-store
export type DictionaryStore = {
  getLookup(key: string): Promise<{ refs: string[]; fetchedAt: Date } | null>;
  getSettlements(refs: string[]): Promise<Settlement[]>;
  getWarehouses(refs: string[]): Promise<Warehouse[]>;
  // upserts the rows, then the lookup with their refs in order; used: a customer asked now (the daily
  // refresh does not count as a use)
  saveSettlements(key: string, params: LookupParams, items: Settlement[], now: Date, options: { used: boolean }): Promise<void>;
  saveWarehouses(key: string, params: LookupParams, items: Warehouse[], now: Date, options: { used: boolean }): Promise<void>;
  markUsed(key: string, now: Date): Promise<void>;
  lookupsToRefresh(usedSince: Date, fetchedBefore: Date, limit: number): Promise<{ key: string; params: unknown }[]>;
  pruneLookups(unusedSince: Date): Promise<number>;
  pruneRows(): Promise<{ settlements: number; warehouses: number }>;
};

export type DictionaryDeps = { client: NovaPoshtaClient; store: DictionaryStore | null; now: Date };

// stale: served from the cache because the API failed
export type DictionaryResult<T> = { ok: true; items: T[]; stale: boolean } | { ok: false; reason: "invalidQuery" | "unavailable" };

// the search text as sent and cached: single spaces, one apostrophe, lower case
export function normalizeQuery(query: string): string {
  return query
    .replace(/[’ʼ‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk")
    .slice(0, MAX_QUERY_LENGTH);
}

export function lookupKey(params: LookupParams): string {
  return params.kind === "settlements"
    ? `settlements:${params.query}`
    : `warehouses:${params.settlementRef.toLowerCase()}:${params.filter}:${params.query}`;
}

function isInvalidQuery(error: NovaPoshtaError): boolean {
  return error.kind === "api" && error.codes.includes(INVALID_CHARACTERS_CODE);
}

// One lookup from the API; a kind filter queries each of its warehouse types
export async function fetchLookup<P extends LookupParams>(client: NovaPoshtaClient, params: P): Promise<NovaPoshtaResult<Items<P>>> {
  if (params.kind === "settlements") {
    return (await client.searchSettlements(params.query, SETTLEMENT_LIMIT)) as NovaPoshtaResult<Items<P>>;
  }
  const number = /^\d+$/.test(params.query) ? params.query : undefined;
  const typeRefs = params.filter === "all" ? [undefined] : WAREHOUSE_TYPES_OF_KIND[params.filter];
  const results = await Promise.all(
    typeRefs.map((typeRef) =>
      client.getWarehouses({ settlementRef: params.settlementRef, typeRef, number, query: params.query, limit: WAREHOUSE_LIMIT }),
    ),
  );
  const byRef = new Map<string, Warehouse>();
  for (const result of results) {
    if (!result.ok) return result;
    for (const warehouse of result.data) {
      if (params.filter === "all" || warehouse.kind === params.filter) byRef.set(warehouse.ref, warehouse);
    }
  }
  const warehouses = [...byRef.values()].sort((a, b) => a.number - b.number).slice(0, WAREHOUSE_LIMIT);
  return { ok: true, data: warehouses as Items<P> };
}

async function save(store: DictionaryStore, key: string, params: LookupParams, items: Settlement[] | Warehouse[], now: Date) {
  if (params.kind === "settlements") await store.saveSettlements(key, params, items as Settlement[], now, { used: true });
  else await store.saveWarehouses(key, params, items as Warehouse[], now, { used: true });
}

// The cached answer in its original order, or null when it is missing or lost a row (pruned meanwhile)
async function readCached<P extends LookupParams>(
  store: DictionaryStore,
  key: string,
  params: P,
): Promise<{ items: Items<P>; fetchedAt: Date } | null> {
  const lookup = await store.getLookup(key);
  if (!lookup) return null;
  if (lookup.refs.length === 0) return { items: [] as unknown as Items<P>, fetchedAt: lookup.fetchedAt };
  const rows: { ref: string }[] =
    params.kind === "settlements" ? await store.getSettlements(lookup.refs) : await store.getWarehouses(lookup.refs);
  const byRef = new Map(rows.map((row) => [row.ref.toLowerCase(), row]));
  const items = lookup.refs.map((ref) => byRef.get(ref.toLowerCase()));
  if (items.some((item) => !item)) return null;
  return { items: items as Items<P>, fetchedAt: lookup.fetchedAt };
}

/*
 * A dictionary search through the cache: a fresh cached answer is served as it is; otherwise the API is asked
 * and its answer stored. When the API fails, a stale cached answer is better than none. The cache is an
 * optimization: when the database fails the API still answers.
 */
async function lookup<P extends LookupParams>(params: P, { client, store, now }: DictionaryDeps): Promise<DictionaryResult<Items<P>[number]>> {
  const key = lookupKey(params);
  let cached: { items: Items<P>; fetchedAt: Date } | null = null;
  if (store) {
    try {
      cached = await readCached(store, key, params);
    } catch (error) {
      console.error("nova-poshta: reading the cache failed", error);
    }
  }

  if (store && cached && now.getTime() - cached.fetchedAt.getTime() < LOOKUP_FRESH_MS) {
    try {
      await store.markUsed(key, now);
    } catch (error) {
      console.error("nova-poshta: marking a lookup used failed", error);
    }
    return { ok: true, items: cached.items, stale: false };
  }

  const fetched = await fetchLookup(client, params);
  if (fetched.ok) {
    if (store) {
      try {
        await save(store, key, params, fetched.data, now);
      } catch (error) {
        console.error("nova-poshta: writing the cache failed", error);
      }
    }
    return { ok: true, items: fetched.data, stale: false };
  }
  if (isInvalidQuery(fetched.error)) return { ok: false, reason: "invalidQuery" };
  console.error("nova-poshta:", params.kind, JSON.stringify(fetched.error));
  if (cached) return { ok: true, items: cached.items, stale: true };
  return { ok: false, reason: "unavailable" };
}

export async function findSettlements(query: string, deps: DictionaryDeps): Promise<DictionaryResult<Settlement>> {
  const normalized = normalizeQuery(query);
  if (normalized.length < MIN_QUERY_LENGTH) return { ok: true, items: [], stale: false };
  return lookup({ kind: "settlements", query: normalized }, deps);
}

export async function findWarehouses(
  { settlementRef, filter, query }: { settlementRef: string; filter: WarehouseFilter; query: string },
  deps: DictionaryDeps,
): Promise<DictionaryResult<Warehouse>> {
  return lookup({ kind: "warehouses", settlementRef: settlementRef.toLowerCase(), filter, query: normalizeQuery(query) }, deps);
}

// Streets are not cached: an address is typed once, and its streets are rarely searched twice
export async function findStreets(
  { settlementRef, query }: { settlementRef: string; query: string },
  { client }: Pick<DictionaryDeps, "client">,
): Promise<DictionaryResult<Street>> {
  const normalized = normalizeQuery(query);
  if (normalized.length < MIN_QUERY_LENGTH) return { ok: true, items: [], stale: false };
  const result = await client.searchStreets({ settlementRef, query: normalized, limit: STREET_LIMIT });
  if (result.ok) return { ok: true, items: result.data, stale: false };
  if (isInvalidQuery(result.error)) return { ok: false, reason: "invalidQuery" };
  console.error("nova-poshta: streets", JSON.stringify(result.error));
  return { ok: false, reason: "unavailable" };
}

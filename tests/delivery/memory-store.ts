import type { DictionaryStore, LookupParams } from "@/lib/delivery/nova-poshta/dictionary";
import type { Settlement, Warehouse } from "@/lib/delivery/nova-poshta/types";

type Lookup = { params: LookupParams; refs: string[]; fetchedAt: Date; lastUsedAt: Date };

// The dictionary store in memory, with the semantics of ./dictionary-store (Supabase)
export function memoryStore() {
  const lookups = new Map<string, Lookup>();
  const settlements = new Map<string, Settlement>();
  const warehouses = new Map<string, Warehouse>();

  function saveLookup(key: string, params: LookupParams, refs: string[], now: Date, used: boolean) {
    const previous = lookups.get(key);
    lookups.set(key, { params, refs, fetchedAt: now, lastUsedAt: used || !previous ? now : previous.lastUsedAt });
  }

  const store: DictionaryStore = {
    async getLookup(key) {
      const lookup = lookups.get(key);
      return lookup ? { refs: lookup.refs, fetchedAt: lookup.fetchedAt } : null;
    },
    async getSettlements(refs) {
      return refs.flatMap((ref) => settlements.get(ref) ?? []);
    },
    async getWarehouses(refs) {
      return refs.flatMap((ref) => warehouses.get(ref) ?? []);
    },
    async saveSettlements(key, params, items, now, { used }) {
      for (const item of items) settlements.set(item.ref, item);
      saveLookup(key, params, items.map((s) => s.ref), now, used);
    },
    async saveWarehouses(key, params, items, now, { used }) {
      for (const item of items) warehouses.set(item.ref, item);
      saveLookup(key, params, items.map((w) => w.ref), now, used);
    },
    async markUsed(key, now) {
      const lookup = lookups.get(key);
      if (lookup) lookup.lastUsedAt = now;
    },
    async lookupsToRefresh(usedSince, fetchedBefore, limit) {
      return [...lookups.entries()]
        .filter(([, l]) => l.lastUsedAt >= usedSince && l.fetchedAt < fetchedBefore)
        .sort(([, a], [, b]) => a.fetchedAt.getTime() - b.fetchedAt.getTime())
        .slice(0, limit)
        .map(([key, l]) => ({ key, params: l.params as unknown }));
    },
    async pruneLookups(unusedSince) {
      let pruned = 0;
      for (const [key, lookup] of lookups) {
        if (lookup.lastUsedAt < unusedSince) {
          lookups.delete(key);
          pruned += 1;
        }
      }
      return pruned;
    },
    async pruneRows() {
      const named = (kind: LookupParams["kind"]) =>
        new Set([...lookups.values()].filter((l) => l.params.kind === kind).flatMap((l) => l.refs));
      const keepSettlements = named("settlements");
      const keepWarehouses = named("warehouses");
      let s = 0;
      let w = 0;
      for (const ref of settlements.keys()) if (!keepSettlements.has(ref) && settlements.delete(ref)) s += 1;
      for (const ref of warehouses.keys()) if (!keepWarehouses.has(ref) && warehouses.delete(ref)) w += 1;
      return { settlements: s, warehouses: w };
    },
  };
  return { store, lookups, settlements, warehouses };
}

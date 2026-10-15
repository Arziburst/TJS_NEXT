import "server-only";

import type { Database } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/server";
import type { Settlement, Warehouse, WarehouseKind } from "./api";
import type { DictionaryStore, LookupParams } from "./dictionary";

type SettlementRow = Database["public"]["Tables"]["np_settlements"]["Row"];
type WarehouseRow = Database["public"]["Tables"]["np_warehouses"]["Row"];

function toSettlement(row: SettlementRow): Settlement {
  return {
    ref: row.ref,
    cityRef: row.city_ref,
    name: row.name,
    label: row.label,
    area: row.area,
    region: row.region,
    warehouseCount: row.warehouse_count,
    addressDelivery: row.address_delivery,
  };
}

function toWarehouse(row: WarehouseRow): Warehouse {
  return {
    ref: row.ref,
    number: row.number,
    kind: row.kind as WarehouseKind,
    typeRef: row.type_ref,
    name: row.name,
    shortAddress: row.short_address,
    cityRef: row.city_ref,
    settlementRef: row.settlement_ref,
    maxWeightKg: row.max_weight_kg === null ? null : Number(row.max_weight_kg),
  };
}

// marking a lookup used writes at most once an hour per lookup
const MARK_USED_EVERY_MS = 60 * 60 * 1000;

/*
 * The dictionary cache in Supabase. The np_* tables have no policy for anon or authenticated, so only the
 * service role reads and writes them; this module is the only caller. Null when Supabase is not configured.
 */
export function createDictionaryStore(): DictionaryStore | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const db = createServiceClient();

  // without `used` an existing lookup keeps its last_used_at (a new one starts at now)
  async function saveLookup(key: string, params: LookupParams, refs: string[], now: Date, { used }: { used: boolean }) {
    const at = now.toISOString();
    const { error } = await db
      .from("np_lookups")
      .upsert({ key, kind: params.kind, params, refs, fetched_at: at, ...(used ? { last_used_at: at } : {}) });
    if (error) throw new Error(`np_lookups: ${error.message}`);
  }

  return {
    async getLookup(key) {
      const { data, error } = await db.from("np_lookups").select("refs, fetched_at").eq("key", key).maybeSingle();
      if (error) throw new Error(`np_lookups: ${error.message}`);
      return data ? { refs: data.refs, fetchedAt: new Date(data.fetched_at) } : null;
    },

    async getSettlements(refs) {
      const { data, error } = await db.from("np_settlements").select("*").in("ref", refs);
      if (error) throw new Error(`np_settlements: ${error.message}`);
      return data.map(toSettlement);
    },

    async getWarehouses(refs) {
      const { data, error } = await db.from("np_warehouses").select("*").in("ref", refs);
      if (error) throw new Error(`np_warehouses: ${error.message}`);
      return data.map(toWarehouse);
    },

    async saveSettlements(key, params, items, now, options) {
      if (items.length > 0) {
        const { error } = await db.from("np_settlements").upsert(
          items.map((s) => ({
            ref: s.ref,
            city_ref: s.cityRef,
            name: s.name,
            label: s.label,
            area: s.area,
            region: s.region,
            warehouse_count: s.warehouseCount,
            address_delivery: s.addressDelivery,
            fetched_at: now.toISOString(),
          })),
        );
        if (error) throw new Error(`np_settlements: ${error.message}`);
      }
      await saveLookup(key, params, items.map((s) => s.ref), now, options);
    },

    async saveWarehouses(key, params, items, now, options) {
      if (items.length > 0) {
        const { error } = await db.from("np_warehouses").upsert(
          items.map((w) => ({
            ref: w.ref,
            settlement_ref: w.settlementRef,
            city_ref: w.cityRef,
            number: w.number,
            kind: w.kind,
            type_ref: w.typeRef,
            name: w.name,
            short_address: w.shortAddress,
            max_weight_kg: w.maxWeightKg,
            fetched_at: now.toISOString(),
          })),
        );
        if (error) throw new Error(`np_warehouses: ${error.message}`);
      }
      await saveLookup(key, params, items.map((w) => w.ref), now, options);
    },

    async markUsed(key, now) {
      const { error } = await db
        .from("np_lookups")
        .update({ last_used_at: now.toISOString() })
        .eq("key", key)
        .lt("last_used_at", new Date(now.getTime() - MARK_USED_EVERY_MS).toISOString());
      if (error) throw new Error(`np_lookups: ${error.message}`);
    },

    async lookupsToRefresh(usedSince, fetchedBefore, limit) {
      const { data, error } = await db
        .from("np_lookups")
        .select("key, params")
        .gte("last_used_at", usedSince.toISOString())
        .lt("fetched_at", fetchedBefore.toISOString())
        .order("fetched_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`np_lookups: ${error.message}`);
      return data;
    },

    async pruneLookups(unusedSince) {
      const { data, error } = await db.from("np_lookups").delete().lt("last_used_at", unusedSince.toISOString()).select("key");
      if (error) throw new Error(`np_lookups: ${error.message}`);
      return data.length;
    },

    async pruneRows() {
      const { data, error } = await db.rpc("np_prune_dictionary").single();
      if (error) throw new Error(`np_prune_dictionary: ${error.message}`);
      return data;
    },
  };
}

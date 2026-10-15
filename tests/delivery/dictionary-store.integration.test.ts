// The Nova Poshta dictionary cache on the local stack: the Supabase store behind the searches and the daily
// refresh, through real PostgREST calls, with the recorded API answers. Skipped when no local stack is configured.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "../catalog/local-stack";
import { KYIV } from "./replay";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("nova poshta dictionary cache on the local stack", async () => {
  // a skipped describe still runs its body to collect the tests: nothing below may touch the stack
  if (!stack) return;
  const { createNovaPoshtaClient } = await import("@/lib/delivery/nova-poshta/api");
  const { fixtureTransport } = await import("@/lib/delivery/nova-poshta/fixture-transport");
  const { createDictionaryStore } = await import("@/lib/delivery/nova-poshta/dictionary-store");
  const { LOOKUP_FRESH_MS, LOOKUP_KEEP_MS, findSettlements, findWarehouses } = await import("@/lib/delivery/nova-poshta/dictionary");
  const { refreshDictionary } = await import("@/lib/delivery/nova-poshta/refresh-job");

  const admin = createClient<Database>(stack!.url, stack!.serviceRoleKey, { auth: { persistSession: false } });
  const anon = createClient<Database>(stack!.url, stack!.anonKey, { auth: { persistSession: false } });
  const store = createDictionaryStore()!;

  let apiCalls = 0;
  const client = createNovaPoshtaClient({
    transport: async (request, signal) => {
      apiCalls += 1;
      return fixtureTransport(request, signal);
    },
  });

  async function clear() {
    await admin.from("np_lookups").delete().neq("key", "");
    await admin.rpc("np_prune_dictionary");
  }

  beforeAll(clear);
  afterAll(clear);

  it("stores a search and answers it from the database while fresh", async () => {
    const now = new Date();
    const first = await findSettlements("Київ", { client, store, now });
    expect(first.ok && first.items[0].ref).toBe(KYIV.settlementRef);
    const callsAfterFirst = apiCalls;

    const second = await findSettlements("київ", { client, store, now: new Date(now.getTime() + 60_000) });
    expect(second).toEqual(first);
    expect(apiCalls).toBe(callsAfterFirst);

    const { data } = await admin.from("np_lookups").select("kind, refs, params").eq("key", "settlements:київ").single();
    expect(data).toMatchObject({ kind: "settlements", params: { kind: "settlements", query: "київ" } });
    expect(data?.refs[0]).toBe(KYIV.settlementRef);
  });

  it("stores the branches of a search with their kind", async () => {
    const result = await findWarehouses(
      { settlementRef: KYIV.settlementRef, filter: "postomat", query: "" },
      { client, store, now: new Date() },
    );
    expect(result.ok && result.items.length).toBeGreaterThan(0);
    const refs = result.ok ? result.items.map((w) => w.ref) : [];
    const { data } = await admin.from("np_warehouses").select("ref, kind, settlement_ref").in("ref", refs);
    expect(data?.length).toBe(refs.length);
    expect(data?.every((w) => w.kind === "postomat" && w.settlement_ref === KYIV.settlementRef)).toBe(true);

    // read back from the database in the API's order
    const again = await findWarehouses(
      { settlementRef: KYIV.settlementRef, filter: "postomat", query: "" },
      { client, store, now: new Date(Date.now() + 60_000) },
    );
    expect(again).toEqual(result);
  });

  it("is invisible to the anon key", async () => {
    for (const table of ["np_lookups", "np_settlements", "np_warehouses"] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(data ?? [], table).toEqual([]);
      expect(error?.code, table).toBe("42501");
    }
  });

  it("refreshes due lookups and prunes unused ones with their rows in the daily job", async () => {
    const now = new Date();
    // one lookup unused past the keep window, one used yesterday and fetched before the fresh window
    await findSettlements("Бровари", { client, store, now: new Date(now.getTime() - LOOKUP_KEEP_MS - 60_000) });
    const stale = new Date(now.getTime() - 2 * LOOKUP_FRESH_MS);
    await admin.from("np_lookups").update({ fetched_at: stale.toISOString(), last_used_at: stale.toISOString() }).eq("key", "settlements:київ");

    const result = await refreshDictionary({ now, store, client });

    expect(result.status).toBe("ok");
    expect(result.refreshed).toBeGreaterThanOrEqual(1);
    expect(result.prunedLookups).toBe(1);
    const { data: kyiv } = await admin.from("np_lookups").select("fetched_at, last_used_at").eq("key", "settlements:київ").single();
    expect(new Date(kyiv!.fetched_at).getTime()).toBe(now.getTime());
    expect(new Date(kyiv!.last_used_at).getTime()).toBe(stale.getTime());
    const { data: brovary } = await admin.from("np_settlements").select("ref").eq("name", "Бровари");
    expect(brovary).toEqual([]);
  });
});

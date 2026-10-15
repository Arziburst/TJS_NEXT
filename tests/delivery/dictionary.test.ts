// The cached dictionary searches and the daily refresh, on an in-memory store and the fixture transport.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createNovaPoshtaClient, type NovaPoshtaRequest, type Transport } from "@/lib/delivery/nova-poshta/api";
import {
  LOOKUP_FRESH_MS,
  LOOKUP_KEEP_MS,
  REFRESH_USED_WITHIN_MS,
  findSettlements,
  findStreets,
  findWarehouses,
  lookupKey,
  normalizeQuery,
} from "@/lib/delivery/nova-poshta/dictionary";
import { fixtureTransport } from "@/lib/delivery/nova-poshta/fixture-transport";
import { refreshDictionary } from "@/lib/delivery/nova-poshta/refresh-job";
import { memoryStore } from "./memory-store";
import { KYIV } from "./replay";

vi.mock("server-only", () => ({}));

const HOUR = 60 * 60 * 1000;
const T0 = new Date("2026-10-15T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

// the fixture transport, counting calls; `down` makes every call fail like an unreachable API
function apiClient() {
  const calls: NovaPoshtaRequest[] = [];
  const state = { down: false };
  const transport: Transport = async (request, signal) => {
    calls.push(request);
    if (state.down) return { ok: false, error: { kind: "network" } };
    return fixtureTransport(request, signal);
  };
  return { client: createNovaPoshtaClient({ transport }), calls, state };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeQuery", () => {
  it("trims, collapses spaces, unifies apostrophes and lowercases", () => {
    expect(normalizeQuery("  Кам’янець   Подільський ")).toBe("кам'янець подільський");
    expect(normalizeQuery("КИЇВ")).toBe("київ");
  });
});

describe("findSettlements", () => {
  it("asks the API once, then answers from the cache while fresh", async () => {
    const { client, calls } = apiClient();
    const { store, lookups } = memoryStore();

    const first = await findSettlements("Київ", { client, store, now: T0 });
    expect(first.ok && first.items[0]).toMatchObject({ name: "Київ", cityRef: KYIV.cityRef });
    expect(lookups.get("settlements:київ")?.refs[0]).toBe(KYIV.settlementRef);

    const second = await findSettlements(" київ ", { client, store, now: at(LOOKUP_FRESH_MS - 1) });
    expect(second).toEqual(first);
    expect(calls).toHaveLength(1);
  });

  it("fetches a stale lookup again on its next use", async () => {
    const { client, calls } = apiClient();
    const { store, lookups } = memoryStore();
    await findSettlements("Київ", { client, store, now: T0 });
    await findSettlements("Київ", { client, store, now: at(LOOKUP_FRESH_MS + 1) });
    expect(calls).toHaveLength(2);
    expect(lookups.get("settlements:київ")?.fetchedAt).toEqual(at(LOOKUP_FRESH_MS + 1));
  });

  it("serves the stale answer when the API is down, and nothing when there is none", async () => {
    const { client, state } = apiClient();
    const { store } = memoryStore();
    const fresh = await findSettlements("Львів", { client, store, now: T0 });
    state.down = true;
    const stale = await findSettlements("Львів", { client, store, now: at(2 * LOOKUP_FRESH_MS) });
    expect(stale).toEqual({ ok: true, items: fresh.ok ? fresh.items : [], stale: true });
    expect(await findSettlements("Одеса", { client, store, now: T0 })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refetches a lookup that lost a row to the prune", async () => {
    const { client, calls } = apiClient();
    const { store, settlements } = memoryStore();
    await findSettlements("Київ", { client, store, now: T0 });
    settlements.delete(KYIV.settlementRef);
    const result = await findSettlements("Київ", { client, store, now: at(HOUR) });
    expect(calls).toHaveLength(2);
    expect(result.ok && result.items[0].ref).toBe(KYIV.settlementRef);
  });

  it("answers from the API when the cache fails", async () => {
    const { client } = apiClient();
    const { store } = memoryStore();
    store.getLookup = async () => {
      throw new Error("db down");
    };
    store.saveSettlements = async () => {
      throw new Error("db down");
    };
    const result = await findSettlements("Київ", { client, store, now: T0 });
    expect(result.ok && result.items[0].name).toBe("Київ");
  });

  it("works without a cache", async () => {
    const { client } = apiClient();
    const result = await findSettlements("Бровари", { client, store: null, now: T0 });
    expect(result.ok && result.items[0].name).toBe("Бровари");
  });

  it("does not send one letter, and reports a Latin text as invalidQuery without caching it", async () => {
    const { client, calls } = apiClient();
    const { store, lookups } = memoryStore();
    expect(await findSettlements("К", { client, store, now: T0 })).toEqual({ ok: true, items: [], stale: false });
    expect(calls).toHaveLength(0);
    expect(await findSettlements("Kyiv", { client, store, now: T0 })).toEqual({ ok: false, reason: "invalidQuery" });
    expect(lookups.size).toBe(0);
  });
});

describe("findWarehouses", () => {
  it("filters by kind, querying each type of the kind", async () => {
    const { client, calls } = apiClient();
    const { store } = memoryStore();
    const lockers = await findWarehouses({ settlementRef: KYIV.settlementRef, filter: "postomat", query: "" }, { client, store, now: T0 });
    expect(lockers.ok && lockers.items.length).toBeGreaterThan(0);
    expect(lockers.ok && lockers.items.every((w) => w.kind === "postomat")).toBe(true);
    expect(calls.map((c) => c.methodProperties.TypeOfWarehouseRef)).toEqual([
      "f9316480-5f2d-425d-bc2c-ac7cd29decf0",
      "95dc212d-479c-4ffb-a8ab-8c1b9073d0bc",
    ]);

    const branches = await findWarehouses({ settlementRef: KYIV.settlementRef, filter: "branch", query: "" }, { client, store, now: T0 });
    expect(branches.ok && branches.items.every((w) => w.kind === "branch")).toBe(true);
    // sorted by number, no duplicates across the types
    const numbers = branches.ok ? branches.items.map((w) => w.number) : [];
    expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b));
  });

  it("searches by number or text, each search cached under its own key", async () => {
    const { client } = apiClient();
    const { store, lookups } = memoryStore();
    const byNumber = await findWarehouses({ settlementRef: KYIV.settlementRef, filter: "all", query: "1" }, { client, store, now: T0 });
    expect(byNumber.ok && byNumber.items.map((w) => w.number)).toEqual([1]);
    const byStreet = await findWarehouses(
      { settlementRef: KYIV.settlementRef, filter: "all", query: "Хрещатик" },
      { client, store, now: T0 },
    );
    expect(byStreet.ok && byStreet.items.map((w) => w.number)).toContain(543);
    expect([...lookups.keys()].sort()).toEqual([
      lookupKey({ kind: "warehouses", settlementRef: KYIV.settlementRef, filter: "all", query: "1" }),
      lookupKey({ kind: "warehouses", settlementRef: KYIV.settlementRef, filter: "all", query: "хрещатик" }),
    ]);
  });
});

describe("findStreets", () => {
  it("searches the API directly", async () => {
    const { client } = apiClient();
    expect(await findStreets({ settlementRef: KYIV.settlementRef, query: "Хрещатик" }, { client })).toEqual({
      ok: true,
      items: [{ ref: "ad090b1f-6845-11e6-8304-00505688561d", name: "Хрещатик", label: "вул. Хрещатик" }],
      stale: false,
    });
    expect(await findStreets({ settlementRef: KYIV.settlementRef, query: "Main" }, { client })).toEqual({
      ok: false,
      reason: "invalidQuery",
    });
  });
});

describe("refreshDictionary", () => {
  it("refreshes recently used lookups, prunes unused ones and their rows", async () => {
    const { client, calls } = apiClient();
    const { store, lookups, settlements } = memoryStore();
    // used long ago: pruned with its rows
    await findSettlements("Бровари", { client, store, now: at(-LOOKUP_KEEP_MS - HOUR) });
    // used within the week, fetched over a day ago: refreshed
    await findSettlements("Київ", { client, store, now: at(-2 * LOOKUP_FRESH_MS) });
    await findWarehouses({ settlementRef: KYIV.settlementRef, filter: "all", query: "1" }, { client, store, now: at(-2 * LOOKUP_FRESH_MS) });
    // fetched an hour ago: left alone
    await findSettlements("Львів", { client, store, now: at(-HOUR) });
    calls.length = 0;

    const result = await refreshDictionary({ now: T0, store, client });

    expect(result).toEqual({
      status: "ok",
      refreshed: 2,
      failed: 0,
      prunedLookups: 1,
      prunedSettlements: 1,
      prunedWarehouses: 0,
    });
    expect(calls).toHaveLength(2);
    expect([...lookups.keys()].sort()).toEqual([
      "settlements:київ",
      "settlements:львів",
      `warehouses:${KYIV.settlementRef}:all:1`,
    ]);
    expect(lookups.get("settlements:київ")?.fetchedAt).toEqual(T0);
    // a refresh is not a use: the lookup still ages out if nobody asks for it
    expect(lookups.get("settlements:київ")?.lastUsedAt).toEqual(at(-2 * LOOKUP_FRESH_MS));
    expect([...settlements.values()].some((s) => s.name === "Бровари")).toBe(false);
  });

  it("keeps the last answer of a lookup it cannot refresh", async () => {
    const { client, state } = apiClient();
    const { store, lookups } = memoryStore();
    await findSettlements("Київ", { client, store, now: at(-2 * LOOKUP_FRESH_MS) });
    const before = lookups.get("settlements:київ");
    state.down = true;
    const result = await refreshDictionary({ now: T0, store, client });
    expect(result).toMatchObject({ status: "failed", refreshed: 0, failed: 1 });
    expect(lookups.get("settlements:київ")).toEqual(before);
  });

  it("does not refresh a lookup unused for a week", async () => {
    const { client, calls } = apiClient();
    const { store } = memoryStore();
    await findSettlements("Київ", { client, store, now: at(-REFRESH_USED_WITHIN_MS - HOUR) });
    calls.length = 0;
    expect(await refreshDictionary({ now: T0, store, client })).toMatchObject({ status: "ok", refreshed: 0, prunedLookups: 0 });
    expect(calls).toHaveLength(0);
  });
});

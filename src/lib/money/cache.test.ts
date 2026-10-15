import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MoneyTables } from "./store";

vi.mock("server-only", () => ({}));

// The "use cache" directive is a plain string outside Next's compiler: the spies record the entry's lifetime
const cacheLife = vi.fn();
const cacheTag = vi.fn();
vi.mock("next/cache", () => ({ cacheLife, cacheTag }));

const readMoneyTables = vi.fn<() => Promise<MoneyTables>>();
vi.mock("./store", () => ({ readMoneyTables: () => readMoneyTables() }));

const { FAILED_READ_LIFE } = await import("@/lib/failed-read");
const { getMoneyTables, FX_CACHE_TAG } = await import("./cache");

beforeEach(() => {
  cacheLife.mockClear();
  cacheTag.mockClear();
  readMoneyTables.mockReset();
});

describe("getMoneyTables", () => {
  it("caches a failed rates read with zero lifetime", async () => {
    readMoneyTables.mockRejectedValue(new TypeError("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getMoneyTables()).toBeNull();
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps the rates for a day without a stale window, tagged for the daily rates job", async () => {
    const tables: MoneyTables = { settings: {}, displayRates: {} };
    readMoneyTables.mockResolvedValue(tables);
    expect(await getMoneyTables()).toBe(tables);
    expect(cacheLife.mock.calls).toEqual([["daysNoSwr"]]);
    expect(cacheTag).toHaveBeenCalledWith(FX_CACHE_TAG);
  });
});

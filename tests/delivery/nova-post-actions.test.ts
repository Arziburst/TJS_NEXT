// The Nova Post Server Actions refuse a client over its budget (the shared limiter, src/lib/delivery/rate-limit.ts)
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const allowDeliveryCall = vi.fn<(action: "search" | "quote") => Promise<boolean>>();
vi.mock("@/lib/delivery/rate-limit", () => ({ allowDeliveryCall: (action: "search" | "quote") => allowDeliveryCall(action) }));
// the zone table, the rates and the catalog are not read when a call is refused
vi.mock("@/lib/supabase/server", () => ({
  createPublicServerClient: () => {
    throw new Error("not expected");
  },
}));
const calculate = vi.fn();
const searchSettlements = vi.fn();
const listDivisions = vi.fn();
vi.mock("@/lib/delivery/nova-post/config", () => ({
  getNovaPostClient: () => ({ calculate, searchSettlements, listDivisions }),
}));

const { estimateNovaPostDelivery, listNovaPostDivisions, searchNovaPostSettlements } = await import(
  "@/lib/delivery/nova-post/actions"
);

beforeEach(() => {
  allowDeliveryCall.mockReset().mockResolvedValue(false);
  calculate.mockReset();
  searchSettlements.mockReset();
  listDivisions.mockReset();
});

describe("the Nova Post actions over the client's budget", () => {
  it("refuse towns and points before asking Nova Post (search budget)", async () => {
    expect(await searchNovaPostSettlements({ country: "PL", text: "Wroc", locale: "pl" })).toEqual({
      ok: false,
      reason: "rateLimited",
    });
    expect(await listNovaPostDivisions({ country: "PL", settlementId: 26061, categories: ["PUDO"], locale: "pl" })).toEqual({
      ok: false,
      reason: "rateLimited",
    });
    expect(allowDeliveryCall.mock.calls).toEqual([["search"], ["search"]]);
    expect(searchSettlements).not.toHaveBeenCalled();
    expect(listDivisions).not.toHaveBeenCalled();
  });

  it("refuse a quote before asking Nova Post (quote budget)", async () => {
    const input = { country: "PL", destination: { kind: "division", divisionId: 1 }, goods: null, locale: "pl" };
    expect(await estimateNovaPostDelivery(input)).toEqual({ ok: false, reason: "rateLimited" });
    expect(allowDeliveryCall.mock.calls).toEqual([["quote"]]);
    expect(calculate).not.toHaveBeenCalled();
  });

  it("refuse an invalid input without spending the budget (the UK is not a destination)", async () => {
    expect(await searchNovaPostSettlements({ country: "GB", text: "London", locale: "en" })).toEqual({ ok: false, reason: "invalid" });
    expect(allowDeliveryCall).not.toHaveBeenCalled();
  });
});

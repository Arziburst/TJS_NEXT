import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc }),
  // the zone table and the catalog are not read when a request is refused
  createPublicServerClient: () => {
    throw new Error("not expected");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }),
  cookies: async () => ({ get: () => undefined }),
}));
const calculate = vi.fn();
const searchSettlements = vi.fn();
const listDivisions = vi.fn();
vi.mock("@/lib/delivery/nova-post/config", () => ({
  getNovaPostClient: () => ({ calculate, searchSettlements, listDivisions }),
}));

const { allowDeliveryRequest, DELIVERY_RATE_LIMITS, deliveryRateLimitKey } = await import("@/lib/delivery/nova-post/rate-limit");
const { estimateNovaPostDelivery, listNovaPostDivisions, searchNovaPostSettlements } = await import(
  "@/lib/delivery/nova-post/actions"
);

const refuse = () => rpc.mockResolvedValue({ data: false, error: null });

beforeEach(() => {
  rpc.mockReset();
  calculate.mockReset();
  searchSettlements.mockReset();
  listDivisions.mockReset();
});

describe("the delivery request budget", () => {
  it("is 60 searches and 20 quotes per minute per client", () => {
    expect(DELIVERY_RATE_LIMITS).toEqual({ search: { max: 60, windowSeconds: 60 }, quote: { max: 20, windowSeconds: 60 } });
  });

  it("counts per request kind and hashed IP (no raw IP stored)", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await allowDeliveryRequest("quote", "203.0.113.9")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: deliveryRateLimitKey("quote", "203.0.113.9"),
      p_max: 20,
      p_window_seconds: 60,
    });
    expect(deliveryRateLimitKey("quote", "203.0.113.9")).toMatch(/^nova-post-quote:ip:[0-9a-f]{32}$/);
    expect(deliveryRateLimitKey("search", "203.0.113.9")).toMatch(/^nova-post-search:ip:/);
  });

  it("fails closed when the counter errors or cannot be reached", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await allowDeliveryRequest("search", "203.0.113.9")).toBe(false);
    rpc.mockRejectedValue(new Error("network"));
    expect(await allowDeliveryRequest("search", "203.0.113.9")).toBe(false);
  });
});

describe("the delivery actions refuse a client over its budget", () => {
  it("before asking Nova Post for towns or points", async () => {
    refuse();
    expect(await searchNovaPostSettlements({ country: "PL", text: "Wroc", locale: "pl" })).toEqual({
      ok: false,
      reason: "rateLimited",
    });
    expect(await listNovaPostDivisions({ country: "PL", settlementId: 26061, categories: ["PUDO"], locale: "pl" })).toEqual({
      ok: false,
      reason: "rateLimited",
    });
    expect(searchSettlements).not.toHaveBeenCalled();
    expect(listDivisions).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", expect.objectContaining({ p_max: 60 }));
  });

  it("before quoting", async () => {
    refuse();
    const input = { country: "PL", destination: { kind: "division", divisionId: 1 }, goods: null, locale: "pl" };
    expect(await estimateNovaPostDelivery(input)).toEqual({ ok: false, reason: "rateLimited" });
    expect(calculate).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", expect.objectContaining({ p_max: 20 }));
  });

  it("but an invalid input is refused without spending the budget", async () => {
    expect(await searchNovaPostSettlements({ country: "GB", text: "London", locale: "en" })).toEqual({ ok: false, reason: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

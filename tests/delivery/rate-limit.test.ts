// The per-client limits of the public delivery actions (src/lib/delivery/rate-limit.ts).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
const requestHeaders = vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" }));
vi.mock("next/headers", () => ({ headers: () => requestHeaders() }));

const { DELIVERY_RATE_LIMITS, allowDeliveryCall, deliveryRateLimitKey } = await import("@/lib/delivery/rate-limit");

describe("deliveryRateLimitKey", () => {
  it("keys per action and client IP, hashed like the auth keys", () => {
    const key = deliveryRateLimitKey("search", "203.0.113.7");
    expect(key).toMatch(/^delivery-search:ip:[0-9a-f]{32}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(deliveryRateLimitKey("quote", "203.0.113.7")).toBe(key.replace("delivery-search:", "delivery-quote:"));
  });
});

describe("allowDeliveryCall", () => {
  it("counts searches at 60 and quotes at 20 per minute per client", async () => {
    expect(DELIVERY_RATE_LIMITS).toEqual({ search: { max: 60, windowSeconds: 60 }, quote: { max: 20, windowSeconds: 60 } });
    rpc.mockReset().mockResolvedValue({ data: true, error: null });
    expect(await allowDeliveryCall("search")).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("consume_rate_limit", {
      p_key: deliveryRateLimitKey("search", "203.0.113.7"),
      p_max: 60,
      p_window_seconds: 60,
    });
    expect(await allowDeliveryCall("quote")).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith("consume_rate_limit", expect.objectContaining({ p_max: 20, p_window_seconds: 60 }));
  });

  it("refuses a client over its budget", async () => {
    rpc.mockReset().mockResolvedValue({ data: false, error: null });
    expect(await allowDeliveryCall("quote")).toBe(false);
  });

  it("fails closed when the counter errors, cannot be reached or there is no request", async () => {
    rpc.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await allowDeliveryCall("search")).toBe(false);
    rpc.mockReset().mockRejectedValue(new Error("network"));
    expect(await allowDeliveryCall("search")).toBe(false);
    requestHeaders.mockRejectedValueOnce(new Error("headers() outside a request"));
    rpc.mockReset().mockResolvedValue({ data: true, error: null });
    expect(await allowDeliveryCall("search")).toBe(false);
  });
});

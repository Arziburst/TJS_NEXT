import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));

const { allowAttempt, AUTH_RATE_LIMIT, clientIp, rateLimitKeys } = await import("@/lib/auth/rate-limit");

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": " 198.51.100.2 , 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("rateLimitKeys", () => {
  it("keys per action, IP and email, hashed (no raw IP or email stored)", () => {
    const keys = rateLimitKeys("sign-in", "203.0.113.7", "Olena@Example.test");
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^sign-in:ip:[0-9a-f]{32}$/);
    expect(keys[1]).toMatch(/^sign-in:email:[0-9a-f]{32}$/);
    expect(keys.join()).not.toMatch(/203\.0\.113\.7|olena/i);
    // the email key ignores case, so the address cannot dodge its budget
    expect(rateLimitKeys("sign-in", "1.1.1.1", "olena@example.test")[1]).toBe(keys[1]);
    expect(rateLimitKeys("sign-up", "203.0.113.7")).toEqual([keys[0]!.replace("sign-in:", "sign-up:")]);
  });
});

describe("allowAttempt", () => {
  it("asks the counter once per key with the legacy limit (15 per 5 minutes)", async () => {
    rpc.mockReset().mockResolvedValue({ data: true, error: null });
    expect(await allowAttempt("sign-in", "203.0.113.7", "a@example.test")).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", expect.objectContaining({ p_max: 15, p_window_seconds: 300 }));
    expect(AUTH_RATE_LIMIT).toEqual({ max: 15, windowSeconds: 300 });
  });

  it("refuses when any key is over its budget", async () => {
    rpc.mockReset().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await allowAttempt("sign-in", "203.0.113.7", "a@example.test")).toBe(false);
  });

  it("fails closed when the counter errors or cannot be reached", async () => {
    rpc.mockReset().mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await allowAttempt("sign-up", "203.0.113.7")).toBe(false);
    rpc.mockReset().mockRejectedValue(new Error("network"));
    expect(await allowAttempt("sign-up", "203.0.113.7")).toBe(false);
  });
});

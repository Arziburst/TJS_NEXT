import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { SessionUnavailableError, unlessSessionUnavailable } = await import("@/lib/auth/session");

// The header's slots in an Auth outage (#112): they fall back instead of failing the root layout.
describe("unlessSessionUnavailable", () => {
  it("passes the read's value through", async () => {
    await expect(unlessSessionUnavailable(Promise.resolve({ pieces: 2 }), null)).resolves.toEqual({ pieces: 2 });
  });

  it("returns the fallback when the session cannot be read", async () => {
    await expect(unlessSessionUnavailable(Promise.reject(new SessionUnavailableError()), "unavailable")).resolves.toBe(
      "unavailable",
    );
  });

  it("rethrows any other failure", async () => {
    const failure = new Error("database down");
    await expect(unlessSessionUnavailable(Promise.reject(failure), null)).rejects.toBe(failure);
  });
});

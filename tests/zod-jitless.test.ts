import { describe, expect, it } from "vitest";

// src/instrumentation-client.ts turns zod's jitless parsing on through zod's shared config global (#31, #105):
// this proves zod reads it, so a zod upgrade that moves the global fails here, not in the browser's CSP report.
describe("instrumentation-client", () => {
  it("makes zod parse jitless, before and after zod loads", async () => {
    await import("@/instrumentation-client");
    const { z } = await import("zod");
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.string() }).parse({ a: "x" })).toEqual({ a: "x" });
  });
});

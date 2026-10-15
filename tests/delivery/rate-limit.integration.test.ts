// The delivery limits on the local stack: the real counter (public.consume_rate_limit through the service
// role) refuses the 21st quote of one client within the minute, while another client and the searches go on.
// Skipped when no local stack is configured.
import { describe, expect, it, vi } from "vitest";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));
let ip = "";
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip }) }));

const stack = localStack();

describe.skipIf(!stack)("delivery rate limits on the local stack", async () => {
  if (!stack) return;
  const { allowDeliveryCall } = await import("@/lib/delivery/rate-limit");
  // fresh clients per run, so an earlier run in the same window does not count; their counters expire with the
  // window (consume_rate_limit sweeps old windows itself)
  const client = `test-${crypto.randomUUID()}`;
  const other = `test-${crypto.randomUUID()}`;

  it("lets 20 quotes through and refuses the 21st, per client", async () => {
    ip = client;
    const answers: boolean[] = [];
    for (let i = 0; i < 21; i += 1) answers.push(await allowDeliveryCall("quote"));
    expect(answers.slice(0, 20).every(Boolean)).toBe(true);
    expect(answers[20]).toBe(false);

    // the client's searches have their own budget, another client its own quotes
    expect(await allowDeliveryCall("search")).toBe(true);
    ip = other;
    expect(await allowDeliveryCall("quote")).toBe(true);
  });
});

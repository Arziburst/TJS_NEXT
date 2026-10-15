// The outbox processor's decisions with an in-memory outbox (the database's claim and completion are covered by
// tests/notifications/outbox.integration.test.ts and supabase/tests/database/notification_outbox_test.sql).
import { describe, expect, it, vi } from "vitest";
import type { NotificationOrder } from "@/lib/notifications/order";
import type { Channel, ClaimedEvent, Completion, Delivery, ProcessorDeps, SendOutcome } from "@/lib/notifications/processor";
import { kyivBranchOrder } from "./fixtures";

vi.mock("server-only", () => ({}));

const { BATCH_SIZE, MAX_ATTEMPTS, MAX_BATCHES, processOutbox, retryDelaySeconds } = await import("@/lib/notifications/processor");

type Row = {
  id: string;
  orderId: string;
  attempts: number;
  telegram: Delivery;
  email: Delivery;
  claimToken: string | null;
  processed: boolean;
  dueIn: number;
  lastError: string | null;
};

function outbox(count: number, event = "order_created") {
  const rows: Row[] = Array.from({ length: count }, (_, index) => ({
    id: `event-${index}`,
    orderId: `order-${index}`,
    attempts: 0,
    telegram: "pending",
    email: "pending",
    claimToken: null,
    processed: false,
    dueIn: 0,
    lastError: null,
  }));
  let token = 0;
  const completions: Completion[] = [];
  const store = {
    rows,
    completions,
    claim: async (limit: number): Promise<ClaimedEvent[]> =>
      rows
        .filter((row) => !row.processed && row.dueIn <= 0 && row.claimToken === null)
        .slice(0, limit)
        .map((row) => {
          row.attempts += 1;
          row.claimToken = `claim-${(token += 1)}`;
          return { id: row.id, claimToken: row.claimToken, event, orderId: row.orderId, attempts: row.attempts, telegram: row.telegram, email: row.email };
        }),
    complete: async (completion: Completion): Promise<boolean> => {
      completions.push(completion);
      const row = rows.find((candidate) => candidate.id === completion.id);
      if (!row || row.claimToken !== completion.claimToken) return false;
      Object.assign(row, {
        telegram: completion.telegram,
        email: completion.email,
        lastError: completion.lastError,
        claimToken: null,
        processed: completion.retryInSeconds === null,
        dueIn: completion.retryInSeconds ?? 0,
      });
      return true;
    },
    // the backoff has passed
    elapse: () => rows.forEach((row) => (row.dueIn = 0)),
  };
  return store;
}

function deps(store: ReturnType<typeof outbox>, send: Partial<Record<Channel, () => Promise<SendOutcome>>> = {}): ProcessorDeps & {
  calls: Record<Channel, string[]>;
} {
  const calls: Record<Channel, string[]> = { telegram: [], email: [] };
  const sender = (channel: Channel) => async (event: ClaimedEvent, order: NotificationOrder) => {
    calls[channel].push(`${event.id}:${order.number}`);
    return (await send[channel]?.()) ?? { status: "sent" as const };
  };
  return {
    calls,
    claim: store.claim,
    complete: store.complete,
    loadOrder: async (orderId) => kyivBranchOrder({ id: orderId, number: 10_000 + Number(orderId.split("-")[1]) }),
    send: { telegram: sender("telegram"), email: sender("email") },
  };
}

describe("retryDelaySeconds", () => {
  it("doubles from a minute and stops at six hours", () => {
    expect([1, 2, 3, 4, 8].map(retryDelaySeconds)).toEqual([60, 120, 240, 480, 7680]);
    expect(retryDelaySeconds(12)).toBe(6 * 60 * 60);
    expect(retryDelaySeconds(40)).toBe(6 * 60 * 60);
  });
});

describe("processOutbox", () => {
  it("sends both channels of every due event once and marks it processed", async () => {
    const store = outbox(3);
    const run = deps(store);
    expect(await processOutbox(run)).toEqual({ claimed: 3, processed: 3, retried: 0, lostClaims: 0, sent: 6, skipped: 0, failed: 0 });
    expect(run.calls.telegram).toEqual(["event-0:10000", "event-1:10001", "event-2:10002"]);
    expect(run.calls.email).toHaveLength(3);
    expect(store.rows.every((row) => row.processed && row.telegram === "sent" && row.email === "sent" && row.lastError === null)).toBe(true);
    // a second run finds nothing to send
    expect((await processOutbox(run)).claimed).toBe(0);
    expect(run.calls.telegram).toHaveLength(3);
  });

  it("retries only the failed channel, with backoff, and records the error", async () => {
    const store = outbox(1);
    let telegramUp = false;
    const run = deps(store, {
      telegram: async () => (telegramUp ? { status: "sent" } : { status: "error", error: "telegram: HTTP 502" }),
    });

    expect(await processOutbox(run)).toMatchObject({ processed: 0, retried: 1, sent: 1 });
    expect(store.rows[0]).toMatchObject({ processed: false, telegram: "pending", email: "sent", lastError: "telegram: telegram: HTTP 502", dueIn: 60 });
    // not due yet: nothing is sent
    expect((await processOutbox(run)).claimed).toBe(0);

    store.elapse();
    expect(await processOutbox(run)).toMatchObject({ retried: 1 });
    expect(store.rows[0].dueIn).toBe(120);

    telegramUp = true;
    store.elapse();
    expect(await processOutbox(run)).toMatchObject({ processed: 1, sent: 1 });
    expect(store.rows[0]).toMatchObject({ processed: true, telegram: "sent", email: "sent", lastError: null, attempts: 3 });
    // the customer got one email, the owner one message
    expect(run.calls.email).toHaveLength(1);
    expect(run.calls.telegram).toHaveLength(3);
  });

  it("marks a channel failed after MAX_ATTEMPTS and stops retrying", async () => {
    const store = outbox(1);
    const run = deps(store, { email: async () => ({ status: "error", error: "email: HTTP 500" }) });
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      expect(await processOutbox(run)).toMatchObject({ retried: 1, failed: 0 });
      store.elapse();
    }
    expect(await processOutbox(run)).toMatchObject({ processed: 1, failed: 1 });
    expect(store.rows[0]).toMatchObject({ processed: true, telegram: "sent", email: "failed", attempts: MAX_ATTEMPTS });
    store.elapse();
    expect((await processOutbox(run)).claimed).toBe(0);
    expect(run.calls.email).toHaveLength(MAX_ATTEMPTS);
  });

  it("marks an unconfigured channel skipped, not failed, and does not retry it", async () => {
    const store = outbox(1);
    const run = deps(store, { telegram: async () => ({ status: "skipped_unconfigured", reason: "not configured (TELEGRAM_BOT_TOKEN unset)" }) });
    expect(await processOutbox(run)).toMatchObject({ processed: 1, skipped: 1, failed: 0, sent: 1 });
    expect(store.rows[0]).toMatchObject({
      processed: true,
      telegram: "skipped_unconfigured",
      email: "sent",
      lastError: "telegram: not configured (TELEGRAM_BOT_TOKEN unset)",
    });
  });

  it("treats a sender that throws like a failed send", async () => {
    const store = outbox(1);
    const run = deps(store, {
      email: async () => {
        throw new Error("boom");
      },
    });
    expect(await processOutbox(run)).toMatchObject({ retried: 1 });
    expect(store.rows[0]).toMatchObject({ email: "pending", lastError: "email: Error: boom" });
  });

  it("retries an event whose order could not be read, without sending", async () => {
    const store = outbox(1);
    const run = deps(store);
    run.loadOrder = async () => {
      throw new Error("connection reset");
    };
    expect(await processOutbox(run)).toMatchObject({ retried: 1, sent: 0 });
    expect(store.rows[0].lastError).toContain("the order could not be read: connection reset");
    expect(run.calls.telegram).toHaveLength(0);
  });

  it("counts a completion whose claim was lost and sends nothing twice", async () => {
    const store = outbox(1);
    const run = deps(store);
    const complete = run.complete;
    run.complete = async (completion) => {
      // another run took the event over meanwhile
      store.rows[0].claimToken = "someone-else";
      return complete(completion);
    };
    expect(await processOutbox(run)).toMatchObject({ lostClaims: 1, processed: 0 });
  });

  it("takes at most MAX_BATCHES batches per run", async () => {
    const store = outbox(BATCH_SIZE * MAX_BATCHES + 3);
    const report = await processOutbox(deps(store));
    expect(report.claimed).toBe(BATCH_SIZE * MAX_BATCHES);
    expect((await processOutbox(deps(store))).claimed).toBe(3);
  });

  it("refuses an event it does not know", async () => {
    const store = outbox(1, "order_paid");
    const run = deps(store);
    expect(await processOutbox(run)).toMatchObject({ retried: 1, sent: 0 });
    expect(store.rows[0].lastError).toContain("unknown event order_paid");
  });
});

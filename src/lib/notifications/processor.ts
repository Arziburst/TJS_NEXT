import "server-only";

import type { NotificationOrder } from "./order";

// The outbox processor (D11: sending never blocks or loses an order). It runs after an order is placed (after())
// and by the daily cron; each run claims the due events (claim_outbox_events: FOR UPDATE SKIP LOCKED and a
// lease), sends every channel still pending and writes the outcome back with the claim's token
// (complete_outbox_event). A failed channel is retried with exponential backoff until MAX_ATTEMPTS; a channel
// that is not configured is skipped. The order is only read here, never changed.

export type Delivery = "pending" | "sent" | "skipped_unconfigured" | "failed";
export type Channel = "telegram" | "email";

export const CHANNELS = ["telegram", "email"] as const satisfies readonly Channel[];

// claims per run; a run takes at most MAX_BATCHES of them, the rest waits for the next run
export const BATCH_SIZE = 10;
export const MAX_BATCHES = 5;
// longer than a batch can take (each send times out after 10 s, the channels of an event run together): a
// second run never claims an event the first one still sends, and an event of a run that died is due again
export const LEASE_SECONDS = 300;
// the attempt that fails at this count marks the channel failed for good
export const MAX_ATTEMPTS = 8;
// 1 min, 2 min, 4 min … capped at 6 hours
export const RETRY_BASE_SECONDS = 60;
export const RETRY_MAX_SECONDS = 6 * 60 * 60;

export function retryDelaySeconds(attempts: number): number {
  return Math.min(RETRY_BASE_SECONDS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_SECONDS);
}

export type ClaimedEvent = {
  id: string;
  claimToken: string;
  event: string;
  orderId: string;
  // counts this claim
  attempts: number;
  telegram: Delivery;
  email: Delivery;
};

export type SendOutcome = { status: "sent" } | { status: "skipped_unconfigured"; reason: string } | { status: "error"; error: string };

export type Completion = {
  id: string;
  claimToken: string;
  telegram: Delivery;
  email: Delivery;
  lastError: string | null;
  // null: processed
  retryInSeconds: number | null;
};

export type ProcessorDeps = {
  claim: (limit: number, leaseSeconds: number) => Promise<ClaimedEvent[]>;
  // null when the order is gone (the event goes with it, so only a run racing a deletion sees that)
  loadOrder: (orderId: string) => Promise<NotificationOrder | null>;
  // false when the claim was lost (the lease ran out and another run holds the event now)
  complete: (completion: Completion) => Promise<boolean>;
  send: Record<Channel, (event: ClaimedEvent, order: NotificationOrder) => Promise<SendOutcome>>;
};

export type ProcessReport = {
  claimed: number;
  processed: number;
  retried: number;
  lostClaims: number;
  sent: number;
  skipped: number;
  failed: number;
};

async function deliver(
  channel: Channel,
  event: ClaimedEvent,
  order: NotificationOrder | null,
  deps: ProcessorDeps,
): Promise<{ status: Delivery; note: string | null; sentNow: boolean }> {
  const current = event[channel];
  if (current !== "pending") return { status: current, note: null, sentNow: false };

  let outcome: SendOutcome;
  if (!order) outcome = { status: "error", error: "the order could not be read" };
  else if (event.event !== "order_created") outcome = { status: "error", error: `unknown event ${event.event}` };
  else {
    try {
      outcome = await deps.send[channel](event, order);
    } catch (error) {
      outcome = { status: "error", error: `${(error as Error)?.name ?? "Error"}: ${String((error as Error)?.message ?? error).slice(0, 300)}` };
    }
  }

  if (outcome.status === "sent") return { status: "sent", note: null, sentNow: true };
  if (outcome.status === "skipped_unconfigured") return { status: "skipped_unconfigured", note: `${channel}: ${outcome.reason}`, sentNow: false };
  const final = event.attempts >= MAX_ATTEMPTS;
  return { status: final ? "failed" : "pending", note: `${channel}: ${outcome.error}`, sentNow: false };
}

async function processEvent(event: ClaimedEvent, deps: ProcessorDeps, report: ProcessReport): Promise<void> {
  let order: NotificationOrder | null = null;
  let readError: string | null = null;
  try {
    order = await deps.loadOrder(event.orderId);
  } catch (error) {
    readError = `the order could not be read: ${String((error as Error)?.message ?? error).slice(0, 300)}`;
  }

  const [telegram, email] = await Promise.all(CHANNELS.map((channel) => deliver(channel, event, order, deps)));
  const results = { telegram, email };
  const pending = CHANNELS.some((channel) => results[channel].status === "pending");
  const notes = [readError, ...CHANNELS.map((channel) => results[channel].note)].filter((note): note is string => note !== null);

  const completed = await deps.complete({
    id: event.id,
    claimToken: event.claimToken,
    telegram: telegram.status,
    email: email.status,
    lastError: notes.length > 0 ? notes.join("; ") : null,
    retryInSeconds: pending ? retryDelaySeconds(event.attempts) : null,
  });

  for (const channel of CHANNELS) {
    const result = results[channel];
    if (result.sentNow) report.sent += 1;
    if (event[channel] === "pending" && result.status === "skipped_unconfigured") report.skipped += 1;
    if (event[channel] === "pending" && result.status === "failed") report.failed += 1;
  }
  if (!completed) report.lostClaims += 1;
  else if (pending) report.retried += 1;
  else report.processed += 1;
  // a skipped channel is expected where sending is off; only a failed send is an error worth a log line
  if (readError || CHANNELS.some((channel) => event[channel] === "pending" && ["pending", "failed"].includes(results[channel].status))) {
    console.error(`notifications: event ${event.id}: ${notes.join("; ")}`);
  }
}

/** One run over the due outbox events. Never throws for a failed send; a failed claim or write throws. */
export async function processOutbox(deps: ProcessorDeps): Promise<ProcessReport> {
  const report: ProcessReport = { claimed: 0, processed: 0, retried: 0, lostClaims: 0, sent: 0, skipped: 0, failed: 0 };
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const events = await deps.claim(BATCH_SIZE, LEASE_SECONDS);
    report.claimed += events.length;
    for (const event of events) await processEvent(event, deps, report);
    if (events.length < BATCH_SIZE) break;
  }
  return report;
}

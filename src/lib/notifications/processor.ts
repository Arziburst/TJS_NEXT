import "server-only";

import { isOrderEvent } from "./events";
import type { NotificationOrder } from "./order";

// The outbox processor (D11: sending never blocks or loses an order). It runs after an order is placed (after())
// and by the cron every six hours; each run claims the due events (claim_outbox_events: FOR UPDATE SKIP LOCKED and a
// lease), sends every channel still pending and writes the outcome back with the claim's token
// (complete_outbox_event). A failed channel is retried with exponential backoff until MAX_ATTEMPTS; a channel
// that is not configured is skipped; a channel the provider throttles waits as long as it asks, without spending
// an attempt. The order is only read here, never changed.
//
// Delivery is at least once: when the completion fails after a send (the run throws), the event is claimed again
// once its lease ends and its Telegram message may go out a second time (accepted; the email is deduplicated by
// its Idempotency-Key).

export type Delivery = "pending" | "sent" | "skipped_unconfigured" | "skipped_expired" | "failed";
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
// Telegram takes about 20 messages a minute in one group: a run sends at most this many and defers the rest by
// DEFERRED_SECONDS (a backlog goes out over the next runs instead of meeting 429s)
export const SENDS_PER_RUN: Partial<Record<Channel, number>> = { telegram: 15 };
export const DEFERRED_SECONDS = 60;

export function retryDelaySeconds(attempts: number): number {
  return Math.min(RETRY_BASE_SECONDS * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_SECONDS);
}

export type ClaimedEvent = {
  id: string;
  claimToken: string;
  event: string;
  orderId: string;
  // when the event was written: when the order was placed, or when its status changed
  createdAt: string;
  // what the event says beyond the order ({ number } or, for a status change, { number, from, to }); absent in
  // tests that do not need it
  payload?: unknown;
  // counts this claim
  attempts: number;
  telegram: Delivery;
  email: Delivery;
};

export type SendOutcome =
  | { status: "sent" }
  // not sent and never retried: sending is not configured, or the message is too late to be useful
  | { status: "skipped_unconfigured" | "skipped_expired"; reason: string }
  // the provider asks to wait (Telegram's 429 with retry_after): not a failure, no attempt spent
  | { status: "throttled"; retryAfterSeconds: number; error: string }
  | { status: "error"; error: string };

export type Completion = {
  id: string;
  claimToken: string;
  telegram: Delivery;
  email: Delivery;
  lastError: string | null;
  // null: processed
  retryInSeconds: number | null;
  // the claim's attempt is given back: nothing failed, a channel only had to wait
  refundAttempt: boolean;
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
  // channels that waited for the provider or for the next run (not failures)
  throttled: number;
  failed: number;
};

// What one run knows across its events: how many messages each channel sent, and since when a channel is paused
type RunState = { sent: Record<Channel, number>; pausedFor: Partial<Record<Channel, number>> };

type ChannelResult = {
  status: Delivery;
  note: string | null;
  sentNow: boolean;
  // seconds to wait when the channel was throttled or deferred (pending without a failure)
  waitSeconds: number | null;
  // a send failed: the attempt counts and the backoff applies
  failedNow: boolean;
};

// a send, or the run holding the channel back without asking the provider (paused after a 429, or over its cap)
type Attempt = SendOutcome | { status: "held"; retryAfterSeconds: number; error: string };

async function attempt(channel: Channel, event: ClaimedEvent, order: NotificationOrder | null, deps: ProcessorDeps, run: RunState): Promise<Attempt> {
  if (!order) return { status: "error", error: "the order could not be read" };
  if (!isOrderEvent(event.event)) return { status: "error", error: `unknown event ${event.event}` };
  const paused = run.pausedFor[channel];
  if (paused !== undefined) return { status: "held", retryAfterSeconds: paused, error: "paused after a 429 in this run" };
  const cap = SENDS_PER_RUN[channel];
  if (cap !== undefined && run.sent[channel] >= cap) {
    return { status: "held", retryAfterSeconds: DEFERRED_SECONDS, error: `deferred: ${cap} messages per run` };
  }
  try {
    return await deps.send[channel](event, order);
  } catch (error) {
    return { status: "error", error: `${(error as Error)?.name ?? "Error"}: ${String((error as Error)?.message ?? error).slice(0, 300)}` };
  }
}

async function deliver(channel: Channel, event: ClaimedEvent, order: NotificationOrder | null, deps: ProcessorDeps, run: RunState): Promise<ChannelResult> {
  const current = event[channel];
  if (current !== "pending") return { status: current, note: null, sentNow: false, waitSeconds: null, failedNow: false };

  const outcome = await attempt(channel, event, order, deps, run);
  if (outcome.status === "sent") {
    run.sent[channel] += 1;
    return { status: "sent", note: null, sentNow: true, waitSeconds: null, failedNow: false };
  }
  if (outcome.status === "throttled" || outcome.status === "held") {
    // after a 429 the rest of this run leaves the channel alone: every further send would be refused as well
    if (outcome.status === "throttled") run.pausedFor[channel] = outcome.retryAfterSeconds;
    return { status: "pending", note: `${channel}: ${outcome.error}`, sentNow: false, waitSeconds: outcome.retryAfterSeconds, failedNow: false };
  }
  if (outcome.status !== "error") {
    return { status: outcome.status, note: `${channel}: ${outcome.reason}`, sentNow: false, waitSeconds: null, failedNow: false };
  }
  const final = event.attempts >= MAX_ATTEMPTS;
  return { status: final ? "failed" : "pending", note: `${channel}: ${outcome.error}`, sentNow: false, waitSeconds: null, failedNow: true };
}

async function processEvent(event: ClaimedEvent, deps: ProcessorDeps, report: ProcessReport, run: RunState): Promise<void> {
  let order: NotificationOrder | null = null;
  let readError: string | null = null;
  try {
    order = await deps.loadOrder(event.orderId);
  } catch (error) {
    readError = `the order could not be read: ${String((error as Error)?.message ?? error).slice(0, 300)}`;
  }

  const [telegram, email] = await Promise.all(CHANNELS.map((channel) => deliver(channel, event, order, deps, run)));
  const results = { telegram, email };
  const pending = CHANNELS.some((channel) => results[channel].status === "pending");
  const failedNow = CHANNELS.some((channel) => results[channel].failedNow);
  const waits = CHANNELS.map((channel) => results[channel].waitSeconds).filter((wait): wait is number => wait !== null);
  // a failure brings the backoff; a channel that only waits for the provider retries after the wait it was given
  const retryInSeconds = !pending ? null : Math.max(failedNow ? retryDelaySeconds(event.attempts) : 0, ...waits);
  const notes = [readError, ...CHANNELS.map((channel) => results[channel].note)].filter((note): note is string => note !== null);

  const completed = await deps.complete({
    id: event.id,
    claimToken: event.claimToken,
    telegram: telegram.status,
    email: email.status,
    lastError: notes.length > 0 ? notes.join("; ") : null,
    retryInSeconds,
    refundAttempt: pending && !failedNow,
  });

  for (const channel of CHANNELS) {
    const result = results[channel];
    if (result.sentNow) report.sent += 1;
    if (result.waitSeconds !== null) report.throttled += 1;
    if (event[channel] === "pending" && result.status.startsWith("skipped_")) report.skipped += 1;
    if (event[channel] === "pending" && result.status === "failed") report.failed += 1;
  }
  if (!completed) report.lostClaims += 1;
  else if (pending) report.retried += 1;
  else report.processed += 1;
  // a skipped or throttled channel is expected; only a failed send is an error worth a log line
  if (readError || failedNow) console.error(`notifications: event ${event.id}: ${notes.join("; ")}`);
}

/** One run over the due outbox events. Never throws for a failed send; a failed claim or write throws. */
export async function processOutbox(deps: ProcessorDeps): Promise<ProcessReport> {
  const report: ProcessReport = { claimed: 0, processed: 0, retried: 0, lostClaims: 0, sent: 0, skipped: 0, throttled: 0, failed: 0 };
  const run: RunState = { sent: { telegram: 0, email: 0 }, pausedFor: {} };
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const events = await deps.claim(BATCH_SIZE, LEASE_SECONDS);
    report.claimed += events.length;
    for (const event of events) await processEvent(event, deps, report, run);
    if (events.length < BATCH_SIZE) break;
  }
  return report;
}

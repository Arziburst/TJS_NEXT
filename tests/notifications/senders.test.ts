// The real channel senders with fake APIs: the owner always gets the order in Telegram, the customer's confirmation
// only within CONFIRMATION_EMAIL_MAX_AGE_MS of the order (the backlog stored before sending worked gets none).
import { describe, expect, it, vi } from "vitest";
import type { NotificationConfig } from "@/lib/notifications/config";
import type { ClaimedEvent } from "@/lib/notifications/processor";
import { kyivBranchOrder } from "./fixtures";

vi.mock("server-only", () => ({}));
// the shop's channels come from the settings (#21, a database read): none here, the emails show their TBD line
vi.mock("@/lib/notifications/contacts", () => ({ readShopContacts: async () => null }));

const { CONFIRMATION_EMAIL_MAX_AGE_MS, channelSenders } = await import("@/lib/notifications/run");

const config: NotificationConfig = {
  telegram: { ok: true, config: { token: "123:test", chatId: "-100123", apiBaseUrl: "http://telegram.test" } },
  email: { ok: true, config: { apiKey: "re_test", from: "Shop <orders@example.test>", replyTo: null, apiUrl: "http://resend.test" } },
};

const placed = new Date("2026-10-16T09:05:00Z");

function event(): ClaimedEvent {
  return {
    id: "event-1",
    claimToken: "claim-1",
    event: "order_created",
    orderId: "order-1",
    createdAt: placed.toISOString(),
    attempts: 1,
    telegram: "pending",
    email: "pending",
  };
}

function senders(nowMs: number) {
  const fetchImpl = vi.fn<typeof fetch>(async (input) =>
    String(input).startsWith("http://telegram.test/") ? Response.json({ ok: true, result: {} }) : Response.json({ id: "email-1" }),
  );
  return { fetchImpl, send: channelSenders(config, fetchImpl, () => new Date(nowMs)) };
}

describe("channelSenders", () => {
  it("is 24 hours", () => {
    expect(CONFIRMATION_EMAIL_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("sends the confirmation for an order up to 24 hours old", async () => {
    const { fetchImpl, send } = senders(placed.getTime() + CONFIRMATION_EMAIL_MAX_AGE_MS);
    expect(await send.email(event(), kyivBranchOrder())).toEqual({ status: "sent" });
    expect(fetchImpl).toHaveBeenCalledWith("http://resend.test/emails", expect.anything());
  });

  it("skips the confirmation of an older order without calling Resend, and still tells the owner", async () => {
    const { fetchImpl, send } = senders(placed.getTime() + CONFIRMATION_EMAIL_MAX_AGE_MS + 1);
    expect(await send.email(event(), kyivBranchOrder())).toEqual({
      status: "skipped_expired",
      reason: "the order is older than 24 hours: no late confirmation",
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const weekLater = senders(placed.getTime() + 7 * CONFIRMATION_EMAIL_MAX_AGE_MS);
    expect(await weekLater.send.telegram(event(), kyivBranchOrder())).toEqual({ status: "sent" });
    expect(weekLater.fetchImpl).toHaveBeenCalledWith("http://telegram.test/bot123:test/sendMessage", expect.anything());
  });

  it("reports an unconfigured channel before its age", async () => {
    const off = channelSenders(
      { telegram: { ok: false, reason: "off" }, email: { ok: false, reason: "off" } },
      vi.fn<typeof fetch>(),
      () => new Date(placed.getTime() + 7 * CONFIRMATION_EMAIL_MAX_AGE_MS),
    );
    expect(await off.email(event(), kyivBranchOrder())).toEqual({ status: "skipped_unconfigured", reason: "off" });
  });
});

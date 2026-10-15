// The outbox processor on the local stack (D11: sending never blocks or loses an order): a failing transport
// leaves the order intact and the event is retried until it goes out; two processors running at the same time
// never send one message twice; without settings the events are skipped, not failed. The transports are fakes:
// nothing leaves the machine. Skipped without a stack.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { NotificationConfig } from "@/lib/notifications/config";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("the notifications outbox on the local stack", async () => {
  if (!stack) return;
  const { createOrderRequest } = await import("@/lib/orders/store");
  const { processOutbox } = await import("@/lib/notifications/processor");
  const { claimOutboxEvents, completeOutboxEvent, readNotificationOrder } = await import("@/lib/notifications/store");
  const { channelSenders } = await import("@/lib/notifications/run");
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });
  const products: string[] = [];
  const attempts: string[] = [];

  afterAll(async () => {
    await service.from("orders").delete().in("idempotency_key", attempts);
    await service.from("products").delete().in("id", products);
  });

  const configured: NotificationConfig = {
    telegram: { ok: true, config: { token: "123:test-token", chatId: "-100123", apiBaseUrl: "http://telegram.test" } },
    email: { ok: true, config: { apiKey: "re_test", from: "Shop <orders@example.test>", replyTo: null, apiUrl: "http://resend.test" } },
  };

  /** A fake of both APIs that records what each order got; `telegramUp` false answers Telegram with a 502. */
  function fakeApis({ delayMs = 0 } = {}) {
    const telegram: number[] = [];
    const email: string[] = [];
    const state = { telegramUp: true };
    const fetchImpl: typeof fetch = async (input, init) => {
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const url = String(input);
      if (url.startsWith("http://telegram.test/")) {
        if (!state.telegramUp) return Response.json({ ok: false, description: "Bad Gateway" }, { status: 502 });
        const text = JSON.parse(String(init?.body)).text as string;
        telegram.push(Number(/№ (\d+)/.exec(text)?.[1]));
        return Response.json({ ok: true, result: { message_id: telegram.length } });
      }
      if (url === "http://resend.test/emails") {
        email.push(new Headers(init?.headers).get("Idempotency-Key") ?? "");
        return Response.json({ id: randomUUID() });
      }
      return new Response("unexpected", { status: 404 });
    };
    return { telegram, email, state, fetchImpl };
  }

  function processor(config: NotificationConfig, fetchImpl: typeof fetch) {
    return processOutbox({
      claim: (limit, lease) => claimOutboxEvents(service, limit, lease),
      loadOrder: (orderId) => readNotificationOrder(service, orderId),
      complete: (completion) => completeOutboxEvent(service, completion),
      send: channelSenders(config, fetchImpl),
    });
  }

  async function madeToOrderProduct(): Promise<string> {
    const { data: category, error } = await service.from("categories").select("id").eq("slug", "rings").single();
    if (error) throw error;
    const id = randomUUID();
    const inserted = await service.from("products").insert({ id, category_id: category.id, status: "published", fulfillment: "made_to_order", price_usd: 10 });
    if (inserted.error) throw inserted.error;
    products.push(id);
    return id;
  }

  async function placeOrder(productId: string): Promise<{ orderId: string; number: number }> {
    const attempt = randomUUID();
    attempts.push(attempt);
    const created = await createOrderRequest(
      service,
      {
        idempotency_key: attempt,
        user_id: null,
        locale: "de",
        first_name: "Outbox <Test>",
        last_name: null,
        phone: "+4915112345678",
        email: "outbox@example.test",
        comment: "Bitte & danke",
        country: "DE",
        delivery_carrier: "nova_post",
        delivery_method: "address",
        delivery_destination: { city: "Berlin", postCode: "10115", street: "Invalidenstr.", building: "1", flat: null },
        delivery_estimate_state: "tbd",
        delivery_estimate_source: "flat_rate",
        delivery_estimate_minor: null,
        delivery_estimate_currency: null,
        delivery_estimate_decimals: null,
        currency: "EUR",
        currency_decimals: 2,
        fx_rate: "0.86",
        fx_rate_date: "2026-10-15",
        markup_bps: 300,
        items_total_usd_minor: 1000,
        items_total_minor: 990,
      },
      [{ product_id: productId, variant_id: null, position: 0, title: "Outbox ring", title_locale: "de", quantity: 1, unit_price_usd_minor: 1000, unit_price_minor: 990 }],
    );
    if (!created.ok) throw new Error(`the test order was not stored: ${JSON.stringify(created)}`);
    return { orderId: created.orderId, number: created.number };
  }

  async function eventOf(orderId: string) {
    const { data, error } = await service.from("outbox_events").select("*").eq("order_id", orderId).single();
    if (error) throw error;
    return data;
  }

  // the retry is due now: as if its backoff had passed
  async function makeDue(orderId: string) {
    const { error } = await service.from("outbox_events").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("order_id", orderId);
    if (error) throw error;
  }

  it("a failing Telegram leaves the order intact; the event is retried later and finally processed", async () => {
    const productId = await madeToOrderProduct();
    const { orderId, number } = await placeOrder(productId);
    const apis = fakeApis();
    apis.state.telegramUp = false;

    await processor(configured, apis.fetchImpl);
    const failed = await eventOf(orderId);
    expect(failed).toMatchObject({ telegram_status: "pending", email_status: "sent", attempts: 1, processed_at: null, claim_token: null });
    expect(failed.last_error).toBe("telegram: telegram: HTTP 502: Bad Gateway");
    expect(new Date(failed.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 30_000);
    // the order is untouched: still stored, still new, with its line
    const { data: order } = await service.from("orders").select("status, order_items(id)").eq("id", orderId).single();
    expect(order).toMatchObject({ status: "new", order_items: [{ id: expect.any(String) }] });

    // not due yet: a run sends nothing for it
    await processor(configured, apis.fetchImpl);
    expect((await eventOf(orderId)).attempts).toBe(1);

    await makeDue(orderId);
    apis.state.telegramUp = true;
    await processor(configured, apis.fetchImpl);
    const processed = await eventOf(orderId);
    expect(processed).toMatchObject({ telegram_status: "sent", email_status: "sent", attempts: 2, last_error: null, claim_token: null });
    expect(processed.processed_at).not.toBeNull();
    expect(apis.telegram.filter((sent) => sent === number)).toHaveLength(1);
    expect(apis.email.filter((key) => key === `${processed.id}/email`)).toHaveLength(1);
  });

  it("two processors running at the same time never send a message twice", async () => {
    const productId = await madeToOrderProduct();
    const orders = await Promise.all(Array.from({ length: 14 }, () => placeOrder(productId)));
    const apis = fakeApis({ delayMs: 20 });

    await Promise.all([processor(configured, apis.fetchImpl), processor(configured, apis.fetchImpl)]);

    for (const { orderId, number } of orders) {
      const event = await eventOf(orderId);
      expect(event, String(number)).toMatchObject({ telegram_status: "sent", email_status: "sent", attempts: 1 });
      expect(apis.telegram.filter((sent) => sent === number), String(number)).toHaveLength(1);
      expect(apis.email.filter((key) => key === `${event.id}/email`), String(number)).toHaveLength(1);
    }
    // and nobody sent anything twice at all
    expect(new Set(apis.telegram).size).toBe(apis.telegram.length);
    expect(new Set(apis.email).size).toBe(apis.email.length);
  });

  it("without settings the events are skipped, not failed, and nothing is sent", async () => {
    const productId = await madeToOrderProduct();
    const { orderId } = await placeOrder(productId);
    const apis = fakeApis();
    const { notificationConfig } = await import("@/lib/notifications/config");

    // this run has NOTIFICATIONS_SEND unset, like every test and local run
    await processor(notificationConfig(), apis.fetchImpl);
    const event = await eventOf(orderId);
    expect(event).toMatchObject({ telegram_status: "skipped_unconfigured", email_status: "skipped_unconfigured", attempts: 1 });
    expect(event.processed_at).not.toBeNull();
    expect(event.last_error).toContain("NOTIFICATIONS_SEND");
    expect(apis.telegram).toHaveLength(0);
    expect(apis.email).toHaveLength(0);
  });
});

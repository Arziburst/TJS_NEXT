// create_order_request on the local stack under concurrency: two requests for the same one-of-a-kind piece
// race and exactly one gets it (D24); two submits of the same attempt store one order. Skipped without a stack.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("order requests on the local stack", async () => {
  if (!stack) return;
  const { createOrderRequest } = await import("@/lib/orders/store");
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });
  const products: string[] = [];
  const attempts: string[] = [];

  afterAll(async () => {
    await service.from("orders").delete().in("idempotency_key", attempts);
    await service.from("products").delete().in("id", products);
  });

  async function piece(fulfillment: "one_of_a_kind" | "made_to_order"): Promise<string> {
    const { data: category, error } = await service.from("categories").select("id").eq("slug", "rings").single();
    if (error) throw error;
    const id = randomUUID();
    const inserted = await service.from("products").insert({ id, category_id: category.id, status: "published", fulfillment, price_usd: 10 });
    if (inserted.error) throw inserted.error;
    products.push(id);
    return id;
  }

  function request(productId: string, attempt = randomUUID()) {
    attempts.push(attempt);
    return createOrderRequest(
      service,
      {
        idempotency_key: attempt,
        user_id: null,
        locale: "en",
        first_name: "Race",
        last_name: null,
        phone: "+380501234567",
        email: "race@example.test",
        comment: null,
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
      [
        {
          product_id: productId,
          variant_id: null,
          position: 0,
          title: "Race piece",
          title_locale: "en",
          quantity: 1,
          unit_price_usd_minor: 1000,
          unit_price_minor: 990,
        },
      ],
    );
  }

  async function ordersOf(productId: string): Promise<number> {
    const { count, error } = await service.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", productId);
    if (error) throw error;
    return count ?? 0;
  }

  it("lets exactly one of two concurrent requests have the same one-of-a-kind piece", async () => {
    const id = await piece("one_of_a_kind");
    const results = await Promise.all([request(id), request(id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "unavailable", productIds: [id] }]);
    expect(await ordersOf(id)).toBe(1);
    const { data } = await service.from("products").select("availability").eq("id", id).single();
    expect(data?.availability).toBe("reserved");
  });

  it("lets many concurrent requests race for one piece: still exactly one order", async () => {
    const id = await piece("one_of_a_kind");
    const results = await Promise.all(Array.from({ length: 8 }, () => request(id)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await ordersOf(id)).toBe(1);
  });

  it("stores one order for two concurrent submits of the same attempt", async () => {
    const id = await piece("made_to_order");
    const attempt = randomUUID();
    const [first, second] = await Promise.all([request(id, attempt), request(id, attempt)]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.number).toBe(first.number);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(await ordersOf(id)).toBe(1);
    const { count } = await service
      .from("outbox_events")
      .select("id", { count: "exact", head: true })
      .eq("order_id", first.orderId);
    expect(count).toBe(1);
  });

  it("orders made-to-order work concurrently without any reservation", async () => {
    const id = await piece("made_to_order");
    const results = await Promise.all([request(id), request(id), request(id)]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await ordersOf(id)).toBe(3);
  });
});

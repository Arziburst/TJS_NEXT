// The admin's status changes over the Data API of the local stack, through src/lib/admin/orders with an admin's
// own session (D17, D24): accepting sells the order's one-of-a-kind piece, canceling puts it back on sale, an
// illegal transition is refused and changes nothing, two tabs racing on one order change it once, and every
// change writes a history row and an 'order_status_changed' outbox event. Skipped without a stack.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

describe.skipIf(!stack)("admin order status changes on the local stack", async () => {
  // a skipped describe still runs its body to collect the tests: nothing below may touch the stack
  if (!stack) return;
  const { createOrderRequest } = await import("@/lib/orders/store");
  const { addOrderNote, setOrderStatus } = await import("@/lib/admin/orders");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, options);
  const userIds: string[] = [];
  const productIds: string[] = [];
  const attempts: string[] = [];
  let admin: { id: string; client: SupabaseClient<Database> };
  let customer: { id: string; client: SupabaseClient<Database> };

  async function signedIn(role: "customer" | "admin") {
    const email = `orders-${role}-${randomUUID()}@example.test`;
    const password = `pw-${randomUUID()}`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const id = created.data.user.id;
    userIds.push(id);
    if (role === "admin") {
      const promoted = await service.from("profiles").update({ role: "admin" }).eq("id", id);
      if (promoted.error) throw promoted.error;
    }
    const client = createClient<Database>(stack!.url, stack!.anonKey, options);
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    return { id, client };
  }

  beforeAll(async () => {
    admin = await signedIn("admin");
    customer = await signedIn("customer");
  });

  afterAll(async () => {
    if (attempts.length > 0) await service.from("orders").delete().in("idempotency_key", attempts);
    if (productIds.length > 0) await service.from("products").delete().in("id", productIds);
    for (const id of userIds) await service.auth.admin.deleteUser(id);
  });

  async function piece(): Promise<string> {
    const { data: category, error } = await service.from("categories").select("id").eq("slug", "rings").single();
    if (error) throw error;
    const id = randomUUID();
    const inserted = await service
      .from("products")
      .insert({ id, category_id: category.id, status: "published", fulfillment: "one_of_a_kind", price_usd: 10 });
    if (inserted.error) throw inserted.error;
    productIds.push(id);
    return id;
  }

  /** An order request for one piece, as the checkout stores it; its number. */
  async function order(productId: string): Promise<number> {
    const attempt = randomUUID();
    attempts.push(attempt);
    const result = await createOrderRequest(
      service,
      {
        idempotency_key: attempt,
        user_id: null,
        locale: "uk",
        first_name: "Olena",
        last_name: null,
        phone: "+380501234567",
        email: "olena@example.test",
        comment: null,
        country: "UA",
        delivery_carrier: "nova_poshta",
        delivery_method: "warehouse",
        delivery_destination: { city: { label: "Київ" }, warehouse: { name: "Відділення №1", number: 1, kind: "branch" } },
        delivery_estimate_state: "unavailable",
        delivery_estimate_source: null,
        delivery_estimate_minor: null,
        delivery_estimate_currency: null,
        delivery_estimate_decimals: null,
        currency: "UAH",
        currency_decimals: 0,
        fx_rate: "41.5",
        fx_rate_date: "2026-10-16",
        markup_bps: 300,
        items_total_usd_minor: 1000,
        items_total_minor: 430,
      },
      [
        {
          product_id: productId,
          variant_id: null,
          variant_label: null,
          variant_label_locale: null,
          position: 0,
          title: "Piece",
          title_locale: "uk",
          quantity: 1,
          unit_price_usd_minor: 1000,
          unit_price_minor: 430,
        },
      ],
    );
    if (!result.ok) throw new Error(`order not placed: ${result.reason}`);
    return result.number;
  }

  async function availability(productId: string) {
    const { data, error } = await service.from("products").select("availability").eq("id", productId).single();
    if (error) throw error;
    return data.availability;
  }

  async function stored(number: number) {
    const { data, error } = await service
      .from("orders")
      .select("status, order_status_history(from_status, to_status, changed_by), outbox_events(event, payload)")
      .eq("number", number)
      .single();
    if (error) throw error;
    return data;
  }

  it("accepting sells the one-of-a-kind piece and canceling puts it back on sale (D24)", async () => {
    const id = await piece();
    const number = await order(id);
    expect(await availability(id)).toBe("reserved");

    expect(await setOrderStatus(admin.client, number, "new", "in_processing")).toEqual({ ok: true, status: "in_processing", productIds: [] });
    expect(await setOrderStatus(admin.client, number, "in_processing", "accepted")).toEqual({
      ok: true,
      status: "accepted",
      productIds: [id],
    });
    expect(await availability(id)).toBe("sold");

    expect(await setOrderStatus(admin.client, number, "accepted", "canceled")).toEqual({ ok: true, status: "canceled", productIds: [id] });
    expect(await availability(id)).toBe("available");

    const row = await stored(number);
    expect(row.status).toBe("canceled");
    expect(row.order_status_history.map((h) => [h.from_status, h.to_status, h.changed_by])).toEqual(
      expect.arrayContaining([
        ["new", "in_processing", admin.id],
        ["in_processing", "accepted", admin.id],
        ["accepted", "canceled", admin.id],
      ]),
    );
    const changes = row.outbox_events.filter((e) => e.event === "order_status_changed").map((e) => e.payload);
    expect(changes).toHaveLength(3);
    expect(changes).toContainEqual({ number, from: "accepted", to: "canceled" });
  });

  it("canceling a new request releases its reserved piece", async () => {
    const id = await piece();
    const number = await order(id);
    expect(await setOrderStatus(admin.client, number, "new", "canceled")).toEqual({ ok: true, status: "canceled", productIds: [id] });
    expect(await availability(id)).toBe("available");
  });

  it("refuses an illegal transition and changes nothing", async () => {
    const id = await piece();
    const number = await order(id);
    expect(await setOrderStatus(admin.client, number, "new", "accepted")).toEqual({ ok: false, reason: "illegal" });
    expect(await setOrderStatus(admin.client, number, "new", "closed")).toEqual({ ok: false, reason: "illegal" });
    expect(await setOrderStatus(admin.client, number, "in_processing", "accepted")).toEqual({ ok: false, reason: "stale" });
    expect(await availability(id)).toBe("reserved");
    const row = await stored(number);
    expect(row.status).toBe("new");
    expect(row.order_status_history).toEqual([]);
    expect(row.outbox_events.map((e) => e.event)).toEqual(["order_created"]);
  });

  it("changes an order once when two tabs tap the same step together", async () => {
    const id = await piece();
    const number = await order(id);
    await setOrderStatus(admin.client, number, "new", "in_processing");
    const results = await Promise.all([
      setOrderStatus(admin.client, number, "in_processing", "accepted"),
      setOrderStatus(admin.client, number, "in_processing", "accepted"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "stale" }]);
    const row = await stored(number);
    expect(row.order_status_history.filter((h) => h.to_status === "accepted")).toHaveLength(1);
    expect(row.outbox_events.filter((e) => e.event === "order_status_changed")).toHaveLength(2);
  });

  it("refuses a customer: no status change, no note", async () => {
    const id = await piece();
    const number = await order(id);
    expect(await setOrderStatus(customer.client, number, "new", "canceled")).toEqual({ ok: false, reason: "notAuthorized" });
    // the customer cannot even see the order to attach a note
    expect(await addOrderNote(customer.client, number, customer.id, "mine")).toEqual({ ok: false, reason: "notFound" });
    expect(await availability(id)).toBe("reserved");
    expect((await stored(number)).status).toBe("new");
  });

  it("stores an admin's note in their name", async () => {
    const id = await piece();
    const number = await order(id);
    expect(await addOrderNote(admin.client, number, admin.id, "Paid by card transfer")).toEqual({ ok: true });
    // another admin's name is refused by RLS
    expect(await addOrderNote(admin.client, number, customer.id, "Forged")).toEqual({ ok: false, reason: "notAuthorized" });
    const { data, error } = await service.from("order_notes").select("body, author_id, orders!inner(number)").eq("orders.number", number);
    if (error) throw error;
    expect(data.map((n) => [n.body, n.author_id])).toEqual([["Paid by card transfer", admin.id]]);
  });
});

import "server-only";

import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import type { ProductFulfillment } from "@/lib/catalog/types";
import { isCurrency, type Currency } from "@/lib/money/currencies";
import type { Json } from "@/lib/supabase/database.types";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

// The orders tables (supabase/migrations/20261016007200_orders.sql): the one write path, the server's
// create_order_request, and the read of one order for its confirmation page.

/** orders columns the server writes for a new request (create_order_request's p_order). */
export type NewOrder = {
  idempotency_key: string;
  user_id: string | null;
  locale: Locale;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string;
  comment: string | null;
  country: string;
  delivery_carrier: "nova_poshta" | "nova_post";
  delivery_method: "warehouse" | "postomat" | "doors" | "division" | "address";
  delivery_destination: Record<string, unknown>;
  delivery_estimate_state: "amount" | "tbd" | "unavailable";
  delivery_estimate_source: "carrier" | "flat_rate" | null;
  delivery_estimate_minor: number | null;
  delivery_estimate_currency: Currency | null;
  delivery_estimate_decimals: number | null;
  currency: Currency;
  currency_decimals: number;
  fx_rate: string;
  fx_rate_date: string | null;
  markup_bps: number;
  items_total_usd_minor: number;
  items_total_minor: number;
};

/** order_items columns of one line (create_order_request's p_items); fulfillment and SKU come from the product. */
export type NewOrderItem = {
  product_id: string;
  variant_id: string | null;
  position: number;
  title: string;
  title_locale: Locale;
  // the size as the customer saw it (#66), only with a variant
  variant_label: string | null;
  variant_label_locale: Locale | null;
  quantity: number;
  unit_price_usd_minor: number;
  unit_price_minor: number;
};

export type CreateOrderResult =
  | { ok: true; replayed: boolean; orderId: string; number: number; userId: string | null }
  | { ok: false; reason: "unavailable"; productIds: string[] }
  | { ok: false; reason: "error" };

const rpcAnswer = z.union([
  z.object({
    ok: z.literal(true),
    replayed: z.boolean(),
    order_id: z.uuid(),
    number: z.number().int().positive(),
    user_id: z.uuid().nullable(),
  }),
  z.object({ ok: z.literal(false), reason: z.literal("unavailable"), product_ids: z.array(z.uuid()) }),
]);

/**
 * Stores an order request in one transaction (reservations of one-of-a-kind pieces and the outbox row
 * included), or returns the order this attempt already created. `service` is the service-role client: only
 * the server writes orders, after it has checked the caller and built every number itself.
 */
export async function createOrderRequest(
  service: ServerSupabaseClient,
  order: NewOrder,
  items: readonly NewOrderItem[],
): Promise<CreateOrderResult> {
  const { data, error } = await service.rpc("create_order_request", {
    p_order: order as unknown as Json,
    p_items: items as unknown as Json,
  });
  if (error) {
    console.error("orders: create_order_request failed", error);
    return { ok: false, reason: "error" };
  }
  const parsed = rpcAnswer.safeParse(data);
  if (!parsed.success) {
    console.error("orders: unexpected create_order_request answer", data);
    return { ok: false, reason: "error" };
  }
  const answer = parsed.data;
  if (!answer.ok) return { ok: false, reason: "unavailable", productIds: answer.product_ids };
  return { ok: true, replayed: answer.replayed, orderId: answer.order_id, number: answer.number, userId: answer.user_id };
}

/** The order a checkout attempt already created (service-role client), or null; throws when the read fails. */
export async function findOrderByAttempt(
  service: ServerSupabaseClient,
  attempt: string,
): Promise<{ number: number; userId: string | null } | null> {
  const { data, error } = await service.from("orders").select("number, user_id").eq("idempotency_key", attempt).maybeSingle();
  if (error) throw new Error(`orders: ${error.message}`);
  return data && { number: data.number, userId: data.user_id };
}

export type OrderLineView = {
  position: number;
  productId: string | null;
  title: string;
  titleLocale: string;
  /** The ordered size and the locale of its label (#66); null without a variant. */
  variantLabel: { text: string; locale: string } | null;
  fulfillment: ProductFulfillment;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
};

export type DeliveryEstimateView =
  | { state: "amount"; source: "carrier" | "flat_rate"; currency: Currency; amountMinor: number; decimals: number }
  | { state: "tbd" }
  | { state: "unavailable" };

export type OrderView = {
  number: number;
  status: string;
  createdAt: string;
  firstName: string;
  email: string;
  phone: string;
  country: string;
  carrier: "nova_poshta" | "nova_post";
  currency: Currency;
  decimals: number;
  totalMinor: number;
  lines: OrderLineView[];
  delivery: DeliveryEstimateView;
};

const ORDER_COLUMNS = `number, status, created_at, first_name, email, phone, country, delivery_carrier,
  delivery_estimate_state, delivery_estimate_source, delivery_estimate_minor, delivery_estimate_currency,
  delivery_estimate_decimals, currency, currency_decimals, items_total_minor,
  order_items(position, product_id, title, title_locale, variant_label, variant_label_locale, fulfillment, quantity,
    unit_price_minor, line_total_minor)`;

type OrderRow = {
  number: number;
  status: string;
  created_at: string;
  first_name: string;
  email: string;
  phone: string;
  country: string;
  delivery_carrier: string;
  delivery_estimate_state: string;
  delivery_estimate_source: string | null;
  delivery_estimate_minor: number | null;
  delivery_estimate_currency: string | null;
  delivery_estimate_decimals: number | null;
  currency: string;
  currency_decimals: number;
  items_total_minor: number;
  order_items: {
    position: number;
    product_id: string | null;
    title: string;
    title_locale: string;
    variant_label: string | null;
    variant_label_locale: string | null;
    fulfillment: ProductFulfillment;
    quantity: number;
    unit_price_minor: number;
    line_total_minor: number;
  }[];
};

function deliveryView(row: OrderRow): DeliveryEstimateView {
  const { delivery_estimate_state: state, delivery_estimate_minor: amount, delivery_estimate_currency: currency } = row;
  if (state === "amount" && amount !== null && isCurrency(currency) && row.delivery_estimate_decimals !== null) {
    return {
      state: "amount",
      source: row.delivery_estimate_source === "flat_rate" ? "flat_rate" : "carrier",
      currency,
      amountMinor: amount,
      decimals: row.delivery_estimate_decimals,
    };
  }
  return state === "tbd" ? { state: "tbd" } : { state: "unavailable" };
}

function toView(row: OrderRow): OrderView | null {
  if (!isCurrency(row.currency)) return null;
  return {
    number: row.number,
    status: row.status,
    createdAt: row.created_at,
    firstName: row.first_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    carrier: row.delivery_carrier === "nova_poshta" ? "nova_poshta" : "nova_post",
    currency: row.currency,
    decimals: row.currency_decimals,
    totalMinor: row.items_total_minor,
    lines: [...row.order_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        position: item.position,
        productId: item.product_id,
        title: item.title,
        titleLocale: item.title_locale,
        variantLabel:
          item.variant_label !== null && item.variant_label_locale !== null
            ? { text: item.variant_label, locale: item.variant_label_locale }
            : null,
        fulfillment: item.fulfillment,
        quantity: item.quantity,
        unitMinor: item.unit_price_minor,
        lineMinor: item.line_total_minor,
      })),
    delivery: deliveryView(row),
  };
}

export type ReadOrderResult = { ok: true; order: OrderView | null } | { ok: false };

/** Order `number` through the customer's session client: RLS returns it only to the customer who placed it. */
export async function readOwnOrder(session: ServerSupabaseClient, number: number): Promise<ReadOrderResult> {
  return selectOrder(session.from("orders").select(ORDER_COLUMNS).eq("number", number));
}

/**
 * Order `number` through the service-role client, only together with the attempt token the placing browser
 * keeps in its httpOnly cookie (src/lib/checkout/access.ts): a guest's way to their confirmation.
 */
export async function readOrderWithToken(service: ServerSupabaseClient, number: number, token: string): Promise<ReadOrderResult> {
  return selectOrder(service.from("orders").select(ORDER_COLUMNS).eq("number", number).eq("idempotency_key", token));
}

async function selectOrder(query: {
  maybeSingle: <R>() => PromiseLike<{ data: R | null; error: unknown }>;
}): Promise<ReadOrderResult> {
  const { data, error } = await query.maybeSingle<OrderRow>();
  if (error) {
    console.error("orders: read failed", error);
    return { ok: false };
  }
  return { ok: true, order: data ? toView(data) : null };
}

import "server-only";

import type { DeliveryChoice } from "@/lib/checkout/schema";
import { isCurrency, type Currency } from "@/lib/money/currencies";
import type { Database } from "@/lib/supabase/database.types";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { choiceFromOrder } from "./order-delivery";
import { ORDERS_PAGE_SIZE } from "./schemas";

// The customer's order history. Reads go through the customer's session client: the orders RLS policy
// returns only the customer's own orders, so another customer's number reads as no order.

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export type OrderSummary = {
  number: number;
  createdAt: string;
  status: OrderStatus;
  currency: Currency;
  decimals: number;
  totalMinor: number;
  // pieces in the order (the lines' quantities)
  itemCount: number;
};

export type OrderListResult = { ok: true; orders: OrderSummary[]; total: number } | { ok: false };

/** Page `page` (from 1) of the user's own orders, newest first, with the number of all of them. */
export async function listOwnOrders(client: ServerSupabaseClient, userId: string, page: number): Promise<OrderListResult> {
  const from = (page - 1) * ORDERS_PAGE_SIZE;
  const { data, error, count } = await client
    .from("orders")
    .select("number, created_at, status, currency, currency_decimals, items_total_minor, order_items(quantity)", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("number", { ascending: false })
    .range(from, from + ORDERS_PAGE_SIZE - 1);
  if (error) {
    // a page past the end is no error: it is empty
    if (error.code === "PGRST103") return { ok: true, orders: [], total: count ?? 0 };
    console.error("account: orders read failed", error);
    return { ok: false };
  }
  const orders: OrderSummary[] = [];
  for (const row of data) {
    if (!isCurrency(row.currency)) continue;
    orders.push({
      number: row.number,
      createdAt: row.created_at,
      status: row.status,
      currency: row.currency,
      decimals: row.currency_decimals,
      totalMinor: row.items_total_minor,
      itemCount: row.order_items.reduce((sum, item) => sum + item.quantity, 0),
    });
  }
  return { ok: true, orders, total: count ?? orders.length };
}

export type OrderDetailLine = {
  position: number;
  title: string;
  titleLocale: string;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
};

export type OrderDetailEstimate =
  | { state: "amount"; currency: Currency; amountMinor: number; decimals: number }
  | { state: "tbd" }
  | { state: "unavailable" };

export type OrderDetail = {
  number: number;
  createdAt: string;
  status: OrderStatus;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string;
  comment: string | null;
  country: string;
  carrier: "nova_poshta" | "nova_post";
  // null when the stored destination no longer reads as a delivery choice
  delivery: DeliveryChoice | null;
  estimate: OrderDetailEstimate;
  currency: Currency;
  decimals: number;
  totalMinor: number;
  itemCount: number;
  lines: OrderDetailLine[];
};

export type OrderDetailResult = { ok: true; order: OrderDetail | null } | { ok: false };

/** The user's own order `number` with its lines (the snapshot taken when it was placed), or null. */
export async function readOwnOrderDetail(client: ServerSupabaseClient, userId: string, number: number): Promise<OrderDetailResult> {
  const { data: row, error } = await client
    .from("orders")
    .select(
      `number, created_at, status, first_name, last_name, phone, email, comment, country, delivery_carrier, delivery_method,
       delivery_destination, delivery_estimate_state, delivery_estimate_minor, delivery_estimate_currency,
       delivery_estimate_decimals, currency, currency_decimals, items_total_minor,
       order_items(position, title, title_locale, quantity, unit_price_minor, line_total_minor)`,
    )
    .eq("user_id", userId)
    .eq("number", number)
    .maybeSingle();
  if (error) {
    console.error("account: order read failed", error);
    return { ok: false };
  }
  if (!row || !isCurrency(row.currency)) return { ok: true, order: null };

  const estimateCurrency = row.delivery_estimate_currency;
  const estimate: OrderDetailEstimate =
    row.delivery_estimate_state === "amount" &&
    row.delivery_estimate_minor !== null &&
    row.delivery_estimate_decimals !== null &&
    isCurrency(estimateCurrency)
      ? {
          state: "amount",
          currency: estimateCurrency,
          amountMinor: row.delivery_estimate_minor,
          decimals: row.delivery_estimate_decimals,
        }
      : row.delivery_estimate_state === "tbd"
        ? { state: "tbd" }
        : { state: "unavailable" };
  const lines = [...row.order_items]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      position: item.position,
      title: item.title,
      titleLocale: item.title_locale,
      quantity: item.quantity,
      unitMinor: item.unit_price_minor,
      lineMinor: item.line_total_minor,
    }));

  return {
    ok: true,
    order: {
      number: row.number,
      createdAt: row.created_at,
      status: row.status,
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      email: row.email,
      comment: row.comment,
      country: row.country,
      carrier: row.delivery_carrier === "nova_poshta" ? "nova_poshta" : "nova_post",
      delivery: choiceFromOrder({
        carrier: row.delivery_carrier,
        method: row.delivery_method,
        country: row.country,
        destination: row.delivery_destination,
      }),
      estimate,
      currency: row.currency,
      decimals: row.currency_decimals,
      totalMinor: row.items_total_minor,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      lines,
    },
  };
}

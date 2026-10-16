import "server-only";

import { z } from "zod";
import { locales } from "@/i18n/routing";
import { currencies } from "@/lib/money/currencies";
import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { parseDestination, type DeliveryEstimate, type NotificationOrder } from "./order";
import type { ClaimedEvent, Completion } from "./processor";

// The outbox and the orders as the processor sees them (supabase/migrations/…_notification_outbox.sql), through
// the service-role client: nobody else reaches the outbox.

const delivery = z.enum(["pending", "sent", "skipped_unconfigured", "skipped_expired", "failed"]);

const claimedRow = z.object({
  id: z.uuid(),
  claim_token: z.uuid(),
  event: z.string(),
  order_id: z.uuid(),
  created_at: z.string(),
  attempts: z.number().int().positive(),
  telegram_status: delivery,
  email_status: delivery,
});

export async function claimOutboxEvents(service: ServerSupabaseClient, limit: number, leaseSeconds: number): Promise<ClaimedEvent[]> {
  const { data, error } = await service.rpc("claim_outbox_events", { p_limit: limit, p_lease_seconds: leaseSeconds });
  if (error) throw new Error(`notifications: claim failed: ${error.message}`);
  return z
    .array(claimedRow)
    .parse(data)
    .map((row) => ({
      id: row.id,
      claimToken: row.claim_token,
      event: row.event,
      orderId: row.order_id,
      createdAt: row.created_at,
      attempts: row.attempts,
      telegram: row.telegram_status,
      email: row.email_status,
    }));
}

export async function completeOutboxEvent(service: ServerSupabaseClient, completion: Completion): Promise<boolean> {
  const { data, error } = await service.rpc("complete_outbox_event", {
    p_id: completion.id,
    p_claim_token: completion.claimToken,
    p_telegram_status: completion.telegram,
    p_email_status: completion.email,
    ...(completion.lastError === null ? {} : { p_last_error: completion.lastError }),
    ...(completion.retryInSeconds === null ? {} : { p_retry_in_seconds: completion.retryInSeconds }),
    ...(completion.refundAttempt ? { p_refund_attempt: true } : {}),
  });
  if (error) throw new Error(`notifications: completing event ${completion.id} failed: ${error.message}`);
  return data === true;
}

const ORDER_COLUMNS = `id, number, status, created_at, locale, first_name, last_name, phone, email, comment, country,
  delivery_carrier, delivery_method, delivery_destination, delivery_estimate_state, delivery_estimate_minor,
  delivery_estimate_currency, delivery_estimate_decimals, currency, currency_decimals, items_total_minor,
  items_total_usd_minor, order_items(position, title, title_locale, quantity, line_total_minor)`;

const orderRow = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  status: z.enum(["new", "pending_payment", "paid", "in_processing", "accepted", "closed", "canceled", "refunded"]),
  created_at: z.string(),
  locale: z.enum(locales),
  first_name: z.string(),
  last_name: z.string().nullable(),
  phone: z.string(),
  email: z.string(),
  comment: z.string().nullable(),
  country: z.string(),
  delivery_carrier: z.enum(["nova_poshta", "nova_post"]),
  delivery_method: z.enum(["warehouse", "postomat", "doors", "division", "address"]),
  delivery_destination: z.unknown(),
  delivery_estimate_state: z.enum(["amount", "tbd", "unavailable"]),
  delivery_estimate_minor: z.number().int().nullable(),
  delivery_estimate_currency: z.enum(currencies).nullable(),
  delivery_estimate_decimals: z.number().int().nullable(),
  currency: z.enum(currencies),
  currency_decimals: z.number().int(),
  items_total_minor: z.number().int(),
  items_total_usd_minor: z.number().int(),
  order_items: z.array(
    z.object({
      position: z.number().int(),
      title: z.string(),
      title_locale: z.string(),
      quantity: z.number().int(),
      line_total_minor: z.number().int(),
    }),
  ),
});

type OrderRow = z.infer<typeof orderRow>;

function estimateOf(row: OrderRow): DeliveryEstimate {
  const { delivery_estimate_state: state, delivery_estimate_minor: amount, delivery_estimate_currency: currency } = row;
  if (state === "amount" && amount !== null && currency !== null && row.delivery_estimate_decimals !== null) {
    return { state: "amount", currency, amountMinor: amount, decimals: row.delivery_estimate_decimals };
  }
  return state === "tbd" ? { state: "tbd" } : { state: "unavailable" };
}

/** Order `orderId` with its lines for a notification, or null when it is gone; throws when the read fails. */
export async function readNotificationOrder(service: ServerSupabaseClient, orderId: string): Promise<NotificationOrder | null> {
  const { data, error } = await service.from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) throw new Error(`orders: ${error.message}`);
  if (!data) return null;
  const row = orderRow.parse(data);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    createdAt: row.created_at,
    locale: row.locale,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    comment: row.comment,
    country: row.country,
    carrier: row.delivery_carrier,
    method: row.delivery_method,
    destination: parseDestination(row.delivery_carrier, row.delivery_method, row.delivery_destination),
    estimate: estimateOf(row),
    currency: row.currency,
    decimals: row.currency_decimals,
    totalMinor: row.items_total_minor,
    totalUsdMinor: row.items_total_usd_minor,
    lines: [...row.order_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ title: item.title, titleLocale: item.title_locale, quantity: item.quantity, lineMinor: item.line_total_minor })),
  };
}

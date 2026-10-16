import { z } from "zod";
import type { OrderStatus } from "./order";

// The outbox events the notifications send (outbox_events.event): a new order request (#24) and the admin's
// status change of an order (#27), whose payload names both statuses. Pure; shared by the processor and senders.

export const ORDER_EVENTS = ["order_created", "order_status_changed"] as const;

export type OrderEvent = (typeof ORDER_EVENTS)[number];

export function isOrderEvent(value: string): value is OrderEvent {
  return (ORDER_EVENTS as readonly string[]).includes(value);
}

const status = z.enum(["new", "pending_payment", "paid", "in_processing", "accepted", "closed", "canceled", "refunded"]);
const statusChange = z.object({ from: status, to: status });

export type StatusChange = { from: OrderStatus; to: OrderStatus };

/**
 * The statuses of an 'order_status_changed' event as written with it (admin_set_order_status): the status the
 * customer is told of is the one of the change, not the order's status at sending time (it may have moved on).
 */
export function statusChangeOf(payload: unknown): StatusChange | null {
  const parsed = statusChange.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

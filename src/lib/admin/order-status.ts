import type { Database } from "@/lib/supabase/database.types";

// The order statuses the admin works with (D17) and their transitions, shared by the pages, the buttons and the
// action. The database (public.admin_set_order_status) enforces the same table; this copy only decides which
// buttons to show. The payment states (pending payment, paid, refunded) stay hidden while payments are off.

export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** An internal note's length (the database checks the same bound, order_notes.body). */
export const ORDER_NOTE_MAX_LENGTH = 2000;

/** The statuses of an order request while payments are off, in their order (D17). */
export const ADMIN_ORDER_STATUSES = ["new", "in_processing", "accepted", "closed", "canceled"] as const satisfies readonly OrderStatus[];

export type AdminOrderStatus = (typeof ADMIN_ORDER_STATUSES)[number];

/** Every status the database knows, for reading an order back (a payment state once payments are live). */
export const ORDER_STATUSES = [
  "new",
  "pending_payment",
  "paid",
  "in_processing",
  "accepted",
  "closed",
  "canceled",
  "refunded",
] as const satisfies readonly OrderStatus[];

const FORWARD: Partial<Record<OrderStatus, OrderStatus>> = {
  new: "in_processing",
  in_processing: "accepted",
  accepted: "closed",
};

const CANCELABLE: readonly OrderStatus[] = ["new", "in_processing", "accepted"];

/** The next step of an order (one tap), or null when it has none. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  return FORWARD[status] ?? null;
}

/** Whether an order in `status` is still open and can be canceled. */
export function canCancel(status: OrderStatus): boolean {
  return CANCELABLE.includes(status);
}

export function isTransition(from: OrderStatus, to: OrderStatus): boolean {
  return nextStatus(from) === to || (to === "canceled" && canCancel(from));
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

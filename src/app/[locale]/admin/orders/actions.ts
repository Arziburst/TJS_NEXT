"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { allowAdminAction } from "@/lib/admin/rate-limit";
import { ADMIN_ORDER_STATUSES, ORDER_NOTE_MAX_LENGTH, ORDER_STATUSES } from "@/lib/admin/order-status";
import { addOrderNote as insertOrderNote, setOrderStatus } from "@/lib/admin/orders";
import { revalidatePieces } from "@/lib/admin/revalidate";
import { getAdmin } from "@/lib/auth/session";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's order writes. Each action is a public entry point: it checks the admin itself, validates its input
 * with zod, counts against the admin's rate limit and writes through the admin's session (the database checks
 * the role again and attributes the change to the admin).
 */

const orderNumber = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const statusInput = z.object({
  number: orderNumber,
  from: z.enum(ORDER_STATUSES),
  // the database refuses a transition it does not allow; payment states are not offered while payments are off
  to: z.enum(ADMIN_ORDER_STATUSES),
});

export type OrderStatusActionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "notAuthorized" | "invalid" | "tooManyRequests" | "notFound" | "stale" | "illegal" | "conflict" | "unexpectedError";
    };

/** One tap on the order page: the next status, or canceled (D17). */
export async function changeOrderStatus(input: unknown): Promise<OrderStatusActionResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, reason: "notAuthorized" };
  const parsed = statusInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await allowAdminAction("orderStatus", admin.id))) return { ok: false, reason: "tooManyRequests" };

  const { number, from, to } = parsed.data;
  let result: Awaited<ReturnType<typeof setOrderStatus>>;
  try {
    result = await setOrderStatus(await createSessionClient(), number, from, to);
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
  if (!result.ok) {
    // another tab or a double tap changed it first: show what it is now
    if (result.reason === "stale") refresh();
    return { ok: false, reason: result.reason };
  }
  // a one-of-a-kind piece sold or back on sale changes the shop's listings and its page (D24)
  revalidatePieces(result.productIds);
  refresh();
  return { ok: true };
}

const noteInput = z.object({
  number: orderNumber,
  body: z.string().trim().min(1).max(ORDER_NOTE_MAX_LENGTH),
});

export type OrderNoteActionResult =
  | { ok: true }
  | { ok: false; reason: "notAuthorized" | "invalid" | "tooManyRequests" | "notFound" | "unexpectedError" };

/** Adds an internal note (never shown to the customer) in the admin's name. */
export async function addOrderNote(input: unknown): Promise<OrderNoteActionResult> {
  const admin = await getAdmin();
  if (!admin) return { ok: false, reason: "notAuthorized" };
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  if (!(await allowAdminAction("orderNote", admin.id))) return { ok: false, reason: "tooManyRequests" };

  let result: Awaited<ReturnType<typeof insertOrderNote>>;
  try {
    result = await insertOrderNote(await createSessionClient(), parsed.data.number, admin.id, parsed.data.body);
  } catch {
    return { ok: false, reason: "unexpectedError" };
  }
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}

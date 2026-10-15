import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { readOrderWithToken, readOwnOrder, type ReadOrderResult } from "@/lib/orders/store";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { orderAccessToken } from "./access";

// Order numbers are positive integers from the orders identity; anything else is no order
const ORDER_NUMBER = /^[1-9][0-9]{0,14}$/;

export function parseOrderNumber(value: string | string[] | undefined): number | null {
  return typeof value === "string" && ORDER_NUMBER.test(value) ? Number(value) : null;
}

/**
 * Order `number` for its confirmation page, only for the visitor who placed it: a signed-in customer's own
 * order (RLS), or the order whose attempt token this browser keeps in its httpOnly cookie. Anyone else, with
 * the same URL, reads nothing.
 */
export async function readOrderForVisitor(number: number): Promise<ReadOrderResult> {
  const user = await getCurrentUser();
  if (user) {
    const own = await readOwnOrder(await createSessionClient(), number);
    if (!own.ok || own.order) return own;
  }
  const token = await orderAccessToken(number);
  if (!token) return { ok: true, order: null };
  return readOrderWithToken(createServiceClient(), number, token);
}

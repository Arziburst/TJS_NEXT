import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";

// The browser that placed an order request may open its confirmation page: a first-party, httpOnly cookie keeps
// the attempt token (orders.idempotency_key) of its latest requests, which only the server reads and compares.
// A signed-in customer also reads their orders through RLS; for a guest this cookie is the only way in.
export const ORDER_ACCESS_COOKIE = "TJS_ORDERS";
// technical: the latest requests of this browser, and how long their confirmation stays reachable
export const ORDER_ACCESS_MAX_ENTRIES = 10;
const ORDER_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

const entry = z.object({ n: z.number().int().positive(), k: z.uuid() });

export type OrderAccess = { number: number; token: string };

export function parseOrderAccess(value: string | undefined): OrderAccess[] {
  if (!value) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, ORDER_ACCESS_MAX_ENTRIES).flatMap((item) => {
    const parsed = entry.safeParse(item);
    return parsed.success ? [{ number: parsed.data.n, token: parsed.data.k }] : [];
  });
}

/** The newest first, one entry per order, at most ORDER_ACCESS_MAX_ENTRIES. */
export function withOrderAccess(entries: readonly OrderAccess[], added: OrderAccess): OrderAccess[] {
  return [added, ...entries.filter((e) => e.number !== added.number)].slice(0, ORDER_ACCESS_MAX_ENTRIES);
}

/** Server Actions only (a Server Component cannot write cookies). */
export async function rememberOrderAccess(added: OrderAccess): Promise<void> {
  const store = await cookies();
  const next = withOrderAccess(parseOrderAccess(store.get(ORDER_ACCESS_COOKIE)?.value), added);
  store.set(ORDER_ACCESS_COOKIE, JSON.stringify(next.map((e) => ({ n: e.number, k: e.token }))), {
    path: "/",
    maxAge: ORDER_ACCESS_MAX_AGE_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/** The token this browser holds for order `number`, or null. */
export async function orderAccessToken(number: number): Promise<string | null> {
  const entries = parseOrderAccess((await cookies()).get(ORDER_ACCESS_COOKIE)?.value);
  return entries.find((e) => e.number === number)?.token ?? null;
}

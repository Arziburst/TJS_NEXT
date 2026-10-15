import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { clientIp } from "@/lib/auth/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

// Technical limits of the public delivery actions per client IP (coordinator, #22): searching the dictionaries
// and asking for a price call Nova Poshta and write the cache, so one client must not hammer them.
export const DELIVERY_RATE_LIMITS = {
  search: { max: 60, windowSeconds: 60 },
  quote: { max: 20, windowSeconds: 60 },
} as const;

export type DeliveryRateLimited = keyof typeof DELIVERY_RATE_LIMITS;

/** The counter key of one call, keyed like the auth actions: hashed, so no raw IP is stored. */
export function deliveryRateLimitKey(action: DeliveryRateLimited, ip: string): string {
  return `delivery-${action}:ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

/**
 * Counts one call of the requesting client (public.consume_rate_limit, service role) and answers whether it may
 * go ahead. Fails closed like the auth limiter: an unreachable counter refuses the call.
 */
export async function allowDeliveryCall(action: DeliveryRateLimited): Promise<boolean> {
  try {
    const ip = clientIp(await headers());
    const { max, windowSeconds } = DELIVERY_RATE_LIMITS[action];
    const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
      p_key: deliveryRateLimitKey(action, ip),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

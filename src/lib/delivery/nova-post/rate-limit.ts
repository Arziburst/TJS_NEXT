import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

/*
 * The delivery step's Server Actions are public and each call costs a Nova Post API request, so every client
 * gets a budget per minute (coordinator, #23): searches (towns and points) and quotes are counted apart.
 */
export const DELIVERY_RATE_LIMITS = {
  search: { max: 60, windowSeconds: 60 },
  quote: { max: 20, windowSeconds: 60 },
} as const;

export type DeliveryRequest = keyof typeof DELIVERY_RATE_LIMITS;

/** The counter key of one request: hashed, so no raw IP is stored. */
export function deliveryRateLimitKey(request: DeliveryRequest, ip: string): string {
  return `nova-post-${request}:ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
}

/**
 * Counts one request in public.consume_rate_limit (service role) and answers whether it may go ahead. Fails
 * closed like the auth limit: a counter that cannot be reached refuses the request.
 */
export async function allowDeliveryRequest(request: DeliveryRequest, ip: string): Promise<boolean> {
  const { max, windowSeconds } = DELIVERY_RATE_LIMITS[request];
  try {
    const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
      p_key: deliveryRateLimitKey(request, ip),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

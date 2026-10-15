import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { AUTH_RATE_LIMIT, rateLimitKeys, type RateLimitedAction } from "./rate-limit-keys";

export { AUTH_RATE_LIMIT, rateLimitKeys, type RateLimitedAction };

/**
 * The client's IP: Vercel sets x-real-ip and x-forwarded-for itself (a client cannot spoof them there);
 * locally they are whatever the request says, which is fine for development and tests.
 */
export function clientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/**
 * Counts one attempt and answers whether it may go ahead. Fails closed: when the counter cannot be reached
 * the attempt is refused (Supabase Auth would be unreachable as well).
 */
export async function allowAttempt(action: RateLimitedAction, ip: string, email?: string): Promise<boolean> {
  try {
    const service = createServiceClient();
    const results = await Promise.all(
      rateLimitKeys(action, ip, email).map((key) =>
        service.rpc("consume_rate_limit", {
          p_key: key,
          p_max: AUTH_RATE_LIMIT.max,
          p_window_seconds: AUTH_RATE_LIMIT.windowSeconds,
        }),
      ),
    );
    return results.every(({ data, error }) => !error && data === true);
  } catch {
    return false;
  }
}

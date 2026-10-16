import "server-only";

import { createHash } from "node:crypto";
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

/**
 * Records the id of a signed webhook (private.webhook_receipts): true the first time, false when it was accepted
 * before (a replay). Hashed, like the counter keys. Throws when the store cannot be reached (the caller refuses).
 */
export async function claimWebhookReceipt(scope: string, id: string): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("claim_webhook_receipt", {
    p_id: `${scope}:${createHash("sha256").update(id).digest("hex").slice(0, 32)}`,
  });
  if (error) throw new Error(`webhook receipts: ${error.message}`);
  return data === true;
}

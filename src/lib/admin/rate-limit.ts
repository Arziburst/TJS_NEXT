import "server-only";

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

/*
 * Rate limits of the admin's paid or bulk actions, per admin (the same counter as the auth limits,
 * public.consume_rate_limit). Technical guards against a runaway loop or a stolen session, not business values:
 * a translation costs a model call, so an hour allows a little more than two full list pages of bulk translation;
 * the whole catalogue goes through the batch script (scripts/translate/missing.mjs) instead.
 */
export const ADMIN_RATE_LIMITS = {
  translate: { max: 120, windowSeconds: 3600 },
  review: { max: 300, windowSeconds: 600 },
  // collections and sales (#67): each tap is one write that expires shop caches; far above a person's pace
  merchandising: { max: 300, windowSeconds: 600 },
} as const;

export type AdminRateLimitedAction = keyof typeof ADMIN_RATE_LIMITS;

export function adminRateLimitKey(action: AdminRateLimitedAction, userId: string): string {
  return `admin-${action}:user:${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;
}

/** Counts one call and answers whether it may go ahead; fails closed when the counter cannot be reached. */
export async function allowAdminAction(action: AdminRateLimitedAction, userId: string): Promise<boolean> {
  const { max, windowSeconds } = ADMIN_RATE_LIMITS[action];
  try {
    const { data, error } = await createServiceClient().rpc("consume_rate_limit", {
      p_key: adminRateLimitKey(action, userId),
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

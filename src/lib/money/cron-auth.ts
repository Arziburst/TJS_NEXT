import { createHash, timingSafeEqual } from "node:crypto";

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Fails closed: no secret configured, no access.
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  // equal-length digests, so the comparison takes the same time whatever the header holds
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

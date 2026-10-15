import { createHash } from "node:crypto";

// No "server-only": the e2e tests fill a counter through these keys. Still never imported by client code.

export type RateLimitedAction = "sign-in" | "sign-up" | "password-reset" | "update-password";

// Legacy rule (express-rate-limit on registration and login): 15 attempts per 5 minutes per client. Here it
// counts per IP and, separately, per target email, so neither one address nor one account can be hammered.
export const AUTH_RATE_LIMIT = { max: 15, windowSeconds: 300 } as const;

function hashed(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** The counter keys of one attempt: hashed, so no raw IP or email is stored. */
export function rateLimitKeys(action: RateLimitedAction, ip: string, email?: string): string[] {
  const keys = [`${action}:ip:${hashed(ip)}`];
  if (email) keys.push(`${action}:email:${hashed(email.toLowerCase())}`);
  return keys;
}

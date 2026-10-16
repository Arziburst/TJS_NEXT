import { createHmac, timingSafeEqual } from "node:crypto";

// Standard Webhooks (https://www.standardwebhooks.com), as Supabase Auth signs its HTTP hooks: the signature is
// base64(HMAC-SHA256(secret, "<webhook-id>.<webhook-timestamp>.<body>")) in the `webhook-signature` header as
// "v1,<base64>" (several separated by spaces while a secret rotates). The secret is the dashboard's
// "v1,whsec_<base64>"; several secrets may be given separated by "|" (a rotation). A plain node:crypto check, no
// SDK needed.

// A request signed longer ago (or further ahead) than this is refused: an old request cannot be replayed later,
// and a request within the window is refused a second time by its id (the caller remembers the ids).
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export type WebhookVerification =
  | { ok: true; id: string; timestamp: number }
  | { ok: false; reason: "no_secret" | "missing_headers" | "stale" | "bad_signature" };

const SECRET_PREFIX = /^(?:v1,)?whsec_/;

/** The keys of a configured secret ("v1,whsec_<base64>", "|"-separated for a rotation); none when unusable. */
export function webhookKeys(secret: string | undefined): Buffer[] {
  return (secret ?? "")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => SECRET_PREFIX.test(part))
    .map((part) => Buffer.from(part.replace(SECRET_PREFIX, ""), "base64"))
    .filter((key) => key.length > 0);
}

/** The "v1,<base64>" signature of one request (what the sender puts in `webhook-signature`). */
export function signWebhook(key: Buffer, id: string, timestamp: number, body: string): string {
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function sameSignature(expected: string, given: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checks that `body` was signed with one of `keys` within the tolerance of `now`. */
export function verifyWebhook({
  keys,
  headers,
  body,
  now = new Date(),
}: {
  keys: Buffer[];
  headers: WebhookHeaders;
  body: string;
  now?: Date;
}): WebhookVerification {
  if (keys.length === 0) return { ok: false, reason: "no_secret" };
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "stale" };
  const seconds = Number(timestamp);
  if (Math.abs(now.getTime() / 1000 - seconds) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: "stale" };

  const given = signature.split(" ").filter((part) => part.startsWith("v1,"));
  const valid = keys.some((key) => {
    const expected = signWebhook(key, id, seconds, body);
    return given.some((part) => sameSignature(expected, part));
  });
  return valid ? { ok: true, id, timestamp: seconds } : { ok: false, reason: "bad_signature" };
}

// The Standard Webhooks check of Supabase Auth's hooks (#99): a valid signature within the tolerance passes; an
// unsigned, forged, tampered, old or future request does not; a rotated secret keeps working.
import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook, WEBHOOK_TOLERANCE_SECONDS, webhookKeys } from "@/lib/auth/webhook-signature";

const SECRET = `v1,whsec_${Buffer.from("a test secret of the send email hook").toString("base64")}`;
const OTHER = `v1,whsec_${Buffer.from("another secret").toString("base64")}`;
const now = new Date("2026-10-16T12:00:00Z");
const seconds = now.getTime() / 1000;
const body = JSON.stringify({ user: { email: "olena@example.test" }, email_data: { email_action_type: "signup" } });

function signed(secret = SECRET, { id = "msg_1", timestamp = seconds, payload = body } = {}) {
  const [key] = webhookKeys(secret);
  return { id, timestamp: String(timestamp), signature: signWebhook(key, id, timestamp, payload) };
}

describe("webhookKeys", () => {
  it("reads the dashboard's v1,whsec_ secret, a bare whsec_ one and a |-separated rotation", () => {
    expect(webhookKeys(SECRET)).toHaveLength(1);
    expect(webhookKeys(SECRET.replace("v1,", ""))).toHaveLength(1);
    expect(webhookKeys(`${SECRET}|${OTHER}`)).toHaveLength(2);
  });

  it("has no key without a usable secret", () => {
    for (const secret of [undefined, "", "   ", "plain-text", "v1,whsec_"]) expect(webhookKeys(secret)).toEqual([]);
  });
});

describe("verifyWebhook", () => {
  const keys = webhookKeys(SECRET);

  it("accepts a request signed with the secret", () => {
    expect(verifyWebhook({ keys, headers: signed(), body, now })).toEqual({ ok: true, id: "msg_1", timestamp: seconds });
  });

  it("accepts one of several signatures and a request within the tolerance", () => {
    const valid = signed();
    const signature = `v1,bm90IGl0 ${valid.signature}`;
    expect(verifyWebhook({ keys, headers: { ...valid, signature }, body, now }).ok).toBe(true);
    const early = signed(SECRET, { timestamp: seconds - WEBHOOK_TOLERANCE_SECONDS + 1 });
    expect(verifyWebhook({ keys, headers: early, body, now }).ok).toBe(true);
  });

  it("accepts the new secret of a rotation", () => {
    expect(verifyWebhook({ keys: webhookKeys(`${OTHER}|${SECRET}`), headers: signed(), body, now }).ok).toBe(true);
  });

  it("refuses an unsigned request", () => {
    expect(verifyWebhook({ keys, headers: { id: null, timestamp: null, signature: null }, body, now })).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    expect(verifyWebhook({ keys, headers: { ...signed(), signature: null }, body, now }).ok).toBe(false);
  });

  it("refuses a request signed with another secret", () => {
    expect(verifyWebhook({ keys, headers: signed(OTHER), body, now })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a tampered body, id or timestamp", () => {
    const headers = signed();
    expect(verifyWebhook({ keys, headers, body: body.replace("olena", "mallory"), now }).ok).toBe(false);
    expect(verifyWebhook({ keys, headers: { ...headers, id: "msg_2" }, body, now }).ok).toBe(false);
    // a timestamp moved within the tolerance no longer matches the signature
    expect(verifyWebhook({ keys, headers: { ...headers, timestamp: String(seconds - 10) }, body, now })).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("refuses an old or a future request, even correctly signed", () => {
    const old = signed(SECRET, { timestamp: seconds - WEBHOOK_TOLERANCE_SECONDS - 1 });
    expect(verifyWebhook({ keys, headers: old, body, now })).toEqual({ ok: false, reason: "stale" });
    const future = signed(SECRET, { timestamp: seconds + WEBHOOK_TOLERANCE_SECONDS + 1 });
    expect(verifyWebhook({ keys, headers: future, body, now })).toEqual({ ok: false, reason: "stale" });
    expect(verifyWebhook({ keys, headers: { ...signed(), timestamp: "soon" }, body, now })).toEqual({ ok: false, reason: "stale" });
  });

  it("refuses everything without a configured secret", () => {
    expect(verifyWebhook({ keys: [], headers: signed(), body, now })).toEqual({ ok: false, reason: "no_secret" });
  });
});

// Supabase Auth's Send Email Hook (#99): only a signed, fresh, first-seen call sends; each action type gets its
// email in the user's locale (user_metadata.locale → the page it was asked from → en) with the token-hash link to
// /<locale>/auth/confirm on the shop's origin; the answer is the JSON Auth expects; no log line carries the token
// or the link.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "@/lib/notifications/resend";
import type { SendResult } from "@/lib/notifications/telegram";
import { signWebhook, webhookKeys } from "@/lib/auth/webhook-signature";

vi.mock("server-only", () => ({}));

const { handleSendEmailHook, renderPlannedEmail } = await import("@/lib/auth/send-email-hook");
type Deps = Parameters<typeof handleSendEmailHook>[1];

const SECRET = `v1,whsec_${Buffer.from("the hook secret of the tests").toString("base64")}`;
const keys = webhookKeys(SECRET);
const now = new Date("2026-10-16T12:00:00Z");
const TOKEN_HASH = "pkce_0a1b2c3d4e5f60718293a4b5c6d7e8f9";
const TOKEN_HASH_NEW = "pkce_ffeeddccbbaa99887766554433221100";

type Payload = {
  user: { email?: string; new_email?: string; user_metadata?: Record<string, unknown> };
  email_data: { email_action_type: string; token_hash?: string; token_hash_new?: string; redirect_to?: string };
};

function payload(type: string, { locale, redirect, user = {} }: { locale?: unknown; redirect?: string; user?: Payload["user"] } = {}): Payload {
  return {
    user: { email: "olena@example.test", user_metadata: locale === undefined ? {} : { locale }, ...user },
    email_data: {
      email_action_type: type,
      token: "123456",
      token_hash: TOKEN_HASH,
      token_new: "",
      token_hash_new: "",
      redirect_to: redirect ?? "",
      site_url: "http://127.0.0.1:3099",
    } as Payload["email_data"],
  };
}

let sequence = 0;
function request(body: Payload | string, { id = `msg_${++sequence}`, timestamp = now.getTime() / 1000, sign = true } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    headers: { id, timestamp: String(timestamp), signature: sign ? signWebhook(keys[0], id, timestamp, text) : null },
    body: text,
  };
}

let sent: EmailMessage[];
let logs: string[];

function deps(overrides: Partial<Deps> = {}): Deps {
  const seen = new Set<string>();
  return {
    keys,
    now,
    claim: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    render: renderPlannedEmail,
    transport: {
      ok: true,
      send: async (message): Promise<SendResult> => {
        sent.push(message);
        return { ok: true };
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shop.example.test");
  sent = [];
  logs = [];
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  // no log line of any test names the token or the link
  for (const line of logs) {
    expect(line).not.toContain(TOKEN_HASH);
    expect(line).not.toContain(TOKEN_HASH_NEW);
    expect(line).not.toContain("token_hash=");
    expect(line).not.toContain("123456");
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("the signature", () => {
  it("refuses an unsigned call with 401 and sends nothing", async () => {
    const claim = vi.fn(async () => true);
    const result = await handleSendEmailHook(request(payload("signup"), { sign: false }), deps({ claim }));
    expect(result).toEqual({ status: 401, body: { error: { http_code: 401, message: "invalid signature" } } });
    expect(claim).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("refuses a call signed with another secret", async () => {
    const other = webhookKeys(`v1,whsec_${Buffer.from("not the secret").toString("base64")}`);
    const result = await handleSendEmailHook(request(payload("signup")), deps({ keys: other }));
    expect(result.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("refuses an old call, even correctly signed", async () => {
    const result = await handleSendEmailHook(request(payload("signup"), { timestamp: now.getTime() / 1000 - 6 * 60 }), deps());
    expect(result.status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("refuses a replayed call (the same id again) and sends only once", async () => {
    const hook = deps();
    const call = request(payload("signup", { locale: "uk" }));
    expect((await handleSendEmailHook(call, hook)).status).toBe(200);
    expect(await handleSendEmailHook(call, hook)).toEqual({ status: 401, body: { error: { http_code: 401, message: "invalid signature" } } });
    expect(sent).toHaveLength(1);
  });

  it("sends nothing when the replay check cannot be made", async () => {
    const claim = async () => {
      throw new Error("database down");
    };
    expect((await handleSendEmailHook(request(payload("signup")), deps({ claim }))).status).toBe(500);
    expect(sent).toEqual([]);
  });

  it("refuses everything while SEND_EMAIL_HOOK_SECRET is unset", async () => {
    const result = await handleSendEmailHook(request(payload("signup")), deps({ keys: [] }));
    expect(result).toEqual({ status: 500, body: { error: { http_code: 500, message: "the hook is not configured" } } });
    expect(sent).toEqual([]);
  });
});

describe("the emails", () => {
  it("sends the sign-up confirmation in uk with the token-hash link and a plain-text part", async () => {
    const result = await handleSendEmailHook(request(payload("signup", { locale: "uk" })), deps());
    expect(result).toEqual({ status: 200, body: {} });
    expect(sent).toHaveLength(1);
    const [email] = sent;
    const link = `https://shop.example.test/uk/auth/confirm?token_hash=${TOKEN_HASH}&type=email`;
    expect(email.to).toBe("olena@example.test");
    expect(email.subject).toBe("Підтвердьте свою електронну пошту");
    expect(email.html).toContain('<html lang="uk"');
    expect(email.html).toContain(`href="${link.replace("&", "&amp;")}"`);
    expect(email.html).toContain("завершити реєстрацію в TJS");
    expect(email.text).toContain(`Підтвердити пошту: ${link}`);
    expect(email.text).toContain("Якщо ви не реєструвалися");
    expect(email.idempotencyKey).toMatch(/^auth-email\/msg_\d+\/signup$/);
  });

  it("sends the sign-up confirmation in de", async () => {
    await handleSendEmailHook(request(payload("signup", { locale: "de" })), deps());
    expect(sent[0].subject).toBe("Bestätigen Sie Ihre E-Mail-Adresse");
    expect(sent[0].text).toContain(`/de/auth/confirm?token_hash=${TOKEN_HASH}&type=email`);
  });

  it("sends the password reset with a recovery link", async () => {
    await handleSendEmailHook(request(payload("recovery", { locale: "fr" })), deps());
    expect(sent[0].subject).toBe("Réinitialisez votre mot de passe");
    expect(sent[0].text).toContain(`https://shop.example.test/fr/auth/confirm?token_hash=${TOKEN_HASH}&type=recovery`);
  });

  it("sends an email change to both addresses, each with its own token (the payload's names are reversed)", async () => {
    const change = payload("email_change", { locale: "en", user: { new_email: "olena.new@example.test" } });
    change.email_data.token_hash_new = TOKEN_HASH_NEW;
    expect((await handleSendEmailHook(request(change), deps())).status).toBe(200);
    expect(sent).toHaveLength(2);
    const current = sent.find((email) => email.to === "olena@example.test")!;
    const next = sent.find((email) => email.to === "olena.new@example.test")!;
    expect(current.subject).toBe("Confirm the change of your email");
    expect(current.text).toContain("changes from olena@example.test to olena.new@example.test");
    expect(current.text).toContain(`token_hash=${TOKEN_HASH_NEW}&type=email_change`);
    expect(next.subject).toBe("Confirm your new email");
    expect(next.text).toContain(`token_hash=${TOKEN_HASH}&type=email_change`);
    expect(current.idempotencyKey).not.toBe(next.idempotencyKey);
  });

  it("sends an email change to the new address only when Secure Email Change is off", async () => {
    await handleSendEmailHook(request(payload("email_change", { locale: "pl", user: { new_email: "nowy@example.test" } })), deps());
    expect(sent.map((email) => [email.to, email.subject])).toEqual([["nowy@example.test", "Potwierdź nowy adres e-mail"]]);
  });

  it("sends a magic link (when switched on) with a link the confirm route accepts", async () => {
    await handleSendEmailHook(request(payload("magiclink", { locale: "it" })), deps());
    expect(sent[0].subject).toBe("Il tuo link di accesso a TJS");
    expect(sent[0].text).toContain(`/it/auth/confirm?token_hash=${TOKEN_HASH}&type=email`);
  });

  it("refuses an email type the shop does not send", async () => {
    for (const type of ["invite", "reauthentication", "password_changed_notification"]) {
      const result = await handleSendEmailHook(request(payload(type)), deps());
      expect(result).toEqual({ status: 400, body: { error: { http_code: 400, message: "unsupported email type" } } });
    }
    expect(sent).toEqual([]);
  });

  it("refuses a signed call that is not a hook payload", async () => {
    expect((await handleSendEmailHook(request("not json"), deps())).status).toBe(400);
    expect((await handleSendEmailHook(request(JSON.stringify({ user: {} })), deps())).status).toBe(400);
    expect(sent).toEqual([]);
  });

  it("escapes the addresses in the HTML part", async () => {
    const change = payload("email_change", { locale: "en", user: { new_email: "a<b>@example.test" } });
    await handleSendEmailHook(request(change), deps());
    expect(sent[0].html).toContain("a&lt;b&gt;@example.test");
    expect(sent[0].html).not.toContain("a<b>@");
  });
});

describe("the locale", () => {
  async function subjectFor(input: Parameters<typeof payload>[1]) {
    sent = [];
    await handleSendEmailHook(request(payload("signup", input)), deps());
    return sent[0].subject;
  }

  it("is the stored user_metadata.locale first", async () => {
    expect(await subjectFor({ locale: "de", redirect: "https://shop.example.test/fr/auth/confirm" })).toBe("Bestätigen Sie Ihre E-Mail-Adresse");
  });

  it("is the locale of the page it was asked from without a stored one", async () => {
    expect(await subjectFor({ redirect: "https://shop.example.test/pl/auth/confirm" })).toBe("Potwierdź swój adres e-mail");
  });

  it("falls back to en for a missing or unknown locale", async () => {
    expect(await subjectFor({})).toBe("Confirm your email");
    expect(await subjectFor({ locale: "ru", redirect: "https://shop.example.test/xx/auth/confirm" })).toBe("Confirm your email");
    expect(await subjectFor({ locale: 42, redirect: "not a url" })).toBe("Confirm your email");
  });

  it("never takes the link's host from the payload", async () => {
    await handleSendEmailHook(request(payload("signup", { redirect: "https://evil.example/de/auth/confirm" })), deps());
    expect(sent[0].text).toContain(`https://shop.example.test/de/auth/confirm?token_hash=${TOKEN_HASH}&type=email`);
    expect(sent[0].html).not.toContain("evil.example");
  });
});

describe("the transport", () => {
  it("answers 500 when email sending is not configured here", async () => {
    const transport = { ok: false as const, reason: "not configured (RESEND_API_KEY unset)" };
    const result = await handleSendEmailHook(request(payload("signup")), deps({ transport }));
    expect(result).toEqual({ status: 500, body: { error: { http_code: 500, message: "email sending is not configured" } } });
  });

  it("answers 500 when the provider refuses the email", async () => {
    const transport = { ok: true as const, send: async (): Promise<SendResult> => ({ ok: false, error: "email: HTTP 422 validation_error" }) };
    const result = await handleSendEmailHook(request(payload("recovery")), deps({ transport }));
    expect(result).toEqual({ status: 500, body: { error: { http_code: 500, message: "the email could not be sent" } } });
    expect(logs.some((line) => line.includes("HTTP 422"))).toBe(true);
  });
});

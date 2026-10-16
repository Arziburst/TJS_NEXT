// Where notifications may go: nothing leaves a test or a local run without NOTIFICATIONS_SEND=true, a channel
// without its settings is "not configured", and the Resend transport keeps its key out of every result.
import { describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/notifications/resend";

vi.mock("server-only", () => ({}));

// the admin settings (#21), read with the service role
const readShopSettingsAsService = vi.fn<() => Promise<{ telegram_chat_id: string | null } | null>>();
vi.mock("@/lib/settings/store", () => ({ readShopSettingsAsService: () => readShopSettingsAsService() }));

const { loadNotificationConfig, notificationConfig } = await import("@/lib/notifications/config");

const FULL = {
  NOTIFICATIONS_SEND: "true",
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_CHAT_ID: "-100123",
  RESEND_API_KEY: "re_secret",
  EMAIL_FROM: "Shop <orders@example.test>",
};

describe("notificationConfig", () => {
  it("sends nothing unless NOTIFICATIONS_SEND is exactly true, even with every key set", () => {
    for (const flag of [undefined, "", "1", "TRUE", "yes"]) {
      const config = notificationConfig({ ...FULL, NOTIFICATIONS_SEND: flag });
      expect(config.telegram.ok, String(flag)).toBe(false);
      expect(config.email.ok, String(flag)).toBe(false);
    }
  });

  it("this test run itself has sending off", () => {
    const config = notificationConfig();
    expect(config.telegram.ok || config.email.ok).toBe(false);
  });

  it("uses the real APIs by default and the overrides when set", () => {
    const config = notificationConfig(FULL);
    expect(config).toEqual({
      telegram: { ok: true, config: { token: "123:abc", chatId: "-100123", apiBaseUrl: "https://api.telegram.org" } },
      email: { ok: true, config: { apiKey: "re_secret", from: "Shop <orders@example.test>", replyTo: null, apiUrl: "https://api.resend.com" } },
    });
    const local = notificationConfig({ ...FULL, TELEGRAM_API_BASE_URL: "http://127.0.0.1:5000", RESEND_API_URL: "http://127.0.0.1:5000", EMAIL_REPLY_TO: "owner@example.test" });
    expect(local.telegram.ok && local.telegram.config.apiBaseUrl).toBe("http://127.0.0.1:5000");
    expect(local.email.ok && local.email.config).toMatchObject({ apiUrl: "http://127.0.0.1:5000", replyTo: "owner@example.test" });
  });

  it("names the missing settings of a channel, never their values", () => {
    const config = notificationConfig({ NOTIFICATIONS_SEND: "true", TELEGRAM_BOT_TOKEN: "123:abc", EMAIL_FROM: "x@example.test" });
    expect(config.telegram).toEqual({ ok: false, reason: "not configured (TELEGRAM_CHAT_ID unset)" });
    expect(config.email).toEqual({ ok: false, reason: "not configured (RESEND_API_KEY unset)" });
    expect(JSON.stringify(config)).not.toContain("123:abc");
  });
});

describe("sendEmail", () => {
  const config = { apiKey: "re_secret", from: "Shop <orders@example.test>", replyTo: "owner@example.test", apiUrl: "https://resend.test" };
  const message = { to: "olena@example.test", subject: "S", html: "<p>H</p>", text: "T", idempotencyKey: "event-1/email" };

  it("posts one email with an idempotency key", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ id: "email-1" }));
    expect(await sendEmail(config, message, fetchImpl)).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://resend.test/emails");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer re_secret", "Idempotency-Key": "event-1/email" });
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Shop <orders@example.test>",
      to: ["olena@example.test"],
      subject: "S",
      html: "<p>H</p>",
      text: "T",
      reply_to: "owner@example.test",
    });
  });

  it("reports a refusal without the key", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json({ statusCode: 401, name: "validation_error", message: "API key re_secret is invalid" }, { status: 401 }),
    );
    expect(await sendEmail(config, message, fetchImpl)).toEqual({ ok: false, error: "email: HTTP 401 validation_error: API key <key> is invalid" });
  });

  it("reports a timeout by its name", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await sendEmail(config, message, fetchImpl)).toEqual({ ok: false, error: "email: TimeoutError" });
  });
});

describe("the owner's Telegram chat", () => {
  const chatOf = (config: Awaited<ReturnType<typeof loadNotificationConfig>>) => config.telegram.ok && config.telegram.config.chatId;

  it("is the one in the admin settings, TELEGRAM_CHAT_ID only the fallback", () => {
    expect(chatOf(notificationConfig(FULL, "-100777"))).toBe("-100777");
    expect(chatOf(notificationConfig({ ...FULL, TELEGRAM_CHAT_ID: undefined }, "-100777"))).toBe("-100777");
    expect(chatOf(notificationConfig(FULL, null))).toBe("-100123");
    expect(chatOf(notificationConfig(FULL, "  "))).toBe("-100123");
  });

  it("is read from the settings for a run, falling back to the environment when none is set or the read fails", async () => {
    readShopSettingsAsService.mockResolvedValueOnce({ telegram_chat_id: "-100777" });
    expect(chatOf(await loadNotificationConfig(FULL))).toBe("-100777");
    readShopSettingsAsService.mockResolvedValueOnce({ telegram_chat_id: null });
    expect(chatOf(await loadNotificationConfig(FULL))).toBe("-100123");
    readShopSettingsAsService.mockResolvedValueOnce(null);
    expect(chatOf(await loadNotificationConfig(FULL))).toBe("-100123");
  });

  it("is not read at all while sending is off", async () => {
    readShopSettingsAsService.mockClear();
    const config = await loadNotificationConfig({ ...FULL, NOTIFICATIONS_SEND: undefined });
    expect(config.telegram.ok).toBe(false);
    expect(readShopSettingsAsService).not.toHaveBeenCalled();
  });
});

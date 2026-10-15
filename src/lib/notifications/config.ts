import "server-only";

import type { EmailConfig } from "./resend";
import type { TelegramConfig } from "./telegram";

// Where the notifications go (.env.example, docs/dev-environment.md). Nothing is sent unless NOTIFICATIONS_SEND is
// exactly "true" (set on the production deployment only): tests and local runs never reach a real chat or inbox,
// even with keys in .env.local. A channel without its settings is "not configured": its messages are marked
// skipped_unconfigured, not failed.

export type ChannelConfig<T> = { ok: true; config: T } | { ok: false; reason: string };

export type NotificationConfig = { telegram: ChannelConfig<TelegramConfig>; email: ChannelConfig<EmailConfig> };

type Env = Record<string, string | undefined>;

const TELEGRAM_API = "https://api.telegram.org";
const RESEND_API = "https://api.resend.com";

function value(env: Env, name: string): string | null {
  const text = env[name]?.trim();
  return text ? text : null;
}

function missing(names: string[]): string {
  return `not configured (${names.join(", ")} unset)`;
}

export function notificationConfig(env: Env = process.env): NotificationConfig {
  if (env.NOTIFICATIONS_SEND !== "true") {
    const off = { ok: false as const, reason: "sending is off here (NOTIFICATIONS_SEND is not \"true\")" };
    return { telegram: off, email: off };
  }

  const token = value(env, "TELEGRAM_BOT_TOKEN");
  // the owner's group; moves to the admin settings with #21 (shop_settings.telegram_chat_id)
  const chatId = value(env, "TELEGRAM_CHAT_ID");
  const telegram: ChannelConfig<TelegramConfig> =
    token && chatId
      ? { ok: true, config: { token, chatId, apiBaseUrl: value(env, "TELEGRAM_API_BASE_URL") ?? TELEGRAM_API } }
      : { ok: false, reason: missing([...(token ? [] : ["TELEGRAM_BOT_TOKEN"]), ...(chatId ? [] : ["TELEGRAM_CHAT_ID"])]) };

  const apiKey = value(env, "RESEND_API_KEY");
  const from = value(env, "EMAIL_FROM");
  const email: ChannelConfig<EmailConfig> =
    apiKey && from
      ? {
          ok: true,
          config: { apiKey, from, replyTo: value(env, "EMAIL_REPLY_TO"), apiUrl: value(env, "RESEND_API_URL") ?? RESEND_API },
        }
      : { ok: false, reason: missing([...(apiKey ? [] : ["RESEND_API_KEY"]), ...(from ? [] : ["EMAIL_FROM"])]) };

  return { telegram, email };
}

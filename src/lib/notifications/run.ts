import "server-only";

import { routes } from "@/config/routes";
import { renderOrderConfirmation } from "@/emails/order-confirmation";
import { getMetadataBase } from "@/i18n/metadata";
import { createServiceClient } from "@/lib/supabase/server";
import { loadNotificationConfig, type NotificationConfig } from "./config";
import { readShopContacts } from "./contacts";
import { processOutbox, type ProcessorDeps, type ProcessReport } from "./processor";
import { sendEmail } from "./resend";
import { claimOutboxEvents, completeOutboxEvent, readNotificationOrder } from "./store";
import { renderTelegramOrder, sendTelegram, TELEGRAM_LOCALE } from "./telegram";
import { notificationsTranslator } from "./texts";

/** The admin's page of order `number` (its path is reserved for the orders admin, #27), on the shop's origin. */
export function adminOrderUrl(number: number): string {
  return new URL(`/${TELEGRAM_LOCALE}${routes.admin.path}/orders/${number}`, getMetadataBase()).toString();
}

// The customer's confirmation goes out only for an order placed at most this long ago: a request stored while
// sending was down or not yet configured (the backlog before this sender existed) gets no confirmation days late.
// The owner's Telegram message has no limit: every order request reaches the owner.
export const CONFIRMATION_EMAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The senders of the real channels: Telegram to the owner's group, the email to the customer. */
export function channelSenders(
  config: NotificationConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): ProcessorDeps["send"] {
  return {
    telegram: async (_event, order) => {
      if (!config.telegram.ok) return { status: "skipped_unconfigured", reason: config.telegram.reason };
      const t = await notificationsTranslator(TELEGRAM_LOCALE);
      const text = renderTelegramOrder(order, { t, locale: TELEGRAM_LOCALE, adminUrl: adminOrderUrl(order.number) });
      const sent = await sendTelegram(config.telegram.config, text, fetchImpl);
      if (sent.ok) return { status: "sent" };
      return sent.retryAfterSeconds === undefined
        ? { status: "error", error: sent.error }
        : { status: "throttled", retryAfterSeconds: sent.retryAfterSeconds, error: sent.error };
    },
    email: async (event, order) => {
      if (!config.email.ok) return { status: "skipped_unconfigured", reason: config.email.reason };
      if (now().getTime() - new Date(event.createdAt).getTime() > CONFIRMATION_EMAIL_MAX_AGE_MS) {
        return { status: "skipped_expired", reason: "the order is older than 24 hours: no late confirmation" };
      }
      const [t, contacts] = await Promise.all([notificationsTranslator(order.locale), readShopContacts()]);
      const email = renderOrderConfirmation(order, { t, contacts, siteUrl: getMetadataBase() });
      const sent = await sendEmail(config.email.config, { to: order.email, ...email, idempotencyKey: `${event.id}/email` }, fetchImpl);
      return sent.ok ? { status: "sent" } : { status: "error", error: sent.error };
    },
  };
}

/** One processor run over the due outbox events with the configured channels. */
export async function runNotifications(): Promise<ProcessReport> {
  const service = createServiceClient();
  return processOutbox({
    claim: (limit, lease) => claimOutboxEvents(service, limit, lease),
    loadOrder: (orderId) => readNotificationOrder(service, orderId),
    complete: (completion) => completeOutboxEvent(service, completion),
    send: channelSenders(await loadNotificationConfig()),
  });
}

/** For after(): a run whose failure is logged, never thrown into the request that scheduled it. */
export async function runNotificationsQuietly(): Promise<void> {
  try {
    await runNotifications();
  } catch (error) {
    console.error("notifications: the run failed", error);
  }
}

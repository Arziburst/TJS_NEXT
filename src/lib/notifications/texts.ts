import { createTranslator } from "next-intl";
import { loadMessages, type Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/routing";
import { BUSINESS_TIME_ZONE } from "@/lib/money/business-date";
import { formatMoney } from "@/lib/money/format";
import type { DeliveryEstimate, NotificationOrder } from "./order";

// The texts every notification shares: the messages of the `notifications` namespace in one locale, and the
// delivery, money and date lines built from them. Outside a request (after() and the cron), so the translator
// is made here instead of by next-intl's request config.

export type NotificationsTranslator = ReturnType<typeof translatorFor>;

function translatorFor(locale: Locale, messages: Messages) {
  return createTranslator({ locale, messages, namespace: "notifications" });
}

export async function notificationsTranslator(locale: Locale): Promise<NotificationsTranslator> {
  return translatorFor(locale, await loadMessages(locale));
}

/** The order's goods money in its own currency (the one the customer saw). */
export function orderMoney(order: NotificationOrder, amountMinor: number, locale: string): string {
  return formatMoney({ currency: order.currency, amountMinor, decimals: order.decimals }, locale);
}

/** "Nova Poshta, to a branch" */
export function deliveryMethodText(order: NotificationOrder, t: NotificationsTranslator): string {
  return `${t(`delivery.carrier.${order.carrier}`)}, ${t(`delivery.method.${order.method}`)}`;
}

/** The destination as lines of an address: the point or street, then the place, then the country. */
export function destinationLines(order: NotificationOrder, t: NotificationsTranslator, locale: string): string[] {
  const country = new Intl.DisplayNames([locale], { type: "region" }).of(order.country) ?? order.country;
  const { destination } = order;
  if (!destination) return [country];
  if (destination.kind === "point") return [destination.point, destination.place, country];
  const street = `${destination.street} ${destination.house}`;
  return [
    destination.flat ? `${street}, ${t("delivery.flat", { flat: destination.flat })}` : street,
    destination.postCode ? `${destination.postCode} ${destination.place}` : destination.place,
    country,
  ];
}

/** "≈ 80 ₴", "TBD" or "calculated by the carrier" (D37, D38: an estimate; the actual price is paid on receipt). */
export function estimateText(estimate: DeliveryEstimate, t: NotificationsTranslator, locale: string): string {
  if (estimate.state === "amount") {
    const amount = formatMoney({ currency: estimate.currency, amountMinor: estimate.amountMinor, decimals: estimate.decimals }, locale);
    return t("delivery.estimateAmount", { amount });
  }
  return estimate.state === "tbd" ? t("delivery.estimateTbd") : t("delivery.estimateUnavailable");
}

/** The moment an order was placed, on Kyiv time (the shop's business time zone). */
export function placedAt(order: NotificationOrder, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: BUSINESS_TIME_ZONE }).format(
    new Date(order.createdAt),
  );
}

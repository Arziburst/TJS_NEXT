import type { ShopContacts } from "@/lib/notifications/contacts";
import type { NotificationOrder, OrderStatus } from "@/lib/notifications/order";
import type { NotificationsTranslator } from "@/lib/notifications/texts";
import { contactsHtml, contactsText, e, emailDocument, heading, paragraph, type RenderedEmail } from "./layout";

/**
 * The customer's email about a new status of their order (D11, D17), in the order's locale, with the shop's
 * contact channels. For the admin's status changes (#27), which queue it like the confirmation.
 */
export function renderOrderStatusChange(
  order: NotificationOrder,
  status: OrderStatus,
  { t, contacts, siteUrl }: { t: NotificationsTranslator; contacts: ShopContacts | null; siteUrl: URL },
): RenderedEmail {
  const label = t(`status.${status}`);
  const subject = t("email.statusChange.subject", { number: order.number, status: label });
  const greeting = t("email.statusChange.greeting", { name: order.firstName });
  const message = t("email.statusChange.text", { number: order.number, status: label });
  const footer = t("email.footer", { site: siteUrl.host });

  const body = [
    heading(t("email.statusChange.title")),
    paragraph(greeting),
    `<p style="margin:0 0 12px;">${e(message)}</p>`,
    contactsHtml(contacts, t),
  ].join("\n");

  const text = [t("email.statusChange.title"), "", greeting, message, "", ...contactsText(contacts, t), "", "--", footer].join("\n");

  return { subject, html: emailDocument({ locale: order.locale, title: subject, preheader: message, body, footer }), text };
}

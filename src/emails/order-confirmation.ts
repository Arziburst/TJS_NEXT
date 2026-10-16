import type { ShopContacts } from "@/lib/notifications/contacts";
import type { NotificationOrder } from "@/lib/notifications/order";
import {
  deliveryMethodText,
  destinationLines,
  estimateText,
  orderMoney,
  type NotificationsTranslator,
} from "@/lib/notifications/texts";
import {
  amountRow,
  amountTable,
  contactsHtml,
  contactsText,
  e,
  emailDocument,
  heading,
  paragraph,
  subheading,
  type RenderedEmail,
} from "./layout";

/**
 * The customer's confirmation of an order request (D11, D19), in the order's locale: its number, the lines and
 * the total as stored, the delivery and its estimate with the note that the carrier is paid on receipt (D37,
 * D38), what happens next and the shop's contact channels. Storefront mode: nothing in it asks for a payment.
 */
export function renderOrderConfirmation(
  order: NotificationOrder,
  { t, contacts, siteUrl }: { t: NotificationsTranslator; contacts: ShopContacts | null; siteUrl: URL },
): RenderedEmail {
  const locale = order.locale;
  const subject = t("email.confirmation.subject", { number: order.number });
  const thanks = t("email.confirmation.thanks", { name: order.firstName });
  const total = orderMoney(order, order.totalMinor, locale);
  const method = deliveryMethodText(order, t);
  const destination = destinationLines(order, t, locale);
  const estimate = estimateText(order.estimate, t, locale);
  const notes = [t("email.deliveryNote"), ...(order.carrier === "nova_post" ? [t("email.customsNotice")] : [])];

  const lines = order.lines.map((line) =>
    amountRow(line.title, orderMoney(order, line.lineMinor, locale), { note: t("email.quantity", { quantity: line.quantity }) }),
  );

  const body = [
    heading(t("email.confirmation.title")),
    paragraph(thanks),
    `<p style="margin:0 0 12px;">${e(t("email.number"))}: <strong style="font-size:20px;">${e(String(order.number))}</strong></p>`,
    subheading(t("email.lines")),
    amountTable([...lines, amountRow(t("email.goodsTotal"), total, { strong: true })]),
    subheading(t("email.delivery")),
    paragraph(method),
    `<p style="margin:0 0 12px;">${destination.map(e).join("<br>")}</p>`,
    amountTable([amountRow(t("email.deliveryEstimate"), estimate)]),
    `<div style="margin-top:12px;">${notes.map((note) => paragraph(note, { muted: true, small: true })).join("\n")}</div>`,
    `<div style="margin-top:28px;">${paragraph(t("email.confirmation.next"))}</div>`,
    contactsHtml(contacts, t),
  ].join("\n");

  const text = [
    t("email.confirmation.title"),
    "",
    thanks,
    `${t("email.number")}: ${order.number}`,
    "",
    `${t("email.lines")}:`,
    ...order.lines.map((line) => `- ${line.title} × ${line.quantity}: ${orderMoney(order, line.lineMinor, locale)}`),
    `${t("email.goodsTotal")}: ${total}`,
    "",
    `${t("email.delivery")}: ${method}`,
    ...destination,
    `${t("email.deliveryEstimate")}: ${estimate}`,
    ...notes,
    "",
    t("email.confirmation.next"),
    "",
    ...contactsText(contacts, t),
    "",
    "--",
    t("email.footer", { site: siteUrl.host }),
  ].join("\n");

  return {
    subject,
    html: emailDocument({ locale, title: subject, preheader: thanks, body, footer: t("email.footer", { site: siteUrl.host }) }),
    text,
  };
}

import type { ShopContacts } from "@/lib/notifications/contacts";
import type { NotificationsTranslator } from "@/lib/notifications/texts";
import { buttonLink, contactsHtml, contactsText, emailDocument, heading, paragraph, type RenderedEmail } from "./layout";

/** The Supabase Auth emails the shop sends itself (#99, the Send Email Hook), one per address. */
export type AuthEmailKind = "signup" | "recovery" | "emailChangeCurrent" | "emailChangeNew" | "magicLink";

export type AuthEmailContext = {
  t: NotificationsTranslator;
  locale: string;
  // the token-hash link to /<locale>/auth/confirm
  link: string;
  // the account's address, and the new one of an email change
  email: string;
  newEmail: string | null;
  shopName: string;
  // the shop's channels from the admin settings (#21); shown only when there are some
  contacts: ShopContacts | null;
  siteUrl: URL;
};

/**
 * An Auth email in the user's locale: what the link does, the link as a button and as text, and what to do when
 * the user did not ask for it. The texts are the `notifications.email.auth` messages.
 */
export function renderAuthEmail(kind: AuthEmailKind, context: AuthEmailContext): RenderedEmail {
  const { t, locale, link, shopName, contacts, siteUrl } = context;
  const values = { shop: shopName, email: context.email, newEmail: context.newEmail ?? "" };
  const subject = t(`email.auth.${kind}.subject`, values);
  const title = t(`email.auth.${kind}.title`, values);
  const text = t(`email.auth.${kind}.text`, values);
  const action = t(`email.auth.${kind}.action`, values);
  const ignore = t(`email.auth.${kind}.ignore`, values);
  const footer = t("email.auth.footer", { site: siteUrl.host });
  const withContacts = contacts !== null && contacts.channels.length > 0;

  const body = [
    heading(title),
    paragraph(text),
    buttonLink(link, action, t("email.auth.linkHint")),
    paragraph(ignore, { muted: true, small: true }),
    withContacts ? contactsHtml(contacts, t) : "",
  ].join("\n");

  const plain = [
    title,
    "",
    text,
    "",
    `${action}: ${link}`,
    "",
    ignore,
    ...(withContacts ? ["", ...contactsText(contacts, t)] : []),
    "",
    "--",
    footer,
  ].join("\n");

  return { subject, html: emailDocument({ locale, title: subject, preheader: text, body, footer }), text: plain };
}

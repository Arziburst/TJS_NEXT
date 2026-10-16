// Tap-to-contact links of an order's customer: a call, an email, and a messenger only when the customer gave
// that handle (never guessed from the phone: a number is not proof of an account). Shared; no "server-only".

export type ContactKind = "phone" | "email" | "instagram" | "telegram" | "viber" | "whatsapp";

export type ContactLink = { kind: ContactKind; href: string; text: string };

export type CustomerContacts = {
  phone: string;
  email: string;
  /** Messenger handles the customer gave, if any (none are collected at checkout yet). */
  instagram?: string | null;
  telegram?: string | null;
  viber?: string | null;
  whatsapp?: string | null;
};

const E164 = /^\+[1-9][0-9]{7,14}$/;
// Instagram and Telegram user names: letters, digits, dots (Instagram) and underscores, without the "@"
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const TELEGRAM_HANDLE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

function handle(value: string | null | undefined, pattern: RegExp): string | null {
  const text = value?.trim().replace(/^@/, "");
  return text && pattern.test(text) ? text : null;
}

function phoneOf(value: string | null | undefined): string | null {
  const text = value?.replace(/[\s\-().]/g, "");
  return text && E164.test(text) ? text : null;
}

export function contactLinks(contacts: CustomerContacts): ContactLink[] {
  const links: ContactLink[] = [];
  const phone = phoneOf(contacts.phone);
  if (phone) links.push({ kind: "phone", href: `tel:${phone}`, text: phone });
  const email = contacts.email.trim();
  if (email) links.push({ kind: "email", href: `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`, text: email });

  const instagram = handle(contacts.instagram, INSTAGRAM_HANDLE);
  if (instagram) links.push({ kind: "instagram", href: `https://instagram.com/${instagram}`, text: `@${instagram}` });
  const telegram = handle(contacts.telegram, TELEGRAM_HANDLE);
  if (telegram) links.push({ kind: "telegram", href: `https://t.me/${telegram}`, text: `@${telegram}` });
  const viber = phoneOf(contacts.viber);
  if (viber) links.push({ kind: "viber", href: `viber://chat?number=${encodeURIComponent(viber)}`, text: viber });
  const whatsapp = phoneOf(contacts.whatsapp);
  if (whatsapp) links.push({ kind: "whatsapp", href: `https://wa.me/${whatsapp.slice(1)}`, text: whatsapp });
  return links;
}

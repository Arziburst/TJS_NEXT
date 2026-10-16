/*
 * The shop's contact channels (D19): the admin form's fields, their validation and normalization (shared by the
 * form and the server action), and the links the storefront renders from the stored row. Pure: no database
 * access here. Every channel is optional; each is stored in one canonical form that the database checks again
 * (supabase/migrations/20261016007400_shop_settings.sql).
 */

export const CONTACT_FIELDS = [
  "shopName",
  "instagram",
  "email",
  "phone",
  "telegram",
  "viber",
  "whatsapp",
  "telegramChatId",
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export const SHOP_NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
// what any of the fields may hold before normalization: a long pasted link, never a document
export const CONTACT_INPUT_MAX_LENGTH = 300;

export type ContactErrorCode = "invalid" | "tooLong";
export type ContactFieldErrors = Partial<Record<ContactField, ContactErrorCode>>;

/** The stored row's public columns plus the server-only chat id, as the database names them. */
export type ShopSettingsRow = {
  shop_name: string | null;
  instagram_handle: string | null;
  email: string | null;
  phone: string | null;
  telegram_url: string | null;
  viber_url: string | null;
  whatsapp_url: string | null;
  telegram_chat_id: string | null;
};

export type PublicShopSettings = Omit<ShopSettingsRow, "telegram_chat_id">;

/** The form's text for a stored row: what the admin sees in each field. */
export function contactFormValues(row: ShopSettingsRow): Record<ContactField, string> {
  return {
    shopName: row.shop_name ?? "",
    instagram: row.instagram_handle ? `@${row.instagram_handle}` : "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    telegram: row.telegram_url ?? "",
    viber: row.viber_url ?? "",
    whatsapp: row.whatsapp_url ?? "",
    telegramChatId: row.telegram_chat_id ?? "",
  };
}

// a link typed without its scheme ("t.me/name") parses like a typed one
function asUrl(text: string): URL | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function hostIs(url: URL, ...hosts: string[]): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return (url.protocol === "https:" || url.protocol === "http:") && hosts.includes(host);
}

// the digits of an international number ("+38 (066) 123-45-67" → "380661234567"); null when it is not one
function internationalDigits(text: string): string | null {
  if (!/^\+?[0-9][0-9 ().-]*$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const TELEGRAM_INVITE = /^\+[A-Za-z0-9_-]{1,64}$/;

/** "@name", "name" or a profile link → the handle. */
export function normalizeInstagram(text: string): string | null {
  const handle = text.startsWith("@") ? text.slice(1) : text;
  if (INSTAGRAM_HANDLE.test(handle)) return handle;
  const url = asUrl(text);
  if (!url || !hostIs(url, "instagram.com")) return null;
  const [first, ...rest] = url.pathname.split("/").filter(Boolean);
  return first && rest.length === 0 && INSTAGRAM_HANDLE.test(first) ? first : null;
}

/** "@name", "name", a t.me / telegram.me link or an invite link → https://t.me/<name>. */
export function normalizeTelegram(text: string): string | null {
  const name = text.startsWith("@") ? text.slice(1) : text;
  if (TELEGRAM_USERNAME.test(name)) return `https://t.me/${name}`;
  const url = asUrl(text);
  if (!url || !hostIs(url, "t.me", "telegram.me")) return null;
  const [first, ...rest] = url.pathname.split("/").filter(Boolean);
  if (!first || rest.length > 0) return null;
  return TELEGRAM_USERNAME.test(first) || TELEGRAM_INVITE.test(first) ? `https://t.me/${first}` : null;
}

/** A phone number, a viber://chat link or a community invite link → the chat link. */
export function normalizeViber(text: string): string | null {
  const digits = internationalDigits(text);
  if (digits) return `viber://chat?number=%2B${digits}`;
  const url = asUrl(text);
  if (!url) return null;
  if (url.protocol === "viber:") {
    // a raw "+" in the query reads as a space
    const number = url.searchParams.get("number")?.trim();
    const numberDigits = number ? internationalDigits(number) : null;
    return url.host === "chat" && numberDigits ? `viber://chat?number=%2B${numberDigits}` : null;
  }
  if (hostIs(url, "invite.viber.com")) {
    const code = url.searchParams.get("g2");
    return code && /^[A-Za-z0-9_-]{1,100}$/.test(code) ? `https://invite.viber.com/?g2=${code}` : null;
  }
  return null;
}

/** A phone number, a wa.me / api.whatsapp.com link or a group invite link → the chat link. */
export function normalizeWhatsApp(text: string): string | null {
  const digits = internationalDigits(text);
  if (digits) return `https://wa.me/${digits}`;
  const url = asUrl(text);
  if (!url) return null;
  const path = url.pathname.split("/").filter(Boolean);
  if (hostIs(url, "wa.me") && path.length === 1) {
    const number = internationalDigits(path[0]);
    return number ? `https://wa.me/${number}` : null;
  }
  if (hostIs(url, "api.whatsapp.com", "whatsapp.com") && path[0] === "send") {
    const phone = url.searchParams.get("phone");
    const number = phone ? internationalDigits(phone) : null;
    return number ? `https://wa.me/${number}` : null;
  }
  if (hostIs(url, "chat.whatsapp.com") && path.length === 1 && /^[A-Za-z0-9]{10,40}$/.test(path[0])) {
    return `https://chat.whatsapp.com/${path[0]}`;
  }
  return null;
}

/** A phone number as the owner writes it (spaces, brackets, dashes kept, runs of spaces collapsed). */
export function normalizePhone(text: string): string | null {
  const phone = text.replace(/\s+/g, " ");
  if (!/^\+?[0-9][0-9 ()-]{5,22}[0-9]$/.test(phone)) return null;
  return internationalDigits(phone) ? phone : null;
}

export function normalizeEmail(text: string): string | null {
  return text.length <= EMAIL_MAX_LENGTH && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(text) ? text : null;
}

/** A Bot API chat id: a user (positive) or a group / channel (negative, "-100…"). */
export function normalizeChatId(text: string): string | null {
  return /^-?[0-9]{1,20}$/.test(text) ? text : null;
}

export type ParsedContacts = { ok: true; row: ShopSettingsRow } | { ok: false; fields: ContactFieldErrors };

const NORMALIZERS: Record<Exclude<ContactField, "shopName">, (text: string) => string | null> = {
  instagram: normalizeInstagram,
  email: normalizeEmail,
  phone: normalizePhone,
  telegram: normalizeTelegram,
  viber: normalizeViber,
  whatsapp: normalizeWhatsApp,
  telegramChatId: normalizeChatId,
};

/** Validates and normalizes the form; an empty field clears its channel. */
export function parseContactsForm(values: Partial<Record<string, string>>): ParsedContacts {
  const fields: ContactFieldErrors = {};
  const normalized: Partial<Record<ContactField, string | null>> = {};

  for (const field of CONTACT_FIELDS) {
    const text = (values[field] ?? "").trim();
    if (text === "") {
      normalized[field] = null;
      continue;
    }
    const max = field === "shopName" ? SHOP_NAME_MAX_LENGTH : CONTACT_INPUT_MAX_LENGTH;
    if (text.length > max) {
      fields[field] = "tooLong";
      continue;
    }
    const value = field === "shopName" ? text.replace(/\s+/g, " ") : NORMALIZERS[field](text);
    if (value === null) fields[field] = "invalid";
    else normalized[field] = value;
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return {
    ok: true,
    row: {
      shop_name: normalized.shopName ?? null,
      instagram_handle: normalized.instagram ?? null,
      email: normalized.email ?? null,
      phone: normalized.phone ?? null,
      telegram_url: normalized.telegram ?? null,
      viber_url: normalized.viber ?? null,
      whatsapp_url: normalized.whatsapp ?? null,
      telegram_chat_id: normalized.telegramChatId ?? null,
    },
  };
}

// Storefront --------------------------------------------------------------------------------------------------

export type ContactChannel =
  | { kind: "phone"; href: string; text: string }
  | { kind: "instagram"; href: string; text: string }
  | { kind: "telegram"; href: string }
  | { kind: "viber"; href: string }
  | { kind: "whatsapp"; href: string }
  | { kind: "email"; href: string; text: string };

export type ContactKind = ContactChannel["kind"];

/** The shop's name and channels for the footer, the order confirmation (#24) and the emails (#26). */
export type ShopContacts = { shopName: string | null; channels: ContactChannel[] };

/** The configured channels in display order (the legacy footer: phone, Instagram, email; chats between). */
export function shopContacts(row: PublicShopSettings): ShopContacts {
  const channels: ContactChannel[] = [];
  if (row.phone) channels.push({ kind: "phone", href: `tel:${row.phone.startsWith("+") ? "+" : ""}${row.phone.replace(/\D/g, "")}`, text: row.phone });
  if (row.instagram_handle) {
    channels.push({
      kind: "instagram",
      href: `https://www.instagram.com/${row.instagram_handle}/`,
      text: `@${row.instagram_handle}`,
    });
  }
  if (row.telegram_url) channels.push({ kind: "telegram", href: row.telegram_url });
  if (row.viber_url) channels.push({ kind: "viber", href: row.viber_url });
  if (row.whatsapp_url) channels.push({ kind: "whatsapp", href: row.whatsapp_url });
  if (row.email) channels.push({ kind: "email", href: `mailto:${row.email}`, text: row.email });
  return { shopName: row.shop_name, channels };
}

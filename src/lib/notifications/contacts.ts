// The shop's contact channels for the customer's emails (D19). They come from the admin settings of #21
// (getShopContacts in src/lib/settings/cache.ts, same shape); until those land there are none, and every email
// shows the visible TBD line instead.

export type ContactChannel =
  | { kind: "phone"; href: string; text: string }
  | { kind: "instagram"; href: string; text: string }
  | { kind: "telegram"; href: string }
  | { kind: "viber"; href: string }
  | { kind: "whatsapp"; href: string }
  | { kind: "email"; href: string; text: string };

export type ShopContacts = { shopName: string | null; channels: ContactChannel[] };

/** The shop's channels, or null when there are none to read (the emails render their TBD line). */
export async function readShopContacts(): Promise<ShopContacts | null> {
  return null;
}

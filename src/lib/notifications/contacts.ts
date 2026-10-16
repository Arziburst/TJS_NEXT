import "server-only";

import { shopContacts, type ShopContacts } from "@/lib/settings/contacts";
import { readPublicShopSettings } from "@/lib/settings/store";

// The shop's contact channels for the customer's emails (D19), from the admin settings (#21): the same shape as
// getShopContacts in src/lib/settings/cache.ts, read fresh when an email is rendered.

export type { ContactChannel, ShopContacts } from "@/lib/settings/contacts";

/** The shop's channels, or null when none is set or they cannot be read (the emails render their TBD line). */
export async function readShopContacts(): Promise<ShopContacts | null> {
  try {
    const contacts = shopContacts(await readPublicShopSettings());
    return contacts.channels.length > 0 ? contacts : null;
  } catch {
    return null;
  }
}

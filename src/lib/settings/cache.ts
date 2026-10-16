import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { FAILED_READ_LIFE } from "@/lib/failed-read";
import type { AboutContent } from "./about";
import { shopContacts, type ShopContacts } from "./contacts";
import { readPublicAbout, readPublicShopSettings } from "./store";

// Expired by the admin's settings actions (updateTag), so a change shows on the next request
export const SHOP_SETTINGS_TAG = "shop-settings";
export const ABOUT_TAG = "about";

/**
 * The shop's name and contact channels (D19) for the footer, the order confirmation (#24) and the emails
 * (#26). Shared by every visitor; null when the settings cannot be read (the footer then keeps its TBD line).
 */
export async function getShopContacts(): Promise<ShopContacts | null> {
  "use cache";
  cacheTag(SHOP_SETTINGS_TAG);
  try {
    const contacts = shopContacts(await readPublicShopSettings());
    // part of every route's shell (the footer): no stale window, see daysNoSwr in next.config.ts
    cacheLife("daysNoSwr");
    return contacts;
  } catch (error) {
    console.error("settings: shop settings unavailable", error);
    // read again by the next request, never baked into a prerender
    cacheLife(FAILED_READ_LIFE);
    return null;
  }
}

/** The published About page (every locale's text) for the storefront; null when it cannot be read. */
export async function getAboutContent(): Promise<AboutContent | null> {
  "use cache";
  cacheTag(ABOUT_TAG);
  try {
    const content = await readPublicAbout();
    cacheLife("daysNoSwr");
    return content;
  } catch (error) {
    console.error("settings: about page unavailable", error);
    cacheLife(FAILED_READ_LIFE);
    return null;
  }
}

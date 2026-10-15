import "server-only";

import { PRODUCT_IMAGES_BUCKET } from "@/lib/catalog";
import { isLocale, localesFor, pickByLocale, usdTextToMinor } from "@/lib/catalog/mappers";
import type { ProductAvailability, ProductFulfillment } from "@/lib/catalog/types";
import type { Locale } from "@/i18n/routing";
import { createPublicServerClient } from "@/lib/supabase/server";

/** What the cart shows of a product: read fresh on every render, never from the client and never cached. */
export type CartProduct = {
  id: string;
  fulfillment: ProductFulfillment;
  availability: ProductAvailability;
  leadTimeDays: number | null;
  priceUsdMinor: number;
  slug: string;
  title: string;
  /** The locale of `slug` and `title`: the requested one, or the fallback. */
  locale: Locale;
  image: { url: string; width: number; height: number; blurDataUrl: string | null } | null;
};

export type CartProductsResult = { ok: true; products: Map<string, CartProduct> } | { ok: false };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The published products among `ids`, as the anonymous public sees them: RLS hides drafts, archived and
 * soft-deleted products (also from a signed-in admin), so a missing id is a piece that can no longer be
 * ordered. Sold and reserved pieces are returned with their availability.
 */
export async function getCartProducts(ids: readonly string[], locale: Locale): Promise<CartProductsResult> {
  const unique = [...new Set(ids)].filter((id) => UUID.test(id));
  if (!isLocale(locale)) return { ok: false };
  if (unique.length === 0) return { ok: true, products: new Map() };
  try {
    const client = createPublicServerClient();
    const { data, error } = await client
      .from("products")
      .select(
        `id, fulfillment, availability, lead_time_days, price_usd_text:price_usd::text,
         product_translations!inner(locale, slug, title),
         product_images(storage_path, position, width, height, blur_data_url)`,
      )
      .in("id", unique)
      .eq("status", "published")
      .in("product_translations.locale", localesFor(locale))
      .order("position", { referencedTable: "product_images" })
      .limit(1, { referencedTable: "product_images" });
    if (error) return { ok: false };

    const products = new Map<string, CartProduct>();
    for (const row of data) {
      const translation = pickByLocale(row.product_translations, locale);
      const priceUsdMinor = usdTextToMinor(row.price_usd_text);
      if (!translation || !isLocale(translation.locale) || priceUsdMinor === null) continue;
      const photo = row.product_images[0];
      products.set(row.id, {
        id: row.id,
        fulfillment: row.fulfillment,
        availability: row.availability,
        leadTimeDays: row.lead_time_days,
        priceUsdMinor,
        slug: translation.slug,
        title: translation.title,
        locale: translation.locale,
        image: photo
          ? {
              url: client.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(photo.storage_path).data.publicUrl,
              width: photo.width,
              height: photo.height,
              blurDataUrl: photo.blur_data_url,
            }
          : null,
      });
    }
    return { ok: true, products };
  } catch {
    return { ok: false };
  }
}

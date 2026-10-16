import "server-only";

import { PRODUCT_IMAGES_BUCKET } from "@/lib/catalog";
import { isLocale, localesFor, pickByLocale, salesOf, usdTextToMinor } from "@/lib/catalog/mappers";
import { offerFor } from "@/lib/catalog/sale";
import type { LeadTime, ListPrice, PriceOffer, ProductAvailability, ProductFulfillment, ProductVariant } from "@/lib/catalog/types";
import { listPriceOf, mapVariants } from "@/lib/catalog/variants";
import type { Locale } from "@/i18n/routing";
import { createPublicServerClient } from "@/lib/supabase/server";

/** What the cart shows of a product: read fresh on every render, never from the client and never cached. */
export type CartProduct = {
  id: string;
  fulfillment: ProductFulfillment;
  availability: ProductAvailability;
  /** Made-to-order work only: how many days making it takes. */
  leadTime: LeadTime | null;
  /** The product's own regular price; a line of a variant costs the variant's price. */
  priceUsdMinor: number;
  /** The product's own price as the shopper pays it now (a running sale, #67). */
  offer: PriceOffer;
  /** The live variants, in the owner's order (#66); empty for a product without variants. */
  variants: ProductVariant[];
  /** What a product strip shows (favorites, recently viewed): the lowest variant price, else `priceUsdMinor`. */
  listPrice: ListPrice;
  /** products.weight_g: the parcel's weight at checkout (D37). */
  weightGrams: number;
  sku: string | null;
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
        `id, sku, fulfillment, availability, weight_g, lead_time_min_days, lead_time_max_days, price_usd_text:price_usd::text,
         product_translations!inner(locale, slug, title),
         product_images(storage_path, position, width, height, blur_data_url),
         product_variants(id, position, sku_suffix, price_delta_usd_minor, is_available, product_variant_translations(locale, label)),
         product_sales(percent_off, price_usd_minor, starts_at, ends_at),
         collection_products(collections(collection_sales(percent_off, starts_at, ends_at)))`,
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
      // the sales running now: the cart and the order request are priced at the moment they are read (#67)
      const now = Date.now();
      const sales = salesOf(row);
      const offer = offerFor(priceUsdMinor, 0, sales, now);
      const variants = row.fulfillment === "made_to_order" ? mapVariants(row.product_variants, priceUsdMinor, locale, sales, now) : [];
      products.set(row.id, {
        id: row.id,
        fulfillment: row.fulfillment,
        availability: row.availability,
        leadTime:
          row.lead_time_min_days !== null && row.lead_time_max_days !== null
            ? { minDays: row.lead_time_min_days, maxDays: row.lead_time_max_days }
            : null,
        priceUsdMinor,
        offer,
        variants,
        listPrice: listPriceOf(offer, variants),
        weightGrams: Number(row.weight_g),
        sku: row.sku,
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

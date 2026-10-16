import { defaultLocale, locales, type Locale } from "@/i18n/routing";
import type { ListPrice, ProductVariant } from "./types";

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

// Product variants (#66): pure mapping, shared by the catalog, the cart and their tests. The database keeps a
// variant's price as a difference to the product's price (supabase/migrations/…_product_variants.sql).

export type VariantLabelRow = { locale: string; label: string };

export type VariantRow = {
  id: string;
  position: number;
  sku_suffix: string | null;
  price_delta_usd_minor: number;
  is_available: boolean;
  product_variant_translations: VariantLabelRow[];
};

/**
 * A variant's label in the requested locale, else the fallback locale's, else the Ukrainian one the admin enters
 * first, else any: a size like "17" reads the same in every language, so a variant is never left without a name.
 */
export function pickVariantLabel(rows: readonly VariantLabelRow[], locale: Locale): (VariantLabelRow & { locale: Locale }) | null {
  // defaultLocale is the catalog's fallback locale (mappers.ts)
  const order = [locale, defaultLocale, "uk"];
  const picked = order.map((l) => rows.find((r) => r.locale === l)).find((r) => r !== undefined) ?? rows[0];
  return picked && isLocale(picked.locale) ? { ...picked, locale: picked.locale } : null;
}

/** The product's variants in the owner's order; one without a label or a price above zero is left out. */
export function mapVariants(rows: readonly VariantRow[], productPriceUsdMinor: number, locale: Locale): ProductVariant[] {
  return [...rows]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .flatMap((row): ProductVariant[] => {
      const label = pickVariantLabel(row.product_variant_translations, locale);
      const priceUsdMinor = productPriceUsdMinor + row.price_delta_usd_minor;
      if (!label || !Number.isSafeInteger(priceUsdMinor) || priceUsdMinor <= 0) return [];
      return [
        {
          id: row.id,
          label: label.label,
          labelLocale: label.locale,
          skuSuffix: row.sku_suffix,
          priceUsdMinor,
          available: row.is_available,
        },
      ];
    });
}

/**
 * The price a listing shows (the same rule as private.listing_price_usd, which filters and sorts the listing): the
 * lowest price of the variants that can be ordered, else of all variants, else the product's own price; "from …"
 * when those variants do not all cost the same.
 */
export function listPriceOf(productPriceUsdMinor: number, variants: readonly ProductVariant[]): ListPrice {
  const orderable = variants.filter((v) => v.available);
  const counted = orderable.length > 0 ? orderable : variants;
  if (counted.length === 0) return { usdMinor: productPriceUsdMinor, from: false };
  const prices = counted.map((v) => v.priceUsdMinor);
  return { usdMinor: Math.min(...prices), from: new Set(prices).size > 1 };
}

/** The SKU of an ordered variant: the product's SKU and the variant's suffix (as create_order_request stores it). */
export function variantSku(productSku: string | null, skuSuffix: string | null): string | null {
  return productSku !== null && skuSuffix !== null ? `${productSku}-${skuSuffix}` : productSku;
}

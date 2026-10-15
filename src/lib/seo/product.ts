import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { locales, type Locale } from "@/i18n/routing";
import type { ProductAvailability, ProductFulfillment, ProductTranslation } from "@/lib/catalog/types";
import { fallbackLocale } from "@/lib/catalog/mappers";
import type { TranslationSlug } from "@/lib/catalog/product-path";

export function productPath(locale: Locale, slug: string): string {
  return getPathname({ href: `/product/${slug}`, locale });
}

/**
 * canonical + hreflang of a product page: hreflang only for the locales the product is translated into,
 * x-default on the fallback locale's page. The canonical is the page of the translation `shown`: a page
 * showing fallback content (no translation in its own locale) is canonicalized to the fallback locale's.
 */
export function productAlternates(
  translations: readonly TranslationSlug[],
  shown: Pick<ProductTranslation, "locale" | "slug">,
): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {};
  for (const alternate of locales) {
    const translation = translations.find((t) => t.locale === alternate);
    if (translation) languages[alternate] = productPath(alternate, translation.slug);
  }
  if (languages[fallbackLocale]) languages["x-default"] = languages[fallbackLocale];

  return { canonical: productPath(shown.locale, shown.slug), languages };
}

// Open Graph names a locale as language_TERRITORY: each language in the territory of its main market (D2, D5)
const OG_LOCALES: Record<Locale, string> = {
  uk: "uk_UA",
  en: "en_US",
  de: "de_DE",
  fr: "fr_FR",
  es: "es_ES",
  it: "it_IT",
  pl: "pl_PL",
  nl: "nl_NL",
  cs: "cs_CZ",
  pt: "pt_PT",
  ro: "ro_RO",
};

/** og:locale of the content shown and og:locale:alternate of the product's other translations. */
export function productOpenGraphLocales(
  translations: readonly TranslationSlug[],
  shownLocale: Locale,
): { locale: string; alternateLocale: string[] } {
  const alternateLocale = locales
    .filter((l) => l !== shownLocale && translations.some((t) => t.locale === l))
    .map((l) => OG_LOCALES[l]);
  return { locale: OG_LOCALES[shownLocale], alternateLocale };
}

const SCHEMA = "https://schema.org";

/**
 * schema.org availability: made-to-order work can always be ordered; a one-of-a-kind piece is in stock,
 * reserved by an open order, or sold.
 */
export function schemaAvailability(fulfillment: ProductFulfillment, availability: ProductAvailability): string {
  if (fulfillment === "made_to_order") return `${SCHEMA}/MadeToOrder`;
  const byAvailability = { available: "InStock", reserved: "Reserved", sold: "SoldOut" } as const;
  return `${SCHEMA}/${byAvailability[availability]}`;
}

export type JsonLdPrice = { price: string; priceCurrency: string };

export type ProductJsonLdInput = {
  /** Absolute URL of the page (its canonical). */
  url: string;
  name: string;
  description: string | null;
  /** Absolute image URLs, in gallery order. */
  images: readonly string[];
  sku: string | null;
  brand: string;
  fulfillment: ProductFulfillment;
  availability: ProductAvailability;
  /** One currency per URL: the locale's default currency (D5); null when no rate is available. */
  price: JsonLdPrice | null;
  /** From the home page down to the product itself, with absolute URLs. */
  breadcrumbs: readonly { name: string; url: string }[];
};

/** The Product (with its Offer) and BreadcrumbList nodes of a product page. */
export function productJsonLd(input: ProductJsonLdInput): Record<string, unknown> {
  const product: Record<string, unknown> = {
    "@type": "Product",
    "@id": `${input.url}#product`,
    name: input.name,
    url: input.url,
    brand: { "@type": "Brand", name: input.brand },
  };
  if (input.description) product.description = input.description;
  if (input.images.length > 0) product.image = [...input.images];
  if (input.sku) product.sku = input.sku;
  // an Offer without a price is invalid for rich results; the page then states no offer at all
  if (input.price) {
    product.offers = {
      "@type": "Offer",
      url: input.url,
      price: input.price.price,
      priceCurrency: input.price.priceCurrency,
      availability: schemaAvailability(input.fulfillment, input.availability),
      itemCondition: `${SCHEMA}/NewCondition`,
    };
  }

  const breadcrumbs = {
    "@type": "BreadcrumbList",
    itemListElement: input.breadcrumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };

  return { "@context": SCHEMA, "@graph": [product, breadcrumbs] };
}

/** JSON for a <script type="application/ld+json">: `<` escaped so no text can close the script element. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

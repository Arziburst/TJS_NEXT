import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { getProductPage } from "@/lib/catalog/product";
import type { ListPrice } from "@/lib/catalog/types";
import { getMoneyTables } from "@/lib/money/cache";
import { localeDefaultCurrency } from "@/lib/money/currencies";
import { formatMoney, priceIn } from "@/lib/money/format";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import { productPhoto, shareImage } from "@/lib/seo/og-image";

/*
 * The share image of a product: its main photo, its title and its price in the locale's default currency (D5:
 * the same for every visitor and crawler, like the JSON-LD offer). Without a photo or a rate it leaves them
 * out; for a slug that is no product page it is the shop's plain image.
 */

type Params = { locale: string; slug: string };

function localeOf(params: Params): Locale {
  return hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;
}

export async function generateImageMetadata({ params }: { params: Params }) {
  const page = await getProductPage(localeOf(params), params.slug);
  const alt = page.kind === "ok" ? page.product.translation.title : (await getTranslations({ locale: localeOf(params), namespace: "common" }))("brand");
  return [{ id: "share", alt, size: OG_IMAGE_SIZE, contentType: "image/png" }];
}

// the price the shop's cards show: the lowest variant's, "from …" when the sizes differ in price (#66)
async function priceText({ usdMinor, from }: ListPrice, locale: Locale): Promise<string | null> {
  const [tables, t] = await Promise.all([getMoneyTables(), getTranslations({ locale, namespace: "common.price" })]);
  const money = tables && priceIn(usdMinor, localeDefaultCurrency[locale], tables);
  if (!money) return null;
  const text = formatMoney(money, locale);
  return from ? t("from", { price: text }) : text;
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const resolved = await params;
  const locale = localeOf(resolved);
  const [page, tCommon] = await Promise.all([
    getProductPage(locale, resolved.slug),
    getTranslations({ locale, namespace: "common" }),
  ]);
  const brand = tCommon("brand");
  if (page.kind !== "ok") return shareImage({ brand, title: brand, art: null });

  const { product } = page;
  const mainPhoto = product.images[0];
  const [price, photo] = await Promise.all([
    priceText(product.listPrice, locale),
    mainPhoto ? productPhoto(mainPhoto.url) : null,
  ]);
  return shareImage({
    brand,
    title: product.translation.title,
    price,
    art: photo ? { kind: "bleed", photo } : null,
  });
}

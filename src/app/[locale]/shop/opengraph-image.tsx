import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import { allCategoriesArt, shareImage } from "@/lib/seo/og-image";

// The share image of the listing: a page that sets its own Open Graph no longer inherits the home page's image.

type Params = { locale: string };

function localeOf(params: Params): Locale {
  return hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;
}

export async function generateImageMetadata({ params }: { params: Params }) {
  const t = await getTranslations({ locale: localeOf(params), namespace: "catalog.meta" });
  return [{ id: "share", alt: t("title"), size: OG_IMAGE_SIZE, contentType: "image/png" }];
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const locale = localeOf(await params);
  const [t, tCommon, art] = await Promise.all([
    getTranslations({ locale, namespace: "catalog.meta" }),
    getTranslations({ locale, namespace: "common" }),
    allCategoriesArt(),
  ]);
  return shareImage({ brand: tCommon("brand"), title: t("title"), art });
}

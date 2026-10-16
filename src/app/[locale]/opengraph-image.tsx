import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import { allCategoriesArt, shareImage } from "@/lib/seo/og-image";

// The share image of the home page, and of every page under it that has none of its own (search …).

type Params = { locale: string };

function localeOf(params: Params): Locale {
  return hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;
}

export async function generateImageMetadata({ params }: { params: Params }) {
  const t = await getTranslations({ locale: localeOf(params), namespace: "home" });
  return [{ id: "share", alt: t("meta.title"), size: OG_IMAGE_SIZE, contentType: "image/png" }];
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const locale = localeOf(await params);
  const [t, tCommon, art] = await Promise.all([
    getTranslations({ locale, namespace: "home" }),
    getTranslations({ locale, namespace: "common" }),
    allCategoriesArt(),
  ]);
  return shareImage({ brand: tCommon("brand"), title: t("meta.title"), art });
}

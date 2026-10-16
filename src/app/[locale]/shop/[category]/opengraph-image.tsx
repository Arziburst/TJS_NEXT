import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { isCategorySlug, type CategorySlug } from "@/lib/catalog/categories";
import { OG_IMAGE_SIZE } from "@/lib/seo/open-graph";
import { categoryPhoto, shareImage } from "@/lib/seo/og-image";

// The share image of a category: its name over its own photo (static: names from the messages).

type Params = { locale: string; category: string };

function read(params: Params): { locale: Locale; category: CategorySlug | null } {
  const locale = hasLocale(routing.locales, params.locale) ? params.locale : routing.defaultLocale;
  return { locale, category: isCategorySlug(params.category) ? params.category : null };
}

export async function generateImageMetadata({ params }: { params: Params }) {
  const { locale, category } = read(params);
  const t = await getTranslations({ locale, namespace: "catalog" });
  const alt = category ? t(`categories.${category}`) : t("title");
  return [{ id: "share", alt, size: OG_IMAGE_SIZE, contentType: "image/png" }];
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { locale, category } = read(await params);
  const [t, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "catalog" }),
    getTranslations({ locale, namespace: "common" }),
  ]);
  if (!category) return shareImage({ brand: tCommon("brand"), title: t("title"), art: null });
  const name = t(`categories.${category}`);
  return shareImage({
    brand: tCommon("brand"),
    title: name,
    subtitle: t("meta.categoryDescription", { category: name }),
    // the category photos are small (200–300 px): drawn as a tile, never stretched over the whole side
    art: { kind: "grid", photos: [await categoryPhoto(category, 380)], cell: 380 },
  });
}

import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { getCategoryEntries } from "@/components/catalog/category-entries";
import { SEE_ALL_IMAGE, STATIC_BLUR } from "@/components/catalog/category-images";
import { CategoryTiles } from "@/components/catalog/category-tiles";
import { SHOP_HREF } from "@/components/catalog/links";
import { JsonLd } from "@/components/seo/json-ld";
import { getAlternates, getMetadataBase } from "@/i18n/metadata";
import { getPathname, Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { organizationContacts, siteJsonLd } from "@/lib/seo/organization";
import { getShopContacts } from "@/lib/settings/cache";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tCommon, locale] = await Promise.all([getTranslations("home"), getTranslations("common"), getLocale()]);
  return {
    title: { absolute: t("meta.title") },
    description: t("meta.description"),
    alternates: getAlternates("/", locale),
    openGraph: pageOpenGraph({
      locale: locale as Locale,
      url: getPathname({ href: "/", locale }),
      title: t("meta.title"),
      description: t("meta.description"),
      siteName: tCommon("brand"),
    }),
  };
}

export default async function HomePage() {
  const [t, tCommon, locale] = await Promise.all([getTranslations("home"), getTranslations("common"), getLocale()]);
  // static: the category names come from the messages, so the whole page is prerendered
  const categories = await getCategoryEntries(locale as Locale);

  return (
    <main className="page-container flex flex-1 flex-col gap-10 overflow-x-clip py-8 sb:gap-14 sb:py-12">
      {/* its own boundary: the contacts are a cached read that, when it fails, is read again per request */}
      <Suspense fallback={null}>
        <SiteJsonLd locale={locale as Locale} name={tCommon("brand")} description={t("meta.description")} />
      </Suspense>
      <h1 className="sr-only">{t("meta.title")}</h1>
      <CategoryTiles categories={categories} />
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <p className="max-w-3xl font-sans text-sm leading-[180%] uppercase md:text-2xl">
          <span className="text-accent-text">{t("introBrand")}</span> {t("intro")}
        </p>
        <Link href={SHOP_HREF} className="group flex shrink-0 items-end gap-4 self-end">
          <span className="move-underline font-sans text-sm font-semibold tracking-[1.6px] uppercase">{t("seeAll")}</span>
          <Image
            src={SEE_ALL_IMAGE}
            alt=""
            width={100}
            height={81}
            placeholder={STATIC_BLUR}
            className="rounded transition duration-500 group-hover:brightness-110"
          />
        </Link>
      </div>
    </main>
  );
}

/** The Organization and WebSite structured data, with the shop's contacts from the admin settings (#21). */
async function SiteJsonLd({ locale, name, description }: { locale: Locale; name: string; description: string }) {
  const contacts = organizationContacts(await getShopContacts());
  return <JsonLd data={siteJsonLd({ base: getMetadataBase(), locale, name, description, contacts })} />;
}

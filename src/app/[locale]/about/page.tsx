import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RichText } from "@/components/layout/rich-text";
import { routes } from "@/config/routes";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { aboutView, indexedAboutLocales } from "@/lib/settings/about";
import { getAboutContent } from "@/lib/settings/cache";
import { richTextToPlain } from "@/lib/settings/rich-text";

// a search result shows about this much of a description
const DESCRIPTION_LENGTH = 160;

async function readLocale(params: PageProps<"/[locale]/about">["params"]) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}

function excerpt(html: string): string {
  const text = richTextToPlain(html);
  return text.length <= DESCRIPTION_LENGTH ? text : `${text.slice(0, DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}

/*
 * hreflang lists only the locales with their own reviewed text (x-default: en, else uk); a page that shows
 * another locale's text, or the TBD note, is not indexed.
 */
export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const locale = await readLocale(params);
  const [t, content] = await Promise.all([getTranslations("common.about"), getAboutContent()]);
  const view = aboutView(content, locale);
  const path = (l: typeof locale) => getPathname({ href: routes.aboutUs.path, locale: l });

  const languages: Record<string, string> = {};
  for (const indexed of indexedAboutLocales(content)) languages[indexed] = path(indexed);
  const xDefault = languages.en ?? languages.uk;
  if (xDefault) languages["x-default"] = xDefault;

  return {
    title: t("title"),
    description: view ? (view.translation.metaDescription ?? excerpt(view.translation.bodyHtml)) : undefined,
    alternates: { canonical: path(locale), languages },
    robots: view?.indexable ? undefined : { index: false, follow: true },
  };
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const t = await getTranslations("common.about");
  return (
    <main className="page-container flex flex-col gap-6 py-6 sb:gap-10 sb:py-10">
      <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("title")}</h1>
      <Suspense fallback={<AboutSkeleton />}>
        <AboutText params={params} />
      </Suspense>
    </main>
  );
}

async function AboutText({ params }: { params: PageProps<"/[locale]/about">["params"] }) {
  const locale = await readLocale(params);
  const [t, content] = await Promise.all([getTranslations("common.about"), getAboutContent()]);
  const view = aboutView(content, locale);

  // the owner writes the text; until it is published, a visible TBD
  if (!view) return <p className="font-input text-base">{t("tbd")}</p>;

  return (
    <div className="grid max-w-prose gap-4">
      {view.isFallback && <p className="font-input text-sm">{t("fallbackNote")}</p>}
      <RichText html={view.translation.bodyHtml} lang={view.isFallback ? view.translation.locale : undefined} />
    </div>
  );
}

function AboutSkeleton() {
  return (
    <div aria-hidden className="grid max-w-prose gap-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-5 animate-pulse bg-hairline" />
      ))}
    </div>
  );
}

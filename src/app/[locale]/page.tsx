import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { getAlternates } from "@/i18n/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  return {
    title: { absolute: t("meta.title") },
    description: t("meta.description"),
    alternates: getAlternates("/", locale),
  };
}

export default async function HomePage() {
  const [t, tCommon] = await Promise.all([getTranslations("home"), getTranslations("common")]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">{tCommon("brand")}</h1>
      <p className="text-muted-foreground max-w-prose text-base sm:text-lg">{t("placeholder.text")}</p>
      <Button variant="outline" disabled>
        {t("placeholder.comingSoon")}
      </Button>
    </main>
  );
}

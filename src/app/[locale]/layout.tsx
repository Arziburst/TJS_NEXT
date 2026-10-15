import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { SiteShell } from "@/components/layout/site-shell";
import { getMetadataBase } from "@/i18n/metadata";
import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common");
  return {
    metadataBase: getMetadataBase(),
    title: { default: t("brand"), template: `%s | ${t("brand")}` },
  };
}

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const locale = await rootLocale();
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();

  return (
    <html lang={locale} className={cn("h-full antialiased", fontVariables)}>
      <body className="flex min-h-full flex-col">
        {/* client components only get the namespaces they use */}
        <NextIntlClientProvider
          messages={{ nav: messages.nav, common: { brand: messages.common.brand, actions: messages.common.actions } }}
        >
          <SiteShell>{children}</SiteShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import { SiteShell } from "./site-shell";
import { VercelInsights } from "./vercel-insights";

// The <html> document of every localized page: the [locale] layout and the global 404 share it.
export async function LocaleDocument({ locale, children }: { locale: Locale; children: ReactNode }) {
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
        <VercelInsights />
      </body>
    </html>
  );
}

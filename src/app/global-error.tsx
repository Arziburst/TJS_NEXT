"use client";

import { hasLocale, NextIntlClientProvider } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { loadBoundaryMessages, type BoundaryMessages } from "@/components/errors/boundary-messages";
import type { ErrorBoundaryProps } from "@/components/errors/error-view";
import { routing, type Locale } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

type Loaded = { locale: Locale; messages: BoundaryMessages; ErrorView: ComponentType<ErrorBoundaryProps> };

/*
 * The error page when the root layout itself fails (#112), e.g. its header: it replaces the whole document, so
 * it brings its own <html>, styles, fonts and texts. The locale comes from the URL's first segment. Every page
 * loads this component, so its view and texts load only when it shows (#105, boundary-messages.ts).
 */
export default function GlobalError(props: ErrorBoundaryProps) {
  const segment = usePathname()?.split("/")[1];
  const locale = hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let current = true;
    void Promise.all([loadBoundaryMessages(locale), import("@/components/errors/error-view")]).then(([messages, view]) => {
      if (current) setLoaded({ locale, messages, ErrorView: view.ErrorView });
    });
    return () => {
      current = false;
    };
  }, [locale]);

  return (
    <html lang={locale} className={`h-full antialiased ${fontVariables}`}>
      <body className="flex min-h-full flex-col">
        {loaded?.locale === locale && (
          <>
            <title>{loaded.messages.title}</title>
            <NextIntlClientProvider locale={locale} messages={{ errors: { boundary: loaded.messages } }}>
              <loaded.ErrorView {...props} />
            </NextIntlClientProvider>
          </>
        )}
      </body>
    </html>
  );
}

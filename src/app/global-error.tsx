"use client";

import { hasLocale, NextIntlClientProvider } from "next-intl";
import { usePathname } from "next/navigation";
import { boundaryMessages } from "@/components/errors/boundary-messages";
import { ErrorView, type ErrorBoundaryProps } from "@/components/errors/error-view";
import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { cn } from "@/lib/utils";
import "./globals.css";

/*
 * The error page when the root layout itself fails (#112), e.g. its header: it replaces the whole document, so
 * it brings its own <html>, styles, fonts and texts. The locale comes from the URL's first segment.
 */
export default function GlobalError(props: ErrorBoundaryProps) {
  const segment = usePathname()?.split("/")[1];
  const locale = hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
  const messages = boundaryMessages[locale];

  return (
    <html lang={locale} className={cn("h-full antialiased", fontVariables)}>
      <body className="flex min-h-full flex-col">
        <title>{messages.title}</title>
        <NextIntlClientProvider locale={locale} messages={{ errors: { boundary: messages } }}>
          <ErrorView {...props} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

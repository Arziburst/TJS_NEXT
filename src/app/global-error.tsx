"use client";

import { hasLocale, NextIntlClientProvider } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { fallbackBoundaryMessages, loadBoundaryMessages, type BoundaryMessages } from "@/components/errors/boundary-messages";
import type { ErrorBoundaryProps } from "@/components/errors/error-view";
import { routing, type Locale } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

/*
 * The error page when the root layout itself fails (#112), e.g. its header: it replaces the whole document, so
 * it brings its own <html>, styles, fonts and texts. The locale comes from the URL's first segment. Every page
 * loads this component, so the full view and the locale's texts load only when it shows (#105,
 * boundary-messages.ts); until they do, and if they cannot, a plain page with a reload stands in.
 */
export default function GlobalError(props: ErrorBoundaryProps) {
  const pathname = usePathname();
  const segment = pathname?.split("/")[1];
  const locale = hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
  const [loaded, setLoaded] = useState<{ locale: Locale; messages: BoundaryMessages } | null>(null);
  const [View, setView] = useState<ComponentType<ErrorBoundaryProps> | null>(null);

  useEffect(() => {
    let current = true;
    void loadBoundaryMessages(locale).then((messages) => {
      if (current) setLoaded({ locale, messages });
    });
    return () => {
      current = false;
    };
  }, [locale]);

  useEffect(() => {
    // a failed chunk leaves the fallback, which reloads the page
    import("@/components/errors/error-view").then(
      (view) => setView(() => view.ErrorView),
      () => undefined,
    );
  }, []);

  const messages = loaded?.locale === locale ? loaded.messages : null;

  return (
    <html lang={locale} className={`h-full antialiased ${fontVariables}`}>
      <body className="flex min-h-full flex-col">
        <title>{(messages ?? fallbackBoundaryMessages).title}</title>
        {messages && View ? (
          <NextIntlClientProvider locale={locale} messages={{ errors: { boundary: messages } }}>
            <View {...props} />
          </NextIntlClientProvider>
        ) : (
          <ErrorFallback messages={messages ?? fallbackBoundaryMessages} locale={locale} path={pathname ?? `/${locale}`} />
        )}
      </body>
    </html>
  );
}

/**
 * The page before (or without) the full view: the texts it has, a reload and a link home, plain links that work
 * without any further code.
 */
function ErrorFallback({ messages, locale, path }: { messages: BoundaryMessages; locale: Locale; path: string }) {
  return (
    <main
      data-error-boundary=""
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-8"
    >
      <meta name="robots" content="noindex" />
      <h1 className="font-display text-4xl uppercase sb:text-5xl">{messages.title}</h1>
      <p className="text-muted-foreground">{messages.description}</p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <a href={path} className="min-h-11 border-2 border-primary bg-primary px-6 font-sans text-sm font-medium text-primary-foreground inline-flex items-center">
          {messages.retry}
        </a>
        <a href={`/${locale}`} className="underline underline-offset-4 hover:text-accent-text">
          {messages.home}
        </a>
      </div>
    </main>
  );
}

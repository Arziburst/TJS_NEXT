import type { Metadata } from "next";
import { createTranslator } from "next-intl";
import { defaultLocale } from "@/i18n/routing";
import errors from "../../messages/en/errors.json";
import "./globals.css";

// The root layout lives under [locale], so a request with an unknown locale has no layout to render
// into; this page answers it in the default locale.
const t = createTranslator({ locale: defaultLocale, messages: { errors }, namespace: "errors.notFound" });

export const metadata: Metadata = {
  title: t("title"),
};

export default function GlobalNotFound() {
  return (
    <html lang={defaultLocale} className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
          <a href={`/${defaultLocale}`} className="underline underline-offset-4">
            {t("home")}
          </a>
        </main>
      </body>
    </html>
  );
}

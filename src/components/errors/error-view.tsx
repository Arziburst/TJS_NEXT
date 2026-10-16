"use client";

import { useLocale, useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

/**
 * The error page of a failed segment (#112): a calm text, a retry that fetches and renders the segment again,
 * and a link home. The error's message never shows (in production a server error carries none, a client error
 * might carry anything); only the digest does, the reference the server's log keeps for support.
 */
export function ErrorView({ error, retry }: ErrorBoundaryProps) {
  const t = useTranslations("errors.boundary");
  const locale = useLocale();

  return (
    <main
      data-error-boundary=""
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-8"
    >
      {/* an error page is never indexed; React puts the tag in <head> */}
      <meta name="robots" content="noindex" />
      <h1 className="font-display text-4xl uppercase sb:text-5xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        {/* a plain button with the Button's look (#105): every page loads this view with its error boundaries */}
        <button type="button" data-slot="button" onClick={() => retry()} className={cn(buttonVariants())}>
          {t("retry")}
        </button>
        {/* a full load: it starts the app afresh, whatever failed */}
        <a href={`/${locale}`} className="underline underline-offset-4 hover:text-accent-text">
          {t("home")}
        </a>
      </div>
      {error.digest && (
        <p className="font-input text-xs text-muted-foreground select-all">{t("reference", { digest: error.digest })}</p>
      )}
    </main>
  );
}

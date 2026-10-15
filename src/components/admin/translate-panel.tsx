"use client";

import { CircleAlertIcon, LanguagesIcon, LoaderCircleIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { ReviewActionResult, TranslateActionResult } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/i18n/routing";
import { EDITOR_LOCALES } from "@/lib/admin/product-form";
import type { AdminTranslation } from "@/lib/admin/products";
import { labelClass, selectClass } from "./styles";

export type TranslatePanelProps = {
  productId: string;
  translations: AdminTranslation[];
  /** False when the server has no gateway credential: the panel explains instead of offering the action. */
  configured: boolean;
  /** The form has unsaved changes: translating (or reviewing) would re-read the saved texts over them. */
  dirty: boolean;
  translateProduct: (input: {
    id: string;
    sourceLocale: Locale;
    targets: Locale[];
    overwrite: boolean;
  }) => Promise<TranslateActionResult>;
  setTranslationReviewed: (input: { ids: [string]; locale: Locale; reviewed: boolean }) => Promise<ReviewActionResult>;
};

// the owner writes in uk, else en
function defaultSource(existing: readonly Locale[]): Locale | null {
  return (["uk", "en", ...EDITOR_LOCALES] as const).find((l) => existing.includes(l)) ?? null;
}

/**
 * The machine translation of a saved product: choose the source and the target languages (the missing ones
 * by default; existing ones only with "replace"), run it, see what came back; and the review switch of every
 * machine translation. Its controls have no `name`: they are not part of the product form's submission.
 */
export function TranslatePanel({
  productId,
  translations,
  configured,
  dirty,
  translateProduct,
  setTranslationReviewed,
}: TranslatePanelProps) {
  const t = useTranslations("admin.translate");
  const tLocales = useTranslations("nav.localeNames");
  const format = useFormatter();
  const existing = translations.map((tr) => tr.locale);
  const [source, setSource] = useState<Locale | null>(() => defaultSource(existing));
  const [overwrite, setOverwrite] = useState(false);
  // every locale is chosen until unticked; one with a text counts only with "replace" (so by default: the missing)
  const [chosen, setChosen] = useState<ReadonlySet<Locale>>(() => new Set(EDITOR_LOCALES));
  const [result, setResult] = useState<TranslateActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [reviewing, setReviewing] = useState<ReadonlySet<Locale>>(new Set());

  const names = (locales: readonly Locale[]) => format.list(locales.map((l) => tLocales(l)));
  const sourceLocale = source && existing.includes(source) ? source : defaultSource(existing);
  const targets = EDITOR_LOCALES.filter(
    (l) => l !== sourceLocale && chosen.has(l) && (overwrite || !existing.includes(l)),
  );
  const machine = translations.filter((tr) => tr.source === "machine");
  const blocked = !configured || dirty || pending || sourceLocale === null;

  function toggleTarget(locale: Locale, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(locale);
      else next.delete(locale);
      return next;
    });
  }

  async function run() {
    if (!sourceLocale || targets.length === 0) return;
    setResult(null);
    setPending(true);
    let outcome: TranslateActionResult;
    try {
      outcome = await translateProduct({ id: productId, sourceLocale, targets, overwrite });
    } catch {
      outcome = { ok: false, reason: "unexpectedError" };
    }
    setPending(false);
    setResult(outcome);
    if (outcome.ok) {
      // what failed is still missing, so it stays chosen for another try
      setOverwrite(false);
      toast.success(t("doneToast", { count: outcome.translated.length }));
    }
  }

  async function review(locale: Locale, reviewed: boolean) {
    setReviewing((current) => new Set(current).add(locale));
    const outcome = await setTranslationReviewed({ ids: [productId], locale, reviewed });
    setReviewing((current) => {
      const next = new Set(current);
      next.delete(locale);
      return next;
    });
    if (outcome.ok) toast.success(t(reviewed ? "review.markedToast" : "review.unmarkedToast", { language: tLocales(locale) }));
    else toast.error(t(`errors.${outcome.reason}`));
  }

  return (
    <section data-slot="translate-panel" aria-labelledby="admin-translate" className="grid gap-4 border-2 border-primary p-3">
      <div className="grid gap-1">
        <h3 id="admin-translate" className="flex items-center gap-2 font-sans text-base font-semibold">
          <LanguagesIcon aria-hidden className="size-5" />
          {t("title")}
        </h3>
        <p className="font-input text-xs">{t("hint")}</p>
      </div>

      {!configured ? (
        <p role="status" className="flex items-start gap-2 border-2 border-hairline p-3 font-input text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("notConfigured")}
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-1.5 sb:max-w-xs">
            <label htmlFor="translate-source" className={labelClass}>
              {t("source")}
            </label>
            <select
              id="translate-source"
              value={sourceLocale ?? ""}
              onChange={(event) => setSource(event.target.value as Locale)}
              disabled={pending || existing.length === 0}
              className={selectClass}
            >
              {existing.length === 0 && <option value="">{t("noSourceOption")}</option>}
              {EDITOR_LOCALES.filter((l) => existing.includes(l)).map((l) => (
                <option key={l} value={l} lang={l}>
                  {tLocales(l)}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="grid gap-2">
            <legend className={`${labelClass} mb-1.5`}>{t("targets")}</legend>
            <div className="grid grid-cols-2 gap-2 sb:grid-cols-4">
              {EDITOR_LOCALES.filter((l) => l !== sourceLocale).map((l) => {
                const has = existing.includes(l);
                const locked = has && !overwrite;
                return (
                  <label
                    key={l}
                    className="flex min-h-11 cursor-pointer items-center gap-2 border-2 border-input px-2 font-sans text-sm has-checked:border-primary has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                  >
                    <input
                      type="checkbox"
                      checked={!locked && chosen.has(l)}
                      disabled={locked || pending}
                      onChange={(event) => toggleTarget(l, event.target.checked)}
                      className="size-4 accent-primary"
                    />
                    <span lang={l}>{tLocales(l)}</span>
                    {has && <span className="ml-auto font-input text-xs">{t("existing")}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="flex min-h-11 cursor-pointer items-center gap-2 font-sans text-sm">
            <input
              type="checkbox"
              checked={overwrite}
              disabled={pending}
              onChange={(event) => setOverwrite(event.target.checked)}
              className="size-4 accent-primary"
            />
            {t("overwrite")}
          </label>

          {dirty && (
            <p className="flex items-start gap-2 font-input text-sm">
              <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("saveFirst")}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={run} disabled={blocked || targets.length === 0} className="min-h-11">
              {pending ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <LanguagesIcon aria-hidden />}
              {t("submit", { count: targets.length })}
            </Button>
          </div>

          <div role="status" aria-live="polite" className="font-input text-sm empty:hidden">
            {pending && t("running", { count: targets.length })}
            {!pending && result?.ok && (
              <span className="grid gap-1">
                <span>{t("done", { locales: names(result.translated) })}</span>
                {result.failed.length > 0 && (
                  <span className="font-semibold">{t("partial", { locales: names(result.failed.map((f) => f.locale)) })}</span>
                )}
              </span>
            )}
          </div>
          {!pending && result && !result.ok && (
            <p role="alert" className="flex items-start gap-2 border-2 border-destructive p-3 font-input text-sm">
              <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              {t(`errors.${result.reason}`)}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-2 border-t-2 border-hairline pt-3">
        <h4 className="font-sans text-sm font-semibold">{t("review.title")}</h4>
        <p className="font-input text-xs">{t("review.hint")}</p>
        {machine.length === 0 ? (
          <p className="font-input text-sm">{t("review.none")}</p>
        ) : (
          <ul className="grid gap-x-8 gap-y-1 sb:grid-cols-2">
            {machine.map((tr) => {
              const reviewed = tr.reviewedAt !== null;
              return (
                <li key={tr.locale} className="flex min-h-11 items-center justify-between gap-3 border-b border-hairline py-1">
                  <span className="font-sans text-sm" lang={tr.locale}>
                    {tLocales(tr.locale)}
                  </span>
                  <span className="flex items-center gap-2 font-input text-xs">
                    {reviewed ? t("review.reviewed") : t("review.notReviewed")}
                    <Switch
                      checked={reviewed}
                      disabled={dirty || reviewing.has(tr.locale)}
                      onCheckedChange={(checked) => review(tr.locale, checked)}
                      aria-label={t("review.label", { language: tLocales(tr.locale) })}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

"use client";

import { CheckCheckIcon, CircleAlertIcon, LanguagesIcon, LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, use, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { ReviewActionResult, TranslateActionResult } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";

type Selection = { selected: ReadonlySet<string>; toggle: (id: string, on: boolean) => void; disabled: boolean };

const SelectionContext = createContext<Selection | null>(null);

type BulkItem = { id: string; title: string };

type BulkTranslationProps = {
  items: BulkItem[];
  configured: boolean;
  translateProduct: (input: { id: string }) => Promise<TranslateActionResult>;
  setTranslationReviewed: (input: { ids: string[]; reviewed: true }) => Promise<ReviewActionResult>;
  /** The list, whose cards render a SelectProductCheckbox each. */
  children: ReactNode;
};

type Line = { item: BulkItem; result: TranslateActionResult };

/**
 * Bulk actions of the admin list on the products selected on this page: translate their missing languages
 * (one product per call, in turn, so every call stays short and the progress is visible; stoppable) and mark
 * their machine translations reviewed.
 */
export function BulkTranslation({ items, configured, translateProduct, setTranslationReviewed, children }: BulkTranslationProps) {
  const t = useTranslations("admin.translate");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const stop = useRef(false);
  const running = progress !== null;
  // a product deleted or filtered away in the meantime is no longer selectable
  const chosen = items.filter((item) => selected.has(item.id));
  const allSelected = items.length > 0 && chosen.length === items.length;

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function translateSelected() {
    stop.current = false;
    setLines(null);
    const done: Line[] = [];
    for (const [index, item] of chosen.entries()) {
      if (stop.current) break;
      setProgress({ current: index + 1, total: chosen.length, title: item.title });
      let result: TranslateActionResult;
      try {
        result = await translateProduct({ id: item.id });
      } catch {
        result = { ok: false, reason: "unexpectedError" };
      }
      done.push({ item, result });
      setLines([...done]);
      // nothing else will work either
      if (!result.ok && ["notAuthorized", "notConfigured", "tooManyRequests", "authFailed"].includes(result.reason)) break;
    }
    setProgress(null);
    const translated = done.filter((line) => line.result.ok).length;
    const failed = done.filter((line) => !line.result.ok && line.result.reason !== "nothingToTranslate").length;
    toast[failed > 0 ? "error" : "success"](t("bulk.summary", { done: translated, failed }));
  }

  async function reviewSelected() {
    setReviewing(true);
    try {
      const result = await setTranslationReviewed({ ids: chosen.map((item) => item.id), reviewed: true });
      if (result.ok) toast.success(t("bulk.reviewedToast", { count: result.updated }));
      else toast.error(t(`errors.${result.reason}`));
    } catch {
      toast.error(t("errors.unexpectedError"));
    } finally {
      setReviewing(false);
    }
  }

  return (
    <SelectionContext value={{ selected, toggle, disabled: running }}>
      <section
        data-slot="bulk-translation-bar"
        aria-label={t("bulk.label")}
        className="grid gap-3 border-2 border-hairline p-3"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 font-sans text-sm font-semibold">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={running || items.length === 0}
              onChange={(event) => setSelected(event.target.checked ? new Set(items.map((item) => item.id)) : new Set())}
              className="size-4 accent-primary"
            />
            {t("bulk.selectAll")}
          </label>
          <span className="font-input text-sm" aria-live="polite">
            {t("bulk.selected", { count: chosen.length })}
          </span>
        </div>
        <div className="grid gap-2 sb:flex sb:flex-wrap">
          {running ? (
            <Button type="button" variant="outline" onClick={() => (stop.current = true)} className="min-h-11">
              {t("bulk.stop")}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={translateSelected}
              disabled={!configured || chosen.length === 0 || reviewing}
              className="min-h-11"
            >
              <LanguagesIcon aria-hidden />
              {t("bulk.translate", { count: chosen.length })}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={reviewSelected}
            disabled={chosen.length === 0 || running || reviewing}
            className="min-h-11"
          >
            {reviewing ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <CheckCheckIcon aria-hidden />}
            {t("bulk.markReviewed", { count: chosen.length })}
          </Button>
        </div>
        {!configured && (
          <p className="flex items-start gap-2 font-input text-sm">
            <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("notConfigured")}
          </p>
        )}
        <div role="status" aria-live="polite" className="font-input text-sm empty:hidden">
          {progress && (
            <span className="flex items-center gap-2">
              <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin" />
              {t("bulk.progress", progress)}
            </span>
          )}
        </div>
        {lines && lines.length > 0 && (
          <ul aria-label={t("bulk.report")} className="grid gap-1 font-input text-sm">
            {lines.map(({ item, result }) => (
              <li key={item.id} className="flex flex-wrap gap-x-3">
                <span className="font-semibold">{item.title}</span>
                <span>
                  {result.ok
                    ? t("bulk.translatedLine", { count: result.translated.length, failed: result.failed.length })
                    : t(`errors.${result.reason}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {children}
    </SelectionContext>
  );
}

/** The selection checkbox of one product card. */
export function SelectProductCheckbox({ id, title }: { id: string; title: string }) {
  const t = useTranslations("admin.translate");
  const selection = use(SelectionContext);
  if (!selection) return null;
  return (
    <label className="flex size-11 cursor-pointer items-center justify-center self-center">
      <input
        type="checkbox"
        checked={selection.selected.has(id)}
        disabled={selection.disabled}
        onChange={(event) => selection.toggle(id, event.target.checked)}
        aria-label={t("bulk.select", { title })}
        className="size-5 accent-primary"
      />
    </label>
  );
}

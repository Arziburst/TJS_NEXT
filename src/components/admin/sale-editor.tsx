"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  instantToKyivLocal,

  type AdminSale,
  type SaleFieldError,
  type SaleFieldErrors,
  type SaleFormInput,
  type SaleKind,
} from "@/lib/admin/sale-form";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "./styles";

type SaleResult =
  | { ok: true }
  | { ok: false; reason: "fields"; fields: SaleFieldErrors }
  | { ok: false; reason: "notAuthorized" | "notFound" | "invalid" | "tooManyRequests" | "unexpectedError" | (string & {}) };

type SaleEditorProps = {
  /** A product's sale may be a percentage or a fixed price; a collection's only a percentage. */
  target: "product" | "collection";
  /** The product's or the collection's id. */
  id: string;
  sale: AdminSale | null;
  /** The product's regular price in USD cents (a fixed price must be below it); null for a collection. */
  regularUsdMinor: number | null;
  save: (input: SaleFormInput & { id: string }) => Promise<SaleResult>;
  remove: (input: { id: string }) => Promise<SaleResult>;
};

const ERROR_KEYS = ["notAuthorized", "notFound", "tooManyRequests"] as const;

/**
 * The sale section (#67), mobile first: the current sale and its state, a percentage or a fixed price (a product
 * only), an optional start and end in Kyiv time, Save and End. Each change goes through an admin Server Action that
 * refreshes the page with the stored sale.
 */
export function SaleEditor({ target, id: targetId, sale, regularUsdMinor, save, remove }: SaleEditorProps) {
  const t = useTranslations("admin.sale");
  const format = useFormatter();
  const id = useId();
  const [kind, setKind] = useState<SaleKind>(sale?.kind ?? "percent");
  const [percent, setPercent] = useState(sale?.percentOff?.toString() ?? "");
  const [price, setPrice] = useState(sale?.priceUsdMinor ? (sale.priceUsdMinor / 100).toFixed(2) : "");
  const [startsAt, setStartsAt] = useState(sale?.startsAt ? instantToKyivLocal(sale.startsAt) : "");
  const [endsAt, setEndsAt] = useState(sale?.endsAt ? instantToKyivLocal(sale.endsAt) : "");
  const [fields, setFields] = useState<SaleFieldErrors>({});
  const [pending, startTransition] = useTransition();
  const usd = (minor: number) => format.number(minor / 100, { style: "currency", currency: "USD" });

  function failure(result: Exclude<SaleResult, { ok: true }>) {
    if (result.reason === "fields" && "fields" in result) {
      setFields(result.fields);
      return;
    }
    const reason = ERROR_KEYS.find((key) => key === result.reason) ?? "unexpectedError";
    toast.error(t(`errors.${reason}`));
  }

  async function settle(call: () => Promise<SaleResult>): Promise<SaleResult> {
    try {
      return await call();
    } catch {
      return { ok: false, reason: "unexpectedError" };
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFields({});
    startTransition(async () => {
      const result = await settle(() => save({ id: targetId, kind, percent, price, startsAt, endsAt }));
      if (result.ok) toast.success(t("saved"));
      else failure(result);
    });
  }

  function end() {
    startTransition(async () => {
      const result = await settle(() => remove({ id: targetId }));
      if (!result.ok) return failure(result);
      setPercent("");
      setPrice("");
      setStartsAt("");
      setEndsAt("");
      toast.success(t("removed"));
    });
  }

  const errorText = (field: keyof SaleFieldErrors) => {
    const code: SaleFieldError | undefined = fields[field];
    return code ? t(`errors.${code}`) : null;
  };
  const describedBy = (field: keyof SaleFieldErrors, hint?: string) =>
    [hint, fields[field] ? `${id}-${field}-error` : null].filter(Boolean).join(" ") || undefined;
  const fieldError = (field: keyof SaleFieldErrors) => {
    const text = errorText(field);
    return text ? (
      <p id={`${id}-${field}-error`} className="font-input text-sm text-destructive">
        {text}
      </p>
    ) : null;
  };

  const state = sale?.state ?? null;

  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4 border-2 border-hairline p-4" data-testid={`${target}-sale`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={`${id}-title`} className="font-sans text-lg font-semibold">
          {t("title")}
        </h2>
        {sale && state && (
          <Badge variant={state === "running" ? "accent" : "secondary"} data-testid="sale-state">
            {t(`state.${state}`)}
          </Badge>
        )}
      </div>
      <p className="text-sm">{t(target === "product" ? "introProduct" : "introCollection")}</p>
      <p className="font-sans text-sm font-semibold" data-testid="sale-summary">
        {sale
          ? sale.kind === "percent"
            ? t("summaryPercent", { percent: sale.percentOff ?? 0 })
            : t("summaryPrice", { price: usd(sale.priceUsdMinor ?? 0) })
          : t("none")}
      </p>

      <form onSubmit={submit} noValidate className="grid gap-4">
        {target === "product" && (
          <fieldset className="grid gap-2">
            <legend className={cn(labelClass, "mb-2")}>{t("kind")}</legend>
            <div className="flex flex-wrap gap-2">
              {(["percent", "price"] as const).map((option) => (
                <label
                  key={option}
                  className="flex min-h-12 cursor-pointer items-center gap-2 border-2 border-input px-3 font-sans text-sm has-checked:border-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
                >
                  <input
                    type="radio"
                    name={`${id}-kind`}
                    value={option}
                    checked={kind === option}
                    onChange={() => setKind(option)}
                    className="size-4 accent-primary"
                  />
                  {t(`kinds.${option}`)}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {kind === "percent" ? (
          <div className="grid gap-2">
            <label htmlFor={`${id}-percent`} className={labelClass}>
              {t("percent")}
            </label>
            <input
              id={`${id}-percent`}
              inputMode="numeric"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              aria-invalid={fields.percent ? true : undefined}
              aria-describedby={describedBy("percent")}
              className={cn(inputClass, "max-w-40")}
            />
            {fieldError("percent")}
          </div>
        ) : (
          <div className="grid gap-2">
            <label htmlFor={`${id}-price`} className={labelClass}>
              {t("price")}
            </label>
            {regularUsdMinor !== null && (
              <p id={`${id}-price-hint`} className="font-input text-xs text-foreground/70">
                {t("priceHint", { price: usd(regularUsdMinor) })}
              </p>
            )}
            <input
              id={`${id}-price`}
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              aria-invalid={fields.price ? true : undefined}
              aria-describedby={describedBy("price", regularUsdMinor !== null ? `${id}-price-hint` : undefined)}
              className={cn(inputClass, "max-w-40")}
            />
            {fieldError("price")}
          </div>
        )}
        {fieldError("kind")}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <label htmlFor={`${id}-starts`} className={labelClass}>
              {t("startsAt")}
            </label>
            <input
              id={`${id}-starts`}
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              aria-invalid={fields.startsAt ? true : undefined}
              aria-describedby={describedBy("startsAt", `${id}-window-hint`)}
              className={inputClass}
            />
            {fieldError("startsAt")}
          </div>
          <div className="grid content-start gap-2">
            <label htmlFor={`${id}-ends`} className={labelClass}>
              {t("endsAt")}
            </label>
            <input
              id={`${id}-ends`}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              aria-invalid={fields.endsAt ? true : undefined}
              aria-describedby={describedBy("endsAt", `${id}-window-hint`)}
              className={inputClass}
            />
            {fieldError("endsAt")}
          </div>
        </div>
        <p id={`${id}-window-hint`} className="-mt-2 font-input text-xs text-foreground/70">
          {t("windowHint")}
        </p>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="min-h-12">
            {t("save")}
          </Button>
          {sale && (
            <Button type="button" variant="outline" disabled={pending} onClick={end} className="min-h-12">
              {t("remove")}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

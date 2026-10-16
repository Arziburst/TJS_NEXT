"use client";

import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useOptimistic, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "@/components/layout/toast";
import type {
  SaveVariantResult,
  VariantActionError,
  VariantActionResult,
} from "@/app/[locale]/admin/variant-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { Locale } from "@/i18n/routing";
import { EDITOR_LOCALES, PUBLISH_LOCALE } from "@/lib/admin/product-form";
import {
  minorToDeltaText,
  SKU_SUFFIX_MAX_LENGTH,
  VARIANT_LABEL_MAX_LENGTH,
  type VariantFieldError,
  type VariantFieldErrors,
} from "@/lib/admin/variant-form";
import type { AdminVariant } from "@/lib/admin/variants";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "./styles";

export type ProductVariantActions = {
  saveProductVariant: (input: {
    productId: string;
    variantId: string | null;
    labels: Partial<Record<Locale, string>>;
    priceDelta: string;
    skuSuffix: string;
    available: boolean;
  }) => Promise<SaveVariantResult>;
  setProductVariantAvailable: (input: { productId: string; variantId: string; available: boolean }) => Promise<VariantActionResult>;
  reorderProductVariants: (input: { productId: string; variantIds: string[] }) => Promise<VariantActionResult>;
  deleteProductVariant: (input: { productId: string; variantId: string }) => Promise<VariantActionResult>;
};

type ProductVariantsProps = {
  productId: string;
  /** The product's own price in USD cents: a size costs it plus its difference. */
  priceUsdMinor: number;
  variants: AdminVariant[];
  actions: ProductVariantActions;
};

type MoveControl = "earlier" | "later";

function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function nameOf(variant: AdminVariant): string {
  return variant.labels[PUBLISH_LOCALE] ?? Object.values(variant.labels)[0] ?? "";
}

/**
 * The product's sizes (#66), mobile first: one card per size with its name, price and an on/off switch; arrow
 * buttons order them (every screen, keyboard included); a dialog adds or edits one (its name per locale, its price
 * difference, its SKU suffix); one nobody ordered can be deleted after a confirmation. Every change goes through an
 * admin Server Action that refreshes the page with the stored sizes.
 */
export function ProductVariants({ productId, priceUsdMinor, variants, actions }: ProductVariantsProps) {
  const t = useTranslations("admin.variants");
  const tForm = useTranslations("admin.form");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [ordered, setOrdered] = useOptimistic(variants);
  const [editing, setEditing] = useState<AdminVariant | "new" | null>(null);
  const [fields, setFields] = useState<VariantFieldErrors>({});
  const [deleting, setDeleting] = useState<AdminVariant | null>(null);
  const focusTarget = useRef<{ id: string; control: MoveControl; index: number } | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [announcement, setAnnouncement] = useState("");

  // React moves the size's card in the DOM, which drops the focus: put it back on the moved size's control
  useEffect(() => {
    const target = focusTarget.current;
    if (!target || ordered[target.index]?.id !== target.id) return;
    focusTarget.current = null;
    const card = listRef.current?.querySelector<HTMLElement>(`[data-variant-id="${target.id}"]`);
    const active = document.activeElement;
    if (!card || (active && active !== document.body && !card.contains(active))) return;
    card.querySelector<HTMLElement>(`[data-control="${target.control}"]`)?.focus();
  }, [ordered]);

  const usd = (minor: number) => format.number(minor / 100, { style: "currency", currency: "USD" });

  function errorMessage(reason: VariantActionError): string {
    return t(`errors.${reason === "suffixTaken" ? "invalid" : reason}`);
  }

  async function settle<R extends { ok: boolean }>(call: () => Promise<R>): Promise<R | { ok: false; reason: "unexpectedError" }> {
    try {
      return await call();
    } catch {
      return { ok: false, reason: "unexpectedError" };
    }
  }

  function reorder(next: AdminVariant[], moved: { id: string; control: MoveControl }) {
    focusTarget.current = { ...moved, index: next.findIndex((v) => v.id === moved.id) };
    startTransition(async () => {
      setOrdered(next);
      const result = await settle(() => actions.reorderProductVariants({ productId, variantIds: next.map((v) => v.id) }));
      if (!result.ok) {
        toast.error(errorMessage(result.reason));
        return;
      }
      setAnnouncement(t("moved", { position: next.findIndex((v) => v.id === moved.id) + 1, count: next.length }));
    });
  }

  function toggle(variant: AdminVariant, available: boolean) {
    startTransition(async () => {
      setOrdered(ordered.map((v) => (v.id === variant.id ? { ...v, available } : v)));
      const result = await settle(() => actions.setProductVariantAvailable({ productId, variantId: variant.id, available }));
      if (!result.ok) {
        toast.error(errorMessage(result.reason));
        return;
      }
      toast.success(t(available ? "switchedOn" : "switchedOff", { label: nameOf(variant) }));
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    // the dialog is portalled out of the product form in the DOM, but React still bubbles its submit there
    event.preventDefault();
    event.stopPropagation();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const labels = Object.fromEntries(EDITOR_LOCALES.map((locale) => [locale, String(data.get(`label.${locale}`) ?? "")]));
    const variant = editing === "new" ? null : editing;
    startTransition(async () => {
      const result = await settle(() =>
        actions.saveProductVariant({
          productId,
          variantId: variant?.id ?? null,
          labels,
          priceDelta: String(data.get("priceDelta") ?? ""),
          skuSuffix: String(data.get("skuSuffix") ?? ""),
          available: variant?.available ?? true,
        }),
      );
      if (!result.ok) {
        if (result.reason === "fields") setFields(result.fields);
        else toast.error(errorMessage(result.reason));
        return;
      }
      setEditing(null);
      setFields({});
      toast.success(t("saved"));
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const { id } = deleting;
    startTransition(async () => {
      const result = await settle(() => actions.deleteProductVariant({ productId, variantId: id }));
      if (!result.ok) {
        toast.error(errorMessage(result.reason));
        return;
      }
      setDeleting(null);
      toast.success(t("deleted"));
    });
  }

  function open(target: AdminVariant | "new") {
    setFields({});
    setEditing(target);
  }

  return (
    <section aria-labelledby="admin-variants" className="grid gap-3" data-testid="admin-variants">
      <h2 id="admin-variants" className="font-sans text-lg font-semibold">
        {tForm("sections.variants")}
      </h2>
      <p className="font-input text-xs">{t("hint")}</p>

      {ordered.length === 0 ? (
        <p className="font-input text-sm">{t("empty")}</p>
      ) : (
        <ol ref={listRef} className="grid gap-2 sb:max-w-xl" aria-busy={pending}>
          {ordered.map((variant, index) => {
            const name = nameOf(variant);
            const first = index === 0;
            const last = index === ordered.length - 1;
            return (
              <li
                key={variant.id}
                data-testid="admin-variant"
                data-variant-id={variant.id}
                className={cn("grid gap-2 border-2 border-hairline p-3", !variant.available && "border-dashed")}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-sans text-base font-semibold break-all">{name}</span>
                  <span className="font-input text-sm tabular-nums">
                    {t("price", { price: usd(priceUsdMinor + variant.priceDeltaUsdMinor) })}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-input text-sm">
                  <Switch
                    checked={variant.available}
                    disabled={pending}
                    onCheckedChange={(checked) => toggle(variant, checked)}
                    aria-label={t("availableOf", { label: name })}
                    data-testid="variant-available"
                  />
                  <span aria-hidden>{variant.available ? t("available") : t("off")}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={pending || first}
                    focusableWhenDisabled
                    data-control="earlier"
                    aria-label={t("moveEarlier", { label: name })}
                    onClick={() => reorder(move(ordered, index, index - 1), { id: variant.id, control: "earlier" })}
                  >
                    <ArrowUpIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={pending || last}
                    focusableWhenDisabled
                    data-control="later"
                    aria-label={t("moveLater", { label: name })}
                    onClick={() => reorder(move(ordered, index, index + 1), { id: variant.id, control: "later" })}
                  >
                    <ArrowDownIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={pending}
                    aria-label={t("edit", { label: name })}
                    onClick={() => open(variant)}
                  >
                    <PencilIcon aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    // an ordered size stays (the order lines link to it): it can only be switched off
                    disabled={pending || variant.ordered}
                    focusableWhenDisabled
                    aria-label={t("delete", { label: name })}
                    aria-describedby={variant.ordered ? `variant-ordered-${variant.id}` : undefined}
                    onClick={() => setDeleting(variant)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
                {variant.ordered && (
                  <p id={`variant-ordered-${variant.id}`} className="font-input text-xs">
                    {t("ordered")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Button type="button" variant="outline" className="justify-self-start" disabled={pending} onClick={() => open("new")}>
        <PlusIcon aria-hidden />
        {t("add")}
      </Button>

      <Dialog open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {editing !== null && (
            <VariantForm
              key={editing === "new" ? "new" : editing.id}
              variant={editing === "new" ? null : editing}
              fields={fields}
              pending={pending}
              onSubmit={save}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(isOpen) => !isOpen && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription", { label: deleting ? nameOf(deleting) : "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{tForm("cancel")}</DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={confirmDelete}>
              {t("deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function VariantForm({
  variant,
  fields,
  pending,
  onSubmit,
}: {
  variant: AdminVariant | null;
  fields: VariantFieldErrors;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const t = useTranslations("admin.variants");
  const tForm = useTranslations("admin.form");
  const tLocales = useTranslations("nav.localeNames");
  const formRef = useRef<HTMLFormElement>(null);
  const message = (code: VariantFieldError | undefined, max: number) =>
    code === undefined ? undefined : code === "tooLong" ? t("errors.tooLong", { max }) : t(`errors.${code}`);

  // the first field the server refused takes the focus
  useEffect(() => {
    const first = Object.keys(fields)[0];
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }, [fields]);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{variant ? t("editTitle", { label: nameOf(variant) }) : t("newTitle")}</DialogTitle>
        <DialogDescription>{t("labelsHint")}</DialogDescription>
      </DialogHeader>
      <fieldset className="grid gap-3">
        <legend className={cn(labelClass, "mb-1")}>{t("labels")}</legend>
        {EDITOR_LOCALES.map((locale) => (
          <Field
            key={locale}
            name={`label.${locale}`}
            label={tLocales(locale)}
            lang={locale}
            defaultValue={variant?.labels[locale] ?? ""}
            maxLength={VARIANT_LABEL_MAX_LENGTH}
            required={locale === PUBLISH_LOCALE}
            error={message(fields[`label.${locale}`], VARIANT_LABEL_MAX_LENGTH)}
          />
        ))}
      </fieldset>
      <Field
        name="priceDelta"
        label={t("priceDelta")}
        hint={t("priceDeltaHint")}
        defaultValue={variant ? minorToDeltaText(variant.priceDeltaUsdMinor) : "0"}
        // a phone's decimal keyboard has no minus sign: the text keyboard lets a cheaper size be entered
        inputMode="text"
        error={message(fields.priceDelta, 0)}
      />
      <Field
        name="skuSuffix"
        label={t("skuSuffix")}
        hint={t("skuSuffixHint")}
        defaultValue={variant?.skuSuffix ?? ""}
        maxLength={SKU_SUFFIX_MAX_LENGTH}
        autoCapitalize="characters"
        error={message(fields.skuSuffix, SKU_SUFFIX_MAX_LENGTH)}
      />
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{tForm("cancel")}</DialogClose>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  required,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  lang?: string;
  defaultValue: string;
  maxLength?: number;
  inputMode?: "text" | "decimal";
  autoCapitalize?: string;
}) {
  const id = `variant-${name.replace(".", "-")}`;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={labelClass} lang={props.lang}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        autoComplete="off"
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={inputClass}
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="font-input text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 font-input text-sm">
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      )}
    </div>
  );
}

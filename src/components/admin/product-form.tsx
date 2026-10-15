"use client";

import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import type { SaveProductState } from "@/app/[locale]/admin/actions";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  AVAILABILITIES,
  EDITOR_LOCALES,
  FULFILLMENTS,
  PUBLISH_LOCALE,
  STATUSES,
  type FieldErrors,
} from "@/lib/admin/product-form";
import type { AdminProduct } from "@/lib/admin/products";
import { ChoiceField, FieldShell, TextField, fieldId, useFieldErrorText } from "./form-fields";
import { editProductHref } from "./paths";
import { selectClass } from "./styles";
import { TranslationFields } from "./translation-fields";

type ProductFormProps = {
  product: AdminProduct | null;
  categories: { id: string; name: string }[];
  saveProduct: (previous: SaveProductState, formData: FormData) => Promise<SaveProductState>;
  /** Read-only photos (upload comes with #18), rendered by the page. */
  photos?: ReactNode;
  /** The delete button of an existing product, rendered by the page. */
  deleteButton?: ReactNode;
};

const idle: SaveProductState = { status: "idle" };

function localesWithErrors(fields: FieldErrors | undefined): Locale[] {
  if (!fields) return [];
  return EDITOR_LOCALES.filter((locale) => Object.keys(fields).some((key) => key.startsWith(`tr.${locale}.`)));
}

/**
 * Create and edit form of a product, mobile first: native inputs with the right keyboards, large choice
 * tiles, the texts of every locale in disclosures, and a save bar that stays at the bottom of the screen.
 * The server action validates everything again; its field errors are listed on top and shown at each field.
 */
export function ProductForm({ product, categories, saveProduct, photos, deleteButton }: ProductFormProps) {
  const t = useTranslations("admin.form");
  const tAdmin = useTranslations("admin");
  const errorText = useFieldErrorText();
  const router = useRouter();
  const [state, dispatch, pending] = useActionState(saveProduct, idle);
  const [fulfillment, setFulfillment] = useState<string>(product?.fulfillment ?? "made_to_order");
  const [status, setStatus] = useState<string>(product?.status ?? "draft");
  const [openLocales, setOpenLocales] = useState<ReadonlySet<Locale>>(() => new Set([PUBLISH_LOCALE]));
  const summaryRef = useRef<HTMLDivElement>(null);

  const fields: FieldErrors = state.status === "error" ? (state.fields ?? {}) : {};
  const error = (name: string) => errorText(name, fields[name]);
  const madeToOrder = fulfillment === "made_to_order";
  const translations = new Map(product?.translations.map((tr) => [tr.locale, tr]));

  useEffect(() => {
    if (state.status === "error") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- open the locales the server rejected
      setOpenLocales((open) => new Set([...open, ...localesWithErrors(state.fields)]));
      summaryRef.current?.focus();
    }
    if (state.status === "saved") {
      toast.success(t(state.created ? "created" : "saved"));
      if (state.created) router.replace(editProductHref(state.id));
      else router.refresh();
    }
  }, [state, t, router]);

  // submitted through the action without React's form reset, so a refused save keeps every typed value
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const errorEntries = Object.entries(fields).filter((entry): entry is [string, NonNullable<FieldErrors[string]>] => !!entry[1]);

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6" aria-busy={pending}>
      <input type="hidden" name="id" value={product?.id ?? ""} />
      <p className="font-input text-sm">{tAdmin("product.title")}</p>

      <div ref={summaryRef} tabIndex={-1} role="alert" className="outline-none empty:hidden">
        {state.status === "error" && (
          <div className="grid gap-2 border-2 border-destructive p-3 font-input text-sm">
            <p className="flex items-start gap-2 font-semibold">
              <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              {state.error ? t(`errors.${state.error}`) : t("errorSummary", { count: errorEntries.length })}
            </p>
            {errorEntries.length > 0 && (
              <ul className="grid gap-1 pl-6">
                {errorEntries.map(([name, code]) => (
                  <li key={name}>
                    <a href={`#${fieldId(name)}`} className="underline underline-offset-4">
                      {t("errorItem", { field: fieldLabel(name), error: errorText(name, code) ?? "" })}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <fieldset className="grid gap-4 sb:grid-cols-2">
        <legend className="mb-3 font-sans text-lg font-semibold">{t("sections.product")}</legend>
        <FieldShell name="categoryId" label={tAdmin("product.typeLabel")} error={error("categoryId")}>
          {(aria) => (
            <select name="categoryId" defaultValue={product?.categoryId ?? ""} className={selectClass} {...aria}>
              <option value="" disabled>
                {t("chooseCategory")}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </FieldShell>
        <TextField
          name="priceUsd"
          label={tAdmin("product.priceLabel", { currency: "USD" })}
          defaultValue={product?.priceUsd ?? ""}
          inputMode="decimal"
          autoComplete="off"
          error={error("priceUsd")}
        />
        <TextField
          name="weightG"
          label={tAdmin("product.weightLabel")}
          defaultValue={product?.weightG ?? "0"}
          inputMode="decimal"
          autoComplete="off"
          error={error("weightG")}
        />
        <TextField
          name="sku"
          label={t("sku")}
          hint={t("skuHint")}
          defaultValue={product?.sku ?? ""}
          autoCapitalize="characters"
          autoComplete="off"
          error={error("sku")}
        />
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-3 font-sans text-lg font-semibold">{t("sections.making")}</legend>
        <ChoiceField
          name="fulfillment"
          legend={t("fulfillment")}
          options={FULFILLMENTS.map((value) => ({ value, label: tAdmin(`fulfillment.${value}`) }))}
          value={fulfillment}
          onChange={setFulfillment}
          error={error("fulfillment")}
        />
        {madeToOrder ? (
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 font-sans text-sm font-semibold">{t("leadTime")}</legend>
            <div className="grid grid-cols-2 gap-3 sb:max-w-md">
              <TextField
                name="leadTimeMin"
                label={t("leadTimeMin")}
                defaultValue={product?.leadTimeMinDays?.toString() ?? ""}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                error={error("leadTimeMin")}
              />
              <TextField
                name="leadTimeMax"
                label={t("leadTimeMax")}
                defaultValue={product?.leadTimeMaxDays?.toString() ?? ""}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                error={error("leadTimeMax")}
              />
            </div>
            <p className="font-input text-xs">{t("leadTimeHint")}</p>
          </fieldset>
        ) : (
          <FieldShell name="availability" label={t("availability")} error={error("availability")} className="sb:max-w-md">
            {(aria) => (
              <select name="availability" defaultValue={product?.availability ?? "available"} className={selectClass} {...aria}>
                {AVAILABILITIES.map((value) => (
                  <option key={value} value={value}>
                    {tAdmin(`availability.${value}`)}
                  </option>
                ))}
              </select>
            )}
          </FieldShell>
        )}
      </fieldset>

      <fieldset className="grid gap-1.5">
        <legend className="mb-3 font-sans text-lg font-semibold">{t("sections.dimensions")}</legend>
        <div className="grid grid-cols-3 gap-3 sb:max-w-xl">
          {(["lengthMm", "widthMm", "heightMm"] as const).map((name) => (
            <TextField
              key={name}
              name={name}
              label={t(name)}
              defaultValue={product?.[name] ?? ""}
              inputMode="decimal"
              autoComplete="off"
              error={error(name)}
            />
          ))}
        </div>
        <p className="font-input text-xs">{t("dimensionsHint")}</p>
      </fieldset>

      <section aria-labelledby="admin-translations" className="grid gap-3">
        <h2 id="admin-translations" className="font-sans text-lg font-semibold">
          {t("sections.translations")}
        </h2>
        <p className="font-input text-xs">{t("translationsHint")}</p>
        {EDITOR_LOCALES.map((locale) => (
          <TranslationFields
            key={locale}
            locale={locale}
            initial={translations.get(locale)}
            errors={fields}
            madeToOrder={madeToOrder}
            open={openLocales.has(locale)}
            onToggle={(open) =>
              setOpenLocales((current) => {
                const next = new Set(current);
                if (open) next.add(locale);
                else next.delete(locale);
                return next;
              })
            }
          />
        ))}
      </section>

      {photos}

      <fieldset className="grid gap-4 sb:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <legend className="mb-3 font-sans text-lg font-semibold">{t("sections.publication")}</legend>
        <ChoiceField
          name="status"
          legend={t("status")}
          options={STATUSES.map((value) => ({ value, label: tAdmin(`status.${value}`) }))}
          value={status}
          onChange={setStatus}
          error={error("status")}
        />
        <TextField
          name="position"
          label={t("position")}
          hint={t("positionHint")}
          defaultValue={product?.position.toString() ?? "0"}
          inputMode="numeric"
          autoComplete="off"
          error={error("position")}
        />
      </fieldset>

      {deleteButton}

      <div className="sticky bottom-[calc(3.625rem+env(safe-area-inset-bottom))] z-20 -mx-(--page-gutter) flex items-center gap-3 border-t-2 border-primary bg-background px-(--page-gutter) py-3 sb:bottom-0 sb:mx-0 sb:px-0">
        <Button type="submit" disabled={pending} className="flex-1 sb:flex-none sb:min-w-48">
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );

  function fieldLabel(name: string): string {
    const [, locale, field] = name.split(".");
    if (name.startsWith("tr.") && locale && field) {
      return `${t(`translation.${field as "title"}`)} (${locale})`;
    }
    return t(`labels.${name as "priceUsd"}`);
  }
}

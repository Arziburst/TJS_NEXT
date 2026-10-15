"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import { PUBLISH_LOCALE, translationFieldName, type FieldErrors } from "@/lib/admin/product-form";
import type { AdminTranslation } from "@/lib/admin/products";
import { slugify } from "@/lib/admin/slug";
import { cn } from "@/lib/utils";
import { TextAreaField, TextField, useFieldErrorText } from "./form-fields";

type TranslationFieldsProps = {
  locale: Locale;
  initial: AdminTranslation | undefined;
  errors: FieldErrors;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** The lead time note belongs to made-to-order work only. */
  madeToOrder: boolean;
};

/**
 * One locale of the translations editor, a native disclosure (opens with one tap, works without a custom
 * widget). The slug follows the title until the admin edits it; a slug that was saved stays as it is.
 */
export function TranslationFields({ locale, initial, errors, open, onToggle, madeToOrder }: TranslationFieldsProps) {
  const t = useTranslations("admin.form.translation");
  const tLocales = useTranslations("nav.localeNames");
  const errorText = useFieldErrorText();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(initial !== undefined);
  const name = (field: Parameters<typeof translationFieldName>[1]) => translationFieldName(locale, field);
  const error = (field: Parameters<typeof translationFieldName>[1]) => errorText(name(field), errors[name(field)]);
  const hasErrors = Object.keys(errors).some((key) => key.startsWith(`tr.${locale}.`));
  const filled = title.trim() !== "";
  const machine = initial?.source === "machine" && initial.reviewedAt === null;

  return (
    <details
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
      className={cn("group border-2 border-hairline", hasErrors && "border-destructive")}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className="font-sans text-base font-semibold" lang={locale}>
          {tLocales(locale)}
        </span>
        <span className="flex flex-1 flex-wrap items-center gap-x-2 font-input text-xs">
          {filled ? (
            <span className="inline-flex items-center gap-1">
              <CheckIcon aria-hidden className="size-4 text-success" />
              {t("filled")}
            </span>
          ) : (
            <span>{locale === PUBLISH_LOCALE ? t("requiredToPublish") : t("empty")}</span>
          )}
          {machine && <span>{t("machine")}</span>}
          {hasErrors && <span className="text-destructive">{t("hasErrors")}</span>}
        </span>
        <ChevronDownIcon aria-hidden className="size-5 shrink-0 transition group-open:rotate-180" />
      </summary>

      <div className="grid gap-4 border-t-2 border-hairline p-3">
        <TextField
          name={name("title")}
          label={t("title")}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            if (!slugEdited) setSlug(slugify(event.target.value));
          }}
          error={error("title")}
          lang={locale}
          autoComplete="off"
        />
        <TextField
          name={name("slug")}
          label={t("slug")}
          hint={t("slugHint")}
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setSlugEdited(event.target.value !== "");
          }}
          error={error("slug")}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
        />
        <TextAreaField
          name={name("description")}
          label={t("description")}
          defaultValue={initial?.description ?? ""}
          error={error("description")}
          lang={locale}
          rows={5}
        />
        <TextAreaField name={name("materials")} label={t("materials")} defaultValue={initial?.materials ?? ""} error={error("materials")}
          lang={locale} rows={2} />
        <TextField name={name("clasp")} label={t("clasp")} defaultValue={initial?.clasp ?? ""} error={error("clasp")}
          lang={locale} />
        <TextAreaField name={name("care")} label={t("care")} defaultValue={initial?.care ?? ""} error={error("care")}
          lang={locale} rows={2} />
        {madeToOrder && (
          <TextAreaField
            name={name("leadTimeNote")}
            label={t("leadTimeNote")}
            defaultValue={initial?.leadTimeNote ?? ""}
            error={error("leadTimeNote")}
          lang={locale}
            rows={2}
          />
        )}
        <TextField name={name("metaTitle")} label={t("metaTitle")} defaultValue={initial?.metaTitle ?? ""} error={error("metaTitle")}
          lang={locale} />
        <TextAreaField
          name={name("metaDescription")}
          label={t("metaDescription")}
          defaultValue={initial?.metaDescription ?? ""}
          error={error("metaDescription")}
          lang={locale}
          rows={2}
        />
      </div>
    </details>
  );
}

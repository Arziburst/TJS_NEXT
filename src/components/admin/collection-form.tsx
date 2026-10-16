"use client";

import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import type { SaveCollectionResult } from "@/app/[locale]/admin/collections/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  COLLECTION_DESCRIPTION_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
  COLLECTION_SLUG_MAX_LENGTH,
  type CollectionFieldErrors,
  type CollectionFormInput,
  type CollectionTranslationInput,
} from "@/lib/admin/collection-form";
import type { AdminCollectionTranslation } from "@/lib/admin/collections";
import { EDITOR_LOCALES, PUBLISH_LOCALE } from "@/lib/admin/product-form";
import { slugify } from "@/lib/admin/slug";
import { cn } from "@/lib/utils";
import { editCollectionHref } from "./paths";
import { inputClass, labelClass, textareaClass } from "./styles";

type CollectionFormProps = {
  collection: {
    id: string | null;
    published: boolean;
    position: number;
    translations: Partial<Record<Locale, AdminCollectionTranslation>>;
  };
  saveCollection: (input: CollectionFormInput) => Promise<SaveCollectionResult>;
};

const ERROR_KEYS = ["notAuthorized", "notFound", "needsUk", "invalid", "tooManyRequests", "slugTaken"] as const;
// the locales open at first: Ukrainian (required) and English (the fallback), and every one already filled in
const OPEN_FIRST: readonly Locale[] = ["uk", "en"];

/**
 * A collection's names, slugs and descriptions per locale, its publication and its place in the list (#67), mobile
 * first in one column; the other locales fold away until opened. A new collection opens its own page once saved
 * (its pieces, cover and sale are added there).
 */
export function CollectionForm({ collection, saveCollection }: CollectionFormProps) {
  const t = useTranslations("admin.collections");
  const tNames = useTranslations("nav.localeNames");
  const router = useRouter();
  const id = useId();
  const [translations, setTranslations] = useState<Partial<Record<Locale, CollectionTranslationInput>>>(() =>
    Object.fromEntries(
      Object.entries(collection.translations).map(([locale, tr]) => [
        locale,
        { name: tr.name, slug: tr.slug, description: tr.description ?? "" },
      ]),
    ),
  );
  // a slug typed by hand is kept; an untouched one follows the name
  const [slugEdited, setSlugEdited] = useState<Partial<Record<Locale, boolean>>>(() =>
    Object.fromEntries(Object.keys(collection.translations).map((locale) => [locale, true])),
  );
  const [published, setPublished] = useState(collection.published);
  const [position, setPosition] = useState(String(collection.position));
  const [fields, setFields] = useState<CollectionFieldErrors>({});
  const [pending, startTransition] = useTransition();

  function update(locale: Locale, field: keyof CollectionTranslationInput, value: string) {
    setTranslations((current) => {
      const previous = current[locale] ?? { name: "", slug: "", description: "" };
      const next = { ...previous, [field]: value };
      if (field === "name" && !slugEdited[locale]) next.slug = slugify(value);
      return { ...current, [locale]: next };
    });
    if (field === "slug") setSlugEdited((current) => ({ ...current, [locale]: true }));
    setFields((current) => ({ ...current, [`${locale}.${field}`]: undefined }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFields({});
    const number = Number.parseInt(position, 10);
    const input: CollectionFormInput = {
      id: collection.id,
      published,
      position: Number.isSafeInteger(number) && number >= 0 ? number : 0,
      translations,
    };
    startTransition(async () => {
      const result = await saveCollection(input).catch((): SaveCollectionResult => ({ ok: false, reason: "unexpectedError" }));
      if (result.ok) {
        toast.success(t(result.created ? "created" : "saved"));
        if (result.created) router.replace(editCollectionHref(result.id));
        return;
      }
      if (result.reason === "fields" && "fields" in result) {
        setFields(result.fields);
        const first = Object.keys(result.fields)[0];
        if (first) document.getElementById(`${id}-${first}`)?.focus();
        return;
      }
      const reason = ERROR_KEYS.find((key) => key === result.reason) ?? "unexpectedError";
      toast.error(t(`errors.${reason}`));
    });
  }

  function field(locale: Locale, name: keyof CollectionTranslationInput) {
    const key = `${locale}.${name}`;
    const code = fields[key];
    const fieldId = `${id}-${key}`;
    const hintId = name === "slug" ? `${fieldId}-hint` : undefined;
    const errorId = code ? `${fieldId}-error` : undefined;
    const value = translations[locale]?.[name] ?? "";
    const common = {
      id: fieldId,
      value,
      "aria-invalid": code ? true : undefined,
      "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
    };
    return (
      <div className="grid gap-2">
        <label htmlFor={fieldId} className={labelClass}>
          {t(`fields.${name}`)}
        </label>
        {hintId && (
          <p id={hintId} className="-mt-1 font-input text-xs text-foreground/70">
            {t("fields.slugHint")}
          </p>
        )}
        {name === "description" ? (
          <textarea
            {...common}
            rows={4}
            maxLength={COLLECTION_DESCRIPTION_MAX_LENGTH}
            onChange={(event) => update(locale, name, event.target.value)}
            className={textareaClass}
          />
        ) : (
          <input
            {...common}
            maxLength={name === "name" ? COLLECTION_NAME_MAX_LENGTH : COLLECTION_SLUG_MAX_LENGTH}
            required={name === "name" && locale === PUBLISH_LOCALE}
            onChange={(event) => update(locale, name, event.target.value)}
            className={inputClass}
          />
        )}
        {code && (
          <p id={errorId} className="font-input text-sm text-destructive">
            {t(`errors.${code}`)}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6" data-testid="collection-form">
      <section aria-labelledby={`${id}-details`} className="grid gap-3">
        <h2 id={`${id}-details`} className="font-sans text-lg font-semibold">
          {t("sections.details")}
        </h2>
        {EDITOR_LOCALES.map((locale) => (
          <details
            key={locale}
            open={OPEN_FIRST.includes(locale) || collection.translations[locale] !== undefined}
            className="border-2 border-hairline p-3 open:pb-4"
            data-locale={locale}
          >
            <summary className="flex min-h-11 cursor-pointer items-center font-sans text-sm font-semibold">
              <span lang={locale}>{tNames(locale)}</span>
            </summary>
            <div className="mt-3 grid gap-4" lang={locale}>
              {field(locale, "name")}
              {field(locale, "slug")}
              {field(locale, "description")}
            </div>
          </details>
        ))}
      </section>

      <section aria-labelledby={`${id}-publication`} className="grid gap-4">
        <h2 id={`${id}-publication`} className="font-sans text-lg font-semibold">
          {t("sections.publication")}
        </h2>
        <div className="flex items-start gap-3">
          <Switch
            checked={published}
            onCheckedChange={setPublished}
            aria-labelledby={`${id}-published-label`}
            aria-describedby={`${id}-published-hint`}
            data-testid="collection-published"
          />
          <div className="grid gap-1">
            <span id={`${id}-published-label`} className={labelClass}>
              {t("fields.published")}
            </span>
            <p id={`${id}-published-hint`} className="font-input text-xs text-foreground/70">
              {t("fields.publishedHint")}
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          <label htmlFor={`${id}-position`} className={labelClass}>
            {t("fields.position")}
          </label>
          <p id={`${id}-position-hint`} className="-mt-1 font-input text-xs text-foreground/70">
            {t("fields.positionHint")}
          </p>
          <input
            id={`${id}-position`}
            inputMode="numeric"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            aria-describedby={`${id}-position-hint`}
            className={cn(inputClass, "max-w-40")}
          />
        </div>
      </section>

      <Button type="submit" disabled={pending} aria-busy={pending || undefined} className="min-h-12 sm:justify-self-start">
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

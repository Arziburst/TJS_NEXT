import { z } from "zod";
import { locales, type Locale } from "@/i18n/routing";
import { EDITOR_LOCALES, PUBLISH_LOCALE } from "./product-form";
import { SLUG_PATTERN, slugify } from "./slug";

/*
 * The admin's collection form (#67): the name, URL slug and description per locale (the uk name is required, as
 * for a list's term: the shop's main market), whether it is published and its place in the list. Shared by the
 * form and the Server Action; pure. The database checks the same bounds.
 */

export const COLLECTION_NAME_MAX_LENGTH = 120;
export const COLLECTION_SLUG_MAX_LENGTH = 120;
export const COLLECTION_DESCRIPTION_MAX_LENGTH = 5000;
/** Technical bound of a collection's pieces (the database allows 500). */
export const MAX_COLLECTION_PRODUCTS = 500;

const translation = z.object({
  name: z.string().trim().max(COLLECTION_NAME_MAX_LENGTH),
  slug: z.string().trim().max(COLLECTION_SLUG_MAX_LENGTH),
  description: z.string().trim().max(COLLECTION_DESCRIPTION_MAX_LENGTH),
});

export const collectionFormInput = z.object({
  id: z.uuid().nullable(),
  published: z.boolean(),
  position: z.number().int().min(0).max(1_000_000),
  translations: z.partialRecord(z.enum(locales), translation),
});

export type CollectionFormInput = z.infer<typeof collectionFormInput>;
export type CollectionTranslationInput = z.infer<typeof translation>;

export type CollectionFieldError = "required" | "invalidSlug" | "slugTaken";
/** Keyed "<locale>.<field>", e.g. "uk.name". */
export type CollectionFieldErrors = Partial<Record<string, CollectionFieldError>>;

export type CollectionTranslationWrite = { locale: Locale; slug: string; name: string; description: string | null };

export type ParsedCollection =
  | { ok: true; translations: CollectionTranslationWrite[] }
  | { ok: false; fields: CollectionFieldErrors };

/**
 * The translations to store, in the editor's order: a locale is stored when it has a name; its slug is the one
 * typed, else made from the name. A locale with a description or slug but no name names the name as missing.
 */
export function parseCollectionForm(input: CollectionFormInput): ParsedCollection {
  const fields: CollectionFieldErrors = {};
  const translations: CollectionTranslationWrite[] = [];
  for (const locale of EDITOR_LOCALES) {
    const t = input.translations[locale];
    const name = t?.name ?? "";
    if (name === "") {
      if (locale === PUBLISH_LOCALE || (t && (t.slug !== "" || t.description !== ""))) fields[`${locale}.name`] = "required";
      continue;
    }
    const slug = t?.slug ? t.slug : slugify(name);
    if (!SLUG_PATTERN.test(slug) || slug.length > COLLECTION_SLUG_MAX_LENGTH) {
      fields[`${locale}.slug`] = "invalidSlug";
      continue;
    }
    translations.push({ locale, slug, name, description: t?.description ? t.description : null });
  }
  return Object.keys(fields).length > 0 ? { ok: false, fields } : { ok: true, translations };
}

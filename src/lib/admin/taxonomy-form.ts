import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import type { TaxonomyKind } from "@/lib/catalog/types";
import { EDITOR_LOCALES, PUBLISH_LOCALE } from "./product-form";
import { slugify } from "./slug";

/*
 * The form of a material or a colour (#25): its name per locale, the Ukrainian one required (the shop's
 * main market, as for a published product). Pure: shared by the form (field names, limits) and the server
 * action (the only place the input is trusted after parsing).
 */

export const TAXONOMY_KINDS = ["material", "colour"] as const satisfies readonly TaxonomyKind[];
/** A technical limit (the column's check), not a business value. */
export const TERM_NAME_MAX_LENGTH = 80;
/** The product form's field of the ticked materials and colours: one value per term id. */
export const PRODUCT_TERMS_FIELD = "terms";
/** At most this many terms on one product (a sanity bound of the form). */
export const MAX_PRODUCT_TERMS = 100;

export type TermFieldError = "required" | "tooLong";
export type TermFieldErrors = Partial<Record<string, TermFieldError>>;

/** The form field name of a term's name in a locale: `name.uk`. */
export function termNameField(locale: Locale): string {
  return `name.${locale}`;
}

export type TermInput = { id: string | null; kind: TaxonomyKind; names: Partial<Record<Locale, string>> };

export type TermParseResult = { ok: true; input: TermInput } | { ok: false; fields: TermFieldErrors; invalid?: true };

const head = z.object({
  id: z.union([z.literal("").transform(() => null), z.uuid()]),
  kind: z.enum(TAXONOMY_KINDS),
});

export function parseTermForm(values: Record<string, string | undefined>): TermParseResult {
  const parsed = head.safeParse({ id: values.id ?? "", kind: values.kind ?? "" });
  if (!parsed.success) return { ok: false, fields: {}, invalid: true };

  const fields: TermFieldErrors = {};
  const names: Partial<Record<Locale, string>> = {};
  for (const locale of EDITOR_LOCALES) {
    const name = (values[termNameField(locale)] ?? "").replace(/\s+/gu, " ").trim();
    if (name.length > TERM_NAME_MAX_LENGTH) fields[termNameField(locale)] = "tooLong";
    else if (name !== "") names[locale] = name;
  }
  if (names[PUBLISH_LOCALE] === undefined) fields[termNameField(PUBLISH_LOCALE)] ??= "required";
  if (Object.keys(fields).length > 0) return { ok: false, fields };
  return { ok: true, input: { id: parsed.data.id, kind: parsed.data.kind, names } };
}

/** The slug of a new term, for shop URLs: from its English name, else its Ukrainian one, else the kind. */
export function baseSlugFor(input: TermInput): string {
  return slugify(input.names.en ?? "") || slugify(input.names.uk ?? "") || input.kind;
}

/** `base`, else `base-2`, `base-3` …: the first slug no term of the list has. */
export function freeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

const termIds = z.array(z.uuid()).max(MAX_PRODUCT_TERMS);

/** The ids of the product form's ticked materials and colours, or null when they are not valid ids. */
export function parseTermIds(values: unknown[]): string[] | null {
  const parsed = termIds.safeParse(values);
  return parsed.success ? [...new Set(parsed.data)] : null;
}

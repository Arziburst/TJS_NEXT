import { z } from "zod";
import { locales, type Locale } from "@/i18n/routing";
import { EDITOR_LOCALES, PUBLISH_LOCALE } from "./product-form";

/*
 * The size editor's fields (#66) and their validation, shared by the editor (limits) and the server action (the
 * only place the input is trusted after parsing). Pure: no database access here. The database checks the same
 * rules (supabase/migrations/…_product_variants.sql).
 */

// technical limits, the same as the table's checks
export const VARIANT_LABEL_MAX_LENGTH = 100;
export const SKU_SUFFIX_MAX_LENGTH = 32;
export const SKU_SUFFIX_PATTERN = /^[A-Za-z0-9]+([.-][A-Za-z0-9]+)*$/;
/** ±$10 million in cents: the column's bound. */
const DELTA_MAX_MINOR = 1_000_000_000;

export type VariantFieldError = "labelRequired" | "tooLong" | "invalidDelta" | "priceNotPositive" | "invalidSuffix" | "suffixTaken";

/** Field name → error: `label.<locale>`, `priceDelta`, `skuSuffix`. */
export type VariantFieldErrors = Partial<Record<string, VariantFieldError>>;

export type VariantLabelSource = "human" | "machine";

/** What admin_save_product_variant takes (a label without a source is the admin's own: human). */
export type VariantInput = {
  labels: { locale: Locale; label: string; source?: VariantLabelSource }[];
  sku_suffix: string | null;
  price_delta_usd_minor: number;
};

/** The editor's raw input: a label per locale (empty ones are dropped), the difference as typed, the suffix. */
export const variantFormInput = z.object({
  labels: z.partialRecord(z.enum(locales), z.string().max(1000)),
  priceDelta: z.string().max(64),
  skuSuffix: z.string().max(200),
});

export type VariantFormInput = z.infer<typeof variantFormInput>;

/**
 * A signed USD amount as typed ("5", "+5", "-2.50", "−2,5") in cents; null for anything else. An empty field is
 * no difference.
 */
export function usdDeltaToMinor(text: string): number | null {
  const normalized = text.trim().replace(/−/g, "-").replace(",", ".").replace(/\s/g, "");
  if (normalized === "") return 0;
  const match = /^([+-]?)(\d{1,8})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const minor = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor > DELTA_MAX_MINOR) return null;
  return match[1] === "-" ? -minor : minor;
}

export type ParseVariantResult = { ok: true; input: VariantInput } | { ok: false; fields: VariantFieldErrors };

/**
 * Validates a size: the Ukrainian label is required (the admin's language, the fallback of every other), the
 * others optional; the difference keeps the size's price above zero; the suffix is letters and digits.
 */
export function parseVariantForm(values: VariantFormInput, productPriceUsdMinor: number): ParseVariantResult {
  const fields: VariantFieldErrors = {};
  const labels: VariantInput["labels"] = [];
  for (const locale of EDITOR_LOCALES) {
    const label = values.labels[locale]?.trim() ?? "";
    if (label === "") {
      if (locale === PUBLISH_LOCALE) fields[`label.${locale}`] = "labelRequired";
      continue;
    }
    if (label.length > VARIANT_LABEL_MAX_LENGTH) fields[`label.${locale}`] = "tooLong";
    else labels.push({ locale, label });
  }

  const delta = usdDeltaToMinor(values.priceDelta);
  if (delta === null) fields.priceDelta = "invalidDelta";
  else if (productPriceUsdMinor + delta <= 0) fields.priceDelta = "priceNotPositive";

  const suffix = values.skuSuffix.trim();
  if (suffix.length > SKU_SUFFIX_MAX_LENGTH) fields.skuSuffix = "tooLong";
  else if (suffix !== "" && !SKU_SUFFIX_PATTERN.test(suffix)) fields.skuSuffix = "invalidSuffix";

  if (Object.keys(fields).length > 0 || delta === null) return { ok: false, fields };
  return { ok: true, input: { labels, sku_suffix: suffix === "" ? null : suffix, price_delta_usd_minor: delta } };
}

/**
 * The source of each label of a re-saved size, like a product's translations (sourceAfterSave): a label the
 * admin left as it was keeps its own (a machine name stays machine), an edited or new one is the admin's (human).
 */
export function labelSources(
  labels: VariantInput["labels"],
  stored: readonly { locale: string; label: string; source: VariantLabelSource }[],
): VariantInput["labels"] {
  return labels.map(({ locale, label }) => {
    const before = stored.find((s) => s.locale === locale);
    return { locale, label, source: before && before.label === label ? before.source : "human" };
  });
}

/** "−2.50" style text of a stored difference, for the editor's field (cents → a plain signed decimal). */
export function minorToDeltaText(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const cents = abs % 100;
  return `${sign}${Math.floor(abs / 100)}${cents === 0 ? "" : `.${String(cents).padStart(2, "0")}`}`;
}

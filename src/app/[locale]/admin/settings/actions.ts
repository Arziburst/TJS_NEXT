"use server";

import { updateTag } from "next/cache";
import { getAdmin } from "@/lib/auth/session";
import { FX_CACHE_TAG } from "@/lib/money/cache";
import { ABOUT_EDITOR_LOCALES, ABOUT_PUBLISH_LOCALE } from "@/lib/settings/about";
import { ABOUT_TAG, SHOP_SETTINGS_TAG } from "@/lib/settings/cache";
import { contactFormValues, parseContactsForm, type ContactFieldErrors } from "@/lib/settings/contacts";
import { parsePriceSettingsForm, priceFormValues, type PriceFieldErrors } from "@/lib/settings/price-settings";
import { RICH_TEXT_MAX_LENGTH, sanitizeRichText } from "@/lib/settings/rich-text";
import { readAdminPriceSettings } from "@/lib/settings/store";
import { createSessionClient } from "@/lib/supabase/server";

/*
 * The admin's settings writes. Each action is a public entry point: it checks the admin itself, validates its
 * input (the parsers are the only place the input is trusted after) and writes through the caller's session,
 * so RLS, the column grants and the audit trigger apply; then it expires the storefront entries that show the
 * change (updateTag: the next request reads them again, no rebuild).
 */

export type SettingsError = "notAuthorized" | "unexpectedError";

// a saved state carries the values as stored, so the form shows exactly what the server kept
export type SettingsFormState<Fields> =
  | { status: "idle" }
  | { status: "error"; error?: SettingsError; fields?: Fields }
  | { status: "saved"; savedAt: number; values: Record<string, string> };

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;
  return values;
}

function refused(code: string | undefined): SettingsError {
  return code === "42501" ? "notAuthorized" : "unexpectedError";
}

export type ContactsFormState = SettingsFormState<ContactFieldErrors>;

/** The shop's name, contact channels and the Telegram chat id of the notifications. */
export async function saveContacts(_previous: ContactsFormState, formData: FormData): Promise<ContactsFormState> {
  if (!(await getAdmin())) return { status: "error", error: "notAuthorized" };
  const parsed = parseContactsForm(formValues(formData));
  if (!parsed.ok) return { status: "error", fields: parsed.fields };

  try {
    const supabase = await createSessionClient();
    const { error, count } = await supabase.from("shop_settings").update(parsed.row, { count: "exact" }).eq("id", 1);
    if (error) return { status: "error", error: refused(error.code) };
    // RLS lets an admin's update reach the row; a role revoked meanwhile reaches none
    if (count !== 1) return { status: "error", error: "notAuthorized" };
  } catch {
    return { status: "error", error: "unexpectedError" };
  }

  updateTag(SHOP_SETTINGS_TAG);
  return { status: "saved", savedAt: Date.now(), values: contactFormValues(parsed.row) };
}

export type PriceSettingsFormState = SettingsFormState<PriceFieldErrors>;

/** The markup of every display currency (D28) and each currency's charm rounding rule. */
export async function savePriceSettings(
  _previous: PriceSettingsFormState,
  formData: FormData,
): Promise<PriceSettingsFormState> {
  if (!(await getAdmin())) return { status: "error", error: "notAuthorized" };
  const stored = await readAdminPriceSettings();
  if (!stored) return { status: "error", error: "unexpectedError" };

  const decimalsOf = Object.fromEntries(stored.currencies.map((c) => [c.currency, c.decimals]));
  const parsed = parsePriceSettingsForm(formValues(formData), decimalsOf);
  if (!parsed.ok) return { status: "error", fields: parsed.fields };
  const { markupBps, rules } = parsed.input;

  try {
    const supabase = await createSessionClient();
    const { error } = await supabase.rpc("admin_save_price_settings", {
      p_markup_bps: markupBps,
      p_rules: Object.entries(rules).map(([currency, rule]) => ({
        currency,
        round_increment: rule.roundIncrement,
        ending: rule.ending,
        small_price_below: rule.smallPriceBelow,
        small_round_increment: rule.smallRoundIncrement,
        small_ending: rule.smallEnding,
      })),
    });
    if (error) return { status: "error", error: refused(error.code) };
  } catch {
    return { status: "error", error: "unexpectedError" };
  }

  // every price on the site is converted from these settings (src/lib/money/cache.ts)
  updateTag(FX_CACHE_TAG);
  return { status: "saved", savedAt: Date.now(), values: priceFormValues(markupBps, rules, decimalsOf) };
}

export type AboutErrorCode = "requiredToPublish" | "tooLong" | "textRequired";
export type AboutFieldErrors = Partial<Record<string, AboutErrorCode>>;
export type AboutFormState =
  | { status: "idle" }
  | { status: "error"; error?: SettingsError; fields?: AboutFieldErrors }
  // the texts as stored: what the server kept of each, so the editor shows exactly that
  | { status: "saved"; savedAt: number; texts: Partial<Record<string, { body: string; meta: string }>> };

const META_DESCRIPTION_MAX_LENGTH = 500;

/** The About page's texts (sanitized here) and its published state; publishing needs the uk text. */
export async function saveAbout(_previous: AboutFormState, formData: FormData): Promise<AboutFormState> {
  if (!(await getAdmin())) return { status: "error", error: "notAuthorized" };
  const values = formValues(formData);
  const published = values.published === "published";

  const fields: AboutFieldErrors = {};
  const translations: { locale: string; body_html: string; meta_description: string | null }[] = [];
  for (const locale of ABOUT_EDITOR_LOCALES) {
    const raw = values[`about.${locale}.body`] ?? "";
    const meta = (values[`about.${locale}.meta`] ?? "").trim().replace(/\s+/g, " ");
    if (raw.length > RICH_TEXT_MAX_LENGTH * 2) {
      fields[`about.${locale}.body`] = "tooLong";
      continue;
    }
    const body = sanitizeRichText(raw);
    if (body.length > RICH_TEXT_MAX_LENGTH) fields[`about.${locale}.body`] = "tooLong";
    if (meta.length > META_DESCRIPTION_MAX_LENGTH) fields[`about.${locale}.meta`] = "tooLong";
    if (body === "" && meta !== "") fields[`about.${locale}.body`] = "textRequired";
    if (body !== "") translations.push({ locale, body_html: body, meta_description: meta === "" ? null : meta });
  }
  if (published && !translations.some((t) => t.locale === ABOUT_PUBLISH_LOCALE) && !fields[`about.${ABOUT_PUBLISH_LOCALE}.body`]) {
    fields[`about.${ABOUT_PUBLISH_LOCALE}.body`] = "requiredToPublish";
  }
  if (Object.keys(fields).length > 0) return { status: "error", fields };

  try {
    const supabase = await createSessionClient();
    const { error } = await supabase.rpc("admin_save_about", { p_published: published, p_translations: translations });
    if (error) {
      if (error.code === "23514") return { status: "error", fields: { [`about.${ABOUT_PUBLISH_LOCALE}.body`]: "requiredToPublish" } };
      return { status: "error", error: refused(error.code) };
    }
  } catch {
    return { status: "error", error: "unexpectedError" };
  }

  updateTag(ABOUT_TAG);
  return {
    status: "saved",
    savedAt: Date.now(),
    texts: Object.fromEntries(translations.map((t) => [t.locale, { body: t.body_html, meta: t.meta_description ?? "" }])),
  };
}

"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { locales } from "@/i18n/routing";
import { allowVisitorAction } from "@/lib/cart/mutations";
import { createSessionClient } from "@/lib/supabase/server";
import { formValues, localeOnlySchema } from "./schemas";

/** Signs the visitor out (this device) and goes to the home page. Safe to call as a guest. */
export async function signOut(formData: FormData): Promise<void> {
  const parsed = localeOnlySchema.safeParse(formValues(formData));
  const locale = parsed.success ? parsed.data.locale : "en";
  try {
    const supabase = await createSessionClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // no session or Auth unreachable: the cookies are cleared by signOut where it can, nothing to report
  }
  redirect(`/${locale}`);
}

// Technical (coordinator): a person switches the language now and then; a script switching in a loop is stopped.
// Counted per account.
const LOCALE_RATE_LIMIT = { max: 20, windowSeconds: 3600 } as const;

/**
 * Stores the signed-in user's language in user_metadata.locale, the language of Auth's emails (#99). The header
 * calls it only when the page's locale differs from the stored one; a guest, an unchanged locale or a refused
 * attempt changes nothing and reports nothing (the emails then keep the previous language).
 */
export async function rememberLocale(input: unknown): Promise<void> {
  const parsed = z.enum(locales).safeParse(input);
  if (!parsed.success) return;
  const locale = parsed.data;
  try {
    const supabase = await createSessionClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user || data.user.user_metadata?.locale === locale) return;
    if (!(await allowVisitorAction("account-locale", LOCALE_RATE_LIMIT, data.user.id))) return;
    // merged into the metadata: name and phone stay
    const { error } = await supabase.auth.updateUser({ data: { locale } });
    if (error) console.error("auth: storing the locale failed", error.code ?? error.status);
  } catch {
    // Auth unreachable: the next change of language tries again
  }
}

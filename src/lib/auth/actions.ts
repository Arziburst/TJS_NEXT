"use server";

import { redirect } from "next/navigation";
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

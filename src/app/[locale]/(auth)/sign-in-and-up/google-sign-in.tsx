"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { signInWithGoogle } from "../actions";
import { FormError, SubmitButton } from "../_components/form-parts";
import { idle, type FormState } from "../form-state";

// Rendered only when Supabase Auth reports Google as enabled.
export function GoogleSignIn({ next }: { next?: string }) {
  const t = useTranslations("auth.google");
  const locale = useLocale();
  const [state, action] = useActionState<FormState<never>, FormData>(signInWithGoogle, idle);

  return (
    <form action={action} className="grid gap-4">
      <p className="flex items-center gap-3 font-input text-sm before:h-0.5 before:grow before:bg-hairline after:h-0.5 after:grow after:bg-hairline">
        {t("or")}
      </p>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormError code={state.status === "error" ? state.error : undefined} />
      <SubmitButton variant="outline">{t("continue")}</SubmitButton>
    </form>
  );
}

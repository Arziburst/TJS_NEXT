"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { updatePassword } from "../actions";
import { Field, FormError, SubmitButton, useFieldErrorText } from "../_components/form-parts";
import { idle, type FormState } from "../form-state";

export function UpdatePasswordForm() {
  const t = useTranslations("auth.updatePassword");
  const fieldError = useFieldErrorText();
  const locale = useLocale();
  const [state, action] = useActionState<FormState<"password" | "passwordAgain">, FormData>(updatePassword, idle);
  const errors = state.status === "error" ? state.fields : undefined;

  return (
    <form action={action} noValidate className="grid gap-5">
      <p className="font-input text-sm">{t("description")}</p>
      <input type="hidden" name="locale" value={locale} />
      <FormError code={state.status === "error" ? state.error : undefined} />
      <Field
        label={t("password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError(errors?.password)}
      />
      <Field
        label={t("passwordAgain")}
        name="passwordAgain"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError(errors?.passwordAgain)}
      />
      <SubmitButton>{t("submit")}</SubmitButton>
    </form>
  );
}

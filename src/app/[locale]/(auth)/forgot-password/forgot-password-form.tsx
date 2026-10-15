"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import { requestPasswordReset } from "../actions";
import { Field, FormError, FormSuccess, SubmitButton, useFieldErrorText } from "../_components/form-parts";
import { idle, type FormState } from "../form-state";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const fields = useTranslations("common.fields");
  const fieldError = useFieldErrorText();
  const locale = useLocale();
  const [state, action] = useActionState<FormState<"email">, FormData>(requestPasswordReset, idle);
  const backLink = (
    <Link href="/sign-in-and-up" className="justify-self-center font-input text-sm underline underline-offset-4 hover:text-accent">
      {t("backToSignIn")}
    </Link>
  );

  if (state.status === "success") {
    return (
      <div className="grid gap-5">
        <FormSuccess title={t("sentTitle")}>{t("sentText", { email: state.values.email ?? "" })}</FormSuccess>
        {backLink}
      </div>
    );
  }

  return (
    <form action={action} noValidate className="grid gap-5">
      <p className="font-input text-sm">{t("description")}</p>
      <input type="hidden" name="locale" value={locale} />
      <FormError code={state.status === "error" ? state.error : undefined} />
      <Field
        label={fields("email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.status === "error" ? state.values.email : undefined}
        error={fieldError(state.status === "error" ? state.fields?.email : undefined)}
      />
      <SubmitButton>{t("submit")}</SubmitButton>
      {backLink}
    </form>
  );
}

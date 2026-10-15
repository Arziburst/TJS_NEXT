"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { signUp } from "../actions";
import { Field, FormError, FormSuccess, SubmitButton, useFieldErrorText } from "../_components/form-parts";
import { idle, type FormState } from "../form-state";

type SignUpField = "name" | "email" | "phone" | "password" | "passwordAgain";

export function SignUpForm() {
  const t = useTranslations("auth.signUp");
  const fields = useTranslations("common.fields");
  const fieldError = useFieldErrorText();
  const locale = useLocale();
  const [state, action] = useActionState<FormState<SignUpField>, FormData>(signUp, idle);

  if (state.status === "success") {
    return (
      <FormSuccess title={t("checkEmailTitle")}>{t("checkEmailText", { email: state.values.email ?? "" })}</FormSuccess>
    );
  }

  const errors = state.status === "error" ? state.fields : undefined;
  const values = state.status === "idle" ? {} : state.values;

  return (
    <form action={action} noValidate className="grid gap-5">
      <p className="font-input text-sm">{t("description")}</p>
      <input type="hidden" name="locale" value={locale} />
      <FormError code={state.status === "error" ? state.error : undefined} />
      <Field
        label={fields("fullName")}
        name="name"
        autoComplete="name"
        required
        defaultValue={values.name}
        error={fieldError(errors?.name)}
      />
      <Field
        label={fields("email")}
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={values.email}
        error={fieldError(errors?.email)}
      />
      <Field
        label={fields("phone")}
        name="phone"
        type="tel"
        autoComplete="tel"
        required
        defaultValue={values.phone}
        error={fieldError(errors?.phone)}
      />
      <Field
        label={fields("password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError(errors?.password)}
      />
      <Field
        label={fields("passwordAgain")}
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

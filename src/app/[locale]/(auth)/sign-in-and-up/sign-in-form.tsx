"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Link } from "@/i18n/navigation";
import { signIn } from "../actions";
import { Field, FormError, SubmitButton, useFieldErrorText } from "../_components/form-parts";
import { idle, type FormState } from "../form-state";

export function SignInForm({ next }: { next?: string }) {
  const t = useTranslations("auth.signIn");
  const fields = useTranslations("common.fields");
  const fieldError = useFieldErrorText();
  const locale = useLocale();
  const [state, action] = useActionState<FormState<"email" | "password">, FormData>(signIn, idle);
  const errors = state.status === "error" ? state.fields : undefined;
  const values = state.status === "idle" ? {} : state.values;

  return (
    <form action={action} noValidate className="grid gap-5">
      <p className="font-input text-sm">{t("description")}</p>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormError code={state.status === "error" ? state.error : undefined} />
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
        label={fields("password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={fieldError(errors?.password)}
      />
      <SubmitButton>{t("submit")}</SubmitButton>
      <Link href="/forgot-password" className="justify-self-center font-input text-sm underline underline-offset-4 hover:text-accent">
        {t("forgotPassword")}
      </Link>
    </form>
  );
}

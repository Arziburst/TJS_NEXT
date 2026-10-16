"use server";

import type { AuthError } from "@supabase/supabase-js";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthProviders } from "@/lib/auth/providers";
import { allowAttempt, clientIp } from "@/lib/auth/rate-limit";
import {
  fieldErrors,
  forgotPasswordSchema,
  formValues,
  localeOnlySchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type FieldErrorCode,
} from "@/lib/auth/schemas";
import { authUrl } from "@/lib/auth/site-url";
import { createSessionClient } from "@/lib/supabase/server";
import type { FormErrorCode, FormState } from "./form-state";

// Every action is a public entry point: it validates its input, checks the rate limit and lets Supabase
// Auth decide; nothing here trusts a hidden field beyond the locale and a same-site `next` path.

type Fields<T extends string> = Partial<Record<T, FieldErrorCode>>;

function invalid<T extends string>(fields: Fields<T>, values: Record<string, string>): FormState<T> {
  return { status: "error", fields, values };
}

function failed<T extends string>(error: FormErrorCode, values: Record<string, string>): FormState<T> {
  return { status: "error", error, values };
}

function authErrorCode(error: AuthError): FormErrorCode {
  if (error.status === 429 || error.code === "over_request_rate_limit" || error.code === "over_email_send_rate_limit") {
    return "rateLimited";
  }
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    default:
      return "unexpectedError";
  }
}

async function ipAddress(): Promise<string> {
  return clientIp(await headers());
}

export async function signIn(_previous: FormState<"email" | "password">, formData: FormData) {
  const raw = formValues(formData);
  const kept = { email: raw.email ?? "" };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return invalid<"email" | "password">(fieldErrors(parsed.error), kept);
  const { locale, email, password, next } = parsed.data;

  if (!(await allowAttempt("sign-in", await ipAddress(), email))) return failed<"email" | "password">("rateLimited", kept);

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return failed<"email" | "password">(authErrorCode(error), kept);
  redirect(next ?? `/${locale}`);
}

type SignUpField = "name" | "email" | "phone" | "password" | "passwordAgain";

export async function signUp(_previous: FormState<SignUpField>, formData: FormData) {
  const raw = formValues(formData);
  const kept = { name: raw.name ?? "", email: raw.email ?? "", phone: raw.phone ?? "" };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return invalid<SignUpField>(fieldErrors(parsed.error), kept);
  const { locale, name, email, phone, password } = parsed.data;

  if (!(await allowAttempt("sign-up", await ipAddress(), email))) return failed<SignUpField>("rateLimited", kept);

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // the locale goes with the account: Auth's emails (the Send Email Hook, #99) are written in it
    options: { emailRedirectTo: authUrl(locale, "confirm"), data: { name, phone, locale } },
  });
  // An address that is already registered gets the same answer (no account enumeration).
  if (error && error.code !== "user_already_exists") return failed<SignUpField>(authErrorCode(error), kept);
  return { status: "success", values: { email } } satisfies FormState<SignUpField>;
}

export async function requestPasswordReset(_previous: FormState<"email">, formData: FormData) {
  const raw = formValues(formData);
  const kept = { email: raw.email ?? "" };
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return invalid<"email">(fieldErrors(parsed.error), kept);
  const { locale, email } = parsed.data;

  if (!(await allowAttempt("password-reset", await ipAddress(), email))) return failed<"email">("rateLimited", kept);

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authUrl(locale, "confirm") });
  // Unknown addresses and Auth's own per-address limit look like success: the page never tells whether an
  // account exists. Only a failure to reach Auth is reported.
  if (error && (!error.status || error.status >= 500)) {
    return failed<"email">("unexpectedError", kept);
  }
  return { status: "success", values: { email } } satisfies FormState<"email">;
}

export async function updatePassword(_previous: FormState<"password" | "passwordAgain">, formData: FormData) {
  const raw = formValues(formData);
  const parsed = updatePasswordSchema.safeParse(raw);
  if (!parsed.success) return invalid<"password" | "passwordAgain">(fieldErrors(parsed.error), {});
  const { locale, password } = parsed.data;

  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return failed<"password" | "passwordAgain">("sessionExpired", {});
  if (!(await allowAttempt("update-password", await ipAddress(), data.user.email))) {
    return failed<"password" | "passwordAgain">("rateLimited", {});
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return failed<"password" | "passwordAgain">(authErrorCode(error), {});
  redirect(`/${locale}`);
}

export async function signInWithGoogle(_previous: FormState<never>, formData: FormData) {
  const parsed = localeOnlySchema.safeParse(formValues(formData));
  if (!parsed.success) return failed<never>("unexpectedError", {});
  const { locale, next } = parsed.data;
  if (!(await getAuthProviders()).google) return failed<never>("googleUnavailable", {});

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authUrl(locale, "callback", next), skipBrowserRedirect: true },
  });
  if (error || !data.url) return failed<never>("unexpectedError", {});
  // the provider's authorization URL, as Supabase Auth returned it
  redirect(data.url as Route);
}

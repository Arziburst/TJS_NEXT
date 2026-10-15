import type { Route } from "next";
import { z } from "zod";
import { locales } from "@/i18n/routing";
import {
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PHONE_PATTERN,
  type FieldErrorCode,
} from "./limits";

export * from "./limits";

const EMAIL_MAX_LENGTH = 254;
// zod messages here are error codes (FieldErrorCode), not text; the form translates them
const PASSWORDS_DONT_MATCH: FieldErrorCode = "passwordsDontMatch";

const locale = z.enum(locales);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "required")
  .max(EMAIL_MAX_LENGTH, "invalidEmail")
  .pipe(z.email("invalidEmail"));

const newPassword = z
  .string()
  .min(1, "required")
  .min(PASSWORD_MIN_LENGTH, "passwordMinLength")
  .max(PASSWORD_MAX_LENGTH, "passwordMaxLength");

/** A same-site path to return to after signing in (one leading slash, never `//` or `/\`), else undefined. */
export function safeNextPath(value: string | null | undefined): Route | undefined {
  // a checked same-site path; which page it names is up to the router (an unknown one renders not-found)
  return value && /^\/(?![/\\])[^\s]*$/.test(value) ? (value as Route) : undefined;
}

const nextPath = z.string().optional().transform(safeNextPath);

export const signInSchema = z.object({
  locale,
  email,
  password: z.string().min(1, "required").max(PASSWORD_MAX_LENGTH, "passwordMaxLength"),
  next: nextPath,
});

export const signUpSchema = z
  .object({
    locale,
    name: z
      .string()
      .trim()
      .min(1, "required")
      .min(NAME_MIN_LENGTH, "nameMinLength")
      .max(NAME_MAX_LENGTH, "nameMaxLength"),
    email,
    phone: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s()-]/g, ""))
      .pipe(z.string().min(1, "required").regex(PHONE_PATTERN, "invalidPhone")),
    password: newPassword,
    passwordAgain: z.string().min(1, "required"),
  })
  .refine((data) => data.password === data.passwordAgain, { path: ["passwordAgain"], message: PASSWORDS_DONT_MATCH });

export const forgotPasswordSchema = z.object({ locale, email });

export const updatePasswordSchema = z
  .object({ locale, password: newPassword, passwordAgain: z.string().min(1, "required") })
  .refine((data) => data.password === data.passwordAgain, { path: ["passwordAgain"], message: PASSWORDS_DONT_MATCH });

export const localeOnlySchema = z.object({ locale, next: nextPath });

/** The first error code per field. */
export function fieldErrors<T extends string>(error: z.ZodError): Partial<Record<T, FieldErrorCode>> {
  const result: Partial<Record<T, FieldErrorCode>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in result) continue;
    result[field as T] = (isFieldErrorCode(issue.message) ? issue.message : "required") as FieldErrorCode;
  }
  return result;
}

const CODES: readonly FieldErrorCode[] = [
  "required",
  "invalidEmail",
  "invalidPhone",
  "nameMinLength",
  "nameMaxLength",
  "passwordMinLength",
  "passwordMaxLength",
  "passwordsDontMatch",
];

function isFieldErrorCode(value: string): value is FieldErrorCode {
  return (CODES as readonly string[]).includes(value);
}

/** FormData as a plain object of strings (files and repeated keys are ignored). */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !(key in values)) values[key] = value;
  }
  return values;
}

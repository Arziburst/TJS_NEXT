import type { FieldErrorCode } from "@/lib/auth/limits";

/** Form-level error codes; the form shows them through `auth.errors.<code>`. */
export type FormErrorCode =
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "rateLimited"
  | "weakPassword"
  | "samePassword"
  | "sessionExpired"
  | "googleUnavailable"
  | "linkInvalid"
  | "oauthFailed"
  | "unexpectedError";

/** What an auth action returns to its form; `values` refill the fields (never a password). */
export type FormState<Field extends string> =
  | { status: "idle" }
  | {
      status: "error";
      error?: FormErrorCode;
      fields?: Partial<Record<Field, FieldErrorCode>>;
      values: Record<string, string>;
    }
  | { status: "success"; values: Record<string, string> };

export const idle = { status: "idle" } as const;

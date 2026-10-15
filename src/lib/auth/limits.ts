// Shared by the server actions and the forms; no dependencies, so the client bundle stays small.

// The same minimum as supabase/config.toml `minimum_password_length` (tests/auth/schemas.test.ts keeps them
// equal); Supabase Auth refuses shorter passwords anyway.
export const PASSWORD_MIN_LENGTH = 6;
// Legacy sign-up rule: a name of at least 4 characters ("Name and surname").
export const NAME_MIN_LENGTH = 4;
export const NAME_MAX_LENGTH = 100;
// International format, as the profiles.phone check (e.g. +380946826242).
export const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt uses the first 72 bytes only

/** Field error codes; the form shows them through `errors.form.<code>`. */
export type FieldErrorCode =
  | "required"
  | "invalidEmail"
  | "invalidPhone"
  | "nameMinLength"
  | "nameMaxLength"
  | "passwordMinLength"
  | "passwordMaxLength"
  | "passwordsDontMatch";


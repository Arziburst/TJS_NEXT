"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth/session";
import { authUrl } from "@/lib/auth/site-url";
import { createSavedAddress, deleteSavedAddress, makeDefaultAddress } from "@/lib/account/addresses";
import { updateOwnProfile } from "@/lib/account/profile";
import {
  addressIdSchema,
  emailChangeSchema,
  invalidProfileFields,
  newAddressSchema,
  profileSchema,
  type ProfileField,
} from "@/lib/account/schemas";
import { allowVisitorAction } from "@/lib/cart/mutations";
import { createSessionClient } from "@/lib/supabase/server";

// Every action is a public entry point: it validates its input with zod, re-reads the signed-in user from the
// session (never from the input), counts against a rate limit and writes through the user's session client,
// so RLS keeps it to the user's own rows.

// Technical (coordinator): a person edits a few fields or addresses at a time; a script that hammers the
// account is stopped. Counted per account.
const ACCOUNT_RATE_LIMIT = { max: 30, windowSeconds: 300 } as const;
// An email change sends two emails: kept low, on top of Supabase Auth's own email limits.
const EMAIL_CHANGE_RATE_LIMIT = { max: 5, windowSeconds: 3600 } as const;

type Failure<R extends string> = { ok: false; reason: R | "signedOut" | "rateLimited" | "unexpectedError" };

export type ProfileResult = { ok: true } | { ok: false; reason: "invalid"; fields: ProfileField[] } | Failure<never>;

export async function updateProfileAction(input: unknown): Promise<ProfileResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", fields: invalidProfileFields(parsed.error) };
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signedOut" };
  if (!(await allowVisitorAction("account", ACCOUNT_RATE_LIMIT, user.id))) return { ok: false, reason: "rateLimited" };

  const { firstName, lastName, phone } = parsed.data;
  const saved = await updateOwnProfile(await createSessionClient(), user.id, { firstName, lastName, phone });
  if (!saved) return { ok: false, reason: "unexpectedError" };
  refresh();
  return { ok: true };
}

export type EmailChangeResult = { ok: true; email: string } | Failure<"invalid" | "same">;

/**
 * Asks Supabase Auth to change the user's email: it sends a confirmation link to the current and to the new
 * address (double_confirm_changes), and the email changes only once both are followed (auth/confirm).
 */
export async function changeEmailAction(input: unknown): Promise<EmailChangeResult> {
  const parsed = emailChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signedOut" };
  const { locale, email } = parsed.data;
  if (email === user.email?.toLowerCase()) return { ok: false, reason: "same" };
  if (!(await allowVisitorAction("account-email", EMAIL_CHANGE_RATE_LIMIT, user.id))) return { ok: false, reason: "rateLimited" };

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: authUrl(locale, "confirm") });
  if (error) {
    if (error.status === 429 || error.code === "over_email_send_rate_limit") return { ok: false, reason: "rateLimited" };
    if (error.code === "email_address_invalid" || error.code === "validation_failed") return { ok: false, reason: "invalid" };
    // An address that belongs to another account gets no answer of its own (no account enumeration): it
    // reads like a failure to send.
    console.error("account: email change failed", error.code ?? error.status);
    return { ok: false, reason: "unexpectedError" };
  }
  refresh();
  return { ok: true, email };
}

export type AddressResult = { ok: true } | Failure<"invalid" | "limitReached" | "notFound">;

export async function saveAddressAction(input: unknown): Promise<AddressResult> {
  const parsed = newAddressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return writeAddress((client) => createSavedAddress(client, parsed.data));
}

export async function makeDefaultAddressAction(input: unknown): Promise<AddressResult> {
  const parsed = addressIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return writeAddress((client) => makeDefaultAddress(client, parsed.data.id));
}

export async function deleteAddressAction(input: unknown): Promise<AddressResult> {
  const parsed = addressIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return writeAddress((client) => deleteSavedAddress(client, parsed.data.id));
}

async function writeAddress(
  write: (client: Awaited<ReturnType<typeof createSessionClient>>) => Promise<AddressResult>,
): Promise<AddressResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "signedOut" };
  if (!(await allowVisitorAction("account", ACCOUNT_RATE_LIMIT, user.id))) return { ok: false, reason: "rateLimited" };
  const result = await write(await createSessionClient());
  if (result.ok) refresh();
  return result;
}

import "server-only";

import type { ServerSupabaseClient } from "@/lib/supabase/server";
import { displayName, profileNames } from "./names";

// The signed-in customer's profile as the account page shows and edits it. Every read and write goes through
// the customer's session client: RLS lets them reach only their own profile row.

export type AccountProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  // an email change waiting for its confirmation links
  newEmail: string | null;
};

/** The current user's profile, or null for a guest; throws when it cannot be read. */
export async function readAccountProfile(client: ServerSupabaseClient): Promise<AccountProfile | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { user } = data;
  const profile = await client.from("profiles").select("first_name, last_name, name, phone").eq("id", user.id).maybeSingle();
  if (profile.error) throw new Error(`account: ${profile.error.message}`);
  const row = profile.data;
  const names = profileNames({ firstName: row?.first_name ?? null, lastName: row?.last_name ?? null, name: row?.name ?? null });
  return { ...names, phone: row?.phone ?? "", email: user.email ?? "", newEmail: user.new_email ?? null };
}

/** The first and last name the checkout prefills for `userId`; empty when they cannot be read. */
export async function readContactNames(client: ServerSupabaseClient, userId: string) {
  const { data } = await client.from("profiles").select("first_name, last_name, name").eq("id", userId).maybeSingle();
  return profileNames({ firstName: data?.first_name ?? null, lastName: data?.last_name ?? null, name: data?.name ?? null });
}

export type ProfileUpdate = { firstName: string; lastName: string | null; phone: string | null };

/** Writes the user's own names and phone; `name` follows as "first last" (the display name). */
export async function updateOwnProfile(client: ServerSupabaseClient, userId: string, update: ProfileUpdate): Promise<boolean> {
  const { data, error } = await client
    .from("profiles")
    .update({
      first_name: update.firstName,
      last_name: update.lastName,
      name: displayName(update.firstName, update.lastName),
      phone: update.phone,
    })
    .eq("id", userId)
    .select("id");
  if (error) console.error("account: profile update failed", error);
  return !error && data.length === 1;
}

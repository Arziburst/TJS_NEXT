import "server-only";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import type { Database } from "@/lib/supabase/database.types";
import { createSessionClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { testErrorRequested } from "@/lib/test-error";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: UserRole;
  // the language of Auth's emails (user_metadata.locale, #99): set at sign-up, then on a change of language
  locale: Locale | null;
};

/**
 * Auth or the profile could not be read (the network, or the server answering 5xx): it is not known who is
 * signed in. Thrown, never read as signed out: a page then shows the error page (reload to retry), a client
 * calling an action shows its "try again" message.
 */
export class SessionUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("the session could not be verified", options);
    this.name = "SessionUnavailableError";
  }
}

/**
 * The signed-in user of `client`, verified with the Auth server (a deleted user or a revoked session reads
 * as signed out), with name, phone and role from their profile. Null for a guest. A failed request to Auth
 * is tried once more; if it fails again, or the profile cannot be read, it throws SessionUnavailableError.
 */
export async function resolveUser(client: ServerSupabaseClient): Promise<CurrentUser | null> {
  let answer = await client.auth.getUser();
  if (isAuthRetryableFetchError(answer.error)) answer = await client.auth.getUser();
  if (isAuthRetryableFetchError(answer.error)) throw new SessionUnavailableError({ cause: answer.error });
  const { data, error } = answer;
  if (error || !data.user) return null;
  const { user } = data;
  const locale: unknown = user.user_metadata?.locale;
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("name, phone, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw new SessionUnavailableError({ cause: profileError });
  return {
    id: user.id,
    email: user.email ?? null,
    name: profile?.name ?? null,
    phone: profile?.phone ?? null,
    // no readable profile means no role: never more than a customer
    role: profile?.role ?? "customer",
    locale: typeof locale === "string" && hasLocale(routing.locales, locale) ? locale : null,
  };
}

/**
 * `read`, or `unavailable` when it throws SessionUnavailableError (#112): for the header's slots, which sit in the
 * root layout and fall back to their plain links in an Auth outage instead of failing every page.
 */
export async function unlessSessionUnavailable<T, U>(read: Promise<T>, unavailable: U): Promise<T | U> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof SessionUnavailableError) return unavailable;
    throw error;
  }
}

/** The current request's user, or null for a guest; read once per request. Throws SessionUnavailableError. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // request time only: the Auth client reads the clock (token expiry), which a prerender must not do
  await connection();
  if (await testErrorRequested("session")) throw new SessionUnavailableError();
  return resolveUser(await createSessionClient());
});

export function signInPath(locale: Locale, next?: string): Route {
  const path = `/${locale}/sign-in-and-up`;
  // typed routes do not model the dynamic [locale] prefix with a query string
  return (next ? `${path}?next=${encodeURIComponent(next)}` : path) as Route;
}

/** For pages only signed-in users may see: a guest is sent to sign in (and back to `next`). */
export async function requireUser(locale: Locale, next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(locale, next));
  return user;
}

/**
 * For admin pages: a guest is sent to sign in, a signed-in non-admin gets the not-found page (the admin area
 * does not reveal itself). The role comes from the database on every request, never from the client.
 */
export async function requireAdmin(locale: Locale, next?: string): Promise<CurrentUser> {
  const user = await requireUser(locale, next);
  if (user.role !== "admin") notFound();
  return user;
}

/** For Server Actions and Route Handlers: the admin, or null (the caller returns its own refusal). */
export async function getAdmin(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

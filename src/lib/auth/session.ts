import "server-only";

import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import type { Locale } from "@/i18n/routing";
import type { Database } from "@/lib/supabase/database.types";
import { createSessionClient, type ServerSupabaseClient } from "@/lib/supabase/server";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type CurrentUser = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: UserRole;
};

/**
 * The signed-in user of `client`, verified with the Auth server (a deleted user or a revoked session reads
 * as signed out, never as an error), with name, phone and role from their profile. Null for a guest.
 */
export async function resolveUser(client: ServerSupabaseClient): Promise<CurrentUser | null> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    const { user } = data;
    const { data: profile } = await client
      .from("profiles")
      .select("name, phone, role")
      .eq("id", user.id)
      .maybeSingle();
    return {
      id: user.id,
      email: user.email ?? null,
      name: profile?.name ?? null,
      phone: profile?.phone ?? null,
      // no readable profile means no role: never more than a customer
      role: profile?.role ?? "customer",
    };
  } catch {
    return null;
  }
}

/** The current request's user, or null for a guest; read once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // request time only: the Auth client reads the clock (token expiry), which a prerender must not do
  await connection();
  try {
    return await resolveUser(await createSessionClient());
  } catch {
    return null;
  }
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

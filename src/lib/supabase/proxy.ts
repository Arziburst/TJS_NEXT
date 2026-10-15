// Used by src/proxy.ts only (no "server-only": the proxy bundle is not built with the react-server condition).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "./database.types";

type CookieToSet = { name: string; value: string; options: CookieOptions };
export type ApplySession = (response: NextResponse) => NextResponse;

const unchanged: ApplySession = (response) => response;

/** True when the request carries a Supabase auth cookie (sb-<ref>-auth-token, possibly chunked). */
export function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}

/**
 * Refreshes an expiring session before the page renders. The new cookies go into the request (so Server
 * Components read the fresh session) and, through the returned function, into the response. A guest
 * without auth cookies costs nothing; a broken or revoked session never fails the request, it just stays
 * signed out. This is not an authorization check: pages and actions check the user themselves.
 */
export async function refreshSession(request: NextRequest): Promise<ApplySession> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey || !hasAuthCookie(request)) return unchanged;

  const pending = new Map<string, CookieToSet>();
  const headers: Record<string, string> = {};
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, cacheHeaders) => {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          pending.set(cookie.name, cookie);
        }
        Object.assign(headers, cacheHeaders);
      },
    },
  });

  try {
    await supabase.auth.getClaims();
  } catch {
    return unchanged;
  }
  if (pending.size === 0) return unchanged;

  return (response) => {
    for (const { name, value, options } of pending.values()) response.cookies.set(name, value, options);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  };
}

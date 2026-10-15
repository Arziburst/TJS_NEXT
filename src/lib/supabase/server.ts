import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export type ServerSupabaseClient = SupabaseClient<Database>;

function publicConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return { url, anonKey };
}

// Next's build puts every fetch without a cache option into an implicit fetch cache (.next/cache/fetch-cache,
// kept for a year) that the next build reads again, so a build would prerender the previous build's rows.
// The reads are never fetch-cached: "use cache" entries (cacheLife, cacheTag) alone decide their freshness.
const uncachedFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/**
 * A server-side client that acts as an anonymous visitor: no session and no cookies, so RLS applies as for
 * `anon` and the result is the same for every request (safe to cache).
 */
export function createPublicServerClient(): ServerSupabaseClient {
  const { url, anonKey } = publicConfig();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: uncachedFetch },
  });
}

/**
 * A client bound to the visitor's session cookies (RLS as that user). Per request: never cache its results
 * in a shared cache. Server Components cannot write cookies, so a refresh there is dropped silently; the
 * proxy (src/proxy.ts) refreshes the session before rendering, and Server Actions and Route Handlers write
 * the new cookies themselves.
 */
export async function createSessionClient(): Promise<ServerSupabaseClient> {
  const { url, anonKey } = publicConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // called from a Server Component: the proxy has already refreshed the session
        }
      },
    },
  });
}

/**
 * The service-role client: bypasses RLS. Only for server code that has checked the caller itself (the
 * rate limit counter, admin screens after requireAdmin()). The key never leaves the server.
 */
export function createServiceClient(): ServerSupabaseClient {
  const { url } = publicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

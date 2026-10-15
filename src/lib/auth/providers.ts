import "server-only";

import { cacheLife } from "next/cache";
import { FAILED_READ_LIFE } from "@/lib/failed-read";

export type AuthProviders = { google: boolean };

/**
 * Which sign-in providers Supabase Auth has switched on (its public settings), so the Google button shows
 * only when the provider is configured. Unreachable settings read as "off" for this request only.
 */
export async function getAuthProviders(): Promise<AuthProviders> {
  "use cache";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    cacheLife("minutes");
    return { google: false };
  }
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    if (!response.ok) throw new Error(`auth settings answered ${response.status}`);
    const settings = (await response.json()) as { external?: Record<string, unknown> };
    cacheLife("minutes");
    return { google: settings.external?.google === true };
  } catch (error) {
    console.error("auth: provider settings unavailable", error);
    // a failure is read again by the next request instead of hiding the Google button for minutes, and is
    // never baked into a prerender (docs/standards.md, "A failed read is never cached as data")
    cacheLife(FAILED_READ_LIFE);
    return { google: false };
  }
}

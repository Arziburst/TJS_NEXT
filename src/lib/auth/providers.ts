import "server-only";

import { cacheLife } from "next/cache";

export type AuthProviders = { google: boolean };

/**
 * Which sign-in providers Supabase Auth has switched on (its public settings), so the Google button shows
 * only when the provider is configured. Unreachable settings read as "off".
 */
export async function getAuthProviders(): Promise<AuthProviders> {
  "use cache";
  cacheLife("minutes");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { google: false };
  try {
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } });
    if (!response.ok) return { google: false };
    const settings = (await response.json()) as { external?: Record<string, unknown> };
    return { google: settings.external?.google === true };
  } catch {
    return { google: false };
  }
}

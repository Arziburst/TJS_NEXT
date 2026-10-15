import { existsSync } from "node:fs";

export type LocalStack = { url: string; anonKey: string; serviceRoleKey: string };

/**
 * The local Supabase stack this checkout points at (.env.local, written by `npm run supabase:start:worktree`),
 * or null when there is none. Only a loopback URL counts: these tests write data.
 */
export function localStack(): LocalStack | null {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") return null;
  return { url, anonKey, serviceRoleKey };
}

import { existsSync } from "node:fs";

export type LocalStack = { url: string; anonKey: string; serviceRoleKey: string };

function configuredStack(): LocalStack | null {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) return null;
  const { hostname } = new URL(url);
  if (hostname !== "127.0.0.1" && hostname !== "localhost") return null;
  return { url, anonKey, serviceRoleKey };
}

/**
 * The local Supabase stack this checkout points at (.env.local, written by `npm run supabase:start:worktree`),
 * or null when there is none, so the integration suites skip. Only a loopback URL counts: these tests write
 * data. With REQUIRE_LOCAL_STACK=1 (the CI integration step) a missing stack is an error instead, so the
 * suites can never pass by skipping; a configured stack that is down fails on its first query anyway.
 */
export function localStack(): LocalStack | null {
  const stack = configuredStack();
  if (!stack && process.env.REQUIRE_LOCAL_STACK === "1") {
    throw new Error(
      "REQUIRE_LOCAL_STACK=1 but no local Supabase stack is configured: NEXT_PUBLIC_SUPABASE_URL (a 127.0.0.1 or " +
        "localhost URL), NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must come from .env.local or the " +
        "environment (CI: scripts/ci/Write-StackEnv.ps1)",
    );
  }
  return stack;
}

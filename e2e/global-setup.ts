import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

// Product photos for the seeded products (npm run seed:images) when a local stack is configured; the
// product page tests need them. A run against a deployed app without a local stack skips this.
export default function globalSetup() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    console.log("e2e setup: no local Supabase stack, product images not seeded");
    return;
  }
  execFileSync(process.execPath, ["scripts/dev/seed-images.mjs"], { stdio: "inherit" });
}

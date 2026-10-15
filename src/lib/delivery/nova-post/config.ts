import "server-only";
import { createNovaPostClient, NOVA_POST_PRODUCTION_URL, type NovaPostClient } from "./client";

let cached: { key: string; url: string; client: NovaPostClient } | null = null;

/**
 * The Nova Post client of this server, or null while NOVA_POST_API_KEY is unset (no contract yet): the
 * delivery then falls back to the zone flat rates. NOVA_POST_API_URL picks the sandbox; production
 * otherwise. One client per process keeps its JWT for the hour it lives.
 */
export function getNovaPostClient(): NovaPostClient | null {
  const key = process.env.NOVA_POST_API_KEY?.trim();
  if (!key) return null;
  const url = process.env.NOVA_POST_API_URL?.trim() || NOVA_POST_PRODUCTION_URL;
  if (cached?.key !== key || cached.url !== url) {
    cached = { key, url, client: createNovaPostClient({ apiKey: key, baseUrl: url }) };
  }
  return cached.client;
}

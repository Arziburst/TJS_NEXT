import "server-only";

import { createNovaPoshtaClient, httpTransport, type NovaPoshtaClient } from "./api";
import { fixtureTransport } from "./fixture-transport";

/*
 * The app's Nova Poshta client. The key comes only from NOVA_POSHTA_API_KEY (server-only); without one the
 * client still calls the API, whose dictionary and price methods answer without a key. NOVA_POSHTA_FIXTURES
 * = "true" answers from the recorded fixtures instead (local walks, e2e); never set it on Vercel.
 */
export function novaPoshtaClient(): NovaPoshtaClient {
  if (process.env.NOVA_POSHTA_FIXTURES === "true") return createNovaPoshtaClient({ transport: fixtureTransport });
  return createNovaPoshtaClient({ transport: httpTransport({ apiKey: process.env.NOVA_POSHTA_API_KEY ?? "" }) });
}

import "server-only";

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/*
 * Test-only (#93): lets an e2e test hold a storefront render between its catalog read and the end of the
 * render, so it can save the product in the admin meanwhile (e2e/cache-race.e2e.ts). Off unless the server
 * runs with TJS_TEST_RENDER_HOLD_DIR, which only the e2e web server gets (playwright.config.ts), never a
 * deployment. A render that read a product holds while `<dir>/<product id>.hold` exists (at most
 * HOLD_LIMIT_MS) and marks `<dir>/<product id>.held` when it starts holding.
 */
const POLL_MS = 25;
const HOLD_LIMIT_MS = 30_000;
const PRODUCT_ID = /^[0-9a-f-]{36}$/;

export async function holdRenderForTest(productIds: readonly string[]): Promise<void> {
  const dir = process.env.TJS_TEST_RENDER_HOLD_DIR;
  if (!dir) return;
  const held = productIds.filter((id) => PRODUCT_ID.test(id) && existsSync(join(dir, `${id}.hold`)));
  if (held.length === 0) return;
  for (const id of held) writeFileSync(join(dir, `${id}.held`), "");
  const until = Date.now() + HOLD_LIMIT_MS;
  while (held.some((id) => existsSync(join(dir, `${id}.hold`))) && Date.now() < until) await sleep(POLL_MS);
}

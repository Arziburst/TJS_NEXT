import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Where the e2e server's test-only render hold looks for its files (src/lib/catalog/render-hold.ts): the
 * config passes it to the server, e2e/cache-race.e2e.ts writes the files. One folder per server port.
 */
export const RENDER_HOLD_DIR = join(tmpdir(), `tjs-e2e-render-hold-${process.env.E2E_PORT || 3000}`);

import { config } from "zod";

// Before the app's code runs in the browser. zod compiles its object parsers with `new Function` once it has
// probed that eval is allowed; the Content-Security-Policy has no 'unsafe-eval' (src/lib/security/headers.ts),
// so the probe only logs a violation. Jitless parsing skips the probe and the eval (#31).
config({ jitless: true });

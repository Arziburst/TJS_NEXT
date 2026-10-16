// Before the app's code runs in the browser. zod compiles its object parsers with `new Function` once it has
// probed that eval is allowed; the Content-Security-Policy has no 'unsafe-eval' (src/lib/security/headers.ts),
// so the probe only logs a violation. Jitless parsing skips the probe and the eval (#31).
// zod keeps its configuration in this global, shared by every copy and read when it loads; setting it here, not
// through `config` from "zod", keeps zod itself out of every page's first JavaScript (#105, tests/zod-jitless.test.ts).
const zodGlobal = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
Object.assign((zodGlobal.__zod_globalConfig ??= {}), { jitless: true });

export {};

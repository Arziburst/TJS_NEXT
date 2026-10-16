// Before the app's code runs in the browser. zod compiles its object parsers with `new Function` once it has
// probed that eval is allowed; the Content-Security-Policy has no 'unsafe-eval' (src/lib/security/headers.ts),
// so the probe only logs a violation. Jitless parsing skips the probe and the eval (#31).
// zod 4.6.7 (pinned in package.json) keeps its configuration in this global, shared by every copy and read when
// it loads (v4/core/core.js). Setting it here, not through `config` from "zod", keeps zod itself out of every
// page's first JavaScript: that import cost ~5 KB gzip on every route (#105). tests/zod-jitless.test.ts fails if
// an upgrade moves the global.
const zodGlobal = globalThis as { __zod_globalConfig?: { jitless?: boolean } };
Object.assign((zodGlobal.__zod_globalConfig ??= {}), { jitless: true });

export {};

// No Nova Poshta key and no Nova Poshta client code in what the browser downloads: scans the client bundle of
// the production build (.next/static). Runs after `npm run build` (the CI integration step); skipped before a
// build, except under REQUIRE_LOCAL_STACK=1 (CI), where a missing build is a failure.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STATIC_DIR = ".next/static";
const built = existsSync(".next/BUILD_ID") && existsSync(STATIC_DIR);

if (!built && process.env.REQUIRE_LOCAL_STACK === "1") {
  throw new Error("REQUIRE_LOCAL_STACK=1 but there is no production build to scan: run `npm run build` first");
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

// what only the server-side clients know: their env names, endpoints, request vocabulary and recorded fixtures
const FORBIDDEN = [
  "NOVA_POSHTA_API_KEY",
  "NOVA_POSHTA_FIXTURES",
  "api.novaposhta.ua",
  "searchSettlementStreets",
  "getDocumentPrice",
  "InternetDocument",
  "TypeOfWarehouseRef",
  "recordedAt",
  // Nova Post international (#23)
  "NOVA_POST_API_KEY",
  "NOVA_POST_API_URL",
  "api.novapost.com",
  "api-stage.novapost",
  "clients/authorization",
  "shipments/calculations",
  "e2e-fixture-key",
];

describe.skipIf(!built)("the client bundle of the production build", () => {
  const scripts = built ? files(STATIC_DIR).filter((path) => /\.(js|mjs|css|json)$/.test(path)) : [];
  const contents = scripts.map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it("contains the delivery UI, so the scan covers it", () => {
    // a marker of src/components/delivery (data-slot), shipped to the browser with the components
    expect(contents.some(({ text }) => text.includes("delivery-city-combobox"))).toBe(true);
    // ... and of src/components/delivery/nova-post
    expect(contents.some(({ text }) => text.includes("international-delivery"))).toBe(true);
  });

  it.each(FORBIDDEN)("does not contain %s", (needle) => {
    expect(contents.filter(({ text }) => text.includes(needle)).map(({ path }) => path)).toEqual([]);
  });

  it.each(["NOVA_POSHTA_API_KEY", "NOVA_POST_API_KEY"])("does not contain the configured %s", (name) => {
    if (existsSync(".env.local")) process.loadEnvFile(".env.local");
    const key = process.env[name];
    // CI has no key: the names above are what can leak there
    if (!key) return;
    expect(contents.filter(({ text }) => text.includes(key)).map(({ path }) => path)).toEqual([]);
  });
});

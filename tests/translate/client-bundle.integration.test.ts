// No gateway key and no translation code in what the browser downloads: scans the client bundle of the
// production build (.next/static). Runs after `npm run build` (the CI integration step); skipped before a build,
// except under REQUIRE_LOCAL_STACK=1 (CI), where a missing build is a failure.
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

// what only src/lib/translate knows: its env names, the gateway, the model, the prompt and the glossary
const FORBIDDEN = [
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_BASE_URL",
  "AI_GATEWAY_OIDC",
  "ai-gateway.vercel.sh",
  "ai-language-model-specification-version",
  "claude-sonnet-5.5",
  "You translate the product texts",
  "застібка-карабін",
  "Karabinerverschluss",
];

describe.skipIf(!built)("the client bundle of the production build (translation)", () => {
  const scripts = built ? files(STATIC_DIR).filter((path) => /\.(js|mjs|css|json)$/.test(path)) : [];
  const contents = scripts.map((path) => ({ path, text: readFileSync(path, "utf8") }));

  it("contains the admin's translation UI, so the scan covers it", () => {
    expect(contents.some(({ text }) => text.includes("translate-panel"))).toBe(true);
    expect(contents.some(({ text }) => text.includes("bulk-translation-bar"))).toBe(true);
  });

  it.each(FORBIDDEN)("does not contain %s", (needle) => {
    expect(contents.filter(({ text }) => text.includes(needle)).map(({ path }) => path)).toEqual([]);
  });

  it("does not contain the configured gateway key", () => {
    if (existsSync(".env.local")) process.loadEnvFile(".env.local");
    const key = process.env.AI_GATEWAY_API_KEY;
    if (!key) return;
    expect(contents.filter(({ text }) => text.includes(key)).map(({ path }) => path)).toEqual([]);
  });
});

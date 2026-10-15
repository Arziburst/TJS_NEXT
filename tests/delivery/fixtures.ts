import { readFileSync } from "node:fs";

// The Nova Post API answers of tests/delivery/fixtures/nova-post, shaped after the public OpenAPI spec
// (api.novapost.com/developers/spec.yaml, api-portal.novapost.com): no recorded traffic, no personal data.
export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/nova-post/${name}.json`, import.meta.url), "utf8"));
}

// The fixture JWT expires at 2026-10-15T14:00:00Z
export const FIXTURE_JWT_EXPIRY = Date.parse("2026-10-15T14:00:00Z");

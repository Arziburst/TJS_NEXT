import { describe, expect, it } from "vitest";
import { resolveSettings } from "../../scripts/translate/missing.mjs";

const local = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:41191", SUPABASE_SERVICE_ROLE_KEY: "service" };
const remote = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };
const none = { envFile: "no-such-file" };

describe("scripts/translate/missing.mjs settings", () => {
  it("refuses a non-loopback database without --production", () => {
    expect(resolveSettings(remote, none).settings).toBeNull();
    expect(resolveSettings(remote, { ...none, production: true }).settings).toMatchObject({ host: "abc.supabase.co" });
  });

  it("needs a gateway key only to apply", () => {
    expect(resolveSettings(local, none).settings).not.toBeNull();
    expect(resolveSettings(local, { ...none, apply: true }).reason).toMatch(/AI_GATEWAY_API_KEY/);
    expect(resolveSettings({ ...local, AI_GATEWAY_API_KEY: "k" }, { ...none, apply: true }).settings).not.toBeNull();
  });

  it("never sends production traffic to a stand-in gateway", () => {
    const env = { ...remote, AI_GATEWAY_API_KEY: "k", AI_GATEWAY_BASE_URL: "http://127.0.0.1:4500/v4/ai" };
    expect(resolveSettings(env, { ...none, production: true, apply: true }).settings).toMatchObject({ baseURL: undefined });
    expect(resolveSettings({ ...env, ...local }, { ...none, apply: true }).settings).toMatchObject({
      baseURL: "http://127.0.0.1:4500/v4/ai",
    });
  });
});

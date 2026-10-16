import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { isTranslationConfigured, translationModel } = await import("@/lib/translate/gateway");

describe("the translation gateway configuration", () => {
  it("is off without a key and without OIDC switched on", () => {
    expect(isTranslationConfigured({})).toBe(false);
    expect(isTranslationConfigured({ AI_GATEWAY_API_KEY: "  " })).toBe(false);
    // Vercel always has an OIDC token: it does not switch translation on by itself
    expect(isTranslationConfigured({ VERCEL_OIDC_TOKEN: "token", AI_GATEWAY_OIDC: "1" })).toBe(false);
  });

  it("is on with AI_GATEWAY_API_KEY, or with AI_GATEWAY_OIDC=true", () => {
    expect(isTranslationConfigured({ AI_GATEWAY_API_KEY: "key" })).toBe(true);
    expect(isTranslationConfigured({ AI_GATEWAY_OIDC: "true" })).toBe(true);
  });

  it("translates with the model constant through the gateway", () => {
    const model = translationModel({ AI_GATEWAY_API_KEY: "key" });
    // the gateway's dotted id; the Anthropic API id "claude-sonnet-5-5" is a 404 there
    expect(model).toMatchObject({ modelId: "anthropic/claude-sonnet-5.5", provider: "gateway" });
  });
});

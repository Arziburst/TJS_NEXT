import { afterEach, describe, expect, it, vi } from "vitest";

// next/font and the client demos only work inside Next's compiler; the gate does not need them.
vi.mock("@/lib/fonts", () => ({
  DISPLAY_FONT: "A",
  displayCandidateA: { className: "a", variable: "--a" },
  displayCandidateB: { className: "b", variable: "--b" },
}));
vi.mock("./demos", () => ({
  BadgesDemo: () => null,
  ButtonsDemo: () => null,
  FieldsDemo: () => null,
  OverlaysDemo: () => null,
  TabsDemo: () => null,
}));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
// the price demo reads cookies and the database (server-only modules)
vi.mock("@/components/price", () => ({ Price: () => null }));

const { default: UiKitPage } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/ui-kit gate", () => {
  it.each([undefined, "", "false", "1", "TRUE"])("is a 404 when TJS_UI_KIT is %j", (value) => {
    vi.stubEnv("TJS_UI_KIT", value);
    expect(() => UiKitPage()).toThrow(expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  });

  it("is a 404 in a production build without the flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TJS_UI_KIT", undefined);
    expect(() => UiKitPage()).toThrow(expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  });

  it('renders when TJS_UI_KIT is exactly "true"', () => {
    vi.stubEnv("TJS_UI_KIT", "true");
    expect(UiKitPage()).toMatchObject({ type: "main" });
  });
});

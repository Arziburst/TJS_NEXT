import { afterEach, describe, expect, it, vi } from "vitest";

// The gate needs none of the server modules the delivery step reads
vi.mock("server-only", () => ({}));
vi.mock("@/lib/delivery/nova-post/config", () => ({ getNovaPostClient: () => null }));
vi.mock("@/lib/catalog", () => ({ getProducts: async () => ({ ok: false, reason: "unexpectedError" }) }));
vi.mock("@/lib/money/cache", () => ({ getMoneyTables: async () => null }));
vi.mock("@/components/delivery/nova-post/international-delivery", () => ({ InternationalDelivery: () => null }));

const { default: NovaPostDeliveryDemoPage } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/delivery-demo/nova-post gate", () => {
  it.each([undefined, "", "false", "1", "TRUE"])("is a 404 when TJS_UI_KIT is %j", (value) => {
    vi.stubEnv("TJS_UI_KIT", value);
    expect(() => NovaPostDeliveryDemoPage()).toThrow(expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  });

  it('renders when TJS_UI_KIT is exactly "true"', () => {
    vi.stubEnv("TJS_UI_KIT", "true");
    expect(NovaPostDeliveryDemoPage()).toMatchObject({ type: "main" });
  });
});

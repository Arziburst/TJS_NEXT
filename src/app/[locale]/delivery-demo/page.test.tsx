import { afterEach, describe, expect, it, vi } from "vitest";

// the client pieces and the message provider only work inside Next's compiler; the gate does not need them
vi.mock("@/components/delivery/nova-poshta-delivery", () => ({ NovaPoshtaDelivery: () => null }));
vi.mock("@/components/delivery/delivery-messages", () => ({ DeliveryMessages: () => null }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

const { default: DeliveryDemoPage, generateMetadata } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/delivery-demo gate", () => {
  it.each([undefined, "", "false", "1", "TRUE"])("is a 404 when TJS_UI_KIT is %j", async (value) => {
    vi.stubEnv("TJS_UI_KIT", value);
    await expect(DeliveryDemoPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it('renders when TJS_UI_KIT is exactly "true"', async () => {
    vi.stubEnv("TJS_UI_KIT", "true");
    expect(await DeliveryDemoPage()).toMatchObject({ type: "main" });
  });

  it("is never indexed", async () => {
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: false });
  });
});

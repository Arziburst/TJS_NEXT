import { afterEach, describe, expect, it, vi } from "vitest";

const PRODUCTION = "https://zmwjhpodaxyphlyzwedf.supabase.co/storage/v1/object/public/product-images/**";

async function imagesConfig(supabaseUrl: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  const { default: config } = await import("../next.config");
  return config.images!;
}

describe("next.config images", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("optimizes production photos with avif first, webp as fallback, two qualities", async () => {
    const images = await imagesConfig(undefined);
    expect(images.unoptimized).toBeFalsy();
    expect(images.formats).toEqual(["image/avif", "image/webp"]);
    expect(images.qualities).toEqual([75, 85]);
    expect(images.remotePatterns!.map(String)).toEqual([PRODUCTION]);
    expect(images.dangerouslyAllowLocalIP).toBe(false);
  });

  it("also allows the product-images bucket of a local stack, and only then a loopback address", async () => {
    const images = await imagesConfig("http://127.0.0.1:41531");
    expect(images.remotePatterns!.map(String)).toEqual([
      PRODUCTION,
      "http://127.0.0.1:41531/storage/v1/object/public/product-images/**",
    ]);
    expect(images.dangerouslyAllowLocalIP).toBe(true);
  });

  it("allows no other bucket or host", async () => {
    const images = await imagesConfig("https://zmwjhpodaxyphlyzwedf.supabase.co");
    expect(images.remotePatterns!.map(String)).toEqual([PRODUCTION]);
  });
});

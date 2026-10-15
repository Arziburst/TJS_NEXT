import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The "use cache" directive is a plain string outside Next's compiler: the spy records the entry's lifetime
const cacheLife = vi.fn();
vi.mock("next/cache", () => ({ cacheLife }));

const { FAILED_READ_LIFE } = await import("@/lib/failed-read");
const { getAuthProviders } = await import("@/lib/auth/providers");

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  cacheLife.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getAuthProviders", () => {
  it("caches an unreachable settings read with zero lifetime", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getAuthProviders()).toEqual({ google: false });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("caches an error answer of the settings with zero lifetime", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getAuthProviders()).toEqual({ google: false });
    expect(cacheLife.mock.calls).toEqual([[FAILED_READ_LIFE]]);
  });

  it("keeps the settings for minutes when Google is on", async () => {
    fetchMock.mockResolvedValue(Response.json({ external: { google: true } }));
    expect(await getAuthProviders()).toEqual({ google: true });
    expect(cacheLife.mock.calls).toEqual([["minutes"]]);
    expect(fetchMock).toHaveBeenCalledWith("https://auth.test/auth/v1/settings", { headers: { apikey: "anon" } });
  });

  it("keeps the settings for minutes when Google is off", async () => {
    fetchMock.mockResolvedValue(Response.json({ external: { google: false } }));
    expect(await getAuthProviders()).toEqual({ google: false });
    expect(cacheLife.mock.calls).toEqual([["minutes"]]);
  });

  it("keeps an unconfigured Supabase for minutes without a request", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(await getAuthProviders()).toEqual({ google: false });
    expect(cacheLife.mock.calls).toEqual([["minutes"]]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createClient = vi.fn<(...args: unknown[]) => object>(() => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const { createPublicServerClient } = await import("./server");

type ClientOptions = { global?: { fetch?: typeof fetch } };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  createClient.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createPublicServerClient", () => {
  // Next's build would otherwise keep each response in its implicit fetch cache (.next/cache/fetch-cache) and
  // serve it to the next build (#59)
  it("never lets Next's fetch cache keep a read", async () => {
    const fetchSpy = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchSpy);
    createPublicServerClient();
    const options = createClient.mock.calls[0]?.[2] as ClientOptions;

    const signal = new AbortController().signal;
    await options.global!.fetch!("http://127.0.0.1:54321/rest/v1/categories", { headers: { apikey: "anon-key" }, signal });

    expect(fetchSpy).toHaveBeenCalledWith("http://127.0.0.1:54321/rest/v1/categories", {
      headers: { apikey: "anon-key" },
      signal,
      cache: "no-store",
    });
  });
});

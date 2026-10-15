import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Supabase server client is replaced by one whose getClaims() "refreshes" the session: it writes new
// cookies through setAll, as @supabase/ssr does when the access token has expired.
const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    { cookies }: { cookies: { setAll: (c: unknown[], h: Record<string, string>) => void } },
  ) => ({ auth: { getClaims: () => getClaims(cookies) } }),
}));

const { refreshSession } = await import("@/lib/supabase/proxy");
const { default: proxy } = await import("@/proxy");

const AUTH_COOKIE = "sb-127-auth-token";

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3013"), { headers: cookie ? { cookie } : {} });
}

describe("session refresh in the proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:41131");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    getClaims.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does nothing for a guest without auth cookies", async () => {
    const apply = await refreshSession(request("/en", "NEXT_LOCALE=en"));
    expect(getClaims).not.toHaveBeenCalled();
    const response = NextResponse.next();
    expect(apply(response)).toBe(response);
  });

  it("puts refreshed cookies into the request and the response, with no-store headers", async () => {
    getClaims.mockImplementation(({ setAll }) => {
      setAll([{ name: AUTH_COOKIE, value: "fresh", options: { path: "/", httpOnly: true } }], {
        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
      });
      return { data: { claims: { sub: "u1" } }, error: null };
    });
    const req = request("/en", `${AUTH_COOKIE}=stale`);
    const apply = await refreshSession(req);
    expect(req.cookies.get(AUTH_COOKIE)?.value).toBe("fresh");

    const response = apply(NextResponse.next());
    expect(response.cookies.get(AUTH_COOKIE)?.value).toBe("fresh");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("never fails the request when Auth is unreachable", async () => {
    getClaims.mockRejectedValue(new Error("fetch failed"));
    const apply = await refreshSession(request("/en", `${AUTH_COOKIE}=stale`));
    const response = NextResponse.next();
    expect(apply(response)).toBe(response);
  });

  it("forwards the refreshed cookie through the locale middleware and keeps its redirects", async () => {
    getClaims.mockImplementation(({ setAll }) => {
      setAll([{ name: AUTH_COOKIE, value: "fresh", options: { path: "/" } }], {});
      return { data: null, error: null };
    });
    const rendered = await proxy(request("/en", `${AUTH_COOKIE}=stale`));
    expect(rendered.status).toBe(200);
    expect(rendered.cookies.get(AUTH_COOKIE)?.value).toBe("fresh");
    // the page sees the fresh cookie: next-intl forwards the request headers it was given
    expect(rendered.headers.get("x-middleware-request-cookie")).toContain(`${AUTH_COOKIE}=fresh`);

    const redirected = await proxy(request("/", `${AUTH_COOKIE}=stale`));
    expect(redirected.status).toBe(307);
    expect(redirected.cookies.get(AUTH_COOKIE)?.value).toBe("fresh");
  });
});

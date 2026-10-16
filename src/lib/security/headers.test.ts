import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contentSecurityPolicy, createNonce, originOf, strictContentSecurityPolicy } from "./headers";
import { securePageRequest } from "./proxy";

const options = { supabaseOrigins: ["https://abc.supabase.co", "https://abc.supabase.co"], dev: false };

function directive(policy: string, name: string): string[] | undefined {
  const entry = policy.split("; ").find((d) => d.split(" ")[0] === name);
  return entry?.split(" ").slice(1);
}

describe("contentSecurityPolicy", () => {
  it("locks framing, plugins, the base URL and form targets", () => {
    const policy = contentSecurityPolicy(options);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
  });

  it("allows Supabase for images and the upload, and no third-party API in connect-src", () => {
    const policy = contentSecurityPolicy(options);
    expect(directive(policy, "img-src")).toEqual(["'self'", "data:", "blob:", "https://abc.supabase.co"]);
    expect(directive(policy, "connect-src")).toEqual(["'self'", "https://abc.supabase.co"]);
    expect(policy).not.toMatch(/novaposhta|novapost|resend|telegram|vercel-scripts/);
  });

  it("adds eval and the HMR socket in dev only", () => {
    expect(directive(contentSecurityPolicy(options), "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    const dev = contentSecurityPolicy({ ...options, dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });

  it("has a strict variant with the nonce and without unsafe-inline for scripts", () => {
    const strict = strictContentSecurityPolicy(options, "abc123");
    expect(directive(strict, "script-src")).toEqual(["'self'", "'nonce-abc123'"]);
    const rest = Object.fromEntries(strict.split("; ").map((d) => [d.split(" ")[0], d]));
    delete rest["script-src"];
    const enforced = Object.fromEntries(contentSecurityPolicy(options).split("; ").map((d) => [d.split(" ")[0], d]));
    delete enforced["script-src"];
    expect(rest).toEqual(enforced);
  });
});

describe("helpers", () => {
  it("makes distinct 128-bit nonces", () => {
    const a = createNonce();
    expect(atob(a)).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });

  it("takes the origin of a URL", () => {
    expect(originOf("http://127.0.0.1:54321/rest/v1")).toBe("http://127.0.0.1:54321");
    expect(originOf("nonsense")).toBeNull();
    expect(originOf(undefined)).toBeNull();
  });
});

describe("securePageRequest", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("puts the same report-only policy and request id on the request and the response", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const request = new NextRequest("http://localhost/uk", {
      headers: { "content-security-policy": "script-src 'nonce-chosen-by-client'", "x-request-id": "forged" },
    });
    const apply = securePageRequest(request);
    const policy = request.headers.get("content-security-policy-report-only");
    expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{24}'/);
    expect(request.headers.get("content-security-policy")).toBeNull();
    const requestId = request.headers.get("x-request-id");
    expect(requestId).not.toBe("forged");

    const response = apply(NextResponse.next());
    expect(response.headers.get("content-security-policy-report-only")).toBe(policy);
    expect(response.headers.get("x-request-id")).toBe(requestId);
  });
});

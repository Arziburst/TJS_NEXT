import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import proxy from "@/proxy";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://localhost:3010"), { headers });
}

function redirectTarget(response: Response) {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
}

describe("proxy locale detection", () => {
  it("redirects / to the Accept-Language locale", async () => {
    const response = await proxy(request("/", { "accept-language": "de-DE,de;q=0.9,en;q=0.8" }));
    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe("/de");
  });

  it("falls back to /en without a cookie or a supported Accept-Language", async () => {
    expect(redirectTarget(await proxy(request("/")))).toBe("/en");
    expect(redirectTarget(await proxy(request("/", { "accept-language": "ja-JP,ja;q=0.9" })))).toBe("/en");
  });

  it("matches regional variants to their language", async () => {
    expect(redirectTarget(await proxy(request("/", { "accept-language": "de-AT" })))).toBe("/de");
    expect(redirectTarget(await proxy(request("/", { "accept-language": "pt-BR,pt;q=0.9" })))).toBe("/pt");
  });

  // D27: next-intl's "best fit" matcher alone would send Russian to /uk by CLDR language distance
  it("sends a browser language outside the 11 locales to /en, Russian included", async () => {
    expect(redirectTarget(await proxy(request("/", { "accept-language": "ru-RU,ru" })))).toBe("/en");
    expect(redirectTarget(await proxy(request("/", { "accept-language": "ru-RU,ru;q=0.9" })))).toBe("/en");
    expect(redirectTarget(await proxy(request("/", { "accept-language": "be-BY,be;q=0.9" })))).toBe("/en");
    expect(redirectTarget(await proxy(request("/", { "accept-language": "sk,hr;q=0.8" })))).toBe("/en");
  });

  it("takes the first served language after an unserved one", async () => {
    expect(redirectTarget(await proxy(request("/", { "accept-language": "ru-RU,ru;q=0.9,uk;q=0.8,en;q=0.7" })))).toBe("/uk");
    expect(redirectTarget(await proxy(request("/", { "accept-language": "ru,en-US;q=0.8,de;q=0.6" })))).toBe("/en");
  });

  it("prefers the NEXT_LOCALE cookie over Accept-Language", async () => {
    const response = await proxy(request("/", { "accept-language": "de", cookie: "NEXT_LOCALE=fr" }));
    expect(redirectTarget(response)).toBe("/fr");
  });

  it("prefers the URL prefix over the cookie and Accept-Language", async () => {
    const response = await proxy(request("/uk", { "accept-language": "de", cookie: "NEXT_LOCALE=fr" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("never detects the locale from the visitor's IP country", async () => {
    const response = await proxy(
      request("/", { "x-vercel-ip-country": "DE", "cf-ipcountry": "DE", "accept-language": "pl" }),
    );
    expect(redirectTarget(response)).toBe("/pl");
  });

  it("keeps the rest of the path when adding the prefix", async () => {
    const response = await proxy(request("/shop?sort=priceAsc", { "accept-language": "it" }));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname + location.search).toBe("/it/shop?sort=priceAsc");
  });

  it("serves /en with its prefix and does not redirect it away", async () => {
    const response = await proxy(request("/en", { "accept-language": "de" }));
    expect(response.status).toBe(200);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Parcel, QuoteRequest } from "@/lib/delivery/nova-post/types";
import { FIXTURE_JWT_EXPIRY, fixture } from "./fixtures";

vi.mock("server-only", () => ({}));

const { costToMinor, createNovaPostClient, jwtExpiry, NOVA_POST_PRODUCTION_URL } = await import("@/lib/delivery/nova-post/client");

const SANDBOX = "https://api-stage.novapost.com/v.1.0";
const JWT = (fixture("authorization") as { jwt: string }).jwt;

type Call = { url: URL; init: RequestInit };
type Route = (call: Call) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// A fetch that answers the authorization route with the fixture JWT and everything else through `route`
function fakeApi(route: Route, authorize: Route = () => json(fixture("authorization"))) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: new URL(String(input)), init };
    calls.push(call);
    return call.url.pathname.endsWith("/clients/authorization") ? authorize(call) : route(call);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls, apiCalls: () => calls.filter((c) => !c.url.pathname.endsWith("/authorization")) };
}

// a quarter of an hour before the fixture JWT expires
const NOW = FIXTURE_JWT_EXPIRY - 15 * 60_000;

function client(fetch: typeof globalThis.fetch, now = () => NOW, timeoutMs?: number) {
  return createNovaPostClient({ apiKey: "test-key", baseUrl: SANDBOX, fetch, now, timeoutMs });
}

const PARCEL: Parcel = {
  weightGrams: 123,
  lengthMm: 200,
  widthMm: 150,
  heightMm: 50,
  declaredValueMinor: 4590,
  declaredCurrency: "EUR",
  insuranceUahMinor: 220000,
};

function body(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body));
}

describe("Nova Post authorization", () => {
  it("trades the API key for a JWT and sends it on every call", async () => {
    const api = fakeApi(() => json(fixture("settlements-pl-wroc")));
    const result = await client(api.fetch).searchSettlements("PL", "Wroc", "pl");
    expect(result.ok).toBe(true);
    const [auth, search] = api.calls;
    expect(auth.url.origin + auth.url.pathname).toBe(`${SANDBOX}/clients/authorization`);
    expect(auth.url.searchParams.get("apiKey")).toBe("test-key");
    expect(new Headers(search.init.headers).get("Authorization")).toBe(JWT);
  });

  it("keeps the JWT until shortly before it expires, then asks for a new one", async () => {
    let now = NOW;
    const api = fakeApi(() => json(fixture("settlements-pl-wroc")));
    const np = client(api.fetch, () => now);
    await np.searchSettlements("PL", "Wroc", "pl");
    await np.searchSettlements("PL", "Wroc", "pl");
    expect(api.calls.filter((c) => c.url.pathname.endsWith("/authorization"))).toHaveLength(1);

    now = FIXTURE_JWT_EXPIRY - 30_000;
    await np.searchSettlements("PL", "Wroc", "pl");
    expect(api.calls.filter((c) => c.url.pathname.endsWith("/authorization"))).toHaveLength(2);
  });

  it("shares one authorization between concurrent calls", async () => {
    const api = fakeApi(() => json(fixture("settlements-pl-wroc")));
    const np = client(api.fetch);
    await Promise.all([np.searchSettlements("PL", "Wr", "pl"), np.searchSettlements("PL", "Wro", "pl")]);
    expect(api.calls.filter((c) => c.url.pathname.endsWith("/authorization"))).toHaveLength(1);
  });

  it("renews the JWT once when a call answers 401", async () => {
    let first = true;
    const api = fakeApi(() => {
      if (first) {
        first = false;
        return json({ errors: { errorMessage: "Invalid token" } }, 401);
      }
      return json(fixture("settlements-pl-wroc"));
    });
    const result = await client(api.fetch).searchSettlements("PL", "Wroc", "pl");
    expect(result.ok).toBe(true);
    expect(api.calls.filter((c) => c.url.pathname.endsWith("/authorization"))).toHaveLength(2);
  });

  it("is unauthorized when a renewed JWT is refused too", async () => {
    const api = fakeApi(() => json({ errors: { errorMessage: "Invalid token" } }, 401));
    expect(await client(api.fetch).searchSettlements("PL", "Wroc", "pl")).toEqual({
      ok: false,
      error: { kind: "unauthorized", status: 401 },
    });
  });

  it("is unauthorized when the API key is unknown", async () => {
    const api = fakeApi(
      () => json(fixture("settlements-pl-wroc")),
      () => json(fixture("error-404-key"), 404),
    );
    expect(await client(api.fetch).calculate({ country: "PL", destination: { kind: "division", divisionId: 1 }, parcel: PARCEL })).toEqual({
      ok: false,
      error: { kind: "unauthorized", status: 404 },
    });
    expect(api.apiCalls()).toHaveLength(0);
  });

  it("uses production when no base URL is given", async () => {
    const api = fakeApi(() => json(fixture("settlements-pl-wroc")));
    await createNovaPostClient({ apiKey: "k", fetch: api.fetch, now: () => NOW }).searchSettlements("PL", "Wr", "en");
    expect(api.calls[0].url.href.startsWith(`${NOVA_POST_PRODUCTION_URL}/`)).toBe(true);
  });
});

describe("Nova Post dictionaries", () => {
  it("searches settlements of a country and drops those that receive nothing", async () => {
    const api = fakeApi(() => json(fixture("settlements-pl-wroc")));
    const result = await client(api.fetch).searchSettlements("PL", "Wroc", "cs");
    const [call] = api.apiCalls();
    expect(call.url.pathname).toBe("/v.1.0/settlements");
    expect(call.url.searchParams.getAll("countryCodes[]")).toEqual(["PL"]);
    expect(call.url.searchParams.get("textSearch")).toBe("Wroc");
    // the API writes Czech as "cz"
    expect(new Headers(call.init.headers).get("Accept-language")).toBe("cz");
    expect(result).toEqual({
      ok: true,
      data: [
        { id: 26061, name: "Wrocław", region: "Wrocław County, Lower Silesian voivodeship" },
        { id: 26188, name: "Wrocki", region: null },
      ],
    });
  });

  it("asks dictionaries in English for a locale the API does not speak", async () => {
    const api = fakeApi(() => json(fixture("settlements-pl-wroc")));
    await client(api.fetch).searchSettlements("PL", "Wroc", "pt");
    expect(new Headers(api.apiCalls()[0].init.headers).get("Accept-language")).toBe("en");
  });

  it("lists the working branches, lockers and pick-up points of a settlement, page by page", async () => {
    const api = fakeApi(({ url }) => json(fixture(`divisions-pl-26061-page${url.searchParams.get("page")}`)));
    const result = await client(api.fetch).listDivisions("PL", 26061, ["PostBranch", "Postomat", "PUDO"], "pl");
    const [first, second] = api.apiCalls();
    expect(first.url.pathname).toBe("/v.1.0/divisions");
    expect(first.url.searchParams.getAll("settlementIds[]")).toEqual(["26061"]);
    expect(first.url.searchParams.getAll("divisionCategories[]")).toEqual(["PostBranch", "Postomat", "PUDO"]);
    expect(first.url.searchParams.getAll("statuses[]")).toEqual(["Working"]);
    expect(first.url.searchParams.get("prohibitedIssuance")).toBe("false");
    expect(second.url.searchParams.get("page")).toBe("2");
    expect(result.ok && result.data.map((d) => [d.id, d.category, d.number])).toEqual([
      [1, "PostBranch", "50/1"],
      [1834946, "Postomat", "WRO01M"],
      // the CargoBranch of page 1 is for freight and never offered
      [3307, "PUDO", "50/PUDO-12"],
    ]);
    expect(result.ok && result.data[0].address).toBe(
      "50-231, Polska, Województwo dolnośląskie, Wrocław County, Wrocław, Trzebnicka, 50/1A",
    );
  });
});

describe("Nova Post calculation", () => {
  const plDivision: QuoteRequest = { country: "PL", destination: { kind: "division", divisionId: 1834946 }, parcel: PARCEL };
  const deAddress: QuoteRequest = {
    country: "DE",
    destination: { kind: "address", city: "Berlin", postCode: "10115", street: "Invalidenstraße", building: "1" },
    parcel: PARCEL,
  };
  const frAddress: QuoteRequest = {
    country: "FR",
    destination: { kind: "address", city: "Lyon", postCode: "69001", street: "Rue de la République", building: "5", flat: "12" },
    parcel: PARCEL,
  };

  it("quotes a PL locker: price, currency and scheduled date", async () => {
    const api = fakeApi(() => json(fixture("calculation-pl-division")));
    const result = await client(api.fetch).calculate(plDivision);
    // 385 UAH delivery + 12.50 UAH insurance (the second service names no currency: it shares the first one's)
    expect(result).toEqual({
      ok: true,
      data: { price: { currency: "UAH", amountMinor: 39750 }, scheduledDeliveryDate: "2026-10-21T09:00:00.000000Z" },
    });
    const [call] = api.apiCalls();
    expect(call.init.method).toBe("POST");
    expect(call.url.pathname).toBe("/v.1.0/shipments/calculations");
    expect(body(call)).toEqual({
      payerType: "Recipient",
      invoice: { incoterm: "DAP", currency: "EUR", cost: 45.9, payerFeesCustoms: "Recipient" },
      // 123 g counts as 130 g: the API rounds a remainder of 10 g down
      parcels: [{ cargoCategory: "parcel", insuranceCost: 2200, rowNumber: 1, length: 200, width: 150, height: 50, actualWeight: 130 }],
      sender: { countryCode: "UA", divisionNumber: "-" },
      recipient: { countryCode: "PL", divisionId: 1834946 },
    });
  });

  it("quotes a DE address in EUR", async () => {
    const api = fakeApi(() => json(fixture("calculation-de-address")));
    const result = await client(api.fetch).calculate(deAddress);
    expect(result).toEqual({
      ok: true,
      data: { price: { currency: "EUR", amountMinor: 1175 }, scheduledDeliveryDate: "2026-10-22T09:00:00.000000Z" },
    });
    expect(body(api.apiCalls()[0]).recipient).toEqual({
      countryCode: "DE",
      addressParts: { city: "Berlin", postCode: "10115", street: "Invalidenstraße", building: "1", flat: "" },
    });
  });

  it("quotes a FR address without a scheduled date", async () => {
    const api = fakeApi(() => json(fixture("calculation-fr-address")));
    expect(await client(api.fetch).calculate(frAddress)).toEqual({
      ok: true,
      data: { price: { currency: "UAH", amountMinor: 61275 }, scheduledDeliveryDate: null },
    });
    expect((body(api.apiCalls()[0]).recipient as { addressParts: { flat: string } }).addressParts.flat).toBe("12");
  });

  it("reports a refused calculation with the API's error text", async () => {
    const api = fakeApi(() => json(fixture("error-422"), 422));
    expect(await client(api.fetch).calculate(plDivision)).toEqual({
      ok: false,
      error: { kind: "http", status: 422, detail: "recipient.divisionId: The selected recipient.division id is invalid." },
    });
  });

  it("reports the per-minute limit", async () => {
    const api = fakeApi(() => json({ errors: { errorMessage: "Too Many Attempts." } }, 429));
    expect(await client(api.fetch).calculate(plDivision)).toEqual({ ok: false, error: { kind: "rateLimited" } });
  });

  it("rejects an answer that does not match the documented shape", async () => {
    const api = fakeApi(() => json({ scheduledDeliveryDate: null, services: [{ cost: "385" }] }));
    const result = await client(api.fetch).calculate(plDivision);
    expect(result.ok === false && result.error.kind).toBe("invalidResponse");
  });

  it("rejects services in two currencies", async () => {
    const api = fakeApi(() =>
      json({ services: [{ cost: 1, currencyCode: "UAH" }, { cost: 1, currencyCode: "EUR" }], scheduledDeliveryDate: null }),
    );
    const result = await client(api.fetch).calculate(plDivision);
    expect(result).toEqual({ ok: false, error: { kind: "invalidResponse", detail: "calculation: no single currency" } });
  });

  it("times out instead of waiting for a hanging API", async () => {
    const hanging: Route = ({ init }) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const api = fakeApi(hanging);
    expect(await client(api.fetch, () => NOW, 20).calculate(plDivision)).toEqual({ ok: false, error: { kind: "timeout" } });
  });

  it("reports a network failure", async () => {
    const api = fakeApi(() => {
      throw new TypeError("fetch failed");
    });
    expect(await client(api.fetch).calculate(plDivision)).toEqual({ ok: false, error: { kind: "network", detail: "fetch failed" } });
  });
});

describe("Nova Post helpers", () => {
  it("reads the expiry of a JWT", () => {
    expect(jwtExpiry(JWT)).toBe(FIXTURE_JWT_EXPIRY);
    expect(jwtExpiry("not-a-jwt")).toBeNull();
    expect(jwtExpiry("a.b.c")).toBeNull();
  });

  it("turns a cost into minor units without a float error, rounding a third decimal up", () => {
    expect(costToMinor(109.38)).toBe(10938);
    expect(costToMinor(385)).toBe(38500);
    expect(costToMinor(0.1)).toBe(10);
    expect(costToMinor(12.345)).toBe(1235);
    expect(costToMinor(1e21)).toBeNull();
  });
});

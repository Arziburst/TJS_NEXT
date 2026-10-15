// The app's entry points around the client: which transport it uses, the fixture mode, the server actions'
// validation and the cron route's secret check.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureTransport } from "@/lib/delivery/nova-poshta/fixture-transport";
import { KYIV } from "./replay";

vi.mock("server-only", () => ({}));
// the per-client counter (tests/delivery/rate-limit.test.ts); here it lets every call through unless a test says
const allowDeliveryCall = vi.fn<(action: "search" | "quote") => Promise<boolean>>(async () => true);
vi.mock("@/lib/delivery/rate-limit", () => ({ allowDeliveryCall: (action: "search" | "quote") => allowDeliveryCall(action) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  allowDeliveryCall.mockReset().mockResolvedValue(true);
});

const signal = new AbortController().signal;

describe("the fixture transport", () => {
  it("answers a recorded request as recorded and other searches from the recorded rows", async () => {
    const recorded = await fixtureTransport(
      { modelName: "Address", calledMethod: "searchSettlements", methodProperties: { CityName: "Київ", Limit: "10", Page: "1" } },
      signal,
    );
    expect(recorded.ok && (recorded.data as { data: { TotalCount: number }[] }).data[0].TotalCount).toBe(9);

    const derived = await fixtureTransport(
      { modelName: "Address", calledMethod: "searchSettlements", methodProperties: { CityName: "лЬв", Limit: "5", Page: "1" } },
      signal,
    );
    const addresses = derived.ok ? (derived.data as { data: { Addresses: { MainDescription: string }[] }[] }).data[0].Addresses : [];
    expect(addresses.map((a) => a.MainDescription)).toContain("Львів");
  });

  it("refuses to serve on a production deployment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await fixtureTransport(
      { modelName: "Address", calledMethod: "searchSettlements", methodProperties: { CityName: "Київ", Limit: "10", Page: "1" } },
      signal,
    );
    expect(result).toEqual({ ok: false, error: { kind: "notConfigured" } });
  });
});

describe("novaPoshtaClient", () => {
  it("calls the API with the key from NOVA_POSHTA_API_KEY", async () => {
    vi.stubEnv("NOVA_POSHTA_FIXTURES", "");
    vi.stubEnv("NOVA_POSHTA_API_KEY", "server-key");
    const fetchMock = vi.fn(async () => Response.json({ success: true, data: [{ TotalCount: 0, Addresses: [] }], errors: [], errorCodes: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { novaPoshtaClient } = await import("@/lib/delivery/nova-poshta/client");
    expect(await novaPoshtaClient().searchSettlements("Київ", 10)).toEqual({ ok: true, data: [] });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).apiKey).toBe("server-key");
  });

  it("calls the API without a key when none is set", async () => {
    vi.stubEnv("NOVA_POSHTA_FIXTURES", "");
    vi.stubEnv("NOVA_POSHTA_API_KEY", "");
    const fetchMock = vi.fn(async () => Response.json({ success: true, data: [{ TotalCount: 0, Addresses: [] }], errors: [], errorCodes: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { novaPoshtaClient } = await import("@/lib/delivery/nova-poshta/client");
    await novaPoshtaClient().searchSettlements("Київ", 10);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).apiKey).toBe("");
  });

  it("answers from the fixtures only when NOVA_POSHTA_FIXTURES is exactly true", async () => {
    vi.stubEnv("NOVA_POSHTA_FIXTURES", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { novaPoshtaClient } = await import("@/lib/delivery/nova-poshta/client");
    const result = await novaPoshtaClient().searchSettlements("Київ", 10);
    expect(result.ok && result.data[0].ref).toBe(KYIV.settlementRef);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the server actions", () => {
  it("refuse malformed input before any call", async () => {
    vi.stubEnv("NOVA_POSHTA_FIXTURES", "true");
    const actions = await import("@/lib/delivery/actions");
    expect(await actions.searchSettlementsAction(42)).toEqual({ ok: false, reason: "invalid" });
    expect(await actions.searchSettlementsAction("к".repeat(500))).toEqual({ ok: false, reason: "invalid" });
    expect(await actions.searchWarehousesAction({ settlementRef: "x", filter: "all", query: "" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await actions.searchWarehousesAction({ settlementRef: KYIV.settlementRef, filter: "cargo", query: "" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await actions.searchStreetsAction({ settlementRef: KYIV.settlementRef })).toEqual({ ok: false, reason: "invalid" });
    expect(
      await actions.quoteAction({ cityRef: KYIV.cityRef, recipient: "warehouse", parcel: { weightGrams: 0.5, declaredValueMinor: 1 } }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("answer a valid search and quote (fixtures, no cache configured)", async () => {
    vi.stubEnv("NOVA_POSHTA_FIXTURES", "true");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const actions = await import("@/lib/delivery/actions");
    const cities = await actions.searchSettlementsAction("Київ");
    expect(cities.ok && cities.items[0].cityRef).toBe(KYIV.cityRef);
    expect(
      await actions.quoteAction({ cityRef: KYIV.cityRef, recipient: "postomat", parcel: { weightGrams: 300, declaredValueMinor: 128900 } }),
    ).toEqual({ ok: true, costMinor: 8645 });
  });
});

describe("the server actions over a client's limit", () => {
  it("answer rateLimited without calling Nova Poshta, counting searches and quotes apart", async () => {
    vi.stubEnv("NOVA_POSHTA_FIXTURES", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    allowDeliveryCall.mockResolvedValue(false);
    const actions = await import("@/lib/delivery/actions");

    expect(await actions.searchSettlementsAction("Київ")).toEqual({ ok: false, reason: "rateLimited" });
    expect(await actions.searchWarehousesAction({ settlementRef: KYIV.settlementRef, filter: "all", query: "" })).toEqual({
      ok: false,
      reason: "rateLimited",
    });
    expect(await actions.searchStreetsAction({ settlementRef: KYIV.settlementRef, query: "Хрещатик" })).toEqual({
      ok: false,
      reason: "rateLimited",
    });
    expect(
      await actions.quoteAction({ cityRef: KYIV.cityRef, recipient: "doors", parcel: { weightGrams: 100, declaredValueMinor: 1 } }),
    ).toEqual({ ok: false, reason: "rateLimited" });

    expect(allowDeliveryCall.mock.calls.map(([action]) => action)).toEqual(["search", "search", "search", "quote"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("do not count a malformed call", async () => {
    const actions = await import("@/lib/delivery/actions");
    await actions.quoteAction({ cityRef: "nope" });
    expect(allowDeliveryCall).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/nova-poshta", () => {
  it("answers 401 without the cron secret, and when the secret is unset", async () => {
    const { GET } = await import("@/app/api/cron/nova-poshta/route");
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await GET(new Request("http://x/api/cron/nova-poshta"))).status).toBe(401);
    expect((await GET(new Request("http://x/api/cron/nova-poshta", { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(new Request("http://x/api/cron/nova-poshta", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });

  it("answers 500 when the cache is not configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { GET } = await import("@/app/api/cron/nova-poshta/route");
    const response = await GET(new Request("http://x/api/cron/nova-poshta", { headers: { authorization: "Bearer s3cret-value" } }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "notConfigured" });
  });
});

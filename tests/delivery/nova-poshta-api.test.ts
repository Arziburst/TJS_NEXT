// The Nova Poshta API 2.0 client against the recorded answers (src/lib/delivery/nova-poshta/fixtures).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  INVALID_CHARACTERS_CODE,
  NOVA_POSHTA_API_URL,
  WAREHOUSE_TYPE,
  createNovaPoshtaClient,
  cm3ToM3,
  gramsToKg,
  httpTransport,
  hryvniasToMinor,
  minorToHryvnias,
  type NovaPoshtaRequest,
  type Transport,
} from "@/lib/delivery/nova-poshta/api";
import { KYIV, LVIV, recordings, replayTransport } from "./replay";

vi.mock("server-only", () => ({}));

const client = (sent?: NovaPoshtaRequest[]) => createNovaPoshtaClient({ transport: replayTransport(sent) });

describe("the recorded fixtures", () => {
  it("hold no API key", () => {
    const file = readFileSync(new URL("../../src/lib/delivery/nova-poshta/fixtures/recordings.json", import.meta.url), "utf8");
    expect(file).not.toMatch(/apiKey/i);
    expect(recordings.length).toBeGreaterThan(50);
  });
});

describe("searchSettlements", () => {
  it("maps the settlements, with the delivery city for prices", async () => {
    const result = await client().searchSettlements("Київ", 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toEqual({
      ref: KYIV.settlementRef,
      cityRef: KYIV.cityRef,
      name: "Київ",
      label: "м. Київ, Київська обл.",
      area: "Київська",
      region: "",
      warehouseCount: 12707,
      addressDelivery: true,
    });
    expect(result.data.map((s) => s.label)).toContain("с. Київець, Миколаївський р-н, Львівська обл.");
  });

  it("sends the search as the API expects", async () => {
    const sent: NovaPoshtaRequest[] = [];
    await client(sent).searchSettlements("Львів", 10);
    expect(sent).toEqual([
      { modelName: "Address", calledMethod: "searchSettlements", methodProperties: { CityName: "Львів", Limit: "10", Page: "1" } },
    ]);
  });

  it("reports the API's refusal of a text with its code", async () => {
    const result = await client().searchSettlements("zzzz-no-such-place", 10);
    expect(result).toEqual({
      ok: false,
      error: { kind: "api", codes: [INVALID_CHARACTERS_CODE], messages: ["CityName has invalid characters"] },
    });
  });
});

describe("getWarehouses", () => {
  it("returns branches of a branch type, kind branch, with their weight limit", async () => {
    const result = await client().getWarehouses({ settlementRef: KYIV.settlementRef, typeRef: WAREHOUSE_TYPE.cargoBranch, limit: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0]).toMatchObject({
      number: 1,
      kind: "branch",
      name: "Відділення №1: вул. Пирогівський шлях, 135",
      cityRef: KYIV.cityRef,
      settlementRef: KYIV.settlementRef,
      maxWeightKg: 1100,
    });
    expect(result.data.every((w) => w.kind === "branch")).toBe(true);
  });

  it("returns parcel lockers as kind postomat", async () => {
    const result = await client().getWarehouses({ settlementRef: KYIV.settlementRef, typeRef: WAREHOUSE_TYPE.postomat, limit: 20 });
    expect(result.ok && result.data.length).toBe(20);
    if (!result.ok) return;
    expect(result.data.every((w) => w.kind === "postomat")).toBe(true);
    expect(result.data[0]).toMatchObject({ number: 1001, typeRef: WAREHOUSE_TYPE.postomat, maxWeightKg: 20 });
  });

  it("finds a branch by its number", async () => {
    const sent: NovaPoshtaRequest[] = [];
    const result = await client(sent).getWarehouses({ settlementRef: KYIV.settlementRef, number: "1", query: "1", limit: 20 });
    expect(result.ok && result.data.map((w) => w.number)).toEqual([1]);
    expect(sent[0].methodProperties).not.toHaveProperty("FindByString");
  });

  it("leaves out drop-off-only points", async () => {
    const result = await client().getWarehouses({ settlementRef: KYIV.settlementRef, query: "Хрещатик", limit: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const numbers = result.data.map((w) => w.number);
    expect(numbers).toContain(543);
    expect(numbers).toContain(33873);
    // №955 is a "Пункт" (category DropOff): it takes parcels in, it does not hand them out
    expect(numbers).not.toContain(955);
  });

  it("classifies by type when the category is missing, and skips closed or unselectable points", async () => {
    const row = (extra: object) => ({
      Ref: crypto.randomUUID(),
      Number: "7",
      Description: "Відділення №7",
      TypeOfWarehouse: WAREHOUSE_TYPE.postBranch,
      CityRef: KYIV.cityRef,
      SettlementRef: KYIV.settlementRef,
      ...extra,
    });
    const rows = [
      row({}),
      row({ TypeOfWarehouse: WAREHOUSE_TYPE.privatbankPostomat }),
      row({ WarehouseStatus: "Closed" }),
      row({ DenyToSelect: "1" }),
      row({ CategoryOfWarehouse: "Fulfillment" }),
      { Ref: "not-a-ref" },
    ];
    const transport: Transport = async () => ({ ok: true, data: { success: true, data: rows, errors: [], errorCodes: [] } });
    const result = await createNovaPoshtaClient({ transport }).getWarehouses({ settlementRef: KYIV.settlementRef, limit: 20 });
    expect(result.ok && result.data.map((w) => [w.kind, w.maxWeightKg])).toEqual([
      ["branch", null],
      ["postomat", null],
    ]);
  });
});

describe("searchStreets", () => {
  it("maps the streets of a settlement", async () => {
    const result = await client().searchStreets({ settlementRef: KYIV.settlementRef, query: "Хрещатик", limit: 20 });
    expect(result).toEqual({
      ok: true,
      data: [{ ref: "ad090b1f-6845-11e6-8304-00505688561d", name: "Хрещатик", label: "вул. Хрещатик" }],
    });
  });
});

describe("getDocumentPrice", () => {
  it("returns the tariff in kopiykas for weight and declared value", async () => {
    const sent: NovaPoshtaRequest[] = [];
    const result = await client(sent).getDocumentPrice({
      citySenderRef: KYIV.cityRef,
      cityRecipientRef: LVIV.cityRef,
      serviceType: "WarehousePostomat",
      weightGrams: 500,
      volumeCm3: 500,
      declaredValueMinor: 128900,
    });
    expect(result).toEqual({ ok: true, data: { costMinor: 10645, declaredValueMinor: 128900 } });
    expect(sent[0].methodProperties).toMatchObject({ Weight: "0.5", VolumeGeneral: "0.0005", Cost: "1289", CargoType: "Parcel", SeatsAmount: "1" });
  });

  it("reports an unknown city as an API error", async () => {
    const result = await client().getDocumentPrice({
      citySenderRef: KYIV.cityRef,
      cityRecipientRef: "00000000-0000-0000-0000-000000000000",
      serviceType: "WarehouseWarehouse",
      weightGrams: 500,
      volumeCm3: 500,
      declaredValueMinor: 128900,
    });
    expect(result.ok === false && result.error.kind).toBe("api");
  });
});

describe("transport failures", () => {
  const fetchWith = (impl: (init: RequestInit) => Promise<Response>) =>
    createNovaPoshtaClient({
      transport: httpTransport({ apiKey: "k", fetchImpl: (_url, init) => impl(init ?? {}) }),
      timeoutMs: 30,
    });

  it("times out a request that does not answer", async () => {
    const hanging = fetchWith(
      (init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    expect(await hanging.searchSettlements("Київ", 10)).toEqual({ ok: false, error: { kind: "timeout" } });
  });

  it("reports a network error, an HTTP error and a body that is not the API's", async () => {
    expect(await fetchWith(() => Promise.reject(new TypeError("fetch failed"))).searchSettlements("Київ", 10)).toEqual({
      ok: false,
      error: { kind: "network" },
    });
    expect(await fetchWith(async () => new Response("busy", { status: 503 })).searchSettlements("Київ", 10)).toEqual({
      ok: false,
      error: { kind: "http", status: 503 },
    });
    expect(await fetchWith(async () => new Response("<html>")).searchSettlements("Київ", 10)).toEqual({
      ok: false,
      error: { kind: "invalidResponse" },
    });
    expect(await fetchWith(async () => Response.json({ hello: 1 })).searchSettlements("Київ", 10)).toEqual({
      ok: false,
      error: { kind: "invalidResponse" },
    });
  });

  it("posts the key in the body, never caches", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const transport = httpTransport({
      apiKey: "the-key",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Response.json({ success: true, data: [], errors: [], errorCodes: [] });
      },
    });
    await createNovaPoshtaClient({ transport }).searchSettlements("Київ", 10);
    expect(calls[0].url).toBe(NOVA_POSHTA_API_URL);
    expect(calls[0].init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ apiKey: "the-key", calledMethod: "searchSettlements" });
  });
});

describe("amount and weight conversions", () => {
  it.each([
    [107.5, 10750],
    [96.45, 9645],
    [0.1, 10],
    [90, 9000],
    [1.005, null],
  ])("%d hryvnias are %s kopiykas", (hryvnias, minor) => {
    expect(hryvniasToMinor(hryvnias)).toBe(minor);
  });

  it.each([
    [128900, "1289"],
    [128950, "1289.5"],
    [128905, "1289.05"],
    [0, "0"],
  ])("%d kopiykas are sent as %s", (minor, text) => {
    expect(minorToHryvnias(minor)).toBe(text);
  });

  it.each([
    [100, "0.1"],
    [250, "0.25"],
    [1000, "1"],
    [1050, "1.05"],
    [1, "0.001"],
  ])("%d g are sent as %s kg", (grams, text) => {
    expect(gramsToKg(grams)).toBe(text);
  });

  it.each([
    [500, "0.0005"],
    [1_000_000, "1"],
    [1_500_000, "1.5"],
    [1, "0.000001"],
  ])("%d cm³ are sent as %s m³", (cm3, text) => {
    expect(cm3ToM3(cm3)).toBe(text);
  });
});

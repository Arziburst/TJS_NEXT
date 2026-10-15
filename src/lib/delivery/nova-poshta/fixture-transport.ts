import "server-only";

import type { NovaPoshtaRequest, NovaPoshtaResult, Transport } from "./api";

/*
 * Answers from the recorded API answers (fixtures/recordings.json, tests/delivery/record-nova-poshta-fixtures.mjs)
 * instead of the network: for local walks and the e2e run without a key (NOVA_POSHTA_FIXTURES=true). A recorded
 * request answers as recorded; any other search is answered from the recorded rows (the settlements, branches
 * and streets of Kyiv, Lviv, Odesa and Brovary), a price from the recorded price closest in weight. Never on a
 * production deployment.
 */

type Recording = { request: NovaPoshtaRequest & { modelName: string }; response: Envelope };
type Envelope = { success: boolean; data: unknown[]; errors: string[]; errorCodes: string[] } & Record<string, unknown>;
type Row = Record<string, unknown>;

let recordings: Promise<Recording[]> | null = null;

function loadRecordings(): Promise<Recording[]> {
  recordings ??= import("./fixtures/recordings.json").then((module) => module.default.recordings as unknown as Recording[]);
  return recordings;
}

const ok = (data: unknown[]): Envelope => ({ success: true, data, errors: [], errorCodes: [] });
const failure = (message: string, code: string): Envelope => ({ success: false, data: [], errors: [message], errorCodes: [code] });

// the API refuses Latin letters in a search text
const LATIN = /[A-Za-z]/;

function sameProperties(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function recordedRows(all: Recording[], method: string, nested: boolean): Row[] {
  const rows = new Map<string, Row>();
  for (const { request, response } of all) {
    if (request.calledMethod !== method || !response.success) continue;
    const items = nested ? ((response.data[0] as { Addresses?: Row[] })?.Addresses ?? []) : (response.data as Row[]);
    for (const row of items) rows.set(String(row.Ref ?? row.SettlementStreetRef), row);
  }
  return [...rows.values()];
}

const text = (value: unknown) => String(value ?? "").toLocaleLowerCase("uk");

function answer(all: Recording[], request: NovaPoshtaRequest): Envelope {
  const props = request.methodProperties;
  const recorded = all.find(
    (r) => r.request.calledMethod === request.calledMethod && sameProperties(r.request.methodProperties, props),
  );
  if (recorded) return recorded.response;

  const limit = Number(props.Limit ?? 20);
  switch (request.calledMethod) {
    case "searchSettlements": {
      if (LATIN.test(props.CityName ?? "")) return failure("CityName has invalid characters", "20000500652");
      const query = text(props.CityName);
      const found = recordedRows(all, "searchSettlements", true).filter((row) => text(row.MainDescription).startsWith(query));
      return ok([{ TotalCount: found.length, Addresses: found.slice(0, limit) }]);
    }
    case "getWarehouses": {
      const query = text(props.FindByString);
      const found = recordedRows(all, "getWarehouses", false)
        .filter((row) => row.SettlementRef === props.SettlementRef)
        .filter((row) => !props.TypeOfWarehouseRef || row.TypeOfWarehouse === props.TypeOfWarehouseRef)
        .filter((row) => !props.WarehouseId || row.Number === props.WarehouseId)
        .filter((row) => !query || text(row.Description).includes(query))
        .sort((a, b) => Number(a.Number) - Number(b.Number));
      return ok(found.slice(0, limit));
    }
    case "searchSettlementStreets": {
      if (LATIN.test(props.StreetName ?? "")) return failure("StreetName has invalid characters", "20000500652");
      const query = text(props.StreetName);
      const found = recordedRows(all, "searchSettlementStreets", true)
        .filter((row) => row.SettlementRef === props.SettlementRef)
        .filter((row) => text(row.SettlementStreetDescription).startsWith(query));
      return ok([{ TotalCount: found.length, Addresses: found.slice(0, limit) }]);
    }
    case "getDocumentPrice": {
      const prices = all.filter(
        (r) => r.request.calledMethod === "getDocumentPrice" && r.response.success && r.request.methodProperties.ServiceType === props.ServiceType,
      );
      const sameCity = prices.filter((r) => r.request.methodProperties.CityRecipient === props.CityRecipient);
      const candidates = (sameCity.length > 0 ? sameCity : prices).sort(
        (a, b) => Number(a.request.methodProperties.Weight) - Number(b.request.methodProperties.Weight),
      );
      const weight = Number(props.Weight);
      const match = candidates.find((r) => Number(r.request.methodProperties.Weight) >= weight) ?? candidates.at(-1);
      if (!match) return failure("ServiceType is invalid", "20000200111");
      const [price] = match.response.data as { Cost: number }[];
      return ok([{ Cost: price.Cost, AssessedCost: Number(props.Cost) }]);
    }
  }
}

export const fixtureTransport: Transport = async (request): Promise<NovaPoshtaResult<unknown>> => {
  if (process.env.VERCEL_ENV === "production") {
    console.error("nova-poshta: NOVA_POSHTA_FIXTURES is set on a production deployment; no fixture is served");
    return { ok: false, error: { kind: "notConfigured" } };
  }
  return { ok: true, data: answer(await loadRecordings(), request) };
};

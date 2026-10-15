import "server-only";

import { z } from "zod";
import type { Settlement, Street, Warehouse, WarehouseKind } from "./types";

export type { Settlement, Street, Warehouse, WarehouseKind };

// Nova Poshta API 2.0: one JSON endpoint, the method in the body. The key (NOVA_POSHTA_API_KEY, server-only)
// goes in the body too; the dictionary methods and getDocumentPrice also answer without one.
export const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";

export const NOVA_POSHTA_TIMEOUT_MS = 8_000;

export type NovaPoshtaRequest = {
  modelName: "Address" | "InternetDocument";
  calledMethod: "searchSettlements" | "getWarehouses" | "searchSettlementStreets" | "getDocumentPrice";
  methodProperties: Record<string, string>;
};

export type NovaPoshtaError =
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "http"; status: number }
  | { kind: "invalidResponse" }
  // the API answered success: false
  | { kind: "api"; codes: string[]; messages: string[] }
  // NOVA_POSHTA_FIXTURES on a production deployment
  | { kind: "notConfigured" };

export type NovaPoshtaResult<T> = { ok: true; data: T } | { ok: false; error: NovaPoshtaError };

// The raw body of one answer, or why there is none
export type Transport = (request: NovaPoshtaRequest, signal: AbortSignal) => Promise<NovaPoshtaResult<unknown>>;

// NP refs are GUIDs, not always RFC 4122 versions, so z.uuid() would reject some
export const NP_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ref = z.string().regex(NP_REF);

// The API's code for a search text it refuses (Latin letters, some punctuation)
export const INVALID_CHARACTERS_CODE = "20000500652";

export function httpTransport({ apiKey, fetchImpl = fetch }: { apiKey: string; fetchImpl?: typeof fetch }): Transport {
  return async (request, signal) => {
    let response: Response;
    try {
      response = await fetchImpl(NOVA_POSHTA_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ apiKey, ...request }),
        cache: "no-store",
        signal,
      });
    } catch (error) {
      return { ok: false, error: { kind: signal.aborted || isTimeout(error) ? "timeout" : "network" } };
    }
    if (!response.ok) return { ok: false, error: { kind: "http", status: response.status } };
    try {
      return { ok: true, data: await response.json() };
    } catch (error) {
      return { ok: false, error: { kind: signal.aborted || isTimeout(error) ? "timeout" : "invalidResponse" } };
    }
  };
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
}

const envelopeSchema = z.object({
  success: z.boolean(),
  data: z.array(z.unknown()),
  errors: z.array(z.string()).default([]),
  errorCodes: z.array(z.string()).default([]),
});

// "1" / "0" flags and numbers the API sends as strings
const flag = z.union([z.string(), z.number(), z.boolean()]).transform((v) => v === true || v === 1 || v === "1");
const numeric = z.union([z.string(), z.number()]).transform((v) => (v === "" ? Number.NaN : Number(v)));

// --- Settlements ---------------------------------------------------------------------------------------------

const settlementSchema = z.object({
  Ref: ref,
  DeliveryCity: z.string(),
  MainDescription: z.string(),
  Present: z.string(),
  Area: z.string().default(""),
  Region: z.string().default(""),
  Warehouses: numeric,
  AddressDeliveryAllowed: flag.default(false),
});

const settlementsDataSchema = z.array(z.object({ TotalCount: numeric, Addresses: z.array(z.unknown()) }));

// --- Warehouses ----------------------------------------------------------------------------------------------

// getWarehouseTypes; a branch kind is queried by each of its types (the API filters by one type at a time)
export const WAREHOUSE_TYPE = {
  postBranch: "841339c7-591a-42e2-8233-7a0a00f0ed6f",
  cargoBranch: "9a68df70-0267-42a8-bb5c-37f427e36ee4",
  parcelShop: "6f8c7162-4b72-4b0a-88e5-906948c6a92f",
  postomat: "f9316480-5f2d-425d-bc2c-ac7cd29decf0",
  privatbankPostomat: "95dc212d-479c-4ffb-a8ab-8c1b9073d0bc",
} as const;

export const WAREHOUSE_TYPES_OF_KIND: Record<WarehouseKind, string[]> = {
  branch: [WAREHOUSE_TYPE.postBranch, WAREHOUSE_TYPE.cargoBranch, WAREHOUSE_TYPE.parcelShop],
  postomat: [WAREHOUSE_TYPE.postomat, WAREHOUSE_TYPE.privatbankPostomat],
};

const warehouseSchema = z.object({
  Ref: ref,
  Number: numeric,
  Description: z.string(),
  ShortAddress: z.string().default(""),
  TypeOfWarehouse: ref,
  CategoryOfWarehouse: z.string().default(""),
  CityRef: ref,
  SettlementRef: ref,
  WarehouseStatus: z.string().default("Working"),
  DenyToSelect: flag.default(false),
  TotalMaxWeightAllowed: numeric.default(0),
  PlaceMaxWeightAllowed: numeric.default(0),
});

// Branches and parcel lockers a recipient may choose: working, selectable, and not a drop-off-only point
// (category DropOff) or a fulfilment warehouse
function warehouseKind(row: z.infer<typeof warehouseSchema>): WarehouseKind | null {
  if (row.WarehouseStatus !== "Working" || row.DenyToSelect) return null;
  if (row.CategoryOfWarehouse === "Branch") return "branch";
  if (row.CategoryOfWarehouse === "Postomat") return "postomat";
  if (row.CategoryOfWarehouse !== "") return null;
  if (WAREHOUSE_TYPES_OF_KIND.branch.includes(row.TypeOfWarehouse)) return "branch";
  if (WAREHOUSE_TYPES_OF_KIND.postomat.includes(row.TypeOfWarehouse)) return "postomat";
  return null;
}

function maxWeightKg(row: z.infer<typeof warehouseSchema>): number | null {
  const limits = [row.PlaceMaxWeightAllowed, row.TotalMaxWeightAllowed].filter((kg) => Number.isFinite(kg) && kg > 0);
  return limits.length > 0 ? Math.min(...limits) : null;
}

// --- Streets -------------------------------------------------------------------------------------------------

const streetSchema = z.object({
  SettlementStreetRef: ref,
  SettlementStreetDescription: z.string(),
  Present: z.string(),
});

const streetsDataSchema = z.array(z.object({ TotalCount: numeric, Addresses: z.array(z.unknown()) }));

// --- Price ---------------------------------------------------------------------------------------------------

export type ServiceType = "WarehouseWarehouse" | "WarehousePostomat" | "WarehouseDoors" | "DoorsWarehouse" | "DoorsPostomat" | "DoorsDoors";

export type PriceRequest = {
  citySenderRef: string;
  cityRecipientRef: string;
  serviceType: ServiceType;
  weightGrams: number;
  // the parcel's volume (VolumeGeneral); the volumetric weight counts when it exceeds the weight
  volumeCm3: number;
  // the declared value in kopiykas
  declaredValueMinor: number;
};

export type Price = {
  // the delivery cost in kopiykas
  costMinor: number;
  declaredValueMinor: number;
};

const priceSchema = z.array(z.object({ Cost: z.number().nonnegative(), AssessedCost: z.number().nonnegative() })).min(1);

// a JSON number of hryvnias (107.5) in kopiykas, without float arithmetic; null for more than 2 decimals
export function hryvniasToMinor(amount: number): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount));
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

// kopiykas as the API's decimal string: 128950 → "1289.5"
export function minorToHryvnias(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const fraction = minor % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

// grams as the API's kilograms: 250 → "0.25"
export function gramsToKg(grams: number): string {
  const whole = Math.trunc(grams / 1000);
  const fraction = String(grams % 1000).padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

// cubic centimetres as the API's cubic metres: 500 → "0.0005"
export function cm3ToM3(cm3: number): string {
  const whole = Math.trunc(cm3 / 1_000_000);
  const fraction = String(cm3 % 1_000_000).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

// --- Client --------------------------------------------------------------------------------------------------

export type NovaPoshtaClient = {
  searchSettlements(query: string, limit: number): Promise<NovaPoshtaResult<Settlement[]>>;
  // number: the branch number, for a search text of digits; typeRef: one warehouse type
  getWarehouses(params: {
    settlementRef: string;
    typeRef?: string;
    query?: string;
    number?: string;
    limit: number;
  }): Promise<NovaPoshtaResult<Warehouse[]>>;
  searchStreets(params: { settlementRef: string; query: string; limit: number }): Promise<NovaPoshtaResult<Street[]>>;
  getDocumentPrice(params: PriceRequest): Promise<NovaPoshtaResult<Price>>;
};

export function createNovaPoshtaClient({
  transport,
  timeoutMs = NOVA_POSHTA_TIMEOUT_MS,
}: {
  transport: Transport;
  timeoutMs?: number;
}): NovaPoshtaClient {
  async function call(request: NovaPoshtaRequest): Promise<NovaPoshtaResult<unknown[]>> {
    const result = await transport(request, AbortSignal.timeout(timeoutMs));
    if (!result.ok) return result;
    const envelope = envelopeSchema.safeParse(result.data);
    if (!envelope.success) return { ok: false, error: { kind: "invalidResponse" } };
    if (!envelope.data.success) {
      return { ok: false, error: { kind: "api", codes: envelope.data.errorCodes, messages: envelope.data.errors } };
    }
    return { ok: true, data: envelope.data.data };
  }

  // rows that do not parse are dropped one by one: one odd record never hides the whole answer
  function rows<S extends z.ZodType>(schema: S, items: unknown[]): z.infer<S>[] {
    return items.flatMap((item) => {
      const parsed = schema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  return {
    async searchSettlements(query, limit) {
      const result = await call({
        modelName: "Address",
        calledMethod: "searchSettlements",
        methodProperties: { CityName: query, Limit: String(limit), Page: "1" },
      });
      if (!result.ok) return result;
      const data = settlementsDataSchema.safeParse(result.data);
      if (!data.success) return { ok: false, error: { kind: "invalidResponse" } };
      const settlements = rows(settlementSchema, data.data[0]?.Addresses ?? [])
        // a settlement without a delivery city cannot be shipped to
        .filter((row) => NP_REF.test(row.DeliveryCity))
        .map(
          (row): Settlement => ({
            ref: row.Ref,
            cityRef: row.DeliveryCity,
            name: row.MainDescription,
            label: row.Present,
            area: row.Area,
            region: row.Region,
            warehouseCount: Number.isFinite(row.Warehouses) ? row.Warehouses : 0,
            addressDelivery: row.AddressDeliveryAllowed,
          }),
        );
      return { ok: true, data: settlements };
    },

    async getWarehouses({ settlementRef, typeRef, query, number, limit }) {
      const methodProperties: Record<string, string> = {
        SettlementRef: settlementRef,
        Limit: String(limit),
        Page: "1",
        Language: "UA",
      };
      if (typeRef) methodProperties.TypeOfWarehouseRef = typeRef;
      if (number) methodProperties.WarehouseId = number;
      else if (query) methodProperties.FindByString = query;

      const result = await call({ modelName: "Address", calledMethod: "getWarehouses", methodProperties });
      if (!result.ok) return result;
      const warehouses = rows(warehouseSchema, result.data).flatMap((row): Warehouse[] => {
        const kind = warehouseKind(row);
        if (!kind || !Number.isSafeInteger(row.Number)) return [];
        return [
          {
            ref: row.Ref,
            number: row.Number,
            kind,
            typeRef: row.TypeOfWarehouse,
            name: row.Description,
            shortAddress: row.ShortAddress,
            cityRef: row.CityRef,
            settlementRef: row.SettlementRef,
            maxWeightKg: maxWeightKg(row),
          },
        ];
      });
      return { ok: true, data: warehouses };
    },

    async searchStreets({ settlementRef, query, limit }) {
      const result = await call({
        modelName: "Address",
        calledMethod: "searchSettlementStreets",
        methodProperties: { SettlementRef: settlementRef, StreetName: query, Limit: String(limit), Page: "1" },
      });
      if (!result.ok) return result;
      const data = streetsDataSchema.safeParse(result.data);
      if (!data.success) return { ok: false, error: { kind: "invalidResponse" } };
      const streets = rows(streetSchema, data.data[0]?.Addresses ?? []).map(
        (row): Street => ({ ref: row.SettlementStreetRef, name: row.SettlementStreetDescription, label: row.Present }),
      );
      return { ok: true, data: streets };
    },

    async getDocumentPrice({ citySenderRef, cityRecipientRef, serviceType, weightGrams, volumeCm3, declaredValueMinor }) {
      const result = await call({
        modelName: "InternetDocument",
        calledMethod: "getDocumentPrice",
        methodProperties: {
          CitySender: citySenderRef,
          CityRecipient: cityRecipientRef,
          Weight: gramsToKg(weightGrams),
          VolumeGeneral: cm3ToM3(volumeCm3),
          ServiceType: serviceType,
          Cost: minorToHryvnias(declaredValueMinor),
          CargoType: "Parcel",
          SeatsAmount: "1",
        },
      });
      if (!result.ok) return result;
      const data = priceSchema.safeParse(result.data);
      if (!data.success) return { ok: false, error: { kind: "invalidResponse" } };
      const costMinor = hryvniasToMinor(data.data[0].Cost);
      const assessedMinor = hryvniasToMinor(data.data[0].AssessedCost);
      if (costMinor === null || assessedMinor === null) return { ok: false, error: { kind: "invalidResponse" } };
      return { ok: true, data: { costMinor, declaredValueMinor: assessedMinor } };
    },
  };
}

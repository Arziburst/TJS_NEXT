import "server-only";
import type { z } from "zod";
import { parseDecimal, pow10 } from "@/lib/money/decimal";
import type { DeliveryCountry } from "./countries";
import { authorizationSchema, calculationSchema, divisionsSchema, errorSchema, settlementsSchema } from "./schemas";
import {
  DIVISION_CATEGORIES,
  type CarrierQuote,
  type Division,
  type DivisionCategory,
  type NovaPostFailure,
  type NovaPostResult,
  type QuoteRequest,
  type Settlement,
} from "./types";

// Production; the sandbox (api-stage.novapost.com) is chosen by NOVA_POST_API_URL
export const NOVA_POST_PRODUCTION_URL = "https://api.novapost.com/v.1.0";

export const DEFAULT_TIMEOUT_MS = 8_000;

// The JWT lives about an hour; it is renewed this long before its `exp`, or after this lifetime when it has none
const JWT_RENEW_MARGIN_MS = 60_000;
const JWT_FALLBACK_LIFETIME_MS = 55 * 60_000;

// Pages of divisions read for one settlement (a big city has a few hundred points)
const DIVISIONS_PAGE_SIZE = 100;
const DIVISIONS_MAX_PAGES = 10;

const SETTLEMENTS_LIMIT = 20;

// Languages the dictionaries answer in (Accept-language); the API writes Czech as "cz"; others get English
const API_LANGUAGES: Record<string, string> = {
  cs: "cz", de: "de", en: "en", es: "es", fr: "fr", it: "it", nl: "nl", pl: "pl", ro: "ro", uk: "uk",
};

export type NovaPostClientOptions = {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
};

export type NovaPostClient = {
  searchSettlements(country: DeliveryCountry, text: string, locale: string): Promise<NovaPostResult<Settlement[]>>;
  listDivisions(
    country: DeliveryCountry,
    settlementId: number,
    categories: readonly DivisionCategory[],
    locale: string,
  ): Promise<NovaPostResult<Division[]>>;
  calculate(request: QuoteRequest): Promise<NovaPostResult<CarrierQuote>>;
};

type Token = { jwt: string; renewAt: number };

class Failure extends Error {
  constructor(readonly failure: NovaPostFailure) {
    super(failure.kind);
  }
}

// The `exp` claim of a JWT in milliseconds, or null when it has none (the payload is read, not verified)
export function jwtExpiry(jwt: string): number | null {
  const payload = jwt.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const exp = (claims as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

// 109.38 → 10938; a cost with more than two decimals is rounded up to the cent, never down
export function costToMinor(cost: number): number | null {
  const parsed = parseDecimal(String(cost));
  if (!parsed) return null;
  const { units, scale } = parsed;
  const minor = scale <= 2 ? units * pow10(2 - scale) : (units + pow10(scale - 2) - BigInt(1)) / pow10(scale - 2);
  const value = Number(minor);
  return Number.isSafeInteger(value) ? value : null;
}

// Minor units → the API's decimal number (12345 → 123.45)
function minorToNumber(minor: number): number {
  return Number(`${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`);
}

// The API counts weight in steps of 10 g and rounds a remainder down; rounding up keeps the quote honest
function weightInTens(grams: number): number {
  return Math.ceil(grams / 10) * 10;
}

function errorMessage(body: unknown): string {
  const parsed = errorSchema.safeParse(body);
  if (!parsed.success) return "";
  return Object.entries(parsed.data.errors)
    .map(([field, text]) => `${field}: ${typeof text === "string" ? text : JSON.stringify(text)}`)
    .join("; ");
}

function region(item: z.infer<typeof settlementsSchema>["items"][number]): string | null {
  const parts = [item.region?.name, item.region?.parent?.name].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

function isDivisionCategory(value: string): value is DivisionCategory {
  return (DIVISION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * A server-only client of the Nova Post international API (api.novapost.com v1.0). The API key buys a JWT
 * of about an hour, kept until shortly before it expires and renewed once when a call answers 401. Every
 * method returns a discriminated result and never throws: timeouts, network errors, refusals and answers
 * that do not match the documented shape are typed failures.
 */
export function createNovaPostClient(options: NovaPostClientOptions): NovaPostClient {
  const baseUrl = (options.baseUrl ?? NOVA_POST_PRODUCTION_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  let token: Token | null = null;
  let pendingToken: Promise<Token> | null = null;

  async function send(path: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        // request-time data: never put into Next's fetch cache
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: "application/json", ...init.headers },
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Failure({ kind: "timeout" });
      }
      throw new Failure({ kind: "network", detail: error instanceof Error ? error.message : String(error) });
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Failure({ kind: "timeout" });
      }
      if (response.ok) throw new Failure({ kind: "invalidResponse", detail: "the body is not JSON" });
    }
    return { status: response.status, body };
  }

  function failureFor(status: number, body: unknown): NovaPostFailure {
    if (status === 401 || status === 403) return { kind: "unauthorized", status };
    if (status === 429) return { kind: "rateLimited" };
    return { kind: "http", status, detail: errorMessage(body) };
  }

  async function authorize(): Promise<Token> {
    const { status, body } = await send(`/clients/authorization?apiKey=${encodeURIComponent(options.apiKey)}`, {
      method: "GET",
    });
    // the gateway answers an unknown key with 404 "not_found"
    if (status === 404) throw new Failure({ kind: "unauthorized", status });
    if (status < 200 || status >= 300) throw new Failure(failureFor(status, body));
    const parsed = authorizationSchema.safeParse(body);
    if (!parsed.success) throw new Failure({ kind: "invalidResponse", detail: "authorization: no jwt" });
    const expiry = jwtExpiry(parsed.data.jwt);
    const renewAt = expiry === null ? now() + JWT_FALLBACK_LIFETIME_MS : expiry - JWT_RENEW_MARGIN_MS;
    return { jwt: parsed.data.jwt, renewAt };
  }

  async function currentToken(): Promise<Token> {
    if (token && now() < token.renewAt) return token;
    // concurrent requests share one authorization call
    pendingToken ??= authorize().finally(() => {
      pendingToken = null;
    });
    token = await pendingToken;
    return token;
  }

  async function call<S extends z.ZodType>(path: string, init: RequestInit, schema: S): Promise<z.infer<S>> {
    for (let attempt = 0; ; attempt++) {
      const { jwt } = await currentToken();
      const { status, body } = await send(path, { ...init, headers: { ...init.headers, Authorization: jwt } });
      if (status === 401 && attempt === 0) {
        // the JWT expired early or was revoked: renew it once
        token = null;
        continue;
      }
      if (status < 200 || status >= 300) throw new Failure(failureFor(status, body));
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new Failure({ kind: "invalidResponse", detail: `${path}: ${parsed.error.message}` });
      return parsed.data;
    }
  }

  async function result<T>(run: () => Promise<T>): Promise<NovaPostResult<T>> {
    try {
      return { ok: true, data: await run() };
    } catch (error) {
      if (error instanceof Failure) return { ok: false, error: error.failure };
      return { ok: false, error: { kind: "network", detail: error instanceof Error ? error.message : String(error) } };
    }
  }

  function languageHeader(locale: string): Record<string, string> {
    return { "Accept-language": API_LANGUAGES[locale] ?? "en" };
  }

  return {
    searchSettlements(country, text, locale) {
      return result(async () => {
        const query = new URLSearchParams({ "countryCodes[]": country, textSearch: text, limit: String(SETTLEMENTS_LIMIT) });
        const data = await call(`/settlements?${query}`, { method: "GET", headers: languageHeader(locale) }, settlementsSchema);
        return data.items
          .filter((item) => item.prohibitedIssuance !== true)
          .map((item) => ({ id: item.id, name: item.name, region: region(item) }));
      });
    },

    listDivisions(country, settlementId, categories, locale) {
      return result(async () => {
        const divisions: Division[] = [];
        for (let page = 1; page <= DIVISIONS_MAX_PAGES; page++) {
          const query = new URLSearchParams({
            "countryCodes[]": country,
            "settlementIds[]": String(settlementId),
            "statuses[]": "Working",
            prohibitedIssuance: "false",
            limit: String(DIVISIONS_PAGE_SIZE),
            page: String(page),
          });
          for (const category of categories) query.append("divisionCategories[]", category);
          const data = await call(`/divisions?${query}`, { method: "GET", headers: languageHeader(locale) }, divisionsSchema);
          for (const item of data.items) {
            if (!isDivisionCategory(item.divisionCategory) || !categories.includes(item.divisionCategory)) continue;
            if (item.status && item.status !== "Working") continue;
            divisions.push({
              id: item.id,
              number: item.number,
              name: item.name,
              category: item.divisionCategory,
              address: item.address ?? "",
            });
          }
          if (data.current_page >= data.last_page) break;
        }
        return divisions;
      });
    },

    calculate({ country, destination, parcel }) {
      return result(async () => {
        const recipient =
          destination.kind === "division"
            ? { countryCode: country, divisionId: destination.divisionId }
            : {
                countryCode: country,
                addressParts: {
                  city: destination.city,
                  postCode: destination.postCode,
                  street: destination.street,
                  building: destination.building,
                  flat: destination.flat ?? "",
                },
              };
        // DAP (D8): the shop pays the carrier for delivery, the recipient pays import VAT and duty on delivery
        const body = {
          payerType: "Sender",
          invoice: {
            incoterm: "DAP",
            currency: parcel.declaredCurrency,
            cost: minorToNumber(parcel.declaredValueMinor),
            payerFeesCustoms: "Recipient",
          },
          parcels: [
            {
              cargoCategory: "parcel",
              // the insured value, in the sender's currency (UAH): the declared value rule is the owner's
              insuranceCost: minorToNumber(parcel.insuranceUahMinor),
              rowNumber: 1,
              length: parcel.lengthMm,
              width: parcel.widthMm,
              height: parcel.heightMm,
              actualWeight: weightInTens(parcel.weightGrams),
            },
          ],
          // shipped from Ukraine; "-" stands for no particular sending division, as in the spec's UA examples
          sender: { countryCode: "UA", divisionNumber: "-" },
          recipient,
        };
        const data = await call(
          "/shipments/calculations",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
          calculationSchema,
        );

        const currencies = new Set(data.services.map((service) => service.currencyCode).filter(Boolean));
        const [currency] = currencies;
        if (currencies.size !== 1 || !currency) {
          throw new Failure({ kind: "invalidResponse", detail: "calculation: no single currency" });
        }
        let amountMinor = 0;
        for (const service of data.services) {
          const minor = costToMinor(service.cost);
          if (minor === null) throw new Failure({ kind: "invalidResponse", detail: `calculation: cost ${service.cost}` });
          amountMinor += minor;
          if (!Number.isSafeInteger(amountMinor)) throw new Failure({ kind: "invalidResponse", detail: "calculation: total" });
        }
        return { price: { currency, amountMinor }, scheduledDeliveryDate: data.scheduledDeliveryDate ?? null };
      });
    },
  };
}

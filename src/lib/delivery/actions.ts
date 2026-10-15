"use server";

import { z } from "zod";
import { NP_REF } from "./nova-poshta/api";
import { novaPoshtaClient } from "./nova-poshta/client";
import { MAX_QUERY_LENGTH, findSettlements, findStreets, findWarehouses, type DictionaryResult } from "./nova-poshta/dictionary";
import { createDictionaryStore } from "./nova-poshta/dictionary-store";
import { quoteDelivery } from "./nova-poshta/quote";
import type { QuoteResult, SearchResult, Settlement, Street, Warehouse } from "./nova-poshta/types";

// Public entry points of the delivery UI (src/components/delivery): anyone may search the carrier's
// dictionaries and get an estimate, so no user check; every input is validated here.

const query = z.string().max(MAX_QUERY_LENGTH * 2);
const ref = z.string().regex(NP_REF);

function deps() {
  let store = null;
  try {
    store = createDictionaryStore();
  } catch (error) {
    console.error("nova-poshta: the cache is not available", error);
  }
  return { client: novaPoshtaClient(), store, now: new Date() };
}

function toSearch<T>(result: DictionaryResult<T>): SearchResult<T> {
  return result.ok ? { ok: true, items: result.items } : result;
}

export async function searchSettlementsAction(input: unknown): Promise<SearchResult<Settlement>> {
  const parsed = query.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return toSearch(await findSettlements(parsed.data, deps()));
}

const warehousesInput = z.object({ settlementRef: ref, filter: z.enum(["all", "branch", "postomat"]), query });

export async function searchWarehousesAction(input: unknown): Promise<SearchResult<Warehouse>> {
  const parsed = warehousesInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return toSearch(await findWarehouses(parsed.data, deps()));
}

const streetsInput = z.object({ settlementRef: ref, query });

export async function searchStreetsAction(input: unknown): Promise<SearchResult<Street>> {
  const parsed = streetsInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return toSearch(await findStreets(parsed.data, { client: novaPoshtaClient() }));
}

// The parcel comes from the caller for now; the checkout (#24) derives it from the cart on the server
// (parcelFromCart) instead of trusting the browser.
const quoteInput = z.object({
  cityRef: ref,
  recipient: z.enum(["warehouse", "postomat", "doors"]),
  parcel: z.object({
    weightGrams: z.int().min(1).max(1_000_000),
    declaredValueMinor: z.int().min(0).max(100_000_000_00),
  }),
});

export async function quoteAction(input: unknown): Promise<QuoteResult> {
  const parsed = quoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return quoteDelivery(parsed.data, { client: novaPoshtaClient() });
}

import "server-only";

import { z } from "zod";
import { getAdmin } from "@/lib/auth/session";
import type { ProductAvailability, ProductFulfillment } from "@/lib/catalog/types";
import { isCurrency, type Currency } from "@/lib/money/currencies";
import type { DeliveryEstimateView } from "@/lib/orders/store";
import { createSessionClient, type ServerSupabaseClient } from "@/lib/supabase/server";
import { ADMIN_ORDERS_PAGE_SIZE, type AdminOrderFilters } from "./order-filters";
import { ORDER_STATUSES, type AdminOrderStatus, type OrderStatus } from "./order-status";

/*
 * The admin's orders (#27). Reads and writes go through the admin's own session: RLS lets an admin read every
 * order, line, note and history row (supabase/migrations/…_admin_orders.sql), and the status change is the
 * database function admin_set_order_status, which checks the admin again and does the whole change in one
 * transaction. Every function checks the admin itself first (a page has called requireAdmin() already).
 */

export type AdminOrdersResult<T> = { ok: true; data: T } | { ok: false; reason: "notAuthorized" | "unexpectedError" };

export type AdminOrderListItem = {
  number: number;
  status: OrderStatus;
  createdAt: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string;
  country: string;
  carrier: "nova_poshta" | "nova_post";
  method: DeliveryMethod;
  currency: Currency;
  decimals: number;
  totalMinor: number;
  /** pieces in the order (the sum of the lines' quantities) */
  quantity: number;
};

export type AdminOrderPage = {
  items: AdminOrderListItem[];
  total: number;
  /** new requests among the matching orders */
  newCount: number;
  page: number;
  pageCount: number;
};

export type DeliveryMethod = "warehouse" | "postomat" | "doors" | "division" | "address";

const status = z.enum(ORDER_STATUSES);
const method = z.enum(["warehouse", "postomat", "doors", "division", "address"]);
const carrier = z.enum(["nova_poshta", "nova_post"]);
const currency = z.string().refine(isCurrency);
const minor = z.number().int().nonnegative().refine(Number.isSafeInteger);

const listAnswer = z.object({
  total: z.number().int().nonnegative(),
  new_count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      number: z.number().int().positive(),
      status,
      created_at: z.string(),
      first_name: z.string(),
      last_name: z.string().nullable(),
      phone: z.string(),
      email: z.string(),
      country: z.string(),
      delivery_carrier: carrier,
      delivery_method: method,
      currency,
      currency_decimals: z.number().int(),
      items_total_minor: minor,
      quantity: z.number().int().nonnegative(),
    }),
  ),
});

/** One page of the order list: new requests first, then newest on top (the database's order). */
export async function listAdminOrders(filters: AdminOrderFilters, page: number): Promise<AdminOrdersResult<AdminOrderPage>> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  const read = async (target: number) => {
    const client = await createSessionClient();
    return client.rpc("admin_list_orders", {
      p_status: filters.status,
      p_date_from: filters.dateFrom,
      p_date_to: filters.dateTo,
      p_country: filters.country,
      p_query: filters.query,
      p_limit: ADMIN_ORDERS_PAGE_SIZE,
      p_offset: (target - 1) * ADMIN_ORDERS_PAGE_SIZE,
    });
  };

  try {
    let current = Math.max(1, Math.floor(page));
    let { data, error } = await read(current);
    let parsed = error ? null : listAnswer.safeParse(data);
    // a page past the end (an old link after orders were canceled away by a filter) shows the last one
    if (parsed?.success && parsed.data.items.length === 0 && parsed.data.total > 0 && current > 1) {
      current = Math.ceil(parsed.data.total / ADMIN_ORDERS_PAGE_SIZE);
      ({ data, error } = await read(current));
      parsed = error ? null : listAnswer.safeParse(data);
    }
    if (error || !parsed?.success) {
      console.error("admin orders: list failed", error ?? parsed?.error);
      return { ok: false, reason: error?.code === "42501" ? "notAuthorized" : "unexpectedError" };
    }
    const answer = parsed.data;
    return {
      ok: true,
      data: {
        total: answer.total,
        newCount: answer.new_count,
        page: current,
        pageCount: Math.max(1, Math.ceil(answer.total / ADMIN_ORDERS_PAGE_SIZE)),
        items: answer.items.map((row) => ({
          number: row.number,
          status: row.status,
          createdAt: row.created_at,
          firstName: row.first_name,
          lastName: row.last_name,
          phone: row.phone,
          email: row.email,
          country: row.country,
          carrier: row.delivery_carrier,
          method: row.delivery_method,
          currency: row.currency as Currency,
          decimals: row.currency_decimals,
          totalMinor: row.items_total_minor,
          quantity: row.quantity,
        })),
      },
    };
  } catch (error) {
    console.error("admin orders: list failed", error);
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The number of new order requests (the admin navigation's badge); null when it cannot be read. */
export async function countNewOrders(): Promise<number | null> {
  if (!(await getAdmin())) return null;
  try {
    const client = await createSessionClient();
    const { count, error } = await client.from("orders").select("id", { count: "exact", head: true }).eq("status", "new");
    if (error) {
      console.error("admin orders: new count failed", error);
      return null;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

// The detail ---------------------------------------------------------------------------------------------------

/** Where the parcel goes, as the customer chose it at checkout (src/lib/checkout/delivery.ts). */
export type DeliveryDestination =
  | { kind: "novaPoshtaWarehouse"; city: string; warehouse: string; warehouseNumber: number; postomat: boolean }
  | { kind: "novaPoshtaAddress"; city: string; street: string; house: string; flat: string | null }
  | { kind: "novaPostDivision"; settlement: string; division: string; divisionNumber: string; address: string }
  | { kind: "novaPostAddress"; city: string; postCode: string; street: string; building: string; flat: string | null }
  // a shape this version does not know: its values as they were stored
  | { kind: "other"; values: [string, string][] };

const label = z.object({ label: z.string() });
const destinationShapes = {
  novaPoshtaWarehouse: z.object({
    city: label,
    warehouse: z.object({ name: z.string(), number: z.number(), kind: z.string() }),
  }),
  novaPoshtaAddress: z.object({ city: label, street: label, house: z.string(), flat: z.string().nullable().optional() }),
  novaPostDivision: z.object({
    settlement: z.object({ name: z.string() }),
    division: z.object({ name: z.string(), number: z.string(), address: z.string() }),
  }),
  novaPostAddress: z.object({
    city: z.string(),
    postCode: z.string(),
    street: z.string(),
    building: z.string(),
    flat: z.string().nullable().optional(),
  }),
};

function flatten(value: unknown, prefix = ""): [string, string][] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object") return [[prefix || "value", String(value)]];
  return Object.entries(value).flatMap(([key, inner]) => flatten(inner, prefix ? `${prefix}.${key}` : key));
}

export function destinationOf(carrierName: string, methodName: string, value: unknown): DeliveryDestination {
  if (carrierName === "nova_poshta" && (methodName === "warehouse" || methodName === "postomat")) {
    const parsed = destinationShapes.novaPoshtaWarehouse.safeParse(value);
    if (parsed.success) {
      const { city, warehouse } = parsed.data;
      return {
        kind: "novaPoshtaWarehouse",
        city: city.label,
        warehouse: warehouse.name,
        warehouseNumber: warehouse.number,
        postomat: warehouse.kind === "postomat",
      };
    }
  } else if (carrierName === "nova_poshta" && methodName === "doors") {
    const parsed = destinationShapes.novaPoshtaAddress.safeParse(value);
    if (parsed.success) {
      const { city, street, house, flat } = parsed.data;
      return { kind: "novaPoshtaAddress", city: city.label, street: street.label, house, flat: flat ?? null };
    }
  } else if (carrierName === "nova_post" && methodName === "division") {
    const parsed = destinationShapes.novaPostDivision.safeParse(value);
    if (parsed.success) {
      const { settlement, division } = parsed.data;
      return {
        kind: "novaPostDivision",
        settlement: settlement.name,
        division: division.name,
        divisionNumber: division.number,
        address: division.address,
      };
    }
  } else if (carrierName === "nova_post" && methodName === "address") {
    const parsed = destinationShapes.novaPostAddress.safeParse(value);
    if (parsed.success) return { kind: "novaPostAddress", ...parsed.data, flat: parsed.data.flat ?? null };
  }
  return { kind: "other", values: flatten(value) };
}

export type AdminOrderLine = {
  position: number;
  productId: string | null;
  sku: string | null;
  fulfillment: ProductFulfillment;
  /** the piece's availability now (one of a kind: reserved, sold …); null when the product is gone */
  availability: ProductAvailability | null;
  title: string;
  titleLocale: string;
  /** the size it was ordered in (#66), as the customer saw it */
  variantLabel: string | null;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
  unitUsdMinor: number;
  lineUsdMinor: number;
};

export type AdminOrderNote = { id: string; body: string; createdAt: string; author: string | null };
export type AdminOrderChange = { id: string; from: OrderStatus; to: OrderStatus; createdAt: string; by: string | null };

export type AdminOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  locale: string;
  /** the customer's account; null for a guest */
  userId: string | null;
  firstName: string;
  lastName: string | null;
  phone: string;
  email: string;
  comment: string | null;
  country: string;
  carrier: "nova_poshta" | "nova_post";
  method: DeliveryMethod;
  destination: DeliveryDestination;
  delivery: DeliveryEstimateView;
  currency: Currency;
  decimals: number;
  fxRate: string;
  fxRateDate: string | null;
  markupBps: number;
  totalMinor: number;
  totalUsdMinor: number;
  lines: AdminOrderLine[];
  notes: AdminOrderNote[];
  history: AdminOrderChange[];
};

const DETAIL_COLUMNS = `id, number, status, created_at, updated_at, locale, user_id, first_name, last_name, phone, email,
  comment, country, delivery_carrier, delivery_method, delivery_destination, delivery_estimate_state,
  delivery_estimate_source, delivery_estimate_minor, delivery_estimate_currency, delivery_estimate_decimals,
  currency, currency_decimals, fx_rate_text:fx_rate::text, fx_rate_date, markup_bps, items_total_minor, items_total_usd_minor,
  order_items(position, product_id, sku, fulfillment, title, title_locale, variant_label, quantity, unit_price_minor, line_total_minor,
    unit_price_usd_minor, line_total_usd_minor, products(availability)),
  order_notes(id, body, created_at, author:profiles(name)),
  order_status_history(id, from_status, to_status, created_at, admin:profiles(name))`;

const detailRow = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  status,
  created_at: z.string(),
  updated_at: z.string(),
  locale: z.string(),
  user_id: z.string().nullable(),
  first_name: z.string(),
  last_name: z.string().nullable(),
  phone: z.string(),
  email: z.string(),
  comment: z.string().nullable(),
  country: z.string(),
  delivery_carrier: carrier,
  delivery_method: method,
  delivery_destination: z.unknown(),
  delivery_estimate_state: z.enum(["amount", "tbd", "unavailable"]),
  delivery_estimate_source: z.enum(["carrier", "flat_rate"]).nullable(),
  delivery_estimate_minor: minor.nullable(),
  delivery_estimate_currency: z.string().nullable(),
  delivery_estimate_decimals: z.number().int().nullable(),
  currency,
  currency_decimals: z.number().int(),
  fx_rate_text: z.string(),
  fx_rate_date: z.string().nullable(),
  markup_bps: z.number().int(),
  items_total_minor: minor,
  items_total_usd_minor: minor,
  order_items: z.array(
    z.object({
      position: z.number().int(),
      product_id: z.string().nullable(),
      sku: z.string().nullable(),
      fulfillment: z.enum(["made_to_order", "one_of_a_kind"]),
      title: z.string(),
      title_locale: z.string(),
      variant_label: z.string().nullable(),
      quantity: z.number().int(),
      unit_price_minor: minor,
      line_total_minor: minor,
      unit_price_usd_minor: minor,
      line_total_usd_minor: minor,
      products: z.object({ availability: z.enum(["available", "reserved", "sold"]) }).nullable(),
    }),
  ),
  order_notes: z.array(
    z.object({ id: z.string(), body: z.string(), created_at: z.string(), author: z.object({ name: z.string().nullable() }).nullable() }),
  ),
  order_status_history: z.array(
    z.object({
      id: z.string(),
      from_status: status,
      to_status: status,
      created_at: z.string(),
      admin: z.object({ name: z.string().nullable() }).nullable(),
    }),
  ),
});

function estimateOf(row: z.infer<typeof detailRow>): DeliveryEstimateView {
  const amount = row.delivery_estimate_minor;
  const estimateCurrency = row.delivery_estimate_currency;
  if (row.delivery_estimate_state === "amount" && amount !== null && isCurrency(estimateCurrency) && row.delivery_estimate_decimals !== null) {
    return {
      state: "amount",
      source: row.delivery_estimate_source ?? "carrier",
      currency: estimateCurrency,
      amountMinor: amount,
      decimals: row.delivery_estimate_decimals,
    };
  }
  return row.delivery_estimate_state === "tbd" ? { state: "tbd" } : { state: "unavailable" };
}

const byTime = (a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt);

/** Order `number` with its lines, notes and history; data null when there is no such order. */
export async function getAdminOrder(number: number): Promise<AdminOrdersResult<AdminOrder | null>> {
  if (!(await getAdmin())) return { ok: false, reason: "notAuthorized" };
  try {
    const client = await createSessionClient();
    const { data, error } = await client.from("orders").select(DETAIL_COLUMNS).eq("number", number).maybeSingle();
    if (error) {
      console.error("admin orders: read failed", error);
      return { ok: false, reason: "unexpectedError" };
    }
    if (!data) return { ok: true, data: null };
    const parsed = detailRow.safeParse(data);
    if (!parsed.success) {
      console.error("admin orders: unexpected order row", parsed.error);
      return { ok: false, reason: "unexpectedError" };
    }
    const row = parsed.data;
    return {
      ok: true,
      data: {
        id: row.id,
        number: row.number,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        locale: row.locale,
        userId: row.user_id,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        email: row.email,
        comment: row.comment,
        country: row.country,
        carrier: row.delivery_carrier,
        method: row.delivery_method,
        destination: destinationOf(row.delivery_carrier, row.delivery_method, row.delivery_destination),
        delivery: estimateOf(row),
        currency: row.currency as Currency,
        decimals: row.currency_decimals,
        fxRate: row.fx_rate_text,
        fxRateDate: row.fx_rate_date,
        markupBps: row.markup_bps,
        totalMinor: row.items_total_minor,
        totalUsdMinor: row.items_total_usd_minor,
        lines: row.order_items
          .map((item) => ({
            position: item.position,
            productId: item.product_id,
            sku: item.sku,
            fulfillment: item.fulfillment,
            availability: item.products?.availability ?? null,
            title: item.title,
            titleLocale: item.title_locale,
            variantLabel: item.variant_label,
            quantity: item.quantity,
            unitMinor: item.unit_price_minor,
            lineMinor: item.line_total_minor,
            unitUsdMinor: item.unit_price_usd_minor,
            lineUsdMinor: item.line_total_usd_minor,
          }))
          .sort((a, b) => a.position - b.position),
        notes: row.order_notes
          .map((note) => ({ id: note.id, body: note.body, createdAt: note.created_at, author: note.author?.name ?? null }))
          .sort(byTime),
        history: row.order_status_history
          .map((change) => ({
            id: change.id,
            from: change.from_status,
            to: change.to_status,
            createdAt: change.created_at,
            by: change.admin?.name ?? null,
          }))
          .sort(byTime),
      },
    };
  } catch (error) {
    console.error("admin orders: read failed", error);
    return { ok: false, reason: "unexpectedError" };
  }
}

// The writes ---------------------------------------------------------------------------------------------------

export type SetOrderStatusResult =
  | { ok: true; status: OrderStatus; productIds: string[] }
  | { ok: false; reason: "notFound" | "stale" | "illegal" | "conflict" | "notAuthorized" | "unexpectedError"; productIds?: string[] };

const statusAnswer = z.union([
  z.object({ ok: z.literal(true), status, product_ids: z.array(z.uuid()) }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["not_found", "stale", "illegal", "conflict"]),
    product_ids: z.array(z.uuid()).optional(),
  }),
]);

/**
 * Moves order `number` from `from` (the status the admin saw) to `to` in one database transaction: the pieces
 * sold or released (D24), a history row and the 'order_status_changed' outbox event for the notifications (#26).
 * `client` is the admin's session: the database checks the role and records the admin as the author.
 */
export async function setOrderStatus(
  client: ServerSupabaseClient,
  number: number,
  from: OrderStatus,
  to: AdminOrderStatus,
): Promise<SetOrderStatusResult> {
  try {
    const { data, error } = await client.rpc("admin_set_order_status", { p_number: number, p_from: from, p_to: to });
    if (error) {
      if (error.code === "42501") return { ok: false, reason: "notAuthorized" };
      console.error("admin orders: status change failed", error);
      return { ok: false, reason: "unexpectedError" };
    }
    const parsed = statusAnswer.safeParse(data);
    if (!parsed.success) {
      console.error("admin orders: unexpected status answer", data);
      return { ok: false, reason: "unexpectedError" };
    }
    const answer = parsed.data;
    if (answer.ok) return { ok: true, status: answer.status, productIds: answer.product_ids };
    return {
      ok: false,
      reason: answer.reason === "not_found" ? "notFound" : answer.reason,
      productIds: answer.product_ids,
    };
  } catch (error) {
    console.error("admin orders: status change failed", error);
    return { ok: false, reason: "unexpectedError" };
  }
}

export type AddOrderNoteResult = { ok: true } | { ok: false; reason: "notFound" | "notAuthorized" | "unexpectedError" };

/** Adds the admin's note to order `number`, in their own name (RLS checks it) through their session `client`. */
export async function addOrderNote(
  client: ServerSupabaseClient,
  number: number,
  authorId: string,
  body: string,
): Promise<AddOrderNoteResult> {
  try {
    const { data: order, error: readError } = await client.from("orders").select("id").eq("number", number).maybeSingle();
    if (readError) {
      console.error("admin orders: note's order read failed", readError);
      return { ok: false, reason: "unexpectedError" };
    }
    if (!order) return { ok: false, reason: "notFound" };
    const { error } = await client.from("order_notes").insert({ order_id: order.id, author_id: authorId, body });
    if (error) {
      if (error.code === "42501") return { ok: false, reason: "notAuthorized" };
      console.error("admin orders: note insert failed", error);
      return { ok: false, reason: "unexpectedError" };
    }
    return { ok: true };
  } catch (error) {
    console.error("admin orders: note insert failed", error);
    return { ok: false, reason: "unexpectedError" };
  }
}

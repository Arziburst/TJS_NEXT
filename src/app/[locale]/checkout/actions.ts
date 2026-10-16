"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readCartView } from "@/lib/cart";
import { removeLine } from "@/lib/cart/lines";
import { allowVisitorAction, changeCart } from "@/lib/cart/mutations";
import { rememberOrderAccess } from "@/lib/checkout/access";
import { CHECKOUT_RATE_LIMIT, placeOrder, type PlaceOrderResult } from "@/lib/checkout/place-order";
import { novaPoshtaClient } from "@/lib/delivery/nova-poshta/client";
import { quoteDelivery } from "@/lib/delivery/nova-poshta/quote";
import { getNovaPostClient } from "@/lib/delivery/nova-post/config";
import { estimateDelivery } from "@/lib/delivery/nova-post/quote";
import { readZoneRates } from "@/lib/delivery/nova-post/zone-rates";
import { getCurrencyChoiceFor } from "@/lib/money/prices";
import { runNotificationsQuietly } from "@/lib/notifications/run";
import { createOrderRequest, findOrderByAttempt } from "@/lib/orders/store";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The checkout's one entry point: anyone, signed in or a guest, may place an order request. The input is
 * validated and the visitor re-read from the session in placeOrder; prices, the rate and the delivery estimate
 * come from the database, never from the form. On success the client opens the confirmation page.
 */
export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const result = await placeOrder(input, {
    currentUser: getCurrentUser,
    allow: (userId) => allowVisitorAction("checkout", CHECKOUT_RATE_LIMIT, userId),
    findOrder: (attempt) => findOrderByAttempt(createServiceClient(), attempt),
    readCart: readCartView,
    currency: getCurrencyChoiceFor,
    delivery: {
      quoteNovaPoshta: (request) => quoteDelivery(request, { client: novaPoshtaClient() }),
      estimateNovaPost: (request, parcel, tables) =>
        estimateDelivery(request, { client: getNovaPostClient(), parcel, zoneRates: readZoneRates, tables }),
    },
    createOrder: (order, items) => createOrderRequest(createServiceClient(), order, items),
    removeFromCart: async (ordered) => {
      const outcome = await changeCart<undefined, never>(async (lines) => ({
        lines: ordered.reduce((rest, line) => removeLine(rest, line), lines),
        result: undefined,
      }));
      if (!outcome.ok) throw new Error(`cart: ${outcome.reason}`);
    },
    rememberOrder: rememberOrderAccess,
  });
  if (result.ok) {
    refresh();
    // the owner's Telegram message and the customer's email go out after the answer (the outbox row was
    // stored with the order): a slow or failing messenger never delays or undoes the request
    after(runNotificationsQuietly);
  }
  return result;
}

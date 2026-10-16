import type { Locale } from "@/i18n/routing";
import type { CartItem, CartView } from "@/lib/cart";
import { lineTitle, sameLine, type LineRef } from "@/lib/cart/lines";
import type { Currency } from "@/lib/money/currencies";
import type { MoneyTables } from "@/lib/money/store";
import type { CreateOrderResult, NewOrder, NewOrderItem } from "@/lib/orders/store";
import { deliveryRecord, estimateForOrder, type DeliveryDeps } from "./delivery";
import { buildQuote, type QuoteItem } from "./quote";
import { checkoutSchema, invalidFields, type CheckoutField, type CheckoutRequest } from "./schema";

// Technical (coordinator): a person sends one request, maybe a retry or two after fixing the form; a script
// that floods the owner with requests is stopped. Counted per account, else per client IP, like the cart.
export const CHECKOUT_RATE_LIMIT = { max: 5, windowSeconds: 600 } as const;

export type PlaceOrderResult =
  | { ok: true; number: number }
  | { ok: false; reason: "invalid"; fields: CheckoutField[] }
  // pieces that were sold or reserved meanwhile (or unpublished): nothing was stored
  | { ok: false; reason: "unavailable"; titles: string[] }
  // sizes switched off or removed meanwhile (#66), the product itself still orderable: nothing was stored
  | { ok: false; reason: "sizeUnavailable"; titles: string[] }
  | {
      ok: false;
      reason:
        | "rateLimited"
        // nothing orderable in the cart (e.g. it was ordered in another tab)
        | "emptyCart"
        // the cart's lines differ from the ones the customer saw: the page shows them again
        | "cartChanged"
        // a price changed since the page was shown (a sale started or ended, #67): it shows the new prices first
        | "pricesChanged"
        // no exchange rate to price the order in the visitor's currency
        | "pricesUnavailable"
        | "unexpectedError";
    };

export type PlaceOrderDeps = {
  currentUser: () => Promise<{ id: string } | null>;
  // CHECKOUT_RATE_LIMIT for the account or the client IP; false also when the counter is unreachable
  allow: (userId: string | null) => Promise<boolean>;
  // the order this attempt already created, if any (a resubmit after the cart was emptied by the first one)
  findOrder: (attempt: string) => Promise<{ number: number; userId: string | null } | null>;
  readCart: (locale: Locale) => Promise<CartView>;
  currency: (locale: Locale) => Promise<{ current: Currency; tables: MoneyTables | null }>;
  delivery: Omit<DeliveryDeps, "tables">;
  createOrder: (order: NewOrder, items: NewOrderItem[]) => Promise<CreateOrderResult>;
  // the ordered lines leave the cart only once the order is stored
  removeFromCart: (lines: LineRef[]) => Promise<void>;
  rememberOrder: (access: { number: number; token: string }) => Promise<void>;
};

type Orderable = CartItem & { product: NonNullable<CartItem["product"]> };

function isOrderable(item: CartItem): item is Orderable {
  return item.status === "available" && item.product !== null;
}

/**
 * Compares the cart now with the lines the customer saw on the page (a line is a product and its size). A piece
 * that has become unavailable is named; any other difference (a line added, removed or changed in another tab)
 * asks to check the order again.
 */
function compareWithExpected(items: readonly CartItem[], expected: CheckoutRequest["expected"]): PlaceOrderResult | null {
  const unavailable: string[] = [];
  const sizes: string[] = [];
  for (const line of expected) {
    const item = items.find((i) => sameLine(i.line, line));
    if (!item) return { ok: false, reason: "cartChanged" };
    if (!isOrderable(item)) {
      if (!item.product) return { ok: false, reason: "cartChanged" };
      const title = lineTitle(item.product.title, item.variant?.label);
      // the piece can still be made, only its size cannot: not "ordered by someone else"
      if (item.product.availability === "available" && line.variantId !== null) sizes.push(title);
      else unavailable.push(title);
    } else if (item.quantity !== line.quantity) return { ok: false, reason: "cartChanged" };
  }
  if (unavailable.length > 0) return { ok: false, reason: "unavailable", titles: unavailable };
  if (sizes.length > 0) return { ok: false, reason: "sizeUnavailable", titles: sizes };
  const extra = items.some((item) => isOrderable(item) && !expected.some((line) => sameLine(line, item.line)));
  if (extra) return { ok: false, reason: "cartChanged" };
  // the order is priced now, never at the shown price: a different price is shown before it is sent
  const repriced = expected.some((line) => items.find((i) => sameLine(i.line, line))?.unitUsdMinor !== line.unitUsdMinor);
  return repriced ? { ok: false, reason: "pricesChanged" } : null;
}

/**
 * Places an order request for the current visitor (D19: no payment). The input names only the contacts, the
 * delivery choice and the lines the customer saw; every price, the rate and the delivery estimate are built
 * here from the database, and one-of-a-kind pieces are reserved with the order (D24).
 */
export async function placeOrder(input: unknown, deps: PlaceOrderDeps): Promise<PlaceOrderResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid", fields: invalidFields(parsed.error) };
  const request = parsed.data;

  const user = await deps.currentUser();
  if (!(await deps.allow(user?.id ?? null))) return { ok: false, reason: "rateLimited" };

  try {
    const placed = await deps.findOrder(request.attempt);
    if (placed) return confirm(placed, user?.id ?? null, request.attempt, deps);

    const cart = await deps.readCart(request.locale);
    if (!cart.ok) return { ok: false, reason: "unexpectedError" };
    const changed = compareWithExpected(cart.items, request.expected);
    if (changed) return changed;
    const orderable = cart.items.filter(isOrderable);
    if (orderable.length === 0) return { ok: false, reason: "emptyCart" };

    const { current, tables } = await deps.currency(request.locale);
    const quoteItems: QuoteItem[] = orderable.map(({ line, product, variant, unitUsdMinor, regularUnitUsdMinor, quantity }) => ({
      productId: product.id,
      variantId: line.variantId,
      fulfillment: product.fulfillment,
      title: product.title,
      titleLocale: product.locale,
      variantLabel: variant ? { text: variant.label, locale: variant.labelLocale } : null,
      sku: product.sku,
      priceUsdMinor: unitUsdMinor,
      regularPriceUsdMinor: regularUnitUsdMinor,
      weightGrams: product.weightGrams,
      quantity,
    }));
    const built = buildQuote(quoteItems, current, tables);
    if (!built.ok) return { ok: false, reason: built.reason === "empty" ? "emptyCart" : built.reason === "noRate" ? "pricesUnavailable" : "unexpectedError" };
    const { quote } = built;

    const destination = deliveryRecord(request.delivery);
    const estimate = await estimateForOrder(request.delivery, quote, { ...deps.delivery, tables });
    const amount = estimate.state === "amount" ? estimate : null;

    const created = await deps.createOrder(
      {
        idempotency_key: request.attempt,
        user_id: user?.id ?? null,
        locale: request.locale,
        first_name: request.contact.firstName,
        last_name: request.contact.lastName,
        phone: request.contact.phone,
        email: request.contact.email,
        comment: request.comment,
        country: destination.country,
        delivery_carrier: destination.carrier,
        delivery_method: destination.method,
        delivery_destination: destination.destination,
        delivery_estimate_state: estimate.state,
        delivery_estimate_source: estimate.source,
        delivery_estimate_minor: amount?.amountMinor ?? null,
        delivery_estimate_currency: amount?.currency ?? null,
        delivery_estimate_decimals: amount?.decimals ?? null,
        currency: quote.currency,
        currency_decimals: quote.decimals,
        fx_rate: quote.fxRate,
        fx_rate_date: quote.fxRateDate,
        markup_bps: quote.markupBps,
        items_total_usd_minor: quote.totalUsdMinor,
        items_total_minor: quote.totalMinor,
      },
      quote.lines.map((line) => ({
        product_id: line.productId,
        variant_id: line.variantId,
        position: line.position,
        title: line.title,
        title_locale: line.titleLocale,
        variant_label: line.variantLabel?.text ?? null,
        variant_label_locale: line.variantLabel?.locale ?? null,
        quantity: line.quantity,
        unit_price_usd_minor: line.priceUsdMinor,
        unit_price_minor: line.unitMinor,
        regular_unit_price_usd_minor: line.regularPriceUsdMinor,
        regular_unit_price_minor: line.regularUnitMinor,
      })),
    );

    if (!created.ok) {
      if (created.reason === "error") return { ok: false, reason: "unexpectedError" };
      const refused = quote.lines.filter((line) => created.productIds.includes(line.productId));
      const titles = refused.map((line) => lineTitle(line.title, line.variantLabel?.text));
      // made-to-order work is never taken by someone else: a refused line of a size lost its size meanwhile
      const sizesOnly = refused.every((line) => line.fulfillment === "made_to_order" && line.variantId !== null);
      return { ok: false, reason: sizesOnly ? "sizeUnavailable" : "unavailable", titles };
    }
    if (created.replayed) return confirm(created, user?.id ?? null, request.attempt, deps);

    // the order is stored: a cart that could not be emptied is not reported as a failure
    try {
      await deps.removeFromCart(quote.lines.map((line) => ({ productId: line.productId, variantId: line.variantId })));
    } catch (error) {
      console.error("checkout: the ordered lines could not be removed from the cart", error);
    }
    return confirm(created, user?.id ?? null, request.attempt, deps);
  } catch (error) {
    console.error("checkout: placing the order failed", error);
    return { ok: false, reason: "unexpectedError" };
  }
}

/** The answer for an attempt that has its order; a lost cookie is not reported as a failure. */
async function confirm(
  order: { number: number; userId: string | null },
  userId: string | null,
  attempt: string,
  deps: PlaceOrderDeps,
): Promise<PlaceOrderResult> {
  // an attempt belongs to whoever placed it: never hand another visitor its confirmation
  if (order.userId !== userId) return { ok: false, reason: "unexpectedError" };
  try {
    await deps.rememberOrder({ number: order.number, token: attempt });
  } catch (error) {
    console.error("checkout: the confirmation cookie could not be set", error);
  }
  return { ok: true, number: order.number };
}

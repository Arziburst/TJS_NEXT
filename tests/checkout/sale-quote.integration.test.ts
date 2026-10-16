// The order request with a sale window (#67), on the local stack (its ring is translated into pt only, so the
// listings other suites count in en and de never see it): the cart is read from the database at the moment
// of the request, so a sale running then is charged and its regular price stored next to it; a sale that ended
// between the page and the submit answers pricesChanged before anything is stored, and the next submit (at the new
// price the page then shows) is charged the regular price. Skipped without a stack.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import type { CurrencyConfig, MoneyTables } from "@/lib/money/store";
import { localStack } from "../catalog/local-stack";

vi.mock("server-only", () => ({}));

const stack = localStack();

// test settings, not the shop's: USD at the rate 1 with a 3 % markup and cents charm rounding
const usd: CurrencyConfig = {
  decimals: 2,
  markupBps: 300,
  roundIncrement: 100,
  ending: 90,
  smallPriceBelow: null,
  smallRoundIncrement: null,
  smallEnding: null,
  enabled: true,
};
const tables: MoneyTables = { settings: { USD: usd }, displayRates: {} };

describe.skipIf(!stack)("the order request with a sale window on the local stack", async () => {
  if (!stack) return;
  const { getCartProducts } = await import("@/lib/cart/products");
  const { createOrderRequest } = await import("@/lib/orders/store");
  const { placeOrder } = await import("@/lib/checkout/place-order");
  const service = createClient<Database>(stack.url, stack.serviceRoleKey, { auth: { persistSession: false } });
  const productId = randomUUID();
  const attempts: string[] = [];

  afterAll(async () => {
    await service.from("orders").delete().in("idempotency_key", attempts);
    await service.from("products").delete().eq("id", productId);
  });

  async function setUp(saleSeconds: number) {
    const { data: category, error } = await service.from("categories").select("id").eq("slug", "rings").single();
    if (error) throw error;
    const product = await service
      .from("products")
      .insert({ id: productId, category_id: category.id, status: "published", fulfillment: "made_to_order", price_usd: 20 });
    if (product.error) throw product.error;
    const translation = await service
      .from("product_translations")
      .insert({ product_id: productId, locale: "pt", slug: `sale-window-${productId}`, title: "Sale window ring" });
    if (translation.error) throw translation.error;
    const sale = await service
      .from("product_sales")
      .insert({ product_id: productId, percent_off: 20, ends_at: new Date(Date.now() + saleSeconds * 1000).toISOString() });
    if (sale.error) throw sale.error;
  }

  // the visitor's cart: one ring, priced from the database now, as readCartView builds it
  async function readCart() {
    const read = await getCartProducts([productId], "pt");
    if (!read.ok) return { ok: false as const };
    const product = read.products.get(productId)!;
    return {
      ok: true as const,
      items: [
        {
          line: { productId, variantId: null, quantity: 1 },
          product,
          variant: null,
          unitUsdMinor: product.offer.usdMinor,
          regularUnitUsdMinor: product.offer.regularUsdMinor,
          status: "available" as const,
          quantity: 1,
        },
      ],
      pieces: 1,
      pendingMerge: false,
    };
  }

  function submit(unitUsdMinor: number) {
    const attempt = randomUUID();
    attempts.push(attempt);
    return placeOrder(
      {
        attempt,
        locale: "pt",
        contact: { firstName: "Sale", lastName: "", phone: "+380501234567", email: "sale@example.test" },
        delivery: { kind: "novaPostAddress", country: "DE", city: "Berlin", postCode: "10115", street: "Invalidenstr.", building: "1", flat: "" },
        comment: "",
        expected: [{ productId, quantity: 1, unitUsdMinor }],
      },
      {
        currentUser: async () => null,
        allow: async () => true,
        findOrder: async () => null,
        readCart,
        currency: async () => ({ current: "USD", tables }),
        delivery: {
          quoteNovaPoshta: async () => ({ ok: false, reason: "unavailable" }),
          estimateNovaPost: async () => ({ source: "flatRate", zone: "A", price: { state: "tbd" }, reason: "notConfigured" }),
        },
        createOrder: (order, items) => createOrderRequest(service, order, items),
        removeFromCart: async () => {},
        rememberOrder: async () => {},
      },
    );
  }

  async function lineOf(number: number) {
    const { data, error } = await service
      .from("order_items")
      .select("unit_price_usd_minor, unit_price_minor, regular_unit_price_usd_minor, regular_unit_price_minor, orders!inner(number)")
      .eq("orders.number", number)
      .single();
    if (error) throw error;
    return data;
  }

  it("charges the running sale, then re-prices the request once the sale has ended", async () => {
    await setUp(6);

    // the page shows the sale: $20.00 − 20 % = $16.00
    const shown = await readCart();
    expect(shown.ok && shown.items[0]?.unitUsdMinor).toBe(1600);
    const during = await submit(1600);
    expect(during).toMatchObject({ ok: true });
    if (!during.ok) return;
    // $16.00 × 1.03 = 16.48 → $16.90; $20.00 × 1.03 = 20.60 → $20.90
    expect(await lineOf(during.number)).toMatchObject({
      unit_price_usd_minor: 1600,
      unit_price_minor: 1690,
      regular_unit_price_usd_minor: 2000,
      regular_unit_price_minor: 2090,
    });

    // the sale ends while another visitor still has the sale price on their page
    await new Promise((resolve) => setTimeout(resolve, 6500));
    expect(await submit(1600)).toEqual({ ok: false, reason: "pricesChanged" });

    // the refreshed page shows the regular price; sending again charges it
    const refreshed = await readCart();
    expect(refreshed.ok && refreshed.items[0]?.unitUsdMinor).toBe(2000);
    const after = await submit(2000);
    expect(after).toMatchObject({ ok: true });
    if (!after.ok) return;
    expect(await lineOf(after.number)).toMatchObject({
      unit_price_usd_minor: 2000,
      unit_price_minor: 2090,
      regular_unit_price_usd_minor: 2000,
      regular_unit_price_minor: 2090,
    });
  }, 30_000);
});

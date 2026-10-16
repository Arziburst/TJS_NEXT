import { describe, expect, it, vi } from "vitest";
import type { CartItem, CartProduct } from "@/lib/cart";
import type { CurrencyConfig, MoneyTables } from "@/lib/money/store";
import type { CreateOrderResult, NewOrder, NewOrderItem } from "@/lib/orders/store";
import { CHECKOUT_RATE_LIMIT, placeOrder, type PlaceOrderDeps } from "./place-order";

const cents: CurrencyConfig = {
  decimals: 2,
  markupBps: 300,
  roundIncrement: 1000,
  ending: 900,
  smallPriceBelow: 10000,
  smallRoundIncrement: 100,
  smallEnding: 90,
  enabled: true,
};
const tables: MoneyTables = {
  settings: { EUR: cents, USD: cents, UAH: { ...cents, smallPriceBelow: null, smallRoundIncrement: null, smallEnding: null } },
  displayRates: { EUR: { rate: "0.86", rateDate: "2026-10-15" }, UAH: { rate: "41.5", rateDate: "2026-10-15" } },
};

const EARRINGS = "a0000000-0000-4000-8000-000000000001";
const CORAL = "a0000000-0000-4000-8000-000000000009";
const ATTEMPT = "7d1f3c2e-8a4b-4c6d-9e0f-1a2b3c4d5e6f";

function product(id: string, overrides: Partial<CartProduct> = {}): CartProduct {
  return {
    id,
    fulfillment: "made_to_order",
    availability: "available",
    leadTime: null,
    priceUsdMinor: 2490,
    weightGrams: 6,
    sku: null,
    slug: "earrings",
    title: "Earrings",
    locale: "en",
    image: null,
    variants: [],
    listPrice: { usdMinor: overrides.priceUsdMinor ?? 2490, from: false },
    ...overrides,
  };
}

function item(p: CartProduct, quantity = 1, status: CartItem["status"] = "available", variantId: string | null = null): CartItem {
  const variant = p.variants.find((v) => v.id === variantId) ?? null;
  return {
    line: { productId: p.id, variantId, quantity },
    product: p,
    variant,
    unitUsdMinor: variant?.priceUsdMinor ?? p.priceUsdMinor,
    status,
    quantity,
  };
}

const earrings = product(EARRINGS);
const coral = product(CORAL, { fulfillment: "one_of_a_kind", priceUsdMinor: 2990, weightGrams: 8, title: "Coral" });

const kyivBranch = {
  kind: "novaPoshtaWarehouse",
  city: {
    ref: "e718a680-4b33-11e4-ab6d-005056801329",
    cityRef: "8d5a980d-391c-11dd-90d9-001a92567626",
    label: "м. Київ, Київська обл.",
  },
  warehouse: {
    ref: "1ec09d88-e1c2-11e3-8c4a-0050568002cf",
    kind: "branch",
    number: 1,
    name: "Відділення №1: вул. Пирогівський шлях, 135",
  },
} as const;

function input(overrides: Record<string, unknown> = {}) {
  return {
    attempt: ATTEMPT,
    locale: "en",
    contact: { firstName: "Olena", lastName: "", phone: "+380 50 123 45 67", email: "olena@example.test" },
    delivery: kyivBranch,
    comment: "",
    expected: [
      { productId: EARRINGS, quantity: 2 },
      { productId: CORAL, quantity: 1 },
    ],
    ...overrides,
  };
}

function deps(overrides: Partial<PlaceOrderDeps> = {}) {
  const calls: string[] = [];
  const created: { order?: NewOrder; items?: NewOrderItem[] } = {};
  const base: PlaceOrderDeps = {
    currentUser: async () => null,
    allow: vi.fn(async () => true),
    findOrder: vi.fn(async () => null),
    readCart: vi.fn(async () => ({ ok: true as const, items: [item(earrings, 2), item(coral)], pieces: 3, pendingMerge: false })),
    currency: async () => ({ current: "EUR" as const, tables }),
    delivery: {
      quoteNovaPoshta: vi.fn(async () => ({ ok: true as const, costMinor: 8000 })),
      estimateNovaPost: vi.fn(async () => ({ source: "flatRate" as const, zone: "A" as const, price: { state: "tbd" as const }, reason: "notConfigured" as const })),
    },
    createOrder: vi.fn(async (order: NewOrder, items: NewOrderItem[]): Promise<CreateOrderResult> => {
      calls.push("createOrder");
      created.order = order;
      created.items = items;
      return { ok: true, replayed: false, orderId: "0d3c7d1e-6a3e-4a59-9b0e-1c8d5f2a7b10", number: 10001, userId: null };
    }),
    removeFromCart: vi.fn(async () => {
      calls.push("removeFromCart");
    }),
    rememberOrder: vi.fn(async () => {
      calls.push("rememberOrder");
    }),
    ...overrides,
  };
  return { deps: base, calls, created };
}

describe("placeOrder", () => {
  it("stores the request with the server's quote and clears the ordered lines only afterwards", async () => {
    const { deps: d, calls, created } = deps();
    expect(await placeOrder(input(), d)).toEqual({ ok: true, number: 10001 });
    expect(calls).toEqual(["createOrder", "removeFromCart", "rememberOrder"]);
    expect(d.removeFromCart).toHaveBeenCalledWith([
      { productId: EARRINGS, variantId: null },
      { productId: CORAL, variantId: null },
    ]);
    expect(d.rememberOrder).toHaveBeenCalledWith({ number: 10001, token: ATTEMPT });
    // €22.90 × 2 + €26.90 (24.90 / 29.90 × 0.86 × 1.03, charm-rounded up)
    expect(created.order).toMatchObject({
      idempotency_key: ATTEMPT,
      user_id: null,
      phone: "+380501234567",
      last_name: null,
      comment: null,
      country: "UA",
      delivery_carrier: "nova_poshta",
      delivery_method: "warehouse",
      currency: "EUR",
      fx_rate: "0.86",
      fx_rate_date: "2026-10-15",
      markup_bps: 300,
      items_total_usd_minor: 2490 * 2 + 2990,
      items_total_minor: 2290 * 2 + 2690,
      delivery_estimate_state: "amount",
      delivery_estimate_source: "carrier",
      delivery_estimate_minor: 8000,
      delivery_estimate_currency: "UAH",
      delivery_estimate_decimals: 2,
    });
    expect(created.items).toEqual([
      { product_id: EARRINGS, variant_id: null, position: 0, title: "Earrings", title_locale: "en", variant_label: null, variant_label_locale: null, quantity: 2, unit_price_usd_minor: 2490, unit_price_minor: 2290 },
      { product_id: CORAL, variant_id: null, position: 1, title: "Coral", title_locale: "en", variant_label: null, variant_label_locale: null, quantity: 1, unit_price_usd_minor: 2990, unit_price_minor: 2690 },
    ]);
  });

  describe("with sizes (#66)", () => {
    const SIZE_16 = "c6000000-0000-4000-8000-000000000016";
    const SIZE_18 = "c6000000-0000-4000-8000-000000000018";
    const ring = product(EARRINGS, {
      title: "Ring",
      variants: [
        { id: SIZE_16, label: "16", labelLocale: "uk", skuSuffix: "16", priceUsdMinor: 2490, available: true },
        { id: SIZE_18, label: "18", labelLocale: "uk", skuSuffix: "18", priceUsdMinor: 2990, available: true },
      ],
    });
    const twoSizes = () => ({ ok: true as const, items: [item(ring, 2, "available", SIZE_16), item(ring, 1, "available", SIZE_18)], pieces: 3, pendingMerge: false });
    const expected = [
      { productId: EARRINGS, variantId: SIZE_16, quantity: 2 },
      { productId: EARRINGS, variantId: SIZE_18, quantity: 1 },
    ];

    it("orders two sizes of one product as two lines, each at its size's price with its label", async () => {
      const { deps: d, created } = deps({ readCart: vi.fn(async () => twoSizes()) });
      expect(await placeOrder(input({ expected }), d)).toEqual({ ok: true, number: 10001 });
      expect(created.items).toEqual([
        { product_id: EARRINGS, variant_id: SIZE_16, position: 0, title: "Ring", title_locale: "en", variant_label: "16", variant_label_locale: "uk", quantity: 2, unit_price_usd_minor: 2490, unit_price_minor: 2290 },
        { product_id: EARRINGS, variant_id: SIZE_18, position: 1, title: "Ring", title_locale: "en", variant_label: "18", variant_label_locale: "uk", quantity: 1, unit_price_usd_minor: 2990, unit_price_minor: 2690 },
      ]);
      expect(created.order).toMatchObject({ items_total_usd_minor: 2490 * 2 + 2990, items_total_minor: 2290 * 2 + 2690 });
      expect(d.removeFromCart).toHaveBeenCalledWith([
        { productId: EARRINGS, variantId: SIZE_16 },
        { productId: EARRINGS, variantId: SIZE_18 },
      ]);
    });

    it("compares the lines by size: another size seen on the page is a changed cart", async () => {
      const { deps: d } = deps({ readCart: vi.fn(async () => twoSizes()) });
      const swapped = [
        { productId: EARRINGS, variantId: SIZE_16, quantity: 1 },
        { productId: EARRINGS, variantId: SIZE_18, quantity: 2 },
      ];
      expect(await placeOrder(input({ expected: swapped }), d)).toEqual({ ok: false, reason: "cartChanged" });
      expect(await placeOrder(input({ expected: expected.slice(0, 1) }), d)).toEqual({ ok: false, reason: "cartChanged" });
      expect(d.createOrder).not.toHaveBeenCalled();
    });

    it("names a size that is no longer available with its label", async () => {
      const { deps: d } = deps({
        readCart: vi.fn(async () => ({
          ...twoSizes(),
          items: [item(ring, 2, "available", SIZE_16), item(ring, 1, "unavailable", SIZE_18)],
        })),
      });
      expect(await placeOrder(input({ expected }), d)).toEqual({ ok: false, reason: "unavailable", titles: ["Ring (18)"] });
      expect(d.createOrder).not.toHaveBeenCalled();
    });
  });

  it("ignores prices, totals and goods sent with the form: every number is the server's", async () => {
    const { deps: d, created } = deps();
    const tampered = {
      ...input({
        expected: [
          { productId: EARRINGS, quantity: 2, priceUsdMinor: 1 },
          { productId: CORAL, quantity: 1, unitMinor: 1 },
        ],
      }),
      total: 1,
      currency: "USD",
      goods: { weightGrams: 0, totalUahMinor: 1 },
      parcel: { weightGrams: 1, declaredValueMinor: 1 },
    };
    expect(await placeOrder(tampered, d)).toEqual({ ok: true, number: 10001 });
    expect(created.order).toMatchObject({ currency: "EUR", items_total_minor: 2290 * 2 + 2690, items_total_usd_minor: 2490 * 2 + 2990 });
    expect(created.items?.map((line) => line.unit_price_minor)).toEqual([2290, 2690]);
    // the parcel of the estimate is the cart's: 100 g box + 2 × 6 g + 8 g; the UAH value of the displayed prices
    expect(d.delivery.quoteNovaPoshta).toHaveBeenCalledWith({
      cityRef: kyivBranch.city.cityRef,
      recipient: "warehouse",
      parcel: { weightGrams: 120, declaredValueMinor: expect.any(Number) },
    });
    const { parcel } = vi.mocked(d.delivery.quoteNovaPoshta).mock.calls[0]![0];
    expect(parcel.declaredValueMinor).toBeGreaterThan(100_000);
  });

  it("refuses a visitor over the limit before reading the cart or storing anything", async () => {
    const { deps: d } = deps({ allow: vi.fn(async () => false) });
    expect(await placeOrder(input(), d)).toEqual({ ok: false, reason: "rateLimited" });
    expect(d.allow).toHaveBeenCalledWith(null);
    expect(d.readCart).not.toHaveBeenCalled();
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(CHECKOUT_RATE_LIMIT).toEqual({ max: 5, windowSeconds: 600 });
  });

  it("counts a signed-in customer's attempts on the account and stores the order on it", async () => {
    const userId = "41111111-1111-4111-8111-111111111111";
    const { deps: d, created } = deps({ currentUser: async () => ({ id: userId }) });
    await placeOrder(input(), d);
    expect(d.allow).toHaveBeenCalledWith(userId);
    expect(created.order?.user_id).toBe(userId);
  });

  it("answers invalid fields without touching the limiter or the cart", async () => {
    const { deps: d } = deps();
    const result = await placeOrder(
      input({ contact: { firstName: " ", lastName: "", phone: "0501234567", email: "not-an-email" }, delivery: { kind: "novaPoshtaWarehouse" } }),
      d,
    );
    expect(result).toEqual({ ok: false, reason: "invalid", fields: expect.arrayContaining(["firstName", "phone", "email", "delivery"]) });
    expect(d.allow).not.toHaveBeenCalled();
    expect(d.readCart).not.toHaveBeenCalled();
  });

  it("refuses the UK and any country outside the markets (D2)", async () => {
    const { deps: d } = deps();
    const toLondon = { kind: "novaPostAddress", country: "GB", city: "London", postCode: "SW1A", street: "Downing St", building: "10" };
    expect(await placeOrder(input({ delivery: toLondon }), d)).toEqual({ ok: false, reason: "invalid", fields: ["delivery"] });
  });

  it("names a piece the database refused (reserved meanwhile); nothing is cleared or remembered", async () => {
    const { deps: d } = deps({ createOrder: vi.fn(async () => ({ ok: false as const, reason: "unavailable" as const, productIds: [CORAL] })) });
    expect(await placeOrder(input(), d)).toEqual({ ok: false, reason: "unavailable", titles: ["Coral"] });
    expect(d.removeFromCart).not.toHaveBeenCalled();
    expect(d.rememberOrder).not.toHaveBeenCalled();
  });

  it("names a piece the cart already shows as sold, without asking the database", async () => {
    const { deps: d } = deps({
      readCart: async () => ({ ok: true, items: [item(earrings, 2), item({ ...coral, availability: "sold" }, 1, "sold")], pieces: 3, pendingMerge: false }),
    });
    expect(await placeOrder(input(), d)).toEqual({ ok: false, reason: "unavailable", titles: ["Coral"] });
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("asks to check the order again when the cart changed in another tab", async () => {
    const { deps: d } = deps({
      readCart: async () => ({ ok: true, items: [item(earrings, 3), item(coral)], pieces: 4, pendingMerge: false }),
    });
    expect(await placeOrder(input(), d)).toEqual({ ok: false, reason: "cartChanged" });
    const { deps: added } = deps();
    expect(await placeOrder(input({ expected: [{ productId: EARRINGS, quantity: 2 }] }), added)).toEqual({ ok: false, reason: "cartChanged" });
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("does not price an order without a rate", async () => {
    const { deps: d } = deps({ currency: async () => ({ current: "EUR", tables: null }) });
    expect(await placeOrder(input(), d)).toEqual({ ok: false, reason: "pricesUnavailable" });
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("returns the same order for a repeated attempt", async () => {
    const replay = vi.fn(async () => ({ ok: true as const, replayed: true, orderId: "0d3c7d1e-6a3e-4a59-9b0e-1c8d5f2a7b10", number: 10001, userId: null }));
    const { deps: d } = deps({ createOrder: replay });
    expect(await placeOrder(input(), d)).toEqual({ ok: true, number: 10001 });
  });

  it("answers a resubmit after the first one emptied the cart with the same order, storing nothing", async () => {
    const { deps: d } = deps({
      findOrder: vi.fn(async () => ({ number: 10001, userId: null })),
      readCart: vi.fn(async () => ({ ok: true as const, items: [], pieces: 0, pendingMerge: false })),
    });
    expect(await placeOrder(input(), d)).toEqual({ ok: true, number: 10001 });
    expect(d.findOrder).toHaveBeenCalledWith(ATTEMPT);
    expect(d.readCart).not.toHaveBeenCalled();
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.rememberOrder).toHaveBeenCalledWith({ number: 10001, token: ATTEMPT });
  });

  it("never hands another visitor the confirmation of a replayed attempt", async () => {
    const replay = vi.fn(async () => ({
      ok: true as const,
      replayed: true,
      orderId: "0d3c7d1e-6a3e-4a59-9b0e-1c8d5f2a7b10",
      number: 10001,
      userId: "42222222-2222-4222-8222-222222222222",
    }));
    const { deps: d } = deps({ createOrder: replay });
    expect(await placeOrder(input(), d)).toEqual({ ok: false, reason: "unexpectedError" });
    expect(d.rememberOrder).not.toHaveBeenCalled();
  });

  it("still confirms a stored order when the cart could not be emptied", async () => {
    const { deps: d } = deps({ removeFromCart: vi.fn(async () => Promise.reject(new Error("cart down"))) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await placeOrder(input(), d)).toEqual({ ok: true, number: 10001 });
    expect(d.rememberOrder).toHaveBeenCalled();
  });

  it("estimates delivery abroad in the visitor's currency from the cart's goods", async () => {
    const estimate = vi.fn(async () => ({
      source: "carrier" as const,
      zone: "A" as const,
      price: { state: "amount" as const, money: { currency: "EUR" as const, amountMinor: 1290, decimals: 2 } },
      carrierPrice: { currency: "EUR", amountMinor: 1175 },
      scheduledDeliveryDate: null,
    }));
    const { deps: d, created } = deps({ delivery: { quoteNovaPoshta: vi.fn(), estimateNovaPost: estimate } });
    const locker = {
      kind: "novaPostDivision",
      country: "DE",
      settlement: { id: 1, name: "Berlin" },
      division: { id: 1834946, number: "1/7", name: "Paketautomat 7", category: "Postomat", address: "Alexanderplatz 1" },
    };
    expect(await placeOrder(input({ delivery: locker }), d)).toEqual({ ok: true, number: 10001 });
    const [request, parcel] = estimate.mock.calls[0] as unknown as [{ currency: string; destination: unknown }, { weightGrams: number }];
    expect(request).toEqual({ country: "DE", destination: { kind: "division", divisionId: 1834946 }, currency: "EUR" });
    // the goods' weight (2 × 6 g + 8 g) plus the 100 g estimate box (D37)
    expect(parcel.weightGrams).toBe(120);
    expect(created.order).toMatchObject({
      country: "DE",
      delivery_carrier: "nova_post",
      delivery_method: "division",
      delivery_estimate_state: "amount",
      delivery_estimate_minor: 1290,
      delivery_estimate_currency: "EUR",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_CART_LINES,
  MAX_MADE_TO_ORDER_QUANTITY,
  addLine,
  checkLineVariant,
  clampQuantity,
  countPieces,
  mergeLines,
  parseGuestCart,
  removeLine,
  serializeGuestCart,
  setLineQuantity,
  type CartLine,
} from "./lines";

const A = "a0000000-0000-4000-8000-000000000001";
const B = "a0000000-0000-4000-8000-000000000002";
const C = "a0000000-0000-4000-8000-000000000003";
const ref = (productId: string) => ({ productId, variantId: null });
const line = (productId: string, quantity: number): CartLine => ({ productId, variantId: null, quantity });

describe("addLine", () => {
  it("adds a new line with quantity 1", () => {
    expect(addLine([], ref(A), "made_to_order")).toEqual({ ok: true, lines: [line(A, 1)], quantity: 1 });
    expect(addLine([], ref(A), "one_of_a_kind")).toEqual({ ok: true, lines: [line(A, 1)], quantity: 1 });
  });

  it("raises the quantity of a made-to-order line already in the cart", () => {
    const result = addLine([line(B, 1), line(A, 2)], ref(A), "made_to_order");
    expect(result).toEqual({ ok: true, lines: [line(B, 1), line(A, 3)], quantity: 3 });
  });

  it("refuses a one-of-a-kind piece already in the cart", () => {
    expect(addLine([line(A, 1)], ref(A), "one_of_a_kind")).toEqual({ ok: false, reason: "alreadyInCart" });
  });

  it("refuses to go past the made-to-order maximum (D36: 10)", () => {
    expect(MAX_MADE_TO_ORDER_QUANTITY).toBe(10);
    expect(addLine([line(A, 9)], ref(A), "made_to_order")).toMatchObject({ ok: true, quantity: 10 });
    expect(addLine([line(A, 10)], ref(A), "made_to_order")).toEqual({ ok: false, reason: "maxQuantity" });
  });

  it("refuses a new line in a full cart, but still raises an existing one", () => {
    const full = Array.from({ length: MAX_CART_LINES }, (_, i) =>
      line(`b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, 1),
    );
    expect(addLine(full, ref(C), "made_to_order")).toEqual({ ok: false, reason: "cartFull" });
    expect(addLine(full, ref(full[0]!.productId), "made_to_order")).toMatchObject({ ok: true, quantity: 2 });
  });

  it("keeps lines of different variants apart", () => {
    const withVariant = { productId: A, variantId: B };
    const result = addLine([line(A, 1)], withVariant, "made_to_order");
    expect(result).toMatchObject({ ok: true, quantity: 1 });
    expect(result.ok && result.lines).toHaveLength(2);
  });
});

describe("lines keyed by product and size (#66)", () => {
  const size = (variantId: string, quantity: number): CartLine => ({ productId: A, variantId, quantity });

  it("keeps two sizes of one product as two lines, each up to the D36 limit", () => {
    const first = addLine([], { productId: A, variantId: B }, "made_to_order");
    const second = first.ok ? addLine(first.lines, { productId: A, variantId: C }, "made_to_order") : first;
    expect(second).toEqual({ ok: true, lines: [size(B, 1), size(C, 1)], quantity: 1 });
    expect(addLine([size(B, 10), size(C, 1)], { productId: A, variantId: C }, "made_to_order")).toMatchObject({ ok: true, quantity: 2 });
    expect(addLine([size(B, 10), size(C, 1)], { productId: A, variantId: B }, "made_to_order")).toEqual({ ok: false, reason: "maxQuantity" });
  });

  it("sets, removes and merges one size without touching the other", () => {
    expect(setLineQuantity([size(B, 1), size(C, 1)], { productId: A, variantId: C }, 4, "made_to_order")).toEqual({
      ok: true,
      lines: [size(B, 1), size(C, 4)],
    });
    expect(removeLine([size(B, 1), size(C, 1)], { productId: A, variantId: B })).toEqual([size(C, 1)]);
    expect(mergeLines([size(B, 2)], [size(C, 1), size(B, 3)])).toEqual([size(B, 3), size(C, 1)]);
  });

  it("round-trips the sizes through the guest cookie and drops a malformed variant id", () => {
    expect(parseGuestCart(serializeGuestCart([size(B, 2), size(C, 1)]))).toEqual([size(B, 2), size(C, 1)]);
    expect(parseGuestCart(JSON.stringify([{ p: A, v: "17", q: 1 }]))).toEqual([]);
  });
});

describe("checkLineVariant", () => {
  const variants = [
    { id: B, available: true },
    { id: C, available: false },
  ];

  it("takes a live variant that can be ordered, or none for a product without variants", () => {
    expect(checkLineVariant(variants, B)).toEqual({ ok: true, variant: variants[0] });
    expect(checkLineVariant([], null)).toEqual({ ok: true, variant: null });
  });

  it("requires a size of a product with variants and refuses one that is off, gone or foreign", () => {
    expect(checkLineVariant(variants, null)).toEqual({ ok: false, reason: "variantRequired" });
    expect(checkLineVariant(variants, C)).toEqual({ ok: false, reason: "unavailable" });
    expect(checkLineVariant(variants, A)).toEqual({ ok: false, reason: "unavailable" });
    expect(checkLineVariant([], B)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("setLineQuantity", () => {
  it("sets a made-to-order quantity within 1..10", () => {
    expect(setLineQuantity([line(A, 1)], ref(A), 10, "made_to_order")).toEqual({ ok: true, lines: [line(A, 10)] });
    expect(setLineQuantity([line(A, 1)], ref(A), 11, "made_to_order")).toEqual({ ok: false, reason: "invalidQuantity" });
    expect(setLineQuantity([line(A, 2)], ref(A), 0, "made_to_order")).toEqual({ ok: false, reason: "invalidQuantity" });
    expect(setLineQuantity([line(A, 2)], ref(A), 1.5, "made_to_order")).toEqual({ ok: false, reason: "invalidQuantity" });
  });

  it("keeps a one-of-a-kind piece at 1", () => {
    expect(setLineQuantity([line(A, 1)], ref(A), 2, "one_of_a_kind")).toEqual({ ok: false, reason: "invalidQuantity" });
    expect(setLineQuantity([line(A, 1)], ref(A), 1, "one_of_a_kind")).toEqual({ ok: true, lines: [line(A, 1)] });
  });

  it("refuses a line that is not in the cart", () => {
    expect(setLineQuantity([line(A, 1)], ref(B), 2, "made_to_order")).toEqual({ ok: false, reason: "notInCart" });
  });
});

describe("removeLine", () => {
  it("removes only the named line", () => {
    expect(removeLine([line(A, 1), line(B, 2)], ref(A))).toEqual([line(B, 2)]);
    expect(removeLine([line(B, 2)], ref(A))).toEqual([line(B, 2)]);
  });
});

describe("clampQuantity", () => {
  it("brings a stored quantity into the product's range", () => {
    expect(clampQuantity(3, "one_of_a_kind")).toBe(1);
    expect(clampQuantity(30, "made_to_order")).toBe(10);
    expect(clampQuantity(0, "made_to_order")).toBe(1);
    expect(clampQuantity(4, "made_to_order")).toBe(4);
    expect(clampQuantity(4, null)).toBe(4);
  });
});

describe("mergeLines", () => {
  it("keeps the account's lines and adds the guest's new ones", () => {
    expect(mergeLines([line(A, 2)], [line(B, 1)])).toEqual([line(A, 2), line(B, 1)]);
    expect(mergeLines([], [line(B, 1)])).toEqual([line(B, 1)]);
    expect(mergeLines([line(A, 1)], [])).toEqual([line(A, 1)]);
  });

  it("keeps the larger quantity of a line in both carts", () => {
    expect(mergeLines([line(A, 2)], [line(A, 5)])).toEqual([line(A, 5)]);
    expect(mergeLines([line(A, 5)], [line(A, 2)])).toEqual([line(A, 5)]);
  });

  it("is idempotent: merging the same guest cart twice changes nothing", () => {
    const guest = [line(A, 3), line(C, 1)];
    const once = mergeLines([line(A, 1), line(B, 2)], guest);
    expect(mergeLines(once, guest)).toEqual(once);
  });

  it("never grows past the line limit", () => {
    const many = Array.from({ length: MAX_CART_LINES }, (_, i) =>
      line(`b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, 1),
    );
    expect(mergeLines(many, [line(C, 1)])).toHaveLength(MAX_CART_LINES);
  });
});

describe("countPieces", () => {
  it("counts every piece, with no padding (the legacy header showed (01)…(08))", () => {
    expect(countPieces([])).toBe(0);
    expect(countPieces([line(A, 3), line(B, 1)])).toBe(4);
  });
});

describe("guest cookie", () => {
  it("round-trips the lines", () => {
    const lines = [line(A, 2), { productId: B, variantId: C, quantity: 1 }];
    expect(parseGuestCart(serializeGuestCart(lines))).toEqual(lines);
  });

  it("reads a missing or broken cookie as an empty cart", () => {
    expect(parseGuestCart(undefined)).toEqual([]);
    expect(parseGuestCart("")).toEqual([]);
    expect(parseGuestCart("not json")).toEqual([]);
    expect(parseGuestCart('{"p":"x"}')).toEqual([]);
  });

  it("drops malformed lines and merges duplicates", () => {
    const value = JSON.stringify([
      { p: A, q: 2 },
      { p: "not-a-uuid", q: 1 },
      { p: B, q: 0 },
      { p: B, q: 99 },
      { p: C, q: 1.5 },
      { p: A, q: 4 },
      { p: C, q: 1, price: 1 },
    ]);
    expect(parseGuestCart(value)).toEqual([line(A, 2), line(C, 1)]);
  });

  it("bounds the number of lines", () => {
    const value = JSON.stringify(
      Array.from({ length: MAX_CART_LINES + 5 }, (_, i) => ({ p: `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, q: 1 })),
    );
    expect(parseGuestCart(value)).toHaveLength(MAX_CART_LINES);
  });
});

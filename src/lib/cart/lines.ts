import { z } from "zod";
import type { ProductFulfillment } from "@/lib/catalog/types";

// Pure cart rules, shared by the guest cookie, the signed-in cart and the tests. No "server-only": nothing
// here reads data; the server modules around it decide what a product is.

/** D36: the most pieces of one made-to-order product in a cart line. A one-of-a-kind piece is always 1. */
export const MAX_MADE_TO_ORDER_QUANTITY = 10;

/** Technical bound: keeps the guest cookie well below the browser's 4 KB per cookie. */
export const MAX_CART_LINES = 50;

export type CartLine = {
  productId: string;
  /** Reserved for product variants (#66); always null until variants exist. */
  variantId: string | null;
  quantity: number;
};

export type LineRef = Pick<CartLine, "productId" | "variantId">;

export function sameLine(a: LineRef, b: LineRef): boolean {
  return a.productId === b.productId && a.variantId === b.variantId;
}

export function maxQuantity(fulfillment: ProductFulfillment): number {
  return fulfillment === "one_of_a_kind" ? 1 : MAX_MADE_TO_ORDER_QUANTITY;
}

/** A quantity brought into 1..the product's maximum (a stored value may predate a limit or be forged). */
export function clampQuantity(quantity: number, fulfillment: ProductFulfillment | null): number {
  const max = fulfillment ? maxQuantity(fulfillment) : MAX_MADE_TO_ORDER_QUANTITY;
  if (!Number.isSafeInteger(quantity) || quantity < 1) return 1;
  return Math.min(quantity, max);
}

export type AddLineResult =
  | { ok: true; lines: CartLine[]; quantity: number }
  | { ok: false; reason: "alreadyInCart" | "maxQuantity" | "cartFull" };

/**
 * Adds one piece: a new line with quantity 1, or one more of a made-to-order line already in the cart. A
 * one-of-a-kind piece already in the cart is refused, as is a made-to-order line at its maximum.
 */
export function addLine(lines: readonly CartLine[], ref: LineRef, fulfillment: ProductFulfillment): AddLineResult {
  const existing = lines.find((line) => sameLine(line, ref));
  if (!existing) {
    if (lines.length >= MAX_CART_LINES) return { ok: false, reason: "cartFull" };
    return { ok: true, lines: [...lines, { ...ref, quantity: 1 }], quantity: 1 };
  }
  if (fulfillment === "one_of_a_kind") return { ok: false, reason: "alreadyInCart" };
  if (existing.quantity >= maxQuantity(fulfillment)) return { ok: false, reason: "maxQuantity" };
  const quantity = existing.quantity + 1;
  return { ok: true, lines: lines.map((line) => (line === existing ? { ...line, quantity } : line)), quantity };
}

export type SetQuantityResult =
  | { ok: true; lines: CartLine[] }
  | { ok: false; reason: "notInCart" | "invalidQuantity" };

/** Sets a line's quantity: 1..10 for made-to-order work (D36), only 1 for a one-of-a-kind piece. */
export function setLineQuantity(
  lines: readonly CartLine[],
  ref: LineRef,
  quantity: number,
  fulfillment: ProductFulfillment,
): SetQuantityResult {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxQuantity(fulfillment)) {
    return { ok: false, reason: "invalidQuantity" };
  }
  if (!lines.some((line) => sameLine(line, ref))) return { ok: false, reason: "notInCart" };
  return { ok: true, lines: lines.map((line) => (sameLine(line, ref) ? { ...line, quantity } : line)) };
}

export function removeLine(lines: readonly CartLine[], ref: LineRef): CartLine[] {
  return lines.filter((line) => !sameLine(line, ref));
}

/**
 * The signed-in cart after sign-in: its own lines, then the guest's lines it lacks; a line in both keeps
 * the larger quantity. Idempotent (merging the same guest cart again changes nothing), so a merge that runs
 * twice (two tabs, a retry) never doubles a quantity. Lines past MAX_CART_LINES are dropped.
 */
export function mergeLines(account: readonly CartLine[], guest: readonly CartLine[]): CartLine[] {
  const merged = account.map((line) => ({ ...line }));
  for (const line of guest) {
    const existing = merged.find((m) => sameLine(m, line));
    if (existing) existing.quantity = Math.max(existing.quantity, line.quantity);
    else merged.push({ ...line });
  }
  return merged.slice(0, MAX_CART_LINES);
}

/** Total pieces in the cart: the header's count. */
export function countPieces(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

// The guest cookie: [{ p: productId, v?: variantId, q: quantity }], compact to stay small.
const cookieLine = z.object({
  p: z.uuid(),
  v: z.uuid().optional(),
  q: z.number().int().min(1).max(MAX_MADE_TO_ORDER_QUANTITY),
});

/**
 * The guest cart from its cookie value. The cookie is client data: anything malformed is dropped (a broken
 * cookie is an empty cart, never an error), duplicates are merged, and the line count is bounded.
 */
export function parseGuestCart(value: string | undefined): CartLine[] {
  if (!value) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const lines: CartLine[] = [];
  for (const item of raw.slice(0, MAX_CART_LINES)) {
    const parsed = cookieLine.safeParse(item);
    if (!parsed.success) continue;
    const line = { productId: parsed.data.p, variantId: parsed.data.v ?? null, quantity: parsed.data.q };
    if (!lines.some((l) => sameLine(l, line))) lines.push(line);
  }
  return lines;
}

export function serializeGuestCart(lines: readonly CartLine[]): string {
  return JSON.stringify(
    lines.slice(0, MAX_CART_LINES).map((line) => ({
      p: line.productId,
      ...(line.variantId ? { v: line.variantId } : {}),
      q: line.quantity,
    })),
  );
}

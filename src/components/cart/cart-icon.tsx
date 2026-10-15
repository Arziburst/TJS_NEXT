import { ShoppingBagIcon } from "lucide-react";

// The bag icon with the number of pieces on it; the count is plain (1, 9, 10 — never the legacy "(01)").
// Decorative: the link or button around it carries the count in its accessible name.
export function CartIcon({ count, formatted }: { count: number; formatted: string }) {
  return (
    <>
      <ShoppingBagIcon aria-hidden />
      {count > 0 && <CountBadge formatted={formatted} testId="cart-count" />}
    </>
  );
}

/** A header icon's count bubble (the cart, the favorites), in a `relative` box; decorative. */
export function CountBadge({ formatted, testId }: { formatted: string; testId: string }) {
  return (
    <span
      aria-hidden
      data-testid={testId}
      className="absolute top-0.5 right-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-sans text-[11px] leading-none font-semibold text-foreground tabular-nums"
    >
      {formatted}
    </span>
  );
}

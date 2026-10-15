import { Suspense } from "react";
import { addToCart } from "@/app/[locale]/product/[slug]/actions";
import { AddToCartButton } from "@/components/product/add-to-cart-button";
import { getCartLines } from "@/lib/cart";
import { maxQuantity } from "@/lib/cart/lines";
import type { ProductFulfillment } from "@/lib/catalog/types";

type AddToCartSlotProps = { productId: string; fulfillment: ProductFulfillment; className?: string };

/*
 * The product page's add-to-cart button with what the visitor's cart already holds. The product page itself is
 * prerendered; the cart is request-time data, so it streams in (until then the button shows an empty cart).
 */
export function AddToCartSlot(props: AddToCartSlotProps) {
  const button = (inCart: number) => (
    <AddToCartButton {...props} inCart={inCart} max={maxQuantity(props.fulfillment)} addToCart={addToCart} />
  );
  return (
    <Suspense fallback={button(0)}>
      <InCart productId={props.productId} render={button} />
    </Suspense>
  );
}

async function InCart({ productId, render }: { productId: string; render: (inCart: number) => React.ReactNode }) {
  const cart = await getCartLines();
  const line = cart.ok ? cart.lines.find((l) => l.productId === productId && l.variantId === null) : undefined;
  return render(line?.quantity ?? 0);
}

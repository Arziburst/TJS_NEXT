import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { productHref, SHOP_HREF } from "@/components/catalog/links";
import { CartSlot } from "@/components/layout/header-slots";
import { Price, PriceTotal } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { routes } from "@/config/routes";
import { Link } from "@/i18n/navigation";
import { unlessSessionUnavailable } from "@/lib/auth/session";
import { getCartView, lineKey, orderableLines, regularLines, type CartItem, type CartView } from "@/lib/cart";
import { cn } from "@/lib/utils";
import { CartIcon } from "./cart-icon";
import { CartItemImage } from "./cart-item-image";
import { MergeGuestCart } from "./merge-guest-cart";
import { MiniCartSheet } from "./mini-cart-sheet";
import { OrderRequestLink } from "./order-request-link";
import { VariantLabel } from "./variant-label";

const iconBox =
  "relative inline-flex size-11 items-center justify-center transition-opacity hover:opacity-70 focus-visible:opacity-70 [&_svg]:size-5";

/*
 * The header's cart: the bag with the number of pieces, a link to the cart page from 1024px up and a
 * mini-cart sheet below. The cart is request-time data, so it streams in; the placeholder is the plain bag
 * link in the same 44px box, so nothing shifts (#57).
 */
export function CartHeaderSlot() {
  return (
    <Suspense fallback={<CartSlot />}>
      <CartHeaderValue />
    </Suspense>
  );
}

async function CartHeaderValue() {
  const [view, t, format] = await Promise.all([
    // the plain bag link while the session cannot be read (#112): the header must not fail the page
    unlessSessionUnavailable(getCartView(), null),
    getTranslations("nav"),
    getFormatter(),
  ]);
  if (!view) return <CartSlot />;
  const count = view.ok ? view.pieces : 0;
  const label = t("cartCount", { count });
  const icon = <CartIcon count={count} formatted={format.number(count)} />;

  return (
    <>
      {view.ok && view.pendingMerge && <MergeGuestCart />}
      <Link href={routes.cart.path} aria-label={label} className={cn(iconBox, "hidden sb:inline-flex")}>
        {icon}
      </Link>
      <MiniCartSheet label={label} icon={icon} className="sb:hidden">
        <MiniCartContents view={view} />
      </MiniCartSheet>
    </>
  );
}

// 56px thumbnails
const THUMB_SIZES = "56px";

async function MiniCartContents({ view }: { view: CartView }) {
  const t = await getTranslations("cart");
  if (!view.ok) return <p role="alert">{t("loadError")}</p>;
  if (view.items.length === 0) {
    return (
      <div className="flex flex-col gap-5 py-6">
        <p>{t("empty")}</p>
        <Link href={SHOP_HREF} className={cn(buttonVariants())}>
          {t("continueShopping")}
        </Link>
      </div>
    );
  }
  const orderable = orderableLines(view.items);

  return (
    <div className="flex grow flex-col gap-5">
      <ul aria-label={t("lines")} className="flex flex-col divide-y divide-hairline border-y border-hairline">
        {view.items.map((item) => (
          <li key={lineKey(item.line)} className="py-3" data-testid="mini-cart-line">
            <MiniCartRow item={item} />
          </li>
        ))}
      </ul>
      <dl className="flex items-baseline justify-between gap-4 border-t-2 border-primary pt-4">
        <dt>{t("subtotal")}</dt>
        <dd className="font-sans text-lg text-accent-text">
          <PriceTotal lines={orderable} regularLines={regularLines(view.items)} />
        </dd>
      </dl>
      <div className="mt-auto flex flex-col gap-3">
        <Link href={routes.cart.path} className={cn(buttonVariants({ variant: "outline" }))}>
          {t("viewCart")}
        </Link>
        <OrderRequestLink id="mini-cart-order-request" disabled={orderable.length === 0} />
      </div>
    </div>
  );
}

async function MiniCartRow({ item }: { item: CartItem }) {
  const [t, locale] = await Promise.all([getTranslations("cart"), getLocale()]);
  const { product, status, quantity } = item;
  if (!product) {
    return (
      <div className="flex items-center gap-3">
        <CartItemImage image={null} alt="" sizes={THUMB_SIZES} className="size-14" />
        <span className="grow">{t("unavailablePiece")}</span>
        <Badge variant="outline">{t("status.unavailable")}</Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <CartItemImage image={product.image} alt="" sizes={THUMB_SIZES} className="size-14" />
      <div className="flex min-w-0 grow flex-col">
        <Link
          href={productHref(product.slug)}
          lang={product.locale !== locale ? product.locale : undefined}
          className="font-sans font-semibold break-words hover:text-accent-text"
        >
          {product.title}
        </Link>
        {item.variant && <VariantLabel label={item.variant.label} />}
        {status === "available" ? (
          <span className="text-sm">
            {t("each", { quantity })} <Price usdMinor={item.unitUsdMinor} regularUsdMinor={item.regularUnitUsdMinor} />
          </span>
        ) : (
          <Badge variant="outline">{t(`status.${status}`)}</Badge>
        )}
      </div>
    </div>
  );
}

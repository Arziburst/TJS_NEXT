import { getLocale, getTranslations } from "next-intl/server";
import { productHref, SHOP_HREF } from "@/components/catalog/links";
import { Price, PriceTotal } from "@/components/price";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCartView, lineKey, orderableLines, regularLines, type CartItem } from "@/lib/cart";
import { lineTitle, maxQuantity } from "@/lib/cart/lines";
import { cn } from "@/lib/utils";
import { CartItemImage } from "./cart-item-image";
import { VariantLabel } from "./variant-label";
import { CartLineControls } from "./cart-line-controls";
import { OrderRequestLink } from "./order-request-link";

// 96px boxes, 128px from `sb` (64rem)
const IMAGE_SIZES = "(min-width: 64rem) 128px, 96px";

/*
 * The cart page body: every line re-checked against the catalog on this render, the subtotal of the
 * orderable ones in the visitor's currency, and the next step. Request-time data: render inside <Suspense>.
 */
export async function CartContents() {
  const [view, t] = await Promise.all([getCartView(), getTranslations("cart")]);
  if (!view.ok) {
    return (
      <p role="alert" className="py-10">
        {t("loadError")}
      </p>
    );
  }
  if (view.items.length === 0) return <EmptyCart />;

  const orderable = orderableLines(view.items);
  const orderablePieces = orderable.reduce((sum, line) => sum + line.quantity, 0);
  const hasUnavailable = view.items.some((item) => item.status !== "available");

  return (
    <div className="grid gap-10 sb:grid-cols-[minmax(0,1fr)_22rem] sb:items-start sb:gap-14">
      <ul aria-label={t("lines")} className="flex flex-col divide-y divide-hairline border-y border-hairline">
        {view.items.map((item) => (
          <li key={lineKey(item.line)} data-testid="cart-line" data-status={item.status}>
            <CartRow item={item} />
          </li>
        ))}
      </ul>

      <section aria-labelledby="cart-summary-title" className="flex flex-col gap-5 sb:sticky sb:top-28">
        <h2 id="cart-summary-title" className="font-sans text-base font-semibold tracking-[0.2em] uppercase">
          {t("yourOrder")}
        </h2>
        <dl className="flex items-baseline justify-between gap-4 border-t-2 border-primary pt-4" data-testid="cart-subtotal">
          <dt>
            {t("subtotal")}
            <span className="block text-sm">{t("pieces", { count: orderablePieces })}</span>
          </dt>
          <dd className="font-sans text-xl text-accent-text">
            <PriceTotal lines={orderable} regularLines={regularLines(view.items)} />
          </dd>
        </dl>
        {hasUnavailable && (
          <p role="note" className="text-sm">
            {t("unavailableNote")}
          </p>
        )}
        <OrderRequestLink id="cart-order-request" disabled={orderable.length === 0} />
        <Link href={SHOP_HREF} className={cn(buttonVariants({ variant: "outline" }))}>
          {t("continueShopping")}
        </Link>
      </section>
    </div>
  );
}

async function CartRow({ item }: { item: CartItem }) {
  const [t, locale] = await Promise.all([getTranslations("cart"), getLocale()]);
  const { product, variant, status, quantity, unitUsdMinor, regularUnitUsdMinor } = item;

  if (!product) {
    return (
      <div className="flex gap-4 py-5 sb:gap-6">
        <CartItemImage image={null} alt="" sizes={IMAGE_SIZES} className="size-24 sb:size-32" />
        <div className="flex grow flex-col gap-3">
          <p className="font-sans font-semibold">{t("unavailablePiece")}</p>
          <Badge variant="outline">{t("status.unavailable")}</Badge>
          <CartLineControls
            productId={item.line.productId}
            variantId={item.line.variantId}
            title={t("unavailablePiece")}
            quantity={quantity}
            max={null}
          />
        </div>
      </div>
    );
  }

  const available = status === "available";
  const max = available ? maxQuantity(product.fulfillment) : null;
  // a fallback title keeps its own language for screen readers
  const lang = product.locale !== locale ? product.locale : undefined;

  return (
    <div className="flex gap-4 py-5 sb:gap-6">
      <Link
        href={productHref(product.slug)}
        tabIndex={-1}
        aria-hidden
        className="shrink-0"
      >
        <CartItemImage image={product.image} alt="" sizes={IMAGE_SIZES} className="size-24 sb:size-32" />
      </Link>
      <div className="flex min-w-0 grow flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={productHref(product.slug)}
              lang={lang}
              className="font-sans font-semibold break-words underline-offset-4 hover:text-accent-text hover:underline"
            >
              {product.title}
            </Link>
            {variant && <VariantLabel label={variant.label} />}
            <span className="text-sm">{t(product.fulfillment === "one_of_a_kind" ? "oneOfAKind" : "madeToOrder")}</span>
          </div>
          {available ? (
            <span className="flex flex-col items-end font-sans">
              <PriceTotal
                lines={[{ usdMinor: unitUsdMinor, quantity }]}
                regularLines={[{ usdMinor: regularUnitUsdMinor, quantity }]}
                className="text-lg text-accent-text"
              />
              {quantity > 1 && (
                <span className="text-sm">
                  {t("each", { quantity })} <Price usdMinor={unitUsdMinor} regularUsdMinor={regularUnitUsdMinor} />
                </span>
              )}
            </span>
          ) : (
            <Badge variant="outline">{t(`status.${status}`)}</Badge>
          )}
        </div>
        {available && max === 1 && <p className="text-sm">{t("singlePiece")}</p>}
        <CartLineControls
          productId={product.id}
          variantId={item.line.variantId}
          title={lineTitle(product.title, variant?.label)}
          quantity={quantity}
          max={max}
        />
      </div>
    </div>
  );
}

async function EmptyCart() {
  const t = await getTranslations("cart");
  return (
    <div className="flex flex-col items-start gap-5 py-10" data-testid="cart-empty">
      <p className="text-lg">{t("empty")}</p>
      <p>{t("emptyHint")}</p>
      <Link href={SHOP_HREF} className={cn(buttonVariants())}>
        {t("continueShopping")}
      </Link>
    </div>
  );
}
